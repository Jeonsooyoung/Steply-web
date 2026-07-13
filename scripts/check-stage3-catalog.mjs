import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'shared/stage3ExerciseCatalog.json');
const source = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

const WARMUP_IDS = ['W1', 'W2', 'W3', 'W4', 'W5'];
const STRENGTH_IDS = ['S1', 'S2', 'S3', 'S4', 'S5'];
const BALANCE_IDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12'];
const ALL_IDS = [...WARMUP_IDS, ...STRENGTH_IDS, ...BALANCE_IDS, 'WALK'];

const exactNames = {
  W1: ['머리 돌리기', 'Head movements'],
  W2: ['목 뒤로 밀기', 'Neck movements'],
  W3: ['허리 뒤로 젖히기', 'Back extension'],
  W4: ['몸통 돌리기', 'Trunk movements'],
  W5: ['발목 움직이기', 'Ankle movements'],
  S1: ['앞무릎 강화', 'Front knee strengthening'],
  S2: ['뒷무릎 강화', 'Back knee strengthening'],
  S3: ['옆엉덩이 강화', 'Side hip strengthening'],
  S4: ['종아리 들기', 'Calf raises'],
  S5: ['발끝 들기', 'Toe raises'],
  B1: ['무릎 굽히기', 'Knee bends'],
  B2: ['뒤로 걷기', 'Backwards walking'],
  B3: ['걷다가 돌기', 'Walking and turning (figure 8)'],
  B4: ['옆으로 걷기', 'Sideways walking'],
  B5: ['탠덤 서기', 'Tandem stance'],
  B6: ['탠덤 걷기', 'Tandem walk'],
  B7: ['한발 서기', 'One leg stand'],
  B8: ['발뒤꿈치로 걷기', 'Heel walking'],
  B9: ['발끝으로 걷기', 'Toe walking'],
  B10: ['뒤로 탠덤 걷기', 'Heel-toe walking backwards'],
  B11: ['의자에서 일어서기', 'Sit to stand'],
  B12: ['계단 오르내리기', 'Stair walking'],
  WALK: ['걷기 계획', 'Walking plan'],
};

function byId(id) {
  const exercise = source.exercises.find((item) => item.exerciseId === id);
  assert.ok(exercise, `S3-CATALOG-${id} exists`);
  return exercise;
}

function variant(id, level) {
  const item = byId(id).variants.find((entry) => entry.level === level);
  assert.ok(item, `S3-CATALOG-${id}-${level} exists`);
  return item;
}

assert.equal(source.catalogVersion, 'otago_catalog.v1', 'S3-CATALOG-00 canonical catalog version');
assert.deepEqual(source.exercises.map((item) => item.exerciseId), ALL_IDS, 'S3-CATALOG-00 exact stable exercise ID order');
assert.equal(new Set(source.exercises.map((item) => item.exerciseId)).size, 23, 'S3-CATALOG-00 IDs are unique');
assert.deepEqual(source.exercises.filter((item) => item.category === 'WARMUP').map((item) => item.exerciseId), WARMUP_IDS);
assert.deepEqual(source.exercises.filter((item) => item.category === 'STRENGTH').map((item) => item.exerciseId), STRENGTH_IDS);
assert.deepEqual(source.exercises.filter((item) => item.category === 'BALANCE').map((item) => item.exerciseId), BALANCE_IDS);
assert.deepEqual(source.exercises.filter((item) => item.category === 'WALKING').map((item) => item.exerciseId), ['WALK']);

for (const [id, [nameKo, nameEn]] of Object.entries(exactNames)) {
  assert.equal(byId(id).nameKo, nameKo, `S3-CATALOG-${id} exact Korean name`);
  assert.equal(byId(id).nameEn, nameEn, `S3-CATALOG-${id} exact Otago name`);
}

const warmupDosage = {
  W1: [5, true], W2: [5, false], W3: [5, false], W4: [5, true], W5: [10, true],
};
for (const [id, [repetitions, perSide]] of Object.entries(warmupDosage)) {
  const item = variant(id, 'A');
  assert.equal(item.dosage.repetitions, repetitions, `S3-CATALOG-${id} repetitions`);
  assert.equal(item.dosage.sets, 1, `S3-CATALOG-${id} one set`);
  assert.equal(item.dosage.perSide, perSide, `S3-CATALOG-${id} per-side rule`);
  assert.equal(item.weight.type, 'NONE');
  assert.equal(item.cameraVerification.mode, 'MANUAL_ONLY');
}

for (const id of ['S1', 'S2', 'S3']) {
  for (const item of byId(id).variants) {
    assert.equal(item.dosage.repetitions, 10, `S3-CATALOG-${id} ten repetitions`);
    assert.equal(item.dosage.perSide, true, `S3-CATALOG-${id} each leg`);
    assert.deepEqual(item.tempo.concentricSeconds, [2, 3], `S3-CATALOG-${id} lifting tempo`);
    assert.deepEqual(item.tempo.eccentricSeconds, [4, 5], `S3-CATALOG-${id} lowering tempo`);
    assert.equal(item.rest.minimumSeconds, 60, `S3-CATALOG-${id} minimum rest`);
    assert.equal(item.rest.maximumSeconds, 120, `S3-CATALOG-${id} maximum rest`);
    assert.match(item.breathing, /숨을 참지 않음/, `S3-CATALOG-${id} breathing rule`);
    assert.equal(item.cameraVerification.mode, 'FULL');
  }
  assert.equal(variant(id, 'A').weight.type, 'NONE');
  assert.deepEqual(variant(id, 'B').weight.loadKg, [1, 2]);
  assert.deepEqual(variant(id, 'C').weight.fatigueRepetitionRange, [8, 10]);
}
assert.equal(byId('S1').position, '앉기', 'S3-CATALOG-S1 only seated strength exercise');
assert.match(byId('S2').position, /지지대/, 'S3-CATALOG-S2 supported standing');
assert.match(byId('S3').position, /지지대/, 'S3-CATALOG-S3 supported standing');
for (const id of ['S4', 'S5']) {
  assert.deepEqual(byId(id).variants.map((item) => item.level), ['C', 'D']);
  assert.equal(variant(id, 'C').dosage.repetitions, 10);
  assert.equal(variant(id, 'C').dosage.sets, 2);
  assert.equal(variant(id, 'C').supportRequirement, 'STABLE_SUPPORT');
  assert.equal(variant(id, 'D').supportRequirement, 'NONE');
  assert.equal(variant(id, 'C').weight.type, 'NONE');
}

const balanceTable = [
  ['B1', 'A', { repetitions: 10, sets: 1 }, 'STABLE_SUPPORT'],
  ['B1', 'B', { repetitions: 10, sets: 1 }, 'NONE'],
  ['B1', 'C', { repetitions: 10, sets: 2 }, 'NONE'],
  ['B1', 'D', { repetitions: 10, sets: 3 }, 'NONE'],
  ['B2', 'A', { steps: 10, sets: 4 }, 'STABLE_SUPPORT'], ['B2', 'B', { steps: 10, sets: 4 }, 'NONE'],
  ['B3', 'A', { figureEightRounds: 2, sets: 1 }, 'WALKING_AID'], ['B3', 'B', { figureEightRounds: 2, sets: 1 }, 'NONE'],
  ['B4', 'A', { steps: 10, sets: 4 }, 'WALKING_AID'], ['B4', 'B', { steps: 10, sets: 4 }, 'NONE'],
  ['B5', 'A', { holdSeconds: 10, sets: 1 }, 'STABLE_SUPPORT'], ['B5', 'B', { holdSeconds: 10, sets: 1 }, 'NONE'],
  ['B6', 'A', { steps: 10 }, 'STABLE_SUPPORT'], ['B6', 'B', { steps: 10 }, 'NONE'],
  ['B7', 'A', { holdSeconds: 10, sets: 1 }, 'STABLE_SUPPORT'], ['B7', 'B', { holdSeconds: 10, sets: 1 }, 'NONE'], ['B7', 'C', { holdSeconds: 30, sets: 1 }, 'NONE'],
  ['B8', 'A', { steps: 10, sets: 4 }, 'STABLE_SUPPORT'], ['B8', 'B', { steps: 10, sets: 4 }, 'NONE'],
  ['B9', 'A', { steps: 10, sets: 4 }, 'STABLE_SUPPORT'], ['B9', 'B', { steps: 10, sets: 4 }, 'NONE'],
  ['B10', 'A', { steps: 10 }, 'NONE'],
  ['B11', 'A', { repetitions: 5, sets: 1 }, 'TWO_HAND'], ['B11', 'B', { repetitions: 5, sets: 1 }, 'ONE_HAND'], ['B11', 'C', { repetitions: 10, sets: 1 }, 'NONE'], ['B11', 'D', { repetitions: 10, sets: 2 }, 'NONE'],
  ['B12', 'A', { sets: 1 }, 'STABLE_SUPPORT'], ['B12', 'B', { sets: 1 }, 'STABLE_SUPPORT'], ['B12', 'C', { sets: 1 }, 'STABLE_SUPPORT'], ['B12', 'D', { sets: 2 }, 'STABLE_SUPPORT'],
];
for (const [id, level, dosage, support] of balanceTable) {
  const item = variant(id, level);
  for (const [key, value] of Object.entries(dosage)) assert.equal(item.dosage[key], value, `S3-CATALOG-${id}-${level} ${key}`);
  assert.equal(item.supportRequirement, support, `S3-CATALOG-${id}-${level} support`);
}
assert.match(variant('B1', 'B').dosage.alternative, /지지 2세트/, 'S3-CATALOG-B1-B alternative retained as data');
assert.match(variant('B11', 'B').dosage.alternative, /양손 10회/, 'S3-CATALOG-B11-B alternative retained as data');
assert.match(variant('B11', 'C').dosage.alternative, /한손 2세트/, 'S3-CATALOG-B11-C alternative retained as data');

const expectedCamera = {
  B1: 'FULL', B2: 'MANUAL_ONLY', B3: 'MANUAL_ONLY', B4: 'PARTIAL', B5: 'FULL', B6: 'MANUAL_ONLY',
  B7: 'FULL', B8: 'MANUAL_ONLY', B9: 'MANUAL_ONLY', B10: 'MANUAL_ONLY', B11: 'FULL', B12: 'MANUAL_ONLY',
};
assert.deepEqual(
  Object.fromEntries(Object.entries(source.balanceDefaults.cameraByExerciseId).map(([id, value]) => [id, value.mode])),
  expectedCamera,
  'S3-CATALOG-CAMERA exact automatic/partial/manual coverage',
);

assert.equal(source.program.warmupMinutes, 5);
assert.equal(source.program.strengthFrequencyPerWeek, 3);
assert.equal(source.program.strengthRequiresRestDayBetweenSessions, true);
assert.equal(source.program.balanceFrequencyPerWeek, 3);
assert.equal(source.program.walkingFrequencyPerWeek, 2);
assert.equal(source.program.walkingMaximumMinutes, 30);
assert.deepEqual(source.program.walkingSplitMinutes, [10, 10, 10]);
assert.equal(source.program.walkingRequiresStrengthAndBalance, true);
const walking = variant('WALK', 'A');
assert.equal(walking.dosage.maximumMinutes, 30);
assert.deepEqual(walking.dosage.splitMinutes, [10, 10, 10]);
assert.equal(walking.dosage.pace, 'USUAL');
assert.equal(walking.mustAccompanyStrengthAndBalance, true);
assert.equal(walking.cameraVerification.mode, 'MANUAL_ONLY');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});
try {
  const engine = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
  const exported = engine.STAGE3_EXERCISE_CATALOG || engine.OTAGO_EXERCISE_CATALOG;
  assert.ok(Array.isArray(exported), 'S3-CATALOG-EXPORT deterministic engine exports the common catalog');
  assert.deepEqual(exported.map((item) => item.exerciseId), ALL_IDS, 'S3-CATALOG-EXPORT engine and shared catalog IDs are identical');
} finally {
  await server.close();
}

console.log('Stage 3 complete Otago catalog checks passed.');
