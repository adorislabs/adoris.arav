'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function PasskeyGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'verified' | 'gate'>('loading');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Check if user already has a Supabase session (anonymous or email)
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? 'verified' : 'gate');
    });
  }, []);

  useEffect(() => {
    if (status === 'gate') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || checking) return;

    setChecking(true);
    setError('');

    try {
      // 1. Verify the passkey against Supabase app_config
      const res = await fetch('/api/auth/verify-passkey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passkey: input }),
      });
      const data = await res.json();

      if (!data.success) {
        setError('Incorrect.');
        setInput('');
        inputRef.current?.focus();
        setChecking(false);
        return;
      }

      // 2. Create an anonymous Supabase session — no email/password needed
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInAnonymously();
      if (authError) {
        setError('Auth error. Try again.');
        setChecking(false);
        return;
      }

      // 3. Done — render the app
      setStatus('verified');
    } catch {
      setError('Connection error.');
      setChecking(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  // ── App ──────────────────────────────────────────────────
  if (status === 'verified') return <>{children}</>;

  // ── Gate ─────────────────────────────────────────────────
  return (
    <>
      {/* Blurred bg */}
      <div className="pointer-events-none select-none opacity-10 blur-md">{children}</div>

      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(12,12,14,0.92)', backdropFilter: 'blur(20px)' }}
      >
        <div
          className="animate-slideUp w-full max-w-xs mx-6 rounded-2xl p-8 shadow-lg"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          {/* Logo mark */}
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-6"
            style={{ background: 'var(--accent-muted)' }}
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L13 4.5V10.5L8 13.5L3 10.5V4.5L8 1.5Z"
                stroke="var(--accent)" strokeWidth="1.3" strokeLinejoin="round" />
              <circle cx="8" cy="7.5" r="2" fill="var(--accent)" />
            </svg>
          </div>

          <h2 className="text-center text-sm font-medium mb-6" style={{ color: 'var(--text-secondary)' }}>
            Enter your passkey to continue
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              ref={inputRef}
              type="password"
              value={input}
              onChange={e => { setInput(e.target.value); setError(''); }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Passkey"
              className="w-full rounded-xl border px-4 py-3 text-sm text-center tracking-[0.2em] outline-none transition-colors focus:border-[var(--accent)]"
              style={{
                borderColor: error ? 'var(--error)' : 'var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
              }}
            />

            {error && (
              <p className="text-xs text-center animate-fadeIn" style={{ color: 'var(--error)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!input.trim() || checking}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{
                background: 'var(--accent)',
                color: '#fff',
              }}
            >
              {checking ? 'Verifying...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
