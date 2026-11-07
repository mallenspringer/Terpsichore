import React, { useState, useEffect, useRef } from 'react';
import { useEngineStore } from '../../state/store';
import { SensorZoneConfig, SensorAlgorithm, LineCrossingDirection } from '../../state/types';
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

type HandleType =
  | 'line_p1' | 'line_p2' | 'line_mid'
  | 'circle_center' | 'circle_r_e' | 'circle_r_w' | 'circle_r_n' | 'circle_r_s'
  | 'rect_nw' | 'rect_ne' | 'rect_se' | 'rect_sw'
  | 'rect_n' | 'rect_s' | 'rect_e' | 'rect_w'
  | 'body';

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

  // Drawing and interaction state
  const [dragState, setDragState] = useState<{
    isDrawing: boolean;
    startX: number;
    startY: number;
    currX: number;
    currY: number;
    action: 'create' | 'move' | 'resize';
    handle?: HandleType;
    initial?: SensorZoneConfig;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
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

  // Ensure SensorEngine is running when modal opens
  useEffect(() => {
    if (isOpen) {
      SensorEngine.getInstance().start();
    }
  }, [isOpen]);

  // Helper to test if a point (px, py) is on a handle of the sensor
  const getHandleAt = (
    s: SensorZoneConfig,
    px: number,
    py: number,
    w: number,
    h: number
  ): HandleType | null => {
    if (s.type === 'line') {
      const p1x = (s.x1 ?? 0.2) * w;
      const p1y = (s.y1 ?? 0.5) * h;
      const p2x = (s.x2 ?? 0.8) * w;
      const p2y = (s.y2 ?? 0.5) * h;
      const midx = (p1x + p2x) / 2;
      const midy = (p1y + p2y) / 2;

      if (Math.hypot(px - p1x, py - p1y) <= 12) return 'line_p1';
      if (Math.hypot(px - p2x, py - p2y) <= 12) return 'line_p2';
      if (Math.hypot(px - midx, py - midy) <= 12) return 'line_mid';

      // Distance to segment
      const l2 = (p2x - p1x) ** 2 + (p2y - p1y) ** 2;
      if (l2 > 0) {
        const t = Math.max(0, Math.min(1, ((px - p1x) * (p2x - p1x) + (py - p1y) * (p2y - p1y)) / l2));
        const projX = p1x + t * (p2x - p1x);
        const projY = p1y + t * (p2y - p1y);
        if (Math.hypot(px - projX, py - projY) <= 10) return 'body';
      }
      return null;
    }

    if (s.type === 'circle') {
      const cx = (s.cx ?? 0.5) * w;
      const cy = (s.cy ?? 0.5) * h;
      const r = (s.radius ?? 0.15) * Math.min(w, h);

      if (Math.hypot(px - (cx + r), py - cy) <= 10) return 'circle_r_e';
      if (Math.hypot(px - (cx - r), py - cy) <= 10) return 'circle_r_w';
      if (Math.hypot(px - cx, py - (cy - r)) <= 10) return 'circle_r_n';
      if (Math.hypot(px - cx, py - (cy + r)) <= 10) return 'circle_r_s';
      if (Math.hypot(px - cx, py - cy) <= 10) return 'circle_center';
      if (Math.hypot(px - cx, py - cy) <= r) return 'body';
      return null;
    }

    // Rect
    const rx = (s.x ?? 0.1) * w;
    const ry = (s.y ?? 0.1) * h;
    const rw = (s.width ?? 0.3) * w;
    const rh = (s.height ?? 0.3) * h;

    // 4 corners
    if (Math.hypot(px - rx, py - ry) <= 10) return 'rect_nw';
    if (Math.hypot(px - (rx + rw), py - ry) <= 10) return 'rect_ne';
    if (Math.hypot(px - (rx + rw), py - (ry + rh)) <= 10) return 'rect_se';
    if (Math.hypot(px - rx, py - (ry + rh)) <= 10) return 'rect_sw';

    // 4 edges
    if (Math.hypot(px - (rx + rw / 2), py - ry) <= 8) return 'rect_n';
    if (Math.hypot(px - (rx + rw / 2), py - (ry + rh)) <= 8) return 'rect_s';
    if (Math.hypot(px - rx, py - (ry + rh / 2)) <= 8) return 'rect_w';
    if (Math.hypot(px - (rx + rw), py - (ry + rh / 2)) <= 8) return 'rect_e';

    // Body
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return 'body';

    return null;
  };

  // Canvas drawing loop
  useEffect(() => {
    if (!isOpen) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isSubscribed = true;

    const render = () => {
      if (!isSubscribed) return;

      const cRect = container.getBoundingClientRect();
      const availW = Math.max(100, cRect.width - 24);
      const availH = Math.max(100, cRect.height - 24);

      // Match webcam's native aspect ratio (default 16:9 for room coverage)
      const vid = SensorEngine.getInstance().getVideoElement();
      const vidW = vid?.videoWidth || 16;
      const vidH = vid?.videoHeight || 9;
      const aspect = vidW / vidH;

      let dispW = availW;
      let dispH = availW / aspect;
      if (dispH > availH) {
        dispH = availH;
        dispW = availH * aspect;
      }

      const targetW = Math.floor(dispW);
      const targetH = Math.floor(dispH);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${targetW}px`;
        canvas.style.height = `${targetH}px`;
      }

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw camera video preview
      if (vid && vid.readyState >= 2) {
        ctx.drawImage(vid, 0, 0, w, h);
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

          // Tripwire line
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

          // Handles if selected
          if (isSelected) {
            // Endpoint A
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(lx1, ly1, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Endpoint B
            ctx.beginPath();
            ctx.arc(lx2, ly2, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Midpoint handle
            const mx = (lx1 + lx2) / 2;
            const my = (ly1 + ly2) / 2;
            ctx.fillStyle = color;
            ctx.fillRect(mx - 3.5, my - 3.5, 7, 7);
            ctx.strokeRect(mx - 3.5, my - 3.5, 7, 7);
          } else {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(lx1, ly1, 4, 0, Math.PI * 2);
            ctx.arc(lx2, ly2, 4, 0, Math.PI * 2);
            ctx.fill();
          }

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
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.fill();
          if (isSelected) ctx.stroke();

          // Radial resize handles if selected
          if (isSelected) {
            const radHandles = [
              [cx + r, cy],
              [cx - r, cy],
              [cx, cy - r],
              [cx, cy + r],
            ];
            ctx.fillStyle = '#ffffff';
            radHandles.forEach(([hx, hy]) => {
              ctx.fillRect(hx - 3.5, hy - 3.5, 7, 7);
              ctx.strokeRect(hx - 3.5, hy - 3.5, 7, 7);
            });
          }

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

          // 8 Resize handles if selected (4 corners + 4 edges)
          if (isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.5;

            // Corners (8x8)
            const corners = [
              [rx, ry],
              [rx + rw, ry],
              [rx + rw, ry + rh],
              [rx, ry + rh],
            ];
            corners.forEach(([hx, hy]) => {
              ctx.fillRect(hx - 4, hy - 4, 8, 8);
              ctx.strokeRect(hx - 4, hy - 4, 8, 8);
            });

            // Edge midpoints (6x6)
            const edges = [
              [rx + rw / 2, ry],
              [rx + rw / 2, ry + rh],
              [rx, ry + rh / 2],
              [rx + rw, ry + rh / 2],
            ];
            edges.forEach(([hx, hy]) => {
              ctx.fillRect(hx - 3, hy - 3, 6, 6);
              ctx.strokeRect(hx - 3, hy - 3, 6, 6);
            });
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

  // Pointer Down
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const px = nx * canvas.width;
    const py = ny * canvas.height;

    if (activeTool === 'select') {
      // 1. If a sensor is already selected, check if clicking one of its handles
      const currentSelected = sensors.find(s => s.id === selectedSensorId);
      if (currentSelected) {
        const handle = getHandleAt(currentSelected, px, py, canvas.width, canvas.height);
        if (handle) {
          const isMove = handle === 'body' || handle === 'circle_center' || handle === 'line_mid';
          setDragState({
            isDrawing: true,
            startX: nx,
            startY: ny,
            currX: nx,
            currY: ny,
            action: isMove ? 'move' : 'resize',
            handle,
            initial: { ...currentSelected }
          });
          return;
        }
      }

      // 2. Otherwise check if clicking any sensor to select it
      let clickedId: string | null = null;
      let clickedHandle: HandleType | null = null;

      for (let i = sensors.length - 1; i >= 0; i--) {
        const s = sensors[i];
        const h = getHandleAt(s, px, py, canvas.width, canvas.height);
        if (h) {
          clickedId = s.id;
          clickedHandle = h;
          break;
        }
      }

      setSelectedSensorId(clickedId);
      if (clickedId && clickedHandle) {
        const s = sensors.find(item => item.id === clickedId)!;
        const isMove = clickedHandle === 'body' || clickedHandle === 'circle_center' || clickedHandle === 'line_mid';
        setDragState({
          isDrawing: true,
          startX: nx,
          startY: ny,
          currX: nx,
          currY: ny,
          action: isMove ? 'move' : 'resize',
          handle: clickedHandle,
          initial: { ...s }
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

  // Pointer Move (Hover cursor & Drag interaction)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const px = nx * canvas.width;
    const py = ny * canvas.height;

    // Hover Cursor Management
    if (!dragState?.isDrawing) {
      if (activeTool !== 'select') {
        canvas.style.cursor = 'crosshair';
      } else {
        const currentSelected = sensors.find(s => s.id === selectedSensorId);
        let cursor = 'default';
        if (currentSelected) {
          const handle = getHandleAt(currentSelected, px, py, canvas.width, canvas.height);
          if (handle === 'rect_nw' || handle === 'rect_se') cursor = 'nwse-resize';
          else if (handle === 'rect_ne' || handle === 'rect_sw') cursor = 'nesw-resize';
          else if (handle === 'rect_n' || handle === 'rect_s' || handle === 'circle_r_n' || handle === 'circle_r_s') cursor = 'ns-resize';
          else if (handle === 'rect_e' || handle === 'rect_w' || handle === 'circle_r_e' || handle === 'circle_r_w') cursor = 'ew-resize';
          else if (handle === 'line_p1' || handle === 'line_p2') cursor = 'crosshair';
          else if (handle === 'line_mid' || handle === 'circle_center' || handle === 'body') cursor = 'move';
        }
        if (cursor === 'default') {
          // Check other sensors for hover pointer
          for (let i = sensors.length - 1; i >= 0; i--) {
            if (getHandleAt(sensors[i], px, py, canvas.width, canvas.height)) {
              cursor = 'pointer';
              break;
            }
          }
        }
        canvas.style.cursor = cursor;
      }
      return;
    }

    // Active Drag Operation
    const init = dragState.initial;
    if (!init || !selectedSensorId) {
      setDragState(prev => prev ? { ...prev, currX: nx, currY: ny } : null);
      return;
    }

    const dx = nx - dragState.startX;
    const dy = ny - dragState.startY;

    if (dragState.action === 'move') {
      if (init.type === 'line') {
        const ldx = (init.x2 ?? 0.8) - (init.x1 ?? 0.2);
        const ldy = (init.y2 ?? 0.5) - (init.y1 ?? 0.5);
        const newX1 = Math.max(0, Math.min(1 - ldx, (init.x1 ?? 0.2) + dx));
        const newY1 = Math.max(0, Math.min(1 - ldy, (init.y1 ?? 0.5) + dy));
        updateSensorZone(init.id, {
          x1: newX1,
          y1: newY1,
          x2: newX1 + ldx,
          y2: newY1 + ldy
        });
      } else if (init.type === 'circle') {
        updateSensorZone(init.id, {
          cx: Math.max(0, Math.min(1, (init.cx ?? 0.5) + dx)),
          cy: Math.max(0, Math.min(1, (init.cy ?? 0.5) + dy))
        });
      } else {
        const w = init.width ?? 0.3;
        const h = init.height ?? 0.3;
        updateSensorZone(init.id, {
          x: Math.max(0, Math.min(1 - w, (init.x ?? 0.1) + dx)),
          y: Math.max(0, Math.min(1 - h, (init.y ?? 0.1) + dy))
        });
      }
    } else if (dragState.action === 'resize') {
      const handle = dragState.handle;

      if (init.type === 'line') {
        if (handle === 'line_p1') {
          updateSensorZone(init.id, { x1: nx, y1: ny });
        } else if (handle === 'line_p2') {
          updateSensorZone(init.id, { x2: nx, y2: ny });
        }
      } else if (init.type === 'circle') {
        const cx = init.cx ?? 0.5;
        const cy = init.cy ?? 0.5;
        const distPx = Math.hypot((nx - cx) * canvas.width, (ny - cy) * canvas.height);
        const newR = Math.max(0.02, Math.min(0.5, distPx / Math.min(canvas.width, canvas.height)));
        updateSensorZone(init.id, { radius: newR });
      } else if (init.type === 'rect') {
        let x = init.x ?? 0.1;
        let y = init.y ?? 0.1;
        let rw = init.width ?? 0.3;
        let rh = init.height ?? 0.3;

        // East resizing
        if (handle === 'rect_e' || handle === 'rect_ne' || handle === 'rect_se') {
          rw = Math.max(0.02, Math.min(1 - x, nx - x));
        }
        // West resizing
        if (handle === 'rect_w' || handle === 'rect_nw' || handle === 'rect_sw') {
          const right = x + rw;
          const newX = Math.max(0, Math.min(right - 0.02, nx));
          x = newX;
          rw = right - newX;
        }
        // South resizing
        if (handle === 'rect_s' || handle === 'rect_se' || handle === 'rect_sw') {
          rh = Math.max(0.02, Math.min(1 - y, ny - y));
        }
        // North resizing
        if (handle === 'rect_n' || handle === 'rect_nw' || handle === 'rect_ne') {
          const bottom = y + rh;
          const newY = Math.max(0, Math.min(bottom - 0.02, ny));
          y = newY;
          rh = bottom - newY;
        }

        updateSensorZone(init.id, { x, y, width: rw, height: rh });
      }
    }

    setDragState(prev => prev ? { ...prev, currX: nx, currY: ny } : null);
  };

  // Pointer Up
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
        const canvas = canvasRef.current;
        const w = canvas?.width || 320;
        const h = canvas?.height || 180;
        const distPx = Math.hypot((ex - sx) * w, (ey - sy) * h);
        const radius = Math.max(0.03, distPx / Math.min(w, h));
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
              title="Select / Move / Resize"
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
          {/* Canvas Preview Container */}
          <div className="sensor-preview-container" ref={containerRef}>
            <canvas
              ref={canvasRef}
              className="sensor-preview-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
            <div className="sensor-preview-overlay-info">
              {activeTool === 'select'
                ? selectedSensor
                  ? 'Drag handles to resize • Drag body to move'
                  : 'Click a sensor to select & resize'
                : `Drag to draw ${activeTool} sensor`}
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
