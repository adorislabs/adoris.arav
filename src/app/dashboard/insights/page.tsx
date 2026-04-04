'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface StruggleEntry {
  topic: string;
  totalEvents: number;
  unresolvedCount: number;
  avgSeverity: number;
  concepts: string[];
  chapters: string[];
}

interface SessionSummary {
  chapterId: string;
  chapterTitle: string;
  currentPage: number;
  totalPages: number;
  masteredCount: number;
  lastUpdated: string;
}

export default function InsightsPage() {
  const [struggles, setStruggles] = useState<StruggleEntry[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionSummary>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [struggleRes, sessionsRes] = await Promise.all([
          fetch('/api/tracking/struggle'),
          fetch('/api/pdfs/sessions-batch'),
        ]);

        const struggleData = await struggleRes.json();
        if (struggleData.success && struggleData.aggregated) {
          setStruggles(struggleData.aggregated);
        }

        const sessionsData = await sessionsRes.json();
        if (sessionsData.success && sessionsData.sessions) {
          setSessions(sessionsData.sessions);
        }
      } catch (e) {
        console.error('Failed to load insights', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalSessions = Object.keys(sessions).length;
  const totalMastered = Object.values(sessions).reduce((sum, s: any) => sum + (s.masteredCount || 0), 0);
  const totalPages = Object.values(sessions).reduce((sum, s: any) => sum + (s.totalPages || 0), 0);
  const overallProgress = totalPages > 0 ? Math.round((totalMastered / totalPages) * 100) : 0;

  // Top struggle areas sorted by severity
  const sortedStruggles = [...struggles].sort((a, b) => b.avgSeverity - a.avgSeverity);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard" className="text-sm" style={{ color: 'var(--text-muted)' }}>← Dashboard</Link>
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Student Progress Insights</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Hidden analytics view — tracks struggle areas and learning patterns.
          </p>
        </header>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Active Sessions', value: totalSessions, color: 'var(--text-primary)' },
            { label: 'Pages Mastered', value: totalMastered, color: 'var(--success)' },
            { label: 'Overall Progress', value: `${overallProgress}%`, color: 'var(--accent)' },
            { label: 'Struggle Areas', value: struggles.length, color: struggles.length > 3 ? 'var(--error)' : 'var(--warning)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 border text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="text-2xl font-bold mb-0.5" style={{ color }}>{value}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Struggle Areas */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
            Struggle Areas
          </h2>
          {sortedStruggles.length === 0 ? (
            <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No struggle data recorded yet. Struggles are tracked during tutoring sessions.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedStruggles.map((s) => {
                const severityPct = Math.round((s.avgSeverity / 5) * 100);
                const severityColor = s.avgSeverity >= 4 ? 'var(--error)' : s.avgSeverity >= 2.5 ? 'var(--warning)' : 'var(--success)';
                return (
                  <div key={s.topic} className="rounded-xl border p-5" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.topic}</h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {s.totalEvents} events · {s.unresolvedCount} unresolved
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold" style={{ color: severityColor }}>
                          {s.avgSeverity.toFixed(1)}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>severity</div>
                      </div>
                    </div>
                    {/* Severity bar */}
                    <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--bg-muted)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${severityPct}%`, background: severityColor }} />
                    </div>
                    {/* Concepts */}
                    {s.concepts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {s.concepts.slice(0, 6).map((c) => (
                          <span key={c} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Session Progress Table */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
            Session Progress
          </h2>
          {Object.keys(sessions).length === 0 ? (
            <div className="rounded-xl border p-6 text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active sessions yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {Object.entries(sessions).map(([chapterId, info]: [string, any]) => {
                const pct = info.totalPages > 0 ? Math.round((info.masteredCount / info.totalPages) * 100) : 0;
                return (
                  <div key={chapterId} className="p-4 border-b last:border-b-0 flex items-center gap-4" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        Chapter {chapterId.slice(0, 8)}...
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Page {(info.currentPage || 0) + 1} of {info.totalPages} · {info.masteredCount} mastered
                      </p>
                    </div>
                    <div className="w-24 shrink-0">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : 'var(--accent)' }} />
                      </div>
                      <p className="text-[10px] text-right mt-1" style={{ color: 'var(--text-muted)' }}>{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
