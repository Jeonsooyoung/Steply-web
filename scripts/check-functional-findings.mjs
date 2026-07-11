import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});

try {
  const {
    ArmUseStates,
    AssessmentEventTypes,
    AssessmentResultStatuses,
    AssessmentTypes,
    BalanceMeasurementKind,
    BalanceStageStatuses,
    BalanceStages,
    ChairStandFinalStates,
    ChairStandMeasurementKind,
    EvidenceKinds,
    FindingClassifications,
    PartialRepetitionRuleStatuses,
    ResultSources,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const {
    FunctionalFindingTypes,
    createFunctionalFindings,
  } = await server.ssrLoadModule('/client/src/pipeline/findings/functionalFindings.js');

  function event({ assessmentType, type = AssessmentEventTypes.AssessmentCompleted, timestampMs = 30_000 } = {}) {
    return {
      eventId: `event-${assessmentType}-${type}-${timestampMs}`,
      sessionId: 'session-1',
      assessmentType,
      type,
      timestampMs,
      confidence: 0.9,
      evidence: type === AssessmentEventTypes.AssessmentCompleted
        ? { kind: EvidenceKinds.Duration, durationMs: 30_000, requiredDurationMs: 30_000 }
        : { kind: EvidenceKinds.StateTransition, from: 'before', to: 'after' },
    };
  }

  function chairAssessment({
    reps = 12,
    armUse = ArmUseStates.NotDetected,
    status = AssessmentResultStatuses.Valid,
    confidence = 0.92,
    secondaryObservations = {},
  } = {}) {
    return {
      resultId: 'chair-result',
      assessmentId: 'assessment-chair',
      sessionId: 'session-1',
      assessmentType: AssessmentTypes.ChairStand30s,
      status,
      resultType: 'STRUCTURED_ASSESSMENT_RESULT',
      metadata: {
        source: ResultSources.LivePose,
        isPersistable: status === AssessmentResultStatuses.Valid,
        isClinicallyScorable: status === AssessmentResultStatuses.Valid,
        analyzerVersion: 'test',
        schemaVersion: 'test',
        generatedAtMs: 31_000,
      },
      timing: {
        startedAtMs: 1_000,
        completedAtMs: 31_000,
        activeAnalysisDurationMs: 30_000,
        pausedDurationMs: 0,
      },
      primaryMeasurements: {
        kind: ChairStandMeasurementKind,
        durationSeconds: 30,
        completedRepetitions: reps,
        partialRepetitionCredit: 0,
        partialRepetitionRuleStatus: PartialRepetitionRuleStatuses.NotApplicable,
        armUse,
        finalState: ChairStandFinalStates.Sit,
      },
      secondaryObservations,
      qualitySummary: {
        trackingQualityScore: confidence,
      },
      events: [
        ...(armUse === ArmUseStates.Confirmed ? [event({ assessmentType: AssessmentTypes.ChairStand30s, type: AssessmentEventTypes.ArmUseConfirmed, timestampMs: 10_000 })] : []),
        event({ assessmentType: AssessmentTypes.ChairStand30s }),
      ],
      confidence,
    };
  }

  function stage(stageId, {
    status = BalanceStageStatuses.Passed,
    hold = 10,
    confidence = 0.9,
    failureReason,
  } = {}) {
    return {
      stage: stageId,
      status,
      holdDurationSeconds: hold,
      positionConfidence: confidence,
      ...(failureReason ? { failureReason } : {}),
    };
  }

  function balanceAssessment({
    stages = [
      stage(BalanceStages.SideBySide),
      stage(BalanceStages.SemiTandem),
      stage(BalanceStages.Tandem),
      stage(BalanceStages.OneLeg),
    ],
    status = AssessmentResultStatuses.Valid,
    confidence = 0.92,
    secondaryObservations = {},
  } = {}) {
    return {
      resultId: 'balance-result',
      assessmentId: 'assessment-balance',
      sessionId: 'session-1',
      assessmentType: AssessmentTypes.FourStageBalance,
      status,
      resultType: 'STRUCTURED_ASSESSMENT_RESULT',
      metadata: {
        source: ResultSources.LivePose,
        isPersistable: status === AssessmentResultStatuses.Valid,
        isClinicallyScorable: status === AssessmentResultStatuses.Valid,
        analyzerVersion: 'test',
        schemaVersion: 'test',
        generatedAtMs: 31_000,
      },
      timing: {
        startedAtMs: 1_000,
        completedAtMs: 31_000,
        activeAnalysisDurationMs: 30_000,
        pausedDurationMs: 0,
      },
      primaryMeasurements: {
        kind: BalanceMeasurementKind,
        stages,
        lastAttemptedStage: stages.findLast((item) => item.status !== BalanceStageStatuses.NotAttempted)?.stage,
      },
      secondaryObservations,
      qualitySummary: {
        trackingQualityScore: confidence,
      },
      events: [event({ assessmentType: AssessmentTypes.FourStageBalance })],
      confidence,
    };
  }

  const profile = { ageYears: 70, gender: 'female' };

  function run({ chair = chairAssessment(), balance = balanceAssessment(), customProfile = profile } = {}) {
    return createFunctionalFindings({
      assessmentResults: [chair, balance],
      profile: customProfile,
    });
  }

  function typesOf(result) {
    return result.value.map((finding) => finding.findingType);
  }

  function assertTraceable(result) {
    for (const finding of result.value) {
      assert.ok(finding.assessmentId, `${finding.findingType} has assessmentId`);
      assert.ok(finding.evidence.assessmentType, `${finding.findingType} has assessment type`);
      assert.ok(finding.evidence.measurementKeys.length > 0, `${finding.findingType} has measurement keys`);
      assert.ok(Object.keys(finding.evidence.observedValues).length > 0, `${finding.findingType} has observed values`);
      assert.ok(finding.evidence.comparisonReference, `${finding.findingType} has comparison reference`);
      assert.equal(typeof finding.confidence, 'number', `${finding.findingType} has confidence`);
      assert.ok([FindingClassifications.Primary, FindingClassifications.Secondary].includes(finding.classification), `${finding.findingType} has classification`);
    }
  }

  function assertNoDiagnosisLanguage(result) {
    const text = JSON.stringify(result.value).toLowerCase();
    const banned = [
      'gluteus',
      'proprioception',
      'hip extensor',
      'hip_extensor',
      'neurological',
      'will fall',
      'impaired',
      'weakness',
      'weak',
    ];
    for (const word of banned) {
      assert.equal(text.includes(word), false, `diagnostic or muscle-specific language leaked: ${word}`);
    }
  }

  let result = run();
  assert.equal(result.validation.ok, true, 'normal assessments validate');
  assert.deepEqual(typesOf(result), [], 'normal chair and balance produce no findings');

  result = run({ chair: chairAssessment({ reps: 9 }) });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.ChairStandBelowReference], 'chair below reference finding');

  result = run({ chair: chairAssessment({ armUse: ArmUseStates.Confirmed }) });
  assert.ok(typesOf(result).includes(FunctionalFindingTypes.ArmSupportRequired), 'confirmed arm use finding');

  result = run({
    balance: balanceAssessment({
      stages: [
        stage(BalanceStages.SideBySide),
        stage(BalanceStages.SemiTandem),
        stage(BalanceStages.Tandem, { status: BalanceStageStatuses.Failed, hold: 6 }),
        stage(BalanceStages.OneLeg, { status: BalanceStageStatuses.NotAttempted, hold: 0 }),
      ],
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.TandemHoldDifficulty], 'tandem-only failure finding');

  result = run({
    balance: balanceAssessment({
      stages: [
        stage(BalanceStages.SideBySide, { status: BalanceStageStatuses.Failed, hold: 3 }),
        stage(BalanceStages.SemiTandem, { status: BalanceStageStatuses.NotAttempted, hold: 0 }),
        stage(BalanceStages.Tandem, { status: BalanceStageStatuses.NotAttempted, hold: 0 }),
        stage(BalanceStages.OneLeg, { status: BalanceStageStatuses.NotAttempted, hold: 0 }),
      ],
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.BasicBalanceDifficulty], 'side-by-side failure finding');

  result = run({
    balance: balanceAssessment({
      stages: [
        stage(BalanceStages.SideBySide),
        stage(BalanceStages.SemiTandem),
        stage(BalanceStages.Tandem),
        stage(BalanceStages.OneLeg, { status: BalanceStageStatuses.Failed, hold: 4 }),
      ],
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.SingleLegHoldDifficulty], 'one-leg-only failure finding');

  result = run({
    chair: chairAssessment({
      secondaryObservations: {
        speedChangeRatio: 1.35,
        speedChangeConfidence: 0.9,
      },
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.LateRepetitionSlowdown], 'speed slowdown only secondary observation');
  assert.equal(result.value[0].classification, FindingClassifications.Secondary);

  result = run({
    chair: chairAssessment({
      secondaryObservations: {
        maxTrunkLeanDegrees: 24,
        trunkLeanConfidence: 0.88,
      },
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.TrunkCompensationPattern], 'trunk pattern only secondary observation');

  result = run({
    chair: chairAssessment({
      secondaryObservations: {
        maxLeftRightKneeAngleDifferenceDegrees: 28,
        asymmetryConfidence: 0.4,
      },
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.LowMeasurementConfidence], 'low confidence asymmetry is not converted to a specific finding');
  assert.deepEqual(result.value[0].recommendationTags, [], 'low confidence finding does not add specific exercise tags');

  result = run({
    chair: chairAssessment({ status: AssessmentResultStatuses.Invalid, reps: 3 }),
  });
  assert.equal(result.validation.ok, false, 'invalid assessment blocks findings');
  assert.deepEqual(result.value, [], 'invalid assessment creates no vulnerable-area finding');

  result = run({
    chair: chairAssessment({
      secondaryObservations: {
        speedChangeRatio: 1.4,
        speedChangeConfidence: 0.9,
        contradictorySpeedPattern: true,
      },
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.LowMeasurementConfidence], 'conflicting secondary observation becomes measurement-confidence finding only');

  result = run({
    balance: balanceAssessment({
      secondaryObservations: {
        swayObservation: {
          mediolateralRangeFootLengths: 1.5,
          anteriorPosteriorRangeFootLengths: 1.6,
          confidence: 0.9,
        },
      },
    }),
  });
  assert.deepEqual(typesOf(result).sort(), [
    FunctionalFindingTypes.AnteriorPosteriorSwayPattern,
    FunctionalFindingTypes.MediolateralSwayPattern,
  ].sort(), 'sway observations are secondary only');

  result = run({
    balance: balanceAssessment({
      secondaryObservations: {
        positionCorrectionCount: 3,
        positionCorrectionConfidence: 0.9,
      },
    }),
  });
  assert.deepEqual(typesOf(result), [FunctionalFindingTypes.FrequentPositionCorrection], 'frequent position correction secondary observation');

  const allResults = [
    run({ chair: chairAssessment({ reps: 9 }) }),
    run({ chair: chairAssessment({ armUse: ArmUseStates.Confirmed }) }),
    run({ chair: chairAssessment({ secondaryObservations: { maxTrunkLeanDegrees: 24 } }) }),
    run({ balance: balanceAssessment({ stages: [stage(BalanceStages.SideBySide, { status: BalanceStageStatuses.Failed, hold: 3 })] }) }),
  ];
  for (const item of allResults) {
    assert.equal(item.validation.ok, true, JSON.stringify(item.validation.failures));
    assertTraceable(item);
    assertNoDiagnosisLanguage(item);
  }

  console.log('Functional findings checks passed.');
} finally {
  await server.close();
}
