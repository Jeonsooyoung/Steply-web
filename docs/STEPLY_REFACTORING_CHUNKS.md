# Steply 리팩토링 작업 단위

목표는 한 번에 전부 갈아엎지 않고, 기존 Steply-Web을 유지하면서 데스크톱 앱형 UI로 안전하게 개선하는 것이다.

현재 프로젝트에서 먼저 처리한 내용:

- `client/src/styles/app.css` 1,075줄을 역할별 CSS 파일로 분리
- 화면/데모 데이터 상수를 `client/src/data/*`로 분리
- 기존 컴포넌트 동작 방식은 유지
- `npm run check` 통과 확인

> 주의: 이 ZIP 안에는 `node_modules`가 없어서 이 환경에서는 `npm run build`가 `vite: not found`로 실패했다. 실제 PC에서는 `npm install` 후 `npm run build`로 확인하면 된다.

---

## 전체 리팩토링 순서

```txt
1단계: 데이터 상수 분리             ← 완료
2단계: CSS 파일 역할별 분리         ← 완료
3단계: 화면 흐름 상태 이름 정리
4단계: Safety / Camera / Countdown 화면 추가
5단계: 30초 Chair Stand 세션 로직 분리
6단계: 데스크톱 패키징 준비
7단계: MediaPipe/모바일 연동부 연결
```

---

## 1단계. 데이터 상수 분리

### 목표
컴포넌트 안에 박혀 있는 운동 목록, 추천 운동, 데모 프로필, 데모 분석 데이터를 따로 빼서 수정하기 쉽게 만든다.

### 수정 파일

```txt
client/src/data/movementTests.js
client/src/data/recommendationExercises.js
client/src/data/flowSteps.js
client/src/data/demoProfile.js
client/src/data/demoAnalysis.js
client/src/components/StartPanel.jsx
client/src/components/ExercisePanel.jsx
client/src/components/JourneyFlow.jsx
client/src/hooks/useSteplyDashboard.js
```

### 완료 기준

- 운동 종류 추가/수정 시 `StartPanel.jsx`를 건드리지 않아도 된다.
- 추천 운동 추가/수정 시 `ExercisePanel.jsx`를 건드리지 않아도 된다.
- 데모 프로필/데모 실시간 결과 수정 시 hook을 건드리지 않아도 된다.

---

## 2단계. CSS 파일 분리

### 목표
`app.css` 하나에 몰린 스타일을 역할별로 쪼개서 디자인 수정 난이도를 낮춘다.

### 현재 구조

```txt
client/src/styles/app.css                 # import entry
client/src/styles/tokens.css              # 색상, 그림자, radius 등 디자인 토큰
client/src/styles/layout.css              # 전체 shell, top bar, 기본 레이아웃
client/src/styles/primitives.css          # Card/Button/Pill 공통 UI
client/src/styles/rail.css                # 왼쪽 세션/QR/프로필 패널
client/src/styles/flow.css                # JourneyFlow, 화면 fade transition
client/src/styles/screens/start.css       # 시작 화면, 히어로, 운동 선택 카드
client/src/styles/screens/analysis.css    # 실시간 분석/운동 세션 화면
client/src/styles/screens/result.css      # 결과 화면
client/src/styles/screens/exercise.css    # 추천 운동 화면
client/src/styles/screens/history.css     # 히스토리 화면
client/src/styles/responsive.css          # 반응형, reduced motion
```

### 완료 기준

- 색상 변경은 `tokens.css`에서만 한다.
- 카드/버튼 공통 모양은 `primitives.css`에서만 한다.
- 특정 화면 디자인은 `screens/*.css`만 보면 된다.

---

## 3단계. 화면 흐름 상태 이름 정리

### 목표
현재 `start → analysis → result → exercise` 흐름을 실제 운동 세션에 맞게 더 세분화한다.

### 추천 상태

```txt
profile_select
safety_setup
camera_check
countdown
chair_stand_session
result
recommendation
```

### 수정 파일

```txt
client/src/data/flowSteps.js
client/src/hooks/useSteplyDashboard.js
client/src/App.jsx
client/src/components/JourneyFlow.jsx
```

### 구현 방식
처음에는 기존 `analysis` 화면을 바로 없애지 말고, 새 상태를 추가한 뒤 하나씩 연결한다.

```txt
start 기존 유지
→ safety_setup 추가
→ camera_check 추가
→ countdown 추가
→ chair_stand_session 추가
→ 기존 result/exercise 연결
```

### 완료 기준

- JourneyFlow에서 현재 단계가 정확히 보인다.
- 각 화면은 버튼으로 다음 단계로 넘어간다.
- 기존 QR/세션 생성 기능은 깨지지 않는다.

---

## 4단계. Safety / Camera / Countdown 화면 추가

### 목표
링피트처럼 바로 분석 화면으로 들어가지 않고, 운동 전 준비 흐름을 만든다.

### 새 파일 추천

```txt
client/src/components/SafetySetupPanel.jsx
client/src/components/CameraCheckPanel.jsx
client/src/components/CountdownPanel.jsx
client/src/styles/screens/safety.css
client/src/styles/screens/camera.css
client/src/styles/screens/countdown.css
```

### 화면별 역할

```txt
SafetySetupPanel
- 안전 안내 문구
- 체크박스
- 시작 버튼

CameraCheckPanel
- 카메라 영역 placeholder
- 전신 감지 상태
- 좋은 카메라 배치 안내

CountdownPanel
- 3, 2, 1 카운트다운
- 자동으로 chair_stand_session 이동
```

### 완료 기준

- 안전 체크 전에는 운동 시작이 안 된다.
- 카메라 확인 화면에서 전신이 보이는지 안내한다.
- 카운트다운 후 운동 세션 화면으로 넘어간다.

---

## 5단계. 30초 Chair Stand 세션 로직 분리

### 목표
`AnalysisPanel`을 진짜 운동 세션 화면으로 바꾼다. MVP에서는 AI 카운트 대신 `+1회` 버튼과 30초 타이머를 쓴다.

### 새 파일 추천

```txt
client/src/hooks/useChairStandSession.js
client/src/components/ChairStandSessionPanel.jsx
client/src/utils/recommendationRules.js
```

### hook 역할

```txt
useChairStandSession
- remainingSeconds
- count
- isRunning
- start()
- incrementCount()
- finish()
- reset()
```

### 추천 규칙 예시

```txt
0~4회: Supported Balance Hold + Assisted Standing Hold
5~8회: Supported Chair Stand Practice + Gentle Weight Shift
9회 이상: Gentle Chair Stand Practice + Standing Hold
```

### 완료 기준

- 30초가 지나면 자동으로 result로 이동한다.
- `+1회` 버튼으로 횟수가 증가한다.
- 결과 화면에는 count/score/recommendation이 넘어간다.

---

## 6단계. 데스크톱 패키징 준비

### 목표
웹앱을 브라우저가 아니라 컴퓨터 앱처럼 실행할 수 있게 만든다.

### 추천 순서

```txt
1. 지금 구조 유지
2. Electron 또는 Tauri 추가
3. npm run desktop 명령어 추가
4. 앱 시작 시 로컬 서버 + Vite 화면 실행
5. 전체화면 또는 kiosk mode 옵션 추가
```

### Electron 추가 시 파일 예시

```txt
electron/main.js
```

### 완료 기준

- `npm run desktop`으로 앱 창이 열린다.
- 주소창 없는 Steply 앱처럼 보인다.
- 기존 웹 실행 방식도 유지된다.

---

## 7단계. MediaPipe / 모바일 연동부 연결

### 목표
MVP 데모 로직을 실제 포즈 분석 결과와 연결한다.

### 연결 포인트

```txt
postRealtimeAnalysis(payload)
postFinalAnalysis(payload)
useSteplyDashboard.handleDemoRealtime
useSteplyDashboard.handleSaveFinal
ChairStandSessionPanel의 카운트/결과 payload
```

### 완료 기준

- 모바일/카메라 분석 결과가 realtime panel에 들어온다.
- final result가 history에 저장된다.
- demo mode와 real mode를 분리해서 테스트할 수 있다.

---

## 추천 작업 방식

각 단계마다 아래 순서로 진행한다.

```bash
npm run check
npm run build
npm run dev
```

브라우저에서 확인할 것:

```txt
1. 화면이 정상 출력되는지
2. QR 세션 생성이 되는지
3. 버튼 클릭 시 단계 이동이 되는지
4. 결과 저장이 되는지
5. History 카드가 갱신되는지
```

---

## 다음에 바로 진행하기 좋은 작업

가장 추천하는 다음 작업은 **3단계 + 4단계**다.

즉, 아래 화면 흐름을 추가하면 된다.

```txt
StartPanel
→ SafetySetupPanel
→ CameraCheckPanel
→ CountdownPanel
→ ChairStandSessionPanel
→ ResultPanel
→ ExercisePanel
```

이렇게 하면 현재 웹 대시보드 느낌에서 벗어나서, 컴퓨터 앱/운동 코치 앱처럼 보이기 시작한다.
