import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function test() {
  const chapterId = 'e60da177-489d-4300-adde-7916ae7c202b';
  const { data, error } = await supabase.from('chapters').select('*').eq('id', chapterId);
  console.log('Test result:', data, error);
}

test().catch(console.error);
