export const PERSISTENCE_CONFIG_VERSION = 'persistence_config.v1';

export const persistenceConfig = {
  version: PERSISTENCE_CONFIG_VERSION,
  requiresLivePoseSource: true,
  requiresFinalResult: true,
  rejectsDemo: true,
  rejectsFallback: true,
  rejectsManualTest: true,
  requiresAnalyzerFinalEvent: true,
  requiresTrackingQualitySummary: true,
};

