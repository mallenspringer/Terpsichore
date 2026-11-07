import React, { useState, useEffect } from 'react';
import { useEngineStore } from '../../../state/store';
import { OpticalSensorEffect } from '../../../state/types';
import { SensorEngine } from '../../../sensor/SensorEngine';

interface OpticalSensorNodeUIProps {
  nodeId: string;
  layerId: string;
  effect: OpticalSensorEffect;
  rowCtx?: any;
}

export function OpticalSensorNodeUI({
  nodeId,
  layerId,
  effect
}: OpticalSensorNodeUIProps) {
  const sensorSystem = useEngineStore(s => s.sensorSystem);
  const updateEffect = useEngineStore(s => s.updateEffect);
  const sensors = sensorSystem?.sensors || [];

  // Local tick state for 30-60fps UI meter updates
  const [, setTick] = useState(0);

  useEffect(() => {
    return SensorEngine.getInstance().subscribe(() => {
      setTick(t => (t + 1) % 1000);
    });
  }, []);

  const selectedSensor = sensors.find(s => s.id === effect.sensorId);
  const signals = effect.sensorId ? SensorEngine.getInstance().getSensorSignals(effect.sensorId) : undefined;

  const motion = Math.min(1.0, (signals?.motion ?? 0) * (effect.gain ?? 1.0));
  const isGate = (signals?.gate ?? 0) > 0;
  const isTrig = (signals?.trig ?? 0) > 0;

  const handleOpenConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('terp_open_sensor_modal'));
  };

  return (
    <div
      style={{
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        userSelect: 'none',
        fontSize: 11,
        color: '#cbd5e1'
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Sensor Channel Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          value={effect.sensorId || ''}
          onChange={e => updateEffect(layerId, nodeId, { sensorId: e.target.value } as any)}
          style={{
            flex: 1,
            background: '#151922',
            border: '1px solid #334155',
            color: '#f8fafc',
            borderRadius: 3,
            padding: '3px 6px',
            fontSize: 11,
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="">(Select Sensor Channel)</option>
          {sensors.map(s => (
            <option key={s.id} value={s.id}>
              {s.type === 'line' ? '─' : s.type === 'circle' ? '○' : '▭'} {s.name} ({s.algorithm === 'chrominance' ? 'RGB' : 'Motion'})
            </option>
          ))}
        </select>

        <button
          onClick={handleOpenConfig}
          title="Open Sensor Zones Setup"
          style={{
            background: '#1e293b',
            border: '1px solid #00e5ff66',
            color: '#00e5ff',
            borderRadius: 3,
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 700
          }}
        >
          🎯 EDIT
        </button>
      </div>

      {/* Live Motion Activity Meter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', width: 44 }}>Activity</span>
        <div
          style={{
            flex: 1,
            height: 6,
            background: '#090d14',
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid #1e293b'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.round(motion * 100)}%`,
              background: selectedSensor?.color || '#00e5ff',
              transition: 'width 0.04s linear'
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            title="Gate Out"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isGate ? '#00ff66' : '#222',
              boxShadow: isGate ? '0 0 6px #00ff66' : 'none',
              border: '1px solid rgba(255,255,255,0.2)'
            }}
          />
          <div
            title="Trigger Out"
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: isTrig ? '#ffaa00' : '#222',
              boxShadow: isTrig ? '0 0 6px #ffaa00' : 'none',
              border: '1px solid rgba(255,255,255,0.2)'
            }}
          />
        </div>
      </div>

      {/* Live Chrominance Swatch if selected sensor is chrominance */}
      {selectedSensor?.algorithm === 'chrominance' && signals && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', width: 44 }}>Color</span>
          <div
            style={{
              width: 20,
              height: 14,
              borderRadius: 3,
              background: `rgb(${Math.round(signals.r * 255)}, ${Math.round(signals.g * 255)}, ${Math.round(signals.b * 255)})`,
              border: '1px solid rgba(255,255,255,0.3)'
            }}
          />
          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#cbd5e1' }}>
            H:{Math.round(signals.hue * 360)}° S:{Math.round(signals.sat * 100)}% L:{Math.round(signals.luma * 100)}%
          </span>
        </div>
      )}

      {/* Gain & Threshold Fine-tune */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', width: 44 }}>Gain</span>
        <input
          type="range"
          min="0.1"
          max="2.0"
          step="0.05"
          value={effect.gain ?? 1.0}
          onChange={e => updateEffect(layerId, nodeId, { gain: parseFloat(e.target.value) } as any)}
          style={{ flex: 1, height: 4, accentColor: '#00e5ff', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 10, width: 28, textAlign: 'right', fontFamily: 'monospace' }}>
          {(effect.gain ?? 1.0).toFixed(1)}x
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', width: 44 }}>Thresh</span>
        <input
          type="range"
          min="0.05"
          max="0.95"
          step="0.05"
          value={effect.threshold ?? 0.3}
          onChange={e => updateEffect(layerId, nodeId, { threshold: parseFloat(e.target.value) } as any)}
          style={{ flex: 1, height: 4, accentColor: '#00e5ff', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 10, width: 28, textAlign: 'right', fontFamily: 'monospace' }}>
          {Math.round((effect.threshold ?? 0.3) * 100)}%
        </span>
      </div>
    </div>
  );
}
