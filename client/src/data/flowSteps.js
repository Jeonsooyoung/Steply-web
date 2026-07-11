export const journeySteps = [
  {
    id: 'assessment',
    number: 1,
    title: 'CDC STEADI Questions',
    description: 'Short screening questions and movement checks',
    activeWhen: ['start', 'analysis'],
  },
  {
    id: 'motion-review',
    number: 2,
    title: 'Camera Motion Review',
    description: 'Camera view and movement quality check',
    activeWhen: ['result'],
  },
  {
    id: 'recommendation',
    number: 3,
    title: 'Movement Result',
    description: 'Hold time, chair stands, support, and validity',
    activeWhen: ['result'],
  },
  {
    id: 'practice',
    number: 4,
    title: 'Otago Exercise Programme',
    description: 'Recommended exercises for safe practice',
    activeWhen: ['exercise'],
  },
  {
    id: 'progress',
    number: 5,
    title: 'Care Plan',
    description: 'Next action, review timing, and reports',
    activeWhen: ['progress', 'start'],
  },
];
