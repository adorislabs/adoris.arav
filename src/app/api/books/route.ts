import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/books
 * Returns all books with their chapters for the logged-in user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: books, error } = await supabase
      .from('books')
      .select(`
        id,
        title,
        subject,
        author,
        description,
        cover_storage_path,
        created_at,
        chapters (
          id,
          chapter_number,
          chapter_title,
          storage_path,
          page_count,
          is_processed,
          created_at
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Sort chapters within each book
    const booksWithSortedChapters = (books || []).map(book => ({
      ...book,
      chapters: (book.chapters || []).sort(
        (a: any, b: any) => a.chapter_number - b.chapter_number
      ),
    }));

    return NextResponse.json({ success: true, books: booksWithSortedChapters });
  } catch (err) {
    console.error('Books API Error:', err);
    return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 });
  }
}

/**
 * POST /api/books
 * Create a new book entry.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, subject, author, description } = await req.json();

    if (!title || !subject) {
      return NextResponse.json({ error: 'title and subject required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('books')
      .insert({ user_id: user.id, title, subject, author: author || '', description: description || '' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, book: data });
  } catch (err) {
    console.error('Create Book Error:', err);
    return NextResponse.json({ error: 'Failed to create book' }, { status: 500 });
  }
}
