import React, { useRef } from 'react';
import { AudioGateEffect } from '../../../state/types';
import { useEngineStore } from '../../../state/store';
import { Knob } from './Knob';

export function AudioGateUI({
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
