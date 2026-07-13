'use strict';

const contractConfig = require('./stage4CareAgent.contract.json');

const CARE_AGENT_STATE_SCHEMA_VERSION = contractConfig.stateSchemaVersion;
const CARE_AGENT_EVENT_SCHEMA_VERSION = contractConfig.eventSchemaVersion;
const CARE_AGENT_ACTION_SCHEMA_VERSION = contractConfig.actionSchemaVersion;
const CARE_AGENT_DECISION_SCHEMA_VERSION = contractConfig.decisionSchemaVersion;
const CARE_AGENT_TOOL_RESULT_SCHEMA_VERSION = contractConfig.toolResultSchemaVersion;
const CARE_AGENT_PROJECTION_SCHEMA_VERSION = contractConfig.projectionSchemaVersion;

const RiskLevels = ['NOT_SCORABLE', 'LOW', 'MODERATE', 'HIGH'];
const VulnerabilityIds = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9'];
const ApprovalStatuses = ['NOT_REQUIRED', 'PENDING', 'APPROVED'];
const ExecutionStatuses = ['PLANNED', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'SKIPPED_DUPLICATE'];
const DecisionStatuses = ['PLANNED', 'EXECUTING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED'];
const CandidateDispositions = ['SELECTED', 'REJECTED_BY_GUARDRAIL', 'NOT_SELECTED_LOWER_PRIORITY'];
const CareAgentLoopPhases = Object.freeze([...contractConfig.loopPhases]);
const CareAgentDecisionBranches = Object.freeze([...contractConfig.decisionPriority]);
const CareAgentToolIds = Object.freeze([...contractConfig.toolIds]);
const CareAgentActionTypes = Object.freeze([...contractConfig.actionTypes]);
const CareAgentEventTypes = Object.freeze([...contractConfig.eventTypes]);

function fail(path, message) {
  const error = new Error(`${path} ${message}`);
  error.code = 'INVALID_CARE_AGENT_CONTRACT';
  error.path = path;
  throw error;
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value;
}

function strict(value, path, allowed, required = allowed) {
  const source = object(value, path);
  const unknown = Object.keys(source).find((key) => !allowed.includes(key));
  if (unknown) fail(`${path}.${unknown}`, 'is not allowed');
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(source, key)) fail(`${path}.${key}`, 'is required');
  return source;
}

function text(value, path, nullable = false) {
  if (value === null && nullable) return null;
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

function bool(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join(', ')}`);
  return value;
}

function list(value, path, maxItems = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(value) || value.length > maxItems) fail(path, `must be an array with at most ${maxItems} items`);
  return value;
}

function stringList(value, path, unique = false) {
  const result = list(value, path).map((item, index) => text(item, `${path}[${index}]`));
  if (unique && new Set(result).size !== result.length) fail(path, 'must not contain duplicates');
  return result;
}

function enumList(value, allowed, path, unique = false) {
  const result = list(value, path).map((item, index) => oneOf(item, allowed, `${path}[${index}]`));
  if (unique && new Set(result).size !== result.length) fail(path, 'must not contain duplicates');
  return result;
}

function nullableInteger(value, path) {
  return value === null ? null : integer(value, path);
}

function stringMap(value, path) {
  const source = object(value, path);
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [text(key, `${path}.key`), text(item, `${path}.${key}`)]));
}

function normalizeProfile(value, path) {
  const source = strict(value, path, ['profileId', 'birthYear', 'sex', 'sourceUpdatedAt']);
  return {
    profileId: text(source.profileId, `${path}.profileId`),
    birthYear: integer(source.birthYear, `${path}.birthYear`, 1900),
    sex: source.sex === null ? null : oneOf(source.sex, ['MALE', 'FEMALE'], `${path}.sex`),
    sourceUpdatedAt: integer(source.sourceUpdatedAt, `${path}.sourceUpdatedAt`),
  };
}

function normalizeClinicalReference(value, path) {
  const source = strict(value, path, [
    'assessmentSessionId', 'assessmentRevision', 'steadiRuleVersion', 'risk', 'vulnerabilityRuleVersion',
    'vulnerabilityIds', 'prescriptionPlanId', 'prescriptionSchemaVersion', 'professionalApprovalStatus',
    'professionalApprovalId',
  ]);
  return {
    assessmentSessionId: text(source.assessmentSessionId, `${path}.assessmentSessionId`),
    assessmentRevision: integer(source.assessmentRevision, `${path}.assessmentRevision`),
    steadiRuleVersion: text(source.steadiRuleVersion, `${path}.steadiRuleVersion`),
    risk: oneOf(source.risk, RiskLevels, `${path}.risk`),
    vulnerabilityRuleVersion: text(source.vulnerabilityRuleVersion, `${path}.vulnerabilityRuleVersion`, true),
    vulnerabilityIds: enumList(source.vulnerabilityIds, VulnerabilityIds, `${path}.vulnerabilityIds`, true),
    prescriptionPlanId: text(source.prescriptionPlanId, `${path}.prescriptionPlanId`, true),
    prescriptionSchemaVersion: text(source.prescriptionSchemaVersion, `${path}.prescriptionSchemaVersion`, true),
    professionalApprovalStatus: oneOf(source.professionalApprovalStatus, ApprovalStatuses, `${path}.professionalApprovalStatus`),
    professionalApprovalId: text(source.professionalApprovalId, `${path}.professionalApprovalId`, true),
  };
}

function normalizeAssessment(value, path) {
  const source = strict(value, path, [
    'assessmentSessionId', 'completedAt', 'chairStandRepetitions', 'tandemHoldSeconds', 'valid',
  ]);
  const valid = bool(source.valid, `${path}.valid`);
  if (!valid) fail(`${path}.valid`, 'must be true because recentAssessments contains valid assessments only');
  return {
    assessmentSessionId: text(source.assessmentSessionId, `${path}.assessmentSessionId`),
    completedAt: integer(source.completedAt, `${path}.completedAt`),
    chairStandRepetitions: integer(source.chairStandRepetitions, `${path}.chairStandRepetitions`),
    tandemHoldSeconds: finite(source.tandemHoldSeconds, `${path}.tandemHoldSeconds`, 0, 10),
    valid,
  };
}

function normalizeSafetyEvent(value, path) {
  const source = strict(value, path, ['eventId', 'type', 'occurredAt', 'active']);
  return {
    eventId: text(source.eventId, `${path}.eventId`),
    type: text(source.type, `${path}.type`),
    occurredAt: integer(source.occurredAt, `${path}.occurredAt`),
    active: bool(source.active, `${path}.active`),
  };
}

function normalizeFall(value, path) {
  const source = strict(value, path, ['eventId', 'occurredAt', 'injurious', 'unresolved']);
  return {
    eventId: text(source.eventId, `${path}.eventId`),
    occurredAt: integer(source.occurredAt, `${path}.occurredAt`),
    injurious: bool(source.injurious, `${path}.injurious`),
    unresolved: bool(source.unresolved, `${path}.unresolved`),
  };
}

function normalizeCareInputState(value, path = 'input') {
  const source = strict(value, path, [
    'profile', 'canonicalClinicalReference', 'recentAssessments', 'trend', 'adherence', 'safetyEvents',
    'fallReports', 'invalidAttemptNumerator', 'invalidAttemptDenominator', 'invalidAttemptRatio',
    'reassessmentDueAt', 'nextPlannedSessionAt', 'progressionEligible',
    'caregiverNotificationsConsented', 'perceivedAt',
  ]);
  const trend = strict(source.trend, `${path}.trend`, ['declining', 'consecutiveDeclines']);
  const adherence = strict(source.adherence, `${path}.adherence`, [
    'completedSessionsByWeek', 'targetSessionsPerWeek', 'consecutiveLowWeeks',
  ]);
  const recentAssessments = list(source.recentAssessments, `${path}.recentAssessments`, 5)
    .map((item, index) => normalizeAssessment(item, `${path}.recentAssessments[${index}]`));
  if (new Set(recentAssessments.map((item) => item.assessmentSessionId)).size !== recentAssessments.length) {
    fail(`${path}.recentAssessments`, 'must not repeat assessmentSessionId');
  }
  const invalidAttemptNumerator = integer(source.invalidAttemptNumerator, `${path}.invalidAttemptNumerator`);
  const invalidAttemptDenominator = integer(source.invalidAttemptDenominator, `${path}.invalidAttemptDenominator`);
  if (invalidAttemptNumerator > invalidAttemptDenominator) {
    fail(`${path}.invalidAttemptNumerator`, 'cannot exceed invalidAttemptDenominator');
  }
  const invalidAttemptRatio = finite(source.invalidAttemptRatio, `${path}.invalidAttemptRatio`, 0, 1);
  const expectedRatio = invalidAttemptDenominator === 0 ? 0 : invalidAttemptNumerator / invalidAttemptDenominator;
  if (Math.abs(invalidAttemptRatio - expectedRatio) > 1e-9) {
    fail(`${path}.invalidAttemptRatio`, 'must equal invalidAttemptNumerator / invalidAttemptDenominator');
  }
  return {
    profile: normalizeProfile(source.profile, `${path}.profile`),
    canonicalClinicalReference: normalizeClinicalReference(source.canonicalClinicalReference, `${path}.canonicalClinicalReference`),
    recentAssessments,
    trend: {
      declining: bool(trend.declining, `${path}.trend.declining`),
      consecutiveDeclines: integer(trend.consecutiveDeclines, `${path}.trend.consecutiveDeclines`),
    },
    adherence: {
      completedSessionsByWeek: list(adherence.completedSessionsByWeek, `${path}.adherence.completedSessionsByWeek`)
        .map((item, index) => integer(item, `${path}.adherence.completedSessionsByWeek[${index}]`)),
      targetSessionsPerWeek: integer(adherence.targetSessionsPerWeek, `${path}.adherence.targetSessionsPerWeek`, 1),
      consecutiveLowWeeks: integer(adherence.consecutiveLowWeeks, `${path}.adherence.consecutiveLowWeeks`),
    },
    safetyEvents: list(source.safetyEvents, `${path}.safetyEvents`)
      .map((item, index) => normalizeSafetyEvent(item, `${path}.safetyEvents[${index}]`)),
    fallReports: list(source.fallReports, `${path}.fallReports`)
      .map((item, index) => normalizeFall(item, `${path}.fallReports[${index}]`)),
    invalidAttemptNumerator,
    invalidAttemptDenominator,
    invalidAttemptRatio,
    reassessmentDueAt: integer(source.reassessmentDueAt, `${path}.reassessmentDueAt`),
    nextPlannedSessionAt: nullableInteger(source.nextPlannedSessionAt, `${path}.nextPlannedSessionAt`),
    progressionEligible: bool(source.progressionEligible, `${path}.progressionEligible`),
    caregiverNotificationsConsented: bool(source.caregiverNotificationsConsented, `${path}.caregiverNotificationsConsented`),
    perceivedAt: integer(source.perceivedAt, `${path}.perceivedAt`),
  };
}

function normalizeCareAgentState(value, path = 'state') {
  const source = strict(value, path, ['schemaVersion', 'profileId', 'stateVersion', 'input', 'latestDecisionId', 'updatedAt']);
  const input = normalizeCareInputState(source.input, `${path}.input`);
  const profileId = text(source.profileId, `${path}.profileId`);
  if (input.profile.profileId !== profileId) fail(`${path}.input.profile.profileId`, 'must match state.profileId');
  return {
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_STATE_SCHEMA_VERSION], `${path}.schemaVersion`),
    profileId,
    stateVersion: integer(source.stateVersion, `${path}.stateVersion`),
    input,
    latestDecisionId: text(source.latestDecisionId, `${path}.latestDecisionId`, true),
    updatedAt: integer(source.updatedAt, `${path}.updatedAt`),
  };
}

function normalizeCareAgentEvent(value, path = 'event') {
  const source = strict(value, path, [
    'schemaVersion', 'eventId', 'profileId', 'type', 'sourceEventId', 'occurredAt', 'payload',
  ]);
  return {
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_EVENT_SCHEMA_VERSION], `${path}.schemaVersion`),
    eventId: text(source.eventId, `${path}.eventId`),
    profileId: text(source.profileId, `${path}.profileId`),
    type: oneOf(source.type, CareAgentEventTypes, `${path}.type`),
    sourceEventId: text(source.sourceEventId, `${path}.sourceEventId`),
    occurredAt: integer(source.occurredAt, `${path}.occurredAt`),
    payload: stringMap(source.payload, `${path}.payload`),
  };
}

function normalizeActionPayload(value, path) {
  const source = strict(value, path, [
    'scheduledAtMs', 'messageTemplateId', 'recipientId', 'reportPeriodStartMs', 'reportPeriodEndMs', 'parameters',
  ]);
  return {
    scheduledAtMs: nullableInteger(source.scheduledAtMs, `${path}.scheduledAtMs`),
    messageTemplateId: text(source.messageTemplateId, `${path}.messageTemplateId`, true),
    recipientId: text(source.recipientId, `${path}.recipientId`, true),
    reportPeriodStartMs: nullableInteger(source.reportPeriodStartMs, `${path}.reportPeriodStartMs`),
    reportPeriodEndMs: nullableInteger(source.reportPeriodEndMs, `${path}.reportPeriodEndMs`),
    parameters: stringMap(source.parameters, `${path}.parameters`),
  };
}

function normalizeCareAgentAction(value, path = 'action') {
  const source = strict(value, path, [
    'schemaVersion', 'actionId', 'idempotencyKey', 'eventId', 'profileId', 'branch', 'actionType',
    'toolId', 'target', 'reasonCodes', 'payload',
  ]);
  return {
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_ACTION_SCHEMA_VERSION], `${path}.schemaVersion`),
    actionId: text(source.actionId, `${path}.actionId`),
    idempotencyKey: text(source.idempotencyKey, `${path}.idempotencyKey`),
    eventId: text(source.eventId, `${path}.eventId`),
    profileId: text(source.profileId, `${path}.profileId`),
    branch: oneOf(source.branch, CareAgentDecisionBranches, `${path}.branch`),
    actionType: oneOf(source.actionType, CareAgentActionTypes, `${path}.actionType`),
    toolId: oneOf(source.toolId, CareAgentToolIds, `${path}.toolId`),
    target: text(source.target, `${path}.target`),
    reasonCodes: stringList(source.reasonCodes, `${path}.reasonCodes`, true),
    payload: normalizeActionPayload(source.payload, `${path}.payload`),
  };
}

function normalizeCareAgentToolResult(value, path = 'toolResult') {
  const source = strict(value, path, ['schemaVersion', 'actionId', 'toolId', 'status', 'result']);
  let result = null;
  if (source.result !== null) {
    const raw = strict(source.result, `${path}.result`, ['success', 'resultCode', 'resultReference', 'retryable']);
    result = {
      success: bool(raw.success, `${path}.result.success`),
      resultCode: text(raw.resultCode, `${path}.result.resultCode`),
      resultReference: text(raw.resultReference, `${path}.result.resultReference`, true),
      retryable: bool(raw.retryable, `${path}.result.retryable`),
    };
  }
  return {
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_TOOL_RESULT_SCHEMA_VERSION], `${path}.schemaVersion`),
    actionId: text(source.actionId, `${path}.actionId`),
    toolId: oneOf(source.toolId, CareAgentToolIds, `${path}.toolId`),
    status: oneOf(source.status, ExecutionStatuses, `${path}.status`),
    result,
  };
}

function normalizeGuardrailEvaluation(value, path) {
  const source = strict(value, path, ['actionId', 'allowed', 'checks']);
  return {
    actionId: text(source.actionId, `${path}.actionId`),
    allowed: bool(source.allowed, `${path}.allowed`),
    checks: list(source.checks, `${path}.checks`).map((item, index) => {
      const checkPath = `${path}.checks[${index}]`;
      const check = strict(item, checkPath, ['guardrailId', 'passed', 'reasonCode']);
      return {
        guardrailId: oneOf(check.guardrailId, ['GR1', 'GR2', 'GR3', 'GR4', 'GR5', 'GR6', 'GR7', 'GR8'], `${checkPath}.guardrailId`),
        passed: bool(check.passed, `${checkPath}.passed`),
        reasonCode: text(check.reasonCode, `${checkPath}.reasonCode`),
      };
    }),
  };
}

function normalizeCandidateDecision(value, path) {
  const source = strict(value, path, ['actionId', 'disposition', 'reasonCode']);
  return {
    actionId: text(source.actionId, `${path}.actionId`),
    disposition: oneOf(source.disposition, CandidateDispositions, `${path}.disposition`),
    reasonCode: text(source.reasonCode, `${path}.reasonCode`),
  };
}

function normalizeCareAgentDecision(value, path = 'decision') {
  const source = strict(value, path, [
    'schemaVersion', 'decisionId', 'eventId', 'profileId', 'observedState', 'candidates',
    'guardrailEvaluations', 'candidateDecisions', 'selectedBranch', 'selectedActions', 'executions',
    'completedStages', 'status', 'createdAt', 'completedAt',
  ]);
  const candidates = list(source.candidates, `${path}.candidates`)
    .map((item, index) => normalizeCareAgentAction(item, `${path}.candidates[${index}]`));
  const candidateIds = new Set(candidates.map((item) => item.actionId));
  if (candidateIds.size !== candidates.length) fail(`${path}.candidates`, 'must not repeat actionId');
  const selectedActions = list(source.selectedActions, `${path}.selectedActions`)
    .map((item, index) => normalizeCareAgentAction(item, `${path}.selectedActions[${index}]`));
  if (selectedActions.some((item) => !candidateIds.has(item.actionId))) fail(`${path}.selectedActions`, 'must reference candidates');
  const completedStages = enumList(source.completedStages, CareAgentLoopPhases, `${path}.completedStages`, true);
  const canonicalPrefix = CareAgentLoopPhases.slice(0, completedStages.length);
  if (JSON.stringify(completedStages) !== JSON.stringify(canonicalPrefix)) fail(`${path}.completedStages`, 'must follow canonical loop order');
  return {
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_DECISION_SCHEMA_VERSION], `${path}.schemaVersion`),
    decisionId: text(source.decisionId, `${path}.decisionId`),
    eventId: text(source.eventId, `${path}.eventId`),
    profileId: text(source.profileId, `${path}.profileId`),
    observedState: normalizeCareInputState(source.observedState, `${path}.observedState`),
    candidates,
    guardrailEvaluations: list(source.guardrailEvaluations, `${path}.guardrailEvaluations`)
      .map((item, index) => normalizeGuardrailEvaluation(item, `${path}.guardrailEvaluations[${index}]`)),
    candidateDecisions: list(source.candidateDecisions, `${path}.candidateDecisions`)
      .map((item, index) => normalizeCandidateDecision(item, `${path}.candidateDecisions[${index}]`)),
    selectedBranch: oneOf(source.selectedBranch, CareAgentDecisionBranches, `${path}.selectedBranch`),
    selectedActions,
    executions: list(source.executions, `${path}.executions`)
      .map((item, index) => normalizeCareAgentToolResult(item, `${path}.executions[${index}]`)),
    completedStages,
    status: oneOf(source.status, DecisionStatuses, `${path}.status`),
    createdAt: integer(source.createdAt, `${path}.createdAt`),
    completedAt: nullableInteger(source.completedAt, `${path}.completedAt`),
  };
}

function normalizeDecisionSummary(value, path) {
  if (value === null) return null;
  const source = strict(value, path, ['decisionId', 'selectedBranch', 'selectedActions', 'createdAt']);
  return {
    decisionId: text(source.decisionId, `${path}.decisionId`),
    selectedBranch: oneOf(source.selectedBranch, CareAgentDecisionBranches, `${path}.selectedBranch`),
    selectedActions: list(source.selectedActions, `${path}.selectedActions`)
      .map((item, index) => normalizeCareAgentAction(item, `${path}.selectedActions[${index}]`)),
    createdAt: integer(source.createdAt, `${path}.createdAt`),
  };
}

function normalizeCareAgentProjection(value, path = 'projection') {
  const source = strict(value, path, [
    'schemaVersion', 'profileId', 'stateVersion', 'currentSessionPlan', 'nextReassessmentAt', 'latestDecision', 'updatedAt',
  ]);
  return {
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_PROJECTION_SCHEMA_VERSION], `${path}.schemaVersion`),
    profileId: text(source.profileId, `${path}.profileId`),
    stateVersion: integer(source.stateVersion, `${path}.stateVersion`),
    currentSessionPlan: source.currentSessionPlan === null ? null : stringMap(source.currentSessionPlan, `${path}.currentSessionPlan`),
    nextReassessmentAt: nullableInteger(source.nextReassessmentAt, `${path}.nextReassessmentAt`),
    latestDecision: normalizeDecisionSummary(source.latestDecision, `${path}.latestDecision`),
    updatedAt: integer(source.updatedAt, `${path}.updatedAt`),
  };
}

function normalizeCareAgentUpdate(value, path = 'update') {
  const source = strict(value, path, [
    'type', 'schemaVersion', 'messageId', 'profileId', 'baseStateVersion', 'stateVersion', 'projection',
  ]);
  const projection = normalizeCareAgentProjection(source.projection, `${path}.projection`);
  const profileId = text(source.profileId, `${path}.profileId`);
  const baseStateVersion = integer(source.baseStateVersion, `${path}.baseStateVersion`);
  const stateVersion = integer(source.stateVersion, `${path}.stateVersion`, 1);
  if (stateVersion <= baseStateVersion) fail(`${path}.stateVersion`, 'must be greater than baseStateVersion');
  if (projection.profileId !== profileId) fail(`${path}.projection.profileId`, 'must match profileId');
  if (projection.stateVersion !== stateVersion) fail(`${path}.projection.stateVersion`, 'must match stateVersion');
  return {
    type: oneOf(source.type, ['care-agent.updated'], `${path}.type`),
    schemaVersion: oneOf(source.schemaVersion, [CARE_AGENT_STATE_SCHEMA_VERSION], `${path}.schemaVersion`),
    messageId: text(source.messageId, `${path}.messageId`),
    profileId,
    baseStateVersion,
    stateVersion,
    projection,
  };
}

module.exports = {
  CARE_AGENT_STATE_SCHEMA_VERSION,
  CARE_AGENT_EVENT_SCHEMA_VERSION,
  CARE_AGENT_ACTION_SCHEMA_VERSION,
  CARE_AGENT_DECISION_SCHEMA_VERSION,
  CARE_AGENT_TOOL_RESULT_SCHEMA_VERSION,
  CARE_AGENT_PROJECTION_SCHEMA_VERSION,
  CareAgentLoopPhases,
  CareAgentDecisionBranches,
  CareAgentToolIds,
  CareAgentActionTypes,
  CareAgentEventTypes,
  contractConfig,
  normalizeCareInputState,
  normalizeCareAgentState,
  normalizeCareAgentEvent,
  normalizeCareAgentAction,
  normalizeCareAgentToolResult,
  normalizeCareAgentDecision,
  normalizeCareAgentProjection,
  normalizeCareAgentUpdate,
};
