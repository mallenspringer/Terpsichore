import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationPipeline } from '../SimulationPipeline';
import { LayerState, SpawnEffect, PathEffect, AnyEffect } from '../../state/types';
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
    const effects: AnyEffect[] = [spawnEffect];
    const edges: any[] = [];
    if (pathEffect) {
      effects.push(pathEffect);
      edges.push({
        id: 'e1',
        fromNodeId: pathEffect.id,
        fromPort: 'path_out',
        toNodeId: spawnEffect.id,
        toPort: 'path_in',
        signalType: 'trajectory',
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

  it('should spawn a particle on rising trigger edge in trigger mode', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      emissionMode: 'trigger',
      emitRate: 2,
      disseminationMode: 'cone',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 1,
      scaleEnd: 0.2,
      speed: 0.3,
      angle: 90,
      coneSpread: 45,
      gravity: 0,
      drag: 0.05,
      spin: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 2.0,
      fadeOut: true,
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

  it('should continuously emit particles in rate mode', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      emissionMode: 'rate',
      emitRate: 10, // 10 per second => 1 every 0.1s
      disseminationMode: 'cone',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 0.5,
      scaleEnd: 0.1,
      speed: 0.3,
      angle: 90,
      coneSpread: 45,
      gravity: 0,
      drag: 0,
      spin: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 20,
      lifetime: 5.0,
      fadeOut: true,
    };
    const layer = createMockLayer(spawnEffect);

    // Step 0.0s
    pipeline.update(layer, 0.0, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBe(0);

    // Step 0.35s (dt = 0.35 => emitRate * 0.35 = 3.5 => 3 particles spawned)
    pipeline.update(layer, 0.35, 1920, 1080, mockGetEffectiveParam);
    expect(pipeline.getSpawnCount('layer_1', 'spawn_1')).toBeGreaterThanOrEqual(1);
  });

  it('should expire particles exceeding their lifetime', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      emissionMode: 'trigger',
      emitRate: 2,
      disseminationMode: 'cone',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 1,
      scaleEnd: 0.1,
      speed: 0.3,
      angle: 90,
      coneSpread: 45,
      gravity: 0,
      drag: 0,
      spin: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 1.0,
      fadeOut: true,
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

  it('should clear all spawns when reset_in or manualReset is triggered', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      emissionMode: 'trigger',
      emitRate: 2,
      disseminationMode: 'cone',
      coordinateMode: 'normalized',
      x: 0,
      y: 0,
      scale: 1,
      scaleEnd: 0.1,
      speed: 0.3,
      angle: 90,
      coneSpread: 45,
      gravity: 0,
      drag: 0,
      spin: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 5.0,
      fadeOut: false,
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

  it('should calculate instance data and evaluate path flight track', () => {
    const spawnEffect: SpawnEffect = {
      id: 'spawn_1',
      type: 'Spawn',
      emissionMode: 'trigger',
      emitRate: 2,
      disseminationMode: 'cone',
      coordinateMode: 'normalized',
      x: 0.2,
      y: 0.3,
      scale: 1.0,
      scaleEnd: 0.5,
      speed: 0.0,
      angle: 0,
      coneSpread: 0,
      gravity: 0,
      drag: 0,
      spin: 0,
      randomPos: 0,
      randomScale: 0,
      maxCount: 10,
      lifetime: 5.0,
      fadeOut: false,
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

    // Compute instance data at t = 2.0 (age = 1.0s, lifetime = 5.0s, tNorm = 0.2)
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

    // posX = birthX + tNorm * pathDrift * 0.5 = 0.2 + (0.2 * 1.0 * 0.5) = 0.3
    expect(instanceData[0]).toBeCloseTo(0.3, 4);

    // posY = birthY - tNorm * pathSpeed * 0.5 = 0.3 - (0.2 * 2.0 * 0.5) = 0.1
    expect(instanceData[1]).toBeCloseTo(0.1, 4);

    // scale: linearly interpolated between 1.0 and 0.5 at tNorm = 0.2 => 1.0 + (0.5 - 1.0) * 0.2 = 0.9
    expect(instanceData[2]).toBeCloseTo(0.9, 4);
  });
});
