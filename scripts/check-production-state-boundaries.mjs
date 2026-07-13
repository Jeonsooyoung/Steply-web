import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = path.join(root, 'client/src');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [absolute] : [];
  });
}

const forbiddenAcrossProduction = [
  'URLSearchParams',
  'queryValue(',
  'queryParams(',
  'demoMode',
  'demoProfile',
  'buildDemoHistoryItems',
  'handleConnectDemoProfile',
  'handleDemoRealtime',
  'debugAgent',
  'agentDebug',
  'debugPose',
  'poseDebug',
  'window.location.search',
];

for (const file of sourceFiles(clientRoot)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const forbidden of forbiddenAcrossProduction) {
    assert.equal(
      source.includes(forbidden),
      false,
      `[PRODUCT-NO-QUERY-STATE] ${path.relative(root, file)} excludes ${forbidden}`,
    );
  }
}

for (const removedFixture of [
  'client/src/data/demoProfile.js',
  'client/src/data/demoHistory.js',
]) {
  assert.equal(fs.existsSync(path.join(root, removedFixture)), false, `[PRODUCT-NO-DEMO-FIXTURE] ${removedFixture} stays outside production`);
}

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { DisplayHomeScreen } = await server.ssrLoadModule('/client/src/routes/StepTwoScreens.jsx');
  const { DisplayExercisePlanScreen } = await server.ssrLoadModule('/client/src/routes/StepSevenScreens.jsx');
  const { DisplayErrorStateScreen } = await server.ssrLoadModule('/client/src/routes/StepNineScreens.jsx');
  const { DisplaySettingsScreen } = await server.ssrLoadModule('/client/src/routes/StepEightScreens.jsx');

  const emptyHome = renderToStaticMarkup(React.createElement(DisplayHomeScreen, { dashboard: { historyItems: [] } }));
  assert.match(emptyHome, /Welcome to Steply/, '[PRODUCT-EMPTY-HOME] missing profile is explicit');
  assert.match(emptyHome, /Assessment not ready/, '[PRODUCT-EMPTY-HOME] missing assessment is explicit');
  assert.match(emptyHome, /No valid result/, '[PRODUCT-EMPTY-HOME] missing measurements are explicit');
  assert.doesNotMatch(emptyHome, /Maria|9 stands|8\.6 seconds/, '[PRODUCT-NO-DEMO-HOME] no sample person or measurements leak into empty state');

  const actualHome = renderToStaticMarkup(React.createElement(DisplayHomeScreen, {
    dashboard: {
      session: { profile: { id: 'stored-profile', displayName: 'Stored Person' } },
      finalResult: { fallRiskLevel: 'HIGH' },
      historyItems: [{ id: 'stored-result' }],
    },
  }));
  assert.match(actualHome, /Stored Person/, '[PRODUCT-ACTUAL-HOME] stored profile reaches the UI');
  assert.match(actualHome, /Professional assessment recommended/, '[PRODUCT-ACTUAL-HOME] stored risk reaches the UI without a query override');

  const emptyPlan = renderToStaticMarkup(React.createElement(DisplayExercisePlanScreen, { dashboard: {} }));
  assert.match(emptyPlan, /No exercises are available to start today/, '[PRODUCT-EMPTY-PLAN] missing prescription is explicit');
  assert.match(emptyPlan, />0 minutes</, '[PRODUCT-EMPTY-PLAN] missing prescription does not fabricate duration');
  assert.match(emptyPlan, /No prescribed exercises/, '[PRODUCT-EMPTY-PLAN] missing prescription does not fabricate support');

  const actualPlan = renderToStaticMarkup(React.createElement(DisplayExercisePlanScreen, {
    dashboard: {
      finalResult: {
        recommendationPlan: {
          selectedExercises: [{
            exerciseId: 'S1',
            repetitions: 4,
            sets: 2,
            level: 'A',
            supportRequirement: 'TWO_HAND_FIXED_SUPPORT',
            cameraVerifiable: true,
          }],
        },
      },
    },
  }));
  assert.match(actualPlan, /4 repetitions, 2 sets/, '[PRODUCT-ACTUAL-PLAN] stored dosage reaches the UI');
  assert.match(actualPlan, /Level A/, '[PRODUCT-ACTUAL-PLAN] stored level reaches the UI');

  const actualError = renderToStaticMarkup(React.createElement(DisplayErrorStateScreen, {
    dashboard: { error: 'REAL_TRACKING_PIPELINE_ERROR' },
  }));
  assert.match(actualError, /REAL_TRACKING_PIPELINE_ERROR/, '[PRODUCT-ACTUAL-ERROR] runtime error reaches the invalid result UI');
  assert.match(actualError, /No completed result was saved/, '[PRODUCT-EMPTY-ERROR] absent result persistence is explicit');

  const settings = renderToStaticMarkup(React.createElement(DisplaySettingsScreen, { dashboard: {} }));
  assert.doesNotMatch(settings, />Delete My Data</, '[PRODUCT-MOBILE-AUTHORITY] Web does not offer a cosmetic local deletion action');
  assert.match(settings, /data export, sharing consent, and deletion are available in the paired Steply phone app/, '[PRODUCT-MOBILE-AUTHORITY] Web directs authoritative privacy actions to Mobile');
  assert.doesNotMatch(settings, /Delete request confirmed for this device/, '[PRODUCT-MOBILE-AUTHORITY] fake deletion confirmation is absent');
  assert.doesNotMatch(settings, />View Stored Data<|>Export My Data<|>Sharing Permissions</, '[PRODUCT-MOBILE-AUTHORITY] Web does not expose cosmetic privacy actions');
  assert.doesNotMatch(settings, /Voice Speed|Voice Volume|Captions|Check Network/, '[PRODUCT-NO-NOOP-CONTROLS] unsupported PC controls are absent');
  assert.doesNotMatch(settings, /type="checkbox"[^>]*checked=""/, '[PRODUCT-NO-NOOP-CONTROLS] notifications are not rendered as hardcoded enabled controls');
  assert.match(settings, /managed in the paired Steply phone app/, '[PRODUCT-MOBILE-AUTHORITY] phone-owned notifications are identified');
  assert.match(settings, /while this settings screen is open/, '[PRODUCT-PC-SESSION] supported display settings have accurate scope');

  const legacyProfileSettings = renderToStaticMarkup(React.createElement(DisplaySettingsScreen, {
    dashboard: { profile: { name: 'Legacy Name', age: 76, gender: 'FEMALE', caregiverName: 'Legacy Caregiver' } },
  }));
  assert.doesNotMatch(legacyProfileSettings, /Legacy Name|>76<|FEMALE|Legacy Caregiver/, '[PRODUCT-STRICT-PROFILE] Settings rejects legacy profile fallbacks');
  assert.match(legacyProfileSettings, /Unavailable on this PC/, '[PRODUCT-STRICT-PROFILE] missing strict profile fields are explicit');
  assert.match(legacyProfileSettings, /Stored on phone/, '[PRODUCT-STRICT-PROFILE] caregiver state is not inferred from an absent PC field');

  console.log('Production state-boundary static and SSR checks passed.');
} finally {
  await server.close();
}
