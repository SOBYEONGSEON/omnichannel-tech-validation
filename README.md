# 옴니채널 상품 탐색 기술검증 PoC

PC Chrome 확장 + TypeScript 로컬 서버. 실제 데이터 흐름을 검증하기 위한 PoC입니다. 결과와 제한은 [TECH_VALIDATION_REPORT.md](TECH_VALIDATION_REPORT.md), [BENCHMARK_RESULTS.json](BENCHMARK_RESULTS.json), [TEST_RESULTS.json](TEST_RESULTS.json), [SECURITY_REVIEW.md](SECURITY_REVIEW.md)에 기록합니다.

## 주기적 화면 분석 사용하기 (v0.3)

쇼핑 페이지뿐 아니라 일반 웹·인스타그램·유튜브 화면에서 사물을 찾는 모드입니다. 페이지 이동 없이 **기본 목표 2초, 최소 1초 간격**으로 현재 사용 중인 Chrome 탭을 캡처합니다. 분석이 주기보다 오래 걸리면 완료 후 다음 프레임을 처리하고 밀린 캡처는 쌓지 않습니다. 같은 사물 종류가 여러 번 나타나면 관측 수를 집계합니다.

1. 이 폴더의 **`START_POC.cmd`를 더블클릭**합니다. 프로그램 창을 열어 두세요. 처음 설정하거나 코드를 갱신한 경우 먼저 `run.cmd build`를 실행하세요.
2. Chrome 주소창에 `chrome://extensions` 입력 → **개발자 모드** → **압축해제된 확장 프로그램을 로드합니다** → 이 폴더의 **`dist/extension`** 선택. 이미 설치했다면 확장 새로고침 버튼을 누르고, 분석할 웹페이지도 새로고침해 새 코드를 적용합니다.
3. `artifacts/server-token.txt`를 메모장으로 열어 토큰을 복사합니다. Chrome 확장 버튼 → 토큰 입력 → **주기적 화면 분석 동의** 체크 → **주기 분석 연결 / 시작**. Chrome 사이트 접근 권한을 허용합니다. 최초 1회 필요합니다.
4. 이후에는 `START_POC.cmd` 실행 시 이전 동의로 분석을 자동 재개합니다. 프로그램이 꺼져 있으면 캡처하지 않습니다. 동의를 철회했다면 다시 연결해야 합니다.
5. **[직접 테스트 / DEBUG](http://127.0.0.1:8787/live)** 를 열고 같은 토큰으로 연결합니다. 1/2/5/10/30/60초 간격 변경, 일시정지, 재개, 관심 데이터 삭제가 가능합니다.
6. 이 화면의 **사물 이미지 테스트 화면 열기**를 누르고 그 탭을 20~30초 동안 보고 있으세요. 오른쪽 위젯에서 리모컨 관측 수가 늘어나면 주기적 실제 화면 캡처가 동작한 것입니다. **공개 샘플 이미지 1회 분석** 버튼은 확장 프로그램 없이 로컬 분석 엔진만 검증합니다.
7. 분석 중지는 DEBUG의 일시정지 또는 위젯의 자동 분석 중지를 사용합니다. 영구 동의 철회는 확장 팝업의 **자동 분석 동의 철회**입니다. 프로그램 창에서 `Ctrl+C`를 눌러 종료할 수도 있습니다.
8. **이번 화면에서 추출한 데이터**에서 위치 도식·사물 종류·OCR 상품명 언급·엔진 점수를 확인합니다. **최근 30회 분석 이력**에서 새 추론과 캐시 재사용을 구분합니다. **현재 결과 JSON 저장**을 누르면 종료 후에도 결과를 확인할 수 있습니다. 원본 이미지와 토큰은 내보내지 않습니다.

**수집 범위:** 활성·포커스된 HTTP(S) 탭만 대상으로 합니다. 로그인·결제·메일·DM·설정·민감 URL/제목, 비밀번호/카드 입력이 보이는 페이지, 입력 중인 화면은 제외합니다. 입력 요소·댓글·아바타·이메일/전화번호 패턴을 캡처 전에 가립니다. 이 규칙이 모든 개인정보를 판별하는 것은 아니므로 비공개 화면에서는 중지하세요. 시크릿 모드는 지원하지 않습니다.

**저장 범위:** 원본 이미지는 디스크에 저장하지 않습니다. 감지 종류·허용된 OCR 상품명·관측 수·도메인·성능만 RAM에 남깁니다(30분 TTL, 최대 관심 100개). 전체 URL·페이지 제목·DOM·OCR 전문은 새 주기 분석 경로에서 저장하지 않습니다. 연결 동의/토큰은 Chrome 로컬 저장소와 gitignore된 토큰 파일에 남겨 재실행을 지원합니다.

**현재 한계:** 로컬 YOLOS-tiny q8로 제한된 사물 종류를 인식하며, 정확한 상품 SKU/브랜드를 이미지에서 일반적으로 알아내지는 못합니다. OCR은 영어 모델과 소수 상품명 사전입니다. 관심 사물별 외부 상품 검색 링크를 제공하고, 아래 기존 상품 페이지 모드에서 판매처 자동 비교를 제공합니다. 주기 분석의 모든 사물에 대한 자동 판매처 가격 비교는 아직 연결하지 않았습니다. 로그인한 Instagram/YouTube 실계정은 자동 테스트하지 않았습니다. v0.3 공개 이미지 벤치마크의 평균 백엔드 RSS는 약 557MB이며 일반 웹 정확도는 별도 검증이 필요합니다.

**개선 검증:** [REALTIME_VALIDATION_REPORT.md](REALTIME_VALIDATION_REPORT.md)에 변경 전후 precision/recall/F1, 지연시간, RAM, 실제 1초 캡처 결과를 기록합니다. 같은 정답 64조건에서 precision 28.3%→57.6%, 평균 처리 1.66초→0.63초였습니다. COCO128 학습 이미지 일부를 사용한 제한적 비교이며 인터넷 전체 정확도를 의미하지 않습니다.

```powershell
.\run.cmd prepare:vision # 새 PC에서 모델·공개 테스트 이미지 최초 다운로드
.\run.cmd check          # 타입, 린트, 단위 테스트, 확장 빌드
.\run.cmd test:live      # 서버를 켠 상태에서 실제 Chrome 주기 캡처 30회 검증
.\run.cmd test:startup   # 기존 서버를 끈 상태에서 자동 시작·종료·재시작 검증
.\run.cmd test:realtime  # 기존 서버를 끈 상태: 1초 60회 / 변화 30회 / 개인정보·장애·UI
.\run.cmd test:guards    # 별도 브라우저 DOM·DPR 가드 15종 검증
.\run.cmd benchmark:accuracy # COCO128 준비 후 64조건 실제 모델 정확도/성능
.\run.cmd benchmark:baseline # 고정된 v0.2 코드로 동일 조건 재실행
.\run.cmd report         # 기존 결과 + 주기 분석 결과를 합쳐 자동 보고서 생성
```

모델 준비 시에만 Hugging Face에 연결하며 실제 분석은 로컬에서 실행합니다. 의존성은 `npm ci`로 설치합니다. [모델 출처](https://huggingface.co/Xenova/yolos-tiny), [공개 테스트 이미지](https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg).

정확도 벤치마크용 공개 정답 자료 최초 준비(일반 사용에는 불필요):

```powershell
Invoke-WebRequest https://github.com/ultralytics/assets/releases/download/v0.0.0/coco128.zip -OutFile .tools/test-assets/coco128.zip
Expand-Archive -LiteralPath .tools/test-assets/coco128.zip -DestinationPath .tools/test-assets -Force
```

자료 출처: [COCO128 공식 문서](https://docs.ultralytics.com/datasets/detect/coco128/). 이미지·가중치는 `.tools`에만 두고 저장소에 포함하지 않습니다. 중간 후보 실험 기록은 `artifacts/accuracy-*.json`, 최종은 `accuracy-improved.json`, 가드/실제 캡처는 `guard-validation.json`, `realtime-validation.json`입니다.

## 바로 실행 — 현재 Windows 작업 폴더

`.tools`에 Node, Chrome for Testing, 영어 OCR 모델이 준비되어 있습니다. PowerShell 실행 정책 변경 없이 `run.cmd`를 사용하세요.

```powershell
cd 'C:\Users\bsaa0\Desktop\팀프로젝트'
.\run.cmd build
.\run.cmd start
```

1. Chrome에서 `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드 → **dist/extension** 선택.
2. `https://www.adafruit.com/product/5813` 방문.
3. `artifacts/server-token.txt`를 열어 토큰 복사. 토큰은 재실행 간 유지하며 공유/커밋하지 않습니다. 교체하려면 프로그램을 종료하고 이 파일을 삭제한 뒤 재실행·재연결하세요.
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
npm run prepare:vision
npm start
```

다운로드에는 인터넷이 필요합니다. `.tools`는 버전 관리에서 제외했고 npm lockfile은 포함했습니다. 한국어 OCR 모델은 아직 없습니다.

## 구조와 데이터 흐름

```text
src/collect.ts       범용 DOM/JSON-LD 수집, 민감 입력 차단
src/core.ts          Capture Decision / 추출 / 분류 / 매칭 / 정렬
src/ocr.ts           Sharp 전처리 + 로컬 Tesseract.js
src/live-policy.ts   비쇼핑 화면 캡처 규칙 / 사물 분류 사전 / 관측 집계
src/vision.ts        로컬 YOLOS-tiny q8 + OCR
src/live.ts          주기 분석 상태 / 이미지 캐시 / RAM 집계 API
src/live.html        직접 테스트 및 실시간 DEBUG
src/search.ts        robots 검사 + 검색/공개 카탈로그 provider
src/pipeline.ts      단계 실행, JSON 로그, TTL 메모리 저장
src/server.ts        인증된 localhost API
src/extension/       MV3 background/content/popup + 플로팅 Inspector
src/dashboard.*     기술검증 Dashboard
scripts/            build / probe / validate / e2e / report
tests/              수작업 정답 fixture + unit/integration
artifacts/          검증 증거, 토큰, 격리된 테스트 프로필
```

기존 상품 페이지 모드의 Capture Decision이 민감 페이지를 먼저 차단하고 쇼핑 점수 0.55 이상에서 캡처합니다. JSON-LD → meta → DOM → 800ms 동적 DOM 재시도 → 부족한 상품명/가격만 OCR 순서입니다. 실상품은 JSON-LD로 추출하여 OCR을 생략했고, screenshot-only OCR은 합성 픽셀로 따로 검증했습니다. 새 주기 모드는 별도 live-policy로 쇼핑 여부와 관계없이 허용 화면을 분석합니다.

검색은 제한된 3개 판매처 HTML 검색과 Raspberry Pi 5 공개 카탈로그입니다. 금지된 검색 경로는 BLOCKED로 기록합니다. 별도 카탈로그도 상품 URL의 robots 허용을 확인합니다. 생성된 최저가/중고/alternative 검색어와 제공자가 실제 실행한 `providers.query`를 구별합니다. 중고/국내 쇼핑몰 검색 API는 미연동입니다.

서로 다른 통화·상품 상태는 가격 우위를 계산하지 않습니다. 용량/옵션·배송/세금·재고 정합성은 미완료이므로 결과는 비교 후보입니다. confidence는 학습된 확률이 아닌 룰 점수입니다.

화면/임시 전처리 이미지는 디스크에 저장하지 않습니다. 구조화 상품과 익명화된 임시 Inspector 정보는 RAM에 최대 20개, 10분만 보관합니다. 테스트 증거는 공개 상품과 합성 fixture만 파일로 기록합니다. 종료 시 운영 세션은 사라집니다. `artifacts/browser-profile-e2e`에는 공개 페이지 브라우저 캐시가 남을 수 있으며 사용자가 필요하면 해당 폴더를 삭제할 수 있습니다.

## 제한 및 오류 확인

- 권한 오류: 확장 버튼에서 해당 모드에 동의하세요. 토큰은 재시작 간 유지되며 직접 삭제·교체한 경우 다시 연결해야 합니다.
- BACKEND 오류: 서버 실행/토큰/8787 포트 확인. 동시 실행은 429 가능.
- BLOCKED/UNSUPPORTED: robots·CAPTCHA·redirect는 우회하지 않습니다.
- E2E는 별도 manifest에 `<all_urls>`를 추가합니다. 배포 manifest의 실제 사용자 activeTab 버튼 흐름은 수동 smoke test가 남았습니다.
- 민감 정보 탐지는 휴리스틱입니다. 공개 비로그인 상품 페이지에서 사용하세요.
- 기존 상품 벤치마크 CPU는 backend 논리 코어 1개 기준입니다. 새 주기 분석 CPU는 전체 논리 CPU 수로 나눈 비율입니다. 서로 직접 비교하지 마세요. browser 메모리는 CDP JS heap이며 GPU/브라우저 전체 RSS는 미측정입니다.
- 100회 backend fixture, 실제 확장 30회, 실사이트 1회, Blind Test 수치는 서로 다른 검증 집합입니다.
