interface Complex {
  re: number;
  im: number;
}

class BiquadLowPass {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(cutoff: number, sampleRate: number, Q = 0.7071) {
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);

    const b0Raw = (1 - cosW0) / 2;
    const b1Raw = 1 - cosW0;
    const b2Raw = (1 - cosW0) / 2;
    const a0Raw = 1 + alpha;
    const a1Raw = -2 * cosW0;
    const a2Raw = 1 - alpha;

    this.b0 = b0Raw / a0Raw;
    this.b1 = b1Raw / a0Raw;
    this.b2 = b2Raw / a0Raw;
    this.a1 = a1Raw / a0Raw;
    this.a2 = a2Raw / a0Raw;
  }

  public process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  public reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

export class LpcFormantTracker {
  private sampleRate: number;
  private order = 7; // Increased to order 7 to provide degrees of freedom for F1, F2, and F3/glottal tilt
  private prevSample = 0; // for pre-emphasis
  private prevF1 = 500;   // for formant frequency smoothing
  private prevF2 = 1500;  // for formant frequency smoothing
  private historyBuffer: Float32Array | null = null; // 2-frame rolling history buffer to double window resolution
  private antiAliasFilter1: BiquadLowPass | null = null;
  private antiAliasFilter2: BiquadLowPass | null = null;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Tracks formant frequencies F1 and F2 and maps them to normalized vowel grid coordinates.
   */
  public getFormants(
    buffer: Float32Array,
    profile: 'universal' | 'baritone_bass' | 'tenor_contralto_alto' | 'mezzo_soprano' = 'universal'
  ): { f1: number; f2: number; x: number; y: number } {
    const N = buffer.length;
    if (N < 128) {
      return { f1: 0, f2: 0, x: 0.5, y: 0.5 };
    }

    // Compute raw buffer RMS to gate out room rumble, hum, and noise floor
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      sumSq += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSq / N);
    if (rms < 0.005) {
      // Smoothly return to the exact center during silence
      this.prevF1 = 500;
      this.prevF2 = 1500;
      this.historyBuffer = null; // reset history buffer on silence
      if (this.antiAliasFilter1) this.antiAliasFilter1.reset();
      if (this.antiAliasFilter2) this.antiAliasFilter2.reset();
      return { f1: 0, f2: 0, x: 0.5, y: 0.5 };
    }

    // Downsample the signal to ~5 kHz to decouple pitch harmonics from vocal-tract formants
    const M = Math.max(1, Math.round(this.sampleRate / 5000));
    const downsampledRate = this.sampleRate / M;

    if (!this.antiAliasFilter1 || !this.antiAliasFilter2) {
      const cutoff = downsampledRate * 0.45;
      this.antiAliasFilter1 = new BiquadLowPass(cutoff, this.sampleRate, 0.5412);
      this.antiAliasFilter2 = new BiquadLowPass(cutoff, this.sampleRate, 1.3066);
    }

    const filteredBuffer = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const val1 = this.antiAliasFilter1.process(buffer[i]);
      filteredBuffer[i] = this.antiAliasFilter2.process(val1);
    }

    // Double the analysis window by maintaining a rolling 2-frame history buffer (e.g. 2048 samples).
    // This provides 46.4ms of audio, allowing the autocorrelation algorithms to resolve low 
    // formant frequencies (like F1 down to 250Hz) stably and cleanly for any voice pitch.
    const historyLen = N * 2;
    let isFirstFrame = false;
    if (!this.historyBuffer || this.historyBuffer.length !== historyLen) {
      this.historyBuffer = new Float32Array(historyLen);
      isFirstFrame = true;
    }

    if (isFirstFrame) {
      // Fill the entire history buffer immediately on the first frame (or in unit tests)
      this.historyBuffer.set(filteredBuffer, 0);
      this.historyBuffer.set(filteredBuffer, N);
    } else {
      // Shift left by 1 frame and insert the new frame at the end
      this.historyBuffer.copyWithin(0, N);
      this.historyBuffer.set(filteredBuffer, N);
    }

    let downsampledBuffer: Float32Array;

    if (M > 1) {
      const newLen = Math.floor(historyLen / M);
      downsampledBuffer = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) {
        downsampledBuffer[i] = this.historyBuffer![i * M];
      }
    } else {
      downsampledBuffer = this.historyBuffer!;
    }
    const downsampledN = downsampledBuffer.length;

    // Step 1: Pre-emphasis filter
    const preEmp = new Float32Array(downsampledN);
    let prev = this.prevSample;
    for (let i = 0; i < downsampledN; i++) {
      preEmp[i] = downsampledBuffer[i] - 0.3 * prev; // Relaxed pre-emphasis constant to preserve low F1 energy
      prev = downsampledBuffer[i];
    }
    this.prevSample = prev;

    // Step 2: Apply Hamming Window
    const windowed = new Float32Array(downsampledN);
    for (let i = 0; i < downsampledN; i++) {
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (downsampledN - 1));
      windowed[i] = preEmp[i] * w;
    }

    // Step 3: Autocorrelation R[0...order]
    const R = new Float32Array(this.order + 1);
    for (let k = 0; k <= this.order; k++) {
      let sum = 0;
      for (let n = 0; n < downsampledN - k; n++) {
        sum += windowed[n] * windowed[n + k];
      }
      R[k] = sum;
    }

    // Avoid division by zero and check absolute noise floor
    if (R[0] < 1e-15) {
      return { f1: 0, f2: 0, x: 0.5, y: 0.5 };
    }

    // Normalize Autocorrelation coefficients to ensure scale invariance.
    // This allows the tracker to model quiet signals stably and prevents
    // Levinson-Durbin's absolute error threshold (1e-10) from breaking early.
    const energy = R[0];
    for (let k = 0; k <= this.order; k++) {
      R[k] /= energy;
    }

    // Step 4: Levinson-Durbin Recursion to solve for LPC coefficients
    const a = new Float32Array(this.order + 1); // a[0] is unused, a[1..order] are coefficients
    let E = R[0]; // now exactly 1.0

    for (let i = 1; i <= this.order; i++) {
      let sum = 0;
      for (let j = 1; j < i; j++) {
        sum += a[j] * R[i - j];
      }
      const ki = -(R[i] + sum) / E;

      // Update coefficients
      const nextA = new Float32Array(this.order + 1);
      nextA[i] = ki;
      for (let j = 1; j < i; j++) {
        nextA[j] = a[j] + ki * a[i - j];
      }
      
      for (let j = 1; j <= i; j++) {
        a[j] = nextA[j];
      }

      E = (1 - ki * ki) * E;
      if (E < 1e-10) break;
    }

    // Step 5: Root Finding via Durand-Kerner Algorithm
    // Polynomial: P(z) = z^P + c_1 * z^(P-1) + ... + c_P = 0
    // where c_i = -a[i]
    const c = new Float32Array(this.order);
    for (let i = 0; i < this.order; i++) {
      c[i] = -a[i + 1];
    }

    const roots = this.findRoots(c);

    // Step 6: Formant Extraction
    // Convert complex roots to frequencies and filter by bandwidth
    const rawFormants: { freq: number; bandwidth: number }[] = [];

    for (const r of roots) {
      // Roots are complex poles z = u + iv.
      // We only care about roots in the upper half plane (v > 0) to avoid duplicates
      if (r.im > 0.01) {
        // frequency = atan2(v, u) * Fs / 2pi
        const freq = (Math.atan2(r.im, r.re) * downsampledRate) / (2 * Math.PI);
        // Bandwidth is determined by how close the root is to the unit circle:
        // r_magnitude = sqrt(u^2 + v^2). Bandwidth = -Fs/pi * ln(r_magnitude)
        const mag = Math.sqrt(r.re * r.re + r.im * r.im);
        
        // Loosen bounds: We allow mag close to 1.0 (very sharp peaks) and widen search thresholds
        if (mag > 0.05 && mag < 1.0) {
          const bw = (-downsampledRate / Math.PI) * Math.log(mag);
          if (freq >= 150 && freq <= 3200 && bw < 1200) {
            rawFormants.push({ freq, bandwidth: bw });
          }
        }
      }
    }

    // Sort formants by frequency
    rawFormants.sort((x, y) => x.freq - y.freq);

    // CRITICAL: Deduplicate very close peaks (within 90Hz).
    // Often, due to pitch harmonics or split poles, two roots converge to the same spectral peak.
    // We deduplicate with a tighter threshold (90Hz) so that low-frequency formants which naturally 
    // sit close together (like F1 and F2 in back-vowels Oo/Oh) are not accidentally merged.
    const formants: { freq: number; bandwidth: number }[] = [];
    for (const rf of rawFormants) {
      let isDuplicate = false;
      for (const f of formants) {
        if (Math.abs(f.freq - rf.freq) < 90) {
          isDuplicate = true;
          // Keep the sharper resonance peak (smaller bandwidth)
          if (rf.bandwidth < f.bandwidth) {
            f.freq = rf.freq;
            f.bandwidth = rf.bandwidth;
          }
          break;
        }
      }
      if (!isDuplicate) {
        formants.push(rf);
      }
    }

    const targetF1 = formants.length > 0 ? formants[0].freq : 500;
    const targetF2 = formants.length > 1 ? formants[1].freq : 1500;

    // Smooth raw formant frequencies to eliminate frame-to-frame tracking jitter
    const freqSmooth = 0.85;
    const f1 = this.prevF1 * freqSmooth + targetF1 * (1 - freqSmooth);
    const f2 = this.prevF2 * freqSmooth + targetF2 * (1 - freqSmooth);

    this.prevF1 = f1;
    this.prevF2 = f2;

    // Define bounds depending on the chosen voice profile
    let f1Min = 250;
    let f1Max = 950;
    let f2Min = 600;
    let f2Max = 2300;

    if (profile === 'baritone_bass') {
      f1Min = 200;
      f1Max = 800;
      f2Min = 500;
      f2Max = 1800;
    } else if (profile === 'tenor_contralto_alto') {
      f1Min = 250;
      f1Max = 1000;
      f2Min = 600;
      f2Max = 2100;
    } else if (profile === 'mezzo_soprano') {
      f1Min = 300;
      f1Max = 1200;
      f2Min = 700;
      f2Max = 2500;
    }

    const f1Range = f1Max - f1Min;
    const f2Range = f2Max - f2Min;

    const vowelX = Math.max(0, Math.min(1, (f2 - f2Min) / f2Range));
    const vowelY = Math.max(0, Math.min(1, (f1Max - f1) / f1Range));

    return {
      f1,
      f2,
      x: vowelX,
      y: vowelY
    };
  }

  /**
   * Durand-Kerner algorithm to find the complex roots of the polynomial
   * P(z) = z^n + c[0]*z^(n-1) + c[1]*z^(n-2) + ... + c[n-1] = 0
   */
  private findRoots(c: Float32Array): Complex[] {
    const n = c.length;
    const roots: Complex[] = [];

    // Initialize roots on the complex unit circle with varying radii to break symmetry
    // and prevent roots from clumping or getting stuck during iterations.
    const theta = (2 * Math.PI) / n;
    for (let i = 0; i < n; i++) {
      const radius = 0.85 + 0.1 * (i / n);
      const angle = i * theta + 0.13;
      roots.push({
        re: radius * Math.cos(angle),
        im: radius * Math.sin(angle)
      });
    }

    const maxIterations = 30;
    const tolerance = 1e-4;

    for (let iter = 0; iter < maxIterations; iter++) {
      let maxDiff = 0;

      for (let i = 0; i < n; i++) {
        const zi = roots[i];

        // Evaluate P(zi) = zi^n + c[0]*zi^(n-1) + ... + c[n-1]
        // Using complex Horner's method
        let pVal: Complex = { re: 1, im: 0 }; // start with zi^n coefficient = 1
        for (let j = 0; j < n; j++) {
          pVal = this.complexMultiply(pVal, zi);
          pVal.re += c[j];
        }

        // Evaluate denominator: Product_{j!=i} (zi - zj)
        let denom: Complex = { re: 1, im: 0 };
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const diff: Complex = { re: zi.re - roots[j].re, im: zi.im - roots[j].im };
          denom = this.complexMultiply(denom, diff);
        }

        // Avoid division by zero
        const denomMagSq = denom.re * denom.re + denom.im * denom.im;
        if (denomMagSq < 1e-12) continue;

        // Compute correction: delta = P(zi) / denom
        const delta: Complex = {
          re: (pVal.re * denom.re + pVal.im * denom.im) / denomMagSq,
          im: (pVal.im * denom.re - pVal.re * denom.im) / denomMagSq
        };

        // Update root
        roots[i] = {
          re: zi.re - delta.re,
          im: zi.im - delta.im
        };

        const diffMag = Math.sqrt(delta.re * delta.re + delta.im * delta.im);
        if (diffMag > maxDiff) {
          maxDiff = diffMag;
        }
      }

      if (maxDiff < tolerance) {
        break;
      }
    }

    return roots;
  }

  private complexMultiply(a: Complex, b: Complex): Complex {
    return {
      re: a.re * b.re - a.im * b.im,
      im: a.re * b.im + a.im * b.re
    };
  }
}
