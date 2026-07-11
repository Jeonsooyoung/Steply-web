export const POSE_CONFIG_VERSION = 'pose_config.v1';

export const poseConfig = {
  version: POSE_CONFIG_VERSION,
  landmarkModel: 'mediapipe_pose_33',
  maxLandmarkIndex: 32,
  minFrameIntervalMs: 66,
  maxInputFrameAgeMs: 500,
  minPoseConfidence: 0.65,
  processing: {
    targetFps: 15,
    renderFps: 30,
    maxPendingFrames: 1,
    duplicateFrameWindowSize: 120,
  },
  mediaPipe: {
    numPoses: 1,
    minPoseDetectionConfidence: 0.65,
    minPosePresenceConfidence: 0.65,
    minTrackingConfidence: 0.65,
  },
};
