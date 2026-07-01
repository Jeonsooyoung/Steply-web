import { MediaPipeChairStandAnalyzer } from './chairStandAnalyzer';
import { PoseLandmarks, RequiredChairStandLandmarks } from './poseLandmarks';
import { RecommendationLevels } from './recommendationRules';
import { SteadiAssessmentRules } from './steadiRules';

const MIN_VISIBILITY = 0.45;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function visibleLandmark(frame, name) {
  const point = frame.landmarks.find((landmark) => landmark.name === name);
  const visibility = point?.visibility ?? frame.confidence;
  return point && visibility >= MIN_VISIBILITY ? point : null;
}

function bodyFeatures(frame) {
  const leftShoulder = visibleLandmark(frame, PoseLandmarks.LeftShoulder);
  const rightShoulder = visibleLandmark(frame, PoseLandmarks.RightShoulder);
  const leftHip = visibleLandmark(frame, PoseLandmarks.LeftHip);
  const rightHip = visibleLandmark(frame, PoseLandmarks.RightHip);
  const leftAnkle = visibleLandmark(frame, PoseLandmarks.LeftAnkle);
  const rightAnkle = visibleLandmark(frame, PoseLandmarks.RightAnkle);
  const leftKnee = visibleLandmark(frame, PoseLandmarks.LeftKnee);
  const rightKnee = visibleLandmark(frame, PoseLandmarks.RightKnee);

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;

  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const center = midpoint(shoulderCenter, hipCenter);
  const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder), 0.08);
  const ankleCenter = leftAnkle && rightAnkle ? midpoint(leftAnkle, rightAnkle) : null;
  const kneeCenter = leftKnee && rightKnee ? midpoint(leftKnee, rightKnee) : null;
  const fullBodyVisible = RequiredChairStandLandmarks.every((name) => visibleLandmark(frame, name));
  const trunkScore = clamp(1 - Math.abs(shoulderCenter.x - hipCenter.x) / (shoulderWidth * 0.7), 0, 1);
  const lateralOffset = ankleCenter ? Math.abs(center.x - ankleCenter.x) / shoulderWidth : 0;
  const hipAboveKnee = kneeCenter ? kneeCenter.y - hipCenter.y : 0;

  return {
    center,
    hipCenter,
    ankleCenter,
    fullBodyVisible,
    confidence: frame.confidence,
    trunkScore,
    balanceScore: clamp(1 - lateralOffset, 0, 1),
    hipAboveKnee,
  };
}

class StaticStandingAnalyzer {
  constructor({ durationSeconds = SteadiAssessmentRules.BalanceHoldSeconds } = {}) {
    this.durationSeconds = durationSeconds;
    this.reset();
  }

  startSession(userId = 'remote-user', startedAt = Date.now()) {
    this.reset();
    this.userId = userId;
    this.startedAt = startedAt;
  }

  addFrame(frame) {
    if (!this.startedAt) return this.latestState;
    const features = bodyFeatures(frame);
    const elapsedSeconds = this.elapsedSeconds(frame.timestampMs);
    if (!features) {
      this.latestState = this.missingState(elapsedSeconds);
      return this.latestState;
    }

    this.centers.push(features.center);
    this.confidenceSamples.push(features.confidence);
    this.trunkSamples.push(features.trunkScore);
    this.balanceSamples.push(features.balanceScore);
    const stabilityScore = this.stabilityScore();
    const postureScore = average([features.trunkScore, features.balanceScore, stabilityScore]);
    this.latestState = {
      repetitionCount: Math.round(postureScore * 100),
      primaryValue: Math.round(postureScore * 100),
      primaryLabel: 'Posture Score',
      elapsedSeconds,
      durationSeconds: this.durationSeconds,
      confidence: features.confidence,
      isFullBodyVisible: features.fullBodyVisible,
      warningMessage: features.fullBodyVisible ? null : 'Move back so shoulders, hips, knees, and ankles are all visible.',
      postureMessage: postureScore >= 0.75 ? 'Standing posture is steady.' : 'Keep the trunk centered over the feet.',
      isArmUseSuspected: false,
      isStandingOrRising: true,
      phase: 'standing',
      trunkLeanScore: features.trunkScore,
      symmetryScore: features.balanceScore,
      stabilityScore,
    };
    return this.latestState;
  }

  addManualRepetition() {
    return this.latestState;
  }

  getCurrentState(nowMs = Date.now()) {
    return { ...this.latestState, elapsedSeconds: this.elapsedSeconds(nowMs) };
  }

  finishSession(completedAt = Date.now()) {
    const postureScore = this.latestState.primaryValue ?? 0;
    const stabilityScore = average(this.balanceSamples);
    const hasUsablePose = this.confidenceSamples.length >= 3 && this.latestState.isFullBodyVisible;
    const recommendationLevel = !hasUsablePose ? RecommendationLevels.Recheck : postureScore >= 80
      ? RecommendationLevels.Steady
      : postureScore >= 60 ? RecommendationLevels.PracticeNeeded : RecommendationLevels.Recheck;
    return {
      testType: 'standing_posture',
      primaryValue: postureScore,
      primaryLabel: 'Posture Score',
      repetitionCount: postureScore,
      durationSeconds: this.durationSeconds,
      confidence: average(this.confidenceSamples) || this.latestState.confidence,
      trunkLeanScore: average(this.trunkSamples),
      symmetryScore: stabilityScore,
      stabilityScore: this.stabilityScore(),
      recommendationLevel,
      summaryMessage: hasUsablePose
        ? `${postureScore}/100 standing posture score measured.`
        : 'Full-body standing pose was not stable enough to score. Please recheck.',
      startedAt: this.startedAt,
      completedAt,
    };
  }

  reset() {
    this.startedAt = null;
    this.centers = [];
    this.confidenceSamples = [];
    this.trunkSamples = [];
    this.balanceSamples = [];
    this.latestState = this.missingState(0);
  }

  missingState(elapsedSeconds) {
    return {
      repetitionCount: 0,
      primaryValue: 0,
      primaryLabel: 'Posture Score',
      elapsedSeconds,
      durationSeconds: this.durationSeconds,
      confidence: 0,
      isFullBodyVisible: false,
      warningMessage: 'The camera has not found a full-body standing pose yet.',
      postureMessage: 'Stand facing the phone so the PC can score posture.',
      isArmUseSuspected: false,
      isStandingOrRising: false,
      phase: 'unknown',
    };
  }

  elapsedSeconds(nowMs) {
    const start = this.startedAt ?? nowMs;
    return clamp(Math.floor(Math.max(nowMs - start, 0) / 1000), 0, this.durationSeconds);
  }

  stabilityScore() {
    if (this.centers.length < 4) return 1;
    const meanX = average(this.centers.map((point) => point.x));
    const meanY = average(this.centers.map((point) => point.y));
    const sway = Math.sqrt(average(this.centers.map((point) => (point.x - meanX) ** 2 + (point.y - meanY) ** 2)));
    return clamp(1 - sway * 20, 0, 1);
  }
}

class TugAnalyzer extends StaticStandingAnalyzer {
  constructor() {
    super({ durationSeconds: 30 });
    this.testType = 'tug';
  }

  addFrame(frame) {
    const state = super.addFrame(frame);
    const features = bodyFeatures(frame);
    if (features) {
      if (!this.startCenter) this.startCenter = features.center;
      this.maxTravel = Math.max(this.maxTravel || 0, distance(this.startCenter, features.center));
      state.primaryValue = this.elapsedSeconds(frame.timestampMs);
      state.primaryLabel = 'TUG Seconds';
      state.repetitionCount = state.primaryValue;
      state.postureMessage = this.maxTravel > 0.18
        ? 'Walking movement detected. Turn safely and return to the chair.'
        : 'Stand up, walk, turn, return, and sit when finished.';
      state.phase = this.maxTravel > 0.18 ? 'walking' : 'standing';
    }
    return state;
  }

  finishSession(completedAt = Date.now()) {
    const elapsed = this.elapsedSeconds(completedAt);
    const riskSignal = elapsed >= SteadiAssessmentRules.TugRiskSeconds;
    const hasUsablePose = this.confidenceSamples.length >= 3 && this.latestState.isFullBodyVisible;
    const hasMovement = (this.maxTravel || 0) > 0.08;
    const recommendationLevel = !hasUsablePose
      ? RecommendationLevels.Recheck
      : riskSignal || !hasMovement ? RecommendationLevels.PracticeNeeded : RecommendationLevels.Steady;
    return {
      testType: 'tug',
      primaryValue: elapsed,
      primaryLabel: 'TUG Seconds',
      repetitionCount: elapsed,
      durationSeconds: this.durationSeconds,
      confidence: average(this.confidenceSamples) || this.latestState.confidence,
      trunkLeanScore: average(this.trunkSamples),
      symmetryScore: average(this.balanceSamples),
      stabilityScore: this.stabilityScore(),
      recommendationLevel,
      summaryMessage: hasUsablePose
        ? `${elapsed}s TUG time measured.${hasMovement ? '' : ' Walking movement was limited, so practice is recommended.'}`
        : 'Full-body walking pose was not stable enough to score. Please recheck.',
      riskSignal: riskSignal || !hasMovement,
      startedAt: this.startedAt,
      completedAt,
    };
  }

  reset() {
    super.reset();
    this.startCenter = null;
    this.maxTravel = 0;
  }
}

export function createMovementAnalyzer(selectedTest) {
  if (selectedTest === 'standing_posture' || selectedTest === 'balance_hold') {
    return new StaticStandingAnalyzer();
  }
  if (selectedTest === 'tug' || selectedTest === 'tug_walk' || selectedTest === 'weight_shift') {
    return new TugAnalyzer();
  }
  return new MediaPipeChairStandAnalyzer();
}
