# Legacy Cleanup Status

Updated: 2026-07-11

The cleanup plan has been executed. The production analysis path now uses the structured pipeline by default and the old runtime analyzer path has been removed.

## Current Runtime

- `client/src/pipeline/shared/config/pipeline.config.js` sets `DEFAULT_ASSESSMENT_PIPELINE_MODE = PipelineModes.StructuredV2`.
- `client/src/pose/movementAnalyzers.js` is a compatibility facade over the structured Chair Stand and Balance state machines.
- `client/src/pose/poseLandmarker.worker.js` sends structured `PoseFrame`, `QualityStatus`, and `CalibrationProfile` into the new state machines.
- `client/src/hooks/useSteplyDashboard.js` consumes `structuredAssessmentResult` from the worker. It no longer reconstructs structured results from legacy payloads.

## Removed Runtime Code

- `client/src/pose/chairStandAnalyzer.js`
- `client/src/pose/fourStageBalanceAnalyzer.js`
- `client/src/pose/timedUpAndGoAnalyzer.js`
- `client/src/pipeline/assessment/chairStand/legacyChairStandAdapter.js`
- `client/src/pipeline/assessment/balanceTest/legacyBalanceAdapter.js`
- `client/src/agents/careOrchestrationAgent.js`
- `client/src/pose/assessmentRules.js`
- `client/src/pose/weakAreaRules.js`
- `client/src/pose/otagoRecommendations.js`
- `client/src/pose/recommendationRules.js`
- `client/src/pose/arExerciseEngine.js`

## Removed Legacy Checks

The deleted scripts tested the removed runtime only:

- `scripts/check-chair-stand-count.mjs`
- `scripts/check-four-stage-balance-protocol.mjs`
- `scripts/check-assessment-rules.mjs`
- `scripts/check-care-orchestration-agent.mjs`
- `scripts/check-weak-areas.mjs`
- `scripts/check-otago-recommendations.mjs`
- `scripts/check-pose-quality.mjs`
- `scripts/check-ar-games.mjs`

## Remaining Compatibility

Some UI payload fields such as `primaryValue`, `repetitionCount`, `balanceProtocol`, and `phase` remain for screen compatibility. They are derived from the structured state machine snapshots and are not separate decision logic.

`client/src/pose/steadiRules.js` remains as the CDC/STEADI reference helper used by structured scoring and findings.
