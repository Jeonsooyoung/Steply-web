# Structured Pipeline Migration

Updated: 2026-07-11

This document records the current post-cleanup state of the structured analysis pipeline. The legacy runtime analyzer path has been removed.

## Active Directory Structure

```text
client/src/pipeline/
  pose/
  quality/
  calibration/
  assessment/
    chairStand/
    balanceTest/
  findings/
  recommendation/
  agent/
  progress/
  shared/
    types/
    validation/
    config/
```

## Runtime Boundary

- `client/src/pose/poseLandmarker.worker.js` owns MediaPipe lifecycle, frame cadence, and worker messages.
- `client/src/pose/movementAnalyzers.js` is a compatibility facade that delegates Chair Stand and Balance decisions to structured state machines.
- Chair Stand decisions are made in `client/src/pipeline/assessment/chairStand/chairStandStateMachine.js`.
- Balance decisions are made in `client/src/pipeline/assessment/balanceTest/balanceTestStateMachine.js`.
- Dashboard scoring, findings, recommendation, and agent orchestration are driven from the worker-provided `structuredAssessmentResult`.

## Removed Legacy Runtime

Removed files include:

- `client/src/pose/chairStandAnalyzer.js`
- `client/src/pose/fourStageBalanceAnalyzer.js`
- `client/src/pipeline/assessment/chairStand/legacyChairStandAdapter.js`
- `client/src/pipeline/assessment/balanceTest/legacyBalanceAdapter.js`
- `client/src/agents/careOrchestrationAgent.js`
- `client/src/pose/assessmentRules.js`
- `client/src/pose/weakAreaRules.js`
- `client/src/pose/otagoRecommendations.js`
- `client/src/pose/recommendationRules.js`

## Feature Mode

`client/src/pipeline/shared/config/pipeline.config.js` now exposes `STRUCTURED_V2` as the only production runtime mode.

```js
DEFAULT_ASSESSMENT_PIPELINE_MODE = PipelineModes.StructuredV2
```

There is no in-repo `SAFE_LEGACY_ADAPTER` runtime after cleanup.

## Remaining Compatibility Fields

The worker still emits UI compatibility fields such as `primaryValue`, `repetitionCount`, `phase`, and `balanceProtocol`. These fields are derived from structured state machine snapshots and are not separate scoring logic.

## Rollback

Rollback requires restoring a previous git revision or deployment artifact that still contains the legacy runtime path. It is no longer available as a runtime feature flag.

## Verification

Run:

```bash
npm run structured:pipeline:check
npm run chair:structured:check
npm run balance:structured:check
npm run functional:findings:check
npm run otago:engine:check
npm run care:agent:check
npm run validation:check
npm run check
```
