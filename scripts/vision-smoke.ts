import { readFile, writeFile } from 'node:fs/promises';
import { analyzeImage } from '../src/vision.js';
const image =
  'data:image/jpeg;base64,' +
  (await readFile('.tools/test-assets/objects.jpg')).toString('base64');
const result = await analyzeImage(image);
console.log(JSON.stringify(result, null, 2));
await writeFile('artifacts/vision-smoke.json', JSON.stringify(result, null, 2));
if (!result.objects.some((o) => o.key === 'remote'))
  throw new Error('REAL_OBJECT_DETECTION_FAILED');
