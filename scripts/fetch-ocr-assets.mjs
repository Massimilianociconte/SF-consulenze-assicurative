#!/usr/bin/env node
/**
 * Prepara i file necessari al riconoscimento ottico (OCR) in `public/ocr/`.
 *
 * Perche' auto-ospitarli invece di usare un CDN: il riconoscimento avviene nel
 * browser dell'utente proprio per non mandare a nessuno le fotografie di
 * documenti e sinistri. Se pero' il motore e il dizionario arrivassero da un
 * dominio di terzi, quel dominio saprebbe comunque *quando* qualcuno sta
 * leggendo un documento, e la Content-Security-Policy dovrebbe aprirsi verso
 * l'esterno. Servendoli dal nostro dominio non esce nulla, in nessuna forma.
 *
 * I file non stanno nel repository (sono ~9 MB di binari): questo script li
 * ricava da node_modules e, per il dizionario italiano, dal repository
 * ufficiale tessdata_fast. Viene eseguito automaticamente prima della build ed
 * e' idempotente: se i file ci sono gia', non fa nulla.
 */

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), 'public', 'ocr');
const TRAINEDDATA_URL = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/ita.traineddata';

/** File copiati da node_modules: motore WebAssembly e worker. */
const COPIES = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd.wasm', 'tesseract-core-simd.wasm'],
  // Variante senza SIMD: serve ai browser piu' vecchi.
  ['tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core.wasm.js'],
  ['tesseract.js-core/tesseract-core.wasm', 'tesseract-core.wasm'],
];

function log(message) {
  console.log(`[ocr-assets] ${message}`);
}

mkdirSync(outputDir, { recursive: true });

let copied = 0;
for (const [source, target] of COPIES) {
  const from = join(process.cwd(), 'node_modules', source);
  const to = join(outputDir, target);
  if (existsSync(to)) continue;
  if (!existsSync(from)) {
    console.error(`[ocr-assets] manca ${source}: eseguire prima "npm install".`);
    process.exit(1);
  }
  copyFileSync(from, to);
  copied++;
}
if (copied > 0) log(`${copied} file del motore copiati da node_modules.`);

// Dizionario italiano. Si usa la variante "fast": leggermente meno precisa della
// completa, ma un terzo del peso, differenza che su un telefono si sente.
const traineddataPath = join(outputDir, 'ita.traineddata.gz');
if (existsSync(traineddataPath)) {
  log(`dizionario gia' presente (${(statSync(traineddataPath).size / 1024 / 1024).toFixed(1)} MB).`);
} else {
  log('scarico il dizionario italiano da tessdata_fast…');
  const response = await fetch(TRAINEDDATA_URL);
  if (!response.ok || !response.body) {
    console.error(`[ocr-assets] download non riuscito (${response.status}).`);
    console.error('[ocr-assets] Scaricare manualmente ita.traineddata da');
    console.error(`[ocr-assets] ${TRAINEDDATA_URL}`);
    console.error('[ocr-assets] comprimerlo con gzip e salvarlo come public/ocr/ita.traineddata.gz');
    process.exit(1);
  }

  // Tesseract.js si aspetta il dizionario compresso: da 2,7 MB si scende a ~1,2.
  await pipeline(Readable.fromWeb(response.body), createGzip({ level: 9 }), createWriteStream(traineddataPath));
  log(`dizionario pronto (${(statSync(traineddataPath).size / 1024 / 1024).toFixed(1)} MB).`);
}

// Nota per chi guarda la cartella: spiega perche' esiste e che non va committata.
writeFileSync(
  join(outputDir, 'LEGGIMI.txt'),
  [
    'Motore OCR (Tesseract) e dizionario italiano, serviti dal nostro dominio.',
    '',
    'Questi file NON stanno nel repository: vengono generati da',
    'scripts/fetch-ocr-assets.mjs, eseguito automaticamente prima della build.',
    '',
    'Vengono scaricati dal browser solo quando un utente chiede di leggere un',
    'documento scansionato: chi non usa quella funzione non ne scarica nemmeno',
    'un byte.',
    '',
  ].join('\n'),
  'utf8',
);

log('cartella public/ocr pronta.');
