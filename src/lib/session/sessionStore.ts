/**
 * Session Persistence Layer
 * 
 * Saves/loads/clears tutoring session state from localStorage so the user
 * can close the tab and resume exactly where they left off.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface LessonPlan {
  core_explanation: string;
  latex_questions: string[];
  application_problem?: string;
  prerequisite_concepts?: string[];
  manim_visual_ideas: string;
  suggestive_doubts: string[];
}

export interface PagePlanEntry {
  page_number: number;
  topics: string[];
  key_concepts: string[];
  estimated_difficulty: 'easy' | 'medium' | 'hard';
  quiz_worthy_concepts: string[];
}

export interface ChapterPlan {
  chapter_title: string;
  total_pages: number;
  page_plans: PagePlanEntry[];
}

export type PageMasteryStatus = 'locked' | 'in_progress' | 'mastered';

export interface ObserverState {
  confusionPoints: string[];
  gaps: string[];
  analogies: string[];
  mastery_status?: string;
  emotional_state?: string;
  learning_velocity?: string;
}

export interface SessionState {
  id: string;
  fileName: string;
  currentPage: number;
  totalPages: number;
  chapterPlan: ChapterPlan | null;
  lessonPlans: Record<number, LessonPlan>;
  chatHistories: Record<number, Message[]>;
  masteryStatus: Record<number, PageMasteryStatus>;
  observerStates: Record<number, ObserverState>;
  quizCompleted: boolean;
  lastUpdated: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Max messages to keep per page in localStorage (prevents quota overflow) */
const MAX_MESSAGES_PER_PAGE = 50;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSessionKey(id: string): string {
  // Use a stable key based on chapter ID
  return `adoris_session_${btoa(id)}`;
}

/** Trim chat histories to prevent localStorage from exceeding quota */
function trimSession(state: SessionState): SessionState {
  const trimmed = { ...state, chatHistories: { ...state.chatHistories } };
  for (const page of Object.keys(trimmed.chatHistories)) {
    const msgs = trimmed.chatHistories[Number(page)];
    if (msgs && msgs.length > MAX_MESSAGES_PER_PAGE) {
      trimmed.chatHistories[Number(page)] = msgs.slice(-MAX_MESSAGES_PER_PAGE);
    }
  }
  return trimmed;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load session state from localStorage. Returns null if not found.
 */
export function loadSession(id: string): SessionState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getSessionKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

/**
 * Save session state to localStorage.
 */
export function saveSession(state: SessionState): void {
  if (typeof window === 'undefined') return;
  try {
    const toSave = trimSession({
      ...state,
      lastUpdated: new Date().toISOString(),
    });
    localStorage.setItem(getSessionKey(state.id), JSON.stringify(toSave));
  } catch (e) {
    // If quota exceeded, try clearing old sessions and retry once
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      try {
        // Remove the oldest adoris session to make room
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('adoris_session_') && key !== getSessionKey(state.id)) {
            localStorage.removeItem(key);
            break;
          }
        }
        localStorage.setItem(getSessionKey(state.id), JSON.stringify(trimSession({ ...state, lastUpdated: new Date().toISOString() })));
        return;
      } catch { /* fall through */ }
    }
    console.warn('[SessionStore] Failed to save session:', e);
  }
}

/**
 * Clear a session from localStorage.
 */
export function clearSession(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getSessionKey(id));
}

/**
 * Check if an active session exists for a given file.
 */
export function hasSession(id: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getSessionKey(id)) !== null;
}

/**
 * Create a fresh initial session state.
 */
export function createInitialSession(
  id: string,
  fileName: string,
  totalPages: number,
  chapterPlan: ChapterPlan | null
): SessionState {
  const masteryStatus: Record<number, PageMasteryStatus> = {};
  for (let i = 0; i < totalPages; i++) {
    masteryStatus[i] = i === 0 ? 'in_progress' : 'locked';
  }

  return {
    id,
    fileName,
    currentPage: 0,
    totalPages,
    chapterPlan,
    lessonPlans: {},
    chatHistories: {},
    masteryStatus,
    observerStates: {},
    quizCompleted: false,
    lastUpdated: new Date().toISOString(),
  };
}
