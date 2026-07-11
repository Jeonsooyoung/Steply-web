# Steply Structured Pipeline Architecture

This document describes the current implementation architecture for the structured analysis pipeline. It is an engineering description, not a clinical validation claim.

## Runtime Overview

```mermaid
flowchart TD
  A["Mobile camera frame stream"] --> B["useRemotePoseAnalysis"]
  B --> C["MediaPipe PoseLandmarker worker"]
  C --> D["PoseFrame"]
  D --> E["QualityStatus"]
  D --> F["CalibrationProfile"]
  E --> G["Assessment state machine"]
  F --> G
  G --> H["Structured assessment result"]
  H --> I["STEADI scoring"]
  H --> J["Functional findings"]
  J --> K["Deterministic Otago recommendation"]
  K --> L["Care Orchestration Agent"]
  L --> M["Session flow UI"]
```

## Key Files

- Pose input and frame control: `client/src/pipeline/pose/frameProcessor.js`
- MediaPipe worker integration: `client/src/pose/poseLandmarker.worker.js`
- PoseFrame adapter: `client/src/pipeline/pose/poseFrameAdapter.js`
- Coordinate utilities: `client/src/pipeline/pose/coordinateMapping.js`
- Quality scoring: `client/src/pipeline/quality/frameQualityMetrics.js`
- Quality state machine: `client/src/pipeline/quality/qualityStateMachine.js`
- Calibration profile: `client/src/pipeline/calibration/calibrationProfile.js`
- Personal calibration: `client/src/pipeline/calibration/personalCalibration.js`
- Chair Stand state machine: `client/src/pipeline/assessment/chairStand/chairStandStateMachine.js`
- Balance Test state machine: `client/src/pipeline/assessment/balanceTest/balanceTestStateMachine.js`
- Functional findings: `client/src/pipeline/findings/functionalFindings.js`
- Otago recommendation engine: `client/src/pipeline/recommendation/otagoExerciseEngine.js`
- Care agent: `client/src/pipeline/agent/careAgent.js`
- UI flow adapter: `client/src/pipeline/ui/sessionFlow.js`
- Result view model: `client/src/pipeline/ui/resultViewModel.js`
- Persistence guardrails: `client/src/pipeline/shared/config/persistence.config.js`

## Configuration

All threshold versions are centralized under `client/src/pipeline/shared/config`:

- `pose.config.js`
- `quality.config.js`
- `calibration.config.js`
- `chairStand.config.js`
- `balance.config.js`
- `functionalFindings.config.js`
- `persistence.config.js`
- `pipeline.config.js`

The current activation gate is `client/src/pipeline/shared/config/pipeline.config.js`.

Production default:

```js
DEFAULT_ASSESSMENT_PIPELINE_MODE = PipelineModes.StructuredV2
```

Production allowed mode:

```js
PipelineModes.StructuredV2
```

## Validation Tools

- Landmark replay runner: `scripts/validation/landmarkReplayRunner.mjs`
- CLI wrapper: `scripts/run-landmark-replay.mjs`
- CI check wrapper: `scripts/check-internal-validation.mjs`
- Summary output: `artifacts/validation/internal-validation-summary.json`
- Report: `docs/VALIDATION_REPORT.md`

Commands:

```bash
npm run validation:check
npm run validation:replay
node scripts/run-landmark-replay.mjs --input path/to/anonymized-landmarks.json --assert
```

## Replacement Status

The structured pipeline is the only in-repo runtime path for Chair Stand and 4-Stage Balance analysis. Legacy mutable analyzers and legacy structured adapters have been removed. Internal engineering validation still uses synthetic fixtures, and the repository does not contain a real or explicitly authorized anonymized human landmark dataset, so this is not a clinical validation claim.
