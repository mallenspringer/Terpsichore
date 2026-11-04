import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../store';
import { SignalDispatcher } from '../SignalDispatcher';
import { createDefaultEffect, createDefaultSource, autoDistributeLumaThresholds, cascadeLumaThresholds } from '../moduleFactory';
import { LumaBandsEffect } from '../types';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { ALL_MODULES } from '../../components/ModuleCatalog/moduleRegistry';
import { buildAutoEdges } from '../graphUtils';

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

describe('LumaBands (Quantization & Ink Cel-Shading) Module', () => {
  beforeEach(() => {
    const lumaBands = createDefaultEffect('LumaBands', 'lb-1') as LumaBandsEffect;
    const defaultSource = createDefaultSource("ShapeGenerator");

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: defaultSource,
          effects: [lumaBands],
          modulators: {},
          graph: {
            edges: [
              {
                id: 'e-vid',
                fromNodeId: 'source',
                fromPort: 'video_out',
                toNodeId: 'lb-1',
                toPort: 'video_in',
                signalType: 'video'
              }
            ]
          },
          signalValues: {}
        }
      },
      layerOrder: ['layer-1'],
      activeLayerId: 'layer-1'
    });

    const sd = SignalDispatcher.getInstance();
    sd.compileLayer(useEngineStore.getState().layers['layer-1']);
  });

  it('initializes default LumaBandsEffect with 2 bands, cel smoothing, and ink outlines enabled', () => {
    const lb = createDefaultEffect('LumaBands', 'lb-init') as LumaBandsEffect;
    expect(lb.type).toBe('LumaBands');
    expect(lb.bands).toHaveLength(2);
    expect(lb.bands[0].threshold).toBe(127);
    expect(lb.bands[1].threshold).toBe(255);
    expect(lb.bands[0].color).toEqual([0.10, 0.10, 0.15, 1.0]);
    expect(lb.spatialSmoothing).toBe(0.35);
    expect(lb.outlineEnabled).toBe(true);
    expect(lb.outlineWidth).toBe(2);
    expect(lb.outlineOpacity).toBe(1.0);
    expect(lb.outlineColor).toEqual([0, 0, 0, 1]);
    expect(lb.usePaletteIn).toBe(true);
  });

  it('auto-distributes thresholds evenly across any band count between 2 and 8', () => {
    const t2 = autoDistributeLumaThresholds(2);
    expect(t2).toEqual([127, 255]);

    const t4 = autoDistributeLumaThresholds(4);
    expect(t4).toEqual([63, 127, 191, 255]);

    const t8 = autoDistributeLumaThresholds(8);
    expect(t8).toHaveLength(8);
    expect(t8[7]).toBe(255);
    for (let i = 0; i < t8.length - 1; i++) {
      expect(t8[i]).toBeLessThan(t8[i + 1]);
    }
  });

  it('exposes all required ports (video_in, palette_in, threshold_cv, smooth_cv, width_cv, video_out, matte_out)', () => {
    const ports = PORT_DEFS.LumaBands;
    expect(ports).toBeDefined();
    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('palette_in');
    expect(portIds).toContain('threshold_cv');
    expect(portIds).toContain('smooth_cv');
    expect(portIds).toContain('width_cv');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');
  });

  it('registers in Effects category with accurate cel & posterization tags in moduleRegistry', () => {
    const entry = ALL_MODULES.find(m => m.id === 'LumaBands');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Effects');
    expect(entry?.moduleType).toBe('effect:LumaBands');
    expect(entry?.tags).toContain('luma');
    expect(entry?.tags).toContain('cel');
    expect(entry?.tags).toContain('outline');
    expect(entry?.tags).toContain('posterize');
  });

  it('auto-wires video_out to LumaBands.video_in in layer graph chains', () => {
    const layer = useEngineStore.getState().layers['layer-1'];
    const autoEdges = buildAutoEdges(layer, { edges: [] });
    const vidEdge = autoEdges.find(e => e.toNodeId === 'lb-1' && e.toPort === 'video_in');
    expect(vidEdge).toBeDefined();
    expect(vidEdge?.fromPort).toBe('video_out');
  });

  it('dispatches active signals on video_out and matte_out in SignalDispatcher', () => {
    const sd = SignalDispatcher.getInstance();
    const layer = useEngineStore.getState().layers['layer-1'];
    const signalValues: Record<string, number> = {};

    const fns = (sd as any).pipelines['layer-1'] || [];
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    expect(signalValues['lb-1.video_out']).toBe(1.0);
    expect(signalValues['lb-1.matte_out']).toBe(1.0);
  });

  it('supports updating band colors and thresholds while preserving monotonicity', () => {
    const store = useEngineStore.getState();
    const customBands = [
      { id: 'b-0', threshold: 50, color: [1, 0, 0, 1] as [number, number, number, number] },
      { id: 'b-1', threshold: 150, color: [0, 1, 0, 1] as [number, number, number, number] },
      { id: 'b-2', threshold: 255, color: [0, 0, 1, 1] as [number, number, number, number] }
    ];
    store.updateEffect('layer-1', 'lb-1', {
      bands: customBands,
      spatialSmoothing: 0.6,
      outlineWidth: 4
    } as any);

    const updated = useEngineStore.getState().layers['layer-1'].effects[0] as LumaBandsEffect;
    expect(updated.bands).toHaveLength(3);
    expect(updated.bands[0].color).toEqual([1, 0, 0, 1]);
    expect(updated.bands[1].threshold).toBe(150);
    expect(updated.spatialSmoothing).toBe(0.6);
    expect(updated.outlineWidth).toBe(4);
  });

  it('cascades downward (waterfall reduction) when a slider overlaps underlying bands', () => {
    // 4 bands with thresholds [63, 127, 191, 255]
    const initialBands = [
      { id: 'b0', threshold: 63, color: [0, 0, 0, 1] as [number, number, number, number] },
      { id: 'b1', threshold: 127, color: [0.3, 0.3, 0.3, 1] as [number, number, number, number] },
      { id: 'b2', threshold: 191, color: [0.6, 0.6, 0.6, 1] as [number, number, number, number] },
      { id: 'b3', threshold: 255, color: [1, 1, 1, 1] as [number, number, number, number] }
    ];

    // Drag Layer 3 (index 2) down to 50: overlaps Layer 2 (127) and Layer 1 (63)
    const result1 = cascadeLumaThresholds(initialBands, 2, 50);
    expect(result1[2].threshold).toBe(50);
    expect(result1[1].threshold).toBe(49);
    expect(result1[0].threshold).toBe(48);
    expect(result1[3].threshold).toBe(255);

    // Drag Layer 2 (index 1) down to 1: clamped to 2 because Layer 1 needs at least 1
    const result2 = cascadeLumaThresholds(result1, 1, 0);
    expect(result2[1].threshold).toBe(2);
    expect(result2[0].threshold).toBe(1);
    expect(result2[2].threshold).toBe(50);
    expect(result2[3].threshold).toBe(255);
  });

  it('cascades upward when a slider overlaps higher bands below the fixed top ceiling', () => {
    const initialBands = [
      { id: 'b0', threshold: 63, color: [0, 0, 0, 1] as [number, number, number, number] },
      { id: 'b1', threshold: 127, color: [0.3, 0.3, 0.3, 1] as [number, number, number, number] },
      { id: 'b2', threshold: 191, color: [0.6, 0.6, 0.6, 1] as [number, number, number, number] },
      { id: 'b3', threshold: 255, color: [1, 1, 1, 1] as [number, number, number, number] }
    ];

    // Drag Layer 1 (index 0) up to 200: overlaps Layer 2 (127) and Layer 3 (191)
    const result = cascadeLumaThresholds(initialBands, 0, 200);
    expect(result[0].threshold).toBe(200);
    expect(result[1].threshold).toBe(201);
    expect(result[2].threshold).toBe(202);
    expect(result[3].threshold).toBe(255);
  });

  it('realigns all bands back to default distribution when auto is applied', () => {
    const skewedBands = [
      { id: 'b0', threshold: 10, color: [0, 0, 0, 1] as [number, number, number, number] },
      { id: 'b1', threshold: 20, color: [0.3, 0.3, 0.3, 1] as [number, number, number, number] },
      { id: 'b2', threshold: 30, color: [0.6, 0.6, 0.6, 1] as [number, number, number, number] },
      { id: 'b3', threshold: 255, color: [1, 1, 1, 1] as [number, number, number, number] }
    ];

    const autoThresh = autoDistributeLumaThresholds(skewedBands.length);
    const realigned = skewedBands.map((b, idx) => ({ ...b, threshold: autoThresh[idx] }));

    expect(realigned[0].threshold).toBe(63);
    expect(realigned[1].threshold).toBe(127);
    expect(realigned[2].threshold).toBe(191);
    expect(realigned[3].threshold).toBe(255);
  });
});
