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
  });
});
