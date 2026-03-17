import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request, { params }: { params: Promise<{ chapterId: string }> }) {
  try {
    const { chapterId } = await params;
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // The passkey gate handles auth, but if there's no anonymous or real session, 
    // we should still allow public access if that's the intention, but currently 
    // chapters are tied to users. Let's try fetching the chapter first.
    const { data: chapter, error } = await supabase
      .from('chapters')
      .select('chapter_title')
      .eq('id', chapterId)
      .single();

    if (error || !chapter) {
      return NextResponse.json({ success: false, error: 'Chapter not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, fileName: chapter.chapter_title });
  } catch (error) {
    console.error('Error fetching chapter details:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
