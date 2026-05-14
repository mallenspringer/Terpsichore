import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PORT_DEFS, SIGNAL_COLORS, PortDef } from './portDefs';
import { ControlRowDef, RowCtx, EffectCtx } from './moduleControls';
import { 
  SpawnEffect, StepSequencerEffect, AudioSourceEffect, OscilloscopeEffect, SpectralSplitterEffect 
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

// ── Node Layout State ─────────────────────────────────────────────────────────

export interface NodeUIState {
  x: number;
  y: number;
  controlOrder: string[];
  visibleRows: number;
  expanded: boolean;
  patchbayExpanded: boolean;
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
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
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
      if (edge.fromNodeId === 'source') return layerId;
    }
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

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    // Only drag if the direct target is NOT a button
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
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
    const settings = inputSettings?.[settingsKey] || { amount: 1.0, bipolar: false };
    
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
                      onClick={() => {
                        const next = new Set(expandedGroups);
                        if (isExpanded) next.delete(groupName);
                        else next.add(groupName);
                        setExpandedGroups(next);
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
            {moduleType === 'AudioSource' && (
              <AudioSourceVisualizer busId={connectedBusId} />
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
            {outputs.map(port => (
              <div key={port.id} className="port-dot-wrap port-out">
                <div
                  className="port-dot"
                  style={{ color: portColor(port.id, port.signalType, port.direction), cursor: 'crosshair' }}
                  data-port-id={port.id}
                  data-node-id={nodeId}
                  title={port.label}
                  onPointerDown={e => handlePortDown(e, port.id, port.signalType, 'out')}
                />
                <span className="port-label">{port.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rack rows */}
      {!isOutput && (
        <div className="node-rack">
          {orderedRows.slice(0, visibleRows).map((row, index) => (
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
          {moduleType !== 'StepSequencer' && (hiddenCount > 0 || nodeState.expanded) ? (
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
