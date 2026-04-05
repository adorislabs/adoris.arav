'use client';

import { use, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { loadSession, saveSession } from '@/lib/session/sessionStore';

interface Question {
  question_number: number;
  question_type: 'mcq' | 'true_false' | 'fill_blank';
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  question_text: string;
  options: string[];
  correct_index: number;
  correct_answer?: string;
  explanation: string;
}

interface Quiz {
  quiz_title: string;
  total_questions: number;
  questions: Question[];
}

const difficultyColors: Record<string, string> = {
  easy: 'bg-green-900/40 text-green-400 border-green-800/50',
  medium: 'bg-amber-900/40 text-amber-400 border-amber-800/50',
  hard: 'bg-red-900/40 text-red-400 border-red-800/50',
};

const typeLabels: Record<string, string> = {
  mcq: 'Multiple Choice',
  true_false: 'True / False',
  fill_blank: 'Fill in the Blank',
};

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  const [fileName, setFileName] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [fillAnswer, setFillAnswer] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { selected: number | null; correct: boolean; fillText?: string }>>({});

  // Fetch chapter name from ID
  useEffect(() => {
    async function fetchName() {
      try {
        const res = await fetch(`/api/chapters/${id}/details`);
        const data = await res.json();
        if (data.success && data.fileName) setFileName(data.fileName);
        else setFileName(atob(decodeURIComponent(id)));
      } catch {
        try { setFileName(atob(decodeURIComponent(id))); } catch { setFileName('Unknown'); }
      }
    }
    fetchName();
  }, [id]);

  // Mark quiz completed when finished (side-effect, must NOT run during render)
  useEffect(() => {
    if (!finished) return;
    const session = loadSession(id);
    if (session && !session.quizCompleted) {
      saveSession({ ...session, quizCompleted: true });
    }
  }, [finished, id]);

  useEffect(() => {
    if (!fileName) return;
    async function fetchQuiz() {
      try {
        const session = loadSession(id);

        // Use cached quiz if available — avoids a 10-15s LLM call on every visit
        if (session?.generatedQuiz) {
          setQuiz(session.generatedQuiz as Quiz);
          setLoading(false);
          return;
        }

        const res = await fetch('/api/pdfs/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName,
            chapterPlan: session?.chapterPlan || null,
            lessonPlans: session?.lessonPlans || {},
            summaryData: session ? `Student completed ${Object.values(session.masteryStatus).filter(s => s === 'mastered').length} of ${session.totalPages} pages.` : 'No session data.'
          })
        });
        const data = await res.json();
        if (data.success && data.quiz) {
          setQuiz(data.quiz);
          // Cache the quiz so revisiting this page is instant
          const latestSession = loadSession(id);
          if (latestSession) saveSession({ ...latestSession, generatedQuiz: data.quiz });
        }
      } catch (e) {
        console.error('Failed to generate quiz');
      } finally {
        setLoading(false);
      }
    }
    fetchQuiz();
  }, [fileName, id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Generating your Final Exam...</h2>
        <p className="max-w-md text-center" style={{ color: 'var(--text-secondary)' }}>
          Building a comprehensive 10-question exam covering every topic. This may take a moment.
        </p>
      </div>
    );
  }

  if (!quiz || quiz.questions.length === 0) {
    return <div className="p-8 text-center" style={{ background: 'var(--bg-base)', color: 'var(--error)' }}>Error loading quiz. <Link href="/dashboard" style={{ color: 'var(--accent)' }}>Return to dashboard</Link></div>;
  }

  // ─── Finished State ───────────────────────────────────────────────────
  if (finished) {
    const percentage = Math.round((score / quiz.questions.length) * 100);
    const passed = percentage >= 70;

    // Group results by topic
    const topicResults: Record<string, { correct: number; total: number }> = {};
    quiz.questions.forEach((q, idx) => {
      if (!topicResults[q.topic]) topicResults[q.topic] = { correct: 0, total: 0 };
      topicResults[q.topic].total++;
      if (answers[idx]?.correct) topicResults[q.topic].correct++;
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-lg w-full rounded-2xl shadow-xl p-8 border" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
           <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: passed ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
              <span className="text-3xl">{passed ? '🏆' : '📚'}</span>
           </div>
           <h2 className="text-2xl font-bold mb-1 text-center" style={{ color: 'var(--text-primary)' }}>
             {passed ? 'Chapter Mastered!' : 'Keep Studying!'}
           </h2>
           <p className="text-center mb-6 font-medium text-lg" style={{ color: 'var(--text-secondary)' }}>
             You scored <span className="font-bold" style={{ color: passed ? 'var(--success)' : 'var(--warning)' }}>{score}/{quiz.questions.length}</span> ({percentage}%)
           </p>

           <div className="border-t pt-4 mb-6" style={{ borderColor: 'var(--border)' }}>
             <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Topic Breakdown</h3>
             <div className="space-y-2">
               {Object.entries(topicResults).map(([topic, result]) => (
                 <div key={topic} className="flex items-center justify-between text-sm">
                   <span className="truncate mr-4" style={{ color: 'var(--text-secondary)' }}>{topic}</span>
                   <span className="font-semibold" style={{ color: result.correct === result.total ? 'var(--success)' : result.correct === 0 ? 'var(--error)' : 'var(--warning)' }}>
                     {result.correct}/{result.total}
                   </span>
                 </div>
               ))}
             </div>
           </div>

           <Link href="/dashboard" className="block w-full py-3 rounded-lg font-semibold transition-colors text-center" style={{ background: 'var(--accent)', color: '#0c0c0e' }}>
              Return to Dashboard
           </Link>
        </div>
      </div>
    );
  }

  // ─── Active Quiz ──────────────────────────────────────────────────────
  const question = quiz.questions[currentQ];
  const isFillinBlank = question.question_type === 'fill_blank';

  const handleSelect = (idx: number) => {
    if (showExplanation) return;
    setSelectedOption(idx);
    setShowExplanation(true);
    const isCorrect = idx === question.correct_index;
    if (isCorrect) setScore((s) => s + 1);
    setAnswers(prev => ({ ...prev, [currentQ]: { selected: idx, correct: isCorrect } }));
  };

  const handleFillSubmit = () => {
    if (showExplanation || !fillAnswer.trim()) return;
    setShowExplanation(true);
    const isCorrect = fillAnswer.trim().toLowerCase() === (question.correct_answer || '').trim().toLowerCase();
    if (isCorrect) setScore((s) => s + 1);
    setAnswers(prev => ({ ...prev, [currentQ]: { selected: null, correct: isCorrect, fillText: fillAnswer } }));
  };

  const handleNext = () => {
    setSelectedOption(null);
    setFillAnswer('');
    setShowExplanation(false);
    if (currentQ + 1 < quiz.questions.length) {
      setCurrentQ((q) => q + 1);
    } else {
      setFinished(true);
    }
  };

  return (
    <div className="flex flex-col h-full py-8 px-4 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-3xl mx-auto w-full">
        
        {/* Exam Header */}
        <div className="mb-6 text-center">
           <h1 className="text-sm font-semibold tracking-wider uppercase mb-1" style={{ color: 'var(--accent)' }}>Final Chapter Exam</h1>
           <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{quiz.quiz_title || 'Chapter Assessment'}</h2>
           <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Question {currentQ + 1} of {quiz.questions.length}</p>
        </div>

        {/* Full Progress Bar */}
        <div className="w-full h-2 rounded-full overflow-hidden mb-6" style={{ background: 'var(--bg-muted)' }}>
          <div 
            className="h-full transition-all duration-500"
            style={{ width: `${((currentQ) / quiz.questions.length) * 100}%`, background: 'var(--accent)' }}
          />
        </div>

        <div className="rounded-2xl shadow-sm border p-8 mb-6 relative overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
           
           {/* Question Meta Badges */}
           <div className="flex items-center gap-2 mb-5 flex-wrap">
             <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${difficultyColors[question.difficulty] || ''}`}>
               {question.difficulty?.toUpperCase()}
             </span>
             <span className="text-xs font-medium px-2.5 py-1 rounded-full border" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
               {typeLabels[question.question_type] || 'MCQ'}
             </span>
             <span className="text-xs px-2.5 py-1 rounded-full border" style={{ background: 'var(--accent-muted)', color: 'var(--accent)', borderColor: 'rgba(240,165,0,0.2)' }}>
               📌 {question.topic}
             </span>
           </div>

           {/* Question Text */}
           <div className="prose max-w-none mb-8 text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
             <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
               {question.question_text}
             </ReactMarkdown>
           </div>

           {/* Options (MCQ / True-False) */}
           {!isFillinBlank && (
             <div className="space-y-3">
               {question.options.map((opt, idx) => {
                 const isSelected = selectedOption === idx;
                 const isCorrect = idx === question.correct_index;
                 
                 let optStyle: React.CSSProperties = { background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' };
                 if (showExplanation) {
                   if (isCorrect) optStyle = { background: 'rgba(34,197,94,0.1)', borderColor: '#22c55e', color: '#86efac' };
                   else if (isSelected && !isCorrect) optStyle = { background: 'rgba(239,68,68,0.1)', borderColor: '#ef4444', color: '#fca5a5' };
                   else optStyle = { background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)', opacity: 0.5 };
                 } else if (isSelected) {
                   optStyle = { background: 'rgba(240,165,0,0.1)', borderColor: 'var(--accent)', color: 'var(--text-primary)' };
                 }

                 return (
                   <button
                     key={idx}
                     onClick={() => handleSelect(idx)}
                     disabled={showExplanation}
                     className="w-full text-left p-4 rounded-xl border-2 transition-all duration-200"
                     style={optStyle}
                   >
                     <div className="flex items-start">
                       <span className="shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center mr-4 mt-0.5 text-sm font-bold" style={{ borderColor: 'currentColor', opacity: 0.7 }}>
                         {String.fromCharCode(65 + idx)}
                       </span>
                       <div className="prose prose-sm max-w-none" style={{ color: 'inherit' }}>
                         <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                           {opt}
                         </ReactMarkdown>
                       </div>
                     </div>
                   </button>
                 );
               })}
             </div>
           )}

           {/* Fill in the Blank */}
           {isFillinBlank && !showExplanation && (
             <div className="flex gap-3">
               <input
                 type="text"
                 value={fillAnswer}
                 onChange={(e) => setFillAnswer(e.target.value)}
                 placeholder="Type your answer..."
                 className="flex-1 rounded-xl border-2 px-5 py-3 text-base focus:outline-none transition-all"
                 style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                 onKeyDown={(e) => e.key === 'Enter' && handleFillSubmit()}
               />
               <button
                 onClick={handleFillSubmit}
                 disabled={!fillAnswer.trim()}
                 className="px-6 py-3 rounded-xl font-medium disabled:opacity-50 transition-colors"
                 style={{ background: 'var(--accent)', color: '#0c0c0e' }}
               >
                 Submit
               </button>
             </div>
           )}

           {isFillinBlank && showExplanation && (
             <div className="p-4 rounded-xl mb-4 border" style={{ background: answers[currentQ]?.correct ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderColor: answers[currentQ]?.correct ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }}>
               <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                 Your answer: <span className="font-bold">{answers[currentQ]?.fillText}</span>
               </p>
               {!answers[currentQ]?.correct && (
                 <p className="text-sm mt-1">
                   Correct answer: <span className="font-bold" style={{ color: 'var(--success)' }}>{question.correct_answer}</span>
                 </p>
               )}
             </div>
           )}

           {showExplanation && (
             <div className="mt-6 p-6 rounded-xl border" style={{ 
               background: (isFillinBlank ? answers[currentQ]?.correct : selectedOption === question.correct_index) ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
               borderColor: (isFillinBlank ? answers[currentQ]?.correct : selectedOption === question.correct_index) ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
             }}>
               <div className="flex items-center mb-2">
                 {(isFillinBlank ? answers[currentQ]?.correct : selectedOption === question.correct_index)
                   ? <span className="font-bold" style={{ color: 'var(--success)' }}>✅ Correct</span>
                   : <span className="font-bold" style={{ color: 'var(--error)' }}>❌ Incorrect</span>
                 }
               </div>
               <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)' }}>
                 <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                   {question.explanation}
                 </ReactMarkdown>
               </div>
               <div className="mt-6 flex justify-end">
                  <button 
                    onClick={handleNext}
                    className="px-6 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                    style={{ background: 'var(--accent)', color: '#0c0c0e' }}
                  >
                    {currentQ + 1 < quiz.questions.length ? "Next Question →" : "Finish Exam"}
                  </button>
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
