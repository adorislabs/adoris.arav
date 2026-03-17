'use client';

interface PdfViewerProps {
  chapterId: string | null;
  currentPage: number;
}

export function PdfViewer({ chapterId, currentPage }: PdfViewerProps) {
  if (!chapterId) {
    return (
      <div className="h-full w-full flex flex-col p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div>
              <h3 className="text-lg font-medium text-slate-900">No Document Selected</h3>
              <p className="mt-1 text-sm text-slate-500">
                Please select a lesson PDF from the dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // We use object/embed to render the PDF directly in the browser.
  // Using #page=${currentPage+1} because pdf-lib is 0-indexed but viewer URLs are 1-indexed
  const pdfUrl = `/api/pdfs/file/${chapterId}#page=${currentPage + 1}&toolbar=0&navpanes=0`;

  return (
    <div className="h-full w-full bg-slate-100 flex flex-col p-4 relative">
      <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm text-xs font-semibold text-slate-700 border border-slate-200">
        Active Page: {currentPage + 1}
      </div>
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <object
          data={pdfUrl}
          type="application/pdf"
          className="w-full h-full"
        >
          <p className="p-4 text-center">
            Your browser does not support PDFs. <a href={pdfUrl}>Download the PDF</a>.
          </p>
        </object>
      </div>
    </div>
  );
}
