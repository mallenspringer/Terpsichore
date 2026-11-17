import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseBlackoutMarkup,
  evaluateWordTargetConcealment,
  computeWordSurvivalRank,
  BlackoutMaskEvalParams,
} from '../../utils/blackoutUtils';
import {
  stepTextCueBankBy,
  stepTextCueCardBy,
  selectTextCueBankIndex,
} from '../../utils/textCueUtils';
import { createDefaultEffect, createDefaultSource } from '../moduleFactory';
import { BlackoutPoetryEffect, TextCueSource } from '../types';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { useEngineStore } from '../store';
import { SignalDispatcher } from '../SignalDispatcher';

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
      updateStreamGate: vi.fn(),
      connectTransformer: vi.fn(),
      connectModulator: vi.fn(),
      disconnectNode: vi.fn(),
      updateTransformerNode: vi.fn(),
      updateModulatorNode: vi.fn(),
      getTransformerBus: vi.fn(),
      getTransformerOutput: vi.fn(),
      getBusData: vi.fn(),
      getAllBuses: vi.fn(() => []),
      getPeakVolume: vi.fn(() => 0),
      getSpeechFeatures: vi.fn(() => null),
      getPitchFeatures: vi.fn(() => null),
      getFormantFeatures: vi.fn(() => null),
      update: vi.fn(),
    }),
  },
}));

describe('BlackoutPoetry Markup, Masking & Dispatcher Sync', () => {
  beforeEach(() => {
    const dispatcher = SignalDispatcher.getInstance();
    (dispatcher as any).pipelines = {};
    (dispatcher as any).blackoutStates?.clear();
    (dispatcher as any).textCueStates?.clear();
    (dispatcher as any).lastTriggerVals?.clear();
    (dispatcher as any).latestSignals = {};
    Object.keys(dispatcher).forEach(key => {
      if (key.startsWith('_cache_')) delete (dispatcher as any)[key];
    });
  });

  it('parses [pinned], [[preredacted]], and escaped brackets across punctuation modes', () => {
    const src = 'The [ancient river] remembers [[secret]] \\[[Exhibit]\\] glass.';
    const tokens = parseBlackoutMarkup(src, 'attached', 7);

    expect(tokens.map(t => t.text)).toEqual([
      'The', 'ancient', 'river', 'remembers', 'secret', '[Exhibit]', 'glass.'
    ]);
    expect(tokens[0].pin).toBe('normal');
    expect(tokens[1].pin).toBe('pinned');
    expect(tokens[2].pin).toBe('pinned');
    expect(tokens[3].pin).toBe('normal');
    expect(tokens[4].pin).toBe('preredacted');
    expect(tokens[5].pin).toBe('pinned');

    const preserved = parseBlackoutMarkup('hello, world!', 'preserve', 1);
    expect(preserved.map(t => [t.text, t.pin])).toEqual([
      ['hello', 'normal'],
      [',', 'pinned'],
      ['world', 'normal'],
      ['!', 'pinned'],
    ]);

    const stripped = parseBlackoutMarkup('hello, world!', 'strip', 1);
    expect(stripped.map(t => t.text)).toEqual(['hello', 'world']);
  });

  it('evaluates entropy, spotlight, walk, glimpse flash, and bracket locks deterministically', () => {
    const tokens = parseBlackoutMarkup('a [mountain] under [[dark]] clouds', 'attached', 42);
    const baseParams: BlackoutMaskEvalParams = {
      selectionMode: 'entropy',
      density: 0.75,
      seed: 42,
      lengthBias: 0.5,
      softness: 0.25,
      invertMask: false,
      ignorePins: false,
      cursorX: 0.5,
      cursorY: 0.5,
      radius: 0.25,
      flashAmount: 0,
    };

    // Pin lock always keeps [mountain] at 0 and [[dark]] at 1 when ignorePins = false
    expect(evaluateWordTargetConcealment(tokens[1], 0.2, 0.5, tokens.length, baseParams)).toBe(0);
    expect(evaluateWordTargetConcealment(tokens[3], 0.8, 0.5, tokens.length, baseParams)).toBe(1);

    // Ignoring pins lets density/entropy act on pinned tokens
    const unpinnedRank = computeWordSurvivalRank(tokens[1], 42, 0.5);
    expect(unpinnedRank).toBeGreaterThan(0);
    expect(
      evaluateWordTargetConcealment(tokens[1], 0.2, 0.5, tokens.length, {
        ...baseParams,
        density: 0.999,
        ignorePins: true,
      })
    ).toBe(1);

    // Spatial spotlight reveals near center, conceals far periphery
    const spotParams: BlackoutMaskEvalParams = { ...baseParams, selectionMode: 'spotlight', density: 0, cursorX: 0.2, cursorY: 0.5, radius: 0.2, softness: 0.1 };
    expect(evaluateWordTargetConcealment(tokens[0], 0.2, 0.5, tokens.length, spotParams)).toBe(0);
    expect(evaluateWordTargetConcealment(tokens[4], 0.9, 0.5, tokens.length, spotParams)).toBe(1);

    // Glimpse flash lowers concealment strongly when flashAmount = 1
    const flashOff = evaluateWordTargetConcealment(tokens[0], 0.5, 0.5, tokens.length, {
      ...baseParams,
      selectionMode: 'glimpse',
      density: 0.95,
      flashAmount: 0,
    });
    const flashOn = evaluateWordTargetConcealment(tokens[0], 0.5, 0.5, tokens.length, {
      ...baseParams,
      selectionMode: 'glimpse',
      density: 0.95,
      flashAmount: 1.0,
    });
    expect(flashOff).toBe(1);
    expect(flashOn).toBe(0);
  });

  it('independently toggles TextCue cards within active bank and whole banks across grid', () => {
    const cue = createDefaultSource('TextCue') as TextCueSource;
    cue.cardLoopMode = 'bank'; // Ensure stayInBank=true keeps cards inside active bank regardless!
    cue.banks[0] = {
      ...cue.banks[0],
      cards: [{ id: 'a1', text: 'Bank1 Card1' }, { id: 'a2', text: 'Bank1 Card2' }],
      activeCardIndex: 0,
    };
    cue.banks[2] = {
      ...cue.banks[2],
      cards: [{ id: 'b1', text: 'Bank3 Card1' }],
      activeCardIndex: 0,
    };
    cue.activeBankIndex = 0;
    cue.currentText = 'Bank1 Card1';

    // Stepping card twice stays inside Bank 0 and wraps back to Card 0
    const s1 = { ...cue, ...stepTextCueCardBy(cue, 1, true) };
    expect(s1.activeBankIndex).toBe(0);
    expect(s1.currentText).toBe('Bank1 Card2');

    const s2 = { ...s1, ...stepTextCueCardBy(s1, 1, true) };
    expect(s2.activeBankIndex).toBe(0);
    expect(s2.currentText).toBe('Bank1 Card1');

    // Stepping whole bank moves to populated Bank 2 independently
    const b1 = { ...s2, ...stepTextCueBankBy(s2, 1) };
    expect(b1.activeBankIndex).toBe(2);
    expect(b1.currentText).toBe('Bank3 Card1');

    const bPrev = { ...b1, ...stepTextCueBankBy(b1, -1) };
    expect(bPrev.activeBankIndex).toBe(0);

    const bDirect = { ...bPrev, ...selectTextCueBankIndex(bPrev, 2) };
    expect(bDirect.activeBankIndex).toBe(2);
  });

  it('registers defaults, ports, and handles card_trig, bank_trig, entropy_trig, and flash_trig in SignalDispatcher', () => {
    const bp = createDefaultEffect('BlackoutPoetry', 'bp-1') as BlackoutPoetryEffect;
    expect(bp.stylePreset).toBe('sharpie_zine');
    expect(PORT_DEFS.BlackoutPoetry.map(p => p.id)).toEqual(
      expect.arrayContaining(['video_in', 'text_in', 'card_trig', 'bank_trig', 'entropy_trig', 'flash_trig', 'video_out', 'matte_out', 'survivor_cv', 'reroll_out'])
    );

    const cue = createDefaultSource('TextCue') as TextCueSource;
    cue.banks[0] = {
      ...cue.banks[0],
      cards: [{ id: 'c1', text: 'One' }, { id: 'c2', text: 'Two' }],
      activeCardIndex: 0,
    };
    cue.banks[1] = {
      ...cue.banks[1],
      cards: [{ id: 'c3', text: 'Three' }],
      activeCardIndex: 0,
    };
    cue.activeBankIndex = 0;
    cue.currentText = 'One';

    // Drive triggers using TriggerPad modulators patched into card_trig / bank_trig / entropy_trig / flash_trig
    const makePad = () => ({ type: 'TriggerPad', isPressed: false, useEnvelope: false, attack: 0.01, release: 0.1 } as any);

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: cue,
          effects: [bp],
          modulators: {
            'pad-card': makePad(),
            'pad-bank': makePad(),
            'pad-ent': makePad(),
            'pad-flash': makePad(),
          },
          graph: {
            edges: [
              { id: 'e-text', fromNodeId: 'source', fromPort: 'text_out', toNodeId: 'bp-1', toPort: 'text_in', signalType: 'text' },
              { id: 'e-card', fromNodeId: 'pad-card', fromPort: 'trigger_out', toNodeId: 'bp-1', toPort: 'card_trig', signalType: 'trigger' },
              { id: 'e-bank', fromNodeId: 'pad-bank', fromPort: 'trigger_out', toNodeId: 'bp-1', toPort: 'bank_trig', signalType: 'trigger' },
              { id: 'e-ent', fromNodeId: 'pad-ent', fromPort: 'trigger_out', toNodeId: 'bp-1', toPort: 'entropy_trig', signalType: 'trigger' },
              { id: 'e-flash', fromNodeId: 'pad-flash', fromPort: 'trigger_out', toNodeId: 'bp-1', toPort: 'flash_trig', signalType: 'trigger' },
            ],
            disconnectedPorts: [],
          },
          signalValues: {},
          inputSettings: {},
        },
      },
      layerOrder: ['layer-1'],
    });

    const dispatcher = SignalDispatcher.getInstance();
    dispatcher.execute(true);

    // Trigger independent Card advance
    useEngineStore.getState().updateModulatorGlobal('pad-card', { isPressed: true });
    dispatcher.execute(true);
    let layer = useEngineStore.getState().layers['layer-1'];
    expect((layer.source as TextCueSource).activeBankIndex).toBe(0);
    expect((layer.source as TextCueSource).currentText).toBe('Two');

    // Trigger independent Bank advance
    useEngineStore.getState().updateModulatorGlobal('pad-bank', { isPressed: true });
    dispatcher.execute(true);
    layer = useEngineStore.getState().layers['layer-1'];
    expect((layer.source as TextCueSource).activeBankIndex).toBe(1);
    expect((layer.source as TextCueSource).currentText).toBe('Three');

    // Trigger entropy seed reroll + flash impulse
    const initialSeed = (layer.effects.find(e => e.id === 'bp-1') as BlackoutPoetryEffect).seed;
    useEngineStore.getState().updateModulatorGlobal('pad-ent', { isPressed: true });
    useEngineStore.getState().updateModulatorGlobal('pad-flash', { isPressed: true });
    dispatcher.execute(true);
    layer = useEngineStore.getState().layers['layer-1'];
    const updatedBp = layer.effects.find(e => e.id === 'bp-1') as BlackoutPoetryEffect;
    expect(updatedBp.seed).toBe(initialSeed + 1);
    expect(layer.signalValues?.['bp-1.reroll_out']).toBe(1.0);
    expect(dispatcher.getBlackoutRuntime('layer-1', 'bp-1')?.flashEnvelope).toBe(1.0);
  });

  it('progresses card density from floor to ceiling, modulates wordDurationMs via CV, and resets on card change', () => {
    const cue = createDefaultSource('TextCue') as TextCueSource;
    cue.banks[0] = {
      ...cue.banks[0],
      cards: [{ id: 'c1', text: 'First poem block' }, { id: 'c2', text: 'Second poem block' }],
      activeCardIndex: 0,
    };
    cue.activeBankIndex = 0;
    cue.currentText = 'First poem block';

    const bp = createDefaultEffect('BlackoutPoetry', 'bp-ramp') as BlackoutPoetryEffect;
    bp.rampMode = 'once';
    bp.rampFloor = 0.1;
    bp.rampCeiling = 0.9;
    bp.rampDurationSec = 1.0;
    bp.wordDurationMs = 300;
    bp.resetOnCardChange = true;

    const lfoDur = { type: 'LFO', waveform: 'square', frequency: 0, amplitude: 0.5, offset: 0, bipolar: false } as any;
    const lfoBip = { type: 'LFO', waveform: 'sine', frequency: 0, amplitude: 1.0, offset: 0, bipolar: true } as any;
    const padCard = { type: 'TriggerPad', isPressed: false, useEnvelope: false, attack: 0.01, release: 0.1 } as any;

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: cue,
          effects: [bp],
          modulators: { 'lfo-dur': lfoDur, 'lfo-bip': lfoBip, 'pad-card': padCard },
          graph: {
            edges: [
              { id: 'e-text', fromNodeId: 'source', fromPort: 'text_out', toNodeId: 'bp-ramp', toPort: 'text_in', signalType: 'text' },
              { id: 'e-dur', fromNodeId: 'lfo-dur', fromPort: 'modulation_out', toNodeId: 'bp-ramp', toPort: 'word_dur_cv', signalType: 'modulation' },
              { id: 'e-card', fromNodeId: 'pad-card', fromPort: 'trigger_out', toNodeId: 'bp-ramp', toPort: 'card_trig', signalType: 'trigger' },
            ],
            disconnectedPorts: [],
          },
          signalValues: {},
          inputSettings: {},
        },
      },
      layerOrder: ['layer-1'],
    });

    const dispatcher = SignalDispatcher.getInstance();
    // Square wave at phase 0 = 1.0 -> scaled by amplitude 0.5 = 0.5 -> wordDurationMs = 300 + 0.5 * 1500 = 1050ms
    (dispatcher as any).lastTime = performance.now() - 500;
    dispatcher.execute(true);

    // LFO with bipolar: true at sine(0) has val=0.5 -> 0.5 * 2 - 1 = 0.0; saw(0) has val=0 -> -1.0
    expect(useEngineStore.getState().layers['layer-1'].signalValues?.['lfo-bip.modulation_out']).toBeCloseTo(0.0, 4);
    useEngineStore.getState().updateModulatorGlobal('lfo-bip', { waveform: 'saw' });
    (dispatcher as any).lastTime = performance.now();
    dispatcher.execute(true);
    expect(useEngineStore.getState().layers['layer-1'].signalValues?.['lfo-bip.modulation_out']).toBeCloseTo(-1.0, 4);

    let rt = dispatcher.getBlackoutRuntime('layer-1', 'bp-ramp');
    expect(rt?.wordDurationMs).toBeCloseTo(1050, 0);
    expect(rt?.rampProgress).toBeGreaterThan(0.35);
    expect(rt?.rampProgress).toBeLessThan(0.75);
    expect(rt?.progressiveDensity).toBeGreaterThan(0.35);

    // Advance 600ms more -> crosses 1.0 ceiling and emits ramp_done_out pulse
    (dispatcher as any).lastTime = performance.now() - 600;
    dispatcher.execute(true);
    rt = dispatcher.getBlackoutRuntime('layer-1', 'bp-ramp');
    expect(rt?.rampProgress).toBe(1.0);
    expect(rt?.progressiveDensity).toBeCloseTo(0.9, 4);
    expect(useEngineStore.getState().layers['layer-1'].signalValues?.['bp-ramp.ramp_done_out']).toBe(1.0);

    // Card step resets progressive sweep cleanly back near Floor for the new card
    const prevGen = rt?.textGeneration ?? 0;
    useEngineStore.getState().updateModulatorGlobal('pad-card', { isPressed: true });
    (dispatcher as any).lastTime = performance.now();
    dispatcher.execute(true);
    rt = dispatcher.getBlackoutRuntime('layer-1', 'bp-ramp');
    expect((useEngineStore.getState().layers['layer-1'].source as TextCueSource).currentText).toBe('Second poem block');
    expect(rt?.textGeneration).toBeGreaterThan(prevGen);
    expect(rt?.rampProgress).toBeLessThan(0.1);
  });
});
