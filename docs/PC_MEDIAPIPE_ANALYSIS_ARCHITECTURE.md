# Steply PC MediaPipe 분석 구조

이 버전은 모바일 앱의 역할을 `프로필 저장 + QR 세션 연결 + 카메라 프레임 송출`로 제한하고, 기존 모바일에 있던 MediaPipe 기반 분석 책임을 PC 웹 화면으로 옮긴 구조입니다.

## 런타임 흐름

```txt
Mobile App
  ├─ 프로필 저장/선택
  ├─ PC QR 스캔
  └─ JPEG 프레임 WebSocket 송출
        ↓
Steply Web Server
  ├─ QR 세션 관리
  ├─ 모바일 프로필 연결 상태 관리
  └─ 프레임을 PC Dashboard로 브로드캐스트
        ↓
PC Dashboard Renderer
  ├─ 프레임 수신/표시
  └─ Pose Analysis Worker에 프레임 전달
        ↓
Pose Analysis Worker
  ├─ MediaPipe PoseLandmarker 실행
  ├─ 33개 keypoint 추출
  ├─ Chair Stand 자세 규칙 분석
  └─ 실시간 상태를 UI로 반환
```

## 리팩토링 단위

### 1. 프레임 수신 레이어

기존 파일을 유지합니다.

```txt
src/ws/dashboardSocket.js
client/src/hooks/useSteplyDashboard.js
client/src/components/AnalysisPanel.jsx
```

책임:

- 모바일에서 들어온 JPEG binary frame 수신
- dashboard로 `remote-camera-frame` 이벤트 전달
- UI에는 최신 프레임만 표시

### 2. MediaPipe 키포인트 추출 레이어

추가된 파일:

```txt
client/src/pose/poseLandmarker.worker.js
public/models/pose_landmarker_lite.task
```

책임:

- UI 메인 스레드와 분리된 Worker에서 MediaPipe 실행
- JPEG data URL → ImageBitmap 변환
- PoseLandmarker `detectForVideo` 실행
- MediaPipe 33개 landmark를 Steply landmark 이름으로 매핑

### 3. 자세 분석 규칙 레이어

추가된 파일:

```txt
client/src/pose/steadiRules.js
client/src/pose/poseLandmarks.js
client/src/pipeline/assessment/chairStand/chairStandStateMachine.js
client/src/pipeline/assessment/balanceTest/balanceTestStateMachine.js
```

현재 runtime 분석 규칙은 structured state machine으로 구현되어 있습니다.

포함 규칙:

- 전신 감지: 어깨, 엉덩이, 무릎, 발목 visibility 확인
- 개인 캘리브레이션 기반 sitting-to-standing progress
- timestamp 기반 dwell/hysteresis state transition
- structured `AssessmentResult` 생성
- 앉은 자세 2프레임 이상 안정 시 다음 count reset
- 종료 시 절반 이상 올라온 경우 1회 인정
- 팔 사용 감지 시 official Chair Stand score 0점 처리
- 몸통 기울기 점수
- 좌우 무릎 각도 대칭 점수
- 몸 중심 흔들림 기반 안정성 점수

### 4. UI 바인딩 레이어

추가/수정된 파일:

```txt
client/src/hooks/useRemotePoseAnalysis.js
client/src/components/pose/PoseOverlay.jsx
client/src/components/AnalysisPanel.jsx
client/src/App.jsx
```

책임:

- Worker lifecycle 관리
- 프레임을 Worker에 전달
- 실시간 분석 상태를 UI에 표시
- keypoint skeleton overlay 표시
- 결과 확정 시 `/api/analysis/final`은 세션 메모리 캐시에만 임시 반영하고 모바일에 final 메시지를 전송

## 백그라운드 처리 방식

브라우저/Electron renderer의 UI 메인 스레드에서 MediaPipe를 직접 돌리지 않고 `Web Worker`로 분리했습니다.

```txt
UI thread: 화면 렌더링, QR/프레임 표시, 버튼 입력
Worker thread: ImageBitmap 변환, MediaPipe 추론, 자세 규칙 분석
```

이 구조 때문에 프레임 수신량이 많아져도 버튼, 카드, 화면 전환 반응성이 훨씬 덜 막힙니다.

## MediaPipe 모델

모바일 앱에 있던 모델을 PC 웹 public asset으로 복사했습니다.

```txt
public/models/pose_landmarker_lite.task
```

WASM runtime은 `@mediapipe/tasks-vision` 설치 후 사용합니다. 개발 환경에서 WASM 경로 문제가 있으면 `poseLandmarker.worker.js`의 `DEFAULT_WASM_PATH`를 CDN 또는 local public 경로로 바꾸면 됩니다.

## 실행

```bash
npm install
npm run dev
```

주의:

```bash
npm install
```

을 다시 실행해야 `@mediapipe/tasks-vision` 의존성이 설치됩니다.

## 다음 리팩토링 후보

1. 프레임을 React state에 base64로 저장하지 않고 `ObjectURL` 또는 `<canvas>` 직접 갱신으로 최적화
2. Worker 입력 queue를 latest-frame-drop 방식으로 더 엄격하게 제한
3. Electron/Tauri 패키징 후 `public/wasm`에 MediaPipe WASM을 포함해 완전 오프라인화
4. Chair Stand 외 확정된 STEADI 범위 규칙 추가

## MediaPipe WASM loading note

The pose worker loads MediaPipe WASM files from the local Vite public path:

```txt
Vite asset URL imports (?url)
```

Do not point `FilesetResolver.forVisionTasks()` at jsDelivr or another CDN for the default app flow. In many school, company, or public Wi-Fi environments, CDN dynamic imports such as `vision_wasm_internal.js` can fail even though the app itself is reachable.

Before running the app, copy the WASM files from the npm package:

```bash
npm install
npm run prepare:mediapipe
npm run dev
```

The normal `npm run dev`, `npm run client`, and `npm run build` commands already call `prepare:mediapipe` first.
