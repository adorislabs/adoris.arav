import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

// Use the public anon client — app_config has public read RLS
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Constant-time string comparison to prevent timing oracle attacks.
 * Always takes the same amount of time regardless of where strings differ.
 */
function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Perform a dummy comparison so execution time doesn't reveal length mismatch
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

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

    if (!safeCompare(passkey.trim(), config.value)) {
      return NextResponse.json({ error: 'Invalid passkey' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Passkey verify error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
