import React, { useState, useRef } from 'react';

export function VerticalFader({ 
  value, 
  onChange, 
  active, 
  color = '#18e4f5', 
  onReset 
}: { 
  value: number;
  onChange: (v: number) => void;
  active: boolean;
  color?: string;
  onReset?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateValue = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const next = 1 - (e.clientY - rect.top) / rect.height;
    onChange(Math.max(0, Math.min(1, next)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateValue(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) updateValue(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className="seq-fader-container" 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => { e.stopPropagation(); onReset?.(); }}
    >
      <div className="seq-fader-track" />
      <div 
        className="seq-fader-fill" 
        style={{ height: `${value * 100}%`, backgroundColor: color }}
      />
      {active && <div className="seq-fader-glow" />}
    </div>
  );
}
