# AI Chat Enhancements: Implementation Plan

## Legend

*   [ ] Each work step will be uniquely named for easy reference 
    *   [ ] Worksteps will be nested as shown
        *   [ ] Nesting can be as deep as logically required 
*   [✅] Represents a completed step or nested set
*   [🚧] Represents an incomplete or partially completed step or nested set
*   [⏸️] Represents a paused step where a discovery has been made that requires backtracking 
*   [❓] Represents an uncertainty that must be resolved before continuing 
*   [🚫] Represents a blocked, halted, stopped step or nested set that has some unresolved problem or prior dependency to resolve before continuing

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

* **[DB]:** Database Schema Change (Migration)
* **[RLS]:** Row-Level Security Policy
* **[BE]:** Backend Logic (Edge Function / RLS / Helpers)
* **[API]:** API Client Library (`@paynless/api`)
* **[STORE]:** State Management (`@paynless/store`)
* **[UI]:** Frontend Component (`apps/web`)
* **[TEST-UNIT]:** Unit Test Implementation/Update
* **[TEST-INT]:** Integration Test Implementation/Update (API, Store-Component, RLS)
* **[ANALYTICS]:** Analytics Integration (`@paynless/analytics`)
* **[REFACTOR]:** Code Refactoring Step
* **[COMMIT]:** Checkpoint for Git Commit

## Implementation Plan Overview

This implementation plan follows a phased approach, with each phase building on the previous one:

1. **Project Setup & Planning:** Initialize the project structure, branches, and establish development practices
2. **Database & Backend Foundation:** Implement core database schema changes and RLS policies
3. **API Client Integration:** Update API client methods to support organization context
4. **Store Refactoring:** Modify state management to support organization-scoped chats
5. **Core UI Components:** Implement primary UI components for organization chat context
6. **Bug Fixes:** Address identified user experience issues
7. **Chat Experience Enhancements:** Implement markdown support, token tracking, etc.
8. **Testing & Refinement:** Comprehensive testing and final adjustments
9. **Documentation & Deployment:** Create documentation and prepare for release

---

## Phase 7: Stretch Goals (If Time Permits)

### STEP-7.1: Markdown File Handling [🚧]

#### STEP-7.1.1: Implement Markdown Export [UI] [COMMIT]
* [ ] Create unit tests for markdown export functionality
* [ ] Create new component `apps/web/src/components/ai/ChatExport.tsx`:
  * [ ] Add export button to chat interface
  * [ ] Implement function to convert chat history to markdown
  * [ ] Create file download mechanism
  * [ ] Add analytics tracking for exports
* [ ] Run unit tests to verify export functionality
* [ ] Commit changes with message "feat(UI): Implement markdown export of chat history"

### STEP-7.2: .md File Upload (Stretch - Requires Storage Setup) [Based on Gemini 5.2] [🚧]
*   [ ] **Step 7.2.1: [BE] Setup Supabase Storage**
    *   [ ] Create a new bucket (e.g., `chat_uploads`) in Supabase Studio.
    *   [ ] Define RLS policies for the bucket: Allow authenticated users to `INSERT` into a path like `user_id/*`. Allow `SELECT` only on own files. (Consult Supabase Storage RLS docs).
*   [ ] **Step 7.2.2: [TEST-UNIT] Define Upload Component/Hook Tests**
    *   [ ] Test UI component renders file input (accepts `.md`).
    *   [ ] Test hook/logic calls Supabase storage client `upload` method on file selection. Handles success/error. Expect failure (RED).
*   [ ] **Step 7.2.3: [UI] Implement Upload Component & Logic**
    *   [ ] Add file input button (restricted to `.md`) to chat input area.
    *   [ ] On file selection:
        *   Use Supabase client JS library (`supabase.storage.from('chat_uploads').upload(...)`) to upload file to user-specific path.
        *   On success, store file path/metadata temporarily (e.g., local state).
        *   Display indicator that file is attached. Allow removal.
*   [ ] **Step 7.2.4: [BE][API][STORE] Modify Send Message Flow (Minimal V1)**
    *   [ ] Modify `sendMessage` (BE, API, Store) to optionally accept `attached_file_path: string`.
    *   [ ] Modify `chat_messages` table: Add `metadata JSONB NULLABLE` column if not present (requires migration).
    *   [ ] Backend `chat` function: Save `attached_file_path` into `metadata` of the *user* message. (AI interaction with file content is out of scope for V1 stretch).
*   [ ] **Step 7.2.5: [TEST-UNIT][TEST-INT] Run Upload Tests & Refactor**
    *   [ ] Run tests (UI, BE). Debug until pass (GREEN).
    *   [ ] **[REFACTOR]** Ensure secure upload, clear UI feedback.
*   [ ] **Step 7.2.6: [TEST-INT] Manual Test Upload**
    *   [ ] Upload `.md` file. Verify UI indicator. Send message.
    *   [ ] Check `chat_messages` table `metadata` for file path.
    *   [ ] Check Supabase Storage bucket for uploaded file.
*   [ ] **Step 7.2.7: [COMMIT] Commit Markdown Upload Feature**
    *   [ ] Commit: `feat(STRETCH): Implement basic .md file upload associated with chat messages (requires storage setup)`

---

**Phase 7 Complete Checkpoint:**
*   [ ] Stretch goals (Markdown Export/Import) implemented (if applicable) and tested.
*   [ ] Supabase Storage configured and RLS policies tested (if upload implemented).
*   [ ] Core functionality remains stable after adding stretch goals.
*   [ ] Code refactored, and commits made.
*   [ ] Run `npm test`, `npm run build`. Perform targeted testing for stretch features. 