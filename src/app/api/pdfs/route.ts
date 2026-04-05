import { NextResponse } from 'next/server';
import { getAvailablePdfs } from '@/lib/pdf';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const pdfs = await getAvailablePdfs();
    return NextResponse.json({ success: true, pdfs });
  } catch (error) {
    console.error('Error fetching PDFs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load PDFs' },
      { status: 500 }
    );
  }
}
