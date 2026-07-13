# Stage 4 Mobile Care Agent requirement traceability

This file is the implementation gate for product specification sections 9, 10, 11.3, 12.2, and 13 and the Stage 4 delivery request. Web and Mobile are one product, but the phone is the sole owner of longitudinal care state and agent execution. Web may only validate and render an ephemeral projection during a connected session.

## Document differences and decisions

| ID | Difference | Product decision |
| --- | --- | --- |
| DOC-S4-01 | Section 9.5 names an LLM planner; the Stage 4 request makes an LLM optional and limits it to approved action wording/order. | v1 uses no LLM. Planning is a deterministic state machine. A future presentation-only reorderer must not create actions or write clinical fields. |
| DOC-S4-02 | Section 9.3 describes five coarse phases; the request requires eight phases. | `REASON` maps to `EVALUATE`; `PLAN` expands to `GENERATE_ACTIONS`, `GUARDRAIL`, and `PRIORITIZE`; `PERSIST` becomes explicit. |
| DOC-S4-03 | Three consecutive declines appear as an example, not a clinical cutoff. | Treat three consecutive valid observations as a versioned system-operation threshold, never as a STEADI diagnosis rule. |
| DOC-S4-04 | Low adherence has a three-sessions/week goal and an example of one session for two consecutive weeks, but no clinical cutoff. | Use the example literally as a versioned system-operation intervention threshold. It may trigger reminders only and cannot alter prescription. |
| DOC-S4-05 | Stage 2 `G3 > 20%` invalidates one attempt; longitudinal invalid-attempt intervention has no numeric threshold. | Preserve the per-attempt clinical/measurement rule. Store longitudinal numerator/denominator and do not invent a second clinical threshold. |

## Rule ownership

Clinical rules are immutable inputs to the agent: STEADI risk, CDC cutoffs, V1-V9, Otago exercise content/dose/levels/progression eligibility, safety-stop triggers, the four-week reassessment latest date, and HIGH/V6/V7 escalation minima.

System-operation thresholds are centralized and versioned separately: decision priority, three-observation decline window, two-week adherence window, three sessions/week target, WorkManager uniqueness/retry policy, and projection/log schema versions.

## Requirement trace

| ID | Requirement | Implemented path | Verification |
| --- | --- | --- | --- |
| S4-LOOP-01 | Eight ordered closed-loop phases | Mobile `CareAgentRunner` phase trace | Table/unit test asserts exact order |
| S4-RUN-01 | Agent executes on Mobile | Android runner and worker only; delete Web planner execution | Web integration check and Mobile tests |
| S4-ROOM-01 | State and decisions survive restart in Room | Dedicated state, event, decision, and action-receipt tables | v5 migration and close/reopen tests |
| S4-STATE-01 | Profile and immutable clinical references | `ProgressStore` joins profile and canonical AssessmentSession/plan references | State builder test |
| S4-STATE-02 | Recent five valid results and trend | Per-assessment valid results only; invalid raw attempts retained but excluded | Valid/invalid aggregation test |
| S4-STATE-03 | V1-V9 | Copy canonical mapper output with source assessment/result IDs and hash | Contract and invariant tests |
| S4-STATE-04 | Adherence against three sessions/week | Distinct completed exercise-session IDs, weekly buckets | Adherence aggregation test |
| S4-STATE-05 | Safety events | Append-only typed care events | Persistence/priority tests |
| S4-STATE-06 | Falls after screening | Append-only `FALL_REPORTED` care events | Persistence/priority tests |
| S4-STATE-07 | Invalid ratio | Numerator, denominator, window; invalid raw records retained | Aggregation test |
| S4-STATE-08 | Professional/progression approvals | Canonical Stage 3 approval status is referenced, never agent-authored | Guardrail tests |
| S4-TREE-01 | Safety event first | `SAFETY_EVENT` branch and mandatory stop/escalation | Priority table |
| S4-TREE-02 | Fall second | `FALL_REPORTED` branch, immediate reassessment and medical-contact cue | Priority table |
| S4-TREE-03 | HIGH/V6/V7 third | Separate clinical escalation branch | HIGH, V6, and V7 cases |
| S4-TREE-04 | Decline fourth | Three consecutive valid decreases; progression held | Priority table |
| S4-TREE-05 | Reassessment due fifth | Due date never later than assessment + 28 days | Boundary/priority tests |
| S4-TREE-06 | Low adherence sixth | Two consecutive weeks with at most one of three sessions | Priority table |
| S4-TREE-07 | Progression eligible seventh | Proposal only; user/caregiver approval remains required | Priority and invariant tests |
| S4-TREE-08 | Maintain last | Preserve plan/clinical state and schedule current session | Default branch test |
| S4-GR-01 | Agent cannot write risk/cutoffs | Actions contain no clinical write payload | Candidate rejection test |
| S4-GR-02 | Prescription remains prescriber output | Plan ID/hash references only | Deep invariant test |
| S4-GR-03 | Reassessment can only move earlier | Reject dates after canonical latest date | Boundary test |
| S4-GR-04 | Safety/escalation cannot be omitted | Mandatory action set for safety/HIGH/V6/V7 | Rejection test |
| S4-GR-05 | Approved wording only | Stable cue/message IDs from a closed library | Unknown ID rejection test |
| S4-LOG-01 | Candidate, rejected, guardrail, selection, execution, observation logged | One structured decision record per cycle plus tool results | Decision log test |
| S4-DEDUP-01 | Same event cannot repeat an external action | Stable idempotency key and Room unique action receipt | Same-process and reopen tests |
| S4-FAIL-01 | Tool failure does not change clinical state | Failed tool result plus no mutation of risk/V/plan/approval references | Failure-injection tests |
| S4-RESTORE-01 | Restart restores state and receipts | Room is source of truth; WorkManager uses stable unique work names | Room reopen/worker tests |
| S4-TOOL-01 | Scheduler calls Android scheduling | WorkManager adapter for reassessment/session/reminder/report | Adapter/instrumented checks |
| S4-TOOL-02 | Notifier calls Android notification | NotificationManager adapter with permission/consent result | Adapter tests |
| S4-TOOL-03 | Report composer uses stored product state | Extend weekly report to all section 10.3 fields and persist result | Report unit test |
| S4-TOOL-04 | Progress store is real Android storage | Room repository/transaction APIs | Repository tests |
| S4-CONTRACT-01 | Web/Mobile share stable IDs and JSON | `care_agent_state.v1`, event/action/decision/tool result schemas and strict codecs | Cross-runtime fixture tests |
| S4-WEB-01 | Web stores no longitudinal personal state | Ephemeral projection only; session cleanup removes it | API lifecycle test |
| S4-WEB-02 | No query/demo fake agent state | Remove `?agent=` and hardcoded action fallback | Static integration check |
| S4-LLM-01 | Optional LLM cannot alter action set | No LLM implementation in v1 | Static boundary test |

## Verified replacement cleanup

- The obsolete Web memory Agent, its state helper, and standalone loop check were deleted after Mobile unit, build, and connected-device tests passed.
- `useSteplyDashboard.js` now consumes only a validated Mobile projection.
- Stage 8 query/demo care state and hardcoded Agent actions were removed.
- Landmark replay now checks the shared Stage 4 priority contract rather than executing a Web planner.
- The Mobile weekly report now includes safety events, falls, recommendations, and Agent action summaries.

No replacement path may write STEADI risk, vulnerability findings, prescription content, or approvals from agent actions.
