import { useState, useEffect } from 'react';
import {
  ShapeGeneratorSource, VideoURLSource, VideoFileSource,
  WebcamCaptureSource, ImageLoaderSource, ImageFileSource,
  AudioInputSource, AudioFileSource, SystemAudioSource,
  LFOModulatorSource, TriggerPadSource,
  NoiseModulatorSource, NoiseVideoSource, ColorNoiseSource,
  MidiInputSource
} from '../../../state/types';
import { AudioEngine } from '../../../state/AudioEngine';
import { MidiManager } from '../../../state/MidiManager';
import {
  ControlRowDef, SourceCtx,
  src, eff, chg, sup,
  KeyMappingRow, VUMeter, Slider
} from './controlHelpers';

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
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
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
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
            <span className="rack-row-label">Timeline</span>
            <div className="rack-timeline-wrap">
              <span className="rack-timeline-time">{(vp?.currentTime ?? 0).toFixed(1)}s</span>
              <div className="timeline-container" style={{ flex: 1 }}>
                <div className="timeline-track" />
                <input type="range" className="timeline-input" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={vp?.currentTime ?? 0} 
                  onChange={e => { e.stopPropagation(); sCtx.onSeek?.(e); }}
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-start" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopStart ?? 0} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopStart', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-end" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopEnd ?? (vp?.duration || 0.001)} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopEnd', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
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
        value={src<VideoURLSource>(ctx).playbackSpeed} onChange={v => chg(ctx)('playbackSpeed', v)} paramId="playbackSpeed" ctx={ctx} />
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
        value={src<VideoURLSource>(ctx).volume ?? 1} onChange={v => chg(ctx)('volume', v)} paramId="volume" ctx={ctx} />
    },
  ],

  VideoFile: [
    { id: 'filePick', label: 'File',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
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
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
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
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
            <span className="rack-row-label">Timeline</span>
            <div className="rack-timeline-wrap">
              <span className="rack-timeline-time">{(vp?.currentTime ?? 0).toFixed(1)}s</span>
              <div className="timeline-container" style={{ flex: 1 }}>
                <div className="timeline-track" />
                <input type="range" className="timeline-input" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={vp?.currentTime ?? 0} 
                  onChange={e => { e.stopPropagation(); sCtx.onSeek?.(e); }}
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-start" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopStart ?? 0} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopStart', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-end" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopEnd !== undefined ? s.loopEnd : (vp?.duration || 0)} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopEnd', parseFloat(e.target.value)); }} 
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
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
        value={src<VideoFileSource>(ctx).playbackSpeed} onChange={v => chg(ctx)('playbackSpeed', v)} paramId="playbackSpeed" ctx={ctx} />
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
        value={src<VideoFileSource>(ctx).volume ?? 1} onChange={v => chg(ctx)('volume', v)} paramId="volume" ctx={ctx} />
    },
  ],

  WebcamCapture: [
    { id: 'deviceId', label: 'Camera',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
            <span className="rack-row-label">Camera Device</span>
            <select value={src<WebcamCaptureSource>(ctx).deviceId} 
              onChange={e => { e.stopPropagation(); chg(ctx)('deviceId', e.target.value); }}>
              <option value="">Default Camera</option>
              {(sCtx.cameras ?? []).map((cam: any) => (
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

  MidiInput: [
    { id: 'channel', label: 'Chan',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">MIDI Channel</span>
          <select value={src<MidiInputSource>(ctx).channel} onChange={e => {
            const val = e.target.value;
            chg(ctx)('channel', val === 'all' ? 'all' : parseInt(val));
          }}>
            <option value="all">All Channels</option>
            {Array.from({ length: 16 }, (_, i) => i + 1).map(ch => (
              <option key={ch} value={ch}>Channel {ch}</option>
            ))}
          </select>
        </div>
      )
    },
    { id: 'ccNumber', label: 'CC #',
      render: ctx => (
        <Slider label={`CC Number (${src<MidiInputSource>(ctx).ccNumber ?? 7})`} 
          min={0} max={127} step={1} 
          value={src<MidiInputSource>(ctx).ccNumber ?? 7} 
          onChange={v => chg(ctx)('ccNumber', v)} />
      )
    },
    { id: 'clockDivision', label: 'Div',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Clock Div</span>
          <select value={src<MidiInputSource>(ctx).clockDivision} onChange={e => chg(ctx)('clockDivision', e.target.value)}>
            <option value="1/4">1/4 Note (Quarter)</option>
            <option value="1/8">1/8 Note (Eighth)</option>
            <option value="1/16">1/16 Note (Sixteenth)</option>
            <option value="1/32">1/32 Note (Thirty-second)</option>
          </select>
        </div>
      )
    },
    { id: 'diagnostics', label: 'Monitor',
      render: ctx => {
        const midiSrc = src<MidiInputSource>(ctx);
        const [diagnostics, setDiagnostics] = useState({ note: 'None', vel: 0, cc: 0, clock: 0 });

        useEffect(() => {
          const interval = setInterval(() => {
            const mgr = MidiManager.getInstance();
            const noteData = mgr.getNoteData(midiSrc.channel);
            const ccVal = mgr.getCCValue(midiSrc.channel, midiSrc.ccNumber ?? 7);
            
            let noteName = 'None';
            if (noteData.gate && noteData.rawPitch > 0) {
              const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
              const octave = Math.floor(noteData.rawPitch / 12) - 1;
              const name = noteNames[noteData.rawPitch % 12];
              noteName = `${name}${octave}`;
            }

            setDiagnostics({
              note: noteName,
              vel: Math.round(noteData.velocity * 100),
              cc: Math.round(ccVal * 100),
              clock: (mgr as any).clockTicks
            });
          }, 100);

          return () => clearInterval(interval);
        }, [midiSrc.channel, midiSrc.ccNumber]);

        return (
          <div className="rack-row-content" style={{ display: 'flex', flexDirection: 'column', gap: 2, background: '#0a0a0a', padding: 6, borderRadius: 3, border: '1px solid #222', fontSize: 10, fontFamily: 'monospace' }}>
            <div style={{ color: '#39ff14', fontWeight: 'bold', marginBottom: 2 }}>⚡ MIDI LIVE MONITOR</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Last Note:</span>
              <span style={{ color: '#eee', fontWeight: 'bold' }}>{diagnostics.note}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Velocity:</span>
              <span style={{ color: '#eee' }}>{diagnostics.vel}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>CC ({midiSrc.ccNumber ?? 7}):</span>
              <span style={{ color: '#eee' }}>{diagnostics.cc}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Clock Ticks:</span>
              <span style={{ color: '#666' }}>{diagnostics.clock}</span>
            </div>
          </div>
        );
      }
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
            <option value="white">White Noise (Snow)</option>
            <option value="perlin">Perlin (fBm)</option>
            <option value="simplex">Simplex (Smooth)</option>
            <option value="ridged">Ridged (Crystalline)</option>
            <option value="billow">Billow (Bubbly)</option>
            <option value="worley">Worley (Blobs)</option>
            <option value="voronoi">Voronoi (Edges)</option>
            <option value="warped">Domain Warping (Liquid)</option>
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

  ColorNoise: [
    { id: 'noiseType', label: 'Type',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
          <span className="rack-row-label">Noise Type</span>
          <select value={src<ColorNoiseSource>(ctx).noiseType} onChange={e => chg(ctx)('noiseType', e.target.value)}>
            <option value="white">White Noise (Snow)</option>
            <option value="perlin">Perlin (fBm)</option>
            <option value="simplex">Simplex (Smooth)</option>
            <option value="ridged">Ridged (Crystalline)</option>
            <option value="billow">Billow (Bubbly)</option>
            <option value="worley">Worley (Blobs)</option>
            <option value="voronoi">Voronoi (Edges)</option>
            <option value="warped">Domain Warping (Liquid)</option>
          </select>
        </div>
      )
    },
    { id: 'scale', label: 'Scale',
      render: ctx => <Slider label="Scale" min={0.1} max={20} step={0.1} value={src<ColorNoiseSource>(ctx).scale} onChange={v => chg(ctx)('scale', v)} />
    },
    { id: 'evolution', label: 'Evol',
      render: ctx => <Slider label="Evolution" min={0} max={10} step={0.1} value={src<ColorNoiseSource>(ctx).evolution} onChange={v => chg(ctx)('evolution', v)} />
    },
    { id: 'autoAnimate', label: 'Auto',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Auto Animate (3D)</span>
          <input type="checkbox" checked={src<ColorNoiseSource>(ctx).autoAnimate} onChange={e => chg(ctx)('autoAnimate', e.target.checked)} />
        </div>
      )
    },
    { id: 'flowSpeed', label: 'Speed',
      render: ctx => src<ColorNoiseSource>(ctx).autoAnimate ? <Slider label="Flow Speed" min={0} max={10} step={0.1} value={src<ColorNoiseSource>(ctx).flowSpeed} onChange={v => chg(ctx)('flowSpeed', v)} /> : null
    },
    { id: 'octaves', label: 'Octaves',
      render: ctx => <Slider label="Octaves" min={1} max={8} step={1} value={src<ColorNoiseSource>(ctx).octaves} onChange={v => chg(ctx)('octaves', v)} />
    },
    { id: 'persistence', label: 'Persist',
      render: ctx => <Slider label="Persistence" min={0} max={1} step={0.01} value={src<ColorNoiseSource>(ctx).persistence} onChange={v => chg(ctx)('persistence', v)} />
    },
    { id: 'brightness', label: 'Bright',
      render: ctx => <Slider label="Brightness" min={-1} max={1} step={0.01} value={src<ColorNoiseSource>(ctx).brightness ?? 0} onChange={v => chg(ctx)('brightness', v)} />
    },
    { id: 'contrast', label: 'Contrast',
      render: ctx => <Slider label="Contrast" min={0} max={4} step={0.01} value={src<ColorNoiseSource>(ctx).contrast ?? 1} onChange={v => chg(ctx)('contrast', v)} />
    },
    { id: 'seed', label: 'Seed',
      render: ctx => <Slider label="Seed" min={0} max={1000} step={1} value={src<ColorNoiseSource>(ctx).seed} onChange={v => chg(ctx)('seed', v)} />
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
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
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
        const deviceId = src<AudioInputSource>(ctx).deviceId;
        const effectId = (ctx as any).effect?.id;
        const layerId = (ctx as any).layer?.id;
        const registrationId = effectId || layerId;

        // Auto-start mic when this module is active
        useEffect(() => {
          if (!registrationId) return;
          let stream: MediaStream | null = null;
          
          const startMic = async () => {
            try {
              stream = await navigator.mediaDevices.getUserMedia({ 
                audio: deviceId 
                  ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
                  : { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
              });
              await AudioEngine.getInstance().resume();
              AudioEngine.getInstance().registerStream(registrationId, stream);
            } catch (err) {
              console.error("Failed to start mic:", err);
            }
          };

          startMic();

          return () => {
            if (stream) {
              stream.getTracks().forEach(t => t.stop());
              AudioEngine.getInstance().unregisterMediaElement(registrationId);
            }
          };
        }, [deviceId, registrationId]);

        return (
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
            style={{ flexDirection: 'column', gap: 4 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <span className="rack-row-label">Input Device</span>
              <select value={deviceId} 
                onChange={e => { e.stopPropagation(); chg(ctx)('deviceId', e.target.value); }}
                style={{ flex: 1 }}
              >
                <option value="">Default Input</option>
                {(sCtx.cameras ?? []).filter(d => d.kind === 'audioinput' || (d as any).kind === 'audio').map((cam: any) => (
                  <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Audio (${cam.deviceId.slice(0,5)}...)`}</option>
                ))}
              </select>
            </div>
            {layerId && <VUMeter busId={layerId} />}
          </div>
        );
      }
    },
    { id: 'volume', label: 'Volume',
      render: ctx => <Slider label="Volume" min={0} max={2} step={0.01} value={src<AudioInputSource>(ctx).volume} onChange={v => chg(ctx)('volume', v)} paramId="volume" ctx={ctx} />
    },
  ],

  AudioFile: [
    { id: 'filePick', label: 'File',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        return (
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
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
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
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
      render: ctx => <Slider label="Volume" min={0} max={1} step={0.01} value={src<AudioFileSource>(ctx).volume} onChange={v => chg(ctx)('volume', v)} paramId="volume" ctx={ctx} />
    },
    { id: 'timeline', label: 'Timeline',
      render: ctx => {
        const sCtx = ctx as SourceCtx;
        const vp = sCtx.videoProgress;
        const s = src<AudioFileSource>(ctx);
        return (
          <div className="rack-row-content" 
            onPointerDown={e => { if (!(e.target instanceof HTMLInputElement)) e.stopPropagation(); }} 
            onDragStart={e => e.stopPropagation()}
          >
            <span className="rack-row-label">Timeline</span>
            <div className="rack-timeline-wrap">
              <span className="rack-timeline-time">{(vp?.currentTime ?? 0).toFixed(1)}s</span>
              <div className="timeline-container" style={{ flex: 1 }}>
                <div className="timeline-track" />
                <input type="range" className="timeline-input" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={vp?.currentTime ?? 0} 
                  onChange={e => { e.stopPropagation(); sCtx.onSeek?.(e); }}
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-start" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopStart ?? 0} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopStart', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
                />
                <input type="range" className="timeline-input flag-input flag-end" min={0} max={vp?.duration || 0.001} step={0.1}
                  value={s.loopEnd ?? (vp?.duration || 0.001)} 
                  onChange={e => { e.stopPropagation(); chg(ctx)('loopEnd', parseFloat(e.target.value) || 0); }} 
                  onPointerDown={() => { sCtx.onSeekStart?.(); }}
                  onPointerUp={() => { sCtx.onSeekEnd?.(); }}
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
        value={src<AudioFileSource>(ctx).playbackSpeed ?? 1.0} onChange={v => chg(ctx)('playbackSpeed', v)} />
    },
    { id: 'loop', label: 'Loop',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Looping</span>
          <input type="checkbox" checked={src<AudioFileSource>(ctx).loop} 
            onChange={e => { e.stopPropagation(); chg(ctx)('loop', e.target.checked); }} />
        </div>
      )
    },
  ],

  SystemAudio: [
    { id: 'muted', label: 'Mute',
      render: ctx => (
        <div className="rack-row-content" onPointerDown={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label">Muted</span>
          <input type="checkbox" checked={src<SystemAudioSource>(ctx).muted} 
            onChange={e => { e.stopPropagation(); chg(ctx)('muted', e.target.checked); }} />
        </div>
      )
    },
    { id: 'meter', label: 'Signal',
      render: ctx => {
        const effect = eff<SystemAudioSource>(ctx);
        const registrationId = effect.id || (ctx as any).layer?.id;
        return (
          <div className="rack-row-content" style={{ padding: '0 4px' }}>
            {registrationId && <VUMeter busId={registrationId} />}
          </div>
        );
      }
    }
  ],


};

