import type { PasswordKdf } from './api';

/**
 * Derivazione della password nel browser.
 *
 * Al server non viene mai inviata la password in chiaro: si invia
 *   D = PBKDF2-SHA256(password, salt = SHA256(saltPrefix + email), iterazioni)
 * e il server memorizza a sua volta un PBKDF2 di D con un salt casuale.
 *
 * Due effetti: il costo per un attacco a forza bruta resta alto anche se il
 * database venisse rubato, e il Worker consuma pochi millisecondi di CPU
 * (il piano Cloudflare gratuito ne concede 10 per richiesta).
 *
 * Il salt e' derivato dall'email — come fanno i gestori di password — perche'
 * deve essere ricalcolabile dal browser al momento dell'accesso senza chiedere
 * nulla al server.
 */

const DEFAULT_KDF: PasswordKdf = {
  version: 1,
  algorithm: 'PBKDF2-SHA256',
  iterations: 250_000,
  saltPrefix: 'sfca-auth-v1:',
};

export class PasswordDerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordDerivationError';
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function derivePassword(
  kdf: PasswordKdf | null | undefined,
  email: string,
  password: string,
): Promise<string> {
  const params = kdf ?? DEFAULT_KDF;

  if (!globalThis.crypto?.subtle) {
    // Succede solo fuori da un contesto sicuro (http non locale) o su browser
    // molto vecchi: meglio un messaggio chiaro che un errore incomprensibile.
    throw new PasswordDerivationError(
      'Il browser non supporta le funzioni di sicurezza necessarie. Aggiorna il browser o aprilo su connessione sicura (https).',
    );
  }

  const encoder = new TextEncoder();
  const saltSource = `${params.saltPrefix}${email.trim().toLowerCase()}`;
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(saltSource)));

  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: params.iterations },
    key,
    256,
  );

  return toBase64Url(new Uint8Array(bits));
}

/**
 * Requisiti minimi della password.
 *
 * Il controllo e' necessariamente qui: il server riceve solo il valore
 * derivato e non puo' piu' esaminare il testo. Restituisce null se va bene,
 * altrimenti il messaggio da mostrare.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'La password deve avere almeno 10 caratteri.';
  if (password.length > 128) return 'La password non puo’ superare 128 caratteri.';
  if (!/[A-Za-z]/.test(password)) return 'La password deve contenere almeno una lettera.';
  if (!/\d/.test(password)) return 'La password deve contenere almeno un numero.';
  return null;
}
