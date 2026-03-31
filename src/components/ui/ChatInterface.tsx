'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Message, LessonPlan, PagePlanEntry, SessionState, ObserverState } from '@/lib/session/sessionStore';

// ─── Memoized markdown renderer ─────────────────────────────────────────
const MemoMarkdown = memo(function MemoMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>;
});
MemoMarkdown.displayName = 'MemoMarkdown';

interface ChatInterfaceProps {
  sessionId: string;
  fileName: string;
  currentPage: number;
  onMasteryAchieved: () => void;
  pagePlanEntry?: PagePlanEntry;
  sessionState: SessionState;
  onSessionUpdate: (updater: (prev: SessionState) => SessionState) => void;
}

export function ChatInterface({
  sessionId,
  fileName,
  currentPage,
  onMasteryAchieved,
  pagePlanEntry,
  sessionState,
  onSessionUpdate,
}: ChatInterfaceProps) {
  // Restore messages from session if available
  const initialMessages = sessionState.chatHistories[currentPage] || [];
  const initialLessonPlan = sessionState.lessonPlans[currentPage] || null;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(initialLessonPlan);
  const [topicsChecked, setTopicsChecked] = useState<Record<string, boolean>>({});
  const [isPageUnlocked, setIsPageUnlocked] = useState(sessionState.masteryStatus[currentPage] === 'mastered');

  // Sync isPageUnlocked with session state when it changes (e.g. navigation back/forth)
  useEffect(() => {
    setIsPageUnlocked(sessionState.masteryStatus[currentPage] === 'mastered');
  }, [sessionState.masteryStatus, currentPage]);

  const displayTimeline = useMemo(() => {
    const items: Array<{ type: 'separator' | 'message'; page: number; message?: Message }> = [];

    for (let page = 0; page <= currentPage; page++) {
      const pageMessages = page === currentPage ? messages : (sessionState.chatHistories[page] || []);
      if (pageMessages.length === 0) continue;

      // Add a separator for each page
      items.push({ type: 'separator', page });
      for (const message of pageMessages) {
        items.push({ type: 'message', page, message });
      }
    }

    return items;
  }, [currentPage, messages, sessionState.chatHistories]);

  const buildCrossPageHistory = useCallback((currentPageMessages: Message[]) => {
    const all: Message[] = [];
    for (let page = 0; page <= currentPage; page++) {
      const pageMessages = page === currentPage ? currentPageMessages : (sessionState.chatHistories[page] || []);
      all.push(...pageMessages);
    }
    return all;
  }, [currentPage, sessionState.chatHistories]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback((instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  }, []);

  // Auto-scroll on new messages, but only if user is near the bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) scrollToBottom();
  }, [displayTimeline, scrollToBottom]);

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(gap > 200);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // ─── Persist messages to session whenever they change ─────────────────
  const persistMessages = useCallback((msgs: Message[]) => {
    onSessionUpdate((prev) => ({
      ...prev,
      chatHistories: {
        ...prev.chatHistories,
        [currentPage]: msgs,
      },
    }));
  }, [currentPage, onSessionUpdate]);

  // ─── Persist lesson plan to session ───────────────────────────────────
  const persistLessonPlan = useCallback((plan: LessonPlan) => {
    onSessionUpdate((prev) => ({
      ...prev,
      lessonPlans: {
        ...prev.lessonPlans,
        [currentPage]: plan,
      },
    }));
  }, [currentPage, onSessionUpdate]);

  // ─── Fetch the Lesson Plan for this specific Page ─────────────────────
  useEffect(() => {
    // If we already have a lesson plan from the restored session, skip
    if (initialLessonPlan && initialMessages.length > 0) {
      setLessonPlan(initialLessonPlan);
      setMessages(initialMessages);
      return;
    }

    const controller = new AbortController();

    const fetchLessonPlan = async () => {
      setIsLoading(true);
      setMessages([
        {
          id: 'system-loading',
          role: 'assistant',
          content: 'Scanning this page and building your lesson plan...',
        }
      ]);
      setLessonPlan(null);

      try {
        const res = await fetch('/api/pdfs/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chapterId: sessionId,
            pageIndex: currentPage,
            pagePlanEntry: pagePlanEntry || undefined,
          }),
          signal: controller.signal,
        });
        
        const data = await res.json();
        
        if (data.success && data.context) {
          const plan = data.context as LessonPlan;
          setLessonPlan(plan);
          persistLessonPlan(plan);

          const explanation = plan.core_explanation || "Here is a breakdown of the concepts on this page.";
          const question = plan?.latex_questions?.[0] || "What are your specific doubts about this material so far?";

          const welcomeMsg: Message = {
            id: Date.now().toString(),
            role: 'assistant',
            content: `${explanation}\n\n**Question:** ${question}`,
          };
          setMessages([welcomeMsg]);
          persistMessages([welcomeMsg]);
        } else {
          throw new Error('Could not generate lesson plan');
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error(err);
        setMessages([
          {
             id: 'system-error',
             role: 'assistant',
             content: 'Failed to build the lesson plan for this page. Please refresh.',
          }
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLessonPlan();
    return () => controller.abort();
  }, [fileName, currentPage, initialLessonPlan, initialMessages.length, pagePlanEntry, persistLessonPlan, persistMessages, sessionId]);

  const handleSendQuery = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    setInput('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    // DEV-only bypass for testing mastery unlock
    if (process.env.NODE_ENV === 'development' && userMessage.toUpperCase() === 'UNLOCK') {
      setIsPageUnlocked(true);
      onSessionUpdate(prev => ({
        ...prev,
        masteryStatus: {
          ...prev.masteryStatus,
          [currentPage]: 'mastered'
        }
      }));
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          historyContext: buildCrossPageHistory(newMessages),
          pageContext: JSON.stringify(lessonPlan || {}),
          sessionId,
          observerContext: sessionState.observerStates?.[currentPage] || null,
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const aiText = data.content as string;
      
      if (data.observerData) {
        onSessionUpdate(prev => ({
          ...prev,
          observerStates: {
            ...prev.observerStates,
            [currentPage]: data.observerData as ObserverState
          }
        }));
      }
      
      // Handle programmatic backend unlocking
      if (aiText.includes('ACHIEVED_MASTERY') || aiText.includes('[MASTERY_ACHIEVED]')) {
        const cleanedText = aiText.replace(/ACHIEVED_MASTERY|\[MASTERY_ACHIEVED\]/g, '').trim();
        const finalMsgs: Message[] = [
          ...newMessages,
          { id: (Date.now() + 1).toString(), role: 'assistant', content: cleanedText || "Excellent! You've mastered this concept. You can now proceed to the next page." },
        ];
        setMessages(finalMsgs);
        persistMessages(finalMsgs);
        
        setIsPageUnlocked(true);
        onSessionUpdate(prev => ({
          ...prev,
          masteryStatus: {
            ...prev.masteryStatus,
            [currentPage]: 'mastered'
          }
        }));
      } else {
        const updatedMsgs: Message[] = [
          ...newMessages,
          { id: (Date.now() + 1).toString(), role: 'assistant', content: aiText },
        ];
        setMessages(updatedMsgs);
        persistMessages(updatedMsgs);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Chat error:', error);
      const errorMsgs: Message[] = [
        ...newMessages,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Oops, network glitch. Let me reconnect...',
        },
      ];
      setMessages(errorMsgs);
      persistMessages(errorMsgs);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendQuery(input);
  };

  const handleDoubtClick = (doubt: string) => {
    handleSendQuery(doubt);
  };

  // Initialize topics checked state from pagePlanEntry
  useEffect(() => {
    if (pagePlanEntry?.topics) {
      const initial: Record<string, boolean> = {};
      pagePlanEntry.topics.forEach((t) => { initial[t] = false; });
      setTopicsChecked(initial);
    }
  }, [pagePlanEntry]);

  // Manim Visual Hook Renderer (memoized via useCallback + MemoMarkdown)
  const renderMessageContent = useCallback((content: string) => {
    const parts = content.split(/\[MANIM:(.*?)\]/g);
    if (parts.length === 1) {
      return <MemoMarkdown content={content} />;
    }
    return parts.map((part, i) => {
      // Odd indices are the captured Manim prompts
      if (i % 2 === 1) {
        return (
          <div key={i} className="my-4 rounded-xl overflow-hidden border border-slate-700 bg-slate-900 shadow-lg">
            <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                MANIM VISUALIZATION
              </span>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Interactive render pending</span>
            </div>
            <div className="p-6 flex flex-col items-center justify-center min-h-[140px] text-center">
              <div style={{ color: 'var(--text-muted)' }} className="mb-2">
                <svg className="w-8 h-8 mx-auto opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <p className="text-sm font-medium text-slate-400 italic">&quot;{part.trim()}&quot;</p>
            </div>
          </div>
        );
      }
      return <MemoMarkdown key={i} content={part} />;
    });
  }, []);

  return (
    <div className="flex flex-col h-full relative">
      {/* Topic Checklist Header (from Chapter Plan) */}
      {pagePlanEntry && pagePlanEntry.topics.length > 0 && (
        <div className="border-b px-4 py-2.5 shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Topics on this page</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pagePlanEntry.topics.map((topic, idx) => (
              <span
                key={idx}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                  topicsChecked[topic]
                    ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50 line-through opacity-70'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 shadow-sm'
                }`}
              >
                {topicsChecked[topic] ? '✓' : '○'} {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Observer State Header (Gaps & Analogies) */}
      {sessionState.observerStates?.[currentPage] && (
        <div className="border-b px-4 py-2.5 shrink-0 flex flex-wrap gap-4" style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)' }}>
          {sessionState.observerStates[currentPage].gaps?.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Identified Gaps</span>
              <div className="flex flex-wrap gap-1.5">
                {sessionState.observerStates[currentPage].gaps.map((gap, idx) => (
                  <span key={`gap-${idx}`} className="text-[11px] px-2 py-0.5 rounded-full border border-rose-800/50 bg-rose-900/30 text-rose-300">
                    ⚠ {gap}
                  </span>
                ))}
              </div>
            </div>
          )}
          {sessionState.observerStates[currentPage].analogies?.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Active Analogies</span>
              <div className="flex flex-wrap gap-1.5">
                {sessionState.observerStates[currentPage].analogies.map((ana, idx) => (
                  <span key={`ana-${idx}`} className="text-[11px] px-2 py-0.5 rounded-full border border-amber-800/50 bg-amber-900/30 text-amber-300">
                    💡 {ana}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-4 pb-48 space-y-4"
            style={{ background: 'var(--bg-base)' }}
            aria-live="polite"
            aria-label="Chat messages"
          >
        {displayTimeline.map((item, idx) => {
          if (item.type === 'separator') {
            return (
              <div key={`sep-${item.page}`} className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-slate-700/70" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 px-2 py-1 rounded-full border border-slate-700/70 bg-slate-800/40">
                  Page {item.page + 1}
                </span>
                <div className="h-px flex-1 bg-slate-700/70" />
              </div>
            );
          }

          const m = item.message as Message;
          return (
            <div key={`${item.page}-${m.id}-${idx}`} className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start mt-2 mb-6'}`}>
              <div
                className={`${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white max-w-[85%] rounded-2xl rounded-tr-[4px] self-end px-5 py-3 shadow-md'
                    : 'w-full self-start'
                }`}
                style={m.role === 'user' ? {} : { color: 'var(--text-primary)' }}
              >
                {m.role === 'user' ? (
                  <div className="prose prose-sm max-w-none text-white font-medium">
                    {renderMessageContent(m.content)}
                  </div>
                ) : (
                  <div className="adoris-prose">
                    {renderMessageContent(m.content)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {isLoading && (
          <div className="flex justify-start">
             <div className="flex gap-2 items-center rounded-2xl p-4 shadow-sm rounded-tl-none" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)' }}></div>
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-muted)', animationDelay: '0.4s' }}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area (Pinned Bottom) */}
      <div className="absolute bottom-0 left-0 w-full p-4 backdrop-blur-md border-t flex flex-col items-center" style={{ background: 'color-mix(in srgb, var(--bg-base) 85%, transparent)', borderColor: 'var(--border)' }}>
        
        {/* Suggestive Doubts Row */}
        {!isLoading && lessonPlan?.suggestive_doubts && lessonPlan.suggestive_doubts.length > 0 && (
          <div className="flex gap-2 mb-3 w-full max-w-4xl overflow-x-auto pb-1 no-scrollbar">
             {lessonPlan.suggestive_doubts.map((doubt, idx) => (
               <button
                 key={idx}
                 onClick={() => handleDoubtClick(doubt)}
                 className="whitespace-nowrap px-4 py-2 text-sm rounded-full font-medium transition-colors border flex-shrink-0 shadow-sm hover:opacity-80"
                 style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
               >
                 <span className="flex items-center gap-1">
                   ✨ <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{doubt}</ReactMarkdown>
                 </span>
               </button>
             ))}
          </div>
        )}

        {/* Mastery Next Page Button */}
        {isPageUnlocked && (
          <button
            onClick={onMasteryAchieved}
            className="w-full max-w-4xl mx-auto mb-3 rounded-xl py-3 font-semibold shadow-md transition-all flex items-center justify-center gap-2 animate-fade-in"
            style={{ background: 'var(--success)', color: '#fff' }}
          >
            Mastery Achieved! Click to Continue ➔
          </button>
        )}

        {/* Scroll-to-bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute right-8 bottom-36 z-20 w-9 h-9 rounded-full shadow-lg flex items-center justify-center border transition-all hover:opacity-90"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            aria-label="Scroll to latest message"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex gap-2 max-w-4xl mx-auto w-full items-end"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-grow: reset then expand
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSendQuery(input);
              }
            }}
            disabled={isLoading && !abortRef.current}
            placeholder={!lessonPlan ? 'Building lesson plan...' : 'Discuss or answer… (⌘↵ to send)'}
            rows={1}
            className="w-full p-3 rounded-xl border text-sm transition-all resize-none overflow-hidden leading-relaxed"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)', color: 'var(--text-primary)' }}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={handleStop}
              className="px-5 py-3 rounded-full font-medium shadow-md transition-all flex items-center justify-center gap-2 shrink-0"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)', border: '1px solid' }}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || !lessonPlan}
              className="px-6 py-3 rounded-full font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95 flex items-center justify-center min-w-[80px] shrink-0"
              style={{ background: 'var(--accent)', color: '#0c0c0e' }}
            >
              Send
            </button>
          )}
        </form>

        <p className="text-[10px] mt-1.5 text-center" style={{ color: 'var(--text-muted)' }}>⌘↵ to send &middot; shift+↵ for newline</p>
        {/* DEV Bypass hidden: type UNLOCK manually to trigger it instead of showing the hint */}
      </div>
    </div>
  );
}
