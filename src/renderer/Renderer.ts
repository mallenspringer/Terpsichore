import { useEngineStore } from '../state/store';
import { ShapeGeneratorWGSL } from './shaders/ShapeGenerator';
import { FullscreenQuadWGSL } from './shaders/FullscreenQuad';
import { Transform2DWGSL } from './shaders/Transform2D';
import { ColorAdjustWGSL } from './shaders/ColorAdjust';
import { ColorRGBWGSL } from './shaders/ColorRGB';
import { LumaKeyWGSL } from './shaders/LumaKey';
import { SimpleFeedbackWGSL } from './shaders/SimpleFeedback';
import { ImageVideoSourceWGSL, VideoSourceWGSL } from './shaders/ImageVideoSource';
import { AudioEngine } from '../state/AudioEngine';
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
import { PixelProcessorFragmentWGSL } from './shaders/PixelProcessor';

import { PORT_DEFS } from '../components/NodeGraph/portDefs';
import { SignalDispatcher } from '../state/SignalDispatcher';
import { 
  ShapeGeneratorSource, Transform2DEffect, ColorAdjustEffect, LumaKeyEffect, 
  SimpleFeedbackEffect, ColorRGBEffect, LumaSplitterEffect, VideoMixerEffect,
  VideoURLSource, VideoFileSource, WebcamCaptureSource, ImageLoaderSource, ImageFileSource, 
  SpawnEffect, PathEffect, NoiseVideoSource, ColorNoiseSource, InverterEffect, PixelProcessorEffect,
  PatternEffect, KaleidoscopeEffect, SampleAndHoldEffect, OscilloscopeEffect, SpectralSplitterEffect,
  LayerState, AnySource
} from '../state/types';

interface SpawnedObject {
  id: string;
  birthX: number;      // Modulated X at birth
  birthY: number;      // Modulated Y at birth
  birthScale: number;  // Modulated Scale at birth
  birthRotation: number; // Modulated Rotation at birth
  randomX: number;
  randomY: number;
  randomScale: number;
  birthTime: number;
  lifetime: number;
  alpha: number;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private device!: GPUDevice;
  private context!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  
  private masterFBO!: GPUTexture;
  private layerFBO_A!: GPUTexture;
  private layerFBO_B!: GPUTexture;
  
  private prevFrameFBOs: Record<string, GPUTexture> = {};
  private videoElements: Record<string, HTMLVideoElement> = {};
  private audioElements: Record<string, HTMLAudioElement> = {};
  private activeStreams: Record<string, MediaStream> = {};
  private imageElements: Record<string, HTMLImageElement> = {};
  private imageBitmaps: Record<string, ImageBitmap> = {};
  private activeDeviceIds: Record<string, string> = {};

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
  private pixelProcessorPipeline!: GPURenderPipeline;
  private colorNoisePipeline!: GPURenderPipeline;
  
  // Isolated layouts to prevent 'Minimum Binding Size' collisions
  private effectLayouts: Map<string, GPUBindGroupLayout> = new Map();

  public mediaTextures: Record<string, GPUTexture> = {};
  public isSeeking: Record<string, boolean> = {};
  private nodeTextures: Map<string, GPUTexture> = new Map();
  private analysisReadbackBuffers: Map<string, GPUBuffer> = new Map();
  private analysisWeightBuffers: Map<string, GPUBuffer> = new Map();
  private uniformBuffers: Map<string, GPUBuffer> = new Map();
  private storageBuffers: Map<string, GPUBuffer> = new Map();
  private analysisBusy: Set<string> = new Set();
  public latestLumaValues: Record<string, number> = {};

  private sampler!: GPUSampler;

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
    const spawns = this.spawnStates.get(stateKey) || [];
    const width = target.width;
    const height = target.height;
    const aspect = width / height;
    
    const effect = layer.effects.find(e => e.id === nodeId);
    if (!effect || effect.type !== 'Spawn') return;
    const sp = effect as SpawnEffect;

    // Get current modulated values (for Dynamic mode)
    let currentX = this.getEffectiveParam(layer, nodeId, 'x', sp.x, timeSec);
    let currentY = this.getEffectiveParam(layer, nodeId, 'y', sp.y, timeSec);
    const currentScale = this.getEffectiveParam(layer, nodeId, 'scale', sp.scale, timeSec);
    const currentRotation = this.getEffectiveParam(layer, nodeId, 'rotation', sp.rotation, timeSec);

    if (sp.coordinateMode === 'pixel') {
      currentX = (currentX / width) * 2 - 1;
      currentY = (currentY / height) * -2 + 1;
    }

    const latched = sp.latchedPorts || [];
    const isGlobal = sp.globalLatch || false;

    // Helper to resolve dynamic vs latched
    const resolve = (portId: string, current: number, birth: number) => {
      if (isGlobal) return birth;
      return latched.includes(portId) ? birth : current;
    };

    // --- Path Logic ---
    // Look for a path connected to this Spawn node
    const pathEdge = layer.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'path_in');
    const pathEffect = pathEdge ? layer.effects.find(e => e.id === pathEdge.fromNodeId) as PathEffect : null;

    // Resolve path params (modulated)
    let pathSpeed = 1.0, pathStrength = 1.0, pathFreq = 1.0, pathDrift = 0.0;
    if (pathEffect) {
      pathSpeed = this.getEffectiveParam(layer, pathEffect.id, 'speed', pathEffect.speed, timeSec);
      pathStrength = this.getEffectiveParam(layer, pathEffect.id, 'strength', pathEffect.strength, timeSec);
      pathFreq = this.getEffectiveParam(layer, pathEffect.id, 'frequency', pathEffect.frequency, timeSec);
      pathDrift = this.getEffectiveParam(layer, pathEffect.id, 'drift', pathEffect.drift, timeSec);
    }

    // 1. Clear Target
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: target.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store'
      }]
    });

    if (spawns.length > 0) {
      pass.setPipeline(this.spawnPipeline);
      
      const instanceData = new Float32Array(spawns.length * 8); // 8 floats per instance
      spawns.forEach((obj, idx) => {
        const age = timeSec - obj.birthTime;
        let pathOffsetX = 0;
        let pathOffsetY = 0;

        if (pathEffect) {
          if (pathEffect.mode === 'physics') {
            pathOffsetY = -age * pathSpeed * 0.1; // Slow rise
            pathOffsetX = age * pathDrift * 0.1;
          } else if (pathEffect.mode === 'wiggle') {
            pathOffsetX = Math.sin(age * pathFreq + obj.randomX * 100) * pathStrength * 0.05;
            pathOffsetY = Math.cos(age * pathFreq * 0.7 + obj.randomY * 100) * pathStrength * 0.05;
          } else if (pathEffect.mode === 'orbit') {
            const angle = age * pathSpeed + (obj.randomX * Math.PI * 2);
            const dist = pathStrength * 0.1;
            pathOffsetX = Math.cos(angle) * dist;
            pathOffsetY = Math.sin(angle) * dist;
          }
        }

        const finalX = resolve('x', currentX, obj.birthX) + obj.randomX + pathOffsetX;
        const finalY = resolve('y', currentY, obj.birthY) + obj.randomY + pathOffsetY;
        const finalScale = resolve('scale', currentScale, obj.birthScale) * (1.0 + obj.randomScale);
        const finalRotation = resolve('rotation', currentRotation, obj.birthRotation);

        const base = idx * 8;
        instanceData[base + 0] = finalX;
        instanceData[base + 1] = finalY;
        instanceData[base + 2] = finalScale;
        instanceData[base + 3] = finalRotation;
        instanceData[base + 4] = obj.alpha;
        // padding: indices 5, 6, 7
      });

      const storageBuffer = this.getStorageBuffer(`${stateKey}.instances`, instanceData.byteLength);
      this.device.queue.writeBuffer(storageBuffer, 0, instanceData);

      const globalUniforms = this.getUniformBuffer(`${stateKey}.globals`, 16);
      this.device.queue.writeBuffer(globalUniforms, 0, new Float32Array([aspect, 0, 0, 0]));

      const bindGroup = this.device.createBindGroup({
        layout: this.spawnPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: storageBuffer } },
          { binding: 1, resource: { buffer: globalUniforms } },
          { binding: 2, resource: inputTex.createView() },
          { binding: 3, resource: this.sampler }
        ]
      });

      pass.setBindGroup(0, bindGroup);
      pass.draw(3, spawns.length);
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
  }

  private getStorageBuffer(key: string, size: number): GPUBuffer {
    let buf = this.storageBuffers.get(key);
    if (!buf || buf.size < size) {
      if (buf) buf.destroy();
      buf = this.device.createBuffer({
        size: Math.ceil(size / 256) * 256,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      });
      this.storageBuffers.set(key, buf);
    }
    return buf;
  }

  public getVideoElement(key: string): HTMLVideoElement | null {
    return this.videoElements[key] || null;
  }

  public getVideoProgress(key: string): { currentTime: number, duration: number } {
    const vid = this.videoElements[key];
    if (vid) {
      return { currentTime: vid.currentTime, duration: vid.duration };
    }
    return { currentTime: 0, duration: 0 };
  }

  private applyVideoState(vid: any, src: any, isMutedFromLayer: boolean, key: string) {
    const speed = typeof src.playbackSpeed === 'number' && isFinite(src.playbackSpeed) ? src.playbackSpeed : 1.0;
    vid.playbackRate = speed;
    vid.loop = false; // Disable native loop so we can intercept it manually

    const loopStart = src.loopStart ?? 0;
    const loopEnd = (src.loopEnd && src.loopEnd > loopStart) ? src.loopEnd : (vid.duration || Infinity);

    const lastTime = vid.__lastTime ?? 0;
    const delta = vid.currentTime - lastTime;
    const isOrganicPlayback = delta > 0 && delta < 1.0;
    const layerIsSeeking = !!this.isSeeking[key];

    // Organic loop trigger - only when playing and NOT manually seeking
    if (src.playState === 'play' && src.loop && !layerIsSeeking && !isNaN(vid.duration) && vid.duration > 0.1 && vid.currentTime >= loopEnd && isOrganicPlayback && lastTime < loopEnd) {
      vid.currentTime = loopStart;
    }

    // EOF fallback (if user scrubs outside the loop flags and hits the absolute end of the file)
    if (src.playState === 'play' && src.loop && !layerIsSeeking && !isNaN(vid.duration) && vid.duration > 0.1 && vid.currentTime >= vid.duration - 0.05) {
      vid.currentTime = loopStart;
      vid.play().catch(() => {});
    }

    if (src.playState === 'play' && vid.paused && !layerIsSeeking && vid.currentTime < (vid.duration || Infinity) - 0.05 && !useEngineStore.getState().isGlobalPaused) {
      vid.play().catch(() => {});
    }
    if (src.playState === 'pause' && !vid.paused) vid.pause();
    if (src.playState === 'stop') {
      if (!vid.paused) vid.pause();
      if (!layerIsSeeking && Math.abs(vid.currentTime - loopStart) > 0.01) {
        vid.currentTime = loopStart;
      }
    }

    vid.__lastTime = vid.currentTime;
    this.applyAudioState(vid, src, isMutedFromLayer, key);
  }

  private applyAudioState(el: HTMLAudioElement | HTMLVideoElement, src: any, isMutedFromLayer: boolean, key: string) {
    const globalMute = useEngineStore.getState().globalAudioMuted;
    
    // We keep the element itself unmuted so the MediaElementAudioSourceNode captures signal
    el.muted = false; 
    el.volume = 1.0; // Keep full volume for the Web Audio chain
    
    const ae = AudioEngine.getInstance();
    ae.setModuleMute(key, src.audioMuted || src.muted);
    ae.setLayerMute(key, isMutedFromLayer);
    ae.setMasterMute(globalMute);
  }

  private manageMediaSource(key: string, source: any): GPUExternalTexture | ImageBitmap | null {
    // 1. Cross-type Cleanup (Video -> Audio or vice versa)
    if (source.type === 'AudioInput' || source.type === 'AudioFile' || source.type === 'SystemAudio') {
      const vid = this.videoElements[key];
      if (vid && !vid.paused) { vid.pause(); vid.src = ""; vid.srcObject = null; }
    } else if (source.type === 'VideoURL' || source.type === 'VideoFile' || source.type === 'WebcamCapture') {
      const aud = this.audioElements[key];
      if (aud && !aud.paused) { aud.pause(); aud.src = ""; }
    }

    if (source.type === 'VideoURL' || source.type === 'VideoFile' || source.type === 'WebcamCapture') {
      let vid = this.videoElements[key] as any;
      if (!vid) {
        vid = document.createElement('video');
        vid.muted = true;
        vid.playsInline = true;
        vid.style.position = 'absolute';
        vid.style.opacity = '0';
        vid.style.pointerEvents = 'none';
        vid.style.width = '1px';
        vid.style.height = '1px';
        document.body.appendChild(vid);
        vid.onerror = () => console.error(`Video Error on Node ${key}:`, vid.error?.message, "Code:", vid.error?.code);
        vid.onloadedmetadata = () => {};
        this.videoElements[key] = vid;
        
        // Register with AudioEngine for signal dispatching
        setTimeout(() => AudioEngine.getInstance().registerMediaElement(key, vid), 50);
      }
      if (source.type === 'VideoURL') {
        const src = source as VideoURLSource;
        if (src.videoUrl && vid.__lastSrc !== src.videoUrl && !vid.srcObject) {
          vid.pause();
          vid.srcObject = null;
          vid.crossOrigin = 'anonymous';
          vid.src = src.videoUrl;
          vid.__lastSrc = src.videoUrl;
          vid.load();
        }
        this.applyVideoState(vid, src, src.audioMuted || (source as any)._layerAudioMuted, key);
      } else if (source.type === 'VideoFile') {
        const src = source as VideoFileSource;
        if (src.fileUrl && vid.__lastSrc !== src.fileUrl && !vid.srcObject) {
          vid.pause();
          vid.srcObject = null;
          vid.removeAttribute('crossOrigin');
          vid.src = src.fileUrl;
          vid.__lastSrc = src.fileUrl;
          vid.load();
        }
        this.applyVideoState(vid, src, src.audioMuted || (source as any)._layerAudioMuted, key);
      } else if (source.type === 'WebcamCapture') {
        const src = source as WebcamCaptureSource;
        if (this.activeDeviceIds[key] !== src.deviceId || (!vid.srcObject && !vid.src)) {
          this.activeDeviceIds[key] = src.deviceId;
          vid.pause();
          vid.removeAttribute('src');
          vid.__lastSrc = undefined;
          
          const constraints: MediaStreamConstraints = {
            video: src.deviceId ? { deviceId: { exact: src.deviceId } } : true,
            audio: false
          };
          
          navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
              if (this.activeDeviceIds[key] === src.deviceId) {
                vid.srcObject = stream;
                vid.play().catch(() => {});
              } else {
                stream.getTracks().forEach(t => t.stop());
              }
            })
            .catch(err => console.error("Webcam error:", err));
        }
        this.applyVideoState(vid, src, (source as any)._layerAudioMuted, key);
      }
      return vid as any;
    } else if (source.type === 'ImageLoader' || source.type === 'ImageFile') {
      const srcUrl = source.type === 'ImageLoader' 
        ? (source as ImageLoaderSource).imageUrl 
        : (source as ImageFileSource).fileUrl;
      
      if (srcUrl && (!this.imageElements[key] || this.imageElements[key].src !== srcUrl)) {
        const img = new Image();
        if (source.type === 'ImageLoader') img.crossOrigin = 'anonymous';
        img.src = srcUrl;
        this.imageElements[key] = img;
        img.onload = () => {
          createImageBitmap(img).then(bmp => this.imageBitmaps[key] = bmp);
        };
      }
      return this.imageBitmaps[key] || null;
    } else if (source.type === 'AudioFile') {
      let aud = this.audioElements[key];
      if (!aud) {
        aud = document.createElement('audio');
        aud.crossOrigin = 'anonymous';
        this.audioElements[key] = aud;
      }
      const src = source as any;
      if (src.fileUrl && aud.src !== src.fileUrl) {
        aud.src = src.fileUrl;
        aud.load();
        AudioEngine.getInstance().registerMediaElement(key, aud);
      }
      if (src.playState === 'play' && aud.paused && !useEngineStore.getState().isGlobalPaused) aud.play().catch(e => console.error("Audio Play Error:", e));
      else if (src.playState === 'pause' && !aud.paused) aud.pause();
      else if (src.playState === 'stop') { aud.pause(); aud.currentTime = 0; }
      
      aud.loop = src.loop;
      this.applyAudioState(aud, src, source._layerAudioMuted, key);
      return null;
    } else if (source.type === 'AudioInput' || source.type === 'SystemAudio') {
      const src = source as any;
      let stream = this.activeStreams[key];
      if (!stream) {
        const constraints = source.type === 'AudioInput' 
          ? { audio: src.deviceId ? { deviceId: src.deviceId } : true }
          : { audio: true, video: true }; // System audio often requires video track in getDisplayMedia
        
        const promise = source.type === 'AudioInput'
          ? navigator.mediaDevices.getUserMedia(constraints)
          : navigator.mediaDevices.getDisplayMedia(constraints);
          
      promise.then(s => {
        this.activeStreams[key] = s;
        // We need an element to actually "play" the stream for volume/mute to work easily
        let aud = this.audioElements[key];
        if (!aud) {
          aud = document.createElement('audio');
          document.body.appendChild(aud); // Needs to be in DOM for some browsers
          aud.style.display = 'none';
          this.audioElements[key] = aud;
        }
        aud.srcObject = s;
        aud.play();
        AudioEngine.getInstance().registerMediaElement(key, aud);
      }).catch(e => console.error(`${source.type} Error:`, e));
      }
      
      const aud = this.audioElements[key];
      if (aud) {
        this.applyAudioState(aud, src, source._layerAudioMuted, key);
      }
      return null;
    }
    return null;
  }

  private getEffectiveParam(layer: LayerState, nodeId: string, paramId: string, baseValue: number, _timeSec: number): number {
    let finalValue = baseValue;

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
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  }

  private frameCount = 0;
  private spawnStates = new Map<string, SpawnedObject[]>();
  private shLiveStates = new Map<string, boolean>();
  private lastTriggerVals = new Map<string, number>();
  private patternMirrorStates = new Map<string, { x: boolean, y: boolean }>();

  private accumulatedTimeSec = 0;
  private lastRenderRealTime = performance.now();
  private lastResetSignal = 0;
  private wasPaused = false;
  
  private render() {
    const state = useEngineStore.getState();
    const commandEncoder = this.device.createCommandEncoder();
    
    const now = performance.now();
    const deltaSec = (now - this.lastRenderRealTime) / 1000.0;
    this.lastRenderRealTime = now;

    // Handle Reset
    if (state.globalResetSignal !== this.lastResetSignal) {
      this.lastResetSignal = state.globalResetSignal;
      this.accumulatedTimeSec = 0;
      Object.entries(this.videoElements).forEach(([layerId, v]) => { 
        const layer = state.layers[layerId];
        const loopStart = (layer?.source as any)?.loopStart ?? 0;
        v.currentTime = loopStart; 
      });
      Object.entries(this.audioElements).forEach(([layerId, a]) => { 
        const layer = state.layers[layerId];
        const loopStart = (layer?.source as any)?.loopStart ?? 0;
        a.currentTime = loopStart; 
      });
    }

    if (!state.isGlobalPaused) {
      this.accumulatedTimeSec += deltaSec;
      
      // If we just unpaused, play media
      if (this.wasPaused) {
         Object.values(this.videoElements).forEach(v => v.play().catch(e=>e));
         Object.values(this.audioElements).forEach(a => a.play().catch(e=>e));
         this.wasPaused = false;
      }
    } else {
      // If we just paused, pause media
      if (!this.wasPaused) {
         Object.values(this.videoElements).forEach(v => v.pause());
         Object.values(this.audioElements).forEach(a => a.pause());
         this.wasPaused = true;
      }
    }

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
      // 1. Spawn Logic (Updated to use SignalDispatcher values)
      layer.effects.filter(e => e.type === 'Spawn').forEach(effect => {
        const sp = effect as SpawnEffect;
        const stateKey = `${layer.id}.${effect.id}`;
        let activeSpawns = this.spawnStates.get(stateKey) || [];

        // Resolve triggers and resets from signalValues
        const triggerInVal = layer.signalValues?.[`${effect.id}.trigger_in`] ?? 0;
        const lastVal = this.lastTriggerVals.get(stateKey) ?? 0;
        const isTriggered = triggerInVal > 0.5 && lastVal <= 0.5;
        this.lastTriggerVals.set(stateKey, triggerInVal);

        const resetVal = layer.signalValues?.[`${effect.id}.reset_in`] ?? 0;
        if (resetVal > 0.5) activeSpawns = [];

        if (isTriggered) {
          let modX = this.getEffectiveParam(layer, effect.id, 'x', sp.x, timeSec);
          let modY = this.getEffectiveParam(layer, effect.id, 'y', sp.y, timeSec);
          const modScale = this.getEffectiveParam(layer, effect.id, 'scale', sp.scale, timeSec);
          const modRot = this.getEffectiveParam(layer, effect.id, 'rotation', sp.rotation, timeSec);

          const rx = ((Math.random() * 2 - 1) * sp.randomPos) / (sp.coordinateMode === 'pixel' ? this.canvas.width : 1);
          const ry = ((Math.random() * 2 - 1) * sp.randomPos) / (sp.coordinateMode === 'pixel' ? this.canvas.height : 1);
          const rs = (Math.random() * 2 - 1) * (sp.randomScale || 0);

          activeSpawns.unshift({
            id: `spawn_${Date.now()}_${Math.random()}`,
            birthX: modX, birthY: modY, birthScale: modScale, birthRotation: modRot,
            randomX: rx, randomY: ry, randomScale: rs,
            birthTime: timeSec, lifetime: sp.lifetime, alpha: 1.0
          });
          if (activeSpawns.length > sp.maxCount) activeSpawns.pop();
        }

        activeSpawns = activeSpawns.filter(obj => {
          const age = timeSec - obj.birthTime;
          if (age >= obj.lifetime) return false;
          obj.alpha = sp.fadeOut ? 1.0 - (age / obj.lifetime) : 1.0;
          return true;
        });
        this.spawnStates.set(stateKey, activeSpawns);
      });
    });

    // Check for canvas resize
    if (this.masterFBO && (this.masterFBO.width !== this.canvas.width || this.masterFBO.height !== this.canvas.height)) {
      this.setupRenderTargets();
    }

    const masterPass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: this.masterFBO.createView(), clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }],
    });
    masterPass.end();

    // Cleanup video/audio for nodes (layers or effects) that no longer exist
    const activeNodeIds = new Set<string>();
    Object.entries(state.layers).forEach(([lid, layer]) => {
      activeNodeIds.add(lid);
      layer.effects.forEach(ef => { if (ef.id) activeNodeIds.add(ef.id); });
    });

    Object.keys(this.videoElements).forEach(id => {
      if (!activeNodeIds.has(id)) {
        const v = this.videoElements[id];
        v.pause();
        v.src = '';
        v.removeAttribute('src');
        v.load();
        v.remove();
        delete this.videoElements[id];
      }
    });
    Object.keys(this.audioElements).forEach(id => {
      if (!activeNodeIds.has(id)) {
        const a = this.audioElements[id];
        a.pause();
        a.src = '';
        a.remove();
        delete this.audioElements[id];
      }
    });

    orderedLayers.forEach(layer => {
      // --- GLOBAL MEDIA WATCHDOG ---
      // If a layer has no media source, ensure all elements are killed
      const isMedia = ['VideoURL', 'VideoFile', 'WebcamCapture', 'AudioInput', 'AudioFile', 'ImageFile', 'ImageLoader'].includes(layer.source.type);
      if (!isMedia) {
        const vid = this.videoElements[layer.id];
        if (vid) {
          vid.pause();
          vid.src = "";
          vid.removeAttribute('src');
          vid.load(); // Forces the browser to release the file handle
          vid.remove();
          delete this.videoElements[layer.id];
          AudioEngine.getInstance().setModuleMute(layer.id, true);
        }
        const aud = this.audioElements[layer.id];
        if (aud) {
          aud.pause();
          aud.src = "";
          aud.removeAttribute('src');
          aud.load();
          aud.remove();
          delete this.audioElements[layer.id];
          AudioEngine.getInstance().setModuleMute(layer.id, true);
        }
      }

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
            f32.set(src.fillColor, 4); // index 4..7
            
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
          } else {
            const media = this.manageMediaSource(layer.id, { ...layer.source, _layerAudioMuted: layer.audioMuted });
            if (media) {
              const width = (media as any).videoWidth || (media as any).width || 0;
              const height = (media as any).videoHeight || (media as any).height || 0;
              if (width > 0 && height > 0) {
                const uniformBuffer = this.getUniformBuffer(`${layer.id}.source.media_uniforms`, 16);
                const fitMap: Record<string, number> = { cover: 0, contain: 1, fill: 2 };
                const f32 = new Float32Array([ fitMap[(layer.source as any).objectFit] ?? 0, width / height, this.canvas.width / this.canvas.height, 0]);
                this.device.queue.writeBuffer(uniformBuffer, 0, f32);

                if (media instanceof HTMLVideoElement && media.readyState >= 2) {
                  try {
                    const videoTex = this.device.importExternalTexture({ source: media });
                    const bindGroup = this.device.createBindGroup({ layout: this.videoPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: videoTex }, { binding: 2, resource: this.sampler }] });
                    pass.setPipeline(this.videoPipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
                  } catch (e) {}
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

          if (['ShapeGenerator', 'VideoFile', 'VideoURL', 'WebcamCapture', 'NoiseSource', 'ColorNoise'].includes(effect.type)) {
            const target = this.ensureTexture(nodeId, 'video_out');
            if (effect.type === 'ShapeGenerator') {
              this.renderShapeSource(layer, nodeId, target, timeSec, commandEncoder);
            } else if (effect.type === 'NoiseSource') {
              this.renderNoiseSource(layer, nodeId, target, timeSec, commandEncoder);
            } else if (effect.type === 'ColorNoise') {
              this.renderColorNoise(layer, nodeId, target, timeSec, commandEncoder);
            } else {
              this.renderVideoEffect(layer, nodeId, effect as any, target, commandEncoder);
            }
            return;
          }

          const incomingEdges = layer.graph?.edges.filter(e => e.toNodeId === nodeId && (e.signalType === 'video' || e.toPort === 'sig_in')) || [];
          const inputTex = (incomingEdges.length > 0) ? this.getTextureForNode(incomingEdges[0].fromNodeId, incomingEdges[0].fromPort) : this.ensureTexture('__dummy__');
          if (!inputTex) return;

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

            const rIn = this.getTextureForNode(nodeId, 'r_in')?.createView() ?? inputTex.createView();
            const gIn = this.getTextureForNode(nodeId, 'g_in')?.createView() ?? inputTex.createView();
            const bIn = this.getTextureForNode(nodeId, 'b_in')?.createView() ?? inputTex.createView();

            entries = [
              { binding: 0, resource: { buffer: uniformBuffer } }, 
              { binding: 1, resource: inputTex.createView() }, 
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
              } else if (edge.fromNodeId === 'source' || sourceEffect?.type === 'VideoFile' || sourceEffect?.type === 'VideoURL') {
                busId = edge.fromNodeId === 'source' ? layer.id : edge.fromNodeId;
              }
            }

            const busData = AudioEngine.getInstance().getBusData(busId);
            const waveform = busData ? busData.waveform : new Float32Array(1024);

            // 2. Upload waveform to storage buffer
            const storageBuffer = this.getStorageBuffer(`${nodeId}.waveform`, waveform.byteLength);
            this.device.queue.writeBuffer(storageBuffer, 0, waveform as any);

            // 3. Upload uniforms
            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);
            this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
              this.getEffectiveParam(layer, ef.id, 'triggerLevel', ef.triggerLevel, timeSec),
              this.getEffectiveParam(layer, ef.id, 'timeScale', ef.timeScale, timeSec),
              this.canvas.width / this.canvas.height,
              ef.isFrozen ? 1.0 : 0.0
            ]) as any);

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
            let busId = 'master';
            if (edge) {
              const sourceEffect = layer?.effects.find(e => e.id === edge.fromNodeId);
              if (sourceEffect?.type === 'AudioSource') busId = (sourceEffect as any).busId;
              else if (edge.fromNodeId === 'source') busId = layer.id;
            }

            const busData = AudioEngine.getInstance().getBusData(busId);
            const fft = busData ? busData.fft : new Float32Array(512);

            const storageBuffer = this.getStorageBuffer(`${nodeId}.fft`, fft.byteLength);
            this.device.queue.writeBuffer(storageBuffer, 0, fft as any);

            const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 48); 
            this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
              this.getEffectiveParam(layer, ef.id, 'sensitivity', ef.sensitivity, timeSec),
              this.getEffectiveParam(layer, ef.id, 'smoothing', ef.smoothing, timeSec),
              this.canvas.width / this.canvas.height,
              timeSec,
              busData?.bands.low ?? 0,
              busData?.bands.lowMid ?? 0,
              busData?.bands.midGranular ?? 0,
              busData?.bands.highMid ?? 0,
              busData?.bands.highGranular ?? 0,
              0, 0, 0 // Padding to 48 bytes (12 floats)
            ]) as any);

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
            entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: this.sampler }];

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
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: this.sampler }];
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
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'LumaKey') {
              pipeline = this.lumaKeyPipeline;
              const ef = effect as LumaKeyEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16);
              const buf = new ArrayBuffer(16);
              new Float32Array(buf).set([this.getEffectiveParam(layer, ef.id, 'threshold', ef.threshold, timeSec), this.getEffectiveParam(layer, ef.id, 'tolerance', ef.tolerance, timeSec)]);
              new Uint32Array(buf)[2] = ef.invertKey ? 1 : 0;
              this.device.queue.writeBuffer(uniformBuffer, 0, buf);
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: this.sampler }];
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
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: this.sampler }];
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
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: fbTex.createView() }, { binding: 3, resource: this.sampler }];
            } else if (effect.type === 'TriggeredGate') {
              pipeline = this.triggeredGatePipeline;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 16); // Only 1 f32 (padded to 16 for alignment)
              const gateOpen = SignalDispatcher.getInstance().getGateState(layer.id, nodeId);
              this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([
                gateOpen ? 1.0 : 0.0, 0, 0, 0
              ]));
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: inputTex.createView() }, { binding: 2, resource: this.sampler }];
            } else if (effect.type === 'Pattern') {
              pipeline = this.patternPipeline;
              const ef = effect as PatternEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);
              const buf = new ArrayBuffer(32);
              const f32 = new Float32Array(buf);
              
              const applyLogScale = (manual: number, mod: number) => {
                if (mod > 0) return manual * Math.pow(32 / manual, mod);
                if (mod < 0) return manual * Math.pow(manual, mod);
                return manual;
              };

              const rawCountX = layer.signalValues?.[`${nodeId}.countX`] ?? 0;
              const rawCountY = layer.signalValues?.[`${nodeId}.countY`] ?? 0;
              const countMod = ef.syncCount ? (rawCountX + rawCountY) : 0;
              f32[0] = applyLogScale(ef.countX, ef.syncCount ? countMod : rawCountX);
              f32[1] = applyLogScale(ef.countY, ef.syncCount ? countMod : rawCountY);

              const rawSpX = layer.signalValues?.[`${nodeId}.spacingX`] ?? 0;
              const rawSpY = layer.signalValues?.[`${nodeId}.spacingY`] ?? 0;
              const spModX = ef.syncSpacing ? (rawSpX + rawSpY) : rawSpX;
              const spModY = ef.syncSpacing ? (rawSpX + rawSpY) : rawSpY;
              f32[2] = ef.spacingX + spModX;
              f32[3] = ef.spacingY + spModY;

              const rawOffX = layer.signalValues?.[`${nodeId}.offsetX`] ?? 0;
              const rawOffY = layer.signalValues?.[`${nodeId}.offsetY`] ?? 0;
              const offModX = ef.syncOffset ? (rawOffX + rawOffY) : rawOffX;
              const offModY = ef.syncOffset ? (rawOffX + rawOffY) : rawOffY;
              f32[4] = ef.offsetX + offModX;
              f32[5] = ef.offsetY + offModY;

              // Handle Mirror Triggers
              let mState = this.patternMirrorStates.get(nodeId);
              if (!mState) {
                mState = { x: ef.alternateMirrorX, y: ef.alternateMirrorY };
                this.patternMirrorStates.set(nodeId, mState);
              }

              const trigX = layer.signalValues?.[`${nodeId}.mirror_trig_x`] ?? 0;
              const lastX = this.lastTriggerVals.get(`${nodeId}.mirror_trig_x`) ?? 0;
              if (trigX > 0.5 && lastX <= 0.5) mState.x = !mState.x;
              this.lastTriggerVals.set(`${nodeId}.mirror_trig_x`, trigX);

              const trigY = layer.signalValues?.[`${nodeId}.mirror_trig_y`] ?? 0;
              const lastY = this.lastTriggerVals.get(`${nodeId}.mirror_trig_y`) ?? 0;
              if (trigY > 0.5 && lastY <= 0.5) mState.y = !mState.y;
              this.lastTriggerVals.set(`${nodeId}.mirror_trig_y`, trigY);

              const u32 = new Uint32Array(buf);
              u32[6] = mState.x ? 1 : 0;
              u32[7] = mState.y ? 1 : 0;
              this.device.queue.writeBuffer(uniformBuffer, 0, buf);
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: inputTex.createView() }];
            } else if (effect.type === 'Kaleidoscope') {
              pipeline = this.kaleidoscopePipeline;
              const ef = effect as KaleidoscopeEffect;
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 32);
              
              const rawAngleMod = layer.signalValues?.[`${nodeId}.angle`] ?? 0;
              const angle = ef.angle + rawAngleMod * 360.0;
              
              const rawCountMod = layer.signalValues?.[`${nodeId}.segments`] ?? 0;
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
              entries = [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: this.sampler }, { binding: 2, resource: inputTex.createView() }];
            } else if (effect.type === 'SampleAndHold') {
              const sh = effect as SampleAndHoldEffect;
              const trigger = layer.signalValues?.[`${nodeId}.trigger`] ?? 0;
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

              const toggleTrig = layer.signalValues?.[`${nodeId}.live_toggle`] ?? 0;
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
              const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 48);
              const modeMap: Record<string, number> = { normal: 0, add: 1, screen: 2, mult: 3 };
              
              const f32 = new Float32Array(12);
              f32[0] = this.getEffectiveParam(layer, ef.id, 'v1_cv', ef.v1, timeSec);
              f32[1] = this.getEffectiveParam(layer, ef.id, 'v2_cv', ef.v2, timeSec);
              f32[2] = this.getEffectiveParam(layer, ef.id, 'v3_cv', ef.v3, timeSec);
              f32[3] = this.getEffectiveParam(layer, ef.id, 'v4_cv', ef.v4, timeSec);
              
              const u32 = new Uint32Array(f32.buffer);
              u32[4] = modeMap[ef.v1Mode] || 0;
              u32[5] = modeMap[ef.v2Mode] || 0;
              u32[6] = modeMap[ef.v3Mode] || 0;
              u32[7] = modeMap[ef.v4Mode] || 0;
              
              f32[8] = this.getEffectiveParam(layer, ef.id, 'master_cv', ef.masterGain, timeSec);

              this.device.queue.writeBuffer(uniformBuffer, 0, f32);

              const v1 = this.getTextureForNode(nodeId, 'v1_in')?.createView() ?? inputTex.createView();
              const v2 = this.getTextureForNode(nodeId, 'v2_in')?.createView() ?? inputTex.createView();
              const v3 = this.getTextureForNode(nodeId, 'v3_in')?.createView() ?? inputTex.createView();
              const v4 = this.getTextureForNode(nodeId, 'v4_in')?.createView() ?? inputTex.createView();
              
              entries = [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: v1 },
                { binding: 2, resource: v2 },
                { binding: 3, resource: v3 },
                { binding: 4, resource: v4 },
                { binding: 5, resource: this.sampler }
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
                { binding: 1, resource: inputTex.createView() },
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
          readbackBuf.mapAsync(GPUMapMode.READ).then(() => {
            if (this._isDestroyed) return;
            const data = new Float32Array(readbackBuf!.getMappedRange());
            this.latestLumaValues[analysisKey] = data[0];
            readbackBuf!.unmap();
            this.analysisBusy.delete(analysisKey);
          }).catch(() => {
            this.analysisBusy.delete(analysisKey);
          });
        }
      });
    });

    const canvasPass = commandEncoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, loadOp: 'clear', storeOp: 'store' }] });
    const finalBlitBindGroup = this.device.createBindGroup({ layout: this.blitPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.masterFBO.createView() }, { binding: 1, resource: this.sampler }] });
    canvasPass.setPipeline(this.blitPipeline); canvasPass.setBindGroup(0, finalBlitBindGroup); canvasPass.draw(3); canvasPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public destroy() {
    this._isDestroyed = true;
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);
    if (this.masterFBO) this.masterFBO.destroy();
    if (this.layerFBO_A) this.layerFBO_A.destroy();
    if (this.layerFBO_B) this.layerFBO_B.destroy();
    Object.values(this.prevFrameFBOs).forEach(fbo => fbo.destroy());
    Object.values(this.videoElements).forEach(v => { 
      v.pause(); 
      v.src = ''; 
      if (v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        v.srcObject = null;
      }
    });
    this.analysisReadbackBuffers.forEach(buf => buf.destroy());
    this.analysisReadbackBuffers.clear();
    this.analysisWeightBuffers.clear();
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
    f32.set(src.fillColor, 4); // index 4..7
    
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
    const f32 = new Float32Array([ fitMap[(source as any).objectFit] ?? 0, width / height, this.canvas.width / this.canvas.height, 0]);
    this.device.queue.writeBuffer(uniformBuffer, 0, f32);

    if (media instanceof HTMLVideoElement && media.readyState >= 2) {
      try {
        const videoTex = this.device.importExternalTexture({ source: media });
        const bindGroup = this.device.createBindGroup({ layout: this.videoPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: videoTex }, { binding: 2, resource: this.sampler }] });
        pass.setPipeline(this.videoPipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
      } catch (e) {}
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

  private renderNoiseSource(layer: LayerState, nodeId: string, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const src = (nodeId === 'source' ? layer.source : layer.effects.find(e => e.id === nodeId)) as NoiseVideoSource;
    if (!src) return;

    const noiseTypeMap: Record<string, number> = { white: 0, perlin: 1, simplex: 2, ridged: 3, billow: 4, worley: 5, voronoi: 6, warped: 7 };
    const uniformBuffer = this.getUniformBuffer(`${layer.id}.${nodeId}.noise_uniforms`, 64);
    const f32 = new Float32Array(16);
    
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
    u32[10] = 0; // Padding
    f32[11] = this.canvas.width / this.canvas.height;
    
    this.device.queue.writeBuffer(uniformBuffer, 0, f32);

    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [{ view: target.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });

    const bindGroup = this.device.createBindGroup({ layout: this.noiseSourcePipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniformBuffer } }] });
    pass.setPipeline(this.noiseSourcePipeline); pass.setBindGroup(0, bindGroup); pass.draw(3);
    pass.end();
  }

  private renderColorNoise(layer: LayerState, nodeId: string, target: GPUTexture, timeSec: number, commandEncoder: GPUCommandEncoder) {
    const source = (nodeId === 'source') ? layer.source as ColorNoiseSource : layer.effects.find(e => e.id === nodeId) as any as ColorNoiseSource;
    const pipeline = this.colorNoisePipeline;
    const uniformBuffer = this.getUniformBuffer(`${nodeId}.uniforms`, 64);
    
    const noiseTypeMap: Record<string, number> = { white: 0, perlin: 1, simplex: 2, ridged: 3, billow: 4, worley: 5, voronoi: 6, warped: 7 };
    
    const f32 = new Float32Array(16);
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
    u32[10] = 0; // Padding
    f32[11] = this.canvas.width / this.canvas.height;
    
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

  private getFeedbackTexture(layerId: string): GPUTexture {
    return this.getPrevFrameFBO(layerId);
  }
}
