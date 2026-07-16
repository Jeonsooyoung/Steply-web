export const homeMetrics = [
  { icon: 'shieldAlert', label: 'Fall Risk Level', value: 'Moderate', note: 'No change', tone: 'amber' },
  { icon: 'calendarCheck', label: 'Sessions Completed', value: '5 / 5', note: '100% of goal' },
  { icon: 'accessibility', label: 'Chair Stand Reps', value: '12', note: '2 more from last check' },
  { icon: 'personStanding', label: 'Tandem Hold', value: '25 sec', note: 'Personal best' },
];

export const assessmentSteps = [
  {
    number: '01',
    category: 'SETUP',
    icon: 'smartphone',
    title: 'Connect your camera',
    description: 'Pair your phone or use this computer camera for a full-body view.',
    action: 'Connect Camera',
    href: '/display/connect',
  },
  {
    number: '02',
    category: 'ASSESSMENT',
    icon: 'scale',
    title: '4-Stage Balance Test',
    description: 'Complete four standing positions with clear, guided instructions.',
    action: 'Start Balance Test',
    href: '/display/assessment/balance/live',
  },
  {
    number: '03',
    category: 'ASSESSMENT',
    icon: 'accessibility',
    title: '30-Second Chair Stand Test',
    description: 'Stand up and sit down safely for 30 seconds to measure lower-body strength.',
    action: 'Start Chair Stand Test',
    href: '/display/assessment/chair/live',
  },
  {
    number: '04',
    category: 'RESULTS',
    icon: 'scan',
    title: 'Review posture results',
    description: 'See your balance score, alignment observations, and recommended focus areas.',
    action: 'View Latest Results',
    href: '/display/results/summary',
  },
];

export const assessmentSafetyItems = [
  'Clear the floor around you.',
  'Keep a stable chair or wall within reach.',
  'Wear non-slip shoes or socks.',
  'Stop immediately if you feel pain or dizziness.',
];
