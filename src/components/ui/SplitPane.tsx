'use client';

import { ReactNode, useState } from 'react';

interface SplitPaneProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
}

export function SplitPane({ leftPane, rightPane }: SplitPaneProps) {
  const [activePane, setActivePane] = useState<'left' | 'right'>('right');

  return (
    <div className="flex h-full w-full">
      {/* Desktop: side-by-side */}
      <div className="hidden md:flex h-full w-full">
        <div className="w-1/2 min-w-[300px] border-r" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
          {leftPane}
        </div>
        <div className="w-1/2 min-w-[300px] flex flex-col" style={{ background: 'var(--bg-base)' }}>
          {rightPane}
        </div>
      </div>

      {/* Mobile: tabbed panes */}
      <div className="flex md:hidden flex-col h-full w-full">
        <div className="flex shrink-0 border-b" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <button
            onClick={() => setActivePane('right')}
            aria-label="Switch to chat pane"
            aria-pressed={activePane === 'right'}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: activePane === 'right' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activePane === 'right' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            Chat
          </button>
          <button
            onClick={() => setActivePane('left')}
            aria-label="Switch to PDF pane"
            aria-pressed={activePane === 'left'}
            className="flex-1 py-2.5 text-xs font-semibold transition-colors"
            style={{
              color: activePane === 'left' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activePane === 'left' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            PDF
          </button>
        </div>
        <div className="flex-1 overflow-hidden" style={{ background: 'var(--bg-base)' }}>
          {activePane === 'left' ? leftPane : rightPane}
        </div>
      </div>
    </div>
  );
}
