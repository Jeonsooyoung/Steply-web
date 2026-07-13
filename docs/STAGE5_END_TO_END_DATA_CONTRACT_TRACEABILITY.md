# Stage 5 Web/Mobile data contract traceability

Authoritative source: product specification §§9–11, especially §§10.1, 10.3 and 11.3.

## Rule ownership

- Clinical, immutable: the canonical STEADI risk, V1–V9 findings, exact chair-stand repetitions, four per-posture balance hold times, prescription and professional approval output remain outputs of the Stage 1–3 scoring and safety tools; Fuzzy-TOPSIS changes only the priority of safety-admitted exercises.
- Operational/data lifecycle: schema versioning, five-item projection limit, Room retention, PC in-memory lifetime, idempotency, deletion orchestration and transport are system rules. They must never recompute or substitute clinical values.

## Requirement matrix (pre-change audit)

| ID | Requirement | Pre-change evidence | Gap / implementation decision | Verification |
| --- | --- | --- | --- | --- |
| S5-C01 | One versioned shared JSON contract, validated by Web and Mobile | Assessment v2 and Care Agent v1 contracts exist independently | Add one `steply_data_contract.v1` connection snapshot plus strict Web validator and strict Mobile codec | Cross-runtime contract test |
| S5-C02 | Canonical field names (`displayName`, not `name`/`title`) | Web normalization and Mobile connect payload emit both `displayName` and `name`; exercise UI accepts `title` fallbacks | Wire contracts use `displayName` only; compatibility names are rejected at the Stage 5 boundary | Unknown/legacy field tests |
| S5-D01 | Mobile stores assessment results and prescription | Room `assessment_sessions.envelopeJson` already stores canonical aggregate and prescription | Keep as canonical source; add lifecycle/deletion coverage | Room restart/deletion tests |
| S5-D02 | Mobile stores exercise completion | UI checkbox state is only Compose `remember` state | Add Room exercise completion records and repository-backed UI state | Room/UI repository tests |
| S5-D03 | Mobile stores safety events, falls and agent decision log | Room Care Agent v6 stores `care_events` and `care_decision_logs` | Preserve and include in profile deletion/report queries | Room deletion/report tests |
| S5-D04 | Mobile stores landmark time series; raw video is never stored | No landmark Room entity; frames are streamed and discarded | Add versioned landmark series/chunk contract and Room entity; no frame/blob/file write path. The system-only 90-second/2,700-sample transport cap covers calibration plus the four-stage balance entry/hold upper bound and is not a clinical cutoff. | Static no-video check and Room tests |
| S5-D05 | User can delete retained local data | Only history has `deleteAll`; Web settings button is cosmetic | Add transactional profile/all-record deletion on Mobile, including landmarks, assessments, prescriptions, completions, events and decisions | Cascade-equivalent deletion test |
| S5-X01 | Only needed recent five summaries go to PC on connection | Mobile sends profile and one assessment snapshot; Web has temporary history adapter | Send `steply_data_contract.v1` containing only canonical profile, at most five valid summaries, and `generatedAt`; reject weekly report, safety/falls, rationale, raw history, landmarks, and logs | Payload/strict schema tests |
| S5-X02 | PC deletes all personal data on explicit session end | Web cleanup clears known session fields, but recent summaries are absent and Mobile cleanup helper is not called by the end flow | Store summaries only in the session object, clear every personal field and close/zero frame references on authenticated cleanup; wire Mobile end/discard to cleanup | HTTP/WS cleanup integration test |
| S5-G01 | Graphs use exact chair reps and balance seconds by posture | Web has permissive legacy fallbacks; Mobile balance graph prefers `score` | Build graph series only from canonical accepted results, exclude invalid, and keep all four posture times | Table tests |
| S5-G02 | Quality score is not an assessment score | Mobile uses `score` for balance trend in one path | Remove quality/score fallbacks from canonical challenge graphs | Regression test with misleading quality score |
| S5-I01 | Invalid results are retained but excluded from graphs | Attempts are retained in assessment JSON; Web trend filtering is not enforced in the utility | Explicit `valid`/`excludeFromTrends` gate in both graph projections | Valid/invalid table tests |
| S5-R01 | Weekly report includes risk change, V1–V9, recent five, adherence, safety, falls, recommendation, agent rationale | Mobile generator contains most fields, assembled from permissive raw JSON fallbacks | Compose and retain it strictly on Mobile from canonical Room records; never include it in the PC connection projection | Mobile report table test plus Web rejection test |
| S5-E01 | Actual Web final JSON parses in Mobile | Web and Mobile have parallel fixtures but no cross-runtime generated artifact test | Generate the final update through Web production service and pass it directly to Mobile `AssessmentSessionJsonCodec` in one command | `stage5:e2e-contract` |
| S5-T01 | Transport wording matches implementation | Product text says WebRTC; implementation is authenticated HTTPS/WSS binary JPEG | Keep WSS and update product/contract wording to the implemented encrypted WebSocket transport | Documentation/static assertion |

## Data lifecycle

1. Mobile is authoritative and retains canonical assessment/prescription, exercise completion, safety/fall events, decision logs and landmark series until user deletion.
2. Mobile sends the PC only a strict profile snapshot, at most five valid canonical assessment summaries, and projection generation time when pairing. Weekly reports, safety/fall records, and decision rationale remain on Mobile.
3. PC holds the snapshot, assessment mirror, projection and current frame only in process memory. It writes none of them to disk.
4. Explicit authenticated end/discard clears the complete PC session payload and frame references. A transient transport disconnect does not destroy resumable in-progress state.
5. Raw video frames are analyzed and discarded; they are never inserted into Room or written by the Web server.

## Document/code discrepancy log

- §11.1 previously described WebRTC, while the shipped and tested transport is HTTPS/WSS with binary JPEG frames. Stage 5 keeps that implementation and changes the product wording to “encrypted WebSocket (WSS) low-latency transfer.”
- Existing profile compatibility emitted both `displayName` and `name`. Stage 5 chooses `displayName` as the sole product wire field.
- Existing Mobile balance history could display a generic score. Stage 5 removes that fallback because §10.1 requires per-posture seconds.
- `shared/stage1Assessment.cjs#normalizeProfileSnapshot` retains read-only `age`/`gender` upcasting only when replaying pre-Stage-5 `assessment_session.v1` snapshots. It is downstream of the strict connection boundary, never emitted by `steply_data_contract.v1`, and cannot make a legacy connection payload valid. New production UI and connection code read only `displayName`, `birthYear`, and `sex`; `ageYears` exists only as an internal derived clinical input.
- Exercise card/result view models use an internal property named `title` after normalization. That property is constructed only from the strict exercise `displayName`; production contract inputs no longer fall back to wire fields named `title` or `name`.
