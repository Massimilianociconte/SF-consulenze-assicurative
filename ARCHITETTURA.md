# Architettura della piattaforma

Sito pubblico + area riservata clienti + gestionale del consulente: tutto su
Cloudflare, tutto sulla stessa origine, tutto entro i limiti del piano gratuito.

```
Browser
  │  (la password non lascia il browser: viene derivata con PBKDF2 250k)
  ├─ /                        sito pubblico (React SPA)
  ├─ /accedi, /registrati…    autenticazione
  ├─ /area-riservata/…        portale cliente
  ├─ /gestionale/…            pannello consulente
  └─ /api/…                   API
                    │
        Cloudflare Worker (worker/src)
          ├─ ASSETS  → sito statico (dist/)
          ├─ DB      → D1: anagrafiche, polizze, sinistri, documenti (metadati),
          │             sessioni, rate limit, registro operazioni
          ├─ DOCS    → R2: contenuto dei documenti
          └─ email   → API del fornitore (Brevo/Resend) o binding EMAIL su piano Paid
```

Una sola origine significa cookie di sessione `HttpOnly` + `SameSite=Lax` senza
CORS e senza `SameSite=None`: è la configurazione più difendibile e l'unica che
non si rompe con le protezioni anti-tracciamento di Safari e iOS.

**Nessun Workers KV.** Il piano gratuito concede 1.000 scritture al giorno: un
solo tentativo di forzatura le esaurirebbe, e da quel momento fallirebbero anche
le scritture legittime. D1 non ha quel tetto ed è fortemente consistente, quindi
"esci da tutti i dispositivi" ha effetto immediato invece di propagarsi in
qualche decina di secondi.

---

## Struttura del repository

| Percorso | Contenuto |
| --- | --- |
| `src/` | Sito pubblico (invariato) + `auth/`, `portal/`, `gestionale/`, `lib/` |
| `src/lib/password.ts` | Derivazione PBKDF2 lato browser |
| `src/lib/uploads.ts` | Pulizia lossless dei file e caricamento con avanzamento |
| `src/lib/extraction.ts` | Lettura automatica dei campi dai PDF (pdf.js + regex) |
| `worker/src/` | API: `routes/`, `middleware/`, `lib/` |
| `migrations/` | Schema D1 versionato |
| `scripts/smoke-test.mjs` | Suite end-to-end API (143 verifiche) |
| `scripts/test-codes.mjs` | Prove su validatori, estrazione e generazione CF (77 verifiche) |
| `src/lib/italianCodes.ts` | Validazione e correzione di CF, P.IVA, IBAN, targhe |
| `src/lib/ocr.ts` | Riconoscimento ottico locale (Tesseract WASM auto-ospitato) |
| `scripts/build-headers.mjs` | Genera `dist/_headers` (CSP con hash degli script inline) |
| `scripts/build-anncsu-reference.mjs` | Import revisionato ANNCSU + riferimento CAP IPA |
| `wrangler.jsonc` | Binding, variabili, cron, ambiente staging |
| `DEPLOY.md` | Deploy, cutover DNS, limiti del piano gratuito |
| `DATI-UFFICIALI.md` | Fonti, licenze, versioni, limiti e procedura di aggiornamento |

---

## Fase 1 — completata e verificata

**Autenticazione**

- Registrazione con email e password. La password non viene mai inviata: il
  browser calcola `PBKDF2(password, salt = SHA256("sfca-auth-v1:" + email), 250.000)`
  e il server memorizza un secondo PBKDF2 (15.000 iterazioni, salt casuale) di
  quel valore. Per chi attaccasse un database rubato il costo per tentativo è la
  somma dei due passaggi; per il Worker sono ~3 ms di CPU, dentro i 10 ms del
  piano gratuito.
- Accesso con Google (OAuth 2.0 + PKCE, scambio del codice lato server,
  validazione `iss`/`aud`/`exp`, collegamento automatico a un account esistente
  con la stessa email verificata). Lo stato del flusso sta in un cookie
  HttpOnly, non in un archivio.
- Verifica indirizzo email: token monouso a 24 ore; la conferma vale come prova
  di possesso e apre direttamente la sessione.
- Recupero password: token monouso a 60 minuti, revoca di tutte le sessioni,
  email di notifica del cambio.
- Sessioni su D1: scadenza per inattività a 7 giorni, limite assoluto a 30
  giorni, prolungamento solo quando la scadenza si avvicina (una sola query per
  richiesta autenticata, che restituisce insieme sessione e utente), elenco
  dispositivi collegati, revoca singola e revoca di tutte le altre.
- Difese: rate limit per IP e per account su D1 (consuma quota solo sui
  tentativi falliti), blocco temporaneo dopo 8 errori, risposte indistinguibili
  per non rivelare quali email siano registrate, verifica dell'origine su ogni
  richiesta che modifica dati, Turnstile opzionale, `audit_log` di ogni
  operazione sensibile.

**Area riservata**

Panoramica con contatori e prossime scadenze, Scadenze, Polizze e contratti,
Preventivi, Trattative, Pratiche di sinistro, Comunicazioni (già scrivibili),
Documenti, Stato richieste, Profilo e sicurezza (recapiti, consensi, cambio
password, dispositivi, esportazione dati, richiesta di cancellazione).

**Confine fra area riservata e gestionale**

Cliente e consulente lavorano sulle stesse righe di D1: non esiste alcuna
sincronizzazione da mantenere. Il confine è applicato in due punti soltanto
(`resolveScope` in `worker/src/routes/portal.ts` e `assertClientAccess` in
`worker/src/routes/admin.ts`):

- un cliente vede solo le proprie righe;
- un `advisor` può aprire la posizione di un cliente solo se quel cliente è
  collegato a lui (`users.advisor_id`): conoscere l'identificativo non basta;
- ogni accesso incrociato, riuscito o negato, finisce in `audit_log`;
- i messaggi vengono firmati con il ruolo reale di chi scrive, così il cliente
  vede "Consulente" e non un messaggio attribuito a sé stesso.

**Affidabilità delle scritture**

Le operazioni composte da più scritture usano `db.batch()`, che D1 esegue come
transazione: registrazione (utente + token + tre consensi), reset password
(nuovo hash + revoca sessioni + azzeramento contatori), apertura conversazione
(thread + primo messaggio), aggiornamento consensi (stato + storico). Non
esistono stati a metà. I token monouso vengono consumati con una `UPDATE`
condizionata, quindi due richieste contemporanee non possono usare lo stesso
link due volte. Una registrazione in corsa sulla stessa email viene intercettata
come conflitto e non come errore interno.

Un Cron Trigger notturno rimuove sessioni scadute, token consumati e contatori
di rate limit; il registro operazioni resta 24 mesi.

---

## Fase 2 — documenti su R2 (completata)

- Caricamento in streaming verso R2: il Worker non bufferizza il file e non ne
  calcola l'impronta, quindi il consumo di CPU resta trascurabile anche con file
  da 10 MB. `FixedLengthStream` impone che i byte ricevuti siano esattamente
  quelli dichiarati.
- Controlli: formato verificato sui byte iniziali (non basta l'estensione o il
  tipo dichiarato), 10 MB per file, 150 MB per cliente, quota mostrata al cliente.
- Ottimizzazione lossless nel browser: dai JPEG vengono rimossi i segmenti di
  metadati — operazione che non tocca un solo pixel e che elimina le coordinate
  GPS delle foto scattate col telefono — e dai PNG i chunk non necessari alla
  resa. PDF e HEIC restano intatti. Una compressione gzip lato server sarebbe
  stata inutile: tutti i formati accettati sono già compressi.
- Download: mai un URL diretto a R2. O si passa da un endpoint che verifica la
  sessione, o da un link firmato valido cinque minuti. In entrambi i casi il file
  viene servito con `nosniff`, senza cache condivise e con CSP `sandbox`, così
  nemmeno un PDF ostile potrebbe eseguire nulla.
- Eliminazione: il contenuto sparisce da R2 (spazio liberato), i metadati
  restano per tracciabilità. Il cliente può correggere un caricamento sbagliato
  entro 24 ore; dopo decide il consulente. Blocco legale sempre ostativo,
  conservazione minima superabile solo con dichiarazione esplicita registrata
  nel log.

## Fase 3 — modulo guidato di apertura sinistro (completata)

Sei passaggi con salvataggio continuo della bozza: tipo di sinistro e polizza,
quando e dove, dinamica, soggetti e veicoli, documenti, riepilogo e invio.

Cosa lo rende semi-automatico:
- **precompilazione dall'archivio**: anagrafica dell'assicurato, polizze attive
  con targa e compagnia, soggetti già inseriti in pratiche precedenti;
- **selezione della polizza** che riempie da sola compagnia e veicolo;
- **lettura dei PDF allegati** (vedi fase 5) con proposta dei campi trovati;
- **controlli in due punti**: nel browser per guidare, sul server perché la
  pratica che arriva al consulente sia completa comunque venga inviata.

All'invio la pratica riceve un protocollo progressivo `SIN-AAAA-NNNN` generato
con un contatore atomico, passa a `submitted`, genera l'evento visibile al
cliente e notifica il consulente. L'invio è idempotente: un doppio clic non crea
due pratiche.

## Fase 4 — gestionale del consulente (completata nelle funzioni principali)

Area `/gestionale`, riservata ai ruoli `advisor` e `admin`, con interfaccia
volutamente diversa (barra scura) per non confondersi con l'area cliente:

- **cruscotto** con le code di lavoro del giorno: sinistri da lavorare, scadenze
  superate o in arrivo, messaggi non letti, richieste aperte;
- **clienti**: ricerca per nome, email, codice fiscale o telefono; scheda con
  anagrafica, polizze, scadenze, sinistri, documenti, conversazioni e note
  interne mai visibili al cliente;
- **sinistri**: coda filtrabile e schermata di lavorazione con dichiarazione del
  cliente, allegati scaricabili, cambio di stato, numero sinistro della
  compagnia, aggiornamento *visibile al cliente* separato dalla nota interna;
- **richieste**: avanzamento con un clic, ogni cambio finisce nella cronologia
  che il cliente vede;
- **archivio documenti**: spazio occupato per tipologia e per cliente, con la
  soglia dei 10 GB del piano gratuito, blocco legale ed eliminazione controllata.

Ogni accesso a dati di un cliente e ogni operazione sono registrati in
`audit_log` con l'indicazione di chi, cosa e quando.

Inserimento e modifica di polizze, scadenze, preventivi e trattative avvengono
da moduli dedicati: quando il consulente salva una polizza, il cliente la vede
immediatamente nella sua area, e la scadenza di rinnovo può essere generata
insieme alla polizza con una sola spunta.

## Fase 5 — lettura automatica dei documenti (completata)

Tutto nel browser dell'utente: nessun modello di intelligenza artificiale,
nessun servizio esterno, nessun costo per richiesta. Tre stadi.

**1. Testo.** Dai PDF nativi si legge il livello di testo con pdf.js. Da foto e
scansioni con Tesseract compilato in WebAssembly. Motore e dizionario italiano
(~5 MB complessivi) sono serviti dal nostro dominio, non da un CDN: così nessun
terzo sa nemmeno *quando* qualcuno sta leggendo un documento. Vengono scaricati
solo da chi usa davvero la funzione, e solo dopo che l'ha chiesto esplicitamente.

Prima del riconoscimento l'immagine passa da una preparazione che conta più del
motore stesso: ridimensionamento, scala di grigi e **soglia adattiva locale**
(Bradley-Roth su immagine integrale). È ciò che permette di leggere la foto di
un documento con un lato in ombra, dove una soglia unica perderebbe metà del
testo.

**2. Individuazione.** Espressioni regolari tarate sui moduli italiani, con
priorità ai valori preceduti da un'etichetta ("codice fiscale:", "polizza n.",
"targa").

**3. Validazione e correzione — la parte che di solito si chiede a un modello.**
Quasi tutti i codici che servono hanno un controllo matematico incorporato:

| Dato | Controllo |
| --- | --- |
| Codice fiscale | carattere di controllo (algoritmo MEF), omocodia inclusa |
| Partita IVA | cifra di controllo |
| IBAN | resto della divisione per 97 (ISO 13616) |
| Targa | forma rigida, lettere ambigue (I, O, Q, U) escluse |
| Date | esistenza reale del giorno, intervallo plausibile |

Questo produce due effetti concreti:

- **niente falsi positivi**: una sequenza di sedici caratteri che non supera il
  controllo non viene proposta come codice fiscale. È la differenza fra un
  riconoscimento utile e uno che fa perdere tempo;
- **correzione degli errori di lettura**: l'OCR confonde O con 0, I con 1, S con
  5. Sapendo che in una certa posizione ci vuole una lettera e in un'altra una
  cifra, la sostituzione è quasi sempre obbligata; nei casi ambigui si prova un
  numero limitato di combinazioni e si tiene quella che fa tornare il controllo.
  `R55MRA85M01H501Q` diventa `RSSMRA85M01H501Q`, e l'interfaccia mostra
  entrambe le versioni.

In più i valori vengono confrontati con quelli già in archivio per quel cliente
(numeri di polizza, targhe): una lettura a distanza minima da un dato esistente
viene agganciata a quello. E dal codice fiscale si ricavano data di nascita e
sesso, che nessuno deve più digitare.

Ogni campo proposto porta con sé il livello di affidabilità e **la spiegazione
in italiano del perché**: "carattere di controllo valido", "corretto in un
carattere", "corrisponde a una polizza già in archivio". Nulla entra nel modulo
senza che l'utente prema "usa questo dato".

Quando il codice fiscale non è disponibile in un documento, il profilo e il
modulo sinistri aprono un calcolatore locale da nome, cognome, data, sesso e
luogo di nascita. La tabella Belfiore comprende comuni storici e Stati esteri,
viene caricata solo all'apertura e la ricerca esclude le denominazioni non
valide alla data indicata. Sorgente, commit e SHA-256 sono fissati in
`scripts/build-belfiore.mjs`: una sorgente remota diversa da quella revisionata
interrompe la build.

Il valore è sempre presentato come **codice base proposto**. L'omocodia è
attribuita dall'Anagrafe tributaria e non è prevedibile dai soli dati
anagrafici; per questo l'utente deve confermare il risultato e il consulente può
verificarne la corrispondenza quando il dato entra in un contratto.

Verificato da `npm run test:codes`: 77 prove su validatori, generazione,
periodi storici dei luoghi, correzioni, agganci ed estrazione da testi
realistici, compresi i casi in cui il sistema *non deve* proporre nulla.

## Fase 6 — dati ufficiali e variazioni assistite

L’indirizzo del profilo è un combobox accessibile: dopo 3 caratteri e 300 ms
interroga il Worker, mostra al massimo 8 risultati, supporta frecce/Invio/Esc,
touch e compilazione manuale. Nel browser non arriva alcun archivio completo.

- strade e accessi provengono da ANNCSU (Agenzia delle Entrate + Istat);
- il CAP comunale di riferimento proviene da IPA (AgID), perché ANNCSU non lo
  contiene;
- le due provenienze restano distinte e visibili, entrambe CC BY 4.0;
- la copertura iniziale è deliberatamente limitata a Rho: 450 strade e 7.161
  accessi, indicizzati con FTS5 in D1;
- la ricerca è autenticata, rate-limited e non scrive nell’audit log ciò che
  l’utente digita.

Ogni modifica del profilo apre prima un riepilogo “prima/dopo”. Solo la conferma
esplicita salva i dati e crea `profile_change_requests`, con origine, fonte,
timestamp e stato. Il cliente vede `received`, `in_review`, `verified`,
`rejected` o `failed`; il gestionale dispone di una coda dedicata e di una
cronologia nella scheda cliente. Il salvataggio interno non viene mai descritto
come verifica del consulente né come aggiornamento di sistemi esterni.

Fonte, licenza, versione, data, frequenza, copertura, limitazioni e impronta
sono registrate in `reference_datasets`. Dettagli e procedura mensile:
`DATI-UFFICIALI.md`.

## Scelte tecniche da tenere presenti

- **Nessun file nel database.** In D1 stanno solo i metadati; il contenuto è su
  R2, indirizzato da `storage_key`. Serve a contenere i costi e a rendere
  possibile la cancellazione selettiva richiesta dal consulente.
- **La robustezza della password è controllata dal browser**, perché il server
  riceve solo il valore derivato. Un client modificato potrebbe impostarsi una
  password debole, ma solo sul proprio account: rate limit, blocco progressivo e
  verifica dell'origine restano lato server.
- **Cambiare i parametri della derivazione richiede una transizione.** Sono
  versionati (`v1`) e pubblicati da `/api/config`: il browser deve usare gli
  stessi con cui l'hash è stato creato. Un cambio richiede doppia derivazione
  temporanea o reimpostazione password.
- **Importi in centesimi** (`INTEGER`) per evitare errori di arrotondamento.
- **Timestamp ISO-8601 UTC** in tutto lo schema.
- **Codice fiscale e partita IVA non modificabili online** una volta valorizzati:
  identificano il cliente nei contratti già emessi, quindi la variazione passa
  da una richiesta tracciata al consulente.
- **Il cookie di sessione è `Secure` solo su https**, per non impedire le prove
  in locale su `http://localhost` (in produzione è sempre https).
- **CSP senza `unsafe-inline` per gli script**: gli hash del blocco JSON-LD sono
  ricalcolati a ogni build da `scripts/build-headers.mjs`.
- **Un solo punto per l'autorizzazione dei dati**: `resolveScope`. Aggiungendo
  endpoint, usare quello e mai `?userId` grezzo.
