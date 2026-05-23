import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PORT_DEFS, SIGNAL_COLORS, PortDef } from './portDefs';
import { ControlRowDef, RowCtx, EffectCtx } from './moduleControls';
import { 
  SpawnEffect, StepSequencerEffect, AudioSourceEffect, OscilloscopeEffect, SpectralSplitterEffect,
  SpeechEnvelopeTrackerEffect, VocalPitchTrackerEffect, VowelFormantTrackerEffect, SpokenWordVisualizerEffect,
  AudioGateEffect
} from '../../state/types';
import { useEngineStore } from '../../state/store';
import { OscilloscopeVisualizer, AudioSourceVisualizer, SpectralVisualizer } from './AudioVisualizers';

// ── Mini Components ─────────────────────────────────────────────────────────

function Knob({ value, onChange, min = 0, max = 1, resetValue = 1, size = 16, color = '#555' }: { 
  value: number, 
  onChange: (v: number) => void, 
  min?: number, 
  max?: number, 
  resetValue?: number,
  size?: number, 
  color?: string 
}) {
  const [isDragging, setIsDragging] = useState(false);
  const lastY = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    lastY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dy = lastY.current - e.clientY;
    lastY.current = e.clientY;
    const next = Math.max(min, Math.min(max, value + dy * (max - min) * 0.01));
    if (next !== value) onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(resetValue); 
  };

  const normalized = (value - min) / (max - min || 1);
  const rotation = (normalized * 270) - 135; // -135 to 135 deg

  return (
    <div 
      className="knob-wrap"
      style={{ width: size, height: size }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <svg width={size} height={size} viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
        <g transform={`rotate(${rotation}, 10, 10)`}>
          <line x1="10" y1="10" x2="10" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

// ── Custom Vocal Tracking & Audio Reactivity Panels ──────────────────────────

function SpeechEnvelopeTrackerUI({
  nodeId,
  layerId,
  effect,
  onUpdate
}: {
  nodeId: string;
  layerId: string;
  effect: SpeechEnvelopeTrackerEffect;
  onUpdate: (u: Partial<SpeechEnvelopeTrackerEffect>) => void;
}) {
  const envVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.envelope_out`] ?? 0);
  const speechTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.speech_trig`] ?? 0);
  const cadenceVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.cadence_out`] ?? 0);

  const db = envVal > 0.0001 ? Math.max(-60, Math.min(0, 20 * Math.log10(envVal))) : -60;
  const dbPercent = ((db + 60) / 60) * 100;
  const thresholdPercent = ((effect.sensitivityDb + 60) / 60) * 100;

  const meterRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!meterRef.current) return;
    const rect = meterRef.current.getBoundingClientRect();
    const update = (clientY: number) => {
      const relativeY = 1 - (clientY - rect.top) / rect.height;
      const pct = Math.max(0, Math.min(1, relativeY));
      const sensitivityDb = Math.round(-60 + pct * 60);
      onUpdate({ sensitivityDb });
    };
    update(e.clientY);

    const onPointerMove = (moveEv: PointerEvent) => {
      update(moveEv.clientY);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div className="vocal-env-rack" onPointerDown={e => e.stopPropagation()}>
      <div className="db-meter-container">
        <div className="db-meter-ticks">
          <span>0dB</span>
          <span>-10</span>
          <span>-20</span>
          <span>-30</span>
          <span>-40</span>
          <span>-50</span>
          <span>-60</span>
        </div>
        <div 
          ref={meterRef}
          className="db-meter-bar-wrap" 
          onPointerDown={handlePointerDown}
        >
          <div className="db-meter-bar-fill" style={{ height: `${dbPercent}%` }} />
          <div className="db-meter-threshold-line" style={{ bottom: `${thresholdPercent}%` }} />
        </div>
      </div>
      
      <div className="onset-led-wrap">
        <div className={`onset-led ${speechTrig > 0.5 ? 'active' : ''}`} />
        <span className="rack-row-label" style={{ fontSize: 9 }}>SPEECH TRANSIENT</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="rack-row-label" style={{ fontSize: 8, color: '#666' }}>CADENCE: {cadenceVal.toFixed(2)}</span>
        <div style={{ width: '100%', height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${cadenceVal * 100}%`, height: '100%', background: '#d918f5' }} />
        </div>
      </div>

      <div className="vocal-knob-grid">
        <div className="vocal-knob-item">
          <Knob 
            value={effect.attackMs} 
            min={1} max={100} 
            resetValue={10} 
            color="#18e4f5" 
            onChange={v => onUpdate({ attackMs: Math.round(v) })} 
          />
          <span className="vocal-knob-label">ATK: {Math.round(effect.attackMs)}ms</span>
        </div>
        <div className="vocal-knob-item">
          <Knob 
            value={effect.releaseMs} 
            min={10} max={1000} 
            resetValue={150} 
            color="#d918f5" 
            onChange={v => onUpdate({ releaseMs: Math.round(v) })} 
          />
          <span className="vocal-knob-label">REL: {Math.round(effect.releaseMs)}ms</span>
        </div>
      </div>
    </div>
  );
}

function AudioGateUI({
  nodeId,
  layerId,
  effect,
  onUpdate
}: {
  nodeId: string;
  layerId: string;
  effect: AudioGateEffect;
  onUpdate: (u: Partial<AudioGateEffect>) => void;
}) {
  const inputDb = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.input_db`] ?? -100);
  const gateActive = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.gate_active`] ?? 0);

  // Meter percentage (from -80 to 0 dB)
  const dbPercent = Math.max(0, Math.min(100, ((inputDb + 80) / 80) * 100));
  const thresholdPercent = Math.max(0, Math.min(100, ((effect.thresholdDb + 80) / 80) * 100));

  const meterRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!meterRef.current) return;
    const rect = meterRef.current.getBoundingClientRect();
    const update = (clientY: number) => {
      const relativeY = 1 - (clientY - rect.top) / rect.height;
      const pct = Math.max(0, Math.min(1, relativeY));
      const thresholdDb = Math.round(-80 + pct * 80);
      onUpdate({ thresholdDb });
    };
    update(e.clientY);

    const onPointerMove = (moveEv: PointerEvent) => {
      update(moveEv.clientY);
    };
    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  return (
    <div className="audio-gate-rack" onPointerDown={e => e.stopPropagation()}>
      <div className="gate-meter-container">
        <div className="gate-meter-ticks">
          <span>0dB</span>
          <span>-15</span>
          <span>-30</span>
          <span>-45</span>
          <span>-60</span>
          <span>-80</span>
        </div>
        <div 
          ref={meterRef}
          className="gate-meter-bar-wrap" 
          onPointerDown={handlePointerDown}
        >
          <div className="gate-meter-bar-fill" style={{ height: `${dbPercent}%` }} />
          <div className="gate-meter-threshold-line" style={{ bottom: `${thresholdPercent}%` }} />
        </div>
      </div>

      <div className="gate-controls-column">
        {/* State LED */}
        <div className="gate-led-wrap">
          <div className={`gate-led ${gateActive > 0.5 ? 'open' : 'closed'}`} />
          <span className="gate-led-label">{gateActive > 0.5 ? 'OPEN' : 'CLOSED'}</span>
        </div>

        {/* Threshold Display/Control */}
        <div className="gate-value-display">
          <span className="label">THRESHOLD</span>
          <span className="value">{effect.thresholdDb} dB</span>
        </div>

        {/* Release Rate Knob Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111', padding: '4px 8px', borderRadius: 4, border: '1px solid #1c1c1c' }}>
          <Knob 
            value={effect.releaseMs ?? 150} 
            min={10} max={1000} 
            resetValue={150} 
            color="#dc143c" 
            onChange={v => onUpdate({ releaseMs: Math.round(v) })} 
          />
          <span className="gate-led-label" style={{ fontSize: 9 }}>RELEASE: {Math.round(effect.releaseMs ?? 150)}ms</span>
        </div>

        {/* Manual Bypass Button */}
        <button
          className={`gate-bypass-btn ${effect.bypass ? 'active' : ''}`}
          onClick={() => onUpdate({ bypass: !effect.bypass })}
        >
          {effect.bypass ? 'BYPASS ON' : 'BYPASS OFF'}
        </button>

        {/* Bypass Mode Toggle */}
        <div className="gate-toggle-wrap">
          <span className="toggle-label">MODE:</span>
          <button
            className={`gate-mode-toggle ${effect.bypassLatching ? 'latching' : 'momentary'}`}
            onClick={() => onUpdate({ bypassLatching: !effect.bypassLatching })}
          >
            {effect.bypassLatching ? 'LATCH' : 'MOMENT'}
          </button>
        </div>
      </div>
    </div>
  );
}

function VocalPitchTrackerUI({
  nodeId,
  layerId,
  effect,
  onUpdate
}: {
  nodeId: string;
  layerId: string;
  effect: VocalPitchTrackerEffect;
  onUpdate: (u: Partial<VocalPitchTrackerEffect>) => void;
}) {
  const hzVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.pitch_hz`] ?? 0);
  const stabilityVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.stability`] ?? 0);
  const noteTrigVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.note_change_trig`] ?? 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);

  useEffect(() => {
    const history = historyRef.current;
    history.push(hzVal > 20 && stabilityVal > effect.tolerance ? hzVal : 0);
    if (history.length > 100) history.shift();
  }, [hzVal, stabilityVal, effect.tolerance]);

  const getNoteName = (hz: number) => {
    if (hz <= 20) return { note: '---', cents: 0 };
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = 12 * Math.log2(hz / 440) + 69;
    const roundedMidi = Math.round(midi);
    const cents = Math.round((midi - roundedMidi) * 100);
    const note = noteNames[roundedMidi % 12] + Math.floor(roundedMidi / 12 - 1);
    return { note, cents };
  };

  const { note, cents } = getNoteName(hzVal);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const history = historyRef.current;
      if (history.length > 1) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(24, 228, 245, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#18e4f5';

        const minF = effect.minPitchHz;
        const maxF = effect.maxPitchHz;
        const logMin = Math.log2(minF);
        const logMax = Math.log2(maxF);

        history.forEach((hz, idx) => {
          const x = (idx / 100) * w;
          if (hz <= 20) {
            if (idx === 0) ctx.moveTo(x, h);
            else ctx.lineTo(x, h);
          } else {
            const logHz = Math.log2(hz);
            const y = h - ((logHz - logMin) / (logMax - logMin || 1)) * h;
            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [effect.minPitchHz, effect.maxPitchHz]);

  return (
    <div className="pitch-track-rack" onPointerDown={e => e.stopPropagation()}>
      <div className="pitch-lcd-display">
        <div 
          className={`onset-led ${noteTrigVal > 0.5 ? 'active' : ''}`}
          style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6 }} 
        />
        <div className="pitch-lcd-note">{note}</div>
        <div className="pitch-lcd-hz">{hzVal > 20 ? `${hzVal.toFixed(1)} Hz` : '---'}</div>
        
        <div className="pitch-tuner-bar-wrap">
          <div 
            className="pitch-tuner-needle" 
            style={{ 
              left: hzVal > 20 ? `${50 + (cents / 50) * 50}%` : '50%' 
            }} 
          />
        </div>
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', fontSize: 6, color: '#333', marginTop: 2, fontFamily: 'monospace' }}>
          <span>-50c</span>
          <span>0</span>
          <span>+50c</span>
        </div>
      </div>

      <canvas 
        ref={canvasRef} 
        className="pitch-sparkline-canvas" 
        width={180} 
        height={40} 
      />

      <div className="vocal-range-mode-toggle">
        <button
          className={`range-mode-btn ${effect.pitchRangeMode !== 'music' ? 'active-voice' : ''}`}
          onClick={() => onUpdate({ pitchRangeMode: 'voice' })}
        >
          Voice Mode
        </button>
        <button
          className={`range-mode-btn ${effect.pitchRangeMode === 'music' ? 'active-music' : ''}`}
          onClick={() => onUpdate({ pitchRangeMode: 'music' })}
        >
          Music Mode
        </button>
      </div>

      <div className="vocal-knob-grid">
        <div className="vocal-knob-item">
          <Knob 
            value={effect.minPitchHz} 
            min={40} max={300} 
            resetValue={80} 
            color="#18e4f5" 
            onChange={v => onUpdate({ minPitchHz: Math.round(v) })} 
          />
          <span className="vocal-knob-label">MIN: {Math.round(effect.minPitchHz)}Hz</span>
        </div>
        <div className="vocal-knob-item">
          <Knob 
            value={effect.maxPitchHz} 
            min={300} max={1500} 
            resetValue={800} 
            color="#d918f5" 
            onChange={v => onUpdate({ maxPitchHz: Math.round(v) })} 
          />
          <span className="vocal-knob-label">MAX: {Math.round(effect.maxPitchHz)}Hz</span>
        </div>
      </div>

      <div className="vocal-knob-item">
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', gap: 10 }}>
          <span className="vocal-knob-label" style={{ margin: 0 }}>CONFIDENCE TOL: {effect.tolerance.toFixed(2)}</span>
          <Knob 
            value={effect.tolerance} 
            min={0.1} max={0.9} 
            resetValue={0.4} 
            color="#f58c18" 
            onChange={v => onUpdate({ tolerance: v })} 
          />
        </div>
      </div>
    </div>
  );
}

function VowelFormantTrackerUI({
  nodeId,
  layerId,
  effect,
  onUpdate
}: {
  nodeId: string;
  layerId: string;
  effect: VowelFormantTrackerEffect;
  onUpdate: (u: Partial<VowelFormantTrackerEffect>) => void;
}) {
  const f1Val = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.formant_f1`] ?? 0);
  const f2Val = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.formant_f2`] ?? 0);
  const vowelX = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_x`] ?? 0.5);
  const vowelY = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_y`] ?? 0.5);
  const vowelTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_change_trig`] ?? 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    const trail = trailRef.current;
    trail.push({ x: vowelX, y: vowelY });
    if (trail.length > 15) trail.shift();
  }, [vowelX, vowelY]);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      ctx.fillStyle = '#444';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.fillText('Oo (Back/High)', w * 0.25, h * 0.25);
      ctx.fillText('Oh (Back/Low)', w * 0.25, h * 0.75);
      ctx.fillText('Ee (Front/High)', w * 0.75, h * 0.25);
      ctx.fillText('Ah (Front/Low)', w * 0.75, h * 0.75);

      const trail = trailRef.current;
      if (trail.length > 0) {
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(217, 24, 245, 0.3)';
        trail.forEach((pt, idx) => {
          const cx = pt.x * w;
          const cy = (1 - pt.y) * h;
          if (idx === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.stroke();

        trail.forEach((pt, idx) => {
          const cx = pt.x * w;
          const cy = (1 - pt.y) * h;
          const alpha = idx / trail.length;
          
          ctx.beginPath();
          ctx.arc(cx, cy, 3 * alpha + 1.5, 0, 2 * Math.PI);
          ctx.fillStyle = `rgba(217, 24, 245, ${alpha * 0.6})`;
          ctx.fill();
        });

        const active = trail[trail.length - 1];
        if (active) {
          const cx = active.x * w;
          const cy = (1 - active.y) * h;

          ctx.shadowBlur = 8;
          ctx.shadowColor = '#d918f5';
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#d918f5';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="vowel-track-rack" onPointerDown={e => e.stopPropagation()}>
      <canvas 
        ref={canvasRef} 
        className="vowel-scatter-canvas" 
        width={180} 
        height={120} 
      />

      <div className="onset-led-wrap">
        <div className={`onset-led ${vowelTrig > 0.5 ? 'active' : ''}`} style={{ backgroundColor: '#d918f5' }} />
        <span className="rack-row-label" style={{ fontSize: 9 }}>ZONE TRANSIENT</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: '#111', padding: 6, borderRadius: 4, border: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#888', fontFamily: 'monospace' }}>
          <span>F1 HZ:</span>
          <span style={{ color: '#18e4f5' }}>{f1Val.toFixed(0)} Hz</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#888', fontFamily: 'monospace' }}>
          <span>F2 HZ:</span>
          <span style={{ color: '#d918f5' }}>{f2Val.toFixed(0)} Hz</span>
        </div>
      </div>

      <div className="vocal-knob-item">
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <span className="vocal-knob-label" style={{ margin: 0 }}>DAMPING SMOOTH: {effect.smoothing.toFixed(2)}</span>
          <Knob 
            value={effect.smoothing} 
            min={0.0} max={0.99} 
            resetValue={0.8} 
            color="#d918f5" 
            onChange={v => onUpdate({ smoothing: v })} 
          />
        </div>
      </div>

      <div className="vocal-knob-item" style={{ marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', gap: 6 }}>
          <span className="vocal-knob-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>VOICE PROFILE:</span>
          <select 
            value={effect.voiceProfile ?? 'universal'} 
            onChange={e => onUpdate({ voiceProfile: e.target.value as any })} 
            className="seq-select" 
            style={{ 
              flex: 1, 
              background: '#1a1a1a', 
              color: '#d918f5', 
              border: '1px solid #333', 
              borderRadius: 3, 
              fontSize: 8, 
              fontFamily: 'monospace', 
              padding: '1px 3px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="universal">Universal</option>
            <option value="baritone_bass">Low Baritone/Bass</option>
            <option value="tenor_contralto_alto">Tenor/Contralto/Alto</option>
            <option value="mezzo_soprano">Mezzo Soprano</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function SpokenWordVisualizerUI({
  nodeId,
  layerId,
  effect: _effect,
  onUpdate: _onUpdate,
  inputSettings: _inputSettings
}: {
  nodeId: string;
  layerId: string;
  effect: SpokenWordVisualizerEffect;
  onUpdate: (u: Partial<SpokenWordVisualizerEffect>) => void;
  inputSettings?: Record<string, any>;
}) {
  const envVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.envelope_out`] ?? 0);
  const cadenceVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.cadence_out`] ?? 0);
  const brightnessVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.timbre_brightness`] ?? 0);
  const flatnessVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.timbre_flatness`] ?? 0);
  const sibilanceVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.sibilance`] ?? 0);
  const hzVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.pitch_hz`] ?? 0);
  const stabilityVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.stability`] ?? 0);
  const vowelX = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_x`] ?? 0.5);
  const vowelY = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_y`] ?? 0.5);

  const onsetPulse = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.onset_pulse`] ?? 0);
  const speechTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.speech_trig`] ?? 0);
  const silenceTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.silence_trig`] ?? 0);
  const noteTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.note_change_trig`] ?? 0);
  const vowelTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_change_trig`] ?? 0);

  const getNoteName = (hz: number) => {
    if (hz <= 20) return { note: '---', cents: 0 };
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = 12 * Math.log2(hz / 440) + 69;
    const roundedMidi = Math.round(midi);
    const cents = Math.round((midi - roundedMidi) * 100);
    const note = noteNames[roundedMidi % 12] + Math.floor(roundedMidi / 12 - 1);
    return { note, cents };
  };

  const { note, cents } = getNoteName(hzVal);

  const renderMeter = (label: string, value: number, formattedValue: string, maxVal: number = 1) => {
    const pct = Math.max(0, Math.min(100, (value / (maxVal || 1)) * 100));
    return (
      <div className="spoken-word-meter-row">
        <div className="spoken-word-meter-label">
          <span>{label}</span>
          <span className="spoken-word-meter-val">{formattedValue}</span>
        </div>
        <div className="spoken-word-meter-bar">
          <div className="spoken-word-meter-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  const renderLed = (label: string, active: boolean) => (
    <div className="spoken-word-led-row">
      <span className="spoken-word-led-label">{label}</span>
      <div className={`spoken-word-led-dot ${active ? 'active' : ''}`} />
    </div>
  );

  return (
    <div className="spoken-word-rack" onPointerDown={e => e.stopPropagation()}>
      <div className="spoken-word-grid">
        <div className="spoken-word-column">
          <div className="spoken-word-sub-header">Continuous Signals</div>
          {renderMeter('ENV FOLLOW', envVal, envVal.toFixed(3))}
          {renderMeter('CADENCE', cadenceVal, cadenceVal.toFixed(2))}
          {renderMeter('TIMB BRIGHT', brightnessVal, `${Math.round(brightnessVal)} Hz`, 8000)}
          {renderMeter('TIMB FLAT', flatnessVal, flatnessVal.toFixed(3))}
          {renderMeter('SIBILANCE', sibilanceVal, sibilanceVal.toFixed(3))}
          {renderMeter('STABILITY', stabilityVal, stabilityVal.toFixed(2))}
        </div>

        <div className="spoken-word-column">
          <div className="spoken-word-sub-header">Pitch & Formants</div>
          
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, background: '#080c0a', border: '1px solid #1a221f', borderRadius: 4, padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 'bold', color: '#18e4f5', fontFamily: 'monospace' }}>{note}</span>
              <span style={{ fontSize: 7, color: '#0f8b96', fontFamily: 'monospace' }}>{cents >= 0 ? '+' : ''}{cents}c</span>
            </div>
            
            <div style={{ flex: 1, background: '#0c080b', border: '1px solid #221a21', borderRadius: 4, padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#d918f5', fontFamily: 'monospace' }}>
                {vowelX < 0.5 ? (vowelY >= 0.5 ? 'Oo' : 'Oh') : (vowelY >= 0.5 ? 'Ee' : 'Ah')}
              </span>
              <span style={{ fontSize: 6, color: '#960f8b', fontFamily: 'monospace' }}>X:{vowelX.toFixed(2)} Y:{vowelY.toFixed(2)}</span>
            </div>
          </div>

          <div className="spoken-word-sub-header" style={{ marginTop: 2 }}>Triggers</div>
          {renderLed('ONSET PULSE', onsetPulse > 0.5)}
          {renderLed('SPEECH ACTIVE', speechTrig > 0.5 || envVal > 0.15)}
          {renderLed('SILENCE TRANSIENT', silenceTrig > 0.5)}
          {renderLed('NOTE SHIFT', noteTrig > 0.5)}
          {renderLed('VOWEL SHIFT', vowelTrig > 0.5)}
        </div>
      </div>
    </div>
  );
}

// ── Node Layout State ─────────────────────────────────────────────────────────

export interface NodeUIState {
  x: number;
  y: number;
  controlOrder: string[];
  visibleRows: number;
  expanded: boolean;
  patchbayExpanded: boolean;
  expandedGroups?: string[];
}

const LAYOUT_KEY = 'terp_node_layout';

function loadLayout(layerId: string): Record<string, NodeUIState> {
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    return all[layerId] || {};
  } catch { return {}; }
}

function saveLayout(layerId: string, layout: Record<string, NodeUIState>) {
  try {
    const all = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    all[layerId] = layout;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(all));
  } catch {}
}

export function useNodeLayout(layerId: string | null) {
  const [layout, setLayout] = useState<Record<string, NodeUIState>>({});
  
  useEffect(() => {
    if (layerId) setLayout(loadLayout(layerId));
    else setLayout({});
  }, [layerId]);

  const getNodeState = useCallback((nodeId: string, defaultState: Partial<NodeUIState>): NodeUIState => {
    const base = {
      x: 0, y: 10,
      controlOrder: [],
      visibleRows: 3,
      expanded: false,
      patchbayExpanded: false,
      ...defaultState,
    };
    return { ...base, ...(layout[nodeId] || {}) };
  }, [layout]);

  const updateNodeState = useCallback((nodeId: string, updates: Partial<NodeUIState>) => {
    setLayout(prev => {
      const next = { ...prev, [nodeId]: { ...prev[nodeId], ...updates } };
      if (layerId) saveLayout(layerId, next);
      return next;
    });
  }, [layerId]);

  return { getNodeState, updateNodeState };
}

// ── Signal Meter Component ───────────────────────────────────────────────────

function SignalMeter({ layerId, nodeId, portId, bipolar, color, threshold, onThresholdChange }: { 
  layerId: string, 
  nodeId: string, 
  portId: string, 
  bipolar: boolean,
  color: string,
  threshold?: number,
  onThresholdChange?: (v: number) => void
}) {
  const settingsKey = `${nodeId}.${portId}`;
  const val = useEngineStore(s => s.layers[layerId]?.signalValues?.[settingsKey] ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onThresholdChange) return;
    e.stopPropagation();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !onThresholdChange) return;
    updateFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const updateFromPointer = (e: React.PointerEvent) => {
    if (!containerRef.current || !onThresholdChange) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // If bipolar, the positive threshold maps from 0.5 to 1.0 (or we just map 0-1 across the whole bar)
    // The user's threshold is 0..1. The marker is at `bipolar ? 50 + t*50 : t*100`.
    // So to reverse it:
    let newT = bipolar ? (nx - 0.5) * 2 : nx;
    newT = Math.max(0, Math.min(1, newT)); // threshold is strictly 0..1
    onThresholdChange(newT);
  };

  return (
    <div className="patchbay-meter-container" 
         ref={containerRef}
         onPointerDown={handlePointerDown}
         onPointerMove={handlePointerMove}
         onPointerUp={handlePointerUp}
         style={{ cursor: onThresholdChange ? 'ew-resize' : 'default' }}>
      <div className="patchbay-meter-bar">
        <div 
          className={`patchbay-meter-fill ${bipolar ? 'bipolar-fill' : ''}`}
          style={{ 
            width: `${Math.min(100, Math.abs(bipolar ? val * 50 : val * 100))}%`,
            left: bipolar ? (val < 0 ? 'auto' : '50%') : '0',
            right: bipolar && val < 0 ? '50%' : 'auto',
          }}
        />
        {threshold !== undefined && (
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: `${bipolar ? 50 + threshold * 50 : threshold * 100}%`,
            width: 3,
            marginLeft: -1,
            backgroundColor: isDragging ? '#f58c18' : 'white',
            zIndex: 10,
            boxShadow: '0 0 4px black'
          }} />
        )}
      </div>
      <div className="patchbay-meter-overlay" style={{ color, pointerEvents: 'none' }}>
        <span className="lcd-number">
          {val >= 0 ? '+' : ''}{val.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Vertical Fader Component ────────────────────────────────────────────────

function VerticalFader({ value, onChange, active, color = '#18e4f5', onReset }: { 
  value: number, 
  onChange: (v: number) => void, 
  active: boolean, 
  color?: string,
  onReset?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateValue = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = 1 - (e.clientY - rect.top) / rect.height;
    onChange(Math.max(0, Math.min(1, next)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) updateValue(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className="seq-fader-container" 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => { e.stopPropagation(); onReset?.(); }}
    >
      <div className="seq-fader-track" />
      <div 
        className="seq-fader-fill" 
        style={{ height: `${value * 100}%`, backgroundColor: color }}
      />
      {active && <div className="seq-fader-glow" />}
    </div>
  );
}

// ── Step Sequencer UI ─────────────────────────────────────────────────────────

function StepSequencerUI({ effect, nodeId, layerId, onUpdate, onPortDown, onPortUp, onInputJackDown, inputSettings, onUpdateInputSettings }: {
  effect: StepSequencerEffect,
  nodeId: string,
  layerId: string,
  onUpdate: (u: Partial<StepSequencerEffect>) => void,
  onPortDown: (portId: string, type: string, e: React.PointerEvent) => void,
  onPortUp: (portId: string, type: string, e: React.PointerEvent) => void,
  onInputJackDown: (portId: string, e: React.PointerEvent) => void,
  inputSettings?: Record<string, any>,
  onUpdateInputSettings?: (portKey: string, updates: any) => void
}) {
  const steps = effect.steps || 8;
  const currentStep = effect.currentStep || 0;
  const endStep = effect.endStep ?? (steps - 1);
  
  const renderPort = (id: string, label: string, type: string, dir: 'in' | 'out', showLabel: boolean = false) => {
    const color = dir === 'out' ? SIGNAL_COLORS[type as keyof typeof SIGNAL_COLORS] : '#555';
    const ringColor = dir === 'in' ? (SIGNAL_COLORS[type as keyof typeof SIGNAL_COLORS] || '#888') : color;
    return (
      <div className="seq-port-dot-wrap" style={{ flexDirection: 'row' }}>
        <div 
          className="port-dot seq-jack"
          style={{ color: color, borderColor: ringColor }}
          onPointerDown={e => {
            e.stopPropagation();
            if (dir === 'out') onPortDown(id, type, e);
            else onInputJackDown(id, e);
          }}
          onPointerUp={e => {
            if (dir === 'in') onPortUp(id, type, e);
          }}
          title={label}
        />
        {showLabel && <span className={dir === 'in' ? 'seq-port-label-inline' : 'seq-label'}>{label}</span>}
      </div>
    );
  };

  return (
    <div className="step-sequencer-ui" onPointerDown={e => e.stopPropagation()}>
      {/* Global Section */}
      <div className="seq-global-section">
        {/* A: Inputs */}
        <div className="seq-sub-section">
          <div className="seq-input-grid">
            <div className="seq-input-row">
              {renderPort('rate_cv', 'RATE', 'modulation', 'in', true)}
              {(() => {
                const settings = inputSettings?.[`${nodeId}.rate_cv`] || { amount: 1.0, bipolar: false };
                return (
                  <>
                    <div className="seq-meter-compact">
                      <SignalMeter 
                        layerId={layerId} 
                        nodeId={nodeId} 
                        portId="rate_cv" 
                        bipolar={settings.bipolar} 
                        color={SIGNAL_COLORS['modulation']} 
                      />
                    </div>
                    <div className="seq-attenuverter-wrap">
                      <button 
                        className={`seq-toggle-btn-tiny ${settings.bipolar ? 'active' : ''}`}
                        onClick={() => onUpdateInputSettings?.(`${nodeId}.rate_cv`, { bipolar: !settings.bipolar })}
                        title="Bipolar Mode"
                      >
                        ±
                      </button>
                      <Knob 
                        value={settings.amount} 
                        min={-1} max={1} 
                        size={16}
                        resetValue={1}
                        onChange={v => onUpdateInputSettings?.(`${nodeId}.rate_cv`, { amount: v })} 
                        color="#d918f5" 
                      />
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="seq-input-row">{renderPort('clock_in', 'CLOCK', 'trigger', 'in', true)}</div>
            <div className="seq-input-row">{renderPort('reset_in', 'RESET', 'trigger', 'in', true)}</div>
            <div className="seq-input-row">{renderPort('pause_in', 'PAUSE', 'trigger', 'in', true)}</div>
          </div>
        </div>

        <div className="seq-divider" />

        {/* B: Transport, Mode & Rate */}
        <div className="seq-sub-section">
          <div className="seq-btn-group-vertical">
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`seq-btn ${effect.playState === 'play' ? 'active' : ''}`} onClick={() => onUpdate({ playState: effect.playState === 'play' ? 'pause' : 'play' })}>
                {effect.playState === 'play' ? '⏸' : '▶'}
              </button>
              <button className="seq-btn seq-btn-wide" onClick={() => onUpdate({ manualResetTrigger: Date.now() })}>
                RESET
              </button>
            </div>
            <select value={effect.direction} onChange={e => onUpdate({ direction: e.target.value as any })} className="seq-select" style={{ width: '100%' }}>
              <option value="forward">FORWARD</option>
              <option value="backward">BACKWARD</option>
              <option value="pendulum">PENDULUM</option>
              <option value="random">RANDOM</option>
            </select>
            
            <div className="seq-rate-manual-row">
              <Knob 
                value={effect.rate} 
                min={0.1} max={effect.rateMode === 'hz' ? 20 : 200} 
                onChange={v => onUpdate({ rate: v })} 
                color="#18e4f5"
                size={22}
                resetValue={effect.rateMode === 'hz' ? 2 : 120}
              />
              <div className="seq-val-input-wrap">
                <input 
                  type="number" 
                  className="seq-val-input rate-display-large"
                  value={effect.rate.toFixed(2)}
                  step={0.1}
                  onChange={e => onUpdate({ rate: parseFloat(e.target.value) || 0 })}
                />
                <button className="seq-toggle-btn-small" onClick={() => {
                  const newMode = effect.rateMode === 'hz' ? 'bpm' : 'hz';
                  const newValue = newMode === 'hz' ? effect.rate / 60 : effect.rate * 60;
                  onUpdate({ rateMode: newMode, rate: newValue });
                }}>
                  {effect.rateMode.toUpperCase()}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="seq-divider" />

        {/* D: Slew & Shuffle (Stacked) */}
        <div className="seq-sub-section">
          <div className="seq-stacked-controls">
            <div className="seq-knob-row">
              <span className="seq-label-mini">SLEW</span>
              <Knob value={effect.slew} min={0} max={1} onChange={v => onUpdate({ slew: v })} color="#d918f5" size={16} resetValue={0} />
              <input 
                type="number" 
                className="seq-val-input-mini"
                value={effect.slew.toFixed(2)}
                step={0.01}
                onChange={e => onUpdate({ slew: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="seq-knob-row">
              <span className="seq-label-mini">SHUF</span>
              <Knob value={effect.shuffle} min={0} max={1} onChange={v => onUpdate({ shuffle: v })} color="#f58c18" size={16} resetValue={0} />
              <input 
                type="number" 
                className="seq-val-input-mini"
                value={effect.shuffle.toFixed(2)}
                step={0.01}
                onChange={e => onUpdate({ shuffle: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        <div className="seq-divider" />

        {/* E: Last Step */}
        <div className="seq-sub-section">
          <div className="seq-knob-display-group">
            <span className="seq-label">LAST</span>
            <Knob 
              value={endStep} 
              min={0} max={steps - 1} 
              onChange={v => onUpdate({ endStep: Math.round(v) })} 
              color="#4a9eff" 
              size={22}
              resetValue={steps - 1}
            />
            <input 
              type="number" 
              className="seq-val-input"
              value={endStep + 1}
              min={1} max={steps}
              onChange={e => onUpdate({ endStep: Math.max(0, Math.min(steps - 1, (parseInt(e.target.value) || 1) - 1)) })}
              style={{ color: '#4a9eff', borderColor: '#4a9eff' }}
            />
          </div>
        </div>

        <div className="seq-divider" />

        {/* E: Output */}
        <div className="seq-sub-section">
          <div className="seq-global-out-wrap">
            <span className="seq-label">GLOBAL OUT</span>
            {renderPort('global_out', 'OUT', 'modulation', 'out')}
          </div>
        </div>
      </div>

      {/* Steps Section */}
      <div className="seq-steps-grid-wrap">
        <div className={`seq-steps-grid ${steps === 16 ? 'steps-16' : 'steps-8'}`}>
          {Array.from({ length: steps }).map((_, i) => {
            const isBipolar = effect.allStepsBipolar || (effect.stepBipolar && effect.stepBipolar[i]);
            return (
              <div 
                key={i} 
                className={`seq-step-col ${i === currentStep ? 'active' : ''} ${i === endStep ? 'is-end' : ''}`}
              >
                <div className="seq-step-header" onClick={() => onUpdate({ endStep: i })}>
                  {i + 1}
                </div>
                <div className="seq-step-body">
                  <VerticalFader 
                    value={effect.stepValues[i]} 
                    active={i === currentStep}
                    color={i === currentStep ? '#d918f5' : '#18e4f5'}
                    onChange={v => {
                      const next = [...effect.stepValues];
                      next[i] = v;
                      onUpdate({ stepValues: next });
                    }}
                    onReset={() => {
                      const next = [...effect.stepValues];
                      next[i] = isBipolar ? 1.0 : 0.5;
                      onUpdate({ stepValues: next });
                    }}
                  />
                  <div className="seq-step-footer">
                    <input 
                      type="number" 
                      className="seq-step-val"
                      value={effect.stepValues[i].toFixed(2)}
                      step={0.01}
                      onChange={e => {
                        const next = [...effect.stepValues];
                        next[i] = parseFloat(e.target.value) || 0;
                        onUpdate({ stepValues: next });
                      }}
                    />
                    <button 
                      className={`seq-step-bipolar-btn ${isBipolar ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const current = effect.stepBipolar || new Array(16).fill(false);
                        const next = [...current];
                        next[i] = !next[i];
                        onUpdate({ stepBipolar: next });
                      }}
                      title="Step Bipolar"
                    >
                      ±
                    </button>
                    {renderPort(`step_${i}_out`, `S${i+1}`, 'modulation', 'out')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="seq-bottom-bar">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button 
              className={`seq-btn-small ${effect.allStepsBipolar ? 'active' : ''}`}
              onClick={() => onUpdate({ allStepsBipolar: !effect.allStepsBipolar })}
            >
              GLOBAL BIPOLAR
            </button>
            <button 
              className="seq-expand-btn" 
              onClick={() => onUpdate({ steps: steps === 8 ? 16 : 8, endStep: steps === 8 ? 15 : 7 })}
              style={{ color: '#aaa', marginTop: 0 }}
            >
              {steps === 8 ? '8' : '16'} STEPS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Ghost Edge State ──────────────────────────────────────────────────────────

export interface GhostEdge {
  fromNodeId: string;
  fromPort: string;
  signalType: string;
  x1: number; y1: number; // graph-relative
  x2: number; y2: number;
}

// ── Module Node Component ─────────────────────────────────────────────────────

interface ModuleNodeProps {
  nodeId: string;           // 'source' | effectId | '__output__'
  moduleType: string;
  title: string;
  nodeState: NodeUIState;
  rows: ControlRowDef[];
  rowCtx: RowCtx;
  isOutput?: boolean;
  // patchbay
  patchbayOpen: boolean;
  ghostSignalType?: string;
  onPortPointerDown: (nodeId: string, portId: string, signalType: string, ex: number, ey: number) => void;
  onInputJackPointerDown?: (nodeId: string, portId: string, e: React.PointerEvent) => void;
  onPatchbayDrop: (toNodeId: string, toPort: string) => void;
  // layout
  onPositionChange: (nodeId: string, x: number, y: number) => void;
  onLayoutChange: (updates: Partial<NodeUIState>) => void;
  onRemove?: () => void;
  graphRef: React.RefObject<HTMLDivElement | null>;
  inputSettings?: Record<string, any>; // PortSettings
  onUpdateInputSettings?: (portKey: string, updates: any) => void;
  layerId: string;
  hoveredPortId?: string | null;
  zoom: number;
}

export function ModuleNode({
  nodeId, layerId, moduleType, title, nodeState, rows, rowCtx,
  isOutput, patchbayOpen, ghostSignalType,
  onPortPointerDown, onInputJackPointerDown, onPatchbayDrop,
  onPositionChange, onLayoutChange, onRemove, graphRef,
  inputSettings, onUpdateInputSettings, hoveredPortId, zoom
}: ModuleNodeProps) {
  const expandedGroups = React.useMemo(() => new Set<string>(nodeState.expandedGroups || []), [nodeState.expandedGroups]);
  const rawPorts = PORT_DEFS[moduleType] || [];
  
  // Filter ports for InterLayer modules based on portCount
  const ports = (() => {
    const isInterLayer = moduleType === 'InterLayerOutput' || moduleType === 'InterLayerInput';
    if (!isInterLayer) return rawPorts;
    
    const count = (rowCtx as any).effect?.portCount ?? 1;
    const direction = moduleType === 'InterLayerOutput' ? 'in' : 'out';
    
    return rawPorts.filter(p => {
      if (p.direction !== direction) return true;
      const idx = parseInt(p.id.split('_')[1]);
      return idx < count;
    });
  })();

  const layer = useEngineStore(s => s.layers[layerId]);

  // Find connected bus for visualizers
  const connectedBusId = (() => {
    if (moduleType === 'AudioSource') {
      const effect = (rowCtx as EffectCtx).effect as AudioSourceEffect;
      return effect?.busId || 'master';
    }
    if (moduleType === 'Oscilloscope' || moduleType === 'SpectralSplitter') {
      const edge = layer?.graph?.edges.find(e => e.toNodeId === nodeId && e.toPort === 'audio_in');
      if (!edge) return (moduleType === 'SpectralSplitter' ? ((rowCtx as EffectCtx).effect as any).busId || 'master' : null);
      const sourceEffect = layer?.effects.find(e => e.id === edge.fromNodeId);
      if (sourceEffect?.type === 'AudioSource') return (sourceEffect as AudioSourceEffect).busId;
      if (sourceEffect?.type === 'AudioFile' || sourceEffect?.type === 'AudioInput' || sourceEffect?.type === 'SystemAudio' || sourceEffect?.type === 'AudioTransformer') return edge.fromNodeId;
      if (edge.fromNodeId === 'source' || sourceEffect?.type === 'VideoFile' || sourceEffect?.type === 'VideoURL') return layerId;
    }
    if (moduleType === 'AudioFile' || moduleType === 'AudioInput' || moduleType === 'SystemAudio') return nodeId;
    return null;
  })();

  const inputs  = ports.filter(p => p.direction === 'in');
  const outputs = ports.filter(p => p.direction === 'out');

  // Control row order
  const allRowIds = rows.map(r => r.id);
  const controlOrder = nodeState.controlOrder || [];
  const order = controlOrder.length > 0
    ? [...controlOrder, ...allRowIds.filter(id => !controlOrder.includes(id))]
    : allRowIds;
  const orderedRows = order.map(id => rows.find(r => r.id === id)).filter(Boolean) as ControlRowDef[];
  const visibleRows = nodeState.expanded ? orderedRows.length : Math.min(nodeState.visibleRows, orderedRows.length);
  const hiddenCount = orderedRows.length - visibleRows;

  // Drag node position
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ mx: number; my: number; nx: number; ny: number } | null>(null);
  const capturedHeaderRef = useRef<HTMLElement | null>(null);
  const capturedPointerIdRef = useRef<number | null>(null);

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    // Only drag if the direct target is NOT a button
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    
    // Request pointer capture on the header element to anchor mouse drag tracking to it
    const headerEl = e.currentTarget as HTMLElement;
    capturedHeaderRef.current = headerEl;
    capturedPointerIdRef.current = e.pointerId;
    try {
      headerEl.setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn('setPointerCapture failed:', err);
    }

    dragStart.current = { mx: e.clientX, my: e.clientY, nx: nodeState.x, ny: nodeState.y };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp, { once: true });
  };

  const scrollAnim = useRef<number | null>(null);

  const handleWindowPointerMove = (e: PointerEvent) => {
    if (!dragStart.current || !graphRef.current) return;
    
    // Autoscroll logic
    const el = graphRef.current;
    const rect = el.getBoundingClientRect();
    const margin = 40;
    
    const doScroll = () => {
      if (!dragStart.current || !graphRef.current) return;
      let scrollDx = 0;
      let scrollDy = 0;
      
      // We need to use the LATEST mouse position, but since this is an animation frame,
      // we'll just check if the last 'e' we got is still in the zone.
      // For simplicity, we can just do it in the move handler, but for continuous scroll
      // we'd need a ref for current mouse pos. Let's do the move-triggered scroll first.
      
      if (e.clientX < rect.left + margin) scrollDx = -15;
      else if (e.clientX > rect.right - margin) scrollDx = 15;
      if (e.clientY < rect.top + margin) scrollDy = -15;
      else if (e.clientY > rect.bottom - margin) scrollDy = 15;
      
      if (scrollDx !== 0 || scrollDy !== 0) {
        el.scrollLeft += scrollDx;
        el.scrollTop += scrollDy;
        // Adjust dragStart so the delta calculation remains mouse-relative
        dragStart.current.mx -= scrollDx;
        dragStart.current.my -= scrollDy;
      }
    };
    
    doScroll();

    const dx = (e.clientX - dragStart.current.mx) / zoom;
    const dy = (e.clientY - dragStart.current.my) / zoom;
    const newX = Math.max(0, dragStart.current.nx + dx);
    const newY = Math.max(0, dragStart.current.ny + dy);
    onPositionChange(nodeId, newX, newY);
  };

  const handleWindowPointerUp = () => {
    dragStart.current = null;
    if (scrollAnim.current) cancelAnimationFrame(scrollAnim.current);
    
    // Release pointer capture on the element that has it
    if (capturedHeaderRef.current && capturedPointerIdRef.current !== null) {
      try {
        capturedHeaderRef.current.releasePointerCapture(capturedPointerIdRef.current);
      } catch (err) {
        // ignore
      }
      capturedHeaderRef.current = null;
      capturedPointerIdRef.current = null;
    }
    
    window.removeEventListener('pointermove', handleWindowPointerMove);
  };

  // Row drag reorder
  const rowDragSrc = useRef<number | null>(null);
  const [rowDragOver, setRowDragOver] = useState<number | null>(null);

  const handleRowDragStart = (e: React.DragEvent, index: number) => {
    // Only allow drag from the drag handle
    const target = e.target as HTMLElement;
    const isHandle = target.closest('.rack-row-handle');
    
    if (!isHandle) {
      e.preventDefault();
      return;
    }
    
    rowDragSrc.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'row');
  };

  const handleRowDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (rowDragSrc.current !== null && rowDragSrc.current !== index) {
      const newOrder = [...order];
      const [moved] = newOrder.splice(rowDragSrc.current, 1);
      newOrder.splice(index, 0, moved);
      onLayoutChange({ controlOrder: newOrder });
    }
    rowDragSrc.current = null;
    setRowDragOver(null);
  };

  const portColor = (portId: string, signalType: string, direction: string) => {
    let effectiveType = signalType;
    if (signalType === 'generic') {
      const currentLayer = useEngineStore.getState().layers[layerId];
      const edges = currentLayer?.graph?.edges ?? [];
      if (direction === 'out') {
        const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'sig_in');
        if (inputEdge) effectiveType = inputEdge.signalType || 'generic';
      } else {
        const inputEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === portId);
        if (inputEdge) effectiveType = inputEdge.signalType || 'generic';
      }
    }
    return SIGNAL_COLORS[effectiveType as keyof typeof SIGNAL_COLORS] || '#888';
  };

  const handlePortDown = (e: React.PointerEvent, portId: string, signalType: string, direction: string) => {
    if (direction !== 'out') return;
    if (!graphRef.current) return;
    const rect = graphRef.current.getBoundingClientRect();
    const dotRect = (e.target as HTMLElement).getBoundingClientRect();
    const cx = dotRect.left + dotRect.width / 2 - rect.left;
    const cy = dotRect.top + dotRect.height / 2 - rect.top;
    onPortPointerDown(nodeId, portId, signalType, cx, cy);
  };

  // Patchbay jack pointer up
  const handleJackPointerUp = (e: React.PointerEvent, portId: string, signalType: string) => {
    e.stopPropagation();
    if (!ghostSignalType) return;
    const isGeneric = signalType === 'generic' || ghostSignalType === 'generic';
    const compatible = isGeneric ||
                       (ghostSignalType === signalType) || 
                       (ghostSignalType !== 'video' && signalType !== 'video' && ghostSignalType !== 'audio' && signalType !== 'audio') ||
                       (ghostSignalType === 'video' && signalType === 'modulation');
    if (!compatible) return; // incompatible
    onPatchbayDrop(nodeId, portId);
  };

  const renderPatchbayRow = (port: PortDef, isGrid: boolean = false) => {
    const eCtx = rowCtx as EffectCtx;
    const isLinked = (moduleType === 'Transform2D' && port.id === 'scaleY') && (eCtx.linkedScales?.[nodeId] ?? true);
    const effectivePortId = isLinked ? 'scaleX' : port.id;
    const settingsKey = `${nodeId}.${effectivePortId}`;
    const settings = inputSettings?.[settingsKey] || { amount: 1.0, bipolar: false, invert: false };
    
    const isGeneric = port.signalType === 'generic' || ghostSignalType === 'generic';
    const compatible = isGeneric ||
                        (ghostSignalType === port.signalType) || 
                        (ghostSignalType !== 'video' && port.signalType !== 'video' && ghostSignalType !== 'audio' && port.signalType !== 'audio' && ghostSignalType !== undefined) ||
                        (ghostSignalType === 'video' && port.signalType === 'modulation');
    const isTargeted = patchbayOpen && compatible;
    const isHovered = hoveredPortId === port.id;

    return (
      <div key={port.id} className={`patchbay-row ${isGrid ? 'is-grid' : ''}`}>
        <div 
          className={`patchbay-controls ${patchbayOpen && !compatible ? 'incompatible' : ''} ${isTargeted && !isHovered ? 'targeted' : ''} ${isHovered ? 'hovered-jack' : ''}`}
          data-port-id={port.id}
          data-node-id={nodeId}
        >
          <div 
            className="port-dot patchbay-jack-dot"
            style={{ 
              color: portColor(port.id, port.signalType, port.direction), 
              backgroundColor: isHovered ? portColor(port.id, port.signalType, port.direction) : 'transparent',
              opacity: (patchbayOpen && !compatible) ? 0.3 : 1 
            }}
            onPointerDown={e => {
              e.stopPropagation();
              if (onInputJackPointerDown) onInputJackPointerDown(nodeId, port.id, e);
            }}
            onPointerUp={e => handleJackPointerUp(e, port.id, port.signalType)}
          />
          
          {nodeState.patchbayExpanded && (
            <>
              <span className="patchbay-jack-label" title={port.label} style={{ opacity: isLinked ? 0.6 : 1 }}>
                {isLinked && <span style={{ marginRight: 2, fontSize: '0.8em' }}>🔗</span>}
                {port.label.replace('CV', '').replace('In', '').trim()}
              </span>
              
              <div className="patchbay-amount-knob-container">
                <Knob 
                  value={settings.amount} 
                  max={2.0}
                  resetValue={1.0}
                  color={portColor(port.id, port.signalType, port.direction)}
                  onChange={(v) => useEngineStore.getState().updateInputSettings(layerId, settingsKey, { amount: v })} 
                />
              </div>

              {!port.disableBipolar && (
                <button 
                  className={`patchbay-bipolar-toggle ${settings.bipolar ? 'active' : ''}`}
                  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => { e.stopPropagation(); useEngineStore.getState().updateInputSettings(layerId, settingsKey, { bipolar: !settings.bipolar }); }}
                  title="Toggle Bipolar (-1 to 1)"
                >
                  ⩲
                </button>
              )}

              {port.enableInvert && (
                <button 
                  className={`patchbay-invert-toggle ${settings.invert ? 'active' : ''}`}
                  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => { e.stopPropagation(); useEngineStore.getState().updateInputSettings(layerId, settingsKey, { invert: !settings.invert }); }}
                  title="Toggle Inverted Response"
                >
                  ⇅
                </button>
              )}
            </>
          )}
        </div>
        
        {nodeState.patchbayExpanded && (
          <SignalMeter 
            layerId={layerId}
            nodeId={nodeId}
            portId={effectivePortId}
            bipolar={settings.bipolar}
            color={portColor(port.id, port.signalType, port.direction)}
          />
        )}
      </div>
    );
  };

  if (moduleType === 'StepSequencer') {
    const seq = (rowCtx as EffectCtx).effect as StepSequencerEffect;
    return (
      <div
        ref={nodeRef}
        className={`module-node sequencer-node ${zoom < 0.6 ? 'lod-low' : ''}`}
        style={{ left: nodeState.x, top: nodeState.y }}
        data-node-id={nodeId}
      >
        <div className="module-body">
          <div className="node-header" onPointerDown={handleHeaderPointerDown}>
            <span className="node-drag-handle">⠿</span>
            <span className="node-title">{title}</span>
            <button className="node-remove-btn" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove?.(); }}>×</button>
          </div>
          <StepSequencerUI 
            effect={seq}
            nodeId={nodeId}
            layerId={layerId}
            onUpdate={(u) => (rowCtx as EffectCtx).onUpdate(u as any)}
            onPortDown={(pid, type, e) => handlePortDown(e, pid, type, 'out')}
            onPortUp={(pid, type, e) => handleJackPointerUp(e, pid, type)}
            onInputJackDown={(pid, e) => onInputJackPointerDown?.(nodeId, pid, e)}
            inputSettings={inputSettings}
            onUpdateInputSettings={onUpdateInputSettings}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={nodeRef}
      className={`module-node ${isOutput ? 'output-node' : ''} ${zoom < 0.6 ? 'lod-low' : ''}`}
      style={{ left: nodeState.x, top: nodeState.y }}
      data-node-id={nodeId}
    >
      {/* ── Vertical Patchbay ── */}
      {!isOutput && inputs.length > 0 && moduleType !== 'StepSequencer' && (
        <div className={`module-patchbay ${nodeState.patchbayExpanded ? 'expanded' : 'collapsed'}`}>
          <div 
            className="patchbay-toggle-tab"
            onPointerDown={e => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); onLayoutChange({ patchbayExpanded: !nodeState.patchbayExpanded }); }}
            title={nodeState.patchbayExpanded ? "Collapse Patchbay" : "Expand Patchbay"}
          >
            {nodeState.patchbayExpanded ? '◀' : '▶'}
          </div>
          
          <div className="patchbay-inputs-container">
            {moduleType === 'Spawn' && nodeState.patchbayExpanded && (
              <div className="patchbay-header-row">
                <span className="patchbay-header-title">SNAP</span>
                <button 
                  className={`patchbay-global-latch ${((rowCtx as EffectCtx).effect as SpawnEffect).globalLatch ? 'active' : ''}`}
                  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => { e.stopPropagation(); (rowCtx as EffectCtx).onUpdate({ globalLatch: !((rowCtx as EffectCtx).effect as SpawnEffect).globalLatch } as any); }}
                  title="Global Birth Snapshot"
                >
                  ✨
                </button>
              </div>
            )}
            
            {(() => {
              // Determine which groups should be hidden in a collapsed subgroup
              const hasSubGroups = inputs.some(p => p.group && !p.alwaysShow);
              
              const primaryPorts = inputs.filter(p => !p.group || p.alwaysShow || !hasSubGroups);
              const secondaryPorts = inputs.filter(p => p.group && !p.alwaysShow);

              const content = [];
              
              // 1. Primary Ports
              content.push(...primaryPorts.map(port => renderPatchbayRow(port)));

              // 2. Secondary Subgroup Toggles
              if (hasSubGroups && (patchbayOpen || nodeState.patchbayExpanded)) {
                // Group secondary ports by their group name
                const secondaryGroups: Record<string, PortDef[]> = {};
                secondaryPorts.forEach(p => {
                  if (p.group) {
                    if (!secondaryGroups[p.group]) secondaryGroups[p.group] = [];
                    secondaryGroups[p.group].push(p);
                  }
                });

                Object.entries(secondaryGroups).forEach(([groupName, groupPorts]) => {
                  const isExpanded = expandedGroups.has(groupName);
                  
                  content.push(
                    <div 
                      key={`subgroup-header-${groupName}`} 
                      className={`patchbay-subgroup-header ${isExpanded ? 'expanded' : ''}`}
                      data-node-id={nodeId}
                      data-group-header={groupName}
                      onClick={() => {
                        const current = nodeState.expandedGroups || [];
                        const next = current.includes(groupName)
                          ? current.filter(g => g !== groupName)
                          : [...current, groupName];
                        onLayoutChange({ expandedGroups: next });
                      }}
                    >
                      <span className="subgroup-arrow">{isExpanded ? '▼' : '▶'}</span>
                      Channel {groupName}
                    </div>
                  );

                  if (isExpanded) {
                    content.push(
                      <div key={`subgroup-content-${groupName}`} className="patchbay-subgroup-content">
                        {groupPorts.map(port => renderPatchbayRow(port))}
                      </div>
                    );
                  }
                });
              }

              return content;
            })()}
          </div>
        </div>
      )}

      {/* ── Main Body ── */}
      <div className="module-body">
        {/* Header */}
        <div className="node-header" onPointerDown={handleHeaderPointerDown}>
          <span className="node-drag-handle">⠿</span>
          <span className="node-title">{title}</span>
          {!isOutput && (
            <>
              <button className="node-collapse-btn" title="Expand / collapse"
                onPointerDown={e => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); onLayoutChange({ expanded: !nodeState.expanded }); }}>
                {nodeState.expanded ? '▲' : '▼'}
              </button>
              {onRemove && (
                <button className="node-remove-btn" title="Remove" 
                  onPointerDown={e => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
              )}
            </>
          )}
        </div>

        {/* Visualizers Area */}
        {!isOutput && connectedBusId && (
          <div className="node-visualizer-area" style={{ padding: '0 8px' }}>
            {moduleType === 'Oscilloscope' && (
              <OscilloscopeVisualizer 
                busId={connectedBusId}
                isFrozen={((rowCtx as EffectCtx).effect as OscilloscopeEffect).isFrozen}
                triggerLevel={((rowCtx as EffectCtx).effect as OscilloscopeEffect).triggerLevel}
                timeScale={((rowCtx as EffectCtx).effect as OscilloscopeEffect).timeScale}
              />
            )}
            {(moduleType === 'AudioSource' || moduleType === 'AudioFile' || moduleType === 'AudioInput' || moduleType === 'SystemAudio') && (
              <AudioSourceVisualizer busId={connectedBusId || (nodeId === 'source' ? layerId : nodeId)} />
            )}
            {moduleType === 'SpectralSplitter' && (
              <SpectralVisualizer 
                busId={connectedBusId}
                sensitivity={((rowCtx as EffectCtx).effect as SpectralSplitterEffect).sensitivity}
              />
            )}
          </div>
        )}

        {/* Ports (Outputs & Mute) */}
        {(outputs.length > 0 || (isOutput && inputs.length > 0) || (rowCtx as any).source?.audioMuted !== undefined || (rowCtx as any).source?.muted !== undefined) && moduleType !== 'StepSequencer' && (
          <div className="node-port-row">
            <div className="port-group">
              {isOutput && inputs.map(port => (
                <div key={port.id} className="port-dot-wrap port-in">
                  <div
                    className="port-dot"
                    style={{ color: portColor(port.id, port.signalType, port.direction), cursor: 'crosshair' }}
                    data-port-id={port.id}
                    data-node-id={nodeId}
                    title={port.label}
                    onPointerDown={e => {
                      e.stopPropagation();
                      if (onInputJackPointerDown) onInputJackPointerDown(nodeId, port.id, e);
                    }}
                    onPointerUp={e => handleJackPointerUp(e, port.id, port.signalType)}
                  />
                  <span className="port-label">{port.label}</span>
                </div>
              ))}
            </div>
          
          {/* Module-level Mute Toggle */}
          {(() => {
            if (isOutput) return null;
            const s = (rowCtx as any).source || (rowCtx as any).effect;
            if (!s) return null;
            const muteKey = (s.audioMuted !== undefined || s.type === 'VideoFile' || s.type === 'VideoURL') ? 'audioMuted' : s.muted !== undefined ? 'muted' : null;
            if (!muteKey) return null;
            const isMuted = s[muteKey];
            return (
              <button 
                className={`node-mute-toggle ${isMuted ? 'muted' : ''}`}
                title={isMuted ? 'Unmute module' : 'Mute module'}
                onPointerDown={e => e.preventDefault()}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  if ((rowCtx as any).onChange) {
                    (rowCtx as any).onChange(muteKey, !isMuted); 
                  } else {
                    (rowCtx as any).onUpdate({ [muteKey]: !isMuted });
                  }
                }}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
            );
          })()}

          <div className="port-group" style={{ alignItems: 'flex-end' }}>
            {outputs.map(port => {
              const isVocalEnv = moduleType === 'SpeechEnvelopeTracker';
              const effectObj = isVocalEnv ? ((rowCtx as EffectCtx).effect as SpeechEnvelopeTrackerEffect) : null;
              const isSpeechTrig = port.id === 'speech_trig';
              const isSilenceTrig = port.id === 'silence_trig';
              const isContinuousTogglePort = isVocalEnv && (isSpeechTrig || isSilenceTrig);
              const continuousKey = isSpeechTrig ? 'speechContinuous' : 'silenceContinuous';
              const isContinuousActive = effectObj ? !!effectObj[continuousKey] : false;
              const portColorVal = portColor(port.id, port.signalType, port.direction);

              return (
                <div key={port.id} className="port-dot-wrap port-out">
                  <div
                    className="port-dot"
                    style={{ color: portColorVal, cursor: 'crosshair' }}
                    data-port-id={port.id}
                    data-node-id={nodeId}
                    title={port.label}
                    onPointerDown={e => handlePortDown(e, port.id, port.signalType, 'out')}
                  />
                  {isContinuousTogglePort && (
                    <button
                      className={`continuous-toggle-btn ${isContinuousActive ? 'active' : ''}`}
                      style={{ color: portColorVal }}
                      title={isContinuousActive ? 'Continuous gate mode active' : 'Click to activate continuous gate mode'}
                      onPointerDown={e => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        if (effectObj && (rowCtx as EffectCtx).onUpdate) {
                          (rowCtx as EffectCtx).onUpdate({ [continuousKey]: !isContinuousActive });
                        }
                      }}
                    />
                  )}
                  <span className="port-label">{port.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rack rows */}
      {!isOutput && (
        <div className="node-rack">
          {moduleType === 'SpeechEnvelopeTracker' && (
            <SpeechEnvelopeTrackerUI
              nodeId={nodeId}
              layerId={layerId}
              effect={((rowCtx as EffectCtx).effect as SpeechEnvelopeTrackerEffect)}
              onUpdate={((rowCtx as EffectCtx).onUpdate as any)}
            />
          )}
          {moduleType === 'AudioGate' && (
            <AudioGateUI
              nodeId={nodeId}
              layerId={layerId}
              effect={((rowCtx as EffectCtx).effect as AudioGateEffect)}
              onUpdate={((rowCtx as EffectCtx).onUpdate as any)}
            />
          )}
          {moduleType === 'VocalPitchTracker' && (
            <VocalPitchTrackerUI
              nodeId={nodeId}
              layerId={layerId}
              effect={((rowCtx as EffectCtx).effect as VocalPitchTrackerEffect)}
              onUpdate={((rowCtx as EffectCtx).onUpdate as any)}
            />
          )}
          {moduleType === 'VowelFormantTracker' && (
            <VowelFormantTrackerUI
              nodeId={nodeId}
              layerId={layerId}
              effect={((rowCtx as EffectCtx).effect as VowelFormantTrackerEffect)}
              onUpdate={((rowCtx as EffectCtx).onUpdate as any)}
            />
          )}
          {moduleType === 'SpokenWordVisualizer' && (
            <SpokenWordVisualizerUI
              nodeId={nodeId}
              layerId={layerId}
              effect={((rowCtx as EffectCtx).effect as SpokenWordVisualizerEffect)}
              onUpdate={((rowCtx as EffectCtx).onUpdate as any)}
              inputSettings={inputSettings}
            />
          )}

          {moduleType !== 'SpeechEnvelopeTracker' &&
           moduleType !== 'AudioGate' &&
           moduleType !== 'VocalPitchTracker' &&
           moduleType !== 'VowelFormantTracker' &&
           moduleType !== 'SpokenWordVisualizer' &&
           orderedRows.slice(0, visibleRows).map((row, index) => (
              <div
                key={row.id}
                className={`rack-row ${rowDragOver === index ? 'drag-over-row' : ''}`}
                draggable
                onDragStart={e => handleRowDragStart(e, index)}
                onDragOver={e => { e.preventDefault(); setRowDragOver(index); }}
                onDragLeave={() => setRowDragOver(null)}
                onDrop={e => handleRowDrop(e, index)}
              >
                <div className="rack-row-handle">⋮⋮</div>
                {row.render(rowCtx)}
              </div>
            ))
          }
          {/* Expand / collapse footer */}
          {moduleType !== 'StepSequencer' &&
           moduleType !== 'SpeechEnvelopeTracker' &&
           moduleType !== 'AudioGate' &&
           moduleType !== 'VocalPitchTracker' &&
           moduleType !== 'VowelFormantTracker' &&
           moduleType !== 'SpokenWordVisualizer' &&
           (hiddenCount > 0 || nodeState.expanded) ? (
            <div className="node-collapse-footer"
              onClick={() => onLayoutChange({ expanded: !nodeState.expanded })}>
              {nodeState.expanded ? '▲ collapse' : `▼ ${hiddenCount} more...`}
            </div>
          ) : null}
        </div>
      )}
      </div> {/* End module-body */}
    </div>
  );
}
