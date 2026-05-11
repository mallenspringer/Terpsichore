import { AnySource, VideoURLSource, VideoFileSource, AnyEffect } from '../../state/types';
import { SourceCtx, EffectCtx } from './moduleControls';
import { MODULE_DISPLAY_NAMES } from './portDefs';

interface FoundationalPanelProps {
  nodeId: string | null;
  source: AnySource | null;
  sourceCtx: SourceCtx | null;
  effect: AnyEffect | null;
  effectCtx: EffectCtx | null;
  layerName?: string;
}

export function FoundationalPanel({ nodeId, source, sourceCtx, effect, effectCtx, layerName }: FoundationalPanelProps) {
  if (!nodeId || (!sourceCtx && !effectCtx)) {
    return (
      <div className="foundational-panel">
        <div className="foundational-panel-header">
          <span className="fp-dot" style={{ background: '#333' }} />
          Foundational
        </div>
        <div className="fp-empty">Select a layer to see foundational controls</div>
      </div>
    );
  }

  const type = nodeId === 'source' ? source?.type : effect?.type;
  if (!type) return null;

  const wireColor: Record<string, string> = {
    VideoFile: '#f5c518', VideoURL: '#f5c518', WebcamCapture: '#18e4f5',
    ShapeGenerator: '#d918f5', ImageFile: '#f5c518', ImageLoader: '#f5c518',
    Transform2D: '#f5c518', ColorAdjust: '#f5c518', LumaKey: '#f5c518', SimpleFeedback: '#f5c518'
  };
  const dotColor = wireColor[type] || '#888';

  return (
    <div className="foundational-panel">
      <div className="foundational-panel-header">
        <span className="fp-dot" style={{ background: dotColor }} />
        {MODULE_DISPLAY_NAMES[type] || type}
      </div>
      <div className="foundational-panel-body">
        {/* Layer-level Controls (Global for the selected layer) */}
        <div className="fp-row">
          <label>Layer Opacity: {(sourceCtx as any).layerOpacity?.toFixed(2) ?? '1.00'}</label>
          <input type="range" min={0} max={1} step={0.01} 
            value={(sourceCtx as any).layerOpacity ?? 1} 
            onChange={e => (sourceCtx as any).onLayerUpdate?.({ opacity: parseFloat(e.target.value) })} />
        </div>
        <div className="fp-row">
          <label>Blend Mode</label>
          <select value={(sourceCtx as any).layerBlendMode ?? 'normal'} 
            onChange={e => (sourceCtx as any).onLayerUpdate?.({ blendMode: e.target.value as any })}>
            <option value="normal">Normal</option>
            <option value="add">Add</option>
            <option value="screen">Screen</option>
            <option value="multiply">Multiply</option>
          </select>
        </div>
        <div className="fp-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label>Layer Audio Mute</label>
          <input type="checkbox" 
            checked={!!(sourceCtx as any).layerAudioMuted} 
            onChange={e => (sourceCtx as any).onLayerUpdate?.({ audioMuted: e.target.checked })} />
        </div>
        <div style={{ height: 1, background: '#222', margin: '4px 0' }} />

        {nodeId === 'source' && source && sourceCtx && (
          <>
            {(source.type === 'VideoFile' || source.type === 'VideoURL') && (
              <VideoFoundational source={source as VideoFileSource | VideoURLSource} ctx={sourceCtx} />
            )}
            {source.type === 'WebcamCapture' && (
              <div className="fp-row">
                <label>Camera</label>
                <select value={(source as any).deviceId} onChange={e => sourceCtx.onChange('deviceId', e.target.value)}
                  style={{ background: '#222', color: '#ccc', border: '1px solid #333', borderRadius: 3, padding: '3px 5px', fontFamily: 'inherit', fontSize: 10, width: '100%' }}>
                  <option value="">Default Camera</option>
                  {(sourceCtx.cameras ?? []).map(c => (
                    <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera (${c.deviceId.slice(0,5)}...)`}</option>
                  ))}
                </select>
              </div>
            )}
            {/* ... other source types ... */}
          </>
        )}
        {nodeId !== 'source' && effect && effectCtx && (
          <div className="fp-empty">
            Foundational controls for {effect.type} not yet defined.
            Use the module node rack for full control.
          </div>
        )}
      </div>
    </div>
  );
}

function VideoFoundational({ source, ctx }: {
  source: VideoFileSource | VideoURLSource;
  ctx: SourceCtx;
}) {
  const vp = ctx.videoProgress ?? { currentTime: 0, duration: 1 };
  return (
    <>
      {/* Transport */}
      <div>
        <div style={{ fontSize: 8, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Transport</div>
        <div className="fp-transport">
          <button className={source.playState === 'play' ? 'active' : ''} onClick={() => ctx.onChange('playState', 'play')}>▶ Play</button>
          <button className={source.playState === 'pause' ? 'active' : ''} onClick={() => ctx.onChange('playState', 'pause')}>⏸ Pause</button>
          <button className={source.playState === 'stop' ? 'active' : ''} onClick={() => ctx.onChange('playState', 'stop')}>⏹ Stop</button>
          <button className={source.audioMuted ? 'active' : ''} onClick={() => ctx.onChange('audioMuted', !source.audioMuted)} 
            style={{ marginLeft: 'auto', borderLeft: '1px solid #333' }}>
            {source.audioMuted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="fp-row">
        <label>Timeline — {vp.currentTime.toFixed(1)}s / {vp.duration.toFixed(1)}s</label>
        <div className="timeline-container" style={{ width: '100%', marginTop: 4 }}>
          <div className="timeline-track" />
          <input type="range" className="timeline-input" min={0} max={vp.duration || 0.001} step={0.1}
            value={vp.currentTime} 
            onChange={ctx.onSeek} 
            onPointerDown={() => ctx.onSeekStart?.()}
            onPointerUp={() => ctx.onSeekEnd?.()}
          />
          <input type="range" className="timeline-input flag-input flag-start" min={0} max={vp.duration || 0.001} step={0.1}
            value={source.loopStart ?? 0} 
            onChange={e => ctx.onChange('loopStart', parseFloat(e.target.value) || 0)}
            onPointerDown={() => ctx.onSeekStart?.()}
            onPointerUp={() => ctx.onSeekEnd?.()}
          />
          <input type="range" className="timeline-input flag-input flag-end" min={0} max={vp.duration || 0.001} step={0.1}
            value={source.loopEnd ?? (vp.duration || 0.001)} 
            onChange={e => ctx.onChange('loopEnd', parseFloat(e.target.value) || 0)}
            onPointerDown={() => ctx.onSeekStart?.()}
            onPointerUp={() => ctx.onSeekEnd?.()}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#555', marginTop: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            In:&nbsp;<input type="number" step={0.1} min={0} max={vp.duration || 1} value={source.loopStart ?? 0}
              onChange={e => ctx.onChange('loopStart', parseFloat(e.target.value) || 0)}
              style={{ width: 38, padding: 1, fontSize: 9, background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 2 }} />s
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            Out:&nbsp;<input type="number" step={0.1} min={0} max={vp.duration || 1} value={source.loopEnd ?? (vp.duration || 1)}
              onChange={e => ctx.onChange('loopEnd', parseFloat(e.target.value) || 0)}
              style={{ width: 38, padding: 1, fontSize: 9, background: '#1a1a1a', color: '#aaa', border: '1px solid #333', borderRadius: 2 }} />s
          </label>
        </div>
      </div>

      {/* Speed */}
      <div className="fp-row">
        <label>Speed: {source.playbackSpeed.toFixed(1)}×</label>
        <input type="range" min={0.1} max={4} step={0.1} value={source.playbackSpeed}
          onChange={e => ctx.onChange('playbackSpeed', parseFloat(e.target.value))} />
      </div>

      {/* File picker for VideoFile */}
      {source.type === 'VideoFile' && (
        <div className="fp-row">
          <label>File: {(source as VideoFileSource).fileName}</label>
          <input type="file" accept="video/*" onChange={ctx.onFileChange}
            style={{ fontSize: 9, color: '#888', width: '100%' }} />
        </div>
      )}
    </>
  );
}
