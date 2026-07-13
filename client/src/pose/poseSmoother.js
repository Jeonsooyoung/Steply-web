import { normalizePoseLandmarks } from './poseTimeSeries';
import { stage2Operational } from '../pipeline/shared/config/stage2Analysis.config.js';

export const PoseSmoothingModes = {
  Balance: 'BALANCE',
  Chair: 'CHAIR',
};

const MODE_CONFIG = {
  [PoseSmoothingModes.Balance]: {
    minVisibility: stage2Operational.signal.missingVisibilityThreshold,
    outlierDistance: stage2Operational.signal.smoothing.BALANCE.outlierDistance,
    maxInterpolationFrames: stage2Operational.signal.maxInterpolationFrames,
    interpolationVisibilityDecay: stage2Operational.signal.smoothing.BALANCE.interpolationVisibilityDecay,
  },
  [PoseSmoothingModes.Chair]: {
    minVisibility: stage2Operational.signal.missingVisibilityThreshold,
    outlierDistance: stage2Operational.signal.smoothing.CHAIR.outlierDistance,
    maxInterpolationFrames: stage2Operational.signal.maxInterpolationFrames,
    interpolationVisibilityDecay: stage2Operational.signal.smoothing.CHAIR.interpolationVisibilityDecay,
  },
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smoothingFactor(deltaSeconds, cutoffHz) {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / Math.max(deltaSeconds, 0.000001));
}

function lowPass(previous, value, alpha) {
  return finite(previous) ? previous + alpha * (value - previous) : value;
}

function oneEuro(previousState, value, timestampMs) {
  const params = stage2Operational.signal.oneEuro;
  if (!previousState || !finite(previousState.filtered) || !finite(previousState.timestampMs)) {
    return { filtered: value, derivative: 0, timestampMs };
  }
  const dt = Math.max((timestampMs - previousState.timestampMs) / 1000, 1 / stage2Operational.signal.targetFps);
  const rawDerivative = (value - previousState.filtered) / dt;
  const derivative = lowPass(previousState.derivative, rawDerivative, smoothingFactor(dt, params.derivativeCutoffHz));
  const cutoff = params.minCutoffHz + params.beta * Math.abs(derivative);
  return {
    filtered: lowPass(previousState.filtered, value, smoothingFactor(dt, cutoff)),
    derivative,
    timestampMs,
  };
}

function landmarkDistance(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) {
    return null;
  }
  const dz = finite(first.z) && finite(second.z) ? first.z - second.z : 0;
  return Math.hypot(first.x - second.x, first.y - second.y, dz);
}

function interpolatedPoint(previous, config) {
  if (!previous) return null;
  return {
    ...previous,
    visibility: clamp((previous.visibility ?? 0) * config.interpolationVisibilityDecay),
    interpolated: true,
  };
}

export function smoothingModeForTest(testType = '') {
  if (testType === 'four_stage_balance' || testType === 'balance_hold' || testType === 'standing_posture') {
    return PoseSmoothingModes.Balance;
  }
  return PoseSmoothingModes.Chair;
}

export class PoseSmoother {
  constructor({ mode = PoseSmoothingModes.Chair } = {}) {
    this.mode = mode;
    this.config = MODE_CONFIG[mode] || MODE_CONFIG[PoseSmoothingModes.Chair];
    this.reset();
  }

  setMode(mode) {
    const nextMode = MODE_CONFIG[mode] ? mode : PoseSmoothingModes.Chair;
    if (nextMode === this.mode) return;
    this.mode = nextMode;
    this.config = MODE_CONFIG[nextMode];
    this.reset();
  }

  reset() {
    this.previousByName = new Map();
    this.sequence = 0;
    this.filterStateByName = new Map();
  }

  smooth(rawLandmarks = [], { timestampMs = Date.now() } = {}) {
    const normalized = normalizePoseLandmarks(rawLandmarks);
    const nextByName = new Map();
    let rawVisibleCount = 0;
    let smoothedVisibleCount = 0;
    let interpolatedCount = 0;
    let rejectedOutlierCount = 0;

    const landmarks = normalized.map((raw) => {
      const previousState = this.previousByName.get(raw.name);
      const previous = previousState?.point || null;
      const rawVisibility = clamp(raw.visibility ?? 0);
      const rawVisible = rawVisibility >= this.config.minVisibility && finite(raw.x) && finite(raw.y);
      if (rawVisible) rawVisibleCount += 1;

      let point = null;
      let rejectedOutlier = false;
      if (rawVisible) {
        const jump = landmarkDistance(raw, previous);
        rejectedOutlier = Boolean(
          previous
            && (previous.visibility ?? 0) >= this.config.minVisibility
            && finite(jump)
            && jump > this.config.outlierDistance
        );
        if (rejectedOutlier) {
          rejectedOutlierCount += 1;
          point = {
            ...previous,
            visibility: clamp(Math.min(previous.visibility ?? 0, rawVisibility) * stage2Operational.signal.outlierVisibilityRetention),
            outlierRejected: true,
          };
        } else {
          const previousFilters = this.filterStateByName.get(raw.name) || {};
          const xFilter = oneEuro(previousFilters.x, raw.x, timestampMs);
          const yFilter = oneEuro(previousFilters.y, raw.y, timestampMs);
          const zFilter = finite(raw.z) ? oneEuro(previousFilters.z, raw.z, timestampMs) : null;
          this.filterStateByName.set(raw.name, { x: xFilter, y: yFilter, z: zFilter });
          point = {
            ...raw,
            x: xFilter.filtered,
            y: yFilter.filtered,
            z: zFilter?.filtered ?? raw.z,
            visibility: clamp(raw.visibility ?? 0),
            filter: 'ONE_EURO',
          };
        }
      } else if (previousState && previousState.missingFrames < this.config.maxInterpolationFrames) {
        const filters = this.filterStateByName.get(raw.name);
        const dt = 1 / stage2Operational.signal.targetFps;
        point = {
          ...interpolatedPoint(previous, this.config),
          x: previous.x + (filters?.x?.derivative || 0) * dt,
          y: previous.y + (filters?.y?.derivative || 0) * dt,
          z: finite(previous.z) ? previous.z + (filters?.z?.derivative || 0) * dt : previous.z,
          interpolation: 'LINEAR_MAX_3_FRAMES',
        };
        interpolatedCount += 1;
      } else {
        point = { ...raw, visibility: 0 };
      }

      if ((point.visibility ?? 0) >= this.config.minVisibility) smoothedVisibleCount += 1;
      nextByName.set(raw.name, {
        point,
        missingFrames: rawVisible && !rejectedOutlier ? 0 : (previousState?.missingFrames || 0) + 1,
      });
      return point;
    });

    this.previousByName = nextByName;
    this.sequence += 1;

    return {
      landmarks,
      rawLandmarks: normalized,
      smoothing: {
        mode: this.mode,
        timestampMs,
        sequence: this.sequence,
        rawVisibleCount,
        smoothedVisibleCount,
        interpolatedCount,
        rejectedOutlierCount,
      },
    };
  }
}

export function createPoseSmootherForTest(testType) {
  return new PoseSmoother({ mode: smoothingModeForTest(testType) });
}
