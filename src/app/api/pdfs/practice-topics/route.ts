import { NextResponse } from 'next/server';
import { generatePracticeTopics } from '@/lib/llm/problemSetGenerator';
import type { PagePlanEntry } from '@/lib/session/sessionStore';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/pdfs/practice-topics
 *
 * Accepts the raw page_plans from a ChapterPlan and returns a curated list
 * of PracticeTopics suitable for the Practice Problems UI.
 *
 * Body: { pagePlans: PagePlanEntry[], chapterTitle: string }
 */
export async function POST(req: Request) {
  try {
    // Auth check — prevent unauthenticated LLM cost abuse
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { pagePlans, chapterTitle } = await req.json();

    if (!Array.isArray(pagePlans) || pagePlans.length === 0) {
      return NextResponse.json({ error: 'pagePlans is required' }, { status: 400 });
    }

    const topics = await generatePracticeTopics(
      pagePlans as PagePlanEntry[],
      chapterTitle || 'Chapter'
    );

    return NextResponse.json({ success: true, practice_topics: topics });
  } catch (err) {
    console.error('[practice-topics] Error:', err);
    return NextResponse.json({ error: 'Failed to generate practice topics' }, { status: 500 });
  }
}
