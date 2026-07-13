# Safety-Constrained Fuzzy-TOPSIS Recommendation

## Scope

The Stage 1 CDC STEADI score and Stage 3 clinical safety caps remain unchanged. The function-exercise connection table is the only source of candidates and starting variants. Fuzzy-TOPSIS ranks those candidates after the safety caps are applied. A high score can never re-introduce an exercise excluded by source quality, risk-level caps, V6 constraints, or professional-review requirements.

The configurable single source of truth is `shared/fuzzyTopsisRecommendationTables.json`.

## Runtime flow

```text
CDC assessment + live pose observations
  -> V1-V9 functional evidence
  -> fuzzy deficit degrees (0..1)
  -> candidates and starting variants from the function-exercise table
  -> Stage 3 safety caps and professional-review boundary
  -> exercise information + function-exercise relevance lookup
  -> Fuzzy-TOPSIS ranking
  -> ranked recommendation projection
```

## Exercise information table

The `exerciseInformationTable` stores one row for every strength or balance exercise:

| Field | Meaning |
|---|---|
| `exerciseId` | Canonical Otago ID shared by Web and Mobile |
| `sideMode` | Per-side or bilateral performance |
| `functionalRole` | Moving limb, support limb, or bilateral task |
| `difficultyByLevel` | Relative within-product difficulty for each canonical variant |
| `balanceDemand` | Relative balance demand before support adjustment |
| `strengthDemand` | Relative lower-body strength demand |
| `fatigueDemand` | Relative fatigue burden |

These values are recommendation configuration, not clinical cutoffs. They require expert review and sensitivity analysis before clinical use.

## Function-exercise connection table

The `functionExerciseConnectionTable` is the sole V1-V9 candidate map. Each link stores the exercise ID, starting variant, numeric relevance, and any side-specific modifier. A relevance of 1.0 means the exercise is a primary match for that function; lower non-zero values indicate supporting coverage.

| Function | Main linked exercises |
|---|---|
| V1 ankle strategy | S4, S5, B5, B6, B7 |
| V2 lateral hip stability | S3, B4, B5 |
| V3 lower-body strength/endurance | S1, S2, S3, B1, B11 |
| V4 lower-body endurance | S1, S2, B1, B11 |
| V5 hip extension | S2, S3, B1, B11 |
| V6 independent sit-to-stand | S1, B11 |
| V7 basic static balance | S4, S5, B1, B5 |
| V8 single-leg balance | S3, S4, B5, B7 |
| V9 left-right use symmetry | S1, S2, S3, B4, B11 |

## Fuzzy-TOPSIS criteria

The current median weights are:

| Criterion | Weight |
|---|---:|
| Functional deficit match | 0.30 |
| Side match | 0.15 |
| Difficulty fit | 0.18 |
| Safety margin | 0.25 |
| Fatigue fit | 0.07 |
| Progression fit | 0.05 |

Each crisp criterion is converted to a triangular fuzzy number with the configured uncertainty spread. The weighted vertex distance to the positive and negative ideal solutions is calculated, then:

```text
closeness = distance_to_negative_ideal
          / (distance_to_positive_ideal + distance_to_negative_ideal)
```

All admitted candidates are preserved to respect the complete Stage 3 exercise union. The closeness coefficient changes priority order, not the safety boundary.

## Side-specific interpretation

Chair-stand knee angular-velocity asymmetry records the repeatedly slower side. The side is exposed only when at least 67% of valid asymmetric repetitions agree. Otherwise the target is `UNDETERMINED` and the UI does not claim a side-specific weakness.

The camera result is described as a functional movement asymmetry, not a muscle-strength diagnosis. A monocular camera does not measure force, torque, or muscle activation.
