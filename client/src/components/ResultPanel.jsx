import { MetricCard, SteplyButton, SteplyCard, StatusPill } from './SteplyPrimitives';
import { recommendationLabel, testLabel } from '../pose/recommendationRules';
import { roundMetric, statusFromScore } from '../utils/format';

const feedbackByStatus = {
  steady: "Today's movement looks relatively steady. Keep practicing gently within a safe range.",
  practice_needed: 'Good effort. A few supported exercises may help this movement pattern.',
  recheck: 'Recheck with the full body visible and support nearby. Stop if there is pain or dizziness.',
};

function normalizedPercent(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number <= 1 ? number * 100 : number);
}

export function ResultPanel({ finalResult, liveResult, onGoExercises, onDemoFinal }) {
  const source = finalResult || liveResult || {};
  const score = roundMetric(source.score, normalizedPercent(source.confidence, 85));
  const testType = source.testType || source.selectedTest || 'chair_stand';
  const primaryLabel = source.features?.primaryLabel || source.primaryLabel || (testType === 'tug' ? 'TUG Seconds' : 'Chair Stands');
  const primaryValue = roundMetric(source.features?.primaryValue ?? source.primaryValue ?? source.count ?? source.repetitionCount, 0);
  const stability = normalizedPercent(source.features?.stability ?? source.stabilityScore, 0);
  const status = source.recommendationLevel || statusFromScore(score);
  const statusText = recommendationLabel(status);
  const flags = source.flags?.length ? source.flags : [
    'Pose was checked using full-body keypoints.',
    'This result is practice support, not a medical diagnosis.',
  ];

  return (
    <div className="panel-grid panel-grid--result">
      <SteplyCard className="result-hero-card">
        <div className="celebration-orb" aria-hidden="true" />
        <div className="eyebrow">{source.testLabel || testLabel(testType)} Result</div>
        <h2>Movement check complete</h2>
        <p>{feedbackByStatus[status] || feedbackByStatus.recheck}</p>
        <StatusPill status={status}>{statusText}</StatusPill>
      </SteplyCard>

      <div className="metric-row metric-row--result">
        <MetricCard value={primaryValue} label={primaryLabel} detail={source.testLabel || testLabel(testType)} accent />
        <MetricCard value={score} label="Pose Confidence" detail="MediaPipe worker" status={status} />
        <MetricCard value={`${stability}%`} label="Stability" detail="Body-center sway" />
      </div>

      <SteplyCard className="feedback-result-card">
        <div>
          <div className="eyebrow">AI Summary</div>
          <h3>What we noticed</h3>
        </div>
        <div className="feedback-list">
          {flags.map((flag) => <span key={flag}>{flag}</span>)}
        </div>
      </SteplyCard>

      <div className="result-actions">
        <SteplyButton onClick={onGoExercises}>View Recommended Exercises</SteplyButton>
        <SteplyButton variant="secondary" onClick={onDemoFinal}>Save Demo Final Result</SteplyButton>
      </div>
    </div>
  );
}
