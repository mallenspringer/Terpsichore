// --- SOURCES ---
export type SourceType = 'None' | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'ImageLoader' | 'ImageFile' | 'AudioInput' | 'AudioFile' | 'SystemAudio' | 'SignalProcessor' | 'AudioAnalyzer';

export interface NoneSource {
  type: 'None';
}

export interface ShapeGeneratorSource {
  type: 'ShapeGenerator';
  shapeType: 'rectangle' | 'ellipse' | 'polygon';
  sides: number;         // 3 to 32
  roundness: number;     // 0.0 to 1.0
  convexity: number;     // 0.1 to 1.0 (star amount)
  rotation: number;      // 0 to 360
  strokeWidth: number;   // 0.0 for fill, > 0 for outline
  x: number;
  y: number;
  scale: number;
  fillColor: [number, number, number, number];
  tiling: [number, number];
  tilingMode: 'repeat' | 'mirror' | 'clamp';
  edgeSoftness: number;
}

export interface VideoURLSource {
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
}

export interface NoiseVideoSource {
  type: 'NoiseSource';
  noiseType: 'perlin' | 'worley' | 'simplex';
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

export type AnySource = NoneSource | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | ImageLoaderSource | ImageFileSource | AudioInputSource | AudioFileSource | SystemAudioSource | SignalProcessorSource | LFOModulatorSource | TriggerPadSource | NoiseModulatorSource | NoiseVideoSource;

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

export interface AudioAnalyzerEffect {
  id: string;
  type: 'AudioAnalyzer';
  smoothing: number; // 0.0 to 0.99
}

export interface BipolarConverterEffect {
  id: string;
  type: 'BipolarConverter';
  conversionMode: 'to_bipolar' | 'to_unipolar';
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
}

export interface RGBMixerEffect {
  id: string;
  type: 'RGBMixer';
  rLevel: number;
  gLevel: number;
  bLevel: number;
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

export interface PathEffect {
  id: string;
  type: 'Path';
  mode: 'physics' | 'wiggle' | 'orbit';
  speed: number; // e.g. Rising speed or orbit speed
  strength: number; // e.g. Wobble amount or gravity strength
  frequency: number; // e.g. Wobble frequency
  drift: number; // e.g. Horizontal wind
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

export type AnyEffect = 
  | Transform2DEffect | ColorAdjustEffect | LumaKeyEffect 
  | SimpleFeedbackEffect | AudioAnalyzerEffect | BipolarConverterEffect
  | InterLayerOutputEffect | InterLayerInputEffect | ColorRGBEffect 
  | LumaSplitterEffect | RGBMixerEffect | SpawnEffect | PathEffect;

export type EffectType = 
  | 'Transform2D' | 'ColorAdjust' | 'LumaKey' | 'SimpleFeedback' 
  | 'AudioAnalyzer' | 'BipolarConverter' | 'InterLayerOutput' | 'InterLayerInput' 
  | 'ColorRGB' | 'LumaSplitter' | 'RGBMixer' | 'Spawn' | 'Path';

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
