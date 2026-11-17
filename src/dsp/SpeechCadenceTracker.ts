export interface SpeechCadenceConfig {
  sensitivityDb?: number;     // Speech activity floor in dB (-60..0, default -38)
  prominenceDb?: number;      // Approach A: vocalic surge prominence above slow floor in dB (1..18, default 6)
  lockoutMs?: number;         // Approach A: minimum inter-syllable lockout in ms (80..350, default 135)
  microGapMs?: number;        // Approach C: short intra-word closure bridged silently in ms (50..350, default 180)
  breathPauseMs?: number;     // Approach C: pause length indicating phrase/breath break in ms (200..1500, default 450)
  caesuraPauseMs?: number;    // Approach C: long dramatic pause threshold in ms (800..5000, default 1600)
}

export interface SpeechCadenceResult {
  cadence: number;            // Approach A: smoothed normalized syllable rate (0..1 -> ~0..6.5 syl/s)
  syllableRateHz: number;     // Raw leaky syllable onset rate (syllables/sec)
  syllableOnset: boolean;     // Approach A: 1-frame impulse on vocalic syllable nucleus peak
  vocalicDb: number;          // Instantaneous 300-3000 Hz energy in dB
  inSpeech: boolean;          // Approach C: true while phrase is active (bridges microGapMs)
  speechDurationMs: number;   // Continuous active phrase duration
  silenceDurationMs: number;  // Current silence duration since last voiced/active sample
  breathPauseTrig: boolean;   // Approach C: 1-frame impulse when pause crosses breathPauseMs
  resumePhraseTrig: boolean;  // Approach C: 1-frame impulse when speech resumes after >= breathPauseMs
  caesuraTrig: boolean;       // Approach C: 1-frame impulse when pause crosses caesuraPauseMs
  pauseTensionCv: number;     // Approach C: 0..1 tension ramp from microGapMs to caesuraPauseMs
}

const DEFAULT_CADENCE_CONFIG: Required<SpeechCadenceConfig> = {
  sensitivityDb: -38,
  prominenceDb: 6,
  lockoutMs: 135,
  microGapMs: 180,
  breathPauseMs: 450,
  caesuraPauseMs: 1600,
};

/**
 * Dual-mode real-time speech cadence tracker combining:
 * - Approach A: Vocalic band (300-3000 Hz) syllable nucleus peak detection & syllable-rate estimation
 * - Approach C: Dual-timescale phrase / breath / hard-caesura pause segmentation with micro-gap bridging
 */
export class SpeechCadenceTracker {
  private sampleRate: number;

  // Approach A state (dB-domain vocalic envelope followers)
  private vocalicFastDb = -90;
  private vocalicSlowDb = -90;
  private prevDiffDb = 0;
  private wasDipping = true;
  private msSinceSyllable = 1000;
  private leakyRate = 0;
  private smoothedCadence = 0;

  // Approach C state (phrase / silence segmentation)
  private rawSpeechActive = false;
  private phraseActive = false;
  private hasSpokenSinceReset = false;
  private speechDurationMs = 0;
  private silenceDurationMs = 0;
  private breathFiredForPause = false;
  private caesuraFiredForPause = false;
  private wasBreathReady = false;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  public reset() {
    this.vocalicFastDb = -90;
    this.vocalicSlowDb = -90;
    this.prevDiffDb = 0;
    this.wasDipping = true;
    this.msSinceSyllable = 1000;
    this.leakyRate = 0;
    this.smoothedCadence = 0;

    this.rawSpeechActive = false;
    this.phraseActive = false;
    this.hasSpokenSinceReset = false;
    this.speechDurationMs = 0;
    this.silenceDurationMs = 0;
    this.breathFiredForPause = false;
    this.caesuraFiredForPause = false;
    this.wasBreathReady = false;
  }

  public process(
    fftDb: Float32Array,
    envelope: number,
    dtSec: number,
    config: SpeechCadenceConfig = {}
  ): SpeechCadenceResult {
    const cfg = {
      sensitivityDb: config.sensitivityDb ?? DEFAULT_CADENCE_CONFIG.sensitivityDb,
      prominenceDb: config.prominenceDb ?? DEFAULT_CADENCE_CONFIG.prominenceDb,
      lockoutMs: config.lockoutMs ?? DEFAULT_CADENCE_CONFIG.lockoutMs,
      microGapMs: config.microGapMs ?? DEFAULT_CADENCE_CONFIG.microGapMs,
      breathPauseMs: Math.max(
        (config.microGapMs ?? DEFAULT_CADENCE_CONFIG.microGapMs) + 40,
        config.breathPauseMs ?? DEFAULT_CADENCE_CONFIG.breathPauseMs
      ),
      caesuraPauseMs: Math.max(
        (config.breathPauseMs ?? DEFAULT_CADENCE_CONFIG.breathPauseMs) + 100,
        config.caesuraPauseMs ?? DEFAULT_CADENCE_CONFIG.caesuraPauseMs
      ),
    };

    const safeDt = Math.max(0.001, Math.min(0.1, dtSec));
    const dtMs = safeDt * 1000;

    // -------------------------------------------------------------------------
    // Approach A: Vocalic band (300 Hz - 3000 Hz) syllable nuclei & speech rate
    // -------------------------------------------------------------------------
    const vocalicDb = this.computeVocalicBandDb(fftDb);

    // Fast vowel envelope (~15 ms attack, ~65 ms release) vs slow adaptive baseline (~420 ms)
    const fastTau = vocalicDb > this.vocalicFastDb ? 0.015 : 0.065;
    const fastCoef = 1 - Math.exp(-safeDt / fastTau);
    this.vocalicFastDb += fastCoef * (vocalicDb - this.vocalicFastDb);

    // Slow baseline climbs slightly slower during loud speech so syllable bursts stand out clearly
    const slowTau = vocalicDb > this.vocalicSlowDb ? 0.42 : 0.32;
    const slowCoef = 1 - Math.exp(-safeDt / slowTau);
    this.vocalicSlowDb += slowCoef * (vocalicDb - this.vocalicSlowDb);
    this.vocalicSlowDb = Math.max(-85, this.vocalicSlowDb);

    const diffDb = this.vocalicFastDb - this.vocalicSlowDb;
    const vocalicGateDb = cfg.sensitivityDb - 8;

    // Re-arm detector once prominence dips below half threshold or silence holds
    if (diffDb < cfg.prominenceDb * 0.45 || vocalicDb < vocalicGateDb) {
      this.wasDipping = true;
    }

    this.msSinceSyllable += dtMs;
    let syllableOnset = false;
    if (
      this.wasDipping &&
      vocalicDb > vocalicGateDb &&
      diffDb >= cfg.prominenceDb &&
      diffDb >= this.prevDiffDb - 0.25 &&
      this.msSinceSyllable >= cfg.lockoutMs
    ) {
      syllableOnset = true;
      this.wasDipping = false;
      this.msSinceSyllable = 0;
    }
    this.prevDiffDb = diffDb;

    // Normalized leaky syllable-rate estimator (equilibrium = actual syllables/sec, 5.5 syl/s = 1.0)
    const rateTauSec = 1.5;
    this.leakyRate = this.leakyRate * Math.exp(-safeDt / rateTauSec) + (syllableOnset ? 1 / rateTauSec : 0);
    const rawNormCadence = Math.max(0, Math.min(1, this.leakyRate / 5.5));
    const cadenceSmoothCoef = 1 - Math.exp(-safeDt / 0.12);
    this.smoothedCadence += cadenceSmoothCoef * (rawNormCadence - this.smoothedCadence);
    if (this.smoothedCadence < 0.002 && this.leakyRate < 0.01) {
      this.smoothedCadence = 0;
    }

    // -------------------------------------------------------------------------
    // Approach C: Dual-timescale phrase / breath / caesura segmentation
    // -------------------------------------------------------------------------
    const openLin = Math.pow(10, cfg.sensitivityDb / 20);
    const closeLin = Math.pow(10, (cfg.sensitivityDb - 2.5) / 20); // 2.5 dB hysteresis
    if (this.rawSpeechActive) {
      if (envelope < closeLin) this.rawSpeechActive = false;
    } else {
      if (envelope > openLin) this.rawSpeechActive = true;
    }

    let breathPauseTrig = false;
    let resumePhraseTrig = false;
    let caesuraTrig = false;

    if (this.rawSpeechActive) {
      const enteredAfterPause = !this.phraseActive;
      this.phraseActive = true;
      this.speechDurationMs += dtMs;

      // Mark that real speech occurred (require ~35 ms so a single 1-frame click doesn't arm pause triggers)
      if (this.speechDurationMs >= 35) {
        this.hasSpokenSinceReset = true;
      }

      if (enteredAfterPause && this.wasBreathReady) {
        resumePhraseTrig = true;
        this.wasBreathReady = false;
      }

      this.silenceDurationMs = 0;
      this.breathFiredForPause = false;
      this.caesuraFiredForPause = false;
    } else {
      this.silenceDurationMs += dtMs;

      if (this.silenceDurationMs >= cfg.microGapMs) {
        this.phraseActive = false;
        this.speechDurationMs = 0;
      }

      if (this.hasSpokenSinceReset) {
        if (this.silenceDurationMs >= cfg.breathPauseMs && !this.breathFiredForPause) {
          breathPauseTrig = true;
          this.breathFiredForPause = true;
          this.wasBreathReady = true;
        }
        if (this.silenceDurationMs >= cfg.caesuraPauseMs && !this.caesuraFiredForPause) {
          caesuraTrig = true;
          this.caesuraFiredForPause = true;
        }
      }
    }

    let pauseTensionCv = 0;
    if (!this.phraseActive && this.hasSpokenSinceReset && this.silenceDurationMs > cfg.microGapMs) {
      const span = Math.max(1, cfg.caesuraPauseMs - cfg.microGapMs);
      pauseTensionCv = Math.max(0, Math.min(1, (this.silenceDurationMs - cfg.microGapMs) / span));
    }

    return {
      cadence: this.smoothedCadence,
      syllableRateHz: this.leakyRate,
      syllableOnset,
      vocalicDb,
      inSpeech: this.phraseActive,
      speechDurationMs: this.speechDurationMs,
      silenceDurationMs: this.silenceDurationMs,
      breathPauseTrig,
      resumePhraseTrig,
      caesuraTrig,
      pauseTensionCv,
    };
  }

  private computeVocalicBandDb(fftDb: Float32Array): number {
    const numBins = fftDb.length;
    if (numBins === 0) return -100;

    const nyquist = this.sampleRate * 0.5;
    const binWidth = nyquist / numBins;
    const minBin = Math.max(1, Math.floor(300 / binWidth));
    const maxBin = Math.min(numBins - 1, Math.ceil(3000 / binWidth));
    if (maxBin < minBin) return -100;

    let sumPower = 0;
    for (let i = minBin; i <= maxBin; i++) {
      const db = fftDb[i];
      if (!Number.isFinite(db) || db <= -95) continue;
      const safeDb = Math.max(-95, Math.min(0, db));
      const amp = Math.pow(10, safeDb / 20);
      sumPower += amp * amp;
    }

    if (sumPower <= 1e-12) return -100;
    const bandRms = Math.sqrt(sumPower);
    return Math.max(-100, Math.min(0, 20 * Math.log10(bandRms)));
  }
}
