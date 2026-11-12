import { GrassGrowthBandPreset } from '../state/types';

export const GRASS_GROWTH_BAND_RANGES: Record<GrassGrowthBandPreset, { label: string; minHz: number; maxHz: number }> = {
  tenor: { label: 'Tenor (130–450 Hz)', minHz: 130, maxHz: 450 },
  alto: { label: 'Alto (260–850 Hz)', minHz: 260, maxHz: 850 },
  soprano: { label: 'Soprano (550–1750 Hz)', minHz: 550, maxHz: 1750 },
  full_mid: { label: 'Full Mid (130–1750 Hz)', minHz: 130, maxHz: 1750 },
};

export const GRASS_HF_PRUNE_RANGE = { minHz: 4500, maxHz: 18000 };
export const GRASS_BASS_WIND_RANGE = { minHz: 30, maxHz: 220 };

/**
 * Resolves tuned [minHz, maxHz] bounds for a growth band preset shifted by `tuneOctaves` [-0.5..+0.5].
 */
export function resolveGrowthBandHz(
  preset: GrassGrowthBandPreset = 'full_mid',
  tuneOctaves = 0.0
): { minHz: number; maxHz: number } {
  const base = GRASS_GROWTH_BAND_RANGES[preset] ?? GRASS_GROWTH_BAND_RANGES.full_mid;
  const clampedTune = Math.max(-0.5, Math.min(0.5, tuneOctaves));
  const scale = Math.pow(2, clampedTune);
  const minHz = Math.round(Math.max(40, Math.min(6000, base.minHz * scale)));
  const maxHz = Math.round(Math.max(minHz + 60, Math.min(10000, base.maxHz * scale)));
  return { minHz, maxHz };
}

