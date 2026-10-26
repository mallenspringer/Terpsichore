export type CategoryType = 'Sources' | 'Utility' | 'Effects' | 'Audio';

export const CATEGORIES: CategoryType[] = ['Sources', 'Utility', 'Effects', 'Audio'];

export const CATEGORY_COLORS: Record<CategoryType, string> = {
  Sources: '#f5c518',
  Utility: '#f58c18',
  Effects: '#d918f5',
  Audio: '#18e4f5'
};

export interface ModuleEntry {
  id: string;
  glyph: string;
  label: string;
  tooltip: string;
  category: CategoryType;
  moduleType: string; // e.g. 'source:VideoFile', 'effect:Transform2D', 'modulator:LFO'
  tags: string[];
}

export const ALL_MODULES: ModuleEntry[] = [
  // ─── SOURCES ─────────────────────────────────────────────────────────
  {
    id: 'VideoFile',
    glyph: '🎬',
    label: 'Vid File',
    tooltip: 'Local Video File (MP4/WebM)',
    category: 'Sources',
    moduleType: 'source:VideoFile',
    tags: ['video', 'playback', 'clip', 'file', 'movie', 'loop']
  },
  {
    id: 'VideoURL',
    glyph: '🌐',
    label: 'Vid URL',
    tooltip: 'Streaming Video from Web URL',
    category: 'Sources',
    moduleType: 'source:VideoURL',
    tags: ['video', 'stream', 'hls', 'url', 'web', 'online']
  },
  {
    id: 'Webcam',
    glyph: '📷',
    label: 'Webcam',
    tooltip: 'Live Camera Video Input',
    category: 'Sources',
    moduleType: 'source:WebcamCapture',
    tags: ['camera', 'webcam', 'capture', 'live', 'video', 'feed']
  },
  {
    id: 'ImageFile',
    glyph: '🖼️',
    label: 'Img File',
    tooltip: 'Local Still Image File (PNG/JPG)',
    category: 'Sources',
    moduleType: 'source:ImageFile',
    tags: ['image', 'texture', 'picture', 'file', 'photo', 'static']
  },
  {
    id: 'ImageURL',
    glyph: '🔗',
    label: 'Img URL',
    tooltip: 'Still Image from URL',
    category: 'Sources',
    moduleType: 'source:ImageLoader',
    tags: ['image', 'web', 'url', 'texture', 'online']
  },
  {
    id: 'ShapeGen',
    glyph: '⬡',
    label: 'Shape Gen',
    tooltip: 'Geometric Shape Generator',
    category: 'Sources',
    moduleType: 'source:ShapeGenerator',
    tags: ['vector', 'shape', 'geometry', 'circle', 'square', 'polygon', 'star', 'generator']
  },
  {
    id: 'NoiseSource',
    glyph: '≋',
    label: 'Noise Gen',
    tooltip: '2D Procedural Noise Generator',
    category: 'Sources',
    moduleType: 'source:NoiseSource',
    tags: ['noise', 'perlin', 'simplex', 'texture', 'procedural', 'generator', 'organic']
  },
  {
    id: 'ColorNoise',
    glyph: '🌈',
    label: 'Color Noise',
    tooltip: 'Multichromatic Procedural Noise',
    category: 'Sources',
    moduleType: 'source:ColorNoise',
    tags: ['color', 'noise', 'chromatic', 'plasma', 'generator', 'gradient']
  },

  // ─── UTILITY ─────────────────────────────────────────────────────────
  {
    id: 'LFO',
    glyph: '∿',
    label: 'LFO',
    tooltip: 'Low Frequency Oscillator Modulator',
    category: 'Utility',
    moduleType: 'modulator:LFO',
    tags: ['cv', 'oscillator', 'sine', 'saw', 'square', 'triangle', 'modulator', 'tempo', 'clock']
  },
  {
    id: 'TriggerPad',
    glyph: '⦿',
    label: 'Trig Pad',
    tooltip: 'Click or MIDI Trigger Pulse Generator',
    category: 'Utility',
    moduleType: 'modulator:TriggerPad',
    tags: ['trigger', 'pad', 'pulse', 'button', 'cv', 'gate', 'manual']
  },
  {
    id: 'AudioToCV',
    glyph: '⚡🔊',
    label: 'Audio CV',
    tooltip: 'Audio to Control Signal (RMS/Peak/Env/dB)',
    category: 'Utility',
    moduleType: 'effect:AudioToCV',
    tags: ['audio', 'envelope', 'rms', 'peak', 'modulation', 'gate', 'amplitude', 'cv', 'reactive']
  },
  {
    id: 'VideoMixer',
    glyph: '⧉',
    label: 'Mixer',
    tooltip: '4-Channel Video Compositor & Mixer',
    category: 'Utility',
    moduleType: 'effect:VideoMixer',
    tags: ['composite', 'mixer', 'blend', 'transition', 'crossfade', 'layer', 'multi']
  },
  {
    id: 'KeyMixer',
    glyph: '✂️',
    label: 'Key Mixer',
    tooltip: 'Luma & Chroma Multi-Source Keyer',
    category: 'Utility',
    moduleType: 'effect:KeyMixer',
    tags: ['composite', 'chroma', 'luma', 'greenscreen', 'keyer', 'matte', 'mask', 'blend']
  },
  {
    id: 'VideoMath',
    glyph: '⨁',
    label: 'Vid Math',
    tooltip: 'Algebraic Texture Operations (Add/Sub/Mult/Diff)',
    category: 'Utility',
    moduleType: 'effect:VideoMath',
    tags: ['math', 'blend', 'add', 'subtract', 'multiply', 'difference', 'texture', 'algebraic']
  },
  {
    id: 'Spawn',
    glyph: '✨',
    label: 'Spawn',
    tooltip: 'Triggered Object Particle Emitter',
    category: 'Utility',
    moduleType: 'effect:Spawn',
    tags: ['particles', 'emitter', 'spawn', 'burst', 'physics', 'sprites', 'instances']
  },
  {
    id: 'Path',
    glyph: '🛤️',
    label: 'Path',
    tooltip: 'Trajectory & Motion Vector Generator',
    category: 'Utility',
    moduleType: 'effect:Path',
    tags: ['motion', 'trajectory', 'physics', 'orbit', 'wiggle', 'path', 'vector', 'animation']
  },
  {
    id: 'Noise',
    glyph: '🎲',
    label: 'Noise CV',
    tooltip: 'Stochastic 1D Random Signal Generator',
    category: 'Utility',
    moduleType: 'modulator:Noise',
    tags: ['noise', 'random', 'stochastic', 'cv', 'brownian', 'pink', 'white', 'perlin']
  },
  {
    id: 'MidiInput',
    glyph: '🎹',
    label: 'MIDI In',
    tooltip: 'MIDI Keyboard, Note & CC Inputs',
    category: 'Utility',
    moduleType: 'modulator:MidiInput',
    tags: ['midi', 'hardware', 'keyboard', 'controller', 'cc', 'note', 'velocity', 'pitchwheel']
  },
  {
    id: 'StepSequencer',
    glyph: '🪜',
    label: 'Sequencer',
    tooltip: '16-Step Modular Control Sequencer',
    category: 'Utility',
    moduleType: 'effect:StepSequencer',
    tags: ['sequencer', 'step', 'pattern', 'cv', 'clock', 'trigger', 'melody', 'rhythm']
  },
  {
    id: 'SampleAndHold',
    glyph: '◲',
    label: 'S&H',
    tooltip: 'Capture & Hold Signal/Frame on Trigger',
    category: 'Utility',
    moduleType: 'effect:SampleAndHold',
    tags: ['sample', 'hold', 'freeze', 'quantize', 'trigger', 'cv', 'stepped']
  },
  {
    id: 'LogicGate',
    glyph: '⊦',
    label: 'Logic Gate',
    tooltip: 'Boolean Signal Logic (AND/OR/XOR/NOT)',
    category: 'Utility',
    moduleType: 'effect:LogicGate',
    tags: ['logic', 'boolean', 'and', 'or', 'xor', 'compare', 'gate', 'math']
  },
  {
    id: 'TriggeredGate',
    glyph: '⎍',
    label: 'Trig Gate',
    tooltip: 'Signal Gating, Windowing & Routing',
    category: 'Utility',
    moduleType: 'effect:TriggeredGate',
    tags: ['gate', 'switch', 'routing', 'pass', 'mute', 'cv', 'window']
  },
  {
    id: 'SignalMath',
    glyph: '∑',
    label: 'Signal Math',
    tooltip: 'Algebraic Signal Math (A + B, A * B)',
    category: 'Utility',
    moduleType: 'effect:SignalMath',
    tags: ['math', 'add', 'multiply', 'scale', 'offset', 'cv', 'algebra']
  },
  {
    id: 'Inverter',
    glyph: '⇅',
    label: 'Inverter',
    tooltip: 'Polarity Inversion & Signal Negation',
    category: 'Utility',
    moduleType: 'effect:Inverter',
    tags: ['invert', 'negative', 'flip', 'reverse', 'cv', 'polarity']
  },
  {
    id: 'LumaSplit',
    glyph: '▤',
    label: 'Luma Split',
    tooltip: 'Split Texture by Luminance Bands',
    category: 'Utility',
    moduleType: 'effect:LumaSplitter',
    tags: ['luma', 'split', 'bands', 'zones', 'mask', 'isolator', 'threshold']
  },
  {
    id: 'LayerOut',
    glyph: '⇥',
    label: 'Layer Out',
    tooltip: 'Send Signal / Texture to Other Layer',
    category: 'Utility',
    moduleType: 'effect:InterLayerOutput',
    tags: ['routing', 'interlayer', 'send', 'bus', 'patch', 'broadcast']
  },
  {
    id: 'LayerIn',
    glyph: '⇤',
    label: 'Layer In',
    tooltip: 'Receive Signal / Texture from Other Layer',
    category: 'Utility',
    moduleType: 'effect:InterLayerInput',
    tags: ['routing', 'interlayer', 'receive', 'bus', 'patch', 'listen']
  },

  // ─── EFFECTS ─────────────────────────────────────────────────────────
  {
    id: 'Transform2D',
    glyph: '✥',
    label: 'Transform',
    tooltip: '2D Position, Rotation, Scale & Anchor',
    category: 'Effects',
    moduleType: 'effect:Transform2D',
    tags: ['transform', 'move', 'rotate', 'scale', 'position', 'zoom', 'spatial']
  },
  {
    id: 'ColorAdjust',
    glyph: '🎨',
    label: 'Color',
    tooltip: 'Hue, Saturation, Brightness & Contrast',
    category: 'Effects',
    moduleType: 'effect:ColorAdjust',
    tags: ['color', 'hue', 'saturation', 'brightness', 'contrast', 'grade', 'tint']
  },
  {
    id: 'LumaKey',
    glyph: '◐',
    label: 'Luma Key',
    tooltip: 'Luminance Threshold Keyer & Alpha Cutout',
    category: 'Effects',
    moduleType: 'effect:LumaKey',
    tags: ['luma', 'key', 'mask', 'threshold', 'alpha', 'cutout', 'matte']
  },
  {
    id: 'ColorRGB',
    glyph: 'RGB_STRIPES',
    label: 'RGB Split',
    tooltip: 'RGB Channel Split, Shift & Generation',
    category: 'Effects',
    moduleType: 'effect:ColorRGB',
    tags: ['rgb', 'chromatic', 'aberration', 'split', 'channels', 'glitch', 'prism']
  },
  {
    id: 'SimpleFeedback',
    glyph: '🔄',
    label: 'Feedback',
    tooltip: 'Recursive Texture Frame Feedback Loop',
    category: 'Effects',
    moduleType: 'effect:SimpleFeedback',
    tags: ['feedback', 'trails', 'echo', 'delay', 'recursive', 'ghosting', 'hall-of-mirrors']
  },
  {
    id: 'UVDisplace',
    glyph: '🌊',
    label: 'Displace',
    tooltip: 'Coordinate Domain Displacement Warp',
    category: 'Effects',
    moduleType: 'effect:UVDisplace',
    tags: ['warp', 'displacement', 'distortion', 'refraction', 'liquid', 'map', 'texture']
  },
  {
    id: 'Pattern',
    glyph: '▦',
    label: 'Pattern',
    tooltip: 'Tiling, Radial Repeats & Jitter Layout',
    category: 'Effects',
    moduleType: 'effect:Pattern',
    tags: ['pattern', 'tiling', 'repeat', 'grid', 'radial', 'kaleidoscope', 'mirror', 'jitter']
  },
  {
    id: 'Kaleidoscope',
    glyph: '✺',
    label: 'Kaleido',
    tooltip: 'Radial Reflections & Symmetry',
    category: 'Effects',
    moduleType: 'effect:Kaleidoscope',
    tags: ['kaleidoscope', 'radial', 'symmetry', 'mirror', 'mandala', 'reflections', 'geometry']
  },
  {
    id: 'AlphaAdjust',
    glyph: 'α',
    label: 'Alpha',
    tooltip: 'Opacity, Bypass & Matte Gain Control',
    category: 'Effects',
    moduleType: 'effect:AlphaAdjust',
    tags: ['alpha', 'opacity', 'transparency', 'fade', 'gain', 'mask']
  },
  {
    id: 'PixelProcessor',
    glyph: '👾',
    label: 'Pixel Proc',
    tooltip: 'Stylized Visual Processing (Posterize/Edge/Dither)',
    category: 'Effects',
    moduleType: 'effect:PixelProcessor',
    tags: ['pixel', 'posterize', 'edge', 'sobel', 'dither', 'retro', 'glitch', 'quantize']
  },

  // ─── AUDIO ───────────────────────────────────────────────────────────
  {
    id: 'AudioInput',
    glyph: '🎤',
    label: 'Audio In',
    tooltip: 'Live Microphone / Interface Audio Input',
    category: 'Audio',
    moduleType: 'source:AudioInput',
    tags: ['microphone', 'audio', 'live', 'input', 'sound', 'hardware']
  },
  {
    id: 'AudioFile',
    glyph: '🎵',
    label: 'Audio File',
    tooltip: 'Local Audio File Player (MP3/WAV)',
    category: 'Audio',
    moduleType: 'source:AudioFile',
    tags: ['audio', 'file', 'music', 'playback', 'sound', 'track', 'stem']
  },
  {
    id: 'SystemAudio',
    glyph: '🔊',
    label: 'Sys Audio',
    tooltip: 'Desktop System Audio Loopback Capture',
    category: 'Audio',
    moduleType: 'source:SystemAudio',
    tags: ['system', 'loopback', 'audio', 'capture', 'sound', 'desktop']
  },
  {
    id: 'AudioSource',
    glyph: '📻',
    label: 'Audio Bus',
    tooltip: 'Global Audio Bus Receiver',
    category: 'Audio',
    moduleType: 'effect:AudioSource',
    tags: ['bus', 'audio', 'receiver', 'patch', 'signal', 'routing']
  },
  {
    id: 'Oscilloscope',
    glyph: '〰️',
    label: 'Scope',
    tooltip: 'Real-time Audio Signal Waveform Scope',
    category: 'Audio',
    moduleType: 'effect:Oscilloscope',
    tags: ['scope', 'waveform', 'visualizer', 'oscilloscope', 'metering', 'reactive']
  },
  {
    id: 'SpectralSplit',
    glyph: '📊',
    label: 'Spectral',
    tooltip: '5-Band Frequency Analysis (Sub, Bass, Mid, Hi)',
    category: 'Audio',
    moduleType: 'effect:SpectralSplitter',
    tags: ['fft', 'spectral', 'bands', 'equalizer', 'frequency', 'metering', 'bass', 'reactive']
  },
  {
    id: 'AudioUtility',
    glyph: '🎛️',
    label: 'Audio Util',
    tooltip: 'Audio Side-chain Processor (Filter/Comp/Env)',
    category: 'Audio',
    moduleType: 'effect:AudioTransformer',
    tags: ['filter', 'compressor', 'envelope', 'sidechain', 'utility', 'dsp', 'dynamics']
  },
  {
    id: 'AudioModulator',
    glyph: '🧬',
    label: 'Modulator',
    tooltip: 'Harmonic Sculptor (Ring Mod / Octave Bank)',
    category: 'Audio',
    moduleType: 'effect:AudioModulator',
    tags: ['ringmod', 'harmonics', 'octave', 'modulator', 'dsp', 'timbre']
  },
  {
    id: 'AudioGate',
    glyph: '🎚️',
    label: 'Audio Gate',
    tooltip: 'Adjustable Threshold Dynamics Noise Gate',
    category: 'Audio',
    moduleType: 'effect:AudioGate',
    tags: ['gate', 'threshold', 'dynamics', 'noise', 'audio', 'mute']
  },
  {
    id: 'SpeechEnvelopeTracker',
    glyph: '🗣️📈',
    label: 'Vocal Env',
    tooltip: 'Speech Envelope Tracker (Loudness & Syllables)',
    category: 'Audio',
    moduleType: 'effect:SpeechEnvelopeTracker',
    tags: ['vocal', 'speech', 'envelope', 'loudness', 'transients', 'syllables', 'voice']
  },
  {
    id: 'VocalPitchTracker',
    glyph: '🗣️🎼',
    label: 'Vocal Pitch',
    tooltip: 'YIN Fundamental Pitch Tracker & MIDI Note F0',
    category: 'Audio',
    moduleType: 'effect:VocalPitchTracker',
    tags: ['pitch', 'vocal', 'yin', 'f0', 'note', 'frequency', 'tuner', 'voice']
  },
  {
    id: 'VowelFormantTracker',
    glyph: '🗣️🎨',
    label: 'Vocal Vowel',
    tooltip: '2D Formant Tracker (F1/F2 Vowel Plane)',
    category: 'Audio',
    moduleType: 'effect:VowelFormantTracker',
    tags: ['vowel', 'formant', 'f1', 'f2', 'vocal', 'phoneme', 'voice', 'coordinates']
  },
  {
    id: 'SpokenWordVisualizer',
    glyph: '🗣️💎',
    label: 'Vocal Console',
    tooltip: 'Master Speech Bay with 17 Analytical Outputs',
    category: 'Audio',
    moduleType: 'effect:SpokenWordVisualizer',
    tags: ['vocal', 'console', 'bay', 'routing', 'speech', 'multitrack', 'voice']
  }
];

export interface CategoryBankConfig {
  order: string[]; // list of module IDs
  sort: 'custom' | 'az';
  collapsed?: boolean;
}

export type BankConfig = Record<CategoryType, CategoryBankConfig>;

export const DEFAULT_BANK_CONFIG: BankConfig = {
  Sources: {
    order: ['VideoFile', 'Webcam', 'ShapeGen', 'NoiseSource'],
    sort: 'custom',
    collapsed: false
  },
  Utility: {
    order: ['LFO', 'TriggerPad', 'VideoMixer', 'AudioToCV', 'Path'],
    sort: 'custom',
    collapsed: false
  },
  Effects: {
    order: ['Transform2D', 'ColorAdjust', 'SimpleFeedback', 'UVDisplace', 'Pattern', 'LumaKey'],
    sort: 'custom',
    collapsed: false
  },
  Audio: {
    order: ['AudioInput', 'SpectralSplit', 'VocalPitchTracker'],
    sort: 'custom',
    collapsed: false
  }
};

export const BANK_CONFIG_STORAGE_KEY = 'terp_bank_config';

export function loadBankConfig(): BankConfig {
  try {
    const raw = localStorage.getItem(BANK_CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Ensure all 4 categories exist
      const config: BankConfig = { ...DEFAULT_BANK_CONFIG };
      for (const cat of CATEGORIES) {
        if (parsed[cat] && Array.isArray(parsed[cat].order)) {
          config[cat] = {
            order: parsed[cat].order.filter((id: string) => ALL_MODULES.some(m => m.id === id)),
            sort: parsed[cat].sort === 'az' ? 'az' : 'custom',
            collapsed: !!parsed[cat].collapsed
          };
        }
      }
      return config;
    }
  } catch (err) {
    console.warn('[moduleRegistry] Failed to parse bank config from localStorage:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_BANK_CONFIG));
}

export function saveBankConfig(config: BankConfig): void {
  try {
    localStorage.setItem(BANK_CONFIG_STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('terp_bank_config_updated'));
  } catch (err) {
    console.warn('[moduleRegistry] Failed to save bank config:', err);
  }
}
