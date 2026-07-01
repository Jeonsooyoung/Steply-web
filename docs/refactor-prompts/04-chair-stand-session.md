# 04 Chair Stand 세션 화면 요청 프롬프트

Steply-Web에 30초 Chair Stand MVP 세션을 추가해줘.

목표:
- 실제 AI 카운트 대신 데모용 `+1회` 버튼 사용
- 30초 타이머
- 남은 시간 표시
- 횟수 표시
- 종료 후 result 화면으로 이동

추가 파일:
- useChairStandSession.js
- ChairStandSessionPanel.jsx
- recommendationRules.js

결과 payload에 포함할 값:
- sessionId
- testType: chair_stand
- count
- score
- remainingSeconds: 0
- flags
- message
- features.chairStandCount

추천 규칙:
- 0~4회: 지지 기반 균형/기립 유지 운동
- 5~8회: 의자 일어서기 연습 + 체중 이동
- 9회 이상: 일반 의자 일어서기 + 서기 자세 유지
