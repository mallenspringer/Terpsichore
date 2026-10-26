import { useEngineStore } from './store';
import {
  LayerState, TriggerPadSource, LogicGateEffect, TriggeredGateEffect, InverterEffect,
  SignalMathEffect, SampleAndHoldEffect, StepSequencerEffect, OscilloscopeEffect,
  SpectralSplitterEffect, AlphaAdjustEffect, AudioTransformerEffect, AudioModulatorEffect,
  AudioGateEffect, SpeechEnvelopeTrackerEffect, VocalPitchTrackerEffect, VowelFormantTrackerEffect,
  SpokenWordVisualizerEffect, AudioToCVEffect
} from './types';
import { AudioEngine } from './AudioEngine';
import { MidiManager } from './MidiManager';
import { MediaManager } from '../renderer/MediaManager';

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
  private pitchStateMap = new Map<string, number>();
  private vowelStateMap = new Map<string, string>();
  private audioToCvSmoothed = new Map<string, number>();
  private midiOverrides = new Map<string, number>();

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
          const srcType = ctx.layer.source.type;
          if (srcType === 'VideoFile' || srcType === 'VideoURL' || srcType === 'AudioFile') {
            this.handlePlayerTriggers(ctx, 'source', ctx.layer.source as any, true);
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
              const bus = ctx.audioEngine.getBusData(busId);
              if (bus) {
                ctx.signalValues[`${nodeId}.peak_out`] = bus.peak;
                ctx.signalValues[`${nodeId}.audio_out`] = 1.0;
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
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as SpeechEnvelopeTrackerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = incomingEdge ? (incomingEdge.fromNodeId === 'source' ? ctx.layer.id : incomingEdge.fromNodeId) : 'master';

              const features = ctx.audioEngine.getSpeechFeatures(busId, ef.attackMs || 10, ef.releaseMs || 150);
              if (features) {
                ctx.signalValues[`${nodeId}.envelope_out`] = features.envelope;
                ctx.signalValues[`${nodeId}.cadence_out`] = Math.min(1.0, features.cadence);

                const threshold = Math.pow(10, (ef.sensitivityDb ?? -40) / 20);
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
          } else if (effect.type === 'VocalPitchTracker') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as VocalPitchTrackerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = incomingEdge ? (incomingEdge.fromNodeId === 'source' ? ctx.layer.id : incomingEdge.fromNodeId) : 'master';

              const features = ctx.audioEngine.getPitchFeatures(
                busId, 
                ef.minPitchHz || 80, 
                ef.maxPitchHz || 800,
                ef.pitchRangeMode || 'voice'
              );
              if (features) {
                ctx.signalValues[`${nodeId}.pitch_hz`] = features.hz;
                ctx.signalValues[`${nodeId}.pitch_midi`] = features.midi;
                ctx.signalValues[`${nodeId}.stability`] = features.confidence;

                const stateKey = `${ctx.layer.id}.${nodeId}`;
                const lastNote = this.pitchStateMap.get(stateKey) ?? 0;

                let isNoteChange = false;
                if (features.hz > 20 && features.confidence > 0.4) {
                  const midiNote = 12 * Math.log2(features.hz / 440) + 69;
                  if (lastNote > 0 && Math.abs(midiNote - lastNote) >= 0.5) {
                    isNoteChange = true;
                  }
                  this.pitchStateMap.set(stateKey, midiNote);
                } else if (features.hz <= 20) {
                  this.pitchStateMap.delete(stateKey);
                }

                ctx.signalValues[`${nodeId}.note_change_trig`] = isNoteChange ? 1.0 : 0.0;
              }
            });
          } else if (effect.type === 'VowelFormantTracker') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as VowelFormantTrackerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = incomingEdge ? (incomingEdge.fromNodeId === 'source' ? ctx.layer.id : incomingEdge.fromNodeId) : 'master';

              const features = ctx.audioEngine.getFormantFeatures(busId, ef.voiceProfile);
              if (features) {
                const sm = ef.smoothing ?? 0.8;
                const prevSignals = this.latestSignals[ctx.layer.id] || {};
                const prevX = prevSignals[`${nodeId}.vowel_x`] ?? 0.5;
                const prevY = prevSignals[`${nodeId}.vowel_y`] ?? 0.5;

                const targetX = features.x;
                const targetY = features.y;

                const curX = prevX * sm + targetX * (1 - sm);
                const curY = prevY * sm + targetY * (1 - sm);

                ctx.signalValues[`${nodeId}.formant_f1`] = features.f1;
                ctx.signalValues[`${nodeId}.formant_f2`] = features.f2;
                ctx.signalValues[`${nodeId}.vowel_x`] = curX;
                ctx.signalValues[`${nodeId}.vowel_y`] = curY;

                const getVowelZone = (x: number, y: number): string => {
                  if (x < 0.5) {
                    return y >= 0.5 ? 'Oo' : 'Oh';
                  } else {
                    return y >= 0.5 ? 'Ee' : 'Ah';
                  }
                };

                const bus = ctx.audioEngine.getBusData(busId);
                const isSilent = bus ? bus.peak < 0.02 : false;

                const stateKey = `${ctx.layer.id}.${nodeId}`;
                const lastZone = this.vowelStateMap.get(stateKey) ?? 'none';
                const currentZone = isSilent ? 'none' : getVowelZone(curX, curY);

                let isVowelChange = false;
                if (currentZone !== 'none' && lastZone !== 'none' && currentZone !== lastZone) {
                  isVowelChange = true;
                }

                this.vowelStateMap.set(stateKey, currentZone);
                ctx.signalValues[`${nodeId}.vowel_change_trig`] = isVowelChange ? 1.0 : 0.0;
              }
            });
          } else if (effect.type === 'SpokenWordVisualizer') {
            pipeline.push((ctx: DispatchContext) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as SpokenWordVisualizerEffect;
              if (!ef) return;

              const edges = ctx.layer.graph?.edges || [];
              const incomingEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              const busId = incomingEdge ? (incomingEdge.fromNodeId === 'source' ? ctx.layer.id : incomingEdge.fromNodeId) : 'master';

              const speech = ctx.audioEngine.getSpeechFeatures(busId, 10, 150);
              const pitch = ctx.audioEngine.getPitchFeatures(busId, 80, 800);
              const formant = ctx.audioEngine.getFormantFeatures(busId);

              if (speech && pitch && formant) {
                ctx.signalValues[`${nodeId}.envelope_out`] = speech.envelope;
                ctx.signalValues[`${nodeId}.cadence_out`] = Math.min(1.0, speech.cadence);
                ctx.signalValues[`${nodeId}.cadence`] = Math.min(1.0, speech.cadence);
                ctx.signalValues[`${nodeId}.timbre_brightness`] = speech.timbral.centroid;
                ctx.signalValues[`${nodeId}.timbre_flatness`] = speech.timbral.flatness;
                ctx.signalValues[`${nodeId}.sibilance`] = speech.timbral.sibilance;

                ctx.signalValues[`${nodeId}.pitch_hz`] = pitch.hz;
                ctx.signalValues[`${nodeId}.pitch_midi`] = pitch.midi;
                ctx.signalValues[`${nodeId}.stability`] = pitch.confidence;

                ctx.signalValues[`${nodeId}.formant_f1`] = formant.f1;
                ctx.signalValues[`${nodeId}.formant_f2`] = formant.f2;
                ctx.signalValues[`${nodeId}.vowel_x`] = formant.x;
                ctx.signalValues[`${nodeId}.vowel_y`] = formant.y;

                const stateKey = `${ctx.layer.id}.${nodeId}`;

                const threshold = 0.15;
                const isSpeech = speech.envelope > threshold;
                const wasSpeech = this.speechStateMap.get(`${stateKey}.speech`) ?? false;
                
                const isOnset = speech.envelope > 0.25 && !wasSpeech;
                ctx.signalValues[`${nodeId}.onset_pulse`] = isOnset ? 1.0 : 0.0;

                ctx.signalValues[`${nodeId}.speech_trig`] = (isSpeech && !wasSpeech) ? 1.0 : 0.0;
                ctx.signalValues[`${nodeId}.silence_trig`] = (!isSpeech && wasSpeech) ? 1.0 : 0.0;
                this.speechStateMap.set(`${stateKey}.speech`, isSpeech);

                const lastNote = this.pitchStateMap.get(stateKey) ?? 0;
                let isNoteChange = false;
                if (pitch.hz > 20 && pitch.confidence > 0.4) {
                  const midiNote = 12 * Math.log2(pitch.hz / 440) + 69;
                  if (lastNote > 0 && Math.abs(midiNote - lastNote) >= 0.5) {
                    isNoteChange = true;
                  }
                  this.pitchStateMap.set(stateKey, midiNote);
                } else if (pitch.hz <= 20) {
                  this.pitchStateMap.delete(stateKey);
                }
                ctx.signalValues[`${nodeId}.note_change_trig`] = isNoteChange ? 1.0 : 0.0;

                const getVowelZone = (x: number, y: number): string => {
                  if (x < 0.5) {
                    return y >= 0.5 ? 'Oo' : 'Oh';
                  } else {
                    return y >= 0.5 ? 'Ee' : 'Ah';
                  }
                };
                const bus = ctx.audioEngine.getBusData(busId);
                const isSilent = bus ? bus.peak < 0.02 : false;
                const lastZone = this.vowelStateMap.get(stateKey) ?? 'none';
                const currentZone = isSilent ? 'none' : getVowelZone(formant.x, formant.y);
                
                let isVowelChange = false;
                if (currentZone !== 'none' && lastZone !== 'none' && currentZone !== lastZone) {
                  isVowelChange = true;
                }
                this.vowelStateMap.set(stateKey, currentZone);
                ctx.signalValues[`${nodeId}.vowel_change_trig`] = isVowelChange ? 1.0 : 0.0;
                
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
                } else if (fromEffect?.type === 'AudioTransformer' || fromEffect?.type === 'AudioFile' || fromEffect?.type === 'AudioInput' || fromEffect?.type === 'SystemAudio') {
                  busId = fromNodeId; // These node IDs are used as bus IDs
                } else if (fromNodeId === 'source' || fromEffect?.type === 'VideoFile' || fromEffect?.type === 'VideoURL') {
                  busId = fromNodeId === 'source' ? ctx.layer.id : fromNodeId;
                }
              }

              const bus = ctx.audioEngine.getBusData(busId);
              if (!bus) return;

              const smoothing = ef.smoothing ?? 0.8;
              const sensitivity = ef.sensitivity ?? 1.0;
              const stateKey = `${ctx.layer.id}.${nodeId}`;
              
              let state = this.spectralStates.get(stateKey) || { low: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };

              const updateBand = (prev: number, instant: number) => {
                const val = instant * sensitivity;
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
          } else if (effect.type === 'AudioTransformer') {
            pipeline.push((ctx: DispatchContext, dt: number) => {
              const ef = ctx.layer.effects.find(e => e.id === nodeId) as AudioTransformerEffect;
              if (!ef) return;

              // 1. Connection Management
              const edges = ctx.layer.graph?.edges || [];
              const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
              if (inputEdge) {
                const fromNodeId = inputEdge.fromNodeId;
                ctx.audioEngine.connectTransformer(nodeId, fromNodeId === 'source' ? ctx.layer.id : fromNodeId);
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
                const fromNodeId = inputEdge.fromNodeId;
                ctx.audioEngine.connectModulator(nodeId, fromNodeId === 'source' ? ctx.layer.id : fromNodeId);
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
                const fromNodeId = inputEdge.fromNodeId;
                ctx.audioEngine.connectGate(nodeId, fromNodeId === 'source' ? ctx.layer.id : fromNodeId);
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
          }
        }
      }

      const nodeEdges = edges.filter(e => e.fromNodeId === nodeId);
      nodeEdges.forEach(edge => {
        pipeline.push((ctx: DispatchContext) => {
          let rawValue = ctx.signalValues[`${edge.fromNodeId}.${edge.fromPort}`] ?? 0;
          
          if (edge.fromNodeId === 'source' && edge.fromPort === 'audio_out') {
            rawValue = ctx.audioEngine.getPeakVolume(ctx.layer.id);
          } else if (edge.signalType === 'video' || edge.toPort === 'map_in' || edge.toPort === 'video_in') {
            // Video connections carry active video streams without expensive CPU readbacks
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
            let val = rawValue;
            if (settings.bipolar) processedValue = (val * 2.0) - 1.0;
            else processedValue = val;
            processedValue *= settings.amount;

            if (settings.invert) {
              processedValue = -processedValue;
            }
          }

          if (!Number.isNaN(processedValue)) {
            const targetKey = `${edge.toNodeId}.${edge.toPort}`;
            ctx.signalValues[targetKey] = (ctx.signalValues[targetKey] ?? 0) + processedValue;
          }
        });
      });
    });

    // Final Stage: Layer Output Management (Explicit Audio Routing)
    pipeline.push((ctx) => {
      const edges = ctx.layer.graph?.edges || [];
      const audioOutEdge = edges.find(e => e.toNodeId === '__output__' && e.toPort === 'audio_in');
      if (audioOutEdge) {
        const fromId = audioOutEdge.fromNodeId;
        ctx.audioEngine.setLayerAudioTarget(ctx.layer.id, fromId === 'source' ? ctx.layer.id : fromId);
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
      this.pitchStateMap.clear();
      this.vowelStateMap.clear();
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
}
