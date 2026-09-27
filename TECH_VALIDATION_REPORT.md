<!-- LIVE_VALIDATION -->
# v0.2 추가 검증 — 주기적 관심 사물 분석

생성: 2026-09-27T17:19:14.308Z · 재현: run.cmd test:live, run.cmd test:startup, run.cmd report.

**FEASIBLE WITH CONDITIONS**. 쇼핑 여부와 무관한 활성 Chrome 탭의 주기 캡처, 로컬 객체 인식/OCR, 반복 노출 집계, 위젯, 직접 테스트 화면을 구현했습니다. 초기 1회 Chrome 권한 동의 후 프로그램 실행 시 자동 분석합니다.

- 실제 Chrome 주기 반복 **30/30 성공**. 이동하지 않는 동일 URL에서 35회 캡처가 기록됐고 리모컨과 OCR 상품명 관측 수가 증가했습니다.
- 제어/안정성 브라우저 시나리오 **12/12 통과**: 샘플 버튼, 주기 캡처, 일시정지, 비밀번호/입력/SPA DM 제외, 재개, 동의 철회, 서버 꺼짐, 재시작 자동 복구, 위젯 중지·삭제.
- 단위·통합 **64/64 통과**. 기존 상품 파이프라인 테스트 포함. 취소/삭제 중 완료된 inference의 결과 폐기, 캐시 재사용, 저장 최소화, 실패 후 복구를 테스트했습니다. 단위 테스트의 vision 결과는 mock이며, 브라우저/vision smoke는 실제 모델입니다.
- 공개 원본 이미지에서 리모컨 2개를 실제 인식했습니다. 첫 엔진 실행 1943.05ms (객체 1427.31ms, OCR 509.32ms). 사진과 화면 캡처의 confidence는 서로 다를 수 있습니다.

| 측정 | Average | Median | P50 | P95 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| 백엔드 처리 ms (동일 이미지 캐시 포함) | 64.44 | 0.14 | 0.14 | 0.19 | 2250.67 |
| 실제 캡처 ms | 11.46 | 11.50 | 11.50 | 12.80 | 14.30 |
| 백엔드 CPU % (전체 논리 CPU 기준) | 0.33 | 0.00 | 0.00 | 0.00 | 11.46 |
| 백엔드 RSS MB | 1069.95 | 1066.17 | 1066.17 | 1076.55 | 1181.16 |

위 통계는 **35개 실제 캡처 후 서버 처리 샘플**이며 동일 화면의 추출 결과 캐시를 포함합니다. 캐시 hit에서 객체 추론/OCR은 다시 호출하지 않습니다. 새 사진/움직이는 동영상에 이 지연시간을 적용할 수 없습니다. 마지막-최초 RSS 변화 -113.68MB, 3번째 이후 warm RSS 변화 3.08MB. 작업 전후 GC 영향을 포함하므로 메모리 누수가 없다는 증명은 아닙니다. GPU, 전체 PC CPU/브라우저 리소스, 실제 소셜 피드 변화에 따른 장기 부하는 이번 추가 검증에서 측정하지 않았습니다.

**직접 사용:** START_POC.cmd 실행 → Chrome에 dist/extension 로드 → 토큰/주기 분석 동의 최초 연결 → [DEBUG/테스트](http://127.0.0.1:8787/live) → 사물 이미지 테스트 화면을 활성 탭으로 20~30초 보기. 상세 절차는 README에 있습니다.

**미완료·조건:** 개인정보 감지는 규칙 기반으로 완전하지 않습니다. 모델은 제한된 사물 종류만 인식하고 일반 SKU/브랜드 식별을 보장하지 않습니다. 한국어 OCR 및 임의 사물의 자동 판매처 가격 비교는 미완료(새 모드는 클릭형 검색 링크 제공, 기존 상품 모드는 판매처 비교 유지). 로그인한 Instagram/YouTube는 실계정으로 검증하지 않았습니다. 실제 optional permission 동의 창은 사용자가 한 번 확인해야 하며 테스트는 분리된 TEST ONLY 권한으로 실행했습니다. 모델 RAM이 약 1GB인 점은 상용화 전 해결 과제입니다.

**개인정보:** 신규 경로에서 전체 URL/제목/DOM/OCR 전문을 저장하지 않습니다. 원본 캡처는 파일로 쓰지 않고 분석 뒤 참조를 해제합니다. 관심 데이터는 RAM 100개/30분 TTL, 성능 100개, 이벤트 30개, 결과 캐시 1개로 제한합니다. 프로그램 종료 시 관측 데이터는 사라지며 연결 토큰과 동의만 유지됩니다. 테스트는 공개 이미지와 합성 화면만 사용했습니다.

검증 근거: artifacts/live-e2e.json, artifacts/live-startup-e2e.json, artifacts/vision-smoke.json, artifacts/unit-results.json. 아래는 기존 상품 페이지 PoC의 검증 이력이며 신규 범용 사물 인식의 정확도 수치로 해석하지 않습니다.
<!-- /LIVE_VALIDATION -->

# 기술검증 보고서 — FEASIBLE WITH CONDITIONS

생성: 2026-09-27T17:19:14.176Z · 명령: run.cmd report. 실제 실행 결과와 제한을 기록합니다. 입력 증거: BENCHMARK_RESULTS.json, TEST_RESULTS.json, artifacts/*.json.

## 최종 기술 판단

**FEASIBLE WITH CONDITIONS**. 실제 상품 페이지의 DOM/JSON-LD → 조건부 Chrome 캡처 → 구조화/분류 → 허용된 공개 카탈로그 → 비교 → 위젯이 성공.

실상품 https://www.adafruit.com/product/5813: Raspberry Pi 5 - 8 GB RAM, 캡처 true, 결과 1개, 위젯 표시 true. 서버+캡처 68.06ms, 전체 브라우저 테스트 1032.99ms. 가격은 검증 시점 값입니다. 최종 재실행의 실사이트 조회는 이전 실시간 요청으로 준비된 5분 캐시를 사용할 수 있으며, provider.duration_ms=0은 캐시 hit입니다. cold 인터넷 지연값으로 해석하지 않습니다.

실제 확장 반복 30/30, backend fixture 100/100, Blind 1/3 PASS입니다. 핵심 구현은 가능하지만 임의 쇼핑몰 일반화는 검증되지 않았습니다. 검색 API/허용 카탈로그 확대, 옵션/통화/배송 정합성, 민감 페이지 감지, 한국어 OCR, production activeTab 수동 검증이 개발 조건입니다.

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

| 항목 | 측정값 |
| --- | --- |
| os | Windows_NT 10.0.26200 |
| cpu | AMD Ryzen 7 9800X3D 8-Core Processor            |
| logical_cpus | 16 |
| ram_gb | 31.102954864501953 |
| node | v24.21.0 |
| python | not installed / not used |
| browser | 153.0.8010.12 |

설치된 사용자 Chrome 154.0.8037.57. 자동화는 개인 프로필과 분리된 Chrome for Testing 153.0.8010.12입니다.

## 성능 결과

**실제 확장 30회**, 합성 동적 상품 페이지, 외부 상품 캐시가 준비된 상태의 ms 통계입니다. 2.7초 요청 간격은 제외합니다. 0은 단계 미실행입니다. total은 backend+캡처, client_total은 DOM 수집/통신/폴링/렌더 포함입니다.

| 단계 | Average | Median / P50 | P95 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| capture_latency | 19.96 | 20.10 | 21.10 | 21.20 |
| preprocess_latency | 0.00 | 0.00 | 0.00 | 0.00 |
| ocr_latency | 0.00 | 0.00 | 0.00 | 0.00 |
| extract_latency | 0.09 | 0.08 | 0.14 | 0.15 |
| classify_latency | 0.01 | 0.01 | 0.02 | 0.02 |
| search_latency | 0.07 | 0.06 | 0.09 | 0.12 |
| ranking_latency | 0.05 | 0.04 | 0.08 | 0.08 |
| render_latency | 0.33 | 0.30 | 0.40 | 0.40 |
| total_latency | 20.67 | 20.82 | 21.86 | 21.88 |
| client_total_latency | 30.53 | 30.80 | 31.40 | 31.60 |

backend 100회는 검색 fixture이고 캡처/OCR/렌더를 생략했습니다. 평균 0.10ms, P95 0.16ms를 서비스 E2E 성능으로 주장하지 않습니다. 너무 짧은 단계는 Windows CPU counter가 0으로 표시될 수 있습니다.

RAM 변화: backend 100회 17.66 MiB; 확장 30회 backend 0.45 MiB, browser JS heap -1.44 MiB. 캐시/JIT/GC/검증기 보관 데이터 포함으로 누수 여부 판정은 불가하며 장기 soak test가 필요합니다.

OCR 성공 true, confidence 93, preprocess 19.45ms, OCR 267.09ms. OCR 중 backend CPU 평균/peak 174.24/405.07%, RAM 평균/peak 296.38/358.00 MiB.

Idle 600ms: backend CPU 0.00%, RAM 171.96 MiB. CPU는 논리 코어 1개 기준으로 100%를 초과할 수 있습니다. 시스템 CPU에는 다른 앱도 포함됩니다. CDP TaskDuration/JSHeapUsedSize는 각 E2E run에 기록합니다. GPU 미측정.

## 무조건 캡처 vs 조건부 캡처

동일 합성 페이지 10종 × 3회. 실제 개인 민감 화면은 사용하지 않았습니다. A는 모두 캡처 후 이름/가격 부족 시 OCR; B는 조건부 판단 후 동일 추출/OCR 조건. 순차 실행이므로 RAM/CPU에는 GC·실행 순서 영향이 있습니다.

| 모드 | 캡처 | OCR | 민감 캡처 | 불필요 비율 | 평균 ms | P95 ms | 전체 ms | backend CPU % | RAM 평균/peak MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| always_capture | 30 | 18 | 12 | 60.00% | 201.64 | 351.35 | 6126.54 | 155.83 | 331.20 / 413.22 |
| conditional_capture | 12 | 0 | 0 | 0.00% | 7.49 | 21.64 | 275.66 | 28.30 | 292.88 / 293.82 |

이는 고정 fixture의 실행 결과이며 일반 사용자 PC 부하 감소율 또는 실웹 precision/recall이 아닙니다.

## 정확도

수작업 정답 14 fixture: 6 상품, 8 비상품/민감 제외. 개발 중 사용한 작은 집합으로 과적합 가능성이 높습니다. 가격 null 정답 포함. 모델 매칭은 6쌍입니다.

| 항목 | 정확도 | 분모 |
| --- | ---: | ---: |
| product_detection | 100.00% | 14 |
| name | 100.00% | 6 |
| price | 100.00% | 6 |
| brand | 100.00% | 6 |
| category | 100.00% | 6 |
| matching | 100.00% | 6 |

Capture Precision 100.00%, Recall 100.00%, F1 100.00%. Ground Truth는 artifacts/ground-truth.json. 대규모 실사이트 옵션/가격 정답 검증은 미실시입니다.

## 크롤링 및 Blind Test

PASS는 범용 추출에서 상품명+양수 가격을 확보한 것으로, 실제 옵션/동일성 정답 검증과 다릅니다. PARTIAL은 필드 부족/보수적 민감 차단을 포함합니다.

| 사이트 | 유형 | 상태 | Blind | 가격 | 오류 |
| --- | --- | --- | --- | --- | --- |
| Adafruit | independent | PASS | 아니오 | 200 | - |
| Pimoroni | brand_shopify | PASS | 아니오 | 43.2 | - |
| The Pi Hut | shopify | PARTIAL | 아니오 | - | - |
| SparkFun | independent | PARTIAL | 예 | - | - |
| Waveshare | brand | PARTIAL | 예 | - | - |
| Books to Scrape | demo_unstructured | PASS | 예 | 51.77 | - |
| Coupang | korean_marketplace | BLOCKED | 아니오 | - | BLOCKED_ROBOTS |
| Samsung | official_brand | UNSUPPORTED | 아니오 | - | UNSUPPORTED_REDIRECT |
| eBay | used_marketplace | BLOCKED | 아니오 | - | BLOCKED_ROBOTS |

Blind 성공률 1/3 (33.33%). 추출 snapshot SHA256: 77f623ff9150cb86c74246645623a6caef2b7a569357c6c915703cd96e84e1e1. Blind 페이지를 처음 fetch하기 전 추출기를 고정했고 사이트별 CSS 추가 없음. 이후 빈 HTML/빈 URL 일반 수정이 있었으나 동일 사이트 재튜닝 결과로 성공률을 부풀리지 않았습니다.

검색 URL과 카탈로그 조회는 e2e-results.json의 providers에서 구분합니다. 추천 1개가 외부 일반 검색 성공을 뜻하지 않습니다. 국내/중고 플랫폼은 BLOCKED로 수집 성공을 주장하지 않습니다.

## 안정성 및 코드 품질

- TypeScript strict, ESLint, build 실행. Vitest 64/64 통과.
- backend fixture 100/100, 최종 반복 crash 0, timeout 0.
- 실제 확장 30/30, 실패 0. 외부 응답은 캐시 활용.
- 장애/보안 20/20 처리. 느린 인터넷/단절/timeout 일부는 제어된 주입; backend down은 실제 connection refused. 무한 스크롤은 500 DOM 노드 증가 모사입니다.
- 실제 Chrome 민감 페이지 skip, 동적 DOM, 스크린샷, 위젯, CDP를 확인했습니다. 모든 외부 장애를 실제 네트워크 환경에서 재현한 것은 아닙니다.
- Dashboard 실제 Chrome 검사: 4/4. 세션 표시, 12개 데이터 섹션, polling 후 펼친 항목 유지, page error 0 확인.
- 이전 테스트 프로필의 service worker 캐시로 렌더링 계측 누락 발견. 매번 새 프로필을 생성하도록 바꾸고 client_total 기록까지 통과 조건에 넣어 최종 30회 재검증했습니다. OCR 라이브러리 전역 throw는 handler/모델 존재 검사로 보완하고 회귀 테스트 및 실제 OCR을 재실행했습니다.
- 개발 중: 런타임 부재, 네트워크/빌드 sandbox 접근 거부, 브라우저 경로 오류, 빈 HTML TypeError 1건, lint/type 오류, 검색 결과 없음/robots 차단, rate limit이 발생했습니다. 수정 후 재검증했습니다. crash 0은 **최종 반복 실행만**의 수치입니다.

## 보안/개인정보 검토

SECURITY_REVIEW.md 참조. npm audit 0건. 원본 screenshot/OCR 전체/쿠키/폼 값 영구 저장 없음. 정제된 Inspector 데이터와 구조화 상품은 RAM 10분. artifacts는 공개 상품/합성 fixture 검증 결과이고 화면 파일은 남기지 않습니다.

JS 문자열의 물리적 완전 삭제는 보장되지 않습니다. 민감 페이지 휴리스틱은 DLP 보장이 아니며 쇼핑 화면 내 개인 알림/이름/주소를 놓칠 수 있습니다. 배포 전 캡처 전 마스킹/미리보기·추가 민감 정답 데이터·탭 전환 경쟁 테스트가 필요합니다. 테스트 전용 broad permission 빌드는 설치 대상이 아닙니다.

최종 정리 기록: 2026-09-27T15:09:15.642Z. 서버 RAM 세션/검색 캐시 삭제 true, 테스트 서버 종료 true, 테스트 브라우저 프로필·토큰 삭제 true. 재실행 시 README 명령으로 서버/토큰을 새로 생성합니다.

## 참조와 재현

- [Schema.org Offer](https://schema.org/Offer): 구조화 가격 모델.
- [Chrome captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab): 현재 탭 캡처 API/권한.
- [Playwright 확장 테스트](https://playwright.dev/docs/chrome-extensions): 격리 persistent context.
- 사이트 선정: [Adafruit](https://www.adafruit.com/product/5813), [Pimoroni](https://shop.pimoroni.com/products/raspberry-pi-5), [The Pi Hut](https://thepihut.com/products/raspberry-pi-5).
- 실행 명령 README.md. 외부 결과는 실행 시점과 정책에 따라 달라질 수 있습니다.
