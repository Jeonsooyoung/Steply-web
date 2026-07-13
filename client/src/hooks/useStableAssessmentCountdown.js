import { useEffect, useRef, useState } from 'react';
import {
  ASSESSMENT_AUTO_START_COUNTDOWN_MS,
  assessmentAutoStartSecondsRemaining,
} from '../pipeline/ui/assessmentAutoStart.js';

export function useStableAssessmentCountdown({
  ready,
  completionReady = ready,
  onComplete,
  countdownMs = ASSESSMENT_AUTO_START_COUNTDOWN_MS,
} = {}) {
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!ready) {
      completedRef.current = false;
      setRemainingSeconds(null);
      return undefined;
    }

    const startedAt = Date.now();
    completedRef.current = false;
    setRemainingSeconds(assessmentAutoStartSecondsRemaining(0, countdownMs));
    const intervalId = window.setInterval(() => {
      setRemainingSeconds(assessmentAutoStartSecondsRemaining(Date.now() - startedAt, countdownMs));
    }, 1000);
    const timeoutId = window.setTimeout(() => {
      setRemainingSeconds(0);
    }, countdownMs);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [countdownMs, ready]);

  useEffect(() => {
    if (!ready || !completionReady || remainingSeconds !== 0 || completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  }, [completionReady, ready, remainingSeconds]);

  return remainingSeconds;
}
