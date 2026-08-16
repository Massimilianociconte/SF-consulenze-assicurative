import type { Context } from 'hono';
import type { AppEnv } from '../types';

/** Timestamp ISO-8601 UTC al secondo, formato usato in tutto il database. */
export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isoIn(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function isPast(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= Date.now();
}

export function clientIp(c: Context<AppEnv>): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export function userAgent(c: Context<AppEnv>): string {
  return (c.req.header('User-Agent') || '').slice(0, 500);
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** Errore applicativo con codice stabile: il frontend traduce/decide in base a `code`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, 'bad_request', message, details);
}

export function unauthorized(message = 'Accesso non autorizzato.'): ApiError {
  return new ApiError(401, 'unauthorized', message);
}

export function forbidden(message = 'Operazione non consentita.'): ApiError {
  return new ApiError(403, 'forbidden', message);
}

export function notFound(message = 'Risorsa non trovata.'): ApiError {
  return new ApiError(404, 'not_found', message);
}

export function tooManyRequests(message: string, retryAfter: number): ApiError {
  return new ApiError(429, 'rate_limited', message, { retryAfter });
}

/**
 * Riconosce la violazione di un indice univoco su D1 (es. due registrazioni
 * simultanee con la stessa email): va gestita come conflitto applicativo, non
 * come errore interno.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

/** Normalizza una stringa opzionale: '' e undefined diventano null (D1 non accetta undefined). */
export function nullify(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Consente solo redirect interni: evita open redirect tramite il parametro
 * `redirect` del flusso OAuth.
 */
export function safeInternalPath(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
