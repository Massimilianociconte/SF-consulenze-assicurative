/**
 * Estrazione dei dati dai documenti assicurativi.
 *
 * Tre passaggi, tutti nel browser dell'utente:
 *
 *   1. **Testo**. Dai PDF nativi si legge il livello di testo con pdf.js.
 *      Da fotografie e scansioni si ottiene con il riconoscimento ottico
 *      (`lib/ocr.ts`), anch'esso locale.
 *
 *   2. **Individuazione**. Espressioni regolari tarate sui documenti italiani,
 *      con priorità ai valori preceduti da un'etichetta esplicita
 *      ("codice fiscale:", "n. polizza", "targa"…).
 *
 *   3. **Validazione e correzione**. Qui sta la differenza rispetto a una
 *      semplice ricerca di schemi: quasi tutti i codici che interessano hanno
 *      un carattere o una cifra di controllo, quindi si può stabilire se un
 *      valore è *davvero* un codice fiscale e, quando l'OCR ha confuso O con 0
 *      o S con 5, ricostruire quello giusto (`lib/italianCodes.ts`).
 *      In più, i valori vengono confrontati con quelli già in archivio per quel
 *      cliente: se una lettura somiglia a un numero di polizza esistente, viene
 *      agganciata a quello.
 *
 * Nessun dato esce dal dispositivo e nulla viene salvato senza che l'utente
 * confermi campo per campo.
 */

import {
  decodeFiscalCode,
  isValidFiscalCode,
  isValidIban,
  isValidPlate,
  isValidVatNumber,
  normalizeCode,
  parseItalianAmount,
  parseItalianDate,
  repairFiscalCode,
  repairIban,
  repairPlate,
  repairVatNumber,
  snapToKnown,
} from './italianCodes';
import { recognizeImage, recognizeScannedPdf, type OcrProgress } from './ocr';

export type FieldKey =
  | 'fullName'
  | 'fiscalCode'
  | 'birthDate'
  | 'vatNumber'
  | 'clientCode'
  | 'policyNumber'
  | 'plate'
  | 'company'
  | 'effectiveDate'
  | 'expiryDate'
  | 'claimNumber'
  | 'amount'
  | 'phone'
  | 'email'
  | 'iban';

export type Confidence = 'alta' | 'media' | 'bassa';

export interface ExtractedField {
  key: FieldKey;
  label: string;
  value: string;
  confidence: Confidence;
  /** Frammento del documento attorno al valore, mostrato nella verifica. */
  context: string;
  /** Spiegazione in italiano di perché il valore è considerato attendibile. */
  reason: string;
  /** Valore letto prima della correzione, quando è stato corretto. */
  correctedFrom?: string;
}

export interface ExtractionContext {
  /** Numeri di polizza già presenti in archivio per questo cliente. */
  knownPolicyNumbers?: string[];
  knownPlates?: string[];
  /** Codice fiscale noto dell'intestatario: alza la fiducia se combacia. */
  knownFiscalCode?: string | null;
}

export interface ExtractionResult {
  fields: ExtractedField[];
  /** 'testo' = PDF con livello di testo, 'ocr' = riconoscimento ottico, 'nessuno' = niente da leggere. */
  source: 'testo' | 'ocr' | 'nessuno';
  characters: number;
  pages: number;
  /** Confidenza media dell'OCR, quando usato. */
  ocrConfidence?: number;
  elapsedMs: number;
}

const LABELS: Record<FieldKey, string> = {
  fullName: 'Nome e cognome',
  fiscalCode: 'Codice fiscale',
  birthDate: 'Data di nascita',
  vatNumber: 'Partita IVA',
  clientCode: 'Codice cliente',
  policyNumber: 'Numero di polizza',
  plate: 'Targa',
  company: 'Compagnia',
  effectiveDate: 'Decorrenza',
  expiryDate: 'Scadenza',
  claimNumber: 'Numero sinistro',
  amount: 'Importo',
  phone: 'Telefono',
  email: 'Email',
  iban: 'IBAN',
};

const COMPANIES = [
  'Generali', 'Allianz', 'UnipolSai', 'AXA', 'Zurich', 'Reale Mutua', 'Cattolica',
  'Groupama', 'HDI', 'Vittoria', 'Sara', 'ITAS', 'Helvetia', 'Assimoco',
  'Net Insurance', 'Europ Assistance', 'Verti', 'Genertel', 'Quixa', 'ConTe',
];

/* -------------------------------------------------------------------------
 * Ricerca per etichetta
 * ---------------------------------------------------------------------- */

/**
 * Espressioni con etichetta: un valore preceduto da "codice fiscale:" vale
 * molto più dello stesso valore trovato a caso nel testo. Le varianti coprono
 * le abbreviazioni usate nei moduli (C.F., cod. fisc., n° polizza…).
 */
const LABELLED: Partial<Record<FieldKey, RegExp>> = {
  fiscalCode: /(?:codice\s*fiscale|cod(?:ice)?\.?\s*fisc\.?|c\.?\s?f\.?)[\s:.\-]{0,6}([A-Z0-9]{16})/i,
  vatNumber: /(?:partita\s*iva|p\.?\s?iva|p\.?\s?i\.?)[\s:.\-]{0,6}(\d{11})/i,
  clientCode:
    /(?:codice\s*cliente|cod(?:ice)?\.?\s*cli(?:ente)?|n[°.]?\s*cliente|customer\s*(?:id|code))[\s:.\-]{0,6}([A-Z0-9][A-Z0-9\/.-]{3,19})/i,
  policyNumber:
    /(?:polizza|contratto)\s*(?:n(?:umero|r)?[°.\s]*)?[:\s.\-]{0,4}([A-Z0-9][A-Z0-9\/.-]{4,24})/i,
  claimNumber:
    /(?:sinistro)\s*(?:n(?:umero|r)?[°.\s]*)?[:\s.\-]{0,4}([A-Z0-9][A-Z0-9\/.-]{3,24})/i,
  plate: /(?:targa|veicolo\s*targato)[\s:.\-]{0,6}([A-Z0-9]{2}\s?[A-Z0-9]{3}\s?[A-Z0-9]{2})/i,
  effectiveDate:
    /(?:decorrenza|effetto|valida\s*dal|dalle\s*ore\s*24\s*del|dal)[\s:.\-]{0,8}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
  expiryDate:
    /(?:scadenza|scade\s*il|fino\s*al|al\s*giorno)[\s:.\-]{0,8}(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
  fullName:
    /(?:contraente|assicurato|intestatario|cognome\s*e\s*nome|sig\.?r?a?)[\s:.\-]{0,6}([A-ZÀ-Ù][A-Za-zÀ-ù']+(?:\s+[A-ZÀ-Ù][A-Za-zÀ-ù']+){1,3})/,
  amount: /(?:premio|importo|totale\s*da\s*pagare|danno)[\s:.\-]{0,10}(?:€\s*)?([\d.]{1,12},\d{2})/i,
  iban: /(?:iban|coordinate\s*bancarie)[\s:.\-]{0,6}([A-Z0-9\s]{27,34})/i,
};

/** Schemi riconoscibili anche senza etichetta. */
const BARE = {
  fiscalCode: /\b[A-Z0-9]{16}\b/g,
  vatNumber: /\b\d{11}\b/g,
  plate: /\b[A-Z]{2}\s?\d{3}\s?[A-Z]{2}\b/g,
  iban: /\bIT[A-Z0-9\s]{25,32}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(?:\+39\s?)?(?:0\d{1,3}[\s.\-]?\d{5,8}|3\d{2}[\s.\-]?\d{6,7})\b/g,
  amount: /(?:€|EUR)\s?([\d.]{1,12},\d{2})|\b([\d.]{1,12},\d{2})\s?(?:€|EUR)/g,
};

function contextAround(text: string, value: string): string {
  const index = text.toUpperCase().indexOf(value.toUpperCase());
  if (index < 0) return '';
  const start = Math.max(0, index - 45);
  const end = Math.min(text.length, index + value.length + 45);
  return `…${text.slice(start, end).replace(/\s+/g, ' ').trim()}…`;
}

/* -------------------------------------------------------------------------
 * Estrazione
 * ---------------------------------------------------------------------- */

class FieldCollector {
  private readonly fields = new Map<FieldKey, ExtractedField>();

  constructor(private readonly text: string) {}

  /** Registra un campo solo se migliora quello già presente. */
  add(
    key: FieldKey,
    value: string,
    confidence: Confidence,
    reason: string,
    extra: { correctedFrom?: string } = {},
  ): void {
    const clean = value.trim();
    if (!clean) return;

    const rank: Record<Confidence, number> = { alta: 3, media: 2, bassa: 1 };
    const existing = this.fields.get(key);
    if (existing && rank[existing.confidence] >= rank[confidence]) return;

    this.fields.set(key, {
      key,
      label: LABELS[key],
      value: clean,
      confidence,
      context: contextAround(this.text, extra.correctedFrom ?? clean),
      reason,
      ...extra,
    });
  }

  has(key: FieldKey): boolean {
    return this.fields.has(key);
  }

  get(key: FieldKey): ExtractedField | undefined {
    return this.fields.get(key);
  }

  toArray(): ExtractedField[] {
    const order: FieldKey[] = [
      'fullName', 'fiscalCode', 'birthDate', 'vatNumber', 'clientCode', 'policyNumber',
      'plate', 'company', 'effectiveDate', 'expiryDate', 'claimNumber', 'amount',
      'iban', 'phone', 'email',
    ];
    return order.map((key) => this.fields.get(key)).filter((field): field is ExtractedField => Boolean(field));
  }
}

/** Codice fiscale: valida, e se serve corregge, spiegando cosa è stato fatto. */
function collectFiscalCode(
  collector: FieldCollector,
  raw: string,
  labelled: boolean,
  context: ExtractionContext,
): void {
  const candidate = normalizeCode(raw);
  if (candidate.length !== 16) return;

  if (isValidFiscalCode(candidate)) {
    const known = context.knownFiscalCode && normalizeCode(context.knownFiscalCode) === candidate;
    collector.add(
      'fiscalCode',
      candidate,
      'alta',
      known
        ? 'Carattere di controllo valido e corrispondente al codice fiscale in archivio.'
        : labelled
          ? 'Preceduto dall’etichetta “codice fiscale” e con carattere di controllo valido.'
          : 'Carattere di controllo valido.',
    );
    return;
  }

  const repaired = repairFiscalCode(candidate);
  if (repaired && repaired.substitutions <= 3) {
    collector.add(
      'fiscalCode',
      repaired.code,
      repaired.substitutions <= 1 ? 'media' : 'bassa',
      `Lettura corretta in ${repaired.substitutions} ${repaired.substitutions === 1 ? 'carattere' : 'caratteri'} ` +
        '(sostituzioni tipiche dell’OCR) fino a far tornare il carattere di controllo.',
      { correctedFrom: candidate },
    );
  }
}

function collectPlate(collector: FieldCollector, raw: string, labelled: boolean, context: ExtractionContext): void {
  const candidate = normalizeCode(raw);
  if (candidate.length !== 7) return;

  const known = context.knownPlates?.length ? snapToKnown(candidate, context.knownPlates, 2) : null;
  if (known) {
    collector.add(
      'plate',
      normalizeCode(known.matched),
      'alta',
      known.distance === 0
        ? 'Corrisponde alla targa di una tua polizza.'
        : 'Quasi identica alla targa di una tua polizza: agganciata a quella.',
      known.distance > 0 ? { correctedFrom: candidate } : {},
    );
    return;
  }

  if (isValidPlate(candidate)) {
    collector.add(
      'plate',
      candidate,
      labelled ? 'alta' : 'media',
      labelled ? 'Preceduta dall’etichetta “targa” e con formato valido.' : 'Formato targa valido.',
    );
    return;
  }

  const repaired = repairPlate(candidate);
  if (repaired && repaired.substitutions <= 2) {
    collector.add(
      'plate',
      repaired.code,
      'bassa',
      `Formato ricostruito correggendo ${repaired.substitutions} ${repaired.substitutions === 1 ? 'carattere' : 'caratteri'}.`,
      { correctedFrom: candidate },
    );
  }
}

function collectPolicyNumber(collector: FieldCollector, raw: string, context: ExtractionContext): void {
  const candidate = raw.trim().replace(/\s+/g, '');
  if (candidate.length < 5) return;

  const known = context.knownPolicyNumbers?.length ? snapToKnown(candidate, context.knownPolicyNumbers, 2) : null;
  if (known) {
    collector.add(
      'policyNumber',
      known.matched,
      'alta',
      known.distance === 0
        ? 'Corrisponde a una polizza già presente nella tua posizione.'
        : 'Quasi identico a una tua polizza: agganciato a quello in archivio.',
      known.distance > 0 ? { correctedFrom: candidate } : {},
    );
    return;
  }

  collector.add('policyNumber', candidate, 'media', 'Preceduto dall’etichetta “polizza” nel documento.');
}

/** Applica le regole al testo, con il contesto del cliente per gli agganci. */
export function extractFields(text: string, context: ExtractionContext = {}): ExtractedField[] {
  const collector = new FieldCollector(text);
  const normalized = text.replace(/ /g, ' ');
  const upper = normalized.toUpperCase();

  // 1. Valori con etichetta esplicita.
  for (const [key, pattern] of Object.entries(LABELLED) as Array<[FieldKey, RegExp]>) {
    const match = normalized.match(pattern) ?? upper.match(pattern);
    const captured = match?.[1];
    if (!captured) continue;

    switch (key) {
      case 'fiscalCode':
        collectFiscalCode(collector, captured, true, context);
        break;
      case 'plate':
        collectPlate(collector, captured, true, context);
        break;
      case 'policyNumber':
        collectPolicyNumber(collector, captured, context);
        break;
      case 'vatNumber': {
        const code = normalizeCode(captured);
        if (isValidVatNumber(code)) {
          collector.add('vatNumber', code, 'alta', 'Cifra di controllo della partita IVA valida.');
        } else {
          const repaired = repairVatNumber(code);
          if (repaired) {
            collector.add('vatNumber', repaired.code, 'bassa', 'Ricostruita fino a far tornare la cifra di controllo.', {
              correctedFrom: code,
            });
          }
        }
        break;
      }
      case 'iban': {
        const code = normalizeCode(captured);
        if (isValidIban(code)) {
          collector.add('iban', code, 'alta', 'Controllo IBAN (resto 97) superato.');
        } else {
          const repaired = repairIban(code);
          if (repaired) {
            collector.add('iban', repaired.code, 'bassa', 'Ricostruito fino a superare il controllo IBAN.', {
              correctedFrom: code,
            });
          }
        }
        break;
      }
      case 'effectiveDate':
      case 'expiryDate': {
        const iso = parseItalianDate(captured);
        if (iso) collector.add(key, iso, 'alta', 'Data preceduta dalla sua etichetta nel documento.');
        break;
      }
      case 'amount': {
        const amount = parseItalianAmount(captured);
        if (amount !== null) {
          collector.add('amount', captured.trim(), 'alta', 'Importo preceduto da “premio”, “importo” o “danno”.');
        }
        break;
      }
      case 'clientCode':
        collector.add('clientCode', captured.trim().toUpperCase(), 'alta', 'Preceduto dall’etichetta “codice cliente”.');
        break;
      case 'claimNumber':
        collector.add('claimNumber', captured.trim().toUpperCase(), 'alta', 'Preceduto dall’etichetta “sinistro”.');
        break;
      case 'fullName':
        collector.add('fullName', captured.replace(/\s+/g, ' ').trim(), 'media', 'Indicato come contraente o assicurato.');
        break;
      default:
        break;
    }
  }

  // 2. Schemi riconoscibili da soli, usati solo dove manca il valore etichettato.
  if (!collector.has('fiscalCode')) {
    for (const candidate of upper.match(BARE.fiscalCode) ?? []) {
      collectFiscalCode(collector, candidate, false, context);
      if (collector.get('fiscalCode')?.confidence === 'alta') break;
    }
  }

  if (!collector.has('plate')) {
    for (const candidate of upper.match(BARE.plate) ?? []) {
      collectPlate(collector, candidate, false, context);
      if (collector.get('plate')?.confidence === 'alta') break;
    }
  }

  if (!collector.has('vatNumber')) {
    for (const candidate of normalized.match(BARE.vatNumber) ?? []) {
      if (isValidVatNumber(candidate)) {
        collector.add('vatNumber', candidate, 'media', 'Cifra di controllo della partita IVA valida.');
        break;
      }
    }
  }

  if (!collector.has('iban')) {
    for (const candidate of upper.match(BARE.iban) ?? []) {
      const code = normalizeCode(candidate);
      if (isValidIban(code)) {
        collector.add('iban', code, 'media', 'Controllo IBAN (resto 97) superato.');
        break;
      }
    }
  }

  const email = normalized.match(BARE.email);
  if (email?.[0]) collector.add('email', email[0], 'media', 'Formato di indirizzo email valido.');

  const phone = normalized.match(BARE.phone);
  if (phone?.[0]) collector.add('phone', phone[0].trim(), 'bassa', 'Sequenza compatibile con un numero italiano.');

  const company = COMPANIES.find((name) => upper.includes(name.toUpperCase()));
  if (company) collector.add('company', company, 'media', 'Nome della compagnia riconosciuto nel testo.');

  if (!collector.has('amount')) {
    const amounts = [...normalized.matchAll(BARE.amount)]
      .map((match) => match[1] ?? match[2])
      .filter(Boolean)
      .map((value) => ({ value, numeric: parseItalianAmount(value) ?? 0 }))
      .sort((a, b) => b.numeric - a.numeric);
    if (amounts[0]) {
      collector.add('amount', amounts[0].value, 'bassa', 'Importo più alto trovato nel documento.');
    }
  }

  // 3. Dati derivati: dal codice fiscale si ottiene la data di nascita senza
  //    che nessuno la debba digitare.
  const fiscalCode = collector.get('fiscalCode');
  if (fiscalCode) {
    const decoded = decodeFiscalCode(fiscalCode.value);
    if (decoded.birthDate) {
      collector.add(
        'birthDate',
        decoded.birthDate,
        fiscalCode.confidence === 'alta' ? 'alta' : 'media',
        'Ricavata dal codice fiscale, non letta dal documento.',
      );
    }
  }

  return collector.toArray();
}

/* -------------------------------------------------------------------------
 * Lettura dei file
 * ---------------------------------------------------------------------- */

/** Legge il livello di testo di un PDF (documenti generati al computer). */
async function readPdfText(file: Blob, maxPages = 5): Promise<{ text: string; pages: number }> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document_ = await loadingTask.promise;
  const pages = Math.min(document_.numPages, maxPages);

  let text = '';
  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    const page = await document_.getPage(pageNumber);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
  }

  const total = document_.numPages;
  await loadingTask.destroy();
  return { text: text.trim(), pages: total };
}

export interface ExtractOptions {
  context?: ExtractionContext;
  /** Consenso esplicito all'uso del riconoscimento ottico (scarica ~5 MB la prima volta). */
  allowOcr?: boolean;
  onProgress?: (progress: OcrProgress) => void;
}

/**
 * Punto unico di ingresso.
 *
 * PDF con testo → lettura diretta (immediata, nessun download aggiuntivo).
 * PDF scansionati e immagini → riconoscimento ottico, ma solo se l'utente lo
 * ha chiesto: è lui a decidere se attivare l'elaborazione.
 */
export async function extractFromFile(file: File | Blob, options: ExtractOptions = {}): Promise<ExtractionResult> {
  const startedAt = performance.now();
  const context = options.context ?? {};
  const type = (file as File).type || '';

  if (type === 'application/pdf') {
    const { text, pages } = await readPdfText(file);

    // Un PDF con pochissimo testo è una scansione.
    if (text.length > 60) {
      return {
        fields: extractFields(text, context),
        source: 'testo',
        characters: text.length,
        pages,
        elapsedMs: Math.round(performance.now() - startedAt),
      };
    }

    if (!options.allowOcr) {
      return { fields: [], source: 'nessuno', characters: text.length, pages, elapsedMs: 0 };
    }

    const ocr = await recognizeScannedPdf(file, 2, options.onProgress);
    return {
      fields: extractFields(ocr.text, context),
      source: 'ocr',
      characters: ocr.text.length,
      pages,
      ocrConfidence: ocr.confidence,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  if (type.startsWith('image/')) {
    if (!options.allowOcr) {
      return { fields: [], source: 'nessuno', characters: 0, pages: 1, elapsedMs: 0 };
    }
    const ocr = await recognizeImage(file, options.onProgress);
    return {
      fields: extractFields(ocr.text, context),
      source: 'ocr',
      characters: ocr.text.length,
      pages: 1,
      ocrConfidence: ocr.confidence,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  return { fields: [], source: 'nessuno', characters: 0, pages: 0, elapsedMs: 0 };
}
