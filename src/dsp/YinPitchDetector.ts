export class YinPitchDetector {
  private threshold = 0.18;
  private sampleRate: number;
  private minPitchHz = 80;
  private maxPitchHz = 800;
  private maxLag = 0;
  private minLag = 0;
  private differenceBuffer = new Float32Array(0);
  private dPrimeBuffer = new Float32Array(0);

  constructor(sampleRate: number, minPitchHz = 80, maxPitchHz = 800) {
    this.sampleRate = sampleRate;
    this.setRange(minPitchHz, maxPitchHz);
  }

  public setRange(minPitchHz: number, maxPitchHz: number) {
    const safeMin = Math.max(25, Math.min(2000, minPitchHz));
    const safeMax = Math.max(safeMin + 20, Math.min(2500, maxPitchHz));
    if (safeMin === this.minPitchHz && safeMax === this.maxPitchHz && this.differenceBuffer.length > 0) {
      return;
    }

    this.minPitchHz = safeMin;
    this.maxPitchHz = safeMax;
    this.maxLag = Math.ceil(this.sampleRate / safeMin);
    this.minLag = Math.max(2, Math.floor(this.sampleRate / safeMax));

    if (this.differenceBuffer.length < this.maxLag) {
      this.differenceBuffer = new Float32Array(this.maxLag);
      this.dPrimeBuffer = new Float32Array(this.maxLag);
    }
  }

  public getPitch(buffer: Float32Array): { hz: number; confidence: number } {
    const len = buffer.length;
    if (len < 128) {
      return { hz: 0, confidence: 0 };
    }

    // Silence & room-hum gate: remove DC offset and check AC RMS before autocorrelation
    let mean = 0;
    for (let i = 0; i < len; i++) {
      mean += buffer[i];
    }
    mean /= len;

    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      const ac = buffer[i] - mean;
      sumSq += ac * ac;
    }
    const rms = Math.sqrt(sumSq / len);
    if (rms < 0.004) {
      return { hz: 0, confidence: 0 };
    }

    // Cap lag gracefully to what fits inside the current buffer while preserving a >=96-sample window
    const minWindow = Math.min(128, Math.max(64, Math.floor(len * 0.25)));
    const effectiveMaxLag = Math.min(this.maxLag, len - minWindow);
    const windowSize = len - effectiveMaxLag;

    if (effectiveMaxLag <= this.minLag + 2 || windowSize < 64) {
      return { hz: 0, confidence: 0 };
    }

    // Step 1: Difference Function d(tau) = sum_{j=0}^{W-1} (x[j] - x[j + tau])^2
    const diff = this.differenceBuffer;
    diff[0] = 0;

    for (let tau = 1; tau < effectiveMaxLag; tau++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    // Step 2: Cumulative Mean Normalized Difference Function
    const dPrime = this.dPrimeBuffer;
    dPrime[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < effectiveMaxLag; tau++) {
      runningSum += diff[tau];
      dPrime[tau] = runningSum > 0 ? diff[tau] / (runningSum / tau) : 1;
    }

    // Step 3: Thresholding & Finding the optimal lag
    let tauEstimate = -1;
    let absoluteMinVal = 1.0;
    let absoluteMinTau = -1;

    const searchEnd = effectiveMaxLag - 1;
    for (let tau = this.minLag; tau < searchEnd; tau++) {
      if (dPrime[tau] < dPrime[tau - 1] && dPrime[tau] < dPrime[tau + 1]) {
        if (dPrime[tau] < this.threshold) {
          tauEstimate = tau;
          break;
        }
      }
      if (dPrime[tau] < absoluteMinVal) {
        absoluteMinVal = dPrime[tau];
        absoluteMinTau = tau;
      }
    }

    if (tauEstimate === -1) {
      tauEstimate = absoluteMinTau;
    }

    if (tauEstimate <= this.minLag || tauEstimate >= searchEnd) {
      return { hz: 0, confidence: 0 };
    }

    // Step 4: Parabolic Interpolation
    const alpha = dPrime[tauEstimate - 1];
    const beta = dPrime[tauEstimate];
    const gamma = dPrime[tauEstimate + 1];

    const denominator = alpha - 2 * beta + gamma;
    let realTau = tauEstimate;
    if (Math.abs(denominator) > 0.0001) {
      const p = Math.max(-0.5, Math.min(0.5, 0.5 * (alpha - gamma) / denominator));
      realTau = tauEstimate + p;
    }

    const frequency = this.sampleRate / realTau;
    const confidence = Math.max(0, Math.min(1, 1.0 - beta));

    if (
      frequency < this.minPitchHz * 0.9 ||
      frequency > this.maxPitchHz * 1.1 ||
      confidence < 0.2
    ) {
      return { hz: 0, confidence: 0 };
    }

    return { hz: frequency, confidence };
  }
}
