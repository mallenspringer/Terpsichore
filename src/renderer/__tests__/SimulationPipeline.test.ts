import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationPipeline } from '../SimulationPipeline';
import { LayerState, SpawnEffect, PathEffect } from '../../state/types';
import { SignalDispatcher } from '../../state/SignalDispatcher';

vi.mock('../../state/SignalDispatcher', () => {
  let mockSignals: Record<string, number> = {};
  return {
    SignalDispatcher: {
      getInstance: () => ({
        getLatestSignals: (_layerId: string) => mockSignals,
        __setMockSignals: (signals: Record<string, number>) => {
          mockSignals = signals;
        },
      }),
    },
  };
});

describe('SimulationPipeline', () => {
  let pipeline: SimulationPipeline;

  const mockGetEffectiveParam = (
    _layer: LayerState,
    _nodeId: string,
    _paramId: string,
    baseValue: number,
    _timeSec: number
  ) => baseValue;

  beforeEach(() => {
    pipeline = new SimulationPipeline();
    (SignalDispatcher.getInstance() as any).__setMockSignals({});
  });

  const createMockLayer = (spawnEffect: SpawnEffect, pathEffect?: PathEffect): LayerState => {
    const effects = [spawnEffect];
    const edges: any[] = [];
    if (pathEffect) {
      effects.push(pathEffect);
      edges.push({
        id: 'e1',
        fromNodeId: pathEffect.id,
        fromPort: 'path_out',
        toNodeId: spawnEffect.id,
        toPort: 'path_in',
        signalType: 'path',
      });
    }

    return {
      id: 'layer_1',
      name: 'Test Layer',
      source: { type: 'None' } as any,
      effects,
      modulators: {},
      opacity: 1,
      blendMode: 'normal',
      graph: { edges, disconnectedPorts: [] },
      signalValues: {},
    };
  };

  it('should spawn a particle on rising trigger edge', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 2.0,
      fadeOut: true,
      globalLatch: false,
      latchedPorts: [],
    };
    const layer = createMockLayer(spawnEffect);

    // Initial state: trigger is low
    (SignalDispatcher.getInstance() as any).__setMockSignals({ 'spawn_1.trigger_in': 0 });
    pipeline.update(layer, 0.0, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(0);

    // Rising edge: trigger goes to 1
    (SignalDispatcher.getInstance() as any).__setMockSignals({ 'spawn_1.trigger_in': 1.0 });
    pipeline.update(layer, 0.1, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(1);

    // Sustained high trigger: no additional spawn
    pipeline.update(layer, 0.2, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(1);
  });

  it('should expire particles exceeding their lifetime', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 1.0,
      fadeOut: true,
      globalLatch: false,
      latchedPorts: [],
    };
    const layer = createMockLayer(spawnEffect);

    // Spawn particle at t = 0.5
    (SignalDispatcher.getInstance() as any).__setMockSignals({ 'spawn_1.trigger_in': 1.0 });
    pipeline.update(layer, 0.5, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(1);

    // At t = 1.0 (age 0.5s < 1.0s), still active
    (SignalDispatcher.getInstance() as any).__setMockSignals({ 'spawn_1.trigger_in': 0 });
    pipeline.update(layer, 1.0, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(1);

    // At t = 1.6 (age 1.1s >= 1.0s), expired
    pipeline.update(layer, 1.6, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(0);
  });

  it('should clear all spawns when reset_in is triggered', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 5.0,
      fadeOut: false,
      globalLatch: false,
      latchedPorts: [],
    };
    const layer = createMockLayer(spawnEffect);

    // Spawn 1
    (SignalDispatcher.getInstance() as any).__setMockSignals({ 'spawn_1.trigger_in': 1.0 });
    pipeline.update(layer, 0.1, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(1);

    // Trigger reset
    (SignalDispatcher.getInstance() as any).__setMockSignals({
      'spawn_1.trigger_in': 0,
      'spawn_1.reset_in': 1.0,
    });
    pipeline.update(layer, 0.2, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(0);
  });

  it('should calculate instance data and apply path trajectories', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      coordinateMode: 'normalized',
      x: 0.2,
      y: 0.3,
      scale: 1.5,
      rotation: 45,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 5.0,
      fadeOut: false,
      globalLatch: true,
      latchedPorts: ['x', 'y'],
    };

    const pathEffect: PathEffect = {
      id: 'path_1',
      type: 'Path',
      mode: 'physics',
      speed: 2.0,
      strength: 1.0,
      frequency: 1.0,
      drift: 1.0,
    };

    const layer = createMockLayer(spawnEffect, pathEffect);

    // Spawn particle at t = 1.0
    (SignalDispatcher.getInstance() as any).__setMockSignals({ 'spawn_1.trigger_in': 1.0 });
    pipeline.update(layer, 1.0, 1920, 1080, mockGetEffectiveParam);

    // Compute instance data at t = 2.0 (age = 1.0s)
    const { instanceData, count } = pipeline.computeInstanceData(
      layer,
      'spawn_1',
      2.0,
      1920,
      1080,
      mockGetEffectiveParam
    );

    expect(count).toBe(1);
    expect(instanceData.length).toBe(8);

    // finalX = birthX + pathOffsetX = 0.2 + (age * drift * 0.1) = 0.2 + (1.0 * 1.0 * 0.1) = 0.3
    expect(instanceData[0]).toBeCloseTo(0.3, 4);

    // finalY = birthY + pathOffsetY = 0.3 + (-age * speed * 0.1) = 0.3 + (-1.0 * 2.0 * 0.1) = 0.1
    expect(instanceData[1]).toBeCloseTo(0.1, 4);

    // finalScale = birthScale = 1.5
    expect(instanceData[2]).toBeCloseTo(1.5, 4);

    // finalRotation = birthRotation = 45
    expect(instanceData[3]).toBeCloseTo(45, 4);
  });
});
