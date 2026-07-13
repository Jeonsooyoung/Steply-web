# Stage 1 Assessment Session Traceability

기준 문서: Steply 기획 문서 §5.1–§5.3, §6–§7, §11.3. 이 문서는 Web과 Mobile을 하나의 제품으로 추적한다.

## 규칙 경계

의학적·표준 프로토콜 규칙은 결정론적 순수 함수로만 판정한다.

- Screening Q1/Q2/Q3 중 하나라도 `true`이면 Step 1 양성
- Chair Stand는 CDC 연령·성별 기준 **미만**이면 strength problem
- 확정된 팔 사용은 공식 Chair Stand 점수 0
- Tandem 유지시간 `< 10.0s`이면 balance problem
- Step 2 problem = strength problem OR balance problem
- §5.3 Step 1 × Step 2 × 낙상 이력으로 LOW/MODERATE/HIGH 판정
- 필수 입력 또는 두 기능검사 중 하나라도 없거나 유효하지 않으면 `NOT_SCORABLE`
- 두 기능검사가 모두 완료되기 전에는 최종 STEADI 결과와 운동 처방을 생성하지 않음

시스템 운영 임계값은 위 임상 판정과 분리한다.

- landmark visibility, 밝기, 프레임 경계, 스무딩, dwell/debounce
- stale frame 500ms, WebSocket buffer, HTTP timeout/retry
- 자세 onset/붕괴/발 이동을 기계적으로 식별하는 각도·거리·지속시간
- UI 카운트다운은 worker 상태기계 이벤트를 표시만 하며 결과를 확정하지 않음

## 단일 제품 계약

- `connectionSessionId`: QR/WebSocket 수명의 임시 연결 ID
- `assessmentSessionId`: Mobile에 영속되는 평가 세션 ID
- `attemptId`: 개별 기능검사 시도 ID
- `analysisSessionId`: worker 상태기계 ID. Balance 네 단계 전체에서 동일해야 함
- 위험도 enum: `NOT_SCORABLE | LOW | MODERATE | HIGH`
- Session: `IN_PROGRESS | COMPLETED | CANCELLED`
- Screening/Test slot: `NOT_STARTED | IN_PROGRESS | COMPLETED | NEEDS_RETRY`
- Prescription: `NOT_GENERATED | ACTIVE | PENDING_PROFESSIONAL_REVIEW`
- `strengthProblem`/`balanceProblem`은 boolean 또는 null이며 문자열 union을 사용하지 않음
- 모든 snapshot은 `schemaVersion`과 `revision`을 가지며, update envelope는 `messageId`를 추가해 중복 message/result를 no-op 처리

## 요구사항 추적표

| ID | 요구사항 | 변경 전 근거/차이 | 목표 구현 | 검증 |
|---|---|---|---|---|
| S1-01 | 3문항·낙상 횟수·부상·검사 2종을 하나의 AssessmentSession으로 결합 | Web session은 단일 `finalResult`; Mobile은 개별 MovementHistory만 저장 | canonical session JSON, Web aggregate, Mobile Room 원본 | schema/codec/repository 통합 테스트 |
| S1-02 | URL query가 아닌 영속 상태 | Web screening/live query, Mobile route query에 credential 저장 | Web session snapshot + Mobile Room/DataStore active session | navigation/recreation/reload 테스트 |
| S1-03 | 전체 reload 제거, SPA 유지 | route 화면들이 `window.location.assign()` 사용 | history API 기반 client navigation + popstate render | 화면 이동 중 동일 session/worker ID |
| S1-04 | UI timer는 분석 이벤트만 표시 | Balance/Chair UI timer가 `finishAnalysis`와 이동 호출 | worker event/elapsed/hold 상태만 렌더 | UI clock 만료로 final 미생성 |
| S1-05 | Balance 4단계 동일 worker/session 연속 수행 | 상태기계는 지원하지만 route reload가 worker 파괴 | 단일 Balance attempt/analysis ID와 자동 stage advance | 4단계 event의 ID 동일성 |
| S1-06 | 검사 2종 전 최종 결과/처방 금지 | 단일 검사로 STEADI/findings/Otago 생성 | aggregate gate에서만 scorer/prescriber 호출 | Chair-only/Balance-only 차단 |
| S1-07 | §5.3 결정표 그대로 구현 | 기능 이상 신호 개수로 risk 계산 | 하나의 pure `scoreSteadiAssessmentSession` | 8×4×4 = 128 결정표 |
| S1-08 | 누락 입력 NOT_SCORABLE | legacy scorer는 incomplete인데 LOW/MODERATE 반환 가능 | strict completeness validation + reason codes | 각 필드/검사/age/sex 누락 |
| S1-09 | 중단·재시도 상태 보호 | reset/cleanup이 완료 결과까지 잃을 수 있음 | attempt supersession, completed slot 보존 | retry/stale final 테스트 |
| S1-10 | 새로고침·연결 복구 | dashboard reconnect/checkpoint 없음; Mobile process 복구 없음 | revision snapshot sync, reconnect/backoff, transient close 보존 | reload/reconnect snapshot 복구 |
| S1-11 | 중복 결과 방지 | Web은 매 POST 새 ID, Mobile fallback ID가 시각 기반 | deterministic result key, messageId/revision dedup, DB uniqueness | HTTP+WS/동일 final 중복 수신 |
| S1-12 | API·JSON·상태 스키마 동시 변경 | final-result-only 계약 | Web endpoint/WS, Mobile DTO/Room, 문서 동일 version | contract fixture 양쪽 파싱 |

## §5.3 기대 결정

1. 필수 입력 완전성 실패 → `NOT_SCORABLE`
2. `!step1AtRisk || !step2Problem` → `LOW`
3. Step 1 양성 + Step 2 문제 + (`ZERO` 또는 `ONE` 비손상) → `MODERATE`
4. Step 1 양성 + Step 2 문제 + (손상 낙상 또는 `TWO_OR_MORE`) → `HIGH`

기획서 §5.1은 Q1이 예인 경우에도 fall count `ZERO`를 선택지에 포함한다. 원자료를 임의 정규화하지 않고 Q1과 fall count를 별도 보존한다.

## 기존 변경 및 마이그레이션 제약

- Mobile의 미커밋 `SteplyTlsClientFactory.kt` certificate hostname verifier 변경을 보존한다.
- Mobile의 미커밋 `SteplyWebClient.kt` 7/8/8초 timeout과 `retryOnConnectionFailure(true)`를 보존한다.
- 과거 개별 MovementHistory로 aggregate STEADI를 추론하지 않는다. legacy 행은 읽기 전용이며 새 세션 점수는 `NOT_SCORABLE`이다.
- 새 경로 검증 후 import가 없는 `legacySteadiAdapter.js`는 삭제한다. 아직 다른 기능에서 참조하는 legacy scorer는 이번 단계에서 제거하지 않는다.

## 변경 전 검증 기준선 (2026-07-13)

- Web: `npm run check` 통과
- Web: `npm run build` 통과 (chunk size 경고만 존재)
- Mobile: `bash gradlew testDebugUnitTest assembleDebug` 통과
- Mobile wrapper는 executable bit가 없어 `./gradlew` 대신 `bash gradlew` 사용
