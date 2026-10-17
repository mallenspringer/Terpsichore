import { describe, it, expect } from 'vitest';
import { createDefaultEffect } from '../moduleFactory';
import { PORT_DEFS, MODULE_DISPLAY_NAMES } from '../../components/NodeGraph/portDefs';
import { KeyMixerEffect, VideoMathEffect, PatternEffect } from '../types';

describe('Tier 4 Modules', () => {
  describe('KeyMixer', () => {
    it('creates default KeyMixer effect with valid initial configuration', () => {
      const effect = createDefaultEffect('KeyMixer', 'km_1') as KeyMixerEffect;
      expect(effect.id).toBe('km_1');
      expect(effect.type).toBe('KeyMixer');
      expect(effect.mode).toBe('chroma');
      expect(effect.threshold).toBeCloseTo(0.35);
      expect(effect.tolerance).toBeCloseTo(0.15);
      expect(effect.spillSuppression).toBeCloseTo(0.6);
      expect(effect.keyColorG).toBe(1.0);
      expect(effect.invertMask).toBe(false);
      expect(effect.blendMode).toBe('normal');
      expect(effect.outputMode).toBe('composite');
    });

    it('has all required input, output, and CV modulation ports', () => {
      const ports = PORT_DEFS.KeyMixer;
      expect(ports).toBeDefined();

      const bgIn = ports.find(p => p.id === 'bg_in');
      const fgIn = ports.find(p => p.id === 'fg_in');
      const videoOut = ports.find(p => p.id === 'video_out');
      const matteOut = ports.find(p => p.id === 'matte_out');
      const threshCv = ports.find(p => p.id === 'threshold_cv');
      const tolCv = ports.find(p => p.id === 'tolerance_cv');
      const spillCv = ports.find(p => p.id === 'spill_cv');

      expect(bgIn?.signalType).toBe('video');
      expect(fgIn?.signalType).toBe('video');
      expect(videoOut?.signalType).toBe('video');
      expect(matteOut?.signalType).toBe('video');
      expect(threshCv?.signalType).toBe('modulation');
      expect(tolCv?.signalType).toBe('modulation');
      expect(spillCv?.signalType).toBe('modulation');
    });

    it('has proper display name', () => {
      expect(MODULE_DISPLAY_NAMES.KeyMixer).toBe('Key Mixer');
    });
  });

  describe('VideoMath', () => {
    it('creates default VideoMath effect with algebraic defaults', () => {
      const effect = createDefaultEffect('VideoMath', 'vm_1') as VideoMathEffect;
      expect(effect.id).toBe('vm_1');
      expect(effect.type).toBe('VideoMath');
      expect(effect.operation).toBe('add');
      expect(effect.gainA).toBe(1.0);
      expect(effect.gainB).toBe(1.0);
      expect(effect.offset).toBe(0.0);
      expect(effect.clampOutput).toBe(true);
      expect(effect.masterGain).toBe(1.0);
    });

    it('has input ports for texture A and B, plus CV modulation ports', () => {
      const ports = PORT_DEFS.VideoMath;
      expect(ports).toBeDefined();

      const aIn = ports.find(p => p.id === 'a_in');
      const bIn = ports.find(p => p.id === 'b_in');
      const out = ports.find(p => p.id === 'video_out');
      const gainA = ports.find(p => p.id === 'gain_a_cv');
      const gainB = ports.find(p => p.id === 'gain_b_cv');
      const offset = ports.find(p => p.id === 'offset_cv');

      expect(aIn?.signalType).toBe('video');
      expect(bIn?.signalType).toBe('video');
      expect(out?.signalType).toBe('video');
      expect(gainA?.signalType).toBe('modulation');
      expect(gainB?.signalType).toBe('modulation');
      expect(offset?.signalType).toBe('modulation');
    });

    it('has proper display name', () => {
      expect(MODULE_DISPLAY_NAMES.VideoMath).toBe('Video Math');
    });
  });

  describe('Pattern Refinements (Radial & Dynamics Engine)', () => {
    it('creates Pattern with radial and dynamics parameters', () => {
      const effect = createDefaultEffect('Pattern', 'pat_1') as PatternEffect;
      expect(effect.mode).toBe('grid');
      expect(effect.radialRings).toBe(4);
      expect(effect.radialSegments).toBe(8);
      expect(effect.tileRotation).toBe(0);
      expect(effect.jitter).toBe(0);
      expect(effect.distortAmount).toBe(0);
    });

    it('has UV distortion port and dynamic CV modulation ports in PORT_DEFS', () => {
      const ports = PORT_DEFS.Pattern;
      expect(ports).toBeDefined();

      const distort = ports.find(p => p.id === 'uv_distort_in');
      const rot = ports.find(p => p.id === 'rotation_cv');
      const jitter = ports.find(p => p.id === 'jitter_cv');
      const rings = ports.find(p => p.id === 'rings_cv');

      expect(distort?.signalType).toBe('video');
      expect(rot?.signalType).toBe('modulation');
      expect(jitter?.signalType).toBe('modulation');
      expect(rings?.signalType).toBe('modulation');
    });
  });
});
