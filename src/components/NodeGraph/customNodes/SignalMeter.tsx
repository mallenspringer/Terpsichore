import React, { useRef, useState } from 'react';
import { useEngineStore } from '../../../state/store';

export function SignalMeter({ 
  layerId, 
  nodeId, 
  portId, 
  bipolar, 
  color, 
  threshold, 
  onThresholdChange 
}: { 
  layerId: string;
  nodeId: string;
  portId: string;
  bipolar: boolean;
  color: string;
  threshold?: number;
  onThresholdChange?: (v: number) => void;
}) {
  const settingsKey = `${nodeId}.${portId}`;
  const val = useEngineStore(s => s.layers[layerId]?.signalValues?.[settingsKey] ?? 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromPointer = (e: React.PointerEvent) => {
    if (!containerRef.current || !onThresholdChange) return;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    let newT = bipolar ? (nx - 0.5) * 2 : nx;
    newT = Math.max(0, Math.min(1, newT));
    onThresholdChange(newT);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!onThresholdChange) return;
    e.stopPropagation();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !onThresholdChange) return;
    updateFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className="patchbay-meter-container" 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: onThresholdChange ? 'ew-resize' : 'default' }}
    >
      <div className="patchbay-meter-bar">
        <div 
          className={`patchbay-meter-fill ${bipolar ? 'bipolar-fill' : ''}`}
          style={{ 
            width: `${Math.min(100, Math.abs(bipolar ? val * 50 : val * 100))}%`,
            left: bipolar ? (val < 0 ? 'auto' : '50%') : '0',
            right: bipolar && val < 0 ? '50%' : 'auto',
          }}
        />
        {threshold !== undefined && (
          <div style={{
            position: 'absolute',
            top: 0, bottom: 0,
            left: `${bipolar ? 50 + threshold * 50 : threshold * 100}%`,
            width: 3,
            marginLeft: -1,
            backgroundColor: isDragging ? '#f58c18' : 'white',
            zIndex: 10,
            boxShadow: '0 0 4px black'
          }} />
        )}
      </div>
      <div className="patchbay-meter-overlay" style={{ color, pointerEvents: 'none' }}>
        <span className="lcd-number">
          {val >= 0 ? '+' : ''}{val.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
