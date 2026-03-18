import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { session } = await req.json();

    if (!session || !session.id) {
      return NextResponse.json({ error: 'Session object with ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Upsert session state into chapter_sessions
    const { error } = await supabase
      .from('chapter_sessions')
      .upsert({
        user_id: user.id,
        chapter_id: session.id, // Assuming session.id is the chapter UUID
        current_page: session.currentPage,
        mastery_status: session.masteryStatus,
        lesson_plans: session.lessonPlans,
        chat_histories: session.chatHistories,
        observer_states: session.observerStates,
        quiz_completed: session.quizCompleted,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'user_id,chapter_id'
      });

    if (error) {
      console.error('Supabase session sync error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Session sync API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('chapter_sessions')
      .select('*')
      .eq('chapter_id', chapterId)
      .order('last_updated', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Supabase session fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: true, session: null });
    }

    // Map DB record back to SessionState format
    const session = {
      id: data.chapter_id,
      currentPage: data.current_page,
      masteryStatus: data.mastery_status,
      lessonPlans: data.lesson_plans,
      chatHistories: data.chat_histories,
      observerStates: data.observer_states,
      quizCompleted: data.quiz_completed,
      lastUpdated: data.last_updated,
    };

    return NextResponse.json({ success: true, session });
  } catch (error) {
    console.error('Session fetch API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
