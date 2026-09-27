import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname } from 'node:path';

const files = [
  [
    'https://huggingface.co/Xenova/yolos-tiny/resolve/main/config.json',
    '.tools/models/Xenova/yolos-tiny/config.json',
  ],
  [
    'https://huggingface.co/Xenova/yolos-tiny/resolve/main/preprocessor_config.json',
    '.tools/models/Xenova/yolos-tiny/preprocessor_config.json',
  ],
  [
    'https://huggingface.co/Xenova/yolos-tiny/resolve/main/onnx/model_quantized.onnx',
    '.tools/models/Xenova/yolos-tiny/onnx/model_quantized.onnx',
  ],
  [
    'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg',
    '.tools/test-assets/objects.jpg',
  ],
];
for (const [url, path] of files) {
  try {
    await access(path);
    console.log(`Already available: ${path}`);
    continue;
  } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok)
    throw new Error(`Download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  console.log(JSON.stringify({ path, bytes: bytes.length }));
}
