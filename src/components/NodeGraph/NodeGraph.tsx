import { useState, useRef, useCallback, useEffect } from 'react';
import { useEngineStore } from '../../state/store';
import {
  AnyEffect, AnySource, LayerState,
  GraphEdge, LayerGraph,
  VideoFileSource, ImageFileSource,
  SignalType
} from '../../state/types';
import { createDefaultSource, createDefaultEffect, createDefaultModulator } from '../../state/moduleFactory';
import { SOURCE_ROWS, EFFECT_ROWS, SourceCtx, EffectCtx } from './moduleControls';
import { PORT_DEFS, SIGNAL_COLORS, SOURCE_WIRE_COLOR, getPrimaryOutput, MODULE_DISPLAY_NAMES } from './portDefs';
import { ModuleNode, NodeUIState, useNodeLayout, GhostEdge } from './ModuleNode';
import { FoundationalPanel } from './FoundationalPanel';
import './NodeGraph.css';

const NODE_W = 220;
const NODE_GAP = 50;
const OUTPUT_ID = '__output__';

// ── NodeGraph Component ───────────────────────────────────────────────────────

function edgeColor(edge: GraphEdge, layer: LayerState): string {
  if (edge.signalType) return SIGNAL_COLORS[edge.signalType] || '#f5c518';
  
  // Fallback for legacy edges without signalType
  if (edge.fromNodeId === 'source') return SOURCE_WIRE_COLOR[layer.source.type] || '#f5c518';
  const effect = layer.effects.find(e => e.id === edge.fromNodeId);
  if (effect) {
    const port = getPrimaryOutput(effect.type);
    if (port) return SIGNAL_COLORS[port.signalType as keyof typeof SIGNAL_COLORS] || '#f5c518';
  }
  return '#f5c518';
}

// ── Default node x position ───────────────────────────────────────────────────

function defaultX(index: number) {
  return index * (NODE_W + NODE_GAP) + 10;
}

// ── NodeGraph Component ───────────────────────────────────────────────────────

interface NodeGraphProps {
  layerId: string | null;
  layer?: LayerState | null;
  videoProgress: { currentTime: number; duration: number };
  onSeek: React.ChangeEventHandler<HTMLInputElement>;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  cameras: MediaDeviceInfo[];
  linkedScales: Record<string, boolean>;
  setLinkedScales: (s: Record<string, boolean>) => void;
}

export function NodeGraph({ layerId, layer: propLayer, videoProgress, onSeek, onSeekStart, onSeekEnd, cameras, linkedScales, setLinkedScales }: NodeGraphProps) {
  const storeLayer = useEngineStore(s => layerId ? s.layers[layerId] : null);
  const layer = propLayer ?? storeLayer;

  const updateLayer = useEngineStore(s => s.updateLayer);
  const updateLayerGraph = useEngineStore(s => s.updateLayerGraph);
  const setSource = useEngineStore(s => s.setSource);
  const addEffect = useEngineStore(s => s.addEffect);
  const removeEffect = useEngineStore(s => s.removeEffect);
  const addModulator = useEngineStore(s => s.addModulator);
  const removeModulator = useEngineStore(s => s.removeModulator);

  const graphRef = useRef<HTMLDivElement>(null);

  const { getNodeState, updateNodeState } = useNodeLayout(layer?.id ?? null);

  // Ghost edge for drag-connect
  const [ghostEdge, setGhostEdge] = useState<GhostEdge | null>(null);
  const [patchbayNode, setPatchbayNode] = useState<string | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);

  // ── Zoom & Pan State ────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Initial setup: scroll to top-left and position output node
  useEffect(() => {
    const el = graphRef.current;
    if (el && layerId) {
      // Start in the top left corner
      el.scrollLeft = 0;
      el.scrollTop = 0;

      // Check if OUTPUT_ID has a saved position by checking against a dummy default
      const currentState = getNodeState(OUTPUT_ID, { x: -9999, y: -9999 });
      if (currentState.x === -9999) {
        // No saved layout exists yet. Spawn it in the top right of the visible area.
        // We use clientWidth to get the actual visible width of the graph area,
        // subtracting 300px to ensure the whole module is visible.
        // We also cap it at 1000px so it doesn't spawn too far right on ultrawide monitors.
        const spawnX = Math.min(el.clientWidth - 300, 1000);
        updateNodeState(OUTPUT_ID, { x: spawnX, y: 20 });
      }
    }
  }, [layerId, getNodeState, updateNodeState]);

  const applyZoom = useCallback((nextK: number, mouseX: number, mouseY: number) => {
    const el = graphRef.current;
    if (!el) return;

    const k = Math.min(Math.max(nextK, 0.15), 2.0);
    const ratio = k / zoomRef.current;

    // Adjust scroll to keep mouse over the same world point
    const worldX = (el.scrollLeft + mouseX) / zoomRef.current;
    const worldY = (el.scrollTop + mouseY) / zoomRef.current;

    setZoom(k);
    
    // We must wait for the next frame or use a trick because setting zoom 
    // changes the scrollable range. 
    requestAnimationFrame(() => {
      el.scrollLeft = worldX * k - mouseX;
      el.scrollTop = worldY * k - mouseY;
    });
  }, []);

  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (e.ctrlKey) {
        // Zoom behavior (override default)
        e.preventDefault();
        const zoomSpeed = 0.001;
        const delta = -e.deltaY * zoomSpeed;
        const nextK = zoomRef.current * Math.exp(delta);
        applyZoom(nextK, mouseX, mouseY);
      } else {
        // Natural browser scroll! 
        // We don't call e.preventDefault() so the scrollbars work normally.
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, layerId]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Pan with middle click or Space + left click
    const isPan = e.button === 1 || (e.button === 0 && (window as any).isSpaceDown);
    if (!isPan) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startScrollLeft = graphRef.current?.scrollLeft ?? 0;
    const startScrollTop = graphRef.current?.scrollTop ?? 0;

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      if (graphRef.current) {
        graphRef.current.scrollLeft = startScrollLeft - dx;
        graphRef.current.scrollTop = startScrollTop - dy;
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // Track space bar for panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') (window as any).isSpaceDown = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') (window as any).isSpaceDown = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ... skip unmodified handleUpdateEffect, etc. (we'll use multi_replace for accuracy)

  // Drop zone highlight
  const [dropOver, setDropOver] = useState(false);

  const ghostEdgeRef = useRef<GhostEdge | null>(null);
  const layerRef = useRef(layer);
  layerRef.current = layer;

  // ── Derive current graph edges ──────────────────────────────────────────────
  const edges = layer?.graph?.edges ?? [];

  // ── Source / Effect handlers ────────────────────────────────────────────────

  const handleRemoveSource = useCallback(() => {
    if (!layer) return;
    setSource(layer.id, { type: 'None' } as AnySource);
  }, [layer, setSource]);

  const handleSetSource = useCallback((type: string) => {
    if (!layer) return;
    const newSource = createDefaultSource(type);
    setSource(layer.id, newSource);
  }, [layer, setSource]);

  const handleSourceChange = useCallback((key: string, value: any) => {
    if (!layer) return;
    updateLayer(layer.id, { source: { ...layer.source, [key]: value } as AnySource });
  }, [layer, updateLayer]);

  const handleVideoFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !layer) return;
    const url = URL.createObjectURL(file);
    const src = layer.source as VideoFileSource;
    if (src.fileUrl) URL.revokeObjectURL(src.fileUrl);
    updateLayer(layer.id, { source: { ...layer.source, fileUrl: url, fileName: file.name } as VideoFileSource });
  }, [layer, updateLayer]);

  const handleImageFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !layer) return;
    const url = URL.createObjectURL(file);
    const src = layer.source as ImageFileSource;
    if (src.fileUrl) URL.revokeObjectURL(src.fileUrl);
    updateLayer(layer.id, { source: { ...layer.source, fileUrl: url, fileName: file.name } as ImageFileSource });
  }, [layer, updateLayer]);

  const handleUpdateEffect = useCallback((effectId: string, updates: Partial<AnyEffect>) => {
    if (!layer) return;
    const newEffects = layer.effects.map(ef =>
      ef.id === effectId ? { ...ef, ...updates } as AnyEffect : ef
    );
    updateLayer(layer.id, { effects: newEffects });
  }, [layer, updateLayer]);

  const handleRemoveEffect = useCallback((effectId: string) => {
    if (!layer) return;
    removeEffect(layer.id, effectId);
  }, [layer, removeEffect]);

  const handleRemoveModulator = useCallback((modId: string) => {
    if (!layer) return;
    removeModulator(layer.id, modId);
  }, [layer, removeModulator]);

  const handleAddModulator = useCallback((type: string) => {
    if (!layer) return;
    const newId = `mod_${Date.now()}`;
    const newMod = createDefaultModulator(type);
    addModulator(layer.id, newId, newMod);
  }, [layer, addModulator]);

  const handleAddEffect = useCallback((type: AnyEffect['type']) => {
    if (!layer) return;
    const newId = `effect_${Date.now()}`;
    const newEffect = createDefaultEffect(type, newId);
    addEffect(layer.id, newEffect);
  }, [layer, addEffect]);

  // ── Ghost edge drag ─────────────────────────────────────────────────────────

  const handlePortPointerDown = useCallback((nodeId: string, portId: string, signalType: string, ex: number, ey: number, currentX?: number, currentY?: number) => {
    const newGhost = { fromNodeId: nodeId, fromPort: portId, signalType, x1: ex, y1: ey, x2: currentX ?? ex, y2: currentY ?? ey };
    setGhostEdge(newGhost);
    ghostEdgeRef.current = newGhost;
    setPatchbayNode(null);

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!graphRef.current) return;
      const rect = graphRef.current.getBoundingClientRect();
      const k = zoomRef.current;
      const x = -graphRef.current.scrollLeft;
      const y = -graphRef.current.scrollTop;
      
      // Convert screen to world
      const x2 = (e.clientX - rect.left - x) / k;
      const y2 = (e.clientY - rect.top - y) / k;
      
      const updatedGhost = ghostEdgeRef.current ? { ...ghostEdgeRef.current, x2, y2 } : null;
      setGhostEdge(updatedGhost);
      ghostEdgeRef.current = updatedGhost;

      // We can use elementFromPoint because there's no capture layer blocking it
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const nodeEl = el?.closest('[data-node-id]') as HTMLElement | null;
      const hoverId = nodeEl?.dataset.nodeId ?? null;
      
      const jackEl = el?.closest('.patchbay-controls') as HTMLElement | null;
      const hoverPort = jackEl?.dataset.portId ?? null;
      
      setPatchbayNode(hoverId !== nodeId ? hoverId : null);
      setHoveredPortId(hoverPort);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const jackEl = el?.closest('.patchbay-controls') as HTMLElement | null;
      
      if (jackEl && jackEl.dataset.nodeId && jackEl.dataset.portId) {
        // We found a valid jack under the mouse!
        const targetNodeId = jackEl.dataset.nodeId;
        const targetPortId = jackEl.dataset.portId;
        
        // We must check compatibility here since we're handling the drop globally
        const isCompatible = !jackEl.classList.contains('incompatible');
        
        const currentGhost = ghostEdgeRef.current;
        const currentLayer = layerRef.current;
        
        if (isCompatible && targetNodeId !== nodeId && currentGhost && currentLayer) {
          const newEdge: GraphEdge = {
            id: `edge_${Date.now()}`,
            fromNodeId: currentGhost.fromNodeId,
            fromPort: currentGhost.fromPort,
            toNodeId: targetNodeId,
            toPort: targetPortId,
            signalType: currentGhost.signalType as SignalType,
            isAuto: false,
          };
          const manualOutputTarget = targetNodeId === OUTPUT_ID ? currentGhost.fromNodeId : currentLayer.graph?.manualOutputTarget;
          const currentEdges = currentLayer.graph?.edges ?? [];
          const filtered = currentEdges.filter(e => !(e.toNodeId === targetNodeId && e.toPort === targetPortId && !e.isAuto));
          const disconnectedPorts = (currentLayer.graph?.disconnectedPorts ?? []).filter(p => p !== `${targetNodeId}.${targetPortId}`);
          updateLayerGraph(currentLayer.id, { edges: [...filtered, newEdge], manualOutputTarget, disconnectedPorts });
        }
      }

      setGhostEdge(null);
      ghostEdgeRef.current = null;
      setPatchbayNode(null);
      setHoveredPortId(null);
      
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }, [updateLayerGraph]);

  const handlePatchbayDrop = useCallback((toNodeId: string, toPort: string) => {
    // This is called from the jack directly sometimes, so we must still support it!
    const currentGhost = ghostEdgeRef.current;
    const currentLayer = layerRef.current;
    if (!currentGhost || !currentLayer) return;
    
    const newEdge: GraphEdge = {
      id: `edge_${Date.now()}`,
      fromNodeId: currentGhost.fromNodeId,
      fromPort: currentGhost.fromPort,
      toNodeId,
      toPort,
      signalType: currentGhost.signalType as SignalType,
      isAuto: false,
    };
    // If this is the output edge, record the manual target
    const manualOutputTarget = toNodeId === OUTPUT_ID ? currentGhost.fromNodeId : currentLayer.graph?.manualOutputTarget;
    const currentEdges = currentLayer.graph?.edges ?? [];
    // Remove existing edge for same (toNodeId, toPort) connection
    const filtered = currentEdges.filter(e => !(e.toNodeId === toNodeId && e.toPort === toPort && !e.isAuto));
    const disconnectedPorts = (currentLayer.graph?.disconnectedPorts ?? []).filter(p => p !== `${toNodeId}.${toPort}`);
    updateLayerGraph(currentLayer.id, { edges: [...filtered, newEdge], manualOutputTarget, disconnectedPorts });
    setGhostEdge(null);
    ghostEdgeRef.current = null;
    setPatchbayNode(null);
  }, [updateLayerGraph]);

  const handleRemoveEdge = useCallback((edgeId: string) => {
    if (!layer) return;
    const currentEdges = layer.graph?.edges ?? [];
    const removedEdge = currentEdges.find(e => e.id === edgeId);
    if (!removedEdge) return;

    const newEdges = currentEdges.filter(e => e.id !== edgeId);
    const disconnectedPorts = [...(layer.graph?.disconnectedPorts ?? [])];
    
    // If it was auto, or if we want to prevent auto-routing from re-adding it
    if (removedEdge.isAuto || removedEdge.signalType === 'video') {
      const portKey = `${removedEdge.toNodeId}.${removedEdge.toPort}`;
      if (!disconnectedPorts.includes(portKey)) {
        disconnectedPorts.push(portKey);
      }
    }

    const manualOutputTarget = (removedEdge.toNodeId === OUTPUT_ID) ? undefined : layer.graph?.manualOutputTarget;
    updateLayerGraph(layer.id, { edges: newEdges, manualOutputTarget, disconnectedPorts });
  }, [layer, updateLayerGraph]);

  const handleInputJackPointerDown = useCallback((nodeId: string, portId: string, e: React.PointerEvent) => {
    if (!layer || !graphRef.current) return;

    const currentEdges = layer.graph?.edges ?? [];
    // Prefer manual edge, but pick up auto edge if no manual one exists
    const existingEdge = currentEdges.find(edge => edge.toNodeId === nodeId && edge.toPort === portId && !edge.isAuto) || 
                         edges.find(edge => edge.toNodeId === nodeId && edge.toPort === portId && edge.isAuto);
    
    if (e.altKey) {
      if (existingEdge) handleRemoveEdge(existingEdge.id);
      return;
    }

    if (existingEdge) {
      // Pick up the edge!
      const rect = graphRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      
      const nodeIds = ['source', ...layer.effects.map(ef => ef.id), OUTPUT_ID];
      const fromIdx = nodeIds.indexOf(existingEdge.fromNodeId);
      const [startX, startY] = getPortCenter(existingEdge.fromNodeId, existingEdge.fromPort, 'out', fromIdx);
      
      handlePortPointerDown(existingEdge.fromNodeId, existingEdge.fromPort, existingEdge.signalType || 'video', startX, startY, currentX, currentY);
      handleRemoveEdge(existingEdge.id);
    }
  }, [layer, handleRemoveEdge, handlePortPointerDown]);

  // ── Drop from module bank ───────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const moduleType = e.dataTransfer.getData('application/terp-module') || e.dataTransfer.getData('text/plain');
    if (!moduleType || !layer) return;
    const [category, type] = moduleType.split(':');
    if (category === 'effect') {
      handleAddEffect(type as AnyEffect['type']);
    } else if (category === 'source') {
      handleSetSource(type);
    } else if (category === 'modulator') {
      handleAddModulator(type);
    }
  }, [layer, handleAddEffect, handleSetSource, handleAddModulator]);

  // ── Compute node positions (default auto-layout) ────────────────────────────

  const nodeIds = layer ? ['source', ...layer.effects.map(ef => ef.id), ...Object.keys(layer.modulators || {}), OUTPUT_ID] : [];

  const getNodeUIState = (nodeId: string, index: number): NodeUIState => {
    const defaultX_ = defaultX(index);
    return getNodeState(nodeId, { x: defaultX_, y: 10 });
  };

  // ── SVG edge path ───────────────────────────────────────────────────────────

  const getPortCenter = (nodeId: string, portId: string, direction: 'in' | 'out', nodeIdx: number): [number, number] => {
    const ns = getNodeUIState(nodeId, nodeIdx);
    
    if (direction === 'out') {
      let hasInputs = false;
      if (nodeId === 'source' && layer?.source) {
         hasInputs = (PORT_DEFS[layer.source.type] || []).some(p => p.direction === 'in');
      } else if (layer?.modulators && layer.modulators[nodeId]) {
         hasInputs = (PORT_DEFS[layer.modulators[nodeId].type] || []).some(p => p.direction === 'in');
      } else {
         const effect = layer?.effects.find(e => e.id === nodeId);
         if (effect) {
            hasInputs = (PORT_DEFS[effect.type] || []).some(p => p.direction === 'in');
         }
      }
      const isOutputNode = nodeId === OUTPUT_ID;
      
      // Calculate width of the patchbay side
      let actualPatchbayWidth = 0;
      if (!isOutputNode && hasInputs) {
        actualPatchbayWidth = ns.patchbayExpanded ? 140 : 22;
      }
      
      const width = isOutputNode ? 100 : 220; // output node is narrower
      const x = ns.x + actualPatchbayWidth + width;

      // Calculate dynamic Y based on port index
      let ports: any[] = [];
      if (nodeId === 'source' && layer?.source) {
         ports = PORT_DEFS[layer.source.type] || [];
      } else if (layer?.modulators && layer.modulators[nodeId]) {
         ports = PORT_DEFS[layer.modulators[nodeId].type] || [];
      } else {
         const effect = layer?.effects.find(e => e.id === nodeId);
         if (effect) {
            const rawPorts = PORT_DEFS[effect.type] || [];
            if (effect.type === 'InterLayerInput') {
               const count = (effect as any).portCount ?? 1;
               ports = rawPorts.filter(p => p.direction !== 'out' || parseInt(p.id.split('_')[1]) < count);
            } else {
               ports = rawPorts;
            }
         }
      }
      const outputs = ports.filter(p => p.direction === 'out');
      const portIndex = outputs.findIndex(p => p.id === portId);
      
      // y = top of node + header height (24) + row padding (4) + index * (portHeight 8 + gap 3) + half portHeight (4)
      const y = ns.y + 24 + 4 + (portIndex * 11) + 4;
      
      return [x, y];
    } else {
      // IN port (Patchbay for regular nodes, port-row for __output__)
      if (nodeId === OUTPUT_ID) {
        return [ns.x, ns.y + 48];
      }
      
      const x = ns.x + 19; // 15px tab + 6px padding - 2px margin

      let ports: any[] = [];
      if (nodeId === 'source' && layer?.source) {
         ports = PORT_DEFS[layer.source.type] || [];
      } else if (layer?.modulators && layer.modulators[nodeId]) {
         ports = PORT_DEFS[layer.modulators[nodeId].type] || [];
      } else {
         const effect = layer?.effects.find(e => e.id === nodeId);
         if (effect) {
            const rawPorts = PORT_DEFS[effect.type] || [];
            if (effect.type === 'InterLayerOutput') {
               const count = (effect as any).portCount ?? 1;
               ports = rawPorts.filter(p => p.direction !== 'in' || parseInt(p.id.split('_')[1]) < count);
            } else {
               ports = rawPorts;
            }
         }
      }
      
      const inputs = ports.filter(p => p.direction === 'in');
      const portIndex = inputs.findIndex(p => p.id === portId);
      
      // y = top of node + header padding (24) + index * (rowHeight + gap) + half jackHeight (9)
      const rowStep = ns.patchbayExpanded ? 42 : 26; 
      const y = ns.y + 24 + (portIndex * rowStep) + 9;
      
      return [x, y];
    }
  };

  const bezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const cx = (x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + cx} ${y1}, ${x2 - cx} ${y2}, ${x2} ${y2}`;
  };

  if (!layer) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 13, letterSpacing: 1 }}>
        SELECT A LAYER TO VIEW GRAPH
      </div>
    );
  }

  const sourceCtx: SourceCtx = {
    source: layer.source,
    onChange: handleSourceChange,
    videoProgress,
    onSeek,
    onSeekStart,
    onSeekEnd,
    onFileChange: layer.source.type === 'VideoFile' ? handleVideoFileChange : handleImageFileChange,
    cameras,
  };

  return (
    <div className="node-graph-bar">
      {/* ── Foundational Panel ── */}

      {/* ── Graph Canvas ── */}
      <div
        ref={graphRef}
        className="graph-canvas"
        onDragOver={e => { e.preventDefault(); setDropOver(true); }}
        onDragLeave={() => setDropOver(false)}
        onDrop={handleDrop}
        onPointerDown={handlePointerDown}
      >
        <div 
          className="graph-canvas-inner"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: '0 0'
          }}
        >
          {/* SVG Edge Layer */}
          <svg className={`graph-svg ${ghostEdge ? 'capturing' : ''}`}>
            <defs>
              {(Object.keys(SIGNAL_COLORS) as SignalType[]).map(sig => (
                <marker key={sig} id={`arrow-${sig}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill={SIGNAL_COLORS[sig]} />
                </marker>
              ))}
            </defs>

            {edges.map(edge => {
              const fromIdx = nodeIds.indexOf(edge.fromNodeId);
              const toIdx   = nodeIds.indexOf(edge.toNodeId);
              if (fromIdx < 0 || toIdx < 0) return null;
              const [x1, y1] = getPortCenter(edge.fromNodeId, edge.fromPort, 'out', fromIdx);
              const [x2, y2] = getPortCenter(edge.toNodeId, edge.toPort, 'in', toIdx);
              const color = edgeColor(edge, layer);
              const isControl = edge.signalType === 'modulation' || edge.signalType === 'trigger' || edge.signalType === 'midi';
              
              return (
                <path key={edge.id} d={bezierPath(x1, y1, x2, y2)}
                  stroke={color} strokeWidth={edge.isAuto ? 1.5 : 2}
                  strokeDasharray={isControl ? '5,3' : 'none'}
                  fill="none" opacity={0.75}
                  markerEnd={`url(#arrow-${edge.signalType || 'video'})`}
                  onPointerDown={e => {
                    if (e.altKey) {
                      e.stopPropagation();
                      handleRemoveEdge(edge.id);
                    }
                  }}
                  style={{ cursor: 'pointer', pointerEvents: 'all' }}
                />
              );
            })}

            {/* Ghost edge */}
            {ghostEdge && (() => {
              const isControl = ghostEdge.signalType === 'modulation' || ghostEdge.signalType === 'trigger' || ghostEdge.signalType === 'midi';
              return (
                <path d={bezierPath(ghostEdge.x1, ghostEdge.y1, ghostEdge.x2, ghostEdge.y2)}
                  stroke={SIGNAL_COLORS[ghostEdge.signalType as keyof typeof SIGNAL_COLORS] || '#f5c518'}
                  strokeWidth={2} 
                  strokeDasharray={isControl ? '5,3' : 'none'} 
                  fill="none" opacity={0.8} />
              );
            })()}
          </svg>

          {/* ── Source Node ── */}
          {layer.source.type !== 'None' && (() => {
            const ns = getNodeUIState('source', 0);
            const rows = SOURCE_ROWS[layer.source.type] ?? [];
            const title = (layer.source as any).fileName || MODULE_DISPLAY_NAMES[layer.source.type] || layer.source.type;
            return (
              <ModuleNode
                key="source"
                nodeId="source"
                layerId={layer.id}
                moduleType={layer.source.type}
                title={title}
                nodeState={ns}
                rows={rows}
                rowCtx={sourceCtx}
                patchbayOpen={patchbayNode === 'source'}
                ghostSignalType={ghostEdge?.signalType}
                onPortPointerDown={handlePortPointerDown}
                onInputJackPointerDown={handleInputJackPointerDown}
                onPatchbayDrop={handlePatchbayDrop}
                onPositionChange={(_, x, y) => updateNodeState('source', { x, y })}
                onLayoutChange={u => updateNodeState('source', u)}
                onRemove={handleRemoveSource}
                graphRef={graphRef}
                inputSettings={layer.inputSettings}
                hoveredPortId={hoveredPortId}
                zoom={zoom}
              />
            );
          })()}

          {/* ── Effect Nodes ── */}
          {layer.effects.map((effect, idx) => {
            const ns = getNodeUIState(effect.id, idx + 1);
            const rows = EFFECT_ROWS[effect.type] ?? [];
            const effectCtx: EffectCtx = {
              effect,
              onUpdate: (upd) => handleUpdateEffect(effect.id, upd),
              linkedScales,
              setLinkedScales,
            };
            return (
              <ModuleNode
                key={effect.id}
                nodeId={effect.id}
                layerId={layer.id}
                moduleType={effect.type}
                title={MODULE_DISPLAY_NAMES[effect.type] || effect.type}
                nodeState={ns}
                rows={rows}
                rowCtx={effectCtx}
                patchbayOpen={patchbayNode === effect.id}
                ghostSignalType={ghostEdge?.signalType}
                onPortPointerDown={handlePortPointerDown}
                onInputJackPointerDown={handleInputJackPointerDown}
                onPatchbayDrop={handlePatchbayDrop}
                onPositionChange={(_, x, y) => updateNodeState(effect.id, { x, y })}
                onLayoutChange={(u) => updateNodeState(effect.id, u)}
                onRemove={() => handleRemoveEffect(effect.id)}
                graphRef={graphRef}
                inputSettings={layer.inputSettings}
                hoveredPortId={hoveredPortId}
                zoom={zoom}
              />
            );
          })}

          {/* ── Modulator Nodes ── */}
          {Object.entries(layer.modulators || {}).map(([modId, mod], idx) => {
            const ns = getNodeUIState(modId, idx + layer.effects.length + 1);
            const rows = SOURCE_ROWS[mod.type] ?? []; // Most modulators share row defs with sources
            const modCtx: SourceCtx = {
              source: mod,
              onChange: (key, val) => {
                const nextMods = { ...layer.modulators, [modId]: { ...mod, [key]: val } };
                updateLayer(layer.id, { modulators: nextMods });
              },
              onUpdate: (upd) => {
                const nextMods = { ...layer.modulators, [modId]: { ...mod, ...upd } };
                updateLayer(layer.id, { modulators: nextMods });
              }
            };
            return (
              <ModuleNode
                key={modId}
                nodeId={modId}
                layerId={layer.id}
                moduleType={mod.type}
                title={MODULE_DISPLAY_NAMES[mod.type] || mod.type}
                nodeState={ns}
                rows={rows}
                rowCtx={modCtx}
                patchbayOpen={patchbayNode === modId}
                ghostSignalType={ghostEdge?.signalType}
                onPortPointerDown={handlePortPointerDown}
                onInputJackPointerDown={handleInputJackPointerDown}
                onPatchbayDrop={handlePatchbayDrop}
                onPositionChange={(_, x, y) => updateNodeState(modId, { x, y })}
                onLayoutChange={(u) => updateNodeState(modId, u)}
                onRemove={() => handleRemoveModulator(modId)}
                graphRef={graphRef}
                inputSettings={layer.inputSettings}
                hoveredPortId={hoveredPortId}
                zoom={zoom}
              />
            );
          })}
          {/* ── Output Node ── */}
          {(() => {
            const outputIdx = nodeIds.length - 1;
            const ns = getNodeUIState(OUTPUT_ID, outputIdx);
            const isEmpty = layer.source.type === 'None' && layer.effects.length === 0;
            return (
              <div key={OUTPUT_ID} style={{ opacity: isEmpty ? 0.3 : 1, pointerEvents: isEmpty ? 'none' : 'auto' }}>
                <ModuleNode
                  nodeId={OUTPUT_ID}
                  layerId={layer.id}
                  moduleType="__OUTPUT__"
                  title="Layer Output"
                  nodeState={ns}
                  rows={[]}
                  rowCtx={{ source: layer.source, onChange: () => {} } as any}
                  isOutput
                  patchbayOpen={patchbayNode === OUTPUT_ID}
                  ghostSignalType={ghostEdge?.signalType}
                  onPortPointerDown={handlePortPointerDown}
                  onInputJackPointerDown={handleInputJackPointerDown}
                  onPatchbayDrop={handlePatchbayDrop}
                  onPositionChange={(_, x, y) => updateNodeState(OUTPUT_ID, { x, y })}
                  onLayoutChange={u => updateNodeState(OUTPUT_ID, u)}
                  graphRef={graphRef}
                  inputSettings={layer.inputSettings}
                  hoveredPortId={hoveredPortId}
                  zoom={zoom}
                />
              </div>
            );
          })()}

          {/* Placeholder text if empty */}
          {layer.source.type === 'None' && layer.effects.length === 0 && (
            <div className="graph-empty-placeholder">
              Add a module to begin
            </div>
          )}

          <div className={`graph-drop-overlay ${dropOver ? 'visible' : ''}`}>
            Drop module here
          </div>
        </div>
      </div>

      {/* ── Zoom Controls HUD (Anchored to node-graph-bar) ── */}
      <div className="graph-zoom-hud">
        <button className="zoom-reset-btn" onClick={() => applyZoom(1.0, 0, 0)} title="Reset Zoom">
          {Math.round(zoom * 100)}%
        </button>
        <button className="zoom-step-btn" onClick={() => applyZoom(zoom * 1.15, 0, 0)} title="Zoom In">
          +
        </button>
        <button className="zoom-step-btn" onClick={() => applyZoom(zoom / 1.15, 0, 0)} title="Zoom Out">
          -
        </button>
      </div>
    </div>
  );
}
