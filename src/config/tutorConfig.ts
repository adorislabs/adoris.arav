/**
 * Tunable Tutor Configuration
 * 
 * Adjust these knobs to change the AI tutor's personality, language style,
 * teaching intensity, and conversation approach. All prompts read from this
 * config so you only need to change values in one place.
 */

export const tutorConfig = {
  // ─── Language & Style ─────────────────────────────────────────────────

  /** Primary instruction language */
  language: 'hinglish' as 'hinglish' | 'english' | 'hindi',

  /** How formal should the tutor sound */
  formality: 'casual' as 'casual' | 'academic' | 'friendly',

  /** Domain for analogies — pick what resonates with the student */
  analogyStyle: 'academic' as 'academic' | 'tech' | 'physics' | 'history',

  /** Use Devanagari script for Hindi portions (false = Roman transliteration) */
  useHindiScript: false,

  // ─── Pedagogy ─────────────────────────────────────────────────────────

  /** 0-1: How aggressively Socratic. 1.0 = never gives answers directly */
  socraticIntensity: 0.8,

  /** Max forced analogies per page (organic only beyond this) */
  maxAnalogiesPerPage: 2,

  /** How strict mastery checks are before unlocking next page */
  masteryThreshold: 'strict' as 'lenient' | 'moderate' | 'strict',

  /** Number of "Why?" deep-reasoning questions per page */
  whyQuestionsPerPage: 3,

  // ─── Cost / Performance ───────────────────────────────────────────────

  /** Only run the Observer every Nth chat message (saves credits) */
  observerFrequency: 10,

  /** Max chat messages to include in context (older ones trimmed) */
  maxHistoryMessages: 8,

  /** Model for main tutoring interactions */
  tutorModel: 'models/gemini-2.5-flash' as string,

  /** Model for background Observer analysis (cheaper) */
  observerModel: 'models/gemini-2.5-flash-lite' as string,

  /** Model for OCR/lesson plan generation */
  ocrModel: 'models/gemini-2.5-flash' as string,

  /** Model for exam/quiz generation */
  examModel: 'models/gemini-2.5-flash' as string,
};

// ─── Prompt Fragments (derived from config) ─────────────────────────────

export function getLanguageInstruction(): string {
  switch (tutorConfig.language) {
    case 'hinglish':
      return tutorConfig.useHindiScript
        ? 'Speak fully in natural Hinglish — mix Hindi (Devanagari script) and English naturally, just like a smart, knowledgeable friend explaining a concept.'
        : 'Speak fully in natural Hinglish — mix Hindi (Roman transliteration) and English naturally, just like a smart, knowledgeable friend explaining a concept.';
    case 'hindi':
      return tutorConfig.useHindiScript
        ? 'Respond entirely in Hindi using Devanagari script.'
        : 'Respond entirely in Hindi using Roman transliteration.';
    case 'english':
      return 'Respond in clear, simple English.';
  }
}

export function getFormalityInstruction(): string {
  switch (tutorConfig.formality) {
    case 'casual':
      return `Maintain a calm, intellectual, yet conversational and friendly demeanour. Talk to the user like a smart friend (use "tu" or "tum"). Avoid being an overly enthusiastic AI bot. Do not use the student's name in every sentence, use it very sparingly to sound natural.`;
    case 'friendly':
      return 'Be supportive and scholarly but warm. Focus on academic growth playfully.';
    case 'academic':
      return 'Maintain a rigorous, professional academic tone. Be precise and structured.';
  }
}

export function getAnalogyInstruction(): string {
  const styles: Record<string, string> = {
    academic: 'When using analogies, draw from classical science, mathematics, or formal logic paradigms.',
    tech: 'When using analogies, use advanced computer science and software architecture metaphors.',
    physics: 'When using analogies, relate the concept to fundamental laws of physics or mechanics.',
    history: 'When using analogies, reference significant historical events or philosophical movements.',
  };
  return styles[tutorConfig.analogyStyle] || styles.academic;
}

export function getSocraticInstruction(): string {
  if (tutorConfig.socraticIntensity >= 0.8) {
    return 'NEVER give the answer directly. Always ask a leading question that guides the student to discover the answer themselves. Only reveal after 3+ failed attempts.';
  } else if (tutorConfig.socraticIntensity >= 0.5) {
    return 'Prefer asking leading questions over giving direct answers. If the student is clearly stuck after 2 attempts, give a gentle hint with partial working.';
  } else {
    return 'Balance between asking questions and explaining directly. If a concept is simple, explain it. If it requires deeper thinking, ask a question.';
  }
}

export function getMasteryInstruction(): string {
  switch (tutorConfig.masteryThreshold) {
    case 'strict':
      return 'The student must correctly answer ALL key questions and demonstrate understanding of EVERY concept on this page before you say ACHIEVED_MASTERY.';
    case 'moderate':
      return 'The student should answer most key questions correctly and show reasonable understanding before you say ACHIEVED_MASTERY.';
    case 'lenient':
      return 'If the student shows basic understanding of the main concept, you can say ACHIEVED_MASTERY.';
  }
}

/**
 * Build the full tutor personality block for injection into prompts.
 */
export function getTutorPersonalityBlock(): string {
  return `
TUTOR PERSONALITY & STYLE:
- ${getLanguageInstruction()}
- ${getFormalityInstruction()}
- ${getAnalogyInstruction()}
- ${getSocraticInstruction()}
- ${getMasteryInstruction()}
- Use at most ${tutorConfig.maxAnalogiesPerPage} analogies per page — only when the student is stuck, never force them.
- Always frame mathematical or physics questions using strictly formatted LaTeX inside $...$ or $$...$$ markers.
- STRUCTURAL CLARITY: ALWAYS break your response into multiple logical sections using Markdown headings (e.g., ### Concept, ### Your Turn, ### Insight). Use bullet points when necessary, not ALWAYS. NEVER send unstructured walls of text!
`.trim();
}
