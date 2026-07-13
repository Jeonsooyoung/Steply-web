import contract from '../../../../shared/assessmentTestTypes.json';

export const ASSESSMENT_TEST_TYPES_SCHEMA_VERSION = contract.schemaVersion;
export const SUPPORTED_ASSESSMENT_TEST_TYPES = Object.freeze([...contract.allowedTestTypes]);

export const AssessmentTestTypes = Object.freeze({
  ChairStand: 'chair_stand',
  FourStageBalance: 'four_stage_balance',
});

export function isSupportedAssessmentTestType(value) {
  return typeof value === 'string' && SUPPORTED_ASSESSMENT_TEST_TYPES.includes(value);
}

export function assertSupportedAssessmentTestType(value) {
  if (!isSupportedAssessmentTestType(value)) {
    throw new TypeError(`Unsupported assessment test type: ${String(value)}`);
  }
  return value;
}
