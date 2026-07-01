# 05 데스크톱 앱 패키징 요청 프롬프트

Steply-Web React 프로젝트를 웹 실행은 유지하면서 컴퓨터 앱처럼 실행할 수 있게 Electron 또는 Tauri로 감싸줘.

우선 Electron 기준 요구사항:
- `electron/main.js` 추가
- `npm run desktop` 추가
- 개발 모드에서는 Vite 주소를 로드
- 빌드 후에는 dist/index.html을 로드
- 앱 창 크기는 큰 화면 발표용으로 1440x900 이상
- 메뉴바는 숨겨도 됨

완료 기준:
- `npm run dev` 기존 웹 실행 가능
- `npm run desktop` 데스크톱 창 실행 가능
- 기존 API 서버/QR/History 기능은 유지
