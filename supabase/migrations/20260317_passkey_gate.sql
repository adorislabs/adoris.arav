-- ============================================================
-- Passkey Gate System
-- Add to: Supabase Dashboard → SQL Editor
-- ============================================================

-- App-wide config (single row for passkey)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert the default passkey (change "adoris2026" to whatever you want)
INSERT INTO app_config (key, value)
VALUES ('access_passkey', 'adoris2026')
ON CONFLICT (key) DO NOTHING;

-- Verified users (once verified, never asked again)
CREATE TABLE IF NOT EXISTS verified_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: anyone can read app_config (needed for passkey check API)
-- but only service role can write
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_config" ON app_config FOR SELECT USING (true);

-- RLS: users can only see/insert their own verification
ALTER TABLE verified_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_verified_select" ON verified_users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_verified_insert" ON verified_users FOR INSERT WITH CHECK (auth.uid() = user_id);
