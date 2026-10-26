import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { EFFECT_ROWS } from '../../components/NodeGraph/controls/effectControls';
import { AlphaAdjustWGSL } from '../../renderer/shaders/AlphaAdjust';
import { AlphaAdjustEffect } from '../types';

describe('AlphaAdjust Effect Module', () => {
  it('creates default AlphaAdjust effect with amount = 1.0 and bypass = false', () => {
    const alpha = createDefaultEffect('AlphaAdjust', 'alpha_1') as AlphaAdjustEffect;
    expect(alpha).toBeDefined();
    expect(alpha.id).toBe('alpha_1');
    expect(alpha.type).toBe('AlphaAdjust');
    expect(alpha.amount).toBe(1.0);
    expect(alpha.invertAmount).toBe(false);
    expect(alpha.bypass).toBe(false);
    expect(alpha.bypassMode).toBe('momentary');
  });

  it('defines valid ports in PORT_DEFS', () => {
    const ports = PORT_DEFS.AlphaAdjust;
    expect(ports).toBeDefined();

    const videoIn = ports.find(p => p.id === 'video_in');
    expect(videoIn).toBeDefined();
    expect(videoIn?.direction).toBe('in');
    expect(videoIn?.signalType).toBe('video');

    const amountCv = ports.find(p => p.id === 'amount_cv');
    expect(amountCv).toBeDefined();
    expect(amountCv?.direction).toBe('in');
    expect(amountCv?.signalType).toBe('modulation');
    expect(amountCv?.enableInvert).toBe(true);

    const bypassTrig = ports.find(p => p.id === 'bypass_trig');
    expect(bypassTrig).toBeDefined();
    expect(bypassTrig?.direction).toBe('in');
    expect(bypassTrig?.signalType).toBe('trigger');
    expect(bypassTrig?.enableLatch).toBe(true);

    const videoOut = ports.find(p => p.id === 'video_out');
    expect(videoOut).toBeDefined();
    expect(videoOut?.direction).toBe('out');
    expect(videoOut?.signalType).toBe('video');

    expect(MODULE_DISPLAY_NAMES.AlphaAdjust).toBe('Alpha Adjust');
  });

  it('has controls configured in EFFECT_ROWS', () => {
    const rows = EFFECT_ROWS.AlphaAdjust;
    expect(rows).toBeDefined();
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const amountRow = rows.find(r => r.id === 'amount');
    expect(amountRow).toBeDefined();

    const optionsRow = rows.find(r => r.id === 'options');
    expect(optionsRow).toBeDefined();

    const bypassModeRow = rows.find(r => r.id === 'bypassMode');
    expect(bypassModeRow).toBeDefined();
  });

  it('contains valid WGSL shader code for alpha modulation and bypass', () => {
    expect(AlphaAdjustWGSL).toContain('struct AlphaAdjustUniforms');
    expect(AlphaAdjustWGSL).toContain('uniforms.bypass > 0.5');
    expect(AlphaAdjustWGSL).toContain('color.a = clamp(color.a * uniforms.amount, 0.0, 1.0)');
  });
});
