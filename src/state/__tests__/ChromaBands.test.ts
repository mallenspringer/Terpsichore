import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../store';
import { SignalDispatcher } from '../SignalDispatcher';
import { createDefaultEffect, createDefaultSource, autoDistributeChromaThresholds, cascadeChromaThresholds } from '../moduleFactory';
import { ChromaBandsEffect } from '../types';
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

describe('ChromaBands (Quantization & Ink Hue Cel-Shading) Module', () => {
  beforeEach(() => {
    const chromaBands = createDefaultEffect('ChromaBands', 'cb-1') as ChromaBandsEffect;
    const defaultSource = createDefaultSource("ShapeGenerator");

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: defaultSource,
          effects: [chromaBands],
          modulators: {},
          graph: {
            edges: [
              {
                id: 'e-vid',
                fromNodeId: 'source',
                fromPort: 'video_out',
                toNodeId: 'cb-1',
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

  it('initializes default ChromaBandsEffect with 2 bands, chroma gate, cel smoothing, and ink outlines enabled', () => {
    const cb = createDefaultEffect('ChromaBands', 'cb-init') as ChromaBandsEffect;
    expect(cb.type).toBe('ChromaBands');
    expect(cb.bands).toHaveLength(2);
    expect(cb.bands[0].threshold).toBe(180);
    expect(cb.bands[1].threshold).toBe(360);
    expect(cb.chromaGate).toBe(0.08);
    expect(cb.spatialSmoothing).toBe(0.35);
    expect(cb.outlineEnabled).toBe(true);
    expect(cb.outlineWidth).toBe(2);
    expect(cb.outlineOpacity).toBe(1.0);
    expect(cb.outlineColor).toEqual([0, 0, 0, 1]);
    expect(cb.usePaletteIn).toBe(true);
  });

  it('auto-distributes angular thresholds evenly across any band count between 2 and 8', () => {
    const t2 = autoDistributeChromaThresholds(2);
    expect(t2).toEqual([180, 360]);

    const t4 = autoDistributeChromaThresholds(4);
    expect(t4).toEqual([90, 180, 270, 360]);

    const t8 = autoDistributeChromaThresholds(8);
    expect(t8).toHaveLength(8);
    expect(t8[7]).toBe(360);
    for (let i = 0; i < t8.length - 1; i++) {
      expect(t8[i]).toBeLessThan(t8[i + 1]);
    }
  });

  it('exposes all required ports (video_in, palette_in, hue_cv, smooth_cv, width_cv, video_out, matte_out)', () => {
    const ports = PORT_DEFS.ChromaBands;
    expect(ports).toBeDefined();
    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('palette_in');
    expect(portIds).toContain('hue_cv');
    expect(portIds).toContain('smooth_cv');
    expect(portIds).toContain('width_cv');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');
  });

  it('registers in Effects category with accurate chroma & cel tags in moduleRegistry', () => {
    const entry = ALL_MODULES.find(m => m.id === 'ChromaBands');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Effects');
    expect(entry?.moduleType).toBe('effect:ChromaBands');
    expect(entry?.tags).toContain('chroma');
    expect(entry?.tags).toContain('hue');
    expect(entry?.tags).toContain('cel');
    expect(entry?.tags).toContain('outline');
    expect(entry?.tags).toContain('posterize');
  });

  it('auto-wires video_out to ChromaBands.video_in in layer graph chains', () => {
    const layer = useEngineStore.getState().layers['layer-1'];
    const autoEdges = buildAutoEdges(layer, { edges: [] });
    const vidEdge = autoEdges.find(e => e.toNodeId === 'cb-1' && e.toPort === 'video_in');
    expect(vidEdge).toBeDefined();
    expect(vidEdge?.fromPort).toBe('video_out');
  });

  it('dispatches active signals on video_out and matte_out in SignalDispatcher', () => {
    const sd = SignalDispatcher.getInstance();
    const layer = useEngineStore.getState().layers['layer-1'];
    const signalValues: Record<string, number> = {};

    const fns = (sd as any).pipelines['layer-1'] || [];
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    expect(signalValues['cb-1.video_out']).toBe(1.0);
    expect(signalValues['cb-1.matte_out']).toBe(1.0);
  });

  it('cascades downward (waterfall reduction) when an angular slider overlaps underlying bands', () => {
    const initialBands = [
      { id: 'b0', threshold: 90, color: [1, 0, 0, 1] as [number, number, number, number] },
      { id: 'b1', threshold: 180, color: [0, 1, 0, 1] as [number, number, number, number] },
      { id: 'b2', threshold: 270, color: [0, 0, 1, 1] as [number, number, number, number] },
      { id: 'b3', threshold: 360, color: [1, 1, 0, 1] as [number, number, number, number] }
    ];

    // Drag Layer 3 (index 2) down to 70: overlaps Layer 2 (180) and Layer 1 (90)
    const result1 = cascadeChromaThresholds(initialBands, 2, 70);
    expect(result1[2].threshold).toBe(70);
    expect(result1[1].threshold).toBe(69);
    expect(result1[0].threshold).toBe(68);
    expect(result1[3].threshold).toBe(360);

    // Drag Layer 2 (index 1) down to 0: clamped to 2 because Layer 1 needs at least 1
    const result2 = cascadeChromaThresholds(result1, 1, 0);
    expect(result2[1].threshold).toBe(2);
    expect(result2[0].threshold).toBe(1);
    expect(result2[2].threshold).toBe(70);
    expect(result2[3].threshold).toBe(360);
  });

  it('cascades upward when an angular slider overlaps higher bands below the fixed top ceiling', () => {
    const initialBands = [
      { id: 'b0', threshold: 90, color: [1, 0, 0, 1] as [number, number, number, number] },
      { id: 'b1', threshold: 180, color: [0, 1, 0, 1] as [number, number, number, number] },
      { id: 'b2', threshold: 270, color: [0, 0, 1, 1] as [number, number, number, number] },
      { id: 'b3', threshold: 360, color: [1, 1, 0, 1] as [number, number, number, number] }
    ];

    // Drag Layer 1 (index 0) up to 300: overlaps Layer 2 (180) and Layer 3 (270)
    const result = cascadeChromaThresholds(initialBands, 0, 300);
    expect(result[0].threshold).toBe(300);
    expect(result[1].threshold).toBe(301);
    expect(result[2].threshold).toBe(302);
    expect(result[3].threshold).toBe(360);
  });

  it('realigns all bands back to default chromatic distribution when auto is applied', () => {
    const skewedBands = [
      { id: 'b0', threshold: 10, color: [1, 0, 0, 1] as [number, number, number, number] },
      { id: 'b1', threshold: 20, color: [0, 1, 0, 1] as [number, number, number, number] },
      { id: 'b2', threshold: 30, color: [0, 0, 1, 1] as [number, number, number, number] },
      { id: 'b3', threshold: 360, color: [1, 1, 0, 1] as [number, number, number, number] }
    ];

    const autoThresh = autoDistributeChromaThresholds(skewedBands.length);
    const realigned = skewedBands.map((b, idx) => ({ ...b, threshold: autoThresh[idx] }));

    expect(realigned[0].threshold).toBe(90);
    expect(realigned[1].threshold).toBe(180);
    expect(realigned[2].threshold).toBe(270);
    expect(realigned[3].threshold).toBe(360);
  });
});

