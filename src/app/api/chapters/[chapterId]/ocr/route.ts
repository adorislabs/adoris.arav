import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ocrPdfPage } from '@/lib/llm/ocr';
import { getPdfPageAsBase64FromBuffer } from '@/lib/pdf';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;

  try {
    const { pageIndex, pagePlanEntry } = await req.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: chapter } = await supabase
      .from('chapters')
      .select('storage_path, chapter_title, books!inner(user_id)')
      .eq('id', chapterId)
      .single();

    if (!chapter || (chapter.books as any)?.user_id !== user.id) {
      return NextResponse.json({ error: 'Chapter not found or unauthorized' }, { status: 404 });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('pdfs')
      .download(chapter.storage_path);

    if (downloadError || !fileData) throw downloadError;

    const arrayBuffer = await fileData.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const pageBase64 = await getPdfPageAsBase64FromBuffer(pdfBuffer, pageIndex);

    const lessonPlan = await ocrPdfPage(pageBase64, pagePlanEntry);

    return NextResponse.json({ success: true, context: lessonPlan });
  } catch (err) {
    console.error('OCR Error:', err);
    return NextResponse.json({ error: 'Failed to process page' }, { status: 500 });
  }
}
