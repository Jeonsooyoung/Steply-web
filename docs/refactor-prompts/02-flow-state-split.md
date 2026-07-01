# 02 화면 흐름 상태 분리 요청 프롬프트

Steply-Web의 화면 흐름을 기존 `start / analysis / result / exercise`에서 아래 상태로 세분화해줘.

새 흐름:
- profile_select 또는 start
- safety_setup
- camera_check
- countdown
- chair_stand_session
- result
- recommendation

요구사항:
- 기존 QR 세션 생성/프로필 연결 기능은 유지
- JourneyFlow 단계 표시도 새 흐름에 맞게 변경
- 아직 실제 화면이 없는 단계는 placeholder panel로 만들어도 됨
- 한 번에 큰 UI를 만들지 말고 상태 전환이 먼저 정상 동작하게 해줘
