# Model Call Refinement: Continuation Logic

This document provides a complete, verified, and end-to-end implementation plan for introducing response continuation logic into the AI chat service. This feature will allow the system to handle model responses that are truncated due to token limits, ensuring a complete answer is assembled by automatically re-prompting the model.

## Legend

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or nested set that has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api` - includes interface definition in `interface.ts`, implementation in `adapter.ts`, and mocks in `mocks.ts`)
*   `[STORE]` State Management (`@paynless/store` - includes interface definition, actions, reducers/slices, selectors, and mocks)
*   `[UI]` Frontend Component (e.g., in `apps/web`, following component structure rules)
*   `[CLI]` Command Line Interface component/feature
*   `[IDE]` IDE Plugin component/feature
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update (API-Backend, Store-Component, RLS)
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update (READMEs, API docs, user guides)
*   `[REFACTOR]` Code Refactoring Step
*   `[PROMPT]` System Prompt Engineering/Management
*   `[CONFIG]` Configuration changes (e.g., environment variables, service configurations)
*   `[COMMIT]` Checkpoint for Git Commit (aligns with "feat:", "test:", "fix:", "docs:", "refactor:" conventions)
*   `[DEPLOY]` Checkpoint for Deployment consideration after a major phase or feature set is complete and tested.

---

## Implementation Plan: Model Call Continuation

### Phase 1: Backend Implementation

#### 1. [BE] [API] Update Core Backend Types and Schemas

*   `[ ]` 1.a. **Update `ChatApiRequest` Type:**
    *   **File:** `supabase/functions/_shared/types.ts`
    *   **Action:** Add a new optional property `continue_until_complete?: boolean` to the `ChatApiRequest` interface.
*   `[ ]` 1.b. **Update `ChatApiRequestSchema`:**
    *   **File:** `supabase/functions/chat/index.ts`
    *   **Action:** Modify the Zod schema (`ChatApiRequestSchema`) to include `continue_until_complete: z.boolean().optional()`.

#### 2. [TEST-UNIT] Create Test File and Scenarios for Continuation Logic

*   `[ ]` 2.a. **Create New Test File:** `supabase/functions/chat/continue.test.ts`
*   `[ ]` 2.b. **Define Test Mocks:** Set up mock AI provider adapters to simulate `finish_reason: 'stop'` vs. `finish_reason: 'length'`.
*   `[ ]` 2.c. **Implement Test Case 1: Standard Single Call.**
*   `[ ]` 2.d. **Implement Test Case 2: Two-Part Continuation.**
*   `[ ]` 2.e. **Implement Test Case 3: Multi-Part Continuation.**
*   `[ ]` 2.f. **Implement Test Case 4: Continuation Flag Disabled.**
*   `[ ]` 2.g. **Implement Test Case 5: Maximum Loop Iterations (Safety Break).**

#### 3. [BE] [REFACTOR] Implement the Continuation Service Module

*   `[ ]` 3.a. **Create New Service File:** `supabase/functions/chat/continue.ts`.
*   `[ ]` 3.b. **Implement `handleContinuationLoop` function:** This function will contain the core `while` loop logic.

#### 4. [BE] [REFACTOR] Integrate Continuation Logic into the Main Chat Handler

*   `[ ]` 4.a. **Refactor `handlePostRequest` in `supabase/functions/chat/index.ts`:** Import `handleContinuationLoop`.
*   `[ ]` 4.b. **Implement Conditional Logic:** Based on the `continue_until_complete` flag, call the appropriate handler.
*   `[ ]` 4.c. **Unify Post-Processing Logic:** Ensure token debit and DB insertion work for both single and multi-part responses.

### Phase 2: Exposing the Feature to Services and the Frontend

#### 5. [BE] Update Inter-Service Communication (`dialectic-service`)

*   `[ ]` 5.a. **Update `callUnifiedAIModel` Signature in `callModel.ts`:**
    *   **File:** `supabase/functions/dialectic-service/callModel.ts`
    *   **Action:** Modify the `callUnifiedAIModel` function signature to accept a new optional boolean parameter, `continueUntilComplete`.
*   `[ ]` 5.b. **Pass Flag to `/chat` Invocation:**
    *   **File:** `supabase/functions/dialectic-service/callModel.ts`
    *   **Action:** Inside `callUnifiedAIModel`, when constructing the `body` for the `fetch` call, include the `continue_until_complete: continueUntilComplete` property.
*   `[ ]` 5.c. **Update `generateContributions` to Request Continuation:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** In the `generateContributions` function, locate the call to `deps.callUnifiedAIModel` and pass `true` for the new `continueUntilComplete` parameter.
    *   **Rationale:** The Dialectic Service requires full, uninterrupted responses, so this should be enabled by default.
*   `[ ]` 5.d. **Acknowledge the `submitStageResponses` Workflow:**
    *   `[DOCS]` **File:** `docs/implementations/Current/Checklists/Current/Model Call Refinement.md` (Self-reference)
    *   **Action:** Add a note to this checklist clarifying that `submitStageResponses` is the function that prepares the prompt for the next stage, but `generateContributions` is the function that consumes that prompt and makes the actual AI call. This is a critical context for understanding the end-to-end flow.

#### 6. [API] Update the Frontend API Client

*   `[ ]` 6.a. **Update `SendMessageParams` Interface:**
    *   **File:** `packages/api/src/ai.api.ts`
    *   **Action:** Add the optional `continue_until_complete?: boolean` property to the `SendMessageParams` interface.
*   `[ ]` 6.b. **Pass Parameter in `sendMessage` Implementation:**
    *   **File:** `packages/api/src/ai.api.ts`
    *   **Action:** In the `sendMessage` function, include the `continue_until_complete` flag in the body of the `POST` request to `/chat`.

#### 7. [STORE] Integrate State Management

*   `[ ]` 7.a. **Update `AIState` Interface:**
    *   **File:** `packages/store/src/aiStore.ts`
    *   **Action:** Add `continueUntilComplete: boolean` to the `common` object within the `AIState` interface and `initialAIState`.
*   `[ ]` 7.b. **Create New Reducer:**
    *   **File:** `packages/store/src/aiStore.ts`
    *   **Action:** Add a `setContinueUntilComplete(state, action: PayloadAction<boolean>)` reducer to the `aiSlice`.
*   `[ ]` 7.c. **Update `sendMessage` Thunk:**
    *   **File:** `packages/store/src/ai.SendMessage.ts`
    *   **Action:** In the `sendMessage` thunk, read `continueUntilComplete` from the state and pass it to the `aiApi.sendMessage` call.

#### 8. [UI] Create User-Facing Toggle Component

*   `[ ]` 8.a. **Design UI Component in `AIChatInput`:**
    *   **File:** `apps/web/src/components/ai/AIChatInput.tsx`
    *   **Action:** Add a `Switch` component and `Label` (e.g., "Full Response") to the chat input form.
*   `[ ]` 8.b. **Connect Component to Store:**
    *   **File:** `apps/web/src/components/ai/AIChatInput.tsx`
    *   **Action:** Use `useAppSelector` to get the `continueUntilComplete` state and `useAppDispatch` to dispatch the `setContinueUntilComplete` action on toggle.

### Phase 3: Finalization and Deployment

#### 9. [TEST-E2E] [DOCS] [COMMIT] [DEPLOY] Finalization

*   `[ ]` 9.a. **Create End-to-End Test:**
    *   `[TEST-E2E]` **Action:** Create a test simulating a user toggling the switch and receiving a complete, multi-part response.
*   `[ ]` 9.b. **Run All Tests:**
    *   **Action:** Execute all unit, integration, and E2E tests.
*   `[ ]` 9.c. **Update All Relevant Documentation:**
    *   `[DOCS]` **Action:** Update API docs, user guides, and service READMEs.
*   `[ ]` 9.d. **Git Commit:**
    *   `[COMMIT]` **Action:** Commit with a conventional message, e.g., `feat(chat): implement and surface response continuation feature`.
*   `[ ]` 9.e. **Deployment:**
    *   `[DEPLOY]` **Action:** Deploy after all tests and reviews are complete. 

---

### Phase 4: Dialectic Process Scaling

This phase addresses the context window limitations inherent in the multi-stage dialectic process. It introduces immediate fixes for Stage 2 (Antithesis) and a long-term, robust solution for Stage 3 (Synthesis) and beyond.

#### 10. [BE] [REFACTOR] Implement Task Isolation for Antithesis Stage (Stage 2)

This addresses the "lumping" problem by breaking down the single large critique task into multiple, focused tasks.

*   `[ ]` 10.a. **Refactor `generateContributions` Logic:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Modify the function to iterate through each received Thesis document. For each Thesis, make a separate, individual call to `deps.callUnifiedAIModel` with a prompt focused solely on critiquing that single Thesis. This will change the flow from `n` large calls to `n*n` small, focused calls.
*   `[ ]` 10.b. **Update Result Aggregation:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Ensure the results from all `n*n` calls are correctly collected and structured before being returned. The final output structure should remain consistent.
*   `[ ]` 10.c. **Add Focused Unit Tests:**
    *   `[TEST-UNIT]` **Action:** Create new unit tests that verify the `n*n` call logic, ensuring each call is constructed with the correct, isolated context.

#### 11. [BE] [DB] [REFACTOR] Implement RAG for Synthesis Stage (Stage 3+)

This implements a full Retrieval-Augmented Generation pipeline to manage the massive context explosion in Stage 3 and beyond. We will leverage standard tools like Supabase's `pgvector` for this.

*   `[ ]` 11.a. **Setup the Vector Database:**
    *   `[DB]` **Tool:** Supabase SQL Editor.
    *   **Action:** Enable the `vector` extension in your Supabase project (`create extension vector;`).
    *   `[DB]` **Action:** Create a new table, `dialectic_memory`, to store text chunks and their embeddings. It should include columns like `id` (UUID), `session_id` (FK to `dialectic_sessions`), `source_contribution_id` (FK to `dialectic_contributions`), `content` (text), `metadata` (JSONB), and `embedding` (vector).
*   `[ ]` 11.b. **Implement the Indexing Service:**
    *   `[BE]` **Recommendation:** Use a library like `langchain-js` (which has Deno support) to simplify text splitting and embedding calls.
    *   `[BE]` **Action:** Create a new service, e.g., in `supabase/functions/_shared/services/indexing_service.ts`. This service will have a function that:
        1.  Takes a document's text and metadata.
        2.  Uses a text splitter (e.g., `RecursiveCharacterTextSplitter`) to break it into chunks.
        3.  Calls an embedding model API (e.g., OpenAI's `text-embedding-3-small`) for each chunk.
        4.  Saves the chunk's content, metadata, and the resulting embedding vector into the `dialectic_memory` table.
*   `[ ]` 11.c. **Integrate Indexing into the Dialectic Flow:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** After the promises for the `n*n` Antithesis calls resolve, asynchronously trigger the new indexing service for each generated document.
*   `[ ]` 11.d. **Implement the Retrieval Service:**
    *   `[BE]` **Action:** Create an RPC function in Supabase, e.g., `match_dialectic_chunks`. This function will take a query embedding and a session ID, and use the `<=>` vector distance operator to find and return the `k` most similar document chunks from the `dialectic_memory` table.
*   `[ ]` 11.e. **Refactor the Synthesis Stage Logic:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-service/generateContribution.ts` (or wherever Synthesis logic will live).
    *   **Action:** Completely change the prompt assembly for Stage 3. Instead of concatenating full documents:
        1.  Formulate a query string (e.g., "Based on the provided context, create a unified synthesis.").
        2.  Embed this query string using the embedding model.
        3.  Call the `match_dialectic_chunks` RPC to retrieve the most relevant context.
        4.  Assemble a new, compact prompt containing the original query and the retrieved chunks.
        5.  Call `deps.callUnifiedAIModel` with this RAG-generated prompt.
*   `[ ]` 11.f. **Test the RAG Pipeline:**
    *   `[TEST-INT]` **Action:** Create integration tests that verify the full pipeline: a document is indexed, a query retrieves the correct chunks, and a final prompt is assembled as expected. 