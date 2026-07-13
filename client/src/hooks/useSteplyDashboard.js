import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSession,
  getNetworkInfo,
  getSessionStatus,
  postFinalAnalysis,
  selectTest,
  updateAssessmentSession as persistAssessmentSessionUpdate,
} from '../api/steplyApi';
import { useRemotePoseAnalysis } from './useRemotePoseAnalysis';
import { LocalCameraStates, useLocalCamera } from './useLocalCamera.js';
import { createFunctionalFindings } from '../pipeline/findings/functionalFindings.js';
import { mapStage2Vulnerabilities } from '../pipeline/findings/vulnerabilityMapper.js';
import { createFuzzyTopsisOtagoExercisePlan } from '../pipeline/recommendation/otagoExerciseEngine.js';
import {
  AssessmentResultStatuses as StructuredAssessmentStatuses,
  AssessmentTypes as StructuredAssessmentTypes,
  BalanceStages as StructuredBalanceStages,
  SteadiRiskLevels as StructuredSteadiRiskLevels,
} from '../pipeline/shared/types/index.js';
import { validateAssessmentResult } from '../pipeline/shared/validation/runtimeValidation.js';
import {
  RiskLevel as CanonicalRiskLevel,
  Sex as CanonicalSex,
  scoreSteadiAssessmentSession,
} from '../pipeline/scoring/steadi/steadiSessionScorer.js';
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
import { historyItemsFromDataContract } from '../utils/historyTrends.js';
import { isSupportedAssessmentTestType } from '../pipeline/shared/assessmentTestTypes.js';

const ACTIVE_SESSION_STORAGE_KEY = 'steply.activeSessionBundle';
export const CameraInputModes = Object.freeze({
  Phone: 'PHONE_CAMERA',
  Laptop: 'LOCAL_WEBCAM',
});
export const PhoneCameraStates = Object.freeze({
  WaitingForProfile: 'WAITING_FOR_PROFILE',
  ProfileLinkedWaitingForFrame: 'PROFILE_LINKED_WAITING_FOR_FRAME',
  FrameDecoding: 'FRAME_DECODING',
  FrameReceived: 'FRAME_RECEIVED',
  Disconnected: 'DISCONNECTED',
});

function restoredSessionBundle() {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.sessionStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    const restored = value ? JSON.parse(value) : null;
    if (restored?.session?.selectedTest && !isSupportedAssessmentTestType(restored.session.selectedTest)) {
      return null;
    }
    return restored;
  } catch (_) {
    return null;
  }
}

function dashboardWebSocketUrl(bundle) {
  const value = bundle?.dashboardWsPath || bundle?.wsUrl || '';
  if (!value || !value.startsWith('/')) return value;
  if (typeof window === 'undefined') return value;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${value}`;
}

export function buildLandmarkSeriesFinalizedEnvelope({ rawSeries, savedResult, session }) {
  const stage2Result = savedResult?.stage2Result
    || savedResult?.structuredAssessmentResult
    || savedResult?.finalResponse?.result
    || null;
  const profileId = session?.profile?.id;
  const assessmentSessionId = savedResult?.assessmentSessionId || session?.assessmentSession?.assessmentSessionId;
  const attemptId = stage2Result?.attemptId || savedResult?.attemptId;
  const resultId = stage2Result?.resultId || savedResult?.resultId;
  if (!rawSeries || !profileId || !assessmentSessionId || !attemptId || !resultId) return null;
  const seriesId = `landmark:${assessmentSessionId}:${attemptId}`;
  return {
    type: 'landmark-series.finalized',
    schemaVersion: 'landmark_series.v1',
    messageId: `landmark-finalized:${seriesId}`,
    profileId,
    assessmentSessionId,
    attemptId,
    resultId,
    series: {
      schemaVersion: 'landmark_series.v1',
      seriesId,
      profileId,
      assessmentSessionId,
      attemptId,
      analysisSessionId: stage2Result?.analysisSessionId || rawSeries.analysisSessionId,
      resultId,
      assessmentType: stage2Result?.assessmentType || rawSeries.assessmentType,
      status: stage2Result?.status || rawSeries.status,
      targetFps: rawSeries.targetFps,
      startedAt: rawSeries.startedAt,
      completedAt: rawSeries.completedAt,
      samples: rawSeries.samples || [],
    },
  };
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

function acceptedStructuredAssessment(slot = {}) {
  const payload = slot.acceptedResult?.payload || slot.acceptedResult || null;
  return structuredAssessmentFromLiveResult(payload || {}).value;
}

function prospectiveAssessments(session, sourceAssessment) {
  const assessmentSession = session?.assessmentSession;
  const candidates = [
    acceptedStructuredAssessment(assessmentSession?.functionalTests?.CHAIR_STAND_30S),
    acceptedStructuredAssessment(assessmentSession?.functionalTests?.FOUR_STAGE_BALANCE),
    sourceAssessment,
  ].filter(Boolean);
  const byType = new Map();
  for (const assessment of candidates) byType.set(assessment.assessmentType, assessment);
  return [...byType.values()];
}

function aggregateVulnerabilityAssessment(session, assessmentResults = [], canonicalScore = null) {
  const acceptedResults = Object.values(session?.assessmentSession?.functionalTests || {})
    .map((slot) => slot?.acceptedResult)
    .filter(Boolean);
  const sources = [...acceptedResults, ...assessmentResults]
    .map((result) => result?.vulnerabilityAssessment)
    .filter(Boolean);
  const chair = assessmentResults.find((result) => result.assessmentType === StructuredAssessmentTypes.ChairStand30s);
  const balance = assessmentResults.find((result) => result.assessmentType === StructuredAssessmentTypes.FourStageBalance);
  const chairObservation = Array.isArray(chair?.secondaryObservations) ? chair.secondaryObservations[0] || {} : chair?.secondaryObservations || {};
  const balanceStages = balance?.primaryMeasurements?.stages || [];
  const tandemSway = balanceStages.find((stage) => stage.stage === StructuredBalanceStages.Tandem)?.sway || {};
  const derived = mapStage2Vulnerabilities({
    chair: {
      sourceResultId: chair?.resultId || chair?.assessmentId || null,
      completedRepetitions: chair?.primaryMeasurements?.completedRepetitions ?? null,
      cdcCutoff: canonicalScore?.inputs?.chairStand?.belowAverageThreshold ?? null,
      belowCdcReference: canonicalScore?.strengthProblem === true,
      lateSlowdownRatio: chairObservation.lateSlowdownRatio ?? null,
      maxTrunkLeanDegrees: chairObservation.maxTrunkLeanDegrees ?? null,
      armUseCdcZero: chair?.primaryMeasurements?.armUse === 'CONFIRMED',
      armUseOccurrenceCount: chair?.primaryMeasurements?.armUse === 'CONFIRMED' ? 2 : 0,
      asymmetryRatio: chairObservation.asymmetryRatio ?? null,
      asymmetryRepeatCount: chairObservation.asymmetryRepeatCount ?? null,
      suspectedWeakerSide: chairObservation.suspectedWeakerSide || 'UNDETERMINED',
      sideConfidence: chairObservation.sideConfidence ?? 0,
    },
    balance: {
      sourceResultId: balance?.resultId || balance?.assessmentId || null,
      holdSecondsByStage: Object.fromEntries(balanceStages.map((stage) => [stage.stage, stage.holdDurationSeconds])),
      swayRatios: tandemSway.ratios || {},
    },
  });
  if (derived.activeIds.length) sources.push(derived);
  const activeIds = [...new Set(sources.flatMap((assessment) => assessment.activeIds || []))].sort();
  const evidenceByKey = new Map();
  for (const evidence of sources.flatMap((assessment) => assessment.evidence || [])) {
    const key = `${evidence.vulnerabilityId}:${evidence.sourceResultId || 'unknown'}`;
    if (!evidenceByKey.has(key)) evidenceByKey.set(key, evidence);
  }
  return {
    ruleVersion: 'stage3_vulnerability_aggregate.v1',
    activeIds,
    evidence: [...evidenceByKey.values()],
  };
}

function canonicalSex(profile = {}, assessmentSession = null) {
  const value = String(assessmentSession?.profileSnapshot?.sex || profile.sex || '').toUpperCase();
  if (value === CanonicalSex.Male || value === CanonicalSex.Female) return value;
  return null;
}

function ageYearsFromBirthYear(profile = {}) {
  const birthYear = Number(profile.birthYear);
  if (!Number.isInteger(birthYear)) return null;
  const ageYears = new Date().getUTCFullYear() - birthYear;
  return ageYears >= 0 ? ageYears : null;
}

function canonicalScreening(assessmentSession = null) {
  const screening = assessmentSession?.screening || {};
  return {
    ...(screening.responses || {}),
    fallCount: screening.fallHistory?.count ?? null,
    injuriousFall: screening.fallHistory?.injuriousFall ?? null,
  };
}

function canonicalScoreInput({ session, assessments }) {
  const assessmentSession = session?.assessmentSession;
  const chair = assessments.find((item) => item.assessmentType === StructuredAssessmentTypes.ChairStand30s);
  const balance = assessments.find((item) => item.assessmentType === StructuredAssessmentTypes.FourStageBalance);
  const tandem = balance?.primaryMeasurements?.stages?.find((stage) => stage.stage === StructuredBalanceStages.Tandem);
  return {
    screening: canonicalScreening(assessmentSession),
    profile: {
      ageYears: assessmentSession?.profileSnapshot?.ageYears ?? ageYearsFromBirthYear(session?.profile),
      sex: canonicalSex(session?.profile || {}, assessmentSession),
    },
    chairStand: chair ? {
      status: chair.status,
      completedRepetitions: chair.primaryMeasurements?.completedRepetitions ?? null,
      armUseConfirmed: chair.primaryMeasurements?.armUse === 'CONFIRMED',
    } : null,
    balance: balance ? {
      status: balance.status,
      tandemHoldSeconds: tandem?.holdDurationSeconds ?? null,
    } : null,
  };
}

function structuredPipelineFromLiveResult({
  baseResult,
  session,
} = {}) {
  const structuredAssessment = structuredAssessmentFromLiveResult(baseResult);
  const sourceAssessment = structuredAssessment.value;
  const assessmentResults = sourceAssessment ? prospectiveAssessments(session, sourceAssessment) : [];
  const calculatedCanonicalScore = scoreSteadiAssessmentSession(canonicalScoreInput({ session, assessments: assessmentResults }));
  const canonicalScore = session?.assessmentSession?.screening?.status === 'COMPLETED'
    ? calculatedCanonicalScore
    : {
      ...calculatedCanonicalScore,
      riskLevel: CanonicalRiskLevel.NotScorable,
      strengthProblem: null,
      balanceProblem: null,
      step1AtRisk: null,
      step2Problem: null,
      complete: false,
      reasonCodes: [...new Set([...(calculatedCanonicalScore.reasonCodes || []), 'SCREENING_NOT_COMPLETED'])],
    };
  const steadiScore = sourceAssessment
    ? { value: canonicalScore, validation: { ok: true, failures: [] } }
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

  const aggregateReady = canUseStructuredResult
    && assessmentResults.some((item) => item.assessmentType === StructuredAssessmentTypes.ChairStand30s)
    && assessmentResults.some((item) => item.assessmentType === StructuredAssessmentTypes.FourStageBalance)
    && canonicalScore.riskLevel !== CanonicalRiskLevel.NotScorable;

  if (!aggregateReady) {
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
      assessmentResults,
      aggregateReady: false,
      reasonCodes: canonicalScore.reasonCodes || ['STRUCTURED_RESULT_NOT_SCORABLE'],
    };
  }

  const chairStandResult = assessmentResults.find((item) => item.assessmentType === StructuredAssessmentTypes.ChairStand30s);
  const balanceResult = assessmentResults.find((item) => item.assessmentType === StructuredAssessmentTypes.FourStageBalance);
  const findings = createFunctionalFindings({
    chairStandResult,
    balanceResult,
    assessmentResults,
    profile: session.profile,
  });
  const vulnerabilityAssessment = aggregateVulnerabilityAssessment(session, assessmentResults, canonicalScore);
  const exercisePlan = createFuzzyTopsisOtagoExercisePlan({
    userId: session.profile?.id || session.id,
    vulnerabilityAssessment,
    steadiScore: steadiScore.value,
    riskLevel: structuredRiskLevel,
    sourceAssessments: assessmentResults,
    professionalApproval: session?.assessmentSession?.exercisePrescription?.plan?.professionalApproval,
    sessionResults: session?.assessmentSession?.exercisePrescription?.sessionResults || [],
    currentPlan: session?.assessmentSession?.exercisePrescription?.plan || null,
  });

  return {
    assessmentResult: sourceAssessment,
    assessmentValidation: structuredAssessment.validation,
    functionalFindings: findings.value,
    vulnerabilityAssessment,
    functionalFindingValidation: findings.validation,
    exercisePlan: exercisePlan.value,
    recommendationRanking: exercisePlan.recommendationRanking,
    exercisePlanValidation: exercisePlan.validation,
    steadiScore: steadiScore.value,
    steadiScoreValidation: steadiScore.validation,
    steadiRiskLevel: structuredRiskLevel,
    assessmentResults,
    aggregateReady: true,
    reasonCodes: [
      ...(findings.reasonCodes || []),
      ...(exercisePlan.value?.decisionTrace || []),
    ],
  };
}

export function buildFinalAnalysisPayload({
  result,
  session,
  selectedTest,
}) {
  const resultTestType = result.testType || selectedTest;
  const assessmentSessionId = session.assessmentSession?.assessmentSessionId || result.assessmentSessionId || null;
  const attemptId = result.attemptId || result.analysisSessionId || result.metadata?.analysisSessionId || null;
  const baseResult = withAssessmentMetadata(
    { ...result, testType: resultTestType, assessmentSessionId, attemptId },
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
  const careAgentProjection = session.careAgentProjection || null;
  const latestAgentDecision = careAgentProjection?.latestDecision || null;
  const carePipeline = careAgentProjection
    ? {
      schemaVersion: 'mobile_care_agent_projection.v1',
      source: 'MOBILE_ROOM',
      agent: {
        projection: careAgentProjection,
        decision: latestAgentDecision,
        currentExercisePlan: structuredPipeline.exercisePlan || null,
      },
    }
    : null;
  const structuredExercises = structuredPipeline.exercisePlan?.selectedExercises || [];
  const rankingItems = structuredPipeline.recommendationRanking?.items || [];
  const rankingByExerciseId = new Map(rankingItems.map((item) => [item.exerciseId, item]));
  const projectedExercises = structuredExercises.map((exercise, index) => {
    const ranking = rankingByExerciseId.get(exercise.exerciseId);
    return ranking ? {
      ...exercise,
      recommendationRank: ranking.rank,
      recommendationScore: ranking.score,
      targetSide: ranking.targetSide,
      functionalRole: ranking.functionalRole,
      recommendationCriteria: ranking.criteria,
      recommendationReasonCodes: ranking.reasonCodes,
    } : { ...exercise, recommendationRank: index + 1 };
  });
  const structuredRecommendationPlan = structuredPipeline.exercisePlan
    ? {
      ...structuredPipeline.exercisePlan,
      source: 'fuzzy_topsis_otago_engine',
      priority: structuredPipeline.exercisePlan.status === 'ACTIVE' ? 'exercise_practice' : 'professional_review',
      reason: structuredPipeline.exercisePlan.decisionTrace?.join(', ') || structuredPipeline.exercisePlan.status,
      recommendationRanking: structuredPipeline.recommendationRanking,
      recommendedExercises: projectedExercises,
      selectedExercises: projectedExercises,
      safetyGates: structuredPipeline.exercisePlan.safetyNotices || [],
      nextAction: latestAgentDecision?.selectedActions?.find((action) => action.payload?.messageTemplateId)?.payload?.messageTemplateId || null,
      sessionPlanMode: careAgentProjection?.currentSessionPlan?.mode || null,
    }
    : {
      priority: 'not_available',
      reason: 'Exercise recommendations require a valid structured measurement.',
      recommendedExercises: [],
      selectedExercises: [],
      safetyGates: ['structured_result_not_scorable'],
      nextAction: latestAgentDecision?.selectedActions?.find((action) => action.payload?.messageTemplateId)?.payload?.messageTemplateId || null,
    };
  const enrichedResult = {
    ...baseResult,
    rawAnalysisResult: baseResult,
    carePipeline,
    structuredPipeline,
    functionalFindings: structuredPipeline.functionalFindings,
    recommendationPlan: structuredRecommendationPlan,
    recommendedExercises: projectedExercises,
    recommendations: projectedExercises,
    careAgentProjection,
    agentDecision: latestAgentDecision,
    agentDecisionTrace: latestAgentDecision?.selectedActions || [],
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
      agentPriority: latestAgentDecision?.selectedBranch || null,
    },
    flags: resultFlagsFor(enrichedResult, resultTestType),
    recommendationPlan: structuredRecommendationPlan,
    recommendedExercises: structuredExercises,
    recommendations: structuredExercises,
    structuredPipeline,
    functionalFindings: structuredPipeline.functionalFindings,
    careAgentProjection,
    agentDecision: latestAgentDecision,
    agentDecisionTrace: latestAgentDecision?.selectedActions || [],
  };
}

export function useSteplyDashboard() {
  const [networkInfo, setNetworkInfo] = useState(null);
  const [sessionBundle, setSessionBundle] = useState(restoredSessionBundle);
  const [selectedTest, setSelectedTest] = useState('four_stage_balance');
  const [liveResult, setLiveResult] = useState(null);
  const [finalResult, setFinalResult] = useState(null);
  const [remoteCameraFrame, setRemoteCameraFrame] = useState(null);
  const [remoteCameraStatus, setRemoteCameraStatus] = useState('Phone camera is not connected yet.');
  const [remoteCameraStatusCode, setRemoteCameraStatusCode] = useState('idle');
  const [localCameraFrame, setLocalCameraFrame] = useState(null);
  const [cameraInputMode, setCameraInputMode] = useState(CameraInputModes.Phone);
  const [activeStep, setActiveStep] = useState(activeStepFromScreen(UserScreenIds.Start));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const restoredSocketWiredRef = useRef(false);
  const pendingFrameMetaRef = useRef(null);
  const frameObjectUrlRef = useRef(null);
  const frameObjectUrlsRef = useRef(new Set());
  const frameMetaByObjectUrlRef = useRef(new Map());
  const socketReconnectTimerRef = useRef(null);
  const socketReconnectAttemptsRef = useRef(0);
  const dashboardUnmountingRef = useRef(false);
  const pendingLandmarkSeriesRef = useRef(new Map());
  const cameraInputModeRef = useRef(CameraInputModes.Phone);

  const revokeAllFrameObjectUrls = useCallback(() => {
    frameObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    frameObjectUrlsRef.current.clear();
    frameMetaByObjectUrlRef.current.clear();
    frameObjectUrlRef.current = null;
  }, []);

  const clearRemoteCameraFrame = useCallback(() => {
    setRemoteCameraFrame(null);
    revokeAllFrameObjectUrls();
  }, [revokeAllFrameObjectUrls]);

  const handleCameraFrameLoaded = useCallback((loadedUrl, decodedImage = {}) => {
    const meta = frameMetaByObjectUrlRef.current.get(loadedUrl);
    const socket = socketRef.current;
    if (meta && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'remote-camera-frame-ack',
        sequence: meta.sequence || null,
        mobileSequence: meta.mobileSequence || null,
        source: 'camera-preview',
        receivedAt: meta.receivedAt || null,
        analyzedAt: Date.now(),
        decodedWidth: decodedImage.naturalWidth || null,
        decodedHeight: decodedImage.naturalHeight || null,
      }));
    }
    frameMetaByObjectUrlRef.current.delete(loadedUrl);
    const currentUrl = frameObjectUrlRef.current;
    if (loadedUrl === currentUrl) {
      setRemoteCameraFrame((current) => current?.src === loadedUrl
        ? { ...current, decoded: true }
        : current);
      setRemoteCameraStatus('Receiving live phone camera stream');
      setRemoteCameraStatusCode('frame-decoded');
    }
    frameObjectUrlsRef.current.forEach((url) => {
      if (url === currentUrl) return;
      URL.revokeObjectURL(url);
      frameObjectUrlsRef.current.delete(url);
      frameMetaByObjectUrlRef.current.delete(url);
    });
  }, []);

  const handleCameraFrameError = useCallback((failedUrl) => {
    frameMetaByObjectUrlRef.current.delete(failedUrl);
    if (frameObjectUrlsRef.current.delete(failedUrl)) URL.revokeObjectURL(failedUrl);
    if (frameObjectUrlRef.current !== failedUrl) return;
    frameObjectUrlRef.current = null;
    setRemoteCameraFrame((current) => current?.src === failedUrl ? null : current);
    setRemoteCameraStatus('Phone camera frame could not be decoded. Waiting for the next frame.');
    setRemoteCameraStatusCode('frame-decode-error');
  }, []);

  const handleLocalCameraFrame = useCallback((frame) => {
    if (cameraInputModeRef.current !== CameraInputModes.Laptop) {
      frame?.frame?.close?.();
      return;
    }
    setLocalCameraFrame((current) => {
      if (current?.frame && current.frame !== frame?.frame) current.frame.close?.();
      return frame;
    });
  }, []);
  const {
    state: localCameraState,
    error: localCameraError,
    stream: localCameraStream,
    isReady: isLocalCameraReady,
    start: startLocalCamera,
    stop: stopLocalCameraSource,
  } = useLocalCamera({ onFrame: handleLocalCameraFrame });

  const session = sessionBundle?.session || null;
  const historyItems = useMemo(() => historyItemsFromDataContract(session?.dataContract), [session?.dataContract]);
  const historySource = useMemo(() => ({
    type: session?.dataContract ? 'mobile_data_contract' : 'external_injection',
    label: session?.dataContract ? 'Mobile recent assessment projection' : 'Waiting for phone-provided history',
    persistent: false,
  }), [session?.dataContract]);
  const activeCameraFrame = cameraInputMode === CameraInputModes.Laptop
    ? localCameraFrame
    : remoteCameraFrame;
  const activeCameraStream = cameraInputMode === CameraInputModes.Laptop
    ? localCameraStream
    : null;
  const isPhoneProfileLinked = Boolean(session?.profile);
  const hasReceivedPhoneFrame = Boolean(remoteCameraFrame?.src && remoteCameraFrame.decoded === true);
  const isPhoneCameraDisconnected = [
    'dashboard-disconnected',
    'mobile-disconnected',
    'session-cleared',
    'stream-stopped',
  ].includes(remoteCameraStatusCode);
  const phoneCameraState = hasReceivedPhoneFrame
    ? PhoneCameraStates.FrameReceived
    : remoteCameraFrame?.src
      ? PhoneCameraStates.FrameDecoding
      : isPhoneCameraDisconnected
        ? PhoneCameraStates.Disconnected
        : isPhoneProfileLinked
          ? PhoneCameraStates.ProfileLinkedWaitingForFrame
          : PhoneCameraStates.WaitingForProfile;
  const isCameraReady = cameraInputMode === CameraInputModes.Laptop
    ? isLocalCameraReady
    : hasReceivedPhoneFrame;
  const isCameraLinked = isCameraReady;
  const activeCameraStatus = cameraInputMode === CameraInputModes.Laptop
    ? localCameraState === LocalCameraStates.Requesting
      ? 'Requesting laptop camera permission…'
      : isLocalCameraReady
        ? 'Receiving live laptop camera stream'
        : localCameraError || 'Laptop camera is not active.'
    : remoteCameraStatus;

  const flushPendingLandmarkSeries = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    for (const pending of pendingLandmarkSeriesRef.current.values()) {
      socket.send(JSON.stringify(pending));
    }
    return true;
  }, []);

  const handlePoseFinalResult = useCallback(async (result, rawLandmarkSeries = null) => {
    if (!session?.id || !result) return;

    const payload = buildFinalAnalysisPayload({
      result,
      session,
      selectedTest,
      historyItems,
    });

    const aggregateReady = payload.structuredPipeline?.aggregateReady === true;
    if (aggregateReady) {
      setFinalResult(payload);
      setActiveStep(activeStepFromScreen(UserScreenIds.Result));
    }
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
      const landmarkEnvelope = buildLandmarkSeriesFinalizedEnvelope({
        rawSeries: rawLandmarkSeries,
        savedResult: saved.result,
        session: { ...session, assessmentSession: saved.assessmentSession || session.assessmentSession },
      });
      if (landmarkEnvelope) {
        pendingLandmarkSeriesRef.current.set(landmarkEnvelope.series.seriesId, landmarkEnvelope);
        flushPendingLandmarkSeries();
      }
      if (saved.aggregateComplete) setFinalResult(saved.result);
      if (saved.assessmentSession) {
        setSessionBundle((previous) => previous?.session
          ? {
            ...previous,
            session: {
              ...previous.session,
              assessmentSession: saved.assessmentSession,
              finalResult: saved.aggregateComplete ? saved.result : previous.session.finalResult,
            },
          }
          : previous);
      }
      if (!saved.aggregateComplete && saved.assessmentSession) {
        const balanceCompleted = saved.assessmentSession.functionalTests?.FOUR_STAGE_BALANCE?.status === 'COMPLETED';
        const chairCompleted = saved.assessmentSession.functionalTests?.CHAIR_STAND_30S?.status === 'COMPLETED';
        const missingTest = !balanceCompleted
          ? 'four_stage_balance'
          : !chairCompleted
            ? 'chair_stand'
            : null;
        setFinalResult(null);
        if (missingTest) {
          const selected = await selectTest(session.id, missingTest);
          setSelectedTest(missingTest);
          setSessionBundle((previous) => previous
            ? {
              ...previous,
              session: {
                ...selected.session,
                assessmentSession: saved.assessmentSession,
              },
            }
            : previous);
          setActiveStep(activeStepFromScreen(UserScreenIds.CameraSetup));
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }, [flushPendingLandmarkSeries, historyItems, selectedTest, session]);

  const handleRemoteFrameProcessed = useCallback((frame) => {
    if (cameraInputModeRef.current === CameraInputModes.Laptop) return;
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
    cameraFrame: activeCameraFrame,
    activeStep,
    autoStart: false,
    onFinalResult: handlePoseFinalResult,
    onFrameProcessed: handleRemoteFrameProcessed,
  });

  const handleStartLocalCamera = useCallback(async () => {
    setError('');
    poseAnalysis.resetAnalysis('camera_source_changed');
    cameraInputModeRef.current = CameraInputModes.Laptop;
    setCameraInputMode(CameraInputModes.Laptop);
    setLocalCameraFrame((current) => {
      current?.frame?.close?.();
      return null;
    });
    const startedStream = await startLocalCamera();
    return Boolean(startedStream);
  }, [poseAnalysis.resetAnalysis, startLocalCamera]);

  const handleUsePhoneCamera = useCallback(() => {
    cameraInputModeRef.current = CameraInputModes.Phone;
    setCameraInputMode(CameraInputModes.Phone);
    stopLocalCameraSource();
    setLocalCameraFrame((current) => {
      current?.frame?.close?.();
      return null;
    });
    poseAnalysis.resetAnalysis('camera_source_changed');
  }, [poseAnalysis.resetAnalysis, stopLocalCameraSource]);

  useEffect(() => {
    getNetworkInfo().then(setNetworkInfo).catch(console.warn);
  }, []);

  useEffect(() => {
    if (!session?.id || session.profile) return undefined;
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
        if (data.session.selectedTest && isSupportedAssessmentTestType(data.session.selectedTest)) {
          setSelectedTest(data.session.selectedTest);
        }
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
  }, [session?.id, session?.profile]);

  useEffect(() => () => {
    dashboardUnmountingRef.current = true;
    if (socketReconnectTimerRef.current) window.clearTimeout(socketReconnectTimerRef.current);
    if (socketRef.current) socketRef.current.close();
    revokeAllFrameObjectUrls();
  }, [revokeAllFrameObjectUrls]);

  const wireSocket = useCallback((bundle) => {
    if (socketRef.current) socketRef.current.close();
    clearRemoteCameraFrame();
    pendingFrameMetaRef.current = null;
    const wsUrl = dashboardWebSocketUrl(bundle);
    if (!wsUrl) return;

    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    // Diagnostic: inspect from the browser console via `window.__steplyDiag`.
    // Tells us whether the dashboard socket is actually receiving camera frames
    // (binaryFrames / framesSet increasing) vs receiving nothing (session issue).
    const diag = typeof window !== 'undefined'
      ? (window.__steplyDiag = { wsUrl, opened: false, closed: false, msgTotal: 0, binaryFrames: 0, framesSet: 0, lastType: null, lastFrameAt: null })
      : null;
    socket.onopen = () => {
      socketReconnectAttemptsRef.current = 0;
      if (diag) diag.opened = true;
      console.info('[steply-diag] dashboard WS open →', wsUrl);
      flushPendingLandmarkSeries();
    };

    socket.onmessage = (event) => {
      try {
        if (diag) diag.msgTotal += 1;
        if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
          const meta = pendingFrameMetaRef.current || {};
          pendingFrameMetaRef.current = null;
          const blob = event.data instanceof Blob
            ? event.data
            : new Blob([event.data], { type: meta.mimeType || 'image/jpeg' });
          if (cameraInputModeRef.current === CameraInputModes.Laptop) {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'remote-camera-frame-ack',
                sequence: meta.sequence || null,
                mobileSequence: meta.mobileSequence || null,
                source: 'camera-not-selected',
                receivedAt: meta.receivedAt || Date.now(),
                analyzedAt: null,
              }));
            }
            return;
          }
          const nextUrl = URL.createObjectURL(blob);
          frameObjectUrlRef.current = nextUrl;
          frameObjectUrlsRef.current.add(nextUrl);
          frameMetaByObjectUrlRef.current.set(nextUrl, {
            sequence: meta.sequence || null,
            mobileSequence: meta.mobileSequence || null,
            receivedAt: meta.receivedAt || Date.now(),
          });

          if (diag) {
            diag.binaryFrames += 1;
            diag.framesSet += 1;
            diag.lastFrameAt = Date.now();
            if (diag.binaryFrames === 1) console.info('[steply-diag] first BINARY camera frame received:', blob.size, 'bytes');
          }
          setRemoteCameraFrame({
            src: nextUrl,
            blob,
            decoded: false,
            source: 'phone-camera',
            receivedAt: meta.receivedAt || Date.now(),
            byteLength: meta.byteLength || blob.size,
            sequence: meta.sequence || Date.now(),
            mobileSequence: meta.mobileSequence || null,
            mobileSentAt: meta.mobileSentAt || null,
            capturedAtUptimeMs: meta.capturedAtUptimeMs || null,
          });
          setRemoteCameraStatus('Phone camera frame received. Preparing the live preview…');
          setRemoteCameraStatusCode('frame-received');
          setActiveStep(activeStepForIncomingFrame);
          return;
        }

        const message = JSON.parse(event.data);
        if (diag) diag.lastType = message.type;
        if (message.type === 'session') {
          setSessionBundle((prev) => prev ? { ...prev, session: message.session } : prev);
          if (message.session?.selectedTest && isSupportedAssessmentTestType(message.session.selectedTest)) {
            setSelectedTest(message.session.selectedTest);
          }
        }
        if (message.type === 'assessment-session.updated' && message.session) {
          setSessionBundle((prev) => prev?.session
            ? { ...prev, session: { ...prev.session, assessmentSession: message.session } }
            : prev);
        }
        if ((message.type === 'care-agent.updated' || message.type === 'care-agent.projection') && message.projection) {
          setSessionBundle((prev) => prev?.session
            ? { ...prev, session: { ...prev.session, careAgentProjection: message.projection } }
            : prev);
        }
        if (message.type === 'landmark-series.ack') {
          pendingLandmarkSeriesRef.current.delete(message.seriesId);
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
        }
        if (message.type === 'session-cleared') {
          if (socketRef.current === socket) socketRef.current = null;
          socket.close(1000, 'session-cleared');
          setSessionBundle(null);
          setLiveResult(null);
          setFinalResult(null);
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
            delete window.__steplyDiag;
          }
          pendingFrameMetaRef.current = null;
          pendingLandmarkSeriesRef.current.clear();
          clearRemoteCameraFrame();
          handleUsePhoneCamera();
          setRemoteCameraStatus('Phone session ended. PC temporary personal data was cleared.');
          setRemoteCameraStatusCode('session-cleared');
          setActiveStep(activeStepFromScreen(UserScreenIds.Start));
        }
        if (message.type === 'remote-camera-frame-meta') {
          pendingFrameMetaRef.current = message;
        }
        if (message.type === 'remote-camera-status') {
          if (['stream-stopped', 'mobile-disconnected', 'session-cleared'].includes(message.status)) {
            clearRemoteCameraFrame();
          }
          setRemoteCameraStatus(message.message || 'Phone camera status changed.');
          setRemoteCameraStatusCode(message.status || 'status-changed');
        }
      } catch (err) {
        console.warn(err);
      }
    };
    socket.onclose = () => {
      if (diag) diag.closed = true;
      console.info('[steply-diag] dashboard WS closed. frames received =', diag?.binaryFrames ?? 0);
      clearRemoteCameraFrame();
      setRemoteCameraStatus('Phone camera connection closed. Reconnecting…');
      setRemoteCameraStatusCode('dashboard-disconnected');
      if (dashboardUnmountingRef.current || socketRef.current !== socket) return;
      const attempt = socketReconnectAttemptsRef.current;
      socketReconnectAttemptsRef.current += 1;
      const delayMs = Math.min(10_000, 500 * (2 ** attempt));
      if (socketReconnectTimerRef.current) window.clearTimeout(socketReconnectTimerRef.current);
      socketReconnectTimerRef.current = window.setTimeout(() => {
        socketReconnectTimerRef.current = null;
        wireSocket(bundle);
      }, delayMs);
    };
  }, [clearRemoteCameraFrame, flushPendingLandmarkSeries, handleUsePhoneCamera, historyItems, poseAnalysis, selectedTest, session]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionBundle?.session?.id) {
      window.sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(sessionBundle));
    } else {
      window.sessionStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    }
  }, [sessionBundle]);

  useEffect(() => {
    if (!sessionBundle?.session?.id || restoredSocketWiredRef.current) return;
    restoredSocketWiredRef.current = true;
    wireSocket(sessionBundle);
  }, [sessionBundle, wireSocket]);

  const handleCreateSession = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const bundle = await createSession();
      setSessionBundle(bundle);
      setLiveResult(null);
      setFinalResult(null);
      clearRemoteCameraFrame();
      pendingFrameMetaRef.current = null;
      setRemoteCameraStatus('Scan the QR code to show the phone camera here.');
      setRemoteCameraStatusCode('waiting-for-phone');
      restoredSocketWiredRef.current = true;
      wireSocket(bundle);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [clearRemoteCameraFrame, wireSocket]);


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

  const handleUpdateScreening = useCallback(async (screening) => {
    if (!session?.id) throw new Error('Create a session before updating screening.');
    const current = session.assessmentSession;
    const result = await persistAssessmentSessionUpdate(session.id, {
      type: 'SCREENING_UPDATED',
      messageId: typeof crypto !== 'undefined' && crypto.randomUUID
        ? `screening:${crypto.randomUUID()}`
        : `screening:${Date.now()}`,
      expectedRevision: current?.revision,
      screening,
    });
    if (result.assessmentSession) {
      setSessionBundle((previous) => previous?.session
        ? { ...previous, session: { ...previous.session, assessmentSession: result.assessmentSession } }
        : previous);
    }
    return result.assessmentSession;
  }, [session?.assessmentSession, session?.id]);

  const handleSelectTest = useCallback(async (testId) => {
    if (!isSupportedAssessmentTestType(testId)) {
      setError(`Unsupported assessment test type: ${String(testId)}`);
      return;
    }
    setSelectedTest(testId);
    setLiveResult(null);
    setFinalResult(null);
    setActiveStep(activeCameraFrame
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
  }, [activeCameraFrame, session?.id]);

  const handleSaveFinal = useCallback(async () => {
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
      if (result.assessmentSession) {
        setSessionBundle((previous) => previous?.session
          ? { ...previous, session: { ...previous.session, assessmentSession: result.assessmentSession } }
          : previous);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [session?.id, finalResult]);

  const handleCopyPayload = useCallback(async () => {
    if (!sessionBundle?.qrPayload) return;
    try {
      await navigator.clipboard.writeText(sessionBundle.qrPayload);
    } catch (_) {
      setError('Clipboard is unavailable. Select and copy the QR payload manually.');
    }
  }, [sessionBundle?.qrPayload]);

  const canStart = Boolean(session?.id && selectedTest);
  const assessmentSession = session?.assessmentSession || null;
  const assessmentCompletion = {
    balanceCompleted: assessmentSession?.functionalTests?.FOUR_STAGE_BALANCE?.status === 'COMPLETED',
    chairStandCompleted: assessmentSession?.functionalTests?.CHAIR_STAND_30S?.status === 'COMPLETED',
    bothTestsCompleted: assessmentSession?.functionalTests?.FOUR_STAGE_BALANCE?.status === 'COMPLETED'
      && assessmentSession?.functionalTests?.CHAIR_STAND_30S?.status === 'COMPLETED',
    steadiScored: assessmentSession?.steadi?.status === 'SCORED',
  };

  return useMemo(() => ({
    networkInfo,
    sessionBundle,
    session,
    assessmentSession,
    assessmentCompletion,
    selectedTest,
    liveResult,
    finalResult,
    historyItems,
    historySource,
    remoteCameraFrame,
    remoteCameraStatus,
    remoteCameraStatusCode,
    activeCameraFrame,
    activeCameraStream,
    activeCameraStatus,
    isCameraReady,
    isCameraLinked,
    isPhoneProfileLinked,
    hasReceivedPhoneFrame,
    phoneCameraState,
    cameraInputMode,
    localCameraState,
    localCameraError,
    poseAnalysis,
    activeStep,
    busy,
    error,
    canStart,
    setActiveStep,
    handleCreateSession,
    handleSelectTest,
    handleSaveFinal,
    handleCopyPayload,
    handleRefreshSession,
    handleUpdateScreening,
    handleStartLocalCamera,
    handleUsePhoneCamera,
    handleCameraFrameLoaded,
    handleCameraFrameError,
  }), [
    networkInfo,
    sessionBundle,
    session,
    assessmentSession,
    assessmentCompletion.balanceCompleted,
    assessmentCompletion.chairStandCompleted,
    assessmentCompletion.bothTestsCompleted,
    assessmentCompletion.steadiScored,
    selectedTest,
    liveResult,
    finalResult,
    historyItems,
    historySource,
    remoteCameraFrame,
    remoteCameraStatus,
    remoteCameraStatusCode,
    activeCameraFrame,
    activeCameraStream,
    activeCameraStatus,
    isCameraReady,
    isCameraLinked,
    isPhoneProfileLinked,
    hasReceivedPhoneFrame,
    phoneCameraState,
    cameraInputMode,
    localCameraState,
    localCameraError,
    poseAnalysis,
    activeStep,
    busy,
    error,
    canStart,
    handleCreateSession,
    handleSelectTest,
    handleSaveFinal,
    handleCopyPayload,
    handleRefreshSession,
    handleUpdateScreening,
    handleStartLocalCamera,
    handleUsePhoneCamera,
    handleCameraFrameLoaded,
    handleCameraFrameError,
  ]);
}
