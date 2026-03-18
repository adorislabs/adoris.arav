'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Message, LessonPlan, PagePlanEntry, SessionState, ObserverState } from '@/lib/session/sessionStore';

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayTimeline]);

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
  }, [fileName, currentPage, initialLessonPlan, initialMessages.length, pagePlanEntry, persistLessonPlan, persistMessages, sessionId]);

  const handleSendQuery = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    setInput('');
    setIsLoading(true);

    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    // DEV HACK to manually unlock visually and persist it
    if (userMessage.toUpperCase() === 'UNLOCK') {
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
        }),
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
    }
  };

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

  // Manim Visual Hook Renderer
  const renderMessageContent = (content: string) => {
    const parts = content.split(/\[MANIM:(.*?)\]/g);
    if (parts.length === 1) {
      return <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>;
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
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Interactive render pending</span>
            </div>
            <div className="p-6 flex flex-col items-center justify-center min-h-[140px] text-center">
              <div className="text-slate-500 mb-2">
                <svg className="w-8 h-8 mx-auto opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <p className="text-sm font-medium text-slate-400 italic">"{part.trim()}"</p>
            </div>
          </div>
        );
      }
      return <ReactMarkdown key={i} remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{part}</ReactMarkdown>;
    });
  };

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
            className="flex-1 overflow-y-auto p-4 pb-48 space-y-4"
            style={{ background: 'var(--bg-base)' }}>
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
                  <div className="prose max-w-none w-full tracking-normal">
                    <style>{`
                      .prose {
                        color: #D1D5DB; /* light slate */
                        max-width: none;
                        font-size: 0.95rem;
                        line-height: 1.75;
                      }
                      .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
                        color: #FFFFFF;
                        font-weight: 600;
                        margin-top: 1.5em;
                        margin-bottom: 0.75em;
                        letter-spacing: -0.01em;
                      }
                      .prose h1 { font-size: 1.5rem; }
                      .prose h2 { font-size: 1.25rem; }
                      .prose h3 { font-size: 1.125rem; }
                      .prose p {
                        margin-top: 0.75em;
                        margin-bottom: 0.75em;
                      }
                      .prose ul, .prose ol {
                        padding-left: 1.5em;
                        margin-bottom: 1em;
                      }
                      .prose li {
                        margin-bottom: 0.3em;
                      }
                      .prose li::marker {
                        color: #6B7280;
                      }
                      .prose strong {
                        color: #F3F4F6;
                        font-weight: 600;
                      }
                      .prose code {
                        background: rgba(31, 41, 55, 0.6);
                        color: #A78BFA; /* Turbo purple tint */
                        padding: 0.2em 0.4em;
                        border-radius: 4px;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                        font-size: 0.85em;
                        border: 1px solid rgba(255,255,255,0.05);
                      }
                      .prose pre {
                        background: #111827; /* Darker bg for code blocks */
                        color: #E5E7EB;
                        padding: 1.25em;
                        border-radius: 8px;
                        overflow-x: auto;
                        border: 1px solid rgba(255,255,255,0.05);
                        margin: 1.5em 0;
                        box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.2);
                      }
                      .prose pre code {
                        background: transparent;
                        color: inherit;
                        padding: 0;
                        border: none;
                        font-size: 0.9em;
                      }
                      .prose blockquote {
                        border-left: 3px solid #6366F1;
                        padding-left: 1.25rem;
                        color: #9CA3AF;
                        font-style: italic;
                        margin: 1.5em 0;
                        background: linear-gradient(to right, rgba(99, 102, 241, 0.08), transparent);
                        padding-top: 0.75em;
                        padding-bottom: 0.75em;
                        border-radius: 0 8px 8px 0;
                      }
                      .prose table {
                        width: 100%;
                        border-collapse: separate;
                        border-spacing: 0;
                        margin: 1.5em 0;
                        border: 1px solid rgba(255,255,255,0.1);
                        border-radius: 8px;
                        overflow: hidden;
                      }
                      .prose th, .prose td {
                        padding: 0.75em 1.25em;
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                        text-align: left;
                        font-size: 0.9em;
                      }
                      .prose th {
                        background: rgba(255,255,255,0.03);
                        font-weight: 600;
                        color: #F9FAFB;
                      }
                      .prose tr:last-child td {
                        border-bottom: none;
                      }
                    `}</style>
                    {renderMessageContent(m.content)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {isLoading && (
          <div className="flex justify-start">
             <div className="p-4 border-t flex gap-2 items-center rounded-2xl p-4 shadow-sm rounded-tl-none flex space-x-1" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
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
            className="w-full max-w-4xl mx-auto mb-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-3 font-semibold shadow-md transition-all flex items-center justify-center gap-2 animate-fade-in"
          >
            Mastery Achieved! Click to Continue ➔
          </button>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto w-full">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={!lessonPlan ? 'Building lesson plan...' : 'Discuss or answer directly...'}
              className="w-full text-left p-3 rounded-xl border text-sm transition-all text-slate-300 hover:text-white"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || !lessonPlan}
            className="bg-blue-600 text-white px-6 py-3 rounded-full font-medium shadow-md hover:bg-blue-700 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95 flex items-center justify-center min-w-[100px]"
          >
            {isLoading ? 'Thinking' : 'Send'}
          </button>
        </form>
        
        {/* DEV Bypass hidden: type UNLOCK manually to trigger it instead of showing the hint */}
      </div>
    </div>
  );
}
