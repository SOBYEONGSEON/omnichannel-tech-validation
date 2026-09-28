export interface VisualRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  viewport_width: number;
  viewport_height: number;
}
export interface Box {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}
export function suppressDuplicates<
  T extends { key: string; confidence: number; box: Box },
>(detections: T[], threshold = 0.7): T[] {
  const kept: T[] = [];
  for (const detection of [...detections].sort(
    (a, b) => b.confidence - a.confidence,
  )) {
    const b = detection.box;
    if (
      !Object.values(b).every(Number.isFinite) ||
      b.xmax <= b.xmin ||
      b.ymax <= b.ymin
    )
      continue;
    if (
      kept.some((other) => {
        if (other.key !== detection.key) return false;
        const a = other.box;
        const intersection =
          Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin)) *
          Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin));
        const union =
          (a.xmax - a.xmin) * (a.ymax - a.ymin) +
          (b.xmax - b.xmin) * (b.ymax - b.ymin) -
          intersection;
        return intersection / Math.max(1e-9, union) > threshold;
      })
    )
      continue;
    kept.push(detection);
  }
  return kept;
}
export function pixelRegion(width: number, height: number, roi?: VisualRegion) {
  if (
    !roi ||
    !Object.values(roi).every(Number.isFinite) ||
    roi.width <= 0 ||
    roi.height <= 0 ||
    roi.viewport_width <= 0 ||
    roi.viewport_height <= 0
  )
    return null;
  const sx = width / roi.viewport_width,
    sy = height / roi.viewport_height;
  const left = Math.max(0, Math.floor(roi.left * sx)),
    top = Math.max(0, Math.floor(roi.top * sy));
  const right = Math.min(width, Math.ceil((roi.left + roi.width) * sx)),
    bottom = Math.min(height, Math.ceil((roi.top + roi.height) * sy));
  if (right - left < 32 || bottom - top < 32) return null;
  return { left, top, width: right - left, height: bottom - top };
}
export function screenBox(
  box: Record<string, number>,
  region: { left: number; top: number; width: number; height: number } | null,
  width: number,
  height: number,
): Box {
  const r = region || { left: 0, top: 0, width, height };
  const x = (n: number) =>
    Math.min(1, Math.max(0, (r.left + n * r.width) / width));
  const y = (n: number) =>
    Math.min(1, Math.max(0, (r.top + n * r.height) / height));
  return {
    xmin: x(box.xmin),
    ymin: y(box.ymin),
    xmax: x(box.xmax),
    ymax: y(box.ymax),
  };
}
