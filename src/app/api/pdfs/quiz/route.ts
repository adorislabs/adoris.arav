import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export async function POST(req: Request) {
  try {
    const { fileName, chapterPlan, lessonPlans, summaryData } = await req.json();

    // Build a rich context from the chapter plan and all lesson plans
    const quizWorthyConcepts = chapterPlan?.page_plans
      ?.flatMap((p: any) => p.quiz_worthy_concepts || [])
      ?.filter(Boolean) || [];

    const allTopics = chapterPlan?.page_plans
      ?.flatMap((p: any) => p.topics || [])
      ?.filter(Boolean) || [];

    const allKeyConcepts = chapterPlan?.page_plans
      ?.flatMap((p: any) => p.key_concepts || [])
      ?.filter(Boolean) || [];

    // Collect core explanations from all lesson plans for question variation
    const lessonSummaries = Object.entries(lessonPlans || {})
      .map(([page, plan]: [string, any]) => `Page ${Number(page) + 1}: ${plan.core_explanation?.slice(0, 300) || ''}`)
      .join('\n');

    const prompt = `
You are creating the FINAL CHAPTER EXAM for a student who just finished studying the document: "${fileName}".
Title: ${chapterPlan?.chapter_title || fileName}

This exam must be COMPREHENSIVE, covering the ENTIRE chapter. It should feel like a real exam — not a casual quiz.

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
      quiz: JSON.parse(response.text || '{}')
    });
    
  } catch (error) {
    console.error('Quiz Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate quiz' }, { status: 500 });
  }
}
