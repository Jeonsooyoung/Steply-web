# Steply Web Dashboard - PC MediaPipe Version

Steply Web is a React + Vite PC dashboard with a local Node.js API/WebSocket server.

This version keeps the mobile app simple:

```txt
Mobile = profile/history storage + QR linking + camera frame streaming only
PC Web = frame receiving + MediaPipe keypoint extraction + posture analysis + transient result UI
```

The visual direction is:

> Soft wellness companion with large cards, warm background, rounded surfaces, clear hierarchy, and friendly movement-focused visuals.

## Main Features

- QR session creation for mobile linking
- Mobile profile connection status
- Mobile camera JPEG frame receiving through WebSocket
- PC-side MediaPipe PoseLandmarker execution
- 33-point skeleton overlay on the received mobile camera frame
- PC-side Chair Stand analysis rules ported from the Android/Kotlin analyzer
- Structured analysis pipeline modules under `client/src/pipeline`
- Deterministic Otago exercise recommendation engine
- Deterministic Care Orchestration Agent
- Internal engineering validation replay runner for anonymized landmark JSON
- Background analysis in a Web Worker so the UI stays responsive
- Realtime count / phase / full-body visibility / warning display
- Final result broadcast back to the phone for local history storage
- Local-first, no-auth flow

## Analysis Pipeline

The camera and MediaPipe worker boundary still lives in `client/src/pose`, with legacy analyzers retained for rollback and regression checks. New testable analysis modules live under `client/src/pipeline`.

Current structured modules:

- Pose frame normalization, frame processing, quality state, and calibration
- 30-second Chair Stand state machine using calibrated sitting-to-standing progress
- 4-Stage Balance Test state machine with camera observability checks
- STEADI scoring helpers
- Functional Finding mapper that avoids muscle or disease diagnosis
- Deterministic Otago exercise recommendation engine
- Deterministic Care Orchestration Agent with decision trace

## Project Structure

```text
Steply-Web/
├─ server.js
├─ src/                         # Node API, QR session, WebSocket, ephemeral session cache
├─ scripts/
│  ├─ run-landmark-replay.mjs    # Replay saved landmark JSON and compare labels/results
│  ├─ check-internal-validation.mjs
│  └─ validation/landmarkReplayRunner.mjs
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ ASSESSMENT_LOGIC.md
│  ├─ RECOMMENDATION_RULES.md
│  ├─ AGENT_BEHAVIOR.md
│  ├─ VALIDATION_REPORT.md
│  └─ schemas/
├─ public/models/               # fallback model asset for Node static server
├─ client/
│  ├─ index.html
│  ├─ public/models/            # Vite-served MediaPipe model asset
│  └─ src/
│     ├─ api/
│     ├─ components/
│     │  └─ pose/PoseOverlay.jsx
│     ├─ hooks/
│     │  ├─ useSteplyDashboard.js
│     │  └─ useRemotePoseAnalysis.js
│     ├─ pipeline/
│     │  ├─ pose/
│     │  ├─ quality/
│     │  ├─ calibration/
│     │  ├─ assessment/
│     │  ├─ scoring/
│     │  ├─ findings/
│     │  ├─ recommendation/
│     │  ├─ agent/
│     │  ├─ progress/
│     │  └─ shared/config/
│     ├─ pose/
│     │  ├─ poseLandmarker.worker.js
│     │  ├─ poseLandmarks.js
│     │  └─ steadiRules.js               # CDC/STEADI reference helpers
│     ├─ styles/
│     └─ utils/
└─ docs/PC_MEDIAPIPE_ANALYSIS_ARCHITECTURE.md
```

## Development Run

```bash
cd Steply-Web
npm install
npm run dev
```

This starts:

- API server: `https://localhost:3000`
- React Vite frontend: `http://localhost:5173`

Open:

```text
http://localhost:5173
```

The React dev server proxies `/api` and `/ws` to the Node server.

## Production / Demo Run

```bash
cd Steply-Web
npm install
npm run build
npm start
```

Open:

```text
https://localhost:3000
```

For mobile QR linking, use the HTTPS LAN IP printed in the terminal. The PC and mobile device must be on the same Wi-Fi / same network.

## Structured Pipeline Validation

Run the internal engineering validation suite:

```bash
npm run validation:check
```

Replay saved anonymized landmark JSON:

```bash
node scripts/run-landmark-replay.mjs --input path/to/anonymized-landmarks.json --assert
```

Generate a replay summary without failing the process:

```bash
npm run validation:replay
```

Replay and label formats:

- `docs/schemas/landmark-replay.schema.json`
- `docs/schemas/chair-stand-label.schema.json`
- `docs/schemas/balance-label.schema.json`

Current activation status:

- Production uses `STRUCTURED_V2` through `client/src/pipeline/shared/config/pipeline.config.js`.
- Legacy analyzer, legacy adapter, old weak-area, and old Otago selection files have been removed from the runtime.
- `docs/VALIDATION_REPORT.md` documents internal engineering validation only; it does not claim clinical validation.

## MediaPipe Runtime Note

The pose model is bundled locally:

```txt
client/public/models/pose_landmarker_lite.task
public/models/pose_landmarker_lite.task
```

The MediaPipe WASM runtime is loaded by `@mediapipe/tasks-vision`. The worker currently uses the CDN WASM path by default. For a fully offline desktop build, copy the MediaPipe WASM files into `client/public/wasm` and change this line in `client/src/pose/poseLandmarker.worker.js`:

```js
const DEFAULT_WASM_PATH = '/wasm';
```

## Mobile Integration Flow

1. PC Web creates a QR session.
2. Mobile scans QR.
3. Mobile sends selected profile to the PC API.
4. Mobile starts camera streaming.
5. PC Web receives the camera frames.
6. PC Worker extracts MediaPipe keypoints from the frames.
7. PC Worker runs Chair Stand/posture rules in the background.
8. PC UI displays skeleton, count, warnings, and final result.
9. Final result is broadcast to the phone; the phone is the persistent history source.
10. When the phone ends or disconnects the session, PC Web clears its in-memory session cache.

## If Port 3000 Is Already Used

Windows PowerShell:

```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

Or run the backend on another port:

```powershell
$env:PORT=3001
npm run server
```

For development with Vite proxy, keep the backend on 3000 unless you also update `vite.config.js`.
