const { STEPLY_DATA_CONTRACT_SCHEMA_VERSION } = require('../../shared/steplyDataContract.cjs');

function stage5DataContractFixture({
  id = 'profile-fixture',
  displayName = 'Fixture Profile',
  birthYear = 1950,
  sex = 'FEMALE',
  now = Date.now(),
  recentAssessments = [],
} = {}) {
  return {
    schemaVersion: STEPLY_DATA_CONTRACT_SCHEMA_VERSION,
    profile: { id, displayName, birthYear, sex },
    recentAssessments,
    generatedAt: now,
  };
}

module.exports = { stage5DataContractFixture };
