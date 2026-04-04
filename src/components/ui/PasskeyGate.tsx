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
      <div className="pointer-events-none select-none opacity-20 blur-xl transition-all duration-700">{children}</div>

      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-500"
        style={{ background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
      >
        <div
          className="animate-slideUp w-full max-w-sm rounded-[24px] p-10 shadow-elevated relative overflow-hidden"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-soft)' }}
        >
          {/* Subtle top glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-accent opacity-20 blur-[10px] rounded-full"></div>

          {/* Logo mark */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-subtle border border-white/5"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L13 4.5V10.5L8 13.5L3 10.5V4.5L8 1.5Z"
                stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" className="drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
              <circle cx="8" cy="7.5" r="2" fill="var(--accent)" />
            </svg>
          </div>

          <h2 className="text-center text-lg font-serif font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome to Adoris
          </h2>
          <p className="text-center text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
            Enter your secure passkey to access study sessions.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <input
                ref={inputRef}
                type="password"
                value={input}
                onChange={e => { setInput(e.target.value); setError(''); }}
                autoComplete="off"
                spellCheck={false}
                placeholder="Passkey"
                className="w-full rounded-2xl border px-5 py-4 text-center tracking-[0.25em] outline-none transition-all duration-300 focus:border-[var(--accent)] focus:shadow-glow font-mono text-lg"
                style={{
                  borderColor: error ? 'var(--error)' : 'var(--border)',
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {error && (
              <p className="text-xs text-center animate-fadeIn font-medium" style={{ color: 'var(--error)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!input.trim() || checking}
              className="w-full py-4 rounded-2xl text-sm font-semibold tracking-wide transition-all duration-300 disabled:opacity-40 hover:opacity-90 active:scale-[0.98] shadow-glow"
              style={{
                background: 'var(--accent)',
                color: '#fff',
              }}
            >
              {checking ? 'Verifying...' : 'Unlock Content'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
