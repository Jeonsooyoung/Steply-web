# 모바일 앱 ↔ PC 웹 연동 계약

이 버전의 모바일 앱은 분석을 하지 않습니다.

```txt
모바일 책임: 프로필 저장/선택 + QR 연결 + 카메라 프레임 송출
PC 웹 책임: MediaPipe 키포인트 추출 + 자세 분석 + 결과 저장
```

## QR payload

웹 QR 코드에는 아래 JSON 문자열이 들어갑니다.

```json
{
  "type": "steply-web-session",
  "sessionId": "SESSION_ID",
  "serverUrl": "http://YOUR_PC_IP:3000"
}
```

## 모바일 처리 순서

```text
QR 스캔
→ SteplyWebSessionLink.parse(rawQr)
→ 선택된 Profile 조회
→ SteplyWebClient.connectProfile(session, profile)
→ WebSocket 연결: ws://SERVER/ws?sessionId=SESSION_ID&role=mobile
→ CameraX 프레임을 JPEG binary로 송출
→ 송출 종료 시 stopped 메시지 전송
```

## PC 처리 순서

```text
JPEG binary 수신
→ dashboardSocket에서 dashboard로 remote-camera-frame broadcast
→ React dashboard가 frame 표시
→ useRemotePoseAnalysis가 Pose Worker로 frame 전달
→ poseLandmarker.worker.js에서 MediaPipe PoseLandmarker 실행
→ chairStandAnalyzer.js에서 자세 분석
→ UI에 keypoint overlay/count/warning 표시
→ 결과 저장 버튼 클릭 시 /api/analysis/final 저장
```

## 실시간성 기준

권장 FPS:

```text
Mobile Camera preview: 30fps
Mobile JPEG websocket send: 8~12fps
PC MediaPipe inference worker: 약 10fps 제한
PC UI state update: latest frame 중심
Final history save: 검사 종료 시 1회
```

## 더 이상 모바일이 보내지 않는 것

```txt
MediaPipe landmark payload
Chair Stand realtime analysis payload
posture warning payload
final analysis result payload
recommendation payload
```

분석 payload는 PC에서 생성합니다.
