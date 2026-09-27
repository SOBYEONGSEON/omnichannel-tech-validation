import { readFile, writeFile } from 'node:fs/promises';
import { stats } from '../src/core.js';
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
let live: any;
try {
  live = await read('artifacts/live-e2e.json');
} catch {
  console.log('Live evidence not available; existing report retained.');
  process.exit(0);
}
const startup = await read('artifacts/live-startup-e2e.json');
const vision = await read('artifacts/vision-smoke.json');
const unit = await read('artifacts/unit-results.json');
const benchmark = await read('BENCHMARK_RESULTS.json');
const test = await read('TEST_RESULTS.json');
const samples: any[] = live.repeat?.samples || [];
const values = (key: string) =>
  samples.map((s) => Number(s[key])).filter(Number.isFinite);
const metrics = {
  backend_ms: stats(values('total_ms')),
  capture_ms: stats(values('capture_ms')),
  cpu_percent_per_frame: stats(values('cpu_percent')),
  backend_rss_mb: stats(values('memory_mb')),
  rss_change_first_to_last_mb: samples.length
    ? samples.at(-1).memory_mb - samples[0].memory_mb
    : null,
  warm_rss_change_mb:
    samples.length > 3 ? samples.at(-1).memory_mb - samples[2].memory_mb : null,
};
benchmark.live_v02 = {
  timestamp: live.timestamp,
  scope:
    '35 actual screenshots of one unchanged non-shopping fixture; 30 repeat cycles plus flow checks; same-image result cache, not 35 fresh inferences. CPU is backend process CPU / logical core count, averaged within each frame, not total-PC sampling.',
  ...metrics,
  first_uncached_image: vision.timings,
  gpu: 'not measured',
  system_wide_cpu: 'not measured',
  repeat: live.repeat?.count,
  no_performance_improvement_claim: true,
};
test.live_v02 = {
  timestamp: live.timestamp,
  pass: live.pass && startup.pass,
  unit_tests: { passed: unit.numPassedTests, total: unit.numTotalTests },
  cases: [...live.cases, ...startup.cases],
  repeat: {
    count: live.repeat?.count,
    success: live.repeat?.success,
    timeout: live.repeat?.timeout,
  },
  errors: [...live.errors, ...startup.errors],
  permission_note: live.permission_note,
  social_note: live.social_note,
  accuracy_note:
    'Remote control identification verified on one public image and its fixture screenshot; not a general object-recognition accuracy dataset.',
};
await writeFile('BENCHMARK_RESULTS.json', JSON.stringify(benchmark, null, 2));
await writeFile('TEST_RESULTS.json', JSON.stringify(test, null, 2));
const f = (n: number) => Number(n).toFixed(2);
const rows = [
  ['백엔드 처리 ms (동일 이미지 캐시 포함)', metrics.backend_ms],
  ['실제 캡처 ms', metrics.capture_ms],
  ['백엔드 CPU % (전체 논리 CPU 기준)', metrics.cpu_percent_per_frame],
  ['백엔드 RSS MB', metrics.backend_rss_mb],
]
  .map(
    ([name, s]: any) =>
      `| ${name} | ${f(s.average)} | ${f(s.median)} | ${f(s.p50)} | ${f(s.p95)} | ${f(s.maximum)} |`,
  )
  .join('\n');
const section = `<!-- LIVE_VALIDATION -->
# v0.2 추가 검증 — 주기적 관심 사물 분석

생성: ${new Date().toISOString()} · 재현: run.cmd test:live, run.cmd test:startup, run.cmd report.

**FEASIBLE WITH CONDITIONS**. 쇼핑 여부와 무관한 활성 Chrome 탭의 주기 캡처, 로컬 객체 인식/OCR, 반복 노출 집계, 위젯, 직접 테스트 화면을 구현했습니다. 초기 1회 Chrome 권한 동의 후 프로그램 실행 시 자동 분석합니다.

- 실제 Chrome 주기 반복 **${live.repeat?.success}/${live.repeat?.count} 성공**. 이동하지 않는 동일 URL에서 35회 캡처가 기록됐고 리모컨과 OCR 상품명 관측 수가 증가했습니다.
- 제어/안정성 브라우저 시나리오 **${test.live_v02.cases.filter((c: any) => c.pass).length}/${test.live_v02.cases.length} 통과**: 샘플 버튼, 주기 캡처, 일시정지, 비밀번호/입력/SPA DM 제외, 재개, 동의 철회, 서버 꺼짐, 재시작 자동 복구, 위젯 중지·삭제.
- 단위·통합 **${unit.numPassedTests}/${unit.numTotalTests} 통과**. 기존 상품 파이프라인 테스트 포함. 취소/삭제 중 완료된 inference의 결과 폐기, 캐시 재사용, 저장 최소화, 실패 후 복구를 테스트했습니다. 단위 테스트의 vision 결과는 mock이며, 브라우저/vision smoke는 실제 모델입니다.
- 공개 원본 이미지에서 리모컨 ${vision.objects.length}개를 실제 인식했습니다. 첫 엔진 실행 ${f(vision.timings.total_ms)}ms (객체 ${f(vision.timings.detection_ms)}ms, OCR ${f(vision.timings.ocr_ms)}ms). 사진과 화면 캡처의 confidence는 서로 다를 수 있습니다.

| 측정 | Average | Median | P50 | P95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows}

위 통계는 **35개 실제 캡처 후 서버 처리 샘플**이며 동일 화면의 추출 결과 캐시를 포함합니다. 캐시 hit에서 객체 추론/OCR은 다시 호출하지 않습니다. 새 사진/움직이는 동영상에 이 지연시간을 적용할 수 없습니다. 마지막-최초 RSS 변화 ${f(metrics.rss_change_first_to_last_mb!)}MB, 3번째 이후 warm RSS 변화 ${f(metrics.warm_rss_change_mb!)}MB. 작업 전후 GC 영향을 포함하므로 메모리 누수가 없다는 증명은 아닙니다. GPU, 전체 PC CPU/브라우저 리소스, 실제 소셜 피드 변화에 따른 장기 부하는 이번 추가 검증에서 측정하지 않았습니다.

**직접 사용:** START_POC.cmd 실행 → Chrome에 dist/extension 로드 → 토큰/주기 분석 동의 최초 연결 → [DEBUG/테스트](http://127.0.0.1:8787/live) → 사물 이미지 테스트 화면을 활성 탭으로 20~30초 보기. 상세 절차는 README에 있습니다.

**미완료·조건:** 개인정보 감지는 규칙 기반으로 완전하지 않습니다. 모델은 제한된 사물 종류만 인식하고 일반 SKU/브랜드 식별을 보장하지 않습니다. 한국어 OCR 및 임의 사물의 자동 판매처 가격 비교는 미완료(새 모드는 클릭형 검색 링크 제공, 기존 상품 모드는 판매처 비교 유지). 로그인한 Instagram/YouTube는 실계정으로 검증하지 않았습니다. 실제 optional permission 동의 창은 사용자가 한 번 확인해야 하며 테스트는 분리된 TEST ONLY 권한으로 실행했습니다. 모델 RAM이 약 1GB인 점은 상용화 전 해결 과제입니다.

**개인정보:** 신규 경로에서 전체 URL/제목/DOM/OCR 전문을 저장하지 않습니다. 원본 캡처는 파일로 쓰지 않고 분석 뒤 참조를 해제합니다. 관심 데이터는 RAM 100개/30분 TTL, 성능 100개, 이벤트 30개, 결과 캐시 1개로 제한합니다. 프로그램 종료 시 관측 데이터는 사라지며 연결 토큰과 동의만 유지됩니다. 테스트는 공개 이미지와 합성 화면만 사용했습니다.

검증 근거: artifacts/live-e2e.json, artifacts/live-startup-e2e.json, artifacts/vision-smoke.json, artifacts/unit-results.json. 아래는 기존 상품 페이지 PoC의 검증 이력이며 신규 범용 사물 인식의 정확도 수치로 해석하지 않습니다.
<!-- /LIVE_VALIDATION -->

`;
const previous = (await readFile('TECH_VALIDATION_REPORT.md', 'utf8')).replace(
  /<!-- LIVE_VALIDATION -->[\s\S]*?<!-- \/LIVE_VALIDATION -->\s*/,
  '',
);
await writeFile('TECH_VALIDATION_REPORT.md', section + previous);
console.log(
  JSON.stringify({ live_report: true, pass: test.live_v02.pass, metrics }),
);
