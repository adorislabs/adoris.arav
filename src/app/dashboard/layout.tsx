import { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PasskeyGate from '@/components/ui/PasskeyGate';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Get user if there is one — but don't redirect if not.
  // PasskeyGate handles all auth (anonymous sign-in on passkey success).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <PasskeyGate>
      <div className="flex h-screen w-full overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

        {/* ── Sidebar ─────────────────────────────────── */}
        <aside className="w-56 flex flex-col shrink-0 border-r" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>

          {/* Logo */}
          <div className="h-14 flex items-center px-5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--accent-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1L9.464 3V7L6 9L2.536 7V3L6 1Z" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round"/>
                  <circle cx="6" cy="5" r="1.5" fill="var(--accent)" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Adoris</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            {[
              { href: '/dashboard',          label: 'Sessions', icon: '✦' },
              { href: '/dashboard/library',  label: 'Library',  icon: '⌘' },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors group"
                style={{ color: 'var(--text-secondary)' }}
              >
                <span className="text-[11px] opacity-50 group-hover:opacity-100 transition-opacity">{icon}</span>
                <span className="group-hover:text-[var(--text-primary)] transition-colors">{label}</span>
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-3 py-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
            {user?.email && (
              <p className="text-[11px] px-3 mb-1 truncate" style={{ color: 'var(--text-muted)' }}>
                {user.email}
              </p>
            )}
            <form action="/auth/signout" method="post">
              <button
                className="w-full text-left px-3 py-1.5 text-xs rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        {/* ── Main ─────────────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: 'var(--bg-base)' }}>
          {children}
        </main>
      </div>
    </PasskeyGate>
  );
}
