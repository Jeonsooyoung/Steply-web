export const journeySteps = [
  {
    id: 'assessment',
    number: 1,
    title: 'Assessment',
    description: 'Camera setup and balance mission',
    activeWhen: ['start', 'analysis'],
  },
  {
    id: 'weakness',
    number: 2,
    title: 'Weakness Analysis',
    description: 'Supportive movement insight',
    activeWhen: ['result'],
  },
  {
    id: 'recommendation',
    number: 3,
    title: 'Exercise Recommendation',
    description: 'Safe next exercise',
    activeWhen: ['result'],
  },
  {
    id: 'practice',
    number: 4,
    title: 'Recommended Practice',
    description: 'Safe exercise plan',
    activeWhen: ['exercise'],
  },
  {
    id: 'progress',
    number: 5,
    title: 'Progress Tracking',
    description: 'Last five sessions',
    activeWhen: ['progress', 'start'],
  },
];
