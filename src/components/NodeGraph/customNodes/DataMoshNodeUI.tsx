import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import {
  DataMoshEffect,
  DataMoshKeyframeMode,
  DataMoshProcessTarget
} from '../../../state/types';
import { DATAMOSH_DEFAULTS, formatHoldDuration } from '../../../utils/dataMoshUtils';
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

  const processTarget = effect.processTarget || DATAMOSH_DEFAULTS.processTarget;
  const keyframeMode = effect.keyframeMode || DATAMOSH_DEFAULTS.keyframeMode;

  const vectorGain = effect.vectorGain ?? DATAMOSH_DEFAULTS.vectorGain;
  const decay = effect.decay ?? DATAMOSH_DEFAULTS.decay;
  const macroblockSize = effect.macroblockSize ?? DATAMOSH_DEFAULTS.macroblockSize;
  const threshold = effect.threshold ?? DATAMOSH_DEFAULTS.threshold;
  const refreshThreshold = effect.refreshThreshold ?? DATAMOSH_DEFAULTS.refreshThreshold;

  const chromaBleed = effect.chromaBleed ?? DATAMOSH_DEFAULTS.chromaBleed;
  const biasX = effect.biasX ?? DATAMOSH_DEFAULTS.biasX;
  const biasY = effect.biasY ?? DATAMOSH_DEFAULTS.biasY;
  const noiseGlitch = effect.noiseGlitch ?? DATAMOSH_DEFAULTS.noiseGlitch;

  const keyframeRate = effect.keyframeRate ?? DATAMOSH_DEFAULTS.keyframeRate;
  const motionThreshold = effect.motionThreshold ?? DATAMOSH_DEFAULTS.motionThreshold;

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
              ? `${(1.0 / Math.max(0.01, keyframeRate)).toFixed(1)}s`
              : keyframeMode === 'motion_thresh'
                ? `CUT ${Math.round(motionThreshold * 100)}%`
                : 'MANUAL'}
          </span>
        </div>
        <select
          className="data-mosh-select"
          value={keyframeMode}
          onChange={e => handleUpdate({ keyframeMode: e.target.value as DataMoshKeyframeMode })}
        >
          <option value="motion_thresh">Motion Spike Detection</option>
          <option value="periodic">Periodic Auto-Reset</option>
          <option value="manual">Manual / Trigger Port Only</option>
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
            min="0.02"
            max="5.0"
            step="0.02"
            value={keyframeRate}
            onChange={e => handleUpdate({ keyframeRate: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ keyframeRate: DATAMOSH_DEFAULTS.keyframeRate })}
            title={`Double-click to reset (${DATAMOSH_DEFAULTS.keyframeRate.toFixed(2)} Hz)`}
          />
        </div>
      )}

      {keyframeMode === 'motion_thresh' && (
        <div className="data-mosh-fader-row">
          <div className="data-mosh-label-row">
            <span className="data-mosh-label">Scene Cut Thresh</span>
            <span className="data-mosh-val">{Math.round(motionThreshold * 100)}%</span>
          </div>
          <input
            type="range"
            className="data-mosh-range"
            min="0.10"
            max="1.00"
            step="0.01"
            value={motionThreshold}
            onChange={e => handleUpdate({ motionThreshold: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ motionThreshold: DATAMOSH_DEFAULTS.motionThreshold })}
            title={`Full-frame change threshold to trigger a full I-frame reset (Double-click to reset ${Math.round(DATAMOSH_DEFAULTS.motionThreshold * 100)}%)`}
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
              max="4.0"
              step="0.05"
              value={vectorGain}
              onChange={e => handleUpdate({ vectorGain: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ vectorGain: DATAMOSH_DEFAULTS.vectorGain })}
              title={`Double-click to reset (${DATAMOSH_DEFAULTS.vectorGain.toFixed(2)}x)`}
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Hold Duration</span>
              <span className="data-mosh-val">{formatHoldDuration(decay)}</span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.0"
              max="1.0"
              step="0.005"
              value={decay}
              onChange={e => handleUpdate({ decay: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ decay: DATAMOSH_DEFAULTS.decay })}
              title={`Perceptual hold duration before frozen pixels relax to live video (Double-click to reset ${formatHoldDuration(DATAMOSH_DEFAULTS.decay)} | max = ∞ HOLD)`}
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
              onDoubleClick={() => handleUpdate({ macroblockSize: DATAMOSH_DEFAULTS.macroblockSize })}
              title={`Double-click to reset (${DATAMOSH_DEFAULTS.macroblockSize} px)`}
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
              max="0.50"
              step="0.01"
              value={threshold}
              onChange={e => handleUpdate({ threshold: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ threshold: DATAMOSH_DEFAULTS.threshold })}
              title={`Minimum block motion to trigger vector drift (Double-click to reset ${Math.round(DATAMOSH_DEFAULTS.threshold * 100)}%)`}
            />
          </div>

          <div className="data-mosh-fader-row">
            <div className="data-mosh-label-row">
              <span className="data-mosh-label">Block Refresh</span>
              <span className="data-mosh-val">
                {refreshThreshold >= 0.995 ? 'OFF' : `${Math.round(refreshThreshold * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              className="data-mosh-range"
              min="0.05"
              max="1.00"
              step="0.01"
              value={refreshThreshold}
              onChange={e => handleUpdate({ refreshThreshold: parseFloat(e.target.value) })}
              onDoubleClick={() => handleUpdate({ refreshThreshold: DATAMOSH_DEFAULTS.refreshThreshold })}
              title={`Motion/residual threshold to re-drop fresh pixels into already-frozen blocks (Double-click to reset ${Math.round(DATAMOSH_DEFAULTS.refreshThreshold * 100)}% | max = OFF)`}
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
              onDoubleClick={() => handleUpdate({ chromaBleed: DATAMOSH_DEFAULTS.chromaBleed })}
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
              onDoubleClick={() => handleUpdate({ biasX: DATAMOSH_DEFAULTS.biasX })}
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
              onDoubleClick={() => handleUpdate({ biasY: DATAMOSH_DEFAULTS.biasY })}
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
              onDoubleClick={() => handleUpdate({ noiseGlitch: DATAMOSH_DEFAULTS.noiseGlitch })}
              title="Double-click to reset (0%)"
            />
          </div>
        </div>
      )}
    </div>
  );
};
