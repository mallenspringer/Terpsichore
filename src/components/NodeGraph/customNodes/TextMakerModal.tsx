import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TextMakerEffect } from '../../../state/types';
import { getFontCssStack } from '../../../renderer/TextMakerRenderer';
import './TextMakerModal.css';

interface TextMakerModalProps {
  effect: TextMakerEffect;
  externalText: string | null;
  hasPaletteIn: boolean;
  hasVideoIn: boolean;
  onUpdate: (patch: Partial<TextMakerEffect>) => void;
  onClose: () => void;
}

type ColorChannelKey =
  | 'textColor'
  | 'textColorB'
  | 'headerColor'
  | 'outlineColor'
  | 'shadowColor'
  | 'extrudeColor'
  | 'glowColor'
  | 'backdropColor'
  | 'backdropBorderColor'
  | 'bgColorA'
  | 'bgColorB';

const COLOR_CHANNELS: { key: ColorChannelKey; label: string }[] = [
  { key: 'textColor', label: 'Text Fill' },
  { key: 'textColorB', label: 'Text Grad B' },
  { key: 'headerColor', label: 'Header L1' },
  { key: 'outlineColor', label: 'Outline' },
  { key: 'shadowColor', label: 'Shadow' },
  { key: 'extrudeColor', label: '3D Extrude' },
  { key: 'glowColor', label: 'Glow' },
  { key: 'backdropColor', label: 'Box Fill' },
  { key: 'backdropBorderColor', label: 'Box Border' },
  { key: 'bgColorA', label: 'BG Color A' },
  { key: 'bgColorB', label: 'BG Color B' }
];

// Authentic Videonics / NTSC 32-Swatch Hardware Palette
const VIDEONICS_SWATCHES: [number, number, number][] = [
  [1.0, 1.0, 1.0], [0.85, 0.85, 0.85], [0.65, 0.65, 0.65], [0.45, 0.45, 0.45],
  [0.25, 0.25, 0.28], [0.12, 0.12, 0.15], [0.05, 0.05, 0.08], [0.0, 0.0, 0.0],
  [1.0, 0.9, 0.1], [1.0, 0.72, 0.05], [0.95, 0.45, 0.08], [0.92, 0.15, 0.15],
  [0.68, 0.08, 0.12], [0.95, 0.25, 0.65], [0.75, 0.15, 0.85], [0.45, 0.18, 0.85],
  [0.15, 0.35, 0.95], [0.08, 0.18, 0.58], [0.05, 0.1, 0.35], [0.15, 0.68, 1.0],
  [0.1, 0.92, 0.95], [0.08, 0.65, 0.62], [0.15, 0.88, 0.35], [0.55, 0.95, 0.18],
  [0.12, 0.48, 0.22], [1.0, 0.82, 0.68], [0.82, 0.55, 0.32], [0.52, 0.3, 0.15],
  [1.0, 0.65, 0.82], [0.65, 0.85, 1.0], [0.75, 1.0, 0.78], [1.0, 0.96, 0.65]
];

const RETRO_SYMBOLS = ['★', '♪', '♥', '►', '◄', '▲', '▼', '█', '◆', '•', '©', '™'];

const SNAP_LABELS = ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR'];

function rgbaToCss(c: [number, number, number, number] | undefined, fallback = '#ffffff'): string {
  if (!c) return fallback;
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  const a = Math.max(0, Math.min(1, c[3] ?? 1));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function rgbaToHex(c: [number, number, number, number] | undefined): string {
  if (!c) return '#ffffff';
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number.isNaN(r) ? 1 : r, Number.isNaN(g) ? 1 : g, Number.isNaN(b) ? 1 : b];
}

export const TextMakerModal: React.FC<TextMakerModalProps> = ({
  effect,
  externalText,
  hasPaletteIn,
  hasVideoIn,
  onUpdate,
  onClose
}) => {
  const currentFxMode = effect.analogFxMode ?? (effect.analogFxMaster === false ? 'off' : 'on');
  const [activeChannel, setActiveChannel] = useState<ColorChannelKey>('textColor');
  const [showSafeGuides, setShowSafeGuides] = useState(true);
  const monitorRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const currentCol = (effect[activeChannel] as [number, number, number, number]) || [1, 1, 1, 1];

  const handleSelectSwatch = (rgb: [number, number, number]) => {
    const alpha = currentCol[3] ?? 1.0;
    onUpdate({ [activeChannel]: [rgb[0], rgb[1], rgb[2], alpha] } as Partial<TextMakerEffect>);
  };

  const handleHexChange = (hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    onUpdate({ [activeChannel]: [r, g, b, currentCol[3] ?? 1.0] } as Partial<TextMakerEffect>);
  };

  const handleAlphaChange = (alpha: number) => {
    onUpdate({ [activeChannel]: [currentCol[0], currentCol[1], currentCol[2], alpha] } as Partial<TextMakerEffect>);
  };

  const handleInsertSymbol = (sym: string) => {
    onUpdate({ localText: `${effect.localText || ''}${sym}` });
  };

  const handleMonitorPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!monitorRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: effect.posX ?? 0,
      origY: effect.posY ?? 0
    };
  };

  const handleMonitorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current || !monitorRef.current) return;
    const rect = monitorRef.current.getBoundingClientRect();
    const scaleFactor = effect.layoutMode === 'lower_third' ? 0.4 : 0.45;
    const dx = ((e.clientX - dragStartRef.current.startX) / Math.max(1, rect.width)) / scaleFactor;
    const dy = ((e.clientY - dragStartRef.current.startY) / Math.max(1, rect.height)) / scaleFactor;
    const nextX = Math.max(-1, Math.min(1, Number((dragStartRef.current.origX + dx).toFixed(2))));
    const nextY = Math.max(-1, Math.min(1, Number((dragStartRef.current.origY + dy).toFixed(2))));
    onUpdate({ posX: nextX, posY: nextY });
  };

  const handleMonitorPointerUp = () => {
    dragStartRef.current = null;
  };

  // Build interactive monitor CSS preview
  const rawPreviewText = externalText !== null ? externalText : (effect.localText || '');
  const formattedPreviewText = effect.allCaps ? rawPreviewText.toUpperCase() : rawPreviewText;
  const previewLines =
    effect.layoutMode === 'crawl'
      ? [formattedPreviewText.replace(/\r?\n/g, '   •   ')]
      : formattedPreviewText.split(/\r?\n/);

  const zone = effect.snapZone ?? 4;
  const zoneCol = (zone % 3) - 1;
  const zoneRow = Math.floor(zone / 3) - 1;
  const snapX = zoneCol * 0.48;
  const snapY = zoneRow * 0.52;
  const modPosX = snapX + (effect.posX ?? 0);
  const modPosY = snapY + (effect.posY ?? 0);

  const previewOffsetX =
    effect.layoutMode === 'lower_third'
      ? modPosX * 40
      : modPosX * 45;
  const previewOffsetY =
    effect.layoutMode === 'lower_third'
      ? 28 + (effect.posY ?? 0) * 40
      : modPosY * 45;

  const stretchX = effect.stretchMode === '2x_wide' ? 1.55 : 1.0;
  const stretchY = effect.stretchMode === '2x_tall' ? 1.55 : 1.0;

  const textShadowParts: string[] = [];
  if (effect.outlineEnabled) {
    const ow = Math.max(1, Math.round((effect.outlineWidth ?? 0.25) * 4));
    const oc = rgbaToCss(effect.outlineColor);
    textShadowParts.push(`-${ow}px -${ow}px 0 ${oc}`, `${ow}px -${ow}px 0 ${oc}`, `-${ow}px ${ow}px 0 ${oc}`, `${ow}px ${ow}px 0 ${oc}`);
  }
  if (effect.extrudeEnabled) {
    const depth = Math.max(1, Math.round((effect.extrudeAmount ?? 0.35) * 10));
    const rad = ((effect.extrudeAngle ?? 135) * Math.PI) / 180;
    const ec = rgbaToCss(effect.extrudeColor);
    for (let s = 1; s <= depth; s++) {
      textShadowParts.push(`${Math.round(Math.cos(rad) * s)}px ${Math.round(Math.sin(rad) * s)}px 0 ${ec}`);
    }
  }
  if (effect.shadowEnabled) {
    const dist = Math.max(2, Math.round((effect.shadowAmount ?? 0.45) * 12));
    const rad = ((effect.shadowAngle ?? 135) * Math.PI) / 180;
    textShadowParts.push(`${Math.round(Math.cos(rad) * dist)}px ${Math.round(Math.sin(rad) * dist)}px 3px ${rgbaToCss(effect.shadowColor)}`);
  }
  if (effect.glowEnabled) {
    const blur = Math.max(4, Math.round((effect.glowAmount ?? 0.4) * 22));
    const effectiveGlow = effect.glowMatchTextColor ? (effect.textColor || [1, 1, 1, 1]) : (effect.glowColor || [0.2, 0.7, 1.0, 1.0]);
    textShadowParts.push(`0 0 ${blur}px ${rgbaToCss(effectiveGlow)}`);
  }
  if ((effect.analogFxMode ? effect.analogFxMode !== 'off' : effect.analogFxMaster !== false) && effect.chromaBleedEnabled !== false) {
    const bleedPx = Math.max(1, Math.round((effect.chromaBleedAmount ?? 0.35) * 6));
    textShadowParts.push(`-${bleedPx}px 0 0 rgba(255, 40, 40, 0.65)`, `${bleedPx}px 0 0 rgba(40, 180, 255, 0.65)`);
  }

  let monitorBgStyle: React.CSSProperties = {};
  if (!hasVideoIn) {
    if (effect.bgMode === 'solid') {
      monitorBgStyle = { background: rgbaToCss(effect.bgColorA) };
    } else if (effect.bgMode === 'gradient') {
      monitorBgStyle = { background: `linear-gradient(180deg, ${rgbaToCss(effect.bgColorA)} 0%, ${rgbaToCss(effect.bgColorB)} 100%)` };
    } else if (effect.bgMode === 'color_bars') {
      monitorBgStyle = {
        background: 'linear-gradient(90deg, #c0c0c0 0 14.28%, #c0c000 14.28% 28.56%, #00c0c0 28.56% 42.84%, #00c000 42.84% 57.12%, #c000c0 57.12% 71.4%, #c00000 71.4% 85.68%, #0000c0 85.68% 100%)'
      };
    }
  }

  return createPortal(
    <div
      className="tm-modal-backdrop nodrag nowheel"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tm-modal-window" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="tm-modal-header">
          <div className="tm-modal-title-group">
            <span className="tm-brand-badge">TextMaker</span>
            <div>
              <div className="tm-modal-title">Character Generator Studio</div>
              <div className="tm-modal-subtitle">
                {externalText !== null
                  ? 'External TextCue Connected (text_in) • Live Title Superimposer'
                  : 'Standalone Title Buffer • Dual Video / Matte / Stylized Text Out'}
              </div>
            </div>
          </div>

          <div className="tm-modal-header-actions">
            <button
              type="button"
              className="tm-header-btn"
              onClick={() => onUpdate({ manualTriggerTime: Date.now() })}
              title="Trigger Entrance / Transition Animation"
            >
              ⚡ Trigger Transition
            </button>
            {(() => {
              const isFull = currentFxMode === 'on';
              const isText = currentFxMode === 'text_only';
              const btnClass = isFull ? 'active' : (isText ? 'text-only' : '');
              const label = isFull ? 'ON' : (isText ? 'TEXT ONLY' : 'OFF');
              const handleCycle = () => {
                const nextMode = isFull ? 'text_only' : (isText ? 'off' : 'on');
                onUpdate({
                  analogFxMode: nextMode,
                  analogFxMaster: nextMode !== 'off'
                });
              };
              return (
                <button
                  type="button"
                  className={`tm-header-btn ${btnClass}`}
                  onClick={handleCycle}
                  title="Cycle Analog CRT FX: On (Full) -> Text Only -> Off"
                >
                  📺 Analog CRT FX: {label}
                </button>
              );
            })()}
            <button type="button" className="tm-close-btn" onClick={onClose} title="Close Studio">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="tm-modal-body">
          {/* LEFT COLUMN: Interactive Monitor, Snap Grid, Text Editor, Swatch Matrix */}
          <div className="tm-left-col">
            {/* 1. Interactive Title-Safe Monitor */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>NTSC Title-Safe Preview (Drag to Position)</span>
                <button
                  type="button"
                  className={`tm-seg-btn ${showSafeGuides ? 'active' : ''}`}
                  style={{ flex: 'none', padding: '2px 6px' }}
                  onClick={() => setShowSafeGuides(v => !v)}
                >
                  Safe Guides
                </button>
              </div>

              <div
                ref={monitorRef}
                className="tm-crt-monitor tm-crt-Monitor-checker"
                style={monitorBgStyle}
                onPointerDown={handleMonitorPointerDown}
                onPointerMove={handleMonitorPointerMove}
                onPointerUp={handleMonitorPointerUp}
              >
                {showSafeGuides && (
                  <>
                    <div className="tm-safe-action" title="90% Action Safe" />
                    <div className="tm-safe-title" title="80% Title Safe" />
                  </>
                )}

                <div
                  style={{
                    position: 'absolute',
                    left: `calc(50% + ${previewOffsetX}%)`,
                    top: `calc(50% + ${previewOffsetY}%)`,
                    transform: `translate(-50%, -50%) scale(${stretchX}, ${stretchY})`,
                    textAlign: effect.textAlign || 'center',
                    padding: effect.backdropMode !== 'none' ? '6px 14px' : '0',
                    width: effect.backdropMode === 'full_banner' ? '100%' : 'auto',
                    background:
                      effect.backdropMode === 'tight_box' || effect.backdropMode === 'full_banner'
                        ? rgbaToCss(effect.backdropColor)
                        : 'transparent',
                    border:
                      (effect.backdropMode === 'tight_box' || effect.backdropMode === 'full_banner') &&
                      (effect.backdropBorderWidth ?? 0.3) > 0.02
                        ? `${Math.max(1, Math.round((effect.backdropBorderWidth ?? 0.3) * 5))}px solid ${rgbaToCss(effect.backdropBorderColor)}`
                        : 'none',
                    pointerEvents: 'none',
                    maxWidth: effect.backdropMode === 'full_banner' ? '100%' : '88%',
                    filter:
                      currentFxMode !== 'off' && effect.pixelateEnabled !== false && (effect.pixelateAmount ?? 0.3) > 0.05
                        ? `blur(${Math.max(0.5, (effect.pixelateAmount ?? 0.3) * 1.8)}px)`
                        : 'none',
                    animation:
                      currentFxMode !== 'off' && effect.jitterEnabled !== false && (effect.jitterAmount ?? 0.2) > 0.05
                        ? 'tm-crt-jitter 0.12s infinite alternate'
                        : 'none'
                  }}
                >
                  {previewLines.map((line, idx) => {
                    const isHeader = idx === 0 && effect.headerOverrideEnabled;
                    const basePx = Math.max(10, Math.round((effect.fontSize ?? 52) * 0.32));
                    const linePx = isHeader ? Math.round(basePx * (effect.headerScale ?? 1.4)) : basePx;
                    return (
                      <div
                        key={idx}
                        style={{
                          font: getFontCssStack(effect.fontFamily, linePx),
                          lineHeight: effect.lineHeight ?? 1.25,
                          letterSpacing: `${Math.round((effect.letterSpacing ?? 1) * 0.4)}px`,
                          color: isHeader ? rgbaToCss(effect.headerColor) : rgbaToCss(effect.textColor),
                          textShadow: textShadowParts.join(', '),
                          background: effect.backdropMode === 'line_strips' ? rgbaToCss(effect.backdropColor) : 'transparent',
                          padding: effect.backdropMode === 'line_strips' ? '1px 8px' : '0',
                          marginBottom: effect.backdropMode === 'line_strips' ? '2px' : '0',
                          whiteSpace: effect.layoutMode === 'crawl' ? 'nowrap' : 'pre-wrap'
                        }}
                      >
                        {line || '\u00A0'}
                      </div>
                    );
                  })}
                </div>

                {/* Degradation Overlays */}
                {currentFxMode === 'on' && (
                  <>
                    {effect.scanlinesEnabled !== false && (
                      <div
                        className="tm-crt-scanline-overlay"
                        style={{ opacity: Math.max(0.15, Math.min(0.9, (effect.scanlinesAmount ?? 0.25) * 2.2)) }}
                      />
                    )}
                    {effect.noiseEnabled !== false && (
                      <div
                        className="tm-crt-noise-overlay"
                        style={{ opacity: Math.max(0.08, Math.min(0.6, (effect.noiseAmount ?? 0.15) * 2.5)) }}
                      />
                    )}
                    <div className="tm-crt-vignette" />
                  </>
                )}
              </div>

              {/* 9-Zone Snap Grid & Fine X/Y */}
              <div className="tm-pos-toolbar">
                <div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>9-Zone Snap</div>
                  <div className="tm-snap-grid">
                    {SNAP_LABELS.map((lbl, idx) => (
                      <button
                        key={lbl}
                        type="button"
                        className={`tm-snap-cell ${(effect.snapZone ?? 4) === idx ? 'active' : ''}`}
                        onClick={() => onUpdate({ snapZone: idx as any, posX: 0, posY: 0 })}
                        title={`Snap to ${lbl}`}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div className="tm-slider-row">
                    <label style={{ minWidth: 50 }}>Pos X</label>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={effect.posX ?? 0}
                      onDoubleClick={() => onUpdate({ posX: 0 })}
                      onChange={e => onUpdate({ posX: parseFloat(e.target.value) })}
                    />
                    <span className="tm-val-badge">{(effect.posX ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="tm-slider-row">
                    <label style={{ minWidth: 50 }}>Pos Y</label>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.01}
                      value={effect.posY ?? 0}
                      onDoubleClick={() => onUpdate({ posY: 0 })}
                      onChange={e => onUpdate({ posY: parseFloat(e.target.value) })}
                    />
                    <span className="tm-val-badge">{(effect.posY ?? 0).toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="tm-seg-btn"
                  style={{ flex: 'none', padding: '5px 8px' }}
                  onClick={() => onUpdate({ snapZone: 4, posX: 0, posY: 0 })}
                >
                  Center
                </button>
              </div>
            </div>

            {/* 2. Text Content & Hardware Symbols */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>Title Buffer & Character ROM Symbols</span>
                {externalText !== null && <span className="tm-ext-badge">EXT TEXT IN ACTIVE</span>}
              </div>

              {externalText !== null && (
                <div style={{ fontSize: 11, color: '#a3e635', background: '#0c1410', padding: '6px 8px', borderRadius: 4, border: '1px solid #1f3a24' }}>
                  <strong>Live Incoming Text:</strong> {externalText || '(Empty Card)'}
                </div>
              )}

              <textarea
                className="tm-textarea"
                value={effect.localText ?? ''}
                onChange={e => onUpdate({ localText: e.target.value })}
                placeholder="Enter standalone title lines (used when Text In is disconnected)..."
              />

              <div className="tm-symbols-bar">
                {RETRO_SYMBOLS.map(sym => (
                  <button
                    key={sym}
                    type="button"
                    className="tm-sym-btn"
                    onClick={() => handleInsertSymbol(sym)}
                    title={`Insert ${sym}`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Videonics 32-Color Swatch Matrix & Palette Normalization */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>Videonics 32-Color Matrix & Palette Mode</span>
                {hasPaletteIn && <span className="tm-ext-badge">PALETTE IN ACTIVE</span>}
              </div>

              <div className="tm-channel-tabs">
                {COLOR_CHANNELS.map(ch => {
                  const col = (effect[ch.key] as [number, number, number, number]) || [1, 1, 1, 1];
                  return (
                    <button
                      key={ch.key}
                      type="button"
                      className={`tm-channel-tab ${activeChannel === ch.key ? 'active' : ''}`}
                      onClick={() => setActiveChannel(ch.key)}
                    >
                      <span className="tm-channel-dot" style={{ background: rgbaToCss(col) }} />
                      {ch.label}
                    </button>
                  );
                })}
              </div>

              <div className="tm-swatch-grid">
                {VIDEONICS_SWATCHES.map((rgb, i) => (
                  <button
                    key={i}
                    type="button"
                    className="tm-swatch-cell"
                    style={{ background: `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})` }}
                    onClick={() => handleSelectSwatch(rgb)}
                    title={`Swatch ${i + 1}`}
                  />
                ))}
              </div>

              <div className="tm-slider-row">
                <label>Custom / Alpha</label>
                <input
                  type="color"
                  value={rgbaToHex(currentCol)}
                  onChange={e => handleHexChange(e.target.value)}
                  style={{ width: 32, height: 24, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={currentCol[3] ?? 1}
                  onDoubleClick={() => handleAlphaChange(1)}
                  onChange={e => handleAlphaChange(parseFloat(e.target.value))}
                />
                <span className="tm-val-badge">{Math.round((currentCol[3] ?? 1) * 100)}%</span>
              </div>

              <div className="tm-row">
                <label>Color / Pal Mode</label>
                <div className="tm-btn-group">
                  {([
                    ['solid', 'Solid'],
                    ['gradient', 'Gradient'],
                    ['color_cycle', 'Color Cycle'],
                    ['line_step', 'Line Step']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.colorFillMode === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ colorFillMode: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {effect.colorFillMode === 'gradient' && (
                <div className="tm-row">
                  <label>Gradient Dir</label>
                  <div className="tm-btn-group">
                    {([
                      ['line_vertical', 'Per-Line V'],
                      ['block_vertical', 'Full Block V'],
                      ['horizontal', 'Horizontal']
                    ] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        className={`tm-seg-btn ${effect.gradientDirection === val ? 'active' : ''}`}
                        onClick={() => onUpdate({ gradientDirection: val })}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {effect.colorFillMode === 'color_cycle' && (
                <div className="tm-slider-row">
                  <label>Cycle Speed</label>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.05}
                    value={effect.colorCycleSpeed ?? 0.5}
                    onDoubleClick={() => onUpdate({ colorCycleSpeed: 0.5 })}
                    onChange={e => onUpdate({ colorCycleSpeed: parseFloat(e.target.value) })}
                  />
                  <span className="tm-val-badge">{(effect.colorCycleSpeed ?? 0.5).toFixed(2)}Hz</span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Typography, Edge FX, Backdrop/BG, Motion/Transitions, Analog CRT Shaders */}
          <div className="tm-right-col">
            {/* 4. Typography, Stretch & Header Line 1 Override */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>Typography, Bitmap Stretch & Header Line 1</span>
              </div>

              <div className="tm-row">
                <label>Font Family</label>
                <div className="tm-btn-group">
                  {([
                    ['broadcast_sans', 'Broadcast Sans'],
                    ['slab_serif', 'Slab Serif'],
                    ['vcr_osd', 'VCR OSD'],
                    ['brush_script', 'Brush'],
                    ['lcd_digital', 'LCD Digital']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.fontFamily === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ fontFamily: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tm-row">
                <label>Glyph Stretch</label>
                <div className="tm-btn-group">
                  {([
                    ['1x', '1x Normal'],
                    ['2x_wide', '2x Wide'],
                    ['2x_tall', '2x Tall']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.stretchMode === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ stretchMode: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tm-row">
                <label>Alignment</label>
                <div className="tm-btn-group">
                  {([
                    ['left', 'Left'],
                    ['center', 'Center'],
                    ['right', 'Right']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.textAlign === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ textAlign: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`tm-seg-btn ${effect.allCaps ? 'active' : ''}`}
                    onClick={() => onUpdate({ allCaps: !effect.allCaps })}
                  >
                    ALL CAPS
                  </button>
                </div>
              </div>

              <div className="tm-slider-row">
                <label>Font Size</label>
                <input
                  type="range"
                  min={16}
                  max={120}
                  step={1}
                  value={effect.fontSize ?? 52}
                  onDoubleClick={() => onUpdate({ fontSize: 52 })}
                  onChange={e => onUpdate({ fontSize: parseInt(e.target.value, 10) })}
                />
                <span className="tm-val-badge">{effect.fontSize ?? 52}px</span>
              </div>

              <div className="tm-slider-row">
                <label>Tracking / Line</label>
                <input
                  type="range"
                  min={-2}
                  max={20}
                  step={0.5}
                  value={effect.letterSpacing ?? 1}
                  onDoubleClick={() => onUpdate({ letterSpacing: 1 })}
                  onChange={e => onUpdate({ letterSpacing: parseFloat(e.target.value) })}
                  title="Character Tracking"
                />
                <input
                  type="range"
                  min={0.9}
                  max={2.2}
                  step={0.05}
                  value={effect.lineHeight ?? 1.25}
                  onDoubleClick={() => onUpdate({ lineHeight: 1.25 })}
                  onChange={e => onUpdate({ lineHeight: parseFloat(e.target.value) })}
                  title="Line Height Multiplier"
                />
                <span className="tm-val-badge">{(effect.lineHeight ?? 1.25).toFixed(2)}x</span>
              </div>

              <div className="tm-slider-row">
                <label>
                  <input
                    type="checkbox"
                    checked={!!effect.headerOverrideEnabled}
                    onChange={e => onUpdate({ headerOverrideEnabled: e.target.checked })}
                    style={{ marginRight: 5 }}
                  />
                  Header L1 Scale
                </label>
                <input
                  type="range"
                  min={1.0}
                  max={2.5}
                  step={0.05}
                  disabled={!effect.headerOverrideEnabled}
                  value={effect.headerScale ?? 1.4}
                  onDoubleClick={() => onUpdate({ headerScale: 1.4 })}
                  onChange={e => onUpdate({ headerScale: parseFloat(e.target.value) })}
                />
                <span className="tm-val-badge">{(effect.headerScale ?? 1.4).toFixed(2)}x</span>
              </div>
            </div>

            {/* 5. Character Edge Effects & Backdrop Box / Internal BG */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>Character Edge FX (CV-Modulated) & Backdrop</span>
              </div>

              <div className="tm-fx-grid">
                {/* Outline */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={effect.outlineEnabled !== false}
                        onChange={e => onUpdate({ outlineEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      Hard Outline
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.outlineWidth ?? 0.25) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={effect.outlineEnabled === false}
                    value={effect.outlineWidth ?? 0.25}
                    onDoubleClick={() => onUpdate({ outlineWidth: 0.25 })}
                    onChange={e => onUpdate({ outlineWidth: parseFloat(e.target.value) })}
                  />
                </div>

                {/* Drop Shadow */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={effect.shadowEnabled !== false}
                        onChange={e => onUpdate({ shadowEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      Drop Shadow (CV)
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.shadowAmount ?? 0.45) * 100)}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      disabled={effect.shadowEnabled === false}
                      value={effect.shadowAmount ?? 0.45}
                      onDoubleClick={() => onUpdate({ shadowAmount: 0.45 })}
                      onChange={e => onUpdate({ shadowAmount: parseFloat(e.target.value) })}
                      title="Shadow Offset & Depth"
                    />
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={5}
                      disabled={effect.shadowEnabled === false}
                      value={effect.shadowAngle ?? 135}
                      onDoubleClick={() => onUpdate({ shadowAngle: 135 })}
                      onChange={e => onUpdate({ shadowAngle: parseInt(e.target.value, 10) })}
                      title="Shadow Angle"
                    />
                  </div>
                </div>

                {/* 3D Extrude / Bevel */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!effect.extrudeEnabled}
                        onChange={e => onUpdate({ extrudeEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      3D Extrude / Bevel (CV)
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.extrudeAmount ?? 0.35) * 100)}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      disabled={!effect.extrudeEnabled}
                      value={effect.extrudeAmount ?? 0.35}
                      onDoubleClick={() => onUpdate({ extrudeAmount: 0.35 })}
                      onChange={e => onUpdate({ extrudeAmount: parseFloat(e.target.value) })}
                      title="3D Extrude Depth"
                    />
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={5}
                      disabled={!effect.extrudeEnabled}
                      value={effect.extrudeAngle ?? 135}
                      onDoubleClick={() => onUpdate({ extrudeAngle: 135 })}
                      onChange={e => onUpdate({ extrudeAngle: parseInt(e.target.value, 10) })}
                      title="3D Extrude Angle"
                    />
                  </div>
                </div>

                {/* Neon Glow */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!effect.glowEnabled}
                        onChange={e => onUpdate({ glowEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      Neon Glow (CV)
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.glowAmount ?? 0.4) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={!effect.glowEnabled}
                    value={effect.glowAmount ?? 0.4}
                    onDoubleClick={() => onUpdate({ glowAmount: 0.4 })}
                    onChange={e => onUpdate({ glowAmount: parseFloat(e.target.value) })}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8, fontSize: 11 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: effect.glowEnabled ? 'pointer' : 'default', opacity: effect.glowEnabled ? 1 : 0.5 }}>
                      <input
                        type="checkbox"
                        disabled={!effect.glowEnabled}
                        checked={!!effect.glowMatchTextColor}
                        onChange={e => onUpdate({ glowMatchTextColor: e.target.checked })}
                      />
                      <span>Text Color</span>
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="color"
                        disabled={!effect.glowEnabled || !!effect.glowMatchTextColor}
                        value={rgbaToHex(effect.glowColor || [0.2, 0.7, 1.0, 1.0])}
                        onChange={e => {
                          const rgb = hexToRgb(e.target.value);
                          const currentAlpha = (effect.glowColor && effect.glowColor[3] !== undefined) ? effect.glowColor[3] : 1.0;
                          onUpdate({ glowColor: [rgb[0], rgb[1], rgb[2], currentAlpha] });
                        }}
                        style={{
                          width: 24,
                          height: 20,
                          padding: 0,
                          border: '1px solid #444',
                          borderRadius: 3,
                          background: 'none',
                          cursor: (!effect.glowEnabled || !!effect.glowMatchTextColor) ? 'default' : 'pointer',
                          opacity: (!effect.glowEnabled || !!effect.glowMatchTextColor) ? 0.4 : 1
                        }}
                        title={effect.glowMatchTextColor ? 'Overridden by Text Color' : 'Manual Glow Color'}
                      />
                      <button
                        type="button"
                        className="tm-seg-btn"
                        style={{ padding: '2px 6px', fontSize: 10 }}
                        disabled={!effect.glowEnabled || !!effect.glowMatchTextColor}
                        onClick={() => {
                          const currentAlpha = (effect.glowColor && effect.glowColor[3] !== undefined) ? effect.glowColor[3] : 1.0;
                          onUpdate({ glowColor: [0.2, 0.7, 1.0, currentAlpha] });
                        }}
                        title="Reset glow color to default bluish-white"
                      >
                        Default
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="tm-row" style={{ marginTop: 4 }}>
                <label>Backdrop Box</label>
                <div className="tm-btn-group">
                  {([
                    ['none', 'None'],
                    ['tight_box', 'Tight Box'],
                    ['full_banner', 'Full Banner'],
                    ['line_strips', 'Line Strips']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.backdropMode === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ backdropMode: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {effect.backdropMode !== 'none' && (
                <div className="tm-slider-row">
                  <label>Box Border</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={effect.backdropBorderWidth ?? 0.3}
                    onDoubleClick={() => onUpdate({ backdropBorderWidth: 0.3 })}
                    onChange={e => onUpdate({ backdropBorderWidth: parseFloat(e.target.value) })}
                  />
                  <span className="tm-val-badge">{Math.round((effect.backdropBorderWidth ?? 0.3) * 100)}%</span>
                </div>
              )}

              <div className="tm-row">
                <label>Internal BG</label>
                <div className="tm-btn-group">
                  {([
                    ['transparent', 'Transparent (No BG)'],
                    ['solid', 'Solid'],
                    ['gradient', '2-Tone Grad'],
                    ['color_bars', 'Color Bars']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.bgMode === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ bgMode: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 6. Layout Motion & Transitions */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>Layout Motion & Page Transitions (Sent to text_out)</span>
              </div>

              <div className="tm-row">
                <label>Layout Mode</label>
                <div className="tm-btn-group">
                  {([
                    ['page', 'Page'],
                    ['lower_third', 'Lower 3rd'],
                    ['roll', 'Vertical Roll'],
                    ['crawl', 'Horiz Crawl']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.layoutMode === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ layoutMode: val })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {(effect.layoutMode === 'roll' || effect.layoutMode === 'crawl') && (
                <div className="tm-slider-row">
                  <label>Scroll Speed</label>
                  <input
                    type="range"
                    min={-2}
                    max={2}
                    step={0.05}
                    value={effect.scrollSpeed ?? 0.4}
                    onDoubleClick={() => onUpdate({ scrollSpeed: 0.4 })}
                    onChange={e => onUpdate({ scrollSpeed: parseFloat(e.target.value) })}
                  />
                  <span className="tm-val-badge">{(effect.scrollSpeed ?? 0.4).toFixed(2)}</span>
                </div>
              )}

              <div className="tm-row">
                <label>Transition</label>
                <div className="tm-btn-group">
                  {([
                    ['cut', 'Cut'],
                    ['crossfade', 'Crossfade'],
                    ['fade_out_in', 'Fade Out/In'],
                    ['typewriter', 'Typewriter'],
                    ['wipe_lr', 'Wipe L→R'],
                    ['venetian', 'Venetian'],
                    ['slide_up', 'Slide Up']
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      className={`tm-seg-btn ${effect.transitionMode === val ? 'active' : ''}`}
                      onClick={() => onUpdate({ transitionMode: val, manualTriggerTime: Date.now() })}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {effect.transitionMode !== 'cut' && (
                <div className="tm-slider-row">
                  <label>Trans Duration</label>
                  <input
                    type="range"
                    min={0.1}
                    max={5.0}
                    step={0.05}
                    value={effect.transitionDuration ?? 0.6}
                    onDoubleClick={() => onUpdate({ transitionDuration: 0.6 })}
                    onChange={e => onUpdate({ transitionDuration: parseFloat(e.target.value) })}
                  />
                  <span className="tm-val-badge">{(effect.transitionDuration ?? 0.6).toFixed(2)}s</span>
                </div>
              )}

              {effect.transitionMode === 'typewriter' && (
                <div className="tm-row">
                  <label>Cursor Style</label>
                  <div className="tm-btn-group">
                    {([
                      ['block', 'Block (█)'],
                      ['underscore', 'Underscore (_)'],
                      ['none', 'None']
                    ] as const).map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        className={`tm-seg-btn ${effect.typewriterCursor === val ? 'active' : ''}`}
                        onClick={() => onUpdate({ typewriterCursor: val })}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 7. Analog CRT / NTSC Degradation Shader Rack */}
            <div className="tm-panel">
              <div className="tm-panel-header">
                <span>Analog Video / NTSC Character Degradation Rack</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className={`tm-seg-pill ${currentFxMode === 'on' ? 'active-full' : ''}`}
                    onClick={() => onUpdate({ analogFxMode: 'on', analogFxMaster: true })}
                    title="Apply shaders to both incoming video and title text"
                  >
                    On (Full)
                  </button>
                  <button
                    type="button"
                    className={`tm-seg-pill ${currentFxMode === 'text_only' ? 'active-text' : ''}`}
                    onClick={() => onUpdate({ analogFxMode: 'text_only', analogFxMaster: true })}
                    title="Apply shaders to Title Text only (incoming video stays clean)"
                  >
                    Text Only
                  </button>
                  <button
                    type="button"
                    className={`tm-seg-pill ${currentFxMode === 'off' ? 'active-off' : ''}`}
                    onClick={() => onUpdate({ analogFxMode: 'off', analogFxMaster: false })}
                    title="Bypass all analog degradation effects"
                  >
                    Off
                  </button>
                </div>
              </div>

              <div className="tm-fx-grid">
                {/* Pixel Grid */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={effect.pixelateEnabled !== false}
                        onChange={e => onUpdate({ pixelateEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      Pixel Grid / 240p
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.pixelateAmount ?? 0.3) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={currentFxMode === 'off' || effect.pixelateEnabled === false}
                    value={effect.pixelateAmount ?? 0.3}
                    onDoubleClick={() => onUpdate({ pixelateAmount: 0.3 })}
                    onChange={e => onUpdate({ pixelateAmount: parseFloat(e.target.value) })}
                  />
                </div>

                {/* NTSC Chroma Bleed */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={effect.chromaBleedEnabled !== false}
                        onChange={e => onUpdate({ chromaBleedEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      NTSC Chroma Bleed
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.chromaBleedAmount ?? 0.35) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={currentFxMode === 'off' || effect.chromaBleedEnabled === false}
                    value={effect.chromaBleedAmount ?? 0.35}
                    onDoubleClick={() => onUpdate({ chromaBleedAmount: 0.35 })}
                    onChange={e => onUpdate({ chromaBleedAmount: parseFloat(e.target.value) })}
                  />
                </div>

                {/* CRT Scanlines */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={effect.scanlinesEnabled !== false}
                        onChange={e => onUpdate({ scanlinesEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      CRT Scanlines
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.scanlinesAmount ?? 0.25) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={currentFxMode === 'off' || effect.scanlinesEnabled === false}
                    value={effect.scanlinesAmount ?? 0.25}
                    onDoubleClick={() => onUpdate({ scanlinesAmount: 0.25 })}
                    onChange={e => onUpdate({ scanlinesAmount: parseFloat(e.target.value) })}
                  />
                </div>

                {/* H-Sync Jitter */}
                <div className="tm-fx-card">
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!effect.jitterEnabled}
                        onChange={e => onUpdate({ jitterEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      H-Sync Tape Jitter
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.jitterAmount ?? 0.2) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={currentFxMode === 'off' || !effect.jitterEnabled}
                    value={effect.jitterAmount ?? 0.2}
                    onDoubleClick={() => onUpdate({ jitterAmount: 0.2 })}
                    onChange={e => onUpdate({ jitterAmount: parseFloat(e.target.value) })}
                  />
                </div>

                {/* Analog Luma Snow */}
                <div className="tm-fx-card" style={{ gridColumn: '1 / -1' }}>
                  <div className="tm-fx-card-header">
                    <label>
                      <input
                        type="checkbox"
                        checked={!!effect.noiseEnabled}
                        onChange={e => onUpdate({ noiseEnabled: e.target.checked })}
                        style={{ marginRight: 6 }}
                      />
                      Analog Luma Snow / RF Grain
                    </label>
                    <span className="tm-val-badge">{Math.round((effect.noiseAmount ?? 0.15) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    disabled={currentFxMode === 'off' || !effect.noiseEnabled}
                    value={effect.noiseAmount ?? 0.15}
                    onDoubleClick={() => onUpdate({ noiseAmount: 0.15 })}
                    onChange={e => onUpdate({ noiseAmount: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

