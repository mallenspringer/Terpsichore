import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultEffect,
  createDefaultSource,
  autoDistributeLumaThresholds,
  autoDistributeChromaThresholds,
  cascadeLumaThresholds,
  cascadeChromaThresholds,
  GLYPH_TEMPLATE_PACKS
} from '../moduleFactory';
import { GlyphMapEffect } from '../types';
import { PORT_DEFS } from '../../components/NodeGraph/portDefs';
import { ALL_MODULES } from '../../components/ModuleCatalog/moduleRegistry';
import { GlyphMapRenderer } from '../../renderer/GlyphMapRenderer';
import { SignalDispatcher } from '../SignalDispatcher';
import { useEngineStore } from '../store';

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

describe('GlyphMap (ASCII Synthesis & Typographic Cel-Shading) Module', () => {
  beforeEach(() => {
    useEngineStore.setState({
      layers: {},
      activeLayerId: 'layer-1'
    });
  });

  it('initializes default GlyphMapEffect with 4 layers, luma mapMode, density templatePack, and raw_char wrapMode', () => {
    const ef = createDefaultEffect('GlyphMap', 'test-glyph-1') as GlyphMapEffect;

    expect(ef.id).toBe('test-glyph-1');
    expect(ef.type).toBe('GlyphMap');
    expect(ef.bands).toHaveLength(4);
    expect(ef.mapMode).toBe('luma');
    expect(ef.templatePack).toBe('density');
    expect(ef.wrapMode).toBe('raw_char');
    expect(ef.cellSize).toBe(16);
    expect(ef.fontFamily).toBe('VT323');
    expect(ef.autoScroll).toBe(false);
    expect(ef.colorMode).toBe('layer_palette');
    expect(ef.bgMode).toBe('transparent');
    expect(ef.usePaletteIn).toBe(true);
    expect(ef.outlineEnabled).toBe(false);
    expect(ef.outlineWidth).toBe(2);
    expect(ef.outlineOpacity).toBe(1.0);
  });

  it('supports 2 to 8 layers with autoDistributeLumaThresholds and autoDistributeChromaThresholds', () => {
    const lumaThresh = autoDistributeLumaThresholds(4);
    expect(lumaThresh).toHaveLength(4);
    expect(lumaThresh[lumaThresh.length - 1]).toBe(255);

    const chromaThresh = autoDistributeChromaThresholds(5);
    expect(chromaThresh).toHaveLength(5);
    expect(chromaThresh[chromaThresh.length - 1]).toBe(360);
  });

  it('cascades thresholds correctly in luma and chroma waterfall modes', () => {
    const ef = createDefaultEffect('GlyphMap', 'test-glyph-2') as GlyphMapEffect;
    const initialBands = ef.bands;

    // Pull layer 1 down
    const updated = cascadeLumaThresholds(initialBands, 1, 40);
    expect(updated[1].threshold).toBe(40);
    expect(updated[0].threshold).toBeLessThan(40);
    expect(updated[updated.length - 1].threshold).toBe(255);

    // Chroma waterfall cascade
    const chromaBands = [
      { threshold: 90 },
      { threshold: 180 },
      { threshold: 270 },
      { threshold: 360 }
    ];
    const updatedChroma = cascadeChromaThresholds(chromaBands, 2, 100);
    expect(updatedChroma[2].threshold).toBe(100);
    expect(updatedChroma[1].threshold).toBeLessThan(100);
    expect(updatedChroma[3].threshold).toBe(360);
  });

  it('verifies PORT_DEFS for GlyphMap includes all video, signal, and CV ports', () => {
    const ports = PORT_DEFS.GlyphMap;
    expect(ports).toBeDefined();

    const portIds = ports.map(p => p.id);
    expect(portIds).toContain('video_in');
    expect(portIds).toContain('bands_in');
    expect(portIds).toContain('palette_in');
    expect(portIds).toContain('text_in');
    expect(portIds).toContain('style_in');
    expect(portIds).toContain('bank_trig');
    expect(portIds).toContain('cell_cv');
    expect(portIds).toContain('scroll_cv');
    expect(portIds).toContain('width_cv');
    expect(portIds).toContain('video_out');
    expect(portIds).toContain('matte_out');
  });

  it('verifies ALL_MODULES registers GlyphMap under Effects category', () => {
    const entry = ALL_MODULES.find(m => m.id === 'GlyphMap');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Glyph Map');
    expect(entry?.category).toBe('Effects');
    expect(entry?.tags).toContain('ascii');
    expect(entry?.tags).toContain('typography');
  });

  it('provides all 6 template packs with 8 characters each', () => {
    expect(GLYPH_TEMPLATE_PACKS.density).toHaveLength(8);
    expect(GLYPH_TEMPLATE_PACKS.directional).toHaveLength(8);
    expect(GLYPH_TEMPLATE_PACKS.alpha).toHaveLength(8);
    expect(GLYPH_TEMPLATE_PACKS.numeric).toHaveLength(8);
    expect(GLYPH_TEMPLATE_PACKS.symbols).toHaveLength(8);
    expect(GLYPH_TEMPLATE_PACKS.punctuation).toHaveLength(8);
  });

  it('buildLayerGrid produces continuous repeating character matrix in raw_char mode', () => {
    const renderer = GlyphMapRenderer.getInstance();
    const layerStrings = ['ABC', '123', '#', ''];
    const cols = 4;
    const rows = 2;
    const grid = renderer.buildLayerGrid(layerStrings, 'raw_char', cols, rows);

    expect(grid).toBeInstanceOf(Uint32Array);
    expect(grid.length).toBe(8 * cols * rows);

    // Layer 0: 'ABC' looping across 8 cells -> A, B, C, A, B, C, A, B
    const expectedL0 = ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B'].map(ch => ch.charCodeAt(0));
    for (let i = 0; i < 8; i++) {
      expect(grid[i]).toBe(expectedL0[i]);
    }
  });

  it('buildLayerGrid enforces newlines and stanzas in preserve_lines mode', () => {
    const renderer = GlyphMapRenderer.getInstance();
    // 2-line poem for layer 0
    const poem = "LINE1\nHI";
    const cols = 8;
    const rows = 2;
    const grid = renderer.buildLayerGrid([poem], 'preserve_lines', cols, rows);

    // Row 0: "LINE1   " (spaces fill out to 8 cols)
    expect(grid[0]).toBe('L'.charCodeAt(0));
    expect(grid[1]).toBe('I'.charCodeAt(0));
    expect(grid[2]).toBe('N'.charCodeAt(0));
    expect(grid[3]).toBe('E'.charCodeAt(0));
    expect(grid[4]).toBe('1'.charCodeAt(0));
    expect(grid[5]).toBe(' '.charCodeAt(0));
    expect(grid[6]).toBe(' '.charCodeAt(0));
    expect(grid[7]).toBe(' '.charCodeAt(0));

    // Row 1: "HI      "
    expect(grid[8]).toBe('H'.charCodeAt(0));
    expect(grid[9]).toBe('I'.charCodeAt(0));
    expect(grid[10]).toBe(' '.charCodeAt(0));
  });

  it('buildLayerGrid correctly breaks words on whitespace in word wrap mode', () => {
    const renderer = GlyphMapRenderer.getInstance();
    const phrase = "HELLO WORLD";
    const cols = 7; // "HELLO" fits, "WORLD" wraps to row 1
    const rows = 2;
    const grid = renderer.buildLayerGrid([phrase], 'word', cols, rows);

    // Row 0: "HELLO  "
    expect(grid[0]).toBe('H'.charCodeAt(0));
    expect(grid[4]).toBe('O'.charCodeAt(0));
    expect(grid[5]).toBe(' '.charCodeAt(0));

    // Row 1: "WORLD  "
    expect(grid[7]).toBe('W'.charCodeAt(0));
    expect(grid[11]).toBe('D'.charCodeAt(0));
  });

  it('getOrCreateLayerGrid caches grid buffers and flags dirty only when contents change', () => {
    const renderer = GlyphMapRenderer.getInstance();
    renderer.clearGridCache('test-node-1');

    const strings = ['ABC', 'DEF'];
    const r1 = renderer.getOrCreateLayerGrid('test-node-1', strings, 'raw_char', 10, 5);
    expect(r1.dirty).toBe(true);
    expect(r1.buffer).toBeInstanceOf(Uint32Array);

    // Identical parameters -> dirty: false and returns identical buffer reference without re-allocating
    const r2 = renderer.getOrCreateLayerGrid('test-node-1', strings, 'raw_char', 10, 5);
    expect(r2.dirty).toBe(false);
    expect(r2.buffer).toBe(r1.buffer);

    // Changed strings -> dirty: true
    const r3 = renderer.getOrCreateLayerGrid('test-node-1', ['XYZ'], 'raw_char', 10, 5);
    expect(r3.dirty).toBe(true);
    expect(r3.buffer).not.toBe(r1.buffer);

    // Changed wrapMode -> dirty: true
    const r4 = renderer.getOrCreateLayerGrid('test-node-1', ['XYZ'], 'word', 10, 5);
    expect(r4.dirty).toBe(true);

    // Changed dimensions -> dirty: true
    const r5 = renderer.getOrCreateLayerGrid('test-node-1', ['XYZ'], 'word', 20, 5);
    expect(r5.dirty).toBe(true);

    // Clear cache -> dirty: true
    renderer.clearGridCache('test-node-1');
    const r6 = renderer.getOrCreateLayerGrid('test-node-1', ['XYZ'], 'word', 20, 5);
    expect(r6.dirty).toBe(true);
  });

  it('SignalDispatcher propagates video_out and matte_out signals for GlyphMap', () => {
    const dispatcher = SignalDispatcher.getInstance();
    const gmEffect = createDefaultEffect('GlyphMap', 'glyph-test') as GlyphMapEffect;

    const layer = {
      id: 'layer-1',
      name: 'Layer 1',
      source: { type: 'ShapeGenerator', sides: 4 } as any,
      effects: [gmEffect],
      modulators: {},
      opacity: 1,
      blendMode: 'normal' as const,
      visible: true,
      muted: false,
      solo: false,
      graph: {
        edges: []
      }
    };

    useEngineStore.setState({
      layers: {
        'layer-1': layer
      }
    });

    dispatcher.compileLayer(layer as any);
    const signalValues: Record<string, number> = {};
    const fns = (dispatcher as any).pipelines['layer-1'] || [];
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    expect(signalValues['glyph-test.video_out']).toBe(1.0);
    expect(signalValues['glyph-test.matte_out']).toBe(1.0);
  });

  it('syncs bank_trig to connected TextCue and skips empty banks', () => {
    const dispatcher = SignalDispatcher.getInstance();
    const gmEffect = createDefaultEffect('GlyphMap', 'glyph-test') as GlyphMapEffect;
    const textCueSource = createDefaultSource('TextCue') as any;

    // Set bank 0 populated, bank 1 empty, bank 2 populated
    textCueSource.banks = [
      { id: 'b0', name: 'Bank 1', cards: [{ id: 'c0', text: 'CARD0' }], autoPlayback: false, playbackSpeed: 1, activeCardIndex: 0 },
      { id: 'b1', name: 'Bank 2 (Empty)', cards: [], autoPlayback: false, playbackSpeed: 1, activeCardIndex: 0 },
      { id: 'b2', name: 'Bank 3', cards: [{ id: 'c2', text: 'CARD2' }], autoPlayback: false, playbackSpeed: 1, activeCardIndex: 0 }
    ];
    textCueSource.activeBankIndex = 0;
    textCueSource.bankSkipEmpty = true;

    const layer = {
      id: 'layer-cue',
      name: 'Layer Cue',
      source: textCueSource,
      effects: [gmEffect],
      modulators: {},
      opacity: 1,
      blendMode: 'normal' as const,
      visible: true,
      muted: false,
      solo: false,
      graph: {
        edges: [
          { id: 'e1', fromNodeId: 'source', fromPort: 'text_out', toNodeId: 'glyph-test', toPort: 'text_in' }
        ]
      }
    };

    useEngineStore.setState({
      layers: {
        'layer-cue': layer
      }
    });

    dispatcher.compileLayer(layer as any);
    const fns = (dispatcher as any).pipelines['layer-cue'] || [];

    // Trigger pulse on glyph-test.bank_trig
    const signalValues: Record<string, number> = {
      'glyph-test.bank_trig': 1.0
    };
    fns.forEach((fn: any) => fn({ layer, signalValues, audioEngine: mockAudioEngine }, 0.016));

    // Verify it skipped bank 1 (which is empty) and landed on bank 2 in the store
    const updatedSource = useEngineStore.getState().layers['layer-cue']?.source as any;
    expect(updatedSource.activeBankIndex).toBe(2);
  });
});
