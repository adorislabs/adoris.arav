/**
 * Unit tests for autoGradeMCQ — the authoritative server-side MCQ grader.
 * We mock the external Google AI SDK so no network calls are made.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the Google GenAI SDK before importing the module under test
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_opts?: unknown) {}
  },
}));

vi.mock('@/config/tutorConfig', () => ({
  tutorConfig: { model: 'gemini-test', observerFrequency: 4, maxTokens: 1024 },
}));

vi.mock('@/lib/llm/timeout', () => ({
  withTimeout: vi.fn((fn: () => unknown) => fn()),
}));

import { autoGradeMCQ } from '@/lib/llm/examGenerator';
import type { Exam } from '@/lib/llm/examGenerator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMCQExam(questions: { marks: number; correct_index: number }[]): Exam {
  return {
    exam_title: 'Test Exam',
    total_marks: questions.reduce((s, q) => s + q.marks, 0),
    time_limit_minutes: 60,
    sections: [{
      section_name: 'Section A',
      marks_per_question: 1,
      questions: questions.map((q, i) => ({
        question_number: i + 1,
        marks: q.marks as 1 | 2 | 3 | 5,
        difficulty: 'medium' as const,
        type: 'mcq' as const,
        topic: 'Topic',
        question_text: `Question ${i + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correct_index: q.correct_index,
        answer_key: 'A',
        marking_scheme: `${q.marks}M`,
      })),
    }],
  };
}

// ─── autoGradeMCQ tests ───────────────────────────────────────────────────────

describe('autoGradeMCQ', () => {
  it('awards marks for each correct MCQ answer', () => {
    const exam = makeMCQExam([
      { marks: 1, correct_index: 0 },
      { marks: 2, correct_index: 2 },
    ]);
    const answers = {
      0: { selected: 0, answered: true },  // correct
      1: { selected: 2, answered: true },  // correct
    };
    expect(autoGradeMCQ(exam, answers)).toBe(3);
  });

  it('awards no marks for wrong MCQ answers', () => {
    const exam = makeMCQExam([{ marks: 2, correct_index: 0 }]);
    const answers = { 0: { selected: 3, answered: true } };
    expect(autoGradeMCQ(exam, answers)).toBe(0);
  });

  it('awards no marks for unanswered questions', () => {
    const exam = makeMCQExam([{ marks: 1, correct_index: 1 }]);
    expect(autoGradeMCQ(exam, {})).toBe(0);
  });

  it('handles a mix of correct, wrong, and unanswered', () => {
    const exam = makeMCQExam([
      { marks: 1, correct_index: 0 },  // will be correct
      { marks: 1, correct_index: 1 },  // will be wrong
      { marks: 2, correct_index: 2 },  // will be unanswered
    ]);
    const answers = {
      0: { selected: 0, answered: true },  // correct  → +1
      1: { selected: 3, answered: true },  // wrong    → +0
      // 2 not answered                                → +0
    };
    expect(autoGradeMCQ(exam, answers)).toBe(1);
  });

  it('grades true/false questions correctly', () => {
    const exam: Exam = {
      exam_title: 'TF Test',
      total_marks: 2,
      time_limit_minutes: 30,
      sections: [{
        section_name: 'True/False',
        marks_per_question: 1,
        questions: [
          {
            question_number: 1, marks: 1, difficulty: 'medium', type: 'true_false',
            topic: 'Test', question_text: 'The sky is blue.',
            options: ['True', 'False'], correct_index: 0,
            answer_key: 'True', marking_scheme: '1M',
          },
          {
            question_number: 2, marks: 1, difficulty: 'medium', type: 'true_false',
            topic: 'Test', question_text: '2 + 2 = 5.',
            options: ['True', 'False'], correct_index: 1,
            answer_key: 'False', marking_scheme: '1M',
          },
        ],
      }],
    };
    // Both correct
    expect(autoGradeMCQ(exam, {
      0: { selected: 0, answered: true },
      1: { selected: 1, answered: true },
    })).toBe(2);
    // Both wrong
    expect(autoGradeMCQ(exam, {
      0: { selected: 1, answered: true },
      1: { selected: 0, answered: true },
    })).toBe(0);
  });

  it('skips short_answer, long_answer, numerical, and proof questions', () => {
    const exam: Exam = {
      exam_title: 'Written',
      total_marks: 10,
      time_limit_minutes: 30,
      sections: [{
        section_name: 'Written',
        marks_per_question: 5,
        questions: [
          {
            question_number: 1, marks: 5, difficulty: 'hard', type: 'short_answer',
            topic: 'Algebra', question_text: 'Solve for x.',
            answer_key: 'x = 3', marking_scheme: '5M',
          },
          {
            question_number: 2, marks: 5, difficulty: 'hard', type: 'long_answer',
            topic: 'Physics', question_text: 'Explain Newton\'s laws.',
            answer_key: 'Force, motion, reaction', marking_scheme: '5M',
          },
        ],
      }],
    };
    const answers = {
      0: { text: 'x = 3', answered: true },
      1: { text: 'Some explanation', answered: true },
    };
    expect(autoGradeMCQ(exam, answers)).toBe(0);
  });

  it('handles multiple sections with global question indexing', () => {
    const exam: Exam = {
      exam_title: 'Multi-section',
      total_marks: 4,
      time_limit_minutes: 60,
      sections: [
        {
          section_name: 'Section A',
          marks_per_question: 1,
          questions: [{
            question_number: 1, marks: 1, difficulty: 'medium', type: 'mcq',
            topic: 'A', question_text: 'Q1', options: ['a', 'b', 'c', 'd'],
            correct_index: 0, answer_key: 'a', marking_scheme: '1M',
          }],
        },
        {
          section_name: 'Section B',
          marks_per_question: 3,
          questions: [{
            question_number: 2, marks: 3, difficulty: 'hard', type: 'mcq',
            topic: 'B', question_text: 'Q2', options: ['a', 'b', 'c', 'd'],
            correct_index: 2, answer_key: 'c', marking_scheme: '3M',
          }],
        },
      ],
    };
    // globalIndex 0 = Q1, globalIndex 1 = Q2
    const answers = {
      0: { selected: 1, answered: true },  // wrong  → +0
      1: { selected: 2, answered: true },  // correct → +3
    };
    expect(autoGradeMCQ(exam, answers)).toBe(3);
  });

  it('ignores answers with answered=false', () => {
    const exam = makeMCQExam([{ marks: 2, correct_index: 0 }]);
    const answers = { 0: { selected: 0, answered: false } };
    expect(autoGradeMCQ(exam, answers)).toBe(0);
  });

  it('coerces string-serialised selected values to numbers', () => {
    // Answers originally from JSON may have string-typed indices
    const exam = makeMCQExam([{ marks: 1, correct_index: 1 }]);
    const answers = { 0: { selected: '1' as unknown as number, answered: true } };
    expect(autoGradeMCQ(exam, answers)).toBe(1);
  });

  it('returns 0 for an empty exam', () => {
    const exam: Exam = {
      exam_title: 'Empty',
      total_marks: 0,
      time_limit_minutes: 0,
      sections: [],
    };
    expect(autoGradeMCQ(exam, {})).toBe(0);
  });

  it('skips questions with correct_index of -1 (invalid, should never earn marks)', () => {
    const exam: Exam = {
      exam_title: 'Edge',
      total_marks: 1,
      time_limit_minutes: 30,
      sections: [{
        section_name: 'A',
        marks_per_question: 1,
        questions: [{
          question_number: 1, marks: 1, difficulty: 'medium', type: 'mcq',
          topic: 'T', question_text: 'Q?',
          options: ['A', 'B', 'C', 'D'], correct_index: -1,
          answer_key: '', marking_scheme: '1M',
        }],
      }],
    };
    // Even selecting 0 should not earn marks when correct_index is -1
    expect(autoGradeMCQ(exam, { 0: { selected: 0, answered: true } })).toBe(0);
  });

  it('skips questions where correct_index is undefined', () => {
    const exam: Exam = {
      exam_title: 'Edge',
      total_marks: 1,
      time_limit_minutes: 30,
      sections: [{
        section_name: 'A',
        marks_per_question: 1,
        questions: [{
          question_number: 1, marks: 1, difficulty: 'medium', type: 'mcq',
          topic: 'T', question_text: 'Q?',
          options: ['A', 'B', 'C', 'D'], correct_index: undefined,
          answer_key: '', marking_scheme: '1M',
        }],
      }],
    };
    expect(autoGradeMCQ(exam, { 0: { selected: 0, answered: true } })).toBe(0);
  });

  it('awards 0 when selected is undefined even if answered is true', () => {
    const exam = makeMCQExam([{ marks: 1, correct_index: 0 }]);
    // selected is undefined — no choice was made
    expect(autoGradeMCQ(exam, { 0: { selected: undefined as unknown as number, answered: true } })).toBe(0);
  });

  it('uses global index across MCQ and written questions in the same section', () => {
    // Section has: short_answer (idx 0), mcq (idx 1), mcq (idx 2)
    const exam: Exam = {
      exam_title: 'Mixed Section',
      total_marks: 6,
      time_limit_minutes: 30,
      sections: [{
        section_name: 'Mixed',
        marks_per_question: 1,
        questions: [
          {
            question_number: 1, marks: 3, difficulty: 'hard', type: 'short_answer',
            topic: 'Algebra', question_text: 'Solve.',
            answer_key: 'x=2', marking_scheme: '3M',
          },
          {
            question_number: 2, marks: 1, difficulty: 'medium', type: 'mcq',
            topic: 'Math', question_text: '2+2?',
            options: ['3', '4', '5', '6'], correct_index: 1,
            answer_key: '4', marking_scheme: '1M',
          },
          {
            question_number: 3, marks: 2, difficulty: 'hard', type: 'mcq',
            topic: 'Science', question_text: 'H2O is?',
            options: ['Oxygen', 'Water', 'CO2', 'Nitrogen'], correct_index: 1,
            answer_key: 'Water', marking_scheme: '2M',
          },
        ],
      }],
    };
    // idx 0 = written (skipped), idx 1 = mcq correct, idx 2 = mcq wrong
    const answers = {
      0: { text: 'x=2', answered: true },
      1: { selected: 1, answered: true },   // correct → +1
      2: { selected: 0, answered: true },   // wrong   → +0
    };
    expect(autoGradeMCQ(exam, answers)).toBe(1);
  });

  it('accumulates marks from all sections with partial correctness', () => {
    const exam: Exam = {
      exam_title: 'Full Exam',
      total_marks: 7,
      time_limit_minutes: 60,
      sections: [
        {
          section_name: 'Section A',
          marks_per_question: 1,
          questions: [
            {
              question_number: 1, marks: 1, difficulty: 'medium', type: 'mcq',
              topic: 'T', question_text: 'Q1',
              options: ['a', 'b', 'c', 'd'], correct_index: 0,
              answer_key: 'a', marking_scheme: '1M',
            },
            {
              question_number: 2, marks: 1, difficulty: 'medium', type: 'mcq',
              topic: 'T', question_text: 'Q2',
              options: ['a', 'b', 'c', 'd'], correct_index: 1,
              answer_key: 'b', marking_scheme: '1M',
            },
          ],
        },
        {
          section_name: 'Section B',
          marks_per_question: 5,
          questions: [
            {
              question_number: 3, marks: 5, difficulty: 'hard', type: 'mcq',
              topic: 'T', question_text: 'Q3',
              options: ['a', 'b', 'c', 'd'], correct_index: 3,
              answer_key: 'd', marking_scheme: '5M',
            },
          ],
        },
      ],
    };
    const answers = {
      0: { selected: 0, answered: true },  // correct → +1
      1: { selected: 0, answered: true },  // wrong   → +0
      2: { selected: 3, answered: true },  // correct → +5
    };
    expect(autoGradeMCQ(exam, answers)).toBe(6);
  });
});
