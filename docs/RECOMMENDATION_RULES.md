# Recommendation Rules

This document describes deterministic exercise recommendation rules. The recommendation engine does not use an LLM to select exercises.

## Implementation

- Engine: `client/src/pipeline/recommendation/otagoExerciseEngine.js`
- Functional findings: `client/src/pipeline/findings/functionalFindings.js`
- Finding thresholds: `client/src/pipeline/shared/config/functionalFindings.config.js`
- Unit check: `scripts/check-otago-exercise-engine.mjs`
- Internal validation: `scripts/check-internal-validation.mjs`

## Catalog

The initial Otago catalog is defined in `OTAGO_EXERCISE_CATALOG`:

- `front_knee_strengthening`
- `back_knee_strengthening`
- `side_hip_strengthening`
- `calf_raises`
- `toe_raises`
- `knee_bends`
- `tandem_stance`
- `one_leg_stand`
- `sit_to_stand`

Each catalog item includes:

- exercise id and display name
- Otago source name
- category
- supported functional domains
- available levels
- repetitions and sets
- support and supervision requirements
- minimum and maximum risk level
- camera-verifiable status
- contraindication tags
- progression and regression rule
- instruction and safety message keys

## Selection Order

The engine applies:

1. assessment validity check
2. professional review and safety blocks
3. STEADI risk level cap
4. primary finding mapping
5. secondary observation cue mapping
6. duplicate removal
7. maximum exercise count
8. final safety validation

The default session is capped to three selected exercises.

## Guardrails

- HIGH risk returns a blocked plan requiring professional review.
- `ARM_SUPPORT_REQUIRED` blocks unsupported sit-to-stand.
- Low-confidence findings do not add specific exercises.
- Every selected exercise must include reason codes and reason messages.
- Excluded exercises include exclusion reason codes.

## Validation Command

```bash
npm run otago:engine:check
npm run validation:check
```

The current internal validation result is recorded in `docs/VALIDATION_REPORT.md`.
