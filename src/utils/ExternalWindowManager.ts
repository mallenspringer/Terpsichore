/**
 * ExternalWindowManager
 * Manages popping out the live rendered video canvas into an external, detached browser window.
 * Useful for routing full-screen output to a secondary display, external projector, or video capture card.
 */

export interface RendererDualCanvas {
  setExternalCanvas(canvas: HTMLCanvasElement | null): boolean;
}

export class ExternalWindowManager {
  private static instance: ExternalWindowManager;
  private popupWindow: Window | null = null;
  private stream: MediaStream | null = null;
  private renderer: RendererDualCanvas | null = null;
  private checkInterval: any = null;
  private listeners: Set<(isOpen: boolean) => void> = new Set();

  private constructor() {}

  public static getInstance(): ExternalWindowManager {
    if (!ExternalWindowManager.instance) {
      ExternalWindowManager.instance = new ExternalWindowManager();
    }
    return ExternalWindowManager.instance;
  }

  public isOpen(): boolean {
    return !!(this.popupWindow && !this.popupWindow.closed);
  }

  public subscribe(callback: (isOpen: boolean) => void): () => void {
    this.listeners.add(callback);
    callback(this.isOpen());
    return () => this.listeners.delete(callback);
  }

  private notify() {
    const open = this.isOpen();
    this.listeners.forEach(cb => cb(open));
  }

  public toggle(sourceCanvas: HTMLCanvasElement, renderer?: RendererDualCanvas | null): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open(sourceCanvas, renderer);
    }
  }

  public open(sourceCanvas: HTMLCanvasElement, renderer?: RendererDualCanvas | null): void {
    if (this.isOpen()) {
      this.popupWindow?.focus();
      return;
    }

    this.renderer = renderer ?? null;

    const width = 1280;
    const height = 720;
    const screenAny = window.screen as any;
    const left = screenAny.availLeft !== undefined ? screenAny.availLeft + 100 : 100;
    const top = screenAny.availTop !== undefined ? screenAny.availTop + 100 : 100;

    const popup = window.open(
      '',
      'TerpsichoreOutputDisplay',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );

    if (!popup) {
      alert('Pop-up window was blocked by your browser. Please allow pop-ups for Terpsichore to display external output.');
      return;
    }

    this.popupWindow = popup;

    popup.document.open();
    popup.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Terpsichore — Output Display</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
          html, body {
            background: #000;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          body.hide-cursor {
            cursor: none;
          }
          #out-canvas, #out-video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
            background: #000;
          }
        </style>
      </head>
      <body>
        <canvas id="out-canvas"></canvas>
        <video id="out-video" autoplay muted playsinline style="display:none;"></video>
      </body>
      </html>
    `);
    popup.document.close();

    const canvasEl = popup.document.getElementById('out-canvas') as HTMLCanvasElement;
    const videoEl = popup.document.getElementById('out-video') as HTMLVideoElement;

    // Sync resolution to source canvas dimensions
    canvasEl.width = sourceCanvas.width;
    canvasEl.height = sourceCanvas.height;

    // Fullscreen controls
    const toggleFullscreen = () => {
      if (!popup.document.fullscreenElement) {
        popup.document.documentElement.requestFullscreen().catch(() => {});
      } else {
        popup.document.exitFullscreen().catch(() => {});
      }
    };

    popup.addEventListener('dblclick', toggleFullscreen);
    popup.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && popup.document.fullscreenElement) {
        popup.document.exitFullscreen().catch(() => {});
      }
    });

    // Auto-hide mouse cursor after 2 seconds of inactivity
    let cursorTimeout: any = null;
    const handleMouseMove = () => {
      popup.document.body.classList.remove('hide-cursor');
      clearTimeout(cursorTimeout);
      cursorTimeout = setTimeout(() => {
        popup.document.body.classList.add('hide-cursor');
      }, 2000);
    };
    popup.addEventListener('mousemove', handleMouseMove);
    handleMouseMove();

    // Strategy 1: Native WebGPU dual-canvas presentation (Zero-copy GPU blit)
    let webgpuConfigured = false;
    if (this.renderer && typeof this.renderer.setExternalCanvas === 'function') {
      try {
        webgpuConfigured = this.renderer.setExternalCanvas(canvasEl);
      } catch (err) {
        console.warn('[ExternalWindowManager] WebGPU dual-canvas init error:', err);
      }
    }

    // Strategy 2: If WebGPU cannot attach across windows, fallback to clean MediaStream (captureStream)
    if (!webgpuConfigured) {
      canvasEl.style.display = 'none';
      videoEl.style.display = 'block';

      try {
        if (typeof sourceCanvas.captureStream === 'function') {
          const stream = sourceCanvas.captureStream(60);
          this.stream = stream;
          videoEl.srcObject = stream;
          videoEl.play().catch(err => {
            console.warn('[ExternalWindowManager] captureStream video play notice:', err);
          });
        }
      } catch (err) {
        console.warn('[ExternalWindowManager] captureStream fallback failed:', err);
      }
    }

    // Watch for window close
    popup.addEventListener('beforeunload', () => {
      this.handleClose();
    });

    this.checkInterval = setInterval(() => {
      if (this.popupWindow && this.popupWindow.closed) {
        this.handleClose();
      }
    }, 500);

    this.notify();
  }

  public close(): void {
    if (this.popupWindow && !this.popupWindow.closed) {
      try {
        this.popupWindow.close();
      } catch (e) {}
    }
    this.handleClose();
  }

  private handleClose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.renderer) {
      try {
        this.renderer.setExternalCanvas(null);
      } catch (e) {}
      this.renderer = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.popupWindow = null;
    this.notify();
  }
}
