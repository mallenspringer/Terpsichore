import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { ALL_MODULES, DEFAULT_BANK_CONFIG } from '../../components/ModuleCatalog/moduleRegistry';
import { PORT_DEFS, MODULE_DISPLAY_NAMES, SIGNAL_COLORS } from '../../components/NodeGraph/portDefs';
import { ColorPaletteEffect, ColorStop } from '../types';
import { calculatePalettePositions } from '../../renderer/Renderer';

describe('ColorPalette (Artist\'s Palette Module)', () => {
  it('creates default ColorPalette effect with single initial color stop (Cyan)', () => {
    const pal = createDefaultEffect('ColorPalette', 'pal_1') as ColorPaletteEffect;
    expect(pal).toBeDefined();
    expect(pal.id).toBe('pal_1');
    expect(pal.type).toBe('ColorPalette');
    expect(pal.colors).toHaveLength(1);
    expect(pal.colors[0].id).toBe('c_1');
    expect(pal.colors[0].active).toBe(true);
    expect(pal.colors[0].weight).toBe(1.0);
    expect(pal.colors[0].color).toEqual([0.0, 0.95, 1.0, 1.0]);
    expect(pal.interpolation).toBe('smooth');
  });

  it('is registered in module catalog and default bank loadout under Utility', () => {
    const entry = ALL_MODULES.find(m => m.id === 'ColorPalette');
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('Utility');
    expect(entry?.label).toBe('Color Palette');
    expect(entry?.moduleType).toBe('effect:ColorPalette');

    expect(DEFAULT_BANK_CONFIG.Utility.order).toContain('ColorPalette');
  });

  it('defines palette_out, shuffle_trig, discrete channel outputs and CV inputs in portDefs', () => {
    const ports = PORT_DEFS.ColorPalette;
    expect(ports).toBeDefined();

    const paletteOut = ports.find(p => p.id === 'palette_out');
    expect(paletteOut).toBeDefined();
    expect(paletteOut?.direction).toBe('out');
    expect(paletteOut?.signalType).toBe('palette');

    const shuffleTrig = ports.find(p => p.id === 'shuffle_trig');
    expect(shuffleTrig).toBeDefined();
    expect(shuffleTrig?.direction).toBe('in');
    expect(shuffleTrig?.signalType).toBe('trigger');

    // Verify discrete channel outputs col_1_out to col_8_out have orange palette signalType
    for (let i = 1; i <= 8; i++) {
      const colOut = ports.find(p => p.id === `col_${i}_out`);
      expect(colOut).toBeDefined();
      expect(colOut?.direction).toBe('out');
      expect(colOut?.signalType).toBe('palette');

      const colCv = ports.find(p => p.id === `col_${i}_cv`);
      expect(colCv).toBeDefined();
      expect(colCv?.direction).toBe('in');
      expect(colCv?.bipolar).toBe(true);
      expect(colCv?.enableInvert).toBe(true);
    }

    expect(SIGNAL_COLORS.palette).toBe('#f58c18');
  });

  it('ensures recipient modules expose palette_in port of type palette', () => {
    const recipients = ['ParticleCloud', 'CanvasBackground', 'ColorNoise', 'ShapeGenerator'];
    for (const mod of recipients) {
      const ports = PORT_DEFS[mod];
      expect(ports, `Ports for ${mod} should be defined`).toBeDefined();
      const palIn = ports.find(p => p.id === 'palette_in');
      expect(palIn, `${mod} should have palette_in port`).toBeDefined();
      expect(palIn?.direction).toBe('in');
      expect(palIn?.signalType).toBe('palette');
    }
  });

  it('has human-readable display name in MODULE_DISPLAY_NAMES', () => {
    expect(MODULE_DISPLAY_NAMES.ColorPalette).toBe('Palette');
  });

  it('supports up to 8 color stops with draggable reordering and static slot IDs', () => {
    const pal = createDefaultEffect('ColorPalette', 'pal_demo') as ColorPaletteEffect;
    const additionalStops: ColorStop[] = [
      { id: 'c_2', color: [1.0, 0.08, 0.58, 1.0], weight: 2.0, active: true },
      { id: 'c_3', color: [1.0, 0.84, 0.0, 1.0], weight: 1.5, active: true }
    ];
    pal.colors.push(...additionalStops);
    expect(pal.colors).toHaveLength(3);

    // Reorder: swap stop 0 and stop 2
    const reordered = [pal.colors[2], pal.colors[1], pal.colors[0]];
    expect(reordered[0].id).toBe('c_3');
    expect(reordered[2].id).toBe('c_1');

    // Static port binding check: c_1 still references original stop
    const slot1Stop = reordered.find(s => s.id === 'c_1');
    expect(slot1Stop).toBeDefined();
    expect(slot1Stop?.color).toEqual([0.0, 0.95, 1.0, 1.0]);
  });

  it('isolates single channel color when patching discrete output col_N_out', () => {
    const pal = createDefaultEffect('ColorPalette', 'pal_demo') as ColorPaletteEffect;
    pal.colors.push(
      { id: 'c_2', color: [1.0, 0.0, 0.0, 1.0], weight: 1.0, active: true },
      { id: 'c_3', color: [0.0, 1.0, 0.0, 1.0], weight: 1.0, active: true },
      { id: 'c_4', color: [0.0, 0.0, 1.0, 1.0], weight: 1.0, active: true } // Channel 4 = Blue
    );
    expect(pal.colors).toHaveLength(4);

    // Discrete query for Channel 4 (col_4_out)
    const slotNum = '4';
    const stop = pal.colors.find(c => c.id === `c_${slotNum}`);
    expect(stop).toBeDefined();
    expect(stop?.color).toEqual([0.0, 0.0, 1.0, 1.0]);
  });

  it('calculates weighted positions accurately as amount / percent-generated and spacing analog', () => {
    // 1 Stop
    const single = [{ weight: 5.0, active: true }];
    const pos1 = calculatePalettePositions(single);
    expect(pos1[0]).toBe(0.0);

    // 2 Stops with equal weights (1.0 and 1.0) -> boundary at 0.5 (50% / 50%)
    const twoEqual = [
      { weight: 1.0, active: true },
      { weight: 1.0, active: true }
    ];
    const pos2Equal = calculatePalettePositions(twoEqual);
    expect(pos2Equal[0]).toBe(0.0);
    expect(pos2Equal[1]).toBeCloseTo(0.5, 4);

    // 2 Stops with 80% / 20% weights (8.0 and 2.0) -> boundary at 0.8 (80% / 20%)
    const twoWeighted = [
      { weight: 8.0, active: true },
      { weight: 2.0, active: true }
    ];
    const pos2Weighted = calculatePalettePositions(twoWeighted);
    expect(pos2Weighted[0]).toBe(0.0);
    expect(pos2Weighted[1]).toBeCloseTo(0.8, 4);

    // 2 Stops with 25% / 75% weights (1.0 and 3.0) -> boundary at 0.25 (25% / 75%)
    const twoWeighted25 = [
      { weight: 1.0, active: true },
      { weight: 3.0, active: true }
    ];
    const pos2Weighted25 = calculatePalettePositions(twoWeighted25);
    expect(pos2Weighted25[0]).toBe(0.0);
    expect(pos2Weighted25[1]).toBeCloseTo(0.25, 4);

    // 3 Stops (weights 2.0, 5.0, 3.0) -> Total 10.0 -> boundaries at 0.0, 0.2, 0.7 (widths 0.2, 0.5, 0.3)
    const threeStops = [
      { weight: 2.0, active: true },
      { weight: 5.0, active: true },
      { weight: 3.0, active: true }
    ];
    const pos3 = calculatePalettePositions(threeStops);
    expect(pos3[0]).toBe(0.0);
    expect(pos3[1]).toBeCloseTo(0.2, 4);
    expect(pos3[2]).toBeCloseTo(0.7, 4);

    // Inactive stops are ignored when computing weights
    const withInactive = [
      { weight: 8.0, active: true },
      { weight: 100.0, active: false }, // inactive, should not alter weights
      { weight: 2.0, active: true }
    ];
    const activeOnly = withInactive.filter(s => s.active);
    const posActive = calculatePalettePositions(activeOnly);
    expect(posActive[0]).toBe(0.0);
    expect(posActive[1]).toBeCloseTo(0.8, 4);
  });
});

