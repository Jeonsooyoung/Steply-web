# Stage 3 Fuzzy-TOPSIS Prescription Traceability

기준 문서: Steply 기획 문서 §7.3, §8. Web과 Mobile을 하나의 제품으로 추적한다. 이 문서는 Stage 3 수정 전에 작성한 기준선이며, 구현 완료 시 각 검증 결과를 갱신한다.

## 규칙 경계

임상 위험도(`clinical risk`)는 Stage 1 STEADI 순수 함수만 결정한다.

- Step 1 3문항
- CDC 연령·성별 Chair Stand 기준과 팔 사용 CDC 0점
- Tandem hold `< 10.0s`
- 지난 1년 낙상 횟수와 손상 낙상

처방 엔진(`Fuzzy-TOPSIS prescription`)은 위험도를 다시 계산하지 않는다. 기능–운동 연결표가 후보 운동과 시작 variant를 제공하고, 확정된 위험도는 안전 상한과 감독 조건을 적용하며, Fuzzy-TOPSIS가 허용된 후보의 우선순위를 계산한다.

- V1–V9에서 운동 ID 합집합과 가장 보수적인 레벨 선택
- Otago 원문 용량, 위험도별 상한, HIGH 전문가 승인
- 정확 수행 연속 2세션 이후 진행 제안과 명시 승인

관찰/운영 지표(`observational/operational`)는 처방 세분화에만 사용한다. sway 비율, 후반 속도 저하, 몸통 기울기, 좌우 비대칭을 STEADI 위험도 입력으로 사용하지 않는다.

## 계약 결정

- Assessment snapshot: `assessment_session.v2` 유지, 내부 prescription을 strict Stage 3 계약으로 교체
- Exercise catalog: `otago_catalog.v1`
- Prescription plan: `otago_prescription.v1`
- Exercise session result: `exercise_session_result.v1`
- Progression proposal: strict `stage3-progression-v1` JSON contract
- 고정 운동 ID: `W1`–`W5`, `S1`–`S5`, `B1`–`B12`, `WALK`
- 승인 actor: 기획서 §8.7에 따라 `USER` 또는 `CAREGIVER_OR_RESPONSIBLE`; HIGH 시작 승인은 별도 `PROFESSIONAL`

## 요구사항 추적표

| ID | 기획 요구사항 | 변경 전 차이 | 목표 구현 | 검증 |
|---|---|---|---|---|
| S3-V1 | tandem `<10` AND 초기/정적 `≥1.5` | 조건은 있으나 이름·처방 연결 없음 | 발목 전략·발목 고유수용성감각 저하 | 경계 table |
| S3-V2 | tandem 또는 semi `<10` AND ML/AP `≥1.3` | 조건은 있으나 처방 연결 없음 | 고관절 외전근(중둔근) 저하 | 경계 table |
| S3-V3 | Chair count `< CDC` | 선계산 boolean만 사용 | 하지 근력·근지구력 저하 evidence 보존 | CDC 경계 table |
| S3-V4 | V3 AND slowdown `≥0.20` | 처방 연결 없음 | 하지 근지구력 우세 저하 | `.199/.20` |
| S3-V5 | V3 AND trunk lean `≥30°` | 처방 연결 없음 | 고관절 신전근 우세 저하 | `29.9/30` |
| S3-V6 | 2차 ARM_USE, CDC 0 | 최저 레벨·상담 강제 없음 | 독립 sit-to-stand 수행 불가 | CDC0/V6 invariant |
| S3-V7 | side 또는 semi `<10` | 구 finding으로만 처리 | 기본 정적 균형 저하 | 단계 table |
| S3-V8 | one-leg만 `<10`, 나머지 통과 | 구 finding으로만 처리 | 고난도 정적 균형 과제 저하 | 조합 table |
| S3-V9 | asymmetry `≥0.15`, 3회 이상 | 처방 연결 없음 | 좌우 사용 패턴 불균형 | ratio/count table |
| S3-RISK-AUX-01 | 보조지표 위험도 제외 | canonical scorer는 준수, 구 경로 병존 | 동일 임상 입력에 관찰값 변화 시 risk 불변 | metamorphic table |
| S3-CAT-W | 준비운동 W1–W5 | 없음 | 5종 이름·반복·방향 | exact ID/value table |
| S3-CAT-S | 근력 S1–S5 | 5종 의미만 일부, ID·용량 불일치 | 원문 반복·세트·지지·weight·tempo·호흡·휴식 | exact catalog table |
| S3-CAT-B | 균형 B1–B12 | B1/B5/B7/B11 상당 4종만 존재 | A–D 모든 variant와 이동/제자리 camera mode | exact level table |
| S3-CAT-WALK | 최대 30분, 10분×3, 주 2회 | 없음 | 평소 속도·근력/균형 병행 조건 포함 | exact plan table |
| S3-MAP-01 | V1–V9 exact 매핑 | FunctionalFinding 기반 별도 매핑 | §8.5 합집합·dedupe·가장 보수적 레벨 | V별 table |
| S3-CAP-LOW | Balance B, strength fatigue weight | 표준/무지지 혼용, weight 없음 | Level B 상한·8–10회 피로 무게 | risk table |
| S3-CAP-MOD | Balance A, 1–2kg, 첫 2주 caregiver | 일부 지지만 구현 | 전 balance A·1–2kg·14일 감독 권장 | risk table |
| S3-CAP-HIGH | 승인 전 차단, 승인 후 A·무게 없음 | 영구 차단만 존재 | professional approval 전 pending, 후 A 범위만 active | approval table |
| S3-PROG-S | 10×2 정확 수행, 연속 2세션 | 임의 accuracy `.75/.90` 및 집계 숫자 신뢰 | 실제 distinct session evidence 검증 | sequence table |
| S3-PROG-B | 하체 전략 회복 + 연속 2세션 | 미구현 | 손으로 붙잡지 않은 회복 evidence 필수 | sequence table |
| S3-PROG-APPROVAL | 제안 후 사용자/보호자 승인 | boolean 표시만 존재 | proposal과 apply 분리, actor/time 저장 | approval table |
| S3-COUNT-01 | 운동 3개 임의 제한 금지 | engine/agent/UI에서 3개 제한 | V 매핑 전체 합집합 보존 | multi-V union |
| S3-CONTRACT-01 | 공용 ID·결과 schema | plan이 arbitrary object | Web runtime/JSON schema와 Mobile typed codec 동시 변경 | cross-platform fixture |
| S3-CONTRACT-HIGH-01 | HIGH 걷기 계획 제외 | Web은 `null`, Mobile은 ACTIVE/PENDING에 걷기를 필수로 요구 | 승인 전·후 모두 `walkingPlan=null`; 승인 전 실행 차단 | Web plan을 Mobile strict codec에 입력 |
| S3-CONTRACT-HIGH-02 | HIGH Otago 시작 상한 | Web은 S4/S5 원문 최저 Level C를 허용, Mobile은 모든 운동 Level A만 허용 | Balance·S1–S3는 A, S4/S5는 지지·무중량 C만 허용 | HIGH S1–S5/Balance table |
| S3-CONTRACT-BLOCKED-01 | BLOCKED 처방은 실행 불가 | Web은 canonical warmup 5종을 보존, Mobile은 warmup 존재 자체를 거부 | W1–W5 계약 shape 보존, selected/walking/progression은 비움, UI 실행 차단 | BLOCKED decode/UI table |
| S3-CONTRACT-VARIANT-01 | 공용 운동 ID·variant 계약 | Web만 catalog variant/level을 검사하고 Mobile은 nonblank 문자열만 검사 | Mobile도 canonical `exerciseId-variantId-level` 조합을 거부/수용 | 비정규 variant table + 실제 Web JSON |
| S3-SCHEMA-RUNTIME-01 | 버전 JSON Schema를 실제 검증 | schema 파일 parse와 노드 존재만 확인 | Draft 2020-12 validator로 LOW/HIGH/BLOCKED accept/reject fixture 실행 | Ajv table |
| S3-UI-01 | canonical 상태만 표시 | URL query scenario와 하드코딩 fallback | snapshot의 typed plan만 표시 | UI integration |
| S3-CLEANUP-01 | 중복 구현 제거 | weakArea/legacy Otago와 새 engine 병존 | 새 경로 검증 후 구 추천 경로 삭제 | production import scan |

## 변경 전 기준선 (2026-07-13)

- Web `npm run otago:engine:check`와 `npm run otago:check`는 통과하지만 불완전한 9종 catalog와 3개 제한을 정상으로 검증한다.
- Mobile은 `AssessmentPrescription(status, planJson)`만 보유하고 임의 JSON object를 수용한다.
- Web `exercisePrescription.plan`도 내부 schema가 없으며 Mobile UI는 Web의 `selectedExercises/exerciseId` shape를 읽지 못한다.
- HIGH는 승인 전 차단만 있고 승인 후 Level A 활성화 경로가 없다.
- 실제 Android 단말 E2E는 이 단계의 변경 전 기준선에 포함하지 않는다.

## 문서 차이 기록 (2026-07-13 계약 정합화)

- §5.3의 HIGH `Level A` 표현보다 §8.3·§8.5·§8.6의 운동별 세부 표를 우선했다. 따라서 Balance와 S1–S3은 Level A·무중량이고, Otago 원문에서 최저 지지 변형이 Level C인 S4/S5는 `STABLE_SUPPORT + Level C + 무중량`으로 유지한다. 임의의 S4-A/S5-A 변형은 만들지 않는다.
- HIGH의 `walkingPlan=null`은 §8에 명시된 Otago 임상 규칙이 아니라, 현재 제품의 전문가 평가 전후 실행 범위를 좁히는 시스템 운영 안전 정책이다. Web·Schema·Mobile은 동일하게 적용하지만 다음 기획 개정에서 정책 근거를 명시해야 한다.
- LOW에서 V1–V9가 하나도 없을 때 targeted plan을 `BLOCKED`로 두는 것은 현재 계약 정책이다. §5.3의 예방적 운동 권장과 정확히 대응하는 기본 운동 세트가 문서에 없으므로 임의 기본 처방을 만들지 않았으며, 이 항목은 기획 결정이 남아 있다.

## 완료 결과 (2026-07-13)

- S3-V1부터 S3-CLEANUP-01까지 canonical Stage 3 경로에 반영했다.
- `shared/stage3ExerciseCatalog.json`이 23개 고정 ID와 모든 variant·용량·지지·weight·tempo·호흡·휴식·camera mode의 단일 값 원본이다.
- `shared/stage3Contract.cjs`와 Web JSON Schema, Mobile typed codec이 동일한 plan/result/progression invariant를 거부 또는 수용한다.
- `AssessmentSession.exercisePrescription`은 strict plan과 `exercise_session_result.v1` 결과를 보존하며, 전문가 승인·진행 제안·진행 승인 command를 reducer가 처리한다.
- HIGH pending plan은 Level A balance, S1–S3 무게 없음, S4–S5 supported C로 제한된 동일 제안을 보존한다. 승인 전 수행 결과는 거부하고 전문 승인 후 내용 변경 없이 ACTIVE로 전환한다.
- S1–S3은 정확한 10회×2세트 연속 2세션 후 0.5–1kg 증량만 제안한다. S4/S5와 balance는 원문 variant 전이 및 하체 전략 회복을 검증한다.
- production import가 없던 구 `careOrchestrationAgent`, `weakAreaRules`, `otagoRecommendations`, `recommendationRules`와 전용 검사를 삭제하고 AR은 canonical exercise ID를 사용한다.

### 최종 검증

- Web 전체 `npm run check`, Stage 3 Draft 2020-12 schema fixture, landmark replay 8/8, production build 통과
- Mobile unit 80건(실패 0, 오류 0, skip 2), `lintDebug` 통과
- 실제 Web HIGH pending/approved·BLOCKED JSON → Mobile strict decoder/repository 계약 통과
- Web/Mobile `git diff --check`, npm audit 취약점 0건 통과

### 남은 현장 검증

- 실제 Android 단말에서 전문가 승인·진행 승인 event 왕복 및 process-death 이후 Room 복원
- `FULL` camera verification 운동의 실제 10회×2세트 장시간 자세 정확성
- 이동 운동의 `USER_CONFIRMED` 완료 UX와 보호자 승인 actor 확인
