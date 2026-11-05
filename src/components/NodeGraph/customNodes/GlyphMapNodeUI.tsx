import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import { GlyphMapEffect, GlyphBand, GlyphTemplatePack, TextCueSource } from '../../../state/types';
import {
  DEFAULT_LUMA_PALETTE,
  DEFAULT_CHROMA_PALETTE,
  GLYPH_TEMPLATE_PACKS,
  autoDistributeLumaThresholds,
  autoDistributeChromaThresholds,
  cascadeLumaThresholds,
  cascadeChromaThresholds
} from '../../../state/moduleFactory';
import { GlyphMapModal } from './GlyphMapModal';
import './GlyphMapNodeUI.css';

interface GlyphMapNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: GlyphMapEffect;
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

export const GlyphMapNodeUI: React.FC<GlyphMapNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const [showStudio, setShowStudio] = useState(false);
  const updateEffect = useEngineStore(s => s.updateEffect);
  const updateLayer = useEngineStore(s => s.updateLayer);
  const layer = useEngineStore(s => s.layers[layerId]);

  const handleUpdate = (patch: Partial<GlyphMapEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const bands = effect.bands || [
    { id: 'gb-0', threshold: 127, color: DEFAULT_LUMA_PALETTE[0], glyphText: '.' },
    { id: 'gb-1', threshold: 255, color: DEFAULT_LUMA_PALETTE[7], glyphText: '#' }
  ];

  // Upstream detection: video_in from LumaBands or ChromaBands, OR bands_in
  const videoInEdge = layer?.graph?.edges?.find(e => e.toNodeId === nodeId && e.toPort === 'video_in');
  const upstreamEffect = videoInEdge ? layer?.effects?.find(e => e.id === videoInEdge.fromNodeId) : null;
  const isUpstreamBands = upstreamEffect?.type === 'LumaBands' || upstreamEffect?.type === 'ChromaBands';
  const hasBandsInEdge = layer?.graph?.edges?.some(e => e.toNodeId === nodeId && e.toPort === 'bands_in') ?? false;
  const hasBandsIn = isUpstreamBands || hasBandsInEdge;
  const upstreamType = upstreamEffect?.type || (hasBandsInEdge ? 'Bands' : null);

  // Palette In detection
  const hasPaletteIn = layer?.graph?.edges?.some(e => e.toNodeId === nodeId && e.toPort === 'palette_in') ?? false;

  // TextCue upstream detection
  const textInEdge = layer?.graph?.edges?.find(e => e.toNodeId === nodeId && e.toPort === 'text_in');
  let textCueSrc: TextCueSource | null = null;
  let textCueNodeId: string | null = null;

  if (textInEdge) {
    if (textInEdge.fromNodeId === 'source' && layer?.source?.type === 'TextCue') {
      textCueSrc = layer.source as TextCueSource;
      textCueNodeId = 'source';
    } else {
      const fe = layer?.effects?.find(e => e.id === textInEdge.fromNodeId);
      if (fe && fe.type === 'TextCue') {
        textCueSrc = fe as unknown as TextCueSource;
        textCueNodeId = textInEdge.fromNodeId;
      }
    }
  } else if (layer?.source?.type === 'TextCue') {
    textCueSrc = layer.source as TextCueSource;
    textCueNodeId = 'source';
  }

  const isTextBankLinked = !!textCueSrc;
  const activeBankIdx = textCueSrc?.activeBankIndex ?? 0;
  const activeBank = textCueSrc?.banks?.[activeBankIdx];

  const handleStepBank = () => {
    if (!textCueSrc || !textCueNodeId) return;
    const banks = textCueSrc.banks || [];
    if (banks.length === 0) return;
    const maxBanks = textCueSrc.bankGridMode === '24' ? 24 : textCueSrc.bankGridMode === '16' ? 16 : 8;
    const nextBankIdx = (activeBankIdx + 1) % maxBanks;
    const nextBank = banks[nextBankIdx];
    const nextText = nextBank?.cards?.[nextBank?.activeCardIndex ?? 0]?.text ?? '';

    const updates: Partial<TextCueSource> = {
      activeBankIndex: nextBankIdx,
      prevText: textCueSrc.currentText ?? '',
      currentText: nextText,
      lastStepTime: Date.now(),
      stepCount: (textCueSrc.stepCount ?? 0) + 1
    };

    if (textCueNodeId === 'source' && layer?.source) {
      updateLayer(layerId, { source: { ...(layer.source as any), ...updates } });
    } else if (textCueNodeId) {
      updateEffect(layerId, textCueNodeId, updates as any);
    }
  };

  const handleAutoDistribute = () => {
    if (hasBandsIn) return;
    const isChroma = effect.mapMode === 'chroma';
    const autoThresh = isChroma ? autoDistributeChromaThresholds(bands.length) : autoDistributeLumaThresholds(bands.length);
    const updated = bands.map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: updated });
  };

  const handleAddBand = () => {
    if (bands.length >= 8) return;
    const newCount = bands.length + 1;
    const isChroma = effect.mapMode === 'chroma';
    const autoThresh = isChroma ? autoDistributeChromaThresholds(newCount) : autoDistributeLumaThresholds(newCount);
    const palette = isChroma ? DEFAULT_CHROMA_PALETTE : DEFAULT_LUMA_PALETTE;
    const template = GLYPH_TEMPLATE_PACKS[effect.templatePack ?? 'density'] || GLYPH_TEMPLATE_PACKS.density;

    const newBand: GlyphBand = {
      id: `gb-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      threshold: isChroma ? 360 : 255,
      color: palette[newCount - 1] ?? [0.95, 0.95, 0.95, 1.0],
      glyphText: template[(newCount - 1) % template.length] || '#'
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
    const isChroma = effect.mapMode === 'chroma';
    const autoThresh = isChroma ? autoDistributeChromaThresholds(filtered.length) : autoDistributeLumaThresholds(filtered.length);
    const updated = filtered.map((b, idx) => ({
      ...b,
      threshold: autoThresh[idx]
    }));
    handleUpdate({ bands: updated });
  };

  const handleThresholdChange = (index: number, newThreshold: number) => {
    if (hasBandsIn) return;
    const isChroma = effect.mapMode === 'chroma';
    const updated = isChroma
      ? cascadeChromaThresholds(bands, index, newThreshold)
      : cascadeLumaThresholds(bands, index, newThreshold);
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

  const handleLayerGlyphChange = (index: number, text: string) => {
    const updated = bands.map((b, idx) => {
      if (idx === index) {
        return { ...b, glyphText: text };
      }
      return b;
    });
    handleUpdate({ bands: updated });
  };

  const handleTemplatePackChange = (pack: GlyphTemplatePack) => {
    const chars = GLYPH_TEMPLATE_PACKS[pack] || GLYPH_TEMPLATE_PACKS.density;
    const updated = bands.map((b, idx) => ({
      ...b,
      glyphText: chars[idx % chars.length] || '#'
    }));
    handleUpdate({ templatePack: pack, sourceMode: 'templates', bands: updated });
  };

  const isChroma = effect.mapMode === 'chroma';
  const maxVal = isChroma ? 360 : 255;

  return (
    <div className="glyphmap-node-ui nodrag">
      {/* Header Row */}
      <div className="gm-header-row">
        <div className="gm-title-group">
          <span>🔤 GLYPH ({bands.length}/8)</span>
        </div>
        <div className="gm-btn-group">
          <button
            type="button"
            className="gm-btn studio-btn"
            onClick={() => setShowStudio(true)}
            title="Open Glyph Studio Pop-out Modal"
          >
            🎛️ Studio
          </button>
          {!hasBandsIn && (
            <>
              <button
                type="button"
                className="gm-btn"
                onClick={handleAutoDistribute}
                title="Evenly distribute layer thresholds"
              >
                🪄 Auto
              </button>
              <button
                type="button"
                className="gm-btn"
                disabled={bands.length >= 8}
                onClick={handleAddBand}
                title="Add a new band layer (up to 8 max)"
              >
                + Add
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upstream Status Banner */}
      {hasBandsIn ? (
        <div className="gm-locked-badge">
          🔗 Locked to Upstream {upstreamType} (Superimposed)
        </div>
      ) : (
        <div className="gm-row">
          <span style={{ fontSize: 10, color: '#aaa' }}>Quantizer Mode:</span>
          <div className="gm-btn-group">
            <button
              type="button"
              className={`gm-btn ${!isChroma ? 'active' : ''}`}
              onClick={() => handleUpdate({ mapMode: 'luma' })}
            >
              Luma
            </button>
            <button
              type="button"
              className={`gm-btn ${isChroma ? 'active' : ''}`}
              onClick={() => handleUpdate({ mapMode: 'chroma' })}
            >
              Chroma
            </button>
          </div>
        </div>
      )}

      {/* TextCue Sync Badge & Stepper */}
      {isTextBankLinked && (
        <div className="gm-textcue-badge">
          <span>📖 Bank {activeBankIdx + 1}: {activeBank?.name || 'Cards 1..8'}</span>
          <button
            type="button"
            className="gm-btn active"
            onClick={handleStepBank}
            title="Advance connected Text Bank"
          >
            ⏩ Next Bank
          </button>
        </div>
      )}

      {/* Palette In Badge */}
      {hasPaletteIn && (
        <div className="gm-textcue-badge" style={{ background: 'rgba(255, 180, 0, 0.12)', borderColor: 'rgba(255, 180, 0, 0.3)', color: '#ffb000' }}>
          <span>🎨 Connected to Color Palette</span>
        </div>
      )}

      {/* Stacked Band Cards (Rendered Top to Bottom) */}
      <div className="gm-bands-list">
        {bands
          .map((band, idx) => ({ band, idx }))
          .reverse()
          .map(({ band, idx }) => {
            const isTop = idx === bands.length - 1;
            const isBase = idx === 0;

            const minThresh = isBase ? 0 : (bands[idx - 1]?.threshold ?? 0) + 1;
            const maxThresh = isTop ? maxVal : band.threshold;

            const cardText = activeBank?.cards?.[idx]?.text;

            return (
              <div key={band.id || `gb-${idx}`} className="gm-band-card">
                <div className="gm-band-card-header">
                  <div className="gm-band-title-left">
                    <input
                      type="color"
                      className="gm-color-picker"
                      value={rgbaToHex(band.color)}
                      onChange={e => handleBandColorChange(idx, e.target.value)}
                      title={`Band ${idx + 1} Color`}
                    />
                    <span className="gm-band-name">
                      L{idx + 1}
                      {isTop && ' (Top)'}
                      {isBase && ' (Base)'}
                    </span>
                    {!hasBandsIn && (
                      <span style={{ fontSize: 9, color: '#888' }}>
                        {minThresh}→{maxThresh}{isChroma ? '°' : ''}
                      </span>
                    )}
                  </div>

                  {/* Right side: Glyph text input or Card preview */}
                  {isTextBankLinked && effect.sourceMode === 'textbank' ? (
                    <span className="gm-card-preview" title={cardText || '(empty)'}>
                      {cardText ? `"${cardText}"` : '(empty)'}
                    </span>
                  ) : (
                    <input
                      type="text"
                      className="gm-glyph-input"
                      value={band.glyphText ?? ''}
                      onChange={e => handleLayerGlyphChange(idx, e.target.value)}
                      placeholder="#"
                      title="Character or repeating phrase for this layer"
                    />
                  )}

                  {!hasBandsIn && (
                    <button
                      type="button"
                      className="gm-delete-btn"
                      disabled={bands.length <= 2}
                      onClick={() => handleDeleteBand(idx)}
                      title={bands.length <= 2 ? 'Min 2 bands' : `Delete Layer ${idx + 1}`}
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* Threshold Waterfall Slider (Enabled only when not locked upstream) */}
                {!hasBandsIn && (
                  <div className="gm-slider-row">
                    <input
                      type="range"
                      min={0}
                      max={maxVal}
                      step={1}
                      value={isTop ? maxVal : band.threshold}
                      disabled={isTop}
                      onChange={e => !isTop && handleThresholdChange(idx, parseInt(e.target.value, 10))}
                      title={isTop ? `Fixed upper ceiling (${maxVal})` : 'Adjust layer ceiling'}
                      className={isTop ? 'gm-slider-disabled' : undefined}
                    />
                    <span className="gm-val-badge">
                      {isTop ? maxVal : band.threshold}{isChroma ? '°' : ''}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Quick Controls: Templates & Cell Size */}
      <div className="gm-controls-panel">
        <div className="gm-row">
          <span style={{ color: '#aaa', fontSize: 10 }}>Background:</span>
          <select
            className="gm-select"
            value={effect.bgMode ?? 'video'}
            onChange={e => handleUpdate({ bgMode: e.target.value as any })}
          >
            <option value="video">Superimposed Video (100%)</option>
            <option value="video_dimmed">Video Dimmed (20%)</option>
            <option value="black">Solid Black</option>
            <option value="transparent">Transparent Alpha</option>
          </select>
        </div>

        <div className="gm-row">
          <span style={{ color: '#aaa', fontSize: 10 }}>Glyph Color:</span>
          <select
            className="gm-select"
            value={effect.colorMode ?? 'layer_palette'}
            onChange={e => handleUpdate({ colorMode: e.target.value as any })}
          >
            <option value="layer_palette">Layer Palette / Palette In</option>
            <option value="invert_video">Invert Video Color</option>
            <option value="source_video">Sampled Video</option>
            <option value="matrix_green">Matrix Phosphor</option>
            <option value="amber_crt">Amber CRT</option>
            <option value="monochrome">Monochrome</option>
          </select>
        </div>
        {(!isTextBankLinked || effect.sourceMode !== 'textbank') && (
          <div className="gm-row">
            <span style={{ color: '#aaa', fontSize: 10 }}>Template:</span>
            <select
              className="gm-select"
              value={effect.templatePack ?? 'density'}
              onChange={e => handleTemplatePackChange(e.target.value as GlyphTemplatePack)}
            >
              <option value="density">Density Ramp ( ·:+=#@)</option>
              <option value="directional">Directional (\/|-^v)</option>
              <option value="alpha">Alphabet (A E I O U)</option>
              <option value="numeric">Numbers (0 1 2 3)</option>
              <option value="symbols">Cyberpunk ($ % & # ©)</option>
              <option value="punctuation">Punctuation (. , : ! ?)</option>
            </select>
          </div>
        )}

        {/* Cell Size */}
        <div className="gm-row">
          <span style={{ color: '#aaa', fontSize: 10 }}>Cell Matrix:</span>
          <span className="gm-val-badge">{effect.cellSize ?? 16}px</span>
        </div>
        <div className="gm-slider-row">
          <input
            type="range"
            min={6}
            max={64}
            step={1}
            value={effect.cellSize ?? 16}
            onChange={e => handleUpdate({ cellSize: parseInt(e.target.value, 10) })}
            onDoubleClick={() => handleUpdate({ cellSize: 16 })}
            title="Monospace grid cell dimension (Double-click to reset to 16px)"
          />
        </div>
      </div>

      {/* Ink Boundary Outlines (parity with LumaBands & ChromaBands) */}
      <div className="gm-controls-panel">
        <div className="gm-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: isUpstreamBands ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              checked={isUpstreamBands ? ((upstreamEffect as any)?.outlineEnabled !== false) : (effect.outlineEnabled === true)}
              disabled={isUpstreamBands}
              onChange={e => handleUpdate({ outlineEnabled: e.target.checked })}
            />
            <span style={{ fontWeight: 'bold' }}>Ink Outline</span>
            {isUpstreamBands && <span style={{ fontSize: 9, color: '#00ff88' }}>(Inherited)</span>}
          </label>
          <input
            type="color"
            className="gm-color-picker"
            value={rgbaToHex(isUpstreamBands ? ((upstreamEffect as any)?.outlineColor ?? [0, 0, 0, 1]) : (effect.outlineColor ?? [0, 0, 0, 1]))}
            disabled={isUpstreamBands || (isUpstreamBands ? ((upstreamEffect as any)?.outlineEnabled === false) : !effect.outlineEnabled)}
            onChange={e => {
              const currentAlpha = effect.outlineColor?.[3] ?? 1.0;
              handleUpdate({ outlineColor: hexToRgba(e.target.value, currentAlpha) });
            }}
            title="Outline Ink Color"
          />
        </div>

        {(isUpstreamBands ? ((upstreamEffect as any)?.outlineEnabled !== false) : (effect.outlineEnabled === true)) && (
          <>
            <div className="gm-row">
              <span style={{ color: '#aaa', fontSize: 10 }}>Width:</span>
              <span className="gm-val-badge">{(isUpstreamBands ? ((upstreamEffect as any)?.outlineWidth ?? 2) : (effect.outlineWidth ?? 2)).toFixed(1)}px</span>
            </div>
            <div className="gm-slider-row">
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                disabled={isUpstreamBands}
                value={isUpstreamBands ? ((upstreamEffect as any)?.outlineWidth ?? 2) : (effect.outlineWidth ?? 2)}
                onChange={e => handleUpdate({ outlineWidth: parseFloat(e.target.value) })}
                onDoubleClick={() => !isUpstreamBands && handleUpdate({ outlineWidth: 2 })}
                title={isUpstreamBands ? "Inherited from upstream module" : "Outline Width"}
                className={isUpstreamBands ? 'gm-slider-disabled' : undefined}
              />
            </div>

            <div className="gm-row">
              <span style={{ color: '#aaa', fontSize: 10 }}>Opacity:</span>
              <span className="gm-val-badge">{Math.round((isUpstreamBands ? ((upstreamEffect as any)?.outlineOpacity ?? 1) : (effect.outlineOpacity ?? 1)) * 100)}%</span>
            </div>
            <div className="gm-slider-row">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={isUpstreamBands}
                value={isUpstreamBands ? ((upstreamEffect as any)?.outlineOpacity ?? 1) : (effect.outlineOpacity ?? 1)}
                onChange={e => handleUpdate({ outlineOpacity: parseFloat(e.target.value) })}
                onDoubleClick={() => !isUpstreamBands && handleUpdate({ outlineOpacity: 1.0 })}
                title={isUpstreamBands ? "Inherited from upstream module" : "Outline Opacity"}
                className={isUpstreamBands ? 'gm-slider-disabled' : undefined}
              />
            </div>
          </>
        )}
      </div>

      {/* Studio Pop-out Modal */}
      {showStudio && (
        <GlyphMapModal
          layerId={layerId}
          nodeId={nodeId}
          effect={effect}
          isTextBankLinked={isTextBankLinked}
          hasBandsIn={hasBandsIn}
          upstreamEffect={upstreamEffect}
          onClose={() => setShowStudio(false)}
        />
      )}
    </div>
  );
};
