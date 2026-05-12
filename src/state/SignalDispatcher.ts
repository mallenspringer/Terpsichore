import { useEngineStore } from './store';
import { LayerState, TriggerPadSource, LogicGateEffect, TriggeredGateEffect, InverterEffect } from './types';
import { AudioEngine } from './AudioEngine';

// Ring buffer for smoothing temporal values (like rolling means)
class RingBuffer {
  private buffer: Float32Array;
  private head = 0;
  private sum = 0;
  private count = 0;

  constructor(public size: number) {
    this.buffer = new Float32Array(size);
  }

  push(value: number) {
    if (this.count === this.size) {
      this.sum -= this.buffer[this.head];
    } else {
      this.count++;
    }
    this.buffer[this.head] = value;
    this.sum += value;
    this.head = (this.head + 1) % this.size;
  }

  getMean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }
}

type SignalFunction = (context: DispatchContext, dt: number) => void;

interface DispatchContext {
  layer: LayerState;
  signalValues: Record<string, number>;
  audioEngine: AudioEngine;
}

export class SignalDispatcher {
  private static instance: SignalDispatcher;
  
  private pipelines: Record<string, SignalFunction[]> = {};
  private ringBuffers: Record<string, RingBuffer> = {};
  private interLayerBus: Record<string, number> = {};

  private lastUiCommitTime = 0;
  private readonly UI_COMMIT_INTERVAL = 100; // 10fps
  private lastTime = performance.now();
  private frameCount = 0;
  private lfoPhases: Record<string, number> = {};
  private noiseStates = new Map<string, { value: number; b0: number; b1: number; b2: number; b3: number; b4: number; b5: number; b6: number; brown: number; seed: number; t: number }>();
  private lastTriggerVals = new Map<string, number>();
  private triggerPadStates = new Map<string, number>();
  private gateLatchStates = new Map<string, boolean>();
  private gateOpenStates = new Map<string, boolean>();

  private constructor() {}

  public static getInstance(): SignalDispatcher {
    if (!SignalDispatcher.instance) {
      SignalDispatcher.instance = new SignalDispatcher();
    }
    return SignalDispatcher.instance;
  }

  public getGateState(layerId: string, nodeId: string): boolean {
    return this.gateOpenStates.get(`${layerId}.${nodeId}`) ?? false;
  }


  public compileLayer(layer: LayerState) {
    const edges = layer.graph?.edges || [];
    
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    edges.forEach(edge => {
      if (!adj[edge.fromNodeId]) adj[edge.fromNodeId] = [];
      adj[edge.fromNodeId].push(edge.toNodeId);
      inDegree[edge.toNodeId] = (inDegree[edge.toNodeId] || 0) + 1;
      if (!inDegree[edge.fromNodeId]) inDegree[edge.fromNodeId] = 0;
    });

    const nodeIds = new Set<string>();
    nodeIds.add('source');
    layer.effects.forEach(e => nodeIds.add(e.id));
    Object.keys(layer.modulators || {}).forEach(id => nodeIds.add(id));
    edges.forEach(edge => { nodeIds.add(edge.fromNodeId); nodeIds.add(edge.toNodeId); });

    const queue: string[] = [];
    nodeIds.forEach(id => {
      if ((inDegree[id] || 0) === 0) queue.push(id);
    });

    const sortedNodeIds: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      sortedNodeIds.push(u);
      (adj[u] || []).forEach(v => {
        inDegree[v]--;
        if (inDegree[v] === 0) queue.push(v);
      });
    }

    const pipeline: SignalFunction[] = [];
    
    sortedNodeIds.forEach(nodeId => {
      if (nodeId === 'source') {
        pipeline.push((ctx) => {
          ctx.signalValues['source.video_out'] = 1.0;
        });
      } else {
        const mod = layer.modulators?.[nodeId];
        if (mod) {
          if (mod.type === 'LFO') {
          pipeline.push((ctx: DispatchContext, dt: number) => {
            const lfo = ctx.layer.modulators?.[nodeId] as any;
            if (!lfo) return;

            let phase = this.lfoPhases[nodeId] ?? lfo.phase ?? 0;
            phase = (phase + (lfo.frequency ?? 0) * dt) % 1.0; 
            this.lfoPhases[nodeId] = phase;
            
            let val = 0;
            switch (lfo.waveform) {
              case 'sine': val = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; break;
              case 'square': val = phase < 0.5 ? 1 : 0; break;
              case 'triangle': val = phase < 0.5 ? phase * 2 : 2 - phase * 2; break;
              case 'saw': val = phase; break;
            }
            const amplitude = (lfo.amplitude ?? 1.0) + (ctx.signalValues[`${nodeId}.amplitude_cv`] ?? 0);
            const offset = (lfo.offset ?? 0) + (ctx.signalValues[`${nodeId}.offset_cv`] ?? 0);
            const finalVal = val * amplitude + offset;
            ctx.signalValues[`${nodeId}.modulation_out`] = finalVal;
          });
          } else if (mod.type === 'Noise') {
          pipeline.push((ctx: DispatchContext, _dt: number) => {
            const noise = ctx.layer.modulators?.[nodeId] as any;
            if (!noise) return;

            const stateKey = `${ctx.layer.id}.${nodeId}`;
            let nState = this.noiseStates.get(stateKey);
            if (!nState) {
              nState = { value: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0, brown: 0, seed: Math.random(), t: 0 };
              this.noiseStates.set(stateKey, nState);
            }
            const white = Math.random() * 2 - 1;
            nState.b0 = 0.99886 * nState.b0 + white * 0.0555179;
            nState.b1 = 0.99332 * nState.b1 + white * 0.0750759;
            nState.b2 = 0.96900 * nState.b2 + white * 0.1538520;
            nState.b3 = 0.86650 * nState.b3 + white * 0.3104856;
            nState.b4 = 0.55000 * nState.b4 + white * 0.5329522;
            nState.b5 = -0.7616 * nState.b5 - white * 0.0168980;
            const pink = nState.b0 + nState.b1 + nState.b2 + nState.b3 + nState.b4 + nState.b5 + nState.b6 + white * 0.5362;
            nState.b6 = white * 0.115926;
            nState.value = pink * 0.11;
            
            const amplitude = (noise.amplitude ?? 1.0) + (ctx.signalValues[`${nodeId}.amplitude_cv`] ?? 0);
            const offset = (noise.offset ?? 0) + (ctx.signalValues[`${nodeId}.offset_cv`] ?? 0);
            const finalVal = (nState.value * 0.5 + 0.5) * amplitude + offset;
            ctx.signalValues[`${nodeId}.modulation_out`] = finalVal;
          });
          } else if (mod.type === 'TriggerPad') {
          pipeline.push((ctx: DispatchContext, dt: number) => {
            const pad = ctx.layer.modulators?.[nodeId] as TriggerPadSource;
            if (!pad) return;

            const stateKey = `${ctx.layer.id}.${nodeId}`;
            let current = this.triggerPadStates.get(stateKey) ?? 0;

            if (pad.useEnvelope) {
              const attack = Math.max(0.001, pad.attack ?? 0.01);
              const release = Math.max(0.001, pad.release ?? 0.1);

              if (pad.isPressed) {
                current = Math.min(1.0, current + dt / attack);
              } else {
                current = Math.max(0.0, current - dt / release);
              }
            } else {
              current = pad.isPressed ? 1.0 : 0.0;
            }

            this.triggerPadStates.set(stateKey, current);
            ctx.signalValues[`${nodeId}.trigger_out`] = current;
          });
          } else {
            pipeline.push((ctx) => {
              ctx.signalValues[`${nodeId}.modulation_out`] = (mod as any).value ?? 0;
            });
          }
        }

        const effect = layer.effects.find(e => e.id === nodeId);
        if (effect) {
          if (effect.type === 'AudioAnalyzer') {
            pipeline.push((ctx: DispatchContext) => {
              const analyzer = ctx.layer.effects.find(e => e.id === nodeId) as any;
              if (!analyzer) return;
              
              let peak = ctx.audioEngine.getPeakVolume(ctx.layer.id);
              const sensitivity = analyzer.sensitivity ?? 1.0;
              peak *= sensitivity;

              if (analyzer.logarithmic) {
                // Simple log scaling: log10(1 + peak * 9) / 1.0
                peak = Math.log10(1 + peak * 9);
              }

              const smoothing = analyzer.smoothing ?? 0;
              if (smoothing > 0) {
                const bufferKey = `${layer.id}_${effect.id}_audio_out`;
                let buffer = this.ringBuffers[bufferKey];
                const bufferSize = Math.max(1, Math.floor(smoothing * 60)); 
                if (!buffer || buffer.size !== bufferSize) {
                  buffer = new RingBuffer(bufferSize);
                  this.ringBuffers[bufferKey] = buffer;
                }
                buffer.push(peak);
                peak = buffer.getMean();
              }
              ctx.signalValues[`${effect.id}.out`] = peak;
            });
          } else if (effect.type === 'Inverter') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as InverterEffect;
              if (!ef) return;
              const mix = Math.max(0, Math.min(1, (ctx.signalValues[`${nodeId}.mix`] ?? 0) + (ef.mix ?? 1)));
              const cvIn = ctx.signalValues[`${nodeId}.cv_in`] ?? 0;
              let cvOut = cvIn;
              if (ef.active) {
                const inverted = ef.cvMode === 'bipolar' ? -cvIn : (1.0 - cvIn);
                cvOut = cvIn + (inverted - cvIn) * mix;
              }
              ctx.signalValues[`${nodeId}.cv_out`] = cvOut;
            });
          } else if (effect.type === 'LogicGate') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as LogicGateEffect;
              if (!ef) return;
              const threshA = ef.thresholdA ?? 0.5;
              const threshB = ef.thresholdB ?? 0.5;
              const aVal = ctx.signalValues[`${nodeId}.in_a`] ?? 0;
              const bVal = ctx.signalValues[`${nodeId}.in_b`] ?? 0;
              const a = aVal >= threshA;
              const b = bVal >= threshB;
              let isTrue = false;
              switch (ef.mode) {
                case 'and':  isTrue = a && b; break;
                case 'or':   isTrue = a || b; break;
                case 'xor':  isTrue = a !== b; break;
                case 'nand': isTrue = !(a && b); break;
                case 'nor':  isTrue = !(a || b); break;
              }
              ctx.signalValues[`${nodeId}.out`] = isTrue ? 1.0 : 0.0;
            });
          } else if (effect.type === 'TriggeredGate') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as TriggeredGateEffect;
              if (!ef) return;
              
              const sigIn = ctx.signalValues[`${nodeId}.sig_in`] ?? 0;
              const trigger = ctx.signalValues[`${nodeId}.trigger_in`] ?? 0;
              const threshold = ef.threshold ?? 0.5;
              const isActive = trigger >= threshold;
              
              const gateId = `${ctx.layer.id}.${nodeId}`;
              const lastValKey = gateId;
              const lastVal = this.lastTriggerVals.get(lastValKey) ?? 0;
              const wasActive = lastVal >= threshold;
              
              // Internal state management
              let currentActive = this.gateLatchStates.get(gateId) ?? false;
              if (ef.gateMode === 'latch') {
                if (isActive && !wasActive) {
                  currentActive = !currentActive;
                  this.gateLatchStates.set(gateId, currentActive);
                }
              } else {
                currentActive = isActive;
              }
              
              this.lastTriggerVals.set(lastValKey, trigger);
              
              let gateOpen = currentActive;
              if (ef.defaultState === 'on') {
                gateOpen = !currentActive;
              }
              
              this.gateOpenStates.set(gateId, !!gateOpen);
              
              // Audio Gating
              const edges = ctx.layer.graph?.edges ?? [];
              const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'sig_in');
              if (inputEdge && inputEdge.fromNodeId === 'source') {
                AudioEngine.getInstance().setModuleMute(ctx.layer.id, !gateOpen);
              }
              
              ctx.signalValues[`${nodeId}.sig_out`] = gateOpen ? sigIn : 0;
            });
          } else if (effect.type === 'SignalMath') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as any;
              if (!ef) return;
              const a = (ctx.signalValues[`${nodeId}.in_a`] ?? 0) + (ef.operandA ?? 0);
              const b = (ctx.signalValues[`${nodeId}.in_b`] ?? 0) + (ef.operandB ?? 0);
              let res = 0;
              switch (ef.operator) {
                case 'add': res = a + b; break;
                case 'subtract': res = a - b; break;
                case 'multiply': res = a * b; break;
                case 'divide': res = b !== 0 ? a / b : 0; break;
                case 'min': res = Math.min(a, b); break;
                case 'max': res = Math.max(a, b); break;
                case 'pow': res = Math.pow(Math.abs(a), b); break;
              }
              ctx.signalValues[`${nodeId}.out`] = res;
            });
          } else if (effect.type === 'Path') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = effect as any;
              const time = performance.now() / 1000;
              ctx.signalValues[`${effect.id}.modulation_out`] = Math.sin(time * (ef.frequency || 0)) * (ef.amplitude ?? 1.0) + (ef.offset ?? 0);
            });
          }
        }
      }

      const nodeEdges = edges.filter(e => e.fromNodeId === nodeId);
      nodeEdges.forEach(edge => {
        pipeline.push((ctx: DispatchContext) => {
          let rawValue = ctx.signalValues[`${edge.fromNodeId}.${edge.fromPort}`] ?? 0;
          
          if (edge.fromNodeId === 'source' && edge.fromPort === 'audio_out') {
            rawValue = ctx.audioEngine.getPeakVolume(ctx.layer.id);
          } else if (edge.fromPort === 'luma_val') {
             const renderer = (window as any).renderer;
             if (renderer && renderer.latestLumaValues) {
               const luma = renderer.latestLumaValues[`${edge.fromNodeId}.${edge.fromPort}`];
               if (luma !== undefined) rawValue = luma;
             }
          }

          let processedValue = rawValue;
          const settings = ctx.layer.inputSettings?.[`${edge.toNodeId}.${edge.toPort}`];
          if (settings) {
            if (settings.bipolar) processedValue = (processedValue * 2.0) - 1.0;
            processedValue *= settings.amount;
          }

          if (!Number.isNaN(processedValue)) {
            const targetKey = `${edge.toNodeId}.${edge.toPort}`;
            ctx.signalValues[targetKey] = (ctx.signalValues[targetKey] ?? 0) + processedValue;
          }
        });
      });
    });

    this.pipelines[layer.id] = pipeline;
  }

  private lastResetSignal = 0;

  public execute(force = false) {
    const state = useEngineStore.getState();
    const audioEngine = AudioEngine.getInstance();
    
    this.frameCount++;
    const now = performance.now();
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (state.globalResetSignal !== this.lastResetSignal) {
      this.lastResetSignal = state.globalResetSignal;
      this.lfoPhases = {};
      this.noiseStates.clear();
      this.triggerPadStates.clear();
      dt = 0;
    }

    if (state.isGlobalPaused) {
      dt = 0;
    }
    
    const shouldCommitToUi = force || (now - this.lastUiCommitTime > this.UI_COMMIT_INTERVAL);
    const modUpdates: Record<string, Record<string, any>> = {};

    const layerIds = state.layerOrder.length > 0 ? state.layerOrder : Object.keys(state.layers);
    layerIds.forEach(layerId => {
      const layer = state.layers[layerId];
      if (!layer) return;
      
      const edgeCount = layer.graph?.edges.length ?? 0;
      const modCount = Object.keys(layer.modulators || {}).length;
      const interCount = state.interLayerEdges.length;
      const settingsHash = JSON.stringify(layer.inputSettings || {});
      const cacheKey = `${layer.id}_${edgeCount}_${layer.effects.length}_${modCount}_${interCount}_${settingsHash}`;
      
      if (!(this as any)[`_cache_${layer.id}`] || (this as any)[`_cache_${layer.id}`] !== cacheKey) {
        this.compileLayer(layer);
        (this as any)[`_cache_${layer.id}`] = cacheKey;
      }
      
      const freshSignals: Record<string, number> = {};
      
      // 1. Pass 1: Sync Audio Engine Muting & Populate inter-layer inputs
      const isLayerAudioMuted = layer.audioMuted || layer.muted;
      audioEngine.setLayerMute(layer.id, !!isLayerAudioMuted);
      
      const isModuleAudioMuted = (layer.source as any).audioMuted || (layer.source as any).muted;
      audioEngine.setModuleMute(layer.id, !!isModuleAudioMuted);

      if (this.frameCount % 120 === 0) {
        audioEngine.setMasterMute(!!state.globalAudioMuted);
      }

      state.interLayerEdges.filter(e => e.toLayerId === layer.id).forEach(edge => {
        const busKey = `${edge.fromLayerId}.${edge.fromEffectId}.${edge.fromPortIdx}`;
        const value = this.interLayerBus[busKey] ?? 0;
        const targetKey = `${edge.toEffectId}.out_${edge.toPortIdx}`;
        freshSignals[targetKey] = value;
      });

      const ctx: DispatchContext = {
        layer,
        signalValues: freshSignals,
        audioEngine
      };

      const pipeline = this.pipelines[layer.id];
      if (pipeline) {
        pipeline.forEach(fn => fn(ctx, dt));
      }

      if (shouldCommitToUi) {
        state.updateLayerSignals(layer.id, ctx.signalValues);
        Object.keys(layer.modulators || {}).forEach(id => {
          modUpdates[id] = { value: ctx.signalValues[`${id}.modulation_out`] };
          if (this.lfoPhases[id] !== undefined) modUpdates[id].phase = this.lfoPhases[id];
        });
      }

      layer.effects.filter(e => e.type === 'InterLayerOutput').forEach(e => {
        const count = (e as any).portCount || 1;
        for (let i = 0; i < count; i++) {
          const val = ctx.signalValues[`${e.id}.in_${i}`] ?? 0;
          const busKey = `${layer.id}.${e.id}.${i}`;
          this.interLayerBus[busKey] = val;
        }
      });

      layer.effects.filter(e => e.type === 'ColorRGB').forEach(e => {
        const ef = e as any;
        ctx.signalValues[`${e.id}.r_out`] = (ctx.signalValues[`${e.id}.r_cv`] ?? 0) + (ef.r ?? 0);
        ctx.signalValues[`${e.id}.g_out`] = (ctx.signalValues[`${e.id}.g_cv`] ?? 0) + (ef.g ?? 0);
        ctx.signalValues[`${e.id}.b_out`] = (ctx.signalValues[`${e.id}.b_cv`] ?? 0) + (ef.b ?? 0);
      });

      layer.effects.filter(e => e.type === 'Inverter').forEach(e => {
        const ef = e as any;
        // Trigger can override active state if connected
        const trigger = ctx.signalValues[`${e.id}.trigger_in`] ?? 0;
        const lastTrig = this.lastTriggerVals.get(`${layer.id}.${e.id}`) ?? 0;
        
        if (ef.triggerMode === 'momentary') {
          ef.active = trigger > 0.5;
        } else {
          // Latching (Toggle)
          if (trigger > 0.5 && lastTrig <= 0.5) {
            ef.active = !ef.active;
          }
        }
        this.lastTriggerVals.set(`${layer.id}.${e.id}`, trigger);
      });
    });

    if (shouldCommitToUi) {
      Object.entries(modUpdates).forEach(([id, updates]) => {
        state.updateModulatorGlobal(id, updates);
      });
      this.lastUiCommitTime = now;
    }
  }
}
