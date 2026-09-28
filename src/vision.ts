import { env, pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { objectLabels, productTerms } from './live-policy.js';
import { runOcr } from './ocr.js';
import {
  pixelRegion,
  screenBox,
  suppressDuplicates,
  type VisualRegion,
} from './vision-geometry.js';

env.allowRemoteModels = false;
env.localModelPath = resolve('.tools/models') + '/';
env.useFSCache = false;
let detector: Promise<any> | undefined;
export async function analyzeImage(
  data: string,
  options: { roi?: VisualRegion } = {},
) {
  const start = performance.now();
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  let pixels: Buffer | undefined;
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: 16_000_000,
    }).metadata();
    const width = metadata.width!,
      height = metadata.height!;
    const region = pixelRegion(width, height, options.roi);
    let input = sharp(bytes, {
      limitInputPixels: 16_000_000,
    });
    if (region) input = input.extract(region);
    // Fixed square tensor prevents ONNX CPU arena growth across arbitrary aspect ratios.
    const { data: resized, info: content } = await input
      .resize({ width: 640, height: 640, fit: 'inside' })
      .png()
      .toBuffer({ resolveWithObject: true });
    const padLeft = Math.floor((640 - content.width) / 2),
      padTop = Math.floor((640 - content.height) / 2);
    const { data: rgb, info } = await sharp(resized)
      .extend({
        left: padLeft,
        top: padTop,
        right: 640 - content.width - padLeft,
        bottom: 640 - content.height - padTop,
        background: '#f1f3f5',
      })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    resized.fill(0);
    pixels = rgb;
    const preprocess_ms = performance.now() - start;
    const modelStart = performance.now();
    detector ??= pipeline('object-detection', 'Xenova/yolos-tiny', {
      dtype: 'q8',
      device: 'cpu',
      local_files_only: true,
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
    })
      .then((model: any) => {
        // Transformers.js longest_edge handling upscales to 1333 even after our resize.
        // Pin both dimensions: the benchmark verifies the actual tensor dimensions below.
        model.processor.image_processor.size = { width: 640, height: 640 };
        return model;
      })
      .catch((e) => {
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
      { threshold: 0.75, percentage: true },
    );
    const candidates = found
      .filter(
        (d) =>
          objectLabels[d.label] &&
          (d.box.xmin + d.box.xmax) * 320 >= padLeft &&
          (d.box.xmin + d.box.xmax) * 320 <= padLeft + content.width &&
          (d.box.ymin + d.box.ymax) * 320 >= padTop &&
          (d.box.ymin + d.box.ymax) * 320 <= padTop + content.height,
      )
      .map((d) => ({
        key: d.label,
        label: objectLabels[d.label],
        confidence: d.score,
        source: 'local_object_model' as const,
        box: screenBox(
          {
            xmin: (d.box.xmin * 640 - padLeft) / content.width,
            xmax: (d.box.xmax * 640 - padLeft) / content.width,
            ymin: (d.box.ymin * 640 - padTop) / content.height,
            ymax: (d.box.ymax * 640 - padTop) / content.height,
          },
          region,
          width,
          height,
        ),
      }));
    const objects = suppressDuplicates(candidates);
    const detection_ms = performance.now() - modelStart;
    const ocrStart = performance.now();
    let terms: string[] = [];
    let ocrError: string | null = null;
    let ocrConfidence: number | null = null;
    try {
      const ocr = await runOcr(data);
      terms = productTerms(ocr.text);
      ocrConfidence = ocr.confidence / 100;
    } catch {
      ocrError = 'OCR_UNAVAILABLE';
    }
    return {
      objects,
      terms,
      ignored_objects: found.length - objects.length,
      duplicates_removed: candidates.length - objects.length,
      ocr_error: ocrError,
      ocr_confidence: ocrConfidence,
      input: {
        width,
        height,
        region,
        model_input: [640, 640],
        threshold: 0.75,
        detection_scope: region ? 'visible_media_region' : 'full_viewport',
      },
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
