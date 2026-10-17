import { SpokenWordVisualizerEffect } from '../../../state/types';
import { useEngineStore } from '../../../state/store';

export function SpokenWordVisualizerUI({
  nodeId,
  layerId,
  effect: _effect,
  onUpdate: _onUpdate,
  inputSettings: _inputSettings
}: {
  nodeId: string;
  layerId: string;
  effect: SpokenWordVisualizerEffect;
  onUpdate: (u: Partial<SpokenWordVisualizerEffect>) => void;
  inputSettings?: Record<string, any>;
}) {
  const envVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.envelope_out`] ?? 0);
  const cadenceVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.cadence_out`] ?? 0);
  const brightnessVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.timbre_brightness`] ?? 0);
  const flatnessVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.timbre_flatness`] ?? 0);
  const sibilanceVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.sibilance`] ?? 0);
  const hzVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.pitch_hz`] ?? 0);
  const stabilityVal = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.stability`] ?? 0);
  const vowelX = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_x`] ?? 0.5);
  const vowelY = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_y`] ?? 0.5);

  const onsetPulse = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.onset_pulse`] ?? 0);
  const speechTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.speech_trig`] ?? 0);
  const silenceTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.silence_trig`] ?? 0);
  const noteTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.note_change_trig`] ?? 0);
  const vowelTrig = useEngineStore(s => s.layers[layerId]?.signalValues?.[`${nodeId}.vowel_change_trig`] ?? 0);

  const getNoteName = (hz: number) => {
    if (hz <= 20) return { note: '---', cents: 0 };
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = 12 * Math.log2(hz / 440) + 69;
    const roundedMidi = Math.round(midi);
    const cents = Math.round((midi - roundedMidi) * 100);
    const note = noteNames[roundedMidi % 12] + Math.floor(roundedMidi / 12 - 1);
    return { note, cents };
  };

  const { note, cents } = getNoteName(hzVal);

  const renderMeter = (label: string, value: number, formattedValue: string, maxVal: number = 1) => {
    const pct = Math.max(0, Math.min(100, (value / (maxVal || 1)) * 100));
    return (
      <div className="spoken-word-meter-row">
        <div className="spoken-word-meter-label">
          <span>{label}</span>
          <span className="spoken-word-meter-val">{formattedValue}</span>
        </div>
        <div className="spoken-word-meter-bar">
          <div className="spoken-word-meter-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  const renderLed = (label: string, active: boolean) => (
    <div className="spoken-word-led-row">
      <span className="spoken-word-led-label">{label}</span>
      <div className={`spoken-word-led-dot ${active ? 'active' : ''}`} />
    </div>
  );

  return (
    <div className="spoken-word-rack" onPointerDown={e => e.stopPropagation()}>
      <div className="spoken-word-grid">
        <div className="spoken-word-column">
          <div className="spoken-word-sub-header">Continuous Signals</div>
          {renderMeter('ENV FOLLOW', envVal, envVal.toFixed(3))}
          {renderMeter('CADENCE', cadenceVal, cadenceVal.toFixed(2))}
          {renderMeter('TIMB BRIGHT', brightnessVal, `${Math.round(brightnessVal)} Hz`, 8000)}
          {renderMeter('TIMB FLAT', flatnessVal, flatnessVal.toFixed(3))}
          {renderMeter('SIBILANCE', sibilanceVal, sibilanceVal.toFixed(3))}
          {renderMeter('STABILITY', stabilityVal, stabilityVal.toFixed(2))}
        </div>

        <div className="spoken-word-column">
          <div className="spoken-word-sub-header">Pitch & Formants</div>
          
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1, background: '#080c0a', border: '1px solid #1a221f', borderRadius: 4, padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 'bold', color: '#18e4f5', fontFamily: 'monospace' }}>{note}</span>
              <span style={{ fontSize: 7, color: '#0f8b96', fontFamily: 'monospace' }}>{cents >= 0 ? '+' : ''}{cents}c</span>
            </div>
            
            <div style={{ flex: 1, background: '#0c080b', border: '1px solid #221a21', borderRadius: 4, padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#d918f5', fontFamily: 'monospace' }}>
                {vowelX < 0.5 ? (vowelY >= 0.5 ? 'Oo' : 'Oh') : (vowelY >= 0.5 ? 'Ee' : 'Ah')}
              </span>
              <span style={{ fontSize: 6, color: '#960f8b', fontFamily: 'monospace' }}>X:{vowelX.toFixed(2)} Y:{vowelY.toFixed(2)}</span>
            </div>
          </div>

          <div className="spoken-word-sub-header" style={{ marginTop: 2 }}>Triggers</div>
          {renderLed('ONSET PULSE', onsetPulse > 0.5)}
          {renderLed('SPEECH ACTIVE', speechTrig > 0.5 || envVal > 0.15)}
          {renderLed('SILENCE TRANSIENT', silenceTrig > 0.5)}
          {renderLed('NOTE SHIFT', noteTrig > 0.5)}
          {renderLed('VOWEL SHIFT', vowelTrig > 0.5)}
        </div>
      </div>
    </div>
  );
}
