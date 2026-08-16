import type { MiddlewareHandler } from 'hono';
import type { AppEnv, Role } from '../types';
import { loadSession } from '../lib/session';
import { forbidden, unauthorized } from '../lib/http';

/**
 * Carica sessione e utente con una sola query (vedi `loadSession`).
 * Ruolo, stato e verifica email sono riletti a ogni richiesta: una sospensione
 * o un cambio di ruolo hanno effetto immediato, senza attendere la scadenza
 * della sessione.
 */
export const withSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null);
  c.set('sessionId', null);
  c.set('authMethod', null);

  const loaded = await loadSession(c);
  if (loaded) {
    c.set('user', loaded.user);
    c.set('sessionId', loaded.id);
    c.set('authMethod', loaded.authMethod);
  }

  return next();
};

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw unauthorized('Sessione assente o scaduta. Effettua di nuovo l’accesso.');
  return next();
};

export function requireRole(...roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) throw unauthorized('Sessione assente o scaduta. Effettua di nuovo l’accesso.');
    if (!roles.includes(user.role)) throw forbidden('Non hai i permessi per questa operazione.');
    return next();
  };
}

/** Per le operazioni che richiedono un indirizzo email confermato. */
export const requireVerifiedEmail: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) throw unauthorized('Sessione assente o scaduta. Effettua di nuovo l’accesso.');
  if (!user.emailVerified) {
    throw forbidden('Conferma prima il tuo indirizzo email per completare questa operazione.');
  }
  return next();
};
