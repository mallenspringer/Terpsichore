import React from 'react';
import { useEngineStore } from '../../../state/store';
import { OutlineEffect, OutlineEdgeMode, OutlineBgMode, OutlineColorMode, OutlinePulseMode } from '../../../state/types';

interface OutlineNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: OutlineEffect;
  rowCtx?: any;
}

function rgbaToHex(c: [number, number, number, number] | undefined, fallback = '#000000'): string {
  if (!c) return fallback;
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}`;
}

function hexToRgba(hex: string, currentAlpha = 1.0): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number.isNaN(r) ? 0 : r, Number.isNaN(g) ? 0 : g, Number.isNaN(b) ? 0 : b, currentAlpha];
}

export const OutlineNodeUI: React.FC<OutlineNodeUIProps> = ({
  layerId,
  nodeId,
  effect
}) => {
  const updateEffect = useEngineStore(s => s.updateEffect);

  const handleUpdate = (patch: Partial<OutlineEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const edgeMode = effect.edgeMode || 'luma_bands';
  const bandCount = Math.max(2, Math.min(8, effect.bandCount ?? 4));
  const threshold = effect.threshold ?? 0.25;
  const lineWidth = effect.lineWidth ?? 2.0;
  const lineOpacity = effect.lineOpacity ?? 1.0;
  const smoothing = effect.spatialSmoothing ?? 0.2;
  const bgMode = effect.bgMode || 'over_video_ink';
  const colorMode = effect.colorMode || 'custom';
  const analogDirection = effect.analogDirection || 'horizontal';
  const lineColor = effect.lineColor || [0, 0, 0, 1];
  const pulseActive = !!effect.pulseActive;
  const pulseAmount = effect.pulseAmount ?? 1.5;
  const pulseSpeed = effect.pulseSpeed ?? 1.0;
  const pulseFreq = effect.pulseFreq ?? 3.0;
  const pulseMode = effect.pulseMode || 'contour';

  const isBandedMode = edgeMode === 'luma_bands' || edgeMode === 'chroma_bands';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '4px 2px', fontSize: '11px', color: '#e0e0e0', width: '220px' }}>
      {/* Edge Detection Mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Detection Mode</span>
        <select
          value={edgeMode}
          onChange={e => handleUpdate({ edgeMode: e.target.value as OutlineEdgeMode })}
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
          <option value="luma_bands">Luma Bands (Quantized)</option>
          <option value="chroma_bands">Chroma Bands (Quantized)</option>
          <option value="focus_peaking">Focus Peaking (Contrast)</option>
          <option value="manga_dog">Manga / DoG (Contour)</option>
          <option value="analog_diff">Analog Video (Scanline)</option>
        </select>
      </div>

      {/* Dynamic Mode Parameters */}
      {isBandedMode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}>
            <span>Band Tiers (Cap: 8)</span>
            <span style={{ color: '#00ff88', fontWeight: 600 }}>{bandCount} Bands</span>
          </div>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={bandCount}
            onChange={e => handleUpdate({ bandCount: parseInt(e.target.value, 10) })}
            style={{ width: '100%', accentColor: '#00ff88' }}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}>
            <span>Sensitivity / Threshold</span>
            <span style={{ color: '#00ff88', fontWeight: 600 }}>{Math.round(threshold * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.02}
            max={1.0}
            step={0.01}
            value={threshold}
            onChange={e => handleUpdate({ threshold: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#00ff88' }}
          />
        </div>
      )}

      {/* Analog Direction */}
      {edgeMode === 'analog_diff' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#aaa' }}>Scanline Axis</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              onClick={() => handleUpdate({ analogDirection: 'horizontal' })}
              style={{
                background: analogDirection === 'horizontal' ? '#00aa55' : '#222',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              H-Scan
            </button>
            <button
              type="button"
              onClick={() => handleUpdate({ analogDirection: 'vertical' })}
              style={{
                background: analogDirection === 'vertical' ? '#00aa55' : '#222',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              V-Scan
            </button>
          </div>
        </div>
      )}

      {/* Line Width */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}>
          <span>Line Width</span>
          <span style={{ color: '#00ff88', fontWeight: 600 }}>{lineWidth.toFixed(1)} px</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={16.0}
          step={0.5}
          value={lineWidth}
          onChange={e => handleUpdate({ lineWidth: parseFloat(e.target.value) })}
          style={{ width: '100%', accentColor: '#00ff88' }}
        />
      </div>

      {/* Opacity & Cel Smoothing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}>
            <span>Opacity</span>
            <span>{Math.round(lineOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.05}
            value={lineOpacity}
            onChange={e => handleUpdate({ lineOpacity: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#00ff88' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa' }}>
            <span>Smoothing</span>
            <span>{Math.round(smoothing * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.0}
            step={0.05}
            value={smoothing}
            onChange={e => handleUpdate({ spatialSmoothing: parseFloat(e.target.value) })}
            style={{ width: '100%', accentColor: '#00ff88' }}
          />
        </div>
      </div>

      {/* Line Color & Color Mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Line Color</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={colorMode}
            onChange={e => handleUpdate({ colorMode: e.target.value as OutlineColorMode })}
            style={{
              flex: 1,
              background: '#1a1a1a',
              color: '#fff',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '3px 5px',
              fontSize: '11px',
              outline: 'none'
            }}
          >
            <option value="custom">Custom Color</option>
            <option value="palette_in">Palette / Palette In</option>
            <option value="sample_video">Sample Video</option>
          </select>

          {colorMode === 'custom' && (
            <input
              type="color"
              value={rgbaToHex(lineColor)}
              onChange={e => handleUpdate({ lineColor: hexToRgba(e.target.value, lineColor[3] ?? 1.0) })}
              style={{
                width: '26px',
                height: '24px',
                border: '1px solid #444',
                borderRadius: '3px',
                padding: '0',
                cursor: 'pointer',
                background: 'transparent'
              }}
            />
          )}
        </div>
      </div>

      {/* Traveling Pulse / Bulge Animation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px', background: '#141414', borderRadius: '4px', border: '1px solid #282828' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: '#00ff88', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Traveling Pulse
          </span>
          <button
            onClick={() => handleUpdate({ pulseActive: !pulseActive })}
            style={{
              padding: '2px 8px',
              fontSize: '9px',
              fontWeight: 600,
              background: pulseActive ? '#00ff88' : '#222',
              color: pulseActive ? '#000' : '#888',
              border: pulseActive ? '1px solid #00ff88' : '1px solid #444',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            {pulseActive ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {pulseActive && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
            {/* Pulse Mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '9px', color: '#888' }}>Travel Trajectory</span>
              <select
                value={pulseMode}
                onChange={e => handleUpdate({ pulseMode: e.target.value as OutlinePulseMode })}
                style={{
                  background: '#1a1a1a',
                  color: '#fff',
                  border: '1px solid #333',
                  borderRadius: '3px',
                  padding: '3px 5px',
                  fontSize: '10px',
                  outline: 'none'
                }}
              >
                <option value="local_edge">Local Edge Flow (Tangent)</option>
                <option value="contour">Orbital Flow (Center-Referenced)</option>
                <option value="radial">Radial Ripple (Expanding Rings)</option>
                <option value="horizontal">Horizontal Sweep (Left to Right)</option>
                <option value="vertical">Vertical Sweep (Top to Bottom)</option>
              </select>
            </div>

            {/* Bulge Intensity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa' }}>
                <span>Bulge Scale</span>
                <span style={{ color: '#00ff88' }}>+{Math.round(pulseAmount * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={4.0}
                step={0.1}
                value={pulseAmount}
                onChange={e => handleUpdate({ pulseAmount: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: '#00ff88' }}
              />
            </div>

            {/* Speed & Frequency */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa' }}>
                  <span>Speed</span>
                  <span style={{ color: '#00ff88' }}>{pulseSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={-4.0}
                  max={4.0}
                  step={0.2}
                  value={pulseSpeed}
                  onChange={e => handleUpdate({ pulseSpeed: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#00ff88' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#aaa' }}>
                  <span>Density</span>
                  <span style={{ color: '#00ff88' }}>{pulseFreq.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={10.0}
                  step={0.5}
                  value={pulseFreq}
                  onChange={e => handleUpdate({ pulseFreq: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#00ff88' }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Background / Output Mode */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Output / Blend Mode</span>
        <select
          value={bgMode}
          onChange={e => handleUpdate({ bgMode: e.target.value as OutlineBgMode })}
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
          <option value="over_video_ink">Over Video (Ink / Multiply)</option>
          <option value="over_video_neon">Over Video (Neon / Additive)</option>
          <option value="lines_transparent">Lines Only (Transparent Alpha)</option>
          <option value="lines_black">Lines Only (Black Background)</option>
        </select>
      </div>
    </div>
  );
};

