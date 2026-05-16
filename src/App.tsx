import { useEffect, useRef, useState, useMemo } from "react";
import "./App.css";
import { useEngineStore } from "./state/store";
import { Renderer } from "./renderer/Renderer";
import { Sidebar } from "./components/Sidebar";
import { NodeGraph } from "./components/NodeGraph/NodeGraph";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  
  // Store Subscriptions
  const layers = useEngineStore(s => s.layers);
  const resolution = useEngineStore(s => s.resolution);
  const activeLayerId = useEngineStore(s => s.activeLayerId);
  const setActiveLayerId = useEngineStore(s => s.setActiveLayerId);
  const updateLayer = useEngineStore(s => s.updateLayer);
  const setSource = useEngineStore(s => s.setSource);
  const globalAudioMuted = useEngineStore(s => s.globalAudioMuted);
  const setGlobalAudioMuted = useEngineStore(s => s.setGlobalAudioMuted);

  // Local State
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [videoProgress, setVideoProgress] = useState<Record<string, {currentTime: number, duration: number}>>({});

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

  const sourceCtx = useMemo(() => {
    if (!activeLayerId || !activeLayer) return null;
    return {
      source: activeLayer.source,
      onChange: (key: string, val: any) => setSource(activeLayerId, { ...activeLayer.source, [key]: val }),
      onUpdate: (upd: any) => setSource(activeLayerId, { ...activeLayer.source, ...upd }),
      videoProgress: videoProgress['source'] || { currentTime: 0, duration: 0 },
      onSeek: handleSeek,
      onSeekStart: (nodeId) => { 
        if (rendererRef.current && activeLayerId) {
          const key = nodeId === 'source' ? activeLayerId : nodeId;
          rendererRef.current.isSeeking[key] = true;
        }
      },
      onSeekEnd: (nodeId) => { 
        if (rendererRef.current && activeLayerId) {
          const key = nodeId === 'source' ? activeLayerId : nodeId;
          rendererRef.current.isSeeking[key] = false;
        }
      },
      cameras,
      layerOpacity: activeLayer.opacity,
      layerBlendMode: activeLayer.blendMode,
      layerAudioMuted: activeLayer.audioMuted || activeLayer.muted,
      onLayerUpdate: (updates: any) => updateLayer(activeLayerId, updates)
    };
  }, [activeLayerId, activeLayer, cameras, videoProgress]);

  const handlePointerDown = () => {
    import('./state/AudioEngine').then(({ AudioEngine }) => {
      AudioEngine.getInstance().resume();
    });
  };

  return (
    <div className="app-root" 
      onPointerDown={handlePointerDown}
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', color: '#eee' }}>
      {/* Top Menu */}
      <div className="top-menu" style={{ height: 40, background: '#111', display: 'flex', alignItems: 'center', padding: '0 15px', borderBottom: '1px solid #222' }}>
        <div style={{ fontWeight: 'bold', letterSpacing: 2 }}>
          TERPSICH<span style={{ color: '#ff4444' }}>O</span><span style={{ color: '#88cc00' }}>R</span><span style={{ color: '#4444ff' }}>E</span>
          <span style={{ color: '#444', fontSize: '0.8em', marginLeft: 8 }}>v0.2.0</span>
        </div>
        <div style={{ flex: 1 }} />
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
          activeLayer={activeLayer}
          sourceCtx={sourceCtx as any}
        />

        <div className="main-area">
          <div className="canvas-container">
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
    </div>
  );
}

export default App;
