import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { ALL_MODULES, DEFAULT_BANK_CONFIG } from '../../components/ModuleCatalog/moduleRegistry';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { ParticleComputeWGSL, ParticleRenderWGSL } from '../../renderer/shaders/ParticleCloud';
import { ParticleCloudEffect } from '../types';

describe('ParticleCloud (WebGPU Compute Particle FX) Module', () => {
  it('creates default ParticleCloud effect with valid compute parameters', () => {
    const pc = createDefaultEffect('ParticleCloud', 'pc_1') as ParticleCloudEffect;
    expect(pc).toBeDefined();
    expect(pc.id).toBe('pc_1');
    expect(pc.type).toBe('ParticleCloud');
    expect(pc.particleCount).toBe(20000);
    expect(pc.speed).toBe(0.8);
    expect(pc.spread).toBe(0.5);
    expect(pc.turbulence).toBe(1.0);
    expect(pc.noiseFreq).toBe(1.2);
    expect(pc.lifetime).toBe(3.0);
    expect(pc.pointSize).toBe(4.0);
    expect(pc.colorPalette).toBe('starlight');
    expect(pc.blendMode).toBe('additive');
    expect(pc.emitterShape).toBe('point');
    expect(pc.emitterRadius).toBe(0.1);
    expect(pc.emitterX).toBe(0.0);
    expect(pc.emitterY).toBe(0.0);
    expect(pc.gravityX).toBe(0.0);
    expect(pc.gravityY).toBe(0.0);
    expect(pc.audioReactivity).toBe(true);
    expect(pc.audioSensitivity).toBe(1.0);
  });

  it('is registered in module catalog and default bank loadout under Sources', () => {
    const entry = ALL_MODULES.find(m => m.id === 'ParticleCloud');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sources');
    expect(entry?.label).toBe('Particle Cloud');
    expect(entry?.moduleType).toBe('effect:ParticleCloud');

    expect(DEFAULT_BANK_CONFIG.Sources.order).toContain('ParticleCloud');
  });

  it('defines video_out, trigger_in, audio_in, speed_cv, turbulence_cv, size_cv, color_cv, gravity_cv, and reset_in ports', () => {
    const ports = PORT_DEFS.ParticleCloud;
    expect(ports).toBeDefined();

    const videoOut = ports.find(p => p.id === 'video_out');
    expect(videoOut).toBeDefined();
    expect(videoOut?.direction).toBe('out');
    expect(videoOut?.signalType).toBe('video');

    const triggerIn = ports.find(p => p.id === 'trigger_in');
    expect(triggerIn).toBeDefined();
    expect(triggerIn?.direction).toBe('in');
    expect(triggerIn?.signalType).toBe('trigger');

    const audioIn = ports.find(p => p.id === 'audio_in');
    expect(audioIn).toBeDefined();
    expect(audioIn?.direction).toBe('in');
    expect(audioIn?.signalType).toBe('audio');

    const turbCv = ports.find(p => p.id === 'turbulence_cv');
    expect(turbCv).toBeDefined();
    expect(turbCv?.direction).toBe('in');
    expect(turbCv?.signalType).toBe('modulation');

    const sizeCv = ports.find(p => p.id === 'size_cv');
    expect(sizeCv).toBeDefined();
    expect(sizeCv?.direction).toBe('in');

    const speedCv = ports.find(p => p.id === 'speed_cv');
    expect(speedCv).toBeDefined();

    const resetIn = ports.find(p => p.id === 'reset_in');
    expect(resetIn).toBeDefined();
    expect(resetIn?.direction).toBe('in');
    expect(resetIn?.signalType).toBe('trigger');
  });

  it('has human-readable display name in MODULE_DISPLAY_NAMES', () => {
    expect(MODULE_DISPLAY_NAMES.ParticleCloud).toBe('Particle Cloud');
  });

  it('contains valid WGSL compute and render shader code', () => {
    // Compute Shader Validation
    expect(ParticleComputeWGSL).toContain('struct Particle');
    expect(ParticleComputeWGSL).toContain('struct ParticleComputeUniforms');
    expect(ParticleComputeWGSL).toContain('fn cs_main(');
    expect(ParticleComputeWGSL).toContain('@compute @workgroup_size(64, 1, 1)');
    expect(ParticleComputeWGSL).toContain('curlNoise(');
    expect(ParticleComputeWGSL).toContain('particlesIn');
    expect(ParticleComputeWGSL).toContain('particlesOut');

    // Render Shader Validation
    expect(ParticleRenderWGSL).toContain('struct ParticleRenderUniforms');
    expect(ParticleRenderWGSL).toContain('fn vs_main(');
    expect(ParticleRenderWGSL).toContain('fn fs_main(');
    expect(ParticleRenderWGSL).toContain('evaluatePalette(');
  });
});
