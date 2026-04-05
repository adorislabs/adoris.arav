import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/chapters/[chapterId]
 * Delete a chapter. Ownership is enforced via RLS (book → user).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ chapterId: string }> }
) {
  try {
    const { chapterId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify chapter exists and user owns the parent book via RLS
    const { data: chapter } = await supabase
      .from('chapters')
      .select('id, book_id')
      .eq('id', chapterId)
      .single();
    if (!chapter) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', chapterId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Chapter delete error:', err);
    return NextResponse.json({ error: 'Failed to delete chapter' }, { status: 500 });
  }
}
