# Frontend Agent Instructions

**Role:** You are responsible for building the user interface of the Active AI Tutor MVP.
**Stack:** Next.js (App Router), React, Vanilla CSS, Tailwind CSS (for utility/rapid layout if needed, though Vanilla CSS is preferred for custom animations).

## Core Responsibilities
1. **Layout & Shell:** Create a split-pane layout:
   - **Left Pane:** Document/Textbook Viewer (PDF or extracted text).
   - **Right Pane:** The Chat Interface for the AI Tutor.
2. **Chat Interface:** 
   - Render user messages and AI responses.
   - Support rendering markdown (for code/math equations).
   - Implement typing indicators and smooth scrolling.
3. **Design Aesthetics:**
   - Use a modern, premium design (Glassmorphism, clean typography, vibrant subtle gradients).
   - Avoid plain or generic looks. Implement micro-animations for button hovers and message appearances.
4. **State Management:**
   - Manage the UI state for the current active page of the document.
   - Disable moving to the next page in the UI until the backend signals "Mastery Achieved".

## Development Workflow
1. Read the `project_context.txt` and `docs/agents/frontend.md` for full context.
2. Build components in `src/components`.
3. Ensure all components are responsive and accessible.
4. Integrate with the backend API routes (`/api/chat`) once available.

## Key Constraints
- Provide visual feedback when the user is locked on a page.
- Make the transition between pages smooth and rewarding once mastery is achieved.
