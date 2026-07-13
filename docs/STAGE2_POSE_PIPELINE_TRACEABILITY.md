# Stage 2 Pose Pipeline Traceability

기준 문서: Steply 기획 문서 §6.1–§7.3. Web과 Mobile을 하나의 제품으로 추적하며, 이 표가 Stage 2 수정의 선행 기준이다.

## 규칙 경계

임상 규칙(`clinical`)은 Stage 1의 결정론적 순수 함수에만 둔다.

- CDC Chair Stand 연령·성별 below-average 기준
- Tandem `< 10.0s`의 balance problem
- 팔 사용 2차 발생 시 CDC 공식 Chair Stand 점수 0
- §5.3 STEADI와 §7.3 V1–V9 취약 영역 매핑

시스템 운영 정의(`operational`)는 자세 인식과 측정에만 사용한다. 임상 위험도를 직접 만들지 않는다.

- 30fps, visibility 보간, One-Euro, 각도·각속도 윈도우
- 3초 캘리브레이션과 world 좌표 기준값
- G1–G5, 0.5초 pause, 품질 위반 비율 20%
- Chair 각도·높이·히스테리시스와 Balance 자세·onset·F1–F5
- RMS sway와 비율은 관찰값이며 단독 임상 컷오프가 아니다.

동일한 숫자 10초라도 Balance protocol hold 상한은 operational이고 STEADI Tandem 판정은 clinical이다. 서로 다른 config key와 rule version을 사용한다.

## 계약 버전 결정

- 신규 snapshot: `assessment_session.v2`
- 기존 Room/Web snapshot: `assessment_session.v1` read-only decode 후 v2로 upcast
- 임상 판정: `steadi_stage1.v1` 유지
- 운영 분석: `stage2_operational.v1`
- accepted/invalid 결과는 type-specific strict JSON으로 교환하며 임의 `payload`를 canonical 결과로 저장하지 않는다.
- invalid attempt는 보존하지만 accepted result와 추이에는 포함하지 않는다.

### v2 strict contract 구현

- 순수 정규화·canonical hash: `shared/stage2Contract.cjs`
- session reducer/v1 upcast: `shared/stage1Assessment.cjs`
- server receipt/dedup/conflict: `src/services/assessmentSessionService.js`
- invalid raw-result 보존과 trend 제외: `src/services/assessmentResultPersistence.js`
- snapshot/wire-update/command schemas: `docs/schemas/assessment-session-v2.schema.json`, `docs/schemas/assessment-session-update-v2.schema.json`, `docs/schemas/assessment-session-command-v2.schema.json`
- requirement-ID 검사: `scripts/check-stage2-contract.mjs`

`operationalContext`는 결과 생성 전 snapshot에 저장한다. `operationalConfigVersion`과 normalized support ROI가 reload/reconnect를 통과하며, 측정 calibration은 각 result에 남는다. Balance가 Chair보다 먼저 수행될 수 있으므로 Balance calibration의 `hSitM`, `dFoldM`은 null을 허용하고, Chair result에서는 두 값을 필수로 한다.

`quality.gates`는 G1부터 G5까지 순서가 고정된 5개 집계 배열이다. invalid 결과는 attempt의 `result`에만 저장하고 slot `acceptedResult`에는 넣지 않는다. `resultHash`는 canonical JSON의 SHA-256이며 같은 내용 재전송은 no-op, 같은 `resultId`의 다른 내용은 `RESULT_CONFLICT`다.

## 요구사항 추적표

| ID | 요구사항 | 변경 전 차이 | 목표 구현 | 검증 |
|---|---|---|---|---|
| S2-COORD-01 | 각도·ML/AP/V는 world, 화면·ROI는 normalized | Chair/Balance/calibration이 normalized x/y 사용 | 좌표 accessor 분리와 world 필수 gate | normalized 왜곡에도 world 측정 불변 |
| S2-SIGNAL-01 | 30fps | 분석 15fps, worker 66ms 중복 | 중앙 config 30fps/33ms, Mobile 30fps 송출 | cadence와 frame metadata |
| S2-SIGNAL-02 | visibility `<0.5`, 최대 3프레임 선형 보간 | 0.38, 이전값 유지, 검사별 2/3 | delayed linear interpolation, 4번째 결측 거부 | 0.499/0.5, 3/4프레임 경계 |
| S2-SIGNAL-03 | One-Euro 1.0/.007/1.0 | EMA만 존재 | world 좌표 One-Euro 순수 filter | 고정/step/rate 테스트 |
| S2-SIGNAL-04 | 각도 5프레임 평균, 중앙차분 각속도 후 5프레임 평균 | 현재 각도·forward difference | 단일 signal processor | 대칭 시계열 exact 결과 |
| S2-CAL-01 | 3초 중립 기립 캘리브레이션 | 2초 standing, 1초 sit/foot | 연속 3000ms valid window | 2999/3000ms |
| S2-CAL-02 | L_foot/H_stand/H_sit/W_shoulder/D_fold | normalized 값, D_fold 없음 | world 3D/ML/V 기준 5값과 normalized support ROI | profile/JSON/Room roundtrip |
| S2-Q-G1 | 핵심 23–32 visibility ≥0.7 | 평균 .55 | 전 landmark exact gate | .699/.7 |
| S2-Q-G2 | normalized x/y [0.02,0.98] | .015/.985 일부 발 | 핵심 landmark 전원 frame gate | .019/.02/.98/.981 |
| S2-Q-G3 | G1/G2 0.5초 지속 시 pause | 250/750/3000ms 혼재 | 500ms 연속 위반부터 PAUSED | 499/500ms |
| S2-Q-G3R | 전체 위반 `>20%` invalid | 35% | strict `>0.20`, invalid 저장·추이 제외 | 20.000/20.001% |
| S2-Q-G4 | 어깨 ML ≥0.7×W_shoulder | image view heuristic | world ML/reference 비교 | .699/.7 ratio |
| S2-Q-G5 | 평균 휘도 40–220 | 약 41–235, inline .92 | byte-scale 중앙 config | 39/40/220/221 |
| S2-CHAIR-01 | SIT/RISING/STAND/DESCENDING | progress 및 128/148/145 | knee 100/165, hip 160, H 5%/95%, velocity sign | 상태·5° hysteresis table |
| S2-CHAIR-02 | 완전 STAND 경유 후 SIT count | 구현됨 | world/smoothed signal로 유지 | 불완전 cycle 제외 |
| S2-CHAIR-03 | 종료 시 절반 이상이면 +1 | 0.5 credit, STAND 제외 | RISING/STAND + midpoint에서 integer +1 | 29.999/30s final state |
| S2-CHAIR-04 | 팔 사용 1차 재시작, 2차 CDC 0/V6 | 첫 confirmed 즉시 invalid, retry 횟수 비영속 | attempt에 occurrence/restart 저장, 2차 accepted score 0 | first retry/second V6/dedup |
| S2-BAL-01 | world ML–AP 발 기하 exact 조건 | image score heuristic | AP_off/ML_gap/HT_dist/LIFT exact predicates | 각 단계 경계 |
| S2-BAL-02 | onset 0.5초, 진입 10초 timeout | 650ms, timeout 없음 | 500ms dwell, 10s unable result 후 종료 | 499/500ms, 9999/10000ms |
| S2-BAL-F1 | 발 이동 >0.30 Lfoot 0.2초 | .55/450ms | world ML/AP displacement | distance/dwell 경계 |
| S2-BAL-F2 | 자세 조건 0.2초 불충족 | score loss 550ms | exact predicate 200ms | F2 경계 |
| S2-BAL-F3 | one-leg LIFT <0.15 | 약 .341/350ms | world V 즉시 종료 | .149/.15 |
| S2-BAL-F4 | support ROI 0.2초 | state만 일부, production 미연결 | calibration normalized ROI를 worker/machine에 연결 | ROI in/out, 199/200ms |
| S2-BAL-F5 | 제2 인물 wrist→사용자 torso ROI | numPoses=1, 명시적 unsupported | numPoses=2, 두 pose landmark 구조와 F5 event | user/helper 분리·ROI 진입 |
| S2-BAL-SWAY | ML/AP RMS, 초기/정적, 두 비율 보존 | path length만 계산 후 결과에서 폐기 | stage별 world pelvis samples와 RMS 결과 | exact RMS/ratio, Mobile roundtrip |
| S2-CONTRACT-01 | API·JSON·상태 동시 변경 | acceptedResult arbitrary payload, Mobile 필드 유실 | strict v2 result/calibration/quality/measurement/vulnerability schema | Web fixture→Mobile decode→Room→resume |
| S2-CONTRACT-02 | invalid 저장, 추이 제외, dedup | invalid POST 거부 | attempt result + canonical hash receipt | duplicate/conflict/excludeFromTrends |
| S2-CONFIG-01 | 모든 Stage 2 임계값 한 곳 | config 5개와 worker/legacy 중복 | `shared/stage2Analysis.config.json` 단일 값 원본, client config는 re-export만 | analyzer/contract 동일 값 검사 |

## 변경 전 검증 기준선 (2026-07-13)

- Stage 1 종료 시 Web `npm run check`, `npm run build` 통과
- Stage 1 종료 시 Mobile unit 17개, assemble, lint, AndroidTest APK 컴파일 통과
- 기존 단말 instrumentation 및 실제 LAN E2E는 실행 환경 부재로 미실행

## 완료 결과 (2026-07-13)

- S2-COORD-01부터 S2-CONFIG-01까지 새 structured worker/analyzer 경로에 반영했다.
- §6–§7의 자세 인식 임계값은 `shared/stage2Analysis.config.json`을 유일한 제품 값 원본으로 사용하고, client의 `stage2Analysis.config.js`와 개별 config 파일은 이름 호환 adapter로만 유지한다.
- Web producer 결과를 strict v2 contract로 정규화하는 통합 검사와 Mobile JSON/Room roundtrip 검사를 추가했다.
- requirement ID 경계 검사는 `check-stage2-requirements.mjs`, state-machine 검사는 Chair/Balance structured check, 실제 producer와 strict 계약 연결은 `check-stage2-product-integration.mjs`에서 수행한다.
- replay 8건의 count/stage/failure 분류가 통과해 새 경로가 기존 pipeline을 대체할 수 있음을 확인했다.
- production import가 없던 `chairStandAnalyzer.js`, `fourStageBalanceAnalyzer.js`, 해당 analyzer 전용 log/check 스크립트와 `legacySteadiAdapter.js`를 삭제했다.

### 남은 검증 범위

- MediaPipe world landmark 좌표계는 골반 중심 원점을 사용하므로 장비·카메라별 절대 높이 해석은 실기 캘리브레이션에서 재확인해야 한다. 저장 계약은 기획서대로 `H_stand`, `H_sit`, `D_fold`를 보존한다.
- 실제 Android 단말의 카메라 30fps 지속성, 복수 인물 F5, 사용자 지정 지지물 ROI는 instrumentation APK까지 컴파일했으며 단말 기반 현장 검증은 별도다.
