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
    passkey: process.env.NEXT_PUBLIC_PASSKEY || 'default-passkey',
  },
};
