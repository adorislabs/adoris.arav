import { PDFDocument } from 'pdf-lib';
import { createClient } from '@/lib/supabase/server';

/**
 * Given a chapter UUID, fetches the `storage_path` from the database,
 * downloads the PDF from the 'pdfs' bucket, and returns it as a Buffer.
 */
export async function getPdfBufferFromChapterId(chapterId: string): Promise<Buffer> {
  const supabase = await createClient();
  
  // 1. Get the storage_path for this chapter
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('storage_path')
    .eq('id', chapterId)
    .single();

  if (chapterError || !chapter || !chapter.storage_path) {
    throw new Error('Chapter not found or has no associated PDF');
  }

  // 2. Download the PDF from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from('pdfs')
    .download(chapter.storage_path);

  if (downloadError || !fileData) {
    throw new Error('Failed to download PDF from storage');
  }

  const arrayBuffer = await fileData.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Returns total number of pages in the PDF Buffer.
 */
export async function getPdfPageCountFromBuffer(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}

/**
 * Extracts a page from an in-memory Buffer and returns standard Base64 string.
 */
export async function getPdfPageAsBase64FromBuffer(
  pdfBuffer: Buffer,
  pageIndex: number
): Promise<string> {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  // PDF-lib is 0-indexed for pages, but front-end relies on 1-indexed UI,
  // we assume pageIndex passed in is 0-indexed if using pdf-lib.
  const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
  newPdf.addPage(copiedPage);

  const newPdfBytes = await newPdf.save();
  return Buffer.from(newPdfBytes).toString('base64');
}
