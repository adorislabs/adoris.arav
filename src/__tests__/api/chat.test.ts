import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM module
vi.mock('@/lib/llm', () => ({
  askTutor: vi.fn(),
  extractMasteryData: vi.fn(),
}));

vi.mock('@/config/tutorConfig', () => ({
  tutorConfig: { observerFrequency: 4 },
}));

// Mock Supabase so authenticated calls don't hit the network
const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } } }),
    },
  };
  return { mockSupabase };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

import { POST } from '@/app/api/chat/route';
import { askTutor, extractMasteryData } from '@/lib/llm';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user' } } });
  });

  it('returns 401 when unauthenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ message: 'test' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when message is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Message is required');
  });

  it('returns tutor response with mastery_achieved false', async () => {
    (askTutor as any).mockResolvedValue({ success: true, text: 'Great question! Here is the explanation...' });

    const res = await POST(makeRequest({
      message: 'What is 2+2?',
      history: [],
      lessonPlan: { core_explanation: 'Addition basics' },
      currentPage: 0,
      chapterId: 'test-chapter',
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toContain('Great question');
    expect(data.mastery_achieved).toBe(false);
    expect(data.observerData).toBeNull();
  });

  it('detects ACHIEVED_MASTERY in response', async () => {
    (askTutor as any).mockResolvedValue({ success: true, text: 'You have demonstrated full understanding. ACHIEVED_MASTERY' });

    const res = await POST(makeRequest({
      message: 'I understand it fully',
      history: [],
      chapterId: 'mastery-test',
    }));

    const data = await res.json();
    expect(data.mastery_achieved).toBe(true);
  });

  it('returns 500 on internal error', async () => {
    (askTutor as any).mockRejectedValue(new Error('LLM down'));

    const res = await POST(makeRequest({
      message: 'test',
      chapterId: 'error-test',
    }));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Internal Server Error');
  });
});
