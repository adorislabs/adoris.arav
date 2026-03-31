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

  // ─── Drag logic ───────────────────────────────────────────────────
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

  // ─── Keyboard shortcut: [ and ] to resize, \ to reset ────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only when no input/textarea is focused
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
    <div className="flex h-full w-full">
      {/* Desktop: resizable side-by-side */}
      <div ref={containerRef} className="hidden md:flex h-full w-full">
        <div
          className="min-w-0 overflow-hidden border-r"
          style={{ width: `${leftPct}%`, background: 'var(--bg-base)', borderColor: 'var(--border)' }}
        >
          {leftPane}
        </div>

        {/* Resize handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="shrink-0 w-1.5 cursor-col-resize group relative hover:w-2 transition-all"
          style={{ background: 'var(--border)' }}
          title="Drag to resize · [ ] keys · \ to reset"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" /> {/* wider hit area */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'var(--accent)' }}
          />
        </div>

        <div
          className="min-w-0 overflow-hidden flex flex-col flex-1"
          style={{ background: 'var(--bg-base)' }}
        >
          {rightPane}
        </div>
      </div>

      {/* Mobile: tabbed panes */}
      <div className="flex md:hidden flex-col h-full w-full">
        <div className="flex shrink-0 border-b" role="tablist" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <button
            role="tab"
            onClick={() => setActivePane('right')}
            aria-label="Switch to chat pane"
            aria-selected={activePane === 'right'}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: activePane === 'right' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activePane === 'right' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            Chat
          </button>
          <button
            role="tab"
            onClick={() => setActivePane('left')}
            aria-label="Switch to PDF pane"
            aria-selected={activePane === 'left'}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: activePane === 'left' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activePane === 'left' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            PDF
          </button>
        </div>
        <div className="flex-1 overflow-hidden" role="tabpanel" style={{ background: 'var(--bg-base)' }}>
          {activePane === 'left' ? leftPane : rightPane}
        </div>
      </div>
    </div>
  );
}
