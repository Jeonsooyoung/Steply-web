import { useMemo, useState } from 'react';
import {
  AppHeader,
  ConnectionIndicator,
  EmergencyStopButton,
  PrimaryActionBar,
  SessionProgress,
} from '../components/foundation/SteplyDesignSystem';
import {
  ageYearsFromProfile,
  normalizeSteadiGender,
} from '../pose/steadiRules';
import { chairStandBelowAverageThreshold } from '../pipeline/scoring/steadi/steadiSessionScorer.js';
import { navigateSpa } from './spaNavigation';

function goTo(path) {
  navigateSpa(path);
}

function StepIcon({ tone = 'info' }) {
  return <span className={`step-six-icon step-six-icon--${tone}`} aria-hidden="true" />;
}

function SessionShell({
  eyebrow,
  title,
  description,
  connection,
  progress,
  children,
  className = '',
}) {
  return (
    <div className={`foundation-shell step-six-shell ${className}`}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        connection={connection}
        actions={<EmergencyStopButton label="Stop Session" onClick={() => goTo('/display/session/complete')} />}
      />
      {progress}
      {children}
    </div>
  );
}

const SupportLevels = {
  Low: 'low',
  Moderate: 'moderate',
  High: 'high',
  NotReady: 'not_ready',
};

const supportLevelCopy = {
  [SupportLevels.Low]: {
    label: 'Low Support Needs',
    description: "Your results are within the expected range for today's movement check.",
    action: 'Continue your recommended exercise plan.',
    tone: 'success',
  },
  [SupportLevels.Moderate]: {
    label: 'Moderate Support Needs',
    description: 'Your results show areas that may benefit from regular strength and balance exercise.',
    action: 'Start the recommended Otago Exercise Programme plan.',
    tone: 'warning',
  },
  [SupportLevels.High]: {
    label: 'Professional Assessment Recommended',
    description: 'Your results suggest that a healthcare professional should review your balance and mobility before you begin more challenging exercises.',
    action: 'Review professional guidance before starting advanced exercises.',
    tone: 'danger',
  },
  [SupportLevels.NotReady]: {
    label: 'Assessment Needs Review',
    description: 'Steply could not prepare a complete movement summary from this assessment.',
    action: 'Check the assessment details and repeat the setup if needed.',
    tone: 'warning',
  },
};

const balanceStageLabels = {
  SIDE_BY_SIDE: 'Feet Side by Side',
  side_by_side: 'Feet Side by Side',
  sideBySide: 'Feet Side by Side',
  SEMI_TANDEM: 'Semi-Tandem',
  semi_tandem: 'Semi-Tandem',
  semiTandem: 'Semi-Tandem',
  TANDEM: 'Tandem',
  tandem: 'Tandem',
  ONE_LEG: 'One-Leg Stand',
  one_leg: 'One-Leg Stand',
  oneLeg: 'One-Leg Stand',
};

const findingLabelMap = {
  CHAIR_STAND_BELOW_REFERENCE: {
    label: 'Leg Endurance',
    observed: 'Your movement showed fewer valid chair stands than the CDC reference for your age group.',
    exercise: 'Supported sit-to-stand or seated knee extension practice was selected.',
  },
  ARM_SUPPORT_REQUIRED: {
    label: 'Standing Up From a Chair',
    observed: 'Your movement showed that hand support was used during the chair stand test.',
    exercise: 'Supported chair practice was selected and advanced standing work is restricted.',
  },
  BASIC_BALANCE_DIFFICULTY: {
    label: 'Ankle Balance Control',
    observed: 'Your movement showed difficulty holding the first balance position for 10 seconds.',
    exercise: 'Supported balance practice was selected.',
  },
  SEMI_TANDEM_HOLD_DIFFICULTY: {
    label: 'Side-to-Side Stability',
    observed: 'Your movement showed difficulty holding a narrower standing position.',
    exercise: 'Supported tandem stance practice was selected.',
  },
  TANDEM_HOLD_DIFFICULTY: {
    label: 'Side-to-Side Stability',
    observed: 'Your movement showed difficulty holding Tandem Stand for the CDC 10-second reference.',
    exercise: 'Supported tandem stance and weight-shift practice were selected.',
  },
  SINGLE_LEG_HOLD_DIFFICULTY: {
    label: 'Single-Leg Stability',
    observed: 'Your movement showed difficulty holding one-leg balance.',
    exercise: 'Supported one-leg balance practice was selected.',
  },
  LATE_REPETITION_SLOWDOWN: {
    label: 'Leg Endurance',
    observed: 'Your movement showed slower standing during later repetitions.',
    exercise: 'A short, supported strength plan was selected.',
  },
  TRUNK_COMPENSATION_PATTERN: {
    label: 'Standing Up From a Chair',
    observed: 'Your movement showed more forward body movement during several chair stands.',
    exercise: 'Controlled sit-to-stand practice was selected.',
  },
  MOVEMENT_ASYMMETRY_PATTERN: {
    label: 'Left and Right Movement Pattern',
    observed: 'Your movement showed a different pattern between the left and right sides.',
    exercise: 'Gentle, even movement practice was selected.',
  },
  MEDIOLATERAL_SWAY_PATTERN: {
    label: 'Side-to-Side Stability',
    observed: 'Your movement showed more side-to-side motion while holding the position.',
    exercise: 'Supported weight-shift and balance practice were selected.',
  },
  ANTERIOR_POSTERIOR_SWAY_PATTERN: {
    label: 'Ankle Balance Control',
    observed: 'Your movement showed more forward-and-back motion while holding the position.',
    exercise: 'Supported ankle and balance control practice was selected.',
  },
  FREQUENT_POSITION_CORRECTION: {
    label: 'Ankle Balance Control',
    observed: 'Your movement showed several position adjustments during the test.',
    exercise: 'Steady supported balance practice was selected.',
  },
  LOW_MEASUREMENT_CONFIDENCE: {
    label: 'Measurement Quality',
    observed: 'Some movement details were not measured clearly enough.',
    exercise: 'Camera setup review is recommended before choosing more specific exercises.',
  },
};

const legacyFindingLabelMap = {
  balanceControl: 'Ankle Balance Control',
  ankleStrategyProprioception: 'Ankle Balance Control',
  hipAbductorMediolateralControl: 'Side-to-Side Stability',
  lowerBodyEndurance: 'Leg Endurance',
  quadricepsStrength: 'Leg Strength',
  hipExtensorGluteStrength: 'Standing Up From a Chair',
  eccentricControl: 'Standing Up From a Chair',
  asymmetryNeedsReview: 'Left and Right Movement Pattern',
};

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatSeconds(value) {
  const number = finite(value);
  if (number === null) return 'Not measured';
  return `${number.toFixed(number % 1 === 0 ? 0 : 1)} seconds`;
}

function formatRepetitions(value) {
  const number = finite(value);
  if (number === null) return 'Not measured';
  return `${Math.round(number)} valid ${Math.round(number) === 1 ? 'stand' : 'stands'}`;
}

function resultFromDashboard(dashboard) {
  return dashboard?.finalResult || dashboard?.poseAnalysis?.finalResult || null;
}

function assessmentSessionFromDashboard(dashboard) {
  return dashboard?.session?.assessmentSession || null;
}

function scenarioSupportLevel() {
  return SupportLevels.NotReady;
}

function normalizeSupportLevel(rawValue, result = {}) {
  const value = String(rawValue || '').toLowerCase();
  if (value.includes('needs_review') || value.includes('needs review') || value.includes('high') || value.includes('professional')) {
    return SupportLevels.High;
  }
  if (value.includes('moderate') || value.includes('medium')) return SupportLevels.Moderate;
  if (value.includes('low')) return SupportLevels.Low;
  if (result?.recommendationPlan?.requiresProfessionalReview) {
    return SupportLevels.High;
  }
  if (result?.testFlags?.clinicalResultAvailable === false || result?.invalid) return SupportLevels.NotReady;
  return scenarioSupportLevel();
}

function supportLevelFrom(result, assessmentSession = null) {
  return normalizeSupportLevel(
    assessmentSession?.steadi?.riskLevel
      || result?.fallRiskLevel
      || result?.structuredPipeline?.steadiRiskLevel
      || result?.recommendationPlan?.riskLevel,
    result,
  );
}

function changeFromTrend(result, dashboard) {
  const warnings = result?.trendWarnings || [];
  if (warnings.length) return 'Needs attention compared with recent results';
  if (!dashboard?.historyItems?.length) return 'No previous assessment available';
  return 'Similar to the previous assessment';
}

function mainReasonFor(result, supportLevel) {
  if (supportLevel === SupportLevels.NotReady) {
    return 'The assessment quality was not clear enough for a complete summary.';
  }
  const findings = result?.functionalFindings || [];
  const firstFinding = findings[0]?.findingType || findings[0]?.type;
  if (firstFinding && findingLabelMap[firstFinding]) return findingLabelMap[firstFinding].observed;
  if (supportLevel === SupportLevels.High) return supportLevelCopy[SupportLevels.High].description;
  if (supportLevel === SupportLevels.Low) return "The completed assessment results were within today's reference range.";
  return supportLevelCopy[SupportLevels.Moderate].description;
}

function recommendationPlanFrom(result, assessmentSession = null) {
  return result?.recommendationPlan
    || assessmentSession?.exercisePrescription?.plan
    || result?.carePipeline?.agent?.currentExercisePlan
    || {};
}

function isProfessionalReviewRequired(result, supportLevel, assessmentSession = null) {
  const plan = recommendationPlanFrom(result, assessmentSession);
  return supportLevel === SupportLevels.High
    || plan.requiresProfessionalReview
    || plan.status === 'PENDING_REVIEW';
}

function balanceResultFrom(result, assessmentSession = null) {
  const canonicalBalance = assessmentSession?.functionalTests?.FOUR_STAGE_BALANCE?.acceptedResult?.balance;
  const aggregateBalance = result?.structuredPipeline?.assessmentResults
    ?.find((assessment) => assessment?.assessmentType === 'FOUR_STAGE_BALANCE');
  return canonicalBalance
    || result?.balanceResult
    || result?.rawAnalysisResult?.balanceResult
    || (aggregateBalance ? { stages: aggregateBalance.primaryMeasurements?.stages } : null)
    || null;
}

function balanceStagesFrom(result, assessmentSession = null) {
  const balance = balanceResultFrom(result, assessmentSession);
  const stages = Array.isArray(balance?.stages) && balance.stages.length
    ? balance.stages
    : Object.values(balance?.stageById || {});

  if (!stages.length) {
    return [];
  }

  return stages.map((stage) => {
    const id = stage.id || stage.stage || stage.name;
    const label = balanceStageLabels[id] || stage.title || 'Balance position';
    return {
      id,
      label,
      holdSeconds: finite(stage.holdSeconds ?? stage.holdDurationSeconds ?? stage.durationSeconds) ?? 0,
      completed: stage.status ? !String(stage.status).toLowerCase().includes('not') : true,
      emphasized: id === 'TANDEM' || id === 'tandem',
    };
  });
}

function tandemHoldFrom(result, assessmentSession = null) {
  const stages = balanceStagesFrom(result, assessmentSession);
  return stages.find((stage) => stage.id === 'TANDEM' || stage.id === 'tandem' || stage.label === 'Tandem')?.holdSeconds ?? null;
}

function chairResultFrom(result, assessmentSession = null) {
  const canonicalChair = assessmentSession?.functionalTests?.CHAIR_STAND_30S?.acceptedResult?.chairStand;
  const aggregateChair = result?.structuredPipeline?.assessmentResults
    ?.find((assessment) => assessment?.assessmentType === 'CHAIR_STAND_30S');
  return canonicalChair
    || result?.chairStandResult
    || result?.rawAnalysisResult?.chairStandResult
    || (result?.testType === 'chair_stand' ? result : null)
    || (aggregateChair ? { repetitionCount: aggregateChair.primaryMeasurements?.completedRepetitions } : null)
    || {};
}

function chairRepsFrom(result, assessmentSession = null) {
  const chair = chairResultFrom(result, assessmentSession);
  return finite(
    chair.cdcScoredRepetitions
      ?? chair.repetitionCount
      ?? chair.countedRepetitionCount
      ?? result?.repetitionCount
      ?? result?.primaryValue
      ?? result?.count,
  );
}

function profileFromDashboard(dashboard) {
  return dashboard?.session?.profile || {};
}

function chairReferenceFrom(result, dashboard) {
  const profile = profileFromDashboard(dashboard);
  const age = ageYearsFromProfile(profile);
  const gender = normalizeSteadiGender(profile?.sex)?.toUpperCase() || null;
  return chairStandBelowAverageThreshold(age, gender);
}

function previousChairReps(dashboard) {
  const previous = (dashboard?.historyItems || []).find((item) => item.testType === 'chair_stand' || item.selectedTest === 'chair_stand');
  return finite(previous?.repetitionCount ?? previous?.chairStandResult?.repetitionCount ?? previous?.count);
}

function previousTandemHold(dashboard) {
  const previous = (dashboard?.historyItems || []).find((item) => item.testType === 'four_stage_balance' || item.selectedTest === 'four_stage_balance');
  return finite(previous?.balanceResult?.stageById?.tandem?.holdSeconds ?? previous?.primaryValue ?? previous?.count);
}

function compareText(current, previous, unit) {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return 'No previous assessment available';
  }
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) return 'Similar to the previous assessment';
  const direction = diff > 0 ? 'up' : 'down';
  const value = Math.abs(diff).toFixed(unit === 'seconds' ? 1 : 0);
  return `${value} ${unit} ${direction} from the previous assessment`;
}

function findingsFrom(result) {
  const direct = result?.functionalFindings || [];
  if (direct.length) return direct;
  return [];
}

function findingCardsFrom(result) {
  const cards = [];
  const findings = findingsFrom(result);
  for (const finding of findings) {
    const findingType = finding.findingType || finding.type;
    const mapped = findingLabelMap[findingType];
    if (mapped) {
      cards.push({
        key: `${findingType}-${cards.length}`,
        ...mapped,
      });
      continue;
    }
    const legacyFindingId = finding.id || finding.weakAreaId || finding.primaryWeakness;
    if (legacyFindingId && legacyFindingLabelMap[legacyFindingId]) {
      cards.push({
        key: `${legacyFindingId}-${cards.length}`,
        label: legacyFindingLabelMap[legacyFindingId],
        observed: 'Your movement showed a pattern that may benefit from supported practice.',
        exercise: 'A matched Otago Exercise Programme activity was selected.',
      });
    }
  }
  return cards.slice(0, 4);
}

function selectedExercisesFrom(result, assessmentSession = null) {
  const plan = recommendationPlanFrom(result, assessmentSession);
  const selected = plan.selectedExercises || plan.recommendedExercises || result?.recommendedExercises || result?.recommendations || [];
  if (selected.length) return selected;
  return [];
}

function buildResultsContext(dashboard) {
  const result = resultFromDashboard(dashboard) || {};
  const assessmentSession = assessmentSessionFromDashboard(dashboard);
  const supportLevel = supportLevelFrom(result, assessmentSession);
  const supportCopy = supportLevelCopy[supportLevel];
  const professionalRequired = isProfessionalReviewRequired(result, supportLevel, assessmentSession);
  const chairReps = chairRepsFrom(result, assessmentSession);
  const chairReference = chairReferenceFrom(result, dashboard);
  const tandemHold = tandemHoldFrom(result, assessmentSession);
  const balanceStages = balanceStagesFrom(result, assessmentSession);
  const previousReps = previousChairReps(dashboard);
  const previousTandem = previousTandemHold(dashboard);
  const canonicalComplete = assessmentSession?.status === 'COMPLETED'
    && assessmentSession?.steadi?.status === 'SCORED'
    && assessmentSession?.functionalTests?.CHAIR_STAND_30S?.acceptedResult?.status === 'VALID'
    && assessmentSession?.functionalTests?.FOUR_STAGE_BALANCE?.acceptedResult?.status === 'VALID';
  const invalid = assessmentSession
    ? !canonicalComplete
    : (!result || result?.structuredPipeline?.aggregateReady !== true || supportLevel === SupportLevels.NotReady);

  return {
    result,
    supportLevel,
    supportCopy,
    professionalRequired,
    invalid,
    change: changeFromTrend(result, dashboard),
    reason: mainReasonFor(result, supportLevel),
    nextAction: professionalRequired ? supportLevelCopy[SupportLevels.High].action : supportCopy.action,
    chairReps,
    chairReference,
    chairComparison: chairReps === null || chairReference === null
      ? 'Not measured'
      : chairReps >= chairReference ? 'At or above the CDC reference value' : 'Below the CDC reference value',
    chairPrevious: compareText(chairReps, previousReps, 'stands'),
    balanceStages,
    tandemHold,
    tandemPrevious: compareText(tandemHold, previousTandem, 'seconds'),
    findingCards: findingCardsFrom(result),
    exercises: selectedExercisesFrom(result, assessmentSession),
    plan: recommendationPlanFrom(result, assessmentSession),
  };
}

function analysisProgress(dashboard) {
  const assessmentSession = assessmentSessionFromDashboard(dashboard);
  const done = assessmentSession
    ? assessmentSession.status === 'COMPLETED' && assessmentSession.steadi?.status === 'SCORED'
    : Boolean(dashboard?.finalResult?.structuredPipeline?.aggregateReady);
  const index = done ? 3 : dashboard?.poseAnalysis?.analysisState ? 1 : 0;
  return [
    { label: 'Checking assessment quality', complete: index >= 1 },
    { label: 'Comparing results with CDC reference values', complete: index >= 2 },
    { label: 'Preparing your exercise plan', complete: index >= 3 },
  ];
}

function SupportLevelCard({ context }) {
  const { supportCopy } = context;
  return (
    <section className={`step-six-support-card step-six-support-card--${supportCopy.tone}`}>
      <StepIcon tone={supportCopy.tone}>{supportCopy.tone === 'success' ? 'OK' : '!'}</StepIcon>
      <div>
        <p className="step-six-kicker">Current support level</p>
        <h2>{supportCopy.label}</h2>
        <p>{supportCopy.description}</p>
        <dl className="step-six-support-facts">
          <div>
            <dt>Change from previous assessment</dt>
            <dd>{context.change}</dd>
          </div>
          <div>
            <dt>Main reason</dt>
            <dd>{context.reason}</dd>
          </div>
          <div>
            <dt>Recommended next action</dt>
            <dd>{context.nextAction}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function BalanceResultCard({ context }) {
  return (
    <section className="step-six-result-card step-six-balance-card">
      <div className="step-six-card-header">
        <div>
          <p className="step-six-kicker">Balance result</p>
          <h2>4-Stage Balance Test</h2>
        </div>
        <span>CDC reference: 10 seconds</span>
      </div>
      <div className="step-six-balance-chart" aria-label="Balance hold times compared with CDC 10-second reference">
        {context.balanceStages.map((stage) => {
          const hold = finite(stage.holdSeconds) ?? 0;
          const width = Math.min(100, Math.max(0, (hold / 10) * 100));
          return (
            <div key={stage.id || stage.label} className={stage.emphasized || stage.label === 'Tandem' ? 'step-six-balance-row step-six-balance-row--emphasized' : 'step-six-balance-row'}>
              <span>{stage.label}</span>
              <div className="step-six-balance-bar">
                <i style={{ width: `${width}%` }} />
                <b aria-hidden="true" />
              </div>
              <strong>{formatSeconds(hold)}</strong>
            </div>
          );
        })}
      </div>
      <p className="step-six-card-note">Tandem Stand is emphasized because CDC STEADI uses the 10-second tandem hold as an important reference point.</p>
      <strong>{context.tandemPrevious}</strong>
    </section>
  );
}

function ChairStandResultCard({ context }) {
  const barWidth = Math.min(100, Math.max(0, (context.chairReps / Math.max(1, context.chairReference)) * 100));
  return (
    <section className="step-six-result-card step-six-chair-card">
      <div className="step-six-card-header">
        <div>
          <p className="step-six-kicker">Chair stand result</p>
          <h2>30-Second Chair Stand Test</h2>
        </div>
        <span>{context.chairComparison}</span>
      </div>
      <div className="step-six-chair-value">
        <strong>You completed {formatRepetitions(context.chairReps)}.</strong>
        <p>The CDC reference for your age group is {Math.round(context.chairReference)} or more.</p>
      </div>
      <div className="step-six-reference-chart" aria-label="Chair stand repetitions compared with CDC reference">
        <span>Valid stands</span>
        <div>
          <i style={{ width: `${barWidth}%` }} />
          <b style={{ left: '100%' }} aria-hidden="true" />
        </div>
        <strong>{Math.round(context.chairReps)} / {Math.round(context.chairReference)}</strong>
      </div>
      <strong>{context.chairPrevious}</strong>
    </section>
  );
}

function FunctionalAreaCards({ context }) {
  return (
    <section className="step-six-functional-section" aria-labelledby="functional-area-title">
      <div className="step-six-card-header">
        <div>
          <p className="step-six-kicker">Movement observations</p>
          <h2 id="functional-area-title">Functional areas</h2>
        </div>
      </div>
      <div className="step-six-functional-grid">
        {context.findingCards.map((card) => (
          <article key={card.key} className="step-six-functional-card">
            <StepIcon tone="info">i</StepIcon>
            <h3>{card.label}</h3>
            <p>{card.observed}</p>
            <span>{card.exercise}</span>
            <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/results/details#movement-observations')}>
              View Details
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function Disclaimer() {
  return (
    <section className="step-six-disclaimer">
      <p>This is not a medical diagnosis. Steply uses CDC STEADI functional screening and camera-based movement observations to guide exercise recommendations.</p>
      <p>This assessment does not include a walking test.</p>
      <details>
        <summary>Learn More</summary>
        <p>Steply compares the completed 4-Stage Balance Test and 30-Second Chair Stand Test with CDC STEADI reference values, then uses movement observations to choose supported exercise recommendations from the Otago Exercise Programme. A healthcare professional should review symptoms, medical history, medications, walking, vision, and other fall-risk factors.</p>
      </details>
    </section>
  );
}

function ProfessionalGuidance({ context }) {
  if (!context.professionalRequired) return null;
  return (
    <section className="step-six-professional-guidance">
      <StepIcon tone="danger">!</StepIcon>
      <div>
        <h2>Professional assessment recommended</h2>
        <p>Unsupported and advanced exercises are restricted by the current safety rules. Use only supported practice until a healthcare professional reviews the result.</p>
      </div>
    </section>
  );
}

export function DisplayAnalyzingScreen({ dashboard }) {
  const stages = useMemo(() => analysisProgress(dashboard), [dashboard]);
  const complete = stages.every((stage) => stage.complete);

  return (
    <SessionShell
      eyebrow="Analysis"
      title="Reviewing Your Movement"
      description="Steply is preparing the assessment summary from completed measurements."
      connection={<ConnectionIndicator status={complete ? 'connected' : 'waiting'} label={complete ? 'Results ready' : 'Processing'} detail={complete ? 'Exercise plan prepared' : 'Waiting for completed measurements'} />}
      progress={<SessionProgress current={9} total={9} label="Session progress" />}
      className="step-six-analyzing-shell"
    >
      <main className="step-six-analyzing">
        <section className="step-six-progress-card">
          <h2>Analysis progress</h2>
          <div className="step-six-analysis-stages">
            {stages.map((stage, index) => (
              <div key={stage.label} className={stage.complete ? 'step-six-analysis-stage step-six-analysis-stage--complete' : 'step-six-analysis-stage'}>
                <StepIcon tone={stage.complete ? 'success' : 'info'}>{stage.complete ? 'OK' : index + 1}</StepIcon>
                <span>{stage.label}</span>
                <strong>{stage.complete ? 'Complete' : 'Waiting'}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="step-six-privacy-card">
          <StepIcon tone="info">i</StepIcon>
          <div>
            <h2>Privacy</h2>
            <p>Your camera video is not saved.</p>
            <p>Only movement measurements and assessment results are stored.</p>
          </div>
        </section>

        <PrimaryActionBar
          primaryLabel="View Results"
          primaryDisabled={!complete}
          onPrimary={() => goTo('/display/results/summary')}
        />
      </main>
    </SessionShell>
  );
}

export function DisplayResultsSummaryScreen({ dashboard }) {
  const context = useMemo(() => buildResultsContext(dashboard), [dashboard]);

  return (
    <SessionShell
      eyebrow="Results"
      title="Today's Movement Check"
      description="A clear summary based on today's completed assessments."
      connection={<ConnectionIndicator status="connected" label="Results ready" detail={context.supportCopy.label} />}
      progress={<SessionProgress current={9} total={9} label="Session progress" />}
      className="step-six-results-shell"
    >
      <main className="step-six-summary">
        <SupportLevelCard context={context} />
        <ProfessionalGuidance context={context} />

        <div className="step-six-results-grid">
          <BalanceResultCard context={context} />
          <ChairStandResultCard context={context} />
        </div>

        <FunctionalAreaCards context={context} />
        <Disclaimer />

        <div className="step-six-actions">
          {context.professionalRequired ? (
            <PrimaryActionBar
              primaryLabel="View Professional Guidance"
              secondaryLabel="View Supported Exercises"
              tertiaryLabel="Share Report"
              onPrimary={() => goTo('/display/results/details#professional-guidance')}
              onSecondary={() => goTo('/display/exercises/plan?mode=supported')}
              onTertiary={() => goTo('/display/reports')}
            />
          ) : (
            <PrimaryActionBar
              primaryLabel="View My Exercise Plan"
              secondaryLabel="View Detailed Results"
              tertiaryLabel="Share Report"
              onPrimary={() => goTo('/display/exercises/plan')}
              onSecondary={() => goTo('/display/results/details')}
              onTertiary={() => goTo('/display/reports')}
            />
          )}
        </div>
      </main>
    </SessionShell>
  );
}

function AssessmentResultsPanel({ context }) {
  return (
    <div className="step-six-detail-panel">
      <div className="step-six-detail-metrics">
        <div>
          <span>Support level</span>
          <strong>{context.supportCopy.label}</strong>
        </div>
        <div>
          <span>Tandem Stand</span>
          <strong>{formatSeconds(context.tandemHold)}</strong>
        </div>
        <div>
          <span>Chair stands</span>
          <strong>{formatRepetitions(context.chairReps)}</strong>
        </div>
      </div>
      <p>{context.reason}</p>
    </div>
  );
}

function MovementObservationsPanel({ context }) {
  return (
    <div className="step-six-detail-panel" id="movement-observations">
      {context.findingCards.map((card) => (
        <article key={card.key} className="step-six-observation-row">
          <h3>{card.label}</h3>
          <p>{card.observed}</p>
        </article>
      ))}
    </div>
  );
}

function ExercisesPanel({ context }) {
  return (
    <div className="step-six-detail-panel">
      {context.professionalRequired ? (
        <p>Advanced and unsupported exercises are restricted. The current plan allows supported practice only until professional review is complete.</p>
      ) : null}
      <div className="step-six-exercise-list">
        {context.exercises.slice(0, 4).map((exercise, index) => (
          <article key={exercise.exerciseId || exercise.id || exercise.displayName || index}>
            <span>{exercise.category || 'Exercise'}</span>
            <strong>{exercise.displayName || 'Recommended exercise'}</strong>
            <p>{exercise.safetyInstruction || exercise.safetyNote || 'Use support nearby and stop if you feel unsafe.'}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function PreviousResultsPanel({ context }) {
  return (
    <div className="step-six-detail-panel">
      <div className="step-six-detail-metrics">
        <div>
          <span>Balance change</span>
          <strong>{context.tandemPrevious}</strong>
        </div>
        <div>
          <span>Chair stand change</span>
          <strong>{context.chairPrevious}</strong>
        </div>
      </div>
      <p>{context.change}</p>
    </div>
  );
}

function DetailedMovementData({ context }) {
  const plan = context.plan || {};
  return (
    <details className="step-six-advanced-data">
      <summary>Detailed Movement Data</summary>
      <dl>
        <div>
          <dt>Assessment quality</dt>
          <dd>{context.invalid ? 'Needs review' : 'Usable for this summary'}</dd>
        </div>
        <div>
          <dt>Exercise plan status</dt>
          <dd>{plan.status === 'PENDING_REVIEW' ? 'Pending professional review' : plan.status === 'BLOCKED' ? 'Restricted' : 'Prepared'}</dd>
        </div>
        <div>
          <dt>Safety restrictions</dt>
          <dd>{plan.safetyNotices?.length || plan.safetyGates?.length ? 'Restrictions applied' : 'No extra restrictions shown'}</dd>
        </div>
      </dl>
    </details>
  );
}

export function DisplayResultsDetailsScreen({ dashboard }) {
  const context = useMemo(() => buildResultsContext(dashboard), [dashboard]);
  const [openPanel, setOpenPanel] = useState('assessment');
  const panels = [
    { id: 'assessment', title: 'Assessment Results', content: <AssessmentResultsPanel context={context} /> },
    { id: 'movement', title: 'Movement Observations', content: <MovementObservationsPanel context={context} /> },
    { id: 'exercises', title: 'Why These Exercises', content: <ExercisesPanel context={context} /> },
    { id: 'previous', title: 'Previous Results', content: <PreviousResultsPanel context={context} /> },
  ];

  return (
    <SessionShell
      eyebrow="Detailed results"
      title="Detailed Results"
      description="Review the assessment details and exercise reasoning."
      connection={<ConnectionIndicator status="connected" label="Details ready" detail={context.supportCopy.label} />}
      progress={<SessionProgress current={9} total={9} label="Session progress" />}
      className="step-six-details-shell"
    >
      <main className="step-six-details">
        {context.professionalRequired ? (
          <section className="step-six-professional-guidance" id="professional-guidance">
            <StepIcon tone="danger">!</StepIcon>
            <div>
              <h2>Professional guidance</h2>
              <p>Advanced and unsupported exercises are restricted. Use supported exercises only until a healthcare professional reviews this result.</p>
            </div>
          </section>
        ) : null}

        <section className="step-six-accordion" aria-label="Detailed result sections">
          {panels.map((panel) => (
            <article key={panel.id} className={openPanel === panel.id ? 'step-six-accordion-item step-six-accordion-item--open' : 'step-six-accordion-item'}>
              <button type="button" onClick={() => setOpenPanel(openPanel === panel.id ? '' : panel.id)} aria-expanded={openPanel === panel.id}>
                <span>{panel.title}</span>
                <strong>{openPanel === panel.id ? 'Hide' : 'Show'}</strong>
              </button>
              {openPanel === panel.id ? panel.content : null}
            </article>
          ))}
        </section>

        <DetailedMovementData context={context} />

        <div className="step-six-actions">
          <PrimaryActionBar
            primaryLabel={context.professionalRequired ? 'View Supported Exercises' : 'View My Exercise Plan'}
            secondaryLabel="Back to Summary"
            onPrimary={() => goTo(context.professionalRequired ? '/display/exercises/plan?mode=supported' : '/display/exercises/plan')}
            onSecondary={() => goTo('/display/results/summary')}
          />
        </div>
      </main>
    </SessionShell>
  );
}
