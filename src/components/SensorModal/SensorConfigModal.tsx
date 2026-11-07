import React, { useState, useEffect, useRef } from 'react';
import { useEngineStore } from '../../state/store';
import { SensorAlgorithm, LineCrossingDirection } from '../../state/types';
import { SensorEngine } from '../../sensor/SensorEngine';
import './SensorConfigModal.css';

interface SensorConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COLOR_PALETTE = [
  '#00e5ff',
  '#ff007f',
  '#ffe600',
  '#00ff66',
  '#a100ff',
  '#ff7700',
  '#ffffff'
];

export function SensorConfigModal({ isOpen, onClose }: SensorConfigModalProps) {
  const sensorSystem = useEngineStore(s => s.sensorSystem);
  const setSensorSystemDevice = useEngineStore(s => s.setSensorSystemDevice);
  const addSensorZone = useEngineStore(s => s.addSensorZone);
  const updateSensorZone = useEngineStore(s => s.updateSensorZone);
  const removeSensorZone = useEngineStore(s => s.removeSensorZone);
  const reorderSensorZones = useEngineStore(s => s.reorderSensorZones);

  const sensors = sensorSystem?.sensors || [];
  const activeDeviceId = sensorSystem?.deviceId || '';

  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'line' | 'rect' | 'circle'>('select');

  // Drawing interaction state
  const [dragState, setDragState] = useState<{
    isDrawing: boolean;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
    action?: 'create' | 'move' | 'resize';
    handle?: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Load available camera devices
  useEffect(() => {
    if (!isOpen) return;

    const loadDevices = async () => {
      try {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = all
          .filter(d => d.kind === 'videoinput')
          .map((d, i) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${i + 1}`
          }));
        setDevices(videoInputs);
        if (!activeDeviceId && videoInputs.length > 0) {
          setSensorSystemDevice(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn('Could not enumerate video devices:', err);
      }
    };

    loadDevices();
  }, [isOpen, activeDeviceId, setSensorSystemDevice]);

  // Ensure SensorEngine device is running when modal opens
  useEffect(() => {
    if (isOpen) {
      SensorEngine.getInstance().start();
    }
  }, [isOpen]);

  // Canvas drawing loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isSubscribed = true;

    const render = () => {
      if (!isSubscribed) return;

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== Math.floor(rect.width) || canvas.height !== Math.floor(rect.height)) {
        canvas.width = Math.max(10, Math.floor(rect.width));
        canvas.height = Math.max(10, Math.floor(rect.height));
      }

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw camera video preview
      const vid = SensorEngine.getInstance().getVideoElement();
      if (vid && vid.readyState >= 2) {
        ctx.drawImage(vid, 0, 0, w, h);
        // Dim video slightly so overlays pop
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#0a0c10';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#475569';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('No video signal or camera starting...', w / 2, h / 2);
      }

      // 2. Render configured sensor zones
      const engineSignals = SensorEngine.getInstance().getAllSignals();

      sensors.forEach((s) => {
        const isSelected = s.id === selectedSensorId;
        const color = s.color || '#00e5ff';
        const sigs = engineSignals.get(s.id);
        const isTriggered = (sigs?.trig ?? 0) > 0;
        const isGate = (sigs?.gate ?? 0) > 0;

        ctx.save();

        if (s.type === 'line') {
          const lx1 = (s.x1 ?? 0.2) * w;
          const ly1 = (s.y1 ?? 0.5) * h;
          const lx2 = (s.x2 ?? 0.8) * w;
          const ly2 = (s.y2 ?? 0.5) * h;

          // Draw tripwire line
          ctx.strokeStyle = isTriggered ? '#ffffff' : color;
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.setLineDash(isGate ? [6, 3] : []);
          ctx.beginPath();
          ctx.moveTo(lx1, ly1);
          ctx.lineTo(lx2, ly2);
          ctx.stroke();

          // Normal direction arrow
          const ldx = lx2 - lx1;
          const ldy = ly2 - ly1;
          const llen = Math.hypot(ldx, ldy);
          if (llen > 10) {
            const mx = (lx1 + lx2) / 2;
            const my = (ly1 + ly2) / 2;
            const nx = -ldy / llen * 14;
            const ny = ldx / llen * 14;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + nx, my + ny);
            ctx.stroke();
          }

          // End handles
          ctx.fillStyle = isSelected ? '#ffffff' : color;
          ctx.beginPath();
          ctx.arc(lx1, ly1, 5, 0, Math.PI * 2);
          ctx.arc(lx2, ly2, 5, 0, Math.PI * 2);
          ctx.fill();

          // Label
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(`${s.name}`, lx1, ly1 - 8);

        } else if (s.type === 'circle') {
          const cx = (s.cx ?? 0.5) * w;
          const cy = (s.cy ?? 0.5) * h;
          const r = (s.radius ?? 0.15) * Math.min(w, h);

          // Fill
          ctx.fillStyle = isTriggered
            ? 'rgba(255, 255, 255, 0.4)'
            : isGate
            ? `${color}44`
            : `${color}18`;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();

          // Stroke
          ctx.strokeStyle = isTriggered ? '#ffffff' : color;
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.stroke();

          // Center handle
          ctx.fillStyle = isSelected ? '#ffffff' : color;
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fill();

          // Label
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(`${s.name}`, cx - r, cy - r - 6);

        } else {
          // Rect
          const rx = (s.x ?? 0.1) * w;
          const ry = (s.y ?? 0.1) * h;
          const rw = (s.width ?? 0.3) * w;
          const rh = (s.height ?? 0.3) * h;

          // Fill
          ctx.fillStyle = isTriggered
            ? 'rgba(255, 255, 255, 0.4)'
            : isGate
            ? `${color}44`
            : `${color}18`;
          ctx.fillRect(rx, ry, rw, rh);

          // Stroke
          ctx.strokeStyle = isTriggered ? '#ffffff' : color;
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.strokeRect(rx, ry, rw, rh);

          // Corner handles if selected
          if (isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(rx - 3, ry - 3, 6, 6);
            ctx.fillRect(rx + rw - 3, ry - 3, 6, 6);
            ctx.fillRect(rx - 3, ry + rh - 3, 6, 6);
            ctx.fillRect(rx + rw - 3, ry + rh - 3, 6, 6);
          }

          // Label
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(`${s.name}`, rx + 4, ry - 6);
        }

        ctx.restore();
      });

      // 3. Render active drag-to-draw preview
      if (dragState && dragState.isDrawing && dragState.action === 'create') {
        const sx = dragState.startX * w;
        const sy = dragState.startY * h;
        const cx = dragState.currX * w;
        const cy = dragState.currY * h;

        ctx.save();
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);

        if (activeTool === 'line') {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        } else if (activeTool === 'circle') {
          const r = Math.hypot(cx - sx, cy - sy);
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.stroke();
        } else if (activeTool === 'rect') {
          const rx = Math.min(sx, cx);
          const ry = Math.min(sy, cy);
          const rw = Math.abs(cx - sx);
          const rh = Math.abs(cy - sy);
          ctx.strokeRect(rx, ry, rw, rh);
        }
        ctx.restore();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isSubscribed = false;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isOpen, sensors, selectedSensorId, activeTool, dragState]);

  // Canvas Mouse Event Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (activeTool === 'select') {
      // Find clicked sensor
      let clickedId: string | null = null;
      for (let i = sensors.length - 1; i >= 0; i--) {
        const s = sensors[i];
        if (s.type === 'line') {
          const x1 = s.x1 ?? 0.2;
          const y1 = s.y1 ?? 0.5;
          const x2 = s.x2 ?? 0.8;
          const y2 = s.y2 ?? 0.5;
          // Distance to segment
          const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
          const t = Math.max(0, Math.min(1, ((nx - x1) * (x2 - x1) + (ny - y1) * (y2 - y1)) / l2));
          const projX = x1 + t * (x2 - x1);
          const projY = y1 + t * (y2 - y1);
          if (Math.hypot(nx - projX, ny - projY) < 0.05) {
            clickedId = s.id;
            break;
          }
        } else if (s.type === 'circle') {
          const cx = s.cx ?? 0.5;
          const cy = s.cy ?? 0.5;
          const r = s.radius ?? 0.15;
          if (Math.hypot(nx - cx, ny - cy) <= r) {
            clickedId = s.id;
            break;
          }
        } else {
          const rx = s.x ?? 0.1;
          const ry = s.y ?? 0.1;
          const rw = s.width ?? 0.3;
          const rh = s.height ?? 0.3;
          if (nx >= rx && nx <= rx + rw && ny >= ry && ny <= ry + rh) {
            clickedId = s.id;
            break;
          }
        }
      }

      setSelectedSensorId(clickedId);
      if (clickedId) {
        setDragState({
          isDrawing: true,
          startX: nx,
          startY: ny,
          currX: nx,
          currY: ny,
          action: 'move'
        });
      }
    } else {
      // Creation tool active
      setDragState({
        isDrawing: true,
        startX: nx,
        startY: ny,
        currX: nx,
        currY: ny,
        action: 'create'
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState || !dragState.isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (dragState.action === 'move' && selectedSensorId) {
      const dx = nx - dragState.currX;
      const dy = ny - dragState.currY;
      const s = sensors.find(item => item.id === selectedSensorId);
      if (s) {
        if (s.type === 'line') {
          updateSensorZone(s.id, {
            x1: Math.max(0, Math.min(1, (s.x1 ?? 0.2) + dx)),
            y1: Math.max(0, Math.min(1, (s.y1 ?? 0.5) + dy)),
            x2: Math.max(0, Math.min(1, (s.x2 ?? 0.8) + dx)),
            y2: Math.max(0, Math.min(1, (s.y2 ?? 0.5) + dy)),
          });
        } else if (s.type === 'circle') {
          updateSensorZone(s.id, {
            cx: Math.max(0, Math.min(1, (s.cx ?? 0.5) + dx)),
            cy: Math.max(0, Math.min(1, (s.cy ?? 0.5) + dy)),
          });
        } else {
          updateSensorZone(s.id, {
            x: Math.max(0, Math.min(1 - (s.width ?? 0.3), (s.x ?? 0.1) + dx)),
            y: Math.max(0, Math.min(1 - (s.height ?? 0.3), (s.y ?? 0.1) + dy)),
          });
        }
      }
    }

    setDragState(prev => prev ? { ...prev, currX: nx, currY: ny } : null);
  };

  const handlePointerUp = () => {
    if (!dragState || !dragState.isDrawing) return;

    if (dragState.action === 'create') {
      const sx = dragState.startX;
      const sy = dragState.startY;
      const ex = dragState.currX;
      const ey = dragState.currY;

      const newId = `sensor_${Date.now()}`;
      const color = COLOR_PALETTE[sensors.length % COLOR_PALETTE.length];

      if (activeTool === 'line') {
        const len = Math.hypot(ex - sx, ey - sy);
        if (len > 0.02) {
          addSensorZone({
            id: newId,
            name: `Line ${sensors.length + 1}`,
            type: 'line',
            algorithm: 'motion',
            color,
            enabled: true,
            x1: sx,
            y1: sy,
            x2: ex,
            y2: ey,
            sensitivity: 0.5,
            threshold: 0.25,
            smoothing: 0.2,
            lineDirection: 'both'
          });
          setSelectedSensorId(newId);
          setActiveTool('select');
        }
      } else if (activeTool === 'circle') {
        const radius = Math.max(0.03, Math.hypot(ex - sx, ey - sy));
        addSensorZone({
          id: newId,
          name: `Circle ${sensors.length + 1}`,
          type: 'circle',
          algorithm: 'motion',
          color,
          enabled: true,
          cx: sx,
          cy: sy,
          radius,
          sensitivity: 0.5,
          threshold: 0.3,
          smoothing: 0.3
        });
        setSelectedSensorId(newId);
        setActiveTool('select');
      } else if (activeTool === 'rect') {
        const rx = Math.min(sx, ex);
        const ry = Math.min(sy, ey);
        const rw = Math.max(0.04, Math.abs(ex - sx));
        const rh = Math.max(0.04, Math.abs(ey - sy));
        addSensorZone({
          id: newId,
          name: `Zone ${sensors.length + 1}`,
          type: 'rect',
          algorithm: 'motion',
          color,
          enabled: true,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          sensitivity: 0.5,
          threshold: 0.3,
          smoothing: 0.3
        });
        setSelectedSensorId(newId);
        setActiveTool('select');
      }
    }

    setDragState(null);
  };

  const selectedSensor = sensors.find(s => s.id === selectedSensorId);
  const selectedSignals = selectedSensorId ? SensorEngine.getInstance().getSensorSignals(selectedSensorId) : undefined;

  if (!isOpen) return null;

  return (
    <div className="sensor-modal-backdrop" onClick={onClose}>
      <div className="sensor-modal-window" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sensor-modal-header">
          <div className="sensor-modal-title">
            <span>🎯</span> Optical Sensor Zones
          </div>
          <button className="sensor-modal-close-btn" onClick={onClose}>×</button>
        </div>

        {/* Toolbar */}
        <div className="sensor-modal-toolbar">
          <div className="sensor-modal-tools-group">
            <button
              className={`sensor-tool-btn ${activeTool === 'select' ? 'active' : ''}`}
              onClick={() => setActiveTool('select')}
              title="Select / Move"
            >
              ✥ Select (V)
            </button>
            <button
              className={`sensor-tool-btn ${activeTool === 'line' ? 'active' : ''}`}
              onClick={() => setActiveTool('line')}
              title="Line Crossing Sensor"
            >
              ─ Line (L)
            </button>
            <button
              className={`sensor-tool-btn ${activeTool === 'rect' ? 'active' : ''}`}
              onClick={() => setActiveTool('rect')}
              title="Rectangle Sensor"
            >
              ▭ Rect (R)
            </button>
            <button
              className={`sensor-tool-btn ${activeTool === 'circle' ? 'active' : ''}`}
              onClick={() => setActiveTool('circle')}
              title="Circle Sensor"
            >
              ○ Circle (C)
            </button>
          </div>

          <div className="sensor-modal-device-group">
            <label style={{ fontSize: 11, color: '#94a3b8' }}>Camera:</label>
            <select
              className="sensor-device-select"
              value={activeDeviceId}
              onChange={e => setSensorSystemDevice(e.target.value)}
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        <div className="sensor-modal-body">
          {/* Canvas Preview */}
          <div className="sensor-preview-container">
            <canvas
              ref={canvasRef}
              className="sensor-preview-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
            <div className="sensor-preview-overlay-info">
              {activeTool === 'select' ? 'Click to select / drag to move' : `Drag to create ${activeTool} sensor`}
            </div>
          </div>

          {/* Sidebar */}
          <div className="sensor-modal-sidebar">
            <div className="sensor-sidebar-header">
              <span>Sensors ({sensors.length})</span>
            </div>

            <div className="sensor-zones-list">
              {sensors.length === 0 ? (
                <div style={{ padding: 16, fontSize: 11, color: '#64748b', textAlign: 'center' }}>
                  No sensors configured. Select a tool above and drag over the camera preview to create one.
                </div>
              ) : (
                sensors.map((s, idx) => {
                  const sigs = SensorEngine.getInstance().getSensorSignals(s.id);
                  const isSelected = s.id === selectedSensorId;
                  const isGate = (sigs?.gate ?? 0) > 0;
                  const isTrig = (sigs?.trig ?? 0) > 0;

                  return (
                    <div
                      key={s.id}
                      className={`sensor-zone-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedSensorId(s.id)}
                    >
                      <div className="sensor-zone-item-row">
                        <div className="sensor-zone-item-left">
                          <div className="sensor-color-pip" style={{ background: s.color }} />
                          <span className="sensor-zone-name">{s.name}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (idx > 0) reorderSensorZones(idx, idx - 1);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: idx === 0 ? '#444' : '#94a3b8',
                              cursor: idx === 0 ? 'default' : 'pointer',
                              fontSize: 9,
                              padding: '1px 3px'
                            }}
                            title="Move Up"
                          >
                            ▲
                          </button>
                          <button
                            disabled={idx === sensors.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (idx < sensors.length - 1) reorderSensorZones(idx, idx + 1);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: idx === sensors.length - 1 ? '#444' : '#94a3b8',
                              cursor: idx === sensors.length - 1 ? 'default' : 'pointer',
                              fontSize: 9,
                              padding: '1px 3px'
                            }}
                            title="Move Down"
                          >
                            ▼
                          </button>
                          <span className="sensor-zone-badge">{s.type}</span>
                          <span className="sensor-zone-badge">{s.algorithm === 'chrominance' ? 'RGB' : 'MOT'}</span>
                          <div className={`sensor-led-pill ${isTrig ? 'trig-active' : isGate ? 'gate-active' : ''}`} />
                        </div>
                      </div>

                      {/* Live Activity meter bar */}
                      <div className="sensor-meter-bar-container">
                        <div
                          className="sensor-meter-bar-fill"
                          style={{
                            width: `${Math.round((sigs?.motion ?? 0) * 100)}%`,
                            background: s.color
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Inspector Panel for Selected Sensor */}
            {selectedSensor && (
              <div className="sensor-inspector-panel">
                <div className="sensor-prop-row">
                  <span className="sensor-prop-label">Name</span>
                  <input
                    type="text"
                    className="sensor-prop-input"
                    value={selectedSensor.name}
                    onChange={e => updateSensorZone(selectedSensor.id, { name: e.target.value })}
                  />
                </div>

                <div className="sensor-prop-row">
                  <span className="sensor-prop-label">Color</span>
                  <div className="sensor-color-swatches">
                    {COLOR_PALETTE.map(c => (
                      <div
                        key={c}
                        className={`sensor-swatch ${selectedSensor.color === c ? 'active' : ''}`}
                        style={{ background: c }}
                        onClick={() => updateSensorZone(selectedSensor.id, { color: c })}
                      />
                    ))}
                  </div>
                </div>

                {selectedSensor.type !== 'line' && (
                  <div className="sensor-prop-row">
                    <span className="sensor-prop-label">Algorithm</span>
                    <select
                      className="sensor-prop-input"
                      value={selectedSensor.algorithm}
                      onChange={e => updateSensorZone(selectedSensor.id, { algorithm: e.target.value as SensorAlgorithm })}
                    >
                      <option value="motion">Motion Detection</option>
                      <option value="chrominance">Average Color (RGB/HSV)</option>
                    </select>
                  </div>
                )}

                {selectedSensor.type === 'line' && (
                  <div className="sensor-prop-row">
                    <span className="sensor-prop-label">Direction</span>
                    <select
                      className="sensor-prop-input"
                      value={selectedSensor.lineDirection || 'both'}
                      onChange={e => updateSensorZone(selectedSensor.id, { lineDirection: e.target.value as LineCrossingDirection })}
                    >
                      <option value="both">Bidirectional (Both)</option>
                      <option value="a_to_b">Side A → Side B</option>
                      <option value="b_to_a">Side B → Side A</option>
                    </select>
                  </div>
                )}

                <div className="sensor-prop-row">
                  <span className="sensor-prop-label">Sensitivity</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    className="sensor-prop-slider"
                    value={selectedSensor.sensitivity ?? 0.5}
                    onChange={e => updateSensorZone(selectedSensor.id, { sensitivity: parseFloat(e.target.value) })}
                  />
                  <span style={{ fontSize: 10, width: 28, textAlign: 'right' }}>
                    {Math.round((selectedSensor.sensitivity ?? 0.5) * 100)}%
                  </span>
                </div>

                <div className="sensor-prop-row">
                  <span className="sensor-prop-label">Threshold</span>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    className="sensor-prop-slider"
                    value={selectedSensor.threshold ?? 0.3}
                    onChange={e => updateSensorZone(selectedSensor.id, { threshold: parseFloat(e.target.value) })}
                  />
                  <span style={{ fontSize: 10, width: 28, textAlign: 'right' }}>
                    {Math.round((selectedSensor.threshold ?? 0.3) * 100)}%
                  </span>
                </div>

                <div className="sensor-prop-row">
                  <span className="sensor-prop-label">Smoothing</span>
                  <input
                    type="range"
                    min="0.0"
                    max="0.9"
                    step="0.05"
                    className="sensor-prop-slider"
                    value={selectedSensor.smoothing ?? 0.3}
                    onChange={e => updateSensorZone(selectedSensor.id, { smoothing: parseFloat(e.target.value) })}
                  />
                  <span style={{ fontSize: 10, width: 28, textAlign: 'right' }}>
                    {Math.round((selectedSensor.smoothing ?? 0.3) * 100)}%
                  </span>
                </div>

                {/* Color preview swatch if chrominance */}
                {selectedSensor.algorithm === 'chrominance' && selectedSignals && (
                  <div className="sensor-prop-row">
                    <span className="sensor-prop-label">Live RGB</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 24,
                          height: 18,
                          borderRadius: 3,
                          background: `rgb(${Math.round(selectedSignals.r * 255)}, ${Math.round(selectedSignals.g * 255)}, ${Math.round(selectedSignals.b * 255)})`,
                          border: '1px solid #475569'
                        }}
                      />
                      <span style={{ fontSize: 10, fontFamily: 'monospace' }}>
                        H:{Math.round(selectedSignals.hue * 360)}° S:{Math.round(selectedSignals.sat * 100)}% L:{Math.round(selectedSignals.luma * 100)}%
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <button
                    className="sensor-zone-delete-btn"
                    onClick={() => {
                      removeSensorZone(selectedSensor.id);
                      setSelectedSensorId(null);
                    }}
                  >
                    Delete Sensor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
