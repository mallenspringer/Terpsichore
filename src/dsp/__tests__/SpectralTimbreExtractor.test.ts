import { describe, it, expect } from 'vitest';
import { SpectralTimbreExtractor } from '../SpectralTimbreExtractor';

describe('SpectralTimbreExtractor', () => {
  it('should return zeros for empty bins', () => {
    const extractor = new SpectralTimbreExtractor(44100);
    const empty = new Float32Array(0);
    const result = extractor.process(empty);
    expect(result.centroid).toBe(0);
    expect(result.flatness).toBe(0);
    expect(result.sibilance).toBe(0);
  });

  it('should compute high spectral flatness for uniform noise', () => {
    const extractor = new SpectralTimbreExtractor(44100);
    
    // An FFT decibel array representing uniform white noise (all bins at -30 dB)
    const fftDb = new Float32Array(512).fill(-30);
    const result = extractor.process(fftDb);
    
    // Flatness should be extremely close to 1.0 (flat spectrum)
    expect(result.flatness).toBeGreaterThan(0.9);
    expect(result.flatness).toBeLessThanOrEqual(1.0);
  });

  it('should compute low spectral flatness and correct centroid for a spiky pure tone', () => {
    const sampleRate = 44100;
    const extractor = new SpectralTimbreExtractor(sampleRate);
    const numBins = 512;
    
    // Create a spectrum where all bins are silent (-100 dB) except for one single tone bin
    const fftDb = new Float32Array(numBins).fill(-100);
    
    // Set a tone at bin index 100
    // Frequency = 100 * (22050 / 512) = ~4306 Hz
    fftDb[100] = -3.0; // very loud
    
    const result = extractor.process(fftDb);
    
    // 1. Flatness should be very low (tone-like, non-flat)
    expect(result.flatness).toBeLessThan(0.15);
    
    // 2. Centroid Hz is around 4306 Hz.
    // Centroid normalized is capped at 4000 Hz, so 4306 / 4000 = ~1.077 -> capped at 1.0
    expect(result.centroid).toBe(1.0);

    // Let's set a tone at a much lower frequency: bin index 15
    // Frequency = 15 * (22050 / 512) = ~646 Hz
    const fftDbLow = new Float32Array(numBins).fill(-100);
    fftDbLow[15] = -3.0;
    const resultLow = extractor.process(fftDbLow);
    
    // Centroid normalized should be much lower (approx 646 / 4000 = ~0.16)
    expect(resultLow.centroid).toBeGreaterThan(0.1);
    expect(resultLow.centroid).toBeLessThan(0.25);
  });

  it('should extract correct sibilance ratios for high-frequency vs low-frequency energy', () => {
    const sampleRate = 44100;
    const extractor = new SpectralTimbreExtractor(sampleRate);
    const numBins = 512;
    const binWidth = (sampleRate / 2) / numBins; // 22050 / 512 = 43.06 Hz per bin

    // 1. High Sibilance Case: Energy concentrated in 4kHz - 12kHz, and silent in 100Hz - 1kHz
    const highSibilanceFft = new Float32Array(numBins).fill(-100);
    for (let i = 0; i < numBins; i++) {
      const freq = i * binWidth;
      if (freq >= 5000 && freq <= 8000) {
        highSibilanceFft[i] = -10; // high energy
      }
    }
    const resultSibilant = extractor.process(highSibilanceFft);
    // Raw sibilance is 1.0 (defaults to peak since low energy is below threshold), 
    // which normalized becomes 1.0 / 1.5 = ~0.6667
    expect(resultSibilant.sibilance).toBeCloseTo(0.6667, 3);

    // 2. Low Sibilance Case: Energy concentrated in 100Hz - 1kHz (bass region) and silent in highs
    const bassFft = new Float32Array(numBins).fill(-100);
    for (let i = 0; i < numBins; i++) {
      const freq = i * binWidth;
      if (freq >= 200 && freq <= 600) {
        bassFft[i] = -10; // high low-end energy
      }
    }
    const resultBass = extractor.process(bassFft);
    expect(resultBass.sibilance).toBeCloseTo(0.0, 5); // High low-end, extremely low high-end
  });
});
