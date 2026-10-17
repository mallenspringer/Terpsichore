import React from 'react';
import { StepSequencerEffect } from '../../../state/types';
import { SIGNAL_COLORS } from '../portDefs';
import { Knob } from './Knob';
import { VerticalFader } from './VerticalFader';
import { SignalMeter } from './SignalMeter';

export function StepSequencerUI({ 
  effect, 
  nodeId, 
  layerId, 
  onUpdate, 
  onPortDown, 
  onPortUp, 
  onInputJackDown, 
  inputSettings, 
  onUpdateInputSettings 
}: {
  effect: StepSequencerEffect;
  nodeId: string;
  layerId: string;
  onUpdate: (u: Partial<StepSequencerEffect>) => void;
  onPortDown: (portId: string, type: string, e: React.PointerEvent) => void;
  onPortUp: (portId: string, type: string, e: React.PointerEvent) => void;
  onInputJackDown: (portId: string, e: React.PointerEvent) => void;
  inputSettings?: Record<string, any>;
  onUpdateInputSettings?: (portKey: string, updates: any) => void;
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
