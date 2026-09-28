# 보안 및 개인정보 검토

검토 범위: src 전체, MV3 manifest, 네트워크/메모리 저장, 의존성, 테스트 도구. 이는 PoC 코드 리뷰와 제한된 실행 검증이며 보안 인증이나 침투 테스트가 아닙니다.

## v0.3 짧은 주기 및 추출 근거 검토

- 기본 2초/최소 1초로 변경했으며 단일 in-flight와 서버 750ms 하한을 유지합니다. 처리 지연 시 큐를 만들지 않습니다. 너무 이른 tick은 남은 대기시간을 응답합니다.
- 화면 캡처 뒤 URL·활성/포커스·편집 여부에 더해 마스크 존재와 ROI 불변을 확인합니다. 이전 마스크의 failsafe가 새 마스크를 제거하지 않도록 DOM host 인스턴스를 비교합니다. 이메일 부분이 실제 검은 픽셀로 캡처되는 것과 짧은 주기 타이머 경쟁을 브라우저에서 확인했습니다.
- ROI는 보이는 이미지/영상/canvas 좌표만 전달합니다. strict Zod 숫자 범위 검사 후 이미지 픽셀 경계로 제한하며 임의 경로·URL 요청을 받지 않습니다. 모델 입력을 실제 640×640으로 고정했습니다.
- 새 최근 이력은 RAM 30개 한도이며 원본 이미지나 OCR 전체 원문을 포함하지 않습니다. 사용자가 JSON 저장을 누를 때만 집계·도메인·좌표·측정값을 다운로드합니다. 다운로드에 이미지 data URL과 연결 토큰이 없는지 실제 브라우저 테스트로 확인했습니다. 관심 데이터 삭제는 이력도 삭제합니다.
- 사물 종류와 OCR 상품명 언급을 분리하고 confidence를 정답률로 표현하지 않습니다. 동일 화면 캐시가 반복돼도 새 추론 횟수를 올리지 않습니다. 모드/threshold/ROI와 검출 위치를 Inspector에서 확인할 수 있습니다.
- 단위, DOM 가드 15종, 실제 Chrome 개인정보·오류 복구·UI 11종을 실행했습니다. 입력/비밀번호/카드/OTP/iframe/SPA 경로와 화면 배율을 포함합니다. 이미지 자체에 찍힌 개인정보·가려지지 않은 이름 등 모든 민감 정보를 탐지한다는 보장은 여전히 하지 않습니다. 새 권한이나 원격 이미지 분석 API는 추가하지 않았습니다.

## v0.2 주기적 사물 분석 추가 검토

- `<all_urls>`는 **optional_host_permissions**이며 자동 분석 연결 버튼에서 사용자 동작으로 요청합니다. activeTab만으로는 페이지를 이동하며 주기 캡처할 수 없어 추가했습니다. 기존 상품 페이지 모드의 권한과 구분합니다.
- `LIVE_TICK`는 extension id / top frame / sender tab 검증 후, 저장된 동의와 인증된 로컬 서버 상태를 확인합니다. 활성 탭·포커스·URL·민감 DOM·입력 여부를 캡처 전후 재검사합니다. 시크릿 탭은 차단합니다. 중복 분석과 최소 주기 제한을 적용합니다.
- 비밀번호·결제·OTP 입력, 민감 URL/제목 및 편집 중 화면을 차단합니다. 댓글/계정/아바타/입력/iframe/PII 텍스트를 캡처 전에 검은 사각형으로 가립니다. 마스크는 finally와 2초 failsafe로 해제합니다. 화면 픽셀 자체의 개인정보·이름을 완벽히 판별하지 못하며 DOM 변화와 캡처 사이 경쟁 조건이 남습니다.
- 신규 API는 기존 Host/Origin/Bearer 검증 안에 있고 strict Zod schema / 크기 제한 / 단일 inference / rate limit을 적용합니다. pause/clear 중에 끝난 inference는 generation 검사로 폐기해 삭제 후 관심 데이터가 되살아나지 않습니다.
- 신규 경로는 원본 DOM·전체 URL·제목을 백엔드에 보내지 않습니다. OCR에서 허용된 상품명 구문만 추리고 전체 텍스트는 보관하지 않습니다. 사람·동물은 관심 사물에서 제외합니다. 로그는 처리시간·자원량·성공 여부만 기록합니다.
- 이미지 분석은 로컬 모델만 허용(`allowRemoteModels=false`, `local_files_only=true`). 원본 화면 업로드·원격 Vision API 호출 없음. 샘플/모델 다운로드는 명시적 준비 스크립트에서만 수행합니다.
- RAM 관심 데이터는 최대 100개/30분 TTL, 처리 샘플 최대 100개, 이벤트 30개, 동일 이미지 캐시 1개(해시와 추출 결과만). 이미지 파일 저장 없음. JavaScript 문자열과 native runtime 복사본의 물리적 즉시 삭제는 보장하지 않습니다.
- 자동 재연결 때문에 토큰 정책을 **재시작 간 유지**로 변경했습니다. `.gitignore`된 파일과 확장 local storage에 저장하며 방문 페이지에는 전달하지 않습니다. 토큰은 OS 사용자 권한으로 보호되는 로컬 비밀이며 파일 삭제 후 재연결로 교체합니다. DEBUG 화면은 sessionStorage에만 저장합니다.
- 외부 검색 링크는 고정 HTTPS Google URL에 encodeURIComponent한 사물 이름만 넣고, 사용자가 클릭할 때 열립니다. 전체 방문 URL/이미지를 검색 엔진에 보내지 않습니다. 화면 출력은 textContent를 사용합니다.
- 남은 제한: 전체 개인정보 자동 판별, 실제 로그인된 소셜 서비스 화면 검증, optional permission 동의 창의 수동 확인, 모델 inference 강제 중단, GPU·시스템 전체 자원 사용량은 완료하지 않았습니다. 로컬 모델 RAM 사용량이 크므로 상용화 전 모델/입력 크기 최적화가 필요합니다.

아래 표는 최초 상품 페이지 PoC의 검토 이력입니다. Chrome optional 권한과 토큰 재사용은 위 v0.2 정책이 최신입니다.

## 발견 사항과 처리

| 항목 | 검토 결과 / 처리 |
| --- | --- |
| 의존성 취약점 | 최초 npm audit 4건(High 1, Moderate 2, Low 1). sharp 0.35.5+, esbuild 0.28.2+, Vitest 5.0.2로 갱신. 최종 npm-audit.json에서 재검증. |
| Chrome 권한 | 배포 manifest는 activeTab, scripting, storage 및 localhost host permission만 포함. 탭 전체/방문기록/쿠키/webRequest 권한 없음. |
| 자동화 권한 | dist/test-extension만 `<all_urls>` 사용. Playwright가 브라우저 action 클릭으로 activeTab을 부여할 수 없어 별도 test build 사용. 배포 manifest 권한과 구별; 수동 activeTab smoke test 미실시. |
| 동의와 메시지 | 체크박스 동의, chrome.storage.session의 tab/origin/token, sender extension id·frame 0·tab id 검사. externally_connectable 없음. |
| 캡처 경쟁 상태 | 캡처 직전 live DOM의 민감 입력과 URL/활성 탭 검사, 캡처 후 URL/활성 탭 재확인. 화면이 원자적으로 고정되지는 않으므로 극단적 탭 전환 경쟁은 잔여 위험. |
| 민감 페이지 | login/checkout/bank/mail/medical/account URL·title, password/결제/연락처/contenteditable 차단. 입력 값·쿠키·textarea 내용은 수집하지 않음. 휴리스틱으로 모든 개인 정보 탐지를 보장하지 않음. |
| RAW 수집 최소화 | JSON-LD에서 Product 필드만 allowlist, review 저자/본문 및 설명 제외. 이메일/전화/긴 숫자 패턴 마스킹, URL query/fragment 제거. Inspector도 정제된 입력만 표시. |
| 원본 screenshot | 메모리 전달 및 처리 후 참조 해제. Sharp Buffer overwrite. screenshot·전처리 PNG 파일 저장 없음. JavaScript 문자열/런타임 복사본의 물리적 완전 삭제는 보장 불가. |
| OCR | 로컬 영어 모델; Vision API 없음. 결과 전체 영구 저장 없음. 익명화한 임시 preview만 Inspector에 표시. 최대 20초 OCR timeout; 늦게 생성된 worker도 종료. |
| OCR 전역 예외 | Tesseract 기본 errorHandler가 전역 throw하는 동작을 확인하여 job rejection으로 처리하는 handler를 추가. 모델 파일 사전 존재 검사, 엔진 실패 시 terminate 회귀 테스트 추가. 손상 모델/엔진 초기화의 모든 실패 형태 검증은 남음. |
| XSS/DOM injection | 외부 데이터 출력은 textContent/createElement 사용, innerHTML/eval 없음. 테스트 fixture의 innerHTML은 고정 테스트 문자열만 사용. 링크는 http(s) 제한, noopener/noreferrer. |
| 로컬 서버 | 127.0.0.1 bind, 매 시작 256-bit Bearer token, Host/Origin 확인. wildcard CORS 없음. CSP frame-ancestors none, no-store/nosniff. |
| 인증 비교 | token 비교를 JS 문자 길이에서 Buffer byte 길이 검사 후 timingSafeEqual로 수정하여 비ASCII 입력에 의한 예외 방지. |
| 입력·과부하 | zod strict root/signals, 요청 약 6.5MB, image 6MB, pixel 16MP, 단일 분석 concurrency, 요청 rate limit, 헤더/요청 timeout. JSON-LD value는 유연한 unknown 허용: 로컬 token 보유자가 전송하는 내용은 신뢰 경계 안이며 별도 deep schema 검증은 확장 과제. |
| SSRF | 소스 코드의 고정 HTTPS 호스트 allowlist, 임의 URL 요청 거부, redirect 미추적, userinfo/port 거부, 크기 2MB/timeout. 검색 문자열은 URL encoding. |
| robots/차단 | robots 거부·403·429·challenge는 BLOCKED. 검색 금지와 별도 허용 상품 카탈로그를 구분. 인증/유료 데이터 우회 없음. |
| 경로/명령 injection | 서버에 사용자 입력 기반 파일경로나 shell 실행 없음. 정해진 dashboard 파일만 서비스. 테스트/빌드 도구의 명령은 개발자 고정 인자. |
| 보관·폐기 | 세션 RAM 최대 20개/10분 TTL. 명시적 삭제는 세션과 검색 캐시도 삭제. 서버 처리 중 삭제 요청은 409이고 TTL로 삭제. 서버 재시작 시 세션 소멸. |
| 키/로그 | API 키 없음. 로컬 token 파일은 gitignore. JSON 단계 로그는 원문 대신 id/domain/count/status 중심. 전체 원본 이미지/로그인 값 운영 로그 없음. |
| URL 누락 버그 | undefined가 상대 URL `/undefined`로 변환되는 현상 수정, 회귀 테스트 추가. |
| 빈 문서 crash | linkedom의 빈 document.title getter 예외 발견 후 조기 반환 수정, 회귀 테스트 통과. |

## 실제 실행한 검사

- Vitest 보안/추출/파이프라인 회귀 테스트, TypeScript strict, ESLint, build.
- 인증 없는 요청 401, 악성 Origin 403, invalid payload 400, 실제 backend connection refused 처리.
- local/private/미허용 host 요청 차단; javascript URL 및 추적 query 제거; 폼 값 수집 방지.
- Chrome synthetic login 페이지는 캡처 skip. 가상 민감 페이지 A/B에서 조건부 민감 캡처 0회.
- 확장 전체 30회 반복, 로컬 OCR, 외부 robots 차단 기록. 세부 수치는 TEST_RESULTS.json.

## 남은 위험과 배포 조건

현재 정책은 공개 비로그인 상품 페이지를 전제로 합니다. 쇼핑 페이지 안의 개인 알림·이름·주소·이미지 내 개인정보는 완전히 탐지하지 못할 수 있습니다. 전처리 ROI 이전에 전체 화면이 메모리에 존재합니다. 상용화 전 캡처 전 마스킹/미리보기, 더 많은 민감 페이지 정답 집합, 탭 전환 race 테스트, 권한 철회 중 작업 취소, 한국어 OCR, 장기 메모리/DoS 검증이 필요합니다.

토큰 파일은 같은 Windows 계정의 다른 프로세스가 읽을 수 있습니다. 악성 로컬 프로세스로부터의 격리는 제공하지 않습니다. Chrome host localhost permission은 범용 로컬 앱 접근이 아닌 이 서버 요청 용도로만 사용합니다.

테스트 artifacts에는 공개 상품 정보와 합성 fixture 결과가 남습니다. 테스트용 브라우저 프로필에는 공개 웹 캐시가 남을 수 있습니다. 원본 화면 파일은 만들지 않았으며, 사용자 개인 Chrome 프로필은 사용하지 않았습니다.

이번 검증 종료 시에는 서버 RAM/검색 캐시를 삭제하고 서버를 종료했으며, 생성한 테스트 프로필 3개와 토큰 파일도 삭제했습니다. 정리 기록은 artifacts/cleanup.json입니다. 재실행 중에는 프로필이 새로 생길 수 있습니다.
