-- ============================================================
-- Adoris.arav — Enhanced Schema Migration
-- Adds: exam attempts, practice scores, struggle tracking
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. EXAM ATTEMPTS TABLE ──────────────────────────────────
-- Supports multiple exam attempts per chapter with student name
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS student_name TEXT DEFAULT '';
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS time_taken_seconds INTEGER DEFAULT 0;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS section_scores JSONB DEFAULT '[]';

-- ── 2. PRACTICE SCORES TABLE ────────────────────────────────
-- Stores scored practice attempts per topic
CREATE TABLE IF NOT EXISTS practice_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  topic TEXT NOT NULL,
  set_type TEXT NOT NULL CHECK (set_type IN ('example', 'practice')),
  total_problems INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  score_pct NUMERIC(5,2) DEFAULT 0,
  answers JSONB DEFAULT '{}',
  completed_at TIMESTAMPTZ DEFAULT now(),
  time_taken_seconds INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_practice_scores_chapter ON practice_scores(chapter_id);
CREATE INDEX IF NOT EXISTS idx_practice_scores_user ON practice_scores(user_id);

-- ── 3. STRUGGLE TRACKING TABLE ──────────────────────────────
-- Tracks topics/concepts where the student struggles
CREATE TABLE IF NOT EXISTS struggle_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  concept TEXT,
  struggle_type TEXT CHECK (struggle_type IN ('wrong_answer', 'hint_needed', 'multiple_attempts', 'low_score', 'confusion_detected')),
  severity INTEGER DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  context JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_struggle_user ON struggle_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_struggle_chapter ON struggle_tracking(chapter_id);
CREATE INDEX IF NOT EXISTS idx_struggle_topic ON struggle_tracking(topic);

-- ── 4. BATCH SESSION INFO VIEW ──────────────────────────────
-- Optimized view for dashboard to avoid N+1 queries
CREATE OR REPLACE VIEW session_summaries AS
SELECT
  cs.chapter_id,
  cs.user_id,
  cs.current_page,
  cs.quiz_completed,
  cs.last_updated,
  c.page_count as total_pages,
  (SELECT count(*) FROM jsonb_each_text(cs.mastery_status) WHERE value = 'mastered') as mastered_count
FROM chapter_sessions cs
JOIN chapters c ON c.id = cs.chapter_id;

-- ── 5. RLS for new tables ───────────────────────────────────
ALTER TABLE practice_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE struggle_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "practice_scores_select" ON practice_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "practice_scores_insert" ON practice_scores FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "struggle_select" ON struggle_tracking FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "struggle_insert" ON struggle_tracking FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "struggle_update" ON struggle_tracking FOR UPDATE USING (auth.uid() = user_id);

-- ── 6. Add total_pages to chapter_sessions if missing ───────
ALTER TABLE chapter_sessions ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0;
ALTER TABLE chapter_sessions ADD COLUMN IF NOT EXISTS observer_states JSONB DEFAULT '{}';
