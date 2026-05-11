export type SignalType = 'video' | 'modulation' | 'trigger' | 'audio' | 'red' | 'green' | 'blue' | 'midi' | 'generic' | 'trajectory';

export interface PortDef {
  id: string;
  label: string;
  direction: 'in' | 'out';
  signalType: SignalType;
  priority?: number; // lower = higher priority for auto-connection
  bipolar?: boolean; // native range of the output
}

export const PORT_DEFS: Record<string, PortDef[]> = {
  VideoFile:       [{ id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 }, { id: 'audio_out', label: 'Audio Out', direction: 'out', signalType: 'audio' }],
  VideoURL:        [{ id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 }, { id: 'audio_out', label: 'Audio Out', direction: 'out', signalType: 'audio' }],
  WebcamCapture:   [{ id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 }],
  LFO: [
    { id: 'modulation_out', label: 'LFO Out',  direction: 'out', signalType: 'modulation', priority: 0, bipolar: true },
    { id: 'frequency_cv',   label: 'Freq CV',  direction: 'in',  signalType: 'modulation', priority: 1 },
    { id: 'amplitude_cv',   label: 'Amp CV',   direction: 'in',  signalType: 'modulation', priority: 2 },
    { id: 'offset_cv',      label: 'Offs CV',  direction: 'in',  signalType: 'modulation', priority: 3 },
    { id: 'sync_out',       label: 'Sync Out', direction: 'out', signalType: 'trigger',    priority: 4 },
    { id: 'sync_in',        label: 'Sync In',  direction: 'in',  signalType: 'trigger',    priority: 5 }
  ],
  TriggerPad: [
    { id: 'trigger_out', label: 'Trig Out', direction: 'out', signalType: 'trigger', priority: 0 },
    { id: 'trigger_in',  label: 'Trig In',  direction: 'in',  signalType: 'trigger', priority: 1 }
  ],
  Noise: [
    { id: 'modulation_out', label: 'Noise Out', direction: 'out', signalType: 'modulation', priority: 0, bipolar: true },
    { id: 'frequency_cv',   label: 'Freq CV',  direction: 'in',  signalType: 'modulation', priority: 1 },
    { id: 'amplitude_cv',   label: 'Amp CV',   direction: 'in',  signalType: 'modulation', priority: 2 },
    { id: 'offset_cv',      label: 'Offs CV',  direction: 'in',  signalType: 'modulation', priority: 3 },
  ],
  NoiseSource: [
    { id: 'video_out',      label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 },
    { id: 'scale_cv',       label: 'Scale CV',  direction: 'in',  signalType: 'modulation' },
    { id: 'evolution_cv',   label: 'Evol CV',   direction: 'in',  signalType: 'modulation' },
    { id: 'octaves_cv',     label: 'Oct CV',    direction: 'in',  signalType: 'modulation' },
    { id: 'persistence_cv', label: 'Pers CV',   direction: 'in',  signalType: 'modulation' },
    { id: 'seed_cv',        label: 'Seed CV',   direction: 'in',  signalType: 'modulation' },
    { id: 'brightness_cv',  label: 'Brght CV',  direction: 'in',  signalType: 'modulation' },
    { id: 'contrast_cv',    label: 'Cont CV',   direction: 'in',  signalType: 'modulation' },
  ],
  ShapeGenerator: [
    { id: 'video_out',   label: 'Video Out',   direction: 'out', signalType: 'video', priority: 0 },
    { id: 'sides',       label: 'Sides',       direction: 'in',  signalType: 'modulation' },
    { id: 'roundness',   label: 'Roundness',   direction: 'in',  signalType: 'modulation' },
    { id: 'convexity',   label: 'Convexity',   direction: 'in',  signalType: 'modulation' },
    { id: 'rotation',    label: 'Rotation',    direction: 'in',  signalType: 'modulation' },
    { id: 'strokeWidth', label: 'Stroke',      direction: 'in',  signalType: 'modulation' },
    { id: 'x',           label: 'X-Pos',       direction: 'in',  signalType: 'modulation' },
    { id: 'y',           label: 'Y-Pos',       direction: 'in',  signalType: 'modulation' },
    { id: 'scale',       label: 'Scale',       direction: 'in',  signalType: 'modulation' },
  ],
  ImageFile:       [{ id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 }],
  ImageLoader:     [{ id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 }],
  Transform2D: [
    { id: 'video_in',    label: 'Video In',    direction: 'in',  signalType: 'video' },
    { id: 'video_out',   label: 'Video Out',   direction: 'out', signalType: 'video', priority: 0 },
    { id: 'translateX', label: 'Translate X', direction: 'in',  signalType: 'modulation' },
    { id: 'translateY', label: 'Translate Y', direction: 'in',  signalType: 'modulation' },
    { id: 'scaleX',     label: 'Scale X',     direction: 'in',  signalType: 'modulation' },
    { id: 'scaleY',     label: 'Scale Y',     direction: 'in',  signalType: 'modulation' },
    { id: 'rotation',    label: 'Rotation',    direction: 'in',  signalType: 'modulation' },
    { id: 'spin',        label: 'Spin',        direction: 'in',  signalType: 'modulation' },
  ],
  Spawn: [
    { id: 'video_out',   label: 'Video Out',   direction: 'out', signalType: 'video', priority: 0 },
    { id: 'video_in',    label: 'Video In',    direction: 'in',  signalType: 'video', priority: 0 },
    { id: 'trigger_in',  label: 'Trigger',     direction: 'in',  signalType: 'trigger', priority: 1 },
    { id: 'reset_in',    label: 'Reset',       direction: 'in',  signalType: 'trigger', priority: 2 },
    { id: 'x',           label: 'X Pos',       direction: 'in',  signalType: 'modulation' },
    { id: 'y',           label: 'Y Pos',       direction: 'in',  signalType: 'modulation' },
    { id: 'scale',       label: 'Scale',       direction: 'in',  signalType: 'modulation' },
    { id: 'rotation',    label: 'Rotation',    direction: 'in',  signalType: 'modulation' },
    { id: 'path_in',     label: 'Path In',     direction: 'in',  signalType: 'trajectory', priority: 3 },
  ],
  ColorAdjust: [
    { id: 'video_in',   label: 'Video In',   direction: 'in',  signalType: 'video' },
    { id: 'video_out',  label: 'Video Out',  direction: 'out', signalType: 'video', priority: 0 },
    { id: 'hue',        label: 'Hue',        direction: 'in',  signalType: 'modulation' },
    { id: 'saturation', label: 'Saturation', direction: 'in',  signalType: 'modulation' },
    { id: 'brightness', label: 'Brightness', direction: 'in',  signalType: 'modulation' },
    { id: 'contrast',   label: 'Contrast',   direction: 'in',  signalType: 'modulation' },
  ],
  LumaKey: [
    { id: 'video_in',  label: 'Video In',  direction: 'in',  signalType: 'video' },
    { id: 'video_out', label: 'Video Out', direction: 'out', signalType: 'video', priority: 0 },
    { id: 'threshold', label: 'Threshold', direction: 'in',  signalType: 'modulation' },
    { id: 'tolerance', label: 'Tolerance', direction: 'in',  signalType: 'modulation' },
  ],
  SimpleFeedback: [
    { id: 'video_in',        label: 'Video In',     direction: 'in',  signalType: 'video' },
    { id: 'video_out',       label: 'Video Out',    direction: 'out', signalType: 'video', priority: 0 },
    { id: 'feedbackAmount', label: 'Feedback Amt', direction: 'in',  signalType: 'modulation' },
    { id: 'zoom',            label: 'Zoom',         direction: 'in',  signalType: 'modulation' },
    { id: 'angle',           label: 'Angle',        direction: 'in',  signalType: 'modulation' },
  ],
  SignalProcessor: [
    { id: 'in_a', label: 'Input A', direction: 'in',  signalType: 'modulation' },
    { id: 'in_b', label: 'Input B', direction: 'in',  signalType: 'modulation' },
    { id: 'out',  label: 'Result',  direction: 'out', signalType: 'modulation' },
  ],
  AudioAnalyzer: [
    { id: 'audio_in', label: 'Audio In', direction: 'in', signalType: 'audio' },
    { id: 'out', label: 'Peak Level', direction: 'out', signalType: 'modulation' },
  ],
  Inverter: [
    { id: 'video_in',   label: 'Video In',   direction: 'in',  signalType: 'video' },
    { id: 'video_out',  label: 'Video Out',  direction: 'out', signalType: 'video', priority: 0 },
    { id: 'cv_in',      label: 'CV In',      direction: 'in',  signalType: 'modulation' },
    { id: 'cv_out',     label: 'CV Out',     direction: 'out', signalType: 'modulation', priority: 1 },
    { id: 'trigger_in', label: 'Trigger',    direction: 'in',  signalType: 'trigger' },
    { id: 'mix',        label: 'Mix',        direction: 'in',  signalType: 'modulation' },
  ],
  InterLayerOutput: [
    { id: 'in_0', label: 'Lvl 1', direction: 'in', signalType: 'generic' },
    { id: 'in_1', label: 'Lvl 2', direction: 'in', signalType: 'generic' },
    { id: 'in_2', label: 'Lvl 3', direction: 'in', signalType: 'generic' },
  ],
  InterLayerInput: [
    { id: 'out_0', label: 'Lvl 1', direction: 'out', signalType: 'generic' },
    { id: 'out_1', label: 'Lvl 2', direction: 'out', signalType: 'generic' },
    { id: 'out_2', label: 'Lvl 3', direction: 'out', signalType: 'generic' },
  ],
  ColorRGB: [
    { id: 'video_in',  label: 'Video In', direction: 'in',  signalType: 'video' },
    { id: 'r_cv',      label: 'Red CV',   direction: 'in',  signalType: 'modulation' },
    { id: 'g_cv',      label: 'Green CV', direction: 'in',  signalType: 'modulation' },
    { id: 'b_cv',      label: 'Blue CV',  direction: 'in',  signalType: 'modulation' },
    { id: 'video_out', label: 'Video Out',direction: 'out', signalType: 'video', priority: 0 },
    { id: 'r_out',     label: 'Red Out',  direction: 'out', signalType: 'video', priority: 1 },
    { id: 'g_out',     label: 'Green Out',direction: 'out', signalType: 'video', priority: 2 },
    { id: 'b_out',     label: 'Blue Out', direction: 'out', signalType: 'video', priority: 3 },
  ],
  LumaSplitter: [
    { id: 'video_in',    label: 'Video In',  direction: 'in',  signalType: 'video' },
    { id: 'video_out',   label: 'Composite', direction: 'out', signalType: 'video', priority: 0 },
    { id: 'low_out',     label: 'Low Out',   direction: 'out', signalType: 'video', priority: 1 },
    { id: 'mid_out',     label: 'Mid Out',   direction: 'out', signalType: 'video', priority: 2 },
    { id: 'high_out',    label: 'High Out',  direction: 'out', signalType: 'video', priority: 3 },
    { id: 'luma_val',    label: 'Luma Val',  direction: 'out', signalType: 'modulation' },
    { id: 'threshold1',  label: 'Thresh 1',  direction: 'in',  signalType: 'modulation' },
    { id: 'threshold2',  label: 'Thresh 2',  direction: 'in',  signalType: 'modulation' },
    { id: 'softness',    label: 'Softness',  direction: 'in',  signalType: 'modulation' },
  ],
  RGBMixer: [
    { id: 'r_in',      label: 'Red In',    direction: 'in',  signalType: 'video' },
    { id: 'g_in',      label: 'Green In',  direction: 'in',  signalType: 'video' },
    { id: 'b_in',      label: 'Blue In',   direction: 'in',  signalType: 'video' },
    { id: 'video_out', label: 'Composite', direction: 'out', signalType: 'video', priority: 0 },
  ],
  LogicGate: [
    { id: 'in_a', label: 'In A', direction: 'in', signalType: 'trigger' },
    { id: 'in_b', label: 'In B', direction: 'in', signalType: 'trigger' },
    { id: 'out',  label: 'Out',  direction: 'out', signalType: 'trigger', priority: 0 },
  ],
  TriggeredGate: [
    { id: 'sig_in',     label: 'Sig In',  direction: 'in',  signalType: 'generic' },
    { id: 'trigger_in', label: 'Trigger', direction: 'in',  signalType: 'trigger' },
    { id: 'sig_out',    label: 'Sig Out', direction: 'out', signalType: 'generic', priority: 0 },
  ],
  Path: [
    { id: 'trajectory_out', label: 'Trajectory', direction: 'out', signalType: 'trajectory', priority: 0 },
    { id: 'modulation_out', label: 'Value Out',  direction: 'out', signalType: 'modulation', priority: 1 },
    { id: 'speed',          label: 'Speed',      direction: 'in',  signalType: 'modulation' },
    { id: 'strength',       label: 'Strength',   direction: 'in',  signalType: 'modulation' },
    { id: 'frequency',      label: 'Frequency',  direction: 'in',  signalType: 'modulation' },
    { id: 'drift',          label: 'Drift',      direction: 'in',  signalType: 'modulation' },
  ],
  None: [],
  __OUTPUT__: [
    { id: 'composite_in', label: 'Composite In', direction: 'in', signalType: 'video' },
  ],
};

export const SIGNAL_COLORS: Record<SignalType, string> = {
  video:      '#f5c518', // Yellow
  modulation: '#d918f5', // Purple
  trigger:    '#f58c18', // Orange
  audio:      '#18e4f5', // Cyan
  red:        '#ff4444', 
  green:      '#88cc00',
  blue:       '#4444ff',
  midi:       '#39ff14', // Workstation Green
  trajectory: '#18f58c', // Mint Green
  generic:    '#888888', // Gray
};

export const SOURCE_WIRE_COLOR: Record<string, string> = {
  VideoFile:      '#f5c518',
  VideoURL:       '#f5c518',
  WebcamCapture:  '#18e4f5',
  ShapeGenerator: '#d918f5',
  ImageFile:      '#f5c518',
  ImageLoader:    '#f5c518',
};

export function getPrimaryOutput(moduleType: string): PortDef | null {
  const ports = PORT_DEFS[moduleType] || [];
  const outputs = ports.filter(p => p.direction === 'out' && p.priority !== undefined);
  outputs.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return outputs[0] ?? null;
}

const SHORT_LABELS: Record<string, string> = {
  translateX: 'X-Pos',
  translateY: 'Y-Pos',
  scaleX: 'X-Scl',
  scaleY: 'Y-Scl',
  rotation: 'Rot',
  spin: 'Spin',
  hue: 'Hue',
  saturation: 'Sat',
  brightness: 'Brit',
  contrast: 'Cont',
  threshold: 'Thsh',
  tolerance: 'Tol',
  feedbackAmount: 'Feed',
  zoom: 'Zoom',
  angle: 'Angl',
  video_in: 'V-In',
  video_out: 'V-Out',
  audio_in: 'A-In',
  audio_out: 'A-Out',
  low_out: 'Low',
  mid_out: 'Mid',
  high_out: 'High',
  luma_val: 'Luma',
  threshold1: 'Thr 1',
  threshold2: 'Thr 2',
  softness: 'Soft',
  path_in: 'Path',
  trajectory_out: 'Traj',
  modulation_out: 'Val',
};

export function getShortLabel(portId: string, fullLabel: string): string {
  return SHORT_LABELS[portId] || fullLabel.substring(0, 5);
}

export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  ColorRGB: 'RGB',
  Placer: 'Placer',
  Transform2D: 'Transform',
  ColorAdjust: 'Color',
  SimpleFeedback: 'Feedback',
  ShapeGenerator: 'Shape',
  VideoFile: 'Vid File',
  VideoURL: 'Vid URL',
  WebcamCapture: 'Webcam',
  ImageFile: 'Img File',
  ImageLoader: 'Img URL',
  AudioInput: 'Audio In',
  AudioFile: 'Audio File',
  SystemAudio: 'Sys Audio',
  SignalProcessor: 'Processor',
  AudioAnalyzer: 'Analyzer',
  InterLayerOutput: 'Layer Out',
  InterLayerInput: 'Layer In',
  LumaSplitter: 'Luma Split',
  Path: 'Path',
  LogicGate: 'Logic Gate',
  TriggeredGate: 'Trig Gate',
};
