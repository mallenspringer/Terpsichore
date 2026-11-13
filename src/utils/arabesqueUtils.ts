import { ArabesqueCurlBandPreset, ArabesqueSeedArrangement } from '../state/types';

export const ARABESQUE_CURL_BAND_RANGES: Record<
  ArabesqueCurlBandPreset,
  { label: string; minHz: number; maxHz: number }
> = {
  tenor: { label: 'Tenor / Low Lead (130-450 Hz)', minHz: 130, maxHz: 450 },
  alto: { label: 'Alto / Warm Lead (260-850 Hz)', minHz: 260, maxHz: 850 },
  soprano: { label: 'Soprano / High Melody (550-1750 Hz)', minHz: 550, maxHz: 1750 },
  full_mid: { label: 'Full Melodic (130-1750 Hz)', minHz: 130, maxHz: 1750 }
};

export const ARABESQUE_BASS_SURGE_RANGE = { minHz: 30, maxHz: 140 };
export const ARABESQUE_HF_BRANCH_RANGE = { minHz: 4200, maxHz: 18000 };

/**
 * Resolves the [minHz, maxHz] band for melodic curl tightness,
 * shifted by tuneOctaves (-0.5..+0.5) using pow(2, tuneOctaves).
 */
export function resolveArabesqueCurlBandHz(
  preset: ArabesqueCurlBandPreset = 'full_mid',
  tuneOctaves: number = 0.0
): { minHz: number; maxHz: number } {
  const base = ARABESQUE_CURL_BAND_RANGES[preset] ?? ARABESQUE_CURL_BAND_RANGES.full_mid;
  const clampedTune = Math.max(-0.5, Math.min(0.5, tuneOctaves));
  const mult = Math.pow(2, clampedTune);
  return {
    minHz: Math.round(base.minHz * mult),
    maxHz: Math.round(base.maxHz * mult)
  };
}

export interface ArabesqueSeedAnchor {
  x: number;
  y: number;
  angle: number;
}

/**
 * Computes static seed positions and initial shoot headings in aspect-normalized
 * world space (y in [-1, 1], x in [-aspect, aspect]).
 */
export function computeSeedAnchors(
  arrangement: ArabesqueSeedArrangement,
  seedCount: number,
  spread: number,
  aspect: number
): ArabesqueSeedAnchor[] {
  const count = Math.max(1, Math.min(8, Math.round(seedCount)));
  const s = Math.max(0.1, Math.min(1.2, spread));
  const a = Math.max(0.5, aspect);
  const anchors: ArabesqueSeedAnchor[] = [];

  if (arrangement === 'center') {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (count === 1 ? Math.PI * 0.25 : 0);
      const offsetR = count > 1 ? 0.04 * s : 0.0;
      anchors.push({
        x: Math.cos(ang) * offsetR,
        y: Math.sin(ang) * offsetR,
        angle: ang
      });
    }
    return anchors;
  }

  if (arrangement === 'ring') {
    const r = 0.56 * s;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count - Math.PI * 0.5;
      anchors.push({
        x: Math.cos(ang) * r * Math.min(a, 1.35),
        y: Math.sin(ang) * r,
        angle: ang // Radiate outward from ring
      });
    }
    return anchors;
  }

  if (arrangement === 'horizontal') {
    const halfSpan = 0.72 * s * a;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const dirY = i % 2 === 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      anchors.push({
        x: t * halfSpan,
        y: 0,
        angle: dirY
      });
    }
    return anchors;
  }

  if (arrangement === 'vertical') {
    const halfSpan = 0.72 * s;
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const dirX = i % 2 === 0 ? 0 : Math.PI;
      anchors.push({
        x: 0,
        y: t * halfSpan,
        angle: dirX
      });
    }
    return anchors;
  }

  if (arrangement === 'diagonal') {
    const halfX = 0.68 * s * a;
    const halfY = 0.68 * s;
    const baseNormal = Math.atan2(-1, 1);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const flip = i % 2 === 0 ? 0 : Math.PI;
      anchors.push({
        x: t * halfX,
        y: t * halfY,
        angle: baseNormal + flip
      });
    }
    return anchors;
  }

  // 'corners': perimeter corner/edge placements aiming inward toward center
  const perimeterSpots: Array<[number, number]> = [
    [-0.82 * a, 0.78],
    [0.82 * a, 0.78],
    [0.82 * a, -0.78],
    [-0.82 * a, -0.78],
    [0.0, 0.84],
    [0.88 * a, 0.0],
    [0.0, -0.84],
    [-0.88 * a, 0.0]
  ];
  for (let i = 0; i < count; i++) {
    const [px, py] = perimeterSpots[i % perimeterSpots.length];
    const x = px * s;
    const y = py * s;
    const inwardAng = Math.atan2(-y, -x);
    anchors.push({ x, y, angle: inwardAng });
  }
  return anchors;
}

