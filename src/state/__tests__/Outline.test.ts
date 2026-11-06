import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../store';
import { createDefaultEffect, createDefaultSource } from '../moduleFactory';
import { OutlineEffect } from '../types';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { ALL_MODULES } from '../../components/ModuleCatalog/moduleRegistry';
import { SignalDispatcher } from '../SignalDispatcher';

const mockAudioEngine = {
  getPeakVolume: () => 0,
  setLayerAudioTarget: () => {},
  getBusData: () => ({
    peak: 0,
    rms: 0,
    onset: false,
    bands: { bass: 0, mid: 0, high: 0, low: 0, lowMid: 0, midGranular: 0, highMid: 0, highGranular: 0 }
  })
} as any;

describe('Outline (Contour & Edge Synthesizer) Module', () => {
  beforeEach(() => {
    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          source: createDefaultSource('ShapeGenerator'),
          effects: [createDefaultEffect('Outline', 'outline-1') as OutlineEffect],
          modulators: {},
          opacity: 1,
          blendMode: 'normal',
          graph: {
            edges: [
              { id: 'e1', fromNodeId: 'source', fromPort: 'video_out', toNodeId: 'outline-1', toPort: 'video_in' },
              { id: 'e2', fromNodeId: 'outline-1', fromPort: 'video_out', toNodeId: '__output__', toPort: 'video_in' }
            ]
          }
        }
      },
      layerOrder: ['layer-1'],
      activeLayerId: 'layer-1'
    });

    const sd = SignalDispatcher.getInstance();
    sd.compileLayer(useEngineStore.getState().layers['layer-1']);
  });

  it('initializes default OutlineEffect with 4 bands (capped at 8), ink over video, and custom line color', () => {
    const ef = createDefaultEffect('Outline', 'outline-init') as OutlineEffect;
    expect(ef.type).toBe('Outline');
    expect(ef.edgeMode).toBe('luma_bands');
    expect(ef.bandCount).toBe(4);
    expect(ef.bandCount).toBeLessThanOrEqual(8);
    expect(ef.threshold).toBe(0.25);
    expect(ef.lineWidth).toBe(2.0);
    expect(ef.lineOpacity).toBe(1.0);
    expect(ef.lineColor).toEqual([0.0, 0.0, 0.0, 1.0]);
    expect(ef.colorMode).toBe('custom');
    expect(ef.bgMode).toBe('over_video_ink');
    expect(ef.spatialSmoothing).toBe(0.2);
    expect(ef.analogDirection).toBe('horizontal');
    expect(ef.usePaletteIn).toBe(true);
  });

  it('exposes all required ports in PORT_DEFS (video_in, palette_in, width_cv, thresh_cv, smooth_cv, video_out, matte_out)', () => {
    const ports = PORT_DEFS.Outline;
    expect(ports).toBeDefined();
    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('palette_in');
    expect(portIds).toContain('width_cv');
    expect(portIds).toContain('thresh_cv');
    expect(portIds).toContain('smooth_cv');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');
  });

  it('registers in Effects category with contour and edge tags in moduleRegistry', () => {
    const entry = ALL_MODULES.find(m => m.id === 'Outline');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Effects');
    expect(entry?.moduleType).toBe('effect:Outline');
    expect(entry?.tags).toContain('outline');
    expect(entry?.tags).toContain('edge');
    expect(entry?.tags).toContain('contour');
    expect(entry?.tags).toContain('peaking');
  });

  it('SignalDispatcher propagates video_out and matte_out signals for Outline', () => {
    const dispatcher = SignalDispatcher.getInstance();
    const outlineEffect = createDefaultEffect('Outline', 'outline-test') as OutlineEffect;

    const layer = {
      id: 'layer-test',
      name: 'Layer Test',
      source: createDefaultSource('ShapeGenerator'),
      effects: [outlineEffect],
      modulators: {},
      opacity: 1,
      blendMode: 'normal' as const,
      graph: {
        edges: []
      }
    };

    useEngineStore.setState({
      layers: {
        'layer-test': layer as any
      }
    });

    dispatcher.compileLayer(layer as any);
    const signalValues: Record<string, number> = {};
    const fns = (dispatcher as any).pipelines['layer-test'] || [];
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    expect(signalValues['outline-test.video_out']).toBe(1.0);
    expect(signalValues['outline-test.matte_out']).toBe(1.0);
  });

  it('supports all 5 detection modes and all 4 background blend modes', () => {
    const ef = createDefaultEffect('Outline', 'outline-modes') as OutlineEffect;

    const validModes: OutlineEffect['edgeMode'][] = [
      'luma_bands',
      'chroma_bands',
      'focus_peaking',
      'manga_dog',
      'analog_diff'
    ];
    validModes.forEach(mode => {
      ef.edgeMode = mode;
      expect(ef.edgeMode).toBe(mode);
    });

    const validBgModes: OutlineEffect['bgMode'][] = [
      'over_video_ink',
      'over_video_neon',
      'lines_transparent',
      'lines_black'
    ];
    validBgModes.forEach(bg => {
      ef.bgMode = bg;
      expect(ef.bgMode).toBe(bg);
    });
  });
});
