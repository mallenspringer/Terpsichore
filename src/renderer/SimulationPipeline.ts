import { LayerState, SpawnEffect, PathEffect } from '../state/types';
import { SignalDispatcher } from '../state/SignalDispatcher';

export interface SpawnedObject {
  id: string;
  birthX: number;
  birthY: number;
  birthScale: number;
  birthRotation: number;
  randomX: number;
  randomY: number;
  randomScale: number;
  birthTime: number;
  lifetime: number;
  alpha: number;
}

export type EffectiveParamResolver = (
  layer: LayerState,
  nodeId: string,
  paramId: string,
  baseValue: number,
  timeSec: number
) => number;

export class SimulationPipeline {
  private spawnStates = new Map<string, SpawnedObject[]>();
  private lastTriggerVals = new Map<string, number>();

  public getSpawnCount(layerId: string, nodeId: string): number {
    return this.spawnStates.get(`${layerId}.${nodeId}`)?.length ?? 0;
  }

  public getSpawns(layerId: string, nodeId: string): SpawnedObject[] {
    return this.spawnStates.get(`${layerId}.${nodeId}`) || [];
  }

  public update(
    layer: LayerState,
    timeSec: number,
    canvasWidth: number,
    canvasHeight: number,
    getEffectiveParam: EffectiveParamResolver
  ) {
    const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);

    layer.effects
      .filter(e => e.type === 'Spawn')
      .forEach(effect => {
        const sp = effect as SpawnEffect;
        const stateKey = `${layer.id}.${effect.id}`;
        let activeSpawns = this.spawnStates.get(stateKey) || [];

        // Resolve triggers and resets from latestSignals
        const triggerInVal = latestSignals[`${effect.id}.trigger_in`] ?? 0;
        const lastVal = this.lastTriggerVals.get(stateKey) ?? 0;
        const isTriggered = triggerInVal > 0.5 && lastVal <= 0.5;
        this.lastTriggerVals.set(stateKey, triggerInVal);

        const resetVal = latestSignals[`${effect.id}.reset_in`] ?? 0;
        if (resetVal > 0.5) activeSpawns = [];

        if (isTriggered) {
          const modX = getEffectiveParam(layer, effect.id, 'x', sp.x, timeSec);
          const modY = getEffectiveParam(layer, effect.id, 'y', sp.y, timeSec);
          const modScale = getEffectiveParam(layer, effect.id, 'scale', sp.scale, timeSec);
          const modRot = getEffectiveParam(layer, effect.id, 'rotation', sp.rotation, timeSec);

          const rx =
            ((Math.random() * 2 - 1) * sp.randomPos) /
            (sp.coordinateMode === 'pixel' ? canvasWidth : 1);
          const ry =
            ((Math.random() * 2 - 1) * sp.randomPos) /
            (sp.coordinateMode === 'pixel' ? canvasHeight : 1);
          const rs = (Math.random() * 2 - 1) * (sp.randomScale || 0);

          activeSpawns.unshift({
            id: `spawn_${Date.now()}_${Math.random()}`,
            birthX: modX,
            birthY: modY,
            birthScale: modScale,
            birthRotation: modRot,
            randomX: rx,
            randomY: ry,
            randomScale: rs,
            birthTime: timeSec,
            lifetime: sp.lifetime,
            alpha: 1.0,
          });
          if (activeSpawns.length > sp.maxCount) activeSpawns.pop();
        }

        activeSpawns = activeSpawns.filter(obj => {
          const age = timeSec - obj.birthTime;
          if (age >= obj.lifetime) return false;
          obj.alpha = sp.fadeOut ? 1.0 - age / obj.lifetime : 1.0;
          return true;
        });

        this.spawnStates.set(stateKey, activeSpawns);
      });
  }

  public computeInstanceData(
    layer: LayerState,
    nodeId: string,
    timeSec: number,
    targetWidth: number,
    targetHeight: number,
    getEffectiveParam: EffectiveParamResolver
  ): { instanceData: Float32Array; count: number } {
    const stateKey = `${layer.id}.${nodeId}`;
    const spawns = this.spawnStates.get(stateKey) || [];
    if (spawns.length === 0) {
      return { instanceData: new Float32Array(0), count: 0 };
    }

    const effect = layer.effects.find(e => e.id === nodeId);
    if (!effect || effect.type !== 'Spawn') {
      return { instanceData: new Float32Array(0), count: 0 };
    }
    const sp = effect as SpawnEffect;

    // Get current modulated values (for Dynamic mode)
    let currentX = getEffectiveParam(layer, nodeId, 'x', sp.x, timeSec);
    let currentY = getEffectiveParam(layer, nodeId, 'y', sp.y, timeSec);
    const currentScale = getEffectiveParam(layer, nodeId, 'scale', sp.scale, timeSec);
    const currentRotation = getEffectiveParam(layer, nodeId, 'rotation', sp.rotation, timeSec);

    if (sp.coordinateMode === 'pixel') {
      currentX = (currentX / targetWidth) * 2 - 1;
      currentY = (currentY / targetHeight) * -2 + 1;
    }

    const latched = sp.latchedPorts || [];
    const isGlobal = sp.globalLatch || false;

    const resolve = (portId: string, current: number, birth: number) => {
      if (isGlobal) return birth;
      return latched.includes(portId) ? birth : current;
    };

    // --- Path Logic ---
    const pathEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'path_in');
    const pathEffect = pathEdge ? (layer.effects.find(e => e.id === pathEdge.fromNodeId) as PathEffect) : null;

    let pathSpeed = 1.0;
    let pathStrength = 1.0;
    let pathFreq = 1.0;
    let pathDrift = 0.0;
    if (pathEffect) {
      pathSpeed = getEffectiveParam(layer, pathEffect.id, 'speed', pathEffect.speed, timeSec);
      pathStrength = getEffectiveParam(layer, pathEffect.id, 'strength', pathEffect.strength, timeSec);
      pathFreq = getEffectiveParam(layer, pathEffect.id, 'frequency', pathEffect.frequency, timeSec);
      pathDrift = getEffectiveParam(layer, pathEffect.id, 'drift', pathEffect.drift, timeSec);
    }

    const instanceData = new Float32Array(spawns.length * 8);

    spawns.forEach((obj, idx) => {
      const age = timeSec - obj.birthTime;
      let pathOffsetX = 0;
      let pathOffsetY = 0;

      if (pathEffect) {
        if (pathEffect.mode === 'physics') {
          pathOffsetY = -age * pathSpeed * 0.1;
          pathOffsetX = age * pathDrift * 0.1;
        } else if (pathEffect.mode === 'wiggle') {
          pathOffsetX = Math.sin(age * pathFreq + obj.randomX * 100) * pathStrength * 0.05;
          pathOffsetY = Math.cos(age * pathFreq * 0.7 + obj.randomY * 100) * pathStrength * 0.05;
        } else if (pathEffect.mode === 'orbit') {
          const angle = age * pathSpeed + obj.randomX * Math.PI * 2;
          const dist = pathStrength * 0.1;
          pathOffsetX = Math.cos(angle) * dist;
          pathOffsetY = Math.sin(angle) * dist;
        }
      }

      const finalX = resolve('x', currentX, obj.birthX) + obj.randomX + pathOffsetX;
      const finalY = resolve('y', currentY, obj.birthY) + obj.randomY + pathOffsetY;
      const finalScale = resolve('scale', currentScale, obj.birthScale) * (1.0 + obj.randomScale);
      const finalRotation = resolve('rotation', currentRotation, obj.birthRotation);

      const base = idx * 8;
      instanceData[base + 0] = finalX;
      instanceData[base + 1] = finalY;
      instanceData[base + 2] = finalScale;
      instanceData[base + 3] = finalRotation;
      instanceData[base + 4] = obj.alpha;
      // padding: 5, 6, 7
    });

    return { instanceData, count: spawns.length };
  }

  public reset() {
    this.spawnStates.clear();
    this.lastTriggerVals.clear();
  }
}
