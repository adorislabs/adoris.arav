import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookId: string }> }
) {
  const { bookId } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chapter_number, chapter_title, storage_path, page_count } = body;

  if (!chapter_number || !chapter_title || !storage_path) {
    return NextResponse.json(
      { error: 'chapter_number, chapter_title, storage_path required' },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: book } = await supabase
      .from('books')
      .select('id')
      .eq('id', bookId)
      .single();

    if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

    const { data: chapter, error } = await supabase
      .from('chapters')
      .insert({
        book_id: bookId,
        chapter_number,
        chapter_title,
        storage_path,
        page_count: page_count || 0,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Chapter ${chapter_number} already exists for this book` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, chapter });
  } catch (err) {
    console.error('Create Chapter Error:', err);
    return NextResponse.json({ error: 'Failed to create chapter' }, { status: 500 });
  }
}
