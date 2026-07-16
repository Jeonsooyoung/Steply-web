import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  logLevel: 'silent',
});

try {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const {
    LocalCameraStates,
    localCameraConstraints,
    normalizeLocalCameraError,
  } = await server.ssrLoadModule('/client/src/hooks/useLocalCamera.js');
  const {
    DisplayConnectScreen,
    DisplayHomeScreen,
    startLaptopCameraAndContinue,
  } = await server.ssrLoadModule('/client/src/routes/StepTwoScreens.jsx');
  const { CameraPreview } = await server.ssrLoadModule('/client/src/components/foundation/SteplyDesignSystem.jsx');
  const { LiveCamera, displayPoseLandmarks } = await server.ssrLoadModule('/client/src/features/reference-ui/shared/LiveCamera.jsx');
  const {
    ReferenceConnectScreen,
    startWebcamBalanceTest,
  } = await server.ssrLoadModule('/client/src/features/reference-ui/connection/ReferenceConnectScreen.jsx');
  const { stage2Operational } = await server.ssrLoadModule('/client/src/pipeline/shared/config/stage2Analysis.config.js');

  const constraints = localCameraConstraints();
  assert.equal(constraints.audio, false, '[CAM-WEB-01] laptop source never requests microphone access');
  assert.equal(constraints.video.frameRate.ideal, stage2Operational.signal.targetFps, '[CAM-WEB-01] laptop capture uses the central 30fps target');
  assert.equal(constraints.video.frameRate.max, stage2Operational.signal.targetFps, '[CAM-WEB-01] laptop capture cannot exceed the central target');
  assert.deepEqual(
    normalizeLocalCameraError({ name: 'NotAllowedError' }),
    {
      state: LocalCameraStates.Denied,
      message: 'Laptop camera access was denied. Allow camera access in your browser settings and try again.',
    },
    '[CAM-WEB-02] permission denial is explicit and deterministic',
  );
  assert.equal(normalizeLocalCameraError({ name: 'NotFoundError' }).state, LocalCameraStates.NoDevice, '[CAM-WEB-02] missing camera is distinct from denial');
  assert.equal(normalizeLocalCameraError({ name: 'SecurityError' }).state, LocalCameraStates.Unsupported, '[CAM-WEB-02] insecure context is reported without fallback');

  const phoneHtml = renderToStaticMarkup(React.createElement(DisplayConnectScreen, {
    dashboard: {
      sessionBundle: { qrDataUrl: 'data:image/png;base64,qr' },
      session: { id: 'camera-session', profile: null },
      cameraInputMode: 'PHONE_CAMERA',
      localCameraState: 'IDLE',
    },
  }));
  assert.match(phoneHtml, /Use This Laptop Camera/, '[CAM-WEB-03] QR screen exposes the laptop camera button');
  assert.match(phoneHtml, /Scan the QR code/, '[CAM-WEB-03] phone pairing remains available');

  const profileLinkedHtml = renderToStaticMarkup(React.createElement(DisplayConnectScreen, {
    dashboard: {
      sessionBundle: { qrDataUrl: 'data:image/png;base64,qr' },
      session: { id: 'camera-session', profile: { displayName: 'Alex' } },
      cameraInputMode: 'PHONE_CAMERA',
      phoneCameraState: 'PROFILE_LINKED_WAITING_FOR_FRAME',
      remoteCameraStatus: 'Phone camera stream is ready.',
    },
  }));
  assert.match(profileLinkedHtml, /Phone profile linked/, '[CAM-WEB-04] a Mobile profile is distinct from live camera readiness');
  assert.match(profileLinkedHtml, /Waiting for the live phone camera frame/, '[CAM-WEB-04] the pairing screen reports the missing first frame');
  assert.doesNotMatch(profileLinkedHtml, /Phone camera streaming/, '[CAM-WEB-04] profile-only state never claims that video is streaming');

  const laptopHtml = renderToStaticMarkup(React.createElement(DisplayConnectScreen, {
    dashboard: {
      sessionBundle: { qrDataUrl: 'data:image/png;base64,qr' },
      session: { id: 'camera-session', profile: null },
      cameraInputMode: 'LOCAL_WEBCAM',
      localCameraState: 'READY',
      isCameraReady: true,
    },
  }));
  assert.match(laptopHtml, /Laptop camera ready/, '[CAM-WEB-05] selected laptop source is visible');
  assert.match(laptopHtml, /Use Phone Camera/, '[CAM-WEB-05] users can switch back without removing phone support');
  assert.doesNotMatch(laptopHtml, /<button[^>]*disabled[^>]*>Use Phone Camera<\/button>/, '[CAM-WEB-05] users can cancel a pending or failed permission request');
  assert.match(laptopHtml, />Refresh Code</, '[CAM-WEB-06] local video does not manufacture a Mobile profile or unlock clinical state');
  assert.doesNotMatch(laptopHtml, />Continue</, '[CAM-WEB-06] profile authority remains with Mobile');

  const referenceConnectHtml = renderToStaticMarkup(React.createElement(ReferenceConnectScreen, {
    dashboard: {
      sessionBundle: { qrDataUrl: 'data:image/png;base64,qr' },
      session: { id: 'camera-session', profile: null },
      cameraInputMode: 'PHONE_CAMERA',
      localCameraState: 'IDLE',
      handleStartLocalCamera: () => true,
    },
  }));
  assert.match(referenceConnectHtml, />Use Webcam</, '[CAM-WEB-06A] reference QR screen exposes the webcam action');

  const webcamNavigatedPaths = [];
  let resolveReferenceCameraStart;
  const pendingReferenceCameraStart = new Promise((resolve) => {
    resolveReferenceCameraStart = resolve;
  });
  const referenceStartResult = startWebcamBalanceTest(
    () => pendingReferenceCameraStart,
    (pathValue) => webcamNavigatedPaths.push(pathValue),
  );
  assert.deepEqual(webcamNavigatedPaths, [], '[CAM-WEB-06A] reference QR screen waits for webcam permission before leaving');
  resolveReferenceCameraStart(true);
  assert.equal(await referenceStartResult, true, '[CAM-WEB-06A] an available webcam starts successfully');
  assert.deepEqual(webcamNavigatedPaths, ['/display/assessment/balance/live'], '[CAM-WEB-06A] webcam success opens the balance test');

  const deniedNavigatedPaths = [];
  assert.equal(await startWebcamBalanceTest(
    () => Promise.resolve(false),
    (pathValue) => deniedNavigatedPaths.push(pathValue),
  ), false, '[CAM-WEB-06B] denied webcam access does not report success');
  assert.deepEqual(deniedNavigatedPaths, [], '[CAM-WEB-06B] denied webcam access remains on the QR screen');

  const previewHtml = renderToStaticMarkup(React.createElement(CameraPreview, {
    mediaStream: {},
    label: 'Laptop camera preview',
  }));
  assert.match(previewHtml, /<video/, '[CAM-WEB-07] local preview uses a MediaStream video element');
  assert.match(previewHtml, /camera-preview--local/, '[CAM-WEB-07] local landscape layout is source-aware');

  const poseLandmarks = [
    { name: 'left_shoulder', x: 0.4, y: 0.3, visibility: 0.99 },
    { name: 'right_shoulder', x: 0.6, y: 0.3, visibility: 0.99 },
    { name: 'left_hip', x: 0.44, y: 0.58, visibility: 0.98 },
    { name: 'right_hip', x: 0.56, y: 0.58, visibility: 0.98 },
  ];
  const rawDisplayLandmarks = poseLandmarks.map((point) => ({ ...point, x: point.x + 0.05 }));
  const smoothedAnalysisLandmarks = poseLandmarks.map((point) => ({ ...point, x: point.x - 0.05 }));
  assert.equal(
    displayPoseLandmarks({
      rawLandmarks: poseLandmarks,
      analysisRawLandmarks: rawDisplayLandmarks,
      analysisLandmarks: smoothedAnalysisLandmarks,
    }),
    poseLandmarks,
    '[CAM-WEB-07A] the visual overlay prioritizes the immediate display lane over later clinical payloads',
  );
  assert.equal(
    displayPoseLandmarks({ analysisLandmarks: smoothedAnalysisLandmarks }),
    smoothedAnalysisLandmarks,
    '[CAM-WEB-07A] the overlay keeps a smoothed fallback until the first raw pose arrives',
  );
  const referencePoseHtml = renderToStaticMarkup(React.createElement(LiveCamera, {
    dashboard: {
      activeCameraFrame: { src: 'blob:pose-preview' },
      poseAnalysis: { landmarks: poseLandmarks, frameSize: { width: 1280, height: 720 } },
    },
    label: 'Reference camera pose preview',
  }));
  assert.match(referencePoseHtml, /ref-camera__pose/, '[CAM-WEB-07A] reference camera renders the MediaPipe overlay layer');
  assert.match(referencePoseHtml, /data-landmark-count="4"/, '[CAM-WEB-07A] landmark count is exposed on the live overlay');
  assert.match(referencePoseHtml, /pose-overlay/, '[CAM-WEB-07A] reference camera reuses the shared skeleton renderer');
  assert.match(referencePoseHtml, /Pose tracking/, '[CAM-WEB-07A] detected pose state is visible on the camera');
  assert.match(referencePoseHtml, /<line/, '[CAM-WEB-07A] connected MediaPipe joints render as skeleton lines');
  assert.match(referencePoseHtml, /<circle/, '[CAM-WEB-07A] MediaPipe landmarks render as visible points');

  const mirroredReferencePoseHtml = renderToStaticMarkup(React.createElement(LiveCamera, {
    dashboard: {
      activeCameraStream: {},
      poseAnalysis: { landmarks: poseLandmarks, frameSize: { width: 1280, height: 720 } },
    },
    label: 'Mirrored laptop pose preview',
  }));
  assert.match(mirroredReferencePoseHtml, /ref-camera__pose--mirrored/, '[CAM-WEB-07B] laptop overlay mirrors with the local video preview');

  const waitingHomeHtml = renderToStaticMarkup(React.createElement(DisplayHomeScreen, {
    dashboard: {
      session: { id: 'camera-session', profile: { displayName: 'Alex' } },
      cameraInputMode: 'PHONE_CAMERA',
      isPhoneProfileLinked: true,
      phoneCameraState: 'PROFILE_LINKED_WAITING_FOR_FRAME',
      activeCameraStatus: 'Phone camera stream is ready.',
      isCameraReady: false,
      isCameraLinked: false,
      activeCameraFrame: null,
      historyItems: [],
    },
  }));
  assert.match(waitingHomeHtml, /Waiting for camera view/, '[CAM-WEB-08] Home keeps a visible preview placeholder until the first frame');
  assert.match(waitingHomeHtml, /Phone profile linked/, '[CAM-WEB-08] Home does not present profile linkage as camera readiness');
  assert.match(waitingHomeHtml, /disabled=""/, '[CAM-WEB-09] Home blocks assessment start while a linked phone has not delivered video');
  assert.match(waitingHomeHtml, /Waiting for live phone camera/, '[CAM-WEB-09] Home explains why assessment start is blocked without redirecting');

  const streamingHomeHtml = renderToStaticMarkup(React.createElement(DisplayHomeScreen, {
    dashboard: {
      session: { id: 'camera-session', profile: { displayName: 'Alex' } },
      cameraInputMode: 'PHONE_CAMERA',
      isPhoneProfileLinked: true,
      phoneCameraState: 'FRAME_RECEIVED',
      activeCameraStatus: 'Receiving live phone camera stream',
      isCameraReady: true,
      isCameraLinked: true,
      hasReceivedPhoneFrame: true,
      remoteCameraFrame: { src: 'blob:phone-frame', decoded: true },
      activeCameraFrame: { src: 'blob:phone-frame', decoded: true },
      historyItems: [],
    },
  }));
  assert.match(streamingHomeHtml, /<img src="blob:phone-frame"/, '[CAM-WEB-10] Home visibly renders the received remoteCameraFrame');
  assert.match(streamingHomeHtml, /Phone camera ready/, '[CAM-WEB-10] Home marks the phone source ready only after video arrives');
  assert.doesNotMatch(streamingHomeHtml, /<button[^>]*disabled[^>]*class="ds-button ds-button--primary home-challenge-button"/, '[CAM-WEB-10] a live phone frame unlocks assessment start');

  const workerSource = fs.readFileSync(path.join(root, 'client/src/pose/poseLandmarker.worker.js'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(root, 'client/src/hooks/useSteplyDashboard.js'), 'utf8');
  const designSystemSource = fs.readFileSync(path.join(root, 'client/src/components/foundation/SteplyDesignSystem.jsx'), 'utf8');
  assert.match(workerSource, /frame instanceof ImageBitmap/, '[CAM-WEB-11] worker accepts transferred ImageBitmap frames directly');
  assert.match(workerSource, /closeQueuedFrameInput\(pendingPreviewFrame\)/, '[CAM-WEB-11] superseded local GPU frames are closed');
  assert.match(workerSource, /else closeQueuedFrameInput\(message\)/, '[CAM-WEB-11] transferred frames are closed when inference fails before producing a bitmap result');
  assert.match(dashboardSource, /cameraInputModeRef\.current === CameraInputModes\.Laptop/, '[CAM-WEB-12] phone frames cannot replace an active laptop source');
  assert.match(dashboardSource, /current\.frame !== frame\?\.frame\) current\.frame\.close/, '[CAM-WEB-12] React-batched local frames release the superseded ImageBitmap');
  assert.doesNotMatch(dashboardSource, /if \(!startedStream\)[\s\S]{0,180}CameraInputModes\.Phone/, '[CAM-WEB-13] camera denial stays visible instead of silently falling back to phone');
  assert.match(dashboardSource, /const isCameraLinked = isCameraReady/, '[CAM-WEB-14] camera linkage requires an actual frame or local MediaStream');
  assert.match(dashboardSource, /handleCameraFrameLoaded[\s\S]{0,1600}url === currentUrl/, '[CAM-WEB-15] superseded Blob URLs are revoked only after a preview frame loads');
  assert.doesNotMatch(dashboardSource, /const previousUrl = frameObjectUrlRef\.current[\s\S]{0,100}revokeObjectURL\(previousUrl\)/, '[CAM-WEB-15] the current DOM image URL is not revoked before React commits the replacement');
  assert.match(designSystemSource, /onLoad=\{\(event\)[\s\S]{0,300}currentSrc \|\| event\.currentTarget\.src[\s\S]{0,180}naturalWidth > 0 && naturalHeight > 0[\s\S]{0,180}onFrameLoaded\?\.\(loadedSrc, \{ naturalWidth, naturalHeight \}\)/, '[CAM-WEB-16] preview success uses the DOM-decoded URL with non-zero natural dimensions');
  assert.match(dashboardSource, /handleCameraFrameLoaded[\s\S]{0,700}frameMetaByObjectUrlRef\.current\.get\(loadedUrl\)[\s\S]{0,700}source: 'camera-preview'[\s\S]{0,300}decodedWidth:/, '[CAM-WEB-16] the same decoded URL event emits the preview ACK with its sequence and dimensions');
  assert.equal((dashboardSource.match(/source: 'camera-preview'/g) || []).length, 1, '[CAM-WEB-16] binary receipt has no eager camera-preview ACK path');
  assert.match(dashboardSource, /hasReceivedPhoneFrame = Boolean\(remoteCameraFrame\?\.src && remoteCameraFrame\.decoded === true\)/, '[CAM-WEB-16] camera readiness and Home start wait for successful decode');
  assert.match(dashboardSource, /src: nextUrl,[\s\S]{0,80}decoded: false/, '[CAM-WEB-16] binary receipt alone creates only a pending frame');
  assert.match(dashboardSource, /loadedUrl === currentUrl[\s\S]{0,220}decoded: true/, '[CAM-WEB-16] only current decoded image load promotes the phone camera to ready');
  assert.match(dashboardSource, /handleCameraFrameError[\s\S]{0,600}frameMetaByObjectUrlRef\.current\.delete\(failedUrl\)[\s\S]{0,600}setRemoteCameraFrame/, '[CAM-WEB-17] JPEG decode failure removes the frame and its pending ACK metadata');
  assert.match(designSystemSource, /onError=\{\(event\) => onFrameError\?\.\(event\.currentTarget\.currentSrc \|\| event\.currentTarget\.src\)\}/, '[CAM-WEB-17] image decode failure uses the failing DOM URL for the no-ACK cleanup path');

  const navigatedPaths = [];
  let resolveCameraStart;
  const pendingCameraStart = new Promise((resolve) => {
    resolveCameraStart = resolve;
  });
  const startResult = startLaptopCameraAndContinue(
    () => pendingCameraStart,
    (pathValue) => navigatedPaths.push(pathValue),
  );
  assert.deepEqual(navigatedPaths, ['/display/home'], '[CAM-WEB-18] clicking laptop camera navigates immediately while permission is pending');
  resolveCameraStart(true);
  assert.equal(await startResult, true, '[CAM-WEB-18] camera initialization continues after navigation');

  console.log('Local laptop webcam checks passed.');
} finally {
  await server.close();
}
