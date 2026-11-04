import React from 'react';
import { useEngineStore } from '../../../state/store';
import { LumaBandsEffect, LumaBand } from '../../../state/types';
import { DEFAULT_LUMA_PALETTE, autoDistributeLumaThresholds, cascadeLumaThresholds } from '../../../state/moduleFactory';
import './LumaBandsNodeUI.css';

interface LumaBandsNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: LumaBandsEffect;
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

export const LumaBandsNodeUI: React.FC<LumaBandsNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const updateEffect = useEngineStore(s => s.updateEffect);
  const layer = useEngineStore(s => s.layers[layerId]);

  const handleUpdate = (patch: Partial<LumaBandsEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const bands = effect.bands || [
    { id: 'b-0', threshold: 127, color: DEFAULT_LUMA_PALETTE[0] },
    { id: 'b-1', threshold: 255, color: DEFAULT_LUMA_PALETTE[7] }
  ];

  const hasPaletteIn = layer?.graph?.edges?.some(e => e.toNodeId === nodeId && e.toPort === 'palette_in') ?? false;

  const handleAutoDistribute = () => {
    const autoThresh = autoDistributeLumaThresholds(bands.length);
    const updated = bands.map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: updated });
  };

  const handleAddBand = () => {
    if (bands.length >= 8) return;
    const newCount = bands.length + 1;
    const autoThresh = autoDistributeLumaThresholds(newCount);
    const newBandColor = DEFAULT_LUMA_PALETTE[newCount - 1] ?? [0.95, 0.95, 0.95, 1.0];
    const newBand: LumaBand = {
      id: `b-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      threshold: 255,
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
    const autoThresh = autoDistributeLumaThresholds(filtered.length);
    const updated = filtered.map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: updated });
  };

  const handleThresholdChange = (index: number, newThreshold: number) => {
    const updated = cascadeLumaThresholds(bands, index, newThreshold);
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
    <div className="lumabands-node-ui nodrag">
      {/* Top Header: Layers Count, Auto, and Add */}
      <div className="lb-header-row">
        <div className="lb-title-group">
          <span>🥞 LAYERS ({bands.length}/8)</span>
        </div>
        <div className="lb-btn-group">
          <button
            type="button"
            className="lb-btn"
            onClick={handleAutoDistribute}
            title="Evenly auto-distribute all thresholds across 0..255"
          >
            🪄 Auto
          </button>
          <button
            type="button"
            className="lb-btn"
            disabled={bands.length >= 8}
            onClick={handleAddBand}
            title="Add a new luminance band (up to 8 max)"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Stacked Band Cards (Rendered Top/Brightest to Bottom/Darkest) */}
      <div className="lb-bands-list">
        {bands
          .map((band, idx) => ({ band, idx }))
          .reverse()
          .map(({ band, idx }) => {
            const isTop = idx === bands.length - 1;
            const isBase = idx === 0;

            const minLuma = isBase ? 0 : (bands[idx - 1]?.threshold ?? 0) + 1;
            const maxLuma = isTop ? 255 : band.threshold;



            return (
              <div key={band.id || `b-${idx}`} className="lb-band-card">
                <div className="lb-band-card-header">
                  <div className="lb-band-title-left">
                    <input
                      type="color"
                      className="lb-color-picker"
                      value={rgbaToHex(band.color)}
                      onChange={e => handleBandColorChange(idx, e.target.value)}
                      title={`Band ${idx + 1} Color Swatch`}
                    />
                    <span className="lb-band-name">
                      Layer {idx + 1}
                      {isTop && <span className="lb-band-badge">(Top)</span>}
                      {isBase && <span className="lb-band-badge">(Base)</span>}
                    </span>
                    <span className="lb-band-range">
                      Luma: {minLuma} → {maxLuma}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="lb-delete-btn"
                    disabled={bands.length <= 2}
                    onClick={() => handleDeleteBand(idx)}
                    title={bands.length <= 2 ? 'Minimum 2 bands required' : `Delete Layer ${idx + 1}`}
                  >
                    🗑️
                  </button>
                </div>

                {/* Ceiling Threshold Slider (Cascading waterfall across 0..255) */}
                <div className="lb-slider-row">
                  <input
                    type="range"
                    min={0}
                    max={255}
                    step={1}
                    value={isTop ? 255 : band.threshold}
                    disabled={isTop}
                    onChange={e => !isTop && handleThresholdChange(idx, parseInt(e.target.value, 10))}
                    onDoubleClick={() => {
                      if (!isTop) {
                        const autoThresh = autoDistributeLumaThresholds(bands.length);
                        handleThresholdChange(idx, autoThresh[idx]);
                      }
                    }}
                    title={isTop ? "Fixed upper ceiling (255)" : "Adjust layer ceiling (Double-click to reset to auto)"}
                    className={isTop ? "lb-slider-disabled" : undefined}
                  />
                  <span className="lb-val-badge">{isTop ? 255 : band.threshold}</span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Cel Shading & Spatial Smoothing */}
      <div className="lb-section-panel">
        <div className="lb-section-title">
          <span>Cel Swathe Smoothing</span>
          <span className="lb-val-badge">{Math.round((effect.spatialSmoothing ?? 0.35) * 100)}%</span>
        </div>
        <div className="lb-slider-row">
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={effect.spatialSmoothing ?? 0.35}
            onChange={e => handleUpdate({ spatialSmoothing: parseFloat(e.target.value) })}
            onDoubleClick={() => handleUpdate({ spatialSmoothing: 0.35 })}
            title="Bilateral edge-preserving filter radius (Double-click to reset to 35%)"
          />
        </div>

        {hasPaletteIn && (
          <div className="lb-subrow" style={{ marginTop: 2 }}>
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
      <div className="lb-section-panel">
        <div className="lb-section-title">
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
            className="lb-color-picker"
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
            <div className="lb-subrow">
              <label>Width</label>
              <div className="lb-slider-row" style={{ flex: 1 }}>
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
                <span className="lb-val-badge">{(effect.outlineWidth ?? 2).toFixed(1)}px</span>
              </div>
            </div>

            <div className="lb-subrow">
              <label>Opacity</label>
              <div className="lb-slider-row" style={{ flex: 1 }}>
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
                <span className="lb-val-badge">{Math.round((effect.outlineOpacity ?? 1) * 100)}%</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

