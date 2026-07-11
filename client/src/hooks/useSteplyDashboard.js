import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  connectProfile,
  createSession,
  getAllHistory,
  getNetworkInfo,
  getSessionStatus,
  postFinalAnalysis,
  selectTest,
} from '../api/steplyApi';
import { buildDemoHistoryItems } from '../data/demoHistory';
import { demoProfile } from '../data/demoProfile';
import { useRemotePoseAnalysis } from './useRemotePoseAnalysis';
import { calculateSteadiFallRisk, SteadiRiskLevels as LegacySteadiRiskLevels } from '../pose/steadiRules';
import { SteplyV1TestTypes } from '../data/movementTests';
import { createFunctionalFindings } from '../pipeline/findings/functionalFindings.js';
import { createDeterministicOtagoExercisePlan } from '../pipeline/recommendation/otagoExerciseEngine.js';
import {
  CareAgentEventTypes,
  createMemoryCareAgentStore,
  runCareAgentLoop,
} from '../pipeline/agent/careAgent.js';
import {
  AssessmentResultStatuses as StructuredAssessmentStatuses,
  AssessmentTypes as StructuredAssessmentTypes,
  BalanceStages as StructuredBalanceStages,
  SteadiRiskLevels as StructuredSteadiRiskLevels,
} from '../pipeline/shared/types/index.js';
import { validateAssessmentResult } from '../pipeline/shared/validation/runtimeValidation.js';
import { recommendationLabel, resultFlagsFor, testLabel } from '../pipeline/ui/assessmentCopy.js';
import {
  UserScreenIds,
  activeStepFromScreen,
  screenFromActiveStep,
} from '../pipeline/ui/sessionFlow.js';
import {
  AssessmentResultTypes,
  AssessmentStatuses,
  ResultSources,
  assessmentTypeForTestType,
  canPersistAssessmentResult,
  canUseClinicalPipeline,
  withAssessmentMetadata,
} from '../pose/assessmentResultMetadata';

function normalizeFrameSource(frame, mimeType = 'image/jpeg') {
  if (typeof frame !== 'string') return '';
  const value = frame.trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  return `data:${mimeType || 'image/jpeg'};base64,${value}`;
}

function shouldUseDemoHistoryFixture() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demoHistory') === '1';
}

function initialSelectedTestFromUrl() {
  if (typeof window === 'undefined') return 'four_stage_balance';
  const requestedTest = new URLSearchParams(window.location.search).get('test');
  return SteplyV1TestTypes.includes(requestedTest)
    ? requestedTest
    : 'four_stage_balance';
}

function pairingTokenFromQrPayload(qrPayload) {
  if (!qrPayload) return '';
  try {
    return JSON.parse(qrPayload).pairingToken || '';
  } catch (_) {
    return '';
  }
}

function dashboardWebSocketUrl(bundle) {
  const value = bundle?.dashboardWsPath || bundle?.wsUrl || '';
  if (!value || !value.startsWith('/')) return value;
  if (typeof window === 'undefined') return value;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${value}`;
}

function timestampMsFrom(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) return numeric;
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return Date.now();
}

function isAssessmentFlowScreen(activeStep) {
  return [
    UserScreenIds.SafetyCheck,
    UserScreenIds.CameraSetup,
    UserScreenIds.Calibration,
    UserScreenIds.Assessment,
  ].includes(screenFromActiveStep(activeStep));
}

function activeStepForIncomingFrame(current) {
  if (screenFromActiveStep(current) === UserScreenIds.Exercise) return current;
  if (isAssessmentFlowScreen(current)) return current;
  return activeStepFromScreen(UserScreenIds.CameraSetup);
}

function structuredAssessmentFromLiveResult(baseResult = {}) {
  const candidate = baseResult.structuredAssessmentResult
    || baseResult.finalResponse?.result
    || baseResult.structuredPipeline?.assessmentResult
    || null;
  if (candidate) {
    return {
      value: candidate,
      validation: validateAssessmentResult(candidate),
    };
  }
  return {
    value: null,
    validation: {
      ok: false,
      failures: [{ code: 'MISSING_STRUCTURED_ASSESSMENT', message: 'Live result did not include a structured assessment result.' }],
    },
  };
}

const LEGACY_STEADI_RISK_TO_STRUCTURED = {
  [LegacySteadiRiskLevels.Low]: StructuredSteadiRiskLevels.Low,
  [LegacySteadiRiskLevels.Medium]: StructuredSteadiRiskLevels.Moderate,
  [LegacySteadiRiskLevels.High]: StructuredSteadiRiskLevels.High,
};

function legacyChairInputFromStructuredAssessment(assessment = {}) {
  if (assessment.assessmentType !== StructuredAssessmentTypes.ChairStand30s) return null;
  const completed = assessment.primaryMeasurements?.completedRepetitions;
  return {
    testType: 'chair_stand',
    repetitionCount: completed,
    primaryValue: completed,
    confidence: assessment.confidence,
  };
}

function legacyBalanceInputFromStructuredAssessment(assessment = {}) {
  if (assessment.assessmentType !== StructuredAssessmentTypes.FourStageBalance) return null;
  const stageKeyByStructuredStage = {
    [StructuredBalanceStages.SideBySide]: 'side_by_side',
    [StructuredBalanceStages.SemiTandem]: 'semi_tandem',
    [StructuredBalanceStages.Tandem]: 'tandem',
    [StructuredBalanceStages.OneLeg]: 'one_leg',
  };
  const stageById = {};
  for (const stage of assessment.primaryMeasurements?.stages || []) {
    const id = stageKeyByStructuredStage[stage.stage];
    if (!id) continue;
    stageById[id] = {
      id,
      holdSeconds: stage.holdDurationSeconds,
      confidence: stage.positionConfidence,
      status: stage.status,
    };
  }
  return {
    testType: 'four_stage_balance',
    stageById,
    stages: Object.values(stageById),
    confidence: assessment.confidence,
  };
}

function structuredSteadiScoreFromAssessment({ sourceAssessment, profile }) {
  const legacyScore = calculateSteadiFallRisk({
    chairStandResult: legacyChairInputFromStructuredAssessment(sourceAssessment),
    balanceResult: legacyBalanceInputFromStructuredAssessment(sourceAssessment),
    profile,
  });
  const riskLevel = LEGACY_STEADI_RISK_TO_STRUCTURED[legacyScore.riskLevel]
    || StructuredSteadiRiskLevels.NotScorable;
  return {
    value: {
      riskLevel,
      strengthProblem: Boolean(legacyScore.signals?.chairStandBelowAverage?.present),
      balanceProblem: Boolean(legacyScore.signals?.balanceTandem?.present),
      inputs: legacyScore.inputs || {},
      appliedRuleVersion: legacyScore.schemaVersion,
      reasonCodes: Object.values(legacyScore.signals || {})
        .filter((signal) => signal.present)
        .map((signal) => signal.id || signal.reason || 'STEADI_SIGNAL'),
      complete: legacyScore.complete,
      missingInputs: legacyScore.missingInputs || [],
    },
    validation: { ok: true, failures: [] },
    legacyScore,
  };
}

function primaryMetricFromStructuredAssessment(assessment = {}) {
  const source = assessment || {};
  if (source.assessmentType === StructuredAssessmentTypes.ChairStand30s) {
    return {
      metricKey: 'chairStandRepetitions',
      metricValue: source.primaryMeasurements?.completedRepetitions ?? null,
    };
  }
  if (source.assessmentType === StructuredAssessmentTypes.FourStageBalance) {
    const tandem = (source.primaryMeasurements?.stages || [])
      .find((stage) => stage.stage === StructuredBalanceStages.Tandem);
    return {
      metricKey: 'tandemHoldSeconds',
      metricValue: tandem?.holdDurationSeconds ?? null,
    };
  }
  return { metricKey: 'primaryValue', metricValue: null };
}

function trendMetricFromHistoryItem(item = {}) {
  const testType = item.testType || item.selectedTest;
  const completedAtMs = Number(item.completedAt ?? item.receivedAt ?? item.endedAt ?? item.createdAt ?? 0);
  if (testType === 'chair_stand') {
    const value = Number(item.repetitionCount ?? item.count ?? item.primaryValue);
    if (!Number.isFinite(value)) return null;
    return {
      trendId: `history-${item.id || item.assessmentId || completedAtMs || value}`,
      assessmentId: item.assessmentId || item.id || null,
      assessmentType: StructuredAssessmentTypes.ChairStand30s,
      metricKey: 'chairStandRepetitions',
      value,
      completedAtMs,
    };
  }
  if (testType === 'four_stage_balance') {
    const value = Number(item.primaryValue ?? item.count ?? item.holdSeconds);
    if (!Number.isFinite(value)) return null;
    return {
      trendId: `history-${item.id || item.assessmentId || completedAtMs || value}`,
      assessmentId: item.assessmentId || item.id || null,
      assessmentType: StructuredAssessmentTypes.FourStageBalance,
      metricKey: 'tandemHoldSeconds',
      value,
      completedAtMs,
    };
  }
  return null;
}

function recentTrendStateFromHistory(historyItems = []) {
  return historyItems
    .map(trendMetricFromHistoryItem)
    .filter(Boolean)
    .sort((first, second) => first.completedAtMs - second.completedAtMs)
    .slice(-5);
}

function structuredPipelineFromLiveResult({
  baseResult,
  session,
} = {}) {
  const structuredAssessment = structuredAssessmentFromLiveResult(baseResult);
  const sourceAssessment = structuredAssessment.value;
  const steadiScore = sourceAssessment
    ? structuredSteadiScoreFromAssessment({ sourceAssessment, profile: session.profile })
    : {
      value: {
        riskLevel: StructuredSteadiRiskLevels.NotScorable,
        reasonCodes: ['MISSING_STRUCTURED_ASSESSMENT'],
      },
      validation: { ok: false, failures: [{ code: 'MISSING_STRUCTURED_ASSESSMENT' }] },
    };
  const structuredRiskLevel = steadiScore.value.riskLevel;
  const canUseStructuredResult = Boolean(
    sourceAssessment
      && structuredAssessment.validation.ok
      && sourceAssessment.status === StructuredAssessmentStatuses.Valid
      && sourceAssessment.metadata?.isClinicallyScorable !== false
  );

  if (!canUseStructuredResult) {
    return {
      assessmentResult: sourceAssessment,
      assessmentValidation: structuredAssessment.validation,
      functionalFindings: [],
      functionalFindingValidation: {
        ok: false,
        failures: [{ code: 'STRUCTURED_RESULT_NOT_SCORABLE', message: 'Structured findings require a valid live assessment.' }],
      },
      exercisePlan: null,
      exercisePlanValidation: {
        ok: false,
        failures: [{ code: 'STRUCTURED_EXERCISE_PLAN_NOT_CREATED', message: 'Exercise plan was not created for an invalid assessment.' }],
      },
      steadiScore: steadiScore.value,
      steadiScoreValidation: steadiScore.validation,
      steadiRiskLevel: structuredRiskLevel,
      reasonCodes: ['STRUCTURED_RESULT_NOT_SCORABLE'],
    };
  }

  const findingInput = sourceAssessment.assessmentType === StructuredAssessmentTypes.ChairStand30s
    ? { chairStandResult: sourceAssessment }
    : { balanceResult: sourceAssessment };
  const findings = createFunctionalFindings({
    ...findingInput,
    assessmentResults: [sourceAssessment],
    profile: session.profile,
  });
  const exercisePlan = createDeterministicOtagoExercisePlan({
    userId: session.profile?.id || session.id,
    findings: findings.value,
    steadiScore: steadiScore.value,
    riskLevel: structuredRiskLevel,
    sourceAssessments: [sourceAssessment],
  });

  return {
    assessmentResult: sourceAssessment,
    assessmentValidation: structuredAssessment.validation,
    functionalFindings: findings.value,
    functionalFindingValidation: findings.validation,
    exercisePlan: exercisePlan.value,
    exercisePlanValidation: exercisePlan.validation,
    steadiScore: steadiScore.value,
    steadiScoreValidation: steadiScore.validation,
    steadiRiskLevel: structuredRiskLevel,
    reasonCodes: [
      ...(findings.reasonCodes || []),
      ...(exercisePlan.value?.decisionTrace || []),
    ],
  };
}

function createStructuredCarePipeline({
  baseResult,
  session,
  historyItems,
  structuredPipeline,
} = {}) {
  const now = timestampMsFrom(baseResult.generatedAt, baseResult.completedAt);
  const userId = session.profile?.id || session.id || 'anonymous-user';
  const sourceAssessment = structuredPipeline.assessmentResult;
  const exercisePlan = structuredPipeline.exercisePlan || null;
  const functionalFindings = structuredPipeline.functionalFindings || [];
  const riskLevel = structuredPipeline.steadiRiskLevel || StructuredSteadiRiskLevels.NotScorable;
  const metric = primaryMetricFromStructuredAssessment(sourceAssessment);
  const latestValidAssessment = sourceAssessment
    ? {
      assessmentId: sourceAssessment.assessmentId,
      assessmentType: sourceAssessment.assessmentType,
      testType: baseResult.testType,
      primaryValue: metric.metricValue,
      status: sourceAssessment.status,
      completedAtMs: timestampMsFrom(baseResult.completedAt, baseResult.endedAt, now),
    }
    : null;
  const initialState = {
    userId,
    latestValidAssessment,
    currentSteadiRiskLevel: riskLevel,
    activeFunctionalFindings: functionalFindings,
    currentExercisePlan: exercisePlan,
    recentFiveAssessmentTrends: recentTrendStateFromHistory(historyItems),
    weeklyAdherence: session.profile?.weeklyAdherence || [],
    recentInvalidAttempts: session.profile?.recentInvalidAttempts || [],
    safetyEvents: session.profile?.safetyEvents || [],
    reportedFalls: session.profile?.reportedFalls || [],
    currentSessionPlan: session.profile?.currentSessionPlan || null,
    nextReassessmentDate: session.profile?.nextReassessmentDate || null,
    pendingEscalation: session.profile?.pendingEscalation || null,
    reminderPreferences: session.profile?.reminderPreferences || {},
    caregiverConsentSettings: session.profile?.caregiverConsentSettings || {},
    recentExerciseSessionResult: session.profile?.recentExerciseSessionResult || null,
    decisionLog: [],
    processedEventIds: [],
    updatedAtMs: now,
  };
  const event = sourceAssessment && sourceAssessment.status === StructuredAssessmentStatuses.Valid
    ? {
      eventId: sourceAssessment.assessmentId || baseResult.analysisSessionId || `${baseResult.testType}-${now}`,
      type: CareAgentEventTypes.ValidAssessment,
      assessment: latestValidAssessment,
      metricKey: metric.metricKey,
      metricValue: metric.metricValue,
      currentSteadiRiskLevel: riskLevel,
      functionalFindings,
      exercisePlan,
      timestampMs: now,
    }
    : null;
  const store = createMemoryCareAgentStore({ [userId]: initialState });
  const loop = runCareAgentLoop({
    userId,
    initialState,
    events: event ? [event] : [],
    store,
    now,
  });
  const decisionTrace = {
    whatChanged: loop.finalPlan.expectedOutcome,
    observed: loop.finalPlan.observedState,
    triggeredPolicy: loop.finalPlan.triggeredPolicy,
    selectedActions: loop.finalPlan.selectedActions,
    rejectedActions: loop.finalPlan.rejectedActions,
    guardrailChecks: loop.finalPlan.guardrailChecks,
    toolResults: loop.toolResults,
    finalObservation: loop.finalObservation,
  };
  const selectedExercises = exercisePlan?.selectedExercises || [];
  return {
    schemaVersion: 'structured_care_pipeline.v2',
    createdAt: new Date(now).toISOString(),
    stageOrder: [
      'STRUCTURED_ASSESSMENT',
      'STEADI_SCORING',
      'FUNCTIONAL_FINDINGS',
      'OTAGO_RECOMMENDATION',
      'CARE_ORCHESTRATION_AGENT',
    ],
    roleBoundary:
      'Deterministic tools create measurement, finding, risk, and exercise outputs; the agent only chooses timing, next action, reminders, and escalation.',
    stages: {
      structuredAssessment: structuredPipeline.assessmentResult,
      steadiScoring: structuredPipeline.steadiScore,
      functionalFindings,
      exerciseRecommendation: exercisePlan,
    },
    agent: {
      stageId: 'CARE_ORCHESTRATION_AGENT',
      loop,
      decision: loop.decision,
      decisionTrace,
      currentExercisePlan: exercisePlan,
      observedState: {
        testType: baseResult.testType,
        currentSteadiRiskLevel: riskLevel,
        activeFunctionalFindingTypes: functionalFindings.map((finding) => finding.findingType),
        activeFunctionalFindings: functionalFindings,
        safetyGates: exercisePlan?.safetyNotices || [],
        agentState: loop.finalState,
      },
    },
    finalResultPatch: {
      recommendationPlan: exercisePlan,
      recommendedExercises: selectedExercises,
      recommendations: selectedExercises,
      seniorMessage: loop.decision.userMessage,
      staffMessage: loop.decision.nextAction,
    },
  };
}

export function buildFinalAnalysisPayload({
  result,
  session,
  selectedTest,
  historyItems,
}) {
  const resultTestType = result.testType || selectedTest;
  const baseResult = withAssessmentMetadata(
    { ...result, testType: resultTestType },
    {
      source: result.source || result.metadata?.source || ResultSources.LivePose,
      sessionId: session.id,
      analysisSessionId: result.analysisSessionId || result.metadata?.analysisSessionId,
      testType: resultTestType,
      assessmentType: result.assessmentType || result.metadata?.assessmentType || assessmentTypeForTestType(resultTestType),
      isPersistable: result.isPersistable === true,
      isClinicallyScorable: result.isClinicallyScorable !== false && result.source !== ResultSources.Fallback,
      status: result.status || (result.invalid ? AssessmentStatuses.Invalid : AssessmentStatuses.Valid),
      resultType: AssessmentResultTypes.Final,
      analyzerFinalEvent: result.analyzerFinalEvent === true,
      generatedAt: result.generatedAt || Date.now(),
    },
  );
  if (!canUseClinicalPipeline(baseResult)) {
    return {
      ...baseResult,
      sessionId: session.id,
      userId: session.profile?.id || session.id,
      testType: resultTestType,
      testLabel: testLabel(resultTestType),
      score: 0,
      count: null,
      message: baseResult.seniorMessage || baseResult.summaryMessage || 'We could not complete the measurement.',
      features: {
        ...(result.features || {}),
        primaryValue: result.primaryValue ?? null,
        primaryLabel: result.primaryLabel || 'Measurement',
        confidence: result.confidence ?? 0,
      },
      flags: baseResult.status === AssessmentStatuses.Incomplete
        ? ['We could not complete the measurement.', 'Please check the camera connection and try again.']
        : resultFlagsFor(baseResult, resultTestType),
      recommendations: [],
      recommendedExercises: [],
      recommendationPlan: {
        priority: 'not_available',
        reason: 'Recommendations are disabled for non-clinical assessment results.',
        recommendedExercises: [],
        safetyGates: ['non_clinical_result'],
      },
      carePipeline: null,
    };
  }
  const structuredPipeline = structuredPipelineFromLiveResult({
    baseResult,
    session,
  });
  const carePipeline = createStructuredCarePipeline({
    baseResult,
    session,
    historyItems,
    structuredPipeline,
  });
  const structuredExercises = structuredPipeline.exercisePlan?.selectedExercises || [];
  const structuredRecommendationPlan = structuredPipeline.exercisePlan
    ? {
      ...structuredPipeline.exercisePlan,
      source: 'deterministic_otago_engine',
      priority: carePipeline.agent.decision.priority,
      reason: structuredPipeline.exercisePlan.decisionTrace?.join(', ') || carePipeline.agent.decision.nextAction,
      recommendedExercises: structuredExercises,
      selectedExercises: structuredExercises,
      safetyGates: structuredPipeline.exercisePlan.safetyNotices || [],
      seniorMessage: carePipeline.agent.decision.seniorMessage,
      nextAction: carePipeline.agent.decision.nextAction,
      sessionPlanMode: carePipeline.agent.loop?.finalState?.currentSessionPlan?.mode || null,
    }
    : {
      priority: 'not_available',
      reason: 'Exercise recommendations require a valid structured measurement.',
      recommendedExercises: [],
      selectedExercises: [],
      safetyGates: ['structured_result_not_scorable'],
      nextAction: carePipeline.agent.decision.nextAction,
    };
  const enrichedResult = {
    ...baseResult,
    rawAnalysisResult: baseResult,
    carePipeline,
    structuredPipeline,
    functionalFindings: structuredPipeline.functionalFindings,
    recommendationPlan: structuredRecommendationPlan,
    recommendedExercises: structuredExercises,
    recommendations: structuredExercises,
    agentDecision: carePipeline.agent.decision,
    agentDecisionTrace: carePipeline.agent.decisionTrace,
    seniorMessage: carePipeline.agent.decision.seniorMessage,
    staffMessage: carePipeline.agent.decision.nextAction,
  };
  const primaryValue = result.primaryValue ?? result.repetitionCount ?? result.count ?? 0;
  const primaryLabel = result.primaryLabel || 'Measured Value';
  const qualityScore = result.trackingQualityScore ?? result.confidence;

  return {
    ...enrichedResult,
    sessionId: session.id,
    userId: session.profile?.id || session.id,
    testType: resultTestType,
    testLabel: testLabel(resultTestType),
    score: Number.isFinite(Number(qualityScore))
      ? Math.round(Number(qualityScore) * 100)
      : result.score || 0,
    count: primaryValue,
    message: enrichedResult.seniorMessage
      || `${recommendationLabel(result.recommendationLevel)}: ${result.summaryMessage || `${primaryLabel} ${primaryValue} measured.`}`,
    features: {
      ...(result.features || {}),
      chairStandCount: resultTestType === 'chair_stand' ? result.repetitionCount : undefined,
      primaryValue,
      primaryLabel,
      trunkLean: result.trunkLeanScore,
      symmetry: result.symmetryScore,
      stability: result.stabilityScore,
      confidence: result.confidence,
      steadiRiskLevel: structuredPipeline.steadiRiskLevel,
      agentPriority: carePipeline.agent.decision.priority,
    },
    flags: resultFlagsFor(enrichedResult, resultTestType),
    recommendationPlan: structuredRecommendationPlan,
    recommendedExercises: structuredExercises,
    recommendations: structuredExercises,
    structuredPipeline,
    functionalFindings: structuredPipeline.functionalFindings,
    agentDecision: carePipeline.agent.decision,
    agentDecisionTrace: carePipeline.agent.decisionTrace,
  };
}

export function useSteplyDashboard({ demoMode = false } = {}) {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [sessionBundle, setSessionBundle] = useState(null);
  const [selectedTest, setSelectedTest] = useState(initialSelectedTestFromUrl);
  const [liveResult, setLiveResult] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historySource, setHistorySource] = useState({
    type: 'external_injection',
    label: 'Waiting for phone-provided history',
    persistent: false,
  });
  const [remoteCameraFrame, setRemoteCameraFrame] = useState(null);
  const [remoteCameraStatus, setRemoteCameraStatus] = useState('Phone camera is not connected yet.');
  const [activeStep, setActiveStep] = useState(activeStepFromScreen(UserScreenIds.Start));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const pendingFrameMetaRef = useRef(null);
  const frameObjectUrlRef = useRef(null);

  const session = sessionBundle?.session || null;

  const refreshHistory = useCallback(async () => {
    if (demoMode) {
      setHistoryItems([]);
      setHistorySource({
        type: 'demo_route_boundary',
        label: 'DEMO DATA - NOT SAVED',
        persistent: false,
      });
      return;
    }
    // Display-only injection point. In production, these items should be supplied by
    // the Kotlin phone app, which owns persistent personal history storage.
    if (shouldUseDemoHistoryFixture()) {
      setHistoryItems(buildDemoHistoryItems());
      setHistorySource({
        type: 'development_fixture',
        label: 'Synthetic injected browser fixture',
        persistent: false,
      });
      return;
    }

    try {
      // Development adapter only: the current PC history endpoint is not the
      // authoritative store and will be removed in the storage cleanup pass.
      const data = await getAllHistory();
      setHistoryItems((data.items || []).slice().reverse());
      setHistorySource(data.source || {
        type: 'temporary_pc_display_adapter',
        label: 'Temporary PC display feed',
        persistent: false,
      });
    } catch (err) {
      console.warn(err);
    }
  }, [demoMode]);

  const handlePoseFinalResult = useCallback(async (result) => {
    if (!session?.id || !result) return;

    const payload = buildFinalAnalysisPayload({
      result,
      session,
      selectedTest,
      historyItems,
    });

    setFinalResult(payload);
    setActiveStep(activeStepFromScreen(UserScreenIds.Result));
    const persistCheck = canPersistAssessmentResult(payload);
    if (!persistCheck.ok) {
      console.info(JSON.stringify({
        event: 'ASSESSMENT_SAVE_REJECTED',
        reason: persistCheck.reason,
        sessionId: payload.sessionId,
        source: payload.source,
      }));
      return;
    }
    try {
      const saved = await postFinalAnalysis(payload);
      setFinalResult(saved.result);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    }
  }, [historyItems, refreshHistory, selectedTest, session]);

  const handleRemoteFrameProcessed = useCallback((frame) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const sequence = frame?.cameraFrameSequence ?? frame?.sequence;
    if (!sequence && !frame?.mobileSequence) return;
    socket.send(JSON.stringify({
      type: 'remote-camera-frame-ack',
      sequence: sequence || null,
      mobileSequence: frame.mobileSequence || null,
      source: frame.source || 'pose-frame',
      receivedAt: frame.receivedAt || null,
      analyzedAt: frame.analyzedAt || Date.now(),
    }));
  }, []);

  const poseAnalysis = useRemotePoseAnalysis({
    session,
    selectedTest,
    remoteCameraFrame,
    activeStep,
    autoStart: false,
    onFinalResult: handlePoseFinalResult,
    onFrameProcessed: handleRemoteFrameProcessed,
  });

  useEffect(() => {
    getNetworkInfo().then(setNetworkInfo).catch(console.warn);
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (demoMode || !session?.id || session.profile) return undefined;
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    const pollSessionStatus = async () => {
      try {
        const data = await getSessionStatus(session.id);
        if (cancelled || !data.session) return;
        setSessionBundle((prev) => {
          if (!prev?.session || prev.session.id !== session.id) return prev;
          return { ...prev, session: data.session };
        });
        if (data.session.selectedTest) setSelectedTest(data.session.selectedTest);
      } catch (err) {
        if (!cancelled) console.warn(err);
      }
    };

    pollSessionStatus();
    const timer = window.setInterval(pollSessionStatus, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [demoMode, session?.id, session?.profile]);

  useEffect(() => () => {
    if (socketRef.current) socketRef.current.close();
    if (frameObjectUrlRef.current) URL.revokeObjectURL(frameObjectUrlRef.current);
  }, []);

  const wireSocket = useCallback((bundle) => {
    if (socketRef.current) socketRef.current.close();
    if (frameObjectUrlRef.current) {
      URL.revokeObjectURL(frameObjectUrlRef.current);
      frameObjectUrlRef.current = null;
    }
    pendingFrameMetaRef.current = null;
    const wsUrl = dashboardWebSocketUrl(bundle);
    if (!wsUrl) return;

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          const meta = pendingFrameMetaRef.current || {};
          pendingFrameMetaRef.current = null;
          const blob = event.data instanceof Blob
            ? event.data
            : new Blob([event.data], { type: meta.mimeType || 'image/jpeg' });
          const nextUrl = URL.createObjectURL(blob);
          const previousUrl = frameObjectUrlRef.current;
          frameObjectUrlRef.current = nextUrl;
          if (previousUrl) URL.revokeObjectURL(previousUrl);

          setRemoteCameraFrame({
            src: nextUrl,
            blob,
            receivedAt: meta.receivedAt || Date.now(),
            byteLength: meta.byteLength || blob.size,
            sequence: meta.sequence || Date.now(),
            mobileSequence: meta.mobileSequence || null,
            mobileSentAt: meta.mobileSentAt || null,
            capturedAtUptimeMs: meta.capturedAtUptimeMs || null,
          });
          setRemoteCameraStatus('Receiving live phone camera stream');
          setActiveStep(activeStepForIncomingFrame);
          return;
        }

        const message = JSON.parse(event.data);
        if (message.type === 'session') {
          setSessionBundle((prev) => prev ? { ...prev, session: message.session } : prev);
          if (message.session?.selectedTest) setSelectedTest(message.session.selectedTest);
        }
        if (message.type === 'realtime') {
          setLiveResult(message.result);
          setActiveStep(activeStepForIncomingFrame);
          if (message.session) setSessionBundle((prev) => prev ? { ...prev, session: message.session } : prev);
        }
        if (message.type === 'final') {
          const finalSession = message.session || bundle.session || session;
          const finalPayload = finalSession?.id
            ? buildFinalAnalysisPayload({
              result: message.result,
              session: finalSession,
              selectedTest: message.result?.testType || selectedTest,
              historyItems,
            })
            : message.result;
          setFinalResult(finalPayload);
          setActiveStep(activeStepFromScreen(UserScreenIds.Result));
          refreshHistory();
        }
        if (message.type === 'session-cleared') {
          setSessionBundle(null);
          setLiveResult(null);
          setFinalResult(null);
          setHistoryItems([]);
          if (frameObjectUrlRef.current) {
            URL.revokeObjectURL(frameObjectUrlRef.current);
            frameObjectUrlRef.current = null;
          }
          pendingFrameMetaRef.current = null;
          setRemoteCameraFrame(null);
          setRemoteCameraStatus('Phone session ended. PC temporary personal data was cleared.');
          setActiveStep(activeStepFromScreen(UserScreenIds.Start));
        }
        if (message.type === 'remote-camera-frame-meta') {
          pendingFrameMetaRef.current = message;
        }
        if (message.type === 'remote-camera-frame') {
          // Backward compatibility for older server builds that still send base64 JSON.
          const frameSrc = normalizeFrameSource(message.frame, message.mimeType);
          if (!frameSrc) return;
          setRemoteCameraFrame({
            src: frameSrc,
            receivedAt: message.receivedAt,
            byteLength: message.byteLength,
            sequence: message.sequence || message.receivedAt,
            mobileSequence: message.mobileSequence || null,
            mobileSentAt: message.mobileSentAt || null,
          });
          setRemoteCameraStatus('Receiving phone camera stream');
          setActiveStep(activeStepForIncomingFrame);
        }
        if (message.type === 'remote-camera-status') {
          setRemoteCameraStatus(message.message || 'Phone camera status changed.');
        }
      } catch (err) {
        console.warn(err);
      }
    };
    socket.onclose = () => {
      poseAnalysis?.resetAnalysis?.('websocket_closed');
      setRemoteCameraStatus('Phone camera connection closed.');
    };
  }, [historyItems, poseAnalysis, refreshHistory, selectedTest, session]);

  const handleCreateSession = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const bundle = await createSession();
      setSessionBundle(bundle);
      setLiveResult(null);
      setFinalResult(null);
      if (frameObjectUrlRef.current) {
        URL.revokeObjectURL(frameObjectUrlRef.current);
        frameObjectUrlRef.current = null;
      }
      pendingFrameMetaRef.current = null;
      setRemoteCameraFrame(null);
      setRemoteCameraStatus('Scan the QR code to show the phone camera here.');
      wireSocket(bundle);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [wireSocket]);


  const handleRefreshSession = useCallback(async () => {
    if (!session?.id) {
      setError('Create a QR session first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await getSessionStatus(session.id);
      setSessionBundle((prev) => prev ? { ...prev, session: data.session } : prev);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [session?.id]);

  const handleConnectDemoProfile = useCallback(async () => {
    if (!session?.id) return;
    setBusy(true);
    setError('');
    try {
      const result = await connectProfile(session.id, demoProfile, pairingTokenFromQrPayload(sessionBundle?.qrPayload));
      setSessionBundle((prev) => ({ ...prev, session: result.session }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [session?.id, sessionBundle?.qrPayload]);

  const handleSelectTest = useCallback(async (testId) => {
    setSelectedTest(testId);
    setLiveResult(null);
    setFinalResult(null);
    setActiveStep(remoteCameraFrame
      ? activeStepFromScreen(UserScreenIds.CameraSetup)
      : activeStepFromScreen(UserScreenIds.Start));
    setError('');
    if (!session?.id) return;
    try {
      const result = await selectTest(session.id, testId);
      setSessionBundle((prev) => ({ ...prev, session: result.session }));
    } catch (err) {
      setError(err.message);
    }
  }, [remoteCameraFrame, session?.id]);

  const handleDemoRealtime = useCallback(async () => {
    setError('Demo realtime results are disabled. Start a live camera assessment instead.');
  }, []);

  const handleSaveFinal = useCallback(async () => {
    if (demoMode) {
      setError('Demo data is not saved.');
      return;
    }
    if (!session?.id) {
      setError('Create a session before saving final results.');
      return;
    }
    if (!finalResult) {
      setError('No completed live pose result is available to save.');
      return;
    }
    const persistCheck = canPersistAssessmentResult(finalResult);
    if (!persistCheck.ok) {
      console.info(JSON.stringify({
        event: 'ASSESSMENT_SAVE_REJECTED',
        reason: persistCheck.reason,
        sessionId: finalResult.sessionId,
        source: finalResult.source,
      }));
      setError('Only completed live pose results can be saved.');
      return;
    }
    try {
      const result = await postFinalAnalysis(finalResult);
      setFinalResult(result.result);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    }
  }, [demoMode, session?.id, finalResult, refreshHistory]);

  const handleCopyPayload = useCallback(async () => {
    if (!sessionBundle?.qrPayload) return;
    try {
      await navigator.clipboard.writeText(sessionBundle.qrPayload);
    } catch (_) {
      setError('Clipboard is unavailable. Select and copy the QR payload manually.');
    }
  }, [sessionBundle?.qrPayload]);

  const canStart = Boolean(session?.id && selectedTest);

  return useMemo(() => ({
    networkInfo,
    sessionBundle,
    session,
    selectedTest,
    liveResult,
    finalResult,
    historyItems,
    historySource,
    remoteCameraFrame,
    remoteCameraStatus,
    poseAnalysis,
    activeStep,
    busy,
    error,
    canStart,
    setActiveStep,
    handleCreateSession,
    handleConnectDemoProfile,
    handleSelectTest,
    handleDemoRealtime,
    handleSaveFinal,
    handleCopyPayload,
    handleRefreshSession,
  }), [
    networkInfo,
    sessionBundle,
    session,
    selectedTest,
    liveResult,
    finalResult,
    historyItems,
    historySource,
    remoteCameraFrame,
    remoteCameraStatus,
    poseAnalysis,
    activeStep,
    busy,
    error,
    canStart,
    handleCreateSession,
    handleConnectDemoProfile,
    handleSelectTest,
    handleDemoRealtime,
    handleSaveFinal,
    handleCopyPayload,
    handleRefreshSession,
  ]);
}
