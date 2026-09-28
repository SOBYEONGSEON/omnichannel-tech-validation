export const DEFAULT_INTERVAL_SECONDS = 2;
export const MIN_INTERVAL_SECONDS = 1;
export const MIN_FRAME_GAP_MS = 750;

// Schedule start-to-start. Slow inference skips missed ticks rather than building a queue.
export function nextCaptureDelay(intervalSeconds: number, elapsedMs: number) {
  return Math.max(100, intervalSeconds * 1000 - Math.max(0, elapsedMs));
}
