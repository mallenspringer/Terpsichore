import { useEffect, useRef, useState, useMemo } from "react";
import "./App.css";
import { useEngineStore } from "./state/store";
import { Renderer } from "./renderer/Renderer";
import { Sidebar } from "./components/Sidebar";
import { NodeGraph } from "./components/NodeGraph/NodeGraph";
import { MidiMappingModal } from "./components/NodeGraph/MidiMappingModal";
import { AudioEngine } from "./state/AudioEngine";
import { ExternalWindowManager } from "./utils/ExternalWindowManager";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  
  // Store Subscriptions
  const layers = useEngineStore(s => s.layers);
  const resolution = useEngineStore(s => s.resolution);
  const activeLayerId = useEngineStore(s => s.activeLayerId);
  const setActiveLayerId = useEngineStore(s => s.setActiveLayerId);
  const updateLayer = useEngineStore(s => s.updateLayer);
  const globalAudioMuted = useEngineStore(s => s.globalAudioMuted);
  const setGlobalAudioMuted = useEngineStore(s => s.setGlobalAudioMuted);

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [videoProgress, setVideoProgress] = useState<Record<string, {currentTime: number, duration: number}>>({});
  const [isMidiModalOpen, setMidiModalOpen] = useState(false);
  const [isPopoutOpen, setPopoutOpen] = useState(false);

  useEffect(() => {
    return ExternalWindowManager.getInstance().subscribe(setPopoutOpen);
  }, []);

  const handleTogglePopout = () => {
    if (canvasRef.current) {
      ExternalWindowManager.getInstance().toggle(canvasRef.current, rendererRef.current);
    }
  };

  const activeLayer = useMemo(() => activeLayerId ? layers[activeLayerId] : null, [layers, activeLayerId]);

  // Initialization
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setCameras(devices.filter(d => d.kind === 'videoinput'));
    }).catch(err => console.warn("Could not enumerate devices", err));
  }, []);

  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      const renderer = new Renderer(canvasRef.current);
      renderer.initialize().catch(err => console.error("Renderer Init Error:", err));
      rendererRef.current = renderer;
      (window as any).renderer = renderer;
    }
    return () => {
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
    };
  }, []);

  // Sync Resolution
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.resize(resolution.width, resolution.height);
    }
  }, [resolution]);

  // Keyboard / Trigger Handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        if ((target as HTMLInputElement).type !== 'range') return;
      }

      const key = e.key;
      if (!['1','2','3','4','5','6','7','8','9','0'].includes(key)) return;

      Object.entries(layers).forEach(([layerId, layer]) => {
        const nextModulators = { ...layer.modulators };
        let modChanged = false;
        Object.entries(layer.modulators || {}).forEach(([modId, mod]) => {
          if (mod.type === 'TriggerPad' && (mod as any).keyMapping === key) {
            if (mod.isPressed !== isDown) {
              nextModulators[modId] = { ...mod, isPressed: isDown };
              modChanged = true;
            }
          }
        });

        const nextEffects = [...(layer.effects || [])];
        let effChanged = false;
        if (isDown) { // Only trigger S&H on keydown
          nextEffects.forEach((eff, idx) => {
            if (eff.type === 'SampleAndHold' && (eff as any).keyMapping === key) {
              const sh = eff as any;
              if (sh.triggerMode === 'freeze_toggle') {
                const newLive = !sh.isLive;
                nextEffects[idx] = { 
                  ...eff, 
                  isLive: newLive, 
                  manualTriggerTime: !newLive ? Date.now() : sh.manualTriggerTime 
                };
              } else if (sh.triggerMode === 'sample_show') {
                nextEffects[idx] = { ...eff, isLive: false, manualTriggerTime: Date.now() };
              } else { // sample_only
                nextEffects[idx] = { ...eff, manualTriggerTime: Date.now() };
              }
              effChanged = true;
            }
          });
        }

        if (modChanged || effChanged) {
          updateLayer(layerId, { 
            modulators: modChanged ? nextModulators : layer.modulators,
            effects: effChanged ? nextEffects : layer.effects
          });
        }
      });
    };
    const onDown = (e: KeyboardEvent) => handleKey(e, true);
    const onUp = (e: KeyboardEvent) => handleKey(e, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [layers, updateLayer]);

  // Video Progress Loop
  const progressLoopRef = useRef<number>(0);
  useEffect(() => {
    const loop = () => {
      if (activeLayerId && rendererRef.current && activeLayer) {
        const nextProgress: Record<string, {currentTime: number, duration: number}> = {};
        
        // Track primary source
        const primaryMedia = rendererRef.current.getMediaElement(activeLayerId);
        if (primaryMedia && !isNaN(primaryMedia.duration)) {
          nextProgress['source'] = { currentTime: primaryMedia.currentTime, duration: primaryMedia.duration };
        }
        
        // Track effects
        activeLayer.effects.forEach(ef => {
          if (ef.id && ['VideoFile', 'VideoURL', 'WebcamCapture', 'AudioFile'].includes(ef.type)) {
            const media = rendererRef.current!.getMediaElement(ef.id);
            if (media && !isNaN(media.duration)) {
              nextProgress[ef.id] = { currentTime: media.currentTime, duration: media.duration };
            }
          }
        });

        setVideoProgress(prev => {
          const changed = Object.keys(nextProgress).some(k => 
            !prev[k] || 
            Math.abs(prev[k].currentTime - nextProgress[k].currentTime) > 0.05 ||
            Math.abs(prev[k].duration - nextProgress[k].duration) > 0.05
          );
          return changed ? { ...prev, ...nextProgress } : prev;
        });
      }
      progressLoopRef.current = requestAnimationFrame(loop);
    };
    progressLoopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(progressLoopRef.current);
  }, [activeLayerId, activeLayer]);

  // Handlers
  const handleSeek = (nodeId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (activeLayerId && rendererRef.current) {
      const mediaKey = nodeId === 'source' ? activeLayerId : nodeId;
      const media = rendererRef.current.getMediaElement(mediaKey);
      if (media) media.currentTime = time;
      setVideoProgress(p => ({ ...p, [nodeId]: { ...(p[nodeId] || { duration: 0 }), currentTime: time } }));
    }
  };

  const audioResumedRef = useRef(false);
  const handlePointerDown = () => {
    if (!audioResumedRef.current) {
      AudioEngine.getInstance().resume().then(() => {
        audioResumedRef.current = true;
      });
    }
  };

  return (
    <div className="app-root" 
      onPointerDown={handlePointerDown}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', color: '#eee' }}>
      {/* Top Menu */}
      <div className="top-menu" style={{ height: 40, background: '#111', display: 'flex', alignItems: 'center', padding: '0 15px', borderBottom: '1px solid #222' }}>
        <div style={{ fontWeight: 'bold', letterSpacing: 2 }}>
          TERPSICH<span style={{ color: '#ff4444' }}>O</span><span style={{ color: '#88cc00' }}>R</span><span style={{ color: '#4444ff' }}>E</span>
          <span style={{ color: '#444', fontSize: '0.8em', marginLeft: 8 }}>v0.4.0</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleTogglePopout}
          style={{
            background: isPopoutOpen ? 'rgba(0, 255, 170, 0.15)' : '#1a1a1a',
            border: isPopoutOpen ? '1px solid #00ffaa' : '1px solid #333',
            color: isPopoutOpen ? '#00ffaa' : '#ccc',
            cursor: 'pointer',
            fontSize: 12,
            padding: '4px 12px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginRight: 10,
            transition: 'all 0.2s ease'
          }}
          title={isPopoutOpen ? "Focus or close external projector window" : "Open external window for second monitor / projector"}
        >
          <span style={{ fontSize: 13 }}>🗗</span>
          <span>{isPopoutOpen ? 'Projector Out (Active)' : 'Pop Out Window'}</span>
          {isPopoutOpen && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ffaa', display: 'inline-block' }} />}
        </button>
        <button 
          onClick={() => setGlobalAudioMuted(!globalAudioMuted)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: globalAudioMuted ? '#f44' : '#eee', padding: 5, borderRadius: 4 }}
        >
          {globalAudioMuted ? '🔇' : '🔊'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Sidebar 
          activeLayerId={activeLayerId} 
          onSelectLayer={setActiveLayerId} 
          onOpenMidiModal={() => setMidiModalOpen(true)}
        />

        <div className="main-area">
          <div className="canvas-container" style={{ position: 'relative' }}>
            <canvas 
              ref={canvasRef} 
              width={resolution.width} 
              height={resolution.height} 
              style={{ 
                maxWidth: '95%', 
                maxHeight: '95%', 
                objectFit: 'contain', 
                boxShadow: '0 0 40px rgba(0,0,0,0.5)',
                background: '#000' // Ensure the actual canvas is black
              }} 
            />
            {isPopoutOpen && (
              <div style={{
                position: 'absolute',
                top: 10,
                right: 14,
                background: 'rgba(0, 255, 170, 0.15)',
                border: '1px solid #00ffaa',
                color: '#00ffaa',
                fontSize: 11,
                fontFamily: 'monospace',
                padding: '4px 10px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                pointerEvents: 'none',
                backdropFilter: 'blur(4px)'
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ffaa', display: 'inline-block' }} />
                MIRRORED TO EXTERNAL DISPLAY
              </div>
            )}
          </div>

          <div style={{ height: 490, flexShrink: 0, background: '#111', borderTop: '1px solid #222', display: 'flex' }}>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
              <NodeGraph 
                layerId={activeLayerId}
                layer={activeLayer}
                videoProgress={videoProgress}
                onSeek={handleSeek}
                onSeekStart={(nodeId) => { 
                  if (rendererRef.current && activeLayerId) {
                    const key = nodeId === 'source' ? activeLayerId : nodeId;
                    rendererRef.current.isSeeking[key] = true; 
                  }
                }}
                onSeekEnd={(nodeId) => { 
                  if (rendererRef.current && activeLayerId) {
                    const key = nodeId === 'source' ? activeLayerId : nodeId;
                    rendererRef.current.isSeeking[key] = false; 
                  }
                }}
                cameras={cameras}
                linkedScales={activeLayer?.linkedScales || {}}
                setLinkedScales={(s) => {
                  if (activeLayerId) updateLayer(activeLayerId, { linkedScales: s });
                }}
              />

            </div>
          </div>
        </div>
      </div>
      
      <MidiMappingModal isOpen={isMidiModalOpen} onClose={() => setMidiModalOpen(false)} />
    </div>
  );
}

export default App;
