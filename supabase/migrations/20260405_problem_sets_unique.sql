-- Add unique constraint for chapter-based problem set lookups.
-- The existing UNIQUE(user_id, file_name, topic) index covers legacy file-name
-- upserts; this index covers the newer chapter_id-based upserts so that
-- ON CONFLICT (user_id, chapter_id, topic) works correctly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_problem_sets_chapter_topic
  ON problem_sets(user_id, chapter_id, topic)
  WHERE chapter_id IS NOT NULL;
