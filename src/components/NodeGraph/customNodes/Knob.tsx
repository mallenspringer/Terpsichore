import React, { useState, useRef } from 'react';

export function Knob({ 
  value, 
  onChange, 
  min = 0, 
  max = 1, 
  resetValue = 0,
  size = 20, 
  color = '#18e4f5' 
}: { 
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  resetValue?: number;
  size?: number;
  color?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const lastY = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    lastY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dy = lastY.current - e.clientY;
    lastY.current = e.clientY;
    const next = Math.max(min, Math.min(max, value + dy * (max - min) * 0.01));
    if (next !== value) onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(resetValue); 
  };

  const normalized = (value - min) / (max - min || 1);
  const rotation = (normalized * 270) - 135; // -135 to 135 deg

  return (
    <div 
      className="knob-wrap"
      style={{ width: size, height: size }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <svg width={size} height={size} viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
        <g transform={`rotate(${rotation}, 10, 10)`}>
          <line x1="10" y1="10" x2="10" y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
