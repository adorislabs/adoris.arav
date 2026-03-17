import { getPdfBufferFromChapterId, getPdfPageAsBase64FromBuffer } from './src/lib/pdf/supabase';
import { ocrPdfPage } from './src/lib/llm/ocr';

async function test() {
  try {
    const chapterId = 'e60da177-489d-4300-adde-7916ae7c202b';
    console.log('Downloading buffer...');
    const buffer = await getPdfBufferFromChapterId(chapterId);
    console.log('Got buffer. Extracting page 0...');
    const base64Pdf = await getPdfPageAsBase64FromBuffer(buffer, 0);
    console.log('Got base64. Length:', base64Pdf.length);
    console.log('Calling Gemini OCR...');
    const ocrContext = await ocrPdfPage(base64Pdf, undefined);
    console.log('Success!', Object.keys(ocrContext));
  } catch (err) {
    console.error('OCR test failed!', err);
  }
}

test();
