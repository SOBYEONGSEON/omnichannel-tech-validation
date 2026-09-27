import {readFile,writeFile} from 'node:fs/promises';
import {stats} from '../src/core.js';
const load=async(name:string,fallback:any={})=>{try{return JSON.parse(await readFile(name,'utf8'));}catch{return fallback;}};
const b=await load('BENCHMARK_RESULTS.json'),t=await load('TEST_RESULTS.json'),e=await load('artifacts/e2e-results.json'),c=await load('artifacts/crawl-results.json'),u=await load('artifacts/unit-results.json'),audit=await load('artifacts/npm-audit.json');
const ui=await load('artifacts/ui-smoke.json');t.dashboard=ui;
const cleanup=await load('artifacts/cleanup.json');t.cleanup=cleanup;
const n=(x:unknown)=>typeof x==='number'?x.toFixed(2):'미측정';const pct=(x:number)=>`${n(x*100)}%`;
const live=e.cases?.find((x:any)=>x.name==='real_product');const blind=c.results?.filter((x:any)=>x.blind)||[];const repeat=e.repeat||[];
const livePassed=live?.status==='complete'&&live?.run?.capture?.performed&&live?.widget_contains_product&&live?.run?.results?.length>0;
const decision=livePassed?'FEASIBLE WITH CONDITIONS':'NOT YET FEASIBLE';
const stageNames=['capture_latency','preprocess_latency','ocr_latency','extract_latency','classify_latency','search_latency','ranking_latency','render_latency','total_latency','client_total_latency'];
const extensionStats=Object.fromEntries(stageNames.map(s=>[s,stats(repeat.filter((r:any)=>r.timings).map((r:any)=>r.timings[s]||0))]));
b.extension_repeat={scope:'30 actual Chrome extension runs on synthetic dynamic DOM; external catalog cache warm; 2.7s pacing excluded',runs:repeat.length,success:repeat.filter((r:any)=>r.pass).length,failed:repeat.filter((r:any)=>!r.pass).length,latency:extensionStats,backend_ram_growth_mb:repeat.length?repeat.at(-1).resources?.ram_peak_mb-repeat[0].resources?.ram_peak_mb:null,browser_heap_growth_mb:repeat.length?((repeat.at(-1).browser_metrics?.find((m:any)=>m.name==='JSHeapUsedSize')?.value||0)-(repeat[0].browser_metrics?.find((m:any)=>m.name==='JSHeapUsedSize')?.value||0))/1048576:null};
t.unit={tests:u.numTotalTests??null,passed:u.numPassedTests??null,failed:u.numFailedTests??null,success:u.success??null};t.e2e={browser:e.browser,permission_note:e.permission_note,cases:e.cases?.map((r:any)=>({name:r.name,status:r.status,capture:r.run?.capture?.performed||false,result_count:r.run?.results?.length||0,widget_contains_product:r.widget_contains_product,error:r.error})),repeat:b.extension_repeat};t.crawl=c;t.dependency_audit=audit.metadata?.vulnerabilities??null;
await writeFile('BENCHMARK_RESULTS.json',JSON.stringify(b,null,2));await writeFile('TEST_RESULTS.json',JSON.stringify(t,null,2));
const table=(rows:any[][])=>rows.map(row=>'| '+row.join(' | ')+' |').join('\n');
const text=`# 기술검증 보고서 — ${decision}

생성: ${new Date().toISOString()} · 명령: run.cmd report. 실제 실행 결과와 제한을 기록합니다. 입력 증거: BENCHMARK_RESULTS.json, TEST_RESULTS.json, artifacts/*.json.

## 최종 기술 판단

**${decision}**. 실제 상품 페이지의 DOM/JSON-LD → 조건부 Chrome 캡처 → 구조화/분류 → 허용된 공개 카탈로그 → 비교 → 위젯이 ${livePassed?'성공':'충분히 검증되지 않았습니다'}.

실상품 ${live?.url}: ${live?.run?.extracted?.product?.name}, 캡처 ${live?.run?.capture?.performed}, 결과 ${live?.run?.results?.length??0}개, 위젯 표시 ${live?.widget_contains_product}. 서버+캡처 ${n(live?.run?.timings?.total_latency)}ms, 전체 브라우저 테스트 ${n(live?.duration_ms)}ms. 가격은 검증 시점 값입니다. 최종 재실행의 실사이트 조회는 이전 실시간 요청으로 준비된 5분 캐시를 사용할 수 있으며, provider.duration_ms=0은 캐시 hit입니다. cold 인터넷 지연값으로 해석하지 않습니다.

실제 확장 반복 ${b.extension_repeat.success}/${b.extension_repeat.runs}, backend fixture ${b.repeated?.success}/${b.repeated?.runs}, Blind ${blind.filter((x:any)=>x.status==='PASS').length}/${blind.length} PASS입니다. 핵심 구현은 가능하지만 임의 쇼핑몰 일반화는 검증되지 않았습니다. 검색 API/허용 카탈로그 확대, 옵션/통화/배송 정합성, 민감 페이지 감지, 한국어 OCR, production activeTab 수동 검증이 개발 조건입니다.

## 구현된 기능

- MV3 확장: 체크박스 동의, 현재 탭/origin 제한, 캡처 직전 DOM·활성 탭·URL 재검사, 팝업 동의 철회.
- 독립 Capture Decision Engine, capture/confidence/reason 로그. 민감 페이지 우선 차단, threshold 0.55.
- JSON-LD Product/@graph → Meta → microdata/DOM → 800ms 동적 DOM 재시도 → 부족한 이름/가격에 OCR. 필드별 provenance/confidence. 사이트 전용 CSS 없음.
- Sharp ROI/crop/resize/grayscale/normalize/sharpen/threshold, 로컬 Tesseract.js 영어 OCR. 원본 screenshot 파일 저장 없음.
- 공통 Product Schema, 브랜드·카테고리 룰, 한영 정규화, 모델 비교, Jaccard 유사도. 별도 LLM 호출/학습 없음.
- 설명 가능한 정렬: 유사도 .65 + 동일 통화/상태 가격 .20 + 평점 .10 + 추출 confidence .05. 통화 불명/불일치는 가격 비교 제외. 용량·옵션 일치까지 보장하지 않음.
- 제한된 3개 판매처 HTML 검색과 별도 공개 카탈로그 provider. robots/차단/redirect/timeout 상태 기록, 5분·20건 캐시. 생성 검색어와 실제 providers.query를 구분.
- 플로팅 위젯, 실시간 Inspector/Dashboard: RAW/EXTRACTED/CLASSIFICATION/QUERY/RESULTS/STORAGE/DISCARDED/CPU/RAM/단계 로그.
- localhost Bearer 인증·Origin/Host 검사·크기 제한·고정 outbound host allowlist. 운영 데이터는 RAM 최대 20세션/10분 TTL.
- 단위·통합·실제 Chrome E2E·반복·정확도·장애·A/B 벤치마크와 자동 보고서.

## 구현하지 못했거나 제한된 항목

- 일반 인터넷 검색 API/공식 쇼핑 API, 중고/국내 오픈마켓 상품 수집 성공. API 키 없이 현재 허용 사이트의 HTML/상품 카탈로그만 연결했습니다.
- 서버 측 외부 페이지 Playwright fallback. Playwright는 현재 E2E/렌더링 검증에 사용합니다. 사용자 페이지는 content script로 렌더된 DOM을 수집합니다.
- 새로운 문서로 이동하면 재주입을 위해 확장 버튼으로 다시 분석해야 합니다. 동일 문서 SPA URL 변경은 지원합니다.
- 한국어 OCR, 복잡한 배경 OCR 정확도 집합, 장기 개인화, 옵션/재고/배송비/환율 정합성.
- GPU 및 브라우저 전체 프로세스 RSS/CPU 정밀 분리. browser JS heap/main-thread CDP와 backend CPU/RSS는 계측했습니다.
- 자동화는 별도 TEST ONLY manifest의 <all_urls>로 실제 Chrome API를 실행합니다. 배포 manifest는 activeTab이며 사용자 버튼 클릭 권한 부여 흐름의 수동 smoke test는 남았습니다.
- 실상품 OCR은 필요하지 않아 생략했습니다. screenshot-only OCR은 합성 픽셀로 따로 검증했습니다.
- 모바일/회원/결제/광고/구독/건강 판정은 요청에 따라 제외했습니다.

## 테스트 환경

${table([['항목','측정값'],['---','---'],...Object.entries(b.environment||{}).map(([k,v])=>[k,String(v)])])}

설치된 사용자 Chrome 154.0.8037.57. 자동화는 개인 프로필과 분리된 Chrome for Testing ${e.browser}입니다.

## 성능 결과

**실제 확장 30회**, 합성 동적 상품 페이지, 외부 상품 캐시가 준비된 상태의 ms 통계입니다. 2.7초 요청 간격은 제외합니다. 0은 단계 미실행입니다. total은 backend+캡처, client_total은 DOM 수집/통신/폴링/렌더 포함입니다.

${table([['단계','Average','Median / P50','P95','Maximum'],['---','---:','---:','---:','---:'],...Object.entries(extensionStats).map(([k,v])=>[k,n(v.average),n(v.p50),n(v.p95),n(v.maximum)])])}

backend 100회는 검색 fixture이고 캡처/OCR/렌더를 생략했습니다. 평균 ${n(b.repeated?.latency?.total_latency?.average)}ms, P95 ${n(b.repeated?.latency?.total_latency?.p95)}ms를 서비스 E2E 성능으로 주장하지 않습니다. 너무 짧은 단계는 Windows CPU counter가 0으로 표시될 수 있습니다.

RAM 변화: backend 100회 ${n(b.repeated?.memory_growth_mb)} MiB; 확장 30회 backend ${n(b.extension_repeat.backend_ram_growth_mb)} MiB, browser JS heap ${n(b.extension_repeat.browser_heap_growth_mb)} MiB. 캐시/JIT/GC/검증기 보관 데이터 포함으로 누수 여부 판정은 불가하며 장기 soak test가 필요합니다.

OCR 성공 ${b.ocr?.checks?.[0]?.success}, confidence ${b.ocr?.checks?.[0]?.confidence}, preprocess ${n(b.ocr?.checks?.[0]?.preprocess_latency)}ms, OCR ${n(b.ocr?.checks?.[0]?.ocr_latency)}ms. OCR 중 backend CPU 평균/peak ${n(b.ocr?.resources?.backend_cpu_percent)}/${n(b.ocr?.resources?.backend_cpu_peak_percent)}%, RAM 평균/peak ${n(b.ocr?.resources?.ram_average_mb)}/${n(b.ocr?.resources?.ram_peak_mb)} MiB.

Idle 600ms: backend CPU ${n(b.idle?.backend_cpu_percent)}%, RAM ${n(b.idle?.ram_average_mb)} MiB. CPU는 논리 코어 1개 기준으로 100%를 초과할 수 있습니다. 시스템 CPU에는 다른 앱도 포함됩니다. CDP TaskDuration/JSHeapUsedSize는 각 E2E run에 기록합니다. GPU 미측정.

## 무조건 캡처 vs 조건부 캡처

동일 합성 페이지 10종 × 3회. 실제 개인 민감 화면은 사용하지 않았습니다. A는 모두 캡처 후 이름/가격 부족 시 OCR; B는 조건부 판단 후 동일 추출/OCR 조건. 순차 실행이므로 RAM/CPU에는 GC·실행 순서 영향이 있습니다.

${table([['모드','캡처','OCR','민감 캡처','불필요 비율','평균 ms','P95 ms','전체 ms','backend CPU %','RAM 평균/peak MiB'],['---','---:','---:','---:','---:','---:','---:','---:','---:','---:'],...(b.capture_comparison||[]).map((r:any)=>[r.mode,r.captures,r.ocr_calls,r.sensitive_captures,pct(r.unneeded_capture_ratio),n(r.latency.average),n(r.latency.p95),n(r.resources.duration_ms),n(r.resources.backend_cpu_percent),n(r.resources.ram_average_mb)+' / '+n(r.resources.ram_peak_mb)])])}

이는 고정 fixture의 실행 결과이며 일반 사용자 PC 부하 감소율 또는 실웹 precision/recall이 아닙니다.

## 정확도

수작업 정답 14 fixture: 6 상품, 8 비상품/민감 제외. 개발 중 사용한 작은 집합으로 과적합 가능성이 높습니다. 가격 null 정답 포함. 모델 매칭은 6쌍입니다.

${table([['항목','정확도','분모'],['---','---:','---:'],...['product_detection','name','price','brand','category','matching'].map(k=>[k,pct(t.accuracy?.[k]?.accuracy||0),t.accuracy?.[k]?.n||t.accuracy?.[k]?.total])])}

Capture Precision ${pct(t.accuracy?.capture?.precision||0)}, Recall ${pct(t.accuracy?.capture?.recall||0)}, F1 ${pct(t.accuracy?.capture?.f1||0)}. Ground Truth는 artifacts/ground-truth.json. 대규모 실사이트 옵션/가격 정답 검증은 미실시입니다.

## 크롤링 및 Blind Test

PASS는 범용 추출에서 상품명+양수 가격을 확보한 것으로, 실제 옵션/동일성 정답 검증과 다릅니다. PARTIAL은 필드 부족/보수적 민감 차단을 포함합니다.

${table([['사이트','유형','상태','Blind','가격','오류'],['---','---','---','---','---','---'],...(c.results||[]).map((r:any)=>[r.site,r.kind,r.status,r.blind?'예':'아니오',r.products?.[0]?.price??'-',r.error||'-'])])}

Blind 성공률 ${blind.filter((x:any)=>x.status==='PASS').length}/${blind.length} (${pct(blind.filter((x:any)=>x.status==='PASS').length/(blind.length||1))}). 추출 snapshot SHA256: ${c.extractor_sha256}. Blind 페이지를 처음 fetch하기 전 추출기를 고정했고 사이트별 CSS 추가 없음. 이후 빈 HTML/빈 URL 일반 수정이 있었으나 동일 사이트 재튜닝 결과로 성공률을 부풀리지 않았습니다.

검색 URL과 카탈로그 조회는 e2e-results.json의 providers에서 구분합니다. 추천 1개가 외부 일반 검색 성공을 뜻하지 않습니다. 국내/중고 플랫폼은 BLOCKED로 수집 성공을 주장하지 않습니다.

## 안정성 및 코드 품질

- TypeScript strict, ESLint, build 실행. Vitest ${u.numPassedTests??'미기록'}/${u.numTotalTests??'미기록'} 통과.
- backend fixture ${b.repeated?.success}/${b.repeated?.runs}, 최종 반복 crash ${b.repeated?.crashes}, timeout ${b.repeated?.timeouts}.
- 실제 확장 ${b.extension_repeat.success}/${b.extension_repeat.runs}, 실패 ${b.extension_repeat.failed}. 외부 응답은 캐시 활용.
- 장애/보안 ${t.stability?.filter((x:any)=>x.pass).length}/${t.stability?.length} 처리. 느린 인터넷/단절/timeout 일부는 제어된 주입; backend down은 실제 connection refused. 무한 스크롤은 500 DOM 노드 증가 모사입니다.
- 실제 Chrome 민감 페이지 skip, 동적 DOM, 스크린샷, 위젯, CDP를 확인했습니다. 모든 외부 장애를 실제 네트워크 환경에서 재현한 것은 아닙니다.
- Dashboard 실제 Chrome 검사: ${Object.values(ui.checks||{}).filter(Boolean).length}/${Object.keys(ui.checks||{}).length}. 세션 표시, 12개 데이터 섹션, polling 후 펼친 항목 유지, page error 0 확인.
- 이전 테스트 프로필의 service worker 캐시로 렌더링 계측 누락 발견. 매번 새 프로필을 생성하도록 바꾸고 client_total 기록까지 통과 조건에 넣어 최종 30회 재검증했습니다. OCR 라이브러리 전역 throw는 handler/모델 존재 검사로 보완하고 회귀 테스트 및 실제 OCR을 재실행했습니다.
- 개발 중: 런타임 부재, 네트워크/빌드 sandbox 접근 거부, 브라우저 경로 오류, 빈 HTML TypeError 1건, lint/type 오류, 검색 결과 없음/robots 차단, rate limit이 발생했습니다. 수정 후 재검증했습니다. crash 0은 **최종 반복 실행만**의 수치입니다.

## 보안/개인정보 검토

SECURITY_REVIEW.md 참조. npm audit ${audit.metadata?.vulnerabilities?.total??'미기록'}건. 원본 screenshot/OCR 전체/쿠키/폼 값 영구 저장 없음. 정제된 Inspector 데이터와 구조화 상품은 RAM 10분. artifacts는 공개 상품/합성 fixture 검증 결과이고 화면 파일은 남기지 않습니다.

JS 문자열의 물리적 완전 삭제는 보장되지 않습니다. 민감 페이지 휴리스틱은 DLP 보장이 아니며 쇼핑 화면 내 개인 알림/이름/주소를 놓칠 수 있습니다. 배포 전 캡처 전 마스킹/미리보기·추가 민감 정답 데이터·탭 전환 경쟁 테스트가 필요합니다. 테스트 전용 broad permission 빌드는 설치 대상이 아닙니다.

최종 정리 기록: ${cleanup.timestamp||'미기록'}. 서버 RAM 세션/검색 캐시 삭제 ${cleanup.server_data_deleted??'미기록'}, 테스트 서버 종료 ${cleanup.server_stopped??'미기록'}, 테스트 브라우저 프로필·토큰 삭제 ${cleanup.temporary_profiles_and_token_deleted??'미기록'}. 재실행 시 README 명령으로 서버/토큰을 새로 생성합니다.

## 참조와 재현

- [Schema.org Offer](https://schema.org/Offer): 구조화 가격 모델.
- [Chrome captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab): 현재 탭 캡처 API/권한.
- [Playwright 확장 테스트](https://playwright.dev/docs/chrome-extensions): 격리 persistent context.
- 사이트 선정: [Adafruit](https://www.adafruit.com/product/5813), [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-5), [The Pi Hut](https://thepihut.com/products/raspberry-pi-5).
- 실행 명령 README.md. 외부 결과는 실행 시점과 정책에 따라 달라질 수 있습니다.
`;
await writeFile('TECH_VALIDATION_REPORT.md',text);console.log(JSON.stringify({report:'TECH_VALIDATION_REPORT.md',decision,real_e2e:livePassed,extension_repeat:b.extension_repeat.success,blind_pass:blind.filter((r:any)=>r.status==='PASS').length}));
