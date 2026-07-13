import { stage2Operational } from './stage2Analysis.config.js';

export const POSE_CONFIG_VERSION = 'pose_config.v2';

export const poseConfig = {
  version: POSE_CONFIG_VERSION,
  landmarkModel: 'mediapipe_pose_33',
  maxLandmarkIndex: 32,
  minFrameIntervalMs: stage2Operational.signal.frameIntervalMs,
  maxInputFrameAgeMs: stage2Operational.signal.maxInputFrameAgeMs,
  minPoseConfidence: stage2Operational.signal.minimumPoseConfidence,
  processing: {
    targetFps: stage2Operational.signal.targetFps,
    renderFps: stage2Operational.signal.renderFps,
    maxPendingFrames: stage2Operational.signal.maxPendingFrames,
    duplicateFrameWindowSize: stage2Operational.signal.duplicateFrameWindowSize,
  },
  mediaPipe: {
    numPoses: stage2Operational.multiPerson.maximumPoses,
    minPoseDetectionConfidence: stage2Operational.signal.minimumPoseConfidence,
    minPosePresenceConfidence: stage2Operational.signal.minimumPoseConfidence,
    minTrackingConfidence: stage2Operational.signal.minimumPoseConfidence,
  },
};
