import { useEngineStore } from './store';
import {
  LayerState, TriggerPadSource, AudioInputSource, LogicGateEffect, TriggeredGateEffect, InverterEffect,
  SignalMathEffect, SampleAndHoldEffect, StepSequencerEffect, OscilloscopeEffect,
  SpectralSplitterEffect, AlphaAdjustEffect, AudioTransformerEffect, AudioModulatorEffect,
  AudioGateEffect, SpeechEnvelopeTrackerEffect, VocalPitchTrackerEffect, VowelFormantTrackerEffect,
  SpokenWordVisualizerEffect, PoetrySequencerEffect, BlackoutPoetryEffect, AudioToCVEffect, ColorPaletteEffect, ImageCueSource, TextCueSource,
  TextMakerEffect, OpticalSensorEffect, FeedbackProEffect
} from './types';
import { tokenizePoetry, formatPoetryStep, PoetryToken } from '../utils/poetryUtils';
import { findConnectedTextCue, stepTextCueCardBy, stepTextCueBankBy } from '../utils/textCueUtils';
import { AudioEngine } from './AudioEngine';
import { MidiManager } from './MidiManager';
import { MediaManager } from '../renderer/MediaManager';
import { ImageCueManager } from '../renderer/ImageCueManager';
import { SensorEngine } from '../sensor/SensorEngine';

type SignalFunction = (context: DispatchContext, dt: number) => void;

interface DispatchContext {
  layer: LayerState;
  signalValues: Record<string, number>;
  audioEngine: AudioEngine;
}

export class SignalDispatcher {
  private static instance: SignalDispatcher;

  private pipelines: Record<string, SignalFunction[]> = {};
  private interLayerBus: Record<string, number> = {};

  private lastUiCommitTime = 0;
  private readonly UI_COMMIT_INTERVAL = 100; // 10fps
  private lastTime = performance.now();
  private frameCount = 0;
  private lfoPhases: Record<string, number> = {};
  private noiseStates = new Map<string, { value: number; b0: number; b1: number; b2: number; b3: number; b4: number; b5: number; b6: number; brown: number; seed: number; t: number; lastManualTime: number }>();
  private shStates: Map<string, number> = new Map();
  private shLiveStates = new Map<string, boolean>();
  private lastTriggerVals = new Map<string, number>();
  private triggerPadStates = new Map<string, number>();
  private gateLatchStates = new Map<string, boolean>();
  private gateOpenStates = new Map<string, boolean>();
  private sequencerStates = new Map<string, { phase: number; currentStep: number; lastGlobalValue: number; lastStepValues: number[]; lastResetManualTime: number; isPaused: boolean; directionState: 'up' | 'down'; lastManualPlayState?: string }>();
  private spectralStates = new Map<string, { low: number; lowMid: number; mid: number; highMid: number; high: number }>();
  private transformerEnvelopes = new Map<string, number>();
  private latestSignals: Record<string, Record<string, number>> = {};
  private speechStateMap = new Map<string, boolean>();
  private pitchHoldState = new Map<string, { hz: number; midi: number; lastNoteMidi: number; silenceMs: number }>();
  private vowelHoldState = new Map<string, { x: number; y: number; f1: number; f2: number; lastZone: string; silenceMs: number; initialized?: boolean }>();
  private audioToCvSmoothed = new Map<string, number>();
  private midiOverrides = new Map<string, number>();
  private imageCueStates = new Map<string, { dirTimer: number; bankTimer: number; intraBankTimer: number; gateTimer: number }>();
  private textCueStates = new Map<string, { bankTimer: number; intraBankTimer: number; gateTimer: number }>();
  private poetrySeqStates = new Map<string, {
    currentStepIndex: number;
    stepCount: number;
    currentText: string;
    prevText: string;
    totalSteps: number;
    lastTextKey: string;
    lastManualStep: number;
    lastManualPrev: number;
    lastManualReset: number;
    cadence: number;
    syllableRateHz: number;
    pauseTensionCv: number;
    inSpeech: boolean;
    silenceDurationMs: number;
    stepPulseMs: number;
    caesuraPulseMs: number;
    tokens: PoetryToken[];
  }>();
  private blackoutStates = new Map<string, {
    flashEnvelope: number;
    survivorRatio: number;
    survivorCount: number;
    totalWordCount: number;
    lastSourceStepCount: number;
    lastTextValue: string;
    rerollPulseMs: number;
    rampProgress: number;
    rampDir: 1 | -1;
    progressiveDensity: number;
    wordDurationMs: number;
    textGeneration: number;
    lastManualRampReset: number;
    rampDoneLatched: boolean;
  }>();

  private constructor() {
    MidiManager.getInstance().initialize();
  }

  public static getInstance(): SignalDispatcher {
    if (!SignalDispatcher.instance) {
      SignalDispatcher.instance = new SignalDispatcher();
    }
    return SignalDispatcher.instance;
  }

  public getGateState(layerId: string, nodeId: string): boolean {
    return this.gateOpenStates.get(`${layerId}.${nodeId}`) ?? false;
  }

  public setGateState(layerId: string, nodeId: string, state: boolean) {
    this.gateOpenStates.set(`${layerId}.${nodeId}`, state);
  }

  public getLatestSignals(layerId: string): Record<string, number> {
    return this.latestSignals[layerId] || {};
  }

  public getPoetrySequencerRuntime(layerId: string, nodeId: string) {
    return this.poetrySeqStates.get(`${layerId}.${nodeId}`) ?? null;
  }

  public getBlackoutRuntime(layerId: string, nodeId: string) {
    return this.blackoutStates.get(`${layerId}.${nodeId}`) ?? null;
  }

  public reportBlackoutStats(layerId: string, nodeId: string, survivorCount: number, totalWordCount: number) {
    const key = `${layerId}.${nodeId}`;
    const st = this.blackoutStates.get(key);
    if (st) {
      st.survivorCount = survivorCount;
      st.totalWordCount = totalWordCount;
      st.survivorRatio = totalWordCount > 0 ? survivorCount / totalWordCount : 0;
    }
  }

  public resolveTargetModuleId(target: any, layer: LayerState): string | null {
    if (!target) return null;
    if (target.type === 'absolute') {
      const exists = layer.effects.some(e => e.id === target.moduleId) || (layer.source as any).id === target.moduleId;
      return exists ? target.moduleId : null;
    } else {
      const match = [layer.source, ...layer.effects].filter(m => m.type === target.moduleType);
      return (match[target.index] as any)?.id || null;
    }
  }

  public getMidiOverride(layerId: string, moduleId: string, paramId: string): number | null {
    return this.midiOverrides.get(`${layerId}.${moduleId}.${paramId}`) ?? null;
  }

  private syncAudioInputGate(ctx: DispatchContext, busId: string, moduleId: string, cfg: AudioInputSource) {
    const thresholdDb = this.getMidiOverride(ctx.layer.id, moduleId, 'gateThresholdDb') ?? cfg.gateThresholdDb ?? -40;
    ctx.audioEngine.updateStreamGate?.(busId, {
      enabled: !!cfg.gateEnabled,
      thresholdDb,
      mode: cfg.gateMode || 'voice'
    });
  }

  private resolveAudioBusId(
    layerId: string,
    edge?: { fromNodeId: string; fromPort?: string },
    effects?: LayerState['effects']
  ): string {
    if (!edge) return 'master';
    if (edge.fromNodeId !== 'source') {
      const layerEffects = effects ?? useEngineStore.getState().layers[layerId]?.effects;
      const fromEffect = layerEffects?.find(e => e.id === edge.fromNodeId);
      if (fromEffect?.type === 'AudioSource') {
        return (fromEffect as any).busId || 'master';
      }
    }
    const baseBusId = edge.fromNodeId === 'source' ? layerId : edge.fromNodeId;
    return (edge.fromPort === 'ch1_out' || edge.fromPort === 'ch2_out')
      ? `${baseBusId}__${edge.fromPort}`
      : baseBusId;
  }

  private stepVocalPitchState(
    stateKey: string,
    hz: number,
    midi: number,
    confidence: number,
    tolerance: number,
    holdOnSilence: boolean,
    holdTimeoutMs: number,
    dt: number
  ) {
    const state = this.pitchHoldState.get(stateKey) ?? { hz: 0, midi: 0, lastNoteMidi: 0, silenceMs: 0 };
    const isVoiced = hz > 20 && confidence >= tolerance;
    let isNoteChange = false;

    if (isVoiced) {
      const midiNote = 12 * Math.log2(hz / 440) + 69;
      if (state.lastNoteMidi > 0 && Math.abs(midiNote - state.lastNoteMidi) >= 0.5) {
        isNoteChange = true;
      }
      state.hz = hz;
      state.midi = midi;
      state.lastNoteMidi = midiNote;
      state.silenceMs = 0;
    } else {
      state.silenceMs += dt * 1000;
      if (!holdOnSilence) {
        state.hz = 0;
        state.midi = 0;
        state.lastNoteMidi = 0;
      } else if (state.silenceMs >= holdTimeoutMs) {
        const rolloff = 1.0 - Math.exp(-Math.max(0.001, dt) / 0.18);
        state.midi = state.midi * (1.0 - rolloff);
        if (state.midi < 0.005) {
          state.midi = 0;
          state.hz = 0;
          state.lastNoteMidi = 0;
        }
      }
    }

    this.pitchHoldState.set(stateKey, state);
    return { hz: state.hz, midi: state.midi, isNoteChange };
  }

  private stepVowelFormantState(
    stateKey: string,
    formant: { f1: number; f2: number; x: number; y: number; voiced?: boolean },
    busRms: number | undefined,
    smoothing: number,
    holdOnSilence: boolean,
    holdTimeoutMs: number,
    dt: number
  ) {
    const state = this.vowelHoldState.get(stateKey) ?? {
      x: 0.5,
      y: 0.5,
      f1: 0,
      f2: 0,
      lastZone: 'none',
      silenceMs: 0
    };

    const getVowelZone = (x: number, y: number): string => {
      if (x < 0.5) {
        return y >= 0.5 ? 'Oo' : 'Oh';
      } else {
        return y >= 0.5 ? 'Ee' : 'Ah';
      }
    };

    const isSilent = (busRms !== undefined && busRms < 0.005) || formant.voiced === false;
    let isVowelChange = false;

    if (!isSilent) {
      state.silenceMs = 0;
      if (!state.initialized) {
        state.x = formant.x;
        state.y = formant.y;
        state.f1 = formant.f1;
        state.f2 = formant.f2;
        state.initialized = true;
      } else {
        const frameSteps = Math.max(0.05, Math.min(4.0, dt * 60));
        const alpha = 1.0 - Math.pow(Math.max(0, Math.min(0.99, smoothing)), frameSteps);
        state.x = state.x + alpha * (formant.x - state.x);
        state.y = state.y + alpha * (formant.y - state.y);
        state.f1 = state.f1 === 0 ? formant.f1 : state.f1 + alpha * (formant.f1 - state.f1);
        state.f2 = state.f2 === 0 ? formant.f2 : state.f2 + alpha * (formant.f2 - state.f2);
      }

      const currentZone = getVowelZone(state.x, state.y);
      if (state.lastZone !== 'none' && currentZone !== state.lastZone) {
        isVowelChange = true;
      }
      state.lastZone = currentZone;
    } else {
      state.silenceMs += dt * 1000;
      if (!holdOnSilence) {
        state.x = 0.5;
        state.y = 0.5;
        state.f1 = 0;
        state.f2 = 0;
        state.lastZone = 'none';
        state.initialized = false;
      } else if (state.silenceMs >= holdTimeoutMs) {
        const rolloff = 1.0 - Math.exp(-Math.max(0.001, dt) / 0.18);
        state.x = state.x + rolloff * (0.5 - state.x);
        state.y = state.y + rolloff * (0.5 - state.y);
        state.f1 = state.f1 * (1.0 - rolloff);
        state.f2 = state.f2 * (1.0 - rolloff);
        if (Math.abs(state.x - 0.5) < 0.01 && Math.abs(state.y - 0.5) < 0.01) {
          state.lastZone = 'none';
          state.initialized = false;
        }
      }
    }

    this.vowelHoldState.set(stateKey, state);
    return { x: state.x, y: state.y, f1: state.f1, f2: state.f2, isVowelChange };
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
    layer.effects.forEach(e => { if (e.id) nodeIds.add(e.id); });
    Object.keys(layer.modulators || {}).forEach(id => nodeIds.add(id));
    edges.forEach(edge => { nodeIds.add(edge.fromNodeId); nodeIds.add(edge.toNodeId); });

    const queue: string[] = [];
    nodeIds.forEach(id => {
      if ((inDegree[id] || 0) === 0) queue.push(id);
    });

    const sortedNodeIds: string[] = [];
    const sortedSet = new Set<string>();
    const enqueueZeroes = () => {
      while (queue.length > 0) {
        const u = queue.shift()!;
        if (sortedSet.has(u)) continue;
        sortedSet.add(u);
        sortedNodeIds.push(u);
        (adj[u] || []).forEach(v => {
          inDegree[v]--;
          if (inDegree[v] === 0 && !sortedSet.has(v)) queue.push(v);
        });
      }
    };

    enqueueZeroes();

    // Gracefully break remaining graph cycles (e.g. TextCue <-> PoetrySequencer trigger sync loops)
    // so feedback-connected nodes remain active instead of being dropped.
    while (sortedNodeIds.length < nodeIds.size) {
      let bestId: string | null = null;
      let bestDeg = Infinity;
      nodeIds.forEach(id => {
        if (sortedSet.has(id)) return;
        const deg = inDegree[id] ?? 0;
        if (deg < bestDeg || (deg === bestDeg && id === 'source')) {
          bestDeg = deg;
          bestId = id;
        }
      });
      if (!bestId) break;
      queue.push(bestId);
      enqueueZeroes();
    }

    const nodeRank: Record<string, number> = {};
    sortedNodeIds.forEach((id, idx) => { nodeRank[id] = idx; });

    const pipeline: SignalFunction[] = [];

    // Seed any cycle back-edges from previous frame's latestSignals (1-frame feedback delay)
    const backEdges = edges.filter(
      e => (nodeRank[e.toNodeId] ?? Infinity) <= (nodeRank[e.fromNodeId] ?? -1)
    );
    if (backEdges.length > 0) {
      pipeline.push((ctx: DispatchContext) => {
        const prevSignals = this.latestSignals[ctx.layer.id] || {};
        backEdges.forEach(edge => {
          this.propagateEdgeSignal(ctx, edge, prevSignals[`${edge.fromNodeId}.${edge.fromPort}`] ?? 0);
        });
      });
    }

    sortedNodeIds.forEach(nodeId => {
      if (nodeId === 'source') {
        pipeline.push((ctx: DispatchContext, dt: number) => {
          ctx.signalValues['source.video_out'] = 1.0;
          const srcType = ctx.layer.source.type;
          if (srcType === 'AudioInput' || srcType === 'AudioFile' || srcType === 'SystemAudio') {
            if (srcType === 'AudioInput') {
              this.syncAudioInputGate(ctx, ctx.layer.id, 'source', ctx.layer.source as AudioInputSource);
            }
            const peak = ctx.audioEngine.getPeakVolume(ctx.layer.id);
            ctx.signalValues['source.peak_out'] = peak;
            ctx.signalValues['source.audio_out'] = peak;
            ctx.signalValues['source.ch1_out'] = ctx.audioEngine.getPeakVolume(`${ctx.layer.id}__ch1_out`);
            ctx.signalValues['source.ch2_out'] = ctx.audioEngine.getPeakVolume(`${ctx.layer.id}__ch2_out`);
          }
          if (srcType === 'VideoFile' || srcType === 'VideoURL' || srcType === 'AudioFile') {
            this.handlePlayerTriggers(ctx, 'source', ctx.layer.source as any, true);
          }
          if (srcType === 'TextCue') {
            this.handleTextCueTriggers(ctx, 'source', ctx.layer.source as TextCueSource, true, dt);
          }
          if (srcType === 'ImageCue') {
            this.handleImageCueTriggers(ctx, 'source', ctx.layer.source as ImageCueSource, true, dt);
          }
        });
      } else {
        const mod = layer.modulators?.[nodeId];
        if (mod) {
          if (mod.type === 'LFO') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const lfo = ctx.layer.modulators?.[nodeId] as any;
              if (!lfo) return;

              const lastPhase = this.lfoPhases[nodeId] ?? 0;
              let phase = (lastPhase + (lfo.frequency ?? 0) * dt) % 1.0;
              this.lfoPhases[nodeId] = phase;

              // Sync Out (Rising edge on phase reset)
              ctx.signalValues[`${nodeId}.sync_out`] = (phase < lastPhase) ? 1.0 : 0.0;

              let val = 0;
              switch (lfo.waveform) {
                case 'sine': val = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; break;
                case 'square': val = phase < 0.5 ? 1 : 0; break;
                case 'triangle': val = phase < 0.5 ? phase * 2 : 2 - phase * 2; break;
                case 'saw': val = phase; break;
              }
              if (lfo.bipolar) {
                val = val * 2.0 - 1.0;
              }
              const amplitude = (lfo.amplitude ?? 1.0) + (ctx.signalValues[`${nodeId}.amplitude_cv`] ?? 0);
              const offset = (lfo.offset ?? 0) + (ctx.signalValues[`${nodeId}.offset_cv`] ?? 0);
              const finalVal = val * amplitude + offset;
              ctx.signalValues[`${nodeId}.modulation_out`] = finalVal;
            });
          } else if (mod.type === 'Noise') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const noise = ctx.layer.modulators?.[nodeId] as any;
              if (!noise) return;

              const stateKey = `${ctx.layer.id}.${nodeId}`;
              let nState = this.noiseStates.get(stateKey);
              if (!nState) {
                nState = { value: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0, brown: 0, seed: Math.random(), t: 0, lastManualTime: 0 };
                this.noiseStates.set(stateKey, nState);
              }

              const trigger = ctx.signalValues[`${nodeId}.trigger_in`] ?? 0;
              const lastTrig = this.lastTriggerVals.get(stateKey) ?? 0;
              const isRising = trigger > 0.5 && lastTrig <= 0.5;
              this.lastTriggerVals.set(stateKey, trigger);

              const manualTime = noise.manualTriggerTime ?? 0;
              const isManualRising = manualTime > nState.lastManualTime;
              nState.lastManualTime = manualTime;

              const freq = (noise.frequency ?? 1.0) + (ctx.signalValues[`${nodeId}.frequency_cv`] ?? 0);
              const shouldUpdate = !noise.frozen || isRising || isManualRising;

              if (shouldUpdate) {
                switch (noise.noiseType) {
                  case 'white':
                    nState.value = Math.random() * 2 - 1;
                    break;
                  case 'brownian':
                    nState.brown += (Math.random() * 2 - 1) * freq * dt * 5.0;
                    nState.brown = Math.max(-1, Math.min(1, nState.brown));
                    nState.value = nState.brown;
                    break;
                  case 'perlin':
                    nState.t += dt * freq;
                    nState.value = Math.sin(nState.t) * Math.sin(nState.t * 1.5) * Math.sin(nState.t * 2.1);
                    break;
                  case 'pink':
                  default:
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
                    break;
                }
              }

              const amplitude = (noise.amplitude ?? 1.0) + (ctx.signalValues[`${nodeId}.amplitude_cv`] ?? 0);
              const offset = (noise.offset ?? 0) + (ctx.signalValues[`${nodeId}.offset_cv`] ?? 0);

              let v = nState.value;
              if (!noise.bipolar) v = v * 0.5 + 0.5;

              ctx.signalValues[`${nodeId}.modulation_out`] = v * amplitude + offset;
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
          } else if (mod.type === 'MidiInput') {
            pipeline.push((ctx: DispatchContext) => {
              const midi = ctx.layer.modulators?.[nodeId] as any;
              if (!midi) return;
              const mgr = MidiManager.getInstance();
              const channel = midi.channel ?? 'all';
              const ccNum = midi.ccNumber ?? 7;
              const div = midi.clockDivision ?? '1/4';

              const noteData = mgr.getNoteData(channel);
              ctx.signalValues[`${nodeId}.note_out`] = noteData.pitch;
              ctx.signalValues[`${nodeId}.gate_out`] = noteData.gate ? 1.0 : 0.0;
              ctx.signalValues[`${nodeId}.velocity_out`] = noteData.velocity;
              ctx.signalValues[`${nodeId}.cc_out`] = mgr.getCCValue(channel, ccNum);
              ctx.signalValues[`${nodeId}.clock_out`] = mgr.getClockPulse(div) ? 1.0 : 0.0;
            });
          }
        }

        const effect = layer.effects.find(e => e.id === nodeId);
        if (effect) {
          if (effect.type === 'AudioInput' || effect.type === 'AudioFile' || effect.type === 'SystemAudio') {
            pipeline.push((ctx: DispatchContext) => {
              const busId = nodeId; // For these effects, the node ID is the bus ID
              if (effect.type === 'AudioInput') {
                const ef = ctx.layer.effects.find(e => e.id === nodeId) as AudioInputSource | undefined;
                if (ef) {
                  this.syncAudioInputGate(ctx, busId, nodeId, ef);
                }
              }
              const bus = ctx.audioEngine.getBusData(busId);
              if (bus) {
                ctx.signalValues[`${nodeId}.peak_out`] = bus.peak;
                ctx.signalValues[`${nodeId}.audio_out`] = bus.peak;
                ctx.signalValues[`${nodeId}.ch1_out`] = ctx.audioEngine.getPeakVolume(`${nodeId}__ch1_out`);
                ctx.signalValues[`${nodeId}.ch2_out`] = ctx.audioEngine.getPeakVolume(`${nodeId}__ch2_out`);
              }
              if (effect.type === 'AudioFile') {
                const ef = ctx.layer.effects.find(e => e.id === nodeId);
                if (ef) this.handlePlayerTriggers(ctx, nodeId, ef as any, false);
              }
            });
          } else if (effect.type === 'VideoFile' || effect.type === 'VideoURL') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId);
              if (!ef) return;
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
              const bus = ctx.audioEngine.getBusData(nodeId);
              if (bus) {
                ctx.signalValues[`${nodeId}.audio_out`] = 1.0;
              }
              this.handlePlayerTriggers(ctx, nodeId, ef as any, false);
            });
          } else if (effect.type === 'TextCue') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as TextCueSource;
              if (!ef) return;
              this.handleTextCueTriggers(ctx, nodeId, ef, false, dt);
            });
          } else if (effect.type === 'TextMaker') {
            pipeline.push((ctx: DispatchContext) => {
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
              ctx.signalValues[`${nodeId}.matte_out`] = 1.0;
              ctx.signalValues[`${nodeId}.text_out`] = 1.0;
            });
          } else if (effect.type === 'BlackoutPoetry') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as BlackoutPoetryEffect;
              if (!ef) return;
              this.handleBlackoutPoetry(ctx, nodeId, ef, dt);
            });
          } else if (effect.type === 'GlyphMap') {
            pipeline.push((ctx: DispatchContext) => {
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
              ctx.signalValues[`${nodeId}.matte_out`] = 1.0;
            });
          } else if (effect.type === 'LumaBands' || effect.type === 'ChromaBands' || effect.type === 'Outline' || effect.type === 'BadAnalog' || effect.type === 'DataMosh') {
            pipeline.push((ctx: DispatchContext) => {
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
              ctx.signalValues[`${nodeId}.matte_out`] = 1.0;
            });
          } else if (effect.type === 'FeedbackPro') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as FeedbackProEffect;
              if (ef) {
                const trig = ctx.signalValues[`${nodeId}.freeze_gate`] ?? 0;
                const lastTrig = this.lastTriggerVals.get(`${ctx.layer.id}.${nodeId}.freeze_gate`) ?? 0;
                if (trig > 0.5 && lastTrig <= 0.5) {
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { frozen: !ef.frozen } as any);
                }
                this.lastTriggerVals.set(`${ctx.layer.id}.${nodeId}.freeze_gate`, trig);

                const clearTrig = ctx.signalValues[`${nodeId}.clear_trig`] ?? 0;
                const lastClear = this.lastTriggerVals.get(`${ctx.layer.id}.${nodeId}.clear_trig`) ?? 0;
                if (clearTrig > 0.5 && lastClear <= 0.5) {
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { clearTrigger: Date.now() } as any);
                }
                this.lastTriggerVals.set(`${ctx.layer.id}.${nodeId}.clear_trig`, clearTrig);
              }
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
              ctx.signalValues[`${nodeId}.matte_out`] = 1.0;
            });
          } else if (effect.type === 'ImageCue') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as ImageCueSource;
              if (!ef) return;
              this.handleImageCueTriggers(ctx, nodeId, ef, false, dt);
            });
          } else if (effect.type === 'AudioSource') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as any;
              if (!ef) return;
              const bus = ctx.audioEngine.getBusData(ef.busId || 'master');
              if (bus) {
                ctx.signalValues[`${nodeId}.peak_out`] = bus.peak;
                ctx.signalValues[`${nodeId}.audio_out`] = 1.0;
                ctx.signalValues[`${nodeId}.beat_out`] = bus.onset ? 1.0 : 0.0;
                ctx.signalValues[`${nodeId}.bass_out`] = bus.bands.bass;
                ctx.signalValues[`${nodeId}.mid_out`] = bus.bands.mid;
                ctx.signalValues[`${nodeId}.high_out`] = bus.bands.high;
              }
            });
          } else if (effect.type === 'SpeechEnvelopeTracker') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as SpeechEnvelopeTrackerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = this.resolveAudioBusId(ctx.layer.id, incomingEdge, ctx.layer.effects);

              const attackMs = this.getMidiOverride(ctx.layer.id, nodeId, 'attackMs') ?? ef.attackMs ?? 10;
              const releaseMs = this.getMidiOverride(ctx.layer.id, nodeId, 'releaseMs') ?? ef.releaseMs ?? 150;
              const sensitivityDb = this.getMidiOverride(ctx.layer.id, nodeId, 'sensitivityDb') ?? ef.sensitivityDb ?? -40;

              const features = ctx.audioEngine.getSpeechFeatures(
                busId,
                attackMs,
                releaseMs,
                `${ctx.layer.id}.${nodeId}`,
                dt,
                {
                  sensitivityDb,
                  prominenceDb: ef.prominenceDb ?? 6,
                  microGapMs: ef.microGapMs ?? 180
                }
              );
              if (features) {
                ctx.signalValues[`${nodeId}.envelope_out`] = features.envelope;
                ctx.signalValues[`${nodeId}.cadence_out`] = Math.min(1.0, features.cadence);

                const threshold = Math.pow(10, sensitivityDb / 20);
                const isSpeech = features.envelope > threshold;

                const stateKey = `${ctx.layer.id}.${nodeId}`;
                const wasSpeech = this.speechStateMap.get(stateKey) ?? false;

                const speechContinuous = !!ef.speechContinuous;
                const silenceContinuous = !!ef.silenceContinuous;

                if (speechContinuous) {
                  ctx.signalValues[`${nodeId}.speech_trig`] = isSpeech ? 1.0 : 0.0;
                } else {
                  ctx.signalValues[`${nodeId}.speech_trig`] = (isSpeech && !wasSpeech) ? 1.0 : 0.0;
                }

                if (silenceContinuous) {
                  ctx.signalValues[`${nodeId}.silence_trig`] = !isSpeech ? 1.0 : 0.0;
                } else {
                  ctx.signalValues[`${nodeId}.silence_trig`] = (!isSpeech && wasSpeech) ? 1.0 : 0.0;
                }

                this.speechStateMap.set(stateKey, isSpeech);
              }
            });
          } else if (effect.type === 'PoetrySequencer') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as PoetrySequencerEffect;
              if (!ef) return;
              this.handlePoetrySequencer(ctx, nodeId, ef, dt);
            });
          } else if (effect.type === 'VocalPitchTracker') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as VocalPitchTrackerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = this.resolveAudioBusId(ctx.layer.id, incomingEdge, ctx.layer.effects);

              const minPitchHz = this.getMidiOverride(ctx.layer.id, nodeId, 'minPitchHz') ?? ef.minPitchHz ?? 80;
              const maxPitchHz = this.getMidiOverride(ctx.layer.id, nodeId, 'maxPitchHz') ?? ef.maxPitchHz ?? 800;
              const tolerance = this.getMidiOverride(ctx.layer.id, nodeId, 'tolerance') ?? ef.tolerance ?? 0.35;
              const holdOnSilence = ef.holdOnSilence ?? true;
              const holdTimeoutMs = Math.max(0, this.getMidiOverride(ctx.layer.id, nodeId, 'holdTimeoutMs') ?? ef.holdTimeoutMs ?? 600);

              const features = ctx.audioEngine.getPitchFeatures(
                busId,
                minPitchHz,
                maxPitchHz,
                ef.pitchRangeMode || 'voice',
                `${ctx.layer.id}.${nodeId}`
              );
              if (features) {
                const stateKey = `${ctx.layer.id}.${nodeId}`;
                const stepped = this.stepVocalPitchState(
                  stateKey,
                  features.hz,
                  features.midi,
                  features.confidence,
                  tolerance,
                  holdOnSilence,
                  holdTimeoutMs,
                  dt
                );
                ctx.signalValues[`${nodeId}.pitch_hz`] = stepped.hz;
                ctx.signalValues[`${nodeId}.pitch_midi`] = stepped.midi;
                ctx.signalValues[`${nodeId}.stability`] = features.confidence;
                ctx.signalValues[`${nodeId}.note_change_trig`] = stepped.isNoteChange ? 1.0 : 0.0;
              }
            });
          } else if (effect.type === 'VowelFormantTracker') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as VowelFormantTrackerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = this.resolveAudioBusId(ctx.layer.id, incomingEdge, ctx.layer.effects);

              const stateKey = `${ctx.layer.id}.${nodeId}`;
              const features = ctx.audioEngine.getFormantFeatures(busId, ef.voiceProfile, stateKey) as
                | { f1: number; f2: number; x: number; y: number; voiced?: boolean }
                | null;
              if (features) {
                const sm = this.getMidiOverride(ctx.layer.id, nodeId, 'smoothing') ?? ef.smoothing ?? 0.8;
                const holdOnSilence = ef.holdOnSilence ?? true;
                const holdTimeoutMs = Math.max(0, this.getMidiOverride(ctx.layer.id, nodeId, 'holdTimeoutMs') ?? ef.holdTimeoutMs ?? 600);
                const bus = ctx.audioEngine.getBusData(busId);
                const stepped = this.stepVowelFormantState(stateKey, features, bus?.rms, sm, holdOnSilence, holdTimeoutMs, dt);

                ctx.signalValues[`${nodeId}.formant_f1`] = stepped.f1;
                ctx.signalValues[`${nodeId}.formant_f2`] = stepped.f2;
                ctx.signalValues[`${nodeId}.vowel_x`] = stepped.x;
                ctx.signalValues[`${nodeId}.vowel_y`] = stepped.y;
                ctx.signalValues[`${nodeId}.vowel_change_trig`] = stepped.isVowelChange ? 1.0 : 0.0;
              }
            });
          } else if (effect.type === 'SpokenWordVisualizer') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as SpokenWordVisualizerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = this.resolveAudioBusId(ctx.layer.id, incomingEdge, ctx.layer.effects);
              const stateKey = `${ctx.layer.id}.${nodeId}`;

              const speech = ctx.audioEngine.getSpeechFeatures(busId, 10, 150, stateKey, dt);
              const pitch = ctx.audioEngine.getPitchFeatures(busId, 80, 800, 'voice', stateKey);
              const formant = ctx.audioEngine.getFormantFeatures(busId, 'universal', stateKey) as
                | { f1: number; f2: number; x: number; y: number; voiced?: boolean }
                | null;

              if (speech && pitch && formant) {
                ctx.signalValues[`${nodeId}.envelope_out`] = speech.envelope;
                ctx.signalValues[`${nodeId}.cadence_out`] = Math.min(1.0, speech.cadence);
                ctx.signalValues[`${nodeId}.cadence`] = Math.min(1.0, speech.cadence);
                ctx.signalValues[`${nodeId}.timbre_brightness`] = speech.timbral.centroid;
                ctx.signalValues[`${nodeId}.timbre_flatness`] = speech.timbral.flatness;
                ctx.signalValues[`${nodeId}.sibilance`] = speech.timbral.sibilance;

                const threshold = 0.08;
                const isSpeech = speech.envelope > threshold;
                const wasSpeech = this.speechStateMap.get(`${stateKey}.speech`) ?? false;

                const isOnset = speech.envelope > 0.16 && !wasSpeech;
                ctx.signalValues[`${nodeId}.onset_pulse`] = isOnset ? 1.0 : 0.0;
                ctx.signalValues[`${nodeId}.speech_trig`] = (isSpeech && !wasSpeech) ? 1.0 : 0.0;
                ctx.signalValues[`${nodeId}.silence_trig`] = (!isSpeech && wasSpeech) ? 1.0 : 0.0;
                this.speechStateMap.set(`${stateKey}.speech`, isSpeech);

                const pStepped = this.stepVocalPitchState(stateKey, pitch.hz, pitch.midi, pitch.confidence, 0.35, true, 600, dt);
                ctx.signalValues[`${nodeId}.pitch_hz`] = pStepped.hz;
                ctx.signalValues[`${nodeId}.pitch_midi`] = pStepped.midi;
                ctx.signalValues[`${nodeId}.stability`] = pitch.confidence;
                ctx.signalValues[`${nodeId}.note_change_trig`] = pStepped.isNoteChange ? 1.0 : 0.0;

                const bus = ctx.audioEngine.getBusData(busId);
                const vStepped = this.stepVowelFormantState(stateKey, formant, bus?.rms, 0.7, true, 600, dt);
                ctx.signalValues[`${nodeId}.formant_f1`] = vStepped.f1;
                ctx.signalValues[`${nodeId}.formant_f2`] = vStepped.f2;
                ctx.signalValues[`${nodeId}.vowel_x`] = vStepped.x;
                ctx.signalValues[`${nodeId}.vowel_y`] = vStepped.y;
                ctx.signalValues[`${nodeId}.vowel_change_trig`] = vStepped.isVowelChange ? 1.0 : 0.0;

                ctx.signalValues[`${nodeId}.video_out`] = 1.0;
              }
            });
          } else if (effect.type === 'Oscilloscope') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as OscilloscopeEffect;
              if (!ef) return;

              const trigger = ctx.signalValues[`${nodeId}.freeze`] ?? 0;
              const lastTrig = this.lastTriggerVals.get(`${ctx.layer.id}.${nodeId}.freeze`) ?? 0;

              // Toggle on rising edge
              if (trigger > 0.5 && lastTrig <= 0.5) {
                // We use the store to update so the UI stays in sync
                useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { isFrozen: !ef.isFrozen } as any);
              }
              this.lastTriggerVals.set(`${ctx.layer.id}.${nodeId}.freeze`, trigger);

              // Signal that we are active for the renderer
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
            });
          } else if (effect.type === 'SpectralSplitter') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as SpectralSplitterEffect;
              if (!ef) return;

              // Smart Bus Discovery: Check input connection for audio source
              let busId = ef.busId || 'master';
              const edges = ctx.layer.graph?.edges || [];
              const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              if (inputEdge) {
                const fromNodeId = inputEdge.fromNodeId;
                const fromEffect = ctx.layer.effects.find(e => e.id === fromNodeId);
                if (fromEffect?.type === 'AudioSource') {
                  busId = (fromEffect as any).busId || 'master';
                } else {
                  busId = this.resolveAudioBusId(ctx.layer.id, inputEdge);
                }
              }

              const bus = ctx.audioEngine.getBusData(busId);
              if (!bus) return;

              const smoothing = ef.smoothing ?? 0.8;
              const sensitivity = ef.sensitivity ?? 1.0;
              const gain = ef.gain ?? 2.0;
              const stateKey = `${ctx.layer.id}.${nodeId}`;

              let state = this.spectralStates.get(stateKey) || { low: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };

              const updateBand = (prev: number, instant: number) => {
                const val = instant * sensitivity * gain;
                return prev * smoothing + val * (1.0 - smoothing);
              };

              state.low = updateBand(state.low, bus.bands.low);
              state.lowMid = updateBand(state.lowMid, bus.bands.lowMid);
              state.mid = updateBand(state.mid, bus.bands.midGranular);
              state.highMid = updateBand(state.highMid, bus.bands.highMid);
              state.high = updateBand(state.high, bus.bands.highGranular);

              this.spectralStates.set(stateKey, state);

              ctx.signalValues[`${nodeId}.low_out`] = state.low;
              ctx.signalValues[`${nodeId}.low_mid_out`] = state.lowMid;
              ctx.signalValues[`${nodeId}.mid_out`] = state.mid;
              ctx.signalValues[`${nodeId}.high_mid_out`] = state.highMid;
              ctx.signalValues[`${nodeId}.high_out`] = state.high;
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
            });
          } else if (effect.type === 'WaterfallSpectrogram' || effect.type === 'GrassField' || effect.type === 'Arabesque') {
            pipeline.push((ctx: DispatchContext) => {
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
            });
          } else if (effect.type === 'AudioTransformer') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as AudioTransformerEffect;
              if (!ef) return;

              // 1. Connection Management
              const edges = ctx.layer.graph?.edges || [];
              const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              if (inputEdge) {
                ctx.audioEngine.connectTransformer(nodeId, this.resolveAudioBusId(ctx.layer.id, inputEdge));
              } else {
                ctx.audioEngine.connectTransformer(nodeId, 'master'); // Default/idle
              }

              // 2. Bypass Trigger Logic
              const trigger = ctx.signalValues[`${nodeId}.bypass_cv`] ?? 0;
              const lastTrig = this.lastTriggerVals.get(`${ctx.layer.id}.${nodeId}.bypass_cv`) ?? 0;

              if (ef.bypassLatching) {
                // Toggle on rising edge
                if (trigger > 0.5 && lastTrig <= 0.5) {
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { bypass: !ef.bypass } as any);
                }
              } else {
                // Momentary - bypass while trigger is high
                if ((trigger > 0.5) !== ef.bypass) {
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { bypass: trigger > 0.5 } as any);
                }
              }
              this.lastTriggerVals.set(`${ctx.layer.id}.${nodeId}.bypass_cv`, trigger);

              // 3. Parameter Updates
              const filterFreq = (ef.filterFreq || 1000) * Math.pow(2, (ctx.signalValues[`${nodeId}.filter_freq_cv`] || 0) * 2);
              const filterRes = Math.max(0, Math.min(1, (ef.filterResonance || 0) + (ctx.signalValues[`${nodeId}.filter_res_cv`] || 0)));
              const sustain = Math.max(0, Math.min(1, (ef.compSustain || 0) + (ctx.signalValues[`${nodeId}.comp_sustain_cv`] || 0)));

              // Mapping Sustain to Thresh/Ratio (Guitar pedal style)
              const compThresh = -sustain * 60;
              const compRatio = 1 + sustain * 19;

              ctx.audioEngine.updateTransformerNode(nodeId, {
                filterType: ef.filterType || 'lowpass',
                filterFreq: Math.max(20, Math.min(20000, filterFreq)),
                filterQ: 1.0 + filterRes * 12,
                compThreshold: compThresh,
                compRatio: compRatio,
                outputGain: ef.outputGain ?? 1.0,
                bypass: ef.bypass
              });

              // 3. Envelope Follower (CPU-side smoothing of the Peak)
              const bus = ctx.audioEngine.getTransformerBus(nodeId);
              if (bus) {
                const attack = Math.max(0.001, (ef.envelopeAttack || 0.01) * Math.pow(10, (ctx.signalValues[`${nodeId}.env_attack_cv`] || 0) * 2));
                const release = Math.max(0.001, (ef.envelopeRelease || 0.1) * Math.pow(10, (ctx.signalValues[`${nodeId}.env_release_cv`] || 0) * 2));
                const target = bus.peak;

                let current = this.transformerEnvelopes.get(nodeId) || 0;
                const factor = target > current ? dt / attack : dt / release;
                current += (target - current) * Math.min(1.0, factor);

                this.transformerEnvelopes.set(nodeId, current);
                ctx.signalValues[`${nodeId}.env_out`] = current;
                ctx.signalValues[`${nodeId}.audio_out`] = 1.0; // Pass-thru signal
              }
            });
          } else if (effect.type === 'AudioModulator') {
            pipeline.push((ctx: DispatchContext, _dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as AudioModulatorEffect;
              if (!ef) return;

              // 1. Connection Management
              const edges = ctx.layer.graph?.edges || [];
              const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              if (inputEdge) {
                ctx.audioEngine.connectModulator(nodeId, this.resolveAudioBusId(ctx.layer.id, inputEdge));
              } else {
                ctx.audioEngine.connectModulator(nodeId, 'master');
              }

              // 2. Parameter Updates
              const ringFreq = (ef.ringFreq || 440) * Math.pow(2, (ctx.signalValues[`${nodeId}.ring_freq_cv`] || 0) * 2);
              const ringMix = Math.max(0, Math.min(1, (ef.ringMix || 0) + (ctx.signalValues[`${nodeId}.ring_mix_cv`] || 0)));
              const octaveOffset = ctx.signalValues[`${nodeId}.octave_cv`] || 0;

              ctx.audioEngine.updateModulatorNode(nodeId, {
                ringFreq: Math.max(0.1, Math.min(20000, ringFreq)),
                ringMix: ringMix,
                octaveSub2: Math.max(0, Math.min(1, ef.octaveSub2 + octaveOffset)),
                octaveSub1: Math.max(0, Math.min(1, ef.octaveSub1 + octaveOffset)),
                octaveClean: ef.octaveClean,
                octaveHigh1: Math.max(0, Math.min(1, ef.octaveHigh1 + octaveOffset)),
                octaveHigh2: Math.max(0, Math.min(1, ef.octaveHigh2 + octaveOffset)),
                bypass: ef.bypass
              });

              ctx.signalValues[`${nodeId}.audio_out`] = 1.0;
            });
          } else if (effect.type === 'AudioGate') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as AudioGateEffect;
              if (!ef) return;

              // 1. Connection Management
              const edges = ctx.layer.graph?.edges || [];
              const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              if (inputEdge) {
                ctx.audioEngine.connectGate(nodeId, this.resolveAudioBusId(ctx.layer.id, inputEdge));
              } else {
                ctx.audioEngine.connectGate(nodeId, 'master');
              }

              // 2. Bypass Trigger Logic
              const trigger = ctx.signalValues[`${nodeId}.bypass_cv`] ?? 0;
              const lastTrig = this.lastTriggerVals.get(`${ctx.layer.id}.${nodeId}.bypass_cv`) ?? 0;

              if (ef.bypassLatching) {
                if (trigger > 0.5 && lastTrig <= 0.5) {
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { bypass: !ef.bypass } as any);
                }
              } else {
                if ((trigger > 0.5) !== ef.bypass) {
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { bypass: trigger > 0.5 } as any);
                }
              }
              this.lastTriggerVals.set(`${ctx.layer.id}.${nodeId}.bypass_cv`, trigger);

              // 3. Update AudioEngine Node Params
              ctx.audioEngine.updateGateNode(nodeId, {
                thresholdDb: ef.thresholdDb,
                bypass: ef.bypass,
                releaseMs: ef.releaseMs ?? 150
              });

              // 4. Update output CV signals
              const bus = ctx.audioEngine.getGateBus(nodeId);
              const isOpen = ctx.audioEngine.isGateOpen(nodeId);
              ctx.signalValues[`${nodeId}.audio_out`] = 1.0;
              ctx.signalValues[`${nodeId}.gate_active`] = isOpen ? 1.0 : 0.0;
              if (bus) {
                const rmsDb = bus.rms > 0 ? 20 * Math.log10(bus.rms) : -100;
                ctx.signalValues[`${nodeId}.input_db`] = Math.max(-100, Math.min(0, rmsDb));
                ctx.signalValues[`${nodeId}.input_rms`] = bus.rms;
              } else {
                ctx.signalValues[`${nodeId}.input_db`] = -100;
                ctx.signalValues[`${nodeId}.input_rms`] = 0.0;
              }
            });
          } else if (effect.type === 'AudioToCV') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as AudioToCVEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');

              const resolveAudioBusId = (fromNodeId: string, visited = new Set<string>()): string => {
                if (visited.has(fromNodeId)) return 'master';
                visited.add(fromNodeId);
                if (fromNodeId === 'source') return ctx.layer.id;
                const fromEffect = ctx.layer.effects.find(e => e.id === fromNodeId);
                if (fromEffect?.type === 'AudioToCV') {
                  const upstreamEdge = edges.find(e => e.toNodeId === fromNodeId && e.toPort === 'audio_in');
                  return upstreamEdge ? resolveAudioBusId(upstreamEdge.fromNodeId, visited) : 'master';
                }
                return fromNodeId;
              };

              const busId = incomingEdge ? resolveAudioBusId(incomingEdge.fromNodeId) : 'master';
              const bus = ctx.audioEngine.getBusData(busId);
              let rawLevel = 0;

              const gainMod = ctx.signalValues[`${nodeId}.gain_cv`] ?? 0;
              const effectiveGain = Math.max(0, (ef.gain ?? 1.0) * (1.0 + gainMod));

              if (bus) {
                if (ef.mode === 'peak') {
                  rawLevel = bus.peak * effectiveGain;
                } else if (ef.mode === 'rms') {
                  rawLevel = bus.rms * effectiveGain;
                } else if (ef.mode === 'db') {
                  // Standard dB conversion: -60dB -> 0.0, 0dB -> 1.0
                  const rms = Math.max(0.0001, bus.rms * effectiveGain);
                  const db = 20 * Math.log10(rms);
                  rawLevel = Math.max(0, Math.min(1.0, (db + 60) / 60));
                } else { // 'envelope'
                  rawLevel = ctx.audioEngine.getAudioEnvelope(busId, ef.attack || 10, ef.release || 100) * effectiveGain;
                }
              }

              // Smoothing: envelope mode handles smoothing via its own attack/release coefficients
              const smoothing = ef.mode === 'envelope' ? 0.0 : Math.max(0, Math.min(0.99, ef.smoothing ?? 0.1));
              const stateKey = `${ctx.layer.id}.${nodeId}`;
              const prev = this.audioToCvSmoothed.get(stateKey) ?? rawLevel;
              const smoothed = prev * smoothing + rawLevel * (1.0 - smoothing);
              this.audioToCvSmoothed.set(stateKey, smoothed);

              let finalVal = Math.max(0, Math.min(1.0, smoothed));
              if (ef.bipolar) {
                finalVal = (finalVal * 2.0) - 1.0;
              }

              // Gate evaluation
              const threshMod = ctx.signalValues[`${nodeId}.thresh_cv`] ?? 0;
              const effectiveThresh = Math.max(0, Math.min(1.0, (ef.gateThreshold ?? 0.4) + threshMod));
              const isGateHigh = smoothed >= effectiveThresh;

              ctx.signalValues[`${nodeId}.cv_out`] = finalVal;
              ctx.signalValues[`${nodeId}.gate_out`] = isGateHigh ? 1.0 : 0.0;
              ctx.signalValues[`${nodeId}.audio_thru`] = 1.0;
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
          } else if (effect.type === 'AlphaAdjust') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as AlphaAdjustEffect;
              if (!ef) return;

              const trigger = ctx.signalValues[`${nodeId}.bypass_trig`] ?? 0;
              const lastValKey = `${ctx.layer.id}.${nodeId}.bypass_trig`;
              const lastVal = this.lastTriggerVals.get(lastValKey) ?? 0;
              const isActive = trigger > 0.5;
              const wasActive = lastVal > 0.5;

              const gateId = `${ctx.layer.id}.${nodeId}`;
              let currentBypass = this.gateLatchStates.get(gateId) ?? false;

              if (ef.bypassMode === 'latch') {
                // Sync with manual UI bypass (from store)
                if (ef.bypass !== currentBypass) {
                  currentBypass = ef.bypass;
                  this.gateLatchStates.set(gateId, currentBypass);
                }

                if (isActive && !wasActive) {
                  currentBypass = !currentBypass;
                  this.gateLatchStates.set(gateId, currentBypass);
                  useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { bypass: currentBypass } as any);
                }
              } else {
                // Momentary: combine external trigger and manual store state
                currentBypass = isActive || ef.bypass;
              }

              this.lastTriggerVals.set(lastValKey, trigger);
              this.setGateState(ctx.layer.id, nodeId, currentBypass);
              ctx.signalValues[`${nodeId}.bypass_active`] = currentBypass ? 1.0 : 0.0;
              ctx.signalValues[`${nodeId}.video_out`] = 1.0;
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
                case 'and': isTrue = a && b; break;
                case 'or': isTrue = a || b; break;
                case 'xor': isTrue = a !== b; break;
                case 'nand': isTrue = !(a && b); break;
                case 'nor': isTrue = !(a || b); break;
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
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as SignalMathEffect;
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
          } else if (effect.type === 'SampleAndHold') {
            pipeline.push((ctx: DispatchContext) => {
              const sh = ctx.layer.effects.find(e => e.id === nodeId) as SampleAndHoldEffect;
              if (!sh) return;
              const trigger = ctx.signalValues[`${nodeId}.trigger`] ?? 0;
              const stateKey = `${ctx.layer.id}.${nodeId}`;

              const lastManualTime = this.lastTriggerVals.get(`${stateKey}.manual`) ?? 0;
              const currentManualTime = sh.manualTriggerTime ?? 0;
              const isManualRising = currentManualTime > lastManualTime;
              this.lastTriggerVals.set(`${stateKey}.manual`, currentManualTime);

              const lastTrig = this.lastTriggerVals.get(stateKey) ?? 0;
              const isRising = (trigger > 0.5 && lastTrig <= 0.5) || isManualRising;
              this.lastTriggerVals.set(stateKey, trigger);

              // Get current live state (sync with store if first time)
              let live = this.shLiveStates.get(stateKey);
              if (live === undefined) {
                live = sh.isLive;
                this.shLiveStates.set(stateKey, live);
              }
              // If store value changed manually, override
              if (sh.isLive !== live) {
                live = sh.isLive;
                this.shLiveStates.set(stateKey, live);
              }

              const toggleTrig = ctx.signalValues[`${nodeId}.live_toggle`] ?? 0;
              const lastToggle = this.lastTriggerVals.get(`${stateKey}.live_toggle`) ?? 0;
              const isToggleRising = toggleTrig > 0.5 && lastToggle <= 0.5;
              this.lastTriggerVals.set(`${stateKey}.live_toggle`, toggleTrig);

              if (isToggleRising) {
                live = !live;
                this.shLiveStates.set(stateKey, live);
                // If flipping to Hold, also trigger a capture to be consistent with toggle behavior
                if (!live) {
                  const val = ctx.signalValues[`${nodeId}.sig_in`] ?? 0;
                  this.shStates.set(stateKey, val);
                }
              }

              if (isRising) {
                if (sh.triggerMode === 'freeze_toggle') {
                  live = !live;
                  this.shLiveStates.set(stateKey, live);
                  // Capture if flipping to Hold
                  if (!live) {
                    const val = ctx.signalValues[`${nodeId}.sig_in`] ?? 0;
                    this.shStates.set(stateKey, val);
                  }
                } else if (sh.triggerMode === 'sample_show') {
                  live = false;
                  this.shLiveStates.set(stateKey, live);
                  const val = ctx.signalValues[`${nodeId}.sig_in`] ?? 0;
                  this.shStates.set(stateKey, val);
                } else { // sample_only
                  const val = ctx.signalValues[`${nodeId}.sig_in`] ?? 0;
                  this.shStates.set(stateKey, val);
                }
              }

              if (live) {
                ctx.signalValues[`${nodeId}.sig_out`] = ctx.signalValues[`${nodeId}.sig_in`] ?? 0;
              } else {
                ctx.signalValues[`${nodeId}.sig_out`] = this.shStates.get(stateKey) ?? 0;
              }
            });
          } else if (effect.type === 'Path') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = effect as any;
              const time = performance.now() / 1000;
              ctx.signalValues[`${effect.id}.modulation_out`] = Math.sin(time * (ef.frequency || 0)) * (ef.amplitude ?? 1.0) + (ef.offset ?? 0);
            });
          } else if (effect.type === 'StepSequencer') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as StepSequencerEffect;
              if (!ef) return;

              const stateKey = `${ctx.layer.id}.${nodeId}`;
              let state = this.sequencerStates.get(stateKey);
              if (!state) {
                state = {
                  phase: 0,
                  currentStep: 0,
                  lastGlobalValue: 0,
                  lastStepValues: new Array(16).fill(0),
                  lastResetManualTime: 0,
                  isPaused: false,
                  directionState: 'up',
                  lastManualPlayState: ef.playState
                };
                this.sequencerStates.set(stateKey, state);
              }

              // 1. Triggers & Pause
              const resetTrig = ctx.signalValues[`${nodeId}.reset_in`] ?? 0;
              const lastResetTrig = this.lastTriggerVals.get(`${stateKey}.reset`) ?? 0;
              const manualResetTime = ef.manualResetTrigger ?? 0;
              const isReset = (resetTrig > 0.5 && lastResetTrig <= 0.5) || (manualResetTime > state.lastResetManualTime);
              this.lastTriggerVals.set(`${stateKey}.reset`, resetTrig);
              state.lastResetManualTime = manualResetTime;

              const pauseTrig = ctx.signalValues[`${nodeId}.pause_in`] ?? 0;
              const lastPauseTrig = this.lastTriggerVals.get(`${stateKey}.pause`) ?? 0;
              if (pauseTrig > 0.5 && lastPauseTrig <= 0.5) {
                state.isPaused = !state.isPaused;
              }
              this.lastTriggerVals.set(`${stateKey}.pause`, pauseTrig);

              const manualPlayState = ef.playState;
              if (manualPlayState !== state.lastManualPlayState) {
                state.isPaused = manualPlayState === 'pause';
                state.lastManualPlayState = manualPlayState;
              }
              const paused = state.isPaused;

              if (isReset) {
                state.currentStep = 0;
                state.phase = 0;
                state.directionState = 'up';
              }

              // 2. Clocking
              const clockTrig = ctx.signalValues[`${nodeId}.clock_in`] ?? 0;
              const lastClockTrig = this.lastTriggerVals.get(`${stateKey}.clock`) ?? 0;
              const isExternalClock = clockTrig > 0.5 && lastClockTrig <= 0.5;
              this.lastTriggerVals.set(`${stateKey}.clock`, clockTrig);

              let advance = false;
              if (!paused) {
                if (isExternalClock) {
                  advance = true;
                } else {
                  let rateHz = ef.rate ?? 1;
                  const rateCv = ctx.signalValues[`${nodeId}.rate_cv`] ?? 0;
                  rateHz += rateCv * 5; // CV adds up to 5Hz
                  if (ef.rateMode === 'bpm') rateHz = rateHz / 60;

                  state.phase += rateHz * dt;
                  const shuffleAmount = ef.shuffle ?? 0;
                  // Even steps (1, 3, 5...) are delayed
                  const threshold = (state.currentStep % 2 === 1) ? (1.0 + shuffleAmount * 0.5) : (1.0 - shuffleAmount * 0.5);

                  if (state.phase >= threshold) {
                    state.phase -= threshold;
                    advance = true;
                  }
                }
              }

              if (advance) {
                const maxSteps = ef.endStep + 1;
                switch (ef.direction) {
                  case 'forward':
                    state.currentStep = (state.currentStep + 1) % maxSteps;
                    break;
                  case 'backward':
                    state.currentStep = (state.currentStep - 1 + maxSteps) % maxSteps;
                    break;
                  case 'pendulum':
                    if (state.directionState === 'up') {
                      state.currentStep++;
                      if (state.currentStep >= maxSteps - 1) state.directionState = 'down';
                    } else {
                      state.currentStep--;
                      if (state.currentStep <= 0) state.directionState = 'up';
                    }
                    break;
                  case 'random':
                    state.currentStep = Math.floor(Math.random() * maxSteps);
                    break;
                }
              }

              // 3. Outputs with Slew & Bipolar conversion
              const slew = Math.max(0.001, ef.slew ?? 0);
              const slewFactor = dt / slew;

              const getProcessedStepVal = (idx: number) => {
                let v = ef.stepValues[idx] ?? 0;
                const isBipolar = ef.allStepsBipolar || (ef.stepBipolar && ef.stepBipolar[idx]);
                if (isBipolar) v = (v * 2.0) - 1.0;
                return v;
              };

              const activeStepVal = getProcessedStepVal(state.currentStep);

              // Slew Global Out
              state.lastGlobalValue += (activeStepVal - state.lastGlobalValue) * Math.min(1.0, slewFactor);
              ctx.signalValues[`${nodeId}.global_out`] = state.lastGlobalValue;

              // Slew Step Outs
              for (let i = 0; i < 16; i++) {
                const targetVal = (i === state.currentStep) ? getProcessedStepVal(i) : 0;
                state.lastStepValues[i] += (targetVal - state.lastStepValues[i]) * Math.min(1.0, slewFactor);
                ctx.signalValues[`${nodeId}.step_${i}_out`] = state.lastStepValues[i];
              }
            });
          } else if (effect.type === 'ColorPalette') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as ColorPaletteEffect;
              if (!ef || !ef.colors) return;

              // 1. Shuffle trigger detection (rising edge on shuffle_trig or manual button click)
              const trig = ctx.signalValues[`${nodeId}.shuffle_trig`] ?? 0;
              const lastTrigKey = `${ctx.layer.id}.${nodeId}.shuffle_trig`;
              const lastTrig = this.lastTriggerVals.get(lastTrigKey) ?? 0;
              const isRisingTrig = trig > 0.5 && lastTrig <= 0.5;
              this.lastTriggerVals.set(lastTrigKey, trig);

              const lastManualKey = `${ctx.layer.id}.${nodeId}.shuffleTriggerTime`;
              const lastManual = this.lastTriggerVals.get(lastManualKey) ?? 0;
              const isManualShuffle = !!(ef.shuffleTriggerTime && ef.shuffleTriggerTime !== lastManual);

              if ((isRisingTrig || isManualShuffle) && ef.colors.length > 1) {
                if (isManualShuffle && ef.shuffleTriggerTime) {
                  this.lastTriggerVals.set(lastManualKey, ef.shuffleTriggerTime);
                }
                // Fisher-Yates shuffle of the visual order
                const shuffled = [...ef.colors];
                for (let i = shuffled.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { colors: shuffled } as any);
              }

              // 2. Palette and Discrete Color Outputs
              ctx.signalValues[`${nodeId}.palette_out`] = 1.0;

              // Static port binding: col_1_out to col_8_out output luminance of color slot c_1..c_8 (accounting for CV modulation)
              for (let i = 1; i <= 8; i++) {
                const stop = ef.colors.find(c => c.id === `c_${i}`) ?? ef.colors[i - 1];
                if (stop && stop.active) {
                  let [r, g, b] = stop.color;
                  const cvVal = ctx.signalValues[`${nodeId}.col_${i}_cv`] ?? 0;
                  if (cvVal !== 0) {
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    let h = 0;
                    let s = 0;
                    const l = (max + min) / 2;
                    if (max !== min) {
                      const d = max - min;
                      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                      switch (max) {
                        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                        case g: h = ((b - r) / d + 2) / 6; break;
                        case b: h = ((r - g) / d + 4) / 6; break;
                      }
                    }
                    const effectiveS = s < 0.1 ? 0.85 : s;
                    const newH = ((h + cvVal * 0.5) % 1.0 + 1.0) % 1.0;
                    const hue2rgb = (p: number, q: number, t: number) => {
                      let tN = t;
                      if (tN < 0) tN += 1;
                      if (tN > 1) tN -= 1;
                      if (tN < 1 / 6) return p + (q - p) * 6 * tN;
                      if (tN < 1 / 2) return q;
                      if (tN < 2 / 3) return p + (q - p) * (2 / 3 - tN) * 6;
                      return p;
                    };
                    const q = l < 0.5 ? l * (1 + effectiveS) : l + effectiveS - l * effectiveS;
                    const p = 2 * l - q;
                    r = hue2rgb(p, q, newH + 1 / 3);
                    g = hue2rgb(p, q, newH);
                    b = hue2rgb(p, q, newH - 1 / 3);
                  }
                  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                  ctx.signalValues[`${nodeId}.col_${i}_out`] = luma;
                } else {
                  ctx.signalValues[`${nodeId}.col_${i}_out`] = 0.0;
                }
              }
            });
          } else if (effect.type === 'OpticalSensor') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as OpticalSensorEffect;
              if (!ef) return;
              const sensorId = ef.sensorId;
              const gain = ef.gain ?? 1.0;
              const customThreshold = ef.threshold ?? 0.3;

              const signals = SensorEngine.getInstance().getSensorSignals(sensorId);
              if (!signals) {
                ctx.signalValues[`${nodeId}.motion_out`] = 0.0;
                ctx.signalValues[`${nodeId}.gate_out`] = 0.0;
                ctx.signalValues[`${nodeId}.trig_out`] = 0.0;
                ctx.signalValues[`${nodeId}.hue_cv`] = 0.0;
                ctx.signalValues[`${nodeId}.sat_cv`] = 0.0;
                ctx.signalValues[`${nodeId}.luma_cv`] = 0.0;
                ctx.signalValues[`${nodeId}.r_out`] = 0.0;
                ctx.signalValues[`${nodeId}.g_out`] = 0.0;
                ctx.signalValues[`${nodeId}.b_out`] = 0.0;
                ctx.signalValues[`${nodeId}.palette_out`] = 1.0;
                return;
              }

              const motion = Math.min(1.0, signals.motion * gain);
              const gate = ef.threshold !== undefined
                ? (motion >= customThreshold ? 1.0 : 0.0)
                : signals.gate;

              ctx.signalValues[`${nodeId}.motion_out`] = motion;
              ctx.signalValues[`${nodeId}.gate_out`] = gate;
              ctx.signalValues[`${nodeId}.trig_out`] = signals.trig;
              ctx.signalValues[`${nodeId}.hue_cv`] = signals.hue;
              ctx.signalValues[`${nodeId}.sat_cv`] = signals.sat;
              ctx.signalValues[`${nodeId}.luma_cv`] = signals.luma;
              ctx.signalValues[`${nodeId}.r_out`] = signals.r;
              ctx.signalValues[`${nodeId}.g_out`] = signals.g;
              ctx.signalValues[`${nodeId}.b_out`] = signals.b;
              ctx.signalValues[`${nodeId}.palette_out`] = 1.0;
            });
          }
        }
      }

      const nodeEdges = edges.filter(
        e => e.fromNodeId === nodeId && (nodeRank[e.toNodeId] ?? Infinity) > (nodeRank[e.fromNodeId] ?? -1)
      );
      nodeEdges.forEach(edge => {
        pipeline.push((ctx: DispatchContext) => {
          const rawValue = ctx.signalValues[`${edge.fromNodeId}.${edge.fromPort}`] ?? 0;
          this.propagateEdgeSignal(ctx, edge, rawValue);
        });
      });
    });

    // Final Stage: Layer Output Management (Explicit Audio Routing)
    pipeline.push((ctx) => {
      const edges = ctx.layer.graph?.edges || [];
      const audioOutEdge = edges.find(e => e.toNodeId === '__output__' && e.toPort === 'audio_in');
      if (audioOutEdge) {
        ctx.audioEngine.setLayerAudioTarget(ctx.layer.id, this.resolveAudioBusId(ctx.layer.id, audioOutEdge));
      } else {
        ctx.audioEngine.setLayerAudioTarget(ctx.layer.id, null);
      }
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

    // 1. Update Global Audio Analysis
    audioEngine.update();

    // 2. Resolve MIDI Mappings & Overrides
    this.midiOverrides.clear();
    const shouldCommitToUi = force || (now - this.lastUiCommitTime > this.UI_COMMIT_INTERVAL);

    if (state.midiBindings && state.midiBindings.length > 0) {
      Object.values(state.layers).forEach(layer => {
        state.midiBindings.forEach(binding => {
          if (binding.target && binding.target.layerId === layer.id) {
            const resolvedModuleId = this.resolveTargetModuleId(binding.target, layer);
            if (resolvedModuleId) {
              const paramId = binding.target.paramId;
              const mgr = MidiManager.getInstance();
              let rawVal = 0;

              if (binding.midiSource.ccNumber !== undefined) {
                rawVal = mgr.getCCValue(binding.midiSource.channel, binding.midiSource.ccNumber);
              } else if (binding.midiSource.noteNumber !== undefined) {
                const noteData = mgr.getNoteData(binding.midiSource.channel);
                rawVal = noteData.rawPitch === binding.midiSource.noteNumber && noteData.gate ? noteData.velocity : 0;
              }

              let val = binding.range[0] + rawVal * (binding.range[1] - binding.range[0]);
              if (binding.invert) {
                val = binding.range[1] - rawVal * (binding.range[1] - binding.range[0]);
              }

              const overrideKey = `${layer.id}.${resolvedModuleId}.${paramId}`;
              this.midiOverrides.set(overrideKey, val);

              // Throttled UI state synchronization
              if (shouldCommitToUi) {
                let currentVal = 0;
                if (resolvedModuleId === 'source') {
                  currentVal = (layer.source as any)[paramId] ?? 0;
                } else {
                  const eff = layer.effects.find(e => e.id === resolvedModuleId);
                  if (eff) currentVal = (eff as any)[paramId] ?? 0;
                }

                if (Math.abs(currentVal - val) > 0.005) {
                  if (resolvedModuleId === 'source') {
                    state.setSource(layer.id, { ...layer.source, [paramId]: val });
                  } else {
                    state.updateEffect(layer.id, resolvedModuleId, { [paramId]: val } as any);
                  }
                }
              }
            }
          }
        });
      });
    }

    if (state.globalResetSignal !== this.lastResetSignal) {
      this.lastResetSignal = state.globalResetSignal;
      this.lfoPhases = {};
      this.noiseStates.clear();
      this.triggerPadStates.clear();
      this.speechStateMap.clear();
      this.pitchHoldState.clear();
      this.vowelHoldState.clear();
      dt = 0;
    }

    if (state.isGlobalPaused) {
      dt = 0;
    }
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

      if (layer.effects && layer.effects.length > 0) {
        for (const ef of layer.effects) {
          if (ef.id) {
            const isEfAudioMuted = (ef as any).audioMuted || (ef as any).muted;
            audioEngine.setModuleMute(ef.id, !!isEfAudioMuted);
            audioEngine.setLayerMute(ef.id, !!isLayerAudioMuted);
          }
        }
      }

      audioEngine.setMasterMute(!!state.globalAudioMuted);

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

      this.latestSignals[layerId] = ctx.signalValues;

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

      layer.effects.filter(ef => ef.type === 'StepSequencer').forEach(seq => {
        const sState = this.sequencerStates.get(`${layer.id}.${seq.id}`);
        if (sState && shouldCommitToUi) {
          const s = seq as StepSequencerEffect;
          const ps = sState.isPaused ? 'pause' : 'play';
          if (s.currentStep !== sState.currentStep || s.playState !== ps) {
            state.updateEffect(layer.id, seq.id, { currentStep: sState.currentStep, playState: ps } as any);
          }
        }
      });

      layer.effects.filter(ef => ef.type === 'PoetrySequencer').forEach(seq => {
        const pState = this.poetrySeqStates.get(`${layer.id}.${seq.id}`);
        if (pState && shouldCommitToUi) {
          const p = seq as PoetrySequencerEffect;
          if (
            p.currentStepIndex !== pState.currentStepIndex ||
            p.totalSteps !== pState.totalSteps ||
            p.currentText !== pState.currentText ||
            p.stepCount !== pState.stepCount
          ) {
            state.updateEffect(layer.id, seq.id, {
              currentStepIndex: pState.currentStepIndex,
              totalSteps: pState.totalSteps,
              currentText: pState.currentText,
              stepCount: pState.stepCount
            } as any);
          }
        }
      });

      layer.effects.filter(ef => ef.type === 'BlackoutPoetry').forEach(bp => {
        const bState = this.blackoutStates.get(`${layer.id}.${bp.id}`);
        if (bState && shouldCommitToUi) {
          const b = bp as BlackoutPoetryEffect;
          if (
            b.survivorCount !== bState.survivorCount ||
            b.totalWordCount !== bState.totalWordCount
          ) {
            state.updateEffect(layer.id, bp.id, {
              survivorCount: bState.survivorCount,
              totalWordCount: bState.totalWordCount
            } as any);
          }
        }
      });
    });

    if (shouldCommitToUi) {
      Object.entries(modUpdates).forEach(([id, updates]) => {
        state.updateModulatorGlobal(id, updates);
      });
      this.lastUiCommitTime = now;
    }

    // Clear one-frame MIDI clock pulses after all layers have read them
    MidiManager.getInstance().clearClockPulses();
  }

  private handlePlayerTriggers(
    ctx: DispatchContext,
    nodeId: string,
    node: any,
    isSource: boolean
  ) {
    const pausePortKey = `${nodeId}.pause_in`;
    const resetPortKey = `${nodeId}.reset_in`;
    const stateKey = `${ctx.layer.id}.${nodeId}`;

    // ── 1. Pause Trigger ──
    const pauseSettings = ctx.layer.inputSettings?.[pausePortKey];
    const isLatch = pauseSettings?.latch !== false; // default is latch (toggle on trigger pulse)

    const pauseTrig = ctx.signalValues[pausePortKey] ?? 0;
    const lastPauseTrig = this.lastTriggerVals.get(`${stateKey}.pause`) ?? 0;
    const isPauseRising = pauseTrig > 0.5 && lastPauseTrig <= 0.5;
    this.lastTriggerVals.set(`${stateKey}.pause`, pauseTrig);

    if (isLatch) {
      if (isPauseRising) {
        const nextPlayState = node.playState === 'play' ? 'pause' : 'play';
        if (isSource) {
          useEngineStore.getState().updateLayer(ctx.layer.id, {
            source: { ...ctx.layer.source, playState: nextPlayState } as any
          });
        } else {
          useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { playState: nextPlayState } as any);
        }
      }
    } else {
      // Momentary mode: paused while High (>0.5), playing while Low (<=0.5)
      const shouldBePaused = pauseTrig > 0.5;
      const isCurrentlyPaused = node.playState === 'pause';
      if (shouldBePaused !== isCurrentlyPaused) {
        const nextPlayState = shouldBePaused ? 'pause' : 'play';
        if (isSource) {
          useEngineStore.getState().updateLayer(ctx.layer.id, {
            source: { ...ctx.layer.source, playState: nextPlayState } as any
          });
        } else {
          useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { playState: nextPlayState } as any);
        }
      }
    }

    // ── 2. Reset Trigger ──
    const resetTrig = ctx.signalValues[resetPortKey] ?? 0;
    const lastResetTrig = this.lastTriggerVals.get(`${stateKey}.reset`) ?? 0;
    const isResetRising = resetTrig > 0.5 && lastResetTrig <= 0.5;
    this.lastTriggerVals.set(`${stateKey}.reset`, resetTrig);

    if (isResetRising) {
      const resetTarget = node.resetTarget || 'start flag';
      const targetTime = resetTarget === 'start of file' ? 0 : (node.loopStart ?? 0);
      const mediaKey = isSource ? ctx.layer.id : nodeId;
      MediaManager.getInstance()?.seekMedia(mediaKey, targetTime);
    }
  }

  private handleImageCueTriggers(
    ctx: DispatchContext,
    nodeId: string,
    src: ImageCueSource,
    isSource: boolean,
    dt: number
  ) {
    const stateKey = `${ctx.layer.id}.${nodeId}`;
    let cState = this.imageCueStates.get(stateKey);
    if (!cState) {
      cState = { dirTimer: 0, bankTimer: 0, intraBankTimer: 0, gateTimer: 0 };
      this.imageCueStates.set(stateKey, cState);
    }

    // 1. Read Inputs
    const thresh = src.triggerThreshold ?? 0.5;

    const imgTrigVal = ctx.signalValues[`${nodeId}.image_trig`] ?? 0;
    const lastImgTrig = this.lastTriggerVals.get(`${stateKey}.image_trig`) ?? 0;
    const isImgTrigRising = imgTrigVal >= thresh && lastImgTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.image_trig`, imgTrigVal);

    const bankTrigVal = ctx.signalValues[`${nodeId}.bank_trig`] ?? 0;
    const lastBankTrig = this.lastTriggerVals.get(`${stateKey}.bank_trig`) ?? 0;
    const isBankTrigRising = bankTrigVal >= thresh && lastBankTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.bank_trig`, bankTrigVal);

    const resetTrigVal = ctx.signalValues[`${nodeId}.reset_trig`] ?? 0;
    const lastResetTrig = this.lastTriggerVals.get(`${stateKey}.reset_trig`) ?? 0;
    const isResetRising = resetTrigVal >= thresh && lastResetTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.reset_trig`, resetTrigVal);

    const speedCv = ctx.signalValues[`${nodeId}.speed_cv`] ?? 0;
    const bankSelectCv = ctx.signalValues[`${nodeId}.bank_select_cv`];

    let imageSwapped = false;
    let nextDirIndex = src.activeDirIndex ?? 0;
    let nextBankIndex = src.activeBankIndex ?? 0;
    const banks = src.banks || [];
    let updatedBanks = [...banks];
    const maxBanks = src.bankGridMode === '16' ? 16 : 8;

    // 2. Reset Handling
    if (isResetRising) {
      nextDirIndex = 0;
      nextBankIndex = 0;
      if (updatedBanks[nextBankIndex]) {
        updatedBanks[nextBankIndex] = { ...updatedBanks[nextBankIndex], activeImageIndex: 0 };
      }
      imageSwapped = true;
    }

    // 3. Bank CV direct addressing
    if (bankSelectCv !== undefined && !isResetRising) {
      const clampedCv = Math.max(0, Math.min(1.0, bankSelectCv));
      const targetBank = Math.min(maxBanks - 1, Math.floor(clampedCv * maxBanks));
      if (targetBank !== nextBankIndex) {
        nextBankIndex = targetBank;
        imageSwapped = true;
      }
    }

    // 4. Directory Mode Execution
    if (src.playbackMode === 'directory') {
      const fileCount = src.files?.length || 0;
      let shouldStep = isImgTrigRising;

      if (src.dirAutoPlayback && fileCount > 0) {
        const speed = Math.max(0.05, (src.dirPlaybackSpeed ?? 1.0) * Math.pow(2, -speedCv));
        cState.dirTimer += dt;
        if (cState.dirTimer >= speed) {
          shouldStep = true;
          cState.dirTimer = 0;
        }
      }

      if (shouldStep && fileCount > 0) {
        if (src.dirPlaybackOrder === 'shuffle') {
          if (fileCount > 1) {
            let rand = Math.floor(Math.random() * fileCount);
            if (rand === nextDirIndex) rand = (rand + 1) % fileCount;
            nextDirIndex = rand;
          }
        } else {
          // in_order
          if (nextDirIndex + 1 < fileCount) {
            nextDirIndex++;
          } else if (src.dirLoopMode !== 'stop') {
            nextDirIndex = 0;
          }
        }
        imageSwapped = true;
      }
    }
    // 5. Bank Mode Execution
    else {
      // Bank rotation (bank_trig or bankAutoPlayback)
      let shouldStepBank = isBankTrigRising;
      if (src.bankAutoPlayback) {
        const speed = Math.max(0.05, (src.bankPlaybackSpeed ?? 1.0) * Math.pow(2, -speedCv));
        cState.bankTimer += dt;
        if (cState.bankTimer >= speed) {
          shouldStepBank = true;
          cState.bankTimer = 0;
        }
      }

      if (shouldStepBank) {
        cState.intraBankTimer = 0;
        const skipEmpty = src.bankSkipEmpty ?? true;
        const populatedIndices: number[] = [];
        if (skipEmpty) {
          for (let i = 0; i < maxBanks; i++) {
            if (updatedBanks[i]?.images && updatedBanks[i].images.length > 0) {
              populatedIndices.push(i);
            }
          }
        }
        if (skipEmpty && populatedIndices.length > 0) {
          const nextPopulated = populatedIndices.find(idx => idx > nextBankIndex);
          if (nextPopulated !== undefined) {
            nextBankIndex = nextPopulated;
          } else if (src.bankLoopMode !== 'stop') {
            nextBankIndex = populatedIndices[0];
          }
        } else if (nextBankIndex + 1 < maxBanks) {
          nextBankIndex++;
        } else if (src.bankLoopMode !== 'stop') {
          nextBankIndex = 0;
        }
        imageSwapped = true;
      }

      // Intra-bank image stepping (image_trig or active bank's autoPlayback)
      const curBank = updatedBanks[nextBankIndex];
      if (curBank && curBank.images && curBank.images.length > 0) {
        const imgCount = curBank.images.length;
        let shouldStepImg = isImgTrigRising;
        if (curBank.autoPlayback) {
          const speed = Math.max(0.05, (curBank.playbackSpeed ?? 1.0) * Math.pow(2, -speedCv));
          cState.intraBankTimer += dt;
          if (cState.intraBankTimer >= speed) {
            shouldStepImg = true;
            cState.intraBankTimer = 0;
          }
        }

        if (shouldStepImg && imgCount > 1) {
          let nextImgIdx = curBank.activeImageIndex ?? 0;
          if (curBank.playbackOrder === 'shuffle') {
            let rand = Math.floor(Math.random() * imgCount);
            if (rand === nextImgIdx) rand = (rand + 1) % imgCount;
            nextImgIdx = rand;
          } else {
            if (nextImgIdx + 1 < imgCount) {
              nextImgIdx++;
            } else if (curBank.loopMode !== 'stop') {
              nextImgIdx = 0;
            }
          }
          updatedBanks[nextBankIndex] = { ...curBank, activeImageIndex: nextImgIdx };
          imageSwapped = true;
        }
      }
    }

    // 6. Handle Image Swap Transition & Gate Output
    if (imageSwapped) {
      cState.gateTimer = 0.05; // 50ms pulse
      let nextUrl: string | undefined;
      if (src.playbackMode === 'directory') {
        nextUrl = src.files?.[nextDirIndex];
      } else {
        const b = updatedBanks[nextBankIndex];
        nextUrl = b?.images?.[b?.activeImageIndex ?? 0];
      }

      const updates: Partial<ImageCueSource> = {
        activeDirIndex: nextDirIndex,
        activeBankIndex: nextBankIndex,
        banks: updatedBanks
      };

      if (nextUrl && nextUrl !== src.currentImageUrl) {
        updates.prevImageUrl = src.currentImageUrl || nextUrl;
        updates.currentImageUrl = nextUrl;
        updates.transitionStartTime = Date.now();
      }

      if (isSource) {
        const nextSource = { ...ctx.layer.source, ...updates } as any;
        useEngineStore.getState().updateLayer(ctx.layer.id, {
          source: nextSource
        });
        ctx.layer = { ...ctx.layer, source: nextSource };
      } else {
        useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, updates as any);
        ctx.layer = {
          ...ctx.layer,
          effects: ctx.layer.effects.map(e => (e.id === nodeId ? { ...e, ...updates } : e)) as any
        };
      }
    }

    // 7. Gate Output pulse decay
    if (cState.gateTimer > 0) {
      cState.gateTimer -= dt;
      ctx.signalValues[`${nodeId}.gate_out`] = 1.0;
    } else {
      ctx.signalValues[`${nodeId}.gate_out`] = 0.0;
    }

    ctx.signalValues[`${nodeId}.video_out`] = 1.0;

    // 8. Background prefetch next image candidate
    if (src.playbackMode === 'directory' && src.files && src.files.length > 0) {
      const nextIdx = (nextDirIndex + 1) % src.files.length;
      ImageCueManager.getInstance().preloadImage(src.files[nextIdx]);
    } else if (src.playbackMode === 'bank') {
      const curBank = updatedBanks[nextBankIndex];
      if (curBank && curBank.images && curBank.images.length > 1) {
        const nextImgIdx = ((curBank.activeImageIndex ?? 0) + 1) % curBank.images.length;
        ImageCueManager.getInstance().preloadImage(curBank.images[nextImgIdx]);
      }
    }
  }

  private handleTextCueTriggers(ctx: DispatchContext, nodeId: string, src: TextCueSource, isSource: boolean, dt: number) {
    const stateKey = `${ctx.layer.id}.${nodeId}`;
    let cState = this.textCueStates.get(stateKey);
    if (!cState) {
      cState = { bankTimer: 0, intraBankTimer: 0, gateTimer: 0 };
      this.textCueStates.set(stateKey, cState);
    }

    // 1. Read Inputs
    const thresh = src.triggerThreshold ?? 0.5;

    const cardTrigVal = ctx.signalValues[`${nodeId}.card_trig`] ?? 0;
    const lastCardTrig = this.lastTriggerVals.get(`${stateKey}.card_trig`) ?? 0;
    let isCardTrigRising = cardTrigVal >= thresh && lastCardTrig < thresh;

    // Also listen for trigger from any connected downstream TextMaker
    const downstreamTmEdges = ctx.layer.graph?.edges.filter(
      e => e.fromNodeId === nodeId && (e.fromPort === 'text_out' || e.fromPort === 'video_out')
    ) || [];
    for (const e of downstreamTmEdges) {
      const targetEffect = ctx.layer.effects.find(eff => eff.id === e.toNodeId);
      if (targetEffect?.type === 'TextMaker') {
        const wipeVal = ctx.signalValues[`${targetEffect.id}.wipe_trig`] ?? 0;
        const lastWipe = this.lastTriggerVals.get(`${stateKey}.${targetEffect.id}.wipe_trig`) ?? 0;
        if (wipeVal >= thresh && lastWipe < thresh) {
          isCardTrigRising = true;
        }
        this.lastTriggerVals.set(`${stateKey}.${targetEffect.id}.wipe_trig`, wipeVal);
      }
    }
    this.lastTriggerVals.set(`${stateKey}.card_trig`, cardTrigVal);

    const bankTrigVal = ctx.signalValues[`${nodeId}.bank_trig`] ?? 0;
    const lastBankTrig = this.lastTriggerVals.get(`${stateKey}.bank_trig`) ?? 0;
    let isBankTrigRising = bankTrigVal >= thresh && lastBankTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.bank_trig`, bankTrigVal);

    // Also listen for bank trigger from any connected downstream GlyphMap
    const downstreamGmEdges = ctx.layer.graph?.edges.filter(
      e => e.fromNodeId === nodeId && (e.fromPort === 'text_out' || e.fromPort === 'video_out')
    ) || [];
    for (const e of downstreamGmEdges) {
      const targetEffect = ctx.layer.effects.find(eff => eff.id === e.toNodeId);
      if (targetEffect?.type === 'GlyphMap') {
        const gmBankTrigVal = ctx.signalValues[`${targetEffect.id}.bank_trig`] ?? 0;
        const lastGmBankTrig = this.lastTriggerVals.get(`${stateKey}.${targetEffect.id}.bank_trig`) ?? 0;
        if (gmBankTrigVal >= thresh && lastGmBankTrig < thresh) {
          isBankTrigRising = true;
        }
        this.lastTriggerVals.set(`${stateKey}.${targetEffect.id}.bank_trig`, gmBankTrigVal);
      }
    }

    if (isSource) {
      for (const eff of ctx.layer.effects) {
        if (eff.type === 'GlyphMap') {
          const hasExplicitOtherTextIn = ctx.layer.graph?.edges.some(
            e => e.toNodeId === eff.id && e.toPort === 'text_in' && e.fromNodeId !== 'source'
          );
          if (!hasExplicitOtherTextIn) {
            const gmBankTrigVal = ctx.signalValues[`${eff.id}.bank_trig`] ?? 0;
            const lastGmBankTrig = this.lastTriggerVals.get(`${stateKey}.${eff.id}.bank_trig`) ?? 0;
            if (gmBankTrigVal >= thresh && lastGmBankTrig < thresh) {
              isBankTrigRising = true;
            }
            this.lastTriggerVals.set(`${stateKey}.${eff.id}.bank_trig`, gmBankTrigVal);
          }
        }
      }
    }

    const resetTrigVal = ctx.signalValues[`${nodeId}.reset_trig`] ?? 0;
    const lastResetTrig = this.lastTriggerVals.get(`${stateKey}.reset_trig`) ?? 0;
    const isResetRising = resetTrigVal >= thresh && lastResetTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.reset_trig`, resetTrigVal);

    const speedCv = ctx.signalValues[`${nodeId}.speed_cv`] ?? 0;
    const bankSelectCv = ctx.signalValues[`${nodeId}.bank_select_cv`];

    let cardSwapped = false;
    let nextBankIndex = src.activeBankIndex ?? 0;
    const banks = src.banks || [];
    let updatedBanks = [...banks];
    const maxBanks = src.bankGridMode === '24' ? 24 : src.bankGridMode === '16' ? 16 : 8;
    const skipEmpty = src.bankSkipEmpty ?? true;
    const populatedIndices: number[] = [];
    if (skipEmpty) {
      for (let i = 0; i < maxBanks; i++) {
        if (updatedBanks[i]?.cards && updatedBanks[i].cards.length > 0) {
          populatedIndices.push(i);
        }
      }
    }
    const candidates = (skipEmpty && populatedIndices.length > 0)
      ? populatedIndices
      : Array.from({ length: maxBanks }, (_, i) => i);

    // 2. Reset Handling
    if (isResetRising) {
      cState.bankTimer = 0;
      cState.intraBankTimer = 0;
      nextBankIndex = 0;
      if (skipEmpty && populatedIndices.length > 0) {
        nextBankIndex = populatedIndices[0];
      }
      if (updatedBanks[nextBankIndex]) {
        updatedBanks[nextBankIndex] = { ...updatedBanks[nextBankIndex], activeCardIndex: 0 };
      }
      cardSwapped = true;
    }

    // 3. Bank CV direct addressing
    if (bankSelectCv !== undefined && !isResetRising) {
      const clampedCv = Math.max(0, Math.min(1.0, bankSelectCv));
      const targetBank = Math.min(maxBanks - 1, Math.floor(clampedCv * maxBanks));
      if (targetBank !== nextBankIndex) {
        nextBankIndex = targetBank;
        cState.intraBankTimer = 0;
        cardSwapped = true;
      }
    }

    // 4. Bank Rotation (bank_trig or bankAutoPlayback)
    let shouldStepBank = isBankTrigRising;
    if (src.bankAutoPlayback) {
      const speed = Math.max(0.05, (src.bankPlaybackSpeed ?? 2.0) * Math.pow(2, -speedCv));
      cState.bankTimer += dt;
      if (cState.bankTimer >= speed) {
        shouldStepBank = true;
        cState.bankTimer = 0;
      }
    }

    if (shouldStepBank && !isResetRising) {
      cState.intraBankTimer = 0;
      if (src.bankPlaybackOrder === 'shuffle') {
        if (candidates.length > 1) {
          const otherCandidates = candidates.filter(idx => idx !== nextBankIndex);
          nextBankIndex = otherCandidates[Math.floor(Math.random() * otherCandidates.length)];
        } else if (candidates.length === 1) {
          nextBankIndex = candidates[0];
        }
      } else {
        const nextCandidate = candidates.find(idx => idx > nextBankIndex);
        if (nextCandidate !== undefined) {
          nextBankIndex = nextCandidate;
        } else if (src.bankLoopMode !== 'stop' && candidates.length > 0) {
          nextBankIndex = candidates[0];
        }
      }
      cardSwapped = true;
    }

    // 5. Intra-Bank Card Stepping (card_trig or active bank's autoPlayback)
    const curBank = updatedBanks[nextBankIndex];
    if (curBank && curBank.cards && curBank.cards.length > 0 && !isResetRising) {
      const cardCount = curBank.cards.length;
      let shouldStepCard = isCardTrigRising;
      if (curBank.autoPlayback) {
        const speed = Math.max(0.05, (curBank.playbackSpeed ?? 1.0) * Math.pow(2, -speedCv));
        cState.intraBankTimer += dt;
        if (cState.intraBankTimer >= speed) {
          shouldStepCard = true;
          cState.intraBankTimer = 0;
        }
      }

      if (shouldStepCard) {
        let nextCardIdx = curBank.activeCardIndex ?? 0;
        const universalOrder = src.cardPlaybackOrder ?? curBank.playbackOrder ?? 'in_order';
        const universalLoop = src.cardLoopMode ?? curBank.loopMode ?? 'loop';
        if (cardCount > 1) {
          if (universalOrder === 'shuffle') {
            let rand = Math.floor(Math.random() * cardCount);
            if (rand === nextCardIdx) rand = (rand + 1) % cardCount;
            nextCardIdx = rand;
            cardSwapped = true;
          } else {
            if (nextCardIdx + 1 < cardCount) {
              nextCardIdx++;
              cardSwapped = true;
            } else if (universalLoop === 'bank') {
              let targetBankIdx = nextBankIndex;
              if (src.bankPlaybackOrder === 'shuffle') {
                if (candidates.length > 1) {
                  const others = candidates.filter(idx => idx !== nextBankIndex);
                  targetBankIdx = others[Math.floor(Math.random() * others.length)];
                } else if (candidates.length === 1) {
                  targetBankIdx = candidates[0];
                }
              } else {
                const nextCand = candidates.find(idx => idx > nextBankIndex);
                if (nextCand !== undefined) {
                  targetBankIdx = nextCand;
                } else if (src.bankLoopMode !== 'stop' && candidates.length > 0) {
                  targetBankIdx = candidates[0];
                }
              }
              if (targetBankIdx !== nextBankIndex) {
                nextBankIndex = targetBankIdx;
                const tb = updatedBanks[nextBankIndex];
                updatedBanks[nextBankIndex] = { ...tb, activeCardIndex: 0 };
                cardSwapped = true;
              } else if (src.bankLoopMode !== 'stop') {
                nextCardIdx = 0;
                cardSwapped = true;
              }
            } else if (universalLoop !== 'stop') {
              nextCardIdx = 0;
              cardSwapped = true;
            }
          }
          if (universalLoop !== 'bank' || nextBankIndex === src.activeBankIndex) {
            updatedBanks[nextBankIndex] = { ...curBank, activeCardIndex: nextCardIdx };
          }
        } else if (universalLoop === 'bank') {
          let targetBankIdx = nextBankIndex;
          if (src.bankPlaybackOrder === 'shuffle') {
            if (candidates.length > 1) {
              const others = candidates.filter(idx => idx !== nextBankIndex);
              targetBankIdx = others[Math.floor(Math.random() * others.length)];
            } else if (candidates.length === 1) {
              targetBankIdx = candidates[0];
            }
          } else {
            const nextCand = candidates.find(idx => idx > nextBankIndex);
            if (nextCand !== undefined) {
              targetBankIdx = nextCand;
            } else if (src.bankLoopMode !== 'stop' && candidates.length > 0) {
              targetBankIdx = candidates[0];
            }
          }
          if (targetBankIdx !== nextBankIndex) {
            nextBankIndex = targetBankIdx;
            const tb = updatedBanks[nextBankIndex];
            updatedBanks[nextBankIndex] = { ...tb, activeCardIndex: 0 };
            cardSwapped = true;
          } else if (src.bankLoopMode !== 'stop' || isCardTrigRising) {
            cardSwapped = true;
          }
        } else if (universalLoop !== 'stop' || isCardTrigRising) {
          cardSwapped = true;
        }
      }
    }

    // 6. Handle Card Swap Transition Metadata & Gate Output
    if (cardSwapped) {
      cState.gateTimer = 0.05; // 50ms pulse
      const b = updatedBanks[nextBankIndex];
      const nextCard = b?.cards?.[b?.activeCardIndex ?? 0];
      const nextText = nextCard?.text ?? '';

      const updates: Partial<TextCueSource> = {
        activeBankIndex: nextBankIndex,
        banks: updatedBanks,
        prevText: src.currentText ?? '',
        currentText: nextText,
        lastStepTime: Date.now(),
        stepCount: (src.stepCount ?? 0) + 1
      };

      if (isSource) {
        const nextSource = { ...ctx.layer.source, ...updates } as any;
        useEngineStore.getState().updateLayer(ctx.layer.id, {
          source: nextSource
        });
        ctx.layer = { ...ctx.layer, source: nextSource };
      } else {
        useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, updates as any);
        ctx.layer = {
          ...ctx.layer,
          effects: ctx.layer.effects.map(e => (e.id === nodeId ? { ...e, ...updates } : e)) as any
        };
      }
    }

    // 7. Gate Output pulse decay & output signals
    if (cState.gateTimer > 0) {
      cState.gateTimer -= dt;
      ctx.signalValues[`${nodeId}.gate_out`] = 1.0;
    } else {
      ctx.signalValues[`${nodeId}.gate_out`] = 0.0;
    }

    ctx.signalValues[`${nodeId}.video_out`] = 1.0;
    const activeBank = updatedBanks[nextBankIndex];
    ctx.signalValues[`${nodeId}.text_out`] = (activeBank?.cards && activeBank.cards.length > 0) ? 1.0 : 0.0;
  }

  private propagateEdgeSignal(
    ctx: DispatchContext,
    edge: { fromNodeId: string; fromPort: string; toNodeId: string; toPort: string; signalType?: string },
    initialValue: number
  ) {
    let rawValue = initialValue;

    if (edge.signalType === 'audio' || edge.fromPort === 'audio_out' || edge.fromPort === 'peak_out' || edge.fromPort === 'ch1_out' || edge.fromPort === 'ch2_out') {
      const busId = this.resolveAudioBusId(ctx.layer.id, edge);
      rawValue = ctx.audioEngine.getPeakVolume(busId);
    } else if (edge.signalType === 'video' || edge.toPort === 'map_in' || edge.toPort === 'video_in') {
      rawValue = 1.0;
    } else {
      const renderer = (window as any).renderer;
      if (renderer && renderer.latestLumaValues) {
        const luma = renderer.latestLumaValues[`${edge.fromNodeId}.${edge.fromPort}`];
        if (luma !== undefined) rawValue = luma;
      }
    }

    let processedValue = rawValue;
    const settings = ctx.layer.inputSettings?.[`${edge.toNodeId}.${edge.toPort}`];
    if (settings) {
      if (settings.bipolar) processedValue = (rawValue * 2.0) - 1.0;
      else processedValue = rawValue;
      processedValue *= settings.amount;
      if (settings.invert) processedValue = -processedValue;
    }

    if (!Number.isNaN(processedValue)) {
      const targetKey = `${edge.toNodeId}.${edge.toPort}`;
      ctx.signalValues[targetKey] = (ctx.signalValues[targetKey] ?? 0) + processedValue;
    }
  }

  private resolveIncomingText(
    ctx: DispatchContext,
    nodeId: string,
    localFallback: string
  ): { text: string; sourceStepCount: number; hasExternal: boolean } {
    const edge = ctx.layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'text_in');
    if (!edge) {
      return { text: localFallback, sourceStepCount: 0, hasExternal: false };
    }

    const extractTextCue = (src: TextCueSource) => {
      const activeBank = src.banks?.[src.activeBankIndex ?? 0];
      const text = (src.currentText && src.currentText.length > 0)
        ? src.currentText
        : (activeBank?.cards?.[activeBank?.activeCardIndex ?? 0]?.text ?? '');
      return { text, sourceStepCount: src.stepCount ?? 0, hasExternal: true };
    };

    if (edge.fromNodeId === 'source' && ctx.layer.source.type === 'TextCue') {
      return extractTextCue(ctx.layer.source as TextCueSource);
    }

    const upstream = ctx.layer.effects.find(e => e.id === edge.fromNodeId);
    if (!upstream) return { text: localFallback, sourceStepCount: 0, hasExternal: false };
    if (upstream.type === 'TextCue') {
      return extractTextCue(upstream as TextCueSource);
    }
    if (upstream.type === 'PoetrySequencer') {
      const rt = this.poetrySeqStates.get(`${ctx.layer.id}.${upstream.id}`);
      const p = upstream as PoetrySequencerEffect;
      return {
        text: rt?.currentText ?? p.currentText ?? p.localText ?? '',
        sourceStepCount: rt?.stepCount ?? p.stepCount ?? 0,
        hasExternal: true
      };
    }
    if (upstream.type === 'TextMaker') {
      const tm = upstream as TextMakerEffect;
      return { text: tm.localText ?? '', sourceStepCount: 0, hasExternal: true };
    }

    return { text: localFallback, sourceStepCount: 0, hasExternal: false };
  }

  private handlePoetrySequencer(
    ctx: DispatchContext,
    nodeId: string,
    ef: PoetrySequencerEffect,
    dt: number
  ) {
    const stateKey = `${ctx.layer.id}.${nodeId}`;
    let pState = this.poetrySeqStates.get(stateKey);
    if (!pState) {
      pState = {
        currentStepIndex: Math.max(0, ef.currentStepIndex ?? 0),
        stepCount: ef.stepCount ?? 0,
        currentText: ef.currentText ?? '',
        prevText: '',
        totalSteps: 0,
        lastTextKey: '',
        lastManualStep: ef.manualStepTrigger ?? 0,
        lastManualPrev: ef.manualPrevTrigger ?? 0,
        lastManualReset: ef.manualResetTrigger ?? 0,
        cadence: 0,
        syllableRateHz: 0,
        pauseTensionCv: 0,
        inSpeech: false,
        silenceDurationMs: 0,
        stepPulseMs: 0,
        caesuraPulseMs: 0,
        tokens: [],
      };
      this.poetrySeqStates.set(stateKey, pState);
    }

    const dtMs = Math.max(0, dt * 1000);
    pState.stepPulseMs = Math.max(0, pState.stepPulseMs - dtMs);
    pState.caesuraPulseMs = Math.max(0, pState.caesuraPulseMs - dtMs);

    // 1. Resolve incoming or local text and re-tokenize if text/unit/external card changed
    const parseUnit = ef.parseUnit ?? 'word';
    const revealMode = ef.revealMode ?? 'single';
    const { text: resolvedText, sourceStepCount } = this.resolveIncomingText(ctx, nodeId, ef.localText ?? '');
    const textKey = `${resolvedText}\0${sourceStepCount}\0${parseUnit}`;

    if (textKey !== pState.lastTextKey) {
      pState.tokens = tokenizePoetry(resolvedText, parseUnit);
      pState.totalSteps = pState.tokens.length;
      const isInitialInit = pState.lastTextKey === '';
      pState.lastTextKey = textKey;
      // Preserve loaded step index on initial compile, otherwise rewind to 0 when source text changes
      pState.currentStepIndex = isInitialInit
        ? Math.max(0, Math.min(Math.max(0, pState.tokens.length - 1), pState.currentStepIndex))
        : 0;
      const nextFormatted = formatPoetryStep(pState.tokens, pState.currentStepIndex, revealMode);
      if (nextFormatted !== pState.currentText) {
        pState.prevText = pState.currentText;
        pState.currentText = nextFormatted;
        pState.stepCount += 1;
      }
    }

    // 2. Analyze audio_in (or master fallback) using A + C cadence tracker
    const edges = ctx.layer.graph?.edges || [];
    const incomingAudio = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
    const busId = this.resolveAudioBusId(ctx.layer.id, incomingAudio, ctx.layer.effects);

    const sensitivityDb = this.getMidiOverride(ctx.layer.id, nodeId, 'sensitivityDb') ?? ef.sensitivityDb ?? -38;
    const prominenceDb = this.getMidiOverride(ctx.layer.id, nodeId, 'prominenceDb') ?? ef.prominenceDb ?? 6;
    const lockoutMs = this.getMidiOverride(ctx.layer.id, nodeId, 'lockoutMs') ?? ef.lockoutMs ?? 135;
    const microGapMs = this.getMidiOverride(ctx.layer.id, nodeId, 'microGapMs') ?? ef.microGapMs ?? 180;
    const breathPauseMs = this.getMidiOverride(ctx.layer.id, nodeId, 'breathPauseMs') ?? ef.breathPauseMs ?? 450;
    const caesuraPauseMs = this.getMidiOverride(ctx.layer.id, nodeId, 'caesuraPauseMs') ?? ef.caesuraPauseMs ?? 1600;

    const features = ctx.audioEngine.getSpeechFeatures(
      busId,
      10,
      120,
      stateKey,
      dt,
      { sensitivityDb, prominenceDb, lockoutMs, microGapMs, breathPauseMs, caesuraPauseMs }
    );

    if (features) {
      pState.cadence = features.cadence;
      pState.syllableRateHz = features.syllableRateHz ?? 0;
      pState.pauseTensionCv = features.pauseTensionCv ?? 0;
      pState.inSpeech = !!features.inSpeech;
      pState.silenceDurationMs = features.silenceDurationMs ?? 0;
    } else {
      pState.cadence = 0;
      pState.syllableRateHz = 0;
      pState.pauseTensionCv = 0;
      pState.inSpeech = false;
      pState.silenceDurationMs = 0;
    }

    // 3. Collect manual, external CV, and cadence triggers
    const thresh = ef.triggerThreshold ?? 0.5;

    const stepTrigVal = ctx.signalValues[`${nodeId}.step_trig`] ?? 0;
    const lastStepTrig = this.lastTriggerVals.get(`${stateKey}.step_trig`) ?? 0;
    const isExtStep = stepTrigVal >= thresh && lastStepTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.step_trig`, stepTrigVal);

    const prevTrigVal = ctx.signalValues[`${nodeId}.prev_trig`] ?? 0;
    const lastPrevTrig = this.lastTriggerVals.get(`${stateKey}.prev_trig`) ?? 0;
    const isExtPrev = prevTrigVal >= thresh && lastPrevTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.prev_trig`, prevTrigVal);

    const resetTrigVal = ctx.signalValues[`${nodeId}.reset_trig`] ?? 0;
    const lastResetTrig = this.lastTriggerVals.get(`${stateKey}.reset_trig`) ?? 0;
    const isExtReset = resetTrigVal >= thresh && lastResetTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.reset_trig`, resetTrigVal);

    const curManualStep = ef.manualStepTrigger ?? 0;
    const isManualStep = curManualStep > pState.lastManualStep;
    pState.lastManualStep = curManualStep;

    const curManualPrev = ef.manualPrevTrigger ?? 0;
    const isManualPrev = curManualPrev > pState.lastManualPrev;
    pState.lastManualPrev = curManualPrev;

    const curManualReset = ef.manualResetTrigger ?? 0;
    const isManualReset = curManualReset > pState.lastManualReset;
    pState.lastManualReset = curManualReset;

    let isCadenceStep = false;
    if (features) {
      if (ef.cadenceMode === 'syllable') {
        isCadenceStep = !!features.syllableOnset;
      } else if (ef.cadenceMode === 'breath_pause') {
        isCadenceStep = !!features.breathPauseTrig;
      } else if (ef.cadenceMode === 'breath_resume') {
        isCadenceStep = !!features.resumePhraseTrig;
      }
    }

    let caesuraBankPulse = false;
    let isCaesuraStep = false;
    let isCaesuraReset = false;
    if (features?.caesuraTrig) {
      pState.caesuraPulseMs = 180;
      if (ef.caesuraAction === 'step') isCaesuraStep = true;
      else if (ef.caesuraAction === 'reset') isCaesuraReset = true;
      else if (ef.caesuraAction === 'advance_text_bank') caesuraBankPulse = true;
    }

    // 4. Advance sequencer index cleanly
    const count = pState.tokens.length;
    let didStep = false;
    let bankStepPulse = caesuraBankPulse;

    if (isExtReset || isManualReset || isCaesuraReset) {
      if (pState.currentStepIndex !== 0) {
        pState.currentStepIndex = 0;
        didStep = true;
      }
    } else if ((isExtPrev || isManualPrev) && count > 0) {
      if (pState.currentStepIndex > 0) {
        pState.currentStepIndex -= 1;
        didStep = true;
      } else if (ef.endAction === 'loop') {
        pState.currentStepIndex = count - 1;
        didStep = true;
      }
    } else if ((isExtStep || isManualStep || isCadenceStep || isCaesuraStep) && count > 0) {
      if (pState.currentStepIndex + 1 < count) {
        pState.currentStepIndex += 1;
        didStep = true;
      } else if (ef.endAction === 'loop') {
        pState.currentStepIndex = 0;
        didStep = true;
      } else if (ef.endAction === 'advance_text_bank') {
        bankStepPulse = true;
        didStep = true;
      }
    }

    // Also refresh formatted output if revealMode changed without changing textKey
    const formatted = formatPoetryStep(pState.tokens, pState.currentStepIndex, revealMode);
    if (formatted !== pState.currentText || didStep) {
      pState.prevText = pState.currentText;
      pState.currentText = formatted;
      pState.stepCount += 1;
      pState.stepPulseMs = 140;
    }

    // 5. Emit outputs
    ctx.signalValues[`${nodeId}.text_out`] = count > 0 ? 1.0 : 0.0;
    ctx.signalValues[`${nodeId}.step_out`] = didStep ? 1.0 : 0.0;
    ctx.signalValues[`${nodeId}.phrase_out`] = (features?.breathPauseTrig || features?.resumePhraseTrig) ? 1.0 : 0.0;
    ctx.signalValues[`${nodeId}.caesura_out`] = features?.caesuraTrig ? 1.0 : 0.0;
    ctx.signalValues[`${nodeId}.bank_step_out`] = bankStepPulse ? 1.0 : 0.0;
    ctx.signalValues[`${nodeId}.cadence_cv`] = pState.cadence;
    ctx.signalValues[`${nodeId}.progress_cv`] = count > 1
      ? pState.currentStepIndex / (count - 1)
      : (count === 1 ? 1.0 : 0.0);
    ctx.signalValues[`${nodeId}.tension_cv`] = pState.pauseTensionCv;
  }

  private handleBlackoutPoetry(
    ctx: DispatchContext,
    nodeId: string,
    ef: BlackoutPoetryEffect,
    dt: number
  ) {
    const stateKey = `${ctx.layer.id}.${nodeId}`;
    let bState = this.blackoutStates.get(stateKey);
    if (!bState) {
      const initFloor = Math.max(0, Math.min(1, ef.rampFloor ?? 0));
      bState = {
        flashEnvelope: 0,
        survivorRatio: 0,
        survivorCount: ef.survivorCount ?? 0,
        totalWordCount: ef.totalWordCount ?? 0,
        lastSourceStepCount: 0,
        lastTextValue: '',
        rerollPulseMs: 0,
        rampProgress: 0,
        rampDir: 1,
        progressiveDensity: initFloor,
        wordDurationMs: ef.wordDurationMs ?? 400,
        textGeneration: 0,
        lastManualRampReset: ef.manualRampResetTrigger ?? 0,
        rampDoneLatched: false,
      };
      this.blackoutStates.set(stateKey, bState);
    }

    const dtMs = Math.max(0, dt * 1000);
    bState.rerollPulseMs = Math.max(0, bState.rerollPulseMs - dtMs);

    const thresh = ef.triggerThreshold ?? 0.5;

    // 1. Independent TextCue card_trig & bank_trig handling (when wired to Text Bank via text_in)
    const cardTrigVal = ctx.signalValues[`${nodeId}.card_trig`] ?? 0;
    const lastCardTrig = this.lastTriggerVals.get(`${stateKey}.card_trig`) ?? 0;
    const isCardRising = cardTrigVal >= thresh && lastCardTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.card_trig`, cardTrigVal);

    const bankTrigVal = ctx.signalValues[`${nodeId}.bank_trig`] ?? 0;
    const lastBankTrig = this.lastTriggerVals.get(`${stateKey}.bank_trig`) ?? 0;
    const isBankRising = bankTrigVal >= thresh && lastBankTrig < thresh;
    this.lastTriggerVals.set(`${stateKey}.bank_trig`, bankTrigVal);

    if (isCardRising || isBankRising) {
      const linked = findConnectedTextCue(ctx.layer, nodeId, 'text_in');
      if (linked) {
        const updates = isBankRising
          ? stepTextCueBankBy(linked.cue, 1)
          : stepTextCueCardBy(linked.cue, 1, true);
        if (Object.keys(updates).length > 0) {
          if (linked.isSource) {
            const nextSource = { ...ctx.layer.source, ...updates } as any;
            useEngineStore.getState().updateLayer(ctx.layer.id, { source: nextSource });
            ctx.layer = { ...ctx.layer, source: nextSource };
          } else {
            useEngineStore.getState().updateEffect(ctx.layer.id, linked.nodeId, updates as any);
            ctx.layer = {
              ...ctx.layer,
              effects: ctx.layer.effects.map(e => (e.id === linked.nodeId ? { ...e, ...updates } : e)) as any,
            };
          }
        }
      }
    }

    // 2. Entropy reroll trigger & upstream text change detection
    const entropyVal = ctx.signalValues[`${nodeId}.entropy_trig`] ?? 0;
    const lastEntropyVal = this.lastTriggerVals.get(`${stateKey}.entropy_trig`) ?? 0;
    const isEntropyRising = entropyVal >= thresh && lastEntropyVal < thresh;
    this.lastTriggerVals.set(`${stateKey}.entropy_trig`, entropyVal);

    const incoming = this.resolveIncomingText(ctx, nodeId, ef.localText ?? '');
    const sourceStepped = incoming.sourceStepCount !== bState.lastSourceStepCount;
    const textChanged = incoming.text !== bState.lastTextValue;
    bState.lastSourceStepCount = incoming.sourceStepCount;
    bState.lastTextValue = incoming.text;

    let didReroll = isEntropyRising || sourceStepped;
    if (isEntropyRising) {
      const nextSeed = ((ef.seed ?? 1) % 9999) + 1;
      useEngineStore.getState().updateEffect(ctx.layer.id, nodeId, { seed: nextSeed } as any);
      ctx.layer = {
        ...ctx.layer,
        effects: ctx.layer.effects.map(e => (e.id === nodeId ? { ...e, seed: nextSeed } : e)) as any,
      };
      bState.rerollPulseMs = 140;
    }

    // 3. Progressive blackout ramp (Floor -> Ceiling) & per-word animation duration (ms + CV)
    const rampResetVal = ctx.signalValues[`${nodeId}.ramp_reset_trig`] ?? 0;
    const lastRampReset = this.lastTriggerVals.get(`${stateKey}.ramp_reset_trig`) ?? 0;
    const isExtRampReset = rampResetVal >= thresh && lastRampReset < thresh;
    this.lastTriggerVals.set(`${stateKey}.ramp_reset_trig`, rampResetVal);

    const manualRampReset = ef.manualRampResetTrigger ?? 0;
    const isManualRampReset = manualRampReset > bState.lastManualRampReset;
    bState.lastManualRampReset = manualRampReset;

    const resetOnCard = ef.resetOnCardChange !== false;
    const cardTriggeredReset = resetOnCard && (sourceStepped || textChanged);

    if (isExtRampReset || isManualRampReset || cardTriggeredReset) {
      bState.rampProgress = 0;
      bState.rampDir = 1;
      bState.rampDoneLatched = false;
      bState.textGeneration += 1;
    }

    const rampMode = ef.rampMode ?? 'off';
    const rampFloor = Math.max(0, Math.min(1, this.getMidiOverride(ctx.layer.id, nodeId, 'rampFloor') ?? ef.rampFloor ?? 0));
    const rampCeiling = Math.max(rampFloor, Math.min(1, this.getMidiOverride(ctx.layer.id, nodeId, 'rampCeiling') ?? ef.rampCeiling ?? 0.85));
    const rampDurSec = Math.max(0.5, this.getMidiOverride(ctx.layer.id, nodeId, 'rampDurationSec') ?? ef.rampDurationSec ?? 12.0);
    const rampRateCv = ctx.signalValues[`${nodeId}.ramp_rate_cv`] ?? 0;
    const speedScale = Math.max(0.0, 1.0 + rampRateCv * 2.0);

    let rampDonePulse = false;
    if (rampMode !== 'off' && !ef.rampPaused && dt > 0 && speedScale > 0) {
      const deltaProg = (dt / rampDurSec) * speedScale * bState.rampDir;
      bState.rampProgress += deltaProg;

      if (bState.rampProgress >= 1.0) {
        if (!bState.rampDoneLatched) {
          rampDonePulse = true;
          bState.rampDoneLatched = true;
        }
        if (rampMode === 'loop') {
          bState.rampProgress = bState.rampProgress % 1.0;
          bState.rampDoneLatched = false;
        } else if (rampMode === 'pingpong') {
          bState.rampProgress = 1.0 - (bState.rampProgress - 1.0);
          bState.rampDir = -1;
          bState.rampDoneLatched = false;
        } else {
          bState.rampProgress = 1.0;
        }
      } else if (bState.rampProgress <= 0.0) {
        if (rampMode === 'pingpong') {
          bState.rampProgress = Math.min(1.0, -bState.rampProgress);
          bState.rampDir = 1;
        } else {
          bState.rampProgress = 0.0;
        }
      }
    }

    bState.progressiveDensity = rampFloor + (rampCeiling - rampFloor) * Math.max(0, Math.min(1, bState.rampProgress));

    const baseWordDurMs = this.getMidiOverride(ctx.layer.id, nodeId, 'wordDurationMs') ?? ef.wordDurationMs ?? 400;
    const wordDurCv = ctx.signalValues[`${nodeId}.word_dur_cv`] ?? 0;
    bState.wordDurationMs = Math.max(20, Math.min(5000, baseWordDurMs + wordDurCv * 1500));

    // 4. Glimpse flash trigger + smooth release envelope
    const flashVal = ctx.signalValues[`${nodeId}.flash_trig`] ?? 0;
    const lastFlashVal = this.lastTriggerVals.get(`${stateKey}.flash_trig`) ?? 0;
    const isFlashRising = flashVal >= thresh && lastFlashVal < thresh;
    this.lastTriggerVals.set(`${stateKey}.flash_trig`, flashVal);

    if (isFlashRising) {
      bState.flashEnvelope = 1.0;
    } else if (bState.flashEnvelope > 0.001) {
      const releaseSec = Math.max(0.03, (this.getMidiOverride(ctx.layer.id, nodeId, 'flashReleaseMs') ?? ef.flashReleaseMs ?? 320) / 1000);
      bState.flashEnvelope *= Math.exp(-Math.max(0, dt) / releaseSec);
      if (bState.flashEnvelope < 0.002) bState.flashEnvelope = 0;
    }

    // 5. Outputs
    ctx.signalValues[`${nodeId}.video_out`] = 1.0;
    ctx.signalValues[`${nodeId}.matte_out`] = 1.0;
    ctx.signalValues[`${nodeId}.survivor_cv`] = bState.survivorRatio;
    ctx.signalValues[`${nodeId}.reroll_out`] = didReroll ? 1.0 : 0.0;
    ctx.signalValues[`${nodeId}.ramp_cv`] = rampMode !== 'off' ? bState.progressiveDensity : (ef.density ?? 0.62);
    ctx.signalValues[`${nodeId}.ramp_done_out`] = rampDonePulse ? 1.0 : 0.0;
  }

}
