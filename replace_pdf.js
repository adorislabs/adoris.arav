const fs = require('fs');
fs.writeFileSync('src/components/ui/PdfViewer.tsx', `
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
      <div className="h-full w-full flex flex-col p-4 bg-base font-sans relative overflow-hidden rounded-l-2xl">
        <div className="h-full flex items-center justify-center p-8 relative z-10">
          <div className="text-center space-y-6 flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-elevated flex items-center justify-center border border-dim text-dim shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-serif text-primary pb-1">
                Reader Unassigned
              </h3>
              <p className="mt-1 text-sm text-dim max-w-xs leading-relaxed">
                Connect a study material from your library to begin.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pdfUrl = \`/api/pdfs/file/\${chapterId}#page=\${currentPage + 1}&toolbar=0&navpanes=0\`;

  return (
    <div className="h-full w-full flex flex-col pt-16 md:pt-4 px-4 pb-4 bg-surface font-sans relative overflow-hidden rounded-l-2xl">
      
      {/* Floating elegant page pill */}
      <div className="absolute top-6 left-6 z-20 px-4 py-1.5 rounded-full bg-elevated/80 backdrop-blur-md border border-dim text-xs font-medium text-secondary shadow-sm flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
        Page {currentPage + 1}
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden relative z-10 border border-dim shadow-sm bg-black/20">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface/90 backdrop-blur-sm">
            <div className="w-10 h-10 border-2 border-dim rounded-full flex items-center justify-center">
              <div className="w-6 h-6 border-t-2 border-accent rounded-full animate-spin"></div>
            </div>
            <span className="text-xs text-dim uppercase tracking-widest font-medium">Preparing Content</span>
          </div>
        )}
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-full relative z-0 transition-opacity duration-700 bg-transparent rounded-2xl opacity-95"
          onLoad={() => setLoading(false)}
        >
          <div className="p-8 text-center flex flex-col items-center justify-center h-full gap-4">
            <div className="text-dim text-sm">Download necessary for PDF viewing</div>
            <a href={pdfUrl} className="text-primary bg-elevated border border-dim px-4 py-2 text-sm rounded-full shadow-sm hover:bg-accent hover:text-base transition-colors">
              Download Material
            </a>
          </div>
        </object>
      </div>
    </div>
  );
}
`);
console.log('Saved PdfViewer interface');
