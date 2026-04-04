'use client';

import { use, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { loadSession } from '@/lib/session/sessionStore';
import type { Exam, ExamQuestion, ExamSection } from '@/lib/llm/examGenerator';

type AnswerState = Record<number, { selected?: number; text?: string; answered: boolean }>;
type PastAttempt = { id: string; student_name: string; score: number; total_marks: number; attempt_number: number; time_taken_seconds: number; created_at: string };

export default function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [fileName, setFileName] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [activeQ, setActiveQ] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60 * 60);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Pre-exam state
  const [phase, setPhase] = useState<'setup' | 'exam'>('setup');
  const [studentName, setStudentName] = useState('');
  const [pastAttempts, setPastAttempts] = useState<PastAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);

  // ─── Fetch Filename + Past Attempts ────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const [detailsRes, attemptsRes] = await Promise.all([
          fetch(`/api/chapters/${id}/details`),
          fetch(`/api/exams/submit?chapterId=${id}`),
        ]);
        const detailsData = await detailsRes.json();
        if (detailsData.success && detailsData.fileName) setFileName(detailsData.fileName);
        else { try { setFileName(atob(decodeURIComponent(id))); } catch { setFileName('Unknown'); } }

        const attemptsData = await attemptsRes.json();
        if (attemptsData.success && attemptsData.attempts) {
          setPastAttempts(attemptsData.attempts);
        }
      } catch {
        try { setFileName(atob(decodeURIComponent(id))); } catch { setFileName('Unknown'); }
      } finally {
        setLoadingAttempts(false);
      }
    }
    init();
  }, [id]);

  // ─── Fetch Exam ───────────────────────────────────────────────────────
  const fetchExam = useCallback(async () => {
    if (!fileName) return;
    setLoading(true);
    try {
      // Try cloud session first, fall back to localStorage
      let chapterPlan = null;
      let lessonPlans = {};
      try {
        const sessionRes = await fetch(`/api/pdfs/session?chapterId=${id}`);
        const sessionData = await sessionRes.json();
        if (sessionData.success && sessionData.session) {
          chapterPlan = sessionData.session.chapterPlan || null;
          lessonPlans = sessionData.session.lessonPlans || {};
        }
      } catch { /* ignore cloud fetch failure */ }
      if (!chapterPlan) {
        const local = loadSession(id);
        chapterPlan = local?.chapterPlan || null;
        lessonPlans = local?.lessonPlans || {};
      }

      const res = await fetch('/api/pdfs/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, chapterPlan, lessonPlans }),
      });
      const data = await res.json();
      if (data.success && data.exam) {
        setExam(data.exam);
        setTimeLeft((data.exam.time_limit_minutes || 60) * 60);
        startTimeRef.current = Date.now();
      } else {
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (e) {
      console.error('Failed to generate exam', e);
    } finally {
      setLoading(false);
    }
  }, [fileName, id]);

  useEffect(() => {
    if (phase === 'exam') fetchExam();
  }, [phase, fetchExam]);

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
  const allQuestions = useMemo(() => {
    const result: (ExamQuestion & { sectionIdx: number })[] = [];
    exam?.sections.forEach((sec, sIdx) => {
      sec.questions.forEach((q) => {
        result.push({ ...q, sectionIdx: sIdx });
      });
    });
    return result;
  }, [exam]);

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

  // ─── Score Calculation (memoized) ──────────────────────────────────
  const scoreResult = useMemo(() => {
    if (!submitted || !exam) return null;
    let earned = 0;
    const total = exam.total_marks || 50;
    const perSection: { name: string; earned: number; total: number }[] = [];

    let qIdx = 0;
    exam.sections.forEach((sec) => {
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
        }
        qIdx++;
      });
      perSection.push({ name: sec.section_name, earned: secEarned, total: secTotal });
    });

    return { earned, total, perSection };
  }, [submitted, exam, answers]);

  const calculateScore = () => scoreResult ?? { earned: 0, total: exam?.total_marks || 50, perSection: [] };

  // ─── Submit & Save ────────────────────────────────────────────────────
  const handleSubmitExam = useCallback(() => {
    setSubmitted(true);
    setShowAnswerKey(true);
    if (timerRef.current) clearInterval(timerRef.current);

    // Save results to API
    if (exam && scoreResult) {
      const timeTaken = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const sectionScores = scoreResult.perSection.reduce((acc, s) => {
        acc[s.name] = { earned: s.earned, total: s.total };
        return acc;
      }, {} as Record<string, { earned: number; total: number }>);

      fetch('/api/exams/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: id,
          studentName: studentName || 'Student',
          score: scoreResult.earned,
          totalMarks: scoreResult.total,
          timeTakenSeconds: timeTaken,
          sectionScores,
        }),
      }).catch(() => { /* fire and forget */ });
    }
  }, [exam, scoreResult, id, studentName]);

  // ─── Keyboard navigation ──────────────────────────────────────────────
  useEffect(() => {
    if (!exam || submitted) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, submitted, activeSection, activeQ]);

  // ─── Warn before navigating away mid-exam ────────────────────────────
  useEffect(() => {
    if (submitted || !exam) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [exam, submitted]);

  // ─── Setup Screen (name entry + past attempts) ────────────────────────
  if (phase === 'setup') {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-6 sm:p-8" style={{ background: 'var(--bg-base)' }}>
        <div className="w-full max-w-md">
          <div className="rounded-2xl border p-8" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-5" style={{ background: 'var(--accent-muted)' }}>
              <span className="text-2xl">📝</span>
            </div>
            <h1 className="text-xl font-bold text-center mb-1" style={{ color: 'var(--text-primary)' }}>Chapter Exam</h1>
            <p className="text-sm text-center mb-6" style={{ color: 'var(--text-secondary)' }}>
              {fileName || 'Loading...'} — 60 marks, ~60 minutes
            </p>

            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Your Name</label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--accent)] mb-5"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              autoFocus
            />

            <button
              onClick={() => { if (studentName.trim()) setPhase('exam'); }}
              disabled={!studentName.trim() || !fileName}
              className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Start Exam →
            </button>
          </div>

          {/* Past Attempts */}
          {loadingAttempts ? (
            <div className="mt-6 text-center">
              <div className="skeleton h-16 rounded-xl" />
            </div>
          ) : pastAttempts.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Previous Attempts</h3>
              <div className="space-y-2">
                {pastAttempts.map((a) => {
                  const pct = Math.round((a.score / a.total_marks) * 100);
                  const mins = Math.floor(a.time_taken_seconds / 60);
                  return (
                    <div key={a.id} className="rounded-xl border p-4 flex items-center justify-between" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.student_name} — Attempt #{a.attempt_number}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(a.created_at).toLocaleDateString()} · {mins}min
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold" style={{ color: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--error)' }}>
                          {a.score}/{a.total_marks}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pct}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Link href="/dashboard" className="block text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 space-y-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
        <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Generating your 60-Mark Exam...</h2>
        <p className="max-w-md text-center" style={{ color: 'var(--text-secondary)' }}>
          Building a comprehensive exam with 25 questions across 4 sections. This may take 15-20 seconds.
        </p>
      </div>
    );
  }

  if (!exam || !exam.sections || exam.sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 space-y-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2" style={{ background: 'rgba(239,68,68,0.15)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="var(--error)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Exam Generation Failed</h2>
        <p className="text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
          Something went wrong while preparing your exam. This can happen if the AI model times out or the session state is corrupted.
        </p>
        <div className="flex gap-4">
          <button
            onClick={fetchExam}
            className="px-6 py-2.5 text-white rounded-xl font-semibold transition-all shadow-sm"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Retry Generation
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 rounded-xl font-medium transition-all border"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
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
      <div className="flex flex-col min-h-full p-4 sm:p-8 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-2xl mx-auto w-full">
          <div className="rounded-2xl shadow-xl p-8 border mb-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`} style={{ background: pct >= 70 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
              <span className="text-2xl">{pct >= 70 ? '🏆' : '📚'}</span>
            </div>
            <h2 className="text-2xl font-bold text-center mb-1" style={{ color: 'var(--text-primary)' }}>Exam Complete</h2>
            <p className="text-center text-lg font-medium mb-6" style={{ color: 'var(--text-secondary)' }}>
              MCQ Score: <span className={`font-bold`} style={{ color: pct >= 70 ? 'var(--success)' : 'var(--warning)' }}>{result.earned}/{result.total}</span>
            </p>

            <div className="space-y-2 mb-6">
              {result.perSection.map((sec, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm border-b pb-2" style={{ borderColor: 'var(--border-soft)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{sec.name}</span>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{sec.earned}/{sec.total}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-center mb-4" style={{ color: 'var(--text-muted)' }}>
              Note: Only MCQ and True/False questions are auto-graded. Review answer keys below for written answers.
            </p>
          </div>

          {/* Answer Key for All Questions */}
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>📝 Complete Answer Key</h3>
          {exam.sections.map((sec, sIdx) => (
            <div key={sIdx} className="mb-6">
              <h4 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--accent)' }}>{sec.section_name}</h4>
              {sec.questions.map((q, qIdx) => (
                <div key={qIdx} className="rounded-xl border p-5 mb-3" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
                      Q{q.question_number} · {q.marks}m
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      q.difficulty === 'very_hard' ? 'bg-red-900/40 text-red-400' :
                      q.difficulty === 'hard' ? 'bg-amber-900/40 text-amber-400' :
                      'bg-green-900/40 text-green-400'
                    }`}>{q.difficulty?.toUpperCase()}</span>
                  </div>
                  <div className="prose prose-sm max-w-none mb-3" style={{ color: 'var(--text-primary)' }}>
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question_text}</ReactMarkdown>
                  </div>
                  <div className="rounded-lg p-4 border" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.2)' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--success)' }}>Answer Key:</p>
                    <div className="prose prose-sm max-w-none" style={{ color: 'var(--success)' }}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.answer_key}</ReactMarkdown>
                    </div>
                    <p className="text-xs mt-2 italic" style={{ color: 'rgba(34,197,94,0.6)' }}>Marking: {q.marking_scheme}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}

          <Link href="/dashboard" className="block w-full py-3 rounded-xl font-semibold transition-colors text-center mt-4 mb-8" style={{ background: 'var(--accent)', color: '#fff' }}>
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
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* Mobile Nav Overlay */}
      {showMobileNav && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setShowMobileNav(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          <div className="relative w-72 flex flex-col border-r overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{exam.exam_title}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{answeredCount}/{totalQuestions} answered</p>
              </div>
              <button onClick={() => setShowMobileNav(false)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {exam.sections.map((sec, sIdx) => {
                const sectionStartIdx = exam.sections.slice(0, sIdx).reduce((sum, s) => sum + s.questions.length, 0);
                return (
                  <div key={sIdx}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: 'var(--text-muted)' }}>{sec.section_name.split(':')[0]} ({sec.marks_per_question}m)</p>
                    <div className="grid grid-cols-5 gap-1">
                      {sec.questions.map((q, qIdx) => {
                        const gIdx = sectionStartIdx + qIdx;
                        const isActive = activeSection === sIdx && activeQ === qIdx;
                        const isAnswered = answers[gIdx]?.answered;
                        return (
                          <button key={qIdx} onClick={() => { goToQuestion(sIdx, qIdx); setShowMobileNav(false); }}
                            className={`w-8 h-8 rounded-md text-xs font-bold transition-all`}
                            style={isActive ? { background: 'var(--accent)', color: '#fff' } : isAnswered ? { background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' } : { background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                          >{q.question_number}</button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => handleSubmitExam()} className="w-full py-2.5 rounded-lg font-semibold text-sm" style={{ background: 'var(--error)', color: '#fff' }}>Submit Exam</button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar: Section Navigator */}
      <div className="hidden md:flex w-64 flex-col shrink-0 border-r" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{exam.exam_title}</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{answeredCount}/{totalQuestions} answered</p>
        </div>

        {/* Timer */}
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', background: timeLeft < 300 ? 'rgba(239,68,68,0.1)' : 'rgba(240,165,0,0.08)' }}>
          <span className="text-lg">⏱️</span>
          <span className={`text-xl font-mono font-bold`} style={{ color: timeLeft < 300 ? 'var(--error)' : 'var(--accent)' }}>
            {formatTime(timeLeft)}
          </span>
        </div>

        {/* Question Grid */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {exam.sections.map((sec, sIdx) => {
            const sectionStartIdx = exam.sections.slice(0, sIdx).reduce((sum, s) => sum + s.questions.length, 0);
            return (
              <div key={sIdx}>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 px-1" style={{ color: 'var(--text-muted)' }}>
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
                            ? 'text-white ring-2'
                            : isAnswered
                              ? 'border'
                              : 'hover:opacity-80'
                        }`}
                        style={
                          isActive
                            ? { background: 'var(--accent)', color: '#fff', boxShadow: '0 0 0 2px rgba(240,165,0,0.3)' }
                            : isAnswered
                              ? { background: 'rgba(34,197,94,0.15)', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.3)' }
                              : { background: 'var(--bg-muted)', color: 'var(--text-muted)' }
                        }
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
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => handleSubmitExam()}
            className="w-full py-2.5 text-white rounded-lg font-semibold transition-colors text-sm"
            style={{ background: 'var(--error)' }}
          >
            Submit Exam
          </button>
        </div>
      </div>

      {/* Main Question Area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>

        {/* Mobile Top Bar */}
        <div className="md:hidden flex items-center justify-between px-4 h-12 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <span className="text-sm font-mono font-bold" style={{ color: timeLeft < 300 ? 'var(--error)' : 'var(--accent)' }}>⏱ {formatTime(timeLeft)}</span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Q{currentQ?.question_number ?? '?'} / {totalQuestions}</span>
          <button onClick={() => setShowMobileNav(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
            Grid ⊞
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
        {currentQ && currentSection && (
          <div className="max-w-3xl mx-auto">
            {/* Section Header */}
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>
              {currentSection.section_name}
            </div>

            {/* Question Meta */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Q{currentQ.question_number}.</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                {currentQ.marks} mark{currentQ.marks > 1 ? 's' : ''}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                currentQ.difficulty === 'very_hard' ? 'bg-red-900/40 text-red-400' :
                currentQ.difficulty === 'hard' ? 'bg-amber-900/40 text-amber-400' :
                'bg-green-900/40 text-green-400'
              }`}>{currentQ.difficulty?.toUpperCase().replace('_', ' ')}</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                {currentQ.topic}
              </span>
            </div>

            {/* Question Text */}
            <div className="rounded-2xl shadow-sm border p-8 mb-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="prose max-w-none text-lg" style={{ color: 'var(--text-primary)' }}>
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
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${submitted ? 'opacity-70' : ''}`}
                        style={
                          isSelected
                            ? { background: 'rgba(240,165,0,0.1)', borderColor: 'var(--accent)' }
                            : { background: 'var(--bg-elevated)', borderColor: 'var(--border)' }
                        }
                      >
                        <div className="flex items-start">
                          <span className="shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center mr-3 text-xs font-bold" style={{ borderColor: isSelected ? 'var(--accent)' : 'var(--text-muted)', color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
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
                    className="w-full rounded-xl border-2 px-5 py-4 text-base focus:outline-none focus:ring-2 transition-all resize-y"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between items-center">
              <button
                onClick={goPrev}
                disabled={activeSection === 0 && activeQ === 0}
                className="px-5 py-2.5 text-sm font-medium disabled:opacity-30 transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                ← Previous
              </button>
              {isLastQ ? (
                <button
                  onClick={() => handleSubmitExam()}
                  className="px-6 py-2.5 text-white rounded-xl font-medium transition-colors"
                  style={{ background: 'var(--error)' }}
                >
                  Submit Exam
                </button>
              ) : (
                <button
                  onClick={goNext}
                  className="px-6 py-2.5 rounded-xl font-medium transition-colors"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
