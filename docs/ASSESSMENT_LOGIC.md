# Assessment Logic

This document describes deterministic assessment logic implemented in the structured pipeline. It does not claim clinical validity.

## Inputs

The assessment state machines consume:

- `PoseFrame` from `client/src/pipeline/shared/types/index.js`
- `CalibrationProfile` from `client/src/pipeline/calibration/calibrationProfile.js`
- `QualityStatus` from `client/src/pipeline/quality/qualityStateMachine.js`

The replay JSON format is defined in `docs/schemas/landmark-replay.schema.json`.

## Chair Stand

Implementation:

- `client/src/pipeline/assessment/chairStand/chairStandStateMachine.js`
- Configuration: `client/src/pipeline/shared/config/chairStand.config.js`
- Unit check: `scripts/check-chair-stand-state-machine.mjs`

The state machine uses calibrated sitting-to-standing progress instead of raw hip-y direction. It requires dwell time, velocity, joint extension, and prior state before counting a repetition.

States:

- `WAITING_FOR_SIT`
- `SIT`
- `RISING`
- `STAND`
- `DESCENDING`
- `PAUSED`
- `COMPLETED`
- `INVALID`

The Chair Stand human label format is `docs/schemas/chair-stand-label.schema.json`.

Required label fields include:

- `testStartMs`
- `fullSitTimestampsMs`
- `fullStandTimestampsMs`
- `completedRepCount`
- `incompleteRepetitions`
- `confirmedArmUse`
- `invalidIntervals`
- `valid`

## Balance Test

Implementation:

- `client/src/pipeline/assessment/balanceTest/balanceTestStateMachine.js`
- Configuration: `client/src/pipeline/shared/config/balance.config.js`
- Unit check: `scripts/check-balance-test-state-machine.mjs`

The state machine confirms observability before classifying foot position. It does not pass ambiguous front-view foot placement.

Stages:

- `SIDE_BY_SIDE`
- `SEMI_TANDEM`
- `TANDEM`
- `ONE_LEG`

States:

- `SETUP`
- `ACQUIRING_POSITION`
- `POSITION_CONFIRMED`
- `HOLDING`
- `PASSED`
- `FAILED`
- `PAUSED`
- `INVALID`
- `COMPLETED`

The Balance Test human label format is `docs/schemas/balance-label.schema.json`.

Required label fields include:

- `targetStage`
- `positionAcquiredMs`
- `holdStartMs`
- `footMovement`
- `supportUse`
- `holdEndMs`
- `actualHoldDurationSeconds`
- `valid`

## Replay Metrics

The replay runner calculates:

Chair Stand:

- rep count exact match rate
- mean absolute count error
- stand event precision/recall
- sit event precision/recall
- arm use false positive rate
- invalid test detection rate

Balance:

- stage classification accuracy on classifiable cases
- ambiguous-position rejection rate
- hold time mean absolute error
- false pass rate
- false fail rate
- tracking loss vs actual failure distinction accuracy

Command:

```bash
npm run validation:check
```

## Current Limits

The current repository fixtures are synthetic internal engineering fixtures. They verify deterministic behavior and event consistency, not performance across real body types, clothing, lighting, camera hardware, or home environments.
