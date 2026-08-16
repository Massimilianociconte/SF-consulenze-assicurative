import type { Env } from '../types';
import { isoIn, nowIso, tooManyRequests } from './http';

/**
 * Rate limit a finestra fissa su D1.
 *
 * Perche' non KV: il piano gratuito consente 1.000 scritture al giorno. Un
 * singolo tentativo di forzatura le esaurirebbe, e da quel momento fallirebbero
 * anche le scritture legittime. D1 non ha quel tetto ed e' fortemente
 * consistente, quindi il conteggio e' esatto anche con richieste in parallelo.
 *
 * Si consuma quota solo sugli eventi costosi o falliti (login errato,
 * registrazione, invio email): un accesso riuscito non scrive nulla.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

interface RateLimitRow {
  count: number;
  reset_at: string;
}

export async function rateLimit(
  env: Env,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = nowIso();
  const resetAt = isoIn(windowSeconds);

  // UPSERT atomico: se la finestra e' scaduta riparte da 1, altrimenti
  // incrementa. RETURNING evita una seconda query di lettura.
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at, updated_at)
     VALUES (?1, 1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at <= ?3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ?3 THEN ?2 ELSE rate_limits.reset_at END,
       updated_at = ?3
     RETURNING count, reset_at`,
  )
    .bind(key, resetAt, now)
    .first<RateLimitRow>();

  if (!row) return { allowed: true, remaining: max - 1, retryAfter: 0 };

  const retryAfter = Math.max(1, Math.ceil((Date.parse(row.reset_at) - Date.now()) / 1000));
  return {
    allowed: row.count <= max,
    remaining: Math.max(0, max - row.count),
    retryAfter,
  };
}

/** Come `rateLimit`, ma interrompe la richiesta con un 429 quando la soglia e' superata. */
export async function enforceRateLimit(
  env: Env,
  key: string,
  max: number,
  windowSeconds: number,
  message = 'Troppi tentativi.',
): Promise<void> {
  const result = await rateLimit(env, key, max, windowSeconds);
  if (!result.allowed) {
    const minutes = Math.max(1, Math.ceil(result.retryAfter / 60));
    throw tooManyRequests(`${message} Riprova fra ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}.`, result.retryAfter);
  }
}

/**
 * Verifica una soglia senza consumare quota (nessuna scrittura).
 * Usata sul login: il contatore viene incrementato solo quando il tentativo
 * falisce, cosi' un utente che accede correttamente non scrive nulla.
 */
export async function assertNotLimited(
  env: Env,
  key: string,
  max: number,
  message = 'Troppi tentativi.',
): Promise<void> {
  const row = await env.DB.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<RateLimitRow>();

  if (!row) return;
  const remainingMs = Date.parse(row.reset_at) - Date.now();
  if (remainingMs <= 0) return; // finestra scaduta: il record verra' riusato o rimosso dal cron
  if (row.count < max) return;

  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  throw tooManyRequests(
    `${message} Riprova fra ${minutes} ${minutes === 1 ? 'minuto' : 'minuti'}.`,
    Math.ceil(remainingMs / 1000),
  );
}

/** Incrementa il contatore dopo un tentativo fallito. */
export async function recordFailure(env: Env, key: string, windowSeconds: number): Promise<void> {
  await rateLimit(env, key, Number.MAX_SAFE_INTEGER, windowSeconds);
}

/** Azzera un contatore (es. dopo un accesso riuscito). */
export async function resetRateLimit(env: Env, key: string): Promise<void> {
  await env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}

/** Rimuove le finestre scadute. Invocata dal cron di manutenzione. */
export async function purgeExpiredRateLimits(env: Env): Promise<number> {
  const result = await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(nowIso()).run();
  return result.meta?.changes ?? 0;
}
