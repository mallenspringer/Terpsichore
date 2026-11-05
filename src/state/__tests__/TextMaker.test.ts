import { describe, it, expect, beforeEach } from 'vitest';
import { useEngineStore } from '../store';
import { SignalDispatcher } from '../SignalDispatcher';
import { createDefaultEffect, createDefaultSource } from '../moduleFactory';
import { TextMakerEffect, TextCueSource } from '../types';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { TextMakerRenderer } from '../../renderer/TextMakerRenderer';
import { calculatePalettePositions } from '../../renderer/Renderer';
import { buildAutoEdges } from '../graphUtils';
import { ALL_MODULES } from '../../components/ModuleCatalog/moduleRegistry';

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

describe('TextMaker (Analog Video Character Generator) Module', () => {
  beforeEach(() => {
    const defaultCue = createDefaultSource('TextCue') as TextCueSource;
    const textMaker = createDefaultEffect('TextMaker', 'tm-1') as TextMakerEffect;

    useEngineStore.setState({
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          opacity: 1,
          blendMode: 'normal',
          source: {
            ...defaultCue,
            currentText: 'SIGNAL TEST\nLINE TWO'
          },
          effects: [textMaker],
          modulators: {},
          graph: {
            edges: [
              {
                id: 'e-text',
                fromNodeId: 'source',
                fromPort: 'text_out',
                toNodeId: 'tm-1',
                toPort: 'text_in',
                signalType: 'text'
              }
            ]
          },
          signalValues: {}
        }
      },
      layerOrder: ['layer-1'],
      activeLayerId: 'layer-1'
    });

    const sd = SignalDispatcher.getInstance();
    sd.compileLayer(useEngineStore.getState().layers['layer-1']);
  });

  it('initializes default TextMakerEffect with transparent bgMode and analogFxMaster enabled', () => {
    const tm = createDefaultEffect('TextMaker', 'tm-init') as TextMakerEffect;
    expect(tm.type).toBe('TextMaker');
    expect(tm.bgMode).toBe('transparent');
    expect(tm.analogFxMaster).toBe(true);
    expect(tm.analogFxMode).toBe('on');
    expect(tm.transitionMode).toBe('crossfade');
    expect(tm.layoutMode).toBe('page');
    expect(tm.keyMapping).toBe('none');
    expect(tm.glowMatchTextColor).toBe(false);
    expect(tm.glowColor).toEqual([0.2, 0.7, 1.0, 1.0]);
  });

  it('exposes all required inputs (text_in, video_in, palette_in, glow_cv, shadow_cv, extrude_cv) and outputs (video_out, matte_out, text_out)', () => {
    const ports = PORT_DEFS.TextMaker;
    expect(ports).toBeDefined();
    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('text_in');
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('palette_in');
    expect(portIds).toContain('glow_cv');
    expect(portIds).toContain('shadow_cv');
    expect(portIds).toContain('extrude_cv');
    expect(portIds).toContain('pos_x_cv');
    expect(portIds).toContain('pos_y_cv');
    expect(portIds).toContain('color_cv');
    expect(portIds).toContain('wipe_trig');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');
    expect(portIds).toContain('text_out');
  });

  it('emits active signal values on video_out, matte_out, and text_out during SignalDispatcher execution', () => {
    const sd = SignalDispatcher.getInstance();
    const layer = useEngineStore.getState().layers['layer-1'];
    const signalValues: Record<string, number> = {};

    const fns = (sd as any).pipelines['layer-1'] || [];
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    expect(signalValues['tm-1.video_out']).toBe(1.0);
    expect(signalValues['tm-1.matte_out']).toBe(1.0);
    expect(signalValues['tm-1.text_out']).toBe(1.0);
  });

  it('caches 2D glyph masks and computes layout metrics and typewriter slicing', () => {
    const tm = createDefaultEffect('TextMaker', 'tm-render') as TextMakerEffect;
    const renderer = TextMakerRenderer.getInstance();

    const firstPass = renderer.renderGlyphMask('test-key', 'HEADER LINE\nBODY LINE', tm, 640, 360, 1.0);
    expect(firstPass.dirty).toBe(true);
    expect(firstPass.metrics.lineCount).toBe(2);
    expect(firstPass.metrics.bounds[2]).toBeGreaterThan(firstPass.metrics.bounds[0]);
    expect(firstPass.metrics.bounds[3]).toBeGreaterThan(firstPass.metrics.bounds[1]);

    // Second pass with identical state should hit cache (dirty: false)
    const secondPass = renderer.renderGlyphMask('test-key', 'HEADER LINE\nBODY LINE', tm, 640, 360, 1.0);
    expect(secondPass.dirty).toBe(false);

    // Typewriter mode at 50% progress should re-render (dirty: true)
    const typewriterTm: TextMakerEffect = { ...tm, transitionMode: 'typewriter', typewriterCursor: 'block' };
    const twPass = renderer.renderGlyphMask('test-key', 'HEADER LINE\nBODY LINE', typewriterTm, 640, 360, 0.5);
    expect(twPass.dirty).toBe(true);
  });

  it('computes normalized cumulative stop positions from ColorPalette weights for palette_in', () => {
    const stops = [
      { weight: 3.0, active: true },
      { weight: 1.0, active: true },
      { weight: 1.0, active: true }
    ];
    const positions = calculatePalettePositions(stops, 0);
    // Total weight span = 3 + 1 + 1 = 5.0; Stop 0 at 0.0, Stop 1 at 3/5 = 0.6, Stop 2 at 4/5 = 0.8
    expect(positions[0]).toBeCloseTo(0.0, 4);
    expect(positions[1]).toBeCloseTo(0.6, 4);
    expect(positions[2]).toBeCloseTo(0.8, 4);
  });

  it('auto-wires TextCue.text_out -> TextMaker.text_in when placed in the same layer chain', () => {
    const layer = useEngineStore.getState().layers['layer-1'];
    const autoEdges = buildAutoEdges(layer, { edges: [] });
    const textEdge = autoEdges.find(e => e.fromNodeId === 'source' && e.toNodeId === 'tm-1');
    expect(textEdge).toBeDefined();
    expect(textEdge?.fromPort).toBe('text_out');
    expect(textEdge?.toPort).toBe('text_in');
    expect(textEdge?.signalType).toBe('text');
  });

  it('registers TextMaker in Effects category with updated tags in moduleRegistry', () => {
    const entry = ALL_MODULES.find(m => m.id === 'TextMaker');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Effects');
    expect(entry?.moduleType).toBe('effect:TextMaker');
    expect(entry?.tags).toContain('effect');
    expect(entry?.tags).toContain('typography');
  });

  it('steps connected upstream TextCue card when TextMaker wipe_trig fires', () => {
    const sd = SignalDispatcher.getInstance();
    const curSrc = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    const banks = curSrc.banks.map((b, idx) => idx === 0 ? {
      ...b,
      cards: [{ id: '1', text: 'Alpha' }, { id: '2', text: 'Beta' }],
      activeCardIndex: 0
    } : b);
    useEngineStore.getState().updateLayer('layer-1', {
      source: { ...curSrc, banks } as any
    });
    const layer = useEngineStore.getState().layers['layer-1'];

    const fns = (sd as any).pipelines['layer-1'] || [];
    // Pulse wipe_trig on tm-1
    fns.forEach((fn: any) => fn({ layer, signalValues: { 'tm-1.wipe_trig': 1.0 }, audioEngine: mockAudioEngine }, 0.016));

    const updatedSource = useEngineStore.getState().layers['layer-1'].source as TextCueSource;
    // Bank 1 has 2 cards; it should have stepped from card 0 to card index 1
    expect(updatedSource.banks[0].activeCardIndex).toBe(1);
  });

  it('glowMatchTextColor delegates glow to textColor while preserving manual glowColor', () => {
    const tm = createDefaultEffect('TextMaker', 'tm-glow') as TextMakerEffect;
    // Set custom manual glow color
    tm.glowColor = [0.8, 0.2, 0.4, 1.0];
    tm.textColor = [1.0, 1.0, 0.0, 1.0];
    tm.glowMatchTextColor = true;

    const getEffectiveGlow = (ef: TextMakerEffect) =>
      ef.glowMatchTextColor ? (ef.textColor || [1, 1, 1, 1]) : (ef.glowColor || [0.2, 0.7, 1.0, 1.0]);

    expect(getEffectiveGlow(tm)).toEqual([1.0, 1.0, 0.0, 1.0]);

    // Deactivating glowMatchTextColor immediately returns to manual glowColor
    tm.glowMatchTextColor = false;
    expect(getEffectiveGlow(tm)).toEqual([0.8, 0.2, 0.4, 1.0]);
  });
  it('supports 3 analogFxModes: on, text_only, and off', () => {
    const tm = createDefaultEffect('TextMaker', 'tm-modes') as TextMakerEffect;
    expect(tm.analogFxMode).toBe('on');

    // Cycle to text_only
    const mode1: 'on' | 'text_only' | 'off' = 'text_only';
    tm.analogFxMode = mode1;
    expect(tm.analogFxMode).toBe('text_only');

    // Cycle to off
    const mode2: 'on' | 'text_only' | 'off' = 'off';
    tm.analogFxMode = mode2;
    expect(tm.analogFxMode).toBe('off');

    // Helper to compute uniform flag
    const getFxModeUniform = (ef: TextMakerEffect) => {
      const mode = ef.analogFxMode ?? (ef.analogFxMaster === false ? 'off' : 'on');
      return mode === 'off' ? 0.0 : (mode === 'text_only' ? 2.0 : 1.0);
    };

    expect(getFxModeUniform({ ...tm, analogFxMode: 'on' })).toBe(1.0);
    expect(getFxModeUniform({ ...tm, analogFxMode: 'text_only' })).toBe(2.0);
    expect(getFxModeUniform({ ...tm, analogFxMode: 'off' })).toBe(0.0);
    // Legacy boolean fallback
    expect(getFxModeUniform({ ...tm, analogFxMode: undefined, analogFxMaster: false })).toBe(0.0);
    expect(getFxModeUniform({ ...tm, analogFxMode: undefined, analogFxMaster: true })).toBe(1.0);
  });
});
