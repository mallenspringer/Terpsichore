import { useState, useRef, useEffect } from 'react';
import { useEngineStore } from '../state/store';
import { VideoFileSource, ImageFileSource } from '../state/types';
import { createDefaultSource, createDefaultEffect, createDefaultModulator } from '../state/moduleFactory';
import { exportProject, importProject } from '../utils/projectPersistence';
import {
  ALL_MODULES,
  CATEGORIES,
  CATEGORY_COLORS,
  CategoryType,
  CategoryBankConfig,
  BankConfig,
  ModuleEntry,
  loadBankConfig,
  saveBankConfig
} from './ModuleCatalog/moduleRegistry';
import { MasterCatalogModal } from './ModuleCatalog/MasterCatalogModal';
import './Sidebar.css';

// ─── Context Menu ─────────────────────────────────────────────────────────────

type ContextMenuState = {
  x: number;
  y: number;
  moduleId: string;
  category: CategoryType;
} | null;

function ContextMenu({
  menu,
  onRemove,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  onClose
}: {
  menu: ContextMenuState;
  onRemove: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!menu) return null;
  return (
    <div
      className="bank-context-menu"
      style={{ top: menu.y, left: menu.x }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="bank-context-menu-item danger" onClick={onRemove}>
        ✕ Remove from Bank
      </div>
      {canMoveLeft && (
        <div className="bank-context-menu-item" onClick={onMoveLeft}>
          ← Move Left
        </div>
      )}
      {canMoveRight && (
        <div className="bank-context-menu-item" onClick={onMoveRight}>
          → Move Right
        </div>
      )}
    </div>
  );
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function SbSection({ title, children, className = '' }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`sb-section ${className}`}>
      <div
        className={`sb-section-header ${open ? '' : 'collapsed'}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        <span className="chevron">▼</span>
      </div>
      {open && <div className="sb-section-body">{children}</div>}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
const getLayerContextualName = (layer: any) => {
  if (!layer.source || layer.source.type === 'None') return layer.name;
  const type = layer.source.type;
  if (type === 'VideoFile' || type === 'ImageFile' || type === 'AudioFile') {
    const fn = (layer.source as any).fileName;
    return fn && fn !== "No file selected" ? fn : layer.name;
  }
  if (type === 'VideoURL') return (layer.source as any).videoUrl?.split('/').pop() || 'Video URL';
  if (type === 'ShapeGenerator') return `Shape: ${(layer.source as any).shapeType}`;
  return type;
};

interface SidebarProps {
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onOpenMidiModal?: () => void;
}

export function Sidebar({ activeLayerId, onSelectLayer, onOpenMidiModal }: SidebarProps) {
  const layers = useEngineStore(s => s.layers);
  const layerOrder = useEngineStore(s => s.layerOrder);
  const resolution = useEngineStore(s => s.resolution);
  const setResolution = useEngineStore(s => s.setResolution);
  const addLayer = useEngineStore(s => s.addLayer);
  const removeLayer = useEngineStore(s => s.removeLayer);
  const reorderLayer = useEngineStore(s => s.reorderLayer);
  const updateLayer = useEngineStore(s => s.updateLayer);
  const addEffect = useEngineStore(s => s.addEffect);
  const addModulator = useEngineStore(s => s.addModulator);
  const globalAudioMuted = useEngineStore(s => s.globalAudioMuted);
  const setGlobalAudioMuted = useEngineStore(s => s.setGlobalAudioMuted);
  const interLayerEdges = useEngineStore(s => s.interLayerEdges);
  const addInterLayerEdge = useEngineStore(s => s.addInterLayerEdge);
  const removeInterLayerEdge = useEngineStore(s => s.removeInterLayerEdge);
  const isGlobalPaused = useEngineStore(s => s.isGlobalPaused);
  const setIsGlobalPaused = useEngineStore(s => s.setIsGlobalPaused);
  const triggerGlobalReset = useEngineStore(s => s.triggerGlobalReset);
  const midiOverlayActive = useEngineStore(s => s.midiOverlayActive);
  const setMidiOverlayActive = useEngineStore(s => s.setMidiOverlayActive);

  const [ghostSidebarJack, setGhostSidebarJack] = useState<{    layerId: string;
    effectId: string;
    portIdx: number;
    type: 'in' | 'out';
    startX: number;
    startY: number;
  } | null>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const jackCoords = useRef<Record<string, { x: number, y: number }>>({});
  const dragSrcIndex = useRef<number | null>(null);

  useEffect(() => {
    const updateJackCoords = () => {
      const newCoords: Record<string, { x: number, y: number }> = {};
      document.querySelectorAll('.sidebar-jack').forEach(el => {
        const rect = el.getBoundingClientRect();
        const id = el.getAttribute('data-jack-id');
        if (id) {
          newCoords[id] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      });
      jackCoords.current = newCoords;
    };
    updateJackCoords();
    window.addEventListener('resize', updateJackCoords);
    const observer = new MutationObserver(updateJackCoords);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('resize', updateJackCoords);
      observer.disconnect();
    };
  }, [layers, layerOrder, interLayerEdges]);

  useEffect(() => {
    if (!ghostSidebarJack) return;
    const handleMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    const handleUp = () => setGhostSidebarJack(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [ghostSidebarJack]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempName, setTempName] = useState("");

  // Module bank configuration (persisted to localStorage)
  const [bankConfig, setBankConfig] = useState<BankConfig>(loadBankConfig);
  const [isCatalogOpen, setCatalogOpen] = useState(false);
  const [catalogInitialCategory, setCatalogInitialCategory] = useState<CategoryType | 'All'>('All');

  // Keep bank in sync with project imports or cross-tab updates
  useEffect(() => {
    const handleSync = () => setBankConfig(loadBankConfig());
    window.addEventListener('terp_bank_config_updated', handleSync);
    return () => window.removeEventListener('terp_bank_config_updated', handleSync);
  }, []);

  const updateCategoryBank = (cat: CategoryType, updater: (prev: CategoryBankConfig) => CategoryBankConfig) => {
    setBankConfig(prev => {
      const current = prev[cat] || { order: [], sort: 'custom', collapsed: false };
      const updated = {
        ...prev,
        [cat]: updater(current)
      };
      saveBankConfig(updated);
      return updated;
    });
  };

  const toggleCategoryCollapse = (cat: CategoryType) => {
    updateCategoryBank(cat, prev => ({ ...prev, collapsed: !prev.collapsed }));
  };

  const toggleSortMode = (cat: CategoryType, e: React.MouseEvent) => {
    e.stopPropagation();
    updateCategoryBank(cat, prev => ({
      ...prev,
      sort: prev.sort === 'custom' ? 'az' : 'custom'
    }));
  };

  const removeModuleFromBank = (cat: CategoryType, modId: string) => {
    updateCategoryBank(cat, prev => ({
      ...prev,
      order: prev.order.filter(id => id !== modId)
    }));
  };

  const moveModuleInBank = (cat: CategoryType, modId: string, direction: -1 | 1) => {
    updateCategoryBank(cat, prev => {
      const idx = prev.order.indexOf(modId);
      if (idx === -1) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.order.length) return prev;
      const newOrder = [...prev.order];
      const temp = newOrder[idx];
      newOrder[idx] = newOrder[targetIdx];
      newOrder[targetIdx] = temp;
      return { ...prev, order: newOrder };
    });
  };

  const reorderModuleInBank = (cat: CategoryType, draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    updateCategoryBank(cat, prev => {
      const fromIdx = prev.order.indexOf(draggedId);
      const toIdx = prev.order.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const newOrder = [...prev.order];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedId);
      return { ...prev, order: newOrder, sort: 'custom' };
    });
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const [activeDragIdx, setActiveDragIdx] = useState<number | null>(null);

  const handleLayerPointerDown = (e: React.PointerEvent, index: number) => {
    // Only start drag if clicking the handle
    const target = e.target as HTMLElement;
    if (!target.closest('.drag-handle')) return;

    e.preventDefault();
    setActiveDragIdx(index);
    dragSrcIndex.current = index;

    const onMove = (me: PointerEvent) => {
      // Find which layer row we are over
      const row = (me.target as HTMLElement).closest('.layer-row');
      if (row && dragSrcIndex.current !== null) {
        const overId = row.getAttribute('data-layer-id');
        const overIdx = layerOrder.indexOf(overId || '');
        
        if (overIdx !== -1 && overIdx !== dragSrcIndex.current) {
          // Threshold check: Only swap if we've moved past the midpoint of the target row
          const rect = row.getBoundingClientRect();
          const midpoint = rect.top + rect.height / 2;
          const isMovingDown = overIdx > dragSrcIndex.current;
          
          if ((isMovingDown && me.clientY > midpoint) || (!isMovingDown && me.clientY < midpoint)) {
            reorderLayer(dragSrcIndex.current, overIdx);
            dragSrcIndex.current = overIdx;
            setActiveDragIdx(overIdx);
          }
        }
      }
    };

    const onUp = () => {
      setActiveDragIdx(null);
      dragSrcIndex.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Layer add / remove ───────────────────────────────────────────────────

  const handleAddLayer = () => {
    if (Object.keys(layers).length >= 4) return;
    const newId = `layer_${Date.now()}`;
    addLayer({
      id: newId,
      name: `Layer ${layerOrder.length + 1}`,
      source: { type: 'None' } as any,
      effects: [],
      modulators: {},
      opacity: 1.0,
      blendMode: 'normal',
    });
    onSelectLayer(newId);
  };

  const handleRemoveLayer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const layer = layers[id];
    if (layer?.source.type === 'VideoFile' && (layer.source as VideoFileSource).fileUrl) {
      URL.revokeObjectURL((layer.source as VideoFileSource).fileUrl);
    }
    if (layer?.source.type === 'ImageFile' && (layer.source as ImageFileSource).fileUrl) {
      URL.revokeObjectURL((layer.source as ImageFileSource).fileUrl);
    }
    removeLayer(id);
  };

  // ── Module bank drag ─────────────────────────────────────────────────────

  const handleModuleDragStart = (e: React.DragEvent, mod: ModuleEntry) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/terp-module', mod.moduleType);
    e.dataTransfer.setData('text/plain', mod.moduleType);
  };

  const handleModuleRightClick = (e: React.MouseEvent, mod: ModuleEntry) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, moduleId: mod.id, category: mod.category });
  };

  const handleAddModuleToLayer = (mod: ModuleEntry) => {
    if (!activeLayerId) return;
    const [category, type] = mod.moduleType.split(':');
    const newId = `${type.toLowerCase()}_${Date.now()}`;
    
    if (category === 'source') {
      const activeLayer = layers[activeLayerId];
      if (!activeLayer || !activeLayer.source || activeLayer.source.type === 'None') {
        const newSource = createDefaultSource(type);
        useEngineStore.getState().setSource(activeLayerId, newSource);
      } else {
        const newEffect = createDefaultEffect(type as any, newId);
        addEffect(activeLayerId, newEffect);
      }
    } else if (category === 'effect') {
      const newEffect = createDefaultEffect(type, newId);
      addEffect(activeLayerId, newEffect);
    } else if (category === 'modulator') {
      const newMod = createDefaultModulator(type);
      addModulator(activeLayerId, newId, newMod);
    }
  };

  const layerCount = Object.keys(layers).length;

  const projectName = useEngineStore(s => s.projectName);
  const authorName = useEngineStore(s => s.authorName);
  const setProjectName = useEngineStore(s => s.setProjectName);
  const setAuthorName = useEngineStore(s => s.setAuthorName);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        await importProject(json);
      } catch (err) {
        alert("Failed to load project: " + err);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset for next time
  };

  return (
    <div className="sidebar">
      {/* ── Section 0: Project ── */}
      <SbSection title="Project">
        <div className="sb-resolution-row">
          <label>Name</label>
          <input 
            type="text" 
            value={projectName} 
            onChange={e => setProjectName(e.target.value)}
            style={{ flex: 1, background: '#222', color: '#fff', border: '1px solid #444', fontSize: 11, padding: '2px 4px' }}
          />
        </div>
        <div className="sb-resolution-row">
          <label>Author</label>
          <input 
            type="text" 
            value={authorName} 
            onChange={e => setAuthorName(e.target.value)}
            style={{ flex: 1, background: '#222', color: '#fff', border: '1px solid #444', fontSize: 11, padding: '2px 4px' }}
          />
        </div>
        <div className="sb-resolution-row" style={{ marginTop: 8 }}>
          <button 
            onClick={() => exportProject()}
            style={{ flex: 1, background: '#1a3a5f', color: '#4a9eff', border: '1px solid currentColor', borderRadius: 3, cursor: 'pointer', fontSize: 10, padding: '4px 0' }}
          >
            💾 SAVE PROJECT (.terp)
          </button>
        </div>
        <div className="sb-resolution-row">
          <button 
            onClick={() => fileInputRef.current?.click()}
            style={{ flex: 1, background: '#222', color: '#ccc', border: '1px solid #444', borderRadius: 3, cursor: 'pointer', fontSize: 10, padding: '4px 0' }}
          >
            📂 OPEN PROJECT
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept=".terp,application/json"
            onChange={handleImport}
          />
        </div>
        <div className="sb-resolution-row" style={{ marginTop: 4, display: 'flex', gap: 4 }}>
          <button 
            onClick={onOpenMidiModal}
            style={{ flex: 1, background: '#1f1a3a', color: '#9e4aff', border: '1px solid currentColor', borderRadius: 3, cursor: 'pointer', fontSize: 10, padding: '4px 0', fontFamily: 'inherit', fontWeight: 'bold' }}
          >
            🎹 MIDI CONFIG
          </button>
          <button 
            onClick={() => setMidiOverlayActive(!midiOverlayActive)}
            title="Toggle MIDI Learn icons overlay on faders"
            style={{ 
              flex: 1, 
              background: midiOverlayActive ? '#9e4aff' : '#222', 
              color: midiOverlayActive ? '#fff' : '#888', 
              border: midiOverlayActive ? '1px solid #c8a2ff' : '1px solid #444', 
              borderRadius: 3, 
              cursor: 'pointer', 
              fontSize: 10, 
              padding: '4px 0', 
              fontFamily: 'inherit', 
              fontWeight: 'bold',
              boxShadow: midiOverlayActive ? '0 0 8px rgba(158, 74, 255, 0.4)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            🔌 OVERLAYS: {midiOverlayActive ? 'ON' : 'OFF'}
          </button>
        </div>
      </SbSection>

      {/* ── Section A: Canvas & Global ── */}
      <SbSection title="Canvas">
        <div className="sb-resolution-row">
          <label>Resolution</label>
          <select
            value={`${resolution.width}x${resolution.height}`}
            onChange={e => {
              const [w, h] = e.target.value.split('x').map(Number);
              setResolution(w, h);
            }}
          >
            <optgroup label="HD (16:9)">
              <option value="1920x1080">1920 × 1080 (1080p)</option>
              <option value="1280x720">1280 × 720 (720p)</option>
            </optgroup>
            <optgroup label="Workstation (16:10)">
              <option value="1920x1200">1920 × 1200 (WUXGA)</option>
              <option value="1280x800">1280 × 800 (WXGA)</option>
            </optgroup>
            <optgroup label="SD (4:3)">
              <option value="1024x768">1024 × 768</option>
              <option value="800x600">800 × 600</option>
              <option value="640x480">640 × 480</option>
            </optgroup>
            <optgroup label="NTSC">
              <option value="720x480">720 × 480</option>
            </optgroup>
          </select>
        </div>
        <div className="sb-resolution-row">
          <label>Global Audio</label>
          <button
            className="sb-global-audio-btn"
            onClick={() => setGlobalAudioMuted(!globalAudioMuted)}
            title={globalAudioMuted ? 'Unmute all audio' : 'Mute all audio'}
            style={{ 
              background: globalAudioMuted ? '#4a1a1a' : '#1a3a5f',
              color: globalAudioMuted ? '#e55' : '#4a9eff',
              border: '1px solid currentColor',
              borderRadius: 3,
              fontSize: 10,
              padding: '2px 8px',
              cursor: 'pointer',
              flex: 1,
              fontFamily: 'inherit'
            }}
          >
            {globalAudioMuted ? '🔇 Muted' : '🔊 Active'}
          </button>
        </div>
        <div className="sb-resolution-row">
          <label>Transport</label>
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            <button
              onClick={() => setIsGlobalPaused(!isGlobalPaused)}
              title={isGlobalPaused ? 'Resume all' : 'Pause all (freeze)'}
              style={{
                flex: 1,
                background: isGlobalPaused ? '#a50' : '#222',
                color: isGlobalPaused ? '#fff' : '#ccc',
                border: '1px solid #444',
                borderRadius: 3,
                fontSize: 10,
                padding: '2px 0',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: isGlobalPaused ? 'bold' : 'normal'
              }}
            >
              {isGlobalPaused ? '▶ RESUME' : '⏸ PAUSE'}
            </button>
            <button
              onClick={() => triggerGlobalReset()}
              title="Reset all LFOs and Media to start"
              style={{
                background: '#222',
                color: '#ccc',
                border: '1px solid #444',
                borderRadius: 3,
                fontSize: 10,
                padding: '2px 8px',
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              ⏮ RESET
            </button>
          </div>
        </div>
      </SbSection>

      {/* ── Section B: Layers ── */}
      <SbSection title="Layers">
        <div className="layer-list">
          {layerOrder.map((id, index) => {
            const layer = layers[id];
            if (!layer) return null;
            const isActive = activeLayerId === id;
            const isDragging = activeDragIdx === index;
            return (
              <div
                key={id}
                data-layer-id={id}
                className={`layer-row ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                onPointerDown={e => handleLayerPointerDown(e, index)}
                onClick={() => onSelectLayer(id)}
              >
                <span className="drag-handle" title="Drag to reorder">⠿</span>
                <span className="layer-z-badge" title={`z = ${index}`}>z{index}</span>
                <div 
                  className="layer-info" 
                  style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(id);
                    setTempName(layer.name);
                  }}
                >
                  {editingId === id ? (
                    <input
                      autoFocus
                      className="layer-name-input"
                      value={tempName}
                      onChange={e => setTempName(e.target.value)}
                      onBlur={() => {
                        updateLayer(id, { name: tempName });
                        setEditingId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          updateLayer(id, { name: tempName });
                          setEditingId(null);
                        }
                      }}
                      onClick={e => e.stopPropagation()}
                      style={{ 
                        background: '#111', color: '#fff', border: '1px solid #444', 
                        padding: '2px 4px', fontSize: 11, borderRadius: 2, width: '90%' 
                      }}
                    />
                  ) : (
                    <>
                      <span className="layer-name" style={layer.muted ? { color: '#e03030' } : {}}>{layer.name}</span>
                      <span className="layer-context-name" style={{ fontSize: 9, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getLayerContextualName(layer)}
                      </span>
                    </>
                  )}
                </div>
                <button
                  className="layer-mute-btn"
                  title={layer.muted ? 'Unmute layer' : 'Mute layer'}
                  onClick={e => {
                    e.stopPropagation();
                    updateLayer(id, { muted: !layer.muted });
                  }}
                  style={layer.muted ? { color: '#e03030' } : {}}
                >
                  {layer.muted ? '◉' : '◎'}
                </button>
                
                {/* Inter-Layer Patchbay */}
                <div className="layer-patchbay">
                  {(() => {
                    const outModule = layer.effects.find(e => e.type === 'InterLayerOutput');
                    const inModule = layer.effects.find(e => e.type === 'InterLayerInput');
                    const outPorts = outModule ? (outModule as any).portCount || 1 : 0;
                    const inPorts = inModule ? (inModule as any).portCount || 1 : 0;
                    
                    return (
                      <>
                        {/* Outputs (Sources) */}
                        {Array.from({ length: outPorts }).map((_, i) => {
                          const isConnected = interLayerEdges.some(e => e.fromLayerId === id && e.fromPortIdx === i);
                          const jackId = `out|${id}|${i}`;
                          return (
                            <div 
                              key={`out-${i}`}
                              data-jack-id={jackId}
                              className={`sidebar-jack output ${isConnected ? 'connected' : ''}`}
                              title={`Inter-Layer Output ${i + 1}`}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setGhostSidebarJack({ 
                                  layerId: id, 
                                  effectId: outModule!.id, 
                                  portIdx: i, 
                                  type: 'out',
                                  startX: rect.left + rect.width / 2,
                                  startY: rect.top + rect.height / 2
                                });
                                setMousePos({ x: e.clientX, y: e.clientY });
                              }}
                            />
                          );
                        })}
                        {/* Inputs (Destinations) */}
                        {Array.from({ length: inPorts }).map((_, i) => {
                          const edge = interLayerEdges.find(e => e.toLayerId === id && e.toPortIdx === i);
                          const jackId = `in|${id}|${i}`;
                          return (
                            <div 
                              key={`in-${i}`}
                              data-jack-id={jackId}
                              className={`sidebar-jack input ${edge ? 'connected' : ''}`}
                              title={edge ? `Connected to ${layers[edge.fromLayerId]?.name} Out ${edge.fromPortIdx + 1}` : `Inter-Layer Input ${i + 1}`}
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                if (e.altKey && edge) {
                                  removeInterLayerEdge(edge.id);
                                }
                              }}
                              onPointerUp={(e) => {
                                e.stopPropagation();
                                if (ghostSidebarJack && ghostSidebarJack.type === 'out' && ghostSidebarJack.layerId !== id) {
                                  const newEdge = {
                                    id: `ile_${Date.now()}`,
                                    fromLayerId: ghostSidebarJack.layerId,
                                    fromEffectId: ghostSidebarJack.effectId,
                                    fromPortIdx: ghostSidebarJack.portIdx,
                                    toLayerId: id,
                                    toEffectId: inModule!.id,
                                    toPortIdx: i
                                  };
                                  addInterLayerEdge(newEdge);
                                }
                                setGhostSidebarJack(null);
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                if (edge) removeInterLayerEdge(edge.id);
                              }}
                            />
                          );
                        })}
                      </>
                    );
                  })()}
                </div>

                <button
                  className="layer-audio-mute-btn"
                  title={layer.audioMuted ? 'Unmute audio' : 'Mute audio'}
                  onClick={e => {
                    e.stopPropagation();
                    updateLayer(id, { audioMuted: !layer.audioMuted });
                  }}
                  style={layer.audioMuted ? { color: '#e03030' } : { color: '#4a9eff' }}
                >
                  {layer.audioMuted ? '🔇' : '🔊'}
                </button>
                <button
                  className="layer-remove-btn"
                  onClick={e => handleRemoveLayer(id, e)}
                  title="Remove layer"
                >✕</button>
              </div>
            );
          })}
        </div>

        <button
          className="sb-add-layer-btn"
          onClick={handleAddLayer}
          disabled={layerCount >= 4}
        >
          + Add Layer
        </button>
        <div className="sb-layer-count">{layerCount} / 4 layers</div>
      </SbSection>

      {/* ── Section C: Module Bank ── */}
      <SbSection title="Module Bank" className="bank">
        <div className="bank-master-browse-bar">
          <button
            className="bank-browse-catalog-btn"
            onClick={() => {
              setCatalogInitialCategory('All');
              setCatalogOpen(true);
            }}
          >
            <span>📚</span>
            <span>Browse All Modules ({ALL_MODULES.length})</span>
          </button>
        </div>

        {CATEGORIES.map(cat => {
          const config = bankConfig[cat] || { order: [], sort: 'custom', collapsed: false };
          const moduleMap = new Map(ALL_MODULES.map(m => [m.id, m]));
          const pinnedMods = config.order
            .map(id => moduleMap.get(id))
            .filter((m): m is ModuleEntry => !!m);

          const displayMods = config.sort === 'az'
            ? [...pinnedMods].sort((a, b) => a.label.localeCompare(b.label))
            : pinnedMods;

          const isCollapsed = !!config.collapsed;
          const catColor = CATEGORY_COLORS[cat];

          return (
            <div className="bank-category" key={cat}>
              <div className="bank-cat-header" onClick={() => toggleCategoryCollapse(cat)}>
                <div className="bank-cat-header-left">
                  <span className="bank-cat-chevron">{isCollapsed ? '▶' : '▼'}</span>
                  <span className="bank-cat-title" style={{ color: catColor }}>{cat}</span>
                  <span className="bank-cat-count">({displayMods.length})</span>
                </div>
                <div className="bank-cat-header-tools" onClick={e => e.stopPropagation()}>
                  <button
                    className={`bank-sort-btn ${config.sort === 'az' ? 'active-az' : ''}`}
                    onClick={e => toggleSortMode(cat, e)}
                    title={config.sort === 'custom' ? 'Custom Order (Click for A-Z)' : 'Alphabetical (Click for Custom)'}
                  >
                    {config.sort === 'custom' ? '⇄' : 'AZ'}
                  </button>
                  <button
                    className="bank-add-btn"
                    onClick={e => {
                      e.stopPropagation();
                      setCatalogInitialCategory(cat);
                      setCatalogOpen(true);
                    }}
                    title={`Add more ${cat} to Bank`}
                  >
                    +
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="bank-icon-grid">
                  {displayMods.length === 0 ? (
                    <div className="bank-empty-notice">
                      No modules in bank. Click <b>+</b> to add.
                    </div>
                  ) : (
                    displayMods.map(mod => (
                      <div
                        key={mod.id}
                        className="bank-icon"
                        draggable
                        onDragStart={e => {
                          handleModuleDragStart(e, mod);
                          e.dataTransfer.setData('application/terp-bank-reorder', JSON.stringify({ cat, id: mod.id }));
                        }}
                        onDragOver={e => {
                          if (config.sort === 'custom') {
                            e.preventDefault();
                          }
                        }}
                        onDrop={e => {
                          const raw = e.dataTransfer.getData('application/terp-bank-reorder');
                          if (raw) {
                            try {
                              const data = JSON.parse(raw);
                              if (data.cat === cat && data.id !== mod.id) {
                                reorderModuleInBank(cat, data.id, mod.id);
                              }
                            } catch {}
                          }
                        }}
                        onClick={() => handleAddModuleToLayer(mod)}
                        onContextMenu={e => handleModuleRightClick(e, mod)}
                        title={mod.tooltip}
                      >
                        {mod.glyph === 'RGB_STRIPES' ? (
                          <div className="icon-glyph rgb-stripes-icon">
                            <div className="stripe red" />
                            <div className="stripe green" />
                            <div className="stripe blue" />
                          </div>
                        ) : (
                          <span className="icon-glyph">{mod.glyph}</span>
                        )}
                        <span className="icon-label">{mod.label}</span>
                        <span className="icon-tooltip">{mod.tooltip}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </SbSection>

      {/* Context Menu */}
      {(() => {
        const currentCatOrder = contextMenu ? bankConfig[contextMenu.category]?.order || [] : [];
        const currentModIdx = contextMenu ? currentCatOrder.indexOf(contextMenu.moduleId) : -1;
        const isCustomSort = contextMenu ? bankConfig[contextMenu.category]?.sort === 'custom' : false;
        const canMoveLeft = isCustomSort && currentModIdx > 0;
        const canMoveRight = isCustomSort && currentModIdx !== -1 && currentModIdx < currentCatOrder.length - 1;

        return (
          <ContextMenu
            menu={contextMenu}
            onRemove={() => {
              if (contextMenu) removeModuleFromBank(contextMenu.category, contextMenu.moduleId);
              setContextMenu(null);
            }}
            onMoveLeft={() => {
              if (contextMenu) moveModuleInBank(contextMenu.category, contextMenu.moduleId, -1);
              setContextMenu(null);
            }}
            onMoveRight={() => {
              if (contextMenu) moveModuleInBank(contextMenu.category, contextMenu.moduleId, 1);
              setContextMenu(null);
            }}
            canMoveLeft={canMoveLeft}
            canMoveRight={canMoveRight}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}

      {/* Master Module Catalog Modal */}
      <MasterCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setCatalogOpen(false)}
        bankConfig={bankConfig}
        onUpdateBankConfig={setBankConfig}
        activeLayerId={activeLayerId}
        onAddModuleToLayer={handleAddModuleToLayer}
        initialCategory={catalogInitialCategory}
      />

      {/* Inter-Layer Static Cables */}
      <svg style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9998 }}>
        {interLayerEdges.map(edge => {
          const start = jackCoords.current[`out|${edge.fromLayerId}|${edge.fromPortIdx}`];
          const end = jackCoords.current[`in|${edge.toLayerId}|${edge.toPortIdx}`];
          if (!start || !end) return null;
          return (
            <path
              key={edge.id}
              className="sidebar-patch-ghost"
              style={{ stroke: '#f5c518', opacity: 0.6 }}
              d={`M ${start.x} ${start.y} C ${start.x + 40} ${start.y}, ${end.x - 40} ${end.y}, ${end.x} ${end.y}`}
            />
          );
        })}
      </svg>

      {/* Inter-Layer Ghost Cable */}
      {ghostSidebarJack && (
        <svg style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }}>
          <path 
            className="sidebar-patch-ghost"
            d={`M ${ghostSidebarJack.startX} ${ghostSidebarJack.startY} C ${ghostSidebarJack.startX + 50} ${ghostSidebarJack.startY}, ${mousePos.x - 50} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} 
          />
        </svg>
      )}
    </div>
  );
}
