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

describe('POST /api/tracking/struggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
  });

  it('accepts missing topic with default', async () => {
    mockSupabase.insert.mockReturnThis();
    mockSupabase.single?.mockResolvedValue?.({ data: null, error: null });
    // insert chain returns no error
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
    const res = await POST(makeRequest('POST', { chapterId: 'ch1', concept: 'fractions' }));
    expect(res.status).toBe(200);
  });

  it('accepts missing chapterId with null default', async () => {
    mockSupabase.from.mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
    const res = await POST(makeRequest('POST', { topic: 'math', concept: 'fractions' }));
    expect(res.status).toBe(200);
  });
});

describe('GET /api/tracking/struggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
  });

  it('returns data for authenticated user', async () => {
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.order.mockResolvedValue({ data: [], error: null });

    const res = await GET(makeRequest('GET'));
    const data = await res.json();
    expect(data.success).toBeDefined();
  });
});
