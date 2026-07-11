import { useMemo, useState } from 'react';
import {
  AppHeader,
  ConnectionIndicator,
  Navigation,
} from '../components/foundation/SteplyDesignSystem';
import { displayNavigationItems } from './steplyRoutes';
import {
  HistoryChallengeTypes,
  buildChallengeTrendSeries,
  extractChairStandMetrics,
  historyTimestamp,
  normalizeHistoryTestType,
  trendDelta,
} from '../utils/historyTrends';
import {
  ageYearsFromProfile,
  chairStandBelowAverageThreshold,
  normalizeSteadiGender,
} from '../pose/steadiRules';

function queryParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function queryValue(name, fallback = '') {
  return queryParams().get(name) || fallback;
}

function goTo(path) {
  if (typeof window !== 'undefined') window.location.assign(path);
}

function todayPlus(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(date);
}

function shortDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function whole(value, fallback = 0) {
  const number = finite(value);
  return number === null ? fallback : Math.max(0, Math.round(number));
}

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function titleCase(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function Shell({ title, eyebrow, description, connection, children, className = '' }) {
  return (
    <div className={`foundation-shell step-eight-shell ${className}`}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        connection={connection}
      />
      <Navigation items={displayNavigationItems} currentPath={typeof window === 'undefined' ? '' : window.location.pathname} />
      {children}
    </div>
  );
}

function StepIcon({ tone = 'info' }) {
  return <span className={`step-eight-icon step-eight-icon--${tone}`} aria-hidden="true" />;
}

const supportCopy = {
  low: {
    label: 'Low Support Needs',
    detail: 'Current results do not show a need for extra support beyond the plan.',
    tone: 'success',
  },
  moderate: {
    label: 'Moderate Support Needs',
    detail: 'Regular strength and balance practice may be helpful.',
    tone: 'warning',
  },
  high: {
    label: 'Professional Assessment Recommended',
    detail: 'A healthcare professional should review balance and mobility before harder exercise.',
    tone: 'danger',
  },
  not_ready: {
    label: 'Assessment Needs Review',
    detail: 'A complete comparison is not available from the current assessment.',
    tone: 'warning',
  },
};

const findingLabelMap = {
  CHAIR_STAND_BELOW_REFERENCE: 'Leg Endurance',
  ARM_SUPPORT_REQUIRED: 'Standing Up From a Chair',
  BASIC_BALANCE_DIFFICULTY: 'Ankle Balance Control',
  SEMI_TANDEM_HOLD_DIFFICULTY: 'Side-to-Side Stability',
  TANDEM_HOLD_DIFFICULTY: 'Side-to-Side Stability',
  SINGLE_LEG_HOLD_DIFFICULTY: 'Single-Leg Stability',
  LATE_REPETITION_SLOWDOWN: 'Leg Endurance',
  TRUNK_COMPENSATION_PATTERN: 'Standing Up From a Chair',
  MOVEMENT_ASYMMETRY_PATTERN: 'Left and Right Movement Pattern',
  MEDIOLATERAL_SWAY_PATTERN: 'Side-to-Side Stability',
  ANTERIOR_POSTERIOR_SWAY_PATTERN: 'Ankle Balance Control',
  FREQUENT_POSITION_CORRECTION: 'Ankle Balance Control',
  LOW_MEASUREMENT_CONFIDENCE: 'Measurement Quality',
};

const exerciseNameMap = {
  front_knee_strengthening: 'Front Knee Strengthening',
  back_knee_strengthening: 'Back Knee Strengthening',
  side_hip_strengthening: 'Side Hip Strengthening',
  calf_raises: 'Calf Raises',
  toe_raises: 'Toe Raises',
  knee_bends: 'Knee Bends',
  tandem_stance: 'Tandem Stand',
  tandem_stand: 'Tandem Stand',
  one_leg_stand: 'One-Leg Stand',
  one_leg_stance: 'One-Leg Stand',
  sit_to_stand: 'Sit to Stand',
  chair_stand: 'Sit to Stand',
  sideways_walking: 'Sideways Walking',
  side_ways_walking: 'Sideways Walking',
  tandem_walk: 'Heel-to-Toe Walking',
  balance_practice: 'Tandem Stand',
};

function safeExerciseName(exercise = {}) {
  const key = normalizeKey(exercise.exerciseId || exercise.exerciseKey || exercise.id || exercise.arInputKey || exercise.displayName || exercise.title || exercise.name);
  if (exerciseNameMap[key]) return exerciseNameMap[key];
  const raw = exercise.otagoSourceName || exercise.displayName || exercise.title || exercise.name || '';
  if (/^[A-Z]\d+$/i.test(String(raw).trim())) return 'Recommended Exercise';
  return titleCase(raw || 'Recommended Exercise');
}

function profileFromDashboard(dashboard) {
  return dashboard?.session?.profile || dashboard?.profile || {};
}

function resultFromDashboard(dashboard) {
  return dashboard?.finalResult || dashboard?.poseAnalysis?.finalResult || dashboard?.poseAnalysis?.analysisResult || {};
}

function recommendationPlanFrom(result = {}) {
  return result?.carePipeline?.agent?.currentExercisePlan
    || result?.carePipeline?.finalResultPatch?.recommendationPlan
    || result?.recommendationPlan
    || result?.structuredPipeline?.exercisePlan
    || {};
}

function selectedExercisesFrom(result = {}) {
  const plan = recommendationPlanFrom(result);
  const exercises = plan.selectedExercises || plan.recommendedExercises || result.recommendedExercises || result.recommendations || [];
  if (Array.isArray(exercises) && exercises.length) return exercises;
  return [
    { displayName: 'Tandem Stand', category: 'Balance', sets: 2, repetitions: 2 },
    { displayName: 'Sit to Stand', category: 'Strength', sets: 2, repetitions: 4 },
  ];
}

function supportLevelFrom(result = {}) {
  const fromQuery = normalizeKey(queryValue('support', ''));
  if (fromQuery === 'low' || fromQuery === 'moderate' || fromQuery === 'high') return fromQuery;
  const value = normalizeKey(
    result.fallRiskLevel
      || result.carePipeline?.agent?.observedState?.steadiSeverity
      || result.recommendationPlan?.riskLevel
      || '',
  );
  if (value.includes('professional') || value.includes('needs_review') || value.includes('high')) return 'high';
  if (value.includes('moderate') || value.includes('medium')) return 'moderate';
  if (value.includes('low')) return 'low';
  if (result.testFlags?.clinicalResultAvailable === false || result.invalid) return 'not_ready';
  return queryValue('scenario', '') === 'none' ? 'not_ready' : 'moderate';
}

function isInvalidAssessment(item = {}) {
  const status = normalizeKey(item.status || item.metadata?.status || item.resultStatus);
  const quality = normalizeKey(item.qualityStatus || item.trackingQualityStatus || item.trackingQualitySummary?.qualityStatus);
  return Boolean(
    item.invalid
      || status.includes('invalid')
      || status.includes('incomplete')
      || quality.includes('low')
      || item.metadata?.isClinicallyScorable === false
      || item.isClinicallyScorable === false,
  );
}

function scenarioHistory() {
  const scenario = queryValue('scenario', queryValue('history', 'five'));
  if (scenario === 'none') return [];
  const base = Date.now();
  const chairValues = scenario === 'one' ? [9] : scenario === 'declining' ? [12, 11, 10, 9, 8] : [7, 8, 9, 10, 11];
  const tandemValues = scenario === 'one' ? [7.4] : scenario === 'declining' ? [10, 8.8, 7.7, 6.8, 5.9] : [5.6, 6.3, 7.4, 8.5, 9.2];
  const items = [];
  chairValues.forEach((value, index) => {
    items.push({
      id: `step-eight-chair-${index}`,
      testType: 'chair_stand',
      selectedTest: 'chair_stand',
      receivedAt: base - (chairValues.length - index) * 3 * 24 * 60 * 60 * 1000,
      repetitionCount: value,
      count: value,
      chairStandResult: { repetitionCount: value },
      status: 'VALID',
      metadata: { isClinicallyScorable: true },
    });
  });
  tandemValues.forEach((value, index) => {
    items.push({
      id: `step-eight-balance-${index}`,
      testType: 'four_stage_balance',
      selectedTest: 'four_stage_balance',
      receivedAt: base - (tandemValues.length - index) * 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000,
      primaryValue: value,
      count: value,
      balanceResult: {
        stageById: {
          side_by_side: { id: 'side_by_side', holdSeconds: 10 },
          semi_tandem: { id: 'semi_tandem', holdSeconds: Math.min(10, value + 1.1) },
          tandem: { id: 'tandem', holdSeconds: value },
          one_leg: { id: 'one_leg', holdSeconds: Math.max(1, value - 4) },
        },
      },
      status: 'VALID',
      metadata: { isClinicallyScorable: true },
    });
  });
  if (queryValue('invalid', '') === '1' || scenario === 'invalid') {
    items.push({
      id: 'step-eight-invalid',
      testType: 'chair_stand',
      selectedTest: 'chair_stand',
      receivedAt: base - 2 * 24 * 60 * 60 * 1000,
      status: 'INVALID',
      invalid: true,
      trackingQualityStatus: 'LOW',
      message: 'Camera quality was too low.',
    });
  }
  return items.sort((a, b) => historyTimestamp(b) - historyTimestamp(a));
}

function historyFromDashboard(dashboard) {
  if (queryValue('scenario', '') || queryValue('history', '')) return scenarioHistory();
  const items = dashboard?.historyItems || [];
  return items.length ? items : scenarioHistory();
}

function chairReference(dashboard, result) {
  const fromQuery = finite(queryValue('reference', ''));
  if (fromQuery !== null) return fromQuery;
  const profile = profileFromDashboard(dashboard);
  const age = ageYearsFromProfile(profile);
  const gender = normalizeSteadiGender(profile.gender || profile.sex);
  return chairStandBelowAverageThreshold(age, gender) || 10;
}

function balanceStageValue(item = {}, id) {
  const balance = item.balanceResult || item.rawAnalysisResult?.balanceResult || {};
  const stage = balance.stageById?.[id] || balance.stages?.find((entry) => entry.id === id);
  return finite(stage?.holdSeconds ?? stage?.holdDurationSeconds ?? stage?.durationSeconds);
}

function latestBalanceStages(validHistory = []) {
  const latest = validHistory
    .filter((item) => normalizeHistoryTestType(item) === HistoryChallengeTypes.FourStageBalance)
    .sort((a, b) => historyTimestamp(b) - historyTimestamp(a))[0];
  return [
    { id: 'side_by_side', label: 'Feet Side by Side', seconds: balanceStageValue(latest, 'side_by_side') ?? 10 },
    { id: 'semi_tandem', label: 'Semi-Tandem', seconds: balanceStageValue(latest, 'semi_tandem') ?? 10 },
    { id: 'tandem', label: 'Tandem Stand', seconds: balanceStageValue(latest, 'tandem') ?? finite(latest?.primaryValue) ?? 8.2, emphasized: true },
    { id: 'one_leg', label: 'One-Leg Stand', seconds: balanceStageValue(latest, 'one_leg') ?? 3.8 },
  ];
}

function weeklySeries() {
  if (queryValue('weekly', '') === 'missing') return [];
  const scenario = queryValue('scenario', '');
  if (scenario === 'none') return [];
  return [
    { label: 'Week 1', completed: 1 },
    { label: 'Week 2', completed: 2 },
    { label: 'Week 3', completed: queryValue('completion', '') === 'low' ? 1 : 3 },
    { label: 'This Week', completed: whole(queryValue('completedSessions', ''), queryValue('partial', '') === '1' ? 1 : 2) },
  ];
}

function safetyEvents() {
  if (queryValue('safety', '') === '0') return [];
  if (queryValue('safety', '') === '1' || queryValue('scenario', '') === 'safety') {
    return [
      { label: 'Dizziness reported during exercise', date: todayPlus(-2) },
      { label: 'Exercise session ended early', date: todayPlus(-2) },
    ];
  }
  return [];
}

function functionalAreas(result = {}) {
  const findings = result.functionalFindings || result.carePipeline?.agent?.observedState?.activeFunctionalFindings || [];
  const mapped = findings.map((finding, index) => {
    const type = finding.findingType || finding.type;
    return {
      label: findingLabelMap[type] || 'Movement Observation',
      text: 'Your movement showed a pattern that may benefit from supported practice.',
      key: `${type || 'finding'}-${index}`,
    };
  });
  if (mapped.length) return mapped.slice(0, 5);
  return [
    { key: 'balance', label: 'Side-to-Side Stability', text: 'Your movement showed a balance pattern that may benefit from supported practice.' },
    { key: 'strength', label: 'Leg Endurance', text: 'Your chair stand result may benefit from regular strength practice.' },
  ];
}

function agentActions(result = {}) {
  const scenario = queryValue('agent', '');
  if (scenario === 'none') return [];
  const trace = result.agentDecisionTrace || result.carePipeline?.agent?.decisionTrace || [];
  const fromTrace = trace.map((entry, index) => ({
    key: `trace-${index}`,
    label: 'Steply action recorded',
    detail: String(entry?.seniorMessage || entry?.message || entry).replace(/[_-]+/g, ' '),
  })).filter((entry) => entry.detail && entry.detail !== '[object Object]');
  if (fromTrace.length) return fromTrace.slice(0, 4);
  return [
    {
      key: 'reassessment',
      label: 'Reassessment moved earlier',
      detail: 'Your reassessment was moved earlier because your Tandem Stand time decreased across recent sessions.',
    },
    {
      key: 'split',
      label: 'Session split suggested',
      detail: 'A shorter session was suggested to keep exercise practice manageable.',
    },
    {
      key: 'progression',
      label: 'Exercise progression held',
      detail: 'Exercise progression was held because recent safety information needs review.',
    },
  ];
}

function progressContext(dashboard) {
  const result = resultFromDashboard(dashboard);
  const history = historyFromDashboard(dashboard);
  const invalidHistory = history.filter(isInvalidAssessment);
  const validHistory = history.filter((item) => !isInvalidAssessment(item));
  const chairSeries = buildChallengeTrendSeries(validHistory, HistoryChallengeTypes.ChairStand, 5);
  const balanceSeries = buildChallengeTrendSeries(validHistory, HistoryChallengeTypes.FourStageBalance, 5);
  const chairDelta = trendDelta(chairSeries, 'repetitions');
  const tandemDelta = trendDelta(balanceSeries, 'holdSeconds');
  const weekly = weeklySeries();
  const support = supportCopy[supportLevelFrom(result)] || supportCopy.moderate;
  const safety = safetyEvents();

  return {
    result,
    history,
    validHistory,
    invalidHistory,
    chairSeries,
    balanceSeries,
    balanceStages: latestBalanceStages(validHistory),
    weekly,
    support,
    chairReference: chairReference(dashboard, result),
    exerciseCompletion: weekly.length ? `${weekly.at(-1).completed} of 3` : 'No weekly data',
    nextReassessment: queryValue('reassessment', todayPlus(14)),
    safety,
    chairSummary: chairDelta === null
      ? 'No valid comparison is available yet.'
      : chairDelta > 0
        ? `Your Chair Stand result increased by ${Math.round(chairDelta)} repetitions.`
        : chairDelta < 0
          ? `Your Chair Stand result decreased by ${Math.abs(Math.round(chairDelta))} repetitions.`
          : 'Your Chair Stand result is similar to your earlier result.',
    tandemSummary: tandemDelta === null
      ? 'No valid comparison is available yet.'
      : tandemDelta < 0
        ? 'Your Tandem Stand time has decreased across the last 3 assessments.'
        : tandemDelta > 0
          ? `Your Tandem Stand time increased by ${Math.abs(tandemDelta).toFixed(1)} seconds.`
          : 'Your Tandem Stand time is similar to your earlier result.',
  };
}

function MetricCard({ label, value, detail, tone = 'info' }) {
  return (
    <article className={`step-eight-metric-card step-eight-metric-card--${tone}`}>
      <StepIcon tone={tone} />
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </article>
  );
}

function PeriodFilters() {
  const current = queryValue('period', '4w');
  const options = [
    { value: '4w', label: 'Last 4 Weeks' },
    { value: '3m', label: 'Last 3 Months' },
    { value: 'all', label: 'All Time' },
  ];
  return (
    <div className="step-eight-period-filter" role="group" aria-label="Progress period">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={current === option.value ? 'is-active' : ''}
          onClick={() => goTo(`/display/progress?period=${option.value}`)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function LineChart({ title, summary, points, valueKey, reference, referenceLabel, emptyText, unitLabel }) {
  const values = points.map((point) => finite(point[valueKey])).filter((value) => value !== null);
  const max = Math.max(reference || 1, ...values, 1);
  return (
    <section className="step-eight-chart-card">
      <div className="step-eight-card-header">
        <div>
          <p className="step-eight-kicker">{unitLabel}</p>
          <h2>{title}</h2>
        </div>
        <span>{referenceLabel}</span>
      </div>
      {points.length ? (
        <div className="step-eight-line-chart" aria-label={`${title} chart`}>
          {points.map((point) => {
            const value = finite(point[valueKey]) ?? 0;
            const height = Math.max(8, Math.round((value / max) * 100));
            return (
              <div key={point.id} className="step-eight-line-point">
                <strong>{valueKey === 'holdSeconds' ? value.toFixed(1) : Math.round(value)}</strong>
                <span style={{ height: `${height}%` }} aria-hidden="true" />
                <small>{point.timestamp ? shortDate(point.timestamp) : point.sessionLabel}</small>
              </div>
            );
          })}
          <div className="step-eight-reference-line" style={{ bottom: `${Math.min(100, (reference / max) * 100)}%` }}>
            <span>{referenceLabel}</span>
          </div>
        </div>
      ) : (
        <div className="step-eight-empty-state">{emptyText}</div>
      )}
      <p className="step-eight-chart-summary">{summary}</p>
    </section>
  );
}

function BalanceProgressChart({ context }) {
  return (
    <section className="step-eight-chart-card">
      <div className="step-eight-card-header">
        <div>
          <p className="step-eight-kicker">Hold time by position</p>
          <h2>Balance Progress</h2>
        </div>
        <span>10-second reference line</span>
      </div>
      <div className="step-eight-balance-bars" aria-label="Balance hold times by position">
        {context.balanceStages.map((stage) => {
          const width = Math.min(100, Math.max(0, (stage.seconds / 10) * 100));
          return (
            <div key={stage.id} className={stage.emphasized ? 'step-eight-balance-row step-eight-balance-row--emphasized' : 'step-eight-balance-row'}>
              <span>{stage.label}</span>
              <div>
                <i style={{ width: `${width}%` }} />
                <b aria-hidden="true" />
              </div>
              <strong>{stage.seconds.toFixed(stage.seconds % 1 === 0 ? 0 : 1)} seconds</strong>
            </div>
          );
        })}
      </div>
      <p className="step-eight-chart-summary">{context.tandemSummary}</p>
    </section>
  );
}

function WeeklyCompletionChart({ weekly }) {
  return (
    <section className="step-eight-chart-card">
      <div className="step-eight-card-header">
        <div>
          <p className="step-eight-kicker">Completed sessions</p>
          <h2>Weekly Exercise Completion</h2>
        </div>
        <span>Three-session weekly target</span>
      </div>
      {weekly.length ? (
        <div className="step-eight-week-chart" aria-label="Weekly exercise completion chart">
          {weekly.map((week) => (
            <div key={week.label}>
              <strong>{week.completed} of 3</strong>
              <span aria-hidden="true"><i style={{ width: `${Math.min(100, (week.completed / 3) * 100)}%` }} /></span>
              <small>{week.label}</small>
            </div>
          ))}
        </div>
      ) : (
        <div className="step-eight-empty-state">No weekly exercise data is available yet.</div>
      )}
    </section>
  );
}

function HistoryList({ invalidHistory }) {
  if (!invalidHistory.length) return null;
  return (
    <section className="step-eight-history-list">
      <h2>Assessment History</h2>
      {invalidHistory.map((item) => (
        <article key={item.id || historyTimestamp(item)}>
          <StepIcon tone="warning" />
          <div>
            <strong>{shortDate(historyTimestamp(item))}</strong>
            <p>Measurement excluded because camera quality was too low.</p>
          </div>
        </article>
      ))}
    </section>
  );
}

export function DisplayProgressScreen({ dashboard }) {
  const context = useMemo(() => progressContext(dashboard), [dashboard]);

  return (
    <Shell
      eyebrow="Progress"
      title="Progress"
      description="Review assessment and exercise changes over time."
      connection={<ConnectionIndicator status="connected" label="Progress ready" detail={queryValue('period', '4w') === '4w' ? 'Last 4 Weeks' : 'Trend view'} />}
      className="step-eight-progress-shell"
    >
      <main className="step-eight-progress">
        <PeriodFilters />
        <section className="step-eight-metric-grid" aria-label="Progress summary">
          <MetricCard label="Current Support Level" value={context.support.label} detail={context.support.detail} tone={context.support.tone} />
          <MetricCard label="Exercise Completion This Week" value={context.exerciseCompletion} detail="Weekly target: 3 sessions" tone="info" />
          <MetricCard label="Next Reassessment" value={context.nextReassessment} detail="Based on the current care plan" tone="info" />
          <MetricCard label="Recent Safety Events" value={String(context.safety.length)} detail={context.safety.length ? context.safety[0].label : 'No recent safety events recorded'} tone={context.safety.length ? 'warning' : 'success'} />
        </section>

        <div className="step-eight-chart-grid">
          <LineChart
            title="Chair Stand Progress"
            summary={context.chairSummary}
            points={context.chairSeries}
            valueKey="repetitions"
            reference={context.chairReference}
            referenceLabel={`CDC reference: ${Math.round(context.chairReference)} stands`}
            emptyText="No valid chair stand comparison is available yet."
            unitLabel="Valid repetitions"
          />
          <BalanceProgressChart context={context} />
          <WeeklyCompletionChart weekly={context.weekly} />
        </div>

        <HistoryList invalidHistory={context.invalidHistory} />
      </main>
    </Shell>
  );
}

function latestChairResult(history = []) {
  const item = history
    .filter((entry) => normalizeHistoryTestType(entry) === HistoryChallengeTypes.ChairStand && !isInvalidAssessment(entry))
    .sort((a, b) => historyTimestamp(b) - historyTimestamp(a))[0];
  return extractChairStandMetrics(item).repetitions;
}

function reportContext(dashboard) {
  const result = resultFromDashboard(dashboard);
  const history = historyFromDashboard(dashboard);
  const validHistory = history.filter((item) => !isInvalidAssessment(item));
  const progress = progressContext(dashboard);
  const profile = profileFromDashboard(dashboard);
  const plan = recommendationPlanFrom(result);
  const sharing = queryValue('sharing', 'disabled');
  return {
    result,
    history,
    validHistory,
    progress,
    profile,
    plan,
    support: progress.support,
    functionalAreas: functionalAreas(result),
    exercises: selectedExercisesFrom(result),
    safety: safetyEvents(),
    falls: queryValue('falls', profile.steadiStep1?.fallenPastYear ? '1' : '0'),
    chairReps: latestChairResult(validHistory),
    agentActions: agentActions(result),
    sharingEnabled: sharing === 'enabled',
  };
}

function ReportSection({ title, children }) {
  return (
    <section className="step-eight-report-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function handleDialogKeyDown(event, onCancel) {
  if (event.key === 'Escape') {
    event.preventDefault();
    onCancel();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(event.currentTarget.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ConsentDialog({ onConfirm, onCancel }) {
  return (
    <div className="step-eight-dialog-backdrop" role="presentation">
      <section className="step-eight-dialog" role="dialog" aria-modal="true" aria-labelledby="share-consent-title" onKeyDown={(event) => handleDialogKeyDown(event, onCancel)}>
        <h2 id="share-consent-title">Share this report with your caregiver?</h2>
        <p>Only the weekly report summary and recommended next step will be shared after you confirm.</p>
        <div>
          <button type="button" className="ds-button ds-button--secondary" onClick={onCancel} autoFocus>Cancel</button>
          <button type="button" className="ds-button ds-button--primary" onClick={onConfirm}>Allow Sharing</button>
        </div>
      </section>
    </div>
  );
}

function reportText(context) {
  const exerciseLines = context.exercises.map((exercise) => `- ${safeExerciseName(exercise)}`).join('\n');
  return [
    'Steply Weekly Report',
    '',
    `Support Level: ${context.support.label}`,
    `Chair Stand Result: ${context.chairReps === null ? 'No valid result available' : `${Math.round(context.chairReps)} valid stands`}`,
    `Exercise Completion: ${context.progress.exerciseCompletion}`,
    `Safety Events: ${context.safety.length}`,
    `Reported Falls: ${context.falls === '0' ? 'None reported' : context.falls}`,
    '',
    'Recommended Exercises:',
    exerciseLines,
    '',
    'This is not a medical diagnosis. Movement observations are not diagnoses.',
  ].join('\n');
}

function ProfessionalReport({ context }) {
  return (
    <main className="step-eight-professional-report">
      <div className="step-eight-card-header">
        <div>
          <p className="step-eight-kicker">Professional report</p>
          <h2>Professional Report</h2>
        </div>
        <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/reports')}>Back to Weekly Report</button>
      </div>
      <div className="step-eight-professional-grid">
        <ReportSection title="CDC Screening Responses">
          <dl>
            <div><dt>Fallen in the past year</dt><dd>{context.profile.steadiStep1?.fallenPastYear ? 'Yes' : 'No'}</dd></div>
            <div><dt>Feels unsteady</dt><dd>{context.profile.steadiStep1?.feelsUnsteady ? 'Yes' : 'No'}</dd></div>
            <div><dt>Worried about falling</dt><dd>{context.profile.steadiStep1?.worriesAboutFalling ? 'Yes' : 'No'}</dd></div>
          </dl>
        </ReportSection>
        <ReportSection title="Valid Assessment Results">
          <p>Chair Stand result: {context.chairReps === null ? 'No valid result available' : `${Math.round(context.chairReps)} valid stands`}.</p>
          <p>Tandem Stand: {context.progress.balanceStages.find((stage) => stage.id === 'tandem')?.seconds.toFixed(1)} seconds.</p>
        </ReportSection>
        <ReportSection title="Reference Values">
          <p>Chair Stand CDC reference: {Math.round(context.progress.chairReference)} or more valid stands.</p>
          <p>Balance reference: 10 seconds for each completed position.</p>
        </ReportSection>
        <ReportSection title="Functional Observations">
          {context.functionalAreas.map((area) => <p key={area.key}>{area.label}: {area.text}</p>)}
        </ReportSection>
        <ReportSection title="Exercise Prescription">
          {context.exercises.map((exercise, index) => <p key={`${safeExerciseName(exercise)}-${index}`}>{safeExerciseName(exercise)}</p>)}
        </ReportSection>
        <ReportSection title="Adherence">
          <p>{context.progress.exerciseCompletion} completed this week.</p>
        </ReportSection>
        <ReportSection title="Safety Events">
          <p>{context.safety.length ? context.safety.map((event) => event.label).join(', ') : 'No recent safety events recorded.'}</p>
        </ReportSection>
        <ReportSection title="Fall Reports">
          <p>{context.falls === '0' ? 'No falls reported this week.' : `${context.falls} fall report recorded.`}</p>
        </ReportSection>
        <ReportSection title="Agent Decision Log Summary">
          {context.agentActions.map((action) => <p key={action.key}>{action.detail}</p>)}
        </ReportSection>
      </div>
    </main>
  );
}

export function DisplayReportsScreen({ dashboard }) {
  const context = useMemo(() => reportContext(dashboard), [dashboard]);
  const [sharePrompt, setSharePrompt] = useState(false);
  const [shareStatus, setShareStatus] = useState(queryValue('sharing', '') === 'enabled' ? '' : 'Sharing is off until you allow it in settings.');
  const [exportStatus, setExportStatus] = useState('');

  function exportReport() {
    const text = reportText(context);
    if (typeof window !== 'undefined' && typeof Blob !== 'undefined') {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'steply-weekly-report.txt';
      link.click();
      window.URL.revokeObjectURL(url);
    }
    setExportStatus('Report export prepared.');
  }

  if (queryValue('view', '') === 'professional') {
    return (
      <Shell
        eyebrow="Reports"
        title="Professional Report"
        description="A denser summary for review by a healthcare professional."
        connection={<ConnectionIndicator status="connected" label="Report ready" detail="Professional view" />}
        className="step-eight-reports-shell"
      >
        <ProfessionalReport context={context} />
      </Shell>
    );
  }

  return (
    <Shell
      eyebrow="Reports"
      title="Weekly Report"
      description="Review weekly progress before sharing or exporting."
      connection={<ConnectionIndicator status="connected" label="Report ready" detail={context.support.label} />}
      className="step-eight-reports-shell"
    >
      <main className="step-eight-report">
        <div className="step-eight-report-grid">
          <ReportSection title="Support Level">
            <strong>{context.support.label}</strong>
            <p>{context.support.detail}</p>
          </ReportSection>
          <ReportSection title="Functional Areas">
            {context.functionalAreas.map((area) => <p key={area.key}>{area.label}: {area.text}</p>)}
          </ReportSection>
          <ReportSection title="Recent Assessment Results">
            <p>{context.chairReps === null ? 'No valid chair stand result is available.' : `${Math.round(context.chairReps)} valid chair stands recorded.`}</p>
            <p>{context.progress.tandemSummary}</p>
          </ReportSection>
          <ReportSection title="Exercise Completion">
            <p>{context.progress.exerciseCompletion} completed this week.</p>
          </ReportSection>
          <ReportSection title="Safety Events">
            <p>{context.safety.length ? context.safety.map((event) => event.label).join(', ') : 'No recent safety events recorded.'}</p>
          </ReportSection>
          <ReportSection title="Reported Falls">
            <p>{context.falls === '0' ? 'No falls reported this week.' : `${context.falls} fall report recorded.`}</p>
          </ReportSection>
          <ReportSection title="Recommended Next Step">
            <p>{context.support.label === supportCopy.high.label ? 'Review professional guidance before starting harder exercise.' : 'Continue the current Otago Exercise Programme plan.'}</p>
          </ReportSection>
          <ReportSection title="Steply Actions This Week">
            {context.agentActions.map((action) => (
              <article key={action.key} className="step-eight-agent-action">
                <strong>{action.label}</strong>
                <p>{action.detail}</p>
              </article>
            ))}
          </ReportSection>
        </div>

        {shareStatus ? <p className="step-eight-status-message" role="status">{shareStatus}</p> : null}
        {exportStatus ? <p className="step-eight-status-message" role="status">{exportStatus}</p> : null}

        <div className="step-eight-report-actions">
          <button type="button" className="ds-button ds-button--primary" onClick={() => setSharePrompt(true)}>Share With Caregiver</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={exportReport}>Export Report</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/reports?view=professional')}>View Professional Report</button>
          <button type="button" className="ds-button ds-button--ghost" onClick={() => goTo('/display/settings?section=privacy')}>Sharing Settings</button>
        </div>
      </main>
      {sharePrompt ? (
        <ConsentDialog
          onCancel={() => setSharePrompt(false)}
          onConfirm={() => {
            setSharePrompt(false);
            setShareStatus(context.sharingEnabled ? 'Caregiver sharing was confirmed for this report.' : 'Sharing permission is required in settings before sending this report.');
          }}
        />
      ) : null}
    </Shell>
  );
}

function SettingSection({ title, children }) {
  return (
    <section className="step-eight-settings-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="step-eight-field">
      <span>{label}</span>
      <input value={value} readOnly aria-label={label} />
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="step-eight-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
    </label>
  );
}

function DeleteDialog({ onCancel, onDelete }) {
  return (
    <div className="step-eight-dialog-backdrop" role="presentation">
      <section className="step-eight-dialog step-eight-dialog--danger" role="dialog" aria-modal="true" aria-labelledby="delete-records-title" onKeyDown={(event) => handleDialogKeyDown(event, onCancel)}>
        <h2 id="delete-records-title">Delete all Steply records from this device?</h2>
        <p>This action cannot be undone.</p>
        <div>
          <button type="button" className="ds-button ds-button--secondary" onClick={onCancel} autoFocus>Cancel</button>
          <button type="button" className="ds-button ds-button--primary" onClick={onDelete}>Delete Records</button>
        </div>
      </section>
    </div>
  );
}

export function DisplaySettingsScreen({ dashboard }) {
  const profile = profileFromDashboard(dashboard);
  const [textSize, setTextSize] = useState(queryValue('text', 'Large'));
  const [voiceSpeed, setVoiceSpeed] = useState(queryValue('voiceSpeed', 'Normal'));
  const [voiceVolume, setVoiceVolume] = useState(whole(queryValue('volume', ''), 70));
  const [highContrast, setHighContrast] = useState(queryValue('contrast', '') === '1');
  const [reduceMotion, setReduceMotion] = useState(queryValue('motion', '') === 'reduced');
  const [captions, setCaptions] = useState(queryValue('captions', '1') !== '0');
  const [deleteOpen, setDeleteOpen] = useState(queryValue('confirm', '') === 'delete');
  const [status, setStatus] = useState('');

  const accessibilityClass = [
    textSize === 'Extra Large' ? 'step-eight-settings--large-text' : '',
    highContrast ? 'step-eight-settings--high-contrast' : '',
    reduceMotion ? 'step-eight-settings--reduced-motion' : '',
  ].filter(Boolean).join(' ');

  return (
    <Shell
      eyebrow="Settings"
      title="Settings"
      description="Adjust Steply for comfort, connection, privacy, and reminders."
      connection={<ConnectionIndicator status="connected" label="Settings ready" detail="Changes stay on this device" />}
      className={`step-eight-settings-shell ${accessibilityClass}`}
    >
      <main className="step-eight-settings">
        <SettingSection title="Profile">
          <ReadOnlyField label="Preferred name" value={profile.displayName || profile.name || 'Steply Guest'} />
          <ReadOnlyField label="Age" value={String(profile.age || ageYearsFromProfile(profile) || 'Not set')} />
          <ReadOnlyField label="Sex used for reference values" value={profile.sex || profile.gender || 'Not specified'} />
          <ReadOnlyField label="Caregiver information" value={profile.caregiverName || 'Not connected'} />
        </SettingSection>

        <SettingSection title="Accessibility">
          <label className="step-eight-field">
            <span>Text Size</span>
            <select value={textSize} onChange={(event) => setTextSize(event.target.value)} aria-label="Text Size">
              <option>Large</option>
              <option>Extra Large</option>
            </select>
          </label>
          <label className="step-eight-field">
            <span>Voice Speed</span>
            <select value={voiceSpeed} onChange={(event) => setVoiceSpeed(event.target.value)} aria-label="Voice Speed">
              <option>Slow</option>
              <option>Normal</option>
            </select>
          </label>
          <label className="step-eight-field">
            <span>Voice Volume</span>
            <input type="range" min="0" max="100" value={voiceVolume} onChange={(event) => setVoiceVolume(Number(event.target.value))} aria-label="Voice Volume" />
          </label>
          <ToggleField label="High Contrast" checked={highContrast} onChange={setHighContrast} />
          <ToggleField label="Reduce Motion" checked={reduceMotion} onChange={setReduceMotion} />
          <ToggleField label="Captions" checked={captions} onChange={setCaptions} />
        </SettingSection>

        <SettingSection title="Camera and Connection">
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/connect')}>Reconnect Phone</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/session/camera-setup')}>Test Camera</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => setStatus('Network check requested.')}>Check Network</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/session/camera-setup?guide=1')}>Camera Instructions</button>
        </SettingSection>

        <SettingSection title="Notifications">
          <ToggleField label="Exercise Reminders" checked onChange={() => {}} />
          <ToggleField label="Reassessment Reminders" checked onChange={() => {}} />
          <ToggleField label="Caregiver Notifications" checked={queryValue('sharing', '') === 'enabled'} onChange={() => {}} />
          <ToggleField label="Weekly Report Notifications" checked onChange={() => {}} />
        </SettingSection>

        <SettingSection title="Privacy">
          <button type="button" className="ds-button ds-button--secondary" onClick={() => setStatus('Stored data summary opened.')}>View Stored Data</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => setStatus('Data export prepared.')}>Export My Data</button>
          <button type="button" className="ds-button ds-button--primary" onClick={() => setDeleteOpen(true)}>Delete My Data</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => setStatus('Sharing permissions opened.')}>Sharing Permissions</button>
          <p className="step-eight-privacy-note">Video Storage Explanation: Steply does not save raw camera video. Movement measurements and assessment results may be stored on this device.</p>
        </SettingSection>

        {status ? <p className="step-eight-status-message" role="status">{status}</p> : null}
      </main>
      {deleteOpen ? (
        <DeleteDialog
          onCancel={() => setDeleteOpen(false)}
          onDelete={() => {
            setDeleteOpen(false);
            setStatus('Delete request confirmed for this device.');
          }}
        />
      ) : null}
    </Shell>
  );
}
