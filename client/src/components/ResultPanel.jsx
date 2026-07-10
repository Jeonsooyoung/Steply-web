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

const screeningSafetyNote = 'This result is not a medical diagnosis. It combines CDC STEADI functional screening with MediaPipe movement observations for exercise recommendations; joint angles or posture patterns alone are not used to decide muscle weakness, disease, or fall risk. Seek professional support for recent falls, dizziness, chest pain, shortness of breath, severe pain, walking-aid use, or major balance difficulty.';

const weakAreaChipById = {
  [WeakAreaIds.AnkleStrategyProprioception]: 'Ankle balance control',
  [WeakAreaIds.HipAbductorMediolateralControl]: 'Side hip stability',
  [WeakAreaIds.LowerLimbMuscularEndurance]: 'Lower-body endurance',
};

const assessmentLabelByType = {
  FOUR_STAGE_BALANCE: 'Four-Stage Balance',
  CHAIR_STAND_30_SEC: '30-Second Chair Stand',
  TIMED_UP_AND_GO: 'Timed Up and Go',
  four_stage_balance: 'Four-Stage Balance',
  chair_stand: '30-Second Chair Stand',
  timed_up_and_go: 'Timed Up and Go',
};

const failedCriterionCopy = {
  sideBySideHoldUnder10Seconds: 'Side-by-side balance was under the 10-second CDC screen.',
  semiTandemHoldUnder10Seconds: 'Semi-tandem balance was under the 10-second CDC screen.',
  tandemHoldUnder10Seconds: 'Tandem balance was under the 10-second CDC screen.',
  belowAgeSexThreshold: 'Chair Stand count was below the CDC age and sex comparison.',
  armUseDisqualified: 'Arm support was used during the Chair Stand screen.',
  tugAtOrAbove12Seconds: 'Timed Up and Go was at or above the 12-second CDC screen.',
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

function weakAreaObjectsFromResult(result = {}) {
  const rawWeakAreas = result.weakAreas
    || result.weakAreaResult?.weakAreas
    || [];
  const areas = Array.isArray(rawWeakAreas) ? rawWeakAreas : [rawWeakAreas];
  return areas.filter(Boolean);
}

function primaryWeakAreaSummary(result = {}) {
  const weakArea = weakAreaObjectsFromResult(result)[0] || null;
  const weakAreaId = weakArea?.id || weakArea?.weakAreaId || weakAreaIdsFromResult(result)[0] || result.primaryWeakness || null;
  const weakAreaLabel = weakArea?.label
    || result.primaryWeaknessLabel
    || weakAreaChipById[weakAreaId]
    || WeaknessLabels[weakAreaId]
    || displayWeakAreaLabel(weakAreaId);
  const score = Number.isFinite(Number(weakArea?.score))
    ? Number(weakArea.score)
    : Number.isFinite(Number(result.weaknessScores?.[weakAreaId]))
      ? Number(result.weaknessScores[weakAreaId])
      : null;

  if (!weakAreaId || weakAreaId === 'generalMaintenance' || weakAreaId === 'cameraSetup') {
    return {
      label: 'General movement maintenance',
      score,
      detail: 'No single weak area was selected from today’s screen, so the plan stays gentle and supported.',
    };
  }

  return {
    label: weakAreaLabel || 'Movement control',
    score,
    detail: weakAreaSupportMessages[weakAreaId]
      || 'Today’s test result and MediaPipe movement observations point to this as the main practice focus.',
  };
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
    .replace(/dynamic balance games/gi, 'harder balance practice')
    .replace(/exercise game/gi, 'exercise plan')
    .replace(/game/gi, 'practice')
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

function formatReportNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return digits > 0 ? number.toFixed(digits) : String(Math.round(number));
}

function observedVsThresholdText(criterion = {}) {
  const key = String(criterion.criterion || '').toLowerCase();
  const isSeconds = key.includes('seconds') || key.includes('tug');
  const isReps = key.includes('chair') || key.includes('rep') || key.includes('threshold');
  const digits = isSeconds ? 1 : 0;
  const observed = formatReportNumber(criterion.observed, digits);
  const threshold = formatReportNumber(criterion.threshold, digits);
  if (observed === null || threshold === null) return null;
  const unit = isSeconds ? ' sec' : isReps ? ' reps' : '';
  return `Measured ${observed}${unit}; screening point ${threshold}${unit}.`;
}

function addUniqueReportItem(items, item) {
  if (!item?.title || items.some((existing) => existing.title === item.title)) return;
  items.push(item);
}

function buildProblemReportItems(result = {}, { cameraSetupNeeded = false, status = 'steady' } = {}) {
  const flags = result.testFlags || {};
  const items = [];

  if (cameraSetupNeeded) {
    return [{
      label: 'Camera',
      title: 'Camera setup needs a repeat check',
      detail: 'Pose tracking quality was not high enough to read a screening result. Repeat with the full body visible and even lighting.',
    }];
  }

  for (const criterion of result.failedCriteria || []) {
    const assessmentLabel = assessmentLabelByType[criterion.assessment] || testLabel(criterion.assessment) || 'Screening';
    addUniqueReportItem(items, {
      label: criterion.clinicalCutoff === false ? 'Observation' : 'CDC screen',
      title: failedCriterionCopy[criterion.criterion] || `${assessmentLabel} needs practice review.`,
      detail: observedVsThresholdText(criterion) || `${assessmentLabel} result was outside today’s screening point.`,
    });
  }

  if (flags.incompleteStandAttemptDetected) {
    addUniqueReportItem(items, {
      label: 'Function',
      title: 'A full stand was not completed every time',
      detail: 'This points the next session toward a higher chair, smaller range, and supported sit-to-stand practice.',
    });
  }
  if (flags.armAssistDetected) {
    addUniqueReportItem(items, {
      label: 'Support',
      title: 'Hands or arms helped during standing',
      detail: 'Today’s chair practice should stay supported and use an easier sit-to-stand progression.',
    });
  }
  if (flags.kneeValgusOrInwardCollapse) {
    addUniqueReportItem(items, {
      label: 'Observation',
      title: 'Knees drifted inward during sit-to-stand',
      detail: 'This is a movement observation only, so the recommendation focuses on knee-over-toe control rather than diagnosis.',
    });
  }
  if (flags.weightShiftAsymmetryDetected) {
    addUniqueReportItem(items, {
      label: 'Observation',
      title: 'Weight shifted more to one side',
      detail: 'The exercise plan adds even-pressure and side-to-side control practice.',
    });
  }
  if (flags.earlyStageUnder10Sec || flags.needsSupervisedBalanceProgram) {
    addUniqueReportItem(items, {
      label: 'Balance',
      title: 'Early balance stage was difficult today',
      detail: 'Practice should stay chair-supported and conservative before progressing to narrower stances.',
    });
  }
  if (flags.oneLegOnlyFailure) {
    addUniqueReportItem(items, {
      label: 'Balance',
      title: 'Single-leg balance was shorter than the practice target',
      detail: 'This does not change the CDC cutoff by itself; it helps choose side-hip and supported balance exercises.',
    });
  }
  if (flags.handSupportDetected) {
    addUniqueReportItem(items, {
      label: 'Support',
      title: 'Hand support was used during balance',
      detail: 'The next exercise should keep a chair, rail, or counter within reach.',
    });
  }
  if (flags.stepOutDetected) {
    addUniqueReportItem(items, {
      label: 'Balance',
      title: 'A foot step-out or reposition was observed',
      detail: 'Supported balance drills are recommended before harder balance practice.',
    });
  }
  if (flags.lossOfBalanceDetected) {
    addUniqueReportItem(items, {
      label: 'Safety',
      title: 'Loss of balance was observed',
      detail: 'Use supported practice only today and seek professional review if this repeats.',
    });
  }
  if (flags.wallOrFurnitureSupportDetected) {
    addUniqueReportItem(items, {
      label: 'Safety',
      title: 'Wall or furniture support was used',
      detail: 'The recommendation stays in supervised or supported mode for today.',
    });
  }

  if (!items.length && result.primaryWeakness && result.primaryWeakness !== 'generalMaintenance') {
    addUniqueReportItem(items, {
      label: 'Practice focus',
      title: `${WeaknessLabels[result.primaryWeakness] || result.primaryWeakness} needs attention`,
      detail: 'No single diagnostic label is applied; the movement pattern simply guides today’s exercise choice.',
    });
  }

  if (!items.length) {
    items.push({
      label: status === 'steady' ? 'Baseline' : 'Screening',
      title: 'No major cutoff issue was found today',
      detail: 'Use today’s result as a baseline and continue gentle maintenance practice.',
    });
  }

  return items.slice(0, 5);
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
  const problemReportItems = buildProblemReportItems(source, { cameraSetupNeeded, status });
  const weakAreaSummary = primaryWeakAreaSummary(source);
  const weakAreaScoreLabel = Number.isFinite(weakAreaSummary.score)
    ? `${Math.round(weakAreaSummary.score * 100)}% signal`
    : 'Practice focus';
  const recommendationTitle = primaryRecommendation?.title || primaryRecommendation?.name || 'Gentle supported practice';

  return (
    <div className="panel-grid panel-grid--result distance-mode distance-mode--result">
      <SteplyCard className="result-hero-card">
        <div className="eyebrow">Movement Analysis</div>
        <h2>Today’s movement summary</h2>
        <p>{friendlyMessage}</p>
        <StatusPill status={status}>{adultLabel}</StatusPill>
      </SteplyCard>

      <div className="metric-row metric-row--result">
        <MetricCard value={primaryValue} label={primaryLabel} detail={source.testLabel || testLabel(testType)} accent />
        <MetricCard value={`${stability}%`} label="Stability" detail="Body-center control" />
        <MetricCard value={score} label="Camera Confidence" detail="Pose-analysis quality" status={status} />
      </div>

      <SteplyCard className="feedback-result-card result-report-card">
        <div>
          <div className="eyebrow">Test Report</div>
          <h3>What needs attention</h3>
        </div>
        <div className="result-report-list">
          {problemReportItems.map((item) => (
            <div className="result-report-item" key={`${item.label}-${item.title}`}>
              <span className="result-report-item__label">{item.label}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </SteplyCard>

      <SteplyCard className="result-next-exercise-card">
        <div className="result-next-exercise-card__section">
          <div className="eyebrow">Weak Area</div>
          <div className="result-next-exercise-card__headline">
            <h3>{weakAreaSummary.label}</h3>
            <span>{weakAreaScoreLabel}</span>
          </div>
          <p>{weakAreaSummary.detail}</p>
        </div>

        <div className="result-next-exercise-card__section result-next-exercise-card__recommendation">
          <div className="eyebrow">Recommended Exercise</div>
          <h3>{recommendationTitle}</h3>
          <p>So Steply recommends this exercise first: {sanitizeObservationText(recommendationReason)}</p>
          <SteplyButton onClick={onGoExercises} disabled={!onGoExercises || !primaryRecommendation}>
            View Recommended Exercises
          </SteplyButton>
        </div>
      </SteplyCard>

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
          <h3>{recommendationTitle}</h3>
        </div>
        <div className="feedback-list">
          <span>{sanitizeObservationText(recommendationReason)}</span>
          <span>{sanitizeObservationText(safetyNote)}</span>
          <span>{source.trendWarnings?.[0]?.message || 'Progress trend will build over repeated sessions.'}</span>
        </div>
      </SteplyCard>

      <SteplyCard className="feedback-result-card">
        <div>
          <div className="eyebrow">Safety Note</div>
          <h3>Screening guidance only</h3>
        </div>
        <p>{screeningSafetyNote}</p>
      </SteplyCard>

      <SteplyCard className="safety-step-badge">
        <div className="safety-step-badge__icon">✓</div>
        <div>
          <div className="eyebrow">Completion Badge</div>
          <h3>Safe Steps Badge</h3>
          <p>Mission complete. The next exercise recommendation helps practice the area that changed today.</p>
        </div>
      </SteplyCard>

      <div className="result-actions">
        <SteplyButton variant="secondary" onClick={onDemoFinal}>Save Today’s Result</SteplyButton>
      </div>
    </div>
  );
}
