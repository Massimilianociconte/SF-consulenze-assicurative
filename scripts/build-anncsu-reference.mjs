#!/usr/bin/env node
/**
 * Genera un import SQL D1 da stradario e indirizzario ufficiali ANNCSU.
 *
 * Per non superare i 500 MB del piano D1 gratuito, l'importazione e' esplicita
 * e circoscritta a uno o piu' Comuni. I file regionali restano la sorgente
 * ufficiale, ma nel database finiscono solo le righe necessarie al servizio.
 *
 * Esempio:
 *   node scripts/build-anncsu-reference.mjs \
 *     --region=LOMB --municipality=H264 --city=Rho --province=MI \
 *     --output=.data/anncsu-H264.sql
 */

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ANNCSU_DOWNLOAD = 'https://anncsu.open.agenziaentrate.gov.it/age-inspire/opendata/anncsu/getds.php';
const ANNCSU_PAGE =
  'https://www.anncsu.gov.it/it/consultazione-dellarchivio/open-data/Accedi-ai-servizi-di-dowload-massivo-in-Open-data/';
const IPA_API = 'https://indicepa.gov.it/ipa-dati/api/3/action';
const IPA_PAGE = 'https://www.indicepa.gov.it/ipa-dati/dataset/enti';
const IPA_RESOURCE_ID = 'd09adf99-dc10-4349-8c53-27b1e5aa97b6';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

const options = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((argument) => argument.startsWith('--') && argument.includes('='))
    .map((argument) => {
      const separator = argument.indexOf('=');
      return [argument.slice(2, separator), argument.slice(separator + 1)];
    }),
);

const region = String(options.region ?? 'LOMB').trim().toUpperCase();
const municipality = String(options.municipality ?? 'H264').trim().toUpperCase();
const city = String(options.city ?? 'Rho').trim();
const province = String(options.province ?? 'MI').trim().toUpperCase();
const ipaCode = String(options['ipa-code'] ?? `c_${municipality.toLowerCase()}`).trim().toLowerCase();
const output = resolve(options.output ?? '.data/anncsu-H264.sql');

if (!/^[A-Z]{4}$/.test(region)) throw new Error('Regione ANNCSU non valida (es. LOMB).');
if (!/^[A-Z][0-9]{3}$/.test(municipality)) throw new Error('Codice Comune non valido (es. H264).');
if (!city || !/^[A-Z]{2}$/.test(province)) throw new Error('Comune o provincia non validi.');
if (!/^[a-z0-9_-]{2,30}$/.test(ipaCode)) throw new Error('Codice IPA non valido (es. c_h264).');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sql(value) {
  if (value == null || value === '') return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ';' && !quoted) {
      fields.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  fields.push(value.trim());
  return fields;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift() ?? '').map((header) => header.toUpperCase());
  return lines.map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

/**
 * I download ufficiali contengono un singolo CSV ZIP/deflate. Questo lettore
 * minimale controlla firme, metodo e dimensione prima di decomprimere.
 */
function unzipSingleFile(bytes) {
  const eocdSignature = 0x06054b50;
  let eocd = -1;
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index--) {
    if (bytes.readUInt32LE(index) === eocdSignature) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archivio ANNCSU ZIP non riconosciuto.');

  const entries = bytes.readUInt16LE(eocd + 10);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (entries !== 1 || bytes.readUInt32LE(centralOffset) !== 0x02014b50) {
    throw new Error('L’archivio ANNCSU non contiene il singolo CSV atteso.');
  }

  const method = bytes.readUInt16LE(centralOffset + 10);
  const compressedSize = bytes.readUInt32LE(centralOffset + 20);
  const uncompressedSize = bytes.readUInt32LE(centralOffset + 24);
  const nameLength = bytes.readUInt16LE(centralOffset + 28);
  const filename = bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString('utf8');
  const localOffset = bytes.readUInt32LE(centralOffset + 42);

  if (!filename.toLowerCase().endsWith('.csv') || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error('Il contenuto ANNCSU non e’ il CSV atteso.');
  }

  const localNameLength = bytes.readUInt16LE(localOffset + 26);
  const localExtraLength = bytes.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + localNameLength + localExtraLength;
  const compressed = bytes.subarray(start, start + compressedSize);
  const content = method === 8 ? inflateRawSync(compressed) : method === 0 ? compressed : null;
  if (!content || content.length !== uncompressedSize) throw new Error('Decompressione ANNCSU incompleta.');
  return { filename, content };
}

async function download(kind) {
  const url = `${ANNCSU_DOWNLOAD}?${kind}_${region}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      Referer: 'https://www.anncsu.gov.it/',
      'User-Agent': 'SF-Consulenze-ANNCSU-Importer/1.0',
    },
  });
  if (!response.ok) throw new Error(`Download ${kind} non riuscito (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_000 || response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(`Download ${kind} incompleto o inatteso.`);
  }
  const archive = unzipSingleFile(bytes);
  const date = archive.filename.match(/(20\d{6})/)?.[1];
  if (!date) throw new Error(`Versione non ricavabile dal file ${archive.filename}.`);
  return { ...archive, url, hash: sha256(bytes), date };
}

async function downloadPostalReference() {
  const searchUrl = new URL(`${IPA_API}/datastore_search`);
  searchUrl.searchParams.set('resource_id', IPA_RESOURCE_ID);
  searchUrl.searchParams.set('q', ipaCode);
  searchUrl.searchParams.set('limit', '10');

  const packageUrl = new URL(`${IPA_API}/package_show`);
  packageUrl.searchParams.set('id', 'enti');

  const [searchResponse, packageResponse] = await Promise.all([
    fetch(searchUrl, { headers: { Accept: 'application/json' } }),
    fetch(packageUrl, { headers: { Accept: 'application/json' } }),
  ]);
  if (!searchResponse.ok || !packageResponse.ok) {
    throw new Error(`Download IPA non riuscito (${searchResponse.status}/${packageResponse.status}).`);
  }

  const searchPayload = await searchResponse.json();
  const packagePayload = await packageResponse.json();
  if (!searchPayload?.success || !packagePayload?.success) {
    throw new Error('Risposta IPA non valida.');
  }

  const record = searchPayload.result?.records?.find(
    (candidate) => String(candidate.Codice_IPA ?? '').toLowerCase() === ipaCode,
  );
  const resource = packagePayload.result?.resources?.find((candidate) => candidate.id === IPA_RESOURCE_ID);
  if (!record || !resource?.last_modified) {
    throw new Error(`CAP IPA non disponibile per ${ipaCode}.`);
  }

  const postalCode = String(record.CAP ?? '').trim();
  const cadastralCode = String(record.Codice_catastale_comune ?? '').trim().toUpperCase();
  if (!/^\d{5}$/.test(postalCode) || cadastralCode !== municipality) {
    throw new Error(`Dati IPA incoerenti per ${ipaCode}: CAP o codice catastale inatteso.`);
  }

  const selectedRecord = {
    resourceId: IPA_RESOURCE_ID,
    code: record.Codice_IPA,
    municipalityCode: cadastralCode,
    istatCode: String(record.Codice_comune_ISTAT ?? '').trim(),
    postalCode,
    entityUpdatedAt: String(record.Data_aggiornamento ?? '').trim(),
  };

  return {
    ...selectedRecord,
    version: String(resource.last_modified).slice(0, 10),
    hash: sha256(Buffer.from(JSON.stringify(selectedRecord))),
  };
}

function civicLabel(row) {
  if (row.CIVICO) return `${row.CIVICO}${row.ESPONENTE ? `/${row.ESPONENTE}` : ''}`;
  if (row.METRICO) return `KM ${row.METRICO}`;
  if (row.PROGRESSIVO_SNC) return 'SNC';
  return '';
}

console.log(`[anncsu] scarico stradario e indirizzario ${region}, più il riferimento CAP IPA…`);
const [streetArchive, addressArchive, postalReference] = await Promise.all([
  download('STRAD'),
  download('INDIR'),
  downloadPostalReference(),
]);
if (streetArchive.date !== addressArchive.date) {
  throw new Error(`Versioni ANNCSU disallineate: ${streetArchive.date} / ${addressArchive.date}.`);
}

const streetRows = parseCsv(streetArchive.content.toString('utf8')).filter(
  (row) => row.CODICE_COMUNE === municipality,
);
const streetById = new Map(streetRows.map((row) => [row.PROGRESSIVO_NAZIONALE, row]));
const addressRows = parseCsv(addressArchive.content.toString('utf8')).filter(
  (row) => row.CODICE_COMUNE === municipality,
);

if (streetRows.length === 0 || addressRows.length === 0) {
  throw new Error(`Nessun dato ANNCSU trovato per ${municipality}.`);
}
if (streetRows.some((row) => row.CODICE_ISTAT !== addressRows[0].CODICE_ISTAT)) {
  throw new Error('Codici ISTAT non coerenti nei dati ANNCSU.');
}
if (postalReference.istatCode !== addressRows[0].CODICE_ISTAT) {
  throw new Error('Il Comune restituito da IPA non coincide con quello ANNCSU.');
}

const datasetId = `anncsu-${municipality.toLowerCase()}`;
const postalDatasetId = `ipa-cap-${municipality.toLowerCase()}`;
const sourceDate = `${streetArchive.date.slice(0, 4)}-${streetArchive.date.slice(4, 6)}-${streetArchive.date.slice(6, 8)}`;
const combinedHash = sha256(Buffer.from(`${streetArchive.hash}:${addressArchive.hash}`));
const statements = [];

statements.push('-- File generato da scripts/build-anncsu-reference.mjs: non modificare a mano.');
statements.push(
  `-- Sorgenti ANNCSU ${region} ${sourceDate} e IPA ${postalReference.version}, Comune ${municipality}.`,
);
statements.push(
  `DELETE FROM address_reference WHERE dataset_id = ${sql(datasetId)} OR postal_dataset_id = ${sql(postalDatasetId)};`,
);
statements.push(
  `DELETE FROM reference_datasets WHERE id IN (${sql(datasetId)}, ${sql(postalDatasetId)});`,
);
statements.push(
  `INSERT INTO reference_datasets (` +
    `id, kind, name, publisher, source_url, license_name, license_url, version, source_updated_at, ` +
    `update_frequency, coverage, limitations, content_sha256, status` +
    `) VALUES (` +
    [
      datasetId,
      'address',
      'Archivio Nazionale dei Numeri Civici delle Strade Urbane (ANNCSU)',
      'Agenzia delle Entrate e Istat',
      ANNCSU_PAGE,
      'Creative Commons Attribuzione 4.0 Internazionale (CC BY 4.0)',
      LICENSE_URL,
      sourceDate,
      sourceDate,
      'Mensile per i file massivi; API ufficiale puntuale aggiornata giornalmente',
      `Comune di ${city} (${province}), codice ${municipality}`,
      'ANNCSU non contiene il CAP. Sono presenti soltanto strade e accessi conferiti e certificati dal Comune; ogni proposta deve essere verificata e puo’ essere corretta manualmente.',
      combinedHash,
      'active',
    ]
      .map(sql)
      .join(', ') +
    `);`,
);
statements.push(
  `INSERT INTO reference_datasets (` +
    `id, kind, name, publisher, source_url, license_name, license_url, version, source_updated_at, ` +
    `update_frequency, coverage, limitations, content_sha256, status` +
    `) VALUES (` +
    [
      postalDatasetId,
      'municipality',
      'Indice dei domicili digitali delle Pubbliche Amministrazioni (IPA) - Enti',
      'Agenzia per l’Italia Digitale',
      IPA_PAGE,
      'Creative Commons Attribuzione 4.0 Internazionale (CC BY 4.0)',
      LICENSE_URL,
      postalReference.version,
      postalReference.version,
      'Giornaliera',
      `CAP della sede del Comune di ${city}, codice IPA ${ipaCode}`,
      `Il CAP ${postalReference.postalCode} e’ quello dichiarato per la sede dell’ente in IPA (dato ente aggiornato il ${postalReference.entityUpdatedAt}) ed e’ proposto come riferimento comunale. Non sostituisce la verifica puntuale del recapito da parte dell’utente.`,
      postalReference.hash,
      'active',
    ]
      .map(sql)
      .join(', ') +
    `);`,
);

const rows = [];
for (const row of streetRows) {
  const locality = row["LOCALITA'"] || '';
  const display = row.ODONIMO;
  rows.push([
    `${datasetId}:street:${row.PROGRESSIVO_NAZIONALE}`,
    datasetId,
    'street',
    municipality,
    row.CODICE_ISTAT,
    city.toUpperCase(),
    province,
    'IT',
    row.PROGRESSIVO_NAZIONALE,
    row.ODONIMO,
    locality,
    null,
    null,
    null,
    null,
    null,
    null,
    postalReference.postalCode,
    postalDatasetId,
    display,
    normalize(`${row.ODONIMO} ${locality} ${city} ${province} ${postalReference.postalCode} IT`),
  ]);
}

for (const row of addressRows) {
  const street = streetById.get(row.PROGRESSIVO_NAZIONALE);
  const locality = street?.["LOCALITA'"] || '';
  const civic = civicLabel(row);
  const display = civic ? `${row.ODONIMO} ${civic}` : row.ODONIMO;
  rows.push([
    `${datasetId}:access:${row.PROGRESSIVO_ACCESSO}`,
    datasetId,
    'access',
    municipality,
    row.CODICE_ISTAT,
    city.toUpperCase(),
    province,
    'IT',
    row.PROGRESSIVO_NAZIONALE,
    row.ODONIMO,
    locality,
    row.PROGRESSIVO_ACCESSO,
    row.CIVICO,
    row.ESPONENTE,
    row.SPECIFICITA,
    row.METRICO,
    row.PROGRESSIVO_SNC,
    postalReference.postalCode,
    postalDatasetId,
    display,
    normalize(`${display} ${locality} ${city} ${province} ${postalReference.postalCode} IT`),
  ]);
}

const columns =
  'id, dataset_id, kind, municipality_code, istat_code, city, province, country, street_national_id, ' +
  'street, locality, access_national_id, civic, civic_extension, civic_specificity, metric, snc_progressive, ' +
  'postal_code, postal_dataset_id, display_street, search_text';

// Ogni statement resta molto sotto il limite D1 di 100 KB.
for (let index = 0; index < rows.length; index += 80) {
  const values = rows
    .slice(index, index + 80)
    .map((row) => `(${row.map(sql).join(', ')})`)
    .join(',\n');
  statements.push(`INSERT INTO address_reference (${columns}) VALUES\n${values};`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${statements.join('\n\n')}\n`, 'utf8');

console.log(
  `[anncsu] ${streetRows.length} strade e ${addressRows.length} accessi di ${city}, CAP IPA ${postalReference.postalCode}, pronti in ${output}.`,
);
console.log(`[anncsu] versione ${sourceDate}, SHA-256 combinato ${combinedHash}.`);
console.log(`[ipa] versione ${postalReference.version}, SHA-256 riga selezionata ${postalReference.hash}.`);
