# Steply-Web 리팩토링 구조 가이드

웹 프로젝트는 서버와 브라우저 코드를 모두 기능 단위로 나눴습니다.

## 서버 구조

```text
server.js                         # 실행 진입점
src/config/env.js                 # 포트, 경로, body limit
src/config/mimeTypes.js           # 정적 파일 MIME
src/routes/apiRouter.js           # URL 라우팅만 담당
src/controllers/                  # HTTP 요청/응답 처리
src/services/                     # 세션, 분석 결과 처리 로직
src/repositories/                 # history.json 파일 저장소
src/utils/                        # HTTP, 네트워크, static file 유틸
src/ws/dashboardSocket.js         # WebSocket 연결/메시지 처리
```

수정 위치 기준:

| 하고 싶은 변경 | 수정 파일 |
|---|---|
| API URL 추가/변경 | `src/routes/apiRouter.js` |
| 세션 생성/QR payload 변경 | `src/services/sessionService.js` |
| 프로필 연결 검증 변경 | `src/services/sessionService.js` |
| 실시간 결과 저장 방식 변경 | `src/services/analysisService.js` |
| History DB로 교체 | `src/repositories/historyRepository.js` |
| WebSocket 메시지 처리 변경 | `src/ws/dashboardSocket.js` |
| 포트/데이터 경로 변경 | `src/config/env.js` |

## 프론트 구조

```text
public/index.html                 # 화면 뼈대
public/style.css                  # 스타일
public/js/main.js                 # 브라우저 진입점, 이벤트 바인딩
public/js/api/                    # fetch API 호출 함수
public/js/features/               # 화면 기능 단위 흐름
public/js/ui/                     # DOM 렌더링만 담당
public/js/state/appState.js       # 전역 상태
public/js/utils/dom.js            # DOM/format escape 유틸
```

수정 위치 기준:

| 하고 싶은 변경 | 수정 파일 |
|---|---|
| 버튼 이벤트 추가 | `public/js/main.js` |
| API 호출 변경 | `public/js/api/*.js` |
| 세션/QR 화면 변경 | `public/js/ui/sessionView.js` |
| 프로필 표시 변경 | `public/js/ui/profileView.js` |
| 실시간 분석 표시 변경 | `public/js/ui/realtimeView.js` |
| History 카드 표시 변경 | `public/js/ui/historyView.js` |
| 데모 데이터 변경 | `public/js/features/demoFeature.js` |
| WebSocket 수신 처리 변경 | `public/js/features/webSocketFeature.js` |

## 리팩토링 원칙

- `routes`는 URL 분기만 담당합니다.
- `controllers`는 HTTP body 읽기와 응답만 담당합니다.
- `services`는 실제 비즈니스 로직을 담당합니다.
- `repositories`는 저장소만 담당합니다.
- `ui`는 DOM 렌더링만 담당합니다.
- `features`는 API 호출, UI 갱신, 상태 변경 흐름을 묶습니다.

이 구조로 나누면 나중에 `history.json`을 SQLite/MySQL로 바꾸거나, 웹 화면을 React/Vue로 교체할 때 영향 범위를 줄일 수 있습니다.
