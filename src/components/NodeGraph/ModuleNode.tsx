import { useState, useRef, useCallback, useEffect } from 'react';
import { PORT_DEFS, SIGNAL_COLORS, getShortLabel } from './portDefs';
import { ControlRowDef, RowCtx, EffectCtx } from './moduleControls';
import { AnySource, AnyEffect, SignalType, SpawnEffect } from '../../state/types';
import { useEngineStore } from '../../state/store';

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

function SignalMeter({ layerId, nodeId, portId, bipolar, color }: { 
  layerId: string, 
  nodeId: string, 
  portId: string, 
  bipolar: boolean,
  color: string 
}) {
  const settingsKey = `${nodeId}.${portId}`;
  const val = useEngineStore(s => s.layers[layerId]?.signalValues?.[settingsKey] ?? 0);

  return (
    <div className="patchbay-meter-container">
      <div className="patchbay-meter-bar">
        <div 
          className={`patchbay-meter-fill ${bipolar ? 'bipolar-fill' : ''}`}
          style={{ 
            width: `${Math.min(100, Math.abs(bipolar ? (val / 2) * 100 : (val / 2) * 100))}%`,
            left: bipolar ? (val < 0 ? `${50 - Math.min(50, Math.abs((val / 2) * 50))}%` : '50%') : '0',
          }}
        />
      </div>
      <div className="patchbay-meter-overlay" style={{ color }}>
        <span className="lcd-number">
          {val >= 0 ? '+' : ''}{val.toFixed(2)}
        </span>
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
  layerId: string;
  hoveredPortId?: string | null;
  zoom: number;
}

export function ModuleNode({
  nodeId, layerId, moduleType, title, nodeState, rows, rowCtx,
  isOutput, patchbayOpen, ghostSignalType,
  onPortPointerDown, onInputJackPointerDown, onPatchbayDrop,
  onPositionChange, onLayoutChange, onRemove, graphRef,
  inputSettings, hoveredPortId, zoom
}: ModuleNodeProps) {
  const rawPorts = PORT_DEFS[moduleType] || [];
  
  // Filter ports for InterLayer modules based on portCount
  const ports = (() => {
    const isInterLayer = moduleType === 'InterLayerOutput' || moduleType === 'InterLayerInput';
    if (!isInterLayer) return rawPorts;
    
    const count = (rowCtx as any).effect?.portCount ?? 1;
    const direction = moduleType === 'InterLayerOutput' ? 'in' : 'out';
    
    // We only filter the primary directional ports (In for Output module, Out for Input module)
    return rawPorts.filter(p => {
      if (p.direction !== direction) return true;
      const idx = parseInt(p.id.split('_')[1]);
      return idx < count;
    });
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
  const dragStart = useRef<{ mx: number; my: number; nx: number; ny: number } | null>(null);

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    // Only drag if the direct target is NOT a button
    if ((e.target as HTMLElement).closest('button')) return;

    e.preventDefault();
    dragStart.current = { mx: e.clientX, my: e.clientY, nx: nodeState.x, ny: nodeState.y };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp, { once: true });
  };

  const handleWindowPointerMove = (e: PointerEvent) => {
    if (!dragStart.current || !graphRef.current) return;
    const dx = (e.clientX - dragStart.current.mx) / zoom;
    const dy = (e.clientY - dragStart.current.my) / zoom;
    const newX = Math.max(0, dragStart.current.nx + dx);
    const newY = Math.max(0, dragStart.current.ny + dy);
    onPositionChange(nodeId, newX, newY);
  };

  const handleWindowPointerUp = () => {
    dragStart.current = null;
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

  return (
    <div
      className={`module-node ${isOutput ? 'output-node' : ''} ${zoom < 0.6 ? 'lod-low' : ''}`}
      style={{ left: nodeState.x, top: nodeState.y }}
      data-node-id={nodeId}
    >
      {/* ── Vertical Patchbay ── */}
      {!isOutput && inputs.length > 0 && (
        <div className={`module-patchbay ${nodeState.patchbayExpanded ? 'expanded' : 'collapsed'}`}>
          <div 
            className="patchbay-toggle-tab"
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
                  onPointerDown={e => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); (rowCtx as EffectCtx).onUpdate({ globalLatch: !((rowCtx as EffectCtx).effect as SpawnEffect).globalLatch } as any); }}
                  title="Global Birth Snapshot"
                >
                  ✨
                </button>
              </div>
            )}
            {inputs.map(port => {
              const eCtx = rowCtx as EffectCtx;
              const isLinked = (moduleType === 'Transform2D' && port.id === 'scaleY') && (eCtx.linkedScales?.[nodeId] ?? true);
              const effectivePortId = isLinked ? 'scaleX' : port.id;
              const settingsKey = `${nodeId}.${effectivePortId}`;
              const settings = inputSettings?.[settingsKey] || { amount: 1.0, bipolar: false };
              
              
              // Smart adoption for generic ports: 
              // If we are dragging, and either side is generic, it's compatible.
              const isGeneric = port.signalType === 'generic' || ghostSignalType === 'generic';
              const compatible = isGeneric ||
                                 (ghostSignalType === port.signalType) || 
                                 (ghostSignalType !== 'video' && port.signalType !== 'video' && ghostSignalType !== 'audio' && port.signalType !== 'audio' && ghostSignalType !== undefined) ||
                                 (ghostSignalType === 'video' && port.signalType === 'modulation');
              const isTargeted = patchbayOpen && compatible;
              const isHovered = hoveredPortId === port.id;
              
              return (
                <div key={port.id} className="patchbay-row">
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
                          {getShortLabel(port.id, port.label)}
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

                        {moduleType === 'Spawn' && port.signalType === 'modulation' && (
                          <button
                            className={`patchbay-latch-toggle ${((rowCtx as EffectCtx).effect as SpawnEffect).latchedPorts?.includes(port.id) ? 'active' : ''}`}
                            onPointerDown={e => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              const effect = (rowCtx as EffectCtx).effect as SpawnEffect;
                              const current = effect.latchedPorts || [];
                              const next = current.includes(port.id) ? current.filter(p => p !== port.id) : [...current, port.id];
                              (rowCtx as EffectCtx).onUpdate({ latchedPorts: next } as any);
                            }}
                            title="Snapshot at Birth"
                          >
                            ✨
                          </button>
                        )}
                        
                        <button 
                          className={`patchbay-bipolar-toggle ${settings.bipolar ? 'active' : ''}`}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); useEngineStore.getState().updateInputSettings(layerId, settingsKey, { bipolar: !settings.bipolar }); }}
                          title="Toggle Bipolar (-1 to 1)"
                        >
                          ⩲
                        </button>
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
            })}
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
                onClick={(e) => { e.stopPropagation(); onLayoutChange({ expanded: !nodeState.expanded }); }}>
                {nodeState.expanded ? '▲' : '▼'}
              </button>
              {onRemove && (
                <button className="node-remove-btn" title="Remove" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>
              )}
            </>
          )}
        </div>

        {/* Ports (Outputs & Mute) */}
        {(outputs.length > 0 || (isOutput && inputs.length > 0) || (rowCtx as any).source?.audioMuted !== undefined || (rowCtx as any).source?.muted !== undefined) && (
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
            const s = (rowCtx as any).source;
            if (!s) return null;
            const muteKey = s.audioMuted !== undefined ? 'audioMuted' : s.muted !== undefined ? 'muted' : null;
            if (!muteKey) return null;
            const isMuted = s[muteKey];
            return (
              <button 
                className={`node-mute-toggle ${isMuted ? 'muted' : ''}`}
                title={isMuted ? 'Unmute module' : 'Mute module'}
                onClick={(e) => { e.stopPropagation(); (rowCtx as any).onChange(muteKey, !isMuted); }}
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
          ))}
          {/* Expand / collapse footer */}
          {hiddenCount > 0 || nodeState.expanded ? (
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
