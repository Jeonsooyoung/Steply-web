const { publicAssessmentSession } = require('./assessmentSessionService');

function publicSession(session) {
  if (!session) return null;

  return {
    id: session.id,
    createdAt: session.createdAt,
    connectedAt: session.connectedAt || null,
    selectedTest: session.selectedTest || null,
    profile: session.profile || null,
    dataContract: session.dataContract || null,
    latestResult: session.latestResult || null,
    finalResult: session.finalResult || null,
    assessmentSession: session.assessmentSession
      ? publicAssessmentSession(session.assessmentSession)
      : null,
    careAgentProjection: session.careAgentProjection || null,
  };
}

module.exports = {
  publicSession,
};
