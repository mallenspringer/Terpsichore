import { describe, it, expect } from 'vitest';
import { EnvelopeFollower } from '../EnvelopeFollower';

describe('EnvelopeFollower', () => {
  it('should initialize with default states', () => {
    const follower = new EnvelopeFollower(44100);
    expect(follower.getNoiseFloor()).toBe(0.01);
  });

  it('should track rising amplitude (attack phase)', () => {
    const sampleRate = 44100;
    const follower = new EnvelopeFollower(sampleRate);
    // Set fast attack (10ms) and slow release (1000ms)
    follower.setConstants(10, 1000);

    // Process a quiet block first
    const quietBlock = new Float32Array(128).fill(0);
    let env = follower.process(quietBlock);
    expect(env).toBe(0);

    // Feed a full amplitude signal (1.0)
    const hotBlock = new Float32Array(128).fill(1.0);
    env = follower.process(hotBlock);

    // The envelope should rise towards 1.0
    expect(env).toBeGreaterThan(0);
    expect(env).toBeLessThanOrEqual(1.0);

    // Process a second hot block: envelope should rise further
    const nextEnv = follower.process(hotBlock);
    expect(nextEnv).toBeGreaterThan(env);
  });

  it('should track decaying amplitude (release phase)', () => {
    const sampleRate = 44100;
    const follower = new EnvelopeFollower(sampleRate);
    follower.setConstants(10, 100); // 10ms attack, 100ms release

    // Jump up immediately to establish a high starting envelope
    const stepBlock = new Float32Array(512).fill(1.0);
    const peekEnv = follower.process(stepBlock);
    expect(peekEnv).toBeGreaterThan(0.5);

    // Feed silence
    const silenceBlock = new Float32Array(512).fill(0);
    const decayEnv1 = follower.process(silenceBlock);
    const decayEnv2 = follower.process(silenceBlock);

    // The envelope should decay down towards 0
    expect(decayEnv1).toBeLessThan(peekEnv);
    expect(decayEnv2).toBeLessThan(decayEnv1);
    expect(decayEnv2).toBeGreaterThan(0);
  });

  it('should dynamically track noise floor within [0.001, 0.1]', () => {
    const follower = new EnvelopeFollower(44100);
    
    // Process flat quiet signals to force the noise floor to decrease slowly
    const veryQuietBlock = new Float32Array(512).fill(0.0001);
    
    // Do many process cycles to allow the noise floor to track downward
    for (let i = 0; i < 50; i++) {
      follower.process(veryQuietBlock);
    }
    
    // Noise floor should have tracked downwards from 0.01 but remain bounded at 0.001
    expect(follower.getNoiseFloor()).toBeLessThan(0.01);
    expect(follower.getNoiseFloor()).toBeGreaterThanOrEqual(0.001);

    // Process slightly noisier signal to see if it slowly creeps up
    const noisyBlock = new Float32Array(512).fill(0.04);
    const currentNoiseFloor = follower.getNoiseFloor();
    for (let i = 0; i < 50; i++) {
      follower.process(noisyBlock);
    }
    expect(follower.getNoiseFloor()).toBeGreaterThan(currentNoiseFloor);
    expect(follower.getNoiseFloor()).toBeLessThanOrEqual(0.1);
  });

  it('should reset properly', () => {
    const follower = new EnvelopeFollower(44100);
    follower.setConstants(10, 100);
    
    // Pump quiet values to force noise floor to decay from 0.01
    const quietBlock = new Float32Array(256).fill(0.001);
    for (let i = 0; i < 20; i++) {
      follower.process(quietBlock);
    }
    expect(follower.getNoiseFloor()).not.toBe(0.01);

    // Reset should restore default values
    follower.reset();
    expect(follower.getNoiseFloor()).toBe(0.01);
    
    // Process silence and envelope should be exactly 0
    const env = follower.process(new Float32Array(128).fill(0));
    expect(env).toBe(0);
  });
});
