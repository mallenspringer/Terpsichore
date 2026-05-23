import { describe, it, expect } from 'vitest';
import { YinPitchDetector } from '../YinPitchDetector';

describe('YinPitchDetector', () => {
  it('should return 0 hz and 0 confidence for small buffer sizes', () => {
    const detector = new YinPitchDetector(44100, 80, 800);
    const smallBuffer = new Float32Array(100);
    const result = detector.getPitch(smallBuffer);
    expect(result.hz).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('should return 0 hz and 0 confidence for pure silence', () => {
    const detector = new YinPitchDetector(44100, 80, 800);
    const silenceBuffer = new Float32Array(2048).fill(0);
    const result = detector.getPitch(silenceBuffer);
    expect(result.hz).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('should detect a 440 Hz pure sine wave with high confidence', () => {
    const sampleRate = 44100;
    const frequency = 440;
    const detector = new YinPitchDetector(sampleRate, 80, 800);
    
    // Generate a pure sine wave at 440 Hz
    const buffer = new Float32Array(2048);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }

    const result = detector.getPitch(buffer);
    
    // Check if detected frequency is close to 440 Hz (allowing for small sample-rate discretization deviations)
    expect(result.hz).toBeGreaterThan(430);
    expect(result.hz).toBeLessThan(450);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should detect a 250 Hz pure sine wave', () => {
    const sampleRate = 44100;
    const frequency = 250;
    const detector = new YinPitchDetector(sampleRate, 80, 800);
    
    // Generate sine wave
    const buffer = new Float32Array(2048);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }

    const result = detector.getPitch(buffer);
    
    expect(result.hz).toBeGreaterThan(240);
    expect(result.hz).toBeLessThan(260);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('should reject noisy / chaotic signals with low confidence', () => {
    const detector = new YinPitchDetector(44100, 80, 800);
    
    // Generate random noise
    const buffer = new Float32Array(2048);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.random() * 2 - 1;
    }

    const result = detector.getPitch(buffer);
    
    expect(result.hz).toBe(0);
    expect(result.confidence).toBe(0);
  });
});
