import { useState, useRef, useCallback, useEffect } from 'react';
import { useEngineStore } from '../../state/store';
import {
  AnyEffect, AnySource, LayerState,
  GraphEdge, LayerGraph,
  VideoFileSource, ImageFileSource,
  SignalType
} from '../../state/types';
import { SOURCE_ROWS, EFFECT_ROWS, SourceCtx, EffectCtx } from './moduleControls';
import { PORT_DEFS, SIGNAL_COLORS, SOURCE_WIRE_COLOR, getPrimaryOutput, MODULE_DISPLAY_NAMES } from './portDefs';
import { ModuleNode, NodeUIState, useNodeLayout, GhostEdge } from './ModuleNode';
import { FoundationalPanel } from './FoundationalPanel';
import './NodeGraph.css';

const NODE_W = 220;
const NODE_GAP = 50;
const OUTPUT_ID = '__output__';

// ── Auto-wiring ───────────────────────────────────────────────────────────────

function buildAutoEdges(layer: LayerState, existingGraph?: LayerGraph): GraphEdge[] {
  const nodes = [
    ...(layer.source.type !== 'None' ? [{ id: 'source', type: layer.source.type }] : []),
    ...layer.effects.map(ef => ({ id: ef.id, type: ef.type })),
    ...Object.entries(layer.modulators || {}).map(([id, mod]) => ({ id, type: mod.type })),
  ];

  if (nodes.length === 0) return [];

  // Track type counts to implement the "no auto-route for duplicates" rule
  const typeCounts: Record<string, number> = {};
  const nodesWithCounts = nodes.map(n => {
    const count = (typeCounts[n.type] || 0) + 1;
    typeCounts[n.type] = count;
    return { ...n, isDuplicate: count > 1 };
  });

  const manualEdges = (existingGraph?.edges ?? []).filter(e => !e.isAuto);
  const disconnectedPorts = existingGraph?.disconnectedPorts ?? [];
  const isPortOccupied = (toNodeId: string, toPortId: string) => 
    manualEdges.some(e => e.toNodeId === toNodeId && e.toPort === toPortId) ||
    disconnectedPorts.includes(`${toNodeId}.${toPortId}`);

  const manualOutputTarget = existingGraph?.manualOutputTarget;
  const manualStillExists = manualOutputTarget && nodes.some(n => n.id === manualOutputTarget);

  const lastNode = nodes[nodes.length - 1];
  const outputTarget = (() => {
    if (!manualStillExists) return lastNode?.id;
    const manualIdx = nodes.findIndex(n => n.id === manualOutputTarget);
    if (manualIdx < nodes.length - 1) return lastNode.id;
    return manualOutputTarget;
  })();

  const autoEdges: GraphEdge[] = [];
  
  // Identify video nodes that ARE NOT duplicates (except source which is always allowed)
  const videoNodes = nodesWithCounts.filter(n => {
    if (n.id === 'source') return true;
    if (n.isDuplicate) return false;
    const defs = PORT_DEFS[n.type] || [];
    return defs.some(p => p.signalType === 'video');
  });

  // Chain edges: videoNode[i] → videoNode[i+1]
  for (let i = 0; i < videoNodes.length - 1; i++) {
    const from = videoNodes[i];
    const to = videoNodes[i + 1];
    const fromPort = getPrimaryOutput(from.type);
    const toPort = PORT_DEFS[to.type]?.find(p => p.direction === 'in' && p.signalType === 'video');
    
    if (fromPort && toPort && !isPortOccupied(to.id, toPort.id)) {
      autoEdges.push({
        id: `auto_${from.id}_${to.id}`,
        fromNodeId: from.id,
        fromPort: fromPort.id,
        toNodeId: to.id,
        toPort: toPort.id,
        signalType: 'video',
        isAuto: true,
      });
    }
  }

  // Output edge
  const lastVideoNode = videoNodes[videoNodes.length - 1];
  const outSrcNode = videoNodes.find(n => n.id === outputTarget) ?? lastVideoNode;
  const outPort = outSrcNode ? getPrimaryOutput(outSrcNode.type) : null;
  
  if (outPort && !isPortOccupied(OUTPUT_ID, 'composite_in')) {
    autoEdges.push({
      id: 'auto_to_output',
      fromNodeId: outSrcNode.id,
      fromPort: outPort.id,
      toNodeId: OUTPUT_ID,
      toPort: 'composite_in',
      signalType: 'video',
      isAuto: true,
    });
  }

  return [...autoEdges, ...manualEdges];
}

// ── Edge color ────────────────────────────────────────────────────────────────

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
  layer: LayerState | null;
  videoProgress: { currentTime: number; duration: number };
  onSeek: React.ChangeEventHandler<HTMLInputElement>;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  cameras: MediaDeviceInfo[];
  linkedScales: Record<string, boolean>;
  setLinkedScales: (s: Record<string, boolean>) => void;
}

export function NodeGraph({ layer, videoProgress, onSeek, onSeekStart, onSeekEnd, cameras, linkedScales, setLinkedScales }: NodeGraphProps) {
  const { updateLayer, updateLayerGraph } = useEngineStore();
  const graphRef = useRef<HTMLDivElement>(null);

  const { getNodeState, updateNodeState } = useNodeLayout(layer?.id ?? null);

  // Ghost edge for drag-connect
  const [ghostEdge, setGhostEdge] = useState<GhostEdge | null>(null);
  const [patchbayNode, setPatchbayNode] = useState<string | null>(null);
  const [hoveredPortId, setHoveredPortId] = useState<string | null>(null);

  // ── Zoom & Pan State ────────────────────────────────────────────────────────
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1.0 });
  const transformRef = useRef(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);

  const applyConstraints = useCallback((newTransform: { x: number, y: number, k: number }) => {
    if (!graphRef.current) return newTransform;
    const { width, height } = graphRef.current.getBoundingClientRect();
    
    // 1. Zoom limits
    const k = Math.min(Math.max(newTransform.k, 0.15), 2.0);
    
    // 2. Pan limits
    // We want to keep at least a portion of the "content" visible.
    // Let's assume a virtual world size or base it on node positions.
    // For now, let's use a generous but finite range.
    // Top-left limit: don't let the user pan too far right/down (x, y > some buffer)
    // Bottom-right limit: don't let them pan too far left/up
    
    const margin = 100 * k;
    const x = Math.min(Math.max(newTransform.x, -2000 * k + width - margin), 500 * k);
    const y = Math.min(Math.max(newTransform.y, -2000 * k + height - margin), 500 * k);

    return { x, y, k };
  }, []);

  useEffect(() => {
    const el = graphRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomSpeed = 0.001;
      const delta = -e.deltaY * zoomSpeed;
      const nextK = transformRef.current.k * Math.exp(delta);
      
      const ratio = nextK / transformRef.current.k;
      const nextX = mouseX - (mouseX - transformRef.current.x) * ratio;
      const nextY = mouseY - (mouseY - transformRef.current.y) * ratio;

      setTransform(applyConstraints({ x: nextX, y: nextY, k: nextK }));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyConstraints]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Pan with middle click or Space + left click
    const isPan = e.button === 1 || (e.button === 0 && (window as any).isSpaceDown);
    if (!isPan) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const initialTransform = { ...transformRef.current };

    const onMove = (me: PointerEvent) => {
      const dx = me.clientX - startX;
      const dy = me.clientY - startY;
      setTransform(applyConstraints({
        ...initialTransform,
        x: initialTransform.x + dx,
        y: initialTransform.y + dy
      }));
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

  const graph = layer?.graph;
  const edges = layer ? buildAutoEdges(layer, graph) : [];

  // Keep graph in sync when layer changes
  useEffect(() => {
    if (!layer) return;
    const newEdges = buildAutoEdges(layer, layer.graph);
    updateLayerGraph(layer.id, { ...layer.graph, edges: newEdges });
  }, [layer?.effects?.length, layer?.source.type, layer?.id]);

  // ── Source / Effect handlers ────────────────────────────────────────────────

  const handleRemoveSource = useCallback(() => {
    if (!layer) return;
    const nextLayer = { ...layer, source: { type: 'None' } as AnySource };
    const newEdges = buildAutoEdges(nextLayer, layer.graph);
    
    useEngineStore.getState().updateLayer(layer.id, {
      source: { type: 'None' },
      graph: {
        ...layer.graph,
        edges: newEdges,
        manualOutputTarget: layer.graph?.manualOutputTarget === 'source' ? undefined : layer.graph?.manualOutputTarget
      }
    });
  }, [layer]);

  const handleSetSource = useCallback((type: string) => {
    if (!layer) return;
    let newSource: AnySource;
    if (type === 'ShapeGenerator') {
      newSource = { 
        type, 
        shapeType: "polygon", 
        sides: 5, 
        roundness: 0, 
        convexity: 0, 
        rotation: 0, 
        strokeWidth: 0, 
        fillColor: [0.3, 0.8, 0.4, 1.0], 
        x: 0,
        y: 0,
        scale: 1.0,
        tiling: [1, 1], 
        tilingMode: 'repeat', 
        edgeSoftness: 0.05 
      };
    } else if (type === 'SignalProcessor') {
      newSource = { type, operation: 'multiply', operandA: 1.0, operandB: 1.0 };
    } else if (type === 'VideoURL') {
      newSource = { type, videoUrl: "https://vjs.zencdn.net/v/oceans.mp4", playbackSpeed: 1.0, loop: true, playState: 'pause', objectFit: 'cover', volume: 1.0, audioMuted: true };
    } else if (type === 'VideoFile') {
      newSource = { type, fileUrl: "", fileName: "No file selected", playbackSpeed: 1.0, loop: true, playState: 'pause', objectFit: 'cover', volume: 1.0, audioMuted: true };
    } else if (type === 'WebcamCapture') {
      newSource = { type, deviceId: "", objectFit: 'cover' };
    } else if (type === 'ImageFile') {
      newSource = { type, fileUrl: "", fileName: "No file selected", objectFit: 'cover' };
    } else if (type === 'AudioInput') {
      newSource = { type, deviceId: "", volume: 1.0, muted: false };
    } else if (type === 'AudioFile') {
      newSource = { type, fileUrl: "", fileName: "No file selected", volume: 1.0, muted: false, loop: true, playState: 'pause' };
    } else if (type === 'SystemAudio') {
      newSource = { type, volume: 1.0, muted: false };
    } else {
      newSource = { type: 'ImageLoader', imageUrl: "/logo.png", objectFit: 'cover' } as any;
    }
    const nextLayer = { ...layer, source: newSource };
    const newEdges = buildAutoEdges(nextLayer, layer.graph);

    updateLayer(layer.id, { 
      source: newSource,
      graph: { ...layer.graph, edges: newEdges }
    });
  }, [layer, updateLayer]);

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
    const newEffects = layer.effects.filter(ef => ef.id !== effectId);
    const newEdges = buildAutoEdges({ ...layer, effects: newEffects }, layer.graph);
    updateLayer(layer.id, { 
      effects: newEffects,
      graph: { ...layer.graph, edges: newEdges }
    });
  }, [layer, updateLayer]);

  const handleRemoveModulator = useCallback((modId: string) => {
    if (!layer) return;
    const nextModulators = { ...layer.modulators };
    delete nextModulators[modId];
    const newEdges = buildAutoEdges({ ...layer, modulators: nextModulators }, layer.graph);
    updateLayer(layer.id, { 
      modulators: nextModulators,
      graph: { ...layer.graph, edges: newEdges }
    });
  }, [layer, updateLayer]);

  const handleAddModulator = useCallback((type: string) => {
    if (!layer) return;
    const newId = `mod_${Date.now()}`;
    let newMod: AnySource;
    if (type === 'LFO') {
      newMod = { type, waveform: 'sine', frequency: 0.1, speedRange: 'low', amplitude: 1.0, offset: 0, bipolar: true } as any;
    } else {
      newMod = { type: 'TriggerPad', isPressed: false, keyMapping: 'none', useEnvelope: false, attack: 0.1, release: 0.5 } as any;
    }
    updateLayer(layer.id, { 
      modulators: { ...layer.modulators, [newId]: newMod }
    });
  }, [layer, updateLayer]);

  const handleAddEffect = useCallback((type: AnyEffect['type']) => {
    if (!layer) return;
    const newId = `effect_${Date.now()}`;
    let newEffect: AnyEffect;
    if (type === 'Transform2D') newEffect = { id: newId, type, translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotation: 0, spin: 0 };
    else if (type === 'ColorAdjust') newEffect = { id: newId, type, hue: 0, saturation: 1, contrast: 1, brightness: 0, invert: false };
    else if (type === 'LumaKey') newEffect = { id: newId, type, threshold: 0.5, tolerance: 0.1, invertKey: false };
    else if (type === 'AudioAnalyzer') newEffect = { id: newId, type, smoothing: 0.5 };
    else if (type === 'InterLayerOutput') newEffect = { id: newId, type, portCount: 1 };
    else if (type === 'InterLayerInput') newEffect = { id: newId, type, portCount: 1 };
    else if (type === 'ColorRGB') newEffect = { id: newId, type, r: 0.5, g: 0.5, b: 0.5, rMode: 'add', gMode: 'add', bMode: 'add' };
    else if (type === 'LumaSplitter') newEffect = { id: newId, type, threshold1: 0.33, threshold2: 0.66, softness: 0.1 };
    else if (type === 'Spawn') newEffect = { id: newId, type, x: 0, y: 0, scale: 0.5, rotation: 0, maxCount: 20, lifetime: 2.0, fadeOut: true, randomPos: 0.0, randomScale: 0.0, coordinateMode: 'normalized' } as any;
    else if (type === 'RGBMixer') newEffect = { id: newId, type, rLevel: 1, gLevel: 1, bLevel: 1 };
    else newEffect = { id: newId, type: 'SimpleFeedback', feedbackAmount: 0.9, zoom: 0.95, angle: 0.05 };
    updateLayer(layer.id, { effects: [...layer.effects, newEffect] });
  }, [layer, updateLayer]);

  // ── Ghost edge drag ─────────────────────────────────────────────────────────

  const handlePortPointerDown = useCallback((nodeId: string, portId: string, signalType: string, ex: number, ey: number, currentX?: number, currentY?: number) => {
    const newGhost = { fromNodeId: nodeId, fromPort: portId, signalType, x1: ex, y1: ey, x2: currentX ?? ex, y2: currentY ?? ey };
    setGhostEdge(newGhost);
    ghostEdgeRef.current = newGhost;
    setPatchbayNode(null);

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!graphRef.current) return;
      const rect = graphRef.current.getBoundingClientRect();
      const { x, y, k } = transformRef.current;
      
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
    const removedEdge = currentEdges.find(e => e.id === edgeId) || edges.find(e => e.id === edgeId);
    if (!removedEdge) return;

    const newEdges = currentEdges.filter(e => e.id !== edgeId);
    const disconnectedPorts = [...(layer.graph?.disconnectedPorts ?? [])];
    
    if (removedEdge.isAuto) {
      disconnectedPorts.push(`${removedEdge.toNodeId}.${removedEdge.toPort}`);
    }

    const manualOutputTarget = (removedEdge.toNodeId === OUTPUT_ID) ? undefined : layer.graph?.manualOutputTarget;
    updateLayerGraph(layer.id, { edges: newEdges, manualOutputTarget, disconnectedPorts });
  }, [layer, edges, updateLayerGraph]);

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
      <div className="node-graph-bar">
        <div className="foundational-panel">
          <div className="foundational-panel-header">
            <span className="fp-dot" style={{ background: '#333' }} />
            Foundational
          </div>
          <div className="fp-empty">Select a layer to begin</div>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a2a2a', fontSize: 12 }}>
          No layer selected
        </div>
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
      {(() => {
        const outEdge = edges.find(e => e.toNodeId === OUTPUT_ID);
        const fId = outEdge?.fromNodeId ?? null;
        const fEffect = layer.effects.find(e => e.id === fId) ?? null;
        const fEffectCtx: EffectCtx | null = fEffect ? {
          effect: fEffect,
          onUpdate: (upd) => handleUpdateEffect(fEffect.id, upd),
          linkedScales,
          setLinkedScales,
        } : null;

        return (
          <FoundationalPanel
            nodeId={fId}
            source={fId === 'source' ? layer.source : null}
            sourceCtx={fId === 'source' ? sourceCtx : null}
            effect={fEffect}
            effectCtx={fEffectCtx}
            layerName={layer.name}
          />
        );
      })()}

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
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
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
                signalValues={layer.signalValues}
                inputSettings={layer.inputSettings}
                hoveredPortId={hoveredPortId}
                zoom={transform.k}
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
                signalValues={layer.signalValues}
                inputSettings={layer.inputSettings}
                hoveredPortId={hoveredPortId}
                zoom={transform.k}
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
                signalValues={layer.signalValues}
                inputSettings={layer.inputSettings}
                hoveredPortId={hoveredPortId}
                zoom={transform.k}
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
                  signalValues={layer.signalValues}
                  inputSettings={layer.inputSettings}
                  hoveredPortId={hoveredPortId}
                  zoom={transform.k}
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

          {/* Drop overlay */}
          <div className={`graph-drop-overlay ${dropOver ? 'visible' : ''}`}>
            Drop module here
          </div>
        </div>

        {/* ── Zoom Controls HUD ── */}
        <div className="graph-zoom-hud">
          <button className="zoom-reset-btn" onClick={() => setTransform({ x: 0, y: 0, k: 1.0 })} title="Reset Zoom">
            {Math.round(transform.k * 100)}%
          </button>
        </div>
      </div>
    </div>
  );
}
