import { NextResponse } from 'next/server';
import { getPdfBufferFromChapterId, getPdfPageCountFromBuffer } from '@/lib/pdf/supabase';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterId = searchParams.get('chapterId');

    if (!chapterId) {
      return NextResponse.json({ error: 'chapterId required' }, { status: 400 });
    }

    // Auth check — prevent unauthenticated enumeration
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify chapter ownership via RLS-enforced auth client
    const { data: ownedChapter } = await authClient
      .from('chapters')
      .select('id')
      .eq('id', chapterId)
      .single();
    if (!ownedChapter) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const supabase = createServiceClient();

    // Fast path: page_count already stored in DB
    const { data: chapter } = await supabase
      .from('chapters')
      .select('page_count')
      .eq('id', chapterId)
      .single();

    if (chapter?.page_count && chapter.page_count > 0) {
      return NextResponse.json({ success: true, totalPages: chapter.page_count });
    }

    // Slow path: download PDF, count pages, then cache result
    const buffer = await getPdfBufferFromChapterId(chapterId);
    const totalPages = await getPdfPageCountFromBuffer(buffer);

    // Save for future requests (fire-and-forget)
    supabase
      .from('chapters')
      .update({ page_count: totalPages })
      .eq('id', chapterId)
      .then(({ error }) => {
        if (error) console.warn('[pages] Failed to cache page_count:', error.message);
      });

    return NextResponse.json({ success: true, totalPages });
  } catch (error) {
    console.error('Error fetching page count:', error);
    return NextResponse.json({ error: 'Failed to load page count' }, { status: 500 });
  }
}
