export type PoetryUnit = 'word' | 'line' | 'stanza';
export type PoetryRevealMode = 'single' | 'accumulate_line' | 'accumulate_stanza';

export interface PoetryToken {
  text: string;
  lineIndex: number;
  stanzaIndex: number;
  isLineEnd: boolean;
  isStanzaEnd: boolean;
}

/**
 * Splits multi-line / multi-stanza poetry or prose into sequential step tokens.
 * Blank lines delimit stanzas; single newlines delimit lines; whitespace delimits words.
 */
export function tokenizePoetry(rawText: string, unit: PoetryUnit): PoetryToken[] {
  const normalized = (rawText || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];

  const rawStanzas = normalized.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
  const tokens: PoetryToken[] = [];
  let globalLineIndex = 0;

  rawStanzas.forEach((stanzaBlock, stanzaIdx) => {
    const lines = stanzaBlock
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    if (unit === 'stanza') {
      tokens.push({
        text: lines.join('\n'),
        lineIndex: globalLineIndex,
        stanzaIndex: stanzaIdx,
        isLineEnd: true,
        isStanzaEnd: true,
      });
      globalLineIndex += lines.length;
      return;
    }

    lines.forEach((line, lineOffset) => {
      const isLastLineOfStanza = lineOffset === lines.length - 1;
      const curLineIdx = globalLineIndex++;

      if (unit === 'line') {
        tokens.push({
          text: line,
          lineIndex: curLineIdx,
          stanzaIndex: stanzaIdx,
          isLineEnd: true,
          isStanzaEnd: isLastLineOfStanza,
        });
        return;
      }

      const words = line.split(/\s+/).filter(Boolean);
      words.forEach((word, wordIdx) => {
        const isLastWordOfLine = wordIdx === words.length - 1;
        tokens.push({
          text: word,
          lineIndex: curLineIdx,
          stanzaIndex: stanzaIdx,
          isLineEnd: isLastWordOfLine,
          isStanzaEnd: isLastWordOfLine && isLastLineOfStanza,
        });
      });
    });
  });

  return tokens;
}

/**
 * Formats the displayed string for step `index` given the active reveal mode.
 */
export function formatPoetryStep(
  tokens: PoetryToken[],
  index: number,
  revealMode: PoetryRevealMode
): string {
  if (!tokens || tokens.length === 0) return '';
  const safeIdx = Math.max(0, Math.min(tokens.length - 1, Math.floor(index)));
  const active = tokens[safeIdx];

  if (revealMode === 'single') {
    return active.text;
  }

  if (revealMode === 'accumulate_line') {
    const parts: string[] = [];
    for (let i = 0; i <= safeIdx; i++) {
      if (tokens[i].lineIndex === active.lineIndex) {
        parts.push(tokens[i].text);
      }
    }
    return parts.join(' ');
  }

  // accumulate_stanza: group by lineIndex within active.stanzaIndex
  const linesByIdx: Map<number, string[]> = new Map();
  for (let i = 0; i <= safeIdx; i++) {
    const tok = tokens[i];
    if (tok.stanzaIndex !== active.stanzaIndex) continue;
    let bucket = linesByIdx.get(tok.lineIndex);
    if (!bucket) {
      bucket = [];
      linesByIdx.set(tok.lineIndex, bucket);
    }
    bucket.push(tok.text);
  }
  return Array.from(linesByIdx.values())
    .map(words => words.join(' '))
    .join('\n');
}
