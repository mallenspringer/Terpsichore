import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEngineStore } from '../store';
import { createDefaultEffect } from '../moduleFactory';
import { SignalDispatcher } from '../SignalDispatcher';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { ALL_MODULES } from '../../components/ModuleCatalog/moduleRegistry';
import { DataMoshEffect } from '../types';
import {
  DATAMOSH_DEFAULTS,
  decayToHoldSeconds,
  formatHoldDuration,
  computeFrameRetention
} from '../../utils/dataMoshUtils';

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

describe('DataMosh Module & Engine Integration', () => {
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

  it('should initialize default DataMoshEffect with balanced vector gain, motion_thresh sync, and two-threshold settings', () => {
    const effect = createDefaultEffect('DataMosh', 'mosh_test') as DataMoshEffect;
    expect(effect.id).toBe('mosh_test');
    expect(effect.type).toBe('DataMosh');
    expect(effect.processTarget).toBe('canvas');
    expect(effect.vectorGain).toBe(DATAMOSH_DEFAULTS.vectorGain);
    expect(effect.decay).toBe(DATAMOSH_DEFAULTS.decay);
    expect(effect.macroblockSize).toBe(DATAMOSH_DEFAULTS.macroblockSize);
    expect(effect.threshold).toBe(DATAMOSH_DEFAULTS.threshold);
    expect(effect.refreshThreshold).toBe(DATAMOSH_DEFAULTS.refreshThreshold);
    expect(effect.chromaBleed).toBe(DATAMOSH_DEFAULTS.chromaBleed);
    expect(effect.biasX).toBe(DATAMOSH_DEFAULTS.biasX);
    expect(effect.biasY).toBe(DATAMOSH_DEFAULTS.biasY);
    expect(effect.noiseGlitch).toBe(DATAMOSH_DEFAULTS.noiseGlitch);
    expect(effect.keyframeMode).toBe('motion_thresh');
    expect(effect.keyframeRate).toBe(DATAMOSH_DEFAULTS.keyframeRate);
    expect(effect.motionThreshold).toBe(DATAMOSH_DEFAULTS.motionThreshold);
    expect(effect.refreshThreshold).toBeGreaterThan(effect.threshold);
  });

  it('should compute perceptual hold durations and frame-rate-independent retention cleanly', () => {
    expect(decayToHoldSeconds(0.0)).toBe(0);
    expect(decayToHoldSeconds(1.0)).toBe(Infinity);
    expect(formatHoldDuration(0.0)).toBe('0.0s (OFF)');
    expect(formatHoldDuration(1.0)).toBe('∞ HOLD');

    const defaultHold = decayToHoldSeconds(DATAMOSH_DEFAULTS.decay);
    expect(defaultHold).toBeGreaterThan(8);
    expect(defaultHold).toBeLessThan(20);
    expect(formatHoldDuration(DATAMOSH_DEFAULTS.decay)).toMatch(/^\d+\.\d+s$/);

    // Frame-rate independence: 60 frames at 1/60s == 120 frames at 1/120s
    const ret60 = Math.pow(computeFrameRetention(0.75, 1 / 60), 60);
    const ret120 = Math.pow(computeFrameRetention(0.75, 1 / 120), 120);
    expect(ret60).toBeCloseTo(ret120, 6);
    expect(computeFrameRetention(1.0, 1 / 60)).toBe(1.0);
    expect(computeFrameRetention(0.75, 0)).toBe(1.0);
  });

  it('should be registered in ALL_MODULES with proper metadata and tags', () => {
    const item = ALL_MODULES.find(m => m.id === 'DataMosh');
    expect(item).toBeDefined();
    expect(item?.glyph).toBe('📼');
    expect(item?.label).toBe('Data Mosh');
    expect(item?.category).toBe('Effects');
    expect(item?.moduleType).toBe('effect:DataMosh');
    expect(item?.tags).toContain('mosh');
    expect(item?.tags).toContain('pframe');
    expect(item?.tags).toContain('macroblock');
  });

  it('should have correct input, mask, trigger, and CV modulation ports registered in portDefs', () => {
    const ports = PORT_DEFS['DataMosh'];
    expect(ports).toBeDefined();

    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('mask_in');
    expect(portIds).toContain('keyframe_trig');
    expect(portIds).toContain('mosh_cv');
    expect(portIds).toContain('block_size_cv');
    expect(portIds).toContain('bias_x_cv');
    expect(portIds).toContain('bias_y_cv');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');

    const videoIn = ports.find(p => p.id === 'video_in');
    expect(videoIn?.direction).toBe('in');
    expect(videoIn?.signalType).toBe('video');
    expect(videoIn?.alwaysShow).toBe(true);

    const maskIn = ports.find(p => p.id === 'mask_in');
    expect(maskIn?.direction).toBe('in');
    expect(maskIn?.signalType).toBe('video');

    const keyframeTrig = ports.find(p => p.id === 'keyframe_trig');
    expect(keyframeTrig?.direction).toBe('in');
    expect(keyframeTrig?.signalType).toBe('trigger');

    const moshCv = ports.find(p => p.id === 'mosh_cv');
    expect(moshCv?.direction).toBe('in');
    expect(moshCv?.signalType).toBe('modulation');
    expect(moshCv?.bipolar).toBe(true);
  });

  it('should propagate video_out and matte_out signals through SignalDispatcher', () => {
    const state = useEngineStore.getState();
    const dispatcher = SignalDispatcher.getInstance();

    const dataMosh = createDefaultEffect('DataMosh', 'dm_node') as DataMoshEffect;

    state.updateLayer('layer_1', {
      effects: [dataMosh],
      graph: {
        edges: [
          {
            id: 'edge_v',
            fromNodeId: 'dm_node',
            fromPort: 'video_out',
            toNodeId: '__output__',
            toPort: 'video_in',
            signalType: 'video'
          },
          {
            id: 'edge_m',
            fromNodeId: 'dm_node',
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
    expect(signals['dm_node.video_out']).toBe(1.0);
    expect(signals['dm_node.matte_out']).toBe(1.0);
  });

  it('should update state cleanly when parameters are modified', () => {
    const state = useEngineStore.getState();
    const dataMosh = createDefaultEffect('DataMosh', 'dm_edit') as DataMoshEffect;

    state.updateLayer('layer_1', { effects: [dataMosh] });

    state.updateEffect('layer_1', 'dm_edit', {
      vectorGain: 2.5,
      decay: 0.995,
      macroblockSize: 32,
      refreshThreshold: 0.65,
      motionThreshold: 0.55,
      processTarget: 'upstream_bounded',
      keyframeMode: 'manual',
      biasX: 0.25,
      noiseGlitch: 0.15
    });

    const updated = useEngineStore.getState().layers['layer_1'].effects[0] as DataMoshEffect;
    expect(updated.vectorGain).toBe(2.5);
    expect(updated.decay).toBe(0.995);
    expect(updated.macroblockSize).toBe(32);
    expect(updated.refreshThreshold).toBe(0.65);
    expect(updated.motionThreshold).toBe(0.55);
    expect(updated.processTarget).toBe('upstream_bounded');
    expect(updated.keyframeMode).toBe('manual');
    expect(updated.biasX).toBe(0.25);
    expect(updated.noiseGlitch).toBe(0.15);
  });
});
