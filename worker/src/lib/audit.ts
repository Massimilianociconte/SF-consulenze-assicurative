import type { Context } from 'hono';
import type { AppEnv, Env } from '../types';
import { nowIso } from './http';
import { randomId } from './crypto';

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  outcome?: 'success' | 'failure';
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Scrive nel registro operazioni. Non deve mai far fallire la richiesta
 * dell'utente: eventuali errori vengono solo loggati.
 */
export async function audit(env: Env, entry: AuditEntry): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_id, actor_email, action, entity_type, entity_id, outcome, ip, user_agent, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        randomId(),
        entry.actorId ?? null,
        entry.actorEmail ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.outcome ?? 'success',
        entry.ip ?? null,
        entry.userAgent ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        nowIso(),
      )
      .run();
  } catch (error) {
    console.error('[audit] scrittura fallita', entry.action, error);
  }
}

/**
 * Come `audit`, ma la scrittura prosegue dopo l'invio della risposta
 * (`waitUntil`): il registro resta completo senza aggiungere latenza alle
 * operazioni dell'utente.
 */
export function auditInBackground(c: Context<AppEnv>, entry: AuditEntry): void {
  const promise = audit(c.env, entry);
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // Contesto senza executionCtx (es. test): si lascia comunque partire la
    // promise, senza attenderla.
    void promise;
  }
}
