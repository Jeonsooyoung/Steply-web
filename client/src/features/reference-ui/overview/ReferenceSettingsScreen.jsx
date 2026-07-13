import { useState } from 'react';
import { PageShell } from '../shared/ReferenceShell';
import { Panel, ScreenHeading, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';

function SettingSwitch({ label, description, checked, onChange }) {
  return (
    <button type="button" className="ref-setting-row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      <span><b>{label}</b><small>{description}</small></span>
      <i className={checked ? 'is-on' : ''}><span /></i>
    </button>
  );
}

export function ReferenceSettingsScreen() {
  const [voiceGuidance, setVoiceGuidance] = useState(true);
  const [largeText, setLargeText] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [cameraGuide, setCameraGuide] = useState(true);

  return (
    <PageShell active="Settings" className="ref-settings-page">
      <main className="ref-page ref-settings">
        <ScreenHeading title="Settings" subtitle="Adjust display, guidance, camera, and reminder preferences for a comfortable Steply session." />

        <div className="ref-settings-grid">
          <Panel className="ref-settings-card">
            <SectionTitle icon="type">Display &amp; Accessibility</SectionTitle>
            <SettingSwitch label="Large text" description="Increase text size across guidance and result screens." checked={largeText} onChange={setLargeText} />
            <SettingSwitch label="Voice guidance" description="Read exercise and assessment instructions aloud." checked={voiceGuidance} onChange={setVoiceGuidance} />
            <div className="ref-setting-select"><span><b>Interface language</b><small>Language used for Steply instructions.</small></span><button type="button">English<SteplyIcon name="chevronDown" size={17} /></button></div>
          </Panel>

          <Panel className="ref-settings-card">
            <SectionTitle icon="camera">Camera &amp; Guidance</SectionTitle>
            <SettingSwitch label="Full-body guide" description="Show the positioning outline over the live camera view." checked={cameraGuide} onChange={setCameraGuide} />
            <div className="ref-setting-select"><span><b>Preferred camera</b><small>Choose the default source for assessments.</small></span><button type="button">Ask every time<SteplyIcon name="chevronDown" size={17} /></button></div>
            <div className="ref-settings-privacy"><SteplyIcon name="shieldCheck" size={24} /><p><b>Your privacy</b>Camera video is processed during the active session and raw video is not saved.</p></div>
          </Panel>

          <Panel className="ref-settings-card">
            <SectionTitle icon="bell" tone="amber">Reminders</SectionTitle>
            <SettingSwitch label="Weekly exercise reminders" description="Show a gentle reminder when a session is due." checked={reminders} onChange={setReminders} />
            <div className="ref-setting-select"><span><b>Reminder time</b><small>Your preferred time for exercise reminders.</small></span><button type="button">9:00 AM<SteplyIcon name="chevronDown" size={17} /></button></div>
            <div className="ref-setting-select"><span><b>Reassessment schedule</b><small>Recommended interval for the next balance check.</small></span><button type="button">Every 2 weeks<SteplyIcon name="chevronDown" size={17} /></button></div>
          </Panel>

          <Panel className="ref-settings-card ref-settings-card--account">
            <SectionTitle icon="users">Profile &amp; Sharing</SectionTitle>
            <div className="ref-settings-profile"><span>MK</span><p><b>Mrs. Kim</b>Age 76&nbsp; · &nbsp;Female</p><button type="button">View Profile</button></div>
            <div className="ref-settings-share"><span>Caregiver report sharing</span><strong>Not connected</strong></div>
          </Panel>
        </div>
      </main>
    </PageShell>
  );
}
