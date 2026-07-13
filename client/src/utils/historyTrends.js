export const HistoryChallengeTypes = {
  FourStageBalance: 'four_stage_balance',
  ChairStand: 'chair_stand',
};

const FIVE_RECENT_SESSIONS = 5;
const canonicalBalanceStageIds = {
  SIDE_BY_SIDE: 'side_by_side',
  SEMI_TANDEM: 'semi_tandem',
  TANDEM: 'tandem',
  ONE_LEG: 'one_leg',
};

export const BalancePostureSeries = Object.freeze([
  { wireId: 'SIDE_BY_SIDE', stageId: 'side_by_side', metricKey: 'sideBySideSeconds', label: 'Side-by-Side', shortLabel: 'Side' },
  { wireId: 'SEMI_TANDEM', stageId: 'semi_tandem', metricKey: 'semiTandemSeconds', label: 'Semi-Tandem', shortLabel: 'Semi' },
  { wireId: 'TANDEM', stageId: 'tandem', metricKey: 'tandemSeconds', label: 'Tandem', shortLabel: 'Tandem', emphasized: true },
  { wireId: 'ONE_LEG', stageId: 'one_leg', metricKey: 'oneLegSeconds', label: 'One-Leg', shortLabel: 'One-Leg' },
]);

export function historyItemsFromDataContract(dataContract) {
  if (dataContract?.schemaVersion !== 'steply_data_contract.v1') return [];
  const recent = Array.isArray(dataContract.recentAssessments) ? dataContract.recentAssessments : [];
  return recent
    .filter((assessment) => assessment?.valid === true && assessment?.excludeFromTrends !== true)
    .flatMap((assessment) => {
      const stageById = Object.fromEntries(Object.entries(canonicalBalanceStageIds).map(([wireId, id]) => [
        id,
        {
          id,
          stage: wireId,
          holdSeconds: finiteNumber(assessment.balanceSecondsByStage?.[wireId]),
        },
      ]));
      const common = {
        assessmentSessionId: assessment.assessmentSessionId,
        completedAt: assessment.completedAt,
        receivedAt: assessment.completedAt,
        status: 'VALID',
        valid: true,
        risk: assessment.risk,
        vulnerabilityIds: assessment.vulnerabilityIds || [],
        source: 'MOBILE_DATA_CONTRACT',
      };
      return [
        {
          ...common,
          id: `${assessment.assessmentSessionId}:CHAIR_STAND_30S`,
          testType: HistoryChallengeTypes.ChairStand,
          repetitionCount: assessment.chairStandRepetitions,
          chairStandResult: { repetitionCount: assessment.chairStandRepetitions },
        },
        {
          ...common,
          id: `${assessment.assessmentSessionId}:FOUR_STAGE_BALANCE`,
          testType: HistoryChallengeTypes.FourStageBalance,
          primaryValue: stageById.tandem.holdSeconds,
          balanceResult: { stageById, stages: Object.values(stageById) },
        },
      ];
    });
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function historyTimestamp(item) {
  const timestamp = finiteNumber(item?.receivedAt ?? item?.createdAt ?? item?.completedAt ?? item?.endedAt);
  if (timestamp !== null) return timestamp;
  const parsed = Date.parse(item?.date || item?.timestamp || '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function normalizeHistoryTestType(item) {
  const raw = String(item?.testType || item?.selectedTest || item?.type || '').toLowerCase();
  if (raw === HistoryChallengeTypes.FourStageBalance || raw.includes('four_stage') || raw.includes('balance')) {
    return HistoryChallengeTypes.FourStageBalance;
  }
  if (raw === HistoryChallengeTypes.ChairStand || raw.includes('chair')) {
    return HistoryChallengeTypes.ChairStand;
  }
  return raw || null;
}

function balanceStage(balanceResult, stageId) {
  return balanceResult?.stageById?.[stageId]
    || balanceResult?.stages?.find((stage) => stage?.id === stageId || String(stage?.stage || '').toLowerCase() === stageId)
    || null;
}

function swayMetric(windowMetrics) {
  const mediolateral = finiteNumber(windowMetrics?.sway?.mediolateral?.standardDeviation);
  const anteriorPosterior = finiteNumber(windowMetrics?.sway?.anteriorPosterior?.standardDeviation);
  if (mediolateral === null && anteriorPosterior === null) return null;
  const values = [mediolateral, anteriorPosterior].filter((value) => value !== null);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function extractBalanceMetrics(item) {
  const balanceResult = item?.balanceResult;
  const stages = Object.fromEntries(BalancePostureSeries.map((posture) => [
    posture.metricKey,
    finiteNumber(balanceStage(balanceResult, posture.stageId)?.holdSeconds),
  ]));
  const tandem = balanceStage(balanceResult, 'tandem');
  const tandemSeconds = stages.tandemSeconds;
  const swayRaw = finiteNumber(item?.features?.swayIndex)
    ?? finiteNumber(item?.swayIndex)
    ?? swayMetric(tandem?.totalHold)
    ?? swayMetric(tandem?.staticHold)
    ?? swayMetric(tandem?.dynamicAdjustment);

  return {
    ...stages,
    tandemSeconds,
    balanceSecondsByStage: Object.fromEntries(BalancePostureSeries.map((posture) => [
      posture.wireId,
      posture.metricKey === 'tandemSeconds' ? tandemSeconds : stages[posture.metricKey],
    ])),
    holdSeconds: tandemSeconds,
    swayIndex: swayRaw === null ? null : Number((swayRaw * 100).toFixed(2)),
  };
}

export function extractChairStandMetrics(item) {
  return {
    repetitions: finiteNumber(
      item?.chairStandResult?.repetitionCount
        ?? item?.features?.chairStandCount
        ?? item?.features?.primaryValue
        ?? item?.repetitionCount
        ?? item?.primaryValue
        ?? item?.count,
    ),
  };
}

function formatSessionLabel(index) {
  return `#${index + 1}`;
}

function formatDateLabel(timestamp) {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function buildChallengeTrendSeries(historyItems = [], challengeType, limit = FIVE_RECENT_SESSIONS) {
  const recent = (historyItems || [])
    .filter((item) => normalizeHistoryTestType(item) === challengeType)
    .sort((a, b) => historyTimestamp(b) - historyTimestamp(a))
    .slice(0, limit)
    .reverse();

  return recent.map((item, index) => {
    const timestamp = historyTimestamp(item);
    const metrics = challengeType === HistoryChallengeTypes.FourStageBalance
      ? extractBalanceMetrics(item)
      : extractChairStandMetrics(item);
    return {
      ...metrics,
      id: item.id || `${challengeType}-${timestamp}-${index}`,
      sessionLabel: formatSessionLabel(index),
      dateLabel: formatDateLabel(timestamp),
      timestamp,
      raw: item,
    };
  });
}

export function trendDelta(points = [], metricKey, { lowerIsBetter = false } = {}) {
  const values = points.map((point) => finiteNumber(point?.[metricKey])).filter((value) => value !== null);
  if (values.length < 2) return null;
  const rawDelta = values.at(-1) - values[0];
  return lowerIsBetter ? -rawDelta : rawDelta;
}

export function latestMetric(points = [], metricKey) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = finiteNumber(points[index]?.[metricKey]);
    if (value !== null) return value;
  }
  return null;
}
