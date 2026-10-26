import {
  Transform2DEffect, ColorAdjustEffect, LumaKeyEffect, SimpleFeedbackEffect,
  InterLayerOutputEffect, InterLayerInputEffect, ColorRGBEffect, LumaSplitterEffect,
  SpawnEffect, PathEffect, LogicGateEffect, TriggeredGateEffect, InverterEffect, VideoMixerEffect,
  KeyMixerEffect, VideoMathEffect, UVDisplaceEffect,
  PatternEffect, KaleidoscopeEffect, SignalMathEffect, SampleAndHoldEffect,
  AudioSourceEffect, OscilloscopeEffect, SpectralSplitterEffect, PixelProcessorEffect,
  AudioTransformerEffect, AudioModulatorEffect
} from '../../../state/types';
import { AudioEngine } from '../../../state/AudioEngine';
import { useEngineStore } from '../../../state/store';
import {
  ControlRowDef, EffectCtx,
  eff, upd,
  KeyMappingRow, Slider
} from './controlHelpers';

export const EFFECT_ROWS: Record<string, ControlRowDef[]> = {
  Spawn: [
    { id: 'coordinateMode', label: 'Unit',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Units</span>
          <select value={eff<SpawnEffect>(ctx).coordinateMode} onChange={e => upd(ctx)({ coordinateMode: e.target.value as any })}>
            <option value="normalized">Normalized (-1..1)</option>
            <option value="pixel">Pixels (Abs)</option>
          </select>
        </div>
      )
    },
    { id: 'x', label: 'Spawn X',
      render: ctx => {
        const ef = eff<SpawnEffect>(ctx);
        return ef.coordinateMode === 'pixel' ? (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
            <span className="rack-row-label">X Pixel</span>
            <input type="number" value={ef.x} onChange={e => upd(ctx)({ x: parseFloat(e.target.value) || 0 })} className="rack-number-input" style={{ width: 80 }} />
          </div>
        ) : <Slider label="Spawn X" min={-2} max={2} step={0.01} value={ef.x} onChange={v => upd(ctx)({ x: v })} />;
      }
    },
    { id: 'y', label: 'Spawn Y',
      render: ctx => {
        const ef = eff<SpawnEffect>(ctx);
        return ef.coordinateMode === 'pixel' ? (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
            <span className="rack-row-label">Y Pixel</span>
            <input type="number" value={ef.y} onChange={e => upd(ctx)({ y: parseFloat(e.target.value) || 0 })} className="rack-number-input" style={{ width: 80 }} />
          </div>
        ) : <Slider label="Spawn Y" min={-2} max={2} step={0.01} value={ef.y} onChange={v => upd(ctx)({ y: v })} />;
      }
    },
    { id: 'scale', label: 'Base Scale',
      render: ctx => <Slider label="Base Scale" min={0} max={4} step={0.01} value={eff<SpawnEffect>(ctx).scale} onChange={v => upd(ctx)({ scale: v })} />
    },
    { id: 'rotation', label: 'Rotation',
      render: ctx => <Slider label="Rotation" min={-Math.PI} max={Math.PI} step={0.01} value={eff<SpawnEffect>(ctx).rotation} onChange={v => upd(ctx)({ rotation: v })} />
    },
    { id: 'lifetime', label: 'Life',
      render: ctx => <Slider label="Lifetime (s)" min={0.1} max={10} step={0.1} value={eff<SpawnEffect>(ctx).lifetime} onChange={v => upd(ctx)({ lifetime: v })} />
    },
    { id: 'maxCount', label: 'Max',
      render: ctx => <Slider label="Max Count" min={1} max={50} step={1} value={eff<SpawnEffect>(ctx).maxCount} onChange={v => upd(ctx)({ maxCount: v })} />
    },
    { id: 'randomPos', label: 'Rnd Pos',
      render: ctx => <Slider label="Random Pos" min={0} max={500} step={0.1} value={eff<SpawnEffect>(ctx).randomPos} onChange={v => upd(ctx)({ randomPos: v })} />
    },
    { id: 'randomScale', label: 'Rnd Scl',
      render: ctx => <Slider label="Random Scale" min={0} max={1} step={0.01} value={eff<SpawnEffect>(ctx).randomScale} onChange={v => upd(ctx)({ randomScale: v })} />
    },
    { id: 'fadeOut', label: 'Fade',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Fade Out</span>
          <input type="checkbox" checked={eff<SpawnEffect>(ctx).fadeOut} onChange={e => upd(ctx)({ fadeOut: e.target.checked })} />
        </div>
      )
    }
  ],

  Transform2D: [
    { id: 'translateX', label: 'Translate X',
      render: ctx => <Slider label="Translate X" min={-1} max={1} step={0.01}
        value={eff<Transform2DEffect>(ctx).translateX} onChange={v => upd(ctx)({ translateX: v })} />
    },
    { id: 'translateY', label: 'Translate Y',
      render: ctx => <Slider label="Translate Y" min={-1} max={1} step={0.01}
        value={eff<Transform2DEffect>(ctx).translateY} onChange={v => upd(ctx)({ translateY: v })} />
    },
    { id: 'linkScale', label: 'Link Scale',
      render: ctx => {
        const eCtx = ctx as EffectCtx;
        const ef = eff<Transform2DEffect>(ctx);
        const isLinked = eCtx.linkedScales?.[ef.id] ?? true;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Link Scale X/Y</span>
            <input type="checkbox" checked={isLinked}
              onChange={e => { e.stopPropagation(); eCtx.setLinkedScales?.({ ...eCtx.linkedScales, [ef.id]: e.target.checked }); }} />
          </div>
        );
      }
    },
    { id: 'scaleX', label: 'Scale X',
      render: ctx => {
        const eCtx = ctx as EffectCtx;
        const ef = eff<Transform2DEffect>(ctx);
        const isLinked = eCtx.linkedScales?.[ef.id] ?? true;
        return <Slider label="Scale X" min={0.1} max={4} step={0.01} value={ef.scaleX}
          resetValue={1}
          onChange={v => upd(ctx)(isLinked ? { scaleX: v, scaleY: v } : { scaleX: v })} />;
      }
    },
    { id: 'scaleY', label: 'Scale Y',
      render: ctx => {
        const eCtx = ctx as EffectCtx;
        const ef = eff<Transform2DEffect>(ctx);
        const isLinked = eCtx.linkedScales?.[ef.id] ?? true;
        return <Slider label="Scale Y" min={0.1} max={4} step={0.01} value={ef.scaleY}
          resetValue={1}
          onChange={v => upd(ctx)(isLinked ? { scaleX: v, scaleY: v } : { scaleY: v })} />;
      }
    },
    { id: 'rotation', label: 'Rotation',
      render: ctx => {
        const ef = eff<Transform2DEffect>(ctx);
        const deg = Math.round(ef.rotation / 0.0174533);
        return (
          <div className="rack-row-content" style={{ gap: 4 }}>
            <Slider label="Rotation" min={-180} max={180} step={1}
              value={deg} 
              onChange={v => upd(ctx)({ rotation: v * 0.0174533 })} />
            <input type="number" value={deg} 
              onChange={e => upd(ctx)({ rotation: (parseFloat(e.target.value) || 0) * 0.0174533 })}
              style={{ width: 40, background: '#111', color: '#88cc00', border: '1px solid #333', fontSize: 10, padding: '0 2px' }} />
            <span style={{ fontSize: 9, color: '#555' }}>°</span>
          </div>
        );
      }
    },
    { id: 'spin', label: 'Spin Rate',
      render: ctx => <Slider label="Spin Rate" min={-720} max={720} step={1}
        value={eff<Transform2DEffect>(ctx).spin ?? 0} 
        onChange={v => upd(ctx)({ spin: v })} />
    },
  ],

  ColorAdjust: [
    { id: 'hue', label: 'Hue',
      render: ctx => <Slider label="Hue" min={0} max={360} step={1}
        value={eff<ColorAdjustEffect>(ctx).hue} onChange={v => upd(ctx)({ hue: v })} />
    },
    { id: 'saturation', label: 'Saturation',
      render: ctx => <Slider label="Saturation" min={0} max={2} step={0.01}
        resetValue={1}
        value={eff<ColorAdjustEffect>(ctx).saturation} onChange={v => upd(ctx)({ saturation: v })} />
    },
    { id: 'brightness', label: 'Brightness',
      render: ctx => <Slider label="Brightness" min={-1} max={1} step={0.01}
        value={eff<ColorAdjustEffect>(ctx).brightness} onChange={v => upd(ctx)({ brightness: v })} />
    },
    { id: 'contrast', label: 'Contrast',
      render: ctx => <Slider label="Contrast" min={0} max={2} step={0.01}
        resetValue={1}
        value={eff<ColorAdjustEffect>(ctx).contrast} onChange={v => upd(ctx)({ contrast: v })} />
    },
    { id: 'invert', label: 'Invert',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Invert</span>
          <input type="checkbox" checked={eff<ColorAdjustEffect>(ctx).invert}
            onChange={e => { e.stopPropagation(); upd(ctx)({ invert: e.target.checked }); }} />
        </div>
      )
    },
  ],

  LumaKey: [
    { id: 'threshold', label: 'Threshold',
      render: ctx => <Slider label="Threshold" min={0} max={1} step={0.01}
        resetValue={0.5}
        value={eff<LumaKeyEffect>(ctx).threshold} onChange={v => upd(ctx)({ threshold: v })} />
    },
    { id: 'tolerance', label: 'Tolerance',
      render: ctx => <Slider label="Tolerance" min={0} max={1} step={0.01}
        value={eff<LumaKeyEffect>(ctx).tolerance} onChange={v => upd(ctx)({ tolerance: v })} />
    },
    { id: 'invertKey', label: 'Invert Key',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Invert Key</span>
          <input type="checkbox" checked={eff<LumaKeyEffect>(ctx).invertKey}
            onChange={e => { e.stopPropagation(); upd(ctx)({ invertKey: e.target.checked }); }} />
        </div>
      )
    },
  ],

  SimpleFeedback: [
    { id: 'feedbackAmount', label: 'Amount',
      render: ctx => <Slider label="Feedback Amount" min={0} max={0.99} step={0.01}
        value={eff<SimpleFeedbackEffect>(ctx).feedbackAmount} onChange={v => upd(ctx)({ feedbackAmount: v })} />
    },
    { id: 'zoom', label: 'Zoom',
      render: ctx => <Slider label="Zoom" min={0.5} max={1.5} step={0.01}
        resetValue={1}
        value={eff<SimpleFeedbackEffect>(ctx).zoom} onChange={v => upd(ctx)({ zoom: v })} />
    },
    { id: 'angle', label: 'Angle',
      render: ctx => <Slider label="Angle" min={-0.5} max={0.5} step={0.01}
        value={eff<SimpleFeedbackEffect>(ctx).angle} onChange={v => upd(ctx)({ angle: v })} />
    },
  ],
  InterLayerOutput: [
    { id: 'portCount', label: 'Ports',
      render: ctx => <Slider label="Ports" min={1} max={3} step={1} resetValue={1}
        value={eff<InterLayerOutputEffect>(ctx).portCount} onChange={v => upd(ctx)({ portCount: v })} />
    }
  ],
  InterLayerInput: [
    { id: 'portCount', label: 'Ports',
      render: ctx => <Slider label="Ports" min={1} max={3} step={1} resetValue={1}
        value={eff<InterLayerInputEffect>(ctx).portCount} onChange={v => upd(ctx)({ portCount: v })} />
    }
  ],
  ColorRGB: [
    { id: 'r', label: 'Red',
      render: ctx => {
        const ef = eff<ColorRGBEffect>(ctx);
        return (
          <div className="rack-row-controls">
            <Slider label="R" min={0} max={1} step={0.01} resetValue={0.5}
              value={ef.r} onChange={v => upd(ctx)({ r: v })} />
            <button 
              className={`mode-toggle ${ef.rInputMode === 'luma' ? 'active' : 'alt'}`}
              title={ef.rInputMode === 'luma' ? 'Input Mode: Luma (Grayscale)' : 'Input Mode: Channel (Red)'}
              onClick={() => upd(ctx)({ rInputMode: ef.rInputMode === 'luma' ? 'channel' : 'luma' })}
              style={{ fontSize: 8, minWidth: 28, padding: '0 2px' }}
            >
              {ef.rInputMode === 'luma' ? 'LUM' : 'CH'}
            </button>
            <button className={`mode-toggle ${ef.rMode === 'mult' ? 'active' : ''}`}
              onClick={() => upd(ctx)({ rMode: ef.rMode === 'mult' ? 'add' : 'mult' })}>
              {ef.rMode === 'mult' ? '×' : '+'}
            </button>
          </div>
        );
      }
    },
    { id: 'g', label: 'Green',
      render: ctx => {
        const ef = eff<ColorRGBEffect>(ctx);
        return (
          <div className="rack-row-controls">
            <Slider label="G" min={0} max={1} step={0.01} resetValue={0.5}
              value={ef.g} onChange={v => upd(ctx)({ g: v })} />
            <button 
              className={`mode-toggle ${ef.gInputMode === 'luma' ? 'active' : 'alt'}`}
              title={ef.gInputMode === 'luma' ? 'Input Mode: Luma (Grayscale)' : 'Input Mode: Channel (Green)'}
              onClick={() => upd(ctx)({ gInputMode: ef.gInputMode === 'luma' ? 'channel' : 'luma' })}
              style={{ fontSize: 8, minWidth: 28, padding: '0 2px' }}
            >
              {ef.gInputMode === 'luma' ? 'LUM' : 'CH'}
            </button>
            <button className={`mode-toggle ${ef.gMode === 'mult' ? 'active' : ''}`}
              onClick={() => upd(ctx)({ gMode: ef.gMode === 'mult' ? 'add' : 'mult' })}>
              {ef.gMode === 'mult' ? '×' : '+'}
            </button>
          </div>
        );
      }
    },
    { id: 'b', label: 'Blue',
      render: ctx => {
        const ef = eff<ColorRGBEffect>(ctx);
        return (
          <div className="rack-row-controls">
            <Slider label="B" min={0} max={1} step={0.01} resetValue={0.5}
              value={ef.b} onChange={v => upd(ctx)({ b: v })} />
            <button 
              className={`mode-toggle ${ef.bInputMode === 'luma' ? 'active' : 'alt'}`}
              title={ef.bInputMode === 'luma' ? 'Input Mode: Luma (Grayscale)' : 'Input Mode: Channel (Blue)'}
              onClick={() => upd(ctx)({ bInputMode: ef.bInputMode === 'luma' ? 'channel' : 'luma' })}
              style={{ fontSize: 8, minWidth: 28, padding: '0 2px' }}
            >
              {ef.bInputMode === 'luma' ? 'LUM' : 'CH'}
            </button>
            <button className={`mode-toggle ${ef.bMode === 'mult' ? 'active' : ''}`}
              onClick={() => upd(ctx)({ bMode: ef.bMode === 'mult' ? 'add' : 'mult' })}>
              {ef.bMode === 'mult' ? '×' : '+'}
            </button>
          </div>
        );
      }
    },
  ],
  LumaSplitter: [
    { id: 'threshold1', label: 'Low/Mid',
      render: ctx => <Slider label="Threshold 1" min={0} max={1} step={0.01} resetValue={0.33}
        value={eff<LumaSplitterEffect>(ctx).threshold1} onChange={v => upd(ctx)({ threshold1: v })} />
    },
    { id: 'threshold2', label: 'Mid/High',
      render: ctx => <Slider label="Threshold 2" min={0} max={1} step={0.01} resetValue={0.66}
        value={eff<LumaSplitterEffect>(ctx).threshold2} onChange={v => upd(ctx)({ threshold2: v })} />
    },
    { id: 'softness', label: 'Slope',
      render: ctx => <Slider label="Slope" min={0} max={0.5} step={0.01} resetValue={0.1}
        value={eff<LumaSplitterEffect>(ctx).softness} onChange={v => upd(ctx)({ softness: v })} />
    },
  ],

  VideoMixer: [
    { id: 'v1', label: 'V1', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V1" min={0} max={2} step={0.01} resetValue={1} value={ef.v1} onChange={v => upd(ctx)({ v1: v })} paramId="v1" ctx={ctx} />
            <select value={ef.v1Mode} onChange={e => upd(ctx)({ v1Mode: e.target.value as any })} className="mode-select">
              <option value="normal">NORM</option>
              <option value="add">ADD</option>
              <option value="screen">SCRN</option>
              <option value="mult">MULT</option>
            </select>
          </div>
        );
      }
    },
    { id: 'v1Alpha', label: 'V1 Alpha', render: ctx => <Slider label="V1 α" min={0} max={1} step={0.01} resetValue={1} value={eff<VideoMixerEffect>(ctx).v1Alpha} onChange={v => upd(ctx)({ v1Alpha: v })} paramId="v1Alpha" ctx={ctx} /> },
    { id: 'v2', label: 'V2', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V2" min={0} max={2} step={0.01} resetValue={1} value={ef.v2} onChange={v => upd(ctx)({ v2: v })} paramId="v2" ctx={ctx} />
            <select value={ef.v2Mode} onChange={e => upd(ctx)({ v2Mode: e.target.value as any })} className="mode-select">
              <option value="normal">NORM</option>
              <option value="add">ADD</option>
              <option value="screen">SCRN</option>
              <option value="mult">MULT</option>
            </select>
          </div>
        );
      }
    },
    { id: 'v2Alpha', label: 'V2 Alpha', render: ctx => <Slider label="V2 α" min={0} max={1} step={0.01} resetValue={1} value={eff<VideoMixerEffect>(ctx).v2Alpha} onChange={v => upd(ctx)({ v2Alpha: v })} paramId="v2Alpha" ctx={ctx} /> },
    { id: 'v3', label: 'V3', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V3" min={0} max={2} step={0.01} resetValue={1} value={ef.v3} onChange={v => upd(ctx)({ v3: v })} paramId="v3" ctx={ctx} />
            <select value={ef.v3Mode} onChange={e => upd(ctx)({ v3Mode: e.target.value as any })} className="mode-select">
              <option value="normal">NORM</option>
              <option value="add">ADD</option>
              <option value="screen">SCRN</option>
              <option value="mult">MULT</option>
            </select>
          </div>
        );
      }
    },
    { id: 'v3Alpha', label: 'V3 Alpha', render: ctx => <Slider label="V3 α" min={0} max={1} step={0.01} resetValue={1} value={eff<VideoMixerEffect>(ctx).v3Alpha} onChange={v => upd(ctx)({ v3Alpha: v })} paramId="v3Alpha" ctx={ctx} /> },
    { id: 'v4', label: 'V4', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V4" min={0} max={2} step={0.01} resetValue={1} value={ef.v4} onChange={v => upd(ctx)({ v4: v })} paramId="v4" ctx={ctx} />
            <select value={ef.v4Mode} onChange={e => upd(ctx)({ v4Mode: e.target.value as any })} className="mode-select">
              <option value="normal">NORM</option>
              <option value="add">ADD</option>
              <option value="screen">SCRN</option>
              <option value="mult">MULT</option>
            </select>
          </div>
        );
      }
    },
    { id: 'v4Alpha', label: 'V4 Alpha', render: ctx => <Slider label="V4 α" min={0} max={1} step={0.01} resetValue={1} value={eff<VideoMixerEffect>(ctx).v4Alpha} onChange={v => upd(ctx)({ v4Alpha: v })} paramId="v4Alpha" ctx={ctx} /> },
    { id: 'master', label: 'Master', render: ctx => <Slider label="Gain" min={0} max={2} step={0.01} resetValue={1} value={eff<VideoMixerEffect>(ctx).masterGain} onChange={v => upd(ctx)({ masterGain: v })} paramId="masterGain" ctx={ctx} /> },
    { id: 'crossfadeMode', label: 'A/B Mode',
      render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span className="rack-row-label">A/B Bus</span>
            <input type="checkbox" checked={ef.crossfadeEnabled ?? false} onChange={e => upd(ctx)({ crossfadeEnabled: e.target.checked })} />
          </div>
        );
      }
    },
    { id: 'crossfader', label: 'Crossfader', render: ctx => <Slider label="A ◄► B" min={0} max={1} step={0.01} resetValue={0.5} value={eff<VideoMixerEffect>(ctx).crossfader ?? 0.5} onChange={v => upd(ctx)({ crossfader: v })} paramId="crossfader" ctx={ctx} /> },
  ],

  KeyMixer: [
    { id: 'mode', label: 'Key Mode',
      render: ctx => {
        const ef = eff<KeyMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Mode</span>
            <select value={ef.mode} onChange={e => upd(ctx)({ mode: e.target.value as any })}>
              <option value="chroma">Chroma (Color)</option>
              <option value="luma">Luma (Brightness)</option>
            </select>
          </div>
        );
      }
    },
    { id: 'outputMode', label: 'Output',
      render: ctx => {
        const ef = eff<KeyMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">View</span>
            <select value={ef.outputMode ?? 'composite'} onChange={e => upd(ctx)({ outputMode: e.target.value as any })}>
              <option value="composite">Composite (FG + BG)</option>
              <option value="matte">Matte Only (B&W)</option>
              <option value="keyedFg">Keyed FG Only</option>
            </select>
          </div>
        );
      }
    },
    { id: 'keyColor', label: 'Key Color',
      render: ctx => {
        const ef = eff<KeyMixerEffect>(ctx);
        if (ef.mode !== 'chroma') return null;
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const toHex = (c: number) => Math.round(clamp(c, 0, 1) * 255).toString(16).padStart(2, '0');
        const hex = `#${toHex(ef.keyColorR)}${toHex(ef.keyColorG)}${toHex(ef.keyColorB)}`;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span className="rack-row-label">Color</span>
            <input type="color" value={hex} onChange={e => {
              const h = e.target.value;
              const r = parseInt(h.substring(1, 3), 16) / 255;
              const g = parseInt(h.substring(3, 5), 16) / 255;
              const b = parseInt(h.substring(5, 7), 16) / 255;
              upd(ctx)({ keyColorR: r, keyColorG: g, keyColorB: b });
            }} style={{ border: 'none', background: 'transparent', width: 28, height: 22, cursor: 'pointer' }} />
            <button style={{ fontSize: 9, padding: '2px 4px', background: '#0a3d1b', color: '#4aff75', border: '1px solid #1a7a38', borderRadius: 2, cursor: 'pointer' }}
              onClick={() => upd(ctx)({ keyColorR: 0, keyColorG: 1, keyColorB: 0 })}>Green</button>
            <button style={{ fontSize: 9, padding: '2px 4px', background: '#0a1d3d', color: '#4aa3ff', border: '1px solid #1a447a', borderRadius: 2, cursor: 'pointer' }}
              onClick={() => upd(ctx)({ keyColorR: 0, keyColorG: 0, keyColorB: 1 })}>Blue</button>
          </div>
        );
      }
    },
    { id: 'threshold', label: 'Threshold',
      render: ctx => <Slider label="Threshold" min={0} max={1} step={0.01} resetValue={0.35} value={eff<KeyMixerEffect>(ctx).threshold} onChange={v => upd(ctx)({ threshold: v })} paramId="threshold" ctx={ctx} />
    },
    { id: 'tolerance', label: 'Tolerance',
      render: ctx => <Slider label="Tolerance" min={0} max={1} step={0.01} resetValue={0.15} value={eff<KeyMixerEffect>(ctx).tolerance} onChange={v => upd(ctx)({ tolerance: v })} paramId="tolerance" ctx={ctx} />
    },
    { id: 'spill', label: 'Spill Supp.',
      render: ctx => {
        const ef = eff<KeyMixerEffect>(ctx);
        if (ef.mode !== 'chroma') return null;
        return <Slider label="Spill" min={0} max={1} step={0.01} resetValue={0.6} value={ef.spillSuppression} onChange={v => upd(ctx)({ spillSuppression: v })} paramId="spillSuppression" ctx={ctx} />;
      }
    },
    { id: 'blend', label: 'Blend & Options',
      render: ctx => {
        const ef = eff<KeyMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <span className="rack-row-label">Blend</span>
            <select value={ef.blendMode} onChange={e => upd(ctx)({ blendMode: e.target.value as any })}>
              <option value="normal">Normal</option>
              <option value="add">Add</option>
              <option value="screen">Screen</option>
              <option value="mult">Multiply</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginLeft: 'auto' }}>
              <input type="checkbox" checked={ef.invertMask} onChange={e => upd(ctx)({ invertMask: e.target.checked })} /> Invert
            </label>
          </div>
        );
      }
    },
    { id: 'master', label: 'Master Gain',
      render: ctx => <Slider label="Master" min={0} max={2} step={0.01} resetValue={1} value={eff<KeyMixerEffect>(ctx).masterGain} onChange={v => upd(ctx)({ masterGain: v })} paramId="masterGain" ctx={ctx} />
    }
  ],

  VideoMath: [
    { id: 'operation', label: 'Operation',
      render: ctx => {
        const ef = eff<VideoMathEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Op</span>
            <select value={ef.operation} onChange={e => upd(ctx)({ operation: e.target.value as any })}>
              <option value="add">Add (A + B)</option>
              <option value="subtract">Subtract (A - B)</option>
              <option value="multiply">Multiply (A × B)</option>
              <option value="min">Min (A, B)</option>
              <option value="max">Max (A, B)</option>
              <option value="difference">Difference |A - B|</option>
              <option value="screen">Screen</option>
              <option value="divide">Divide (A / B)</option>
              <option value="average">Average (A + B)/2</option>
            </select>
          </div>
        );
      }
    },
    { id: 'gainA', label: 'Gain A',
      render: ctx => <Slider label="Gain A" min={0} max={2} step={0.01} resetValue={1} value={eff<VideoMathEffect>(ctx).gainA} onChange={v => upd(ctx)({ gainA: v })} paramId="gainA" ctx={ctx} />
    },
    { id: 'gainB', label: 'Gain B',
      render: ctx => <Slider label="Gain B" min={0} max={2} step={0.01} resetValue={1} value={eff<VideoMathEffect>(ctx).gainB} onChange={v => upd(ctx)({ gainB: v })} paramId="gainB" ctx={ctx} />
    },
    { id: 'offset', label: 'Offset',
      render: ctx => <Slider label="Offset" min={-1} max={1} step={0.01} resetValue={0} value={eff<VideoMathEffect>(ctx).offset} onChange={v => upd(ctx)({ offset: v })} paramId="offset" ctx={ctx} />
    },
    { id: 'clampAndMaster', label: 'Clamp & Gain',
      render: ctx => {
        const ef = eff<VideoMathEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
              <input type="checkbox" checked={ef.clampOutput} onChange={e => upd(ctx)({ clampOutput: e.target.checked })} /> Clamp 0..1
            </label>
            <Slider label="Master" min={0} max={2} step={0.01} resetValue={1} value={ef.masterGain} onChange={v => upd(ctx)({ masterGain: v })} paramId="masterGain" ctx={ctx} />
          </div>
        );
      }
    }
  ],


  Inverter: [
    { id: 'active', label: 'Active',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Active</span>
          <input type="checkbox" checked={eff<InverterEffect>(ctx).active}
            onChange={e => { e.stopPropagation(); upd(ctx)({ active: e.target.checked }); }} />
        </div>
      )
    },
    { id: 'videoMode', label: 'Video Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Video Mode</span>
          <select value={eff<InverterEffect>(ctx).videoMode} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ videoMode: e.target.value as any }); }}>
            <option value="rgb">Full RGB</option>
            <option value="luma">Luma Only</option>
            <option value="chroma">Chroma Only</option>
          </select>
        </div>
      )
    },
    { id: 'cvMode', label: 'CV Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">CV Mode</span>
          <select value={eff<InverterEffect>(ctx).cvMode} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ cvMode: e.target.value as any }); }}>
            <option value="unipolar">1.0 - X (Uni)</option>
            <option value="bipolar">-X (Bi)</option>
          </select>
        </div>
      )
    },
    { id: 'triggerMode', label: 'Trig Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Trig Mode</span>
          <select value={eff<InverterEffect>(ctx).triggerMode} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ triggerMode: e.target.value as any }); }}>
            <option value="latch">Latching</option>
            <option value="momentary">Momentary</option>
          </select>
        </div>
      )
    },
    { id: 'mix', label: 'Mix',
      render: ctx => <Slider label="Mix" min={0} max={1} step={0.01}
        value={eff<InverterEffect>(ctx).mix} onChange={v => upd(ctx)({ mix: v })} />
    },
  ],
  LogicGate: [
    { id: 'mode', label: 'Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Operator</span>
          <select value={eff<LogicGateEffect>(ctx).mode} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ mode: e.target.value as any }); }}>
            <option value="and">AND</option>
            <option value="or">OR</option>
            <option value="xor">XOR</option>
            <option value="nand">NAND</option>
            <option value="nor">NOR</option>
          </select>
        </div>
      )
    },
    { id: 'thresholdA', label: 'Thresh A',
      render: ctx => <Slider label="Thresh A" min={0} max={1} step={0.01} resetValue={0.5}
        value={eff<LogicGateEffect>(ctx).thresholdA} onChange={v => upd(ctx)({ thresholdA: v })} />
    },
    { id: 'thresholdB', label: 'Thresh B',
      render: ctx => <Slider label="Thresh B" min={0} max={1} step={0.01} resetValue={0.5}
        value={eff<LogicGateEffect>(ctx).thresholdB} onChange={v => upd(ctx)({ thresholdB: v })} />
    },
  ],
  TriggeredGate: [
    { id: 'gateMode', label: 'Trigger',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Trigger</span>
          <select value={eff<TriggeredGateEffect>(ctx).gateMode} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ gateMode: e.target.value as any }); }}>
            <option value="momentary">Momentary</option>
            <option value="latch">Latching</option>
          </select>
        </div>
      )
    },
    { id: 'defaultState', label: 'Default',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Default</span>
          <select value={eff<TriggeredGateEffect>(ctx).defaultState} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ defaultState: e.target.value as any }); }}>
            <option value="off">Normally Closed (Off)</option>
            <option value="on">Normally Open (On)</option>
          </select>
        </div>
      )
    },
    { id: 'threshold', label: 'Threshold',
      render: ctx => <Slider label="Threshold" min={0} max={1} step={0.01} resetValue={0.5}
        value={eff<TriggeredGateEffect>(ctx).threshold} onChange={v => upd(ctx)({ threshold: v })} />
    },
  ],

  Path: [
    { id: 'mode', label: 'Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
          <span className="rack-row-label">Mode</span>
          <select value={eff<PathEffect>(ctx).mode} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ mode: e.target.value as any }); }}>
            <option value="physics">Physics (Rise)</option>
            <option value="wiggle">Wiggle (Noise)</option>
            <option value="orbit">Orbit</option>
          </select>
        </div>
      )
    },
    { id: 'speed', label: 'Speed',
      render: ctx => <Slider label="Speed" min={-5} max={5} step={0.01} resetValue={0}
        value={eff<PathEffect>(ctx).speed} onChange={v => upd(ctx)({ speed: v })} />
    },
    { id: 'strength', label: 'Strength',
      render: ctx => <Slider label="Strength" min={0} max={2} step={0.01} resetValue={1}
        value={eff<PathEffect>(ctx).strength} onChange={v => upd(ctx)({ strength: v })} />
    },
    { id: 'frequency', label: 'Frequency',
      render: ctx => <Slider label="Frequency" min={0} max={10} step={0.01} resetValue={1}
        value={eff<PathEffect>(ctx).frequency} onChange={v => upd(ctx)({ frequency: v })} />
    },
    { id: 'drift', label: 'Drift',
      render: ctx => <Slider label="Drift" min={-2} max={2} step={0.01} resetValue={0}
        value={eff<PathEffect>(ctx).drift} onChange={v => upd(ctx)({ drift: v })} />
    },
  ],

  Pattern: [
    { id: 'mode', label: 'Pattern Mode',
      render: ctx => {
        const ef = eff<PatternEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Tiling</span>
            <select value={ef.mode ?? 'grid'} onChange={e => upd(ctx)({ mode: e.target.value as any })}>
              <option value="grid">Grid (Cartesian)</option>
              <option value="radial">Radial (Concentric)</option>
            </select>
          </div>
        );
      }
    },
    { id: 'counts', label: 'Grid',
      render: ctx => {
        const ef = eff<PatternEffect>(ctx);
        if (ef.mode === 'radial') {
          return (
            <div className="rack-row-content">
              <Slider label="Rings" min={1} max={32} step={1} resetValue={4}
                value={ef.radialRings ?? 4} onChange={v => upd(ctx)({ radialRings: v })} paramId="radialRings" ctx={ctx} />
              <Slider label="Segs" min={1} max={32} step={1} resetValue={8}
                value={ef.radialSegments ?? 8} onChange={v => upd(ctx)({ radialSegments: v })} paramId="radialSegments" ctx={ctx} />
            </div>
          );
        }
        return (
          <div className="rack-row-content">
            <Slider label="X" min={1} max={32} step={1} resetValue={2}
              value={ef.countX} onChange={v => upd(ctx)({ countX: v, countY: ef.syncCount ? v : ef.countY })} paramId="countX" ctx={ctx} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 24 }}>
               <input type="checkbox" checked={ef.syncCount} title="Sync X/Y"
                 onChange={e => { e.stopPropagation(); upd(ctx)({ syncCount: e.target.checked, countY: e.target.checked ? ef.countX : ef.countY }); }} />
            </div>
            <Slider label="Y" min={1} max={32} step={1} resetValue={2}
              value={ef.syncCount ? ef.countX : ef.countY} 
              onChange={v => ef.syncCount ? upd(ctx)({ countX: v, countY: v }) : upd(ctx)({ countY: v })} paramId="countY" ctx={ctx} />
          </div>
        );
      }
    },
    { id: 'rotationAndJitter', label: 'Dynamics',
      render: ctx => {
        const ef = eff<PatternEffect>(ctx);
        return (
          <div className="rack-row-content">
            <Slider label="Tile Rot" min={-3.14} max={3.14} step={0.05} resetValue={0}
              value={ef.tileRotation ?? 0} onChange={v => upd(ctx)({ tileRotation: v })} paramId="tileRotation" ctx={ctx} />
            <Slider label="Jitter" min={0} max={1} step={0.01} resetValue={0}
              value={ef.jitter ?? 0} onChange={v => upd(ctx)({ jitter: v })} paramId="jitter" ctx={ctx} />
          </div>
        );
      }
    },
    { id: 'spacing', label: 'Spacing',
      render: ctx => {
        const ef = eff<PatternEffect>(ctx);
        return (
          <div className="rack-row-content">
            <Slider label="X" min={-1} max={1} step={0.01} resetValue={0}
              value={ef.spacingX} onChange={v => upd(ctx)({ spacingX: v, spacingY: ef.syncSpacing ? v : ef.spacingY })} paramId="spacingX" ctx={ctx} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 24 }}>
               <input type="checkbox" checked={ef.syncSpacing} title="Sync X/Y"
                 onChange={e => { e.stopPropagation(); upd(ctx)({ syncSpacing: e.target.checked, spacingY: e.target.checked ? ef.spacingX : ef.spacingY }); }} />
            </div>
            <Slider label="Y" min={-1} max={1} step={0.01} resetValue={0}
              value={ef.syncSpacing ? ef.spacingX : ef.spacingY} 
              onChange={v => ef.syncSpacing ? upd(ctx)({ spacingX: v, spacingY: v }) : upd(ctx)({ spacingY: v })} paramId="spacingY" ctx={ctx} />
          </div>
        );
      }
    },
    { id: 'offsets', label: 'Offsets',
      render: ctx => {
        const ef = eff<PatternEffect>(ctx);
        return (
          <div className="rack-row-content">
            <Slider label="X" min={-1} max={1} step={0.01} resetValue={0}
              value={ef.offsetX} onChange={v => upd(ctx)({ offsetX: v, offsetY: ef.syncOffset ? v : ef.offsetY })} paramId="offsetX" ctx={ctx} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 24 }}>
               <input type="checkbox" checked={ef.syncOffset} title="Sync X/Y"
                 onChange={e => { e.stopPropagation(); upd(ctx)({ syncOffset: e.target.checked, offsetY: e.target.checked ? ef.offsetX : ef.offsetY }); }} />
            </div>
            <Slider label="Y" min={-1} max={1} step={0.01} resetValue={0}
              value={ef.syncOffset ? ef.offsetX : ef.offsetY} 
              onChange={v => ef.syncOffset ? upd(ctx)({ offsetX: v, offsetY: v }) : upd(ctx)({ offsetY: v })} paramId="offsetY" ctx={ctx} />
          </div>
        );
      }
    },
    { id: 'mirror', label: 'Mirroring',
      render: ctx => (
        <div className="rack-row-content" style={{ gap: 10 }}>
           <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
             <input type="checkbox" checked={eff<PatternEffect>(ctx).alternateMirrorX} onChange={e => upd(ctx)({ alternateMirrorX: e.target.checked })} /> Mirror X
           </label>
           <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
             <input type="checkbox" checked={eff<PatternEffect>(ctx).alternateMirrorY} onChange={e => upd(ctx)({ alternateMirrorY: e.target.checked })} /> Mirror Y
           </label>
        </div>
      )
    }
  ],

  Kaleidoscope: [
    { id: 'segments', label: 'Count',
      render: ctx => <Slider label="Count" min={1} max={32} step={1} resetValue={5}
        value={eff<KaleidoscopeEffect>(ctx).segments} onChange={v => upd(ctx)({ segments: v })} />
    },
    { id: 'angle', label: 'Angle',
      render: ctx => <Slider label="Rotation" min={0} max={360} step={1} resetValue={0}
        value={eff<KaleidoscopeEffect>(ctx).angle} onChange={v => upd(ctx)({ angle: v })} />
    },
    { id: 'zoom', label: 'Zoom',
      render: ctx => <Slider label="Zoom" min={0.1} max={4} step={0.01} resetValue={1}
        value={eff<KaleidoscopeEffect>(ctx).zoom} onChange={v => upd(ctx)({ zoom: v })} />
    },
  ],
  SignalMath: [
    { id: 'operator', label: 'Operator',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Operator</span>
          <select value={eff<SignalMathEffect>(ctx).operator} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ operator: e.target.value as any }); }}>
            <option value="add">Add (A + B)</option>
            <option value="subtract">Subtract (A - B)</option>
            <option value="multiply">Multiply (A * B)</option>
            <option value="divide">Divide (A / B)</option>
            <option value="min">Minimum</option>
            <option value="max">Maximum</option>
            <option value="pow">Power (A^B)</option>
          </select>
        </div>
      )
    },
    { id: 'operandA', label: 'Manual A',
      render: ctx => <Slider label="Manual A" min={-2} max={2} step={0.01} resetValue={0}
        value={eff<SignalMathEffect>(ctx).operandA} onChange={v => upd(ctx)({ operandA: v })} />
    },
    { id: 'operandB', label: 'Manual B',
      render: ctx => <Slider label="Manual B" min={-2} max={2} step={0.01} resetValue={0}
        value={eff<SignalMathEffect>(ctx).operandB} onChange={v => upd(ctx)({ operandB: v })} />
    },
  ],
  SampleAndHold: [
    { id: 'trigger', label: 'Capture',
      render: ctx => (
        <div className="rack-row-content" style={{ padding: '4px 0' }}>
          <button className="rack-trigger-btn"
            style={{ width: '100%', height: 32, background: '#111', border: '1px solid #333', color: '#88cc00', fontSize: 11, fontWeight: 'bold' }}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => upd(ctx)({ manualTriggerTime: Date.now() })}>
            SNAP / CAPTURE
          </button>
        </div>
      )
    },
    { id: 'bypass', label: 'Output',
      render: ctx => {
        const sh = eff<SampleAndHoldEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
            <span className="rack-row-label">Source</span>
            <div className="rack-button-group" style={{ display: 'flex', gap: 2, flex: 1 }}>
              <button 
                className={`group-btn ${sh.isLive ? 'active' : ''}`}
                style={{ flex: 1, height: 18, border: '1px solid #333', borderRadius: '2px 0 0 2px', fontSize: 9, background: sh.isLive ? '#88cc00' : '#1a1a1a', color: sh.isLive ? '#000' : '#888', cursor: 'pointer' }}
                onClick={() => upd(ctx)({ isLive: true })}
              >LIVE</button>
              <button 
                className={`group-btn ${!sh.isLive ? 'active' : ''}`}
                style={{ flex: 1, height: 18, border: '1px solid #333', borderLeft: 'none', borderRadius: '0 2px 2px 0', fontSize: 9, background: !sh.isLive ? '#4a9eff' : '#1a1a1a', color: !sh.isLive ? '#000' : '#888', cursor: 'pointer' }}
                onClick={() => upd(ctx)({ isLive: false })}
              >BUFFER</button>
            </div>
          </div>
        );
      }
    },
    { id: 'triggerMode', label: 'Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
          <span className="rack-row-label">Trig Mode</span>
          <select 
            value={eff<SampleAndHoldEffect>(ctx).triggerMode} 
            onChange={e => upd(ctx)({ triggerMode: e.target.value as any })}
            style={{ width: '100%', background: '#111', color: '#ccc', border: '1px solid #333', fontSize: 10 }}
          >
            <option value="sample_show">Sample & Show</option>
            <option value="freeze_toggle">Freeze Toggle</option>
            <option value="sample_only">Sample Only (BG)</option>
          </select>
        </div>
      )
    },
    { id: 'keyMapping', label: 'Key',
      render: ctx => <KeyMappingRow label="Key Map" value={eff<SampleAndHoldEffect>(ctx).keyMapping ?? 'none'} onChange={v => upd(ctx)({ keyMapping: v })} ctx={ctx} />
    },
    { id: 'info', label: 'Status',
      render: () => (
        <div className="rack-row-content" style={{ fontSize: 9, color: '#666', fontStyle: 'italic', padding: '0 4px' }}>
          Modes: S&H (Auto-show), Freeze (Toggle), BG (Silent capture).
        </div>
      )
    }
  ],
  StepSequencer: [
    { id: 'sequencer_ui', label: 'Sequencer', render: () => null }
  ],
  AudioSource: [
    { id: 'busId', label: 'Source Bus',
      render: ctx => {
        const ef = eff<AudioSourceEffect>(ctx);
        const buses = AudioEngine.getInstance().getAllBuses();
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
            <span className="rack-row-label">Bus</span>
            <select value={ef.busId} onChange={e => upd(ctx)({ busId: e.target.value })} className="mode-select" style={{ flex: 1 }}>
              {buses.map((b: any) => {
                const layerOrder = useEngineStore.getState().layerOrder;
                const layerIdx = layerOrder.indexOf(b.id);
                const label = b.id === 'master' ? 'Master Bus' : 
                            layerIdx !== -1 ? `Layer ${layerIdx + 1}` : 
                            b.name;
                return (
                  <option key={b.id} value={b.id}>{label}</option>
                );
              })}
            </select>
          </div>
        );
      }
    }
  ],
  Oscilloscope: [
    { id: 'triggerLevel', label: 'Trig Lvl',
      render: ctx => <Slider label="Trig Lvl" min={0} max={1} step={0.01} value={eff<OscilloscopeEffect>(ctx).triggerLevel} resetValue={0.5} onChange={v => upd(ctx)({ triggerLevel: v })} />
    },
    { id: 'timeScale', label: 'Zoom',
      render: ctx => <Slider label="Time Scale" min={0.1} max={4} step={0.1} value={eff<OscilloscopeEffect>(ctx).timeScale} resetValue={1.0} onChange={v => upd(ctx)({ timeScale: v })} />
    },
    { id: 'isFrozen', label: 'Freeze',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Freeze</span>
          <input type="checkbox" checked={eff<OscilloscopeEffect>(ctx).isFrozen} onChange={e => upd(ctx)({ isFrozen: e.target.checked })} />
        </div>
      )
    },
  ],
  SpectralSplitter: [
    { id: 'busId', label: 'Source Bus',
      render: ctx => {
        const ef = eff<SpectralSplitterEffect>(ctx);
        const buses = AudioEngine.getInstance().getAllBuses();
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()}>
            <span className="rack-row-label">Bus</span>
            <select value={ef.busId} onChange={e => upd(ctx)({ busId: e.target.value })} className="mode-select" style={{ flex: 1 }}>
              {buses.map((b: any) => {
                const layerOrder = useEngineStore.getState().layerOrder;
                const layerIdx = layerOrder.indexOf(b.id);
                const label = b.id === 'master' ? 'Master Bus' : 
                            layerIdx !== -1 ? `Layer ${layerIdx + 1}` : 
                            b.name;
                return (
                  <option key={b.id} value={b.id}>{label}</option>
                );
              })}
            </select>
          </div>
        );
      }
    },
    { id: 'smoothing', label: 'Smoothing',
      render: ctx => <Slider label="Smoothing" min={0} max={0.99} step={0.01} value={eff<SpectralSplitterEffect>(ctx).smoothing} resetValue={0.8} onChange={v => upd(ctx)({ smoothing: v })} />
    },
    { id: 'sensitivity', label: 'Sensitivity',
      render: ctx => <Slider label="Sensitivity" min={0.1} max={10} step={0.1} value={eff<SpectralSplitterEffect>(ctx).sensitivity} resetValue={1.0} onChange={v => upd(ctx)({ sensitivity: v })} />
    },
  ],

  PixelProcessor: [
    { id: 'posterize', label: 'Posterize', render: ctx => {
        const ef = eff<PixelProcessorEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={ef.posterizeActive} onChange={e => upd(ctx)({ posterizeActive: e.target.checked })} />
              <span className="rack-row-label">Posterize</span>
            </div>
            {ef.posterizeActive && <Slider label="Levels" min={1} max={32} step={1} resetValue={8} value={ef.posterizeLevels} onChange={v => upd(ctx)({ posterizeLevels: v })} />}
          </div>
        );
      }
    },
    { id: 'threshold', label: 'Threshold', render: ctx => {
        const ef = eff<PixelProcessorEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={ef.thresholdActive} onChange={e => upd(ctx)({ thresholdActive: e.target.checked })} />
              <span className="rack-row-label">Threshold</span>
            </div>
            {ef.thresholdActive && (
              <>
                <Slider label="Value" min={0} max={1} step={0.01} resetValue={0.5} value={ef.thresholdValue} onChange={v => upd(ctx)({ thresholdValue: v })} />
                <Slider label="Softness" min={0} max={0.5} step={0.01} resetValue={0.05} value={ef.thresholdSoftness} onChange={v => upd(ctx)({ thresholdSoftness: v })} />
              </>
            )}
          </div>
        );
      }
    },
    { id: 'edge', label: 'Edge Detect', render: ctx => {
        const ef = eff<PixelProcessorEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={ef.edgeActive} onChange={e => upd(ctx)({ edgeActive: e.target.checked })} />
              <span className="rack-row-label">Edge Detect</span>
            </div>
            {ef.edgeActive && (
              <>
                <Slider label="Amount" min={0} max={2} step={0.01} resetValue={1.0} value={ef.edgeAmount} onChange={v => upd(ctx)({ edgeAmount: v })} />
                <Slider label="Threshold" min={0} max={0.2} step={0.001} resetValue={0.1} value={ef.edgeThreshold} onChange={v => upd(ctx)({ edgeThreshold: v })} />
              </>
            )}
          </div>
        );
      }
    },
    { id: 'bypass', label: 'Bypass', render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Bypass</span>
          <input type="checkbox" checked={eff<PixelProcessorEffect>(ctx).bypass} onChange={e => upd(ctx)({ bypass: e.target.checked })} />
        </div>
      )
    }
  ],
  AudioTransformer: [
    { id: 'filter', label: 'Filter', render: ctx => {
        const ef = eff<AudioTransformerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
              <span className="rack-row-label">Filter</span>
              <select value={ef.filterType} onChange={e => upd(ctx)({ filterType: e.target.value as any })} style={{ fontSize: 9, padding: '0 2px' }}>
                <option value="lowpass">LP</option>
                <option value="highpass">HP</option>
                <option value="bandpass">BP</option>
              </select>
            </div>
            <Slider label="Freq" min={20} max={10000} step={1} resetValue={1000} value={ef.filterFreq} onChange={v => upd(ctx)({ filterFreq: v })} />
            <Slider label="Resonance" min={0} max={1} step={0.01} resetValue={0.5} value={ef.filterResonance} onChange={v => upd(ctx)({ filterResonance: v })} />
          </div>
        );
      }
    },
    { id: 'comp', label: 'Comp / Level', render: ctx => {
        const ef = eff<AudioTransformerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
             <span className="rack-row-label">Sustain & Level</span>
             <Slider label="Sustain" min={0} max={1} step={0.01} resetValue={0.2} value={ef.compSustain} onChange={v => upd(ctx)({ compSustain: v })} />
             <Slider label="Output" min={0} max={2} step={0.01} resetValue={1.0} value={ef.outputGain} onChange={v => upd(ctx)({ outputGain: v })} />
          </div>
        );
      }
    },
    { id: 'bypass', label: 'Bypass', render: ctx => {
        const ef = eff<AudioTransformerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
               <input type="checkbox" checked={ef.bypass} onChange={e => upd(ctx)({ bypass: e.target.checked })} />
               <span className="rack-row-label">Bypass</span>
             </div>
             <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
               <input type="checkbox" checked={ef.bypassLatching} onChange={e => upd(ctx)({ bypassLatching: e.target.checked })} />
               <span className="rack-row-label" style={{ fontSize: 9 }}>Latching Mode</span>
             </div>
          </div>
        );
      }
    },
    { id: 'envelope', label: 'Env Follow', render: ctx => {
        const ef = eff<AudioTransformerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
             <span className="rack-row-label">Envelope</span>
             <Slider label="Attack" min={0.001} max={0.5} step={0.001} resetValue={0.01} value={ef.envelopeAttack} onChange={v => upd(ctx)({ envelopeAttack: v })} />
             <Slider label="Release" min={0.001} max={2.0} step={0.001} resetValue={0.1} value={ef.envelopeRelease} onChange={v => upd(ctx)({ envelopeRelease: v })} />
          </div>
        );
      }
    }
  ],
  AudioModulator: [
    { id: 'ringmod', label: 'Ring Mod', render: ctx => {
        const ef = eff<AudioModulatorEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
             <span className="rack-row-label">Ring Modulator</span>
             <Slider label="Freq" min={0.1} max={2000} step={0.1} resetValue={440} value={ef.ringFreq} onChange={v => upd(ctx)({ ringFreq: v })} />
             <Slider label="Mix" min={0} max={1} step={0.01} resetValue={0} value={ef.ringMix} onChange={v => upd(ctx)({ ringMix: v })} />
          </div>
        );
      }
    },
    { id: 'octave', label: 'Octave Bank', render: ctx => {
        const ef = eff<AudioModulatorEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
             <span className="rack-row-label">Octaves</span>
             <Slider label="-2 Oct" min={0} max={1} step={0.01} resetValue={0} value={ef.octaveSub2} onChange={v => upd(ctx)({ octaveSub2: v })} />
             <Slider label="-1 Oct" min={0} max={1} step={0.01} resetValue={0} value={ef.octaveSub1} onChange={v => upd(ctx)({ octaveSub1: v })} />
             <Slider label="Clean"  min={0} max={1} step={0.01} resetValue={1} value={ef.octaveClean} onChange={v => upd(ctx)({ octaveClean: v })} />
             <Slider label="+1 Oct" min={0} max={1} step={0.01} resetValue={0} value={ef.octaveHigh1} onChange={v => upd(ctx)({ octaveHigh1: v })} />
             <Slider label="+2 Oct" min={0} max={1} step={0.01} resetValue={0} value={ef.octaveHigh2} onChange={v => upd(ctx)({ octaveHigh2: v })} />
          </div>
        );
      }
    },
    { id: 'bypass', label: 'Bypass', render: ctx => {
        const ef = eff<AudioModulatorEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
               <input type="checkbox" checked={ef.bypass} onChange={e => upd(ctx)({ bypass: e.target.checked })} />
               <span className="rack-row-label">Bypass</span>
             </div>
          </div>
        );
      }
    },
  ],
  UVDisplace: [
    { id: 'amount', label: 'Amount',
      render: ctx => {
        const ef = eff<UVDisplaceEffect>(ctx);
        return (
          <Slider label="Depth" min={0} max={1} step={0.01} resetValue={0.2}
            value={ef.amount} onChange={v => upd(ctx)({ amount: v })} paramId="amount" ctx={ctx} />
        );
      }
    },
    { id: 'axes', label: 'Scale X/Y',
      render: ctx => {
        const ef = eff<UVDisplaceEffect>(ctx);
        return (
          <div className="rack-row-content">
            <Slider label="X" min={0} max={2} step={0.05} resetValue={1.0}
              value={ef.amountX ?? 1.0} onChange={v => upd(ctx)({ amountX: v })} paramId="amountX" ctx={ctx} />
            <Slider label="Y" min={0} max={2} step={0.05} resetValue={1.0}
              value={ef.amountY ?? 1.0} onChange={v => upd(ctx)({ amountY: v })} paramId="amountY" ctx={ctx} />
          </div>
        );
      }
    },
    { id: 'mode', label: 'Mode',
      render: ctx => {
        const ef = eff<UVDisplaceEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', gap: 4 }}>
            {(['cartesian', 'radial', 'luma'] as const).map(m => (
              <button key={m}
                className={`mode-toggle ${ef.mode === m ? 'active' : ''}`}
                style={{ flex: 1, textTransform: 'capitalize', fontSize: 10, padding: '2px 4px' }}
                onClick={() => upd(ctx)({ mode: m })}
              >{m}</button>
            ))}
          </div>
        );
      }
    },
    { id: 'wrap', label: 'Wrap',
      render: ctx => {
        const ef = eff<UVDisplaceEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', gap: 4 }}>
            {(['clamp', 'wrap', 'mirror'] as const).map(w => (
              <button key={w}
                className={`mode-toggle ${ef.wrapMode === w ? 'active' : ''}`}
                style={{ flex: 1, textTransform: 'capitalize', fontSize: 10, padding: '2px 4px' }}
                onClick={() => upd(ctx)({ wrapMode: w })}
              >{w}</button>
            ))}
          </div>
        );
      }
    }
  ],
  SpeechEnvelopeTracker: [],
  VocalPitchTracker: [],
  VowelFormantTracker: [],
  SpokenWordVisualizer: [],
};

