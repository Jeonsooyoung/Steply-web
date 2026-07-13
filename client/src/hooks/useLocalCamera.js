import { useCallback, useEffect, useRef, useState } from 'react';
import { stage2Operational } from '../pipeline/shared/config/stage2Analysis.config.js';

export const LocalCameraStates = Object.freeze({
  Idle: 'IDLE',
  Requesting: 'REQUESTING',
  Ready: 'READY',
  Denied: 'DENIED',
  NoDevice: 'NO_DEVICE',
  Unsupported: 'UNSUPPORTED',
  Error: 'ERROR',
  Stopped: 'STOPPED',
});

export function localCameraConstraints() {
  const targetFps = stage2Operational.signal.targetFps;
  return {
    audio: false,
    video: {
      frameRate: { ideal: targetFps, max: targetFps },
    },
  };
}

export function normalizeLocalCameraError(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      state: LocalCameraStates.Denied,
      message: 'Laptop camera access was denied. Allow camera access in your browser settings and try again.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      state: LocalCameraStates.NoDevice,
      message: 'No available laptop camera was found.',
    };
  }
  if (name === 'SecurityError' || name === 'TypeError') {
    return {
      state: LocalCameraStates.Unsupported,
      message: 'Laptop camera access requires this page to use localhost or HTTPS.',
    };
  }
  return {
    state: LocalCameraStates.Error,
    message: error?.message || 'The laptop camera could not be started.',
  };
}

function stopTracks(stream) {
  for (const track of stream?.getTracks?.() || []) track.stop();
}

export function useLocalCamera({ onFrame } = {}) {
  const onFrameRef = useRef(onFrame);
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const callbackRef = useRef(null);
  const callbackKindRef = useRef(null);
  const generationRef = useRef(0);
  const sequenceRef = useRef(0);
  const lastCapturedAtRef = useRef(0);
  const [stream, setStream] = useState(null);
  const [state, setState] = useState(LocalCameraStates.Idle);
  const [error, setError] = useState('');

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const cancelScheduledFrame = useCallback(() => {
    const video = videoRef.current;
    const callbackId = callbackRef.current;
    if (callbackId == null) return;
    if (callbackKindRef.current === 'video' && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(callbackId);
    } else {
      window.clearTimeout(callbackId);
    }
    callbackRef.current = null;
    callbackKindRef.current = null;
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    cancelScheduledFrame();
    stopTracks(streamRef.current);
    if (videoRef.current) {
      videoRef.current.pause?.();
      videoRef.current.srcObject = null;
    }
    streamRef.current = null;
    videoRef.current = null;
    sequenceRef.current = 0;
    lastCapturedAtRef.current = 0;
    setStream(null);
    setState(LocalCameraStates.Stopped);
  }, [cancelScheduledFrame]);

  const start = useCallback(async () => {
    stop();
    setState(LocalCameraStates.Requesting);
    setError('');

    if (
      typeof navigator === 'undefined'
      || !navigator.mediaDevices?.getUserMedia
      || typeof document === 'undefined'
      || typeof createImageBitmap !== 'function'
    ) {
      const issue = normalizeLocalCameraError({ name: 'SecurityError' });
      setState(issue.state);
      setError(issue.message);
      return null;
    }

    const generation = generationRef.current;
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia(localCameraConstraints());
      if (generation !== generationRef.current) {
        stopTracks(nextStream);
        return null;
      }

      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = nextStream;
      await video.play();
      if (generation !== generationRef.current) {
        stopTracks(nextStream);
        video.srcObject = null;
        return null;
      }

      streamRef.current = nextStream;
      videoRef.current = video;
      setStream(nextStream);
      setState(LocalCameraStates.Ready);

      const frameIntervalMs = stage2Operational.signal.frameIntervalMs;
      const schedule = () => {
        if (generation !== generationRef.current || !videoRef.current) return;
        if (typeof video.requestVideoFrameCallback === 'function') {
          callbackKindRef.current = 'video';
          callbackRef.current = video.requestVideoFrameCallback(capture);
        } else {
          callbackKindRef.current = 'timer';
          callbackRef.current = window.setTimeout(() => capture(performance.now()), frameIntervalMs);
        }
      };
      const capture = async (now) => {
        callbackRef.current = null;
        callbackKindRef.current = null;
        if (generation !== generationRef.current) return;
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          schedule();
          return;
        }
        if (now - lastCapturedAtRef.current < frameIntervalMs) {
          schedule();
          return;
        }
        lastCapturedAtRef.current = now;
        let bitmap = null;
        try {
          bitmap = await createImageBitmap(video);
          if (generation !== generationRef.current) {
            bitmap.close?.();
            return;
          }
          sequenceRef.current += 1;
          onFrameRef.current?.({
            frame: bitmap,
            receivedAt: Date.now(),
            sequence: `local-webcam:${sequenceRef.current}`,
            source: 'local-webcam',
            mirrored: false,
          });
          bitmap = null;
        } catch (frameError) {
          bitmap?.close?.();
          if (generation === generationRef.current) {
            const issue = normalizeLocalCameraError(frameError);
            setState(issue.state);
            setError(issue.message);
          }
        } finally {
          schedule();
        }
      };

      schedule();
      return nextStream;
    } catch (startError) {
      const issue = normalizeLocalCameraError(startError);
      setState(issue.state);
      setError(issue.message);
      return null;
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    state,
    error,
    stream,
    isReady: state === LocalCameraStates.Ready && Boolean(stream),
    start,
    stop,
  };
}
