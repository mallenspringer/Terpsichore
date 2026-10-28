import {
  Transform2DEffect, ColorAdjustEffect, LumaKeyEffect, SimpleFeedbackEffect,
  InterLayerOutputEffect, InterLayerInputEffect, ColorRGBEffect, LumaSplitterEffect,
  SpawnEffect, PathEffect, LogicGateEffect, TriggeredGateEffect, InverterEffect, VideoMixerEffect,
  KeyMixerEffect, VideoMathEffect, UVDisplaceEffect, AudioToCVEffect,
  PatternEffect, KaleidoscopeEffect, SignalMathEffect, SampleAndHoldEffect,
  AudioSourceEffect, OscilloscopeEffect, SpectralSplitterEffect, PixelProcessorEffect,
  AudioTransformerEffect, AudioModulatorEffect, CanvasBackgroundEffect,
  AlphaAdjustEffect, ParticleCloudEffect, ColorPaletteEffect, ColorStop
} from '../../../state/types';
import { AudioEngine } from '../../../state/AudioEngine';
import { useEngineStore } from '../../../state/store';
import { SignalDispatcher } from '../../../state/SignalDispatcher';
import {
  ControlRowDef, EffectCtx,
  eff, upd,
  KeyMappingRow, Slider
} from './controlHelpers';

export const EFFECT_ROWS: Record<string, ControlRowDef[]> = {
  Spawn: [
    {
      id: 'emissionMode',
      label: 'Emission Mode',
      render: ctx => {
        const ef = eff<SpawnEffect>(ctx);
        const mode = ef.emissionMode || 'rate';
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">Emission</span>
              <select
                value={mode}
                onChange={e => upd(ctx)({ emissionMode: e.target.value as any })}
                style={{ flex: 1, background: '#111', color: '#ccc', border: '1px solid #333', fontSize: 10, borderRadius: 2 }}
              >
                <option value="rate">Continuous (Rate / Sec)</option>
                <option value="trigger">Trigger (Pulse Burst)</option>
                <option value="array">Static / Dynamic Array</option>
              </select>
            </div>
            {mode === 'rate' && (
              <Slider
                label="Rate (/s)"
                min={0.1}
                max={20}
                step={0.1}
                resetValue={3}
                value={ef.emitRate ?? 3}
                onChange={v => upd(ctx)({ emitRate: v })}
                paramId="rate_cv"
                ctx={ctx}
              />
            )}
            {mode === 'trigger' && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="rack-trigger-btn"
                  style={{
                    flex: 1,
                    height: 24,
                    background: '#1a1a1a',
                    border: '1px solid #88cc00',
                    color: '#88cc00',
                    fontSize: 10,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    borderRadius: 2
                  }}
                  onClick={() => upd(ctx)({ manualTriggerTime: Date.now() })}
                >
                  ⚡ SPAWN PULSE
                </button>
                <button
                  style={{
                    height: 24,
                    padding: '0 8px',
                    background: '#1a1a1a',
                    border: '1px solid #555',
                    color: '#aaa',
                    fontSize: 10,
                    cursor: 'pointer',
                    borderRadius: 2
                  }}
                  onClick={() => upd(ctx)({ manualResetTime: Date.now() })}
                  title="Clear all active clones"
                >
                  CLEAR
                </button>
              </div>
            )}
          </div>
        );
      }
    },
    {
      id: 'dissemination',
      label: 'Pattern & Angle',
      render: ctx => {
        const ef = eff<SpawnEffect>(ctx);
        const disMode = ef.disseminationMode || 'cone';
        const anchors = [
          { label: '↑', angle: 90 },
          { label: '→', angle: 0 },
          { label: '↓', angle: 270 },
          { label: '←', angle: 180 },
        ];
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">Pattern</span>
              <select
                value={disMode}
                onChange={e => upd(ctx)({ disseminationMode: e.target.value as any })}
                style={{ flex: 1, background: '#111', color: '#ccc', border: '1px solid #333', fontSize: 10, borderRadius: 2 }}
              >
                <option value="cone">Cone / Fountain</option>
                <option value="burst">Radial Burst (360°)</option>
                <option value="array">Geometric Ring</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Speed"
                min={0}
                max={2}
                step={0.01}
                resetValue={0.3}
                value={ef.speed ?? 0.3}
                onChange={v => upd(ctx)({ speed: v })}
                paramId="speed_cv"
                ctx={ctx}
              />
              {disMode === 'cone' && (
                <Slider
                  label="Spread"
                  min={0}
                  max={180}
                  step={1}
                  resetValue={45}
                  value={ef.coneSpread ?? 45}
                  onChange={v => upd(ctx)({ coneSpread: v })}
                />
              )}
            </div>
            {disMode === 'cone' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="rack-row-label" style={{ minWidth: 40 }}>Direct</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {anchors.map(a => (
                    <button
                      key={a.label}
                      onClick={() => upd(ctx)({ angle: a.angle })}
                      style={{
                        width: 18,
                        height: 18,
                        fontSize: 10,
                        padding: 0,
                        background: Math.round(ef.angle ?? 90) === a.angle ? '#88cc00' : '#222',
                        color: Math.round(ef.angle ?? 90) === a.angle ? '#000' : '#ccc',
                        border: '1px solid #444',
                        borderRadius: 2,
                        cursor: 'pointer'
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
                <div style={{ flex: 1 }}>
                  <Slider
                    label="Angle"
                    min={0}
                    max={360}
                    step={1}
                    resetValue={90}
                    value={ef.angle ?? 90}
                    onChange={v => upd(ctx)({ angle: v })}
                    paramId="angle_cv"
                    ctx={ctx}
                  />
                </div>
              </div>
            )}
          </div>
        );
      }
    },
    {
      id: 'forces',
      label: 'Forces & Spin',
      render: ctx => {
        const ef = eff<SpawnEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Gravity"
                min={-2}
                max={2}
                step={0.01}
                resetValue={0}
                value={ef.gravity ?? 0}
                onChange={v => upd(ctx)({ gravity: v })}
                paramId="gravity_cv"
                ctx={ctx}
              />
              <Slider
                label="Drag"
                min={0}
                max={0.5}
                step={0.01}
                resetValue={0.05}
                value={ef.drag ?? 0.05}
                onChange={v => upd(ctx)({ drag: v })}
              />
            </div>
            <Slider
              label="Spin"
              min={-5}
              max={5}
              step={0.05}
              resetValue={0}
              value={ef.spin ?? 0}
              onChange={v => upd(ctx)({ spin: v })}
            />
          </div>
        );
      }
    },
    {
      id: 'scaleDynamics',
      label: 'Scale & Lifecycle',
      render: ctx => {
        const ef = eff<SpawnEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Birth Scale"
                min={0.05}
                max={2.0}
                step={0.01}
                resetValue={0.4}
                value={ef.scale ?? 0.4}
                onChange={v => upd(ctx)({ scale: v })}
                paramId="scale"
                ctx={ctx}
              />
              <Slider
                label="End Scale"
                min={0.0}
                max={2.0}
                step={0.01}
                resetValue={0.1}
                value={ef.scaleEnd ?? 0.1}
                onChange={v => upd(ctx)({ scaleEnd: v })}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Max Count"
                min={1}
                max={64}
                step={1}
                resetValue={16}
                value={ef.maxCount ?? 16}
                onChange={v => upd(ctx)({ maxCount: v })}
              />
              <Slider
                label="Life (s)"
                min={0.2}
                max={10.0}
                step={0.1}
                resetValue={3.0}
                value={ef.lifetime ?? 3.0}
                onChange={v => upd(ctx)({ lifetime: v })}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ccc', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ef.fadeOut ?? true}
                  onChange={e => upd(ctx)({ fadeOut: e.target.checked })}
                />
                Fade Out
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <Slider
                  label="X"
                  min={-1}
                  max={1}
                  step={0.01}
                  resetValue={0}
                  value={ef.x ?? 0}
                  onChange={v => upd(ctx)({ x: v })}
                  paramId="x"
                  ctx={ctx}
                />
                <Slider
                  label="Y"
                  min={-1}
                  max={1}
                  step={0.01}
                  resetValue={0}
                  value={ef.y ?? 0}
                  onChange={v => upd(ctx)({ y: v })}
                  paramId="y"
                  ctx={ctx}
                />
              </div>
            </div>
          </div>
        );
      }
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

  AlphaAdjust: [
    {
      id: 'amount',
      label: 'Alpha Amount',
      render: ctx => {
        const ef = eff<AlphaAdjustEffect>(ctx);
        return (
          <Slider
            label="Alpha"
            min={0}
            max={1}
            step={0.01}
            resetValue={1.0}
            value={ef.amount ?? 1.0}
            onChange={v => upd(ctx)({ amount: v })}
            paramId="amount_cv"
            ctx={ctx}
          />
        );
      }
    },
    {
      id: 'options',
      label: 'Options',
      render: ctx => {
        const ef = eff<AlphaAdjustEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={ef.invertAmount ?? false}
                onChange={e => upd(ctx)({ invertAmount: e.target.checked })}
              />
              Invert (1 - α)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer', marginLeft: 'auto' }}>
              <input
                type="checkbox"
                checked={ef.bypass ?? false}
                onChange={e => upd(ctx)({ bypass: e.target.checked })}
              />
              Bypass
            </label>
          </div>
        );
      }
    },
    {
      id: 'bypassMode',
      label: 'Trig Mode',
      render: ctx => {
        const ef = eff<AlphaAdjustEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Bypass Trig</span>
            <select
              value={ef.bypassMode ?? 'momentary'}
              onChange={e => upd(ctx)({ bypassMode: e.target.value as any })}
            >
              <option value="momentary">Momentary</option>
              <option value="latch">Latching</option>
            </select>
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
  AudioToCV: [
    { id: 'mode', label: 'Mode',
      render: ctx => {
        const ef = eff<AudioToCVEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', gap: 4 }}>
            {(['envelope', 'rms', 'peak', 'db'] as const).map(m => (
              <button key={m}
                className={`mode-toggle ${ef.mode === m ? 'active' : ''}`}
                style={{ flex: 1, textTransform: 'uppercase', fontSize: 10, padding: '2px 4px' }}
                onClick={() => upd(ctx)({ mode: m })}
              >{m === 'envelope' ? 'Env' : m}</button>
            ))}
          </div>
        );
      }
    },
    { id: 'gain', label: 'Gain / Sens',
      render: ctx => <Slider label="Gain" min={0.1} max={5} step={0.05} resetValue={1.0} value={eff<AudioToCVEffect>(ctx).gain ?? 1.0} onChange={v => upd(ctx)({ gain: v })} paramId="gain" ctx={ctx} />
    },
    { id: 'timing', label: 'Response',
      render: ctx => {
        const ef = eff<AudioToCVEffect>(ctx);
        return ef.mode === 'envelope' ? (
          <div className="rack-row-content">
            <Slider label="Atk ms" min={1} max={250} step={1} resetValue={10} value={ef.attack ?? 10} onChange={v => upd(ctx)({ attack: v })} paramId="attack" ctx={ctx} />
            <Slider label="Rel ms" min={10} max={1000} step={5} resetValue={100} value={ef.release ?? 100} onChange={v => upd(ctx)({ release: v })} paramId="release" ctx={ctx} />
          </div>
        ) : (
          <div className="rack-row-content">
            <Slider label="Smoothing" min={0.0} max={0.95} step={0.02} resetValue={0.1} value={ef.smoothing ?? 0.1} onChange={v => upd(ctx)({ smoothing: v })} paramId="smoothing" ctx={ctx} />
          </div>
        );
      }
    },
    { id: 'gateAndPolarity', label: 'Gate & Polarity',
      render: ctx => {
        const ef = eff<AudioToCVEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Slider label="Gate Thresh" min={0.05} max={0.95} step={0.02} resetValue={0.4} value={ef.gateThreshold ?? 0.4} onChange={v => upd(ctx)({ gateThreshold: v })} paramId="gateThreshold" ctx={ctx} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={ef.bipolar ?? false} onChange={e => upd(ctx)({ bipolar: e.target.checked })} />
              ± Bipolar
            </label>
          </div>
        );
      }
    }
  ],
  CanvasBackground: [
    {
      id: 'mode',
      label: 'Mode',
      render: ctx => {
        const ef = eff<CanvasBackgroundEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Mode</span>
            <select
              value={ef.mode}
              onChange={e => upd(ctx)({ mode: e.target.value as any })}
            >
              <option value="solid">Solid Color</option>
              <option value="linear">Linear Gradient</option>
              <option value="radial">Radial Gradient</option>
            </select>
          </div>
        );
      }
    },
    {
      id: 'colors',
      label: 'Colors',
      render: ctx => {
        const ef = eff<CanvasBackgroundEffect>(ctx);
        const clamp = (v: number) => Math.max(0, Math.min(1, v));
        const toHex = (c: number) => Math.round(clamp(c) * 255).toString(16).padStart(2, '0');
        const colorToHex = (rgba: [number, number, number, number]) => `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`;
        const hexToRgba = (hex: string, alpha: number = 1): [number, number, number, number] => [
          parseInt(hex.substring(1, 3), 16) / 255,
          parseInt(hex.substring(3, 5), 16) / 255,
          parseInt(hex.substring(5, 7), 16) / 255,
          alpha
        ];

        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">{ef.mode === 'solid' ? 'Color' : 'Stops'}</span>
              <input
                type="color"
                title="Color A"
                value={colorToHex(ef.colorA)}
                onChange={e => upd(ctx)({ colorA: hexToRgba(e.target.value, ef.colorA[3]) })}
                style={{ border: '1px solid #444', background: 'transparent', width: 26, height: 20, cursor: 'pointer', borderRadius: 2, padding: 0 }}
              />
              {ef.mode !== 'solid' && (
                <>
                  <input
                    type="color"
                    title="Color B"
                    value={colorToHex(ef.colorB)}
                    onChange={e => upd(ctx)({ colorB: hexToRgba(e.target.value, ef.colorB[3]) })}
                    style={{ border: '1px solid #444', background: 'transparent', width: 26, height: 20, cursor: 'pointer', borderRadius: 2, padding: 0 }}
                  />
                  {ef.useThreeColors && (
                    <input
                      type="color"
                      title="Color C"
                      value={colorToHex(ef.colorC)}
                      onChange={e => upd(ctx)({ colorC: hexToRgba(e.target.value, ef.colorC[3]) })}
                      style={{ border: '1px solid #444', background: 'transparent', width: 26, height: 20, cursor: 'pointer', borderRadius: 2, padding: 0 }}
                    />
                  )}
                  <button
                    title="Swap A & B"
                    onClick={() => upd(ctx)({ colorA: ef.colorB, colorB: ef.colorA })}
                    style={{ fontSize: 10, padding: '1px 5px', background: '#222', color: '#aaa', border: '1px solid #444', borderRadius: 2, cursor: 'pointer' }}
                  >
                    ⇄
                  </button>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#aaa', marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={ef.useThreeColors}
                      onChange={e => upd(ctx)({ useThreeColors: e.target.checked })}
                    />
                    3 Colors
                  </label>
                </>
              )}
            </div>
          </div>
        );
      }
    },
    {
      id: 'orientation',
      label: 'Angle & Anchors',
      render: ctx => {
        const ef = eff<CanvasBackgroundEffect>(ctx);
        if (ef.mode !== 'linear') return null;

        const anchors = [
          { label: '↖', angle: 315 },
          { label: '↑', angle: 270 },
          { label: '↗', angle: 225 },
          { label: '←', angle: 180 },
          { label: '·', angle: 0 },
          { label: '→', angle: 0 },
          { label: '↙', angle: 135 },
          { label: '↓', angle: 90 },
          { label: '↘', angle: 45 },
        ];

        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">Anchors</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gap: 2 }}>
                {anchors.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => upd(ctx)({ angle: a.angle })}
                    style={{
                      width: 18,
                      height: 16,
                      fontSize: 9,
                      padding: 0,
                      background: Math.round(ef.angle) === a.angle ? '#88cc00' : '#222',
                      color: Math.round(ef.angle) === a.angle ? '#000' : '#bbb',
                      border: '1px solid #444',
                      borderRadius: 2,
                      cursor: 'pointer'
                    }}
                    title={`${a.label} (${a.angle}°)`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }}>
                <Slider
                  label="Angle"
                  min={0}
                  max={360}
                  step={1}
                  resetValue={45}
                  value={ef.angle}
                  onChange={v => upd(ctx)({ angle: v })}
                  paramId="angle"
                  ctx={ctx}
                />
              </div>
            </div>
          </div>
        );
      }
    },
    {
      id: 'spread',
      label: 'Spread',
      render: ctx => {
        const ef = eff<CanvasBackgroundEffect>(ctx);
        if (ef.mode === 'solid') return null;
        return (
          <Slider
            label="Spread / Bias"
            min={0.05}
            max={0.95}
            step={0.01}
            resetValue={0.5}
            value={ef.spread}
            onChange={v => upd(ctx)({ spread: v })}
            paramId="spread"
            ctx={ctx}
          />
        );
      }
    },
    {
      id: 'radialSettings',
      label: 'Radial Center & Radius',
      render: ctx => {
        const ef = eff<CanvasBackgroundEffect>(ctx);
        if (ef.mode !== 'radial') return null;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Center X"
                min={0}
                max={1}
                step={0.01}
                resetValue={0.5}
                value={ef.radialCenterX ?? 0.5}
                onChange={v => upd(ctx)({ radialCenterX: v })}
              />
              <Slider
                label="Center Y"
                min={0}
                max={1}
                step={0.01}
                resetValue={0.5}
                value={ef.radialCenterY ?? 0.5}
                onChange={v => upd(ctx)({ radialCenterY: v })}
              />
            </div>
            <Slider
              label="Radius"
              min={0.1}
              max={2.0}
              step={0.01}
              resetValue={0.7}
              value={ef.radialRadius ?? 0.7}
              onChange={v => upd(ctx)({ radialRadius: v })}
            />
          </div>
        );
      }
    },
    {
      id: 'lumaChroma',
      label: 'Luma & Chroma',
      render: ctx => {
        const ef = eff<CanvasBackgroundEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
            <Slider
              label="Luma"
              min={-1}
              max={1}
              step={0.01}
              resetValue={0}
              value={ef.luma ?? 0}
              onChange={v => upd(ctx)({ luma: v })}
              paramId="luma"
              ctx={ctx}
            />
            <Slider
              label="Chroma"
              min={-1}
              max={1}
              step={0.01}
              resetValue={0}
              value={ef.chroma ?? 0}
              onChange={v => upd(ctx)({ chroma: v })}
              paramId="chroma"
              ctx={ctx}
            />
          </div>
        );
      }
    }
  ],
  SpeechEnvelopeTracker: [],
  VocalPitchTracker: [],
  VowelFormantTracker: [],
  SpokenWordVisualizer: [],
  ParticleCloud: [
    {
      id: 'densityAndPalette',
      label: 'Density & Palette',
      render: ctx => {
        const ef = eff<ParticleCloudEffect>(ctx);
        const presets = [5000, 10000, 25000, 50000, 100000];
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">Palette</span>
              <select
                value={ef.colorPalette ?? 'neon'}
                onChange={e => upd(ctx)({ colorPalette: e.target.value as any })}
                style={{ flex: 1, background: '#111', color: '#ccc', border: '1px solid #333', fontSize: 10, borderRadius: 2 }}
              >
                <option value="neon">Neon Cyberpunk (Cyan/Magenta)</option>
                <option value="fire">Solar Fire (Ruby/Gold)</option>
                <option value="aurora">Aurora Borealis (Teal/Violet)</option>
                <option value="electric">Electric Plasma (Cobalt/Cyan)</option>
                <option value="starlight">Celestial Starlight (Ice/Lilac)</option>
                <option value="spectrum">Spectrum Rainbow</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">Count</span>
              <div style={{ display: 'flex', gap: 2, flex: 1 }}>
                {presets.map(p => (
                  <button
                    key={p}
                    onClick={() => upd(ctx)({ particleCount: p })}
                    style={{
                      flex: 1,
                      height: 18,
                      fontSize: 9,
                      padding: 0,
                      background: (ef.particleCount || 20000) === p ? '#88cc00' : '#222',
                      color: (ef.particleCount || 20000) === p ? '#000' : '#bbb',
                      border: '1px solid #444',
                      borderRadius: 2,
                      cursor: 'pointer'
                    }}
                  >
                    {p >= 1000 ? `${p / 1000}k` : p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ccc', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ef.blendMode !== 'alpha'}
                  onChange={e => upd(ctx)({ blendMode: e.target.checked ? 'additive' : 'alpha' })}
                />
                Additive Glow
              </label>
              <Slider
                label="Point Size"
                min={1}
                max={20}
                step={0.5}
                resetValue={4}
                value={ef.pointSize ?? 4}
                onChange={v => upd(ctx)({ pointSize: v })}
                paramId="size_cv"
                ctx={ctx}
              />
            </div>
          </div>
        );
      }
    },
    {
      id: 'emitter',
      label: 'Emitter & Shape',
      render: ctx => {
        const ef = eff<ParticleCloudEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="rack-row-label">Shape</span>
              <select
                value={ef.emitterShape ?? 'point'}
                onChange={e => upd(ctx)({ emitterShape: e.target.value as any })}
                style={{ flex: 1, background: '#111', color: '#ccc', border: '1px solid #333', fontSize: 10, borderRadius: 2 }}
              >
                <option value="point">Point Source</option>
                <option value="ring">Circular Ring</option>
                <option value="disc">Solid Disc</option>
                <option value="line">Horizontal Line</option>
              </select>
              <Slider
                label="Radius"
                min={0.01}
                max={1.0}
                step={0.01}
                resetValue={0.1}
                value={ef.emitterRadius ?? 0.1}
                onChange={v => upd(ctx)({ emitterRadius: v })}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Center X"
                min={-1}
                max={1}
                step={0.01}
                resetValue={0}
                value={ef.emitterX ?? 0}
                onChange={v => upd(ctx)({ emitterX: v })}
              />
              <Slider
                label="Center Y"
                min={-1}
                max={1}
                step={0.01}
                resetValue={0}
                value={ef.emitterY ?? 0}
                onChange={v => upd(ctx)({ emitterY: v })}
              />
            </div>
          </div>
        );
      }
    },
    {
      id: 'flowAndPhysics',
      label: 'Flow & Turbulence',
      render: ctx => {
        const ef = eff<ParticleCloudEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Speed"
                min={0.1}
                max={3.0}
                step={0.05}
                resetValue={0.8}
                value={ef.speed ?? 0.8}
                onChange={v => upd(ctx)({ speed: v })}
                paramId="speed_cv"
                ctx={ctx}
              />
              <Slider
                label="Spread"
                min={0.1}
                max={2.0}
                step={0.05}
                resetValue={0.5}
                value={ef.spread ?? 0.5}
                onChange={v => upd(ctx)({ spread: v })}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Turbulence"
                min={0}
                max={3.0}
                step={0.05}
                resetValue={1.0}
                value={ef.turbulence ?? 1.0}
                onChange={v => upd(ctx)({ turbulence: v })}
                paramId="turbulence_cv"
                ctx={ctx}
              />
              <Slider
                label="Noise Freq"
                min={0.1}
                max={5.0}
                step={0.1}
                resetValue={1.2}
                value={ef.noiseFreq ?? 1.2}
                onChange={v => upd(ctx)({ noiseFreq: v })}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Slider
                label="Gravity Y"
                min={-2}
                max={2}
                step={0.05}
                resetValue={0}
                value={ef.gravityY ?? 0}
                onChange={v => upd(ctx)({ gravityY: v })}
                paramId="gravity_cv"
                ctx={ctx}
              />
              <Slider
                label="Life (s)"
                min={0.5}
                max={10.0}
                step={0.1}
                resetValue={3.0}
                value={ef.lifetime ?? 3.0}
                onChange={v => upd(ctx)({ lifetime: v })}
              />
            </div>
          </div>
        );
      }
    },
    {
      id: 'burstAndAudio',
      label: 'Bursts & Audio React',
      render: ctx => {
        const ef = eff<ParticleCloudEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="rack-trigger-btn"
                style={{
                  flex: 1,
                  height: 24,
                  background: '#1a1a1a',
                  border: '1px solid #18e4f5',
                  color: '#18e4f5',
                  fontSize: 10,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  borderRadius: 2
                }}
                onClick={() => upd(ctx)({ burstTriggerTime: Date.now() })}
              >
                ⚡ SPARK BURST
              </button>
              <button
                style={{
                  height: 24,
                  padding: '0 8px',
                  background: '#1a1a1a',
                  border: '1px solid #555',
                  color: '#aaa',
                  fontSize: 10,
                  cursor: 'pointer',
                  borderRadius: 2
                }}
                onClick={() => upd(ctx)({ resetTriggerTime: Date.now() })}
                title="Respawn all particles"
              >
                RESET
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ccc', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={ef.audioReactivity !== false}
                  onChange={e => upd(ctx)({ audioReactivity: e.target.checked })}
                />
                Audio Kick
              </label>
              {ef.audioReactivity !== false && (
                <Slider
                  label="Audio Sens"
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  resetValue={1.0}
                  value={ef.audioSensitivity ?? 1.0}
                  onChange={v => upd(ctx)({ audioSensitivity: v })}
                />
              )}
            </div>
          </div>
        );
      }
    }
  ],
  ColorPalette: [
    {
      id: 'paletteOverview',
      label: 'Palette Ramp',
      render: ctx => {
        const ef = eff<ColorPaletteEffect>(ctx);
        const stops = ef.colors || [];

        const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
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
        };

        const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
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
        };

        const rgbaToHex = (c: [number, number, number, number]): string => {
          const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255).toString(16).padStart(2, '0');
          const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255).toString(16).padStart(2, '0');
          const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255).toString(16).padStart(2, '0');
          return `#${r}${g}${b}`;
        };

        const hexToRgba = (hex: string, alpha: number = 1.0): [number, number, number, number] => {
          const clean = hex.replace('#', '');
          const r = parseInt(clean.substring(0, 2), 16) / 255;
          const g = parseInt(clean.substring(2, 4), 16) / 255;
          const b = parseInt(clean.substring(4, 6), 16) / 255;
          return [r, g, b, alpha];
        };

        const sigs = SignalDispatcher.getInstance().getLatestSignals(ctx.layer.id);

        const getEffectiveColor = (stop: ColorStop): [number, number, number, number] => {
          const slotNum = stop.id.replace('c_', '');
          const cvVal = sigs[`${ef.id}.col_${slotNum}_cv`] ?? 0;
          if (cvVal !== 0) {
            const [h, s, l] = rgbToHsl(stop.color[0], stop.color[1], stop.color[2]);
            const effectiveS = s < 0.1 ? 0.85 : s;
            const newH = ((h + cvVal * 0.5) % 1.0 + 1.0) % 1.0;
            const [modR, modG, modB] = hslToRgb(newH, effectiveS, l);
            return [modR, modG, modB, stop.color[3] ?? 1.0];
          }
          return stop.color;
        };

        const activeStops = stops.filter(s => s.active);
        let gradientStyle = '#222';
        if (activeStops.length === 1) {
          gradientStyle = rgbaToHex(getEffectiveColor(activeStops[0]));
        } else if (activeStops.length > 1) {
          const totalWeight = activeStops.reduce((sum, s) => sum + Math.max(0.01, s.weight || 1.0), 0);
          const bounds: number[] = [0];
          let acc = 0;
          for (let i = 0; i < activeStops.length - 1; i++) {
            acc += Math.max(0.01, activeStops[i].weight || 1.0);
            bounds.push(acc / totalWeight);
          }
          bounds.push(1.0);

          const cssStops: string[] = [];
          if (ef.interpolation === 'stepped') {
            for (let i = 0; i < activeStops.length; i++) {
              const hex = rgbaToHex(getEffectiveColor(activeStops[i]));
              const p0 = Math.round(bounds[i] * 100);
              const p1 = Math.round(bounds[i + 1] * 100);
              cssStops.push(`${hex} ${p0}% ${p1}%`);
            }
          } else {
            // Linear & Smooth: proportional midpoints with pure color plateaus
            const mFirst = Math.round(((bounds[0] + bounds[1]) * 0.5) * 100);
            const mLast = Math.round(((bounds[activeStops.length - 1] + 1.0) * 0.5) * 100);
            const firstHex = rgbaToHex(getEffectiveColor(activeStops[0]));
            const lastHex = rgbaToHex(getEffectiveColor(activeStops[activeStops.length - 1]));
            cssStops.push(`${firstHex} 0%`);
            cssStops.push(`${firstHex} ${mFirst}%`);
            for (let i = 1; i < activeStops.length - 1; i++) {
              const hex = rgbaToHex(getEffectiveColor(activeStops[i]));
              const mid = Math.round(((bounds[i] + bounds[i + 1]) * 0.5) * 100);
              cssStops.push(`${hex} ${mid}%`);
            }
            cssStops.push(`${lastHex} ${mLast}%`);
            cssStops.push(`${lastHex} 100%`);
          }
          gradientStyle = `linear-gradient(to right, ${cssStops.join(', ')})`;
        }

        const addColorStop = () => {
          if (stops.length >= 8) return;
          const existingIds = new Set(stops.map(s => s.id));
          let nextSlot = 1;
          while (nextSlot <= 8 && existingIds.has(`c_${nextSlot}`)) {
            nextSlot++;
          }
          const vibrantList: [number, number, number, number][] = [
            [1.0, 0.08, 0.58, 1.0], // Neon Pink
            [1.0, 0.84, 0.0, 1.0],  // Electric Gold
            [0.4, 0.1, 1.0, 1.0],   // Violet
            [1.0, 0.35, 0.0, 1.0],  // Radiant Coral
            [0.1, 1.0, 0.5, 1.0],   // Mint Aqua
            [0.0, 0.6, 1.0, 1.0],   // Azure
            [1.0, 0.1, 0.1, 1.0],   // Crimson
            [0.8, 1.0, 0.1, 1.0],   // Lime
          ];
          const chosenColor = vibrantList[(stops.length - 1) % vibrantList.length];
          const newStop: ColorStop = {
            id: `c_${nextSlot <= 8 ? nextSlot : stops.length + 1}`,
            color: chosenColor,
            weight: 1.0,
            active: true
          };
          upd(ctx)({ colors: [...stops, newStop] });
        };

        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'column', gap: 8, width: '100%' }}>
            {/* Live Gradient Preview Strip */}
            <div style={{
              width: '100%',
              height: 18,
              borderRadius: 3,
              background: gradientStyle,
              border: '1px solid #444',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6)'
            }} />

            {/* Actions Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="rack-row-label" style={{ fontSize: 9 }}>Interp:</span>
                <select
                  value={ef.interpolation || 'smooth'}
                  onChange={e => upd(ctx)({ interpolation: e.target.value as any })}
                  style={{ background: '#111', color: '#ccc', border: '1px solid #333', fontSize: 10, borderRadius: 2, padding: '2px 4px' }}
                >
                  <option value="smooth">Smooth</option>
                  <option value="linear">Linear</option>
                  <option value="stepped">Stepped</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  style={{
                    background: '#222',
                    border: '1px solid #f58c18',
                    color: '#f58c18',
                    fontSize: 9,
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: 2,
                    cursor: 'pointer'
                  }}
                  onClick={() => upd(ctx)({ shuffleTriggerTime: Date.now() })}
                  title="Shuffle visual color order without altering weights or parameters"
                >
                  🎲 SHUFFLE
                </button>

                <button
                  type="button"
                  disabled={stops.length >= 8}
                  style={{
                    background: stops.length >= 8 ? '#1a1a1a' : '#884400',
                    border: '1px solid #f58c18',
                    color: stops.length >= 8 ? '#666' : '#fff',
                    fontSize: 9,
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: 2,
                    cursor: stops.length >= 8 ? 'not-allowed' : 'pointer'
                  }}
                  onClick={addColorStop}
                  title="Add new color channel (up to 8)"
                >
                  + Add Color
                </button>
              </div>
            </div>

            {/* Color Channels List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', marginTop: 2 }}>
              {stops.map((stop, idx) => {
                const slotNum = stop.id.replace('c_', '');
                const cvVal = sigs[`${ef.id}.col_${slotNum}_cv`] ?? 0;
                const effectiveCol = getEffectiveColor(stop);
                const isModulated = Math.abs(cvVal) > 0.001;

                return (
                  <div
                    key={stop.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      background: '#161616',
                      border: isModulated ? '1px solid #f58c18' : '1px solid #282828',
                      borderRadius: 3,
                      padding: '4px 6px'
                    }}
                  >
                    {/* Header line for this color stop */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 'bold', color: '#888' }}>
                          #{idx + 1}
                        </span>
                        <span style={{ fontSize: 9, color: '#f58c18', background: 'rgba(245, 140, 24, 0.15)', padding: '1px 4px', borderRadius: 2, fontWeight: 'bold' }}>
                          Col {slotNum} Jack
                        </span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#aaa', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={stop.active}
                            onChange={e => {
                              const newStops = stops.map((s, i) => i === idx ? { ...s, active: e.target.checked } : s);
                              upd(ctx)({ colors: newStops });
                            }}
                          />
                          Active
                        </label>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {/* Native Color Picker (Base Color) */}
                        <input
                          type="color"
                          value={rgbaToHex(stop.color)}
                          onChange={e => {
                            const newRgba = hexToRgba(e.target.value, stop.color[3] ?? 1.0);
                            const newStops = stops.map((s, i) => i === idx ? { ...s, color: newRgba } : s);
                            upd(ctx)({ colors: newStops });
                          }}
                          style={{
                            width: 20,
                            height: 18,
                            padding: 0,
                            border: '1px solid #444',
                            borderRadius: 2,
                            background: 'transparent',
                            cursor: 'pointer'
                          }}
                          title="Pick base color"
                        />

                        {/* Modulated Color Feedback Swatch */}
                        {isModulated && (
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 2,
                              background: rgbaToHex(effectiveCol),
                              border: '1px solid #f58c18',
                              boxShadow: '0 0 4px rgba(245, 140, 24, 0.6)'
                            }}
                            title={`Modulated by CV: ${cvVal.toFixed(2)}`}
                          />
                        )}

                        {/* Move Up Button */}
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            if (idx === 0) return;
                            const newStops = [...stops];
                            [newStops[idx - 1], newStops[idx]] = [newStops[idx], newStops[idx - 1]];
                            upd(ctx)({ colors: newStops });
                          }}
                          style={{
                            background: '#222',
                            border: '1px solid #333',
                            color: idx === 0 ? '#444' : '#aaa',
                            fontSize: 8,
                            padding: '1px 4px',
                            cursor: idx === 0 ? 'default' : 'pointer',
                            borderRadius: 2
                          }}
                          title="Move up in gradient ramp"
                        >
                          ▲
                        </button>

                        {/* Move Down Button */}
                        <button
                          type="button"
                          disabled={idx === stops.length - 1}
                          onClick={() => {
                            if (idx === stops.length - 1) return;
                            const newStops = [...stops];
                            [newStops[idx], newStops[idx + 1]] = [newStops[idx + 1], newStops[idx]];
                            upd(ctx)({ colors: newStops });
                          }}
                          style={{
                            background: '#222',
                            border: '1px solid #333',
                            color: idx === stops.length - 1 ? '#444' : '#aaa',
                            fontSize: 8,
                            padding: '1px 4px',
                            cursor: idx === stops.length - 1 ? 'default' : 'pointer',
                            borderRadius: 2
                          }}
                          title="Move down in gradient ramp"
                        >
                          ▼
                        </button>

                        {/* Delete Button */}
                        {stops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newStops = stops.filter((_, i) => i !== idx);
                              upd(ctx)({ colors: newStops });
                            }}
                            style={{
                              background: '#331111',
                              border: '1px solid #662222',
                              color: '#ff6666',
                              fontSize: 9,
                              padding: '1px 5px',
                              cursor: 'pointer',
                              borderRadius: 2
                            }}
                            title="Remove color channel"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Weight Slider */}
                    <div style={{ marginTop: 2 }}>
                      <Slider
                        label="Weight"
                        min={0.1}
                        max={10.0}
                        step={0.1}
                        resetValue={1.0}
                        value={stop.weight || 1.0}
                        onChange={v => {
                          const newStops = stops.map((s, i) => i === idx ? { ...s, weight: v } : s);
                          upd(ctx)({ colors: newStops });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }
    }
  ]
};

