import React, { useState, useEffect, useRef } from 'react';
import { AudioEngine } from '../../../state/AudioEngine';
import { useEngineStore } from '../../../state/store';
import { AnySource, AnyEffect } from '../../../state/types';

// ── Context types ──────────────────────────────────────────────────────────────

export interface SourceCtx {
  source: AnySource;
  layer: any;
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
  onFileChange?: React.ChangeEventHandler<HTMLInputElement>;
  videoProgress?: { currentTime: number; duration: number };
  onSeek?: React.ChangeEventHandler<HTMLInputElement>;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
}

export type RowCtx = SourceCtx | EffectCtx;

export interface ControlRowDef {
  id: string;
  label: string;
  render: (ctx: RowCtx) => React.ReactNode;
}

// ── Helper shorthand ──────────────────────────────────────────────────────────

export const src = <T extends unknown>(ctx: RowCtx) => ((ctx as any).source || (ctx as any).effect) as T;
export const eff = <T extends unknown>(ctx: RowCtx) => ((ctx as any).effect || (ctx as any).source) as T;
export const chg = (ctx: RowCtx) => {
  if ((ctx as any).onChange) return (ctx as any).onChange;
  return (key: string, val: any) => (ctx as EffectCtx).onUpdate({ [key]: val } as any);
};
export const sup = (ctx: RowCtx) => (ctx as SourceCtx).onUpdate;
export const upd = (ctx: RowCtx) => {
  if ((ctx as any).onUpdate) return (ctx as any).onUpdate;
  return (upd: any) => (ctx as SourceCtx).onChange?.(Object.keys(upd)[0], Object.values(upd)[0]);
};

export const KEY_COLORS: Record<string, string> = {
  '1': '#ff4444', '2': '#ff8844', '3': '#ffcc44', '4': '#88cc00', '5': '#44ffcc',
  '6': '#4488ff', '7': '#8844ff', '8': '#cc44ff', '9': '#ff44cc', '0': '#ffffff'
};

export const KeyMappingRow = ({ label, value, onChange, ctx }: { label: string; value: string; onChange: (v: string) => void; ctx: RowCtx }) => {
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
              Key {k} {usedKeys.has(k) && k !== value ? '(Used)' : ''}
            </option>
          ))}
        </select>
        {value !== 'none' && (
          <div style={{ 
            width: 8, height: 8, borderRadius: '50%', 
            background: KEY_COLORS[value] || '#fff',
            boxShadow: `0 0 5px ${KEY_COLORS[value] || '#fff'}`
          }} />
        )}
      </div>
    </div>
  );
};

export const VUMeter = ({ busId }: { busId: string }) => {
  const [peak, setPeak] = useState(0);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      const p = AudioEngine.getInstance().getPeakVolume(busId);
      setPeak(prev => {
        const next = Math.max(p, prev * 0.9);
        return next;
      });
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [busId]);

  const getMeterColor = (val: number) => {
    if (val > 0.9) return '#ff4444';
    if (val > 0.7) return '#ffcc44';
    return '#88cc00';
  };

  return (
    <div className="vu-meter-container" style={{ width: '100%', height: 4, background: '#111', borderRadius: 2, overflow: 'hidden', marginTop: 2, border: '1px solid #333' }}>
      <div 
        className="vu-meter-bar" 
        style={{ 
          width: `${Math.min(100, peak * 100)}%`, 
          height: '100%', 
          background: getMeterColor(peak),
          transition: 'width 0.05s ease-out',
          boxShadow: peak > 0.8 ? `0 0 10px ${getMeterColor(peak)}` : 'none'
        }} 
      />
    </div>
  );
};

export const Slider = ({ label, min, max, step, value, onChange, resetValue = 0, paramId, ctx }: {
  label?: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; resetValue?: number;
  paramId?: string; ctx?: RowCtx;
}) => {
  const safeValue = typeof value === 'number' ? value : resetValue;

  const midiBindings = useEngineStore(s => s.midiBindings) || [];
  const midiLearnTarget = useEngineStore(s => s.midiLearnTarget);
  const setMidiLearnTarget = useEngineStore(s => s.setMidiLearnTarget);
  const midiOverlayActive = useEngineStore(s => s.midiOverlayActive);

  const layerId = ctx?.layer?.id;
  const moduleObj = (ctx as any)?.source || (ctx as any)?.effect;
  const moduleId = moduleObj?.id;

  const isMidiMappable = !!(layerId && moduleId && paramId) && midiOverlayActive;

  const isLearningThis = isMidiMappable && midiLearnTarget && 
    midiLearnTarget.type === 'absolute' && 
    midiLearnTarget.layerId === layerId && 
    midiLearnTarget.moduleId === moduleId && 
    midiLearnTarget.paramId === paramId;

  const existingBinding = isMidiMappable ? midiBindings.find(b => 
    b.target.type === 'absolute' && 
    b.target.layerId === layerId && 
    b.target.moduleId === moduleId && 
    b.target.paramId === paramId
  ) : null;

  const handleMidiJackClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMidiMappable) return;
    
    if (isLearningThis) {
      setMidiLearnTarget(null);
    } else {
      setMidiLearnTarget({
        type: 'absolute',
        layerId,
        moduleId,
        paramId
      });
    }
  };

  return (
    <div 
      className="rack-row-content" 
      onPointerDown={e => e.stopPropagation()} 
      onDragStart={e => e.stopPropagation()}
      onDoubleClick={() => onChange(resetValue)}
      title="Double-click to reset"
      style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', boxSizing: 'border-box' }}
    >
      {label && <span className="rack-row-label" style={{ flexShrink: 0 }}>{label}: {safeValue.toFixed(2)}</span>}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <input 
          type="range" 
          min={min} 
          max={max} 
          step={step} 
          value={safeValue}
          style={{ flex: 1, minWidth: 50 }}
          onChange={e => {
            e.stopPropagation();
            onChange(parseFloat(e.target.value));
          }} 
        />
        {isMidiMappable && (
          <button
            onClick={handleMidiJackClick}
            className={`midi-shortcut-jack ${existingBinding ? 'bound' : ''} ${isLearningThis ? 'learning' : ''}`}
            title={
              isLearningThis 
                ? 'MIDI Learn Active: wiggle a knob/slider on your controller to bind...' 
                : existingBinding 
                  ? `Bound to MIDI (Ch ${existingBinding.midiSource.channel}, ${existingBinding.midiSource.ccNumber !== undefined ? 'CC ' + existingBinding.midiSource.ccNumber : 'Note ' + existingBinding.midiSource.noteNumber}). Click to relearn.`
                  : 'Click to map this parameter to MIDI hardware'
            }
            style={{
              background: isLearningThis 
                ? '#ff4444' 
                : existingBinding 
                  ? '#9e4aff' 
                  : '#222',
              color: isLearningThis || existingBinding ? '#fff' : '#666',
              border: isLearningThis 
                ? '1px solid #ffaa99' 
                : existingBinding 
                  ? '1px solid #c8a2ff' 
                  : '1px solid #444',
              borderRadius: '4px',
              fontSize: '10px',
              padding: '2px 4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '22px',
              height: '18px',
              transition: 'all 0.2s ease',
              boxShadow: isLearningThis 
                ? '0 0 8px rgba(255, 68, 68, 0.6)' 
                : existingBinding 
                  ? '0 0 8px rgba(158, 74, 255, 0.5)' 
                  : 'none',
              fontFamily: 'inherit'
            }}
          >
            🔌
          </button>
        )}
      </div>
    </div>
  );
};
