import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/books/upload
 * 
 * Accepts a multipart/form-data request with the PDF file and metadata.
 * Uploads to Supabase Storage and creates/updates the chapters record.
 * 
 * Form fields:
 *   - file: PDF file
 *   - bookId: UUID of the book
 *   - chapterNumber: integer
 *   - chapterTitle: string
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const bookId = formData.get('bookId') as string;
    const chapterNumber = parseInt(formData.get('chapterNumber') as string, 10);
    const chapterTitle = formData.get('chapterTitle') as string;

    if (!file || !bookId || !chapterNumber || !chapterTitle) {
      return NextResponse.json(
        { error: 'file, bookId, chapterNumber, chapterTitle required' },
        { status: 400 }
      );
    }

    // Verify the book belongs to this user and get subject/title
    const { data: book } = await supabase
      .from('books')
      .select('title, subject')
      .eq('id', bookId)
      .eq('user_id', user.id)
      .single();

    if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

    // Build storage path: {userId}/{subject-slug}/{book-slug}/ch{nn}_{chapter-slug}.pdf
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const paddedNum = String(chapterNumber).padStart(2, '0');
    const storagePath = `${user.id}/${slug(book.subject)}/${slug(book.title)}/ch${paddedNum}_${slug(chapterTitle)}.pdf`;

    // Upload to Supabase Storage
    const fileBytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(storagePath, fileBytes, {
        contentType: 'application/pdf',
        upsert: true,  // overwrite if same chapter re-uploaded
      });

    if (uploadError) throw uploadError;

    // Upsert chapter record (handles re-upload gracefully)
    const { data: chapter, error: dbError } = await supabase
      .from('chapters')
      .upsert({
        book_id: bookId,
        chapter_number: chapterNumber,
        chapter_title: chapterTitle,
        storage_path: storagePath,
        page_count: 0,  // will be filled when session starts
      }, { onConflict: 'book_id,chapter_number' })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, chapter, storagePath });
  } catch (err) {
    console.error('Upload Error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
