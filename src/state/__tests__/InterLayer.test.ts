import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalDispatcher } from '../SignalDispatcher';
import { useEngineStore } from '../store';

// Mock AudioEngine
vi.mock('../AudioEngine', () => ({
  AudioEngine: {
    getInstance: () => ({
      context: { currentTime: 0 },
      getPeakVolume: vi.fn(() => 0.0)
    })
  }
}));

describe('Inter-layer Signal Routing', () => {
  beforeEach(() => {
    const dispatcher = SignalDispatcher.getInstance();
    (dispatcher as any).pipelines = {};
    (dispatcher as any).interLayerBus = {};
    Object.keys(dispatcher).forEach(key => {
      if (key.startsWith('_cache_')) delete (dispatcher as any)[key];
    });

    useEngineStore.setState({
      layers: {
        'layer_1': {
          id: 'layer_1',
          name: 'Source Layer',
          source: { type: 'None' } as any,
          effects: [{ id: 'out_mod', type: 'InterLayerOutput', portCount: 1 }],
          modulators: { 'lfo_1': { type: 'LFO', frequency: 0, amplitude: 1.0, offset: 0.8, value: 0.8 } as any },
          graph: {
            edges: [
              {
                id: 'edge_1',
                fromNodeId: 'lfo_1',
                fromPort: 'modulation_out',
                toNodeId: 'out_mod',
                toPort: 'in_0',
                signalType: 'modulation',
                isAuto: false
              }
            ],
            disconnectedPorts: []
          },
          signalValues: {}
        },
        'layer_2': {
          id: 'layer_2',
          name: 'Target Layer',
          source: { type: 'None' } as any,
          effects: [{ id: 'in_mod', type: 'InterLayerInput', portCount: 1 }, { id: 'fx1', type: 'Transform2D' }],
          modulators: {},
          graph: {
            edges: [
              {
                id: 'edge_2',
                fromNodeId: 'in_mod',
                fromPort: 'out_0',
                toNodeId: 'fx1',
                toPort: 'scaleX',
                signalType: 'modulation',
                isAuto: false
              }
            ],
            disconnectedPorts: []
          },
          signalValues: {}
        }
      },
      layerOrder: ['layer_1', 'layer_2'],
      interLayerEdges: [
        {
          id: 'inter_1',
          fromLayerId: 'layer_1',
          fromEffectId: 'out_mod',
          fromPortIdx: 0,
          toLayerId: 'layer_2',
          toEffectId: 'in_mod',
          toPortIdx: 0
        }
      ]
    });
  });

  it('should propagate signal across layers', () => {
    const dispatcher = SignalDispatcher.getInstance();
    
    // Pass 1: Process Layer 1
    // Pass 2: Process Layer 2
    dispatcher.execute(true);

    const state = useEngineStore.getState();
    const l1 = state.layers['layer_1'];
    const l2 = state.layers['layer_2'];

    // 1. Check if Layer Out received the signal from LFO
    expect(l1.signalValues['out_mod.in_0']).toBe(0.8);
    
    // 2. Check if Layer In received the signal from the bus
    // (Note: Since Layer 1 is processed before Layer 2 in the loop, 
    // it should propagate in the SAME frame!)
    expect(l2.signalValues['in_mod.out_0']).toBe(0.8);
    
    // 3. Check if the final effect received it
    expect(l2.signalValues['fx1.scaleX']).toBe(0.8);
  });
});
