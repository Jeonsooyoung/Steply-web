function publicSession(session) {
  if (!session) return null;

  return {
    id: session.id,
    createdAt: session.createdAt,
    connectedAt: session.connectedAt || null,
    selectedTest: session.selectedTest || null,
    profile: session.profile || null,
    latestResult: session.latestResult || null,
    finalResult: session.finalResult || null,
  };
}

module.exports = {
  publicSession,
};
