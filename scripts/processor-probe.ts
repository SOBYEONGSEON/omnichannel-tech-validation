import { AutoProcessor, RawImage, env } from '@huggingface/transformers';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
env.allowRemoteModels = false;
env.localModelPath = resolve('.tools/models') + '/';
env.useFSCache = false;
const processor: any = await AutoProcessor.from_pretrained(
  'Xenova/yolos-tiny',
  { local_files_only: true },
);
const picture = new RawImage(new Uint8ClampedArray(640 * 640 * 3), 640, 640, 3);
const before = (await processor(picture)).pixel_values.dims;
processor.image_processor.size = { width: 640, height: 640 };
const after = (await processor(picture)).pixel_values.dims;
assert.deepEqual(after, [1, 3, 640, 640]);
await writeFile(
  'artifacts/processor-probe.json',
  JSON.stringify({ input: [640, 640], before, after }, null, 2),
);
console.log(JSON.stringify({ before, after }));
