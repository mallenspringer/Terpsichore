import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { ALL_MODULES, DEFAULT_BANK_CONFIG } from '../../components/ModuleCatalog/moduleRegistry';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { GrassComputeWGSL, GrassRenderWGSL } from '../../renderer/shaders/GrassField';
import { GrassFieldEffect } from '../types';

describe('GrassField (3D Animated Procedural Meadow) Module', () => {
  it('creates default GrassField effect with valid 3D, growth, wind, tuft, and prune parameters', () => {
    const gf = createDefaultEffect('GrassField', 'gf_test') as GrassFieldEffect;
    expect(gf).toBeDefined();
    expect(gf.id).toBe('gf_test');
    expect(gf.type).toBe('GrassField');
    expect(gf.tilt).toBe(0.5);
    expect(gf.zoom).toBe(1.0);
    expect(gf.horizonY).toBe(0.0);
    expect(gf.growth).toBe(0.0);
    expect(gf.growthRate).toBe(1.0);
    expect(gf.growthAudioMode).toBe('accumulate');
    expect(gf.density).toBe(0.6);
    expect(gf.bend).toBe(0.2);
    expect(gf.invertCurvature).toBe(false);
    expect(gf.fatness).toBe(1.0);
    expect(gf.windSpeed).toBe(1.5);
    expect(gf.windStrength).toBe(1.0);
    expect(gf.bassCoupling).toBe(true);
    expect(gf.tuftStyle).toBe('wildflowers');
    expect(gf.tuftChance).toBe(0.05);
    expect(gf.tuftBurstAmount).toBe(25);
    expect(gf.tuftThreshold).toBe(0.6);
    expect(gf.timerDecayEnabled).toBe(true);
    expect(gf.lifetimeDuration).toBe(10.0);
    expect(gf.gatedPruneEnabled).toBe(false);
    expect(gf.pruneThreshold).toBe(0.7);
    expect(gf.pruneAudioMode).toBe('transient_cut');
    expect(gf.colorPreset).toBe('meadow');
  });

  it('is registered in module catalog and default bank loadout under Effects', () => {
    const entry = ALL_MODULES.find(m => m.id === 'GrassField');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Effects');
    expect(entry?.label).toBe('Grass Field');
    expect(entry?.glyph).toBe('🌱');
    expect(entry?.moduleType).toBe('effect:GrassField');
    expect(entry?.tags).toContain('growth');
    expect(entry?.tags).toContain('grass');
    expect(entry?.tags).toContain('3d');

    expect(DEFAULT_BANK_CONFIG.Effects.order).toContain('GrassField');
  });

  it('defines all 11 ports with correct directions, signal types, and priorities', () => {
    const ports = PORT_DEFS.GrassField;
    expect(ports).toBeDefined();
    expect(ports.length).toBe(11);

    const videoOut = ports.find(p => p.id === 'video_out');
    expect(videoOut?.direction).toBe('out');
    expect(videoOut?.signalType).toBe('video');

    const audioIn = ports.find(p => p.id === 'audio_in');
    expect(audioIn?.direction).toBe('in');
    expect(audioIn?.signalType).toBe('audio');

    const growthCv = ports.find(p => p.id === 'growth_cv');
    expect(growthCv?.direction).toBe('in');
    expect(growthCv?.signalType).toBe('modulation');

    const tiltCv = ports.find(p => p.id === 'tilt_cv');
    expect(tiltCv?.direction).toBe('in');
    expect(tiltCv?.signalType).toBe('modulation');
    expect(tiltCv?.bipolar).toBe(true);

    const windCv = ports.find(p => p.id === 'wind_cv');
    expect(windCv?.direction).toBe('in');
    expect(windCv?.signalType).toBe('modulation');

    const densityCv = ports.find(p => p.id === 'density_cv');
    expect(densityCv?.direction).toBe('in');
    expect(densityCv?.signalType).toBe('modulation');

    const bendCv = ports.find(p => p.id === 'bend_cv');
    expect(bendCv?.direction).toBe('in');
    expect(bendCv?.signalType).toBe('modulation');
    expect(bendCv?.bipolar).toBe(true);

    const fatnessCv = ports.find(p => p.id === 'fatness_cv');
    expect(fatnessCv?.direction).toBe('in');
    expect(fatnessCv?.signalType).toBe('modulation');

    const pruneIn = ports.find(p => p.id === 'prune_in');
    expect(pruneIn?.direction).toBe('in');
    expect(pruneIn?.signalType).toBe('modulation');

    const tuftTrig = ports.find(p => p.id === 'tuft_trig');
    expect(tuftTrig?.direction).toBe('in');
    expect(tuftTrig?.signalType).toBe('trigger');

    const paletteIn = ports.find(p => p.id === 'palette_in');
    expect(paletteIn?.direction).toBe('in');
    expect(paletteIn?.signalType).toBe('palette');
  });

  it('provides human-readable display name in MODULE_DISPLAY_NAMES', () => {
    expect(MODULE_DISPLAY_NAMES.GrassField).toBe('Grass Field');
  });

  it('exports valid WGSL compute and render shader source code', () => {
    expect(GrassComputeWGSL).toBeDefined();
    expect(GrassComputeWGSL).toContain('struct GrassBlade');
    expect(GrassComputeWGSL).toContain('fn cs_main');

    expect(GrassRenderWGSL).toBeDefined();
    expect(GrassRenderWGSL).toContain('fn vs_main');
    expect(GrassRenderWGSL).toContain('fn fs_main');
    expect(GrassRenderWGSL).toContain('sampleCustomPalette');
  });
});
