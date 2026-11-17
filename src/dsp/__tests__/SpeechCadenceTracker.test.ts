import { describe, it, expect } from 'vitest';
import { SpeechCadenceTracker } from '../SpeechCadenceTracker';

function makeFftBins(
  sampleRate: number,
  fftSize: number,
  activeBands: Array<{ minHz: number; maxHz: number; db: number }>
): Float32Array {
  const numBins = fftSize / 2;
  const bins = new Float32Array(numBins).fill(-100);
  const binWidth = (sampleRate * 0.5) / numBins;
  for (let i = 0; i < numBins; i++) {
    const freq = i * binWidth;
    for (const band of activeBands) {
      if (freq >= band.minHz && freq <= band.maxHz) {
        bins[i] = Math.max(bins[i], band.db);
      }
    }
  }
  return bins;
}

describe('SpeechCadenceTracker (Approach A + Approach C)', () => {
  const sampleRate = 48000;
  const fftSize = 2048;
  const dtSec = 1 / 60;

  it('detects vocalic syllable bursts (Approach A) and estimates normalized cadence rate', () => {
    const tracker = new SpeechCadenceTracker(sampleRate);
    const quietFft = makeFftBins(sampleRate, fftSize, []);
    const vowelFft = makeFftBins(sampleRate, fftSize, [{ minHz: 500, maxHz: 1800, db: -24 }]);

    // Warm up ambient floor cleanly
    for (let f = 0; f < 30; f++) {
      tracker.process(quietFft, 0.001, dtSec);
    }

    // Feed 5 syllables spaced 250ms apart (~4 syl/s): 80ms vocalic burst + 170ms dip
    let onsets = 0;
    let lastCadence = 0;
    for (let s = 0; s < 5; s++) {
      for (let f = 0; f < 15; f++) {
        const isBurst = f < 5;
        const res = tracker.process(
          isBurst ? vowelFft : quietFft,
          isBurst ? 0.12 : 0.004,
          dtSec,
          { sensitivityDb: -38, prominenceDb: 6, lockoutMs: 130 }
        );
        if (res.syllableOnset) onsets++;
        lastCadence = res.cadence;
      }
    }

    expect(onsets).toBe(5);
    expect(lastCadence).toBeGreaterThan(0.35);
    expect(lastCadence).toBeLessThanOrEqual(1.0);
  });

  it('ignores sub-vocalic low rumble below 300 Hz and stops re-triggering on steady held vowel', () => {
    const tracker = new SpeechCadenceTracker(sampleRate);
    const rumbleFft = makeFftBins(sampleRate, fftSize, [{ minHz: 50, maxHz: 180, db: -14 }]);
    const vowelFft = makeFftBins(sampleRate, fftSize, [{ minHz: 500, maxHz: 1500, db: -22 }]);

    let rumbleOnsets = 0;
    for (let f = 0; f < 40; f++) {
      const res = tracker.process(rumbleFft, 0.05, dtSec, { sensitivityDb: -38, prominenceDb: 6 });
      if (res.syllableOnset) rumbleOnsets++;
    }
    expect(rumbleOnsets).toBe(0);

    // Sustained steady vowel: triggers once at attack, does not machine-gun while held flat
    let steadyOnsets = 0;
    let finalCadence = 1;
    for (let f = 0; f < 180; f++) {
      const res = tracker.process(vowelFft, 0.15, dtSec, { sensitivityDb: -38, prominenceDb: 6 });
      if (res.syllableOnset) steadyOnsets++;
      finalCadence = res.cadence;
    }
    expect(steadyOnsets).toBe(1);
    expect(finalCadence).toBeLessThan(0.25);
  });

  it('bridges micro-gaps and fires breath pause, resume phrase, and hard caesura triggers (Approach C)', () => {
    const tracker = new SpeechCadenceTracker(sampleRate);
    const quietFft = makeFftBins(sampleRate, fftSize, []);
    const speechFft = makeFftBins(sampleRate, fftSize, [{ minHz: 400, maxHz: 2000, db: -24 }]);

    const cfg = {
      sensitivityDb: -36,
      microGapMs: 180,
      breathPauseMs: 450,
      caesuraPauseMs: 1200,
    };

    // Initial silence must not pre-fire breath/caesura before speech starts
    for (let f = 0; f < 60; f++) {
      const res = tracker.process(quietFft, 0.001, dtSec, cfg);
      expect(res.breathPauseTrig).toBe(false);
      expect(res.resumePhraseTrig).toBe(false);
      expect(res.caesuraTrig).toBe(false);
    }

    // Speak for 300ms
    for (let f = 0; f < 18; f++) {
      const res = tracker.process(speechFft, 0.12, dtSec, cfg);
      expect(res.inSpeech).toBe(true);
    }

    // Micro-gap of 120ms (< 180ms): phrase remains active, no breath/resume triggers
    for (let f = 0; f < 7; f++) {
      const res = tracker.process(quietFft, 0.001, dtSec, cfg);
      expect(res.inSpeech).toBe(true);
      expect(res.breathPauseTrig).toBe(false);
    }
    const resumeMicro = tracker.process(speechFft, 0.12, dtSec, cfg);
    expect(resumeMicro.resumePhraseTrig).toBe(false);

    // Pause through breathPauseMs (450ms) up to ~600ms
    let breathHits = 0;
    let tensionAfterBreath = 0;
    for (let f = 0; f < 36; f++) {
      const res = tracker.process(quietFft, 0.001, dtSec, cfg);
      if (res.breathPauseTrig) breathHits++;
      tensionAfterBreath = res.pauseTensionCv;
    }
    expect(breathHits).toBe(1);
    expect(tensionAfterBreath).toBeGreaterThan(0.2);

    // Resume speaking -> should fire resumePhraseTrig once
    const resumeBreath = tracker.process(speechFft, 0.12, dtSec, cfg);
    expect(resumeBreath.resumePhraseTrig).toBe(true);
    for (let f = 0; f < 6; f++) {
      const cont = tracker.process(speechFft, 0.12, dtSec, cfg);
      expect(cont.resumePhraseTrig).toBe(false);
    }

    // Long silence crossing caesuraPauseMs (1200ms)
    let caesuraHits = 0;
    let finalTension = 0;
    for (let f = 0; f < 90; f++) {
      const res = tracker.process(quietFft, 0.001, dtSec, cfg);
      if (res.caesuraTrig) caesuraHits++;
      finalTension = res.pauseTensionCv;
    }
    expect(caesuraHits).toBe(1);
    expect(finalTension).toBeCloseTo(1, 2);
  });
});
