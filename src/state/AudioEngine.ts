import { AudioBusData } from './types';

export class AudioEngine {
  private static instance: AudioEngine;

  public context: AudioContext;
  private sources: Map<string, MediaElementAudioSourceNode> = new Map();
  private analyzers: Map<string, AnalyserNode> = new Map();
  private moduleGains: Map<string, GainNode> = new Map();
  private layerGains: Map<string, GainNode> = new Map();
  private masterGain: GainNode;

  // Dynamic Effect Nodes for Audio Transformers
  private processingNodes: Map<string, {
    input: GainNode;
    filter: BiquadFilterNode;
    comp: DynamicsCompressorNode;
    dryGain: GainNode;
    wetGain: GainNode;
    output: GainNode;
    analyzer: AnalyserNode;
    bus: AudioBusData;
  }> = new Map();

  private modulatorNodes: Map<string, {
    input: GainNode;
    ringOsc: OscillatorNode;
    ringMult: GainNode;
    ringMix: GainNode;
    octaveClean: GainNode;
    octaveHigh1: WaveShaperNode;
    octaveHigh2: WaveShaperNode;
    octaveHigh1Gain: GainNode;
    octaveHigh2Gain: GainNode;
    octaveSub1: GainNode;
    octaveSub2: GainNode;
    output: GainNode;
    analyzer: AnalyserNode;
    bus: AudioBusData;
  }> = new Map();

  private activeConnections: Map<string, string> = new Map(); // nodeId -> fromBusId
  private activeModConnections: Map<string, string> = new Map(); // nodeId -> fromBusId
  private activeLayerAudioTargets: Map<string, string | null> = new Map(); // layerId -> busId or null (default source)

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

      // Chain: Source -> Analyzer -> ModuleGain -> LayerGain -> Master -> Output
      source.connect(analyzer);
      analyzer.connect(moduleGain);
      moduleGain.connect(layerGain);
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
  
  public async registerStream(id: string, stream: MediaStream) {
    if (this.sources.has(id)) return;
    
    try {
      const source = this.context.createMediaStreamSource(stream);
      const moduleGain = this.context.createGain();
      const analyzer = this.context.createAnalyser();
      const layerGain = this.context.createGain();

      analyzer.fftSize = this.fftSize;
      // Chain: Source -> Analyzer -> ModuleGain -> LayerGain -> Master -> Output
      source.connect(analyzer);
      analyzer.connect(moduleGain);
      moduleGain.connect(layerGain);
      layerGain.connect(this.masterGain);

      this.sources.set(id, source as any); // Cast as MediaStreamSource is slightly different but works for connect
      this.moduleGains.set(id, moduleGain);
      this.analyzers.set(id, analyzer);
      this.layerGains.set(id, layerGain);
      
      this.initializeBus(id, `Stream ${id}`);
    } catch (e) {
      console.error(`[AudioEngine] Failed to register stream ${id}`, e);
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
   * (Uses runAnalysis helper below)
   */

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
   * Creates or updates a processing chain for an AudioTransformer module
   */
  public updateTransformerNode(nodeId: string, params: {
    filterType: BiquadFilterType;
    filterFreq: number;
    filterQ: number;
    compThreshold: number;
    compRatio: number;
    outputGain: number;
    bypass: boolean;
  }) {
    let nodes = this.processingNodes.get(nodeId);
    
    if (!nodes) {
      const input = this.context.createGain();
      const filter = this.context.createBiquadFilter();
      const comp = this.context.createDynamicsCompressor();
      const dryGain = this.context.createGain();
      const wetGain = this.context.createGain();
      const output = this.context.createGain();
      const analyzer = this.context.createAnalyser();
      analyzer.fftSize = this.fftSize;

      // Chain Setup
      input.connect(dryGain);
      dryGain.connect(output);
      
      input.connect(wetGain);
      wetGain.connect(filter);
      filter.connect(comp);
      comp.connect(output);
      
      output.connect(analyzer);

      const bus: AudioBusData = {
        id: nodeId,
        name: `Transformer ${nodeId}`,
        peak: 0, rms: 0,
        fft: new Float32Array(this.fftSize / 2),
        waveform: new Float32Array(this.fftSize),
        onset: false, bpm: 120, confidence: 0,
        bands: { bass: 0, mid: 0, high: 0, low: 0, lowMid: 0, midGranular: 0, highMid: 0, highGranular: 0 }
      };

      nodes = { input, filter, comp, dryGain, wetGain, output, analyzer, bus };
      this.processingNodes.set(nodeId, nodes);
      this.buses.set(nodeId, bus);
    }

    // Update Params
    const now = this.context.currentTime;
    
    // Bypass Logic
    const dryVal = params.bypass ? 1.0 : 0.0;
    const wetVal = params.bypass ? 0.0 : 1.0;
    nodes.dryGain.gain.setTargetAtTime(dryVal, now, 0.02);
    nodes.wetGain.gain.setTargetAtTime(wetVal, now, 0.02);

    if (!params.bypass) {
      nodes.filter.type = params.filterType;
      nodes.filter.frequency.setTargetAtTime(params.filterFreq, now, 0.05);
      nodes.filter.Q.setTargetAtTime(params.filterQ, now, 0.05);
      nodes.comp.threshold.setTargetAtTime(params.compThreshold, now, 0.05);
      nodes.comp.ratio.setTargetAtTime(params.compRatio, now, 0.05);
    }

    nodes.output.gain.setTargetAtTime(params.outputGain, now, 0.05);
  }

  public updateModulatorNode(nodeId: string, params: {
    ringFreq: number;
    ringMix: number;
    octaveSub2: number;
    octaveSub1: number;
    octaveClean: number;
    octaveHigh1: number;
    octaveHigh2: number;
    bypass: boolean;
  }) {
    let nodes = this.modulatorNodes.get(nodeId);

    if (!nodes) {
      const input = this.context.createGain();
      const ringOsc = this.context.createOscillator();
      const ringMult = this.context.createGain();
      const ringMix = this.context.createGain();
      const octaveClean = this.context.createGain();
      const octaveHigh1 = this.context.createWaveShaper();
      const octaveHigh2 = this.context.createWaveShaper();
      const octaveHigh1Gain = this.context.createGain();
      const octaveHigh2Gain = this.context.createGain();
      const octaveSub1 = this.context.createGain();
      const octaveSub2 = this.context.createGain();
      const output = this.context.createGain();
      const analyzer = this.context.createAnalyser();
      analyzer.fftSize = this.fftSize;

      // Ring Mod Setup
      ringOsc.type = 'sine';
      ringOsc.start();
      ringMult.gain.value = 0;
      ringOsc.connect(ringMult.gain);
      
      // Octave Curves (Chebyshev Polynomials for harmonic generation)
      const n = 4096;
      const curve1 = new Float32Array(n); // +1 Octave (Rectification)
      for (let i = 0; i < n; i++) {
        const x = (i / (n-1)) * 2 - 1;
        curve1[i] = Math.abs(x) * 2 - 1; 
      }
      octaveHigh1.curve = curve1;
      
      const curve2 = new Float32Array(n); // +2 Octave
      for (let i = 0; i < n; i++) {
        const x = (i / (n-1)) * 2 - 1;
        const x2 = Math.abs(x) * 2 - 1;
        curve2[i] = Math.abs(x2) * 2 - 1;
      }
      octaveHigh2.curve = curve2;

      // Chain Setup
      input.connect(ringMult);
      ringMult.connect(ringMix);
      ringMix.connect(output);

      input.connect(octaveClean);
      octaveClean.connect(output);

      input.connect(octaveHigh1);
      octaveHigh1.connect(octaveHigh1Gain);
      octaveHigh1Gain.connect(output);

      input.connect(octaveHigh2);
      octaveHigh2.connect(octaveHigh2Gain);
      octaveHigh2Gain.connect(output);

      output.connect(analyzer);

      const bus: AudioBusData = {
        id: nodeId,
        name: `Modulator ${nodeId}`,
        peak: 0, rms: 0,
        fft: new Float32Array(this.fftSize / 2),
        waveform: new Float32Array(this.fftSize),
        onset: false, bpm: 120, confidence: 0,
        bands: { bass: 0, mid: 0, high: 0, low: 0, lowMid: 0, midGranular: 0, highMid: 0, highGranular: 0 }
      };

      nodes = { 
        input, ringOsc, ringMult, ringMix, octaveClean, 
        octaveHigh1, octaveHigh2, octaveHigh1Gain, octaveHigh2Gain,
        octaveSub1, octaveSub2, output, analyzer, bus 
      };
      this.modulatorNodes.set(nodeId, nodes);
      this.buses.set(nodeId, bus);
    }

    const now = this.context.currentTime;
    if (params.bypass) {
      nodes.output.gain.setTargetAtTime(0, now, 0.05);
    } else {
      nodes.output.gain.setTargetAtTime(1, now, 0.05);
      nodes.ringOsc.frequency.setTargetAtTime(params.ringFreq, now, 0.05);
      nodes.ringMix.gain.setTargetAtTime(params.ringMix, now, 0.05);
      nodes.octaveClean.gain.setTargetAtTime(params.octaveClean, now, 0.05);
      nodes.octaveHigh1Gain.gain.setTargetAtTime(params.octaveHigh1, now, 0.05);
      nodes.octaveHigh2Gain.gain.setTargetAtTime(params.octaveHigh2, now, 0.05);
    }
  }

  public connectModulator(nodeId: string, fromBusId: string) {
    const nodes = this.modulatorNodes.get(nodeId);
    if (!nodes) return;

    const current = this.activeModConnections.get(nodeId);
    if (current === fromBusId) return;

    const source = this.getBusOutput(fromBusId);
    if (!source) return;

    if (current) {
      const prevSource = this.getBusOutput(current);
      if (prevSource) prevSource.disconnect(nodes.input);
    }

    source.connect(nodes.input);
    this.activeModConnections.set(nodeId, fromBusId);
  }

  public setLayerAudioTarget(layerId: string, fromBusId: string | null) {
    const layerGain = this.layerGains.get(layerId);
    if (!layerGain) return;
    
    const current = this.activeLayerAudioTargets.get(layerId);
    if (current === fromBusId) return;

    // Disconnect current
    if (current === null || current === undefined) {
      // Default: Source -> LayerGain
      const sourceGain = this.moduleGains.get(layerId);
      if (sourceGain) {
        try { sourceGain.disconnect(layerGain); } catch(e) {}
      }
    } else {
      const prevOutput = this.getBusOutput(current);
      if (prevOutput) {
        try { prevOutput.disconnect(layerGain); } catch(e) {}
      }
    }

    // Connect new
    if (fromBusId === null) {
       const sourceGain = this.moduleGains.get(layerId);
       if (sourceGain) sourceGain.connect(layerGain);
       this.activeLayerAudioTargets.set(layerId, null);
    } else {
       const nextOutput = this.getBusOutput(fromBusId);
       if (nextOutput) {
         nextOutput.connect(layerGain);
         this.activeLayerAudioTargets.set(layerId, fromBusId);
       }
    }
  }

  public connectTransformer(nodeId: string, fromBusId: string) {
    const nodes = this.processingNodes.get(nodeId);
    if (!nodes) return;

    const current = this.activeConnections.get(nodeId);
    if (current === fromBusId) return;

    // Disconnect old
    if (current) {
      const oldOutput = this.getBusOutput(current);
      if (oldOutput) {
        try { oldOutput.disconnect(nodes.input); } catch(e) {}
      }
    }

    // Connect new
    const nextOutput = this.getBusOutput(fromBusId);
    if (nextOutput) {
      nextOutput.connect(nodes.input);
      this.activeConnections.set(nodeId, fromBusId);
    }
  }

  private getBusOutput(id: string): AudioNode | undefined {
    if (id === 'master') return this.masterGain;
    return this.moduleGains.get(id) || this.processingNodes.get(id)?.output || this.modulatorNodes.get(id)?.output || this.layerGains.get(id);
  }

  public disconnectNode(nodeId: string) {
    const nodes = this.processingNodes.get(nodeId);
    if (nodes) {
      nodes.input.disconnect();
      nodes.filter.disconnect();
      nodes.comp.disconnect();
      nodes.dryGain.disconnect();
      nodes.wetGain.disconnect();
      nodes.output.disconnect();
      nodes.analyzer.disconnect();
      this.processingNodes.delete(nodeId);
      this.activeConnections.delete(nodeId);
    }

    const mNodes = this.modulatorNodes.get(nodeId);
    if (mNodes) {
      mNodes.input.disconnect();
      try { mNodes.ringOsc.stop(); } catch(e) {}
      mNodes.ringOsc.disconnect();
      mNodes.ringMult.disconnect();
      mNodes.ringMix.disconnect();
      mNodes.octaveClean.disconnect();
      mNodes.octaveHigh1Gain.disconnect();
      mNodes.octaveHigh2Gain.disconnect();
      mNodes.output.disconnect();
      mNodes.analyzer.disconnect();
      this.modulatorNodes.delete(nodeId);
      this.activeModConnections.delete(nodeId);
    }
  }

  public getTransformerBus(nodeId: string): AudioBusData | undefined {
    return this.processingNodes.get(nodeId)?.bus;
  }

  public getTransformerOutput(nodeId: string): AudioNode | undefined {
    return this.processingNodes.get(nodeId)?.output;
  }

  public update() {
    this.analyzers.forEach((analyzer, id) => {
      const bus = this.buses.get(id);
      if (bus) this.runAnalysis(analyzer, bus);
    });

    this.processingNodes.forEach((nodes) => {
      this.runAnalysis(nodes.analyzer, nodes.bus);
    });
  }

  private runAnalysis(analyzer: AnalyserNode, bus: AudioBusData) {
    analyzer.getFloatFrequencyData(bus.fft as any);
    analyzer.getFloatTimeDomainData(bus.waveform as any);

    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < bus.waveform.length; i++) {
      const val = Math.abs(bus.waveform[i]);
      if (val > peak) peak = val;
      sumSq += val * val;
    }
    bus.peak = peak;
    bus.rms = Math.sqrt(sumSq / bus.waveform.length);

    bus.bands = {
      bass: this.getAverage(bus.fft, 0, 6),
      mid: this.getAverage(bus.fft, 6, 93),
      high: this.getAverage(bus.fft, 93, 511),
      low: this.getAverage(bus.fft, 0, 4),
      lowMid: this.getAverage(bus.fft, 4, 12),
      midGranular: this.getAverage(bus.fft, 12, 47),
      highMid: this.getAverage(bus.fft, 47, 93),
      highGranular: this.getAverage(bus.fft, 93, 511)
    };

    const prevOnset = bus.onset;
    bus.onset = bus.bands.bass > 0.4 && peak > 0.6 && !prevOnset;
  }

  public getPeakVolume(id: string): number {
    return this.buses.get(id)?.peak ?? 0;
  }
}
