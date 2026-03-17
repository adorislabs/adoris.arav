import { GoogleGenAI } from '@google/genai';
import { tutorConfig } from '@/config/tutorConfig';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export interface Problem {
  id: string;
  difficulty: 'foundation' | 'easy' | 'medium' | 'hard' | 'exam_level';
  type: 'mcq' | 'short_answer' | 'numerical' | 'proof' | 'true_false' | 'application';
  marks: 1 | 2 | 3 | 5;
  question_text: string;
  options?: string[];
  correct_index?: number;
  answer: string;
  solution_steps: string;
}

export interface ProblemSet {
  topic: string;
  chapter_title: string;
  total_problems: number;
  difficulty_spread: {
    foundation: number;
    easy: number;
    medium: number;
    hard: number;
    exam_level: number;
  };
  problems: Problem[];
}

function toParsedJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

function normalizeProblemSet(raw: any, topic: string, chapterTitle: string): ProblemSet {
  const allowedDifficulty = new Set(['foundation', 'easy', 'medium', 'hard', 'exam_level']);
  const allowedType = new Set(['mcq', 'short_answer', 'numerical', 'proof', 'true_false', 'application']);

  const rawProblems = Array.isArray(raw?.problems) ? raw.problems : [];
  const problems: Problem[] = rawProblems
    .map((p: any, idx: number) => {
      const difficulty = allowedDifficulty.has(p?.difficulty) ? p.difficulty : 'medium';
      const type = allowedType.has(p?.type) ? p.type : 'short_answer';
      const marks = [1, 2, 3, 5].includes(p?.marks) ? p.marks : 2;
      const questionText = typeof p?.question_text === 'string' ? p.question_text.trim() : '';

      if (!questionText) return null;

      const options = Array.isArray(p?.options)
        ? p.options.map((o: any) => String(o)).slice(0, 4)
        : undefined;

      const correctIndex = typeof p?.correct_index === 'number' ? p.correct_index : undefined;

      return {
        id: typeof p?.id === 'string' && p.id.trim() ? p.id : `${topic.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${String(idx + 1).padStart(3, '0')}`,
        difficulty,
        type,
        marks,
        question_text: questionText,
        options,
        correct_index: correctIndex,
        answer: typeof p?.answer === 'string' && p.answer.trim() ? p.answer : 'Refer solution steps.',
        solution_steps: typeof p?.solution_steps === 'string' && p.solution_steps.trim()
          ? p.solution_steps
          : 'Use the core definition/formula for this topic, substitute known values carefully, and simplify to the final result.',
      } as Problem;
    })
    .filter(Boolean) as Problem[];

  return {
    topic,
    chapter_title: chapterTitle,
    total_problems: problems.length,
    difficulty_spread: {
      foundation: problems.filter((p) => p.difficulty === 'foundation').length,
      easy: problems.filter((p) => p.difficulty === 'easy').length,
      medium: problems.filter((p) => p.difficulty === 'medium').length,
      hard: problems.filter((p) => p.difficulty === 'hard').length,
      exam_level: problems.filter((p) => p.difficulty === 'exam_level').length,
    },
    problems,
  };
}

/**
 * Generate 20 problems for a topic with a deliberate easy → exam-level progression.
 *
 * Spread (20 problems):
 *   4 foundation — definition recall, basic fill-blank, conceptual MCQ
 *   4 easy       — direct formula application, one-step numerical
 *   5 medium     — two-step problems, varied scenarios
 *   4 hard       — multi-step, twist in the problem, error analysis
 *   3 exam_level — exactly the style/difficulty of 3m/5m exam questions
 */
export async function generateProblemSet(
  topic: string,
  keyConcepts: string[],
  chapterTitle: string,
  fileName: string
): Promise<ProblemSet> {
  const prompt = `
You are building a GRADED PROBLEM SET for a student learning "${topic}".

DOCUMENT: "${fileName}"
CHAPTER: "${chapterTitle}"
KEY CONCEPTS: ${JSON.stringify(keyConcepts)}

CRITICAL SCOPE RULE:
- Every single problem MUST be strictly about the topic "${topic}".
- Do NOT drift into broader chapter recap.
- If key concepts are sparse, still generate focused questions from the topic itself.

Generate exactly 20 problems. They MUST follow this EXACT progression — the student should feel a natural, scaffolded learning curve:

[GROUP 1] FOUNDATION (4 problems — difficulty: "foundation", marks: 1)
- Direct definition questions: "What is X?" / "State the formula for Y."
- True/False with single-concept check
- MCQ where wrong options are clearly wrong
- Goal: Confirm the student knows the basics before anything harder

[GROUP 2] EASY (4 problems — difficulty: "easy", marks: 1-2)
- One-step formula application with given values
- Straightforward numerical: plug in and solve
- No tricks, no multi-step
- Goal: Build confidence with direct use of concepts

[GROUP 3] MEDIUM (5 problems — difficulty: "medium", marks: 2-3)
- Two-step problems
- Apply concept in a slightly varied or unfamiliar context
- Numerical with unit conversion or rearrangement
- Goal: Start thinking, not just calculating

[GROUP 4] HARD (4 problems — difficulty: "hard", marks: 3)
- Multi-step problems requiring planning
- "Why does this happen?" + numerical combined
- Error analysis or common misconception trap
- Reverse problems: given the result, find the input
- Goal: Real understanding, not just mechanical application

[GROUP 5] EXAM LEVEL (3 problems — difficulty: "exam_level", marks: 5)
- Identical in style and difficulty to a 3-5 mark exam question
- Multi-concept integration across the chapter
- Proof or derivation with application
- Long answer requiring explanation + calculation + conclusion
- Goal: Full exam readiness

KEY RULES FOR ALL PROBLEMS:
1. Use LaTeX for ALL math/physics inside $...$ or $$...$$
2. solution_steps must show EVERY step — do not skip steps
3. Each problem id must be unique like "topic_001", "topic_002" etc.
4. For MCQ: 4 options, of which the wrong ones must be plausible (not obviously wrong)
5. Problems must cover DIFFERENT ANGLES of the topic — don't repeat the same question type

JSON Output:
{
  "topic": "string",
  "chapter_title": "string",
  "total_problems": 20,
  "difficulty_spread": {
    "foundation": 4,
    "easy": 4,
    "medium": 5,
    "hard": 4,
    "exam_level": 3
  },
  "problems": [
    {
      "id": "string",
      "difficulty": "foundation" | "easy" | "medium" | "hard" | "exam_level",
      "type": "mcq" | "short_answer" | "numerical" | "proof" | "true_false" | "application",
      "marks": 1 | 2 | 3 | 5,
      "question_text": "string (LaTeX enabled)",
      "options": ["A","B","C","D"],
      "correct_index": 0,
      "answer": "Final answer only",
      "solution_steps": "Full step-by-step working"
    }
  ]
}

Output the problems IN ORDER: foundation first, then easy, medium, hard, exam_level last.
`;

  const response = await ai.models.generateContent({
    model: tutorConfig.examModel,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
    },
  });

  let normalized = normalizeProblemSet(toParsedJson(response.text || '{}'), topic, chapterTitle);

  // Retry once with a stricter schema-only prompt if first response is malformed/empty.
  if (normalized.problems.length === 0) {
    const retryPrompt = `
Return ONLY valid JSON (no markdown, no commentary) for a 20-problem set strictly on topic "${topic}".
Schema:
{
  "topic": "string",
  "chapter_title": "string",
  "total_problems": 20,
  "difficulty_spread": { "foundation": 4, "easy": 4, "medium": 5, "hard": 4, "exam_level": 3 },
  "problems": [
    {
      "id": "string",
      "difficulty": "foundation|easy|medium|hard|exam_level",
      "type": "mcq|short_answer|numerical|proof|true_false|application",
      "marks": 1|2|3|5,
      "question_text": "string",
      "options": ["A","B","C","D"],
      "correct_index": 0,
      "answer": "string",
      "solution_steps": "string"
    }
  ]
}
Use topic: "${topic}", chapter: "${chapterTitle}", concepts: ${JSON.stringify(keyConcepts)}.
`;

    const retryResponse = await ai.models.generateContent({
      model: tutorConfig.examModel,
      contents: retryPrompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    normalized = normalizeProblemSet(toParsedJson(retryResponse.text || '{}'), topic, chapterTitle);
  }

  if (normalized.problems.length === 0) {
    throw new Error('Model returned empty problem set after retry');
  }

  return normalized;
}
