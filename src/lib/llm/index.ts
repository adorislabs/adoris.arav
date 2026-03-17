import { GoogleGenAI } from '@google/genai';
import { tutorConfig, getTutorPersonalityBlock } from '@/config/tutorConfig';
import { config } from '@/config';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

const studentName = config.app.studentName;

/**
 * The Gatekeeper Prompt — now driven by tutorConfig
 */
const getGatekeeperPrompt = (lessonPlanJson: string) => `
You are an elite, highly knowledgeable personal tutor designed specifically to mentor a single student named ${studentName}.
Your tone must be calm, scholarly, mature, and deeply insightful. You are NOT an overly enthusiastic AI. Do not use exclamation marks excessively, avoid corny jokes, and do not act overly excited.
Your PRIMARY job is to evaluate ${studentName}'s understanding and guide him to mastery of the current page's concepts.

${getTutorPersonalityBlock()}

HERE IS THE AI GENERATED LESSON PLAN FOR THIS SPECIFIC PAGE:
${lessonPlanJson}

HOW TO RESPOND:

1. CURRENT PAGE QUESTIONS: If ${studentName} asks about topics from this lesson plan, use the Socratic method — ask sharp, leading questions that force him to think deeply.
2. OFF-TOPIC ACADEMIC QUESTIONS: If ${studentName} asks about related academic concepts not on this page, answer precisely and intellectually, then guide him back: "That's an excellent lateral connection, ${studentName}. Let's apply that thinking back to..."
3. UNRELATED/NON-ACADEMIC: If the question is completely off-topic, be brief and professional: "Let's stay focused on the material, ${studentName}."
4. MASTERY UNLOCK: When ${studentName} has correctly answered ALL the "latex_questions" from the lesson plan AND shown deep understanding of all key concepts, say exactly "ACHIEVED_MASTERY" anywhere in your response. Do NOT say this prematurely.
5. STRUGGLING STUDENT: If ${studentName} is genuinely stuck after 2 attempts, provide a clear, concise mental model using "manim_visual_ideas" as an analogy, then ask a simpler foundational question.
6. CONTINUITY: Treat this as an ongoing same-day study session across pages. Never open with "aaj hum", "today we will", or any fresh-day intro unless the student explicitly starts a new day/session.
`;

/**
 * Trim chat history to the configured max to keep context window (and costs) small.
 */
function trimHistory(history: any[]): any[] {
  if (!history || history.length <= tutorConfig.maxHistoryMessages) return history;
  return history.slice(-tutorConfig.maxHistoryMessages);
}

export async function askTutor(message: string, lessonPlanJson: string, history: any[] = []) {
  try {
    const trimmedHistory = trimHistory(history);
    
    const prompt = `
${getGatekeeperPrompt(lessonPlanJson)}

RECENT CONVERSATION HISTORY (last ${trimmedHistory.length} messages):
${trimmedHistory.map((m: any) => `${m.role}: ${m.content}`).join('\n')}

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
export async function extractMasteryData(chatHistory: any[]) {
  try {
    const trimmed = trimHistory(chatHistory);
    const prompt = `
Analyze this chat transcript between a tutor and a student. Output a JSON object detailing:
1. "confusion_point": Specific concept where the student showed confusion.
2. "eureka_analogy": Any analogy that caused a 'Eureka' moment.
3. "mastery_status": One of "not_started", "struggling", "progressing", "mastered".

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
