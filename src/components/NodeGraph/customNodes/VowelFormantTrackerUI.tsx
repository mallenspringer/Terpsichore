import { useRef, useEffect } from 'react';
import { VowelFormantTrackerEffect } from '../../../state/types';
import { useEngineStore } from '../../../state/store';
import { Knob } from './Knob';

export function VowelFormantTrackerUI({
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
