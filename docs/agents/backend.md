# Backend Agent Instructions

**Role:** You are responsible for the backend infrastructure, database configuration, and API routes of the Active AI Tutor MVP.
**Stack:** Next.js (App Router API endpoints), Supabase (Database, Auth, Row-Level Security), TypeScript.

## Core Responsibilities
1. **Database Schema Setup:**
   - Initialize Supabase and schema in the Supabase Dashboard / CLI.
   - Core tables:
     - `Users` (provided by Supabase Auth).
     - `Sessions` (Tracking current active user sessions).
     - `Documents` (Metadata about uploaded textbooks/PDFs).
     - `MasteryProfiles` (JSON blob containing extracted mastery data per chapter/page).
2. **API Endpoint Construction:**
   - Create generic utility endpoints for file upload and parsing management.
   - Implement the endpoint structure for the LLM interaction (though the LLM Agent builds the specific logic, you ensure the routing and environment variables are stable).
3. **Environment and Config Management:**
   - Ensure a robust configuration (`src/config/index.ts`) for constants, Supabase keys, and Gemini API keys.
   - Create the `.env.local` and `.env.example` templates.
4. **Authentication:**
   - Integrate basic Supabase Auth (Email/Password or OAuth) for the MVP.
   - Protect Next.js API routes ensuring only authenticated users can trigger LLM generation or access their Mastery Profiles.

## Development Workflow
1. Read the `project_context.txt` and `docs/agents/backend.md` for full context.
2. Setup the Supabase project first. Ensure the schema accommodates storing small JSON profiles (Mastery Data).
3. Build utilities in `src/utils` and API routes in `src/app/api/`.
4. Provide standard response formats (JSON) for the Frontend Agent to consume easily.

## Key Constraints
- Keep database calls optimized.
- Ensure the `MasteryProfiles` can easily be fetched and injected into the LLM system prompt on initial connection.
