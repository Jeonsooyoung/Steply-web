import { useEffect, useMemo, useState } from 'react';
import { MetricCard, SteplyButton, SteplyCard, StatusPill } from './SteplyPrimitives';
import { centerParticipants, centerSummary, priorityRank } from '../data/serviceModels';

function categoryStatus(category) {
  if (category === 'Low') return 'steady';
  if (category === 'Moderate') return 'practice_needed';
  return 'recheck';
}

function TrendBars({ values = [] }) {
  const max = Math.max(...values.filter(Number.isFinite), 100);
  return (
    <div className="mini-trend" aria-label="Recent score trend">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          style={{ '--bar-height': `${Math.max(18, (value / max) * 100)}%` }}
          aria-label={`Session ${index + 1}: ${value}`}
        />
      ))}
    </div>
  );
}

function QueueBoard({ participants, onSelect }) {
  const statuses = ['Waiting', 'Ready', 'Completed', 'Needs follow-up'];
  return (
    <div className="queue-board" aria-label="Center session queue">
      {statuses.map((status) => (
        <section key={status} className="queue-column">
          <h3>{status}</h3>
          <div className="queue-list">
            {participants.filter((participant) => participant.queueStatus === status).map((participant) => (
              <button key={participant.id} type="button" onClick={() => onSelect(participant.id)}>
                <strong>{participant.name}</strong>
                <span>{participant.lastSession}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function DashboardView({ participants, onSelect }) {
  const summary = centerSummary(participants);
  const prioritized = [...participants].sort((a, b) => priorityRank(b) - priorityRank(a));

  return (
    <div className="care-screen">
      <SteplyCard className="care-hero">
        <div>
          <div className="eyebrow">Care Dashboard</div>
          <h2>Senior center balance screening</h2>
          <p>
            Prioritize participants by recent score change, participation, tandem hold time, functional findings, and referral needs.
          </p>
        </div>
        <SteplyButton className="care-hero__button">Start Center Session</SteplyButton>
      </SteplyCard>

      <div className="metric-row">
        <MetricCard value={summary.total} label="Total Participants" detail="Active center profiles" />
        <MetricCard value={summary.completedToday} label="Completed Today" detail="Checked in this session" accent />
        <MetricCard value={summary.needsFollowUp} label="Needs Follow-up" detail="Review before next class" status="practice_needed" />
        <MetricCard value={summary.missedRecentSessions} label="Missed Recent Sessions" detail="Participation decreased" />
      </div>

      <div className="care-grid">
        <SteplyCard className="priority-list-card">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Prioritized List</div>
              <h3>Who needs attention first</h3>
            </div>
            <StatusPill status="practice_needed">Sorted by recent change</StatusPill>
          </div>
          <div className="participant-list">
            {prioritized.map((participant) => (
              <button key={participant.id} type="button" onClick={() => onSelect(participant.id)}>
                <div>
                  <strong>{participant.name}</strong>
                  <span>{participant.priorityReason}</span>
                </div>
                <StatusPill status={categoryStatus(participant.riskCategory)}>
                  {participant.riskCategory}
                </StatusPill>
              </button>
            ))}
          </div>
        </SteplyCard>

        <SteplyCard className="device-ownership-card">
          <div className="eyebrow">Group Session Mode</div>
          <h3>One queue, separate profiles</h3>
          <p>
            Each participant uses their own phone when possible. Movement data stays associated with the participant’s own device and profile, while this screen guides the center queue.
          </p>
          <div className="device-ownership-steps">
            <span>Check in</span>
            <span>Open camera</span>
            <span>Run mission</span>
            <span>Save to profile</span>
          </div>
        </SteplyCard>
      </div>

      <QueueBoard participants={participants} onSelect={onSelect} />
    </div>
  );
}

function ParticipantDetail({ participant, onBack }) {
  if (!participant) return null;
  const functionalFindings = participant.functionalFindings || [];
  const failedCriteria = participant.failedCriteria || (
    participant.tandemHoldSeconds < 10
      ? ['Tandem stance under 10 seconds']
      : participant.riskCategory === 'Moderate'
        ? ['Repeated movement finding']
        : []
  );
  const professionalReviewSuggested = participant.professionalReviewSuggested
    ?? participant.riskCategory === 'Needs Review';
  const trendWarning = participant.trendWarning || (
    participant.scoreChange < -8
      ? 'Recent 5-session trend declined enough to review next action.'
      : participant.adherence < 50
        ? 'Exercise adherence is below 50% for the week.'
        : 'Trend is stable enough to continue planned practice.'
  );

  return (
    <div className="participant-detail-screen">
      <div className="detail-toolbar">
        <SteplyButton variant="secondary" onClick={onBack}>Back to dashboard</SteplyButton>
      </div>

      <SteplyCard className="participant-hero">
        <div>
          <div className="eyebrow">Participant Detail</div>
          <h2>{participant.name}</h2>
          <p>Recent movement checks, functional findings, adherence, and the practical next action for staff.</p>
        </div>
        <StatusPill status={categoryStatus(participant.riskCategory)}>{participant.riskCategory}</StatusPill>
      </SteplyCard>

      <div className="metric-row">
        <MetricCard value={`${participant.scoreChange}`} label="Recent Score Change" detail="Compared with prior sessions" status={participant.scoreChange < -8 ? 'recheck' : 'practice_needed'} />
        <MetricCard value={`${participant.tandemHoldSeconds}s`} label="Tandem Hold" detail="10 seconds is the review point" accent />
        <MetricCard value={`${participant.adherence}%`} label="Exercise Adherence" detail="Home and center sessions" />
      </div>

      <div className="participant-detail-grid">
        <SteplyCard className="detail-section">
          <div className="eyebrow">Last 5 Sessions</div>
          <h3>Repeated measurement history</h3>
          <div className="session-table" role="table" aria-label="Last five sessions">
            {participant.sessions.map((session) => (
              <div key={session.label} role="row">
                <span>{session.label}</span>
                <strong>{session.score === null ? '-' : session.score}</strong>
                <span>{session.status}</span>
                <span>{session.note}</span>
              </div>
            ))}
          </div>
        </SteplyCard>

        <SteplyCard className="detail-section">
          <div className="eyebrow">Functional Findings</div>
          <h3>Patterns to review</h3>
          <div className="finding-chip-list">
            {functionalFindings.map((finding) => <span key={finding}>{finding}</span>)}
          </div>
          <TrendBars values={participant.trend} />
        </SteplyCard>

        <SteplyCard className="detail-section">
          <div className="eyebrow">Screening Rules</div>
          <h3>{failedCriteria.length ? 'Failed criteria' : 'No failed cutoff today'}</h3>
          <div className="finding-chip-list">
            {(failedCriteria.length ? failedCriteria : ['Continue trend monitoring']).map((criterion) => (
              <span key={criterion}>{criterion}</span>
            ))}
          </div>
          <p>{trendWarning}</p>
          <StatusPill status={professionalReviewSuggested ? 'recheck' : 'practice_needed'}>
            {professionalReviewSuggested ? 'Professional review suggested' : 'Repeat screening next session'}
          </StatusPill>
        </SteplyCard>

        <SteplyCard className="detail-section detail-section--action">
          <div className="eyebrow">Recommended Next Action</div>
          <h3>{participant.nextAction}</h3>
          <p>{participant.priorityReason}</p>
        </SteplyCard>
      </div>
    </div>
  );
}

export function CareDashboard({ initialParticipantId = null }) {
  const [selectedParticipantId, setSelectedParticipantId] = useState(initialParticipantId);
  const participants = useMemo(() => centerParticipants, []);

  useEffect(() => {
    setSelectedParticipantId(initialParticipantId);
  }, [initialParticipantId]);

  const selectedParticipant = participants.find((participant) => participant.id === selectedParticipantId);

  if (selectedParticipant) {
    return (
      <ParticipantDetail
        participant={selectedParticipant}
        onBack={() => setSelectedParticipantId(null)}
      />
    );
  }

  return <DashboardView participants={participants} onSelect={setSelectedParticipantId} />;
}
