export type BlackoutStylePreset =
  | 'fade'
  | 'dissolve'
  | 'whiteout_glow'
  | 'spotlight_negative'
  | 'sharpie_zine'
  | 'classified_redact'
  | 'cutup_collage'
  | 'acid_erasure'
  | 'signal_censor';

export type BlackoutSelectionMode = 'entropy' | 'spotlight' | 'walk' | 'glimpse';
export type BlackoutPunctuationMode = 'attached' | 'strip' | 'preserve';
export type BlackoutPinState = 'normal' | 'pinned' | 'preredacted';

export interface BlackoutWordToken {
  text: string;
  cleanWord: string;
  paragraphIndex: number;
  lineBreakBefore: boolean;
  paragraphBreakBefore: boolean;
  pin: BlackoutPinState;
  index: number;
  baseHash: number; // deterministic [0..1)
}

export const MAX_BLACKOUT_WORDS = 512;

export function hashBlackoutWord(index: number, seed: number, text: string): number {
  let h = (2166136261 ^ ((seed | 0) * 16777619)) >>> 0;
  h = Math.imul(h ^ (index + 1), 16777619) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * Parses raw text with optional `[pinned]` and `[[preredacted]]` bracket markup
 * and `\[` / `\]` literal escapes into word tokens up to MAX_BLACKOUT_WORDS.
 */
export function parseBlackoutMarkup(
  rawText: string,
  punctuationMode: BlackoutPunctuationMode = 'attached',
  seed = 1
): BlackoutWordToken[] {
  const normalized = (rawText || '').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return [];

  // Replace escaped \[ and \] with private sentinels during bracket parsing
  const ESC_OPEN = '\uE001';
  const ESC_CLOSE = '\uE002';
  const safe = normalized.replace(/\\\[/g, ESC_OPEN).replace(/\\\]/g, ESC_CLOSE);

  // Strip unescaped bracket delimiters while annotating each surviving character's pin state
  const chars: string[] = [];
  const charPins: BlackoutPinState[] = [];
  let i = 0;

  while (i < safe.length) {
    if (safe[i] === '[') {
      const isDouble = safe[i + 1] === '[';
      const closeMarker = isDouble ? ']]' : ']';
      const searchFrom = i + (isDouble ? 2 : 1);
      const closeIdx = safe.indexOf(closeMarker, searchFrom);
      if (closeIdx !== -1) {
        const pinVal: BlackoutPinState = isDouble ? 'preredacted' : 'pinned';
        for (let k = searchFrom; k < closeIdx; k++) {
          chars.push(safe[k]);
          charPins.push(pinVal);
        }
        i = closeIdx + closeMarker.length;
        continue;
      }
    }
    chars.push(safe[i]);
    charPins.push('normal');
    i++;
  }

  // Split annotated characters into word tokens while tracking newlines & paragraphs
  const tokens: BlackoutWordToken[] = [];
  let pendingNewlines = 0;
  let paragraphIndex = 0;

  const pinRank = (p: BlackoutPinState) => (p === 'preredacted' ? 2 : p === 'pinned' ? 1 : 0);

  const pushRawWord = (rawToken: string, pin: BlackoutPinState) => {
    if (tokens.length >= MAX_BLACKOUT_WORDS) return;
    const unescaped = rawToken.replace(/\uE001/g, '[').replace(/\uE002/g, ']');
    if (!unescaped) return;

    const lineBreakBefore = pendingNewlines === 1 && tokens.length > 0;
    const paragraphBreakBefore = pendingNewlines >= 2 && tokens.length > 0;
    if (paragraphBreakBefore) paragraphIndex += 1;
    pendingNewlines = 0;

    const emitToken = (txt: string, tokPin: BlackoutPinState, lb: boolean, pb: boolean) => {
      if (!txt || tokens.length >= MAX_BLACKOUT_WORDS) return;
      const clean = txt.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      const idx = tokens.length;
      tokens.push({
        text: txt,
        cleanWord: clean || txt,
        paragraphIndex,
        lineBreakBefore: lb,
        paragraphBreakBefore: pb,
        pin: tokPin,
        index: idx,
        baseHash: hashBlackoutWord(idx, seed, txt),
      });
    };

    if (punctuationMode === 'strip') {
      const stripped = unescaped.replace(/^[^\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+$/gu, '');
      if (stripped) emitToken(stripped, pin, lineBreakBefore, paragraphBreakBefore);
      return;
    }

    if (punctuationMode === 'preserve') {
      const match = /^([^\p{L}\p{N}]*)([\p{L}\p{N}'’-]+)([^\p{L}\p{N}]*)$/u.exec(unescaped);
      if (match) {
        let usedBreak = false;
        if (match[1]) {
          emitToken(match[1], 'pinned', lineBreakBefore, paragraphBreakBefore);
          usedBreak = true;
        }
        if (match[2]) {
          emitToken(match[2], pin, usedBreak ? false : lineBreakBefore, usedBreak ? false : paragraphBreakBefore);
          usedBreak = true;
        }
        if (match[3]) {
          emitToken(match[3], 'pinned', false, false);
        }
        return;
      }
    }

    emitToken(unescaped, pin, lineBreakBefore, paragraphBreakBefore);
  };

  let curWord = '';
  let curPin: BlackoutPinState = 'normal';
  for (let c = 0; c < chars.length; c++) {
    const ch = chars[c];
    if (ch === '\n') {
      if (curWord.length > 0) {
        pushRawWord(curWord, curPin);
        curWord = '';
        curPin = 'normal';
      }
      pendingNewlines += 1;
    } else if (/\s/.test(ch)) {
      if (curWord.length > 0) {
        pushRawWord(curWord, curPin);
        curWord = '';
        curPin = 'normal';
      }
    } else {
      curWord += ch;
      if (pinRank(charPins[c]) > pinRank(curPin)) {
        curPin = charPins[c];
      }
    }
  }
  if (curWord.length > 0) {
    pushRawWord(curWord, curPin);
  }

  return tokens;
}

/**
 * Computes a deterministic survival priority rank in [0, 1).
 * Words with rank < density get redacted first in 'entropy' mode.
 * Positive lengthBias favors keeping longer anchor words visible longer.
 */
export function computeWordSurvivalRank(
  token: BlackoutWordToken,
  seed: number,
  lengthBias = 0
): number {
  const base = hashBlackoutWord(token.index, seed, token.cleanWord || token.text);
  const lenNorm = Math.max(0, Math.min(1, ((token.cleanWord?.length ?? token.text.length) - 2) / 8));
  // Positive lengthBias raises rank of longer words so they survive high blackout densities
  const shifted = base + lengthBias * (lenNorm - 0.35) * 0.65;
  return Math.max(0.001, Math.min(0.999, shifted));
}

export interface BlackoutMaskEvalParams {
  selectionMode: BlackoutSelectionMode;
  density: number;       // 0..1
  seed: number;
  lengthBias: number;    // -1..1
  softness: number;      // 0..1
  invertMask: boolean;
  ignorePins: boolean;
  cursorX: number;       // 0..1 normalized page X
  cursorY: number;       // 0..1 normalized page Y
  radius: number;        // 0.05..1.2
  flashAmount: number;   // 0..1 transient punch-through
}

/**
 * Evaluates target concealment [0..1] for one word given its normalized center (cx, cy).
 * Returns 0 = visible word, 1 = fully concealed/blacked-out word.
 */
export function evaluateWordTargetConcealment(
  token: BlackoutWordToken,
  cx: number,
  cy: number,
  totalWords: number,
  params: BlackoutMaskEvalParams
): number {
  if (!params.ignorePins) {
    if (token.pin === 'pinned') return 0.0;
    if (token.pin === 'preredacted') {
      // Pre-redacted tokens stay hidden unless flash bursts past 0.65
      return params.flashAmount > 0.65 ? Math.max(0, 1 - (params.flashAmount - 0.65) * 2.5) : 1.0;
    }
  }

  const d = Math.max(0, Math.min(1, params.density));
  const soft = Math.max(0.005, params.softness * 0.25);
  let conceal = 0;

  if (params.selectionMode === 'entropy') {
    if (d <= 0.001) conceal = 0;
    else if (d >= 0.999) conceal = 1;
    else {
      const rank = computeWordSurvivalRank(token, params.seed, params.lengthBias);
      conceal = rank < d ? 1.0 : 0.0;
    }
  } else if (params.selectionMode === 'walk') {
    const pos = totalWords > 1 ? token.index / (totalWords - 1) : 0;
    if (d <= 0.001) conceal = 0;
    else if (d >= 0.999) conceal = 1;
    else {
      const edge = soft * 0.6;
      const t = Math.max(0, Math.min(1, (d + edge * 0.5 - pos) / Math.max(0.005, edge)));
      conceal = t;
    }
  } else if (params.selectionMode === 'spotlight') {
    const dx = cx - params.cursorX;
    const dy = cy - params.cursorY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = Math.max(0.03, params.radius * (1.0 - d * 0.55));
    const feather = Math.max(0.015, params.softness * 0.3);
    // Inside radius -> visible (0); outside radius -> redacted (1)
    const outside = Math.max(0, Math.min(1, (dist - (r - feather * 0.5)) / feather));
    conceal = outside;
  } else {
    // 'glimpse' mode: heavy baseline blackout punched open momentarily by flashAmount
    const rank = computeWordSurvivalRank(token, params.seed, params.lengthBias);
    const effectiveDensity = Math.max(0, Math.min(1, d * (1.0 - params.flashAmount * 0.92)));
    conceal = rank < effectiveDensity ? 1.0 : 0.0;
  }

  if (params.invertMask) {
    conceal = 1.0 - conceal;
  }

  if (params.selectionMode !== 'glimpse' && params.flashAmount > 0.01) {
    // Secondary flash punch-through even in entropy/spotlight modes when flash_trig is patched
    const gate = hashBlackoutWord(token.index, params.seed + 97, token.text);
    if (gate < params.flashAmount) {
      conceal *= Math.max(0, 1 - params.flashAmount);
    }
  }

  return Math.max(0, Math.min(1, conceal));
}
