import React, { useState } from 'react';
import {
  AppHeader,
  ConnectionIndicator,
  Navigation,
} from '../components/foundation/SteplyDesignSystem';
import { ProgressPanel } from '../components/ProgressPanel';
import { displayNavigationItems } from './steplyRoutes';
import { navigateSpa } from './spaNavigation';
import { ageYearsFromProfile } from '../pose/steadiRules';

function goTo(path) {
  navigateSpa(path);
}

function Shell({ title, eyebrow, description, connection, children, className = '' }) {
  return (
    <div className={`foundation-shell step-eight-shell ${className}`}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        connection={connection}
      />
      <Navigation items={displayNavigationItems} currentPath={typeof window === 'undefined' ? '' : window.location.pathname} />
      {children}
    </div>
  );
}

function profileFromDashboard(dashboard) {
  return dashboard?.session?.profile || {};
}

function settingsFromDashboard(dashboard) {
  return dashboard?.settings || dashboard?.session?.settings || {};
}

function historyFromDashboard(dashboard) {
  const items = dashboard?.historyItems || [];
  return Array.isArray(items) ? items : [];
}

export function DisplayProgressScreen({ dashboard }) {
  const history = historyFromDashboard(dashboard);
  const hasProgressData = history.length > 0;

  return (
    <Shell
      eyebrow="Progress"
      title="Progress"
      description="Review the five most recent assessment results received from your paired phone."
      connection={<ConnectionIndicator status={hasProgressData ? 'connected' : 'waiting'} label={hasProgressData ? 'Assessment history ready' : 'Waiting for Mobile data'} detail="Recent 5 assessments" />}
      className="step-eight-progress-shell"
    >
      <main className="step-eight-progress">
        <section className="step-eight-report-section" aria-label="Phone-only care information">
          <h2>Care information is unavailable on this PC</h2>
          <p>Weekly adherence, safety events, fall reports, Care Agent decisions, and reassessment scheduling stay on the paired Steply phone app.</p>
        </section>
        <ProgressPanel historyItems={history} historySource={dashboard?.historySource} />
      </main>
    </Shell>
  );
}

export function DisplayReportsScreen() {
  return (
    <Shell
      eyebrow="Reports"
      title="Reports are available on your phone"
      description="This PC shows recent assessment graphs only."
      connection={<ConnectionIndicator status="waiting" label="Phone-owned reports" detail="Unavailable on this PC" />}
      className="step-eight-reports-shell"
    >
      <main className="step-eight-report">
        <div className="step-eight-report-grid">
          <section className="step-eight-report-section">
            <h2>Weekly report</h2>
            <p>Weekly adherence, safety events, fall reports, reassessment status, and Care Agent decisions are unavailable on this PC.</p>
          </section>
          <section className="step-eight-report-section">
            <h2>Professional report</h2>
            <p>Open the paired Steply phone app to generate and review the professional report from locally stored Room data.</p>
          </section>
          <section className="step-eight-report-section">
            <h2>Consent, sharing, and export</h2>
            <p>Review the report and give consent in the phone app before sharing or exporting it. This PC cannot approve, share, or export a report.</p>
          </section>
        </div>
        <div className="step-eight-report-actions">
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/progress')}>Return to Assessment Progress</button>
        </div>
      </main>
    </Shell>
  );
}

function SettingSection({ title, children }) {
  return (
    <section className="step-eight-settings-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="step-eight-field">
      <span>{label}</span>
      <input value={value} readOnly aria-label={label} />
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="step-eight-toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
    </label>
  );
}

export function DisplaySettingsScreen({ dashboard }) {
  const profile = profileFromDashboard(dashboard);
  const settings = settingsFromDashboard(dashboard);
  const [textSize, setTextSize] = useState(settings.textSize || 'Large');
  const [highContrast, setHighContrast] = useState(settings.highContrast === true);
  const [reduceMotion, setReduceMotion] = useState(settings.reduceMotion === true);

  const accessibilityClass = [
    textSize === 'Extra Large' ? 'step-eight-settings--large-text' : '',
    highContrast ? 'step-eight-settings--high-contrast' : '',
    reduceMotion ? 'step-eight-settings--reduced-motion' : '',
  ].filter(Boolean).join(' ');

  return (
    <Shell
      eyebrow="Settings"
      title="Settings"
      description="Adjust this PC session display and review where phone-owned settings are managed."
      connection={<ConnectionIndicator status="connected" label="PC display settings" detail="While this screen is open" />}
      className={`step-eight-settings-shell ${accessibilityClass}`}
    >
      <main className="step-eight-settings">
        <SettingSection title="Profile">
          <ReadOnlyField label="Preferred name" value={profile.displayName || 'Unavailable on this PC'} />
          <ReadOnlyField label="Age" value={String(ageYearsFromProfile(profile) || 'Unavailable on this PC')} />
          <ReadOnlyField label="Sex used for reference values" value={profile.sex || 'Unavailable on this PC'} />
          <ReadOnlyField label="Caregiver information" value="Stored on phone" />
        </SettingSection>

        <SettingSection title="Current PC Session Display">
          <label className="step-eight-field">
            <span>Text Size</span>
            <select value={textSize} onChange={(event) => setTextSize(event.target.value)} aria-label="Text Size">
              <option>Large</option>
              <option>Extra Large</option>
            </select>
          </label>
          <ToggleField label="High Contrast" checked={highContrast} onChange={setHighContrast} />
          <ToggleField label="Reduce Motion" checked={reduceMotion} onChange={setReduceMotion} />
          <p className="step-eight-privacy-note">These display changes apply only while this settings screen is open.</p>
        </SettingSection>

        <SettingSection title="Camera and Connection">
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/connect')}>Reconnect Phone</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/session/camera-setup')}>Test Camera</button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/session/camera-setup')}>Camera Instructions</button>
        </SettingSection>

        <SettingSection title="Notifications">
          <p className="step-eight-privacy-note">Exercise reminders, reassessment reminders, weekly report notifications, and caregiver notifications are managed in the paired Steply phone app.</p>
        </SettingSection>

        <SettingSection title="Privacy">
          <p className="step-eight-privacy-note">Stored-data review, data export, sharing consent, and deletion are available in the paired Steply phone app. This display does not store or manage your long-term records.</p>
          <p className="step-eight-privacy-note">Video Storage Explanation: Steply does not save raw camera video. Movement measurements and assessment results are stored by the paired phone.</p>
        </SettingSection>

      </main>
    </Shell>
  );
}
