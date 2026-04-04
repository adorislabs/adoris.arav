const fs = require('fs');

const code = `
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
  const initialMessages = sessionState.chatHistories[currentPage] || [];
  const initialLessonPlan = sessionState.lessonPlans[currentPage] || null;

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lessonPlan, setLessonPlan] = useState<LessonPlan | null>(initialLessonPlan);
  const [topicsChecked, setTopicsChecked] = useState<Record<string, boolean>>({});
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
            content: \`\${explanation}\\n\\n**Question:** \${question}\`,
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
    } catch (error) {
      console.error('Chat error:', error);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'System error. Unable to process transmission.',
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

  return (
    <div className="flex flex-col h-full w-full bg-base font-mono relative overflow-hidden">
      <div className="flex-none p-4 border-b border-dim bg-surface glass-panel flex flex-col z-10 tech-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-none bg-accent animate-glow"></div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-primary truncate max-w-[200px] md:max-w-md">
              Target: <span className="text-accent">{fileName}</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase text-dim">Mode: Active Tutor</span>
          </div>
        </div>

        {lessonPlan && (
          <div className="mt-2 text-xs flex gap-4 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap pt-1">
            <div className="flex items-center gap-1 border border-dim px-2 py-1">
              <span className="text-dim">Status:</span> 
              <span className={isPageUnlocked ? "text-success font-bold" : "text-warning text-[10px] animate-pulse"}>
                {isPageUnlocked ? "UNLOCKED" : "LOCKED"}
              </span>
            </div>
            {lessonPlan.topic_importance && (
              <div className="flex items-center gap-1 border border-dim px-2 py-1">
                <span className="text-dim">Priority:</span> 
                <span className="text-accent">{lessonPlan.topic_importance}</span>
              </div>
            )}
            {lessonPlan.learning_objectives?.map((obj, i) => {
              const isChecked = topicsChecked[i] || isPageUnlocked;
              return (
                <div key={i} className="flex items-center gap-2 border border-dim px-2 py-1 bg-elevated">
                  <span className={isChecked ? "text-success" : "text-dim"}>
                     {isChecked ? "[X]" : "[ ]"}
                  </span>
                  <span className={isChecked ? "text-success" : "text-text-primary"}>{obj}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 relative"
      >
        <div className="fixed inset-0 pointer-events-none opacity-5 z-0" 
          style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px', mixBlendMode: 'overlay' }}>
        </div>

        {displayTimeline.map((item, idx) => {
          if (item.type === 'separator') {
            return (
              <div key={\`sep-\${item.page}-\${idx}\`} className="flex items-center pt-8 pb-4 relative z-10 w-full animate-fadeIn" style={{ animationDelay: '0.1s' }}>
                <div className="flex-1 h-[1px] bg-dim opacity-30"></div>
                <div className="px-4 py-1 border border-dim bg-bg-surface text-[10px] uppercase font-bold text-accent glass-panel tracking-widest shadow-[0_0_10px_var(--accent-muted)]">
                  [ System.Page_{item.page + 1}.Initialized ]
                </div>
                <div className="flex-1 h-[1px] bg-dim opacity-30"></div>
              </div>
            );
          }

          if (!item.message) return null;
          const msg = item.message;
          const isUser = msg.role === 'user';
          
          return (
            <div key={msg.id} className={\`flex w-full animate-slideUp relative z-10 \${isUser ? 'justify-end' : 'justify-start'}\`}>
              <div className={\`flex max-w-[90%] md:max-w-[80%] flex-col \${isUser ? 'items-end' : 'items-start'}\`}>

                <div className="text-[10px] md:text-xs uppercase font-mono text-dim mb-1 tracking-wider flex items-center gap-2">
                  {isUser ? (
                    <><span>You</span> <div className="w-[1px] h-3 bg-dim"></div> <span className="text-text-muted">TX</span></>
                  ) : (
                    <><span className="text-accent font-bold glow-text">Tutor</span> <div className="w-[1px] h-3 bg-dim"></div> <span className="text-text-muted">RX</span></>
                  )}
                </div>

                <div className={\`p-4 tech-border \${
                  isUser 
                    ? 'border-r-2 border-r-success bg-surface/80 text-primary self-end backdrop-blur-md' 
                    : 'border-l-2 border-l-accent glass-panel text-primary shadow-[0_4px_24px_var(--accent-muted)]'
                }\`}>
                  {msg.id === 'system-loading' ? (
                     <div className="text-accent font-mono text-sm py-2">
                       Processing Page Data...
                     </div>
                  ) : (
                    <div className="adoris-prose">
                      <MemoMarkdown content={msg.content} />
                    </div>
                  )}
                </div>

              </div>
            </div>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex w-full justify-start animate-fadeIn pt-4 relative z-10">
            <div className="max-w-[80%] flex flex-col items-start">
              <div className="text-[10px] uppercase text-dim mb-1 tracking-wider font-mono">
                 <span className="text-accent font-bold">Tutor</span> : Processing
              </div>
              <div className="p-4 tech-border border-l-2 border-l-accent glass-panel w-32 shadow-[0_4px_24px_var(--accent-muted)]">
                 <div className="text-dim text-xs font-mono animate-pulse">Computing...</div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-1" />
      </div>

      <div className="p-4 border-t border-dim bg-surface relative z-20 tech-border shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.8)]">
        <form onSubmit={handleSubmit} className="glass-panel tech-border max-w-4xl mx-auto flex flex-col group focus-within:border-accent transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLoading ? 'WAITING FOR OP...' : 'ENTER QUERY...'}
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none p-4 text-primary placeholder-text-muted font-mono leading-relaxed"
            style={{ minHeight: '60px', maxHeight: '200px' }}
          />
          <div className="flex justify-between items-center p-2 border-t border-dim/50 bg-black/20">
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-widest text-dim px-2">
               <span>[Shift+Enter] newLine</span>
               <div className="w-1 h-1 bg-dim"></div>
               <span className={input.length > 0 ? "text-accent transition-colors block md:inline" : "hidden md:inline"}>
                 Len: {input.length}
               </span>
            </div>
            
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={\`px-6 py-2 text-[10px] uppercase font-bold tracking-widest tech-border transition-all flex items-center gap-2 \${
                input.trim() && !isLoading
                  ? 'bg-accent/10 text-accent border-accent hover:bg-accent hover:text-black shadow-[0_0_15px_var(--accent-muted)]'
                  : 'bg-transparent text-dim border-dim cursor-not-allowed'
              }\`}
            >
              Execute
              <div className={\`w-1.5 h-1.5 rounded-none \${input.trim() && !isLoading ? 'bg-accent group-hover:bg-black animate-pulse' : 'bg-dim'}\`}></div>
            </button>
          </div>
        </form>
      </div>

      {showScrollBtn && (
         <button
         onClick={() => scrollToBottom()}
         className="absolute bottom-28 left-1/2 -translate-x-1/2 px-4 py-2 text-[10px] uppercase tech-border glass-panel text-accent border-accent hover:bg-accent/10 transition-colors animate-fadeIn shadow-[0_0_20px_var(--bg-base)] z-30 tracking-widest font-mono"
       >
         [ Scroll To Present ]
       </button>
      )}
    </div>
  );
}
`;

fs.writeFileSync('src/components/ui/ChatInterface.tsx', code);
console.log('ChatInterface successfully updated');
