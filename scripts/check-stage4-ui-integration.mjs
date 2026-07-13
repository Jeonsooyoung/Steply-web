import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
  const { DisplayProgressScreen, DisplayReportsScreen } = await server.ssrLoadModule('/client/src/routes/StepEightScreens.jsx');
  const {
    DisplayResultsSummaryScreen,
  } = await server.ssrLoadModule('/client/src/routes/StepSixScreens.jsx');
  const now = Date.now();
  const projection = {
    schemaVersion: 'care_agent_projection.v1',
    profileId: 'profile-stage4-ui',
    stateVersion: 3,
    currentSessionPlan: { mode: 'standard', planId: 'plan-stage4-ui' },
    nextReassessmentAt: now + 7 * 24 * 60 * 60 * 1000,
    latestDecision: {
      decisionId: 'decision-stage4-ui',
      selectedBranch: 'declining_trend',
      selectedActions: [{
        actionId: 'action-stage4-ui',
        actionType: 'advance_reassessment',
        reasonCodes: ['CONSECUTIVE_DECLINE'],
        payload: {},
      }],
      createdAt: now,
    },
    updatedAt: now,
  };
  const dashboard = {
    session: {
      profile: { id: 'profile-stage4-ui', displayName: 'Stored User', birthYear: 1950, sex: 'FEMALE' },
      careAgentProjection: projection,
    },
    settings: { caregiverSharingEnabled: false },
    finalResult: {
      fallRiskLevel: 'LOW',
      functionalFindings: [],
      recommendationPlan: { selectedExercises: [] },
      careAgentProjection: projection,
      agentDecisionTrace: projection.latestDecision.selectedActions,
    },
    historyItems: [
      {
        id: 'chair-stage4-ui', testType: 'chair_stand', selectedTest: 'chair_stand', status: 'VALID',
        receivedAt: now - 2000, repetitionCount: 8, metadata: { isClinicallyScorable: true },
      },
      {
        id: 'balance-stage4-ui', testType: 'four_stage_balance', selectedTest: 'four_stage_balance', status: 'VALID',
        receivedAt: now - 1000, primaryValue: 7.5, metadata: { isClinicallyScorable: true },
        balanceResult: { stageById: {
          side_by_side: { id: 'side_by_side', holdSeconds: 10 },
          semi_tandem: { id: 'semi_tandem', holdSeconds: 9 },
          tandem: { id: 'tandem', holdSeconds: 7.5 },
          one_leg: { id: 'one_leg', holdSeconds: 4.5 },
        } },
      },
    ],
  };

  const progressHtml = renderToStaticMarkup(React.createElement(DisplayProgressScreen, { dashboard }));
  assert.match(progressHtml, />8</, '[S4-UI-HISTORY] stored chair result reaches progress UI');
  assert.match(progressHtml, /7\.5/, '[S4-UI-HISTORY] stored tandem result reaches progress UI');
  assert.match(progressHtml, /Latest Side-by-Side/, '[S5-UI-BALANCE] progress exposes the exact side-by-side stage');
  assert.match(progressHtml, /Latest Semi-Tandem/, '[S5-UI-BALANCE] progress exposes the exact semi-tandem stage');
  assert.match(progressHtml, /Latest Tandem/, '[S5-UI-BALANCE] progress emphasizes the tandem stage');
  assert.match(progressHtml, /Latest One-Leg/, '[S5-UI-BALANCE] progress exposes the exact one-leg stage');
  assert.match(progressHtml, /unavailable on this PC/i, '[S5-UI-MOBILE-AUTHORITY] PC explicitly marks care information unavailable');
  assert.doesNotMatch(progressHtml, /1 of 3|Dizziness|No recent safety events|Not scheduled/, '[S5-UI-NO-INFERENCE] progress does not infer Mobile-only care state');

  const reportsHtml = renderToStaticMarkup(React.createElement(DisplayReportsScreen, { dashboard }));
  assert.match(reportsHtml, /Reports are available on your phone/, '[S5-UI-MOBILE-AUTHORITY] reports route points to the phone');
  assert.match(reportsHtml, /locally stored Room data/, '[S5-UI-MOBILE-AUTHORITY] report authority stays with Mobile storage');
  assert.match(reportsHtml, /give consent in the phone app/, '[S5-UI-CONSENT] sharing consent stays on Mobile');
  assert.doesNotMatch(reportsHtml, /Advance Reassessment|Consecutive Decline|Export Report|Share With Caregiver/, '[S5-UI-NO-INFERENCE] Web neither projects nor acts on Mobile report state');

  const emptyHtml = renderToStaticMarkup(React.createElement(DisplayProgressScreen, { dashboard: { historyItems: [] } }));
  assert.match(emptyHtml, /No movement history yet/, '[S4-UI-EMPTY] missing history produces explicit empty state');
  assert.match(emptyHtml, /Waiting for Mobile data/, '[S4-UI-EMPTY] missing projection is not replaced by a demo state');
  assert.doesNotMatch(emptyHtml, /Moderate Support Needs/, '[S4-UI-NO-FALLBACK] missing clinical data does not default to moderate');

  const canonicalDashboard = {
    session: {
      profile: { id: 'profile-stage6-e2e', displayName: 'Canonical User', birthYear: 1956, sex: 'FEMALE' },
      assessmentSession: {
        status: 'COMPLETED',
        steadi: { status: 'SCORED', riskLevel: 'MODERATE' },
        functionalTests: {
          CHAIR_STAND_30S: {
            acceptedResult: {
              status: 'VALID',
              chairStand: { completedRepetitions: 9, cdcScoredRepetitions: 0 },
            },
          },
          FOUR_STAGE_BALANCE: {
            acceptedResult: {
              status: 'VALID',
              balance: {
                stages: [
                  { stage: 'SIDE_BY_SIDE', holdSeconds: 10, status: 'PASSED' },
                  { stage: 'SEMI_TANDEM', holdSeconds: 10, status: 'PASSED' },
                  { stage: 'TANDEM', holdSeconds: 7.25, status: 'FAILED' },
                  { stage: 'ONE_LEG', holdSeconds: 0, status: 'NOT_ATTEMPTED' },
                ],
              },
            },
          },
        },
        exercisePrescription: {
          status: 'ACTIVE',
          plan: {
            status: 'ACTIVE',
            riskLevel: 'MODERATE',
            selectedExercises: [
              { exerciseId: 'S1', displayName: 'Front knee strengthening' },
              { exerciseId: 'B5', displayName: 'Tandem stance' },
            ],
          },
        },
      },
    },
    finalResult: {
      stage2Result: { assessmentType: 'FOUR_STAGE_BALANCE', status: 'VALID' },
    },
    historyItems: [],
  };
  const resultHtml = renderToStaticMarkup(React.createElement(DisplayResultsSummaryScreen, { dashboard: canonicalDashboard }));
  assert.match(resultHtml, /Moderate Support Needs/, '[S6-E2E-01] result screen renders canonical STEADI risk');
  assert.match(resultHtml, /You completed 0 valid stands/, '[S6-E2E-01] zero is displayed as measured rather than missing');
  assert.match(resultHtml, /Feet Side by Side/, '[S6-E2E-01] uppercase canonical balance stage IDs render');
  assert.match(resultHtml, /7\.3 seconds/, '[S6-E2E-01] canonical tandem seconds reach the result view');
  assert.doesNotMatch(resultHtml, /Assessment Needs Review/, '[S6-E2E-01] current canonical state is not replaced by a legacy final-result fallback');

  console.log('Stage 4 progress/report product integration checks passed.');
} finally {
  await server.close();
}
