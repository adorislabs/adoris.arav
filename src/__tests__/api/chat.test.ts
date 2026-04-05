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
    (askTutor as any).mockResolvedValue({ success: true, text: 'Default response' });
    (extractMasteryData as any).mockResolvedValue(null);
  });

  // ── Auth & Validation ─────────────────────────────────────────────

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

  // ── Normal Response ───────────────────────────────────────────────

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

  it('returns fallback message when askTutor reports failure', async () => {
    (askTutor as any).mockResolvedValue({ success: false, text: '' });

    const res = await POST(makeRequest({ message: 'test', chapterId: 'fail-ch' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe('Sorry, taking a moment to process.');
    expect(data.mastery_achieved).toBe(false);
  });

  it('returns 500 on internal error', async () => {
    (askTutor as any).mockRejectedValue(new Error('LLM down'));

    const res = await POST(makeRequest({ message: 'test', chapterId: 'error-test' }));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Internal Server Error');
  });

  // ── Multi-bubble [SPLIT] parsing ──────────────────────────────────

  it('splits response on [SPLIT] into messages array', async () => {
    (askTutor as any).mockResolvedValue({
      success: true,
      text: 'First bubble [SPLIT] Second bubble [SPLIT] Third bubble',
    });

    const res = await POST(makeRequest({ message: 'hello', chapterId: 'split-test' }));
    const data = await res.json();
    expect(data.messages).toEqual(['First bubble', 'Second bubble', 'Third bubble']);
    expect(data.message).toBe('First bubble'); // legacy single-value fallback
  });

  it('returns message as first segment when no [SPLIT] present', async () => {
    (askTutor as any).mockResolvedValue({ success: true, text: 'Single response.' });

    const res = await POST(makeRequest({ message: 'hi', chapterId: 'no-split' }));
    const data = await res.json();
    expect(data.messages).toEqual(['Single response.']);
    expect(data.message).toBe('Single response.');
  });

  // ── Mastery detection ─────────────────────────────────────────────

  it('detects ACHIEVED_MASTERY in response', async () => {
    (askTutor as any).mockResolvedValue({
      success: true,
      text: 'You have demonstrated full understanding. ACHIEVED_MASTERY',
    });

    const res = await POST(makeRequest({ message: 'I understand it fully', chapterId: 'mastery-test' }));
    const data = await res.json();
    expect(data.mastery_achieved).toBe(true);
  });

  it('mastery_achieved is false when ACHIEVED_MASTERY not in response', async () => {
    (askTutor as any).mockResolvedValue({ success: true, text: 'Good work, keep going.' });

    const res = await POST(makeRequest({ message: 'ok', chapterId: 'no-mastery' }));
    const data = await res.json();
    expect(data.mastery_achieved).toBe(false);
  });

  // ── observerContext forwarding ────────────────────────────────────

  it('passes observerContext to askTutor', async () => {
    const observerContext = { confusion_points: ['fractions'], mastery_status: 'struggling' };

    await POST(makeRequest({
      message: 'help me',
      history: [{ role: 'user', content: 'prev' }],
      lessonPlan: null,
      chapterId: 'ctx-test',
      observerContext,
    }));

    expect(askTutor).toHaveBeenCalledWith(
      'help me',
      '',
      [{ role: 'user', content: 'prev' }],
      observerContext,
    );
  });

  it('passes null observerContext when not provided', async () => {
    await POST(makeRequest({ message: 'test', chapterId: 'no-ctx' }));
    expect(askTutor).toHaveBeenCalledWith('test', '', [], null);
  });

  // ── Observer frequency throttling ────────────────────────────────

  it('triggers extractMasteryData on every 4th message for a chapterId', async () => {
    const chapterId = `observer-trigger-${Date.now()}`;
    (extractMasteryData as any).mockResolvedValue({ mastery_status: 'progressing' });

    // First 3 messages — observer must NOT be called
    for (let i = 0; i < 3; i++) {
      await POST(makeRequest({ message: `msg ${i}`, chapterId }));
    }
    expect(extractMasteryData).not.toHaveBeenCalled();

    // 4th message — observer SHOULD fire
    const res = await POST(makeRequest({
      message: 'msg 4',
      history: [{ role: 'user', content: 'prev' }],
      chapterId,
    }));
    expect(extractMasteryData).toHaveBeenCalledTimes(1);
    const data = await res.json();
    expect(data.observerData).toEqual({ mastery_status: 'progressing' });
  });

  it('isolates message counters per chapterId', async () => {
    const chapterA = `iso-a-${Date.now()}`;
    const chapterB = `iso-b-${Date.now()}`;
    (extractMasteryData as any).mockResolvedValue({ mastery_status: 'ok' });

    // 3 messages on A, 3 on B — neither should trigger the observer (8th total, but not 4th per chapter)
    for (let i = 0; i < 3; i++) {
      await POST(makeRequest({ message: `a${i}`, chapterId: chapterA }));
      await POST(makeRequest({ message: `b${i}`, chapterId: chapterB }));
    }
    expect(extractMasteryData).not.toHaveBeenCalled();
  });

  it('still returns 200 when the observer (extractMasteryData) throws', async () => {
    const chapterId = `observer-fail-${Date.now()}`;
    (extractMasteryData as any).mockRejectedValue(new Error('observer down'));

    // Exhaust to the 4th message so the observer fires (and fails)
    for (let i = 0; i < 3; i++) {
      await POST(makeRequest({ message: `m${i}`, chapterId }));
    }
    vi.clearAllMocks();
    (askTutor as any).mockResolvedValue({ success: true, text: 'still works' });
    (extractMasteryData as any).mockRejectedValue(new Error('observer down'));

    const res = await POST(makeRequest({ message: 'm4', chapterId }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.observerData).toBeNull();
    expect(data.message).toBeDefined();
  });

  it('passes full history to askTutor', async () => {
    const history = [
      { role: 'user', content: 'What is osmosis?' },
      { role: 'assistant', content: 'Osmosis is ...' },
    ];

    await POST(makeRequest({ message: 'Tell me more', history, chapterId: 'hist-test' }));

    expect(askTutor).toHaveBeenCalledWith('Tell me more', '', history, null);
  });

  it('serializes lessonPlan to JSON string for askTutor pageContext', async () => {
    const lessonPlan = { core_explanation: 'Newton laws', latex_questions: ['What is F=ma?'] };

    await POST(makeRequest({ message: 'explain', history: [], lessonPlan, chapterId: 'lp-test' }));

    const [, pageContext] = (askTutor as any).mock.calls[0];
    expect(pageContext).toBe(JSON.stringify(lessonPlan));
  });
});
