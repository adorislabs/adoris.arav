import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must run before any imports) ──────────────────────────────

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
  };
  return { mockSupabase };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock('@/lib/llm/examGenerator', () => ({
  gradeWrittenAnswers: vi.fn().mockResolvedValue([]),
  autoGradeMCQ: vi.fn().mockReturnValue(0),
}));

import { POST, GET } from '@/app/api/exams/submit/route';
import { gradeWrittenAnswers, autoGradeMCQ } from '@/lib/llm/examGenerator';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a fluent Supabase-like chain mock that is both:
 *  - thenable (so `await chain` resolves to resolvedValue)
 *  - chainable (select/eq/order/etc all return the same chain)
 *  - single() returns a Promise resolving to resolvedValue
 */
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {
    then: (fn: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(resolvedValue).then(fn, rej),
    catch: (fn: (e: unknown) => unknown) =>
      Promise.resolve(resolvedValue).catch(fn),
    single: vi.fn().mockResolvedValue(resolvedValue),
  };
  for (const m of ['select', 'eq', 'order', 'insert', 'update', 'limit', 'range', 'neq', 'match', 'in', 'is']) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

function makeRequest(method: string, body?: Record<string, unknown>, url?: string) {
  return new Request(url || 'http://localhost/api/exams/submit', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Minimal valid exam structure for testing */
const sampleExam = {
  exam_title: 'Chapter 1 Test',
  total_marks: 60,
  time_limit_minutes: 60,
  sections: [{
    section_name: 'Section A',
    marks_per_question: 1,
    questions: [{
      question_number: 1, marks: 1, difficulty: 'medium',
      type: 'mcq', topic: 'Addition',
      question_text: 'What is 2+2?',
      options: ['3', '4', '5', '6'], correct_index: 1,
      answer_key: '4', marking_scheme: '1M',
    }],
  }],
};

// ── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/exams/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSupabase.from.mockReset();
    (gradeWrittenAnswers as any).mockResolvedValue([]);
    (autoGradeMCQ as any).mockReturnValue(0);
  });

  it('returns 400 when chapterId is missing', async () => {
    const res = await POST(makeRequest('POST', { examData: sampleExam, totalMarks: 60 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/chapterId/);
  });

  it('returns 400 when examData is missing', async () => {
    const res = await POST(makeRequest('POST', { chapterId: 'ch1', totalMarks: 60 }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest('POST', { chapterId: 'ch1', examData: sampleExam }));
    expect(res.status).toBe(401);
  });

  it('runs MCQ auto-grade and returns scores', async () => {
    (autoGradeMCQ as any).mockReturnValue(8);

    const countChain = makeChain({ count: 2, data: null, error: null });
    const insertChain = makeChain({ data: { id: 'res-1', attempt_number: 3 }, error: null });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest('POST', {
      chapterId: 'ch1',
      examData: sampleExam,
      answers: { 0: { selected: 1, answered: true } },
      totalMarks: 60,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.mcqScore).toBe(8);
    expect(data.writtenScore).toBe(0);
    expect(data.totalScore).toBe(8);
    expect(data.attemptNumber).toBe(3);
    expect(data.resultId).toBe('res-1');
  });

  it('combines MCQ and written LLM scores into totalScore', async () => {
    (autoGradeMCQ as any).mockReturnValue(10);
    (gradeWrittenAnswers as any).mockResolvedValue([
      { question_number: 2, marks_awarded: 5, max_marks: 5, feedback: 'Well done.' },
    ]);

    const countChain = makeChain({ count: 0, data: null, error: null });
    const insertChain = makeChain({ data: { id: 'res-2', attempt_number: 1 }, error: null });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest('POST', {
      chapterId: 'ch1', examData: sampleExam, totalMarks: 60,
    }));

    const data = await res.json();
    expect(data.totalScore).toBe(15); // 10 + 5
    expect(data.writtenScore).toBe(5);
    expect(data.writtenGrades).toHaveLength(1);
  });

  it('falls back to MCQ-only score when LLM grading fails', async () => {
    (autoGradeMCQ as any).mockReturnValue(7);
    (gradeWrittenAnswers as any).mockRejectedValue(new Error('LLM timeout'));

    const countChain = makeChain({ count: 0, data: null, error: null });
    const insertChain = makeChain({ data: { id: 'res-3', attempt_number: 1 }, error: null });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest('POST', {
      chapterId: 'ch1', examData: sampleExam, totalMarks: 60,
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.totalScore).toBe(7);
    expect(data.writtenScore).toBe(0);
    expect(data.writtenGrades).toEqual([]);
  });

  it('marks passed=true when score meets the 40% threshold', async () => {
    (autoGradeMCQ as any).mockReturnValue(24); // Math.ceil(60 * 0.4) = 24 → exactly passes

    const countChain = makeChain({ count: 0, data: null, error: null });
    let capturedRow: Record<string, unknown> = {};
    const insertChain = makeChain({ data: { id: 'r', attempt_number: 1 }, error: null });
    (insertChain.insert as ReturnType<typeof vi.fn>).mockImplementation((row: Record<string, unknown>) => {
      capturedRow = row;
      return insertChain;
    });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    await POST(makeRequest('POST', { chapterId: 'ch1', examData: sampleExam, totalMarks: 60 }));
    expect(capturedRow.passed).toBe(true);
  });

  it('marks passed=false when score is below the 40% threshold', async () => {
    (autoGradeMCQ as any).mockReturnValue(23); // 23 < 24

    const countChain = makeChain({ count: 0, data: null, error: null });
    let capturedRow: Record<string, unknown> = {};
    const insertChain = makeChain({ data: { id: 'r', attempt_number: 1 }, error: null });
    (insertChain.insert as ReturnType<typeof vi.fn>).mockImplementation((row: Record<string, unknown>) => {
      capturedRow = row;
      return insertChain;
    });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    await POST(makeRequest('POST', { chapterId: 'ch1', examData: sampleExam, totalMarks: 60 }));
    expect(capturedRow.passed).toBe(false);
  });

  it('sets attempt_number to existing count + 1', async () => {
    const countChain = makeChain({ count: 4, data: null, error: null });
    let capturedRow: Record<string, unknown> = {};
    const insertChain = makeChain({ data: { id: 'r', attempt_number: 5 }, error: null });
    (insertChain.insert as ReturnType<typeof vi.fn>).mockImplementation((row: Record<string, unknown>) => {
      capturedRow = row;
      return insertChain;
    });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    await POST(makeRequest('POST', { chapterId: 'ch1', examData: sampleExam, totalMarks: 60 }));
    expect(capturedRow.attempt_number).toBe(5);
  });

  it('returns 500 when the database insert fails', async () => {
    const countChain = makeChain({ count: 0, data: null, error: null });
    const insertChain = makeChain({ data: null, error: { message: 'unique_violation' } });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    const res = await POST(makeRequest('POST', {
      chapterId: 'ch1', examData: sampleExam, totalMarks: 60,
    }));
    expect(res.status).toBe(500);
  });

  it('stores integrity metadata (tabSwitches, integrityFlags) in the row', async () => {
    const countChain = makeChain({ count: 0, data: null, error: null });
    let capturedRow: Record<string, unknown> = {};
    const insertChain = makeChain({ data: { id: 'r', attempt_number: 1 }, error: null });
    (insertChain.insert as ReturnType<typeof vi.fn>).mockImplementation((row: Record<string, unknown>) => {
      capturedRow = row;
      return insertChain;
    });
    mockSupabase.from.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

    await POST(makeRequest('POST', {
      chapterId: 'ch1', examData: sampleExam, totalMarks: 60,
      tabSwitches: 3,
      integrityFlags: { copy_paste_detected: true },
      timeTaken: 1800,
    }));

    expect(capturedRow.tab_switches).toBe(3);
    expect(capturedRow.integrity_flags).toEqual({ copy_paste_detected: true });
    expect(capturedRow.time_taken_seconds).toBe(1800);
  });
});

// ── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/exams/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockSupabase.from.mockReset();
  });

  it('returns 401 when user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?chapterId=ch1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when neither id nor chapterId is provided', async () => {
    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/chapterId|id/i);
  });

  it('returns a list of attempts for a chapterId', async () => {
    const attempts = [
      { id: 'r1', score: 40, total_marks: 60, passed: true, attempt_number: 1, completed_at: '2024-01-01' },
      { id: 'r2', score: 25, total_marks: 60, passed: false, attempt_number: 2, completed_at: '2024-01-02' },
    ];
    const listChain = makeChain({ data: attempts, error: null });
    mockSupabase.from.mockReturnValueOnce(listChain);

    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?chapterId=ch1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.attempts).toEqual(attempts);
  });

  it('returns empty array when a chapter has no attempts', async () => {
    const listChain = makeChain({ data: [], error: null });
    mockSupabase.from.mockReturnValueOnce(listChain);

    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?chapterId=ch-new'));
    const data = await res.json();
    expect(data.attempts).toEqual([]);
  });

  it('returns empty array gracefully when the DB errors on a chapter list', async () => {
    const errorChain = makeChain({ data: null, error: { message: 'connection timeout' } });
    mockSupabase.from.mockReturnValueOnce(errorChain);

    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?chapterId=ch1'));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.attempts).toEqual([]);
  });

  it('returns a single attempt by id', async () => {
    const attempt = { id: 'r1', student_name: 'Arya', score: 45, total_marks: 60, passed: true };
    const singleChain = makeChain({ data: attempt, error: null });
    mockSupabase.from.mockReturnValueOnce(singleChain);

    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?id=r1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.attempt).toEqual(attempt);
  });

  it('returns 404 when the requested attempt id is not found', async () => {
    const notFoundChain = makeChain({ data: null, error: { message: 'Row not found' } });
    mockSupabase.from.mockReturnValueOnce(notFoundChain);

    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?id=nonexistent'));
    expect(res.status).toBe(404);
  });

  it('id param takes precedence over chapterId param', async () => {
    const attempt = { id: 'r1', student_name: 'Arya', score: 45, total_marks: 60, passed: true };
    const singleChain = makeChain({ data: attempt, error: null });
    mockSupabase.from.mockReturnValueOnce(singleChain);

    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit?id=r1&chapterId=ch1'));
    const data = await res.json();
    // Should return single attempt, not a list
    expect(data.attempt).toBeDefined();
    expect(data.attempts).toBeUndefined();
  });
});
