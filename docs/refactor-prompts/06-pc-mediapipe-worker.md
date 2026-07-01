# 06. PC MediaPipe Worker 리팩토링 단위

목표: 모바일의 MediaPipe 분석 책임을 PC로 옮기되, UI 반응성을 위해 분석을 Worker에서 실행한다.

## 작업 단위

1. `public/models/pose_landmarker_lite.task` 추가
2. `client/src/pose/poseLandmarks.js` 추가
3. `client/src/pose/steadiRules.js` 추가
4. `client/src/pose/recommendationRules.js` 추가
5. `client/src/pose/chairStandAnalyzer.js` 추가
6. `client/src/pose/poseLandmarker.worker.js` 추가
7. `client/src/hooks/useRemotePoseAnalysis.js` 추가
8. `client/src/components/pose/PoseOverlay.jsx` 추가
9. `AnalysisPanel.jsx`에서 worker 상태, count, phase, skeleton overlay 표시
10. `package.json`에 `@mediapipe/tasks-vision` 추가

## 검증 포인트

- QR 연결 전: 분석 대기 상태가 보여야 한다.
- 모바일 송출 시작 후: PC 화면에 프레임이 보여야 한다.
- Worker ready 후: skeleton overlay가 그려져야 한다.
- 전신이 안 보이면 full body warning이 떠야 한다.
- 앉은 자세 → 완전히 선 자세가 안정적으로 잡히면 카운트가 증가해야 한다.
- 팔을 짚고 일어나는 동작이 감지되면 official score 0점 메시지가 떠야 한다.
- 결과 저장 버튼을 누르면 history에 final result가 저장되어야 한다.
