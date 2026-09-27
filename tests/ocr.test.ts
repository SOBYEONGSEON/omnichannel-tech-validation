import { it, expect, vi } from 'vitest';
import sharp from 'sharp';
const mocks = vi.hoisted(() => ({
  recognize: vi.fn().mockRejectedValue(new Error('OCR_RECOGNIZE_FAILED')),
  terminate: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  create: vi.fn()
}));
vi.mock('node:fs/promises', () => ({ access: mocks.access }));
vi.mock('tesseract.js', () => ({
  createWorker: mocks.create.mockImplementation(async () => ({
    recognize: mocks.recognize,
    terminate: mocks.terminate
  }))
}));
import { runOcr } from '../src/ocr.js';
it('OCR engine rejection is caught and worker terminated', async () => {
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: 'white' }
  })
    .png()
    .toBuffer();
  await expect(
    runOcr('data:image/png;base64,' + png.toString('base64'))
  ).rejects.toThrow('OCR_RECOGNIZE_FAILED');
  expect(mocks.terminate).toHaveBeenCalledOnce();
  expect(mocks.create.mock.calls[0][2].errorHandler).toBeTypeOf('function');
});
it('missing local model fails before spawning a worker', async () => {
  mocks.access.mockRejectedValueOnce(new Error('ENOENT'));
  const before = mocks.create.mock.calls.length;
  await expect(runOcr('data:image/png;base64,AA==')).rejects.toThrow(
    'OCR_MODEL_MISSING'
  );
  expect(mocks.create.mock.calls.length).toBe(before);
});
