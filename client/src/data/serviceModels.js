import {
  AssessmentResultTypes,
  AssessmentStatuses,
  ResultSources,
  assessmentTypeForTestType,
  withAssessmentMetadata,
} from '../pose/assessmentResultMetadata';
import {
  FindingClassifications,
  FunctionalDomains,
  SteadiRiskLevels,
} from '../pipeline/shared/types/index.js';
import { FunctionalFindingTypes } from '../pipeline/findings/functionalFindings.js';
import { OTAGO_EXERCISE_CATALOG, OtagoExerciseIds } from '../pipeline/recommendation/otagoExerciseEngine.js';

export const functionalFindingLabels = {
  [FunctionalFindingTypes.ChairStandBelowReference]: 'Chair stand below reference',
  [FunctionalFindingTypes.ArmSupportRequired]: 'Arm support used',
  [FunctionalFindingTypes.BasicBalanceDifficulty]: 'Basic balance difficulty',
  [FunctionalFindingTypes.SemiTandemHoldDifficulty]: 'Semi-tandem hold difficulty',
  [FunctionalFindingTypes.TandemHoldDifficulty]: 'Tandem hold difficulty',
  [FunctionalFindingTypes.SingleLegHoldDifficulty]: 'Single-leg hold difficulty',
  [FunctionalFindingTypes.LateRepetitionSlowdown]: 'Later repetitions slowed',
  [FunctionalFindingTypes.TrunkCompensationPattern]: 'Forward lean pattern',
  [FunctionalFindingTypes.MovementAsymmetryPattern]: 'Left-right movement pattern',
  [FunctionalFindingTypes.MediolateralSwayPattern]: 'Side-to-side movement pattern',
  [FunctionalFindingTypes.AnteriorPosteriorSwayPattern]: 'Forward-back movement pattern',
  [FunctionalFindingTypes.FrequentPositionCorrection]: 'Frequent position correction',
  [FunctionalFindingTypes.LowMeasurementConfidence]: 'Low measurement confidence',
};

export const functionalFindingSupportMessages = {
  [FunctionalFindingTypes.ChairStandBelowReference]:
    'You completed fewer chair stands than the reference for your age and sex. We will start with gentle supported practice.',
  [FunctionalFindingTypes.TandemHoldDifficulty]:
    'You had difficulty holding the tandem position for 10 seconds. We will use supported balance practice.',
  [FunctionalFindingTypes.MediolateralSwayPattern]:
    'Your movement showed more side-to-side motion while holding the position. We will keep balance practice supported.',
};

export function displayFunctionalFindingLabel(value) {
  const id = typeof value === 'string' ? value : value?.findingType || value?.type || value?.id;
  return functionalFindingLabels[id] || 'Movement pattern';
}

export function buildDemoFinalResult(testType = 'four_stage_balance') {
  const normalizedTestType = testType === 'chair_stand' ? 'chair_stand' : 'four_stage_balance';
  const findingType = normalizedTestType === 'chair_stand'
    ? FunctionalFindingTypes.ChairStandBelowReference
    : FunctionalFindingTypes.TandemHoldDifficulty;
  const supportFindingType = normalizedTestType === 'chair_stand'
    ? FunctionalFindingTypes.LateRepetitionSlowdown
    : FunctionalFindingTypes.MediolateralSwayPattern;
  const demoExercise = OTAGO_EXERCISE_CATALOG.find((exercise) => exercise.exerciseId === (
    normalizedTestType === 'chair_stand'
      ? OtagoExerciseIds.SitToStand
      : OtagoExerciseIds.TandemStance
  ));
  const primaryValue = normalizedTestType === 'chair_stand'
    ? 9
    : 8.6;
  const primaryLabel = normalizedTestType === 'chair_stand'
    ? 'Chair Stands'
    : 'Hold Time';

  return withAssessmentMetadata({
    sessionId: 'visual-review-session',
    userId: 'demo-local-profile',
    testType: normalizedTestType,
    testLabel: normalizedTestType === 'chair_stand'
      ? '30-Second Chair Stand Test'
      : '4-Stage Balance Test',
    score: 82,
    confidence: 0.91,
    primaryLabel,
    primaryValue,
    repetitionCount: normalizedTestType === 'chair_stand' ? 9 : 0,
    stabilityScore: 0.78,
    trunkLeanScore: 0.84,
    symmetryScore: 0.76,
    recommendationLevel: 'practice_needed',
    fallRiskLevel: SteadiRiskLevels.Moderate,
    steadiRiskLevel: SteadiRiskLevels.Moderate,
    olderAdultLabel: 'MODERATE',
    functionalFindings: [
      {
        findingId: 'demo-primary-finding',
        findingType,
        classification: FindingClassifications.Primary,
        domain: normalizedTestType === 'chair_stand'
          ? FunctionalDomains.MovementEndurance
          : FunctionalDomains.NarrowBaseBalance,
        confidence: 0.91,
        evidence: {
          assessmentType: normalizedTestType === 'chair_stand' ? 'CHAIR_STAND_30S' : 'FOUR_STAGE_BALANCE',
          measurementKeys: normalizedTestType === 'chair_stand' ? ['completedRepetitions'] : ['tandemHoldSeconds'],
          observedValues: normalizedTestType === 'chair_stand'
            ? { completedRepetitions: 9 }
            : { tandemHoldSeconds: 8.6 },
          comparisonReference: normalizedTestType === 'chair_stand'
            ? 'CDC age and sex reference'
            : '10-second tandem hold reference',
        },
        userMessage: functionalFindingLabels[findingType],
        recommendationTags: [findingType],
      },
      {
        findingId: 'demo-secondary-finding',
        findingType: supportFindingType,
        classification: FindingClassifications.Secondary,
        domain: FunctionalDomains.MovementControl,
        confidence: 0.82,
        evidence: {
          assessmentType: normalizedTestType === 'chair_stand' ? 'CHAIR_STAND_30S' : 'FOUR_STAGE_BALANCE',
          measurementKeys: normalizedTestType === 'chair_stand' ? ['lateRepetitionSlowdownRatio'] : ['mediolateralSway'],
          observedValues: normalizedTestType === 'chair_stand'
            ? { lateRepetitionSlowdownRatio: 0.18 }
            : { mediolateralSway: 0.052 },
          comparisonReference: 'Observation only; does not change STEADI risk.',
        },
        userMessage: functionalFindingLabels[supportFindingType],
        recommendationTags: [supportFindingType],
      },
    ],
    recommendations: [],
    recommendationPlan: {
      reason: 'Demo data is not used for saved exercise recommendations.',
      safetyGates: ['demo_data'],
      recommendedExercises: [],
      previewExercise: demoExercise ? {
        exerciseId: demoExercise.exerciseId,
        displayName: demoExercise.displayName,
        reason: 'Demo preview only. Structured live results are required before saving a plan.',
      } : null,
    },
    rawMetrics: normalizedTestType === 'chair_stand'
      ? {
        completedReps: 9,
        officialClinicalReps: 9,
        trunkForwardLeanPeak: 22,
        armAssistDetected: false,
        confidenceScore: 0.91,
      }
      : {
        tandemHoldSec: 8.6,
        trunkSwayML: 0.052,
        handSupportDetected: false,
        confidenceScore: 0.91,
      },
    flags: [
      normalizedTestType === 'chair_stand' ? 'Chair stands: 9' : 'Tandem hold: 8.6 seconds',
      normalizedTestType === 'chair_stand' ? 'Forward lean increased during standing' : 'Side-to-side sway increased near the end',
      'Full-body view was clear',
    ],
    message: functionalFindingSupportMessages[findingType],
    seniorMessage: functionalFindingSupportMessages[findingType],
    staffMessage: 'Moderate screening signal. Recommend matched exercise practice and repeat check next session.',
    professionalNotes: 'Rule-based screening support only. Review if the same pattern repeats or combines with decline on another assessment.',
    trendWarnings: [],
    completedAt: Date.now(),
  }, {
    source: ResultSources.Demo,
    sessionId: 'visual-review-session',
    analysisSessionId: 'visual-review-session',
    testType: normalizedTestType,
    assessmentType: assessmentTypeForTestType(normalizedTestType),
    isPersistable: false,
    isClinicallyScorable: false,
    status: AssessmentStatuses.Valid,
    resultType: AssessmentResultTypes.Final,
    analyzerFinalEvent: false,
  });
}

export const centerParticipants = [
  {
    id: 'lillian-cho',
    name: 'Lillian Cho',
    age: 78,
    riskCategory: 'Needs Review',
    completedToday: false,
    queueStatus: 'Ready',
    lastSession: 'Today, 9:10 AM',
    scoreChange: -14,
    participationChange: -22,
    tandemHoldSeconds: 7.8,
    functionalFindings: ['Side-to-side movement pattern', 'Chair stand below reference'],
    adherence: 58,
    priorityReason: 'Recent score dropped and tandem hold stayed under 10 seconds.',
    nextAction: 'Recommend professional consultation',
    trend: [84, 82, 77, 74, 68],
    sessions: [
      { label: 'Jun 25', status: 'Completed', score: 84, note: 'Steady pace' },
      { label: 'Jun 28', status: 'Completed', score: 82, note: 'Good setup' },
      { label: 'Jul 1', status: 'Completed', score: 77, note: 'More sway' },
      { label: 'Jul 4', status: 'Missed', score: null, note: 'No session' },
      { label: 'Jul 7', status: 'Needs follow-up', score: 68, note: 'Tandem under 10 sec' },
    ],
  },
  {
    id: 'marcus-reed',
    name: 'Marcus Reed',
    age: 82,
    riskCategory: 'Moderate',
    completedToday: true,
    queueStatus: 'Completed',
    lastSession: 'Today, 8:45 AM',
    scoreChange: -4,
    participationChange: 0,
    tandemHoldSeconds: 10.6,
    functionalFindings: ['Chair stand below reference'],
    adherence: 74,
    priorityReason: 'Chair stand count stayed below the reference across recent checks.',
    nextAction: 'Review lower-body endurance trend',
    trend: [76, 75, 73, 74, 72],
    sessions: [
      { label: 'Jun 26', status: 'Completed', score: 76, note: 'Chair stand slow' },
      { label: 'Jun 29', status: 'Completed', score: 75, note: 'Consistent' },
      { label: 'Jul 2', status: 'Completed', score: 73, note: 'Lower reps' },
      { label: 'Jul 5', status: 'Completed', score: 74, note: 'Good effort' },
      { label: 'Jul 7', status: 'Completed', score: 72, note: 'Continue practice' },
    ],
  },
  {
    id: 'ana-morales',
    name: 'Ana Morales',
    age: 73,
    riskCategory: 'Low',
    completedToday: true,
    queueStatus: 'Completed',
    lastSession: 'Today, 9:35 AM',
    scoreChange: 5,
    participationChange: 8,
    tandemHoldSeconds: 14.2,
    functionalFindings: ['No primary finding this week'],
    adherence: 91,
    priorityReason: 'Stable trend and strong participation.',
    nextAction: 'Maintain balance practice frequency',
    trend: [78, 81, 82, 84, 86],
    sessions: [
      { label: 'Jun 25', status: 'Completed', score: 78, note: 'Good recovery' },
      { label: 'Jun 29', status: 'Completed', score: 81, note: 'Smooth stance' },
      { label: 'Jul 2', status: 'Completed', score: 82, note: 'Consistent' },
      { label: 'Jul 5', status: 'Completed', score: 84, note: 'Improved hold' },
      { label: 'Jul 7', status: 'Completed', score: 86, note: 'Strong session' },
    ],
  },
  {
    id: 'robert-han',
    name: 'Robert Han',
    age: 80,
    riskCategory: 'Moderate',
    completedToday: false,
    queueStatus: 'Waiting',
    lastSession: '5 days ago',
    scoreChange: -2,
    participationChange: -35,
    tandemHoldSeconds: 11.1,
    functionalFindings: ['Side-to-side movement pattern'],
    adherence: 43,
    priorityReason: 'Participation decreased over the last two weeks.',
    nextAction: 'Encourage home exercise',
    trend: [80, 79, 79, 78, 78],
    sessions: [
      { label: 'Jun 22', status: 'Completed', score: 80, note: 'Clear view' },
      { label: 'Jun 25', status: 'Completed', score: 79, note: 'Slight sway' },
      { label: 'Jun 29', status: 'Missed', score: null, note: 'No session' },
      { label: 'Jul 2', status: 'Completed', score: 78, note: 'Needed support' },
      { label: 'Jul 7', status: 'Waiting', score: null, note: 'Check in today' },
    ],
  },
  {
    id: 'grace-lin',
    name: 'Grace Lin',
    age: 76,
    riskCategory: 'Needs Review',
    completedToday: false,
    queueStatus: 'Needs follow-up',
    lastSession: 'Yesterday, 3:20 PM',
    scoreChange: -10,
    participationChange: -12,
    tandemHoldSeconds: 8.9,
    functionalFindings: ['Tandem hold difficulty', 'Side-to-side movement pattern'],
    adherence: 52,
    priorityReason: 'Repeated balance findings and tandem hold under 10 seconds.',
    nextAction: 'Repeat balance check next week',
    trend: [82, 80, 76, 75, 72],
    sessions: [
      { label: 'Jun 24', status: 'Completed', score: 82, note: 'Steady' },
      { label: 'Jun 27', status: 'Completed', score: 80, note: 'Good setup' },
      { label: 'Jun 30', status: 'Completed', score: 76, note: 'More sway' },
      { label: 'Jul 3', status: 'Completed', score: 75, note: 'Slow recovery' },
      { label: 'Jul 6', status: 'Needs follow-up', score: 72, note: 'Review next visit' },
    ],
  },
];

export function priorityRank(participant) {
  const riskWeight = participant.riskCategory === 'Needs Review' ? 100 : participant.riskCategory === 'Moderate' ? 50 : 0;
  const dropWeight = Math.abs(Math.min(0, participant.scoreChange || 0));
  const participationWeight = Math.abs(Math.min(0, participant.participationChange || 0)) / 2;
  const tandemWeight = participant.tandemHoldSeconds < 10 ? 24 : 0;
  return riskWeight + dropWeight + participationWeight + tandemWeight;
}

export function centerSummary(participants = centerParticipants) {
  return {
    total: participants.length,
    completedToday: participants.filter((participant) => participant.completedToday).length,
    needsFollowUp: participants.filter((participant) => participant.riskCategory === 'Needs Review').length,
    missedRecentSessions: participants.filter((participant) => participant.queueStatus === 'Waiting' || participant.adherence < 60).length,
  };
}

export const weeklyReport = {
  personName: 'Lillian Cho',
  weekLabel: 'Week of July 7, 2026',
  overallStatus: 'Needs a little more support this week',
  changeFromLastWeek: 'Balance hold decreased by 1.8 seconds',
  functionalFinding: 'Side-to-side movement pattern',
  failedCriteria: ['Tandem stance under 10 seconds', 'Chair Stand below age/sex threshold'],
  trendWarning: 'Tandem hold declined from the recent 5-session average.',
  recommendedNextAction: 'Use side hip strengthening and repeat balance plus chair-stand screening next session.',
  professionalReviewSuggested: true,
  exerciseAdherence: 58,
  familyAction:
    'Sit-to-stand performance has decreased for three sessions. Consider checking in and encouraging a clinic visit if this continues.',
  professionalNote:
    'Review the chair-stand count and side-to-side movement pattern before increasing difficulty.',
  trend: [
    { session: '1', holdSeconds: 10.4, stability: 82, adherence: 72 },
    { session: '2', holdSeconds: 9.8, stability: 80, adherence: 68 },
    { session: '3', holdSeconds: 9.1, stability: 76, adherence: 64 },
    { session: '4', holdSeconds: 8.9, stability: 74, adherence: 61 },
    { session: '5', holdSeconds: 8.6, stability: 71, adherence: 58 },
  ],
  measurementHistory: [
    { date: 'Jun 25', test: '4-Stage Balance Test', result: '10.4 sec tandem hold', category: 'Moderate' },
    { date: 'Jun 28', test: '30-Second Chair Stand Test', result: '10 repetitions', category: 'Moderate' },
    { date: 'Jul 1', test: '4-Stage Balance Test', result: '9.1 sec tandem hold', category: 'Needs Review' },
    { date: 'Jul 4', test: '30-Second Chair Stand Test', result: '8 repetitions', category: 'Needs Review' },
    { date: 'Jul 7', test: '4-Stage Balance Test', result: '8.6 sec tandem hold', category: 'Needs Review' },
  ],
};
