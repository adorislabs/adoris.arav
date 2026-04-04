export const config = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  },
  app: {
    url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    studentName: process.env.NEXT_PUBLIC_STUDENT_NAME || 'Student',
    // NOTE: passkey is stored in the DB (app_config table) and verified server-side.
    // Do NOT add it here as a NEXT_PUBLIC_ variable — that would expose it to the browser.
  },
};
