import { AnySource, AnyEffect } from './types';

export function createDefaultSource(type: string): AnySource {
  switch (type) {
    case 'ShapeGenerator':
      return {
        type: 'ShapeGenerator',
        shapeType: "polygon",
        sides: 5,
        roundness: 0,
        convexity: 0,
        rotation: 0,
        strokeWidth: 0,
        fillColor: [0.3, 0.8, 0.4, 1.0],
        x: 0,
        y: 0,
        scale: 1.0,
        tiling: [1, 1],
        tilingMode: 'repeat',
        edgeSoftness: 0.05
      };
    case 'SignalProcessor':
      return { type: 'SignalProcessor', operation: 'multiply', operandA: 1.0, operandB: 1.0 } as any;
    case 'VideoURL':
      return { type: 'VideoURL', videoUrl: "https://vjs.zencdn.net/v/oceans.mp4", playbackSpeed: 1.0, loop: true, playState: 'pause', objectFit: 'cover', volume: 1.0, audioMuted: true };
    case 'VideoFile':
      return { type: 'VideoFile', fileUrl: "", fileName: "No file selected", playbackSpeed: 1.0, loop: true, playState: 'pause', objectFit: 'cover', volume: 1.0, audioMuted: true };
    case 'WebcamCapture':
      return { type: 'WebcamCapture', deviceId: "", objectFit: 'cover' };
    case 'ImageFile':
      return { type: 'ImageFile', fileUrl: "", fileName: "No file selected", objectFit: 'cover' };
    case 'AudioInput':
      return { type: 'AudioInput', deviceId: "", volume: 1.0, muted: false };
    case 'AudioFile':
      return { type: 'AudioFile', fileUrl: "", fileName: "No file selected", volume: 1.0, muted: false, loop: true, playState: 'pause' };
    case 'SystemAudio':
      return { type: 'SystemAudio', volume: 1.0, muted: false };
    case 'NoiseSource':
      return { type: 'NoiseSource', noiseType: 'perlin', scale: 2.0, evolution: 1.0, octaves: 4, persistence: 0.5, seed: 123, brightness: 0, contrast: 1, flowSpeed: 1.0, autoAnimate: true };
    case 'ImageLoader':
      return { type: 'ImageLoader', imageUrl: "/logo.png", objectFit: 'cover' };
    default:
      return { type: 'None' } as any;
  }
}

export function createDefaultEffect(type: string, id: string): AnyEffect {
  switch (type) {
    case 'Transform2D': return { id, type, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, spin: 0 };
    case 'ColorAdjust': return { id, type, hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false };
    case 'LumaKey': return { id, type, threshold: 0.5, tolerance: 0.1, invertKey: false };
    case 'AudioAnalyzer': return { id, type, smoothing: 0.5, sensitivity: 1.0, logarithmic: false };
    case 'InterLayerOutput': return { id, type, portCount: 1 };
    case 'InterLayerInput': return { id, type, portCount: 1 };
    case 'ColorRGB': return { id, type, r: 0.5, g: 0.5, b: 0.5, rMode: 'add', gMode: 'add', bMode: 'add' };
    case 'LumaSplitter': return { id, type, threshold1: 0.33, threshold2: 0.66, softness: 0.1 };
    case 'Spawn': return { id, type, x: 0, y: 0, scale: 0.5, rotation: 0, maxCount: 20, lifetime: 2.0, fadeOut: true, randomPos: 0.0, randomScale: 0.0, coordinateMode: 'normalized' } as any;
    case 'RGBMixer': return { id, type, rLevel: 1, gLevel: 1, bLevel: 1 };
    case 'Path': return { id, type, mode: 'physics', speed: 1.0, strength: 1.0, frequency: 1.0, drift: 0.0 };
    case 'Inverter': return { id, type, videoMode: 'rgb', cvMode: 'unipolar', triggerMode: 'latch', mix: 1.0, active: true };
    case 'LogicGate': return { id, type, mode: 'and', thresholdA: 0.5, thresholdB: 0.5 };
    case 'TriggeredGate': return { id, type, gateMode: 'momentary', defaultState: 'off', threshold: 0.5, active: false, gateOpen: false };
    default: return { id, type: 'SimpleFeedback', feedbackAmount: 0.9, zoom: 0.95, angle: 0.05 } as any;
  }
}

export function createDefaultModulator(type: string): any {
  switch (type) {
    case 'LFO':
      return { type, waveform: 'sine', frequency: 0.1, speedRange: 'low', amplitude: 1.0, offset: 0, bipolar: true };
    case 'TriggerPad':
      return { type, isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 };
    case 'Noise':
      return { type, noiseType: 'white', frequency: 1.0, amplitude: 1.0, octaves: 4, persistence: 0.5, bipolar: true };
    default:
      return { type: 'TriggerPad', isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 };
  }
}
