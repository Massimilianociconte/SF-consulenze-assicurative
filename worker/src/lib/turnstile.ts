import type { Env } from '../types';
import { badRequest } from './http';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verifica il token Turnstile.
 * Se `TURNSTILE_SECRET_KEY` non e' configurato la verifica viene saltata:
 * permette di lavorare in locale e di attivare la protezione bot in un secondo
 * momento senza modifiche al codice.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;

  if (!token) {
    throw badRequest('Verifica antibot non completata. Ricarica la pagina e riprova.');
  }

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (ip && ip !== 'unknown') body.append('remoteip', ip);

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body });
    const result = (await response.json()) as { success: boolean; 'error-codes'?: string[] };
    if (!result.success) {
      console.warn('[turnstile] verifica fallita', result['error-codes']);
      throw badRequest('Verifica antibot non superata. Ricarica la pagina e riprova.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('antibot')) throw error;
    console.error('[turnstile] errore di rete', error);
    throw badRequest('Verifica antibot non disponibile. Riprova fra poco.');
  }
}
