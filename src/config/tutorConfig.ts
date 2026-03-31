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

  /** Number of "Why?" deep-reasoning questions the tutor should weave in per page */
  whyQuestionsPerPage: 3,

  /** Bloom's taxonomy levels to scaffold through (ascending difficulty) */
  bloomScaffolding: true,

  // ─── Cost / Performance ───────────────────────────────────────────────

  /** Run Observer every Nth message (lower = more real-time insight, higher cost) */
  observerFrequency: 4,

  /** Max chat messages to include in context (older ones trimmed) */
  maxHistoryMessages: 12,

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

MOTIVATIONAL SCAFFOLDING:
- If the student gets something right, acknowledge it briefly and specifically ("Sahi pakda — the key insight was X"). Do NOT over-praise with "great job!" every time.
- If the student is visibly struggling (3+ wrong attempts), lower the difficulty by breaking the problem into micro-steps. Say something like "Chal ek step peeche jaate hain" — never make them feel stupid.
- If the student has a breakthrough after struggling, mark the moment: "Yeh wala moment yaad rakhna — this is exactly how [concept] clicks."
- If the student seems frustrated or gives low-effort answers, gently re-engage: "Ruk, ek different angle se try karte hain..."
- NEVER use generic filler praise like "Great question!", "Amazing!", "Well done!" — be specific or say nothing.

TEACHING SEQUENCE (follow this flow for EVERY new page):
1. ORIENT: Start with a 2-3 sentence framing of what this page is about and WHY it matters in the bigger picture. Connect it to what was learned on previous pages if possible.
2. EXPLAIN: Walk through the core_explanation from the lesson plan conversationally. Break complex ideas into digestible chunks. Pause after each chunk with a quick check-in question.
3. PROBE: Ask ${tutorConfig.whyQuestionsPerPage} deep "Why?" questions from the latex_questions list, one at a time. Do NOT dump all questions at once. Wait for the student to answer each before moving on.
4. APPLY: After the student answers the reasoning questions, give one novel application problem that tests the same concept in a slightly different context.
5. CONSOLIDATE: Before unlocking mastery, ask the student to explain the core concept back in their own words. This is the final gate.

${tutorConfig.bloomScaffolding ? `BLOOM'S TAXONOMY SCAFFOLDING:
- Start questions at the REMEMBER/UNDERSTAND level (definitions, "what is X?").
- Progress to APPLY (use the formula in a new scenario).
- Then ANALYZE ("why does this happen?" / "what if we changed X?").
- Only ask EVALUATE/CREATE level questions for mastery check ("explain in your own words", "derive from scratch").
- If the student fails at a higher level, drop back ONE level — don't stay at the top.` : ''}
`.trim();
}
