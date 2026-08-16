import { Hono } from 'hono';
import type { AppEnv, Env } from '../types';
import { ApiError, badRequest, clientIp, forbidden, notFound, nowIso, nullify, userAgent } from '../lib/http';
import { randomId } from '../lib/crypto';
import { auditInBackground } from '../lib/audit';
import { enforceRateLimit } from '../lib/ratelimit';
import { sendMail } from '../lib/mail';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import { claimDraftSchema, claimSubmitSchema, parseJson } from '../lib/validation';

const claims = new Hono<AppEnv>();
claims.use('*', requireAuth);

/**
 * Numero di protocollo progressivo per anno (SIN-2026-0001).
 * L'incremento e' un solo statement con RETURNING: due invii contemporanei
 * ottengono due numeri diversi, senza lock applicativi.
 */
async function nextReference(env: Env, prefix: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const counterName = `${prefix}:${year}`;
  const now = nowIso();

  const row = await env.DB.prepare(
    `INSERT INTO counters (name, value, updated_at) VALUES (?1, 1, ?2)
     ON CONFLICT(name) DO UPDATE SET value = counters.value + 1, updated_at = ?2
     RETURNING value`,
  )
    .bind(counterName, now)
    .first<{ value: number }>();

  const sequence = String(row?.value ?? 1).padStart(4, '0');
  return `${prefix === 'claim_reference' ? 'SIN' : 'RIC'}-${year}-${sequence}`;
}

async function loadOwnClaim(env: Env, id: string, userId: string) {
  const claim = await env.DB.prepare('SELECT * FROM claims WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<Record<string, any>>();
  if (!claim) throw notFound('Pratica non trovata.');
  return claim;
}

function euro(cents: number | null): number | null {
  return cents == null ? null : Math.round(cents) / 100;
}

function toCents(value: number | undefined): number | null {
  return value === undefined ? null : Math.round(value * 100);
}

// ---------------------------------------------------------------------------
// Dati per la precompilazione
// ---------------------------------------------------------------------------
/**
 * Tutto cio' che il modulo guidato puo' compilare da solo prima ancora che
 * l'utente scriva: anagrafica, polizze attive con targa e compagnia, e i
 * soggetti gia' inseriti in pratiche precedenti.
 */
claims.get('/prefill', async (c) => {
  const user = c.get('user')!;

  const [profile, policies, lastParties] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT first_name, last_name, fiscal_code, birth_date, phone, mobile, email,
              address_street, address_city, address_zip, address_province
       FROM users WHERE id = ?`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT id, company_name, policy_number, branch, product_name, plate, vehicle_make, vehicle_model,
              insured_object, effective_date, expiry_date
       FROM policies
       WHERE user_id = ? AND status IN ('active', 'suspended')
       ORDER BY expiry_date IS NULL, expiry_date DESC`,
    ).bind(user.id),
    c.env.DB.prepare(
      `SELECT p.full_name, p.fiscal_code, p.phone, p.email, p.address
       FROM claim_parties p JOIN claims cl ON cl.id = p.claim_id
       WHERE cl.user_id = ? AND p.role = 'assicurato'
       ORDER BY p.created_at DESC LIMIT 1`,
    ).bind(user.id),
  ]);

  const me = (profile.results?.[0] ?? {}) as Record<string, any>;
  const previous = (lastParties.results?.[0] ?? {}) as Record<string, any>;

  return c.json({
    insured: {
      firstName: me.first_name ?? '',
      lastName: me.last_name ?? '',
      fullName: [me.first_name, me.last_name].filter(Boolean).join(' ') || previous.full_name || '',
      fiscalCode: me.fiscal_code ?? previous.fiscal_code ?? '',
      birthDate: me.birth_date ?? '',
      phone: me.mobile ?? me.phone ?? previous.phone ?? '',
      email: me.email ?? previous.email ?? '',
      address: [me.address_street, me.address_zip, me.address_city, me.address_province]
        .filter(Boolean)
        .join(', '),
    },
    policies: ((policies.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      branch: row.branch,
      productName: row.product_name,
      plate: row.plate,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      insuredObject: row.insured_object,
      expiryDate: row.expiry_date,
    })),
    /** Suggerimento del tipo di pratica in base ai rami posseduti. */
    suggestedType:
      ((policies.results ?? []) as Record<string, any>[]).some((row) => row.plate) ? 'rca' : 'altro',
  });
});

// ---------------------------------------------------------------------------
// Bozza
// ---------------------------------------------------------------------------
claims.post('/', requireVerifiedEmail, async (c) => {
  const user = c.get('user')!;
  await enforceRateLimit(c.env, `claim:new:${user.id}`, 10, 3600, 'Troppe pratiche aperte in poco tempo.');

  // Una bozza per volta: se ne esiste gia' una, si riprende quella invece di
  // riempire l'archivio di pratiche vuote.
  const existing = await c.env.DB.prepare(
    "SELECT id FROM claims WHERE user_id = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1",
  )
    .bind(user.id)
    .first<{ id: string }>();

  if (existing) return c.json({ ok: true, claimId: existing.id, resumed: true });

  const id = randomId();
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO claims (id, reference, user_id, status, claim_type, created_at, updated_at, last_saved_at)
     VALUES (?, ?, ?, 'draft', 'altro', ?, ?, ?)`,
  )
    .bind(id, `BOZZA-${id.slice(0, 8)}`, user.id, now, now, now)
    .run();

  auditInBackground(c, {
    actorId: user.id,
    action: 'claim.draft_created',
    entityType: 'claim',
    entityId: id,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });

  return c.json({ ok: true, claimId: id, resumed: false }, 201);
});

/** Salvataggio progressivo del modulo guidato. */
claims.patch('/:id', requireVerifiedEmail, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const claim = await loadOwnClaim(c.env, id, user.id);

  if (claim.status !== 'draft') {
    throw forbidden('La pratica e’ gia’ stata inviata: le modifiche passano dal consulente.');
  }

  const body = await parseJson(c, claimDraftSchema);
  const now = nowIso();

  const statements = [
    c.env.DB.prepare(
      `UPDATE claims SET
         claim_type = COALESCE(?, claim_type),
         policy_id = COALESCE(?, policy_id),
         company_name = COALESCE(?, company_name),
         occurred_at = COALESCE(?, occurred_at),
         place_address = COALESCE(?, place_address),
         place_city = COALESCE(?, place_city),
         place_province = COALESCE(?, place_province),
         dynamics = COALESCE(?, dynamics),
         injuries = COALESCE(?, injuries),
         injuries_detail = COALESCE(?, injuries_detail),
         authorities_involved = COALESCE(?, authorities_involved),
         authority_type = COALESCE(?, authority_type),
         report_number = COALESCE(?, report_number),
         cai_signed = COALESCE(?, cai_signed),
         estimated_damage_cents = COALESCE(?, estimated_damage_cents),
         wizard_step = COALESCE(?, wizard_step),
         extraction_summary = COALESCE(?, extraction_summary),
         last_saved_at = ?,
         updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).bind(
      body.claimType ?? null,
      nullify(body.policyId),
      nullify(body.companyName),
      nullify(body.occurredAt),
      nullify(body.placeAddress),
      nullify(body.placeCity),
      body.placeProvince ? body.placeProvince.toUpperCase() : null,
      nullify(body.dynamics),
      body.injuries === undefined ? null : body.injuries ? 1 : 0,
      nullify(body.injuriesDetail),
      body.authoritiesInvolved === undefined ? null : body.authoritiesInvolved ? 1 : 0,
      nullify(body.authorityType),
      nullify(body.reportNumber),
      body.caiSigned ?? null,
      toCents(body.estimatedDamage),
      body.wizardStep ?? null,
      body.extractionSummary ? JSON.stringify(body.extractionSummary) : null,
      now,
      now,
      id,
      user.id,
    ),
  ];

  // Soggetti e veicoli vengono sostituiti in blocco quando il client li invia:
  // e' l'unico modo semplice per gestire aggiunte e rimozioni dal wizard, e il
  // batch garantisce che non resti mai uno stato intermedio.
  if (body.parties) {
    statements.push(c.env.DB.prepare('DELETE FROM claim_parties WHERE claim_id = ?').bind(id));
    for (const party of body.parties) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO claim_parties (id, claim_id, role, full_name, fiscal_code, birth_date, phone, email,
                                      address, driving_licence, company_name, policy_number, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          randomId(),
          id,
          party.role,
          nullify(party.fullName),
          party.fiscalCode ? party.fiscalCode.toUpperCase() : null,
          nullify(party.birthDate),
          nullify(party.phone),
          nullify(party.email),
          nullify(party.address),
          nullify(party.drivingLicence),
          nullify(party.companyName),
          nullify(party.policyNumber),
          nullify(party.notes),
          now,
        ),
      );
    }
  }

  if (body.vehicles) {
    statements.push(c.env.DB.prepare('DELETE FROM claim_vehicles WHERE claim_id = ?').bind(id));
    for (const vehicle of body.vehicles) {
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO claim_vehicles (id, claim_id, side, plate, make, model, vehicle_type, owner_name,
                                       driver_name, company_name, policy_number, damage_description,
                                       impact_points, drivable, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          randomId(),
          id,
          vehicle.side,
          vehicle.plate ? vehicle.plate.toUpperCase().replace(/\s+/g, '') : null,
          nullify(vehicle.make),
          nullify(vehicle.model),
          nullify(vehicle.vehicleType),
          nullify(vehicle.ownerName),
          nullify(vehicle.driverName),
          nullify(vehicle.companyName),
          nullify(vehicle.policyNumber),
          nullify(vehicle.damageDescription),
          nullify(vehicle.impactPoints),
          vehicle.drivable === undefined ? null : vehicle.drivable ? 1 : 0,
          now,
        ),
      );
    }
  }

  await c.env.DB.batch(statements);
  return c.json({ ok: true, savedAt: now });
});

// ---------------------------------------------------------------------------
// Dettaglio
// ---------------------------------------------------------------------------
claims.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const claim = await loadOwnClaim(c.env, id, user.id);

  const [parties, vehicles, events, docs] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM claim_parties WHERE claim_id = ? ORDER BY created_at').bind(id),
    c.env.DB.prepare('SELECT * FROM claim_vehicles WHERE claim_id = ? ORDER BY created_at').bind(id),
    c.env.DB.prepare(
      'SELECT * FROM claim_events WHERE claim_id = ? AND visible_to_client = 1 ORDER BY created_at DESC',
    ).bind(id),
    c.env.DB.prepare(
      `SELECT id, category, title, original_name, mime_type, size_bytes, status, uploaded_at
       FROM documents WHERE claim_id = ? AND status != 'deleted' ORDER BY uploaded_at`,
    ).bind(id),
  ]);

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
      wizardStep: claim.wizard_step ?? 0,
      extractionSummary: claim.extraction_summary ? JSON.parse(claim.extraction_summary) : null,
      lastSavedAt: claim.last_saved_at,
      submittedAt: claim.submitted_at,
      createdAt: claim.created_at,
      updatedAt: claim.updated_at,
    },
    parties: ((parties.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      role: row.role,
      fullName: row.full_name,
      fiscalCode: row.fiscal_code,
      birthDate: row.birth_date,
      phone: row.phone,
      email: row.email,
      address: row.address,
      drivingLicence: row.driving_licence,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      notes: row.notes,
    })),
    vehicles: ((vehicles.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      side: row.side,
      plate: row.plate,
      make: row.make,
      model: row.model,
      vehicleType: row.vehicle_type,
      ownerName: row.owner_name,
      driverName: row.driver_name,
      companyName: row.company_name,
      policyNumber: row.policy_number,
      damageDescription: row.damage_description,
      impactPoints: row.impact_points,
      drivable: row.drivable == null ? null : Boolean(row.drivable),
    })),
    events: ((events.results ?? []) as Record<string, any>[]).map((row) => ({
      id: row.id,
      status: row.status,
      title: row.title,
      detail: row.detail,
      createdAt: row.created_at,
    })),
    documents: ((docs.results ?? []) as Record<string, any>[]).map((row) => ({
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
// Invio
// ---------------------------------------------------------------------------
/**
 * Controlli obbligatori prima dell'invio. Sono qui e non solo nel browser:
 * il modulo guidato aiuta a compilare, ma la pratica che arriva al consulente
 * deve essere completa comunque venga inviata.
 */
function validateForSubmission(
  claim: Record<string, any>,
  vehicles: Record<string, any>[],
  parties: Record<string, any>[],
): Record<string, string> {
  const problems: Record<string, string> = {};

  if (!claim.claim_type || claim.claim_type === 'altro') {
    problems.claimType = 'Indica il tipo di sinistro.';
  }
  if (!claim.occurred_at) problems.occurredAt = 'Indica data e ora del sinistro.';
  else if (Date.parse(claim.occurred_at) > Date.now() + 3600_000) {
    problems.occurredAt = 'La data del sinistro non puo’ essere nel futuro.';
  }
  if (!claim.place_city) problems.placeCity = 'Indica il comune in cui e’ avvenuto.';
  if (!claim.dynamics || String(claim.dynamics).trim().length < 20) {
    problems.dynamics = 'Descrivi la dinamica in almeno 20 caratteri.';
  }
  if (!parties.some((party) => party.role === 'assicurato' && party.full_name)) {
    problems.parties = 'Indica i dati dell’assicurato.';
  }
  if (claim.claim_type === 'rca') {
    if (!vehicles.some((vehicle) => vehicle.side === 'assicurato' && vehicle.plate)) {
      problems.vehicles = 'Per un sinistro RCA serve la targa del veicolo assicurato.';
    }
    if (!claim.policy_id) problems.policyId = 'Seleziona la polizza interessata.';
  }
  if (claim.authorities_involved && !claim.authority_type) {
    problems.authorityType = 'Indica quale autorita’ e’ intervenuta.';
  }
  if (claim.injuries && !claim.injuries_detail) {
    problems.injuriesDetail = 'Descrivi brevemente le persone coinvolte e le lesioni.';
  }

  return problems;
}

claims.post('/:id/submit', requireVerifiedEmail, async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const claim = await loadOwnClaim(c.env, id, user.id);

  // Idempotente: un secondo invio (doppio click, rete instabile) restituisce
  // la pratica gia' registrata invece di crearne un'altra.
  if (claim.status !== 'draft') {
    return c.json({ ok: true, alreadySubmitted: true, reference: claim.reference, claimId: claim.id });
  }

  await parseJson(c, claimSubmitSchema);
  await enforceRateLimit(c.env, `claim:submit:${user.id}`, 10, 3600, 'Troppi invii ravvicinati.');

  const [partiesResult, vehiclesResult, documentsResult] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT * FROM claim_parties WHERE claim_id = ?').bind(id),
    c.env.DB.prepare('SELECT * FROM claim_vehicles WHERE claim_id = ?').bind(id),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM documents WHERE claim_id = ? AND status != 'deleted'").bind(id),
  ]);

  const parties = (partiesResult.results ?? []) as Record<string, any>[];
  const vehicles = (vehiclesResult.results ?? []) as Record<string, any>[];
  const attachments = Number((documentsResult.results?.[0] as { n?: number })?.n ?? 0);

  const problems = validateForSubmission(claim, vehicles, parties);
  if (Object.keys(problems).length > 0) {
    throw badRequest('La pratica non e’ ancora completa.', { fields: problems });
  }

  const reference = await nextReference(c.env, 'claim_reference');
  const now = nowIso();

  // Il consulente assegnato lavora la pratica; se non c'e', resta da assegnare.
  const owner = await c.env.DB.prepare('SELECT advisor_id, email, first_name, last_name FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ advisor_id: string | null; email: string; first_name: string | null; last_name: string | null }>();

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE claims SET status = 'submitted', reference = ?, submitted_at = ?, submitted_by = ?,
                         assigned_to = COALESCE(assigned_to, ?), updated_at = ?
       WHERE id = ? AND status = 'draft'`,
    ).bind(reference, now, user.id, owner?.advisor_id ?? null, now, id),
    c.env.DB.prepare(
      `INSERT INTO claim_events (id, claim_id, status, title, detail, visible_to_client, actor_id, created_at)
       VALUES (?, ?, 'submitted', 'Denuncia inviata', ?, 1, ?, ?)`,
    ).bind(
      randomId(),
      id,
      `Pratica ${reference} trasmessa al consulente con ${attachments} allegat${attachments === 1 ? 'o' : 'i'}.`,
      user.id,
      now,
    ),
  ]);

  // Avviso al consulente. Se l'invio email fallisce la pratica resta comunque
  // registrata e visibile nel gestionale: l'email e' una notifica, non il canale.
  const advisorEmail = c.env.ADVISOR_EMAIL;
  if (advisorEmail) {
    const nome = [owner?.first_name, owner?.last_name].filter(Boolean).join(' ') || owner?.email;
    await sendMail(c.env, {
      to: advisorEmail,
      subject: `Nuova denuncia di sinistro ${reference}`,
      text: `Nuova pratica ${reference} da ${nome}.\nTipo: ${claim.claim_type}\nData: ${claim.occurred_at}\nLuogo: ${claim.place_city}\nAllegati: ${attachments}\n\nApri il gestionale: ${c.env.APP_URL}/gestionale/sinistri/${id}`,
      html: `<p>Nuova pratica <strong>${reference}</strong> da ${nome}.</p>
             <ul>
               <li>Tipo: ${claim.claim_type}</li>
               <li>Data: ${claim.occurred_at}</li>
               <li>Luogo: ${claim.place_city}</li>
               <li>Allegati: ${attachments}</li>
             </ul>
             <p><a href="${c.env.APP_URL}/gestionale/sinistri/${id}">Apri nel gestionale</a></p>`,
    });
  }

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email,
    action: 'claim.submitted',
    entityType: 'claim',
    entityId: id,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: { reference, attachments, claimType: claim.claim_type },
  });

  return c.json({ ok: true, reference, claimId: id, attachments });
});

/** Una bozza puo' essere abbandonata; una pratica inviata no. */
claims.delete('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const claim = await loadOwnClaim(c.env, id, user.id);
  if (claim.status !== 'draft') throw forbidden('Una pratica inviata non puo’ essere eliminata.');

  const attached = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM documents WHERE claim_id = ? AND status != 'deleted'",
  )
    .bind(id)
    .first<{ n: number }>();

  if (Number(attached?.n ?? 0) > 0) {
    throw new ApiError(
      409,
      'has_attachments',
      'Rimuovi prima gli allegati della bozza, poi potrai eliminarla.',
    );
  }

  await c.env.DB.prepare('DELETE FROM claims WHERE id = ? AND user_id = ?').bind(id, user.id).run();

  auditInBackground(c, {
    actorId: user.id,
    action: 'claim.draft_deleted',
    entityType: 'claim',
    entityId: id,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });

  return c.json({ ok: true });
});

export default claims;
