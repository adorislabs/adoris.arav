'use client';

import { use, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';
import { loadSession, saveSession } from '@/lib/session/sessionStore';

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

interface TopicIndexEntry {
  keyConcepts: string[];
  sourceTopics: string[];
}

type DifficultyFilter = 'all' | 'foundation' | 'easy' | 'medium' | 'hard' | 'exam_level';

const LOW_VALUE_TOPIC_PATTERNS = [
  /person\s*\d+/i,
  /opens?\s+every\s+locker/i,
  /locker\s*puzzle\s*mechanics?/i,
  /step\s*\d+/i,
  /iteration\s*\d*/i,
];

function sanitizeTopics(rawTopics: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawTopics) {
    const topic = (raw || '').replace(/\s+/g, ' ').trim();
    if (!topic) continue;
    if (topic.length < 4 || topic.length > 70) continue;
    if (LOW_VALUE_TOPIC_PATTERNS.some((pattern) => pattern.test(topic))) continue;

    const normalized = topic.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(topic);
  }

  return result;
}

function toKeywordSet(topic: string): Set<string> {
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'of', 'on', 'in', 'to', 'for', 'with', 'between',
    'based', 'state', 'concept', 'definition', 'connection', 'mechanics', 'numbers', 'number',
    'person', 'opens', 'every', 'using', 'from', 'into', 'over', 'under', 'by', 'is', 'are',
  ]);

  const normalized = topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = normalized
    .split(' ')
    .filter((t) => t.length >= 3 && !stopwords.has(t));

  return new Set(tokens);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / Math.min(a.size, b.size);
}

function prettifyTopicLabel(topic: string): string {
  return topic
    .replace(/^definition\s+of\s+/i, '')
    .replace(/^concept\s+of\s+/i, '')
    .replace(/^connection\s+between\s+/i, '')
    .replace(/^relationship\s+between\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildGeneralizedTopicIndex(
  rawTopics: string[],
  conceptsByTopic: Record<string, string[]>,
  maxTopics = 12
): Record<string, TopicIndexEntry> {
  const sanitized = sanitizeTopics(rawTopics);
  const clusters: Array<{ representative: string; keywords: Set<string>; sourceTopics: string[] }> = [];

  for (const topic of sanitized) {
    const pretty = prettifyTopicLabel(topic);
    const keywords = toKeywordSet(pretty);

    let bestIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < clusters.length; i++) {
      const score = overlapRatio(keywords, clusters[i].keywords);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestScore >= 0.6) {
      clusters[bestIdx].sourceTopics.push(topic);
      for (const token of keywords) clusters[bestIdx].keywords.add(token);
      if (pretty.length < clusters[bestIdx].representative.length) {
        clusters[bestIdx].representative = pretty;
      }
    } else {
      clusters.push({ representative: pretty, keywords, sourceTopics: [topic] });
    }
  }

  clusters.sort((a, b) => b.sourceTopics.length - a.sourceTopics.length || a.representative.length - b.representative.length);

  const index: Record<string, TopicIndexEntry> = {};
  for (const cluster of clusters.slice(0, maxTopics)) {
    const keyConcepts = new Set<string>();
    for (const sourceTopic of cluster.sourceTopics) {
      (conceptsByTopic[sourceTopic] || []).forEach((c) => keyConcepts.add(c));
    }

    index[cluster.representative] = {
      sourceTopics: cluster.sourceTopics,
      keyConcepts: Array.from(keyConcepts).slice(0, 12),
    };
  }

  return index;
}

export default function ProblemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [fileName, setFileName] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [existingSets, setExistingSets] = useState<ProblemSetData[]>([]);
  const [topicIndex, setTopicIndex] = useState<Record<string, TopicIndexEntry>>({});

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

  // ─── Load topics from chapter plan ────────────────────────────────────
  useEffect(() => {
    if (!fileName) return;

    const session = loadSession(id);
    let allTopics: string[] = [];
    let computedTopicIndex: Record<string, TopicIndexEntry> = {};
    
    if (session?.chapterPlan?.page_plans) {
      const rawTopics = session.chapterPlan.page_plans.flatMap((p) => p.topics);
      const conceptsByTopic: Record<string, string[]> = {};
      session.chapterPlan.page_plans.forEach((p) => {
        p.topics.forEach((t) => {
          if (!conceptsByTopic[t]) conceptsByTopic[t] = [];
          conceptsByTopic[t].push(...(p.key_concepts || []));
        });
      });

      computedTopicIndex = buildGeneralizedTopicIndex(rawTopics, conceptsByTopic);
      allTopics = Object.keys(computedTopicIndex);
    }
    
    // Fallback: If no chapter plan or it's empty, pull topics from lessonPlans (dev bypass case)
    if (allTopics.length === 0 && session?.lessonPlans) {
      const lessonTopics = Object.values(session.lessonPlans).flatMap(lp => lp.suggestive_doubts || []);
      if (lessonTopics.length > 0) {
        computedTopicIndex = buildGeneralizedTopicIndex(lessonTopics, {}, 12);
        allTopics = Object.keys(computedTopicIndex);
      }
    }

    setTopicIndex(computedTopicIndex);
    setTopics(allTopics);

    // Also load any existing problem sets from Supabase
    async function loadExisting() {
      try {
        const res = await fetch(`/api/pdfs/problem-sets?fileName=${encodeURIComponent(fileName!)}&chapterId=${id}`);
        const data = await res.json();
        if (data.success && data.problemSets) {
          const mapped = data.problemSets.map((ps: { topic: string; problems: Problem[] | { problems: Problem[] } }) => ({
            topic: ps.topic,
            problems: Array.isArray(ps.problems) ? ps.problems : (ps.problems?.problems || []),
          }));
          setExistingSets(mapped);

          if (allTopics.length === 0 && mapped.length > 0) {
            const fallbackIndex = buildGeneralizedTopicIndex(mapped.map((ps: ProblemSetData) => ps.topic), {}, 12);
            setTopicIndex(fallbackIndex);
            setTopics(Object.keys(fallbackIndex));
          }
        }
      } catch {
        // Ignore — Supabase may not have the table yet
      } finally {
        setInitialLoading(false);
      }
    }
    loadExisting();
  }, [fileName, id]);

  // ─── Generate / load problems for a topic ─────────────────────────────
  const loadProblemsForTopic = async (topic: string) => {
    if (!fileName) return;

    setError(null);
    setSelectedTopic(topic);
    setExpandedSolutions({});
    setDifficultyFilter('all');

    // Check if we already have this topic cached
    const cached = existingSets.find(s => s.topic === topic);
    if (cached && cached.problems.length > 0) {
      setProblems(cached.problems);
      return;
    }

    setLoading(true);
    setProblems([]);

    try {
      const session = loadSession(id);
      const entry = topicIndex[topic];

      const res = await fetch('/api/pdfs/problem-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId: id,
          fileName: fileName!,
          topic,
          keyConcepts: entry?.keyConcepts || [],
          chapterTitle: session?.chapterPlan?.chapter_title || fileName,
        }),
      });

      const data = await res.json();
      if (data.success && data.problemSet) {
        // Handle both nested and flat problem structures
        const probs = data.problemSet.problems || [];
        const problemArray = Array.isArray(probs) ? probs : (probs.problems || []);
        setProblems(problemArray);
      } else {
        console.error('API response:', data);
        throw new Error(data.error || 'Failed to load problems');
      }
    } catch (e) {
      console.error('Failed to load problems:', e);
      setError(`Failed to load problems: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshTopics = async () => {
    if (!fileName) return;
    setInitialLoading(true);
    try {
      const cpRes = await fetch('/api/pdfs/chapter-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: id, fileName }),
      });
      const cpData = await cpRes.json();
      if (cpData.success && cpData.chapterPlan) {
        const rawTopics = cpData.chapterPlan.page_plans.flatMap((p: { topics?: string[] }) => p.topics || []);
        const conceptsByTopic: Record<string, string[]> = {};
        cpData.chapterPlan.page_plans.forEach((p: { topics?: string[]; key_concepts?: string[] }) => {
          (p.topics || []).forEach((t: string) => {
            if (!conceptsByTopic[t]) conceptsByTopic[t] = [];
            conceptsByTopic[t].push(...(p.key_concepts || []));
          });
        });

        const index = buildGeneralizedTopicIndex(rawTopics, conceptsByTopic, 12);
        setTopicIndex(index);
        setTopics(Object.keys(index));
        setError(null);

        // Update local session
        const session = loadSession(id);
        if (session) {
          const updated = { ...session, chapterPlan: cpData.chapterPlan };
          saveSession(updated);
        }
      }
    } catch {
      console.error('Failed to refresh topics');
    } finally {
      setInitialLoading(false);
    }
  };

  const toggleSolution = (id: string) => {
    setExpandedSolutions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredProblems = difficultyFilter === 'all'
    ? problems
    : problems.filter(p => p.difficulty === difficultyFilter);

  const diffColors: Record<string, string> = {
    foundation: 'bg-blue-900/40 text-blue-400',
    easy: 'bg-green-900/40 text-green-400',
    medium: 'bg-amber-900/40 text-amber-400',
    hard: 'bg-orange-900/40 text-orange-400',
    exam_level: 'bg-red-900/40 text-red-400',
    very_hard: 'bg-red-900/40 text-red-400', // backward compat
  };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]" style={{ background: 'var(--bg-base)' }}>
        <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b z-10" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="transition-colors" style={{ color: 'var(--text-muted)' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-primary)'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <div>
            <h1 className="text-xl font-bold font-serif tracking-tight">Practice Problems</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>{fileName}</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Topic Selector */}
        <div className="w-72 flex flex-col shrink-0 border-r" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-sm font-bold">Problem Bank</h2>
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }} title={fileName || 'Loading...'}>{fileName || 'Loading...'}</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {topics.length === 0 ? (
              <div className="flex flex-col items-center py-8 px-4 text-center">
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                  No topics found.<br />
                  <span className="block mt-2 text-[11px] text-slate-400">
                    This usually means the chapter plan failed to process or the PDF is missing topic structure.<br />
                    Try scanning again, or check if your PDF is clear and well-formatted.<br />
                    If the problem persists, contact support or try a different file.
                  </span>
                </p>
                <button
                  onClick={refreshTopics}
                  className="text-[10px] font-bold px-4 py-2 rounded-lg transition-all"
                  style={{ background: 'var(--accent)', color: 'white' }}
                >
                  🔄 Scan Chapter for Topics
                </button>
              </div>
            ) : (
              topics.map((topic) => {
                const hasGenerated = existingSets.some(s => s.topic === topic && s.problems.length > 0);
                const cachedCount = existingSets.find(s => s.topic === topic)?.problems?.length || 0;
                const isSelected = selectedTopic === topic;
                return (
                  <button
                    key={topic}
                    onClick={() => loadProblemsForTopic(topic)}
                    className="w-full text-left p-3 rounded-xl transition-all border"
                    style={isSelected ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                  >
                    <div className="font-medium text-sm leading-tight">{topic}</div>
                    <div className="text-[10px] mt-1.5 opacity-80 flex items-center justify-between">
                      <span>{hasGenerated ? `${cachedCount} Problems available` : 'Not generated yet'}</span>
                      {hasGenerated && (
                        <span className="text-green-500 font-medium">● cached</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="p-4 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
            <Link
              href={`/dashboard/exam/${id}`}
              className="w-full flex justify-center items-center py-3 text-white rounded-xl font-medium transition-colors shadow-sm"
              style={{ background: 'var(--error)' }}
            >
              📝 Take Full Exam
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 rounded-xl border border-red-500/50 bg-red-900/30 text-red-300">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div>
                  <h3 className="font-semibold mb-1">Error</h3>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}
          {!selectedTopic ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                  <span className="text-2xl">📚</span>
                </div>
                <h2 className="text-xl font-bold mb-2 text-slate-200">Select a Topic</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Choose a topic from the sidebar to generate or view problems.
                  Each topic gets 20 problems covering various difficulty levels and angles.
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mb-4" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}></div>
              <p style={{ color: 'var(--text-muted)' }}>Generating 20 problems for <strong>{selectedTopic}</strong>...</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {/* Topic Header */}
              <div className="mb-5">
                <h2 className="text-xl font-bold">{selectedTopic}</h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{filteredProblems.length} problems</p>
              </div>

              {/* Difficulty Filter */}
              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Filter by difficulty</p>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: 'all', label: 'All', color: 'bg-slate-800 text-slate-300' },
                    { key: 'foundation', label: '🧱 Foundation', color: 'bg-blue-900 text-blue-300' },
                    { key: 'easy', label: '✅ Easy', color: 'bg-green-900 text-green-300' },
                    { key: 'medium', label: '⚡ Medium', color: 'bg-amber-900 text-amber-300' },
                    { key: 'hard', label: '🔥 Hard', color: 'bg-orange-900 text-orange-300' },
                    { key: 'exam_level', label: '🎯 Exam Level', color: 'bg-red-900 text-red-300' },
                  ] as { key: DifficultyFilter; label: string; color: string }[]).map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => setDifficultyFilter(key)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                        difficultyFilter === key
                          ? 'text-slate-900 border-transparent' + ' bg-[var(--accent)]'
                          : `${color} border-transparent hover:opacity-80`
                      }`}
                    >
                      {label} {key !== 'all' && `(${problems.filter(p => p.difficulty === key).length})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Problems List */}
              <div className="space-y-4">
                {filteredProblems.map((prob, idx) => {
                  const difficultyColor = diffColors[prob.difficulty] || 'bg-slate-800 text-slate-300';
                  return (
                    <div key={prob.id || idx} className="rounded-2xl border overflow-hidden shadow-sm" style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${difficultyColor}`}>
                            {prob.difficulty.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300 font-medium">
                            {prob.marks}m
                          </span>
                        </div>

                        <div className="prose prose-sm max-w-none prose-invert mb-6 text-[15px] leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {prob.question_text}
                          </ReactMarkdown>
                        </div>
                        
                        {/* MCQ Options */}
                        {prob.options && prob.options.length > 0 && (
                          <div className="mt-3 space-y-1.5 mb-4">
                            {prob.options.map((opt, oIdx) => (
                              <div key={oIdx} className="flex items-start text-sm" style={{ color: 'var(--text-secondary)' }}>
                                <span className="font-bold mr-2" style={{ color: 'var(--text-muted)' }}>{String.fromCharCode(65 + oIdx)}.</span>
                                <div className="prose prose-sm max-w-none prose-invert">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{opt}</ReactMarkdown>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Answer Toggle */}
                        <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
                          <button
                            onClick={() => toggleSolution(prob.id || `${idx}`)}
                            className="w-full text-xs font-semibold py-2 transition-colors text-left flex items-center justify-between"
                            style={{ color: 'var(--accent)' }}
                          >
                            <span>{expandedSolutions[prob.id || `${idx}`] ? '🔽 Hide Solution' : '🔑 Show Answer & Solution'}</span>
                            {prob.options && prob.correct_index !== undefined && expandedSolutions[prob.id || `${idx}`] && (
                              <span className="text-emerald-500">Answer: {String.fromCharCode(65 + prob.correct_index)}</span>
                            )}
                          </button>

                          {expandedSolutions[prob.id || `${idx}`] && (
                            <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--bg-muted)' }}>
                              <div className="text-sm font-semibold text-emerald-500 mb-2">Answer: {prob.answer}</div>
                              <div className="prose prose-sm max-w-none prose-invert" style={{ color: 'var(--text-secondary)' }}>
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {prob.solution_steps}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
