import { TextMakerEffect } from '../state/types';

export interface TextMakerLayoutMetrics {
  /** Normalized tight bounding box of the rendered text block: [minU, minV, maxU, maxV] */
  bounds: [number, number, number, number];
  /** V coordinate (0..1) separating Line 1 (Header) from Line 2+ */
  headerSplitV: number;
  /** Top V coordinate (0..1) of the first line */
  startV: number;
  /** Height of a single body line in normalized V (0..1) */
  lineStepV: number;
  /** Total number of wrapped lines */
  lineCount: number;
}

interface CachedGlyphEntry {
  canvas: HTMLCanvasElement;
  cacheSignature: string;
  width: number;
  height: number;
  metrics: TextMakerLayoutMetrics;
}

const DEFAULT_METRICS: TextMakerLayoutMetrics = {
  bounds: [0.2, 0.4, 0.8, 0.6],
  headerSplitV: 0.5,
  startV: 0.4,
  lineStepV: 0.1,
  lineCount: 1
};

export function getFontCssStack(fontFamily: TextMakerEffect['fontFamily'], fontSize: number): string {
  switch (fontFamily) {
    case 'slab_serif':
      return `800 ${fontSize}px "Rockwell", "Courier New", "Georgia", serif`;
    case 'vcr_osd':
      return `700 ${fontSize}px "Consolas", "Lucida Console", "Courier New", monospace`;
    case 'brush_script':
      return `italic 700 ${fontSize}px "Brush Script MT", "Segoe Script", "Georgia", cursive`;
    case 'lcd_digital':
      return `700 ${fontSize}px "Consolas", "Impact", "Courier New", monospace`;
    case 'broadcast_sans':
    default:
      return `900 ${fontSize}px "Arial Black", "Impact", "Segoe UI", sans-serif`;
  }
}

export class TextMakerRenderer {
  private static instance: TextMakerRenderer;
  private cache = new Map<string, CachedGlyphEntry>();

  public static getInstance(): TextMakerRenderer {
    if (!TextMakerRenderer.instance) {
      TextMakerRenderer.instance = new TextMakerRenderer();
    }
    return TextMakerRenderer.instance;
  }

  public renderGlyphMask(
    key: string,
    rawText: string,
    ef: TextMakerEffect,
    width: number = 1280,
    height: number = 720,
    typewriterProgress: number = 1.0
  ): { canvas: HTMLCanvasElement; dirty: boolean; metrics: TextMakerLayoutMetrics } {
    const safeW = Math.max(64, width);
    const safeH = Math.max(64, height);

    let processedText = rawText || '';
    if (ef.allCaps) {
      processedText = processedText.toUpperCase();
    }
    if (ef.layoutMode === 'crawl') {
      processedText = processedText
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .join('   •   ');
    }

    // Apply typewriter slicing if in typewriter mode and progress < 1
    let displayStr = processedText;
    if (ef.transitionMode === 'typewriter' && typewriterProgress < 0.999) {
      const totalChars = processedText.length;
      const visibleChars = Math.max(0, Math.floor(totalChars * Math.max(0, typewriterProgress)));
      const cursorChar =
        ef.typewriterCursor === 'block'
          ? '█'
          : ef.typewriterCursor === 'underscore'
          ? '_'
          : '';
      displayStr = processedText.slice(0, visibleChars) + cursorChar;
    }

    const signature = [
      displayStr,
      ef.fontFamily,
      ef.fontSize,
      ef.stretchMode,
      ef.textAlign,
      ef.letterSpacing,
      ef.lineHeight,
      ef.headerOverrideEnabled ? '1' : '0',
      ef.headerScale,
      ef.layoutMode === 'crawl' ? 'crawl' : 'wrap',
      safeW,
      safeH
    ].join('|');

    let entry = this.cache.get(key);
    if (entry && entry.cacheSignature === signature && entry.width === safeW && entry.height === safeH) {
      return { canvas: entry.canvas, dirty: false, metrics: entry.metrics };
    }

    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = safeW;
      canvas.height = safeH;
      entry = {
        canvas,
        cacheSignature: '',
        width: safeW,
        height: safeH,
        metrics: { ...DEFAULT_METRICS }
      };
      this.cache.set(key, entry);
    } else if (entry.width !== safeW || entry.height !== safeH) {
      entry.canvas.width = safeW;
      entry.canvas.height = safeH;
      entry.width = safeW;
      entry.height = safeH;
    }

    entry.cacheSignature = signature;
    const ctx = entry.canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, safeW, safeH);
    }

    const trimmed = displayStr.trim();
    if (!trimmed) {
      entry.metrics = {
        bounds: [0.5, 0.5, 0.5, 0.5],
        headerSplitV: 0.5,
        startV: 0.5,
        lineStepV: 0.1,
        lineCount: 0
      };
      return { canvas: entry.canvas, dirty: true, metrics: entry.metrics };
    }

    const scaleFactor = safeH / 720;
    const baseFontSize = Math.max(12, Math.round((ef.fontSize ?? 52) * scaleFactor));
    const stretchX = ef.stretchMode === '2x_wide' ? 1.65 : 1.0;
    const stretchY = ef.stretchMode === '2x_tall' ? 1.65 : 1.0;
    const maxTextWidth = (safeW * 0.82) / stretchX;

    if (ctx) {
      ctx.font = getFontCssStack(ef.fontFamily, baseFontSize);
      if ('letterSpacing' in ctx) {
        (ctx as any).letterSpacing = `${Math.round((ef.letterSpacing ?? 1) * scaleFactor)}px`;
      }
    }

    const lines =
      ef.layoutMode === 'crawl'
        ? [trimmed]
        : this.wrapLines(ctx, trimmed, maxTextWidth, ef.headerOverrideEnabled ? (ef.headerScale ?? 1.4) : 1.0, ef.fontFamily, baseFontSize);

    const lineMult = ef.lineHeight ?? 1.25;
    const bodyStepPx = baseFontSize * lineMult * stretchY;
    const headerScale = ef.headerOverrideEnabled ? (ef.headerScale ?? 1.4) : 1.0;
    const headerStepPx = baseFontSize * headerScale * lineMult * stretchY;

    const totalHeightPx =
      lines.length === 0
        ? 0
        : headerStepPx + Math.max(0, lines.length - 1) * bodyStepPx;

    const startYPx = (safeH - totalHeightPx) / 2;
    let maxMeasuredW = 0;

    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
    }

    let currentTopY = startYPx;
    let headerSplitYPx = startYPx + headerStepPx;

    for (let i = 0; i < lines.length; i++) {
      const isHeader = i === 0 && ef.headerOverrideEnabled;
      const lineFontSize = isHeader ? Math.round(baseFontSize * headerScale) : baseFontSize;
      const stepPx = isHeader ? headerStepPx : bodyStepPx;
      const lineCenterY = currentTopY + stepPx / 2;

      if (ctx) {
        ctx.font = getFontCssStack(ef.fontFamily, lineFontSize);
      }
      const measured = ctx && ctx.measureText ? ctx.measureText(lines[i]).width : lines[i].length * lineFontSize * 0.6;
      const stretchedW = measured * stretchX;
      if (stretchedW > maxMeasuredW) {
        maxMeasuredW = stretchedW;
      }

      if (ctx) {
        ctx.save();
        let anchorX = safeW / 2;
        if (ef.textAlign === 'left') {
          anchorX = safeW * 0.12;
          ctx.textAlign = 'left';
        } else if (ef.textAlign === 'right') {
          anchorX = safeW * 0.88;
          ctx.textAlign = 'right';
        } else {
          anchorX = safeW / 2;
          ctx.textAlign = 'center';
        }

        ctx.translate(anchorX, lineCenterY);
        ctx.scale(stretchX, stretchY);
        ctx.fillText(lines[i], 0, 0);
        ctx.restore();
      }

      if (i === 0) {
        headerSplitYPx = currentTopY + stepPx;
      }
      currentTopY += stepPx;
    }

    const padX = Math.max(16, baseFontSize * 0.45);
    const padY = Math.max(10, baseFontSize * 0.25);

    let minX = (safeW - maxMeasuredW) / 2 - padX;
    let maxX = (safeW + maxMeasuredW) / 2 + padX;
    if (ef.textAlign === 'left') {
      minX = safeW * 0.12 - padX;
      maxX = safeW * 0.12 + maxMeasuredW + padX;
    } else if (ef.textAlign === 'right') {
      minX = safeW * 0.88 - maxMeasuredW - padX;
      maxX = safeW * 0.88 + padX;
    }

    const minU = Math.max(0.02, Math.min(0.98, minX / safeW));
    const maxU = Math.max(0.02, Math.min(0.98, maxX / safeW));
    const minV = Math.max(0.02, Math.min(0.98, (startYPx - padY) / safeH));
    const maxV = Math.max(0.02, Math.min(0.98, (startYPx + totalHeightPx + padY) / safeH));

    entry.metrics = {
      bounds: [minU, minV, maxU, maxV],
      headerSplitV: Math.max(0, Math.min(1, headerSplitYPx / safeH)),
      startV: Math.max(0, Math.min(1, startYPx / safeH)),
      lineStepV: Math.max(0.01, bodyStepPx / safeH),
      lineCount: lines.length
    };

    return { canvas: entry.canvas, dirty: true, metrics: entry.metrics };
  }

  private wrapLines(
    ctx: CanvasRenderingContext2D | null,
    text: string,
    maxWidth: number,
    headerScale: number,
    fontFamily: TextMakerEffect['fontFamily'],
    baseFontSize: number
  ): string[] {
    const rawLines = text.replace(/\r\n/g, '\n').split('\n');
    const result: string[] = [];

    for (let r = 0; r < rawLines.length; r++) {
      const rawLine = rawLines[r];
      if (!rawLine.trim()) {
        result.push('');
        continue;
      }
      const isFirst = result.length === 0 && r === 0;
      if (ctx) {
        ctx.font = getFontCssStack(fontFamily, isFirst ? Math.round(baseFontSize * headerScale) : baseFontSize);
      }

      const words = rawLine.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx && ctx.measureText ? ctx.measureText(testLine) : { width: testLine.length * 14 };
        if (metrics.width > maxWidth && currentLine) {
          result.push(currentLine);
          currentLine = word;
          if (ctx) {
            ctx.font = getFontCssStack(fontFamily, baseFontSize);
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        result.push(currentLine);
      }
    }

    return result;
  }
}
