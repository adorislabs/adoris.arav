'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ChapterPdf {
  id: string;
  fileName: string;
  bookTitle: string;
  chapterNumber: number;
  subject: string;
}
interface SessionInfo {
  currentPage: number; totalPages: number;
  masteredCount: number; quizCompleted: boolean; lastUpdated: string;
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
              bookTitle: b.title,
              chapterNumber: c.chapter_number || 0,
              subject: b.subject || '',
            }))
          );
          setPdfs(allChapters);

          // Fetch session info from cloud for each chapter
          const infos: Record<string, SessionInfo | null> = {};
          await Promise.all(
            allChapters.map(async (p: ChapterPdf) => {
              try {
                const sRes = await fetch(`/api/pdfs/session?chapterId=${p.id}`);
                const sData = await sRes.json();
                if (sData.success && sData.session) {
                  const s = sData.session;
                  infos[p.id] = {
                    currentPage: s.currentPage || 0,
                    totalPages: s.totalPages || 0,
                    masteredCount: Object.values(s.masteryStatus || {}).filter((v: any) => v === 'mastered').length,
                    quizCompleted: s.quizCompleted || false,
                    lastUpdated: s.lastUpdated || '',
                  };
                } else {
                  infos[p.id] = null;
                }
              } catch {
                infos[p.id] = null;
              }
            })
          );
          setSessionInfos(infos);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  // Group chapters by book
  const bookGroups = pdfs.reduce((acc, p) => {
    if (!acc[p.bookTitle]) acc[p.bookTitle] = { subject: p.subject, chapters: [] };
    acc[p.bookTitle].chapters.push(p);
    return acc;
  }, {} as Record<string, { subject: string; chapters: ChapterPdf[] }>);

  const activeCount = pdfs.filter(p => sessionInfos[p.id] && !sessionInfos[p.id]?.quizCompleted).length;
  const completedCount = pdfs.filter(p => sessionInfos[p.id]?.quizCompleted).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <header className="mb-6 sm:mb-8">
          <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Sessions</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Your chapter study sessions. Use <Link href="/dashboard/library" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>Library</Link> to manage books.
          </p>
        </header>

        {/* Stats row */}
        {!loading && pdfs.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6 sm:mb-8">
            {[
              { label: 'Chapters', value: pdfs.length, color: 'var(--text-primary)' },
              { label: 'In Progress', value: activeCount, color: 'var(--accent)' },
              { label: 'Completed', value: completedCount, color: 'var(--success)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl p-3 sm:p-4 border text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <div className="text-xl sm:text-2xl font-bold mb-0.5" style={{ color }}>{value}</div>
                <div className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

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
          <div className="space-y-6">
            {Object.entries(bookGroups).map(([bookTitle, { subject, chapters }]) => (
              <div key={bookTitle}>
                {/* Book header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-1 h-4 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{bookTitle}</h2>
                  </div>
                  {subject && (
                    <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                      {subject}
                    </span>
                  )}
                </div>

                {/* Chapter cards */}
                <div className="space-y-2">
                  {chapters.map((pdf) => {
                    const info = sessionInfos[pdf.id];
                    const isActive = info && !info.quizCompleted;
                    const isComplete = info?.quizCompleted;
                    const pct = info && info.totalPages > 0 ? Math.round((info.masteredCount / info.totalPages) * 100) : 0;

                    return (
                      <div
                        key={pdf.id}
                        onClick={() => router.push(`/dashboard/session/${pdf.id}`)}
                        className="group rounded-2xl border p-4 sm:p-5 transition-all cursor-pointer hover:border-[var(--accent)]"
                        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          {/* Chapter number badge */}
                          <div
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold"
                            style={{
                              background: isComplete ? 'rgba(34,197,94,0.12)' : isActive ? 'var(--accent-muted)' : 'var(--bg-muted)',
                              color: isComplete ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--text-muted)',
                            }}
                          >
                            {isComplete ? '✓' : pdf.chapterNumber || '—'}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>
                                {pdf.fileName}
                              </p>
                              {/* Status badge */}
                              {isComplete ? (
                                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>Done</span>
                              ) : isActive ? (
                                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>Active</span>
                              ) : null}
                            </div>

                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {isActive
                                ? `Page ${(info!.currentPage || 0) + 1} of ${info!.totalPages} · ${info!.masteredCount} mastered`
                                : isComplete
                                  ? 'Chapter complete — all pages mastered'
                                  : 'Not started yet'}
                            </p>

                            {/* Progress bar */}
                            {info && info.totalPages > 0 && (
                              <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, background: isComplete ? 'var(--success)' : 'var(--accent)' }}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action row (shown when there's session data) */}
                        {info && (
                          <div className="mt-3 pt-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--border-soft)' }} onClick={e => e.stopPropagation()}>
                            <Link
                              href={`/dashboard/problems/${pdf.id}`}
                              className="flex-1 text-center text-xs py-1.5 px-2 rounded-lg font-medium transition-colors"
                              style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
                            >
                              Practice
                            </Link>
                            <Link
                              href={`/dashboard/exam/${pdf.id}`}
                              className="flex-1 text-center text-xs py-1.5 px-2 rounded-lg font-medium transition-colors"
                              style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                            >
                              Exam
                            </Link>
                            <Link
                              href={`/dashboard/session/${pdf.id}`}
                              className="flex-1 text-center text-xs py-1.5 px-2 rounded-lg font-semibold transition-colors"
                              style={{ background: 'var(--accent)', color: '#0c0c0e' }}
                            >
                              {isComplete ? 'Review' : isActive ? 'Continue' : 'Start'} →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
