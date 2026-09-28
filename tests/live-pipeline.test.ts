import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const vision = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock('../src/vision.js', () => ({ analyzeImage: vision.analyze }));
import { controlLive, liveState, observeFrame } from '../src/live.js';
const image = {
  image: 'data:image/jpeg;base64,YWJj',
  domain: 'youtube.com',
  capture_ms: 3,
  source: 'chrome_periodic',
};
const result = {
  objects: [
    {
      key: 'remote',
      label: '리모컨',
      confidence: 0.9,
      source: 'local_object_model',
      box: {},
    },
  ],
  terms: [],
  ignored_objects: 1,
  ocr_error: null,
  timings: { preprocess_ms: 1, detection_ms: 2, ocr_ms: 3, total_ms: 6 },
};
let testClock = Date.now();
beforeEach(() => {
  testClock += 60_000;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(testClock);
  controlLive({ action: 'clear' });
  controlLive({ action: 'resume' });
  vision.analyze.mockReset();
  vision.analyze.mockResolvedValue(result);
});
afterEach(() => {
  vi.useRealTimers();
});
describe('live pipeline storage and cancellation', () => {
  it('reuses identical pixels but increments observations, no raw screenshot retained', async () => {
    expect((await observeFrame(image)).status).toBe(200);
    vi.setSystemTime(Date.now() + 5000);
    expect((await observeFrame(image)).status).toBe(200);
    expect(vision.analyze).toHaveBeenCalledTimes(1);
    expect(liveState().interests[0].observations).toBe(2);
    expect(JSON.stringify(liveState())).not.toContain('data:image');
  });
  it('rejects overlapping frames and discards late result after deletion', async () => {
    let finish!: (value: typeof result) => void;
    vision.analyze.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = observeFrame(image);
    expect((await observeFrame(image)).status).toBe(429);
    controlLive({ action: 'clear' });
    finish(result);
    expect((await pending).status).toBe(409);
    expect(liveState().interests).toEqual([]);
    expect(liveState().frames).toBe(0);
  });
  it('pause cancels an in-flight inference and rejects further frames', async () => {
    let finish!: (value: typeof result) => void;
    vision.analyze.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = observeFrame(image);
    controlLive({ action: 'pause' });
    finish(result);
    expect((await pending).status).toBe(409);
    expect((await observeFrame(image)).status).toBe(409);
    expect(liveState().frames).toBe(0);
  });
  it('recovers from failed image analysis on the next period', async () => {
    vision.analyze.mockRejectedValueOnce(new Error('synthetic failure'));
    expect((await observeFrame(image)).status).toBe(422);
    expect(liveState().busy).toBe(false);
    vi.setSystemTime(Date.now() + 5000);
    expect((await observeFrame(image)).status).toBe(200);
  });
  it('validates domain, interval and request fields', async () => {
    expect(
      (await observeFrame({ ...image, domain: 'mail.google.com' })).status,
    ).toBe(403);
    await expect(
      observeFrame({ ...image, domain: '../../private' }),
    ).rejects.toThrow();
    expect(() =>
      controlLive({ action: 'interval', interval_seconds: 0 }),
    ).toThrow();
  });
  it('allows one-second frames and keeps cached observations separate from fresh evidence', async () => {
    controlLive({ action: 'interval', interval_seconds: 1 });
    await observeFrame(image);
    vi.setSystemTime(Date.now() + 1000);
    expect((await observeFrame(image)).status).toBe(200);
    expect(liveState().interests[0].independent_frames).toBe(1);
    expect(liveState().interests[0].status).toBe('candidate');
    expect(liveState().history).toHaveLength(2);
    expect(JSON.stringify(liveState().history)).not.toContain('data:image');
  });
  it('includes region in cache key and does not reuse different crops', async () => {
    await observeFrame(image);
    vi.setSystemTime(Date.now() + 1000);
    await observeFrame({
      ...image,
      roi: {
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        viewport_width: 1100,
        viewport_height: 800,
      },
    });
    expect(vision.analyze).toHaveBeenCalledTimes(2);
  });
});
