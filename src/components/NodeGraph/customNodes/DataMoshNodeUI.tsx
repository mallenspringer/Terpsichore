import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import {
  DataMoshEffect,
  DataMoshKeyframeMode,
  DataMoshProcessTarget
} from '../../../state/types';
import './DataMoshNodeUI.css';

interface DataMoshNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: DataMoshEffect;
  rowCtx?: any;
}

export const DataMoshNodeUI: React.FC<DataMoshNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const updateEffect = useEngineStore(s => s.updateEffect);
  const [activeTab, setActiveTab] = useState<'flow' | 'glitch'>('flow');

  const handleUpdate = (patch: Partial<DataMoshEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const processTarget = effect.processTarget || 'canvas';
  const keyframeMode = effect.keyframeMode || 'periodic';

  const vectorGain = effect.vectorGain ?? 1.2;
  const decay = effect.decay ?? 0.985;
  const macroblockSize = effect.macroblockSize ?? 16;
  const threshold = effect.threshold ?? 0.05;

  const chromaBleed = effect.chromaBleed ?? 0.3;
  const biasX = effect.biasX ?? 0.0;
  const biasY = effect.biasY ?? 0.0;
  const noiseGlitch = effect.noiseGlitch ?? 0.0;

  const keyframeRate = effect.keyframeRate ?? 0.5;

  const handleTriggerIFrame = () => {
    handleUpdate({ manualKeyframeTrigger: Date.now() });
  };

  return (
    <div
      className="data-mosh-node-ui"
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
      {/* Primary Drop I-Frame Trigger Button */}
      <button
        className="data-mosh-trigger-btn"
        onClick={handleTriggerIFrame}
        title="Immediately snapshot pristine frame & reset motion smear"
      >
        <span>⚡ DROP I-FRAME</span>
      </button>

      {/* Target Mode: Canvas vs Upstream Bounded */}
      <div className="data-mosh-field">
        <div className="data-mosh-label-row">
          <span className="data-mosh-label">Process Target</span>
          <span
            className="data-mosh-badge"
            style={{
              background: processTarget === 'upstream_bounded' ? '#770044' : '#2b2b2b',
              color: processTarget === 'upstream_bounded' ? '#ff99cc' : '#aaa'
            }}
          >
            {processTarget === 'upstream_bounded' ? 'BOUNDED' : 'CANVAS'}
          </span>
        </div>
        <select
          className="data-mosh-select"
          value={processTarget}
          onChange={e => handleUpdate({ processTarget: e.target.value as DataMoshProcessTarget })}
        >
          <option value="canvas">Entire Canvas (Fullscreen)</option>
          <option value="upstream_bounded">Upstream Bounded (Alpha)</option>
        </select>
      </div>

      {/* Keyframe Trigger Mode */}
      <div className="data-mosh-field">
        <div className="data-mosh-label-row">
          <span className="data-mosh-label">Keyframe Sync</span>
          <span className="data-mosh-val">
            {keyframeMode === 'periodic'
              ? `${(1.0 / Math.max(0.05, keyframeRate)).toFixed(1)}s`
              : keyframeMode.toUpperCase()}
          </span>
        </div>
        <select
          className="data-mosh-select"
          value={keyframeMode}
          onChange={e => handleUpdate({ keyframeMode: e.target.value as DataMoshKeyframeMode })}
        >
          <option value="periodic">Periodic Auto-Reset</option>
          <option value="manual">Manual / Trigger Port Only</option>
          <option value="motion_thresh">Motion Spike Detection</option>
        </select>
      </div>

      {keyframeMode === 'periodic' && (
        <div className="data-mosh-fader-row">
          <div className="data-mosh-label-row">
            <span className="data-mosh-label">Auto Keyframe Rate</span>
            <span className="data-mosh-val">{keyframeRate.toFixed(2)} Hz</span>
          </div>
          <input
            type="range"
            className="data-mosh-range"
            min="0.1"
            max="4.0"
            step="0.05"
            value={keyframeRate}
            onChange={e => handleUpdate({ keyframeRate: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ keyframeRate: 0.5 })}
            title="Double-click to reset (0.50 Hz = 2 sec)"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="data-mosh-tabs">
        <button
          className={`data-mosh-tab-btn ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          MOSH & FLOW
        </button>
        <button
          className={`data-mosh-tab-btn ${activeTab === 'glitch' ? 'active' : ''}`}
          onClick={() => setActiveTab('glitch')}
        >
          GLITCH & BITROT
        </button>
      </div>

      {/* Tab: Motion & Flow */}
      {activeTab === 'flow' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Vector Gain</span>
              <span className="data-mosh-val">{vectorGain.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.0"
              max="3.0"
              step="0.05"
              value={vectorGain}
              onChange={e => handleUpdate({ vectorGain: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ vectorGain: 1.2 })}
              title="Double-click to reset (1.20x)"
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Smear Decay</span>
              <span className="data-mosh-val">{(decay * 100).toFixed(1)}%</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.80"
              max="0.999"
              step="0.001"
              value={decay}
              onChange={e => handleUpdate({ decay: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ decay: 0.985 })}
              title="Double-click to reset (98.5%)"
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Macroblock Size</span>
              <span className="data-mosh-val">{Math.round(macroblockSize)} px</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="1"
              max="64"
              step="1"
              value={macroblockSize}
              onChange={e => handleUpdate({ macroblockSize: parseInt(e.target.value, 10) })}
              onDoubleClick={() => handleUpdate({ macroblockSize: 16 })}
              title="Double-click to reset (16 px)"
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Motion Floor</span>
              <span className="data-mosh-val">{Math.round(threshold * 100)}%</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.0"
              max="0.3"
              step="0.01"
              value={threshold}
              onChange={e => handleUpdate({ threshold: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ threshold: 0.05 })}
              title="Double-click to reset (5%)"
            />
          </div>
        </div>
      )}

      {/* Tab: Glitch & Bitrot */}
      {activeTab === 'glitch' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', width: '100%' }}>
          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Chroma Bleed</span>
              <span className="data-mosh-val">{Math.round(chromaBleed * 100)}%</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={chromaBleed}
              onChange={e => handleUpdate({ chromaBleed: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ chromaBleed: 0.3 })}
              title="Double-click to reset (30%)"
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Vector Bias X</span>
              <span className="data-mosh-val">{biasX > 0 ? `+${biasX.toFixed(2)}` : biasX.toFixed(2)}</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="-1.0"
              max="1.0"
              step="0.02"
              value={biasX}
              onChange={e => handleUpdate({ biasX: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ biasX: 0.0 })}
              title="Double-click to reset (0.00)"
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Vector Bias Y</span>
              <span className="data-mosh-val">{biasY > 0 ? `+${biasY.toFixed(2)}` : biasY.toFixed(2)}</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="-1.0"
              max="1.0"
              step="0.02"
              value={biasY}
              onChange={e => handleUpdate({ biasY: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ biasY: 0.0 })}
              title="Double-click to reset (0.00)"
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Bitrot Noise</span>
              <span className="data-mosh-val">{Math.round(noiseGlitch * 100)}%</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.0"
              max="1.0"
              step="0.01"
              value={noiseGlitch}
              onChange={e => handleUpdate({ noiseGlitch: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ noiseGlitch: 0.0 })}
              title="Double-click to reset (0%)"
            />
          </div>
        </div>
      )}
    </div>
  );
};

