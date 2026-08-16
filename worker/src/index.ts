/**
 * Worker S.F. Consulenze Assicurative.
 *
 * Serve due cose dalla stessa origine:
 *  - /api/*  : API dell'area riservata e del gestionale (questo codice)
 *  - tutto il resto: il sito statico costruito da Vite (binding ASSETS)
 *
 * Stessa origine = cookie di sessione HttpOnly senza CORS e senza SameSite=None.
 *
 * Vincoli del piano Cloudflare gratuito rispettati qui:
 *  - 10 ms di CPU per richiesta  -> derivazione password assistita dal client
 *  - nessuna dipendenza da KV    -> sessioni e rate limit su D1
 *  - 50 query D1 per invocazione -> letture raggruppate in batch
 */
import { Hono } from 'hono';
import type { AppEnv, Env } from './types';
import { ApiError, nowIso } from './lib/http';
import { CLIENT_KDF } from './lib/crypto';
import { withSession } from './middleware/auth';
import { apiSecurityHeaders, sameOriginOnly } from './middleware/security';
import authRoutes, { PRIVACY_VERSION } from './routes/auth';
import googleRoutes from './routes/google';
import profileRoutes from './routes/profile';
import portalRoutes from './routes/portal';
import documentRoutes from './routes/documents';
import claimRoutes from './routes/claims';
import adminRoutes from './routes/admin';
import referenceRoutes from './routes/reference';

const app = new Hono<AppEnv>();

app.use('/api/*', apiSecurityHeaders);
app.use('/api/*', sameOriginOnly);
app.use('/api/*', withSession);

app.get('/api/health', (c) =>
  c.json({ ok: true, environment: c.env.ENVIRONMENT, time: new Date().toISOString() }),
);

/**
 * Configurazione pubblica letta dal frontend all'avvio.
 * Include i parametri della derivazione password: il browser deve usare gli
 * stessi con cui l'hash e' stato creato (vedi lib/crypto.ts).
 */
app.get('/api/config', (c) =>
  c.json({
    googleEnabled: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || null,
    privacyVersion: PRIVACY_VERSION,
    passwordKdf: {
      version: CLIENT_KDF.version,
      algorithm: CLIENT_KDF.algorithm,
      iterations: CLIENT_KDF.iterations,
      saltPrefix: CLIENT_KDF.saltPrefix,
    },
  }),
);

// L'ordine conta: /api/auth/google prima di /api/auth.
app.route('/api/auth/google', googleRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/portal', portalRoutes);
app.route('/api/documents', documentRoutes);
app.route('/api/claims', claimRoutes);
app.route('/api/reference', referenceRoutes);
app.route('/api/admin', adminRoutes);

app.all('/api/*', (c) =>
  c.json({ error: { code: 'not_found', message: 'Endpoint non disponibile.' } }, 404),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    const response = c.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status as 400,
    );
    if (error.status === 429) {
      const retryAfter = (error.details as { retryAfter?: number } | undefined)?.retryAfter;
      if (retryAfter) response.headers.set('Retry-After', String(retryAfter));
    }
    return response;
  }
  // Nessun dettaglio interno verso il client: resta nei log.
  console.error('[worker] errore non gestito', c.req.method, c.req.path, error);
  return c.json(
    { error: { code: 'internal_error', message: 'Errore interno. Riprova fra poco.' } },
    500,
  );
});

// Sito statico. Con `run_worker_first: ["/api/*"]` gli asset non passano
// nemmeno da qui, ma il fallback serve in sviluppo locale.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

/**
 * Manutenzione notturna (Cron Trigger, disponibile anche sul piano gratuito).
 *
 * Serve a mantenere il database piccolo e prevedibile: senza questa pulizia
 * sessioni scadute, token consumati e contatori di rate limit crescerebbero
 * indefinitamente, avvicinando il limite di 500 MB del piano gratuito.
 *
 * Il registro operazioni (`audit_log`) viene conservato 24 mesi: e' la traccia
 * di chi ha fatto cosa sulle pratiche, quindi non va cancellato con leggerezza.
 */
async function runMaintenance(env: Env): Promise<Record<string, number>> {
  const now = nowIso();
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const [sessions, tokens, limits, audits, profileChanges] = await env.DB.batch([
    // Sessioni scadute o revocate da oltre 30 giorni: lo storico recente resta
    // consultabile dall'utente nella pagina "dispositivi collegati".
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)').bind(
      daysAgo(30),
      daysAgo(30),
    ),
    env.DB.prepare('DELETE FROM auth_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)').bind(
      daysAgo(7),
      daysAgo(7),
    ),
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM audit_log WHERE created_at < ?').bind(daysAgo(730)),
    env.DB.prepare(
      `DELETE FROM profile_change_requests
       WHERE requested_at < ? AND status IN ('verified', 'rejected', 'failed')`,
    ).bind(daysAgo(730)),
  ]);

  const stats = {
    sessions: sessions.meta?.changes ?? 0,
    tokens: tokens.meta?.changes ?? 0,
    rateLimits: limits.meta?.changes ?? 0,
    auditLog: audits.meta?.changes ?? 0,
    profileChanges: profileChanges.meta?.changes ?? 0,
  };
  console.log('[cron] manutenzione completata', stats);
  return stats;
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: async (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runMaintenance(env));
  },
} satisfies ExportedHandler<Env>;
