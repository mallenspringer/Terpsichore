import React, { useRef, useEffect } from 'react';
import { AudioEngine } from '../../state/AudioEngine';

interface OscilloscopeVisualizerProps {
  busId: string;
  isFrozen: boolean;
  triggerLevel: number;
  timeScale: number;
}

export function OscilloscopeVisualizer({ busId, isFrozen, triggerLevel, timeScale }: OscilloscopeVisualizerProps) {
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
        
        // Draw Grid
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        // Draw Waveform
        ctx.beginPath();
        ctx.strokeStyle = isFrozen ? '#4a9eff' : '#18e4f5';
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
          const v = data[i] * 0.5 + 0.5;
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

export function SpectralVisualizer({ busId, sensitivity }: { busId: string, sensitivity: number }) {
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

        const bands = [
          bus.bands.low,
          bus.bands.lowMid,
          bus.bands.midGranular,
          bus.bands.highMid,
          bus.bands.highGranular
        ];

        const gap = 4;
        const barWidth = (canvas.width - (gap * 4)) / 5;
        
        bands.forEach((val, i) => {
          const h = Math.max(1, Math.min(canvas.height, val * (sensitivity || 1.0) * canvas.height));
          const x = i * (barWidth + gap);
          const y = canvas.height - h;

          const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
          gradient.addColorStop(0, '#18e4f5');
          gradient.addColorStop(1, '#d918f5');
          
          ctx.globalAlpha = 0.5; // Reduced from 0.8 to not overwhelm granular view
          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, barWidth, h);
          ctx.globalAlpha = 1.0;
          
          ctx.strokeStyle = '#18e4f5';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, barWidth, h);
          
          ctx.fillStyle = '#666';
          ctx.font = 'bold 8px Inter';
          const labels = ['LO', 'LM', 'MD', 'HM', 'HI'];
          ctx.fillText(labels[i], x + 2, canvas.height - 4);
        });
      }
      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [busId, sensitivity]);

  return (
    <div className="visualizer-container" style={{ padding: '6px', background: '#000', borderRadius: '4px', margin: '4px 0', border: '1px solid #222' }}>
      <canvas ref={canvasRef} width={240} height={40} style={{ width: '100%', height: '40px', display: 'block' }} />
    </div>
  );
}
