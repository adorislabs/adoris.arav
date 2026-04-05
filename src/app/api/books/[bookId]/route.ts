import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * PATCH /api/books/[bookId]
 * Update book metadata (title, subject, author).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;
    const { title, subject, author } = await req.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify ownership via RLS
    const { data: book } = await supabase
      .from('books')
      .select('id')
      .eq('id', bookId)
      .single();
    if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: Record<string, string> = {};
    if (title) updates.title = title;
    if (subject) updates.subject = subject;
    if (typeof author === 'string') updates.author = author;

    const { error } = await supabase
      .from('books')
      .update(updates)
      .eq('id', bookId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Book update error:', err);
    return NextResponse.json({ error: 'Failed to update book' }, { status: 500 });
  }
}

/**
 * DELETE /api/books/[bookId]
 * Delete a book and all its chapters (cascade).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  try {
    const { bookId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify ownership via RLS
    const { data: book } = await supabase
      .from('books')
      .select('id')
      .eq('id', bookId)
      .single();
    if (!book) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', bookId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Book delete error:', err);
    return NextResponse.json({ error: 'Failed to delete book' }, { status: 500 });
  }
}
