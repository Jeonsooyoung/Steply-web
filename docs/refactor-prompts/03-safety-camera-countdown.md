# 03 안전 준비/카메라 확인/카운트다운 화면 추가 요청 프롬프트

Steply-Web에 운동 시작 전 준비 흐름을 추가해줘.

추가 파일:
- SafetySetupPanel.jsx
- CameraCheckPanel.jsx
- CountdownPanel.jsx

SafetySetupPanel 요구사항:
- 한국어 제목: 안전하게 준비해 주세요
- 안정적인 의자 사용
- 주변 장애물 제거
- 어지러움/통증 시 즉시 중단
- 필요하면 보호자/직원과 함께 진행
- Steply는 의료 진단 도구가 아니라는 안내
- 확인 체크박스가 체크되어야 다음 단계 가능

CameraCheckPanel 요구사항:
- 큰 카메라 preview placeholder
- 전신이 화면에 들어와야 한다는 안내
- 카메라가 준비되었다고 가정하는 데모 버튼

CountdownPanel 요구사항:
- 3초 카운트다운
- 끝나면 chair_stand_session으로 자동 이동
