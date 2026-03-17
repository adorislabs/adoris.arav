import { NextResponse } from 'next/server';
import { generateExam } from '@/lib/llm/examGenerator';

export async function POST(req: Request) {
  try {
    const { fileName, chapterPlan, lessonPlans } = await req.json();

    if (!fileName) {
      return NextResponse.json(
        { error: 'fileName required' },
        { status: 400 }
      );
    }

    const exam = await generateExam(chapterPlan, lessonPlans || {}, fileName);

    return NextResponse.json({ success: true, exam });
  } catch (error) {
    console.error('Exam Generation Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate exam' },
      { status: 500 }
    );
  }
}
