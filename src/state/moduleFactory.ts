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
        strokeMode: 'classic',
        strokeThreshold: 0.1,
        fillColor: [1.0, 1.0, 1.0, 1.0],
        x: 0,
        y: 0,
        scale: 1.0,
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
  switch (type.trim()) {
    case 'Transform2D': return { id, type: 'Transform2D', translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, spin: 0 };
    case 'ColorAdjust': return { id, type: 'ColorAdjust', hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false };
    case 'LumaKey': return { id, type: 'LumaKey', threshold: 0.5, tolerance: 0.1, invertKey: false };
    case 'AudioSource': return { id, type: 'AudioSource', busId: 'master' };
    case 'Oscilloscope': return { id, type: 'Oscilloscope', isFrozen: false, triggerLevel: 0.5, timeScale: 1.0 };
    case 'InterLayerOutput': return { id, type: 'InterLayerOutput', portCount: 1 };
    case 'InterLayerInput': return { id, type: 'InterLayerInput', portCount: 1 };
    case 'ColorRGB': return { id, type: 'ColorRGB', r: 0.5, g: 0.5, b: 0.5, rMode: 'add', gMode: 'add', bMode: 'add', rInputMode: 'channel', gInputMode: 'channel', bInputMode: 'channel' };
    case 'LumaSplitter': return { id, type: 'LumaSplitter', threshold1: 0.33, threshold2: 0.66, softness: 0.1 };
    case 'Spawn': return { id, type: 'Spawn', x: 0, y: 0, scale: 0.5, rotation: 0, maxCount: 20, lifetime: 2.0, fadeOut: true, randomPos: 0.0, randomScale: 0.0, coordinateMode: 'normalized' } as any;
    case 'Path': return { id, type: 'Path', mode: 'physics', speed: 1.0, strength: 1.0, frequency: 1.0, drift: 0.0 };
    case 'Inverter': return { id, type: 'Inverter', videoMode: 'rgb', cvMode: 'unipolar', triggerMode: 'latch', mix: 1.0, active: true };
    case 'LogicGate': return { id, type: 'LogicGate', mode: 'and', thresholdA: 0.5, thresholdB: 0.5 };
    case 'TriggeredGate': return { id, type: 'TriggeredGate', gateMode: 'momentary', defaultState: 'off', threshold: 0.5, active: false, gateOpen: false };
    case 'Pattern': return { id, type: 'Pattern', countX: 2, countY: 2, spacingX: 0, spacingY: 0, offsetX: 0, offsetY: 0, alternateMirrorX: false, alternateMirrorY: false, syncCount: true, syncSpacing: true, syncOffset: true, mirrorXTrigger: false, mirrorYTrigger: false } as any;
    case 'VideoMixer': return { id, type: 'VideoMixer', v1: 1, v2: 0, v3: 0, v4: 0, v1Mode: 'normal', v2Mode: 'add', v3Mode: 'add', v4Mode: 'add', masterGain: 1.0 };
    case 'Kaleidoscope': return { id, type: 'Kaleidoscope', segments: 6, angle: 0, zoom: 1.0, center: [0.5, 0.5] };
    case 'SignalMath':
    case 'Math': 
      return { id, type: 'SignalMath', operator: 'add', operandA: 0, operandB: 0 };
    case 'SampleAndHold':
      return { 
        id, type: 'SampleAndHold', lastSampledValue: 0, manualTriggerTime: 0, keyMapping: 'none',
        isLive: false, triggerMode: 'sample_show' 
      };
    case 'SimpleFeedback':
      return { id, type: 'SimpleFeedback', feedbackAmount: 0.9, zoom: 0.95, angle: 0.05 };
    case 'StepSequencer':
      return {
        id, type: 'StepSequencer',
        steps: 8,
        currentStep: 0,
        rate: 2.0,
        rateMode: 'hz',
        shuffle: 0,
        slew: 0.1,
        playState: 'play',
        direction: 'forward',
        stepValues: new Array(16).fill(0.5),
        endStep: 7,
        manualResetTrigger: 0
      };
    default:
      return { id, type: 'SimpleFeedback', feedbackAmount: 0.9, zoom: 0.95, angle: 0.05 } as any;
  }
}

export function createDefaultModulator(type: string): any {
  switch (type) {
    case 'LFO':
      return { type, waveform: 'sine', frequency: 0.1, speedRange: 'low', amplitude: 1.0, offset: 0, bipolar: true };
    case 'TriggerPad':
      return { type, isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 };
    case 'Noise':
      return { type, noiseType: 'white', frequency: 1.0, amplitude: 1.0, octaves: 4, persistence: 0.5, bipolar: true, frozen: false, manualTriggerTime: 0 };
    default:
      return { type: 'TriggerPad', isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 };
  }
}
