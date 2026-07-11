import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ANALYZER_FINAL_TIMEOUT_MS } from '../pose/analysisTimeouts';
import {
  AssessmentStatuses,
  createIncompleteAssessmentResult,
} from '../pose/assessmentResultMetadata';
import {
  UserScreenIds,
  screenFromActiveStep,
} from '../pipeline/ui/sessionFlow.js';

const initialState = {
  repetitionCount: 0,
  elapsedSeconds: 0,
  confidence: 0,
  isFullBodyVisible: false,
  warningMessage: 'After QR linking, the PC starts analysis when phone camera frames arrive.',
  postureMessage: 'Waiting for analysis.',
  isArmUseSuspected: false,
  isStandingOrRising: false,
  phase: 'waiting',
};

const MAX_REMOTE_FRAME_AGE_MS = 500;

function createPoseWorker() {
  return new Worker(new URL('../pose/poseLandmarker.worker.js', import.meta.url), { type: 'module' });
}

function createAnalysisSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `analysis-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function timingFromFrameMessage(message) {
  const receivedAt = Number(message?.receivedAt);
  const analyzedAt = Number(message?.analyzedAt);
  if (!Number.isFinite(receivedAt) || !Number.isFinite(analyzedAt)) return null;
  return {
    source: message.source || message.type,
    sequence: message.sequence ?? null,
    receivedAt,
    analyzedAt,
    latencyMs: Math.max(0, analyzedAt - receivedAt),
  };
}

function isRemoteFrameStale(frame, now = Date.now()) {
  const receivedAt = Number(frame?.receivedAt);
  if (!Number.isFinite(receivedAt)) return false;
  return now - receivedAt > MAX_REMOTE_FRAME_AGE_MS;
}

function isAssessmentScreen(activeStep) {
  return [
    UserScreenIds.SafetyCheck,
    UserScreenIds.CameraSetup,
    UserScreenIds.Calibration,
    UserScreenIds.Assessment,
  ].includes(screenFromActiveStep(activeStep));
}

export function useRemotePoseAnalysis({
  session,
  selectedTest,
  remoteCameraFrame,
  activeStep = 'start',
  autoStart = true,
  onFinalResult,
  onFrameProcessed,
}) {
  const workerRef = useRef(null);
  const lastSubmittedFrameRef = useRef(0);
  const runningRef = useRef(false);
  const startedAtRef = useRef(0);
  const activeAnalysisSessionIdRef = useRef(null);
  const autoFinishedRef = useRef(false);
  const analysisStateRef = useRef(initialState);
  const finishFallbackTimerRef = useRef(null);
  const recoverableErrorCountRef = useRef(0);
  const [analysisSessionState, setAnalysisSessionState] = useState('IDLE');
  const [workerStatus, setWorkerStatus] = useState('booting');
  const [analysisState, setAnalysisState] = useState(initialState);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [landmarks, setLandmarks] = useState([]);
  const [rawLandmarks, setRawLandmarks] = useState([]);
  const [analysisLandmarks, setAnalysisLandmarks] = useState([]);
  const [analysisRawLandmarks, setAnalysisRawLandmarks] = useState([]);
  const [frameSize, setFrameSize] = useState(null);
  const [processingStats, setProcessingStats] = useState(null);
  const [trackingQuality, setTrackingQuality] = useState(null);
  const [cameraReadiness, setCameraReadiness] = useState(null);
  const [qualityStatus, setQualityStatus] = useState(null);
  const [calibrationStatus, setCalibrationStatus] = useState(null);
  const [calibrationProfile, setCalibrationProfile] = useState(null);
  const [normalizedBodyProgress, setNormalizedBodyProgress] = useState(null);
  const [debugOverlay, setDebugOverlay] = useState(null);
  const [smoothingStats, setSmoothingStats] = useState(null);
  const [brightnessStats, setBrightnessStats] = useState(null);
  const [brightnessCalibration, setBrightnessCalibration] = useState(null);
  const [frameTiming, setFrameTiming] = useState(null);
  const [error, setError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  useEffect(() => {
    const worker = createPoseWorker();
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const message = event.data || {};
      const payload = message.payload || message;
      const messageSessionId = message.sessionId || payload.sessionId || null;
      const activeSessionId = activeAnalysisSessionIdRef.current;
      const sessionScoped = ['SESSION_READY', 'FRAME_RESULT', 'FINAL_RESULT', 'SESSION_CANCELLED', 'ANALYSIS_ERROR'].includes(message.type);

      if (
        sessionScoped
        && activeSessionId
        && messageSessionId
        && messageSessionId !== activeSessionId
      ) {
        setDebugLog((current) => [...current.slice(-19), {
          type: 'debug',
          event: 'stale-worker-message-ignored',
          details: {
            messageType: message.type,
            messageSessionId,
            activeSessionId,
          },
          at: Date.now(),
        }]);
        return;
      }

      if (message.type === 'booted') setWorkerStatus('booted');
      if (message.type === 'debug') {
        setDebugLog((current) => [...current.slice(-19), message]);
      }
      if (message.type === 'frame-skipped') {
        setDebugLog((current) => [...current.slice(-19), {
          type: 'debug',
          event: 'pose-frame-skipped',
          details: {
            source: message.source || 'unknown',
            reason: message.reason || 'stale',
            frameId: message.frameId || null,
            sessionId: message.sessionId || null,
            ageMs: Math.round(message.ageMs || 0),
            maxFrameAgeMs: message.maxFrameAgeMs,
            receivedAt: message.receivedAt,
            skippedAt: message.at,
            frameQueue: message.frameQueue || null,
          },
          at: message.at || Date.now(),
        }]);
      }
      if (message.type === 'ready') {
        setError('');
        setWorkerStatus('ready');
        setAnalysisSessionState('IDLE');
      }
      if (message.type === 'SESSION_READY' || message.type === 'session-started') {
        if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
        finishFallbackTimerRef.current = null;
        runningRef.current = true;
        startedAtRef.current = message.startedAt || Date.now();
        activeAnalysisSessionIdRef.current = message.sessionId || activeAnalysisSessionIdRef.current;
        autoFinishedRef.current = false;
        setError('');
        setIsRunning(true);
        setAnalysisSessionState('ANALYZING');
        setAnalysisResult(null);
        setProcessingStats(null);
        setTrackingQuality(null);
        setCameraReadiness(null);
        setQualityStatus(null);
        setCalibrationStatus(null);
        setCalibrationProfile(null);
        setNormalizedBodyProgress(null);
        setDebugOverlay(null);
        setSmoothingStats(null);
        setBrightnessStats(null);
        setFrameTiming(null);
        setAnalysisLandmarks([]);
        setAnalysisRawLandmarks([]);
        if (message.state) {
          analysisStateRef.current = message.state;
          setAnalysisState(message.state);
        }
      }
      if (message.type === 'FRAME_RESULT' || message.type === 'pose-frame' || message.type === 'analysis-frame' || message.type === 'preview-frame') {
        recoverableErrorCountRef.current = 0;
        setError('');
        const frameMessage = payload;
        const timing = timingFromFrameMessage(frameMessage);
        const hasAnalysisState = Boolean(frameMessage.state);
        const hasReadiness = Boolean(frameMessage.cameraReadiness || frameMessage.trackingQuality);

        if (!hasAnalysisState && !hasReadiness) {
          setLandmarks(frameMessage.landmarks || []);
          setRawLandmarks(frameMessage.rawLandmarks || []);
          if (frameMessage.frameSize) setFrameSize(frameMessage.frameSize);
          setFrameTiming(timing);
          onFrameProcessed?.({
            ...(timing || {}),
            source: frameMessage.source || 'pose-frame',
            sequence: frameMessage.sequence ?? null,
            cameraFrameSequence: frameMessage.cameraFrameSequence ?? frameMessage.sequence ?? null,
            mobileSequence: frameMessage.mobileSequence ?? null,
            receivedAt: frameMessage.receivedAt,
            analyzedAt: frameMessage.analyzedAt,
          });
          setWorkerStatus(runningRef.current ? 'tracking' : 'previewing');
          return;
        }

        if (hasAnalysisState) {
          analysisStateRef.current = frameMessage.state;
          setAnalysisState(frameMessage.state);
        }
        setAnalysisLandmarks(frameMessage.landmarks || []);
        setAnalysisRawLandmarks(frameMessage.rawLandmarks || []);
        if (frameMessage.frameSize) setFrameSize(frameMessage.frameSize);
        if (frameMessage.processing) setProcessingStats(frameMessage.processing);
        setTrackingQuality(frameMessage.trackingQuality || null);
        setCameraReadiness(frameMessage.cameraReadiness || null);
        setQualityStatus(frameMessage.qualityStatus || null);
        setCalibrationStatus(frameMessage.calibrationStatus || null);
        setCalibrationProfile(frameMessage.calibrationProfile || null);
        setNormalizedBodyProgress(frameMessage.normalizedBodyProgress || null);
        setDebugOverlay(frameMessage.debugOverlay || null);
        setSmoothingStats(frameMessage.smoothing || null);
        if ('brightness' in frameMessage) setBrightnessStats(frameMessage.brightness || null);
        if ('brightnessCalibration' in frameMessage) setBrightnessCalibration(frameMessage.brightnessCalibration || null);
        setFrameTiming(timing);
        setWorkerStatus(hasAnalysisState ? 'analyzing' : 'previewing');
      }
      if (message.type === 'FINAL_RESULT' || message.type === 'session-finished') {
        const finalResult = message.payload || message.result || null;
        if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
        finishFallbackTimerRef.current = null;
        runningRef.current = false;
        startedAtRef.current = 0;
        setIsRunning(false);
        setAnalysisSessionState(finalResult?.status === AssessmentStatuses.Valid ? 'COMPLETED' : 'FAILED');
        setAnalysisResult(finalResult);
        if (message.state) setAnalysisState(message.state);
        setWorkerStatus(finalResult?.status === AssessmentStatuses.Valid ? 'finished' : 'error');
        onFinalResult?.(finalResult);
      }
      if (message.type === 'SESSION_CANCELLED' || message.type === 'session-reset') {
        if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
        finishFallbackTimerRef.current = null;
        runningRef.current = false;
        startedAtRef.current = 0;
        activeAnalysisSessionIdRef.current = null;
        autoFinishedRef.current = false;
        setIsRunning(false);
        setAnalysisSessionState('CANCELLED');
        setAnalysisResult(null);
        setProcessingStats(null);
        setTrackingQuality(null);
        setCameraReadiness(null);
        setQualityStatus(null);
        setCalibrationStatus(null);
        setCalibrationProfile(null);
        setNormalizedBodyProgress(null);
        setDebugOverlay(null);
        setSmoothingStats(null);
        setBrightnessStats(null);
        setBrightnessCalibration(null);
        setFrameTiming(null);
        setError('');
        analysisStateRef.current = message.state || initialState;
        setAnalysisState(message.state || initialState);
        setLandmarks([]);
        setRawLandmarks([]);
        setAnalysisLandmarks([]);
        setAnalysisRawLandmarks([]);
        setFrameSize(null);
        setDebugLog([]);
        recoverableErrorCountRef.current = 0;
        setWorkerStatus('ready');
      }
      if (message.type === 'ANALYSIS_ERROR' || message.type === 'error') {
        if (message.recoverable) {
          recoverableErrorCountRef.current += 1;
          setDebugLog((current) => [...current.slice(-19), {
            type: 'debug',
            event: 'recoverable-pose-frame-error',
            details: {
              source: message.source || 'unknown',
              errorCode: message.errorCode || null,
              error: message.error || 'Pose frame failed.',
              count: recoverableErrorCountRef.current,
            },
            at: message.at || Date.now(),
          }]);
          if (recoverableErrorCountRef.current < 8) {
            setWorkerStatus(runningRef.current ? 'analyzing' : 'previewing');
            return;
          }
        }
        setError(message.error || 'Pose analysis failed.');
        setAnalysisSessionState('FAILED');
        setWorkerStatus('error');
      }
    };

    worker.postMessage({ type: 'INIT' });

    return () => {
      if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
      activeAnalysisSessionIdRef.current = null;
      runningRef.current = false;
      worker.terminate();
      workerRef.current = null;
    };
  }, [onFinalResult, onFrameProcessed]);

  const startAnalysis = useCallback(() => {
    if (!workerRef.current || !session?.id) return;
    if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
    const analysisSessionId = createAnalysisSessionId();
    activeAnalysisSessionIdRef.current = analysisSessionId;
    setError('');
    setAnalysisResult(null);
    setProcessingStats(null);
    setTrackingQuality(null);
    setCameraReadiness(null);
    setQualityStatus(null);
    setCalibrationStatus(null);
    setCalibrationProfile(null);
    setNormalizedBodyProgress(null);
    setDebugOverlay(null);
    setSmoothingStats(null);
    setBrightnessStats(null);
    setFrameTiming(null);
    analysisStateRef.current = initialState;
    setLandmarks([]);
    setRawLandmarks([]);
    setAnalysisLandmarks([]);
    setAnalysisRawLandmarks([]);
    setFrameSize(null);
    lastSubmittedFrameRef.current = 0;
    autoFinishedRef.current = false;
    recoverableErrorCountRef.current = 0;
    const userId = session.profile?.id || session.id;
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    setAnalysisSessionState('INITIALIZING');
    workerRef.current.postMessage({
      type: 'START_SESSION',
      sessionId: analysisSessionId,
      userId,
      selectedTest,
      startedAt,
    });
  }, [selectedTest, session?.id, session?.profile?.id]);

  const finishAnalysis = useCallback(() => {
    if (!workerRef.current || autoFinishedRef.current) return;
    const analysisSessionId = activeAnalysisSessionIdRef.current;
    if (!analysisSessionId) return;
    autoFinishedRef.current = true;
    setAnalysisSessionState('FINALIZING');
    workerRef.current.postMessage({ type: 'FINALIZE_SESSION', sessionId: analysisSessionId, completedAt: Date.now() });
    if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
    finishFallbackTimerRef.current = window.setTimeout(() => {
      if (!runningRef.current) return;
      const incompleteResult = createIncompleteAssessmentResult({
        sessionId: session?.id,
        analysisSessionId,
        testType: selectedTest,
        startedAt: startedAtRef.current,
        completedAt: Date.now(),
      });
      runningRef.current = false;
      startedAtRef.current = 0;
      setIsRunning(false);
      setAnalysisResult(incompleteResult);
      setAnalysisSessionState('FAILED');
      setWorkerStatus('error');
      setError('We could not complete the measurement. Please check the camera connection and try again.');
      onFinalResult?.(incompleteResult);
    }, ANALYZER_FINAL_TIMEOUT_MS);
  }, [onFinalResult, selectedTest, session?.id]);

  const resetAnalysis = useCallback((reason = 'reset') => {
    if (!workerRef.current) return;
    const analysisSessionId = activeAnalysisSessionIdRef.current;
    workerRef.current.postMessage({ type: 'RESET_SESSION', sessionId: analysisSessionId, reason });
  }, []);

  const probeDebug = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'DEBUG_PROBE' });
  }, []);

  const addManualRepetition = useCallback(() => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({ type: 'MANUAL_REPETITION', sessionId: activeAnalysisSessionIdRef.current });
  }, []);

  const previewSetupFrame = useCallback((frame) => {
    if (!workerRef.current || !frame) return;
    setError('');
    workerRef.current.postMessage({
      type: 'PROCESS_PREVIEW_FRAME',
      frame,
      receivedAt: Date.now(),
      selectedTest,
    });
  }, [selectedTest]);

  useEffect(() => {
    if (!workerRef.current) return;
    runningRef.current = false;
    startedAtRef.current = 0;
    const previousAnalysisSessionId = activeAnalysisSessionIdRef.current;
    activeAnalysisSessionIdRef.current = null;
    autoFinishedRef.current = false;
    if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
    finishFallbackTimerRef.current = null;
    setIsRunning(false);
    setAnalysisResult(null);
    setProcessingStats(null);
    setTrackingQuality(null);
    setCameraReadiness(null);
    setQualityStatus(null);
    setCalibrationStatus(null);
    setCalibrationProfile(null);
    setNormalizedBodyProgress(null);
    setDebugOverlay(null);
    setSmoothingStats(null);
    setBrightnessStats(null);
    setBrightnessCalibration(null);
    setFrameTiming(null);
    analysisStateRef.current = initialState;
    setAnalysisState(initialState);
    setLandmarks([]);
    setRawLandmarks([]);
    setAnalysisLandmarks([]);
    setAnalysisRawLandmarks([]);
    setFrameSize(null);
    setError('');
    setAnalysisSessionState('IDLE');
    lastSubmittedFrameRef.current = 0;
    workerRef.current.postMessage({ type: 'RESET_SESSION', sessionId: previousAnalysisSessionId, reason: 'assessment_type_changed' });
  }, [selectedTest]);

  useEffect(() => {
    if (!workerRef.current) return;
    if (isAssessmentScreen(activeStep)) return;
    if (!runningRef.current && !activeAnalysisSessionIdRef.current) return;
    const previousAnalysisSessionId = activeAnalysisSessionIdRef.current;
    runningRef.current = false;
    activeAnalysisSessionIdRef.current = null;
    autoFinishedRef.current = false;
    if (finishFallbackTimerRef.current) window.clearTimeout(finishFallbackTimerRef.current);
    finishFallbackTimerRef.current = null;
    setIsRunning(false);
    setAnalysisSessionState('CANCELLED');
    workerRef.current.postMessage({
      type: 'CANCEL_SESSION',
      sessionId: previousAnalysisSessionId,
      reason: 'active_step_changed',
    });
  }, [activeStep]);

  useEffect(() => {
    if (!remoteCameraFrame?.src || !session?.id) return;
    if (isRemoteFrameStale(remoteCameraFrame)) return;
    if (autoStart && !runningRef.current && !analysisResult) {
      startAnalysis();
      return;
    }
    const frameKey = remoteCameraFrame.sequence || remoteCameraFrame.receivedAt || remoteCameraFrame.src;
    if (lastSubmittedFrameRef.current === frameKey) return;
    lastSubmittedFrameRef.current = frameKey;
    const frameId = String(frameKey);
    if (!runningRef.current) {
      if (analysisResult) return;
      workerRef.current?.postMessage({
        type: 'PROCESS_PREVIEW_FRAME',
        frameId,
        frame: remoteCameraFrame.blob || remoteCameraFrame.src,
        receivedAt: remoteCameraFrame.receivedAt || Date.now(),
        cameraFrameSequence: remoteCameraFrame.sequence,
        mobileSequence: remoteCameraFrame.mobileSequence || null,
        selectedTest,
      });
      return;
    }
    const analysisSessionId = activeAnalysisSessionIdRef.current;
    if (!analysisSessionId) return;
    workerRef.current?.postMessage({
      type: 'PROCESS_FRAME',
      sessionId: analysisSessionId,
      frameId,
      frame: remoteCameraFrame.blob || remoteCameraFrame.src,
      receivedAt: remoteCameraFrame.receivedAt || Date.now(),
      cameraFrameSequence: remoteCameraFrame.sequence,
      mobileSequence: remoteCameraFrame.mobileSequence || null,
      selectedTest,
    });
  }, [
    analysisResult,
    autoStart,
    remoteCameraFrame?.blob,
    remoteCameraFrame?.mobileSequence,
    remoteCameraFrame?.receivedAt,
    remoteCameraFrame?.sequence,
    remoteCameraFrame?.src,
    selectedTest,
    session?.id,
    startAnalysis,
  ]);

  const durationSeconds = analysisState.durationSeconds || analysisResult?.durationSeconds || 30;
  const progress = Math.min(100, Math.round(((analysisState.elapsedSeconds || 0) / durationSeconds) * 100));

  useEffect(() => {
    if (!isRunning || !durationSeconds || autoFinishedRef.current) return undefined;

    const tick = () => {
      const startedAt = startedAtRef.current;
      if (!startedAt || autoFinishedRef.current) return;
      const paused = (
        analysisStateRef.current.trackingPaused
        || analysisStateRef.current.calibrationReady === false
        || ['PAUSED', 'INVALID', 'NOT_READY'].includes(qualityStatus?.state)
      );
      if (paused) return;
      const workerElapsedSeconds = Number(analysisStateRef.current.elapsedSeconds);
      const elapsedSeconds = Math.min(
        durationSeconds,
        Number.isFinite(workerElapsedSeconds)
          ? Math.floor(workerElapsedSeconds)
          : Math.floor((Date.now() - startedAt) / 1000),
      );
      setAnalysisState((current) => {
        if ((current.elapsedSeconds || 0) === elapsedSeconds) return current;
        const next = { ...current, elapsedSeconds, durationSeconds };
        analysisStateRef.current = next;
        return next;
      });
      if (elapsedSeconds >= durationSeconds) finishAnalysis();
    };

    tick();
    const intervalId = window.setInterval(tick, 500);
    return () => window.clearInterval(intervalId);
  }, [durationSeconds, finishAnalysis, isRunning, qualityStatus?.state]);

  return useMemo(() => ({
    workerStatus,
    analysisState,
    analysisResult,
    landmarks,
    rawLandmarks,
    analysisLandmarks,
    analysisRawLandmarks,
    frameSize,
    processingStats,
    trackingQuality,
    cameraReadiness,
    qualityStatus,
    calibrationStatus,
    calibrationProfile,
    normalizedBodyProgress,
    debugOverlay,
    smoothingStats,
    brightnessStats,
    brightnessCalibration,
    frameTiming,
    error,
    debugLog,
    isRunning,
    analysisSessionState,
    analysisSessionId: activeAnalysisSessionIdRef.current,
    progress,
    startAnalysis,
    finishAnalysis,
    resetAnalysis,
    probeDebug,
    addManualRepetition,
    previewSetupFrame,
    durationSeconds,
  }), [
    workerStatus,
    analysisState,
    analysisResult,
    landmarks,
    rawLandmarks,
    analysisLandmarks,
    analysisRawLandmarks,
    frameSize,
    processingStats,
    trackingQuality,
    cameraReadiness,
    qualityStatus,
    calibrationStatus,
    calibrationProfile,
    normalizedBodyProgress,
    debugOverlay,
    smoothingStats,
    brightnessStats,
    brightnessCalibration,
    frameTiming,
    error,
    debugLog,
    isRunning,
    analysisSessionState,
    progress,
    startAnalysis,
    finishAnalysis,
    resetAnalysis,
    probeDebug,
    addManualRepetition,
    previewSetupFrame,
    durationSeconds,
  ]);
}
