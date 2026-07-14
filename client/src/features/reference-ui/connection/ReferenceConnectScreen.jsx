import { useEffect } from 'react';
import { LiveCamera } from '../shared/LiveCamera';
import { PageShell } from '../shared/ReferenceShell';
import { Panel, ScreenHeading } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { connectionSteps, setupReminders } from './connectionData';

export async function startWebcamBalanceTest(startCamera, navigate = goTo) {
  if (typeof startCamera !== 'function') return false;
  const started = await startCamera();
  if (started) navigate('/display/assessment/balance/live');
  return Boolean(started);
}

function QrCard({ dashboard }) {
  const qr = dashboard?.sessionBundle?.qrDataUrl;
  return <div className="ref-qr">{qr ? <img src={qr} alt="QR code to connect your phone" /> : <div><span><SteplyIcon name="scanQr" size={92} /></span><small>Preparing secure QR code…</small></div>}</div>;
}

export function ReferenceConnectScreen({ dashboard }) {
  const usingWebcam = dashboard?.cameraInputMode === 'LOCAL_WEBCAM';
  const startingWebcam = usingWebcam && dashboard?.localCameraState === 'REQUESTING';
  const webcamReady = usingWebcam && dashboard?.isCameraReady === true;
  const phoneReady = !usingWebcam && Boolean(dashboard?.session?.profile || dashboard?.hasReceivedPhoneFrame);
  const ready = webcamReady || phoneReady;
  const webcamError = usingWebcam ? dashboard?.localCameraError : '';

  useEffect(() => {
    if (!phoneReady) return undefined;
    const timer = window.setTimeout(() => goTo('/display/home'), 1600);
    return () => window.clearTimeout(timer);
  }, [phoneReady]);

  const statusTitle = webcamReady
    ? 'Webcam connected'
    : startingWebcam
      ? 'Starting webcam'
      : webcamError
        ? 'Webcam unavailable'
        : phoneReady
          ? 'Phone connected'
          : 'Ready to pair';
  const statusDetail = webcamReady
    ? 'Your computer webcam is ready for the balance test.'
    : startingWebcam
      ? 'Allow camera access in your browser to continue.'
      : webcamError
        ? webcamError
        : phoneReady
          ? 'Your phone camera is ready for posture analysis.'
          : 'Waiting for your phone to scan the QR code.';

  return (
    <PageShell active="Assessment" className="ref-connect-page">
      <main className="ref-connect-card">
        <ScreenHeading title="Connect Your Phone Camera" subtitle="Scan the QR code to link your phone camera for posture analysis." />
        <div className="ref-connect-grid">
          <Panel className="ref-qr-panel">
            <h2>Scan this QR code</h2><QrCard dashboard={dashboard} />
            <p>Open the Steply app on your phone<br />and scan this code.</p>
            <button type="button" onClick={dashboard?.handleCreateSession}>Refresh code</button>
          </Panel>
          <Panel className="ref-how-connect">
            <h2>How to connect</h2>
            <ol>{connectionSteps.map(([icon, title, detail], index) => <li key={title}><span>{index + 1}</span><i><SteplyIcon name={icon} /></i><p><b>{title}</b>{detail}</p></li>)}</ol>
          </Panel>
          <div className="ref-phone-mock">
            <div className="ref-phone-mock__bar"><b><SteplyIcon name="close" size={16} /></b><span>Scan QR code<small>Point your camera at the QR code<br />on your computer screen.</small></span></div>
            <LiveCamera dashboard={dashboard} phone label="Connected phone camera preview" />
            <div className="ref-phone-mock__bottom"><span className="ref-phone-control"><SteplyIcon name="zap" size={13} />Flash</span><span className="ref-phone-control"><SteplyIcon name="help" size={13} />Help</span></div>
          </div>
          <Panel className="ref-reminders">
            <h2>Setup reminders</h2>
            {setupReminders.map(([icon, title, detail]) => <div key={title}><span><SteplyIcon name={icon} size={27} /></span><p><b>{title}</b>{detail}</p></div>)}
          </Panel>
        </div>
        <div className={`ref-connection-status ${ready ? 'ready' : ''}`}>
          <span><SteplyIcon name={ready ? 'check' : 'camera'} size={32} strokeWidth={2.5} /></span>
          <div><small>Connection status</small><strong>{statusTitle}</strong><p>{statusDetail}</p></div>
          <div className="ref-link-diagram"><SteplyIcon name="laptop" size={48} /><i /><SteplyIcon name="smartphone" size={42} /></div>
        </div>
        <div className="ref-connect-footer">
          <button type="button" className="ref-back-link" onClick={() => goTo('/display/session/plan')}><SteplyIcon name="arrowLeft" size={17} />Back to Assessment</button>
          <div className="ref-webcam-feedback">
            {webcamError ? <p role="alert">{webcamError}</p> : null}
            <button
              type="button"
              className="ref-webcam-action"
              disabled={startingWebcam || typeof dashboard?.handleStartLocalCamera !== 'function'}
              onClick={() => startWebcamBalanceTest(dashboard?.handleStartLocalCamera)}
            >
              <SteplyIcon name="camera" size={19} />
              {startingWebcam ? 'Starting Webcam…' : 'Use Webcam'}
              <SteplyIcon name="arrowRight" size={17} />
            </button>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
