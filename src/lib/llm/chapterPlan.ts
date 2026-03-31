import { GoogleGenAI } from '@google/genai';
import type { ChapterPlan } from '@/lib/session/sessionStore';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

/**
 * Sends the entire PDF to Gemini and asks it to generate a structured
 * ChapterPlan that exhaustively maps every page's topics. This guarantees
 * that no topic or concept is accidentally skipped during the tutoring session.
 */
export async function generateChapterPlan(base64Pdf: string, fileName: string): Promise<ChapterPlan> {
  try {
    const prompt = `
You are an expert pedagogical curriculum planner. I have provided an entire textbook chapter as a PDF document.

Your job is to produce a STRICT JSON object called a "Chapter Plan" that exhaustively maps EVERY single topic, concept, formula, theorem, definition, and example on EVERY page of this document. You must leave NOTHING out.

The file name is: "${fileName}"

JSON structure you MUST output:
{
  "chapter_title": "The title of this chapter or document",
  "total_pages": <number of pages in the PDF>,
  "page_plans": [
    {
      "page_number": 1,
      "topics": ["Topic A", "Topic B"],
      "key_concepts": ["Specific formula or theorem text", "Definition of X"],
      "estimated_difficulty": "easy" | "medium" | "hard",
      "quiz_worthy_concepts": ["Concepts that should appear in the final exam"]
    }
  ]
}

CRITICAL RULES:
1. There MUST be exactly one entry in page_plans for EVERY page in the PDF, even if a page is mostly blank.
2. Topics must be granular — do NOT lump multiple concepts into one topic. If a page covers "Newton's First Law" and "Inertia", list them separately.
3. key_concepts should include exact formulas (written in plain text or LaTeX), definitions, and theorems.
4. quiz_worthy_concepts should include the most important concepts that a student MUST master.
5. estimated_difficulty should reflect how challenging the content is for a typical student.

META-CONTENT FILTER — THIS IS CRITICAL:
The following types of page content are ADMINISTRATIVE/BOILERPLATE — they are NOT educational subject matter and must NOT be extracted as topics or concepts:
- Exam/test paper instructions: "Instructions to candidates", "Time allowed", "All questions are compulsory", "Write your name", "Do not turn over this paper", "End of Paper"
- Marking schemes, rubrics, mark allocation tables, answer keys belonging to a test paper
- Table of contents, index, chapter list
- Cover pages, title pages, copyright pages, publisher credits
- Bibliography, references, further reading lists
- Blank pages, filler pages, "This page intentionally left blank"
- Headers/footers: page numbers, school/institution name repeated on every page
- Any page that is purely about HOW to take an exam, not WHAT to learn

For such pages, set topics: [] and key_concepts: [] and quiz_worthy_concepts: [].
ONLY extract topics from pages that contain actual SUBJECT-MATTER educational content: explanations, definitions, theorems, worked examples, practice problems about the subject, diagrams explaining concepts.

DO NOT wrap the JSON in markdown blocks. Return ONLY raw JSON.
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
                data: base64Pdf,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const outputText = response.text || '{}';
    return JSON.parse(outputText) as ChapterPlan;
  } catch (error) {
    console.error('Chapter Plan Generation Error:', error);
    throw new Error('Failed to generate chapter plan');
  }
}
