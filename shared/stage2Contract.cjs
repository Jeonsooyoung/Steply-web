'use strict';

const crypto = require('crypto');
const stage2AnalysisConfig = require('./stage2Analysis.config.json');
const stage2Operational = stage2AnalysisConfig.operational;

const ASSESSMENT_SESSION_V2_SCHEMA_VERSION = 'assessment_session.v2';
const STAGE2_RESULT_SCHEMA_VERSION = 'stage2_assessment_result.v1';
const STAGE2_OPERATIONAL_RULE_VERSION = stage2AnalysisConfig.version;

const Stage2ResultStatuses = Object.freeze({
  Valid: 'VALID',
  Invalid: 'INVALID',
  TrackingFailed: 'TRACKING_FAILED',
});

const BALANCE_FAILURE_CODES = Object.freeze(['F1', 'F2', 'F3', 'F4', 'F5']);
const VULNERABILITY_IDS = Object.freeze(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9']);
const G3_INVALID_RATIO_EXCLUSIVE = stage2Operational.quality.invalidViolationRatioExclusive;

function fail(path, message) {
  const error = new Error(`${path} ${message}`);
  error.code = 'INVALID_STAGE2_RESULT';
  throw error;
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value;
}

function strictObject(value, path, allowedKeys) {
  const source = object(value, path);
  const unknownKeys = Object.keys(source).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length) fail(`${path}.${unknownKeys[0]}`, 'is not allowed');
  return source;
}

function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, 'must contain unique values');
  return values;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  return value.trim();
}

function number(value, path, { minimum = -Infinity, maximum = Infinity, integer = false, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
  if (integer && !Number.isInteger(value)) fail(path, 'must be an integer');
  if (value < minimum || value > maximum) fail(path, `must be between ${minimum} and ${maximum}`);
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function enumValue(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join(', ')}`);
  return value;
}

function nullableRoi(value, path = 'supportRoiNormalized') {
  if (value === null || value === undefined) return null;
  const source = strictObject(value, path, ['x', 'y', 'width', 'height']);
  const roi = {
    x: number(source.x, `${path}.x`, { minimum: 0, maximum: 1 }),
    y: number(source.y, `${path}.y`, { minimum: 0, maximum: 1 }),
    width: number(source.width, `${path}.width`, { minimum: 0, maximum: 1 }),
    height: number(source.height, `${path}.height`, { minimum: 0, maximum: 1 }),
  };
  if (roi.width <= 0 || roi.height <= 0 || roi.x + roi.width > 1 || roi.y + roi.height > 1) {
    fail(path, 'must be a positive rectangle fully contained in normalized image coordinates');
  }
  return roi;
}

function normalizeOperationalContext(value = {}) {
  const source = strictObject(value, 'operationalContext', ['operationalConfigVersion', 'supportRoiNormalized']);
  return {
    operationalConfigVersion: source.operationalConfigVersion === null || source.operationalConfigVersion === undefined
      ? null
      : enumValue(source.operationalConfigVersion, [STAGE2_OPERATIONAL_RULE_VERSION], 'operationalContext.operationalConfigVersion'),
    supportRoiNormalized: nullableRoi(source.supportRoiNormalized, 'operationalContext.supportRoiNormalized'),
  };
}

function normalizeCalibration(value, assessmentType) {
  const source = strictObject(value, 'calibration', [
    'sampledDurationMs', 'lFootM', 'hStandM', 'hSitM', 'wShoulderM', 'dFoldM', 'supportRoiNormalized',
  ]);
  return {
    sampledDurationMs: number(source.sampledDurationMs, 'calibration.sampledDurationMs', {
      minimum: stage2Operational.calibration.neutralStandingMs,
      integer: true,
    }),
    lFootM: number(source.lFootM, 'calibration.lFootM', { minimum: 0.000001 }),
    hStandM: number(source.hStandM, 'calibration.hStandM'),
    hSitM: number(source.hSitM, 'calibration.hSitM', { nullable: assessmentType === 'FOUR_STAGE_BALANCE' }),
    wShoulderM: number(source.wShoulderM, 'calibration.wShoulderM', { minimum: 0.000001 }),
    dFoldM: number(source.dFoldM, 'calibration.dFoldM', { minimum: 0.000001, nullable: assessmentType === 'FOUR_STAGE_BALANCE' }),
    supportRoiNormalized: nullableRoi(source.supportRoiNormalized, 'calibration.supportRoiNormalized'),
  };
}

function normalizeQuality(value, status) {
  const source = strictObject(value, 'quality', ['gates', 'g3ViolationRatio', 'invalidReasons', 'excludeFromTrends']);
  if (!Array.isArray(source.gates) || source.gates.length !== 5) fail('quality.gates', 'must contain exactly G1 through G5');
  const gateOrder = ['G1', 'G2', 'G3', 'G4', 'G5'];
  const gates = source.gates.map((item, index) => {
    const gate = strictObject(item, `quality.gates[${index}]`, [
      'gate', 'violationFrameCount', 'violationDurationMs', 'violationRatio',
    ]);
    if (gate.gate !== gateOrder[index]) fail(`quality.gates[${index}].gate`, `must be ${gateOrder[index]}`);
    return {
      gate: gate.gate,
      violationFrameCount: number(gate.violationFrameCount, `quality.gates[${index}].violationFrameCount`, { minimum: 0, integer: true }),
      violationDurationMs: number(gate.violationDurationMs, `quality.gates[${index}].violationDurationMs`, { minimum: 0 }),
      violationRatio: number(gate.violationRatio, `quality.gates[${index}].violationRatio`, { minimum: 0, maximum: 1 }),
    };
  });
  const invalidReasons = Array.isArray(source.invalidReasons)
    ? unique(source.invalidReasons.map((reason, index) => text(reason, `quality.invalidReasons[${index}]`)), 'quality.invalidReasons')
    : fail('quality.invalidReasons', 'must be an array');
  const excludeFromTrends = boolean(source.excludeFromTrends, 'quality.excludeFromTrends');
  const g3ViolationRatio = number(source.g3ViolationRatio, 'quality.g3ViolationRatio', { minimum: 0, maximum: 1 });
  const g3Gate = gates[2];
  if (g3Gate.violationRatio !== g3ViolationRatio) fail('quality.g3ViolationRatio', 'must equal the G3 gate violationRatio');
  if (status === Stage2ResultStatuses.Valid && excludeFromTrends) fail('quality.excludeFromTrends', 'must be false for VALID results');
  if (status !== Stage2ResultStatuses.Valid && !excludeFromTrends) fail('quality.excludeFromTrends', 'must be true for invalid results');
  if (g3ViolationRatio > G3_INVALID_RATIO_EXCLUSIVE) {
    if (status === Stage2ResultStatuses.Valid) fail('quality.g3ViolationRatio', 'greater than 0.20 requires an invalid result');
    if (!invalidReasons.includes('G3_VIOLATION_RATIO_EXCEEDED')) {
      fail('quality.invalidReasons', 'must include G3_VIOLATION_RATIO_EXCEEDED when G3 is greater than 0.20');
    }
  } else if (invalidReasons.includes('G3_VIOLATION_RATIO_EXCEEDED')) {
    fail('quality.invalidReasons', 'cannot include G3_VIOLATION_RATIO_EXCEEDED at or below 0.20');
  }
  return {
    gates,
    g3ViolationRatio,
    invalidReasons,
    excludeFromTrends,
  };
}

function normalizeVulnerabilityAssessment(value) {
  if (value === null || value === undefined) return null;
  const source = strictObject(value, 'vulnerabilityAssessment', ['ruleVersion', 'activeIds', 'evidence']);
  const activeIds = Array.isArray(source.activeIds)
    ? unique(source.activeIds.map((id, index) => enumValue(id, VULNERABILITY_IDS, `vulnerabilityAssessment.activeIds[${index}]`)), 'vulnerabilityAssessment.activeIds')
    : fail('vulnerabilityAssessment.activeIds', 'must be an array');
  if (!Array.isArray(source.evidence)) fail('vulnerabilityAssessment.evidence', 'must be an array');
  const evidence = source.evidence.map((item, index) => {
      const evidence = strictObject(item, `vulnerabilityAssessment.evidence[${index}]`, [
        'vulnerabilityId', 'sourceResultId', 'measurements',
      ]);
      return {
        vulnerabilityId: enumValue(evidence.vulnerabilityId, VULNERABILITY_IDS, `vulnerabilityAssessment.evidence[${index}].vulnerabilityId`),
        sourceResultId: evidence.sourceResultId == null ? null : text(evidence.sourceResultId, `vulnerabilityAssessment.evidence[${index}].sourceResultId`),
        measurements: object(evidence.measurements, `vulnerabilityAssessment.evidence[${index}].measurements`),
      };
    });
  const evidenceIds = new Set(evidence.map((item) => item.vulnerabilityId));
  if (activeIds.some((id) => !evidenceIds.has(id)) || [...evidenceIds].some((id) => !activeIds.includes(id))) {
    fail('vulnerabilityAssessment.evidence', 'must cover exactly the activeIds');
  }
  return {
    ruleVersion: text(source.ruleVersion, 'vulnerabilityAssessment.ruleVersion'),
    activeIds,
    evidence,
  };
}

function normalizeChairStand(value) {
  const source = strictObject(value, 'chairStand', [
    'observedRepetitions', 'completedRepetitions', 'finalRepetitionCredit', 'finalState', 'armUse', 'cdcScoredRepetitions',
  ]);
  const armUse = strictObject(source.armUse, 'chairStand.armUse', ['occurrenceCount', 'restartUsed', 'outcome']);
  const normalized = {
    observedRepetitions: number(source.observedRepetitions, 'chairStand.observedRepetitions', { minimum: 0, integer: true }),
    completedRepetitions: number(source.completedRepetitions, 'chairStand.completedRepetitions', { minimum: 0, integer: true }),
    finalRepetitionCredit: enumValue(source.finalRepetitionCredit, [0, 1], 'chairStand.finalRepetitionCredit'),
    finalState: enumValue(source.finalState, ['SIT', 'RISING', 'STAND', 'DESCENDING'], 'chairStand.finalState'),
    armUse: {
      occurrenceCount: number(armUse.occurrenceCount, 'chairStand.armUse.occurrenceCount', { minimum: 0, integer: true }),
      restartUsed: boolean(armUse.restartUsed, 'chairStand.armUse.restartUsed'),
      outcome: enumValue(armUse.outcome, ['NOT_DETECTED', 'RESTART_REQUIRED', 'DISQUALIFIED', 'NOT_MEASURABLE'], 'chairStand.armUse.outcome'),
    },
    cdcScoredRepetitions: number(source.cdcScoredRepetitions, 'chairStand.cdcScoredRepetitions', { minimum: 0, integer: true }),
  };
  if (normalized.cdcScoredRepetitions > normalized.completedRepetitions) {
    fail('chairStand.cdcScoredRepetitions', 'cannot exceed completedRepetitions');
  }
  const { occurrenceCount, restartUsed, outcome } = normalized.armUse;
  if (occurrenceCount > 2) fail('chairStand.armUse.occurrenceCount', 'cannot exceed 2');
  if (outcome === 'RESTART_REQUIRED' && (occurrenceCount !== 1 || !restartUsed)) {
    fail('chairStand.armUse', 'RESTART_REQUIRED requires occurrenceCount 1 and restartUsed true');
  }
  if (outcome === 'DISQUALIFIED' && (occurrenceCount !== 2 || !restartUsed || normalized.cdcScoredRepetitions !== 0)) {
    fail('chairStand.armUse', 'DISQUALIFIED requires occurrenceCount 2, restartUsed true, and CDC score 0');
  }
  if (['NOT_DETECTED', 'NOT_MEASURABLE'].includes(outcome) && (occurrenceCount !== 0 || restartUsed)) {
    fail('chairStand.armUse', `${outcome} requires occurrenceCount 0 and restartUsed false`);
  }
  return normalized;
}

function normalizeSway(value, path) {
  if (value === null || value === undefined) return null;
  const source = strictObject(value, path, [
    'mlRmsM', 'apRmsM', 'initialRmsM', 'staticRmsM', 'initialToStaticRatio', 'mlToApRatio',
  ]);
  return {
    mlRmsM: number(source.mlRmsM, `${path}.mlRmsM`, { minimum: 0, nullable: true }),
    apRmsM: number(source.apRmsM, `${path}.apRmsM`, { minimum: 0, nullable: true }),
    initialRmsM: number(source.initialRmsM, `${path}.initialRmsM`, { minimum: 0, nullable: true }),
    staticRmsM: number(source.staticRmsM, `${path}.staticRmsM`, { minimum: 0, nullable: true }),
    initialToStaticRatio: number(source.initialToStaticRatio, `${path}.initialToStaticRatio`, { minimum: 0, nullable: true }),
    mlToApRatio: number(source.mlToApRatio, `${path}.mlToApRatio`, { minimum: 0, nullable: true }),
  };
}

function normalizeBalance(value) {
  const source = strictObject(value, 'balance', ['stages']);
  if (!Array.isArray(source.stages) || source.stages.length !== 4) fail('balance.stages', 'must contain exactly four stages');
  const expected = ['SIDE_BY_SIDE', 'SEMI_TANDEM', 'TANDEM', 'ONE_LEG'];
  const stages = source.stages.map((item, index) => {
    const stage = strictObject(item, `balance.stages[${index}]`, [
      'stage', 'onsetLatencyMs', 'holdSeconds', 'status', 'failureCode', 'failureReason', 'sway',
    ]);
    if (!Object.hasOwn(stage, 'failureCode')) fail(`balance.stages[${index}].failureCode`, 'is required');
    if (!Object.hasOwn(stage, 'failureReason')) fail(`balance.stages[${index}].failureReason`, 'is required');
    if (stage.stage !== expected[index]) fail(`balance.stages[${index}].stage`, `must be ${expected[index]}`);
    return {
      stage: stage.stage,
      onsetLatencyMs: number(stage.onsetLatencyMs, `balance.stages[${index}].onsetLatencyMs`, { minimum: 0, nullable: true }),
      holdSeconds: number(stage.holdSeconds, `balance.stages[${index}].holdSeconds`, { minimum: 0, maximum: 10 }),
      status: enumValue(stage.status, ['PASSED', 'FAILED', 'UNABLE_TO_ASSUME', 'NOT_ATTEMPTED', 'INVALID'], `balance.stages[${index}].status`),
      failureCode: stage.failureCode == null ? null : enumValue(stage.failureCode, BALANCE_FAILURE_CODES, `balance.stages[${index}].failureCode`),
      failureReason: stage.failureReason == null ? null : text(stage.failureReason, `balance.stages[${index}].failureReason`),
      sway: normalizeSway(stage.sway, `balance.stages[${index}].sway`),
    };
  });
  return { stages };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function normalizeStage2Result(input = {}, { assessmentType, attemptId, analysisSessionId, resultId } = {}) {
  const source = strictObject(input, 'stage2Result', [
    'resultSchemaVersion', 'resultHash', 'resultId', 'attemptId', 'analysisSessionId', 'assessmentType', 'status', 'source',
    'completedAt', 'operationalConfigVersion', 'calibration', 'quality', 'vulnerabilityAssessment', 'chairStand', 'balance',
  ]);
  if (source.resultSchemaVersion !== undefined && source.resultSchemaVersion !== STAGE2_RESULT_SCHEMA_VERSION) {
    fail('resultSchemaVersion', `must be ${STAGE2_RESULT_SCHEMA_VERSION}`);
  }
  const resolvedAssessmentType = assessmentType || source.assessmentType;
  const resolvedStatus = enumValue(source.status, Object.values(Stage2ResultStatuses), 'status');
  const common = {
    resultSchemaVersion: STAGE2_RESULT_SCHEMA_VERSION,
    resultId: text(resultId || source.resultId, 'resultId'),
    attemptId: text(attemptId || source.attemptId, 'attemptId'),
    analysisSessionId: text(analysisSessionId || source.analysisSessionId, 'analysisSessionId'),
    assessmentType: enumValue(resolvedAssessmentType, ['CHAIR_STAND_30S', 'FOUR_STAGE_BALANCE'], 'assessmentType'),
    status: resolvedStatus,
    source: enumValue(source.source, ['LIVE_POSE', 'REPLAY'], 'source'),
    completedAt: number(source.completedAt, 'completedAt', { minimum: 0, integer: true }),
    operationalConfigVersion: enumValue(source.operationalConfigVersion, [STAGE2_OPERATIONAL_RULE_VERSION], 'operationalConfigVersion'),
    calibration: normalizeCalibration(source.calibration, resolvedAssessmentType),
    quality: normalizeQuality(source.quality, resolvedStatus),
    vulnerabilityAssessment: normalizeVulnerabilityAssessment(source.vulnerabilityAssessment),
  };
  if (common.assessmentType === 'CHAIR_STAND_30S') {
    if (source.balance !== undefined) fail('balance', 'is not allowed for CHAIR_STAND_30S');
    common.chairStand = normalizeChairStand(source.chairStand);
    const outcome = common.chairStand.armUse.outcome;
    if (outcome === 'RESTART_REQUIRED' && common.status === Stage2ResultStatuses.Valid) {
      fail('status', 'must be invalid when the first arm-use occurrence requires restart');
    }
    if (outcome === 'DISQUALIFIED') {
      if (common.status !== Stage2ResultStatuses.Valid) fail('status', 'must be VALID for a CDC zero arm-use result');
      if (!common.vulnerabilityAssessment?.activeIds.includes('V6')) {
        fail('vulnerabilityAssessment.activeIds', 'must include V6 for DISQUALIFIED arm use');
      }
    }
  } else {
    if (source.chairStand !== undefined) fail('chairStand', 'is not allowed for FOUR_STAGE_BALANCE');
    common.balance = normalizeBalance(source.balance);
  }
  const hashableVulnerability = common.vulnerabilityAssessment
    ? {
      ...common.vulnerabilityAssessment,
      evidence: common.vulnerabilityAssessment.evidence.map((evidence) => ({
        ...evidence,
        sourceResultId: evidence.sourceResultId === common.resultId ? undefined : evidence.sourceResultId,
      })),
    }
    : null;
  const resultHash = canonicalHash({
    ...common,
    resultId: undefined,
    vulnerabilityAssessment: hashableVulnerability,
  });
  if (source.resultHash !== undefined && source.resultHash !== resultHash) fail('resultHash', 'does not match canonical result content');
  return { ...common, resultHash };
}

module.exports = {
  ASSESSMENT_SESSION_V2_SCHEMA_VERSION,
  STAGE2_RESULT_SCHEMA_VERSION,
  STAGE2_OPERATIONAL_RULE_VERSION,
  BALANCE_FAILURE_CODES,
  G3_INVALID_RATIO_EXCLUSIVE,
  Stage2ResultStatuses,
  canonicalJson,
  canonicalHash,
  normalizeOperationalContext,
  normalizeStage2Result,
  normalizeVulnerabilityAssessment,
};
