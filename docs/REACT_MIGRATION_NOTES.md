# React Migration Notes

## What changed

The web dashboard frontend was migrated from plain HTML/CSS/JS to React + Vite.

The backend API remains Node.js and keeps the same endpoint contract:

- `POST /api/session/create`
- `POST /api/session/:sessionId/connect`
- `GET /api/session/:sessionId/status`
- `POST /api/session/:sessionId/select-test`
- `POST /api/analysis/realtime`
- `POST /api/analysis/final`
- `GET /api/history`
- `GET /api/history/:userId`
- `WebSocket /ws?sessionId=...&role=dashboard`

## UI structure

```text
client/src/components/
├─ SteplyPrimitives.jsx  # Card, Button, MetricCard, StatusPill, TimerCircle, ExerciseCard
├─ SessionRail.jsx       # Left QR/session/profile rail
├─ JourneyFlow.jsx       # 0 Start → 1 Analyze → 2 Result → 3 Exercise
├─ StartPanel.jsx        # Hero + movement check selection
├─ AnalysisPanel.jsx     # Ring-style realtime movement arena
├─ ResultPanel.jsx       # Final result and AI feedback
├─ ExercisePanel.jsx     # Recommended exercise cards
└─ HistoryPanel.jsx      # Local history and metric cards
```

## Design direction kept

- Calm, warm, trustworthy, friendly
- Premium but simple
- Not hospital-like
- Not crowded
- Big-screen-friendly
- Older-adult-friendly
- Ring-style dynamic analysis HUD without flashy animation

## Where to edit

- Theme/color/spacing: `client/src/styles/app.css`
- API calls: `client/src/api/steplyApi.js`
- Dashboard state: `client/src/hooks/useSteplyDashboard.js`
- Left QR area: `client/src/components/SessionRail.jsx`
- Movement game screen: `client/src/components/AnalysisPanel.jsx`
- Result screen: `client/src/components/ResultPanel.jsx`
- Recommendations: `client/src/components/ExercisePanel.jsx`
