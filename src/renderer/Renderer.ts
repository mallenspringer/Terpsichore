import { useEngineStore } from '../state/store';
import { MediaManager } from './MediaManager';
import { SimulationPipeline } from './SimulationPipeline';
import { ShapeGeneratorWGSL } from './shaders/ShapeGenerator';
import { FullscreenQuadWGSL } from './shaders/FullscreenQuad';
import { Transform2DWGSL } from './shaders/Transform2D';
import { ColorAdjustWGSL } from './shaders/ColorAdjust';
import { ColorRGBWGSL } from './shaders/ColorRGB';
import { LumaKeyWGSL } from './shaders/LumaKey';
import { SimpleFeedbackWGSL } from './shaders/SimpleFeedback';
import { ImageVideoSourceWGSL, VideoSourceWGSL } from './shaders/ImageVideoSource';
import { ImageCueSourceWGSL } from './shaders/ImageCueSource';
import { ImageCueManager } from './ImageCueManager';
import { TextCueRenderer } from './TextCueRenderer';
import { TextMakerRenderer } from './TextMakerRenderer';
import { TextMakerStage1WGSL, TextMakerStage2WGSL } from './shaders/TextMaker';
import { AudioEngine } from '../state/AudioEngine';
import { GLYPH_TEMPLATE_PACKS } from '../state/moduleFactory';
import { LumaSplitterWGSL } from './shaders/LumaSplitter';
import { SpawnWGSL, SpawnVertexWGSL } from './shaders/Spawn';
import { NoiseSourceVertexWGSL, NoiseSourceFragmentWGSL, ColorNoiseFragmentWGSL } from './shaders/NoiseSource';
import { InverterWGSL } from './shaders/Inverter';
import { VideoMixerWGSL } from './shaders/VideoMixer';
import { TriggeredGateWGSL } from './shaders/TriggeredGate';
import { PatternWGSL } from './shaders/Pattern';
import { KaleidoscopeWGSL } from './shaders/Kaleidoscope';
import { OscilloscopeWGSL } from './shaders/Oscilloscope';
import { SpectralSplitterWGSL } from './shaders/SpectralSplitter';
import { WaterfallSpectrogramWGSL } from './shaders/WaterfallSpectrogram';
import { PixelProcessorFragmentWGSL } from './shaders/PixelProcessor';
import { SpokenWordVisualizerWGSL } from './shaders/SpokenWordVisualizer';
import { KeyMixerWGSL } from './shaders/KeyMixer';
import { VideoMathWGSL } from './shaders/VideoMath';
import { UVDisplaceWGSL } from './shaders/UVDisplace';
import { CanvasBackgroundWGSL } from './shaders/CanvasBackground';
import { AlphaAdjustWGSL } from './shaders/AlphaAdjust';
import { ParticleComputeWGSL, ParticleRenderWGSL } from './shaders/ParticleCloud';
import {
  GrassComputeWGSL,
  GrassDustComputeWGSL,
  GrassRenderWGSL,
  GrassTuftRenderWGSL,
  GrassDustRenderWGSL
} from './shaders/GrassField';
import {
  GRASS_BASS_WIND_RANGE,
  GRASS_HF_PRUNE_RANGE,
  resolveGrowthBandHz
} from '../utils/grassFieldUtils';
import { ArabesqueRenderWGSL } from './shaders/Arabesque';
import {
  ArabesqueSimulation,
  MAX_ARABESQUE_SEGMENTS,
  ARABESQUE_SEGMENT_FLOATS,
  ARABESQUE_SEGMENT_BYTES
} from './ArabesqueSimulation';
import {
  ARABESQUE_BASS_SURGE_RANGE,
  ARABESQUE_HF_BRANCH_RANGE,
  resolveArabesqueCurlBandHz
} from '../utils/arabesqueUtils';
import { LumaBandsWGSL } from './shaders/LumaBands';
import { ChromaBandsWGSL } from './shaders/ChromaBands';
import { GlyphMapWGSL } from './shaders/GlyphMap';
import { OutlineWGSL } from './shaders/Outline';
import { BadAnalogWGSL } from './shaders/BadAnalog';
import { DataMoshWGSL } from './shaders/DataMosh';
import { VideoFeedbackWGSL } from './shaders/VideoFeedback';
import { GlyphMapRenderer } from './GlyphMapRenderer';
import { DEFAULT_LUMA_PALETTE, DEFAULT_CHROMA_PALETTE } from '../state/moduleFactory';
import { DATAMOSH_DEFAULTS, computeFrameRetention } from '../utils/dataMoshUtils';

import { PORT_DEFS } from '../components/NodeGraph/portDefs';
import { SignalDispatcher } from '../state/SignalDispatcher';
import {
  ShapeGeneratorSource, Transform2DEffect, ColorAdjustEffect, LumaKeyEffect,
  SimpleFeedbackEffect, ColorRGBEffect, LumaSplitterEffect, VideoMixerEffect,
  KeyMixerEffect, VideoMathEffect, UVDisplaceEffect, CanvasBackgroundEffect,
  AlphaAdjustEffect, ParticleCloudEffect, ColorPaletteEffect, GrassFieldEffect, ArabesqueEffect,
  NoiseVideoSource, ColorNoiseSource, InverterEffect, PixelProcessorEffect,
  PatternEffect, KaleidoscopeEffect, SampleAndHoldEffect, OscilloscopeEffect, SpectralSplitterEffect, WaterfallSpectrogramEffect,
  SpokenWordVisualizerEffect,
  LayerState, AnySource, ImageCueSource, TextCueSource, TextMakerEffect, LumaBandsEffect, ChromaBandsEffect, GlyphMapEffect, OutlineEffect, BadAnalogEffect, DataMoshEffect, FeedbackProEffect
} from '../state/types';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;

  private masterFBO!: GPUTexture;
  private layerFBO_A!: GPUTexture;
  private layerFBO_B!: GPUTexture;

  private prevFrameFBOs: Record<string, GPUTexture> = {};
  public mediaManager: MediaManager = new MediaManager();
  public simulationPipeline: SimulationPipeline = new SimulationPipeline();
  public get isSeeking() { return this.mediaManager.isSeeking; }
  public set isSeeking(val: Record<string, boolean>) { this.mediaManager.isSeeking = val; }


  private shapePipeline!: GPURenderPipeline;
  private mediaPipeline!: GPURenderPipeline;
  private transformPipeline!: GPURenderPipeline;
  private spawnPipeline!: GPURenderPipeline;
  private noiseSourcePipeline!: GPURenderPipeline;
  private colorAdjustPipeline!: GPURenderPipeline;
  private lumaKeyPipeline!: GPURenderPipeline;
  private colorRGBPipeline!: GPURenderPipeline;
  private feedbackPipeline!: GPURenderPipeline;
  private videoPipeline!: GPURenderPipeline;
  private lumaSplitPipeline!: GPURenderPipeline;
  private lumaAnalysisPipeline!: GPURenderPipeline;
  private lumaAnalysisTexture!: GPUTexture;
  private blitPipeline!: GPURenderPipeline;
  private inverterPipeline!: GPURenderPipeline;
  private triggeredGatePipeline!: GPURenderPipeline;
  private videoMixerPipeline!: GPURenderPipeline;
  private patternPipeline!: GPURenderPipeline;
  private kaleidoscopePipeline!: GPURenderPipeline;
  private oscilloscopePipeline!: GPURenderPipeline;
  private spectralSplitterPipeline!: GPURenderPipeline;
  private waterfallPipeline!: GPURenderPipeline;
  private waterfallHistory: Map<string, { texture: GPUTexture; head: number; stepAccumulator: number }> = new Map();
  private repeatSampler!: GPUSampler;
  private pixelProcessorPipeline!: GPURenderPipeline;
  private colorNoisePipeline!: GPURenderPipeline;
  private spokenWordPipeline!: GPURenderPipeline;
  private keyMixerPipeline!: GPURenderPipeline;
  private videoMathPipeline!: GPURenderPipeline;
  private uvDisplacePipeline!: GPURenderPipeline;
  private canvasBackgroundPipeline!: GPURenderPipeline;
  private alphaAdjustPipeline!: GPURenderPipeline;
  private particleComputePipeline!: GPUComputePipeline;
  private particleRenderAdditivePipeline!: GPURenderPipeline;
  private particleRenderAlphaPipeline!: GPURenderPipeline;
  private particlePingPong: Map<string, number> = new Map();
  private particleInitDone: Set<string> = new Set();
  private particleLastTime: Map<string, number> = new Map();
  private grassComputePipeline!: GPUComputePipeline;
  private grassDustComputePipeline!: GPUComputePipeline;
  private grassRenderPipeline!: GPURenderPipeline;
  private grassTuftRenderPipeline!: GPURenderPipeline;
  private grassDustRenderPipeline!: GPURenderPipeline;
  private grassPingPong: Map<string, number> = new Map();
  private grassGrowthAccum: Map<string, number> = new Map();
  private grassLastTime: Map<string, number> = new Map();
  private grassWindPhase: Map<string, number> = new Map();
  private grassTuftCooldown: Map<string, number> = new Map();
  private grassDepthTextures: Map<string, GPUTexture> = new Map();
  private grassBandEnv: Map<string, number> = new Map();
  private grassHfBaseline: Map<string, number> = new Map();
  private grassPruneCooldown: Map<string, number> = new Map();

  private arabesqueRenderPipeline!: GPURenderPipeline;
  private arabesqueSims: Map<string, ArabesqueSimulation> = new Map();
  private arabesqueLastTime: Map<string, number> = new Map();
  private arabesqueStaging: Float32Array = new Float32Array(MAX_ARABESQUE_SEGMENTS * ARABESQUE_SEGMENT_FLOATS);

  // Isolated layouts to prevent 'Minimum Binding Size' collisions
  private effectLayouts: Map<string, GPUBindGroupLayout> = new Map();

  public mediaTextures: Record<string, GPUTexture> = {};
  private imageCuePipeline!: GPURenderPipeline;
  private cueTexturesCurrent: Record<string, GPUTexture> = {};
  private cueTexturesPrev: Record<string, GPUTexture> = {};
  private cueLastBitmapCurrent: Record<string, ImageBitmap> = {};
  private cueLastBitmapPrev: Record<string, ImageBitmap> = {};
  private textCueTextures: Record<string, GPUTexture> = {};
  private textMakerStage1Pipeline!: GPURenderPipeline;
  private textMakerStage2Pipeline!: GPURenderPipeline;
  private lumaBandsPipeline!: GPURenderPipeline;
  private chromaBandsPipeline!: GPURenderPipeline;
  private glyphMapPipeline!: GPURenderPipeline;
  private outlinePipeline!: GPURenderPipeline;
  private badAnalogPipeline!: GPURenderPipeline;
  private dataMoshPipeline!: GPURenderPipeline;
  private dataMoshHistoryA: Record<string, GPUTexture> = {};
  private dataMoshHistoryB: Record<string, GPUTexture> = {};
  private dataMoshPrevInput: Record<string, GPUTexture> = {};
  private dataMoshPingPong: Record<string, boolean> = {};
  private dataMoshInitialized: Record<string, boolean> = {};
  private dataMoshLastKeyframeTime: Record<string, number> = {};
  private dataMoshLastManualTrig: Record<string, number> = {};
  private dataMoshLastCVTrig: Record<string, number> = {};
  private dataMoshLastTime: Record<string, number> = {};
  private dataMoshBiasAccum: Record<string, { x: number; y: number }> = {};
  private feedbackProPipeline!: GPURenderPipeline;
  private fpHistoryA: Record<string, GPUTexture> = {};
  private fpHistoryB: Record<string, GPUTexture> = {};
  private fpPingPong: Record<string, boolean> = {};
  private fpLastClear: Record<string, number> = {};
  private fpLastClearCV: Record<string, number> = {};
  private fpFrozenTex: Record<string, GPUTexture> = {};
  private fpWasFrozen: Record<string, boolean> = {};
  private fpInitialized: Record<string, boolean> = {};
  private glyphMapAtlasTex: GPUTexture | null = null;
  private textMakerCurrGlyphTex: Record<string, GPUTexture> = {};
  private textMakerPrevGlyphTex: Record<string, GPUTexture> = {};
  private textMakerRuntime = new Map<string, {
    currentText: string;
    prevText: string;
    lastStepTime: number;
    stepCount: number;
    lastSeenExtStep: number;
    lastManualTrig: number;
    lastWipeTrig: number;
    scrollAccum: number;
    lastTimeSec: number;
    hadExternalText: boolean;
  }>();
  private nodeTextures: Map<string, GPUTexture> = new Map();
  private analysisReadbackBuffers: Map<string, GPUBuffer> = new Map();
  private analysisWeightBuffers: Map<string, GPUBuffer> = new Map();
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private storageBuffers: Map<string, GPUBuffer> = new Map();
  private analysisBusy: Set<string> = new Set();
  public latestLumaValues: Record<string, number> = {};

  private sampler!: GPUSampler;
  private blankTexture!: GPUTexture;

  private externalCanvas: HTMLCanvasElement | null = null;
  private externalContext: GPUCanvasContext | null = null;
  private animationHost: Window | null = null;

  public setAnimationHost(host: Window | null): void {
    if (this.animationHost === host) return;

    if (this.animationFrameId) {
      try {
        if (this.animationHost && !this.animationHost.closed && typeof this.animationHost.cancelAnimationFrame === 'function') {
          this.animationHost.cancelAnimationFrame(this.animationFrameId);
        } else if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(this.animationFrameId);
        }
      } catch (e) {}
      this.animationFrameId = 0;
    }

    this.animationHost = host;

    if (this.isRunning) {
      const sched = (this.animationHost && !this.animationHost.closed) ? this.animationHost : window;
      this.animationFrameId = sched.requestAnimationFrame(this.renderLoop);
    }
  }

  public setExternalCanvas(canvas: HTMLCanvasElement | null): boolean {
    if (!canvas) {
      this.externalCanvas = null;
      this.externalContext = null;
      this.setAnimationHost(null);
      return true;
    }

    try {
      const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!ctx) {
        console.warn('[Renderer] External canvas does not support webgpu context');
        this.externalCanvas = null;
        this.externalContext = null;
        return false;
      }
      ctx.configure({
        device: this.device,
        format: this.format,
        alphaMode: 'premultiplied'
      });
      this.externalCanvas = canvas;
      this.externalContext = ctx;
      console.log('[Renderer] External WebGPU canvas configured for zero-copy native presentation');
      return true;
    } catch (err) {
      console.warn('[Renderer] Could not configure external WebGPU canvas with device:', err);
      this.externalCanvas = null;
      this.externalContext = null;
      return false;
    }
  }

  private isRunning = false;
  private _isDestroyed = false;
  private animationFrameId: number = 0;
  public startTime = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public async initialize() {
    if (!navigator.gpu) throw new Error("WebGPU not supported on this browser.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error("No appropriate WebGPU adapter found.");

    this.device = await adapter.requestDevice();
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' });

    this.device.lost.then((info) => {
      console.warn(`WebGPU device was lost: ${info.message}`);
      if (info.reason !== 'destroyed') {
        // Attempt recovery or notify user
        this.initialize();
      }
    });

    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.repeatSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'repeat'
    });

    this.blankTexture = this.device.createTexture({
      size: [1, 1],
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.nodeTextures.set('__dummy__', this.blankTexture);

    this.setupRenderTargets();
    this.setupPipelines();

    if (this._isDestroyed) return;

    this.isRunning = true;
    this.startTime = performance.now();
    this.renderLoop();
  }

  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.device) this.setupRenderTargets();
  }

  private setupRenderTargets() {
    if (this.masterFBO) this.masterFBO.destroy();
    if (this.layerFBO_A) this.layerFBO_A.destroy();
    if (this.layerFBO_B) this.layerFBO_B.destroy();
    this.storageBuffers.forEach(b => b.destroy());
    this.storageBuffers.clear();

    const size = { width: this.canvas.width, height: this.canvas.height };
    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC;

    this.masterFBO = this.device.createTexture({ size, format: this.format, usage });
    this.layerFBO_A = this.device.createTexture({ size, format: this.format, usage });
    this.layerFBO_B = this.device.createTexture({ size, format: this.format, usage });

    Object.values(this.prevFrameFBOs).forEach(fbo => fbo.destroy());
    this.prevFrameFBOs = {};
    Object.values(this.dataMoshHistoryA).forEach(t => t.destroy());
    Object.values(this.dataMoshHistoryB).forEach(t => t.destroy());
    Object.values(this.dataMoshPrevInput).forEach(t => t.destroy());
    this.dataMoshHistoryA = {};
    this.dataMoshHistoryB = {};
    this.dataMoshPrevInput = {};
    this.dataMoshInitialized = {};
    this.dataMoshLastTime = {};
    this.dataMoshBiasAccum = {};
    Object.values(this.fpHistoryA).forEach(t => t.destroy());
    Object.values(this.fpHistoryB).forEach(t => t.destroy());
    Object.values(this.fpFrozenTex).forEach(t => t.destroy());
    this.fpHistoryA = {};
    this.fpHistoryB = {};
    this.fpFrozenTex = {};
    this.fpWasFrozen = {};
    this.fpInitialized = {};
    this.grassDepthTextures.forEach(t => t.destroy());
    this.grassDepthTextures.clear();
  }

  private getPrevFrameFBO(layerId: string) {
    if (!this.prevFrameFBOs[layerId]) {
      this.prevFrameFBOs[layerId] = this.device.createTexture({
        size: { width: this.canvas.width, height: this.canvas.height },
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC
      });
    }
    return this.prevFrameFBOs[layerId];
  }


  private renderSpawn(layer: LayerState, nodeId: string, inputTex: GPUTexture, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const stateKey = `${layer.id}.${nodeId}`;
    const width = target.width;
    const height = target.height;
    const aspect = width / height;

    const { instanceData, count } = this.simulationPipeline.computeInstanceData(
      layer,
      nodeId,
      timeSec,
      width,
      height,
      this.getEffectiveParam.bind(this)
    );

    // 1. Clear Target
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    if (count > 0) {
      pass.setPipeline(this.spawnPipeline);

      const storageBuffer = this.getStorageBuffer(`${stateKey}.instances`, instanceData.byteLength);
      this.device.queue.writeBuffer(storageBuffer, 0, instanceData as any);

      const globalUniforms = this.getUniformBuffer(`${stateKey}.globals`, 16);
      this.device.queue.writeBuffer(globalUniforms, 0, new Float32Array([aspect, 0, 0, 0]));

      const bindGroup = this.device.createBindGroup({
        layout: this.spawnPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: storageBuffer } },
          { binding: 1, resource: { buffer: globalUniforms } },
          { binding: 2, resource: (inputTex ?? this.blankTexture).createView() },
          { binding: 3, resource: this.sampler }
        ]
      });

      pass.setBindGroup(0, bindGroup);
      pass.draw(3, count);
    }

    pass.end();
  }

  private setupPipelines() {
    const layout = 'auto';
    const vertex = { module: this.device.createShaderModule({ code: FullscreenQuadWGSL }), entryPoint: 'vs_main' };
    const targets = [{ format: this.format }];
    const primitive = { topology: 'triangle-list' as GPUPrimitiveTopology };

    this.shapePipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: ShapeGeneratorWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.mediaPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: ImageVideoSourceWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.imageCuePipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: ImageCueSourceWGSL }),
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
          }
        }]
      },
      primitive
    });
    this.transformPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: Transform2DWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.colorAdjustPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: ColorAdjustWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.lumaKeyPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: LumaKeyWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.colorRGBPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
              { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} }
            ]
          })
        ]
      }),
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: ColorRGBWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format },
          { format: this.format },
          { format: this.format },
        ]
      },
      primitive
    });
    this.effectLayouts.set('ColorRGB', this.colorRGBPipeline.getBindGroupLayout(0));
    this.feedbackPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: SimpleFeedbackWGSL }), entryPoint: 'fs_main', targets }, primitive });

    this.videoPipeline = this.device.createRenderPipeline({
      layout, vertex,
      fragment: { module: this.device.createShaderModule({ code: VideoSourceWGSL }), entryPoint: 'fs_video', targets },
      primitive
    });

    this.blitPipeline = this.device.createRenderPipeline({
      layout, vertex,
      fragment: {
        module: this.device.createShaderModule({
          code: `@group(0) @binding(0) var srcTex: texture_2d<f32>; @group(0) @binding(1) var smp: sampler; @fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> { return textureSample(srcTex, smp, uv); }`
        }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
      },
      primitive,
    });

    this.triggeredGatePipeline = this.device.createRenderPipeline({
      layout, vertex,
      fragment: { module: this.device.createShaderModule({ code: TriggeredGateWGSL }), entryPoint: 'fs_main', targets },
      primitive
    });

    this.videoMixerPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
            ]
          })
        ]
      }),
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: VideoMixerWGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });




    this.lumaSplitPipeline = this.device.createRenderPipeline({
      layout, vertex,
      fragment: {
        module: this.device.createShaderModule({ code: LumaSplitterWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format }, // composite
          { format: this.format }, // low
          { format: this.format }, // mid
          { format: this.format }, // high
        ]
      },
      primitive
    });
    this.effectLayouts.set('LumaSplitter', this.lumaSplitPipeline.getBindGroupLayout(0));

    this.lumaAnalysisPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
            ]
          })
        ]
      }),
      vertex,
      fragment: {
        module: this.device.createShaderModule({
          code: `
            @group(0) @binding(0) var<uniform> weights: vec4<f32>;
            @group(0) @binding(1) var src: texture_2d<f32>; 
            @group(0) @binding(2) var smp: sampler; 
            @fragment fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> { 
              let c = textureSample(src, smp, vec2<f32>(0.5, 0.5));
              let val = dot(c.rgb, weights.rgb);
              return vec4<f32>(val, val, val, 1.0);
            }
          `
        }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });

    this.lumaAnalysisTexture = this.device.createTexture({ size: [1, 1, 1], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });


    this.noiseSourcePipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
          })
        ]
      }),
      vertex: {
        module: this.device.createShaderModule({ code: NoiseSourceVertexWGSL }),
        entryPoint: 'vs_main'
      },
      fragment: {
        module: this.device.createShaderModule({ code: NoiseSourceFragmentWGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive: { topology: 'triangle-list' }
    });

    this.spawnPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
              { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
            ]
          })
        ]
      }),
      vertex: {
        module: this.device.createShaderModule({ code: SpawnVertexWGSL }),
        entryPoint: 'vs_main'
      },
      fragment: {
        module: this.device.createShaderModule({ code: SpawnWGSL }),
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive
    });
    this.inverterPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: InverterWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.patternPipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: PatternWGSL }), entryPoint: 'fs_main', targets }, primitive });
    this.kaleidoscopePipeline = this.device.createRenderPipeline({ layout, vertex, fragment: { module: this.device.createShaderModule({ code: KaleidoscopeWGSL }), entryPoint: 'fs_main', targets }, primitive });

    this.pixelProcessorPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex,
      fragment: { module: this.device.createShaderModule({ code: PixelProcessorFragmentWGSL }), entryPoint: 'fs_main', targets },
      primitive
    });
    this.effectLayouts.set('PixelProcessor', this.pixelProcessorPipeline.getBindGroupLayout(0));

    // Capture auto-generated layouts
    this.effectLayouts.set('Transform2D', this.transformPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('ColorAdjust', this.colorAdjustPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('LumaKey', this.lumaKeyPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('Inverter', this.inverterPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('Pattern', this.patternPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('Kaleidoscope', this.kaleidoscopePipeline.getBindGroupLayout(0));
    this.effectLayouts.set('SimpleFeedback', this.feedbackPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('TriggeredGate', this.triggeredGatePipeline.getBindGroupLayout(0));
    this.effectLayouts.set('VideoMixer', this.videoMixerPipeline.getBindGroupLayout(0));
    this.effectLayouts.set('LumaSplitter', this.lumaSplitPipeline.getBindGroupLayout(0));

    this.oscilloscopePipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
            ]
          })
        ]
      }),
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: OscilloscopeWGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });
    this.effectLayouts.set('Oscilloscope', this.oscilloscopePipeline.getBindGroupLayout(0));

    this.spectralSplitterPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({
            entries: [
              { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
              { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }
            ]
          })
        ]
      }),
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: SpectralSplitterWGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });
    this.effectLayouts.set('SpectralSplitter', this.spectralSplitterPipeline.getBindGroupLayout(0));

    this.waterfallPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: WaterfallSpectrogramWGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });
    this.effectLayouts.set('WaterfallSpectrogram', this.waterfallPipeline.getBindGroupLayout(0));

    this.colorNoisePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: this.device.createShaderModule({ code: NoiseSourceVertexWGSL }), entryPoint: 'vs_main' },
      fragment: {
        module: this.device.createShaderModule({ code: ColorNoiseFragmentWGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });

    this.spokenWordPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: SpokenWordVisualizerWGSL }),
        entryPoint: 'fs_main',
        targets
      },
      primitive
    });
    this.effectLayouts.set('SpokenWordVisualizer', this.spokenWordPipeline.getBindGroupLayout(0));

    this.keyMixerPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: KeyMixerWGSL }),
        entryPoint: 'fs_main',
        targets
      },
      primitive
    });
    this.effectLayouts.set('KeyMixer', this.keyMixerPipeline.getBindGroupLayout(0));

    this.videoMathPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: VideoMathWGSL }),
        entryPoint: 'fs_main',
        targets
      },
      primitive
    });
    this.effectLayouts.set('VideoMath', this.videoMathPipeline.getBindGroupLayout(0));

    this.uvDisplacePipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: UVDisplaceWGSL }),
        entryPoint: 'fs_main',
        targets
      },
      primitive
    });
    this.effectLayouts.set('UVDisplace', this.uvDisplacePipeline.getBindGroupLayout(0));

    this.canvasBackgroundPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: CanvasBackgroundWGSL }),
        entryPoint: 'fs_main',
        targets
      },
      primitive
    });
    this.effectLayouts.set('CanvasBackground', this.canvasBackgroundPipeline.getBindGroupLayout(0));

    this.alphaAdjustPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: AlphaAdjustWGSL }),
        entryPoint: 'fs_main',
        targets
      },
      primitive
    });
    this.effectLayouts.set('AlphaAdjust', this.alphaAdjustPipeline.getBindGroupLayout(0));

    this.particleComputePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: ParticleComputeWGSL }),
        entryPoint: 'cs_main'
      }
    });

    this.particleRenderAdditivePipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: ParticleRenderWGSL }),
        entryPoint: 'vs_main'
      },
      fragment: {
        module: this.device.createShaderModule({ code: ParticleRenderWGSL }),
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }
          }
        }]
      },
      primitive
    });

    this.particleRenderAlphaPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: this.device.createShaderModule({ code: ParticleRenderWGSL }),
        entryPoint: 'vs_main'
      },
      fragment: {
        module: this.device.createShaderModule({ code: ParticleRenderWGSL }),
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive
    });

    this.textMakerStage1Pipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: TextMakerStage1WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.format }]
      },
      primitive
    });

    this.textMakerStage2Pipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: TextMakerStage2WGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });

    this.lumaBandsPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: LumaBandsWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('LumaBands', this.lumaBandsPipeline.getBindGroupLayout(0));
    this.chromaBandsPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: ChromaBandsWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('ChromaBands', this.chromaBandsPipeline.getBindGroupLayout(0));
    const glyphMapBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} }
      ]
    });

    this.glyphMapPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [glyphMapBindGroupLayout]
      }),
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: GlyphMapWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('GlyphMap', glyphMapBindGroupLayout);

    this.outlinePipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: OutlineWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('Outline', this.outlinePipeline.getBindGroupLayout(0));

    this.badAnalogPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: BadAnalogWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('BadAnalog', this.badAnalogPipeline.getBindGroupLayout(0));

    this.dataMoshPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: DataMoshWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('DataMosh', this.dataMoshPipeline.getBindGroupLayout(0));

    this.feedbackProPipeline = this.device.createRenderPipeline({
      layout,
      vertex,
      fragment: {
        module: this.device.createShaderModule({ code: VideoFeedbackWGSL }),
        entryPoint: 'fs_main',
        targets: [
          { format: this.format },
          { format: this.format }
        ]
      },
      primitive
    });
    this.effectLayouts.set('FeedbackPro', this.feedbackProPipeline.getBindGroupLayout(0));



    this.grassComputePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: GrassComputeWGSL }),
        entryPoint: 'cs_main'
      }
    });

    this.grassDustComputePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: GrassDustComputeWGSL }),
        entryPoint: 'cs_dust'
      }
    });

    const grassRenderModule = this.device.createShaderModule({ code: GrassRenderWGSL });
    this.grassRenderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: grassRenderModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: grassRenderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });

    const grassTuftModule = this.device.createShaderModule({ code: GrassTuftRenderWGSL });
    this.grassTuftRenderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: grassTuftModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: grassTuftModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less'
      }
    });

    const grassDustModule = this.device.createShaderModule({ code: GrassDustRenderWGSL });
    this.grassDustRenderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: grassDustModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: grassDustModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less'
      }
    });

    const arabesqueModule = this.device.createShaderModule({ code: ArabesqueRenderWGSL });
    this.arabesqueRenderPipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: arabesqueModule,
        entryPoint: 'vs_main'
      },
      fragment: {
        module: arabesqueModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.format,
          blend: {
            color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
          }
        }]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none'
      }
    });
  }

  private storageBufferGenerations = new Map<string, number>();
  private glyphGridUploadedGenerations = new Map<string, number>();

  private getStorageBuffer(key: string, size: number): GPUBuffer {
    let buf = this.storageBuffers.get(key);
    if (!buf || buf.size < size) {
      if (buf) buf.destroy();
      buf = this.device.createBuffer({
        size: Math.ceil(size / 256) * 256,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.storageBuffers.set(key, buf);
      this.storageBufferGenerations.set(key, (this.storageBufferGenerations.get(key) || 0) + 1);
    }
    return buf;
  }

  public getMediaElement(key: string): HTMLVideoElement | HTMLAudioElement | null {
    return this.mediaManager.getMediaElement(key);
  }

  public getMediaProgress(key: string): { currentTime: number, duration: number } {
    return this.mediaManager.getMediaProgress(key);
  }

  private manageMediaSource(key: string, source: any): HTMLVideoElement | ImageBitmap | null {
    return this.mediaManager.manageMediaSource(key, source);
  }

  private getEffectiveParam(layer: LayerState, nodeId: string, paramId: string, baseValue: number, _timeSec: number): number {
    let base = baseValue;

    let midiOverride = SignalDispatcher.getInstance().getMidiOverride(layer.id, nodeId, paramId);
    if (midiOverride === null && paramId.endsWith('_cv')) {
      const bare = paramId === 'scale_x_cv' ? 'scaleX' : (paramId === 'scale_y_cv' ? 'scaleY' : paramId.replace(/_cv$/, ''));
      midiOverride = SignalDispatcher.getInstance().getMidiOverride(layer.id, nodeId, bare);
    }

    if (midiOverride !== null) {
      base = midiOverride;
    } else if (paramId === 'scaleY') {
      const isLinked = layer.linkedScales?.[nodeId] ?? true;
      const effect = layer.effects.find(e => e.id === nodeId);
      if (effect?.type === 'Transform2D' && isLinked) {
        const xOverride = SignalDispatcher.getInstance().getMidiOverride(layer.id, nodeId, 'scaleX');
        if (xOverride !== null) base = xOverride;
      }
    } else if (paramId === 'scale_y_cv') {
      const effect = layer.effects.find(e => e.id === nodeId) as any;
      const isLinked = effect?.linkScale ?? (layer.linkedScales?.[nodeId] ?? true);
      if (effect?.type === 'WaterfallSpectrogram' && isLinked) {
        const xOverride = SignalDispatcher.getInstance().getMidiOverride(layer.id, nodeId, 'scale_x_cv') ??
                          SignalDispatcher.getInstance().getMidiOverride(layer.id, nodeId, 'scaleX');
        if (xOverride !== null) base = xOverride;
      }
    }

    let finalValue = base;

    // Resolve modulation via the signalValues calculated by the SignalDispatcher
    const edges = layer.graph?.edges || [];
    let foundEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === paramId);

    // Special Case: Linked Scales for Transform2D
    if (paramId === 'scaleY' && !foundEdge) {
      const isLinked = layer.linkedScales?.[nodeId] ?? true;
      const effect = layer.effects.find(e => e.id === nodeId);
      if (effect?.type === 'Transform2D' && isLinked) {
        foundEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'scaleX');
      }
    }
    // Special Case: Linked Scales for WaterfallSpectrogram
    if (paramId === 'scale_y_cv' && !foundEdge) {
      const effect = layer.effects.find(e => e.id === nodeId) as any;
      const isLinked = effect?.linkScale ?? (layer.linkedScales?.[nodeId] ?? true);
      if (effect?.type === 'WaterfallSpectrogram' && isLinked) {
        foundEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'scale_x_cv');
      }
    }

    if (foundEdge) {
      // Look up the pre-calculated signal value from the dispatcher (bypasses store commit interval)
      const inputSignalKey = `${nodeId}.${foundEdge.toPort}`;
      const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
      const modVal = latestSignals[inputSignalKey] ?? 0;
      finalValue += modVal;
    }

    return finalValue;
  }

  private sortNodes(layer: LayerState): string[] {
    const nodes = [
      ...(layer.source.type !== 'None' ? ['source'] : []),
      ...layer.effects.map(e => e.id as string),
      ...Object.keys(layer.modulators || {}),
      '__output__'
    ];
    const edges = layer.graph?.edges || [];
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (id: string) => {
      if (temp.has(id)) return; // Cycle
      if (visited.has(id)) return;
      temp.add(id);

      edges.filter(e => e.toNodeId === id).forEach(e => visit(e.fromNodeId));

      temp.delete(id);
      visited.add(id);
      sorted.push(id);
    };

    nodes.forEach(id => visit(id));
    return sorted;
  }

  private getTextureForNode(nodeId: string, portId?: string): GPUTexture | null {
    const key = portId && portId !== 'video_out' && portId !== 'video_out_0' ? `${nodeId}.${portId}` : nodeId;
    return this.nodeTextures.get(key) || null;
  }

  private getConnectedInputTexture(layer: LayerState, nodeId: string, portId: string): GPUTexture | null {
    const edge = (layer.graph?.edges || []).find(e => e.toNodeId === nodeId && e.toPort === portId);
    if (edge) {
      return this.getTextureForNode(edge.fromNodeId, edge.fromPort);
    }
    return null;
  }

  private ensureTexture(nodeId: string, portId?: string): GPUTexture {
    const key = portId && portId !== 'video_out' && portId !== 'video_out_0' ? `${nodeId}.${portId}` : nodeId;
    if (!this.nodeTextures.has(key)) {
      this.nodeTextures.set(key, this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
      }));
    }
    return this.nodeTextures.get(key)!;
  }

  private getUniformBuffer(key: string, size: number): GPUBuffer {
    let buf = this.uniformBuffers.get(key);
    if (!buf || buf.size < size) {
      if (buf) buf.destroy();
      buf = this.device.createBuffer({
        size: Math.max(size, 16), // Min 16 bytes for WebGPU alignment
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.uniformBuffers.set(key, buf);
    }
    return buf;
  }

  private renderLoop = () => {
    if (!this.isRunning) return;
    this.render();
    const sched = (this.animationHost && !this.animationHost.closed) ? this.animationHost : window;
    this.animationFrameId = sched.requestAnimationFrame(this.renderLoop);
  }

  private frameCount = 0;
  private shLiveStates = new Map<string, boolean>();
  private patternMirrorStates = new Map<string, { x: boolean, y: boolean }>();
  private lastTriggerVals = new Map<string, number>();

  private accumulatedTimeSec = 0;
  private lastRenderRealTime = performance.now();
  private lastResetSignal = 0;

  private render() {
    const state = useEngineStore.getState();
    const commandEncoder = this.device.createCommandEncoder();

    const now = performance.now();
    const deltaSec = (now - this.lastRenderRealTime) / 1000.0;
    this.lastRenderRealTime = now;

    // Handle Reset
    this.mediaManager.handleReset(state.globalResetSignal, state.layers);
    if (state.globalResetSignal !== this.lastResetSignal) {
      this.lastResetSignal = state.globalResetSignal;
      this.accumulatedTimeSec = 0;
    }

    if (!state.isGlobalPaused) {
      this.accumulatedTimeSec += deltaSec;
    }
    this.mediaManager.handlePause(state.isGlobalPaused);

    const timeSec = this.accumulatedTimeSec;
    this.frameCount++;

    // --- SIGNAL ENGINE SYNC ---
    SignalDispatcher.getInstance().execute();

    const orderedLayers = [...(state.layerOrder.length > 0 ? state.layerOrder : Object.keys(state.layers))]
      .reverse()
      .map(id => state.layers[id])
      .filter(layer => layer && !layer.muted);

    // --- RENDER & LOGIC PASS ---
    orderedLayers.forEach(layer => {
      this.simulationPipeline.update(
        layer,
        timeSec,
        this.canvas.width,
        this.canvas.height,
        this.getEffectiveParam.bind(this)
      );
    });

    // Check for canvas resize
    if (this.masterFBO && (this.masterFBO.width !== this.canvas.width || this.masterFBO.height !== this.canvas.height)) {
      this.setupRenderTargets();
    }

    const masterPass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: this.masterFBO.createView(), clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    masterPass.end();

    // Render CanvasBackground backdrop behind all layers if present
    for (const layer of orderedLayers) {
      const bgEffect = layer.effects.find(e => e.type === 'CanvasBackground') as CanvasBackgroundEffect | undefined;
      if (bgEffect) {
        this.renderCanvasBackground(layer, bgEffect.id, bgEffect, this.masterFBO, timeSec, commandEncoder);
        break;
      }
    }

    // Cleanup video/audio for nodes (layers or effects) that no longer exist
    const activeNodeIds = new Set<string>();
    Object.entries(state.layers).forEach(([lid, layer]) => {
      activeNodeIds.add(lid);
      layer.effects.forEach(ef => { if (ef.id) activeNodeIds.add(ef.id); });
    });


    this.mediaManager.cleanupInactive(activeNodeIds, state.layers);

    const pendingReadbacks: { buf: GPUBuffer; key: string }[] = [];

    orderedLayers.forEach(layer => {
      const sortedNodeIds = this.sortNodes(layer);

      sortedNodeIds.forEach(nodeId => {
        if (nodeId === '__output__') return;

        if (nodeId === 'source') {
          const target = this.ensureTexture('source');
          const pass = commandEncoder.beginRenderPass({
            colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
          });

          if (layer.source.type === 'ShapeGenerator') {
            const src = layer.source as ShapeGeneratorSource;
            const uniformBuffer = this.getUniformBuffer(`${layer.id}.source.uniforms`, 80);
            const buf = new ArrayBuffer(80);

            const shapeTypeMap: Record<string, number> = { rectangle: 0, ellipse: 1, polygon: 2 };
            const u32 = new Uint32Array(buf);
            u32[0] = shapeTypeMap[src.shapeType] || 0;
            u32[1] = src.strokeMode === 'hollow' ? 1 : 0;

            const f32 = new Float32Array(buf);
            f32[2] = src.strokeThreshold ?? 0.1;
            f32[3] = Math.max(0, Math.min(1, this.getEffectiveParam(layer, 'source', 'morph', src.morph ?? 0, timeSec)));

            const fillR = Math.max(0, Math.min(1, this.getEffectiveParam(layer, 'source', 'fill_r', src.fillColor[0], timeSec)));
            const fillG = Math.max(0, Math.min(1, this.getEffectiveParam(layer, 'source', 'fill_g', src.fillColor[1], timeSec)));
            const fillB = Math.max(0, Math.min(1, this.getEffectiveParam(layer, 'source', 'fill_b', src.fillColor[2], timeSec)));
            const fillA = Math.max(0, Math.min(1, this.getEffectiveParam(layer, 'source', 'fill_a', src.fillColor[3], timeSec)));
            f32.set([fillR, fillG, fillB, fillA], 4); // index 4..7

            f32[8] = this.getEffectiveParam(layer, 'source', 'edgeSoftness', src.edgeSoftness, timeSec);

            const rawSidesSig = this.getEffectiveParam(layer, 'source', 'sides', 0, timeSec);
            const mappedSidesSig = Math.sign(rawSidesSig) * Math.pow(Math.abs(rawSidesSig), 2) * 29;
            f32[9] = Math.max(3, (src.sides ?? 3) + mappedSidesSig);

            f32[10] = this.getEffectiveParam(layer, 'source', 'roundness', src.roundness ?? 0, timeSec);
            f32[11] = this.getEffectiveParam(layer, 'source', 'convexity', src.convexity ?? 0, timeSec);

            const rotModVal = this.getEffectiveParam(layer, 'source', 'rotation', 0, timeSec);
            f32[12] = (src.rotation ?? 0) + rotModVal * 360.0;

            f32[13] = this.getEffectiveParam(layer, 'source', 'strokeWidth', src.strokeWidth ?? 0, timeSec);
            f32[14] = this.canvas.width / this.canvas.height;
            f32[15] = this.getEffectiveParam(layer, 'source', 'scale', src.scale ?? 1, timeSec);

            f32[16] = this.getEffectiveParam(layer, 'source', 'x', src.x ?? 0, timeSec);
            f32[17] = this.getEffectiveParam(layer, 'source', 'y', src.y ?? 0, timeSec);

            this.device.queue.writeBuffer(uniformBuffer, 0, buf);
            const bindGroup = this.device.createBindGroup({ layout: this.shapePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }] });
            pass.setPipeline(this.shapePipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
          } else if (layer.source.type === 'NoiseSource') {
            pass.end(); // We close the generic pass and let renderNoiseSource handle its own pass
            this.renderNoiseSource(layer, 'source', target, timeSec, commandEncoder);
            return; // We skip the rest of the source block
          } else if (layer.source.type === 'ColorNoise') {
            pass.end();
            this.renderColorNoise(layer, 'source', target, timeSec, commandEncoder);
            return;
          } else if (layer.source.type === 'TextCue') {
            pass.end();
            this.renderTextCueSource(layer, 'source', target, commandEncoder);
            return;
          } else if (layer.source.type === 'ImageCue') {
            pass.end();
            this.renderImageCueSource(layer, 'source', target, timeSec, commandEncoder);
            return;
          } else {
            const media = this.manageMediaSource(layer.id, { ...layer.source, _layerAudioMuted: layer.audioMuted });
            if (media) {
              const width = (media as any).videoWidth || (media as any).width || 0;
              const height = (media as any).videoHeight || (media as any).height || 0;
              if (width > 0 && height > 0) {
                const uniformBuffer = this.getUniformBuffer(`${layer.id}.source.media_uniforms`, 16);
                const fitMap: Record<string, number> = { cover: 0, contain: 1, fill: 2 };
                const isMirrored = Boolean((layer.source as any).mirror);
                const f32 = new Float32Array([fitMap[(layer.source as any).objectFit] ?? 0, width / height, this.canvas.width / this.canvas.height, isMirrored ? 1 : 0]);
                this.device.queue.writeBuffer(uniformBuffer, 0, f32);

                if (media instanceof HTMLVideoElement && media.readyState >= 2) {
                  try {
                    const videoTex = this.device.importExternalTexture({ source: media });
                    const bindGroup = this.device.createBindGroup({ layout: this.videoPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: videoTex }, { binding: 2, resource: this.sampler }] });
                    pass.setPipeline(this.videoPipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
                  } catch (e) { }
                } else if (!(media instanceof HTMLVideoElement)) {
                  let mediaTex = this.mediaTextures[layer.id];
                  if (!mediaTex || mediaTex.width !== width || mediaTex.height !== height) {
                    if (mediaTex) mediaTex.destroy();
                    mediaTex = this.device.createTexture({ size: [width, height, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
                    this.mediaTextures[layer.id] = mediaTex;
                  }
                  this.device.queue.copyExternalImageToTexture({ source: media as any }, { texture: mediaTex }, [width, height]);
                  const bindGroup = this.device.createBindGroup({ layout: this.mediaPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: mediaTex.createView() }, { binding: 2, resource: this.sampler }] });
                  pass.setPipeline(this.mediaPipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
                }
              }
            }
          }
          pass.end();
        } else {
          const effect = layer.effects.find(e => e.id === nodeId);
          if (!effect) return;

          // Category A: Generators (Sources or Visualizers that don't REQUIRE an input texture)
          if (['ShapeGenerator', 'VideoFile', 'VideoURL', 'WebcamCapture', 'NoiseSource', 'ColorNoise', 'ImageCue', 'TextCue', 'TextMaker', 'SpectralSplitter', 'Oscilloscope', 'WaterfallSpectrogram', 'SpokenWordVisualizer', 'ParticleCloud', 'GrassField', 'Arabesque'].includes(effect.type)) {
            const genTarget = this.ensureTexture(nodeId, 'video_out');
            if (effect.type === 'TextCue') {
              this.renderTextCueSource(layer, nodeId, genTarget, commandEncoder);
              return;
            } else if (effect.type === 'TextMaker') {
              this.renderTextMaker(layer, nodeId, effect as TextMakerEffect, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'ImageCue') {
              this.renderImageCueSource(layer, nodeId, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'ShapeGenerator') {
              this.renderShapeSource(layer, nodeId, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'ParticleCloud') {
              this.renderParticleCloud(layer, nodeId, effect as ParticleCloudEffect, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'GrassField') {
              this.renderGrassField(layer, nodeId, effect as GrassFieldEffect, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'Arabesque') {
              this.renderArabesque(layer, nodeId, effect as ArabesqueEffect, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'SpokenWordVisualizer') {
              this.renderSpokenWordVisualizer(layer, nodeId, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'NoiseSource') {
              this.renderNoiseSource(layer, nodeId, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'ColorNoise') {
              this.renderColorNoise(layer, nodeId, genTarget, timeSec, commandEncoder);
              return;
            } else if (effect.type === 'SpectralSplitter' || effect.type === 'Oscilloscope' || effect.type === 'WaterfallSpectrogram') {
              // Fall through to the specialized render blocks below
            } else {
              this.renderVideoEffect(layer, nodeId, effect as any, genTarget, commandEncoder);
              return;
            }
          }

          const incomingEdges = layer.graph?.edges.filter(e => e.toNodeId === nodeId && (e.signalType === 'video' || e.toPort === 'sig_in')) || [];
          const primaryEdge = incomingEdges.find(e => e.toPort === 'video_in' || e.toPort === 'sig_in') 
            || incomingEdges.find(e => e.toPort !== 'map_in' && e.toPort !== 'uv_distort_in') 
            || incomingEdges[0];
          let inputTex = primaryEdge ? this.getTextureForNode(primaryEdge.fromNodeId, primaryEdge.fromPort) : this.nodeTextures.get('__dummy__');

          // Fallback to dummy if still null for any reason
          if (!inputTex) inputTex = this.nodeTextures.get('__dummy__')!;

          // Only skip if we are NOT an audio visualizer AND we have no valid input (redundant now but safe)
          if (!inputTex && effect.type !== 'SpectralSplitter' && effect.type !== 'Oscilloscope' && effect.type !== 'WaterfallSpectrogram') return;

          const tex = inputTex!; // Local non-null reference for TS safety

          const targetPort = effect.type === 'TriggeredGate' ? 'sig_out' : 'video_out';
          const target = this.ensureTexture(nodeId, targetPort);
          let pipeline: GPURenderPipeline | null = null;
          let entries: GPUBindGroupEntry[] = [];

          if (effect.type === 'ColorRGB') {
            pipeline = this.colorRGBPipeline;
            const ef = effect as ColorRGBEffect;

            const hasV = incomingEdges.some(e => e.toPort === 'video_in');
            const hasR = incomingEdges.some(e => e.toPort === 'r_in');
            const hasG = incomingEdges.some(e => e.toPort === 'g_in');
            const hasB = incomingEdges.some(e => e.toPort === 'b_in');
            const hasAnyInput = hasV || hasR || hasG || hasB;

            const mapVal = (v: number, mode: string) => hasAnyInput ? (mode === 'mult' ? v * 2.0 : (v - 0.5) * 2.0) : v;

            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 64);
            const buf = new ArrayBuffer(64);
            const f32 = new Float32Array(buf);
            const u32 = new Uint32Array(buf);

            f32[0] = this.getEffectiveParam(layer, ef.id, 'r_cv', mapVal(ef.r, ef.rMode), timeSec);
            f32[1] = this.getEffectiveParam(layer, ef.id, 'g_cv', mapVal(ef.g, ef.gMode), timeSec);
            f32[2] = this.getEffectiveParam(layer, ef.id, 'b_cv', mapVal(ef.b, ef.bMode), timeSec);

            u32[3] = hasV ? 1 : 0;
            u32[4] = hasR ? 1 : 0;
            u32[5] = hasG ? 1 : 0;
            u32[6] = hasB ? 1 : 0;

            u32[7] = ef.rMode === 'mult' ? 1 : 0;
            u32[8] = ef.gMode === 'mult' ? 1 : 0;
            u32[9] = ef.bMode === 'mult' ? 1 : 0;

            u32[10] = ef.rInputMode === 'luma' ? 1 : 0;
            u32[11] = ef.gInputMode === 'luma' ? 1 : 0;
            u32[12] = ef.bInputMode === 'luma' ? 1 : 0;

            this.device.queue.writeBuffer(uniformBuffer, 0, buf);

            const rIn = this.getConnectedInputTexture(layer, nodeId, 'r_in')?.createView() ?? inputTex.createView();
            const gIn = this.getConnectedInputTexture(layer, nodeId, 'g_in')?.createView() ?? inputTex.createView();
            const bIn = this.getConnectedInputTexture(layer, nodeId, 'b_in')?.createView() ?? inputTex.createView();

            entries = [
              { binding: 0, resource: { buffer: uniformBuffer } },
              { binding: 1, resource: tex.createView() },
              { binding: 2, resource: this.sampler },
              { binding: 3, resource: rIn },
              { binding: 4, resource: gIn },
              { binding: 5, resource: bIn },
            ];

            const rTex = this.ensureTexture(nodeId, 'r_out');
            const gTex = this.ensureTexture(nodeId, 'g_out');
            const bTex = this.ensureTexture(nodeId, 'b_out');

            const pass = commandEncoder.beginRenderPass({
              colorAttachments: [
                { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                { view: rTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                { view: gTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                { view: bTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
              ]
            });
            const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
            const bg = this.device.createBindGroup({ layout, entries });
            pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
          } else if (effect.type === 'Oscilloscope') {
            pipeline = this.oscilloscopePipeline;
            const ef = effect as OscilloscopeEffect;

            // 1. Find connected bus (same logic as ModuleNode)
            const edge = layer?.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
            let busId = 'master';
            if (edge) {
              const sourceEffect = layer?.effects.find(e => e.id === edge.fromNodeId);
              if (sourceEffect?.type === 'AudioSource') {
                busId = (sourceEffect as any).busId || 'master';
              } else if (edge.fromNodeId === 'source' || sourceEffect?.type === 'VideoFile' || sourceEffect?.type === 'VideoURL' || sourceEffect?.type === 'AudioFile' || sourceEffect?.type === 'AudioInput' || sourceEffect?.type === 'SystemAudio' || sourceEffect?.type === 'AudioTransformer' || sourceEffect?.type === 'AudioToCV') {
                const baseId = edge.fromNodeId === 'source' ? layer.id : edge.fromNodeId;
                busId = (edge.fromPort === 'ch1_out' || edge.fromPort === 'ch2_out') ? `${baseId}__${edge.fromPort}` : baseId;
              }
            }

            const busData = AudioEngine.getInstance().getBusData(busId);
            const waveform = busData ? busData.waveform : new Float32Array(1024);

            // 2. Upload waveform to storage buffer
            const storageBuffer = this.getStorageBuffer(`${nodeId}.waveform`, waveform.byteLength);
            this.device.queue.writeBuffer(storageBuffer, 0, waveform as any);

            // 3. Upload uniforms & palette
            const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 256);
            const f32 = new Float32Array(64);
            f32[0] = this.getEffectiveParam(layer, ef.id, 'triggerLevel', ef.triggerLevel, timeSec);
            f32[1] = this.getEffectiveParam(layer, ef.id, 'timeScale', ef.timeScale, timeSec);
            f32[2] = this.canvas.width / this.canvas.height;
            f32[3] = ef.isFrozen ? 1.0 : 0.0;
            f32[4] = (ef.showScaffold ?? false) ? 1.0 : 0.0;
            f32[5] = ef.colorMode === 'span' ? 1.0 : (ef.colorMode === 'frequency' ? 2.0 : 0.0);
            f32[6] = this.getEffectiveParam(layer, ef.id, 'gain_cv', ef.gain ?? 2.0, timeSec);
            f32[7] = pal ? 1.0 : 0.0;
            f32[8] = pal ? pal.count : 0.0;
            f32[9] = pal ? pal.interpolation : 0.0;
            f32[10] = 0;
            f32[11] = 0;

            const tc = ef.traceColor || [0.0, 1.0, 0.25, 1.0];
            f32[12] = tc[0];
            f32[13] = tc[1];
            f32[14] = tc[2];
            f32[15] = tc[3] ?? 1.0;

            if (pal) {
              for (let i = 0; i < 8; i++) {
                f32[16 + i * 4 + 0] = pal.colors[i][0];
                f32[16 + i * 4 + 1] = pal.colors[i][1];
                f32[16 + i * 4 + 2] = pal.colors[i][2];
                f32[16 + i * 4 + 3] = pal.colors[i][3];
              }
              for (let i = 0; i < 8; i++) {
                f32[48 + i] = pal.positions[i];
              }
            }

            this.device.queue.writeBuffer(uniformBuffer, 0, f32);

            entries = [
              { binding: 0, resource: { buffer: uniformBuffer } },
              { binding: 1, resource: { buffer: storageBuffer } }
            ];

            const pass = commandEncoder.beginRenderPass({
              colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
            });
            const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
            const bg = this.device.createBindGroup({ layout, entries });
            pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
            pipeline = null; // Prevent redundant common pass
          } else if (effect.type === 'SpectralSplitter') {
            pipeline = this.spectralSplitterPipeline;
            const ef = effect as SpectralSplitterEffect;
            const edge = layer?.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
            let busId = ef.busId || 'master';

            if (edge) {
              const sourceEffect = layer?.effects.find(e => e.id === edge.fromNodeId);
              if (sourceEffect?.type === 'AudioSource') busId = (sourceEffect as any).busId;
              else if (edge.fromNodeId === 'source' || sourceEffect?.type === 'VideoFile' || sourceEffect?.type === 'VideoURL' || sourceEffect?.type === 'AudioFile' || sourceEffect?.type === 'AudioInput' || sourceEffect?.type === 'SystemAudio' || sourceEffect?.type === 'AudioTransformer' || sourceEffect?.type === 'AudioToCV') {
                const baseId = edge.fromNodeId === 'source' ? layer.id : edge.fromNodeId;
                busId = (edge.fromPort === 'ch1_out' || edge.fromPort === 'ch2_out') ? `${baseId}__${edge.fromPort}` : baseId;
              }
            }

            let busData = AudioEngine.getInstance().getBusData(busId);
            // Fallback to manual bus selection if patched bus is not found
            if (!busData) {
              busData = AudioEngine.getInstance().getBusData(ef.busId || 'master');
            }

            const fft = busData ? busData.fft : new Float32Array(512);

            const storageBuffer = this.getStorageBuffer(`${nodeId}.fft`, fft.byteLength);
            this.device.queue.writeBuffer(storageBuffer, 0, fft as any);

            const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 256);
            const f32 = new Float32Array(64);
            f32[0] = this.getEffectiveParam(layer, ef.id, 'sensitivity', ef.sensitivity, timeSec);
            f32[1] = this.getEffectiveParam(layer, ef.id, 'smoothing', ef.smoothing, timeSec);
            f32[2] = this.canvas.width / this.canvas.height;
            f32[3] = timeSec;

            // bands_1 (vec4)
            f32[4] = busData?.bands?.low ?? 0;
            f32[5] = busData?.bands?.lowMid ?? 0;
            f32[6] = busData?.bands?.midGranular ?? 0;
            f32[7] = busData?.bands?.highMid ?? 0;

            // bands_2 (vec4)
            f32[8] = busData?.bands?.highGranular ?? 0;
            f32[9] = 0;
            f32[10] = 0;
            f32[11] = 0;

            // flags & settings
            f32[12] = (ef.showScaffold ?? false) ? 1.0 : 0.0;
            f32[13] = ef.colorMode === 'amplitude' ? 1.0 : 0.0;
            f32[14] = this.getEffectiveParam(layer, ef.id, 'gain_cv', ef.gain ?? 2.0, timeSec);
            f32[15] = pal ? 1.0 : 0.0;

            f32[16] = pal ? pal.count : 0.0;
            f32[17] = pal ? pal.interpolation : 0.0;
            f32[18] = 0;
            f32[19] = 0;

            const bc = ef.barColor || [0.1, 0.7, 0.8, 1.0];
            f32[20] = bc[0];
            f32[21] = bc[1];
            f32[22] = bc[2];
            f32[23] = bc[3] ?? 1.0;

            if (pal) {
              for (let i = 0; i < 8; i++) {
                f32[24 + i * 4 + 0] = pal.colors[i][0];
                f32[24 + i * 4 + 1] = pal.colors[i][1];
                f32[24 + i * 4 + 2] = pal.colors[i][2];
                f32[24 + i * 4 + 3] = pal.colors[i][3];
              }
              for (let i = 0; i < 8; i++) {
                f32[56 + i] = pal.positions[i];
              }
            }

            this.device.queue.writeBuffer(uniformBuffer, 0, f32);

            entries = [
              { binding: 0, resource: { buffer: uniformBuffer } },
              { binding: 1, resource: { buffer: storageBuffer } }
            ];

            const pass = commandEncoder.beginRenderPass({
              colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
            });
            const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
            const bg = this.device.createBindGroup({ layout, entries });
            pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
            pipeline = null;
          } else if (effect.type === 'WaterfallSpectrogram') {
            pipeline = this.waterfallPipeline;
            const ef = effect as WaterfallSpectrogramEffect;
            const edge = layer?.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
            let busId = ef.busId || 'master';

            if (edge) {
              const sourceEffect = layer?.effects.find(e => e.id === edge.fromNodeId);
              if (sourceEffect?.type === 'AudioSource') busId = (sourceEffect as any).busId;
              else if (edge.fromNodeId === 'source' || sourceEffect?.type === 'VideoFile' || sourceEffect?.type === 'VideoURL' || sourceEffect?.type === 'AudioFile' || sourceEffect?.type === 'AudioInput' || sourceEffect?.type === 'SystemAudio' || sourceEffect?.type === 'AudioTransformer' || sourceEffect?.type === 'AudioToCV') {
                const baseId = edge.fromNodeId === 'source' ? layer.id : edge.fromNodeId;
                busId = (edge.fromPort === 'ch1_out' || edge.fromPort === 'ch2_out') ? `${baseId}__${edge.fromPort}` : baseId;
              }
            }

            let busData = AudioEngine.getInstance().getBusData(busId);
            if (!busData) {
              busData = AudioEngine.getInstance().getBusData(ef.busId || 'master');
            }

            const speed = Math.max(0.05, this.getEffectiveParam(layer, ef.id, 'speed_cv', ef.speed ?? 1.0, timeSec));

            // Ensure history texture (256x128 rgba8unorm ring buffer)
            let hist = this.waterfallHistory.get(nodeId);
            if (!hist) {
              const tex = this.device.createTexture({
                size: { width: 256, height: 128 },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
              });
              hist = { texture: tex, head: 0, stepAccumulator: 0 };
              this.waterfallHistory.set(nodeId, hist);
            }

            hist.stepAccumulator = (hist.stepAccumulator ?? 0) + speed;
            const steps = Math.min(8, Math.floor(hist.stepAccumulator));
            hist.stepAccumulator -= steps;

            if (steps > 0) {
              // Write latest FFT slice to ring buffer
              const fft = busData ? busData.fft : null;
              const rowData = new Uint8Array(256 * 4);
              if (fft && fft.length > 0) {
                const sampleRate = AudioEngine.getInstance().getSampleRate();
                const nyquist = sampleRate / 2;
                const minFreq = 30; // 30 Hz (sub bass)
                const maxFreq = 16000; // 16 kHz (sparkle / highs)
                for (let i = 0; i < 256; i++) {
                  const t = i / 255;
                  const targetFreq = minFreq * Math.pow(maxFreq / minFreq, t);
                  const fftIdx = Math.max(0, Math.min(fft.length - 1, Math.floor((targetFreq / nyquist) * fft.length)));
                  const db = fft[fftIdx] ?? -100;
                  const norm = Math.max(0, Math.min(1, (db + 75) / 75));
                  const b = Math.round(norm * 255);
                  rowData[i * 4 + 0] = b;
                  rowData[i * 4 + 1] = b;
                  rowData[i * 4 + 2] = b;
                  rowData[i * 4 + 3] = 255;
                }
              }
              for (let s = 0; s < steps; s++) {
                this.device.queue.writeTexture(
                  { texture: hist.texture, origin: { x: 0, y: hist.head, z: 0 } },
                  rowData,
                  { bytesPerRow: 256 * 4 },
                  { width: 256, height: 1 }
                );
                hist.head = (hist.head + 1) % 128;
              }
            }

            const currentHeadNorm = (hist.head + hist.stepAccumulator) / 128.0;

            const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 256);
            const f32 = new Float32Array(64);
            f32[0] = this.getEffectiveParam(layer, ef.id, 'tilt_cv', ef.tilt ?? 0.5, timeSec);
            f32[1] = this.getEffectiveParam(layer, ef.id, 'gain_cv', ef.gain ?? 2.0, timeSec);
            f32[2] = speed;
            f32[3] = currentHeadNorm;

            // colorMode: 0 = topographic, 1 = decay, 2 = transient, 3 = frequency
            const cmMap = { topographic: 0, decay: 1, transient: 2, frequency: 3 };
            f32[4] = cmMap[ef.colorMode || 'topographic'] ?? 0;
            f32[5] = ef.flowDirection === 'back-to-front' ? 1.0 : 0.0;
            f32[6] = ef.renderStyle === 'lines' ? 1.0 : 0.0;
            f32[7] = (ef.showScaffold ?? false) ? 1.0 : 0.0;

            f32[8] = this.canvas.width / this.canvas.height;
            f32[9] = timeSec;
            f32[10] = pal ? 1.0 : 0.0;
            f32[11] = pal ? pal.count : 0.0;

            f32[12] = pal ? pal.interpolation : 0.0;
            f32[13] = Math.max(0.05, this.getEffectiveParam(layer, ef.id, 'scale_x_cv', ef.scaleX ?? 1.0, timeSec));
            f32[14] = Math.max(0.05, this.getEffectiveParam(layer, ef.id, 'scale_y_cv', ef.scaleY ?? 1.0, timeSec));
            f32[15] = 0;

            const lc = ef.lineColor || [0.0, 1.0, 0.4, 1.0];
            f32[16] = lc[0];
            f32[17] = lc[1];
            f32[18] = lc[2];
            f32[19] = lc[3] ?? 1.0;

            if (pal) {
              for (let i = 0; i < 8; i++) {
                f32[20 + i * 4 + 0] = pal.colors[i][0];
                f32[20 + i * 4 + 1] = pal.colors[i][1];
                f32[20 + i * 4 + 2] = pal.colors[i][2];
                f32[20 + i * 4 + 3] = pal.colors[i][3];
              }
              for (let i = 0; i < 8; i++) {
                f32[52 + i] = pal.positions[i];
              }
            }

            this.device.queue.writeBuffer(uniformBuffer, 0, f32);

            entries = [
              { binding: 0, resource: { buffer: uniformBuffer } },
              { binding: 1, resource: hist.texture.createView() },
              { binding: 2, resource: this.repeatSampler }
            ];

            const pass = commandEncoder.beginRenderPass({
              colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
            });
            const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
            const bg = this.device.createBindGroup({ layout, entries });
            pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
            pipeline = null;
          } else if (effect.type === 'LumaSplitter') {
            pipeline = this.lumaSplitPipeline;
            const ef = effect as LumaSplitterEffect;
            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);
            this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
              this.getEffectiveParam(layer, ef.id, 'threshold1', ef.threshold1, timeSec),
              this.getEffectiveParam(layer, ef.id, 'threshold2', ef.threshold2, timeSec),
              this.getEffectiveParam(layer, ef.id, 'softness', ef.softness, timeSec),
              0
            ]));
            entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: this.sampler }];

            const lowTex = this.ensureTexture(nodeId, 'low_out'); const midTex = this.ensureTexture(nodeId, 'mid_out'); const highTex = this.ensureTexture(nodeId, 'high_out');
            const pass = commandEncoder.beginRenderPass({
              colorAttachments: [
                { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                { view: lowTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                { view: midTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                { view: highTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
              ]
            });
            const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
            const bg = this.device.createBindGroup({ layout, entries });
                        pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
            pipeline = null;
          } else if (effect.type === 'LumaBands') {
              pipeline = this.lumaBandsPipeline;
              const ef = effect as LumaBandsEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 208);
              const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');

              const f32 = new Float32Array(52);
              const bandCount = Math.max(2, Math.min(8, ef.bands ? ef.bands.length : 2));
              const smoothing = Math.max(0, Math.min(1, this.getEffectiveParam(layer, ef.id, 'smooth_cv', ef.spatialSmoothing ?? 0.35, timeSec)));
              const feather = Math.max(0, Math.min(1, ef.feather ?? 0.0));
              const threshCV = this.getEffectiveParam(layer, ef.id, 'threshold_cv', 0, timeSec);
              const aspect = target.width / Math.max(1, target.height);

              // params0: [bandCount, spatialSmoothing, feather, thresholdCV]
              f32[0] = bandCount;
              f32[1] = smoothing;
              f32[2] = feather;
              f32[3] = threshCV;

              // params1: [outlineEnabled, outlineWidth, outlineOpacity, aspect]
              const baseWidth = ef.outlineWidth ?? 2.0;
              const outlineWidth = Math.max(0.0, Math.min(8.0, this.getEffectiveParam(layer, ef.id, 'width_cv', baseWidth, timeSec)));
              f32[4] = ef.outlineEnabled !== false ? 1.0 : 0.0;
              f32[5] = outlineWidth;
              f32[6] = ef.outlineOpacity ?? 1.0;
              f32[7] = aspect;

              // outlineColor: rgba
              const outCol = ef.outlineColor ?? [0, 0, 0, 1];
              f32[8] = outCol[0];
              f32[9] = outCol[1];
              f32[10] = outCol[2];
              f32[11] = outCol[3] ?? 1.0;

              // thresholds0 (bands 0..3) & thresholds1 (bands 4..7)
              for (let i = 0; i < 8; i++) {
                let t = 1.0;
                if (ef.bands && i < ef.bands.length) {
                  t = (ef.bands[i].threshold ?? 255) / 255.0;
                }
                const offset = (i < 4) ? (12 + i) : (16 + (i - 4));
                f32[offset] = Math.max(0, Math.min(1, t));
              }

              // band colors 0..7
              for (let i = 0; i < 8; i++) {
                let c = DEFAULT_LUMA_PALETTE[i];
                if (pal && ef.usePaletteIn !== false && pal.colors.length > 0) {
                  const pc = pal.colors[i % pal.colors.length];
                  c = [pc[0], pc[1], pc[2], pc[3] ?? 1.0];
                } else if (ef.bands && i < ef.bands.length && ef.bands[i].color) {
                  c = ef.bands[i].color;
                }
                const base = 20 + i * 4;
                f32[base] = c[0];
                f32[base + 1] = c[1];
                f32[base + 2] = c[2];
                f32[base + 3] = c[3] ?? 1.0;
              }

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
            pipeline = null;
          } else if (effect.type === 'GlyphMap') {
              pipeline = this.glyphMapPipeline;
              const ef = effect as GlyphMapEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 384);

              // 1. Upstream bands detection (via video_in OR bands_in)
              let upstreamBandEffect: any = null;
              const videoInEdge = layer?.graph?.edges?.find(e => e.toNodeId === nodeId && e.toPort === 'video_in');
              if (videoInEdge) {
                const fe = layer.effects.find(e => e.id === videoInEdge.fromNodeId);
                if (fe && (fe.type === 'LumaBands' || fe.type === 'ChromaBands')) {
                  upstreamBandEffect = fe;
                }
              }
              const bandsEdge = layer?.graph?.edges?.find(e => e.toNodeId === nodeId && e.toPort === 'bands_in');
              if (bandsEdge) {
                const fe = layer.effects.find(e => e.id === bandsEdge.fromNodeId);
                if (fe) upstreamBandEffect = fe;
              }

              const hasBandsIn = !!upstreamBandEffect;
              let bandsInTex = this.blankTexture;
              if (upstreamBandEffect) {
                bandsInTex = this.nodeTextures.get(`${upstreamBandEffect.id}.matte_out`) || this.blankTexture;
              }

              // Connect to palette_in if wired
              const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');

              // 2. Text Source detection (TextCue via text_in or layer source)
              const textEdge = layer?.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'text_in');
              let textCueSrc: TextCueSource | null = null;
              if (textEdge) {
                if (textEdge.fromNodeId === 'source' && layer.source.type === 'TextCue') {
                  textCueSrc = layer.source as TextCueSource;
                } else {
                  const fe = layer.effects.find(e => e.id === textEdge.fromNodeId);
                  if (fe && fe.type === 'TextCue') textCueSrc = fe as unknown as TextCueSource;
                }
              } else if (layer.source.type === 'TextCue') {
                textCueSrc = layer.source as TextCueSource;
              }

              // Extract 8 layer strings:
              const layerStrings: string[] = [];
              const templatePack = GLYPH_TEMPLATE_PACKS[ef.templatePack ?? 'density'] || GLYPH_TEMPLATE_PACKS.density;

              for (let i = 0; i < 8; i++) {
                let s = '';
                // 1. Text Bank input (takes precedence when connected, unless user explicitly selected manual)
                if (textCueSrc && ef.sourceMode !== 'manual') {
                  const b = textCueSrc.banks?.[textCueSrc.activeBankIndex ?? 0];
                  s = b?.cards?.[i]?.text || '';
                }

                // 2. If no text bank string, check per-layer custom string override
                if (!s) {
                  const custom = ef.bands?.[i]?.glyphText;
                  if (custom !== undefined && custom !== null && custom.length > 0) {
                    s = custom;
                  } else {
                    // 3. Fall back to active template pack character
                    s = templatePack[i % templatePack.length] || ' ';
                  }
                }
                if (!s) s = ' ';
                layerStrings.push(s);
              }

              // 3. Style detection (TextMaker via style_in)
              const styleEdge = layer?.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'style_in');
              let textMakerSrc: TextMakerEffect | null = null;
              if (styleEdge) {
                const fe = layer.effects.find(e => e.id === styleEdge.fromNodeId);
                if (fe && fe.type === 'TextMaker') textMakerSrc = fe as TextMakerEffect;
              }

              const activeFont = textMakerSrc ? textMakerSrc.fontFamily : (ef.fontFamily || 'VT323');
              const activeWeight = ef.fontWeight || 'normal';
              const textRgba = textMakerSrc?.textColor ? `rgba(${Math.round(textMakerSrc.textColor[0]*255)},${Math.round(textMakerSrc.textColor[1]*255)},${Math.round(textMakerSrc.textColor[2]*255)},${textMakerSrc.textColor[3] ?? 1})` : undefined;
              const shadowRgba = textMakerSrc?.shadowColor ? `rgba(${Math.round(textMakerSrc.shadowColor[0]*255)},${Math.round(textMakerSrc.shadowColor[1]*255)},${Math.round(textMakerSrc.shadowColor[2]*255)},${textMakerSrc.shadowColor[3] ?? 1})` : undefined;
              const activeGlowColor = textRgba || ef.textGlowColor || '#00ff66';
              const activeGlowRadius = textMakerSrc ? (textMakerSrc.outlineEnabled ? 2 : 0) : (ef.textGlowRadius ?? 0);
              const activeShadowColor = shadowRgba || ef.textShadowColor || 'transparent';

              // 4. Font Atlas Texture
              const atlasObj = GlyphMapRenderer.getInstance().getOrCreateAtlas(
                activeFont,
                activeWeight,
                activeGlowColor,
                activeGlowRadius,
                activeShadowColor
              );

              if (!this.glyphMapAtlasTex || atlasObj.dirty) {
                if (this.glyphMapAtlasTex) this.glyphMapAtlasTex.destroy();
                this.glyphMapAtlasTex = this.device.createTexture({
                  size: [1024, 1024],
                  format: 'rgba8unorm',
                  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
                });
                this.device.queue.copyExternalImageToTexture(
                  { source: atlasObj.canvas },
                  { texture: this.glyphMapAtlasTex },
                  [1024, 1024]
                );
              }

              // 5. Grid Dimensions & Kinetic Scroll
              const baseCell = ef.cellSize ?? 16;
              const cellSize = Math.max(6, Math.min(64, this.getEffectiveParam(layer, ef.id, 'cell_cv', baseCell, timeSec)));
              const gridCols = Math.max(1, Math.floor(target.width / cellSize));
              const gridRows = Math.max(1, Math.floor(target.height / cellSize));

              let scrollX = 0;
              let scrollY = 0;
              if (ef.autoScroll) {
                const baseSpeed = ef.scrollSpeed ?? 1.0;
                const spd = Math.max(0.1, this.getEffectiveParam(layer, ef.id, 'scroll_cv', baseSpeed, timeSec));
                const dist = timeSec * spd * 8.0;
                if (ef.scrollDirection === 'left') scrollX = -dist;
                else if (ef.scrollDirection === 'right') scrollX = dist;
                else if (ef.scrollDirection === 'up') scrollY = -dist;
                else if (ef.scrollDirection === 'down') scrollY = dist;
              }

              // 6. Build and upload Grid Storage Buffer (memoized & cached)
              const { buffer: gridData, dirty: gridDirty } = GlyphMapRenderer.getInstance().getOrCreateLayerGrid(
                nodeId,
                layerStrings,
                ef.wrapMode ?? 'raw_char',
                gridCols,
                gridRows
              );
              const storageBufKey = `${nodeId}.grid_storage`;
              const storageBuf = this.getStorageBuffer(storageBufKey, gridData.byteLength);
              const currentGen = this.storageBufferGenerations.get(storageBufKey) || 0;
              const lastGen = this.glyphGridUploadedGenerations.get(nodeId);

              if (gridDirty || lastGen !== currentGen) {
                this.device.queue.writeBuffer(storageBuf, 0, gridData as any);
                this.glyphGridUploadedGenerations.set(nodeId, currentGen);
              }

              // 7. Uniforms Float32Array(96)
              const f32 = new Float32Array(96);
              const bandCount = upstreamBandEffect?.bands?.length ?? Math.max(2, Math.min(8, ef.bands ? ef.bands.length : 2));
              const mapModeVal = hasBandsIn ? 2.0 : (ef.mapMode === 'chroma' ? 1.0 : 0.0);
              const smoothing = Math.max(0, Math.min(1, ef.spatialSmoothing ?? 0.2));

              // params0: [bandCount, mapMode, spatialSmoothing, cellSize]
              f32[0] = bandCount;
              f32[1] = mapModeVal;
              f32[2] = smoothing;
              f32[3] = cellSize;

              // params1: [colorMode, bgMode, dimmedVideoOpacity, aspect]
              let colorModeVal = 0;
              if (ef.colorMode === 'source_video') colorModeVal = 1;
              else if (ef.colorMode === 'matrix_green') colorModeVal = 2;
              else if (ef.colorMode === 'amber_crt') colorModeVal = 3;
              else if (ef.colorMode === 'monochrome') colorModeVal = 4;
              else if (ef.colorMode === 'inherit_style') colorModeVal = 5;
              else if (ef.colorMode === 'invert_video') colorModeVal = 6;

              // bgMode: 0 = video (100% full superimposed), 1 = black, 2 = video_dimmed, 3 = transparent
              let bgModeVal = 0;
              if (ef.bgMode === 'black') bgModeVal = 1;
              else if (ef.bgMode === 'video_dimmed') bgModeVal = 2;
              else if (ef.bgMode === 'transparent') bgModeVal = 3;
              else if (ef.bgMode === 'video') bgModeVal = 0;

              f32[4] = colorModeVal;
              f32[5] = bgModeVal;
              f32[6] = ef.dimmedVideoOpacity ?? 0.2;
              f32[7] = target.width / Math.max(1, target.height);

              // params2: [chromaGate, chromaSensitivity, hueShift, unused]
              f32[8] = Math.max(0, Math.min(0.5, ef.chromaGate ?? 0.02));
              f32[9] = Math.max(0.1, Math.min(10.0, ef.chromaSensitivity ?? 1.5));
              f32[10] = (ef.hueShift ?? 0) / 360.0;
              f32[11] = 0;

              // params3: [gridCols, gridRows, scrollX, scrollY]
              f32[12] = gridCols;
              f32[13] = gridRows;
              f32[14] = scrollX;
              f32[15] = scrollY;

              // Outline settings (inherit from upstream band module if present)
              let outlineEnabled = ef.outlineEnabled === true;
              let outlineWidth = ef.outlineWidth ?? 2.0;
              let outlineOpacity = ef.outlineOpacity ?? 1.0;
              let outlineColor = ef.outlineColor || [0, 0, 0, 1];

              if (upstreamBandEffect) {
                outlineEnabled = upstreamBandEffect.outlineEnabled !== false;
                outlineWidth = upstreamBandEffect.outlineWidth ?? outlineWidth;
                outlineOpacity = upstreamBandEffect.outlineOpacity ?? outlineOpacity;
                outlineColor = upstreamBandEffect.outlineColor || outlineColor;
              }

              const baseWidth = outlineWidth;
              const widthMod = this.getEffectiveParam(layer, ef.id, 'width_cv', baseWidth, timeSec);
              outlineWidth = Math.max(0.0, Math.min(8.0, widthMod));

              // params4: [outlineEnabled, outlineWidth, outlineOpacity, timeSec]
              f32[16] = outlineEnabled ? 1.0 : 0.0;
              f32[17] = outlineWidth;
              f32[18] = outlineOpacity;
              f32[19] = timeSec;

              // outlineColor: RGBA (offset 20..23)
              f32[20] = outlineColor[0];
              f32[21] = outlineColor[1];
              f32[22] = outlineColor[2];
              f32[23] = outlineColor[3] ?? 1.0;

              // monochromeColor: RGBA (offset 24..27)
              let monoCol: [number, number, number, number] = [0.95, 0.95, 0.95, 1.0];
              if (ef.colorMode === 'inherit_style' && textMakerSrc?.textColor) {
                monoCol = [textMakerSrc.textColor[0], textMakerSrc.textColor[1], textMakerSrc.textColor[2], textMakerSrc.textColor[3] ?? 1.0];
              }
              f32[24] = monoCol[0]; f32[25] = monoCol[1]; f32[26] = monoCol[2]; f32[27] = monoCol[3];

              // thresholds0 (28..31) & thresholds1 (32..35)
              for (let i = 0; i < 8; i++) {
                let t = 1.0;
                if (ef.bands && i < ef.bands.length) {
                  const rawThresh = ef.bands[i].threshold ?? 255;
                  t = ef.mapMode === 'chroma' ? (rawThresh / 360.0) : (rawThresh / 255.0);
                }
                const offset = (i < 4) ? (28 + i) : (32 + (i - 4));
                f32[offset] = Math.max(0, Math.min(1, t));
              }

              // band colors 0..7 (offset 36..67)
              for (let i = 0; i < 8; i++) {
                let c = [0.2, 0.8, 0.4, 1.0];
                if (pal && ef.usePaletteIn !== false && pal.colors.length > 0) {
                  const pc = pal.colors[i % pal.colors.length];
                  c = [pc[0], pc[1], pc[2], pc[3] ?? 1.0];
                } else if (ef.bands && i < ef.bands.length && ef.bands[i].color) {
                  c = ef.bands[i].color;
                }
                const base = 36 + i * 4;
                f32[base] = c[0]; f32[base + 1] = c[1]; f32[base + 2] = c[2]; f32[base + 3] = c[3] ?? 1.0;
              }

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: bandsInTex.createView() },
                { binding: 3, resource: this.glyphMapAtlasTex.createView() },
                { binding: 4, resource: { buffer: storageBuf } },
                { binding: 5, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
              pipeline = null;
          } else if (effect.type === 'ChromaBands') {
              pipeline = this.chromaBandsPipeline;
              const ef = effect as ChromaBandsEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 256);
              const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');

              const f32 = new Float32Array(64);
              const bandCount = Math.max(2, Math.min(8, ef.bands ? ef.bands.length : 2));
              const smoothing = Math.max(0, Math.min(1, this.getEffectiveParam(layer, ef.id, 'smooth_cv', ef.spatialSmoothing ?? 0.35, timeSec)));
              const chromaGate = Math.max(0, Math.min(0.5, ef.chromaGate ?? 0.02));
              
              const manualHue = (ef.hueShift ?? 0) / 360.0;
              const hueMod = this.getEffectiveParam(layer, ef.id, 'hue_cv', 0, timeSec);
              const aspect = target.width / Math.max(1, target.height);

              // params0: [bandCount, spatialSmoothing, chromaGate, totalHueShift]
              f32[0] = bandCount;
              f32[1] = smoothing;
              f32[2] = chromaGate;
              f32[3] = manualHue + hueMod;

              // params1: [outlineEnabled, outlineWidth, outlineOpacity, aspect]
              const baseWidth = ef.outlineWidth ?? 2.0;
              const outlineWidth = Math.max(0.0, Math.min(8.0, this.getEffectiveParam(layer, ef.id, 'width_cv', baseWidth, timeSec)));
              f32[4] = ef.outlineEnabled !== false ? 1.0 : 0.0;
              f32[5] = outlineWidth;
              f32[6] = ef.outlineOpacity ?? 1.0;
              f32[7] = aspect;

              // params2: [chromaSensitivity, gateMode, unused, unused]
              const baseSens = ef.chromaSensitivity ?? 1.5;
              const sensMod = this.getEffectiveParam(layer, ef.id, 'sens_cv', 0, timeSec);
              f32[8] = Math.max(0.1, Math.min(10.0, baseSens + sensMod));
              f32[9] = ef.gateMode === 'neutral_color' ? 1.0 : 0.0;
              f32[10] = 0.0;
              f32[11] = 0.0;

              // outlineColor: rgba
              const outCol = ef.outlineColor ?? [0, 0, 0, 1];
              f32[12] = outCol[0];
              f32[13] = outCol[1];
              f32[14] = outCol[2];
              f32[15] = outCol[3] ?? 1.0;

              // thresholds0 (bands 0..3) & thresholds1 (bands 4..7) normalized to 0.0..1.0 (from 360 deg)
              for (let i = 0; i < 8; i++) {
                let t = 1.0;
                if (ef.bands && i < ef.bands.length) {
                  t = (ef.bands[i].threshold ?? 360) / 360.0;
                }
                const offset = (i < 4) ? (16 + i) : (20 + (i - 4));
                f32[offset] = Math.max(0, Math.min(1, t));
              }

              // band colors 0..7
              for (let i = 0; i < 8; i++) {
                let c = DEFAULT_CHROMA_PALETTE[i];
                if (pal && ef.usePaletteIn !== false && pal.colors.length > 0) {
                  const pc = pal.colors[i % pal.colors.length];
                  c = [pc[0], pc[1], pc[2], pc[3] ?? 1.0];
                } else if (ef.bands && i < ef.bands.length && ef.bands[i].color) {
                  c = ef.bands[i].color;
                }
                const base = 24 + i * 4;
                f32[base] = c[0];
                f32[base + 1] = c[1];
                f32[base + 2] = c[2];
                f32[base + 3] = c[3] ?? 1.0;
              }

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
              pipeline = null;
          } else if (effect.type === 'Outline') {
              pipeline = this.outlinePipeline;
              const ef = effect as OutlineEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 256);
              const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');

              const f32 = new Float32Array(64);

              let edgeModeVal = 0; // luma_bands
              if (ef.edgeMode === 'chroma_bands') edgeModeVal = 1;
              else if (ef.edgeMode === 'focus_peaking') edgeModeVal = 2;
              else if (ef.edgeMode === 'manga_dog') edgeModeVal = 3;
              else if (ef.edgeMode === 'analog_diff') edgeModeVal = 4;

              const bandCount = Math.max(2, Math.min(8, ef.bandCount ?? 4));
              const baseWidth = ef.lineWidth ?? 2.0;
              const lineWidth = Math.max(0.5, Math.min(16.0, this.getEffectiveParam(layer, ef.id, 'width_cv', baseWidth, timeSec)));
              const lineOpacity = Math.max(0, Math.min(1.0, ef.lineOpacity ?? 1.0));

              // params0: [edgeMode, bandCount, lineWidth, lineOpacity]
              f32[0] = edgeModeVal;
              f32[1] = bandCount;
              f32[2] = lineWidth;
              f32[3] = lineOpacity;

              let bgModeVal = 0; // over_video_ink
              if (ef.bgMode === 'over_video_neon') bgModeVal = 1;
              else if (ef.bgMode === 'lines_transparent') bgModeVal = 2;
              else if (ef.bgMode === 'lines_black') bgModeVal = 3;

              let colorModeVal = 0; // custom
              if (ef.colorMode === 'palette_in') colorModeVal = 1;
              else if (ef.colorMode === 'sample_video') colorModeVal = 2;

              const baseThresh = ef.threshold ?? 0.25;
              const threshold = Math.max(0.01, Math.min(1.0, this.getEffectiveParam(layer, ef.id, 'thresh_cv', baseThresh, timeSec)));
              const aspect = target.width / Math.max(1, target.height);

              // params1: [bgMode, colorMode, threshold, aspect]
              f32[4] = bgModeVal;
              f32[5] = colorModeVal;
              f32[6] = threshold;
              f32[7] = aspect;

              const smoothing = Math.max(0, Math.min(1.0, this.getEffectiveParam(layer, ef.id, 'smooth_cv', ef.spatialSmoothing ?? 0.2, timeSec)));
              const analogDirVal = ef.analogDirection === 'vertical' ? 1.0 : 0.0;

              // params2: [timeSec, spatialSmoothing, analogDirection, pulseActive]
              f32[8] = timeSec;
              f32[9] = smoothing;
              f32[10] = analogDirVal;
              f32[11] = ef.pulseActive ? 1.0 : 0.0;

              // params3: [pulseAmount, pulseSpeed, pulseFreq, pulseMode]
              const basePulseAmount = ef.pulseAmount ?? 1.5;
              const pulseAmount = Math.max(0.0, Math.min(6.0, this.getEffectiveParam(layer, ef.id, 'pulse_cv', basePulseAmount, timeSec)));
              const basePulseSpeed = ef.pulseSpeed ?? 1.0;
              const pulseSpeed = this.getEffectiveParam(layer, ef.id, 'pulse_speed_cv', basePulseSpeed, timeSec);
              const pulseFreq = Math.max(0.2, Math.min(20.0, ef.pulseFreq ?? 3.0));
              const pulseModeMap: Record<string, number> = { local_edge: 0, contour: 1, radial: 2, horizontal: 3, vertical: 4 };
              const pulseModeVal = pulseModeMap[ef.pulseMode ?? 'local_edge'] ?? 0;

              f32[12] = pulseAmount;
              f32[13] = pulseSpeed;
              f32[14] = pulseFreq;
              f32[15] = pulseModeVal;

              // lineColor: RGBA (offset 16..19)
              const lc = ef.lineColor || [0, 0, 0, 1];
              f32[16] = lc[0]; f32[17] = lc[1]; f32[18] = lc[2]; f32[19] = lc[3] ?? 1.0;

              // 8 Palette Colors (offset 20..51)
              for (let i = 0; i < 8; i++) {
                let c = DEFAULT_LUMA_PALETTE[i];
                if (pal && ef.usePaletteIn !== false && pal.colors.length > 0) {
                  const pc = pal.colors[i % pal.colors.length];
                  c = [pc[0], pc[1], pc[2], pc[3] ?? 1.0];
                }
                const base = 20 + i * 4;
                f32[base] = c[0]; f32[base + 1] = c[1]; f32[base + 2] = c[2]; f32[base + 3] = c[3] ?? 1.0;
              }

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
              pipeline = null;
          } else if (effect.type === 'BadAnalog') {
              pipeline = this.badAnalogPipeline;
              const ef = effect as BadAnalogEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 96);
              const f32 = new Float32Array(24);

              // Display mode map: crt=0, vector=1, monochrome=2, matrix_lcd=3
              const dispMap: Record<string, number> = { crt: 0, vector: 1, monochrome: 2, matrix_lcd: 3 };
              const targetMap: Record<string, number> = { canvas: 0, upstream_bounded: 1 };
              const phosMap: Record<string, number> = { p1_green: 0, p3_amber: 1, p4_white: 2 };

              const displayModeVal = dispMap[ef.displayMode] ?? 0;
              const processTargetVal = targetMap[ef.processTarget] ?? 0;
              const phosphorTypeVal = phosMap[ef.phosphorType] ?? 0;

              const maskTex = this.getConnectedInputTexture(layer, nodeId, 'mask_in');
              const hasMaskVal = maskTex ? 1.0 : 0.0;
              const aspect = target.width / Math.max(1, target.height);

              // CV Modulations
              const baseJitter = ef.jitter ?? 0.08;
              const jitterVal = Math.max(0.0, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'jitter_cv', baseJitter, timeSec)));

              const baseTracking = ef.vhsTracking ?? 0.0;
              const trackingVal = Math.max(0.0, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'tracking_cv', baseTracking, timeSec)));

              const baseBleed = ef.chromaBleed ?? 0.35;
              const bleedVal = Math.max(0.0, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'bleed_cv', baseBleed, timeSec)));

              const glitchTrigVal = Math.max(0.0, Math.min(1.0, this.getEffectiveParam(layer, ef.id, 'glitch_trig', 0.0, timeSec)));

              // params0: [displayMode, processTarget, phosphorType, timeSec]
              f32[0] = displayModeVal;
              f32[1] = processTargetVal;
              f32[2] = phosphorTypeVal;
              f32[3] = timeSec;

              // params1: [aspect, hasMask, curvature, vignette]
              f32[4] = aspect;
              f32[5] = hasMaskVal;
              f32[6] = ef.curvature ?? 0.15;
              f32[7] = ef.vignette ?? 0.25;

              // params2: [scanlines, scanlineCount, phosphorMask, maskBrightness]
              f32[8] = ef.scanlines ?? 0.5;
              f32[9] = ef.scanlineCount ?? 240.0;
              f32[10] = ef.phosphorMask ?? 0.35;
              f32[11] = ef.maskBrightness ?? 1.15;

              // params3: [chromaBleed, jitter, vhsTracking, headSwitching]
              f32[12] = bleedVal;
              f32[13] = jitterVal;
              f32[14] = trackingVal;
              f32[15] = ef.headSwitching ?? 0.0;

              // params4: [humBar, humBarSpeed, noiseSnow, lumaSag]
              f32[16] = ef.humBar ?? 0.0;
              f32[17] = ef.humBarSpeed ?? 0.5;
              f32[18] = ef.noiseSnow ?? 0.05;
              f32[19] = ef.lumaSag ?? 0.0;

              // params5: [vectorGlow, vectorIntensity, glitchTrig, 0.0]
              f32[20] = ef.vectorGlow ?? 0.6;
              f32[21] = ef.vectorIntensity ?? 1.5;
              f32[22] = glitchTrigVal;
              f32[23] = 0.0;

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: maskTex ? maskTex.createView() : this.blankTexture.createView() },
                { binding: 3, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
              pipeline = null;
          } else if (effect.type === 'DataMosh') {
              pipeline = this.dataMoshPipeline;
              const ef = effect as DataMoshEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 64);
              const f32 = new Float32Array(16);

              const targetMap: Record<string, number> = { canvas: 0, upstream_bounded: 1 };
              const processTargetVal = targetMap[ef.processTarget] ?? 0;

              // Ping-pong and previous input textures
              const width = target.width;
              const height = target.height;
              let historyA = this.dataMoshHistoryA[nodeId];
              let historyB = this.dataMoshHistoryB[nodeId];
              let prevInput = this.dataMoshPrevInput[nodeId];

              if (!historyA || historyA.width !== width || historyA.height !== height) {
                if (historyA) historyA.destroy();
                if (historyB) historyB.destroy();
                if (prevInput) prevInput.destroy();
                const texDesc: GPUTextureDescriptor = {
                  size: [width, height],
                  format: this.format,
                  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
                };
                historyA = this.device.createTexture(texDesc);
                historyB = this.device.createTexture(texDesc);
                prevInput = this.device.createTexture(texDesc);
                this.dataMoshHistoryA[nodeId] = historyA;
                this.dataMoshHistoryB[nodeId] = historyB;
                this.dataMoshPrevInput[nodeId] = prevInput;
                this.dataMoshPingPong[nodeId] = false;
                this.dataMoshInitialized[nodeId] = false;
              }

              const useB = this.dataMoshPingPong[nodeId] ?? false;
              const historyReadTex = useB ? historyB : historyA;
              const historyWriteTex = useB ? historyA : historyB;

              // Frame delta time for frame-rate-independent decay & bias drift
              const prevTime = this.dataMoshLastTime[nodeId];
              let dt = 0.0;
              let wasTransportReset = false;
              if (prevTime !== undefined) {
                if (timeSec < prevTime) {
                  wasTransportReset = true;
                } else {
                  dt = Math.min(0.1, Math.max(0.0, timeSec - prevTime));
                }
              }
              this.dataMoshLastTime[nodeId] = timeSec;

              // Keyframe detection
              let isKeyframe = 0.0;
              if (!this.dataMoshInitialized[nodeId] || wasTransportReset) {
                isKeyframe = 1.0;
                this.dataMoshInitialized[nodeId] = true;
                this.dataMoshLastKeyframeTime[nodeId] = timeSec;
              }

              // Manual UI trigger
              const manualTrig = ef.manualKeyframeTrigger ?? 0;
              const lastManual = this.dataMoshLastManualTrig[nodeId] ?? 0;
              if (manualTrig > 0 && manualTrig !== lastManual) {
                isKeyframe = 1.0;
                this.dataMoshLastManualTrig[nodeId] = manualTrig;
                this.dataMoshLastKeyframeTime[nodeId] = timeSec;
              }

              // CV Trigger (I-Frame Trig)
              const rawCVTrig = this.getEffectiveParam(layer, ef.id, 'keyframe_trig', 0.0, timeSec);
              const lastCV = this.dataMoshLastCVTrig[nodeId] ?? 0;
              if (rawCVTrig > 0.5 && lastCV <= 0.5) {
                isKeyframe = 1.0;
                this.dataMoshLastKeyframeTime[nodeId] = timeSec;
              }
              this.dataMoshLastCVTrig[nodeId] = rawCVTrig;

              // Periodic mode
              if (ef.keyframeMode === 'periodic') {
                const rate = Math.max(0.02, Math.min(20.0, ef.keyframeRate ?? DATAMOSH_DEFAULTS.keyframeRate));
                const interval = 1.0 / rate;
                const lastKeyTime = this.dataMoshLastKeyframeTime[nodeId] ?? timeSec;
                if (timeSec - lastKeyTime >= interval) {
                  isKeyframe = 1.0;
                  this.dataMoshLastKeyframeTime[nodeId] = timeSec;
                }
              }

              // CV Modulations
              const baseGain = ef.vectorGain ?? DATAMOSH_DEFAULTS.vectorGain;
              const vectorGainVal = Math.max(0.0, Math.min(5.0, this.getEffectiveParam(layer, ef.id, 'mosh_cv', baseGain, timeSec)));

              const baseBlock = ef.macroblockSize ?? DATAMOSH_DEFAULTS.macroblockSize;
              const macroblockSizeVal = Math.max(1.0, Math.min(64.0, this.getEffectiveParam(layer, ef.id, 'block_size_cv', baseBlock, timeSec)));

              const baseBiasX = ef.biasX ?? DATAMOSH_DEFAULTS.biasX;
              const biasXVal = Math.max(-2.0, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'bias_x_cv', baseBiasX, timeSec)));

              const baseBiasY = ef.biasY ?? DATAMOSH_DEFAULTS.biasY;
              const biasYVal = Math.max(-2.0, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'bias_y_cv', baseBiasY, timeSec)));

              // Accumulate sub-pixel directional bias into crisp integer texel steps
              const biasAccum = this.dataMoshBiasAccum[nodeId] ?? { x: 0, y: 0 };
              if (isKeyframe > 0.5) {
                biasAccum.x = 0;
                biasAccum.y = 0;
              } else if (dt > 0) {
                biasAccum.x += biasXVal * width * 0.35 * dt;
                biasAccum.y += -biasYVal * height * 0.35 * dt;
              }
              const biasStepX = Math.trunc(biasAccum.x);
              const biasStepY = Math.trunc(biasAccum.y);
              biasAccum.x -= biasStepX;
              biasAccum.y -= biasStepY;
              this.dataMoshBiasAccum[nodeId] = biasAccum;

              const decayVal = ef.decay ?? DATAMOSH_DEFAULTS.decay;
              const frameRetentionVal = computeFrameRetention(decayVal, dt);

              const maskTex = this.getConnectedInputTexture(layer, nodeId, 'mask_in');
              const hasMaskVal = maskTex ? 1.0 : 0.0;
              const aspect = target.width / Math.max(1, target.height);

              // params0: [processTarget, vectorGain, frameRetention, threshold]
              f32[0] = processTargetVal;
              f32[1] = vectorGainVal;
              f32[2] = frameRetentionVal;
              f32[3] = ef.threshold ?? DATAMOSH_DEFAULTS.threshold;

              // params1: [macroblockSize, chromaBleed, biasStepX, biasStepY]
              f32[4] = macroblockSizeVal;
              f32[5] = ef.chromaBleed ?? DATAMOSH_DEFAULTS.chromaBleed;
              f32[6] = biasStepX;
              f32[7] = biasStepY;

              // params2: [noiseGlitch, isKeyframe, hasMask, timeSec]
              f32[8] = ef.noiseGlitch ?? DATAMOSH_DEFAULTS.noiseGlitch;
              f32[9] = isKeyframe;
              f32[10] = hasMaskVal;
              f32[11] = timeSec;

              // params3: [aspect, refreshThreshold, motionCutMode, motionThreshold]
              f32[12] = aspect;
              f32[13] = ef.refreshThreshold ?? DATAMOSH_DEFAULTS.refreshThreshold;
              f32[14] = ef.keyframeMode === 'motion_thresh' ? 1.0 : 0.0;
              f32[15] = ef.motionThreshold ?? DATAMOSH_DEFAULTS.motionThreshold;

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: prevInput.createView() },
                { binding: 3, resource: historyReadTex.createView() },
                { binding: 4, resource: maskTex ? maskTex.createView() : this.blankTexture.createView() },
                { binding: 5, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();

              // Copy output into persistent accumulation history for next frame
              if (target.width === historyWriteTex.width && target.height === historyWriteTex.height) {
                commandEncoder.copyTextureToTexture(
                  { texture: target },
                  { texture: historyWriteTex },
                  [width, height, 1]
                );
              }

              // Copy current input texture into prevInput for optical flow vector calculation
              if (tex !== this.blankTexture && (tex.usage & GPUTextureUsage.COPY_SRC) && tex.width === prevInput.width && tex.height === prevInput.height) {
                commandEncoder.copyTextureToTexture(
                  { texture: tex },
                  { texture: prevInput },
                  [width, height, 1]
                );
              }

              // Toggle ping-pong
              this.dataMoshPingPong[nodeId] = !useB;
              pipeline = null;
          } else if (effect.type === 'FeedbackPro') {
              pipeline = this.feedbackProPipeline;
              const ef = effect as FeedbackProEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 96);
              const f32 = new Float32Array(24);

              const width = target.width;
              const height = target.height;
              let historyA = this.fpHistoryA[nodeId];
              let historyB = this.fpHistoryB[nodeId];

              if (!historyA || historyA.width !== width || historyA.height !== height) {
                if (historyA) historyA.destroy();
                if (historyB) historyB.destroy();
                const texDesc: GPUTextureDescriptor = {
                  size: [width, height],
                  format: this.format,
                  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
                };
                historyA = this.device.createTexture(texDesc);
                historyB = this.device.createTexture(texDesc);
                this.fpHistoryA[nodeId] = historyA;
                this.fpHistoryB[nodeId] = historyB;
                this.fpPingPong[nodeId] = false;
              }

              const useB = this.fpPingPong[nodeId] ?? false;
              const historyReadTex = useB ? historyB : historyA;
              const historyWriteTex = useB ? historyA : historyB;

              // Clear Buffer handling (UI Button or CV Trigger)
              const manualClear = ef.clearTrigger ?? 0;
              const lastClear = this.fpLastClear[nodeId] ?? 0;
              const clearCV = this.getEffectiveParam(layer, ef.id, 'clear_trig', 0.0, timeSec);
              const lastClearCV = this.fpLastClearCV[nodeId] ?? 0;

              let shouldClear = false;
              if (manualClear > 0 && manualClear !== lastClear) {
                shouldClear = true;
                this.fpLastClear[nodeId] = manualClear;
              }
              if (clearCV > 0.5 && lastClearCV <= 0.5) {
                shouldClear = true;
              }
              this.fpLastClearCV[nodeId] = clearCV;

              if (shouldClear) {
                const clearPass = commandEncoder.beginRenderPass({
                  colorAttachments: [{
                    view: historyReadTex.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store'
                  }]
                });
                clearPass.end();
              }

              // Freeze Gate / Button handling
              const freezeCV = this.getEffectiveParam(layer, ef.id, 'freeze_gate', 0.0, timeSec);
              const isFrozen = !!(ef.frozen || freezeCV > 0.5);

              if (isFrozen) {
                let frozenTex = this.fpFrozenTex[nodeId];
                if (!frozenTex || frozenTex.width !== width || frozenTex.height !== height) {
                  if (frozenTex) frozenTex.destroy();
                  frozenTex = this.device.createTexture({
                    size: [width, height],
                    format: this.format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST
                  });
                  this.fpFrozenTex[nodeId] = frozenTex;
                }

                const wasFrozen = this.fpWasFrozen[nodeId] ?? false;
                if (!wasFrozen) {
                  // Rising edge of freeze: capture the current valid live output frame into frozen buffer
                  const srcTex = (this.fpInitialized[nodeId] && target.width === width && target.height === height)
                    ? target
                    : tex;
                  commandEncoder.copyTextureToTexture(
                    { texture: srcTex },
                    { texture: frozenTex },
                    [width, height, 1]
                  );
                }
                this.fpWasFrozen[nodeId] = true;

                // Blit/copy frozen frame directly into target so output holds the frozen frame
                commandEncoder.copyTextureToTexture(
                  { texture: frozenTex },
                  { texture: target },
                  [width, height, 1]
                );

                // Matte out handling if connected
                const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
                if (isMatteConnected) {
                  const matteTex = this.ensureTexture(nodeId, 'matte_out');
                  const mattePass = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                      view: matteTex.createView(),
                      clearValue: { r: 1, g: 1, b: 1, a: 1 },
                      loadOp: 'clear',
                      storeOp: 'store'
                    }]
                  });
                  mattePass.end();
                }

                // Keep historyWriteTex refreshed with the frozen frame so when un-freezing, feedback resumes seamlessly
                if (historyWriteTex.width === width && historyWriteTex.height === height) {
                  commandEncoder.copyTextureToTexture(
                    { texture: frozenTex },
                    { texture: historyWriteTex },
                    [width, height, 1]
                  );
                }

                pipeline = null;
                return;
              }

              this.fpWasFrozen[nodeId] = false;

              // CV Modulations
              const baseGain = ef.gain ?? 0.95;
              const gainVal = Math.max(0.0, Math.min(1.5, this.getEffectiveParam(layer, ef.id, 'gain_cv', baseGain, timeSec)));

              const baseZoom = ef.zoom ?? 1.02;
              const zoomVal = Math.max(0.5, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'zoom_cv', baseZoom, timeSec)));

              const baseRotDeg = ef.rotation ?? 0.5;
              const rotDegVal = this.getEffectiveParam(layer, ef.id, 'rotation_cv', baseRotDeg, timeSec);
              const rotRadVal = rotDegVal * (Math.PI / 180.0);

              const baseLumaWarp = ef.lumaWarp ?? 0.2;
              const lumaWarpVal = Math.max(-2.0, Math.min(2.0, this.getEffectiveParam(layer, ef.id, 'luma_warp_cv', baseLumaWarp, timeSec)));

              const blendModes: Record<string, number> = { normal: 0, add: 1, screen: 2, difference: 3, max: 4 };
              const blendModeVal = blendModes[ef.blendMode || 'screen'] ?? 2;
              const processTargetVal = (ef.processTarget === 'upstream_bounded') ? 1.0 : 0.0;

              const maskTex = this.getConnectedInputTexture(layer, nodeId, 'mask_in');
              const hasMaskVal = maskTex ? 1.0 : 0.0;
              const aspect = target.width / Math.max(1, target.height);

              // params0: [gain, zoom, rotationRad, twist]
              f32[0] = gainVal;
              f32[1] = zoomVal;
              f32[2] = rotRadVal;
              f32[3] = ef.twist ?? 0.0;

              // params1: [driftX, driftY, pivotX, pivotY]
              f32[4] = ef.driftX ?? 0.0;
              f32[5] = ef.driftY ?? 0.0;
              f32[6] = ef.pivotX ?? 0.5;
              f32[7] = ef.pivotY ?? 0.5;

              // params2: [lumaWarp, lumaTwist, rgbDispersion, hueShiftRad]
              f32[8] = lumaWarpVal;
              f32[9] = ef.lumaTwist ?? 0.0;
              f32[10] = ef.rgbDispersion ?? 0.005;
              f32[11] = ((ef.hueShift ?? 0.0) % 360.0) * (Math.PI / 180.0);

              // params3: [softKnee, edgeRollOff, blendMode, processTarget]
              f32[12] = ef.softKnee ?? 0.4;
              f32[13] = ef.edgeRollOff ?? 0.3;
              f32[14] = blendModeVal;
              f32[15] = processTargetVal;

              // params4: [isFrozen, hasMask, aspect, timeSec]
              f32[16] = isFrozen ? 1.0 : 0.0;
              f32[17] = hasMaskVal;
              f32[18] = aspect;
              f32[19] = timeSec;

              // params5: [edgeMode (0=clamp, 1=wrap, 2=mirror), tunnelWarp, pivotOrbit, pivotOrbitSpeed]
              const edgeModes: Record<string, number> = { clamp: 0, wrap: 1, mirror: 2 };
              const edgeModeVal = edgeModes[ef.edgeMode || 'clamp'] ?? 0;
              f32[20] = edgeModeVal;
              f32[21] = Math.max(0.0, Math.min(1.0, ef.tunnelWarp ?? 0.0));
              f32[22] = Math.max(0.0, Math.min(0.5, ef.pivotOrbit ?? 0.0));
              f32[23] = Math.max(0.0, Math.min(3.0, ef.pivotOrbitSpeed ?? 0.5));

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: historyReadTex.createView() },
                { binding: 3, resource: maskTex ? maskTex.createView() : this.blankTexture.createView() },
                { binding: 4, resource: this.sampler }
              ];

              const isMatteConnected = (layer.graph?.edges || []).some(c => c.fromNodeId === nodeId && c.fromPort === 'matte_out');
              const matteTex = this.ensureTexture(nodeId, 'matte_out');
              const pass = commandEncoder.beginRenderPass({
                colorAttachments: [
                  { view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
                  { view: matteTex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: isMatteConnected ? 'store' : 'discard' }
                ]
              });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();

              // Copy output to historyWriteTex for next frame recursion
              if (target.width === historyWriteTex.width && target.height === historyWriteTex.height) {
                commandEncoder.copyTextureToTexture(
                  { texture: target },
                  { texture: historyWriteTex },
                  [width, height, 1]
                );
              }

              // Toggle ping-pong
              this.fpPingPong[nodeId] = !useB;
              this.fpInitialized[nodeId] = true;
              pipeline = null;
          } else {
            if (effect.type === 'Transform2D') {
              pipeline = this.transformPipeline;
              const ef = effect as Transform2DEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);
              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                this.getEffectiveParam(layer, ef.id, 'translateX', ef.translateX, timeSec),
                this.getEffectiveParam(layer, ef.id, 'translateY', ef.translateY, timeSec),
                this.getEffectiveParam(layer, ef.id, 'scaleX', ef.scaleX, timeSec),
                this.getEffectiveParam(layer, ef.id, 'scaleY', ef.scaleY, timeSec),
                this.getEffectiveParam(layer, ef.id, 'rotation', ef.rotation, timeSec), // already rad in eff state
                this.getEffectiveParam(layer, ef.id, 'spin', ef.spin ?? 0, timeSec),
                timeSec,
                this.canvas.width / this.canvas.height
              ]));
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'Spawn') {
              this.renderSpawn(layer, nodeId, inputTex, target, timeSec, commandEncoder);
              return; // Done
            } else if (effect.type === 'ColorAdjust') {
              pipeline = this.colorAdjustPipeline;
              const ef = effect as ColorAdjustEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);
              const buf = new ArrayBuffer(32);
              new Float32Array(buf).set([this.getEffectiveParam(layer, ef.id, 'contrast', ef.contrast, timeSec), this.getEffectiveParam(layer, ef.id, 'saturation', ef.saturation, timeSec), this.getEffectiveParam(layer, ef.id, 'brightness', ef.brightness, timeSec)]);
              new Uint32Array(buf)[4] = ef.invert ? 1 : 0;
              this.device.queue.writeBuffer(uniformBuffer, 0, buf);
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'LumaKey') {
              pipeline = this.lumaKeyPipeline;
              const ef = effect as LumaKeyEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);
              const buf = new ArrayBuffer(16);
              new Float32Array(buf).set([this.getEffectiveParam(layer, ef.id, 'threshold', ef.threshold, timeSec), this.getEffectiveParam(layer, ef.id, 'tolerance', ef.tolerance, timeSec)]);
              new Uint32Array(buf)[2] = ef.invertKey ? 1 : 0;
              this.device.queue.writeBuffer(uniformBuffer, 0, buf);
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'Inverter') {
              pipeline = this.inverterPipeline;
              const ef = effect as InverterEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);
              const videoModeIdx = ef.videoMode === 'luma' ? 1.0 : (ef.videoMode === 'chroma' ? 2.0 : 0.0);
              const mixVal = Math.max(0, Math.min(1, this.getEffectiveParam(layer, ef.id, 'mix', ef.mix, timeSec)));
              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                mixVal,
                videoModeIdx,
                ef.active ? 1.0 : 0.0,
                0
              ]));
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'SimpleFeedback') {
              pipeline = this.feedbackPipeline;
              const ef = effect as SimpleFeedbackEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);
              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                this.getEffectiveParam(layer, ef.id, 'feedbackAmount', ef.feedbackAmount, timeSec),
                this.getEffectiveParam(layer, ef.id, 'zoom', ef.zoom, timeSec),
                this.getEffectiveParam(layer, ef.id, 'angle', ef.angle, timeSec),
                0
              ]));
              const fbTex = this.getFeedbackTexture(layer.id);
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: fbTex.createView() }, { binding: 3, resource: this.sampler }];
            } else if (effect.type === 'TriggeredGate') {
              pipeline = this.triggeredGatePipeline;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16); // Only 1 f32 (padded to 16 for alignment)
              const gateOpen = SignalDispatcher.getInstance().getGateState(layer.id, nodeId);
              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                gateOpen ? 1.0 : 0.0, 0, 0, 0
              ]));
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: tex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'Pattern') {
              pipeline = this.patternPipeline;
              const ef = effect as PatternEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 64);
              const buf = new ArrayBuffer(64);
              const f32 = new Float32Array(buf);
              const u32 = new Uint32Array(buf);

              const applyLogScale = (manual: number, mod: number) => {
                if (mod > 0) return manual * Math.pow(32 / manual, mod);
                if (mod < 0) return manual * Math.pow(manual, mod);
                return manual;
              };

              const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);

              const rawCountX = latestSignals[`${nodeId}.countX`] ?? 0;
              const rawCountY = latestSignals[`${nodeId}.countY`] ?? 0;
              const countMod = ef.syncCount ? (rawCountX + rawCountY) : 0;
              f32[0] = applyLogScale(ef.countX, ef.syncCount ? countMod : rawCountX);
              f32[1] = applyLogScale(ef.countY, ef.syncCount ? countMod : rawCountY);

              const rawSpX = latestSignals[`${nodeId}.spacingX`] ?? 0;
              const rawSpY = latestSignals[`${nodeId}.spacingY`] ?? 0;
              const spModX = ef.syncSpacing ? (rawSpX + rawSpY) : rawSpX;
              const spModY = ef.syncSpacing ? (rawSpX + rawSpY) : rawSpY;
              f32[2] = ef.spacingX + spModX;
              f32[3] = ef.spacingY + spModY;

              const rawOffX = latestSignals[`${nodeId}.offsetX`] ?? 0;
              const rawOffY = latestSignals[`${nodeId}.offsetY`] ?? 0;
              const offModX = ef.syncOffset ? (rawOffX + rawOffY) : rawOffX;
              const offModY = ef.syncOffset ? (rawOffX + rawOffY) : rawOffX;
              f32[4] = ef.offsetX + offModX;
              f32[5] = ef.offsetY + offModY;

              // Handle Mirror Triggers
              let mState = this.patternMirrorStates.get(nodeId);
              if (!mState) {
                mState = { x: ef.alternateMirrorX, y: ef.alternateMirrorY };
                this.patternMirrorStates.set(nodeId, mState);
              }

              const settingsX = layer.inputSettings?.[`${nodeId}.mirror_trig_x`];
              const isLatchX = settingsX?.latch !== false;
              const trigX = latestSignals[`${nodeId}.mirror_trig_x`] ?? 0;
              const lastX = this.lastTriggerVals.get(`${nodeId}.mirror_trig_x`) ?? 0;
              if (isLatchX) {
                if (trigX > 0.5 && lastX <= 0.5) mState.x = !mState.x;
              } else {
                mState.x = trigX > 0.5 ? !ef.alternateMirrorX : ef.alternateMirrorX;
              }
              this.lastTriggerVals.set(`${nodeId}.mirror_trig_x`, trigX);

              const settingsY = layer.inputSettings?.[`${nodeId}.mirror_trig_y`];
              const isLatchY = settingsY?.latch !== false;
              const trigY = latestSignals[`${nodeId}.mirror_trig_y`] ?? 0;
              const lastY = this.lastTriggerVals.get(`${nodeId}.mirror_trig_y`) ?? 0;
              if (isLatchY) {
                if (trigY > 0.5 && lastY <= 0.5) mState.y = !mState.y;
              } else {
                mState.y = trigY > 0.5 ? !ef.alternateMirrorY : ef.alternateMirrorY;
              }
              this.lastTriggerVals.set(`${nodeId}.mirror_trig_y`, trigY);

              u32[6] = mState.x ? 1 : 0;
              u32[7] = mState.y ? 1 : 0;

              // Radial & Jitter Engine extensions
              u32[8] = ef.mode === 'radial' ? 1 : 0;
              f32[9] = this.getEffectiveParam(layer, nodeId, 'rings_cv', ef.radialRings ?? 4, timeSec);
              f32[10] = ef.radialSegments ?? 8;
              f32[11] = this.getEffectiveParam(layer, nodeId, 'rotation_cv', ef.tileRotation ?? 0, timeSec);
              f32[12] = this.getEffectiveParam(layer, nodeId, 'jitter_cv', ef.jitter ?? 0, timeSec);
              f32[13] = 0.0;
              f32[14] = 0.0;
              f32[15] = 0.0;

              this.device.queue.writeBuffer(uniformBuffer, 0, buf);
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: tex.createView() }
              ];
            } else if (effect.type === 'UVDisplace') {
              pipeline = this.uvDisplacePipeline;
              const ef = effect as UVDisplaceEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);
              const buf = new ArrayBuffer(32);
              const f32 = new Float32Array(buf);
              const u32 = new Uint32Array(buf);

              const modAmount = this.getEffectiveParam(layer, nodeId, 'amount_cv', ef.amount ?? 0.2, timeSec);
              const ax = (ef.amountX ?? 1.0) * modAmount;
              const ay = (ef.amountY ?? 1.0) * modAmount;
              f32[0] = ax;
              f32[1] = ay;

              const modeMap: Record<string, number> = { cartesian: 0, radial: 1, luma: 2 };
              const wrapMap: Record<string, number> = { clamp: 0, wrap: 1, mirror: 2, soft_wrap: 3 };
              const polarityMap: Record<string, number> = { bipolar: 0, unipolar: 1 };

              u32[2] = modeMap[ef.mode] ?? 0;
              u32[3] = wrapMap[ef.wrapMode] ?? 0;
              u32[4] = polarityMap[ef.polarity ?? 'bipolar'] ?? 0;

              // Default edgeFalloff to 0.1 for clamp mode to prevent edge streaks; 0.0 for wrap/mirror
              const defaultFalloff = (ef.wrapMode === 'clamp' || !ef.wrapMode) ? 0.1 : 0.0;
              f32[5] = ef.edgeFalloff !== undefined ? ef.edgeFalloff : defaultFalloff;
              f32[6] = 0.12; // soft wrap crossfade overlap width
              f32[7] = 0.0;  // padding

              this.device.queue.writeBuffer(uniformBuffer, 0, buf);

              const mapTex = this.getConnectedInputTexture(layer, nodeId, 'map_in') ?? this.blankTexture;

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: tex.createView() },
                { binding: 3, resource: mapTex.createView() }
              ];
            } else if (effect.type === 'Kaleidoscope') {
              pipeline = this.kaleidoscopePipeline;
              const ef = effect as KaleidoscopeEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);

              const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
              const rawAngleMod = latestSignals[`${nodeId}.angle`] ?? 0;
              const angle = ef.angle + rawAngleMod * 360.0;

              const rawCountMod = latestSignals[`${nodeId}.segments`] ?? 0;
              const manualCount = ef.segments;
              let finalCount = manualCount;
              if (rawCountMod > 0) {
                finalCount = manualCount * Math.pow(32 / manualCount, rawCountMod);
              } else if (rawCountMod < 0) {
                finalCount = manualCount * Math.pow(manualCount, rawCountMod);
              }

              const modZoom = this.getEffectiveParam(layer, ef.id, 'zoom', ef.zoom, timeSec);

              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                finalCount,
                angle,
                modZoom,
                ef.center[0],
                ef.center[1],
                0, 0, 0
              ]));
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: tex.createView() }];
            } else if (effect.type === 'SampleAndHold') {
              const sh = effect as SampleAndHoldEffect;
              const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
              const trigger = latestSignals[`${nodeId}.trigger`] ?? 0;
              const lastTrig = this.lastTriggerVals.get(`${nodeId}.trigger`) ?? 0;

              const currentManualTime = sh.manualTriggerTime ?? 0;
              const lastManualTime = this.lastTriggerVals.get(`${nodeId}.manualTrigger`) ?? 0;
              const isManualRising = currentManualTime > lastManualTime;
              this.lastTriggerVals.set(`${nodeId}.manualTrigger`, currentManualTime);

              const isRising = (trigger > 0.5 && lastTrig <= 0.5) || isManualRising;
              this.lastTriggerVals.set(`${nodeId}.trigger`, trigger);

              const heldTex = this.ensureTexture(nodeId, 'held');

              // Handle modes
              let live = this.shLiveStates.get(nodeId);
              if (live === undefined) {
                live = sh.isLive;
                this.shLiveStates.set(nodeId, live);
              }
              if (sh.isLive !== live) {
                live = sh.isLive;
                this.shLiveStates.set(nodeId, live);
              }

              const toggleTrig = latestSignals[`${nodeId}.live_toggle`] ?? 0;
              const lastToggle = this.lastTriggerVals.get(`${nodeId}.live_toggle`) ?? 0;
              const isToggleRising = toggleTrig > 0.5 && lastToggle <= 0.5;
              this.lastTriggerVals.set(`${nodeId}.live_toggle`, toggleTrig);

              if (isToggleRising) {
                live = !live;
                this.shLiveStates.set(nodeId, live);
                // If flipping to Hold, capture current frame
                if (!live) {
                  commandEncoder.copyTextureToTexture(
                    { texture: inputTex },
                    { texture: heldTex },
                    [this.canvas.width, this.canvas.height]
                  );
                }
              }

              if (isRising) {
                if (sh.triggerMode === 'freeze_toggle') {
                  live = !live;
                  this.shLiveStates.set(nodeId, live);
                  if (!live) {
                    commandEncoder.copyTextureToTexture(
                      { texture: inputTex },
                      { texture: heldTex },
                      [this.canvas.width, this.canvas.height]
                    );
                  }
                } else if (sh.triggerMode === 'sample_show') {
                  live = false;
                  this.shLiveStates.set(nodeId, live);
                  commandEncoder.copyTextureToTexture(
                    { texture: inputTex },
                    { texture: heldTex },
                    [this.canvas.width, this.canvas.height]
                  );
                } else { // sample_only
                  commandEncoder.copyTextureToTexture(
                    { texture: inputTex },
                    { texture: heldTex },
                    [this.canvas.width, this.canvas.height]
                  );
                }
              }

              pipeline = this.blitPipeline;
              const displayTex = live ? inputTex : heldTex;
              entries = [{ binding: 0, resource: displayTex.createView() }, { binding: 1, resource: this.sampler }];
            } else if (effect.type === 'VideoMixer') {
              pipeline = this.videoMixerPipeline;
              const ef = effect as VideoMixerEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 64);
              const modeMap: Record<string, number> = { normal: 0, add: 1, screen: 2, mult: 3 };

              const f32 = new Float32Array(16);
              f32[0] = this.getEffectiveParam(layer, ef.id, 'v1_cv', ef.v1, timeSec);
              f32[1] = this.getEffectiveParam(layer, ef.id, 'v2_cv', ef.v2, timeSec);
              f32[2] = this.getEffectiveParam(layer, ef.id, 'v3_cv', ef.v3, timeSec);
              f32[3] = this.getEffectiveParam(layer, ef.id, 'v4_cv', ef.v4, timeSec);

              f32[4] = this.getEffectiveParam(layer, ef.id, 'v1_alpha_cv', ef.v1Alpha ?? 1.0, timeSec);
              f32[5] = this.getEffectiveParam(layer, ef.id, 'v2_alpha_cv', ef.v2Alpha ?? 1.0, timeSec);
              f32[6] = this.getEffectiveParam(layer, ef.id, 'v3_alpha_cv', ef.v3Alpha ?? 1.0, timeSec);
              f32[7] = this.getEffectiveParam(layer, ef.id, 'v4_alpha_cv', ef.v4Alpha ?? 1.0, timeSec);

              const u32 = new Uint32Array(f32.buffer);
              u32[8] = modeMap[ef.v1Mode] || 0;
              u32[9] = modeMap[ef.v2Mode] || 0;
              u32[10] = modeMap[ef.v3Mode] || 0;
              u32[11] = modeMap[ef.v4Mode] || 0;

              f32[12] = this.getEffectiveParam(layer, ef.id, 'master_cv', ef.masterGain, timeSec);
              f32[13] = this.getEffectiveParam(layer, ef.id, 'crossfader', ef.crossfader ?? 0.5, timeSec);
              u32[14] = ef.crossfadeEnabled ? 1 : 0;
              f32[15] = 0.0; // padding

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              const v1 = this.getConnectedInputTexture(layer, nodeId, 'v1_in')?.createView() ?? this.blankTexture.createView();
              const v2 = this.getConnectedInputTexture(layer, nodeId, 'v2_in')?.createView() ?? this.blankTexture.createView();
              const v3 = this.getConnectedInputTexture(layer, nodeId, 'v3_in')?.createView() ?? this.blankTexture.createView();
              const v4 = this.getConnectedInputTexture(layer, nodeId, 'v4_in')?.createView() ?? this.blankTexture.createView();

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: v1 },
                { binding: 2, resource: v2 },
                { binding: 3, resource: v3 },
                { binding: 4, resource: v4 },
                { binding: 5, resource: this.sampler }
              ];
            } else if (effect.type === 'KeyMixer') {
              pipeline = this.keyMixerPipeline;
              const ef = effect as KeyMixerEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 48);
              const f32 = new Float32Array(12);
              const u32 = new Uint32Array(f32.buffer);

              const modeMap: Record<string, number> = { luma: 0, chroma: 1 };
              const blendMap: Record<string, number> = { normal: 0, add: 1, screen: 2, mult: 3 };
              const outMap: Record<string, number> = { composite: 0, matte: 1, keyedFg: 2 };

              u32[0] = modeMap[ef.mode] ?? 1;
              f32[1] = this.getEffectiveParam(layer, nodeId, 'threshold_cv', ef.threshold ?? 0.4, timeSec);
              f32[2] = this.getEffectiveParam(layer, nodeId, 'tolerance_cv', ef.tolerance ?? 0.2, timeSec);
              f32[3] = this.getEffectiveParam(layer, nodeId, 'spill_cv', ef.spillSuppression ?? 0.5, timeSec);
              f32[4] = ef.keyColorR ?? 0.0;
              f32[5] = ef.keyColorG ?? 1.0;
              f32[6] = ef.keyColorB ?? 0.0;
              u32[7] = ef.invertMask ? 1 : 0;
              u32[8] = blendMap[ef.blendMode] ?? 0;
              f32[9] = ef.masterGain ?? 1.0;
              u32[10] = outMap[ef.outputMode] ?? 0;
              f32[11] = 0.0;

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              const bg = this.getConnectedInputTexture(layer, nodeId, 'bg_in')?.createView() ?? this.blankTexture.createView();
              const fg = this.getConnectedInputTexture(layer, nodeId, 'fg_in')?.createView() ?? inputTex.createView();

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: bg },
                { binding: 2, resource: fg },
                { binding: 3, resource: this.sampler }
              ];
            } else if (effect.type === 'VideoMath') {
              pipeline = this.videoMathPipeline;
              const ef = effect as VideoMathEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);
              const f32 = new Float32Array(8);
              const u32 = new Uint32Array(f32.buffer);

              const opMap: Record<string, number> = {
                add: 0, subtract: 1, multiply: 2, min: 3, max: 4, difference: 5, screen: 6, divide: 7, average: 8
              };

              u32[0] = opMap[ef.operation] ?? 0;
              f32[1] = this.getEffectiveParam(layer, nodeId, 'gain_a_cv', ef.gainA ?? 1.0, timeSec);
              f32[2] = this.getEffectiveParam(layer, nodeId, 'gain_b_cv', ef.gainB ?? 1.0, timeSec);
              f32[3] = this.getEffectiveParam(layer, nodeId, 'offset_cv', ef.offset ?? 0.0, timeSec);
              u32[4] = ef.clampOutput ? 1 : 0;
              f32[5] = ef.masterGain ?? 1.0;
              f32[6] = 0.0;
              f32[7] = 0.0;

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              const a = this.getConnectedInputTexture(layer, nodeId, 'a_in')?.createView() ?? inputTex.createView();
              const b = this.getConnectedInputTexture(layer, nodeId, 'b_in')?.createView() ?? this.blankTexture.createView();

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: a },
                { binding: 2, resource: b },
                { binding: 3, resource: this.sampler }
              ];
            } else if (effect.type === 'PixelProcessor') {
              pipeline = this.pixelProcessorPipeline;
              const ef = effect as PixelProcessorEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 64);
              const f32 = new Float32Array(16);
              const u32 = new Uint32Array(f32.buffer);

              u32[0] = ef.posterizeActive ? 1 : 0;
              f32[1] = this.getEffectiveParam(layer, nodeId, 'posterize_cv', ef.posterizeLevels, timeSec);
              u32[2] = ef.thresholdActive ? 1 : 0;
              f32[3] = this.getEffectiveParam(layer, nodeId, 'threshold_cv', ef.thresholdValue, timeSec);
              f32[4] = ef.thresholdSoftness;
              u32[5] = ef.edgeActive ? 1 : 0;
              f32[6] = this.getEffectiveParam(layer, nodeId, 'edge_amount_cv', ef.edgeAmount, timeSec);
              f32[7] = ef.edgeThreshold;
              u32[8] = (ef.bypass || this.getSignalValue(layer, nodeId, 'bypass_trig', 0) > 0.5) ? 1 : 0;

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: this.sampler }
              ];
            } else if (effect.type === 'AudioFile' || effect.type === 'AudioInput' || effect.type === 'SystemAudio') {
              this.manageMediaSource(nodeId, { ...effect, _layerAudioMuted: layer.audioMuted } as any);
            } else if (effect.type === 'CanvasBackground') {
              const ef = effect as CanvasBackgroundEffect;
              const outTex = this.ensureTexture(nodeId, 'video_out');
              this.renderCanvasBackground(layer, nodeId, ef, outTex, timeSec, commandEncoder);
              pipeline = null;
            } else if (effect.type === 'AlphaAdjust') {
              pipeline = this.alphaAdjustPipeline;
              const ef = effect as AlphaAdjustEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);

              let rawAmount = this.getEffectiveParam(layer, nodeId, 'amount_cv', ef.amount ?? 1.0, timeSec);
              if (ef.invertAmount) {
                rawAmount = 1.0 - rawAmount;
              }
              const finalAmount = Math.max(0.0, Math.min(1.0, rawAmount));

              const isLatch = ef.bypassMode === 'latch';
              const trig = this.getSignalValue(layer, nodeId, 'bypass_trig', 0);
              const lastTrig = this.lastTriggerVals.get(`${nodeId}.bypass_trig`) ?? 0;
              let bypassLatched = this.lastTriggerVals.get(`${nodeId}.bypass_latched`) ?? (ef.bypass ? 1 : 0);
              if (isLatch) {
                if (trig > 0.5 && lastTrig <= 0.5) {
                  bypassLatched = bypassLatched > 0.5 ? 0 : 1;
                  this.lastTriggerVals.set(`${nodeId}.bypass_latched`, bypassLatched);
                }
              } else {
                bypassLatched = (trig > 0.5 || ef.bypass) ? 1 : 0;
              }
              this.lastTriggerVals.set(`${nodeId}.bypass_trig`, trig);
              const isBypassed = isLatch ? (bypassLatched > 0.5 || ef.bypass) : (trig > 0.5 || ef.bypass);

              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                finalAmount,
                isBypassed ? 1.0 : 0.0,
                0.0,
                0.0
              ]));

              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: tex.createView() },
                { binding: 2, resource: this.sampler }
              ];
            }

            if (pipeline) {
              const pass = commandEncoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }] });
              const layout = this.effectLayouts.get(effect.type) || pipeline.getBindGroupLayout(0);
              const bg = this.device.createBindGroup({ layout, entries });
              pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
            }
          }
        }
      });

      const outEdges = (layer.graph?.edges || []).filter(e => e.toNodeId === '__output__' && (e.signalType === 'video' || e.signalType === 'generic'));
      if (outEdges.length > 0) {
        const lastTex = this.getTextureForNode(outEdges[0].fromNodeId, outEdges[0].fromPort);
        if (lastTex) {
          commandEncoder.copyTextureToTexture({ texture: lastTex }, { texture: this.getPrevFrameFBO(layer.id) }, [this.canvas.width, this.canvas.height, 1]);
          const pass = commandEncoder.beginRenderPass({ colorAttachments: [{ view: this.masterFBO.createView(), loadOp: 'load', storeOp: 'store' }] });
          const bg = this.device.createBindGroup({ layout: this.blitPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: lastTex.createView() }, { binding: 1, resource: this.sampler }] });
          pass.setPipeline(this.blitPipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();
        }
      }

      const vToMEdges = (layer.graph?.edges || []).filter(edge => {
        // Find the source port's definition
        const fromEffect = layer.effects.find(e => e.id === edge.fromNodeId);
        const fromType = (edge.fromNodeId === 'source') ? layer.source.type : (fromEffect ? fromEffect.type : edge.fromNodeId.split('_')[0]);
        const fromPortDef = (PORT_DEFS[fromType] || []).find(p => p.id === edge.fromPort);

        // Find the target port's definition
        const targetEffect = layer.effects.find(e => e.id === edge.toNodeId);
        const targetType = (edge.toNodeId === '__output__') ? '__OUTPUT__' : (targetEffect ? targetEffect.type : edge.toNodeId.split('_')[0]);
        const targetPortDef = (PORT_DEFS[targetType] || []).find(p => p.id === edge.toPort);

        // Only perform GPU analysis if the source is a video signal and the target is a modulation input
        const isVideoSrc = fromPortDef?.signalType === 'video' || fromPortDef?.signalType === 'red' || fromPortDef?.signalType === 'green' || fromPortDef?.signalType === 'blue';
        const isModTarget = targetPortDef?.signalType === 'modulation';

        return isVideoSrc && isModTarget;
      });

      vToMEdges.forEach(edge => {
        const srcTex = this.getTextureForNode(edge.fromNodeId, edge.fromPort);
        const analysisKey = `${edge.fromNodeId}.${edge.fromPort}`;

        // Skip if buffer is currently being mapped by CPU
        if (this.analysisBusy.has(analysisKey)) return;

        if (srcTex) {
          let readbackBuf = this.analysisReadbackBuffers.get(analysisKey);
          if (!readbackBuf) {
            readbackBuf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            this.analysisReadbackBuffers.set(analysisKey, readbackBuf);
          }

          let weightBuf = this.analysisWeightBuffers.get(analysisKey);
          if (!weightBuf) {
            weightBuf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            this.analysisWeightBuffers.set(analysisKey, weightBuf);
          }

          const pass = commandEncoder.beginRenderPass({ colorAttachments: [{ view: this.lumaAnalysisTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
          let weights = [0.299, 0.587, 0.114, 0];
          if (edge.fromPort === 'r_out') weights = [1, 0, 0, 0];
          else if (edge.fromPort === 'g_out') weights = [0, 1, 0, 0];
          else if (edge.fromPort === 'b_out') weights = [0, 0, 1, 0];

          this.device.queue.writeBuffer(weightBuf, 0, new Float32Array(weights));
          const bg = this.device.createBindGroup({ layout: this.lumaAnalysisPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: weightBuf } }, { binding: 1, resource: srcTex.createView() }, { binding: 2, resource: this.sampler }] });
          pass.setPipeline(this.lumaAnalysisPipeline); pass.setBindGroup(0, bg); pass.draw(3); pass.end();

          commandEncoder.copyTextureToBuffer({ texture: this.lumaAnalysisTexture }, { buffer: readbackBuf }, [1, 1]);

          this.analysisBusy.add(analysisKey);
          pendingReadbacks.push({ buf: readbackBuf, key: analysisKey });
        }
      });
    });

    const finalBlitBindGroup = this.device.createBindGroup({
      layout: this.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.masterFBO.createView() },
        { binding: 1, resource: this.sampler }
      ]
    });

    if (this.externalContext && this.externalCanvas) {
      // Priority 1: External Show Output (Projector / Secondary Device)
      // Rendered directly from masterFBO and submitted to GPU queue immediately with highest priority.
      try {
        const extCanvasPass = commandEncoder.beginRenderPass({
          colorAttachments: [{
            view: this.externalContext.getCurrentTexture().createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });
        extCanvasPass.setPipeline(this.blitPipeline);
        extCanvasPass.setBindGroup(0, finalBlitBindGroup);
        extCanvasPass.draw(3);
        extCanvasPass.end();
      } catch (err) {
        // External canvas may be resizing or detached
      }

      this.device.queue.submit([commandEncoder.finish()]);

      // Priority 2: Workspace Preview
      // Rendered on an independent command buffer so DXGI presentation locks between monitors
      // are completely decoupled. The workspace preview never stalls the external show output.
      try {
        const previewEncoder = this.device.createCommandEncoder();
        const canvasPass = previewEncoder.beginRenderPass({
          colorAttachments: [{
            view: this.context.getCurrentTexture().createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }]
        });
        canvasPass.setPipeline(this.blitPipeline);
        canvasPass.setBindGroup(0, finalBlitBindGroup);
        canvasPass.draw(3);
        canvasPass.end();
        this.device.queue.submit([previewEncoder.finish()]);
      } catch (err) {
        // Main canvas error or resizing
      }
    } else {
      // Standard Single-Display Presentation
      const canvasPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }]
      });
      canvasPass.setPipeline(this.blitPipeline);
      canvasPass.setBindGroup(0, finalBlitBindGroup);
      canvasPass.draw(3);
      canvasPass.end();

      this.device.queue.submit([commandEncoder.finish()]);
    }

    // Defer mapAsync until AFTER queue submission to prevent GPU pipeline stall
    pendingReadbacks.forEach(({ buf, key }) => {
      buf.mapAsync(GPUMapMode.READ).then(() => {
        if (this._isDestroyed) return;
        const data = new Float32Array(buf.getMappedRange());
        this.latestLumaValues[key] = data[0];
        buf.unmap();
        this.analysisBusy.delete(key);
      }).catch(() => {
        this.analysisBusy.delete(key);
      });
    });
  }

  public destroy() {
    this._isDestroyed = true;
    this.isRunning = false;
    this.externalCanvas = null;
    this.externalContext = null;
    if (this.animationHost && !this.animationHost.closed && typeof this.animationHost.cancelAnimationFrame === 'function') {
      try { this.animationHost.cancelAnimationFrame(this.animationFrameId); } catch (e) {}
    } else if (typeof cancelAnimationFrame === 'function') {
      try { cancelAnimationFrame(this.animationFrameId); } catch (e) {}
    }
    this.animationHost = null;
    if (this.masterFBO) this.masterFBO.destroy();
    if (this.layerFBO_A) this.layerFBO_A.destroy();
    if (this.layerFBO_B) this.layerFBO_B.destroy();
    if (this.blankTexture) this.blankTexture.destroy();
    Object.values(this.prevFrameFBOs).forEach(fbo => fbo.destroy());
    Object.values(this.dataMoshHistoryA).forEach(t => t.destroy());
    Object.values(this.dataMoshHistoryB).forEach(t => t.destroy());
    Object.values(this.dataMoshPrevInput).forEach(t => t.destroy());
    this.dataMoshHistoryA = {};
    this.dataMoshHistoryB = {};
    this.dataMoshPrevInput = {};
    this.dataMoshInitialized = {};
    this.dataMoshLastTime = {};
    this.dataMoshBiasAccum = {};
    Object.values(this.fpHistoryA).forEach(t => t.destroy());
    Object.values(this.fpHistoryB).forEach(t => t.destroy());
    Object.values(this.fpFrozenTex).forEach(t => t.destroy());
    this.fpHistoryA = {};
    this.fpHistoryB = {};
    this.fpFrozenTex = {};
    this.fpWasFrozen = {};
    this.fpInitialized = {};
    this.mediaManager.dispose();
    this.simulationPipeline.reset();
    this.analysisReadbackBuffers.forEach(buf => buf.destroy());
    this.analysisReadbackBuffers.clear();
    this.analysisWeightBuffers.clear();
    this.waterfallHistory.forEach(h => h.texture.destroy());
    this.waterfallHistory.clear();
    this.grassDepthTextures.forEach(t => t.destroy());
    this.grassDepthTextures.clear();
    this.grassPingPong.clear();
    this.grassGrowthAccum.clear();
    this.grassLastTime.clear();
    this.grassWindPhase.clear();
    this.grassTuftCooldown.clear();
    this.grassBandEnv.clear();
    this.grassHfBaseline.clear();
    this.grassPruneCooldown.clear();
    this.arabesqueSims.clear();
    this.arabesqueLastTime.clear();
  }

  private renderShapeSource(layer: LayerState, nodeId: string, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const src = (nodeId === 'source' ? layer.source : layer.effects.find(e => e.id === nodeId)) as ShapeGeneratorSource;
    if (!src) return;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
    });

    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.uniforms`, 80);
    const buf = new ArrayBuffer(80);

    const shapeTypeMap: Record<string, number> = { rectangle: 0, ellipse: 1, polygon: 2 };
    const u32 = new Uint32Array(buf);
    u32[0] = shapeTypeMap[src.shapeType] || 0;
    u32[1] = src.strokeMode === 'hollow' ? 1 : 0;

    const f32 = new Float32Array(buf);
    f32[2] = src.strokeThreshold ?? 0.1;
    f32[3] = Math.max(0, Math.min(1, this.getEffectiveParam(layer, nodeId, 'morph', src.morph ?? 0, timeSec)));

    let baseColor = src.fillColor ?? [1, 1, 1, 1];
    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
    if (pal && pal.colors.length > 0) {
      baseColor = [pal.colors[0][0], pal.colors[0][1], pal.colors[0][2], pal.colors[0][3] ?? 1.0];
    }

    const fillR = Math.max(0, Math.min(1, this.getEffectiveParam(layer, nodeId, 'fill_r', baseColor[0], timeSec)));
    const fillG = Math.max(0, Math.min(1, this.getEffectiveParam(layer, nodeId, 'fill_g', baseColor[1], timeSec)));
    const fillB = Math.max(0, Math.min(1, this.getEffectiveParam(layer, nodeId, 'fill_b', baseColor[2], timeSec)));
    const fillA = Math.max(0, Math.min(1, this.getEffectiveParam(layer, nodeId, 'fill_a', baseColor[3], timeSec)));
    f32.set([fillR, fillG, fillB, fillA], 4); // index 4..7

    f32[8] = this.getEffectiveParam(layer, nodeId, 'edgeSoftness', src.edgeSoftness, timeSec);
    const rawSidesSig = this.getEffectiveParam(layer, nodeId, 'sides', 0, timeSec);
    const mappedSidesSig = Math.sign(rawSidesSig) * Math.pow(Math.abs(rawSidesSig), 2) * 29;
    f32[9] = Math.max(3, (src.sides ?? 3) + mappedSidesSig);

    f32[10] = this.getEffectiveParam(layer, nodeId, 'roundness', src.roundness ?? 0, timeSec);
    f32[11] = this.getEffectiveParam(layer, nodeId, 'convexity', src.convexity ?? 0, timeSec);

    const rotModVal = this.getEffectiveParam(layer, nodeId, 'rotation', 0, timeSec);
    f32[12] = (src.rotation ?? 0) + rotModVal * 360.0;

    f32[13] = this.getEffectiveParam(layer, nodeId, 'strokeWidth', src.strokeWidth ?? 0, timeSec);
    f32[14] = this.canvas.width / this.canvas.height;
    f32[15] = this.getEffectiveParam(layer, nodeId, 'scale', src.scale ?? 1, timeSec);

    f32[16] = this.getEffectiveParam(layer, nodeId, 'x', src.x ?? 0, timeSec);
    f32[17] = this.getEffectiveParam(layer, nodeId, 'y', src.y ?? 0, timeSec);

    this.device.queue.writeBuffer(uniformBuffer, 0, buf);
    const bindGroup = this.device.createBindGroup({ layout: this.shapePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }] });
    pass.setPipeline(this.shapePipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
    pass.end();
  }


  private renderVideoEffect(layer: LayerState, nodeId: string, source: AnySource, target: GPUTexture, commandEncoder: GPUCommandEncoder) {
    const media = this.manageMediaSource(nodeId, { ...source, _layerAudioMuted: layer.audioMuted } as any);
    if (!media) return;

    const width = (media as any).videoWidth || (media as any).width || 0;
    const height = (media as any).videoHeight || (media as any).height || 0;
    if (width <= 0 || height <= 0) return;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
    });

    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.media_uniforms`, 16);
    const fitMap: Record<string, number> = { cover: 0, contain: 1, fill: 2 };
    const isMirrored = Boolean((source as any).mirror);
    const f32 = new Float32Array([fitMap[(source as any).objectFit] ?? 0, width / height, this.canvas.width / this.canvas.height, isMirrored ? 1 : 0]);
    this.device.queue.writeBuffer(uniformBuffer, 0, f32);

    if (media instanceof HTMLVideoElement && media.readyState >= 2) {
      try {
        const videoTex = this.device.importExternalTexture({ source: media });
        const bindGroup = this.device.createBindGroup({ layout: this.videoPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: videoTex }, { binding: 2, resource: this.sampler }] });
        pass.setPipeline(this.videoPipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
      } catch (e) { }
    } else if (media instanceof ImageBitmap) {
      let mediaTex = this.mediaTextures[nodeId];
      if (!mediaTex || mediaTex.width !== width || mediaTex.height !== height) {
        if (mediaTex) mediaTex.destroy();
        mediaTex = this.device.createTexture({ size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        this.mediaTextures[nodeId] = mediaTex;
      }
      this.device.queue.copyExternalImageToTexture({ source: media }, { texture: mediaTex }, [width, height]);
      const bindGroup = this.device.createBindGroup({ layout: this.mediaPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: mediaTex.createView() }, { binding: 2, resource: this.sampler }] });
      pass.setPipeline(this.mediaPipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
    }
    pass.end();
  }

  private renderImageCueSource(layer: LayerState, nodeId: string, target: GPUTexture, _timeSec: number, commandEncoder: GPUCommandEncoder) {
    const src = (nodeId === 'source' ? layer.source : layer.effects.find(e => e.id === nodeId)) as ImageCueSource;
    if (!src) return;

    // Determine current and prev image URLs
    let currentUrl = src.currentImageUrl;
    if (!currentUrl) {
      if (src.playbackMode === 'directory') {
        currentUrl = src.files?.[src.activeDirIndex ?? 0];
      } else {
        const activeBank = src.banks?.[src.activeBankIndex ?? 0];
        if (activeBank && activeBank.images && activeBank.images.length > 0) {
          currentUrl = activeBank.images[activeBank.activeImageIndex ?? 0];
        }
      }
    }

    const mgr = ImageCueManager.getInstance();
    const bmpCurr = mgr.getBitmap(currentUrl);

    // If a transition is active and prevImageUrl exists, fetch it
    const prevUrl = src.prevImageUrl;
    const bmpPrev = (src.transitionType !== 'cut' && prevUrl) ? mgr.getBitmap(prevUrl) : null;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    const texKey = `${layer.id}.${nodeId}`;
    let texCurr = this.cueTexturesCurrent[texKey];
    if (!bmpCurr && !texCurr) {
      pass.end();
      return;
    }
    const wCurr = bmpCurr ? bmpCurr.width : texCurr.width;
    const hCurr = bmpCurr ? bmpCurr.height : texCurr.height;
    if (bmpCurr) {
      if (!texCurr || texCurr.width !== wCurr || texCurr.height !== hCurr) {
        if (texCurr) texCurr.destroy();
        texCurr = this.device.createTexture({
          size: [wCurr, hCurr],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.cueTexturesCurrent[texKey] = texCurr;
        this.cueLastBitmapCurrent[texKey] = undefined as any;
      }
      if (this.cueLastBitmapCurrent[texKey] !== bmpCurr) {
        this.device.queue.copyExternalImageToTexture({ source: bmpCurr }, { texture: texCurr }, [wCurr, hCurr]);
        this.cueLastBitmapCurrent[texKey] = bmpCurr;
      }
    }
    /* unused block start:
      pass.end();
      return;
    }

    // (wCurr handled above)
    // (hCurr handled above)

    // Ensure current texture
    const texKey = `${layer.id}.${nodeId}`;
    let texCurr = this.cueTexturesCurrent[texKey];
    if (!texCurr || texCurr.width !== wCurr || texCurr.height !== hCurr) {
      if (texCurr) texCurr.destroy();
      texCurr = this.device.createTexture({
        size: [wCurr, hCurr],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.cueTexturesCurrent[texKey] = texCurr;
    }
    unused block end */

    // Ensure prev texture
    let texPrev = this.cueTexturesPrev[texKey];
    let wPrev = wCurr;
    let hPrev = hCurr;

    if (bmpPrev) {
      wPrev = bmpPrev.width;
      hPrev = bmpPrev.height;
      if (!texPrev || texPrev.width !== wPrev || texPrev.height !== hPrev) {
        if (texPrev) texPrev.destroy();
        texPrev = this.device.createTexture({
          size: [wPrev, hPrev],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.cueTexturesPrev[texKey] = texPrev;
      }
      if (this.cueLastBitmapPrev[texKey] !== bmpPrev) {
        this.device.queue.copyExternalImageToTexture({ source: bmpPrev }, { texture: texPrev }, [wPrev, hPrev]);
        this.cueLastBitmapPrev[texKey] = bmpPrev;
      }
    } else {
      texPrev = texCurr;
    }

    // Transition progress
    let p = 1.0;
    if (src.transitionType !== 'cut' && src.transitionStartTime) {
      const elapsed = (Date.now() - src.transitionStartTime) / 1000;
      p = Math.min(1.0, elapsed / Math.max(0.001, src.transitionDuration || 0.5));
    }

    const fitMap: Record<string, number> = { fill: 0, cover: 1, contain: 2, center: 3 };
    const transMap: Record<string, number> = { cut: 0, crossfade: 1, fade_black: 2 };

    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.cue_uniforms`, 32);
    const u32 = new Uint32Array(8);
    const f32 = new Float32Array(u32.buffer);

    u32[0] = fitMap[src.objectFit ?? 'fill'] ?? 0;
    u32[1] = transMap[src.transitionType ?? 'cut'] ?? 0;
    f32[2] = p;
    f32[3] = this.canvas.width / this.canvas.height;
    f32[4] = wCurr / hCurr;
    f32[5] = wPrev / hPrev;
    f32[6] = this.canvas.width / wCurr;
    f32[7] = this.canvas.width / wPrev;
    // f32[6..7] set above

    this.device.queue.writeBuffer(uniformBuffer, 0, u32.buffer);

    const bindGroup = this.device.createBindGroup({
      layout: this.imageCuePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: texCurr.createView() },
        { binding: 2, resource: texPrev.createView() },
        { binding: 3, resource: this.sampler }
      ]
    });

    pass.setPipeline(this.imageCuePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  private renderTextCueSource(layer: LayerState, nodeId: string, target: GPUTexture, commandEncoder: GPUCommandEncoder) {
    const src = (nodeId === 'source' ? layer.source : layer.effects.find(e => e.id === nodeId)) as TextCueSource;
    if (!src) return;

    let activeText = src.currentText;
    if (!activeText) {
      const activeBank = src.banks?.[src.activeBankIndex ?? 0];
      activeText = activeBank?.cards?.[activeBank?.activeCardIndex ?? 0]?.text ?? '';
    }

    const texKey = `${layer.id}.${nodeId}`;
    const w = Math.max(64, this.canvas.width || 1280);
    const h = Math.max(64, this.canvas.height || 720);
    const { canvas: textCanvas, dirty } = TextCueRenderer.getInstance().renderToCanvas(texKey, activeText || '', w, h);

    let gpuTex = this.textCueTextures[texKey];
    let needsUpload = dirty;
    if (!gpuTex || gpuTex.width !== w || gpuTex.height !== h) {
      if (gpuTex) gpuTex.destroy();
      gpuTex = this.device.createTexture({
        size: [w, h],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.textCueTextures[texKey] = gpuTex;
      needsUpload = true;
    }

    if (needsUpload) {
      this.device.queue.copyExternalImageToTexture({ source: textCanvas }, { texture: gpuTex }, [w, h]);
    }

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    const bindGroup = this.device.createBindGroup({
      layout: this.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: gpuTex.createView() },
        { binding: 1, resource: this.sampler }
      ]
    });

    pass.setPipeline(this.blitPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  public getConnectedTextSource(layer: LayerState, nodeId: string, portName: string = 'text_in'): any {
    const edge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === portName);
    if (!edge) return null;
    if (edge.fromNodeId === 'source' && layer.source.type === 'TextCue') {
      const src = layer.source as TextCueSource;
      const activeBank = src.banks?.[src.activeBankIndex ?? 0];
      const resolvedText = (src.currentText && src.currentText.length > 0)
        ? src.currentText
        : (activeBank?.cards?.[activeBank?.activeCardIndex ?? 0]?.text ?? '');
      return { ...src, currentText: resolvedText };
    }
    const effect = layer.effects.find(e => e.id === edge.fromNodeId);
    if (!effect) return null;
    if (effect.type === 'TextCue') {
      const src = effect as TextCueSource;
      const activeBank = src.banks?.[src.activeBankIndex ?? 0];
      const resolvedText = (src.currentText && src.currentText.length > 0)
        ? src.currentText
        : (activeBank?.cards?.[activeBank?.activeCardIndex ?? 0]?.text ?? '');
      return { ...src, currentText: resolvedText };
    }
    if (effect.type === 'TextMaker') {
      const tm = effect as TextMakerEffect;
      const rt = this.textMakerRuntime.get(`${layer.id}.${tm.id}`);
      const durMs = Math.max(50, (tm.transitionDuration ?? 0.6) * 1000);
      const transitionProgress =
        tm.transitionMode === 'cut' || !rt?.lastStepTime
          ? 1.0
          : Math.min(1.0, (Date.now() - rt.lastStepTime) / durMs);
      return {
        ...tm,
        currentText: rt?.currentText ?? tm.localText ?? '',
        prevText: rt?.prevText ?? '',
        lastStepTime: rt?.lastStepTime ?? 0,
        stepCount: rt?.stepCount ?? 0,
        transitionMode: tm.transitionMode,
        transitionDuration: tm.transitionDuration,
        transitionProgress,
        styleRecipe: {
          fontFamily: tm.fontFamily,
          fontSize: tm.fontSize,
          stretchMode: tm.stretchMode,
          textAlign: tm.textAlign,
          letterSpacing: tm.letterSpacing,
          lineHeight: tm.lineHeight,
          allCaps: tm.allCaps,
          headerOverrideEnabled: tm.headerOverrideEnabled,
          headerScale: tm.headerScale,
          headerColor: tm.headerColor,
          textColor: tm.textColor,
          textColorB: tm.textColorB,
          colorFillMode: tm.colorFillMode,
          gradientDirection: tm.gradientDirection,
          colorCycleSpeed: tm.colorCycleSpeed,
          outlineEnabled: tm.outlineEnabled,
          outlineWidth: tm.outlineWidth,
          outlineColor: tm.outlineColor,
          shadowEnabled: tm.shadowEnabled,
          shadowAmount: tm.shadowAmount,
          shadowAngle: tm.shadowAngle,
          shadowColor: tm.shadowColor,
          extrudeEnabled: tm.extrudeEnabled,
          extrudeAmount: tm.extrudeAmount,
          extrudeAngle: tm.extrudeAngle,
          extrudeColor: tm.extrudeColor,
          glowEnabled: tm.glowEnabled,
          glowAmount: tm.glowAmount,
          glowColor: tm.glowMatchTextColor ? (tm.textColor || [1.0, 1.0, 1.0, 1.0]) : (tm.glowColor || [0.2, 0.7, 1.0, 1.0]),
          glowMatchTextColor: tm.glowMatchTextColor
        },
        stylizedTexture: this.getTextureForNode(tm.id, 'text_out')
      };
    }
    return null;
  }

  private renderTextMaker(
    layer: LayerState,
    nodeId: string,
    ef: TextMakerEffect,
    target: GPUTexture,
    timeSec: number,
    commandEncoder: GPUCommandEncoder
  ) {
    const texKey = `${layer.id}.${nodeId}`;
    const extSource = this.getConnectedTextSource(layer, nodeId, 'text_in');
    const hasExt = extSource !== null;
    const incomingText: string = hasExt ? (extSource.currentText ?? '') : (ef.localText ?? '');
    const extStepCount: number = extSource?.stepCount ?? 0;

    let rt = this.textMakerRuntime.get(texKey);
    if (!rt) {
      rt = {
        currentText: incomingText,
        prevText: '',
        lastStepTime: 0,
        stepCount: 0,
        lastSeenExtStep: extStepCount,
        lastManualTrig: ef.manualTriggerTime ?? 0,
        lastWipeTrig: 0,
        scrollAccum: 0,
        lastTimeSec: timeSec,
        hadExternalText: hasExt
      };
      this.textMakerRuntime.set(texKey, rt);
    }

    const dt = Math.max(0, Math.min(0.1, timeSec - rt.lastTimeSec));
    rt.lastTimeSec = timeSec;
    rt.scrollAccum = (((rt.scrollAccum + dt * (ef.scrollSpeed ?? 0.4) * 0.25) % 1.0) + 1.0) % 1.0;

    const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
    const wipeTrigVal = latestSignals[`${nodeId}.wipe_trig`] ?? 0;
    const isWipeRising = wipeTrigVal > 0.5 && rt.lastWipeTrig <= 0.5;
    rt.lastWipeTrig = wipeTrigVal;

    const curManualTrig = ef.manualTriggerTime ?? 0;
    const isManualRising = curManualTrig > rt.lastManualTrig;
    rt.lastManualTrig = curManualTrig;

    if (hasExt !== rt.hadExternalText) {
      // Immediately override default localText when an external text source is connected or disconnected
      rt.hadExternalText = hasExt;
      rt.currentText = incomingText;
      rt.prevText = incomingText;
      rt.lastStepTime = 0;
      rt.lastSeenExtStep = extStepCount;
    } else if (incomingText !== rt.currentText || extStepCount !== rt.lastSeenExtStep) {
      rt.prevText = rt.currentText;
      rt.currentText = incomingText;
      rt.lastStepTime = Date.now();
      rt.stepCount += 1;
      rt.lastSeenExtStep = extStepCount;
    } else if (isWipeRising || isManualRising) {
      rt.lastStepTime = Date.now();
      rt.stepCount += 1;
      rt.scrollAccum = 0;
    }

    const durMs = Math.max(50, (ef.transitionDuration ?? 0.6) * 1000);
    const transitionProgress =
      ef.transitionMode === 'cut' || rt.lastStepTime === 0
        ? 1.0
        : Math.min(1.0, (Date.now() - rt.lastStepTime) / durMs);

    const w = Math.max(64, this.canvas.width || 1280);
    const h = Math.max(64, this.canvas.height || 720);

    const currGlyph = TextMakerRenderer.getInstance().renderGlyphMask(
      `${texKey}.curr`,
      rt.currentText,
      ef,
      w,
      h,
      transitionProgress
    );
    const prevGlyph = TextMakerRenderer.getInstance().renderGlyphMask(
      `${texKey}.prev`,
      rt.prevText,
      ef,
      w,
      h,
      1.0
    );

    let currGpuTex = this.textMakerCurrGlyphTex[texKey];
    let needCurrUpload = currGlyph.dirty;
    if (!currGpuTex || currGpuTex.width !== w || currGpuTex.height !== h) {
      if (currGpuTex) currGpuTex.destroy();
      currGpuTex = this.device.createTexture({
        size: [w, h],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.textMakerCurrGlyphTex[texKey] = currGpuTex;
      needCurrUpload = true;
    }
    if (needCurrUpload) {
      this.device.queue.copyExternalImageToTexture({ source: currGlyph.canvas }, { texture: currGpuTex }, [w, h]);
    }

    let prevGpuTex = this.textMakerPrevGlyphTex[texKey];
    let needPrevUpload = prevGlyph.dirty;
    if (!prevGpuTex || prevGpuTex.width !== w || prevGpuTex.height !== h) {
      if (prevGpuTex) prevGpuTex.destroy();
      prevGpuTex = this.device.createTexture({
        size: [w, h],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.textMakerPrevGlyphTex[texKey] = prevGpuTex;
      needPrevUpload = true;
    }
    if (needPrevUpload) {
      this.device.queue.copyExternalImageToTexture({ source: prevGlyph.canvas }, { texture: prevGpuTex }, [w, h]);
    }

    // ── STAGE 1: Render Stationary Stylized Plate (text_out) ──
    const plateTex = this.ensureTexture(nodeId, 'text_out');
    const s1 = new Float32Array(64);

    const transMap: Record<string, number> = {
      cut: 0,
      crossfade: 1,
      fade_out_in: 2,
      typewriter: 3,
      wipe_lr: 4,
      venetian: 5,
      slide_up: 6
    };
    const fillMap: Record<string, number> = {
      solid: 0,
      gradient: 1,
      color_cycle: 2,
      line_step: 3
    };
    const gradDirMap: Record<string, number> = {
      line_vertical: 0,
      block_vertical: 1,
      horizontal: 2
    };

    const aspect = w / h;
    const modGlow = Math.max(0, Math.min(1.5, this.getEffectiveParam(layer, nodeId, 'glow_cv', ef.glowAmount ?? 0.4, timeSec)));
    const modShadow = Math.max(0, Math.min(1.5, this.getEffectiveParam(layer, nodeId, 'shadow_cv', ef.shadowAmount ?? 0.45, timeSec)));
    const modExtrude = Math.max(0, Math.min(1.5, this.getEffectiveParam(layer, nodeId, 'extrude_cv', ef.extrudeAmount ?? 0.35, timeSec)));
    const modColorCv = this.getEffectiveParam(layer, nodeId, 'color_cv', 0.0, timeSec);
    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');

    // params0: [aspect, timeSec, transitionMode, transitionProgress]
    s1[0] = aspect;
    s1[1] = timeSec;
    s1[2] = transMap[ef.transitionMode ?? 'crossfade'] ?? 1;
    s1[3] = transitionProgress;

    // params1: [colorFillMode, gradientDir, colorCycleSpeed, colorCv]
    s1[4] = fillMap[ef.colorFillMode ?? 'solid'] ?? 0;
    s1[5] = gradDirMap[ef.gradientDirection ?? 'line_vertical'] ?? 0;
    s1[6] = ef.colorCycleSpeed ?? 0.5;
    s1[7] = modColorCv;

    // params2: [headerOverrideEnabled, headerSplitV, startV, lineStepV]
    s1[8] = ef.headerOverrideEnabled ? 1.0 : 0.0;
    s1[9] = currGlyph.metrics.headerSplitV;
    s1[10] = currGlyph.metrics.startV;
    s1[11] = currGlyph.metrics.lineStepV;

    // bounds: [minU, minV, maxU, maxV]
    s1.set(currGlyph.metrics.bounds, 12);

    // edgeFlags: [outlineEnabled, outlineWidth, shadowEnabled, shadowAmount]
    s1[16] = ef.outlineEnabled !== false ? 1.0 : 0.0;
    s1[17] = ef.outlineWidth ?? 0.25;
    s1[18] = ef.shadowEnabled !== false ? 1.0 : 0.0;
    s1[19] = modShadow;

    // edgeParams: [shadowAngleRad, extrudeEnabled, extrudeAmount, extrudeAngleRad]
    s1[20] = ((ef.shadowAngle ?? 135) * Math.PI) / 180.0;
    s1[21] = ef.extrudeEnabled ? 1.0 : 0.0;
    s1[22] = modExtrude;
    s1[23] = ((ef.extrudeAngle ?? 135) * Math.PI) / 180.0;

    // glowParams: [glowEnabled, glowAmount, useCustomPalette, palCount]
    s1[24] = ef.glowEnabled ? 1.0 : 0.0;
    s1[25] = modGlow;
    s1[26] = pal ? 1.0 : 0.0;
    s1[27] = pal ? pal.count : 0.0;

    // palMeta: [palInterpolation, lineCount, 0, 0]
    s1[28] = pal ? pal.interpolation : 0.0;
    s1[29] = currGlyph.metrics.lineCount;
    s1[30] = 0.0;
    s1[31] = 0.0;

    s1.set(ef.textColor || [1, 1, 1, 1], 32);
    s1.set(ef.textColorB || [0.35, 0.75, 1, 1], 36);
    s1.set(ef.headerColor || [1, 0.85, 0.1, 1], 40);
    s1.set(ef.outlineColor || [0.05, 0.05, 0.08, 1], 44);
    s1.set(ef.shadowColor || [0, 0, 0, 0.85], 48);
    s1.set(ef.extrudeColor || [0.15, 0.25, 0.55, 1], 52);
    const effectiveGlow = ef.glowMatchTextColor ? (ef.textColor || [1, 1, 1, 1]) : (ef.glowColor || [0.2, 0.7, 1, 1]);
    s1.set(effectiveGlow, 56);

    // Wait: we need 8 palColors (32 floats) + 2 palPositions (8 floats) -> total 60 + 40 = 100 floats (400 bytes)!
    // Let's allocate 400 bytes (100 floats) for Stage1Uniforms!
    const stage1FullBuf = this.getUniformBuffer(`${texKey}.stage1_full_uniforms`, 416);
    const s1Full = new Float32Array(100);
    s1Full.set(s1.subarray(0, 60), 0);

    if (pal) {
      for (let i = 0; i < 8; i++) {
        s1Full[60 + i * 4 + 0] = pal.colors[i][0];
        s1Full[60 + i * 4 + 1] = pal.colors[i][1];
        s1Full[60 + i * 4 + 2] = pal.colors[i][2];
        s1Full[60 + i * 4 + 3] = pal.colors[i][3];
      }
      for (let i = 0; i < 8; i++) {
        s1Full[92 + i] = pal.positions[i];
      }
    }

    this.device.queue.writeBuffer(stage1FullBuf, 0, s1Full);

    const pass1 = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: plateTex.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });
    const bg1 = this.device.createBindGroup({
      layout: this.textMakerStage1Pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: stage1FullBuf } },
        { binding: 1, resource: currGpuTex.createView() },
        { binding: 2, resource: prevGpuTex.createView() },
        { binding: 3, resource: this.sampler }
      ]
    });
    pass1.setPipeline(this.textMakerStage1Pipeline);
    pass1.setBindGroup(0, bg1);
    pass1.draw(3);
    pass1.end();

    // ── STAGE 2: Layout Motion + Backdrop + Genlock/Internal BG + Analog CRT FX ──
    const matteTex = this.ensureTexture(nodeId, 'matte_out');
    const stage2Buf = this.getUniformBuffer(`${texKey}.stage2_uniforms`, 192);
    const s2 = new Float32Array(44);

    const layoutMap: Record<string, number> = {
      page: 0,
      lower_third: 1,
      roll: 2,
      crawl: 3
    };
    const backdropMap: Record<string, number> = {
      none: 0,
      tight_box: 1,
      full_banner: 2,
      line_strips: 3
    };
    const bgMap: Record<string, number> = {
      transparent: 0,
      solid: 1,
      gradient: 2,
      color_bars: 3
    };

    const zone = ef.snapZone ?? 4;
    const zoneCol = (zone % 3) - 1; // -1, 0, +1
    const zoneRow = Math.floor(zone / 3) - 1; // -1, 0, +1
    const snapX = zoneCol * 0.48;
    const snapY = zoneRow * 0.52;

    const modPosX = snapX + this.getEffectiveParam(layer, nodeId, 'pos_x_cv', ef.posX ?? 0.0, timeSec);
    const modPosY = snapY + this.getEffectiveParam(layer, nodeId, 'pos_y_cv', ef.posY ?? 0.0, timeSec);

    const videoInEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'video_in');
    const videoInTex = videoInEdge ? this.getTextureForNode(videoInEdge.fromNodeId, videoInEdge.fromPort) : null;

    // layoutParams: [layoutMode, posX, posY, scrollOffset]
    s2[0] = layoutMap[ef.layoutMode ?? 'page'] ?? 0;
    s2[1] = modPosX;
    s2[2] = modPosY;
    s2[3] = rt.scrollAccum;

    // bounds: [minU, minV, maxU, maxV]
    s2.set(currGlyph.metrics.bounds, 4);

    // lineMetrics: [startV, lineStepV, lineCount, backdropMode]
    s2[8] = currGlyph.metrics.startV;
    s2[9] = currGlyph.metrics.lineStepV;
    s2[10] = currGlyph.metrics.lineCount;
    s2[11] = backdropMap[ef.backdropMode ?? 'none'] ?? 0;

    s2.set(ef.backdropColor || [0.05, 0.1, 0.35, 0.85], 12);
    s2.set(ef.backdropBorderColor || [1.0, 0.85, 0.1, 1.0], 16);

    // bgParams: [backdropBorderWidth, bgMode, hasVideoIn, aspect]
    s2[20] = ef.backdropBorderWidth ?? 0.3;
    s2[21] = bgMap[ef.bgMode ?? 'transparent'] ?? 0;
    s2[22] = videoInTex ? 1.0 : 0.0;
    s2[23] = aspect;

    s2.set(ef.bgColorA || [0.06, 0.08, 0.22, 1.0], 24);
    s2.set(ef.bgColorB || [0.02, 0.02, 0.06, 1.0], 28);

    // analogFlags: [analogFxMode (0=off, 1=on/all, 2=text_only), pixelateEnabled, chromaBleedEnabled, scanlinesEnabled]
    const fxMode = ef.analogFxMode ?? (ef.analogFxMaster === false ? 'off' : 'on');
    let fxModeVal = 1.0;
    if (fxMode === 'off') {
      fxModeVal = 0.0;
    } else if (fxMode === 'text_only') {
      fxModeVal = 2.0;
    } else {
      fxModeVal = 1.0;
    }
    s2[32] = fxModeVal;
    s2[33] = ef.pixelateEnabled !== false ? 1.0 : 0.0;
    s2[34] = ef.chromaBleedEnabled !== false ? 1.0 : 0.0;
    s2[35] = ef.scanlinesEnabled !== false ? 1.0 : 0.0;

    // analogAmounts: [pixelateAmount, chromaBleedAmount, scanlinesAmount, jitterAmount]
    s2[36] = ef.pixelateAmount ?? 0.3;
    s2[37] = ef.chromaBleedAmount ?? 0.35;
    s2[38] = ef.scanlinesAmount ?? 0.25;
    s2[39] = ef.jitterAmount ?? 0.2;

    // analogExtra: [jitterEnabled, noiseEnabled, noiseAmount, timeSec]
    s2[40] = ef.jitterEnabled ? 1.0 : 0.0;
    s2[41] = ef.noiseEnabled ? 1.0 : 0.0;
    s2[42] = ef.noiseAmount ?? 0.15;
    s2[43] = timeSec;

    this.device.queue.writeBuffer(stage2Buf, 0, s2);

    const pass2 = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: target.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store'
        },
        {
          view: matteTex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    });
    const bg2 = this.device.createBindGroup({
      layout: this.textMakerStage2Pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: stage2Buf } },
        { binding: 1, resource: plateTex.createView() },
        { binding: 2, resource: (videoInTex ?? this.blankTexture).createView() },
        { binding: 3, resource: this.sampler }
      ]
    });
    pass2.setPipeline(this.textMakerStage2Pipeline);
    pass2.setBindGroup(0, bg2);
    pass2.draw(3);
    pass2.end();
  }

  private renderNoiseSource(layer: LayerState, nodeId: string, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const src = (nodeId === 'source' ? layer.source : layer.effects.find(e => e.id === nodeId)) as NoiseVideoSource;
    if (!src) return;

    const noiseTypeMap: Record<string, number> = { white: 0, perlin: 1, simplex: 2, ridged: 3, billow: 4, worley: 5, voronoi: 6, warped: 7, fbm: 1 };
    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.noise_uniforms`, 256);
    const f32 = new Float32Array(64);

    f32[0] = this.getEffectiveParam(layer, nodeId, 'scale_cv', src.scale ?? 2.0, timeSec);
    f32[1] = this.getEffectiveParam(layer, nodeId, 'evolution_cv', src.evolution ?? 1.0, timeSec);
    f32[2] = this.getEffectiveParam(layer, nodeId, 'octaves_cv', src.octaves ?? 4, timeSec);
    f32[3] = this.getEffectiveParam(layer, nodeId, 'persistence_cv', src.persistence ?? 0.5, timeSec);
    f32[4] = this.getEffectiveParam(layer, nodeId, 'seed_cv', src.seed ?? 123, timeSec);
    f32[5] = this.getEffectiveParam(layer, nodeId, 'brightness_cv', src.brightness ?? 0, timeSec);
    f32[6] = this.getEffectiveParam(layer, nodeId, 'contrast_cv', src.contrast ?? 1, timeSec);
    f32[7] = timeSec * (src.flowSpeed ?? 1.0);

    const u32 = new Uint32Array(f32.buffer);
    u32[8] = noiseTypeMap[src.noiseType] ?? 0;
    u32[9] = src.autoAnimate ? 1 : 0;
    u32[10] = 0; // usePalette: 0 (grayscale noise)
    f32[11] = this.canvas.width / this.canvas.height;
    u32[12] = 0; // paletteCount
    u32[13] = 0; // interpolation
    f32[14] = 0; // pad0
    f32[15] = 0; // pad1

    this.device.queue.writeBuffer(uniformBuffer, 0, f32);

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });

    const bindGroup = this.device.createBindGroup({ layout: this.noiseSourcePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }] });
    pass.setPipeline(this.noiseSourcePipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
    pass.end();
  }

  private rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h, s, l];
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) return [l, l, l];
    const hue2rgb = (p: number, q: number, t: number) => {
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
  }

  private getConnectedPalette(layer: LayerState, nodeId: string, portName: string = 'palette_in'): {
    colors: number[][];
    positions: number[];
    count: number;
    interpolation: number;
  } | null {
    const edge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === portName);
    if (!edge) return null;
    const fromEffect = layer.effects.find(e => e.id === edge.fromNodeId);
    if (fromEffect && fromEffect.type === 'OpticalSensor') {
      const sigs = SignalDispatcher.getInstance().getLatestSignals(layer.id);
      const r = sigs[`${fromEffect.id}.r_out`] ?? 1.0;
      const g = sigs[`${fromEffect.id}.g_out`] ?? 1.0;
      const b = sigs[`${fromEffect.id}.b_out`] ?? 1.0;
      const colors = [[r, g, b, 1.0], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]];
      const positions = new Array(8).fill(0);
      return { colors, positions, count: 1, interpolation: 0 };
    }
    const paletteEffect = fromEffect as ColorPaletteEffect | undefined;
    if (!paletteEffect || paletteEffect.type !== 'ColorPalette' || !paletteEffect.colors || paletteEffect.colors.length === 0) {
      return null;
    }
    const sigs = SignalDispatcher.getInstance().getLatestSignals(layer.id);

    // 1. If connection comes from a discrete color channel port (e.g. col_1_out .. col_8_out), return only that single color
    if (edge.fromPort && edge.fromPort.startsWith('col_')) {
      const slotNum = edge.fromPort.replace('col_', '').replace('_out', '');
      const singleStop = paletteEffect.colors.find(c => c.id === `c_${slotNum}`) ?? paletteEffect.colors[parseInt(slotNum, 10) - 1];
      if (singleStop && singleStop.active) {
        const col = [...singleStop.color];
        const cvVal = sigs[`${paletteEffect.id}.col_${slotNum}_cv`] ?? 0;
        if (cvVal !== 0) {
          const [h, s, l] = this.rgbToHsl(col[0], col[1], col[2]);
          const effectiveS = s < 0.1 ? 0.85 : s;
          const newH = ((h + cvVal * 0.5) % 1.0 + 1.0) % 1.0;
          const [modR, modG, modB] = this.hslToRgb(newH, effectiveS, l);
          col[0] = modR;
          col[1] = modG;
          col[2] = modB;
        }
        const colors = [col, [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]];
        const positions = new Array(8).fill(0);
        return {
          colors,
          positions,
          count: 1, // Only this single color channel
          interpolation: 0
        };
      }
      return null;
    }

    // 2. Otherwise it's palette_out: return the full composite multi-stop gradient ramp
    const activeStops = paletteEffect.colors.filter(c => c.active);
    if (activeStops.length === 0) return null;

    const count = Math.min(8, activeStops.length);
    const colors: number[][] = [];

    const cycleVal = sigs[`${paletteEffect.id}.cycle_cv`] ?? 0;
    const spreadVal = sigs[`${paletteEffect.id}.spread_cv`] ?? 0;

    for (let i = 0; i < 8; i++) {
      if (i < count) {
        const stop = activeStops[i];
        const col = [...stop.color];
        const slotNum = stop.id.replace('c_', '');
        const cvVal = sigs[`${paletteEffect.id}.col_${slotNum}_cv`] ?? 0;
        if (cvVal !== 0) {
          const [h, s, l] = this.rgbToHsl(col[0], col[1], col[2]);
          const effectiveS = s < 0.1 ? 0.85 : s; // ensure hue sweep visibility on achromatic colors
          // cvVal swings hue across the spectrum while preserving luminance and saturation
          const newH = ((h + cvVal * 0.5) % 1.0 + 1.0) % 1.0;
          const [modR, modG, modB] = this.hslToRgb(newH, effectiveS, l);
          col[0] = modR;
          col[1] = modG;
          col[2] = modB;
        }
        colors.push(col);
      } else {
        colors.push([0, 0, 0, 1]);
      }
    }

    const positions = calculatePalettePositions(activeStops, spreadVal);

    // Apply cycle rotation to positions
    if (cycleVal !== 0) {
      for (let i = 0; i < count; i++) {
        positions[i] = ((positions[i] + cycleVal) % 1.0 + 1.0) % 1.0;
      }
      const paired = [];
      for (let i = 0; i < count; i++) {
        paired.push({ color: colors[i], pos: positions[i] });
      }
      paired.sort((a, b) => a.pos - b.pos);
      for (let i = 0; i < count; i++) {
        colors[i] = paired[i].color;
        positions[i] = paired[i].pos;
      }
    }

    const interpMap: Record<string, number> = { linear: 0, stepped: 1, smooth: 2 };
    const interpolation = interpMap[paletteEffect.interpolation ?? 'linear'] ?? 0;

    return { colors, positions, count, interpolation };
  }

  private renderColorNoise(layer: LayerState, nodeId: string, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const source = (nodeId === 'source') ? layer.source as ColorNoiseSource : layer.effects.find(e => e.id === nodeId) as any as ColorNoiseSource;
    const pipeline = this.colorNoisePipeline;
    const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 256);

    const noiseTypeMap: Record<string, number> = { white: 0, perlin: 1, simplex: 2, ridged: 3, billow: 4, worley: 5, voronoi: 6, warped: 7 };

    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
    const f32 = new Float32Array(64);
    f32[0] = this.getEffectiveParam(layer, nodeId, 'scale_cv', source.scale, timeSec);
    f32[1] = this.getEffectiveParam(layer, nodeId, 'evolution_cv', source.evolution, timeSec);
    f32[2] = this.getEffectiveParam(layer, nodeId, 'octaves_cv', source.octaves, timeSec);
    f32[3] = this.getEffectiveParam(layer, nodeId, 'persistence_cv', source.persistence, timeSec);
    f32[4] = this.getEffectiveParam(layer, nodeId, 'seed_cv', source.seed, timeSec);
    f32[5] = this.getEffectiveParam(layer, nodeId, 'brightness_cv', source.brightness, timeSec);
    f32[6] = this.getEffectiveParam(layer, nodeId, 'contrast_cv', source.contrast, timeSec);
    f32[7] = timeSec * source.flowSpeed;

    const u32 = new Uint32Array(f32.buffer);
    u32[8] = noiseTypeMap[source.noiseType] || 0;
    u32[9] = source.autoAnimate ? 1 : 0;
    u32[10] = pal ? 1 : 0; // usePalette: 0 = default procedural RGB noise, 1 = custom palette
    f32[11] = this.canvas.width / this.canvas.height;
    u32[12] = pal ? pal.count : 0;
    u32[13] = pal ? pal.interpolation : 0;
    f32[14] = 0;
    f32[15] = 0;

    if (pal) {
      for (let i = 0; i < 8; i++) {
        f32[16 + i * 4 + 0] = pal.colors[i][0];
        f32[16 + i * 4 + 1] = pal.colors[i][1];
        f32[16 + i * 4 + 2] = pal.colors[i][2];
        f32[16 + i * 4 + 3] = pal.colors[i][3];
      }
      for (let i = 0; i < 8; i++) {
        f32[48 + i] = pal.positions[i];
      }
    }

    this.device.queue.writeBuffer(uniformBuffer, 0, f32);

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  private getSignalValue(layer: LayerState, nodeId: string, portId: string, defaultValue: number): number {
    const signals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
    return signals[`${nodeId}.${portId}`] ?? defaultValue;
  }

  private renderCanvasBackground(
    layer: LayerState,
    nodeId: string,
    ef: CanvasBackgroundEffect,
    target: GPUTexture,
    _timeSec: number,
    commandEncoder: GPUCommandEncoder
  ) {
    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.bg_uniforms`, 288);
    const buf = new ArrayBuffer(288);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    f32.set(ef.colorA, 0);
    f32.set(ef.colorB, 4);
    f32.set(ef.colorC, 8);

    const modeMap: Record<string, number> = { solid: 0, linear: 1, radial: 2 };
    u32[12] = modeMap[ef.mode] ?? 1;
    u32[13] = ef.useThreeColors ? 1 : 0;

    const angleMod = this.getSignalValue(layer, nodeId, 'angle_cv', 0);
    const totalAngleDeg = (ef.angle ?? 0) + angleMod * 360.0;
    const angleRad = (totalAngleDeg * Math.PI) / 180.0;
    f32[14] = angleRad;

    const spreadMod = this.getSignalValue(layer, nodeId, 'spread_cv', 0);
    const spread = Math.max(0.01, Math.min(0.99, (ef.spread ?? 0.5) + spreadMod));
    f32[15] = spread;

    f32[16] = ef.radialCenterX ?? 0.5;
    f32[17] = ef.radialCenterY ?? 0.5;
    f32[18] = Math.max(0.001, ef.radialRadius ?? 0.7);

    const lumaModSig = this.getSignalValue(layer, nodeId, 'luma_cv', 0);
    const totalLuma = Math.max(-1.0, Math.min(1.0, (ef.luma ?? 0) + lumaModSig));
    f32[19] = totalLuma;

    const chromaModSig = this.getSignalValue(layer, nodeId, 'chroma_cv', 0);
    const totalChroma = Math.max(-1.0, Math.min(1.0, (ef.chroma ?? 0) + chromaModSig));
    f32[20] = totalChroma;

    f32[21] = this.canvas.width / this.canvas.height;

    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
    u32[22] = pal ? 1 : 0; // useCustomPalette
    u32[23] = pal ? pal.count : 0;
    u32[24] = pal ? pal.interpolation : 0;
    f32[25] = 0;
    f32[26] = 0;
    f32[27] = 0;

    if (pal) {
      for (let i = 0; i < 8; i++) {
        f32[28 + i * 4 + 0] = pal.colors[i][0];
        f32[28 + i * 4 + 1] = pal.colors[i][1];
        f32[28 + i * 4 + 2] = pal.colors[i][2];
        f32[28 + i * 4 + 3] = pal.colors[i][3];
      }
      for (let i = 0; i < 8; i++) {
        f32[60 + i] = pal.positions[i];
      }
    }

    this.device.queue.writeBuffer(uniformBuffer, 0, buf);

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    const bindGroup = this.device.createBindGroup({
      layout: this.canvasBackgroundPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    pass.setPipeline(this.canvasBackgroundPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  private renderSpokenWordVisualizer(layer: LayerState, nodeId: string, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const ef = layer.effects.find(e => e.id === nodeId) as SpokenWordVisualizerEffect;
    if (!ef) return;

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }]
    });

    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.spoken_uniforms`, 64);
    const buf = new ArrayBuffer(64);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);

    const modeMap: Record<string, number> = { Constellation: 0, FlowingRibbon: 1, RadialWaterfall: 2 };
    const palMap: Record<string, number> = { vibrant: 0, neon: 1, cyber: 1, warm: 2, fire: 2, monochrome: 3 };

    u32[0] = modeMap[ef.renderMode] ?? 0;
    f32[1] = this.canvas.width / this.canvas.height;
    f32[2] = timeSec;

    const sigs = SignalDispatcher.getInstance().getLatestSignals(layer.id);
    f32[3] = sigs[`${nodeId}.envelope_out`] ?? 0;
    f32[4] = sigs[`${nodeId}.cadence_out`] ?? 0;
    f32[5] = sigs[`${nodeId}.timbre_brightness`] ?? 0;
    f32[6] = sigs[`${nodeId}.timbre_flatness`] ?? 0;
    f32[7] = sigs[`${nodeId}.pitch_hz`] ?? 0;
    f32[8] = sigs[`${nodeId}.pitch_midi`] ?? 0.5;
    f32[9] = sigs[`${nodeId}.stability`] ?? 0;
    f32[10] = sigs[`${nodeId}.formant_f1`] ?? 500;
    f32[11] = sigs[`${nodeId}.formant_f2`] ?? 1500;
    f32[12] = sigs[`${nodeId}.vowel_x`] ?? 0.5;
    f32[13] = sigs[`${nodeId}.vowel_y`] ?? 0.5;
    f32[14] = sigs[`${nodeId}.onset_pulse`] ?? 0;
    u32[15] = palMap[ef.colorPalette?.toLowerCase()] ?? 0;

    this.device.queue.writeBuffer(uniformBuffer, 0, buf);
    const bindGroup = this.device.createBindGroup({
      layout: this.spokenWordPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    pass.setPipeline(this.spokenWordPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  private getFeedbackTexture(layerId: string): GPUTexture {
    return this.getPrevFrameFBO(layerId);
  }

  private renderParticleCloud(
    layer: LayerState,
    nodeId: string,
    ef: ParticleCloudEffect,
    target: GPUTexture,
    timeSec: number,
    commandEncoder: GPUCommandEncoder
  ) {
    const count = Math.max(100, Math.min(100000, Math.floor(ef.particleCount || 20000)));
    const bufferSize = count * 32; // 32 bytes per Particle struct (8 floats)
    const bufKeyA = `${layer.id}.${nodeId}.particles_a`;
    const bufKeyB = `${layer.id}.${nodeId}.particles_b`;

    const bufferA = this.getStorageBuffer(bufKeyA, bufferSize);
    const bufferB = this.getStorageBuffer(bufKeyB, bufferSize);

    // Initialize particles on first run or if count changed
    const initKey = `${layer.id}.${nodeId}.${count}`;
    if (!this.particleInitDone.has(initKey)) {
      const initialData = new Float32Array(count * 8);
      const rad = ef.emitterRadius || 0.1;
      for (let i = 0; i < count; i++) {
        const base = i * 8;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * rad;
        initialData[base + 0] = (ef.emitterX || 0) + Math.cos(angle) * r;
        initialData[base + 1] = (ef.emitterY || 0) + Math.sin(angle) * r;
        const speed = (0.2 + Math.random() * 0.5) * (ef.speed || 0.8);
        initialData[base + 2] = Math.cos(angle) * speed;
        initialData[base + 3] = Math.sin(angle) * speed;
        const maxL = Math.max(0.5, (ef.lifetime || 3.0) * (0.6 + 0.8 * Math.random()));
        initialData[base + 4] = maxL * Math.random();
        initialData[base + 5] = maxL;
        initialData[base + 6] = 0.5 + Math.random() * 0.8;
        initialData[base + 7] = Math.random();
      }
      this.device.queue.writeBuffer(bufferA, 0, initialData);
      this.device.queue.writeBuffer(bufferB, 0, initialData);
      this.particleInitDone.add(initKey);
      this.particlePingPong.set(nodeId, 0);
    }

    // Ping-pong buffer selection
    const curPing = this.particlePingPong.get(nodeId) ?? 0;
    const inBuf = curPing === 0 ? bufferA : bufferB;
    const outBuf = curPing === 0 ? bufferB : bufferA;
    this.particlePingPong.set(nodeId, 1 - curPing);

    // Timing
    const prevTime = this.particleLastTime.get(nodeId) ?? timeSec;
    const dt = Math.min(0.066, Math.max(0.001, timeSec - prevTime));
    this.particleLastTime.set(nodeId, timeSec);

    // Signals & Triggers
    const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
    const trigVal = latestSignals[`${nodeId}.trigger_in`] ?? 0;
    const lastTrig = this.lastTriggerVals.get(`${nodeId}.trigger_in`) ?? 0;
    const curManualBurst = ef.burstTriggerTime ?? 0;
    const lastManualBurst = this.lastTriggerVals.get(`${nodeId}.manualBurst`) ?? 0;
    const isBurstRising = (trigVal > 0.5 && lastTrig <= 0.5) || (curManualBurst > lastManualBurst);
    this.lastTriggerVals.set(`${nodeId}.trigger_in`, trigVal);
    this.lastTriggerVals.set(`${nodeId}.manualBurst`, curManualBurst);

    const resetVal = latestSignals[`${nodeId}.reset_in`] ?? 0;
    const curManualReset = ef.resetTriggerTime ?? 0;
    const lastManualReset = this.lastTriggerVals.get(`${nodeId}.manualReset`) ?? 0;
    const isResetRising = (resetVal > 0.5) || (curManualReset > lastManualReset);
    this.lastTriggerVals.set(`${nodeId}.manualReset`, curManualReset);

    if (isResetRising) {
      this.particleInitDone.delete(initKey);
    }

    // Audio reactivity
    let audioBass = 0.0;
    if (ef.audioReactivity !== false) {
      const edge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
      let busId = 'master';
      if (edge) {
        const sourceEffect = layer.effects.find(e => e.id === edge.fromNodeId);
        if (sourceEffect?.type === 'AudioSource') busId = (sourceEffect as any).busId || 'master';
        else if (edge.fromNodeId === 'source' || sourceEffect?.type === 'VideoFile' || sourceEffect?.type === 'AudioFile' || sourceEffect?.type === 'AudioInput' || sourceEffect?.type === 'SystemAudio') {
          const baseId = edge.fromNodeId === 'source' ? layer.id : edge.fromNodeId;
          busId = (edge.fromPort === 'ch1_out' || edge.fromPort === 'ch2_out') ? `${baseId}__${edge.fromPort}` : baseId;
        }
      }
      const busData = AudioEngine.getInstance().getBusData(busId);
      if (busData) {
        audioBass = (busData.bands?.bass || busData.peak || 0) * (ef.audioSensitivity ?? 1.0);
      }
    }

    // Effective modulated params
    const modSpeed = this.getEffectiveParam(layer, nodeId, 'speed_cv', ef.speed ?? 0.8, timeSec);
    const modTurb = this.getEffectiveParam(layer, nodeId, 'turbulence_cv', ef.turbulence ?? 1.0, timeSec);
    const modPointSize = this.getEffectiveParam(layer, nodeId, 'size_cv', ef.pointSize ?? 4.0, timeSec);
    const modGrav = this.getEffectiveParam(layer, nodeId, 'gravity_cv', ef.gravityY ?? 0.0, timeSec);
    const colorMod = this.getEffectiveParam(layer, nodeId, 'color_cv', 0, timeSec);

    const emitterShapeMap: Record<string, number> = { point: 0, ring: 1, disc: 2, line: 3 };
    const paletteMap: Record<string, number> = { neon: 0, fire: 1, aurora: 2, electric: 3, starlight: 4, spectrum: 5 };

    const aspect = target.width / target.height;

    // 1. Write Compute Uniforms
    const computeUniformBuffer = this.getUniformBuffer(`${nodeId}.compute_uniforms`, 64);
    this.device.queue.writeBuffer(computeUniformBuffer, 0, new Float32Array([
      dt,
      timeSec,
      modSpeed,
      ef.spread ?? 0.5,
      modTurb,
      ef.noiseFreq ?? 1.2,
      count,
      emitterShapeMap[ef.emitterShape ?? 'point'] ?? 0,
      ef.emitterRadius ?? 0.1,
      ef.emitterX ?? 0.0,
      ef.emitterY ?? 0.0,
      ef.gravityX ?? 0.0,
      modGrav,
      isBurstRising ? 1.0 : 0.0,
      audioBass,
      aspect
    ]));

    // 2. Compute Pass
    const computeBindGroup = this.device.createBindGroup({
      layout: this.particleComputePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: computeUniformBuffer } },
        { binding: 1, resource: { buffer: inBuf } },
        { binding: 2, resource: { buffer: outBuf } }
      ]
    });

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.particleComputePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(count / 64));
    computePass.end();

    // 3. Render Pass
    const renderUniformBuffer = this.getUniformBuffer(`${nodeId}.render_uniforms`, 256);
    const basePaletteIdx = paletteMap[ef.colorPalette ?? 'neon'] ?? 0;
    const finalPaletteIdx = (basePaletteIdx + colorMod * 6.0 + 60.0) % 6.0;

    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
    const renderF32 = new Float32Array(64);
    renderF32[0] = aspect;
    renderF32[1] = finalPaletteIdx;
    renderF32[2] = modPointSize;
    renderF32[3] = 1.0;
    renderF32[4] = pal ? 1.0 : 0.0; // useCustomPalette
    renderF32[5] = pal ? pal.count : 0.0;
    renderF32[6] = pal ? pal.interpolation : 0.0;
    renderF32[7] = 0.0;

    if (pal) {
      for (let i = 0; i < 8; i++) {
        renderF32[8 + i * 4 + 0] = pal.colors[i][0];
        renderF32[8 + i * 4 + 1] = pal.colors[i][1];
        renderF32[8 + i * 4 + 2] = pal.colors[i][2];
        renderF32[8 + i * 4 + 3] = pal.colors[i][3];
      }
      for (let i = 0; i < 8; i++) {
        renderF32[40 + i] = pal.positions[i];
      }
    }

    this.device.queue.writeBuffer(renderUniformBuffer, 0, renderF32);

    const renderPipeline = ef.blendMode === 'alpha' ? this.particleRenderAlphaPipeline : this.particleRenderAdditivePipeline;

    const renderBindGroup = this.device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: renderUniformBuffer } },
        { binding: 1, resource: { buffer: outBuf } }
      ]
    });

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderBindGroup);
    pass.draw(6, count);
    pass.end();
  }

  private renderGrassField(
    layer: LayerState,
    nodeId: string,
    ef: GrassFieldEffect,
    target: GPUTexture,
    timeSec: number,
    commandEncoder: GPUCommandEncoder
  ) {
    const prevTime = this.grassLastTime.get(nodeId) ?? timeSec;
    const dt = Math.min(0.1, Math.max(0.001, timeSec - prevTime));
    this.grassLastTime.set(nodeId, timeSec);

    const totalBlades = 16384;
    const bladeByteSize = 80;
    const bufferSize = totalBlades * bladeByteSize;

    const ping = this.grassPingPong.get(nodeId) ?? 0;
    const inBufKey = `${nodeId}.grass_v3_buf_${ping}`;
    const outBufKey = `${nodeId}.grass_v3_buf_${1 - ping}`;
    const inBuf = this.getStorageBuffer(inBufKey, bufferSize);
    const outBuf = this.getStorageBuffer(outBufKey, bufferSize);
    this.grassPingPong.set(nodeId, 1 - ping);

    const dustCount = 2048;
    const dustByteSize = 48;
    const dustBuf = this.getStorageBuffer(`${nodeId}.grass_dust_buf`, dustCount * dustByteSize);

    // 1. Audio Connection & DSP Extraction
    const audioEngine = AudioEngine.getInstance();
    const { isAudioConnected, busId, busData } = this.resolveConnectedAudioBus(layer, nodeId);

    const audioRms = busData?.rms ?? 0;
    const audioPeak = busData?.peak ?? 0;
    const busBass = busData?.bands?.bass ?? 0;
    const audioOnset = busData?.onset ?? false;

    // Band-limited RMS envelope for organic growth & germination rate
    const { minHz: growthMinHz, maxHz: growthMaxHz } = resolveGrowthBandHz(ef.growthBandPreset, ef.growthBandTune);
    const bandGain = Math.max(0.1, Math.min(4.0, ef.growthBandGain ?? 1.0));
    const rawBandEnergy = isAudioConnected ? audioEngine.getBandEnergyHz(busId, growthMinHz, growthMaxHz) : 0;
    const drivenBand = Math.min(1.0, rawBandEnergy * bandGain);
    const prevBandEnv = this.grassBandEnv.get(nodeId) ?? 0.0;
    const envCoeff = drivenBand > prevBandEnv ? (1.0 - Math.exp(-dt * 10.0)) : (1.0 - Math.exp(-dt * 2.2));
    const bandEnv = prevBandEnv + (drivenBand - prevBandEnv) * envCoeff;
    this.grassBandEnv.set(nodeId, bandEnv);

    // Sub-bass & bass energy for wind gusts
    const bassBandEnergy = isAudioConnected
      ? audioEngine.getBandEnergyHz(busId, GRASS_BASS_WIND_RANGE.minHz, GRASS_BASS_WIND_RANGE.maxHz)
      : 0;
    const audioBass = Math.max(bassBandEnergy, busBass * 0.85);

    // Leaky energy accumulator scaled cleanly by band RMS envelope
    let accum = this.grassGrowthAccum.get(nodeId) ?? 0.0;
    const growthRate = Math.max(0.01, ef.growthRate ?? 1.0);
    const gateThreshold = 0.025;
    const isBandActive = isAudioConnected && (bandEnv > gateThreshold || audioRms > 0.03);

    if (isAudioConnected) {
      if (bandEnv > gateThreshold) {
        const chargeSpeed = 0.42 * growthRate;
        accum = Math.min(1.0, accum + (0.18 + 0.82 * bandEnv) * chargeSpeed * dt);
      } else {
        const baseLifetime = Math.max(2.0, ef.lifetimeDuration ?? 10.0);
        const decaySpeed = (ef.timerDecayEnabled !== false) ? (1.0 / baseLifetime) : 0.06;
        accum = Math.max(0.0, accum - decaySpeed * dt);
      }
      this.grassGrowthAccum.set(nodeId, accum);
    }

    // Pitch for Growth Mode C
    let pitchVal = 0.5;
    if (isAudioConnected && busData) {
      const pitchFeat = audioEngine.getPitchFeatures(busId, 40, 2000, 'music');
      if (pitchFeat && pitchFeat.confidence > 0.35) {
        pitchVal = pitchFeat.midi;
      }
    }

    // Curvature Normal (Spectral Centroid / Brightness)
    let centroidNorm = 0.4;
    if (isAudioConnected && busData) {
      const speechFeat = audioEngine.getSpeechFeatures(busId, 20, 80);
      centroidNorm = speechFeat?.timbral?.centroid ?? 0.4;
    }
    if (ef.invertCurvature) {
      centroidNorm = 1.0 - centroidNorm;
    }

    // High-Frequency Spectral Flux Prune (cymbals / crisp transients vs silence drop)
    const hfEnergy = isAudioConnected
      ? audioEngine.getBandEnergyHz(busId, GRASS_HF_PRUNE_RANGE.minHz, GRASS_HF_PRUNE_RANGE.maxHz)
      : 0;
    const prevHfBase = this.grassHfBaseline.get(nodeId) ?? hfEnergy;
    const hfBase = prevHfBase + (hfEnergy - prevHfBase) * (1.0 - Math.exp(-dt * 3.5));
    this.grassHfBaseline.set(nodeId, hfBase);
    const hfFlux = Math.max(0.0, hfEnergy - hfBase);

    let audioPruneTrigger = false;
    const lastPruneTime = this.grassPruneCooldown.get(nodeId) ?? -10.0;
    const pruneThresh = ef.pruneThreshold ?? 0.7;
    if (isAudioConnected && busData && ef.gatedPruneEnabled) {
      if (ef.pruneAudioMode === 'silence_dissolve') {
        audioPruneTrigger = audioRms < 0.02 && pruneThresh > 0.5 && (timeSec - lastPruneTime > 0.4);
      } else if (timeSec - lastPruneTime > 0.18) {
        const fluxGate = Math.max(0.055, pruneThresh * 0.30);
        audioPruneTrigger = (hfFlux > fluxGate) || (hfEnergy > pruneThresh && audioOnset);
      }
    }

    // 2. Normalling Break-Jacks (CV Overrides)
    const baseGrowth = ef.growth ?? 0.8;
    const growthEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'growth_cv');
    const isDriven = !!(growthEdge || isAudioConnected);
    let targetGrowth = baseGrowth;
    let birthRate = (0.9 + baseGrowth * 1.6) * growthRate;

    if (growthEdge) {
      targetGrowth = this.getEffectiveParam(layer, nodeId, 'growth_cv', baseGrowth, timeSec);
      birthRate = (0.12 + Math.max(0.0, targetGrowth) * 2.8) * growthRate;
    } else if (isAudioConnected) {
      if (ef.growthAudioMode === 'pitch') {
        targetGrowth = baseGrowth * (isBandActive ? (0.2 + Math.min(1.0, pitchVal) * 0.8) : 0.0);
        birthRate = (isBandActive ? (0.16 + bandEnv * 2.8) : 0.02) * growthRate;
      } else {
        targetGrowth = baseGrowth * Math.max(accum, bandEnv * 0.85);
        birthRate = (bandEnv > gateThreshold ? (0.14 + bandEnv * 3.2) : 0.02) * growthRate;
      }
    }

    const modGrowth = Math.max(0.0, Math.min(1.0, targetGrowth));
    const modTilt = Math.max(0.0, Math.min(1.0, this.getEffectiveParam(layer, nodeId, 'tilt_cv', ef.tilt ?? 0.5, timeSec)));

    const baseWindSpeed = ef.windSpeed ?? 1.5;
    const bassGust = (isAudioConnected && ef.bassCoupling) ? Math.min(2.2, audioBass * 2.6) : 0.0;
    const curPhase = this.grassWindPhase.get(nodeId) ?? 0.0;
    const nextPhase = (curPhase + dt * baseWindSpeed * (1.0 + bassGust * 0.7)) % (Math.PI * 2000.0);
    this.grassWindPhase.set(nodeId, nextPhase);

    // Slowly meandering 2D breeze heading
    const windAngle = Math.sin(timeSec * 0.13) * 0.68 + Math.cos(timeSec * 0.047) * 0.32;
    const windDirX = Math.cos(windAngle);
    const windDirZ = Math.sin(windAngle);

    const windEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'wind_cv');
    const modWind = windEdge
      ? this.getEffectiveParam(layer, nodeId, 'wind_cv', ef.windStrength ?? 1.0, timeSec)
      : (isAudioConnected && ef.bassCoupling ? (ef.windStrength ?? 1.0) * (1.0 + bassGust) : (ef.windStrength ?? 1.0));

    const modDensity = Math.max(0.1, Math.min(1.0, this.getEffectiveParam(layer, nodeId, 'density_cv', ef.density ?? 0.6, timeSec)));

    const bendEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'bend_cv');
    const bendAudioDelta = (centroidNorm - 0.4) * 0.8;
    const modBend = bendEdge
      ? this.getEffectiveParam(layer, nodeId, 'bend_cv', ef.bend ?? 0.2, timeSec)
      : (isAudioConnected ? Math.max(-1.0, Math.min(1.0, (ef.bend ?? 0.2) + bendAudioDelta)) : (ef.bend ?? 0.2));

    const modFatness = Math.max(0.05, Math.min(2.5, this.getEffectiveParam(layer, nodeId, 'fatness_cv', ef.fatness ?? 1.0, timeSec)));

    // Prune Resolution (without resetting surviving field's growth accumulator)
    const pruneEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'prune_in');
    let pruneActive = false;
    let pruneCutRatio = 0.35;
    if (pruneEdge) {
      const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
      const sig = latestSignals[`${nodeId}.prune_in`] ?? 0;
      if (sig > pruneThresh) {
        pruneActive = true;
        pruneCutRatio = Math.min(1.0, (sig - pruneThresh) / Math.max(0.01, 1.0 - pruneThresh));
      }
    } else if (audioPruneTrigger) {
      pruneActive = true;
      pruneCutRatio = Math.min(0.65, 0.28 + hfFlux * 1.1);
      this.grassPruneCooldown.set(nodeId, timeSec);
    }

    // Tuft Trigger: detect rising edge for beats / triggers
    const tuftEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'tuft_trig');
    const latestSignals = SignalDispatcher.getInstance().getLatestSignals(layer.id);
    const trigVal = latestSignals[`${nodeId}.tuft_trig`] ?? 0;
    const lastTrig = this.lastTriggerVals.get(`${nodeId}.tuft_trig`) ?? 0;
    const curManualTuft = ef.tuftTriggerTime ?? 0;
    const lastManualTuft = this.lastTriggerVals.get(`${nodeId}.manualTuft`) ?? 0;
    const isManualRising = curManualTuft > lastManualTuft;
    const isCvRising = tuftEdge ? (trigVal > 0.5 && lastTrig <= 0.5) : false;
    this.lastTriggerVals.set(`${nodeId}.tuft_trig`, trigVal);
    this.lastTriggerVals.set(`${nodeId}.manualTuft`, curManualTuft);

    // Audio beat / onset rising edge with 180ms refractory period to avoid rapid jitter
    let audioBeatTrigger = false;
    if (isAudioConnected && busData) {
      const tuftThresh = ef.tuftThreshold ?? 0.35;
      const beatHit = audioOnset || (audioPeak > tuftThresh);
      const lastBeatTime = this.grassTuftCooldown.get(nodeId) ?? 0;
      if (beatHit && (timeSec - lastBeatTime > 0.18)) {
        audioBeatTrigger = true;
        this.grassTuftCooldown.set(nodeId, timeSec);
      }
    }

    const tuftTriggerActive = isManualRising || isCvRising || audioBeatTrigger;

    const tuftStyleMap: Record<string, number> = {
      purpletop: 1,
      wildflowers: 1,
      poppies: 2,
      dandelions: 3,
      kelp: 4,
      wheat: 5
    };

    const removalStyleMap: Record<string, number> = {
      cut: 0,
      dissolve: 1,
      shrink: 2
    };
    const removalStyleVal = removalStyleMap[ef.removalStyle ?? 'dissolve'] ?? 1;

    // 3. Dispatch Blade Compute Pass & Dust Compute Pass (separate passes for barrier visibility)
    const computeUniformBuffer = this.getUniformBuffer(`${nodeId}.grass_compute_uniforms`, 96);
    this.device.queue.writeBuffer(computeUniformBuffer, 0, new Float32Array([
      dt,
      timeSec,
      modGrowth,
      modDensity,
      modBend,
      modFatness,
      baseWindSpeed,
      modWind,
      ef.timerDecayEnabled !== false ? 1.0 : 0.0,
      ef.lifetimeDuration ?? 10.0,
      pruneActive ? 1.0 : 0.0,
      pruneCutRatio,
      removalStyleVal,
      tuftTriggerActive ? 1.0 : 0.0,
      tuftStyleMap[ef.tuftStyle ?? 'purpletop'] ?? 1,
      ef.tuftChance ?? 0.05,
      ef.tuftBurstAmount ?? 25,
      totalBlades,
      growthRate,
      nextPhase,
      birthRate,
      isDriven ? 1.0 : 0.0,
      windDirX,
      windDirZ
    ]));

    const computeBindGroup = this.device.createBindGroup({
      layout: this.grassComputePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: computeUniformBuffer } },
        { binding: 1, resource: { buffer: inBuf } },
        { binding: 2, resource: { buffer: outBuf } }
      ]
    });

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.grassComputePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(totalBlades / 64));
    computePass.end();

    const dustComputeBindGroup = this.device.createBindGroup({
      layout: this.grassDustComputePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: computeUniformBuffer } },
        { binding: 1, resource: { buffer: outBuf } },
        { binding: 2, resource: { buffer: dustBuf } }
      ]
    });

    const dustPass = commandEncoder.beginComputePass();
    dustPass.setPipeline(this.grassDustComputePipeline);
    dustPass.setBindGroup(0, dustComputeBindGroup);
    dustPass.dispatchWorkgroups(Math.ceil(dustCount / 64));
    dustPass.end();

    // 4. Dispatch Unified Depth-Buffered 3D Render Pass (Blades + Ground, Tufts, Dissolve Dust)
    const renderUniformBuffer = this.getUniformBuffer(`${nodeId}.grass_render_uniforms`, 256);
    const presetMap: Record<string, number> = {
      meadow: 0,
      bioluminescent: 1,
      golden: 2,
      neon: 3
    };

    const showSky = ef.showSky === true;
    const showGround = ef.showGround !== false;

    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
    const aspect = target.width / target.height;
    const renderF32 = new Float32Array(64);
    renderF32[0] = aspect;
    renderF32[1] = timeSec;
    renderF32[2] = modTilt;
    renderF32[3] = ef.zoom ?? 1.0;
    renderF32[4] = ef.horizonY ?? 0.0;
    renderF32[5] = baseWindSpeed;
    renderF32[6] = modWind;
    renderF32[7] = presetMap[ef.colorPreset ?? 'meadow'] ?? 0;
    renderF32[8] = pal ? 1.0 : 0.0;
    renderF32[9] = pal ? pal.count : 0.0;
    renderF32[10] = pal ? pal.interpolation : 0.0;
    renderF32[11] = showSky ? 1.0 : 0.0;
    renderF32[12] = showGround ? 1.0 : 0.0;
    renderF32[13] = windDirX;
    renderF32[14] = windDirZ;
    renderF32[15] = 0.0;

    if (pal) {
      for (let i = 0; i < 8; i++) {
        renderF32[16 + i * 4 + 0] = pal.colors[i][0];
        renderF32[16 + i * 4 + 1] = pal.colors[i][1];
        renderF32[16 + i * 4 + 2] = pal.colors[i][2];
        renderF32[16 + i * 4 + 3] = pal.colors[i][3];
      }
      for (let i = 0; i < 8; i++) {
        renderF32[48 + i] = pal.positions[i];
      }
    }

    this.device.queue.writeBuffer(renderUniformBuffer, 0, renderF32);

    let depthTex = this.grassDepthTextures.get(nodeId);
    if (!depthTex || depthTex.width !== target.width || depthTex.height !== target.height) {
      depthTex?.destroy();
      depthTex = this.device.createTexture({
        size: { width: target.width, height: target.height },
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.grassDepthTextures.set(nodeId, depthTex);
    }

    const renderBindGroup = this.device.createBindGroup({
      layout: this.grassRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: renderUniformBuffer } },
        { binding: 1, resource: { buffer: outBuf } }
      ]
    });

    const tuftBindGroup = this.device.createBindGroup({
      layout: this.grassTuftRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: renderUniformBuffer } },
        { binding: 1, resource: { buffer: outBuf } }
      ]
    });

    const dustBindGroup = this.device.createBindGroup({
      layout: this.grassDustRenderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: renderUniformBuffer } },
        { binding: 1, resource: { buffer: dustBuf } }
      ]
    });

    let clearColor = { r: 0.0, g: 0.0, b: 0.0, a: 0.0 };
    if (showSky) {
      const preset = ef.colorPreset ?? 'meadow';
      clearColor = { r: 0.05, g: 0.10, b: 0.16, a: 1.0 };
      if (preset === 'bioluminescent') {
        clearColor = { r: 0.02, g: 0.04, b: 0.09, a: 1.0 };
      } else if (preset === 'golden') {
        clearColor = { r: 0.18, g: 0.12, b: 0.08, a: 1.0 };
      } else if (preset === 'neon') {
        clearColor = { r: 0.10, g: 0.02, b: 0.16, a: 1.0 };
      }
    }

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: depthTex.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'discard'
      }
    });

    pass.setPipeline(this.grassRenderPipeline);
    pass.setBindGroup(0, renderBindGroup);
    pass.draw(24, totalBlades);

    pass.setPipeline(this.grassTuftRenderPipeline);
    pass.setBindGroup(0, tuftBindGroup);
    pass.draw(6, totalBlades);

    pass.setPipeline(this.grassDustRenderPipeline);
    pass.setBindGroup(0, dustBindGroup);
    pass.draw(6, dustCount);

    pass.end();
  }

  private resolveConnectedAudioBus(layer: LayerState, nodeId: string): {
    isAudioConnected: boolean;
    busId: string;
    busData: any;
  } {
    const audioEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
    if (!audioEdge) {
      return { isAudioConnected: false, busId: 'master', busData: undefined };
    }

    const audioEngine = AudioEngine.getInstance();
    const sourceEffect = layer.effects.find(e => e.id === audioEdge.fromNodeId);
    let busId = 'master';
    if (sourceEffect?.type === 'AudioSource') {
      busId = (sourceEffect as any).busId || 'master';
    } else if (
      audioEdge.fromNodeId === 'source' ||
      sourceEffect?.type === 'VideoFile' ||
      sourceEffect?.type === 'VideoURL' ||
      sourceEffect?.type === 'AudioFile' ||
      sourceEffect?.type === 'AudioInput' ||
      sourceEffect?.type === 'SystemAudio' ||
      sourceEffect?.type === 'AudioTransformer' ||
      sourceEffect?.type === 'AudioToCV'
    ) {
      const baseId = audioEdge.fromNodeId === 'source' ? layer.id : audioEdge.fromNodeId;
      busId = (audioEdge.fromPort === 'ch1_out' || audioEdge.fromPort === 'ch2_out')
        ? `${baseId}__${audioEdge.fromPort}`
        : baseId;
    } else {
      busId = audioEdge.fromNodeId;
    }

    const busData = audioEngine.getBusData(busId)
      || audioEngine.getBusData(layer.id)
      || audioEngine.getBusData('master');

    return { isAudioConnected: true, busId, busData };
  }

  private renderArabesque(
    layer: LayerState,
    nodeId: string,
    ef: ArabesqueEffect,
    target: GPUTexture,
    timeSec: number,
    commandEncoder: GPUCommandEncoder
  ) {
    const prevTime = this.arabesqueLastTime.get(nodeId) ?? timeSec;
    const dt = Math.min(0.08, Math.max(0.001, timeSec - prevTime));
    this.arabesqueLastTime.set(nodeId, timeSec);

    let sim = this.arabesqueSims.get(nodeId);
    if (!sim) {
      sim = new ArabesqueSimulation();
      this.arabesqueSims.set(nodeId, sim);
    }

    const audioEngine = AudioEngine.getInstance();
    const { isAudioConnected, busId, busData } = this.resolveConnectedAudioBus(layer, nodeId);

    const { minHz: curlMinHz, maxHz: curlMaxHz } = resolveArabesqueCurlBandHz(ef.curlBandPreset, ef.curlBandTune);
    const bandGain = Math.max(0.2, Math.min(3.5, ef.curlBandGain ?? 1.0));
    const melodic = isAudioConnected
      ? audioEngine.getBandSpectralCentroidHz(busId, curlMinHz, curlMaxHz)
      : { centroidNorm: 0.5, energy: 0 };
    const melodicCentroid = Math.max(0, Math.min(1, melodic.centroidNorm * (0.65 + 0.35 * bandGain)));
    const melodicEnergy = Math.min(1, melodic.energy * bandGain);

    const bassEnergy = isAudioConnected
      ? Math.max(
          audioEngine.getBandEnergyHz(busId, ARABESQUE_BASS_SURGE_RANGE.minHz, ARABESQUE_BASS_SURGE_RANGE.maxHz),
          (busData?.bands?.bass ?? 0) * 0.85
        )
      : 0;

    const hfEnergy = isAudioConnected
      ? audioEngine.getBandEnergyHz(busId, ARABESQUE_HF_BRANCH_RANGE.minHz, ARABESQUE_HF_BRANCH_RANGE.maxHz)
      : 0;

    // CV Break-Jack Overrides (undefined when unpatched so audio normalling applies)
    const edges = layer.graph?.edges ?? [];
    const sigs = SignalDispatcher.getInstance().getLatestSignals(layer.id);
    const readCv = (port: string): number | undefined =>
      edges.some(e => e.toNodeId === nodeId && e.toPort === port)
        ? (sigs[`${nodeId}.${port}`] ?? 0)
        : undefined;

    const trigVal = readCv('seed_trig') ?? 0;
    const lastTrig = this.lastTriggerVals.get(`${nodeId}.seed_trig`) ?? 0;
    const curManualTrig = ef.seedTriggerTime ?? 0;
    const lastManualTrig = this.lastTriggerVals.get(`${nodeId}.manualSeed`) ?? 0;
    const seedTrigRising = (trigVal > 0.5 && lastTrig <= 0.5) || (curManualTrig > lastManualTrig);
    this.lastTriggerVals.set(`${nodeId}.seed_trig`, trigVal);
    this.lastTriggerVals.set(`${nodeId}.manualSeed`, curManualTrig);

    const aspect = target.width / Math.max(1, target.height);

    sim.step(ef, {
      dt,
      timeSec,
      aspect,
      isAudioConnected,
      audioRms: busData?.rms ?? 0,
      bpm: busData?.bpm ?? 120,
      bpmConfidence: busData?.confidence ?? 0,
      bassEnergy,
      melodicCentroid,
      melodicEnergy,
      hfEnergy,
      growthCv: readCv('growth_cv'),
      curlCv: readCv('curl_cv'),
      branchCv: readCv('branch_cv'),
      widthCv: readCv('width_cv'),
      seedsCv: readCv('seeds_cv'),
      pruneIn: readCv('prune_in'),
      seedTrigRising
    });

    const segBuf = this.getStorageBuffer(`${nodeId}.arabesque_segs`, MAX_ARABESQUE_SEGMENTS * ARABESQUE_SEGMENT_BYTES);
    const activeCount = sim.writeGpuBuffer(this.arabesqueStaging, ef);

    if (activeCount > 0) {
      this.device.queue.writeBuffer(
        segBuf,
        0,
        this.arabesqueStaging.subarray(0, activeCount * ARABESQUE_SEGMENT_FLOATS) as unknown as BufferSource
      );
    }

    const uniformBuf = this.getUniformBuffer(`${nodeId}.arabesque_uniforms`, 192);
    const presetMap: Record<string, number> = {
      gold_leaf: 0,
      obsidian_ink: 1,
      crimson_damask: 2,
      bioluminescent: 3
    };
    const pal = this.getConnectedPalette(layer, nodeId, 'palette_in');
    const uF32 = new Float32Array(48);
    uF32[0] = aspect;
    uF32[1] = timeSec;
    uF32[2] = ef.ornateTips !== false ? 1.0 : 0.0;
    uF32[3] = presetMap[ef.colorPreset ?? 'gold_leaf'] ?? 0;
    uF32[4] = pal ? 1.0 : 0.0;
    uF32[5] = pal ? pal.count : 0.0;
    uF32[6] = pal ? pal.interpolation : 0.0;
    uF32[7] = 0.0;

    if (pal) {
      for (let i = 0; i < 8; i++) {
        uF32[8 + i * 4 + 0] = pal.colors[i][0];
        uF32[8 + i * 4 + 1] = pal.colors[i][1];
        uF32[8 + i * 4 + 2] = pal.colors[i][2];
        uF32[8 + i * 4 + 3] = pal.colors[i][3];
      }
      for (let i = 0; i < 8; i++) {
        uF32[40 + i] = pal.positions[i];
      }
    }

    this.device.queue.writeBuffer(uniformBuf, 0, uF32);

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    if (activeCount > 0) {
      const bindGroup = this.device.createBindGroup({
        layout: this.arabesqueRenderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuf } },
          { binding: 1, resource: { buffer: segBuf } }
        ]
      });
      pass.setPipeline(this.arabesqueRenderPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6, activeCount);
    }

    pass.end();
  }
}

export function calculatePalettePositions(
  activeStops: { weight?: number; active?: boolean }[],
  spreadVal: number = 0
): number[] {
  const count = Math.min(8, activeStops.length);
  const positions: number[] = new Array(8).fill(0);
  if (count <= 1) {
    positions[0] = 0.0;
    return positions;
  }
  let totalWeightSpan = 0;
  for (let i = 0; i < count; i++) {
    totalWeightSpan += Math.max(0.01, activeStops[i].weight || 1.0);
  }
  positions[0] = 0.0;
  let accumulated = 0;
  const spreadMultiplier = Math.pow(2.0, spreadVal * 2.0);
  for (let i = 0; i < count - 1; i++) {
    accumulated += Math.max(0.01, activeStops[i].weight || 1.0);
    let pos = accumulated / totalWeightSpan;
    if (spreadVal !== 0) {
      pos = Math.pow(pos, spreadMultiplier);
    }
    positions[i + 1] = pos;
  }
  return positions;
}

