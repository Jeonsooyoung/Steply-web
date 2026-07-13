export const postureMetrics = [
  { icon: 'scale', label: 'Balance Score', value: '86 /100', note: 'Great · 6 points higher than last time' },
  { icon: 'accessibility', label: 'Chair Stand Reps', value: '12 reps', note: 'Above average · 2 more than last time', tone: 'amber' },
  { icon: 'shieldCheck', label: 'Stability Level', value: 'Stable', note: 'Consistent · Same as last time' },
  { icon: 'shieldAlert', label: 'Fall Risk Level', value: 'Low', note: 'Keep it up! · Same as last time', tone: 'amber' },
];

export const alignmentRows = [
  ['Head', 'Aligned'],
  ['Shoulders', 'Aligned'],
  ['Trunk', 'Stable'],
  ['Hips', 'Aligned'],
  ['Knees', 'Mild sway'],
  ['Feet', 'Aligned'],
];

export const postureObservations = [
  'Your posture is well-centered and balanced.',
  'Your trunk control is steady.',
  'Slight sway detected at the knees.',
  'You show good stability during the test.',
];

export const balanceStages = ['Side-by-side', 'Semi-tandem', 'Tandem', 'One-leg'];

export function balanceInstructions(stage) {
  if (stage === 1) return ['Stand upright', 'Keep feet together', 'Do not hold support', 'Hold for 10 seconds'];
  return ['Stand upright', `Use the ${balanceStages[stage - 1].toLowerCase()} position`, 'Keep support within reach', 'Hold for 10 seconds'];
}
