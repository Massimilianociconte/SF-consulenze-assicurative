import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Role, UserRow } from '../types';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  randomId,
  randomToken,
  sha256Base64Url,
  timingSafeEqual,
} from '../lib/crypto';
import { ApiError, clientIp, normalizeEmail, nowIso, safeInternalPath, userAgent } from '../lib/http';
import { enforceRateLimit } from '../lib/ratelimit';
import { auditInBackground } from '../lib/audit';
import { createSession } from '../lib/session';
import { PRIVACY_VERSION } from './auth';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'sf_oauth';
const STATE_TTL_SECONDS = 600;
const TOKEN_TIMEOUT_MS = 8000;

/**
 * Stato del flusso OAuth in un cookie HttpOnly invece che in KV: non consuma
 * scritture (il piano gratuito ne concede 1.000 al giorno), non lascia residui
 * da ripulire e non introduce consistenza eventuale. Il verifier PKCE e' un
 * segreto del client, quindi tenerlo nel suo cookie e' corretto; il cookie e'
 * HttpOnly, per cui una pagina di terzi non puo' leggerlo ne' impostarlo.
 */
interface OAuthState {
  state: string;
  verifier: string;
  redirect: string;
}

function encodeState(value: OAuthState): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function decodeState(raw: string | undefined): OAuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw))) as OAuthState;
    if (!parsed?.state || !parsed?.verifier) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean | string;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

const google = new Hono<AppEnv>();

function redirectUri(c: { env: AppEnv['Bindings'] }): string {
  return `${c.env.APP_URL.replace(/\/$/, '')}/api/auth/google/callback`;
}

function decodeJwtPayload(token: string): GoogleIdTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('id_token malformato');
  // TextDecoder e non atob diretto: i nomi possono contenere caratteri non ASCII.
  const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
  return JSON.parse(json) as GoogleIdTokenClaims;
}

// ---------------------------------------------------------------------------
// Avvio del flusso: Authorization Code + PKCE
// ---------------------------------------------------------------------------
google.get('/start', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    throw new ApiError(503, 'google_not_configured', 'Accesso con Google non ancora configurato.');
  }
  await enforceRateLimit(c.env, `oauth:start:${clientIp(c)}`, 20, 900);

  const state = randomToken(24);
  const verifier = randomToken(32);
  const challenge = await sha256Base64Url(verifier);
  const redirect = safeInternalPath(c.req.query('redirect'), '/area-riservata');

  setCookie(c, STATE_COOKIE, encodeState({ state, verifier, redirect }), {
    httpOnly: true,
    // Come per il cookie di sessione: Secure solo su https, per non impedire
    // le prove in locale su http://localhost.
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/api/auth/google',
    maxAge: STATE_TTL_SECONDS,
  });

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri(c));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'online');
  url.searchParams.set('prompt', 'select_account');

  return c.redirect(url.toString(), 302);
});

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------
google.get('/callback', async (c) => {
  const appUrl = c.env.APP_URL.replace(/\/$/, '');
  const fail = (reason: string) => c.redirect(`${appUrl}/accedi?errore=${encodeURIComponent(reason)}`, 302);

  const stored = decodeState(getCookie(c, STATE_COOKIE));
  deleteCookie(c, STATE_COOKIE, { path: '/api/auth/google' });

  const queryState = c.req.query('state');
  const code = c.req.query('code');
  const oauthError = c.req.query('error');

  if (oauthError) return fail(oauthError === 'access_denied' ? 'google_annullato' : 'google_errore');
  if (!stored) return fail('google_sessione_scaduta');
  if (!code || !queryState || !timingSafeEqual(queryState, stored.state)) {
    return fail('google_stato_non_valido');
  }
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) return fail('google_non_configurato');

  let claims: GoogleIdTokenClaims;
  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri(c),
        code_verifier: stored.verifier,
      }),
      // Senza timeout un endpoint lento bloccherebbe la richiesta dell'utente.
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });

    if (!tokenResponse.ok) {
      console.error('[google] scambio code fallito', tokenResponse.status, await tokenResponse.text());
      return fail('google_scambio_fallito');
    }

    const tokens = (await tokenResponse.json()) as { id_token?: string };
    if (!tokens.id_token) return fail('google_token_mancante');

    // L'id_token arriva direttamente dall'endpoint token su canale TLS
    // autenticato con il client secret: per OpenID Connect (sezione 3.1.3.7)
    // la verifica della firma non e' richiesta in questo flusso, ma iss/aud/exp
    // vanno comunque controllati.
    claims = decodeJwtPayload(tokens.id_token);
  } catch (error) {
    console.error('[google] errore nel flusso OAuth', error);
    return fail('google_errore');
  }

  const validIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!validIssuer || claims.aud !== c.env.GOOGLE_CLIENT_ID || claims.exp * 1000 <= Date.now()) {
    return fail('google_token_non_valido');
  }
  if (!claims.email || !emailVerified) return fail('google_email_non_verificata');

  const ip = clientIp(c);
  const ua = userAgent(c);
  const emailNormalized = normalizeEmail(claims.email);
  const now = nowIso();

  // 1) identita' gia' collegata
  let user = await c.env.DB.prepare(
    `SELECT u.* FROM users u
     JOIN oauth_identities i ON i.user_id = u.id
     WHERE i.provider = 'google' AND i.provider_user_id = ? AND u.deleted_at IS NULL`,
  )
    .bind(claims.sub)
    .first<UserRow>();

  if (user) {
    await c.env.DB.prepare(
      'UPDATE oauth_identities SET last_used_at = ?, email = ? WHERE provider = ? AND provider_user_id = ?',
    )
      .bind(now, claims.email, 'google', claims.sub)
      .run();
  } else {
    // 2) utente esistente con la stessa email: collega l'identita'.
    //    Sicuro perche' Google ha gia' verificato l'indirizzo.
    user = await c.env.DB.prepare('SELECT * FROM users WHERE email_normalized = ? AND deleted_at IS NULL')
      .bind(emailNormalized)
      .first<UserRow>();

    if (!user) {
      // 3) nuovo utente: anagrafica e consensi in un solo batch (transazione).
      const userId = randomId();
      try {
        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT INTO users (id, email, email_normalized, email_verified_at, role, status,
                                first_name, last_name, tos_accepted_at, privacy_accepted_at, privacy_version,
                                created_at, updated_at)
             VALUES (?, ?, ?, ?, 'client', 'active', ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            userId,
            claims.email,
            emailNormalized,
            now,
            claims.given_name ?? claims.name ?? null,
            claims.family_name ?? null,
            now,
            now,
            PRIVACY_VERSION,
            now,
            now,
          ),
          c.env.DB.prepare(
            `INSERT INTO consents (id, user_id, kind, granted, version, ip, user_agent, created_at)
             VALUES (?, ?, 'privacy', 1, ?, ?, ?, ?)`,
          ).bind(randomId(), userId, PRIVACY_VERSION, ip, ua, now),
          c.env.DB.prepare(
            `INSERT INTO consents (id, user_id, kind, granted, version, ip, user_agent, created_at)
             VALUES (?, ?, 'termini', 1, ?, ?, ?, ?)`,
          ).bind(randomId(), userId, PRIVACY_VERSION, ip, ua, now),
        ]);
      } catch (error) {
        // Corsa fra due callback simultanei con la stessa email: si rilegge la
        // riga creata dall'altro, invece di restituire un errore.
        console.warn('[google] creazione utente non riuscita, nuovo tentativo di lettura', error);
      }

      user =
        (await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>()) ??
        (await c.env.DB.prepare('SELECT * FROM users WHERE email_normalized = ? AND deleted_at IS NULL')
          .bind(emailNormalized)
          .first<UserRow>());
      if (!user) return fail('google_errore');
    }

    await c.env.DB.prepare(
      `INSERT INTO oauth_identities (id, user_id, provider, provider_user_id, email, display_name, picture_url, created_at, last_used_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(randomId(), user.id, claims.sub, claims.email, claims.name ?? null, claims.picture ?? null, now, now)
      .run();

    // L'accesso con Google conferma l'indirizzo anche per gli account nati con password.
    if (!user.email_verified_at) {
      await c.env.DB.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?')
        .bind(now, now, user.id)
        .run();
    }
  }

  if (user.status !== 'active') return fail('account_sospeso');

  await c.env.DB.prepare(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?',
  )
    .bind(now, ip, now, user.id)
    .run();

  await createSession(c, {
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    authMethod: 'google',
  });

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email_normalized,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    ip,
    userAgent: ua,
    metadata: { method: 'google' },
  });

  return c.redirect(`${appUrl}${safeInternalPath(stored.redirect, '/area-riservata')}`, 302);
});

export default google;
