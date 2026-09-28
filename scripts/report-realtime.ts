import { readFile, writeFile } from 'node:fs/promises';
import { stats } from '../src/core.js';
const load = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
let realtime: any;
try {
  realtime = await load('artifacts/realtime-validation.json');
} catch {
  console.log('Realtime validation not run yet.');
  process.exit(0);
}
const baseline = await load('artifacts/accuracy-baseline.json'),
  improved = await load('artifacts/accuracy-improved.json');
const guards = await load('artifacts/guard-validation.json'),
  probe = await load('artifacts/processor-probe.json'),
  threshold = await load('artifacts/threshold-study.json');
const unit = await load('artifacts/unit-results.json');
const benchmark = await load('BENCHMARK_RESULTS.json'),
  tests = await load('TEST_RESULTS.json');
const summarize = (samples: any[]) =>
  Object.fromEntries(
    ['total_ms', 'capture_ms', 'cpu_percent', 'memory_mb'].map((key) => [
      key,
      stats(samples.map((s) => s[key])),
    ]),
  );
const result = {
  timestamp: new Date().toISOString(),
  baseline: baseline.summary,
  improved: improved.summary,
  reserved_baseline: baseline.reserved,
  reserved_improved: improved.reserved,
  static_capture: realtime.static?.interval_ms,
  static_processing: summarize(realtime.static?.samples || []),
  changing_processing: summarize(realtime.changing?.samples || []),
  model_resize_probe: probe,
  threshold_study: threshold,
  scope: baseline.scope,
};
benchmark.realtime_v03 = result;
tests.realtime_v03 = {
  pass: realtime.pass && guards.pass && unit.numFailedTests === 0,
  cases: [...realtime.cases, ...guards.cases],
  errors: realtime.errors,
  unit: { passed: unit.numPassedTests, total: unit.numTotalTests },
  phrase_before: baseline.terms.filter((t: any) => t.pass).length,
  phrase_after: improved.terms.filter((t: any) => t.pass).length,
  phrase_total: improved.terms.length,
  precision_note:
    'Detection metrics are object-level IoU >=0.5 on 32 public images rendered at two sizes, NOT real browsing or SKU accuracy. COCO128 is a training subset that may overlap pretrained-model data. Candidate design iterations inspected multiple split results; reserved is not an untouched final blind test.',
};
await writeFile('BENCHMARK_RESULTS.json', JSON.stringify(benchmark, null, 2));
await writeFile('TEST_RESULTS.json', JSON.stringify(tests, null, 2));
const p = (v: number) => (v * 100).toFixed(1) + '%',
  f = (v: number) => v.toFixed(2);
const b = baseline.summary,
  a = improved.summary;
const summary = `<!-- REALTIME_VALIDATION -->
# v0.3 실시간 캡처 개선 검증

생성 ${result.timestamp}. 결론: **FEASIBLE WITH CONDITIONS**. 목표 간격을 기본 10초에서 2초(최소 1초)로 변경했습니다. 지연된 tick은 쌓지 않고 분석 완료 후 다음 화면으로 진행합니다. 실제 1초 설정에서 캡처 ${realtime.static?.frames || 0}회, 간격 P50 ${f(realtime.static?.interval_ms?.p50 || 0)}ms / P95 ${f(realtime.static?.interval_ms?.p95 || 0)}ms. 움직이는 합성 화면 30회 새 추론도 별도로 검증했습니다.

## 변경 전후 — 같은 정답·같은 64개 화면 조건

| 항목 | v0.2 기준 구현 | v0.3 최종 구현 |
| --- | ---: | ---: |
| 사물 박스 Precision (IoU≥0.5) | ${p(b.precision)} | ${p(a.precision)} |
| Recall | ${p(b.recall)} | ${p(a.recall)} |
| F1 | ${f(b.f1)} | ${f(a.f1)} |
| 실제 모델+OCR 평균 ms (캐시 미사용) | ${f(b.latency.average)} | ${f(a.latency.average)} |
| P50 / P95 / Max ms | ${f(b.latency.p50)} / ${f(b.latency.p95)} / ${f(b.latency.maximum)} | ${f(a.latency.p50)} / ${f(a.latency.p95)} / ${f(a.latency.maximum)} |
| 백엔드 RSS 평균 / 최대 MB | ${f(b.ram.average)} / ${f(b.ram.maximum)} | ${f(a.ram.average)} / ${f(a.ram.maximum)} |
| 상품명 문자열 회귀 정답 | ${tests.realtime_v03.phrase_before}/15 | ${tests.realtime_v03.phrase_after}/15 |

**수치 해석:** 이미지 32장 × 큰/작은 화면 2종 = 64조건입니다. COCO128은 COCO 학습 이미지 일부이므로 모델에 미노출된 데이터라고 주장하지 않습니다. 개발/별도 분할을 기록했지만 여러 후보 실험 결과를 관찰했으므로 최종 blind 성능도 아닙니다. 문자열 회귀 15개는 OCR 자체 정확도가 아닙니다. 합성 영상은 공개 사진의 픽셀을 바꾼 테스트이며 로그인한 Instagram/YouTube 실계정 영상이 아닙니다.

## 테스트에서 발견하고 수정한 내용

1. 숫자·단어 부분 일치: iPhone 150→15, Raspberry Pi 50→5, AirPods Professional→Pro 등의 잘못된 추출을 재현하고 단어 경계를 적용했습니다. iPhone Pro Max 보존과 SM-R630 정규화를 추가했습니다.
2. 검출 집계가 마지막 박스 점수에 좌우되는 문제를 최고 점수 기준으로 수정했습니다. 같은 화면 캐시는 관측 수에는 포함하되 새 추론 근거로 계산하지 않습니다.
3. 작은 미디어의 사물 누락에 대응해 보이는 img/video/canvas 영역 합집합을 잘라 인식하고 화면 좌표로 역변환합니다. OCR은 전체 마스킹 화면에 적용합니다.
4. 실제 모델 입력을 측정하니 640×640 이미지가 라이브러리에서 ${probe.before.join('×')} 텐서로 커졌습니다. 처리기 크기를 고정해 ${probe.after.join('×')}으로 제한했습니다. 단순 ROI 실험은 RAM이 4GB 이상까지 증가하여 채택하지 않았습니다.
5. 개발 분할에서 7개 threshold를 비교하고 F1 기준 ${threshold.best.threshold}를 적용했습니다. 전체 집합에서 recall이 더 높은 0.65 후보도 있었으며, 최종값은 개발 분할 기준 선택입니다.
6. 처리시간에 주기를 또 더하던 스케줄링을 시작 시각 기준으로 변경하고, 너무 이른 tick에는 남은 대기시간을 반환해 실제 간격이 두 배가 되는 문제를 막았습니다.
7. 이전 2초 마스킹 타이머가 새 마스크를 지울 수 있는 경쟁을 host 인스턴스 검사로 막았습니다. 캡처 뒤 마스크·URL·ROI를 재검사하고 변한 프레임은 폐기합니다. 기존 위젯의 실제 host id도 마스킹 대상에 반영했습니다.
8. 최종 화면 검토에서 발견한 동일 종류 중복 박스를 IoU 0.7 NMS로 제거했습니다. 같은 64조건에서 정검출 137건을 유지하면서 오탐 박스가 118→101건으로 줄었습니다. 서로 다른 종류나 떨어진 실제 물체는 유지하는 회귀 테스트를 추가했습니다.

## 실제 실행한 검증

- 단위·통합 ${unit.numPassedTests}/${unit.numTotalTests} 통과. 처음 추가한 회귀 18개 중 9개가 기존 코드에서 실패했으며 수정 후 통과했습니다.
- 실제 Chrome 제어/마스킹/복구/UI ${realtime.cases.filter((c: any) => c.pass).length}/${realtime.cases.length}, 별도 DOM/DPR 가드 ${guards.cases.filter((c: any) => c.pass).length}/${guards.cases.length} 통과.
- 60회 정지 화면 캡처(대부분 캐시)와 30회 변경 화면 새 추론을 구분했습니다. 비밀번호·입력·SPA 메시지 경로, 캡처 실패, 잘못된 이미지, 서버 종료/재시작, inspector 및 JSON 다운로드를 검증했습니다.
- 모델 평가 64조건을 기준/ROI/정사각형/입력고정/threshold/중복제거의 6개 설정으로 실행했습니다(384회, 독립 사진 384장 아님). 중간 결과는 artifacts/accuracy-*.json입니다. 90회 캡처 부하 검증 뒤에는 중복 제거 후처리만 추가했으며 최종 모델 표와 직접 테스트 화면은 그 수정 후 다시 실행했습니다.
- CPU는 백엔드 프로세스 사용량을 논리 CPU 수로 나눈 프레임 내 평균입니다. GPU/전체 PC 자원 및 로그인된 실제 소셜 서비스에서의 장기 정확도는 검증하지 않았습니다.

## 직접 확인

START_POC.cmd 실행 → Chrome 확장 새로고침 → http://127.0.0.1:8787/live 연결. '이번 화면에서 추출한 데이터'의 위치 도식·사물 종류·OCR 언급·점수와 최근 30회 이력을 확인하세요. '현재 결과 JSON 저장'은 이미지·토큰·OCR 전문을 제외한 메모리 결과를 내려받습니다. 자동 영구 저장은 하지 않으므로 종료 전 내보내야 합니다.

## 남은 한계

최종 precision ${p(a.precision)}, recall ${p(a.recall)}로 오탐·누락이 여전히 큽니다. 사물 종류 후보와 실제 상품 SKU를 구분하며, 사물 후보를 확정 상품으로 표시하지 않습니다. COCO 사물 종류 밖의 물건·작은 물건·한국어 OCR·가려진 물건은 지원이 제한적입니다. 데이터셋 결과를 개인 인터넷 사용 전반의 정확도로 일반화하지 않습니다. 민감 화면 판단·마스킹은 휴리스틱이며 모든 개인정보 차단을 보장하지 않습니다.

재현: run.cmd benchmark:baseline / benchmark:accuracy / benchmark:processor / test:realtime / test:guards / test:record / report. baseline은 커밋 3becd8c의 동작을 scripts/baselines에 고정했습니다. 정답 자료는 [COCO128 공식 문서](https://docs.ultralytics.com/datasets/detect/coco128/)와 README의 다운로드 절차를 참고하세요.
<!-- /REALTIME_VALIDATION -->

`;
await writeFile('REALTIME_VALIDATION_REPORT.md', summary);
const previous = (await readFile('TECH_VALIDATION_REPORT.md', 'utf8')).replace(
  /<!-- REALTIME_VALIDATION -->[\s\S]*?<!-- \/REALTIME_VALIDATION -->\s*/,
  '',
);
await writeFile('TECH_VALIDATION_REPORT.md', summary + previous);
console.log(
  JSON.stringify({
    report: 'REALTIME_VALIDATION_REPORT.md',
    pass: tests.realtime_v03.pass,
    precision_before: b.precision,
    precision_after: a.precision,
  }),
);
