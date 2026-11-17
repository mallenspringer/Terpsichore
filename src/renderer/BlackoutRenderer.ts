import {
  BlackoutFontFamily,
  BlackoutLayoutMode,
  BlackoutPunctuationMode,
} from '../state/types';
import {
  BlackoutWordToken,
  MAX_BLACKOUT_WORDS,
  parseBlackoutMarkup,
} from '../utils/blackoutUtils';

export interface BlackoutWordPlacement {
  token: BlackoutWordToken;
  // Normalized page position & size [0..1]
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  // Normalized word-atlas UV box [0..1]
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  // Normalized horizontal gap to the next token on the same line (for bridging adjacent bars)
  gapToNextNorm: number;
  sameLineAsNext: boolean;
}

export interface BlackoutAtlasLayout {
  canvas: HTMLCanvasElement;
  atlasW: number;
  atlasH: number;
  placements: BlackoutWordPlacement[];
  dirty: boolean;
}

export function getBlackoutFontCss(fontFamily: BlackoutFontFamily, fontSizePx: number): string {
  switch (fontFamily) {
    case 'editorial_serif':
      return `700 ${fontSizePx}px "Georgia", "Times New Roman", serif`;
    case 'brutalist_sans':
      return `900 ${fontSizePx}px "Arial Black", "Impact", "Segoe UI", sans-serif`;
    case 'zine_mono':
      return `700 ${fontSizePx}px "Consolas", "Monaco", "Courier New", monospace`;
    case 'brush_script':
      return `italic 700 ${fontSizePx}px "Brush Script MT", "Segoe Script", "Georgia", cursive`;
    case 'typewriter':
    default:
      return `700 ${fontSizePx}px "Courier New", "Consolas", "Lucida Console", monospace`;
  }
}

interface CacheEntry {
  canvas: HTMLCanvasElement;
  atlasW: number;
  atlasH: number;
  signature: string;
  placements: BlackoutWordPlacement[];
}

export class BlackoutRenderer {
  private static instance: BlackoutRenderer;
  private cache = new Map<string, CacheEntry>();

  public static getInstance(): BlackoutRenderer {
    if (!BlackoutRenderer.instance) {
      BlackoutRenderer.instance = new BlackoutRenderer();
    }
    return BlackoutRenderer.instance;
  }

  public buildWordAtlasAndLayout(
    key: string,
    rawText: string,
    opts: {
      punctuationMode: BlackoutPunctuationMode;
      fontFamily: BlackoutFontFamily;
      fontSize: number;
      lineHeight: number;
      layoutMode: BlackoutLayoutMode;
      width: number;
      height: number;
      seed: number;
    }
  ): BlackoutAtlasLayout {
    const safeW = Math.max(128, Math.round(opts.width));
    const safeH = Math.max(128, Math.round(opts.height));
    const atlasSize = 2048;

    const sig = [
      rawText,
      opts.punctuationMode,
      opts.fontFamily,
      Math.round(opts.fontSize),
      opts.lineHeight.toFixed(2),
      opts.layoutMode,
      safeW,
      safeH,
    ].join('|');

    const existing = this.cache.get(key);
    if (existing && existing.signature === sig) {
      // Refresh deterministic hashes for seed without re-rasterizing the atlas
      for (const pl of existing.placements) {
        pl.token.baseHash = pl.token.baseHash;
      }
      return {
        canvas: existing.canvas,
        atlasW: existing.atlasW,
        atlasH: existing.atlasH,
        placements: existing.placements,
        dirty: false,
      };
    }

    const canvas = existing?.canvas ?? document.createElement('canvas');
    if (canvas.width !== atlasSize || canvas.height !== atlasSize) {
      canvas.width = atlasSize;
      canvas.height = atlasSize;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        canvas,
        atlasW: atlasSize,
        atlasH: atlasSize,
        placements: [],
        dirty: false,
      };
    }
    ctx.clearRect(0, 0, atlasSize, atlasSize);

    const tokens = parseBlackoutMarkup(rawText, opts.punctuationMode, opts.seed).slice(0, MAX_BLACKOUT_WORDS);
    if (tokens.length === 0) {
      this.cache.set(key, {
        canvas,
        atlasW: atlasSize,
        atlasH: atlasSize,
        signature: sig,
        placements: [],
      });
      return { canvas, atlasW: atlasSize, atlasH: atlasSize, placements: [], dirty: true };
    }

    // Scale font proportionally to canvas height relative to 720p
    const resScale = safeH / 720;
    let pxSize = Math.max(14, Math.round(opts.fontSize * resScale));

    // Layout geometry margins
    const colMarginX = opts.layoutMode === 'column' ? safeW * 0.2 : safeW * 0.085;
    const maxLineW = Math.max(120, safeW - colMarginX * 2);
    const topMargin = safeH * 0.1;
    const maxPageH = safeH * 0.8;

    interface MeasuredLine {
      words: Array<{ token: BlackoutWordToken; width: number; spaceBefore: number }>;
      totalW: number;
      lineGapMultiplier: number;
    }

    const computeWrappedLines = (fontPx: number): { lines: MeasuredLine[]; lineStepPx: number; spaceW: number } => {
      ctx.font = getBlackoutFontCss(opts.fontFamily, fontPx);
      const spaceW = Math.max(4, ctx.measureText(' ').width);
      const lineStepPx = fontPx * opts.lineHeight;
      const lines: MeasuredLine[] = [];
      let curWords: Array<{ token: BlackoutWordToken; width: number; spaceBefore: number }> = [];
      let curW = 0;

      const flushLine = (paraBreakNext: boolean) => {
        if (curWords.length > 0) {
          lines.push({
            words: curWords,
            totalW: curW,
            lineGapMultiplier: paraBreakNext ? 1.55 : 1.0,
          });
          curWords = [];
          curW = 0;
        }
      };

      for (const tok of tokens) {
        const w = Math.max(4, ctx.measureText(tok.text).width);
        if (tok.paragraphBreakBefore) {
          flushLine(true);
        } else if (tok.lineBreakBefore) {
          flushLine(false);
        }

        const space = curWords.length > 0 ? spaceW : 0;
        if (curWords.length > 0 && curW + space + w > maxLineW) {
          flushLine(false);
          curWords.push({ token: tok, width: w, spaceBefore: 0 });
          curW = w;
        } else {
          curWords.push({ token: tok, width: w, spaceBefore: space });
          curW += space + w;
        }
      }
      flushLine(false);
      return { lines, lineStepPx, spaceW };
    };

    // Fit cleanly vertically if prose is long
    let layout = computeWrappedLines(pxSize);
    const totalHeightFor = (l: typeof layout) =>
      l.lines.reduce((acc, ln, i) => acc + l.lineStepPx * (i === l.lines.length - 1 ? 1.0 : ln.lineGapMultiplier), 0);

    while (pxSize > 13 && totalHeightFor(layout) > maxPageH) {
      pxSize = Math.max(13, Math.floor(pxSize * 0.88));
      layout = computeWrappedLines(pxSize);
    }

    const totalBlockH = totalHeightFor(layout);
    const startY =
      opts.layoutMode === 'centered_verse'
        ? Math.max(topMargin * 0.5, (safeH - totalBlockH) * 0.5)
        : Math.max(topMargin * 0.5, Math.min(topMargin, (safeH - totalBlockH) * 0.45));

    // Pack each word glyph onto the 2048x2048 white-mask atlas & record normalized placements
    ctx.font = getBlackoutFontCss(opts.fontFamily, pxSize);
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    const ascent = Math.ceil(pxSize * 0.92);
    const descent = Math.ceil(pxSize * 0.34);
    const boxH = ascent + descent;
    const pad = 6;

    let atlasX = pad;
    let atlasY = pad;
    const rowStep = boxH + pad * 2;
    const placements: BlackoutWordPlacement[] = [];

    let curPageY = startY;
    for (let li = 0; li < layout.lines.length; li++) {
      const line = layout.lines[li];
      let curPageX =
        opts.layoutMode === 'centered_verse'
          ? (safeW - line.totalW) * 0.5
          : colMarginX;

      for (let wi = 0; wi < line.words.length; wi++) {
        const item = line.words[wi];
        curPageX += item.spaceBefore;

        const cellW = Math.ceil(item.width) + pad * 2;
        if (atlasX + cellW > atlasSize - pad) {
          atlasX = pad;
          atlasY += rowStep;
        }
        if (atlasY + boxH + pad > atlasSize) {
          break; // Atlas full guard
        }

        // Draw crisp white glyph into atlas cell
        const drawX = atlasX + pad;
        const drawY = atlasY + ascent;
        ctx.fillText(item.token.text, drawX, drawY);

        const u0 = atlasX / atlasSize;
        const v0 = atlasY / atlasSize;
        const u1 = (atlasX + cellW) / atlasSize;
        const v1 = (atlasY + boxH) / atlasSize;

        const pageW = cellW / safeW;
        const pageH = boxH / safeH;
        const pageX = (curPageX - pad) / safeW;
        const pageY = curPageY / safeH;

        const nextItem = wi + 1 < line.words.length ? line.words[wi + 1] : null;
        const gapToNextNorm = nextItem ? Math.max(0, nextItem.spaceBefore - pad * 0.5) / safeW : 0;

        placements.push({
          token: item.token,
          x: pageX,
          y: pageY,
          w: pageW,
          h: pageH,
          cx: pageX + pageW * 0.5,
          cy: pageY + pageH * 0.5,
          u0,
          v0,
          u1,
          v1,
          gapToNextNorm,
          sameLineAsNext: nextItem !== null,
        });

        atlasX += cellW + pad;
        curPageX += item.width;
      }

      curPageY += layout.lineStepPx * line.lineGapMultiplier;
    }

    this.cache.set(key, {
      canvas,
      atlasW: atlasSize,
      atlasH: atlasSize,
      signature: sig,
      placements,
    });

    return {
      canvas,
      atlasW: atlasSize,
      atlasH: atlasSize,
      placements,
      dirty: true,
    };
  }
}
