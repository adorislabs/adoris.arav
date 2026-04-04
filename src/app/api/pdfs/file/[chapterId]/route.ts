import { NextResponse } from 'next/server';
import { getPdfBufferFromChapterId } from '@/lib/pdf/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const chapterId = (await params).chapterId;
    
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
