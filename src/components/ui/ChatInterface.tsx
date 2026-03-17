'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type { Message, LessonPlan, PagePlanEntry, SessionState } from '@/lib/session/sessionStore';

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileName, currentPage]);

  const handleSendQuery = async (userMessage: string) => {
    if (!userMessage.trim() || isLoading) return;

    setInput('');
    setIsLoading(true);

    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: 'user', content: userMessage },
    ];
    setMessages(newMessages);

    // DEV HACK to manually unlock visually
    if (userMessage.toUpperCase() === 'UNLOCK') {
      onMasteryAchieved();
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
      
      // Handle programmatic backend unlocking
      if (aiText.includes('ACHIEVED_MASTERY')) {
        const cleanedText = aiText.replace('ACHIEVED_MASTERY', '').trim();
        const finalMsgs: Message[] = [
          ...newMessages,
          { id: (Date.now() + 1).toString(), role: 'assistant', content: cleanedText || "Excellent! You've mastered this concept. Unlocking next page..." },
        ];
        setMessages(finalMsgs);
        persistMessages(finalMsgs);
        
        setTimeout(() => {
          onMasteryAchieved();
        }, 1500);
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
            <div key={`${item.page}-${m.id}-${idx}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`px-0 py-0 max-w-[90%] shadow-sm ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm self-end px-4 py-3'
                    : 'border-0 rounded-2xl rounded-tl-sm self-start'
                }`}
                style={m.role === 'user' ? {} : { background: 'transparent', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              >
                {m.role === 'user' ? (
                  <div className="prose prose-sm max-w-none text-white">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {m.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none text-slate-200 bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 space-y-2">
                    <style>{`
                      .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 {
                        color: #e2e8f0;
                        font-weight: 700;
                        margin-top: 1.25em;
                        margin-bottom: 0.4em;
                      }
                      .prose h1 {
                        font-size: 1.5rem;
                        border-bottom: 2px solid rgba(148, 163, 184, 0.3);
                        padding-bottom: 0.4em;
                      }
                      .prose h2 {
                        font-size: 1.25rem;
                        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
                        padding-bottom: 0.25em;
                      }
                      .prose h3 {
                        font-size: 1.1rem;
                        color: #94a3b8;
                      }
                      .prose ul, .prose ol {
                        padding-left: 1.5em;
                        margin-bottom: 0.5em;
                      }
                      .prose li {
                        margin-bottom: 0.3em;
                      }
                      .prose strong {
                        color: #f1f5f9;
                        font-weight: 600;
                      }
                      .prose em {
                        color: #cbd5e1;
                        font-style: italic;
                      }
                      .prose code {
                        background: rgba(15, 23, 42, 0.5);
                        color: #fbbf24;
                        padding: 0.2em 0.4em;
                        border-radius: 0.25em;
                        font-size: 0.9em;
                      }
                      .prose blockquote {
                        border-left: 3px solid rgba(96, 165, 250, 0.5);
                        padding-left: 1em;
                        margin-left: 0;
                        color: #cbd5e1;
                        font-style: italic;
                        margin-bottom: 0.5em;
                      }
                      .prose table {
                        border-collapse: collapse;
                        width: 100%;
                        margin: 0.75em 0;
                      }
                      .prose th, .prose td {
                        border: 1px solid rgba(148, 163, 184, 0.2);
                        padding: 0.5em;
                        text-align: left;
                        font-size: 0.9em;
                      }
                      .prose th {
                        background: rgba(15, 23, 42, 0.5);
                        color: #f1f5f9;
                        font-weight: 600;
                      }
                      .prose hr {
                        border: none;
                        border-top: 2px dashed rgba(148, 163, 184, 0.3);
                        margin: 1em 0;
                      }
                      .prose p {
                        line-height: 1.5;
                        margin-bottom: 0.5em;
                      }
                    `}</style>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {m.content}
                    </ReactMarkdown>
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
