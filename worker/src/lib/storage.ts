import type { Env } from '../types';
import { ApiError, badRequest } from './http';
import { bytesToBase64Url, timingSafeEqual } from './crypto';

/**
 * Regole di archiviazione dei documenti su R2.
 *
 * Principi:
 *  - il Worker non tocca il contenuto: lo trasmette in streaming a R2, cosi' il
 *    consumo di CPU resta vicino allo zero anche con file da 10 MB (il piano
 *    gratuito concede 10 ms per richiesta);
 *  - il tipo dichiarato dal browser non basta: i primi byte del file devono
 *    corrispondere alla firma del formato;
 *  - il contenuto non e' mai raggiungibile direttamente su R2: passa sempre da
 *    un endpoint che verifica sessione e proprieta'.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_CLAIM_BYTES = 60 * 1024 * 1024; // 60 MB per pratica
export const USER_QUOTA_BYTES = 150 * 1024 * 1024; // 150 MB per utente

export interface AllowedType {
  extension: string;
  /** Anteprima nel browser consentita: solo per formati che non eseguono codice. */
  inline: boolean;
  /** Firme accettate: [offset, byte attesi]. */
  signatures: Array<{ offset: number; bytes: number[] }>;
}

const ASCII = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

/**
 * Formati accettati. Volutamente pochi: sono quelli che servono a una pratica
 * assicurativa e sono tutti gia' compressi, quindi non c'e' nulla da guadagnare
 * con una compressione lossless lato server (vedi nota in fondo al file).
 */
export const ALLOWED_TYPES: Record<string, AllowedType> = {
  'application/pdf': {
    extension: 'pdf',
    inline: true,
    signatures: [{ offset: 0, bytes: ASCII('%PDF') }],
  },
  'image/jpeg': {
    extension: 'jpg',
    inline: true,
    signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  'image/png': {
    extension: 'png',
    inline: true,
    signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  'image/webp': {
    extension: 'webp',
    inline: true,
    signatures: [
      { offset: 0, bytes: ASCII('RIFF') },
      { offset: 8, bytes: ASCII('WEBP') },
    ],
  },
  'image/heic': {
    extension: 'heic',
    inline: false,
    signatures: [{ offset: 4, bytes: ASCII('ftyp') }],
  },
  'image/heif': {
    extension: 'heif',
    inline: false,
    signatures: [{ offset: 4, bytes: ASCII('ftyp') }],
  },
};

export function isAllowedType(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, mime);
}

/** Verifica che i primi byte corrispondano al formato dichiarato. */
export function matchesSignature(head: Uint8Array, mime: string): boolean {
  const type = ALLOWED_TYPES[mime];
  if (!type) return false;
  return type.signatures.every(({ offset, bytes }) =>
    bytes.every((expected, index) => head[offset + index] === expected),
  );
}

/**
 * Legge i primi byte dello stream per la verifica di firma e restituisce uno
 * stream identico all'originale, con la testa reinserita: il contenuto arriva
 * comunque a R2 senza essere bufferizzato per intero in memoria.
 */
export async function peekStream(
  body: ReadableStream<Uint8Array>,
  headBytes = 32,
): Promise<{ head: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let collected = 0;

  while (collected < headBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    collected += value.length;
  }

  const head = new Uint8Array(collected);
  let position = 0;
  for (const chunk of chunks) {
    head.set(chunk, position);
    position += chunk.length;
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return { head: head.slice(0, headBytes), stream };
}

/**
 * Percorso dell'oggetto su R2. Nessuna parte deriva da dati inseriti
 * dall'utente: niente attraversamento di cartelle, niente nomi imprevedibili.
 */
export function buildStorageKey(userId: string, documentId: string, mime: string): string {
  const year = new Date().getUTCFullYear();
  const extension = ALLOWED_TYPES[mime]?.extension ?? 'bin';
  return `u/${userId}/${year}/${documentId}.${extension}`;
}

/** Spazio occupato dai documenti non eliminati di un utente. */
export async function usedQuota(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM documents WHERE owner_user_id = ? AND status != 'deleted'",
  )
    .bind(userId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function assertQuota(env: Env, userId: string, incomingBytes: number): Promise<void> {
  const used = await usedQuota(env, userId);
  if (used + incomingBytes > USER_QUOTA_BYTES) {
    const usedMb = Math.round(used / (1024 * 1024));
    const maxMb = Math.round(USER_QUOTA_BYTES / (1024 * 1024));
    throw new ApiError(
      413,
      'quota_exceeded',
      `Spazio esaurito: hai usato ${usedMb} MB su ${maxMb} MB. Elimina qualche documento o chiedi al consulente di archiviarne.`,
    );
  }
}

/* -------------------------------------------------------------------------
 * Link di download temporanei
 * ---------------------------------------------------------------------- */

const TOKEN_TTL_SECONDS = 300;

async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return bytesToBase64Url(new Uint8Array(signature));
}

/**
 * Token firmato per scaricare un documento senza cookie (utile per aprire il
 * file in una nuova scheda o per un link valido pochi minuti).
 * Vale solo per quel documento e scade dopo 5 minuti.
 */
export async function signDownloadToken(env: Env, documentId: string): Promise<string> {
  if (!env.DOWNLOAD_SIGNING_KEY) {
    throw new ApiError(
      503,
      'signing_not_configured',
      'Link temporanei non disponibili: manca la chiave di firma (DOWNLOAD_SIGNING_KEY).',
    );
  }
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${documentId}.${expires}`;
  return `${payload}.${await hmac(env.DOWNLOAD_SIGNING_KEY, payload)}`;
}

export async function verifyDownloadToken(env: Env, documentId: string, token: string): Promise<void> {
  if (!env.DOWNLOAD_SIGNING_KEY) throw badRequest('Link temporanei non disponibili.');

  const parts = token.split('.');
  if (parts.length !== 3) throw badRequest('Link non valido.');

  const [tokenDocumentId, expiresRaw, signature] = parts;
  const expires = Number.parseInt(expiresRaw, 10);

  if (tokenDocumentId !== documentId) throw badRequest('Link non valido.');
  if (!Number.isFinite(expires) || expires * 1000 <= Date.now()) {
    throw new ApiError(410, 'link_expired', 'Il link e’ scaduto: riaprilo dall’area riservata.');
  }

  const expected = await hmac(env.DOWNLOAD_SIGNING_KEY, `${tokenDocumentId}.${expiresRaw}`);
  if (!timingSafeEqual(signature, expected)) throw badRequest('Link non valido.');
}

/* -------------------------------------------------------------------------
 * Nota sulla compressione
 *
 * La richiesta iniziale prevedeva una compressione lossless lato server. Per i
 * formati accettati (PDF, JPEG, PNG, WebP, HEIC) non porta benefici: sono gia'
 * compressi e un gzip sopra guadagna quasi nulla, mentre costerebbe CPU che sul
 * piano gratuito non c'e' (10 ms per richiesta).
 *
 * L'ottimizzazione utile avviene percio' nel browser, prima dell'invio
 * (src/lib/imageOptimizer.ts):
 *   - rimozione dei metadati EXIF dalle foto: riduce i byte e, soprattutto,
 *     elimina le coordinate GPS che altrimenti finirebbero in archivio;
 *   - ricodifica PNG a parita' di pixel quando produce un file piu' piccolo.
 * La colonna `documents.optimization` registra cosa e' stato applicato, e
 * `original_size_bytes` la dimensione prima dell'ottimizzazione.
 * ---------------------------------------------------------------------- */
