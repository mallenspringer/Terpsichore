import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import {
  GlyphMapEffect,
  GlyphColorMode,
  GlyphBgMode
} from '../../../state/types';
import './GlyphMapModal.css';

interface GlyphMapModalProps {
  layerId: string;
  nodeId: string;
  effect: GlyphMapEffect;
  isTextBankLinked: boolean;
  hasBandsIn: boolean;
  onClose: () => void;
}

type TabKey = 'matrix' | 'scroll' | 'typography' | 'color' | 'quantizer';

export const GlyphMapModal: React.FC<GlyphMapModalProps> = ({
  layerId,
  nodeId,
  effect,
  isTextBankLinked,
  hasBandsIn,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('matrix');
  const updateEffect = useEngineStore(s => s.updateEffect);

  const handleUpdate = (patch: Partial<GlyphMapEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const bands = effect.bands || [];

  const handleLayerStringChange = (idx: number, text: string) => {
    const updated = bands.map((b, i) => {
      if (i === idx) {
        return { ...b, glyphText: text };
      }
      return b;
    });
    handleUpdate({ bands: updated });
  };

  return (
    <div className="gm-modal-overlay" onClick={onClose}>
      <div className="gm-modal-window" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="gm-modal-header">
          <div className="gm-modal-title">
            <span>🔤 GLYPH STUDIO</span>
            <span style={{ fontSize: 11, color: '#aaa' }}>
              ASCII Synthesis, Concrete Poetry & Typographic Cel-Shading
            </span>
          </div>
          <button type="button" className="gm-close-btn" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="gm-modal-tabs">
          <button
            type="button"
            className={`gm-tab-btn ${activeTab === 'matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('matrix')}
          >
            📜 Text & Wrap Matrix
          </button>
          <button
            type="button"
            className={`gm-tab-btn ${activeTab === 'scroll' ? 'active' : ''}`}
            onClick={() => setActiveTab('scroll')}
          >
            ⚡ Kinetic Auto-Scroll
          </button>
          <button
            type="button"
            className={`gm-tab-btn ${activeTab === 'typography' ? 'active' : ''}`}
            onClick={() => setActiveTab('typography')}
          >
            🔠 Typography & Atlas
          </button>
          <button
            type="button"
            className={`gm-tab-btn ${activeTab === 'color' ? 'active' : ''}`}
            onClick={() => setActiveTab('color')}
          >
            🎨 Color & Compositing
          </button>
          <button
            type="button"
            className={`gm-tab-btn ${activeTab === 'quantizer' ? 'active' : ''}`}
            onClick={() => setActiveTab('quantizer')}
          >
            🥞 Waterfall Quantizer
          </button>
        </div>

        {/* Tab Body */}
        <div className="gm-modal-body">
          {/* TAB 1: Text & Wrap Matrix */}
          {activeTab === 'matrix' && (
            <>
              <div className="gm-section-title">
                <span>Text Flow & Wrap Rule</span>
              </div>
              <div className="gm-seg-group">
                <button
                  type="button"
                  className={`gm-seg-btn ${(effect.wrapMode ?? 'raw_char') === 'raw_char' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ wrapMode: 'raw_char' })}
                  title="Continuous raw character wrapping across the entire screen texture"
                >
                  Raw Character Wrap (Continuous Fill)
                </button>
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.wrapMode === 'word' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ wrapMode: 'word' })}
                  title="Word wrapping at character grid boundaries"
                >
                  Word Wrap
                </button>
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.wrapMode === 'preserve_lines' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ wrapMode: 'preserve_lines' })}
                  title="Preserve line breaks (\n) for poetic stanzas and lineated typography"
                >
                  Preserve Line Breaks (Poetic / Stanzas)
                </button>
              </div>

              <div className="gm-section-title" style={{ marginTop: 12 }}>
                <span>Layer Text Source</span>
                {isTextBankLinked && (
                  <span style={{ fontSize: 10, color: '#00d4ff' }}>
                    🔗 Connected to Text Bank (Card 1..8)
                  </span>
                )}
              </div>

              <div className="gm-seg-group">
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.sourceMode === 'textbank' ? 'active' : ''}`}
                  disabled={!isTextBankLinked}
                  onClick={() => handleUpdate({ sourceMode: 'textbank' })}
                >
                  Text Bank Cards 1..8
                </button>
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.sourceMode === 'templates' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ sourceMode: 'templates' })}
                >
                  Template Preset Packs
                </button>
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.sourceMode === 'manual' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ sourceMode: 'manual' })}
                >
                  Manual Per-Layer Text
                </button>
              </div>

              {/* 8 Layer Cards */}
              <div className="gm-card-grid" style={{ marginTop: 12 }}>
                {bands.map((band, idx) => (
                  <div key={band.id || `layer-${idx}`} className="gm-layer-card-modal">
                    <div className="gm-layer-card-top">
                      <span style={{ fontWeight: 'bold', color: '#00ff88', fontSize: 11 }}>
                        Layer {idx + 1}
                      </span>
                      <span style={{ fontSize: 10, color: '#888' }}>
                        {band.glyphText?.length || 0} chars
                      </span>
                    </div>
                    <textarea
                      className="gm-textarea"
                      value={band.glyphText ?? ''}
                      onChange={e => handleLayerStringChange(idx, e.target.value)}
                      placeholder={`Enter text or poem for Layer ${idx + 1}...`}
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* TAB 2: Kinetic Auto-Scroll */}
          {activeTab === 'scroll' && (
            <>
              <div className="gm-section-title">
                <span>Kinetic Drift & Motion</span>
              </div>
              <div className="gm-seg-group">
                <button
                  type="button"
                  className={`gm-seg-btn ${!effect.autoScroll ? 'active' : ''}`}
                  onClick={() => handleUpdate({ autoScroll: false })}
                >
                  Static (No Scroll)
                </button>
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.autoScroll ? 'active' : ''}`}
                  onClick={() => handleUpdate({ autoScroll: true })}
                >
                  Auto-Scroll Enabled
                </button>
              </div>

              {effect.autoScroll && (
                <>
                  <div className="gm-section-title" style={{ marginTop: 14 }}>
                    <span>Scroll Direction</span>
                  </div>
                  <div className="gm-seg-group">
                    {(['left', 'right', 'up', 'down'] as const).map(dir => (
                      <button
                        key={dir}
                        type="button"
                        className={`gm-seg-btn ${(effect.scrollDirection ?? 'left') === dir ? 'active' : ''}`}
                        onClick={() => handleUpdate({ scrollDirection: dir })}
                      >
                        {dir.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <div className="gm-section-title" style={{ marginTop: 14 }}>
                    <span>Scroll Rate / Speed</span>
                    <span style={{ color: '#00ff88' }}>{(effect.scrollSpeed ?? 1.0).toFixed(1)}x</span>
                  </div>
                  <div className="gm-slider-row">
                    <input
                      type="range"
                      min={0.1}
                      max={10.0}
                      step={0.1}
                      value={effect.scrollSpeed ?? 1.0}
                      onChange={e => handleUpdate({ scrollSpeed: parseFloat(e.target.value) })}
                      onDoubleClick={() => handleUpdate({ scrollSpeed: 1.0 })}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: '#888' }}>
                    Modulate rate via the <code>scroll_cv</code> input port.
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 3: Typography & Font Atlas */}
          {activeTab === 'typography' && (
            <>
              <div className="gm-section-title">
                <span>Monospace Font Family</span>
              </div>
              <div className="gm-seg-group">
                {[
                  'VT323',
                  'Space Mono',
                  'Silkscreen',
                  'Share Tech Mono',
                  'Courier Prime',
                  'Syne Mono'
                ].map(font => (
                  <button
                    key={font}
                    type="button"
                    className={`gm-seg-btn ${(effect.fontFamily ?? 'VT323') === font ? 'active' : ''}`}
                    onClick={() => handleUpdate({ fontFamily: font })}
                  >
                    {font}
                  </button>
                ))}
              </div>

              <div className="gm-section-title" style={{ marginTop: 14 }}>
                <span>Font Weight</span>
              </div>
              <div className="gm-seg-group">
                <button
                  type="button"
                  className={`gm-seg-btn ${(effect.fontWeight ?? 'normal') === 'normal' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ fontWeight: 'normal' })}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={`gm-seg-btn ${effect.fontWeight === 'bold' ? 'active' : ''}`}
                  onClick={() => handleUpdate({ fontWeight: 'bold' })}
                >
                  Bold
                </button>
              </div>

              <div className="gm-section-title" style={{ marginTop: 14 }}>
                <span>Phosphor Glow Effect</span>
                <span style={{ color: '#00ff88' }}>{effect.textGlowRadius ?? 0}px</span>
              </div>
              <div className="gm-slider-row">
                <input
                  type="color"
                  className="gm-color-picker"
                  value={effect.textGlowColor ?? '#00ff88'}
                  onChange={e => handleUpdate({ textGlowColor: e.target.value })}
                />
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={effect.textGlowRadius ?? 0}
                  onChange={e => handleUpdate({ textGlowRadius: parseInt(e.target.value, 10) })}
                />
              </div>
            </>
          )}

          {/* TAB 4: Color & Compositing */}
          {activeTab === 'color' && (
            <>
              <div className="gm-section-title">
                <span>Glyph Color Mode</span>
              </div>
              <div className="gm-seg-group">
                {[
                  { id: 'layer_palette', label: 'Layer Palette' },
                  { id: 'source_video', label: 'Video Sampled' },
                  { id: 'matrix_green', label: 'Matrix Phosphor' },
                  { id: 'amber_crt', label: 'Amber CRT' },
                  { id: 'monochrome', label: 'Monochrome' },
                  { id: 'inherit_style', label: 'Inherit Style (TextMaker)' }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    className={`gm-seg-btn ${(effect.colorMode ?? 'layer_palette') === m.id ? 'active' : ''}`}
                    onClick={() => handleUpdate({ colorMode: m.id as GlyphColorMode })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="gm-section-title" style={{ marginTop: 14 }}>
                <span>Background Mode</span>
              </div>
              <div className="gm-seg-group">
                {[
                  { id: 'transparent', label: 'Transparent (Alpha)' },
                  { id: 'black', label: 'Solid Black' },
                  { id: 'video_dimmed', label: 'Video Dimmed' }
                ].map(bg => (
                  <button
                    key={bg.id}
                    type="button"
                    className={`gm-seg-btn ${(effect.bgMode ?? 'black') === bg.id ? 'active' : ''}`}
                    onClick={() => handleUpdate({ bgMode: bg.id as GlyphBgMode })}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>

              {effect.bgMode === 'video_dimmed' && (
                <>
                  <div className="gm-section-title" style={{ marginTop: 14 }}>
                    <span>Dimmed Video Opacity</span>
                    <span style={{ color: '#00ff88' }}>
                      {Math.round((effect.dimmedVideoOpacity ?? 0.2) * 100)}%
                    </span>
                  </div>
                  <div className="gm-slider-row">
                    <input
                      type="range"
                      min={0.0}
                      max={1.0}
                      step={0.02}
                      value={effect.dimmedVideoOpacity ?? 0.2}
                      onChange={e => handleUpdate({ dimmedVideoOpacity: parseFloat(e.target.value) })}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 5: Waterfall Quantizer */}
          {activeTab === 'quantizer' && (
            <>
              {hasBandsIn ? (
                <div className="gm-locked-badge" style={{ padding: 12, fontSize: 12 }}>
                  🔗 Upstream Band Cable Connected (`bands_in`). Quantization is 100% locked to upstream module.
                </div>
              ) : (
                <>
                  <div className="gm-section-title">
                    <span>Quantizer Mode</span>
                  </div>
                  <div className="gm-seg-group">
                    <button
                      type="button"
                      className={`gm-seg-btn ${(effect.mapMode ?? 'luma') === 'luma' ? 'active' : ''}`}
                      onClick={() => handleUpdate({ mapMode: 'luma' })}
                    >
                      Luminance (Luma)
                    </button>
                    <button
                      type="button"
                      className={`gm-seg-btn ${effect.mapMode === 'chroma' ? 'active' : ''}`}
                      onClick={() => handleUpdate({ mapMode: 'chroma' })}
                    >
                      Chrominance (Chroma / Hue)
                    </button>
                  </div>

                  <div className="gm-section-title" style={{ marginTop: 14 }}>
                    <span>Spatial Smoothing</span>
                    <span style={{ color: '#00ff88' }}>
                      {Math.round((effect.spatialSmoothing ?? 0.2) * 100)}%
                    </span>
                  </div>
                  <div className="gm-slider-row">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={effect.spatialSmoothing ?? 0.2}
                      onChange={e => handleUpdate({ spatialSmoothing: parseFloat(e.target.value) })}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="gm-modal-footer">
          <button type="button" className="gm-btn studio-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
