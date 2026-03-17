import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function test(chapterId: string) {
  console.log(`Testing chapter_id: ${chapterId}`);

  // 1. Get the storage_path for this chapter
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();

  if (chapterError) {
    console.error('Failed to find chapter in DB:', chapterError);
    return;
  }
  console.log('Found chapter:', chapter);

  // 2. Download the PDF from Supabase Storage
  console.log(`Downloading ${chapter.storage_path}...`);
  const { data: fileData, error: downloadError } = await supabase
    .storage
    .from('pdfs')
    .download(chapter.storage_path);

  if (downloadError) {
    console.error('Failed to download PDF:', downloadError);
    return;
  }
  console.log('Downloaded file bytes:', fileData.size);
}

test('e60da177-489d-4300-adde-7916ae7c202b');
