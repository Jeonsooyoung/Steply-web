# Steply Web Dashboard - PC MediaPipe Version

Steply Web is a React + Vite PC dashboard with a local Node.js API/WebSocket server.

This version keeps the mobile app simple:

```txt
Mobile = profile storage + QR linking + camera frame streaming only
PC Web = frame receiving + MediaPipe keypoint extraction + posture analysis + result UI/history
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
- Background analysis in a Web Worker so the UI stays responsive
- Realtime count / phase / full-body visibility / warning display
- Final result save to local history
- Local-first, no-auth flow

## Analysis Rules Ported to PC

The old mobile MediaPipe analyzer responsibilities were moved into `client/src/pose`.

Included rules:

- Full-body visibility check using shoulders, hips, knees, and ankles
- Knee-angle based `seated → rising → standing` phase detection
- Stable standing frame streak count for Chair Stand repetition counting
- Stable seated frame streak reset for the next repetition
- Half-stand final credit at the end of a 30-second session
- Arm-support detection and official score 0 rule
- Trunk lean score
- Left/right symmetry score
- Body-center sway stability score
- Recommendation level mapping

## Project Structure

```text
Steply-Web/
├─ server.js
├─ src/                         # Node API, QR session, WebSocket, history
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
│     ├─ pose/
│     │  ├─ poseLandmarker.worker.js
│     │  ├─ chairStandAnalyzer.js
│     │  ├─ poseLandmarks.js
│     │  ├─ steadiRules.js
│     │  └─ recommendationRules.js
│     ├─ styles/
│     └─ utils/
├─ data/history.json
└─ docs/PC_MEDIAPIPE_ANALYSIS_ARCHITECTURE.md
```

## Development Run

```bash
cd Steply-Web
npm install
npm run dev
```

This starts:

- API server: `http://localhost:3000`
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
http://localhost:3000
```

For mobile QR linking, use the LAN IP printed in the terminal. The PC and mobile device must be on the same Wi-Fi / same network.

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

## Movement State Classifier

Steply also includes an MVP RandomForest movement-state classifier as an additional signal on top of the existing MediaPipe rules.

- Model artifact: `models/randomforest_landmark_classifier.joblib`
- Inference module: `steply_ai/movement_state_classifier.py`
- API bridge: `POST /api/predict_movement_state`
- Supported labels: `Walking`, `Standing`, `Sitting`
- Expected input: a sequence of MediaPipe Pose frames, where each frame contains 33 landmarks with `x`, `y`, and `visibility`

Example request:

```json
{
  "landmarks": [
    [
      { "x": 0.1, "y": 0.2, "visibility": 0.99 }
    ]
  ]
}
```

The browser Worker reuses the existing MediaPipe PoseLandmarker output and sends recent landmark sequences to the local Node API. The API calls the Python classifier, which loads the joblib payload and builds the feature vector in the exact `feature_cols` order stored in the model.

The result is exposed as an estimated AI movement state:

```json
{
  "label": "Standing",
  "label_id": 1,
  "confidence": 0.92,
  "probabilities": {
    "Walking": 0.03,
    "Standing": 0.92,
    "Sitting": 0.05
  }
}
```

Known limitation: this classifier was trained on UP-Fall Camera2 frontal-view data from a controlled environment, not real older-adult care-center data. Treat it as an MVP/demo classifier and validate further before using it for real-world decisions. Do not present the controlled-split score as real-world accuracy.

## Mobile Integration Flow

1. PC Web creates a QR session.
2. Mobile scans QR.
3. Mobile sends selected profile to the PC API.
4. Mobile starts camera streaming.
5. PC Web receives the camera frames.
6. PC Worker extracts MediaPipe keypoints from the frames.
7. PC Worker runs Chair Stand/posture rules in the background.
8. PC UI displays skeleton, count, warnings, and final result.
9. Final result is saved through `/api/analysis/final` into `data/history.json`.

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
