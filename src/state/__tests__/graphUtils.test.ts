import { describe, it, expect } from 'vitest';
import { getNodeFromLayer, getAllLayerNodes, isSourceNode, buildAutoEdges, OUTPUT_ID } from '../graphUtils';
import { LayerState, Transform2DEffect, ShapeGeneratorSource, LFOModulatorSource } from '../types';

describe('graphUtils', () => {
  const createMockLayer = (): LayerState => ({
    id: 'layer_1',
    name: 'Layer 1',
    source: {
      type: 'ShapeGenerator',
      shapeType: 'rectangle',
      sides: 4,
      roundness: 0,
      convexity: 1,
      rotation: 0,
      strokeWidth: 0,
      strokeMode: 'classic',
      strokeThreshold: 0,
      x: 0,
      y: 0,
      scale: 1,
      fillColor: [1, 1, 1, 1],
      edgeSoftness: 0.01,
    } as ShapeGeneratorSource,
    effects: [
      {
        id: 'fx_1',
        type: 'Transform2D',
        translateX: 0,
        translateY: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        spin: 0,
        pivotX: 0.5,
        pivotY: 0.5,
      } as Transform2DEffect,
    ],
    modulators: {
      mod_1: {
        type: 'LFO',
        waveform: 'sine',
        frequency: 1.0,
        speedRange: 'low',
        amplitude: 1.0,
        offset: 0,
        bipolar: false,
      } as LFOModulatorSource,
    },
    opacity: 1,
    blendMode: 'normal',
  });

  describe('isSourceNode', () => {
    it('returns true for source and false for other nodes', () => {
      expect(isSourceNode('source')).toBe(true);
      expect(isSourceNode('fx_1')).toBe(false);
      expect(isSourceNode('mod_1')).toBe(false);
    });
  });

  describe('getNodeFromLayer', () => {
    it('resolves output node', () => {
      const layer = createMockLayer();
      const node = getNodeFromLayer(layer, OUTPUT_ID);
      expect(node).toEqual({
        id: OUTPUT_ID,
        type: '__OUTPUT__',
        kind: 'output',
        node: null,
      });
    });

    it('resolves source node', () => {
      const layer = createMockLayer();
      const node = getNodeFromLayer(layer, 'source');
      expect(node).not.toBeNull();
      expect(node?.id).toBe('source');
      expect(node?.type).toBe('ShapeGenerator');
      expect(node?.kind).toBe('source');
    });

    it('returns null if source is None', () => {
      const layer = createMockLayer();
      layer.source = { type: 'None' };
      const node = getNodeFromLayer(layer, 'source');
      expect(node).toBeNull();
    });

    it('resolves effect node', () => {
      const layer = createMockLayer();
      const node = getNodeFromLayer(layer, 'fx_1');
      expect(node).not.toBeNull();
      expect(node?.id).toBe('fx_1');
      expect(node?.type).toBe('Transform2D');
      expect(node?.kind).toBe('effect');
    });

    it('resolves modulator node', () => {
      const layer = createMockLayer();
      const node = getNodeFromLayer(layer, 'mod_1');
      expect(node).not.toBeNull();
      expect(node?.id).toBe('mod_1');
      expect(node?.type).toBe('LFO');
      expect(node?.kind).toBe('modulator');
    });

    it('returns null for nonexistent node', () => {
      const layer = createMockLayer();
      expect(getNodeFromLayer(layer, 'nonexistent')).toBeNull();
    });
  });

  describe('getAllLayerNodes', () => {
    it('returns all active nodes across source, effects, and modulators', () => {
      const layer = createMockLayer();
      const allNodes = getAllLayerNodes(layer);
      expect(allNodes).toHaveLength(3);
      expect(allNodes.map(n => n.id)).toEqual(['source', 'fx_1', 'mod_1']);
    });

    it('excludes source if None', () => {
      const layer = createMockLayer();
      layer.source = { type: 'None' };
      const allNodes = getAllLayerNodes(layer);
      expect(allNodes).toHaveLength(2);
      expect(allNodes.map(n => n.id)).toEqual(['fx_1', 'mod_1']);
    });
  });

  describe('buildAutoEdges', () => {
    it('creates auto wiring from source to effect to output', () => {
      const layer = createMockLayer();
      const edges = buildAutoEdges(layer);
      expect(edges.length).toBeGreaterThanOrEqual(2);
      expect(edges.some(e => e.fromNodeId === 'source' && e.toNodeId === 'fx_1')).toBe(true);
      expect(edges.some(e => e.fromNodeId === 'fx_1' && e.toNodeId === OUTPUT_ID)).toBe(true);
    });
  });
});
