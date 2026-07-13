import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const scorerModulePath = path.join(root, 'client/src/pipeline/scoring/steadi/steadiSessionScorer.js');
const sessionModule = require('../shared/stage1Assessment.cjs');
const schemaPath = path.join(root, 'docs/schemas/assessment-session.schema.json');
const updateSchemaPath = path.join(root, 'docs/schemas/assessment-session-update.schema.json');

assert.doesNotThrow(
  () => JSON.parse(fs.readFileSync(schemaPath, 'utf8')),
  'assessment_session.v1 JSON Schema must be valid JSON',
);
assert.doesNotThrow(
  () => JSON.parse(fs.readFileSync(updateSchemaPath, 'utf8')),
  'assessment-session.updated envelope JSON Schema must be valid JSON',
);

function expectedRisk({ step1AtRisk, step2Problem, fallCount, injuriousFall }) {
  if (!step1AtRisk || !step2Problem) return 'LOW';
  if (injuriousFall || fallCount === 'TWO_OR_MORE') return 'HIGH';
  return 'MODERATE';
}

function input({
  fallenPastYear = false,
  feelsUnsteady = false,
  worriedAboutFalling = false,
  fallCount = 'ZERO',
  injuriousFall = false,
  ageYears = 70,
  sex = 'FEMALE',
  chairStatus = 'VALID',
  completedRepetitions = 10,
  armUseConfirmed = false,
  balanceStatus = 'VALID',
  tandemHoldSeconds = 10,
} = {}) {
  return {
    screening: {
      fallenPastYear,
      feelsUnsteady,
      worriedAboutFalling,
      fallCount,
      injuriousFall,
    },
    profile: { ageYears, sex },
    chairStand: chairStatus === null
      ? null
      : { status: chairStatus, completedRepetitions, armUseConfirmed },
    balance: balanceStatus === null
      ? null
      : { status: balanceStatus, tandemHoldSeconds },
  };
}

function assertScored(result, expected, label) {
  assert.equal(result.riskLevel, expected.riskLevel, `${label}: riskLevel`);
  assert.equal(result.step1AtRisk, expected.step1AtRisk, `${label}: step1AtRisk`);
  assert.equal(result.step2Problem, expected.step2Problem, `${label}: step2Problem`);
  assert.equal(result.strengthProblem, expected.strengthProblem, `${label}: strengthProblem`);
  assert.equal(result.balanceProblem, expected.balanceProblem, `${label}: balanceProblem`);
  assert.notEqual(result.riskLevel, 'NOT_SCORABLE', `${label}: complete input must be scorable`);
}

function assertNotScorable(scoreSteadiAssessmentSession, overrides, label) {
  const result = scoreSteadiAssessmentSession(input(overrides));
  assert.equal(result.riskLevel, 'NOT_SCORABLE', `${label}: riskLevel`);
  assert.equal(result.strengthProblem, null, `${label}: strengthProblem must be null`);
  assert.equal(result.balanceProblem, null, `${label}: balanceProblem must be null`);
  assert.ok(Array.isArray(result.reasonCodes) && result.reasonCodes.length > 0, `${label}: reasonCodes required`);
}

try {
  let scorerModule;
  try {
    scorerModule = await import(pathToFileURL(scorerModulePath).href);
  } catch (error) {
    throw new Error(
      `Stage 1 scorer module is required at ${scorerModulePath}. `
      + 'It must export scoreSteadiAssessmentSession(input), FallCount, Sex, and RiskLevel.',
      { cause: error },
    );
  }

  const {
    scoreSteadiAssessmentSession,
    FallCount,
    Sex,
    RiskLevel,
  } = scorerModule;
  assert.equal(typeof scoreSteadiAssessmentSession, 'function', 'scoreSteadiAssessmentSession export is required');
  assert.deepEqual(
    new Set(Object.values(FallCount || {})),
    new Set(['ZERO', 'ONE', 'TWO_OR_MORE']),
    'FallCount must use the canonical vocabulary',
  );
  assert.deepEqual(
    new Set(Object.values(Sex || {})),
    new Set(['MALE', 'FEMALE']),
    'Sex must use the canonical CDC table vocabulary',
  );
  assert.deepEqual(
    new Set(Object.values(RiskLevel || {})),
    new Set(['NOT_SCORABLE', 'LOW', 'MODERATE', 'HIGH']),
    'RiskLevel must use the canonical vocabulary',
  );

  const step1Combinations = [];
  for (const fallenPastYear of [false, true]) {
    for (const feelsUnsteady of [false, true]) {
      for (const worriedAboutFalling of [false, true]) {
        step1Combinations.push({ fallenPastYear, feelsUnsteady, worriedAboutFalling });
      }
    }
  }
  assert.equal(step1Combinations.length, 8);

  const step2Combinations = [
    { strengthProblem: false, balanceProblem: false, completedRepetitions: 10, tandemHoldSeconds: 10 },
    { strengthProblem: true, balanceProblem: false, completedRepetitions: 9, tandemHoldSeconds: 10 },
    { strengthProblem: false, balanceProblem: true, completedRepetitions: 10, tandemHoldSeconds: 9.999 },
    { strengthProblem: true, balanceProblem: true, completedRepetitions: 9, tandemHoldSeconds: 9.999 },
  ];
  const fallHistories = [
    { fallCount: FallCount.ZERO, injuriousFall: false },
    { fallCount: FallCount.ONE, injuriousFall: false },
    { fallCount: FallCount.ONE, injuriousFall: true },
    { fallCount: FallCount.TWO_OR_MORE, injuriousFall: false },
  ];

  let decisionCaseCount = 0;
  for (const screening of step1Combinations) {
    const step1AtRisk = Object.values(screening).some(Boolean);
    for (const functional of step2Combinations) {
      const step2Problem = functional.strengthProblem || functional.balanceProblem;
      for (const fallHistory of fallHistories) {
        decisionCaseCount += 1;
        const label = `decision-${decisionCaseCount}`;
        const result = scoreSteadiAssessmentSession(input({
          ...screening,
          ...fallHistory,
          completedRepetitions: functional.completedRepetitions,
          tandemHoldSeconds: functional.tandemHoldSeconds,
        }));
        assertScored(result, {
          riskLevel: expectedRisk({ step1AtRisk, step2Problem, ...fallHistory }),
          step1AtRisk,
          step2Problem,
          strengthProblem: functional.strengthProblem,
          balanceProblem: functional.balanceProblem,
        }, label);
      }
    }
  }
  assert.equal(decisionCaseCount, 128, 'full Step 1 x Step 2 x fall-history table must run');

  const cdcRows = {
    MALE: [
      [60, 64, 14], [65, 69, 12], [70, 74, 12], [75, 79, 11],
      [80, 84, 10], [85, 89, 8], [90, 94, 7],
    ],
    FEMALE: [
      [60, 64, 12], [65, 69, 11], [70, 74, 10], [75, 79, 10],
      [80, 84, 9], [85, 89, 8], [90, 94, 4],
    ],
  };
  let thresholdCaseCount = 0;
  for (const [sex, rows] of Object.entries(cdcRows)) {
    for (const [minAge, maxAge, cutoff] of rows) {
      for (const ageYears of [minAge, maxAge]) {
        for (const [completedRepetitions, expectedStrengthProblem] of [
          [cutoff - 1, true],
          [cutoff, false],
          [cutoff + 1, false],
        ]) {
          thresholdCaseCount += 1;
          const result = scoreSteadiAssessmentSession(input({
            ageYears,
            sex,
            completedRepetitions,
          }));
          assert.equal(result.strengthProblem, expectedStrengthProblem, `CDC ${sex} ${ageYears} reps=${completedRepetitions}`);
        }
      }
    }
  }
  assert.equal(thresholdCaseCount, 84, 'both endpoints of all 14 CDC age/sex bands must run');

  for (const [tandemHoldSeconds, expectedBalanceProblem] of [
    [9.999, true],
    [10, false],
    [10.001, false],
  ]) {
    const result = scoreSteadiAssessmentSession(input({ tandemHoldSeconds }));
    assert.equal(result.balanceProblem, expectedBalanceProblem, `tandem boundary ${tandemHoldSeconds}`);
  }

  const armUse = scoreSteadiAssessmentSession(input({
    completedRepetitions: 20,
    armUseConfirmed: true,
  }));
  assert.equal(armUse.strengthProblem, true, 'confirmed arm use applies the official 0 score');

  assertNotScorable(scoreSteadiAssessmentSession, { fallenPastYear: null }, 'missing Q1');
  assertNotScorable(scoreSteadiAssessmentSession, { feelsUnsteady: null }, 'missing Q2');
  assertNotScorable(scoreSteadiAssessmentSession, { worriedAboutFalling: null }, 'missing Q3');
  assertNotScorable(scoreSteadiAssessmentSession, { fallCount: null }, 'missing fall count');
  assertNotScorable(scoreSteadiAssessmentSession, { fallenPastYear: true, injuriousFall: null }, 'missing injury response');
  assertNotScorable(scoreSteadiAssessmentSession, { ageYears: null }, 'missing age');
  assertNotScorable(scoreSteadiAssessmentSession, { sex: null }, 'missing sex');
  assertNotScorable(scoreSteadiAssessmentSession, { ageYears: 59 }, 'age below CDC table');
  assertNotScorable(scoreSteadiAssessmentSession, { ageYears: 95 }, 'age above CDC table');
  assertNotScorable(scoreSteadiAssessmentSession, { chairStatus: null }, 'chair test absent');
  assertNotScorable(scoreSteadiAssessmentSession, { balanceStatus: null }, 'balance test absent');
  assertNotScorable(scoreSteadiAssessmentSession, { chairStatus: 'INVALID' }, 'chair test invalid');
  assertNotScorable(scoreSteadiAssessmentSession, { balanceStatus: 'INVALID' }, 'balance test invalid');
  assertNotScorable(scoreSteadiAssessmentSession, { completedRepetitions: null }, 'chair measurement missing');
  assertNotScorable(scoreSteadiAssessmentSession, { tandemHoldSeconds: null }, 'tandem measurement missing');

  {
    const {
      AssessmentSessionEventTypes,
      FunctionalTestSlots,
      createAssessmentSession,
      reduceAssessmentSession,
    } = sessionModule;
    assert.equal(typeof createAssessmentSession, 'function', 'createAssessmentSession export is required');
    assert.equal(typeof reduceAssessmentSession, 'function', 'reduceAssessmentSession export is required');

    let session = createAssessmentSession({
      assessmentSessionId: 'assessment-session-check',
      connectionSessionId: 'connection-session-check',
      profile: { userId: 'profile-check', ageYears: 70, sex: Sex.FEMALE },
      createdAt: 1_000,
    });
    assert.equal(session.revision, 0);
    assert.equal(session.steadi.riskLevel, RiskLevel.NotScorable);
    assert.equal(session.exercisePrescription.status, 'NOT_GENERATED');

    const clockSkewSession = reduceAssessmentSession(createAssessmentSession({
      assessmentSessionId: 'assessment-clock-skew-check',
      connectionSessionId: 'connection-clock-skew-check',
      profile: { userId: 'profile-clock-skew-check', ageYears: 70, sex: Sex.FEMALE },
      createdAt: 2_000,
    }), {
      type: AssessmentSessionEventTypes.ProfileUpdated,
      messageId: 'clock-skew-profile-update',
      at: 1_500,
      profile: { userId: 'profile-clock-skew-check', ageYears: 70, sex: Sex.FEMALE },
    });
    assert.equal(clockSkewSession.updatedAt, 2_000, 'PC clock skew cannot move a phone-created session timestamp backwards');

    session = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.ScreeningUpdated,
      messageId: 'screening-1',
      expectedRevision: 0,
      at: 1_100,
      screening: {
        fallenPastYear: false,
        feelsUnsteady: true,
        worriedAboutFalling: false,
        fallCount: FallCount.ZERO,
        injuriousFall: false,
      },
    });
    assert.equal(session.revision, 1);

    session = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestResultAccepted,
      messageId: 'chair-result-1',
      expectedRevision: 1,
      slot: FunctionalTestSlots.ChairStand,
      attemptId: 'chair-attempt-1',
      resultKey: 'chair-result-key-1',
      analysisSessionId: 'chair-analysis-1',
      startedAt: 1_200,
      completedAt: 31_200,
      acceptedResult: {
        resultId: 'chair-result-key-1',
        attemptId: 'chair-attempt-1',
        analysisSessionId: 'chair-analysis-1',
        assessmentType: 'CHAIR_STAND_30S',
        status: 'VALID',
        source: 'LIVE_POSE',
        completedRepetitions: 9,
        armUseConfirmed: false,
        completedAt: 31_200,
      },
    });
    assert.equal(session.revision, 2);
    assert.equal(session.steadi.riskLevel, RiskLevel.NotScorable, 'one test cannot produce final STEADI risk');
    assert.equal(session.exercisePrescription.status, 'NOT_GENERATED', 'one test cannot generate exercise prescription');

    const duplicateMessage = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestNeedsRetry,
      messageId: 'chair-result-1',
      slot: FunctionalTestSlots.ChairStand,
    });
    assert.equal(duplicateMessage.revision, 2, 'duplicate message does not increment revision');

    const revisionConflict = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestNeedsRetry,
      messageId: 'revision-conflict',
      expectedRevision: 1,
      slot: FunctionalTestSlots.ChairStand,
    });
    assert.equal(revisionConflict.revision, 2, 'revision conflict does not mutate session');

    const duplicateResult = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestResultAccepted,
      messageId: 'chair-result-duplicate-delivery',
      slot: FunctionalTestSlots.ChairStand,
      attemptId: 'chair-attempt-1',
      resultKey: 'chair-result-key-1',
      completedAt: 31_200,
      acceptedResult: {
        resultId: 'chair-result-key-1',
        attemptId: 'chair-attempt-1',
        analysisSessionId: 'chair-analysis-1',
        assessmentType: 'CHAIR_STAND_30S',
        status: 'VALID',
        source: 'LIVE_POSE',
        completedRepetitions: 9,
        armUseConfirmed: false,
        completedAt: 31_200,
      },
    });
    assert.equal(duplicateResult.revision, 2, 'duplicate test result does not increment revision');

    const staleResult = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestResultAccepted,
      messageId: 'chair-result-stale',
      slot: FunctionalTestSlots.ChairStand,
      attemptId: 'chair-attempt-stale',
      resultKey: 'chair-result-key-stale',
      completedAt: 30_000,
      acceptedResult: {
        resultId: 'chair-result-key-stale',
        attemptId: 'chair-attempt-stale',
        analysisSessionId: 'chair-analysis-stale',
        assessmentType: 'CHAIR_STAND_30S',
        status: 'VALID',
        source: 'LIVE_POSE',
        completedRepetitions: 20,
        armUseConfirmed: false,
        completedAt: 30_000,
      },
    });
    assert.equal(staleResult.revision, 2, 'stale test result does not increment revision');

    session = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestResultAccepted,
      messageId: 'balance-result-1',
      expectedRevision: 2,
      slot: FunctionalTestSlots.FourStageBalance,
      attemptId: 'balance-attempt-1',
      resultKey: 'balance-result-key-1',
      analysisSessionId: 'balance-analysis-1',
      startedAt: 32_000,
      completedAt: 72_000,
      acceptedResult: {
        resultId: 'balance-result-key-1',
        attemptId: 'balance-attempt-1',
        analysisSessionId: 'balance-analysis-1',
        assessmentType: 'FOUR_STAGE_BALANCE',
        status: 'VALID',
        source: 'LIVE_POSE',
        tandemHoldSeconds: 10,
        completedAt: 72_000,
        stages: [
          { stage: 'SIDE_BY_SIDE', analysisSessionId: 'balance-analysis-1' },
          { stage: 'SEMI_TANDEM', analysisSessionId: 'balance-analysis-1' },
          { stage: 'TANDEM', analysisSessionId: 'balance-analysis-1' },
          { stage: 'ONE_LEG', analysisSessionId: 'balance-analysis-1' },
        ],
      },
    });
    assert.equal(session.revision, 3);
    assert.equal(session.status, 'COMPLETED');
    assert.equal(session.steadi.riskLevel, RiskLevel.Moderate);
    assert.ok(
      session.functionalTests[FunctionalTestSlots.FourStageBalance].acceptedResult.stages.every(
        (stage) => stage.analysisSessionId === 'balance-analysis-1',
      ),
      'all four balance stages retain one analysisSessionId',
    );

    const newerRetry = reduceAssessmentSession(session, {
      type: AssessmentSessionEventTypes.TestResultAccepted,
      messageId: 'chair-result-2',
      expectedRevision: 3,
      slot: FunctionalTestSlots.ChairStand,
      attemptId: 'chair-attempt-2',
      resultKey: 'chair-result-key-2',
      completedAt: 80_000,
      acceptedResult: {
        resultId: 'chair-result-key-2',
        attemptId: 'chair-attempt-2',
        analysisSessionId: 'chair-analysis-2',
        assessmentType: 'CHAIR_STAND_30S',
        status: 'VALID',
        source: 'LIVE_POSE',
        completedRepetitions: 10,
        armUseConfirmed: false,
        completedAt: 80_000,
      },
    });
    assert.equal(newerRetry.revision, 4, 'newer retry supersedes the accepted attempt');
    assert.equal(newerRetry.functionalTests[FunctionalTestSlots.ChairStand].acceptedAttemptId, 'chair-attempt-2');
    assert.equal(newerRetry.steadi.riskLevel, RiskLevel.Low, 'retry deterministically recomputes session risk');
    assert.equal(newerRetry.schemaVersion, 'assessment_session.v2');
    assert.equal(newerRetry.profileSnapshot.sex, Sex.FEMALE);
    assert.ok(newerRetry.screening.responses);
    assert.ok(newerRetry.screening.fallHistory);
    assert.ok(newerRetry.functionalTests.FOUR_STAGE_BALANCE);
    assert.ok(newerRetry.functionalTests.CHAIR_STAND_30S);
    assert.equal('processedMessageIds' in newerRetry, false, 'wire snapshot must not leak reducer dedup storage');
    assert.equal('messageId' in newerRetry, false, 'messageId belongs to the update envelope');
  }

  console.log(`AssessmentSession checks passed: ${decisionCaseCount} decision cases, ${thresholdCaseCount} CDC boundary cases.`);
} finally {
  // No external resources are held; this block keeps failures grouped with the
  // module-contract diagnostics above.
}
