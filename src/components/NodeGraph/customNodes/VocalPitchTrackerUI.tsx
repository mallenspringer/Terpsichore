import { useRef, useEffect } from 'react';
import { VocalPitchTrackerEffect } from '../../../state/types';
import { useEngineStore } from '../../../state/store';
import { SignalDispatcher } from '../../../state/SignalDispatcher';
import { Knob } from './Knob';

export function VocalPitchTrackerUI({
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
  const noteTrigVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.note_change_trig`] ?? 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);
  const toleranceRef = useRef<number>(effect.tolerance);
  toleranceRef.current = effect.tolerance;

  const getNoteName = (hz: number) => {
    if (hz <= 20) return { note: '---', cents: 0 };
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = 12 * Math.log2(hz / 440) + 69;
    const roundedMidi = Math.round(midi);
    const cents = Math.round((midi - roundedMidi) * 100);
    const note = noteNames[((roundedMidi % 12) + 12) % 12] + Math.floor(roundedMidi / 12 - 1);
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
      const liveSignals = SignalDispatcher.getInstance().getLatestSignals(layerId);
      const liveHz = liveSignals[`${nodeId}.pitch_hz`] ?? 0;
      const liveStab = liveSignals[`${nodeId}.stability`] ?? 0;
      const history = historyRef.current;
      history.push(liveHz > 20 && (liveStab >= toleranceRef.current || effect.holdOnSilence !== false) ? liveHz : 0);
      if (history.length > 100) history.shift();

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

      if (history.length > 1) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(24, 228, 245, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#18e4f5';

        const minF = Math.max(20, effect.minPitchHz);
        const maxF = Math.max(minF + 10, effect.maxPitchHz);
        const logMin = Math.log2(minF);
        const logMax = Math.log2(maxF);

        history.forEach((hz, idx) => {
          const x = (idx / 100) * w;
          if (hz <= 20) {
            if (idx === 0) ctx.moveTo(x, h);
            else ctx.lineTo(x, h);
          } else {
            const logHz = Math.log2(hz);
            const y = h - Math.max(0, Math.min(1, (logHz - logMin) / (logMax - logMin || 1))) * h;
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
  }, [layerId, nodeId, effect.minPitchHz, effect.maxPitchHz, effect.holdOnSilence]);

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
            resetValue={0.35} 
            color="#f58c18" 
            onChange={v => onUpdate({ tolerance: v })} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
        <div className="vocal-range-mode-toggle" style={{ margin: 0 }}>
          <button
            className={`range-mode-btn ${effect.holdOnSilence !== false ? 'active-voice' : ''}`}
            onClick={() => onUpdate({ holdOnSilence: true })}
            title="Hold last voiced pitch across consonants/pauses until timeout"
          >
            HOLD SILENCE
          </button>
          <button
            className={`range-mode-btn ${effect.holdOnSilence === false ? 'active-music' : ''}`}
            onClick={() => onUpdate({ holdOnSilence: false })}
            title="Drop pitch immediately when unvoiced"
          >
            DROP INSTANT
          </button>
        </div>
        {effect.holdOnSilence !== false && (
          <div className="vocal-knob-item">
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between', gap: 10 }}>
              <span className="vocal-knob-label" style={{ margin: 0 }}>HOLD DECAY: {Math.round(effect.holdTimeoutMs ?? 600)}ms</span>
              <Knob
                value={effect.holdTimeoutMs ?? 600}
                min={50} max={3000}
                resetValue={600}
                color="#18e4f5"
                onChange={v => onUpdate({ holdTimeoutMs: Math.round(v) })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
