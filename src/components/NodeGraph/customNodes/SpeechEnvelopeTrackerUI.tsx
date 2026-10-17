import React, { useRef } from 'react';
import { useEngineStore } from '../../../state/store';
import { SpeechEnvelopeTrackerEffect } from '../../../state/types';
import { Knob } from './Knob';

export function SpeechEnvelopeTrackerUI({
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
