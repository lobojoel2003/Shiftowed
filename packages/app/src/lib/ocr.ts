/**
 * On-device OCR with Tesseract (WebAssembly). The engine, its WASM core and the
 * English model are served by this app from /ocr, so a screenshot is never
 * uploaded anywhere.
 */
import type { Worker } from "tesseract.js";
import type { OcrLine, OcrWord } from "./parseSchedule";

export interface OcrProgress {
  /** Machine-readable stage from Tesseract, e.g. "recognizing text". */
  status: string;
  /** 0 to 1 within the current stage. */
  progress: number;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  /** Mean word confidence, 0 to 100. */
  confidence: number;
}

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: OcrProgress) => void) | null = null;

function assetBase(): string {
  return new URL(`${import.meta.env.BASE_URL}ocr`, window.location.href).href;
}

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    const base = assetBase();
    return createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${base}/worker.min.js`,
      corePath: base,
      langPath: base,
      gzip: true,
      logger: (m) => progressListener?.({ status: m.status, progress: m.progress }),
    });
  })().catch((err: unknown) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

/** Download and initialise the OCR engine so it works offline later. */
export async function prepareOcr(onProgress?: (p: OcrProgress) => void): Promise<void> {
  progressListener = onProgress ?? null;
  try {
    await getWorker();
  } finally {
    progressListener = null;
  }
}

export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  await w?.terminate();
}

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare a screenshot for OCR: upscale small images and invert dark-mode
 * screenshots (light text on a dark background reads poorly).
 */
export async function preprocess(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await loadBitmap(blob);
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = w < 1000 ? Math.min(3, 1600 / w) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4 * 16) {
    sum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
    n++;
  }
  if (n > 0 && sum / n < 110) {
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 255 - px[i]!;
      px[i + 1] = 255 - px[i + 1]!;
      px[i + 2] = 255 - px[i + 2]!;
    }
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}

interface PositionedWord extends OcrWord {
  y0: number;
  y1: number;
}

/**
 * Regroup words into visual rows across Tesseract's layout blocks. Grid
 * schedules are often split into column blocks; rows put each day's header and
 * times back on one line, left to right.
 */
export function wordsToRows(words: PositionedWord[]): OcrLine[] {
  const sorted = words
    .filter((w) => w.text.trim().length > 0)
    .sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  interface Row {
    y0: number;
    y1: number;
    words: PositionedWord[];
  }
  const rows: Row[] = [];
  for (const w of sorted) {
    const mid = (w.y0 + w.y1) / 2;
    // A word joins a row when its middle falls inside the row's vertical span,
    // or the row's middle falls inside the word. Small glyphs such as "-" have
    // tiny boxes, so this is measured against the row, not the word.
    let best: Row | undefined;
    let bestDist = Infinity;
    for (const r of rows) {
      const rMid = (r.y0 + r.y1) / 2;
      const inside = (mid >= r.y0 && mid <= r.y1) || (rMid >= w.y0 && rMid <= w.y1);
      const dist = Math.abs(rMid - mid);
      if (inside && dist < bestDist) {
        best = r;
        bestDist = dist;
      }
    }
    if (best) {
      best.words.push(w);
      best.y0 = Math.min(best.y0, w.y0);
      best.y1 = Math.max(best.y1, w.y1);
    } else {
      rows.push({ y0: w.y0, y1: w.y1, words: [w] });
    }
  }
  return rows
    .sort((a, b) => a.y0 - b.y0)
    .map((r) => {
      const ordered = r.words.sort((a, b) => a.x0 - b.x0);
      return {
        text: ordered.map((w) => w.text).join(" "),
        words: ordered.map(({ text, x0, x1 }) => ({ text, x0, x1 })),
      };
    });
}

/** Read a schedule screenshot. */
export async function recognizeSchedule(
  image: Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<OcrResult> {
  progressListener = onProgress ?? null;
  try {
    const worker = await getWorker();
    const canvas = await preprocess(image);
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words: PositionedWord[] = [];
    const confidences: number[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const w of line.words) {
            words.push({
              text: w.text,
              x0: w.bbox.x0,
              x1: w.bbox.x1,
              y0: w.bbox.y0,
              y1: w.bbox.y1,
            });
            confidences.push(w.confidence);
          }
        }
      }
    }
    const lines =
      words.length > 0 ? wordsToRows(words) : data.text.split("\n").map((text) => ({ text }));
    const confidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
    return { text: lines.map((l) => l.text).join("\n"), lines, confidence };
  } finally {
    progressListener = null;
  }
}
