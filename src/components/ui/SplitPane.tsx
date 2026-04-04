'use client';

import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';

interface SplitPaneProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
}

const MIN_PCT = 20;
const MAX_PCT = 80;
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

      if (e.key === '[') { setLeftPct(p => Math.max(MIN_PCT, p - 5)); }
      else if (e.key === ']') { setLeftPct(p => Math.min(MAX_PCT, p + 5)); }
      else if (e.key === '\\') { setLeftPct(DEFAULT_PCT); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="flex h-full w-full bg-base font-mono">
      {/* Desktop: resizable side-by-side */}
      <div ref={containerRef} className="hidden md:flex h-full w-full">
        <div
          className="min-w-0 overflow-hidden border-r border-dim relative glass-panel tech-border"
          style={{ width: `${leftPct}%` }}
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-accent opacity-20"></div>
          {leftPane}
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="shrink-0 w-2 cursor-col-resize group relative hover:w-3 transition-all z-10 flex flex-col justify-center items-center"
          style={{ background: 'var(--bg-base)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}
          title="Drag to resize · [ ] keys · \ to reset"
        >
          {/* Grip lines */}
          <div className="flex gap-[2px] h-8 items-center px-[2px] opacity-30 group-hover:opacity-100 transition-opacity">
            <div className="w-[1px] h-full bg-accent"></div>
            <div className="w-[1px] h-full bg-accent"></div>
          </div>
          <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent" />
        </div>

        <div
          className="min-w-0 overflow-hidden flex flex-col flex-1 relative glass-panel tech-border"
          style={{ background: 'var(--bg-surface)' }}
        >
          <div className="absolute top-0 right-0 w-full h-1 bg-accent opacity-20"></div>
          {rightPane}
        </div>
      </div>

      {/* Mobile: tabbed panes */}
      <div className="flex md:hidden flex-col h-full w-full border-dim bg-base brutal-border">
        <div className="flex shrink-0 border-b border-dim bg-surface" role="tablist">
          <button
            role="tab"
            onClick={() => setActivePane('right')}
            className={`flex-1 py-3 text-xs uppercase tracking-widest transition-all ${
              activePane === 'right' ? 'text-accent border-b-2 border-accent bg-elevated' : 'text-dim hover:text-primary'
            }`}
          >
            [ AI Tutor ]
          </button>
          <button
            role="tab"
            onClick={() => setActivePane('left')}
            className={`flex-1 py-3 text-xs uppercase tracking-widest transition-all border-l border-dim ${
              activePane === 'left' ? 'text-accent border-b-2 border-accent bg-elevated' : 'text-dim hover:text-primary'
            }`}
          >
            [ Document ]
          </button>
        </div>
        <div className="flex-1 overflow-hidden" role="tabpanel">
          {activePane === 'left' ? leftPane : rightPane}
        </div>
      </div>
    </div>
  );
}
