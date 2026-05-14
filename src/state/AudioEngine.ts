import { AudioBusData } from './types';

export class AudioEngine {
  private static instance: AudioEngine;

  public context: AudioContext;
  private sources: Map<string, MediaElementAudioSourceNode> = new Map();
  private analyzers: Map<string, AnalyserNode> = new Map();
  private moduleGains: Map<string, GainNode> = new Map();
  private layerGains: Map<string, GainNode> = new Map();
  private masterGain: GainNode;

  // Global Audio Bus Registry
  private buses: Map<string, AudioBusData> = new Map();
  private fftSize = 1024;
  private _masterMuted = false;

  private constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();

    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    
    // Initialize Default Buses
    this.initializeBus('master', 'Master Audio');
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  /**
   * Initializes or resets an audio bus with necessary buffers
   */
  private initializeBus(id: string, name: string) {
    if (!this.buses.has(id)) {
      this.buses.set(id, {
        id,
        name,
        peak: 0,
        rms: 0,
        fft: new Float32Array(this.fftSize / 2),
        waveform: new Float32Array(this.fftSize),
        onset: false,
        bpm: 120,
        confidence: 0,
        bands: { 
          bass: 0, mid: 0, high: 0,
          low: 0, lowMid: 0, midGranular: 0, highMid: 0, highGranular: 0
        }
      });
    }
  }

  public registerMediaElement(id: string, element: HTMLMediaElement) {
    if (this.sources.has(id)) return;

    try {
      const source = this.context.createMediaElementSource(element);
      const moduleGain = this.context.createGain();
      const analyzer = this.context.createAnalyser();
      const layerGain = this.context.createGain();

      analyzer.fftSize = this.fftSize;
      analyzer.smoothingTimeConstant = 0.8;

      // Chain: Source -> ModuleGain -> Analyzer -> LayerGain -> Master -> Output
      source.connect(moduleGain);
      moduleGain.connect(analyzer);
      analyzer.connect(layerGain);
      layerGain.connect(this.masterGain);

      this.sources.set(id, source);
      this.moduleGains.set(id, moduleGain);
      this.analyzers.set(id, analyzer);
      this.layerGains.set(id, layerGain);

      // Register this as a bus
      this.initializeBus(id, `Layer ${id}`);

    } catch (e) {
      console.error(`[AudioEngine] Failed to register element ${id}`, e);
    }
  }

  public unregisterMediaElement(id: string) {
    const source = this.sources.get(id);
    const analyzer = this.analyzers.get(id);
    const mGain = this.moduleGains.get(id);
    const lGain = this.layerGains.get(id);

    if (source) source.disconnect();
    if (mGain) mGain.disconnect();
    if (analyzer) analyzer.disconnect();
    if (lGain) lGain.disconnect();

    this.sources.delete(id);
    this.moduleGains.delete(id);
    this.analyzers.delete(id);
    this.layerGains.delete(id);
    this.buses.delete(id);
  }

  /**
   * Main analysis loop called by the SignalDispatcher
   */
  public update() {
    this.analyzers.forEach((analyzer, id) => {
      const bus = this.buses.get(id);
      if (!bus) return;

      // 1. Get Frequency Data
      analyzer.getFloatFrequencyData(bus.fft as any);
      
      // 2. Get Time Domain Data
      analyzer.getFloatTimeDomainData(bus.waveform as any);

      // 3. Calculate Peak & RMS
      let peak = 0;
      let sumSq = 0;
      for (let i = 0; i < bus.waveform.length; i++) {
        const val = Math.abs(bus.waveform[i]);
        if (val > peak) peak = val;
        sumSq += val * val;
      }
      bus.peak = peak;
      bus.rms = Math.sqrt(sumSq / bus.waveform.length);

      // 4. Multi-band Analysis (Simple Frequency Averaging)
      // FFT size is 1024, so bins are 0..511. 
      // Sample rate typically 44.1kHz -> ~43Hz per bin.
      // Bass: 20-250Hz (~ bins 0-6)
      // Mid: 250-4000Hz (~ bins 6-93)
      // High: 4000-20000Hz (~ bins 93-511)
      
      bus.bands = {
        bass: this.getAverage(bus.fft, 0, 6),
        mid: this.getAverage(bus.fft, 6, 93),
        high: this.getAverage(bus.fft, 93, 511),
        // Granular 5-band split (adjusted for more musical energy in highs)
        low: this.getAverage(bus.fft, 0, 4),      // 0 - 170Hz
        lowMid: this.getAverage(bus.fft, 4, 12),   // 170 - 500Hz
        midGranular: this.getAverage(bus.fft, 12, 47), // 500 - 2000Hz
        highMid: this.getAverage(bus.fft, 47, 93),  // 2000 - 4000Hz
        highGranular: this.getAverage(bus.fft, 93, 511) // 4000 - 22000Hz (Full range)
      };

      // 5. Onset Detection
      const prevOnset = bus.onset;
      bus.onset = bus.bands.bass > 0.4 && peak > 0.6 && !prevOnset;
    });
  }

  private getAverage(fft: Float32Array, start: number, end: number): number {
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += fft[i];
    }
    const avg = sum / (end - start);
    // Convert dB (-100 to 0) to linear (0 to 1) 
    // We use a higher floor (-70dB) and steeper curve for better modulation sensitivity
    const floor = -70;
    return Math.max(0, (avg - floor) / Math.abs(floor));
  }

  public getBusData(id: string): AudioBusData | undefined {
    return this.buses.get(id);
  }

  public getAllBuses(): AudioBusData[] {
    return Array.from(this.buses.values());
  }

  public setModuleMute(id: string, muted: boolean) {
    const gain = this.moduleGains.get(id);
    if (gain) {
      gain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01);
    }
  }

  public setLayerMute(id: string, muted: boolean) {
    const gain = this.layerGains.get(id);
    if (gain) {
      gain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01);
    }
  }

  public setMasterMute(muted: boolean) {
    this._masterMuted = muted;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.01);
  }

  public get masterMuted() { return this._masterMuted; }

  /**
   * Compatibility method for legacy peak volume calls
   */
  public getPeakVolume(id: string): number {
    return this.buses.get(id)?.peak ?? 0;
  }
}
