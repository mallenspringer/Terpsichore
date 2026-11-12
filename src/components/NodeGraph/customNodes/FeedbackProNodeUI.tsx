import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import {
  FeedbackProEffect,
  FeedbackProBlendMode,
  FeedbackProProcessTarget
} from '../../../state/types';
import './FeedbackProNodeUI.css';

interface FeedbackProNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: FeedbackProEffect;
  rowCtx?: any;
}

export const FeedbackProNodeUI: React.FC<FeedbackProNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const updateEffect = useEngineStore(s => s.updateEffect);
  const [activeTab, setActiveTab] = useState<'vortex' | 'luma'>('vortex');

  const handleUpdate = (patch: Partial<FeedbackProEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const processTarget = effect.processTarget || 'canvas';
  const blendMode = effect.blendMode || 'screen';
  const isFrozen = !!effect.frozen;

  const gain = effect.gain ?? 0.95;
  const zoom = effect.zoom ?? 1.02;
  const rotation = effect.rotation ?? 0.5;
  const twist = effect.twist ?? 0.0;
  const driftX = effect.driftX ?? 0.0;
  const driftY = effect.driftY ?? 0.0;

  const lumaWarp = effect.lumaWarp ?? 0.2;
  const lumaTwist = effect.lumaTwist ?? 0.0;
  const rgbDispersion = effect.rgbDispersion ?? 0.005;
  const hueShift = effect.hueShift ?? 0.0;
  const softKnee = effect.softKnee ?? 0.4;
  const edgeRollOff = effect.edgeRollOff ?? 0.3;

  const handleClear = () => {
    handleUpdate({ clearTrigger: Date.now() });
  };

  const handleToggleFreeze = () => {
    handleUpdate({ frozen: !isFrozen });
  };

  return (
    <div
      className="feedback-pro-node-ui"
      onPointerDown={e => {
        if (
          !(
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLSelectElement ||
            e.target instanceof HTMLButtonElement
          )
        ) {
          e.stopPropagation();
        }
      }}
    >
      {/* Top Action Row: Clear & Freeze */}
      <div className="feedback-pro-action-row">
        <button
          className="feedback-pro-btn feedback-pro-btn-clear"
          onClick={handleClear}
          title="Instant flush of feedback accumulation buffer"
        >
          <span>✕ CLEAR LOOP</span>
        </button>
        <button
          className={`feedback-pro-btn feedback-pro-btn-freeze ${isFrozen ? 'active' : ''}`}
          onClick={handleToggleFreeze}
          title="Disconnect incoming video and let feedback loop recirculate purely"
        >
          <span>❄ {isFrozen ? 'FROZEN' : 'FREEZE'}</span>
        </button>
      </div>

      {/* Target Mode: Canvas vs Upstream Bounded */}
      <div className="feedback-pro-field">
        <div className="feedback-pro-label-row">
          <span className="feedback-pro-label">Process Target</span>
          <span
            className="feedback-pro-badge"
            style={{
              background: processTarget === 'upstream_bounded' ? '#005577' : '#2b2b2b',
              color: processTarget === 'upstream_bounded' ? '#88eeff' : '#aaa'
            }}
          >
            {processTarget === 'upstream_bounded' ? 'BOUNDED' : 'CANVAS'}
          </span>
        </div>
        <select
          className="feedback-pro-select"
          value={processTarget}
          onChange={e => handleUpdate({ processTarget: e.target.value as FeedbackProProcessTarget })}
        >
          <option value="canvas">Entire Canvas (Fullscreen)</option>
          <option value="upstream_bounded">Upstream Bounded (Alpha)</option>
        </select>
      </div>

      {/* Blend Mode */}
      <div className="feedback-pro-field">
        <span className="feedback-pro-label">Composite Blend Mode</span>
        <select
          className="feedback-pro-select"
          value={blendMode}
          onChange={e => handleUpdate({ blendMode: e.target.value as FeedbackProBlendMode })}
        >
          <option value="screen">Screen (Filmic Bloom)</option>
          <option value="add">Add (Luminous Overdrive)</option>
          <option value="normal">Normal (Alpha Over)</option>
          <option value="difference">Difference (Solarizing Inversion)</option>
          <option value="max">Max (Lighten Peak)</option>
        </select>
      </div>

      {/* Tabs */}
      <div className="feedback-pro-tabs">
        <button
          className={`feedback-pro-tab-btn ${activeTab === 'vortex' ? 'active' : ''}`}
          onClick={() => setActiveTab('vortex')}
        >
          VORTEX & MOTION
        </button>
        <button
          className={`feedback-pro-tab-btn ${activeTab === 'luma' ? 'active' : ''}`}
          onClick={() => setActiveTab('luma')}
        >
          LUMA WARP & OPTICS
        </button>
      </div>

      {/* Tab: Vortex & Motion */}
      {activeTab === 'vortex' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Feedback Gain</span>
              <span className="feedback-pro-val">{(gain * 100).toFixed(1)}%</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="0.0"
              max="1.15"
              step="0.01"
              value={gain}
              onChange={e => handleUpdate({ gain: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ gain: 0.95 })}
              title="Double-click to reset (95%)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Zoom Scale</span>
              <span className="feedback-pro-val">{zoom.toFixed(3)}x</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="0.80"
              max="1.25"
              step="0.005"
              value={zoom}
              onChange={e => handleUpdate({ zoom: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ zoom: 1.02 })}
              title="Double-click to reset (1.020x)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Rotation Spin</span>
              <span className="feedback-pro-val">
                {rotation > 0 ? `+${rotation.toFixed(2)}°` : `${rotation.toFixed(2)}°`}
              </span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="-15.0"
              max="15.0"
              step="0.25"
              value={rotation}
              onChange={e => handleUpdate({ rotation: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ rotation: 0.5 })}
              title="Double-click to reset (+0.50°)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Vortex Swirl (Twist)</span>
              <span className="feedback-pro-val">{twist > 0 ? `+${twist.toFixed(2)}` : twist.toFixed(2)}</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="-2.0"
              max="2.0"
              step="0.05"
              value={twist}
              onChange={e => handleUpdate({ twist: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ twist: 0.0 })}
              title="Double-click to reset (0.00)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Drift X</span>
              <span className="feedback-pro-val">{driftX > 0 ? `+${driftX.toFixed(3)}` : driftX.toFixed(3)}</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="-0.05"
              max="0.05"
              step="0.002"
              value={driftX}
              onChange={e => handleUpdate({ driftX: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ driftX: 0.0 })}
              title="Double-click to reset (0.000)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Drift Y</span>
              <span className="feedback-pro-val">{driftY > 0 ? `+${driftY.toFixed(3)}` : driftY.toFixed(3)}</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="-0.05"
              max="0.05"
              step="0.002"
              value={driftY}
              onChange={e => handleUpdate({ driftY: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ driftY: 0.0 })}
              title="Double-click to reset (0.000)"
            />
          </div>
        </div>
      )}

      {/* Tab: Luma Warp & Optics */}
      {activeTab === 'luma' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Luma Warp (Expansion)</span>
              <span className="feedback-pro-val">{lumaWarp > 0 ? `+${lumaWarp.toFixed(2)}` : lumaWarp.toFixed(2)}</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="-1.0"
              max="1.0"
              step="0.02"
              value={lumaWarp}
              onChange={e => handleUpdate({ lumaWarp: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ lumaWarp: 0.2 })}
              title="Double-click to reset (+0.20)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Luma Twist (Swirl)</span>
              <span className="feedback-pro-val">{lumaTwist > 0 ? `+${lumaTwist.toFixed(2)}` : lumaTwist.toFixed(2)}</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="-2.0"
              max="2.0"
              step="0.05"
              value={lumaTwist}
              onChange={e => handleUpdate({ lumaTwist: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ lumaTwist: 0.0 })}
              title="Double-click to reset (0.00)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">RGB Prism Dispersion</span>
              <span className="feedback-pro-val">{(rgbDispersion * 1000).toFixed(1)}‰</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="0.000"
              max="0.030"
              step="0.001"
              value={rgbDispersion}
              onChange={e => handleUpdate({ rgbDispersion: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ rgbDispersion: 0.005 })}
              title="Double-click to reset (0.005)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Hue Shift Cycling</span>
              <span className="feedback-pro-val">{Math.round(hueShift)}°</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="0"
              max="360"
              step="1"
              value={hueShift}
              onChange={e => handleUpdate({ hueShift: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ hueShift: 0 })}
              title="Double-click to reset (0°)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Soft-Knee Limiter</span>
              <span className="feedback-pro-val">{Math.round(softKnee * 100)}%</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="0.0"
              max="1.0"
              step="0.02"
              value={softKnee}
              onChange={e => handleUpdate({ softKnee: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ softKnee: 0.4 })}
              title="Double-click to reset (40% Soft Limiting)"
            />
          </div>

          <div className="feedback-pro-fader-row">
            <div className="feedback-pro-label-row">
              <span className="feedback-pro-label">Edge Roll-Off</span>
              <span className="feedback-pro-val">{Math.round(edgeRollOff * 100)}%</span>
            </div>
            <input
              type="range"
              className="feedback-pro-range"
              min="0.0"
              max="1.0"
              step="0.02"
              value={edgeRollOff}
              onChange={e => handleUpdate({ edgeRollOff: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ edgeRollOff: 0.3 })}
              title="Double-click to reset (30% Edge Damping)"
            />
          </div>
        </div>
      )}
    </div>
  );
};
