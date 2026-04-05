import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  const { chapterId } = await params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: chapter, error } = await supabase
      .from('chapters')
      .select('storage_path, books!inner(user_id)')
      .eq('id', chapterId)
      .single();

    if (error || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    if ((chapter.books as any)?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('pdfs')
      .createSignedUrl(chapter.storage_path, 3600);

    if (signedUrlError || !signedUrlData) throw signedUrlError || new Error('Failed to create signed URL');

    return NextResponse.json({
      success: true,
      signedUrl: signedUrlData.signedUrl,
      expiresIn: 3600,
    });
  } catch (err) {
    console.error('PDF Signed URL Error:', err);
    return NextResponse.json({ error: 'Failed to generate PDF URL' }, { status: 500 });
  }
}
