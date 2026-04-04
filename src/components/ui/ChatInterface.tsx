
'use client';

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Message, LessonPlan, PagePlanEntry, SessionState } from '@/lib/session/sessionStore';

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
  const initialMessages = sessionState.chatHistories[currentPage] || [];
  const initialLessonPlan = sessionState.lessonPlans[currentPage] || null;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(initialLessonPlan);
  const [isPageUnlocked, setIsPageUnlocked] = useState(sessionState.masteryStatus[currentPage] === 'mastered');

  useEffect(() => {
    setIsPageUnlocked(sessionState.masteryStatus[currentPage] === 'mastered');
  }, [sessionState.masteryStatus, currentPage]);

  const displayTimeline = useMemo(() => {
    const items: Array<{ type: 'separator' | 'message'; page: number; message?: Message }> = [];

    for (let page = 0; page <= currentPage; page++) {
      const pageMessages = page === currentPage ? messages : (sessionState.chatHistories[page] || []);
      if (pageMessages.length === 0) continue;

      items.push({ type: 'separator', page });
      for (const message of pageMessages) {
        items.push({ type: 'message', page, message });
      }
    }
    return items;
  }, [currentPage, messages, sessionState.chatHistories]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const scrollToBottom = useCallback((instant = false) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) scrollToBottom();
  }, [displayTimeline, scrollToBottom]);

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

  const persistMessages = useCallback((msgs: Message[]) => {
    onSessionUpdate((prev) => ({
      ...prev,
      chatHistories: {
        ...prev.chatHistories,
        [currentPage]: msgs,
      },
    }));
  }, [currentPage, onSessionUpdate]);

  const persistLessonPlan = useCallback((plan: LessonPlan) => {
    onSessionUpdate((prev) => ({
      ...prev,
      lessonPlans: {
        ...prev.lessonPlans,
        [currentPage]: plan,
      },
    }));
  }, [currentPage, onSessionUpdate]);

  useEffect(() => {
    if (initialLessonPlan && initialMessages.length > 0) {
      setLessonPlan(initialLessonPlan);
      setMessages(initialMessages);
      return;
    }

    const controller = new AbortController();
    const fetchLessonPlan = async () => {
      setIsLoading(true);
      setMessages([{ id: 'system-loading', role: 'assistant', content: 'Scanning this page and compiling your lesson plan...' }]);
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
        setMessages([{ id: 'system-error', role: 'assistant', content: 'Failed to build the lesson plan for this page. Please refresh.' }]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLessonPlan();
    return () => controller.abort();
  }, [fileName, currentPage, initialLessonPlan, initialMessages.length, pagePlanEntry, persistLessonPlan, persistMessages, sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    persistMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          history: newMessages.slice(0, -1),
          lessonPlan,
          currentPage,
          pagePlanEntry,
          chapterId: sessionId,
        }),
      });

      if (!res.ok) throw new Error('API Error');

      const data = await res.json();
      
      if (data.mastery_achieved && !isPageUnlocked) {
        onMasteryAchieved();
      }

      if (data.message) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.message,
        };
        const updatedMsgs = [...newMessages, assistantMessage];
        setMessages(updatedMsgs);
        persistMessages(updatedMsgs);
      }

      // Track struggles from observer data
      if (data.observerData?.confusion_points?.length || data.observerData?.gaps?.length) {
        try {
          const topic = pagePlanEntry?.topics?.[0] || 'unknown';
          for (const point of (data.observerData.confusion_points || [])) {
            fetch('/api/tracking/struggle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chapterId: sessionId, topic, concept: point, struggleType: 'confusion_detected', severity: 2 }),
            });
          }
        } catch { /* fire and forget */ }
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      };
      const updatedMsgs = [...newMessages, errMsg];
      setMessages(updatedMsgs);
      persistMessages(updatedMsgs);
    } finally {
      setIsLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 10);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  // Quick doubt buttons
  const handleQuickDoubt = (doubt: string) => {
    setInput(doubt);
    setTimeout(() => {
      const form = textareaRef.current?.closest('form');
      if (form) form.requestSubmit();
    }, 50);
  };

  const diffColor = pagePlanEntry?.estimated_difficulty === 'hard' ? 'var(--error)' :
    pagePlanEntry?.estimated_difficulty === 'medium' ? 'var(--warning)' : 'var(--success)';

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      
      {/* Clean header */}
      <div className="flex-none px-5 py-3.5 border-b flex items-center justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: isPageUnlocked ? 'var(--success)' : diffColor, opacity: isPageUnlocked ? 1 : 0.7 }} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {pagePlanEntry?.topics?.[0] || `Page ${currentPage + 1}`}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isPageUnlocked ? 'Concept mastered' : pagePlanEntry?.estimated_difficulty ? `${pagePlanEntry.estimated_difficulty} difficulty` : 'In progress'}
            </p>
          </div>
        </div>
        {isPageUnlocked && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(64,145,108,0.1)', color: 'var(--success)' }}>
            ✓ Mastered
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">

        {displayTimeline.map((item, idx) => {
          if (item.type === 'separator') {
            return (
              <div key={`sep-${item.page}-${idx}`} className="flex items-center py-3 animate-fadeIn">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="px-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Page {item.page + 1}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
            );
          }

          if (!item.message) return null;
          const msg = item.message;
          const isUser = msg.role === 'user';
          
          return (
            <div key={msg.id} className={`flex w-full animate-slideUp ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] md:max-w-[78%]`}>
                <div className={`rounded-2xl px-5 py-4 ${isUser ? 'rounded-br-md' : 'rounded-bl-md'}`} style={{
                  background: isUser ? 'var(--accent)' : 'var(--bg-surface)',
                  color: isUser ? '#fff' : 'var(--text-primary)',
                  border: isUser ? 'none' : '1px solid var(--border)',
                  boxShadow: isUser ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                  {msg.id === 'system-loading' ? (
                    <div className="flex items-center gap-3 py-1">
                      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Preparing your lesson...</span>
                    </div>
                  ) : (
                    <div className={isUser ? 'text-sm leading-relaxed' : 'adoris-prose'}>
                      <MemoMarkdown content={msg.content} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Loading indicator */}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex w-full justify-start animate-fadeIn">
            <div className="rounded-2xl rounded-bl-md px-5 py-4 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--accent)', animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--accent)', animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--accent)', animationDelay: '300ms' }} />
                </div>
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Quick doubt buttons */}
      {lessonPlan?.suggestive_doubts && lessonPlan.suggestive_doubts.length > 0 && messages.length <= 2 && !isLoading && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          {lessonPlan.suggestive_doubts.slice(0, 3).map((doubt, i) => (
            <button key={i} onClick={() => handleQuickDoubt(doubt)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--accent)]"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              {doubt}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="flex-1 rounded-xl border overflow-hidden transition-colors focus-within:border-[var(--accent)]" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? 'Waiting for response...' : 'Ask a question or share your thoughts...'}
              disabled={isLoading}
              rows={1}
              className="w-full resize-none bg-transparent outline-none px-4 py-3 text-sm leading-relaxed"
              style={{ color: 'var(--text-primary)', minHeight: '44px', maxHeight: '160px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all"
            style={{
              background: input.trim() && !isLoading ? 'var(--accent)' : 'var(--bg-muted)',
              color: input.trim() && !isLoading ? '#fff' : 'var(--text-muted)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
            </svg>
          </button>
        </form>
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button onClick={() => scrollToBottom()}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 text-xs font-medium rounded-full shadow-lg transition-colors animate-fadeIn z-30"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
}
