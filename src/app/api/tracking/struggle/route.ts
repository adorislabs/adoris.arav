import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/tracking/struggle
 * Records a struggle event for analytics
 */
export async function POST(req: Request) {
  try {
    const { chapterId, topic, concept, struggleType, severity, context } = await req.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await supabase.from('struggle_tracking').insert({
      user_id: user.id,
      chapter_id: chapterId || null,
      topic: topic || 'unknown',
      concept: concept || null,
      struggle_type: struggleType || 'wrong_answer',
      severity: Math.min(5, Math.max(1, severity || 1)),
      context: context || {},
    });

    if (error) {
      console.error('Struggle tracking insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Struggle tracking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/tracking/struggle
 * Returns all struggle data for the current user
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('struggle_tracking')
      .select(`
        id, topic, concept, struggle_type, severity, context, resolved, created_at,
        chapters(chapter_title, books(title, subject))
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Struggle fetch error:', error);
      return NextResponse.json({ success: true, struggles: [] });
    }

    // Aggregate by topic
    const topicMap: Record<string, {
      topic: string;
      totalEvents: number;
      unresolvedCount: number;
      avgSeverity: number;
      concepts: string[];
      chapters: string[];
      lastSeen: string;
    }> = {};

    for (const s of (data || [])) {
      if (!topicMap[s.topic]) {
        topicMap[s.topic] = {
          topic: s.topic,
          totalEvents: 0,
          unresolvedCount: 0,
          avgSeverity: 0,
          concepts: [],
          chapters: [],
          lastSeen: s.created_at,
        };
      }
      const t = topicMap[s.topic];
      t.totalEvents++;
      if (!s.resolved) t.unresolvedCount++;
      t.avgSeverity = (t.avgSeverity * (t.totalEvents - 1) + s.severity) / t.totalEvents;
      if (s.concept && !t.concepts.includes(s.concept)) t.concepts.push(s.concept);
      const chTitle = (s.chapters as any)?.chapter_title;
      if (chTitle && !t.chapters.includes(chTitle)) t.chapters.push(chTitle);
    }

    const aggregated = Object.values(topicMap).sort((a, b) => b.unresolvedCount - a.unresolvedCount);

    return NextResponse.json({ success: true, struggles: data || [], aggregated });
  } catch (error) {
    console.error('Struggle GET error:', error);
    return NextResponse.json({ success: true, struggles: [], aggregated: [] });
  }
}
