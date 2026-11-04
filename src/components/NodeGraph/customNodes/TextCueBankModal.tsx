import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TextCueSource, TextCueBankSlot, TextCueCard } from '../../../state/types';
import {
  MAX_CARDS_PER_BANK,
  parseTxtContentToStrings,
  createTextCueCards
} from '../../../utils/textCueUtils';
import './TextCueBankModal.css';

interface TextCueBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  source: TextCueSource;
  onUpdate: (updates: Partial<TextCueSource>) => void;
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return await file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export function TextCueBankModal({
  isOpen,
  onClose,
  source,
  onUpdate
}: TextCueBankModalProps) {
  const [selectedBankIdx, setSelectedBankIdx] = useState<number>(source.activeBankIndex ?? 0);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number>(0);
  const [dragOverBankIdx, setDragOverBankIdx] = useState<number | null>(null);
  const [dragOverCardKey, setDragOverCardKey] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const txtFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const bIdx = source.activeBankIndex ?? 0;
      setSelectedBankIdx(bIdx);
      const bank = source.banks?.[bIdx];
      setSelectedCardIdx(bank?.activeCardIndex ?? 0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const banks: TextCueBankSlot[] = Array.from({ length: 24 }, (_, i) => {
    const existing = source.banks?.[i];
    return existing || {
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
  const inspectedBank = banks[selectedBankIdx] || banks[0];
  const inspectedCards = inspectedBank?.cards || [];
  const clampedCardIdx = Math.min(selectedCardIdx, Math.max(0, inspectedCards.length - 1));
  const inspectedCard: TextCueCard | undefined = inspectedCards[clampedCardIdx];

  // Sync currentText whenever active bank's active card is modified
  const buildBankUpdates = (
    newBanks: TextCueBankSlot[],
    extraUpdates?: Partial<TextCueSource>
  ): Partial<TextCueSource> => {
    const updates: Partial<TextCueSource> = {
      banks: newBanks,
      ...extraUpdates
    };
    const effectiveBankIdx = extraUpdates?.activeBankIndex ?? source.activeBankIndex ?? 0;
    const activeBank = newBanks[effectiveBankIdx];
    const nextText = activeBank?.cards?.[activeBank?.activeCardIndex ?? 0]?.text ?? '';

    if (nextText !== source.currentText) {
      updates.prevText = source.currentText ?? '';
      updates.currentText = nextText;
      updates.lastStepTime = Date.now();
      updates.stepCount = (source.stepCount ?? 0) + 1;
    }
    return updates;
  };

  // ── Card CRUD Operations ──────────────────────────────────────────────────
  const handleAddCard = (bankIdx: number, initialText: string = 'New Text Card') => {
    const targetBank = banks[bankIdx];
    if (!targetBank || targetBank.cards.length >= MAX_CARDS_PER_BANK) return;

    const newCard: TextCueCard = {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: initialText
    };
    const nextCards = [...targetBank.cards, newCard];
    const newCardIdx = nextCards.length - 1;
    const newBanks = [...banks];
    newBanks[bankIdx] = {
      ...targetBank,
      cards: nextCards,
      activeCardIndex: targetBank.cards.length === 0 ? 0 : targetBank.activeCardIndex
    };

    setSelectedBankIdx(bankIdx);
    setSelectedCardIdx(newCardIdx);
    onUpdate(buildBankUpdates(newBanks));

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }, 20);
  };

  const handleUpdateCardText = (bankIdx: number, cardIdx: number, newText: string) => {
    const targetBank = banks[bankIdx];
    if (!targetBank) return;

    const newBanks = [...banks];
    if (targetBank.cards.length === 0) {
      // Auto-create first card when typing into an empty bank
      const firstCard: TextCueCard = {
        id: `card-${Date.now()}-0`,
        text: newText
      };
      newBanks[bankIdx] = {
        ...targetBank,
        cards: [firstCard],
        activeCardIndex: 0
      };
      setSelectedCardIdx(0);
    } else {
      const nextCards = [...targetBank.cards];
      if (!nextCards[cardIdx]) return;
      nextCards[cardIdx] = { ...nextCards[cardIdx], text: newText };
      newBanks[bankIdx] = {
        ...targetBank,
        cards: nextCards
      };
    }

    onUpdate(buildBankUpdates(newBanks));
  };

  const handleDuplicateCard = (bankIdx: number, cardIdx: number) => {
    const targetBank = banks[bankIdx];
    if (!targetBank || !targetBank.cards[cardIdx] || targetBank.cards.length >= MAX_CARDS_PER_BANK) return;

    const sourceCard = targetBank.cards[cardIdx];
    const dupCard: TextCueCard = {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: sourceCard.text
    };
    const nextCards = [...targetBank.cards];
    nextCards.splice(cardIdx + 1, 0, dupCard);

    const newBanks = [...banks];
    newBanks[bankIdx] = { ...targetBank, cards: nextCards };
    setSelectedCardIdx(cardIdx + 1);
    onUpdate(buildBankUpdates(newBanks));
  };

  const handleRemoveCard = (bankIdx: number, cardIdx: number) => {
    const targetBank = banks[bankIdx];
    if (!targetBank) return;

    const nextCards = targetBank.cards.filter((_, i) => i !== cardIdx);
    const nextActiveIdx = Math.min(targetBank.activeCardIndex ?? 0, Math.max(0, nextCards.length - 1));

    const newBanks = [...banks];
    newBanks[bankIdx] = {
      ...targetBank,
      cards: nextCards,
      activeCardIndex: nextActiveIdx
    };

    if (bankIdx === selectedBankIdx) {
      setSelectedCardIdx(Math.min(clampedCardIdx, Math.max(0, nextCards.length - 1)));
    }
    onUpdate(buildBankUpdates(newBanks));
  };

  const handleClearBank = (bankIdx: number) => {
    const newBanks = [...banks];
    newBanks[bankIdx] = { ...newBanks[bankIdx], cards: [], activeCardIndex: 0 };
    onUpdate(buildBankUpdates(newBanks));
  };

  const handleClearAllBanks = () => {
    const newBanks = banks.map(b => ({ ...b, cards: [], activeCardIndex: 0 }));
    onUpdate(buildBankUpdates(newBanks, { currentText: '' }));
  };

  const handleUpdateBankSettings = (bankIdx: number, patch: Partial<TextCueBankSlot>) => {
    const newBanks = [...banks];
    newBanks[bankIdx] = { ...newBanks[bankIdx], ...patch };
    onUpdate(buildBankUpdates(newBanks));
  };

  // ── .txt File Import & Drag-and-Drop ──────────────────────────────────────
  const extractTxtFiles = (dt: DataTransfer | null): File[] => {
    if (!dt || !dt.files || dt.files.length === 0) return [];
    return Array.from(dt.files).filter(
      f => f.name.toLowerCase().endsWith('.txt') || f.type === 'text/plain'
    );
  };

  const populateCardFromTxtFile = async (bankIdx: number, cardIdx: number, file: File) => {
    try {
      const content = (await readFileAsText(file)).trim();
      if (!content) return;
      handleUpdateCardText(bankIdx, cardIdx, content);
      setSelectedBankIdx(bankIdx);
      setSelectedCardIdx(cardIdx);
    } catch (err) {
      console.warn('[TextCueBankModal] Failed to read .txt file for card:', err);
    }
  };

  const populateBankFromTxtFiles = async (bankIdx: number, files: File[]) => {
    if (files.length === 0) return;
    try {
      const targetBank = banks[bankIdx];
      if (!targetBank) return;

      let cardStrings: string[] = [];
      if (files.length === 1) {
        const content = await readFileAsText(files[0]);
        cardStrings = parseTxtContentToStrings(content, MAX_CARDS_PER_BANK);
      } else {
        const sortedFiles = [...files].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );
        for (const file of sortedFiles) {
          const content = (await readFileAsText(file)).trim();
          if (content) cardStrings.push(content);
        }
      }

      if (cardStrings.length === 0) return;

      const newCards = createTextCueCards(cardStrings, targetBank.cards.length, MAX_CARDS_PER_BANK);
      if (newCards.length === 0) return;

      const newBanks = [...banks];
      newBanks[bankIdx] = {
        ...targetBank,
        cards: [...targetBank.cards, ...newCards]
      };

      setSelectedBankIdx(bankIdx);
      setSelectedCardIdx(targetBank.cards.length);
      onUpdate(buildBankUpdates(newBanks));
    } catch (err) {
      console.warn('[TextCueBankModal] Failed to import .txt files to bank:', err);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';
    await populateBankFromTxtFiles(selectedBankIdx, files);
  };

  // Dragging a card internally
  const handleDragStartCard = (e: React.DragEvent, bankIdx: number, cardIdx: number) => {
    e.stopPropagation();
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ type: 'text_card', fromBankIdx: bankIdx, fromCardIdx: cardIdx })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  // Dropping onto a specific Card slot (replaces text if .txt file, or reorders if internal card)
  const handleDropOnCard = async (targetBankIdx: number, targetCardIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCardKey(null);
    setDragOverBankIdx(null);

    const txtFiles = extractTxtFiles(e.dataTransfer);
    if (txtFiles.length > 0) {
      await populateCardFromTxtFile(targetBankIdx, targetCardIdx, txtFiles[0]);
      return;
    }

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      if (data.type === 'text_card') {
        const { fromBankIdx, fromCardIdx } = data;
        if (fromBankIdx === targetBankIdx && fromCardIdx === targetCardIdx) return;

        const newBanks = [...banks];
        if (fromBankIdx === targetBankIdx) {
          const cards = [...newBanks[targetBankIdx].cards];
          const [moved] = cards.splice(fromCardIdx, 1);
          cards.splice(targetCardIdx, 0, moved);
          newBanks[targetBankIdx] = { ...newBanks[targetBankIdx], cards };
        } else {
          const srcCards = [...newBanks[fromBankIdx].cards];
          const dstCards = [...newBanks[targetBankIdx].cards];
          if (dstCards.length >= MAX_CARDS_PER_BANK) return;
          const [moved] = srcCards.splice(fromCardIdx, 1);
          dstCards.splice(targetCardIdx, 0, moved);
          newBanks[fromBankIdx] = {
            ...newBanks[fromBankIdx],
            cards: srcCards,
            activeCardIndex: Math.min(newBanks[fromBankIdx].activeCardIndex, Math.max(0, srcCards.length - 1))
          };
          newBanks[targetBankIdx] = { ...newBanks[targetBankIdx], cards: dstCards };
        }

        setSelectedBankIdx(targetBankIdx);
        setSelectedCardIdx(targetCardIdx);
        onUpdate(buildBankUpdates(newBanks));
      }
    } catch (err) {
      console.warn('[TextCueBankModal] Card drop error:', err);
    }
  };

  // Dropping onto a Bank slot
  const handleDropOnBank = async (bankIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverBankIdx(null);

    const txtFiles = extractTxtFiles(e.dataTransfer);
    if (txtFiles.length > 0) {
      await populateBankFromTxtFiles(bankIdx, txtFiles);
      return;
    }

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const data = JSON.parse(dataStr);

      if (data.type === 'text_card') {
        const { fromBankIdx, fromCardIdx } = data;
        if (fromBankIdx === bankIdx) return;
        const newBanks = [...banks];
        const srcCards = [...newBanks[fromBankIdx].cards];
        const dstCards = [...newBanks[bankIdx].cards];
        if (dstCards.length >= MAX_CARDS_PER_BANK) return;
        const [moved] = srcCards.splice(fromCardIdx, 1);
        dstCards.push(moved);
        newBanks[fromBankIdx] = {
          ...newBanks[fromBankIdx],
          cards: srcCards,
          activeCardIndex: Math.min(newBanks[fromBankIdx].activeCardIndex, Math.max(0, srcCards.length - 1))
        };
        newBanks[bankIdx] = { ...newBanks[bankIdx], cards: dstCards };
        setSelectedBankIdx(bankIdx);
        setSelectedCardIdx(dstCards.length - 1);
        onUpdate(buildBankUpdates(newBanks));
      } else if (data.type === 'bank_slot' && typeof data.bankIdx === 'number') {
        const fromIdx = data.bankIdx;
        if (fromIdx !== bankIdx) {
          const newBanks = [...banks];
          const temp = newBanks[fromIdx];
          newBanks[fromIdx] = newBanks[bankIdx];
          newBanks[bankIdx] = temp;
          onUpdate(buildBankUpdates(newBanks));
        }
      }
    } catch (err) {
      console.warn('[TextCueBankModal] Bank drop error:', err);
    }
  };

  const totalPopulatedCards = banks.slice(0, maxBanks).reduce((acc, b) => acc + (b.cards?.length || 0), 0);

  return createPortal(
    <div
      className="text-cue-modal-overlay"
      onPointerDown={e => e.stopPropagation()}
      onClick={onClose}
    >
      <div className="text-cue-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="text-cue-modal-header">
          <div className="text-cue-header-title">
            <span>📝 TEXT BANK & CARD MANAGER</span>
            <span className="text-cue-header-badge">
              {maxBanks} Banks · {totalPopulatedCards} Total Cards (Max {MAX_CARDS_PER_BANK}/Bank)
            </span>
          </div>

          <div className="text-cue-header-actions">
            <div className="text-cue-grid-toggle">
              <span>Bank Grid:</span>
              <button
                className={source.bankGridMode === '8' || !source.bankGridMode ? 'active' : ''}
                onClick={() => onUpdate({ bankGridMode: '8' })}
              >
                8 (2×4)
              </button>
              <button
                className={source.bankGridMode === '16' ? 'active' : ''}
                onClick={() => onUpdate({ bankGridMode: '16' })}
              >
                16 (4×4)
              </button>
              <button
                className={source.bankGridMode === '24' ? 'active' : ''}
                onClick={() => onUpdate({ bankGridMode: '24' })}
              >
                24 (6×4)
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600 }}>Card Order:</span>
                <select
                  className="text-cue-bank-select"
                  value={source.cardPlaybackOrder ?? banks[0]?.playbackOrder ?? 'in_order'}
                  onChange={e => {
                    const order = e.target.value as any;
                    const nextBanks = banks.map(b => ({ ...b, playbackOrder: order }));
                    onUpdate({ banks: nextBanks, cardPlaybackOrder: order });
                  }}
                  title="Universal Card Playback Order (Applies to all banks)"
                >
                  <option value="in_order">In Order</option>
                  <option value="shuffle">Shuffle</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#aaa', fontWeight: 600 }}>Card Loop:</span>
                <select
                  className="text-cue-bank-select"
                  value={source.cardLoopMode ?? banks[0]?.loopMode ?? 'loop'}
                  onChange={e => {
                    const loop = e.target.value as any;
                    const nextBanks = banks.map(b => ({ ...b, loopMode: loop }));
                    onUpdate({ banks: nextBanks, cardLoopMode: loop });
                  }}
                  title="Universal Card Loop Mode (Applies to all banks)"
                >
                  <option value="loop">Loop</option>
                  <option value="stop">Stop</option>
                  <option value="bank">Bank</option>
                </select>
              </div>
            </div>

            <button
              className="text-cue-btn-action"
              onClick={handleClearAllBanks}
              title="Remove all cards from all banks"
            >
              Clear All Banks
            </button>

            <button className="text-cue-btn-close" onClick={onClose} title="Close (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="text-cue-modal-body">
          {/* Left Pane: Card Inspector & Editor */}
          <div className="text-cue-editor-pane">
            <div className="text-cue-editor-header">
              <select
                className="text-cue-editor-bank-select"
                value={selectedBankIdx}
                onChange={e => {
                  const nextIdx = Number(e.target.value);
                  setSelectedBankIdx(nextIdx);
                  setSelectedCardIdx(0);
                }}
              >
                {Array.from({ length: maxBanks }, (_, i) => (
                  <option key={i} value={i}>
                    Bank {i + 1} ({banks[i]?.cards?.length || 0}/{MAX_CARDS_PER_BANK} cards)
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="text-cue-btn-action text-cue-btn-accent"
                  disabled={inspectedCards.length >= MAX_CARDS_PER_BANK}
                  onClick={() => handleAddCard(selectedBankIdx, `Card ${inspectedCards.length + 1}`)}
                >
                  + Add Card
                </button>
                <button
                  className="text-cue-btn-action"
                  disabled={inspectedCards.length >= MAX_CARDS_PER_BANK}
                  onClick={() => txtFileInputRef.current?.click()}
                  title="Import .txt file(s) into this bank"
                >
                  📂 Import .txt
                </button>
                <input
                  ref={txtFileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
              </div>
            </div>

            {/* Active Card Textarea Editor */}
            <div
              className="text-cue-textarea-box"
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={e => handleDropOnCard(selectedBankIdx, clampedCardIdx, e)}
            >
              <div className="text-cue-textarea-label">
                <span>
                  {inspectedCard
                    ? `Editing Bank ${selectedBankIdx + 1} · Card #${clampedCardIdx + 1}`
                    : `Bank ${selectedBankIdx + 1} is empty (type below or click + Add Card)`}
                </span>
                {inspectedCard && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="text-cue-btn-action"
                      style={{ padding: '2px 7px', fontSize: '10px' }}
                      disabled={inspectedCards.length >= MAX_CARDS_PER_BANK}
                      onClick={() => handleDuplicateCard(selectedBankIdx, clampedCardIdx)}
                      title="Duplicate this card"
                    >
                      Duplicate
                    </button>
                    <button
                      className="text-cue-bank-btn-clear"
                      onClick={() => handleRemoveCard(selectedBankIdx, clampedCardIdx)}
                      title="Delete this card"
                    >
                      Delete Card
                    </button>
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                className="text-cue-textarea"
                placeholder="Enter card text here, or drag a .txt file directly onto this editor to populate this card..."
                value={inspectedCard?.text ?? ''}
                onChange={e => handleUpdateCardText(selectedBankIdx, clampedCardIdx, e.target.value)}
                onKeyDown={e => e.stopPropagation()}
              />
            </div>

            <div className="text-cue-drop-hint">
              💡 <strong>Drag & Drop .txt files:</strong> Drop a <code>.txt</code> file onto any <strong>Card</strong> to replace its text, or drop onto a <strong>Bank</strong> to populate cards (single file splits by paragraphs/lines; multiple files create 1 card per file, up to {MAX_CARDS_PER_BANK} cards).
            </div>

            {/* Cards List in Selected Bank */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8' }}>
              Cards in Bank {selectedBankIdx + 1} ({inspectedCards.length}/{MAX_CARDS_PER_BANK})
            </div>

            <div className="text-cue-inspector-cards">
              {inspectedCards.length === 0 ? (
                <div className="text-cue-bank-empty">
                  No cards in Bank {selectedBankIdx + 1}. Click "+ Add Card" or drop a .txt file.
                </div>
              ) : (
                inspectedCards.map((card, cIdx) => {
                  const cardKey = `insp-${selectedBankIdx}-${cIdx}`;
                  const isSelected = cIdx === clampedCardIdx;
                  return (
                    <div
                      key={card.id || cIdx}
                      className={`text-cue-inspector-card-row ${isSelected ? 'selected' : ''} ${dragOverCardKey === cardKey ? 'drag-over' : ''}`}
                      draggable
                      onDragStart={e => handleDragStartCard(e, selectedBankIdx, cIdx)}
                      onDragOver={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverCardKey(cardKey);
                      }}
                      onDragLeave={() => setDragOverCardKey(null)}
                      onDrop={e => handleDropOnCard(selectedBankIdx, cIdx, e)}
                      onClick={() => {
                        setSelectedCardIdx(cIdx);
                        const newBanks = [...banks];
                        newBanks[selectedBankIdx] = {
                          ...inspectedBank,
                          activeCardIndex: cIdx
                        };
                        onUpdate(buildBankUpdates(newBanks, { activeBankIndex: selectedBankIdx }));
                      }}
                    >
                      <span className="text-cue-card-badge">#{cIdx + 1}</span>
                      <span className="text-cue-card-snippet">
                        {card.text ? card.text.replace(/\s+/g, ' ') : '(Empty card)'}
                      </span>
                      <button
                        className="text-cue-bank-btn-clear"
                        onClick={e => {
                          e.stopPropagation();
                          handleRemoveCard(selectedBankIdx, cIdx);
                        }}
                        title="Remove card"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Pane: Bank Slots Grid */}
          <div className="text-cue-banks-pane">
            <div className="text-cue-banks-grid">
              {Array.from({ length: maxBanks }, (_, bIdx) => {
                const bank = banks[bIdx];
                const isPlayingBank = (source.activeBankIndex ?? 0) === bIdx;
                const isSelectedBank = selectedBankIdx === bIdx;

                return (
                  <div
                    key={bank.id}
                    className={`text-cue-bank-card ${isPlayingBank ? 'active-playback' : ''} ${isSelectedBank ? 'selected-bank' : ''} ${dragOverBankIdx === bIdx ? 'drag-over' : ''}`}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'bank_slot', bankIdx: bIdx }));
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                      setDragOverBankIdx(bIdx);
                    }}
                    onDragLeave={() => setDragOverBankIdx(null)}
                    onDrop={e => handleDropOnBank(bIdx, e)}
                    onClick={() => {
                      setSelectedBankIdx(bIdx);
                      setSelectedCardIdx(bank.activeCardIndex ?? 0);
                    }}
                  >
                    {/* Bank Header */}
                    <div className="text-cue-bank-header">
                      <div
                        className="text-cue-bank-title"
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedBankIdx(bIdx);
                          setSelectedCardIdx(bank.activeCardIndex ?? 0);
                          const activeCard = bank.cards?.[bank.activeCardIndex ?? 0];
                          onUpdate({
                            activeBankIndex: bIdx,
                            prevText: source.currentText ?? '',
                            currentText: activeCard?.text ?? '',
                            lastStepTime: Date.now(),
                            stepCount: (source.stepCount ?? 0) + 1
                          });
                        }}
                        title="Click to activate this bank"
                      >
                        <div className={`text-cue-bank-led ${isPlayingBank ? 'lit' : ''}`} />
                        <span>{bank.name}</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>
                          ({bank.cards.length}/{MAX_CARDS_PER_BANK})
                        </span>
                      </div>

                      <div className="text-cue-bank-actions">
                        <button
                          className="text-cue-btn-action text-cue-btn-accent"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                          disabled={bank.cards.length >= MAX_CARDS_PER_BANK}
                          onClick={e => {
                            e.stopPropagation();
                            handleAddCard(bIdx, `Card ${bank.cards.length + 1}`);
                          }}
                          title="Add a new card to this bank"
                        >
                          + Card
                        </button>
                        {bank.cards.length > 0 && (
                          <button
                            className="text-cue-bank-btn-clear"
                            onClick={e => {
                              e.stopPropagation();
                              handleClearBank(bIdx);
                            }}
                            title="Clear all cards in this bank"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Cards Strip */}
                    <div className="text-cue-bank-cards-strip">
                      {bank.cards.length === 0 ? (
                        <div className="text-cue-bank-empty">
                          Drop .txt file(s) here or click "+ Card"
                        </div>
                      ) : (
                        bank.cards.map((card, cIdx) => {
                          const pillKey = `pill-${bIdx}-${cIdx}`;
                          const isActiveCard = (bank.activeCardIndex ?? 0) === cIdx;
                          const isEditingThis = isSelectedBank && clampedCardIdx === cIdx;

                          return (
                            <div
                              key={card.id || cIdx}
                              className={`text-cue-pill ${isActiveCard ? 'active-card' : ''} ${isEditingThis ? 'editing-card' : ''} ${dragOverCardKey === pillKey ? 'drag-over' : ''}`}
                              draggable
                              onDragStart={e => handleDragStartCard(e, bIdx, cIdx)}
                              onDragOver={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDragOverCardKey(pillKey);
                              }}
                              onDragLeave={() => setDragOverCardKey(null)}
                              onDrop={e => handleDropOnCard(bIdx, cIdx, e)}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedBankIdx(bIdx);
                                setSelectedCardIdx(cIdx);
                                const newBanks = [...banks];
                                newBanks[bIdx] = { ...bank, activeCardIndex: cIdx };
                                onUpdate(buildBankUpdates(newBanks, { activeBankIndex: bIdx }));
                                setTimeout(() => textareaRef.current?.focus(), 20);
                              }}
                              title={`Card #${cIdx + 1}: ${card.text}\n(Click to edit, or drop a .txt file here to replace)`}
                            >
                              <span>
                                <strong>{cIdx + 1}.</strong> {card.text || '(Empty)'}
                              </span>
                              <button
                                className="text-cue-pill-remove"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleRemoveCard(bIdx, cIdx);
                                }}
                                title="Delete card"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Per-Bank Playback Controls */}
                    <div className="text-cue-bank-controls" onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={bank.autoPlayback}
                            onChange={e => handleUpdateBankSettings(bIdx, { autoPlayback: e.target.checked })}
                          />
                          <span>Auto</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Card step interval (seconds)">
                          <span>Spd:</span>
                          <input
                            type="number"
                            min={0.1}
                            max={60}
                            step={0.1}
                            value={bank.playbackSpeed ?? 1.0}
                            onChange={e =>
                              handleUpdateBankSettings(bIdx, {
                                playbackSpeed: Math.max(0.1, Number(e.target.value) || 1.0)
                              })
                            }
                            style={{
                              width: '44px',
                              background: '#0d1017',
                              border: '1px solid #273144',
                              color: '#e2e8f0',
                              borderRadius: '4px',
                              padding: '2px 4px',
                              fontSize: '10px'
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

