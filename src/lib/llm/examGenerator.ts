import { GoogleGenAI } from '@google/genai';
import { tutorConfig } from '@/config/tutorConfig';
import type { ChapterPlan, LessonPlan } from '@/lib/session/sessionStore';
import { withTimeout } from './timeout';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

/**
 * Patterns that identify administrative / meta-content topics that should
 * never appear as exam questions. These come from cover pages, exam
 * instruction pages, TOC, bibliography, marking schemes, etc.
 */
const META_TOPIC_PATTERNS = [
  /\binstruction/i,
  /\bcandidate/i,
  /\bexamination rule/i,
  /\bmarking scheme/i,
  /\banswer booklet/i,
  /\bdo not turn/i,
  /\bblank page/i,
  /\btable of content/i,
  /\bcontent[s]?\s*page/i,
  /\bindex\b/i,
  /\bbibliograph/i,
  /\breferences?\s*page/i,
  /\bcopyright/i,
  /\badministrat/i,
  /\binvigilat/i,
  /\btime allowed/i,
  /\btotal marks/i,
  /\bwrite your/i,
  /\bend of paper/i,
  /\bthis paper/i,
  /\btest paper/i,
  /\bexam paper/i,
  /\bquestion paper/i,
  /\bpage number/i,
  /^\[administrative/i,
  /^title page$/i,
  /^cover page$/i,
  /^toc$/i,
];

function filterSubjectTopics(topics: string[]): string[] {
  return topics.filter(t => t && t.trim().length > 2 && !META_TOPIC_PATTERNS.some(p => p.test(t)));
}

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
  let allTopics = filterSubjectTopics(chapterPlan?.page_plans?.flatMap(p => p.topics) || []);
  let allConcepts = filterSubjectTopics(chapterPlan?.page_plans?.flatMap(p => p.key_concepts) || []);
  let quizWorthy = filterSubjectTopics(chapterPlan?.page_plans?.flatMap(p => p.quiz_worthy_concepts) || []);

  // Dev bypass: If no chapter plan, extract from lesson plans
  if (allTopics.length === 0 && Object.keys(lessonPlans).length > 0) {
    allTopics = filterSubjectTopics([...new Set(
      Object.values(lessonPlans).flatMap(lp => lp.suggestive_doubts || [])
    )].slice(0, 20));
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

IMPORTANT: The topics and concepts below are ALL from the SUBJECT-MATTER content of this chapter (academic/educational content). Generate questions that test a student's understanding of the actual subject. Do NOT generate questions about exam administration, paper format, marking schemes, or how to take a test.

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
- Types: short_answer, numerical, long_answer — application-based and multi-step problems
- Difficulty: hard → very_hard
- Full step-by-step working needed

Section D — 5-Mark Questions (5 questions × 5 marks = 25 marks)
- Types: long_answer, proof, numerical — multi-part derivations and explanations
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
7. The "type" field MUST be one of EXACTLY these values: "mcq", "true_false", "short_answer", "long_answer", "numerical", "proof". Do NOT use any other type.
8. NEVER ask students to "draw", "sketch", "construct a diagram", or produce any visual/hand-drawn output. Students type text answers only. Rephrase any such question as "Describe...", "Explain with steps...", or "Calculate and show working...".
9. For true_false questions: ALWAYS include "options": ["True", "False"] and set "correct_index" to 0 (True) or 1 (False). Never omit options or use correct_index: -1.
10. For mcq questions: ALWAYS include 4 options and set correct_index to 0, 1, 2, or 3.

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

  const response = await withTimeout(
    ai.models.generateContent({
      model: tutorConfig.examModel,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    }),
    60_000, 'generateExam'
  );

  let exam: Exam;
  try {
    exam = JSON.parse(response.text || '{}') as Exam;
  } catch {
    const match = (response.text || '').match(/\{[\s\S]*\}/);
    if (match) exam = JSON.parse(match[0]) as Exam;
    else throw new Error('Exam generator returned unparseable JSON');
  }

  // ── Post-parse normalization ────────────────────────────────────
  const VALID_TYPES = new Set(['mcq', 'true_false', 'short_answer', 'long_answer', 'numerical', 'proof']);
  for (const sec of exam.sections) {
    for (const q of sec.questions) {
      // Normalize non-standard types to closest valid type
      if (!VALID_TYPES.has(q.type)) {
        q.type = q.marks >= 5 ? 'long_answer' : q.marks >= 3 ? 'short_answer' : 'short_answer';
      }
      // Ensure true_false always has options and a valid correct_index
      if (q.type === 'true_false') {
        if (!q.options || q.options.length === 0) q.options = ['True', 'False'];
        if (q.correct_index == null || q.correct_index < 0 || q.correct_index > 1) q.correct_index = 0;
      }
      // Ensure MCQ has valid correct_index
      if (q.type === 'mcq' && q.options && q.options.length > 0) {
        if (q.correct_index == null || q.correct_index < 0 || q.correct_index >= q.options.length) q.correct_index = 0;
      }
    }
  }

  return exam;
}

// ─── Written Answer Grader ─────────────────────────────────────────────────

export interface WrittenGrade {
  question_number: number;
  marks_awarded: number;
  max_marks: number;
  feedback: string;
}

/**
 * Server-side MCQ + True/False auto-grading.
 * Returns earned marks by re-checking answers against correct_index.
 * This is authoritative — client-sent score is untrusted.
 */
export function autoGradeMCQ(
  exam: Exam,
  answers: Record<number, { selected?: number; text?: string; answered: boolean }>
): number {
  let earned = 0;
  let globalIdx = 0;
  for (const sec of exam.sections) {
    for (const q of sec.questions) {
      if (q.type === 'mcq' || q.type === 'true_false') {
        const ans = answers[globalIdx];
        if (ans?.answered && ans.selected != null && q.correct_index != null && q.correct_index >= 0) {
          if (Number(ans.selected) === Number(q.correct_index)) {
            earned += q.marks;
          }
        }
      }
      globalIdx++;
    }
  }
  return earned;
}

/**
 * Grades all non-MCQ/True-False questions in one batched LLM call.
 * Returns an array of WrittenGrade results, one per written question.
 */
export async function gradeWrittenAnswers(
  exam: Exam,
  answers: Record<number, { selected?: number; text?: string; answered: boolean }>
): Promise<WrittenGrade[]> {
  // Collect written questions with their global index
  const writtenItems: {
    globalIdx: number;
    q: ExamQuestion;
    studentAnswer: string;
  }[] = [];

  let globalIdx = 0;
  for (const sec of exam.sections) {
    for (const q of sec.questions) {
      if (q.type !== 'mcq' && q.type !== 'true_false') {
        const ans = answers[globalIdx];
        writtenItems.push({
          globalIdx,
          q,
          studentAnswer: ans?.text?.trim() || '',
        });
      }
      globalIdx++;
    }
  }

  if (writtenItems.length === 0) return [];

  const prompt = `
You are a strict but fair exam marker. Grade each written student answer below.

For each question:
1. Compare the student answer to the answer_key and marking_scheme.
2. Award partial marks generously where working is correct even if the final answer is slightly off.
3. Give 0 marks only if the answer is blank, completely wrong, or gibberish.
4. Keep feedback concise (1–2 sentences).

Questions to grade:
${writtenItems.map((item, i) => `
Q${i + 1}: Question ${item.q.question_number} (${item.q.marks} marks) — Topic: ${item.q.topic}
Question: ${item.q.question_text}
Answer Key: ${item.q.answer_key}
Marking Scheme: ${item.q.marking_scheme}
Student's Answer: ${item.studentAnswer || '[No answer provided]'}
`).join('\n---\n')}

Return ONLY valid JSON — an array with exactly ${writtenItems.length} objects:
[
  { "question_number": <number>, "marks_awarded": <0..max>, "max_marks": <max>, "feedback": "<1-2 sentence feedback>" }
]
`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: tutorConfig.examModel,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      }),
      45_000, 'gradeWrittenAnswers'
    );

    const parsed = JSON.parse(response.text || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed.map((g: any, i: number) => ({
      question_number: writtenItems[i]?.q.question_number ?? g.question_number,
      marks_awarded: Math.min(
        Math.max(0, Number(g.marks_awarded) || 0),
        writtenItems[i]?.q.marks ?? 0
      ),
      max_marks: writtenItems[i]?.q.marks ?? 0,
      feedback: typeof g.feedback === 'string' ? g.feedback : '',
    }));
  } catch (err) {
    console.error('[gradeWrittenAnswers] Failed:', err);
    return [];
  }
}
