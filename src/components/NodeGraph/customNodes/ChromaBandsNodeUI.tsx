import React from 'react';
import { useEngineStore } from '../../../state/store';
import { ChromaBandsEffect, ChromaBand } from '../../../state/types';
import { DEFAULT_CHROMA_PALETTE, autoDistributeChromaThresholds, cascadeChromaThresholds } from '../../../state/moduleFactory';
import './ChromaBandsNodeUI.css';

interface ChromaBandsNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: ChromaBandsEffect;
  rowCtx?: any;
}

function rgbaToHex(c: [number, number, number, number] | undefined, fallback = '#ffffff'): string {
  if (!c) return fallback;
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}`;
}

function hexToRgba(hex: string, currentAlpha = 1.0): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number.isNaN(r) ? 1 : r, Number.isNaN(g) ? 1 : g, Number.isNaN(b) ? 1 : b, currentAlpha];
}

export const ChromaBandsNodeUI: React.FC<ChromaBandsNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const updateEffect = useEngineStore(s => s.updateEffect);
  const layer = useEngineStore(s => s.layers[layerId]);

  const handleUpdate = (patch: Partial<ChromaBandsEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const bands = effect.bands || [
    { id: 'cb-0', threshold: 180, color: DEFAULT_CHROMA_PALETTE[0] },
    { id: 'cb-1', threshold: 360, color: DEFAULT_CHROMA_PALETTE[5] }
  ];

  const hasPaletteIn = layer?.graph?.edges?.some(e => e.toNodeId === nodeId && e.toPort === 'palette_in') ?? false;

  const handleAutoDistribute = () => {
    const autoThresh = autoDistributeChromaThresholds(bands.length);
    const updated = bands.map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: updated });
  };

  const handleAddBand = () => {
    if (bands.length >= 8) return;
    const newCount = bands.length + 1;
    const autoThresh = autoDistributeChromaThresholds(newCount);
    const newBandColor = DEFAULT_CHROMA_PALETTE[newCount - 1] ?? [0.95, 0.95, 0.95, 1.0];
    const newBand: ChromaBand = {
      id: `cb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      threshold: 360,
      color: newBandColor
    };

    const nextBands = [...bands, newBand].map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: nextBands });
  };

  const handleDeleteBand = (indexToDelete: number) => {
    if (bands.length <= 2) return;
    const filtered = bands.filter((_, idx) => idx !== indexToDelete);
    const autoThresh = autoDistributeChromaThresholds(filtered.length);
    const updated = filtered.map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: updated });
  };

  const handleThresholdChange = (index: number, newThreshold: number) => {
    const updated = cascadeChromaThresholds(bands, index, newThreshold);
    handleUpdate({ bands: updated });
  };

  const handleBandColorChange = (index: number, hex: string) => {
    const currentAlpha = bands[index].color?.[3] ?? 1.0;
    const newColor = hexToRgba(hex, currentAlpha);
    const updated = bands.map((b, idx) => {
      if (idx === index) {
        return { ...b, color: newColor };
      }
      return b;
    });
    handleUpdate({ bands: updated });
  };

  return (
    <div className="chromabands-node-ui nodrag">
      {/* Top Header: Layers Count, Auto, and Add */}
      <div className="cb-header-row">
        <div className="cb-title-group">
          <span>🎨 CHROMA ({bands.length}/8)</span>
        </div>
        <div className="cb-btn-group">
          <button
            type="button"
            className="cb-btn"
            onClick={handleAutoDistribute}
            title="Evenly distribute hue sectors across 0..360°"
          >
            🪄 Auto
          </button>
          <button
            type="button"
            className="cb-btn"
            disabled={bands.length >= 8}
            onClick={handleAddBand}
            title="Add a new chromatic band (up to 8 max)"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Stacked Band Cards (Rendered Top/High Hue to Bottom/Base) */}
      <div className="cb-bands-list">
        {bands
          .map((band, idx) => ({ band, idx }))
          .reverse()
          .map(({ band, idx }) => {
            const isTop = idx === bands.length - 1;
            const isBase = idx === 0;

            const minHue = isBase ? 0 : (bands[idx - 1]?.threshold ?? 0) + 1;
            const maxHue = isTop ? 360 : band.threshold;

            return (
              <div key={band.id || `cb-${idx}`} className="cb-band-card">
                <div className="cb-band-card-header">
                  <div className="cb-band-title-left">
                    <input
                      type="color"
                      className="cb-color-picker"
                      value={rgbaToHex(band.color)}
                      onChange={e => handleBandColorChange(idx, e.target.value)}
                      title={`Band ${idx + 1} Color Swatch`}
                    />
                    <span className="cb-band-name">
                      Layer {idx + 1}
                      {isTop && <span className="cb-band-badge">(Top)</span>}
                      {isBase && <span className="cb-band-badge">(Base)</span>}
                    </span>
                    <span className="cb-band-range">
                      Hue: {minHue}° → {maxHue}°
                    </span>
                  </div>

                  <button
                    type="button"
                    className="cb-delete-btn"
                    disabled={bands.length <= 2}
                    onClick={() => handleDeleteBand(idx)}
                    title={bands.length <= 2 ? 'Minimum 2 bands required' : `Delete Layer ${idx + 1}`}
                  >
                    🗑️
                  </button>
                </div>

                {/* Ceiling Threshold Slider (Cascading waterfall across 0..360°) */}
                <div className="cb-slider-row">
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={isTop ? 360 : band.threshold}
                    disabled={isTop}
                    onChange={e => !isTop && handleThresholdChange(idx, parseInt(e.target.value, 10))}
                    onDoubleClick={() => {
                      if (!isTop) {
                        const autoThresh = autoDistributeChromaThresholds(bands.length);
                        handleThresholdChange(idx, autoThresh[idx]);
                      }
                    }}
                    title={isTop ? "Fixed upper ceiling (360°)" : "Adjust hue sector ceiling (Double-click to reset to auto)"}
                    className={isTop ? "cb-slider-disabled" : undefined}
                  />
                  <span className="cb-val-badge">{isTop ? 360 : band.threshold}°</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Color Tuning, Sensitivity & Smoothing */}
      <div className="cb-section-panel">
        {/* Chroma Sensitivity / Saturation Expansion */}
        <div className="cb-section-title">
          <span>Chroma Sensitivity</span>
          <span className="cb-val-badge">{(effect.chromaSensitivity ?? 1.5).toFixed(1)}x</span>
        </div>
        <div className="cb-slider-row">
          <input
            type="range"
            min={0.5}
            max={5.0}
            step={0.1}
            value={effect.chromaSensitivity ?? 1.5}
            onChange={e => handleUpdate({ chromaSensitivity: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ chromaSensitivity: 1.5 })}
            title="Color range expander: Boosts subtle hues in washed-out video (Double-click to reset to 1.5x)"
          />
        </div>

        {/* Global Hue Rotation */}
        <div className="cb-section-title" style={{ marginTop: 4 }}>
          <span>Hue Rotation</span>
          <span className="cb-val-badge">{Math.round(effect.hueShift ?? 0)}°</span>
        </div>
        <div className="cb-slider-row">
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={effect.hueShift ?? 0}
            onChange={e => handleUpdate({ hueShift: parseInt(e.target.value, 10) })}
            onDoubleClick={() => handleUpdate({ hueShift: 0 })}
            title="Rotates color wheel to align video colors with target swatches (Double-click to reset to 0°)"
          />
        </div>

        {/* Chroma Gate */}
        <div className="cb-section-title" style={{ marginTop: 4 }}>
          <span>Chroma Gate (Min Saturation)</span>
          <span className="cb-val-badge">{((effect.chromaGate ?? 0.02) * 100).toFixed(1)}%</span>
        </div>
        <div className="cb-slider-row">
          <input
            type="range"
            min={0}
            max={0.25}
            step={0.005}
            value={effect.chromaGate ?? 0.02}
            onChange={e => handleUpdate({ chromaGate: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ chromaGate: 0.02 })}
            title="Noise floor: Desaturated pixels below threshold map to Base Layer (Double-click to reset to 2%)"
          />
        </div>

        {/* Cel Swathe Smoothing */}
        <div className="cb-section-title" style={{ marginTop: 4 }}>
          <span>Cel Swathe Smoothing</span>
          <span className="cb-val-badge">{Math.round((effect.spatialSmoothing ?? 0.35) * 100)}%</span>
        </div>
        <div className="cb-slider-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={effect.spatialSmoothing ?? 0.35}
            onChange={e => handleUpdate({ spatialSmoothing: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ spatialSmoothing: 0.35 })}
            title="Bilateral edge-preserving chroma filter radius (Double-click to reset to 35%)"
          />
        </div>

        {hasPaletteIn && (
          <div className="cb-subrow" style={{ marginTop: 2 }}>
            <label>
              <input
                type="checkbox"
                checked={effect.usePaletteIn !== false}
                onChange={e => handleUpdate({ usePaletteIn: e.target.checked })}
              />
              <span>Use Palette In</span>
            </label>
          </div>
        )}
      </div>

      {/* Ink Boundary Outlines */}
      <div className="cb-section-panel">
        <div className="cb-section-title">
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={effect.outlineEnabled !== false}
              onChange={e => handleUpdate({ outlineEnabled: e.target.checked })}
            />
            <span>Ink Outline</span>
          </label>
          <input
            type="color"
            className="cb-color-picker"
            value={rgbaToHex(effect.outlineColor ?? [0, 0, 0, 1])}
            disabled={effect.outlineEnabled === false}
            onChange={e => {
              const currentAlpha = effect.outlineColor?.[3] ?? 1.0;
              handleUpdate({ outlineColor: hexToRgba(e.target.value, currentAlpha) });
            }}
            title="Outline Ink Color"
          />
        </div>

        {effect.outlineEnabled !== false && (
          <>
            <div className="cb-subrow">
              <label>Width</label>
              <div className="cb-slider-row" style={{ flex: 1 }}>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={effect.outlineWidth ?? 2}
                  onChange={e => handleUpdate({ outlineWidth: parseFloat(e.target.value) })}
                  onDoubleClick={() => handleUpdate({ outlineWidth: 2 })}
                  title="Outline Width (Double-click to reset to 2px)"
                />
                <span className="cb-val-badge">{(effect.outlineWidth ?? 2).toFixed(1)}px</span>
              </div>
            </div>

            <div className="cb-subrow">
              <label>Opacity</label>
              <div className="cb-slider-row" style={{ flex: 1 }}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={effect.outlineOpacity ?? 1}
                  onChange={e => handleUpdate({ outlineOpacity: parseFloat(e.target.value) })}
                  onDoubleClick={() => handleUpdate({ outlineOpacity: 1.0 })}
                  title="Outline Opacity (Double-click to reset to 100%)"
                />
                <span className="cb-val-badge">{Math.round((effect.outlineOpacity ?? 1) * 100)}%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

