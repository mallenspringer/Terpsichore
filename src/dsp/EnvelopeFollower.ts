export class EnvelopeFollower {
  private lastValue = 0;
  private attackCoef = 0.99;
  private releaseCoef = 0.9;
  private sampleRate: number;
  
  // For dynamic noise floor tracking
  private noiseFloor = 0.01;
  private noiseFloorAlpha = 0.0001; // extremely slow tracking

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  public setConstants(attackMs: number, releaseMs: number) {
    // Prevent zero division / log errors by putting a minimum bounds of 1ms
    const at = Math.max(1, attackMs);
    const rt = Math.max(1, releaseMs);
    this.attackCoef = 1.0 - Math.exp(-1.0 / (this.sampleRate * (at / 1000.0)));
    this.releaseCoef = 1.0 - Math.exp(-1.0 / (this.sampleRate * (rt / 1000.0)));
  }

  public process(inputBuffer: Float32Array): number {
    let env = this.lastValue;
    let localSum = 0;
    
    for (let i = 0; i < inputBuffer.length; i++) {
      const absVal = Math.abs(inputBuffer[i]);
      const coef = absVal > env ? this.attackCoef : this.releaseCoef;
      env = env + coef * (absVal - env);
      localSum += absVal;
    }
    this.lastValue = env;

    // Dynamic noise floor tracking: slow-moving baseline of the input's average absolute level
    const avgAbs = localSum / Math.max(1, inputBuffer.length);
    if (avgAbs < this.noiseFloor) {
      // Release noise floor down slowly
      this.noiseFloor = this.noiseFloor + this.noiseFloorAlpha * (avgAbs - this.noiseFloor);
    } else {
      // Creep noise floor up extremely slowly (only when relatively quiet to avoid signal tracking)
      if (avgAbs < 0.05) {
        this.noiseFloor = this.noiseFloor + (this.noiseFloorAlpha * 0.1) * (avgAbs - this.noiseFloor);
      }
    }
    // Keep noise floor within sensible limits
    this.noiseFloor = Math.max(0.001, Math.min(0.1, this.noiseFloor));

    return env;
  }

  public getNoiseFloor(): number {
    return this.noiseFloor;
  }

  public reset() {
    this.lastValue = 0;
    this.noiseFloor = 0.01;
  }
}
