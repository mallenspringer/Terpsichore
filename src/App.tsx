import { useEffect, useRef, useState } from "react";
import "./App.css";
import { useEngineStore } from "./state/store";
import { Renderer } from "./renderer/Renderer";
import { Sidebar } from "./components/Sidebar";
import { NodeGraph } from "./components/NodeGraph/NodeGraph";

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  
  const state = useEngineStore();
  const layers = state.layers;
  const resolution = state.resolution;

  const [activeLayerId, setActiveLayerId] = useState<string | null>('layer_initial');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [videoProgress, setVideoProgress] = useState<{currentTime: number, duration: number}>({currentTime: 0, duration: 0});

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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') return;
      if (target.tagName === 'INPUT') {
        const type = (target as HTMLInputElement).type;
        // Block if it's a typing field, but ALLOW if it's a slider (range)
        if (['text', 'number', 'email', 'url', 'password'].includes(type)) return;
      }

      const key = e.key;
      const validKeys = ['1','2','3','4','5','6','7','8','9','0'];
      if (!validKeys.includes(key)) return;

      const state = useEngineStore.getState();
      Object.entries(state.layers).forEach(([layerId, layer]) => {
        let changed = false;
        const nextModulators = { ...layer.modulators };
        
        Object.entries(layer.modulators || {}).forEach(([modId, mod]) => {
          if (mod.type === 'TriggerPad' && (mod as any).keyMapping === key) {
            if (mod.isPressed !== isDown) {
              nextModulators[modId] = { ...mod, isPressed: isDown };
              changed = true;
            }
          }
        });

        if (changed) {
          state.updateLayer(layerId, { modulators: nextModulators });
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
  }, []);

  // Update renderer resolution when the store changes
  useEffect(() => {
    if (rendererRef.current && canvasRef.current) {
      rendererRef.current.resize(resolution.width, resolution.height);
    }
  }, [resolution]);

  useEffect(() => {
    const globalUp = () => {
      if (rendererRef.current) {
        Object.keys(rendererRef.current.isSeeking).forEach(id => {
          rendererRef.current!.isSeeking[id] = false;
        });
      }

      // Reset all TriggerPads (safety)
      const state = useEngineStore.getState();
      Object.entries(state.layers).forEach(([layerId, layer]) => {
        let changed = false;
        const nextModulators = { ...layer.modulators };
        Object.entries(layer.modulators || {}).forEach(([modId, mod]) => {
          if (mod.type === 'TriggerPad' && mod.isPressed) {
            nextModulators[modId] = { ...mod, isPressed: false };
            changed = true;
          }
        });
        if (changed) {
          state.updateLayer(layerId, { modulators: nextModulators });
        }
      });

      import('./state/AudioEngine').then(({ AudioEngine }) => {
        AudioEngine.getInstance().resume();
      });
    };
    window.addEventListener('pointerup', globalUp);
    return () => window.removeEventListener('pointerup', globalUp);
  }, []);

  // Stable Progress Loop using a Ref to prevent teardown jitter
  const progressLoopRef = useRef<number>(0);
  useEffect(() => {
    const loop = () => {
      const aid = activeLayerId; // Use current value from closure scope or better yet, read from store
      const isSeeking = aid ? !!rendererRef.current?.isSeeking[aid] : false;
      
      if (aid && rendererRef.current) {
        const vid = rendererRef.current.getVideoElement(aid);
        
        if (vid && !isNaN(vid.duration) && vid.duration > 0) {
          setVideoProgress(prev => {
            const needsDurationUpdate = Math.abs(prev.duration - vid.duration) > 0.01 || prev.duration === 0;
            if (needsDurationUpdate) {
              console.log(`[App] Syncing duration for ${aid}: ${vid.duration.toFixed(2)}s`);
              return { currentTime: vid.currentTime, duration: vid.duration };
            }
            if (!isSeeking && Math.abs(prev.currentTime - vid.currentTime) > 0.001) {
              return { ...prev, currentTime: vid.currentTime };
            }
            return prev;
          });
        }
      }
      progressLoopRef.current = requestAnimationFrame(loop);
    };
    progressLoopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(progressLoopRef.current);
  }, [activeLayerId]); // Only restart if the active layer changes

  const handleSeekStart = () => {
    if (activeLayerId && rendererRef.current) {
      rendererRef.current.isSeeking[activeLayerId] = true;
    }
  };

  const handleSeekEnd = () => {
    if (activeLayerId && rendererRef.current) {
      rendererRef.current.isSeeking[activeLayerId] = false;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    
    if (activeLayerId) {
      console.log(`[App] Seeking layer ${activeLayerId} to ${time.toFixed(3)}s (UI max was ${videoProgress.duration}s)`);
      const layer = layers[activeLayerId];
      if (layer && (layer.source.type === 'VideoURL' || layer.source.type === 'VideoFile')) {
        const vid = rendererRef.current?.getVideoElement(layer.id);
        if (vid) {
          vid.currentTime = time;
          setVideoProgress(p => ({ ...p, currentTime: time }));
        }
      }
    }
  };


  const activeLayer = activeLayerId ? layers[activeLayerId] : null;

  const [isEditingSource, setIsEditingSource] = useState(false);
  void isEditingSource; // reserved for future use


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: 'transparent', color: '#333', fontFamily: '"Inter", sans-serif' }}>
      
      {/* Top Menu */}
      <div style={{ height: 40, backgroundColor: '#111', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between', borderBottom: '1px solid #2a2a2a' }}>
        <div style={{ fontWeight: 'bold', letterSpacing: 2, fontSize: '0.95em' }}>TERPSICHORE <span style={{color: '#555', fontWeight: 'normal', marginLeft: 10, fontSize: '0.8em'}}>v0.1.0</span></div>
      </div>

      {/* Main App Container */}
      <div className="app-container" style={{ flex: 1, display: 'flex', height: 'calc(100vh - 40px)', overflow: 'hidden', background: 'transparent' }}>

        {/* Sidebar */}
        <Sidebar
          activeLayerId={activeLayerId}
          onSelectLayer={(id) => {
            setActiveLayerId(id);
            setIsEditingSource(false);
          }}
        />

        <div className="main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div className="canvas-container" style={{ flex: 1, padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ 
              width: '100%', 
              height: '100%', 
              maxWidth: '1200px', 
              maxHeight: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              <canvas 
                ref={canvasRef} 
                width={resolution.width} 
                height={resolution.height} 
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              ></canvas>
            </div>
          </div>
          {/* Node Graph Bottom Bar */}
          <NodeGraph
            key={activeLayerId || 'none'}
            layer={activeLayer}
            videoProgress={videoProgress}
            onSeek={handleSeek}
            onSeekStart={handleSeekStart}
            onSeekEnd={handleSeekEnd}
            cameras={cameras}
            linkedScales={activeLayer?.linkedScales || {}}
            setLinkedScales={(s) => {
              if (activeLayerId) {
                const state = useEngineStore.getState();
                state.updateLayer(activeLayerId, { linkedScales: s });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
