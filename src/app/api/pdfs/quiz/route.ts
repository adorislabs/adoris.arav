import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

/** Strip administrative/meta-content topics that leak in from cover/instruction pages */
const META_TOPIC_PATTERNS = [
  /\binstruction/i, /\bcandidate/i, /\bmarking scheme/i, /\banswer booklet/i,
  /\bdo not turn/i, /\bblank page/i, /\btable of content/i, /\bcontent[s]?\s*page/i,
  /\bindex\b/i, /\bbibliograph/i, /\bcopyright/i, /\badministrat/i, /\binvigilat/i,
  /\btime allowed/i, /\btotal marks/i, /\bwrite your/i, /\bend of paper/i,
  /\bthis paper/i, /\btest paper/i, /\bexam paper/i, /\bquestion paper/i,
  /^\[administrative/i, /^title page$/i, /^cover page$/i, /^toc$/i,
];
function filterSubjectTopics(topics: string[]): string[] {
  return topics.filter(t => t && t.trim().length > 2 && !META_TOPIC_PATTERNS.some(p => p.test(t)));
}

export async function POST(req: Request) {
  try {
    const { fileName, chapterPlan, lessonPlans, summaryData } = await req.json();

    // Build a rich context from the chapter plan and all lesson plans
    const quizWorthyConcepts = filterSubjectTopics(
      chapterPlan?.page_plans?.flatMap((p: any) => p.quiz_worthy_concepts || [])?.filter(Boolean) || []
    );
    const allTopics = filterSubjectTopics(
      chapterPlan?.page_plans?.flatMap((p: any) => p.topics || [])?.filter(Boolean) || []
    );
    const allKeyConcepts = filterSubjectTopics(
      chapterPlan?.page_plans?.flatMap((p: any) => p.key_concepts || [])?.filter(Boolean) || []
    );

    // Collect core explanations from all lesson plans for question variation
    const lessonSummaries = Object.entries(lessonPlans || {})
      .map(([page, plan]: [string, any]) => `Page ${Number(page) + 1}: ${plan.core_explanation?.slice(0, 300) || ''}`)
      .join('\n');

    const prompt = `
You are creating the FINAL CHAPTER EXAM for a student who just finished studying the document: "${fileName}".
Title: ${chapterPlan?.chapter_title || fileName}

This exam must be COMPREHENSIVE, covering the ENTIRE chapter. It should feel like a real exam — not a casual quiz.

IMPORTANT: All topics and concepts listed below are SUBJECT-MATTER content from this chapter. Generate questions that test a student's academic understanding of the subject. Do NOT generate questions about exam instructions, paper format, marking, or how to take a test.

The chapter covers these topics: ${JSON.stringify(allTopics)}
Quiz-worthy concepts that MUST be tested: ${JSON.stringify(quizWorthyConcepts)}
Key concepts & formulas: ${JSON.stringify(allKeyConcepts)}

Here is what the student learned (lesson summaries):
${lessonSummaries}

Student struggle data: ${JSON.stringify(summaryData || 'No specific struggles recorded.')}

RULES:
1. Generate exactly 10 questions.
2. Questions must be SLIGHTLY TWEAKED from the textbook — test the same concepts but with different numbers, angles, or scenarios. NOT verbatim from the book.
3. Every quiz_worthy_concept MUST appear in at least one question.
4. Mix question types:
   - 7 MCQ questions (4 options each)
   - 2 True/False with justification required
   - 1 Fill-in-the-blank (using LaTeX for math)
5. Use LaTeX strictly for all math/physics equations inside $...$ or $$...$$.
6. Order: easy questions first, then medium, then hard.
7. Each question must have a difficulty rating.

JSON Output Structure:
{
  "quiz_title": "string",
  "total_questions": 10,
  "questions": [
    {
      "question_number": 1,
      "question_type": "mcq" | "true_false" | "fill_blank",
      "difficulty": "easy" | "medium" | "hard",
      "topic": "which topic this tests",
      "question_text": "string (with LaTeX if needed)",
      "options": ["A", "B", "C", "D"],
      "correct_index": 0,
      "correct_answer": "string (for fill-blank type)",
      "explanation": "string explaining why, with detailed working if math is involved"
    }
  ]
}

For true_false questions, options should be ["True", "False"].
For fill_blank questions, options should be an empty array [].
`;

    const response = await ai.models.generateContent({
      model: 'models/gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    return NextResponse.json({
      success: true,
      quiz: (() => {
        try {
          return JSON.parse(response.text || '{}');
        } catch {
          const match = (response.text || '').match(/\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
          throw new Error('Quiz generator returned unparseable JSON');
        }
      })(),
    });
    
  } catch (error) {
    console.error('Quiz Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
