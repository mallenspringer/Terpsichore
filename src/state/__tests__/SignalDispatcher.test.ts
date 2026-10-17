import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignalDispatcher } from '../SignalDispatcher';
import { useEngineStore } from '../store';
import { AnySource, AnyEffect } from '../types';
import { MidiManager } from '../MidiManager';

// Mock AudioEngine to avoid AudioContext issues in Node/jsdom
vi.mock('../AudioEngine', () => ({
  AudioEngine: {
    getInstance: () => ({
      context: { currentTime: 0 },
      resume: vi.fn(),
      registerMediaElement: vi.fn(),
      registerStream: vi.fn(),
      unregisterMediaElement: vi.fn(),
      setModuleMute: vi.fn(),
      setLayerMute: vi.fn(),
      setMasterMute: vi.fn(),
      setLayerAudioTarget: vi.fn(),
      connectTransformer: vi.fn(),
      connectModulator: vi.fn(),
      disconnectNode: vi.fn(),
      updateTransformerNode: vi.fn(),
      updateModulatorNode: vi.fn(),
      getTransformerBus: vi.fn(),
      getTransformerOutput: vi.fn(),
      getBusData: vi.fn(),
      getAllBuses: vi.fn(() => []),
      getPeakVolume: vi.fn(() => 0.5),
      getSpeechFeatures: vi.fn(() => ({ envelope: 0.75, cadence: 0.5, timbral: { centroid: 3200, flatness: 0.15, sibilance: 0.08 } })),
      getPitchFeatures: vi.fn(() => ({ hz: 261.63, midi: 0.5, confidence: 0.95 })),
      getFormantFeatures: vi.fn(() => ({ f1: 520, f2: 1600, x: 0.45, y: 0.55 })),
      update: vi.fn()
    })
  }
}));

describe('SignalDispatcher', () => {
  beforeEach(() => {
    // Reset SignalDispatcher singleton state
    const dispatcher = SignalDispatcher.getInstance();
    (dispatcher as any).pipelines = {};
    Object.keys(dispatcher).forEach(key => {
      if (key.startsWith('_cache_')) delete (dispatcher as any)[key];
    });

    // Reset store state before each test
    // Manual reset since we don't have a reset action yet
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
      activeLayerId: 'layer_1',
      interLayerEdges: []
    });
  });

  it('should propagate signal from source to effect', () => {
    const state = useEngineStore.getState();

    // 1. Setup a ShapeGenerator source and a Transform2D effect
    const source: AnySource = {
      type: 'ShapeGenerator',
      shapeType: 'polygon',
      fillColor: [1, 1, 1, 1],
      x: 0, y: 0, scale: 1.0,
      sides: 4, roundness: 0, convexity: 0, rotation: 0, strokeWidth: 0,
      strokeMode: 'classic', strokeThreshold: 0.1,
      edgeSoftness: 0.1
    };
    const effect: AnyEffect = {
      id: 'effect_1',
      type: 'Transform2D',
      translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, spin: 0
    };

    state.updateLayer('layer_1', {
      source,
      effects: [effect],
      graph: {
        edges: [
          {
            id: 'edge_1',
            fromNodeId: 'source',
            fromPort: 'video_out',
            toNodeId: 'effect_1',
            toPort: 'video_in',
            signalType: 'video',
            isAuto: false
          }
        ],
        disconnectedPorts: []
      }
    });

    // 2. Run dispatcher
    const dispatcher = SignalDispatcher.getInstance();
    // We need to bypass the 100ms throttle for testing
    // or just call execute() directly multiple times
    dispatcher.execute(true);

    // 3. Verify signal values
    const updatedLayer = useEngineStore.getState().layers['layer_1'];
    // The source output should be 1.0 (active)
    expect(updatedLayer.signalValues?.['source.video_out']).toBe(1);
    // The effect input should have received the signal
    expect(updatedLayer.signalValues?.['effect_1.video_in']).toBe(1);
  });

  it('should handle modulation routing', () => {
    const state = useEngineStore.getState();

    // Setup an LFO modulating an effect parameter
    const lfo = {
      type: 'LFO',
      waveform: 'sine',
      frequency: 0,
      amplitude: 1.0,
      offset: 0.25,
      bipolar: false,
      value: 0.75 // Manually set a value for the test
    };

    state.updateLayer('layer_1', {
      modulators: { 'lfo_1': lfo as any },
      effects: [{ id: 'effect_1', type: 'ColorAdjust', hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false }],
      graph: {
        edges: [
          {
            id: 'mod_edge',
            fromNodeId: 'lfo_1',
            fromPort: 'modulation_out',
            toNodeId: 'effect_1',
            toPort: 'hue',
            signalType: 'modulation',
            isAuto: false
          }
        ],
        disconnectedPorts: []
      }
    });

    SignalDispatcher.getInstance().execute(true);

    const updatedLayer = useEngineStore.getState().layers['layer_1'];
    // LFO value should be 0.75
    expect(updatedLayer.signalValues?.['lfo_1.modulation_out']).toBe(0.75);
    // Effect hue port should receive 0.75
    expect(updatedLayer.signalValues?.['effect_1.hue']).toBe(0.75);
  });

  it('should handle MIDI input modulator routing', () => {
    const state = useEngineStore.getState();

    const midiMod = {
      type: 'MidiInput',
      channel: 'all',
      ccNumber: 7,
      clockDivision: '1/4'
    };

    state.updateLayer('layer_1', {
      modulators: { 'midi_1': midiMod as any },
      effects: [{ id: 'effect_1', type: 'ColorAdjust', hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false }],
      graph: {
        edges: [
          {
            id: 'cc_edge',
            fromNodeId: 'midi_1',
            fromPort: 'cc_out',
            toNodeId: 'effect_1',
            toPort: 'brightness',
            signalType: 'modulation',
            isAuto: false
          },
          {
            id: 'note_edge',
            fromNodeId: 'midi_1',
            fromPort: 'note_out',
            toNodeId: 'effect_1',
            toPort: 'hue',
            signalType: 'modulation',
            isAuto: false
          }
        ],
        disconnectedPorts: []
      }
    });

    const midiMgr = MidiManager.getInstance();
    
    // Note On channel 1, note C4 (60), velocity 100
    midiMgr.handleMidiMessage(new Uint8Array([0x90, 60, 100]));
    // CC channel 1, controller 7, value 64
    midiMgr.handleMidiMessage(new Uint8Array([0xb0, 7, 64]));

    (SignalDispatcher.getInstance() as any).pipelines = {};
    SignalDispatcher.getInstance().execute(true);

    const updatedLayer = useEngineStore.getState().layers['layer_1'];

    // C4 note is 60. Normalized pitch is (60 - 24)/96 = 36/96 = 0.375
    expect(updatedLayer.signalValues?.['midi_1.note_out']).toBe(0.375);
    // CC value is 64/127 = 0.503937...
    expect(updatedLayer.signalValues?.['midi_1.cc_out']).toBeCloseTo(0.5039, 3);
    
    expect(updatedLayer.signalValues?.['effect_1.hue']).toBe(0.375);
    expect(updatedLayer.signalValues?.['effect_1.brightness']).toBeCloseTo(0.5039, 3);
  });

  it('should handle unipolar and bipolar inversion in input settings', () => {
    const state = useEngineStore.getState();

    const lfo = {
      type: 'LFO',
      waveform: 'sine',
      frequency: 0,
      amplitude: 1.0,
      offset: 0.25,
      bipolar: false,
      value: 0.75
    };

    // 1. Test unipolar mode with invert = true
    state.updateLayer('layer_1', {
      modulators: { 'lfo_1': lfo as any },
      effects: [{ id: 'effect_1', type: 'ColorAdjust', hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false }],
      inputSettings: {
        'effect_1.hue': { amount: 1.0, bipolar: false, invert: true }
      },
      graph: {
        edges: [
          {
            id: 'mod_edge',
            fromNodeId: 'lfo_1',
            fromPort: 'modulation_out',
            toNodeId: 'effect_1',
            toPort: 'hue',
            signalType: 'modulation',
            isAuto: false
          }
        ],
        disconnectedPorts: []
      }
    });

    SignalDispatcher.getInstance().execute(true);
    let updatedLayer = useEngineStore.getState().layers['layer_1'];
    // 0.75 is raw, unipolar = 0.75, amount = 1.0, invert = true -> -0.75
    expect(updatedLayer.signalValues?.['effect_1.hue']).toBe(-0.75);

    // 2. Test bipolar mode with invert = true
    state.updateLayer('layer_1', {
      inputSettings: {
        'effect_1.hue': { amount: 1.0, bipolar: true, invert: true }
      }
    });
    // Invalidate pipeline cache
    (SignalDispatcher.getInstance() as any).pipelines = {};
    SignalDispatcher.getInstance().execute(true);
    updatedLayer = useEngineStore.getState().layers['layer_1'];
    // 0.75 raw -> bipolar = 0.75 * 2 - 1 = 0.5, amount = 1.0, invert = true -> -0.5
    expect(updatedLayer.signalValues?.['effect_1.hue']).toBe(-0.5);

    // 3. Test bipolar mode with invert = false
    state.updateLayer('layer_1', {
      inputSettings: {
        'effect_1.hue': { amount: 1.0, bipolar: true, invert: false }
      }
    });
    (SignalDispatcher.getInstance() as any).pipelines = {};
    SignalDispatcher.getInstance().execute(true);
    updatedLayer = useEngineStore.getState().layers['layer_1'];
    // 0.75 raw -> bipolar = 0.75 * 2 - 1 = 0.5, amount = 1.0, invert = false -> 0.5
    expect(updatedLayer.signalValues?.['effect_1.hue']).toBe(0.5);
  });

  describe('MIDI Global Overrides and Learn Engine', () => {
    it('should resolve absolute and query target module IDs correctly', () => {
      const dispatcher = SignalDispatcher.getInstance();
      const layer = useEngineStore.getState().layers['layer_1'];

      // Mock layer state with source and effects
      const mockedLayer = {
        ...layer,
        source: { id: 'source_id_123', type: 'ShapeGenerator' } as any,
        effects: [
          { id: 'effect_id_rgb', type: 'ColorRGB' } as any,
          { id: 'effect_id_mixer', type: 'VideoMixer' } as any
        ]
      };

      // 1. Resolve absolute source target
      const absSourceSpec = { type: 'absolute' as const, layerId: 'layer_1', moduleId: 'source_id_123', paramId: 'scale' };
      expect(dispatcher.resolveTargetModuleId(absSourceSpec, mockedLayer)).toBe('source_id_123');

      // 2. Resolve absolute effect target
      const absEffectSpec = { type: 'absolute' as const, layerId: 'layer_1', moduleId: 'effect_id_mixer', paramId: 'v1' };
      expect(dispatcher.resolveTargetModuleId(absEffectSpec, mockedLayer)).toBe('effect_id_mixer');

      // 3. Resolve absolute non-existent target
      const absGhostSpec = { type: 'absolute' as const, layerId: 'layer_1', moduleId: 'ghost_id', paramId: 'none' };
      expect(dispatcher.resolveTargetModuleId(absGhostSpec, mockedLayer)).toBeNull();

      // 4. Resolve query module target
      const querySpec = { type: 'query' as const, layerId: 'layer_1', moduleType: 'ColorRGB', index: 0, paramId: 'r' };
      expect(dispatcher.resolveTargetModuleId(querySpec, mockedLayer)).toBe('effect_id_rgb');
    });

    it('should override baseline values on execute when MIDI bindings are active', () => {
      const state = useEngineStore.getState();
      const dispatcher = SignalDispatcher.getInstance();
      const midiMgr = MidiManager.getInstance();

      // Clear any previous bindings
      state.setMidiLearnTarget(null);
      useEngineStore.setState({ midiBindings: [] });

      // Configure a ColorAdjust effect in the layer
      state.updateLayer('layer_1', {
        source: { id: 'source_id', type: 'None' } as any,
        effects: [
          { id: 'effect_adjust_1', type: 'ColorAdjust', hue: 100, saturation: 1.0, contrast: 1.0, brightness: 0, invert: false }
        ]
      });

      // Bind MIDI CC 7 on channel 1 to saturation parameter
      const bindingSat = {
        id: 'bind_sat_123',
        type: 'parameter' as const,
        target: { type: 'absolute' as const, layerId: 'layer_1', moduleId: 'effect_adjust_1', paramId: 'saturation' },
        midiSource: { channel: 1, ccNumber: 7 },
        range: [0, 2] as [number, number],
        invert: false
      };

      // Bind MIDI Note 60 on channel 2 to brightness parameter (range [-1, 1])
      const bindingBright = {
        id: 'bind_bright_123',
        type: 'parameter' as const,
        target: { type: 'absolute' as const, layerId: 'layer_1', moduleId: 'effect_adjust_1', paramId: 'brightness' },
        midiSource: { channel: 2, noteNumber: 60 },
        range: [-1, 1] as [number, number],
        invert: true
      };

      useEngineStore.setState({ midiBindings: [bindingSat, bindingBright] });

      // Mock incoming MIDI: CC 7 to half value (64/127 = 0.503937...) -> Saturation should override to ~1.0078
      midiMgr.handleMidiMessage(new Uint8Array([0xb0, 7, 64]));

      // Mock Note On: Note 60 velocity 127 on channel 2 (0x91 = Note On, Ch 2) -> velocity = 1.0. 
      // Invert is true, so range [-1, 1] goes to -1.0
      midiMgr.handleMidiMessage(new Uint8Array([0x91, 60, 127]));

      // Run execution cycle
      dispatcher.execute(true);

      // Saturate override check
      const satVal = dispatcher.getMidiOverride('layer_1', 'effect_adjust_1', 'saturation');
      expect(satVal).toBeCloseTo(1.0078, 3);

      // Brightness override check
      const brightVal = dispatcher.getMidiOverride('layer_1', 'effect_adjust_1', 'brightness');
      expect(brightVal).toBe(-1.0);
    });

    it('should extract and dispatch vocal and speech features for SpokenWordVisualizer', () => {
      const state = useEngineStore.getState();
      const dispatcher = SignalDispatcher.getInstance();

      state.updateLayer('layer_1', {
        source: { type: 'AudioInput', deviceId: 'default' } as any,
        effects: [
          {
            id: 'spoken_1',
            type: 'SpokenWordVisualizer',
            layerId: 'layer_1',
            renderMode: 'Constellation',
            colorPalette: 'vibrant'
          }
        ]
      });

      dispatcher.compileLayer(useEngineStore.getState().layers['layer_1']);
      dispatcher.execute(true);

      const signals = dispatcher.getLatestSignals('layer_1');
      expect(signals['spoken_1.envelope_out']).toBe(0.75);
      expect(signals['spoken_1.pitch_hz']).toBe(261.63);
      expect(signals['spoken_1.formant_f1']).toBe(520);
      expect(signals['spoken_1.vowel_x']).toBe(0.45);
      expect(signals['spoken_1.video_out']).toBe(1.0);
    });
  });
});
