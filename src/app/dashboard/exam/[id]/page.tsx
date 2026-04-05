'use client';

import { use, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { loadSession } from '@/lib/session/sessionStore';
import type { Exam, ExamQuestion, ExamSection, WrittenGrade } from '@/lib/llm/examGenerator';

type AnswerState = Record<number, { selected?: number; text?: string; images?: string[]; answered: boolean }>;
type PastAttempt = { id: string; student_name: string; score: number; total_marks: number; attempt_number: number; time_taken_seconds: number; completed_at: string };
type ReviewData = { exam_data: Exam; answers: AnswerState; score: number; total_marks: number; student_name: string; attempt_number: number; time_taken_seconds: number };

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
  const [writtenGrades, setWrittenGrades] = useState<WrittenGrade[]>([]);
  const [gradingWritten, setGradingWritten] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  // Ref pointing to the latest handleSubmitExam — allows the timer to call it
  // without capturing a stale closure
  const handleSubmitExamRef = useRef<() => void>(() => {});

  // ─── Per-question timing ─────────────────────────────────────────────
  // Maps globalIndex → cumulative seconds spent on that question
  const questionTimingsRef = useRef<Record<number, number>>({});
  // When the current question was entered (ms timestamp)
  const questionEnteredAtRef = useRef<number>(0);

  // ─── Tab / focus integrity tracking ──────────────────────────────────
  const tabSwitchesRef = useRef<number>(0);
  const tabSwitchLogRef = useRef<Array<{ left_at: number; returned_at?: number }>>([]);

  // Pre-exam state
  const [phase, setPhase] = useState<'setup' | 'exam'>('setup');
  const [studentName, setStudentName] = useState('');
  const [pastAttempts, setPastAttempts] = useState<PastAttempt[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(true);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  // Review mode: view a past attempt in read-only
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  // Collapsible answer key per question in results view
  const [expandedAnswerKeys, setExpandedAnswerKeys] = useState<Set<number>>(new Set());
  // Questions flagged for review
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  // Animated score counter for results count-up effect
  const [animatedScore, setAnimatedScore] = useState(0);
  const animatedScoreRef = useRef(0);

  // ─── Load past attempt for review ────────────────────────────────────
  const loadAttemptReview = async (attemptId: string) => {
    setLoadingReview(true);
    try {
      const res = await fetch(`/api/exams/submit?id=${attemptId}`);
      const data = await res.json();
      if (data.success && data.attempt) {
        setReviewData({
          exam_data: data.attempt.exam_data,
          answers: data.attempt.answers || {},
          score: data.attempt.score,
          total_marks: data.attempt.total_marks,
          student_name: data.attempt.student_name,
          attempt_number: data.attempt.attempt_number,
          time_taken_seconds: data.attempt.time_taken_seconds,
        });
      }
    } catch { /* ignore */ }
    finally { setLoadingReview(false); }
  };

  // ─── Flag for Review ─────────────────────────────────────────────────
  const toggleFlag = useCallback((idx: number) => {
    setFlaggedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

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
      // Pass chapterId — server will read chapter_plan from DB and cache the result
      // Still pass lessonPlans from local session for richer question generation
      let lessonPlans = {};
      try {
        const local = loadSession(id);
        lessonPlans = local?.lessonPlans || {};
      } catch { /* ignore */ }

      const res = await fetch('/api/pdfs/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, chapterId: id, lessonPlans }),
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
          // Call via ref to always use the latest version (avoids stale closure)
          setTimeout(() => handleSubmitExamRef.current(), 0);
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
    const result: (ExamQuestion & { sectionIdx: number; qIdxInSection: number })[] = [];
    exam?.sections.forEach((sec, sIdx) => {
      sec.questions.forEach((q, qIdx) => {
        result.push({ ...q, sectionIdx: sIdx, qIdxInSection: qIdx });
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

  // ─── Record time on current question before leaving it ─────────────
  const recordQuestionTime = useCallback(() => {
    if (questionEnteredAtRef.current === 0) return;
    const elapsed = Math.floor((Date.now() - questionEnteredAtRef.current) / 1000);
    questionTimingsRef.current[globalIndex] = (questionTimingsRef.current[globalIndex] || 0) + elapsed;
    questionEnteredAtRef.current = Date.now();
  }, [globalIndex]);

  // Stamp entry time whenever the active question changes
  useEffect(() => {
    if (!exam || submitted) return;
    questionEnteredAtRef.current = Date.now();
  }, [globalIndex, exam, submitted]);

  // ─── Tab visibility tracking ──────────────────────────────────────────
  useEffect(() => {
    if (!exam || submitted) return;
    const onVisibility = () => {
      if (document.hidden) {
        tabSwitchesRef.current += 1;
        tabSwitchLogRef.current.push({ left_at: Date.now() });
      } else {
        const last = tabSwitchLogRef.current[tabSwitchLogRef.current.length - 1];
        if (last && !last.returned_at) last.returned_at = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [exam, submitted]);

  // ─── Navigation ───────────────────────────────────────────────────────
  const goToQuestion = useCallback((sectionIdx: number, qIdx: number) => {
    recordQuestionTime();
    setActiveSection(sectionIdx);
    setActiveQ(qIdx);
  }, [recordQuestionTime]);

  const goNext = () => {
    recordQuestionTime();
    if (!currentSection) return;
    if (activeQ + 1 < currentSection.questions.length) {
      setActiveQ(activeQ + 1);
    } else if (exam && activeSection + 1 < exam.sections.length) {
      setActiveSection(activeSection + 1);
      setActiveQ(0);
    }
  };

  const goPrev = () => {
    recordQuestionTime();
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

  // ─── Score Count-up Animation ─────────────────────────────────────────
  useEffect(() => {
    if (!submitted || !scoreResult) { setAnimatedScore(0); animatedScoreRef.current = 0; return; }
    const target = scoreResult.earned + writtenGrades.reduce((s, g) => s + g.marks_awarded, 0);
    if (animatedScoreRef.current === target) return;
    const startVal = animatedScoreRef.current;
    let frame = 0;
    const total = 24;
    const diff = target - startVal;
    const id = setInterval(() => {
      frame++;
      const eased = 1 - Math.pow(1 - Math.min(frame / total, 1), 3);
      const val = Math.round(startVal + diff * eased);
      animatedScoreRef.current = val;
      setAnimatedScore(val);
      if (frame >= total) { animatedScoreRef.current = target; setAnimatedScore(target); clearInterval(id); }
    }, 33);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, scoreResult, writtenGrades]);

  const calculateScore = () => scoreResult ?? { earned: 0, total: exam?.total_marks || 50, perSection: [] };

  // ─── Submit & Save ────────────────────────────────────────────────────
  const handleSubmitExam = useCallback(() => {
    // Record time on the last active question before submitting
    recordQuestionTime();

    // Compute MCQ score now (before setSubmitted, since scoreResult depends on submitted state)
    let mcqEarned = 0;
    let qIdx = 0;
    const perSection: { name: string; earned: number; total: number }[] = [];
    if (exam) {
      exam.sections.forEach((sec) => {
        let secEarned = 0;
        const secTotal = sec.marks_per_question * sec.questions.length;
        sec.questions.forEach((q) => {
          const ans = answers[qIdx];
          if (ans?.answered && (q.type === 'mcq' || q.type === 'true_false')) {
            if (ans.selected === q.correct_index) { secEarned += q.marks; mcqEarned += q.marks; }
          }
          qIdx++;
        });
        perSection.push({ name: sec.section_name, earned: secEarned, total: secTotal });
      });
    }

    setSubmitted(true);
    setShowAnswerKey(true);
    if (timerRef.current) clearInterval(timerRef.current);
    // Save results to API and collect LLM-graded written scores
    if (exam) {
      const timeTaken = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const sectionScores = perSection.reduce((acc, s) => {
        acc[s.name] = { earned: s.earned, total: s.total };
        return acc;
      }, {} as Record<string, { earned: number; total: number }>);

      setGradingWritten(true);
      fetch('/api/exams/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: id,
          studentName: studentName || 'Student',
          examData: exam,
          answers,
          score: mcqEarned,
          totalMarks: exam.total_marks || 60,
          timeTaken,
          sectionScores,
          questionTimings: questionTimingsRef.current,
          tabSwitches: tabSwitchesRef.current,
          integrityFlags: {
            tab_switch_log: tabSwitchLogRef.current,
            total_tab_switches: tabSwitchesRef.current,
          },
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.writtenGrades)) setWrittenGrades(data.writtenGrades);
        })
        .catch(() => { /* ignore — MCQ results are already displayed */ })
        .finally(() => setGradingWritten(false));
    }
  }, [exam, id, studentName, answers, recordQuestionTime]);

  // Keep the ref in sync so the timer can call the latest version
  useEffect(() => {
    handleSubmitExamRef.current = handleSubmitExam;
  }, [handleSubmitExam]);

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
                    <button key={a.id} onClick={() => loadAttemptReview(a.id)}
                      className="w-full rounded-xl border p-4 flex items-center justify-between transition-colors text-left hover:opacity-80"
                      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
                      disabled={loadingReview}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.student_name} — Attempt #{a.attempt_number}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {new Date(a.completed_at).toLocaleDateString()} · {mins}min
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-lg font-bold" style={{ color: pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--error)' }}>
                            {a.score}/{a.total_marks}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{pct}%</p>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--accent)' }}>Review →</span>
                      </div>
                    </button>
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

  // ─── Loading Review ────────────────────────────────────────────────
  if (loadingReview) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full p-8 space-y-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Loading past attempt...</p>
      </div>
    );
  }

  // ─── Review Mode — Past Attempt ──────────────────────────────────────
  if (reviewData) {
    const reviewExam = reviewData.exam_data;
    const reviewAnswers = reviewData.answers;
    const pct = reviewData.total_marks > 0 ? Math.round((reviewData.score / reviewData.total_marks) * 100) : 0;

    return (
      <div className="flex flex-col min-h-full p-4 sm:p-8 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-2xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setReviewData(null)} className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              ← Back
            </button>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {reviewData.student_name} · Attempt #{reviewData.attempt_number} · {Math.floor(reviewData.time_taken_seconds / 60)}min
              </p>
              <p className="text-lg font-bold" style={{ color: pct >= 40 ? 'var(--success)' : 'var(--warning)' }}>
                {reviewData.score}/{reviewData.total_marks} ({pct}%)
              </p>
            </div>
          </div>

          {/* Questions */}
          {reviewExam.sections.map((sec, sIdx) => {
            const sectionStartIdx = reviewExam.sections.slice(0, sIdx).reduce((sum, s) => sum + s.questions.length, 0);
            return (
              <div key={sIdx} className="mb-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--accent)' }}>{sec.section_name}</h4>
                {sec.questions.map((q, qIdx) => {
                  const gIdx = sectionStartIdx + qIdx;
                  const ans = reviewAnswers[gIdx];
                  const isAutoGraded = q.type === 'mcq' || q.type === 'true_false';
                  const opts = q.options && q.options.length > 0 ? q.options : (q.type === 'true_false' ? ['True', 'False'] : []);
                  const isCorrect = isAutoGraded ? (ans?.selected != null && ans.selected === q.correct_index) : null;
                  const isOpen = expandedAnswerKeys.has(gIdx);

                  return (
                    <div key={qIdx} className="rounded-xl border mb-3 overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <button
                        className="w-full text-left px-5 py-4 flex items-center gap-3"
                        onClick={() => setExpandedAnswerKeys(prev => { const n = new Set(prev); if (n.has(gIdx)) n.delete(gIdx); else n.add(gIdx); return n; })}
                      >
                        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{
                          background: isCorrect === true ? 'rgba(34,197,94,0.15)' : isCorrect === false ? 'rgba(244,63,94,0.15)' : 'rgba(113,113,122,0.15)',
                          color: isCorrect === true ? 'var(--success)' : isCorrect === false ? 'var(--error)' : 'var(--text-muted)',
                        }}>
                          {isCorrect === true ? '✓' : isCorrect === false ? '✗' : '—'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Q{q.question_number}</span>
                          <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{q.marks}m · {q.topic}</span>
                        </div>
                        <svg className={`shrink-0 w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-soft)' }}>
                          <div className="prose prose-sm max-w-none mt-3 mb-3" style={{ color: 'var(--text-primary)' }}>
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question_text}</ReactMarkdown>
                          </div>
                          <div className="rounded-lg p-3 mb-3 border" style={{
                            background: isCorrect === true ? 'rgba(34,197,94,0.06)' : isCorrect === false ? 'rgba(244,63,94,0.06)' : 'var(--bg-elevated)',
                            borderColor: isCorrect === true ? 'rgba(34,197,94,0.15)' : isCorrect === false ? 'rgba(244,63,94,0.15)' : 'var(--border)',
                          }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Your Answer</p>
                            {isAutoGraded ? (
                              <div>
                                <span className="text-sm" style={{ color: isCorrect ? 'var(--success)' : 'var(--error)' }}>
                                  {ans?.selected != null ? `${String.fromCharCode(65 + ans.selected)}) ${opts[ans.selected] || ''}` : 'Not answered'}
                                </span>
                                {!isCorrect && q.correct_index != null && q.correct_index >= 0 && (
                                  <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>Correct: {String.fromCharCode(65 + q.correct_index)}) {opts[q.correct_index] || ''}</p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{ans?.text?.trim() || 'Not answered'}</p>
                            )}
                          </div>
                          <div className="rounded-lg p-3 border" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.15)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--success)' }}>Answer Key</p>
                            <div className="prose prose-sm max-w-none text-sm" style={{ color: 'var(--text-primary)' }}>
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.answer_key}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <button onClick={() => setReviewData(null)} className="w-full py-3 rounded-xl font-semibold transition-colors text-center text-sm mb-8" style={{ background: 'var(--accent)', color: '#fff' }}>
            Back to Exam Setup
          </button>
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
    const writtenScore = writtenGrades.reduce((sum, g) => sum + g.marks_awarded, 0);
    const totalScore = result.earned + writtenScore;
    const pct = Math.round((totalScore / result.total) * 100);
    const writtenGradeMap = new Map(writtenGrades.map((g) => [g.question_number, g]));

    // Build per-question result data
    let globalQIdx = 0;
    const questionResults: { q: ExamQuestion; secIdx: number; gIdx: number; isCorrect: boolean | null; studentAnswer: string; grade?: WrittenGrade }[] = [];
    exam.sections.forEach((sec, sIdx) => {
      sec.questions.forEach((q) => {
        const ans = answers[globalQIdx];
        const isAutoGraded = q.type === 'mcq' || q.type === 'true_false';
        const grade = writtenGradeMap.get(q.question_number);
        let isCorrect: boolean | null = null;
        let studentAnswer = '';
        if (isAutoGraded) {
          const opts = q.options && q.options.length > 0 ? q.options : (q.type === 'true_false' ? ['True', 'False'] : []);
          isCorrect = ans?.answered && ans.selected != null ? ans.selected === q.correct_index : false;
          studentAnswer = ans?.selected != null && opts[ans.selected] ? opts[ans.selected] : 'Not answered';
        } else {
          studentAnswer = ans?.text?.trim() || 'Not answered';
          isCorrect = grade ? grade.marks_awarded > 0 : null;
        }
        questionResults.push({ q, secIdx: sIdx, gIdx: globalQIdx, isCorrect, studentAnswer, grade });
        globalQIdx++;
      });
    });

    return (
      <div className="flex flex-col min-h-full p-4 sm:p-8 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
        <div className="max-w-2xl mx-auto w-full">
          {/* Score Summary Card */}
          <div className="rounded-2xl shadow-xl p-8 border mb-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: pct >= 40 ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
              <span className="text-2xl">{pct >= 40 ? '🏆' : '📚'}</span>
            </div>
            <h2 className="text-2xl font-bold text-center mb-1" style={{ color: 'var(--text-primary)' }}>Exam Complete</h2>
            <p className="text-center text-3xl font-bold mb-1" style={{ color: pct >= 40 ? 'var(--success)' : 'var(--warning)' }}>
              {animatedScore}/{result.total}
            </p>
            <p className="text-center text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{pct}% — {pct >= 40 ? 'Passed' : 'Below pass mark (40%)'}</p>

            {/* Score breakdown */}
            <div className="rounded-xl border p-4 mb-4 space-y-2" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-soft)' }}>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>MCQ / True-False (auto-graded)</span>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{result.earned} marks</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>
                  Written Answers (LLM-graded)
                  {gradingWritten && <span className="ml-2 text-xs animate-pulse" style={{ color: 'var(--accent)' }}>grading...</span>}
                </span>
                <span className="font-semibold" style={{ color: gradingWritten ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                  {gradingWritten ? '…' : `${writtenScore} marks`}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Total</span>
                <span className="font-bold" style={{ color: pct >= 40 ? 'var(--success)' : 'var(--warning)' }}>
                  {gradingWritten ? `${result.earned}+ /` : `${animatedScore}/`}{result.total}
                </span>
              </div>
            </div>

            {gradingWritten && (
              <p className="text-xs text-center mb-4 animate-pulse" style={{ color: 'var(--accent)' }}>
                LLM is grading your written answers — results will appear shortly...
              </p>
            )}

            {/* Section score bars */}
            <div className="space-y-2 mt-4">
              {result.perSection.map((s, i) => {
                const sPct = s.total > 0 ? Math.round((s.earned / s.total) * 100) : 0;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>{s.name}</span>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.earned}/{s.total}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${sPct}%`, background: sPct >= 60 ? 'var(--success)' : sPct >= 30 ? 'var(--warning)' : 'var(--error)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Question-by-question review */}
          <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>📋 Question Review</h3>
          {exam.sections.map((sec, sIdx) => {
            const sectionStartIdx = exam.sections.slice(0, sIdx).reduce((sum, s) => sum + s.questions.length, 0);
            return (
              <div key={sIdx} className="mb-6">
                <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ color: 'var(--accent)' }}>{sec.section_name}</h4>
                {sec.questions.map((q, qIdx) => {
                  const gIdx = sectionStartIdx + qIdx;
                  const qr = questionResults[gIdx];
                  const isAutoGraded = q.type === 'mcq' || q.type === 'true_false';
                  const ans = answers[gIdx];
                  const isExpanded = expandedAnswerKeys.has(gIdx);
                  const correctOpts = q.options && q.options.length > 0 ? q.options : (q.type === 'true_false' ? ['True', 'False'] : []);

                  return (
                    <div key={qIdx} className="rounded-xl border mb-3 overflow-hidden" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      {/* Question header — click to expand answer key */}
                      <button
                        className="w-full text-left px-5 py-4 flex items-center gap-3"
                        onClick={() => setExpandedAnswerKeys(prev => {
                          const next = new Set(prev);
                          if (next.has(gIdx)) next.delete(gIdx); else next.add(gIdx);
                          return next;
                        })}
                      >
                        {/* Status indicator */}
                        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{
                          background: qr.isCorrect === true ? 'rgba(34,197,94,0.15)' : qr.isCorrect === false ? 'rgba(244,63,94,0.15)' : 'rgba(113,113,122,0.15)',
                          color: qr.isCorrect === true ? 'var(--success)' : qr.isCorrect === false ? 'var(--error)' : 'var(--text-muted)',
                        }}>
                          {qr.isCorrect === true ? '✓' : qr.isCorrect === false ? '✗' : '—'}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Q{q.question_number}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{q.marks}m</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{q.type.replace('_', '/')}</span>
                            {qr.grade && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: 'rgb(129,140,248)' }}>
                                {qr.grade.marks_awarded}/{qr.grade.max_marks}
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{q.topic}</p>
                        </div>

                        {/* Your answer summary */}
                        <div className="shrink-0 text-right">
                          {isAutoGraded && ans?.selected != null && (
                            <p className="text-xs" style={{ color: qr.isCorrect ? 'var(--success)' : 'var(--error)' }}>
                              {qr.isCorrect ? `${correctOpts[ans.selected] || String.fromCharCode(65 + ans.selected)}` : `Picked ${String.fromCharCode(65 + ans.selected)}`}
                            </p>
                          )}
                          {!isAutoGraded && ans?.text && (
                            <p className="text-xs max-w-[120px] truncate" style={{ color: 'var(--text-muted)' }}>{ans.text.slice(0, 40)}...</p>
                          )}
                        </div>

                        <svg className={`shrink-0 w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="var(--text-muted)" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--border-soft)' }}>
                          {/* Question text */}
                          <div className="prose prose-sm max-w-none mt-3 mb-3" style={{ color: 'var(--text-primary)' }}>
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question_text}</ReactMarkdown>
                          </div>

                          {/* Student's answer */}
                          <div className="rounded-lg p-3 mb-3 border" style={{
                            background: qr.isCorrect ? 'rgba(34,197,94,0.06)' : 'rgba(244,63,94,0.06)',
                            borderColor: qr.isCorrect ? 'rgba(34,197,94,0.15)' : 'rgba(244,63,94,0.15)',
                          }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Your Answer</p>
                            {isAutoGraded ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm" style={{ color: qr.isCorrect ? 'var(--success)' : 'var(--error)' }}>
                                  {ans?.selected != null ? `${String.fromCharCode(65 + ans.selected)}) ${correctOpts[ans.selected] || ''}` : 'Not answered'}
                                </span>
                                {!qr.isCorrect && q.correct_index != null && q.correct_index >= 0 && (
                                  <span className="text-xs ml-auto" style={{ color: 'var(--success)' }}>
                                    Correct: {String.fromCharCode(65 + q.correct_index)}) {correctOpts[q.correct_index] || ''}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{ans?.text?.trim() || 'Not answered'}</p>
                            )}
                            {/* Show pasted images if any */}
                            {ans?.images && ans.images.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {ans.images.map((img, idx) => (
                                  <img key={idx} src={img} alt={`Screenshot ${idx+1}`} className="max-h-24 rounded border" style={{ borderColor: 'var(--border)' }} />
                                ))}
                              </div>
                            )}
                          </div>

                          {/* LLM Feedback */}
                          {qr.grade && (
                            <div className="rounded-lg p-3 mb-3 border" style={{ background: 'rgba(99,102,241,0.06)', borderColor: 'rgba(99,102,241,0.15)' }}>
                              <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'rgb(129,140,248)' }}>
                                AI Feedback — {qr.grade.marks_awarded}/{qr.grade.max_marks} marks
                              </p>
                              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{qr.grade.feedback}</p>
                            </div>
                          )}
                          {!isAutoGraded && gradingWritten && !qr.grade && (
                            <p className="text-xs animate-pulse mb-3" style={{ color: 'var(--accent)' }}>⏳ Grading in progress...</p>
                          )}

                          {/* Answer Key */}
                          <div className="rounded-lg p-3 border" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.15)' }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--success)' }}>Answer Key</p>
                            <div className="prose prose-sm max-w-none text-sm" style={{ color: 'var(--text-primary)' }}>
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.answer_key}</ReactMarkdown>
                            </div>
                            <p className="text-[10px] mt-2 italic" style={{ color: 'var(--text-muted)' }}>Marking: {q.marking_scheme}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div className="flex gap-3 mt-4 mb-8">
            <Link href={`/dashboard/exam/${id}`} onClick={() => { setSubmitted(false); setShowAnswerKey(false); setPhase('setup'); setExam(null); setAnswers({}); setWrittenGrades([]); setExpandedAnswerKeys(new Set()); }}
              className="flex-1 py-3 rounded-xl font-semibold transition-colors text-center text-sm"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Retake Exam
            </Link>
            <Link href="/dashboard" className="flex-1 py-3 rounded-xl font-medium transition-colors text-center text-sm border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Dashboard
            </Link>
          </div>
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
                        const isFlagged = flaggedQuestions.has(gIdx);
                        return (
                          <button key={qIdx} onClick={() => { goToQuestion(sIdx, qIdx); setShowMobileNav(false); }}
                            className="w-8 h-8 rounded-md text-xs font-bold transition-all hover:opacity-80"
                            style={
                              isActive
                                ? { background: 'var(--accent)', color: '#fff' }
                                : isFlagged && isAnswered
                                  ? { background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '2px solid rgba(245,158,11,0.55)' }
                                  : isFlagged
                                    ? { background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.35)' }
                                    : isAnswered
                                      ? { background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }
                                      : { background: 'var(--bg-muted)', color: 'var(--text-muted)' }
                            }
                          >{q.question_number}</button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowConfirmSubmit(true)} className="w-full py-2.5 rounded-lg font-semibold text-sm" style={{ background: 'var(--error)', color: '#fff' }}>Submit Exam</button>
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
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{
          borderColor: 'var(--border)',
          background: timeLeft < 300 ? 'rgba(239,68,68,0.1)' : timeLeft < 600 ? 'rgba(245,158,11,0.07)' : 'transparent',
        }}>
          <span className="text-base">⏱</span>
          <span
            className={`text-xl font-mono font-bold ${timeLeft < 120 ? 'animate-pulse' : ''}`}
            style={{ color: timeLeft < 300 ? 'var(--error)' : timeLeft < 600 ? 'var(--warning)' : 'var(--accent)' }}
          >
            {formatTime(timeLeft)}
          </span>
          {timeLeft < 300 && (
            <span className="text-[10px] font-bold ml-auto animate-pulse" style={{ color: 'var(--error)' }}>HURRY!</span>
          )}
          {timeLeft >= 300 && timeLeft < 600 && (
            <span className="text-[10px] font-medium ml-auto" style={{ color: 'var(--warning)' }}>Low time</span>
          )}
        </div>

        {/* Question Grid */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {exam.sections.map((sec, sIdx) => {
            const sectionStartIdx = exam.sections.slice(0, sIdx).reduce((sum, s) => sum + s.questions.length, 0);
            const sectionAnswered = sec.questions.filter((_, qi) => answers[sectionStartIdx + qi]?.answered).length;
            return (
              <div key={sIdx}>
                <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {sec.section_name.split(':')[0]} ({sec.marks_per_question}m)
                  </p>
                  <span className="text-[10px]" style={{ color: sectionAnswered === sec.questions.length ? 'var(--success)' : 'var(--text-muted)' }}>
                    {sectionAnswered}/{sec.questions.length}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {sec.questions.map((q, qIdx) => {
                    const gIdx = sectionStartIdx + qIdx;
                    const isActive = activeSection === sIdx && activeQ === qIdx;
                    const isAnswered = answers[gIdx]?.answered;
                    const isFlagged = flaggedQuestions.has(gIdx);
                    return (
                      <button
                        key={qIdx}
                        onClick={() => goToQuestion(sIdx, qIdx)}
                        title={isFlagged ? `Q${q.question_number} — flagged for review` : undefined}
                        className="w-8 h-8 rounded-md text-xs font-bold transition-all hover:opacity-80"
                        style={
                          isActive
                            ? { background: 'var(--accent)', color: '#fff', boxShadow: '0 0 0 2px rgba(16,185,129,0.35)' }
                            : isFlagged && isAnswered
                              ? { background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '2px solid rgba(245,158,11,0.55)' }
                              : isFlagged
                                ? { background: 'rgba(245,158,11,0.15)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.35)' }
                                : isAnswered
                                  ? { background: 'rgba(34,197,94,0.15)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.3)' }
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
            onClick={() => setShowConfirmSubmit(true)}
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

        {/* Progress Bar */}
        <div className="shrink-0 h-[3px]" style={{ background: 'var(--bg-muted)' }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0}%`,
              background: answeredCount === totalQuestions ? 'var(--success)' : 'var(--accent)',
            }}
          />
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
              <button
                onClick={() => toggleFlag(globalIndex)}
                className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-all"
                title={flaggedQuestions.has(globalIndex) ? 'Unflag question' : 'Flag for review'}
                style={{
                  background: flaggedQuestions.has(globalIndex) ? 'rgba(245,158,11,0.15)' : 'var(--bg-muted)',
                  color: flaggedQuestions.has(globalIndex) ? 'var(--warning)' : 'var(--text-muted)',
                  border: `1px solid ${flaggedQuestions.has(globalIndex) ? 'rgba(245,158,11,0.35)' : 'transparent'}`,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill={flaggedQuestions.has(globalIndex) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                  <line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
                {flaggedQuestions.has(globalIndex) ? 'Flagged' : 'Flag'}
              </button>
            </div>

            {/* Question Text */}
            <div className="rounded-2xl shadow-sm border p-8 mb-6" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
              <div className="prose max-w-none text-lg" style={{ color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {currentQ.question_text}
                </ReactMarkdown>
              </div>

              {/* MCQ / True-False Options */}
              {(currentQ.type === 'mcq' || currentQ.type === 'true_false') && (() => {
                const opts = currentQ.options && currentQ.options.length > 0
                  ? currentQ.options
                  : currentQ.type === 'true_false' ? ['True', 'False'] : null;
                if (!opts) return null;
                return (
                <div className="space-y-3 mt-6">
                  {opts.map((opt, idx) => {
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
                );
              })()}

              {/* Written Answer */}
              {currentQ.type !== 'mcq' && currentQ.type !== 'true_false' && (
                <div className="mt-6">
                  {/* Diagram hint */}
                  {/draw|sketch|diagram|construct|illustrat/i.test(currentQ.question_text) && (
                    <div className="rounded-lg p-3 mb-3 text-xs border" style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.2)', color: 'rgb(165,180,252)' }}>
                      💡 <strong>Tip:</strong> Use a free tool like <a href="https://excalidraw.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>Excalidraw</a> or
                      {' '}<a href="https://www.geogebra.org/classic" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>GeoGebra</a> to create your diagram, then paste a screenshot here (Ctrl/Cmd+V).
                    </div>
                  )}
                  <textarea
                    value={answers[globalIndex]?.text || ''}
                    onChange={(e) => handleTextAnswer(e.target.value)}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (const item of Array.from(items)) {
                        if (item.type.startsWith('image/')) {
                          e.preventDefault();
                          const blob = item.getAsFile();
                          if (!blob) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const base64 = reader.result as string;
                            setAnswers(prev => ({
                              ...prev,
                              [globalIndex]: {
                                ...prev[globalIndex],
                                images: [...(prev[globalIndex]?.images || []), base64],
                                answered: true,
                              }
                            }));
                          };
                          reader.readAsDataURL(blob);
                          break;
                        }
                      }
                    }}
                    disabled={submitted}
                    placeholder="Write your answer here... (Use LaTeX syntax for math, paste screenshots with Ctrl/Cmd+V)"
                    rows={6}
                    className="w-full rounded-xl border-2 px-5 py-4 text-base focus:outline-none focus:ring-2 transition-all resize-y"
                    style={{ background: 'var(--bg-muted)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  {/* Word count */}
                  {!submitted && (
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {(() => {
                          const t = answers[globalIndex]?.text?.trim() || '';
                          const w = t ? t.split(/\s+/).length : 0;
                          return `${w} word${w !== 1 ? 's' : ''}`;
                        })()}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ctrl+V to paste image</span>
                    </div>
                  )}
                  {/* Pasted image previews */}
                  {answers[globalIndex]?.images && answers[globalIndex].images!.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {answers[globalIndex].images!.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img src={img} alt={`Screenshot ${idx + 1}`} className="max-h-32 rounded-lg border" style={{ borderColor: 'var(--border)' }} />
                          {!submitted && (
                            <button
                              onClick={() => {
                                setAnswers(prev => ({
                                  ...prev,
                                  [globalIndex]: {
                                    ...prev[globalIndex],
                                    images: prev[globalIndex]?.images?.filter((_, i) => i !== idx) || [],
                                  }
                                }));
                              }}
                              className="absolute -top-2 -right-2 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: 'var(--error)', color: '#fff' }}
                            >×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
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
                  onClick={() => setShowConfirmSubmit(true)}
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

      {/* Confirm Submit Dialog */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm mx-4 rounded-2xl p-6 animate-slideUp" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(244,63,94,0.12)' }}>
              <span className="text-xl">⚠️</span>
            </div>
            <h3 className="text-lg font-bold text-center mb-2" style={{ color: 'var(--text-primary)' }}>Submit Exam?</h3>
            <p className="text-sm text-center mb-2" style={{ color: 'var(--text-secondary)' }}>
              You have answered <strong style={{ color: 'var(--text-primary)' }}>{answeredCount}</strong> of <strong style={{ color: 'var(--text-primary)' }}>{totalQuestions}</strong> questions.
            </p>
            {(answeredCount < totalQuestions || flaggedQuestions.size > 0) && (
              <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-soft)' }}>
                {answeredCount < totalQuestions && (
                  <p className="text-xs mb-1.5" style={{ color: 'var(--warning)' }}>
                    ⚠ {totalQuestions - answeredCount} unanswered — will score 0
                  </p>
                )}
                {flaggedQuestions.size > 0 && (
                  <p className="text-xs mb-1.5" style={{ color: 'var(--warning)' }}>
                    🔖 {flaggedQuestions.size} flagged for review
                  </p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {allQuestions.map((q, gIdx) => {
                    const isUnanswered = !answers[gIdx]?.answered;
                    const isFlagged = flaggedQuestions.has(gIdx);
                    if (!isUnanswered && !isFlagged) return null;
                    return (
                      <button
                        key={gIdx}
                        onClick={() => { setShowConfirmSubmit(false); goToQuestion(q.sectionIdx, q.qIdxInSection); }}
                        className="text-xs px-2 py-0.5 rounded-md transition-colors"
                        style={{
                          background: isFlagged && !isUnanswered ? 'rgba(245,158,11,0.15)' : 'rgba(244,63,94,0.1)',
                          color: isFlagged && !isUnanswered ? 'var(--warning)' : 'var(--error)',
                          border: `1px solid ${isFlagged && !isUnanswered ? 'rgba(245,158,11,0.25)' : 'rgba(244,63,94,0.2)'}`,
                        }}
                      >
                        Q{q.question_number}{isFlagged ? ' 🔖' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowConfirmSubmit(false); handleSubmitExam(); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--error)', color: '#fff' }}
              >
                Yes, Submit
              </button>
              <button
                onClick={() => setShowConfirmSubmit(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
