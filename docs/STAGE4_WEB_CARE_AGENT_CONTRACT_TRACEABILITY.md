# Stage 4 Web / Shared Care Agent Traceability

기준 문서: 제품 기획 §9~§10, §11.3. Mobile이 agent 실행·Room 영속의 원본이고 Web은 분석·표시 및 연결 세션 중 projection mirror만 담당한다.

| ID | 요구사항 | 구현 |
| --- | --- | --- |
| S4-ARCH-01 | Agent는 Mobile에서 실행 | `useSteplyDashboard`의 memory agent import·실행 제거. Web은 Mobile projection만 소비 |
| S4-LOOP-01 | 8단계 폐쇄 루프 | shared contract가 8단계 순서와 decision completedStages를 strict 검증 |
| S4-STATE-01 | 프로필·최근 valid 5회·추세·V·순응도·안전·낙상·invalid 분자/분모/비율·승인·다음 세션 | `care-agent-state-v1` input과 immutable clinical reference |
| S4-PRIORITY-01 | 전체 결정 트리 우선순위 | `stage4CareAgent.contract.json`의 ordered `decisionPriority` |
| S4-BOUNDARY-01 | 임상 결과·처방은 deterministic tool 소유 | state는 AssessmentSession/rule/plan/approval ID를 참조하고 action payload는 운영 필드만 허용 |
| S4-TOOLS-01 | 실제 Android scheduler/notifier/report/progress | shared tool ID 4종 고정. 실행은 Mobile repository/WorkManager 구현 소유 |
| S4-LOG-01 | 후보·거부·guardrail·실행 결과 기록 | action/decision/tool-result 별도 strict schema. state에는 log 배열을 중첩하지 않음 |
| S4-DEDUP-01 | event/action 중복 방지 | event ID와 action idempotency key 계약. Web update도 message ID no-op |
| S4-FALLBACK-01 | 실패 시 임상 상태 불변 | tool result status/receipt 계약, 임상 reference와 action 분리 |
| S4-LLM-01 | 승인된 표현·순서만 선택 | projection은 Mobile이 승인한 selectedActions와 검수 message template ID만 수용 |
| S4-WEB-01 | Web은 ephemeral projection만 저장 | strict PUT/GET API, WS resume/update/ack, profile binding, cleanup |
| S4-NO-FAKE-01 | URL/demo agent 상태 금지 | Step 8 `?agent=`와 하드코딩 행동 fallback 제거 |

운영 임계값은 Web에 중복하지 않는다. Mobile `CareAgentConfigV1`이 runtime 단일 소스이며 Web shared JSON은 wire version·enum·순서만 가진다. 최근 평가 최대 5개는 §10의 JSON schema invariant다.

검증 명령:

```bash
npm run stage4:contract:check
```

이 검사는 strict CJS round-trip, unknown field 거부, Kotlin wire enum/version 일치, HTTP revision/dedup/profile binding, cleanup, Web production agent import 부재와 URL/demo fallback 제거를 확인한다.
