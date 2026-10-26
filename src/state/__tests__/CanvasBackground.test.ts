import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { ALL_MODULES, DEFAULT_BANK_CONFIG } from '../../components/ModuleCatalog/moduleRegistry';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { CanvasBackgroundWGSL } from '../../renderer/shaders/CanvasBackground';
import { CanvasBackgroundEffect } from '../types';

describe('CanvasBackground (Backdrop) Module', () => {
  it('creates default CanvasBackground effect with valid configuration', () => {
    const bg = createDefaultEffect('CanvasBackground', 'bg_1') as CanvasBackgroundEffect;
    expect(bg).toBeDefined();
    expect(bg.id).toBe('bg_1');
    expect(bg.type).toBe('CanvasBackground');
    expect(bg.mode).toBe('linear');
    expect(bg.colorA).toHaveLength(4);
    expect(bg.colorB).toHaveLength(4);
    expect(bg.colorC).toHaveLength(4);
    expect(bg.useThreeColors).toBe(false);
    expect(bg.angle).toBe(45);
    expect(bg.spread).toBe(0.5);
    expect(bg.radialCenterX).toBe(0.5);
    expect(bg.radialCenterY).toBe(0.5);
    expect(bg.radialRadius).toBe(0.7);
    expect(bg.luma).toBe(0);
    expect(bg.chroma).toBe(0);
  });

  it('is registered in module catalog and default bank loadout under Sources', () => {
    const entry = ALL_MODULES.find(m => m.id === 'CanvasBackground');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Sources');
    expect(entry?.label).toBe('Backdrop');
    expect(entry?.moduleType).toBe('effect:CanvasBackground');

    expect(DEFAULT_BANK_CONFIG.Sources.order).toContain('CanvasBackground');
  });

  it('defines video_out, luma_cv, chroma_cv, angle_cv, and spread_cv ports', () => {
    const ports = PORT_DEFS.CanvasBackground;
    expect(ports).toBeDefined();

    const videoOut = ports.find(p => p.id === 'video_out');
    expect(videoOut).toBeDefined();
    expect(videoOut?.direction).toBe('out');
    expect(videoOut?.signalType).toBe('video');

    const lumaCv = ports.find(p => p.id === 'luma_cv');
    expect(lumaCv).toBeDefined();
    expect(lumaCv?.direction).toBe('in');
    expect(lumaCv?.signalType).toBe('modulation');
    expect(lumaCv?.bipolar).toBe(true);

    const chromaCv = ports.find(p => p.id === 'chroma_cv');
    expect(chromaCv).toBeDefined();
    expect(chromaCv?.direction).toBe('in');
    expect(chromaCv?.bipolar).toBe(true);

    const angleCv = ports.find(p => p.id === 'angle_cv');
    expect(angleCv).toBeDefined();
    expect(angleCv?.direction).toBe('in');
    expect(angleCv?.bipolar).toBe(true);

    const spreadCv = ports.find(p => p.id === 'spread_cv');
    expect(spreadCv).toBeDefined();
    expect(spreadCv?.direction).toBe('in');
    expect(spreadCv?.bipolar).toBe(true);

    expect(MODULE_DISPLAY_NAMES.CanvasBackground).toBe('Backdrop');
  });

  it('contains valid WGSL shader code with CanvasBackgroundUniforms and fs_main entry point', () => {
    expect(CanvasBackgroundWGSL).toContain('struct CanvasBackgroundUniforms');
    expect(CanvasBackgroundWGSL).toContain('fn fs_main(');
    expect(CanvasBackgroundWGSL).toContain('rgb2hsv');
    expect(CanvasBackgroundWGSL).toContain('hsv2rgb');
    expect(CanvasBackgroundWGSL).toContain('adjustColor');
  });
});
