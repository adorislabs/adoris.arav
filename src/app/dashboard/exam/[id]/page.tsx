'use client';

import { use, useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { loadSession } from '@/lib/session/sessionStore';
import type { Exam, ExamQuestion, ExamSection } from '@/lib/llm/examGenerator';

type AnswerState = Record<number, { selected?: number; text?: string; answered: boolean }>;

export default function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [fileName, setFileName] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [activeQ, setActiveQ] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60 * 60); // 60 minutes in seconds
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Fetch Filename ───────────────────────────────────────────────────
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

  // ─── Fetch Exam ───────────────────────────────────────────────────────
  const fetchExam = useCallback(async () => {
    if (!fileName) return;
    setLoading(true);
    try {
      const session = loadSession(fileName!);
      const res = await fetch('/api/pdfs/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          chapterPlan: session?.chapterPlan || null,
          lessonPlans: session?.lessonPlans || {},
        }),
      });
      const data = await res.json();
      if (data.success && data.exam) {
        setExam(data.exam);
        setTimeLeft((data.exam.time_limit_minutes || 60) * 60);
      } else {
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (e) {
      console.error('Failed to generate exam', e);
    } finally {
      setLoading(false);
    }
  }, [fileName]);

  useEffect(() => {
    fetchExam();
  }, [fetchExam]);

  // ─── Countdown Timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (!exam || submitted) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setSubmitted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [exam, submitted]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ─── Flatten all questions with global numbering ──────────────────────
  const allQuestions: (ExamQuestion & { sectionIdx: number })[] = [];
  exam?.sections.forEach((sec, sIdx) => {
    sec.questions.forEach((q) => {
      allQuestions.push({ ...q, sectionIdx: sIdx });
    });
  });

  const currentSection = exam?.sections[activeSection];
  const currentQ = currentSection?.questions[activeQ];
  const globalIndex = Array.isArray(exam?.sections)
    ? exam.sections.slice(0, activeSection).reduce((sum, s) => sum + s.questions.length, 0) + activeQ
    : activeQ;

  // ─── Answer Handling ──────────────────────────────────────────────────
  const handleSelect = (optIdx: number) => {
    if (submitted) return;
    setAnswers((prev) => ({
      ...prev,
      [globalIndex]: { selected: optIdx, answered: true },
    }));
  };

  const handleTextAnswer = (text: string) => {
    if (submitted) return;
    setAnswers((prev) => ({
      ...prev,
      [globalIndex]: { text, answered: text.trim().length > 0 },
    }));
  };

  // ─── Navigation ───────────────────────────────────────────────────────
  const goToQuestion = useCallback((sectionIdx: number, qIdx: number) => {
    setActiveSection(sectionIdx);
    setActiveQ(qIdx);
  }, []);

  const goNext = () => {
    if (!currentSection) return;
    if (activeQ + 1 < currentSection.questions.length) {
      setActiveQ(activeQ + 1);
    } else if (exam && activeSection + 1 < exam.sections.length) {
      setActiveSection(activeSection + 1);
      setActiveQ(0);
    }
  };

  const goPrev = () => {
    if (activeQ > 0) {
      setActiveQ(activeQ - 1);
    } else if (activeSection > 0) {
      const prevSection = exam!.sections[activeSection - 1];
      setActiveSection(activeSection - 1);
      setActiveQ(prevSection.questions.length - 1);
    }
  };

  // ─── Score Calculation ────────────────────────────────────────────────
  const calculateScore = (): { earned: number; total: number; perSection: { name: string; earned: number; total: number }[] } => {
    let earned = 0;
    const total = exam?.total_marks || 50;
    const perSection: { name: string; earned: number; total: number }[] = [];

    let qIdx = 0;
    exam?.sections.forEach((sec) => {
      let secEarned = 0;
      const secTotal = sec.marks_per_question * sec.questions.length;
      sec.questions.forEach((q) => {
        const ans = answers[qIdx];
        if (ans?.answered) {
          if (q.type === 'mcq' || q.type === 'true_false') {
            if (ans.selected === q.correct_index) {
              secEarned += q.marks;
              earned += q.marks;
            }
          }
          // Text-based answers can't be auto-graded — count as attempted
        }
        qIdx++;
      });
      perSection.push({ name: sec.section_name, earned: secEarned, total: secTotal });
    });

    return { earned, total, perSection };
  };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] bg-slate-50 p-8 space-y-4">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <h2 className="text-xl font-semibold text-slate-700">Generating your 50-Mark Exam...</h2>
        <p className="text-slate-500 max-w-md text-center">
          Building a comprehensive exam with 23 questions across 4 sections. This may take 15-20 seconds.
        </p>
      </div>
    );
  }

  if (!exam || !exam.sections || exam.sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-slate-50 p-8 space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-900">Exam Generation Failed</h2>
        <p className="text-slate-500 text-center max-w-md">
          Something went wrong while preparing your exam. This can happen if the AI model times out or the session state is corrupted.
        </p>
        <div className="flex gap-4">
          <button
            onClick={fetchExam}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all shadow-sm"
          >
            Retry Generation
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium transition-all"
          >
            Go Back
          </Link>
        </div>
      </div>
    );
  }

  // ─── Results Screen ───────────────────────────────────────────────────
  if (submitted && showAnswerKey) {
    const result = calculateScore();
    const pct = Math.round((result.earned / result.total) * 100);

    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] bg-slate-50 p-8 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-200 mb-6">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${pct >= 70 ? 'bg-green-100' : 'bg-amber-100'}`}>
              <span className="text-2xl">{pct >= 70 ? '🏆' : '📚'}</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 text-center mb-1">Exam Complete</h2>
            <p className="text-center text-lg font-medium text-slate-600 mb-6">
              MCQ Score: <span className={`font-bold ${pct >= 70 ? 'text-green-600' : 'text-amber-600'}`}>{result.earned}/{result.total}</span>
            </p>

            <div className="space-y-2 mb-6">
              {result.perSection.map((sec, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                  <span className="text-slate-600">{sec.name}</span>
                  <span className="font-semibold text-slate-800">{sec.earned}/{sec.total}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400 text-center mb-4">
              Note: Only MCQ and True/False questions are auto-graded. Review answer keys below for written answers.
            </p>
          </div>

          {/* Answer Key for All Questions */}
          <h3 className="text-lg font-bold text-slate-800 mb-4">📝 Complete Answer Key</h3>
          {exam.sections.map((sec, sIdx) => (
            <div key={sIdx} className="mb-6">
              <h4 className="text-sm font-semibold text-blue-600 uppercase tracking-wider mb-3">{sec.section_name}</h4>
              {sec.questions.map((q, qIdx) => (
                <div key={qIdx} className="bg-white rounded-xl border border-slate-200 p-5 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      Q{q.question_number} · {q.marks}m
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      q.difficulty === 'very_hard' ? 'bg-red-100 text-red-600' :
                      q.difficulty === 'hard' ? 'bg-amber-100 text-amber-600' :
                      'bg-green-100 text-green-600'
                    }`}>{q.difficulty?.toUpperCase()}</span>
                  </div>
                  <div className="prose prose-sm max-w-none text-slate-700 mb-3">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question_text}</ReactMarkdown>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <p className="text-xs font-semibold text-green-700 mb-1">Answer Key:</p>
                    <div className="prose prose-sm max-w-none text-green-800">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.answer_key}</ReactMarkdown>
                    </div>
                    <p className="text-xs text-green-600 mt-2 italic">Marking: {q.marking_scheme}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <Link href="/dashboard" className="block w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors text-center mt-4 mb-8">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ─── Active Exam ──────────────────────────────────────────────────────
  const answeredCount = Object.values(answers).filter(a => a.answered).length;
  const totalQuestions = allQuestions.length;
  const isLastQ = activeSection === exam.sections.length - 1 && activeQ === currentSection!.questions.length - 1;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-slate-50 overflow-hidden">
      {/* Sidebar: Section Navigator */}
      <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-800 truncate">{exam.exam_title}</h2>
          <p className="text-xs text-slate-500 mt-1">{answeredCount}/{totalQuestions} answered</p>
        </div>

        {/* Timer */}
        <div className={`px-4 py-3 border-b border-slate-200 flex items-center gap-2 ${timeLeft < 300 ? 'bg-red-50' : 'bg-blue-50'}`}>
          <span className="text-lg">⏱️</span>
          <span className={`text-xl font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-blue-700'}`}>
            {formatTime(timeLeft)}
          </span>
        </div>

        {/* Question Grid */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {exam.sections.map((sec, sIdx) => {
            const sectionStartIdx = exam.sections.slice(0, sIdx).reduce((sum, s) => sum + s.questions.length, 0);
            return (
              <div key={sIdx}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
                  {sec.section_name.split(':')[0]} ({sec.marks_per_question}m)
                </p>
                <div className="grid grid-cols-5 gap-1">
                  {sec.questions.map((q, qIdx) => {
                    const gIdx = sectionStartIdx + qIdx;
                    const isActive = activeSection === sIdx && activeQ === qIdx;
                    const isAnswered = answers[gIdx]?.answered;
                    return (
                      <button
                        key={qIdx}
                        onClick={() => goToQuestion(sIdx, qIdx)}
                        className={`w-8 h-8 rounded-md text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                            : isAnswered
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {q.question_number}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Submit Button */}
        <div className="p-3 border-t border-slate-200">
          <button
            onClick={() => { setSubmitted(true); setShowAnswerKey(true); if (timerRef.current) clearInterval(timerRef.current); }}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors text-sm"
          >
            Submit Exam
          </button>
        </div>
      </div>

      {/* Main Question Area */}
      <div className="flex-1 overflow-y-auto p-8">
        {currentQ && currentSection && (
          <div className="max-w-3xl mx-auto">
            {/* Section Header */}
            <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">
              {currentSection.section_name}
            </div>

            {/* Question Meta */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-sm font-bold text-slate-800">Q{currentQ.question_number}.</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {currentQ.marks} mark{currentQ.marks > 1 ? 's' : ''}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                currentQ.difficulty === 'very_hard' ? 'bg-red-100 text-red-600' :
                currentQ.difficulty === 'hard' ? 'bg-amber-100 text-amber-600' :
                'bg-green-100 text-green-600'
              }`}>{currentQ.difficulty?.toUpperCase().replace('_', ' ')}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {currentQ.topic}
              </span>
            </div>

            {/* Question Text */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-6">
              <div className="prose prose-slate max-w-none text-lg">
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {currentQ.question_text}
                </ReactMarkdown>
              </div>

              {/* MCQ / True-False Options */}
              {(currentQ.type === 'mcq' || currentQ.type === 'true_false') && currentQ.options && (
                <div className="space-y-3 mt-6">
                  {currentQ.options.map((opt, idx) => {
                    const isSelected = answers[globalIndex]?.selected === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelect(idx)}
                        disabled={submitted}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                        } ${submitted ? 'opacity-70' : ''}`}
                      >
                        <div className="flex items-start">
                          <span className="shrink-0 w-7 h-7 rounded-full border-2 border-current flex items-center justify-center mr-3 text-xs font-bold opacity-70">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt}</ReactMarkdown>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Written Answer */}
              {currentQ.type !== 'mcq' && currentQ.type !== 'true_false' && (
                <div className="mt-6">
                  <textarea
                    value={answers[globalIndex]?.text || ''}
                    onChange={(e) => handleTextAnswer(e.target.value)}
                    disabled={submitted}
                    placeholder="Write your answer here... (Use LaTeX syntax for math)"
                    rows={6}
                    className="w-full rounded-xl border-2 border-slate-200 px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-y"
                  />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center">
              <button
                onClick={goPrev}
                disabled={activeSection === 0 && activeQ === 0}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-30 transition-colors"
              >
                ← Previous
              </button>
              {isLastQ ? (
                <button
                  onClick={() => { setSubmitted(true); setShowAnswerKey(true); if (timerRef.current) clearInterval(timerRef.current); }}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors"
                >
                  Submit Exam
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-medium transition-colors"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
