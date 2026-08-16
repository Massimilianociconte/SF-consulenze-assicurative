/**
 * Calcolo del codice fiscale da nome, cognome, data e luogo di nascita.
 *
 * Il codice fiscale base è deterministico: dati gli stessi elementi anagrafici,
 * il risultato è sempre lo stesso. Le regole di codifica sono quelle previste
 * dalla normativa italiana:
 *
 *   1-3    cognome: consonanti in ordine, poi vocali; se mancano, si riempie con X
 *   4-6    nome: se ha almeno quattro consonanti si prendono la 1ª, 3ª e 4ª,
 *          altrimenti valgono le stesse regole del cognome
 *   7-8    ultime due cifre dell'anno di nascita
 *   9      lettera del mese (A B C D E H L M P R S T)
 *   10-11  giorno di nascita, aumentato di 40 per le donne
 *   12-15  codice catastale (Belfiore) del comune o dello stato estero di nascita
 *   16     carattere di controllo
 *
 * Così l'utente non deve cercare la tessera sanitaria né usare siti esterni: il
 * calcolo avviene nel browser, con una tabella dei codici catastali servita dal
 * nostro dominio.
 *
 * ── Un avvertimento che l'interfaccia deve dare ─────────────────────────────
 * Esiste un caso in cui il codice calcolato non coincide con quello reale:
 * l'**omocodia**. Quando due persone otterrebbero lo stesso codice, l'Agenzia
 * delle Entrate ne assegna una variante sostituendo alcune cifre con lettere.
 * Nessun algoritmo può prevederlo, perché dipende da chi era già registrato.
 * Per questo il valore va sempre proposto come "calcolato, da confermare".
 */

import { fiscalCodeControlChar, isValidFiscalCode } from './italianCodes';

export type Sex = 'M' | 'F';

export interface FiscalCodeInput {
  firstName: string;
  lastName: string;
  /** Formato ISO: AAAA-MM-GG. */
  birthDate: string;
  sex: Sex;
  /** Codice catastale del comune o stato estero di nascita (es. H501, Z100). */
  belfioreCode: string;
}

export interface FiscalCodeBlock {
  label: string;
  value: string;
  explanation: string;
}

export interface FiscalCodeResult {
  code: string;
  /** Spiegazione blocco per blocco, mostrata all'utente. */
  blocks: FiscalCodeBlock[];
}

export class FiscalCodeError extends Error {
  constructor(
    readonly field: keyof FiscalCodeInput | 'generale',
    message: string,
  ) {
    super(message);
    this.name = 'FiscalCodeError';
  }
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
const MONTH_LETTERS = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'M', 'P', 'R', 'S', 'T'];

/**
 * Riduce una stringa alle sole lettere A-Z: gli accenti diventano la lettera
 * base (è → E), apostrofi e spazi spariscono. "D'Angelo" e "De Angelis"
 * vengono trattati come un'unica sequenza di lettere, come prevede la norma.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function splitLetters(value: string): { consonants: string[]; vowels: string[] } {
  const consonants: string[] = [];
  const vowels: string[] = [];
  for (const char of value) {
    if (VOWELS.has(char)) vowels.push(char);
    else consonants.push(char);
  }
  return { consonants, vowels };
}

/** Cognome: consonanti, poi vocali, riempimento con X. */
export function surnameCode(lastName: string): string {
  const letters = normalizeName(lastName);
  if (!letters) throw new FiscalCodeError('lastName', 'Inserisci il cognome.');
  const { consonants, vowels } = splitLetters(letters);
  return [...consonants, ...vowels, 'X', 'X', 'X'].slice(0, 3).join('');
}

/** Nome: con quattro o più consonanti si saltano la seconda. */
export function firstNameCode(firstName: string): string {
  const letters = normalizeName(firstName);
  if (!letters) throw new FiscalCodeError('firstName', 'Inserisci il nome.');
  const { consonants, vowels } = splitLetters(letters);

  if (consonants.length >= 4) {
    return `${consonants[0]}${consonants[2]}${consonants[3]}`;
  }
  return [...consonants, ...vowels, 'X', 'X', 'X'].slice(0, 3).join('');
}

/** Anno, mese e giorno (con il +40 femminile). */
export function birthCode(birthDate: string, sex: Sex): string {
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new FiscalCodeError('birthDate', 'Inserisci una data di nascita valida.');

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (month < 1 || month > 12) throw new FiscalCodeError('birthDate', 'Mese non valido.');

  const date = new Date(`${birthDate}T00:00:00Z`);
  if (date.getUTCDate() !== day || date.getUTCMonth() + 1 !== month) {
    throw new FiscalCodeError('birthDate', 'Questa data non esiste.');
  }
  if (date.getTime() > Date.now()) throw new FiscalCodeError('birthDate', 'La data di nascita è nel futuro.');
  if (year < 1900) throw new FiscalCodeError('birthDate', 'Data di nascita troppo remota.');

  const dayValue = sex === 'F' ? day + 40 : day;
  return `${String(year).slice(-2)}${MONTH_LETTERS[month - 1]}${String(dayValue).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

export function generateFiscalCode(input: FiscalCodeInput): FiscalCodeResult {
  const belfiore = input.belfioreCode.trim().toUpperCase();
  if (!/^[A-Z]\d{3}$/.test(belfiore)) {
    throw new FiscalCodeError('belfioreCode', 'Seleziona il comune o lo stato di nascita.');
  }
  if (input.sex !== 'M' && input.sex !== 'F') {
    throw new FiscalCodeError('sex', 'Indica il sesso come riportato all’anagrafe.');
  }

  const surname = surnameCode(input.lastName);
  const name = firstNameCode(input.firstName);
  const birth = birthCode(input.birthDate, input.sex);
  const partial = `${surname}${name}${birth}${belfiore}`;
  const control = fiscalCodeControlChar(partial);
  const code = partial + control;

  // Non dovrebbe mai accadere: è una rete di sicurezza sull'algoritmo stesso.
  if (!isValidFiscalCode(code)) {
    throw new FiscalCodeError('generale', 'Calcolo non riuscito: verifica i dati inseriti.');
  }

  const [, , month, day] = input.birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  const monthName = MONTH_NAMES[Number(month) - 1] ?? '';

  return {
    code,
    blocks: [
      {
        label: 'Cognome',
        value: surname,
        explanation: 'Prime tre consonanti del cognome; se non bastano si aggiungono le vocali.',
      },
      {
        label: 'Nome',
        value: name,
        explanation:
          normalizeName(input.firstName).replace(/[AEIOU]/g, '').length >= 4
            ? 'Il nome ha quattro o più consonanti: si prendono la prima, la terza e la quarta.'
            : 'Prime tre consonanti del nome; se non bastano si aggiungono le vocali.',
      },
      {
        label: 'Data di nascita',
        value: birth,
        explanation:
          `Anno ${input.birthDate.slice(0, 4)}, mese di ${monthName} (lettera ${birth[2]}), giorno ${Number(day)}` +
          (input.sex === 'F' ? ' aumentato di 40 perché il sesso è femminile.' : '.'),
      },
      {
        label: 'Luogo di nascita',
        value: belfiore,
        explanation: belfiore.startsWith('Z')
          ? 'Codice dello stato estero di nascita.'
          : 'Codice catastale del comune di nascita, valido alla tua data di nascita.',
      },
      {
        label: 'Controllo',
        value: control,
        explanation: 'Carattere calcolato dagli altri quindici: serve a rilevare errori di trascrizione.',
      },
    ],
  };
}

/* -------------------------------------------------------------------------
 * Luoghi di nascita
 * ---------------------------------------------------------------------- */

export interface BirthPlace {
  name: string;
  /** Sigla della provincia, oppure 'EE' per gli stati esteri. */
  province: string;
  code: string;
  validFrom: string | null;
  validTo: string | null;
}

type RawEntry = [string, string, string, string, string];
const MIN_BIRTH_PLACE_ENTRIES = 16_000;

let tablePromise: Promise<BirthPlace[]> | null = null;

/**
 * La tabella (circa 780 KB, 170 KB compressi) viene scaricata solo quando
 * qualcuno chiede di calcolare un codice fiscale, e poi resta in memoria.
 */
export async function loadBirthPlaces(): Promise<BirthPlace[]> {
  if (tablePromise) return tablePromise;

  tablePromise = fetch('/dati/belfiore.json')
    .then(async (response) => {
      if (!response.ok) throw new Error('Tabella dei comuni non disponibile.');
      const payload = (await response.json()) as { versione?: number; voci?: unknown[] };
      if (
        payload.versione !== 2 ||
        !Array.isArray(payload.voci) ||
        payload.voci.length < MIN_BIRTH_PLACE_ENTRIES
      ) {
        throw new Error('Tabella dei comuni incompleta.');
      }
      const places = payload.voci
        .filter(
          (entry): entry is RawEntry =>
            Array.isArray(entry) &&
            entry.length === 5 &&
            entry.every((value) => typeof value === 'string') &&
            entry[0].trim().length > 0 &&
            /^[A-Z]{2}$/.test(entry[1]) &&
            /^[A-Z]\d{3}$/.test(entry[2]) &&
            /^(?:|\d{4}-\d{2}-\d{2})$/.test(entry[3]) &&
            /^(?:|\d{4}-\d{2}-\d{2})$/.test(entry[4]),
        )
        .map(([name, province, code, from, to]) => ({
          name,
          province,
          code,
          validFrom: from || null,
          validTo: to || null,
        }));
      if (places.length !== payload.voci.length) throw new Error('Tabella dei comuni non valida.');
      return places;
    })
    .catch((error) => {
      tablePromise = null;
      throw error;
    });

  return tablePromise;
}

export function isBirthPlaceValidAt(place: BirthPlace, birthDate?: string): boolean {
  if (!birthDate) return !place.validTo; // senza data si mostrano solo i luoghi attuali
  if (place.validFrom && birthDate < place.validFrom) return false;
  if (place.validTo && birthDate > place.validTo) return false;
  return true;
}

/**
 * Ricerca pura su una tabella già caricata. È separata dal fetch così i confini
 * temporali dei comuni storici possono essere verificati senza dipendere dalla
 * rete.
 */
export function findBirthPlaces(
  places: BirthPlace[],
  query: string,
  birthDate?: string,
  limit = 12,
): BirthPlace[] {
  const needle = normalizeName(query);
  if (needle.length < 2) return [];

  const matches: Array<{ place: BirthPlace; rank: number }> = [];

  for (const place of places) {
    // Il codice Belfiore deve corrispondere al luogo com'era alla data di
    // nascita. Mostrare una denominazione cessata in un'altra epoca permetteva
    // di produrre un codice formalmente valido ma anagraficamente sbagliato.
    if (!isBirthPlaceValidAt(place, birthDate)) continue;

    const normalized = normalizeName(place.name);
    let rank: number;

    if (normalized === needle) rank = 0;
    else if (normalized.startsWith(needle)) rank = 1;
    else if (normalized.includes(needle)) rank = 2;
    else continue;

    matches.push({ place, rank });
  }

  return matches
    .sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name, 'it'))
    .slice(0, limit)
    .map((match) => match.place);
}

/**
 * Cerca il luogo di nascita. Se la data è nota, restituisce soltanto le
 * denominazioni valide *a quella data*: chi è nato in un comune poi soppresso
 * trova il nome di allora, con il codice giusto.
 */
export async function searchBirthPlaces(
  query: string,
  birthDate?: string,
  limit = 12,
): Promise<BirthPlace[]> {
  return findBirthPlaces(await loadBirthPlaces(), query, birthDate, limit);
}

/** Formatta un luogo per l'elenco a schermo. */
export function describeBirthPlace(place: BirthPlace, birthDate?: string): string {
  const where = place.province === 'EE' ? 'Stato estero' : `provincia di ${place.province}`;
  if (!place.validTo) return `${place.name} — ${where}`;

  const until = place.validTo.slice(0, 4);
  const applicable = isBirthPlaceValidAt(place, birthDate);
  return `${place.name} — ${where} · denominazione cessata nel ${until}${applicable ? ' (valida alla tua data di nascita)' : ''}`;
}
