import React, { useState, useRef } from 'react';
import { ImageCueSource } from '../../../state/types';
import './ImageCueBankModal.css';

interface ImageCueBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: ImageCueSource;
  onUpdate: (updates: Partial<ImageCueSource>) => void;
}

export function ImageCueBankModal({
  isOpen,
  onClose,
  source,
  onUpdate
}: ImageCueBankModalProps) {
  const [filterText, setFilterText] = useState('');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [randomImagesPerBank, setRandomImagesPerBank] = useState<number>(1);

  // Marquee selection state
  const poolGridRef = useRef<HTMLDivElement>(null);
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);

  if (!isOpen) return null;

  const files = source.files || [];
  const banks = source.banks || [];
  const maxBanks = source.bankGridMode === '16' ? 16 : 8;

  // Filtered pool files with original indices preserved
  const filteredFiles = files
    .map((url, idx) => ({ url, originalIdx: idx, name: url.split('/').pop()?.split('\\').pop() || `img_${idx}` }))
    .filter(item => !filterText || item.name.toLowerCase().includes(filterText.toLowerCase()));

  // ── Multi-select handlers ──────────────────────────────────────────────────
  const handleItemClick = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIndices);

    if (e.ctrlKey || e.metaKey) {
      if (newSelected.has(idx)) newSelected.delete(idx);
      else newSelected.add(idx);
      setLastSelectedIndex(idx);
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, idx);
      const end = Math.max(lastSelectedIndex, idx);
      for (let i = start; i <= end; i++) {
        newSelected.add(i);
      }
    } else {
      newSelected.clear();
      newSelected.add(idx);
      setLastSelectedIndex(idx);
    }

    setSelectedIndices(newSelected);
  };

  const handleSelectAll = () => {
    const all = new Set<number>();
    filteredFiles.forEach(f => all.add(f.originalIdx));
    setSelectedIndices(all);
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  // ── Marquee Box Selection ──────────────────────────────────────────────────
  const handlePointerDownPool = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only trigger marquee if clicking directly on pool background or toolbar
    if ((e.target as HTMLElement).closest('.image-cue-pool-item')) return;
    if (!poolGridRef.current) return;

    const rect = poolGridRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left + poolGridRef.current.scrollLeft;
    const startY = e.clientY - rect.top + poolGridRef.current.scrollTop;

    setMarqueeStart({ x: startX, y: startY });
    setMarqueeEnd({ x: startX, y: startY });
    setIsMarqueeActive(true);

    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      setSelectedIndices(new Set());
    }
  };

  const handlePointerMovePool = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMarqueeActive || !marqueeStart || !poolGridRef.current) return;

    const rect = poolGridRef.current.getBoundingClientRect();
    const curX = e.clientX - rect.left + poolGridRef.current.scrollLeft;
    const curY = e.clientY - rect.top + poolGridRef.current.scrollTop;
    setMarqueeEnd({ x: curX, y: curY });

    const mLeft = Math.min(marqueeStart.x, curX);
    const mTop = Math.min(marqueeStart.y, curY);
    const mRight = Math.max(marqueeStart.x, curX);
    const mBottom = Math.max(marqueeStart.y, curY);

    const items = poolGridRef.current.querySelectorAll('.image-cue-pool-item');
    const newSelected = new Set(selectedIndices);

    items.forEach(el => {
      const idx = Number(el.getAttribute('data-idx'));
      const itemRect = (el as HTMLElement).getBoundingClientRect();
      const itemLeft = itemRect.left - rect.left + poolGridRef.current!.scrollLeft;
      const itemTop = itemRect.top - rect.top + poolGridRef.current!.scrollTop;
      const itemRight = itemLeft + itemRect.width;
      const itemBottom = itemTop + itemRect.height;

      const isIntersecting = !(
        itemLeft > mRight ||
        itemRight < mLeft ||
        itemTop > mBottom ||
        itemBottom < mTop
      );

      if (isIntersecting) newSelected.add(idx);
    });

    setSelectedIndices(newSelected);
  };

  const handlePointerUpPool = () => {
    setIsMarqueeActive(false);
    setMarqueeStart(null);
    setMarqueeEnd(null);
  };

  // ── Drag & Drop Assignment ────────────────────────────────────────────────
  const handleDragStartSelected = (e: React.DragEvent) => {
    const urlsToDrag = Array.from(selectedIndices).map(i => files[i]).filter(Boolean);
    if (urlsToDrag.length === 0) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'pool_images', urls: urlsToDrag }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDropOnBank = (bankIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      if (data.type === 'pool_images' && Array.isArray(data.urls)) {
        const newBanks = [...banks];
        const target = newBanks[bankIdx] || {
          id: `bank-${bankIdx + 1}`,
          name: `Bank ${bankIdx + 1}`,
          images: [],
          playbackOrder: 'in_order',
          loopMode: 'loop',
          autoPlayback: false,
          playbackSpeed: 1.0,
          activeImageIndex: 0
        };

        newBanks[bankIdx] = {
          ...target,
          images: [...target.images, ...data.urls]
        };

        onUpdate({ banks: newBanks });
      } else if (data.type === 'bank_slot' && typeof data.bankIdx === 'number') {
        // Swap bank slots
        const fromIdx = data.bankIdx;
        if (fromIdx !== bankIdx) {
          const newBanks = [...banks];
          const temp = newBanks[fromIdx];
          newBanks[fromIdx] = newBanks[bankIdx];
          newBanks[bankIdx] = temp;
          onUpdate({ banks: newBanks });
        }
      }
    } catch (err) {
      console.warn('[ImageCueModal] drop error:', err);
    }
  };

  const handleAddSelectedToBank = (bankIdx: number) => {
    const urlsToAdd = Array.from(selectedIndices).map(i => files[i]).filter(Boolean);
    if (urlsToAdd.length === 0) return;

    const newBanks = [...banks];
    const target = newBanks[bankIdx] || {
      id: `bank-${bankIdx + 1}`,
      name: `Bank ${bankIdx + 1}`,
      images: [],
      playbackOrder: 'in_order',
      loopMode: 'loop',
      autoPlayback: false,
      playbackSpeed: 1.0,
      activeImageIndex: 0
    };

    newBanks[bankIdx] = {
      ...target,
      images: [...target.images, ...urlsToAdd]
    };

    onUpdate({ banks: newBanks });
  };

  const handleRemoveImageFromBank = (bankIdx: number, imgIdx: number) => {
    const newBanks = [...banks];
    const target = newBanks[bankIdx];
    if (!target) return;

    const newImages = target.images.filter((_, i) => i !== imgIdx);
    const newActiveIdx = Math.min(target.activeImageIndex, Math.max(0, newImages.length - 1));

    newBanks[bankIdx] = {
      ...target,
      images: newImages,
      activeImageIndex: newActiveIdx
    };
    onUpdate({ banks: newBanks });
  };

  const handleClearBank = (bankIdx: number) => {
    const newBanks = [...banks];
    if (!newBanks[bankIdx]) return;
    newBanks[bankIdx] = { ...newBanks[bankIdx], images: [], activeImageIndex: 0 };
    onUpdate({ banks: newBanks });
  };

  const handleClearAllBanks = () => {
    const newBanks = banks.map(b => ({ ...b, images: [], activeImageIndex: 0 }));
    onUpdate({ banks: newBanks });
  };

  // ── "Randomly Populate" Feature ───────────────────────────────────────────
  const handleRandomlyPopulate = () => {
    if (files.length === 0) return;
    const shuffledPool = [...files].sort(() => Math.random() - 0.5);
    const newBanks = [...banks];

    let poolCursor = 0;
    for (let b = 0; b < maxBanks; b++) {
      const count = Math.min(randomImagesPerBank, shuffledPool.length);
      const chosenImages: string[] = [];

      for (let i = 0; i < count; i++) {
        chosenImages.push(shuffledPool[poolCursor % shuffledPool.length]);
        poolCursor++;
      }

      newBanks[b] = {
        ...(newBanks[b] || {
          id: `bank-${b + 1}`,
          name: `Bank ${b + 1}`,
          playbackOrder: 'in_order',
          loopMode: 'loop',
          autoPlayback: false,
          playbackSpeed: 1.0,
        }),
        images: chosenImages,
        activeImageIndex: 0
      };
    }

    onUpdate({ banks: newBanks });
  };

  // ── Intra-bank reordering (drag thumbnail within slot) ─────────────────────
  const handleReorderIntraBank = (bankIdx: number, fromImgIdx: number, toImgIdx: number) => {
    if (fromImgIdx === toImgIdx) return;
    const newBanks = [...banks];
    const b = newBanks[bankIdx];
    if (!b) return;

    const newImgs = [...b.images];
    const [moved] = newImgs.splice(fromImgIdx, 1);
    newImgs.splice(toImgIdx, 0, moved);

    newBanks[bankIdx] = { ...b, images: newImgs };
    onUpdate({ banks: newBanks });
  };

  // Compute marquee rect styles
  const marqueeStyle = marqueeStart && marqueeEnd ? {
    left: Math.min(marqueeStart.x, marqueeEnd.x),
    top: Math.min(marqueeStart.y, marqueeEnd.y),
    width: Math.abs(marqueeEnd.x - marqueeStart.x),
    height: Math.abs(marqueeEnd.y - marqueeStart.y),
  } : undefined;

  return (
    <div className="image-cue-modal-overlay" onClick={onClose}>
      <div className="image-cue-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="image-cue-modal-header">
          <div className="image-cue-header-title">
            <span>🎞️ Image Cue Bank Editor</span>
            <span className="image-cue-header-badge">
              {source.directoryName || 'No Folder'} ({files.length} images)
            </span>
          </div>

          <div className="image-cue-header-actions">
            <div className="image-cue-grid-toggle">
              <span>Grid Layout:</span>
              <button
                className={source.bankGridMode === '8' ? 'active' : ''}
                onClick={() => onUpdate({ bankGridMode: '8' })}
              >
                8 Banks (2x4)
              </button>
              <button
                className={source.bankGridMode === '16' ? 'active' : ''}
                onClick={() => onUpdate({ bankGridMode: '16' })}
              >
                16 Banks (4x4)
              </button>
            </div>

            <button className="image-cue-btn-action" onClick={handleClearAllBanks}>
              Clear All Banks
            </button>

            <button className="image-cue-btn-close" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="image-cue-modal-body">
          {/* Left Pane: Folder Pool */}
          <div className="image-cue-pool-pane">
            <div className="image-cue-pool-toolbar">
              <input
                type="text"
                className="image-cue-search-input"
                placeholder="Search images in folder..."
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
              />

              <div className="image-cue-pool-actions">
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="image-cue-btn-action" onClick={handleSelectAll}>
                    Select All
                  </button>
                  <button className="image-cue-btn-action" onClick={handleDeselectAll}>
                    Deselect
                  </button>
                </div>

                <div className="image-cue-random-bar">
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>
                    {randomImagesPerBank} img/bank
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={randomImagesPerBank}
                    onChange={e => setRandomImagesPerBank(Number(e.target.value))}
                    style={{ width: 60 }}
                  />
                  <button
                    className="image-cue-btn-action image-cue-btn-accent"
                    onClick={handleRandomlyPopulate}
                    title="Randomly populate banks with pool images"
                  >
                    🎲 Randomize
                  </button>
                </div>
              </div>

              {selectedIndices.size > 0 && (
                <div style={{ fontSize: 11, color: '#f5c518', fontWeight: 500 }}>
                  Selected: {selectedIndices.size} image(s) (Drag to a bank slot or click [+])
                </div>
              )}
            </div>

            {/* Marquee Selection Container */}
            <div
              className="image-cue-pool-grid"
              ref={poolGridRef}
              onPointerDown={handlePointerDownPool}
              onPointerMove={handlePointerMovePool}
              onPointerUp={handlePointerUpPool}
            >
              {isMarqueeActive && marqueeStyle && (
                <div className="image-cue-marquee" style={marqueeStyle} />
              )}

              {filteredFiles.map(item => {
                const isSelected = selectedIndices.has(item.originalIdx);
                return (
                  <div
                    key={item.originalIdx}
                    data-idx={item.originalIdx}
                    className={`image-cue-pool-item ${isSelected ? 'selected' : ''}`}
                    onClick={e => handleItemClick(item.originalIdx, e)}
                    draggable={isSelected}
                    onDragStart={handleDragStartSelected}
                  >
                    <div className="image-cue-pool-thumb-wrapper">
                      <img src={item.url} alt={item.name} className="image-cue-pool-thumb" />
                    </div>
                    <div className="image-cue-pool-label" title={item.name}>
                      {item.name}
                    </div>
                  </div>
                );
              })}

              {filteredFiles.length === 0 && (
                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#64748b', paddingTop: 40, fontSize: 12 }}>
                  {files.length === 0 ? 'No images loaded in directory' : 'No matching images'}
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Banks */}
          <div className="image-cue-banks-pane">
            <div className="image-cue-banks-grid">
              {Array.from({ length: maxBanks }, (_, bIdx) => {
                const bank = banks[bIdx] || {
                  id: `bank-${bIdx + 1}`,
                  name: `Bank ${bIdx + 1}`,
                  images: [],
                  playbackOrder: 'in_order',
                  loopMode: 'loop',
                  autoPlayback: false,
                  playbackSpeed: 1.0,
                  activeImageIndex: 0
                };

                const isCurrentActive = source.playbackMode === 'bank' && source.activeBankIndex === bIdx;

                return (
                  <div
                    key={bank.id || bIdx}
                    className={`image-cue-bank-card ${isCurrentActive ? 'active-playback' : ''}`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => handleDropOnBank(bIdx, e)}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'bank_slot', bankIdx: bIdx }));
                    }}
                  >
                    {/* Bank Card Header */}
                    <div className="image-cue-bank-header">
                      <div className="image-cue-bank-title">
                        <div className={`image-cue-bank-led ${isCurrentActive ? 'lit' : ''}`} />
                        <span>{bank.name}</span>
                        <span style={{ fontSize: 10, color: '#64748b' }}>
                          ({bank.images.length} {bank.images.length === 1 ? 'img' : 'imgs'})
                        </span>
                      </div>

                      <div className="image-cue-bank-actions">
                        {selectedIndices.size > 0 && (
                          <button
                            className="image-cue-btn-action"
                            style={{ padding: '2px 6px', fontSize: 10 }}
                            onClick={() => handleAddSelectedToBank(bIdx)}
                            title="Add selected images to this bank"
                          >
                            + Add ({selectedIndices.size})
                          </button>
                        )}
                        {bank.images.length > 0 && (
                          <button
                            className="image-cue-btn-action"
                            style={{ padding: '2px 6px', fontSize: 10 }}
                            onClick={() => handleClearBank(bIdx)}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Images Strip */}
                    <div className="image-cue-bank-images">
                      {bank.images.length === 0 ? (
                        <div className="image-cue-bank-empty-hint">
                          Drag images here or select from pool
                        </div>
                      ) : (
                        bank.images.map((imgUrl, fIdx) => (
                          <div
                            key={fIdx}
                            className={`image-cue-bank-slot-thumb ${isCurrentActive && bank.activeImageIndex === fIdx ? 'active-frame' : ''}`}
                            draggable
                            onDragStart={e => {
                              e.stopPropagation();
                              e.dataTransfer.setData('application/json', JSON.stringify({
                                type: 'intra_bank_frame',
                                bankIdx: bIdx,
                                frameIdx: fIdx
                              }));
                            }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                              e.stopPropagation();
                              e.preventDefault();
                              const data = JSON.parse(e.dataTransfer.getData('application/json') || '{}');
                              if (data.type === 'intra_bank_frame' && data.bankIdx === bIdx) {
                                handleReorderIntraBank(bIdx, data.frameIdx, fIdx);
                              }
                            }}
                            onClick={() => {
                              const newBanks = [...banks];
                              newBanks[bIdx] = { ...bank, activeImageIndex: fIdx };
                              onUpdate({ banks: newBanks, activeBankIndex: bIdx, playbackMode: 'bank' });
                            }}
                          >
                            <img src={imgUrl} alt={`frame ${fIdx}`} />
                            <button
                              className="image-cue-slot-del-btn"
                              onClick={e => {
                                e.stopPropagation();
                                handleRemoveImageFromBank(bIdx, fIdx);
                              }}
                              title="Remove image"
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Controls row */}
                    {bank.images.length > 1 && (
                      <div className="image-cue-bank-controls">
                        <label>
                          Order:
                          <select
                            value={bank.playbackOrder}
                            onChange={e => {
                              const newBanks = [...banks];
                              newBanks[bIdx] = { ...bank, playbackOrder: e.target.value as any };
                              onUpdate({ banks: newBanks });
                            }}
                          >
                            <option value="in_order">In Order</option>
                            <option value="shuffle">Shuffle</option>
                          </select>
                        </label>

                        <label>
                          Loop:
                          <select
                            value={bank.loopMode}
                            onChange={e => {
                              const newBanks = [...banks];
                              newBanks[bIdx] = { ...bank, loopMode: e.target.value as any };
                              onUpdate({ banks: newBanks });
                            }}
                          >
                            <option value="loop">Loop</option>
                            <option value="stop">Stop</option>
                          </select>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={bank.autoPlayback}
                            onChange={e => {
                              const newBanks = [...banks];
                              newBanks[bIdx] = { ...bank, autoPlayback: e.target.checked };
                              onUpdate({ banks: newBanks });
                            }}
                          />
                          Auto Step
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
