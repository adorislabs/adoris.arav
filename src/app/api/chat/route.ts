import { NextResponse } from 'next/server';
import { askTutor, extractMasteryData } from '@/lib/llm';
import { tutorConfig } from '@/config/tutorConfig';

// Track message count per session for Observer frequency throttling
const messageCounters = new Map<string, number>();

export async function POST(req: Request) {
  try {
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

    return NextResponse.json({
      message: responseText,
      mastery_achieved,
      observerData,
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
