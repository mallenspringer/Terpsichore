interface Complex {
  re: number;
  im: number;
}

class BiquadFilter {
  private mode: 'lowpass' | 'highpass';
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;

  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(mode: 'lowpass' | 'highpass', cutoff: number, sampleRate: number, Q = 0.7071) {
    this.mode = mode;
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    const cosW0 = Math.cos(w0);
    const sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);

    const b0Raw = mode === 'lowpass' ? (1 - cosW0) / 2 : (1 + cosW0) / 2;
    const b1Raw = mode === 'lowpass' ? 1 - cosW0 : -(1 + cosW0);
    const b2Raw = b0Raw;
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

  public reset(initialSample = 0) {
    this.x1 = initialSample;
    this.x2 = initialSample;
    const steady = this.mode === 'lowpass' ? initialSample : 0;
    this.y1 = steady;
    this.y2 = steady;
  }
}

export interface FormantAnalysisResult {
  f1: number;
  f2: number;
  x: number;
  y: number;
  voiced: boolean;
}

export class LpcFormantTracker {
  private sampleRate: number;
  private order = 10; // Order 10 yields up to 5 conjugate formant pole pairs (F1-F4 + spectral tilt)
  private highPassFilter: BiquadFilter | null = null;
  private antiAliasFilter1: BiquadFilter | null = null;
  private antiAliasFilter2: BiquadFilter | null = null;
  private filteredBuffer = new Float32Array(0);
  private downsampledBuffer = new Float32Array(0);
  private preEmpBuffer = new Float32Array(0);
  private windowedBuffer = new Float32Array(0);

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Tracks formant frequencies F1 and F2 and maps them to normalized vowel grid coordinates.
   */
  public getFormants(
    buffer: Float32Array,
    profile: 'universal' | 'baritone_bass' | 'tenor_contralto_alto' | 'mezzo_soprano' = 'universal'
  ): FormantAnalysisResult {
    const N = buffer.length;
    if (N < 128) {
      return { f1: 0, f2: 0, x: 0.5, y: 0.5, voiced: false };
    }

    // Remove DC offset and gate out room rumble, hum, and silence
    let mean = 0;
    for (let i = 0; i < N; i++) {
      mean += buffer[i];
    }
    mean /= N;

    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const ac = buffer[i] - mean;
      sumSq += ac * ac;
    }
    const rms = Math.sqrt(sumSq / N);
    if (rms < 0.004) {
      return { f1: 0, f2: 0, x: 0.5, y: 0.5, voiced: false };
    }

    // Target ~10 kHz downsample rate (Nyquist ~4.8-5.5 kHz) so upper female/tenor /i/ F2 (up to ~3 kHz) survives cleanly
    const M = Math.max(1, Math.round(this.sampleRate / 10000));
    const downsampledRate = this.sampleRate / M;

    if (!this.highPassFilter || !this.antiAliasFilter1 || !this.antiAliasFilter2) {
      // 210 Hz 2nd-order Butterworth HPF strips fundamental F0 proximity boom and low ambient rumble below human F1
      this.highPassFilter = new BiquadFilter('highpass', 210, this.sampleRate, 0.7071);
      const cutoff = downsampledRate * 0.45;
      this.antiAliasFilter1 = new BiquadFilter('lowpass', cutoff, this.sampleRate, 0.5412);
      this.antiAliasFilter2 = new BiquadFilter('lowpass', cutoff, this.sampleRate, 1.3066);
    }

    // AnalyserNode windows overlap asynchronously between frames, so prime & reset biquads per snapshot
    const x0 = buffer[0] - mean;
    this.highPassFilter.reset(x0);
    this.antiAliasFilter1.reset(0);
    this.antiAliasFilter2.reset(0);

    if (this.filteredBuffer.length !== N) {
      this.filteredBuffer = new Float32Array(N);
    }
    const filteredBuffer = this.filteredBuffer;
    for (let i = 0; i < N; i++) {
      const hp = this.highPassFilter.process(buffer[i] - mean);
      const val1 = this.antiAliasFilter1.process(hp);
      filteredBuffer[i] = this.antiAliasFilter2.process(val1);
    }

    const downsampledN = M > 1 ? Math.floor(N / M) : N;
    if (downsampledN < this.order + 16) {
      return { f1: 0, f2: 0, x: 0.5, y: 0.5, voiced: false };
    }

    let downsampledBuffer: Float32Array;
    if (M > 1) {
      if (this.downsampledBuffer.length !== downsampledN) {
        this.downsampledBuffer = new Float32Array(downsampledN);
      }
      downsampledBuffer = this.downsampledBuffer;
      for (let i = 0; i < downsampledN; i++) {
        downsampledBuffer[i] = filteredBuffer[i * M];
      }
    } else {
      downsampledBuffer = filteredBuffer;
    }

    // Step 1: Standard vocal pre-emphasis (0.94) to flatten -12 dB/oct glottal spectral tilt so F2/F3 stay crisp
    if (this.preEmpBuffer.length !== downsampledN) {
      this.preEmpBuffer = new Float32Array(downsampledN);
      this.windowedBuffer = new Float32Array(downsampledN);
    }
    const preEmp = this.preEmpBuffer;
    preEmp[0] = downsampledBuffer[0] * 0.06;
    for (let i = 1; i < downsampledN; i++) {
      preEmp[i] = downsampledBuffer[i] - 0.94 * downsampledBuffer[i - 1];
    }

    // Step 2: Apply Hamming Window
    const windowed = this.windowedBuffer;
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

    if (R[0] < 1e-15) {
      return { f1: 0, f2: 0, x: 0.5, y: 0.5, voiced: false };
    }

    // Normalize Autocorrelation coefficients for scale invariance
    const energy = R[0];
    for (let k = 0; k <= this.order; k++) {
      R[k] /= energy;
    }

    // Step 4: Levinson-Durbin Recursion solving R[i] + sum_{j=1}^{i-1} a[j]*R[i-j] = 0
    // Whitening filter: A(z) = 1 + a[1] z^-1 + ... + a[P] z^-P
    const a = new Float32Array(this.order + 1);
    const nextA = new Float32Array(this.order + 1);
    let E = R[0];

    for (let i = 1; i <= this.order; i++) {
      let sum = 0;
      for (let j = 1; j < i; j++) {
        sum += a[j] * R[i - j];
      }
      const ki = -(R[i] + sum) / E;

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

    // Step 5: Root Finding via Durand-Kerner Algorithm on z^P * A(z) = z^P + a[1]*z^(P-1) + ... + a[P] = 0
    const c = new Float32Array(this.order);
    for (let i = 0; i < this.order; i++) {
      c[i] = a[i + 1];
    }

    const roots = this.findRoots(c);

    // Step 6: Formant Extraction
    const rawFormants: { freq: number; bandwidth: number }[] = [];

    for (const r of roots) {
      if (r.im > 0.01) {
        const freq = (Math.atan2(r.im, r.re) * downsampledRate) / (2 * Math.PI);
        const mag = Math.sqrt(r.re * r.re + r.im * r.im);

        if (mag > 0.55 && mag < 1.0) {
          const bw = (-downsampledRate / Math.PI) * Math.log(mag);
          if (freq >= 220 && freq <= 3400 && bw < 650) {
            rawFormants.push({ freq, bandwidth: bw });
          }
        }
      }
    }

    rawFormants.sort((x, y) => x.freq - y.freq);

    // Deduplicate very close split poles (< 90 Hz) keeping sharpest resonance
    const formants: { freq: number; bandwidth: number }[] = [];
    for (const rf of rawFormants) {
      let isDuplicate = false;
      for (const f of formants) {
        if (Math.abs(f.freq - rf.freq) < 90) {
          isDuplicate = true;
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

    if (formants.length < 2 || formants[0].freq > 1250) {
      return { f1: formants[0]?.freq ?? 0, f2: 0, x: 0.5, y: 0.5, voiced: false };
    }

    const f1 = formants[0].freq;
    const f2 = formants[1].freq;

    // Log-frequency (Bark-like) bounds per voice profile so Oo/Oh/Ah/Ee land squarely in their quadrants
    let f1Min = 260;
    let f1Max = 800;
    let f2Min = 560;
    let f2Max = 2300;

    if (profile === 'baritone_bass') {
      f1Min = 230;
      f1Max = 750;
      f2Min = 520;
      f2Max = 1950;
    } else if (profile === 'tenor_contralto_alto') {
      f1Min = 270;
      f1Max = 860;
      f2Min = 580;
      f2Max = 2250;
    } else if (profile === 'mezzo_soprano') {
      f1Min = 300;
      f1Max = 980;
      f2Min = 650;
      f2Max = 2650;
    }

    const vowelX = Math.max(0, Math.min(1, Math.log2(Math.max(f2Min, f2) / f2Min) / Math.log2(f2Max / f2Min)));
    const vowelY = Math.max(0, Math.min(1, Math.log2(f1Max / Math.min(f1Max, Math.max(f1Min, f1))) / Math.log2(f1Max / f1Min)));

    return {
      f1,
      f2,
      x: vowelX,
      y: vowelY,
      voiced: true
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
