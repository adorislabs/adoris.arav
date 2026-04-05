import { NextResponse } from 'next/server';
import { askTutor, extractMasteryData } from '@/lib/llm';
import { tutorConfig } from '@/config/tutorConfig';
import { createClient } from '@/lib/supabase/server';

// Track message count per session for Observer frequency throttling
const messageCounters = new Map<string, number>();
// Cap to prevent unbounded growth across long-running processes
const MAX_COUNTERS = 500;

export async function POST(req: Request) {
  try {
    // Require an authenticated session (passkey gate ensures all users have one)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { message, history, lessonPlan, currentPage, pagePlanEntry, chapterId, observerContext } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Build the page context from the lesson plan
    const pageContext = lessonPlan ? JSON.stringify(lessonPlan) : '';

    // Build history context from chat history
    const historyContext = (history || []).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }));

    // Call 1: The Gatekeeper Tutor — now receives observer insights for adaptive teaching
    const tutorResponse = await askTutor(message, pageContext, historyContext, observerContext || null);

    // Call 2: The Hidden Observer — only every Nth message (cost optimization)
    const counterKey = chapterId || 'default';
    const count = (messageCounters.get(counterKey) || 0) + 1;
    if (messageCounters.size >= MAX_COUNTERS) {
      // Evict oldest half to prevent unbounded growth
      const keys = [...messageCounters.keys()].slice(0, MAX_COUNTERS / 2);
      keys.forEach((k) => messageCounters.delete(k));
    }
    messageCounters.set(counterKey, count);

    let observerData = null;
    if (count % tutorConfig.observerFrequency === 0) {
      try {
        observerData = await extractMasteryData([...historyContext, { role: 'user', content: message }]);
        if (observerData) {
          console.log(`[OBSERVER] Run #${count / tutorConfig.observerFrequency} — Mastery Update:`, observerData);
        }
      } catch (err) {
        console.error('[OBSERVER] Failed:', err);
      }
    }

    // Detect mastery from model response
    const responseText = tutorResponse.success ? tutorResponse.text : 'Sorry, taking a moment to process.';
    const mastery_achieved = responseText?.includes('ACHIEVED_MASTERY') || false;

    // Split on [SPLIT] to produce separate chat bubbles
    const messages = (responseText || '')
      .split(/\[SPLIT\]/g)
      .map((s: string) => s.trim())
      .filter(Boolean);

    return NextResponse.json({
      messages,                                  // preferred: array of bubble segments
      message: messages[0] || responseText,      // legacy fallback
      mastery_achieved,
      observerData,
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
