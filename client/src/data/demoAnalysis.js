import { demoProfile } from './demoProfile';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function buildRealtimePayload(sessionId, selectedTest) {
  const score = randomInt(76, 94);
  const count = randomInt(6, 10);

  return {
    sessionId,
    userId: demoProfile.id,
    testType: selectedTest || 'chair_stand',
    timestampMs: Date.now(),
    score,
    confidence: randomInt(83, 96) / 100,
    fullBodyVisible: true,
    flags: score >= 86
      ? ['Stable chair stand rhythm', 'Clear full-body view', 'Balanced shoulder line']
      : ['Slight forward lean', 'Good full-body visibility', 'Practice slow sitting control'],
    message: score >= 86
      ? 'Great rhythm. Keep your shoulders relaxed and stand tall.'
      : 'Nice effort. Try to sit down a little more slowly.',
    features: {
      chairStandCount: count,
      remainingSeconds: randomInt(8, 24),
      stability: randomInt(82, 94),
      shoulderSlopeDeg: randomInt(1, 5),
      hipSlopeDeg: randomInt(1, 4),
      bodyCenterSway: randomInt(8, 16) / 10,
    },
  };
}
