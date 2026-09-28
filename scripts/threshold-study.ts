import { readFile, writeFile } from 'node:fs/promises';
const data = JSON.parse(
  await readFile('artifacts/accuracy-fixed-065.json', 'utf8'),
);
const development = data.results.filter((r: any) => r.split === 'development');
function score(threshold: number) {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const row of development) {
    const matched = new Set<number>();
    let count = 0;
    for (const d of row.detections
      .filter((d: any) => d.confidence >= threshold)
      .sort((a: any, b: any) => b.confidence - a.confidence)) {
      const candidates = row.truth
        .map((t: any, i: number) => {
          const a = d.box,
            b = t.box;
          const intersection =
            Math.max(0, Math.min(a.xmax, b.xmax) - Math.max(a.xmin, b.xmin)) *
            Math.max(0, Math.min(a.ymax, b.ymax) - Math.max(a.ymin, b.ymin));
          const overlap =
            intersection /
            Math.max(
              1e-9,
              (a.xmax - a.xmin) * (a.ymax - a.ymin) +
                (b.xmax - b.xmin) * (b.ymax - b.ymin) -
                intersection,
            );
          return {
            i,
            overlap: t.key === d.key && !matched.has(i) ? overlap : 0,
          };
        })
        .sort((a: any, b: any) => b.overlap - a.overlap);
      if (candidates[0]?.overlap >= 0.5) {
        matched.add(candidates[0].i);
        count++;
      } else fp++;
    }
    tp += count;
    fn += row.truth.length - count;
  }
  return {
    threshold,
    tp,
    fp,
    fn,
    precision: tp / (tp + fp || 1),
    recall: tp / (tp + fn || 1),
    f1: (2 * tp) / (2 * tp + fp + fn || 1),
  };
}
const rows = [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map(score);
const best = [...rows].sort(
  (a, b) => b.f1 - a.f1 || b.precision - a.precision,
)[0];
await writeFile(
  'artifacts/threshold-study.json',
  JSON.stringify(
    {
      scope: 'Threshold chosen using development split only; IoU >= .5',
      rows,
      best,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ rows, best }, null, 2));
