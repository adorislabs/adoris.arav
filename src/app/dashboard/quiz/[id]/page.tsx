'use client';

import { useEffect, useState } from 'react';
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
  easy: 'bg-green-100 text-green-700 border-green-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  hard: 'bg-red-100 text-red-700 border-red-200',
};

const typeLabels: Record<string, string> = {
  mcq: 'Multiple Choice',
  true_false: 'True / False',
  fill_blank: 'Fill in the Blank',
};

export default function QuizPage({ params }: { params: { id: string } }) {
  const fileName = atob(decodeURIComponent(params.id));
  
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [fillAnswer, setFillAnswer] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { selected: number | null; correct: boolean; fillText?: string }>>({});

  useEffect(() => {
    async function fetchQuiz() {
      try {
        // Load chapter plan and lesson plans from localStorage
        const session = loadSession(fileName);
        
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
        }
      } catch (e) {
        console.error('Failed to generate quiz');
      } finally {
        setLoading(false);
      }
    }
    fetchQuiz();
  }, [fileName]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] bg-slate-50 p-8 space-y-4">
         <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
         <h2 className="text-xl font-semibold text-slate-700">Generating your Final Exam...</h2>
         <p className="text-slate-500 max-w-md text-center">
            Building a comprehensive 10-question exam covering every topic in {fileName}. This may take a moment.
         </p>
      </div>
    );
  }

  if (!quiz || quiz.questions.length === 0) {
    return <div className="p-8 text-center text-red-500">Error loading quiz.</div>;
  }

  // ─── Finished State ───────────────────────────────────────────────────
  if (finished) {
    const percentage = Math.round((score / quiz.questions.length) * 100);
    const passed = percentage >= 70;

    // Mark quiz as completed in session
    const session = loadSession(fileName);
    if (session && !session.quizCompleted) {
      session.quizCompleted = true;
      saveSession(session);
    }

    // Group results by topic
    const topicResults: Record<string, { correct: number; total: number }> = {};
    quiz.questions.forEach((q, idx) => {
      if (!topicResults[q.topic]) topicResults[q.topic] = { correct: 0, total: 0 };
      topicResults[q.topic].total++;
      if (answers[idx]?.correct) topicResults[q.topic].correct++;
    });

    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-slate-50 p-8 overflow-y-auto">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
           <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${passed ? 'bg-green-100 text-green-500' : 'bg-amber-100 text-amber-500'}`}>
              <span className="text-3xl">{passed ? '🏆' : '📚'}</span>
           </div>
           <h2 className="text-2xl font-bold text-slate-900 mb-1 text-center">
             {passed ? 'Chapter Mastered!' : 'Keep Studying!'}
           </h2>
           <p className="text-center text-slate-600 mb-6 font-medium text-lg">
             You scored <span className={`font-bold ${passed ? 'text-green-600' : 'text-amber-600'}`}>{score}/{quiz.questions.length}</span> ({percentage}%)
           </p>

           {/* Topic Breakdown */}
           <div className="border-t border-slate-200 pt-4 mb-6">
             <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Topic Breakdown</h3>
             <div className="space-y-2">
               {Object.entries(topicResults).map(([topic, result]) => (
                 <div key={topic} className="flex items-center justify-between text-sm">
                   <span className="text-slate-700 truncate mr-4">{topic}</span>
                   <span className={`font-semibold ${result.correct === result.total ? 'text-green-600' : result.correct === 0 ? 'text-red-500' : 'text-amber-600'}`}>
                     {result.correct}/{result.total}
                   </span>
                 </div>
               ))}
             </div>
           </div>

           <Link href="/dashboard" className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors text-center">
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
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50 py-8 px-4 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full">
        
        {/* Exam Header */}
        <div className="mb-6 text-center">
           <h1 className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-1">Final Chapter Exam</h1>
           <h2 className="text-2xl font-bold text-slate-900">{quiz.quiz_title || 'Chapter Assessment'}</h2>
           <p className="text-slate-500 mt-1 text-sm">Question {currentQ + 1} of {quiz.questions.length}</p>
        </div>

        {/* Full Progress Bar */}
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-6">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${((currentQ) / quiz.questions.length) * 100}%` }}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-6 relative overflow-hidden">
           
           {/* Question Meta Badges */}
           <div className="flex items-center gap-2 mb-5 flex-wrap">
             <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${difficultyColors[question.difficulty] || ''}`}>
               {question.difficulty?.toUpperCase()}
             </span>
             <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
               {typeLabels[question.question_type] || 'MCQ'}
             </span>
             <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
               📌 {question.topic}
             </span>
           </div>

           {/* Question Text */}
           <div className="prose prose-slate max-w-none mb-8 text-lg font-medium text-slate-800">
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
                 
                 let style = "border-slate-200 hover:border-blue-400 hover:bg-blue-50 bg-white text-slate-700";
                 if (showExplanation) {
                   if (isCorrect) style = "bg-green-50 border-green-500 text-green-800 ring-1 ring-green-500";
                   else if (isSelected && !isCorrect) style = "bg-red-50 border-red-500 text-red-800";
                   else style = "bg-slate-50 border-slate-200 text-slate-400 opacity-50";
                 } else if (isSelected) {
                   style = "bg-blue-50 border-blue-500 ring-1 ring-blue-500";
                 }

                 return (
                   <button
                     key={idx}
                     onClick={() => handleSelect(idx)}
                     disabled={showExplanation}
                     className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 ${style}`}
                   >
                     <div className="flex items-start">
                       <span className="shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center mr-4 mt-0.5 text-sm font-bold border-current opacity-70">
                         {String.fromCharCode(65 + idx)}
                       </span>
                       <div className="prose prose-sm max-w-none text-current">
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
                 className="flex-1 rounded-xl border-2 border-slate-200 px-5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all bg-white"
                 onKeyDown={(e) => e.key === 'Enter' && handleFillSubmit()}
               />
               <button
                 onClick={handleFillSubmit}
                 disabled={!fillAnswer.trim()}
                 className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
               >
                 Submit
               </button>
             </div>
           )}

           {isFillinBlank && showExplanation && (
             <div className={`p-4 rounded-xl mb-4 ${answers[currentQ]?.correct ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
               <p className="text-sm font-medium">
                 Your answer: <span className="font-bold">{answers[currentQ]?.fillText}</span>
               </p>
               {!answers[currentQ]?.correct && (
                 <p className="text-sm mt-1">
                   Correct answer: <span className="font-bold text-green-700">{question.correct_answer}</span>
                 </p>
               )}
             </div>
           )}

           {/* Explanation */}
           {showExplanation && (
             <div className={`mt-6 p-6 rounded-xl animate-in fade-in slide-in-from-top-4 ${
               (isFillinBlank ? answers[currentQ]?.correct : selectedOption === question.correct_index) 
                 ? 'bg-green-50' : 'bg-red-50'
             }`}>
               <div className="flex items-center mb-2">
                 {(isFillinBlank ? answers[currentQ]?.correct : selectedOption === question.correct_index)
                   ? <span className="text-green-600 font-bold">✅ Correct</span>
                   : <span className="text-red-600 font-bold">❌ Incorrect</span>
                 }
               </div>
               <div className="prose prose-sm max-w-none text-slate-700">
                 <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                   {question.explanation}
                 </ReactMarkdown>
               </div>
               <div className="mt-6 flex justify-end">
                  <button 
                    onClick={handleNext}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors shadow-sm"
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
