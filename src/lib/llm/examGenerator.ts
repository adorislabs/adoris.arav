import { GoogleGenAI } from '@google/genai';
import { tutorConfig } from '@/config/tutorConfig';
import type { ChapterPlan, LessonPlan } from '@/lib/session/sessionStore';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export interface ExamQuestion {
  question_number: number;
  marks: 1 | 2 | 3 | 5;
  difficulty: 'medium' | 'hard' | 'very_hard';
  type: 'mcq' | 'short_answer' | 'long_answer' | 'numerical' | 'proof' | 'true_false';
  topic: string;
  question_text: string;
  options?: string[];
  correct_index?: number;
  answer_key: string;
  marking_scheme: string;
}

export interface ExamSection {
  section_name: string;
  marks_per_question: 1 | 2 | 3 | 5;
  questions: ExamQuestion[];
}

export interface Exam {
  exam_title: string;
  total_marks: number;
  time_limit_minutes: number;
  sections: ExamSection[];
}

/**
 * Generate a full 60-mark, 60-minute chapter exam with tiered sections.
 */
export async function generateExam(
  chapterPlan: ChapterPlan | null,
  lessonPlans: Record<number, LessonPlan>,
  fileName: string
): Promise<Exam> {
  let allTopics = chapterPlan?.page_plans?.flatMap(p => p.topics) || [];
  let allConcepts = chapterPlan?.page_plans?.flatMap(p => p.key_concepts) || [];
  let quizWorthy = chapterPlan?.page_plans?.flatMap(p => p.quiz_worthy_concepts) || [];

  // Dev bypass: If no chapter plan, extract from lesson plans
  if (allTopics.length === 0 && Object.keys(lessonPlans).length > 0) {
    allTopics = [...new Set(
      Object.values(lessonPlans).flatMap(lp => lp.suggestive_doubts || [])
    )].slice(0, 20);
    allConcepts = [...new Set(
      Object.values(lessonPlans).flatMap(lp => lp.core_explanation?.split(/[.!?]/).slice(0, 3) || [])
    )].slice(0, 15);
    quizWorthy = allTopics.slice(0, 10);
  }

  const lessonSummaries = Object.entries(lessonPlans)
    .map(([page, plan]) => `Page ${Number(page) + 1}: ${plan.core_explanation?.slice(0, 200) || ''}`)
    .join('\n');

  const prompt = `
You are creating a FORMAL CHAPTER EXAMINATION for the document: "${fileName}"
Chapter: ${chapterPlan?.chapter_title || fileName}

This is a proper exam paper. All questions must be MEDIUM to VERY HARD — no trivial recall.

TOPICS TO COVER: ${JSON.stringify(allTopics)}
KEY CONCEPTS & FORMULAS: ${JSON.stringify(allConcepts)}
MUST-TEST CONCEPTS: ${JSON.stringify(quizWorthy)}

LESSON SUMMARIES:
${lessonSummaries}

EXAM STRUCTURE (STRICTLY FOLLOW THIS — 60 marks total, ~60 minutes):

Section A — 1-Mark Questions (10 questions × 1 mark = 10 marks)
- Types: MCQ (4 options) or True/False
- Difficulty: medium → hard (no easy)
- Each question must test a distinct concept

Section B — 2-Mark Questions (5 questions × 2 marks = 10 marks)
- Types: Short answer, definition with example, numerical (quick)
- Difficulty: hard
- Requires working or justification (not just a term)

Section C — 3-Mark Questions (5 questions × 3 marks = 15 marks)
- Types: Application-based, multi-step numerical, diagram reasoning
- Difficulty: hard → very_hard
- Full step-by-step working needed

Section D — 5-Mark Questions (5 questions × 5 marks = 25 marks)
- Types: Long answer, derivation, proof, multi-part problems
- Difficulty: very_hard
- Detailed working + conceptual explanation required

TOTAL: 25 questions, 60 marks, 60 minutes

CRITICAL RULES:
1. Questions must be TWEAKED from textbook — same concepts, different numbers/scenarios
2. Every quiz_worthy_concept MUST appear in at least one question
3. Use LaTeX strictly for all math/physics inside $...$ or $$...$$
4. Each MCQ must have exactly 4 plausible options (no obviously wrong answers)
5. answer_key must show COMPLETE step-by-step working with each step labeled
6. marking_scheme must show step-wise marks (e.g., "1M formula, 1M substitution, 1M answer")

JSON Output:
{
  "exam_title": "string",
  "total_marks": 60,
  "time_limit_minutes": 60,
  "sections": [
    {
      "section_name": "Section A: 1-Mark Questions",
      "marks_per_question": 1,
      "questions": [
        {
          "question_number": 1,
          "marks": 1,
          "difficulty": "medium" | "hard" | "very_hard",
          "type": "mcq" | "true_false" | "short_answer" | "long_answer" | "numerical" | "proof",
          "topic": "string",
          "question_text": "string (LaTeX enabled)",
          "options": ["A", "B", "C", "D"],
          "correct_index": 0,
          "answer_key": "Full working + answer",
          "marking_scheme": "Step-wise marks e.g. 1M each"
        }
      ]
    }
  ]
}
`;

  const response = await ai.models.generateContent({
    model: tutorConfig.examModel,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  return JSON.parse(response.text || '{}') as Exam;
}
