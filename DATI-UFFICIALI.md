# Dati ufficiali e compilazione assistita

Questa nota è il registro operativo delle fonti usate per aiutare la
compilazione. I suggerimenti non sono mai definitivi: l’utente può correggerli,
ignorarli e deve confermare il confronto fra valori precedenti e nuovi.

## Fonti attive

| Uso | Fonte e titolare | Licenza | Versione importata | Aggiornamento | Copertura e limite principale |
| --- | --- | --- | --- | --- | --- |
| Strade e numeri civici | [ANNCSU](https://www.anncsu.gov.it/it/consultazione-dellarchivio/open-data/Accedi-ai-servizi-di-dowload-massivo-in-Open-data/), Agenzia delle Entrate e Istat | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 2026-07-03, SHA-256 combinato `bce170731315bddc608c94deda787e927207db9fd47404867bc43e2e71f65af0` | file massivi mensili; servizio ufficiale puntuale giornaliero | Comune di Rho (H264): 450 strade e 7.161 accessi. Sono presenti solo i dati conferiti dal Comune; ANNCSU non contiene il CAP. |
| CAP comunale proposto | [IPA - Enti](https://www.indicepa.gov.it/ipa-dati/dataset/enti), Agenzia per l’Italia Digitale | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | 2026-07-30, SHA-256 della riga selezionata `edb4f808d873f9c9ff45026e68351830b8500eaf6448d699a4e67187ea4572f4` | giornaliero | `20017`, dichiarato per la sede del Comune di Rho (`c_h264`). È un riferimento comunale, non una certificazione postale del singolo recapito. |
| Codici Belfiore per il codice fiscale | [`database_comuni_italiani`](https://github.com/DarioCorno/database_comuni_italiani), archivio revisionato e fissato a commit | MIT | commit e SHA-256 fissati in `scripts/build-belfiore.mjs` | aggiornamento manuale e revisionato | Include denominazioni storiche e Stati esteri. Non è una fonte istituzionale: i codici possono essere riscontrati nell’[archivio ufficiale dell’Agenzia delle Entrate](https://arcom.agenziaentrate.gov.it/CitizenArCom/), e il risultato resta sempre un codice base proposto. |

I metadati interrogabili dall’applicazione sono memorizzati in
`reference_datasets`: fonte, editore, URL, licenza, versione, data della fonte,
frequenza prevista, copertura, limitazioni, impronta e stato. Le righe di
indirizzo mantengono separati l’identificativo ANNCSU e la fonte del CAP.

## Funzionamento e privacy

- Il browser attende 3 caratteri e 300 ms dall’ultima digitazione; riceve al
  massimo 8 proposte.
- La ricerca richiede una sessione, è limitata a 240 richieste ogni 15 minuti
  per account e non registra la stringa digitata nell’audit log.
- Il Worker interroga un indice FTS5 in D1. I file regionali completi non
  vengono inviati al browser e non sono inclusi nel repository.
- Le risposte hanno cache privata e breve; non sono condivise fra utenti.
- Se il dato manca, è in ritardo o la ricerca non è disponibile, tutti i campi
  restano compilabili manualmente.
- Non sono usati endpoint pubblici Nominatim, copie non documentate di elenchi
  CAP o API che ricevano l’indirizzo dell’utente.
- I valori scelti da una proposta conservano l’identificativo della fonte. Se
  l’utente li corregge, la variazione viene classificata
  `assisted_corrected`, non come corrispondenza ufficiale.

## Aggiornamento revisionato

Lo script scarica direttamente i due archivi regionali ANNCSU e la sola riga
IPA del Comune, verifica firme/formati, coerenza dei codici H264/015182, date e
impronte, poi genera SQL deterministico:

```bash
npm run anncsu:build
npm run anncsu:import:local
npm run lint
npm test
```

Prima di un aggiornamento remoto:

1. confrontare versione, conteggi, copertura, limitazioni e impronte con la
   versione già registrata;
2. applicare l’import in locale e poi in staging;
3. verificare ricerca per strada, civico e CAP, compilazione manuale e
   tracciamento delle variazioni;
4. salvare il SQL revisionato come nuova migrazione numerata;
5. eseguire backup D1 e applicare la migrazione in produzione con un’azione
   esplicita.

Non è previsto un aggiornamento remoto automatico non revisionato: una
variazione di schema, licenza o copertura deve fermare il flusso prima di
modificare i dati in uso.

## Confine con il gestionale

Il “gestionale” implementato in questo repository usa le stesse tabelle D1
dell’area riservata. Una modifica confermata dall’utente:

1. viene salvata nell’anagrafica interna;
2. crea una variazione con valori precedenti/nuovi, data, origine e fonte;
3. compare nella coda del consulente come `received`;
4. può passare a `in_review`, `verified`, `rejected` o `failed`.

Non esiste, al momento, una sincronizzazione con software assicurativi esterni.
L’interfaccia non presenta quindi la modifica come verificata o aggiornata
all’esterno finché il consulente non assegna uno stato conclusivo.
