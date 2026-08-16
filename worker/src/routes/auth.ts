import { Hono } from 'hono';
import type { AppEnv, Role, UserRow } from '../types';
import {
  DUMMY_PASSWORD_HASH,
  hashDerivedPassword,
  randomId,
  randomToken,
  sha256Hex,
  verifyDerivedPassword,
} from '../lib/crypto';
import {
  ApiError,
  clientIp,
  isPast,
  isoIn,
  isUniqueConstraintError,
  normalizeEmail,
  nowIso,
  nullify,
  unauthorized,
  userAgent,
} from '../lib/http';
import { assertNotLimited, enforceRateLimit, recordFailure, resetRateLimit } from '../lib/ratelimit';
import { audit, auditInBackground } from '../lib/audit';
import { verifyTurnstile } from '../lib/turnstile';
import {
  sendExistingAccountEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../lib/mail';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  parseJson,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../lib/validation';
import { createSession, destroyAllSessions, destroySession } from '../lib/session';
import { requireAuth } from '../middleware/auth';

const VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const RESET_TOKEN_TTL_SECONDS = 60 * 60;
const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 15;
const LOGIN_WINDOW_SECONDS = 15 * 60;
export const PRIVACY_VERSION = '1.0';

const auth = new Hono<AppEnv>();

/** Messaggio unico per registrazione/recupero: non rivela se l'email esiste. */
const GENERIC_EMAIL_SENT =
  'Se l’indirizzo indicato e’ utilizzabile, riceverai a breve un’email con le istruzioni. Controlla anche la cartella spam.';

async function findUserByEmail(c: { env: AppEnv['Bindings'] }, email: string): Promise<UserRow | null> {
  return c.env.DB.prepare('SELECT * FROM users WHERE email_normalized = ? AND deleted_at IS NULL')
    .bind(normalizeEmail(email))
    .first<UserRow>();
}

/**
 * Genera un token monouso e invalida i precedenti dello stesso tipo.
 * Le due scritture stanno in un unico batch: o valgono entrambe o nessuna,
 * cosi' non si arriva mai a uno stato con due token attivi.
 */
async function issueToken(
  c: { env: AppEnv['Bindings'] },
  userId: string,
  type: 'email_verify' | 'password_reset',
  ttlSeconds: number,
  ip: string,
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND type = ? AND used_at IS NULL',
    ).bind(now, userId, type),
    c.env.DB.prepare(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(randomId(), userId, type, tokenHash, isoIn(ttlSeconds), ip, now),
  ]);

  return token;
}

/**
 * Consuma un token: la UPDATE condizionata garantisce che due richieste
 * contemporanee non possano usare lo stesso link due volte (la seconda trova
 * `changes = 0`).
 */
async function consumeToken(
  c: { env: AppEnv['Bindings'] },
  token: string,
  type: 'email_verify' | 'password_reset',
): Promise<string> {
  const tokenHash = await sha256Hex(token);
  const now = nowIso();

  const row = await c.env.DB.prepare(
    `UPDATE auth_tokens SET used_at = ?1
     WHERE token_hash = ?2 AND type = ?3 AND used_at IS NULL AND expires_at > ?1
     RETURNING user_id`,
  )
    .bind(now, tokenHash, type)
    .first<{ user_id: string }>();

  if (!row) {
    throw new ApiError(400, 'invalid_token', 'Link non valido o scaduto. Richiedine uno nuovo.');
  }
  return row.user_id;
}

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    emailVerified: Boolean(row.email_verified_at),
    firstName: row.first_name,
    lastName: row.last_name,
    hasPassword: Boolean(row.password_hash),
  };
}

// ---------------------------------------------------------------------------
// Registrazione
// ---------------------------------------------------------------------------
auth.post('/register', async (c) => {
  const ip = clientIp(c);
  // 10 all'ora per indirizzo IP: piu' di cosi' non serve a un cliente in buona
  // fede, e la soglia resta compatibile con piu' persone dietro la stessa linea
  // (uno studio, una famiglia, una rete aziendale).
  await enforceRateLimit(c.env, `register:ip:${ip}`, 10, 3600, 'Troppe registrazioni da questo dispositivo.');

  const body = await parseJson(c, registerSchema);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const emailNormalized = normalizeEmail(body.email);
  await enforceRateLimit(c.env, `register:email:${emailNormalized}`, 3, 3600, 'Troppi tentativi per questo indirizzo.');

  const existing = await findUserByEmail(c, emailNormalized);
  if (existing) {
    // Risposta identica al caso "nuovo utente": chi tenta la registrazione non
    // scopre se l'indirizzo e' gia' registrato. Il titolare legittimo riceve
    // un avviso con il link per reimpostare la password.
    if (existing.password_hash) {
      const token = await issueToken(c, existing.id, 'password_reset', RESET_TOKEN_TTL_SECONDS, ip);
      await sendExistingAccountEmail(
        c.env,
        existing.email,
        `${c.env.APP_URL}/reimposta-password?token=${encodeURIComponent(token)}`,
      );
    } else {
      await sendExistingAccountEmail(c.env, existing.email, `${c.env.APP_URL}/accedi`);
    }
    auditInBackground(c, {
      action: 'auth.register.duplicate',
      entityType: 'user',
      entityId: existing.id,
      outcome: 'failure',
      ip,
      userAgent: userAgent(c),
    });
    return c.json({ ok: true, message: GENERIC_EMAIL_SENT });
  }

  const userId = randomId();
  const now = nowIso();
  const passwordHash = await hashDerivedPassword(body.passwordDerived);
  const verifyToken = randomToken(32);
  const verifyTokenHash = await sha256Hex(verifyToken);

  // Utente, consensi e token di verifica in un solo batch: D1 lo esegue come
  // transazione, quindi non esistono utenti creati a metà.
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO users (id, email, email_normalized, password_hash, password_changed_at, role, status,
                          first_name, last_name, phone, tos_accepted_at, privacy_accepted_at, privacy_version,
                          marketing_consent, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'client', 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      userId,
      body.email.trim(),
      emailNormalized,
      passwordHash,
      now,
      body.firstName,
      body.lastName,
      nullify(body.phone),
      now,
      now,
      PRIVACY_VERSION,
      body.marketingConsent ? 1 : 0,
      now,
      now,
    ),
    c.env.DB.prepare(
      `INSERT INTO auth_tokens (id, user_id, type, token_hash, expires_at, created_ip, created_at)
       VALUES (?, ?, 'email_verify', ?, ?, ?, ?)`,
    ).bind(randomId(), userId, verifyTokenHash, isoIn(VERIFY_TOKEN_TTL_SECONDS), ip, now),
  ];

  for (const consent of [
    { kind: 'privacy', granted: 1 },
    { kind: 'termini', granted: 1 },
    { kind: 'marketing', granted: body.marketingConsent ? 1 : 0 },
  ]) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO consents (id, user_id, kind, granted, version, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(randomId(), userId, consent.kind, consent.granted, PRIVACY_VERSION, ip, userAgent(c), now),
    );
  }

  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    // Due registrazioni simultanee con la stessa email: l'indice univoco
    // blocca la seconda. Si risponde come nel caso "email gia' presente",
    // senza esporre un errore tecnico.
    if (isUniqueConstraintError(error)) {
      return c.json({ ok: true, message: GENERIC_EMAIL_SENT });
    }
    throw error;
  }

  await sendVerificationEmail(
    c.env,
    body.email.trim(),
    body.firstName,
    `${c.env.APP_URL}/verifica-email?token=${encodeURIComponent(verifyToken)}`,
  );

  auditInBackground(c, {
    actorId: userId,
    actorEmail: emailNormalized,
    action: 'auth.register',
    entityType: 'user',
    entityId: userId,
    ip,
    userAgent: userAgent(c),
  });

  // Nessun accesso automatico: la sessione parte dopo la conferma dell'email,
  // cosi' la risposta e' indistinguibile da quella del caso "email esistente".
  return c.json({ ok: true, message: GENERIC_EMAIL_SENT });
});

// ---------------------------------------------------------------------------
// Accesso
// ---------------------------------------------------------------------------
auth.post('/login', async (c) => {
  const ip = clientIp(c);
  const body = await parseJson(c, loginSchema);
  const emailNormalized = normalizeEmail(body.email);

  const ipKey = `login:ip:${ip}`;
  const emailKey = `login:email:${emailNormalized}`;

  // Controllo senza scrittura: un accesso riuscito non consuma quota.
  await assertNotLimited(c.env, ipKey, 30, 'Troppi tentativi di accesso da questo dispositivo.');
  await assertNotLimited(c.env, emailKey, 10, 'Troppi tentativi per questo account.');

  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const user = await findUserByEmail(c, emailNormalized);

  // Si verifica sempre un hash, anche fittizio: i tempi di risposta non
  // distinguono un'email inesistente da una password errata.
  const storedHash = user?.password_hash ?? DUMMY_PASSWORD_HASH;
  const { valid, needsRehash } = await verifyDerivedPassword(body.passwordDerived, storedHash);

  const failLogin = async (reason: string, error: ApiError) => {
    await Promise.all([
      recordFailure(c.env, ipKey, LOGIN_WINDOW_SECONDS),
      recordFailure(c.env, emailKey, LOGIN_WINDOW_SECONDS),
    ]);
    auditInBackground(c, {
      actorId: user?.id ?? null,
      actorEmail: emailNormalized,
      action: 'auth.login',
      outcome: 'failure',
      ip,
      userAgent: userAgent(c),
      metadata: { reason },
    });
    throw error;
  };

  if (!user) await failLogin('unknown_email', unauthorized('Email o password non corretti.'));

  if (user!.status !== 'active') {
    await failLogin(
      'account_not_active',
      new ApiError(403, 'account_suspended', 'Account sospeso. Contatta il consulente per riattivarlo.'),
    );
  }

  if (user!.locked_until && !isPast(user!.locked_until)) {
    await failLogin(
      'account_locked',
      new ApiError(
        423,
        'account_locked',
        'Account temporaneamente bloccato per troppi tentativi errati. Riprova fra qualche minuto o reimposta la password.',
      ),
    );
  }

  if (!user!.password_hash) {
    // Account creato con Google. Senza questo messaggio l'utente resterebbe
    // bloccato senza capire il motivo: e' un compromesso consapevole rispetto
    // all'anti-enumerazione, che resta attiva su tutti gli altri percorsi.
    throw new ApiError(
      409,
      'use_google',
      'Questo indirizzo accede con Google. Usa il pulsante “Continua con Google”, oppure imposta una password dal recupero credenziali.',
    );
  }

  if (!valid) {
    const failed = user!.failed_login_count + 1;
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? isoIn(LOCK_MINUTES * 60) : null;
    await c.env.DB.prepare(
      'UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?',
    )
      .bind(failed, lockedUntil, nowIso(), user!.id)
      .run();
    await failLogin(
      lockedUntil ? 'wrong_password_locked' : 'wrong_password',
      unauthorized('Email o password non corretti.'),
    );
  }

  const now = nowIso();
  const updates = [
    c.env.DB.prepare(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?',
    ).bind(now, ip, now, user!.id),
  ];
  if (needsRehash) {
    updates.push(
      c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(
        await hashDerivedPassword(body.passwordDerived),
        user!.id,
      ),
    );
  }
  await c.env.DB.batch(updates);

  await createSession(c, {
    userId: user!.id,
    email: user!.email,
    role: user!.role as Role,
    authMethod: 'password',
  });

  // Il contatore per account viene azzerato solo dopo un accesso riuscito.
  await resetRateLimit(c.env, emailKey);

  auditInBackground(c, {
    actorId: user!.id,
    actorEmail: emailNormalized,
    action: 'auth.login',
    entityType: 'user',
    entityId: user!.id,
    ip,
    userAgent: userAgent(c),
    metadata: { method: 'password' },
  });

  return c.json({ ok: true, user: publicUser(user!) });
});

// ---------------------------------------------------------------------------
// Sessione corrente
// ---------------------------------------------------------------------------
auth.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ authenticated: false, user: null });

  const row = await c.env.DB.prepare(
    `SELECT u.*, (SELECT 1 FROM oauth_identities i WHERE i.user_id = u.id AND i.provider = 'google' LIMIT 1) AS google_linked
     FROM users u WHERE u.id = ?`,
  )
    .bind(user.id)
    .first<UserRow & { google_linked: number | null }>();

  if (!row) return c.json({ authenticated: false, user: null });

  // Completamento profilo: guida l'utente a inserire i dati che servono al
  // consulente per lavorare le pratiche.
  const profileFields = [row.first_name, row.last_name, row.phone ?? row.mobile, row.fiscal_code, row.address_city];
  const filled = profileFields.filter(Boolean).length;

  return c.json({
    authenticated: true,
    user: {
      ...publicUser(row),
      marketingConsent: Boolean(row.marketing_consent),
      googleLinked: Boolean(row.google_linked),
      profileCompletion: Math.round((filled / profileFields.length) * 100),
      memberSince: row.created_at,
    },
  });
});

auth.post('/logout', async (c) => {
  const user = c.get('user');
  await destroySession(c);
  if (user) {
    auditInBackground(c, {
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.logout',
      ip: clientIp(c),
      userAgent: userAgent(c),
    });
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Verifica indirizzo email
// ---------------------------------------------------------------------------
auth.post('/verify-email', async (c) => {
  const ip = clientIp(c);
  await enforceRateLimit(c.env, `verify:ip:${ip}`, 20, 3600);

  const body = await parseJson(c, verifyEmailSchema);
  const userId = await consumeToken(c, body.token, 'email_verify');

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(userId)
    .first<UserRow>();
  if (!user) throw new ApiError(400, 'invalid_token', 'Link non valido. Richiedine uno nuovo.');
  if (user.status !== 'active') {
    throw new ApiError(403, 'account_suspended', 'Account sospeso. Contatta il consulente.');
  }

  if (!user.email_verified_at) {
    await c.env.DB.prepare('UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?')
      .bind(nowIso(), nowIso(), user.id)
      .run();
  }

  // La conferma prova il possesso dell'indirizzo: l'utente entra direttamente.
  await createSession(c, {
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    authMethod: 'password',
  });

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email_normalized,
    action: 'auth.email_verified',
    entityType: 'user',
    entityId: user.id,
    ip,
    userAgent: userAgent(c),
  });

  return c.json({ ok: true, user: { ...publicUser(user), emailVerified: true } });
});

auth.post('/resend-verification', async (c) => {
  const ip = clientIp(c);
  await enforceRateLimit(c.env, `resend:ip:${ip}`, 5, 3600, 'Troppe richieste di invio.');

  const body = await parseJson(c, resendVerificationSchema);
  const emailNormalized = normalizeEmail(body.email);
  await enforceRateLimit(c.env, `resend:email:${emailNormalized}`, 3, 3600, 'Troppe richieste per questo indirizzo.');

  const user = await findUserByEmail(c, emailNormalized);
  if (user && !user.email_verified_at && user.status === 'active') {
    const token = await issueToken(c, user.id, 'email_verify', VERIFY_TOKEN_TTL_SECONDS, ip);
    await sendVerificationEmail(
      c.env,
      user.email,
      user.first_name,
      `${c.env.APP_URL}/verifica-email?token=${encodeURIComponent(token)}`,
    );
  }

  return c.json({ ok: true, message: GENERIC_EMAIL_SENT });
});

// ---------------------------------------------------------------------------
// Recupero e reimpostazione password
// ---------------------------------------------------------------------------
auth.post('/forgot-password', async (c) => {
  const ip = clientIp(c);
  await enforceRateLimit(c.env, `forgot:ip:${ip}`, 10, 3600, 'Troppe richieste da questo dispositivo.');

  const body = await parseJson(c, forgotPasswordSchema);
  await verifyTurnstile(c.env, body.turnstileToken, ip);

  const emailNormalized = normalizeEmail(body.email);
  await enforceRateLimit(c.env, `forgot:email:${emailNormalized}`, 3, 3600, 'Troppe richieste per questo indirizzo.');

  const user = await findUserByEmail(c, emailNormalized);
  if (user && user.status === 'active') {
    const token = await issueToken(c, user.id, 'password_reset', RESET_TOKEN_TTL_SECONDS, ip);
    await sendPasswordResetEmail(
      c.env,
      user.email,
      user.first_name,
      `${c.env.APP_URL}/reimposta-password?token=${encodeURIComponent(token)}`,
    );
    auditInBackground(c, {
      actorId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
      ip,
      userAgent: userAgent(c),
    });
  }

  return c.json({ ok: true, message: GENERIC_EMAIL_SENT });
});

/**
 * Restituisce l'indirizzo email associato a un token di reset, senza
 * consumarlo. Serve al browser per ricalcolare il salt della derivazione
 * password (che dipende dall'email) e per accorgersi subito che un link e'
 * scaduto, prima di far digitare la nuova password.
 *
 * Non introduce una fuga di informazioni: chi possiede il token ha per
 * definizione accesso alla casella a cui il token e' stato inviato.
 */
auth.post('/reset-token/check', async (c) => {
  await enforceRateLimit(c.env, `resetcheck:ip:${clientIp(c)}`, 20, 3600);

  const body = await parseJson(c, verifyEmailSchema);
  const tokenHash = await sha256Hex(body.token);

  const row = await c.env.DB.prepare(
    `SELECT u.email FROM auth_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ?1 AND t.type = 'password_reset' AND t.used_at IS NULL AND t.expires_at > ?2
       AND u.deleted_at IS NULL AND u.status = 'active'`,
  )
    .bind(tokenHash, nowIso())
    .first<{ email: string }>();

  if (!row) throw new ApiError(400, 'invalid_token', 'Link non valido o scaduto. Richiedine uno nuovo.');
  return c.json({ ok: true, email: row.email });
});

auth.post('/reset-password', async (c) => {
  const ip = clientIp(c);
  await enforceRateLimit(c.env, `reset:ip:${ip}`, 10, 3600);

  const body = await parseJson(c, resetPasswordSchema);
  const userId = await consumeToken(c, body.token, 'password_reset');

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(userId)
    .first<UserRow>();
  if (!user) throw new ApiError(400, 'invalid_token', 'Link non valido. Richiedine uno nuovo.');

  const passwordHash = await hashDerivedPassword(body.passwordDerived);
  const now = nowIso();

  // Il possesso del link prova il controllo della casella: l'email risulta
  // verificata, il blocco per tentativi errati viene rimosso e tutte le
  // sessioni aperte vengono chiuse. Tutto in un unico batch.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?1, password_changed_at = ?2, failed_login_count = 0, locked_until = NULL,
           email_verified_at = COALESCE(email_verified_at, ?2), updated_at = ?2
       WHERE id = ?3`,
    ).bind(passwordHash, now, user.id),
    c.env.DB.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(
      now,
      user.id,
    ),
    c.env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(`login:email:${user.email_normalized}`),
  ]);

  await sendPasswordChangedEmail(c.env, user.email);

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email_normalized,
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: user.id,
    ip,
    userAgent: userAgent(c),
  });

  return c.json({ ok: true, message: 'Password aggiornata. Ora puoi accedere con le nuove credenziali.' });
});

auth.post('/change-password', requireAuth, async (c) => {
  const user = c.get('user')!;
  const ip = clientIp(c);
  await enforceRateLimit(c.env, `changepwd:${user.id}`, 5, 3600, 'Troppi cambi password ravvicinati.');

  const body = await parseJson(c, changePasswordSchema);
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  if (!row) throw unauthorized();

  const now = nowIso();
  const newHash = await hashDerivedPassword(body.newPasswordDerived);

  if (!row.password_hash) {
    // Account solo-Google che imposta la prima password: la sessione
    // autenticata e' prova sufficiente.
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?',
    )
      .bind(newHash, now, now, row.id)
      .run();
    await sendPasswordChangedEmail(c.env, row.email);
    auditInBackground(c, {
      actorId: row.id,
      action: 'auth.password_set',
      entityType: 'user',
      entityId: row.id,
      ip,
      userAgent: userAgent(c),
    });
    return c.json({ ok: true, message: 'Password impostata.' });
  }

  if (!body.currentPasswordDerived) {
    throw new ApiError(400, 'wrong_password', 'Inserisci la password attuale.');
  }

  const { valid } = await verifyDerivedPassword(body.currentPasswordDerived, row.password_hash);
  if (!valid) {
    await audit(c.env, {
      actorId: row.id,
      action: 'auth.password_change',
      outcome: 'failure',
      ip,
      userAgent: userAgent(c),
    });
    throw new ApiError(400, 'wrong_password', 'La password attuale non e’ corretta.');
  }

  // Resta attiva solo la sessione corrente.
  const sessionId = c.get('sessionId');
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?',
    ).bind(newHash, now, now, row.id),
    c.env.DB.prepare(
      'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?',
    ).bind(now, row.id, sessionId ?? ''),
  ]);

  await sendPasswordChangedEmail(c.env, row.email);

  auditInBackground(c, {
    actorId: row.id,
    actorEmail: row.email_normalized,
    action: 'auth.password_change',
    entityType: 'user',
    entityId: row.id,
    ip,
    userAgent: userAgent(c),
  });

  return c.json({ ok: true, message: 'Password aggiornata. Le altre sessioni sono state disconnesse.' });
});

// ---------------------------------------------------------------------------
// Dispositivi collegati
// ---------------------------------------------------------------------------
auth.get('/sessions', requireAuth, async (c) => {
  const user = c.get('user')!;
  const currentId = c.get('sessionId');
  const { results } = await c.env.DB.prepare(
    `SELECT id, created_at, last_seen_at, expires_at, ip, user_agent, auth_method
     FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY last_seen_at DESC LIMIT 20`,
  )
    .bind(user.id, nowIso())
    .all<{
      id: string;
      created_at: string;
      last_seen_at: string | null;
      expires_at: string;
      ip: string | null;
      user_agent: string | null;
      auth_method: string;
    }>();

  return c.json({
    sessions: (results ?? []).map((row) => ({
      id: row.id,
      current: row.id === currentId,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      ip: row.ip,
      userAgent: row.user_agent,
      authMethod: row.auth_method,
    })),
  });
});

auth.delete('/sessions/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  // La UPDATE include user_id: una sessione di un altro utente non viene
  // toccata nemmeno provandoci con l'identificativo corretto.
  const result = await c.env.DB.prepare(
    'UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
  )
    .bind(nowIso(), id, user.id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    throw new ApiError(404, 'not_found', 'Sessione non trovata.');
  }

  auditInBackground(c, {
    actorId: user.id,
    action: 'auth.session_revoked',
    entityType: 'session',
    entityId: id,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });

  return c.json({ ok: true });
});

/** Chiude tutte le altre sessioni dell'utente. */
auth.post('/sessions/revoke-all', requireAuth, async (c) => {
  const user = c.get('user')!;
  const revoked = await destroyAllSessions(c.env, user.id, c.get('sessionId') ?? undefined);

  auditInBackground(c, {
    actorId: user.id,
    action: 'auth.sessions_revoked_all',
    entityType: 'user',
    entityId: user.id,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: { revoked },
  });

  return c.json({ ok: true, revoked });
});

export default auth;
