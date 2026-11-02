import React, { useRef, useEffect } from 'react';
import { AudioEngine } from '../../state/AudioEngine';

interface OscilloscopeVisualizerProps {
  busId: string;
  isFrozen: boolean;
  triggerLevel: number;
  timeScale: number;
  traceColor?: [number, number, number, number];
  showScaffold?: boolean;
  gain?: number;
}

export function OscilloscopeVisualizer({ busId, isFrozen, triggerLevel, timeScale, traceColor, showScaffold = true, gain = 2.0 }: OscilloscopeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = AudioEngine.getInstance();
  const lastWaveform = useRef<Float32Array | null>(null);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const bus = engine.getBusData(busId);
      if (bus) {
        if (!isFrozen) {
          lastWaveform.current = new Float32Array(bus.waveform);
        }
        
        const data = lastWaveform.current || bus.waveform;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw Grid if scaffold enabled
        if (showScaffold) {
          ctx.strokeStyle = '#1a261a';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, canvas.height / 2);
          ctx.lineTo(canvas.width, canvas.height / 2);
          ctx.stroke();
        }

        // Draw Waveform
        const tc = traceColor || [0.0, 1.0, 0.25, 1.0];
        const r = Math.round(tc[0] * 255);
        const g = Math.round(tc[1] * 255);
        const b = Math.round(tc[2] * 255);
        const hex = `rgb(${r},${g},${b})`;

        ctx.beginPath();
        ctx.strokeStyle = isFrozen ? '#4a9eff' : hex;
        ctx.lineWidth = 1.5;
        
        const sliceWidth = canvas.width / (data.length / (timeScale || 1));
        let x = 0;

        // Simple Trigger Logic to stabilize view
        let startIdx = 0;
        if (!isFrozen) {
          const thresh = triggerLevel || 0.05;
          for (let i = 1; i < data.length / 2; i++) {
            if (data[i] > thresh && data[i-1] <= thresh) {
              startIdx = i;
              break;
            }
          }
        }

        for (let i = startIdx; i < data.length; i++) {
          const scaled = data[i] * (gain || 2.0);
          const v = Math.max(-0.95, Math.min(0.95, scaled)) * 0.45 + 0.5;
          const y = (1 - v) * canvas.height;

          if (i === startIdx) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
          if (x > canvas.width) break;
        }
        ctx.stroke();

        // Glow effect if active
        if (!isFrozen && bus.peak > 0.1) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#18e4f5';
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [busId, isFrozen, triggerLevel, timeScale]);

  return (
    <div className="visualizer-container" style={{ padding: '4px', background: '#000', borderRadius: '4px', margin: '4px 0', border: '1px solid #222' }}>
      <canvas 
        ref={canvasRef} 
        width={240} 
        height={80} 
        style={{ width: '100%', height: '80px', display: 'block' }} 
      />
      <div style={{ fontSize: '8px', color: '#444', textAlign: 'right', marginTop: '2px', textTransform: 'uppercase' }}>
        Bus: {busId} {isFrozen ? '[FROZEN]' : ''}
      </div>
    </div>
  );
}

export function AudioSourceVisualizer({ busId }: { busId: string }) {
  const engine = AudioEngine.getInstance();
  const [meters, setMeters] = React.useState({ peak: 0, rms: 0 });

  React.useEffect(() => {
    let animId: number;
    const update = () => {
      const bus = engine.getBusData(busId);
      if (bus) {
        setMeters({ peak: bus.peak, rms: bus.rms });
      }
      animId = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(animId);
  }, [busId]);

  return (
    <div className="visualizer-container" style={{ padding: '6px', background: '#000', borderRadius: '4px', margin: '4px 0', border: '1px solid #222' }}>
      <div className="meter-row" style={{ height: '8px', background: '#111', borderRadius: '2px', position: 'relative', overflow: 'hidden', marginBottom: '4px' }}>
        <div style={{ height: '100%', width: `${meters.rms * 100}%`, background: 'linear-gradient(90deg, #18e4f5, #d918f5)', transition: 'width 0.1s' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${meters.peak * 100}%`, width: '2px', background: '#fff', opacity: 0.5 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '7px', color: '#666', fontFamily: 'monospace' }}>
        <span>0dB</span>
        <span>{busId.toUpperCase()}</span>
        <span>PK: {meters.peak.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function SpectralVisualizer({ 
  busId, 
  sensitivity, 
  gain, 
  showScaffold 
}: { 
  busId: string; 
  sensitivity: number; 
  gain?: number; 
  showScaffold?: boolean; 
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = AudioEngine.getInstance();

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const bus = engine.getBusData(busId);
      if (bus) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const hasScaffold = showScaffold ?? false;
        if (hasScaffold) {
          // 1. Draw granular FFT Background
          ctx.fillStyle = 'rgba(24, 228, 245, 0.15)';
          const fftCount = bus.fft.length / 2; // only show positive half
          const fftBarWidth = canvas.width / fftCount;
          for (let i = 0; i < fftCount; i++) {
            const val = Math.max(0, (bus.fft[i] + 100) / 100);
            const h = val * canvas.height;
            ctx.fillRect(i * fftBarWidth, canvas.height - h, fftBarWidth, h);
          }

          // 2. Draw background grid
          ctx.strokeStyle = '#222';
          ctx.lineWidth = 1;
          for (let i = 0; i < 4; i++) {
            const y = (i / 4) * canvas.height;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
          }
        }

        const bands = [
          bus.bands.low,
          bus.bands.lowMid,
          bus.bands.midGranular,
          bus.bands.highMid,
          bus.bands.highGranular
        ];

        const gap = 4;
        const barWidth = (canvas.width - (gap * 4)) / 5;
        const effectiveMultiplier = (sensitivity || 1.0) * (gain ?? 2.0);
        
        bands.forEach((val, i) => {
          const h = Math.max(1, Math.min(canvas.height, val * effectiveMultiplier * canvas.height));
          const x = i * (barWidth + gap);
          const y = canvas.height - h;

          const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
          gradient.addColorStop(0, '#18e4f5');
          gradient.addColorStop(1, '#d918f5');
          
          ctx.globalAlpha = hasScaffold ? 0.5 : 0.85;
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, barWidth, h);
          ctx.globalAlpha = 1.0;
          
          ctx.strokeStyle = '#18e4f5';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, barWidth, h);
          
          if (hasScaffold) {
            ctx.fillStyle = '#666';
            ctx.font = 'bold 8px Inter';
            const labels = ['LO', 'LM', 'MD', 'HM', 'HI'];
            ctx.fillText(labels[i], x + 2, canvas.height - 4);
          }
        });
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [busId, sensitivity, gain, showScaffold]);

  return (
    <div className="visualizer-container" style={{ padding: '6px', background: '#000', borderRadius: '4px', margin: '4px 0', border: '1px solid #222' }}>
      <canvas ref={canvasRef} width={240} height={40} style={{ width: '100%', height: '40px', display: 'block' }} />
    </div>
  );
}

export function WaterfallVisualizer({
  busId,
  tilt,
  gain,
  speed,
  renderStyle,
  showScaffold
}: {
  busId: string;
  tilt?: number;
  gain?: number;
  speed?: number;
  renderStyle?: 'surface' | 'lines';
  showScaffold?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = AudioEngine.getInstance();
  const historyRef = useRef<Float32Array[]>([]);
  const stepAccumulatorRef = useRef(0);

  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const bus = engine.getBusData(busId);
      if (bus && bus.fft) {
        // Collect 32 bins for preview with musical logarithmic distribution (30Hz to 16kHz)
        const slice = new Float32Array(32);
        const nyquist = (engine.getSampleRate?.() || 44100) / 2;
        const minFreq = 30;
        const maxFreq = 16000;
        for (let b = 0; b < 32; b++) {
          const t = b / 31;
          const targetFreq = minFreq * Math.pow(maxFreq / minFreq, t);
          const fftIdx = Math.max(0, Math.min(bus.fft.length - 1, Math.floor((targetFreq / nyquist) * bus.fft.length)));
          const db = bus.fft[fftIdx] ?? -100;
          slice[b] = Math.max(0, Math.min(1, (db + 75) / 75));
        }

        stepAccumulatorRef.current += Math.max(0.05, speed ?? 1.0) * 0.4;
        if (stepAccumulatorRef.current >= 1.0) {
          const steps = Math.min(4, Math.floor(stepAccumulatorRef.current));
          stepAccumulatorRef.current -= steps;
          for (let s = 0; s < steps; s++) {
            historyRef.current.unshift(slice);
            if (historyRef.current.length > 20) {
              historyRef.current.pop();
            }
          }
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const hasScaffold = showScaffold ?? false;
        if (hasScaffold) {
          ctx.fillStyle = '#0a0d14';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        const hist = historyRef.current;
        const count = hist.length;
        const effectiveGain = (gain ?? 2.0) * 0.4;
        const isLines = renderStyle === 'lines';

        // Draw back-to-front so foreground occludes background
        for (let h = count - 1; h >= 0; h--) {
          const row = hist[h];
          const zNorm = h / count; // 0 = front, 1 = back
          const yBase = canvas.height * (0.85 - (1.0 - zNorm) * 0.55);

          ctx.beginPath();
          for (let b = 0; b < 32; b++) {
            const x = (b / 31) * canvas.width;
            const hVal = row[b] * effectiveGain * canvas.height * (1.0 - zNorm * 0.4);
            const y = yBase - hVal;
            if (b === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          if (isLines) {
            ctx.strokeStyle = `rgba(0, 255, 65, ${0.9 - zNorm * 0.5})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();
          } else {
            ctx.lineTo(canvas.width, yBase + 4);
            ctx.lineTo(0, yBase + 4);
            ctx.closePath();
            ctx.fillStyle = `rgba(16, 200, 160, ${0.45 - zNorm * 0.25})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(24, 228, 245, ${0.7 - zNorm * 0.4})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [busId, tilt, gain, speed, renderStyle, showScaffold]);

  return (
    <div className="visualizer-container" style={{ padding: '6px', background: '#000', borderRadius: '4px', margin: '4px 0', border: '1px solid #222' }}>
      <canvas ref={canvasRef} width={240} height={40} style={{ width: '100%', height: '40px', display: 'block' }} />
    </div>
  );
}
