# Adoris.arav — Setup Guide

## Prerequisites
| Tool | Why |
|------|-----|
| Node.js 18+ | Runtime |
| npm 9+ | Package manager |
| A Supabase account | Auth + database |
| A Google AI Studio account | Gemini API |

---

## Step 1 — Clone & Install

```bash
git clone <your-repo>
cd adoris.arav
npm install
```

---

## Step 2 — Environment Variables

Create a `.env.local` file in the project root:

```env
# Google Gemini API (get from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_key_here

# Supabase (get from your Supabase project → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# App URL (use localhost for dev)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Step 3 — Supabase Database Setup

Go to your **Supabase Dashboard → SQL Editor** and run the migration file:

```
supabase/migrations/20260317_problem_sets_and_exams.sql
```

This creates:
- `problem_sets` table — stores generated problem banks per topic
- `exam_results` table — stores completed exam history
- Row Level Security (RLS) policies — each user only sees their own data

---

## Step 4 — Add Your PDFs

Place PDF files in:

```
src/data/pdfs/
```

Any `.pdf` file dropped here will automatically appear on the dashboard. No config needed.

---

## Step 5 — Run Locally

```bash
npm run dev
```

Visit `http://localhost:3000` → log in → you'll see your PDFs listed.

---

## Step 6 — Deploy to Vercel (optional but recommended for persistence)

```bash
npm install -g vercel
vercel
```

When prompted, set the same environment variables from Step 2 in the Vercel dashboard:  
**Project → Settings → Environment Variables**

---

## Tuning the Tutor

Edit **`src/config/tutorConfig.ts`** — all personality and cost settings live here:

| Setting | Default | Options |
|---------|---------|---------|
| `language` | `hinglish` | `english` / `hindi` / `hinglish` |
| `formality` | `casual` | `casual` / `friendly` / `academic` |
| `analogyStyle` | `daily_life` | `cricket` / `bollywood` / `tech` / `gaming` |
| `socraticIntensity` | `0.8` | `0.0` – `1.0` |
| `masteryThreshold` | `strict` | `lenient` / `moderate` / `strict` |
| `observerFrequency` | `10` | How many messages between Observer runs |

---

## User Flow

```
Dashboard
  └── Select PDF
        └── [Session] Chapter plan generated (reads full PDF)
              └── Page-by-page tutoring (Socratic, persists in localStorage)
                    └── Master each page → unlock next
                          └── [Exam] 60-minute, 60-mark exam (25 questions)
                                └── [Problems] Practice bank per topic
                                        Foundation → Easy → Medium → Hard → Exam Level
```

---

## Cost Reference ($295 budget)

| Action | Approx Cost |
|--------|-------------|
| Chapter plan (full PDF) | ~$0.04 |
| Per-page lesson plan (×25 pages) | ~$0.28 |
| Chat session (~60 exchanges) | ~$0.22 |
| Observer (every 10th = ~6 calls/chapter) | ~$0.01 |
| Exam generation | ~$0.06 |
| Problem set (per topic, ~15 topics) | ~$0.90 |
| **Total per chapter (full feature use)** | **~$1.50** |
| **Total chapters with $295** | **~190 chapters** |

> Skipping problem set generation cuts chapter cost to **~$0.60 → ~490 chapters**.
