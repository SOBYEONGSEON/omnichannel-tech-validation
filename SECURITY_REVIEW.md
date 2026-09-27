# 보안 및 개인정보 검토

검토 범위: src 전체, MV3 manifest, 네트워크/메모리 저장, 의존성, 테스트 도구. 이는 PoC 코드 리뷰와 제한된 실행 검증이며 보안 인증이나 침투 테스트가 아닙니다.

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
