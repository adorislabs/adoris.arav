import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/exams/submit
 * Saves an exam attempt with student name, scores, and answers
 */
export async function POST(req: Request) {
  try {
    const { chapterId, studentName, examData, answers, score, totalMarks, sectionScores, timeTaken, questionTimings, tabSwitches, integrityFlags } = await req.json();

    if (!chapterId || !examData) {
      return NextResponse.json({ error: 'chapterId and examData required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get the next attempt number
    const { count } = await supabase
      .from('exam_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('chapter_id', chapterId);

    const attemptNumber = (count || 0) + 1;

    // Compute auto-gradeable marks (only MCQ and True/False are auto-scored;
    // short-answer and long-answer require human review)
    const autoGradeableMarks = (examData?.sections || [])
      .flatMap((s: any) => s.questions || [])
      .filter((q: any) => q.type === 'mcq' || q.type === 'true_false')
      .reduce((sum: number, q: any) => sum + (q.marks || 1), 0);
    // Pass at 40% of the auto-gradeable portion (not the full 60-mark total,
    // since written answers can't be auto-graded and would make passing impossible)
    const passThreshold = autoGradeableMarks > 0
      ? Math.ceil(autoGradeableMarks * 0.4)
      : Math.ceil((totalMarks || 60) * 0.4);

    const { data, error } = await supabase
      .from('exam_results')
      .insert({
        user_id: user.id,
        chapter_id: chapterId,
        student_name: studentName || '',
        exam_data: examData,
        answers: answers || {},
        score: score || 0,
        total_marks: totalMarks || 60,
        passed: (score || 0) >= passThreshold, // 40% pass threshold
        attempt_number: attemptNumber,
        section_scores: sectionScores || [],
        time_taken_seconds: timeTaken || 0,
        question_timings: questionTimings || {},
        tab_switches: tabSwitches || 0,
        integrity_flags: integrityFlags || {},
      })
      .select('id, attempt_number')
      .single();

    if (error) {
      console.error('Exam submit error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, resultId: data.id, attemptNumber: data.attempt_number });
  } catch (error) {
    console.error('Exam submit API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/exams/submit?chapterId=xxx
 * Returns all exam attempts for a chapter
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('exam_results')
      .select('id, student_name, score, total_marks, passed, attempt_number, section_scores, time_taken_seconds, completed_at')
      .eq('user_id', user.id)
      .eq('chapter_id', chapterId)
      .order('completed_at', { ascending: false });

    if (error) {
      console.error('Exam history fetch error:', error);
      return NextResponse.json({ success: true, attempts: [] });
    }

    return NextResponse.json({ success: true, attempts: data || [] });
  } catch (error) {
    console.error('Exam history error:', error);
    return NextResponse.json({ success: true, attempts: [] });
  }
}
