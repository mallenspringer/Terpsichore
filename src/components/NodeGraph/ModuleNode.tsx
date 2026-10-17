import React, { useState, useRef } from 'react';
import { PORT_DEFS, SIGNAL_COLORS, PortDef } from './portDefs';
import { ControlRowDef, RowCtx, EffectCtx } from './moduleControls';
import { 
  SpawnEffect, StepSequencerEffect, AudioSourceEffect, OscilloscopeEffect, SpectralSplitterEffect,
  SpeechEnvelopeTrackerEffect, VocalPitchTrackerEffect, VowelFormantTrackerEffect, SpokenWordVisualizerEffect,
  AudioGateEffect
} from '../../state/types';
import { useEngineStore } from '../../state/store';
import { OscilloscopeVisualizer, AudioSourceVisualizer, SpectralVisualizer } from './AudioVisualizers';
import {
  Knob,
  SignalMeter,
  SpeechEnvelopeTrackerUI,
  AudioGateUI,
  VocalPitchTrackerUI,
  VowelFormantTrackerUI,
  SpokenWordVisualizerUI,
  StepSequencerUI,
} from './customNodes';


import { NodeUIState } from './useNodeLayout';
export type { NodeUIState };



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
