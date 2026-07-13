import '../../../../../shared/stage1Assessment.cjs';

const stage1Assessment = globalThis.__steplyStage1Assessment;

export const {
  RiskLevel,
  FallCount,
  Sex,
  AssessmentSessionStatus,
  AssessmentSlotStatus,
  PrescriptionStatus,
  chairStandBelowAverageThreshold,
  scoreSteadiAssessmentSession,
} = stage1Assessment;
