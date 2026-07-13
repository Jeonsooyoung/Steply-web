import config from '../../../../../shared/stage2Analysis.config.json';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const stage2AnalysisConfig = deepFreeze(config);
export const STAGE2_ANALYSIS_CONFIG_VERSION = stage2AnalysisConfig.version;
export const stage2Operational = stage2AnalysisConfig.operational;
