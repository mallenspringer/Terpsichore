import React from 'react';
import {
  AnySource, AnyEffect,
  ShapeGeneratorSource, VideoURLSource, VideoFileSource,
  WebcamCaptureSource, ImageLoaderSource, ImageFileSource,
  AudioInputSource, AudioFileSource, SystemAudioSource,
  LFOModulatorSource, TriggerPadSource, SignalProcessorSource,
  NoiseModulatorSource, NoiseVideoSource,
  Transform2DEffect, ColorAdjustEffect, LumaKeyEffect, SimpleFeedbackEffect,
  InterLayerOutputEffect, InterLayerInputEffect, ColorRGBEffect, LumaSplitterEffect,
  SpawnEffect, PathEffect, LogicGateEffect, TriggeredGateEffect, InverterEffect, VideoMixerEffect,
  PatternEffect, KaleidoscopeEffect, SignalMathEffect, SampleAndHoldEffect
} from '../../state/types';

// ── Context types ──────────────────────────────────────────────────────────────

export interface SourceCtx {
  source: AnySource;
  layer: any; // Using any to avoid circular import issues if necessary, but we'll try to use the type
  onChange: (key: string, value: any) => void;
  onUpdate?: (updates: Partial<AnySource>) => void;
  videoProgress?: { currentTime: number; duration: number };
  onSeek?: React.ChangeEventHandler<HTMLInputElement>;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onFileChange?: React.ChangeEventHandler<HTMLInputElement>;
  cameras?: MediaDeviceInfo[];
  layerOpacity?: number;
  layerBlendMode?: 'add' | 'screen' | 'multiply' | 'normal';
  onLayerUpdate?: (updates: any) => void;
}

export interface EffectCtx {
  effect: AnyEffect;
  layer: any;
  onUpdate: (updates: Partial<AnyEffect>) => void;
  linkedScales?: Record<string, boolean>;
  setLinkedScales?: (s: Record<string, boolean>) => void;
}

export type RowCtx = SourceCtx | EffectCtx;

export interface ControlRowDef {
  id: string;
  label: string;
  render: (ctx: RowCtx) => React.ReactNode;
}

// ── Helper shorthand ──────────────────────────────────────────────────────────

const src = <T extends AnySource>(ctx: RowCtx) => (ctx as SourceCtx).source as T;
const eff = <T extends AnyEffect>(ctx: RowCtx) => (ctx as EffectCtx).effect as T;
const chg = (ctx: RowCtx) => (ctx as SourceCtx).onChange;
const sup = (ctx: RowCtx) => (ctx as SourceCtx).onUpdate;
const upd = (ctx: RowCtx) => (ctx as EffectCtx).onUpdate;

const KEY_COLORS: Record<string, string> = {
  '1': '#ff4444', '2': '#ff8844', '3': '#ffcc44', '4': '#88cc00', '5': '#44ffcc',
  '6': '#4488ff', '7': '#8844ff', '8': '#cc44ff', '9': '#ff44cc', '0': '#ffffff'
};

const KeyMappingRow = ({ label, value, onChange, ctx }: { label: string, value: string, onChange: (v: string) => void, ctx: RowCtx }) => {
  const layer = (ctx as any).layer;
  const usedKeys = new Set<string>();
  if (layer) {
    Object.values(layer.modulators || {}).forEach((m: any) => {
      if (m.keyMapping && m.keyMapping !== 'none') usedKeys.add(m.keyMapping);
    });
    (layer.effects || []).forEach((e: any) => {
      if (e.keyMapping && e.keyMapping !== 'none') usedKeys.add(e.keyMapping);
    });
  }

  return (
    <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
      <span className="rack-row-label">{label}</span>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <select 
          value={value} 
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="none">None</option>
          {['1','2','3','4','5','6','7','8','9','0'].map(k => (
            <option key={k} value={k}>
              {k} {usedKeys.has(k) ? '●' : '○'}
            </option>
          ))}
        </select>
        {value !== 'none' && (
          <div style={{ 
            width: 8, height: 8, borderRadius: '50%', 
            background: KEY_COLORS[value] || '#fff',
            boxShadow: `0 0 4px ${KEY_COLORS[value] || '#fff'}`
          }} />
        )}
      </div>
    </div>
  );
};

const Slider = ({ label, min, max, step, value, onChange, resetValue = 0 }: {
  label?: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; resetValue?: number;
}) => (
  <div 
    className="rack-row-content" 
    onPointerDown={e => e.stopPropagation()} 
    onDragStart={e => e.stopPropagation()}
    onDoubleClick={() => onChange(resetValue)}
    title="Double-click to reset"
  >
    {label && <span className="rack-row-label">{label}: {value.toFixed(2)}</span>}
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={e => {
        e.stopPropagation();
        onChange(parseFloat(e.target.value));
      }} />
  </div>
);

// ── SOURCE ROW DEFINITIONS ────────────────────────────────────────────────────

export const SOURCE_ROWS: Record<string, ControlRowDef[]> = {

  ShapeGenerator: [
    { id: 'shapeType', label: 'Shape',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Shape Type</span>
          <select value={src<ShapeGeneratorSource>(ctx).shapeType} 
            onChange={e => { e.stopPropagation(); chg(ctx)('shapeType', e.target.value); }}>
            <option value="rectangle">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="polygon">Polygon</option>
          </select>
        </div>
      )
    },
    { id: 'sides', label: 'Sides',
      render: ctx => {
        const s = src<ShapeGeneratorSource>(ctx);
        if (s.shapeType !== 'polygon') return null;
        return <Slider label="Sides" min={3} max={32} step={1}
          value={s.sides ?? 3}
          onChange={v => chg(ctx)('sides', v)} />;
      }
    },
    { id: 'roundness', label: 'Roundness',
      render: ctx => <Slider label="Roundness" min={0} max={1} step={0.01}
        value={src<ShapeGeneratorSource>(ctx).roundness ?? 0}
        onChange={v => chg(ctx)('roundness', v)} />
    },
    { id: 'convexity', label: 'Convexity',
      render: ctx => {
        const s = src<ShapeGeneratorSource>(ctx);
        if (s.shapeType !== 'polygon') return null;
        return <Slider label="Star/Convex" min={-1} max={1} step={0.01}
          value={s.convexity ?? 0}
          onChange={v => chg(ctx)('convexity', v)} />;
      }
    },
    { id: 'x', label: 'X-Pos',
      render: ctx => <Slider label="X-Pos" min={-1} max={1} step={0.01}
        value={src<ShapeGeneratorSource>(ctx).x ?? 0}
        onChange={v => chg(ctx)('x', v)} />
    },
    { id: 'y', label: 'Y-Pos',
      render: ctx => <Slider label="Y-Pos" min={-1} max={1} step={0.01}
        value={src<ShapeGeneratorSource>(ctx).y ?? 0}
        onChange={v => chg(ctx)('y', v)} />
    },
    { id: 'scale', label: 'Scale',
      render: ctx => <Slider label="Scale" min={0} max={2} step={0.01}
        value={src<ShapeGeneratorSource>(ctx).scale ?? 1}
        onChange={v => chg(ctx)('scale', v)} />
    },
    { id: 'rotation', label: 'Internal Rot',
      render: ctx => {
        const s = src<ShapeGeneratorSource>(ctx);
        const deg = s.rotation ?? 0;
        return (
          <div className="rack-row-content" style={{ gap: 4 }}>
            <Slider label="Internal Rot" min={-180} max={180} step={1}
              value={deg} 
              onChange={v => chg(ctx)('rotation', v)} />
            <input type="number" value={deg} 
              onChange={e => chg(ctx)('rotation', parseFloat(e.target.value) || 0)}
              style={{ width: 40, background: '#111', color: '#88cc00', border: '1px solid #333', fontSize: 10, padding: '0 2px' }} />
            <span style={{ fontSize: 9, color: '#555' }}>°</span>
          </div>
        );
      }
    },
    { id: 'strokeWidth', label: 'Stroke',
      render: ctx => {
        const s = src<ShapeGeneratorSource>(ctx);
        const mode = s.strokeMode ?? 'classic';
        return (
          <div className="rack-row-content" style={{ gap: 4 }}>
            <Slider label="Stroke Width" min={0} max={1} step={0.01}
              value={s.strokeWidth ?? 0}
              onChange={v => chg(ctx)('strokeWidth', v)} />
            <button
              className={`patchbay-bipolar-toggle ${mode === 'hollow' ? 'active' : ''}`}
              style={{ width: 16, height: 16, fontSize: 10, padding: 0, border: '1px solid #444', background: mode === 'hollow' ? '#88cc00' : '#222', color: mode === 'hollow' ? '#000' : '#aaa', cursor: 'pointer', borderRadius: 2 }}
              title={mode === 'hollow' ? 'Mode 2: Hollow Out' : 'Mode 1: Classic (Gate)'}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); chg(ctx)('strokeMode', mode === 'classic' ? 'hollow' : 'classic'); }}
            >
              {mode === 'hollow' ? '◎' : '◩'}
            </button>
            <input type="number" value={s.strokeThreshold ?? 0.1} 
              title={mode === 'classic' ? 'Gate Threshold' : 'Hollow Threshold'}
              onChange={e => chg(ctx)('strokeThreshold', parseFloat(e.target.value) || 0)}
              step={0.01} min={0} max={1}
              style={{ width: 35, background: '#111', color: '#88cc00', border: '1px solid #333', fontSize: 9, padding: '0 2px' }} />
          </div>
        );
      }
    },
    { id: 'edgeSoftness', label: 'Softness',
      render: ctx => <Slider label="Edge Softness" min={0} max={1} step={0.01}
        value={src<ShapeGeneratorSource>(ctx).edgeSoftness}
        onChange={v => chg(ctx)('edgeSoftness', v)} />
    },
  ],

  VideoURL: [
    { id: 'videoUrl', label: 'URL',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Video URL</span>
          <input type="text" value={src<VideoURLSource>(ctx).videoUrl} 
            onChange={e => { e.stopPropagation(); chg(ctx)('videoUrl', e.target.value); }} />
        </div>
      )
    },
    { id: 'transport', label: 'Transport',
      render: ctx => {
        const s = src<VideoURLSource>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Transport</span>
            <div className="rack-transport">
              <button className={s.playState === 'play' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','play'); }}>▶</button>
              <button className={s.playState === 'pause' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','pause'); }}>⏸</button>
              <button className={s.playState === 'stop' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','stop'); }}>⏹</button>
            </div>
          </div>
        );
      }
    },
    { id: 'timeline', label: 'Timeline',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        const vp = sCtx.videoProgress;
        const s = src<VideoURLSource>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Timeline</span>
            <div className="rack-timeline-wrap">
              <span className="rack-timeline-time">{(vp?.currentTime ?? 0).toFixed(1)}s</span>
              <div className="timeline-container" style={{ flex: 1 }}>
                <div className="timeline-track" />
                <input type="range" className="timeline-input" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={vp?.currentTime ?? 0} 
                  onChange={e => { e.stopPropagation(); sCtx.onSeek?.(e); }}
                  onPointerDown={e => { e.stopPropagation(); sCtx.onSeekStart?.(); }}
                  onPointerUp={e => { e.stopPropagation(); sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-start" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopStart ?? 0} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopStart', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={e => { e.stopPropagation(); sCtx.onSeekStart?.(); }}
                  onPointerUp={e => { e.stopPropagation(); sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-end" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopEnd ?? (vp?.duration || 0.001)} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopEnd', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={e => { e.stopPropagation(); sCtx.onSeekStart?.(); }}
                  onPointerUp={e => { e.stopPropagation(); sCtx.onSeekEnd?.(); }}
                />
              </div>
              <span className="rack-timeline-time">{(vp?.duration ?? 0).toFixed(1)}s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', marginTop: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                In: <input type="number" step={0.1} min={0} max={vp?.duration || 1} value={s.loopStart ?? 0}
                  onChange={e => chg(ctx)('loopStart', parseFloat(e.target.value) || 0)}
                  style={{ width: 40, padding: 1, fontSize: 9, background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 2 }} />s
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                Out: <input type="number" step={0.1} min={0} max={vp?.duration || 1} value={s.loopEnd ?? (vp?.duration || 1)}
                  onChange={e => chg(ctx)('loopEnd', parseFloat(e.target.value) || 0)}
                  style={{ width: 40, padding: 1, fontSize: 9, background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 2 }} />s
              </label>
            </div>
          </div>
        );
      }
    },
    { id: 'playbackSpeed', label: 'Speed',
      render: ctx => <Slider label="Playback Speed" min={0.1} max={4} step={0.1}
        value={src<VideoURLSource>(ctx).playbackSpeed} onChange={v => chg(ctx)('playbackSpeed', v)} />
    },
    { id: 'objectFit', label: 'Fit',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Object Fit</span>
          <select value={src<VideoURLSource>(ctx).objectFit} 
            onChange={e => { e.stopPropagation(); chg(ctx)('objectFit', e.target.value); }}>
            <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
          </select>
        </div>
      )
    },
    { id: 'loop', label: 'Loop',
      render: ctx => (
        <div className="rack-row-content" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Loop</span>
          <input type="checkbox" checked={src<VideoURLSource>(ctx).loop} onChange={e => chg(ctx)('loop', e.target.checked)} />
        </div>
      )
    },
    { id: 'volume', label: 'Volume',
      render: ctx => <Slider label="Volume" min={0} max={1} step={0.01}
        resetValue={1}
        value={src<VideoURLSource>(ctx).volume ?? 1} onChange={v => chg(ctx)('volume', v)} />
    },
  ],

  VideoFile: [
    { id: 'filePick', label: 'File',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Local Video</span>
            <input type="file" accept="video/*" onChange={e => { e.stopPropagation(); sCtx.onFileChange?.(e); }} />
            <span style={{ fontSize: 8, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {src<VideoFileSource>(ctx).fileName}
            </span>
          </div>
        );
      }
    },
    { id: 'transport', label: 'Transport',
      render: ctx => {
        const s = src<VideoFileSource>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Transport</span>
            <div className="rack-transport">
              <button className={s.playState === 'play' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','play'); }}>▶</button>
              <button className={s.playState === 'pause' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','pause'); }}>⏸</button>
              <button className={s.playState === 'stop' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','stop'); }}>⏹</button>
            </div>
          </div>
        );
      }
    },
    { id: 'timeline', label: 'Timeline',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        const vp = sCtx.videoProgress;
        const s = src<VideoFileSource>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Timeline</span>
            <div className="rack-timeline-wrap">
              <span className="rack-timeline-time">{(vp?.currentTime ?? 0).toFixed(1)}s</span>
              <div className="timeline-container" style={{ flex: 1 }}>
                <div className="timeline-track" />
                <input type="range" className="timeline-input" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={vp?.currentTime ?? 0} 
                  onChange={e => { e.stopPropagation(); sCtx.onSeek?.(e); }}
                  onPointerDown={e => { e.stopPropagation(); sCtx.onSeekStart?.(); }}
                  onPointerUp={e => { e.stopPropagation(); sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-start" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopStart ?? 0} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopStart', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={e => { e.stopPropagation(); sCtx.onSeekStart?.(); }}
                  onPointerUp={e => { e.stopPropagation(); sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-end" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopEnd ?? (vp?.duration || 0.001)} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopEnd', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={e => { e.stopPropagation(); sCtx.onSeekStart?.(); }}
                  onPointerUp={e => { e.stopPropagation(); sCtx.onSeekEnd?.(); }}
                />
              </div>
              <span className="rack-timeline-time">{(vp?.duration ?? 0).toFixed(1)}s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', marginTop: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                In: <input type="number" step={0.1} min={0} max={vp?.duration || 1} value={s.loopStart ?? 0}
                  onChange={e => chg(ctx)('loopStart', parseFloat(e.target.value) || 0)}
                  style={{ width: 40, padding: 1, fontSize: 9, background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 2 }} />s
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                Out: <input type="number" step={0.1} min={0} max={vp?.duration || 1} value={s.loopEnd ?? (vp?.duration || 1)}
                  onChange={e => chg(ctx)('loopEnd', parseFloat(e.target.value) || 0)}
                  style={{ width: 40, padding: 1, fontSize: 9, background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 2 }} />s
              </label>
            </div>
          </div>
        );
      }
    },
    { id: 'playbackSpeed', label: 'Speed',
      render: ctx => <Slider label="Playback Speed" min={0.1} max={4} step={0.1}
        value={src<VideoFileSource>(ctx).playbackSpeed} onChange={v => chg(ctx)('playbackSpeed', v)} />
    },
    { id: 'objectFit', label: 'Fit',
      render: ctx => (
        <div className="rack-row-content">
          <span className="rack-row-label">Object Fit</span>
          <select value={src<VideoFileSource>(ctx).objectFit} onChange={e => chg(ctx)('objectFit', e.target.value)}>
            <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
          </select>
        </div>
      )
    },
    { id: 'loop', label: 'Loop',
      render: ctx => (
        <div className="rack-row-content" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Loop</span>
          <input type="checkbox" checked={src<VideoFileSource>(ctx).loop} onChange={e => chg(ctx)('loop', e.target.checked)} />
        </div>
      )
    },
    { id: 'volume', label: 'Volume',
      render: ctx => <Slider label="Volume" min={0} max={1} step={0.01}
        resetValue={1}
        value={src<VideoFileSource>(ctx).volume ?? 1} onChange={v => chg(ctx)('volume', v)} />
    },
  ],

  WebcamCapture: [
    { id: 'deviceId', label: 'Camera',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Camera Device</span>
            <select value={src<WebcamCaptureSource>(ctx).deviceId} 
              onChange={e => { e.stopPropagation(); chg(ctx)('deviceId', e.target.value); }}>
              <option value="">Default Camera</option>
              {(sCtx.cameras ?? []).map(cam => (
                <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera (${cam.deviceId.slice(0,5)}...)`}</option>
              ))}
            </select>
          </div>
        );
      }
    },
    { id: 'objectFit', label: 'Fit',
      render: ctx => (
        <div className="rack-row-content">
          <span className="rack-row-label">Object Fit</span>
          <select value={src<WebcamCaptureSource>(ctx).objectFit} onChange={e => chg(ctx)('objectFit', e.target.value)}>
            <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
          </select>
        </div>
      )
    },
  ],
  LFO: [
    { id: 'waveform', label: 'Wave',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Waveform</span>
          <select value={src<LFOModulatorSource>(ctx).waveform} onChange={e => chg(ctx)('waveform', e.target.value)}>
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
            <option value="square">Square</option>
            <option value="saw">Saw</option>
            <option value="random">Random</option>
          </select>
        </div>
      )
    },
    { id: 'frequency', label: 'Rate',
      render: ctx => {
        const lfo = src<LFOModulatorSource>(ctx);
        const isLow = lfo.speedRange === 'low';
        return (
          <>
            <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="rack-row-label">Range</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button 
                  className={`mode-toggle ${isLow ? 'active' : ''}`} 
                  style={{ minWidth: 24, padding: '0 4px' }} 
                  onClick={() => {
                    const u = sup(ctx);
                    if (u) u({ speedRange: 'low', frequency: Math.min(lfo.frequency, 4.0) });
                    else {
                      chg(ctx)('speedRange', 'low');
                      if (lfo.frequency > 4.0) chg(ctx)('frequency', 4.0);
                    }
                  }}
                >L</button>
                <button 
                  className={`mode-toggle ${!isLow ? 'active' : ''}`} 
                  style={{ minWidth: 24, padding: '0 4px' }} 
                  onClick={() => {
                    const u = sup(ctx);
                    const snapped = Math.max(1.0, Math.round(lfo.frequency));
                    if (u) u({ speedRange: 'high', frequency: snapped });
                    else {
                      chg(ctx)('speedRange', 'high');
                      chg(ctx)('frequency', snapped);
                    }
                  }}
                >H</button>
              </div>
            </div>
            <Slider 
              label={`Rate (${isLow ? 'Hz' : 'Hz'})`} 
              min={isLow ? 0.1 : 1.0} 
              max={isLow ? 4.0 : 60.0} 
              step={isLow ? 0.01 : 1.0} 
              value={lfo.frequency} 
              onChange={v => chg(ctx)('frequency', v)} 
            />
          </>
        );
      }
    },
    { id: 'amplitude', label: 'Amp',
      render: ctx => <Slider label="Amplitude" min={0} max={1} step={0.01} value={src<LFOModulatorSource>(ctx).amplitude} onChange={v => chg(ctx)('amplitude', v)} />
    },
    { id: 'offset', label: 'Offset',
      render: ctx => <Slider label="Offset" min={-1} max={1} step={0.01} value={src<LFOModulatorSource>(ctx).offset} onChange={v => chg(ctx)('offset', v)} />
    },
    { id: 'bipolar', label: 'Polarity',
      render: ctx => {
        const bip = src<LFOModulatorSource>(ctx).bipolar;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Bipolar (-1 to 1)</span>
            <input type="checkbox" checked={bip} onChange={e => chg(ctx)('bipolar', e.target.checked)} />
          </div>
        );
      }
    }
  ],

  TriggerPad: [
    { id: 'trigger', label: 'Trigger',
      render: ctx => (
        <button 
          className={`rack-trigger-btn ${src<TriggerPadSource>(ctx).isPressed ? 'active' : ''}`}
          onPointerDown={e => { e.stopPropagation(); chg(ctx)('isPressed', true); }}
          onPointerUp={e => { e.stopPropagation(); chg(ctx)('isPressed', false); }}
          onPointerLeave={e => { e.stopPropagation(); chg(ctx)('isPressed', false); }}
          style={{ width: '100%', height: 40, background: '#111', border: '2px solid #333', color: '#88cc00', fontWeight: 'bold' }}
        >
          {src<TriggerPadSource>(ctx).keyMapping !== 'none' ? `TRIG [${src<TriggerPadSource>(ctx).keyMapping}]` : 'TRIGGER'}
        </button>
      )
    },
    { id: 'keyMapping', label: 'Key',
      render: ctx => <KeyMappingRow label="Key Map" value={src<TriggerPadSource>(ctx).keyMapping ?? 'none'} onChange={v => chg(ctx)('keyMapping', v)} ctx={ctx} />
    },
    { id: 'useEnvelope', label: 'Env',
      render: ctx => {
        const env = src<TriggerPadSource>(ctx).useEnvelope;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Use Envelope</span>
            <input type="checkbox" checked={env} onChange={e => chg(ctx)('useEnvelope', e.target.checked)} />
          </div>
        );
      }
    },
    { id: 'attack', label: 'Atk',
      render: ctx => src<TriggerPadSource>(ctx).useEnvelope ? <Slider label="Attack (s)" min={0} max={5} step={0.01} value={src<TriggerPadSource>(ctx).attack ?? 0.01} onChange={v => chg(ctx)('attack', v)} /> : null
    },
    { id: 'release', label: 'Rel',
      render: ctx => src<TriggerPadSource>(ctx).useEnvelope ? <Slider label="Release (s)" min={0} max={5} step={0.01} value={src<TriggerPadSource>(ctx).release ?? 0.1} onChange={v => chg(ctx)('release', v)} /> : null
    }
  ],
  Noise: [
    { id: 'noiseType', label: 'Type',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Noise Type</span>
          <select value={src<NoiseModulatorSource>(ctx).noiseType} onChange={e => chg(ctx)('noiseType', e.target.value)}>
            <option value="white">White</option>
            <option value="pink">Pink</option>
            <option value="brownian">Brownian</option>
            <option value="value">Value</option>
            <option value="perlin">Perlin</option>
          </select>
        </div>
      )
    },
    { id: 'frequency', label: 'Freq',
      render: ctx => <Slider label="Frequency" min={0.1} max={50} step={0.1} value={src<NoiseModulatorSource>(ctx).frequency} onChange={v => chg(ctx)('frequency', v)} />
    },
    { id: 'amplitude', label: 'Amp',
      render: ctx => <Slider label="Amplitude" min={0} max={1} step={0.01} value={src<NoiseModulatorSource>(ctx).amplitude} onChange={v => chg(ctx)('amplitude', v)} />
    },
    { id: 'octaves', label: 'Octaves',
      render: ctx => src<NoiseModulatorSource>(ctx).noiseType === 'perlin' ? <Slider label="Octaves" min={1} max={8} step={1} value={src<NoiseModulatorSource>(ctx).octaves} onChange={v => chg(ctx)('octaves', v)} /> : null
    },
    { id: 'persistence', label: 'Persist',
      render: ctx => src<NoiseModulatorSource>(ctx).noiseType === 'perlin' ? <Slider label="Persistence" min={0} max={1} step={0.01} value={src<NoiseModulatorSource>(ctx).persistence} onChange={v => chg(ctx)('persistence', v)} /> : null
    },
    { id: 'frozen', label: 'Lock',
      render: ctx => {
        const frozen = src<NoiseModulatorSource>(ctx).frozen;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label">Lock Value</span>
            <input type="checkbox" checked={frozen} onChange={e => chg(ctx)('frozen', e.target.checked)} />
            {frozen && (
              <button className="rack-small-btn" style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 8px', background: '#333', color: '#88cc00', border: '1px solid #444', borderRadius: 2 }}
                onClick={() => chg(ctx)('manualTriggerTime', Date.now())}>
                SAMPLE
              </button>
            )}
          </div>
        );
      }
    },
    { id: 'bipolar', label: 'Polarity',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Bipolar (-1 to 1)</span>
          <input type="checkbox" checked={src<NoiseModulatorSource>(ctx).bipolar} onChange={e => chg(ctx)('bipolar', e.target.checked)} />
        </div>
      )
    }
  ],
  NoiseSource: [
    { id: 'noiseType', label: 'Type',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Noise Type</span>
          <select value={src<NoiseVideoSource>(ctx).noiseType} onChange={e => chg(ctx)('noiseType', e.target.value)}>
            <option value="perlin">Perlin (fBm)</option>
            <option value="worley">Worley (Cellular)</option>
            <option value="white">White Noise (Snow)</option>
          </select>
        </div>
      )
    },
    { id: 'scale', label: 'Scale',
      render: ctx => <Slider label="Scale" min={0.1} max={20} step={0.1} value={src<NoiseVideoSource>(ctx).scale} onChange={v => chg(ctx)('scale', v)} />
    },
    { id: 'evolution', label: 'Evol',
      render: ctx => <Slider label="Evolution" min={0} max={10} step={0.1} value={src<NoiseVideoSource>(ctx).evolution} onChange={v => chg(ctx)('evolution', v)} />
    },
    { id: 'autoAnimate', label: 'Auto',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Auto Animate (3D)</span>
          <input type="checkbox" checked={src<NoiseVideoSource>(ctx).autoAnimate} onChange={e => chg(ctx)('autoAnimate', e.target.checked)} />
        </div>
      )
    },
    { id: 'flowSpeed', label: 'Speed',
      render: ctx => src<NoiseVideoSource>(ctx).autoAnimate ? <Slider label="Flow Speed" min={0} max={10} step={0.1} value={src<NoiseVideoSource>(ctx).flowSpeed} onChange={v => chg(ctx)('flowSpeed', v)} /> : null
    },
    { id: 'octaves', label: 'Octaves',
      render: ctx => <Slider label="Octaves" min={1} max={8} step={1} value={src<NoiseVideoSource>(ctx).octaves} onChange={v => chg(ctx)('octaves', v)} />
    },
    { id: 'persistence', label: 'Persist',
      render: ctx => <Slider label="Persistence" min={0} max={1} step={0.01} value={src<NoiseVideoSource>(ctx).persistence} onChange={v => chg(ctx)('persistence', v)} />
    },
    { id: 'brightness', label: 'Bright',
      render: ctx => <Slider label="Brightness" min={-1} max={1} step={0.01} value={src<NoiseVideoSource>(ctx).brightness ?? 0} onChange={v => chg(ctx)('brightness', v)} />
    },
    { id: 'contrast', label: 'Contrast',
      render: ctx => <Slider label="Contrast" min={0} max={4} step={0.01} value={src<NoiseVideoSource>(ctx).contrast ?? 1} onChange={v => chg(ctx)('contrast', v)} />
    },
    { id: 'seed', label: 'Seed',
      render: ctx => <Slider label="Seed" min={0} max={1000} step={1} value={src<NoiseVideoSource>(ctx).seed} onChange={v => chg(ctx)('seed', v)} />
    },
  ],


  ImageLoader: [
    { id: 'imageUrl', label: 'URL',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Image URL</span>
          <input type="text" value={src<ImageLoaderSource>(ctx).imageUrl} 
            onChange={e => { e.stopPropagation(); chg(ctx)('imageUrl', e.target.value); }} />
        </div>
      )
    },
    { id: 'objectFit', label: 'Fit',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Object Fit</span>
          <select value={src<ImageLoaderSource>(ctx).objectFit} 
            onChange={e => { e.stopPropagation(); chg(ctx)('objectFit', e.target.value); }}>
            <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
          </select>
        </div>
      )
    },
  ],

  ImageFile: [
    { id: 'filePick', label: 'File',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Local Image</span>
            <input type="file" accept="image/*" onChange={e => { e.stopPropagation(); sCtx.onFileChange?.(e); }} />
            <span style={{ fontSize: 8, color: '#555' }}>{src<ImageFileSource>(ctx).fileName}</span>
          </div>
        );
      }
    },
    { id: 'objectFit', label: 'Fit',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Object Fit</span>
          <select value={src<ImageFileSource>(ctx).objectFit} 
            onChange={e => { e.stopPropagation(); chg(ctx)('objectFit', e.target.value); }}>
            <option value="cover">Cover</option><option value="contain">Contain</option><option value="fill">Fill</option>
          </select>
        </div>
      )
    },
  ],

  AudioInput: [
    { id: 'deviceId', label: 'Device',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Input Device</span>
            <select value={src<AudioInputSource>(ctx).deviceId} 
              onChange={e => { e.stopPropagation(); chg(ctx)('deviceId', e.target.value); }}>
              <option value="">Default Input</option>
              {(sCtx.cameras ?? []).map(cam => (
                <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Audio (${cam.deviceId.slice(0,5)}...)`}</option>
              ))}
            </select>
          </div>
        );
      }
    },
    { id: 'volume', label: 'Volume',
      render: ctx => <Slider label="Volume" min={0} max={2} step={0.01} value={src<AudioInputSource>(ctx).volume} onChange={v => chg(ctx)('volume', v)} />
    },
  ],

  AudioFile: [
    { id: 'filePick', label: 'File',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Audio File</span>
            <input type="file" accept="audio/*" onChange={e => { e.stopPropagation(); sCtx.onFileChange?.(e); }} />
            <span style={{ fontSize: 8, color: '#555' }}>{src<AudioFileSource>(ctx).fileName}</span>
          </div>
        );
      }
    },
    { id: 'transport', label: 'Transport',
      render: ctx => {
        const s = src<AudioFileSource>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
            <span className="rack-row-label">Transport</span>
            <div className="rack-transport">
              <button className={s.playState === 'play' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','play'); }}>▶</button>
              <button className={s.playState === 'pause' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','pause'); }}>⏸</button>
              <button className={s.playState === 'stop' ? 'active' : ''} onClick={(e) => { e.stopPropagation(); chg(ctx)('playState','stop'); }}>⏹</button>
            </div>
          </div>
        );
      }
    },
    { id: 'volume', label: 'Volume',
      render: ctx => <Slider label="Volume" min={0} max={1} step={0.01} value={src<AudioFileSource>(ctx).volume} onChange={v => chg(ctx)('volume', v)} />
    },
    { id: 'loop', label: 'Loop',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Loop</span>
          <input type="checkbox" checked={src<AudioFileSource>(ctx).loop} 
            onChange={e => { e.stopPropagation(); chg(ctx)('loop', e.target.checked); }} />
        </div>
      )
    },
  ],

  SystemAudio: [
    { id: 'info', label: 'Info',
      render: () => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">System Audio</span>
          <span style={{ fontSize: 8, color: '#666' }}>Uses Screen Capture API. Ensure "Share System Audio" is checked.</span>
        </div>
      )
    },
    { id: 'volume', label: 'Volume',
      render: ctx => <Slider label="Volume" min={0} max={1} step={0.01} value={src<SystemAudioSource>(ctx).volume} onChange={v => chg(ctx)('volume', v)} />
    },
  ],

  SignalProcessor: [
    { id: 'operation', label: 'Op',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Operation</span>
          <select value={src<SignalProcessorSource>(ctx).operation} 
            onChange={e => { e.stopPropagation(); chg(ctx)('operation', e.target.value); }}>
             <option value="add">Add</option>
             <option value="subtract">Subtract</option>
             <option value="multiply">Multiply</option>
             <option value="divide">Divide</option>
             <option value="modulo">Modulo</option>
             <option value="pow">Power</option>
             <option value="min">Min</option>
             <option value="max">Max</option>
          </select>
        </div>
      )
    },
    { id: 'operandB', label: 'Fixed B',
      render: ctx => <Slider label="Fixed B" min={-10} max={10} step={0.01} value={src<SignalProcessorSource>(ctx).operandB} onChange={v => chg(ctx)('operandB', v)} />
    },
  ],
};

// ── EFFECT ROW DEFINITIONS ────────────────────────────────────────────────────
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

  AudioAnalyzer: [
    { id: 'smoothing', label: 'Smoothing',
      render: ctx => <Slider label="Smoothing" min={0} max={0.99} step={0.01}
        value={eff<any>(ctx).smoothing ?? 0}
        onChange={v => upd(ctx)({ smoothing: v })} />
    },
    { id: 'sensitivity', label: 'Sensitivity',
      render: ctx => <Slider label="Sensitivity" min={0.1} max={10} step={0.1}
        resetValue={1.0}
        value={eff<any>(ctx).sensitivity ?? 1.0}
        onChange={v => upd(ctx)({ sensitivity: v })} />
    },
    { id: 'logarithmic', label: 'Log Scale',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Perceived Vol (Log)</span>
          <input type="checkbox" checked={eff<any>(ctx).logarithmic}
            onChange={e => { e.stopPropagation(); upd(ctx)({ logarithmic: e.target.checked }); }} />
        </div>
      )
    },
  ],

  BipolarConverter: [
    { id: 'conversionMode', label: 'Mode',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Conversion Mode</span>
          <select value={eff<any>(ctx).conversionMode ?? 'to_bipolar'} 
            onChange={e => { e.stopPropagation(); upd(ctx)({ conversionMode: e.target.value as any }); }}>
            <option value="to_bipolar">Unipolar (0-1) → Bipolar (-1 to 1)</option>
            <option value="to_unipolar">Bipolar (-1 to 1) → Unipolar (0-1)</option>
          </select>
        </div>
      )
    },
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
            <Slider label="V1" min={0} max={2} step={0.01} resetValue={1} value={ef.v1} onChange={v => upd(ctx)({ v1: v })} />
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
    { id: 'v2', label: 'V2', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V2" min={0} max={2} step={0.01} resetValue={0} value={ef.v2} onChange={v => upd(ctx)({ v2: v })} />
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
    { id: 'v3', label: 'V3', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V3" min={0} max={2} step={0.01} resetValue={0} value={ef.v3} onChange={v => upd(ctx)({ v3: v })} />
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
    { id: 'v4', label: 'V4', render: ctx => {
        const ef = eff<VideoMixerEffect>(ctx);
        return (
          <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Slider label="V4" min={0} max={2} step={0.01} resetValue={0} value={ef.v4} onChange={v => upd(ctx)({ v4: v })} />
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
    { id: 'master', label: 'Master', render: ctx => <Slider label="Gain" min={0} max={2} step={0.01} resetValue={1} value={eff<VideoMixerEffect>(ctx).masterGain} onChange={v => upd(ctx)({ masterGain: v })} /> },
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
    { id: 'counts', label: 'Grid',
      render: ctx => {
        const ef = eff<PatternEffect>(ctx);
        return (
          <div className="rack-row-content">
            <Slider label="X" min={1} max={32} step={1} resetValue={2}
              value={ef.countX} onChange={v => upd(ctx)({ countX: v, countY: ef.syncCount ? v : ef.countY })} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 24 }}>
               <input type="checkbox" checked={ef.syncCount} title="Sync X/Y"
                 onChange={e => { e.stopPropagation(); upd(ctx)({ syncCount: e.target.checked, countY: e.target.checked ? ef.countX : ef.countY }); }} />
            </div>
            <Slider label="Y" min={1} max={32} step={1} resetValue={2}
              value={ef.syncCount ? ef.countX : ef.countY} 
              onChange={v => ef.syncCount ? upd(ctx)({ countX: v, countY: v }) : upd(ctx)({ countY: v })} />
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
              value={ef.spacingX} onChange={v => upd(ctx)({ spacingX: v, spacingY: ef.syncSpacing ? v : ef.spacingY })} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 24 }}>
               <input type="checkbox" checked={ef.syncSpacing} title="Sync X/Y"
                 onChange={e => { e.stopPropagation(); upd(ctx)({ syncSpacing: e.target.checked, spacingY: e.target.checked ? ef.spacingX : ef.spacingY }); }} />
            </div>
            <Slider label="Y" min={-1} max={1} step={0.01} resetValue={0}
              value={ef.syncSpacing ? ef.spacingX : ef.spacingY} 
              onChange={v => ef.syncSpacing ? upd(ctx)({ spacingX: v, spacingY: v }) : upd(ctx)({ spacingY: v })} />
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
              value={ef.offsetX} onChange={v => upd(ctx)({ offsetX: v, offsetY: ef.syncOffset ? v : ef.offsetY })} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 24 }}>
               <input type="checkbox" checked={ef.syncOffset} title="Sync X/Y"
                 onChange={e => { e.stopPropagation(); upd(ctx)({ syncOffset: e.target.checked, offsetY: e.target.checked ? ef.offsetX : ef.offsetY }); }} />
            </div>
            <Slider label="Y" min={-1} max={1} step={0.01} resetValue={0}
              value={ef.syncOffset ? ef.offsetX : ef.offsetY} 
              onChange={v => ef.syncOffset ? upd(ctx)({ offsetX: v, offsetY: v }) : upd(ctx)({ offsetY: v })} />
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
  ]
};
