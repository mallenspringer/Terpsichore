interface CachedTextCanvas {
  canvas: HTMLCanvasElement;
  lastText: string;
  width: number;
  height: number;
}

export class TextCueRenderer {
  private static instance: TextCueRenderer;
  private cache = new Map<string, CachedTextCanvas>();

  public static getInstance(): TextCueRenderer {
    if (!TextCueRenderer.instance) {
      TextCueRenderer.instance = new TextCueRenderer();
    }
    return TextCueRenderer.instance;
  }

  public renderToCanvas(
    key: string,
    text: string,
    width: number = 1280,
    height: number = 720
  ): { canvas: HTMLCanvasElement; dirty: boolean } {
    const safeW = Math.max(64, width);
    const safeH = Math.max(64, height);
    let entry = this.cache.get(key);

    if (
      entry &&
      entry.lastText === text &&
      entry.width === safeW &&
      entry.height === safeH
    ) {
      return { canvas: entry.canvas, dirty: false };
    }

    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = safeW;
      canvas.height = safeH;
      entry = { canvas, lastText: '', width: safeW, height: safeH };
      this.cache.set(key, entry);
    } else if (entry.width !== safeW || entry.height !== safeH) {
      entry.canvas.width = safeW;
      entry.canvas.height = safeH;
      entry.width = safeW;
      entry.height = safeH;
    }

    entry.lastText = text;
    const ctx = entry.canvas.getContext('2d');
    if (!ctx) {
      return { canvas: entry.canvas, dirty: true };
    }

    ctx.clearRect(0, 0, safeW, safeH);

    const trimmed = (text || '').trim();
    if (!trimmed) {
      return { canvas: entry.canvas, dirty: true };
    }

    const maxTextWidth = safeW * 0.84;
    const maxTextHeight = safeH * 0.82;

    // Pick initial font size based on string length, then shrink if wrapped height exceeds safe area
    let fontSize = Math.round(
      trimmed.length <= 24
        ? safeH * 0.11
        : trimmed.length <= 80
        ? safeH * 0.075
        : trimmed.length <= 200
        ? safeH * 0.052
        : safeH * 0.038
    );
    fontSize = Math.max(18, Math.min(120, fontSize));

    let wrappedLines: string[] = [];
    let lineHeight = fontSize * 1.28;

    while (fontSize >= 16) {
      ctx.font = `600 ${fontSize}px "Inter", "Segoe UI", system-ui, -apple-system, sans-serif`;
      lineHeight = fontSize * 1.28;
      wrappedLines = this.wrapText(ctx, trimmed, maxTextWidth);
      if (wrappedLines.length * lineHeight <= maxTextHeight || fontSize <= 18) {
        break;
      }
      fontSize = Math.max(16, Math.floor(fontSize * 0.86));
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = Math.max(4, Math.round(fontSize * 0.12));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = Math.max(2, Math.round(fontSize * 0.05));

    const totalBlockHeight = wrappedLines.length * lineHeight;
    const startY = (safeH - totalBlockHeight) / 2 + lineHeight / 2;
    const centerX = safeW / 2;

    for (let i = 0; i < wrappedLines.length; i++) {
      ctx.fillText(wrappedLines[i], centerX, startY + i * lineHeight);
    }

    return { canvas: entry.canvas, dirty: true };
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const rawLines = text.replace(/\r\n/g, '\n').split('\n');
    const result: string[] = [];

    for (const rawLine of rawLines) {
      if (!rawLine.trim()) {
        result.push('');
        continue;
      }
      const words = rawLine.split(/\s+/);
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText ? ctx.measureText(testLine) : { width: testLine.length * 14 };
        if (metrics.width > maxWidth && currentLine) {
          result.push(currentLine);
          currentLine = word;
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

