import { SteplyButton, SteplyCard, StatusPill } from './SteplyPrimitives';
import { statusFromScore } from '../utils/format';
import {
  AssessmentStatuses,
  ResultSources,
  canGenerateExerciseRecommendation,
  canPersistAssessmentResult,
  sourceFromResult,
} from '../pose/assessmentResultMetadata';
import { createResultViewModel } from '../pipeline/ui/resultViewModel.js';
import { DisplayRiskLevels } from '../pipeline/ui/assessmentCopy.js';

const ERROR_STATUS_CODES = new Set([
  AssessmentStatuses.Incomplete,
  AssessmentStatuses.Invalid,
  AssessmentStatuses.Cancelled,
  AssessmentStatuses.TrackingFailed,
  'ANALYZER_FINAL_TIMEOUT',
  'CAMERA_DISCONNECTED',
  'TRACKING_FAILED',
]);

function riskStatusClass(level, fallback) {
  if (level === DisplayRiskLevels.Low || level === 'lowRisk' || level === 'LOW') return 'steady';
  if (level === DisplayRiskLevels.Moderate || level === 'moderateRisk' || level === 'MODERATE') return 'practice_needed';
  if (level === DisplayRiskLevels.High || level === DisplayRiskLevels.NeedsReview || level === null) return 'recheck';
  return fallback;
}

function shouldShowAgentTrace() {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  return search.get('debugAgent') === '1' || search.get('agentDebug') === '1';
}

function isErrorResult(result = {}) {
  return ERROR_STATUS_CODES.has(result.status)
    || ERROR_STATUS_CODES.has(result.errorCode)
    || result.invalid === true;
}

function professionalReviewRequired(result = {}) {
  return Boolean(
    result.structuredPipeline?.exercisePlan?.requiresProfessionalReview
      || result.recommendationPlan?.requiresProfessionalReview
  );
}

function AgentDecisionTrace({ trace }) {
  if (!trace) return null;
  const selected = trace.selectedActions || [];
  const rejected = trace.rejectedActions || [];
  const guardrails = trace.guardrailChecks || [];
  const tools = trace.toolResults || [];
  return (
    <SteplyCard className="feedback-result-card agent-decision-trace-card">
      <div>
        <div className="eyebrow">Agent Decision Trace</div>
        <h3>{trace.triggeredPolicy || 'No policy triggered'}</h3>
      </div>
      <div className="agent-decision-trace">
        <div>
          <strong>What changed?</strong>
          <span>{trace.whatChanged || 'No immediate care-plan change.'}</span>
        </div>
        <div>
          <strong>What did the agent observe?</strong>
          <span>
            Risk {trace.observed?.currentSteadiRiskLevel || '-'}; invalid attempts {trace.observed?.recentInvalidAttemptCount ?? 0};
            {' '}findings {(trace.observed?.activeFunctionalFindingTypes || []).join(', ') || '-'}
          </span>
        </div>
        <div>
          <strong>Which policy was triggered?</strong>
          <span>{trace.triggeredPolicy || '-'}</span>
        </div>
        <div>
          <strong>What action was selected?</strong>
          <span>{selected.map((item) => `${item.type}:${item.reasonCode}`).join(', ') || '-'}</span>
        </div>
        <div>
          <strong>Which actions were rejected?</strong>
          <span>{rejected.map((item) => `${item.type}:${(item.rejectedReasonCodes || []).join('|')}`).join(', ') || '-'}</span>
        </div>
        <div>
          <strong>Which guardrails were checked?</strong>
          <span>{guardrails.map((item) => `${item.checkId}:${item.passed ? 'pass' : 'block'}`).join(', ') || '-'}</span>
        </div>
        <div>
          <strong>What tool was called?</strong>
          <span>{tools.map((item) => `${item.toolId || 'none'}:${item.status}`).join(', ') || '-'}</span>
        </div>
        <div>
          <strong>What was the result?</strong>
          <span>{trace.finalObservation?.pendingEscalation ? 'Professional review pending' : trace.finalObservation?.nextReassessmentDate || 'Decision recorded'}</span>
        </div>
      </div>
    </SteplyCard>
  );
}

function ResultSection({ eyebrow, title, children, action }) {
  return (
    <SteplyCard className="feedback-result-card structured-result-section">
      <div className="structured-result-section__header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h3>{title}</h3>
        </div>
        {action ? <div className="structured-result-section__action">{action}</div> : null}
      </div>
      {children}
    </SteplyCard>
  );
}

function QualityList({ items = [] }) {
  return (
    <div className="structured-quality-list">
      {items.map((item) => (
        <div className="structured-quality-item" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value || 'Not available'}</strong>
        </div>
      ))}
    </div>
  );
}

function StructuredItemList({ items = [], emptyText, renderItem }) {
  if (!items.length) {
    return <p className="structured-empty-text">{emptyText}</p>;
  }
  return (
    <div className="structured-result-list">
      {items.map((item) => (
        <div className="structured-result-item" key={item.id || item.title}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

function NoResultPanel({ onTryAgain, onCameraSetup, onExitAssessment }) {
  return (
    <div className="panel-grid panel-grid--result distance-mode distance-mode--result">
      <SteplyCard className="result-hero-card">
        <div className="eyebrow">Measurement Result</div>
        <h2>No measurement result yet.</h2>
        <p>Start a live camera assessment to create a result.</p>
        <StatusPill status="recheck">No result</StatusPill>
      </SteplyCard>

      <ResultSection eyebrow="Next step" title="Run a live assessment">
        <p className="structured-empty-text">
          This screen does not show saved or mock results when no structured measurement is available.
        </p>
      </ResultSection>

      <div className="result-actions">
        <SteplyButton onClick={onTryAgain}>Start Assessment</SteplyButton>
        <SteplyButton variant="secondary" onClick={onCameraSetup}>Camera Setup</SteplyButton>
        <SteplyButton variant="secondary" onClick={onExitAssessment}>Exit Assessment</SteplyButton>
      </div>
    </div>
  );
}

function InvalidResultPanel({
  source,
  viewModel,
  agentTrace,
  showAgentTrace,
  onTryAgain,
  onCameraSetup,
  onExitAssessment,
}) {
  return (
    <div className="panel-grid panel-grid--result distance-mode distance-mode--result">
      <SteplyCard className="result-hero-card">
        <div className="eyebrow">Measurement Incomplete</div>
        <h2>We could not measure this test reliably.</h2>
        <p>Please adjust the camera and try again.</p>
        <StatusPill status="recheck">{source.errorCode || source.status || 'TRACKING_FAILED'}</StatusPill>
      </SteplyCard>

      <ResultSection eyebrow="Measurement quality" title="No score was saved">
        <QualityList items={viewModel.measurementQuality} />
      </ResultSection>

      <ResultSection eyebrow="Direct test result" title={viewModel.directResult.title}>
        <p className="structured-result-message">{viewModel.directResult.message}</p>
      </ResultSection>

      <ResultSection eyebrow="Next planned action" title="Try the setup again">
        <p className="structured-result-message">
          {viewModel.nextAction || 'Please adjust the camera and repeat the measurement.'}
        </p>
      </ResultSection>

      {showAgentTrace ? <AgentDecisionTrace trace={agentTrace} /> : null}

      <div className="result-actions">
        <SteplyButton onClick={onTryAgain}>Try Again</SteplyButton>
        <SteplyButton variant="secondary" onClick={onCameraSetup}>Camera Setup</SteplyButton>
        <SteplyButton variant="secondary" onClick={onExitAssessment}>Exit Assessment</SteplyButton>
      </div>
    </div>
  );
}

export function ResultPanel({
  finalResult,
  liveResult,
  onGoExercises,
  onDemoFinal,
  onTryAgain,
  onCameraSetup,
  onExitAssessment,
}) {
  const source = finalResult || liveResult || null;
  const hasResult = Boolean(source);
  const resultSource = hasResult ? sourceFromResult(source) : null;
  const isDemoResult = resultSource === ResultSources.Demo;
  const isFallbackResult = resultSource === ResultSources.Fallback;
  const viewModel = createResultViewModel(source || {});
  const canRecommend = hasResult && canGenerateExerciseRecommendation(source);
  const persistCheck = hasResult ? canPersistAssessmentResult(source) : { ok: false };
  const canSaveResult = persistCheck.ok && !source.id;
  const resultIsError = !hasResult || viewModel.invalid || isErrorResult(source || {}) || isFallbackResult;
  const agentTrace = source?.agentDecisionTrace || source?.carePipeline?.agent?.decisionTrace || null;
  const showAgentTrace = shouldShowAgentTrace();

  if (!hasResult) {
    return (
      <NoResultPanel
        onTryAgain={onTryAgain}
        onCameraSetup={onCameraSetup}
        onExitAssessment={onExitAssessment}
      />
    );
  }

  if (resultIsError) {
    return (
      <InvalidResultPanel
        source={source}
        viewModel={viewModel}
        agentTrace={agentTrace}
        showAgentTrace={showAgentTrace}
        onTryAgain={onTryAgain}
        onCameraSetup={onCameraSetup}
        onExitAssessment={onExitAssessment}
      />
    );
  }

  const status = riskStatusClass(
    source.structuredPipeline?.steadiRiskLevel
      || source.recommendationPlan?.riskLevel
      || source.fallRiskLevel,
    source.recommendationLevel || statusFromScore(source.score ?? source.trackingQualityScore ?? 85),
  );
  const adultLabel = source.structuredPipeline?.steadiRiskLevel
    || source.olderAdultLabel
    || 'Structured result ready';
  const canOpenExercises = Boolean(
    onGoExercises
      && canRecommend
      && viewModel.exercises.length
      && !professionalReviewRequired(source)
  );

  return (
    <div className="panel-grid panel-grid--result distance-mode distance-mode--result">
      <SteplyCard className="result-hero-card">
        <div className="eyebrow">Movement Result</div>
        {isDemoResult ? <strong className="demo-data-badge">DEMO DATA - NOT SAVED</strong> : null}
        <h2>Today&apos;s structured measurement</h2>
        <p>{viewModel.directResult.message}</p>
        <StatusPill status={status}>{adultLabel}</StatusPill>
      </SteplyCard>

      <ResultSection eyebrow="1. Measurement quality" title="Camera and tracking quality">
        <QualityList items={viewModel.measurementQuality} />
      </ResultSection>

      <ResultSection eyebrow="2. Direct test result" title={viewModel.directResult.title}>
        <p className="structured-result-message">{viewModel.directResult.message}</p>
      </ResultSection>

      <ResultSection eyebrow="3. Functional findings" title="What the measurement showed">
        <StructuredItemList
          items={viewModel.findings}
          emptyText="No functional finding was generated from this valid measurement."
          renderItem={(finding) => (
            <>
              <div className="structured-result-item__topline">
                <strong>{finding.title}</strong>
                <span>{finding.classification}</span>
              </div>
              <p>Confidence: {finding.confidence}</p>
              {finding.evidence ? <small>{finding.evidence}</small> : null}
            </>
          )}
        />
      </ResultSection>

      <ResultSection
        eyebrow="4. Recommended exercises"
        title="Deterministic Otago plan"
        action={(
          <SteplyButton onClick={onGoExercises} disabled={!canOpenExercises}>
            View Exercises
          </SteplyButton>
        )}
      >
        <StructuredItemList
          items={viewModel.exercises}
          emptyText="No exercise was selected from the structured plan."
          renderItem={(exercise) => (
            <>
              <div className="structured-result-item__topline">
                <strong>{exercise.title}</strong>
                <span>{exercise.level}</span>
              </div>
              <p>{exercise.target}</p>
              <small>{exercise.support}</small>
            </>
          )}
        />
      </ResultSection>

      <ResultSection eyebrow="5. Why these exercises were selected" title="Recommendation evidence">
        <StructuredItemList
          items={viewModel.reasonTrace.map((reason, index) => ({ id: `${index}-${reason}`, title: reason }))}
          emptyText="No exercise-selection reason is available."
          renderItem={(reason) => <p>{reason.title}</p>}
        />
      </ResultSection>

      <ResultSection eyebrow="6. Safety notice" title="Safety and review">
        <p className="structured-result-message">{viewModel.safetyNotice}</p>
      </ResultSection>

      <ResultSection eyebrow="7. Next planned action" title="Care plan">
        <p className="structured-result-message">{viewModel.nextAction}</p>
      </ResultSection>

      {showAgentTrace ? <AgentDecisionTrace trace={agentTrace} /> : null}

      <SteplyCard className="safety-step-badge">
        <div className="safety-step-badge__icon">OK</div>
        <div>
          <div className="eyebrow">Completion Badge</div>
          <h3>Safe Steps Badge</h3>
          <p>Measurement complete. The next step follows the structured care plan.</p>
        </div>
      </SteplyCard>

      <div className="result-actions">
        {canSaveResult ? (
          <SteplyButton variant="secondary" onClick={onDemoFinal}>Save Today&apos;s Result</SteplyButton>
        ) : null}
      </div>
    </div>
  );
}
