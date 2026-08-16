# Deploy e migrazione su Cloudflare (piano gratuito)

Guida operativa per portare sito e area riservata su Cloudflare Workers senza
interruzioni del servizio oggi erogato da GitHub Pages.

L'intera piattaforma è progettata per stare nei limiti del **piano gratuito**.
I vincoli che hanno determinato le scelte tecniche sono in fondo (§12).

---

## 1. Prerequisiti

- Account Cloudflare, **piano gratuito** (nessuna carta necessaria per Workers,
  D1 e Turnstile; per R2 vedi §6).
- Node.js 22 e npm.
- Dominio `sfconsulenzeassicurative.it`: i nameserver andranno spostati su
  Cloudflare solo al momento del cutover (§8), non prima.

```bash
npm install
npx wrangler login
```

---

## 2. Creazione delle risorse

```bash
npx wrangler d1 create sf-portal
```

Copiare il `database_id` restituito in `wrangler.jsonc` al posto di
`SOSTITUIRE_CON_ID_D1`.

Non serve alcun namespace KV: sessioni, contatori di rate limit e stato OAuth
stanno su D1 o in cookie (§12).

Ambiente di prova, consigliato:

```bash
npx wrangler d1 create sf-portal-staging
```

---

## 3. Schema del database

```bash
npx wrangler d1 migrations apply sf-portal --remote     # produzione
npm run db:migrate:local                                # locale
```

Le migrazioni stanno in `migrations/`, numerate e applicate in ordine. Per
aggiungerne una: `migrations/0004_nome.sql`, poi rilanciare il comando.

Le migrazioni `0005`–`0007` aggiungono registro delle variazioni, indice FTS5
degli indirizzi ANNCSU di Rho e riferimento CAP IPA. Prima di applicarle su un
database esistente eseguire un export e provare lo stesso insieme in staging.

### Aggiornamento dei dati assistiti

La build ordinaria non scarica i grandi archivi regionali. L’aggiornamento è
un’operazione mensile separata e revisionata:

```bash
npm run anncsu:build
npm run anncsu:import:local
npm test
```

Il primo comando scarica le fonti ufficiali, verifica Comune/codici/versioni e
genera `.data/anncsu-H264.sql`; il secondo modifica solo D1 locale. Dopo la
revisione, il SQL va trasformato in una nuova migrazione numerata, provato in
staging e applicato in produzione solo dopo un backup. Fonte, licenza,
impronte e limiti sono descritti in `DATI-UFFICIALI.md`.

---

## 4. Email transazionali

Servono per verifica indirizzo e recupero password: senza, l'area riservata non
è utilizzabile.

**Cloudflare Email Sending richiede il piano Workers Paid**, quindi sul piano
gratuito si usa un fornitore esterno via API HTTP. Il trasporto si sceglie con
la variabile `MAIL_PROVIDER` in `wrangler.jsonc`, senza modifiche al codice:

| Valore | Fornitore | Gratuito | Dove stanno i dati |
| --- | --- | --- | --- |
| `brevo` | Brevo (ex Sendinblue) | 300 email/giorno | Unione Europea (Francia) |
| `resend` | Resend | 3.000 email/mese, 100/giorno | Stati Uniti |
| `cloudflare` | Email Sending | richiede piano Paid | rete Cloudflare |
| `log` | nessuno: scrive nei log | — | — (solo sviluppo) |

Configurazione consigliata (Brevo, dati in UE):

1. Creare l'account su brevo.com e generare una API key (v3).
2. Caricarla come segreto:

   ```bash
   npx wrangler secret put MAIL_API_KEY
   ```

3. In Brevo, autenticare il dominio mittente (record SPF/DKIM da aggiungere al
   DNS): senza questo passaggio le email finiscono in spam.
4. Verificare che `MAIL_PROVIDER` sia `"brevo"` e `MAIL_FROM` un indirizzo del
   dominio autenticato.

> **Adempimento privacy.** Il fornitore email tratta indirizzi e contenuti per
> conto del titolare: va nominato responsabile del trattamento (art. 28 GDPR,
> Brevo e Resend forniscono il modello) e indicato nell'informativa. Resend
> comporta anche un trasferimento extra UE, da coprire con le clausole
> contrattuali standard: se questo è un problema, usare Brevo.

Passando in futuro al piano Paid: decommentare il blocco `send_email` in
`wrangler.jsonc`, eseguire
`npx wrangler email sending enable sfconsulenzeassicurative.it` e impostare
`MAIL_PROVIDER: "cloudflare"`.

---

## 5. Accesso con Google

1. Console Google Cloud → **API e servizi** → **Credenziali** → *Crea
   credenziali* → **ID client OAuth** → *Applicazione web*.
2. Origini JavaScript autorizzate:
   - `https://www.sfconsulenzeassicurative.it`
   - `http://localhost:8787`
3. URI di reindirizzamento autorizzati:
   - `https://www.sfconsulenzeassicurative.it/api/auth/google/callback`
   - `http://localhost:8787/api/auth/google/callback`
4. Client ID in `wrangler.jsonc` (`vars.GOOGLE_CLIENT_ID`, non è un segreto),
   client secret come segreto:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Finché le due variabili non sono valorizzate il pulsante "Continua con Google"
resta nascosto: lo decide `/api/config`, senza ricompilare il sito.

---

## 6. Documenti su R2 (fase 2)

R2 ha un piano gratuito di **10 GB di archiviazione, 1 milione di operazioni di
scrittura e 10 milioni di letture al mese, senza costi di traffico in uscita**.
L'attivazione passa da un flusso di sottoscrizione nella dashboard
(*Storage & Databases → R2*): se in quel passaggio venisse richiesto un metodo
di pagamento e non lo si vuole registrare, il caricamento documenti va
rimandato e nel frattempo i file continuano ad arrivare al consulente per email.
Il resto della piattaforma funziona senza R2.

```bash
npx wrangler r2 bucket create sf-documenti
```

Serve inoltre la chiave con cui vengono firmati i link temporanei di download
(validi 5 minuti, senza la quale i documenti restano scaricabili solo con la
sessione attiva):

```bash
openssl rand -base64 48 | npx wrangler secret put DOWNLOAD_SIGNING_KEY
```

Limiti applicati: 10 MB per file, 150 MB per cliente, formati PDF/JPEG/PNG/WebP/HEIC
verificati sui byte iniziali e non solo sul tipo dichiarato dal browser.

### Motore di riconoscimento ottico

Il motore OCR e il dizionario italiano vengono serviti dal nostro dominio (non
da un CDN) e non stanno nel repository: li prepara `scripts/fetch-ocr-assets.mjs`,
eseguito automaticamente da `npm run build`. Servono circa 9 MB di spazio nel
deploy e richiedono una connessione la prima volta che si costruisce il
progetto. Per rigenerarli a mano:

```bash
npm run ocr:assets
```

---

## 7. Protezione antibot (Turnstile)

Gratuito su tutti i piani, consigliato su login e registrazione.

1. Dashboard Cloudflare → **Turnstile** → *Add widget*.
2. Site key → `vars.TURNSTILE_SITE_KEY`.
3. Secret key:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Se il segreto non è impostato la verifica viene saltata (comodo in locale).

---

## 8. Cutover da GitHub Pages senza downtime

Il sito resta online per tutta la procedura; il passaggio avviene all'ultimo
passo ed è reversibile.

1. **Staging** e verifica completa:

   ```bash
   npm run deploy:staging
   ```

2. **Produzione** sul solo URL `workers.dev` (il dominio punta ancora a Pages):

   ```bash
   npm run deploy
   ```

3. **Dominio su Cloudflare**: aggiungere il sito in dashboard e cambiare i
   nameserver presso il registrar. I record esistenti verso GitHub Pages vengono
   importati, quindi il sito continua a rispondere durante la propagazione.

4. **Aggancio al Worker**: Worker `sf-consulenze-assicurative` → *Settings* →
   *Domains & Routes* → **Add custom domain** →
   `www.sfconsulenzeassicurative.it` (più `sfconsulenzeassicurative.it` con
   redirect al `www`).

5. **Verifica**:

   ```bash
   curl -sI https://www.sfconsulenzeassicurative.it | head -3
   curl -s  https://www.sfconsulenzeassicurative.it/api/health
   ```

6. **Rollback**: rimuovere il custom domain dal Worker e ripristinare i record
   verso GitHub Pages. D1 e R2 restano intatti.

Dopo il cutover: disattivare `.github/workflows/deploy.yml` (GitHub Pages) e
abilitare il trigger su push in `.github/workflows/deploy-cloudflare.yml`,
aggiungendo i secret di repository `CLOUDFLARE_API_TOKEN` e
`CLOUDFLARE_ACCOUNT_ID`.

---

## 9. Account del consulente

Il gestionale è il pannello con ruolo `advisor` della stessa piattaforma. Il
consulente si registra normalmente dal sito, conferma l'email, poi:

```bash
npx wrangler d1 execute sf-portal --remote \
  --command "UPDATE users SET role = 'advisor' WHERE email_normalized = 'sfconsulenze@outlook.com';"
```

I clienti vanno assegnati al consulente: un `advisor` può accedere **solo** ai
clienti collegati a lui, e ogni accesso viene registrato in `audit_log`.

```bash
npx wrangler d1 execute sf-portal --remote \
  --command "UPDATE users SET advisor_id = (SELECT id FROM users WHERE role = 'advisor' LIMIT 1) WHERE role = 'client' AND advisor_id IS NULL;"
```

---

## 10. Sviluppo e prove locali

```bash
cp .dev.vars.example .dev.vars   # variabili locali, mai committate
npm run build                    # il Worker serve dist/
npm run db:migrate:local
npm run dev:worker:log           # http://localhost:8787, log su .wrangler/dev.log
```

In un secondo terminale, le due suite di prove (220 verifiche in tutto):

```bash
npm test
```

`npm run test:codes` (77) verifica validatori dei codici italiani, generazione
del codice fiscale, periodi storici dei luoghi, correzione degli errori di
lettura ed estrazione dai testi: non richiede il worker attivo.
`npm run test:e2e` (143) verifica le API contro il worker locale.

Copre registrazione, verifica email, accesso, blocco per tentativi errati,
recupero e cambio password, sessioni e revoca, isolamento fra clienti, confine
fra cliente e consulente, caricamento e download dei documenti (formati falsi,
file troppo grandi, link firmati manomessi), ciclo completo di una pratica di
sinistro, indirizzi ANNCSU/IPA, conferma e coda delle variazioni anagrafiche,
gestionale del consulente, difesa CSRF, rate limit e rotte SPA. In
locale le email non partono: i link finiscono in `.wrangler/dev.log`, da cui le
prove li leggono.

Per lavorare sul frontend con ricarica automatica: `npm run dev`
(porta 3000, `/api` proxato sul Worker).

---

## 11. Operazioni ricorrenti

| Operazione | Comando |
| --- | --- |
| Log in tempo reale | `npx wrangler tail` |
| Query di controllo | `npx wrangler d1 execute sf-portal --remote --command "SELECT COUNT(*) FROM users;"` |
| Backup del database | `npx wrangler d1 export sf-portal --remote --output backup-$(date +%F).sql` |
| Registro accessi consulente | `npx wrangler d1 execute sf-portal --remote --command "SELECT created_at, actor_email, action, entity_id FROM audit_log WHERE action LIKE 'portal.cross_access%' ORDER BY created_at DESC LIMIT 50;"` |
| Nuovo deploy | `npm run deploy` |

La pulizia di sessioni scadute, token consumati e contatori è automatica: un
Cron Trigger gira ogni notte alle 03:30 (`triggers.crons` in `wrangler.jsonc`).
Il registro operazioni viene conservato 24 mesi.

Backup consigliato: export settimanale di D1 conservato fuori da Cloudflare.
Sul piano gratuito è disponibile anche il *Time Travel* di D1 (ripristino a un
istante negli ultimi 7 giorni).

---

## 12. Limiti del piano gratuito e come sono stati rispettati

| Limite | Valore free | Come viene rispettato |
| --- | --- | --- |
| CPU per richiesta | **10 ms** | La password viene derivata dal browser (PBKDF2 250.000 iterazioni); il Worker ne applica solo 15.000, ~3 ms. Percorso più costoso misurato: cambio password, ~6 ms totali di cui meno di 4 di CPU. |
| Richieste | 100.000/giorno | Gli asset statici non passano dal Worker (`run_worker_first` limitato a `/api/*`). |
| Scritture KV | 1.000/giorno | **KV non è usato.** Sessioni e rate limit su D1, stato OAuth in cookie HttpOnly. |
| Query D1 per invocazione | 50 | Le letture multiple sono raggruppate con `db.batch()` (dashboard: 1 chiamata invece di 10). |
| Dimensione D1 | 500 MB | Pulizia notturna via Cron Trigger; i file stanno su R2, non nel database. |
| Cron Trigger | 5 | Ne è usato 1. |
| Email Sending | solo piano Paid | Fornitore esterno con piano gratuito (§4). |
| R2 | 10 GB | Solo metadati in D1; compressione lossless dei file in fase 2. |

Passando al piano Paid (5 $/mese) non serve modificare il codice: si possono
alzare le iterazioni lato server, attivare Email Sending di Cloudflare e usare
KV o Durable Objects dove convenga.
