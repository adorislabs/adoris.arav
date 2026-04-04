const fs = require('fs');

// globals.css
fs.writeFileSync('src/app/globals.css', `
@import "tailwindcss";

:root {
  /* Soft, dark library mode (Zen) */
  --bg-base:     #0C0E0B;   /* Deep greenish-black forest */
  --bg-surface:  #151813;   /* Slightly lighter green/gray for cards */
  --bg-elevated: #1E221C;   /* Action cards, menus */
  --bg-muted:    #2A2E28;   /* Subtle fills, input backgrounds */

  /* Borders */
  --border:      #2A2E28;
  --border-soft: #1E221C;

  /* Text - Warm off-whites */
  --text-primary:   #EBE9DF;
  --text-secondary: #9B9E96;
  --text-muted:     #6D716A;

  /* Accent - Calming Sage Green */
  --accent:         #9DBC9A;
  --accent-muted:   rgba(157, 188, 154, 0.15);
  --accent-hover:   #B3D3B0;

  /* Status */
  --success:  #9DBC9A;
  --error:    #D17267;
  --warning:  #CCA26B;

  --font-sans: var(--font-inter), -apple-system, sans-serif;
  --font-serif: var(--font-lora), 'Georgia', serif;
}

*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: dark; }

body {
  margin: 0;
  padding: 0;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: -0.01em;
}

::-webkit-scrollbar         { width: 6px; height: 6px; }
::-webkit-scrollbar-track   { background: transparent; }
::-webkit-scrollbar-thumb   { background: var(--border); border-radius: 6px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
.no-scrollbar::-webkit-scrollbar { display: none; }

.katex { color: var(--text-primary) !important; font-family: var(--font-serif) !important; }

:focus-visible { outline: 2px solid var(--accent-muted); outline-offset: 2px; }
::selection { background: var(--accent-muted); color: var(--text-primary); }

@layer utilities {
  .bg-base          { background: var(--bg-base); }
  .bg-accent        { background: var(--accent); }
  .text-accent      { color: var(--accent); }
  .text-primary     { color: var(--text-primary); }
  .border-accent    { border-color: var(--accent); }
  .bg-surface       { background: var(--bg-surface); }
  .bg-elevated      { background: var(--bg-elevated); }
  .bg-muted-fill    { background: var(--bg-muted); }
  .text-dim         { color: var(--text-secondary); }
  .border-dim       { border-color: var(--border); }
  .font-sans        { font-family: var(--font-sans); }
  .font-serif       { font-family: var(--font-serif); }
}

@keyframes fadeIn    { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp   { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

.animate-fadeIn  { animation: fadeIn 0.5s ease-out both; }
.animate-slideUp { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }

/* ── Serene Prose (chat messages) ───────────────────────── */
.adoris-prose {
  color: var(--text-primary);
  max-width: none;
  font-size: 1.05rem;
  line-height: 1.7;
  font-family: var(--font-serif); 
}
.adoris-prose p { margin-top: 1.2em; margin-bottom: 1.2em; }
.adoris-prose h1, .adoris-prose h2, .adoris-prose h3,
.adoris-prose h4, .adoris-prose h5, .adoris-prose h6 {
  color: var(--text-primary);
  font-family: var(--font-serif);
  font-weight: 500;
  margin-top: 1.8em;
  margin-bottom: 0.8em;
  line-height: 1.3;
}
.adoris-prose h1 { font-size: 1.4rem; }
.adoris-prose h2 { font-size: 1.25rem; }
.adoris-prose h3 { font-size: 1.15rem; color: var(--text-secondary); font-style: italic; }

.adoris-prose ul, .adoris-prose ol { padding-left: 1.4em; margin-bottom: 1.4em; }
.adoris-prose li { margin-bottom: 0.5em; padding-left: 0.2em; }
.adoris-prose li::marker { color: var(--accent); }
.adoris-prose strong { color: var(--text-primary); font-weight: 700; }
.adoris-prose code {
  background: var(--bg-muted);
  color: var(--accent);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-family: var(--font-sans);
  font-size: 0.85em;
}
.adoris-prose pre {
  background: var(--bg-base);
  color: var(--text-primary);
  padding: 1.25em;
  border-radius: 8px;
  overflow-x: auto;
  border: 1px solid var(--border);
  margin: 1.5em 0;
  font-family: var(--font-sans);
  font-size: 0.9em;
}
.adoris-prose pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: 1em;
}
.adoris-prose blockquote {
  border-left: 3px solid var(--accent-muted);
  padding-left: 1.5rem;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 0.95rem;
  margin: 1.5em 0;
  padding-top: 0.25em;
  padding-bottom: 0.25em;
}
`);

// layout.tsx
fs.writeFileSync('src/app/layout.tsx', `
import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";

const interFont = Inter({ 
  subsets: ["latin"], 
  variable: "--font-inter",
  display: "swap",
});

const loraFont = Lora({ 
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"], 
  variable: "--font-lora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Adoris Tutor",
  description: "A refined active reading environment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={\`\${interFont.variable} \${loraFont.variable} bg-base text-primary font-sans\`}>
        {children}
      </body>
    </html>
  );
}
`);

// SplitPane.tsx  -- softening the draggable pane
fs.writeFileSync('src/components/ui/SplitPane.tsx', `
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
          style={{ width: \`\${leftPct}%\` }}
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
            className={\`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-300 \${
              activePane === 'left' ? 'bg-elevated text-primary shadow-sm' : 'text-dim hover:text-primary'
            }\`}
          >
            Study Material
          </button>
          <button
            role="tab"
            onClick={() => setActivePane('right')}
            className={\`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-300 \${
              activePane === 'right' ? 'bg-elevated text-primary shadow-sm' : 'text-dim hover:text-primary'
            }\`}
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
`);

console.log("Rewrote basics: globals.css, layout.tsx, splitpane.tsx");
