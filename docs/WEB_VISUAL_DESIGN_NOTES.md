# Steply Web Visual Design Notes

## Direction

The web dashboard was redesigned as a warm, premium, older-adult-friendly movement coach screen. The visual direction follows a soft wellness companion concept with a subtle mobile fitness-game HUD feel.

## What changed

- Converted the dashboard language to English.
- Added a warm cream background with soft wellness gradients.
- Added large rounded cards, generous spacing, and accessible text sizes.
- Added a hero area with the tagline: `Small steps. Safer moves.`
- Added a Ring Fit-inspired circular movement HUD for realtime score display.
- Reworked test selection into large movement action cards.
- Reworked profile display into avatar + profile metric cards.
- Reworked history items into progress cards with large score blocks.
- Kept destructive actions out of the main flow.
- Kept all network APIs, local history storage, and WebSocket behavior unchanged.

## Main files

- `public/index.html`: page structure and dashboard sections
- `public/style.css`: full visual theme, responsive layout, HUD ring, cards, buttons, accessibility sizing
- `public/js/ui/profileView.js`: connected profile card rendering
- `public/js/ui/realtimeView.js`: realtime HUD text/flags rendering
- `public/js/ui/historyView.js`: result history card rendering
- `public/js/ui/sessionView.js`: session badge, QR, selected check rendering

## Design tokens

The CSS theme uses the requested Steply palette:

- Primary: `#4F8A7B`
- Primary Dark: `#2F5F55`
- Secondary: `#86A8E7`
- Accent: `#F4A261`
- Background: `#F8F5EF`
- Surface: `#FFFFFF`
- Surface Variant: `#EFE8DD`
- Text Primary: `#1F2933`
- Text Secondary: `#58616F`
- Success: `#5BAE7D`
- Warning: `#B9781D`
- Error: `#D9534F`

## Notes

This is still a web dashboard, not an Android Compose implementation. The reusable component idea is represented with CSS classes such as:

- `.steply-card`
- `.primary-button`
- `.secondary-button`
- `.status-pill`
- `.mini-chip`
- `.timer-circle`
- `.timer-ring`
- `.metric-card`
- `.test-card`
- `.profile-avatar`
- `.notice-card`
- `.history-item`

The current implementation does not add external icon libraries, network images, or new build complexity.
