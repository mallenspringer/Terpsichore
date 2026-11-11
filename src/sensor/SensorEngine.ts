import { useEngineStore } from '../state/store';
import { SensorZoneConfig } from '../state/types';

export interface SensorSignals {
  motion: number;       // 0..1 smoothed motion
  rawMotion: number;    // 0..1 instant motion
  gate: number;         // 0 or 1
  trig: number;         // 1 on crossing/trigger pulse, holds ~100ms
  r: number;            // 0..1
  g: number;            // 0..1
  b: number;            // 0..1
  hue: number;          // 0..1
  sat: number;          // 0..1
  luma: number;         // 0..1
}

interface LineTracker {
  sideAActive: boolean;
  sideBActive: boolean;
  timeA: number;
  timeB: number;
  lastCrossTime: number;
}

export class SensorEngine {
  private static instance: SensorEngine;

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private activeDeviceId: string = '';
  private isRunning: boolean = false;
  private animFrameId: number | null = null;

  // Analysis offscreen canvas
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 320;
  private height = 180;
  private prevFrame: Uint8ClampedArray | null = null;
  private lastMirrored: boolean = true;

  // Signal state
  private sensorValues: Map<string, SensorSignals> = new Map();
  private trigExpiries: Map<string, number> = new Map();
  private lineTrackers: Map<string, LineTracker> = new Map();
  private listeners: Set<() => void> = new Set();

  private constructor() {
    if (typeof window !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      // Subscribe to store changes to keep device / enabled in sync
      useEngineStore.subscribe((state) => {
        const sys = state.sensorSystem;
        if (!sys) return;
        if (sys.deviceId !== this.activeDeviceId) {
          this.setDevice(sys.deviceId);
        }
      });
    }
  }

  public static getInstance(): SensorEngine {
    if (!SensorEngine.instance) {
      SensorEngine.instance = new SensorEngine();
    }
    return SensorEngine.instance;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public getSensorSignals(sensorId: string): SensorSignals | undefined {
    return this.sensorValues.get(sensorId);
  }

  public getAllSignals(): Map<string, SensorSignals> {
    return this.sensorValues;
  }

  public async setDevice(deviceId: string) {
    this.activeDeviceId = deviceId;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }

    if (!deviceId && deviceId !== '') {
      this.stop();
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 1920, max: 3840 },
              height: { ideal: 1080, max: 2160 },
              aspectRatio: { ideal: 1.7777777778 }
            }
          : {
              width: { ideal: 1920, max: 3840 },
              height: { ideal: 1080, max: 2160 },
              aspectRatio: { ideal: 1.7777777778 }
            },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.stream = stream;

      if (!this.video) {
        this.video = document.createElement('video');
        this.video.muted = true;
        this.video.playsInline = true;
        this.video.autoplay = true;
      }
      this.video.srcObject = stream;
      await this.video.play().catch(() => {});

      if (!this.isRunning) {
        this.start();
      }
    } catch (err) {
      console.warn('SensorEngine: could not access media device:', err);
    }
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  private loop = () => {
    if (!this.isRunning) return;
    this.processFrame();
    this.animFrameId = requestAnimationFrame(this.loop);
  };

  public processFrame() {
    if (!this.video || !this.ctx || this.video.readyState < 2) {
      return;
    }

    const vidW = this.video.videoWidth || 16;
    const vidH = this.video.videoHeight || 9;
    const targetW = 320;
    const targetH = Math.max(90, Math.min(320, Math.round(targetW * (vidH / vidW))));

    if (this.width !== targetW || this.height !== targetH) {
      this.width = targetW;
      this.height = targetH;
      if (this.canvas) {
        this.canvas.width = targetW;
        this.canvas.height = targetH;
      }
      this.prevFrame = null;
    }

    const w = this.width;
    const h = this.height;

    const state = useEngineStore.getState();
    const sensorSystem = state.sensorSystem;
    const isMirrored = sensorSystem?.mirror ?? true;

    if (this.lastMirrored !== isMirrored) {
      this.lastMirrored = isMirrored;
      this.prevFrame = null;
    }

    if (isMirrored) {
      this.ctx.save();
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.video, 0, 0, w, h);
      this.ctx.restore();
    } else {
      this.ctx.drawImage(this.video, 0, 0, w, h);
    }

    let imgData: ImageData;
    try {
      imgData = this.ctx.getImageData(0, 0, w, h);
    } catch {
      return;
    }

    const currentPixels = imgData.data;
    const prev = this.prevFrame;
    const now = performance.now();

    const sensors = sensorSystem?.sensors || [];

    if (!prev || prev.length !== currentPixels.length) {
      this.prevFrame = new Uint8ClampedArray(currentPixels);
      return;
    }

    sensors.forEach((sensor) => {
      if (!sensor.enabled) {
        return;
      }

      let signals = this.sensorValues.get(sensor.id);
      if (!signals) {
        signals = {
          motion: 0,
          rawMotion: 0,
          gate: 0,
          trig: 0,
          r: 0,
          g: 0,
          b: 0,
          hue: 0,
          sat: 0,
          luma: 0
        };
        this.sensorValues.set(sensor.id, signals);
      }

      if (sensor.type === 'line') {
        this.processLineSensor(sensor, currentPixels, prev, w, h, signals, now);
      } else if (sensor.type === 'circle') {
        this.processCircleSensor(sensor, currentPixels, prev, w, h, signals, now);
      } else {
        // default: rect
        this.processRectSensor(sensor, currentPixels, prev, w, h, signals, now);
      }

      // Check trigger pulse expiry (e.g. 100ms pulse duration)
      const expiry = this.trigExpiries.get(sensor.id) ?? 0;
      if (now > expiry) {
        signals.trig = 0;
      }
    });

    // Copy current frame to prevFrame
    prev.set(currentPixels);

    // Notify UI subscribers
    this.listeners.forEach(cb => cb());
  }

  private processRectSensor(
    sensor: SensorZoneConfig,
    curr: Uint8ClampedArray,
    prev: Uint8ClampedArray,
    w: number,
    h: number,
    out: SensorSignals,
    now: number
  ) {
    const rx = Math.max(0, Math.min(1, sensor.x ?? 0));
    const ry = Math.max(0, Math.min(1, sensor.y ?? 0));
    const rw = Math.max(0.01, Math.min(1 - rx, sensor.width ?? 0.2));
    const rh = Math.max(0.01, Math.min(1 - ry, sensor.height ?? 0.2));

    const x0 = Math.floor(rx * w);
    const y0 = Math.floor(ry * h);
    const x1 = Math.min(w, Math.floor((rx + rw) * w));
    const y1 = Math.min(h, Math.floor((ry + rh) * h));

    let diffSum = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let y = y0; y < y1; y++) {
      let idx = (y * w + x0) * 4;
      for (let x = x0; x < x1; x++, idx += 4) {
        const cr = curr[idx];
        const cg = curr[idx + 1];
        const cb = curr[idx + 2];

        const pr = prev[idx];
        const pg = prev[idx + 1];
        const pb = prev[idx + 2];

        // Luma differencing
        const cluma = 0.299 * cr + 0.587 * cg + 0.114 * cb;
        const pluma = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        diffSum += Math.abs(cluma - pluma);

        rSum += cr;
        gSum += cg;
        bSum += cb;
        count++;
      }
    }

    this.finalizeZoneSignals(sensor, count, diffSum, rSum, gSum, bSum, out, now);
  }

  private processCircleSensor(
    sensor: SensorZoneConfig,
    curr: Uint8ClampedArray,
    prev: Uint8ClampedArray,
    w: number,
    h: number,
    out: SensorSignals,
    now: number
  ) {
    const cx = (sensor.cx ?? 0.5) * w;
    const cy = (sensor.cy ?? 0.5) * h;
    const radiusNorm = sensor.radius ?? 0.15;
    const rPx = radiusNorm * Math.min(w, h);
    const rSq = rPx * rPx;

    const x0 = Math.max(0, Math.floor(cx - rPx));
    const x1 = Math.min(w, Math.ceil(cx + rPx));
    const y0 = Math.max(0, Math.floor(cy - rPx));
    const y1 = Math.min(h, Math.ceil(cy + rPx));

    let diffSum = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let y = y0; y < y1; y++) {
      const dy = y - cy;
      const dySq = dy * dy;
      let idx = (y * w + x0) * 4;
      for (let x = x0; x < x1; x++, idx += 4) {
        const dx = x - cx;
        if (dx * dx + dySq <= rSq) {
          const cr = curr[idx];
          const cg = curr[idx + 1];
          const cb = curr[idx + 2];

          const pr = prev[idx];
          const pg = prev[idx + 1];
          const pb = prev[idx + 2];

          const cluma = 0.299 * cr + 0.587 * cg + 0.114 * cb;
          const pluma = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          diffSum += Math.abs(cluma - pluma);

          rSum += cr;
          gSum += cg;
          bSum += cb;
          count++;
        }
      }
    }

    this.finalizeZoneSignals(sensor, count, diffSum, rSum, gSum, bSum, out, now);
  }

  private finalizeZoneSignals(
    sensor: SensorZoneConfig,
    count: number,
    diffSum: number,
    rSum: number,
    gSum: number,
    bSum: number,
    out: SensorSignals,
    now: number
  ) {
    if (count <= 0) return;

    // Average color
    const r = (rSum / count) / 255.0;
    const g = (gSum / count) / 255.0;
    const b = (bSum / count) / 255.0;
    out.r = r;
    out.g = g;
    out.b = b;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    out.luma = 0.299 * r + 0.587 * g + 0.114 * b;
    out.sat = max === 0 ? 0 : delta / max;

    if (delta === 0) {
      out.hue = 0;
    } else if (max === r) {
      out.hue = (((g - b) / delta) % 6 + 6) % 6 / 6.0;
    } else if (max === g) {
      out.hue = (((b - r) / delta) + 2) / 6.0;
    } else {
      out.hue = (((r - g) / delta) + 4) / 6.0;
    }

    // Motion calculation
    const sens = (sensor.sensitivity ?? 0.5) * 8.0;
    const avgDiff = (diffSum / count) / 255.0;
    const rawMotion = Math.min(1.0, avgDiff * sens);
    out.rawMotion = rawMotion;

    // Smoothing
    const smoothing = Math.max(0, Math.min(0.95, sensor.smoothing ?? 0.3));
    out.motion = out.motion * smoothing + rawMotion * (1.0 - smoothing);

    // Gate & Trigger logic
    const threshold = sensor.threshold ?? 0.3;
    const isOver = sensor.algorithm === 'chrominance'
      ? out.luma >= threshold
      : out.motion >= threshold;

    const prevGate = out.gate;
    out.gate = isOver ? 1.0 : 0.0;

    if (out.gate > 0 && prevGate === 0) {
      out.trig = 1.0;
      this.trigExpiries.set(sensor.id, now + 100);
    }
  }

  private processLineSensor(
    sensor: SensorZoneConfig,
    curr: Uint8ClampedArray,
    prev: Uint8ClampedArray,
    w: number,
    h: number,
    out: SensorSignals,
    now: number
  ) {
    const x1 = (sensor.x1 ?? 0.2) * w;
    const y1 = (sensor.y1 ?? 0.5) * h;
    const x2 = (sensor.x2 ?? 0.8) * w;
    const y2 = (sensor.y2 ?? 0.5) * h;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    // Normal vector
    const nx = -dy / len;
    const ny = dx / len;
    const offsetPx = 5; // distance from line for strip A and strip B

    const numSamples = Math.max(5, Math.floor(len / 2));
    let diffA = 0;
    let diffB = 0;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let sampleCount = 0;

    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const lx = x1 + dx * t;
      const ly = y1 + dy * t;

      // Strip A (negative normal)
      const ax = Math.max(0, Math.min(w - 1, Math.round(lx - nx * offsetPx)));
      const ay = Math.max(0, Math.min(h - 1, Math.round(ly - ny * offsetPx)));
      const aIdx = (ay * w + ax) * 4;

      const aCr = curr[aIdx];
      const aCg = curr[aIdx + 1];
      const aCb = curr[aIdx + 2];
      const aPr = prev[aIdx];
      const aPg = prev[aIdx + 1];
      const aPb = prev[aIdx + 2];
      diffA += Math.abs((0.299 * aCr + 0.587 * aCg + 0.114 * aCb) - (0.299 * aPr + 0.587 * aPg + 0.114 * aPb));

      // Strip B (positive normal)
      const bx = Math.max(0, Math.min(w - 1, Math.round(lx + nx * offsetPx)));
      const by = Math.max(0, Math.min(h - 1, Math.round(ly + ny * offsetPx)));
      const bIdx = (by * w + bx) * 4;

      const bCr = curr[bIdx];
      const bCg = curr[bIdx + 1];
      const bCb = curr[bIdx + 2];
      const bPr = prev[bIdx];
      const bPg = prev[bIdx + 1];
      const bPb = prev[bIdx + 2];
      diffB += Math.abs((0.299 * bCr + 0.587 * bCg + 0.114 * bCb) - (0.299 * bPr + 0.587 * bPg + 0.114 * bPb));

      // On-line color
      const cx = Math.max(0, Math.min(w - 1, Math.round(lx)));
      const cy = Math.max(0, Math.min(h - 1, Math.round(ly)));
      const cIdx = (cy * w + cx) * 4;
      rSum += curr[cIdx];
      gSum += curr[cIdx + 1];
      bSum += curr[cIdx + 2];
      sampleCount++;
    }

    if (sampleCount === 0) return;

    // Average color on line
    out.r = (rSum / sampleCount) / 255.0;
    out.g = (gSum / sampleCount) / 255.0;
    out.b = (bSum / sampleCount) / 255.0;
    out.luma = 0.299 * out.r + 0.587 * out.g + 0.114 * out.b;

    // Differencing on strip A and strip B
    const sens = (sensor.sensitivity ?? 0.5) * 8.0;
    const avgA = (diffA / sampleCount) / 255.0 * sens;
    const avgB = (diffB / sampleCount) / 255.0 * sens;
    const rawMotion = Math.min(1.0, (avgA + avgB) * 0.5);
    out.rawMotion = rawMotion;

    const smoothing = Math.max(0, Math.min(0.95, sensor.smoothing ?? 0.2));
    out.motion = out.motion * smoothing + rawMotion * (1.0 - smoothing);

    // Directional tripwire crossing logic
    const threshold = sensor.threshold ?? 0.25;
    let tracker = this.lineTrackers.get(sensor.id);
    if (!tracker) {
      tracker = { sideAActive: false, sideBActive: false, timeA: 0, timeB: 0, lastCrossTime: 0 };
      this.lineTrackers.set(sensor.id, tracker);
    }

    const aActive = avgA >= threshold;
    const bActive = avgB >= threshold;

    if (aActive && !tracker.sideAActive) {
      tracker.timeA = now;
    }
    if (bActive && !tracker.sideBActive) {
      tracker.timeB = now;
    }

    tracker.sideAActive = aActive;
    tracker.sideBActive = bActive;

    // Check crossing if both activated within a 400ms window
    const direction = sensor.lineDirection || 'both';
    let crossed = false;

    if (aActive && bActive && (now - tracker.lastCrossTime > 300)) {
      const deltaT = tracker.timeB - tracker.timeA; // positive: A first, then B (A -> B)
      if (Math.abs(deltaT) < 400) {
        if (direction === 'both') {
          crossed = true;
        } else if (direction === 'a_to_b' && deltaT > 0) {
          crossed = true;
        } else if (direction === 'b_to_a' && deltaT < 0) {
          crossed = true;
        }
      }
    } else if ((aActive || bActive) && direction === 'both' && (now - tracker.lastCrossTime > 300)) {
      if (out.motion >= threshold) {
        crossed = true;
      }
    }

    if (crossed) {
      tracker.lastCrossTime = now;
      out.gate = 1.0;
      out.trig = 1.0;
      this.trigExpiries.set(sensor.id, now + 100);
    } else {
      // Hold gate if tripwire currently occupied
      out.gate = (aActive || bActive) ? 1.0 : 0.0;
    }
  }
}
