import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tokenizePoetry, formatPoetryStep } from '../../utils/poetryUtils';
import { createDefaultEffect, createDefaultSource } from '../moduleFactory';
import { PoetrySequencerEffect, TextCueSource } from '../types';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { useEngineStore } from '../store';
import { SignalDispatcher } from '../SignalDispatcher';

const speechStateMock = {
  envelope: 0,
  cadence: 0,
  syllableRateHz: 0,
  syllableOnset: false,
  inSpeech: false,
  silenceDurationMs: 0,
  breathPauseTrig: false,
  resumePhraseTrig: false,
  caesuraTrig: false,
  pauseTensionCv: 0,
  timbral: { centroid: 0, flatness: 0, sibilance: 0 },
};

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
      getSpeechFeatures: vi.fn(() => ({ ...speechStateMock })),
      getPitchFeatures: vi.fn(() => ({ hz: 0, midi: 0, confidence: 0 })),
      getFormantFeatures: vi.fn(() => ({ f1: 0, f2: 0, x: 0.5, y: 0.5, voiced: false })),
      update: vi.fn(),
    }),
  },
}));

describe('PoetrySequencer & Text Tokenization', () => {
  beforeEach(() => {
    Object.assign(speechStateMock, {
      envelope: 0,
      cadence: 0,
      syllableRateHz: 0,
      syllableOnset: false,
      inSpeech: false,
      silenceDurationMs: 0,
      breathPauseTrig: false,
      resumePhraseTrig: false,
      caesuraTrig: false,
      pauseTensionCv: 0,
    });
    const dispatcher = SignalDispatcher.getInstance();
    (dispatcher as any).pipelines = {};
    (dispatcher as any).poetrySeqStates?.clear();
    (dispatcher as any).textCueStates?.clear();
    (dispatcher as any).lastTriggerVals?.clear();
    (dispatcher as any).latestSignals = {};
    Object.keys(dispatcher).forEach(key => {
      if (key.startsWith('_cache_')) delete (dispatcher as any)[key];
    });
  });

  it('tokenizes poetry into word, line, and stanza units and formats reveal modes', () => {
    const poem = 'red wire\nhums low\n\ncold glass';
    const wordTokens = tokenizePoetry(poem, 'word');
    expect(wordTokens.map(t => t.text)).toEqual(['red', 'wire', 'hums', 'low', 'cold', 'glass']);
    expect(wordTokens[1].isLineEnd).toBe(true);
    expect(wordTokens[3].isStanzaEnd).toBe(true);

    expect(formatPoetryStep(wordTokens, 2, 'single')).toBe('hums');
    expect(formatPoetryStep(wordTokens, 3, 'accumulate_line')).toBe('hums low');
    expect(formatPoetryStep(wordTokens, 3, 'accumulate_stanza')).toBe('red wire\nhums low');
    expect(formatPoetryStep(wordTokens, 5, 'accumulate_stanza')).toBe('cold glass');

    const lineTokens = tokenizePoetry(poem, 'line');
    expect(lineTokens.map(t => t.text)).toEqual(['red wire', 'hums low', 'cold glass']);

    const stanzaTokens = tokenizePoetry(poem, 'stanza');
    expect(stanzaTokens.map(t => t.text)).toEqual(['red wire\nhums low', 'cold glass']);
  });

  it('registers PoetrySequencer defaults and ports cleanly', () => {
    const ef = createDefaultEffect('PoetrySequencer', 'poetry-default') as PoetrySequencerEffect;
    expect(ef.type).toBe('PoetrySequencer');
    expect(ef.cadenceMode).toBe('breath_resume');
    const portIds = PORT_DEFS.PoetrySequencer.map(p => p.id);
    expect(portIds).toEqual(expect.arrayContaining([
      'audio_in', 'text_in', 'step_trig', 'reset_trig',
      'text_out', 'step_out', 'phrase_out', 'caesura_out', 'bank_step_out', 'cadence_cv', 'progress_cv', 'tension_cv'
    ]));
  });

  it('steps words on Approach C resumePhraseTrig and Approach A syllableOnset', () => {
    const seq = createDefaultEffect('PoetrySequencer', 'poetry-1') as PoetrySequencerEffect;
    seq.localText = 'one two three';
    seq.cadenceMode = 'breath_resume';

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: { type: 'None' },
          effects: [seq],
          modulators: {},
          graph: { edges: [], disconnectedPorts: [] },
          signalValues: {},
          inputSettings: {},
        },
      },
      layerOrder: ['layer-1'],
    });

    const dispatcher = SignalDispatcher.getInstance();
    dispatcher.execute(true);
    expect(dispatcher.getPoetrySequencerRuntime('layer-1', 'poetry-1')?.currentText).toBe('one');

    // Approach C breath resume pulse advances step 0 -> step 1
    speechStateMock.resumePhraseTrig = true;
    speechStateMock.cadence = 0.4;
    dispatcher.execute(true);
    expect(dispatcher.getPoetrySequencerRuntime('layer-1', 'poetry-1')?.currentText).toBe('two');
    expect(useEngineStore.getState().layers['layer-1'].signalValues?.['poetry-1.step_out']).toBe(1.0);

    // Switch to Approach A syllable mode and pulse syllableOnset
    useEngineStore.getState().updateEffect('layer-1', 'poetry-1', { cadenceMode: 'syllable' } as any);
    speechStateMock.resumePhraseTrig = false;
    speechStateMock.syllableOnset = true;
    dispatcher.execute(true);
    expect(dispatcher.getPoetrySequencerRuntime('layer-1', 'poetry-1')?.currentText).toBe('three');
    expect(useEngineStore.getState().layers['layer-1'].signalValues?.['poetry-1.progress_cv']).toBeCloseTo(1.0, 4);
  });

  it('supports bi-directional sync cycles with TextCue (text_out -> text_in and bank_step_out -> card_trig)', () => {
    const cue = createDefaultSource('TextCue') as TextCueSource;
    cue.banks[0].cards = [
      { id: 'c1', text: 'first card' },
      { id: 'c2', text: 'second card' },
    ];
    cue.banks[0].activeCardIndex = 0;
    cue.currentText = 'first card';

    const seq = createDefaultEffect('PoetrySequencer', 'poetry-1') as PoetrySequencerEffect;
    seq.cadenceMode = 'syllable';
    seq.endAction = 'advance_text_bank';

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: cue,
          effects: [seq],
          modulators: {},
          graph: {
            edges: [
              { id: 'e1', fromNodeId: 'source', fromPort: 'text_out', toNodeId: 'poetry-1', toPort: 'text_in', signalType: 'text' },
              { id: 'e2', fromNodeId: 'poetry-1', fromPort: 'bank_step_out', toNodeId: 'source', toPort: 'card_trig', signalType: 'trigger' },
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

    // Frame 1: Initialized on TextCue card 1 ("first")
    dispatcher.execute(true);
    expect(dispatcher.getPoetrySequencerRuntime('layer-1', 'poetry-1')?.currentText).toBe('first');

    // Frame 2: Syllable 1 -> "card"
    speechStateMock.syllableOnset = true;
    dispatcher.execute(true);
    expect(dispatcher.getPoetrySequencerRuntime('layer-1', 'poetry-1')?.currentText).toBe('card');

    // Frame 3: End of card 1 emits bank_step_out = 1.0
    speechStateMock.syllableOnset = true;
    dispatcher.execute(true);
    expect(useEngineStore.getState().layers['layer-1'].signalValues?.['poetry-1.bank_step_out']).toBe(1.0);

    // Frame 4: Feedback back-edge clocks TextCue to card 2, and PoetrySequencer resets cleanly to "second"
    speechStateMock.syllableOnset = false;
    dispatcher.execute(true);
    const layer = useEngineStore.getState().layers['layer-1'];
    expect((layer.source as TextCueSource).currentText).toBe('second card');
    expect(dispatcher.getPoetrySequencerRuntime('layer-1', 'poetry-1')?.currentText).toBe('second');
  });
});
