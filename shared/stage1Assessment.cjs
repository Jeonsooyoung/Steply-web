'use strict';

const stage3Contract = typeof require === 'function'
  ? require('./stage3Contract.cjs')
  : null;

function requireStage3Contract(operation) {
  if (!stage3Contract?.[operation]) throw new Error(`Stage 3 contract operation is unavailable: ${operation}`);
  return stage3Contract[operation];
}

const ASSESSMENT_SESSION_SCHEMA_VERSION = 'assessment_session.v2';
const LEGACY_ASSESSMENT_SESSION_SCHEMA_VERSION = 'assessment_session.v1';
const STEADI_SESSION_RULE_VERSION = 'steadi_stage1.v1';

const RiskLevel = Object.freeze({
  NotScorable: 'NOT_SCORABLE',
  Low: 'LOW',
  Moderate: 'MODERATE',
  High: 'HIGH',
});

const FallCount = Object.freeze({
  Zero: 'ZERO',
  One: 'ONE',
  TwoOrMore: 'TWO_OR_MORE',
  ZERO: 'ZERO',
  ONE: 'ONE',
  TWO_OR_MORE: 'TWO_OR_MORE',
});

const Sex = Object.freeze({
  Male: 'MALE',
  Female: 'FEMALE',
  MALE: 'MALE',
  FEMALE: 'FEMALE',
});

const AssessmentSessionStatus = Object.freeze({
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
});

const AssessmentSlotStatus = Object.freeze({
  NotStarted: 'NOT_STARTED',
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  NeedsRetry: 'NEEDS_RETRY',
});

const PrescriptionStatus = Object.freeze({
  NotGenerated: 'NOT_GENERATED',
  Blocked: 'BLOCKED',
  Active: 'ACTIVE',
  PendingProfessionalReview: 'PENDING_PROFESSIONAL_REVIEW',
});

const AssessmentSessionEventTypes = Object.freeze({
  ProfileUpdated: 'PROFILE_UPDATED',
  ScreeningUpdated: 'SCREENING_UPDATED',
  OperationalContextUpdated: 'OPERATIONAL_CONTEXT_UPDATED',
  TestStarted: 'TEST_STARTED',
  TestResultAccepted: 'TEST_RESULT_ACCEPTED',
  TestResultInvalid: 'TEST_RESULT_INVALID',
  TestNeedsRetry: 'TEST_NEEDS_RETRY',
  ProfessionalApprovalRecorded: 'PROFESSIONAL_APPROVAL_RECORDED',
  ExerciseSessionResultRecorded: 'EXERCISE_SESSION_RESULT_RECORDED',
  ProgressionProposed: 'PROGRESSION_PROPOSED',
  ProgressionApprovalRecorded: 'PROGRESSION_APPROVAL_RECORDED',
  SessionCancelled: 'SESSION_CANCELLED',
});

function prescriptionStatusFromPlan(plan) {
  if (!plan) return PrescriptionStatus.NotGenerated;
  if (plan.status === 'PENDING_PROFESSIONAL_REVIEW') return PrescriptionStatus.PendingProfessionalReview;
  if (plan.status === 'ACTIVE') return PrescriptionStatus.Active;
  return PrescriptionStatus.Blocked;
}

function doseCompletedAtLeast(completed = {}, prescribed = {}) {
  return ['repetitions', 'repetitionsPerSide', 'steps', 'holdSeconds'].every((key) => (
    prescribed[key] === null || prescribed[key] === undefined || completed[key] >= prescribed[key]
  )) && completed.sets >= prescribed.sets;
}

function validateProgressionProposalEvidence(prescription, proposal) {
  const plan = prescription.plan;
  if (!plan || plan.status !== 'ACTIVE') throw new Error('Progression proposal requires an active prescription');
  if (plan.riskLevel === RiskLevel.High) throw new Error('HIGH progression requires a separate professional reassessment');
  const exercise = plan.selectedExercises.find((item) => item.exerciseId === proposal.exerciseId);
  if (!exercise || exercise.level !== proposal.fromLevel || exercise.variantId !== proposal.fromVariantId) {
    throw new Error('Progression proposal does not match the current prescription');
  }
  if (!['S1', 'S2', 'S3', 'S4', 'S5', 'B1', 'B5', 'B7', 'B11'].includes(exercise.exerciseId)) {
    throw new Error('Automatic progression is unavailable for this exercise');
  }
  const matching = (prescription.sessionResults || [])
    .filter((result) => result.exerciseId === exercise.exerciseId && result.variantId === exercise.variantId)
    .sort((first, second) => second.completedAt - first.completedAt);
  const latest = matching.slice(0, 2);
  if (latest.length !== 2 || new Set(latest.map((item) => item.exerciseSessionId)).size !== 2) {
    throw new Error('Progression requires two distinct consecutive exercise sessions');
  }
  if (canonicalKey(latest.map((item) => item.exerciseSessionId).sort()) !== canonicalKey([...proposal.qualifyingSessionIds].sort())) {
    throw new Error('Progression proposal must cite the two latest qualifying sessions');
  }
  const prescribedDosage = {
    repetitions: exercise.repetitions,
    sets: exercise.sets,
    repetitionsPerSide: exercise.repetitionsPerSide,
    steps: exercise.steps,
    holdSeconds: exercise.holdSeconds,
  };
  for (const result of latest) {
    if (
      result.status !== 'COMPLETED'
      || result.formAccurate !== true
      || result.safetyEvents.length !== 0
      || canonicalKey(result.prescribedDosage) !== canonicalKey(prescribedDosage)
      || !doseCompletedAtLeast(result.completedDosage, result.prescribedDosage)
    ) throw new Error('Progression session was not completed exactly and safely');
    if (exercise.category === 'STRENGTH') {
      const repetitions = ['S1', 'S2', 'S3'].includes(exercise.exerciseId)
        ? result.completedDosage.repetitionsPerSide
        : result.completedDosage.repetitions;
      if (repetitions < 10 || result.completedDosage.sets < 2) throw new Error('Strength progression requires 10 repetitions x 2 sets');
    }
    if (exercise.category === 'BALANCE' && (result.lowerBodyRecoveryWithoutGripping !== true || result.supportUsed !== false)) {
      throw new Error('Balance progression requires lower-body recovery without gripping support');
    }
  }
}

const FunctionalTestSlots = Object.freeze({
  ChairStand: 'CHAIR_STAND_30S',
  FourStageBalance: 'FOUR_STAGE_BALANCE',
});

const chairStandBelowAverageTable = Object.freeze({
  [Sex.Male]: Object.freeze([
    [60, 64, 14], [65, 69, 12], [70, 74, 12], [75, 79, 11],
    [80, 84, 10], [85, 89, 8], [90, 94, 7],
  ]),
  [Sex.Female]: Object.freeze([
    [60, 64, 12], [65, 69, 11], [70, 74, 10], [75, 79, 10],
    [80, 84, 9], [85, 89, 8], [90, 94, 4],
  ]),
});

const reducerMetadataBySessionId = new Map();

function reducerMetadata(sessionId) {
  if (!reducerMetadataBySessionId.has(sessionId)) {
    reducerMetadataBySessionId.set(sessionId, { processedMessageIds: new Set(), outcome: 'CREATED' });
  }
  return reducerMetadataBySessionId.get(sessionId);
}

function reductionOutcome(sessionOrId) {
  const sessionId = typeof sessionOrId === 'string' ? sessionOrId : sessionOrId?.assessmentSessionId;
  return reducerMetadata(sessionId).outcome;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = canonicalValue(value[key]);
    return result;
  }, {});
}

function canonicalKey(value) {
  return JSON.stringify(canonicalValue(value));
}

function normalizeOperationalContext(value = {}) {
  const version = value.operationalConfigVersion ?? null;
  if (version !== null && version !== 'stage2_operational.v1') throw new Error('Unsupported operationalConfigVersion');
  const source = value.supportRoiNormalized;
  let supportRoiNormalized = null;
  if (source != null) {
    const values = [source.x, source.y, source.width, source.height];
    if (!values.every((item) => typeof item === 'number' && Number.isFinite(item))) throw new Error('Invalid supportRoiNormalized');
    if (source.x < 0 || source.y < 0 || source.width <= 0 || source.height <= 0 || source.x + source.width > 1 || source.y + source.height > 1) {
      throw new Error('Invalid supportRoiNormalized');
    }
    supportRoiNormalized = { x: source.x, y: source.y, width: source.width, height: source.height };
  }
  return { operationalConfigVersion: version, supportRoiNormalized };
}

function chairStandBelowAverageThreshold(ageYears, sex) {
  const age = finiteNumber(ageYears);
  const rows = chairStandBelowAverageTable[sex];
  if (age === null || !rows) return null;
  const row = rows.find(([minimum, maximum]) => age >= minimum && age <= maximum);
  return row ? row[2] : null;
}

function notScorable(reasonCodes, inputs) {
  return {
    riskLevel: RiskLevel.NotScorable,
    strengthProblem: null,
    balanceProblem: null,
    step1AtRisk: null,
    step2Problem: null,
    reasonCodes: [...new Set(reasonCodes)],
    complete: false,
    inputs,
    appliedRuleVersion: STEADI_SESSION_RULE_VERSION,
  };
}

function scoreSteadiAssessmentSession(input = {}) {
  const screening = input.screening || {};
  const profile = input.profile || {};
  const chairStand = input.chairStand || {};
  const balance = input.balance || {};
  const reasons = [];

  for (const key of ['fallenPastYear', 'feelsUnsteady', 'worriedAboutFalling']) {
    if (typeof screening[key] !== 'boolean') reasons.push(`MISSING_SCREENING_${key.toUpperCase()}`);
  }
  if (!Object.values(FallCount).includes(screening.fallCount)) reasons.push('MISSING_OR_INVALID_FALL_COUNT');
  if (screening.fallenPastYear === true && typeof screening.injuriousFall !== 'boolean') {
    reasons.push('MISSING_SCREENING_INJURIOUSFALL');
  }
  if (profile.sex !== Sex.Male && profile.sex !== Sex.Female) reasons.push('MISSING_OR_INVALID_SEX');
  const ageYears = finiteNumber(profile.ageYears);
  if (ageYears === null) reasons.push('MISSING_OR_INVALID_AGE');
  if (chairStand.status !== 'VALID') reasons.push('CHAIR_STAND_NOT_VALID');
  const completedRepetitions = finiteNumber(chairStand.completedRepetitions);
  if (completedRepetitions === null || completedRepetitions < 0) reasons.push('MISSING_CHAIR_STAND_REPETITIONS');
  if (typeof chairStand.armUseConfirmed !== 'boolean') reasons.push('MISSING_CHAIR_STAND_ARM_USE');
  if (balance.status !== 'VALID') reasons.push('BALANCE_NOT_VALID');
  const tandemHoldSeconds = finiteNumber(balance.tandemHoldSeconds);
  if (tandemHoldSeconds === null || tandemHoldSeconds < 0) reasons.push('MISSING_TANDEM_HOLD_SECONDS');

  const threshold = chairStandBelowAverageThreshold(ageYears, profile.sex);
  if (ageYears !== null && (profile.sex === Sex.Male || profile.sex === Sex.Female) && threshold === null) {
    reasons.push('CHAIR_STAND_REFERENCE_NOT_AVAILABLE');
  }

  const inputs = {
    screening: {
      fallenPastYear: screening.fallenPastYear ?? null,
      feelsUnsteady: screening.feelsUnsteady ?? null,
      worriedAboutFalling: screening.worriedAboutFalling ?? null,
      fallCount: screening.fallCount ?? null,
      injuriousFall: screening.injuriousFall ?? null,
    },
    profile: { ageYears, sex: profile.sex ?? null },
    chairStand: {
      status: chairStand.status ?? null,
      completedRepetitions,
      armUseConfirmed: chairStand.armUseConfirmed ?? null,
      belowAverageThreshold: threshold,
    },
    balance: { status: balance.status ?? null, tandemHoldSeconds, referenceSeconds: 10 },
  };

  if (reasons.length) return notScorable(reasons, inputs);

  const officialChairStandScore = chairStand.armUseConfirmed ? 0 : completedRepetitions;
  const strengthProblem = officialChairStandScore < threshold;
  const balanceProblem = tandemHoldSeconds < 10;
  const step1AtRisk = screening.fallenPastYear
    || screening.feelsUnsteady
    || screening.worriedAboutFalling;
  const step2Problem = strengthProblem || balanceProblem;
  let riskLevel;

  if (!step1AtRisk || !step2Problem) {
    riskLevel = RiskLevel.Low;
  } else if (screening.injuriousFall || screening.fallCount === FallCount.TwoOrMore) {
    riskLevel = RiskLevel.High;
  } else {
    riskLevel = RiskLevel.Moderate;
  }

  return {
    riskLevel,
    strengthProblem,
    balanceProblem,
    step1AtRisk,
    step2Problem,
    reasonCodes: [
      step1AtRisk ? 'STEP1_AT_RISK' : 'STEP1_NOT_AT_RISK',
      strengthProblem ? 'CHAIR_STAND_BELOW_REFERENCE' : 'CHAIR_STAND_AT_OR_ABOVE_REFERENCE',
      balanceProblem ? 'TANDEM_UNDER_10_SECONDS' : 'TANDEM_AT_LEAST_10_SECONDS',
      `RISK_${riskLevel}`,
    ],
    complete: true,
    inputs: {
      ...inputs,
      chairStand: { ...inputs.chairStand, officialCompletedRepetitions: officialChairStandScore },
    },
    appliedRuleVersion: STEADI_SESSION_RULE_VERSION,
  };
}

function emptyTestSlot() {
  return {
    status: AssessmentSlotStatus.NotStarted,
    acceptedAttemptId: null,
    acceptedResult: null,
    attempts: [],
  };
}

function normalizeProfileSnapshot(profile = {}) {
  const rawSex = String(profile.sex || profile.gender || '').trim().toUpperCase();
  const birthYear = finiteNumber(profile.birthYear ?? profile.birth_year);
  return {
    birthYear: birthYear === null ? null : Math.trunc(birthYear),
    ageYears: finiteNumber(profile.ageYears ?? profile.age),
    sex: rawSex === Sex.Male || rawSex === Sex.Female ? rawSex : null,
  };
}

function normalizeScreening(screening = {}) {
  const responses = screening.responses || screening;
  const fallHistory = screening.fallHistory || screening;
  const count = fallHistory.count ?? fallHistory.fallCount;
  return {
    status: screening.status || AssessmentSlotStatus.NotStarted,
    responses: {
      fallenPastYear: typeof responses.fallenPastYear === 'boolean' ? responses.fallenPastYear : null,
      feelsUnsteady: typeof responses.feelsUnsteady === 'boolean' ? responses.feelsUnsteady : null,
      worriedAboutFalling: typeof responses.worriedAboutFalling === 'boolean' ? responses.worriedAboutFalling : null,
    },
    fallHistory: {
      count: Object.values(FallCount).includes(count) ? count : null,
      injuriousFall: typeof fallHistory.injuriousFall === 'boolean' ? fallHistory.injuriousFall : null,
    },
  };
}

function clinicalInputFromAcceptedResult(result, assessmentType) {
  if (!result) return {};
  if (assessmentType === FunctionalTestSlots.ChairStand) {
    if (result.resultSchemaVersion === 'stage2_assessment_result.v1') {
      return {
        status: result.status,
        completedRepetitions: result.chairStand?.cdcScoredRepetitions,
        armUseConfirmed: result.chairStand?.armUse?.outcome === 'DISQUALIFIED',
      };
    }
    return {
      status: result.status,
      completedRepetitions: result.completedRepetitions,
      armUseConfirmed: result.armUseConfirmed,
    };
  }
  if (result.resultSchemaVersion === 'stage2_assessment_result.v1') {
    const tandem = result.balance?.stages?.find((stage) => stage.stage === 'TANDEM');
    return { status: result.status, tandemHoldSeconds: tandem?.holdSeconds };
  }
  return { status: result.status, tandemHoldSeconds: result.tandemHoldSeconds };
}

function mergedVulnerabilityAssessment(session) {
  const values = Object.values(session.functionalTests || {})
    .map((slot) => slot?.acceptedResult?.vulnerabilityAssessment)
    .filter(Boolean);
  if (!values.length) return null;
  const activeIds = [...new Set(values.flatMap((value) => value.activeIds || []))].sort();
  const evidenceByKey = new Map();
  for (const value of values) {
    for (const evidence of value.evidence || []) {
      const key = `${evidence.vulnerabilityId}:${evidence.sourceResultId || ''}:${canonicalKey(evidence.measurements || {})}`;
      evidenceByKey.set(key, evidence);
    }
  }
  const ruleVersions = [...new Set(values.map((value) => value.ruleVersion))];
  return {
    ruleVersion: ruleVersions.length === 1 ? ruleVersions[0] : ruleVersions.sort().join('+'),
    activeIds,
    evidence: [...evidenceByKey.values()],
  };
}

function scoringInputFromSession(session) {
  const screening = session.screening || normalizeScreening();
  return {
    screening: {
      ...screening.responses,
      fallCount: screening.fallHistory.count,
      injuriousFall: screening.fallHistory.injuriousFall,
    },
    profile: session.profileSnapshot || {},
    chairStand: clinicalInputFromAcceptedResult(
      session.functionalTests?.[FunctionalTestSlots.ChairStand]?.acceptedResult,
      FunctionalTestSlots.ChairStand,
    ),
    balance: clinicalInputFromAcceptedResult(
      session.functionalTests?.[FunctionalTestSlots.FourStageBalance]?.acceptedResult,
      FunctionalTestSlots.FourStageBalance,
    ),
  };
}

function sessionSteadi(score) {
  return {
    status: score.riskLevel === RiskLevel.NotScorable ? 'NOT_SCORABLE' : 'SCORED',
    riskLevel: score.riskLevel,
    strengthProblem: score.strengthProblem,
    balanceProblem: score.balanceProblem,
    step1AtRisk: score.step1AtRisk,
    step2Problem: score.step2Problem,
    reasonCodes: score.reasonCodes,
    ruleVersion: STEADI_SESSION_RULE_VERSION,
  };
}

function finalizeClinicalState(session, now = session.updatedAt) {
  const calculatedScore = scoreSteadiAssessmentSession(scoringInputFromSession(session));
  const score = session.screening?.status === AssessmentSlotStatus.Completed
    ? calculatedScore
    : notScorable(
      [...(calculatedScore.reasonCodes || []), 'SCREENING_NOT_COMPLETED'],
      calculatedScore.inputs,
    );
  const scored = score.riskLevel !== RiskLevel.NotScorable;
  const cancelled = session.status === AssessmentSessionStatus.Cancelled;
  return {
    ...session,
    vulnerabilityAssessment: mergedVulnerabilityAssessment(session),
    steadi: sessionSteadi(score),
    status: cancelled
      ? AssessmentSessionStatus.Cancelled
      : scored
        ? AssessmentSessionStatus.Completed
        : session.status,
    completedAt: cancelled || scored ? (session.completedAt || now) : null,
    exercisePrescription: scored ? session.exercisePrescription : {
      status: PrescriptionStatus.NotGenerated,
      plan: null,
      sessionResults: [],
    },
  };
}

function createAssessmentSession({
  assessmentSessionId,
  connectionSessionId = null,
  profile = {},
  profileId = profile.id || profile.userId,
  screening = {},
  createdAt = Date.now(),
} = {}) {
  if (!assessmentSessionId) throw new Error('assessmentSessionId is required');
  if (!profileId) throw new Error('profileId is required');
  reducerMetadata(assessmentSessionId);
  return finalizeClinicalState({
    schemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
    assessmentSessionId,
    connectionSessionId,
    profileId: String(profileId),
    revision: 0,
    status: AssessmentSessionStatus.InProgress,
    screening: normalizeScreening(screening),
    profileSnapshot: normalizeProfileSnapshot(profile),
    operationalContext: normalizeOperationalContext(),
    functionalTests: {
      [FunctionalTestSlots.FourStageBalance]: emptyTestSlot(),
      [FunctionalTestSlots.ChairStand]: emptyTestSlot(),
    },
    steadi: null,
    vulnerabilityAssessment: null,
    exercisePrescription: { status: PrescriptionStatus.NotGenerated, plan: null, sessionResults: [] },
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
  }, createdAt);
}

function withMutation(session, event, patch) {
  // Mobile and PC wall clocks can differ slightly. Never let an event from the
  // PC move a phone-created session backwards in time, because the shared
  // mobile contract requires createdAt <= updatedAt.
  const requestedAt = finiteNumber(event.at) ?? Date.now();
  const now = Math.max(
    requestedAt,
    finiteNumber(session.createdAt) ?? requestedAt,
    finiteNumber(session.updatedAt) ?? requestedAt,
  );
  return finalizeClinicalState({
    ...session,
    ...patch,
    revision: session.revision + 1,
    updatedAt: now,
  }, now);
}

function reduceAssessmentSession(session, event = {}) {
  if (!session || session.schemaVersion !== ASSESSMENT_SESSION_SCHEMA_VERSION) {
    throw new Error('A canonical assessment_session.v2 snapshot is required');
  }
  const metadata = reducerMetadata(session.assessmentSessionId);
  if (!event.messageId) throw new Error('Assessment session event messageId is required');
  if (metadata.processedMessageIds.has(event.messageId)) {
    metadata.outcome = 'DUPLICATE_MESSAGE';
    return session;
  }
  if (Number.isInteger(event.expectedRevision) && event.expectedRevision !== session.revision) {
    metadata.outcome = 'REVISION_CONFLICT';
    return session;
  }
  if (session.status === AssessmentSessionStatus.Cancelled) {
    metadata.outcome = 'SESSION_CANCELLED';
    return session;
  }

  const applied = (next, outcome) => {
    metadata.processedMessageIds.add(event.messageId);
    metadata.outcome = outcome;
    return next;
  };
  const ignored = (outcome) => {
    metadata.outcome = outcome;
    return session;
  };

  if (event.type === AssessmentSessionEventTypes.ProfileUpdated) {
    return applied(withMutation(session, event, {
      profileId: String(event.profile?.id || event.profile?.userId || session.profileId),
      profileSnapshot: normalizeProfileSnapshot(event.profile),
    }), 'PROFILE_UPDATED');
  }
  if (event.type === AssessmentSessionEventTypes.ScreeningUpdated) {
    const screening = normalizeScreening(event.screening);
    const screeningComplete = Object.values(screening.responses).every((value) => typeof value === 'boolean')
      && screening.fallHistory.count !== null
      && typeof screening.fallHistory.injuriousFall === 'boolean';
    if (!event.screening?.status) {
      screening.status = screeningComplete
        ? AssessmentSlotStatus.Completed
        : AssessmentSlotStatus.InProgress;
    }
    return applied(withMutation(session, event, {
      screening,
    }), 'SCREENING_UPDATED');
  }
  if (event.type === AssessmentSessionEventTypes.OperationalContextUpdated) {
    return applied(withMutation(session, event, {
      operationalContext: normalizeOperationalContext(event.operationalContext),
    }), 'OPERATIONAL_CONTEXT_UPDATED');
  }
  if (event.type === AssessmentSessionEventTypes.TestStarted) {
    if (!Object.values(FunctionalTestSlots).includes(event.slot)) return ignored('UNKNOWN_TEST_SLOT');
    const slot = session.functionalTests[event.slot];
    const attempt = {
      attemptId: event.attemptId,
      analysisSessionId: event.analysisSessionId || event.attemptId,
      status: 'IN_PROGRESS',
      startedAt: event.startedAt || event.at || Date.now(),
      completedAt: null,
      supersedesAttemptId: slot.acceptedAttemptId,
      resultHash: null,
      result: null,
    };
    if (!attempt.attemptId) return ignored('MISSING_ATTEMPT_ID');
    return applied(withMutation(session, event, {
      functionalTests: {
        ...session.functionalTests,
        [event.slot]: { ...slot, status: AssessmentSlotStatus.InProgress, attempts: [...slot.attempts, attempt] },
      },
    }), 'TEST_STARTED');
  }
  if (event.type === AssessmentSessionEventTypes.TestNeedsRetry) {
    if (!Object.values(FunctionalTestSlots).includes(event.slot)) return ignored('UNKNOWN_TEST_SLOT');
    return applied(withMutation(session, event, {
      functionalTests: {
        ...session.functionalTests,
        [event.slot]: { ...session.functionalTests[event.slot], status: AssessmentSlotStatus.NeedsRetry },
      },
    }), 'TEST_NEEDS_RETRY');
  }
  if (event.type === AssessmentSessionEventTypes.TestResultInvalid) {
    if (!Object.values(FunctionalTestSlots).includes(event.slot) || !event.attemptId || !event.attemptResult) return ignored('INVALID_TEST_RESULT_EVENT');
    const slot = session.functionalTests[event.slot];
    const resultHash = event.attemptResult.resultHash;
    if (slot.attempts.some((attempt) => attempt.resultHash === resultHash)) return ignored('DUPLICATE_TEST_RESULT');
    const completedAt = finiteNumber(event.attemptResult.completedAt);
    if (completedAt === null) return ignored('INVALID_TEST_RESULT_EVENT');
    const nextAttempt = {
      attemptId: event.attemptId,
      analysisSessionId: event.attemptResult.analysisSessionId,
      status: event.attemptResult.status,
      startedAt: event.startedAt || completedAt,
      completedAt,
      supersedesAttemptId: slot.acceptedAttemptId,
      resultHash,
      result: event.attemptResult,
    };
    const attempts = slot.attempts.some((attempt) => attempt.attemptId === event.attemptId)
      ? slot.attempts.map((attempt) => attempt.attemptId === event.attemptId ? { ...attempt, ...nextAttempt } : attempt)
      : [...slot.attempts, nextAttempt];
    return applied(withMutation(session, event, {
      functionalTests: {
        ...session.functionalTests,
        [event.slot]: { ...slot, status: AssessmentSlotStatus.NeedsRetry, attempts },
      },
    }), 'INVALID_TEST_RESULT_RECORDED');
  }
  if (event.type === AssessmentSessionEventTypes.TestResultAccepted) {
    if (!Object.values(FunctionalTestSlots).includes(event.slot) || !event.attemptId || !event.acceptedResult) return ignored('INVALID_TEST_RESULT_EVENT');
    const slot = session.functionalTests[event.slot];
    if (slot.acceptedAttemptId === event.attemptId) return ignored('DUPLICATE_TEST_RESULT');
    const completedAt = finiteNumber(event.acceptedResult.completedAt);
    const currentCompletedAt = finiteNumber(slot.acceptedResult?.completedAt);
    if (completedAt === null) return ignored('INVALID_TEST_RESULT_EVENT');
    if (currentCompletedAt !== null && completedAt <= currentCompletedAt) return ignored('STALE_TEST_ATTEMPT');
    const attempts = slot.attempts.some((attempt) => attempt.attemptId === event.attemptId)
      ? slot.attempts.map((attempt) => attempt.attemptId === event.attemptId
        ? { ...attempt, status: 'VALID', completedAt, resultHash: event.acceptedResult.resultHash, result: null }
        : attempt)
      : [...slot.attempts, {
        attemptId: event.attemptId,
        analysisSessionId: event.acceptedResult.analysisSessionId,
        status: 'VALID',
        startedAt: event.startedAt || completedAt,
        completedAt,
        supersedesAttemptId: slot.acceptedAttemptId,
        resultHash: event.acceptedResult.resultHash,
        result: null,
      }];
    const next = withMutation(session, event, {
      functionalTests: {
        ...session.functionalTests,
        [event.slot]: {
          status: AssessmentSlotStatus.Completed,
          acceptedAttemptId: event.attemptId,
          acceptedResult: event.acceptedResult,
          attempts,
        },
      },
    });
    if (next.steadi.status !== 'SCORED' || !event.exercisePlan) return applied(next, 'TEST_RESULT_ACCEPTED');
    const exercisePlan = requireStage3Contract('normalizeOtagoPrescriptionPlan')(event.exercisePlan);
    return applied({
      ...next,
      exercisePrescription: {
        status: prescriptionStatusFromPlan(exercisePlan),
        plan: exercisePlan,
        sessionResults: next.exercisePrescription?.sessionResults || [],
      },
    }, 'TEST_RESULT_ACCEPTED');
  }
  if (event.type === AssessmentSessionEventTypes.ProfessionalApprovalRecorded) {
    if (!session.exercisePrescription?.plan) return ignored('PRESCRIPTION_NOT_GENERATED');
    const plan = requireStage3Contract('applyProfessionalApproval')(session.exercisePrescription.plan, event.professionalApproval);
    return applied(withMutation(session, event, {
      exercisePrescription: {
        ...session.exercisePrescription,
        status: prescriptionStatusFromPlan(plan),
        plan,
      },
    }), 'PROFESSIONAL_APPROVAL_RECORDED');
  }
  if (event.type === AssessmentSessionEventTypes.ExerciseSessionResultRecorded) {
    if (!session.exercisePrescription?.plan) return ignored('PRESCRIPTION_NOT_GENERATED');
    if (session.exercisePrescription.status !== PrescriptionStatus.Active) return ignored('PRESCRIPTION_NOT_ACTIVE');
    const result = requireStage3Contract('normalizeExerciseSessionResult')(event.result);
    if (result.planId !== session.exercisePrescription.plan.planId) return ignored('EXERCISE_RESULT_PLAN_MISMATCH');
    const existing = session.exercisePrescription.sessionResults || [];
    const sameResult = existing.find((item) => item.resultId === result.resultId);
    if (sameResult) {
      return canonicalKey(sameResult) === canonicalKey(result)
        ? ignored('DUPLICATE_EXERCISE_SESSION_RESULT')
        : ignored('EXERCISE_RESULT_CONFLICT');
    }
    if (existing.some((item) => item.exerciseSessionId === result.exerciseSessionId)) return ignored('EXERCISE_SESSION_CONFLICT');
    return applied(withMutation(session, event, {
      exercisePrescription: {
        ...session.exercisePrescription,
        sessionResults: [...existing, result],
      },
    }), 'EXERCISE_SESSION_RESULT_RECORDED');
  }
  if (event.type === AssessmentSessionEventTypes.ProgressionProposed) {
    if (!session.exercisePrescription?.plan) return ignored('PRESCRIPTION_NOT_GENERATED');
    const proposal = requireStage3Contract('normalizeProgressionProposal')(event.proposal);
    validateProgressionProposalEvidence(session.exercisePrescription, proposal);
    if (session.exercisePrescription.plan.progressionProposals.some((item) => item.proposalId === proposal.proposalId)) {
      return ignored('DUPLICATE_PROGRESSION_PROPOSAL');
    }
    const plan = requireStage3Contract('normalizeOtagoPrescriptionPlan')({
      ...session.exercisePrescription.plan,
      progressionProposals: [...session.exercisePrescription.plan.progressionProposals, proposal],
    });
    return applied(withMutation(session, event, {
      exercisePrescription: {
        ...session.exercisePrescription,
        plan,
      },
    }), 'PROGRESSION_PROPOSED');
  }
  if (event.type === AssessmentSessionEventTypes.ProgressionApprovalRecorded) {
    if (!session.exercisePrescription?.plan) return ignored('PRESCRIPTION_NOT_GENERATED');
    const plan = requireStage3Contract('applyProgressionApproval')(session.exercisePrescription.plan, event.proposalId, event.approval);
    return applied(withMutation(session, event, {
      exercisePrescription: {
        ...session.exercisePrescription,
        plan,
      },
    }), 'PROGRESSION_APPROVAL_RECORDED');
  }
  if (event.type === AssessmentSessionEventTypes.SessionCancelled) {
    return applied(withMutation(session, event, { status: AssessmentSessionStatus.Cancelled, completedAt: event.at || Date.now() }), 'SESSION_CANCELLED');
  }
  return ignored('UNKNOWN_EVENT_TYPE');
}

function normalizeLegacyAcceptedResult(result, assessmentType, hash = null) {
  if (!result) return null;
  const common = {
    resultSchemaVersion: 'legacy_assessment_result.v1',
    resultId: result.resultId,
    attemptId: result.attemptId,
    analysisSessionId: result.analysisSessionId,
    assessmentType,
    status: result.status,
    source: result.source,
    completedAt: result.completedAt,
    legacyReadOnly: true,
  };
  const typed = assessmentType === FunctionalTestSlots.ChairStand
    ? { completedRepetitions: result.completedRepetitions, armUseConfirmed: result.armUseConfirmed }
    : { tandemHoldSeconds: result.tandemHoldSeconds };
  if (typeof hash !== 'function') throw new Error('Legacy accepted result upcast requires a canonical SHA-256 function');
  return { ...common, ...typed, resultHash: hash({ ...common, ...typed }) };
}

function upcastAssessmentSessionV1(snapshot, options = {}) {
  if (!snapshot || snapshot.schemaVersion !== LEGACY_ASSESSMENT_SESSION_SCHEMA_VERSION) return snapshot;
  const functionalTests = Object.fromEntries(Object.entries(snapshot.functionalTests || {}).map(([assessmentType, slot]) => {
    const acceptedResult = normalizeLegacyAcceptedResult(slot?.acceptedResult, assessmentType, options.canonicalHash);
    return [assessmentType, {
      ...emptyTestSlot(),
      ...slot,
      acceptedResult,
      attempts: (slot?.attempts || []).map((attempt) => ({
        ...attempt,
        resultHash: attempt.attemptId === slot?.acceptedAttemptId ? acceptedResult?.resultHash || null : null,
        result: null,
      })),
    }];
  }));
  return {
    ...snapshot,
    schemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
    operationalContext: normalizeOperationalContext(),
    functionalTests,
    vulnerabilityAssessment: null,
    // Legacy recommendation payloads were not a strict Otago prescription and
    // cannot be promoted without inventing exercise IDs or dosage.
    exercisePrescription: { status: PrescriptionStatus.NotGenerated, plan: null, sessionResults: [] },
  };
}

const stage1AssessmentExports = {
  ASSESSMENT_SESSION_SCHEMA_VERSION,
  LEGACY_ASSESSMENT_SESSION_SCHEMA_VERSION,
  STEADI_SESSION_RULE_VERSION,
  RiskLevel,
  FallCount,
  Sex,
  AssessmentSessionStatus,
  AssessmentSlotStatus,
  PrescriptionStatus,
  AssessmentSessionEventTypes,
  FunctionalTestSlots,
  chairStandBelowAverageThreshold,
  scoreSteadiAssessmentSession,
  createAssessmentSession,
  reduceAssessmentSession,
  reductionOutcome,
  scoringInputFromSession,
  upcastAssessmentSessionV1,
};

if (typeof module !== 'undefined' && module.exports) module.exports = stage1AssessmentExports;
if (typeof globalThis !== 'undefined') globalThis.__steplyStage1Assessment = stage1AssessmentExports;
