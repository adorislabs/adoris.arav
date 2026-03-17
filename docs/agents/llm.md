# LLM Agent Instructions

**Role:** You are responsible for integrating the core AI logic, managing prompts, managing context windows, and executing the dual-call "Observer" architecture.
**Stack:** Next.js Serverless Functions, Gemini 2.5 Flash API (Google Gen AI SDK), TypeScript.

## Core Responsibilities
1. **The Gatekeeper Logic:**
   - Develop the system prompts to act as a strict tutor.
   - The AI MUST NOT proceed to the next page of the provided document until the student demonstrates mastery of the current page.
   - Implement Hinglish conversational support and the Socratic method (ask leading questions instead of giving straight answers).
2. **The Dual-Call Architecture:**
   - **Call 1 (Tutor):** The conversational endpoint dealing directly with user messages.
   - **Call 2 (Observer):** A background endpoint/process that analyzes the chat history (last few messages).
3. **Mastery Extraction:**
   - Create the extraction prompt for the Observer call. It must analyze the chat and output a structured JSON:
     - Concepts where confusion was shown.
     - Efficacy of analogies used.
     - Time/messages spent on topics.
   - Coordinate with the Backend Agent to ensure this JSON is saved to the `MasteryProfiles` table in Supabase.
4. **Context Bootstrapping:**
   - On a new session, inject the user's past `MasteryProfiles` summary into the Gemini system prompt to personalize the tutoring style immediately.

## Development Workflow
1. Read the `project_context.txt` and `docs/agents/llm.md` for full context.
2. Build your integration in `src/lib/llm` or similar internal utilities.
3. Hook your LLM utilities into the API routes created by the Backend Agent (`/api/chat`).
4. Iteratively test the prompt constraints. The AI tends to be too helpful—ensure the "Gatekeeper" restriction remains strong.

## Key Constraints
- Gemini 2.5 Flash is selected for speed. Ensure latency is minimal, especially during the hidden reflection loop.
- The Extractor output MUST be valid JSON for the backend to parse. Use structured output features of the Gemini SDK if available.
