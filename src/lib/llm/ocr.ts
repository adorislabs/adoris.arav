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
  "core_explanation": "A very conversational, Hinglish explanation of the main concept on this page. Pretend you are explaining it directly to your smart friend. CRITICAL RULES: (1) USE FREQUENT LINE BREAKS, MARKDOWN HEADINGS (###), AND BULLET POINTS. Never send walls of text. (2) Break it into digestible, bite-sized sections (e.g., ### Concept, ### Why It Matters, ### Example Walkthrough). (3) Start with a 1-2 sentence orientation: what this page is about and why it matters. (4) Cover EVERY topic visible on this page thoroughly. (5) DO NOT address a class or use the student's name.",
  "latex_questions": [
    "Question 1 (REMEMBER/UNDERSTAND level): A definition or identification question",
    "Question 2 (APPLY level): Use a formula/concept in a concrete scenario with numbers",
    "Question 3 (ANALYZE level): A deep 'Why does X happen?' or 'What if we changed Y?' question"
  ],
  "application_problem": "A novel mini-problem that applies the core concept in a new context (different from the textbook examples). This is the final test before mastery. Use LaTeX for any math.",
  "prerequisite_concepts": ["List of concepts from PREVIOUS pages the student should already know to understand this page"],
  "visual_aids": "A short inline SVG snippet, a Mermaid.js diagram code block, or a text description of a visual analogy that helps explain the concept. Prefer actual SVG or mermaid code the student can see rendered. For math, use diagrams; for processes, use flowcharts; for comparisons, use tables.",
  "suggestive_doubts": [
    "A button label for a common student doubt (e.g. 'Formula derivation mein problem hai')",
    "Another doubt button (e.g. 'Can you give a real life example?')",
    "A third doubt targeting a common misconception about this topic",
    "A fourth doubt for connecting this to a practical scenario"
  ]
}

CRITICAL RULES FOR QUESTION DESIGN:
- latex_questions MUST scaffold from easy → hard (Bloom's taxonomy: Remember → Understand → Apply → Analyze).
- Each question should test a DIFFERENT angle of the concept, not repeat the same idea.
- The application_problem should be something NOT on this textbook page — a fresh scenario that uses the same concept.
- suggestive_doubts should target the specific confusing parts of THIS page's content, not generic doubts.

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

    let outputText = response.text || '{}';
    // Clean markdown wrappers
    outputText = outputText.replace(/^```(?:json)?\s*|^\s*|\s*```$/g, '');
    
    try {
      return JSON.parse(outputText);
    } catch (parseError) {
      console.warn('Initial JSON parse failed, attempting sanitization...', parseError);
      // Fallback: Replace unescaped control characters (literal newlines, tabs) that break string literals
      outputText = outputText.replace(/[\n\r\t]+/g, ' ');
      return JSON.parse(outputText);
    }
    
  } catch (error) {
    console.error('OCR Error:', error);
    return { error: 'Failed to generate lesson plan.' };
  }
}
