import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { buildHistoryTrendFixture } from './fixtures/historyTrendFixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const {
    BalancePostureSeries,
    HistoryChallengeTypes,
    buildChallengeTrendSeries,
    latestMetric,
    trendDelta,
  } = await server.ssrLoadModule('/client/src/utils/historyTrends.js');

  const items = buildHistoryTrendFixture();
  const chair = buildChallengeTrendSeries(items, HistoryChallengeTypes.ChairStand);
  const balance = buildChallengeTrendSeries(items, HistoryChallengeTypes.FourStageBalance);

  assert.equal(chair.length, 5);
  assert.equal(balance.length, 5);
  assert.ok(latestMetric(chair, 'repetitions') > chair[0].repetitions);
  assert.ok(trendDelta(chair, 'repetitions') > 0);
  const expectedLatest = {
    sideBySideSeconds: 10,
    semiTandemSeconds: 10,
    tandemSeconds: 9.5,
    oneLegSeconds: 5.2,
  };
  for (const posture of BalancePostureSeries) {
    assert.equal(latestMetric(balance, posture.metricKey), expectedLatest[posture.metricKey], `[S5-G01] ${posture.wireId} exact latest seconds`);
    assert.ok(trendDelta(balance, posture.metricKey) > 0, `[S5-G01] ${posture.wireId} has an independent trend series`);
  }
  assert.deepEqual(balance.at(-1).balanceSecondsByStage, {
    SIDE_BY_SIDE: 10,
    SEMI_TANDEM: 10,
    TANDEM: 9.5,
    ONE_LEG: 5.2,
  });
  assert.notEqual(balance.at(-1).raw.score, balance.at(-1).tandemSeconds, '[S5-G02] generic score is not a balance posture value');
  const historyPanelSource = fs.readFileSync(path.join(root, 'client/src/components/HistoryPanel.jsx'), 'utf8');
  const progressPanelSource = fs.readFileSync(path.join(root, 'client/src/components/ProgressPanel.jsx'), 'utf8');
  assert.match(historyPanelSource, /BalancePostureSeries\.map/, '[S5-G01] HistoryPanel renders all canonical posture series');
  assert.match(historyPanelSource, /<ReferenceLine y=\{10\}/, '[S5-G01] HistoryPanel displays the 10-second baseline');
  assert.match(historyPanelSource, /posture\.emphasized \? 5 : 2\.5/, '[S5-G01] Tandem series is visually emphasized');
  assert.doesNotMatch(historyPanelSource, /dataKey="swayIndex"/, '[S5-G02] sway is not rendered as an assessment-score line');
  assert.match(progressPanelSource, /BalancePostureSeries\.map/, '[S5-G01] ProgressPanel displays all four latest posture values');

  console.log(`chair trend sessions=${chair.length}, latest=${latestMetric(chair, 'repetitions')} reps`);
  console.log(`balance trend sessions=${balance.length}, latest tandem=${latestMetric(balance, 'tandemSeconds')}s`);
} finally {
  await server.close();
}
