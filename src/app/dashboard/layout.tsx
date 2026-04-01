import { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PasskeyGate from '@/components/ui/PasskeyGate';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Get user if there is one — but don't redirect if not.
  // PasskeyGate handles all auth (anonymous sign-in on passkey success).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const Logo = () => (
    <div className="flex items-center gap-2.5">
      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: 'var(--accent-muted)' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L9.464 3V7L6 9L2.536 7V3L6 1Z" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round"/>
          <circle cx="6" cy="5" r="1.5" fill="var(--accent)" />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Adoris</span>
    </div>
  );

  return (
    <PasskeyGate>
      <div className="flex flex-col md:flex-row h-dvh overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

        {/* ── Desktop Sidebar ──────────────────────────── */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 border-r" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>

          {/* Logo */}
          <div className="h-14 flex items-center px-5 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
            <Logo />
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

        {/* ── Content Wrapper (mobile: full column, desktop: flex-1 right pane) ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Mobile Top Header */}
          <header className="md:hidden flex items-center justify-between h-12 px-4 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <Logo />
            <form action="/auth/signout" method="post">
              <button
                className="text-[11px] px-2.5 py-1 rounded-lg font-medium"
                style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
              >
                Sign out
              </button>
            </form>
          </header>

          {/* Page Content */}
          <main className="flex-1 min-h-0 overflow-hidden" style={{ background: 'var(--bg-base)' }}>
            {children}
          </main>

          {/* Mobile Bottom Nav */}
          <nav className="md:hidden flex items-stretch h-14 border-t shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            {[
              {
                href: '/dashboard',
                label: 'Sessions',
                icon: (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="9" rx="1.5" />
                    <rect x="14" y="3" width="7" height="5" rx="1.5" />
                    <rect x="14" y="12" width="7" height="9" rx="1.5" />
                    <rect x="3" y="16" width="7" height="5" rx="1.5" />
                  </svg>
                ),
              },
              {
                href: '/dashboard/library',
                label: 'Library',
                icon: (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                ),
              },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-1 transition-opacity active:opacity-60"
                style={{ color: 'var(--text-muted)' }}
              >
                {icon}
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </Link>
            ))}
          </nav>
        </div>

      </div>
    </PasskeyGate>
  );
}
