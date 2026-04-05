import { NextResponse } from 'next/server';
import { generateChapterPlan } from '@/lib/llm/chapterPlan';
import { getPdfBufferFromChapterId } from '@/lib/pdf/supabase';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { chapterId, fileName } = await req.json();

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
    }

    // Auth check — prevent unauthenticated LLM cost abuse
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify chapter ownership via RLS-enforced auth client
    const { data: ownedChapter } = await authClient
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .single();
    if (!ownedChapter) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const supabase = createServiceClient();

    // Fast path: chapter plan already cached in DB
    const { data: chapter } = await supabase
      .from('chapters')
      .select('chapter_plan, page_count')
      .eq('id', chapterId)
      .single();

    if (chapter?.chapter_plan) {
      return NextResponse.json({ success: true, chapterPlan: chapter.chapter_plan });
    }

    // Slow path: download PDF and ask LLM
    const pdfBuffer = await getPdfBufferFromChapterId(chapterId);
    const base64Pdf = pdfBuffer.toString('base64');

    const chapterPlan = await generateChapterPlan(base64Pdf, fileName || 'Unknown Book Chapter');

    // Cache plan + page_count back to DB (fire-and-forget)
    const updatePayload: Record<string, unknown> = {
      chapter_plan: chapterPlan,
      is_processed: true,
    };
    // Also cache page count while we have the buffer
    if (!chapter?.page_count || chapter.page_count === 0) {
      const { getPdfPageCountFromBuffer } = await import('@/lib/pdf/supabase');
      const totalPages = await getPdfPageCountFromBuffer(pdfBuffer);
      updatePayload.page_count = totalPages;
    }

    supabase
      .from('chapters')
      .update(updatePayload)
      .eq('id', chapterId)
      .then(({ error }) => {
        if (error) console.warn('[chapter-plan] Failed to cache:', error.message);
      });

    return NextResponse.json({ success: true, chapterPlan });
  } catch (error) {
    console.error('Chapter Plan API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate chapter plan' },
      { status: 500 }
    );
  }
}
