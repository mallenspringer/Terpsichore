import React, { useState, useRef } from 'react';
import { ImageCueSource } from '../../../state/types';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const files = source.files || [];
  const banks = source.banks || [];
  const maxBanks = source.bankGridMode === '16' ? 16 : 8;

  // ── Folder Selection & Loading ───────────────────────────────────────────
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const imgRegex = /\.(png|jpe?g|webp|avif|bmp|gif|svg)$/i;
    const selectedFiles = Array.from(fileList).filter(f => imgRegex.test(f.name));

    if (selectedFiles.length === 0) {
      alert('No supported image files (.png, .jpg, .webp, etc.) found in the selected folder.');
      return;
    }

    // Sort alphabetically by filename
    selectedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const resolvedUrls: string[] = [];
    let folderName = 'Images';
    let folderPath: string | undefined;

    selectedFiles.forEach(file => {
      const asset = extractFileAsset(file);
      resolvedUrls.push(asset.fileUrl);
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

    // Prefetch first few images into cache
    ImageCueManager.getInstance().prefetchBatch(resolvedUrls.slice(0, 12));

    onUpdate({
      directoryName: folderName,
      directoryPath: folderPath,
      files: resolvedUrls,
      activeDirIndex: 0,
      currentImageUrl: resolvedUrls[0]
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
          nextDirIdx = count > 1 ? Math.floor(Math.random() * count) : 0;
        } else {
          nextDirIdx = (nextDirIdx + 1) % count;
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
          nextImgIdx = count > 1 ? Math.floor(Math.random() * count) : 0;
        } else {
          nextImgIdx = (nextImgIdx + 1) % count;
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

  // ── Bank Pad Click ────────────────────────────────────────────────────────
  const handlePadClick = (bankIdx: number) => {
    const curBank = banks[bankIdx];
    let nextUrl = source.currentImageUrl;

    if (curBank && curBank.images && curBank.images.length > 0) {
      const imgIdx = curBank.activeImageIndex ?? 0;
      nextUrl = curBank.images[imgIdx];
    }

    const updates: Partial<ImageCueSource> = {
      playbackMode: 'bank',
      activeBankIndex: bankIdx
    };

    if (nextUrl && nextUrl !== source.currentImageUrl) {
      updates.prevImageUrl = source.currentImageUrl || nextUrl;
      updates.currentImageUrl = nextUrl;
      updates.transitionStartTime = Date.now();
    }

    onUpdate(updates);
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
          onClick={() => onUpdate({ playbackMode: 'directory' })}
        >
          Directory ({files.length})
        </button>
        <button
          className={`image-cue-mode-btn ${isBankMode ? 'active' : ''}`}
          onClick={() => onUpdate({ playbackMode: 'bank' })}
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

          // Relative progress within set
          let progressPct = 0;
          if (bank && bank.images.length > 1) {
            progressPct = ((bank.activeImageIndex ?? 0) / (bank.images.length - 1)) * 100;
          } else if (hasImages) {
            progressPct = 100;
          }

          return (
            <div
              key={i}
              className={`image-cue-pad-btn ${!hasImages ? 'empty' : ''} ${isPlaying ? 'active' : ''}`}
              onClick={() => handlePadClick(i)}
              title={hasImages ? `${bank.name} (${bank.images.length} images)` : `Bank ${i + 1} (Empty)`}
            >
              <div className="image-cue-pad-top">
                <span className="image-cue-pad-num">{i + 1}</span>
                <div className={`image-cue-pad-led ${isPlaying ? 'lit' : ''}`} />
              </div>

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

      <div className="rack-row-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="rack-row-label">{isBankMode ? "Auto Bank Step" : "Auto Playback"}</span>
        <input
          type="checkbox"
          checked={isBankMode ? (source.bankAutoPlayback ?? false) : (source.dirAutoPlayback ?? false)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdate(isBankMode ? { bankAutoPlayback: e.target.checked } : { dirAutoPlayback: e.target.checked })}
        />
      </div>

      <Slider
        label="Speed (s)"
        min={0.1}
        max={10.0}
        step={0.1}
        value={isBankMode ? (source.bankPlaybackSpeed ?? 1.0) : (source.dirPlaybackSpeed ?? 1.0)}
        onChange={v => onUpdate(isBankMode ? { bankPlaybackSpeed: v } : { dirPlaybackSpeed: v })}
        resetValue={1.0}
      />

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
