import { NextResponse } from 'next/server';
import { getPdfBufferFromChapterId, getPdfPageAsBase64FromBuffer } from '@/lib/pdf/supabase';
import { ocrPdfPage } from '@/lib/llm/ocr';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { chapterId, pageIndex, pagePlanEntry } = await req.json();

    if (!chapterId || pageIndex === undefined) {
      return NextResponse.json({ error: 'chapterId and pageIndex required' }, { status: 400 });
    }

    // Auth check — prevent unauthenticated LLM cost abuse
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Download buffer for this chapter
    const buffer = await getPdfBufferFromChapterId(chapterId);

    // 2. Extract specific page as Base64
    const base64Pdf = await getPdfPageAsBase64FromBuffer(buffer, Number(pageIndex));

    // 3. Pass to Gemini for OCR
    const ocrContext = await ocrPdfPage(base64Pdf, pagePlanEntry || undefined);

    return NextResponse.json({
      success: true,
      pageIndex,
      context: ocrContext
    });
    
  } catch (error) {
    console.error('OCR API Error:', error);
    return NextResponse.json({ error: 'Failed to process page', details: error?.toString(), stack: (error as any)?.stack }, { status: 500 });
  }
}
