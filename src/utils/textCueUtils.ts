import { TextCueCard, TextCueBankSlot, TextCueSource } from '../state/types';

export const MAX_TEXT_BANKS = 24;
export const MAX_CARDS_PER_BANK = 64;

/**
 * Splits raw .txt content into up to `maxCards` non-empty card strings.
 * - If the file contains blank-line-separated paragraphs (\r?\n\s*\r?\n), splits by paragraph.
 * - Otherwise, if the file has multiple non-empty lines, splits line-by-line.
 * - Otherwise returns a single card with the trimmed text.
 */
export function parseTxtContentToStrings(rawText: string, maxCards: number = MAX_CARDS_PER_BANK): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Check if there are paragraph breaks (two or more newlines)
  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs.slice(0, maxCards);
  }

  // Fallback: check if there are multiple single-spaced lines
  const lines = normalized
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines.slice(0, maxCards);
  }

  return [normalized];
}

export function createTextCueCards(texts: string[], existingCount: number = 0, maxCards: number = MAX_CARDS_PER_BANK): TextCueCard[] {
  const availableSlots = Math.max(0, maxCards - existingCount);
  const sliced = texts.slice(0, availableSlots);
  const now = Date.now();
  return sliced.map((text, idx) => ({
    id: `card-${now}-${existingCount + idx}-${Math.random().toString(36).slice(2, 6)}`,
    text
  }));
}

/**
 * Helper to get candidates for bank stepping based on grid mode, skipEmpty, and populated cards.
 */
export function getPopulatedBankCandidates(cue: TextCueSource, banks: TextCueBankSlot[] = cue.banks || []): number[] {
  const maxBanks = cue.bankGridMode === '24' ? 24 : cue.bankGridMode === '16' ? 16 : 8;
  const skipEmpty = cue.bankSkipEmpty ?? true;
  const populatedIndices: number[] = [];
  if (skipEmpty) {
    for (let i = 0; i < maxBanks; i++) {
      if (banks[i]?.cards && banks[i].cards.length > 0) {
        populatedIndices.push(i);
      }
    }
  }
  return (skipEmpty && populatedIndices.length > 0)
    ? populatedIndices
    : Array.from({ length: maxBanks }, (_, i) => i);
}

/**
 * Chooses the next bank index according to bankPlaybackOrder and bankLoopMode.
 */
export function getNextBankIndex(cue: TextCueSource, currentBankIdx: number, candidates: number[]): number {
  if (candidates.length === 0) return currentBankIdx;

  if (cue.bankPlaybackOrder === 'shuffle') {
    if (candidates.length > 1) {
      const otherCandidates = candidates.filter(idx => idx !== currentBankIdx);
      return otherCandidates[Math.floor(Math.random() * otherCandidates.length)];
    }
    return candidates[0];
  }

  // In Order
  const nextCandidate = candidates.find(idx => idx > currentBankIdx);
  if (nextCandidate !== undefined) {
    return nextCandidate;
  }
  if (cue.bankLoopMode !== 'stop' && candidates.length > 0) {
    return candidates[0];
  }
  return currentBankIdx;
}

/**
 * Steps to the next card within the active bank of a TextCueSource.
 * If the active bank's loopMode is 'bank' and the last card is reached,
 * proceeds to the first card in the next bank according to bankPlaybackOrder and bankLoopMode.
 */
export function stepTextCueCard(cue: TextCueSource): Partial<TextCueSource> {
  const banks = cue.banks || [];
  let activeBankIdx = cue.activeBankIndex ?? 0;
  const curBank = banks[activeBankIdx];
  const updatedBanks = [...banks];
  let nextText = cue.currentText ?? '';

  if (curBank && curBank.cards && curBank.cards.length > 0) {
    const count = curBank.cards.length;
    let nextCardIdx = curBank.activeCardIndex ?? 0;
    const universalOrder = cue.cardPlaybackOrder ?? curBank.playbackOrder ?? 'in_order';
    const universalLoop = cue.cardLoopMode ?? curBank.loopMode ?? 'loop';

    if (universalOrder === 'shuffle') {
      if (count > 1) {
        let rand = Math.floor(Math.random() * count);
        if (rand === nextCardIdx) rand = (rand + 1) % count;
        nextCardIdx = rand;
      }
      updatedBanks[activeBankIdx] = { ...curBank, activeCardIndex: nextCardIdx };
      nextText = curBank.cards[nextCardIdx]?.text ?? '';
    } else {
      // In Order
      if (nextCardIdx + 1 < count) {
        nextCardIdx = nextCardIdx + 1;
        updatedBanks[activeBankIdx] = { ...curBank, activeCardIndex: nextCardIdx };
        nextText = curBank.cards[nextCardIdx]?.text ?? '';
      } else {
        // Last card reached
        if (universalLoop === 'bank') {
          const candidates = getPopulatedBankCandidates(cue, banks);
          const nextBankIdx = getNextBankIndex(cue, activeBankIdx, candidates);

          if (nextBankIdx !== activeBankIdx) {
            // Proceed to the first card in the next bank
            const targetBank = banks[nextBankIdx];
            updatedBanks[nextBankIdx] = { ...targetBank, activeCardIndex: 0 };
            nextText = targetBank?.cards?.[0]?.text ?? '';
            activeBankIdx = nextBankIdx;
          } else {
            // Only 1 candidate bank or stopped at end of banks
            if (cue.bankLoopMode !== 'stop') {
              nextCardIdx = 0;
            } else {
              nextCardIdx = count - 1;
            }
            updatedBanks[activeBankIdx] = { ...curBank, activeCardIndex: nextCardIdx };
            nextText = curBank.cards[nextCardIdx]?.text ?? '';
          }
        } else if (universalLoop === 'stop') {
          nextCardIdx = count - 1;
          updatedBanks[activeBankIdx] = { ...curBank, activeCardIndex: nextCardIdx };
          nextText = curBank.cards[nextCardIdx]?.text ?? '';
        } else {
          // loopMode === 'loop'
          nextCardIdx = 0;
          updatedBanks[activeBankIdx] = { ...curBank, activeCardIndex: nextCardIdx };
          nextText = curBank.cards[nextCardIdx]?.text ?? '';
        }
      }
    }
  } else {
    // Current bank is empty; if in 'bank' mode, try to jump to first populated bank
    const candidates = getPopulatedBankCandidates(cue, banks);
    if (candidates.length > 0 && candidates[0] !== activeBankIdx) {
      activeBankIdx = candidates[0];
      const targetBank = banks[activeBankIdx];
      updatedBanks[activeBankIdx] = { ...targetBank, activeCardIndex: 0 };
      nextText = targetBank?.cards?.[0]?.text ?? '';
    }
  }

  return {
    activeBankIndex: activeBankIdx,
    banks: updatedBanks,
    prevText: cue.currentText ?? '',
    currentText: nextText,
    lastStepTime: Date.now(),
    stepCount: (cue.stepCount ?? 0) + 1
  };
}

/**
 * Steps to the next bank of a TextCueSource, respecting bankGridMode, bankSkipEmpty, bankPlaybackOrder, and bankLoopMode.
 */
export function stepTextCueBank(cue: TextCueSource): Partial<TextCueSource> {
  const banks = cue.banks || [];
  let nextBankIndex = cue.activeBankIndex ?? 0;
  const candidates = getPopulatedBankCandidates(cue, banks);
  nextBankIndex = getNextBankIndex(cue, nextBankIndex, candidates);

  const targetBank = banks[nextBankIndex];
  const nextCard = targetBank?.cards?.[targetBank?.activeCardIndex ?? 0];
  const nextText = nextCard?.text ?? '';

  return {
    activeBankIndex: nextBankIndex,
    prevText: cue.currentText ?? '',
    currentText: nextText,
    lastStepTime: Date.now(),
    stepCount: (cue.stepCount ?? 0) + 1
  };
}
