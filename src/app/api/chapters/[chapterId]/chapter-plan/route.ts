import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateChapterPlan } from '@/lib/llm/chapterPlan';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .select('id, storage_path, chapter_title, page_count, chapter_plan, is_processed, books!inner(user_id, title)')
      .eq('id', chapterId)
      .single();

    if (chapterError || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    if ((chapter.books as any)?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Return cached plan if already processed
    if (chapter.is_processed && chapter.chapter_plan) {
      return NextResponse.json({ success: true, chapterPlan: chapter.chapter_plan, cached: true });
    }

    // Download PDF from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('pdfs')
      .download(chapter.storage_path);

    if (downloadError || !fileData) throw downloadError || new Error('Failed to download PDF');

    const arrayBuffer = await fileData.arrayBuffer();
    const base64Pdf = Buffer.from(arrayBuffer).toString('base64');

    const chapterPlan = await generateChapterPlan(base64Pdf, chapter.chapter_title);

    await supabase
      .from('chapters')
      .update({
        chapter_plan: chapterPlan,
        page_count: chapterPlan.total_pages || 0,
        is_processed: true,
      })
      .eq('id', chapterId);

    return NextResponse.json({ success: true, chapterPlan, cached: false });
  } catch (err) {
    console.error('Chapter Plan Error:', err);
    return NextResponse.json({ error: 'Failed to generate chapter plan' }, { status: 500 });
  }
}
