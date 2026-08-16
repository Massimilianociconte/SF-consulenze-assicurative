import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv, Role } from '../types';
import { clientIp, forbidden, notFound, nowIso, userAgent } from '../lib/http';
import { randomId } from '../lib/crypto';
import { auditInBackground } from '../lib/audit';
import { newMessageSchema, newThreadSchema, parseJson } from '../lib/validation';
import { requireAuth } from '../middleware/auth';

const portal = new Hono<AppEnv>();
portal.use('*', requireAuth);

/**
 * Isolamento dei dati fra clienti e fra consulente e clienti.
 *
 * - un cliente vede esclusivamente le proprie righe;
 * - un consulente (`advisor`) puo' lavorare la posizione di un assistito
 *   indicando `?userId=`, ma solo se quel cliente e' assegnato a lui
 *   (`users.advisor_id`): non basta conoscere l'identificativo;
 * - un `admin` puo' accedere a chiunque, e ogni accesso incrociato finisce nel
 *   registro operazioni con l'indicazione di chi ha guardato cosa.
 *
 * Ogni query dei gestori usa il valore restituito da qui, mai `?userId` grezzo.
 */
async function resolveScope(c: Context<AppEnv>): Promise<string> {
  const user = c.get('user')!;
  const requested = c.req.query('userId');
  if (!requested || requested === user.id) return user.id;

  if (user.role !== 'advisor' && user.role !== 'admin') {
    throw forbidden('Non hai accesso ai dati di questo utente.');
  }

  if (user.role === 'advisor') {
    const assigned = await c.env.DB.prepare(
      'SELECT id FROM users WHERE id = ? AND advisor_id = ? AND deleted_at IS NULL',
    )
      .bind(requested, user.id)
      .first<{ id: string }>();
    if (!assigned) {
      auditInBackground(c, {
        actorId: user.id,
        actorEmail: user.email,
        action: 'portal.cross_access_denied',
        entityType: 'user',
        entityId: requested,
        outcome: 'failure',
        ip: clientIp(c),
        userAgent: userAgent(c),
        metadata: { path: c.req.path },
      });
      throw forbidden('Questo cliente non risulta assegnato al tuo portafoglio.');
    }
  }

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email,
    action: 'portal.cross_access',
    entityType: 'user',
    entityId: requested,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: { path: c.req.path, role: user.role },
  });

  return requested;
}

/** Ruolo con cui vengono firmati i messaggi inviati dall'utente corrente. */
function senderRole(role: Role): 'client' | 'advisor' {
  return role === 'client' ? 'client' : 'advisor';
}

function euro(cents: number | null): number | null {
  return cents == null ? null : Math.round(cents) / 100;
}

// ---------------------------------------------------------------------------
// Riepilogo dashboard
// ---------------------------------------------------------------------------
portal.get('/summary', async (c) => {
  const userId = await resolveScope(c);
  const viewerRole = senderRole(c.get('user')!.role);
  const db = c.env.DB;
  const today = nowIso().slice(0, 10);
  const in60Days = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  // Un solo batch: D1 lo esegue in un unico viaggio di rete invece di dieci.
  // Conta anche per il limite di 50 query per invocazione del piano gratuito.
  const [
    policies,
    upcoming,
    claims,
    quotes,
    negotiations,
    documents,
    unread,
    requests,
    nextDeadlines,
    recentActivity,
  ] = await db.batch([
    db.prepare("SELECT COUNT(*) AS n FROM policies WHERE user_id = ? AND status = 'active'").bind(userId),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM deadlines
         WHERE user_id = ? AND status = 'pending' AND due_date BETWEEN ? AND ?`,
      )
      .bind(userId, today, in60Days),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM claims
         WHERE user_id = ? AND status NOT IN ('closed', 'rejected', 'draft')`,
      )
      .bind(userId),
    db
      .prepare("SELECT COUNT(*) AS n FROM quotes WHERE user_id = ? AND status IN ('sent', 'under_review')")
      .bind(userId),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM negotiations
         WHERE user_id = ? AND stage NOT IN ('conclusa', 'abbandonata')`,
      )
      .bind(userId),
    db.prepare("SELECT COUNT(*) AS n FROM documents WHERE owner_user_id = ? AND status != 'deleted'").bind(userId),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages m
         JOIN message_threads t ON t.id = m.thread_id
         WHERE t.user_id = ? AND m.sender_role != ? AND m.read_at IS NULL`,
      )
      .bind(userId, viewerRole),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM service_requests
         WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT d.id, d.title, d.type, d.due_date, d.amount_cents, d.status,
                p.company_name, p.policy_number, p.branch
         FROM deadlines d
         LEFT JOIN policies p ON p.id = d.policy_id
         WHERE d.user_id = ? AND d.status = 'pending'
         ORDER BY d.due_date ASC LIMIT 5`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT 'sinistro' AS kind, reference AS title, status, updated_at AS at FROM claims WHERE user_id = ?
         UNION ALL
         SELECT 'richiesta' AS kind, subject AS title, status, updated_at AS at FROM service_requests WHERE user_id = ?
         ORDER BY at DESC LIMIT 6`,
      )
      .bind(userId, userId),
  ]);

  const count = (result: D1Result<unknown>): number =>
    Number((result.results?.[0] as { n?: number } | undefined)?.n ?? 0);

  return c.json({
    counters: {
      activePolicies: count(policies),
      upcomingDeadlines: count(upcoming),
      openClaims: count(claims),
      openQuotes: count(quotes),
      openNegotiations: count(negotiations),
      documents: count(documents),
      unreadMessages: count(unread),
      openRequests: count(requests),
    },
    nextDeadlines: ((nextDeadlines.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      dueDate: row.due_date,
      amount: euro(row.amount_cents),
      status: row.status,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      branch: row.branch,
    })),
    recentActivity: (recentActivity.results ?? []) as Record<string, any>[],
  });
});

// ---------------------------------------------------------------------------
// Scadenze
// ---------------------------------------------------------------------------
portal.get('/deadlines', async (c) => {
  const userId = await resolveScope(c);
  const status = c.req.query('status');

  const query = status
    ? c.env.DB.prepare(
        `SELECT d.*, p.company_name, p.policy_number, p.branch FROM deadlines d
         LEFT JOIN policies p ON p.id = d.policy_id
         WHERE d.user_id = ? AND d.status = ? ORDER BY d.due_date ASC LIMIT 200`,
      ).bind(userId, status)
    : c.env.DB.prepare(
        `SELECT d.*, p.company_name, p.policy_number, p.branch FROM deadlines d
         LEFT JOIN policies p ON p.id = d.policy_id
         WHERE d.user_id = ? ORDER BY d.due_date ASC LIMIT 200`,
      ).bind(userId);

  const { results } = await query.all<Record<string, any>>();
  return c.json({
    deadlines: (results ?? []).map((row) => ({
      id: row.id,
      policyId: row.policy_id,
      title: row.title,
      type: row.type,
      dueDate: row.due_date,
      amount: euro(row.amount_cents),
      status: row.status,
      notes: row.notes,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      branch: row.branch,
    })),
  });
});

// ---------------------------------------------------------------------------
// Polizze
// ---------------------------------------------------------------------------
portal.get('/policies', async (c) => {
  const userId = await resolveScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM policies WHERE user_id = ? ORDER BY expiry_date IS NULL, expiry_date ASC LIMIT 200',
  )
    .bind(userId)
    .all<Record<string, any>>();

  return c.json({
    policies: (results ?? []).map((row) => ({
      id: row.id,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      branch: row.branch,
      productName: row.product_name,
      status: row.status,
      effectiveDate: row.effective_date,
      expiryDate: row.expiry_date,
      renewalType: row.renewal_type,
      paymentFrequency: row.payment_frequency,
      premium: euro(row.premium_cents),
      insuredObject: row.insured_object,
      plate: row.plate,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      insuredAddress: row.insured_address,
      notes: row.notes,
    })),
  });
});

// ---------------------------------------------------------------------------
// Preventivi e trattative
// ---------------------------------------------------------------------------
portal.get('/quotes', async (c) => {
  const userId = await resolveScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(userId)
    .all<Record<string, any>>();

  return c.json({
    quotes: (results ?? []).map((row) => ({
      id: row.id,
      subject: row.subject,
      companyName: row.company_name,
      branch: row.branch,
      premium: euro(row.premium_cents),
      coverageSummary: row.coverage_summary,
      status: row.status,
      validUntil: row.valid_until,
      notes: row.notes,
      createdAt: row.created_at,
    })),
  });
});

portal.get('/negotiations', async (c) => {
  const userId = await resolveScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM negotiations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100',
  )
    .bind(userId)
    .all<Record<string, any>>();

  return c.json({
    negotiations: (results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      stage: row.stage,
      expectedClose: row.expected_close,
      value: euro(row.value_cents),
      quoteId: row.quote_id,
      lastUpdate: row.last_update ?? row.updated_at,
      notes: row.notes,
    })),
  });
});

// ---------------------------------------------------------------------------
// Sinistri
// ---------------------------------------------------------------------------
portal.get('/claims', async (c) => {
  const userId = await resolveScope(c);
  const { results } = await c.env.DB.prepare(
    `SELECT c.*, p.policy_number, p.branch FROM claims c
     LEFT JOIN policies p ON p.id = c.policy_id
     WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT 100`,
  )
    .bind(userId)
    .all<Record<string, any>>();

  return c.json({
    claims: (results ?? []).map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      claimType: row.claim_type,
      companyName: row.company_name,
      companyClaimNumber: row.company_claim_number,
      policyId: row.policy_id,
      policyNumber: row.policy_number,
      branch: row.branch,
      occurredAt: row.occurred_at,
      placeCity: row.place_city,
      estimatedDamage: euro(row.estimated_damage_cents),
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
    })),
  });
});

portal.get('/claims/:id', async (c) => {
  const userId = await resolveScope(c);
  const id = c.req.param('id');

  const claim = await c.env.DB.prepare('SELECT * FROM claims WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<Record<string, any>>();
  if (!claim) throw notFound('Pratica non trovata.');

  const [parties, vehicles, events, documents] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM claim_parties WHERE claim_id = ?').bind(id),
    c.env.DB.prepare('SELECT * FROM claim_vehicles WHERE claim_id = ?').bind(id),
    c.env.DB.prepare(
      'SELECT * FROM claim_events WHERE claim_id = ? AND visible_to_client = 1 ORDER BY created_at DESC',
    ).bind(id),
    c.env.DB.prepare(
      `SELECT id, category, title, original_name, mime_type, size_bytes, status, uploaded_at
       FROM documents WHERE claim_id = ? AND status != 'deleted' ORDER BY uploaded_at DESC`,
    ).bind(id),
  ]);

  return c.json({
    claim: {
      id: claim.id,
      reference: claim.reference,
      status: claim.status,
      claimType: claim.claim_type,
      companyName: claim.company_name,
      companyClaimNumber: claim.company_claim_number,
      policyId: claim.policy_id,
      occurredAt: claim.occurred_at,
      place: {
        address: claim.place_address,
        city: claim.place_city,
        province: claim.place_province,
        country: claim.place_country,
      },
      dynamics: claim.dynamics,
      injuries: Boolean(claim.injuries),
      injuriesDetail: claim.injuries_detail,
      authoritiesInvolved: Boolean(claim.authorities_involved),
      authorityType: claim.authority_type,
      reportNumber: claim.report_number,
      caiSigned: claim.cai_signed,
      estimatedDamage: euro(claim.estimated_damage_cents),
      submittedAt: claim.submitted_at,
      closedAt: claim.closed_at,
      createdAt: claim.created_at,
      updatedAt: claim.updated_at,
    },
    parties: (parties.results ?? []) as Record<string, any>[],
    vehicles: (vehicles.results ?? []) as Record<string, any>[],
    events: ((events.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      status: row.status,
      title: row.title,
      detail: row.detail,
      createdAt: row.created_at,
    })),
    documents: ((documents.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title ?? row.original_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      status: row.status,
      uploadedAt: row.uploaded_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// Documenti (metadati; caricamento e download arrivano con il modulo sinistri)
// ---------------------------------------------------------------------------
portal.get('/documents', async (c) => {
  const userId = await resolveScope(c);
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.category, d.title, d.original_name, d.mime_type, d.size_bytes, d.status,
            d.uploaded_at, d.claim_id, d.policy_id, c.reference AS claim_reference
     FROM documents d
     LEFT JOIN claims c ON c.id = d.claim_id
     WHERE d.owner_user_id = ? AND d.status != 'deleted'
     ORDER BY d.uploaded_at DESC LIMIT 200`,
  )
    .bind(userId)
    .all<Record<string, any>>();

  return c.json({
    documents: (results ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title ?? row.original_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      status: row.status,
      uploadedAt: row.uploaded_at,
      claimId: row.claim_id,
      claimReference: row.claim_reference,
      policyId: row.policy_id,
    })),
  });
});

// ---------------------------------------------------------------------------
// Richieste e stato di avanzamento
// ---------------------------------------------------------------------------
portal.get('/requests', async (c) => {
  const userId = await resolveScope(c);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM service_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(userId)
    .all<Record<string, any>>();

  return c.json({
    requests: (results ?? []).map((row) => ({
      id: row.id,
      reference: row.reference,
      type: row.type,
      subject: row.subject,
      detail: row.detail,
      status: row.status,
      priority: row.priority,
      dueDate: row.due_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      closedAt: row.closed_at,
    })),
  });
});

portal.get('/requests/:id', async (c) => {
  const userId = await resolveScope(c);
  const id = c.req.param('id');

  const request = await c.env.DB.prepare('SELECT * FROM service_requests WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<Record<string, any>>();
  if (!request) throw notFound('Richiesta non trovata.');

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM request_events WHERE request_id = ? AND visible_to_client = 1 ORDER BY created_at DESC',
  )
    .bind(id)
    .all<Record<string, any>>();

  return c.json({
    request: {
      id: request.id,
      reference: request.reference,
      type: request.type,
      subject: request.subject,
      detail: request.detail,
      status: request.status,
      priority: request.priority,
      createdAt: request.created_at,
      updatedAt: request.updated_at,
    },
    events: (results ?? []).map((row) => ({
      id: row.id,
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
});

// ---------------------------------------------------------------------------
// Comunicazioni
// ---------------------------------------------------------------------------
portal.get('/threads', async (c) => {
  const userId = await resolveScope(c);
  const viewerRole = senderRole(c.get('user')!.role);

  const { results } = await c.env.DB.prepare(
    `SELECT t.*,
            (SELECT COUNT(*) FROM messages m
              WHERE m.thread_id = t.id AND m.sender_role != ?2 AND m.read_at IS NULL) AS unread,
            (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_body
     FROM message_threads t
     WHERE t.user_id = ?1
     ORDER BY COALESCE(t.last_message_at, t.created_at) DESC LIMIT 100`,
  )
    .bind(userId, viewerRole)
    .all<Record<string, any>>();

  return c.json({
    threads: (results ?? []).map((row) => ({
      id: row.id,
      subject: row.subject,
      category: row.category,
      status: row.status,
      claimId: row.claim_id,
      policyId: row.policy_id,
      unread: row.unread ?? 0,
      preview: row.last_body ? String(row.last_body).slice(0, 140) : null,
      lastMessageAt: row.last_message_at ?? row.created_at,
      createdAt: row.created_at,
    })),
  });
});

portal.get('/threads/:id', async (c) => {
  const userId = await resolveScope(c);
  const viewerRole = senderRole(c.get('user')!.role);
  const id = c.req.param('id');

  const thread = await c.env.DB.prepare('SELECT * FROM message_threads WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<Record<string, any>>();
  if (!thread) throw notFound('Conversazione non trovata.');

  const [messages] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 500').bind(id),
    // I messaggi scritti dalla controparte risultano letti all'apertura.
    c.env.DB.prepare(
      'UPDATE messages SET read_at = ?1 WHERE thread_id = ?2 AND sender_role != ?3 AND read_at IS NULL',
    ).bind(nowIso(), id, viewerRole),
  ]);

  return c.json({
    thread: {
      id: thread.id,
      subject: thread.subject,
      category: thread.category,
      status: thread.status,
      createdAt: thread.created_at,
    },
    messages: ((messages.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      senderRole: row.sender_role,
      body: row.body,
      documentId: row.document_id,
      createdAt: row.created_at,
      readAt: row.read_at,
    })),
  });
});

portal.post('/threads', async (c) => {
  const user = c.get('user')!;
  const ownerId = await resolveScope(c);
  const body = await parseJson(c, newThreadSchema);
  const now = nowIso();
  const threadId = randomId();

  // Conversazione e primo messaggio in un solo batch: non esistono
  // conversazioni vuote.
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO message_threads (id, user_id, subject, category, status, last_message_at, created_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    ).bind(threadId, ownerId, body.subject, body.category, now, now),
    c.env.DB.prepare(
      `INSERT INTO messages (id, thread_id, sender_id, sender_role, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(randomId(), threadId, user.id, senderRole(user.role), body.body, now),
  ]);

  auditInBackground(c, {
    actorId: user.id,
    action: 'message.thread_created',
    entityType: 'message_thread',
    entityId: threadId,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: { ownerId },
  });

  return c.json({ ok: true, threadId }, 201);
});

portal.post('/threads/:id/messages', async (c) => {
  const user = c.get('user')!;
  const ownerId = await resolveScope(c);
  const id = c.req.param('id');
  const body = await parseJson(c, newMessageSchema);

  const thread = await c.env.DB.prepare(
    'SELECT id, status FROM message_threads WHERE id = ? AND user_id = ?',
  )
    .bind(id, ownerId)
    .first<{ id: string; status: string }>();
  if (!thread) throw notFound('Conversazione non trovata.');
  if (thread.status === 'closed') throw forbidden('La conversazione e’ chiusa: aprine una nuova.');

  const now = nowIso();
  const messageId = randomId();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO messages (id, thread_id, sender_id, sender_role, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(messageId, id, user.id, senderRole(user.role), body.body, now),
    c.env.DB.prepare('UPDATE message_threads SET last_message_at = ? WHERE id = ?').bind(now, id),
  ]);

  return c.json({ ok: true, messageId }, 201);
});

export default portal;
