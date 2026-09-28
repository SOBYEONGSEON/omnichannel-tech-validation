import { readdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { analyzeImage } from '../src/vision.js';
import { objectLabels, productTerms } from '../src/live-policy.js';
import { stats } from '../src/core.js';
import { analyzeImage as analyzeBaseline } from './baselines/vision-v02.js';
import { productTerms as baselineTerms } from './baselines/live-policy-v02.js';

const mode = process.argv[2] || 'baseline';
if (!['baseline', 'improved'].includes(mode))
  throw new Error('Use baseline or improved');
const labels = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
];
type Box = { xmin: number; ymin: number; xmax: number; ymax: number };
function iou(a: Box, b: Box) {
  const overlap =
    Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin)) *
    Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin));
  return (
    overlap /
    Math.max(
      1e-9,
      (a.xmax - a.xmin) * (a.ymax - a.ymin) +
        (b.xmax - b.xmin) * (b.ymax - b.ymin) -
        overlap,
    )
  );
}
const root = '.tools/test-assets/coco128';
const files = (await readdir(root + '/images/train2017'))
  .filter((f) => f.endsWith('.jpg'))
  .sort();
const selected: { file: string; truth: { key: string; box: Box }[] }[] = [];
for (const file of files) {
  const annotation = await readFile(
    root + '/labels/train2017/' + file.replace('.jpg', '.txt'),
    'utf8',
  ).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return '';
    throw e;
  });
  const rows = annotation.trim().split('\n');
  const truth = rows
    .filter(Boolean)
    .map((line) => {
      const [id, x, y, w, h] = line.split(/\s+/).map(Number);
      return {
        key: labels[id],
        box: {
          xmin: x - w / 2,
          ymin: y - h / 2,
          xmax: x + w / 2,
          ymax: y + h / 2,
        },
      };
    })
    .filter((o) => objectLabels[o.key]);
  // Deterministic split fixed before tuning. Includes negative scenes every fourth image.
  if (truth.length || selected.length % 4 === 0) selected.push({ file, truth });
  if (selected.length === 32) break;
}
const results: any[] = [];
for (const [index, sample] of selected.entries()) {
  for (const layout of ['large', 'small']) {
    const size = layout === 'large' ? 720 : 400;
    const { data: patch, info } = await sharp(
      root + '/images/train2017/' + sample.file,
    )
      .resize({ width: size, height: 500, fit: 'inside' })
      .jpeg({ quality: layout === 'large' ? 90 : 65 })
      .toBuffer({ resolveWithObject: true });
    const left = 90,
      top = 120,
      width = 1100,
      height = 800;
    const image = await sharp({
      create: { width, height, channels: 3, background: '#f1f3f5' },
    })
      .composite([{ input: patch, left, top }])
      .jpeg({ quality: 80 })
      .toBuffer();
    const roi = {
      left,
      top,
      width: info.width,
      height: info.height,
      viewport_width: width,
      viewport_height: height,
    };
    const fn = (mode === 'baseline' ? analyzeBaseline : analyzeImage) as (
      image: string,
      options?: any,
    ) => ReturnType<typeof analyzeImage>;
    const start = performance.now();
    const result = await fn(
      'data:image/jpeg;base64,' + image.toString('base64'),
      mode === 'improved' ? { roi } : undefined,
    );
    const truth = sample.truth.map((t) => ({
      ...t,
      box: {
        xmin: (left + t.box.xmin * info.width) / width,
        ymin: (top + t.box.ymin * info.height) / height,
        xmax: (left + t.box.xmax * info.width) / width,
        ymax: (top + t.box.ymax * info.height) / height,
      },
    }));
    const matched = new Set<number>();
    let tp = 0;
    for (const detection of [...result.objects].sort(
      (a, b) => b.confidence - a.confidence,
    )) {
      const candidates = truth
        .map((t, i) => ({
          i,
          score:
            t.key === detection.key && !matched.has(i)
              ? iou(t.box, detection.box as Box)
              : 0,
        }))
        .sort((a, b) => b.score - a.score);
      if (candidates[0]?.score >= 0.5) {
        matched.add(candidates[0].i);
        tp++;
      }
    }
    results.push({
      file: sample.file,
      split: index < 16 ? 'development' : 'reserved',
      layout,
      tp,
      fp: result.objects.length - tp,
      fn: truth.length - tp,
      latency_ms: performance.now() - start,
      memory_mb: process.memoryUsage().rss / 1048576,
      truth,
      detections: result.objects,
    });
    if (results.length % 8 === 0)
      console.log(
        JSON.stringify({ mode, completed: results.length, total: 64 }),
      );
  }
}
const termCases = [
  ['Galaxy Buds3 Pro', ['Galaxy Buds3 Pro']],
  ['갤럭시 버즈 3 프로', ['Galaxy Buds3 Pro']],
  ['Samsung SM-R630', ['Galaxy Buds3 Pro']],
  ['AirPods Pro', ['AirPods Pro']],
  ['iPhone 15 Pro Max', ['iPhone 15 Pro Max']],
  ['iPhone 16', ['iPhone 16']],
  ['Raspberry Pi 5', ['Raspberry Pi 5']],
  ['iPhone 150', []],
  ['Raspberry Pi 50', []],
  ['Galaxy Buds 3 Projector', []],
  ['AirPods Professional', []],
  ['myiphone 15', []],
  ['AIRPODS PROTEIN', []],
  ['John user@example.com 010-1234-5678', []],
  ['chair computer video', []],
] as const;
const extractTerms = mode === 'baseline' ? baselineTerms : productTerms;
const terms = termCases.map(([text, expected]) => ({
  text,
  expected,
  actual: extractTerms(text),
  pass: JSON.stringify(expected) === JSON.stringify(extractTerms(text)),
}));
function summary(rows: any[]) {
  const sum = (field: string) => rows.reduce((n, r) => n + r[field], 0);
  const tp = sum('tp'),
    fp = sum('fp'),
    fn = sum('fn');
  const precision = tp / (tp + fp || 1),
    recall = tp / (tp + fn || 1);
  return {
    n: rows.length,
    tp,
    fp,
    fn,
    precision,
    recall,
    f1: (2 * precision * recall) / (precision + recall || 1),
    latency: stats(rows.map((r) => r.latency_ms)),
    ram: stats(rows.map((r) => r.memory_mb)),
  };
}
const report = {
  mode,
  timestamp: new Date().toISOString(),
  model: 'Xenova/yolos-tiny q8',
  scope:
    'COCO128 train2017 subset; first deterministic 16 development / next 16 reserved images, two screenshot layouts each. Reserved is held out from our changes, NOT necessarily unseen by the pretrained model. IoU >=0.5, objectLabels allowlist. No general accuracy claim.',
  source: 'https://docs.ultralytics.com/datasets/detect/coco128/',
  summary: summary(results),
  development: summary(results.filter((r) => r.split === 'development')),
  reserved: summary(results.filter((r) => r.split === 'reserved')),
  by_layout: Object.fromEntries(
    ['large', 'small'].map((layout) => [
      layout,
      summary(results.filter((r) => r.layout === layout)),
    ]),
  ),
  terms,
  results,
};
await writeFile(
  `artifacts/accuracy-${mode}.json`,
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      mode,
      summary: report.summary,
      reserved: report.reserved,
      terms_passed: terms.filter((t) => t.pass).length,
      terms_total: terms.length,
    },
    null,
    2,
  ),
);
