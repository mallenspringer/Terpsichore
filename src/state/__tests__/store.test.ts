import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../store';
import { AnySource, AnyEffect } from '../types';

describe('EngineStore Auto-wiring', () => {
  beforeEach(() => {
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
      activeLayerId: 'layer_1'
    });
  });

  it('should automatically connect source to output', () => {
    const store = useEngineStore.getState();
    const source: AnySource = { type: 'ShapeGenerator' } as any;
    
    store.setSource('layer_1', source);
    
    const layer = useEngineStore.getState().layers['layer_1'];
    const autoEdge = layer.graph?.edges.find(e => e.toNodeId === '__output__');
    expect(autoEdge).toBeDefined();
    expect(autoEdge?.fromNodeId).toBe('source');
  });

  it('should chain effects automatically', () => {
    const store = useEngineStore.getState();
    store.setSource('layer_1', { type: 'ShapeGenerator' } as any);
    
    const effect: AnyEffect = { id: 'fx1', type: 'Transform2D' } as any;
    store.addEffect('layer_1', effect);
    
    const layer = useEngineStore.getState().layers['layer_1'];
    const edges = layer.graph?.edges || [];
    
    // Should have source -> fx1
    const edge1 = edges.find(e => e.fromNodeId === 'source' && e.toNodeId === 'fx1');
    expect(edge1).toBeDefined();
    
    // Should have fx1 -> output
    const edge2 = edges.find(e => e.fromNodeId === 'fx1' && e.toNodeId === '__output__');
    expect(edge2).toBeDefined();
  });

  it('should preserve manual edges and handle disconnection', () => {
    const store = useEngineStore.getState();
    store.setSource('layer_1', { type: 'ShapeGenerator' } as any);
    
    const layerBefore = useEngineStore.getState().layers['layer_1'];
    // Manually disconnect the output
    const autoEdge = layerBefore.graph?.edges.find(e => e.toNodeId === '__output__');
    
    store.updateLayerGraph('layer_1', {
      ...layerBefore.graph,
      edges: layerBefore.graph.edges.filter(e => e.id !== autoEdge?.id),
      disconnectedPorts: ['__output__.composite_in']
    });
    
    // Add an effect
    store.addEffect('layer_1', { id: 'fx1', type: 'Transform2D' } as any);
    
    const layerAfter = useEngineStore.getState().layers['layer_1'];
    // Output should STILL be disconnected because it's in disconnectedPorts
    const hasOutputEdge = layerAfter.graph?.edges.some(e => e.toNodeId === '__output__');
    expect(hasOutputEdge).toBe(false);
  });
});
