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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const syncAbortRef = useRef<AbortController | null>(null);

  // ─── Phase 1: Fire ALL init fetches in parallel from mount ────────────
  useEffect(() => {
    async function init() {
      // Kick off all 3 requests simultaneously — no waterfall
      const [detResult, pagesResult, cloudResult] = await Promise.allSettled([
        fetch(`/api/chapters/${id}/details`).then(r => r.json()),
        fetch(`/api/pdfs/pages?chapterId=${id}`).then(r => r.json()),
        fetch(`/api/pdfs/session?chapterId=${id}`).then(r => r.json()),
      ]);

      // ── Resolve fileName ──
      let resolvedFileName: string | null = null;
      if (detResult.status === 'fulfilled' && detResult.value.success && detResult.value.fileName) {
        resolvedFileName = detResult.value.fileName;
      } else {
        try { resolvedFileName = atob(decodeURIComponent(id)); } catch { return; }
      }
      setFileName(resolvedFileName);

      // ── Resolve page count ──
      let pages = 1;
      if (pagesResult.status === 'fulfilled' && pagesResult.value.success) {
        pages = pagesResult.value.totalPages;
        setTotalPages(pages);
      }

      // ── Resolve cloud session ──
      let cloudSession: SessionState | null = null;
      if (cloudResult.status === 'fulfilled' && cloudResult.value.success && cloudResult.value.session) {
        cloudSession = {
          ...cloudResult.value.session,
          fileName: resolvedFileName!,
          totalPages: pages,
          chapterPlan: null,
        };
      }

      const localSession = loadSession(id);
      // Prefer whichever copy was updated more recently; fall back to whichever exists
      let sessionToUse: SessionState | null;
      if (cloudSession && localSession) {
        const cloudTime = new Date(cloudSession.lastUpdated || 0).getTime();
        const localTime = new Date(localSession.lastUpdated || 0).getTime();
        sessionToUse = cloudTime >= localTime ? cloudSession : localSession;
      } else {
        sessionToUse = cloudSession || localSession;
      }

      if (sessionToUse && !sessionToUse.quizCompleted) {
        // Restore chapter plan if missing (now cached in DB → fast DB read)
        if (!sessionToUse.chapterPlan) {
          try {
            const cpRes = await fetch('/api/pdfs/chapter-plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chapterId: id, fileName: resolvedFileName }),
            });
            const cpData = await cpRes.json();
            if (cpData.success) sessionToUse.chapterPlan = cpData.chapterPlan;
          } catch (err) {
            console.error('Failed to restore chapter plan:', err);
          }
        }
        setSession(sessionToUse);
        setPhase('resume_prompt');
      } else if (sessionToUse?.quizCompleted) {
        setSession(sessionToUse);
        setPhase('completed');
      } else {
        setPhase('generating_plan');
        await generateNewSessionWith(resolvedFileName!, pages);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ─── Generate chapter plan and create fresh session ───────────────────
  const generateNewSessionWith = useCallback(async (resolvedFileName: string, resolvedPages: number) => {
    setPhase('generating_plan');
    clearSession(id);

    try {
      // Generate chapter plan (now reads from DB cache if already generated)
      const cpRes = await fetch('/api/pdfs/chapter-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: id, fileName: resolvedFileName }),
      });
      const cpData = await cpRes.json();
      const chapterPlan: ChapterPlan | null = cpData.success ? cpData.chapterPlan : null;

      const newSession = createInitialSession(id, resolvedFileName, resolvedPages, chapterPlan);
      saveSession(newSession);
      setSession(newSession);
      setPhase('active');
    } catch (err) {
      console.error('Failed to generate session:', err);
      const fallback = createInitialSession(id, resolvedFileName, resolvedPages, null);
      saveSession(fallback);
      setSession(fallback);
      setPhase('active');
    }
  }, [id]);

  // ─── Resume handler ──────────────────────────────────────────────────
  const handleResume = () => {
    setPhase('active');
  };

  const handleStartFresh = async () => {
    if (!fileName) return;
    clearSession(id);
    await generateNewSessionWith(fileName, totalPages || 1);
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

  // ─── Reset progress (keep chapter plan, clear mastery + chat) ─────────
  const handleResetProgress = useCallback(() => {
    if (!session) return;
    const reset: SessionState = {
      ...session,
      currentPage: 0,
      masteryStatus: {},
      chatHistories: {},
      observerStates: {},
      quizCompleted: false,
      generatedQuiz: undefined,
      lastUpdated: new Date().toISOString(),
    };
    saveSession(reset);
    setSession(reset);
    setShowResetConfirm(false);
  }, [session]);

  // ─── Render by phase ──────────────────────────────────────────────────

  if (phase === 'checking' || !fileName) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ background: 'var(--bg-base)' }}>
        <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
        <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading session...</p>
      </div>
    );
  }

  if (phase === 'resume_prompt' && session) {
    const masteredCount = Object.values(session.masteryStatus).filter(s => s === 'mastered').length;
    return (
      <div className="flex flex-col items-center justify-center h-full p-8" style={{ background: 'var(--bg-base)' }}>
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
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4" style={{ background: 'var(--bg-base)' }}>
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
      <div className="flex flex-col items-center justify-center h-full p-8" style={{ background: 'var(--bg-base)' }}>
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
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* Reset Progress Confirm Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(16px)' }}>
          <div className="w-full max-w-sm mx-6 rounded-2xl p-7 border animate-slideUp" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(244,63,94,0.12)' }}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="var(--error)"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </div>
            <h3 className="text-base font-semibold text-center mb-2" style={{ color: 'var(--text-primary)' }}>Reset Session Progress?</h3>
            <p className="text-sm text-center mb-6" style={{ color: 'var(--text-secondary)' }}>
              This will clear all mastery marks, chat history, and restart from page 1. Your chapter plan is kept — no regeneration needed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleResetProgress}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--error)', color: '#fff' }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
      
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
           {/* Reset progress */}
           <button
             onClick={() => setShowResetConfirm(true)}
             title="Reset session progress"
             className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:opacity-80 mr-1"
             style={{ color: 'var(--text-muted)' }}
           >
             <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
               <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
             </svg>
           </button>
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
