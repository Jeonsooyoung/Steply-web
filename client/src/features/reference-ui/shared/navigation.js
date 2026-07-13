import { navigateSpa } from '../../../routes/spaNavigation';

export const referenceNavItems = [
  { label: 'Home', icon: 'home', href: '/display/home' },
  { label: 'Assessment', icon: 'clipboardCheck', href: '/display/session/plan' },
  { label: 'Exercise', icon: 'personStanding', href: '/display/exercises/plan' },
  { label: 'Progress', icon: 'chart', href: null, interactive: false },
  { label: 'Reports', icon: 'fileText', href: '/display/reports' },
  { label: 'Settings', icon: 'settings', href: '/display/settings' },
  { label: 'Help', icon: 'help', href: null, interactive: false },
];

export function goTo(path) {
  navigateSpa(path);
}
