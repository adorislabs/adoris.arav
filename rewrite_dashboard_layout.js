const fs = require('fs');

const code = `import { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PasskeyGate from '@/components/ui/PasskeyGate';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const Logo = () => (
    <div className="flex items-center gap-3">
      <div className="relative w-8 h-8 rounded-none border border-accent flex items-center justify-center shrink-0 bg-accent/10">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-accent"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-accent"></div>
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
          <path d="M6 1L9.464 3V7L6 9L2.536 7V3L6 1Z" stroke="var(--accent)" strokeWidth="1.2" strokeLinejoin="round"/>
          <circle cx="6" cy="5" r="1.5" fill="var(--accent)" />
        </svg>
      </div>
      <span className="text-md font-mono tracking-[0.2em] font-bold text-primary uppercase">Adoris</span>
    </div>
  );

  return (
    <PasskeyGate>
      <div className="flex flex-col md:flex-row h-dvh overflow-hidden bg-base text-primary font-mono relative">
        
        {/* Ambient Grid Background */}
        <div className="fixed inset-0 pointer-events-none opacity-5 z-0" 
          style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px', mixBlendMode: 'overlay' }}>
        </div>

        {/* ── Desktop Sidebar ──────────────────────────── */}
        <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-dim glass-panel tech-border relative z-10">

          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-dim shrink-0 bg-surface/50">
            <Logo />
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2">
            <div className="text-[10px] text-accent uppercase tracking-widest mb-4 opacity-70 px-2 font-bold">[ Navigation_Systems ]</div>
            {[
              { href: '/dashboard',          label: 'Active Sessions', icon: '[SYS]' },
              { href: '/dashboard/library',  label: 'Knowledge Base',  icon: '[DAT]' },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-3 tech-border text-sm transition-all group hover:bg-accent/10 border border-transparent hover:border-accent hover:text-accent text-dim"
              >
                <span className="text-[10px] font-bold tracking-widest">{icon}</span>
                <span className="tracking-widest uppercase text-xs">{label}</span>
              </Link>
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-dim shrink-0 bg-surface/50">
            {user?.email && (
              <div className="flex items-center gap-2 mb-4 px-2">
                <div className="w-1.5 h-1.5 bg-success animate-pulse"></div>
                <p className="text-[10px] text-muted truncate uppercase tracking-widest">
                  OP: {user.email.split('@')[0]}
                </p>
              </div>
            )}
            <form action="/auth/signout" method="post">
              <button
                className="w-full text-center px-4 py-2 text-[10px] uppercase font-bold tracking-widest tech-border border-dim transition-all hover:bg-error/20 hover:border-error hover:text-error text-dim"
              >
                [ Disconnect ]
              </button>
            </form>
          </div>
        </aside>

        {/* ── Content Wrapper ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">

          {/* Mobile Top Header */}
          <header className="md:hidden flex items-center justify-between h-16 px-4 border-b border-dim bg-surface shrink-0 glass-panel tech-border">
            <Logo />
            <form action="/auth/signout" method="post">
              <button
                className="text-[10px] uppercase tracking-widest px-3 py-1.5 tech-border border-dim text-dim hover:text-error hover:border-error"
              >
                Disconnect
              </button>
            </form>
          </header>

          {/* Page Content */}
          <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-transparent">
            {children}
          </main>

          {/* Mobile Bottom Nav */}
          <nav className="md:hidden flex items-stretch h-16 border-t border-dim shrink-0 glass-panel tech-border bg-surface">
            {[
              {
                href: '/dashboard',
                label: 'Sessions',
                icon: '[SYS]',
              },
              {
                href: '/dashboard/library',
                label: 'Library',
                icon: '[DAT]',
              },
            ].map(({ href, label, icon }) => (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-1 transition-all active:bg-accent/10 border-r border-dim last:border-r-0 text-dim hover:text-accent"
              >
                <span className="text-[10px] font-bold tracking-widest">{icon}</span>
                <span className="text-[10px] uppercase tracking-widest">{label}</span>
              </Link>
            ))}
          </nav>
        </div>

      </div>
    </PasskeyGate>
  );
}
`;

fs.writeFileSync('src/app/dashboard/layout.tsx', code);
console.log('DashboardLayout successfully updated');
