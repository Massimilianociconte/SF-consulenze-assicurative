import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import {
  ApiError,
  badRequest,
  clientIp,
  forbidden,
  isoIn,
  notFound,
  nowIso,
  nullify,
  userAgent,
} from '../lib/http';
import { randomId } from '../lib/crypto';
import { auditInBackground } from '../lib/audit';
import { enforceRateLimit } from '../lib/ratelimit';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth';
import {
  ALLOWED_TYPES,
  MAX_FILE_BYTES,
  assertQuota,
  buildStorageKey,
  isAllowedType,
  matchesSignature,
  peekStream,
  signDownloadToken,
  usedQuota,
  verifyDownloadToken,
  USER_QUOTA_BYTES,
} from '../lib/storage';
import { documentDeleteSchema, documentMetaSchema, parseJson } from '../lib/validation';

const documents = new Hono<AppEnv>();

const CATEGORIES = [
  'documento_identita',
  'codice_fiscale',
  'patente',
  'libretto',
  'polizza',
  'quietanza',
  'preventivo',
  'fattura',
  'verbale',
  'cai',
  'fotografia',
  'dichiarazione',
  'perizia',
  'referto',
  'corrispondenza',
  'altro',
] as const;

interface DocumentRow {
  id: string;
  owner_user_id: string;
  claim_id: string | null;
  policy_id: string | null;
  category: string;
  title: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_key: string;
  status: string;
  legal_hold: number;
  retention_until: string | null;
  uploaded_at: string;
  checksum_sha256: string;
  etag: string | null;
  optimization: string | null;
  original_size_bytes: number | null;
  deleted_at: string | null;
}

/** Documento accessibile all'utente corrente (proprietario, consulente assegnato o admin). */
async function loadAccessibleDocument(c: Context<AppEnv>, id: string): Promise<DocumentRow> {
  const user = c.get('user')!;

  const row = await c.env.DB.prepare(
    `SELECT d.*, u.advisor_id AS owner_advisor_id
     FROM documents d JOIN users u ON u.id = d.owner_user_id
     WHERE d.id = ?`,
  )
    .bind(id)
    .first<DocumentRow & { owner_advisor_id: string | null }>();

  if (!row) throw notFound('Documento non trovato.');

  const isOwner = row.owner_user_id === user.id;
  const isAssignedAdvisor = user.role === 'advisor' && row.owner_advisor_id === user.id;
  const isAdmin = user.role === 'admin';

  if (!isOwner && !isAssignedAdvisor && !isAdmin) throw notFound('Documento non trovato.');

  if (!isOwner) {
    auditInBackground(c, {
      actorId: user.id,
      actorEmail: user.email,
      action: 'document.cross_access',
      entityType: 'document',
      entityId: id,
      ip: clientIp(c),
      userAgent: userAgent(c),
      metadata: { ownerId: row.owner_user_id },
    });
  }

  return row;
}


// ---------------------------------------------------------------------------
// Caricamento
// ---------------------------------------------------------------------------
/**
 * Il corpo della richiesta e' il file, i metadati stanno nella query string:
 * cosi' il contenuto viaggia in streaming verso R2 senza passare per la
 * memoria del Worker e senza consumare CPU (limite del piano gratuito: 10 ms).
 */
documents.post('/', requireAuth, requireVerifiedEmail, async (c) => {
  const user = c.get('user')!;
  await enforceRateLimit(c.env, `upload:${user.id}`, 60, 3600, 'Troppi caricamenti ravvicinati.');

  const query = c.req.query();
  const mime = (c.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  const declaredSize = Number.parseInt(c.req.header('Content-Length') ?? '0', 10);

  if (!isAllowedType(mime)) {
    throw badRequest(
      `Formato non accettato. Sono ammessi PDF, JPEG, PNG, WebP e HEIC (ricevuto: ${mime || 'sconosciuto'}).`,
    );
  }
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
    throw badRequest('Dimensione del file non dichiarata.');
  }
  if (declaredSize > MAX_FILE_BYTES) {
    throw new ApiError(
      413,
      'file_too_large',
      `File troppo grande: massimo ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB per documento.`,
    );
  }

  const meta = documentMetaSchema.safeParse({
    category: query.category,
    title: query.title,
    originalName: query.name,
    claimId: query.claimId,
    policyId: query.policyId,
    checksum: query.checksum,
    optimization: query.optimization,
    originalSize: query.originalSize ? Number.parseInt(query.originalSize, 10) : undefined,
  });
  if (!meta.success) {
    throw badRequest('Metadati del documento non validi.', {
      fields: Object.fromEntries(meta.error.issues.map((issue) => [issue.path.join('.'), issue.message])),
    });
  }

  await assertQuota(c.env, user.id, declaredSize);

  // La pratica indicata deve essere dell'utente e ancora modificabile.
  if (meta.data.claimId) {
    const claim = await c.env.DB.prepare(
      "SELECT id, status FROM claims WHERE id = ? AND user_id = ?",
    )
      .bind(meta.data.claimId, user.id)
      .first<{ id: string; status: string }>();
    if (!claim) throw badRequest('Pratica non trovata.');
    if (claim.status === 'closed' || claim.status === 'rejected') {
      throw forbidden('La pratica e’ chiusa: non accetta nuovi allegati.');
    }
  }

  if (!c.req.raw.body) throw badRequest('Nessun file ricevuto.');

  // Verifica della firma del formato: il tipo dichiarato dal browser non basta.
  const { head, stream } = await peekStream(c.req.raw.body);
  if (!matchesSignature(head, mime)) {
    auditInBackground(c, {
      actorId: user.id,
      action: 'document.upload_rejected',
      outcome: 'failure',
      ip: clientIp(c),
      userAgent: userAgent(c),
      metadata: { reason: 'signature_mismatch', declared: mime },
    });
    throw badRequest('Il contenuto del file non corrisponde al formato dichiarato.');
  }

  const documentId = randomId();
  const storageKey = buildStorageKey(user.id, documentId, mime);
  const now = nowIso();

  // R2 richiede uno stream di lunghezza nota. FixedLengthStream fa due cose in
  // una: soddisfa quel requisito e impone che i byte ricevuti siano esattamente
  // quelli dichiarati, quindi un client che mente sulla dimensione interrompe
  // la scrittura invece di riempire lo spazio.
  const fixed = new FixedLengthStream(declaredSize);
  const pump = stream.pipeTo(fixed.writable);

  let uploaded: R2Object | null;
  try {
    const [object] = await Promise.all([
      c.env.DOCS.put(storageKey, fixed.readable, {
        httpMetadata: { contentType: mime },
        customMetadata: { ownerId: user.id, documentId, category: meta.data.category },
      }),
      pump,
    ]);
    uploaded = object;
  } catch (error) {
    await c.env.DOCS.delete(storageKey).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    if (/length|size/i.test(message)) {
      throw new ApiError(
        400,
        'size_mismatch',
        'La dimensione del file non corrisponde a quella dichiarata: riprova a caricarlo.',
      );
    }
    console.error('[documents] scrittura su R2 fallita', error);
    throw new ApiError(502, 'storage_error', 'Archiviazione non riuscita. Riprova fra poco.');
  }

  const storedSize = uploaded?.size ?? declaredSize;

  // Conservazione: la durata dipende dalla tipologia (tabella retention_policies,
  // modificabile senza toccare il codice).
  const retention = await c.env.DB.prepare('SELECT months FROM retention_policies WHERE category = ?')
    .bind(meta.data.category)
    .first<{ months: number }>();
  const retentionUntil = retention ? isoIn(retention.months * 30 * 86_400) : null;

  try {
    await c.env.DB.prepare(
      `INSERT INTO documents (id, owner_user_id, uploaded_by, claim_id, policy_id, category, title,
                              original_name, mime_type, size_bytes, stored_size_bytes, compression,
                              checksum_sha256, etag, storage_key, status, retention_until, uploaded_at,
                              updated_at, uploaded_ip, optimization, original_size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, 'uploaded', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        documentId,
        user.id,
        user.id,
        meta.data.claimId ?? null,
        meta.data.policyId ?? null,
        meta.data.category,
        nullify(meta.data.title),
        meta.data.originalName,
        mime,
        storedSize,
        storedSize,
        meta.data.checksum ?? '',
        uploaded?.etag ?? null,
        storageKey,
        retentionUntil,
        now,
        now,
        clientIp(c),
        nullify(meta.data.optimization),
        meta.data.originalSize ?? null,
      )
      .run();
  } catch (error) {
    // Se i metadati non si scrivono, l'oggetto su R2 resterebbe orfano.
    await c.env.DOCS.delete(storageKey).catch(() => undefined);
    throw error;
  }

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email,
    action: 'document.upload',
    entityType: 'document',
    entityId: documentId,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: { category: meta.data.category, size: storedSize, claimId: meta.data.claimId ?? null },
  });

  return c.json(
    {
      ok: true,
      document: {
        id: documentId,
        category: meta.data.category,
        title: meta.data.title || meta.data.originalName,
        originalName: meta.data.originalName,
        mimeType: mime,
        sizeBytes: storedSize,
        status: 'uploaded',
        uploadedAt: now,
        claimId: meta.data.claimId ?? null,
      },
    },
    201,
  );
});

// ---------------------------------------------------------------------------
// Spazio disponibile
// ---------------------------------------------------------------------------
documents.get('/quota', requireAuth, async (c) => {
  const user = c.get('user')!;
  const used = await usedQuota(c.env, user.id);
  return c.json({
    usedBytes: used,
    limitBytes: USER_QUOTA_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
    allowedTypes: Object.keys(ALLOWED_TYPES),
  });
});

// ---------------------------------------------------------------------------
// Metadati e contenuto
// ---------------------------------------------------------------------------
documents.get('/:id', requireAuth, async (c) => {
  const row = await loadAccessibleDocument(c, c.req.param('id'));
  return c.json({
    document: {
      id: row.id,
      category: row.category,
      title: row.title ?? row.original_name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      originalSizeBytes: row.original_size_bytes,
      optimization: row.optimization,
      status: row.status,
      uploadedAt: row.uploaded_at,
      retentionUntil: row.retention_until,
      legalHold: Boolean(row.legal_hold),
      claimId: row.claim_id,
      policyId: row.policy_id,
      checksum: row.checksum_sha256 || null,
      inline: ALLOWED_TYPES[row.mime_type]?.inline ?? false,
    },
  });
});

/** Contenuto del file, autenticato dal cookie di sessione. */
documents.get('/:id/content', requireAuth, async (c) => {
  const row = await loadAccessibleDocument(c, c.req.param('id'));
  if (row.status === 'deleted') {
    throw new ApiError(410, 'document_deleted', 'Documento eliminato dall’archivio online.');
  }

  const object = await c.env.DOCS.get(row.storage_key);
  if (!object) throw notFound('Contenuto non piu’ disponibile.');

  auditInBackground(c, {
    actorId: c.get('user')!.id,
    action: 'document.download',
    entityType: 'document',
    entityId: row.id,
    ip: clientIp(c),
    userAgent: userAgent(c),
  });

  return streamDocument(object, row, c.req.query('download') === '1');
});

/** Link temporaneo (5 minuti) utilizzabile senza cookie, es. per aprire il file in una nuova scheda. */
documents.post('/:id/link', requireAuth, async (c) => {
  const row = await loadAccessibleDocument(c, c.req.param('id'));
  if (row.status === 'deleted') throw new ApiError(410, 'document_deleted', 'Documento eliminato.');

  const token = await signDownloadToken(c.env, row.id);
  return c.json({
    url: `${c.env.APP_URL.replace(/\/$/, '')}/api/documents/${row.id}/shared?token=${encodeURIComponent(token)}`,
    expiresInSeconds: 300,
  });
});

/** Download tramite link temporaneo: nessuna sessione, solo firma valida. */
documents.get('/:id/shared', async (c) => {
  const id = c.req.param('id');
  const token = c.req.query('token');
  if (!token) throw badRequest('Link non valido.');

  await verifyDownloadToken(c.env, id, token);

  const row = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocumentRow>();
  if (!row || row.status === 'deleted') throw notFound('Documento non disponibile.');

  const object = await c.env.DOCS.get(row.storage_key);
  if (!object) throw notFound('Contenuto non piu’ disponibile.');

  return streamDocument(object, row, c.req.query('download') === '1');
});

function streamDocument(object: R2ObjectBody, row: DocumentRow, forceDownload: boolean): Response {
  const inline = !forceDownload && (ALLOWED_TYPES[row.mime_type]?.inline ?? false);
  const filename = row.original_name.replace(/["\\]/g, '');

  return new Response(object.body, {
    headers: {
      'Content-Type': row.mime_type,
      'Content-Length': String(row.size_bytes),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      // Il file appartiene all'utente: mai in cache condivise, e nessuna
      // possibilita' che il browser lo interpreti come altro tipo.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      // Anche se il contenuto fosse un PDF ostile, viene aperto senza accesso
      // a script, form o navigazione verso l'origine.
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; object-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

// ---------------------------------------------------------------------------
// Eliminazione controllata
// ---------------------------------------------------------------------------
/**
 * Elimina il contenuto da R2 mantenendo i metadati: il consulente libera spazio
 * dopo aver archiviato il file in locale, ma resta traccia di cosa esisteva,
 * chi lo ha eliminato e quando.
 *
 * Vincoli: blocco legale (`legal_hold`) sempre ostativo; conservazione minima
 * ancora in corso superabile solo da consulente o amministratore, che devono
 * dichiararlo esplicitamente e finiscono nel registro.
 */
documents.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user')!;
  const row = await loadAccessibleDocument(c, c.req.param('id'));
  const body = await parseJson(c, documentDeleteSchema);

  if (row.status === 'deleted') return c.json({ ok: true, alreadyDeleted: true });

  if (row.legal_hold) {
    throw forbidden('Documento sotto blocco legale: non puo’ essere eliminato.');
  }

  const isOwner = row.owner_user_id === user.id;
  const isStaff = user.role === 'advisor' || user.role === 'admin';
  const retentionActive = Boolean(row.retention_until && Date.parse(row.retention_until) > Date.now());

  if (isOwner && !isStaff) {
    // Il cliente puo' solo correggere un caricamento sbagliato: entro 24 ore e
    // se il documento non e' gia' collegato a una pratica inviata.
    const withinGrace = Date.now() - Date.parse(row.uploaded_at) < 24 * 3600 * 1000;
    if (!withinGrace) {
      throw forbidden(
        'Trascorse 24 ore dal caricamento il documento puo’ essere rimosso solo dal consulente: scrivigli dalla sezione Comunicazioni.',
      );
    }
    if (row.claim_id) {
      const claim = await c.env.DB.prepare('SELECT status FROM claims WHERE id = ?')
        .bind(row.claim_id)
        .first<{ status: string }>();
      if (claim && claim.status !== 'draft') {
        throw forbidden('Il documento e’ allegato a una pratica gia’ inviata: contatta il consulente.');
      }
    }
  } else if (retentionActive && !body.acknowledgeRetention) {
    throw new ApiError(
      409,
      'retention_active',
      `Conservazione obbligatoria fino al ${row.retention_until?.slice(0, 10)}. Per procedere conferma di aver archiviato il documento fuori dalla piattaforma.`,
    );
  }

  // Prima il contenuto (libera spazio), poi i metadati: se il secondo passo
  // fallisse resterebbe una riga marcata da riconciliare, mai un file orfano.
  await c.env.DOCS.delete(row.storage_key);

  await c.env.DB.prepare(
    `UPDATE documents
     SET status = 'deleted', deleted_at = ?, deleted_by = ?, deletion_reason = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(nowIso(), user.id, nullify(body.reason), nowIso(), row.id)
    .run();

  auditInBackground(c, {
    actorId: user.id,
    actorEmail: user.email,
    action: 'document.delete',
    entityType: 'document',
    entityId: row.id,
    ip: clientIp(c),
    userAgent: userAgent(c),
    metadata: {
      ownerId: row.owner_user_id,
      reason: body.reason ?? null,
      retentionActive,
      acknowledgedRetention: Boolean(body.acknowledgeRetention),
      sizeBytes: row.size_bytes,
    },
  });

  return c.json({ ok: true });
});

export default documents;
