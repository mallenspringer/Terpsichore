import { LayerState, SpawnEffect, PathEffect } from '../state/types';
import { SignalDispatcher } from '../state/SignalDispatcher';

export interface SpawnedObject {
  id: string;
  birthX: number;
  birthY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  birthScale: number;
  endScale: number;
  rotation: number;
  angularVelocity: number;
  randomSeed: number;
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
  private lastTime = new Map<string, number>();
  private emitAccumulators = new Map<string, number>();

  public getSpawnCount(layerId: string, nodeId: string): number {
    return this.spawnStates.get(`${layerId}.${nodeId}`)?.length ?? 0;
  }

  public getSpawns(layerId: string, nodeId: string): SpawnedObject[] {
    return this.spawnStates.get(`${layerId}.${nodeId}`) || [];
  }

  public update(
    layer: LayerState,
    timeSec: number,
    _canvasWidth: number,
    _canvasHeight: number,
    getEffectiveParam: EffectiveParamResolver
  ) {
    const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);

    layer.effects
      .filter(e => e.type === 'Spawn')
      .forEach(effect => {
        const sp = effect as SpawnEffect;
        const stateKey = `${layer.id}.${effect.id}`;
        let activeSpawns = this.spawnStates.get(stateKey) || [];

        const prevTime = this.lastTime.get(stateKey) ?? timeSec;
        const dt = Math.min(0.1, Math.max(0.0001, timeSec - prevTime));
        this.lastTime.set(stateKey, timeSec);

        // Resolve reset trigger
        const resetVal = latestSignals[`${effect.id}.reset_in`] ?? 0;
        const currentManualReset = sp.manualResetTime ?? 0;
        const lastManualReset = this.lastTriggerVals.get(`${stateKey}.manualReset`) ?? 0;
        const isManualReset = currentManualReset > lastManualReset;
        this.lastTriggerVals.set(`${stateKey}.manualReset`, currentManualReset);

        if (resetVal > 0.5 || isManualReset) {
          activeSpawns = [];
          this.emitAccumulators.set(stateKey, 0);
        }

        // Resolve manual/sequenced trigger
        const triggerInVal = latestSignals[`${effect.id}.trigger_in`] ?? 0;
        const lastVal = this.lastTriggerVals.get(stateKey) ?? 0;
        const currentManualTrig = sp.manualTriggerTime ?? 0;
        const lastManualTrig = this.lastTriggerVals.get(`${stateKey}.manualTrig`) ?? 0;
        const isManualTrig = currentManualTrig > lastManualTrig;
        this.lastTriggerVals.set(`${stateKey}.manualTrig`, currentManualTrig);

        const isTriggered = (triggerInVal > 0.5 && lastVal <= 0.5) || isManualTrig;
        this.lastTriggerVals.set(stateKey, triggerInVal);

        const emissionMode = sp.emissionMode || 'rate';
        const disseminationMode = sp.disseminationMode || 'cone';
        const maxCount = Math.max(1, Math.min(64, sp.maxCount || 16));
        const lifetime = Math.max(0.1, sp.lifetime || 3.0);

        const modX = getEffectiveParam(layer, effect.id, 'x', sp.x ?? 0, timeSec);
        const modY = getEffectiveParam(layer, effect.id, 'y', sp.y ?? 0, timeSec);
        const modScale = Math.max(0.01, getEffectiveParam(layer, effect.id, 'scale', sp.scale ?? 0.4, timeSec));
        const modSpeed = Math.max(0.0, getEffectiveParam(layer, effect.id, 'speed_cv', sp.speed ?? 0.3, timeSec));
        const modAngle = getEffectiveParam(layer, effect.id, 'angle_cv', sp.angle ?? 90, timeSec);
        const modRate = Math.max(0.1, getEffectiveParam(layer, effect.id, 'rate_cv', sp.emitRate ?? 3, timeSec));
        const modGrav = getEffectiveParam(layer, effect.id, 'gravity_cv', sp.gravity ?? 0, timeSec);

        // Helper to instantiate a clone
        const spawnOne = (indexInBurst = 0, totalInBurst = 1) => {
          let vx = 0;
          let vy = 0;
          const randPos = (sp.randomPos ?? 0.05);
          const rx = (Math.random() * 2 - 1) * randPos;
          const ry = (Math.random() * 2 - 1) * randPos;
          const rSeed = Math.random() * Math.PI * 2;

          if (disseminationMode === 'cone') {
            const spreadDeg = sp.coneSpread ?? 45;
            const angleDeg = modAngle + (Math.random() * 2 - 1) * (spreadDeg / 2);
            const rad = (angleDeg * Math.PI) / 180.0;
            vx = Math.cos(rad) * modSpeed;
            vy = Math.sin(rad) * modSpeed;
          } else if (disseminationMode === 'burst') {
            const rad = Math.random() * Math.PI * 2;
            vx = Math.cos(rad) * modSpeed;
            vy = Math.sin(rad) * modSpeed;
          } else if (disseminationMode === 'array') {
            // Static geometric arrangement
            const frac = totalInBurst > 1 ? indexInBurst / totalInBurst : Math.random();
            const rad = frac * Math.PI * 2;
            const radius = 0.4;
            vx = 0;
            vy = 0;
            return {
              id: `spawn_${Date.now()}_${Math.random()}`,
              birthX: modX + Math.cos(rad) * radius,
              birthY: modY + Math.sin(rad) * radius,
              x: modX + Math.cos(rad) * radius,
              y: modY + Math.sin(rad) * radius,
              vx: 0,
              vy: 0,
              birthScale: modScale,
              endScale: sp.scaleEnd ?? 0.1,
              rotation: rad,
              angularVelocity: sp.spin ?? 0,
              randomSeed: rSeed,
              birthTime: timeSec,
              lifetime,
              alpha: 1.0
            };
          }

          return {
            id: `spawn_${Date.now()}_${Math.random()}`,
            birthX: modX + rx,
            birthY: modY + ry,
            x: modX + rx,
            y: modY + ry,
            vx,
            vy,
            birthScale: modScale * (1.0 + (Math.random() * 2 - 1) * (sp.randomScale ?? 0.1)),
            endScale: sp.scaleEnd ?? 0.1,
            rotation: (Math.random() * 2 - 1) * Math.PI,
            angularVelocity: (sp.spin ?? 0) + (Math.random() * 2 - 1) * 0.5,
            randomSeed: rSeed,
            birthTime: timeSec,
            lifetime,
            alpha: 1.0
          };
        };

        // 1. Spawning Logic based on emissionMode
        if (emissionMode === 'trigger') {
          if (isTriggered) {
            const countToSpawn = disseminationMode === 'burst' ? 8 : 1;
            for (let i = 0; i < countToSpawn; i++) {
              activeSpawns.unshift(spawnOne(i, countToSpawn));
            }
          }
        } else if (emissionMode === 'rate') {
          let accum = (this.emitAccumulators.get(stateKey) ?? 0) + dt;
          const interval = 1.0 / modRate;
          while (accum >= interval && activeSpawns.length < maxCount) {
            activeSpawns.unshift(spawnOne());
            accum -= interval;
          }
          if (accum > interval * 2) accum = 0; // prevent burst after pause
          this.emitAccumulators.set(stateKey, accum);
        } else if (emissionMode === 'array') {
          // Keep exactly maxCount items active
          if (activeSpawns.length !== maxCount) {
            activeSpawns = [];
            for (let i = 0; i < maxCount; i++) {
              activeSpawns.push(spawnOne(i, maxCount));
            }
          }
        }

        // Cap count
        while (activeSpawns.length > maxCount) {
          activeSpawns.pop();
        }

        // 2. Physics & Lifecycle Simulation
        const dragFactor = Math.max(0, 1.0 - (sp.drag ?? 0.05) * dt * 5.0);

        activeSpawns = activeSpawns.filter(obj => {
          const age = timeSec - obj.birthTime;
          if (emissionMode !== 'array' && age >= obj.lifetime) {
            return false;
          }

          const tNorm = Math.min(1.0, age / obj.lifetime);

          if (emissionMode !== 'array') {
            // Apply drag & gravity
            obj.vx *= dragFactor;
            obj.vy *= dragFactor;
            obj.vy -= modGrav * dt * 0.5;

            obj.x += obj.vx * dt;
            obj.y += obj.vy * dt;
            obj.rotation += obj.angularVelocity * dt;

            obj.alpha = sp.fadeOut ? Math.max(0, 1.0 - tNorm) : 1.0;
          } else {
            obj.rotation += (sp.spin ?? 0) * dt;
            obj.alpha = 1.0;
          }

          return true;
        });

        this.spawnStates.set(stateKey, activeSpawns);
      });
  }

  public computeInstanceData(
    layer: LayerState,
    nodeId: string,
    timeSec: number,
    _targetWidth: number,
    _targetHeight: number,
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

    // Check for connected Path module
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
      const tNorm = Math.min(1.0, age / obj.lifetime);

      let posX = obj.x;
      let posY = obj.y;

      // When Path module is plugged in, guide the instance along the flight track
      if (pathEffect) {
        if (pathEffect.mode === 'physics') {
          posX = obj.birthX + tNorm * pathDrift * 0.5;
          posY = obj.birthY - tNorm * pathSpeed * 0.5;
        } else if (pathEffect.mode === 'wiggle') {
          posX = obj.birthX + Math.sin(tNorm * Math.PI * 2 * pathFreq + obj.randomSeed) * pathStrength * 0.25;
          posY = obj.birthY + Math.cos(tNorm * Math.PI * 2 * pathFreq * 0.7 + obj.randomSeed) * pathStrength * 0.25;
        } else if (pathEffect.mode === 'orbit') {
          const orbitAngle = tNorm * Math.PI * 2 * pathSpeed + obj.randomSeed;
          posX = obj.birthX + Math.cos(orbitAngle) * (pathStrength * 0.35);
          posY = obj.birthY + Math.sin(orbitAngle) * (pathStrength * 0.35);
        }
      }

      // Interpolate scale over lifetime
      const endS = sp.scaleEnd !== undefined ? sp.scaleEnd : 0.1;
      const currentScale = obj.birthScale + (endS - obj.birthScale) * tNorm;

      const base = idx * 8;
      instanceData[base + 0] = posX;
      instanceData[base + 1] = posY;
      instanceData[base + 2] = currentScale;
      instanceData[base + 3] = obj.rotation;
      instanceData[base + 4] = obj.alpha;
      // padding: 5, 6, 7
    });

    return { instanceData, count: spawns.length };
  }

  public reset() {
    this.spawnStates.clear();
    this.lastTriggerVals.clear();
    this.lastTime.clear();
    this.emitAccumulators.clear();
  }
}
