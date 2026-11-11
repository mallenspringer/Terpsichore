import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEngineStore } from '../store';
import { createDefaultEffect } from '../moduleFactory';
import { SignalDispatcher } from '../SignalDispatcher';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { BadAnalogEffect } from '../types';

vi.mock('../AudioEngine', () => ({
  AudioEngine: {
    getInstance: () => ({
      context: { currentTime: 0 },
      resume: vi.fn(),
      registerMediaElement: vi.fn(),
      registerStream: vi.fn(),
      unregisterMediaElement: vi.fn(),
      setModuleMute: vi.fn(),
      setLayerMute: vi.fn(),
      setMasterMute: vi.fn(),
      setLayerAudioTarget: vi.fn(),
      getBusData: vi.fn(),
      getAllBuses: vi.fn(() => []),
      getPeakVolume: vi.fn(() => 0.5),
      update: vi.fn()
    })
  }
}));

describe('BadAnalog Module & Engine Integration', () => {
  beforeEach(() => {
    useEngineStore.setState({
      layers: {
        layer_1: {
          id: 'layer_1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: { type: 'ShapeGenerator', sides: 4, roundness: 0, convexity: 0 } as any,
          effects: [],
          modulators: {},
          graph: { edges: [], disconnectedPorts: [] },
          audioMuted: false
        }
      },
      layerOrder: ['layer_1'],
      activeLayerId: 'layer_1',
      interLayerEdges: []
    });
  });

  it('should initialize default BadAnalogEffect with CRT display mode and canvas target', () => {
    const effect = createDefaultEffect('BadAnalog', 'ba_test') as BadAnalogEffect;
    expect(effect.id).toBe('ba_test');
    expect(effect.type).toBe('BadAnalog');
    expect(effect.displayMode).toBe('crt');
    expect(effect.processTarget).toBe('canvas');
    expect(effect.phosphorType).toBe('p1_green');
    expect(effect.curvature).toBe(0.15);
    expect(effect.vignette).toBe(0.25);
    expect(effect.scanlines).toBe(0.5);
    expect(effect.scanlineCount).toBe(240);
    expect(effect.phosphorMask).toBe(0.35);
    expect(effect.maskBrightness).toBe(1.15);
    expect(effect.jitter).toBe(0.08);
    expect(effect.chromaBleed).toBe(0.35);
  });

  it('should have correct input, mask, and CV ports registered in portDefs', () => {
    const ports = PORT_DEFS['BadAnalog'];
    expect(ports).toBeDefined();

    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('mask_in');
    expect(portIds).toContain('jitter_cv');
    expect(portIds).toContain('tracking_cv');
    expect(portIds).toContain('bleed_cv');
    expect(portIds).toContain('glitch_trig');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');

    const videoIn = ports.find(p => p.id === 'video_in');
    expect(videoIn?.direction).toBe('in');
    expect(videoIn?.signalType).toBe('video');

    const maskIn = ports.find(p => p.id === 'mask_in');
    expect(maskIn?.direction).toBe('in');
    expect(maskIn?.signalType).toBe('video');

    const glitchTrig = ports.find(p => p.id === 'glitch_trig');
    expect(glitchTrig?.signalType).toBe('trigger');
  });

  it('should propagate video_out and matte_out signals through SignalDispatcher', () => {
    const state = useEngineStore.getState();
    const dispatcher = SignalDispatcher.getInstance();

    const badAnalog = createDefaultEffect('BadAnalog', 'ba_node') as BadAnalogEffect;

    state.updateLayer('layer_1', {
      effects: [badAnalog],
      graph: {
        edges: [
          { id: 'edge_v', fromNodeId: 'ba_node', fromPort: 'video_out', toNodeId: '__output__', toPort: 'video_in', signalType: 'video' },
          { id: 'edge_m', fromNodeId: 'ba_node', fromPort: 'matte_out', toNodeId: '__output__', toPort: 'mask_in', signalType: 'video' }
        ],
        disconnectedPorts: []
      }
    });

    dispatcher.compileLayer(useEngineStore.getState().layers['layer_1']);
    dispatcher.execute(true);

    const signals = dispatcher.getLatestSignals('layer_1');
    expect(signals['ba_node.video_out']).toBe(1.0);
    expect(signals['ba_node.matte_out']).toBe(1.0);
  });

  it('should support switching display modes and upstream bounded processing in store', () => {
    const state = useEngineStore.getState();
    const badAnalog = createDefaultEffect('BadAnalog', 'ba_node') as BadAnalogEffect;

    state.updateLayer('layer_1', {
      effects: [badAnalog]
    });

    state.updateEffect('layer_1', 'ba_node', {
      displayMode: 'vector',
      processTarget: 'upstream_bounded',
      vectorGlow: 0.85,
      vectorIntensity: 2.2
    } as any);

    const updated = useEngineStore.getState().layers['layer_1'].effects.find(e => e.id === 'ba_node') as BadAnalogEffect;
    expect(updated.displayMode).toBe('vector');
    expect(updated.processTarget).toBe('upstream_bounded');
    expect(updated.vectorGlow).toBe(0.85);
    expect(updated.vectorIntensity).toBe(2.2);

    state.updateEffect('layer_1', 'ba_node', {
      displayMode: 'monochrome',
      phosphorType: 'p3_amber'
    } as any);

    const updated2 = useEngineStore.getState().layers['layer_1'].effects.find(e => e.id === 'ba_node') as BadAnalogEffect;
    expect(updated2.displayMode).toBe('monochrome');
    expect(updated2.phosphorType).toBe('p3_amber');
  });
});
