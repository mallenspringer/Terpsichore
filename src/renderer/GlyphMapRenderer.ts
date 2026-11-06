// GlyphMapRenderer: Offscreen Font Atlas Generator and Grid Buffer Builder

import { GlyphWrapMode } from '../state/types';

export class GlyphMapRenderer {
  private static instance: GlyphMapRenderer;
  private atlasCanvas: HTMLCanvasElement | null = null;
  private atlasCtx: CanvasRenderingContext2D | null = null;
  private lastAtlasKey = '';

  public static getInstance(): GlyphMapRenderer {
    if (!GlyphMapRenderer.instance) {
      GlyphMapRenderer.instance = new GlyphMapRenderer();
    }
    return GlyphMapRenderer.instance;
  }

  /**
   * Generates or retrieves the 1024x1024 ASCII font atlas texture.
   * 16 columns x 16 rows of 64x64 px cells (chars 32..126 occupy rows 0..5).
   */
  public getOrCreateAtlas(
    fontFamily = 'VT323',
    fontWeight = 'normal',
    glowColor = '#00ff88',
    glowRadius = 0,
    shadowColor = 'transparent'
  ): { canvas: HTMLCanvasElement; dirty: boolean } {
    const key = `${fontFamily}_${fontWeight}_${glowColor}_${glowRadius}_${shadowColor}`;
    let dirty = false;

    if (!this.atlasCanvas) {
      this.atlasCanvas = document.createElement('canvas');
      this.atlasCanvas.width = 1024;
      this.atlasCanvas.height = 1024;
      this.atlasCtx = this.atlasCanvas.getContext('2d', { willReadFrequently: true });
      dirty = true;
    }

    if (key !== this.lastAtlasKey || dirty) {
      this.lastAtlasKey = key;
      dirty = true;
      const ctx = this.atlasCtx;
      if (ctx) {
        ctx.clearRect(0, 0, 1024, 1024);

        const cellW = 64;
        const cellH = 64;
        const fontSize = Math.floor(cellH * 0.82);

        ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';

        const hasGlow = glowRadius > 0 && glowColor && glowColor !== 'transparent';
        if (hasGlow) {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = Math.min(24, glowRadius * 2);
        } else {
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        // Draw 95 ASCII chars from 32 (' ') to 126 ('~')
        for (let code = 32; code <= 126; code++) {
          const charIdx = code - 32;
          const col = charIdx % 16;
          const row = Math.floor(charIdx / 16);
          const cx = col * cellW + cellW * 0.5;
          const cy = row * cellH + cellH * 0.5;

          const ch = String.fromCharCode(code);
          ctx.fillText(ch, cx, cy);
        }
      }
    }

    return { canvas: this.atlasCanvas!, dirty };
  }

  /**
   * Pre-computes the 2D character codes for all 8 layers formatted by wrapMode.
   * Returns a Uint32Array of size: 8 * (gridCols * gridRows).
   */
  public buildLayerGrid(
    layerStrings: string[],
    wrapMode: GlyphWrapMode,
    gridCols: number,
    gridRows: number
  ): Uint32Array {
    const cols = Math.max(1, Math.floor(gridCols));
    const rows = Math.max(1, Math.floor(gridRows));
    const totalCells = cols * rows;
    const buffer = new Uint32Array(8 * totalCells);

    for (let layerIdx = 0; layerIdx < 8; layerIdx++) {
      const rawText = layerStrings[layerIdx] || ' ';
      const layerOffset = layerIdx * totalCells;

      if (wrapMode === 'raw_char') {
        // Continuous raw character wrapping
        const str = rawText.replace(/[\r\n\t]/g, ' ') || ' ';
        const len = str.length;
        for (let r = 0; r < rows; r++) {
          const rowOffset = layerOffset + r * cols;
          for (let c = 0; c < cols; c++) {
            const linearIdx = r * cols + c;
            const ch = str.charCodeAt(linearIdx % len);
            buffer[rowOffset + c] = ch >= 32 && ch <= 126 ? ch : 32;
          }
        }
      } else if (wrapMode === 'preserve_lines') {
        // Preserves exact newlines / stanzas
        const lines = rawText.split(/\r?\n/);
        const numLines = Math.max(1, lines.length);

        for (let r = 0; r < rows; r++) {
          const line = lines[r % numLines] || '';
          const rowOffset = layerOffset + r * cols;
          const lineLen = line.length;

          for (let c = 0; c < cols; c++) {
            if (c < lineLen) {
              const ch = line.charCodeAt(c);
              buffer[rowOffset + c] = ch >= 32 && ch <= 126 ? ch : 32;
            } else {
              buffer[rowOffset + c] = 32; // space
            }
          }
        }
      } else {
        // Word wrap at gridCols
        const words = (rawText.replace(/[\r\n\t]/g, ' ') || ' ').split(/\s+/);
        const wrappedLines: string[] = [];
        let curLine = '';

        for (const w of words) {
          if (!curLine) {
            curLine = w;
          } else if (curLine.length + 1 + w.length <= cols) {
            curLine += ' ' + w;
          } else {
            wrappedLines.push(curLine);
            curLine = w;
          }
        }
        if (curLine) wrappedLines.push(curLine);
        if (wrappedLines.length === 0) wrappedLines.push(' ');

        const numLines = wrappedLines.length;
        for (let r = 0; r < rows; r++) {
          const line = wrappedLines[r % numLines] || '';
          const rowOffset = layerOffset + r * cols;
          const lineLen = line.length;

          for (let c = 0; c < cols; c++) {
            if (c < lineLen) {
              const ch = line.charCodeAt(c);
              buffer[rowOffset + c] = ch >= 32 && ch <= 126 ? ch : 32;
            } else {
              buffer[rowOffset + c] = 32;
            }
          }
        }
      }
    }

    return buffer;
  }
}

