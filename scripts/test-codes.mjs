#!/usr/bin/env node
/**
 * Prove sui validatori dei codici italiani e sull'estrazione dai testi.
 *
 * Sono la parte che decide se un dato riconosciuto viene proposto o scartato:
 * un errore qui si traduce in campi sbagliati precompilati in una denuncia di
 * sinistro, quindi vanno verificati a ogni modifica.
 *
 * Uso: npm run test:codes
 */

import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? `: ${detail}` : ''}`);
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      \x1b[31m${detail}\x1b[0m` : ''}`);
  }
}

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// I moduli sono TypeScript: si compilano al volo, senza aggiungere un runner.
const outDir = mkdtempSync(join(tmpdir(), 'sfca-codes-'));
const outfile = join(outDir, 'codes.mjs');

// Un unico punto d'ingresso che ri-esporta i due moduli da provare.
// Sta dentro il progetto (non in /tmp) perche' esbuild risolva gli import.
const entry = join(process.cwd(), 'src', 'lib', '.test-entry.ts');
writeFileSync(
  entry,
  [
    "export * from './italianCodes';",
    "export * from './extraction';",
    "export * from './fiscalCodeGenerator';",
  ].join('\n'),
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile,
  // extraction.ts importa pdf.js e il motore OCR solo dentro funzioni async che
  // qui non vengono chiamate: si escludono dal bundle.
  external: ['pdfjs-dist', 'pdfjs-dist/build/pdf.worker.min.mjs?url', 'tesseract.js'],
  logLevel: 'silent',
});

const codes = await import(pathToFileURL(outfile).href);

console.log('\x1b[1mProve su codici e estrazione\x1b[0m');

section('Codice fiscale');
{
  // Codici costruiti con l'algoritmo ufficiale (persone inesistenti).
  const validi = ['MRTMTT25D09F205Z', 'RSSMRA85M01H501Q', 'BNCLNE90A41F205Y', 'VRDGPP70T15L219L'];
  for (const code of validi) {
    check(`${code} riconosciuto valido`, codes.isValidFiscalCode(code), 'carattere di controllo rifiutato');
  }

  check(
    'un codice con carattere di controllo errato viene rifiutato',
    !codes.isValidFiscalCode('RSSMRA85M01H501A'),
    'accettato un codice non valido',
  );
  check('lunghezza sbagliata rifiutata', !codes.isValidFiscalCode('RSSMRA85M01H50'), '');
  check('sequenza casuale rifiutata', !codes.isValidFiscalCode('AAAAAA00A00A000A'), '');

  // Errori tipici dell'OCR: 0 al posto di O, 1 al posto di I, 5 al posto di S.
  const sporco = 'R55MRA85M01H501Q';
  const riparato = codes.repairFiscalCode(sporco);
  check(
    'corregge 5 letto al posto di S',
    riparato?.code === 'RSSMRA85M01H501Q',
    `ottenuto: ${riparato?.code ?? 'nessuna correzione'}`,
  );

  const sporco2 = 'BNCLNE9OA41F2O5Y'; // O al posto di 0 in due posizioni numeriche
  const riparato2 = codes.repairFiscalCode(sporco2);
  check(
    'corregge O letto al posto di 0',
    riparato2?.code === 'BNCLNE90A41F205Y',
    `ottenuto: ${riparato2?.code ?? 'nessuna correzione'}`,
  );

  check(
    'non inventa un codice da una sequenza priva di senso',
    codes.repairFiscalCode('ZZZZZZ99Z99Z999Z') === null ||
      codes.isValidFiscalCode(codes.repairFiscalCode('ZZZZZZ99Z99Z999Z').code),
    'restituito un codice non valido',
  );

  const decoded = codes.decodeFiscalCode('RSSMRA85M01H501Q');
  check('ricava la data di nascita', decoded.birthDate === '1985-08-01', `ottenuto: ${decoded.birthDate}`);
  check('ricava il sesso', decoded.sex === 'M', `ottenuto: ${decoded.sex}`);

  const decodedF = codes.decodeFiscalCode('BNCLNE90A41F205Y');
  check(
    'riconosce il femminile (giorno + 40)',
    decodedF.sex === 'F' && decodedF.birthDate === '1990-01-01',
    `ottenuto: ${decodedF.sex} ${decodedF.birthDate}`,
  );
}

section('Partita IVA');
{
  check('partita IVA valida accettata', codes.isValidVatNumber('00743110157'), '');
  check('cifra di controllo errata rifiutata', !codes.isValidVatNumber('00743110158'), '');
  check('lunghezza errata rifiutata', !codes.isValidVatNumber('0074311015'), '');

  const riparata = codes.repairVatNumber('OO743110157');
  check(
    'corregge O letto al posto di 0',
    riparata?.code === '00743110157',
    `ottenuto: ${riparata?.code ?? 'nessuna correzione'}`,
  );
}

section('IBAN');
{
  const iban = 'IT60X0542811101000000123456';
  check('IBAN valido accettato', codes.isValidIban(iban), '');
  check('IBAN con una cifra alterata rifiutato', !codes.isValidIban('IT60X0542811101000000123457'), '');
  check('lunghezza italiana errata rifiutata', !codes.isValidIban('IT60X05428111010000001234'), '');
}

section('Targa');
{
  check('targa valida accettata', codes.isValidPlate('AB123CD'), '');
  check('targa con lettera non ammessa (I, O, Q, U) rifiutata', !codes.isValidPlate('AI123CD'), '');
  check('formato errato rifiutato', !codes.isValidPlate('A1234CD'), '');

  const riparata = codes.repairPlate('4B123CD');
  check('corregge 4 letto al posto di A', riparata?.code === 'AB123CD', `ottenuto: ${riparata?.code}`);

  const riparata2 = codes.repairPlate('ABI23CD');
  check(
    'corregge I letto al posto di 1',
    riparata2?.code === 'AB123CD',
    `ottenuto: ${riparata2?.code ?? 'nessuna correzione'}`,
  );
}

section('Aggancio ai dati già noti');
{
  const known = ['1234567890', 'POL-2026-778899'];
  check(
    'aggancia una lettura quasi identica a una polizza esistente',
    codes.snapToKnown('POL-2026-778S99', known, 2)?.matched === 'POL-2026-778899',
    '',
  );
  check('non aggancia codici troppo diversi', codes.snapToKnown('XY-000', known, 2) === null, '');
}

section('Date e importi');
{
  check('data italiana convertita', codes.parseItalianDate('15/03/2026') === '2026-03-15', '');
  check('anno a due cifre interpretato', codes.parseItalianDate('15/03/26') === '2026-03-15', '');
  check('data inesistente rifiutata', codes.parseItalianDate('31/02/2026') === null, '');
  check('importo italiano convertito', codes.parseItalianAmount('1.234,56') === 1234.56, '');
}

section('Estrazione da testo di polizza');
{
  const testo = `
    COMPAGNIA GENERALI ITALIA S.p.A.
    Contraente: Mario Rossi
    Codice fiscale: RSSMRA85M01H501Q
    Partita IVA 00743110157
    Codice cliente: CL-99213
    Polizza n. 1234567890  Ramo: RC Auto
    Veicolo targato AB123CD
    Decorrenza: 01/01/2026  Scadenza: 01/01/2027
    Premio annuo: € 480,50
    IBAN IT60X0542811101000000123456
  `;

  const fields = codes.extractFields(testo, { knownPolicyNumbers: ['1234567890'] });
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));

  check('estrae il codice fiscale', byKey.fiscalCode?.value === 'RSSMRA85M01H501Q', JSON.stringify(byKey.fiscalCode));
  check('con affidabilità alta', byKey.fiscalCode?.confidence === 'alta', byKey.fiscalCode?.confidence);
  check('estrae la partita IVA', byKey.vatNumber?.value === '00743110157', JSON.stringify(byKey.vatNumber));
  check('estrae il codice cliente', byKey.clientCode?.value === 'CL-99213', JSON.stringify(byKey.clientCode));
  check('estrae il numero di polizza', byKey.policyNumber?.value === '1234567890', JSON.stringify(byKey.policyNumber));
  check(
    'riconosce che la polizza è già in archivio',
    byKey.policyNumber?.reason?.includes('già presente'),
    byKey.policyNumber?.reason,
  );
  check('estrae la targa', byKey.plate?.value === 'AB123CD', JSON.stringify(byKey.plate));
  check('estrae la compagnia', byKey.company?.value === 'Generali', JSON.stringify(byKey.company));
  check('estrae la decorrenza', byKey.effectiveDate?.value === '2026-01-01', JSON.stringify(byKey.effectiveDate));
  check('estrae la scadenza', byKey.expiryDate?.value === '2027-01-01', JSON.stringify(byKey.expiryDate));
  check('estrae il premio', byKey.amount?.value === '480,50', JSON.stringify(byKey.amount));
  check('estrae l’IBAN', byKey.iban?.value === 'IT60X0542811101000000123456', JSON.stringify(byKey.iban));
  check(
    'ricava la data di nascita dal codice fiscale',
    byKey.birthDate?.value === '1985-08-01',
    JSON.stringify(byKey.birthDate),
  );
  check('ogni campo spiega perché è attendibile', fields.every((field) => field.reason.length > 10), '');
}

section('Estrazione da testo letto male (simulazione OCR)');
{
  const testo = `
    Contraente: Mario Rossi
    Codice fiscale: R55MRA85M01H501Q
    Polizza n. 12345678SO
    Targa: 4B123CD
  `;

  const fields = codes.extractFields(testo, { knownPolicyNumbers: ['1234567890'] });
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));

  check(
    'corregge il codice fiscale letto male',
    byKey.fiscalCode?.value === 'RSSMRA85M01H501Q',
    JSON.stringify(byKey.fiscalCode),
  );
  check(
    'segnala che il valore è stato corretto',
    Boolean(byKey.fiscalCode?.correctedFrom),
    'nessuna indicazione della correzione',
  );
  check('corregge la targa letta male', byKey.plate?.value === 'AB123CD', JSON.stringify(byKey.plate));
  check(
    'aggancia il numero di polizza a quello in archivio',
    byKey.policyNumber?.value === '1234567890',
    JSON.stringify(byKey.policyNumber),
  );
}

section('Generazione del codice fiscale');
{
  // Il primo caso è un riferimento pubblico indipendente, usato anche in
  // documentazione tecnica internazionale (Matteo Martini, Milano, 9 aprile
  // 1925). Se il generatore lo riproduce, sono corrette tutte le regole
  // insieme: estrazione da cognome e nome, lettera del mese, giorno, codice
  // catastale e carattere di controllo.
  // Gli altri casi verificano le singole regole; il codice atteso è quello che
  // produce l'algoritmo e viene ricontrollato dal validatore.
  const casi = [
    {
      nome: 'Matteo', cognome: 'Martini', data: '1925-04-09', sesso: 'M', luogo: 'F205',
      atteso: 'MRTMTT25D09F205Z', descrizione: 'riferimento indipendente (Milano, 1925)',
    },
    {
      nome: 'Mario', cognome: 'Rossi', data: '1985-08-01', sesso: 'M', luogo: 'H501',
      atteso: 'RSSMRA85M01H501Q', descrizione: 'caso standard (Roma)',
    },
    {
      nome: 'Anna', cognome: 'Bianchi', data: '1990-01-01', sesso: 'F', luogo: 'F205',
      atteso: 'BNCNNA90A41F205W', descrizione: 'femminile: giorno + 40 (Milano)',
    },
    {
      nome: 'Giuseppe', cognome: 'Verdi', data: '1970-12-15', sesso: 'M', luogo: 'L219',
      atteso: 'VRDGPP70T15L219L', descrizione: 'nome con quattro consonanti (Torino)',
    },
    {
      nome: 'Luca', cognome: 'Fo', data: '2000-06-10', sesso: 'M', luogo: 'D612',
      atteso: null, descrizione: 'cognome di due lettere: riempimento con X',
    },
  ];

  for (const caso of casi) {
    const risultato = codes.generateFiscalCode({
      firstName: caso.nome,
      lastName: caso.cognome,
      birthDate: caso.data,
      sex: caso.sesso,
      belfioreCode: caso.luogo,
    });

    if (caso.atteso) {
      check(`${caso.descrizione}: ${caso.atteso}`, risultato.code === caso.atteso, `ottenuto: ${risultato.code}`);
    }
    check(
      `${caso.descrizione}: il codice generato supera il proprio controllo`,
      codes.isValidFiscalCode(risultato.code),
      risultato.code,
    );
  }

  // Riconciliazione: quello che il generatore produce dev'essere leggibile
  // dal decodificatore, altrimenti i due pezzi divergerebbero.
  const generato = codes.generateFiscalCode({
    firstName: 'Anna', lastName: 'Bianchi', birthDate: '1990-01-01', sex: 'F', belfioreCode: 'F205',
  });
  const decodificato = codes.decodeFiscalCode(generato.code);
  check(
    'il codice generato viene riletto con la stessa data e lo stesso sesso',
    decodificato.birthDate === '1990-01-01' && decodificato.sex === 'F',
    JSON.stringify(decodificato),
  );

  check('cognome di due lettere riempito con X', codes.surnameCode('Fo') === 'FOX', codes.surnameCode('Fo'));
  check('cognome di una lettera riempito con XX', codes.surnameCode('O') === 'OXX', codes.surnameCode('O'));
  check(
    'nome con quattro consonanti: prima, terza, quarta',
    codes.firstNameCode('Giuseppe') === 'GPP',
    codes.firstNameCode('Giuseppe'),
  );
  check('nome con tre consonanti: le prime tre', codes.firstNameCode('Marco') === 'MRC', codes.firstNameCode('Marco'));
  check(
    'accenti e apostrofi ignorati',
    codes.surnameCode("D'Angelò") === codes.surnameCode('Dangelo'),
    `${codes.surnameCode("D'Angelò")} vs ${codes.surnameCode('Dangelo')}`,
  );
  check(
    'cognomi composti trattati come sequenza unica',
    codes.surnameCode('De Luca') === 'DLC',
    codes.surnameCode('De Luca'),
  );

  const errori = [
    ['data inesistente', () => codes.generateFiscalCode({ firstName: 'A', lastName: 'B', birthDate: '2026-02-30', sex: 'M', belfioreCode: 'H501' })],
    ['data futura', () => codes.generateFiscalCode({ firstName: 'A', lastName: 'B', birthDate: '2030-01-01', sex: 'M', belfioreCode: 'H501' })],
    ['luogo mancante', () => codes.generateFiscalCode({ firstName: 'A', lastName: 'B', birthDate: '1990-01-01', sex: 'M', belfioreCode: '' })],
    ['cognome vuoto', () => codes.generateFiscalCode({ firstName: 'Mario', lastName: '  ', birthDate: '1990-01-01', sex: 'M', belfioreCode: 'H501' })],
  ];
  for (const [descrizione, azione] of errori) {
    let sollevato = false;
    try {
      azione();
    } catch {
      sollevato = true;
    }
    check(`rifiuta: ${descrizione}`, sollevato, 'nessun errore sollevato');
  }
}

section('Luoghi di nascita e validità storica');
{
  const luoghi = [
    { name: 'ABANO', province: 'PD', code: 'A001', validFrom: '1866-11-19', validTo: '1924-11-13' },
    { name: 'ABANO TERME', province: 'PD', code: 'A001', validFrom: '1924-11-14', validTo: null },
    { name: 'GERMANIA', province: 'EE', code: 'Z112', validFrom: null, validTo: null },
  ];

  const primaDelCambio = codes.findBirthPlaces(luoghi, 'Abano', '1924-11-13');
  check(
    'l’ultimo giorno di validità usa la denominazione storica',
    primaDelCambio.length === 1 && primaDelCambio[0].name === 'ABANO',
    JSON.stringify(primaDelCambio),
  );

  const dopoIlCambio = codes.findBirthPlaces(luoghi, 'Abano', '1924-11-14');
  check(
    'dal giorno successivo usa la nuova denominazione',
    dopoIlCambio.length === 1 && dopoIlCambio[0].name === 'ABANO TERME',
    JSON.stringify(dopoIlCambio),
  );

  const senzaData = codes.findBirthPlaces(luoghi, 'Abano');
  check(
    'senza data mostra soltanto il comune attuale',
    senzaData.length === 1 && senzaData[0].name === 'ABANO TERME',
    JSON.stringify(senzaData),
  );

  check(
    'uno Stato estero senza periodo resta ricercabile',
    codes.findBirthPlaces(luoghi, 'Germania', '1985-08-01')[0]?.code === 'Z112',
    '',
  );
  check(
    'un luogo fuori periodo non può essere confermato',
    !codes.isBirthPlaceValidAt(luoghi[0], '1924-11-14'),
    '',
  );
}

section('Nessun falso positivo');
{
  const testo = `
    Gentile cliente, la informiamo che il servizio sarà sospeso il 12/13/2026.
    Codice pratica interno: ABCDEF1234567890
    Riferimento: 12345678901
  `;
  const fields = codes.extractFields(testo, {});
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));

  check(
    'una sequenza di 16 caratteri senza controllo valido non diventa codice fiscale',
    !byKey.fiscalCode || byKey.fiscalCode.confidence === 'bassa',
    JSON.stringify(byKey.fiscalCode),
  );
  check(
    'un numero di 11 cifre senza cifra di controllo valida non diventa partita IVA',
    !byKey.vatNumber,
    JSON.stringify(byKey.vatNumber),
  );
  check('una data impossibile non viene proposta', !byKey.expiryDate, JSON.stringify(byKey.expiryDate));
}

rmSync(outDir, { recursive: true, force: true });
rmSync(entry, { force: true });

console.log(`\n\x1b[1mRisultato:\x1b[0m ${passed} verifiche superate, ${failed} fallite\n`);
if (failed > 0) {
  console.log('\x1b[31mFallimenti:\x1b[0m');
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
