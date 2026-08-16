#!/usr/bin/env node
/**
 * Prepara la tabella dei codici catastali (codici Belfiore) in
 * `public/dati/belfiore.json`, usata per calcolare il codice fiscale dal luogo
 * di nascita.
 *
 * Perché serve un archivio storico e non l'elenco dei comuni di oggi: il codice
 * fiscale usa la denominazione e il codice del luogo validi alla data di
 * nascita. Sono inclusi anche gli Stati esteri e i comuni cessati.
 *
 * La sorgente è fissata a un commit e verificata con SHA-256. In questo modo
 * due build dello stesso codice producono la stessa tabella e un cambiamento
 * remoto non può alterare silenziosamente il calcolo. Per aggiornare i dati si
 * revisionano insieme commit e impronta, quindi si esegue:
 *
 *   npm run belfiore -- --force
 *
 * Il file generato non è versionato: viene creato prima della build e scaricato
 * dal browser soltanto quando si apre il calcolatore.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE_REPOSITORY = 'https://github.com/DarioCorno/database_comuni_italiani';
const SOURCE_COMMIT = '34198642fd092760700a0a382e325219f37269e0';
const SOURCE_FILE = 'json/gi_comuni_nazioni_cf.json';
const SOURCE = `https://raw.githubusercontent.com/DarioCorno/database_comuni_italiani/${SOURCE_COMMIT}/${SOURCE_FILE}`;
const SOURCE_SHA256 = '77fe392b603550229dcd83082d8aef6afcb1c7a92e3d52a60b3429c7d1ff46d9';
const OFFICIAL_LOOKUP = 'https://arcom.agenziaentrate.gov.it/CitizenArCom/';
const DATA_VERSION = 2;

const outputDir = join(process.cwd(), 'public', 'dati');
const outputFile = join(outputDir, 'belfiore.json');
const force = process.argv.includes('--force');

function log(message) {
  console.log(`[belfiore] ${message}`);
}

function existingTableIsCurrent() {
  if (!existsSync(outputFile)) return false;
  try {
    const payload = JSON.parse(readFileSync(outputFile, 'utf8'));
    return (
      payload.versione === DATA_VERSION &&
      payload.fonte?.commit === SOURCE_COMMIT &&
      payload.fonte?.sha256 === SOURCE_SHA256 &&
      Array.isArray(payload.voci) &&
      payload.voci.length >= 16_000
    );
  } catch {
    return false;
  }
}

if (!force && existingTableIsCurrent()) {
  log(`tabella già presente e verificata (${(statSync(outputFile).size / 1024).toFixed(0)} KB).`);
  process.exit(0);
}

mkdirSync(outputDir, { recursive: true });

log('scarico l’archivio storico dei comuni e degli Stati esteri…');
const response = await fetch(SOURCE);
if (!response.ok) {
  console.error(`[belfiore] download non riuscito (${response.status}).`);
  console.error(`[belfiore] Sorgente revisionata: ${SOURCE}`);
  process.exit(1);
}

const sourceBytes = Buffer.from(await response.arrayBuffer());
const actualSha256 = createHash('sha256').update(sourceBytes).digest('hex');
if (actualSha256 !== SOURCE_SHA256) {
  console.error('[belfiore] impronta della sorgente diversa da quella revisionata: generazione interrotta.');
  console.error(`[belfiore] attesa:   ${SOURCE_SHA256}`);
  console.error(`[belfiore] ricevuta: ${actualSha256}`);
  process.exit(1);
}

const raw = JSON.parse(sourceBytes.toString('utf8'));
if (!Array.isArray(raw) || raw.length < 16_000) {
  console.error('[belfiore] archivio incompleto o in un formato inatteso.');
  process.exit(1);
}

const entries = [];
const seen = new Set();

for (const record of raw) {
  const name = String(record.denominazione_ita ?? '').trim();
  const code = String(record.codice_belfiore ?? '').trim().toUpperCase();
  const province = String(record.sigla_provincia ?? '').trim().toUpperCase();
  const from = typeof record.data_inizio_validita === 'string' ? record.data_inizio_validita.slice(0, 10) : '';
  const to = typeof record.data_fine_validita === 'string' ? record.data_fine_validita.slice(0, 10) : '';

  if (!name || !/^[A-Z]\d{3}$/.test(code)) continue;
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) continue;
  if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) continue;

  const key = `${name}|${province}|${code}|${from}|${to}`;
  if (seen.has(key)) continue;
  seen.add(key);

  // Formato compatto: array invece di oggetti. La licenza e la provenienza
  // restano nel payload che viene distribuito insieme ai dati.
  entries.push([name, province, code, from, to]);
}

// Confronto bytewise, indipendente dalla versione ICU/locale della macchina di
// build: il file resta identico a parità di sorgente.
entries.sort((left, right) => {
  for (let index = 0; index < left.length; index++) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
});

if (entries.length < 16_000) {
  console.error(`[belfiore] soltanto ${entries.length} voci valide: generazione interrotta.`);
  process.exit(1);
}

const payload = {
  versione: DATA_VERSION,
  fonte: {
    nome: 'database_comuni_italiani',
    repository: SOURCE_REPOSITORY,
    file: SOURCE_FILE,
    commit: SOURCE_COMMIT,
    sha256: SOURCE_SHA256,
    licenza: 'MIT',
    copyright: 'Copyright (c) 2025 Dario Corno',
    testoLicenza: `${SOURCE_REPOSITORY}/blob/${SOURCE_COMMIT}/LICENSE`,
  },
  verificaUfficiale: OFFICIAL_LOOKUP,
  nota:
    'Denominazioni storiche incluse con periodo di validità. Il risultato calcolato va confermato perché l’omocodia è attribuita dall’Anagrafe tributaria.',
  campi: ['denominazione', 'provincia', 'codice', 'validoDal', 'validoAl'],
  voci: entries,
};

writeFileSync(outputFile, JSON.stringify(payload), 'utf8');

const italiani = entries.filter((entry) => entry[1] !== 'EE').length;
const esteri = entries.length - italiani;
log(
  `tabella pronta: ${entries.length} voci (${italiani} denominazioni italiane, ${esteri} Stati esteri) — ` +
    `${(statSync(outputFile).size / 1024).toFixed(0)} KB.`,
);
