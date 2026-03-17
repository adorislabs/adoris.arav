import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return redirect('/dashboard');

  const params = await searchParams;

  const signIn = async (formData: FormData) => {
    'use server';
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return redirect('/login?message=Invalid credentials');
    return redirect('/dashboard');
  };

  const signUp = async (formData: FormData) => {
    'use server';
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return redirect('/login?message=Could not create account');
    return redirect('/login?message=Check your email to confirm');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-base)' }}>
      <div className="w-full max-w-sm animate-slideUp">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5L11.5 4V9L7 11.5L2.5 9V4L7 1.5Z" stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round"/>
              <circle cx="7" cy="6.5" r="1.75" fill="var(--accent)"/>
            </svg>
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Adoris</span>
        </div>

        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Welcome back</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>Sign in to your tutor</p>

        <form className="space-y-4">
          <div>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="Email"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Password"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          {params?.message && (
            <p className="text-xs px-4 py-3 rounded-xl animate-fadeIn"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              {params.message}
            </p>
          )}

          <button
            formAction={signIn}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'var(--accent)', color: '#0c0c0e' }}
          >
            Sign in
          </button>
          <button
            formAction={signUp}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            Create account
          </button>
        </form>
      </div>
    </div>
  );
}
