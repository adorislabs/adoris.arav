
'use client';

import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';

interface SplitPaneProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
}

const MIN_PCT = 25;
const MAX_PCT = 75;
const DEFAULT_PCT = 50;

export function SplitPane({ leftPane, rightPane }: SplitPaneProps) {
  const [activePane, setActivePane] = useState<'left' | 'right'>('right');
  const [leftPct, setLeftPct] = useState(DEFAULT_PCT);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(MAX_PCT, Math.max(MIN_PCT, pct)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div className="flex h-full w-full bg-base font-sans">
      <div ref={containerRef} className="hidden md:flex h-full w-full">
        
        <div
          className="min-w-0 overflow-hidden bg-surface relative transition-all duration-300"
          style={{ width: `${leftPct}%` }}
        >
          {leftPane}
        </div>

        {/* Soft, invisible resize handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="shrink-0 w-4 -mx-2 cursor-col-resize group relative z-10 flex flex-col justify-center items-center"
          title="Drag to resize"
        >
          {/* Subtle line in the center */}
          <div className="absolute inset-y-0 left-1/2 w-[1px] bg-dim opacity-40 group-hover:bg-accent group-hover:opacity-100 transition-all duration-300 transform -translate-x-1/2 rounded-full"></div>
        </div>

        <div
          className="min-w-0 overflow-hidden flex flex-col flex-1 relative bg-surface border-l border-dim"
        >
          {rightPane}
        </div>
      </div>

      {/* Mobile: soft tabbed panes */}
      <div className="flex md:hidden flex-col h-full w-full bg-base">
        <div className="mx-4 mt-4 flex shrink-0 p-1 rounded-xl bg-surface border border-dim" role="tablist">
          <button
            role="tab"
            onClick={() => setActivePane('left')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-300 ${
              activePane === 'left' ? 'bg-elevated text-primary shadow-sm' : 'text-dim hover:text-primary'
            }`}
          >
            Study Material
          </button>
          <button
            role="tab"
            onClick={() => setActivePane('right')}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-300 ${
              activePane === 'right' ? 'bg-elevated text-primary shadow-sm' : 'text-dim hover:text-primary'
            }`}
          >
            Tutor Chat
          </button>
        </div>
        <div className="flex-1 overflow-hidden" role="tabpanel">
          {activePane === 'left' ? leftPane : rightPane}
        </div>
      </div>
    </div>
  );
}
