import { createTypedId } from '../shared/types/index.js';
import { validateAgentAction } from '../shared/validation/runtimeValidation.js';

export function createAgentState({
  userId,
  latestValidAssessment = null,
  currentSteadiRiskLevel = null,
  activeFunctionalFindings = [],
  currentExercisePlan = null,
  recentFiveAssessmentTrends = [],
  weeklyAdherence = [],
  recentInvalidAttempts = [],
  reportedFalls = [],
  currentSessionPlan = null,
  nextReassessmentDate = null,
  pendingEscalation = null,
  reminderPreferences = {},
  caregiverConsentSettings = {},
  decisionLog = [],
  processedEventIds = [],
  recentExerciseSessionResult = null,
  latestValidAssessments = [],
  currentSteadiScore,
  activeFindings = [],
  adherenceHistory = [],
  safetyEvents = [],
  invalidAttemptHistory = [],
  nextReassessmentAt,
  pendingActions = [],
  stateVersion = 1,
  updatedAtMs = Date.now(),
} = {}) {
  const resolvedLatest = latestValidAssessment || latestValidAssessments[0] || null;
  const resolvedFindings = activeFunctionalFindings.length ? activeFunctionalFindings : activeFindings;
  const resolvedAdherence = weeklyAdherence.length ? weeklyAdherence : adherenceHistory;
  const resolvedInvalidAttempts = recentInvalidAttempts.length ? recentInvalidAttempts : invalidAttemptHistory;
  const resolvedReassessment = nextReassessmentDate ?? nextReassessmentAt ?? null;
  return {
    userId,
    latestValidAssessment: resolvedLatest,
    currentSteadiRiskLevel,
    activeFunctionalFindings: resolvedFindings,
    currentExercisePlan,
    recentFiveAssessmentTrends: recentFiveAssessmentTrends.slice(0, 5),
    weeklyAdherence: resolvedAdherence,
    recentInvalidAttempts: resolvedInvalidAttempts,
    safetyEvents,
    reportedFalls,
    currentSessionPlan,
    nextReassessmentDate: resolvedReassessment,
    pendingEscalation,
    reminderPreferences,
    caregiverConsentSettings,
    recentExerciseSessionResult,
    decisionLog,
    processedEventIds,
    latestValidAssessments: resolvedLatest ? [resolvedLatest, ...latestValidAssessments.filter((item) => item !== resolvedLatest)].slice(0, 5) : latestValidAssessments,
    currentSteadiScore,
    activeFindings: resolvedFindings,
    adherenceHistory: resolvedAdherence,
    invalidAttemptHistory: resolvedInvalidAttempts,
    nextReassessmentAt: resolvedReassessment,
    pendingActions,
    stateVersion,
    updatedAtMs,
  };
}

export function createAgentAction(action = {}) {
  const value = {
    actionId: action.actionId || createTypedId('agent-action'),
    ...action,
  };
  return { value, validation: validateAgentAction(value) };
}
