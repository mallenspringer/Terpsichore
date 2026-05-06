import { useEngineStore } from './store';
import { LayerState } from './types';
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

type SignalFunction = (context: DispatchContext) => void;

interface DispatchContext {
  layer: LayerState;
  signalValues: Record<string, number>;
  audioEngine: AudioEngine;
}

export class SignalDispatcher {
  private static instance: SignalDispatcher;
  
  // Cache of compiled pipelines per layer
  private pipelines: Record<string, SignalFunction[]> = {};
  
  // State for stateful operations (like smoothing)
  // Key: layerId + nodeId + portId
  private ringBuffers: Record<string, RingBuffer> = {};

  // Cross-layer signal bus (Key: layerId.effectId.portIdx)
  private interLayerBus: Record<string, number> = {};

  private lastUiCommitTime = 0;
  private readonly UI_COMMIT_INTERVAL = 100; // 10fps

  private constructor() {}

  public static getInstance(): SignalDispatcher {
    if (!SignalDispatcher.instance) {
      SignalDispatcher.instance = new SignalDispatcher();
    }
    return SignalDispatcher.instance;
  }

  private isRunning = false;
  private animationFrameId = 0;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastUiCommitTime = performance.now();
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private loop = () => {
    if (!this.isRunning) return;
    this.execute();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /**
   * Translates the node graph of a layer into a flat list of optimized functions.
   */
  public compileLayer(layer: LayerState) {
    const pipeline: SignalFunction[] = [];
    const edges = layer.graph?.edges || [];

    // Pre-calculate Bipolar converters so we can run them first/last or inline.
    // For now, we'll just evaluate them inline by topological sort. 
    // Since we don't have a real topological sort yet, we'll just do a 2-pass approach:
    // Pass 1: Raw outputs to converter inputs
    // Pass 2: Converters to their outputs
    // Actually, let's just make the execution loop evaluate standard edges, then converters.
    // We can do it elegantly here.

    edges.forEach(edge => {
      pipeline.push((ctx: DispatchContext) => {
        let rawValue = 0;

        if (edge.fromNodeId === 'source') {
           rawValue = (ctx.layer.source as any)[edge.fromPort] ?? 0;
           
           if (edge.fromPort === 'audio_out') {
             rawValue = ctx.audioEngine.getPeakVolume(ctx.layer.id);
           }
        } else {
           // First check if there's a scalar value from a module (like LFO or another mod port)
           rawValue = ctx.signalValues[`${edge.fromNodeId}.${edge.fromPort}`] ?? 0;
           
           // Then check if this is a Video-to-Mod connection by looking at the Renderer's readback
           // We'll access the renderer via the global window or similar if needed, 
           // but for now let's assume it's available on the window object as 'renderer'
           const renderer = (window as any).renderer;
           if (renderer && renderer.latestLumaValues) {
             const luma = renderer.latestLumaValues[`${edge.fromNodeId}.${edge.fromPort}`];
             if (luma !== undefined) {
               rawValue = luma;
             }
           }
        }

        let processedValue = rawValue;

        // Apply per-port input settings (Sensitivity & Bipolar conversion)
        const settings = ctx.layer.inputSettings?.[`${edge.toNodeId}.${edge.toPort}`];
        if (settings) {
          if (settings.bipolar) {
            processedValue = (processedValue * 2.0) - 1.0;
          }
          processedValue *= settings.amount;
        }

        ctx.signalValues[`${edge.toNodeId}.${edge.toPort}`] = (ctx.signalValues[`${edge.toNodeId}.${edge.toPort}`] ?? 0) + processedValue;
      });
    });

    // Ensure logic nodes are populated
    layer.effects.forEach(effect => {
      if (effect.type === 'AudioAnalyzer') {
        pipeline.push((ctx: DispatchContext) => {
          let peak = ctx.audioEngine.getPeakVolume(ctx.layer.id);
          const smoothing = (effect as any).smoothing ?? 0;
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
      } else if (effect.type === 'Path') {
        pipeline.push((ctx: DispatchContext) => {
          const ef = effect as any;
          const time = performance.now() / 1000;
          // Output a basic oscillation based on frequency for the mod port
          ctx.signalValues[`${effect.id}.modulation_out`] = Math.sin(time * (ef.frequency || 1)) * 0.5 + 0.5;
        });
      }
    });

    this.pipelines[layer.id] = pipeline;
  }

  /**
   * Called every frame to execute the pre-compiled pipelines.
   */
  public execute() {
    const state = useEngineStore.getState();
    const audioEngine = AudioEngine.getInstance();
    
    const now = performance.now();
    const shouldCommitToUi = now - this.lastUiCommitTime > this.UI_COMMIT_INTERVAL;

    Object.values(state.layers).forEach(layer => {
      this.compileLayer(layer);
      
      // Create a fresh signalValues object for this frame, 
      // but ensure all ports that WERE modulated are explicitly zeroed out 
      // so the UI and Renderer don't "stick" to old values.
      const freshSignals: Record<string, number> = {};
      Object.keys(layer.signalValues || {}).forEach(key => { freshSignals[key] = 0; });

      // After zeroing, populate InterLayerInput ports from the global bus
      state.interLayerEdges.filter(e => e.toLayerId === layer.id).forEach(edge => {
        const busKey = `${edge.fromLayerId}.${edge.fromEffectId}.${edge.fromPortIdx}`;
        const value = this.interLayerBus[busKey] ?? 0;
        freshSignals[`${edge.toEffectId}.out_${edge.toPortIdx}`] = value;
      });

      const ctx: DispatchContext = {
        layer,
        signalValues: freshSignals,
        audioEngine
      };

      const pipeline = this.pipelines[layer.id];
      if (pipeline) {
        pipeline.forEach(fn => fn(ctx));
      }

      // 1. High-Performance direct mutation (Renderer reads this instantly)
      layer.signalValues = ctx.signalValues;

      // 2. Throttled UI React state update
      if (shouldCommitToUi) {
        state.updateLayerSignals(layer.id, ctx.signalValues);
      }

      // 3. Populate interLayerBus for the NEXT frame (or current frame for later layers)
      layer.effects.filter(e => e.type === 'InterLayerOutput').forEach(e => {
        const count = (e as any).portCount || 1;
        for (let i = 0; i < count; i++) {
          const val = ctx.signalValues[`${e.id}.in_${i}`] ?? 0;
          this.interLayerBus[`${layer.id}.${e.id}.${i}`] = val;
        }
      });

      // 4. Populate ColorRGB discrete outputs
      layer.effects.filter(e => e.type === 'ColorRGB').forEach(e => {
        const ef = e as any;
        ctx.signalValues[`${e.id}.r_out`] = (ctx.signalValues[`${e.id}.r_cv`] ?? 0) + (ef.r ?? 0);
        ctx.signalValues[`${e.id}.g_out`] = (ctx.signalValues[`${e.id}.g_cv`] ?? 0) + (ef.g ?? 0);
        ctx.signalValues[`${e.id}.b_out`] = (ctx.signalValues[`${e.id}.b_cv`] ?? 0) + (ef.b ?? 0);
      });
    });

    if (shouldCommitToUi) {
      this.lastUiCommitTime = now;
    }
  }
}
