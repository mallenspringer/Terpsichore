import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import {
  BadAnalogEffect,
  BadAnalogDisplayMode,
  BadAnalogProcessTarget,
  BadAnalogPhosphorType
} from '../../../state/types';
import './BadAnalogNodeUI.css';

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
      className="bad-analog-node-ui"
      onPointerDown={e => {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
          e.stopPropagation();
        }
      }}
    >
      {/* Target Mode: Canvas vs Upstream Bounded */}
      <div className="bad-analog-field">
        <div className="bad-analog-label-row">
          <span className="bad-analog-label">Process Target</span>
          <span
            className="bad-analog-badge"
            style={{
              background: processTarget === 'upstream_bounded' ? '#0077aa' : '#2b2b2b',
              color: processTarget === 'upstream_bounded' ? '#fff' : '#aaa'
            }}
          >
            {processTarget === 'upstream_bounded' ? 'BOUNDED' : 'CANVAS'}
          </span>
        </div>
        <select
          className="bad-analog-select"
          value={processTarget}
          onChange={e => handleUpdate({ processTarget: e.target.value as BadAnalogProcessTarget })}
        >
          <option value="canvas">Entire Canvas (Fullscreen)</option>
          <option value="upstream_bounded">Upstream Bounded (Alpha)</option>
        </select>
      </div>

      {/* Display Mode */}
      <div className="bad-analog-field">
        <span className="bad-analog-label">Display Type</span>
        <select
          className="bad-analog-select"
          value={displayMode}
          onChange={e => handleUpdate({ displayMode: e.target.value as BadAnalogDisplayMode })}
        >
          <option value="crt">CRT Monitor (Scanlines & Triads)</option>
          <option value="vector">Vector Display (Beam Bloom)</option>
          <option value="monochrome">Monochrome Phosphor (P1/P3/P4)</option>
          <option value="matrix_lcd">Retro Matrix (VFD / LCD)</option>
        </select>
      </div>

      {/* Phosphor Chemistry (when Monochrome is active) */}
      {displayMode === 'monochrome' && (
        <div className="bad-analog-field">
          <span className="bad-analog-label">Phosphor Chemistry</span>
          <select
            className="bad-analog-select"
            value={phosphorType}
            onChange={e => handleUpdate({ phosphorType: e.target.value as BadAnalogPhosphorType })}
            style={{
              color: phosphorType === 'p1_green' ? '#00ff66' : phosphorType === 'p3_amber' ? '#ffaa00' : '#ffffff',
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
      <div className="bad-analog-tabs">
        <button
          type="button"
          className={`bad-analog-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
          onClick={() => setActiveTab('display')}
        >
          OPTICS & CRT
        </button>
        <button
          type="button"
          className={`bad-analog-tab-btn ${activeTab === 'glitch' ? 'active' : ''}`}
          onClick={() => setActiveTab('glitch')}
        >
          GLITCH & VHS
        </button>
      </div>

      {/* Tab 1: Optics & CRT Parameters */}
      {activeTab === 'display' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          {displayMode === 'vector' ? (
            <>
              <div className="bad-analog-fader-row">
                <div className="bad-analog-label-row">
                  <span className="bad-analog-label">Beam Glow</span>
                  <span className="bad-analog-val">{Math.round(vectorGlow * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="bad-analog-range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={vectorGlow}
                  onChange={e => handleUpdate({ vectorGlow: parseFloat(e.target.value) })}
                  onDoubleClick={() => handleUpdate({ vectorGlow: 0.6 })}
                  title="Double-click to reset"
                />
              </div>
              <div className="bad-analog-fader-row">
                <div className="bad-analog-label-row">
                  <span className="bad-analog-label">Beam Overdrive</span>
                  <span className="bad-analog-val">{vectorIntensity.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  className="bad-analog-range"
                  min="0.5"
                  max="3.0"
                  step="0.05"
                  value={vectorIntensity}
                  onChange={e => handleUpdate({ vectorIntensity: parseFloat(e.target.value) })}
                  onDoubleClick={() => handleUpdate({ vectorIntensity: 1.5 })}
                  title="Double-click to reset"
                />
              </div>
            </>
          ) : (
            <>
              {processTarget === 'canvas' && (
                <>
                  <div className="bad-analog-fader-row">
                    <div className="bad-analog-label-row">
                      <span className="bad-analog-label">Curvature</span>
                      <span className="bad-analog-val">{Math.round(curvature * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="bad-analog-range"
                      min="0"
                      max="0.6"
                      step="0.01"
                      value={curvature}
                      onChange={e => handleUpdate({ curvature: parseFloat(e.target.value) })}
                      onDoubleClick={() => handleUpdate({ curvature: 0.15 })}
                      title="Double-click to reset"
                    />
                  </div>
                  <div className="bad-analog-fader-row">
                    <div className="bad-analog-label-row">
                      <span className="bad-analog-label">Vignette</span>
                      <span className="bad-analog-val">{Math.round(vignette * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="bad-analog-range"
                      min="0"
                      max="0.8"
                      step="0.01"
                      value={vignette}
                      onChange={e => handleUpdate({ vignette: parseFloat(e.target.value) })}
                      onDoubleClick={() => handleUpdate({ vignette: 0.25 })}
                      title="Double-click to reset"
                    />
                  </div>
                </>
              )}

              <div className="bad-analog-fader-row">
                <div className="bad-analog-label-row">
                  <span className="bad-analog-label">Scanline Depth</span>
                  <span className="bad-analog-val">{Math.round(scanlines * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="bad-analog-range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scanlines}
                  onChange={e => handleUpdate({ scanlines: parseFloat(e.target.value) })}
                  onDoubleClick={() => handleUpdate({ scanlines: 0.5 })}
                  title="Double-click to reset"
                />
              </div>

              <div className="bad-analog-fader-row">
                <div className="bad-analog-label-row">
                  <span className="bad-analog-label">Raster Lines</span>
                  <span className="bad-analog-val">{scanlineCount}p</span>
                </div>
                <input
                  type="range"
                  className="bad-analog-range"
                  min="120"
                  max="480"
                  step="20"
                  value={scanlineCount}
                  onChange={e => handleUpdate({ scanlineCount: parseInt(e.target.value) })}
                  onDoubleClick={() => handleUpdate({ scanlineCount: 240 })}
                  title="Double-click to reset"
                />
              </div>

              {displayMode === 'crt' && (
                <>
                  <div className="bad-analog-fader-row">
                    <div className="bad-analog-label-row">
                      <span className="bad-analog-label">Phosphor Triads</span>
                      <span className="bad-analog-val">{Math.round(phosphorMask * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      className="bad-analog-range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={phosphorMask}
                      onChange={e => handleUpdate({ phosphorMask: parseFloat(e.target.value) })}
                      onDoubleClick={() => handleUpdate({ phosphorMask: 0.35 })}
                      title="Double-click to reset"
                    />
                  </div>
                  <div className="bad-analog-fader-row">
                    <div className="bad-analog-label-row">
                      <span className="bad-analog-label">Mask Gain</span>
                      <span className="bad-analog-val">{maskBrightness.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      className="bad-analog-range"
                      min="0.5"
                      max="1.8"
                      step="0.02"
                      value={maskBrightness}
                      onChange={e => handleUpdate({ maskBrightness: parseFloat(e.target.value) })}
                      onDoubleClick={() => handleUpdate({ maskBrightness: 1.15 })}
                      title="Double-click to reset"
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">H-Sync Jitter</span>
              <span className="bad-analog-val">{Math.round(jitter * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={jitter}
              onChange={e => handleUpdate({ jitter: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ jitter: 0.08 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">NTSC Chroma Bleed</span>
              <span className="bad-analog-val">{Math.round(chromaBleed * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={chromaBleed}
              onChange={e => handleUpdate({ chromaBleed: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ chromaBleed: 0.35 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">Tracking Skew</span>
              <span className="bad-analog-val">{Math.round(vhsTracking * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={vhsTracking}
              onChange={e => handleUpdate({ vhsTracking: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ vhsTracking: 0.0 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">Head-Switch Noise</span>
              <span className="bad-analog-val">{Math.round(headSwitching * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={headSwitching}
              onChange={e => handleUpdate({ headSwitching: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ headSwitching: 0.0 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">60Hz Hum Bar</span>
              <span className="bad-analog-val">{Math.round(humBar * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={humBar}
              onChange={e => handleUpdate({ humBar: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ humBar: 0.0 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">Hum Roll Speed</span>
              <span className="bad-analog-val">{humBarSpeed >= 0 ? `+${humBarSpeed.toFixed(1)}x` : `${humBarSpeed.toFixed(1)}x`}</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="-2"
              max="2"
              step="0.1"
              value={humBarSpeed}
              onChange={e => handleUpdate({ humBarSpeed: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ humBarSpeed: 0.5 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">RF Noise Snow</span>
              <span className="bad-analog-val">{Math.round(noiseSnow * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={noiseSnow}
              onChange={e => handleUpdate({ noiseSnow: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ noiseSnow: 0.05 })}
              title="Double-click to reset"
            />
          </div>

          <div className="bad-analog-fader-row">
            <div className="bad-analog-label-row">
              <span className="bad-analog-label">Voltage / Luma Sag</span>
              <span className="bad-analog-val">{Math.round(lumaSag * 100)}%</span>
            </div>
            <input
              type="range"
              className="bad-analog-range"
              min="0"
              max="1"
              step="0.01"
              value={lumaSag}
              onChange={e => handleUpdate({ lumaSag: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ lumaSag: 0.0 })}
              title="Double-click to reset"
            />
          </div>
        </div>
      )}
    </div>
  );
};
