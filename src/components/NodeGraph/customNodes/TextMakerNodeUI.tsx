import React, { useState } from 'react';
import { useEngineStore } from '../../../state/store';
import { TextMakerEffect, TextCueSource } from '../../../state/types';
import { stepTextCueCard } from '../../../utils/textCueUtils';
import { getFontCssStack } from '../../../renderer/TextMakerRenderer';
import { KeyMappingRow } from '../controls/controlHelpers';
import { TextMakerModal } from './TextMakerModal';
import './TextMakerNodeUI.css';

interface TextMakerNodeUIProps {
  layerId: string;
  nodeId: string;
  effect: TextMakerEffect;
  rowCtx?: any;
}

function rgbaToCss(c: [number, number, number, number] | undefined, fallback = '#ffffff'): string {
  if (!c) return fallback;
  const r = Math.round(Math.max(0, Math.min(1, c[0])) * 255);
  const g = Math.round(Math.max(0, Math.min(1, c[1])) * 255);
  const b = Math.round(Math.max(0, Math.min(1, c[2])) * 255);
  const a = Math.max(0, Math.min(1, c[3] ?? 1));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const TextMakerNodeUI: React.FC<TextMakerNodeUIProps> = ({
  layerId,
  nodeId,
  effect,
  rowCtx
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const layer = useEngineStore(s => s.layers[layerId]);
  const updateEffect = useEngineStore(s => s.updateEffect);

  const handleUpdate = (patch: Partial<TextMakerEffect>) => {
    updateEffect(layerId, nodeId, patch as any);
  };

  const handleTrigger = () => {
    if (textInEdge && layer) {
      if (textInEdge.fromNodeId === 'source' && layer.source?.type === 'TextCue') {
        const patch = stepTextCueCard(layer.source as TextCueSource);
        useEngineStore.getState().updateLayer(layerId, {
          source: { ...layer.source, ...patch } as any
        });
      } else {
        const fromEff = layer.effects?.find(e => e.id === textInEdge.fromNodeId);
        if (fromEff?.type === 'TextCue' && fromEff.id) {
          const patch = stepTextCueCard(fromEff as TextCueSource);
          updateEffect(layerId, fromEff.id, patch as any);
        }
      }
    }
    handleUpdate({ manualTriggerTime: Date.now() });
  };

  // Check connected inputs
  const edges = layer?.graph?.edges || [];
  const textInEdge = edges.find(e => e.toNodeId === nodeId && e.toPort === 'text_in');
  const hasPaletteIn = edges.some(e => e.toNodeId === nodeId && e.toPort === 'palette_in');
  const hasVideoIn = edges.some(e => e.toNodeId === nodeId && e.toPort === 'video_in');

  let externalText: string | null = null;
  if (textInEdge && layer) {
    if (textInEdge.fromNodeId === 'source' && layer.source.type === 'TextCue') {
      const src = layer.source as TextCueSource;
      const b = src.banks?.[src.activeBankIndex ?? 0];
      externalText = (src.currentText && src.currentText.length > 0)
        ? src.currentText
        : (b?.cards?.[b?.activeCardIndex ?? 0]?.text ?? '');
    } else {
      const fromEff = layer.effects.find(e => e.id === textInEdge.fromNodeId);
      if (fromEff?.type === 'TextCue') {
        const src = fromEff as TextCueSource;
        const b = src.banks?.[src.activeBankIndex ?? 0];
        externalText = (src.currentText && src.currentText.length > 0)
          ? src.currentText
          : (b?.cards?.[b?.activeCardIndex ?? 0]?.text ?? '');
      } else if (fromEff?.type === 'TextMaker') {
        externalText = (fromEff as TextMakerEffect).currentText ?? (fromEff as TextMakerEffect).localText ?? '';
      }
    }
  }

  const displayStr = externalText !== null ? externalText : (effect.localText || '');
  const formattedPreview = effect.allCaps ? displayStr.toUpperCase() : displayStr;

  return (
    <div className="textmaker-node-ui nodrag">
      {/* Top Action Bar */}
      <div className="tm-node-top-bar">
        <button
          type="button"
          className="tm-node-btn trig"
          onClick={handleTrigger}
          title="Trigger Title Entrance / Transition"
        >
          ⚡ TRIG
          {effect.keyMapping && effect.keyMapping !== 'none' ? ` [${effect.keyMapping}]` : ''}
        </button>

        <button
          type="button"
          className={`tm-node-btn ${effect.analogFxMaster !== false ? 'fx-active' : ''}`}
          onClick={() => handleUpdate({ analogFxMaster: !(effect.analogFxMaster !== false) })}
          title="Master Toggle for Analog CRT / NTSC Shaders"
        >
          📺 FX: {effect.analogFxMaster !== false ? 'ON' : 'OFF'}
        </button>

        <button
          type="button"
          className="tm-node-btn studio"
          onClick={() => setIsModalOpen(true)}
          title="Open Pop-Out TitleMaker Studio"
        >
          Studio ⤢
        </button>
      </div>

      {/* Initial Pass: Mini CRT Preview Monitor */}
      <div
        className="tm-mini-monitor"
        onClick={() => setIsModalOpen(true)}
        title="Click to open TitleMaker Studio"
      >
        <div className="tm-mini-monitor-badges">
          <span className={externalText !== null ? 'tm-mini-badge-ext' : ''}>
            {externalText !== null ? '● EXT TEXT' : '○ LOCAL'}
          </span>
          <span>{effect.layoutMode.toUpperCase().replace('_', ' ')}</span>
        </div>

        <div
          className="tm-mini-preview-text"
          style={{
            font: getFontCssStack(effect.fontFamily, 12),
            color: rgbaToCss(effect.textColor),
            textShadow: effect.shadowEnabled !== false ? `1px 1px 2px ${rgbaToCss(effect.shadowColor)}` : 'none'
          }}
        >
          {formattedPreview || '(Empty Title)'}
        </div>
      </div>

      {/* Mode Selectors */}
      <div className="tm-node-select-grid">
        <div className="tm-node-field">
          <span>Layout</span>
          <select
            className="tm-node-select"
            value={effect.layoutMode}
            onChange={e => handleUpdate({ layoutMode: e.target.value as any })}
          >
            <option value="page">Page</option>
            <option value="lower_third">Lower 3rd</option>
            <option value="roll">Vertical Roll</option>
            <option value="crawl">Horiz Crawl</option>
          </select>
        </div>

        <div className="tm-node-field">
          <span>Transition</span>
          <select
            className="tm-node-select"
            value={effect.transitionMode}
            onChange={e => handleUpdate({ transitionMode: e.target.value as any, manualTriggerTime: Date.now() })}
          >
            <option value="cut">Instant Cut</option>
            <option value="crossfade">Crossfade</option>
            <option value="fade_out_in">Fade Out/In</option>
            <option value="typewriter">Typewriter</option>
            <option value="wipe_lr">Wipe L→R</option>
            <option value="venetian">Venetian</option>
            <option value="slide_up">Slide Up</option>
          </select>
        </div>

        <div className="tm-node-field">
          <span>Font</span>
          <select
            className="tm-node-select"
            value={effect.fontFamily}
            onChange={e => handleUpdate({ fontFamily: e.target.value as any })}
          >
            <option value="broadcast_sans">Broadcast Sans</option>
            <option value="slab_serif">Slab Serif</option>
            <option value="vcr_osd">VCR OSD</option>
            <option value="brush_script">Brush Script</option>
            <option value="lcd_digital">LCD Digital</option>
          </select>
        </div>

        <div className="tm-node-field">
          <span>Color Mode</span>
          <select
            className="tm-node-select"
            value={effect.colorFillMode}
            onChange={e => handleUpdate({ colorFillMode: e.target.value as any })}
          >
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
            <option value="color_cycle">Color Cycle</option>
            <option value="line_step">Line Step</option>
          </select>
        </div>
      </div>

      {/* Quick Live Sliders */}
      <div className="tm-node-slider-row">
        <label>Font Size</label>
        <input
          type="range"
          min={16}
          max={120}
          step={1}
          value={effect.fontSize ?? 52}
          onChange={e => handleUpdate({ fontSize: parseInt(e.target.value, 10) })}
        />
        <span className="tm-node-slider-val">{effect.fontSize ?? 52}</span>
      </div>

      <div className="tm-node-slider-row">
        <label>Shadow</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={effect.shadowEnabled !== false ? (effect.shadowAmount ?? 0.45) : 0}
          onChange={e => {
            const v = parseFloat(e.target.value);
            handleUpdate({ shadowEnabled: v > 0.01, shadowAmount: v });
          }}
        />
        <span className="tm-node-slider-val">
          {effect.shadowEnabled !== false ? `${Math.round((effect.shadowAmount ?? 0.45) * 100)}%` : 'OFF'}
        </span>
      </div>

      <div className="tm-node-slider-row">
        <label>3D Bevel</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={effect.extrudeEnabled ? (effect.extrudeAmount ?? 0.35) : 0}
          onChange={e => {
            const v = parseFloat(e.target.value);
            handleUpdate({ extrudeEnabled: v > 0.01, extrudeAmount: v });
          }}
        />
        <span className="tm-node-slider-val">
          {effect.extrudeEnabled ? `${Math.round((effect.extrudeAmount ?? 0.35) * 100)}%` : 'OFF'}
        </span>
      </div>

      <div className="tm-node-slider-row">
        <label>Glow</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={effect.glowEnabled ? (effect.glowAmount ?? 0.4) : 0}
          onChange={e => {
            const v = parseFloat(e.target.value);
            handleUpdate({ glowEnabled: v > 0.01, glowAmount: v });
          }}
        />
        <span className="tm-node-slider-val">
          {effect.glowEnabled ? `${Math.round((effect.glowAmount ?? 0.4) * 100)}%` : 'OFF'}
        </span>
      </div>

      {rowCtx && (
        <KeyMappingRow
          label="Trig Key"
          value={effect.keyMapping || 'none'}
          onChange={(k: string) => handleUpdate({ keyMapping: k })}
          ctx={rowCtx}
        />
      )}

      {isModalOpen && (
        <TextMakerModal
          effect={effect}
          externalText={externalText}
          hasPaletteIn={hasPaletteIn}
          hasVideoIn={hasVideoIn}
          onUpdate={handleUpdate}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
