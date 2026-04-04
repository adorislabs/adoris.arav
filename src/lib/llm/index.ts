import { GoogleGenAI } from '@google/genai';
import { tutorConfig, getTutorPersonalityBlock } from '@/config/tutorConfig';
import { config } from '@/config';

interface ChatMessage {
  role: string;
  content: string;
}

interface ObserverContext {
  confusion_points?: string[];
  gaps?: string[];
  analogies?: string[];
  mastery_status?: string;
  emotional_state?: string;
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const studentName = config.app.studentName;

/**
 * The Gatekeeper Prompt — driven by tutorConfig + observer feedback
 */
const getGatekeeperPrompt = (lessonPlanJson: string, observerContext?: ObserverContext | null) => {
  // Build adaptive context from observer data
  let observerBlock = '';
  if (observerContext && Object.keys(observerContext).length > 0) {
    const parts: string[] = [];
    if (observerContext.confusion_points?.length) {
      parts.push(`⚠️ ACTIVE CONFUSION POINTS (spend extra time here): ${observerContext.confusion_points.join(', ')}`);
    }
    if (observerContext.gaps?.length) {
      parts.push(`🔴 FOUNDATIONAL GAPS (may need prerequisite review): ${observerContext.gaps.join(', ')}`);
    }
    if (observerContext.analogies?.length) {
      parts.push(`✅ ANALOGIES THAT WORKED (reuse similar framing): ${observerContext.analogies.join(', ')}`);
    }
    if (observerContext.mastery_status) {
      parts.push(`📊 CURRENT MASTERY STATUS: ${observerContext.mastery_status}`);
    }
    if (observerContext.emotional_state) {
      parts.push(`🧠 EMOTIONAL STATE: ${observerContext.emotional_state} — adjust your tone accordingly`);
    }
    if (parts.length > 0) {
      observerBlock = `\nLIVE OBSERVER INSIGHTS (adapt your teaching based on this real-time data):\n${parts.join('\n')}\n`;
    }
  }

  return `
You are an elite, highly knowledgeable personal tutor designed specifically to mentor a single student named ${studentName}.
Your tone must be calm, scholarly, mature, and deeply insightful. You are NOT an overly enthusiastic AI. Do not use exclamation marks excessively, avoid corny jokes, and do not act overly excited.
Your PRIMARY job is to evaluate ${studentName}'s understanding and guide him to mastery of the current page's concepts.

${getTutorPersonalityBlock()}
${observerBlock}

HERE IS THE AI GENERATED LESSON PLAN FOR THIS SPECIFIC PAGE:
${lessonPlanJson}

HOW TO USE THE LESSON PLAN:
- "core_explanation" → Your starting point. Don't dump it verbatim; conversationalize it, break it into chunks, and pause for check-ins.
- "latex_questions" → Your ${tutorConfig.whyQuestionsPerPage} deep-reasoning probes. Ask them ONE AT A TIME. Wait for the student to respond.
- "suggestive_doubts" → Common friction points. If the student seems lost but doesn't articulate why, use these as gentle prompts: "Kahin aisa toh nahi ki..."
- "visual_aids" → Inline SVG, Mermaid.js diagrams, or visual analogies. Deploy when the student is stuck after 2 attempts, or proactively for complex spatial/relational concepts.

HOW TO RESPOND:

1. FIRST MESSAGE ON A NEW PAGE: Follow the TEACHING SEQUENCE — orient the student, begin explaining, then ask the first probe question. Do NOT ask all questions at once.
2. CURRENT PAGE QUESTIONS: Use the Socratic method — ask sharp, leading questions that force ${studentName} to think deeply.
3. OFF-TOPIC ACADEMIC QUESTIONS: Answer precisely and intellectually, then guide back: "Interesting tangent — let's connect that back to what we're studying..."
4. UNRELATED/NON-ACADEMIC: Be brief: "Let's stay focused on the material."
5. MASTERY UNLOCK: When ${studentName} has:
   (a) Correctly answered ALL the "latex_questions" from the lesson plan, AND
   (b) Demonstrated understanding by explaining the core concept in their own words, AND
   (c) Successfully applied the concept to at least one novel scenario
   ...ONLY THEN say exactly "ACHIEVED_MASTERY" anywhere in your response. Do NOT say this prematurely.
6. STRUGGLING STUDENT: If stuck after 2 attempts, provide a clear mental model (use "manim_visual_ideas"), then drop DOWN one Bloom's level with a simpler question. If still stuck, give the first step of the solution and ask them to continue.
7. CONTINUITY: Treat this as an ongoing same-day study session. Never open with "aaj hum", "today we will", or fresh-day intros.
8. ADAPTIVE PACING: If the observer reports "mastered" or "progressing" status, move faster through easy concepts. If "struggling", slow down and add more scaffolding steps.
`;
};

/**
 * Trim chat history to the configured max to keep context window (and costs) small.
 */
function trimHistory(history: ChatMessage[]): ChatMessage[] {
  if (!history || history.length <= tutorConfig.maxHistoryMessages) return history;
  return history.slice(-tutorConfig.maxHistoryMessages);
}

export async function askTutor(message: string, lessonPlanJson: string, history: ChatMessage[] = [], observerContext?: ObserverContext | null) {
  try {
    const trimmedHistory = trimHistory(history);
    
    const prompt = `
${getGatekeeperPrompt(lessonPlanJson, observerContext)}

RECENT CONVERSATION HISTORY (last ${trimmedHistory.length} messages):
${trimmedHistory.map((m: ChatMessage) => `${m.role}: ${m.content}`).join('\n')}

STUDENT MESSAGE: ${message}
`;
    const response = await ai.models.generateContent({
      model: tutorConfig.tutorModel,
      contents: prompt,
    });
    
    return { success: true, text: response.text || 'Kuch technical error aayi hai. Wapas try karo!' };
  } catch (error) {
    console.error('LLM Error:', error);
    return { success: false, text: 'System error. Please retry later.' };
  }
}

/**
 * Hidden Observer Prompt — uses cheaper Flash-Lite model
 */
export async function extractMasteryData(chatHistory: ChatMessage[]) {
  try {
    const trimmed = trimHistory(chatHistory);
    const prompt = `
Analyze this chat transcript between a tutor and a student. Output a strict JSON object detailing:
1. "confusion_points": Array of strings — specific concepts where the student showed confusion or gave wrong answers. Be precise (e.g., "applying chain rule to composite functions" not just "calculus").
2. "gaps": Array of strings — missing foundational knowledge that prevents understanding of current material. If a gap previously existed but the student has now demonstrated mastery of it in recent messages, EXCLUDE it so gaps don't accumulate forever.
3. "analogies": Array of strings — any analogies or mental models used by the tutor that caused a visible "aha" moment (student responded with correct understanding immediately after).
4. "mastery_status": One of "not_started", "struggling", "progressing", "near_mastery", "mastered".
   - "struggling" = 3+ wrong answers or confused responses in the last few messages
   - "progressing" = mix of right and wrong, showing improvement trend
   - "near_mastery" = mostly correct, 1-2 minor gaps remaining
   - "mastered" = all questions answered correctly with clear understanding
5. "emotional_state": One of "engaged", "frustrated", "bored", "confused", "confident".
   - "frustrated" = short/terse answers, repeated wrong attempts, expressions of difficulty
   - "bored" = minimal effort answers, off-topic drift, very quick shallow responses
   - "confused" = asking clarifying questions, contradictory answers
   - "confident" = explaining concepts back accurately, asking deeper follow-up questions
   - "engaged" = normal active learning flow
6. "learning_velocity": One of "fast", "normal", "slow" — how quickly the student is grasping concepts relative to their difficulty.

IMPORTANT: Base your analysis on EVIDENCE from the transcript. Do not guess. If there is insufficient data for a field, use reasonable defaults ("not_started", "engaged", "normal").

CHAT TRANSCRIPT:
${JSON.stringify(trimmed)}
`;

    const response = await ai.models.generateContent({
      model: tutorConfig.observerModel,  // Uses Flash-Lite (cheaper)
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Extraction Error:', error);
    return null;
  }
}
