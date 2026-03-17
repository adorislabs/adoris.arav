import { GoogleGenAI } from '@google/genai';
import type { PagePlanEntry } from '@/lib/session/sessionStore';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

/**
 * Passes a single base-64 encoded PDF page to Gemini to extract all text, 
 * describe diagrams, and output a structured JSON Lesson Plan for the Tutor.
 * 
 * Now also accepts an optional PagePlanEntry from the chapter plan to ensure
 * full coverage of all listed topics.
 */
export async function ocrPdfPage(base64Pdf: string, pagePlanEntry?: PagePlanEntry): Promise<any> {
  try {
    const coverageInstruction = pagePlanEntry
      ? `
MANDATORY COVERAGE CHECK:
The chapter plan says this page covers these topics: ${JSON.stringify(pagePlanEntry.topics)}
And these key concepts: ${JSON.stringify(pagePlanEntry.key_concepts)}

You MUST address ALL of the above topics in your core_explanation. If you find additional topics on this page that are NOT listed above, include them too — but you CANNOT skip any listed topic.
Your latex_questions MUST test at least the most important concept from the key_concepts list.
Your suggestive_doubts MUST relate to the listed topics.
`
      : '';

    const prompt = `
You are an expert pedagogical engine. I have provided a single page from a textbook/document.
Please analyze this page and output a STRICT JSON object representing a "Lesson Plan" for an AI Tutor.

${coverageInstruction}

The JSON must follow exactly this structure:
{
  "core_explanation": "A very conversational, Hinglish explanation of the main concept on this page. Pretend you are explaining it directly to your smart friend Arav. DO NOT say 'Hello students', do not address a class, and do not use his name excessively. Make it thorough — cover EVERY topic visible on this page, don't skip even small subtopics or side notes.",
  "latex_questions": [
    "A deep reasoning question about the topic. If it involves math, physics, or formulas, MUST use strictly formatted LaTeX inside $...$ or $$...$$ markers."
  ],
  "manim_visual_ideas": "A short text describing a mental visual analogy or a precursor script idea for a Manim animation based on any diagrams or core formulas on the page.",
  "suggestive_doubts": [
    "A button label for a common student doubt (e.g. 'Formula derivation mein problem hai')",
    "Another doubt button (e.g. 'Can you give a real life example?')",
    "A third doubt to help the student identify friction points"
  ]
}

DO NOT wrap the JSON in markdown blocks like \`\`\`json. Return ONLY raw JSON text.
Ensure LaTeX escapes are properly handled in the string (e.g., \\\\frac).
`;

    const response = await ai.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { 
               inlineData: { 
                 mimeType: 'application/pdf', 
                 data: base64Pdf 
               } 
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const outputText = response.text || '{}';
    return JSON.parse(outputText);
    
  } catch (error) {
    console.error('OCR Error:', error);
    return { error: 'Failed to generate lesson plan.' };
  }
}
