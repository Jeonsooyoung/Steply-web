import {
  AgentActionTypes,
  AssessmentTypes,
  ExercisePlanStatuses,
  SteadiRiskLevels,
} from '../shared/types/index.js';
import { createAgentState } from './agentTypes.js';
import {
  ExerciseProgressionDecisions,
  evaluateExerciseProgression,
} from '../recommendation/otagoExerciseEngine.js';

export const CARE_AGENT_LOOP_SCHEMA_VERSION = 'care_agent_loop.v1';

export const CareAgentToolIds = {
  ReadProgressState: 'readProgressState',
  RequestAssessment: 'requestAssessment',
  ScheduleReassessment: 'scheduleReassessment',
  CreateSessionPlan: 'createSessionPlan',
  GetExercisePlan: 'getExercisePlan',
  CheckProgressionEligibility: 'checkProgressionEligibility',
  SendReminder: 'sendReminder',
  RequestCameraSetupTutorial: 'requestCameraSetupTutorial',
  ComposeWeeklyReport: 'composeWeeklyReport',
  NotifyCaregiver: 'notifyCaregiver',
  CreateProfessionalReviewRequest: 'createProfessionalReviewRequest',
  RecordAgentDecision: 'recordAgentDecision',
};

export const CareAgentGoalIds = {
  SafetyRules: 'SAFETY_RULES_COMPLIANCE',
  EscalationCoverage: 'PROFESSIONAL_ESCALATION_COVERAGE',
  ValidReassessment: 'VALID_REASSESSMENT',
  ExerciseSustainability: 'EXERCISE_SUSTAINABILITY',
  InvalidAssessmentReduction: 'INVALID_ASSESSMENT_REDUCTION',
  EarlyFunctionalChangeDetection: 'EARLY_FUNCTIONAL_CHANGE_DETECTION',
};

export const CareAgentGoals = [
  CareAgentGoalIds.SafetyRules,
  CareAgentGoalIds.EscalationCoverage,
  CareAgentGoalIds.ValidReassessment,
  CareAgentGoalIds.ExerciseSustainability,
  CareAgentGoalIds.InvalidAssessmentReduction,
  CareAgentGoalIds.EarlyFunctionalChangeDetection,
];

export const CareAgentPolicyIds = {
  SafetyEvent: 'SAFETY_EVENT',
  RepeatedInvalidAssessments: 'REPEATED_INVALID_ASSESSMENTS',
  DecliningScoreTrend: 'DECLINING_SCORE_TREND',
  LowAdherence: 'LOW_ADHERENCE',
  ProgressionAvailable: 'PROGRESSION_AVAILABLE',
  ExercisePractice: 'EXERCISE_PRACTICE',
  Maintenance: 'MAINTENANCE',
  ToolFailureFallback: 'TOOL_FAILURE_FALLBACK',
  StorageFailureFallback: 'STORAGE_FAILURE_FALLBACK',
};

export const CareAgentEventTypes = {
  ValidAssessment: 'VALID_ASSESSMENT',
  InvalidAssessment: 'INVALID_ASSESSMENT',
  SafetyEvent: 'SAFETY_EVENT_REPORTED',
  FallReported: 'FALL_REPORTED',
  ExerciseSession: 'EXERCISE_SESSION_RECORDED',
  ReminderPreferencesUpdated: 'REMINDER_PREFERENCES_UPDATED',
  CaregiverConsentUpdated: 'CAREGIVER_CONSENT_UPDATED',
  ExercisePlanUpdated: 'EXERCISE_PLAN_UPDATED',
};

export const careAgentPolicyConfig = {
  invalidAttemptThreshold: 3,
  trendMinimumObservations: 3,
  lowAdherenceRatio: 0.7,
  lowAdherenceWeeksRequired: 2,
  earlyReassessmentDelayMs: 7 * 24 * 60 * 60 * 1000,
  defaultReassessmentDelayMs: 28 * 24 * 60 * 60 * 1000,
  maxDecisionLogEntries: 20,
};

const TOOL_METADATA = {
  [CareAgentToolIds.ReadProgressState]: {
    actionType: AgentActionTypes.ReadProgressState,
    description: 'Read persisted care-agent state.',
  },
  [CareAgentToolIds.RequestAssessment]: {
    actionType: AgentActionTypes.RequestAssessment,
    description: 'Request a new assessment without fabricating a result.',
  },
  [CareAgentToolIds.ScheduleReassessment]: {
    actionType: AgentActionTypes.ScheduleReassessment,
    description: 'Schedule the next reassessment date.',
  },
  [CareAgentToolIds.CreateSessionPlan]: {
    actionType: AgentActionTypes.CreateSessionPlan,
    description: 'Create a session plan from immutable exercise-plan output.',
  },
  [CareAgentToolIds.GetExercisePlan]: {
    actionType: AgentActionTypes.GetExercisePlan,
    description: 'Read the immutable deterministic Otago exercise plan.',
  },
  [CareAgentToolIds.CheckProgressionEligibility]: {
    actionType: AgentActionTypes.CheckProgressionEligibility,
    description: 'Call the deterministic progression rule.',
  },
  [CareAgentToolIds.SendReminder]: {
    actionType: AgentActionTypes.SendReminder,
    description: 'Send or schedule a reminder using preferences.',
  },
  [CareAgentToolIds.RequestCameraSetupTutorial]: {
    actionType: AgentActionTypes.RequestCameraSetupTutorial,
    description: 'Start extended camera setup and calibration guidance.',
  },
  [CareAgentToolIds.ComposeWeeklyReport]: {
    actionType: AgentActionTypes.ComposeWeeklyReport,
    description: 'Compose a structured weekly report from observations.',
  },
  [CareAgentToolIds.NotifyCaregiver]: {
    actionType: AgentActionTypes.NotifyCaregiver,
    description: 'Notify a caregiver only when consent permits it.',
  },
  [CareAgentToolIds.CreateProfessionalReviewRequest]: {
    actionType: AgentActionTypes.CreateProfessionalReviewRequest,
    description: 'Create a professional review request.',
  },
  [CareAgentToolIds.RecordAgentDecision]: {
    actionType: AgentActionTypes.RecordAgentDecision,
    description: 'Persist the decision trace and updated state.',
  },
};

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function deterministicId(prefix, payload) {
  return `${prefix}-${stableHash(payload)}`;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isoDate(ms) {
  return new Date(ms).toISOString();
}

function normalizeRiskLevel(value) {
  if (Object.values(SteadiRiskLevels).includes(value)) return value;
  if (value === 'low_risk' || value === 'low') return SteadiRiskLevels.Low;
  if (value === 'medium_risk' || value === 'moderate' || value === 'moderate_risk') return SteadiRiskLevels.Moderate;
  if (value === 'high_risk' || value === 'high' || value === 'needs_review') return SteadiRiskLevels.High;
  return value || SteadiRiskLevels.NotScorable;
}

function eventTimestamp(event = {}, now) {
  return Number(event.timestampMs ?? event.completedAtMs ?? event.createdAtMs ?? now);
}

function eventId(event = {}, index = 0) {
  return event.eventId || event.id || deterministicId('agent-event', { ...event, index });
}

function defaultReminderPreferences() {
  return {
    enabled: true,
    preferredHour: 9,
    timezone: 'local',
  };
}

function defaultCaregiverConsentSettings() {
  return {
    notifyCaregiver: false,
    shareReports: false,
  };
}

export function createDefaultCareAgentState({
  userId = 'anonymous-user',
  now = Date.now(),
  seed = {},
} = {}) {
  const base = createAgentState({
    userId,
    latestValidAssessment: seed.latestValidAssessment || null,
    currentSteadiRiskLevel: normalizeRiskLevel(seed.currentSteadiRiskLevel),
    activeFunctionalFindings: asArray(seed.activeFunctionalFindings),
    currentExercisePlan: seed.currentExercisePlan || null,
    recentFiveAssessmentTrends: asArray(seed.recentFiveAssessmentTrends).slice(-5),
    weeklyAdherence: asArray(seed.weeklyAdherence),
    recentInvalidAttempts: asArray(seed.recentInvalidAttempts),
    safetyEvents: asArray(seed.safetyEvents),
    reportedFalls: asArray(seed.reportedFalls),
    currentSessionPlan: seed.currentSessionPlan || null,
    nextReassessmentDate: seed.nextReassessmentDate || null,
    pendingEscalation: seed.pendingEscalation || null,
    reminderPreferences: {
      ...defaultReminderPreferences(),
      ...(seed.reminderPreferences || {}),
    },
    caregiverConsentSettings: {
      ...defaultCaregiverConsentSettings(),
      ...(seed.caregiverConsentSettings || {}),
    },
    recentExerciseSessionResult: seed.recentExerciseSessionResult || null,
    decisionLog: asArray(seed.decisionLog),
    processedEventIds: asArray(seed.processedEventIds),
    stateVersion: seed.stateVersion || 1,
    updatedAtMs: seed.updatedAtMs || now,
  });
  return {
    schemaVersion: CARE_AGENT_LOOP_SCHEMA_VERSION,
    ...base,
  };
}

function completeState(rawState = {}, { userId = 'anonymous-user', now = Date.now() } = {}) {
  const raw = clone(rawState) || {};
  return createDefaultCareAgentState({
    userId: raw.userId || userId,
    now,
    seed: raw,
  });
}

export function createMemoryCareAgentStore(initialStates = {}) {
  const states = new Map();
  for (const [userId, state] of Object.entries(initialStates)) {
    states.set(userId, clone(state));
  }
  return {
    readProgressState({ userId }) {
      return states.has(userId) ? clone(states.get(userId)) : null;
    },
    saveProgressState({ userId, state }) {
      states.set(userId, clone(state));
      return clone(state);
    },
    snapshot() {
      return Object.fromEntries([...states.entries()].map(([key, value]) => [key, clone(value)]));
    },
  };
}

const moduleStore = createMemoryCareAgentStore();

function trendFromAssessmentEvent(event = {}, now) {
  const assessment = event.assessment || event.assessmentResult || {};
  const metricKey = event.metricKey
    || assessment.metricKey
    || assessment.primaryMetricKey
    || assessment.primaryLabel
    || (assessment.assessmentType === AssessmentTypes.ChairStand30s || assessment.testType === 'chair_stand'
      ? 'chairStandRepetitions'
      : assessment.assessmentType === AssessmentTypes.FourStageBalance || assessment.testType === 'four_stage_balance'
        ? 'tandemHoldSeconds'
        : null);
  const metricValue = Number(event.metricValue
    ?? assessment.metricValue
    ?? assessment.primaryValue
    ?? assessment.repetitionCount
    ?? assessment.count
    ?? assessment.primaryMeasurements?.completedRepetitions
    ?? assessment.primaryMeasurements?.stages?.find((stage) => stage.stage === 'TANDEM')?.holdDurationSeconds);
  if (!metricKey || !Number.isFinite(metricValue)) return null;
  return {
    trendId: deterministicId('trend', {
      eventId: event.eventId || event.id,
      metricKey,
      metricValue,
      completedAtMs: eventTimestamp(event, now),
    }),
    assessmentId: assessment.assessmentId || event.assessmentId || event.eventId || null,
    assessmentType: assessment.assessmentType || event.assessmentType || null,
    metricKey,
    value: metricValue,
    completedAtMs: eventTimestamp(event, now),
  };
}

function mergeAgentEvents(state, events = [], { now = Date.now() } = {}) {
  const next = completeState(state, { userId: state.userId, now });
  const processed = new Set(next.processedEventIds);
  const appliedEvents = [];
  const ignoredEvents = [];

  events.forEach((event, index) => {
    const id = eventId(event, index);
    if (processed.has(id)) {
      ignoredEvents.push({ eventId: id, reasonCode: 'DUPLICATE_EVENT_IGNORED' });
      return;
    }
    processed.add(id);
    appliedEvents.push({ eventId: id, type: event.type || 'UNKNOWN_EVENT' });
    const timestampMs = eventTimestamp(event, now);

    if (event.type === CareAgentEventTypes.ValidAssessment || event.type === 'ASSESSMENT_COMPLETED') {
      const assessment = clone(event.assessment || event.assessmentResult || {});
      next.latestValidAssessment = {
        ...assessment,
        assessmentId: assessment.assessmentId || event.assessmentId || id,
        completedAtMs: assessment.completedAtMs || timestampMs,
      };
      next.latestValidAssessments = [next.latestValidAssessment, ...asArray(next.latestValidAssessments)]
        .filter(Boolean)
        .slice(0, 5);
      const trend = trendFromAssessmentEvent({ ...event, eventId: id }, now);
      if (trend) {
        next.recentFiveAssessmentTrends = [...asArray(next.recentFiveAssessmentTrends), trend]
          .sort((first, second) => first.completedAtMs - second.completedAtMs)
          .slice(-5);
      }
      const riskLevel = normalizeRiskLevel(event.currentSteadiRiskLevel || event.riskLevel || event.steadiScore?.riskLevel);
      if (riskLevel) next.currentSteadiRiskLevel = riskLevel;
      if (Array.isArray(event.functionalFindings)) next.activeFunctionalFindings = clone(event.functionalFindings);
      if (event.exercisePlan) next.currentExercisePlan = clone(event.exercisePlan);
    } else if (event.type === CareAgentEventTypes.InvalidAssessment || event.type === 'ASSESSMENT_INVALID') {
      next.recentInvalidAttempts = [
        ...asArray(next.recentInvalidAttempts),
        {
          attemptId: event.attemptId || id,
          assessmentType: event.assessmentType || event.testType || null,
          reasonCode: event.reasonCode || event.invalidReason || 'INVALID_ASSESSMENT',
          completedAtMs: timestampMs,
        },
      ].slice(-10);
    } else if (event.type === CareAgentEventTypes.SafetyEvent || event.type === 'STOP_EVENT_REPORTED') {
      next.safetyEvents = [
        ...asArray(next.safetyEvents),
        {
          eventId: id,
          severity: event.severity || 'SERIOUS',
          reasonCode: event.reasonCode || event.safetyEventType || 'SAFETY_EVENT_REPORTED',
          occurredAtMs: timestampMs,
        },
      ].slice(-10);
    } else if (event.type === CareAgentEventTypes.FallReported) {
      const fall = {
        eventId: id,
        injuryReported: Boolean(event.injuryReported),
        occurredAtMs: timestampMs,
      };
      next.reportedFalls = [...asArray(next.reportedFalls), fall].slice(-10);
      next.safetyEvents = [
        ...asArray(next.safetyEvents),
        {
          eventId: `${id}:safety`,
          severity: 'SERIOUS',
          reasonCode: 'FALL_REPORTED',
          occurredAtMs: timestampMs,
        },
      ].slice(-10);
    } else if (event.type === CareAgentEventTypes.ExerciseSession) {
      next.recentExerciseSessionResult = {
        ...(event.sessionResult || {}),
        completedAtMs: timestampMs,
      };
      if (event.weeklyAdherence) {
        next.weeklyAdherence = [...asArray(next.weeklyAdherence), clone(event.weeklyAdherence)].slice(-5);
      }
    } else if (event.type === CareAgentEventTypes.ReminderPreferencesUpdated) {
      next.reminderPreferences = {
        ...next.reminderPreferences,
        ...(event.reminderPreferences || {}),
      };
    } else if (event.type === CareAgentEventTypes.CaregiverConsentUpdated) {
      next.caregiverConsentSettings = {
        ...next.caregiverConsentSettings,
        ...(event.caregiverConsentSettings || {}),
      };
    } else if (event.type === CareAgentEventTypes.ExercisePlanUpdated) {
      next.currentExercisePlan = clone(event.exercisePlan || null);
    }
  });

  next.processedEventIds = [...processed];
  next.updatedAtMs = now;
  return { state: next, appliedEvents, ignoredEvents };
}

function latestDecliningTrend(trends = [], config = careAgentPolicyConfig) {
  const groups = new Map();
  for (const trend of trends) {
    if (!trend?.metricKey || !finite(trend.value)) continue;
    const key = `${trend.assessmentType || 'assessment'}:${trend.metricKey}`;
    const group = groups.get(key) || [];
    group.push(trend);
    groups.set(key, group);
  }
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = group.slice().sort((first, second) => first.completedAtMs - second.completedAtMs).slice(-config.trendMinimumObservations);
    if (ordered.length < config.trendMinimumObservations) continue;
    const declining = ordered.every((item, index) => index === 0 || item.value < ordered[index - 1].value);
    if (declining) {
      return {
        trendKey: key,
        metricKey: ordered[0].metricKey,
        values: ordered.map((item) => item.value),
        assessmentIds: ordered.map((item) => item.assessmentId).filter(Boolean),
      };
    }
  }
  return null;
}

function lowAdherenceObservation(weeklyAdherence = [], config = careAgentPolicyConfig) {
  const recent = weeklyAdherence.slice(-config.lowAdherenceWeeksRequired);
  if (recent.length < config.lowAdherenceWeeksRequired) return null;
  const lowWeeks = recent.filter((week) => {
    const target = Number(week.targetSessions ?? week.target ?? 0);
    const completed = Number(week.completedSessions ?? week.completed ?? 0);
    if (!Number.isFinite(target) || target <= 0) return false;
    return completed / target < config.lowAdherenceRatio;
  });
  if (lowWeeks.length < config.lowAdherenceWeeksRequired) return null;
  return {
    weeks: recent.map((week) => ({
      weekStartMs: week.weekStartMs,
      completedSessions: week.completedSessions ?? week.completed,
      targetSessions: week.targetSessions ?? week.target,
      preferredCompletionHour: week.preferredCompletionHour ?? null,
    })),
  };
}

function safetyObservation(state = {}) {
  const riskLevel = normalizeRiskLevel(state.currentSteadiRiskLevel);
  const requiresReview = state.currentExercisePlan?.requiresProfessionalReview === true
    || state.currentExercisePlan?.status === ExercisePlanStatuses.PendingReview;
  return {
    present: riskLevel === SteadiRiskLevels.High
      || requiresReview
      || asArray(state.safetyEvents).length > 0
      || asArray(state.reportedFalls).length > 0,
    riskLevel,
    requiresProfessionalReview: requiresReview || riskLevel === SteadiRiskLevels.High,
    safetyEventCount: asArray(state.safetyEvents).length,
    reportedFallCount: asArray(state.reportedFalls).length,
  };
}

function observeState(state, mergeResult, { now = Date.now(), config = careAgentPolicyConfig } = {}) {
  const safety = safetyObservation(state);
  const progression = evaluateExerciseProgression({
    recentSessionResult: state.recentExerciseSessionResult || {},
    currentRiskLevel: safety.riskLevel,
    safetyEvents: asArray(state.safetyEvents),
  });
  return {
    observedAt: isoDate(now),
    userId: state.userId,
    latestValidAssessment: state.latestValidAssessment,
    currentSteadiRiskLevel: safety.riskLevel,
    activeFunctionalFindingTypes: asArray(state.activeFunctionalFindings).map((finding) => finding.findingType || finding.type),
    currentExercisePlanId: state.currentExercisePlan?.planId || null,
    recentInvalidAttemptCount: asArray(state.recentInvalidAttempts).length,
    recentFiveAssessmentTrends: asArray(state.recentFiveAssessmentTrends),
    lowAdherence: lowAdherenceObservation(asArray(state.weeklyAdherence), config),
    decliningTrend: latestDecliningTrend(asArray(state.recentFiveAssessmentTrends), config),
    safety,
    progression,
    nextReassessmentDate: state.nextReassessmentDate,
    pendingEscalation: state.pendingEscalation,
    caregiverConsentSettings: state.caregiverConsentSettings,
    appliedEvents: mergeResult?.appliedEvents || [],
    ignoredEvents: mergeResult?.ignoredEvents || [],
  };
}

function action({
  type,
  toolId,
  reasonCode,
  payload = {},
  priority = 100,
  label = null,
}) {
  return {
    type,
    toolId,
    reasonCode,
    reasonCodes: [reasonCode],
    payload,
    priority,
    label: label || reasonCode,
  };
}

function sessionExercisesFromPlan(exercisePlan = {}) {
  return asArray(exercisePlan.selectedExercises).map((exercise) => ({
    exerciseId: exercise.exerciseId,
    level: exercise.level,
    repetitions: exercise.repetitions,
    sets: exercise.sets,
    supportRequirement: exercise.supportRequirement,
  }));
}

function candidateActionsForPolicy(policyId, observation, state, { now, config }) {
  const defaultReassessmentAtMs = now + config.defaultReassessmentDelayMs;
  const earlyReassessmentAtMs = now + config.earlyReassessmentDelayMs;
  const progressionCandidate = observation.progression?.decision === ExerciseProgressionDecisions.ProgressionEligible
    ? action({
      type: AgentActionTypes.CheckProgressionEligibility,
      toolId: CareAgentToolIds.CheckProgressionEligibility,
      reasonCode: 'PROGRESSION_ELIGIBLE_REQUIRES_APPROVAL',
      payload: { approvalRequired: true },
      priority: 30,
    })
    : null;

  if (policyId === CareAgentPolicyIds.SafetyEvent) {
    return [
      action({
        type: AgentActionTypes.CreateSessionPlan,
        toolId: CareAgentToolIds.CreateSessionPlan,
        reasonCode: 'SAFETY_EVENT_SUSPEND_EXERCISE_SESSION',
        payload: { mode: 'suspend_for_review', exercises: [] },
        priority: 1,
      }),
      action({
        type: AgentActionTypes.CreateProfessionalReviewRequest,
        toolId: CareAgentToolIds.CreateProfessionalReviewRequest,
        reasonCode: 'SAFETY_EVENT_REQUIRES_PROFESSIONAL_REVIEW',
        payload: { source: 'safety_policy' },
        priority: 2,
      }),
      action({
        type: AgentActionTypes.NotifyCaregiver,
        toolId: CareAgentToolIds.NotifyCaregiver,
        reasonCode: 'SAFETY_EVENT_NOTIFY_CAREGIVER_IF_CONSENTED',
        payload: { messageKey: 'agent.safetyEvent.caregiverNotice' },
        priority: 3,
      }),
      progressionCandidate,
    ].filter(Boolean);
  }

  if (policyId === CareAgentPolicyIds.RepeatedInvalidAssessments) {
    return [
      action({
        type: AgentActionTypes.RequestCameraSetupTutorial,
        toolId: CareAgentToolIds.RequestCameraSetupTutorial,
        reasonCode: 'REPEATED_INVALID_ATTEMPTS_EXTENDED_CAMERA_SETUP',
        payload: { mode: 'extended', calibrationFirst: true },
        priority: 10,
      }),
      action({
        type: AgentActionTypes.RequestAssessment,
        toolId: CareAgentToolIds.RequestAssessment,
        reasonCode: 'REPEATED_INVALID_ATTEMPTS_CALIBRATION_FIRST',
        payload: { assessmentType: state.latestValidAssessment?.assessmentType || AssessmentTypes.FourStageBalance, calibrationFirst: true },
        priority: 20,
      }),
    ];
  }

  if (policyId === CareAgentPolicyIds.DecliningScoreTrend) {
    return [
      action({
        type: AgentActionTypes.ScheduleReassessment,
        toolId: CareAgentToolIds.ScheduleReassessment,
        reasonCode: 'DECLINING_TREND_EARLY_REASSESSMENT',
        payload: { scheduledAtMs: earlyReassessmentAtMs, trend: observation.decliningTrend },
        priority: 10,
      }),
      action({
        type: AgentActionTypes.CreateSessionPlan,
        toolId: CareAgentToolIds.CreateSessionPlan,
        reasonCode: 'DECLINING_TREND_HOLD_PROGRESSION',
        payload: { mode: 'hold_progression', exercises: sessionExercisesFromPlan(state.currentExercisePlan) },
        priority: 20,
      }),
      action({
        type: AgentActionTypes.NotifyCaregiver,
        toolId: CareAgentToolIds.NotifyCaregiver,
        reasonCode: 'DECLINING_TREND_NOTIFY_CAREGIVER_IF_CONSENTED',
        payload: { messageKey: 'agent.decliningTrend.caregiverNotice' },
        priority: 30,
      }),
      progressionCandidate,
    ].filter(Boolean);
  }

  if (policyId === CareAgentPolicyIds.LowAdherence) {
    const preferredHour = observation.lowAdherence?.weeks
      ?.map((week) => week.preferredCompletionHour)
      .find((hour) => Number.isFinite(Number(hour)));
    return [
      action({
        type: AgentActionTypes.CreateSessionPlan,
        toolId: CareAgentToolIds.CreateSessionPlan,
        reasonCode: 'LOW_ADHERENCE_SPLIT_SESSION_WITHOUT_CHANGING_EXERCISES',
        payload: { mode: 'split_session', splitInto: 2, exercises: sessionExercisesFromPlan(state.currentExercisePlan) },
        priority: 10,
      }),
      action({
        type: AgentActionTypes.SendReminder,
        toolId: CareAgentToolIds.SendReminder,
        reasonCode: 'LOW_ADHERENCE_ADJUST_REMINDER_TO_COMPLETION_TIME',
        payload: { preferredHour: preferredHour ?? state.reminderPreferences?.preferredHour ?? 9 },
        priority: 20,
      }),
      action({
        type: AgentActionTypes.NotifyCaregiver,
        toolId: CareAgentToolIds.NotifyCaregiver,
        reasonCode: 'LOW_ADHERENCE_NOTIFY_CAREGIVER_IF_CONSENTED',
        payload: { messageKey: 'agent.lowAdherence.caregiverNotice' },
        priority: 30,
      }),
    ];
  }

  if (policyId === CareAgentPolicyIds.ProgressionAvailable) {
    return [
      action({
        type: AgentActionTypes.CheckProgressionEligibility,
        toolId: CareAgentToolIds.CheckProgressionEligibility,
        reasonCode: 'PROGRESSION_ELIGIBLE_CONFIRMED_BY_DETERMINISTIC_ENGINE',
        payload: { approvalRequired: true },
        priority: 10,
      }),
      action({
        type: AgentActionTypes.CreateSessionPlan,
        toolId: CareAgentToolIds.CreateSessionPlan,
        reasonCode: 'PROGRESSION_REQUIRES_USER_APPROVAL_BEFORE_SAVE',
        payload: { mode: 'progression_approval_required', exercises: sessionExercisesFromPlan(state.currentExercisePlan) },
        priority: 20,
      }),
    ];
  }

  if (policyId === CareAgentPolicyIds.ExercisePractice) {
    return [
      action({
        type: AgentActionTypes.GetExercisePlan,
        toolId: CareAgentToolIds.GetExercisePlan,
        reasonCode: 'READ_IMMUTABLE_EXERCISE_PLAN',
        priority: 10,
      }),
      action({
        type: AgentActionTypes.CreateSessionPlan,
        toolId: CareAgentToolIds.CreateSessionPlan,
        reasonCode: 'CREATE_SESSION_FROM_CURRENT_EXERCISE_PLAN',
        payload: { mode: 'standard', exercises: sessionExercisesFromPlan(state.currentExercisePlan) },
        priority: 20,
      }),
      action({
        type: AgentActionTypes.ScheduleReassessment,
        toolId: CareAgentToolIds.ScheduleReassessment,
        reasonCode: 'DEFAULT_REASSESSMENT_CADENCE',
        payload: { scheduledAtMs: state.nextReassessmentDate ? Date.parse(state.nextReassessmentDate) : defaultReassessmentAtMs },
        priority: 30,
      }),
    ];
  }

  return [
    action({
      type: AgentActionTypes.ScheduleReassessment,
      toolId: CareAgentToolIds.ScheduleReassessment,
      reasonCode: 'MAINTAIN_DEFAULT_REASSESSMENT_CADENCE',
      payload: { scheduledAtMs: state.nextReassessmentDate ? Date.parse(state.nextReassessmentDate) : defaultReassessmentAtMs },
      priority: 20,
    }),
    action({
      type: AgentActionTypes.NoAction,
      toolId: null,
      reasonCode: 'NO_IMMEDIATE_CHANGE_NEEDED',
      payload: {},
      priority: 40,
    }),
  ];
}

function triggeredPolicyFor(observation, state, config = careAgentPolicyConfig) {
  if (observation.safety.present) return CareAgentPolicyIds.SafetyEvent;
  if (observation.recentInvalidAttemptCount >= config.invalidAttemptThreshold) return CareAgentPolicyIds.RepeatedInvalidAssessments;
  if (observation.decliningTrend) return CareAgentPolicyIds.DecliningScoreTrend;
  if (observation.lowAdherence) return CareAgentPolicyIds.LowAdherence;
  if (observation.progression?.decision === ExerciseProgressionDecisions.ProgressionEligible) return CareAgentPolicyIds.ProgressionAvailable;
  if (state.currentExercisePlan?.selectedExercises?.length) return CareAgentPolicyIds.ExercisePractice;
  return CareAgentPolicyIds.Maintenance;
}

function actionMutatesClinicalResult(actionItem = {}) {
  const payload = actionItem.payload || {};
  return [
    'riskLevel',
    'currentSteadiRiskLevel',
    'functionalFindings',
    'activeFunctionalFindings',
    'selectedExercises',
    'exercisePlan',
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
}

function guardrailsForAction(actionItem, observation, state) {
  const checks = [
    {
      checkId: 'IMMUTABLE_CLINICAL_OUTPUTS',
      passed: !actionMutatesClinicalResult(actionItem),
      reasonCode: actionMutatesClinicalResult(actionItem)
        ? 'ACTION_ATTEMPTS_TO_MUTATE_RISK_FINDINGS_OR_EXERCISES'
        : 'RISK_FINDINGS_AND_EXERCISES_LEFT_IMMUTABLE',
    },
    {
      checkId: 'ACTION_HAS_REASON_CODE',
      passed: Boolean(actionItem.reasonCode),
      reasonCode: actionItem.reasonCode ? 'ACTION_REASON_CODE_PRESENT' : 'ACTION_REASON_CODE_MISSING',
    },
  ];

  if (actionItem.toolId === CareAgentToolIds.NotifyCaregiver) {
    checks.push({
      checkId: 'CAREGIVER_CONSENT_REQUIRED',
      passed: state.caregiverConsentSettings?.notifyCaregiver === true,
      reasonCode: state.caregiverConsentSettings?.notifyCaregiver === true
        ? 'CAREGIVER_CONSENT_CONFIRMED'
        : 'CAREGIVER_CONSENT_NOT_GRANTED',
    });
  }

  if (
    actionItem.toolId === CareAgentToolIds.CheckProgressionEligibility
    || actionItem.payload?.mode === 'progression_approval_required'
  ) {
    const blocked = observation.safety.present || observation.currentSteadiRiskLevel === SteadiRiskLevels.High;
    checks.push({
      checkId: 'NO_PROGRESSION_WITH_SAFETY_EVENT_OR_HIGH_RISK',
      passed: !blocked,
      reasonCode: blocked ? 'PROGRESSION_BLOCKED_BY_SAFETY_GUARDRAIL' : 'PROGRESSION_GUARDRAIL_PASSED',
    });
  }

  if (actionItem.toolId === CareAgentToolIds.CreateSessionPlan) {
    const highRisk = observation.currentSteadiRiskLevel === SteadiRiskLevels.High;
    checks.push({
      checkId: 'HIGH_RISK_BLOCKS_GENERAL_SESSION',
      passed: !highRisk || actionItem.payload?.mode === 'suspend_for_review',
      reasonCode: highRisk && actionItem.payload?.mode !== 'suspend_for_review'
        ? 'HIGH_RISK_GENERAL_SESSION_BLOCKED'
        : 'HIGH_RISK_SESSION_GUARDRAIL_PASSED',
    });
  }

  if (actionItem.toolId === CareAgentToolIds.RequestAssessment) {
    checks.push({
      checkId: 'NO_ASSESSMENT_FABRICATION',
      passed: actionItem.payload?.fabricateResult !== true,
      reasonCode: actionItem.payload?.fabricateResult === true
        ? 'ASSESSMENT_FABRICATION_BLOCKED'
        : 'ASSESSMENT_REQUEST_DOES_NOT_GENERATE_RESULT',
    });
  }

  return checks;
}

function applyGuardrails(candidateActions, observation, state) {
  const selectedActions = [];
  const rejectedActions = [];
  const guardrailChecks = [];

  for (const candidate of candidateActions.slice().sort((first, second) => first.priority - second.priority)) {
    if (candidate.type === AgentActionTypes.NoAction) {
      selectedActions.push(candidate);
      continue;
    }
    const checks = guardrailsForAction(candidate, observation, state);
    guardrailChecks.push(...checks.map((check) => ({
      ...check,
      actionType: candidate.type,
      toolId: candidate.toolId,
      actionReasonCode: candidate.reasonCode,
    })));
    const failed = checks.filter((check) => !check.passed);
    if (failed.length) {
      rejectedActions.push({
        ...candidate,
        rejectedReasonCodes: failed.map((check) => check.reasonCode),
      });
      continue;
    }
    selectedActions.push(candidate);
  }

  selectedActions.push(action({
    type: AgentActionTypes.RecordAgentDecision,
    toolId: CareAgentToolIds.RecordAgentDecision,
    reasonCode: 'DECISION_TRACE_MUST_BE_RECORDED',
    priority: 999,
  }));

  return { selectedActions, rejectedActions, guardrailChecks };
}

function validateLlmPlannerOutput(output, selectedActions) {
  if (!output || typeof output !== 'object') return { ok: false, reasonCode: 'LLM_OUTPUT_NOT_OBJECT' };
  if (!Array.isArray(output.actionOrder)) return { ok: false, reasonCode: 'LLM_ACTION_ORDER_MISSING' };
  const selectedIds = new Set(selectedActions.map((item) => item.actionId));
  const unknown = output.actionOrder.find((id) => !selectedIds.has(id));
  if (unknown) return { ok: false, reasonCode: 'LLM_UNKNOWN_ACTION_ID' };
  if (output.riskLevel || output.functionalFindings || output.exercisePlan || output.exerciseIds) {
    return { ok: false, reasonCode: 'LLM_ATTEMPTED_FORBIDDEN_MEDICAL_CHANGE' };
  }
  return { ok: true, reasonCode: 'LLM_SCHEMA_VALID' };
}

function maybeApplyLlmPlanner({ plan, enableLlmPlanner = false, llmPlanner = null }) {
  if (!enableLlmPlanner || typeof llmPlanner !== 'function') {
    return { plan, plannerTrace: { mode: 'deterministic', reasonCode: 'LLM_PLANNER_DISABLED' } };
  }
  try {
    const output = llmPlanner({
      candidateActions: plan.candidateActions,
      selectedActions: plan.selectedActions,
      observedState: plan.observedState,
    });
    const validation = validateLlmPlannerOutput(output, plan.selectedActions);
    if (!validation.ok) {
      return {
        plan: {
          ...plan,
          rejectedActions: [
            ...plan.rejectedActions,
            {
              actionId: deterministicId('llm-rejection', { planId: plan.planId, output }),
              type: 'LLM_PLANNER_OUTPUT',
              rejectedReasonCodes: [validation.reasonCode, 'DETERMINISTIC_POLICY_FALLBACK_USED'],
            },
          ],
        },
        plannerTrace: { mode: 'fallback', reasonCode: validation.reasonCode },
      };
    }
    const order = new Map(output.actionOrder.map((id, index) => [id, index]));
    return {
      plan: {
        ...plan,
        selectedActions: plan.selectedActions.slice().sort((first, second) => {
          const firstRank = order.has(first.actionId) ? order.get(first.actionId) : 1000 + first.priority;
          const secondRank = order.has(second.actionId) ? order.get(second.actionId) : 1000 + second.priority;
          return firstRank - secondRank;
        }),
      },
      plannerTrace: { mode: 'llm_priority_hint', reasonCode: validation.reasonCode },
    };
  } catch (error) {
    return {
      plan: {
        ...plan,
        rejectedActions: [
          ...plan.rejectedActions,
          {
            actionId: deterministicId('llm-error', { planId: plan.planId, message: error.message }),
            type: 'LLM_PLANNER_OUTPUT',
            rejectedReasonCodes: ['LLM_PLANNER_THROWN', 'DETERMINISTIC_POLICY_FALLBACK_USED'],
          },
        ],
      },
      plannerTrace: { mode: 'fallback', reasonCode: 'LLM_PLANNER_THROWN' },
    };
  }
}

function attachActionIds(actions, planId) {
  return actions.map((item, index) => ({
    ...item,
    actionId: deterministicId('agent-action', {
      planId,
      index,
      type: item.type,
      toolId: item.toolId,
      reasonCode: item.reasonCode,
      payload: item.payload,
    }),
  }));
}

function buildPlan({ observation, state, policyId, now, config, replanOf = null }) {
  const candidateActions = candidateActionsForPolicy(policyId, observation, state, { now, config });
  const guarded = applyGuardrails(candidateActions, observation, state);
  const planSeed = {
    observedState: {
      currentSteadiRiskLevel: observation.currentSteadiRiskLevel,
      activeFunctionalFindingTypes: observation.activeFunctionalFindingTypes,
      recentInvalidAttemptCount: observation.recentInvalidAttemptCount,
      decliningTrend: observation.decliningTrend,
      lowAdherence: observation.lowAdherence,
      safety: observation.safety,
      progression: observation.progression,
    },
    policyId,
    now,
    replanOf,
    selected: guarded.selectedActions.map((item) => [item.type, item.toolId, item.reasonCode]),
    rejected: guarded.rejectedActions.map((item) => [item.type, item.toolId, item.reasonCode, item.rejectedReasonCodes]),
  };
  const planId = deterministicId('care-agent-plan', planSeed);
  return {
    planId,
    observedState: clone(observation),
    triggeredPolicy: policyId,
    candidateActions: attachActionIds(candidateActions, planId),
    rejectedActions: attachActionIds(guarded.rejectedActions, planId),
    selectedActions: attachActionIds(guarded.selectedActions, planId),
    guardrailChecks: guarded.guardrailChecks,
    expectedOutcome: expectedOutcomeFor(policyId),
    createdAt: isoDate(now),
    replanOf,
  };
}

function expectedOutcomeFor(policyId) {
  const outcomes = {
    [CareAgentPolicyIds.SafetyEvent]: 'Exercise is paused and professional review is requested.',
    [CareAgentPolicyIds.RepeatedInvalidAssessments]: 'Camera setup guidance runs before another measurement attempt.',
    [CareAgentPolicyIds.DecliningScoreTrend]: 'Reassessment is moved earlier and progression is held.',
    [CareAgentPolicyIds.LowAdherence]: 'The session is split and reminders are adjusted without changing prescribed exercises.',
    [CareAgentPolicyIds.ProgressionAvailable]: 'Progression is presented for approval without automatic application.',
    [CareAgentPolicyIds.ExercisePractice]: 'A session is created from the current deterministic exercise plan.',
    [CareAgentPolicyIds.Maintenance]: 'Default reassessment cadence continues.',
    [CareAgentPolicyIds.ToolFailureFallback]: 'Unsafe changes are held after a tool failure.',
    [CareAgentPolicyIds.StorageFailureFallback]: 'Unsafe changes are held because state could not be read or saved.',
  };
  return outcomes[policyId] || 'Care state is monitored.';
}

function decisionPriority(policyId) {
  const priority = {
    [CareAgentPolicyIds.SafetyEvent]: 'safety_first',
    [CareAgentPolicyIds.RepeatedInvalidAssessments]: 'camera_setup',
    [CareAgentPolicyIds.DecliningScoreTrend]: 'early_reassessment',
    [CareAgentPolicyIds.LowAdherence]: 'adherence_support',
    [CareAgentPolicyIds.ProgressionAvailable]: 'progression_review',
    [CareAgentPolicyIds.ExercisePractice]: 'exercise_practice',
    [CareAgentPolicyIds.Maintenance]: 'maintenance',
    [CareAgentPolicyIds.ToolFailureFallback]: 'safe_fallback',
    [CareAgentPolicyIds.StorageFailureFallback]: 'safe_fallback',
  };
  return priority[policyId] || 'maintenance';
}

function userMessageFor(policyId) {
  const messages = {
    [CareAgentPolicyIds.SafetyEvent]: 'Exercise is paused until a professional review is completed.',
    [CareAgentPolicyIds.RepeatedInvalidAssessments]: 'Camera setup guidance was added because recent tests could not be measured reliably.',
    [CareAgentPolicyIds.DecliningScoreTrend]: 'Your next balance check was moved earlier because recent measurements decreased.',
    [CareAgentPolicyIds.LowAdherence]: "Today's routine was split into two shorter sessions to make it easier to complete.",
    [CareAgentPolicyIds.ProgressionAvailable]: 'Progression is available for review, but it will not be applied automatically.',
    [CareAgentPolicyIds.ExercisePractice]: 'Today’s routine follows your current exercise plan.',
    [CareAgentPolicyIds.Maintenance]: 'Continue the current routine and reassess on the regular schedule.',
    [CareAgentPolicyIds.ToolFailureFallback]: 'A care tool failed, so the plan is held safely until the next check.',
    [CareAgentPolicyIds.StorageFailureFallback]: 'Care state could not be saved, so no exercise change was applied.',
  };
  return messages[policyId] || messages[CareAgentPolicyIds.Maintenance];
}

function applyStatePatch(state, patch = {}, now = Date.now()) {
  const next = completeState({
    ...state,
    ...patch,
    updatedAtMs: now,
  }, { userId: state.userId, now });
  return next;
}

export function createCareAgentToolRegistry({
  store = moduleStore,
  failingTools = {},
  toolOverrides = {},
} = {}) {
  const shouldFail = (toolId) => {
    if (!failingTools) return null;
    if (failingTools[toolId]) return failingTools[toolId] === true ? new Error(`${toolId} failed`) : failingTools[toolId];
    return null;
  };

  const tools = {
    [CareAgentToolIds.ReadProgressState]: {
      ...TOOL_METADATA[CareAgentToolIds.ReadProgressState],
      execute({ userId, defaultState, now }) {
        const failure = shouldFail(CareAgentToolIds.ReadProgressState);
        if (failure) throw failure;
        const stored = store.readProgressState({ userId });
        return {
          state: completeState({ ...(defaultState || {}), ...(stored || {}) }, { userId, now }),
        };
      },
    },
    [CareAgentToolIds.RequestAssessment]: {
      ...TOOL_METADATA[CareAgentToolIds.RequestAssessment],
      execute({ action: actionItem, now }) {
        const failure = shouldFail(CareAgentToolIds.RequestAssessment);
        if (failure) throw failure;
        return {
          assessmentRequest: {
            requestId: deterministicId('assessment-request', { actionId: actionItem.actionId, now }),
            ...actionItem.payload,
          },
          statePatch: {
            pendingActions: [{
              type: actionItem.type,
              reasonCode: actionItem.reasonCode,
              createdAt: isoDate(now),
            }],
          },
        };
      },
    },
    [CareAgentToolIds.ScheduleReassessment]: {
      ...TOOL_METADATA[CareAgentToolIds.ScheduleReassessment],
      execute({ action: actionItem }) {
        const failure = shouldFail(CareAgentToolIds.ScheduleReassessment);
        if (failure) throw failure;
        return {
          nextReassessmentDate: isoDate(actionItem.payload.scheduledAtMs),
          statePatch: {
            nextReassessmentDate: isoDate(actionItem.payload.scheduledAtMs),
          },
        };
      },
    },
    [CareAgentToolIds.CreateSessionPlan]: {
      ...TOOL_METADATA[CareAgentToolIds.CreateSessionPlan],
      execute({ action: actionItem, state, now }) {
        const failure = shouldFail(CareAgentToolIds.CreateSessionPlan);
        if (failure) throw failure;
        const sessionPlan = {
          sessionPlanId: deterministicId('session-plan', {
            actionId: actionItem.actionId,
            exercisePlanId: state.currentExercisePlan?.planId || null,
            mode: actionItem.payload.mode,
          }),
          mode: actionItem.payload.mode || 'standard',
          exercisePlanId: state.currentExercisePlan?.planId || null,
          exercises: clone(actionItem.payload.exercises || sessionExercisesFromPlan(state.currentExercisePlan)),
          createdAt: isoDate(now),
          reasonCode: actionItem.reasonCode,
          approvalRequired: actionItem.payload.mode === 'progression_approval_required',
        };
        return {
          sessionPlan,
          statePatch: { currentSessionPlan: sessionPlan },
        };
      },
    },
    [CareAgentToolIds.GetExercisePlan]: {
      ...TOOL_METADATA[CareAgentToolIds.GetExercisePlan],
      execute({ state }) {
        const failure = shouldFail(CareAgentToolIds.GetExercisePlan);
        if (failure) throw failure;
        return {
          exercisePlan: clone(state.currentExercisePlan),
        };
      },
    },
    [CareAgentToolIds.CheckProgressionEligibility]: {
      ...TOOL_METADATA[CareAgentToolIds.CheckProgressionEligibility],
      execute({ state }) {
        const failure = shouldFail(CareAgentToolIds.CheckProgressionEligibility);
        if (failure) throw failure;
        const progression = evaluateExerciseProgression({
          recentSessionResult: state.recentExerciseSessionResult || {},
          currentRiskLevel: normalizeRiskLevel(state.currentSteadiRiskLevel),
          safetyEvents: asArray(state.safetyEvents),
        });
        return {
          progression,
          statePatch: {
            progressionReview: progression,
          },
        };
      },
    },
    [CareAgentToolIds.SendReminder]: {
      ...TOOL_METADATA[CareAgentToolIds.SendReminder],
      execute({ action: actionItem, state, now }) {
        const failure = shouldFail(CareAgentToolIds.SendReminder);
        if (failure) throw failure;
        const reminder = {
          reminderId: deterministicId('reminder', { actionId: actionItem.actionId, preferredHour: actionItem.payload.preferredHour }),
          preferredHour: actionItem.payload.preferredHour ?? state.reminderPreferences?.preferredHour ?? 9,
          createdAt: isoDate(now),
          reasonCode: actionItem.reasonCode,
        };
        return {
          reminder,
          statePatch: {
            reminderPreferences: {
              ...state.reminderPreferences,
              preferredHour: reminder.preferredHour,
              lastReminderAtMs: now,
            },
          },
        };
      },
    },
    [CareAgentToolIds.RequestCameraSetupTutorial]: {
      ...TOOL_METADATA[CareAgentToolIds.RequestCameraSetupTutorial],
      execute({ action: actionItem, now }) {
        const failure = shouldFail(CareAgentToolIds.RequestCameraSetupTutorial);
        if (failure) throw failure;
        const tutorial = {
          tutorialId: deterministicId('camera-tutorial', { actionId: actionItem.actionId }),
          mode: actionItem.payload.mode || 'standard',
          calibrationFirst: actionItem.payload.calibrationFirst === true,
          createdAt: isoDate(now),
        };
        return {
          tutorial,
          statePatch: {
            currentSessionPlan: {
              sessionPlanId: tutorial.tutorialId,
              mode: 'camera_setup_first',
              calibrationFirst: tutorial.calibrationFirst,
              exercises: [],
              reasonCode: actionItem.reasonCode,
              createdAt: isoDate(now),
            },
          },
        };
      },
    },
    [CareAgentToolIds.ComposeWeeklyReport]: {
      ...TOOL_METADATA[CareAgentToolIds.ComposeWeeklyReport],
      execute({ state, now }) {
        const failure = shouldFail(CareAgentToolIds.ComposeWeeklyReport);
        if (failure) throw failure;
        return {
          report: {
            reportId: deterministicId('weekly-report', { userId: state.userId, now }),
            trendCount: asArray(state.recentFiveAssessmentTrends).length,
            adherenceWeeks: asArray(state.weeklyAdherence).length,
          },
        };
      },
    },
    [CareAgentToolIds.NotifyCaregiver]: {
      ...TOOL_METADATA[CareAgentToolIds.NotifyCaregiver],
      execute({ action: actionItem, now }) {
        const failure = shouldFail(CareAgentToolIds.NotifyCaregiver);
        if (failure) throw failure;
        return {
          notification: {
            notificationId: deterministicId('caregiver-notice', { actionId: actionItem.actionId }),
            messageKey: actionItem.payload.messageKey,
            createdAt: isoDate(now),
          },
        };
      },
    },
    [CareAgentToolIds.CreateProfessionalReviewRequest]: {
      ...TOOL_METADATA[CareAgentToolIds.CreateProfessionalReviewRequest],
      execute({ action: actionItem, state, now }) {
        const failure = shouldFail(CareAgentToolIds.CreateProfessionalReviewRequest);
        if (failure) throw failure;
        const request = {
          escalationId: deterministicId('professional-review', {
            userId: state.userId,
            actionId: actionItem.actionId,
          }),
          status: 'PENDING',
          source: actionItem.payload.source || 'agent',
          createdAt: isoDate(now),
          reasonCode: actionItem.reasonCode,
        };
        return {
          reviewRequest: request,
          statePatch: {
            pendingEscalation: request,
          },
        };
      },
    },
    [CareAgentToolIds.RecordAgentDecision]: {
      ...TOOL_METADATA[CareAgentToolIds.RecordAgentDecision],
      execute({ action: actionItem, state, plan, toolResults, now, config = careAgentPolicyConfig }) {
        const failure = shouldFail(CareAgentToolIds.RecordAgentDecision);
        if (failure) throw failure;
        const decision = {
          decisionId: deterministicId('agent-decision', {
            planId: plan.planId,
            selectedActionIds: plan.selectedActions.map((item) => item.actionId),
            now,
          }),
          planId: plan.planId,
          triggeredPolicy: plan.triggeredPolicy,
          reasonCodes: unique(plan.selectedActions.map((item) => item.reasonCode)),
          selectedActionIds: plan.selectedActions.map((item) => item.actionId),
          rejectedActions: plan.rejectedActions.map((item) => ({
            actionId: item.actionId,
            reasonCode: item.reasonCode,
            rejectedReasonCodes: item.rejectedReasonCodes,
          })),
          guardrailChecks: plan.guardrailChecks,
          toolResults: toolResults.map((result) => ({
            toolId: result.toolId,
            actionId: result.actionId,
            status: result.status,
            reasonCode: result.reasonCode,
          })),
          createdAt: isoDate(now),
          recordedByActionId: actionItem.actionId,
        };
        const nextState = completeState({
          ...state,
          decisionLog: [...asArray(state.decisionLog), decision].slice(-config.maxDecisionLogEntries),
          updatedAtMs: now,
        }, { userId: state.userId, now });
        store.saveProgressState({ userId: nextState.userId, state: nextState });
        return {
          decision,
          saved: true,
          statePatch: {
            decisionLog: nextState.decisionLog,
            updatedAtMs: now,
          },
        };
      },
    },
  };

  for (const [toolId, override] of Object.entries(toolOverrides || {})) {
    tools[toolId] = {
      ...(tools[toolId] || TOOL_METADATA[toolId] || { actionType: null, description: 'Custom tool.' }),
      ...override,
    };
  }

  return {
    listTools() {
      return Object.entries(tools).map(([toolId, tool]) => ({
        toolId,
        actionType: tool.actionType || null,
        description: tool.description || '',
      }));
    },
    execute(toolId, context) {
      if (!toolId) return { noop: true };
      const tool = tools[toolId];
      if (!tool || typeof tool.execute !== 'function') throw new Error(`Care agent tool is not registered: ${toolId}`);
      return tool.execute(context);
    },
  };
}

function executePlan({ plan, state, registry, now, config }) {
  let workingState = completeState(state, { userId: state.userId, now });
  const toolResults = [];
  let failed = null;

  for (const selectedAction of plan.selectedActions) {
    if (!selectedAction.toolId) {
      toolResults.push({
        actionId: selectedAction.actionId,
        toolId: null,
        status: 'success',
        reasonCode: selectedAction.reasonCode,
        result: { noop: true },
        observedAt: isoDate(now),
      });
      continue;
    }
    try {
      const result = registry.execute(selectedAction.toolId, {
        action: selectedAction,
        state: workingState,
        plan,
        toolResults,
        now,
        config,
      });
      toolResults.push({
        actionId: selectedAction.actionId,
        toolId: selectedAction.toolId,
        status: 'success',
        reasonCode: selectedAction.reasonCode,
        result: clone(result),
        observedAt: isoDate(now),
      });
      if (result?.statePatch) {
        workingState = applyStatePatch(workingState, result.statePatch, now);
      }
    } catch (error) {
      const failure = {
        actionId: selectedAction.actionId,
        toolId: selectedAction.toolId,
        status: 'failed',
        reasonCode: selectedAction.reasonCode,
        error: error.message,
        observedAt: isoDate(now),
      };
      toolResults.push(failure);
      failed = failure;
      break;
    }
  }

  return { state: workingState, toolResults, failed };
}

function fallbackPlanForFailure({ observation, failedToolResult, now, policyId }) {
  const planId = deterministicId('care-agent-plan', {
    policyId,
    failedToolResult,
    observedRisk: observation.currentSteadiRiskLevel,
    now,
  });
  const selectedActions = attachActionIds([
    action({
      type: AgentActionTypes.NoAction,
      toolId: null,
      reasonCode: 'SAFE_FALLBACK_HOLD_CHANGES',
      priority: 10,
    }),
    action({
      type: AgentActionTypes.RecordAgentDecision,
      toolId: CareAgentToolIds.RecordAgentDecision,
      reasonCode: 'FALLBACK_DECISION_TRACE_ATTEMPTED',
      priority: 20,
    }),
  ], planId);
  return {
    planId,
    observedState: clone(observation),
    triggeredPolicy: policyId,
    candidateActions: selectedActions,
    rejectedActions: [{
      actionId: deterministicId('agent-action', { planId, failedToolResult }),
      type: 'FAILED_ACTION',
      toolId: failedToolResult.toolId,
      reasonCode: failedToolResult.reasonCode,
      rejectedReasonCodes: ['TOOL_FAILURE_FALLBACK_USED'],
    }],
    selectedActions,
    guardrailChecks: [{
      checkId: 'SAFE_FALLBACK_NO_CLINICAL_MUTATION',
      passed: true,
      reasonCode: 'SAFE_FALLBACK_HOLDS_RISK_FINDINGS_AND_EXERCISES',
    }],
    expectedOutcome: expectedOutcomeFor(policyId),
    createdAt: isoDate(now),
  };
}

function summarizeDecision(plan) {
  return {
    priority: decisionPriority(plan.triggeredPolicy),
    nextAction: expectedOutcomeFor(plan.triggeredPolicy),
    seniorMessage: userMessageFor(plan.triggeredPolicy),
    userMessage: userMessageFor(plan.triggeredPolicy),
    triggeredPolicy: plan.triggeredPolicy,
    reasonCodes: unique(plan.selectedActions.map((item) => item.reasonCode)),
    selectedActionTypes: plan.selectedActions.map((item) => item.type),
    rejectedActionTypes: plan.rejectedActions.map((item) => item.type),
    scheduler: {
      nextReassessmentDueAt: plan.observedState.nextReassessmentDate || null,
    },
  };
}

export function runCareAgentLoop({
  userId = 'anonymous-user',
  initialState = null,
  events = [],
  store = moduleStore,
  toolRegistry = null,
  now = Date.now(),
  config = careAgentPolicyConfig,
  enableLlmPlanner = false,
  llmPlanner = null,
} = {}) {
  const registry = toolRegistry || createCareAgentToolRegistry({ store });
  const toolRegistrySnapshot = registry.listTools();
  const readTrace = [];
  let state;
  try {
    const readResult = registry.execute(CareAgentToolIds.ReadProgressState, {
      userId,
      defaultState: initialState,
      now,
    });
    state = readResult.state;
    readTrace.push({
      actionId: deterministicId('agent-action', { toolId: CareAgentToolIds.ReadProgressState, userId, now }),
      toolId: CareAgentToolIds.ReadProgressState,
      status: 'success',
      reasonCode: 'READ_STATE_BEFORE_PLANNING',
      result: { hasState: Boolean(readResult.state) },
      observedAt: isoDate(now),
    });
  } catch (error) {
    const fallbackState = completeState(initialState || {}, { userId, now });
    const failedRead = {
      actionId: deterministicId('agent-action', { toolId: CareAgentToolIds.ReadProgressState, userId, now }),
      toolId: CareAgentToolIds.ReadProgressState,
      status: 'failed',
      reasonCode: 'READ_STATE_BEFORE_PLANNING',
      error: error.message,
      observedAt: isoDate(now),
    };
    const observation = observeState(fallbackState, { appliedEvents: [], ignoredEvents: [] }, { now, config });
    const plan = fallbackPlanForFailure({
      observation,
      failedToolResult: failedRead,
      now,
      policyId: CareAgentPolicyIds.StorageFailureFallback,
    });
    return {
      schemaVersion: CARE_AGENT_LOOP_SCHEMA_VERSION,
      mode: 'DETERMINISTIC_POLICY_AGENT',
      goals: CareAgentGoals,
      toolRegistry: toolRegistrySnapshot,
      initialObservation: observation,
      finalObservation: observation,
      plans: [plan],
      finalPlan: plan,
      decision: summarizeDecision(plan),
      toolResults: [failedRead],
      finalState: fallbackState,
      decisionLog: fallbackState.decisionLog,
      fallbackUsed: true,
      replanCount: 0,
      completed: false,
    };
  }

  const mergeResult = mergeAgentEvents(state, events, { now });
  state = mergeResult.state;
  const initialObservation = observeState(state, mergeResult, { now, config });
  const policyId = triggeredPolicyFor(initialObservation, state, config);
  let plan = buildPlan({ observation: initialObservation, state, policyId, now, config });
  const planner = maybeApplyLlmPlanner({ plan, enableLlmPlanner, llmPlanner });
  plan = planner.plan;

  const execution = executePlan({ plan, state, registry, now, config });
  let plans = [plan];
  let toolResults = [...readTrace, ...execution.toolResults];
  let finalState = execution.state;
  let fallbackUsed = false;
  let finalPlan = plan;

  if (execution.failed) {
    fallbackUsed = true;
    const fallbackPolicy = execution.failed.toolId === CareAgentToolIds.RecordAgentDecision
      ? CareAgentPolicyIds.StorageFailureFallback
      : CareAgentPolicyIds.ToolFailureFallback;
    const fallbackPlan = fallbackPlanForFailure({
      observation: initialObservation,
      failedToolResult: execution.failed,
      now,
      policyId: fallbackPolicy,
    });
    const fallbackExecution = executePlan({ plan: fallbackPlan, state: finalState, registry, now, config });
    plans = [...plans, fallbackPlan];
    toolResults = [...toolResults, ...fallbackExecution.toolResults];
    finalState = fallbackExecution.state;
    finalPlan = fallbackPlan;
  }

  let finalObservation = observeState(finalState, { appliedEvents: [], ignoredEvents: [] }, { now, config });
  try {
    const reread = registry.execute(CareAgentToolIds.ReadProgressState, {
      userId,
      defaultState: finalState,
      now,
    });
    finalState = reread.state;
    finalObservation = observeState(finalState, { appliedEvents: [], ignoredEvents: [] }, { now, config });
    toolResults.push({
      actionId: deterministicId('agent-action', { toolId: CareAgentToolIds.ReadProgressState, userId, now, phase: 'after' }),
      toolId: CareAgentToolIds.ReadProgressState,
      status: 'success',
      reasonCode: 'READ_STATE_AFTER_ACTIONS',
      result: { hasState: Boolean(reread.state) },
      observedAt: isoDate(now),
    });
  } catch (error) {
    fallbackUsed = true;
    toolResults.push({
      actionId: deterministicId('agent-action', { toolId: CareAgentToolIds.ReadProgressState, userId, now, phase: 'after' }),
      toolId: CareAgentToolIds.ReadProgressState,
      status: 'failed',
      reasonCode: 'READ_STATE_AFTER_ACTIONS',
      error: error.message,
      observedAt: isoDate(now),
    });
  }

  return {
    schemaVersion: CARE_AGENT_LOOP_SCHEMA_VERSION,
    mode: 'DETERMINISTIC_POLICY_AGENT',
    goals: CareAgentGoals,
    toolRegistry: toolRegistrySnapshot,
    initialObservation,
    finalObservation,
    plans,
    finalPlan,
    decision: summarizeDecision(finalPlan),
    plannerTrace: planner.plannerTrace,
    toolResults,
    finalState,
    decisionLog: finalState.decisionLog,
    fallbackUsed,
    replanCount: Math.max(0, plans.length - 1),
    completed: !toolResults.some((result) => result.status === 'failed'),
  };
}

