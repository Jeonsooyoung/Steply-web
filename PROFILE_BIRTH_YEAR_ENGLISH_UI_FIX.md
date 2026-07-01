# Profile / Birth Year / English UI Fix

This patch updates the PC dashboard to use English UI copy and show the linked mobile profile with `Birth Year` instead of `Age`.

The PC session API now normalizes linked profiles with:

- id
- displayName / name
- birthYear
- derived age for internal compatibility
- gender
- heightCm
- movementNotes
- safetyNote
- createdAt / updatedAt

The mobile app still owns profile and history storage. The PC receives the profile through QR linking, runs MediaPipe analysis, saves the final result, and broadcasts the final result back to the phone for local history storage.
