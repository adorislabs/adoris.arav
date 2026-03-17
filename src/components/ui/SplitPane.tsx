'use client';

import { ReactNode } from 'react';

interface SplitPaneProps {
  leftPane: ReactNode;
  rightPane: ReactNode;
}

export function SplitPane({ leftPane, rightPane }: SplitPaneProps) {
  return (
    <div className="flex h-full w-full">
      {/* Left Pane (Document Viewer) */}
      <div className="w-1/2 min-w-[300px] border-r border-slate-200 bg-white">
        {leftPane}
      </div>

      {/* Right Pane (Chat Interface) */}
      <div className="w-1/2 min-w-[300px] bg-slate-50 flex flex-col">
        {rightPane}
      </div>
    </div>
  );
}
