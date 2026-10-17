import { useState, useEffect, useRef } from 'react';
import { useEngineStore } from '../../state/store';
import { MidiManager } from '../../state/MidiManager';
import './MidiMappingModal.css';

interface MidiMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface MidiLogEntry {
  id: string;
  timestamp: string;
  text: string;
}

// ── static schema of manually-controlled parameters per module ────────────────
const MODULE_PARAMS: Record<string, string[]> = {
  // Sources
  ShapeGenerator: ['sides', 'roundness', 'convexity', 'x', 'y', 'scale', 'rotation', 'strokeWidth', 'edgeSoftness'],
  VideoURL: ['playbackSpeed', 'volume', 'loop'],
  VideoFile: ['playbackSpeed', 'volume', 'loop'],
  WebcamCapture: ['objectFit'],
  NoiseSource: ['speed', 'scale', 'brightness', 'contrast'],
  ColorNoise: ['speed', 'scale', 'octaves', 'persistence', 'brightness', 'contrast', 'seed'],
  AudioInput: ['volume'],
  AudioFile: ['playbackSpeed', 'volume', 'loop'],
  ImageLoader: ['objectFit'],
  ImageFile: ['objectFit'],
  
  // Effects / Utilities / Modulators
  LFO: ['frequency', 'amplitude', 'offset', 'bipolar'],
  Noise: ['frequency', 'amplitude', 'offset', 'bipolar'],
  AudioSource: ['gain'],
  SpectralSplitter: ['gain'],
  AudioTransformer: ['frequency', 'q', 'gain', 'threshold', 'ratio', 'attack', 'release'],
  AudioModulator: ['wet', 'rate'],
  AudioGate: ['threshold', 'attack', 'release', 'hold'],
  SpeechEnvelopeTracker: ['threshold', 'attack', 'release'],
  VowelFormantTracker: ['formantGain', 'yScale'],
  Transform2D: ['translateX', 'translateY', 'scaleX', 'scaleY', 'rotation', 'spin'],
  ColorAdjust: ['hue', 'saturation', 'brightness', 'contrast', 'invert'],
  LumaKey: ['threshold', 'tolerance', 'invertKey'],
  SimpleFeedback: ['feedbackAmount', 'zoom', 'angle'],
  InterLayerOutput: ['portCount'],
  InterLayerInput: ['portCount'],
  ColorRGB: ['r', 'g', 'b'],
  LumaSplitter: ['threshold1', 'threshold2', 'softness'],
  VideoMixer: ['v1', 'v1Alpha', 'v2', 'v2Alpha', 'v3', 'v3Alpha', 'v4', 'v4Alpha', 'masterGain', 'crossfader']
};

export function MidiMappingModal({ isOpen, onClose }: MidiMappingModalProps) {
  const [activeTab, setActiveTab] = useState<'log' | 'mappings' | 'learn'>('log');
  const [midiLogs, setMidiLogs] = useState<MidiLogEntry[]>([]);
  const [connectedInputs, setConnectedInputs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Store bindings and states
  const layers = useEngineStore(s => s.layers);
  const midiBindings = useEngineStore(s => s.midiBindings) || [];
  const midiLearnTarget = useEngineStore(s => s.midiLearnTarget);
  const setMidiLearnTarget = useEngineStore(s => s.setMidiLearnTarget);
  const updateMidiBinding = useEngineStore(s => s.updateMidiBinding);
  const removeMidiBinding = useEngineStore(s => s.removeMidiBinding);
  
  // Overlay Mode Sync
  const setMidiOverlayActive = useEngineStore(s => s.setMidiOverlayActive);

  // Browse & Assign state variables
  const [selectedLayerId, setSelectedLayerId] = useState<string>('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [selectedParamId, setSelectedParamId] = useState<string>('');

  // Manual input settings states
  const [isManualEntryActive, setIsManualEntryActive] = useState<boolean>(false);
  const [manualChannel, setManualChannel] = useState<number | 'all'>('all');
  const [manualInputType, setManualInputType] = useState<'cc' | 'note'>('cc');
  const [manualIndex, setManualIndex] = useState<number>(0);

  // 1. Auto-activate Overlays Overlay when modal opens, deactivate on close
  useEffect(() => {
    if (isOpen) {
      setMidiOverlayActive(true);
    }
    return () => {
      setMidiOverlayActive(false);
    };
  }, [isOpen, setMidiOverlayActive]);

  // 2. Retrieve available inputs on load/state change
  useEffect(() => {
    if (!isOpen) return;

    const detectDevices = () => {
      if (typeof navigator !== 'undefined' && navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess().then(access => {
          const names = Array.from(access.inputs.values()).map((input: any) => input.name || 'Unknown Controller');
          setConnectedInputs(names);
        }).catch(() => {
          setConnectedInputs([]);
        });
      }
    };

    detectDevices();

    if (typeof navigator !== 'undefined' && navigator.requestMIDIAccess) {
      let midiAccessInstance: any = null;
      navigator.requestMIDIAccess().then(access => {
        midiAccessInstance = access;
        access.onstatechange = detectDevices;
      });
      return () => {
        if (midiAccessInstance) {
          midiAccessInstance.onstatechange = null;
        }
      };
    }
  }, [isOpen]);

  // 3. Hook into raw MIDI message callbacks to populate real-time Device Log tab
  useEffect(() => {
    if (!isOpen) return;

    const mgr = MidiManager.getInstance();

    const handleIncomingMessage = (data: Uint8Array) => {
      if (!data || data.length === 0) return;
      const status = data[0];
      const command = status & 0xf0;
      const channel = (status & 0x0f) + 1;
      const data1 = data[1] ?? 0;
      const data2 = data.length > 2 ? data[2] : 0;

      // Ignore timing clocks (0xf8) to avoid clogging logs
      if (status === 0xf8) return;

      let logText = '';
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

      if (command === 0xb0) { // CC
        logText = `[Ch ${channel}] CC #${data1} | Value: ${Math.round((data2 / 127) * 100)}% (${data2})`;
      } else if (command === 0x90 && data2 > 0) { // Note On
        logText = `[Ch ${channel}] Note On #${data1} | Velocity: ${Math.round((data2 / 127) * 100)}% (${data2})`;
      } else if (command === 0x80 || (command === 0x90 && data2 === 0)) { // Note Off
        logText = `[Ch ${channel}] Note Off #${data1}`;
      } else {
        logText = `[Ch ${channel}] Cmd 0x${command.toString(16)} | Data1: ${data1} | Data2: ${data2}`;
      }

      setMidiLogs(prev => {
        const next = [...prev, { id: `${Date.now()}_${Math.random()}`, timestamp: timeStr, text: logText }];
        return next.slice(-100); // cap at 100 logs
      });
    };

    mgr.addMessageListener(handleIncomingMessage);
    return () => {
      mgr.removeMessageListener(handleIncomingMessage);
    };
  }, [isOpen]);

  // 4. Synchronize selected selectors dynamically to prevent illegal values
  useEffect(() => {
    const layerIds = Object.keys(layers);
    if (layerIds.length > 0 && !selectedLayerId) {
      setSelectedLayerId(layerIds[0]);
    }
  }, [layers, selectedLayerId]);

  // Dynamic modules computation
  const activeLayer = layers[selectedLayerId];
  const availableModules = activeLayer ? [
    { id: 'source', type: activeLayer.source.type, label: `${activeLayer.source.type} (Source)` },
    ...activeLayer.effects.map(e => ({ id: e.id || '', type: e.type, label: `${e.type} (${(e.id || '').slice(-4)})` })),
    ...Object.entries(activeLayer.modulators || {}).map(([id, m]) => ({ id, type: m.type, label: `${m.type} (Modulator)` }))
  ] : [];

  useEffect(() => {
    if (availableModules.length > 0) {
      if (!availableModules.some(m => m.id === selectedModuleId)) {
        setSelectedModuleId(availableModules[0].id || '');
      }
    } else {
      setSelectedModuleId('');
    }
  }, [selectedLayerId, layers]);

  // Dynamic parameters computation
  const selectedModuleObj = availableModules.find(m => m.id === selectedModuleId);
  const selectedModuleType = selectedModuleObj ? selectedModuleObj.type : '';
  const availableParams = selectedModuleType ? (MODULE_PARAMS[selectedModuleType] || []) : [];

  useEffect(() => {
    if (availableParams.length > 0) {
      if (!availableParams.includes(selectedParamId)) {
        setSelectedParamId(availableParams[0]);
      }
    } else {
      setSelectedParamId('');
    }
  }, [selectedModuleId, selectedLayerId, layers]);

  // Auto-scroll terminal log to bottom
  useEffect(() => {
    if (activeTab === 'log' && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [midiLogs, activeTab]);

  if (!isOpen) return null;

  // Helpers to resolve human-readable target labels
  const getTargetLabels = (binding: any) => {
    const target = binding.target;
    if (!target) return { layer: 'Unknown', module: 'Unknown', param: 'Unknown' };

    const layer = layers[target.layerId];
    const layerName = layer ? layer.name : `Layer (${target.layerId.slice(-4)})`;

    let moduleLabel = 'Unknown Module';
    let paramLabel = target.paramId;

    if (target.type === 'absolute') {
      if (target.moduleId === 'source') {
        moduleLabel = layer ? `${layer.source.type} (Source)` : 'Primary Source';
      } else if (layer) {
        const effect = layer.effects.find((e: any) => e.id === target.moduleId);
        if (effect) {
          moduleLabel = effect.type;
        } else {
          const modulator = layer.modulators?.[target.moduleId];
          if (modulator) {
            moduleLabel = `${modulator.type} (Modulator)`;
          } else {
            moduleLabel = `Module (${target.moduleId.slice(-4)})`;
          }
        }
      }
    } else {
      moduleLabel = `${target.moduleType} [Query idx ${target.index}]`;
    }

    return {
      layer: layerName,
      module: moduleLabel,
      param: paramLabel
    };
  };

  // Actions trigger:
  const handleStartLearnSelected = () => {
    if (!selectedLayerId || !selectedModuleId || !selectedParamId) return;
    setMidiLearnTarget({
      type: 'absolute',
      layerId: selectedLayerId,
      moduleId: selectedModuleId,
      paramId: selectedParamId
    });
  };

  const handleCreateManualBinding = () => {
    if (!selectedLayerId || !selectedModuleId || !selectedParamId) return;

    const targetSpec = {
      type: 'absolute' as const,
      layerId: selectedLayerId,
      moduleId: selectedModuleId,
      paramId: selectedParamId
    };

    const newBinding = {
      id: `midi_bind_${Date.now()}`,
      type: 'parameter' as const,
      target: targetSpec,
      midiSource: {
        channel: manualChannel,
        ...(manualInputType === 'cc' ? { ccNumber: manualIndex } : { noteNumber: manualIndex })
      },
      range: [0, 1] as [number, number],
      invert: false
    };

    // Filter duplicates
    const cleanBindings = midiBindings.filter(b => 
      !(b.target.layerId === selectedLayerId && 
        (b.target as any).moduleId === selectedModuleId && 
        b.target.paramId === selectedParamId)
    );

    useEngineStore.setState({
      midiBindings: [...cleanBindings, newBinding]
    });

    // Go to mappings panel to show changes
    setActiveTab('mappings');
  };

  return (
    <div className="midi-modal-backdrop" onClick={onClose}>
      <div className="midi-modal-panel" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="midi-modal-header">
          <div className="midi-modal-title">
            <span className="piano-icon">🎹</span> MIDI CONFIGURATION
          </div>
          <button className="midi-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Device Status Bar */}
        <div className="midi-device-status-bar">
          <div className="status-label">
            <span className="dot pulse-green"></span>
            CONNECTED CONTROLLERS ({connectedInputs.length}):
          </div>
          <div className="device-names">
            {connectedInputs.length === 0 ? (
              <span className="no-devices">No MIDI controllers detected. Plug-and-play is active.</span>
            ) : (
              connectedInputs.join(', ')
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="midi-modal-tabs">
          <button 
            className={`midi-tab-btn ${activeTab === 'log' ? 'active' : ''}`}
            onClick={() => setActiveTab('log')}
          >
            🔌 DEVICE LOG
          </button>
          <button 
            className={`midi-tab-btn ${activeTab === 'mappings' ? 'active' : ''}`}
            onClick={() => setActiveTab('mappings')}
          >
            🎹 ACTIVE MAPPINGS ({midiBindings.length})
          </button>
          <button 
            className={`midi-tab-btn ${activeTab === 'learn' ? 'active animate-pulse-glow' : ''}`}
            onClick={() => setActiveTab('learn')}
          >
            🔴 INTERACTIVE LEARN {midiLearnTarget ? '• ACTIVE' : ''}
          </button>
        </div>

        {/* Content Box */}
        <div className="midi-modal-content">
          {/* TAB 1: DEVICE LOG TERMINAL */}
          {activeTab === 'log' && (
            <div className="terminal-panel">
              <div className="terminal-header">
                <span>VJ_ENGINE_MIDI_LOGGER // STREAMING_LIVE</span>
                <button className="clear-btn" onClick={() => setMidiLogs([])}>Clear Log</button>
              </div>
              <div className="terminal-body">
                {midiLogs.length === 0 ? (
                  <div className="terminal-placeholder">
                    <span>&gt;_ Waiting for physical MIDI signals...</span>
                    <span className="placeholder-sub">Wiggle a physical knob, slider, or press a note on your keyboard to test connection.</span>
                  </div>
                ) : (
                  midiLogs.map(log => (
                    <div key={log.id} className="terminal-row">
                      <span className="term-time">[{log.timestamp}]</span>
                      <span className="term-text">{log.text}</span>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE MAPPINGS */}
          {activeTab === 'mappings' && (
            <div className="mappings-panel">
              {midiBindings.length === 0 ? (
                <div className="empty-mappings">
                  <div className="empty-glyph">🔌</div>
                  <h3>No Active MIDI Mappings</h3>
                  <p>Trigger learning in direct overlay mode or browse-and-assign any canvas parameter in the learn tab!</p>
                  <button className="empty-action-btn" onClick={() => setActiveTab('learn')}>
                    Browse Canvas Parameters
                  </button>
                </div>
              ) : (
                <div className="mappings-table-container">
                  <table className="mappings-table">
                    <thead>
                      <tr>
                        <th>Target Parameter</th>
                        <th>MIDI Input Source</th>
                        <th>Min Bound</th>
                        <th>Max Bound</th>
                        <th style={{ textAlign: 'center' }}>Invert</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {midiBindings.map((binding: any) => {
                        const labels = getTargetLabels(binding);
                        const isCC = binding.midiSource.ccNumber !== undefined;
                        return (
                          <tr key={binding.id} className="mapping-row">
                            <td>
                              <div className="param-details">
                                <span className="param-layer">{labels.layer}</span>
                                <span className="param-module">{labels.module}</span>
                                <span className="param-name">{labels.param}</span>
                              </div>
                            </td>
                            <td>
                              <div className="source-badge">
                                <span className="badge-ch">CH {binding.midiSource.channel}</span>
                                <span className="badge-type">
                                  {isCC ? `CC #${binding.midiSource.ccNumber}` : `Note #${binding.midiSource.noteNumber}`}
                                </span>
                              </div>
                            </td>
                            <td>
                              <input 
                                type="number" 
                                className="mapping-num-input"
                                value={binding.range[0]} 
                                step={0.05}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateMidiBinding(binding.id, { range: [val, binding.range[1]] });
                                }}
                              />
                            </td>
                            <td>
                              <input 
                                type="number" 
                                className="mapping-num-input"
                                value={binding.range[1]} 
                                step={0.05}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateMidiBinding(binding.id, { range: [binding.range[0], val] });
                                }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox" 
                                className="mapping-checkbox"
                                checked={binding.invert}
                                onChange={e => {
                                  updateMidiBinding(binding.id, { invert: e.target.checked });
                                }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                className="mapping-delete-btn"
                                onClick={() => removeMidiBinding(binding.id)}
                                title="Delete Mapping"
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: INTERACTIVE LEARN & BROWSE */}
          {activeTab === 'learn' && (
            <div className="learn-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {midiLearnTarget ? (
                <div className="learn-active-glowbox">
                  <div className="learn-pulse-dot-container">
                    <span className="dot pulse-red"></span>
                    <h2>MIDI LEARN MODE ACTIVE</h2>
                  </div>
                  <p className="learn-instruction">
                    Wiggle a physical slider, turn a knob, or press a note on your hardware controller now to bind it!
                  </p>
                  
                  <div className="learn-focus-card">
                    <div className="card-item">
                      <span className="card-label">Target Layer:</span>
                      <span className="card-val">{layers[midiLearnTarget.layerId]?.name || midiLearnTarget.layerId}</span>
                    </div>
                    <div className="card-item">
                      <span className="card-label">Target Module:</span>
                      <span className="card-val">
                        {midiLearnTarget.type === 'absolute' 
                          ? midiLearnTarget.moduleId === 'source'
                            ? `${layers[midiLearnTarget.layerId]?.source.type} (Source)`
                            : layers[midiLearnTarget.layerId]?.effects.find((e: any) => e.id === midiLearnTarget.moduleId)?.type || 
                              (layers[midiLearnTarget.layerId]?.modulators?.[midiLearnTarget.moduleId]?.type ? `${layers[midiLearnTarget.layerId]?.modulators[midiLearnTarget.moduleId].type} (Modulator)` : midiLearnTarget.moduleId)
                          : midiLearnTarget.moduleType}
                      </span>
                    </div>
                    <div className="card-item">
                      <span className="card-label">Target Parameter:</span>
                      <span className="card-val highlight">{midiLearnTarget.paramId}</span>
                    </div>
                  </div>

                  <button className="cancel-learn-btn" onClick={() => setMidiLearnTarget(null)}>
                    Cancel MIDI Learn
                  </button>
                </div>
              ) : (
                <div className="learn-browse-split-grid" style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0 }}>
                  
                  {/* Left Column: Parameter Selection (Browse) */}
                  <div className="learn-browse-left-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(255, 255, 255, 0.02)', padding: 16, border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 13, letterSpacing: 1, color: '#9e4aff' }}>1. BROWSE CANVAS PARAMETERS</h3>
                    
                    <div className="browse-row" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: '#aaa', fontWeight: 'bold' }}>SELECT ACTIVE LAYER</label>
                      <select 
                        value={selectedLayerId}
                        onChange={e => setSelectedLayerId(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
                      >
                        {Object.values(layers).map(layer => (
                          <option key={layer.id} value={layer.id}>{layer.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="browse-row" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: '#aaa', fontWeight: 'bold' }}>SELECT MODULE / NODE</label>
                      <select 
                        value={selectedModuleId}
                        onChange={e => setSelectedModuleId(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
                      >
                        {availableModules.map(mod => (
                          <option key={mod.id} value={mod.id}>{mod.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="browse-row" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 9, color: '#aaa', fontWeight: 'bold' }}>SELECT MANUEL PARAMETER</label>
                      {availableParams.length === 0 ? (
                        <div style={{ padding: '6px 8px', background: 'rgba(255, 68, 68, 0.05)', border: '1px dashed rgba(255, 68, 68, 0.2)', color: '#ff7777', fontSize: 10, borderRadius: 4 }}>
                          No manually controllable parameters found in this module type.
                        </div>
                      ) : (
                        <select 
                          value={selectedParamId}
                          onChange={e => setSelectedParamId(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 11 }}
                        >
                          {availableParams.map(param => (
                            <option key={param} value={param}>{param}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Dynamic Learn / Manual Action Panel */}
                  <div className="learn-browse-right-panel" style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(0, 0, 0, 0.3)', padding: 16, border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: 8, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: 12, letterSpacing: 1 }}>2. CHOOSE ASSIGN METHOD</h3>
                      <button 
                        style={{ background: 'none', border: 'none', color: '#4a9eff', fontSize: 9, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        onClick={() => setIsManualEntryActive(!isManualEntryActive)}
                      >
                        {isManualEntryActive ? 'Switch to Hardware Learn' : 'Switch to Manual input'}
                      </button>
                    </div>

                    {/* TARGET PREVIEW */}
                    <div style={{ background: '#0a0a0f', border: '1px solid #222', borderRadius: 4, padding: 8, fontSize: 10 }}>
                      <div style={{ color: '#666', fontSize: 8 }}>MAPPING TARGET TARGET:</div>
                      <div style={{ fontWeight: 'bold', color: '#eee', marginTop: 2 }}>
                        {layers[selectedLayerId]?.name || 'No Layer'} &gt; {selectedModuleObj?.label || 'No Module'} &gt; <span style={{ color: '#88cc00' }}>{selectedParamId || 'None'}</span>
                      </div>
                    </div>

                    {!isManualEntryActive ? (
                      /* HARDWARE WIGGLE LEARN */
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 24, filter: 'grayscale(0)' }}>🔴</div>
                        <h4 style={{ margin: 0, fontSize: 12, color: '#eee' }}>Wiggle-to-Learn Setup</h4>
                        <p style={{ margin: 0, fontSize: 9, color: '#888', textAlign: 'center', padding: '0 8px', lineHeight: 1.4 }}>
                          Click the learn button below, then turn a physical knob or slide a physical fader to map it instantly.
                        </p>
                        <button 
                          className="empty-action-btn animate-pulse-glow"
                          onClick={handleStartLearnSelected}
                          disabled={!selectedParamId}
                          style={{ width: '100%', marginTop: 8, opacity: selectedParamId ? 1 : 0.5, cursor: selectedParamId ? 'pointer' : 'not-allowed' }}
                        >
                          Trigger Hardware Learn
                        </button>
                      </div>
                    ) : (
                      /* MANUAL CC/NOTE ENCODER */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="manual-field" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <label style={{ fontSize: 8, color: '#aaa', fontWeight: 'bold' }}>MIDI CHANNEL</label>
                          <select 
                            value={manualChannel === 'all' ? 'all' : manualChannel}
                            onChange={e => setManualChannel(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            style={{ padding: '4px 6px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 10 }}
                          >
                            <option value="all">OMNI (All Channels)</option>
                            {Array.from({ length: 16 }).map((_, i) => (
                              <option key={i + 1} value={i + 1}>Channel {i + 1}</option>
                            ))}
                          </select>
                        </div>

                        <div className="manual-field" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <label style={{ fontSize: 8, color: '#aaa', fontWeight: 'bold' }}>INPUT SIGNAL TYPE</label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer' }}>
                              <input type="radio" checked={manualInputType === 'cc'} onChange={() => setManualInputType('cc')} /> Control Change (CC)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, cursor: 'pointer' }}>
                              <input type="radio" checked={manualInputType === 'note'} onChange={() => setManualInputType('note')} /> Note On
                            </label>
                          </div>
                        </div>

                        <div className="manual-field" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <label style={{ fontSize: 8, color: '#aaa', fontWeight: 'bold' }}>
                            {manualInputType === 'cc' ? 'CC CONTROLLER INDEX (0-127)' : 'NOTE MIDI KEY CODE (0-127)'}
                          </label>
                          <input 
                            type="number" 
                            min={0}
                            max={127}
                            value={manualIndex}
                            onChange={e => setManualIndex(Math.max(0, Math.min(127, Number(e.target.value) || 0)))}
                            style={{ padding: '4px 6px', background: '#111', color: '#fff', border: '1px solid #333', borderRadius: 4, fontSize: 10, fontFamily: 'monospace' }}
                          />
                        </div>

                        <button 
                          className="empty-action-btn"
                          onClick={handleCreateManualBinding}
                          disabled={!selectedParamId}
                          style={{ width: '100%', marginTop: 8, background: '#4a9eff', color: '#fff', opacity: selectedParamId ? 1 : 0.5, cursor: selectedParamId ? 'pointer' : 'not-allowed', boxShadow: '0 4px 12px rgba(74, 158, 255, 0.4)' }}
                        >
                          Apply Manual Binding
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
