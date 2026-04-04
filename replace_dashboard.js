const fs = require('fs');

fs.writeFileSync('src/app/dashboard/layout.tsx', `
import { ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PasskeyGate from '@/components/ui/PasskeyGate';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const Logo = () => (
    <div className="flex items-center gap-3">
      <div className="relative w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 12H16c-.7 2-2 3-4 3s-3.3-1-4-3H2.5"/>
          <path d="M5.5 5.5A5 5 0 0 1 12 2c3.2 0 5.4 2.8 6.5 5.5"/>
          <path d="M2 12a10 10 0 1 0 20 0"/>
        </svg>
      </div>
      <span className="text-xl font-serif tracking-wide font-medium text-primary">Adoris</span>
    </div>
  );

  return (
    <PasskeyGate>
      <div className="flex flex-col h-dvh overflow-hidden bg-base text-primary font-sans">
        
        {/* Soft Header Navigation - Replaces Sidebar */}
        <header className="h-16 w-full flex items-center justify-between px-6 border-b border-dim bg-base shrink-0 z-20 shadow-sm relative">
          <div className="flex items-center gap-12">
            <Logo />
            <nav className="hidden md:flex gap-8">
              <Link href="/dashboard" className="text-sm font-medium text-dim hover:text-primary transition-colors flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                Study Sessions
              </Link>
              <Link href="/dashboard/library" className="text-sm font-medium text-dim hover:text-primary transition-colors flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5H20"/></svg>
                Library
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            {user?.email && <span className="text-sm text-dim hidden md:block">{user.email}</span>}
            <form action="/auth/signout" method="post">
              <button className="text-sm font-medium text-dim hover:text-primary transition-colors px-3 py-1.5 rounded-lg hover:bg-elevated">
                Sign Out
              </button>
            </form>
          </div>
        </header>

        {/* Main Interface Canvas */}
        <main className="flex-1 overflow-hidden bg-base md:p-3 relative">
          <div className="w-full h-full bg-surface md:rounded-2xl md:border border-dim shadow-sm overflow-hidden flex flex-col relative">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden flex items-stretch h-16 border-t border-dim shrink-0 bg-surface">
          {[
            {
              href: '/dashboard',
              label: 'Sessions',
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            },
            {
              href: '/dashboard/library',
              label: 'Library',
              icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-0-5H20"/></svg>
            },
          ].map(({ href, label, icon }) => (
             <Link
               key={href}
               href={href}
               className="flex-1 flex flex-col items-center justify-center gap-1 transition-all active:bg-accent-muted text-dim hover:text-accent"
             >
               {icon}
               <span className="text-[11px] font-medium tracking-wide">{label}</span>
             </Link>
          ))}
        </nav>
      </div>
    </PasskeyGate>
  );
}
`);
console.log('Saved dashboard layout - transformed to top-nav minimalist canvas');
