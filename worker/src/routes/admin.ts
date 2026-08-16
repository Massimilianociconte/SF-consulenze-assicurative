import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { ApiError, badRequest, clientIp, forbidden, notFound, nowIso, nullify, userAgent } from '../lib/http';
import { randomId } from '../lib/crypto';
import { auditInBackground } from '../lib/audit';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  advisorMessageSchema,
  claimWorkflowSchema,
  clientAssignSchema,
  clientNoteSchema,
  deadlineUpsertSchema,
  documentHoldSchema,
  negotiationUpsertSchema,
  parseJson,
  policyUpsertSchema,
  profileChangeUpdateSchema,
  quoteUpsertSchema,
  requestUpdateSchema,
} from '../lib/validation';

/**
 * Gestionale del consulente.
 *
 * Non e' un software separato: sono le stesse tabelle dell'area riservata viste
 * dal lato di chi lavora le pratiche. Ogni endpoint verifica che il cliente
 * appartenga al portafoglio di chi sta chiedendo, e ogni operazione finisce nel
 * registro (`audit_log`).
 */
const admin = new Hono<AppEnv>();
admin.use('*', requireAuth, requireRole('advisor', 'admin'));

/** Verifica che il cliente sia gestibile da chi sta operando. */
async function assertClientAccess(c: Context<AppEnv>, clientId: string): Promise<void> {
  const user = c.get('user')!;
  if (user.role === 'admin') return;

  const row = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND advisor_id = ? AND deleted_at IS NULL',
  )
    .bind(clientId, user.id)
    .first<{ id: string }>();

  if (!row) {
    auditInBackground(c, {
      actorId: user.id,
      actorEmail: user.email,
      action: 'admin.access_denied',
      entityType: 'user',
      entityId: clientId,
      outcome: 'failure',
      ip: clientIp(c),
      userAgent: userAgent(c),
      metadata: { path: c.req.path },
    });
    throw forbidden('Cliente non presente nel tuo portafoglio.');
  }
}

/** Condizione SQL che limita le righe ai clienti dell'operatore. */
function scopeClause(c: Context<AppEnv>): { clause: string; params: string[] } {
  const user = c.get('user')!;
  if (user.role === 'admin') return { clause: '1 = 1', params: [] };
  return { clause: 'u.advisor_id = ?', params: [user.id] };
}

function pagination(c: Context<AppEnv>): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') ?? '25', 10) || 25, 1), 100);
  const offset = Math.max(Number.parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);
  return { limit, offset };
}

function euro(cents: number | null): number | null {
  return cents == null ? null : Math.round(cents) / 100;
}

function toCents(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value * 100);
}

function logAction(c: Context<AppEnv>, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
  const user = c.get('user')!;
  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email,
    action,
    entityType,
    entityId,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata,
  });
}

function storedJson(value: unknown, fallback: unknown) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function profileChangePayload(row: Record<string, any>) {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    changedFields: storedJson(row.changed_fields, []),
    before: storedJson(row.before_values, {}),
    after: storedJson(row.after_values, {}),
    origin: row.origin,
    source: row.source,
    sourceReferenceId: row.source_reference_id,
    requestedAt: row.requested_at,
    appliedAt: row.applied_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    client:
      row.first_name !== undefined
        ? {
            id: row.user_id,
            name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
          }
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Cruscotto
// ---------------------------------------------------------------------------
/**
 * Non un elenco di numeri fine a se stesso: le code di lavoro di oggi.
 * Una sola chiamata a D1 con batch, per non moltiplicare i viaggi di rete.
 */
admin.get('/dashboard', async (c) => {
  const { clause, params } = scopeClause(c);
  const today = nowIso().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const [
    clients,
    claimsToWork,
    expiring,
    unread,
    openRequests,
    recentClaims,
    recentDocuments,
    overdue,
    profileChanges,
  ] =
    await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u WHERE u.role = 'client' AND u.deleted_at IS NULL AND ${clause}`).bind(...params),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM claims cl JOIN users u ON u.id = cl.user_id
         WHERE cl.status IN ('submitted', 'in_review', 'waiting_documents') AND ${clause}`,
      ).bind(...params),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM deadlines d JOIN users u ON u.id = d.user_id
         WHERE d.status = 'pending' AND d.due_date BETWEEN ? AND ? AND ${clause}`,
      ).bind(today, in30Days, ...params),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM messages m
         JOIN message_threads t ON t.id = m.thread_id
         JOIN users u ON u.id = t.user_id
         WHERE m.sender_role = 'client' AND m.read_at IS NULL AND ${clause}`,
      ).bind(...params),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM service_requests r JOIN users u ON u.id = r.user_id
         WHERE r.status NOT IN ('completed', 'cancelled') AND ${clause}`,
      ).bind(...params),
      c.env.DB.prepare(
        `SELECT cl.id, cl.reference, cl.status, cl.claim_type, cl.occurred_at, cl.submitted_at,
                u.first_name, u.last_name, u.email
         FROM claims cl JOIN users u ON u.id = cl.user_id
         WHERE cl.status != 'draft' AND ${clause}
         ORDER BY cl.updated_at DESC LIMIT 8`,
      ).bind(...params),
      c.env.DB.prepare(
        `SELECT d.id, d.original_name, d.category, d.uploaded_at, d.size_bytes,
                u.first_name, u.last_name
         FROM documents d JOIN users u ON u.id = d.owner_user_id
         WHERE d.status = 'uploaded' AND ${clause}
         ORDER BY d.uploaded_at DESC LIMIT 8`,
      ).bind(...params),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM deadlines d JOIN users u ON u.id = d.user_id
         WHERE d.status = 'pending' AND d.due_date < ? AND ${clause}`,
      ).bind(today, ...params),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM profile_change_requests pc JOIN users u ON u.id = pc.user_id
         WHERE pc.status IN ('received', 'in_review', 'failed') AND ${clause}`,
      ).bind(...params),
    ]);

  const count = (result: D1Result<unknown>) => Number((result.results?.[0] as { n?: number })?.n ?? 0);

  return c.json({
    counters: {
      clients: count(clients),
      claimsToWork: count(claimsToWork),
      expiringDeadlines: count(expiring),
      overdueDeadlines: count(overdue),
      unreadMessages: count(unread),
      openRequests: count(openRequests),
      profileChangesToReview: count(profileChanges),
    },
    recentClaims: ((recentClaims.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      claimType: row.claim_type,
      occurredAt: row.occurred_at,
      submittedAt: row.submitted_at,
      clientName: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
    })),
    recentDocuments: ((recentDocuments.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      originalName: row.original_name,
      category: row.category,
      uploadedAt: row.uploaded_at,
      sizeBytes: row.size_bytes,
      clientName: [row.first_name, row.last_name].filter(Boolean).join(' '),
    })),
  });
});

// ---------------------------------------------------------------------------
// Clienti
// ---------------------------------------------------------------------------
admin.get('/clients', async (c) => {
  const { clause, params } = scopeClause(c);
  const { limit, offset } = pagination(c);
  const search = (c.req.query('search') ?? '').trim();
  const like = `%${search.toLowerCase()}%`;

  const searchClause = search
    ? `AND (LOWER(u.first_name) LIKE ? OR LOWER(u.last_name) LIKE ? OR LOWER(u.email) LIKE ?
            OR LOWER(COALESCE(u.fiscal_code, '')) LIKE ? OR COALESCE(u.phone, '') LIKE ? OR COALESCE(u.mobile, '') LIKE ?)`
    : '';
  const searchParams = search ? [like, like, like, like, like, like] : [];

  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.mobile, u.fiscal_code,
            u.address_city, u.created_at, u.last_login_at, u.email_verified_at, u.status,
            (SELECT COUNT(*) FROM policies p WHERE p.user_id = u.id AND p.status = 'active') AS active_policies,
            (SELECT COUNT(*) FROM claims cl WHERE cl.user_id = u.id AND cl.status NOT IN ('closed','rejected','draft')) AS open_claims,
            (SELECT COUNT(*) FROM deadlines d WHERE d.user_id = u.id AND d.status = 'pending' AND d.due_date <= date('now','+30 day')) AS soon_deadlines,
            (SELECT COUNT(*) FROM messages m JOIN message_threads t ON t.id = m.thread_id
              WHERE t.user_id = u.id AND m.sender_role = 'client' AND m.read_at IS NULL) AS unread
     FROM users u
     WHERE u.role = 'client' AND u.deleted_at IS NULL AND ${clause} ${searchClause}
     ORDER BY u.last_name IS NULL, u.last_name, u.first_name
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, ...searchParams, limit, offset)
    .all<Record<string, any>>();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM users u WHERE u.role = 'client' AND u.deleted_at IS NULL AND ${clause}`,
  )
    .bind(...params)
    .first<{ n: number }>();

  return c.json({
    clients: (results ?? []).map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.mobile ?? row.phone,
      fiscalCode: row.fiscal_code,
      city: row.address_city,
      status: row.status,
      emailVerified: Boolean(row.email_verified_at),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      activePolicies: row.active_policies ?? 0,
      openClaims: row.open_claims ?? 0,
      soonDeadlines: row.soon_deadlines ?? 0,
      unreadMessages: row.unread ?? 0,
    })),
    total: Number(total?.n ?? 0),
    limit,
    offset,
  });
});

admin.get('/clients/:id', async (c) => {
  const id = c.req.param('id');
  await assertClientAccess(c, id);
  logAction(c, 'admin.client_opened', 'user', id);

  const [
    profile,
    policies,
    deadlines,
    claimsList,
    quotes,
    negotiations,
    docs,
    threads,
    requests,
    notes,
    profileChanges,
  ] =
    await c.env.DB.batch([
      c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id),
      c.env.DB.prepare('SELECT * FROM policies WHERE user_id = ? ORDER BY expiry_date IS NULL, expiry_date').bind(id),
      c.env.DB.prepare('SELECT * FROM deadlines WHERE user_id = ? ORDER BY due_date').bind(id),
      c.env.DB.prepare('SELECT * FROM claims WHERE user_id = ? ORDER BY created_at DESC').bind(id),
      c.env.DB.prepare('SELECT * FROM quotes WHERE user_id = ? ORDER BY created_at DESC').bind(id),
      c.env.DB.prepare('SELECT * FROM negotiations WHERE user_id = ? ORDER BY updated_at DESC').bind(id),
      c.env.DB.prepare(
        `SELECT id, category, title, original_name, mime_type, size_bytes, status, uploaded_at, claim_id,
                legal_hold, retention_until, deleted_at
         FROM documents WHERE owner_user_id = ? ORDER BY uploaded_at DESC LIMIT 200`,
      ).bind(id),
      c.env.DB.prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id AND m.sender_role = 'client' AND m.read_at IS NULL) AS unread
         FROM message_threads t WHERE t.user_id = ? ORDER BY COALESCE(t.last_message_at, t.created_at) DESC`,
      ).bind(id),
      c.env.DB.prepare('SELECT * FROM service_requests WHERE user_id = ? ORDER BY created_at DESC').bind(id),
      c.env.DB.prepare(
        `SELECT n.id, n.body, n.created_at, u.first_name, u.last_name
         FROM client_notes n LEFT JOIN users u ON u.id = n.author_id
         WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`,
      ).bind(id),
      c.env.DB.prepare(
        `SELECT * FROM profile_change_requests
         WHERE user_id = ? ORDER BY requested_at DESC LIMIT 50`,
      ).bind(id),
    ]);

  const client = profile.results?.[0] as Record<string, any> | undefined;
  if (!client) throw notFound('Cliente non trovato.');

  const rows = (result: D1Result<unknown>) => (result.results ?? []) as Record<string, any>[];

  return c.json({
    client: {
      id: client.id,
      email: client.email,
      emailVerified: Boolean(client.email_verified_at),
      firstName: client.first_name,
      lastName: client.last_name,
      phone: client.phone,
      mobile: client.mobile,
      pec: client.pec,
      fiscalCode: client.fiscal_code,
      vatNumber: client.vat_number,
      birthDate: client.birth_date,
      birthPlace: client.birth_place,
      address: {
        street: client.address_street,
        locality: client.address_locality,
        city: client.address_city,
        zip: client.address_zip,
        province: client.address_province,
        country: client.address_country,
      },
      status: client.status,
      advisorId: client.advisor_id,
      marketingConsent: Boolean(client.marketing_consent),
      createdAt: client.created_at,
      lastLoginAt: client.last_login_at,
    },
    policies: rows(policies).map((row) => ({
      id: row.id,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      branch: row.branch,
      productName: row.product_name,
      status: row.status,
      effectiveDate: row.effective_date,
      expiryDate: row.expiry_date,
      premium: euro(row.premium_cents),
      paymentFrequency: row.payment_frequency,
      renewalType: row.renewal_type,
      plate: row.plate,
      insuredObject: row.insured_object,
      notes: row.notes,
    })),
    deadlines: rows(deadlines).map((row) => ({
      id: row.id,
      policyId: row.policy_id,
      title: row.title,
      type: row.type,
      dueDate: row.due_date,
      amount: euro(row.amount_cents),
      status: row.status,
      notes: row.notes,
    })),
    claims: rows(claimsList).map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      claimType: row.claim_type,
      occurredAt: row.occurred_at,
      submittedAt: row.submitted_at,
      companyClaimNumber: row.company_claim_number,
      estimatedDamage: euro(row.estimated_damage_cents),
    })),
    quotes: rows(quotes).map((row) => ({
      id: row.id,
      subject: row.subject,
      companyName: row.company_name,
      premium: euro(row.premium_cents),
      status: row.status,
      validUntil: row.valid_until,
    })),
    negotiations: rows(negotiations).map((row) => ({
      id: row.id,
      title: row.title,
      stage: row.stage,
      value: euro(row.value_cents),
      expectedClose: row.expected_close,
    })),
    documents: rows(docs).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title ?? row.original_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      status: row.status,
      uploadedAt: row.uploaded_at,
      claimId: row.claim_id,
      legalHold: Boolean(row.legal_hold),
      retentionUntil: row.retention_until,
      deletedAt: row.deleted_at,
    })),
    threads: rows(threads).map((row) => ({
      id: row.id,
      subject: row.subject,
      category: row.category,
      status: row.status,
      unread: row.unread ?? 0,
      lastMessageAt: row.last_message_at ?? row.created_at,
    })),
    requests: rows(requests).map((row) => ({
      id: row.id,
      reference: row.reference,
      type: row.type,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
    })),
    profileChanges: rows(profileChanges).map(profileChangePayload),
    notes: rows(notes).map((row) => ({
      id: row.id,
      body: row.body,
      author: [row.first_name, row.last_name].filter(Boolean).join(' '),
      createdAt: row.created_at,
    })),
  });
});

admin.post('/clients/:id/notes', async (c) => {
  const id = c.req.param('id');
  await assertClientAccess(c, id);
  const body = await parseJson(c, clientNoteSchema);
  const noteId = randomId();

  await c.env.DB.prepare(
    'INSERT INTO client_notes (id, user_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(noteId, id, c.get('user')!.id, body.body, nowIso())
    .run();

  logAction(c, 'admin.client_note', 'user', id);
  return c.json({ ok: true, noteId }, 201);
});

/** Assegnazione del cliente a un consulente: solo amministratore. */
admin.patch('/clients/:id/assign', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, clientAssignSchema);

  if (body.advisorId) {
    const advisor = await c.env.DB.prepare(
      "SELECT id FROM users WHERE id = ? AND role IN ('advisor','admin') AND deleted_at IS NULL",
    )
      .bind(body.advisorId)
      .first<{ id: string }>();
    if (!advisor) throw badRequest('Consulente non valido.');
  }

  const result = await c.env.DB.prepare(
    "UPDATE users SET advisor_id = ?, updated_at = ? WHERE id = ? AND role = 'client'",
  )
    .bind(body.advisorId, nowIso(), id)
    .run();

  if ((result.meta?.changes ?? 0) === 0) throw notFound('Cliente non trovato.');

  logAction(c, 'admin.client_assigned', 'user', id, { advisorId: body.advisorId });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Polizze
// ---------------------------------------------------------------------------
admin.post('/policies', async (c) => {
  const body = await parseJson(c, policyUpsertSchema);
  await assertClientAccess(c, body.userId);

  const id = randomId();
  const now = nowIso();
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO policies (id, user_id, company_name, policy_number, branch, product_name, status,
                             effective_date, expiry_date, renewal_type, payment_frequency, premium_cents,
                             insured_object, plate, vehicle_make, vehicle_model, insured_address, notes,
                             created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      body.userId,
      body.companyName,
      body.policyNumber,
      body.branch,
      nullify(body.productName),
      body.status ?? 'active',
      nullify(body.effectiveDate),
      nullify(body.expiryDate),
      body.renewalType ?? null,
      body.paymentFrequency ?? null,
      toCents(body.premium),
      nullify(body.insuredObject),
      body.plate ? body.plate.toUpperCase().replace(/\s+/g, '') : null,
      nullify(body.vehicleMake),
      nullify(body.vehicleModel),
      nullify(body.insuredAddress),
      nullify(body.notes),
      c.get('user')!.id,
      now,
      now,
    ),
  ];

  // Scadenza di rinnovo generata insieme alla polizza: e' il motivo per cui il
  // cliente vede le scadenze senza che nessuno le inserisca due volte.
  if (body.createRenewalDeadline && body.expiryDate) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO deadlines (id, user_id, policy_id, title, type, due_date, amount_cents, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'rinnovo', ?, ?, 'pending', ?, ?)`,
      ).bind(
        randomId(),
        body.userId,
        id,
        `Rinnovo ${body.companyName} - ${body.branch}`,
        body.expiryDate,
        toCents(body.premium),
        now,
        now,
      ),
    );
  }

  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
      throw new ApiError(409, 'duplicate_policy', 'Esiste gia’ una polizza con questo numero per questa compagnia.');
    }
    throw error;
  }

  logAction(c, 'admin.policy_created', 'policy', id, { userId: body.userId });
  return c.json({ ok: true, policyId: id }, 201);
});

admin.patch('/policies/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, policyUpsertSchema);
  await assertClientAccess(c, body.userId);

  const result = await c.env.DB.prepare(
    `UPDATE policies SET company_name = ?, policy_number = ?, branch = ?, product_name = ?, status = ?,
                         effective_date = ?, expiry_date = ?, renewal_type = ?, payment_frequency = ?,
                         premium_cents = ?, insured_object = ?, plate = ?, vehicle_make = ?, vehicle_model = ?,
                         insured_address = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      body.companyName,
      body.policyNumber,
      body.branch,
      nullify(body.productName),
      body.status ?? 'active',
      nullify(body.effectiveDate),
      nullify(body.expiryDate),
      body.renewalType ?? null,
      body.paymentFrequency ?? null,
      toCents(body.premium),
      nullify(body.insuredObject),
      body.plate ? body.plate.toUpperCase().replace(/\s+/g, '') : null,
      nullify(body.vehicleMake),
      nullify(body.vehicleModel),
      nullify(body.insuredAddress),
      nullify(body.notes),
      nowIso(),
      id,
      body.userId,
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) throw notFound('Polizza non trovata.');
  logAction(c, 'admin.policy_updated', 'policy', id, { userId: body.userId });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Scadenze
// ---------------------------------------------------------------------------
admin.post('/deadlines', async (c) => {
  const body = await parseJson(c, deadlineUpsertSchema);
  await assertClientAccess(c, body.userId);

  const id = randomId();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO deadlines (id, user_id, policy_id, title, type, due_date, amount_cents, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.userId,
      nullify(body.policyId),
      body.title,
      body.type ?? 'rata',
      body.dueDate,
      toCents(body.amount),
      body.status ?? 'pending',
      nullify(body.notes),
      now,
      now,
    )
    .run();

  logAction(c, 'admin.deadline_created', 'deadline', id, { userId: body.userId });
  return c.json({ ok: true, deadlineId: id }, 201);
});

admin.patch('/deadlines/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, deadlineUpsertSchema);
  await assertClientAccess(c, body.userId);

  const result = await c.env.DB.prepare(
    `UPDATE deadlines SET policy_id = ?, title = ?, type = ?, due_date = ?, amount_cents = ?, status = ?,
                          notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      nullify(body.policyId),
      body.title,
      body.type ?? 'rata',
      body.dueDate,
      toCents(body.amount),
      body.status ?? 'pending',
      nullify(body.notes),
      nowIso(),
      id,
      body.userId,
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) throw notFound('Scadenza non trovata.');
  logAction(c, 'admin.deadline_updated', 'deadline', id, { userId: body.userId, status: body.status });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Preventivi e trattative
// ---------------------------------------------------------------------------
admin.post('/quotes', async (c) => {
  const body = await parseJson(c, quoteUpsertSchema);
  await assertClientAccess(c, body.userId);

  const id = randomId();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO quotes (id, user_id, company_name, subject, branch, premium_cents, coverage_summary,
                         status, valid_until, notes, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.userId,
      nullify(body.companyName),
      body.subject,
      nullify(body.branch),
      toCents(body.premium),
      nullify(body.coverageSummary),
      body.status ?? 'sent',
      nullify(body.validUntil),
      nullify(body.notes),
      c.get('user')!.id,
      now,
      now,
    )
    .run();

  logAction(c, 'admin.quote_created', 'quote', id, { userId: body.userId });
  return c.json({ ok: true, quoteId: id }, 201);
});

admin.patch('/quotes/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, quoteUpsertSchema);
  await assertClientAccess(c, body.userId);

  const result = await c.env.DB.prepare(
    `UPDATE quotes SET company_name = ?, subject = ?, branch = ?, premium_cents = ?, coverage_summary = ?,
                       status = ?, valid_until = ?, notes = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      nullify(body.companyName),
      body.subject,
      nullify(body.branch),
      toCents(body.premium),
      nullify(body.coverageSummary),
      body.status ?? 'sent',
      nullify(body.validUntil),
      nullify(body.notes),
      nowIso(),
      id,
      body.userId,
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) throw notFound('Preventivo non trovato.');
  logAction(c, 'admin.quote_updated', 'quote', id, { userId: body.userId });
  return c.json({ ok: true });
});

admin.post('/negotiations', async (c) => {
  const body = await parseJson(c, negotiationUpsertSchema);
  await assertClientAccess(c, body.userId);

  const id = randomId();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO negotiations (id, user_id, title, stage, expected_close, value_cents, quote_id, notes,
                               last_update, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.userId,
      body.title,
      body.stage ?? 'analisi',
      nullify(body.expectedClose),
      toCents(body.value),
      nullify(body.quoteId),
      nullify(body.notes),
      now,
      c.get('user')!.id,
      now,
      now,
    )
    .run();

  logAction(c, 'admin.negotiation_created', 'negotiation', id, { userId: body.userId });
  return c.json({ ok: true, negotiationId: id }, 201);
});

admin.patch('/negotiations/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, negotiationUpsertSchema);
  await assertClientAccess(c, body.userId);

  const result = await c.env.DB.prepare(
    `UPDATE negotiations SET title = ?, stage = ?, expected_close = ?, value_cents = ?, quote_id = ?,
                             notes = ?, last_update = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      body.title,
      body.stage ?? 'analisi',
      nullify(body.expectedClose),
      toCents(body.value),
      nullify(body.quoteId),
      nullify(body.notes),
      nowIso(),
      nowIso(),
      id,
      body.userId,
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) throw notFound('Trattativa non trovata.');
  logAction(c, 'admin.negotiation_updated', 'negotiation', id, { userId: body.userId });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Sinistri
// ---------------------------------------------------------------------------
admin.get('/claims', async (c) => {
  const { clause, params } = scopeClause(c);
  const { limit, offset } = pagination(c);
  const status = c.req.query('status');

  const statusClause = status === 'da_lavorare'
    ? "AND cl.status IN ('submitted','in_review','waiting_documents')"
    : status
      ? 'AND cl.status = ?'
      : "AND cl.status != 'draft'";
  const statusParams = status && status !== 'da_lavorare' ? [status] : [];

  const { results } = await c.env.DB.prepare(
    `SELECT cl.*, u.first_name, u.last_name, u.email, u.phone, u.mobile,
            (SELECT COUNT(*) FROM documents d WHERE d.claim_id = cl.id AND d.status != 'deleted') AS attachments
     FROM claims cl JOIN users u ON u.id = cl.user_id
     WHERE ${clause} ${statusClause}
     ORDER BY CASE cl.status WHEN 'submitted' THEN 0 WHEN 'waiting_documents' THEN 1 ELSE 2 END,
              cl.updated_at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...params, ...statusParams, limit, offset)
    .all<Record<string, any>>();

  return c.json({
    claims: (results ?? []).map((row) => ({
      id: row.id,
      reference: row.reference,
      status: row.status,
      claimType: row.claim_type,
      occurredAt: row.occurred_at,
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      placeCity: row.place_city,
      companyName: row.company_name,
      companyClaimNumber: row.company_claim_number,
      estimatedDamage: euro(row.estimated_damage_cents),
      attachments: row.attachments ?? 0,
      client: {
        id: row.user_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
        email: row.email,
        phone: row.mobile ?? row.phone,
      },
    })),
    limit,
    offset,
  });
});

admin.get('/claims/:id', async (c) => {
  const id = c.req.param('id');
  const claim = await c.env.DB.prepare('SELECT * FROM claims WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!claim) throw notFound('Pratica non trovata.');
  await assertClientAccess(c, claim.user_id);
  logAction(c, 'admin.claim_opened', 'claim', id);

  const [parties, vehicles, events, docs, client] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM claim_parties WHERE claim_id = ? ORDER BY created_at').bind(id),
    c.env.DB.prepare('SELECT * FROM claim_vehicles WHERE claim_id = ? ORDER BY created_at').bind(id),
    c.env.DB.prepare('SELECT * FROM claim_events WHERE claim_id = ? ORDER BY created_at DESC').bind(id),
    c.env.DB.prepare(
      `SELECT id, category, title, original_name, mime_type, size_bytes, status, uploaded_at, legal_hold
       FROM documents WHERE claim_id = ? ORDER BY uploaded_at`,
    ).bind(id),
    c.env.DB.prepare(
      'SELECT id, first_name, last_name, email, phone, mobile, fiscal_code FROM users WHERE id = ?',
    ).bind(claim.user_id),
  ]);

  const rows = (result: D1Result<unknown>) => (result.results ?? []) as Record<string, any>[];
  const clientRow = (client.results?.[0] ?? {}) as Record<string, any>;

  return c.json({
    claim: {
      id: claim.id,
      reference: claim.reference,
      status: claim.status,
      claimType: claim.claim_type,
      policyId: claim.policy_id,
      companyName: claim.company_name,
      companyClaimNumber: claim.company_claim_number,
      occurredAt: claim.occurred_at,
      placeAddress: claim.place_address,
      placeCity: claim.place_city,
      placeProvince: claim.place_province,
      dynamics: claim.dynamics,
      injuries: Boolean(claim.injuries),
      injuriesDetail: claim.injuries_detail,
      authoritiesInvolved: Boolean(claim.authorities_involved),
      authorityType: claim.authority_type,
      reportNumber: claim.report_number,
      caiSigned: claim.cai_signed,
      estimatedDamage: euro(claim.estimated_damage_cents),
      advisorNotes: claim.advisor_notes,
      extractionSummary: claim.extraction_summary ? JSON.parse(claim.extraction_summary) : null,
      submittedAt: claim.submitted_at,
      closedAt: claim.closed_at,
      createdAt: claim.created_at,
      updatedAt: claim.updated_at,
    },
    client: {
      id: clientRow.id,
      name: [clientRow.first_name, clientRow.last_name].filter(Boolean).join(' '),
      email: clientRow.email,
      phone: clientRow.mobile ?? clientRow.phone,
      fiscalCode: clientRow.fiscal_code,
    },
    parties: rows(parties),
    vehicles: rows(vehicles),
    events: rows(events).map((row) => ({
      id: row.id,
      status: row.status,
      title: row.title,
      detail: row.detail,
      visibleToClient: Boolean(row.visible_to_client),
      createdAt: row.created_at,
    })),
    documents: rows(docs).map((row) => ({
      id: row.id,
      category: row.category,
      title: row.title ?? row.original_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      status: row.status,
      uploadedAt: row.uploaded_at,
      legalHold: Boolean(row.legal_hold),
    })),
  });
});

/**
 * Avanzamento della pratica. Ogni cambio di stato genera un evento in
 * cronologia: quella visibile al cliente contiene solo cio' che l'operatore
 * decide di mostrare, le note interne restano interne.
 */
admin.patch('/claims/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, claimWorkflowSchema);

  const claim = await c.env.DB.prepare('SELECT * FROM claims WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!claim) throw notFound('Pratica non trovata.');
  await assertClientAccess(c, claim.user_id);
  if (claim.status === 'draft') throw forbidden('La bozza e’ ancora in mano al cliente.');

  const now = nowIso();
  const statements = [
    c.env.DB.prepare(
      `UPDATE claims SET
         status = COALESCE(?, status),
         company_name = COALESCE(?, company_name),
         company_claim_number = COALESCE(?, company_claim_number),
         advisor_notes = COALESCE(?, advisor_notes),
         estimated_damage_cents = COALESCE(?, estimated_damage_cents),
         closed_at = CASE WHEN ? IN ('closed','settled','rejected') THEN ? ELSE closed_at END,
         updated_at = ?
       WHERE id = ?`,
    ).bind(
      body.status ?? null,
      nullify(body.companyName),
      nullify(body.companyClaimNumber),
      nullify(body.advisorNotes),
      toCents(body.estimatedDamage),
      body.status ?? '',
      now,
      now,
      id,
    ),
  ];

  const STATUS_LABELS: Record<string, string> = {
    in_review: 'Pratica in esame',
    waiting_documents: 'In attesa di documenti',
    sent_to_company: 'Trasmessa alla compagnia',
    in_progress: 'In lavorazione',
    settled: 'Liquidata',
    closed: 'Pratica chiusa',
    rejected: 'Pratica non accolta',
    submitted: 'Denuncia ricevuta',
  };

  if (body.status || body.clientUpdate) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO claim_events (id, claim_id, status, title, detail, visible_to_client, actor_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        randomId(),
        id,
        body.status ?? claim.status,
        STATUS_LABELS[body.status ?? claim.status] ?? 'Aggiornamento',
        nullify(body.clientUpdate),
        body.clientUpdate ? 1 : body.status ? 1 : 0,
        c.get('user')!.id,
        now,
      ),
    );
  }

  await c.env.DB.batch(statements);

  logAction(c, 'admin.claim_updated', 'claim', id, {
    status: body.status ?? null,
    userId: claim.user_id,
    notifiedClient: Boolean(body.clientUpdate),
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Richieste
// ---------------------------------------------------------------------------
admin.get('/requests', async (c) => {
  const { clause, params } = scopeClause(c);
  const { limit, offset } = pagination(c);

  const [serviceRequests, profileChanges] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT r.*, u.first_name, u.last_name, u.email
       FROM service_requests r JOIN users u ON u.id = r.user_id
       WHERE ${clause} AND r.status NOT IN ('completed','cancelled')
       ORDER BY CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
                r.created_at
       LIMIT ? OFFSET ?`,
    ).bind(...params, limit, offset),
    c.env.DB.prepare(
      `SELECT pc.*, u.first_name, u.last_name, u.email
       FROM profile_change_requests pc JOIN users u ON u.id = pc.user_id
       WHERE ${clause} AND pc.status IN ('received', 'in_review', 'failed')
       ORDER BY CASE pc.status WHEN 'failed' THEN 0 WHEN 'received' THEN 1 ELSE 2 END,
                pc.requested_at
       LIMIT ? OFFSET ?`,
    ).bind(...params, limit, offset),
  ]);

  return c.json({
    requests: ((serviceRequests.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      reference: row.reference,
      type: row.type,
      subject: row.subject,
      detail: row.detail,
      status: row.status,
      priority: row.priority,
      createdAt: row.created_at,
      dueDate: row.due_date,
      client: {
        id: row.user_id,
        name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email,
      },
    })),
    profileChanges: ((profileChanges.results ?? []) as Record<string, any>[]).map(profileChangePayload),
  });
});

admin.patch('/requests/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, requestUpdateSchema);

  const request = await c.env.DB.prepare('SELECT * FROM service_requests WHERE id = ?')
    .bind(id)
    .first<Record<string, any>>();
  if (!request) throw notFound('Richiesta non trovata.');
  await assertClientAccess(c, request.user_id);

  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE service_requests SET status = COALESCE(?, status), priority = COALESCE(?, priority),
                                   due_date = COALESCE(?, due_date),
                                   closed_at = CASE WHEN ? IN ('completed','cancelled') THEN ? ELSE closed_at END,
                                   updated_at = ?
       WHERE id = ?`,
    ).bind(
      body.status ?? null,
      body.priority ?? null,
      nullify(body.dueDate),
      body.status ?? '',
      now,
      now,
      id,
    ),
    c.env.DB.prepare(
      `INSERT INTO request_events (id, request_id, status, note, actor_id, visible_to_client, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).bind(randomId(), id, body.status ?? request.status, nullify(body.note), c.get('user')!.id, now),
  ]);

  logAction(c, 'admin.request_updated', 'service_request', id, { status: body.status ?? null });
  return c.json({ ok: true });
});

admin.patch('/profile-changes/:id', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, profileChangeUpdateSchema);
  const change = await c.env.DB.prepare('SELECT * FROM profile_change_requests WHERE id = ?')
    .bind(id)
    .first<Record<string, any>>();
  if (!change) throw notFound('Variazione del profilo non trovata.');
  await assertClientAccess(c, change.user_id);

  const now = nowIso();
  const finalStatus = ['verified', 'rejected', 'failed'].includes(body.status);
  await c.env.DB.prepare(
    `UPDATE profile_change_requests
     SET status = ?, reviewed_at = ?, reviewed_by = ?, review_note = ?
     WHERE id = ?`,
  )
    .bind(
      body.status,
      finalStatus ? now : null,
      c.get('user')!.id,
      nullify(body.note),
      id,
    )
    .run();

  logAction(c, 'admin.profile_change_updated', 'profile_change_request', id, {
    status: body.status,
    userId: change.user_id,
  });
  return c.json({ ok: true, status: body.status, reviewedAt: finalStatus ? now : null });
});

// ---------------------------------------------------------------------------
// Comunicazioni
// ---------------------------------------------------------------------------
admin.post('/threads/:id/reply', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, advisorMessageSchema);

  const thread = await c.env.DB.prepare('SELECT * FROM message_threads WHERE id = ?')
    .bind(id)
    .first<Record<string, any>>();
  if (!thread) throw notFound('Conversazione non trovata.');
  await assertClientAccess(c, thread.user_id);

  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO messages (id, thread_id, sender_id, sender_role, body, created_at)
       VALUES (?, ?, ?, 'advisor', ?, ?)`,
    ).bind(randomId(), id, c.get('user')!.id, body.body, now),
    c.env.DB.prepare('UPDATE message_threads SET last_message_at = ? WHERE id = ?').bind(now, id),
    // I messaggi del cliente risultano letti: il consulente ha appena risposto.
    c.env.DB.prepare(
      "UPDATE messages SET read_at = ? WHERE thread_id = ? AND sender_role = 'client' AND read_at IS NULL",
    ).bind(now, id),
  ]);

  logAction(c, 'admin.thread_reply', 'message_thread', id, { userId: thread.user_id });
  return c.json({ ok: true }, 201);
});

// ---------------------------------------------------------------------------
// Documenti
// ---------------------------------------------------------------------------
/** Blocco legale: impedisce qualunque eliminazione finche' resta attivo. */
admin.patch('/documents/:id/hold', async (c) => {
  const id = c.req.param('id');
  const body = await parseJson(c, documentHoldSchema);

  const document = await c.env.DB.prepare('SELECT owner_user_id FROM documents WHERE id = ?')
    .bind(id)
    .first<{ owner_user_id: string }>();
  if (!document) throw notFound('Documento non trovato.');
  await assertClientAccess(c, document.owner_user_id);

  await c.env.DB.prepare('UPDATE documents SET legal_hold = ?, updated_at = ? WHERE id = ?')
    .bind(body.legalHold ? 1 : 0, nowIso(), id)
    .run();

  logAction(c, body.legalHold ? 'admin.document_hold_set' : 'admin.document_hold_removed', 'document', id, {
    reason: body.reason ?? null,
  });

  return c.json({ ok: true, legalHold: body.legalHold });
});

/** Segna il documento come archiviato fuori dalla piattaforma (passo che precede l'eliminazione). */
admin.post('/documents/:id/archive', async (c) => {
  const id = c.req.param('id');

  const document = await c.env.DB.prepare('SELECT owner_user_id, status FROM documents WHERE id = ?')
    .bind(id)
    .first<{ owner_user_id: string; status: string }>();
  if (!document) throw notFound('Documento non trovato.');
  await assertClientAccess(c, document.owner_user_id);

  await c.env.DB.prepare(
    "UPDATE documents SET status = 'archived_by_advisor', downloaded_by_advisor_at = ?, updated_at = ? WHERE id = ?",
  )
    .bind(nowIso(), nowIso(), id)
    .run();

  logAction(c, 'admin.document_archived', 'document', id);
  return c.json({ ok: true });
});

/** Spazio occupato: serve a decidere cosa archiviare per restare nel piano gratuito. */
admin.get('/storage', async (c) => {
  const { clause, params } = scopeClause(c);

  const [totals, perCategory, topClients] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS files, COALESCE(SUM(d.size_bytes), 0) AS bytes
       FROM documents d JOIN users u ON u.id = d.owner_user_id
       WHERE d.status != 'deleted' AND ${clause}`,
    ).bind(...params),
    c.env.DB.prepare(
      `SELECT d.category, COUNT(*) AS files, COALESCE(SUM(d.size_bytes), 0) AS bytes
       FROM documents d JOIN users u ON u.id = d.owner_user_id
       WHERE d.status != 'deleted' AND ${clause}
       GROUP BY d.category ORDER BY bytes DESC`,
    ).bind(...params),
    c.env.DB.prepare(
      `SELECT u.id, u.first_name, u.last_name, COUNT(*) AS files, COALESCE(SUM(d.size_bytes), 0) AS bytes
       FROM documents d JOIN users u ON u.id = d.owner_user_id
       WHERE d.status != 'deleted' AND ${clause}
       GROUP BY u.id ORDER BY bytes DESC LIMIT 10`,
    ).bind(...params),
  ]);

  const first = (result: D1Result<unknown>) => (result.results?.[0] ?? {}) as Record<string, any>;

  return c.json({
    total: { files: Number(first(totals).files ?? 0), bytes: Number(first(totals).bytes ?? 0) },
    /** Soglia di attenzione: il piano gratuito R2 comprende 10 GB. */
    freeTierBytes: 10 * 1024 * 1024 * 1024,
    byCategory: (perCategory.results ?? []) as Record<string, any>[],
    topClients: ((topClients.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      files: Number(row.files),
      bytes: Number(row.bytes),
    })),
  });
});

export default admin;
