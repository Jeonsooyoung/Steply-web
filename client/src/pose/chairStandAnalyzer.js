import { PoseLandmarks, RequiredChairStandLandmarks } from './poseLandmarks';
import { SteadiAssessmentRules } from './steadiRules';
import { calculateRecommendationLevel } from './recommendationRules';

const ChairStandPosePhase = {
  Unknown: 'unknown',
  Seated: 'seated',
  Rising: 'rising',
  Standing: 'standing',
};

const MIN_LANDMARK_VISIBILITY = 0.45;
const REQUIRED_STABLE_FRAMES = 2;
const ARM_SUPPORT_DISQUALIFY_FRAMES = 3;
const ARM_SUPPORT_Y_MARGIN = 0.05;
const STANDING_KNEE_ANGLE = 150;
const SEATED_KNEE_ANGLE = 128;
const HALFWAY_KNEE_ANGLE = 138;
const STANDING_HIP_MARGIN = 0.08;
const RISING_HIP_MARGIN = 0.04;
const SEATED_HIP_MARGIN = 0.03;
const HALFWAY_HIP_MARGIN = 0.03;
const TRUNK_WARNING_SCORE = 0.55;
const STABILITY_WARNING_SCORE = 0.45;
const STABILITY_SAMPLE_LIMIT = 20;
const MIN_STABILITY_SAMPLES = 4;
const MIN_VECTOR_MAGNITUDE = 0.0001;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const averageOrNull = (values) => values.length ? clamp(values.reduce((sum, v) => sum + v, 0) / values.length, 0, 1) : null;
const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function angleDegrees(first, center, third) {
  const firstVectorX = first.x - center.x;
  const firstVectorY = first.y - center.y;
  const secondVectorX = third.x - center.x;
  const secondVectorY = third.y - center.y;
  const dot = firstVectorX * secondVectorX + firstVectorY * secondVectorY;
  const magnitude = Math.max(
    Math.hypot(firstVectorX, firstVectorY) * Math.hypot(secondVectorX, secondVectorY),
    MIN_VECTOR_MAGNITUDE,
  );
  return Math.acos(clamp(dot / magnitude, -1, 1)) * 180 / Math.PI;
}

function defaultState(repetitionCount = 0) {
  return {
    repetitionCount,
    primaryValue: repetitionCount,
    primaryLabel: 'Chair Stands',
    elapsedSeconds: 0,
    durationSeconds: SteadiAssessmentRules.ChairStandDurationSeconds,
    confidence: 0,
    isFullBodyVisible: false,
    warningMessage: 'Move back so the full body is visible in the camera.',
    postureMessage: 'When camera analysis is ready, standing reps will be counted automatically.',
    isArmUseSuspected: false,
    isStandingOrRising: false,
    phase: ChairStandPosePhase.Unknown,
  };
}

export class MediaPipeChairStandAnalyzer {
  constructor({ durationSeconds = SteadiAssessmentRules.ChairStandDurationSeconds } = {}) {
    this.durationSeconds = durationSeconds;
    this.reset();
  }

  startSession(userId = 'remote-user', startedAt = Date.now()) {
    this.reset();
    this.userId = userId;
    this.startedAt = startedAt;
    this.latestTimestampMs = startedAt;
  }

  addFrame(frame) {
    if (!this.startedAt) return this.latestState;
    this.latestTimestampMs = frame.timestampMs;
    const features = this.toChairStandFeatures(frame);
    this.latestFeatures = features;

    if (!features) {
      this.latestState = this.stateForMissingPose(frame.timestampMs);
      return this.latestState;
    }

    this.confidenceSamples.push(features.confidence);
    this.trunkLeanSamples.push(features.trunkLeanScore);
    this.symmetrySamples.push(features.symmetryScore);
    this.stabilitySamples.push(features.stabilityScore);
    this.rememberBodyCenter(features.bodyCenter);

    this.updateArmRule(features);
    this.updateRepetitionCount(frame.timestampMs, features);
    this.latestState = this.featuresToState({
      features,
      timestampMs: frame.timestampMs,
      repetitionCount: this.repetitionCount,
      elapsedSeconds: this.elapsedSeconds(frame.timestampMs),
      armUseDisqualified: this.armUseDisqualified,
    });
    return this.latestState;
  }

  addManualRepetition() {
    if (!this.startedAt || this.armUseDisqualified) return this.latestState;
    this.repetitionCount += 1;
    this.countedAtMs.push(Date.now());
    this.latestState = { ...this.latestState, repetitionCount: this.repetitionCount, primaryValue: this.repetitionCount };
    return this.latestState;
  }

  getCurrentState(nowMs = Date.now()) {
    return { ...this.latestState, elapsedSeconds: this.elapsedSeconds(nowMs) };
  }

  finishSession(completedAt = Date.now()) {
    const finalRepetitionCount = this.armUseDisqualified
      ? 0
      : this.repetitionCount + this.finalHalfStandCredit();

    const repIntervalsSeconds = this.countedAtMs
      .slice(1)
      .map((time, index) => (time - this.countedAtMs[index]) / 1000)
      .filter((value) => value > 0);

    return {
      testType: 'chair_stand',
      repetitionCount: finalRepetitionCount,
      primaryValue: finalRepetitionCount,
      primaryLabel: 'Chair Stands',
      durationSeconds: this.durationSeconds,
      averageRepSeconds: finalRepetitionCount > 0 ? this.durationSeconds / finalRepetitionCount : null,
      fastestRepSeconds: repIntervalsSeconds.length ? Math.min(...repIntervalsSeconds) : null,
      slowestRepSeconds: repIntervalsSeconds.length ? Math.max(...repIntervalsSeconds) : null,
      trunkLeanScore: averageOrNull(this.trunkLeanSamples),
      symmetryScore: averageOrNull(this.symmetrySamples),
      stabilityScore: averageOrNull(this.stabilitySamples),
      confidence: averageOrNull(this.confidenceSamples) ?? this.latestState.confidence,
      recommendationLevel: calculateRecommendationLevel(finalRepetitionCount),
      summaryMessage: `${finalRepetitionCount} chair stands measured.`,
      armUseDisqualified: this.armUseDisqualified,
      startedAt: this.startedAt,
      completedAt,
    };
  }

  reset() {
    this.userId = null;
    this.startedAt = null;
    this.latestTimestampMs = null;
    this.latestFeatures = null;
    this.latestState = defaultState();
    this.countedAtMs = [];
    this.confidenceSamples = [];
    this.trunkLeanSamples = [];
    this.symmetrySamples = [];
    this.stabilitySamples = [];
    this.recentBodyCenters = [];
    this.repetitionCount = 0;
    this.readyForNextStand = true;
    this.standingStreak = 0;
    this.seatedStreak = 0;
    this.armSupportFrames = 0;
    this.armUseDisqualified = false;
  }

  updateRepetitionCount(timestampMs, features) {
    this.standingStreak = features.phase === ChairStandPosePhase.Standing ? this.standingStreak + 1 : 0;
    this.seatedStreak = features.phase === ChairStandPosePhase.Seated ? this.seatedStreak + 1 : 0;

    if (this.seatedStreak >= REQUIRED_STABLE_FRAMES) {
      this.readyForNextStand = true;
    }

    if (
      this.readyForNextStand &&
      this.standingStreak >= REQUIRED_STABLE_FRAMES &&
      features.fullBodyVisible &&
      !this.armUseDisqualified
    ) {
      this.repetitionCount += 1;
      this.countedAtMs.push(timestampMs);
      this.readyForNextStand = false;
    }
  }

  updateArmRule(features) {
    const possibleArmSupport = features.phase === ChairStandPosePhase.Rising && features.armSupportLikely;
    this.armSupportFrames = possibleArmSupport
      ? this.armSupportFrames + 1
      : Math.max(this.armSupportFrames - 1, 0);
    if (this.armSupportFrames >= ARM_SUPPORT_DISQUALIFY_FRAMES) {
      this.armUseDisqualified = true;
    }
  }

  finalHalfStandCredit() {
    const features = this.latestFeatures;
    return this.readyForNextStand && features?.halfwayToStanding ? 1 : 0;
  }

  toChairStandFeatures(frame) {
    const visiblePoint = (name) => this.visiblePoint(frame, name);
    const leftShoulder = visiblePoint(PoseLandmarks.LeftShoulder);
    const rightShoulder = visiblePoint(PoseLandmarks.RightShoulder);
    const leftHip = visiblePoint(PoseLandmarks.LeftHip);
    const rightHip = visiblePoint(PoseLandmarks.RightHip);
    const leftKnee = visiblePoint(PoseLandmarks.LeftKnee);
    const rightKnee = visiblePoint(PoseLandmarks.RightKnee);
    const leftAnkle = visiblePoint(PoseLandmarks.LeftAnkle);
    const rightAnkle = visiblePoint(PoseLandmarks.RightAnkle);

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return null;
    }

    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const hipCenter = midpoint(leftHip, rightHip);
    const kneeCenter = midpoint(leftKnee, rightKnee);
    const bodyCenter = {
      x: (shoulderCenter.x + hipCenter.x) / 2,
      y: (shoulderCenter.y + hipCenter.y) / 2,
    };

    const leftKneeAngle = angleDegrees(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = angleDegrees(rightHip, rightKnee, rightAnkle);
    const averageKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const hipAboveKnees = kneeCenter.y - hipCenter.y;
    const fullBodyVisible = RequiredChairStandLandmarks.every((name) => visiblePoint(name));
    const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder), 0.08);

    let phase = ChairStandPosePhase.Unknown;
    if (averageKneeAngle >= STANDING_KNEE_ANGLE && hipAboveKnees >= STANDING_HIP_MARGIN) {
      phase = ChairStandPosePhase.Standing;
    } else if (averageKneeAngle <= SEATED_KNEE_ANGLE || hipAboveKnees < SEATED_HIP_MARGIN) {
      phase = ChairStandPosePhase.Seated;
    } else if (hipAboveKnees >= RISING_HIP_MARGIN) {
      phase = ChairStandPosePhase.Rising;
    }

    const trunkLeanScore = clamp(1 - Math.abs(shoulderCenter.x - hipCenter.x) / (shoulderWidth * 0.75), 0, 1);
    const symmetryScore = clamp(1 - Math.abs(leftKneeAngle - rightKneeAngle) / 55, 0, 1);
    const stabilityScore = this.stabilityScoreWith(bodyCenter);
    const confidenceValues = RequiredChairStandLandmarks
      .map((name) => this.landmark(frame, name)?.visibility ?? frame.confidence)
      .filter((value) => Number.isFinite(value));
    const confidence = clamp(confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(confidenceValues.length, 1), 0, 1);

    return {
      phase,
      fullBodyVisible,
      confidence,
      trunkLeanScore,
      symmetryScore,
      stabilityScore,
      armSupportLikely: this.armSupportLikely(frame, hipCenter),
      armsCrossedLikely: this.armsCrossedLikely(frame, shoulderWidth),
      halfwayToStanding: averageKneeAngle >= HALFWAY_KNEE_ANGLE && hipAboveKnees >= HALFWAY_HIP_MARGIN,
      bodyCenter,
      debug: {
        leftKneeAngle,
        rightKneeAngle,
        averageKneeAngle,
        hipAboveKnees,
      },
    };
  }

  visiblePoint(frame, name) {
    const landmark = this.landmark(frame, name);
    if (!landmark) return null;
    const visibility = landmark.visibility ?? frame.confidence;
    return visibility >= MIN_LANDMARK_VISIBILITY ? { x: landmark.x, y: landmark.y } : null;
  }

  landmark(frame, name) {
    return frame.landmarks.find((point) => point.name === name) ?? null;
  }

  armSupportLikely(frame, hipCenter) {
    const leftWrist = this.visiblePoint(frame, PoseLandmarks.LeftWrist);
    const rightWrist = this.visiblePoint(frame, PoseLandmarks.RightWrist);
    if (!leftWrist || !rightWrist) return false;
    return leftWrist.y > hipCenter.y + ARM_SUPPORT_Y_MARGIN && rightWrist.y > hipCenter.y + ARM_SUPPORT_Y_MARGIN;
  }

  armsCrossedLikely(frame, shoulderWidth) {
    const leftWrist = this.visiblePoint(frame, PoseLandmarks.LeftWrist);
    const rightWrist = this.visiblePoint(frame, PoseLandmarks.RightWrist);
    const leftShoulder = this.visiblePoint(frame, PoseLandmarks.LeftShoulder);
    const rightShoulder = this.visiblePoint(frame, PoseLandmarks.RightShoulder);
    const leftHip = this.visiblePoint(frame, PoseLandmarks.LeftHip);
    const rightHip = this.visiblePoint(frame, PoseLandmarks.RightHip);
    if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

    const hipY = (leftHip.y + rightHip.y) / 2;
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const wristsInChestBand = leftWrist.y >= shoulderY && leftWrist.y <= hipY && rightWrist.y >= shoulderY && rightWrist.y <= hipY;
    const leftNearRightShoulder = distance(leftWrist, rightShoulder) <= shoulderWidth;
    const rightNearLeftShoulder = distance(rightWrist, leftShoulder) <= shoulderWidth;
    return wristsInChestBand && leftNearRightShoulder && rightNearLeftShoulder;
  }

  featuresToState({ features, repetitionCount, elapsedSeconds, armUseDisqualified }) {
    let warningMessage = null;
    if (armUseDisqualified) {
      warningMessage = 'Arm support was detected. The official Chair Stand score is 0.';
    } else if (!features.fullBodyVisible) {
      warningMessage = 'Move back so shoulders, hips, knees, and ankles are all visible.';
    } else if (features.phase === ChairStandPosePhase.Rising && features.armsCrossedLikely === false) {
      warningMessage = 'Keep both arms crossed in front of the chest while standing.';
    } else if (features.phase === ChairStandPosePhase.Standing && features.trunkLeanScore < TRUNK_WARNING_SCORE) {
      warningMessage = 'Center the trunk so the chest stays above the hips.';
    } else if (features.phase === ChairStandPosePhase.Standing && features.stabilityScore < STABILITY_WARNING_SCORE) {
      warningMessage = 'Movement looks unstable. Slow down and check nearby support.';
    }

    let postureMessage = 'The camera is tracking movement.';
    if (armUseDisqualified) postureMessage = SteadiAssessmentRules.ChairStandArmRule;
    else if (features.phase === ChairStandPosePhase.Standing) postureMessage = 'A full standing posture was detected. Sit safely to prepare for the next rep.';
    else if (features.phase === ChairStandPosePhase.Rising) postureMessage = 'Rising detected. Stand fully, then sit down slowly.';
    else if (features.phase === ChairStandPosePhase.Seated) postureMessage = 'Seated posture detected. Stand when ready.';

    return {
      repetitionCount,
      primaryValue: repetitionCount,
      primaryLabel: 'Chair Stands',
      elapsedSeconds,
      durationSeconds: this.durationSeconds,
      confidence: features.confidence,
      isFullBodyVisible: features.fullBodyVisible,
      warningMessage,
      postureMessage,
      isArmUseSuspected: armUseDisqualified || features.armSupportLikely,
      isStandingOrRising: features.phase === ChairStandPosePhase.Standing || features.phase === ChairStandPosePhase.Rising,
      phase: features.phase,
      trunkLeanScore: features.trunkLeanScore,
      symmetryScore: features.symmetryScore,
      stabilityScore: features.stabilityScore,
      armUseDisqualified,
      debug: features.debug,
    };
  }

  stateForMissingPose(timestampMs) {
    return {
      repetitionCount: this.repetitionCount,
      primaryValue: this.repetitionCount,
      primaryLabel: 'Chair Stands',
      elapsedSeconds: this.elapsedSeconds(timestampMs),
      durationSeconds: this.durationSeconds,
      confidence: 0,
      isFullBodyVisible: false,
      warningMessage: 'The camera has not found a full-body pose yet.',
      postureMessage: 'Adjust position so the full body is inside the camera view.',
      isArmUseSuspected: this.armUseDisqualified,
      isStandingOrRising: false,
      phase: ChairStandPosePhase.Unknown,
      armUseDisqualified: this.armUseDisqualified,
    };
  }

  elapsedSeconds(nowMs) {
    const start = this.startedAt ?? nowMs;
    return clamp(Math.floor(Math.max(nowMs - start, 0) / 1000), 0, this.durationSeconds);
  }

  rememberBodyCenter(center) {
    this.recentBodyCenters.push(center);
    while (this.recentBodyCenters.length > STABILITY_SAMPLE_LIMIT) this.recentBodyCenters.shift();
  }

  stabilityScoreWith(center) {
    const samples = [...this.recentBodyCenters, center];
    if (samples.length < MIN_STABILITY_SAMPLES) return 1;
    const meanX = samples.reduce((sum, point) => sum + point.x, 0) / samples.length;
    const meanY = samples.reduce((sum, point) => sum + point.y, 0) / samples.length;
    const variance = samples
      .map((point) => (point.x - meanX) ** 2 + (point.y - meanY) ** 2)
      .reduce((sum, value) => sum + value, 0) / samples.length;
    const sway = Math.sqrt(variance);
    return clamp(1 - sway * 18, 0, 1);
  }
}
