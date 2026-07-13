# Stage 6 legacy reachability and documentation traceability

This is the deletion authority for Stage 6. A file is removed only after both production and test reachability are checked and the replacement path is covered by tests. Existing uncommitted work remains in place.

| ID | Requirement | Audit finding | Implementation decision | Verification |
| --- | --- | --- | --- | --- |
| S6-R01 | Analyze JS/Kotlin runtime and test reachability | Several Web modules are isolated from the Vite runtime but kept alive by obsolete static tests; Mobile has isolated helpers plus two active legacy clusters | Move tests to canonical runtime modules, then delete isolated modules; add an automated forbidden/reachability check | `stage6:cleanup:check`, Web build, Android compile |
| S6-L01 | Remove old analyzers, STEADI, recommendations, Web Care Agent, TUG v1, and demo fallback | Old Web analyzer/STEADI/recommendation/planner files are already deleted; `assessmentRules`, `poseQuality`, AR, TUG, orphan UI and old Web-agent-shape fallbacks remain | Delete the test-only legacy cluster; retain deterministic scorer, Chair/Balance state machines, Stage 3 engine and Mobile Care Agent; remove legacy Web-agent shape fallbacks | Stage 1–5 checks plus absence assertions |
| S6-L02 | Reject unsupported tests deterministically | The server accepts arbitrary test names and the worker treats every non-Balance value as Chair | Add the exact `chair_stand` / `four_stage_balance` allowlist at API, dashboard and worker boundaries before deleting TUG remnants | Boundary tests with TUG/unknown rejection |
| S6-M01 | Remove legacy Mobile history after replacement | `movement_history` is still written and rendered alongside canonical typed summaries | Stop dual writes, remove legacy cards/repository/entity/DAO, and migrate Room 7→8 by dropping the legacy table; retain historical migration code needed to open pre-v4 databases | Unit, migration and profile-deletion instrumentation tests |
| S6-M02 | Remove demo input/fallback | Gallery video streaming is a production-visible, undocumented demo path | Remove gallery picker, `DemoVideo` state and preview implementation; keep live CameraX→WSS only | Android unit/lint/build and forbidden-string check |
| S6-M03 | Keep the current scoring, Fuzzy-TOPSIS, and agent paths | Mobile `SteadiScorer`, strict prescription codec and Room Care Agent are production reachable | Keep them; remove only unused helpers/adapters. Consolidate weekly report scheduling under the Care Agent report tool | Agent/tool tests and Android instrumentation |
| S6-A01 | Manage one MediaPipe model/WASM source | Models are tracked twice; WASM is tracked/generated twice | Track models once under `models/`; use the npm package as the single WASM source; generate ignored Vite public/vendor destinations during prepare/build | Hash/duplicate check, build, real browser worker boot |
| S6-D01 | Remove temporary screenshots and stale change reports | 52 tracked QA screenshots are unreferenced. Multiple FIX/REPORT/refactor docs conflict with current schemas | Delete screenshots and stale docs only after valid run/network details are moved to the root README | Markdown link and forbidden-file checks |
| S6-D02 | One root product README | No root README exists; Web/Mobile README and run guides duplicate or conflict | Create `/Steply/README.md` with only overview, structure, run, data flow, clinical boundary, agent, tests, deployment/network; delete child READMEs and one-off guides | Stage 6 documentation check |
| S6-D03 | Keep referenced specialist documents | JSON Schemas, API contract, current architecture, assessment boundary, agent behavior and traceability are not README substitutes | Keep and update only current specialist documents; delete superseded migration/audit/visual/report documents | Link check and source-path freshness scan |
| S6-T01 | Required final validation | No existing browser system E2E or dead/duplicate checker exists | Add cleanup checks and run the real app in the in-app browser through a connected session; retain service contract E2E and default authorized synthetic replay | All commands listed in the root README |
| S6-E01 | Render the current aggregate contract without legacy result fallbacks | Browser E2E found that a completed `assessment_session.v2` was stored correctly while the result screen still expected the retired Web `structuredPipeline` final shape | Read accepted Chair/Balance results, STEADI risk and prescription directly from the canonical assessment session; preserve measured CDC zero and uppercase balance stage IDs | `[S6-E2E-01]` SSR test plus connected browser result/plan/progress session |

## Reachability decisions

### Delete after tests are redirected

- Orphan Web UI: `AnalysisPanel`, `ContextNav`, `ExercisePanel`, `JourneyFlow`, `ResultPanel`, `SessionRail`, `StartPanel`, `flowSteps`, `movementTests`.
- Test-only legacy Web logic: `assessmentRules`, `poseQuality`, `arExerciseEngine`, `timedUpAndGoAnalyzer`, `progressRepository`, `resultViewModel`, pipeline/persistence mode shims, analysis logger and timeout constant.
- Mobile legacy storage/display: active `movement_history` write/read stack after Room v8 replacement.
- Mobile demo input: gallery video picker/preview and demo stream state.

### Keep

- Structured Chair Stand and Four-Stage Balance state machines, central Stage 2 operational config and landmark replay.
- Canonical Stage 1 STEADI scorer/reducer, V1–V9 mapper and complete Stage 3 catalog/prescription engine.
- Mobile Room Care Agent and actual Android tool adapters; Web keeps only the validated ephemeral projection relay.
- `DEMO`/`FALLBACK` result-source rejection enums and tests, because they are persistence safety boundaries rather than fallback implementations.
- Legacy Room migration transformations that are required to open older installed databases; no active DAO or UI may consume the dropped table.

## Threshold ownership

- Clinical rules: STEADI, V1–V9, Chair/Balance validity and scoring, prescription risk caps and approval rules.
- Care operating policy: reassessment/adherence windows and action retry policy in Mobile `CareAgentConfigV1`.
- System operating limits: FPS, interpolation/buffer limits, QR expiry, reconnect/pending caps, WorkManager cadence and MediaPipe asset generation.

System limits must never be presented as medical cutoffs or used to rewrite deterministic clinical outputs.
