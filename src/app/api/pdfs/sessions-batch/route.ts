import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/pdfs/sessions-batch
 * 
 * Returns session summaries for ALL chapters in one query.
 * Eliminates the N+1 problem on the dashboard.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: sessions, error } = await supabase
      .from('chapter_sessions')
      .select('chapter_id, current_page, mastery_status, quiz_completed, last_updated, total_pages')
      .eq('user_id', user.id);

    if (error) {
      console.error('Batch session fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform into a map keyed by chapter_id
    const sessionMap: Record<string, {
      currentPage: number;
      totalPages: number;
      masteredCount: number;
      quizCompleted: boolean;
      lastUpdated: string;
    }> = {};

    for (const s of (sessions || [])) {
      const masteryStatus = s.mastery_status || {};
      const masteredCount = Object.values(masteryStatus).filter((v) => v === 'mastered').length;
      
      sessionMap[s.chapter_id] = {
        currentPage: s.current_page || 0,
        totalPages: s.total_pages || 0,
        masteredCount,
        quizCompleted: s.quiz_completed || false,
        lastUpdated: s.last_updated || '',
      };
    }

    return NextResponse.json({ success: true, sessions: sessionMap });
  } catch (error) {
    console.error('Batch session API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
