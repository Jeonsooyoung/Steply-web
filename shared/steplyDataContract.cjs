'use strict';

const STEPLY_DATA_CONTRACT_SCHEMA_VERSION = 'steply_data_contract.v1';
const SCORED_RISK_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH']);
const VULNERABILITY_IDS = Object.freeze(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9']);
const BALANCE_STAGES = Object.freeze(['SIDE_BY_SIDE', 'SEMI_TANDEM', 'TANDEM', 'ONE_LEG']);

function fail(path, message) {
  const error = new Error(`${path} ${message}`);
  error.code = 'INVALID_STEPLY_DATA_CONTRACT';
  error.path = path;
  throw error;
}

function strictObject(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !keys.includes(key));
  if (unknown) fail(`${path}.${unknown}`, 'is not allowed');
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${path}.${key}`, 'is required');
  }
  return value;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  return value;
}

function integer(value, path, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(path, `must be an integer >= ${minimum}`);
  return value;
}

function finite(value, path, minimum = 0, maximum = Number.POSITIVE_INFINITY) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function oneOf(value, allowed, path, nullable = false) {
  if (value === null && nullable) return null;
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join(', ')}`);
  return value;
}

function array(value, path, maximum = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `must be an array with at most ${maximum} items`);
  return value;
}

function uniqueEnumArray(value, allowed, path) {
  const result = array(value, path).map((item, index) => oneOf(item, allowed, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail(path, 'must not contain duplicates');
  return result;
}

function normalizeProfile(value, path) {
  const source = strictObject(value, path, ['id', 'displayName', 'birthYear', 'sex']);
  return {
    id: text(source.id, `${path}.id`),
    displayName: text(source.displayName, `${path}.displayName`),
    birthYear: integer(source.birthYear, `${path}.birthYear`, 1900),
    sex: oneOf(source.sex, ['MALE', 'FEMALE'], `${path}.sex`, true),
  };
}

function normalizeBalanceHoldSeconds(value, path) {
  const source = strictObject(value, path, BALANCE_STAGES);
  return Object.fromEntries(BALANCE_STAGES.map((stage) => [stage, finite(source[stage], `${path}.${stage}`, 0, 10)]));
}

function normalizeAssessment(value, path) {
  const source = strictObject(value, path, [
    'assessmentSessionId', 'completedAt', 'risk', 'vulnerabilityIds', 'valid',
    'chairStandRepetitions', 'balanceSecondsByStage',
  ]);
  if (source.valid !== true) fail(`${path}.valid`, 'must be true; invalid attempts remain on Mobile only');
  return {
    assessmentSessionId: text(source.assessmentSessionId, `${path}.assessmentSessionId`),
    completedAt: integer(source.completedAt, `${path}.completedAt`),
    risk: oneOf(source.risk, SCORED_RISK_LEVELS, `${path}.risk`),
    vulnerabilityIds: uniqueEnumArray(source.vulnerabilityIds, VULNERABILITY_IDS, `${path}.vulnerabilityIds`),
    valid: true,
    chairStandRepetitions: integer(source.chairStandRepetitions, `${path}.chairStandRepetitions`),
    balanceSecondsByStage: normalizeBalanceHoldSeconds(source.balanceSecondsByStage, `${path}.balanceSecondsByStage`),
  };
}

function normalizeSteplyDataContract(value, path = 'dataContract') {
  const source = strictObject(value, path, ['schemaVersion', 'profile', 'recentAssessments', 'generatedAt']);
  const profile = normalizeProfile(source.profile, `${path}.profile`);
  const recentAssessments = array(source.recentAssessments, `${path}.recentAssessments`, 5)
    .map((item, index) => normalizeAssessment(item, `${path}.recentAssessments[${index}]`));
  if (new Set(recentAssessments.map((item) => item.assessmentSessionId)).size !== recentAssessments.length) {
    fail(`${path}.recentAssessments`, 'must not repeat assessmentSessionId');
  }
  for (let index = 1; index < recentAssessments.length; index += 1) {
    if (recentAssessments[index - 1].completedAt > recentAssessments[index].completedAt) {
      fail(`${path}.recentAssessments`, 'must be ordered oldest to newest');
    }
  }
  return {
    schemaVersion: oneOf(
      source.schemaVersion,
      [STEPLY_DATA_CONTRACT_SCHEMA_VERSION],
      `${path}.schemaVersion`,
    ),
    profile,
    recentAssessments,
    generatedAt: integer(source.generatedAt, `${path}.generatedAt`),
  };
}

module.exports = {
  STEPLY_DATA_CONTRACT_SCHEMA_VERSION,
  BALANCE_STAGES,
  SCORED_RISK_LEVELS,
  VULNERABILITY_IDS,
  normalizeSteplyDataContract,
};
