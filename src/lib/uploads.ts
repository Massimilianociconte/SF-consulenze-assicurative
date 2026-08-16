/**
 * Preparazione e invio dei documenti.
 *
 * Prima di caricare, il file viene ripulito nel browser:
 *  - JPEG: rimozione dei blocchi di metadati (EXIF/XMP). L'operazione e'
 *    realmente lossless — i dati compressi dell'immagine non vengono toccati —
 *    e oltre a ridurre i byte elimina le coordinate GPS che le fotocamere dei
 *    telefoni inseriscono nelle foto dei sinistri.
 *  - PNG: rimozione dei chunk non essenziali (testi, data, EXIF), anch'essa
 *    senza alterare un solo pixel.
 * PDF e HEIC vengono inviati intatti: sono gia' compressi e manipolarli
 * rischierebbe di comprometterne la validita' probatoria.
 *
 * L'impronta SHA-256 viene calcolata qui e inviata come metadato: serve a
 * riconoscere i duplicati e a dimostrare che il file archiviato e' quello
 * caricato.
 */

export interface UploadMeta {
  category: string;
  title?: string;
  claimId?: string;
  policyId?: string;
}

export interface UploadedDocument {
  id: string;
  category: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  uploadedAt: string;
  claimId: string | null;
}

export class UploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export const ACCEPTED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/* -------------------------------------------------------------------------
 * Pulizia lossless
 * ---------------------------------------------------------------------- */

/** Rimuove i segmenti APPn (EXIF, XMP, profili) da un JPEG senza ricodificarlo. */
function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const output: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;

  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];

    // Inizio dei dati compressi: da qui in poi si copia tutto senza toccare nulla.
    if (marker === 0xda) {
      output.push(bytes.subarray(offset));
      break;
    }
    // Marker senza payload.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      output.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;

    const isMetadata = marker >= 0xe1 && marker <= 0xef; // APP1..APP15
    const isComment = marker === 0xfe;
    if (!isMetadata && !isComment) {
      output.push(bytes.subarray(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }

  const total = output.reduce((sum, chunk) => sum + chunk.length, 0);
  if (total >= bytes.length) return null;

  const result = new Uint8Array(total);
  let position = 0;
  for (const chunk of output) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

/** Rimuove i chunk PNG non necessari alla resa dell'immagine. */
function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return null;

  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'acTL', 'fcTL', 'fdAT']);
  const output: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const total = 12 + length;
    if (offset + total > bytes.length) break;

    if (keep.has(type)) output.push(bytes.subarray(offset, offset + total));
    offset += total;
    if (type === 'IEND') break;
  }

  const size = output.reduce((sum, chunk) => sum + chunk.length, 0);
  if (size >= bytes.length) return null;

  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of output) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

export interface PreparedFile {
  blob: Blob;
  checksum: string;
  optimization: string | null;
  originalSize: number;
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function prepareFile(file: File): Promise<PreparedFile> {
  if (!ACCEPTED_MIME.includes(file.type)) {
    throw new UploadError(
      'unsupported_type',
      'Formato non accettato. Puoi caricare PDF, JPEG, PNG, WebP o HEIC.',
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadError(
      'file_too_large',
      `Il file supera i ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB consentiti.`,
    );
  }
  if (file.size === 0) throw new UploadError('empty_file', 'Il file e’ vuoto.');

  const original = new Uint8Array(await file.arrayBuffer());
  let cleaned: Uint8Array | null = null;
  let optimization: string | null = null;

  if (file.type === 'image/jpeg') {
    cleaned = stripJpegMetadata(original);
    if (cleaned) optimization = 'jpeg-metadata-stripped';
  } else if (file.type === 'image/png') {
    cleaned = stripPngMetadata(original);
    if (cleaned) optimization = 'png-metadata-stripped';
  }

  const finalBytes = cleaned ?? original;
  // Copia compatta: evita di trascinarsi dietro l'ArrayBuffer originale e
  // rende il tipo utilizzabile sia da Blob sia da crypto.subtle.
  const buffer = new ArrayBuffer(finalBytes.byteLength);
  new Uint8Array(buffer).set(finalBytes);
  const blob = new Blob([buffer], { type: file.type });

  return {
    blob,
    checksum: await sha256Hex(buffer),
    optimization,
    originalSize: file.size,
  };
}

/* -------------------------------------------------------------------------
 * Invio
 * ---------------------------------------------------------------------- */

/**
 * Caricamento con XMLHttpRequest e non fetch: e' l'unico modo, oggi, per
 * mostrare una barra di avanzamento reale su file da qualche megabyte.
 */
export function uploadDocument(
  file: File,
  meta: UploadMeta,
  onProgress?: (percent: number) => void,
): Promise<UploadedDocument> {
  return prepareFile(file).then(
    (prepared) =>
      new Promise<UploadedDocument>((resolve, reject) => {
        const params = new URLSearchParams({
          category: meta.category,
          name: file.name,
          checksum: prepared.checksum,
          originalSize: String(prepared.originalSize),
        });
        if (meta.title) params.set('title', meta.title);
        if (meta.claimId) params.set('claimId', meta.claimId);
        if (meta.policyId) params.set('policyId', meta.policyId);
        if (prepared.optimization) params.set('optimization', prepared.optimization);

        const request = new XMLHttpRequest();
        request.open('POST', `/api/documents?${params.toString()}`);
        request.setRequestHeader('Content-Type', file.type);
        request.withCredentials = true;

        request.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        });

        request.addEventListener('load', () => {
          let payload: any = null;
          try {
            payload = JSON.parse(request.responseText);
          } catch {
            /* risposta non JSON */
          }

          if (request.status === 201 && payload?.document) {
            resolve(payload.document as UploadedDocument);
          } else {
            reject(
              new UploadError(
                payload?.error?.code ?? 'upload_failed',
                payload?.error?.message ?? 'Caricamento non riuscito. Riprova.',
              ),
            );
          }
        });

        request.addEventListener('error', () =>
          reject(new UploadError('network_error', 'Connessione interrotta durante il caricamento.')),
        );
        request.addEventListener('abort', () =>
          reject(new UploadError('aborted', 'Caricamento annullato.')),
        );

        request.send(prepared.blob);
      }),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
