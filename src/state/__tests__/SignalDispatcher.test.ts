import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalDispatcher } from '../SignalDispatcher';
import { useEngineStore } from '../store';
import { AnySource, AnyEffect } from '../types';

// Mock AudioEngine to avoid AudioContext issues in Node/jsdom
vi.mock('../AudioEngine', () => ({
  AudioEngine: {
    getInstance: () => ({
      context: { currentTime: 0 },
      resume: vi.fn(),
      registerMediaElement: vi.fn(),
      setModuleMute: vi.fn(),
      setLayerMute: vi.fn(),
      setMasterMute: vi.fn(),
      unregisterMediaElement: vi.fn(),
      getPeakVolume: vi.fn(() => 0.5)
    })
  }
}));

describe('SignalDispatcher', () => {
  beforeEach(() => {
    // Reset SignalDispatcher singleton state
    const dispatcher = SignalDispatcher.getInstance();
    (dispatcher as any).pipelines = {};
    Object.keys(dispatcher).forEach(key => {
      if (key.startsWith('_cache_')) delete (dispatcher as any)[key];
    });

    // Reset store state before each test
    const state = useEngineStore.getState();
    // Manual reset since we don't have a reset action yet
    useEngineStore.setState({
      layers: {
        'layer_1': {
          id: 'layer_1',
          name: 'Test Layer',
          source: { type: 'None' } as any,
          effects: [],
          modulators: {},
          opacity: 1.0,
          blendMode: 'normal',
          graph: { edges: [], disconnectedPorts: [] },
          signalValues: {}
        }
      },
      layerOrder: ['layer_1'],
      activeLayerId: 'layer_1',
      interLayerEdges: []
    });
  });

  it('should propagate signal from source to effect', () => {
    const state = useEngineStore.getState();
    
    // 1. Setup a ShapeGenerator source and a Transform2D effect
    const source: AnySource = { 
      type: 'ShapeGenerator', 
      shapeType: 'circle',
      fillColor: [1, 1, 1, 1],
      x: 0, y: 0, scale: 1.0, 
      sides: 4, roundness: 0, convexity: 0, rotation: 0, strokeWidth: 0, 
      tiling: [1, 1], tilingMode: 'repeat', edgeSoftness: 0.1
    };
    const effect: AnyEffect = { 
      id: 'effect_1', 
      type: 'Transform2D', 
      translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, spin: 0 
    };

    state.updateLayer('layer_1', { 
      source, 
      effects: [effect],
      graph: {
        edges: [
          {
            id: 'edge_1',
            fromNodeId: 'source',
            fromPort: 'video_out',
            toNodeId: 'effect_1',
            toPort: 'video_in',
            signalType: 'video',
            isAuto: false
          }
        ],
        disconnectedPorts: []
      }
    });

    // 2. Run dispatcher
    const dispatcher = SignalDispatcher.getInstance();
    // We need to bypass the 100ms throttle for testing
    // or just call execute() directly multiple times
    dispatcher.execute(true);

    // 3. Verify signal values
    const updatedLayer = useEngineStore.getState().layers['layer_1'];
    // The source output should be 1.0 (active)
    expect(updatedLayer.signalValues?.['source.video_out']).toBe(1);
    // The effect input should have received the signal
    expect(updatedLayer.signalValues?.['effect_1.video_in']).toBe(1);
  });

  it('should handle modulation routing', () => {
    const state = useEngineStore.getState();
    
    // Setup an LFO modulating an effect parameter
    const lfo = { 
      type: 'LFO', 
      waveform: 'sine', 
      frequency: 0, 
      amplitude: 1.0, 
      offset: 0.25, 
      bipolar: false,
      value: 0.75 // Manually set a value for the test
    };
    
    state.updateLayer('layer_1', {
      modulators: { 'lfo_1': lfo as any },
      effects: [{ id: 'effect_1', type: 'ColorAdjust', hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false }],
      graph: {
        edges: [
          {
            id: 'mod_edge',
            fromNodeId: 'lfo_1',
            fromPort: 'modulation_out',
            toNodeId: 'effect_1',
            toPort: 'hue',
            signalType: 'modulation',
            isAuto: false
          }
        ],
        disconnectedPorts: []
      }
    });

    SignalDispatcher.getInstance().execute(true);

    const updatedLayer = useEngineStore.getState().layers['layer_1'];
    // LFO value should be 0.75
    expect(updatedLayer.signalValues?.['lfo_1.modulation_out']).toBe(0.75);
    // Effect hue port should receive 0.75
    expect(updatedLayer.signalValues?.['effect_1.hue']).toBe(0.75);
  });
});
