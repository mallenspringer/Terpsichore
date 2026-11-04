import React, { useState, useRef, useEffect } from 'react';
import { ImageCueSource } from '../../../state/types';
import { useEngineStore } from '../../../state/store';
import { MidiManager } from '../../../state/MidiManager';
import { ImageCueBankModal } from './ImageCueBankModal';
import { ImageCueManager } from '../../../renderer/ImageCueManager';
import { extractFileAsset } from '../../../utils/fileAssetManager';
import { Slider, KeyMappingRow } from '../controls/controlHelpers';
import './ImageCueNodeUI.css';

interface ImageCueNodeUIProps {
  nodeId?: string;
  layerId?: string;
  source: ImageCueSource;
  onUpdate: (updates: Partial<ImageCueSource>) => void;
  rowCtx?: any;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const formatMidiNote = (note: number) => {
  const name = NOTE_NAMES[note % 12] || 'C';
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
};

// Logarithmic slider helpers for transition duration (0.125s to 10.0s)
const MIN_DURATION = 0.125;
const MAX_DURATION = 10.0;
const durationToSlider = (dur: number) => {
  const clamped = Math.max(MIN_DURATION, Math.min(MAX_DURATION, dur || 0.5));
  return Math.log(clamped / MIN_DURATION) / Math.log(MAX_DURATION / MIN_DURATION);
};
const sliderToDuration = (val: number) => {
  return Number((MIN_DURATION * Math.pow(MAX_DURATION / MIN_DURATION, val)).toFixed(3));
};

export function ImageCueNodeUI({
  nodeId: _nodeId,
  layerId: _layerId,
  source,
  onUpdate,
  rowCtx
}: ImageCueNodeUIProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTriggerActive, setIsTriggerActive] = useState(false);
  const [learningPadIdx, setLearningPadIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const midiOverlayActive = useEngineStore(s => s.midiOverlayActive);

  const files = source.files || [];
  const banks = source.banks || [];
  const maxBanks = source.bankGridMode === '16' ? 16 : 8;
  const activeBankIdx = source.activeBankIndex ?? 0;
  const activeBank = banks[activeBankIdx];

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

      // Capture Note On
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

  // ── Folder Selection & Loading ───────────────────────────────────────────
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const imgRegex = /\.(png|jpe?g|webp|avif|bmp|gif|svg)$/i;
    const selectedFiles = Array.from(fileList).filter(f => imgRegex.test(f.name));

    if (selectedFiles.length === 0) {
      alert('No supported image files (.png, .jpg, .webp, etc.) found in the selected folder.');
      e.target.value = '';
      return;
    }

    // Sort alphabetically by filename
    selectedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const resolvedUrls: string[] = [];
    const resolvedNames: string[] = [];
    let folderName = 'Images';
    let folderPath: string | undefined;

    selectedFiles.forEach(file => {
      const asset = extractFileAsset(file);
      resolvedUrls.push(asset.fileUrl);
      resolvedNames.push(file.name);
      if (asset.filePath && !folderPath) {
        // Extract folder path from first file
        const parts = asset.filePath.replace(/\\/g, '/').split('/');
        parts.pop();
        folderPath = parts.join('/');
        folderName = parts.pop() || folderName;
      }
    });

    // If folder name not resolved via path, use webkitRelativePath
    if (selectedFiles[0]?.webkitRelativePath) {
      folderName = selectedFiles[0].webkitRelativePath.split('/')[0] || folderName;
    }

    // Reset input value so selecting the same folder again triggers onChange
    e.target.value = '';

    // Prefetch first few images into cache
    ImageCueManager.getInstance().prefetchBatch(resolvedUrls.slice(0, 12));

    onUpdate({
      directoryName: folderName,
      directoryPath: folderPath,
      files: resolvedUrls,
      fileNames: resolvedNames,
      activeDirIndex: 0,
      currentImageUrl: resolvedUrls[0],
      objectFit: source.objectFit || 'fill'
    });
  };

  // ── Manual Step Button ───────────────────────────────────────────────────
  const handleManualTrigger = () => {
    setIsTriggerActive(true);
    setTimeout(() => setIsTriggerActive(false), 120);

    let nextDirIdx = source.activeDirIndex ?? 0;
    let nextBankIdx = source.activeBankIndex ?? 0;
    let updatedBanks = [...banks];
    let nextUrl: string | undefined;

    if (source.playbackMode === 'directory') {
      const count = files.length;
      if (count > 0) {
        if (source.dirPlaybackOrder === 'shuffle') {
          if (count > 1) {
            let rand = Math.floor(Math.random() * count);
            if (rand === nextDirIdx) rand = (rand + 1) % count;
            nextDirIdx = rand;
          }
        } else {
          if (nextDirIdx + 1 >= count) {
            nextDirIdx = source.dirLoopMode === 'stop' ? count - 1 : 0;
          } else {
            nextDirIdx = nextDirIdx + 1;
          }
        }
        nextUrl = files[nextDirIdx];
      }
    } else {
      // Bank mode: step through active bank's images
      const curBank = updatedBanks[nextBankIdx];
      if (curBank && curBank.images && curBank.images.length > 0) {
        const count = curBank.images.length;
        let nextImgIdx = (curBank.activeImageIndex ?? 0);
        if (curBank.playbackOrder === 'shuffle') {
          if (count > 1) {
            let rand = Math.floor(Math.random() * count);
            if (rand === nextImgIdx) rand = (rand + 1) % count;
            nextImgIdx = rand;
          }
        } else {
          if (nextImgIdx + 1 >= count) {
            nextImgIdx = curBank.loopMode === 'stop' ? count - 1 : 0;
          } else {
            nextImgIdx = nextImgIdx + 1;
          }
        }
        updatedBanks[nextBankIdx] = { ...curBank, activeImageIndex: nextImgIdx };
        nextUrl = curBank.images[nextImgIdx];
      }
    }

    const updates: Partial<ImageCueSource> = {
      activeDirIndex: nextDirIdx,
      activeBankIndex: nextBankIdx,
      banks: updatedBanks
    };

    if (nextUrl && nextUrl !== source.currentImageUrl) {
      updates.prevImageUrl = source.currentImageUrl || nextUrl;
      updates.currentImageUrl = nextUrl;
      updates.transitionStartTime = Date.now();
    }

    onUpdate(updates);
  };

  // ── Bank Pad Click & Right-Click MIDI Learn ─────────────────────────────
  const togglePadMidiLearn = (bankIdx: number) => {
    if (learningPadIdx === bankIdx) {
      // Second right-click while learning clears any existing MIDI binding on this pad
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
    let nextUrl = source.currentImageUrl;

    if (curBank && curBank.images && curBank.images.length > 0) {
      const count = curBank.images.length;
      let imgIdx = curBank.activeImageIndex ?? 0;
      if (source.playbackMode === 'bank' && source.activeBankIndex === bankIdx && count > 1) {
        if (curBank.playbackOrder === 'shuffle') {
          imgIdx = (imgIdx + 1 + Math.floor(Math.random() * (count - 1))) % count;
        } else {
          imgIdx = imgIdx + 1 < count ? imgIdx + 1 : (curBank.loopMode === 'stop' ? count - 1 : 0);
        }
        updatedBanks[bankIdx] = { ...curBank, activeImageIndex: imgIdx };
      }
      nextUrl = curBank.images[imgIdx];
    }

    const updates: Partial<ImageCueSource> = {
      playbackMode: 'bank',
      activeBankIndex: bankIdx,
      banks: updatedBanks
    };

    if (nextUrl && nextUrl !== source.currentImageUrl) {
      updates.prevImageUrl = source.currentImageUrl || nextUrl;
      updates.currentImageUrl = nextUrl;
      updates.transitionStartTime = Date.now();
    }

    onUpdate(updates);
  };

  const handleSwitchMode = (mode: 'directory' | 'bank') => {
    const updates: Partial<ImageCueSource> = { playbackMode: mode };
    let nextUrl: string | undefined;

    if (mode === 'directory') {
      nextUrl = files[source.activeDirIndex ?? 0];
    } else {
      const b = banks[source.activeBankIndex ?? 0];
      if (b && b.images && b.images.length > 0) {
        nextUrl = b.images[b.activeImageIndex ?? 0];
      }
    }

    if (nextUrl && nextUrl !== source.currentImageUrl) {
      updates.prevImageUrl = source.currentImageUrl || nextUrl;
      updates.currentImageUrl = nextUrl;
      updates.transitionStartTime = Date.now();
    }

    onUpdate(updates);
  };

  // Update active bank (and sync across banks so bank rotation retains rack-level photo autoplay settings)
  const handleUpdateBankImgSetting = (patch: Partial<typeof activeBank>) => {
    const nextBanks = banks.map((b, idx) => (idx === activeBankIdx || patch.autoPlayback !== undefined || patch.playbackSpeed !== undefined)
      ? { ...b, ...patch }
      : b
    );
    onUpdate({ banks: nextBanks });
  };

  const isBankMode = source.playbackMode === 'bank';

  return (
    <div className="image-cue-rack" onPointerDown={e => e.stopPropagation()}>
      {/* 1. Folder Selector Bar */}
      <div className="image-cue-folder-bar">
        <label className="image-cue-file-input-btn">
          <span>📁 Browse Folder</span>
          <input
            ref={fileInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleFolderSelect}
          />
        </label>
        <span className="image-cue-folder-name" title={source.directoryName}>
          {source.directoryName || 'No folder chosen'} ({files.length})
        </span>
        <button
          className="image-cue-refresh-btn"
          onClick={() => {
            if (fileInputRef.current) fileInputRef.current.click();
          }}
          title="Rescan folder"
        >
          ↺
        </button>
      </div>

      {/* 2. Top-Level Mode Switch */}
      <div className="image-cue-mode-switch">
        <button
          className={`image-cue-mode-btn ${!isBankMode ? 'active' : ''}`}
          onClick={() => handleSwitchMode('directory')}
        >
          Directory ({files.length})
        </button>
        <button
          className={`image-cue-mode-btn ${isBankMode ? 'active' : ''}`}
          onClick={() => handleSwitchMode('bank')}
        >
          Banks ({maxBanks})
        </button>
      </div>

      {/* 3. 2x4 or 4x4 Bank Pad Grid */}
      <div className={`image-cue-pads-grid grid-${maxBanks}`}>
        {Array.from({ length: maxBanks }, (_, i) => {
          const bank = banks[i];
          const hasImages = !!(bank && bank.images && bank.images.length > 0);
          const isPlaying = isBankMode && source.activeBankIndex === i;
          const isLearning = learningPadIdx === i;
          const midiMap = source.midiPadMappings?.[i];

          // Relative progress within set
          let progressPct = 0;
          if (bank && bank.images.length > 1) {
            progressPct = ((bank.activeImageIndex ?? 0) / (bank.images.length - 1)) * 100;
          } else if (hasImages) {
            progressPct = 100;
          }

          const baseTitle = hasImages ? `${bank.name} (${bank.images.length} images)` : `Bank ${i + 1} (Empty)`;
          const midiTitle = isLearning
            ? 'Waiting for MIDI Note... (Right-click again to clear/cancel)'
            : midiMap
              ? `MIDI: ${formatMidiNote(midiMap.note)} (Note ${midiMap.note}, Ch ${midiMap.channel}) • Right-click to reassign/clear`
              : 'Right-click to MIDI Learn note';

          return (
            <div
              key={i}
              className={`image-cue-pad-btn ${!hasImages ? 'empty' : ''} ${isPlaying ? 'active' : ''} ${isLearning ? 'learning' : ''}`}
              onClick={() => handlePadClick(i)}
              onContextMenu={e => handlePadContextMenu(i, e)}
              title={`${baseTitle}\n${midiTitle}`}
            >
              <div className="image-cue-pad-top">
                <span className="image-cue-pad-num">{i + 1}</span>
                <div className={`image-cue-pad-led ${isPlaying ? 'lit' : ''}`} />
              </div>

              {isLearning ? (
                <span className="image-cue-pad-midi-badge">LEARN</span>
              ) : midiMap ? (
                <span className="image-cue-pad-midi-badge">{formatMidiNote(midiMap.note)}</span>
              ) : null}

              {hasImages && (
                <div
                  className="image-cue-pad-progress-bar"
                  style={{ width: `${progressPct}%` }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 4. Manual Trigger & Pop-Out Launch */}
      <div className="image-cue-trigger-row">
        <button
          className={`image-cue-manual-btn ${isTriggerActive ? 'active' : ''}`}
          onClick={handleManualTrigger}
        >
          <span>⚡ STEP</span>
          {source.keyMapping && source.keyMapping !== 'none' && (
            <span className="image-cue-key-badge">[{source.keyMapping}]</span>
          )}
        </button>

        <button
          className="image-cue-edit-banks-btn"
          onClick={() => setIsModalOpen(true)}
        >
          Edit Banks ⤢
        </button>
      </div>

      {/* 5. Key Mapping Row */}
      {rowCtx && (
        <KeyMappingRow
          label="Key Map"
          value={source.keyMapping ?? 'none'}
          onChange={v => onUpdate({ keyMapping: v })}
          ctx={rowCtx}
        />
      )}

      {/* 6. Playback Settings & Sliders */}
      <Slider
        label="Threshold"
        min={0.0}
        max={1.0}
        step={0.01}
        value={source.triggerThreshold ?? 0.5}
        onChange={v => onUpdate({ triggerThreshold: v })}
        resetValue={0.5}
      />

      {!isBankMode ? (
        <>
          <div className="rack-row-content">
            <span className="rack-row-label">Order</span>
            <select
              value={source.dirPlaybackOrder ?? 'in_order'}
              onChange={e => onUpdate({ dirPlaybackOrder: e.target.value as any })}
            >
              <option value="in_order">In Order</option>
              <option value="shuffle">Shuffle</option>
            </select>
          </div>

          <div className="rack-row-content">
            <span className="rack-row-label">Loop</span>
            <select
              value={source.dirLoopMode ?? 'loop'}
              onChange={e => onUpdate({ dirLoopMode: e.target.value as any })}
            >
              <option value="loop">Loop</option>
              <option value="stop">Stop</option>
            </select>
          </div>

          <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="rack-row-label">Auto Playback</span>
            <input
              type="checkbox"
              checked={source.dirAutoPlayback ?? false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ dirAutoPlayback: e.target.checked })}
            />
          </div>

          <Slider
            label="Speed (s)"
            min={0.1}
            max={10.0}
            step={0.1}
            value={source.dirPlaybackSpeed ?? 1.0}
            onChange={v => onUpdate({ dirPlaybackSpeed: v })}
            resetValue={1.0}
          />
        </>
      ) : (
        <>
          {/* Intra-Bank Photo Autoplay Controls */}
          <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="rack-row-label" title="Automatically step through photos within the active bank">
              Auto Photo Step
            </span>
            <input
              type="checkbox"
              checked={activeBank?.autoPlayback ?? false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleUpdateBankImgSetting({ autoPlayback: e.target.checked })}
            />
          </div>

          <Slider
            label="Photo Speed (s)"
            min={0.1}
            max={10.0}
            step={0.1}
            value={activeBank?.playbackSpeed ?? 1.0}
            onChange={v => handleUpdateBankImgSetting({ playbackSpeed: v })}
            resetValue={1.0}
          />

          <div className="rack-row-content">
            <span className="rack-row-label">Photo Order</span>
            <select
              value={activeBank?.playbackOrder ?? 'in_order'}
              onChange={e => handleUpdateBankImgSetting({ playbackOrder: e.target.value as any })}
            >
              <option value="in_order">In Order</option>
              <option value="shuffle">Shuffle</option>
            </select>
          </div>

          {/* Bank-to-Bank Rotation Controls */}
          <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="rack-row-label" title="Automatically step across bank pads">
              Auto Bank Step
            </span>
            <input
              type="checkbox"
              checked={source.bankAutoPlayback ?? false}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ bankAutoPlayback: e.target.checked })}
            />
          </div>

          <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="rack-row-label" title="Skip unpopulated banks during bank rotation">
              Skip Empty Banks
            </span>
            <input
              type="checkbox"
              checked={source.bankSkipEmpty ?? true}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate({ bankSkipEmpty: e.target.checked })}
            />
          </div>

          <Slider
            label="Bank Speed (s)"
            min={0.1}
            max={10.0}
            step={0.1}
            value={source.bankPlaybackSpeed ?? 1.0}
            onChange={v => onUpdate({ bankPlaybackSpeed: v })}
            resetValue={1.0}
          />

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
        </>
      )}

      {/* Transition Selector */}
      <div className="rack-row-content">
        <span className="rack-row-label">Transition</span>
        <select
          value={source.transitionType ?? 'cut'}
          onChange={e => onUpdate({ transitionType: e.target.value as any })}
        >
          <option value="cut">Hard Cut</option>
          <option value="crossfade">Crossfade</option>
          <option value="fade_black">Fade Out/In</option>
        </select>
      </div>

      {/* Logarithmic Transition Duration Slider */}
      {source.transitionType !== 'cut' && (
        <Slider
          label={`Fade (${(source.transitionDuration ?? 0.5).toFixed(2)}s)`}
          min={0}
          max={1}
          step={0.005}
          value={durationToSlider(source.transitionDuration ?? 0.5)}
          onChange={val => onUpdate({ transitionDuration: sliderToDuration(val) })}
          resetValue={durationToSlider(0.5)}
        />
      )}

      {/* Sizing (Object Fit) */}
      <div className="rack-row-content">
        <span className="rack-row-label">Fit</span>
        <select
          value={source.objectFit ?? 'fill'}
          onChange={e => onUpdate({ objectFit: e.target.value as any })}
        >
          <option value="fill">Fill (Stretch)</option>
          <option value="cover">Cover (Crop)</option>
          <option value="contain">Contain (Fit)</option>
          <option value="center">Center (1:1)</option>
        </select>
      </div>

      {/* Pop-Out Bank Editor Modal */}
      <ImageCueBankModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        source={source}
        onUpdate={onUpdate}
      />
    </div>
  );
}
