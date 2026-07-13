import { useEffect } from 'react';
import { LiveCamera } from '../shared/LiveCamera';
import { PageShell } from '../shared/ReferenceShell';
import { Panel, ScreenHeading } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { connectionSteps, setupReminders } from './connectionData';

function QrCard({ dashboard }) {
  const qr = dashboard?.sessionBundle?.qrDataUrl;
  return <div className="ref-qr">{qr ? <img src={qr} alt="QR code to connect your phone" /> : <div><span><SteplyIcon name="scanQr" size={92} /></span><small>Preparing secure QR code…</small></div>}</div>;
}

export function ReferenceConnectScreen({ dashboard }) {
  const ready = Boolean(dashboard?.session?.profile || dashboard?.hasReceivedPhoneFrame);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => goTo('/display/home'), 1600);
    return () => window.clearTimeout(timer);
  }, [ready]);

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
          <span><SteplyIcon name="check" size={32} strokeWidth={2.5} /></span>
          <div><small>Connection status</small><strong>{ready ? 'Phone connected' : 'Ready to pair'}</strong><p>{ready ? 'Your phone camera is ready for posture analysis.' : 'Waiting for your phone to scan the QR code.'}</p></div>
          <div className="ref-link-diagram"><SteplyIcon name="laptop" size={48} /><i /><SteplyIcon name="smartphone" size={42} /></div>
        </div>
        <button type="button" className="ref-back-link" onClick={() => goTo('/display/session/plan')}><SteplyIcon name="arrowLeft" size={17} />Back to Assessment</button>
      </main>
    </PageShell>
  );
}
