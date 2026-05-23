export class YinPitchDetector {
  private threshold = 0.15;
  private sampleRate: number;
  private maxLag: number;
  private minLag: number;
  private differenceBuffer: Float32Array;

  constructor(sampleRate: number, minPitchHz = 80, maxPitchHz = 800) {
    this.sampleRate = sampleRate;
    // min pitch 80Hz -> max lag = sampleRate / 80
    this.maxLag = Math.ceil(sampleRate / minPitchHz);
    // max pitch 800Hz -> min lag = sampleRate / 800
    this.minLag = Math.floor(sampleRate / maxPitchHz);
    this.differenceBuffer = new Float32Array(this.maxLag);
  }

  public getPitch(buffer: Float32Array): { hz: number; confidence: number } {
    const len = buffer.length;
    // Window size for summation. Needs to be large enough.
    // W = len - maxLag
    const windowSize = Math.max(128, len - this.maxLag);

    if (len < this.maxLag + windowSize) {
      return { hz: 0, confidence: 0 };
    }

    // Step 1: Calculate Difference Function
    // d(tau) = sum_{j=0}^{W-1} (x[j] - x[j + tau])^2
    const diff = this.differenceBuffer;
    diff.fill(0);

    for (let tau = 0; tau < this.maxLag; tau++) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }

    // Step 2: Cumulative Mean Normalized Difference Function
    // d'(tau) = 1 if tau = 0
    // d'(tau) = d(tau) / ((1/tau) * sum_{j=1}^{tau} d(j))
    const dPrime = new Float32Array(this.maxLag);
    dPrime[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < this.maxLag; tau++) {
      runningSum += diff[tau];
      if (runningSum > 0) {
        dPrime[tau] = diff[tau] / (runningSum / tau);
      } else {
        dPrime[tau] = 1;
      }
    }

    // Step 3: Thresholding & Finding the optimal lag
    // Find the first local minimum below the threshold.
    let tauEstimate = -1;
    let absoluteMinVal = 1.0;
    let absoluteMinTau = -1;

    for (let tau = this.minLag; tau < this.maxLag; tau++) {
      // Find local minima
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

    // Fall back to the absolute global minimum if no local minimum was below threshold
    if (tauEstimate === -1) {
      tauEstimate = absoluteMinTau;
    }

    if (tauEstimate === -1 || tauEstimate >= this.maxLag - 1 || tauEstimate <= this.minLag) {
      return { hz: 0, confidence: 0 };
    }

    // Step 4: Parabolic Interpolation
    // Fitting a parabola to dPrime around the estimated index to achieve sub-sample resolution
    const alpha = dPrime[tauEstimate - 1];
    const beta = dPrime[tauEstimate];
    const gamma = dPrime[tauEstimate + 1];

    const denominator = alpha - 2 * beta + gamma;
    let realTau = tauEstimate;
    if (Math.abs(denominator) > 0.0001) {
      const p = 0.5 * (alpha - gamma) / denominator;
      realTau = tauEstimate + p;
    }

    const frequency = this.sampleRate / realTau;
    const confidence = Math.max(0, 1.0 - beta);

    // Filter ridiculous results
    if (frequency < 40 || frequency > 2000 || confidence < 0.2) {
      return { hz: 0, confidence: 0 };
    }

    return { hz: frequency, confidence };
  }
}
