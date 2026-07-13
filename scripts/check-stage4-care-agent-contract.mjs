import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileModelsPath = path.resolve(root, '../Steply-mobile/app/src/main/java/com/steply/app/care/CareAgentModels.kt');
const mobileConfigPath = path.resolve(root, '../Steply-mobile/app/src/main/java/com/steply/app/care/CareAgentConfig.kt');
const contract = require('../shared/stage4CareAgentContract.cjs');
const { requestHandler } = require('../src/routes/apiRouter');
const { clearSessionPersonalData, saveSession } = require('../src/services/sessionStore');
const { attachDashboardWebSocket } = require('../src/ws/dashboardSocket');
const { WebSocket } = require('ws');

const NOW = 1_800_000_000_000;
const profileId = 'profile-stage4';

function inputState() {
  return {
    profile: { profileId, birthYear: 1950, sex: 'FEMALE', sourceUpdatedAt: NOW - 1000 },
    canonicalClinicalReference: {
      assessmentSessionId: 'assessment-stage4',
      assessmentRevision: 7,
      steadiRuleVersion: 'steadi_stage1.v1',
      risk: 'MODERATE',
      vulnerabilityRuleVersion: 'vulnerability_stage2.v1',
      vulnerabilityIds: ['V2', 'V8'],
      prescriptionPlanId: 'plan-stage4',
      prescriptionSchemaVersion: 'otago_prescription.v1',
      professionalApprovalStatus: 'NOT_REQUIRED',
      professionalApprovalId: null,
    },
    recentAssessments: [
      { assessmentSessionId: 'assessment-stage4', completedAt: NOW - 2000, chairStandRepetitions: 10, tandemHoldSeconds: 8.2, valid: true },
    ],
    trend: { declining: false, consecutiveDeclines: 0 },
    adherence: { completedSessionsByWeek: [3, 2], targetSessionsPerWeek: 3, consecutiveLowWeeks: 0 },
    safetyEvents: [],
    fallReports: [],
    invalidAttemptNumerator: 1,
    invalidAttemptDenominator: 10,
    invalidAttemptRatio: 0.1,
    reassessmentDueAt: NOW + 10_000,
    nextPlannedSessionAt: NOW + 5_000,
    progressionEligible: false,
    caregiverNotificationsConsented: true,
    perceivedAt: NOW,
  };
}

function action(overrides = {}) {
  return {
    schemaVersion: 'care_agent_action.v1',
    actionId: 'action-stage4',
    idempotencyKey: 'event-stage4:maintain_plan:care_plan',
    eventId: 'event-stage4',
    profileId,
    branch: 'maintenance',
    actionType: 'maintain_plan',
    toolId: 'progress_store',
    target: 'care_plan',
    reasonCodes: ['NO_HIGHER_PRIORITY_SIGNAL'],
    payload: {
      scheduledAtMs: null,
      messageTemplateId: null,
      recipientId: null,
      reportPeriodStartMs: null,
      reportPeriodEndMs: null,
      parameters: {},
    },
    ...overrides,
  };
}

const event = contract.normalizeCareAgentEvent({
  schemaVersion: 'care_agent_event.v1',
  eventId: 'event-stage4',
  profileId,
  type: 'manual_refresh',
  sourceEventId: 'manual-stage4',
  occurredAt: NOW,
  payload: { source: 'user' },
});
assert.equal(event.type, 'manual_refresh', '[S4-CONTRACT-EVENT] event wire value is canonical');

const selectedAction = contract.normalizeCareAgentAction(action());
const execution = contract.normalizeCareAgentToolResult({
  schemaVersion: 'care_agent_tool_result.v1',
  actionId: selectedAction.actionId,
  toolId: selectedAction.toolId,
  status: 'SUCCEEDED',
  result: { success: true, resultCode: 'STATE_PERSISTED', resultReference: 'receipt-stage4', retryable: false },
});
assert.equal(execution.result.resultReference, 'receipt-stage4', '[S4-CONTRACT-TOOL] external receipt is preserved');

const state = contract.normalizeCareAgentState({
  schemaVersion: 'care_agent_state.v1',
  profileId,
  stateVersion: 1,
  input: inputState(),
  latestDecisionId: 'decision-stage4',
  updatedAt: NOW,
});
assert.equal(state.input.recentAssessments.length, 1, '[S4-STATE-RECENT5] longitudinal input is typed');
assert.equal(Object.hasOwn(state, 'decisionLog'), false, '[S4-PERSIST-SEPARATE] logs are not embedded in state');

const decision = contract.normalizeCareAgentDecision({
  schemaVersion: 'care_agent_decision.v1',
  decisionId: 'decision-stage4',
  eventId: event.eventId,
  profileId,
  observedState: inputState(),
  candidates: [selectedAction],
  guardrailEvaluations: [{
    actionId: selectedAction.actionId,
    allowed: true,
    checks: [{ guardrailId: 'GR8', passed: true, reasonCode: 'AUDIT_FIELDS_PRESENT' }],
  }],
  candidateDecisions: [{ actionId: selectedAction.actionId, disposition: 'SELECTED', reasonCode: 'HIGHEST_PRIORITY_ALLOWED' }],
  selectedBranch: 'maintenance',
  selectedActions: [selectedAction],
  executions: [execution],
  completedStages: [...contract.CareAgentLoopPhases],
  status: 'COMPLETED',
  createdAt: NOW,
  completedAt: NOW + 1,
});
assert.deepEqual(decision.completedStages, contract.contractConfig.loopPhases, '[S4-LOOP-01] all eight stages use canonical order');

assert.throws(
  () => contract.normalizeCareAgentAction({ ...action(), clinicalOverride: true }),
  /is not allowed/,
  '[S4-STRICT-01] unknown action fields are rejected',
);
assert.throws(
  () => contract.normalizeCareAgentState({
    schemaVersion: 'care_agent_state.v1',
    profileId,
    stateVersion: 1,
    input: {
      ...inputState(),
      recentAssessments: [{ ...inputState().recentAssessments[0], valid: false }],
    },
    latestDecisionId: null,
    updatedAt: NOW,
  }),
  /valid assessments only/,
  '[S4-STATE-RECENT5] invalid raw attempts are excluded from recentAssessments',
);
assert.throws(
  () => contract.normalizeCareAgentState({
    schemaVersion: 'care_agent_state.v1',
    profileId,
    stateVersion: 1,
    input: { ...inputState(), invalidAttemptRatio: 0.2 },
    latestDecisionId: null,
    updatedAt: NOW,
  }),
  /must equal invalidAttemptNumerator/,
  '[S4-STATE-INVALID-RATIO] numerator, denominator, and ratio must agree',
);
assert.throws(
  () => contract.normalizeCareAgentState({
    schemaVersion: 'care_agent_state.v1', profileId, stateVersion: 1, input: inputState(), latestDecisionId: null, updatedAt: NOW, decisionLog: [],
  }),
  /decisionLog is not allowed/,
  '[S4-PERSIST-SEPARATE] decision logs require their own table/contract',
);

const projection = contract.normalizeCareAgentProjection({
  schemaVersion: 'care_agent_projection.v1',
  profileId,
  stateVersion: 1,
  currentSessionPlan: { mode: 'standard', planId: 'plan-stage4' },
  nextReassessmentAt: NOW + 10_000,
  latestDecision: {
    decisionId: decision.decisionId,
    selectedBranch: decision.selectedBranch,
    selectedActions: decision.selectedActions,
    createdAt: decision.createdAt,
  },
  updatedAt: NOW,
});
const update = contract.normalizeCareAgentUpdate({
  type: 'care-agent.updated',
  schemaVersion: 'care_agent_state.v1',
  messageId: 'message-stage4',
  profileId,
  baseStateVersion: 0,
  stateVersion: 1,
  projection,
});
assert.equal(update.projection.latestDecision.selectedBranch, 'maintenance', '[S4-WEB-PROJECTION] Mobile decision is preserved');

for (const schemaName of [
  'care-agent-state-v1.schema.json',
  'care-agent-event-v1.schema.json',
  'care-agent-action-v1.schema.json',
  'care-agent-decision-v1.schema.json',
  'care-agent-tool-result-v1.schema.json',
  'care-agent-projection-v1.schema.json',
  'care-agent-update-v1.schema.json',
]) JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas', schemaName), 'utf8'));

const mobileModels = fs.readFileSync(mobileModelsPath, 'utf8');
const mobileConfig = fs.readFileSync(mobileConfigPath, 'utf8');
assert.match(mobileModels, /CARE_AGENT_STATE_SCHEMA_VERSION\s*=\s*"care_agent_state\.v1"/, '[S4-CROSS-PLATFORM] state version matches Kotlin');
assert.match(mobileModels, /CARE_AGENT_DECISION_SCHEMA_VERSION\s*=\s*"care_agent_decision\.v1"/, '[S4-CROSS-PLATFORM] decision version matches Kotlin');
for (const version of [
  'care_agent_event.v1',
  'care_agent_action.v1',
  'care_agent_tool_result.v1',
  'care_agent_projection.v1',
]) assert.ok(mobileModels.includes(`"${version}"`), `[S4-CROSS-PLATFORM] Kotlin exposes ${version}`);
for (const wireValue of [
  ...contract.contractConfig.decisionPriority,
  ...contract.contractConfig.toolIds,
  ...contract.contractConfig.actionTypes,
  ...contract.contractConfig.eventTypes,
]) assert.ok(mobileModels.includes(`"${wireValue}"`), `[S4-CROSS-PLATFORM] Kotlin exposes ${wireValue}`);
assert.match(mobileConfig, /configVersion\s*=\s*"care_agent_operational\.v1"/, '[S4-CONFIG-SOURCE] Kotlin owns runtime operational config');
for (const forbidden of ['recentAssessmentLimit', 'reassessmentIntervalMs', 'lowAdherenceConsecutiveWeeks', 'weeklyReportIntervalMs']) {
  assert.equal(Object.hasOwn(contract.contractConfig, forbidden), false, `[S4-CONFIG-SOURCE] Web contract does not duplicate ${forbidden}`);
}

const productionHook = fs.readFileSync(path.join(root, 'client/src/hooks/useSteplyDashboard.js'), 'utf8');
const progressScreen = fs.readFileSync(path.join(root, 'client/src/routes/StepEightScreens.jsx'), 'utf8');
const activeResultScreens = [
  'client/src/routes/StepSixScreens.jsx',
  'client/src/routes/StepSevenScreens.jsx',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
assert.equal(productionHook.includes("pipeline/agent/careAgent"), false, '[S4-ARCH-01] Web production does not import the legacy agent');
assert.equal(productionHook.includes('runCareAgentLoop'), false, '[S4-ARCH-01] Web does not execute agent planning');
for (const forbidden of [
  'URLSearchParams', 'queryValue(', 'scenarioHistory',
  "queryValue('history'", "queryValue('invalid'", "queryValue('weekly'", "queryValue('safety'",
  "queryValue('reassessment'", "queryValue('sharing'", "queryValue('falls'", "queryValue('view'",
]) assert.equal(progressScreen.includes(forbidden), false, `[S4-NO-FAKE-STATE] Step Eight excludes ${forbidden}`);
assert.equal(progressScreen.includes('projectionFromDashboard'), false, '[S5-UI-PROJECTION] Web excludes Mobile-only care-agent projection state');
assert.equal(progressScreen.includes('weeklySeriesFromHistory'), false, '[S5-UI-HISTORY] Web does not reconstruct Mobile-only adherence');
assert.equal(progressScreen.includes('safetyEventsFromHistory'), false, '[S5-UI-SAFETY] Web does not reconstruct Mobile-only safety events');
assert.match(progressScreen, /Care information is unavailable on this PC/, '[S5-UI-MOBILE-AUTHORITY] missing care state is explicit');
assert.match(progressScreen, /locally stored Room data/, '[S5-UI-MOBILE-AUTHORITY] report generation points to Mobile Room storage');
assert.equal(activeResultScreens.includes('debugAgent'), false, '[S4-NO-DEBUG-QUERY] active result screens have no query-triggered agent UI');
assert.equal(activeResultScreens.includes('agentDebug'), false, '[S4-NO-DEBUG-QUERY] active result screens have no alternate debug query');
assert.equal(progressScreen.includes('Reassessment moved earlier because your Tandem Stand'), false, '[S4-NO-DEMO-FALLBACK] hardcoded agent actions are removed');

const connectionSessionId = 'connection-stage4-contract';
saveSession({
  id: connectionSessionId,
  profile: { id: profileId, displayName: 'Stage 4 Contract' },
  connectedAt: NOW,
  pairingTokenConsumedAt: NOW,
  expiresAtEpochMs: NOW + 60_000,
  careAgentProjection: null,
  careAgentProjectionMessageIds: new Set(),
});
const server = http.createServer(requestHandler);
const wss = attachDashboardWebSocket(server);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function request(method, body) {
  const response = await fetch(`${baseUrl}/api/session/${connectionSessionId}/care-agent-projection`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}

function openSocket(role) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws?sessionId=${connectionSessionId}&role=${role}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function waitForMessage(socket, expectedType) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), 3000);
    const onMessage = (raw) => {
      let value;
      try { value = JSON.parse(raw.toString()); } catch (_) { return; }
      if (value.type !== expectedType) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(value);
    };
    socket.on('message', onMessage);
  });
}

try {
  const stored = await request('PUT', update);
  assert.equal(stored.status, 200, '[S4-API-01] projection update is accepted');
  assert.equal(stored.body.applied, true);

  const duplicate = await request('PUT', update);
  assert.equal(duplicate.status, 200, '[S4-DEDUP-01] duplicate message is an idempotent no-op');
  assert.equal(duplicate.body.applied, false);
  assert.equal(duplicate.body.reason, 'DUPLICATE_MESSAGE');

  const conflict = await request('PUT', {
    ...update,
    messageId: 'message-conflict',
    stateVersion: 2,
    projection: { ...projection, stateVersion: 2 },
  });
  assert.equal(conflict.status, 409, '[S4-API-REVISION] stale base state version is rejected');

  const wrongProfile = await request('PUT', {
    ...update,
    messageId: 'message-wrong-profile',
    profileId: 'different-profile',
    projection: { ...projection, profileId: 'different-profile' },
  });
  assert.equal(wrongProfile.status, 403, '[S4-PROFILE-BINDING] projection is bound to connected profile');

  const unknown = await request('PUT', { ...update, messageId: 'message-unknown', unexpected: true });
  assert.equal(unknown.status, 422, '[S4-STRICT-API] unknown update fields are rejected');

  const read = await request('GET');
  assert.equal(read.body.projection.stateVersion, 1, '[S4-API-READ] Web exposes only the current Mobile projection');

  const dashboardSocket = await openSocket('dashboard');
  const mobileSocket = await openSocket('mobile');
  const dashboardUpdate = waitForMessage(dashboardSocket, 'care-agent.updated');
  const mobileAck = waitForMessage(mobileSocket, 'care-agent.ack');
  mobileSocket.send(JSON.stringify({
    ...update,
    messageId: 'message-ws-stage4',
    baseStateVersion: 1,
    stateVersion: 2,
    projection: { ...projection, stateVersion: 2, updatedAt: NOW + 2 },
  }));
  assert.equal((await dashboardUpdate).stateVersion, 2, '[S4-WS-UPDATE] Mobile projection reaches dashboard only after strict validation');
  assert.equal((await mobileAck).stateVersion, 2, '[S4-WS-ACK] Mobile receives the persisted mirror version');
  dashboardSocket.close();
  mobileSocket.close();

  clearSessionPersonalData(connectionSessionId, 'stage4-contract-check');
  const cleared = await request('GET');
  assert.equal(cleared.body.projection, null, '[S4-EPHEMERAL] explicit cleanup clears Web projection');
} finally {
  for (const client of wss.clients) client.terminate();
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => server.close(resolve));
}

console.log('Stage 4 Care Agent shared contract and ephemeral Web projection checks passed.');
