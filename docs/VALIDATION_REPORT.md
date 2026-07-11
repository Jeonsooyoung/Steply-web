# Validation Report

Internal engineering validation only. This report does not claim clinical validity.

Generated from:

```bash
npm run validation:check
```

Summary artifact:

```text
artifacts/validation/internal-validation-summary.json
```

## Scope

The goal of this validation pass is to confirm that the structured pipeline recognizes scripted movement sequences consistently and returns rule-based results deterministically. It does not evaluate clinical accuracy, fall prediction, diagnosis, or effectiveness of exercise recommendations.

## Data Used

Current dataset source:

```text
synthetic_internal_fixture
```

Counts:

- real or explicitly authorized human landmark cases: 0
- synthetic internal replay cases: 8
- Chair Stand cases: 4
- Balance Test cases: 4
- Recommendation scenarios: 4
- Agent scenarios: 6

Replay fixture ids:

- `chair_normal_three_reps`
- `chair_half_rise_not_counted`
- `chair_confirmed_arm_support_invalid`
- `chair_tracking_loss_recovery`
- `balance_tandem_pass`
- `balance_tandem_ambiguous_front_view`
- `balance_one_leg_touchdown_fail`
- `balance_tracking_loss_recovery_pass`

Coverage tags currently represented:

- normal
- repetition count
- timestamp dwell
- incomplete repetition
- arm support
- protocol invalid
- partial occlusion
- tracking loss
- pause/resume
- tandem
- one-leg
- correct position
- wrong performance
- wrong camera angle
- ambiguous rejection
- touchdown
- oblique camera

## Data Not Yet Covered

The repository does not currently contain real or explicitly authorized landmark data for:

- body type differences
- height differences
- loose clothing
- skirt or clothing that hides feet
- low lighting from real cameras
- backlight
- camera shake from real devices
- partial occlusion by furniture or caregivers
- chair height differences from real scenes
- wrong camera angles from real homes
- intentionally wrong performance by actual participants
- leaving mid-test in real capture

Some of these can be simulated by the replay runner, but simulated degradation is not a substitute for authorized human landmark data.

## Replay Runner

Implementation:

```text
scripts/validation/landmarkReplayRunner.mjs
scripts/run-landmark-replay.mjs
scripts/check-internal-validation.mjs
```

Replay schema:

```text
docs/schemas/landmark-replay.schema.json
```

Label schemas:

```text
docs/schemas/chair-stand-label.schema.json
docs/schemas/balance-label.schema.json
```

Commands:

```bash
npm run validation:check
npm run validation:replay
node scripts/run-landmark-replay.mjs --input path/to/anonymized-landmarks.json --assert
```

Supported replay transforms:

- original timestamp preservation
- replay speed metadata
- deterministic frame drop simulation
- landmark confidence scaling
- left/right mirroring
- camera quality degradation modes: `low_light`, `feet_occluded`, `body_out_of_frame`, `front_view`
- state transition log comparison
- expected result vs actual result comparison

Additional transform smoke checks run in this pass:

```bash
node scripts/run-landmark-replay.mjs --default-suite --mirror --confidence-scale 0.95 --speed 2 --assert --output artifacts/validation/internal-validation-mirrored-summary.json
node scripts/run-landmark-replay.mjs --default-suite --drop-rate 0.02 --seed validation-drop-smoke --assert --output artifacts/validation/internal-validation-drop-summary.json
```

Both transform checks completed with 8 replay cases and 0 replay failures.

## Metrics

### Chair Stand

| Metric | Result |
| --- | ---: |
| case count | 4 |
| rep count exact match rate | 1.00 |
| mean absolute count error | 0 |
| stand event precision | 1.00 |
| stand event recall | 1.00 |
| sit event precision | 1.00 |
| sit event recall | 1.00 |
| arm use false positive rate | 0 |
| invalid test detection rate | 1.00 |

### Balance Test

Stage classification accuracy is calculated only on classifiable cases. Ambiguous cases are evaluated by ambiguous-position rejection rate.

| Metric | Result |
| --- | ---: |
| case count | 4 |
| stage classification accuracy | 1.00 |
| ambiguous-position rejection rate | 1.00 |
| hold time mean absolute error | 0.0625 seconds |
| false pass rate | 0 |
| false fail rate | 0 |
| tracking loss vs actual failure distinction accuracy | 1.00 |

### Recommendation

| Metric | Result |
| --- | ---: |
| scenario count | 4 |
| expected exercise plan exact match rate | 1.00 |
| risk cap violation count | 0 |
| unexplained recommendation count | 0 |

### Agent

| Metric | Result |
| --- | ---: |
| scenario count | 6 |
| expected policy match rate | 1.00 |
| guardrail violation count | 0 |
| duplicate action count | 0 |
| tool failure fallback success rate | 1.00 |
| escalation omission count | 0 |

## Failure Cases

No replay, recommendation, or agent validation failures occurred in this synthetic internal suite.

No threshold changes were made in this validation step.

If a future replay case fails, record it with:

- input condition
- expected result
- actual result
- failed module
- decision evidence
- fix
- impact on other tests
- changed config file and config version

## Threshold Versions

Current threshold/config versions:

- `POSE_CONFIG_VERSION = pose_config.v1` in `client/src/pipeline/shared/config/pose.config.js`
- `QUALITY_CONFIG_VERSION = quality_config.v1` in `client/src/pipeline/shared/config/quality.config.js`
- `CALIBRATION_CONFIG_VERSION = calibration_config.v1` in `client/src/pipeline/shared/config/calibration.config.js`
- `CHAIR_STAND_CONFIG_VERSION = chair_stand_config.v1` in `client/src/pipeline/shared/config/chairStand.config.js`
- `BALANCE_CONFIG_VERSION = balance_config.v1` in `client/src/pipeline/shared/config/balance.config.js`
- `FUNCTIONAL_FINDINGS_CONFIG_VERSION = functional_findings_config.v1` in `client/src/pipeline/shared/config/functionalFindings.config.js`
- `PERSISTENCE_CONFIG_VERSION = persistence_config.v1` in `client/src/pipeline/shared/config/persistence.config.js`
- `PIPELINE_CONFIG_VERSION = pipeline_config.v1` in `client/src/pipeline/shared/config/pipeline.config.js`

## Existing Pipeline Comparison

Structured pipeline files are in:

```text
client/src/pipeline/
client/src/pose/movementAnalyzers.js
client/src/pose/poseLandmarker.worker.js
```

Current comparison status:

- `STRUCTURED_V2` is the production runtime through `client/src/pipeline/shared/config/pipeline.config.js`.
- Legacy analyzers, legacy structured adapters, old weak-area mapping, and old Otago recommendation mapping have been removed.
- Structured pipeline passes internal deterministic state-machine, recommendation, agent, and UI checks.
- A head-to-head replay comparison on real anonymized landmark data has not been performed because no such dataset is present in the repository.
- The new replay runner compares expected labels to the structured pipeline output. It is ready to run the same process when authorized landmark JSON is added.

## Replacement Gate

| Gate | Status | Evidence |
| --- | --- | --- |
| New pipeline tests pass | PASS | `npm run validation:check` and structured checks pass |
| Replay result is reproducible | PASS | 8 synthetic replay cases, 0 failures |
| Core user flow works | PASS | `scripts/check-ui-structured-pipeline.mjs` |
| Invalid result safe handling | PASS | invalid replay and UI checks block normal exercise flow |
| Recommendation guardrail passes | PASS | risk cap violation count 0 |
| Agent simulation passes | PASS | policy match 1.00, guardrail violation count 0 |
| Legacy runtime removed | PASS | `STRUCTURED_V2` is the only in-repo runtime mode |
| Real or explicitly authorized human replay data exists | INFO | no such dataset is present; this blocks clinical claims, not the code cleanup |

## Activation Conclusion

Current activation:

```text
STRUCTURED_V2 is active as the only in-repo runtime path.
```

This is an internal engineering validation result only. The lack of real or explicitly authorized anonymized human landmark replay data remains a limitation for any clinical validity claim.

## Rollback

Rollback path:

```text
restore the previous git revision or deployment artifact that still contains the legacy analyzer path
```

There is no in-repo `SAFE_LEGACY_ADAPTER` runtime after this cleanup.

## Next Validation Work

Recommended next steps:

1. Collect explicitly authorized anonymized PoseFrame JSON for Chair Stand and Balance Test.
2. Label Chair Stand events with `docs/schemas/chair-stand-label.schema.json`.
3. Label Balance events with `docs/schemas/balance-label.schema.json`.
4. Run replay with frame drop, confidence scaling, mirroring, and camera degradation transforms.
5. Add at least one real case for every unsupported environment listed above.
6. Only after replay metrics pass on authorized data, run a head-to-head comparison against the existing pipeline.
