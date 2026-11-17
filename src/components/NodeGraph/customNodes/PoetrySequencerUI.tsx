import { useEffect, useState } from 'react';
import { useEngineStore } from '../../../state/store';
import { SignalDispatcher } from '../../../state/SignalDispatcher';
import {
  PoetrySequencerEffect,
  PoetrySequencerCadenceMode,
  PoetrySequencerEndAction,
  PoetrySequencerCaesuraAction,
} from '../../../state/types';
import { PoetryUnit, PoetryRevealMode, tokenizePoetry } from '../../../utils/poetryUtils';
import { Knob } from './Knob';

interface LiveTelemetry {
  idx: number;
  total: number;
  prevToken: string;
  activeToken: string;
  nextToken: string;
  cadence: number;
  syllableRateHz: number;
  tension: number;
  inSpeech: boolean;
  silenceMs: number;
  stepLed: boolean;
  caesuraLed: boolean;
}

export function PoetrySequencerUI({
  nodeId,
  layerId,
  effect,
  onUpdate,
}: {
  nodeId: string;
  layerId: string;
  effect: PoetrySequencerEffect;
  onUpdate: (u: Partial<PoetrySequencerEffect>) => void;
}) {
  const hasExternalText = useEngineStore(s =>
    !!s.layers[layerId]?.graph?.edges.some(e => e.toNodeId === nodeId && e.toPort === 'text_in')
  );
  const [editingText, setEditingText] = useState(false);

  const [telemetry, setTelemetry] = useState<LiveTelemetry>(() => {
    const tokens = tokenizePoetry(effect.localText ?? '', effect.parseUnit ?? 'word');
    const idx = Math.max(0, Math.min(Math.max(0, tokens.length - 1), effect.currentStepIndex ?? 0));
    return {
      idx,
      total: tokens.length,
      prevToken: idx > 0 ? tokens[idx - 1].text : '',
      activeToken: tokens[idx]?.text ?? '',
      nextToken: idx + 1 < tokens.length ? tokens[idx + 1].text : '',
      cadence: 0,
      syllableRateHz: 0,
      tension: 0,
      inSpeech: false,
      silenceMs: 0,
      stepLed: false,
      caesuraLed: false,
    };
  });

  useEffect(() => {
    let rafId = 0;
    const sample = () => {
      const rt = SignalDispatcher.getInstance().getPoetrySequencerRuntime(layerId, nodeId);
      if (rt) {
        const total = rt.tokens.length;
        const idx = total > 0 ? Math.max(0, Math.min(total - 1, rt.currentStepIndex)) : 0;
        const prevToken = total > 0 && idx > 0 ? rt.tokens[idx - 1].text : '';
        const activeToken = total > 0 ? rt.tokens[idx].text : '';
        const nextToken = total > 0 && idx + 1 < total ? rt.tokens[idx + 1].text : '';
        setTelemetry({
          idx,
          total,
          prevToken,
          activeToken,
          nextToken,
          cadence: rt.cadence,
          syllableRateHz: rt.syllableRateHz,
          tension: rt.pauseTensionCv,
          inSpeech: rt.inSpeech,
          silenceMs: rt.silenceDurationMs,
          stepLed: rt.stepPulseMs > 0,
          caesuraLed: rt.caesuraPulseMs > 0,
        });
      }
      rafId = requestAnimationFrame(sample);
    };
    rafId = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(rafId);
  }, [layerId, nodeId]);

  const modes: { id: PoetrySequencerCadenceMode; label: string; title: string }[] = [
    { id: 'breath_resume', label: 'RESUME (C)', title: 'Approach C: Step when speech resumes after a breath pause' },
    { id: 'breath_pause', label: 'PAUSE (C)', title: 'Approach C: Step when pause reaches Breath ms' },
    { id: 'syllable', label: 'SYLL (A)', title: 'Approach A: Step on each vocalic syllable onset' },
    { id: 'external_trig', label: 'EXT TRIG', title: 'Step only via external Step Trig port or manual buttons' },
  ];

  return (
    <div
      className="vocal-env-rack"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}
      onPointerDown={e => e.stopPropagation()}
    >
      {/* Status header & LEDs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div className={`onset-led ${telemetry.stepLed ? 'active' : ''}`} title="Step Pulse" />
          <span className="rack-row-label" style={{ fontSize: 9 }}>
            STEP {telemetry.total > 0 ? `${telemetry.idx + 1}/${telemetry.total}` : '0/0'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span
            style={{
              fontSize: 8,
              padding: '1px 4px',
              borderRadius: 2,
              background: hasExternalText ? 'rgba(245, 197, 24, 0.16)' : '#1a1a1a',
              color: hasExternalText ? '#f5c518' : '#777',
              border: `1px solid ${hasExternalText ? 'rgba(245,197,24,0.4)' : '#2d2d2d'}`,
            }}
          >
            {hasExternalText ? 'TEXT IN' : 'LOCAL'}
          </span>
          <div
            className={`onset-led ${telemetry.caesuraLed ? 'active' : ''}`}
            style={telemetry.caesuraLed ? { background: '#f5a623', boxShadow: '0 0 6px #f5a623' } : undefined}
            title="Hard Caesura Pulse"
          />
          <span className="rack-row-label" style={{ fontSize: 8 }}>CAES</span>
        </div>
      </div>

      {/* Prev -> Active -> Next token strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          background: '#0b0b0c',
          border: '1px solid #26262a',
          borderRadius: 3,
          padding: '5px 6px',
          minHeight: 28,
        }}
      >
        <span style={{ fontSize: 9, color: '#5c5c66', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
          {telemetry.prevToken || '·'}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#f5c518',
            background: 'rgba(245, 197, 24, 0.12)',
            padding: '1px 6px',
            borderRadius: 2,
            maxWidth: 110,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {telemetry.activeToken || '—'}
        </span>
        <span style={{ fontSize: 9, color: '#787886', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {telemetry.nextToken || '·'}
        </span>
      </div>

      {/* Mode pills */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        {modes.map(m => {
          const active = effect.cadenceMode === m.id;
          return (
            <button
              key={m.id}
              className={`range-mode-btn ${active ? 'active-voice' : ''}`}
              style={{ margin: 0, fontSize: 8, padding: '3px 4px' }}
              title={m.title}
              onClick={() => onUpdate({ cadenceMode: m.id })}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Unit & Reveal selectors */}
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={effect.parseUnit ?? 'word'}
          onChange={e => onUpdate({ parseUnit: e.target.value as PoetryUnit })}
          title="Token unit"
          style={{ flex: 1, background: '#121214', color: '#ddd', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
        >
          <option value="word">Unit: Word</option>
          <option value="line">Unit: Line</option>
          <option value="stanza">Unit: Stanza</option>
        </select>
        <select
          value={effect.revealMode ?? 'single'}
          onChange={e => onUpdate({ revealMode: e.target.value as PoetryRevealMode })}
          title="Output accumulation style"
          style={{ flex: 1, background: '#121214', color: '#ddd', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
        >
          <option value="single">Out: Single</option>
          <option value="accumulate_line">Out: Accum Line</option>
          <option value="accumulate_stanza">Out: Accum Stanza</option>
        </select>
      </div>

      {/* A (Syllable rate) & C (Pause tension) dual telemetry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#888' }}>
          <span>CADENCE (A): {telemetry.syllableRateHz.toFixed(1)} syl/s</span>
          <span>{telemetry.inSpeech ? 'SPEECH' : `SIL ${Math.round(telemetry.silenceMs)}ms`}</span>
        </div>
        <div style={{ width: '100%', height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, telemetry.cadence * 100)}%`, height: '100%', background: '#18e4f5' }} />
        </div>
        <div style={{ width: '100%', height: 4, background: '#111', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, telemetry.tension * 100)}%`, height: '100%', background: '#f5a623' }} />
        </div>
      </div>

      {/* Knobs: A + C tuning */}
      <div className="vocal-knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        <div className="vocal-knob-item">
          <Knob
            value={effect.sensitivityDb ?? -38}
            min={-60}
            max={0}
            resetValue={-38}
            color="#18e4f5"
            onChange={v => onUpdate({ sensitivityDb: Math.round(v) })}
          />
          <span className="vocal-knob-label">SENS {Math.round(effect.sensitivityDb ?? -38)}dB</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.prominenceDb ?? 6}
            min={1}
            max={18}
            resetValue={6}
            color="#2ee67d"
            onChange={v => onUpdate({ prominenceDb: Math.round(v * 10) / 10 })}
          />
          <span className="vocal-knob-label">PROM {(effect.prominenceDb ?? 6).toFixed(1)}dB</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.lockoutMs ?? 135}
            min={80}
            max={350}
            resetValue={135}
            color="#2ee67d"
            onChange={v => onUpdate({ lockoutMs: Math.round(v) })}
          />
          <span className="vocal-knob-label">LOCK {Math.round(effect.lockoutMs ?? 135)}ms</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.microGapMs ?? 180}
            min={50}
            max={350}
            resetValue={180}
            color="#f5a623"
            onChange={v => onUpdate({ microGapMs: Math.round(v) })}
          />
          <span className="vocal-knob-label">GAP {Math.round(effect.microGapMs ?? 180)}ms</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.breathPauseMs ?? 450}
            min={200}
            max={1500}
            resetValue={450}
            color="#f5a623"
            onChange={v => onUpdate({ breathPauseMs: Math.round(v) })}
          />
          <span className="vocal-knob-label">BRTH {Math.round(effect.breathPauseMs ?? 450)}ms</span>
        </div>
        <div className="vocal-knob-item">
          <Knob
            value={effect.caesuraPauseMs ?? 1600}
            min={800}
            max={5000}
            resetValue={1600}
            color="#d918f5"
            onChange={v => onUpdate({ caesuraPauseMs: Math.round(v) })}
          />
          <span className="vocal-knob-label">CAES {Math.round(effect.caesuraPauseMs ?? 1600)}ms</span>
        </div>
      </div>

      {/* End-of-passage & Hard-caesura actions */}
      <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={effect.endAction ?? 'advance_text_bank'}
          onChange={e => onUpdate({ endAction: e.target.value as PoetrySequencerEndAction })}
          title="Behavior after last token"
          style={{ flex: 1, background: '#121214', color: '#ccc', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
        >
          <option value="advance_text_bank">End: Next Bank</option>
          <option value="loop">End: Loop</option>
          <option value="hold">End: Hold</option>
        </select>
        <select
          value={effect.caesuraAction ?? 'none'}
          onChange={e => onUpdate({ caesuraAction: e.target.value as PoetrySequencerCaesuraAction })}
          title="Action on hard caesura pause"
          style={{ flex: 1, background: '#121214', color: '#ccc', border: '1px solid #333', fontSize: 9, padding: '2px 4px', borderRadius: 2 }}
        >
          <option value="none">Caes: Out Only</option>
          <option value="step">Caes: Step</option>
          <option value="reset">Caes: Reset</option>
          <option value="advance_text_bank">Caes: Next Bank</option>
        </select>
      </div>

      {/* Transport + local poem editor toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="range-mode-btn"
          style={{ flex: 1, margin: 0, fontSize: 9 }}
          onClick={() => onUpdate({ manualPrevTrigger: Date.now() })}
        >
          ◀ Prev
        </button>
        <button
          className="range-mode-btn active-voice"
          style={{ flex: 1, margin: 0, fontSize: 9 }}
          onClick={() => onUpdate({ manualStepTrigger: Date.now() })}
        >
          Step ▶
        </button>
        <button
          className="range-mode-btn"
          style={{ flex: 1, margin: 0, fontSize: 9 }}
          onClick={() => onUpdate({ manualResetTrigger: Date.now() })}
        >
          ↺ Reset
        </button>
        {!hasExternalText && (
          <button
            className={`range-mode-btn ${editingText ? 'active-music' : ''}`}
            style={{ margin: 0, fontSize: 9, padding: '2px 6px' }}
            onClick={() => setEditingText(v => !v)}
            title="Edit local passage text"
          >
            Edit
          </button>
        )}
      </div>

      {!hasExternalText && editingText && (
        <textarea
          value={effect.localText ?? ''}
          onChange={e => onUpdate({ localText: e.target.value })}
          rows={4}
          placeholder="Paste poem/prose (blank lines separate stanzas)..."
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
      )}
    </div>
  );
}
