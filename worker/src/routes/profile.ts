import { Hono } from 'hono';
import type { AppEnv, UserRow } from '../types';
import { ApiError, badRequest, clientIp, notFound, nowIso, nullify, userAgent } from '../lib/http';
import { randomId } from '../lib/crypto';
import { audit, auditInBackground } from '../lib/audit';
import { consentsSchema, gdprRequestSchema, parseJson, profileUpdateSchema } from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { PRIVACY_VERSION } from './auth';

const profile = new Hono<AppEnv>();
profile.use('*', requireAuth);

function toProfile(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    emailVerified: Boolean(row.email_verified_at),
    role: row.role,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    mobile: row.mobile,
    pec: row.pec,
    fiscalCode: row.fiscal_code,
    vatNumber: row.vat_number,
    birthDate: row.birth_date,
    birthPlace: row.birth_place,
    addressStreet: row.address_street,
    addressLocality: row.address_locality,
    addressCity: row.address_city,
    addressZip: row.address_zip,
    addressProvince: row.address_province,
    addressCountry: row.address_country,
    marketingConsent: Boolean(row.marketing_consent),
    hasPassword: Boolean(row.password_hash),
    privacyVersion: row.privacy_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const PROFILE_FIELD_NAMES = {
  first_name: 'firstName',
  last_name: 'lastName',
  phone: 'phone',
  mobile: 'mobile',
  pec: 'pec',
  fiscal_code: 'fiscalCode',
  vat_number: 'vatNumber',
  birth_date: 'birthDate',
  birth_place: 'birthPlace',
  address_street: 'addressStreet',
  address_locality: 'addressLocality',
  address_city: 'addressCity',
  address_zip: 'addressZip',
  address_province: 'addressProvince',
  address_country: 'addressCountry',
} as const;

type ProfileDatabaseField = keyof typeof PROFILE_FIELD_NAMES;

function parseStoredObject(value: unknown): Record<string, string | null> {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string | null>)
      : {};
  } catch {
    return {};
  }
}

function toProfileChange(row: Record<string, unknown>) {
  let changedFields: string[] = [];
  try {
    const parsed = JSON.parse(String(row.changed_fields ?? '[]'));
    if (Array.isArray(parsed)) changedFields = parsed.filter((field): field is string => typeof field === 'string');
  } catch {
    changedFields = [];
  }

  return {
    id: row.id,
    status: row.status,
    changedFields,
    before: parseStoredObject(row.before_values),
    after: parseStoredObject(row.after_values),
    origin: row.origin,
    source: row.source,
    sourceReferenceId: row.source_reference_id,
    requestedAt: row.requested_at,
    appliedAt: row.applied_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };
}

profile.get('/', async (c) => {
  const user = c.get('user')!;
  const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  if (!row) throw notFound('Profilo non trovato.');
  return c.json({ profile: toProfile(row) });
});

profile.get('/changes', async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    `SELECT id, status, changed_fields, before_values, after_values, origin, source,
            source_reference_id, requested_at, applied_at, reviewed_at, review_note
     FROM profile_change_requests
     WHERE user_id = ?
     ORDER BY requested_at DESC
     LIMIT 20`,
  )
    .bind(user.id)
    .all<Record<string, unknown>>();

  return c.json({ changes: (results ?? []).map(toProfileChange) });
});

/**
 * Aggiornamento dei dati modificabili dall'utente.
 *
 * Codice fiscale e partita IVA sono modificabili solo finche' sono vuoti:
 * una volta valorizzati identificano il cliente nei contratti gia' emessi, per
 * cui la variazione passa dal consulente tramite una richiesta tracciata.
 */
profile.patch('/', async (c) => {
  const user = c.get('user')!;
  const body = await parseJson(c, profileUpdateSchema);

  const current = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first<UserRow>();
  if (!current) throw notFound('Profilo non trovato.');

  if (body.fiscalCode && current.fiscal_code && nullify(body.fiscalCode) !== current.fiscal_code) {
    throw new ApiError(
      403,
      'locked_field',
      'Il codice fiscale non e’ modificabile online: apri una richiesta al consulente per la variazione.',
    );
  }
  if (body.vatNumber && current.vat_number && nullify(body.vatNumber) !== current.vat_number) {
    throw new ApiError(
      403,
      'locked_field',
      'La partita IVA non e’ modificabile online: apri una richiesta al consulente per la variazione.',
    );
  }

  const next = {
    first_name: body.firstName !== undefined ? nullify(body.firstName) ?? current.first_name : current.first_name,
    last_name: body.lastName !== undefined ? nullify(body.lastName) ?? current.last_name : current.last_name,
    phone: body.phone !== undefined ? nullify(body.phone) : current.phone,
    mobile: body.mobile !== undefined ? nullify(body.mobile) : current.mobile,
    pec: body.pec !== undefined ? nullify(body.pec) : current.pec,
    fiscal_code: current.fiscal_code ?? (body.fiscalCode ? nullify(body.fiscalCode)?.toUpperCase() ?? null : null),
    vat_number: current.vat_number ?? (body.vatNumber ? nullify(body.vatNumber) : null),
    birth_date: body.birthDate !== undefined ? nullify(body.birthDate) : current.birth_date,
    birth_place: body.birthPlace !== undefined ? nullify(body.birthPlace) : current.birth_place,
    address_street: body.addressStreet !== undefined ? nullify(body.addressStreet) : current.address_street,
    address_locality:
      body.addressLocality !== undefined ? nullify(body.addressLocality) : current.address_locality,
    address_city: body.addressCity !== undefined ? nullify(body.addressCity) : current.address_city,
    address_zip: body.addressZip !== undefined ? nullify(body.addressZip) : current.address_zip,
    address_province:
      body.addressProvince !== undefined
        ? nullify(body.addressProvince)?.toUpperCase() ?? null
        : current.address_province,
    address_country:
      body.addressCountry !== undefined
        ? nullify(body.addressCountry)?.toUpperCase() ?? 'IT'
        : current.address_country ?? 'IT',
  };

  const changed = (Object.entries(next) as Array<[ProfileDatabaseField, string | null]>)
    .filter(([key, value]) => current[key] !== value)
    .map(([key]) => key);

  if (changed.length === 0) {
    return c.json({ ok: true, profile: toProfile(current), changeRequest: null });
  }
  if (body.confirmed !== true) {
    throw badRequest('Conferma il riepilogo dei valori precedenti e nuovi prima di inviare la modifica.');
  }

  let source: 'manual' | 'assisted' | 'assisted_corrected' = 'manual';
  let sourceReferenceId: string | null = null;
  if (body.addressSuggestionId) {
    const suggestion = await c.env.DB.prepare(
      `SELECT id, display_street, locality, city, province, postal_code, country
       FROM address_reference
       WHERE id = ?`,
    )
      .bind(body.addressSuggestionId)
      .first<{
        id: string;
        display_street: string;
        locality: string | null;
        city: string;
        province: string;
        postal_code: string | null;
        country: string;
      }>();
    if (!suggestion) throw badRequest('Il suggerimento selezionato non e’ più disponibile: compila l’indirizzo a mano.');

    sourceReferenceId = suggestion.id;
    const same = (left: string | null, right: string | null) =>
      (left ?? '').trim().toUpperCase() === (right ?? '').trim().toUpperCase();
    const addressStillMatches =
      same(next.address_street, suggestion.display_street) &&
      same(next.address_locality, suggestion.locality) &&
      same(next.address_city, suggestion.city) &&
      same(next.address_zip, suggestion.postal_code) &&
      same(next.address_province, suggestion.province) &&
      same(next.address_country, suggestion.country);
    source = addressStillMatches ? 'assisted' : 'assisted_corrected';
  }

  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  for (const key of changed) {
    const publicName = PROFILE_FIELD_NAMES[key];
    before[publicName] = current[key];
    after[publicName] = next[key];
  }

  const now = nowIso();
  const changeId = randomId();
  const [updateResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users SET first_name = ?, last_name = ?, phone = ?, mobile = ?, pec = ?, fiscal_code = ?,
                        vat_number = ?, birth_date = ?, birth_place = ?, address_street = ?, address_locality = ?,
                        address_city = ?, address_zip = ?, address_province = ?, address_country = ?, updated_at = ?
       WHERE id = ?
       RETURNING *`,
    ).bind(
      next.first_name,
      next.last_name,
      next.phone,
      next.mobile,
      next.pec,
      next.fiscal_code,
      next.vat_number,
      next.birth_date,
      next.birth_place,
      next.address_street,
      next.address_locality,
      next.address_city,
      next.address_zip,
      next.address_province,
      next.address_country,
      now,
      user.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO profile_change_requests (
         id, user_id, status, changed_fields, before_values, after_values,
         origin, source, source_reference_id, requested_at, applied_at
       ) VALUES (?, ?, 'received', ?, ?, ?, 'reserved_area', ?, ?, ?, ?)`,
    ).bind(
      changeId,
      user.id,
      JSON.stringify(changed.map((key) => PROFILE_FIELD_NAMES[key])),
      JSON.stringify(before),
      JSON.stringify(after),
      source,
      sourceReferenceId,
      now,
      now,
    ),
  ]);

  const updated = updateResult.results?.[0] as UserRow | undefined;
  if (!updated) throw notFound('Profilo non trovato.');

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email,
    action: 'profile.update',
    entityType: 'user',
    entityId: user.id,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: {
      fields: changed.map((key) => PROFILE_FIELD_NAMES[key]),
      changeRequestId: changeId,
      source,
    },
  });

  return c.json({
    ok: true,
    profile: toProfile(updated),
    changeRequest: {
      id: changeId,
      status: 'received',
      source,
      requestedAt: now,
      appliedAt: now,
      message:
        'Modifica salvata nell’area riservata e resa visibile nel gestionale interno. Il consulente deve ancora verificarla.',
    },
  });
});

profile.patch('/consents', async (c) => {
  const user = c.get('user')!;
  const body = await parseJson(c, consentsSchema);
  const now = nowIso();

  // Stato corrente e storico del consenso in un solo batch: lo storico e'
  // append-only e serve a dimostrare quando e come il consenso e' stato dato o
  // revocato (art. 7 GDPR), quindi non deve poter divergere dallo stato.
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET marketing_consent = ?, updated_at = ? WHERE id = ?').bind(
      body.marketingConsent ? 1 : 0,
      now,
      user.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO consents (id, user_id, kind, granted, version, ip, user_agent, created_at)
       VALUES (?, ?, 'marketing', ?, ?, ?, ?, ?)`,
    ).bind(randomId(), user.id, body.marketingConsent ? 1 : 0, PRIVACY_VERSION, clientIp(c), userAgent(c), now),
  ]);

  auditInBackground(c, {
    actorId: user.id,
    action: 'profile.consents',
    entityType: 'user',
    entityId: user.id,
    ip: clientIp(c),
    metadata: { marketing: body.marketingConsent },
  });

  return c.json({ ok: true, marketingConsent: body.marketingConsent });
});

profile.get('/consents', async (c) => {
  const user = c.get('user')!;
  const { results } = await c.env.DB.prepare(
    'SELECT kind, granted, version, created_at FROM consents WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
  )
    .bind(user.id)
    .all<{ kind: string; granted: number; version: string; created_at: string }>();

  return c.json({
    consents: (results ?? []).map((row) => ({
      kind: row.kind,
      granted: Boolean(row.granted),
      version: row.version,
      createdAt: row.created_at,
    })),
  });
});

/** Esportazione dei dati personali in formato JSON (art. 20 GDPR, portabilita'). */
profile.get('/export', async (c) => {
  const user = c.get('user')!;
  const db = c.env.DB;

  // Un solo batch invece di undici chiamate: un viaggio di rete, e resta
  // ampiamente sotto il limite di 50 query per invocazione del piano gratuito.
  const [
    profileResult,
    policies,
    deadlines,
    quotes,
    negotiations,
    claims,
    documents,
    threads,
    messages,
    requests,
    consents,
    profileChanges,
  ] = await db.batch([
    db.prepare('SELECT * FROM users WHERE id = ?').bind(user.id),
    db.prepare('SELECT * FROM policies WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT * FROM deadlines WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT * FROM quotes WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT * FROM negotiations WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT * FROM claims WHERE user_id = ?').bind(user.id),
    db
      .prepare(
        `SELECT id, category, original_name, mime_type, size_bytes, status, uploaded_at, deleted_at
         FROM documents WHERE owner_user_id = ?`,
      )
      .bind(user.id),
    db.prepare('SELECT * FROM message_threads WHERE user_id = ?').bind(user.id),
    db
      .prepare('SELECT m.* FROM messages m JOIN message_threads t ON t.id = m.thread_id WHERE t.user_id = ?')
      .bind(user.id),
    db.prepare('SELECT * FROM service_requests WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT * FROM consents WHERE user_id = ?').bind(user.id),
    db.prepare('SELECT * FROM profile_change_requests WHERE user_id = ? ORDER BY requested_at DESC').bind(user.id),
  ]);

  const profileRow = (profileResult.results?.[0] as UserRow | undefined) ?? null;

  await audit(c.env, {
    actorId: user.id,
    action: 'gdpr.export',
    entityType: 'user',
    entityId: user.id,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });

  const payload = {
    generatoIl: nowIso(),
    titolare: 'S.F. Consulenze Assicurative di Simone Facchi',
    nota: 'I file allegati non sono inclusi in questo export: sono scaricabili singolarmente dall’area Documenti.',
    profilo: profileRow ? toProfile(profileRow) : null,
    polizze: policies.results,
    scadenze: deadlines.results,
    preventivi: quotes.results,
    trattative: negotiations.results,
    sinistri: claims.results,
    documenti: documents.results,
    conversazioni: threads.results,
    messaggi: messages.results,
    richieste: requests.results,
    consensi: consents.results,
    variazioniProfilo: profileChanges.results,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="dati-personali-${user.id}.json"`,
      'Cache-Control': 'no-store',
    },
  });
});

/** Richieste dell'interessato che richiedono lavorazione manuale (es. cancellazione). */
profile.post('/gdpr-request', async (c) => {
  const user = c.get('user')!;
  const body = await parseJson(c, gdprRequestSchema);

  const id = randomId();
  await c.env.DB.prepare(
    `INSERT INTO gdpr_requests (id, user_id, type, status, detail, requested_at)
     VALUES (?, ?, ?, 'received', ?, ?)`,
  )
    .bind(id, user.id, body.type, nullify(body.detail), nowIso())
    .run();

  await audit(c.env, {
    actorId: user.id,
    action: `gdpr.request.${body.type}`,
    entityType: 'gdpr_request',
    entityId: id,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });

  return c.json({
    ok: true,
    id,
    message:
      'Richiesta registrata. Il consulente ti rispondera’ entro 30 giorni, come previsto dal Regolamento (UE) 2016/679.',
  });
});

export default profile;
