export class SpectralTimbreExtractor {
  private sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /**
   * Processes decibel FFT bins to extract timbral characteristics.
   * @param fftDb Bins returned by AnalyserNode.getFloatFrequencyData (typically half of fftSize)
   */
  public process(fftDb: Float32Array): { centroid: number; flatness: number; sibilance: number } {
    const numBins = fftDb.length;
    if (numBins === 0) {
      return { centroid: 0, flatness: 0, sibilance: 0 };
    }

    const binWidth = (this.sampleRate / 2) / numBins;

    // Convert decibels to linear amplitude for correct DSP calculations
    // Decibels typically range from -140dB (silence) to 0dB (peak)
    const amplitudes = new Float32Array(numBins);
    let sumAmps = 0;
    let sumLnAmps = 0;
    let sumCentroidNumerator = 0;

    for (let i = 0; i < numBins; i++) {
      const db = fftDb[i];
      // Bound the decibel values to avoid extremely small numbers or positive infinity/NaN
      const safeDb = Math.max(-100, Math.min(0, db));
      const amp = Math.pow(10, safeDb / 20);

      amplitudes[i] = amp;
      sumAmps += amp;

      const freq = i * binWidth;
      sumCentroidNumerator += freq * amp;

      // Add small epsilon for log calculation to avoid -Infinity
      sumLnAmps += Math.log(amp + 1e-6);
    }

    // 1. Spectral Centroid
    // Represents vocal brightness / high-frequency skew
    const centroidHz = sumAmps > 0.0001 ? sumCentroidNumerator / sumAmps : 0;
    // Normalize centroid to a 0.0 -> 1.0 range based on standard vocal spectrum (e.g. 0 to 4000Hz)
    const centroidNormalized = Math.max(0, Math.min(1, centroidHz / 4000));

    // 2. Spectral Flatness
    // gf = exp((1/N) * sum(ln(A_i))) / ((1/N) * sum(A_i))
    // A value close to 1.0 means noise-like (flat spectrum); close to 0.0 means tone-like (spiky spectrum)
    const avgAmp = sumAmps / numBins;
    let flatness = 0;
    if (avgAmp > 1e-6) {
      const geoMean = Math.exp(sumLnAmps / numBins);
      flatness = Math.max(0, Math.min(1, geoMean / avgAmp));
    }

    // 3. Sibilance Ratio
    // Sibilance = Energy(4kHz - 12kHz) / Energy(100Hz - 1kHz)
    let energyLow = 0;
    let energyHigh = 0;

    for (let i = 0; i < numBins; i++) {
      const freq = i * binWidth;
      const amp = amplitudes[i];
      const energy = amp * amp;

      if (freq >= 100 && freq <= 1000) {
        energyLow += energy;
      } else if (freq >= 4000 && freq <= 12000) {
        energyHigh += energy;
      }
    }

    let sibilance = 0;
    if (energyLow > 1e-8) {
      sibilance = energyHigh / energyLow;
    } else if (energyHigh > 1e-8) {
      sibilance = 1.0; // lots of highs, no lows (whisper/sibilance only)
    }

    // Cap & smooth sibilance ratio into a safe unipolar modulation range [0.0, 1.0]
    // A raw ratio of 1.0 or higher is a very strong sibilant 'sss'
    const sibilanceNormalized = Math.max(0, Math.min(1, sibilance / 1.5));

    return {
      centroid: centroidNormalized,
      flatness,
      sibilance: sibilanceNormalized
    };
  }
}
