-- ============================================================
-- Adoris.arav — Complete Database Migration
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. BOOKS TABLE ──────────────────────────────────────────
-- Represents a textbook or notes collection
CREATE TABLE IF NOT EXISTS books (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,                     -- e.g. "HC Verma Vol 1"
  subject TEXT NOT NULL,                   -- e.g. "Physics"
  author TEXT DEFAULT '',                  -- e.g. "H.C. Verma"
  description TEXT DEFAULT '',
  cover_storage_path TEXT DEFAULT '',      -- optional cover image in Storage
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. CHAPTERS TABLE ───────────────────────────────────────
-- Each row = one PDF chapter of a book
-- Supports fragmented chapters (upload ch1, ch3, ch7 independently)
CREATE TABLE IF NOT EXISTS chapters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID REFERENCES books(id) ON DELETE CASCADE NOT NULL,
  chapter_number INTEGER NOT NULL,         -- determines sort order
  chapter_title TEXT NOT NULL,             -- e.g. "Newton's Laws of Motion"
  storage_path TEXT NOT NULL,              -- path in Supabase Storage bucket "pdfs"
                                           -- format: {user_id}/{subject}/{book-slug}/ch{nn}_{title}.pdf
  page_count INTEGER DEFAULT 0,            -- filled in after upload
  is_processed BOOLEAN DEFAULT false,      -- true once chapter plan generated
  chapter_plan JSONB DEFAULT NULL,         -- stores ChapterPlan from Gemini
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique: only one chapter_number per book
CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_book_number 
  ON chapters(book_id, chapter_number);

-- ── 3. SESSION STATE TABLE ──────────────────────────────────
-- Mirrors localStorage but persisted in DB for cross-device support
-- (localStorage stays as the fast cache; this is the source of truth)
CREATE TABLE IF NOT EXISTS chapter_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  current_page INTEGER DEFAULT 0,
  mastery_status JSONB DEFAULT '{}',       -- { "0": "mastered", "1": "in_progress" }
  lesson_plans JSONB DEFAULT '{}',         -- { "0": { lessonPlan }, "1": {...} }
  chat_histories JSONB DEFAULT '{}',       -- { "0": [messages], "1": [...] }
  quiz_completed BOOLEAN DEFAULT false,
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chapter_id)              -- one session per user per chapter
);

-- ── 4. PROBLEM SETS TABLE ───────────────────────────────────
-- Stores generated problem banks per topic (cached to avoid regenerating)
CREATE TABLE IF NOT EXISTS problem_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  file_name TEXT,                          -- fallback name
  topic TEXT NOT NULL,
  chapter_title TEXT,
  problems JSONB NOT NULL,                 -- full ProblemSet JSON
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, file_name, topic)        -- one problem set per topic per file/chapter
);

-- ── 5. EXAM RESULTS TABLE ───────────────────────────────────
-- Stores completed exam submissions
CREATE TABLE IF NOT EXISTS exam_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  exam_data JSONB NOT NULL,                -- full Exam JSON (questions)
  answers JSONB DEFAULT '{}',             -- { questionNumber: { selected, text } }
  score INTEGER DEFAULT 0,
  total_marks INTEGER DEFAULT 60,
  passed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. INDEXES ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON chapter_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_chapter ON chapter_sessions(chapter_id);
CREATE INDEX IF NOT EXISTS idx_problem_sets_chapter ON problem_sets(chapter_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_chapter ON exam_results(chapter_id);

-- ── 7. ROW LEVEL SECURITY ───────────────────────────────────
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapter_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

-- Books: users see only their own
CREATE POLICY "books_select" ON books FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "books_insert" ON books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "books_update" ON books FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "books_delete" ON books FOR DELETE USING (auth.uid() = user_id);

-- Chapters: users see chapters of their books
CREATE POLICY "chapters_select" ON chapters FOR SELECT
  USING (book_id IN (SELECT id FROM books WHERE user_id = auth.uid()));
CREATE POLICY "chapters_insert" ON chapters FOR INSERT
  WITH CHECK (book_id IN (SELECT id FROM books WHERE user_id = auth.uid()));
CREATE POLICY "chapters_update" ON chapters FOR UPDATE
  USING (book_id IN (SELECT id FROM books WHERE user_id = auth.uid()));
CREATE POLICY "chapters_delete" ON chapters FOR DELETE
  USING (book_id IN (SELECT id FROM books WHERE user_id = auth.uid()));

-- Sessions
CREATE POLICY "sessions_select" ON chapter_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sessions_insert" ON chapter_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sessions_update" ON chapter_sessions FOR UPDATE USING (auth.uid() = user_id);

-- Problem Sets
CREATE POLICY "problems_select" ON problem_sets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "problems_insert" ON problem_sets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Exam Results
CREATE POLICY "exams_select" ON exam_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "exams_insert" ON exam_results FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ── 8. STORAGE BUCKET ───────────────────────────────────────
-- Run this separately if needed (or create via Supabase Dashboard):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('pdfs', 'pdfs', false);
-- 
-- Storage path convention:
--   {user_id}/{subject-slug}/{book-slug}/ch{nn}_{chapter-title-slug}.pdf
--   Example: abc-123/physics/hc-verma-vol1/ch05_newtons-laws.pdf
--
-- Storage RLS (run in SQL editor after creating bucket):
-- CREATE POLICY "pdf_upload" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "pdf_read" ON storage.objects FOR SELECT
--   USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "pdf_delete" ON storage.objects FOR DELETE
--   USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
