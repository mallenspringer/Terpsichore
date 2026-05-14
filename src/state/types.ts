// --- SOURCES ---
export type SourceType = 'None' | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'ImageLoader' | 'ImageFile' | 'AudioInput' | 'AudioFile' | 'SystemAudio' | 'SignalProcessor';

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
}

export interface VideoFileSource {
  id?: string;
  type: 'VideoFile';
  fileUrl: string;
  fileName: string;
  playbackSpeed: number;
  loop: boolean;
  playState: 'play' | 'pause' | 'stop';
  objectFit: 'cover' | 'contain' | 'fill';
  volume: number;
  audioMuted: boolean;
  loopStart?: number;
  loopEnd?: number;
}

export interface WebcamCaptureSource {
  id?: string;
  type: 'WebcamCapture';
  deviceId: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

export interface ImageLoaderSource {
  type: 'ImageLoader';
  imageUrl: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

export interface ImageFileSource {
  type: 'ImageFile';
  fileUrl: string;
  fileName: string;
  objectFit: 'cover' | 'contain' | 'fill';
}

export interface AudioInputSource {
  type: 'AudioInput';
  deviceId: string;
  volume: number;
  muted: boolean;
}

export interface AudioFileSource {
  type: 'AudioFile';
  fileUrl: string;
  fileName: string;
  volume: number;
  muted: boolean;
  loop: boolean;
  playState: 'play' | 'pause' | 'stop';
}

export interface SystemAudioSource {
  type: 'SystemAudio';
  volume: number;
  muted: boolean;
}

export interface SignalProcessorSource {
  type: 'SignalProcessor';
  operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'modulo' | 'pow' | 'min' | 'max';
  operandA: number;
  operandB: number;
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

export type AnySource = NoneSource | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | ImageLoaderSource | ImageFileSource | AudioInputSource | AudioFileSource | SystemAudioSource | SignalProcessorSource | LFOModulatorSource | TriggerPadSource | NoiseModulatorSource | NoiseVideoSource | ColorNoiseSource;

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
  x: number;
  y: number;
  scale: number;
  rotation: number;
  maxCount: number;
  lifetime: number; // seconds
  fadeOut: boolean;
  randomPos: number;
  randomScale: number;
  coordinateMode: 'normalized' | 'pixel';
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

export type SignalType = 'video' | 'audio' | 'modulation' | 'trigger' | 'midi' | 'generic' | 'trajectory';

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


export type AnyEffect = 
  | Transform2DEffect | ColorAdjustEffect | LumaKeyEffect | SimpleFeedbackEffect
  | InterLayerOutputEffect | InterLayerInputEffect | ColorRGBEffect | LumaSplitterEffect 
  | SpawnEffect | PathEffect | InverterEffect | VideoMixerEffect | AlphaAdjustEffect
  | LogicGateEffect | TriggeredGateEffect | PatternEffect | KaleidoscopeEffect 
  | SignalMathEffect | SampleAndHoldEffect | StepSequencerEffect | PixelProcessorEffect
  | AudioSourceEffect | OscilloscopeEffect | SpectralSplitterEffect
  | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | NoiseVideoSource | ColorNoiseSource;

export type EffectType = 
  | 'Transform2D' | 'ColorAdjust' | 'LumaKey' | 'SimpleFeedback' 
  | 'InterLayerOutput' | 'InterLayerInput' 
  | 'ColorRGB' | 'LumaSplitter' | 'Spawn' | 'Path' | 'Inverter' | 'VideoMixer' | 'AlphaAdjust'
  | 'LogicGate' | 'TriggeredGate' | 'Pattern' | 'Kaleidoscope' | 'SignalMath' | 'SampleAndHold' | 'StepSequencer' | 'AudioSource' | 'Oscilloscope' | 'SpectralSplitter' | 'PixelProcessor'
  | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'NoiseSource' | 'ColorNoise';

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
