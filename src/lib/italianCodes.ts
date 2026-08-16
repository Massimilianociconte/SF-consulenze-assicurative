/**
 * Validazione e correzione dei codici italiani.
 *
 * È la parte "intelligente" del riconoscimento documenti, e non usa alcun
 * modello di intelligenza artificiale: sfrutta il fatto che quasi tutti i codici
 * che ci interessano contengono una cifra o un carattere di controllo.
 *
 *   codice fiscale → carattere di controllo (algoritmo del MEF)
 *   partita IVA    → cifra di controllo (algoritmo di Luhn all'italiana)
 *   IBAN           → resto della divisione per 97 (ISO 13616)
 *   targa          → forma rigida: lettere e cifre in posizioni fisse
 *
 * Questo permette due cose che di solito si chiedono a un modello:
 *
 *  1. **distinguere un codice vero da una sequenza casuale**: se il controllo
 *     non torna, quel dato non viene proposto, e si evitano i falsi positivi
 *     che rendono inutile un riconoscimento automatico;
 *
 *  2. **correggere gli errori di lettura**: l'OCR confonde sistematicamente
 *     O con 0, I con 1, S con 5, B con 8. Sapendo in quale posizione ci vuole
 *     una lettera e in quale una cifra, la sostituzione giusta è quasi sempre
 *     obbligata; nei casi ambigui si prova un numero limitato di combinazioni e
 *     si tiene quella che soddisfa il controllo.
 *
 * Dal codice fiscale si ricavano inoltre data di nascita e sesso, che così non
 * devono essere digitati.
 */

/* -------------------------------------------------------------------------
 * Sostituzioni tipiche dell'OCR
 * ---------------------------------------------------------------------- */

/** Cifra letta al posto di una lettera. */
const DIGIT_TO_LETTER: Record<string, string[]> = {
  '0': ['O', 'D', 'Q'],
  '1': ['I', 'L', 'T'],
  '2': ['Z'],
  '3': ['E'],
  '4': ['A'],
  '5': ['S'],
  '6': ['G', 'C'],
  '7': ['T', 'Y'],
  '8': ['B'],
  '9': ['G', 'P'],
};

/** Lettera letta al posto di una cifra. */
const LETTER_TO_DIGIT: Record<string, string[]> = {
  O: ['0'],
  Q: ['0'],
  D: ['0'],
  I: ['1'],
  L: ['1'],
  J: ['1'],
  Z: ['2'],
  E: ['3'],
  A: ['4'],
  S: ['5'],
  G: ['6', '9'],
  C: ['6'],
  T: ['7'],
  Y: ['7'],
  B: ['8'],
  P: ['9'],
};

const isLetter = (char: string) => char >= 'A' && char <= 'Z';
const isDigit = (char: string) => char >= '0' && char <= '9';

/**
 * Genera i candidati compatibili con una "forma": L = lettera, D = cifra,
 * X = indifferente. Le posizioni già coerenti restano intatte; per quelle
 * incoerenti si provano le sostituzioni plausibili.
 *
 * Il numero di combinazioni è limitato (`maxCandidates`) perché una stringa
 * molto sporca non deve far esplodere il calcolo nel browser.
 */
function candidatesByShape(value: string, shape: string, maxCandidates = 512): string[] {
  if (value.length !== shape.length) return [];

  let candidates = [''];

  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    const expected = shape[index];
    let options: string[];

    if (expected === 'L') {
      options = isLetter(char) ? [char] : (DIGIT_TO_LETTER[char] ?? []);
    } else if (expected === 'D') {
      options = isDigit(char) ? [char] : (LETTER_TO_DIGIT[char] ?? []);
    } else {
      options = [char];
    }

    if (options.length === 0) return [];

    const next: string[] = [];
    for (const prefix of candidates) {
      for (const option of options) {
        next.push(prefix + option);
        if (next.length >= maxCandidates) break;
      }
      if (next.length >= maxCandidates) break;
    }
    candidates = next;
  }

  return candidates;
}

/* -------------------------------------------------------------------------
 * Codice fiscale
 * ---------------------------------------------------------------------- */

const CF_ODD: Record<string, number> = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const CF_EVEN: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

/** Sostituzioni da omocodia: cifre rimpiazzate da lettere quando due persone avrebbero lo stesso codice. */
const OMOCODIA_TO_DIGIT: Record<string, string> = {
  L: '0', M: '1', N: '2', P: '3', Q: '4', R: '5', S: '6', T: '7', U: '8', V: '9',
};

/** Forma del codice fiscale: 6 lettere, 2 cifre, 1 lettera, 2 cifre, 1 lettera, 3 cifre, 1 lettera. */
const CF_SHAPE = 'LLLLLLDDLDDLDDDL';
/** Nelle posizioni numeriche l'omocodia ammette anche lettere: si accetta l'una o l'altra forma. */
const CF_OMOCODIA_POSITIONS = [6, 7, 9, 10, 12, 13, 14];

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Calcola il carattere di controllo dai primi 15 caratteri. */
export function fiscalCodeControlChar(first15: string): string {
  let sum = 0;
  for (let index = 0; index < 15; index++) {
    const char = first15[index];
    // Le posizioni si contano da 1: la prima è dispari.
    sum += index % 2 === 0 ? (CF_ODD[char] ?? 0) : (CF_EVEN[char] ?? 0);
  }
  return String.fromCharCode(65 + (sum % 26));
}

export function isValidFiscalCode(value: string): boolean {
  const code = normalizeCode(value);
  if (code.length !== 16) return false;

  for (let index = 0; index < 16; index++) {
    const char = code[index];
    const expected = CF_SHAPE[index];
    if (expected === 'L' && !isLetter(char)) return false;
    if (expected === 'D' && !isDigit(char) && !(CF_OMOCODIA_POSITIONS.includes(index) && char in OMOCODIA_TO_DIGIT)) {
      return false;
    }
  }

  return code[15] === fiscalCodeControlChar(code.slice(0, 15));
}

/**
 * Prova a ricostruire un codice fiscale letto male.
 * Restituisce il codice corretto e quante sostituzioni sono servite, oppure
 * null se nessuna combinazione soddisfa il carattere di controllo.
 */
export function repairFiscalCode(value: string): { code: string; substitutions: number } | null {
  const raw = normalizeCode(value);
  if (raw.length !== 16) return null;
  if (isValidFiscalCode(raw)) return { code: raw, substitutions: 0 };

  // Forma "rilassata": nelle posizioni da omocodia va bene sia cifra sia lettera.
  const shape = CF_SHAPE.split('')
    .map((expected, index) => (CF_OMOCODIA_POSITIONS.includes(index) && !isDigit(raw[index]) && raw[index] in OMOCODIA_TO_DIGIT ? 'X' : expected))
    .join('');

  const candidates = candidatesByShape(raw, shape);
  let best: { code: string; substitutions: number } | null = null;

  for (const candidate of candidates) {
    if (!isValidFiscalCode(candidate)) continue;
    const substitutions = [...candidate].filter((char, index) => char !== raw[index]).length;
    if (!best || substitutions < best.substitutions) best = { code: candidate, substitutions };
  }

  // Ultimo tentativo: il carattere di controllo stesso può essere stato letto
  // male. Se i primi 15 caratteri hanno forma valida, lo si ricalcola.
  if (!best) {
    const head = raw.slice(0, 15);
    const headShape = shape.slice(0, 15);
    for (const candidate of candidatesByShape(head, headShape)) {
      const control = fiscalCodeControlChar(candidate);
      const full = candidate + control;
      if (!isValidFiscalCode(full)) continue;
      const substitutions = [...full].filter((char, index) => char !== raw[index]).length;
      if (!best || substitutions < best.substitutions) best = { code: full, substitutions };
    }
  }

  return best;
}

const CF_MONTHS: Record<string, string> = {
  A: '01', B: '02', C: '03', D: '04', E: '05', H: '06',
  L: '07', M: '08', P: '09', R: '10', S: '11', T: '12',
};

export interface FiscalCodeData {
  birthDate: string | null;
  sex: 'M' | 'F' | null;
  /** Codice catastale del comune di nascita (utile al consulente per i controlli). */
  birthPlaceCode: string | null;
}

/** Ricava data di nascita e sesso dal codice fiscale: dati che l'utente non deve più digitare. */
export function decodeFiscalCode(value: string): FiscalCodeData {
  const code = normalizeCode(value);
  if (!isValidFiscalCode(code)) return { birthDate: null, sex: null, birthPlaceCode: null };

  const digitAt = (index: number): string => {
    const char = code[index];
    return isDigit(char) ? char : (OMOCODIA_TO_DIGIT[char] ?? '0');
  };

  const yearTwoDigits = Number.parseInt(`${digitAt(6)}${digitAt(7)}`, 10);
  const month = CF_MONTHS[code[8]];
  const dayRaw = Number.parseInt(`${digitAt(9)}${digitAt(10)}`, 10);
  if (!month || Number.isNaN(dayRaw)) return { birthDate: null, sex: null, birthPlaceCode: null };

  const sex: 'M' | 'F' = dayRaw > 40 ? 'F' : 'M';
  const day = sex === 'F' ? dayRaw - 40 : dayRaw;
  if (day < 1 || day > 31) return { birthDate: null, sex: null, birthPlaceCode: null };

  // Il codice fiscale porta solo due cifre dell'anno: il secolo è ambiguo.
  // Regole, nell'ordine: un anno che cadrebbe nel futuro è certamente del
  // Novecento; e chi compare su un documento assicurativo come intestatario o
  // conducente ha almeno sedici anni, quindi a parità di ambiguità si sceglie
  // il Novecento. Il valore viene comunque proposto all'utente per conferma.
  const currentYear = new Date().getFullYear();
  const asTwoThousands = 2000 + yearTwoDigits;
  const year = asTwoThousands > currentYear || currentYear - asTwoThousands < 16 ? 1900 + yearTwoDigits : asTwoThousands;

  return {
    birthDate: `${year}-${month}-${String(day).padStart(2, '0')}`,
    sex,
    birthPlaceCode: code.slice(11, 15),
  };
}

/* -------------------------------------------------------------------------
 * Partita IVA
 * ---------------------------------------------------------------------- */

export function isValidVatNumber(value: string): boolean {
  const code = normalizeCode(value);
  if (!/^\d{11}$/.test(code)) return false;

  let sum = 0;
  for (let index = 0; index < 11; index++) {
    const digit = Number.parseInt(code[index], 10);
    if (index % 2 === 0) {
      sum += digit;
    } else {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
  }
  return sum % 10 === 0;
}

export function repairVatNumber(value: string): { code: string; substitutions: number } | null {
  const raw = normalizeCode(value);
  if (raw.length !== 11) return null;
  if (isValidVatNumber(raw)) return { code: raw, substitutions: 0 };

  let best: { code: string; substitutions: number } | null = null;
  for (const candidate of candidatesByShape(raw, 'D'.repeat(11))) {
    if (!isValidVatNumber(candidate)) continue;
    const substitutions = [...candidate].filter((char, index) => char !== raw[index]).length;
    if (!best || substitutions < best.substitutions) best = { code: candidate, substitutions };
  }
  return best;
}

/* -------------------------------------------------------------------------
 * IBAN
 * ---------------------------------------------------------------------- */

export function isValidIban(value: string): boolean {
  const code = normalizeCode(value);
  if (code.length < 15 || code.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(code)) return false;
  // Un IBAN italiano ha esattamente 27 caratteri.
  if (code.startsWith('IT') && code.length !== 27) return false;

  const rearranged = code.slice(4) + code.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const numeric = isDigit(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of numeric) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export function repairIban(value: string): { code: string; substitutions: number } | null {
  const raw = normalizeCode(value);
  if (raw.length !== 27 || !raw.startsWith('IT')) return null;
  if (isValidIban(raw)) return { code: raw, substitutions: 0 };

  // IT + 2 cifre di controllo + CIN (lettera) + ABI (5) + CAB (5) + conto (12).
  const shape = 'LLDDLDDDDDDDDDDDXXXXXXXXXXXX';
  let best: { code: string; substitutions: number } | null = null;
  for (const candidate of candidatesByShape(raw, shape.slice(0, 27))) {
    if (!isValidIban(candidate)) continue;
    const substitutions = [...candidate].filter((char, index) => char !== raw[index]).length;
    if (!best || substitutions < best.substitutions) best = { code: candidate, substitutions };
  }
  return best;
}

/* -------------------------------------------------------------------------
 * Targa
 * ---------------------------------------------------------------------- */

/** Formato attuale (dal 1994): due lettere, tre cifre, due lettere. */
const PLATE_SHAPE = 'LLDDDLL';
/** Lettere non usate nelle targhe italiane, perché confondibili. */
const PLATE_FORBIDDEN = /[IOQU]/;

export function isValidPlate(value: string): boolean {
  const code = normalizeCode(value);
  if (code.length !== 7) return false;
  if (!/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(code)) return false;
  return !PLATE_FORBIDDEN.test(code[0] + code[1] + code[5] + code[6]);
}

export function repairPlate(value: string): { code: string; substitutions: number } | null {
  const raw = normalizeCode(value);
  if (raw.length !== 7) return null;
  if (isValidPlate(raw)) return { code: raw, substitutions: 0 };

  let best: { code: string; substitutions: number } | null = null;
  for (const candidate of candidatesByShape(raw, PLATE_SHAPE)) {
    if (!isValidPlate(candidate)) continue;
    const substitutions = [...candidate].filter((char, index) => char !== raw[index]).length;
    if (!best || substitutions < best.substitutions) best = { code: candidate, substitutions };
  }
  return best;
}

/* -------------------------------------------------------------------------
 * Aggancio ai dati già noti
 * ---------------------------------------------------------------------- */

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Aggancia un valore letto a uno già presente in archivio (numero di polizza,
 * targa, codice cliente). Se la distanza è minima, quasi certamente è lo stesso
 * codice letto male: meglio proporre quello corretto che uno storpiato.
 */
export function snapToKnown(
  value: string,
  known: string[],
  maxDistance = 2,
): { matched: string; distance: number } | null {
  const needle = normalizeCode(value);
  if (needle.length < 4) return null;

  let best: { matched: string; distance: number } | null = null;
  for (const candidate of known) {
    const normalized = normalizeCode(candidate);
    if (!normalized) continue;
    // Una differenza di lunghezza marcata non è un errore di lettura.
    if (Math.abs(normalized.length - needle.length) > maxDistance) continue;

    const distance = levenshtein(needle, normalized);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { matched: candidate, distance };
    }
  }
  return best;
}

/* -------------------------------------------------------------------------
 * Date e importi
 * ---------------------------------------------------------------------- */

/** Converte una data italiana (gg/mm/aaaa, anche con lettura imprecisa) in formato ISO. */
export function parseItalianDate(value: string): string | null {
  const cleaned = value.replace(/[.\-\s]/g, '/');
  const match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) return null;

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  let year = Number.parseInt(match[3], 10);
  if (match[3].length === 2) year += year > 50 ? 1900 : 2000;

  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  // Fuori da questo intervallo non è una data di un documento assicurativo.
  if (year < 1900 || year > new Date().getFullYear() + 30) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  // Scarta il 31 febbraio e simili.
  if (parsed.getUTCDate() !== day || parsed.getUTCMonth() + 1 !== month) return null;
  return iso;
}

/** Converte un importo italiano (1.234,56) in numero. */
export function parseItalianAmount(value: string): number | null {
  const cleaned = value.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
