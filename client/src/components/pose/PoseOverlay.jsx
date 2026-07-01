import { PoseConnections } from '../../pose/poseLandmarks';

function pointByName(landmarks) {
  const map = new Map();
  for (const point of landmarks || []) {
    if ((point.visibility ?? 1) >= 0.35) map.set(point.name, point);
  }
  return map;
}

export function PoseOverlay({ landmarks }) {
  const pointMap = pointByName(landmarks);
  if (!landmarks?.length) return null;

  return (
    <svg className="pose-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {PoseConnections.map(([from, to]) => {
        const a = pointMap.get(from);
        const b = pointMap.get(to);
        if (!a || !b) return null;
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x * 100}
            y1={a.y * 100}
            x2={b.x * 100}
            y2={b.y * 100}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {landmarks
        .filter((point) => (point.visibility ?? 1) >= 0.35)
        .map((point) => (
          <circle
            key={point.name}
            cx={point.x * 100}
            cy={point.y * 100}
            r="0.9"
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}
