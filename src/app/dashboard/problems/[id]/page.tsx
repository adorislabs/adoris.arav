'use client';

import { use, useEffect, useState, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { loadSession, saveSession } from '@/lib/session/sessionStore';
import type { PracticeTopic } from '@/lib/session/sessionStore';

// ─── Types ────────────────────────────────────────────────────────────────

interface Problem {
  id: string;
  difficulty: string;
  type: string;
  marks: number;
  question_text: string;
  options?: string[];
  correct_index?: number;
  answer: string;
  solution_steps: string;
}

interface ProblemSetData {
  topic: string;
  problems: Problem[];
}

type DifficultyFilter = 'all' | 'foundation' | 'easy' | 'medium' | 'hard' | 'exam_level';

// ─── Memoized markdown ───────────────────────────────────────────────────
const MemoMd = memo(function MemoMd({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {content}
    </ReactMarkdown>
  );
});
MemoMd.displayName = 'MemoMd';

// ─── Difficulty meta ─────────────────────────────────────────────────────
const DIFF_META: Record<string, { label: string; badge: string }> = {
  foundation: { label: 'Foundation',  badge: 'bg-blue-900/50 text-blue-400 border-blue-800/40' },
  easy:       { label: 'Easy',        badge: 'bg-emerald-900/50 text-emerald-400 border-emerald-800/40' },
  medium:     { label: 'Medium',      badge: 'bg-amber-900/50 text-amber-400 border-amber-800/40' },
  hard:       { label: 'Hard',        badge: 'bg-orange-900/50 text-orange-400 border-orange-800/40' },
  exam_level: { label: 'Exam Level',  badge: 'bg-red-900/50 text-red-400 border-red-800/40' },
  very_hard:  { label: 'Very Hard',   badge: 'bg-red-900/50 text-red-400 border-red-800/40' },
};

const TOPIC_DIFF_META: Record<string, { label: string; dot: string }> = {
  beginner:     { label: 'Beginner',     dot: 'bg-emerald-400' },
  intermediate: { label: 'Intermediate', dot: 'bg-amber-400'   },
  advanced:     { label: 'Advanced',     dot: 'bg-red-400'     },
};

// ─── Problem card component with progressive hints ─────────────────────
function ProblemCard({
  prob,
  index,
  hintLevel,
  onAdvanceHint,
}: {
  prob: Problem;
  index: number;
  hintLevel: number; // 0=hidden, 1=hint, 2=answer, 3=full solution
  onAdvanceHint: () => void;
}) {
  const meta = DIFF_META[prob.difficulty] ?? { label: prob.difficulty, badge: 'bg-slate-200 text-slate-600 border-slate-300' };

  // Extract first step of solution as hint
  const solutionLines = prob.solution_steps?.split('\n').filter(l => l.trim()) || [];
  const hintText = solutionLines.length > 0 ? solutionLines[0] : 'Think about the core concept involved.';

  const hintLabels = ['Show hint', 'Show answer', 'Show full solution', ''];

  return (
    <div
      className="rounded-2xl border overflow-hidden transition-shadow hover:shadow-md"
      style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
    >
      <div className="p-5 sm:p-6">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-md"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
          >
            #{index + 1}
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${meta.badge}`}>
            {meta.label}
          </span>
          <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
            {prob.marks}m
          </span>
        </div>

        {/* Question */}
        <div className="adoris-prose text-[15px] leading-relaxed mb-4">
          <MemoMd content={prob.question_text} />
        </div>

        {/* MCQ options */}
        {prob.options && prob.options.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {prob.options.map((opt, oIdx) => (
              <div key={oIdx} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-bold shrink-0 mt-0.5 w-5" style={{ color: 'var(--text-muted)' }}>
                  {String.fromCharCode(65 + oIdx)}.
                </span>
                <div className="adoris-prose text-sm">
                  <MemoMd content={opt} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progressive hint section */}
        <div className="border-t pt-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
          
          {/* Hint level 1: conceptual nudge */}
          {hintLevel >= 1 && (
            <div className="hint-card rounded-xl p-4" style={{ background: 'rgba(45,106,79,0.06)', border: '1px solid rgba(45,106,79,0.15)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--accent)' }}>💡 Hint</p>
              <div className="adoris-prose text-sm" style={{ color: 'var(--text-secondary)' }}>
                <MemoMd content={hintText} />
              </div>
            </div>
          )}

          {/* Hint level 2: answer */}
          {hintLevel >= 2 && (
            <div className="hint-card rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--success)' }}>
                Answer{prob.options && prob.correct_index !== undefined && ` — ${String.fromCharCode(65 + prob.correct_index)}`}
              </p>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{prob.answer}</p>
            </div>
          )}

          {/* Hint level 3: full solution */}
          {hintLevel >= 3 && (
            <div className="rounded-xl p-4" style={{ background: 'var(--bg-muted)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Full Solution</p>
              <div className="adoris-prose text-sm" style={{ color: 'var(--text-secondary)' }}>
                <MemoMd content={prob.solution_steps} />
              </div>
            </div>
          )}

          {/* Advance button */}
          {hintLevel < 3 && (
            <button
              onClick={onAdvanceHint}
              className="flex items-center gap-2 text-xs font-semibold transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {hintLabels[hintLevel]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function ProblemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [fileName, setFileName] = useState<string | null>(null);
  const [practiceTopics, setPracticeTopics] = useState<PracticeTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<PracticeTopic | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintLevels, setHintLevels] = useState<Record<string, number>>({});
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [existingSets, setExistingSets] = useState<ProblemSetData[]>([]);
  const [completedTopics, setCompletedTopics] = useState<Set<string>>(new Set());
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [focusMode, setFocusMode] = useState(true); // one-at-a-time by default
  const [focusIndex, setFocusIndex] = useState(0);

  // ─── Fetch filename ──────────────────────────────────────────────────
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

  // ─── Load existing problem sets ──────────────────────────────────────
  const loadExistingSets = useCallback(async (fn: string) => {
    try {
      const res = await fetch(`/api/pdfs/problem-sets?fileName=${encodeURIComponent(fn)}&chapterId=${id}`);
      const data = await res.json();
      if (data.success && data.problemSets) {
        const mapped: ProblemSetData[] = data.problemSets.map((ps: { topic: string; problems: Problem[] | { problems: Problem[] } }) => ({
          topic: ps.topic,
          problems: Array.isArray(ps.problems) ? ps.problems : ((ps.problems as { problems: Problem[] })?.problems || []),
        }));
        setExistingSets(mapped);
        setCompletedTopics(new Set(mapped.filter(s => s.problems.length > 0).map(s => s.topic)));
      }
    } catch {/* ignore */}
  }, [id]);

  // ─── Load/generate practice topics ──────────────────────────────────
  const loadTopics = useCallback(async (forceRefresh = false) => {
    if (!fileName) return;
    setLoadingTopics(true);
    setError(null);

    try {
      const session = loadSession(id);

      // Use cached topics unless forced refresh
      if (!forceRefresh && session?.chapterPlan?.practice_topics?.length) {
        setPracticeTopics(session.chapterPlan.practice_topics);
        setLoadingTopics(false);
        await loadExistingSets(fileName);
        return;
      }

      // If no chapter plan at all, generate one first
      let pagePlans = session?.chapterPlan?.page_plans;
      let chapterTitle = session?.chapterPlan?.chapter_title || fileName;

      if (!pagePlans || pagePlans.length === 0 || forceRefresh) {
        const cpRes = await fetch('/api/pdfs/chapter-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chapterId: id, fileName }),
        });
        const cpData = await cpRes.json();
        if (cpData.success && cpData.chapterPlan) {
          pagePlans = cpData.chapterPlan.page_plans;
          chapterTitle = cpData.chapterPlan.chapter_title || fileName;
          const currentSession = loadSession(id);
          if (currentSession) saveSession({ ...currentSession, chapterPlan: cpData.chapterPlan });
        }
      }

      if (!pagePlans || pagePlans.length === 0) {
        setError('No chapter plan available. Try uploading a clearer PDF or re-analyzing.');
        setLoadingTopics(false);
        return;
      }

      // Generate curated practice topics via LLM
      const ptRes = await fetch('/api/pdfs/practice-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pagePlans, chapterTitle }),
      });
      const ptData = await ptRes.json();

      if (ptData.success && ptData.practice_topics?.length) {
        const topics: PracticeTopic[] = ptData.practice_topics;
        setPracticeTopics(topics);
        const currentSession = loadSession(id);
        if (currentSession?.chapterPlan) {
          saveSession({ ...currentSession, chapterPlan: { ...currentSession.chapterPlan, practice_topics: topics } });
        }
      } else {
        setError('Could not generate practice topics. Please try again.');
      }

      await loadExistingSets(fileName);
    } catch (err) {
      console.error(err);
      setError('Failed to load topics. Check your connection and try again.');
    } finally {
      setLoadingTopics(false);
    }
  }, [fileName, id, loadExistingSets]);

  useEffect(() => {
    if (fileName) loadTopics();
  }, [fileName, loadTopics]);

  // ─── Generate / load problems for a topic ────────────────────────────
  const handleSelectTopic = useCallback(async (topic: PracticeTopic) => {
    if (loadingProblems) return;
    setSelectedTopic(topic);
    setError(null);
    setHintLevels({});
    setDifficultyFilter('all');
    setFocusIndex(0);

    // Check cache — match on topic label or source_topics
    const cached = existingSets.find(s =>
      s.topic === topic.label || topic.source_topics?.includes(s.topic)
    );
    if (cached && cached.problems.length > 0) {
      setProblems(cached.problems);
      return;
    }

    setLoadingProblems(true);
    setProblems([]);

    try {
      const session = loadSession(id);
      const res = await fetch('/api/pdfs/problem-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: id,
          fileName: fileName!,
          topic: topic.label,
          keyConcepts: topic.key_concepts,
          chapterTitle: session?.chapterPlan?.chapter_title || fileName,
        }),
      });

      const data = await res.json();
      if (data.success && data.problemSet) {
        const probs: Problem[] = data.problemSet.problems || [];
        const problemArray = Array.isArray(probs) ? probs : ((probs as unknown as { problems: Problem[] })?.problems || []);
        setProblems(problemArray);
        setCompletedTopics(prev => new Set([...prev, topic.label]));
      } else {
        throw new Error(data.error || 'Failed to load problems');
      }
    } catch (e) {
      setError(`Failed to generate problems: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoadingProblems(false);
    }
  }, [existingSets, fileName, id, loadingProblems]);

  const filteredProblems = useMemo(
    () => difficultyFilter === 'all' ? problems : problems.filter(p => p.difficulty === difficultyFilter),
    [problems, difficultyFilter]
  );

  const advanceHint = useCallback((pid: string) => {
    setHintLevels(prev => ({ ...prev, [pid]: Math.min((prev[pid] || 0) + 1, 3) }));
  }, []);

  // ─── Loading state ────────────────────────────────────────────────────
  if (loadingTopics) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: 'var(--bg-base)' }}>
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {fileName ? `Curating practice topics for "${fileName}"…` : 'Loading…'}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This may take a few seconds the first time.</p>
      </div>
    );
  }

  const doneCount = completedTopics.size;
  const totalCount = practiceTopics.length;

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>

      {/* Mobile Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="md:hidden fixed inset-0 z-50 flex" onClick={() => setShowMobileSidebar(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} />
          <div className="relative flex flex-col border-r overflow-hidden w-80 max-w-[85vw]" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }} onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Topics</h2>
              <button onClick={() => setShowMobileSidebar(false)} className="w-7 h-7 flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {totalCount > 0 && (
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Topics practised</span>
                  <span className="text-[11px] font-bold" style={{ color: doneCount === totalCount ? 'var(--success)' : 'var(--text-secondary)' }}>{doneCount}/{totalCount}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: totalCount ? `${(doneCount / totalCount) * 100}%` : '0%', background: doneCount === totalCount ? 'var(--success)' : 'var(--accent)' }} />
                </div>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {practiceTopics.map((topic, idx) => {
                const isSelected = selectedTopic?.label === topic.label;
                const isDone = completedTopics.has(topic.label) || existingSets.some(s => s.topic === topic.label || topic.source_topics?.includes(s.topic));
                const topicDiff = TOPIC_DIFF_META[topic.difficulty] ?? TOPIC_DIFF_META.intermediate;
                return (
                  <button key={topic.label} onClick={() => { handleSelectTopic(topic); setShowMobileSidebar(false); }}
                    className="w-full text-left p-3 rounded-xl transition-all"
                    style={isSelected ? { background: 'rgba(240,165,0,0.12)', outline: '1px solid var(--accent)' } : { background: 'transparent' }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold mt-0.5" style={isSelected ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>{isDone ? '✓' : idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight" style={{ color: isSelected ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{topic.label}</div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${topicDiff.dot}`} />
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{topicDiff.label}</span>
                          {isDone && <span className="text-[10px] ml-auto" style={{ color: 'var(--success)' }}>✓ done</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <Link href={`/dashboard/exam/${id}`} className="block w-full py-2.5 text-center text-xs font-semibold rounded-xl" style={{ background: 'var(--accent)', color: '#fff' }}>Full Exam</Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop Sidebar ──────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex w-72 flex-col shrink-0 border-r overflow-hidden"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Link
              href="/dashboard"
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0"
              style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
              aria-label="Back to dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>Practice Problems</h1>
              <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }} title={fileName || ''}>
                {fileName}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {totalCount > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Topics practised
                </span>
                <span className="text-[11px] font-bold" style={{ color: doneCount === totalCount ? 'var(--success)' : 'var(--text-secondary)' }}>
                  {doneCount}/{totalCount}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-muted)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: totalCount ? `${(doneCount / totalCount) * 100}%` : '0%',
                    background: doneCount === totalCount ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Topic list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {practiceTopics.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
              <span className="text-3xl">🔍</span>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No practice topics found. Try re-analyzing the chapter.
              </p>
              <button
                onClick={() => loadTopics(true)}
                className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                Re-analyse Chapter
              </button>
            </div>
          ) : (
            practiceTopics.map((topic, idx) => {
              const isSelected = selectedTopic?.label === topic.label;
              const isDone = completedTopics.has(topic.label) ||
                existingSets.some(s => s.topic === topic.label || topic.source_topics?.includes(s.topic));
              const topicDiff = TOPIC_DIFF_META[topic.difficulty] ?? TOPIC_DIFF_META.intermediate;

              return (
                <button
                  key={topic.label}
                  onClick={() => handleSelectTopic(topic)}
                  className="w-full text-left p-3 rounded-xl transition-all"
                  style={isSelected
                    ? { background: 'rgba(240,165,0,0.12)', outline: '1px solid var(--accent)' }
                    : { background: 'transparent' }
                  }
                >
                  <div className="flex items-start gap-2.5">
                    {/* Index badge */}
                    <span
                      className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold mt-0.5"
                      style={isSelected
                        ? { background: 'var(--accent)', color: '#fff' }
                        : { background: 'var(--bg-muted)', color: 'var(--text-muted)' }
                      }
                    >
                      {isDone ? '✓' : idx + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium leading-tight"
                        style={{ color: isSelected ? 'var(--accent)' : isDone ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                      >
                        {topic.label}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${topicDiff.dot}`} />
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {topicDiff.label}
                        </span>
                        {isDone && (
                          <span className="text-[10px] ml-auto" style={{ color: 'var(--success)' }}>✓ done</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Sidebar footer */}
        <div className="p-3 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/exam/${id}`}
              className="flex-1 py-2.5 text-center text-xs font-semibold rounded-xl transition-colors"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              Full Exam
            </Link>
            <button
              onClick={() => loadTopics(true)}
              className="px-3 py-2.5 text-xs rounded-xl border transition-colors"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              title="Re-analyse chapter topics"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 h-12 border-b shrink-0" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/dashboard" className="w-7 h-7 flex items-center justify-center rounded-lg shrink-0" style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
            <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {selectedTopic ? selectedTopic.label : 'Practice'}
            </span>
          </div>
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
          >
            Topics
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
        {/* Error banner */}
        {error && (
          <div className="m-6 p-4 rounded-xl border flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)', color: 'var(--error)' }}>
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Empty / select topic state */}
        {!selectedTopic && !error && (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5 border"
              style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
            >
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Select a Topic</h2>
            <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Pick a topic from the sidebar. Each topic generates 20 graded problems — from foundation recall to exam-level application.
            </p>
            {totalCount > 0 && (
              <p className="text-xs mt-4 px-3 py-1.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                {totalCount} topics available · start with #1
              </p>
            )}
          </div>
        )}

        {/* Loading problems */}
        {selectedTopic && loadingProblems && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Generating 20 problems on <strong style={{ color: 'var(--text-primary)' }}>{selectedTopic.label}</strong>…
            </p>
          </div>
        )}

        {/* Problems view */}
        {selectedTopic && !loadingProblems && problems.length > 0 && (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Topic header */}
            <div className="mb-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {selectedTopic.label}
                  </h2>
                  {selectedTopic.description && (
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {selectedTopic.description}
                    </p>
                  )}
                </div>
                <span
                  className="shrink-0 text-[11px] font-semibold px-3 py-1 rounded-full border"
                  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                >
                  {TOPIC_DIFF_META[selectedTopic.difficulty]?.label ?? selectedTopic.difficulty}
                </span>
              </div>
            </div>

            {/* Focus mode toggle */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {([
                  { key: 'all',        label: 'All',         count: problems.length },
                  { key: 'foundation', label: 'Foundation',  count: problems.filter(p => p.difficulty === 'foundation').length },
                  { key: 'easy',       label: 'Easy',        count: problems.filter(p => p.difficulty === 'easy').length },
                  { key: 'medium',     label: 'Medium',      count: problems.filter(p => p.difficulty === 'medium').length },
                  { key: 'hard',       label: 'Hard',        count: problems.filter(p => p.difficulty === 'hard').length },
                  { key: 'exam_level', label: 'Exam',        count: problems.filter(p => p.difficulty === 'exam_level').length },
                ] as { key: DifficultyFilter; label: string; count: number }[])
                  .filter(f => f.key === 'all' || f.count > 0)
                  .map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => { setDifficultyFilter(key); setFocusIndex(0); }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all"
                      style={difficultyFilter === key
                        ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                      }
                    >
                      {label} · {count}
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setFocusMode(f => !f)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border transition-all shrink-0 ml-2"
                style={{
                  background: focusMode ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                  color: focusMode ? 'var(--accent)' : 'var(--text-muted)',
                  borderColor: focusMode ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {focusMode ? '🎯 Focus' : '📋 All'}
              </button>
            </div>

            {/* Problem cards */}
            {focusMode ? (
              /* Focus mode: one at a time */
              <div>
                {filteredProblems[focusIndex] && (
                  <>
                    <div className="mb-3 text-xs font-medium text-center" style={{ color: 'var(--text-muted)' }}>
                      Problem {focusIndex + 1} of {filteredProblems.length}
                    </div>
                    <ProblemCard
                      key={filteredProblems[focusIndex].id || focusIndex}
                      prob={filteredProblems[focusIndex]}
                      index={focusIndex}
                      hintLevel={hintLevels[filteredProblems[focusIndex].id || String(focusIndex)] || 0}
                      onAdvanceHint={() => advanceHint(filteredProblems[focusIndex].id || String(focusIndex))}
                    />
                    <div className="flex justify-between items-center mt-4">
                      <button
                        onClick={() => setFocusIndex(i => Math.max(0, i - 1))}
                        disabled={focusIndex === 0}
                        className="px-5 py-2.5 text-sm font-medium disabled:opacity-30 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        ← Previous
                      </button>
                      <div className="flex gap-1">
                        {filteredProblems.map((_, i) => (
                          <button key={i} onClick={() => setFocusIndex(i)}
                            className="w-2 h-2 rounded-full transition-all"
                            style={{ background: i === focusIndex ? 'var(--accent)' : 'var(--bg-muted)' }}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => setFocusIndex(i => Math.min(filteredProblems.length - 1, i + 1))}
                        disabled={focusIndex >= filteredProblems.length - 1}
                        className="px-5 py-2.5 text-sm font-medium rounded-xl disabled:opacity-30 transition-colors"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        Next →
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* All mode: show all problems */
              <div className="space-y-4">
                {filteredProblems.map((prob, idx) => (
                  <ProblemCard
                    key={prob.id || idx}
                    prob={prob}
                    index={idx}
                    hintLevel={hintLevels[prob.id || String(idx)] || 0}
                    onAdvanceHint={() => advanceHint(prob.id || String(idx))}
                  />
                ))}
              </div>
            )}

            {/* Footer: next topic CTA */}
            {filteredProblems.length === problems.length && (
              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
                {(() => {
                  const currentIdx = practiceTopics.findIndex(t => t.label === selectedTopic.label);
                  const next = practiceTopics[currentIdx + 1];
                  return next ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Up next</p>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{next.label}</p>
                      </div>
                      <button
                        onClick={() => handleSelectTopic(next)}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        Next Topic →
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
                        🎉 All topics practised! Ready to take the full exam?
                      </p>
                      <Link
                        href={`/dashboard/exam/${id}`}
                        className="inline-block px-6 py-3 rounded-xl text-sm font-semibold"
                        style={{ background: 'var(--accent)', color: '#fff' }}
                      >
                        Take Full Exam
                      </Link>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
