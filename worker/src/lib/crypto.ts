/**
 * Primitive crittografiche (WebCrypto, nativo nei Workers).
 *
 * ── Password ──────────────────────────────────────────────────────────────
 * Il piano gratuito Workers concede 10 ms di CPU per richiesta. Un PBKDF2 con
 * il numero di iterazioni raccomandato (centinaia di migliaia) ne consuma da
 * solo 20-30 ms: sul piano free il login verrebbe interrotto.
 *
 * Soluzione: derivazione assistita dal client.
 *   1. il browser calcola  D = PBKDF2(password, salt = SHA256("sfca-auth-v1:"+email), 200.000)
 *   2. al server arriva D, mai la password
 *   3. il server memorizza  PBKDF2(D, saltCasuale, 25.000)
 *
 * Il costo per chi tentasse un attacco a forza bruta su un database rubato
 * resta la somma dei due passaggi (225.000 iterazioni per tentativo), perche'
 * per provare una password deve comunque ricalcolare anche il primo. Il server
 * spende pero' ~3 ms invece di ~25 ms, e la password in chiaro non transita
 * nemmeno sul canale TLS.
 *
 * Nota per il futuro: i parametri del passaggio lato client sono versionati
 * ("v1") e pubblicati da /api/config. Cambiarli richiede una fase di
 * transizione (doppia derivazione o reimpostazione password), perche' il
 * browser deve usare gli stessi parametri con cui l'hash e' stato creato.
 */

/** Parametri della derivazione lato browser: devono restare allineati al frontend. */
export const CLIENT_KDF = {
  version: 1,
  algorithm: 'PBKDF2-SHA256',
  iterations: 250_000,
  saltPrefix: 'sfca-auth-v1:',
} as const;

/**
 * Iterazioni applicate dal server sul valore ricevuto dal client.
 *
 * Tenute basse di proposito: il percorso piu' costoso e' il cambio password,
 * che ne esegue due (verifica della password attuale + hash della nuova).
 * Con 15.000 iterazioni sono ~3 ms di CPU misurati in locale, quindi resta
 * margine ampio sotto i 10 ms concessi dal piano gratuito anche su hardware
 * piu' lento. Il costo per un attacco resta dato dalla somma con le 250.000
 * iterazioni svolte dal browser.
 */
const SERVER_ITERATIONS = 15_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

/** Lunghezza attesa del valore derivato dal client: 32 byte in base64url. */
const DERIVED_LENGTH = 43;

/**
 * Hash fittizio usato quando l'email non esiste: fa costare uguale un accesso
 * con utente inesistente e uno con password errata (anti-enumerazione).
 */
export const DUMMY_PASSWORD_HASH =
  'pbkdf2c$sha256$15000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

/** Token opaco casuale (default 32 byte = 256 bit di entropia). */
export function randomToken(bytes = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomId(): string {
  return crypto.randomUUID();
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256BytesHex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bytesToBase64Url(new Uint8Array(digest));
}

/** Confronto a tempo costante fra due stringhe. */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

async function deriveBits(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** Verifica che il valore arrivi davvero dalla derivazione lato client. */
export function isDerivedPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length === DERIVED_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Formato: pbkdf2c$sha256$<iterazioni server>$<salt b64url>$<hash b64url> */
export async function hashDerivedPassword(derived: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(derived, salt, SERVER_ITERATIONS);
  return `pbkdf2c$sha256$${SERVER_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export interface PasswordVerification {
  valid: boolean;
  /** true quando l'hash usa parametri inferiori a quelli attuali. */
  needsRehash: boolean;
}

/**
 * Verifica il valore derivato dal client contro l'hash memorizzato.
 *
 * Riconosce anche il formato `pbkdf2$` (derivazione interamente lato server),
 * usato prima del passaggio alla derivazione assistita. Attenzione: un hash
 * creato allora partiva dalla password in chiaro, quindi non puo' combaciare
 * con il valore derivato che arriva ora dal browser. Gli account eventualmente
 * creati con lo schema precedente devono passare dal recupero password.
 */
export async function verifyDerivedPassword(
  derived: string,
  stored: string,
): Promise<PasswordVerification> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[1] !== 'sha256') return { valid: false, needsRehash: false };

  const scheme = parts[0];
  if (scheme !== 'pbkdf2c' && scheme !== 'pbkdf2') return { valid: false, needsRehash: false };

  const iterations = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return { valid: false, needsRehash: false };

  let computed: Uint8Array;
  try {
    computed = await deriveBits(derived, base64UrlToBytes(parts[3]), iterations);
  } catch {
    return { valid: false, needsRehash: false };
  }

  const valid = timingSafeEqual(bytesToBase64Url(computed), parts[4]);
  return { valid, needsRehash: valid && (scheme !== 'pbkdf2c' || iterations < SERVER_ITERATIONS) };
}
