import { PipelineModes, STRUCTURED_PIPELINE_SCHEMA_VERSION } from '../types/index.js';

export const PIPELINE_CONFIG_VERSION = 'pipeline_config.v1';

export const DEFAULT_ASSESSMENT_PIPELINE_MODE = PipelineModes.StructuredV2;

export function resolveAssessmentPipelineMode({
  requestedMode = null,
  isDevelopment = false,
} = {}) {
  if (requestedMode === PipelineModes.StructuredV2) {
    return PipelineModes.StructuredV2;
  }
  return DEFAULT_ASSESSMENT_PIPELINE_MODE;
}

export const pipelineConfig = {
  version: PIPELINE_CONFIG_VERSION,
  schemaVersion: STRUCTURED_PIPELINE_SCHEMA_VERSION,
  defaultMode: DEFAULT_ASSESSMENT_PIPELINE_MODE,
  allowedProductionModes: [PipelineModes.StructuredV2],
  devOnlyModes: [],
};
