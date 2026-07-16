import { useEffect, useRef } from 'react';
import { PoseOverlay } from '../../../components/pose/PoseOverlay';
import { SteplyIcon } from './icons';

export function useEnsureLocalCamera(dashboard, enabled = true) {
  const attempted = useRef(false);

  useEffect(() => {
    if (!enabled || attempted.current || dashboard?.isCameraReady || !dashboard?.handleStartLocalCamera) return undefined;
    attempted.current = true;
    const timer = window.setTimeout(() => dashboard.handleStartLocalCamera(), 450);
    return () => window.clearTimeout(timer);
  }, [dashboard?.handleStartLocalCamera, dashboard?.isCameraReady, enabled]);
}

export function displayPoseLandmarks(poseAnalysis) {
  if (poseAnalysis?.rawLandmarks?.length) return poseAnalysis.rawLandmarks;
  if (poseAnalysis?.analysisRawLandmarks?.length) return poseAnalysis.analysisRawLandmarks;
  if (poseAnalysis?.analysisLandmarks?.length) return poseAnalysis.analysisLandmarks;
  return poseAnalysis?.landmarks || [];
}

export function LiveCamera({ dashboard, className = '', label = 'Live camera', overlay = true, phone = false }) {
  const videoRef = useRef(null);
  const stream = dashboard?.activeCameraStream || null;
  const frame = dashboard?.activeCameraFrame?.src || null;
  const ready = Boolean(stream || frame);
  const waitingForPhone = dashboard?.cameraInputMode === 'PHONE_CAMERA' && dashboard?.isPhoneProfileLinked;
  const poseAnalysis = dashboard?.poseAnalysis;
  // Keep the visual overlay responsive by rendering the latest raw pose.
  // Clinical state machines continue to consume the separately smoothed
  // analysisLandmarks stream inside the analysis pipeline.
  const poseLandmarks = displayPoseLandmarks(poseAnalysis);
  const poseFrameSize = poseAnalysis?.frameSize || null;
  const hasPose = ready && poseLandmarks.length > 0;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.srcObject = stream;
    if (stream) video.play().catch(() => {});
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className={`ref-camera ${phone ? 'ref-camera--phone' : ''} ${className}`} aria-label={label}>
      {stream ? <video ref={videoRef} autoPlay muted playsInline /> : null}
      {!stream && frame ? (
        <img
          src={frame}
          alt="Live phone camera"
          onLoad={(event) => dashboard?.handleCameraFrameLoaded?.(event.currentTarget.src, {
            naturalWidth: event.currentTarget.naturalWidth,
            naturalHeight: event.currentTarget.naturalHeight,
          })}
        />
      ) : null}
      {hasPose ? (
        <div
          className={`ref-camera__pose ${stream ? 'ref-camera__pose--mirrored' : ''}`}
          data-landmark-count={poseLandmarks.length}
          aria-hidden="true"
        >
          <PoseOverlay landmarks={poseLandmarks} frameSize={poseFrameSize} fit="cover" />
          <span className="ref-camera__pose-status"><i /> Pose tracking</span>
        </div>
      ) : null}
      {!ready ? (
        <div className="ref-camera__empty">
          <span><SteplyIcon name="camera" size={31} /></span>
          <strong>{waitingForPhone ? 'Waiting for phone camera' : 'Camera is ready to connect'}</strong>
          <p>{waitingForPhone ? dashboard?.activeCameraStatus || 'Start the camera stream on your phone.' : 'Allow camera access to show your live view here.'}</p>
          <button type="button" className="ref-outline-btn" onClick={dashboard?.handleStartLocalCamera}>{waitingForPhone ? 'Use this computer camera' : 'Enable camera'}</button>
        </div>
      ) : null}
      {overlay ? (
        <div className="ref-camera__overlay" aria-hidden="true">
          <span className="ref-camera__live"><i /> Live</span>
          <span className="ref-camera__body-guide" />
          <span className="ref-camera__feet-guide" />
        </div>
      ) : null}
    </div>
  );
}
