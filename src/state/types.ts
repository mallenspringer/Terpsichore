// --- SOURCES ---
export type SourceType = 'None' | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'ImageLoader' | 'ImageFile' | 'ImageCue' | 'TextCue' | 'AudioInput' | 'AudioFile' | 'SystemAudio';

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
  mirror?: boolean;
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

export type ImageCueTransition = 'cut' | 'crossfade' | 'fade_black';
export type ImageCueFit = 'fill' | 'cover' | 'contain' | 'center';
export type ImageCueLoopMode = 'loop' | 'stop';

export interface ImageCueBankSlot {
  id: string;                      // e.g. "bank-1"
  name: string;                    // e.g. "Bank 1"
  images: string[];                // list of file URLs / asset paths
  playbackOrder: 'in_order' | 'shuffle';
  loopMode: ImageCueLoopMode;
  autoPlayback: boolean;           // intra-bank auto step
  playbackSpeed: number;           // intra-bank step interval (sec)
  activeImageIndex: number;        // currently selected frame in slot
}

export interface ImageCueSource {
  id?: string;
  type: 'ImageCue';
  
  // Directory & Files
  directoryPath?: string;
  directoryName?: string;
  files: string[];                 // All image file paths/URLs in folder
  fileNames?: string[];            // Original filenames corresponding to files array
  
  // Top-Level Mode
  playbackMode: 'directory' | 'bank'; // 'directory' by default
  
  // Directory Playback Settings
  dirPlaybackOrder: 'in_order' | 'shuffle';
  dirAutoPlayback: boolean;
  dirPlaybackSpeed: number;        // seconds per image
  dirLoopMode: ImageCueLoopMode;
  activeDirIndex: number;
  
  // Bank Grid Configuration
  bankGridMode: '8' | '16';        // '8' by default (2x4 rows), toggleable to '16' (4x4)
  activeBankIndex: number;         // 0 to 15
  banks: ImageCueBankSlot[];       // Exactly 16 slots initialized empty
  bankAutoPlayback: boolean;       // auto rotate across banks
  bankSkipEmpty?: boolean;         // skip empty banks during rotation (default true)
  bankPlaybackSpeed: number;       // seconds per bank
  bankLoopMode: ImageCueLoopMode;
  
  // Sizing & Transitions
  objectFit: ImageCueFit;          // default 'fill' (stretch)
  transitionType: ImageCueTransition; // default 'cut'
  transitionDuration: number;      // 0.125s to 10.0s (default 0.5s)
  
  // Trigger & Modulation Controls
  triggerThreshold: number;        // 0.0 to 1.0 (default 0.5)
  keyMapping?: string;             // manual card step keystroke (none, 1..0)
  bankKeyMapping?: string;         // manual bank step keystroke (none, 1..0)
  midiPadMappings?: Record<number, { note: number; channel: number }>; // Pad 1-16 MIDI bindings
  
  // Ephemeral Render / Transition State
  currentImageUrl?: string;
  prevImageUrl?: string;
  transitionStartTime?: number;    // timestamp for interpolation
}

export interface TextCueCard {
  id: string;
  text: string;
}

export interface TextCueBankSlot {
  id: string;                      // e.g. "bank-1"
  name: string;                    // e.g. "Bank 1"
  cards: TextCueCard[];            // up to 64 text cards per bank
  playbackOrder: 'in_order' | 'shuffle';
  loopMode: 'loop' | 'stop' | 'bank';
  autoPlayback: boolean;           // intra-bank auto step
  playbackSpeed: number;           // intra-bank step interval (sec)
  activeCardIndex: number;         // currently selected card in slot
}

export interface TextCueSource {
  id?: string;
  type: 'TextCue';

  // Bank Grid Configuration
  bankGridMode: '8' | '16' | '24'; // '8' by default (2x4), toggleable to '16' (4x4) or '24' (6x4)
  activeBankIndex: number;         // 0 to 23
  banks: TextCueBankSlot[];        // 24 slots initialized
  bankAutoPlayback: boolean;       // auto rotate across banks
  bankSkipEmpty?: boolean;         // skip empty banks during rotation (default true)
  bankPlaybackSpeed: number;       // seconds per bank
  bankPlaybackOrder: 'in_order' | 'shuffle'; // order for cycling across banks
  bankLoopMode: 'loop' | 'stop';

  // Universal Card Playback Settings (applied across all banks)
  cardPlaybackOrder?: 'in_order' | 'shuffle'; // default 'in_order'
  cardLoopMode?: 'loop' | 'stop' | 'bank';     // default 'loop'

  // Trigger & Modulation Controls
  triggerThreshold: number;        // 0.0 to 1.0 (default 0.5)
  keyMapping?: string;             // manual card step keystroke (none, 1..0)
  bankKeyMapping?: string;         // manual bank step keystroke (none, 1..0)
  midiPadMappings?: Record<number, { note: number; channel: number }>; // Pad 1-24 MIDI bindings

  // Active Text & Downstream Transition Metadata
  currentText?: string;
  prevText?: string;
  lastStepTime?: number;           // timestamp of last card/bank change
  stepCount?: number;              // monotonically increasing step counter for downstream transition detection
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

export type AnySource = NoneSource | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | ImageLoaderSource | ImageFileSource | ImageCueSource | TextCueSource | AudioInputSource | AudioFileSource | SystemAudioSource | LFOModulatorSource | TriggerPadSource | NoiseModulatorSource | NoiseVideoSource | ColorNoiseSource | MidiInputSource;

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
  traceColor?: [number, number, number, number]; // Default Analog Phosphor Green: [0.0, 1.0, 0.25, 1.0]
  showScaffold?: boolean;                        // Default: false (set to true for grid/CRT background)
  colorMode?: 'amplitude' | 'span' | 'frequency';// Default: 'amplitude'
  gain?: number;                                 // Vertical & color sensitivity multiplier: 0.1 to 10.0 (default: 2.0)
}

export interface SpectralSplitterEffect {
  id: string;
  type: 'SpectralSplitter';
  busId: string;
  smoothing: number;   // 0 to 0.99
  sensitivity: number; // 0.1 to 10
  showScaffold?: boolean;               // Default: false (set to true for ghost FFT and gridlines)
  colorMode?: 'frequency' | 'amplitude';// Default: 'frequency'
  barColor?: [number, number, number, number]; // Default [0.1, 0.7, 0.8, 1.0]
  gain?: number;                        // Vertical gain / sensitivity multiplier: 0.1 to 10.0 (default: 2.0)
}

export interface WaterfallSpectrogramEffect {
  id: string;
  type: 'WaterfallSpectrogram';
  busId: string;
  tilt: number;        // 0.0 to 1.0 (default: 0.5)
  gain: number;        // 0.1 to 10.0 (default: 2.0)
  speed: number;       // 0.1 to 5.0 (default: 1.0)
  scaleX?: number;     // 0.1 to 4.0 (default: 1.0)
  scaleY?: number;     // 0.1 to 4.0 (default: 1.0)
  linkScale?: boolean; // default: true
  colorMode: 'topographic' | 'decay' | 'transient' | 'frequency'; // default: 'topographic'
  flowDirection: 'front-to-back' | 'back-to-front'; // default: 'front-to-back'
  renderStyle: 'surface' | 'lines'; // default: 'surface'
  showScaffold?: boolean;               // default: false (set to true for floor grid / scaffold)
  lineColor?: [number, number, number, number]; // default: [0.0, 1.0, 0.4, 1.0]
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

export type SignalType = 'video' | 'audio' | 'modulation' | 'trigger' | 'midi' | 'generic' | 'trajectory' | 'palette' | 'text';

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
  wrapMode: 'clamp' | 'wrap' | 'mirror' | 'soft_wrap';
  polarity?: 'bipolar' | 'unipolar';
  edgeFalloff?: number; // 0.0 .. 0.5 (default 0.1 for clamp)
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

export type TuftStyle = 'wildflowers' | 'poppies' | 'dandelions' | 'kelp' | 'wheat';
export type GrassRemovalStyle = 'dissolve' | 'cut' | 'shrink';

export interface GrassFieldEffect {
  id: string;
  type: 'GrassField';
  tilt: number;                   // 0.0 to 1.0, default 0.5 (~45 deg)
  zoom: number;                   // 0.2 to 3.0, default 1.0
  horizonY: number;               // -1.0 to 1.0, default 0.0
  growth: number;                 // 0.0 to 1.0, default 0.8
  growthRate?: number;            // 0.01 to 3.0, default 1.0 (down to 1% speed)
  growthAudioMode: 'accumulate' | 'pitch'; // default 'accumulate'
  density: number;                // 0.1 to 1.0, default 0.6
  bend: number;                   // -1.0 to 1.0, default 0.2
  invertCurvature: boolean;       // default false
  fatness: number;                // 0.05 to 2.0, default 1.0
  windSpeed: number;              // 0.0 to 5.0, default 1.5
  windStrength: number;           // 0.0 to 3.0, default 1.0
  bassCoupling: boolean;          // default true
  tuftStyle: TuftStyle;           // default 'wildflowers'
  tuftChance: number;             // 0.0 to 1.0, default 0.05
  tuftBurstAmount: number;        // 1 to 50, default 12
  tuftThreshold: number;          // 0.1 to 1.0, default 0.6
  tuftTriggerTime?: number;
  timerDecayEnabled: boolean;     // default true
  lifetimeDuration: number;       // 1.0 to 30.0, default 10.0
  gatedPruneEnabled: boolean;     // default false
  pruneThreshold: number;         // 0.1 to 1.0, default 0.7
  removalStyle: GrassRemovalStyle;// 'dissolve' | 'cut' | 'shrink', default 'dissolve'
  pruneAudioMode?: 'transient_cut' | 'silence_dissolve'; // legacy compatibility
  colorPreset: 'meadow' | 'bioluminescent' | 'golden' | 'neon';
  showSky?: boolean;              // default true (false = full alpha transparency)
  showGround?: boolean;           // default true (false = transparent ground floor)
}

export type TextMakerFontFamily = 'broadcast_sans' | 'slab_serif' | 'vcr_osd' | 'brush_script' | 'lcd_digital';
export type TextMakerStretchMode = '1x' | '2x_wide' | '2x_tall';
export type TextMakerColorFillMode = 'solid' | 'gradient' | 'color_cycle' | 'line_step';
export type TextMakerGradientDir = 'line_vertical' | 'block_vertical' | 'horizontal';
export type TextMakerBackdropMode = 'none' | 'tight_box' | 'full_banner' | 'line_strips';
export type TextMakerBgMode = 'transparent' | 'solid' | 'gradient' | 'color_bars';
export type TextMakerLayoutMode = 'page' | 'lower_third' | 'roll' | 'crawl';
export type TextMakerTransitionMode = 'cut' | 'crossfade' | 'fade_out_in' | 'typewriter' | 'wipe_lr' | 'venetian' | 'slide_up';

export interface TextMakerEffect {
  id: string;
  type: 'TextMaker';
  // Text content & source
  localText: string;
  allCaps: boolean;
  // Typography & stretch
  fontFamily: TextMakerFontFamily;
  fontSize: number;           // 16..120, default 52
  stretchMode: TextMakerStretchMode;
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;      // -2..20, default 1
  lineHeight: number;         // 0.9..2.2, default 1.25
  // Header Line 1 Override
  headerOverrideEnabled: boolean;
  headerScale: number;        // 1.0..2.5, default 1.4
  headerColor: [number, number, number, number];
  // Color & palette_in normalization
  textColor: [number, number, number, number];
  textColorB: [number, number, number, number];
  colorFillMode: TextMakerColorFillMode;
  gradientDirection: TextMakerGradientDir;
  colorCycleSpeed: number;    // 0.0..5.0 Hz, default 0.5
  // Character Edge Effects (GPU-accelerated & CV-modulated)
  outlineEnabled: boolean;
  outlineWidth: number;       // 0.0..1.0, default 0.25
  outlineColor: [number, number, number, number];
  shadowEnabled: boolean;
  shadowAmount: number;       // 0.0..1.0, default 0.45
  shadowAngle: number;        // 0..360 deg, default 135
  shadowColor: [number, number, number, number];
  extrudeEnabled: boolean;
  extrudeAmount: number;      // 0.0..1.0, default 0.35
  extrudeAngle: number;       // 0..360 deg, default 135
  extrudeColor: [number, number, number, number];
  glowEnabled: boolean;
  glowAmount: number;         // 0.0..1.0, default 0.4
  glowColor: [number, number, number, number];
  glowMatchTextColor?: boolean; // match glow color to text fill color
  // Backdrop Box / Ribbon & Internal Background
  backdropMode: TextMakerBackdropMode;
  backdropColor: [number, number, number, number];
  backdropBorderWidth: number;// 0.0..1.0, default 0.3
  backdropBorderColor: [number, number, number, number];
  bgMode: TextMakerBgMode;    // defaults to 'transparent'
  bgColorA: [number, number, number, number];
  bgColorB: [number, number, number, number];
  // Layout, Motion & Transitions
  layoutMode: TextMakerLayoutMode;
  snapZone: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // default 4 (center)
  posX: number;               // -1.0..1.0, default 0.0
  posY: number;               // -1.0..1.0, default 0.0
  scrollSpeed: number;        // -2.0..2.0, default 0.4
  transitionMode: TextMakerTransitionMode;
  transitionDuration: number; // 0.1..5.0 sec, default 0.6
  typewriterCursor: 'block' | 'underscore' | 'none';
  manualTriggerTime?: number;
  keyMapping?: string;
  // Analog Video / CRT Degradation Suite
  analogFxMaster: boolean;    // Master On/Off toggle on main node body
  analogFxMode?: 'on' | 'text_only' | 'off'; // 'on' (full video+text), 'text_only', 'off'
  pixelateEnabled: boolean;
  pixelateAmount: number;     // 0.0..1.0, default 0.3
  chromaBleedEnabled: boolean;
  chromaBleedAmount: number;  // 0.0..1.0, default 0.35
  scanlinesEnabled: boolean;
  scanlinesAmount: number;    // 0.0..1.0, default 0.25
  jitterEnabled: boolean;
  jitterAmount: number;       // 0.0..1.0, default 0.2
  noiseEnabled: boolean;
  noiseAmount: number;        // 0.0..1.0, default 0.15
  // Runtime transition metadata (for text_out forwarding)
  currentText?: string;
  prevText?: string;
  lastStepTime?: number;
  stepCount?: number;
}

export interface LumaBand {
  id: string;
  color: [number, number, number, number];
  threshold: number;
}

export interface LumaBandsEffect {
  id: string;
  type: 'LumaBands';
  bands: LumaBand[];
  spatialSmoothing: number;
  feather: number;
  usePaletteIn: boolean;
  outlineEnabled: boolean;
  outlineWidth: number;
  outlineOpacity: number;
  outlineColor: [number, number, number, number];
}
export interface ChromaBand {
  id: string;
  color: [number, number, number, number];
  threshold: number; // 0..360 hue ceiling angle
}


export interface GlyphBand {
  id: string;
  threshold: number; // 0..255 (luma) or 0..360 (chroma)
  color: [number, number, number, number];
  glyphText: string; // Manual char or phrase for this layer
}

export type GlyphWrapMode = 'raw_char' | 'word' | 'preserve_lines';
export type GlyphTemplatePack = 'density' | 'directional' | 'alpha' | 'numeric' | 'symbols' | 'punctuation';
export type GlyphColorMode = 'layer_palette' | 'source_video' | 'invert_video' | 'matrix_green' | 'amber_crt' | 'monochrome' | 'inherit_style';
export type GlyphBgMode = 'video' | 'transparent' | 'black' | 'video_dimmed';

export interface GlyphMapEffect {
  id: string;
  type: 'GlyphMap';
  bands: GlyphBand[];

  // Band source & thresholding
  mapMode: 'luma' | 'chroma'; // Used when bands_in is disconnected
  usePaletteIn?: boolean;
  spatialSmoothing: number;
  chromaGate?: number;
  chromaSensitivity?: number;
  hueShift?: number;

  // Outline
  outlineEnabled: boolean;
  outlineWidth: number;
  outlineOpacity: number;
  outlineColor: [number, number, number, number];

  // Grid & Typography
  cellSize: number; // 6..64 px
  fontFamily: string;
  fontWeight: string;
  textGlowColor?: string;
  textGlowRadius?: number;
  textShadowColor?: string;

  // Text Source & Flow
  sourceMode: 'textbank' | 'templates' | 'manual';
  templatePack: GlyphTemplatePack;
  wrapMode: GlyphWrapMode;

  // Kinetic Auto-Scroll
  autoScroll: boolean;
  scrollDirection: 'left' | 'right' | 'up' | 'down';
  scrollSpeed: number; // 0.1..10.0

  // Color & Blend
  colorMode: GlyphColorMode;
  bgMode: GlyphBgMode;
  dimmedVideoOpacity: number; // 0..1
}

export interface ChromaBandsEffect {
  id: string;
  type: 'ChromaBands';
  bands: ChromaBand[];
  chromaGate: number; // 0..0.5 min saturation/chroma threshold
  chromaSensitivity?: number; // 0.5..5.0x saturation expander
  hueShift?: number; // 0..360 deg manual hue rotation
  gateMode?: 'base_layer' | 'neutral_color';
  spatialSmoothing: number;
  usePaletteIn: boolean;
  outlineEnabled: boolean;
  outlineWidth: number;
  outlineOpacity: number;
  outlineColor: [number, number, number, number];
}

export type OutlineEdgeMode = 'luma_bands' | 'chroma_bands' | 'focus_peaking' | 'manga_dog' | 'analog_diff';
export type OutlineBgMode = 'over_video_ink' | 'over_video_neon' | 'lines_transparent' | 'lines_black';
export type OutlineColorMode = 'custom' | 'palette_in' | 'sample_video';
export type OutlinePulseMode = 'local_edge' | 'contour' | 'radial' | 'horizontal' | 'vertical';

export interface OutlineEffect {
  id: string;
  type: 'Outline';
  edgeMode: OutlineEdgeMode;
  bandCount: number; // 2..8 (hard cap)
  threshold: number; // 0..1 (peaking sensitivity / gradient threshold)
  lineWidth: number; // 1..16 px
  lineOpacity: number; // 0..1
  lineColor: [number, number, number, number]; // RGBA
  colorMode: OutlineColorMode;
  bgMode: OutlineBgMode;
  spatialSmoothing: number; // 0..1
  analogDirection?: 'horizontal' | 'vertical';
  usePaletteIn?: boolean;

  // Traveling Pulse / Bulge Animation
  pulseActive?: boolean;
  pulseAmount?: number;   // 0..4 (graduated bulge scale)
  pulseSpeed?: number;    // -5..5 Hz
  pulseFreq?: number;     // 0.5..12 repetitions
  pulseMode?: OutlinePulseMode;
}

// --- SENSOR SYSTEM ---
export type SensorShapeType = 'line' | 'rect' | 'circle';
export type SensorAlgorithm = 'motion' | 'chrominance';
export type LineCrossingDirection = 'both' | 'a_to_b' | 'b_to_a';

export interface SensorZoneConfig {
  id: string;
  name: string;
  type: SensorShapeType;
  algorithm: SensorAlgorithm;
  color: string; // hex or rgba for outline overlay
  enabled: boolean;
  
  // Normalized coordinates (0.0 to 1.0)
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cx?: number;
  cy?: number;
  radius?: number;

  // Algorithm configuration
  sensitivity: number; // 0..1
  threshold: number;   // 0..1 (for trigger / gate)
  smoothing: number;   // 0..1 (EMA smoothing)
  lineDirection?: LineCrossingDirection; // 'both' | 'a_to_b' | 'b_to_a'
}

export interface SensorSystemState {
  deviceId: string;
  enabled: boolean;
  sensors: SensorZoneConfig[];
  mirror?: boolean;
}

export interface OpticalSensorEffect {
  id: string;
  type: 'OpticalSensor';
  sensorId: string; // links to SensorZoneConfig.id
  gain: number;     // 0..2
  threshold: number;// 0..1
}

// --- BAD ANALOG SUITE ---
export type BadAnalogDisplayMode = 'crt' | 'vector' | 'monochrome' | 'matrix_lcd';
export type BadAnalogProcessTarget = 'canvas' | 'upstream_bounded';
export type BadAnalogPhosphorType = 'p1_green' | 'p3_amber' | 'p4_white';

export interface BadAnalogEffect {
  id: string;
  type: 'BadAnalog';
  name?: string;
  enabled?: boolean;

  // Master Routing & Modes
  displayMode: BadAnalogDisplayMode;
  processTarget: BadAnalogProcessTarget;
  phosphorType: BadAnalogPhosphorType;

  // CRT & Geometry
  curvature: number;          // 0..1 (pincushion/barrel)
  vignette: number;           // 0..1 (edge falloff)
  scanlines: number;          // 0..1 (raster line intensity)
  scanlineCount: number;      // 120..720 (default 240 / 480)
  phosphorMask: number;       // 0..1 (aperture grille / triad mask)
  maskBrightness: number;     // 0.5..2.0 (boost when mask dims image)

  // Vector Display Emulation
  vectorGlow: number;         // 0..1 (beam bloom/glow)
  vectorIntensity: number;    // 0.5..3.0 (beam overdrive)

  // Analog Artifacts & Glitches
  chromaBleed: number;        // 0..1 (horizontal color smear/subcarrier lag)
  jitter: number;             // 0..1 (H-sync line tearing)
  vhsTracking: number;        // 0..1 (tape tracking skew/flagging at top)
  headSwitching: number;      // 0..1 (bottom tape head switch noise band)
  humBar: number;             // 0..1 (60Hz ground hum rolling bar)
  humBarSpeed: number;        // -2..2 (vertical drift rate)
  noiseSnow: number;          // 0..1 (RF static/luma noise)
  lumaSag: number;            // 0..1 (voltage drop/bloom on bright flashes)
}

// --- DATAMOSH MODULE ---
export type DataMoshKeyframeMode = 'manual' | 'periodic' | 'motion_thresh';
export type DataMoshProcessTarget = 'canvas' | 'upstream_bounded';

export interface DataMoshEffect {
  id: string;
  type: 'DataMosh';
  name?: string;
  enabled?: boolean;

  // Processing Domain
  processTarget: DataMoshProcessTarget;

  // Motion Vector Engine
  vectorGain: number;         // 0..3 (amplification of motion vectors, default: 1.2)
  decay: number;              // 0.8..1.0 (persistence of smear, default: 0.985)
  macroblockSize: number;     // 1, 4, 8, 16, 32, 64 (default: 16)
  threshold: number;          // 0..0.5 (motion sensitivity floor, default: 0.05)

  // Glitch & Distortion
  chromaBleed: number;        // 0..1 (YUV / color subcarrier smear, default: 0.3)
  biasX: number;              // -1..1 (continuous directional vector drift, default: 0)
  biasY: number;              // -1..1 (continuous directional vector drift, default: 0)
  noiseGlitch: number;        // 0..1 (macroblock bitrot / dropout flash, default: 0)

  // Keyframe / Reset Engine
  keyframeMode: DataMoshKeyframeMode; // default: 'periodic'
  keyframeRate: number;       // 0.1..10 Hz (default: 0.5 Hz = every 2 sec)
  motionThreshold: number;    // 0.1..1.0 (auto keyframe on scene cuts, default: 0.6)
  manualKeyframeTrigger?: number; // timestamp trigger from UI
}

// --- FEEDBACK PRO MODULE ---
export type FeedbackProBlendMode = 'normal' | 'add' | 'screen' | 'difference' | 'max';
export type FeedbackProProcessTarget = 'canvas' | 'upstream_bounded';

export interface FeedbackProEffect {
  id: string;
  type: 'FeedbackPro';
  name?: string;
  enabled?: boolean;

  // Domain & Compositing
  processTarget: FeedbackProProcessTarget;
  blendMode: FeedbackProBlendMode;

  // Recirculation & Energy
  gain: number;            // 0..1.2 (unity=1.0, >1.0 blooms with soft-knee, default: 0.95)
  softKnee: number;        // 0..1 (anode limiter / AGC compression, default: 0.4)
  edgeRollOff: number;     // 0..1 (peripheral vignette damping, default: 0.3)

  // Geometry & Vortex
  zoom: number;            // 0.8..1.25 (default: 1.02)
  rotation: number;        // -15..15 deg per frame (default: 0.5)
  twist: number;           // -2..2 (radial spiral vortex torque, default: 0.0)
  driftX: number;          // -0.1..0.1 (default: 0.0)
  driftY: number;          // -0.1..0.1 (default: 0.0)
  pivotX: number;          // 0..1 (default: 0.5)
  pivotY: number;          // 0..1 (default: 0.5)

  // Luma Fluidity & Optics
  lumaWarp: number;        // -1..1 (bright area expansion/flow, default: 0.2)
  lumaTwist: number;       // -2..2 (luminance-driven swirl, default: 0.0)
  rgbDispersion: number;   // 0..0.05 (chromatic prism separation, default: 0.005)
  hueShift: number;        // 0..360 deg per recursion (default: 0)

  // Live Performance State
  frozen: boolean;         // default: false (locks loop without incoming video)
  clearTrigger?: number;   // timestamp trigger from UI / CV to flush buffer
}

export type AnyEffect = 
  | Transform2DEffect | ColorAdjustEffect | LumaKeyEffect | SimpleFeedbackEffect
  | InterLayerOutputEffect | InterLayerInputEffect | ColorRGBEffect | LumaSplitterEffect 
  | SpawnEffect | PathEffect | InverterEffect | VideoMixerEffect | AlphaAdjustEffect
  | KeyMixerEffect | VideoMathEffect | UVDisplaceEffect
  | LogicGateEffect | TriggeredGateEffect | PatternEffect | KaleidoscopeEffect 
  | SignalMathEffect | SampleAndHoldEffect | StepSequencerEffect | PixelProcessorEffect
  | AudioSourceEffect | OscilloscopeEffect | SpectralSplitterEffect | WaterfallSpectrogramEffect | AudioTransformerEffect | AudioModulatorEffect | AudioGateEffect | AudioToCVEffect
  | SpeechEnvelopeTrackerEffect | VocalPitchTrackerEffect | VowelFormantTrackerEffect | SpokenWordVisualizerEffect
  | CanvasBackgroundEffect | ParticleCloudEffect | ColorPaletteEffect | GrassFieldEffect | TextMakerEffect | LumaBandsEffect | ChromaBandsEffect | GlyphMapEffect | OutlineEffect | OpticalSensorEffect | BadAnalogEffect | DataMoshEffect | FeedbackProEffect
  | ShapeGeneratorSource | VideoURLSource | VideoFileSource | WebcamCaptureSource | NoiseVideoSource | ColorNoiseSource
  | AudioInputSource | AudioFileSource | SystemAudioSource | ImageLoaderSource | ImageFileSource | ImageCueSource | TextCueSource;

export type EffectType = 
  | 'Transform2D' | 'ColorAdjust' | 'LumaKey' | 'SimpleFeedback' 
  | 'InterLayerOutput' | 'InterLayerInput' 
  | 'ColorRGB' | 'LumaSplitter' | 'Spawn' | 'Path' | 'Inverter' | 'VideoMixer' | 'AlphaAdjust'
  | 'KeyMixer' | 'VideoMath' | 'UVDisplace'
  | 'LogicGate' | 'TriggeredGate' | 'Pattern' | 'Kaleidoscope' | 'SignalMath' | 'SampleAndHold' | 'StepSequencer' | 'AudioSource' | 'Oscilloscope' | 'SpectralSplitter' | 'WaterfallSpectrogram' | 'PixelProcessor' | 'AudioTransformer' | 'AudioModulator' | 'AudioGate' | 'AudioToCV'
  | 'SpeechEnvelopeTracker' | 'VocalPitchTracker' | 'VowelFormantTracker' | 'SpokenWordVisualizer'
  | 'CanvasBackground' | 'ParticleCloud' | 'ColorPalette' | 'GrassField' | 'TextMaker' | 'LumaBands' | 'ChromaBands' | 'GlyphMap' | 'Outline' | 'OpticalSensor' | 'BadAnalog' | 'DataMosh' | 'FeedbackPro'
  | 'ShapeGenerator' | 'VideoURL' | 'VideoFile' | 'WebcamCapture' | 'NoiseSource' | 'ColorNoise' | 'AudioInput' | 'AudioFile' | 'SystemAudio' | 'ImageLoader' | 'ImageFile' | 'ImageCue' | 'TextCue';

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
  sensorSystem?: SensorSystemState;
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
