import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { gradeWrittenAnswers, autoGradeMCQ } from '@/lib/llm/examGenerator';
import type { WrittenGrade } from '@/lib/llm/examGenerator';

/**
 * POST /api/exams/submit
 * Saves an exam attempt with student name, scores, and answers
 */
export async function POST(req: Request) {
  try {
    const { chapterId, studentName, examData, answers, totalMarks, sectionScores, timeTaken, questionTimings, tabSwitches, integrityFlags } = await req.json();

    if (!chapterId || !examData) {
      return NextResponse.json({ error: 'chapterId and examData required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Grade written (non-MCQ) answers via LLM — wrapped in try/catch so a
    // grading failure never blocks the result from being saved.
    let writtenGrades: WrittenGrade[] = [];
    let writtenScore = 0;
    try {
      writtenGrades = await gradeWrittenAnswers(examData, answers || {});
      writtenScore = writtenGrades.reduce((sum, g) => sum + g.marks_awarded, 0);
    } catch (err) {
      console.error('[submit] LLM grading failed (saving MCQ score only):', err);
    }

    // Server-side MCQ auto-grading — authoritative, does not trust client score
    const mcqScore = autoGradeMCQ(examData, answers || {});
    const totalScore = mcqScore + writtenScore;

    // Get the next attempt number
    const { count } = await supabase
      .from('exam_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('chapter_id', chapterId);

    const attemptNumber = (count || 0) + 1;

    // Pass at 40% of total available marks (now includes LLM-graded written score)
    const passThreshold = Math.ceil((totalMarks || 60) * 0.4);

    const { data, error } = await supabase
      .from('exam_results')
      .insert({
        user_id: user.id,
        chapter_id: chapterId,
        student_name: studentName || '',
        exam_data: examData,
        answers: answers || {},
        score: totalScore,
        total_marks: totalMarks || 60,
        passed: totalScore >= passThreshold, // 40% pass threshold
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

    return NextResponse.json({
      success: true,
      resultId: data.id,
      attemptNumber: data.attempt_number,
      writtenGrades,
      mcqScore,
      writtenScore,
      totalScore,
    });
  } catch (error) {
    console.error('Exam submit API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/exams/submit?chapterId=xxx  — list all attempts
 * GET /api/exams/submit?id=xxx         — fetch a single attempt for review
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const attemptId = searchParams.get('id');
    const chapterId = searchParams.get('chapterId');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Single attempt detail — for review mode
    if (attemptId) {
      const { data, error } = await supabase
        .from('exam_results')
        .select('id, student_name, exam_data, answers, score, total_marks, passed, attempt_number, section_scores, time_taken_seconds, question_timings, tab_switches, completed_at')
        .eq('id', attemptId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, attempt: data });
    }

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId or id required' }, { status: 400 });
    }

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
