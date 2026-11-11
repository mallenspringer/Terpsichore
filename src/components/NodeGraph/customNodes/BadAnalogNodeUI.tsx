import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import {
  BadAnalogEffect,
  BadAnalogDisplayMode,
  BadAnalogProcessTarget,
  BadAnalogPhosphorType
} from '../../../state/types';

interface BadAnalogNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: BadAnalogEffect;
  rowCtx?: any;
}

export const BadAnalogNodeUI: React.FC<BadAnalogNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const updateEffect = useEngineStore(s => s.updateEffect);
  const [activeTab, setActiveTab] = useState<'display' | 'glitch'>('display');

  const handleUpdate = (patch: Partial<BadAnalogEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const displayMode = effect.displayMode || 'crt';
  const processTarget = effect.processTarget || 'canvas';
  const phosphorType = effect.phosphorType || 'p1_green';

  const curvature = effect.curvature ?? 0.15;
  const vignette = effect.vignette ?? 0.25;
  const scanlines = effect.scanlines ?? 0.5;
  const scanlineCount = effect.scanlineCount ?? 240;
  const phosphorMask = effect.phosphorMask ?? 0.35;
  const maskBrightness = effect.maskBrightness ?? 1.15;

  const vectorGlow = effect.vectorGlow ?? 0.6;
  const vectorIntensity = effect.vectorIntensity ?? 1.5;

  const chromaBleed = effect.chromaBleed ?? 0.35;
  const jitter = effect.jitter ?? 0.08;
  const vhsTracking = effect.vhsTracking ?? 0.0;
  const headSwitching = effect.headSwitching ?? 0.0;
  const humBar = effect.humBar ?? 0.0;
  const humBarSpeed = effect.humBarSpeed ?? 0.5;
  const noiseSnow = effect.noiseSnow ?? 0.05;
  const lumaSag = effect.lumaSag ?? 0.0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '4px 2px',
        fontSize: '11px',
        color: '#e0e0e0',
        width: '228px'
      }}
      onPointerDown={e => {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
          e.stopPropagation();
        }
      }}
    >
      {/* Target Mode: Canvas vs Upstream Bounded */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Process Target
          </span>
          <span
            style={{
              fontSize: '9px',
              padding: '1px 5px',
              borderRadius: '3px',
              background: processTarget === 'upstream_bounded' ? '#0077aa' : '#333',
              color: '#fff',
              fontWeight: 600
            }}
          >
            {processTarget === 'upstream_bounded' ? 'BOUNDED SHAPE' : 'CANVAS'}
          </span>
        </div>
        <select
          value={processTarget}
          onChange={e => handleUpdate({ processTarget: e.target.value as BadAnalogProcessTarget })}
          style={{
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '11px',
            outline: 'none'
          }}
        >
          <option value="canvas">Entire Canvas (Fullscreen)</option>
          <option value="upstream_bounded">Upstream Bounded (Alpha Masked)</option>
        </select>
      </div>

      {/* Display Mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Display Type
        </span>
        <select
          value={displayMode}
          onChange={e => handleUpdate({ displayMode: e.target.value as BadAnalogDisplayMode })}
          style={{
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: '4px',
            padding: '4px 6px',
            fontSize: '11px',
            outline: 'none'
          }}
        >
          <option value="crt">CRT Monitor (Scanlines & Triads)</option>
          <option value="vector">Vector Display (Beam Bloom)</option>
          <option value="monochrome">Monochrome Phosphor (P1/P3/P4)</option>
          <option value="matrix_lcd">Retro Matrix (VFD / LCD)</option>
        </select>
      </div>

      {/* Phosphor Chemistry (when Monochrome is active) */}
      {displayMode === 'monochrome' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Phosphor Chemistry
          </span>
          <select
            value={phosphorType}
            onChange={e => handleUpdate({ phosphorType: e.target.value as BadAnalogPhosphorType })}
            style={{
              background: '#1a1a1a',
              color: phosphorType === 'p1_green' ? '#00ff66' : phosphorType === 'p3_amber' ? '#ffaa00' : '#ffffff',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '4px 6px',
              fontSize: '11px',
              outline: 'none',
              fontWeight: 600
            }}
          >
            <option value="p1_green">P1 Green (525nm Classic Terminal)</option>
            <option value="p3_amber">P3 Amber (605nm Warm Radar)</option>
            <option value="p4_white">P4 White (5600K Monochrome)</option>
          </select>
        </div>
      )}

      {/* Tab Switcher: Display vs Glitches */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #2a2a2a', paddingBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('display')}
          style={{
            flex: 1,
            background: activeTab === 'display' ? '#2c2c2c' : '#181818',
            color: activeTab === 'display' ? '#fff' : '#888',
            border: '1px solid #333',
            borderRadius: '3px',
            padding: '3px 0',
            fontSize: '10px',
            cursor: 'pointer',
            fontWeight: activeTab === 'display' ? 600 : 400
          }}
        >
          OPTICS & CRT
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('glitch')}
          style={{
            flex: 1,
            background: activeTab === 'glitch' ? '#2c2c2c' : '#181818',
            color: activeTab === 'glitch' ? '#fff' : '#888',
            border: '1px solid #333',
            borderRadius: '3px',
            padding: '3px 0',
            fontSize: '10px',
            cursor: 'pointer',
            fontWeight: activeTab === 'glitch' ? 600 : 400
          }}
        >
          GLITCH & VHS
        </button>
      </div>

      {/* Tab 1: Optics & CRT Parameters */}
      {activeTab === 'display' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {displayMode === 'vector' ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span>Beam Glow</span>
                  <span>{Math.round(vectorGlow * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={vectorGlow}
                  onChange={e => handleUpdate({ vectorGlow: parseFloat(e.target.value) })}
                  style={{ width: '100%', height: '4px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span>Beam Overdrive</span>
                  <span>{vectorIntensity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.05"
                  value={vectorIntensity}
                  onChange={e => handleUpdate({ vectorIntensity: parseFloat(e.target.value) })}
                  style={{ width: '100%', height: '4px' }}
                />
              </div>
            </>
          ) : (
            <>
              {processTarget === 'canvas' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span>Screen Curvature</span>
                      <span>{Math.round(curvature * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.6"
                      step="0.01"
                      value={curvature}
                      onChange={e => handleUpdate({ curvature: parseFloat(e.target.value) })}
                      style={{ width: '100%', height: '4px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span>Bezel Vignette</span>
                      <span>{Math.round(vignette * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="0.8"
                      step="0.01"
                      value={vignette}
                      onChange={e => handleUpdate({ vignette: parseFloat(e.target.value) })}
                      style={{ width: '100%', height: '4px' }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span>Scanline Depth</span>
                  <span>{Math.round(scanlines * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scanlines}
                  onChange={e => handleUpdate({ scanlines: parseFloat(e.target.value) })}
                  style={{ width: '100%', height: '4px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                  <span>Raster Lines</span>
                  <span>{scanlineCount}p</span>
                </div>
                <input
                  type="range"
                  min="120"
                  max="480"
                  step="20"
                  value={scanlineCount}
                  onChange={e => handleUpdate({ scanlineCount: parseInt(e.target.value) })}
                  style={{ width: '100%', height: '4px' }}
                />
              </div>

              {displayMode === 'crt' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span>Aperture Grille Triads</span>
                      <span>{Math.round(phosphorMask * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={phosphorMask}
                      onChange={e => handleUpdate({ phosphorMask: parseFloat(e.target.value) })}
                      style={{ width: '100%', height: '4px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                      <span>Mask Brightness</span>
                      <span>{Math.round(maskBrightness * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.8"
                      step="0.02"
                      value={maskBrightness}
                      onChange={e => handleUpdate({ maskBrightness: parseFloat(e.target.value) })}
                      style={{ width: '100%', height: '4px' }}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 2: Glitches & VHS */}
      {activeTab === 'glitch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>H-Sync Jitter / Tear</span>
              <span>{Math.round(jitter * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={jitter}
              onChange={e => handleUpdate({ jitter: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>NTSC Chroma Bleed</span>
              <span>{Math.round(chromaBleed * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={chromaBleed}
              onChange={e => handleUpdate({ chromaBleed: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>VHS Tracking Skew</span>
              <span>{Math.round(vhsTracking * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={vhsTracking}
              onChange={e => handleUpdate({ vhsTracking: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>Head-Switch Band</span>
              <span>{Math.round(headSwitching * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={headSwitching}
              onChange={e => handleUpdate({ headSwitching: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>60Hz Ground Hum Bar</span>
              <span>{Math.round(humBar * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={humBar}
              onChange={e => handleUpdate({ humBar: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>

          {humBar > 0.001 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span>Hum Roll Speed</span>
                <span>{humBarSpeed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.1"
                value={humBarSpeed}
                onChange={e => handleUpdate({ humBarSpeed: parseFloat(e.target.value) })}
                style={{ width: '100%', height: '4px' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>RF Noise Snow</span>
              <span>{Math.round(noiseSnow * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={noiseSnow}
              onChange={e => handleUpdate({ noiseSnow: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
              <span>Voltage / Luma Sag</span>
              <span>{Math.round(lumaSag * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={lumaSag}
              onChange={e => handleUpdate({ lumaSag: parseFloat(e.target.value) })}
              style={{ width: '100%', height: '4px' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
