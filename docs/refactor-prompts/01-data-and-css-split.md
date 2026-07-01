# 01 데이터/CSS 분리 요청 프롬프트

현재 Steply-Web React 프로젝트를 크게 깨지지 않는 선에서 리팩토링해줘.

작업 목표:
- 컴포넌트 안에 있는 정적 데이터를 `client/src/data`로 분리
- `client/src/styles/app.css`를 역할별 CSS 파일로 분리
- 기존 UI/기능은 그대로 유지

완료 기준:
- `npm run check` 통과
- `npm run build` 통과
- 운동 목록, 추천 운동, 단계 목록은 각각 data 파일에서 수정 가능해야 함
