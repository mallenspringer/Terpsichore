// --- SOURCES ---
export type SourceType = 'None' | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'ImageLoader' | 'ImageFile' | 'AudioInput' | 'AudioFile' | 'SystemAudio';

export interface NoneSource {
  type: 'None';
}

export interface ShapeGeneratorSource {
  id?: string;
  type: 'ShapeGenerator';
  shapeType: 'rectangle' | 'ellipse' | 'polygon';
  sides: number;         // 3 to 32
  roundness: number;     // 0.0 to 1.0
  convexity: number;     // 0.1 to 1.0 (star amount)
  rotation: number;      // 0 to 360
  strokeWidth: number;   // 0.0 for fill, > 0 for outline
  strokeMode: 'classic' | 'hollow';
  strokeThreshold: number; // 0.0 to 1.0
  x: number;
  y: number;
  scale: number;
  fillColor: [number, number, number, number];
  edgeSoftness: number;
  morph?: number; // 0.0 to 1.0 continuous SDF shape morph
}

export interface VideoURLSource {
  id?: string;
  type: 'VideoURL';
  videoUrl: string;
  playbackSpeed: number;
  loop: boolean;
  playState: 'play' | 'pause' | 'stop';
  objectFit: 'cover' | 'contain' | 'fill';
  volume: number;
  audioMuted: boolean;
  loopStart?: number;
  loopEnd?: number;
  resetTarget?: 'start flag' | 'start of file';
}

export interface VideoFileSource {
  id?: string;
  type: 'VideoFile';
  fileUrl: string;
  filePath?: string;
  fileName: string;
  playbackSpeed: number;
  loop: boolean;
  playState: 'play' | 'pause' | 'stop';
  objectFit: 'cover' | 'contain' | 'fill';
  volume: number;
  audioMuted: boolean;
  loopStart?: number;
  loopEnd?: number;
  resetTarget?: 'start flag' | 'start of file';
}

export interface WebcamCaptureSource {
  id?: string;
  type: 'WebcamCapture';
  deviceId: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

export interface ImageLoaderSource {
  id?: string;
  type: 'ImageLoader';
  imageUrl: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

export interface ImageFileSource {
  id?: string;
  type: 'ImageFile';
  fileUrl: string;
  filePath?: string;
  fileName: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

export interface AudioInputSource {
  id?: string;
  type: 'AudioInput';
  deviceId: string;
  volume: number;
  muted: boolean;
}

export interface AudioFileSource {
  id?: string;
  type: 'AudioFile';
  fileUrl: string;
  filePath?: string;
  fileName: string;
  volume: number;
  muted: boolean;
  loop: boolean;
  playState: 'play' | 'pause' | 'stop';
  loopStart?: number;
  loopEnd?: number;
  playbackSpeed: number;
  resetTarget?: 'start flag' | 'start of file';
}

export interface SystemAudioSource {
  id?: string;
  type: 'SystemAudio';
  volume: number;
  muted: boolean;
}



export interface LFOModulatorSource {
  type: 'LFO';
  waveform: 'sine' | 'triangle' | 'square' | 'saw' | 'random';
  frequency: number;   // 0.01 to 20Hz
  speedRange: 'low' | 'high';
  amplitude: number;   // 0 to 1
  offset: number;      // -1 to 1
  bipolar: boolean;    // true = -1 to 1, false = 0 to 1
}

export interface NoiseModulatorSource {
  type: 'Noise';
  noiseType: 'white' | 'pink' | 'brownian' | 'value' | 'perlin';
  frequency: number;
  amplitude: number;
  octaves: number;
  persistence: number;
  bipolar: boolean;
  frozen: boolean;
  manualTriggerTime: number;
}

export interface NoiseVideoSource {
  id?: string;
  type: 'NoiseSource';
  noiseType: 'fbm' | 'worley' | 'white' | 'perlin';
  scale: number;
  evolution: number;
  octaves: number;
  persistence: number;
  seed: number;
  brightness: number;
  contrast: number;
  flowSpeed: number;
  autoAnimate: boolean;
}

export interface TriggerPadSource {
  type: 'TriggerPad';
  label: string;
  value: number; // 0 or 1
  isPressed: boolean;
  isToggle: boolean;
  keyMapping?: string;
  useEnvelope?: boolean;
  attack?: number;
  release?: number;
}

export interface ColorNoiseSource {
  id?: string;
  type: 'ColorNoise';
  noiseType: 'fbm' | 'worley' | 'white' | 'perlin' | 'simplex' | 'ridged' | 'billow' | 'voronoi' | 'warped';
  scale: number;
  evolution: number;
  octaves: number;
  persistence: number;
  seed: number;
  brightness: number;
  contrast: number;
  flowSpeed: number;
  autoAnimate: boolean;
}

export interface MidiInputSource {
  type: 'MidiInput';
  channel: 'all' | number;
  ccNumber: number;
  clockDivision: '1/4' | '1/8' | '1/16' | '1/32';
}

export type TargetType = 'absolute' | 'query';

export interface AbsoluteTargetSpec {
  type: 'absolute';
  layerId: string;
  moduleId: string; // The UUID of the module (e.g. 'transform2d_123')
  paramId: string;  // The parameter (e.g. 'scaleX')
}

export interface QueryTargetSpec {
  type: 'query';
  layerId: string;
  moduleType: string; // Matches source/effect type (e.g., 'ShapeGenerator')
  index: number;      // e.g. 0 (first instance)
  paramId: string;    // The parameter
}

export interface MidiBinding {
  id: string;
  type: 'parameter' | 'global' | 'bank_cycle';
  target: AbsoluteTargetSpec | QueryTargetSpec;
  targetAction?: 'mute_global' | 'pause_global' | 'cycle_active_layer' | 'mute_layer_1' | 'mute_layer_2' | 'mute_layer_3' | 'mute_layer_4';
  midiSource: {
    channel: 'all' | number;
    ccNumber?: number;
    noteNumber?: number;
  };
  range: [number, number]; // [min, max]
  invert: boolean;
}

export type AnySource = NoneSource | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | ImageLoaderSource | ImageFileSource | AudioInputSource | AudioFileSource | SystemAudioSource | LFOModulatorSource | TriggerPadSource | NoiseModulatorSource | NoiseVideoSource | ColorNoiseSource | MidiInputSource;

// --- EFFECTS ---

export interface Transform2DEffect {
  id: string; // Unique ID for mapping
  type: 'Transform2D';
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  spin: number;
}

export interface ColorAdjustEffect {
  id: string;
  type: 'ColorAdjust';
  hue: number; // 0 to 360
  saturation: number; // 0.0 to 2.0
  contrast: number; // 0.0 to 2.0
  brightness: number; // -1.0 to 1.0
  invert: boolean;
}

export interface LumaKeyEffect {
  id: string;
  type: 'LumaKey';
  threshold: number; // 0.0 to 1.0
  tolerance: number; // 0.0 to 1.0
  invertKey: boolean;
}

export interface SimpleFeedbackEffect {
  id: string;
  type: 'SimpleFeedback';
  feedbackAmount: number; // 0.0 to 0.99
  zoom: number; // e.g., 0.9 to 1.1
  angle: number; // rotation in radians
}



export interface SampleAndHoldEffect {
  id: string;
  type: 'SampleAndHold';
  lastSampledValue: number;
  manualTriggerTime: number;
  keyMapping?: string;
  isLive: boolean;
  triggerMode: 'sample_show' | 'freeze_toggle' | 'sample_only';
}

export interface InterLayerOutputEffect {
  id: string;
  type: 'InterLayerOutput';
  portCount: number; // 1 to 3
}

export interface InterLayerInputEffect {
  id: string;
  type: 'InterLayerInput';
  portCount: number; // 1 to 3
}

export interface ColorRGBEffect {
  id: string;
  type: 'ColorRGB';
  r: number;
  g: number;
  b: number;
  rMode: 'add' | 'mult';
  gMode: 'add' | 'mult';
  bMode: 'add' | 'mult';
  rInputMode: 'channel' | 'luma';
  gInputMode: 'channel' | 'luma';
  bInputMode: 'channel' | 'luma';
}


export interface LumaSplitterEffect {
  id: string;
  type: 'LumaSplitter';
  threshold1: number; // Low-Mid
  threshold2: number; // Mid-High
  softness: number;   // Cross-fade width
}

export interface SpawnEffect {
  id: string;
  type: 'Spawn';
  emissionMode: 'trigger' | 'rate' | 'array';
  emitRate: number; // clones per second (default 2)
  disseminationMode: 'cone' | 'burst' | 'array';
  maxCount: number; // 1 to 64, default 16
  lifetime: number; // seconds, default 3.0
  speed: number; // initial velocity 0 to 2, default 0.3
  angle: number; // launch angle in degrees, 0 to 360, default 90 (upwards)
  coneSpread: number; // cone angle in degrees, 0 to 180, default 45
  gravity: number; // downward acceleration -2 to 2, default 0.0
  drag: number; // air resistance 0 to 1, default 0.05
  spin: number; // angular rotation speed -5 to 5, default 0
  x: number; // spawn center x, -1 to 1, default 0
  y: number; // spawn center y, -1 to 1, default 0
  scale: number; // initial scale 0.05 to 2, default 0.5
  scaleEnd: number; // end scale 0.0 to 2, default 0.1
  fadeOut: boolean; // default true
  randomPos: number; // random offset spread
  randomScale: number; // random scale variance
  coordinateMode: 'normalized' | 'pixel';
  manualTriggerTime?: number;
  manualResetTime?: number;
  latchedPorts?: string[];
  globalLatch?: boolean;
}

export interface VideoMixerEffect {
  id: string;
  type: 'VideoMixer';
  v1: number;
  v2: number;
  v3: number;
  v4: number;
  v1Alpha: number;
  v2Alpha: number;
  v3Alpha: number;
  v4Alpha: number;
  v1Mode: 'add' | 'normal' | 'screen' | 'mult';
  v2Mode: 'add' | 'normal' | 'screen' | 'mult';
  v3Mode: 'add' | 'normal' | 'screen' | 'mult';
  v4Mode: 'add' | 'normal' | 'screen' | 'mult';
  masterGain: number;
  crossfader?: number; // 0.0 (Bus A = Ch1/Ch2) to 1.0 (Bus B = Ch3/Ch4)
  crossfadeEnabled?: boolean;
}

export interface KeyMixerEffect {
  id: string;
  type: 'KeyMixer';
  mode: 'luma' | 'chroma';
  threshold: number; // 0..1
  tolerance: number; // 0..1
  spillSuppression: number; // 0..1
  keyColorR: number; // 0..1
  keyColorG: number; // 0..1
  keyColorB: number; // 0..1
  invertMask: boolean;
  blendMode: 'normal' | 'add' | 'screen' | 'mult';
  masterGain: number;
  outputMode: 'composite' | 'matte' | 'keyedFg';
}

export interface VideoMathEffect {
  id: string;
  type: 'VideoMath';
  operation: 'add' | 'subtract' | 'multiply' | 'min' | 'max' | 'difference' | 'screen' | 'divide' | 'average';
  gainA: number;
  gainB: number;
  offset: number;
  clampOutput: boolean;
  masterGain: number;
}

export interface PathEffect {
  id: string;
  type: 'Path';
  mode: 'physics' | 'wiggle' | 'orbit';
  speed: number; // e.g. Rising speed or orbit speed
  strength: number; // e.g. Wobble amount or gravity strength
  frequency: number; // e.g. Wobble frequency
  drift: number; // e.g. Horizontal wind
}

export interface StepSequencerEffect {
  id: string;
  type: 'StepSequencer';
  steps: 8 | 16;
  currentStep: number;
  rate: number; // Hz or BPM
  rateMode: 'hz' | 'bpm';
  shuffle: number; // 0 to 1
  slew: number; // 0 to 1
  playState: 'play' | 'pause';
  direction: 'forward' | 'backward' | 'pendulum' | 'random';
  stepValues: number[]; // Array of 16 values
  stepBipolar?: boolean[]; // Array of 16 booleans
  allStepsBipolar?: boolean;
  endStep: number; // 0 to 15
  manualResetTrigger?: number;
}

export interface AudioSourceEffect {
  id: string;
  type: 'AudioSource';
  busId: string;
}

export interface OscilloscopeEffect {
  id: string;
  type: 'Oscilloscope';
  isFrozen: boolean;
  triggerLevel: number;
  timeScale: number;
}

export interface SpectralSplitterEffect {
  id: string;
  type: 'SpectralSplitter';
  busId: string;
  smoothing: number;   // 0 to 0.99
  sensitivity: number; // 0.1 to 10
}

export interface AudioTransformerEffect {
  id: string;
  type: 'AudioTransformer';
  filterType: 'lowpass' | 'highpass' | 'bandpass';
  filterFreq: number;
  filterResonance: number; // Mapping from filterDepth
  compSustain: number;    // Macro for threshold/ratio
  outputGain: number;     // Final output level
  envelopeAttack: number;
  envelopeRelease: number;
  bypass: boolean;
  bypassLatching: boolean;
}

export interface AudioModulatorEffect {
  id: string;
  type: 'AudioModulator';
  ringFreq: number;
  ringMix: number;
  octaveSub2: number; // -2 oct
  octaveSub1: number; // -1 oct
  octaveClean: number; // dry
  octaveHigh1: number; // +1 oct
  octaveHigh2: number; // +2 oct
  bypass: boolean;
}

export interface AudioGateEffect {
  id: string;
  type: 'AudioGate';
  thresholdDb: number; // -80 to 0
  bypass: boolean;
  bypassLatching: boolean;
  releaseMs: number; // 10 to 1000 ms
}

export interface AudioToCVEffect {
  id: string;
  type: 'AudioToCV';
  mode: 'rms' | 'peak' | 'envelope' | 'db';
  gain: number;            // Sensitivity multiplier (default: 1.0, 0.1 to 10.0)
  attack: number;          // ms for envelope mode (default: 10, 1 to 500)
  release: number;         // ms for envelope mode (default: 100, 5 to 2000)
  smoothing: number;       // smoothing factor for RMS/Peak/dB (default: 0.1, 0.0 to 0.99)
  gateThreshold: number;   // threshold for gate_out (default: 0.4, 0.0 to 1.0)
  bipolar: boolean;        // if true, maps 0..1 to -1..1 (default: false)
}

export interface SpeechEnvelopeTrackerEffect {
  id: string;
  type: 'SpeechEnvelopeTracker';
  layerId: string;
  attackMs: number;
  releaseMs: number;
  sensitivityDb: number;
  speechContinuous?: boolean;
  silenceContinuous?: boolean;
}

export interface VocalPitchTrackerEffect {
  id: string;
  type: 'VocalPitchTracker';
  layerId: string;
  minPitchHz: number;
  maxPitchHz: number;
  tolerance: number;
  pitchRangeMode?: 'voice' | 'music';
}

export interface VowelFormantTrackerEffect {
  id: string;
  type: 'VowelFormantTracker';
  layerId: string;
  smoothing: number;
  voiceProfile?: 'universal' | 'baritone_bass' | 'tenor_contralto_alto' | 'mezzo_soprano';
}

export interface SpokenWordVisualizerEffect {
  id: string;
  type: 'SpokenWordVisualizer';
  layerId: string;
  renderMode: 'Constellation' | 'FlowingRibbon' | 'RadialWaterfall';
  colorPalette: string;
}

export type SignalType = 'video' | 'audio' | 'modulation' | 'trigger' | 'midi' | 'generic' | 'trajectory' | 'palette';

export interface InterLayerEdge {
  id: string;
  fromLayerId: string;
  fromEffectId: string;
  fromPortIdx: number; // 0, 1, 2
  toLayerId: string;
  toEffectId: string;
  toPortIdx: number;
}

export interface InverterEffect {
  id: string;
  type: 'Inverter';
  videoMode: 'luma' | 'chroma' | 'rgb';
  cvMode: 'unipolar' | 'bipolar';
  triggerMode: 'momentary' | 'latch';
  mix: number;
  active: boolean;
}

export interface LogicGateEffect {
  id: string;
  type: 'LogicGate';
  mode: 'and' | 'or' | 'xor' | 'nand' | 'nor';
  thresholdA: number;
  thresholdB: number;
}

export interface TriggeredGateEffect {
  id: string;
  type: 'TriggeredGate';
  gateMode: 'momentary' | 'latch';
  defaultState: 'on' | 'off';
  threshold: number;
  active?: boolean; // internal state for trigger tracking
  gateOpen?: boolean; // final resolved gate state for renderer
}

export interface PatternEffect {
  id: string;
  type: 'Pattern';
  countX: number;
  countY: number;
  spacingX: number;
  spacingY: number;
  offsetX: number;
  offsetY: number;
  alternateMirrorX: boolean;
  alternateMirrorY: boolean;
  syncCount: boolean;
  syncSpacing: boolean;
  syncOffset: boolean;
  mirrorXTrigger: boolean;
  mirrorYTrigger: boolean;
  mode?: 'grid' | 'radial';
  radialRings?: number;
  radialSegments?: number;
  tileRotation?: number;
  jitter?: number;
}

export interface UVDisplaceEffect {
  id: string;
  type: 'UVDisplace';
  amount: number;       // Master depth 0.0 .. 1.0 (default 0.2)
  amountX: number;      // 0.0 .. 2.0 (default 1.0)
  amountY: number;      // 0.0 .. 2.0 (default 1.0)
  mode: 'cartesian' | 'radial' | 'luma';
  wrapMode: 'clamp' | 'wrap' | 'mirror';
}

export interface KaleidoscopeEffect {
  id: string;
  type: 'Kaleidoscope';
  segments: number;
  angle: number;
  zoom: number;
  center: [number, number];
}

export interface SignalMathEffect {
  id: string;
  type: 'SignalMath';
  operator: 'add' | 'subtract' | 'multiply' | 'divide' | 'min' | 'max' | 'pow';
  operandA: number;
  operandB: number;
}

export interface AlphaAdjustEffect {
  id: string;
  type: 'AlphaAdjust';
  amount: number;
  invertAmount: boolean;
  bypass: boolean;
  bypassMode: 'momentary' | 'latch';
}

export interface PixelProcessorEffect {
  id: string;
  type: 'PixelProcessor';
  posterizeActive: boolean;
  posterizeLevels: number;
  thresholdActive: boolean;
  thresholdValue: number;
  thresholdSoftness: number;
  edgeActive: boolean;
  edgeAmount: number;
  edgeThreshold: number;
  bypass: boolean;
}


export interface CanvasBackgroundEffect {
  id: string;
  type: 'CanvasBackground';
  mode: 'solid' | 'linear' | 'radial';
  colorA: [number, number, number, number];
  colorB: [number, number, number, number];
  colorC: [number, number, number, number];
  useThreeColors: boolean;
  angle: number; // in degrees 0..360
  spread: number; // 0..1, default 0.5
  radialCenterX: number; // 0..1, default 0.5
  radialCenterY: number; // 0..1, default 0.5
  radialRadius: number; // default 0.7
  luma: number; // -1..1, default 0
  chroma: number; // -1..1, default 0
}

export interface ParticleCloudEffect {
  id: string;
  type: 'ParticleCloud';
  particleCount: number;      // 1000 to 100000 (default: 20000)
  speed: number;              // 0.1 to 3.0 (default: 0.8)
  spread: number;             // 0.1 to 2.0 (default: 0.5)
  turbulence: number;         // 0.0 to 3.0 (default: 1.0, curl noise scale)
  noiseFreq: number;          // 0.1 to 5.0 (default: 1.2)
  lifetime: number;           // 0.5 to 10.0 (default: 3.0)
  pointSize: number;          // 1.0 to 20.0 (default: 4.0)
  colorPalette: 'neon' | 'fire' | 'aurora' | 'electric' | 'starlight' | 'spectrum';
  blendMode: 'additive' | 'alpha';
  emitterShape: 'point' | 'ring' | 'disc' | 'line';
  emitterRadius: number;      // 0.01 to 1.0 (default: 0.1)
  emitterX: number;           // -1.0 to 1.0 (default: 0.0)
  emitterY: number;           // -1.0 to 1.0 (default: 0.0)
  gravityX: number;           // -2.0 to 2.0 (default: 0.0)
  gravityY: number;           // -2.0 to 2.0 (default: 0.0)
  burstTriggerTime?: number;
  resetTriggerTime?: number;
  audioReactivity: boolean;   // default: true
  audioSensitivity: number;   // 0.1 to 3.0 (default: 1.0)
}

export interface ColorStop {
  id: string;
  color: [number, number, number, number]; // [r, g, b, a] in 0..1
  weight: number;                          // 0.1 to 10.0 (default: 1.0)
  active: boolean;                         // default true
}

export interface ColorPaletteEffect {
  id: string;
  type: 'ColorPalette';
  colors: ColorStop[];                     // 1 to 8 color stops
  interpolation: 'linear' | 'stepped' | 'smooth';
  shuffleTriggerTime?: number;
}

export type AnyEffect = 
  | Transform2DEffect | ColorAdjustEffect | LumaKeyEffect | SimpleFeedbackEffect
  | InterLayerOutputEffect | InterLayerInputEffect | ColorRGBEffect | LumaSplitterEffect 
  | SpawnEffect | PathEffect | InverterEffect | VideoMixerEffect | AlphaAdjustEffect
  | KeyMixerEffect | VideoMathEffect | UVDisplaceEffect
  | LogicGateEffect | TriggeredGateEffect | PatternEffect | KaleidoscopeEffect 
  | SignalMathEffect | SampleAndHoldEffect | StepSequencerEffect | PixelProcessorEffect
  | AudioSourceEffect | OscilloscopeEffect | SpectralSplitterEffect | AudioTransformerEffect | AudioModulatorEffect | AudioGateEffect | AudioToCVEffect
  | SpeechEnvelopeTrackerEffect | VocalPitchTrackerEffect | VowelFormantTrackerEffect | SpokenWordVisualizerEffect
  | CanvasBackgroundEffect | ParticleCloudEffect | ColorPaletteEffect
  | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | NoiseVideoSource | ColorNoiseSource
  | AudioInputSource | AudioFileSource | SystemAudioSource | ImageLoaderSource | ImageFileSource;

export type EffectType = 
  | 'Transform2D' | 'ColorAdjust' | 'LumaKey' | 'SimpleFeedback' 
  | 'InterLayerOutput' | 'InterLayerInput' 
  | 'ColorRGB' | 'LumaSplitter' | 'Spawn' | 'Path' | 'Inverter' | 'VideoMixer' | 'AlphaAdjust'
  | 'KeyMixer' | 'VideoMath' | 'UVDisplace'
  | 'LogicGate' | 'TriggeredGate' | 'Pattern' | 'Kaleidoscope' | 'SignalMath' | 'SampleAndHold' | 'StepSequencer' | 'AudioSource' | 'Oscilloscope' | 'SpectralSplitter' | 'PixelProcessor' | 'AudioTransformer' | 'AudioModulator' | 'AudioGate' | 'AudioToCV'
  | 'SpeechEnvelopeTracker' | 'VocalPitchTracker' | 'VowelFormantTracker' | 'SpokenWordVisualizer'
  | 'CanvasBackground' | 'ParticleCloud' | 'ColorPalette'
  | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'NoiseSource' | 'ColorNoise' | 'AudioInput' | 'AudioFile' | 'SystemAudio' | 'ImageLoader' | 'ImageFile';

export type GraphNode = AnyEffect;

export interface ResolvedGraphNode {
  id: string;
  type: string;
  kind: 'source' | 'effect' | 'modulator' | 'output';
  node: AnyEffect | AnySource | null;
}

// --- GRAPH ---
export interface GraphEdge {
  id: string;
  fromNodeId: string; // 'source', effectId, or '__output__'
  fromPort: string;
  toNodeId: string;
  toPort: string;
  signalType?: SignalType; // for coloring
  isAuto?: boolean;   // managed by auto-wiring logic
}

export interface LayerGraph {
  edges: GraphEdge[];
  manualOutputTarget?: string; // nodeId if user manually moved output edge
  disconnectedPorts?: string[]; // "nodeId.portId" for auto-edges that were manually removed
}

// --- LAYERS ---
export interface PortSettings {
  amount: number;   // 0.0 to 1.0
  bipolar: boolean; // if true, converts 0-1 to -1 to 1
  invert?: boolean;  // if true, inverts 0-1 range to 1-0 range (decreases on increase)
  latch?: boolean;   // if true/false for triggers: toggle/latch mode vs momentary mode
}

export interface LayerState {
  id: string;
  name: string;
  source: AnySource;
  effects: AnyEffect[];
  modulators: Record<string, AnySource>;
  opacity: number;
  blendMode: 'add' | 'screen' | 'multiply' | 'normal';
  muted?: boolean;
  audioMuted?: boolean;
  graph?: LayerGraph;
  signalValues?: Record<string, number>; // Live values for nodes in this layer
  inputSettings?: Record<string, PortSettings>; // key: "nodeId.portId"
  linkedScales?: Record<string, boolean>; // key: effectId
}

// --- ENGINE STATE ---
export interface EngineState {
  layers: Record<string, LayerState>;
  layerOrder: string[];
  activeLayerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  midiBindings: MidiBinding[];
  midiLearnTarget: AbsoluteTargetSpec | QueryTargetSpec | null;
  midiOverlayActive: boolean;
}

// --- AUDIO TYPES ---

export interface AudioBusData {
  id: string;
  name: string;
  peak: number;
  rms: number;
  fft: Float32Array;
  waveform: Float32Array;
  onset: boolean;
  bpm: number;
  confidence: number;
  bands: {
    bass: number;
    mid: number;
    high: number;
    // New 5-band analysis
    low: number;
    lowMid: number;
    midGranular: number;
    highMid: number;
    highGranular: number;
  };
}

export interface AudioEngineState {
  buses: Record<string, AudioBusData>;
  masterVolume: number;
  isMuted: boolean;
}
