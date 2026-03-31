'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SplitPane } from '@/components/ui/SplitPane';
import { ChatInterface } from '@/components/ui/ChatInterface';
import { PdfViewer } from '@/components/ui/PdfViewer';
import {
  loadSession,
  saveSession,
  clearSession,
  createInitialSession,
  type SessionState,
  type ChapterPlan,
  type PagePlanEntry,
} from '@/lib/session/sessionStore';

type SessionPhase = 'checking' | 'resume_prompt' | 'generating_plan' | 'active' | 'completed';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('checking');
  const [session, setSession] = useState<SessionState | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const syncAbortRef = useRef<AbortController | null>(null);

  // ─── Phase 1: Fetch filename and check for existing session ───────────
  useEffect(() => {
    async function init() {
      try {
        // Fetch the real filename from Supabase chapter ID
        const detRes = await fetch(`/api/chapters/${id}/details`);
        const detData = await detRes.json();
        if (!detData.success || !detData.fileName) {
          console.error('Chapter not found');
          // If it fails (e.g. they actually passed a base64 name manually), fallback to atob
          try {
            const fallbackName = atob(decodeURIComponent(id));
            setFileName(fallbackName);
          } catch { return; }
        } else {
          setFileName(detData.fileName);
        }
      } catch {
        try { setFileName(atob(decodeURIComponent(id))); } catch { return; }
      }
    }
    init();
  }, [id]);

  useEffect(() => {
    if (!fileName) return;

    async function initSession() {
      // Fetch page count and cloud session in parallel
      const [pagesResult, cloudResult] = await Promise.allSettled([
        fetch(`/api/pdfs/pages?chapterId=${id}`).then(r => r.json()),
        fetch(`/api/pdfs/session?chapterId=${id}`).then(r => r.json()),
      ]);

      let pages = totalPages;
      if (pagesResult.status === 'fulfilled' && pagesResult.value.success) {
        pages = pagesResult.value.totalPages;
        setTotalPages(pages);
      }

      let cloudSession: SessionState | null = null;
      if (cloudResult.status === 'fulfilled' && cloudResult.value.success && cloudResult.value.session) {
        cloudSession = {
          ...cloudResult.value.session,
          fileName: fileName!,
          totalPages: pages || 1,
          chapterPlan: null,
        };
      }

      // 3. Fallback/Check localStorage
      const localSession = loadSession(id);
      
      const sessionToUse = cloudSession || localSession;

      if (sessionToUse && !sessionToUse.quizCompleted) {
        // If we have a session but it's missing the chapterPlan (common for cloud restore), fetch/generate it
        if (!sessionToUse.chapterPlan) {
          try {
            const cpRes = await fetch('/api/pdfs/chapter-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chapterId: id, fileName: fileName! }),
            });
            const cpData = await cpRes.json();
            if (cpData.success) {
              sessionToUse.chapterPlan = cpData.chapterPlan;
            }
          } catch (err) {
            console.error('Failed to restore chapter plan:', err);
          }
        }

        setSession(sessionToUse);
        setPhase('resume_prompt');
      } else if (sessionToUse?.quizCompleted) {
        // Quiz already completed — show completion state
        setSession(sessionToUse);
        setPhase('completed');
      } else {
        // No session or quiz already completed — start fresh
        setPhase('generating_plan');
        await generateNewSession();
      }
    }
    initSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName]);

  // ─── Generate chapter plan and create fresh session ───────────────────
  const generateNewSession = useCallback(async () => {
    setPhase('generating_plan');
    clearSession(id);

    try {
      // Fetch page count if we don't have it
      let pages = totalPages;
      if (!pages) {
        const pRes = await fetch(`/api/pdfs/pages?chapterId=${id}`);
        const pData = await pRes.json();
        pages = pData.totalPages || 1;
        setTotalPages(pages);
      }

      // Generate chapter plan
      const cpRes = await fetch('/api/pdfs/chapter-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: id, fileName: fileName! }),
      });
      const cpData = await cpRes.json();
      const chapterPlan: ChapterPlan | null = cpData.success ? cpData.chapterPlan : null;

      const newSession = createInitialSession(id, fileName!, pages!, chapterPlan);
      saveSession(newSession);
      setSession(newSession);
      setPhase('active');
    } catch (err) {
      console.error('Failed to generate session:', err);
      // Fallback: create session without chapter plan
      const pages = totalPages || 1;
      const fallback = createInitialSession(id, fileName!, pages, null);
      saveSession(fallback);
      setSession(fallback);
      setPhase('active');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages, id, fileName]);

  // ─── Resume handler ──────────────────────────────────────────────────
  const handleResume = () => {
    setPhase('active');
  };

  const handleStartFresh = async () => {
    if (!fileName) return;
    clearSession(id);
    await generateNewSession();
  };

  // ─── Page navigation with persistence ─────────────────────────────────
  const handleNextPage = useCallback(() => {
    if (!session) return;

    const newPage = session.currentPage + 1;

    if (session.totalPages && newPage >= session.totalPages) {
      // End of chapter → go to full exam
      router.push(`/dashboard/exam/${id}`);
      return;
    }

    const updatedSession: SessionState = {
      ...session,
      currentPage: newPage,
      masteryStatus: {
        ...session.masteryStatus,
        [session.currentPage]: 'mastered',
        [newPage]: 'in_progress',
      },
    };

    setSession(updatedSession);
    saveSession(updatedSession);
  }, [session, router, id]);

  // ─── Cloud Sync Effect ────────────────────────────────────────────────
  useEffect(() => {
    if (!session || phase !== 'active') return;

    // Cancel any in-flight sync
    syncAbortRef.current?.abort();

    const controller = new AbortController();
    syncAbortRef.current = controller;

    setSyncStatus('idle');
    const timer = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        await fetch('/api/pdfs/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session }),
          signal: controller.signal,
        });
        setSyncStatus('synced');
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[Sync] Failed to push session to Supabase:', err);
          setSyncStatus('error');
        }
      }
    }, 2000);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [session, phase]);

  // ─── Persist session updates from ChatInterface ───────────────────────
  const handleSessionUpdate = useCallback((updater: (prev: SessionState) => SessionState) => {
    setSession((prev) => {
      if (!prev) return prev;
      const updated = updater(prev);
      saveSession(updated);
      return updated;
    });
  }, []);

  // ─── Get current page plan entry ──────────────────────────────────────
  const getCurrentPagePlan = (): PagePlanEntry | undefined => {
    if (!session?.chapterPlan?.page_plans) return undefined;
    return session.chapterPlan.page_plans.find(
      (p) => p.page_number === session.currentPage + 1
    );
  };

  // ─── Render by phase ──────────────────────────────────────────────────

  if (phase === 'checking' || !fileName) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]" style={{ background: 'var(--bg-base)' }}>
        <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
        <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading session...</p>
      </div>
    );
  }

  if (phase === 'resume_prompt' && session) {
    const masteredCount = Object.values(session.masteryStatus).filter(s => s === 'mastered').length;
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-8" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-md w-full rounded-2xl shadow-xl p-8 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--accent-muted)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="var(--accent)">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2 text-center" style={{ color: 'var(--text-primary)' }}>
            Resume Previous Session?
          </h2>
          <p className="text-center text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
            <strong>{fileName}</strong>
          </p>
          <p className="text-center text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
            You were on <strong style={{ color: 'var(--text-primary)' }}>Page {session.currentPage + 1}</strong> of {session.totalPages}
            {' '}&middot;{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{masteredCount}</strong> pages mastered
          </p>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full overflow-hidden mb-6" style={{ background: 'var(--bg-muted)' }}>
            <div
              className="h-full transition-all"
              style={{ width: `${session.totalPages ? (masteredCount / session.totalPages) * 100 : 0}%`, background: 'var(--accent)' }}
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={handleResume}
              className="w-full py-3 rounded-xl font-semibold transition-colors shadow-sm"
              style={{ background: 'var(--accent)', color: '#0c0c0e' }}
            >
              Resume from Page {session.currentPage + 1}
            </button>
            <button
              onClick={handleStartFresh}
              className="w-full py-3 border-2 rounded-xl font-medium transition-colors"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Start Fresh
            </button>
          </div>

          <p className="text-[10px] text-center mt-4" style={{ color: 'var(--text-muted)' }}>
            Last studied: {new Date(session.lastUpdated).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'generating_plan') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-8 space-y-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Analyzing your chapter...</h2>
        <p className="max-w-md text-center" style={{ color: 'var(--text-secondary)' }}>
          The AI is reading every page of <strong>{fileName}</strong> to build a complete lesson plan.
          This ensures no topic is missed.
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This may take 10-15 seconds for larger documents.</p>
      </div>
    );
  }

  if (phase === 'completed' && session) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-8" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-md w-full rounded-2xl shadow-xl p-8 border text-center" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(34,197,94,0.15)' }}>
            <span className="text-3xl">🏆</span>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Chapter Complete!</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            You&apos;ve finished studying <strong>{fileName}</strong>. You can review practice problems, retake the exam, or start over.
          </p>
          <div className="space-y-3">
            <Link
              href={`/dashboard/problems/${id}`}
              className="block w-full py-3 rounded-xl font-semibold transition-colors"
              style={{ background: 'var(--accent)', color: '#0c0c0e' }}
            >
              Practice Problems
            </Link>
            <Link
              href={`/dashboard/exam/${id}`}
              className="block w-full py-3 rounded-xl font-medium transition-colors border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              Retake Exam
            </Link>
            <button
              onClick={handleStartFresh}
              className="w-full py-3 rounded-xl font-medium transition-colors text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              Start Fresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active Session ───────────────────────────────────────────────────
  if (!session) return null;

  const currentPage = session.currentPage;
  const pagePlan = getCurrentPagePlan();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      
      {/* Session Header / Progress */}
      <div className="h-12 border-b flex items-center px-6 shrink-0 justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
         <div className="flex items-center gap-3">
           <h2 className="text-sm font-semibold truncate max-w-sm" title={fileName} style={{ color: 'var(--text-primary)' }}>
             {session.chapterPlan?.chapter_title || fileName}
           </h2>
           {pagePlan && (
             <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
               pagePlan.estimated_difficulty === 'hard' ? 'bg-red-900/30 text-red-400 border-red-800/50' :
               pagePlan.estimated_difficulty === 'medium' ? 'bg-amber-900/30 text-amber-400 border-amber-800/50' :
               'bg-green-900/30 text-green-400 border-green-800/50'
             }`}>
               {pagePlan.estimated_difficulty?.toUpperCase()}
             </span>
           )}
         </div>
         <div className="flex items-center space-x-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
           {/* Sync status indicator */}
           <span className="flex items-center gap-1 mr-2" title={syncStatus === 'synced' ? 'Saved to cloud' : syncStatus === 'syncing' ? 'Syncing…' : syncStatus === 'error' ? 'Sync failed' : ''}>
             {syncStatus === 'syncing' && <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />}
             {syncStatus === 'synced' && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--success)' }} />}
             {syncStatus === 'error' && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--error)' }} />}
           </span>
           <span>Page {currentPage + 1} of {session.totalPages || '?'}</span>
           <div className="w-32 h-2 rounded-full overflow-hidden ml-2" style={{ background: 'var(--bg-muted)' }}>
             <div 
               className="h-full transition-all duration-500" 
               style={{ width: `${session.totalPages ? ((currentPage + 1) / session.totalPages) * 100 : 0}%`, background: 'var(--accent)' }}
             ></div>
           </div>
         </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <SplitPane
          leftPane={<PdfViewer chapterId={id} currentPage={currentPage} />}
          rightPane={
            <ChatInterface 
              key={currentPage}
              sessionId={id} 
              fileName={fileName!} 
              currentPage={currentPage}
              onMasteryAchieved={handleNextPage}
              pagePlanEntry={pagePlan}
              sessionState={session}
              onSessionUpdate={handleSessionUpdate}
            />
          }
        />
      </div>
    </div>
  );
}
