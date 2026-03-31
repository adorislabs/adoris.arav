import { GoogleGenAI } from '@google/genai';
import { tutorConfig } from '@/config/tutorConfig';
import type { PracticeTopic, PagePlanEntry } from '@/lib/session/sessionStore';

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
- AVOID lengthy story problems or scenarios that don't directly test the concept.
- Focus on PRACTICAL APPLICATIONS and CORE SKILLS rather than narrative examples.
- Problems should be CLEAR, CONCISE, and directly test understanding of the topic.

Generate exactly 20 problems. They MUST follow this EXACT progression — the student should feel a natural, scaffolded learning curve:

[GROUP 1] FOUNDATION (4 problems — difficulty: "foundation", marks: 1)
- Direct definition questions: "What is X?" / "State the formula for Y."
- True/False with single-concept check
- MCQ where wrong options are clearly wrong
- Simple identification or recall questions
- Goal: Confirm the student knows the basics before anything harder

[GROUP 2] EASY (4 problems — difficulty: "easy", marks: 1-2)
- One-step formula application with given values
- Straightforward numerical: plug in and solve
- No tricks, no multi-step
- Simple calculation problems
- Goal: Build confidence with direct use of concepts

[GROUP 3] MEDIUM (5 problems — difficulty: "medium", marks: 2-3)
- Two-step problems
- Apply concept in a slightly varied or unfamiliar context
- Numerical with unit conversion or rearrangement
- Problems requiring slight interpretation but direct application
- Goal: Start thinking, not just calculating

[GROUP 4] HARD (4 problems — difficulty: "hard", marks: 3)
- Multi-step problems requiring planning
- "Why does this happen?" + numerical combined
- Error analysis or common misconception trap
- Reverse problems: given the result, find the input
- Problems requiring connection of multiple ideas from the topic
- Goal: Real understanding, not just mechanical application

[GROUP 5] EXAM LEVEL (3 problems — difficulty: "exam_level", marks: 5)
- Identical in style and difficulty to a 3-5 mark exam question
- Multi-concept integration across the chapter
- Proof or derivation with application
- Long answer requiring explanation + calculation + conclusion
- Problems that synthesize multiple aspects of the topic
- Goal: Full exam readiness

KEY RULES FOR ALL PROBLEMS:
1. Use LaTeX for ALL math/physics inside $...$ or $$...$$
2. solution_steps must show EVERY step — do not skip steps
3. Each problem id must be unique like "topic_001", "topic_002" etc.
4. For MCQ: 4 options, of which the wrong ones must be plausible (not obviously wrong)
5. Problems must cover DIFFERENT ANGLES of the topic — don't repeat the same question type
6. AVOID lengthy narratives or stories that obscure the mathematical concept
7. Focus on the ESSENCE of the topic, not peripheral examples

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

/**
 * Given the raw page_plans from a ChapterPlan, produce 5-10 curated
 * PracticeTopics that a student can navigate sensibly.
 *
 * Uses gemini-2.5-flash-lite for speed/cost — this is a lightweight
 * classification task, not generation.
 */
export async function generatePracticeTopics(
  pagePlans: PagePlanEntry[],
  chapterTitle: string
): Promise<PracticeTopic[]> {
  // Strip meta/administrative topics before they reach the LLM
  const META_PATTERNS = [
    /\binstruction/i, /\bcandidate/i, /\bmarking scheme/i, /\banswer booklet/i,
    /\bdo not turn/i, /\bblank page/i, /\btable of content/i, /\bcontent[s]?\s*page/i,
    /\bindex\b/i, /\bbibliograph/i, /\bcopyright/i, /\badministrat/i, /\binvigilat/i,
    /\btime allowed/i, /\btotal marks/i, /\bwrite your/i, /\bend of paper/i,
    /\bthis paper/i, /\btest paper/i, /\bexam paper/i, /\bquestion paper/i,
    /^\[administrative/i, /^title page$/i, /^cover page$/i, /^toc$/i,
  ];
  const isMetaTopic = (t: string) => !t || META_PATTERNS.some(p => p.test(t));

  const rawTopics = pagePlans.flatMap(p => p.topics).filter(t => !isMetaTopic(t));
  const rawConcepts = pagePlans.flatMap(p => p.key_concepts).filter(t => !isMetaTopic(t));

  const prompt = `
You are a curriculum designer. Given the raw page-by-page topics from a textbook chapter, produce a CURATED list of 5-10 practice topics that a student can navigate to practise.

CHAPTER: "${chapterTitle}"
RAW TOPICS (from chapter plan): ${JSON.stringify([...new Set(rawTopics)])}
KEY CONCEPTS: ${JSON.stringify([...new Set(rawConcepts)].slice(0, 30))}

IMPORTANT: These topics are ALL from the subject-matter content of this chapter. If any topic looks administrative (exam instructions, marking scheme, table of contents, etc.), ignore it entirely and do not create a practice topic for it.

RULES:
1. Merge similar/overlapping raw topics into ONE labelled practice topic (e.g. "Comparing Fractions (Same Numerator)" + "Comparing Fractions to 1/2" → "Comparing Fractions")
2. Labels must be SHORT (2-5 words), clean, and concept-level — NOT page descriptions or activity names
3. Remove "(Activity)", "(Worksheet)", numbered suffixes, and lesson names from labels
4. Order topics logically — foundational concepts first, advanced last
5. Each topic gets a one-sentence description for students
6. Assign difficulty: "beginner" (recall/definition), "intermediate" (application), "advanced" (multi-step/analysis)
7. Produce AT LEAST 5 topics, AT MOST 10
8. Include ALL major concepts from the chapter — don't skip anything important

Return ONLY valid JSON:
{
  "practice_topics": [
    {
      "label": "string (short concept name)",
      "description": "string (one sentence: what this topic covers)",
      "key_concepts": ["string", ...],
      "difficulty": "beginner" | "intermediate" | "advanced",
      "source_topics": ["original raw topic strings that map here"]
    }
  ]
}
`;

  const response = await ai.models.generateContent({
    model: tutorConfig.observerModel,
    contents: prompt,
    config: { responseMimeType: 'application/json' },
  });

  try {
    const parsed = toParsedJson(response.text || '{}');
    const topics: PracticeTopic[] = Array.isArray(parsed?.practice_topics)
      ? parsed.practice_topics.filter((t: any) =>
          typeof t?.label === 'string' && t.label.trim().length > 0
        )
      : [];
    if (topics.length === 0) throw new Error('Empty practice topics');
    return topics;
  } catch {
    // Fallback: build simple deduped topics from raw data
    const seen = new Set<string>();
    return [...new Set(rawTopics)]
      .filter(t => t && t.length > 3 && t.length < 60)
      .filter(t => {
        const key = t.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 10)
      .map(t => ({
        label: t.replace(/\s*\(.*?\)\s*/g, '').trim() || t,
        description: `Practice problems covering ${t}.`,
        key_concepts: rawConcepts.filter(c => c.toLowerCase().includes(t.toLowerCase().split(' ')[0])).slice(0, 5),
        difficulty: 'intermediate' as const,
        source_topics: [t],
      }));
  }
}
