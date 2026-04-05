import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
  };
  return { mockSupabase };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

import { POST, GET } from '@/app/api/tracking/struggle/route';

function makeRequest(method: string, body?: Record<string, unknown>, url?: string) {
  return new Request(url || 'http://localhost/api/tracking/struggle', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

// ── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/tracking/struggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockSupabase.from.mockReset();
  });

  it('returns 200 on a valid insert', async () => {
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    const res = await POST(makeRequest('POST', { concept: 'fractions', topic: 'math' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('returns 401 when user is unauthenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest('POST', { concept: 'fractions' }));
    expect(res.status).toBe(401);
  });

  it('returns 500 when the database insert fails', async () => {
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: { message: 'unique constraint violation' } }),
    });

    const res = await POST(makeRequest('POST', { concept: 'fractions', topic: 'math' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('unique constraint violation');
  });

  it('defaults topic to "unknown" when omitted', async () => {
    let capturedRow: Record<string, unknown> = {};
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        capturedRow = row;
        return Promise.resolve({ error: null });
      }),
    });

    await POST(makeRequest('POST', { concept: 'fractions' }));
    expect(capturedRow.topic).toBe('unknown');
  });

  it('defaults chapterId to null when omitted', async () => {
    let capturedRow: Record<string, unknown> = {};
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        capturedRow = row;
        return Promise.resolve({ error: null });
      }),
    });

    await POST(makeRequest('POST', { topic: 'math', concept: 'fractions' }));
    expect(capturedRow.chapter_id).toBeNull();
  });

  it('clamps severity above 5 down to 5', async () => {
    let capturedRow: Record<string, unknown> = {};
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        capturedRow = row;
        return Promise.resolve({ error: null });
      }),
    });

    await POST(makeRequest('POST', { concept: 'fractions', severity: 99 }));
    expect(capturedRow.severity).toBe(5);
  });

  it('clamps severity below 1 up to 1', async () => {
    let capturedRow: Record<string, unknown> = {};
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        capturedRow = row;
        return Promise.resolve({ error: null });
      }),
    });

    await POST(makeRequest('POST', { concept: 'fractions', severity: -5 }));
    expect(capturedRow.severity).toBe(1);
  });

  it('stores all provided fields correctly', async () => {
    let capturedRow: Record<string, unknown> = {};
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        capturedRow = row;
        return Promise.resolve({ error: null });
      }),
    });

    await POST(makeRequest('POST', {
      chapterId: 'ch42',
      topic: 'algebra',
      concept: 'quadratic',
      struggleType: 'hint_used',
      severity: 3,
      context: { hint_count: 2 },
    }));

    expect(capturedRow).toMatchObject({
      chapter_id: 'ch42',
      topic: 'algebra',
      concept: 'quadratic',
      struggle_type: 'hint_used',
      severity: 3,
      context: { hint_count: 2 },
      user_id: 'test-user',
    });
  });

  it('defaults struggleType to "wrong_answer" when omitted', async () => {
    let capturedRow: Record<string, unknown> = {};
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        capturedRow = row;
        return Promise.resolve({ error: null });
      }),
    });

    await POST(makeRequest('POST', { concept: 'fractions' }));
    expect(capturedRow.struggle_type).toBe('wrong_answer');
  });
});

// ── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/tracking/struggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
  });

  it('returns 401 when user is unauthenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns struggles and success:true for authenticated user', async () => {
    mockSupabase.order.mockResolvedValue({ data: [], error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.struggles).toEqual([]);
  });

  it('aggregates struggle events by topic', async () => {
    const mockRows = [
      { id: 1, topic: 'fractions', concept: 'addition', struggle_type: 'wrong_answer', severity: 4, context: {}, resolved: false, created_at: '2024-01-02', chapters: null },
      { id: 2, topic: 'fractions', concept: 'subtraction', struggle_type: 'hint_used', severity: 2, context: {}, resolved: true, created_at: '2024-01-01', chapters: null },
      { id: 3, topic: 'algebra', concept: 'factoring', struggle_type: 'wrong_answer', severity: 5, context: {}, resolved: false, created_at: '2024-01-03', chapters: null },
    ];
    mockSupabase.order.mockResolvedValue({ data: mockRows, error: null });

    const res = await GET();
    const data = await res.json();

    expect(data.aggregated).toHaveLength(2); // 'fractions' and 'algebra'

    const fractions = data.aggregated.find((a: { topic: string }) => a.topic === 'fractions');
    expect(fractions?.totalEvents).toBe(2);
    expect(fractions?.unresolvedCount).toBe(1);
    expect(fractions?.concepts).toContain('addition');
    expect(fractions?.concepts).toContain('subtraction');

    const algebra = data.aggregated.find((a: { topic: string }) => a.topic === 'algebra');
    expect(algebra?.totalEvents).toBe(1);
    expect(algebra?.unresolvedCount).toBe(1);
  });

  it('sorts aggregated results by unresolvedCount descending', async () => {
    const mockRows = [
      // 1 unresolved fractions
      { id: 1, topic: 'fractions', concept: 'add', struggle_type: 'wrong_answer', severity: 1, context: {}, resolved: false, created_at: '2024-01-01', chapters: null },
      // 2 unresolved algebra  
      { id: 2, topic: 'algebra', concept: 'linear', struggle_type: 'wrong_answer', severity: 1, context: {}, resolved: false, created_at: '2024-01-01', chapters: null },
      { id: 3, topic: 'algebra', concept: 'quad', struggle_type: 'wrong_answer', severity: 1, context: {}, resolved: false, created_at: '2024-01-02', chapters: null },
    ];
    mockSupabase.order.mockResolvedValue({ data: mockRows, error: null });

    const res = await GET();
    const data = await res.json();

    // algebra (2 unresolved) should come before fractions (1 unresolved)
    expect(data.aggregated[0].topic).toBe('algebra');
    expect(data.aggregated[1].topic).toBe('fractions');
  });

  it('returns empty struggles gracefully when the DB query errors', async () => {
    mockSupabase.order.mockResolvedValue({ data: null, error: { message: 'DB down' } });

    const res = await GET();
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.struggles).toEqual([]);
    // On error the route returns early without aggregated — that's fine
    expect(data.aggregated).toBeUndefined();
  });

  it('includes chapter title in aggregated chapters list', async () => {
    const mockRows = [
      {
        id: 1, topic: 'fractions', concept: 'add', struggle_type: 'wrong_answer',
        severity: 2, context: {}, resolved: false, created_at: '2024-01-01',
        chapters: { chapter_title: 'Ch 3: Fractions', books: { title: 'NCERT 5', subject: 'Maths' } },
      },
    ];
    mockSupabase.order.mockResolvedValue({ data: mockRows, error: null });

    const res = await GET();
    const data = await res.json();
    const fractions = data.aggregated.find((a: { topic: string }) => a.topic === 'fractions');
    expect(fractions?.chapters).toContain('Ch 3: Fractions');
  });
});
