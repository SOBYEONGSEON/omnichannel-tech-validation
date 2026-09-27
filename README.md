# 옴니채널 상품 탐색 기술검증 PoC

PC Chrome 확장 + TypeScript 로컬 서버. 실제 데이터 흐름을 검증하기 위한 PoC입니다. 결과와 제한은 [TECH_VALIDATION_REPORT.md](TECH_VALIDATION_REPORT.md), [BENCHMARK_RESULTS.json](BENCHMARK_RESULTS.json), [TEST_RESULTS.json](TEST_RESULTS.json), [SECURITY_REVIEW.md](SECURITY_REVIEW.md)에 기록합니다.

## 바로 실행 — 현재 Windows 작업 폴더

`.tools`에 Node, Chrome for Testing, 영어 OCR 모델이 준비되어 있습니다. PowerShell 실행 정책 변경 없이 `run.cmd`를 사용하세요.

```powershell
cd 'C:\Users\bsaa0\Desktop\팀프로젝트'
.\run.cmd build
.\run.cmd start
```

1. Chrome에서 `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드 → **dist/extension** 선택.
2. `https://www.adafruit.com/product/5813` 방문.
3. `artifacts/server-token.txt`를 열어 토큰 복사. 토큰은 서버 시작마다 바뀌며 공유/커밋하지 않습니다.
4. 확장 버튼 클릭 → 토큰 붙여넣기 → 현재 탭 분석 동의 체크 → 분석 시작.
5. 위젯 DEBUG Panel에서 원본 요약 → 추출/provenance → 분류 → 검색어/provider 상태 → 저장/폐기 → 성능을 확인합니다.
6. `http://127.0.0.1:8787` Dashboard에도 같은 토큰을 입력하면 실시간 상태를 볼 수 있습니다.
7. 새 문서/다른 사이트에서는 확장 버튼으로 다시 시작합니다. 현재 문서 SPA URL 변화는 자동 재분석합니다. 팝업 동의 철회 버튼은 권한 상태와 서버 세션을 삭제합니다. 처리 중이면 TTL로 삭제됩니다. 위젯 중지는 위젯 분석만 중지합니다.

서버는 localhost만 사용합니다. `dist/test-extension`은 자동 검증용 broad permission 빌드이며 사용자 설치 대상이 아닙니다.

## 재현 명령

서버를 별도 터미널에서 실행한 상태에서 순서대로:

```powershell
.\run.cmd check        # 타입 검사 + ESLint + Vitest + 빌드
.\run.cmd test:record  # 단위/통합 결과 JSON
.\run.cmd audit:record # npm 취약점 조회 및 JSON
.\run.cmd validate     # backend 100회, 캡처 A/B 각 30회, 로컬 OCR, 장애/보안
.\run.cmd e2e          # 실상품 + 동적 DOM/민감 페이지 + 실제 확장 30회
.\run.cmd report       # 측정 결과를 합쳐 Markdown 보고서 자동 생성
```

`validate`와 `e2e`는 순차 실행하세요. 서버가 한 번에 1개 분석만 처리하므로 동시 요청은 429가 될 수 있습니다. 공개 사이트 재조회는 `run.cmd probe`입니다. 이미 관찰한 사이트를 재조회한 결과는 새로운 Blind Test로 간주하지 마세요. 일반 Node 설치가 있다면 `npm run ...`도 사용할 수 있습니다.

새 PC에서는 Node 24 이상을 설치한 후:

```powershell
npm ci
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD\.tools\browsers"
npx playwright install chromium
New-Item -ItemType Directory -Force .tools/ocr
Invoke-WebRequest https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz -OutFile .tools/ocr/eng.traineddata.gz
npm run check
npm start
```

다운로드에는 인터넷이 필요합니다. `.tools`는 버전 관리에서 제외했고 npm lockfile은 포함했습니다. 한국어 OCR 모델은 아직 없습니다.

## 구조와 데이터 흐름

```text
src/collect.ts       범용 DOM/JSON-LD 수집, 민감 입력 차단
src/core.ts          Capture Decision / 추출 / 분류 / 매칭 / 정렬
src/ocr.ts           Sharp 전처리 + 로컬 Tesseract.js
src/search.ts        robots 검사 + 검색/공개 카탈로그 provider
src/pipeline.ts      단계 실행, JSON 로그, TTL 메모리 저장
src/server.ts        인증된 localhost API
src/extension/       MV3 background/content/popup + 플로팅 Inspector
src/dashboard.*     기술검증 Dashboard
scripts/            build / probe / validate / e2e / report
tests/              수작업 정답 fixture + unit/integration
artifacts/          검증 증거, 토큰, 격리된 테스트 프로필
```

Capture Decision이 민감 페이지를 먼저 차단하고 쇼핑 점수 0.55 이상에서 캡처합니다. JSON-LD → meta → DOM → 800ms 동적 DOM 재시도 → 부족한 상품명/가격만 OCR 순서입니다. 실상품은 JSON-LD로 추출하여 OCR을 생략했고, screenshot-only OCR은 합성 픽셀로 따로 검증했습니다.

검색은 제한된 3개 판매처 HTML 검색과 Raspberry Pi 5 공개 카탈로그입니다. 금지된 검색 경로는 BLOCKED로 기록합니다. 별도 카탈로그도 상품 URL의 robots 허용을 확인합니다. 생성된 최저가/중고/alternative 검색어와 제공자가 실제 실행한 `providers.query`를 구별합니다. 중고/국내 쇼핑몰 검색 API는 미연동입니다.

서로 다른 통화·상품 상태는 가격 우위를 계산하지 않습니다. 용량/옵션·배송/세금·재고 정합성은 미완료이므로 결과는 비교 후보입니다. confidence는 학습된 확률이 아닌 룰 점수입니다.

화면/임시 전처리 이미지는 디스크에 저장하지 않습니다. 구조화 상품과 익명화된 임시 Inspector 정보는 RAM에 최대 20개, 10분만 보관합니다. 테스트 증거는 공개 상품과 합성 fixture만 파일로 기록합니다. 종료 시 운영 세션은 사라집니다. `artifacts/browser-profile-e2e`에는 공개 페이지 브라우저 캐시가 남을 수 있으며 사용자가 필요하면 해당 폴더를 삭제할 수 있습니다.

## 제한 및 오류 확인

- 권한 오류: 상품 탭에서 확장 버튼을 다시 클릭해 동의하세요. 토큰은 서버 재시작마다 바뀝니다.
- BACKEND 오류: 서버 실행/토큰/8787 포트 확인. 동시 실행은 429 가능.
- BLOCKED/UNSUPPORTED: robots·CAPTCHA·redirect는 우회하지 않습니다.
- E2E는 별도 manifest에 `<all_urls>`를 추가합니다. 배포 manifest의 실제 사용자 activeTab 버튼 흐름은 수동 smoke test가 남았습니다.
- 민감 정보 탐지는 휴리스틱입니다. 공개 비로그인 상품 페이지에서 사용하세요.
- CPU는 backend 논리 코어 1개 기준, browser 메모리는 CDP JS heap이며 시스템 CPU에는 다른 프로그램도 포함됩니다. GPU/브라우저 전체 RSS는 미측정입니다.
- 100회 backend fixture, 실제 확장 30회, 실사이트 1회, Blind Test 수치는 서로 다른 검증 집합입니다.
