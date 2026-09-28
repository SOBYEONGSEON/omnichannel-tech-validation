import { env, pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { objectLabels, productTerms } from './live-policy-v02.js';
import { runOcr } from '../../src/ocr.js';

env.allowRemoteModels = false;
env.localModelPath = resolve('.tools/models') + '/';
env.useFSCache = false;
let detector: Promise<any> | undefined;
export async function analyzeImage(data: string) {
  const start = performance.now();
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  let pixels: Buffer | undefined;
  try {
    const { data: rgb, info } = await sharp(bytes, {
      limitInputPixels: 16_000_000,
    })
      .resize({ width: 960, withoutEnlargement: true })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = rgb;
    const preprocess_ms = performance.now() - start;
    const modelStart = performance.now();
    detector ??= pipeline('object-detection', 'Xenova/yolos-tiny', {
      dtype: 'q8',
      device: 'cpu',
      local_files_only: true,
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    }).catch((e) => {
      detector = undefined;
      throw e;
    });
    const model = await detector;
    const found: {
      label: string;
      score: number;
      box: Record<string, number>;
    }[] = await model(
      new RawImage(
        new Uint8ClampedArray(rgb.buffer, rgb.byteOffset, rgb.length),
        info.width,
        info.height,
        3,
      ),
      { threshold: 0.65, percentage: true },
    );
    const objects = found
      .filter((d) => objectLabels[d.label])
      .map((d) => ({
        key: d.label,
        label: objectLabels[d.label],
        confidence: d.score,
        source: 'local_object_model' as const,
        box: d.box,
      }));
    const detection_ms = performance.now() - modelStart;
    const ocrStart = performance.now();
    let terms: string[] = [];
    let ocrError: string | null = null;
    try {
      terms = productTerms((await runOcr(data)).text);
    } catch {
      ocrError = 'OCR_UNAVAILABLE';
    }
    return {
      objects,
      terms,
      ignored_objects: found.length - objects.length,
      ocr_error: ocrError,
      timings: {
        preprocess_ms,
        detection_ms,
        ocr_ms: performance.now() - ocrStart,
        total_ms: performance.now() - start,
      },
    };
  } finally {
    bytes.fill(0);
    pixels?.fill(0);
  }
}