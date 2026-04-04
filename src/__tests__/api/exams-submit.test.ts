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

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return { ...actual };
});

import { POST, GET } from '@/app/api/exams/submit/route';

function makeRequest(method: string, body?: Record<string, unknown>, url?: string) {
  return new Request(url || 'http://localhost/api/exams/submit', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('POST /api/exams/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
  });

  it('rejects missing chapterId', async () => {
    const res = await POST(makeRequest('POST', { studentName: 'Alice', score: 50, totalMarks: 60 }));
    expect(res.status).toBe(400);
  });

  it('rejects missing examData', async () => {
    const res = await POST(makeRequest('POST', { chapterId: 'ch1', studentName: 'Alice', totalMarks: 60 }));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/exams/submit', () => {
  it('requires chapterId parameter', async () => {
    const res = await GET(makeRequest('GET', undefined, 'http://localhost/api/exams/submit'));
    expect(res.status).toBe(400);
  });
});
