import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const tables = JSON.parse(fs.readFileSync(path.join(root, 'shared/fuzzyTopsisRecommendationTables.json'), 'utf8'));
const otagoCatalog = JSON.parse(fs.readFileSync(path.join(root, 'shared/stage3ExerciseCatalog.json'), 'utf8'));
const catalogById = new Map(otagoCatalog.exercises.map((exercise) => [exercise.exerciseId, exercise]));

assert.equal(tables.schemaVersion, 'fuzzy_topsis_recommendation_tables.v1');
assert.equal(tables.exerciseInformationTable.length, 17, 'all Otago strength and balance exercises have recommendation information');
assert.equal(tables.functionExerciseConnectionTable.length, 9, 'V1 through V9 have numeric function-exercise links');
assert.equal(new Set(tables.exerciseInformationTable.map((item) => item.exerciseId)).size, 17, 'exercise information IDs are unique');
assert.deepEqual(tables.functionExerciseConnectionTable.map((item) => item.functionId), ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9']);
assert.equal(tables.criteria.reduce((sum, item) => sum + item.fuzzyWeight[1], 0), 1, 'median Fuzzy-TOPSIS weights sum to one');

const expectedLinks = {
  V1: ['S4', 'S5', 'B5', 'B6', 'B7'],
  V2: ['S3', 'B4', 'B5'],
  V3: ['S1', 'S2', 'S3', 'B1', 'B11'],
  V4: ['S1', 'S2', 'B11', 'B1'],
  V5: ['S2', 'S3', 'B1', 'B11'],
  V6: ['S1', 'B11'],
  V7: ['S4', 'S5', 'B5', 'B1'],
  V8: ['S3', 'S4', 'B7', 'B5'],
  V9: ['S1', 'S2', 'S3', 'B4', 'B11'],
};
for (const row of tables.functionExerciseConnectionTable) {
  assert.deepEqual(new Set(row.links.map((item) => item.exerciseId)), new Set(expectedLinks[row.functionId]), `${row.functionId} connection table has the intended candidate set`);
  row.links.forEach((link) => {
    assert.ok(link.relevance > 0 && link.relevance <= 1, `${row.functionId}/${link.exerciseId} relevance is normalized`);
    assert.ok(
      catalogById.get(link.exerciseId)?.variants.some((variant) => variant.variantId === link.variantId),
      `${row.functionId}/${link.exerciseId} starting variant exists in the Otago catalog`,
    );
  });
}

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});

function exercise(exerciseId, level = 'A', supportRequirement = 'STABLE_SUPPORT', reasonVulnerabilityIds = ['V3']) {
  return {
    exerciseId,
    variantId: `${exerciseId}-${level}`,
    level,
    supportRequirement,
    reasonVulnerabilityIds,
  };
}

try {
  const fuzzy = await server.ssrLoadModule('/client/src/pipeline/recommendation/fuzzyTopsisRecommender.js');
  const rightSideAssessment = {
    activeIds: ['V3', 'V9'],
    evidence: [
      { vulnerabilityId: 'V3', measurements: { completedRepetitions: 7, cdcCutoff: 12 } },
      {
        vulnerabilityId: 'V9',
        measurements: {
          asymmetryRatio: 0.24,
          repeatCount: 4,
          suspectedWeakerSide: 'RIGHT',
          sideConfidence: 0.75,
        },
      },
    ],
  };
  const candidates = [
    exercise('S1', 'A', 'NONE', ['V3', 'V9']),
    exercise('S2', 'A', 'STABLE_SUPPORT', ['V3', 'V9']),
    exercise('S3', 'A', 'STABLE_SUPPORT', ['V3', 'V9']),
    exercise('B1', 'A', 'STABLE_SUPPORT', ['V3']),
    exercise('B4', 'A', 'WALKING_AID', ['V9']),
    exercise('B11', 'A', 'TWO_HAND', ['V3', 'V9']),
  ];
  const ranking = fuzzy.rankOtagoExercisesWithFuzzyTopsis({
    prescribedExercises: candidates,
    vulnerabilityAssessment: rightSideAssessment,
    riskLevel: 'MODERATE',
  });
  assert.equal(ranking.algorithmVersion, 'safety_constrained_fuzzy_topsis.v1');
  assert.equal(ranking.safetyBoundary, 'STAGE3_ADMITTED_CANDIDATES_ONLY');
  assert.equal(ranking.affectedSide.side, 'RIGHT', 'consistent directional evidence enables a right-side target');
  assert.equal(ranking.items.length, candidates.length, 'ranking preserves the complete admitted candidate union');
  assert.deepEqual(ranking.items.map((item) => item.rank), [1, 2, 3, 4, 5, 6]);
  ranking.items.forEach((item) => {
    assert.ok(item.score >= 0 && item.score <= 1, `${item.exerciseId} closeness coefficient is normalized`);
    assert.equal(Object.keys(item.criteria).length, 6, `${item.exerciseId} exposes all ranking criteria`);
  });
  for (const exerciseId of ['S1', 'S2', 'S3']) {
    assert.equal(ranking.items.find((item) => item.exerciseId === exerciseId).targetSide, 'RIGHT', `${exerciseId} carries the right moving-limb target`);
  }
  assert.equal(ranking.items.find((item) => item.exerciseId === 'B11').targetSide, 'BILATERAL');

  const lowConfidence = fuzzy.rankOtagoExercisesWithFuzzyTopsis({
    prescribedExercises: [candidates[0]],
    vulnerabilityAssessment: {
      ...rightSideAssessment,
      evidence: rightSideAssessment.evidence.map((item) => item.vulnerabilityId === 'V9'
        ? { ...item, measurements: { ...item.measurements, sideConfidence: 0.66 } }
        : item),
    },
    riskLevel: 'LOW',
  });
  assert.equal(lowConfidence.affectedSide.side, 'UNDETERMINED', 'side-specific recommendation is withheld below confidence threshold');
  assert.deepEqual(lowConfidence.items.map((item) => item.exerciseId), ['S1'], 'Fuzzy-TOPSIS never adds an unadmitted exercise');

  const engine = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
  const planResult = engine.createFuzzyTopsisOtagoExercisePlan({
    userId: 'fuzzy-check-user',
    vulnerabilityAssessment: rightSideAssessment,
    riskLevel: 'MODERATE',
    sourceAssessments: [{ assessmentId: 'a1', resultId: 'r1', status: 'VALID' }],
  });
  assert.equal(planResult.recommendationRanking.items.length, planResult.value.selectedExercises.length, 'Stage 3 plan exposes its separate ranking projection');
  assert.deepEqual(
    planResult.value.selectedExercises.map((item) => item.exerciseId),
    planResult.recommendationRanking.items.map((item) => item.exerciseId),
    'the strict prescription is ordered by Fuzzy-TOPSIS without adding ranking fields to the v1 contract',
  );
  assert.ok(planResult.value.decisionTrace.includes('RANKED_safety_constrained_fuzzy_topsis.v1'));

  console.log('Safety-constrained Fuzzy-TOPSIS recommendation checks passed.');
} finally {
  await server.close();
}
