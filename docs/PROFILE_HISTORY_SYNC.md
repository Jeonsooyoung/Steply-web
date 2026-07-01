# Steply Web Profile Query & History Sync

## PC responsibility

The PC Web app is now the analysis host:

1. Creates QR session
2. Receives mobile profile payload
3. Shows a profile query button in the left rail
4. Receives mobile camera frames
5. Runs MediaPipe worker analysis
6. Saves final history
7. Broadcasts final results back to the mobile WebSocket client

## Profile fields shown on PC

- name / displayName
- age
- gender
- heightCm
- movementNotes
- safetyNote

Click `프로필 정보 조회` to re-fetch the current session status from the server and refresh the connected profile card.

## Result sync back to mobile

When `/api/analysis/final` is called, `analysisService.saveFinalResult()` stores the result in PC `data/history.json` and broadcasts:

```json
{
  "type": "final",
  "result": { ... }
}
```

The Android camera WebSocket listens for this final message and stores the result in local Room history.
