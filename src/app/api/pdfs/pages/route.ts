import { NextResponse } from 'next/server';
import { getPdfBufferFromChapterId, getPdfPageCountFromBuffer } from '@/lib/pdf/supabase';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
    }

    const buffer = await getPdfBufferFromChapterId(chapterId);
    const totalPages = await getPdfPageCountFromBuffer(buffer);

    return NextResponse.json({ success: true, totalPages });
  } catch (error) {
    console.error('Error fetching page count:', error);
    return NextResponse.json({ error: 'Failed to load page count' }, { status: 500 });
  }
}
