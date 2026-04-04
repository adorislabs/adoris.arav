const fs = require('fs');

const code = `
'use client';

import { useState, useEffect } from 'react';

interface PdfViewerProps {
  chapterId: string | null;
  currentPage: number;
}

export function PdfViewer({ chapterId, currentPage }: PdfViewerProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [chapterId, currentPage]);

  if (!chapterId) {
    return (
      <div className="h-full w-full flex flex-col p-4 bg-base font-mono relative overflow-hidden">
        {/* Decorative Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-5 z-0" 
          style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        </div>
        
        <div className="glass-panel tech-border h-full flex items-center justify-center p-8 relative z-10 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
          <div className="text-center space-y-6 flex flex-col items-center">
            <div className="relative">
              <div className="absolute inset-0 bg-accent animate-ping opacity-20 blur-xl"></div>
              <div className="w-16 h-16 border border-dim flex items-center justify-center relative bg-surface tech-border">
                <svg className="w-8 h-8 text-dim" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-primary border-b border-dim pb-2 mb-2 inline-block">
                No Document Selected
              </h3>
              <p className="mt-2 text-xs uppercase tracking-widest text-text-muted">
                Please select a target lesson from the dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pdfUrl = \`/api/pdfs/file/\${chapterId}#page=\${currentPage + 1}&toolbar=0&navpanes=0\`;

  return (
    <div className="h-full w-full flex flex-col p-4 bg-base font-mono relative overflow-hidden">
      {/* Decorative Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-10 z-0" 
        style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="absolute top-8 left-8 z-20 px-3 py-1 tech-border uppercase tracking-widest text-[10px] font-bold glass-panel text-accent flex items-center gap-2 shadow-[0_0_15px_var(--accent-muted)]">
        <div className="w-1 h-1 bg-accent animate-pulse"></div>
        ACTIVE PAGE: {currentPage + 1}
      </div>

      <div className="flex-1 glass-panel tech-border overflow-hidden relative z-10 p-1 bg-black/40">
        <div className="absolute top-0 right-0 w-16 h-16 border-t-2 border-r-2 border-accent opacity-30 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-16 h-16 border-b-2 border-l-2 border-accent opacity-30 pointer-events-none"></div>
        
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface/90 backdrop-blur-sm">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 border border-dim rotate-45 animate-spin blur-[2px]"></div>
              <div className="absolute inset-2 border border-accent animate-spin rotate-12 transition-all duration-1000" style={{ animationDirection: 'reverse', animationDuration: '3s' }}></div>
              <div className="w-2 h-2 bg-accent animate-pulse"></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent">Loading Data</span>
              <div className="flex gap-[2px]">
                <div className="w-1 h-3 bg-accent animate-pulse" style={{ animationDelay: '0ms' }}></div>
                <div className="w-1 h-3 bg-accent animate-pulse" style={{ animationDelay: '150ms' }}></div>
                <div className="w-1 h-3 bg-accent animate-pulse" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-full relative z-0 transition-opacity duration-500 rounded-none mix-blend-screen opacity-90"
          onLoad={() => setLoading(false)}
        >
          <div className="p-8 text-center flex flex-col items-center justify-center h-full gap-4">
            <div className="text-dim text-xs uppercase tracking-widest">Display Error: PDF not supported</div>
            <a href={pdfUrl} className="text-accent border border-accent px-4 py-2 text-[10px] uppercase tracking-widest hover:bg-accent hover:text-black transition-colors">
              [ Execute Direct Download ]
            </a>
          </div>
        </object>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/components/ui/PdfViewer.tsx', code);
console.log('PdfViewer successfully updated');
