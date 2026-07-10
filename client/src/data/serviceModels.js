import { WeakAreaIds } from '../pose/weakAreaRules';
import { OtagoExerciseCatalog, OtagoExerciseKeys } from '../pose/otagoRecommendations';
import {
  AssessmentExerciseLibrary,
  FallRiskLevels,
  OlderAdultFallRiskLabels,
  WeaknessIds as RuleWeaknessIds,
  WeaknessLabels,
} from '../pose/assessmentRules';

export const weakAreaLabels = {
  [WeakAreaIds.AnkleStrategyProprioception]: 'ankle balance control',
  [WeakAreaIds.HipAbductorMediolateralControl]: 'side hip stability',
  [WeakAreaIds.LowerLimbMuscularEndurance]: 'lower-body endurance',
  [RuleWeaknessIds.BalanceControl]: WeaknessLabels[RuleWeaknessIds.BalanceControl],
  [RuleWeaknessIds.AnkleStrategyProprioception]: WeaknessLabels[RuleWeaknessIds.AnkleStrategyProprioception],
  [RuleWeaknessIds.HipAbductorMediolateralControl]: WeaknessLabels[RuleWeaknessIds.HipAbductorMediolateralControl],
  [RuleWeaknessIds.LowerBodyEndurance]: WeaknessLabels[RuleWeaknessIds.LowerBodyEndurance],
  [RuleWeaknessIds.QuadricepsStrength]: WeaknessLabels[RuleWeaknessIds.QuadricepsStrength],
  [RuleWeaknessIds.HipExtensorGluteStrength]: WeaknessLabels[RuleWeaknessIds.HipExtensorGluteStrength],
  [RuleWeaknessIds.EccentricControl]: WeaknessLabels[RuleWeaknessIds.EccentricControl],
  [RuleWeaknessIds.DynamicMobility]: WeaknessLabels[RuleWeaknessIds.DynamicMobility],
  [RuleWeaknessIds.GaitStability]: WeaknessLabels[RuleWeaknessIds.GaitStability],
  [RuleWeaknessIds.TurningControl]: WeaknessLabels[RuleWeaknessIds.TurningControl],
  [RuleWeaknessIds.AsymmetryNeedsReview]: WeaknessLabels[RuleWeaknessIds.AsymmetryNeedsReview],
};

export const weakAreaSupportMessages = {
  [WeakAreaIds.AnkleStrategyProprioception]:
    'Your body needed a little extra time to settle into the stance today. A short balance practice can help your ankles respond more smoothly.',
  [WeakAreaIds.HipAbductorMediolateralControl]:
    'Your body swayed a little more when standing sideways today. Let’s wake up your side hip muscles together.',
  [WeakAreaIds.LowerLimbMuscularEndurance]:
    'Sit-to-stand movement looked a little more effortful today. Let’s build steady leg endurance with a calm pace.',
  [RuleWeaknessIds.HipAbductorMediolateralControl]:
    'Your body swayed a little more from side to side today. Let’s wake up your side hip muscles with a short exercise plan.',
  [RuleWeaknessIds.AnkleStrategyProprioception]:
    'The first few seconds were a little unsteady today. We’ll practice gentle ankle and balance control.',
  [RuleWeaknessIds.LowerBodyEndurance]:
    'Your legs slowed down near the end. We’ll practice gentle strengthening at a safe pace.',
  [RuleWeaknessIds.HipExtensorGluteStrength]:
    'Standing up took a little more effort today. Let’s build leg strength with a short chair exercise.',
  [RuleWeaknessIds.TurningControl]:
    'Turning took a little longer today. Let’s practice a slow, steady walking path.',
  [RuleWeaknessIds.GaitStability]:
    'Your steps were shorter today. We’ll work on steady walking with a simple supported path.',
};

export function displayWeakAreaLabel(value) {
  const id = typeof value === 'string' ? value : value?.id || value?.weakAreaId;
  return weakAreaLabels[id] || 'balance stability';
}

export function buildDemoFinalResult(testType = 'four_stage_balance') {
  const weakAreaId = testType === 'timed_up_and_go'
    ? RuleWeaknessIds.TurningControl
    : testType === 'chair_stand'
      ? RuleWeaknessIds.HipExtensorGluteStrength
      : RuleWeaknessIds.HipAbductorMediolateralControl;
  const recommendation = testType === 'timed_up_and_go'
    ? AssessmentExerciseLibrary.figure_8_walking
    : testType === 'chair_stand'
      ? AssessmentExerciseLibrary.sit_to_stand_practice
      : {
        ...OtagoExerciseCatalog[OtagoExerciseKeys.SideHipStrengthening],
        id: 'side_hip_strengthening',
        name: 'Side Hip Strengthening',
        reason: 'Side-to-side sway was higher during balance stance.',
      };
  const normalizedRecommendation = {
    ...recommendation,
    exerciseKey: recommendation.exerciseKey || recommendation.id || recommendation.exerciseKey,
    title: recommendation.title || recommendation.name,
    description: recommendation.description || recommendation.seniorInstruction,
    safetyNote: recommendation.safetyNote || recommendation.safetyInstruction,
    weakAreaId,
    recommendationRole: 'primary',
    reason: recommendation.reason || 'This exercise matches today’s movement pattern.',
  };
  const primaryValue = testType === 'timed_up_and_go'
    ? 13.4
    : testType === 'chair_stand'
      ? 9
      : 8.6;
  const primaryLabel = testType === 'timed_up_and_go'
    ? 'TUG Time'
    : testType === 'chair_stand'
      ? 'Chair Stands'
      : 'Hold Time';

  return {
    sessionId: 'visual-review-session',
    userId: 'demo-local-profile',
    testType,
    testLabel: testType === 'timed_up_and_go'
      ? 'Timed Up and Go'
      : testType === 'chair_stand'
        ? '30 sec Chair Stand'
        : '4-Stage Balance',
    score: 82,
    confidence: 0.91,
    primaryLabel,
    primaryValue,
    repetitionCount: testType === 'chair_stand' ? 9 : 0,
    stabilityScore: 0.78,
    trunkLeanScore: 0.84,
    symmetryScore: 0.76,
    recommendationLevel: 'practice_needed',
    fallRiskLevel: FallRiskLevels.Moderate,
    olderAdultLabel: OlderAdultFallRiskLabels[FallRiskLevels.Moderate],
    primaryWeakness: weakAreaId,
    primaryWeaknessLabel: weakAreaLabels[weakAreaId],
    secondaryWeaknesses: [],
    weaknessScores: {
      ankleStrategyProprioception: testType === 'four_stage_balance' ? 0.38 : 0.12,
      hipAbductorMediolateralControl: testType === 'four_stage_balance' ? 0.72 : 0.18,
      lowerBodyEndurance: testType === 'chair_stand' ? 0.64 : 0.18,
      quadricepsStrength: testType === 'chair_stand' ? 0.51 : 0.12,
      hipExtensorGluteStrength: testType === 'chair_stand' ? 0.7 : 0.14,
      eccentricControl: 0.25,
      dynamicMobility: testType === 'timed_up_and_go' ? 0.58 : 0.18,
      gaitStability: testType === 'timed_up_and_go' ? 0.44 : 0.16,
      turningControl: testType === 'timed_up_and_go' ? 0.72 : 0.16,
      asymmetryNeedsReview: 0.18,
      balanceControl: testType === 'four_stage_balance' ? 0.56 : 0.12,
    },
    weakAreas: [{ id: weakAreaId, label: weakAreaLabels[weakAreaId] }],
    recommendations: [normalizedRecommendation],
    recommendationPlan: {
      reason: normalizedRecommendation.reason,
      safetyGates: [],
      recommendedExercises: [normalizedRecommendation],
    },
    rawMetrics: testType === 'timed_up_and_go'
      ? {
        totalTimeSec: 13.4,
        turnDurationSec: 3.4,
        gaitSpeedEstimate: 0.72,
        wallOrFurnitureSupportDetected: false,
        confidenceScore: 0.91,
      }
      : testType === 'chair_stand'
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
      testType === 'timed_up_and_go' ? 'TUG time: 13.4 seconds' : testType === 'chair_stand' ? 'Chair stands: 9' : 'Tandem hold: 8.6 seconds',
      testType === 'timed_up_and_go' ? 'Turning took a little longer today' : testType === 'chair_stand' ? 'Forward lean increased during standing' : 'Side-to-side sway increased near the end',
      'Full-body view was clear',
    ],
    message: weakAreaSupportMessages[weakAreaId],
    seniorMessage: weakAreaSupportMessages[weakAreaId],
    staffMessage: 'Moderate screening signal. Recommend matched exercise practice and repeat check next session.',
    professionalNotes: 'Rule-based screening support only. Review if the same pattern repeats or combines with decline on another assessment.',
    trendWarnings: [],
    completedAt: Date.now(),
  };
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
    weakAreas: ['side hip stability', 'lower-body endurance'],
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
    weakAreas: ['lower-body endurance'],
    adherence: 74,
    priorityReason: 'Repeated lower-body endurance weakness across recent checks.',
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
    weakAreas: ['ankle balance control'],
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
    weakAreas: ['side hip stability'],
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
    weakAreas: ['ankle balance control', 'side hip stability'],
    adherence: 52,
    priorityReason: 'Repeated balance weakness and tandem hold under 10 seconds.',
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
  weakArea: 'side hip stability',
  failedCriteria: ['Tandem stance under 10 seconds', 'Chair Stand below age/sex threshold'],
  trendWarning: 'Tandem hold declined from the recent 5-session average.',
  recommendedNextAction: 'Use side hip strengthening and repeat balance plus chair-stand screening next session.',
  professionalReviewSuggested: true,
  exerciseAdherence: 58,
  familyAction:
    'Sit-to-stand performance has decreased for three sessions. Consider checking in and encouraging a clinic visit if this continues.',
  professionalNote:
    'Trend suggests lower-body endurance and side hip stability should be reviewed before increasing difficulty.',
  trend: [
    { session: '1', holdSeconds: 10.4, stability: 82, adherence: 72 },
    { session: '2', holdSeconds: 9.8, stability: 80, adherence: 68 },
    { session: '3', holdSeconds: 9.1, stability: 76, adherence: 64 },
    { session: '4', holdSeconds: 8.9, stability: 74, adherence: 61 },
    { session: '5', holdSeconds: 8.6, stability: 71, adherence: 58 },
  ],
  measurementHistory: [
    { date: 'Jun 25', test: '4-Stage Balance', result: '10.4 sec tandem hold', category: 'Moderate' },
    { date: 'Jun 28', test: 'Chair Stand', result: '10 repetitions', category: 'Moderate' },
    { date: 'Jul 1', test: '4-Stage Balance', result: '9.1 sec tandem hold', category: 'Needs Review' },
    { date: 'Jul 4', test: 'Chair Stand', result: '8 repetitions', category: 'Needs Review' },
    { date: 'Jul 7', test: '4-Stage Balance', result: '8.6 sec tandem hold', category: 'Needs Review' },
  ],
};
