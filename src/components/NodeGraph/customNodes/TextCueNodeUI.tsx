import React, { useState, useEffect } from 'react';
import { TextCueSource, TextCueBankSlot } from '../../../state/types';
import { useEngineStore } from '../../../state/store';
import { MidiManager } from '../../../state/MidiManager';
import { TextCueBankModal } from './TextCueBankModal';
import { Slider, KeyMappingRow } from '../controls/controlHelpers';
import { stepTextCueCard, stepTextCueBank } from '../../../utils/textCueUtils';
import './TextCueNodeUI.css';

interface TextCueNodeUIProps {
  nodeId?: string;
  layerId?: string;
  source: TextCueSource;
  onUpdate: (updates: Partial<TextCueSource>) => void;
  rowCtx?: any;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const formatMidiNote = (note: number) => {
  const name = NOTE_NAMES[note % 12] || 'C';
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
};

export function TextCueNodeUI({
  nodeId: _nodeId,
  layerId,
  source,
  onUpdate,
  rowCtx
}: TextCueNodeUIProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCardTriggerActive, setIsCardTriggerActive] = useState(false);
  const [isBankTriggerActive, setIsBankTriggerActive] = useState(false);
  const [learningPadIdx, setLearningPadIdx] = useState<number | null>(null);
  const midiOverlayActive = useEngineStore(s => s.midiOverlayActive);
  const storeLayer = useEngineStore(s => (layerId ? s.layers[layerId] : undefined));

  const banks: TextCueBankSlot[] = Array.from({ length: 24 }, (_, i) => {
    return source.banks?.[i] || {
      id: `bank-${i + 1}`,
      name: `Bank ${i + 1}`,
      cards: [],
      playbackOrder: 'in_order',
      loopMode: 'loop',
      autoPlayback: false,
      playbackSpeed: 1.0,
      activeCardIndex: 0
    };
  });

  const maxBanks = source.bankGridMode === '24' ? 24 : source.bankGridMode === '16' ? 16 : 8;
  const activeBankIdx = source.activeBankIndex ?? 0;
  const activeBank = banks[activeBankIdx];
  const activeCardIdx = activeBank?.activeCardIndex ?? 0;
  const activeCard = activeBank?.cards?.[activeCardIdx];
  const displayText = source.currentText ?? activeCard?.text ?? '';

  const effectiveRowCtx = rowCtx || { layer: storeLayer };

  // Ensure MidiManager is initialized if pad mappings exist
  useEffect(() => {
    if (source.midiPadMappings && Object.keys(source.midiPadMappings).length > 0) {
      MidiManager.getInstance().initialize();
    }
  }, [source.midiPadMappings]);

  // ── 1-Click MIDI Note Learn Listener for Bank Pads ──────────────────────
  useEffect(() => {
    if (learningPadIdx === null) {
      MidiManager.getInstance().isPadLearning = false;
      return;
    }

    const mgr = MidiManager.getInstance();
    mgr.initialize();
    mgr.isPadLearning = true;

    const handleMidiMsg = (data: Uint8Array) => {
      if (!data || data.length < 2) return;
      const status = data[0];
      const command = status & 0xf0;
      const channel = (status & 0x0f) + 1;
      const note = data[1];
      const velocity = data.length > 2 ? data[2] : 0;

      if (command === 0x90 && velocity > 0) {
        const nextMappings = { ...(source.midiPadMappings || {}) };
        nextMappings[learningPadIdx] = { note, channel };
        onUpdate({ midiPadMappings: nextMappings });
        setLearningPadIdx(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLearningPadIdx(null);
      }
    };

    mgr.addMessageListener(handleMidiMsg);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      mgr.isPadLearning = false;
      mgr.removeMessageListener(handleMidiMsg);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [learningPadIdx, source.midiPadMappings, onUpdate]);

  // ── Manual Card Step & Bank Step Buttons ─────────────────────────────────
  const handleManualCardTrigger = () => {
    setIsCardTriggerActive(true);
    setTimeout(() => setIsCardTriggerActive(false), 120);
    onUpdate(stepTextCueCard({ ...source, banks }));
  };

  const handleManualBankTrigger = () => {
    setIsBankTriggerActive(true);
    setTimeout(() => setIsBankTriggerActive(false), 120);
    onUpdate(stepTextCueBank({ ...source, banks }));
  };

  // ── Bank Pad Click & Right-Click MIDI Learn ─────────────────────────────
  const togglePadMidiLearn = (bankIdx: number) => {
    if (learningPadIdx === bankIdx) {
      if (source.midiPadMappings?.[bankIdx]) {
        const nextMappings = { ...(source.midiPadMappings || {}) };
        delete nextMappings[bankIdx];
        onUpdate({ midiPadMappings: nextMappings });
      }
      setLearningPadIdx(null);
    } else {
      setLearningPadIdx(bankIdx);
    }
  };

  const handlePadContextMenu = (bankIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    togglePadMidiLearn(bankIdx);
  };

  const handlePadClick = (bankIdx: number) => {
    if (midiOverlayActive) {
      togglePadMidiLearn(bankIdx);
      return;
    }
    if (learningPadIdx !== null) {
      setLearningPadIdx(null);
    }

    const curBank = banks[bankIdx];
    const updatedBanks = [...banks];
    let nextText = '';

    if (curBank && curBank.cards && curBank.cards.length > 0) {
      const count = curBank.cards.length;
      let cardIdx = curBank.activeCardIndex ?? 0;
      if (source.activeBankIndex === bankIdx && count > 1) {
        if (curBank.playbackOrder === 'shuffle') {
          cardIdx = (cardIdx + 1 + Math.floor(Math.random() * (count - 1))) % count;
        } else {
          cardIdx = cardIdx + 1 < count ? cardIdx + 1 : (curBank.loopMode === 'stop' ? count - 1 : 0);
        }
        updatedBanks[bankIdx] = { ...curBank, activeCardIndex: cardIdx };
      }
      nextText = curBank.cards[cardIdx]?.text ?? '';
    }

    onUpdate({
      activeBankIndex: bankIdx,
      banks: updatedBanks,
      prevText: source.currentText ?? '',
      currentText: nextText,
      lastStepTime: Date.now(),
      stepCount: (source.stepCount ?? 0) + 1
    });
  };

  // Update card settings universally across all banks in the module
  const handleUpdateUniversalCardSetting = (patch: Partial<TextCueBankSlot>) => {
    const nextBanks = banks.map(b => ({ ...b, ...patch }));
    onUpdate({
      banks: nextBanks,
      ...(patch.playbackOrder !== undefined ? { cardPlaybackOrder: patch.playbackOrder } : {}),
      ...(patch.loopMode !== undefined ? { cardLoopMode: patch.loopMode } : {})
    });
  };

  return (
    <div className="text-cue-rack" onPointerDown={e => e.stopPropagation()}>
      {/* 1. Status & Grid Mode Switch */}
      <div className="text-cue-top-bar">
        <span className="text-cue-status-label">
          Bank {activeBankIdx + 1} · Card{' '}
          {activeBank?.cards?.length ? `${activeCardIdx + 1}/${activeBank.cards.length}` : '0/0'}
        </span>

        <div className="text-cue-size-switch" title="Bank grid capacity">
          {(['8', '16', '24'] as const).map(mode => (
            <button
              key={mode}
              className={`text-cue-size-btn ${(source.bankGridMode || '8') === mode ? 'active' : ''}`}
              onClick={() => onUpdate({ bankGridMode: mode })}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Live Card Preview Banner */}
      <div
        className={`text-cue-preview-box ${!displayText ? 'empty' : ''}`}
        onClick={() => setIsModalOpen(true)}
        title="Click to open Text Bank & Card Manager"
      >
        {displayText
          ? displayText.length > 72
            ? `${displayText.slice(0, 72)}…`
            : displayText
          : 'No active text card — click Edit Banks ⤢'}
      </div>

      {/* 3. Bank Pad Grid (8 / 16 / 24) */}
      <div className={`text-cue-pads-grid grid-${maxBanks}`}>
        {Array.from({ length: maxBanks }, (_, i) => {
          const bank = banks[i];
          const cardCount = bank?.cards?.length || 0;
          const hasCards = cardCount > 0;
          const isPlaying = activeBankIdx === i;
          const isLearning = learningPadIdx === i;
          const midiMap = source.midiPadMappings?.[i];

          let progressPct = 0;
          if (cardCount > 1) {
            progressPct = ((bank.activeCardIndex ?? 0) / (cardCount - 1)) * 100;
          } else if (hasCards) {
            progressPct = 100;
          }

          const baseTitle = hasCards ? `${bank.name} (${cardCount} cards)` : `Bank ${i + 1} (Empty)`;
          const midiTitle = isLearning
            ? 'Waiting for MIDI Note... (Right-click again to clear/cancel)'
            : midiMap
            ? `MIDI: ${formatMidiNote(midiMap.note)} (Note ${midiMap.note}, Ch ${midiMap.channel}) • Right-click to reassign/clear`
            : 'Right-click to MIDI Learn note';

          return (
            <div
              key={i}
              className={`text-cue-pad-btn ${!hasCards ? 'empty' : ''} ${isPlaying ? 'active' : ''} ${isLearning ? 'learning' : ''}`}
              onClick={() => handlePadClick(i)}
              onContextMenu={e => handlePadContextMenu(i, e)}
              title={`${baseTitle}\n${midiTitle}`}
            >
              <div className="text-cue-pad-top">
                <span className="text-cue-pad-num">{i + 1}</span>
                <div className={`text-cue-pad-led ${isPlaying ? 'lit' : ''}`} />
              </div>

              {isLearning ? (
                <span className="text-cue-pad-midi-badge">LEARN</span>
              ) : midiMap ? (
                <span className="text-cue-pad-midi-badge">{formatMidiNote(midiMap.note)}</span>
              ) : null}

              {hasCards && (
                <div
                  className="text-cue-pad-progress-bar"
                  style={{ width: `${progressPct}%` }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Manual Card Step, Bank Step & Edit Banks Row */}
      <div className="text-cue-trigger-row">
        <button
          className={`text-cue-manual-btn ${isCardTriggerActive ? 'active' : ''}`}
          onClick={handleManualCardTrigger}
          title="Step to next card in active bank"
        >
          <span>⚡ C STEP</span>
          {source.keyMapping && source.keyMapping !== 'none' && (
            <span className="text-cue-key-badge">[{source.keyMapping}]</span>
          )}
        </button>

        <button
          className={`text-cue-manual-btn ${isBankTriggerActive ? 'active' : ''}`}
          onClick={handleManualBankTrigger}
          title="Step to next bank"
        >
          <span>⚡ B STEP</span>
          {source.bankKeyMapping && source.bankKeyMapping !== 'none' && (
            <span className="text-cue-key-badge">[{source.bankKeyMapping}]</span>
          )}
        </button>

        <button
          className="text-cue-edit-banks-btn"
          onClick={() => setIsModalOpen(true)}
          title="Open Text Bank & Card Manager"
        >
          Banks ⤢
        </button>
      </div>

      {/* 5. Keyboard Number Slot Assignments & Trigger Threshold */}
      <KeyMappingRow
        label="C Step Key"
        value={source.keyMapping ?? 'none'}
        onChange={v => onUpdate({ keyMapping: v })}
        ctx={effectiveRowCtx}
      />

      <KeyMappingRow
        label="B Step Key"
        value={source.bankKeyMapping ?? 'none'}
        onChange={v => onUpdate({ bankKeyMapping: v })}
        ctx={effectiveRowCtx}
      />

      <Slider
        label="Threshold"
        min={0.0}
        max={1.0}
        step={0.01}
        value={source.triggerThreshold ?? 0.5}
        onChange={v => onUpdate({ triggerThreshold: v })}
        resetValue={0.5}
      />

      {/* 6. Intra-Bank Card Playback Controls */}
      <div className="text-cue-section-divider">Card Playback (Within Bank)</div>

      <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="rack-row-label" title="Automatically step through cards within the active bank">
          Auto Card Step
        </span>
        <input
          type="checkbox"
          checked={activeBank?.autoPlayback ?? false}
          onChange={e => handleUpdateUniversalCardSetting({ autoPlayback: e.target.checked })}
        />
      </div>

      <Slider
        label="Card Speed (s)"
        min={0.1}
        max={10.0}
        step={0.1}
        value={activeBank?.playbackSpeed ?? 1.0}
        onChange={v => handleUpdateUniversalCardSetting({ playbackSpeed: v })}
        resetValue={1.0}
      />

      <div className="rack-row-content">
        <span className="rack-row-label">Card Order</span>
        <select
          value={source.cardPlaybackOrder ?? activeBank?.playbackOrder ?? 'in_order'}
          onChange={e => handleUpdateUniversalCardSetting({ playbackOrder: e.target.value as any })}
          title="Universal Card Order (Applies to all banks)"
        >
          <option value="in_order">In Order</option>
          <option value="shuffle">Shuffle</option>
        </select>
      </div>

      <div className="rack-row-content">
        <span className="rack-row-label">Card Loop</span>
        <select
          value={source.cardLoopMode ?? activeBank?.loopMode ?? 'loop'}
          onChange={e => handleUpdateUniversalCardSetting({ loopMode: e.target.value as any })}
          title="Universal Card Loop (Applies to all banks)"
        >
          <option value="loop">Loop</option>
          <option value="stop">Stop</option>
          <option value="bank">Bank</option>
        </select>
      </div>

      {/* 7. Bank-to-Bank Playback Controls */}
      <div className="text-cue-section-divider">Bank Playback (Across Banks)</div>

      <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="rack-row-label" title="Automatically step across bank pads">
          Auto Bank Step
        </span>
        <input
          type="checkbox"
          checked={source.bankAutoPlayback ?? false}
          onChange={e => onUpdate({ bankAutoPlayback: e.target.checked })}
        />
      </div>

      <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="rack-row-label" title="Skip unpopulated banks during bank rotation">
          Skip Empty Banks
        </span>
        <input
          type="checkbox"
          checked={source.bankSkipEmpty ?? true}
          onChange={e => onUpdate({ bankSkipEmpty: e.target.checked })}
        />
      </div>

      <Slider
        label="Bank Speed (s)"
        min={0.1}
        max={10.0}
        step={0.1}
        value={source.bankPlaybackSpeed ?? 2.0}
        onChange={v => onUpdate({ bankPlaybackSpeed: v })}
        resetValue={2.0}
      />

      <div className="rack-row-content">
        <span className="rack-row-label">Bank Order</span>
        <select
          value={source.bankPlaybackOrder ?? 'in_order'}
          onChange={e => onUpdate({ bankPlaybackOrder: e.target.value as any })}
        >
          <option value="in_order">In Order</option>
          <option value="shuffle">Shuffle</option>
        </select>
      </div>

      <div className="rack-row-content">
        <span className="rack-row-label">Bank Loop</span>
        <select
          value={source.bankLoopMode ?? 'loop'}
          onChange={e => onUpdate({ bankLoopMode: e.target.value as any })}
        >
          <option value="loop">Loop</option>
          <option value="stop">Stop</option>
        </select>
      </div>

      {/* Pop-Out Bank Editor Modal */}
      <TextCueBankModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        source={source}
        onUpdate={onUpdate}
      />
    </div>
  );
}
