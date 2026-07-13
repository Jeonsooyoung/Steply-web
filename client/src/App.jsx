import { useEffect, useMemo, useRef, useState } from 'react';
import { useSteplyDashboard } from './hooks/useSteplyDashboard';
import { FoundationRouteApp } from './routes/RouteScaffold';
import { isSteplyFoundationPath, matchSteplyRoute } from './routes/steplyRoutes';
import { STEPLY_NAVIGATE_EVENT } from './routes/spaNavigation';
import './styles/app.css';
import './styles/reference-ui.css';

function normalizeEntryLocation() {
  if (typeof window === 'undefined') return;
  const pathname = window.location.pathname;
  const normalizedPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  let targetPath = null;
  if (normalizedPath === '/' || normalizedPath === '/index.html') targetPath = '/display/connect';
  else if (normalizedPath === '/display') targetPath = '/display/home';
  else if (normalizedPath === '/camera') targetPath = '/camera/connect';
  else if (!isSteplyFoundationPath(normalizedPath)) targetPath = '/display/home';
  if (targetPath) window.history.replaceState(window.history.state, '', targetPath);
}

function unavailableRoute(pathname) {
  const isCameraRoute = pathname.startsWith('/camera');
  return {
    id: isCameraRoute ? 'camera_not_found' : 'display_not_found',
    namespace: isCameraRoute ? 'camera' : 'display',
    path: pathname,
    title: 'Screen not found',
    eyebrow: 'Steply',
    instruction: 'This Steply screen is not available yet.',
    description: 'Return to the home screen and choose another step.',
    primaryAction: 'Return home',
    secondaryAction: 'Go back',
    icon: '!',
    status: 'Screen unavailable',
    cards: ['Route checked', 'No clinical logic changed'],
    params: {},
  };
}

export default function App() {
  normalizeEntryLocation();
  const [pathname, setPathname] = useState(() => (
    typeof window === 'undefined' ? '/display/home' : window.location.pathname
  ));
  const dashboard = useSteplyDashboard();
  const hasRequestedInitialQrRef = useRef(false);
  const route = useMemo(() => {
    const matched = matchSteplyRoute(pathname);
    return matched || unavailableRoute(pathname);
  }, [pathname]);

  useEffect(() => {
    document.documentElement.lang = 'en-US';
    document.documentElement.setAttribute('data-steply-locale', 'en-US');
  }, []);

  useEffect(() => {
    const syncLocation = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncLocation);
    window.addEventListener(STEPLY_NAVIGATE_EVENT, syncLocation);
    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener(STEPLY_NAVIGATE_EVENT, syncLocation);
    };
  }, []);

  useEffect(() => {
    const shouldCreateQr = route.id === 'display_connect' && !dashboard.session?.profile;
    if (!shouldCreateQr || dashboard.sessionBundle || dashboard.busy || hasRequestedInitialQrRef.current) return;
    hasRequestedInitialQrRef.current = true;
    dashboard.handleCreateSession();
  }, [dashboard.busy, dashboard.handleCreateSession, dashboard.session?.profile, dashboard.sessionBundle, route.id]);

  useEffect(() => {
    if (dashboard.session?.profile) hasRequestedInitialQrRef.current = false;
  }, [dashboard.session?.profile]);

  return <FoundationRouteApp route={route} dashboard={dashboard} />;
}
