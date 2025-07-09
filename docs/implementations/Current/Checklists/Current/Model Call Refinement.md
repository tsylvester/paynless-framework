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
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

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

*   `[✅]` 1.a. **Update `ChatApiRequest` Type:**
    *   **File:** `supabase/functions/_shared/types.ts`
    *   **Action:** Add a new optional property `continue_until_complete?: boolean` to the `ChatApiRequest` interface. This will signal the chat handler to initiate the continuation logic.
*   `[✅]` 1.b. **Update `ChatApiRequestSchema`:**
    *   **File:** `supabase/functions/chat/index.ts`
    *   **Action:** Modify the Zod schema (`ChatApiRequestSchema`) to include `continue_until_complete: z.boolean().optional()`. This ensures that incoming requests with this new flag are validated correctly.

#### 2. [TEST-UNIT] Create Test File and Scenarios for Continuation Logic

*   `[✅]` 2.a. **Create New Test File:** `supabase/functions/chat/index.continue.test.ts`
*   `[✅]` 2.b. **Define Test Mocks:** Set up mock AI provider adapters to simulate different `finish_reason` scenarios. One mock should return `finish_reason: 'stop'` to simulate a complete response, and another should return `finish_reason: 'length'` to simulate a truncated response that requires continuation.
*   `[✅]` 2.c. **Implement Test Case 1: Standard Single Call.**
    *   **Action:** Verify that a standard request (with `continue_until_complete` set to `false` or undefined) results in a single call to the AI provider and returns a standard response, regardless of the `finish_reason`.
*   `[✅]` 2.d. **Implement Test Case 2: Two-Part Continuation.**
    *   **Action:** Send a request with `continue_until_complete: true`. The first mocked response should have `finish_reason: 'length'`. Verify the system makes a second call and correctly appends the second response's content to the first. The final combined response should be returned.
*   `[✅]` 2.e. **Implement Test Case 3: Multi-Part Continuation.**
    *   **Action:** Similar to the two-part test, but the mock should return `finish_reason: 'length'` for several consecutive calls before finally returning `finish_reason: 'stop'`. Verify all parts are concatenated correctly.
*   `[✅]` 2.f. **Implement Test Case 4: Continuation Flag Disabled.**
    *   **Action:** Send a request with `continue_until_complete: false` but where the mock returns `finish_reason: 'length'`. Verify that no continuation call is made and the truncated response is returned as-is.
*   `[✅]` 2.g. **Implement Test Case 5: Maximum Loop Iterations (Safety Break).**
    *   **Action:** Create a scenario where the mock *always* returns `finish_reason: 'length'`. Verify that the continuation loop has a safety break (e.g., max 5 iterations) and exits gracefully with an appropriate error or the content it has accumulated so far.

#### 3. [BE] [REFACTOR] Implement the Continuation Service Module

*   `[✅]` 3.a. **Create New Service File:** `supabase/functions/chat/continue.ts`.
*   `[✅]` 3.b. **Implement `handleContinuationLoop` function:**
    *   **Signature:** `async function handleContinuationLoop(initialRequest: ChatApiRequest, ...deps): Promise<CombinedResponse>`
    *   **Logic:** This function will contain the core `while` loop. It will call the AI provider, check the `finish_reason` of the response. If the reason is `'length'` and the loop count is under the safety limit, it should append the response to the message history and call the provider again. It will accumulate the content from all calls and return a single, unified response object.

#### 4. [BE] [REFACTOR] Integrate Continuation Logic into the Main Chat Handler

*   `[✅]` 4.a. **Refactor `handlePostRequest` in `supabase/functions/chat/index.ts`:**
    *   **Action:** Import the new `handleContinuationLoop` function.
*   `[✅]` 4.b. **Implement Conditional Logic:**
    *   **Action:** Inside `handlePostRequest`, add an `if` statement. If `requestBody.continue_until_complete` is `true`, call `handleContinuationLoop`. Otherwise, execute the existing single-call logic.
*   `[✅]` 4.c. **Unify Post-Processing Logic:**
    *   **Action:** Ensure that the final response object, whether from a single call or the continuation loop, is processed the same way for token debiting, database insertion, and the final success response sent to the client.

#### 4.A. [TEST-UNIT] Enhance Dummy Adapter for Realistic Testing
*   `[✅]` 4.A.a. **Update Mock Provider Data:**
    *   `[DB]` **Action:** In the test setup for `ai_providers`, add a `config` JSONB column to the mock data. For the dummy provider, populate this with realistic token limits, e.g., `{"provider_max_input_tokens": 4096, "provider_max_output_tokens": 1024}`.
*   `[✅]` 4.A.b. **Refactor Mock Adapter Logic:**
    *   `[BE]` `[REFACTOR]` **Action:** Modify the mock adapter used in the test suites. It should now:
        1.  Receive the `config` object as part of the provider details.
        2.  Implement a simple token counting utility (e.g., `content.length / 4` as a rough estimate).
        3.  Before "generating" a response, check if the estimated tokens in the input `messages` exceed `provider_max_input_tokens`. If so, it should throw an error simulating a "context window exceeded" failure from a real API.
        4.  When generating a multi-part response for continuation tests, it should use `provider_max_output_tokens` to decide where to "truncate" the response and return `finish_reason: 'length'`.
*   `[✅]` 4.A.c. **Implement New Test Case: Input Tokens Exceeded.**
    *   `[TEST-UNIT]` **Action:** Add a new test case that sends a very large input prompt (exceeding the new mock `provider_max_input_tokens` limit).
    *   **Action:** Verify that the `handlePostRequest` function catches the error from the adapter and returns a graceful error response to the client (e.g., HTTP 413 Payload Too Large).

#### 4.B. [BE] Proactively Validate Input Token Length
*   `[✅]` 4.B.a. **Refactor `handlePostRequest` to Include Pre-flight Token Check:**
    *   `[BE]` `[REFACTOR]` **Action:** In `supabase/functions/chat/index.ts`, locate the part of `handlePostRequest` where the final `adapterChatRequestNormal` object has been constructed, but *before* the `if (continue_until_complete)` block.
    *   **Action:**
        1.  Retrieve the `provider_max_input_tokens` value from the `config` object of the fetched provider details.
        2.  Use the existing tokenizer utility (e.g., `countTokensForMessages`) to calculate the total token count of the `adapterChatRequestNormal.messages` array.
        3.  If the calculated token count exceeds `provider_max_input_tokens`, immediately return a specific error (e.g., `{ error: { message: "Input prompt exceeds the model's maximum context size.", status: 413 } }`) without proceeding to call the AI adapter.
*   `[✅]` 4.B.b. **Add New Test Case for Proactive Validation:**
    *   `[TEST-UNIT]` **Action:** In the `chat/index.sendMessage.test.ts` suite (or other relevant test file), create a new test case where the input message history is intentionally larger than the `provider_max_input_tokens` set in the mock provider data.
    *   **Action:** Assert that `adapter.sendMessage` is **never called**.
    *   **Action:** Assert that the function returns the expected 413 (Payload Too Large) error response.

### Phase 2: Exposing the Feature to Services and the Frontend

#### 5. [UI] Create a Reusable "Continue Until Complete" Component

*   `[✅]` 5.a. **Create New Component File:**
    *   **File:** `apps/web/src/components/common/ContinueUntilCompleteToggle.tsx`
    *   **Action:** Create a new, self-contained component. It will consist of a `Label` and a `Switch`.
*   `[✅]` 5.b. **Implement State Logic:**
    *   **File:** `apps/web/src/components/common/ContinueUntilCompleteToggle.tsx`
    *   **Action:** The component will use the `useAiStore` hook to get the current `continueUntilComplete` boolean state and the `setContinueUntilComplete` action. The `Switch` will be bound to this state.
*   `[✅]` 5.c. **Add Unit Tests:**
    *   `[TEST-UNIT]` **File:** `apps/web/src/components/common/ContinueUntilCompleteToggle.test.tsx`
    *   **Action:** Create a test that renders the component, simulates a click on the switch, and verifies that the `setContinueUntilComplete` action in the mock store is called with the correct value.

#### 6. [BE] Update Inter-Service Communication (`dialectic-service`)

*   `[ ]` 6.a. **Update `callUnifiedAIModel` Signature in `callModel.ts`:**
    *   **File:** `supabase/functions/dialectic-service/callModel.ts`
    *   **Action:** Modify the `callUnifiedAIModel` function signature to accept a new optional boolean parameter: `continueUntilComplete?: boolean`.
*   `[ ]` 6.b. **Pass Flag to `/chat` Invocation:**
    *   **File:** `supabase/functions/dialectic-service/callModel.ts`
    *   **Action:** Inside `callUnifiedAIModel`, when constructing the `chatApiRequest` object, include the `continue_until_complete: continueUntilComplete` property. This will pass the flag to the `/chat` edge function.
*   `[ ]` 6.c. **Update `generateContributions` to Request Continuation:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** In the `generateContributions` function, locate the call to `deps.callUnifiedAIModel` (inside the `modelPromises.map`) and pass `true` for the new `continueUntilComplete` parameter.
    *   **Rationale:** The Dialectic Service requires full, uninterrupted responses to function correctly, so this should be enabled by default for all its AI calls.
*   `[ ]` 6.d. **Acknowledge the `submitStageResponses` Workflow:**
    *   `[DOCS]` **File:** `docs/implementations/Current/Checklists/Current/Model Call Refinement.md` (Self-reference)
    *   **Action:** Add a note to this checklist clarifying that `submitStageResponses` is the function that prepares the prompt for the next stage, but `generateContributions` is the function that consumes that prompt and makes the actual AI call. This is a critical context for understanding the end-to-end flow.

#### 7. [API] Update the Frontend API Client

*   `[ ]` 7.a. **Update `ChatApiRequest` Interface in types package:**
    *   **File:** `packages/types/src/api.types.ts` (or equivalent central type definition file)
    *   **Action:** Add the optional `continue_until_complete?: boolean` property to the `ChatApiRequest` interface so that it's available across the frontend packages.
*   `[ ]` 7.b. **Pass Parameter in `sendChatMessage` Implementation:**
    *   **File:** `packages/api/src/ai.api.ts`
    *   **Action:** The `sendChatMessage` function already accepts a `ChatApiRequest` object. No signature change is needed, but we must ensure the `continue_until_complete` flag, when present in the data object, is correctly passed in the body of the `POST` request to `/chat`.

#### 8. [STORE] Integrate State Management

*   `[ ]` 8.a. **Update `AiState` Interface:**
    *   **File:** `packages/store/src/aiStore.ts`
    *   **Action:** Add a new state property `continueUntilComplete: boolean` to the `AiState` interface.
    *   **Action:** Update the `initialAiStateValues` object to include `continueUntilComplete: false` as the default value.
*   `[ ]` 8.b. **Create New Action/Reducer:**
    *   **File:** `packages/store/src/aiStore.ts`
    *   **Action:** Add a `setContinueUntilComplete(shouldContinue: boolean)` action to the `AiStore`. This will be a simple setter: `set({ continueUntilComplete: shouldContinue })`.
*   `[ ]` 8.c. **Update `handleSendMessage` Logic:**
    *   **File:** `packages/store/src/ai.SendMessage.ts`
    *   **Action:** In the `handleSendMessage` function, read the `continueUntilComplete` value from the store's state using `aiStateService.getAiState()`.
    *   **Action:** In the `coreMessageProcessing` function, when constructing the `apiRequest` object, pass the `continue_until_complete` flag from the state.

#### 9. [UI] Integrate the Reusable Toggle Component

*   `[ ]` 9.a. **Integrate into Standard Chat Input:**
    *   **File:** `apps/web/src/components/ai/ChatInput.tsx`
    *   **Action:** Import and place the `<ContinueUntilCompleteToggle />` component within the main `div` of the chat input, likely alongside the `MessageSelectionControls`.
*   `[ ]` 9.b. **Integrate into Dialectic Service UI:**
    *   **File:** `apps/web/src/components/dialectic/SessionInfoCard.tsx`
    *   **Action:** Import and place the `<ContinueUntilCompleteToggle />` component near the `<GenerateContributionButton />`. This gives the user a clear option to enable full responses before starting a dialectic generation.
*   `[ ]` 9.c. **Update Dialectic `generateContributions` call:**
    *   **File:** `apps/web/src/components/dialectic/GenerateContributionButton.tsx`
    *   **Action:** The `generateContributions` store action does not need to be changed here, as the flag will be read from the store. However, the `callUnifiedAIModel` in the backend (`dialectic-service`) *should be updated* to check for this flag if it is passed. **Decision:** For the dialectic service, we will force `continue_until_complete: true` on the backend for now to ensure its core logic always gets full responses. The UI toggle will primarily affect the standard user-facing chat. This simplifies the initial implementation.

### Phase 3: Finalization and Deployment
#### 10. [TEST-E2E] [DOCS] [COMMIT] [DEPLOY] Finalization
*   `[ ]` 10.a. **Create End-to-End Test:**
    *   `[TEST-E2E]` **Action:** Using a framework like Playwright or Cypress, create a test that:
        1.  Navigates to the chat page.
        2.  Finds and clicks the "Full Response Mode" switch to enable it.
        3.  Sends a message that is known (via mocks) to produce a multi-part response.
        4.  Verifies that the final message displayed in the UI is the complete, concatenated message.
*   `[ ]` 10.b. **Run All Tests:**
    *   **Action:** Execute all unit, integration, and E2E tests across all affected packages (`supabase/functions`, `packages/api`, `packages/store`, `apps/web`) to ensure no regressions were introduced.
*   `[ ]` 10.c. **Update All Relevant Documentation:**
    *   `[DOCS]` **Action:** Update API documentation to include the new `continue_until_complete` flag. Update user guides to explain the new "Full Response Mode" feature. Update relevant service READMEs.
*   `[ ]` 10.d. **Git Commit:**
    *   `[COMMIT]` **Action:** Commit the changes with a conventional commit message, e.g., `feat(chat): implement and surface response continuation feature`.
*   `[ ]` 10.e. **Deployment:**
    *   `[DEPLOY]` **Action:** Deploy the new functionality to staging and then production environments after all tests pass and the code has been reviewed and approved.

---

### Phase 4: Dialectic Process Scaling - Antithesis Stage (Stage 2)

This phase addresses the context window limitations inherent in the multi-stage dialectic process. It introduces immediate fixes for Stage 2 (Antithesis) and a long-term, robust solution for Stage 3 (Synthesis) and beyond.

#### 11. [BE] [REFACTOR] Implement Task Isolation for Antithesis Stage (Stage 2)

This addresses the "lumping" problem by breaking down the single large critique task into multiple, focused tasks. Instead of each agent receiving all theses at once, each agent will critique each thesis individually.

*   `[ ]` 11.a. **Refactor `generateContributions` for Antithesis:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** When `stageSlug` is "antithesis", modify the function to iterate through each received Thesis document. For each Thesis, make a separate, individual call to `deps.callUnifiedAIModel`.
    *   **Prompt Engineering:** The prompt for each call should be focused, containing only the content of the single Thesis to be critiqued and its associated user feedback.
    *   **Flow Change:** This will change the execution flow from `n` large parallel calls to `n * m` smaller, focused parallel calls (where `n` is the number of models and `m` is the number of theses from the previous stage).
*   `[ ]` 11.b. **Update Result Aggregation:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Ensure the results from all `n * m` calls are correctly collected and structured before being returned. The final output structure must remain consistent with the downstream expectations. Each resulting Antithesis document should be clearly associated with the Thesis it critiques.
*   `[ ]` 11.c. **Add Focused Unit Tests:**
    *   `[TEST-UNIT]` **File:** `supabase/functions/dialectic-service/generateContribution.test.ts`
    *   **Action:** Create new unit tests that specifically verify the `n * m` call logic. Mocks should assert that `callUnifiedAIModel` is called the correct number of times and that each call is constructed with the correct, isolated context (one thesis per call).

### Phase 5: Dialectic Process Scaling - Synthesis Stage (Stage 3)

This phase implements a two-part solution for the massive context explosion in Stage 3. First, we slice the initial synthesis into smaller, independent tasks. Second, we use a full RAG (Retrieval-Augmented Generation) pipeline to intelligently recombine the results into a final, coherent synthesis.

#### 12. [BE] [REFACTOR] Implement Task Isolation for Initial Synthesis (Slicing)

*   `[ ]` 12.a. **Refactor `generateContributions` for Synthesis:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** When `stageSlug` is "synthesis", the function should iterate through each original `Thesis` document and its corresponding set of `Antithesis` documents.
    *   **Prompt Engineering:** For each set, formulate a prompt for `callUnifiedAIModel` that asks the agent to create an initial, "local" synthesis of just that single thesis and its critiques.
    *   **Flow Change:** This results in `n * m` calls, producing `n * m` intermediate "sub-synthesis" documents instead of a few massive, potentially truncated ones.
*   `[ ]` 12.b. **Store Intermediate "Sub-Synthesis" Documents:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** The resulting `n * m` sub-synthesis documents must be saved to storage. Their metadata should clearly link them to the session, the original thesis, and mark them as intermediate artifacts of the Synthesis stage.

#### 13. [BE] [DB] [REFACTOR] Implement RAG for Final Synthesis Recombination

*   `[ ]` 13.a. **Setup the Vector Database:**
    *   `[DB]` **Tool:** Supabase SQL Editor.
    *   `[DB]` **Action:** Enable the `vector` extension if not already enabled (`create extension vector;`).
    *   `[DB]` **Action:** Create a new table, `dialectic_memory`, to store text chunks and their embeddings. It should include columns like `id` (UUID), `session_id` (FK to `dialectic_sessions`), `source_contribution_id` (FK to `dialectic_contributions`), `content` (text), `metadata` (JSONB), and `embedding` (vector(1536)) for OpenAI's `text-embedding-3-small`.
*   `[ ]` 13.b. **Implement the Indexing Service:**
    *   `[BE]` **Recommendation:** Use a library like `langchain-js` (which has Deno support) to simplify text splitting and embedding calls.
    *   `[BE]` **Action:** Create a new service, e.g., in `supabase/functions/_shared/services/indexing_service.ts`. This service will have a function that:
        1.  Accepts a document's text, a `session_id`, and `source_contribution_id`.
        2.  Uses a text splitter (e.g., `RecursiveCharacterTextSplitter`) to break the document into manageable chunks.
        3.  Calls an embedding model API (e.g., OpenAI's `text-embedding-3-small`) for each chunk.
        4.  Saves the chunk's content, metadata, and the resulting embedding vector into the `dialectic_memory` table.
*   `[ ]` 13.c. **Integrate Indexing into the Synthesis Flow:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** After the `n * m` "sub-synthesis" documents are created and saved, trigger the new indexing service asynchronously for each one. This populates the vector store with the knowledge required for recombination.
*   `[ ]` 13.d. **Implement the Retrieval Service:**
    *   `[BE]` **Action:** Create a Supabase RPC function, `match_dialectic_chunks(session_id, query_embedding, match_count)`. This function will take a query embedding and a session ID, and use the `<=>` vector distance operator to find and return the `match_count` most similar document chunks from the `dialectic_memory` table for that specific session.
*   `[ ]` 13.e. **Implement Final Recombination Logic:**
    *   `[BE]` `[REFACTOR]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** This is the final step of the Synthesis stage. For each of the `n` models:
        1.  **Formulate Query:** Create a high-level query like: "Based on the provided context, which contains multiple partial analyses of a topic, create a single, unified, and comprehensive synthesis."
        2.  **Embed Query:** Convert this query string into an embedding using the same model as the indexer.
        3.  **Retrieve Context:** Call the `match_dialectic_chunks` RPC with the query embedding to retrieve the most relevant context chunks from the vector store.
        4.  **Assemble Final Prompt:** Construct a new, compact prompt containing the high-level query and the retrieved chunks as context.
        5.  **Generate Final Synthesis:** Call `deps.callUnifiedAIModel` one last time with this RAG-generated prompt to produce the final, complete Synthesis document for that model.
*   `[ ]` 13.f. **Test the Full RAG Pipeline:**
    *   `[TEST-INT]` **Action:** Create integration tests that verify the entire end-to-end pipeline: a set of sub-synthesis documents are indexed, a query retrieves the correct chunks, a final prompt is assembled as expected, and a final synthesis is generated.