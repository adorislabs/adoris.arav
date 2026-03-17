'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ChapterPdf { id: string; fileName: string; bookTitle: string; }
interface SessionInfo {
  currentPage: number; totalPages: number;
  masteredCount: number; quizCompleted: boolean; lastUpdated: string;
}

function getSessionInfo(id: string): SessionInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`adoris_session_${btoa(id)}`);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return {
      currentPage: s.currentPage || 0,
      totalPages: s.totalPages || 0,
      masteredCount: Object.values(s.masteryStatus || {}).filter((v: any) => v === 'mastered').length,
      quizCompleted: s.quizCompleted || false,
      lastUpdated: s.lastUpdated || '',
    };
  } catch { return null; }
}

export default function DashboardPage() {
  const router = useRouter();
  const [pdfs, setPdfs] = useState<ChapterPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionInfos, setSessionInfos] = useState<Record<string, SessionInfo | null>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/books');
        const data = await res.json();
        if (data.success) {
          const allChapters = data.books.flatMap((b: any) =>
            b.chapters.map((c: any) => ({
              id: c.id,
              fileName: c.chapter_title,
              bookTitle: b.title
            }))
          );
          setPdfs(allChapters);
          const infos: Record<string, SessionInfo | null> = {};
          allChapters.forEach((p: ChapterPdf) => { infos[p.id] = getSessionInfo(p.id); });
          setSessionInfos(infos);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Sessions</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Active sessions from your study library. Over time, all synced chapters will appear here. Use <Link href="/dashboard/library" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>Library</Link> to manage your books.
          </p>
        </header>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        ) : pdfs.length === 0 ? (
          <div className="rounded-xl p-10 text-center border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <p className="text-sm mb-1">No PDFs found</p>
            <p className="text-xs">Upload some PDFs via the <Link href="/dashboard/library" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>Library</Link> to begin tutoring sessions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pdfs.map((pdf) => {
              const info = sessionInfos[pdf.id];
              const active = info && !info.quizCompleted;
              const pct = info && info.totalPages > 0 ? Math.round((info.masteredCount / info.totalPages) * 100) : 0;
              const encodedId = pdf.id;

              return (
                <div
                  key={pdf.id}
                  onClick={() => router.push(`/dashboard/session/${pdf.id}`)}
                  className="group rounded-2xl border p-5 transition-all shadow-sm hover:shadow-md hover:border-[var(--accent)] cursor-pointer"
                  style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
                      <span className="text-xl">📄</span>
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }} title={pdf.fileName}>
                        {pdf.bookTitle} - {pdf.fileName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {active
                          ? `Page ${(info.currentPage || 0) + 1} · ${info.masteredCount}/${info.totalPages} mastered`
                          : info?.quizCompleted
                            ? 'Chapter complete'
                            : 'Not started'}
                      </p>

                      {/* Progress bar */}
                      {info && info.totalPages > 0 && (
                        <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: info.quizCompleted ? 'var(--success)' : 'var(--accent)' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Quick links */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {info && ( // Changed from info.masteredCount > 0 to just info
                        <>
                          <Link
                            href={`/dashboard/problems/${pdf.id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
                          >
                            Practice
                          </Link>
                          <Link
                            href={`/dashboard/exam/${pdf.id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] px-2.5 py-1 rounded-md font-medium transition-colors"
                            style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                          >
                            Exam
                          </Link>
                        </>
                      )}
                      <span className="text-xs ml-1 group-hover:translate-x-0.5 transition-transform" style={{ color: 'var(--text-muted)' }}>→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
