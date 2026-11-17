import { describe, it, expect } from 'vitest';
import { LpcFormantTracker } from '../LpcFormantTracker';

describe('LpcFormantTracker', () => {
  it('should return default values for small buffer sizes', () => {
    const tracker = new LpcFormantTracker(16000);
    const smallBuffer = new Float32Array(100);
    const result = tracker.getFormants(smallBuffer);
    expect(result.f1).toBe(0);
    expect(result.f2).toBe(0);
    expect(result.x).toBe(0.5);
    expect(result.y).toBe(0.5);
  });

  it('should return default values for silence', () => {
    const tracker = new LpcFormantTracker(16000);
    const silence = new Float32Array(512).fill(0);
    const result = tracker.getFormants(silence);
    expect(result.f1).toBe(0);
    expect(result.f2).toBe(0);
    expect(result.x).toBe(0.5);
    expect(result.y).toBe(0.5);
  });

  it('should extract formant frequencies from a dual-tone signal simulating F1 and F2', () => {
    // Standard vocal analysis typically uses 8000Hz or 10000Hz sample rate for order-10 LPC,
    // but at 16000Hz, order 10-12 also works very well.
    const sampleRate = 16000;
    const tracker = new LpcFormantTracker(sampleRate);

    // Let's create an synthetic resonance signal:
    // F1 = 600 Hz (Ah-like low vowel), F2 = 1400 Hz
    const f1Target = 600;
    const f2Target = 1400;

    const buffer = new Float32Array(512);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // We add two strong carrier resonances, plus some mild high frequency roll-off
      buffer[i] = Math.sin(2 * Math.PI * f1Target * t) * 0.7 +
                  Math.sin(2 * Math.PI * f2Target * t) * 0.5 +
                  (Math.random() * 2 - 1) * 0.05; // light noise floor
    }

    const result = tracker.getFormants(buffer);

    // LPC will detect the two dominant peaks.
    // They should be in the ballpark of 600Hz and 1400Hz.
    expect(result.f1).toBeGreaterThan(400);
    expect(result.f1).toBeLessThan(800);
    
    expect(result.f2).toBeGreaterThan(1100);
    expect(result.f2).toBeLessThan(1700);

    // Normalized coordinates should be calculated correctly
    // x = (f2 - 800) / 1700
    // y = (f1 - 300) / 700
    expect(result.x).toBeGreaterThan(0.1);
    expect(result.x).toBeLessThan(0.9);
    expect(result.y).toBeGreaterThan(0.1);
    expect(result.y).toBeLessThan(0.9);
    expect(result.voiced).toBe(true);
  });

  it('should accurately track high-F2 front vowel (/i/) at 48 kHz without aliasing or Nyquist cutoff', () => {
    const sampleRate = 48000;
    const tracker = new LpcFormantTracker(sampleRate);
    const f1Target = 320;
    const f2Target = 2450;

    const buffer = new Float32Array(2048);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      buffer[i] = Math.sin(2 * Math.PI * f1Target * t) * 0.65 +
                  Math.sin(2 * Math.PI * f2Target * t) * 0.55;
    }

    const result = tracker.getFormants(buffer, 'mezzo_soprano');
    expect(result.voiced).toBe(true);
    expect(result.f1).toBeGreaterThan(220);
    expect(result.f1).toBeLessThan(450);
    expect(result.f2).toBeGreaterThan(2250);
    expect(result.f2).toBeLessThan(2650);
  });

  it('should place Oo, Oh, Ah, and Ee into distinct quadrants and resist 130Hz rumble/F0 capture', () => {
    const sampleRate = 48000;
    const synthFormants = (f1: number, f2: number, rumbleAmp = 0) => {
      const buf = new Float32Array(2048);
      for (let i = 0; i < buf.length; i++) {
        const t = i / sampleRate;
        buf[i] =
          Math.sin(2 * Math.PI * f1 * t) * 0.55 +
          Math.sin(2 * Math.PI * f2 * t) * 0.45 +
          Math.sin(2 * Math.PI * 130 * t) * rumbleAmp;
      }
      return buf;
    };

    const run = (f1: number, f2: number, rumbleAmp = 0) => {
      const tracker = new LpcFormantTracker(sampleRate);
      // Run two frames so HPF state settles cleanly as in continuous live input
      tracker.getFormants(synthFormants(f1, f2, rumbleAmp), 'universal');
      return tracker.getFormants(synthFormants(f1, f2, rumbleAmp), 'universal');
    };

    // Oo (/u/): Top-Left (low F1, low F2)
    const oo = run(320, 820, 0.8);
    expect(oo.voiced).toBe(true);
    expect(oo.x).toBeLessThan(0.5);
    expect(oo.y).toBeGreaterThanOrEqual(0.5);

    // Oh (/ɔ/ or /oʊ/): Bottom-Left (mid-open F1 ~550Hz, back F2 ~900Hz) despite strong 130Hz rumble
    const oh = run(560, 900, 0.85);
    expect(oh.voiced).toBe(true);
    expect(oh.f1).toBeGreaterThan(450);
    expect(oh.x).toBeLessThan(0.5);
    expect(oh.y).toBeLessThan(0.5);

    // Ah (/ɑ/): Bottom-Right (open F1 ~720Hz, central F2 ~1300Hz) despite strong 130Hz rumble
    const ah = run(720, 1300, 0.85);
    expect(ah.voiced).toBe(true);
    expect(ah.f1).toBeGreaterThan(580);
    expect(ah.x).toBeGreaterThanOrEqual(0.5);
    expect(ah.y).toBeLessThan(0.5);

    // Ee (/i/): Top-Right (low F1, high F2)
    const ee = run(320, 2150, 0.8);
    expect(ee.voiced).toBe(true);
    expect(ee.x).toBeGreaterThanOrEqual(0.5);
    expect(ee.y).toBeGreaterThanOrEqual(0.5);
  });
});
