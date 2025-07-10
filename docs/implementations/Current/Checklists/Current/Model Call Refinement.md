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

*   `[✅]` 6.a. **Update `callUnifiedAIModel` Signature in `callModel.ts`:**
    *   **File:** `supabase/functions/dialectic-service/callModel.ts`
    *   **Action:** Modify the `callUnifiedAIModel` function signature to accept the types' new optional boolean parameter: `continueUntilComplete?: boolean`.
*   `[✅]` 6.b. **Pass Flag to `/chat` Invocation:**
    *   **File:** `supabase/functions/dialectic-service/callModel.ts`
    *   **Action:** Inside `callUnifiedAIModel`, when constructing the `chatApiRequest` object, include the `continue_until_complete: continueUntilComplete` property. This will pass the flag to the `/chat` edge function.
*   `[✅]` 6.c. **Update `generateContributions` to Request Continuation:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** In the `generateContributions` function, locate the call to `deps.callUnifiedAIModel` (inside the `modelPromises.map`) and pass the value for the new `continueUntilComplete` parameter that was passed in from the API.
    *   **Rationale:** The Dialectic Service requires full, uninterrupted responses to function correctly, so this is enabled by default in the type, but the user can turn it off, so we need to pass their setting in case they decided they don't want the response to continue until complete.
*   `[✅]` 6.d. **Acknowledge the `submitStageResponses` Workflow:**
    *   `[DOCS]` **File:** `docs/implementations/Current/Checklists/Current/Model Call Refinement.md` (Self-reference)
    *   **Action:** Add a note to this checklist clarifying that `submitStageResponses` is the function that prepares the prompt for the next stage, but `generateContributions` is the function that consumes that prompt and makes the actual AI call. This is a critical context for understanding the end-to-end flow.

#### 7. [API] Update the Frontend API Client

*   `[✅]` 7.a. **Update `ChatApiRequest` Interface in types package:**
    *   **File:** `packages/types/src/api.types.ts` (or equivalent central type definition file)
    *   **Action:** Add the optional `continue_until_complete?: boolean` property to the `ChatApiRequest` interface so that it's available across the frontend packages.
*   `[✅]` 7.b. **Pass Parameter in `sendChatMessage` Implementation:**
    *   **File:** `packages/api/src/ai.api.ts`
    *   **Action:** The `sendChatMessage` function already accepts a `ChatApiRequest` object. No signature change is needed, but we must ensure the `continue_until_complete` flag, when present in the data object, is correctly passed in the body of the `POST` request to `/chat`.

#### 8. [STORE] Integrate State Management

*   `[✅]` 8.a. **Update `AiState` Interface:**
    *   **File:** `packages/store/src/aiStore.ts`
    *   **Action:** Add a new state property `continueUntilComplete: boolean` to the `AiState` interface.
    *   **Action:** Update the `initialAiStateValues` object to include `continueUntilComplete: true` as the default value.
*   `[✅]` 8.b. **Create New Action/Reducer:**
    *   **File:** `packages/store/src/aiStore.ts`
    *   **Action:** Add a `setContinueUntilComplete(shouldContinue: boolean)` action to the `AiStore`. This will be a simple setter: `set({ continueUntilComplete: shouldContinue })`.
*   `[✅]` 8.c. **Update `handleSendMessage` Logic:**
    *   **File:** `packages/store/src/ai.SendMessage.ts`
    *   **Action:** In the `handleSendMessage` function, read the `continueUntilComplete` value from the store's state using `aiStateService.getAiState()`.
    *   **Action:** In the `coreMessageProcessing` function, when constructing the `apiRequest` object, pass the `continue_until_complete` flag from the state.

#### 9. [UI] Integrate the Reusable Toggle Component

*   `[✅]` 9.a. **Integrate into Standard Chat Input:**
    *   **File:** `apps/web/src/components/ai/ChatInput.tsx`
    *   **Action:** Import and place the `<ContinueUntilCompleteToggle />` component within the main `div` of the chat input, likely alongside the `MessageSelectionControls`.
*   `[✅]` 9.b. **Integrate into Dialectic Service UI:**
    *   **File:** `apps/web/src/components/dialectic/SessionInfoCard.tsx`
    *   **Action:** Import and place the `<ContinueUntilCompleteToggle />` component near the `<GenerateContributionButton />`. This gives the user a clear option to enable full responses before starting a dialectic generation.
*   `[✅]` 9.c. **Update Dialectic `generateContributions` call:**
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
*   `[✅]` 10.b. **Run All Tests:**
    *   **Action:** Execute all unit, integration, and E2E tests across all affected packages (`supabase/functions`, `packages/api`, `packages/store`, `apps/web`) to ensure no regressions were introduced.
*   `[ ]` 10.c. **Update All Relevant Documentation:**
    *   `[DOCS]` **Action:** Update API documentation to include the new `continue_until_complete` flag. Update user guides to explain the new "Full Response Mode" feature. Update relevant service READMEs.
*   `[✅]` 10.d. **Git Commit:**
    *   `[COMMIT]` **Action:** Commit the changes with a conventional commit message, e.g., `feat(chat): implement and surface response continuation feature`.
*   `[ ]` 10.e. **Deployment:**
    *   `[DEPLOY]` **Action:** Deploy the new functionality to staging and then production environments after all tests pass and the code has been reviewed and approved.

---

### Phase 4: Dialectic Process Scaling - Antithesis Stage (Stage 2)

This phase addresses the context window limitations inherent in the multi-stage dialectic process. It introduces immediate fixes for Stage 2 (Antithesis) and a long-term, robust solution for Stage 3 (Synthesis) and beyond.

#### 11. [BE] [REFACTOR] Implement Task Isolation for Antithesis Stage (Stage 2)

This addresses the "lumping" problem by breaking down the single large critique task into multiple, focused tasks. Instead of each agent receiving all theses at once, each agent will critique each thesis individually, ensuring a more focused and effective analysis. The number of models (`n`) is variable based on user selection, and the number of theses (`m`) depends on the output of the previous stage.

*   `[ ]` 11.a. **Add Conditional Logic Fork for Antithesis Stage:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Introduce a conditional block `if (stage.slug === 'antithesis')` after fetching the stage details. The new logic will reside within this block, while the existing logic will be moved to an `else` block to handle all other stages.

*   `[ ]` 11.b. **Fetch Thesis Contributions and Content:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Within the `antithesis` block, query the `dialectic_contributions` table to get all contributions where `stage` is 'thesis' for the current `session_id` and `iteration_number`.
    *   **Action:** Iterate through the resulting thesis records and use `deps.downloadFromStorage` to retrieve the content for each one. This will create a collection of `m` thesis documents to be critiqued.

*   `[ ]` 11.c. **Fetch User Feedback for Thesis Stage:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Query the `dialectic_feedback` table to find all feedback associated with the `session_id`, `iteration_number`, and `stage_slug` of 'thesis'.
    *   **Action:** Download the content of all feedback files and concatenate them into a single string to be included in the prompts.

*   `[ ]` 11.d. **Implement `n * m` Call Logic:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** Create a nested loop structure. The outer loop iterates through the `n` selected models, and the inner loop iterates through the `m` thesis documents.
    *   **Prompt Engineering:** For each combination of model and thesis, construct a unique prompt. This prompt will combine the base antithesis prompt template, the content of the single thesis to be critiqued, and all relevant user feedback.
    *   **Execution:** This will result in `n * m` parallel calls to `deps.callUnifiedAIModel`.

*   `[ ]` 11.e. **Update Result Aggregation and Link Contributions:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** When processing the results from the `n * m` calls, ensure that each new "antithesis" contribution saved to the `dialectic_contributions` table has its `target_contribution_id` field set to the `id` of the specific "thesis" it is critiquing. This preserves the crucial link between a critique and its subject.

*   `[ ]` 11.f. **Add Focused Unit and Integration Tests:**
    *   `[TEST-UNIT]` **File:** `supabase/functions/dialectic-service/generateContribution.test.ts`
    *   **Action:** Create new tests specifically for the "antithesis" logic path.
    *   **Mocks:** Mock database calls to return sample thesis contributions and user feedback. Mock `downloadFromStorage` to provide content.
    *   **Assertions:** Verify that `callUnifiedAIModel` is called `n * m` times, each with a correctly constructed prompt containing only one thesis. Assert that the `target_contribution_id` is correctly set on the saved antithesis contributions.

### Phase 5: Dialectic Process Scaling - Synthesis Stage (Stage 3)

This phase implements a sophisticated, multi-step reduction strategy to manage the massive context explosion in the Synthesis stage. It prioritizes preserving data integrity by using precise, iterative API calls for as long as possible, resorting to a Retrieval-Augmented Generation (RAG) pipeline only for the final, cross-agent combination where context size makes direct calls impossible.

#### 12. [BE] [REFACTOR] Synthesis Step 1: Pairwise Combination (Slicing)

*   `[ ]` 12.a. **Refactor `generateContributions` for Synthesis - Step 1:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** When `stageSlug` is "synthesis", the function must first fetch all `m` Thesis documents and all `m * n` Antithesis documents from the previous stages.
    *   **Action:** It will then group them by the original Thesis. For each Thesis and its associated set of Antitheses, it will perform a nested loop: iterate through each of the `n` Antitheses for a given Thesis, then through each of the `n` selected models.
    *   **Prompt Engineering:** For each Thesis-Antithesis pair, formulate a prompt for `callUnifiedAIModel`. The prompt should ask the model to create an initial synthesis of that single thesis and its corresponding single critique.
    *   **Flow Change:** This results in `m * n * n` calls, producing `m * n * n` intermediate "pairwise-synthesis" documents.
*   `[ ]` 12.b. **Store Intermediate "Pairwise-Synthesis" Documents:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** The resulting `m * n * n` documents must be saved to storage. Their metadata must link them to the session, the original Thesis they derive from, and mark them as "synthesis_step1" intermediate artifacts.

#### 13. [BE] [REFACTOR] Synthesis Step 2: Per-Thesis Reduction

*   `[ ]` 13.a. **Refactor `generateContributions` for Synthesis - Step 2:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** After Step 1 is complete, group the `m * n * n` "pairwise-synthesis" documents by their source Thesis. This will create `m` groups, each containing `n * n` documents.
    *   **Action:** For each of the `m` groups, iterate through the `n` selected models.
    *   **Prompt Engineering:** Combine the `n * n` documents in each group into a single prompt. If this combination exceeds the model's context window, the documents must be intelligently chunked or summarized before being sent.
    *   **Flow Change:** This step makes `m * n` calls, reducing the `m * n * n` documents down to `m * n` more refined "per-thesis-synthesis" documents.
*   `[ ]` 13.b. **Store Intermediate "Per-Thesis-Synthesis" Documents:**
    *   **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** The resulting `m * n` documents must be saved to storage, linked to the session, and marked as "synthesis_step2" intermediate artifacts.

#### 14. [BE] [DB] [REFACTOR] Synthesis Step 3: Final Cross-Agent RAG Recombination

*   `[ ]` 14.a. **Setup the Vector Database:**
    *   `[DB]` **Action:** Create a `dialectic_memory` table to store text chunks and their embeddings. It needs columns for `id`, `session_id`, `source_contribution_id`, `content`, `metadata` (JSONB), and `embedding` (vector).
*   `[ ]` 14.b. **Implement the Indexing Service:**
    *   `[BE]` **Action:** Create a new `indexing_service.ts`. This service will take a document, split it into chunks, call an embedding model API (e.g., OpenAI), and save the content and vector into the `dialectic_memory` table.
*   `[ ]` 14.c. **Integrate Indexing into the Synthesis Flow:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** After the `m * n` "per-thesis-synthesis" documents are created in Step 2, trigger the new indexing service asynchronously for each one. This populates the vector store with the knowledge required for the final recombination.
*   `[ ]` 14.d. **Implement the Retrieval Service:**
    *   `[BE]` **Action:** Create a Supabase RPC function, `match_dialectic_chunks(session_id, query_embedding, match_count)`, that uses the vector distance operator (`<=>`) to find and return the most similar document chunks for a given session.
*   `[ ]` 14.e. **Implement Final Recombination Logic:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   **Action:** This is the final step. For each of the `n` models:
        1.  **Formulate Query:** Create a high-level query like: "Based on the provided context, create a single, unified, and comprehensive synthesis."
        2.  **Embed & Retrieve:** Embed the query and call the `match_dialectic_chunks` RPC to get the most relevant context chunks.
        3.  **Assemble & Generate:** Construct a final prompt with the query and the retrieved chunks, and call `deps.callUnifiedAIModel` one last time to produce the final Synthesis document for that model.
*   `[ ]` 14.f. **Test the Full RAG Pipeline:**
    *   `[TEST-INT]` **Action:** Create integration tests that verify the entire end-to-end RAG pipeline, from indexing to retrieval to final generation.

### Phase 6: Real-time Progress Updates via Notification Service

This phase implements real-time progress reporting by leveraging the existing notification service. The backend will dispatch progress updates as a specific type of notification, which the frontend will intercept to update the UI without creating a visible notification for the user.

#### 15. [BE] Instrument `generateContributions` to Send Progress Notifications

*   `[ ]` 15.a. **Calculate Total Steps for Progress Tracking:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   `[BE]` **Action:** At the beginning of the `synthesis` logic block, calculate the total number of expected AI calls and other major steps to get a `total_steps` value.
*   `[ ]` 15.b. **Dispatch Progress Updates via RPC:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   `[BE]` **Action:** Throughout the multi-step synthesis process, call the existing `create_notification_for_user` RPC function at key milestones (e.g., after each reduction step, or even within loops for more granularity).
    *   `[BE]` **Action:** Use a new, dedicated `notification_type`: `'dialectic_progress_update'`.
    *   `[BE]` **Action:** The `notification_data` payload for this type should be structured to include all necessary information for the UI: `{ "sessionId": "...", "stageSlug": "synthesis", "current_step": 5, "total_steps": 27, "message": "Reducing per-thesis results..." }`.

#### 16. [STORE] [UI] Handle Progress Notifications on the Frontend

*   `[ ]` 16.a. **Update Central Notification Listener:**
    *   `[UI]` **File:** The central frontend service that listens for and processes incoming real-time notifications.
    *   `[UI]` **Action:** Add a new `case` or `if` condition to the listener's logic to specifically handle the `'dialectic_progress_update'` type.
*   `[ ]` 16.b. **Update State Without Creating a Visible Notification:**
    *   `[STORE]` **Action:** When a `'dialectic_progress_update'` notification is received, the handler should **not** trigger a standard UI notification toast. Instead, it should parse the `notification_data` payload.
    *   `[STORE]` **Action:** It will then call a new action in the dialectic state store (e.g., `setSessionProgress(payload)`), passing the progress data. The store will update the state for the specific session identified by `payload.sessionId`.

#### 17. [UI] Create and Display the Dynamic Progress Bar

*   `[ ]` 17.a. **Create a `DynamicProgressBar` Component:**
    *   `[UI]` **File:** `apps/web/src/components/common/DynamicProgressBar.tsx`.
    *   `[UI]` **Action:** Create a reusable component that takes props like `value` (for the percentage) and `message` (to display the current status).
*   `[ ]` 17.b. **Integrate into the Session UI:**
    *   `[UI]` **File:** `apps/web/src/components/dialectic/SessionInfoCard.tsx` (or the relevant component).
    *   `[UI]` **Action:** The component will subscribe to the dialectic store. When the store indicates a long-running process has started, it will conditionally render the `<DynamicProgressBar />`.
    *   `[UI]` **Action:** The progress bar's props (`value` and `message`) will be driven by the `sessionProgress` state, which is being updated in real-time by the notification listener.

### Phase 7: Default Granular Contribution Loading

This phase refactors the core contribution generation logic to make real-time, individual contribution loading the **default behavior for all dialectic stages**. Instead of waiting for all models to complete their work, the UI will now render each contribution card as soon as it becomes available. This creates a more dynamic and responsive user experience across the entire application and works in concert with stage-specific UI elements like the Synthesis progress bar.

#### 18. [BE] [REFACTOR] Dispatch Individual Contribution Notifications from All Generation Loops

*   `[ ]` 18.a. **Instrument All Contribution Loops:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   `[BE]` **Action:** In every loop that processes and saves a model's output—including the default loop and the specialized loops for `antithesis` and `synthesis`—locate the point where a single contribution is successfully saved by the `FileManagerService`.
    *   `[BE]` **Action:** Immediately after that successful save, add a call to the `create_notification_for_user` RPC.

*   `[ ]` 18.b. **Define "Contribution Received" Notification Type:**
    *   `[BE]` **Action:** This notification must use a new, dedicated `notification_type`: `'dialectic_contribution_received'`.
    *   `[BE]` **Action:** The `notification_data` payload must contain the full data record of the newly created contribution. This gives the frontend all the information it needs to render the card instantly.

#### 19. [STORE] [UI] Handle Individual Contribution Notifications on the Frontend

*   `[ ]` 19.a. **Update Central Notification Listener:**
    *   `[UI]` **File:** The central frontend service that listens for and processes all real-time notifications.
    *   `[UI]` **Action:** Add logic to specifically handle the `'dialectic_contribution_received'` type.

*   `[ ]` 19.b. **Update Dialectic State Store:**
    *   `[STORE]` **Action:** The handler for this notification type should call an idempotent action in the dialectic state store, such as `addOrUpdateContribution(contributionData)`.
    *   `[STORE]` **Action:** This action will add the new contribution to the list for the relevant session, triggering a reactive UI update.

#### 20. [UI] Ensure Reactive UI for Contribution Display

*   `[ ]` 20.a. **Verify Reactivity of Contribution Display:**
    *   `[UI]` **File:** The component responsible for displaying the list of contributions (e.g., `SessionContributionsDisplayCard.tsx`).
    *   `[UI]` **Action:** Confirm that this component correctly subscribes to the list of contributions in the store, ensuring it automatically renders a new contribution card whenever the store's state is updated.

#### 21. [BE] [REFACTOR] Clarify the Role of the Final "Stage Complete" Notification

*   `[ ]` 21.a. **Review "Stage Complete" Notification's Purpose:**
    *   `[BE]` **File:** `supabase/functions/dialectic-service/generateContribution.ts`
    *   `[BE]` **Action:** The final `contribution_generation_complete` notification sent after all promises are settled remains essential. Its purpose is to signal the end of the entire stage. The UI should use this event to finalize the state, such as by hiding progress indicators and updating the overall session status from "generating" to "complete."