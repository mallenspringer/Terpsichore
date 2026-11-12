import { DataMoshKeyframeMode, DataMoshProcessTarget } from '../state/types';

export const DATAMOSH_DEFAULTS = {
  processTarget: 'canvas' as DataMoshProcessTarget,
  vectorGain: 1.5,
  decay: 0.75, // ~12.1s hold duration on perceptual curve
  macroblockSize: 16,
  threshold: 0.06,
  refreshThreshold: 0.45,
  chromaBleed: 0.3,
  biasX: 0.0,
  biasY: 0.0,
  noiseGlitch: 0.0,
  keyframeMode: 'motion_thresh' as DataMoshKeyframeMode,
  keyframeRate: 0.25,
  motionThreshold: 0.4,
};

const HOLD_MIN_SEC = 0.1;
const HOLD_MAX_SEC = 60.0;
const HOLD_BYPASS_DECAY = 0.005;
const HOLD_INFINITE_DECAY = 0.995;

/**
 * Maps normalized decay slider value [0..1] onto a perceptual hold time in seconds:
 * - <= 0.005: 0s (live / off)
 * - 0.005..0.995: exponential curve from 0.1s to 60.0s
 * - >= 0.995: Infinity (infinite hold until refresh or I-frame)
 */
export function decayToHoldSeconds(decay: number): number {
  const clamped = Math.max(0, Math.min(1, decay));
  if (clamped <= HOLD_BYPASS_DECAY) return 0;
  if (clamped >= HOLD_INFINITE_DECAY) return Infinity;
  const t = (clamped - HOLD_BYPASS_DECAY) / (HOLD_INFINITE_DECAY - HOLD_BYPASS_DECAY);
  return HOLD_MIN_SEC * Math.pow(HOLD_MAX_SEC / HOLD_MIN_SEC, t);
}

/**
 * Formats normalized decay [0..1] as a human-readable time label.
 */
export function formatHoldDuration(decay: number): string {
  const holdSec = decayToHoldSeconds(decay);
  if (holdSec === 0) return '0.0s (OFF)';
  if (!Number.isFinite(holdSec)) return '∞ HOLD';
  if (holdSec < 1.0) return `${holdSec.toFixed(2)}s`;
  return `${holdSec.toFixed(1)}s`;
}

/**
 * Computes frame-rate-independent per-frame retention factor [0..1]
 * such that 90% of a static frozen difference clears after `holdSec`.
 */
export function computeFrameRetention(decay: number, dtSec: number): number {
  const holdSec = decayToHoldSeconds(decay);
  if (holdSec === 0) return 0.0;
  if (!Number.isFinite(holdSec) || dtSec <= 0) return 1.0;
  return Math.exp((-2.302585092994046 * dtSec) / holdSec);
}

