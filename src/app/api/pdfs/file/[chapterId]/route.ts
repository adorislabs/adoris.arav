import { NextResponse } from 'next/server';
import { getPdfBufferFromChapterId } from '@/lib/pdf/supabase';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const chapterId = (await params).chapterId;

    // Authenticate and verify chapter ownership
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    const { data: chapter, error: chapterErr } = await supabase
      .from('chapters')
      .select('id, books!inner(user_id)')
      .eq('id', chapterId)
      .single();

    if (chapterErr || !chapter || (chapter.books as any)?.user_id !== user.id) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Download PDF from Supabase (served from in-memory cache after first load)
    const fileBuffer = await getPdfBufferFromChapterId(chapterId);

    return new NextResponse(fileBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${chapterId}.pdf"`,
        // Cache in browser for 1 hour — prevents re-download on every page turn
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Error serving PDF from Supabase:', error);
    return new NextResponse('Internal Server Error or File Not Found', { status: 500 });
  }
}
