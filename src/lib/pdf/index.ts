import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const PDF_DIR = path.join(process.cwd(), 'src/data/pdfs');

export async function getAvailablePdfs() {
  if (!fs.existsSync(PDF_DIR)) {
    return [];
  }
  const files = fs.readdirSync(PDF_DIR);
  return files.filter(f => f.endsWith('.pdf')).map(f => ({
    fileName: f,
    id: Buffer.from(f).toString('base64'),
    path: `/api/pdfs/file/${f}`
  }));
}

export async function getPdfPageCount(fileName: string) {
  const filePath = path.join(PDF_DIR, fileName);
  if (!fs.existsSync(filePath)) throw new Error('File not found');

  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return pdfDoc.getPageCount();
}

/**
 * Extracts a page from a local file on disk. (Legacy/dev use)
 */
export async function getPdfPageAsBase64(fileName: string, pageIndex: number): Promise<string> {
  const filePath = path.join(PDF_DIR, fileName);
  const pdfBytes = fs.readFileSync(filePath);

  const sourcePdf = await PDFDocument.load(pdfBytes);
  const newPdf = await PDFDocument.create();
  const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
  newPdf.addPage(copiedPage);

  const newPdfBytes = await newPdf.save();
  return Buffer.from(newPdfBytes).toString('base64');
}

/**
 * Extracts a page from an in-memory Buffer (e.g. downloaded from Supabase Storage).
 */
export async function getPdfPageAsBase64FromBuffer(
  pdfBuffer: Buffer,
  pageIndex: number
): Promise<string> {
  const sourcePdf = await PDFDocument.load(pdfBuffer);
  const newPdf = await PDFDocument.create();
  const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
  newPdf.addPage(copiedPage);

  const newPdfBytes = await newPdf.save();
  return Buffer.from(newPdfBytes).toString('base64');
}

/**
 * Returns the page count for an in-memory PDF Buffer.
 */
export async function getPdfPageCountFromBuffer(pdfBuffer: Buffer): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  return pdfDoc.getPageCount();
}
