'use client';

interface PdfViewerProps {
  chapterId: string | null;
  currentPage: number;
}

export function PdfViewer({ chapterId, currentPage }: PdfViewerProps) {
  if (!chapterId) {
    return (
      <div className="h-full w-full flex flex-col p-4" style={{ background: 'var(--bg-base)' }}>
        <div className="rounded-xl border h-full flex items-center justify-center p-8" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="text-center space-y-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>No Document Selected</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Please select a lesson PDF from the dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const pdfUrl = `/api/pdfs/file/${chapterId}#page=${currentPage + 1}&toolbar=0&navpanes=0`;

  return (
    <div className="h-full w-full flex flex-col p-4 relative" style={{ background: 'var(--bg-base)' }}>
      <div className="absolute top-6 left-6 z-10 px-3 py-1 rounded-full shadow-sm text-xs font-semibold border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
        Active Page: {currentPage + 1}
      </div>
      <div className="flex-1 rounded-xl border overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-full"
        >
          <p className="p-4 text-center" style={{ color: 'var(--text-secondary)' }}>
            Your browser does not support PDFs. <a href={pdfUrl} style={{ color: 'var(--accent)' }}>Download the PDF</a>.
          </p>
        </object>
      </div>
    </div>
  );
}
