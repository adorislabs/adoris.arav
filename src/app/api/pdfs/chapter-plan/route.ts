import { NextResponse } from 'next/server';
import { generateChapterPlan } from '@/lib/llm/chapterPlan';
import { getPdfBufferFromChapterId } from '@/lib/pdf/supabase';

export async function POST(req: Request) {
  try {
    const { chapterId, fileName } = await req.json();

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
    }

    // Fetch the PDF buffer from Supabase using the chapter ID
    const pdfBuffer = await getPdfBufferFromChapterId(chapterId);
    const base64Pdf = pdfBuffer.toString('base64');

    // Send to Gemini for exhaustive chapter-level planning
    const chapterPlan = await generateChapterPlan(base64Pdf, fileName || 'Unknown Book Chapter');

    return NextResponse.json({
      success: true,
      chapterPlan,
    });
  } catch (error) {
    console.error('Chapter Plan API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate chapter plan' },
      { status: 500 }
    );
  }
}
