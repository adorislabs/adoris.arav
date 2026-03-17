'use client';

import { use, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

type SessionPhase = 'checking' | 'resume_prompt' | 'generating_plan' | 'active';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  
  const [fileName, setFileName] = useState<string | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('checking');
  const [session, setSession] = useState<SessionState | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);

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
      // Always fetch total pages
      try {
        const res = await fetch(`/api/pdfs/pages?chapterId=${id}`);
        const data = await res.json();
        if (data.success) {
          setTotalPages(data.totalPages);
        }
      } catch {
        console.error('Failed to load page count');
      }

      // Check localStorage for an existing session using the UUID
      const existing = loadSession(id);
      if (existing && !existing.quizCompleted) {
        // Session exists and quiz not done — offer resume
        setSession(existing);
        setPhase('resume_prompt');
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

    const timer = setTimeout(async () => {
      try {
        await fetch('/api/pdfs/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session }),
        });
      } catch (err) {
        console.warn('[Sync] Failed to push session to Supabase:', err);
      }
    }, 2000); // Debounce sync by 2 seconds

    return () => clearTimeout(timer);
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
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] bg-slate-50">
        <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-sm text-slate-500">Loading session...</p>
      </div>
    );
  }

  if (phase === 'resume_prompt' && session) {
    const masteredCount = Object.values(session.masteryStatus).filter(s => s === 'mastered').length;
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] bg-slate-50 p-8">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2 text-center">
            Resume Previous Session?
          </h2>
          <p className="text-slate-600 text-center text-sm mb-1">
            <strong>{fileName}</strong>
          </p>
          <p className="text-slate-500 text-center text-sm mb-6">
            You were on <strong>Page {session.currentPage + 1}</strong> of {session.totalPages}
            {' '}&middot;{' '}
            <strong>{masteredCount}</strong> pages mastered
          </p>

          {/* Progress bar */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all"
              style={{ width: `${session.totalPages ? (masteredCount / session.totalPages) * 100 : 0}%` }}
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={handleResume}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
            >
              Resume from Page {session.currentPage + 1}
            </button>
            <button
              onClick={handleStartFresh}
              className="w-full py-3 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl font-medium transition-colors"
            >
              Start Fresh
            </button>
          </div>

          <p className="text-[10px] text-slate-400 text-center mt-4">
            Last studied: {new Date(session.lastUpdated).toLocaleString()}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'generating_plan') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] bg-slate-50 p-8 space-y-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <h2 className="text-xl font-semibold text-slate-700">Analyzing your chapter...</h2>
        <p className="text-slate-500 max-w-md text-center">
          The AI is reading every page of <strong>{fileName}</strong> to build a complete lesson plan.
          This ensures no topic is missed.
        </p>
        <p className="text-xs text-slate-400">This may take 10-15 seconds for larger documents.</p>
      </div>
    );
  }

  // ─── Active Session ───────────────────────────────────────────────────
  if (!session) return null;

  const currentPage = session.currentPage;
  const pagePlan = getCurrentPagePlan();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-50">
      
      {/* Session Header / Progress */}
      <div className="h-12 bg-white border-b border-slate-200 flex items-center px-6 shrink-0 justify-between">
         <div className="flex items-center gap-3">
           <h2 className="text-sm font-semibold text-slate-700 truncate max-w-sm" title={fileName}>
             {session.chapterPlan?.chapter_title || fileName}
           </h2>
           {pagePlan && (
             <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
               pagePlan.estimated_difficulty === 'hard' ? 'bg-red-100 text-red-600' :
               pagePlan.estimated_difficulty === 'medium' ? 'bg-amber-100 text-amber-600' :
               'bg-green-100 text-green-600'
             }`}>
               {pagePlan.estimated_difficulty?.toUpperCase()}
             </span>
           )}
         </div>
         <div className="flex items-center space-x-2 text-xs font-medium text-slate-500">
           <span>Page {currentPage + 1} of {session.totalPages || '?'}</span>
           <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden ml-2">
             <div 
               className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500" 
               style={{ width: `${session.totalPages ? ((currentPage + 1) / session.totalPages) * 100 : 0}%` }}
             ></div>
           </div>
         </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <SplitPane
          leftPane={<PdfViewer chapterId={id} currentPage={currentPage} />}
          rightPane={
            <ChatInterface 
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
