# Legacy Cleanup Report

Updated: 2026-07-11

## Result

The new structured pipeline is now the only in-repo runtime for Chair Stand and 4-Stage Balance analysis. Legacy analyzers, legacy result adapters, old weak-area logic, old Otago mapping, and the old workflow-style care orchestration module were removed.

## Applied Changes

- Production pipeline mode is `STRUCTURED_V2`.
- Worker final responses now validate and forward `structuredAssessmentResult`; they do not call legacy result adapters.
- Worker frame analysis passes structured `PoseFrame`, `QualityStatus`, and `CalibrationProfile` into the new state machines.
- Dashboard result processing uses the worker-provided structured result only.
- Package scripts and aggregate checks no longer reference deleted legacy checks.

## Verification Required

Run:

```bash
npm run check
npm run build
```

The validation remains internal engineering validation. The cleanup does not establish clinical validity.
