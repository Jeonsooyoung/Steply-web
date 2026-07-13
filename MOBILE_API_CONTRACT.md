# Steply Web ↔ Mobile Assessment Session Contract

이 문서는 Stage 1 임상 판정과 Stage 2 동작 분석을 함께 운반하는 Web·Mobile 공통 계약이다. Mobile이 개인 평가 세션의 영구 원본을 보관하고, Web은 카메라 분석과 세션 중 화면 표시를 담당한다.

## 1. 식별자와 버전

- `connectionSessionId`: QR/HTTPS/WebSocket 연결의 임시 ID
- `assessmentSessionId`: Screening부터 최종 STEADI·처방까지 묶는 영속 평가 ID
- `attemptId`: 기능검사 한 번의 시도 ID
- `analysisSessionId`: worker 상태기계 ID. 4-Stage Balance 네 단계 전체에서 하나만 사용한다.
- `messageId`: 재전송을 멱등 처리하기 위한 메시지 ID
- `revision`: AssessmentSession snapshot의 단조 증가 정수
- canonical schema: `assessment_session.v2`
- snapshot/wire-update/command JSON Schema: `docs/schemas/assessment-session-v2.schema.json`, `docs/schemas/assessment-session-update-v2.schema.json`, `docs/schemas/assessment-session-command-v2.schema.json`
- analysis result schema: `stage2_assessment_result.v1`
- operational config version: `stage2_operational.v1`

기존 `assessment_session.v1` snapshot은 읽기·resume 시 v2로 upcast한다. 과거 accepted result는 `legacy_assessment_result.v1`, `legacyReadOnly: true`로 보존하며 Stage 2 calibration·quality·취약영역 값을 만들어 채우지 않는다. 신규 결과 쓰기는 v2 strict result만 사용한다.

`sessionId`라는 이름을 연결 세션과 평가 세션 양쪽에 재사용하지 않는다. 기존 QR의 `sessionId`는 wire compatibility에서만 `connectionSessionId`로 해석한다.

## 2. QR 연결

```json
{
  "type": "steply-web-session",
  "version": 3,
  "connectionSessionId": "PC_CONNECTION_ID",
  "sessionId": "PC_CONNECTION_ID",
  "assessmentSessionSchemaVersion": "assessment_session.v2",
  "serverUrl": "https://YOUR_PC_IP:3000",
  "serverUrls": ["https://YOUR_PC_IP:3000"],
  "expiresAt": "ISO_8601_UTC_EXPIRY",
  "expiresAtEpochMs": 1783420800000,
  "pairingToken": "BASE64URL_128_BIT_RANDOM_ONE_TIME_TOKEN",
  "tlsCertSha256": "OPTIONAL_LOWERCASE_HEX_SHA256_OF_DER_LEAF_CERT"
}
```

`serverUrl`은 HTTPS여야 한다. 최초 pairing token의 만료와 이미 연결된 AssessmentSession의 resume 권한은 분리한다. QR이 만료됐다는 이유만으로 일시 단절된 기존 평가 세션의 복구를 거부해서는 안 된다.

프로필 연결 endpoint는 유지한다.

```http
POST /api/session/{connectionSessionId}/connect
X-Steply-Pairing-Token: PAIRING_TOKEN
```

```json
{
  "connectionSessionId": "PC_CONNECTION_ID",
  "sessionId": "PC_CONNECTION_ID",
  "pairingToken": "...",
  "dataContract": {
    "schemaVersion": "steply_data_contract.v1",
    "profile": {
      "id": "mobile-profile-id",
      "displayName": "홍길동",
      "birthYear": 1950,
      "sex": "FEMALE"
    },
    "recentAssessments": [
      {
        "assessmentSessionId": "assessment-id",
        "completedAt": 1783420800000,
        "risk": "MODERATE",
        "vulnerabilityIds": ["V6", "V7"],
        "valid": true,
        "chairStandRepetitions": 8,
        "balanceSecondsByStage": {
          "SIDE_BY_SIDE": 10.0,
          "SEMI_TANDEM": 10.0,
          "TANDEM": 6.5,
          "ONE_LEG": 0.0
        }
      }
    ],
    "generatedAt": 1783420800000
  },
  "assessmentSession": null
}
```

`dataContract`는 위 네 top-level 필드만 허용하고 `recentAssessments`는 valid·scored 평가를 오래된 순서부터 최대 5개만 포함한다. Profile은 `id`, `displayName`, `birthYear`, `sex`만 허용한다. `weeklyReport`, safety/fall 기록, agent rationale, raw attempt, landmark, prescription, `profile.updatedAt`은 Mobile 로컬 전용이며 연결 payload에 포함하면 `422 INVALID_STEPLY_DATA_CONTRACT`이다.

## 3. Canonical AssessmentSession

Screening 3문항, 낙상 횟수·손상 여부, 두 기능검사 결과, STEADI 판정, 운동 처방은 반드시 하나의 `AssessmentSession` snapshot으로 교환한다.

상태 어휘:

- session: `IN_PROGRESS | COMPLETED | CANCELLED`
- screening/test slot: `NOT_STARTED | IN_PROGRESS | COMPLETED | NEEDS_RETRY`
- attempt: `IN_PROGRESS | PAUSED | VALID | INVALID | TRACKING_FAILED | CANCELLED | FAILED`
- scoring: `NOT_SCORABLE | SCORED`
- risk: `NOT_SCORABLE | LOW | MODERATE | HIGH`
- prescription: `NOT_GENERATED | BLOCKED | ACTIVE | PENDING_PROFESSIONAL_REVIEW`

`strengthProblem`과 `balanceProblem`은 boolean 또는 `null`이다. boolean 위치에 `NOT_SCORABLE` 문자열을 넣지 않는다.

분석 시작 전에도 다음 운영 context를 snapshot에 저장한다. 이 값은 reload/reconnect 후 worker 입력 복구용이며 임상 판정값이 아니다.

```json
{
  "operationalContext": {
    "operationalConfigVersion": "stage2_operational.v1",
    "supportRoiNormalized": { "x": 0.8, "y": 0.2, "width": 0.18, "height": 0.5 }
  }
}
```

두 기능검사가 모두 `COMPLETED`이고 필수 입력이 완전하기 전에는 다음 상태를 유지한다.

```json
{
  "steadi": {
    "status": "NOT_SCORABLE",
    "riskLevel": "NOT_SCORABLE",
    "strengthProblem": null,
    "balanceProblem": null,
    "step1AtRisk": null,
    "step2Problem": null,
    "reasonCodes": ["MISSING_REQUIRED_ASSESSMENT"],
    "ruleVersion": "steadi_stage1.v1"
  },
  "exercisePrescription": {
    "status": "NOT_GENERATED",
    "plan": null,
    "sessionResults": []
  }
}
```

## 4. Browser API

Web 서버의 저장은 세션 중 임시 mirror다. Mobile snapshot이 최종 원본이다.

```text
POST /api/assessment-sessions
GET  /api/assessment-sessions/{assessmentSessionId}
PUT  /api/assessment-sessions/{assessmentSessionId}/snapshot
POST /api/assessment-sessions/{assessmentSessionId}/events
```

Snapshot PUT 요청은 `messageId`, `baseRevision`, `session`을 포함한다.

```json
{
  "schemaVersion": "assessment_session.v2",
  "messageId": "uuid",
  "baseRevision": 11,
  "session": {
    "assessmentSessionId": "uuid",
    "revision": 12
  }
}
```

처리 규칙:

- 같은 `messageId` 재수신: 기존 성공 응답을 반환하고 상태 변경 없음
- `baseRevision`이 현재 revision과 다름: `409 REVISION_CONFLICT`
- 완료되거나 supersede된 attempt의 늦은 결과: `409 STALE_ATTEMPT`
- 같은 canonical SHA-256 `resultHash` 재수신: `resultId`나 전송 경로와 무관하게 no-op
- 다른 payload가 기존 `resultId`를 재사용: `409 RESULT_CONFLICT`
- `FRAME_RESULT`, Demo/Fallback/Manual 결과는 accepted result가 될 수 없음

응답은 항상 최신 canonical snapshot을 포함한다.

## 5. WebSocket update와 복구

카메라 연결:

```text
wss://PC_IP:3000/ws?sessionId=CONNECTION_SESSION_ID&role=mobile
```

Mobile은 연결 직후 마지막 영속 상태를 알린다.

```json
{
  "type": "assessment-session.resume",
  "schemaVersion": "assessment_session.v2",
  "messageId": "uuid",
  "assessmentSessionId": "uuid",
  "knownRevision": 11,
  "session": null
}
```

양쪽 revision이 같으면 ack만 반환한다. Mobile revision이 더 최신이거나 PC가 세션을 모르면 Mobile이 전체 `session` snapshot을 다시 보낸다. PC가 더 최신이면 다음 update로 snapshot을 반환한다.

```json
{
  "type": "assessment-session.updated",
  "schemaVersion": "assessment_session.v2",
  "messageId": "uuid",
  "assessmentSessionId": "uuid",
  "baseRevision": 11,
  "revision": 12,
  "session": {}
}
```

수신자는 영속 저장을 완료한 뒤 ack한다.

```json
{
  "type": "assessment-session.ack",
  "schemaVersion": "assessment_session.v2",
  "messageId": "uuid",
  "assessmentSessionId": "uuid",
  "revision": 12
}
```

일시적인 WebSocket close는 평가 종료나 cleanup으로 해석하지 않는다. 진행 중 분석은 유효시간 증가를 멈추고 `PAUSED` 또는 `NEEDS_RETRY`로 전이한다. 이미 완료된 Screening과 다른 기능검사 결과는 보존한다.

## 6. 기능검사 결과와 Balance 연속성

- 기능검사별 결과는 해당 test slot에 먼저 병합한다.
- invalid/cancelled/failed attempt는 이력에 남기되 `acceptedResult`가 될 수 없다.
- retry는 새 `attemptId`를 사용하고 `supersedesAttemptId`를 기록한다.
- 4-Stage Balance의 네 자세는 동일 `attemptId`와 `analysisSessionId`를 사용한다.
- UI timer는 worker event를 표시만 한다. UI timer 만료 메시지는 accepted result를 생성하지 못한다.
- 두 test slot이 모두 완료되기 전에는 최종 STEADI 결과와 처방을 생성하거나 Mobile MovementHistory에 추가하지 않는다.

### Stage 2 result

공통 필드는 `resultId`, `resultHash`, `attemptId`, `analysisSessionId`, `assessmentType`, `status`, `source`, `completedAt`, `operationalConfigVersion`, `calibration`, `quality`, `vulnerabilityAssessment`다. 임의 원본 `payload`를 canonical accepted result 안에 저장하지 않는다.

- calibration 공통 필수: `sampledDurationMs >= 3000`, `lFootM`, `hStandM`, `wShoulderM`
- Chair 추가 필수: `hSitM`, `dFoldM`; Balance에서는 두 값이 `null`일 수 있음
- support ROI는 normalized image 좌표이며 `null`일 수 있음
- quality `gates`는 G1→G5 순서의 정확히 5개 `{gate, violationFrameCount, violationDurationMs, violationRatio}`
- quality는 `g3ViolationRatio`, `invalidReasons`, `excludeFromTrends`를 포함한다. `g3ViolationRatio == 0.20`은 경계상 유효할 수 있지만 `> 0.20`은 반드시 `INVALID` 또는 `TRACKING_FAILED`, `excludeFromTrends: true`, `G3_VIOLATION_RATIO_EXCEEDED` 사유를 사용한다.
- Chair는 `observedRepetitions`, `completedRepetitions`, `finalRepetitionCredit(0|1)`, `finalState`, `armUse`, `cdcScoredRepetitions`를 포함
- Chair 팔 사용 1차 결과는 `occurrenceCount: 1`, `restartUsed: true`, `outcome: RESTART_REQUIRED`인 invalid attempt로 보존한다. 재시작 후 2차 발생은 `occurrenceCount: 2`, `outcome: DISQUALIFIED`, `cdcScoredRepetitions: 0`인 valid 결과이며 `vulnerabilityAssessment.activeIds`에 `V6`가 필수다.
- Balance는 정확히 `SIDE_BY_SIDE → SEMI_TANDEM → TANDEM → ONE_LEG` 순서의 stage 4개를 포함한다. 각 stage는 자기 onset, hold, status와 자기 sway 값을 독립 보존하며 마지막 단계의 sway를 다른 단계에 복제하지 않는다.
- Balance 실패 식별자는 `failureCode: F1|F2|F3|F4|F5|null`로 고정한다. 구현 상세 원인은 별도 `failureReason: string|null`에 기록한다. 예: `{ "failureCode": "F2", "failureReason": "POSITION_LOST" }`.
- `vulnerabilityAssessment`는 core의 결정론적 V1–V9 결과를 운반한다. 서버는 운영 임계값으로 이를 새로 추론하지 않고 accepted result들의 ID/evidence만 병합한다.

Canonical v2 객체는 모든 중첩 단계에서 strict하다. 정의되지 않은 필드는 Web runtime과 Mobile decoder가 모두 거부하며, 알 수 없는 필드를 조용히 제거한 뒤 저장하지 않는다.

`VALID`만 slot의 `acceptedResult`가 된다. `INVALID`·`TRACKING_FAILED`는 해당 attempt의 `result`에 원자료를 보존하고 `quality.excludeFromTrends == true`, slot `NEEDS_RETRY`로 처리한다.

### Stage 3 prescription and exercise result

Stage 3 처방은 `otago_prescription.v1`, 운동 결과는 `exercise_session_result.v1`로 고정한다. 알 수 없는 ID·필드·enum은 Web과 Mobile 모두 거부한다.

- 카탈로그 ID: 준비운동 `W1..W5`, 근력 `S1..S5`, 균형 `B1..B12`, 걷기 `WALK`
- category: `WARMUP | STRENGTH | BALANCE | WALKING`
- support: `NONE | STABLE_SUPPORT | ONE_HAND | TWO_HAND | WALKING_AID`
- weight: `NONE | ANKLE_CUFF | FATIGUE_TARGET`
- camera: `FULL | PARTIAL | MANUAL_ONLY`
- plan status: `BLOCKED | ACTIVE | PENDING_PROFESSIONAL_REVIEW`

처방 plan 필수 필드는 `schemaVersion`, `catalogVersion`, `planId`, `userId`, `riskLevel`, `status`, `vulnerabilityIds`, `warmups`, `selectedExercises`, `walkingPlan`, `professionalApproval`, `supervisionRequirement`, `caregiverRecommendedDays`, `requiresProfessionalReview`, `safetyNotices`, `progressionProposals`, `generatedByRuleVersion`, `sourceAssessmentIds`, `sourceResultIds`, `decisionTrace`다.

`warmups`는 W1→W5 순서의 정확히 5개다. `selectedExercises`에는 임의 개수 상한을 두지 않으며 V1~V9 매핑의 합집합을 중복 제거해 보존한다. 각 항목은 `exerciseId`, `displayName`, `category`, `level`, `variantId`, 반복·세트·편측 반복·걸음·유지시간, 지지·무게·속도·호흡·휴식·카메라 검증·원인 V ID를 모두 데이터로 운반한다.

HIGH plan은 전문가 승인 전 `PENDING_PROFESSIONAL_REVIEW`이며 앱에서 실행할 수 없다. 다만 승인 전후 비교와 결정 추적을 위해 Level A 중심의 제한된 제안 목록은 plan 안에 보존한다. 전문 승인 후 동일 목록만 `ACTIVE`가 되며, 균형은 Level A, S1~S3은 Level A·무게 없음, S4~S5는 지지 Level C·무게 없음 범위를 넘을 수 없다. HIGH에는 걷기 계획을 생성하지 않는다.

운동 결과는 다음 필드를 모두 포함한다.

```json
{
  "schemaVersion": "exercise_session_result.v1",
  "resultId": "exercise-result-id",
  "exerciseSessionId": "exercise-session-id",
  "planId": "exercise-plan-id",
  "exerciseId": "B5",
  "level": "A",
  "variantId": "B5-A",
  "status": "COMPLETED",
  "source": "LIVE_POSE",
  "startedAt": 1700000000000,
  "completedAt": 1700000010000,
  "prescribedDosage": { "repetitions": null, "sets": 1, "repetitionsPerSide": null, "steps": null, "holdSeconds": 10 },
  "completedDosage": { "repetitions": null, "sets": 1, "repetitionsPerSide": null, "steps": null, "holdSeconds": 10 },
  "formAccurate": true,
  "lowerBodyRecoveryWithoutGripping": true,
  "supportUsed": false,
  "cameraVerification": "FULL",
  "safetyEvents": []
}
```

`FULL`은 `LIVE_POSE`, 그 외 검증 방식은 `USER_CONFIRMED` source를 사용한다. 결과는 `exercisePrescription.sessionResults`에 append하며 `resultId`와 `exerciseSessionId` 중복을 허용하지 않는다.

진행 제안은 같은 plan·운동·level·variant에서 정확한 수행을 완료한 최근 연속 2개의 서로 다른 `exerciseSessionId`만 근거로 한다. 제안은 `PENDING_APPROVAL`로 저장하고 자동 적용하지 않는다. 사용자 또는 보호자·담당자 한 명이 명시적으로 승인하면 `APPROVED`, 실제 처방에 반영된 뒤 `APPLIED`가 된다.

Stage 3 command event:

- `PROFESSIONAL_APPROVAL_RECORDED { professionalApproval }`
- `PROGRESSION_PROPOSED { proposal }`
- `PROGRESSION_APPROVAL_RECORDED { proposalId, approval }`
- `EXERCISE_SESSION_RESULT_RECORDED { result }`

`approval.actor`는 `USER | CAREGIVER_OR_RESPONSIBLE`만 허용한다. HIGH의 무지지 진행은 별도의 전문가 재평가 없이는 제안할 수 없다.

## 7. 최종 결과 저장

Mobile은 개별 검사 `final`을 별개의 최종 이력으로 저장하지 않는다. `AssessmentSession.status == COMPLETED`인 canonical snapshot을 `assessmentSessionId` 기준으로 upsert한다.

최소 DB 고유성:

```text
PRIMARY KEY assessmentSessionId
UNIQUE (assessmentSessionId, attemptId)
UNIQUE resultId
UNIQUE messageId
```

HTTP 응답과 WebSocket 재전송으로 같은 완료 snapshot을 두 번 받아도 최종 이력은 한 개여야 한다.

기존 version 2 `type: final` 개별 결과는 legacy 이력 표시용으로만 유지한다. Screening과 짝 검사 데이터가 없는 과거 결과에서 STEADI 위험도나 처방을 새로 추론하지 않는다.

## 8. Cleanup

```http
POST /api/session/{connectionSessionId}/cleanup
X-Steply-Pairing-Token: PAIRING_TOKEN
```

Cleanup은 PC의 프레임·프로필 mirror·socket 자료만 삭제한다. Mobile의 영속 AssessmentSession을 삭제하거나 완료된 기능검사를 되돌리지 않는다. 진행 snapshot의 ack가 완료되기 전에 cleanup을 성공 처리해서는 안 된다.

## 9. 합동 검증

1. Screening 중 페이지 이동과 reload 후 응답이 유지된다.
2. Balance 네 단계가 동일 `analysisSessionId`로 기록된다.
3. 한 기능검사만 완료하면 `NOT_SCORABLE`이고 처방은 `NOT_GENERATED`다.
4. 두 기능검사 완료 시 §5.3 결과와 처방이 정확히 한 번 생성된다.
5. 연결 단절·복구 중 revision이 보존되고 중단 시간이 검사 유효시간에 포함되지 않는다.
6. 동일 final을 HTTP와 WebSocket으로 각각 보내도 Mobile 이력은 한 개다.
7. stale retry 결과가 accepted result를 덮어쓰지 않는다.
8. PC cleanup 이후에도 Mobile AssessmentSession은 남는다.

## 10. Stage 4 Care Agent 계약

Care Agent의 실행과 영속 원본은 Mobile이다. Agent 상태·event dedup·action receipt·decision log는 Room에 저장하고, Web은 agent를 실행하거나 장기 상태를 보관하지 않는다. Web은 큰 화면 표시를 위해 Mobile이 보낸 최소 projection만 연결 세션 메모리에 보관한다.

공용 버전과 strict JSON Schema:

- state: `care_agent_state.v1` / `docs/schemas/care-agent-state-v1.schema.json`
- event: `care_agent_event.v1` / `docs/schemas/care-agent-event-v1.schema.json`
- action candidate: `care_agent_action.v1` / `docs/schemas/care-agent-action-v1.schema.json`
- decision: `care_agent_decision.v1` / `docs/schemas/care-agent-decision-v1.schema.json`
- tool execution result: `care_agent_tool_result.v1` / `docs/schemas/care-agent-tool-result-v1.schema.json`
- Web projection: `care_agent_projection.v1` / `docs/schemas/care-agent-projection-v1.schema.json`
- projection update: `docs/schemas/care-agent-update-v1.schema.json`

결정 우선순위 wire 값은 다음 순서로 고정한다.

```text
safety_event → fall_reported → high_or_v6_v7 → declining_trend
→ reassessment_due → low_adherence → progression_available → maintenance
```

Agent state는 최신 상태와 `latestDecisionId`만 보관한다. 모든 decision, event receipt, action idempotency receipt와 tool result는 별도 Room table에 저장하며 state JSON에 무제한 배열로 중첩하지 않는다. 임상 참조는 AssessmentSession revision, STEADI rule version, V rule version, prescription plan ID와 전문 승인 ID를 가리키며 agent가 위험도·V1~V9·처방을 다시 쓰지 않는다. `recentAssessments`는 valid 평가만 최근 5개까지 운반한다. invalid 원자료는 Room에 남기고 agent input에는 `invalidAttemptNumerator`, `invalidAttemptDenominator`, `invalidAttemptRatio`를 함께 저장하며 ratio는 분자/분모 계산값과 정확히 일치해야 한다. `nextPlannedSessionAt`은 nullable 운영 상태로 운반한다.

운영 임계값의 runtime 단일 소스는 Mobile `CareAgentConfigV1`이다. Web의 shared 계약 JSON에는 schema version, enum, loop phase, decision priority만 존재하며 재평가 간격·순응도·재시도 같은 수치를 중복 정의하지 않는다.

Web projection API:

```text
GET /api/session/{connectionSessionId}/care-agent-projection
PUT /api/session/{connectionSessionId}/care-agent-projection
```

PUT envelope:

```json
{
  "type": "care-agent.updated",
  "schemaVersion": "care_agent_state.v1",
  "messageId": "uuid",
  "profileId": "mobile-profile-id",
  "baseStateVersion": 7,
  "stateVersion": 8,
  "projection": {
    "schemaVersion": "care_agent_projection.v1",
    "profileId": "mobile-profile-id",
    "stateVersion": 8,
    "currentSessionPlan": { "mode": "standard", "planId": "plan-id" },
    "nextReassessmentAt": 1800000000000,
    "latestDecision": null,
    "updatedAt": 1799999999000
  }
}
```

같은 `messageId`는 no-op, 다른 `baseStateVersion`은 `409 REVISION_CONFLICT`, 연결 profile과 다른 `profileId`는 `403 PROFILE_BINDING_MISMATCH`, unknown field는 `422`다. Web은 full Room state나 decision log를 받지 않는다. 명시적 session cleanup 시 projection과 message ID set도 함께 제거한다.

WebSocket은 `care-agent.resume`, `care-agent.updated`, `care-agent.projection`, `care-agent.ack`, `care-agent.error`를 사용하며 HTTP와 같은 version·profile·dedup 규칙을 적용한다. Web UI는 projection이 없으면 agent 행동을 만들어 표시하지 않는다.
