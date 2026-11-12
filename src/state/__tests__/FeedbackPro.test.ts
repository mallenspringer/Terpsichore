import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEngineStore } from '../store';
import { createDefaultEffect } from '../moduleFactory';
import { SignalDispatcher } from '../SignalDispatcher';
import { AudioEngine } from '../AudioEngine';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { ALL_MODULES } from '../../components/ModuleCatalog/moduleRegistry';
import { FeedbackProEffect } from '../types';

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

describe('FeedbackPro Module & Engine Integration', () => {
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

  it('should initialize default FeedbackProEffect with rich vortex and luma warp defaults', () => {
    const effect = createDefaultEffect('FeedbackPro', 'fp_test') as FeedbackProEffect;
    expect(effect.id).toBe('fp_test');
    expect(effect.type).toBe('FeedbackPro');
    expect(effect.processTarget).toBe('canvas');
    expect(effect.blendMode).toBe('screen');
    expect(effect.edgeMode).toBe('clamp');
    expect(effect.gain).toBe(0.95);
    expect(effect.softKnee).toBe(0.4);
    expect(effect.edgeRollOff).toBe(0.3);
    expect(effect.zoom).toBe(1.02);
    expect(effect.rotation).toBe(0.5);
    expect(effect.twist).toBe(0.0);
    expect(effect.driftX).toBe(0.0);
    expect(effect.driftY).toBe(0.0);
    expect(effect.pivotX).toBe(0.5);
    expect(effect.pivotY).toBe(0.5);
    expect(effect.pivotOrbit).toBe(0.0);
    expect(effect.pivotOrbitSpeed).toBe(0.5);
    expect(effect.tunnelWarp).toBe(0.0);
    expect(effect.lumaWarp).toBe(0.2);
    expect(effect.lumaTwist).toBe(0.0);
    expect(effect.rgbDispersion).toBe(0.005);
    expect(effect.hueShift).toBe(0.0);
    expect(effect.frozen).toBe(false);
  });

  it('should be registered in ALL_MODULES with proper metadata and tags', () => {
    const item = ALL_MODULES.find(m => m.id === 'FeedbackPro');
    expect(item).toBeDefined();
    expect(item?.glyph).toBe('🌀');
    expect(item?.label).toBe('Feedback Pro');
    expect(item?.category).toBe('Effects');
    expect(item?.moduleType).toBe('effect:FeedbackPro');
    expect(item?.tags).toContain('feedback');
    expect(item?.tags).toContain('vortex');
    expect(item?.tags).toContain('luma');
    expect(item?.tags).toContain('warp');
  });

  it('should have correct input, mask, trigger, gate, and CV modulation ports in portDefs', () => {
    const ports = PORT_DEFS['FeedbackPro'];
    expect(ports).toBeDefined();

    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('mask_in');
    expect(portIds).toContain('clear_trig');
    expect(portIds).toContain('freeze_gate');
    expect(portIds).toContain('gain_cv');
    expect(portIds).toContain('zoom_cv');
    expect(portIds).toContain('rotation_cv');
    expect(portIds).toContain('luma_warp_cv');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');

    const videoIn = ports.find(p => p.id === 'video_in');
    expect(videoIn?.direction).toBe('in');
    expect(videoIn?.signalType).toBe('video');
    expect(videoIn?.alwaysShow).toBe(true);

    const clearTrig = ports.find(p => p.id === 'clear_trig');
    expect(clearTrig?.direction).toBe('in');
    expect(clearTrig?.signalType).toBe('trigger');

    const freezeGate = ports.find(p => p.id === 'freeze_gate');
    expect(freezeGate?.direction).toBe('in');
    expect(freezeGate?.signalType).toBe('trigger');

    const zoomCv = ports.find(p => p.id === 'zoom_cv');
    expect(zoomCv?.direction).toBe('in');
    expect(zoomCv?.signalType).toBe('modulation');
    expect(zoomCv?.bipolar).toBe(true);
  });

  it('should propagate video_out and matte_out signals through SignalDispatcher', () => {
    const state = useEngineStore.getState();
    const dispatcher = SignalDispatcher.getInstance();

    const feedbackPro = createDefaultEffect('FeedbackPro', 'fp_node') as FeedbackProEffect;

    state.updateLayer('layer_1', {
      effects: [feedbackPro],
      graph: {
        edges: [
          {
            id: 'edge_v',
            fromNodeId: 'fp_node',
            fromPort: 'video_out',
            toNodeId: '__output__',
            toPort: 'video_in',
            signalType: 'video'
          },
          {
            id: 'edge_m',
            fromNodeId: 'fp_node',
            fromPort: 'matte_out',
            toNodeId: '__output__',
            toPort: 'mask_in',
            signalType: 'video'
          }
        ],
        disconnectedPorts: []
      }
    });

    dispatcher.compileLayer(useEngineStore.getState().layers['layer_1']);
    dispatcher.execute(true);

    const signals = dispatcher.getLatestSignals('layer_1');
    expect(signals['fp_node.video_out']).toBe(1.0);
    expect(signals['fp_node.matte_out']).toBe(1.0);
  });

  it('should update state cleanly when parameters are modified', () => {
    const state = useEngineStore.getState();
    const feedbackPro = createDefaultEffect('FeedbackPro', 'fp_edit') as FeedbackProEffect;

    state.updateLayer('layer_1', { effects: [feedbackPro] });

    state.updateEffect('layer_1', 'fp_edit', {
      gain: 1.05,
      zoom: 1.15,
      rotation: -2.5,
      twist: 0.8,
      lumaWarp: 0.45,
      rgbDispersion: 0.015,
      blendMode: 'difference',
      edgeMode: 'mirror',
      pivotOrbit: 0.25,
      pivotOrbitSpeed: 1.2,
      tunnelWarp: 0.65,
      processTarget: 'upstream_bounded',
      frozen: true
    });

    const updated = useEngineStore.getState().layers['layer_1'].effects[0] as FeedbackProEffect;
    expect(updated.gain).toBe(1.05);
    expect(updated.zoom).toBe(1.15);
    expect(updated.rotation).toBe(-2.5);
    expect(updated.twist).toBe(0.8);
    expect(updated.lumaWarp).toBe(0.45);
    expect(updated.rgbDispersion).toBe(0.015);
    expect(updated.blendMode).toBe('difference');
    expect(updated.edgeMode).toBe('mirror');
    expect(updated.pivotOrbit).toBe(0.25);
    expect(updated.pivotOrbitSpeed).toBe(1.2);
    expect(updated.tunnelWarp).toBe(0.65);
    expect(updated.processTarget).toBe('upstream_bounded');
    expect(updated.frozen).toBe(true);
  });

  it('should toggle frozen state on rising edge of freeze_gate trigger', () => {
    const state = useEngineStore.getState();
    const dispatcher = SignalDispatcher.getInstance();
    const feedbackPro = createDefaultEffect('FeedbackPro', 'fp_freeze_test') as FeedbackProEffect;

    state.updateLayer('layer_1', {
      effects: [feedbackPro],
      graph: {
        edges: [
          {
            id: 'edge_v',
            fromNodeId: 'fp_freeze_test',
            fromPort: 'video_out',
            toNodeId: '__output__',
            toPort: 'video_in',
            signalType: 'video'
          }
        ],
        disconnectedPorts: []
      }
    });

    dispatcher.compileLayer(useEngineStore.getState().layers['layer_1']);
    const pipeline = (dispatcher as any).pipelines['layer_1'];
    expect(pipeline).toBeDefined();

    // Initially not frozen
    expect((useEngineStore.getState().layers['layer_1'].effects[0] as FeedbackProEffect).frozen).toBe(false);

    // Send rising edge to freeze_gate
    const ctx1 = {
      layer: useEngineStore.getState().layers['layer_1'],
      signalValues: { 'fp_freeze_test.freeze_gate': 1.0 },
      audioEngine: AudioEngine.getInstance() as any
    };
    pipeline.forEach((fn: any) => fn(ctx1, 0.016));

    // Should now be frozen
    expect((useEngineStore.getState().layers['layer_1'].effects[0] as FeedbackProEffect).frozen).toBe(true);

    // Next frame trigger drops to 0
    const ctx2 = {
      layer: useEngineStore.getState().layers['layer_1'],
      signalValues: { 'fp_freeze_test.freeze_gate': 0.0 },
      audioEngine: AudioEngine.getInstance() as any
    };
    pipeline.forEach((fn: any) => fn(ctx2, 0.016));
    // Stays frozen
    expect((useEngineStore.getState().layers['layer_1'].effects[0] as FeedbackProEffect).frozen).toBe(true);

    // Next rising edge to freeze_gate toggles back off
    const ctx3 = {
      layer: useEngineStore.getState().layers['layer_1'],
      signalValues: { 'fp_freeze_test.freeze_gate': 1.0 },
      audioEngine: AudioEngine.getInstance() as any
    };
    pipeline.forEach((fn: any) => fn(ctx3, 0.016));
    expect((useEngineStore.getState().layers['layer_1'].effects[0] as FeedbackProEffect).frozen).toBe(false);
  });
});

