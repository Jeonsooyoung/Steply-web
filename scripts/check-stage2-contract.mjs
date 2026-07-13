import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  STAGE2_OPERATIONAL_RULE_VERSION,
  canonicalHash,
  normalizeStage2Result,
} = require('../shared/stage2Contract.cjs');
const {
  ASSESSMENT_SESSION_SCHEMA_VERSION,
  AssessmentSessionEventTypes,
  FunctionalTestSlots,
  createAssessmentSession,
  reduceAssessmentSession,
  upcastAssessmentSessionV1,
} = require('../shared/stage1Assessment.cjs');
const assessmentSessionService = require('../src/services/assessmentSessionService');
const { saveAssessmentResult } = require('../src/services/assessmentResultPersistence');
const sessionService = require('../src/services/sessionService');

const schema = JSON.parse(fs.readFileSync(new URL('../docs/schemas/assessment-session-v2.schema.json', import.meta.url)));
const updateSchema = JSON.parse(fs.readFileSync(new URL('../docs/schemas/assessment-session-update-v2.schema.json', import.meta.url)));
const commandSchema = JSON.parse(fs.readFileSync(new URL('../docs/schemas/assessment-session-command-v2.schema.json', import.meta.url)));
assert.equal(schema.properties.schemaVersion.const, 'assessment_session.v2', 'S2-CONTRACT-01 snapshot schema version');
assert.equal(updateSchema.properties.schemaVersion.const, 'assessment_session.v2', 'S2-CONTRACT-01 update schema version');
assert.equal(updateSchema.properties.type.const, 'assessment-session.updated', 'S2-CONTRACT-01 wire update type matches Mobile codec');
for (const key of ['assessmentSessionId', 'revision', 'session']) {
  assert.ok(updateSchema.required.includes(key), `S2-CONTRACT-01 wire update requires ${key}`);
}
assert.equal(commandSchema.properties.schemaVersion.const, 'assessment_session.v2', 'S2-CONTRACT-01 command schema version');
assert.equal(schema.additionalProperties, false, 'S2-CONTRACT-01 top-level schema is strict');
assert.deepEqual(
  schema.$defs.balanceStage.properties.failureCode.oneOf[0].enum,
  ['F1', 'F2', 'F3', 'F4', 'F5'],
  'S2-BAL-F1-F5 failureCode is the cross-platform requirement ID',
);
assert.ok(schema.$defs.balanceStage.required.includes('failureReason'), 'S2-BAL-F1-F5 keeps a separate failureReason detail');

function calibration(type) {
  return {
    sampledDurationMs: 3_000,
    lFootM: 0.24,
    hStandM: 0.93,
    hSitM: type === FunctionalTestSlots.ChairStand ? 0.51 : null,
    wShoulderM: 0.39,
    dFoldM: type === FunctionalTestSlots.ChairStand ? 0.22 : null,
    supportRoiNormalized: type === FunctionalTestSlots.FourStageBalance
      ? { x: 0.8, y: 0.2, width: 0.18, height: 0.5 }
      : null,
  };
}

function quality(status = 'VALID', {
  g3ViolationRatio = status === 'VALID' ? 0 : 0.25,
  invalidReasons = status === 'VALID' ? [] : ['G3_VIOLATION_RATIO_EXCEEDED'],
} = {}) {
  return {
    gates: ['G1', 'G2', 'G3', 'G4', 'G5'].map((gate) => ({
      gate,
      violationFrameCount: gate === 'G3' && g3ViolationRatio > 0 ? 8 : 0,
      violationDurationMs: gate === 'G3' && g3ViolationRatio > 0 ? 800 : 0,
      violationRatio: gate === 'G3' ? g3ViolationRatio : 0,
    })),
    g3ViolationRatio,
    invalidReasons,
    excludeFromTrends: status !== 'VALID',
  };
}

function vulnerability(resultId, ids = []) {
  return {
    ruleVersion: 'stage2_vulnerability.v1',
    activeIds: ids,
    evidence: ids.map((id) => ({
      vulnerabilityId: id,
      sourceResultId: resultId,
      measurements: { observed: 1 },
    })),
  };
}

function chairResult({
  resultId = 'chair-result-1',
  status = 'VALID',
  repetitions = 12,
  ids = ['V3'],
  armUse = { occurrenceCount: 0, restartUsed: false, outcome: 'NOT_DETECTED' },
  cdcScoredRepetitions = repetitions,
  qualitySummary = quality(status),
} = {}) {
  return {
    resultId,
    attemptId: 'chair-attempt-1',
    analysisSessionId: 'chair-analysis-1',
    assessmentType: FunctionalTestSlots.ChairStand,
    status,
    source: 'LIVE_POSE',
    completedAt: 10_000,
    operationalConfigVersion: STAGE2_OPERATIONAL_RULE_VERSION,
    calibration: calibration(FunctionalTestSlots.ChairStand),
    quality: qualitySummary,
    chairStand: {
      observedRepetitions: repetitions,
      completedRepetitions: repetitions,
      finalRepetitionCredit: 0,
      finalState: 'SIT',
      armUse,
      cdcScoredRepetitions,
    },
    vulnerabilityAssessment: vulnerability(resultId, ids),
  };
}

function sway(index = 0) {
  return {
    mlRmsM: 0.01 + index * 0.001,
    apRmsM: 0.005 + index * 0.001,
    initialRmsM: 0.02 + index * 0.001,
    staticRmsM: 0.01 + index * 0.001,
    initialToStaticRatio: 2 - index * 0.1,
    mlToApRatio: 2 - index * 0.05,
  };
}

function balanceResult({ resultId = 'balance-result-1', status = 'VALID', ids = ['V1', 'V2'] } = {}) {
  const stages = ['SIDE_BY_SIDE', 'SEMI_TANDEM', 'TANDEM', 'ONE_LEG'].map((stage, index) => ({
    stage,
    onsetLatencyMs: 500 + index * 100,
    holdSeconds: stage === 'TANDEM' ? 8 : 10,
    status: stage === 'TANDEM' ? 'FAILED' : stage === 'ONE_LEG' ? 'NOT_ATTEMPTED' : 'PASSED',
    failureCode: stage === 'TANDEM' ? 'F2' : null,
    failureReason: stage === 'TANDEM' ? 'POSITION_LOST' : null,
    sway: stage === 'ONE_LEG' ? null : sway(index),
  }));
  return {
    resultId,
    attemptId: 'balance-attempt-1',
    analysisSessionId: 'balance-analysis-1',
    assessmentType: FunctionalTestSlots.FourStageBalance,
    status,
    source: 'LIVE_POSE',
    completedAt: 20_000,
    operationalConfigVersion: STAGE2_OPERATIONAL_RULE_VERSION,
    calibration: calibration(FunctionalTestSlots.FourStageBalance),
    quality: quality(status),
    balance: { stages },
    vulnerabilityAssessment: vulnerability(resultId, ids),
  };
}

function finalPayload(result) {
  return {
    sessionId: 'connection-stage2',
    analysisSessionId: result.analysisSessionId,
    attemptId: result.attemptId,
    assessmentType: result.assessmentType,
    testType: result.assessmentType,
    source: 'LIVE_POSE',
    status: result.status,
    resultType: 'FINAL_RESULT',
    analyzerFinalEvent: true,
    isPersistable: result.status === 'VALID',
    startedAt: result.completedAt - 5_000,
    completedAt: result.completedAt,
    stage2Result: result,
  };
}

// S2-CONTRACT-01: strict type-specific normalization and assessment-aware calibration.
const chair = normalizeStage2Result(chairResult());
const balance = normalizeStage2Result(balanceResult());
assert.equal(chair.chairStand.cdcScoredRepetitions, 12);
assert.equal(balance.calibration.hSitM, null, 'Balance does not fabricate pre-chair H_sit');
assert.equal(balance.balance.stages[2].stage, 'TANDEM');
assert.equal(balance.balance.stages[2].failureCode, 'F2', 'S2-BAL-F2 uses the protocol failure ID');
assert.equal(balance.balance.stages[2].failureReason, 'POSITION_LOST', 'S2-BAL-F2 preserves machine-readable detail separately');
assert.deepEqual(
  balance.balance.stages.map((stage) => stage.sway?.mlRmsM ?? null),
  [0.01, 0.011, 0.012, null],
  'S2-BAL-SWAY preserves distinct per-stage RMS values',
);
assert.match(chair.resultHash, /^[a-f0-9]{64}$/);
assert.throws(
  () => normalizeStage2Result({ ...chairResult(), calibration: { ...calibration(FunctionalTestSlots.ChairStand), dFoldM: null } }),
  /calibration\.dFoldM/,
  'Chair requires D_fold',
);
assert.throws(
  () => normalizeStage2Result({ ...chairResult(), operationalConfigVersion: 'stage2_operational.v0' }),
  /operationalConfigVersion/,
  'operational version is exact',
);
assert.throws(
  () => normalizeStage2Result({ ...chairResult(), quality: { ...quality(), gates: quality().gates.slice(0, 4) } }),
  /quality\.gates/,
  'all G1-G5 summaries are required',
);

// S2-CONTRACT-01: runtime normalization is as strict as additionalProperties:false.
for (const [label, value] of [
  ['root', { ...chairResult(), unexpected: true }],
  ['calibration', { ...chairResult(), calibration: { ...calibration(FunctionalTestSlots.ChairStand), unexpected: true } }],
  ['quality gate', { ...chairResult(), quality: { ...quality(), gates: quality().gates.map((gate, index) => index === 0 ? { ...gate, unexpected: true } : gate) } }],
  ['arm use', { ...chairResult(), chairStand: { ...chairResult().chairStand, armUse: { ...chairResult().chairStand.armUse, unexpected: true } } }],
  ['balance stage', { ...balanceResult(), balance: { stages: balanceResult().balance.stages.map((stage, index) => index === 0 ? { ...stage, unexpected: true } : stage) } }],
  ['sway', { ...balanceResult(), balance: { stages: balanceResult().balance.stages.map((stage, index) => index === 0 ? { ...stage, sway: { ...stage.sway, unexpected: true } } : stage) } }],
]) {
  assert.throws(() => normalizeStage2Result(value), /is not allowed/, `S2-CONTRACT-STRICT rejects unknown ${label} fields`);
}
const missingFailureReason = balanceResult();
delete missingFailureReason.balance.stages[0].failureReason;
assert.throws(
  () => normalizeStage2Result(missingFailureReason),
  /failureReason is required/,
  'S2-BAL-F1-F5 requires the nullable failureReason field on every stage',
);

// S2-Q-G3R: exactly 20% remains valid; any greater ratio is invalid and excluded.
const qualityAtBoundary = quality('VALID', { g3ViolationRatio: 0.2, invalidReasons: [] });
assert.equal(normalizeStage2Result(chairResult({ qualitySummary: qualityAtBoundary })).status, 'VALID', 'S2-Q-G3R 20.000% is valid');
assert.throws(
  () => normalizeStage2Result(chairResult({
    qualitySummary: quality('VALID', { g3ViolationRatio: 0.20001, invalidReasons: [] }),
  })),
  /greater than 0\.20/,
  'S2-Q-G3R greater than 20% cannot be VALID',
);
const qualityOverBoundary = normalizeStage2Result(chairResult({
  resultId: 'chair-quality-invalid',
  status: 'INVALID',
  ids: [],
  qualitySummary: quality('INVALID', { g3ViolationRatio: 0.20001, invalidReasons: ['G3_VIOLATION_RATIO_EXCEEDED'] }),
}));
assert.equal(qualityOverBoundary.quality.excludeFromTrends, true, 'S2-Q-G3R invalid result is excluded from trends');

// S2-CHAIR-04: first arm use consumes one restart; second is a valid CDC zero result with V6.
const firstArmUse = normalizeStage2Result(chairResult({
  resultId: 'chair-arm-first',
  status: 'INVALID',
  ids: [],
  armUse: { occurrenceCount: 1, restartUsed: true, outcome: 'RESTART_REQUIRED' },
  qualitySummary: quality('INVALID', { g3ViolationRatio: 0, invalidReasons: ['ARM_USE_RESTART_REQUIRED'] }),
}));
assert.equal(firstArmUse.chairStand.armUse.outcome, 'RESTART_REQUIRED', 'S2-CHAIR-04 first occurrence requires restart');
const secondArmUse = normalizeStage2Result(chairResult({
  resultId: 'chair-arm-second',
  ids: ['V6'],
  armUse: { occurrenceCount: 2, restartUsed: true, outcome: 'DISQUALIFIED' },
  cdcScoredRepetitions: 0,
}));
assert.equal(secondArmUse.status, 'VALID', 'S2-CHAIR-04 second occurrence remains clinically scorable');
assert.equal(secondArmUse.chairStand.cdcScoredRepetitions, 0, 'S2-CHAIR-04 second occurrence is CDC zero');
assert.ok(secondArmUse.vulnerabilityAssessment.activeIds.includes('V6'), 'S2-CHAIR-04 second occurrence carries V6');
assert.throws(
  () => normalizeStage2Result(chairResult({
    ids: [],
    armUse: { occurrenceCount: 2, restartUsed: true, outcome: 'DISQUALIFIED' },
    cdcScoredRepetitions: 0,
  })),
  /must include V6/,
  'S2-CHAIR-04 disqualified arm use cannot omit V6',
);

// S2-CONTRACT-01: stable canonical hash does not depend on object key insertion order.
assert.equal(canonicalHash({ b: 2, a: 1 }), canonicalHash({ a: 1, b: 2 }));

// S2-CONTRACT-01: operational context survives reducer revisions and v1 empty snapshots upcast.
let session = createAssessmentSession({
  assessmentSessionId: 'assessment-stage2',
  connectionSessionId: 'connection-stage2',
  profileId: 'profile-stage2',
  profile: { age: 72, gender: 'FEMALE' },
  createdAt: 1,
});
assert.equal(session.schemaVersion, ASSESSMENT_SESSION_SCHEMA_VERSION);
session = reduceAssessmentSession(session, {
  type: AssessmentSessionEventTypes.OperationalContextUpdated,
  messageId: 'operational-context-1',
  operationalContext: {
    operationalConfigVersion: STAGE2_OPERATIONAL_RULE_VERSION,
    supportRoiNormalized: { x: 0.8, y: 0.2, width: 0.18, height: 0.5 },
  },
  at: 2,
});
assert.equal(session.operationalContext.operationalConfigVersion, STAGE2_OPERATIONAL_RULE_VERSION);
assert.deepEqual(session.operationalContext.supportRoiNormalized, { x: 0.8, y: 0.2, width: 0.18, height: 0.5 });
const legacy = { ...createAssessmentSession({ assessmentSessionId: 'legacy', profileId: 'p', createdAt: 1 }) };
legacy.schemaVersion = 'assessment_session.v1';
delete legacy.operationalContext;
delete legacy.vulnerabilityAssessment;
const upcast = upcastAssessmentSessionV1(legacy);
assert.equal(upcast.schemaVersion, 'assessment_session.v2');
assert.deepEqual(upcast.operationalContext, { operationalConfigVersion: null, supportRoiNormalized: null });

// S2-CONTRACT-02: invalid result is retained only on its attempt and excluded from trends.
const invalidConnection = {
  id: 'connection-stage2-invalid',
  profile: { id: 'profile-invalid', age: 72, gender: 'FEMALE' },
  assessmentSession: createAssessmentSession({ assessmentSessionId: 'assessment-invalid', profileId: 'profile-invalid', profile: { age: 72, gender: 'FEMALE' }, createdAt: 1 }),
};
const invalidStage2 = chairResult({ resultId: 'chair-invalid-1', status: 'INVALID', ids: [] });
const invalidAccepted = assessmentSessionService.acceptFinalResult(invalidConnection, finalPayload(invalidStage2));
assert.equal(invalidAccepted.reason, 'INVALID_TEST_RESULT_RECORDED');
assert.equal(invalidAccepted.excludeFromTrends, true);
const invalidSlot = invalidAccepted.assessmentSession.functionalTests[FunctionalTestSlots.ChairStand];
assert.equal(invalidSlot.acceptedResult, null);
assert.equal(invalidSlot.status, 'NEEDS_RETRY');
assert.equal(invalidSlot.attempts[0].result.resultId, 'chair-invalid-1');
assert.equal(invalidSlot.attempts[0].result.quality.excludeFromTrends, true);
const invalidDuplicate = assessmentSessionService.acceptFinalResult(invalidConnection, finalPayload(invalidStage2));
assert.equal(invalidDuplicate.duplicate, true, 'canonical invalid result receipt is idempotent');

// S2-CONTRACT-02: valid receipt hashes deduplicate independent of resultId and detect resultId conflicts.
const validConnection = {
  id: 'connection-stage2-valid',
  profile: { id: 'profile-valid', age: 72, gender: 'FEMALE' },
  assessmentSession: createAssessmentSession({ assessmentSessionId: 'assessment-valid', profileId: 'profile-valid', profile: { age: 72, gender: 'FEMALE' }, createdAt: 1 }),
};
const first = assessmentSessionService.acceptFinalResult(validConnection, finalPayload(chairResult()));
assert.equal(first.applied, true);
assert.deepEqual(first.assessmentSession.vulnerabilityAssessment.activeIds, ['V3'], 'server carries core vulnerability result');
const changedIdOnly = chairResult({ resultId: 'chair-result-transport-alias' });
const duplicateByHash = assessmentSessionService.acceptFinalResult(validConnection, finalPayload(changedIdOnly));
assert.equal(duplicateByHash.duplicate, true, 'canonical content hash deduplicates transport aliases');
const conflict = assessmentSessionService.acceptFinalResult(validConnection, finalPayload(chairResult({ repetitions: 11 })));
assert.equal(conflict.reason, 'RESULT_CONFLICT');

// S2-CONTRACT-01: reducer merges, but does not derive, V1-V9 output from accepted results.
const acceptedBalance = assessmentSessionService.acceptFinalResult(validConnection, finalPayload(balanceResult()));
assert.equal(acceptedBalance.applied, true);
assert.deepEqual(acceptedBalance.assessmentSession.vulnerabilityAssessment.activeIds, ['V1', 'V2', 'V3']);

// S2-CONTRACT-02: persistence keeps invalid raw normalized result, never accepted/final, and marks trend exclusion.
const persistenceHistory = [];
const persistenceSession = {
  id: 'connection-stage2',
  profile: { id: 'profile-persist', age: 72, gender: 'FEMALE' },
  assessmentSession: createAssessmentSession({ assessmentSessionId: 'assessment-persist', profileId: 'profile-persist', profile: { age: 72, gender: 'FEMALE' }, createdAt: 1 }),
};
const persistenceResult = saveAssessmentResult(finalPayload(invalidStage2), {
  session: persistenceSession,
  addHistoryItem: (item) => persistenceHistory.push(item),
  broadcast: () => {},
  publicSession: (value) => value,
});
assert.equal(persistenceResult.invalidAttempt, true);
assert.equal(persistenceResult.aggregateComplete, false);
assert.equal(persistenceResult.result.excludeFromTrends, true);
assert.equal(persistenceHistory.length, 1, 'invalid normalized attempt is preserved');
assert.equal(persistenceSession.finalResult, undefined, 'invalid attempt cannot become aggregate final');

// S2-CONTRACT-01: the server advertises v2 in the QR/API connection contract.
const qrBundle = await sessionService.createSession('https://127.0.0.1:3000');
const qrPayload = JSON.parse(qrBundle.qrPayload);
assert.equal(qrPayload.version, 3);
assert.equal(qrPayload.connectionSessionId, qrPayload.sessionId);
assert.equal(qrPayload.assessmentSessionSchemaVersion, 'assessment_session.v2');

console.log('Stage 2 contract checks passed: S2-CONTRACT-01, S2-CONTRACT-STRICT, S2-Q-G3R, S2-CHAIR-04, S2-BAL-F1-F5, S2-BAL-SWAY, S2-CONTRACT-02.');
