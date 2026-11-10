import { AnySource, AnyEffect, GlyphTemplatePack } from './types';

export function isKnownSourceType(type: string): boolean {
  if (!type) return false;
  switch (type.trim()) {
    case 'ShapeGenerator':
    case 'VideoURL':
    case 'VideoFile':
    case 'WebcamCapture':
    case 'ImageFile':
    case 'AudioInput':
    case 'AudioFile':
    case 'SystemAudio':
    case 'NoiseSource':
    case 'ImageLoader':
    case 'ColorNoise':
    case 'ImageCue':
    case 'TextCue':
    case 'None':
      return true;
    default:
      return false;
  }
}

export function isKnownEffectType(type: string): boolean {
  if (!type) return false;
  switch (type.trim()) {
    case 'Transform2D':
    case 'ColorAdjust':
    case 'LumaKey':
    case 'AudioSource':
    case 'Oscilloscope':
    case 'SpectralSplitter':
    case 'WaterfallSpectrogram':
    case 'AudioTransformer':
    case 'AudioModulator':
    case 'AudioGate':
    case 'AudioToCV':
    case 'SpeechEnvelopeTracker':
    case 'VocalPitchTracker':
    case 'VowelFormantTracker':
    case 'SpokenWordVisualizer':
    case 'InterLayerOutput':
    case 'InterLayerInput':
    case 'ColorRGB':
    case 'LumaSplitter':
    case 'Spawn':
    case 'Path':
    case 'Inverter':
    case 'LogicGate':
    case 'TriggeredGate':
    case 'Pattern':
    case 'UVDisplace':
    case 'VideoMixer':
    case 'KeyMixer':
    case 'VideoMath':
    case 'AlphaAdjust':
    case 'Kaleidoscope':
    case 'SignalMath':
    case 'Math':
    case 'SampleAndHold':
    case 'SimpleFeedback':
    case 'StepSequencer':
    case 'ShapeGenerator':
    case 'VideoFile':
    case 'VideoURL':
    case 'WebcamCapture':
    case 'PixelProcessor':
    case 'NoiseSource':
    case 'ImageFile':
    case 'ImageCue':
    case 'TextCue':
    case 'ColorNoise':
    case 'ImageLoader':
    case 'AudioInput':
    case 'AudioFile':
    case 'SystemAudio':
    case 'CanvasBackground':
    case 'ParticleCloud':
    case 'ColorPalette':
    case 'GrassField':
    case 'TextMaker':
    case 'LumaBands':
    case 'GlyphMap':
    case 'ChromaBands':
    case 'Outline':
    case 'OpticalSensor':
      return true;
    default:
      return false;
  }
}

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

    case 'VideoURL':
      return { type: 'VideoURL', videoUrl: "https://vjs.zencdn.net/v/oceans.mp4", playbackSpeed: 1.0, loop: true, playState: 'pause', objectFit: 'cover', volume: 1.0, audioMuted: true, resetTarget: 'start flag' };
    case 'VideoFile':
      return { type: 'VideoFile', fileUrl: "", fileName: "No file selected", playbackSpeed: 1.0, loop: true, playState: 'pause', objectFit: 'cover', volume: 1.0, audioMuted: true, resetTarget: 'start flag' };
    case 'WebcamCapture':
      return { type: 'WebcamCapture', deviceId: "", objectFit: 'cover' };
    case 'ImageFile':
      return { type: 'ImageFile', fileUrl: "", fileName: "No file selected", objectFit: 'cover' };
    case 'AudioInput':
      return { type: 'AudioInput', deviceId: "", volume: 1.0, muted: false };
    case 'AudioFile':
      return { type: 'AudioFile', fileUrl: "", fileName: "No file selected", volume: 1.0, muted: false, loop: true, playState: 'pause', playbackSpeed: 1.0, resetTarget: 'start flag' };
    case 'SystemAudio':
      return { type: 'SystemAudio', volume: 1.0, muted: false };
    case 'NoiseSource':
      return { type: 'NoiseSource', noiseType: 'perlin', scale: 2.0, evolution: 1.0, octaves: 4, persistence: 0.5, seed: 123, brightness: 0, contrast: 1, flowSpeed: 1.0, autoAnimate: true };
    case 'ImageLoader':
      return { type: 'ImageLoader', imageUrl: "/logo.png", objectFit: 'cover' };
    case 'ColorNoise':
      return { type: 'ColorNoise', noiseType: 'perlin', scale: 2.0, evolution: 1.0, octaves: 4, persistence: 0.5, seed: 123, brightness: 0, contrast: 1, flowSpeed: 1.0, autoAnimate: true };
    case 'ImageCue': {
      const defaultBanks = Array.from({ length: 16 }, (_, i) => ({
        id: `bank-${i + 1}`,
        name: `Bank ${i + 1}`,
        images: [] as string[],
        playbackOrder: 'in_order' as const,
        loopMode: 'loop' as const,
        autoPlayback: false,
        playbackSpeed: 1.0,
        activeImageIndex: 0
      }));
      return {
        type: 'ImageCue',
        directoryPath: '',
        directoryName: 'No folder selected',
        files: [],
        fileNames: [],
        playbackMode: 'directory',
        dirPlaybackOrder: 'in_order',
        dirAutoPlayback: false,
        dirPlaybackSpeed: 1.0,
        dirLoopMode: 'loop',
        activeDirIndex: 0,
        bankGridMode: '8',
        activeBankIndex: 0,
        banks: defaultBanks,
        bankAutoPlayback: false,
        bankSkipEmpty: true,
        bankPlaybackSpeed: 1.0,
        bankLoopMode: 'loop',
        objectFit: 'fill',
        transitionType: 'cut',
        transitionDuration: 0.5,
        triggerThreshold: 0.5,
        keyMapping: 'none',
        midiPadMappings: {}
      } as any;
    }
    case 'TextCue': {
      const defaultBanks = Array.from({ length: 24 }, (_, i) => ({
        id: `bank-${i + 1}`,
        name: `Bank ${i + 1}`,
        cards: [],
        playbackOrder: 'in_order' as const,
        loopMode: 'loop' as const,
        autoPlayback: false,
        playbackSpeed: 1.0,
        activeCardIndex: 0
      }));
      return {
        type: 'TextCue',
        bankGridMode: '8',
        activeBankIndex: 0,
        banks: defaultBanks,
        bankAutoPlayback: false,
        bankSkipEmpty: true,
        bankPlaybackSpeed: 2.0,
        bankPlaybackOrder: 'in_order',
        bankLoopMode: 'loop',
        triggerThreshold: 0.5,
        keyMapping: 'none',
        bankKeyMapping: 'none',
        midiPadMappings: {},
        currentText: '',
        prevText: '',
        lastStepTime: 0,
        stepCount: 0
      } as any;
    }
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
    case 'Oscilloscope': return { 
      id, 
      type: 'Oscilloscope', 
      isFrozen: false, 
      triggerLevel: 0.5, 
      timeScale: 1.0,
      traceColor: [0.0, 1.0, 0.25, 1.0], // Classic analog CRT phosphor green
      showScaffold: false,
      colorMode: 'amplitude',
      gain: 2.0
    };
    case 'SpectralSplitter': return { 
      id, 
      type: 'SpectralSplitter', 
      busId: 'master', 
      smoothing: 0.8, 
      sensitivity: 1.0,
      showScaffold: false,
      colorMode: 'frequency',
      barColor: [0.1, 0.7, 0.8, 1.0],
      gain: 2.0
    };
    case 'WaterfallSpectrogram': return {
      id,
      type: 'WaterfallSpectrogram',
      busId: 'master',
      tilt: 0.5,
      gain: 2.0,
      speed: 1.0,
      scaleX: 1.0,
      scaleY: 1.0,
      linkScale: true,
      colorMode: 'topographic',
      flowDirection: 'front-to-back',
      renderStyle: 'surface',
      showScaffold: false,
      lineColor: [0.0, 1.0, 0.4, 1.0]
    };
    case 'AudioTransformer': return { 
      id, type: 'AudioTransformer', 
      filterType: 'lowpass', filterFreq: 1000, filterResonance: 0.5, 
      compSustain: 0.2, outputGain: 1.0,
      envelopeAttack: 0.01, envelopeRelease: 0.1,
      bypass: false, bypassLatching: true
    };
    case 'AudioModulator': return {
      id, type: 'AudioModulator',
      ringFreq: 440, ringMix: 0,
      octaveSub2: 0, octaveSub1: 0, octaveClean: 1, octaveHigh1: 0, octaveHigh2: 0,
      bypass: false
    };
    case 'AudioGate': return {
      id, type: 'AudioGate',
      thresholdDb: -40,
      bypass: false,
      bypassLatching: true,
      releaseMs: 150
    };
    case 'AudioToCV': return {
      id,
      type: 'AudioToCV',
      mode: 'envelope',
      gain: 1.0,
      attack: 10,
      release: 100,
      smoothing: 0.1,
      gateThreshold: 0.4,
      bipolar: false
    };
    case 'SpeechEnvelopeTracker': return {
      id, type: 'SpeechEnvelopeTracker',
      layerId: '',
      attackMs: 10,
      releaseMs: 150,
      sensitivityDb: -40,
      speechContinuous: false,
      silenceContinuous: false
    };
    case 'VocalPitchTracker': return {
      id, type: 'VocalPitchTracker',
      layerId: '',
      minPitchHz: 80,
      maxPitchHz: 800,
      tolerance: 0.15,
      pitchRangeMode: 'voice'
    };
    case 'VowelFormantTracker': return {
      id, type: 'VowelFormantTracker',
      layerId: '',
      smoothing: 0.8,
      voiceProfile: 'universal'
    };
    case 'SpokenWordVisualizer': return {
      id, type: 'SpokenWordVisualizer',
      layerId: '',
      renderMode: 'Constellation',
      colorPalette: 'vibrant'
    };
    case 'InterLayerOutput': return { id, type: 'InterLayerOutput', portCount: 1 };
    case 'InterLayerInput': return { id, type: 'InterLayerInput', portCount: 1 };
    case 'ColorRGB': return { id, type: 'ColorRGB', r: 0.5, g: 0.5, b: 0.5, rMode: 'add', gMode: 'add', bMode: 'add', rInputMode: 'channel', gInputMode: 'channel', bInputMode: 'channel' };
    case 'LumaSplitter': return { id, type: 'LumaSplitter', threshold1: 0.33, threshold2: 0.66, softness: 0.1 };
    case 'Spawn': return {
      id,
      type: 'Spawn',
      emissionMode: 'rate',
      emitRate: 3,
      disseminationMode: 'cone',
      maxCount: 16,
      lifetime: 3.0,
      speed: 0.3,
      angle: 90,
      coneSpread: 45,
      gravity: 0.0,
      drag: 0.05,
      spin: 0.0,
      x: 0,
      y: 0,
      scale: 0.4,
      scaleEnd: 0.1,
      fadeOut: true,
      randomPos: 0.05,
      randomScale: 0.1,
      coordinateMode: 'normalized'
    } as any;
    case 'Path': return { id, type: 'Path', mode: 'physics', speed: 1.0, strength: 1.0, frequency: 1.0, drift: 0.0 };
    case 'Inverter': return { id, type: 'Inverter', videoMode: 'rgb', cvMode: 'unipolar', triggerMode: 'latch', mix: 1.0, active: true };
    case 'LogicGate': return { id, type: 'LogicGate', mode: 'and', thresholdA: 0.5, thresholdB: 0.5 };
    case 'TriggeredGate': return { id, type: 'TriggeredGate', gateMode: 'momentary', defaultState: 'off', threshold: 0.5, active: false, gateOpen: false };
    case 'Pattern': return { 
      id, type: 'Pattern', countX: 2, countY: 2, spacingX: 0, spacingY: 0, offsetX: 0, offsetY: 0, 
      alternateMirrorX: false, alternateMirrorY: false, syncCount: true, syncSpacing: true, syncOffset: true, mirrorXTrigger: false, mirrorYTrigger: false,
      mode: 'grid', radialRings: 4, radialSegments: 8, tileRotation: 0, jitter: 0
    } as any;
    case 'UVDisplace': return {
      id, type: 'UVDisplace',
      amount: 0.2,
      amountX: 1.0,
      amountY: 1.0,
      mode: 'cartesian',
      wrapMode: 'clamp',
      polarity: 'bipolar',
      edgeFalloff: 0.1
    };
    case 'VideoMixer': return { id, type: 'VideoMixer', v1: 1, v2: 0, v3: 0, v4: 0, v1Alpha: 1.0, v2Alpha: 1.0, v3Alpha: 1.0, v4Alpha: 1.0, v1Mode: 'normal', v2Mode: 'add', v3Mode: 'add', v4Mode: 'add', masterGain: 1.0 };
    case 'KeyMixer': return {
      id, type: 'KeyMixer',
      mode: 'chroma',
      threshold: 0.35,
      tolerance: 0.15,
      spillSuppression: 0.6,
      keyColorR: 0.0,
      keyColorG: 1.0,
      keyColorB: 0.0,
      invertMask: false,
      blendMode: 'normal',
      masterGain: 1.0,
      outputMode: 'composite'
    };
    case 'VideoMath': return {
      id, type: 'VideoMath',
      operation: 'add',
      gainA: 1.0,
      gainB: 1.0,
      offset: 0.0,
      clampOutput: true,
      masterGain: 1.0
    };
    case 'AlphaAdjust': return { id, type: 'AlphaAdjust', amount: 1.0, invertAmount: false, bypass: false, bypassMode: 'momentary' };
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
    case 'ShapeGenerator':
      return { id, ...createDefaultSource('ShapeGenerator') } as any;
    case 'VideoFile':
      return { id, ...createDefaultSource('VideoFile') } as any;
    case 'VideoURL':
      return { id, ...createDefaultSource('VideoURL') } as any;
    case 'WebcamCapture':
      return { id, ...createDefaultSource('WebcamCapture') } as any;
    case 'PixelProcessor':
      return { 
        id, type: 'PixelProcessor', 
        posterizeActive: false, posterizeLevels: 8,
        thresholdActive: false, thresholdValue: 0.5, thresholdSoftness: 0.05,
        edgeActive: false, edgeAmount: 1.0, edgeThreshold: 0.1,
        bypass: false 
      };
    case 'NoiseSource':
      return { id, ...createDefaultSource('NoiseSource') } as any;
    case 'ImageFile':
      return { id, ...createDefaultSource('ImageFile') } as any;
    case 'ImageCue':
      return { id, ...createDefaultSource('ImageCue') } as any;
    case 'TextCue':
      return { id, ...createDefaultSource('TextCue') } as any;
    case 'ColorNoise':
      return { id, ...createDefaultSource('ColorNoise') } as any;
    case 'ImageLoader':
      return { id, ...createDefaultSource('ImageLoader') } as any;
    case 'AudioInput':
      return { id, ...createDefaultSource('AudioInput') } as any;
    case 'AudioFile':
      return { id, ...createDefaultSource('AudioFile') } as any;
    case 'SystemAudio':
      return { id, ...createDefaultSource('SystemAudio') } as any;
    case 'CanvasBackground':
      return {
        id,
        type: 'CanvasBackground',
        mode: 'linear',
        colorA: [0.08, 0.08, 0.12, 1.0],
        colorB: [0.2, 0.1, 0.3, 1.0],
        colorC: [0.05, 0.15, 0.25, 1.0],
        useThreeColors: false,
        angle: 45,
        spread: 0.5,
        radialCenterX: 0.5,
        radialCenterY: 0.5,
        radialRadius: 0.7,
        luma: 0,
        chroma: 0,
      };

    case 'ParticleCloud':
      return {
        id,
        type: 'ParticleCloud',
        particleCount: 20000,
        speed: 0.8,
        spread: 0.5,
        turbulence: 1.0,
        noiseFreq: 1.2,
        lifetime: 3.0,
        pointSize: 4.0,
        colorPalette: 'starlight',
        blendMode: 'additive',
        emitterShape: 'point',
        emitterRadius: 0.1,
        emitterX: 0.0,
        emitterY: 0.0,
        gravityX: 0.0,
        gravityY: 0.0,
        audioReactivity: true,
        audioSensitivity: 1.0,
      };

    case 'ColorPalette':
      return {
        id,
        type: 'ColorPalette',
        colors: [
          {
            id: 'c_1',
            color: [0.0, 0.95, 1.0, 1.0], // Default single vibrant color stop (Cyan)
            weight: 1.0,
            active: true
          }
        ],
        interpolation: 'smooth'
      };

    case 'GrassField':
      return {
        id,
        type: 'GrassField',
        tilt: 0.5,
        zoom: 1.0,
        horizonY: 0.0,
        growth: 0.8,
        growthRate: 1.0,
        growthAudioMode: 'accumulate',
        density: 0.6,
        bend: 0.2,
        invertCurvature: false,
        fatness: 1.0,
        windSpeed: 1.5,
        windStrength: 1.0,
        bassCoupling: true,
        tuftStyle: 'wildflowers',
        tuftChance: 0.05,
        tuftBurstAmount: 25,
        tuftThreshold: 0.6,
        timerDecayEnabled: true,
        lifetimeDuration: 10.0,
        gatedPruneEnabled: false,
        pruneThreshold: 0.7,
        removalStyle: 'dissolve',
        pruneAudioMode: 'transient_cut',
        colorPreset: 'meadow',
        showSky: true,
        showGround: true
      };

    case 'TextMaker':
      return {
        id,
        type: 'TextMaker',
        localText: 'TERPSICHORE\nVIDEO SYNTHESIS SYSTEM',
        allCaps: false,
        fontFamily: 'broadcast_sans',
        fontSize: 52,
        stretchMode: '1x',
        textAlign: 'center',
        letterSpacing: 1,
        lineHeight: 1.25,
        headerOverrideEnabled: false,
        headerScale: 1.4,
        headerColor: [1.0, 0.85, 0.1, 1.0],
        textColor: [1.0, 1.0, 1.0, 1.0],
        textColorB: [0.35, 0.75, 1.0, 1.0],
        colorFillMode: 'solid',
        gradientDirection: 'line_vertical',
        colorCycleSpeed: 0.5,
        outlineEnabled: true,
        outlineWidth: 0.25,
        outlineColor: [0.05, 0.05, 0.08, 1.0],
        shadowEnabled: true,
        shadowAmount: 0.45,
        shadowAngle: 135,
        shadowColor: [0.0, 0.0, 0.0, 0.85],
        extrudeEnabled: false,
        extrudeAmount: 0.35,
        extrudeAngle: 135,
        extrudeColor: [0.15, 0.25, 0.55, 1.0],
        glowEnabled: false,
        glowAmount: 0.4,
        glowColor: [0.2, 0.7, 1.0, 1.0],
        glowMatchTextColor: false,
        backdropMode: 'none',
        backdropColor: [0.05, 0.1, 0.35, 0.85],
        backdropBorderWidth: 0.3,
        backdropBorderColor: [1.0, 0.85, 0.1, 1.0],
        bgMode: 'transparent',
        bgColorA: [0.06, 0.08, 0.22, 1.0],
        bgColorB: [0.02, 0.02, 0.06, 1.0],
        layoutMode: 'page',
        snapZone: 4,
        posX: 0.0,
        posY: 0.0,
        scrollSpeed: 0.4,
        transitionMode: 'crossfade',
        transitionDuration: 0.6,
        typewriterCursor: 'block',
        keyMapping: 'none',
        analogFxMaster: true,
        analogFxMode: 'on',
        pixelateEnabled: true,
        pixelateAmount: 0.3,
        chromaBleedEnabled: true,
        chromaBleedAmount: 0.35,
        scanlinesEnabled: true,
        scanlinesAmount: 0.25,
        jitterEnabled: false,
        jitterAmount: 0.2,
        noiseEnabled: false,
        noiseAmount: 0.15
      };

    case 'LumaBands':
      return {
        id,
        type: 'LumaBands',
        bands: [
          { id: 'b-0', threshold: 127, color: [0.10, 0.10, 0.15, 1.0] },
          { id: 'b-1', threshold: 255, color: [0.95, 0.95, 0.90, 1.0] }
        ],
        spatialSmoothing: 0.35,
        feather: 0.0,
        usePaletteIn: true,
        outlineEnabled: true,
        outlineWidth: 2,
        outlineOpacity: 1.0,
        outlineColor: [0.0, 0.0, 0.0, 1.0]
      };

    case 'GlyphMap':
      return {
        id,
        type: 'GlyphMap',
        bands: [
          { id: 'gb-0', threshold: 64, color: [0.15, 0.40, 0.20, 1.0], glyphText: '' },
          { id: 'gb-1', threshold: 128, color: [0.20, 0.75, 0.35, 1.0], glyphText: '' },
          { id: 'gb-2', threshold: 192, color: [0.40, 0.95, 0.60, 1.0], glyphText: '' },
          { id: 'gb-3', threshold: 255, color: [0.95, 1.00, 0.95, 1.0], glyphText: '' }
        ],
        mapMode: 'luma',
        spatialSmoothing: 0.2,
        chromaGate: 0.02,
        chromaSensitivity: 1.5,
        hueShift: 0,
        outlineEnabled: false,
        outlineWidth: 2,
        outlineOpacity: 1.0,
        outlineColor: [0.0, 0.0, 0.0, 1.0],
        cellSize: 16,
        fontFamily: 'VT323',
        fontWeight: 'normal',
        textGlowColor: '#00ff66',
        textGlowRadius: 0,
        textShadowColor: 'transparent',
        sourceMode: 'templates',
        templatePack: 'density',
        wrapMode: 'raw_char',
        autoScroll: false,
        scrollDirection: 'left',
        scrollSpeed: 1.0,
        colorMode: 'layer_palette',
        bgMode: 'transparent',
        dimmedVideoOpacity: 0.2,
        usePaletteIn: true
      };

    case 'ChromaBands':
      return {
        id,
        type: 'ChromaBands',
        bands: [
          { id: 'cb-0', threshold: 180, color: [0.85, 0.20, 0.20, 1.0] },
          { id: 'cb-1', threshold: 360, color: [0.20, 0.40, 0.90, 1.0] }
        ],
        chromaGate: 0.02,
        chromaSensitivity: 1.5,
        hueShift: 0,
        gateMode: 'base_layer',
        spatialSmoothing: 0.35,
        usePaletteIn: true,
        outlineEnabled: true,
        outlineWidth: 2,
        outlineOpacity: 1.0,
        outlineColor: [0.0, 0.0, 0.0, 1.0]
      };

    case 'Outline':
      return {
        id,
        type: 'Outline',
        edgeMode: 'luma_bands',
        bandCount: 4,
        threshold: 0.25,
        lineWidth: 2.0,
        lineOpacity: 1.0,
        lineColor: [0.0, 0.0, 0.0, 1.0],
        colorMode: 'custom',
        bgMode: 'over_video_ink',
        spatialSmoothing: 0.2,
        analogDirection: 'horizontal',
        usePaletteIn: true,
        pulseActive: false,
        pulseAmount: 1.5,
        pulseSpeed: 1.0,
        pulseFreq: 3.0,
        pulseMode: 'local_edge'
      };

    case 'OpticalSensor':
      return {
        id,
        type: 'OpticalSensor',
        sensorId: '',
        gain: 1.0,
        threshold: 0.3,
      };

    default:
      return { id, type: 'SimpleFeedback', feedbackAmount: 0.9, zoom: 0.95, angle: 0.05 } as any;
  }
}

export function createDefaultModulator(type: string): any {
  switch (type) {
    case 'LFO':
      return { type, waveform: 'sine', frequency: 1.0, speedRange: 'low', amplitude: 1.0, offset: 0, bipolar: true };
    case 'TriggerPad':
      return { type, isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 };
    case 'Noise':
      return { type, noiseType: 'white', frequency: 1.0, amplitude: 1.0, octaves: 4, persistence: 0.5, bipolar: true, frozen: false, manualTriggerTime: 0 };
    case 'MidiInput':
      return { type, channel: 'all', ccNumber: 7, clockDivision: '1/4' };
    default:
      return { type: 'TriggerPad', isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 };
  }
}

export const DEFAULT_LUMA_PALETTE: [number, number, number, number][] = [
  [0.10, 0.10, 0.15, 1.0], // Deep slate (Base)
  [0.18, 0.32, 0.65, 1.0], // Cobalt Navy
  [0.15, 0.58, 0.35, 1.0], // Forest Green
  [0.85, 0.45, 0.12, 1.0], // Ochre / Rust Orange
  [0.92, 0.75, 0.18, 1.0], // Warm Gold
  [0.85, 0.35, 0.65, 1.0], // Rose / Magenta
  [0.45, 0.85, 0.95, 1.0], // Cyan
  [0.96, 0.96, 0.92, 1.0]  // Warm Ivory (Highlight)
];

export function autoDistributeLumaThresholds(bandCount: number): number[] {
  const count = Math.max(2, Math.min(8, bandCount));
  const step = 256 / count;
  const thresholds: number[] = [];
  for (let i = 1; i <= count; i++) {
    thresholds.push(Math.min(255, Math.round(i * step) - 1));
  }
  thresholds[thresholds.length - 1] = 255;
  return thresholds;
}

/**
 * Updates a band's threshold and cascades any overlaps:
 * - Pulling a slider down pushes lower bands down (waterfall reduction)
 * - Pulling a slider up pushes higher bands up (below top ceiling)
 * - Maintains 1 <= T[0] < T[1] < ... < T[N-2] < T[N-1] = 255
 */
export function cascadeLumaThresholds<T extends { threshold: number }>(
  bands: T[],
  targetIndex: number,
  newThreshold: number
): T[] {
  const N = bands.length;
  if (N <= 1 || targetIndex >= N - 1 || targetIndex < 0) {
    return bands;
  }

  const nextBands = bands.map(b => ({ ...b }));

  // Clamp target value to valid range given count of bands below and above
  const minAllowed = targetIndex + 1;
  const maxAllowed = 255 - (N - 1 - targetIndex);
  const clampedVal = Math.max(minAllowed, Math.min(maxAllowed, newThreshold));
  nextBands[targetIndex].threshold = clampedVal;

  // Cascade downward: if band[i] >= band[i+1], push band[i] down
  for (let i = targetIndex - 1; i >= 0; i--) {
    if (nextBands[i].threshold >= nextBands[i + 1].threshold) {
      nextBands[i].threshold = nextBands[i + 1].threshold - 1;
    }
  }

  // Cascade upward: if band[i] <= band[i-1], push band[i] up (top band at N-1 is always 255)
  for (let i = targetIndex + 1; i < N - 1; i++) {
    if (nextBands[i].threshold <= nextBands[i - 1].threshold) {
      nextBands[i].threshold = nextBands[i - 1].threshold + 1;
    }
  }

  nextBands[N - 1].threshold = 255;
  return nextBands;
}

export const DEFAULT_CHROMA_PALETTE: [number, number, number, number][] = [
  [0.85, 0.20, 0.20, 1.0], // Crimson / Red
  [0.90, 0.55, 0.15, 1.0], // Amber / Orange
  [0.92, 0.85, 0.15, 1.0], // Gold / Yellow
  [0.20, 0.75, 0.35, 1.0], // Emerald / Green
  [0.15, 0.75, 0.85, 1.0], // Cyan / Turquoise
  [0.20, 0.40, 0.90, 1.0], // Royal Blue
  [0.65, 0.25, 0.85, 1.0], // Purple / Violet
  [0.90, 0.25, 0.60, 1.0]  // Magenta / Rose
];

export function autoDistributeChromaThresholds(bandCount: number): number[] {
  const count = Math.max(2, Math.min(8, bandCount));
  const step = 360 / count;
  const thresholds: number[] = [];
  for (let i = 1; i <= count; i++) {
    thresholds.push(Math.min(360, Math.round(i * step)));
  }
  thresholds[thresholds.length - 1] = 360;
  return thresholds;
}

/**
 * Updates a chroma band's angular threshold and cascades any overlaps:
 * - Maintains 1 <= T[0] < T[1] < ... < T[N-2] < T[N-1] = 360
 */
export function cascadeChromaThresholds<T extends { threshold: number }>(
  bands: T[],
  targetIndex: number,
  newThreshold: number
): T[] {
  const N = bands.length;
  if (N <= 1 || targetIndex >= N - 1 || targetIndex < 0) {
    return bands;
  }

  const nextBands = bands.map(b => ({ ...b }));

  const minAllowed = targetIndex + 1;
  const maxAllowed = 360 - (N - 1 - targetIndex);
  const clampedVal = Math.max(minAllowed, Math.min(maxAllowed, newThreshold));
  nextBands[targetIndex].threshold = clampedVal;

  for (let i = targetIndex - 1; i >= 0; i--) {
    if (nextBands[i].threshold >= nextBands[i + 1].threshold) {
      nextBands[i].threshold = nextBands[i + 1].threshold - 1;
    }
  }

  for (let i = targetIndex + 1; i < N - 1; i++) {
    if (nextBands[i].threshold <= nextBands[i - 1].threshold) {
      nextBands[i].threshold = nextBands[i - 1].threshold + 1;
    }
  }

  nextBands[N - 1].threshold = 360;
  return nextBands;
}


export const GLYPH_TEMPLATE_PACKS: Record<GlyphTemplatePack, string[]> = {
  density: [' ', '.', ':', '-', '=', '+', '#', '@'],
  directional: ['\\', '/', '|', '-', '^', 'v', '<', '>'],
  alpha: ['A', 'E', 'I', 'O', 'U', 'X', 'Y', 'Z'],
  numeric: ['0', '1', '2', '3', '4', '5', '6', '7'],
  symbols: ['$', '%', '&', '*', '#', '§', '¶', '©'],
  punctuation: ['.', ',', ':', ';', '!', '?', '"', '~']
};
