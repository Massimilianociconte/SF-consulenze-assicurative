import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { forbidden } from '../lib/http';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function allowedOrigins(c: { env: AppEnv['Bindings']; req: { header: (n: string) => string | undefined } }): string[] {
  const origins = [c.env.APP_URL];
  const host = c.req.header('Host');
  if (host) {
    origins.push(`https://${host}`);
    if (c.env.ENVIRONMENT !== 'production') origins.push(`http://${host}`);
  }
  if (c.env.ENVIRONMENT !== 'production') {
    origins.push('http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8787');
  }
  return origins.filter(Boolean);
}

/**
 * Difesa CSRF: le richieste che modificano dati devono arrivare dalla stessa
 * origine. Insieme al cookie di sessione `SameSite=Lax` copre i vettori
 * classici (form cross-site, fetch da domini terzi).
 */
export const sameOriginOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!MUTATING_METHODS.has(c.req.method)) return next();

  const origin = c.req.header('Origin');
  // Alcuni client (curl, app native) non inviano Origin: in quel caso
  // richiediamo comunque un Referer coerente.
  const referer = c.req.header('Referer');
  const allowed = allowedOrigins(c);

  if (origin) {
    if (!allowed.includes(origin)) throw forbidden('Origine della richiesta non consentita.');
    return next();
  }

  if (referer) {
    const refOrigin = (() => {
      try {
        return new URL(referer).origin;
      } catch {
        return null;
      }
    })();
    if (!refOrigin || !allowed.includes(refOrigin)) {
      throw forbidden('Origine della richiesta non consentita.');
    }
    return next();
  }

  throw forbidden('Origine della richiesta non verificabile.');
};

/**
 * Header di sicurezza sulle risposte API. Le pagine statiche ricevono i propri
 * header (CSP compresa) da `dist/_headers`, generato al build.
 */
export const apiSecurityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Frame-Options', 'DENY');
};
