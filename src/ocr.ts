import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { access } from 'node:fs/promises';
import type { RawPage } from './types.js';
export async function runOcr(data: string, roi: RawPage['roi'] = null) {
  if (!/^data:image\/(png|jpeg);base64,/.test(data) || data.length > 6_000_000)
    throw new Error('INVALID_IMAGE');
  try {
    await access(process.cwd() + '/.tools/ocr/eng.traineddata.gz');
  } catch {
    throw new Error('OCR_MODEL_MISSING');
  }
  let input: Buffer | null = Buffer.from(data.split(',')[1], 'base64');
  let processed: Buffer | null = null;
  const start = performance.now();
  const metadata = await sharp(input, {
    limitInputPixels: 16_000_000
  }).metadata();
  let pipeline = sharp(input, { limitInputPixels: 16_000_000 });
  if (roi && metadata.width && metadata.height) {
    const left = Math.floor(
      Math.max(0, Math.min(roi.left, metadata.width - 1))
    );
    const top = Math.floor(Math.max(0, Math.min(roi.top, metadata.height - 1)));
    pipeline = pipeline.extract({
      left,
      top,
      width: Math.max(
        1,
        Math.floor(Math.min(roi.width, metadata.width - left))
      ),
      height: Math.max(
        1,
        Math.floor(Math.min(roi.height, metadata.height - top))
      )
    });
  }
  processed = await pipeline
    .resize({ width: 1400, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(175)
    .png()
    .toBuffer();
  const preprocess = performance.now() - start;
  const ocrStart = performance.now();
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    const work = (async () => {
      worker = await createWorker('eng', 1, {
        langPath: process.cwd() + '/.tools/ocr',
        cacheMethod: 'none',
        errorHandler: () => {
          /* job rejection is handled below; suppress library's global throw */
        }
      });
      if (timedOut) {
        await worker.terminate();
        throw new Error('OCR_TIMEOUT');
      }
      return worker.recognize(processed!);
    })();
    const result = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error('OCR_TIMEOUT'));
        }, 20000);
      })
    ]);
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      preprocess_latency: preprocess,
      ocr_latency: performance.now() - ocrStart,
      width: metadata.width,
      height: metadata.height,
      bytes: input.length
    };
  } finally {
    clearTimeout(timer);
    if (worker)
      await (worker as Awaited<ReturnType<typeof createWorker>>).terminate();
    input?.fill(0);
    processed?.fill(0);
    input = null;
    processed = null;
  }
}
