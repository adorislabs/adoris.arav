import { NextResponse } from 'next/server';
import { generateExam } from '@/lib/llm/examGenerator';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { fileName, chapterPlan: clientChapterPlan, lessonPlans, chapterId } = await req.json();

    if (!fileName && !chapterId) {
      return NextResponse.json({ error: 'chapterId or fileName required' }, { status: 400 });
    }

    // Auth check — prevent unauthenticated LLM cost abuse
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createServiceClient();

    // ── Fast path: exam already generated and cached ──
    if (chapterId) {
      const { data: chapter } = await supabase
        .from('chapters')
        .select('generated_exam, chapter_plan')
        .eq('id', chapterId)
        .single();

      if (chapter?.generated_exam) {
        return NextResponse.json({ success: true, exam: chapter.generated_exam, cached: true });
      }

      // Use DB chapter plan if the client didn't send one
      const chapterPlan = clientChapterPlan || chapter?.chapter_plan || null;

      const exam = await generateExam(chapterPlan, lessonPlans || {}, fileName || 'Unknown Chapter');

      // Cache for future visits (fire-and-forget)
      supabase
        .from('chapters')
        .update({ generated_exam: exam })
        .eq('id', chapterId)
        .then(({ error }) => {
          if (error) console.warn('[exam] Failed to cache generated exam:', error.message);
        });

      return NextResponse.json({ success: true, exam });
    }

    // Fallback: no chapterId, generate without caching
    const exam = await generateExam(clientChapterPlan, lessonPlans || {}, fileName);
    return NextResponse.json({ success: true, exam });
  } catch (error) {
    console.error('Exam Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate exam' }, { status: 500 });
  }
}
