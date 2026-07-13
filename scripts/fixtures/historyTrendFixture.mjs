function daysAgo(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function balanceResult([sideBySide, semiTandem, tandem, oneLeg], swayRaw) {
  const stage = (id, holdSeconds, totalHold = null) => ({ id, holdSeconds, ...(totalHold ? { totalHold } : {}) });
  return {
    schemaVersion: 'balance_result.v1',
    testType: 'four_stage_balance',
    stageById: {
      side_by_side: stage('side_by_side', sideBySide),
      semi_tandem: stage('semi_tandem', semiTandem),
      tandem: stage('tandem', tandem, {
          sway: {
            mediolateral: { standardDeviation: swayRaw },
            anteriorPosterior: { standardDeviation: swayRaw * 0.85 },
          },
      }),
      one_leg: stage('one_leg', oneLeg),
    },
    stages: [],
  };
}

function chairStandResult(repetitionCount) {
  return {
    schemaVersion: 'chair_stand_result.v1',
    testType: 'chair_stand',
    repetitionCount,
  };
}

export function buildHistoryTrendFixture() {
  const chairReps = [7, 8, 9, 10, 11, 12];
  const balanceHolds = [
    [8.5, 7.2, 5.2, 1.1],
    [9, 7.8, 6.4, 1.8],
    [9.5, 8.4, 7.1, 2.6],
    [10, 9, 7.8, 3.4],
    [10, 9.5, 8.6, 4.3],
    [10, 10, 9.5, 5.2],
  ];
  const balanceSway = [0.082, 0.074, 0.068, 0.057, 0.049, 0.041];

  return [
    ...chairReps.map((repetitionCount, index) => ({
      id: `fixture-chair-${index}`,
      testType: 'chair_stand',
      selectedTest: 'chair_stand',
      receivedAt: daysAgo((chairReps.length - index) * 2),
      score: 70 + index * 4,
      count: repetitionCount,
      repetitionCount,
      chairStandResult: chairStandResult(repetitionCount),
      source: 'test_fixture',
    })),
    ...balanceHolds.map((holdSecondsByStage, index) => ({
      id: `fixture-balance-${index}`,
      testType: 'four_stage_balance',
      selectedTest: 'four_stage_balance',
      receivedAt: daysAgo((balanceHolds.length - index) * 2 - 1),
      score: 68 + index * 5,
      count: holdSecondsByStage[2],
      primaryValue: holdSecondsByStage[2],
      balanceResult: balanceResult(holdSecondsByStage, balanceSway[index]),
      source: 'test_fixture',
    })),
  ].sort((a, b) => b.receivedAt - a.receivedAt);
}
