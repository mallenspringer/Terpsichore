import { useEffect, useState } from 'react';
import { useEngineStore } from '../../../state/store';
import { SignalDispatcher } from '../../../state/SignalDispatcher';
import {
  BlackoutPoetryEffect,
  BlackoutStylePreset,
  BlackoutSelectionMode,
  BlackoutPunctuationMode,
  BlackoutFontFamily,
  BlackoutLayoutMode,
  BlackoutMatteTarget,
  BlackoutRampMode,
  TextCueSource,
} from '../../../state/types';
import {
  findConnectedTextCue,
  getPopulatedBankCandidates,
  selectTextCueBankIndex,
  stepTextCueBankBy,
  stepTextCueCardBy,
} from '../../../utils/textCueUtils';
import { Knob } from './Knob';

const STYLE_OPTIONS: { id: BlackoutStylePreset; label: string }[] = [
  { id: 'sharpie_zine', label: 'Sharpie Zine' },
  { id: 'classified_redact', label: 'Classified Redact' },
  { id: 'cutup_collage', label: 'Cut-Up Collage' },
  { id: 'fade', label: 'Fade Out' },
  { id: 'dissolve', label: 'Ash Dissolve' },
  { id: 'whiteout_glow', label: 'Whiteout Glow' },
  { id: 'spotlight_negative', label: 'Spotlight Negative' },
  { id: 'acid_erasure', label: 'Acid Erasure' },
  { id: 'signal_censor', label: 'CRT Signal Censor' },
];

const SELECTION_MODES: { id: BlackoutSelectionMode; label: string; title: string }[] = [
  { id: 'entropy', label: 'ENTROPY', title: 'Deterministic seeded drop-out controlled by Blackout %' },
  { id: 'spotlight', label: 'SPOT XY', title: '2D spatial reveal/redact window (patch Vowel Track or LFO)' },
  { id: 'walk', label: 'WALK', title: 'Sequential frontier sweep across text words' },
  { id: 'glimpse', label: 'FLASH', title: 'Audio/trigger transient punches hidden words open' },
];

function rgbaToHex(c: [number, number, number, number] | undefined, fallback: string): string {
  if (!c) return fallback;
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(c[0])}${toHex(c[1])}${toHex(c[2])}`;
}

function hexToRgba(hex: string, a = 1): [number, number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [Number.isNaN(r) ? 0 : r, Number.isNaN(g) ? 0 : g, Number.isNaN(b) ? 0 : b, a];
}

export function BlackoutNodeUI({
  nodeId,
  layerId,
  effect,
  onUpdate,
}: {
  nodeId: string;
  layerId: string;
  effect: BlackoutPoetryEffect;
  onUpdate: (u: Partial<BlackoutPoetryEffect>) => void;
}) {
  const layer = useEngineStore(s => s.layers[layerId]);
  const updateLayer = useEngineStore(s => s.updateLayer);
  const updateEffect = useEngineStore(s => s.updateEffect);

  const [showStyleOpts, setShowStyleOpts] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [liveRamp, setLiveRamp] = useState(() => ({
    progress: 0,
    density: effect.rampFloor ?? 0,
    wordMs: effect.wordDurationMs ?? 400,
  }));

  useEffect(() => {
    let rafId = 0;
    const sample = () => {
      const rt = SignalDispatcher.getInstance().getBlackoutRuntime(layerId, nodeId);
      if (rt) {
        setLiveRamp({
          progress: rt.rampProgress,
          density: rt.progressiveDensity,
          wordMs: rt.wordDurationMs,
        });
      }
      rafId = requestAnimationFrame(sample);
    };
    rafId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(rafId);
  }, [layerId, nodeId]);

  const textInEdge = layer?.graph?.edges?.find(e => e.toNodeId === nodeId && e.toPort === 'text_in');
  const linkedCue = findConnectedTextCue(layer, nodeId, 'text_in');

  const applyCueUpdate = (updates: Partial<TextCueSource>) => {
    if (!linkedCue || Object.keys(updates).length === 0) return;
    if (linkedCue.isSource) {
      updateLayer(layerId, { source: { ...layer.source, ...updates } as any });
    } else {
      updateEffect(layerId, linkedCue.nodeId, updates as any);
    }
  };

  const activeBankIdx = linkedCue?.cue.activeBankIndex ?? 0;
  const activeBank = linkedCue?.cue.banks?.[activeBankIdx];
  const cardIdx = activeBank?.activeCardIndex ?? 0;
  const cardCount = activeBank?.cards?.length ?? 0;
  const populatedBanks = linkedCue ? getPopulatedBankCandidates(linkedCue.cue) : [];

  const survivorCount = effect.survivorCount ?? 0;
  const totalWordCount = effect.totalWordCount ?? 0;

  return (
    <div
      className="vocal-env-rack"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Top Status & Text Bank Card / Bank Independent Controls */}
      {linkedCue ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            background: '#111115',
            border: '1px solid #2b2b33',
            borderRadius: 3,
            padding: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span style={{ fontSize: 8, color: '#f5c518', fontWeight: 700 }}>TEXT BANK LINKED</span>
            <span style={{ fontSize: 8, color: '#888' }}>
              SURV {survivorCount}/{totalWordCount}
            </span>
          </div>

          {/* Independent Card Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="range-mode-btn"
              style={{ margin: 0, padding: '2px 6px', fontSize: 9 }}
              title="Previous card in active bank"
              onClick={() => applyCueUpdate(stepTextCueCardBy(linkedCue.cue, -1, true))}
            >
              ◀
            </button>
            <span style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#ddd' }}>
              Card {cardCount > 0 ? `${cardIdx + 1}/${cardCount}` : 'Empty'}
            </span>
            <button
              className="range-mode-btn"
              style={{ margin: 0, padding: '2px 6px', fontSize: 9 }}
              title="Next card in active bank"
              onClick={() => applyCueUpdate(stepTextCueCardBy(linkedCue.cue, 1, true))}
            >
              ▶
            </button>
          </div>

          {/* Independent Bank Stepper + Direct Bank Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="range-mode-btn"
              style={{ margin: 0, padding: '2px 6px', fontSize: 9 }}
              title="Previous Text Bank"
              onClick={() => applyCueUpdate(stepTextCueBankBy(linkedCue.cue, -1))}
            >
              ◀
            </button>
            <select
              value={activeBankIdx}
              onChange={e => applyCueUpdate(selectTextCueBankIndex(linkedCue.cue, parseInt(e.target.value, 10)))}
              style={{
                flex: 1,
                background: '#18181d',
                color: '#eee',
                border: '1px solid #333',
                fontSize: 9,
                padding: '2px 4px',
                borderRadius: 2,
              }}
            >
              {(populatedBanks.length > 0 ? populatedBanks : [activeBankIdx]).map(bi => {
                const slot = linkedCue.cue.banks?.[bi];
                const cnt = slot?.cards?.length ?? 0;
                return (
                  <option key={bi} value={bi}>
                    {slot?.name || `Bank ${bi + 1}`} ({cnt})
                  </option>
                );
              })}
            </select>
            <button
              className="range-mode-btn"
              style={{ margin: 0, padding: '2px 6px', fontSize: 9 }}
              title="Next Text Bank"
              onClick={() => applyCueUpdate(stepTextCueBankBy(linkedCue.cue, 1))}
            >
              ▶
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span
            style={{
              fontSize: 8,
              padding: '1px 5px',
              borderRadius: 2,
              background: textInEdge ? 'rgba(24,228,245,0.14)' : '#1a1a1f',
              color: textInEdge ? '#18e4f5' : '#888',
              border: `1px solid ${textInEdge ? 'rgba(24,228,245,0.35)' : '#2c2c33'}`,
            }}
          >
            {textInEdge ? 'EXT TEXT IN' : 'LOCAL PROSE'}
          </span>
          <span style={{ fontSize: 8, color: '#888' }}>
            SURV {survivorCount}/{totalWordCount}
          </span>
          {!textInEdge && (
            <button
              className={`range-mode-btn ${editingText ? 'active-music' : ''}`}
              style={{ margin: 0, fontSize: 8, padding: '2px 6px' }}
              onClick={() => setEditingText(v => !v)}
            >
              Edit Text
            </button>
          )}
        </div>
      )}

      {!textInEdge && editingText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <textarea
            value={effect.localText ?? ''}
            onChange={e => onUpdate({ localText: e.target.value })}
            rows={4}
            placeholder="Paste prose/poem. Use [word] to pin visible, [[word]] to pre-redact..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: '#0d0d10',
              color: '#e5e5e5',
              border: '1px solid #333',
              borderRadius: 3,
              fontSize: 10,
              padding: 5,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 8, color: '#6e6e78' }}>
            Markup: [pin visible] · [[pre-redact]] · \[, \] literal
          </span>
        </div>
      )}

      {/* Style Preset Selector (9 styles) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="rack-row-label" style={{ minWidth: 32 }}>Style</span>
        <select
          value={effect.stylePreset ?? 'sharpie_zine'}
          onChange={e => onUpdate({ stylePreset: e.target.value as BlackoutStylePreset })}
          style={{
            flex: 1,
            background: '#141418',
            color: '#f5c518',
            border: '1px solid #383842',
            fontSize: 10,
            padding: '3px 5px',
            borderRadius: 3,
            fontWeight: 600,
          }}
        >
          {STYLE_OPTIONS.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Selection Mode Pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
        {SELECTION_MODES.map(m => {
          const active = (effect.selectionMode ?? 'entropy') === m.id;
          return (
            <button
              key={m.id}
              className={`range-mode-btn ${active ? 'active-voice' : ''}`}
              style={{ margin: 0, fontSize: 8, padding: '3px 2px' }}
              title={m.title}
              onClick={() => onUpdate({ selectionMode: m.id })}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Density + Reroll Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: (effect.rampMode ?? 'off') !== 'off' ? 0.55 : 1 }}>
        <span className="rack-row-label" style={{ fontSize: 9, minWidth: 52 }}>
          {(effect.rampMode ?? 'off') !== 'off'
            ? `Sweep ${Math.round(liveRamp.density * 100)}%`
            : `Blackout ${Math.round((effect.density ?? 0.62) * 100)}%`}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          disabled={(effect.rampMode ?? 'off') !== 'off'}
          value={(effect.rampMode ?? 'off') !== 'off' ? liveRamp.density : (effect.density ?? 0.62)}
          onChange={e => onUpdate({ density: parseFloat(e.target.value) })}
          style={{ flex: 1, accentColor: '#f5c518' }}
        />
        <button
          className="range-mode-btn"
          style={{ margin: 0, fontSize: 8, padding: '3px 6px' }}
          title="Reroll entropic survival seed"
          onClick={() => onUpdate({ seed: ((effect.seed ?? 1) % 9999) + 1 })}
        >
          🎲 #{effect.seed ?? 1}
        </button>
      </div>

      {/* Progressive Card Sweep (Floor -> Ceiling) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
          background: '#111115',
          border: '1px solid #282832',
          borderRadius: 3,
          padding: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="rack-row-label" style={{ fontSize: 8, color: '#2ee67d' }}>SWEEP</span>
          <select
            value={effect.rampMode ?? 'off'}
            onChange={e => onUpdate({ rampMode: e.target.value as BlackoutRampMode })}
            title="Auto-progressive blackout ramp mode"
            style={{
              flex: 1,
              background: '#18181f',
              color: (effect.rampMode ?? 'off') !== 'off' ? '#2ee67d' : '#aaa',
              border: '1px solid #333',
              fontSize: 9,
              padding: '2px 4px',
              borderRadius: 2,
            }}
          >
            <option value="off">Off (Manual/CV)</option>
            <option value="once">Floor → Ceil (Once)</option>
            <option value="loop">Loop</option>
            <option value="pingpong">Ping-Pong</option>
          </select>
          {(effect.rampMode ?? 'off') !== 'off' && (
            <>
              <button
                className={`range-mode-btn ${!effect.rampPaused ? 'active-voice' : ''}`}
                style={{ margin: 0, fontSize: 9, padding: '2px 6px' }}
                title={effect.rampPaused ? 'Resume sweep' : 'Pause sweep'}
                onClick={() => onUpdate({ rampPaused: !effect.rampPaused })}
              >
                {effect.rampPaused ? '▶' : '⏸'}
              </button>
              <button
                className="range-mode-btn"
                style={{ margin: 0, fontSize: 9, padding: '2px 6px' }}
                title="Restart sweep from Floor"
                onClick={() => onUpdate({ manualRampResetTrigger: Date.now() })}
              >
                ↺
              </button>
            </>
          )}
        </div>

        {(effect.rampMode ?? 'off') !== 'off' && (
          <>
            <div style={{ width: '100%', height: 4, background: '#09090b', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, liveRamp.progress * 100))}%`,
                  height: '100%',
                  background: '#2ee67d',
                }}
              />
            </div>
            <div className="vocal-knob-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              <div className="vocal-knob-item">
                <Knob
                  value={effect.rampFloor ?? 0}
                  min={0}
                  max={1}
                  resetValue={0}
                  color="#18e4f5"
                  onChange={v => onUpdate({ rampFloor: Math.round(v * 100) / 100 })}
                />
                <span className="vocal-knob-label">FLR {Math.round((effect.rampFloor ?? 0) * 100)}%</span>
              </div>
              <div className="vocal-knob-item">
                <Knob
                  value={effect.rampCeiling ?? 0.85}
                  min={0}
                  max={1}
                  resetValue={0.85}
                  color="#f5c518"
                  onChange={v => onUpdate({ rampCeiling: Math.round(v * 100) / 100 })}
                />
                <span className="vocal-knob-label">CEIL {Math.round((effect.rampCeiling ?? 0.85) * 100)}%</span>
              </div>
              <div className="vocal-knob-item">
                <Knob
                  value={effect.rampDurationSec ?? 12}
                  min={1}
                  max={60}
                  resetValue={12}
                  color="#2ee67d"
                  onChange={v => onUpdate({ rampDurationSec: Math.round(v * 10) / 10 })}
                />
                <span className="vocal-knob-label">TIME {(effect.rampDurationSec ?? 12).toFixed(1)}s</span>
              </div>
              <label
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 8, color: '#bbb', cursor: 'pointer' }}
                title="Reset sweep back to Floor whenever Text Bank card/text changes"
              >
                <input
                  type="checkbox"
                  checked={effect.resetOnCardChange !== false}
                  onChange={e => onUpdate({ resetOnCardChange: e.target.checked })}
                />
                Rst/Card
              </label>
            </div>
          </>
        )}
      </div>

      {/* Core Knobs */}
      <div className="vocal-knob-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        <div className="vocal-knob-item">
          <Knob
            value={effect.lengthBias ?? 0.25}
            min={-1}
            max={1}
            resetValue={0.25}
            color="#18e4f5"
            onChange={v => onUpdate({ lengthBias: Math.round(v * 100) / 100 })}
          />
          <span className="vocal-knob-label">LEN {(effect.lengthBias ?? 0.25).toFixed(2)}</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.styleIntensity ?? 0.6}
            min={0}
            max={1}
            resetValue={0.6}
            color="#f5c518"
            onChange={v => onUpdate({ styleIntensity: Math.round(v * 100) / 100 })}
          />
          <span className="vocal-knob-label">STYLE {Math.round((effect.styleIntensity ?? 0.6) * 100)}%</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.wordDurationMs ?? 400}
            min={20}
            max={3000}
            resetValue={400}
            color="#2ee67d"
            onChange={v => onUpdate({ wordDurationMs: Math.round(v) })}
          />
          <span className="vocal-knob-label">WORD {Math.round(liveRamp.wordMs)}ms</span>
        </div>
        <div className="vocal-knob-item" style={{ opacity: effect.transparentBg ? 0.4 : 1 }}>
          <Knob
            value={effect.paperOpacity ?? 0.92}
            min={0}
            max={1}
            resetValue={0.92}
            color="#d918f5"
            onChange={v => onUpdate({ paperOpacity: Math.round(v * 100) / 100 })}
          />
          <span className="vocal-knob-label">
            {effect.transparentBg ? 'BG OFF' : `PAPER ${Math.round((effect.paperOpacity ?? 0.92) * 100)}%`}
          </span>
        </div>
      </div>

      {/* Mode-specific secondary controls */}
      {effect.selectionMode === 'spotlight' && (
        <div className="vocal-knob-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          <div className="vocal-knob-item">
            <Knob
              value={effect.cursorX ?? 0.5}
              min={0}
              max={1}
              resetValue={0.5}
              color="#18e4f5"
              onChange={v => onUpdate({ cursorX: Math.round(v * 100) / 100 })}
            />
            <span className="vocal-knob-label">SPOT X</span>
          </div>
          <div className="vocal-knob-item">
            <Knob
              value={effect.cursorY ?? 0.5}
              min={0}
              max={1}
              resetValue={0.5}
              color="#18e4f5"
              onChange={v => onUpdate({ cursorY: Math.round(v * 100) / 100 })}
            />
            <span className="vocal-knob-label">SPOT Y</span>
          </div>
          <div className="vocal-knob-item">
            <Knob
              value={effect.radius ?? 0.35}
              min={0.05}
              max={1.2}
              resetValue={0.35}
              color="#f5c518"
              onChange={v => onUpdate({ radius: Math.round(v * 100) / 100 })}
            />
            <span className="vocal-knob-label">RAD {(effect.radius ?? 0.35).toFixed(2)}</span>
          </div>
          <div className="vocal-knob-item">
            <Knob
              value={effect.softness ?? 0.25}
              min={0}
              max={1}
              resetValue={0.25}
              color="#f5a623"
              onChange={v => onUpdate({ softness: Math.round(v * 100) / 100 })}
            />
            <span className="vocal-knob-label">SOFT {Math.round((effect.softness ?? 0.25) * 100)}%</span>
          </div>
        </div>
      )}

      {effect.selectionMode === 'glimpse' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="rack-row-label" style={{ fontSize: 9 }}>Flash Rel {Math.round(effect.flashReleaseMs ?? 320)}ms</span>
          <input
            type="range"
            min={40}
            max={2000}
            step={10}
            value={effect.flashReleaseMs ?? 320}
            onChange={e => onUpdate({ flashReleaseMs: parseInt(e.target.value, 10) })}
            style={{ flex: 1 }}
          />
        </div>
      )}

      {/* Compact flags + Typography / Palette foldout toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: effect.transparentBg ? '#18e4f5' : '#bbb', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!effect.transparentBg}
            onChange={e => onUpdate({ transparentBg: e.target.checked })}
          />
          Transp BG
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#bbb', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!effect.invertMask}
            onChange={e => onUpdate({ invertMask: e.target.checked })}
          />
          Invert
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#bbb', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!effect.ignorePins}
            onChange={e => onUpdate({ ignorePins: e.target.checked })}
          />
          Ignore [Pins]
        </label>
        <button
          className={`range-mode-btn ${showStyleOpts ? 'active-music' : ''}`}
          style={{ margin: 0, fontSize: 8, padding: '2px 6px' }}
          onClick={() => setShowStyleOpts(v => !v)}
        >
          {showStyleOpts ? 'Hide Type/Color' : 'Type & Color ▾'}
        </button>
      </div>

      {showStyleOpts && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            background: '#111115',
            border: '1px solid #282830',
            borderRadius: 3,
            padding: 6,
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              value={effect.fontFamily ?? 'typewriter'}
              onChange={e => onUpdate({ fontFamily: e.target.value as BlackoutFontFamily })}
              style={{ flex: 1, background: '#16161b', color: '#ddd', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
            >
              <option value="typewriter">Typewriter</option>
              <option value="editorial_serif">Editorial Serif</option>
              <option value="brutalist_sans">Brutalist Sans</option>
              <option value="zine_mono">Zine Mono</option>
              <option value="brush_script">Brush Script</option>
            </select>
            <select
              value={effect.layoutMode ?? 'editorial'}
              onChange={e => onUpdate({ layoutMode: e.target.value as BlackoutLayoutMode })}
              style={{ flex: 1, background: '#16161b', color: '#ddd', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
            >
              <option value="editorial">Page Block</option>
              <option value="centered_verse">Centered Verse</option>
              <option value="column">Narrow Column</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            <select
              value={effect.punctuationMode ?? 'attached'}
              onChange={e => onUpdate({ punctuationMode: e.target.value as BlackoutPunctuationMode })}
              title="Punctuation treatment"
              style={{ flex: 1, background: '#16161b', color: '#ddd', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
            >
              <option value="attached">Punct: Attached</option>
              <option value="strip">Punct: Strip</option>
              <option value="preserve">Punct: Pin Visible</option>
            </select>
            <select
              value={effect.matteTarget ?? 'surviving'}
              onChange={e => onUpdate({ matteTarget: e.target.value as BlackoutMatteTarget })}
              title="Matte Out target"
              style={{ flex: 1, background: '#16161b', color: '#ddd', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
            >
              <option value="surviving">Matte: Surviving</option>
              <option value="redaction">Matte: Redact Bars</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="rack-row-label" style={{ fontSize: 9 }}>Size {Math.round(effect.fontSize ?? 40)}px</span>
            <input
              type="range"
              min={18}
              max={96}
              step={1}
              value={effect.fontSize ?? 40}
              onChange={e => onUpdate({ fontSize: parseInt(e.target.value, 10) })}
              style={{ flex: 1 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, fontSize: 8, color: '#999' }}>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              Paper
              <input
                type="color"
                value={rgbaToHex(effect.paperColor, '#f0e8d6')}
                onChange={e => onUpdate({ paperColor: hexToRgba(e.target.value, 1) })}
                style={{ width: 28, height: 18, padding: 0, border: '1px solid #333', background: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              Ink
              <input
                type="color"
                value={rgbaToHex(effect.textColor, '#17171c')}
                onChange={e => onUpdate({ textColor: hexToRgba(e.target.value, 1) })}
                style={{ width: 28, height: 18, padding: 0, border: '1px solid #333', background: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              Bar
              <input
                type="color"
                value={rgbaToHex(effect.barColor, '#0d0d10')}
                onChange={e => onUpdate({ barColor: hexToRgba(e.target.value, 1) })}
                style={{ width: 28, height: 18, padding: 0, border: '1px solid #333', background: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              Glow
              <input
                type="color"
                value={rgbaToHex(effect.accentColor, '#f5d13d')}
                onChange={e => onUpdate({ accentColor: hexToRgba(e.target.value, 1) })}
                style={{ width: 28, height: 18, padding: 0, border: '1px solid #333', background: 'none' }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
