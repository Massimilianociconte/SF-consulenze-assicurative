/**
 * Riconoscimento ottico dei caratteri, interamente nel browser.
 *
 * Nessuna immagine lascia il dispositivo: motore (Tesseract compilato in
 * WebAssembly) e dizionario italiano vengono serviti dal nostro stesso dominio
 * — non da un CDN esterno, che altrimenti saprebbe quando qualcuno sta leggendo
 * un documento — e l'elaborazione avviene in un worker della pagina.
 * Il server non vede né l'immagine né il testo: riceve al massimo i campi che
 * l'utente conferma.
 *
 * Costo per l'infrastruttura: zero. Il peso (circa 5 MB fra motore e
 * dizionario) viene scaricato solo da chi chiede davvero di leggere un
 * documento, e resta poi nella cache del browser.
 *
 * Prima di passare l'immagine al motore viene applicata una preparazione che
 * conta più del motore stesso sulla resa finale: ridimensionamento all'altezza
 * utile, scala di grigi e **soglia adattiva locale**. Quest'ultima è ciò che
 * permette di leggere la fotografia di un documento scattata col telefono, dove
 * un lato è in ombra e l'altro in piena luce: una soglia unica per tutta
 * l'immagine perderebbe metà del testo.
 */

export interface OcrProgress {
  /** 0-100 */
  percent: number;
  stage: string;
}

export interface OcrResult {
  text: string;
  /** Confidenza media dichiarata dal motore (0-100). */
  confidence: number;
  /** Millisecondi impiegati: utile per capire se conviene ridurre la risoluzione. */
  elapsedMs: number;
}

/** Percorsi locali: nessuna richiesta verso domini di terzi. */
const OCR_BASE = '/ocr';

/** Oltre questa dimensione l'accuratezza non migliora e il tempo raddoppia. */
const MAX_SIDE = 2200;
/** Sotto questa, i caratteri piccoli diventano illeggibili: conviene ingrandire. */
const MIN_SIDE = 1000;

/* -------------------------------------------------------------------------
 * Preparazione dell'immagine
 * ---------------------------------------------------------------------- */

async function loadImage(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(source);
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Immagine non leggibile.'));
    image.src = URL.createObjectURL(source);
  });
}

/**
 * Soglia adattiva secondo Bradley-Roth: per ogni pixel si confronta il valore
 * con la media della zona circostante, calcolata in tempo costante grazie
 * all'immagine integrale. Gestisce ombre e illuminazione irregolare, che sono
 * il motivo principale per cui l'OCR fallisce sulle foto scattate al volo.
 */
function adaptiveThreshold(data: Uint8ClampedArray, width: number, height: number): void {
  const gray = new Float64Array(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel++) {
    // Pesi della luminanza percepita.
    gray[pixel] = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
  }

  // Immagine integrale: somma cumulativa, così la media di un rettangolo
  // qualsiasi si ottiene con quattro letture.
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const window = Math.max(8, Math.floor(width / 24));
  const half = Math.floor(window / 2);
  // Quanto un pixel deve essere più scuro della media per essere "inchiostro".
  const tolerance = 0.86;

  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - half);
    const bottom = Math.min(height - 1, y + half);

    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - half);
      const right = Math.min(width - 1, x + half);
      const count = (bottom - top + 1) * (right - left + 1);

      const sum =
        integral[(bottom + 1) * (width + 1) + (right + 1)] -
        integral[top * (width + 1) + (right + 1)] -
        integral[(bottom + 1) * (width + 1) + left] +
        integral[top * (width + 1) + left];

      const value = gray[y * width + x] <= (sum / count) * tolerance ? 0 : 255;
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
}

/** Ridimensiona, converte in bianco e nero e restituisce il canvas pronto per il motore. */
export async function prepareImage(source: Blob): Promise<HTMLCanvasElement> {
  const image = await loadImage(source);
  const width = 'width' in image ? image.width : 0;
  const height = 'height' in image ? image.height : 0;

  const longest = Math.max(width, height);
  let scale = 1;
  if (longest > MAX_SIDE) scale = MAX_SIDE / longest;
  else if (longest < MIN_SIDE) scale = Math.min(2, MIN_SIDE / longest);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Elaborazione immagine non disponibile in questo browser.');

  context.imageSmoothingQuality = 'high';
  context.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  adaptiveThreshold(imageData.data, canvas.width, canvas.height);
  context.putImageData(imageData, 0, 0);

  if ('close' in image && typeof image.close === 'function') image.close();
  return canvas;
}

/* -------------------------------------------------------------------------
 * Motore
 * ---------------------------------------------------------------------- */

let workerPromise: Promise<any> | null = null;

/**
 * Il worker viene creato una sola volta e riusato: l'inizializzazione (scarico e
 * compilazione del WebAssembly) è la parte lenta, il riconoscimento successivo
 * è immediato.
 */
async function getWorker(onProgress?: (progress: OcrProgress) => void): Promise<any> {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const { createWorker } = await import('tesseract.js');

    return createWorker('ita', 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: OCR_BASE,
      langPath: OCR_BASE,
      // Il dizionario è servito già compresso.
      gzip: true,
      logger: (message: { status?: string; progress?: number }) => {
        if (!onProgress) return;
        const stage =
          message.status === 'loading tesseract core'
            ? 'Preparazione del motore…'
            : message.status === 'loading language traineddata' || message.status === 'loading language traineddata (from cache)'
              ? 'Caricamento del dizionario italiano…'
              : message.status === 'recognizing text'
                ? 'Lettura del documento…'
                : 'Elaborazione…';
        onProgress({ percent: Math.round((message.progress ?? 0) * 100), stage });
      },
    });
  })();

  try {
    return await workerPromise;
  } catch (error) {
    // Un fallimento non deve impedire di riprovare più tardi.
    workerPromise = null;
    throw error;
  }
}

/** Libera la memoria del motore: chiamato quando si esce dal modulo sinistri. */
export async function releaseOcr(): Promise<void> {
  if (!workerPromise) return;
  try {
    const worker = await workerPromise;
    await worker.terminate();
  } catch {
    /* già chiuso */
  }
  workerPromise = null;
}

export function isOcrSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof document !== 'undefined';
}

/** Riconosce il testo di un'immagine (foto o scansione). */
export async function recognizeImage(
  source: Blob,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  if (!isOcrSupported()) {
    throw new Error('Questo browser non supporta la lettura automatica dei documenti.');
  }

  const startedAt = performance.now();
  onProgress?.({ percent: 0, stage: 'Preparazione dell’immagine…' });

  const canvas = await prepareImage(source);
  const worker = await getWorker(onProgress);

  // Documenti assicurativi: testo su più blocchi, con tabelle. La modalità
  // automatica con analisi di layout dà i risultati migliori.
  await worker.setParameters({
    tessedit_pageseg_mode: '3',
    // Trattini e sbarre servono: compaiono in numeri di polizza e date.
    preserve_interword_spaces: '1',
  });

  const { data } = await worker.recognize(canvas);

  return {
    text: data.text ?? '',
    confidence: data.confidence ?? 0,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

/**
 * Riconosce le prime pagine di un PDF scansionato, disegnandole su canvas con
 * pdf.js e passandole al motore. Serve per i verbali e le constatazioni
 * amichevoli acquisiti con lo scanner, che non hanno livello di testo.
 */
export async function recognizeScannedPdf(
  file: Blob,
  maxPages = 2,
  onProgress?: (progress: OcrProgress) => void,
): Promise<OcrResult> {
  const startedAt = performance.now();
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document_ = await loadingTask.promise;
  const pages = Math.min(document_.numPages, maxPages);

  let text = '';
  let confidenceSum = 0;

  for (let pageNumber = 1; pageNumber <= pages; pageNumber++) {
    onProgress?.({ percent: 0, stage: `Lettura pagina ${pageNumber} di ${pages}…` });

    const page = await document_.getPage(pageNumber);
    // Scala 2: equivale a circa 150 DPI, sufficiente per il testo di un verbale
    // senza far esplodere memoria e tempi su un telefono.
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(viewport.width, MAX_SIDE);
    canvas.height = Math.round((canvas.width / viewport.width) * viewport.height);

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Elaborazione PDF non disponibile in questo browser.');

    await page.render({
      canvas,
      canvasContext: context,
      viewport: page.getViewport({ scale: (canvas.width / viewport.width) * 2 }),
    } as any).promise;

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    adaptiveThreshold(imageData.data, canvas.width, canvas.height);
    context.putImageData(imageData, 0, 0);

    const worker = await getWorker(onProgress);
    await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(canvas);

    text += `${data.text ?? ''}\n`;
    confidenceSum += data.confidence ?? 0;
  }

  await loadingTask.destroy();

  return {
    text: text.trim(),
    confidence: pages > 0 ? confidenceSum / pages : 0,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
