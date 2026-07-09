import { useEffect, useState } from 'react';
import { MetricCard, SteplyButton, SteplyCard, StatusPill } from './SteplyPrimitives';
import { testLabel } from '../pose/recommendationRules';
import { WeakAreaIds } from '../pose/weakAreaRules';
import { FallRiskLevels, WeaknessLabels } from '../pose/assessmentRules';
import { roundMetric, statusFromScore } from '../utils/format';
import { displayWeakAreaLabel, weakAreaSupportMessages } from '../data/serviceModels';

const feedbackByStatus = {
  measurement_only: 'Today’s movement was recorded clearly. We will use it as a baseline.',
  steady: 'Your movement looked steady today. Keep practicing at a comfortable pace.',
  practice_needed: 'Nice work. Today’s movement suggests one simple exercise to practice next.',
  recheck: 'Let’s adjust the camera view and repeat this gently with support nearby.',
};

const weakAreaChipById = {
  [WeakAreaIds.AnkleStrategyProprioception]: 'Ankle balance control',
  [WeakAreaIds.HipAbductorMediolateralControl]: 'Side hip stability',
  [WeakAreaIds.LowerLimbMuscularEndurance]: 'Lower-body endurance',
};

function riskStatusClass(level, fallback) {
  if (level === FallRiskLevels.Low) return 'steady';
  if (level === FallRiskLevels.Moderate) return 'practice_needed';
  if (level === FallRiskLevels.NeedsReview || level === null) return 'recheck';
  return fallback;
}

function weakAreaIdsFromResult(result = {}) {
  const rawWeakAreas = result.weakAreas
    || result.weakAreaIds
    || result.weakAreaResult?.weakAreas
    || result.weakAreaResult
    || result.weakArea
    || [];
  const items = Array.isArray(rawWeakAreas) ? rawWeakAreas : [rawWeakAreas];
  return items.map((item) => {
    if (!item) return null;
    if (typeof item === 'string') return item;
    return item.id || item.weakAreaId || null;
  }).filter(Boolean);
}

function recommendedExerciseNames(result = {}) {
  const recommendations = result.recommendationPlan?.recommendedExercises
    || result.recommendedExercises
    || result.recommendations
    || [];
  return recommendations
    .map((recommendation) => recommendation.title || recommendation.name)
    .filter(Boolean)
    .slice(0, 2);
}

function buildFriendlyResultMessage(result, status) {
  if (result.seniorMessage) return result.seniorMessage;
  const weakAreaIds = weakAreaIdsFromResult(result);
  const weakAreaMessage = weakAreaIds.map((id) => weakAreaSupportMessages[id]).find(Boolean);
  if (weakAreaMessage) return weakAreaMessage;
  const exerciseNames = recommendedExerciseNames(result);
  if (exerciseNames.length) {
    return `Today’s movement points to ${exerciseNames.join(', ')} as a useful next exercise.`;
  }
  return feedbackByStatus[status] || feedbackByStatus.recheck;
}

function sanitizeObservationText(text) {
  return String(text || '')
    .replace(/fall-risk signal/gi, 'screening signal')
    .replace(/risk interpretation/gi, 'screening interpretation')
    .replace(new RegExp('high\\s+risk', 'gi'), 'needs review')
    .replace(/failed/gi, 'needs practice')
    .replace(/disqualified/gi, 'used support')
    .replace(/diagnosis/gi, 'exercise-planning note');
}

function friendlyPrimaryLabel(label, testType) {
  if (label === 'Chair Stands') return 'Chair Stands';
  if (label === 'Posture Score') return 'Posture Record';
  if (label === 'Hold Time') return 'Hold Time';
  if (!label && testType === 'chair_stand') return 'Chair Stands';
  return label || 'Record';
}

function buildFriendlyObservationChips(result, fallbackFlags) {
  const weakAreaChips = weakAreaIdsFromResult(result)
    .map((id) => weakAreaChipById[id] || WeaknessLabels[id] || displayWeakAreaLabel(id))
    .filter(Boolean);
  const exerciseNames = recommendedExerciseNames(result);
  const exerciseChip = exerciseNames.length ? `Recommended exercise: ${exerciseNames.join(', ')}` : null;
  const primaryWeaknessChip = result.primaryWeaknessLabel
    ? `Practice focus: ${result.primaryWeaknessLabel}`
    : result.primaryWeakness && WeaknessLabels[result.primaryWeakness]
      ? `Practice focus: ${WeaknessLabels[result.primaryWeakness]}`
      : null;
  const trendChip = result.trendWarnings?.[0]?.message || null;
  const metricLabel = friendlyPrimaryLabel(result.primaryLabel, result.testType);
  const metricDigits = result.testType === 'timed_up_and_go' ? 1 : 0;
  const metricChip = metricLabel || result.repetitionCount || result.primaryValue
    ? `${metricLabel || 'Record'} ${formatMetricValue(result.primaryValue ?? result.repetitionCount, { digits: metricDigits })}`
    : 'Today’s movement was recorded';
  const sanitizedFlags = (fallbackFlags || []).map(sanitizeObservationText);
  return [primaryWeaknessChip, ...weakAreaChips, exerciseChip, trendChip, metricChip, ...sanitizedFlags]
    .filter(Boolean)
    .slice(0, 4);
}

function normalizedPercent(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number <= 1 ? number * 100 : number);
}

function formatMetricValue(value, { digits = 0, fallback = 0 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return digits > 0 ? number.toFixed(digits) : Math.round(number);
}

export function ResultPanel({ finalResult, liveResult, onGoExercises, onDemoFinal }) {
  const [showNextAction, setShowNextAction] = useState(false);
  const source = finalResult || liveResult || {};
  const cameraSetupNeeded = Boolean(
    source.invalid
      || source.testFlags?.cameraSetupNeeded
      || source.recommendationPlan?.priority === 'camera_setup'
      || source.primaryWeakness === 'cameraSetup'
  );
  const score = roundMetric(source.score, normalizedPercent(source.trackingQualityScore ?? source.confidence, 85));
  const testType = source.testType || source.selectedTest || 'four_stage_balance';
  const primaryDigits = testType === 'timed_up_and_go' ? 1 : 0;
  const primaryLabel = friendlyPrimaryLabel(
    source.features?.primaryLabel || source.primaryLabel || 'Hold Time',
    testType,
  );
  const primaryValue = cameraSetupNeeded
    ? '-'
    : formatMetricValue(
      source.features?.primaryValue ?? source.primaryValue ?? source.count ?? source.repetitionCount,
      { digits: primaryDigits },
    );
  const stability = normalizedPercent(source.features?.stability ?? source.stabilityScore, 0);
  const status = riskStatusClass(source.fallRiskLevel, source.recommendationLevel || statusFromScore(score));
  const adultLabel = source.olderAdultLabel || 'Exercise recommendation ready';
  const flags = source.flags?.length ? source.flags : [
    'Full-body movement was captured from the phone camera.',
    'This is screening guidance for exercise planning.',
  ];
  const friendlyMessage = buildFriendlyResultMessage(source, status);
  const friendlyFlags = buildFriendlyObservationChips(source, flags);
  const primaryRecommendation = source.recommendationPlan?.recommendedExercises?.[0]
    || source.recommendedExercises?.[0]
    || source.recommendations?.[0]
    || null;
  const recommendationReason = primaryRecommendation?.reason
    || source.recommendationPlan?.reason
    || 'This exercise matches today’s movement pattern.';
  const safetyNote = source.recommendationPlan?.gameDisabledReason
    || primaryRecommendation?.safetyNote
    || 'Keep support nearby and move at a comfortable pace.';
  useEffect(() => {
    setShowNextAction(false);
    const timerId = window.setTimeout(() => setShowNextAction(true), 3000);
    return () => window.clearTimeout(timerId);
  }, [finalResult, liveResult]);

  return (
    <div className="panel-grid panel-grid--result distance-mode distance-mode--result">
      <SteplyCard className="result-hero-card">
        <div className="eyebrow">Weakness Analysis</div>
        <h2>Today’s movement summary</h2>
        <p>{friendlyMessage}</p>
        <StatusPill status={status}>{adultLabel}</StatusPill>
      </SteplyCard>

      <div className="metric-row metric-row--result">
        <MetricCard value={primaryValue} label={primaryLabel} detail={source.testLabel || testLabel(testType)} accent />
        <MetricCard value={`${stability}%`} label="Stability" detail="Body-center control" />
        <MetricCard value={score} label="Camera Confidence" detail="Pose-analysis quality" status={status} />
      </div>

      <SteplyCard className="feedback-result-card">
        <div>
          <div className="eyebrow">Observation Summary</div>
          <h3>What Steply noticed</h3>
        </div>
        <div className="feedback-list">
          {friendlyFlags.map((flag) => <span key={flag}>{flag}</span>)}
        </div>
      </SteplyCard>

      <SteplyCard className="feedback-result-card">
        <div>
          <div className="eyebrow">Recommended Practice</div>
          <h3>{primaryRecommendation?.title || primaryRecommendation?.name || 'Gentle supported practice'}</h3>
        </div>
        <div className="feedback-list">
          <span>{sanitizeObservationText(recommendationReason)}</span>
          <span>{sanitizeObservationText(safetyNote)}</span>
          <span>{source.trendWarnings?.[0]?.message || 'Progress trend will build over repeated sessions.'}</span>
        </div>
      </SteplyCard>

      <SteplyCard className="safety-step-badge">
        <div className="safety-step-badge__icon">✓</div>
        <div>
          <div className="eyebrow">Completion Badge</div>
          <h3>Safe Steps Badge</h3>
          <p>Mission complete. The next exercise game will help practice the area that changed today.</p>
        </div>
      </SteplyCard>

      <div className="result-actions">
        {showNextAction ? (
          <>
            <SteplyButton onClick={onGoExercises} disabled={!onGoExercises}>
              Next
            </SteplyButton>
        <SteplyButton variant="secondary" onClick={onDemoFinal}>Save Today’s Result</SteplyButton>
          </>
        ) : null}
      </div>
    </div>
  );
}
