import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const NOW = Date.parse('2026-07-11T00:00:00.000Z');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

function selectedToolIds(loop) {
  return loop.finalPlan.selectedActions.map((action) => action.toolId).filter(Boolean);
}

function selectedReasonCodes(loop) {
  return loop.finalPlan.selectedActions.map((action) => action.reasonCode);
}

try {
  const {
    CareAgentEventTypes,
    CareAgentPolicyIds,
    CareAgentToolIds,
    createCareAgentToolRegistry,
    createMemoryCareAgentStore,
    runCareAgentLoop,
  } = await server.ssrLoadModule('/client/src/pipeline/agent/careAgent.js');
  const {
    ExercisePlanStatuses,
    SteadiRiskLevels,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');

  function exercisePlan({ requiresProfessionalReview = false } = {}) {
    return {
      planId: requiresProfessionalReview ? 'plan-review' : 'plan-active',
      userId: 'agent-user',
      riskLevel: requiresProfessionalReview ? SteadiRiskLevels.High : SteadiRiskLevels.Low,
      selectedExercises: requiresProfessionalReview ? [] : [
        { exerciseId: 'tandem_stance', level: 'supported', repetitions: 2, sets: 1 },
        { exerciseId: 'front_knee_strengthening', level: 'standard', repetitions: 8, sets: 1 },
      ],
      excludedExercises: [],
      sourceFindingIds: ['finding-1'],
      sourceAssessmentIds: ['assessment-1'],
      status: requiresProfessionalReview ? ExercisePlanStatuses.PendingReview : ExercisePlanStatuses.Active,
      requiresProfessionalReview,
    };
  }

  function baseState(overrides = {}) {
    return {
      userId: 'agent-user',
      latestValidAssessment: {
        assessmentId: 'assessment-1',
        assessmentType: 'FOUR_STAGE_BALANCE',
        completedAtMs: NOW - 3_600_000,
      },
      currentSteadiRiskLevel: SteadiRiskLevels.Low,
      activeFunctionalFindings: [{ findingId: 'finding-1', findingType: 'TANDEM_HOLD_DIFFICULTY' }],
      currentExercisePlan: exercisePlan(),
      recentFiveAssessmentTrends: [],
      weeklyAdherence: [],
      recentInvalidAttempts: [],
      safetyEvents: [],
      reportedFalls: [],
      currentSessionPlan: null,
      nextReassessmentDate: null,
      pendingEscalation: null,
      reminderPreferences: { enabled: true, preferredHour: 8 },
      caregiverConsentSettings: { notifyCaregiver: false, shareReports: false },
      recentExerciseSessionResult: null,
      decisionLog: [],
      processedEventIds: [],
      updatedAtMs: NOW,
      ...overrides,
    };
  }

  function run(state, options = {}) {
    const store = options.store || createMemoryCareAgentStore();
    return runCareAgentLoop({
      userId: 'agent-user',
      initialState: state,
      events: options.events || [],
      store,
      toolRegistry: options.toolRegistry || null,
      now: NOW,
      enableLlmPlanner: options.enableLlmPlanner || false,
      llmPlanner: options.llmPlanner || null,
    });
  }

  const normal = run(baseState());
  assert.equal(normal.finalPlan.triggeredPolicy, CareAgentPolicyIds.ExercisePractice, 'normal user gets exercise practice policy');
  assert.ok(selectedToolIds(normal).includes(CareAgentToolIds.CreateSessionPlan), 'normal policy creates a session plan');
  assert.ok(normal.toolResults.some((result) => result.reasonCode === 'READ_STATE_BEFORE_PLANNING'), 'loop reads state before planning');
  assert.ok(normal.toolResults.some((result) => result.reasonCode === 'READ_STATE_AFTER_ACTIONS'), 'loop re-observes after actions');

  const lowAdherence = run(baseState({
    weeklyAdherence: [
      { weekStartMs: NOW - 14 * 86_400_000, completedSessions: 1, targetSessions: 4, preferredCompletionHour: 17 },
      { weekStartMs: NOW - 7 * 86_400_000, completedSessions: 2, targetSessions: 4, preferredCompletionHour: 18 },
    ],
  }));
  assert.equal(lowAdherence.finalPlan.triggeredPolicy, CareAgentPolicyIds.LowAdherence, 'two low-adherence weeks trigger adherence policy');
  assert.ok(selectedReasonCodes(lowAdherence).includes('LOW_ADHERENCE_SPLIT_SESSION_WITHOUT_CHANGING_EXERCISES'));
  assert.ok(selectedReasonCodes(lowAdherence).includes('LOW_ADHERENCE_ADJUST_REMINDER_TO_COMPLETION_TIME'));

  const invalidAttempts = run(baseState({
    recentInvalidAttempts: [
      { attemptId: 'bad-1', completedAtMs: NOW - 3000 },
      { attemptId: 'bad-2', completedAtMs: NOW - 2000 },
      { attemptId: 'bad-3', completedAtMs: NOW - 1000 },
    ],
  }));
  assert.equal(invalidAttempts.finalPlan.triggeredPolicy, CareAgentPolicyIds.RepeatedInvalidAssessments, 'three invalid attempts trigger camera setup policy');
  assert.ok(selectedToolIds(invalidAttempts).includes(CareAgentToolIds.RequestCameraSetupTutorial));

  const tandemDecline = run(baseState({
    recentFiveAssessmentTrends: [
      { assessmentType: 'FOUR_STAGE_BALANCE', metricKey: 'tandemHoldSeconds', value: 9.5, completedAtMs: NOW - 3000 },
      { assessmentType: 'FOUR_STAGE_BALANCE', metricKey: 'tandemHoldSeconds', value: 8.8, completedAtMs: NOW - 2000 },
      { assessmentType: 'FOUR_STAGE_BALANCE', metricKey: 'tandemHoldSeconds', value: 7.9, completedAtMs: NOW - 1000 },
    ],
    caregiverConsentSettings: { notifyCaregiver: true, shareReports: true },
  }));
  assert.equal(tandemDecline.finalPlan.triggeredPolicy, CareAgentPolicyIds.DecliningScoreTrend, 'tandem hold decline triggers earlier reassessment');
  assert.ok(selectedToolIds(tandemDecline).includes(CareAgentToolIds.NotifyCaregiver), 'caregiver notified only with consent');

  const chairDecline = run(baseState({
    recentFiveAssessmentTrends: [
      { assessmentType: 'CHAIR_STAND_30S', metricKey: 'chairStandRepetitions', value: 12, completedAtMs: NOW - 3000 },
      { assessmentType: 'CHAIR_STAND_30S', metricKey: 'chairStandRepetitions', value: 11, completedAtMs: NOW - 2000 },
      { assessmentType: 'CHAIR_STAND_30S', metricKey: 'chairStandRepetitions', value: 10, completedAtMs: NOW - 1000 },
    ],
  }));
  assert.equal(chairDecline.finalPlan.triggeredPolicy, CareAgentPolicyIds.DecliningScoreTrend, 'chair stand decline triggers earlier reassessment');

  const fallReported = run(baseState(), {
    events: [{
      eventId: 'fall-1',
      type: CareAgentEventTypes.FallReported,
      injuryReported: false,
      timestampMs: NOW,
    }],
  });
  assert.equal(fallReported.finalPlan.triggeredPolicy, CareAgentPolicyIds.SafetyEvent, 'fall report takes safety priority');
  assert.ok(selectedToolIds(fallReported).includes(CareAgentToolIds.CreateProfessionalReviewRequest));
  assert.equal(Boolean(fallReported.finalState.pendingEscalation), true);

  const highRisk = run(baseState({
    currentSteadiRiskLevel: SteadiRiskLevels.High,
    currentExercisePlan: exercisePlan({ requiresProfessionalReview: true }),
  }));
  assert.equal(highRisk.finalPlan.triggeredPolicy, CareAgentPolicyIds.SafetyEvent, 'HIGH risk triggers safety policy');
  assert.ok(highRisk.finalState.currentSessionPlan.mode === 'suspend_for_review', 'HIGH risk suspends general exercise session');

  const progressionEligible = run(baseState({
    recentExerciseSessionResult: {
      postureAccuracy: 0.94,
      requiredRepetitionsAchieved: true,
      consecutiveSuccessfulSessions: 2,
      safetyEvents: [],
    },
  }));
  assert.equal(progressionEligible.finalPlan.triggeredPolicy, CareAgentPolicyIds.ProgressionAvailable, 'eligible progression is presented for approval');
  assert.ok(selectedReasonCodes(progressionEligible).includes('PROGRESSION_REQUIRES_USER_APPROVAL_BEFORE_SAVE'));
  assert.equal(progressionEligible.finalState.currentSessionPlan.approvalRequired, true, 'progression is not auto-applied');

  const progressionWithSafety = run(baseState({
    recentExerciseSessionResult: {
      postureAccuracy: 0.94,
      requiredRepetitionsAchieved: true,
      consecutiveSuccessfulSessions: 2,
      safetyEvents: [],
    },
    safetyEvents: [{ eventId: 'dizzy-1', reasonCode: 'SEVERE_DIZZINESS' }],
  }));
  assert.equal(progressionWithSafety.finalPlan.triggeredPolicy, CareAgentPolicyIds.SafetyEvent, 'safety event overrides progression');
  assert.ok(!selectedReasonCodes(progressionWithSafety).includes('PROGRESSION_REQUIRES_USER_APPROVAL_BEFORE_SAVE'));

  const noCaregiverConsent = run(baseState({
    recentFiveAssessmentTrends: [
      { assessmentType: 'FOUR_STAGE_BALANCE', metricKey: 'tandemHoldSeconds', value: 9.5, completedAtMs: NOW - 3000 },
      { assessmentType: 'FOUR_STAGE_BALANCE', metricKey: 'tandemHoldSeconds', value: 8.8, completedAtMs: NOW - 2000 },
      { assessmentType: 'FOUR_STAGE_BALANCE', metricKey: 'tandemHoldSeconds', value: 7.9, completedAtMs: NOW - 1000 },
    ],
    caregiverConsentSettings: { notifyCaregiver: false, shareReports: false },
  }));
  assert.ok(
    noCaregiverConsent.finalPlan.rejectedActions.some((action) => action.rejectedReasonCodes.includes('CAREGIVER_CONSENT_NOT_GRANTED')),
    'caregiver notification is rejected when consent is absent',
  );

  const llmSchemaFailure = run(baseState({
    recentExerciseSessionResult: {
      postureAccuracy: 0.95,
      requiredRepetitionsAchieved: true,
      consecutiveSuccessfulSessions: 2,
      safetyEvents: [],
    },
  }), {
    enableLlmPlanner: true,
    llmPlanner: () => ({ actionOrder: ['unknown-action'], riskLevel: SteadiRiskLevels.Low }),
  });
  assert.equal(llmSchemaFailure.plannerTrace.mode, 'fallback', 'bad LLM schema falls back to deterministic planner');
  assert.equal(llmSchemaFailure.finalPlan.triggeredPolicy, CareAgentPolicyIds.ProgressionAvailable);

  const failingRegistry = createCareAgentToolRegistry({
    store: createMemoryCareAgentStore(),
    failingTools: { [CareAgentToolIds.SendReminder]: true },
  });
  const toolFailure = run(baseState({
    weeklyAdherence: [
      { weekStartMs: NOW - 14 * 86_400_000, completedSessions: 1, targetSessions: 4 },
      { weekStartMs: NOW - 7 * 86_400_000, completedSessions: 1, targetSessions: 4 },
    ],
  }), { toolRegistry: failingRegistry });
  assert.equal(toolFailure.fallbackUsed, true, 'tool failure activates fallback');
  assert.equal(toolFailure.finalPlan.triggeredPolicy, CareAgentPolicyIds.ToolFailureFallback);
  assert.ok(toolFailure.toolResults.some((result) => result.toolId === CareAgentToolIds.SendReminder && result.status === 'failed'));

  const storageFailureRegistry = createCareAgentToolRegistry({
    store: createMemoryCareAgentStore(),
    failingTools: { [CareAgentToolIds.ReadProgressState]: true },
  });
  const storageFailure = run(baseState(), { toolRegistry: storageFailureRegistry });
  assert.equal(storageFailure.fallbackUsed, true, 'storage read failure activates safe fallback');
  assert.equal(storageFailure.finalPlan.triggeredPolicy, CareAgentPolicyIds.StorageFailureFallback);
  assert.equal(storageFailure.completed, false);

  const repeatA = run(baseState());
  const repeatB = run(baseState());
  assert.equal(repeatA.finalPlan.planId, repeatB.finalPlan.planId, 'same state creates same plan id');
  assert.deepEqual(selectedReasonCodes(repeatA), selectedReasonCodes(repeatB), 'same state creates same selected actions');

  const duplicateStore = createMemoryCareAgentStore();
  const duplicateEvent = {
    eventId: 'invalid-repeat-1',
    type: CareAgentEventTypes.InvalidAssessment,
    reasonCode: 'TRACKING_LOST',
    timestampMs: NOW,
  };
  const duplicateFirst = run(baseState({ currentExercisePlan: null }), { store: duplicateStore, events: [duplicateEvent] });
  const duplicateSecond = run(baseState({ currentExercisePlan: null }), { store: duplicateStore, events: [duplicateEvent] });
  assert.equal(duplicateFirst.finalState.recentInvalidAttempts.length, 1, 'first invalid event is applied');
  assert.equal(duplicateSecond.finalState.recentInvalidAttempts.length, 1, 'duplicate invalid event is not applied twice');
  assert.equal(duplicateSecond.initialObservation.ignoredEvents[0].reasonCode, 'DUPLICATE_EVENT_IGNORED');

  console.log(`Care agent normal policy: ${normal.finalPlan.triggeredPolicy}`);
  console.log(`Care agent fallback policy: ${toolFailure.finalPlan.triggeredPolicy}`);
  console.log('Care agent loop checks passed.');
} finally {
  await server.close();
}
