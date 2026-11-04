import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../store';
import { SignalDispatcher } from '../SignalDispatcher';
import { MidiManager } from '../MidiManager';
import { createDefaultSource } from '../moduleFactory';
import { TextCueSource } from '../types';
import { parseTxtContentToStrings, createTextCueCards, MAX_CARDS_PER_BANK, stepTextCueCard, stepTextCueBank } from '../../utils/textCueUtils';

// Mock AudioEngine for SignalDispatcher
const mockAudioEngine = {
  getPeakVolume: () => 0,
  setLayerAudioTarget: () => {},
  getBusData: () => ({
    peak: 0,
    rms: 0,
    onset: false,
    bands: { bass: 0, mid: 0, high: 0, low: 0, lowMid: 0, midGranular: 0, highMid: 0, highGranular: 0 }
  })
} as any;

describe('TextCue Module & SignalDispatcher Integration', () => {
  beforeEach(() => {
    const defaultCue = createDefaultSource('TextCue') as TextCueSource;

    // Populate Bank 1 (index 0) with 3 cards, Bank 3 (index 2) with 2 cards
    const banks = defaultCue.banks.map((b, idx) => {
      if (idx === 0) {
        return {
          ...b,
          cards: [
            { id: 'c-1-1', text: 'Alpha' },
            { id: 'c-1-2', text: 'Beta' },
            { id: 'c-1-3', text: 'Gamma' }
          ],
          activeCardIndex: 0
        };
      }
      if (idx === 2) {
        return {
          ...b,
          cards: [
            { id: 'c-3-1', text: 'Delta' },
            { id: 'c-3-2', text: 'Epsilon' }
          ],
          activeCardIndex: 0
        };
      }
      return b;
    });

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: {
            ...defaultCue,
            banks,
            activeBankIndex: 0,
            currentText: 'Alpha'
          },
          effects: [],
          modulators: {},
          graph: { edges: [] },
          signalValues: {}
        }
      },
      layerOrder: ['layer-1'],
      activeLayerId: 'layer-1'
    });

    const sd = SignalDispatcher.getInstance();
    (sd as any).textCueStates.clear();
    (sd as any).lastTriggerVals.clear();
    sd.compileLayer(useEngineStore.getState().layers['layer-1']);
  });

  it('initializes default TextCue source with 24 banks, bankGridMode 8, and bankSkipEmpty true', () => {
    const src = createDefaultSource('TextCue') as TextCueSource;
    expect(src.type).toBe('TextCue');
    expect(src.bankGridMode).toBe('8');
    expect(src.banks).toHaveLength(24);
    expect(src.bankSkipEmpty).toBe(true);
    expect(src.bankPlaybackOrder).toBe('in_order');
  });

  it('steps activeCardIndex on card_trig rising edge and emits gate_out pulse and transition metadata', () => {
    const sd = SignalDispatcher.getInstance();
    const layer = useEngineStore.getState().layers['layer-1'];
    const signalValues: Record<string, number> = {
      'source.card_trig': 1.0
    };

    const fns = (sd as any).pipelines['layer-1'] || [];
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    const updatedSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(updatedSource.banks[0].activeCardIndex).toBe(1);
    expect(updatedSource.currentText).toBe('Beta');
    expect(updatedSource.prevText).toBe('Alpha');
    expect(updatedSource.stepCount).toBe(1);
    expect(signalValues['source.gate_out']).toBe(1.0);
    expect(signalValues['source.text_out']).toBe(1.0);
  });

  it('loops back to card 0 in loop mode and stops at last card in stop mode', () => {
    const sd = SignalDispatcher.getInstance();

    // Advance to index 2 ('Gamma')
    useEngineStore.getState().updateLayer('layer-1', {
      source: {
        ...(useEngineStore.getState().layers['layer-1'].source as TextCueSource),
        banks: (useEngineStore.getState().layers['layer-1'].source as TextCueSource).banks.map((b, i) =>
          i === 0 ? { ...b, activeCardIndex: 2, loopMode: 'loop' } : b
        ),
        currentText: 'Gamma'
      }
    });

    let layer = useEngineStore.getState().layers['layer-1'];
    const fns = (sd as any).pipelines['layer-1'] || [];

    // Trigger rising edge -> should wrap to 0 ('Alpha')
    fns.forEach((fn: any) => fn({ layer, signalValues: { 'source.card_trig': 1.0 }, audioEngine: mockAudioEngine }, 0.016));
    let updatedSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(updatedSource.banks[0].activeCardIndex).toBe(0);
    expect(updatedSource.currentText).toBe('Alpha');

    // Reset trigger low
    layer = useEngineStore.getState().layers['layer-1'];
    fns.forEach((fn: any) => fn({ layer, signalValues: { 'source.card_trig': 0.0 }, audioEngine: mockAudioEngine }, 0.016));

    // Set Bank 1 to stop mode at index 2
    useEngineStore.getState().updateLayer('layer-1', {
      source: {
        ...(useEngineStore.getState().layers['layer-1'].source as TextCueSource),
        banks: (useEngineStore.getState().layers['layer-1'].source as TextCueSource).banks.map((b, i) =>
          i === 0 ? { ...b, activeCardIndex: 2, loopMode: 'stop' } : b
        ),
        currentText: 'Gamma'
      }
    });

    layer = useEngineStore.getState().layers['layer-1'];
    fns.forEach((fn: any) => fn({ layer, signalValues: { 'source.card_trig': 1.0 }, audioEngine: mockAudioEngine }, 0.016));
    updatedSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(updatedSource.banks[0].activeCardIndex).toBe(2);
  });

  it('skips empty banks on bank_trig when bankSkipEmpty is true, and supports bank order shuffle', () => {
    const sd = SignalDispatcher.getInstance();
    const fns = (sd as any).pipelines['layer-1'] || [];

    // Bank 0 and Bank 2 are populated; Bank 1 is empty
    const layer = useEngineStore.getState().layers['layer-1'];
    fns.forEach((fn: any) => fn({ layer, signalValues: { 'source.bank_trig': 1.0 }, audioEngine: mockAudioEngine }, 0.016));

    const updatedSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(updatedSource.activeBankIndex).toBe(2);
    expect(updatedSource.currentText).toBe('Delta');

    // Test bankPlaybackOrder: 'shuffle' between populated banks (0 and 2)
    useEngineStore.getState().updateLayer('layer-1', {
      source: {
        ...updatedSource,
        bankPlaybackOrder: 'shuffle'
      }
    });

    const layer2 = useEngineStore.getState().layers['layer-1'];
    fns.forEach((fn: any) => fn({ layer: layer2, signalValues: { 'source.bank_trig': 0.0 }, audioEngine: mockAudioEngine }, 0.016));
    fns.forEach((fn: any) => fn({ layer: layer2, signalValues: { 'source.bank_trig': 1.0 }, audioEngine: mockAudioEngine }, 0.016));

    const shuffledSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    // Since only banks 0 and 2 are populated and we were on bank 2, shuffle must pick bank 0
    expect(shuffledSource.activeBankIndex).toBe(0);
    expect(shuffledSource.currentText).toBe('Alpha');
  });

  it('handles bank_select_cv across 24 banks when bankGridMode is 24', () => {
    const sd = SignalDispatcher.getInstance();
    const cur = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    useEngineStore.getState().updateLayer('layer-1', {
      source: {
        ...cur,
        bankGridMode: '24'
      }
    });

    const layer = useEngineStore.getState().layers['layer-1'];
    const fns = (sd as any).pipelines['layer-1'] || [];
    // 0.5 * 24 = bank index 12 (Bank 13)
    fns.forEach((fn: any) => fn({ layer, signalValues: { 'source.bank_select_cv': 0.5 }, audioEngine: mockAudioEngine }, 0.016));

    const updatedSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(updatedSource.activeBankIndex).toBe(12);
  });

  it('triggers mapped TextCue bank pads on incoming MIDI Note On messages', () => {
    const cur = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    useEngineStore.getState().updateLayer('layer-1', {
      source: {
        ...cur,
        activeBankIndex: 0,
        midiPadMappings: {
          2: { note: 64, channel: 1 } // Pad 3 (index 2) mapped to E4 (note 64) on Ch 1
        }
      }
    });

    const mgr = MidiManager.getInstance();
    mgr.isPadLearning = false;
    mgr.handleMidiMessage(new Uint8Array([0x90, 64, 100]));

    const afterFirstPress = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(afterFirstPress.activeBankIndex).toBe(2);
    expect(afterFirstPress.banks[2].activeCardIndex).toBe(0);
    expect(afterFirstPress.currentText).toBe('Delta');

    // Second press on the already-active pad steps to the next card in Bank 3
    mgr.handleMidiMessage(new Uint8Array([0x90, 64, 100]));
    const afterSecondPress = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(afterSecondPress.banks[2].activeCardIndex).toBe(1);
    expect(afterSecondPress.currentText).toBe('Epsilon');
  });

  it('parses .txt content into cards by paragraph or line and caps at 64 cards', () => {
    const paraTxt = 'First verse line 1\nFirst verse line 2\n\nSecond verse\n\nThird verse';
    const paraCards = parseTxtContentToStrings(paraTxt);
    expect(paraCards).toEqual([
      'First verse line 1\nFirst verse line 2',
      'Second verse',
      'Third verse'
    ]);

    const lineTxt = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n');
    const lineCards = parseTxtContentToStrings(lineTxt);
    expect(lineCards).toHaveLength(MAX_CARDS_PER_BANK);
    expect(lineCards[0]).toBe('Line 1');
    expect(lineCards[63]).toBe('Line 64');

    const created = createTextCueCards(lineCards, 60, MAX_CARDS_PER_BANK);
    expect(created).toHaveLength(4);
  });

  it('supports manual C Step and B Step helpers and keyboard trigger mappings', () => {
    const src = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    expect(src.keyMapping).toBe('none');
    expect(src.bankKeyMapping).toBe('none');

    // Manual Card Step (C Step) advances within Bank 1 (index 0)
    const cardPatch = stepTextCueCard(src);
    expect(cardPatch).not.toBeNull();
    expect(cardPatch?.banks?.[0].activeCardIndex).toBe(1);
    expect(cardPatch?.currentText).toBe('Beta');

    // Manual Bank Step (B Step) skips empty Bank 2 (index 1) and lands on Bank 3 (index 2)
    const bankPatch = stepTextCueBank({ ...src, ...cardPatch });
    expect(bankPatch).not.toBeNull();
    expect(bankPatch?.activeBankIndex).toBe(2);
    expect(bankPatch?.currentText).toBe('Delta');
  });

  it('steps across banks on C Step when card loop mode is set to "bank"', () => {
    const src = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    // Set Bank 1 (index 0) card loop mode to 'bank' and activeCardIndex to last card (2: 'Gamma')
    const banksWithBankLoop = src.banks.map((b, idx) =>
      idx === 0 ? { ...b, loopMode: 'bank' as const, activeCardIndex: 2 } : b
    );
    const cueAtLastCard: TextCueSource = {
      ...src,
      banks: banksWithBankLoop,
      activeBankIndex: 0,
      bankPlaybackOrder: 'in_order',
      bankSkipEmpty: true
    };

    // Stepping C Step at the last card should travel to Bank 3 (index 2), card 0 ('Delta')
    const patch = stepTextCueCard(cueAtLastCard);
    expect(patch.activeBankIndex).toBe(2);
    expect(patch.banks?.[2].activeCardIndex).toBe(0);
    expect(patch.currentText).toBe('Delta');
  });

  it('universally applies cardPlaybackOrder and cardLoopMode across all banks', () => {
    const src = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    // Set universal cardLoopMode to 'bank' at top-level on TextCueSource
    const cueWithUniversalSettings: TextCueSource = {
      ...src,
      cardLoopMode: 'bank',
      cardPlaybackOrder: 'in_order',
      activeBankIndex: 0,
      banks: src.banks.map((b, idx) => idx === 0 ? { ...b, activeCardIndex: 2 } : b)
    };

    // Universal cardLoopMode: 'bank' applies across banks
    const patch = stepTextCueCard(cueWithUniversalSettings);
    expect(patch.activeBankIndex).toBe(2);
    expect(patch.banks?.[2].activeCardIndex).toBe(0);
    expect(patch.currentText).toBe('Delta');
  });
});
