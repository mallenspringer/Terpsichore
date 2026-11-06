import { describe, it, expect } from 'vitest';
import { createDefaultSource, createDefaultEffect } from '../moduleFactory';
import { ALL_MODULES, DEFAULT_BANK_CONFIG } from '../../components/ModuleCatalog/moduleRegistry';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { NoiseSourceFragmentWGSL } from '../../renderer/shaders/NoiseSource';
import { NoiseVideoSource } from '../types';

describe('NoiseSource (Noise Gen) Module', () => {
  it('creates default NoiseSource configuration as source and effect', () => {
    const src = createDefaultSource('NoiseSource') as NoiseVideoSource;
    expect(src).toBeDefined();
    expect(src.type).toBe('NoiseSource');
    expect(src.noiseType).toBe('perlin');
    expect(src.scale).toBe(2.0);
    expect(src.evolution).toBe(1.0);
    expect(src.octaves).toBe(4);
    expect(src.persistence).toBe(0.5);
    expect(src.seed).toBe(123);
    expect(src.brightness).toBe(0);
    expect(src.contrast).toBe(1);
    expect(src.flowSpeed).toBe(1.0);
    expect(src.autoAnimate).toBe(true);

    const eff = createDefaultEffect('NoiseSource', 'noise_node_1') as any;
    expect(eff).toBeDefined();
    expect(eff.id).toBe('noise_node_1');
    expect(eff.type).toBe('NoiseSource');
    expect(eff.noiseType).toBe('perlin');
  });

  it('is registered in module catalog and default bank loadout under Sources', () => {
    const entry = ALL_MODULES.find(m => m.id === 'NoiseSource');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sources');
    expect(entry?.label).toBe('Noise Gen');
    expect(entry?.moduleType).toBe('source:NoiseSource');

    expect(DEFAULT_BANK_CONFIG.Sources.order).toContain('NoiseSource');
    expect(MODULE_DISPLAY_NAMES.NoiseSource).toBe('Noise Gen');
  });

  it('defines video_out and all modulation CV input ports', () => {
    const ports = PORT_DEFS.NoiseSource;
    expect(ports).toBeDefined();

    const videoOut = ports.find(p => p.id === 'video_out');
    expect(videoOut).toBeDefined();
    expect(videoOut?.direction).toBe('out');
    expect(videoOut?.signalType).toBe('video');

    const expectedCvPorts = [
      'scale_cv',
      'evolution_cv',
      'octaves_cv',
      'persistence_cv',
      'seed_cv',
      'brightness_cv',
      'contrast_cv',
    ];

    for (const portId of expectedCvPorts) {
      const port = ports.find(p => p.id === portId);
      expect(port).toBeDefined();
      expect(port?.direction).toBe('in');
      expect(port?.signalType).toBe('modulation');
    }
  });

  it('contains valid WGSL shader referencing NoiseUniforms matching 256-byte buffer layout', () => {
    expect(NoiseSourceFragmentWGSL).toContain('struct NoiseUniforms');
    expect(NoiseSourceFragmentWGSL).toContain('@group(0) @binding(0) var<uniform> ui: NoiseUniforms;');
    expect(NoiseSourceFragmentWGSL).toContain('colors: array<vec4<f32>, 8>');
    expect(NoiseSourceFragmentWGSL).toContain('positions: array<vec4<f32>, 2>');
    expect(NoiseSourceFragmentWGSL).toContain('fn fs_main(');
  });
});

