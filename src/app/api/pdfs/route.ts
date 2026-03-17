import { NextResponse } from 'next/server';
import { getAvailablePdfs } from '@/lib/pdf';

export async function GET() {
  try {
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
