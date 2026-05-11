export class AudioEngine {
  private static instance: AudioEngine;
  
  public context: AudioContext;
  private sources: Map<string, MediaElementAudioSourceNode> = new Map();
  private analyzers: Map<string, AnalyserNode> = new Map();
  private moduleGains: Map<string, GainNode> = new Map();
  private layerGains: Map<string, GainNode> = new Map();
  private masterGain: GainNode;
  
  // A shared Float32Array to read frequency/time data (avoids garbage collection overhead)
  private dataArray: Float32Array;
  private _masterMuted = false;

  private constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.dataArray = new Float32Array(256); // 256 is the default fftSize/2
    
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
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

  public registerMediaElement(id: string, element: HTMLMediaElement) {
    if (this.sources.has(id)) {
      return; // Already registered
    }

    try {
      const source = this.context.createMediaElementSource(element);
      const moduleGain = this.context.createGain();
      const analyzer = this.context.createAnalyser();
      const layerGain = this.context.createGain();
      
      analyzer.fftSize = 512;
      analyzer.smoothingTimeConstant = 0.5;

      // Chain: Source -> ModuleMute -> Analyzer -> LayerMute -> Master -> Output
      source.connect(moduleGain);
      moduleGain.connect(analyzer);
      analyzer.connect(layerGain);
      layerGain.connect(this.masterGain);

      this.sources.set(id, source);
      this.moduleGains.set(id, moduleGain);
      this.analyzers.set(id, analyzer);
      this.layerGains.set(id, layerGain);
      
    } catch (e) {
      console.error(`[AudioEngine] Failed to register element ${id}`, e);
    }
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
  }

  /**
   * Returns the current peak volume (0.0 to 1.0) of the given element.
   * This is very fast and safe to call 60 times a second.
   */
  public getPeakVolume(id: string): number {
    const analyzer = this.analyzers.get(id);
    if (!analyzer) return 0;

    analyzer.getFloatTimeDomainData(this.dataArray);
    
    let max = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const val = Math.abs(this.dataArray[i]);
      if (val > max) {
        max = val;
      }
    }
    
    // RMS might be better for perceived loudness, but peak is great for triggers
    return Math.min(1.0, max);
  }
}
