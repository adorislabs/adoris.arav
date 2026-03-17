import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use the public anon client — app_config has public read RLS
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/auth/verify-passkey
 * Verifies the entered passkey against app_config.
 * Does NOT require the user to be authenticated — the gate is the only auth step.
 */
export async function POST(req: Request) {
  try {
    const { passkey } = await req.json();

    if (!passkey?.trim()) {
      return NextResponse.json({ error: 'No passkey provided' }, { status: 400 });
    }

    // Read the passkey from app_config (public RLS allows SELECT)
    const { data: config, error } = await supabasePublic
      .from('app_config')
      .select('value')
      .eq('key', 'access_passkey')
      .single();

    if (error || !config) {
      console.error('app_config read error:', error);
      return NextResponse.json({ error: 'Config not found — run the passkey SQL migration first' }, { status: 500 });
    }

    if (passkey.trim() !== config.value) {
      return NextResponse.json({ error: 'Invalid passkey' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Passkey verify error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
