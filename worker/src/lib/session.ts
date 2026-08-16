import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { AppEnv, AuthUser, Env, Role } from '../types';
import { randomToken, sha256Hex } from './crypto';
import { clientIp, isoIn, nowIso, userAgent } from './http';

/**
 * Sessioni su D1.
 *
 * Non si usa KV: sul piano gratuito consente 1.000 scritture al giorno e ha
 * consistenza eventuale (fino a ~60 s perche' una revoca si propaghi a tutti i
 * data center). Per dati assicurativi conta di piu' che "esci da tutti i
 * dispositivi" abbia effetto immediato, quindi la sessione vive su D1, che e'
 * fortemente consistente e senza tetto giornaliero di scritture.
 *
 * Costo per richiesta autenticata: una sola query, che restituisce insieme
 * sessione e utente.
 */

export const SESSION_COOKIE = 'sf_session';

/** Inattivita' massima prima della scadenza. */
const IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Durata massima assoluta, anche con uso continuo. */
const ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
/**
 * La scadenza viene prolungata solo quando manca meno di questo margine:
 * evita una UPDATE su ogni richiesta.
 */
const RENEW_THRESHOLD_SECONDS = 24 * 60 * 60;

/**
 * `secure` segue il protocollo della richiesta: in produzione e' sempre https,
 * mentre in sviluppo su http://localhost un cookie Secure verrebbe scartato da
 * alcuni browser (Safari), rendendo impossibile provare l'accesso in locale.
 */
function cookieOptions(c: Context<AppEnv>, maxAge: number) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
  };
}

export interface CreateSessionInput {
  userId: string;
  email: string;
  role: Role;
  authMethod: 'password' | 'google';
}

export async function createSession(c: Context<AppEnv>, input: CreateSessionInput): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, absolute_expiry, ip, user_agent, auth_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      input.userId,
      now,
      now,
      isoIn(IDLE_TTL_SECONDS),
      isoIn(ABSOLUTE_TTL_SECONDS),
      clientIp(c),
      userAgent(c),
      input.authMethod,
    )
    .run();

  setCookie(c, SESSION_COOKIE, token, cookieOptions(c, IDLE_TTL_SECONDS));
  return tokenHash;
}

export interface LoadedSession {
  id: string;
  user: AuthUser;
  authMethod: 'password' | 'google';
  createdAt: string;
  expiresAt: string;
}

interface SessionJoinRow {
  session_id: string;
  auth_method: 'password' | 'google';
  session_created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  absolute_expiry: string;
  user_id: string;
  email: string;
  role: Role;
  status: string;
  email_verified_at: string | null;
  first_name: string | null;
  last_name: string | null;
  advisor_id: string | null;
}

/**
 * Legge la sessione dal cookie e, nella stessa query, l'utente collegato.
 * Le condizioni di validita' (non revocata, non scaduta, utente attivo) sono
 * nella WHERE: una riga restituita e' gia' una sessione valida.
 */
export async function loadSession(c: Context<AppEnv>): Promise<LoadedSession | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length < 20 || token.length > 200) return null;

  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  const row = await c.env.DB.prepare(
    `SELECT s.id            AS session_id,
            s.auth_method   AS auth_method,
            s.created_at    AS session_created_at,
            s.last_seen_at  AS last_seen_at,
            s.expires_at    AS expires_at,
            s.absolute_expiry AS absolute_expiry,
            u.id            AS user_id,
            u.email         AS email,
            u.role          AS role,
            u.status        AS status,
            u.email_verified_at AS email_verified_at,
            u.first_name    AS first_name,
            u.last_name     AS last_name,
            u.advisor_id    AS advisor_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?
       AND s.absolute_expiry > ?
       AND u.status = 'active'
       AND u.deleted_at IS NULL`,
  )
    .bind(tokenHash, now, now)
    .first<SessionJoinRow>();

  if (!row) {
    // Cookie presente ma sessione non valida: si rimuove per non ripetere la
    // query a ogni richiesta successiva.
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return null;
  }

  const loaded: LoadedSession = {
    id: row.session_id,
    authMethod: row.auth_method,
    createdAt: row.session_created_at,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      email: row.email,
      role: row.role,
      status: row.status,
      emailVerified: Boolean(row.email_verified_at),
      firstName: row.first_name,
      lastName: row.last_name,
      advisorId: row.advisor_id,
    },
  };

  // Rolling session: prolunga solo quando la scadenza si avvicina.
  const remaining = (Date.parse(row.expires_at) - Date.now()) / 1000;
  if (remaining < IDLE_TTL_SECONDS - RENEW_THRESHOLD_SECONDS) {
    const absoluteRemaining = Math.floor((Date.parse(row.absolute_expiry) - Date.now()) / 1000);
    const ttl = Math.max(60, Math.min(IDLE_TTL_SECONDS, absoluteRemaining));
    const newExpiry = isoIn(ttl);
    await c.env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?')
      .bind(now, newExpiry, row.session_id)
      .run();
    setCookie(c, SESSION_COOKIE, token, cookieOptions(c, ttl));
    loaded.expiresAt = newExpiry;
  }

  return loaded;
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  if (!token) return;
  await revokeSession(c.env, await sha256Hex(token));
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(nowIso(), sessionId)
    .run();
}

/**
 * Revoca tutte le sessioni di un utente (cambio password, reset, sospensione).
 * Una sola UPDATE: con D1 l'effetto e' immediato su tutti i data center.
 */
export async function destroyAllSessions(env: Env, userId: string, exceptId?: string): Promise<number> {
  const now = nowIso();
  const result = exceptId
    ? await env.DB.prepare(
        'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?',
      )
        .bind(now, userId, exceptId)
        .run()
    : await env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
        .bind(now, userId)
        .run();

  return result.meta?.changes ?? 0;
}
