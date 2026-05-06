import { useState, useRef, useEffect } from 'react';
import { useEngineStore } from '../state/store';
import { VideoFileSource, ImageFileSource, ColorRGBEffect } from '../state/types';
import './Sidebar.css';

// ─── Module Bank Data ─────────────────────────────────────────────────────────

type ModuleEntry = {
  id: string;
  glyph: string;
  label: string;
  tooltip: string;
  category: 'Sources' | 'Effects' | 'Utility';
  moduleType: string; // passed in dataTransfer when dragging to rack
};

const ALL_MODULES: ModuleEntry[] = [
  // Sources
  { id: 'VideoFile',      glyph: '📹', label: 'Vid File',  tooltip: 'Local Video File',       category: 'Sources', moduleType: 'source:VideoFile'      },
  { id: 'VideoURL',       glyph: '🌐', label: 'Vid URL',   tooltip: 'Video from URL',          category: 'Sources', moduleType: 'source:VideoURL'       },
  { id: 'Webcam',         glyph: '📷', label: 'Webcam',    tooltip: 'Webcam Capture',          category: 'Sources', moduleType: 'source:WebcamCapture'  },
  { id: 'ImageFile',      glyph: '🖼️', label: 'Img File',  tooltip: 'Local Image File',        category: 'Sources', moduleType: 'source:ImageFile'      },
  { id: 'ImageURL',       glyph: '🔗', label: 'Img URL',   tooltip: 'Image from URL',          category: 'Sources', moduleType: 'source:ImageLoader'    },
  { id: 'ShapeGen',       glyph: '⬜', label: 'Shape',     tooltip: 'Shape Generator',         category: 'Sources', moduleType: 'source:ShapeGenerator' },
  { id: 'NoiseSource',    glyph: '🌫️', label: 'Noise Gen',  tooltip: '2D Procedural Noise',    category: 'Sources', moduleType: 'source:NoiseSource'    },
  { id: 'AudioInput',     glyph: '🎤', label: 'Audio In',  tooltip: 'Live Audio Input',        category: 'Sources', moduleType: 'source:AudioInput'     },
  { id: 'AudioFile',      glyph: '🎵', label: 'Audio File',tooltip: 'Local Audio File',       category: 'Sources', moduleType: 'source:AudioFile'      },
  { id: 'SystemAudio',    glyph: '🔊', label: 'Sys Audio', tooltip: 'System Audio Capture',    category: 'Sources', moduleType: 'source:SystemAudio'    },
  // Effects
  { id: 'Transform2D',    glyph: '↔️', label: 'Transform', tooltip: 'Transform 2D',            category: 'Effects', moduleType: 'effect:Transform2D'    },
  { id: 'Spawn',          glyph: '✨', label: 'Spawn',     tooltip: 'Triggered Object Emitter', category: 'Utility', moduleType: 'effect:Spawn'          },
  { id: 'ColorAdjust',    glyph: '🎨', label: 'Color',     tooltip: 'Color Adjust',            category: 'Effects', moduleType: 'effect:ColorAdjust'    },
  { id: 'LumaKey',        glyph: '🔑', label: 'LumaKey',   tooltip: 'Luminance Key',           category: 'Effects', moduleType: 'effect:LumaKey'        },
  { id: 'ColorRGB',       glyph: 'RGB_STRIPES', label: 'RGB',        tooltip: 'RGB Channel Split/Gen',   category: 'Effects', moduleType: 'effect:ColorRGB'       },
  { id: 'SimpleFeedback', glyph: '🔄', label: 'Feedback',  tooltip: 'Simple Feedback Loop',    category: 'Effects', moduleType: 'effect:SimpleFeedback' },
  { id: 'LumaSplit',      glyph: '▤', label: 'LumaSplit', tooltip: 'Split by luminance bands', category: 'Utility', moduleType: 'effect:LumaSplitter'   },
  { id: 'RGBMixer',      glyph: '▥', label: 'RGB Mixer', tooltip: 'Sum RGB channels to composite', category: 'Utility', moduleType: 'effect:RGBMixer'      },
  // Utility
  { id: 'LFO',            glyph: '〜', label: 'LFO',       tooltip: 'Modular LFO Source',      category: 'Utility', moduleType: 'modulator:LFO'         },
  { id: 'TriggerPad',     glyph: '🔘', label: 'Trig Pad',  tooltip: 'Click-to-trigger Pulse',  category: 'Utility', moduleType: 'modulator:TriggerPad'  },
  { id: 'LayerOut',       glyph: '⎆', label: 'Layer Out', tooltip: 'Send signal to other layer', category: 'Utility', moduleType: 'effect:InterLayerOutput' },
  { id: 'LayerIn',        glyph: '⎆', label: 'Layer In',  tooltip: 'Receive signal from other layer', category: 'Utility', moduleType: 'effect:InterLayerInput' },
  { id: 'Path',           glyph: '🛤️', label: 'Path',      tooltip: 'Trajectory Generator',    category: 'Utility', moduleType: 'effect:Path'           },
  { id: 'Noise',          glyph: '🎲', label: 'Noise',     tooltip: 'Stochastic Signal Gen',   category: 'Utility', moduleType: 'modulator:Noise'        },
];

const DEFAULT_BANK_IDS = ALL_MODULES.map(m => m.id);
const BANK_STORAGE_KEY = 'terp_bank_ids';

// ─── Context Menu ─────────────────────────────────────────────────────────────

type ContextMenuState = { x: number; y: number; moduleId: string } | null;

function ContextMenu({ menu, inBank, onRemove, onAdd, onClose }: {
  menu: ContextMenuState;
  inBank: boolean;
  onRemove: () => void;
  onAdd: () => void;
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
      {inBank ? (
        <div className="bank-context-menu-item danger" onClick={onRemove}>
          Remove from Bank
        </div>
      ) : (
        <div className="bank-context-menu-item" onClick={onAdd}>
          Add to Bank
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
}

export function Sidebar({ activeLayerId, onSelectLayer }: SidebarProps) {
  const {
    layers, layerOrder, resolution, setResolution,
    addLayer, removeLayer, reorderLayer, updateLayer,
    globalAudioMuted, setGlobalAudioMuted,
    interLayerEdges, addInterLayerEdge, removeInterLayerEdge
  } = useEngineStore();

  const [ghostSidebarJack, setGhostSidebarJack] = useState<{
    layerId: string;
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

  // Module bank visible IDs (persisted to localStorage)
  const [bankIds, setBankIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(BANK_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_BANK_IDS;
  });

  const saveBankIds = (ids: string[]) => {
    setBankIds(ids);
    localStorage.setItem(BANK_STORAGE_KEY, JSON.stringify(ids));
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

  // ── Context menu ─────────────────────────────────────────────────────────

  const handleModuleRightClick = (e: React.MouseEvent, modId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, moduleId: modId });
  };

  const visibleModules = ALL_MODULES.filter(m => bankIds.includes(m.id));
  const hiddenModules  = ALL_MODULES.filter(m => !bankIds.includes(m.id));
  const CATEGORIES: Array<'Sources' | 'Effects' | 'Utility'> = ['Sources', 'Effects', 'Utility'];

  const layerCount = Object.keys(layers).length;

  return (
    <div className="sidebar">
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
                                  addInterLayerEdge({
                                    id: `ile_${Date.now()}`,
                                    fromLayerId: ghostSidebarJack.layerId,
                                    fromEffectId: ghostSidebarJack.effectId,
                                    fromPortIdx: ghostSidebarJack.portIdx,
                                    toLayerId: id,
                                    toEffectId: inModule!.id,
                                    toPortIdx: i
                                  });
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
        {CATEGORIES.map(cat => {
          const mods = visibleModules.filter(m => m.category === cat);
          if (mods.length === 0) return null;
          return (
            <div className="bank-category" key={cat}>
              <div className="bank-category-divider">
                <span className="bank-category-label">{cat}</span>
                <div className="bank-category-line" />
              </div>
              <div className="bank-icon-grid">
                {mods.map(mod => (
                  <div
                    key={mod.id}
                    className="bank-icon"
                    draggable
                    onDragStart={e => handleModuleDragStart(e, mod)}
                    onContextMenu={e => handleModuleRightClick(e, mod.id)}
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
                ))}

                {/* Hidden modules shown faded with right-click to add back */}
                {hiddenModules.filter(m => m.category === cat).map(mod => (
                  <div
                    key={mod.id}
                    className="bank-icon"
                    style={{ opacity: 0.2, cursor: 'default' }}
                    onContextMenu={e => handleModuleRightClick(e, mod.id)}
                    title={`${mod.tooltip} (hidden — right-click to restore)`}
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
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </SbSection>

      {/* Context Menu (portal-ish via fixed positioning) */}
      <ContextMenu
        menu={contextMenu}
        inBank={contextMenu ? bankIds.includes(contextMenu.moduleId) : false}
        onRemove={() => {
          if (contextMenu) saveBankIds(bankIds.filter(id => id !== contextMenu.moduleId));
          setContextMenu(null);
        }}
        onAdd={() => {
          if (contextMenu) saveBankIds([...bankIds, contextMenu.moduleId]);
          setContextMenu(null);
        }}
        onClose={() => setContextMenu(null)}
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
