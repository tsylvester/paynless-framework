### 1.6 Basic GitHub Integration (Backend & API)
*   `[ ] 1.6.1 [CONFIG]` Add new environment variables if needed for GitHub App/PAT specifically for Dialectic outputs, or confirm existing ones are sufficient and securely stored (e.g., in Supabase Vault).
*   `[ ] 1.6.2 [BE]` `dialectic-service` Action: `configureGitHubRepo`
    *   `[ ] 1.6.2.1 [TEST-INT]` Write tests (input: `projectId`, `githubRepoUrl`; auth; output: success/failure; updates `dialectic_projects.repo_url`). (RED)
    *   `[ ] 1.6.2.2` Implement logic:
        *   Validates `githubRepoUrl` format.
        *   Updates `dialectic_projects` table.
        *   (Optional: Test connectivity to the repo if a PAT/App has rights).
    *   `[ ] 1.6.2.3` (GREEN)
    *   `[ ] 1.6.2.4 [TEST-INT]` Run tests.
*   `[ ] 1.6.3 [BE]` Helper utility for GitHub file operations (within `dialectic-service` or shared): `commitFileToGitHub(repoUrl, filePath, fileContent, commitMessage, userGitHubTokenOrAppAuthCredentials)`.
    *   `[ ] 1.6.3.1 [TEST-UNIT]` Write tests (mocks GitHub API calls). (RED)
    *   `[ ] 1.6.3.2` Implement using GitHub REST API (e.g., via Octokit or a lightweight client). Handles creating/updating files.
        *   File path structure for Phase 1 (simplified, iteration 1 assumed, base output directory is configurable, e.g., `ai_dialectic_sessions`):
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/project_readme.md` (Created once, if not existing)
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/Implementation/` (User-managed, ensure directory can be created if not present)
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/Complete/` (User-managed, ensure directory can be created if not present)
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/0_seed_inputs/user_prompt_for_iteration.md`
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/0_seed_inputs/system_settings.json` (Containing models, selected debate structure, prompt template IDs used)
            *   **Hypothesis (Thesis) Outputs:**
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/1_hypothesis/{model_name_slug}_hypothesis.md`
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/1_hypothesis/user_feedback_hypothesis.md` (If user provides feedback at this stage)
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/1_hypothesis/documents/{model_name_slug}_prd_hypothesis.md` (Optional refined documents)
            *   **Antithesis Outputs:**
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/2_antithesis/{critiquer_model_slug}_critique_on_{original_model_slug}.md`
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_1/2_antithesis/user_feedback_antithesis.md`
        *   `project_name_slug` and `model_name_slug` should be filesystem-friendly (e.g., lowercase, underscores instead of spaces).
        *   The `dialectic_outputs_base_dir_name` should be configurable, defaulting to something like `ai_dialectic_sessions`.
        *   The `Implementation/` and `Complete/` folders are primarily for user organization but their paths should be known if the AI needs to reference or suggest locations.
        *   Ensure a defined Markdown template structure is used for `fileContent` (e.g., YAML frontmatter for `modelName`, `promptId`, `timestamp`, `stage`, `version`; followed by H1 for original prompt, then AI response content).
        *   Credentials (`userGitHubTokenOrAppAuthCredentials`) should be retrieved securely by the calling service action (e.g., from Supabase Vault) and not passed directly by clients.
    *   `[ ] 1.6.3.3` (GREEN)
    *   `[ ] 1.6.3.4 [TEST-UNIT]` Run tests.
*   `[ ] 1.6.4 [BE]` Modify `generateContributions` actions in `dialectic-service` to use the `stage` and `domain` selected by the user:
    *   `[ ] 1.6.4.1` After successfully saving a contribution to the DB:
        *   Fetch `repo_url` for the project.
        *   If URL exists:
            *   Format contribution content as Markdown **using the defined template structure**.
            *   Determine file path and commit message.
            *   Retrieve necessary GitHub credentials securely.
            *   Call `commitFileToGitHub` helper with the formatted content, path, message, and credentials.
            *   Log success/failure of GitHub commit (do not fail the whole process if GitHub commit fails, but log it).
*   `[ ] 1.6.5 [API]` Add `configureGitHubRepo` to `DialecticAPIInterface` and implement in adapter, calling the `dialectic-service` action.
    *   `[ ] 1.6.5.1` Define types, add to interface.
    *   `[ ] 1.6.5.2 [TEST-UNIT]` Write adapter method tests. (RED)
    *   `[ ] 1.6.5.3` Implement adapter method. (GREEN)
    *   `[ ] 1.6.5.4 [TEST-UNIT]` Run tests.
*   `[ ] 1.6.6 [STORE]` Add thunk/action for `configureGitHubRepo` to `dialecticSlice`.
    *   `[ ] 1.6.6.1 [TEST-UNIT]` Write store tests. (RED)
    *   `[ ] 1.6.6.2` Implement thunk. (GREEN)
    *   `[ ] 1.6.6.3 [TEST-UNIT]` Run tests.
*   `[ ] 1.6.7 [UI]` Add UI element in `DialecticProjectDetailsPage` to configure GitHub repo URL.
    *   `[ ] 1.6.7.1 [TEST-UNIT]` Write UI tests for form input and submit. (RED)
    *   `[ ] 1.6.7.2` Implement UI (input field for repo URL, save button dispatching `configureGitHubRepo` thunk). (GREEN)
    *   `[ ] 1.6.7.3 [TEST-UNIT]` Run tests.
*   `[ ] 1.6.8 [COMMIT]` feat: basic GitHub integration for dialectic outputs

### 1.7 Finalizing Phase 1
*   `[ ] 1.7.1 [TEST-E2E]` Write basic End-to-End tests for Phase 1 core workflow:
    *   `[ ] 1.7.1.1` User creates a project.
    *   `[ ] 1.7.1.2` User starts a session with 2-3 models.
    *   `[ ] 1.7.1.3` User views Thesis contributions from each model.
    *   `[ ] 1.7.1.4` User views Antithesis contributions (critiques).
    *   `[ ] 1.7.1.5` (Optional E2E): User configures GitHub repo and verifies files are created (requires more complex test setup).
*   `[ ] 1.7.2 [DOCS]` Update main README and any relevant package READMEs for new Dialectic Engine features.
*   `[ ] 1.7.3 [DOCS]` Create initial user-facing documentation on how to use the Phase 1 Dialectic features.
*   `[ ] 1.7.4 [REFACTOR]` Perform a general review and refactor of all Phase 1 code.
*   `[ ] 1.7.5 [COMMIT]` feat: complete Phase 1 of AI Dialectic Engine
*   `[ ] 1.7.6 [DEPLOY]` Phase 1 deployment checkpoint. Review deployment readiness.

---
**Checkpoint Reminder for User:** After completing these steps for Section 1 / Phase 1:
1.  Run all tests: `npm test` (or specific test scripts for packages). Ensure they are integrated into CI/CD.
2.  Build all relevant packages and applications: `npm run build` (or equivalent).
3.  Restart development servers and manually verify the functionality in `apps/web`.
4.  Consider committing the work: `git commit -m "feat: AI Dialectic Engine Phase 1 complete"`
5.  If ready, proceed with Phase 1 deployment.
---

*   [ ] Add `<ChatContextSelector/>` and `<WalletSelector>` to `SessionInfoCard.tsx`
*   [ ] Pass chatContextId and walletId through store, API, and edge so that callModel passes them into chat
*   [ ] Ensure that the correct values are used for dialectics so that the correct org owns the chat and the correct wallet is debited
*   [ ] Add a means for orgs to buy tokens
*   [ ] Add a setting for orgs to enable/disable dialectics 
*   [ ] Remove all update state hooks and consent state logic from the Chat page, move it into the WalletSelector so the selector is independent
*   [ ] Change consent from in-page spawned div to a modal 

---

### 2.X.5 UI Integration for Dialectic Tokenomics & Wallet Management

**Objective:** To provide users with full visibility and control over token consumption within the Dialectic service by deeply integrating existing, robust tokenomics UI components and backend capabilities. This involves displaying pre-submission cost estimates, post-submission actuals for AI contributions, allowing users to select a token wallet for operations using the established `WalletSelector.tsx`, and showing current wallet balances and affordability leveraging components like `ChatAffordabilityIndicator.tsx` and `TokenUsageDisplay.tsx`.

**Core Principle:** Maximize reuse of components from `apps/web/src/components/ai/` and ensure backend processes correctly populate existing database fields to feed data into these established UI patterns.

**Prerequisite:** `generateContributions.ts` and `FileManagerService` must be correctly populating the existing tokenomics and model identifier fields in the `dialectic_contributions` table.

*   `[ ] 2.X.5.1 [BE]` **Ensure `generateContributions` & `FileManagerService` Populate Existing Tokenomics Fields**
    *   `[✅] 2.X.5.1.1 [BE/TYPES]` **Verify and Align `UploadContext`:**
        *   In `supabase/functions/_shared/types/file_manager.types.ts`, ensure `UploadContext` (or its `customMetadata`) is structured to carry:
            *   `modelIdUsed: string` (corresponding to `dialectic_contributions.model_id` which is FK to `ai_providers.id`)
            *   `tokensUsedInput: number`
            *   `tokensUsedOutput: number`
            *   `processingTimeMs: number`
            *   `promptTemplateIdUsed?: string` (for `dialectic_contributions.prompt_template_id_used`)
            *   `seedPromptUrl?: string` (for `dialectic_contributions.seed_prompt_url`)
            *   `rawResponseStoragePath?: string` (for `dialectic_contributions.raw_response_storage_path`)
            *   `citations?: Json` (for `dialectic_contributions.citations`)
            *   `error?: string` (for `dialectic_contributions.error`)
            *   `contributionType?: string` (for `dialectic_contributions.contribution_type`)
    *   `[🚧] 2.X.5.1.2 [BE]` **Enhance `FileManagerService.uploadAndRegisterFile`:**
        *   In `supabase/functions/_shared/services/file_manager.ts`, when `targetTable` is `dialectic_contributions`, ensure the `recordData` object correctly maps all relevant fields from the updated `UploadContext` (from `2.X.5.1.1`) to their corresponding columns in the `dialectic_contributions` table as defined in `supabase/functions/types_db.ts`. This includes `model_id`, `tokens_used_input`, `tokens_used_output`, `processing_time_ms`, `prompt_template_id_used`, `raw_response_storage_path`, `seed_prompt_url`, etc.
    *   `[✅] 2.X.5.1.3 [BE]` **Refactor `generateContributions.ts` Data Handling:**
        *   In `supabase/functions/dialectic-service/generateContributions.ts`:
            *   When a response is received from `callUnifiedAIModel` (which returns `UnifiedAIResponse`), correctly extract `inputTokens`, `outputTokens` (or parse from `tokenUsage` object), `processingTimeMs`.
            *   Also capture the actual `model_id` used for the call (from `providerDetails.id` or similar context available during the model iteration).
            *   Capture other relevant metadata like `rawProviderResponse` (to determine `raw_response_storage_path` if applicable, or to store inline if schema allows and preferred), `prompt_template_id_used`, `seed_prompt_url`.
            *   Populate the updated `UploadContext` with these values and pass it to `fileManager.uploadAndRegisterFile`.
    *   `[✅] 2.X.5.1.4 [TEST-INT]` Update/Create integration tests for `generateContributions.ts`. These tests must:
        *   Mock `callUnifiedAIModel` to return realistic `UnifiedAIResponse` data, including token counts and processing times.
        *   Assert that `FileManagerService.uploadAndRegisterFile` is called with an `UploadContext` containing the correct tokenomics data and other metadata.
        *   Mock `FileManagerService.uploadAndRegisterFile` to simulate a successful database insert and verify that the `generateContributions` function correctly processes this success.
        *   Specifically test that the `DB_INSERT_FAIL` errors (seen in logs) are resolved by providing all necessary data.

*   `[✅] 2.X.5.2 [API/STORE]` **Propagate Tokenomics Data & Wallet State for Dialectic Service**
    *   `[✅] 2.X.5.2.1 [TYPES]` In `packages/types/src/dialectic.types.ts`:
        *   Align the `DialecticContribution` type with the fields now confirmed to be in the database and populated by the backend. Ensure it includes:
            *   `tokens_used_input: number | null`
            *   `tokens_used_output: number | null`
            *   `processing_time_ms: number | null`
            *   `model_id: string | null` (actual ID of the AI provider/model used)
            *   Other fields like `raw_response_storage_path`, `seed_prompt_url`, `citations` as they are made available.
    *   `[✅] 2.X.5.2.2 [STORE]` In `packages/store/src/dialecticStore.ts`:
        *   Ensure `fetchDialecticProjectDetails` thunk correctly processes and stores this enhanced `DialecticContribution` data (including tokenomics) within `currentProjectDetail.sessions.contributions`.
        *   Adapt or reuse existing wallet state management. Add `activeDialecticWalletId: string | null` to `DialecticState` (in `packages/store/src/interfaces/dialectic.ts`) if a distinct active wallet for Dialectic operations is desired. Create actions to set/update it.
    *   `[✅] 2.X.5.2.3 [STORE]` Create/update selectors in `packages/store/src/dialecticStore.selectors.ts`:
        *   `[✅] selectDialecticContributionTokenDetails(contributionId: string): { tokensUsedInput: number | null, tokensUsedOutput: number | null, processingTimeMs: number | null, modelId: string | null } | null` // Data accessible via selectContributionById
        *   `[✅] selectActiveDialecticStageTotalTokenUsage(sessionId: string, stageSlug: string, iterationNumber: number): { totalInput: number, totalOutput: number, totalProcessingMs: number } | null`
        *   `[✅] selectDialecticSessionTotalTokenUsage(sessionId: string): { totalInput: number, totalOutput: number, totalProcessingMs: number } | null`
        *   `[✅] selectActiveDialecticWalletId(): string | null`
    *   `[✅] 2.X.5.2.4 [BE]` Modify backend actions in `dialectic-service` (e.g., `generateContributions`) to accept an optional `walletId` in their payload. This `walletId` will be used by the `TokenWalletService`. Fallback to user's default wallet if not provided.

*   `[ ] 2.X.5.3 [UI]` **Integrate Existing `WalletSelector.tsx` and Balance Display**
    *   `[ ] 2.X.5.3.1 [TEST-UNIT]` Update/create unit tests for `SessionInfoCard.tsx` or relevant parent components to cover wallet selection and balance display integration. (RED)
    *   `[ ] 2.X.5.3.2 [UI]` In `apps/web/src/components/dialectic/SessionInfoCard.tsx` (or a suitable layout component):
        *   Integrate `apps/web/src/components/ai/WalletSelector.tsx`.
        *   Connect it to update `activeDialecticWalletId` in the store.
        *   Display the selected wallet's balance using existing mechanisms.
    *   `[ ] 2.X.5.3.3 [UI]` Ensure UI elements triggering AI processing pass the `activeDialecticWalletId` to the backend if required.
    *   `[ ] 2.X.5.3.4 [TEST-UNIT]` Run UI tests. (GREEN)

*   `[ ] 2.X.5.4 [UI]` **Implement Pre-Submission Token Cost Estimates Using Existing Estimators**
    *   `[ ] 2.X.5.4.1 [TEST-UNIT]` Update/create unit tests for pre-submission estimate displays. (RED)
    *   `[ ] 2.X.5.4.2 [BE]` Develop backend function `estimateDialecticStageCost` in `dialectic-service`.
        *   Input: `projectId`, `sessionId`, `stageSlug`, `iterationNumber`, `modelIds`, `walletId`.
        *   Output: `EstimatedTokenUsage { perModel: Array<{modelId: string, estimatedTokens: number}>, totalEstimatedTokens: number }`.
        *   Logic: Construct the potential seed prompt(s) and use a token counting utility (e.g., from `supabase/functions/_shared/` or similar to `countTokensForMessages` from chat service logs).
    *   `[ ] 2.X.5.4.3 [API/STORE]` Add API client method and store thunk for `estimateDialecticStageCost`. Store estimate in `DialecticState`.
    *   `[ ] 2.X.5.4.4 [UI]` In `apps/web/src/components/dialectic/StageTabCard.tsx`:
        *   Trigger `estimateDialecticStageCost` thunk upon model selection.
        *   Display estimate using `apps/web/src/components/ai/CurrentMessageTokenEstimator.tsx` or `ChatTokenUsageDisplay.tsx`.
        *   Integrate `apps/web/src/components/ai/ChatAffordabilityIndicator.tsx` using the estimate and selected wallet balance.
    *   `[ ] 2.X.5.4.5 [TEST-UNIT]` Run UI tests. (GREEN)

*   `[ ] 2.X.5.5 [UI]` **Display Post-Submission Actual Token Costs Using Existing `TokenUsageDisplay.tsx`**
    *   `[ ] 2.X.5.5.1 [TEST-UNIT]` Update/create unit tests for displaying actual token costs. (RED)
    *   `[ ] 2.X.5.5.2 [UI]` In `apps/web/src/components/dialectic/cards/SessionContributionsDisplayCard.tsx` (or component rendering individual contributions):
        *   Use `selectDialecticContributionTokenDetails` selector.
        *   Integrate `apps/web/src/components/ai/TokenUsageDisplay.tsx` to show `tokensUsedInput`, `tokensUsedOutput` for each contribution. Display `model_id` or resolved model name.
    *   `[ ] 2.X.5.5.3 [UI]` In a summary area (e.g., `StageTabCard.tsx` or `SessionInfoCard.tsx`):
        *   Use `selectActiveDialecticStageTotalTokenUsage` and `selectDialecticSessionTotalTokenUsage` selectors.
        *   Display aggregate costs, potentially adapting `apps/web/src/components/ai/ChatTokenUsageDisplay.tsx`.
    *   `[ ] 2.X.5.5.4 [TEST-UNIT]` Run UI tests. (GREEN)

*   `[ ] 2.X.5.6 [REFACTOR]` Conduct a thorough review of all integrated tokenomics UI components and related state management within the Dialectic feature. Ensure consistency and accuracy.
*   `[ ] 2.X.5.7 [COMMIT]` feat(dialectic): integrate tokenomics display, cost estimation, and wallet management into Dialectic UI using existing AI components


## Section 2: Phase 2 - Structured Collaboration & Synthesis (Adding Synthesis Stage & Basic Human-in-the-Loop)

**Phase 2 Value:** Implement the full initial dialectic cycle (Thesis -> Antithesis -> Synthesis). Introduce basic Human-in-the-Loop (HitL) capabilities, allowing users to guide the synthesis process. Enhance GitHub integration and expand prompt template library.

**Phase 2 Objectives:**
1.  Extend database schema and backend logic to support the Synthesis stage.
2.  Implement backend orchestration for models to generate Synthesis contributions based on Thesis and Antithesis.
3.  Introduce database schema and backend logic for basic HitL (e.g., user ratings/selections on critiques or thesis points).
4.  Update API and Store to manage Synthesis data and HitL inputs.
5.  Enhance UI to display Synthesis outputs and allow user interaction for HitL.
6.  Expand GitHub integration for Synthesis stage outputs, following the established Markdown template structure and file organization.
7.  Grow the system prompts library, including templates for non-developer roles.
8.  Improve UI/UX for clearly indicating different dialectic stages, including specific visualization components for stage progression.

**Estimated Duration (as per PRD):** 3-4 months

**Starting Point:** Completion of all items in Section 1 (Phase 1). All foundational elements for Thesis and Antithesis are in place.

**Deliverables for Phase 2:**
*   Functional Synthesis stage in the dialectic workflow.
*   Ability for users to provide basic feedback (e.g., rating critiques) to influence synthesis.
*   Synthesis outputs saved to GitHub using the defined Markdown template and file structure (`.../3_synthesis/{model_name_slug}_synthesis.md`).
*   Expanded prompt template library accessible to users.
*   Clearer visual distinction of stages in the UI, including a basic stage progression indicator.

---

### Section 2.A: Architectural & State Flow Refinement for Domains and Processes

**Objective:** To refactor the core architecture to establish a flexible many-to-many relationship between domains and processes, ensuring that projects are correctly initialized with a default process and that the frontend state correctly reflects this configuration. This will fix the issue where the `StartDialecticSessionModal` does not display the correct, pre-selected domain and process for the active project.

---

*   `[✅] 2.A.1 [DB]` **Phase 1: Refactor Database Schema for Domain-to-Process Flexibility**
    *   `[✅] 2.A.1.1 [DB]` **Decouple Processes from Domains:** Alter the `dialectic_process_templates` table to make processes domain-agnostic.
        *   `[✅] 2.A.1.1.2 [DB]` Create a new Supabase migration script to `ALTER TABLE dialectic_process_templates DROP COLUMN domain_id;`. (GREEN)
        *   `[✅] 2.A.1.1.3 [TEST-UNIT]` Run the migration and the corresponding test to confirm.
    *   `[✅] 2.A.1.2 [DB]` **Create Domain-Process Linking Table:** Introduce a new table to manage the many-to-many relationship.
        *   `[✅] 2.A.1.2.2 [DB]` Create a new Supabase migration script to create the `domain_process_associations` table with the following columns:
            *   `id` (UUID, Primary Key)
            *   `domain_id` (UUID, NOT NULL, FK to `dialectic_domains.id` ON DELETE CASCADE)
            *   `process_template_id` (UUID, NOT NULL, FK to `dialectic_process_templates.id` ON DELETE CASCADE)
            *   `is_default_for_domain` (BOOLEAN, NOT NULL, default `false`)
        *   `[✅] 2.A.1.2.3 [DB]` In the same migration script, add a UNIQUE INDEX to enforce that a domain can only have one default process. The index should be on `domain_id` but only for rows where `is_default_for_domain` is `true`.
            *   SQL Example: `CREATE UNIQUE INDEX one_default_process_per_domain_idx ON domain_process_associations (domain_id) WHERE (is_default_for_domain = true);`
        *   `[✅] 2.A.1.2.4 [TEST-UNIT]` Run the migration and the corresponding test to confirm. (GREEN)
    *   `[✅] 2.A.1.3 [RLS]` **Define RLS for `domain_process_associations`:**
        *   `[✅] 2.A.1.3.2 [RLS]` Implement the RLS policy (e.g., `CREATE POLICY "Allow authenticated read access" ON domain_process_associations FOR SELECT TO authenticated USING (true);`). (GREEN)
    *   `[✅] 2.A.1.4 [DB]` **Seed the New Linking Table:**
        *   `[✅] 2.A.1.4.2 [DB]` Create a new migration script to `INSERT` data into `domain_process_associations`. This script should associate the existing domains with their relevant process templates and set `is_default_for_domain = true` for the primary process of each domain. (GREEN)
        *   `[✅] 2.A.1.4.3 [TEST-UNIT]` Run the seed migration.
    *   `[✅] 2.A.1.5 [DB]` **Regenerate Database Types:** Run the command to update `types_db.ts` to reflect all schema changes.

*   `[✅] 2.A.2 [BE]` **Phase 2: Update Backend Logic for Project Initialization**
    *   `[✅] 2.A.2.1 [BE]` **Refactor `createProject` Action:** Modify the backend function to automatically set the default process template.
        *   `[✅] 2.A.2.1.1 [TEST-INT]` Update the integration tests for `createProject`. The tests should now verify that when a project is created with a `selected_domain_id`, the correct default `process_template_id` is automatically fetched and saved to the new project row. (RED)
        *   `[✅] 2.A.2.1.2 [BE]` Modify the implementation of the `createProject` function in `supabase/functions/dialectic-service/`.
            *   The function should receive the `selected_domain_id` from the client payload.
            *   It will query the new `domain_process_associations` table to find the `process_template_id` where `domain_id` matches and `is_default_for_domain` is `true`.
            *   It will then use this retrieved ID to populate the `process_template_id` field when creating the new row in `dialectic_projects`.
            *   If no default is found, it should handle the error gracefully (e.g., return a 400 error or use a system-wide fallback).
        *   `[✅] 2.A.2.1.3 [TEST-INT]` Run the updated integration tests. (GREEN)
    *   `[✅] 2.A.2.2 [BE]` **Refactor `getProjectDetails` Action:** Ensure the full process template information is sent to the client.
        *   `[✅] 2.A.2.2.1 [TEST-INT]` Update integration tests for `getProjectDetails` to assert that the returned project object now contains a nested `process_template` object with its details (id, name, description, etc.). (RED)
        *   `[✅] 2.A.2.2.2 [BE]` Modify the implementation of `getProjectDetails` to `JOIN` `dialectic_projects` with `dialectic_process_templates` on `dialectic_projects.process_template_id`. The query should be structured to return the process template data as a nested object. (GREEN)
        *   `[✅] 2.A.2.2.3 [TEST-INT]` Run the updated integration tests.

*   `[✅] 2.A.3 [API/STORE]` **Phase 3: Propagate State Through the API and Store**
    *   `[✅] 2.A.3.1 [API]` **Update Shared Types:**
        *   `[✅] 2.A.3.1.1 [TYPES]` In `packages/types/src/dialectic.types.ts`, update the `DialecticProject` type to include the nested `processTemplate` object (e.g., `processTemplate: DialecticProcessTemplate | null;`).
        *   `[✅] 2.A.3.1.2 [API]` Ensure the `DialecticAPIInterface` and its implementation reflect this change in the return type for methods like `getProjectDetails` and `createProject`.
    *   `[✅] 2.A.3.2 [STORE]` **Update State Management:**
        *   `[✅] 2.A.3.2.1 [TEST-UNIT]` Update tests for the `dialecticStore` to reflect the new `DialecticProject` structure in the `currentProjectDetail` state. (RED)
        *   `[✅] 2.A.3.2.2 [STORE]` Update the `fetchDialecticProjectDetails` thunk to correctly handle the new API response and update the `currentProjectDetail` in the store.
        *   `[✅] 2.A.3.2.3 [STORE]` Update or create selectors to easily access the nested process data, e.g., `selectCurrentProjectProcessTemplate()`, `selectCurrentProjectDomain()`.
        *   `[✅] 2.A.3.2.4 [TEST-UNIT]` Run the store tests. (GREEN)

*   `[✅] 2.A.4 [UI]` **Phase 4: Fix Frontend State Initialization**
    *   `[✅] 2.A.4.1 [UI]` **Refactor `StartDialecticSessionModal`:** Make the modal aware of the active project's context.
        *   `[✅] 2.A.4.1.1 [TEST-UNIT]` Write/update unit tests for `StartDialecticSessionModal`. (RED)
            *   The tests should mock the `dialecticStore` with a `currentProjectDetail` object that has a `selected_domain_id` and a `process_template_id`.
            *   Assert that upon mounting, the `DomainSelector` and `ProcessSelector` (or `DialecticStageSelector`) components are rendered with the correct initial values.
        *   `[✅] 2.A.4.1.2 [IMPL]` Implement a `useEffect` hook in `StartDialecticSessionModal` that triggers when the modal is opened.
            *   This hook should check for a `currentProjectDetail` and, if present, dispatch actions to set the `selectedDomain` and `selectedProcessTemplate` in the store.
        *   `[✅] 2.A.4.1.3 [TEST-UNIT]` Run the store tests. (GREEN)
    *   `[✅] 2.A.4.2 [API]` **Fix `fetchProcessTemplate` Server-Side Bug:** Correct the database query logic in the `fetchProcessTemplate` edge function.
        *   `[✅] 2.A.4.2.1 [IMPL]` Update the function to first query `dialectic_stage_transitions` for the given `process_template_id`.
        *   `[✅] 2.A.4.2.2 [IMPL]` Collect all unique `source_stage_id` and `target_stage_id` values from the transitions.
        *   `[✅] 2.A.4.2.3 [IMPL]` Query the `dialectic_stages` table using the collected set of stage IDs.
        *   `[✅] 2.A.4.2.4 [TEST-INTEGRATION]` Manually test the project creation and session initiation flow to confirm the fix. (GREEN)
    *   `[✅] 2.A.4.3 [TEST-UNIT]` **Add Unit Test for `fetchProcessTemplate`:** Create a new test file to validate the edge function's logic.
        *   `[✅] 2.A.4.3.1 [IMPL]` Create `fetchProcessTemplate.test.ts` with tests for success, missing ID, and not-found scenarios.
        *   `[✅] 2.A.4.3.2 [IMPL]` Use the shared `supabase.mock.ts` to provide mock data via the `genericMockResults` config.
        *   `[✅] 2.A.4.3.3 [TEST-UNIT]` Run the new test file to ensure all tests pass. (GREEN)
    *   `[✅] 2.A.5 [COMMIT]` Commit all changes with the message: `fix(dialectic): resolve state propagation and server-side bugs for process templates`.
        *   `[✅] 2.A.5.1 [COMMIT]` Commit the fix to `fetchProcessTemplate.ts`.
        *   `[✅] 2.A.5.2 [COMMIT]` Commit the new test file `fetchProcessTemplate.test.ts`.

### 2.1 Database Schema & Prompt Template Enhancements for Synthesis & HitL
*   `[ ] 2.1.1 [DB]` Update `dialectic_sessions` table:
    *   `[ ] 2.1.1.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 2.1.1.2` Add `active_synthesis_prompt_template_id` (UUID, foreign key to `prompt_templates.id`, nullable). (GREEN)
    *   `[ ] 2.1.1.3` Run migration test.
*   `[ ] 2.1.2 [PROMPT]` Seed new prompt templates for Synthesis stage in `prompt_templates` table.
    *   `[ ] 2.1.2.1 [TEST-UNIT]` Write test for new seed data. (RED)
    *   `[ ] 2.1.2.2` E.g., `template_name = "dialectic_synthesis_default_v1"`, `stage_association = "synthesis"`. Content like: "Based on the initial problem: '{{initial_user_prompt}}', the following thesis contributions: {{all_thesis_contents_formatted}}, and the following critiques: {{all_antithesis_contents_formatted}}, generate a single, unified, and improved solution. Resolve contradictions and incorporate valid critiques. Highlight areas where consensus could not be reached." Ensure placeholders are clearly defined. (GREEN)
    *   `[ ] 2.1.2.3` Run seed script update and tests.
*   `[ ] 2.1.3 [DB]` Create `dialectic_hitl_feedback` table for user feedback.
    *   `[ ] 2.1.3.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 2.1.3.2` Define columns: `id` (UUID PK), `session_id` (UUID FK on delete cascade), `user_id` (UUID FK on delete cascade), `target_contribution_id` (UUID FK to `dialectic_contributions.id` on delete set null, nullable, for feedback on specific contribution), `feedback_type` (TEXT, e.g., "rating", "selection_for_synthesis", "flag_confusing"), `feedback_value_numeric` (INTEGER, nullable, e.g., rating 1-5), `feedback_value_text` (TEXT, nullable), `feedback_value_boolean` (BOOLEAN, nullable), `notes` (TEXT, nullable), `created_at`. (GREEN)
    *   `[ ] 2.1.3.3` Run migration test.
*   `[ ] 2.1.4 [RLS]` Define RLS for `dialectic_hitl_feedback` (user can CRUD their own feedback for sessions they own).
    *   `[ ] 2.1.4.1 [TEST-INT]` Write RLS tests. (RED)
    *   `[ ] 2.1.4.2` Implement RLS. (GREEN)
    *   `[ ] 2.1.4.3 [TEST-INT]` Run RLS tests.
*   `[ ] 2.1.5 [COMMIT]` feat(db,prompt): extend schema for Synthesis and HitL

### 2.2 Backend Logic for Synthesis Stage & Basic HitL
*   `[ ] 2.2.1 [BE]` `dialectic-service` Action: `generateSynthesisContributions` (internal, triggered after antithesis or by user for HitL-guided synthesis).
    *   `[ ] 2.2.1.1 [TEST-INT]` Write tests. (RED)
    *   `[ ] 2.2.1.2` Update `startSession` action in `dialectic-service` to fetch `active_synthesis_prompt_template_id` and store in `dialectic_sessions`.
    *   `[ ] 2.2.1.3` Implement logic:
        1.  Fetch session, its models, all 'thesis' and 'antithesis' contributions. Fetch `synthesis_prompt_template_id` from session, then the template content from `prompt_templates`. Fetch `initial_user_prompt` from project. Fetch relevant `dialectic_hitl_feedback` for the session (e.g., selected critiques, highly-rated thesis points).
        2.  Verify status is `antithesis_complete` or a HitL trigger state (e.g., 'pending_synthesis_with_feedback'). Update to `generating_synthesis`. Log this.
        3.  Format all thesis and antithesis content. **Incorporate HitL feedback**: if certain critiques were flagged as important or certain thesis points selected, ensure they are emphasized or specifically included in the context for the synthesis model.
        4.  Render the synthesis prompt template using this comprehensive context. Update `dialectic_sessions.seed_prompt_url` with this rendered prompt.
        5.  Select one model (e.g., a high-capability default, or user-designated "synthesizer" if that feature is added later) to generate the synthesis. For now, use the first model in `dialectic_session_models` or a configurable default.
        6.  Call `callUnifiedAIModel` with the selected model and the rendered synthesis prompt.
        7.  Save result(s) in `dialectic_contributions` (stage 'synthesis', `actual_prompt_sent` = rendered prompt). Record errors if any.
        8.  Update `dialectic_sessions.status` to `synthesis_complete`. Log this.
        9.  (Phase 2 ends here for backend generation; next async call would be for Parenthesis in Phase 3).
    *   `[ ] 2.2.1.4` (GREEN)
    *   `[ ] 2.2.1.5 [REFACTOR]` Review (including testing how HitL feedback influences the prompt context).
    *   `[ ] 2.2.1.6 [TEST-INT]` Run tests.
*   `[ ] 2.2.2 [BE]` `dialectic-service` Action: `submitHitlFeedback`.
    *   `[ ] 2.2.2.1 [TEST-INT]` Write tests. (RED)
    *   `[ ] 2.2.2.2` Implement logic: Input `sessionId`, `targetContributionId` (optional), `feedbackType`, `feedbackValueNumeric`, `feedbackValueText`, `feedbackValueBoolean`, `notes`. Inserts into `dialectic_hitl_feedback`. Ensure user owns the session. (GREEN)
    *   `[ ] 2.2.2.3 [REFACTOR]` Review.
    *   `[ ] 2.2.2.4 [TEST-INT]` Run tests.
*   `[ ] 2.2.3 [BE]` Sequence `getContributions` calls to follow the dialectic pattern once the user approves moving to the next step in the sequence.
*   `[ ] 2.2.4 [COMMIT]` feat(be): implement Synthesis stage and HitL feedback logic

### 2.3 API Client (`@paynless/api`) & Store (`@paynless/store`) Updates
*   `[ ] 2.3.1 [API]` Update types in `interface.ts` to include `DialecticHitlFeedback` and reflect Synthesis stage in `DialecticContribution` and session status. Update `StartSessionPayload` if it needs to carry `synthesisPromptTemplateName`.
*   `[ ] 2.3.2 [API]` Add `submitHitlFeedback(payload: SubmitFeedbackPayload): Promise<DialecticHitlFeedback>` method to `DialecticAPIInterface`.
*   `[ ] 2.3.3 [API]` Implement in adapter.
    *   `[ ] 2.3.3.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 2.3.3.2` Implement. (GREEN)
    *   `[ ] 2.3.3.3 [TEST-UNIT]` Run tests.
*   `[ ] 2.3.4 [STORE]` Update `DialecticState` in `packages/store/src/interfaces/dialectic.ts` to include `currentProjectHitlFeedback: DialecticHitlFeedback[] | null` and potentially `isSubmittingFeedback: boolean`.
*   `[ ] 2.3.5 [STORE]` Add Thunk/Action for `submitHitlFeedback`.
    *    `[ ] 2.3.5.1 [TEST-UNIT]` Write tests. (RED)
    *    `[ ] 2.3.5.2` Implement (handles pending/fulfilled/rejected, updates `currentProjectHitlFeedback` or refetches project details). (GREEN)
    *    `[ ] 2.3.5.3 [TEST-UNIT]` Run tests.
*   `[ ] 2.3.6 [STORE]` Ensure `fetchDialecticProjectDetails` thunk and `currentProjectDetails` in state correctly populate Synthesis contributions and any associated HitL feedback for display. Update relevant selectors/reducers.
*   `[ ] 2.3.7 [COMMIT]` feat(api,store): update for Synthesis and HitL data

### 2.4 UI Enhancements for Synthesis & Basic HitL
*   `[ ] 2.4.1 [UI]` Update `DialecticSessionDetailsPage`:
    *   `[ ] 2.4.1.1 [TEST-UNIT]` Write tests for new Synthesis view and HitL elements. (RED)
    *   `[ ] 2.4.1.2` Add a "Synthesis" view/tab. This should be clearly part of a larger stage progression display.
    *   `[ ] 2.4.1.3` Display 'synthesis' stage contributions, including model name, timestamp, content, cost.
    *   `[ ] 2.4.1.4` In Antithesis view (and potentially Thesis view), add simple UI elements (e.g., star rating, "thumbs up/down", checkbox "prioritize for synthesis") next to contributions/critiques to allow users to submit `HitlFeedback`.
        *   These UI elements dispatch `submitHitlFeedback` thunk.
        *   Display existing feedback if available.
    *   `[ ] 2.4.1.5` (Optional UI element for later, or if simple for Phase 2) Button "Regenerate Synthesis with my feedback" if `synthesis_complete`. This would require a new backend action like `regenerateSynthesis` which re-runs that stage using existing contributions and latest feedback. For now, feedback influences the *next automatic* synthesis.
    *   `[ ] 2.4.1.6` Ensure a11y. (GREEN)
    *   `[ ] 2.4.1.7 [TEST-UNIT]` Run tests.
*   `[ ] 2.4.2 [UI]` Implement a basic **Stage Progression Indicator** component (e.g., a series of labeled steps: Thesis -> Antithesis -> Synthesis, highlighting the current/completed stages). This component would be used in `DialecticSessionDetailsPage`.
    *   `[ ] 2.4.2.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 2.4.2.2` Implement. Ensure a11y. (GREEN)
    *   `[ ] 2.4.2.3 [TEST-UNIT]` Run tests.
*   `[ ] 2.4.3 [REFACTOR]` Review UI components.
*   `[ ] 2.4.4 [COMMIT]` feat(ui): display Synthesis, add basic HitL inputs, and stage progression indicator

### 2.5 GitHub Integration Enhancements
*   `[ ] 2.5.1 [BE]` Modify `generateSynthesisContributions` action in `dialectic-service`:
    *   `[ ] 2.5.1.1` After saving Synthesis contribution to DB, if GitHub repo is configured:
        *   Format content as Markdown.
        *   File path: `{repo_root}/dialectic/{project_name_slug}/{session_id_short}/synthesis/{model_name_slug}_synthesis.md`.
        *   Retrieve GitHub credentials securely.
        *   Call `commitFileToGitHub`.
*   `[ ] 2.5.2 [BE]` (PRD mentions "basic versioning/branching" - for Phase 2, ensure file naming or commit messages clearly indicate this is the output of the synthesis stage for the current session/iteration. True branching might be later).
*   `[ ] 2.5.3 [COMMIT]` feat(be): save Synthesis outputs to GitHub using templated markdown

### 2.6 Expanded Prompts Library & UX
*   `[ ] 2.6.1 [PROMPT]` Research and add 2-3 prompt templates for non-developer roles (e.g., basic legal query analysis, marketing copy idea generation) for Thesis, Antithesis, and Synthesis stages. Seed these into `prompt_templates`. Ensure they have distinct names (e.g., `dialectic_synthesis_legal_v1`).
    *   `[ ] 2.6.1.1 [TEST-UNIT]` Write tests for new seed data. (RED)
    *   `[ ] 2.6.1.2` Implement. (GREEN)
    *   `[ ] 2.6.1.3 [TEST-UNIT]` Run tests.
*   `[ ] 2.6.2 [UI]` `StartDialecticSessionModal`:
    *   `[ ] 2.6.2.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 2.6.2.2` Allow users to select from available Thesis, Antithesis, and Synthesis prompt templates (filtered by `stage_association` and potentially new `domain` or `category` field in `prompt_templates` table).
    *   `[ ] 2.6.2.3` Default to the "default_v1" templates if no selection is made. (GREEN)
    *   `[ ] 2.6.2.4 [TEST-UNIT]` Run tests.
*   `[ ] 2.6.3 [COMMIT]` feat(prompt,ui): expand prompt library and allow template selection for all active stages

### 2.7 Finalizing Phase 2
*   `[ ] 2.7.1 [TEST-E2E]` Update E2E tests for Phase 2:
    *   User views Synthesis contributions.
    *   User provides HitL feedback (e.g., rating a critique).
    *   Verify the stage progression indicator updates correctly.
    *   (Optional E2E) Verify Synthesis files on GitHub with correct paths and format.
*   `[ ] 2.7.2 [DOCS]` Update documentation for new Synthesis and HitL features, and the expanded prompt library.
*   `[ ] 2.7.3 [REFACTOR]` General review and refactor of Phase 2 code.
*   `[ ] 2.7.4 [COMMIT]` feat: complete Phase 2 of AI Dialectic Engine
*   `[ ] 2.7.5 [DEPLOY]` Phase 2 deployment checkpoint. Review deployment readiness.

---
**Checkpoint Reminder for User:** After completing Section 2 / Phase 2:
1.  Run all tests. Ensure they are integrated into CI/CD.
2.  Build relevant packages/apps.
3.  Restart dev servers and manually verify Phase 2 functionality.
4.  Commit: `git commit -m "feat: AI Dialectic Engine Phase 2 complete (Synthesis & Basic HitL)"`
5.  If ready, proceed with Phase 2 deployment.
---

## Section 3: Phase 3 - Iterative Refinement & Full Dialectic (Adding Parenthesis & Paralysis Stages)

**Phase 3 Value:** Implement the complete 5-stage DialeqAI cycle (Thesis -> Antithesis -> Synthesis -> Parenthesis -> Paralysis). Introduce automatic iteration management, convergence/divergence detection (basic), and smart termination logic. Enhance GitHub integration with more advanced options and provide initial IDE plugin considerations.

**Phase 3 Objectives:**
1.  Extend DB schema and backend for Parenthesis (refinement/formalization) and Paralysis (reflection/next steps) stages.
2.  Implement backend orchestration for these new stages, ensuring data flows correctly from one stage to the next.
3.  Develop logic for session iteration: after Paralysis, the system can loop back to Thesis (or a later stage like Synthesis) with refined inputs based on Paralysis output.
4.  Introduce basic convergence/divergence detection (e.g., based on content similarity between iterations or explicit model statements in Paralysis) and smart termination (e.g., max iterations, user command, detected convergence).
5.  Update API/Store for new stages, iteration management, and convergence status.
6.  Enhance UI to display Parenthesis and Paralysis outputs, manage iterations, and show convergence indicators. UI should clearly show all 5 stages in the progression.
7.  Advanced GitHub options: ensure outputs from all 5 stages are saved with appropriate naming (e.g., `.../4_parenthesis/...`, `.../5_paralysis/...`). If iterating, outputs for each iteration should be distinct (e.g., `.../iteration_1/1_thesis/...`, `.../iteration_2/1_thesis/...`).
8.  Begin foundational work/design for IDE plugins (VS Code, JetBrains) - primarily analysis of API needs.
10. Implement basic "Argument Mapping" visualization (a simple, clear visual flow of Thesis -> Antithesis links -> Synthesis -> Parenthesis -> Paralysis).
11. Support for Evidence/Citation in Parenthesis stage: Prompts should encourage models to add citations, and the DB/UI should be ableto store/display them.
12. (Experimental) Dynamic Model Routing: Allow different models (or model capabilities) to be prioritized for different stages based on catalog data (e.g., a highly analytical model for Parenthesis).

**Estimated Duration (as per PRD):** 4-5 months

**Starting Point:** Completion of Section 2 (Phase 2). Thesis, Antithesis, Synthesis, and basic HitL are functional.

**Deliverables for Phase 3:**
*   Fully functional 5-stage dialectic process (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis).
*   Automated iteration capabilities within a session, with outputs from each iteration distinctly stored/displayed.
*   Basic mechanisms for detecting convergence and terminating sessions automatically or by user command.
*   UI to visualize all 5 stages, manage iterations, and display convergence status/indicators.
*   GitHub integration for all 5 stages, with clear separation for iterative outputs.
*   A basic visual argument map.

---
### 3.1 Schema, Prompts for Parenthesis, Paralysis, Iteration & Advanced Features
*   `[ ] 3.1.1 [DB]` Update `dialectic_sessions` table:
    *   `[ ] 3.1.1.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 3.1.1.2` Add `active_parenthesis_prompt_template_id` (UUID, FK to `prompt_templates.id`, nullable) and `active_paralysis_prompt_template_id` (UUID, FK to `prompt_templates.id`, nullable).
    *   `[ ] 3.1.1.3` Add `max_iterations` (INTEGER, default 3, configurable by user), `current_iteration` (INTEGER, default 1).
    *   `[ ] 3.1.1.4` Add `convergence_status` (TEXT, e.g., 'converged', 'diverged', 'max_iterations_reached', 'user_terminated', nullable).
    *   `[ ] 3.1.1.6` Run migration test.
*   `[ ] 3.1.2 [PROMPT]` Seed `prompt_templates` for Parenthesis and Paralysis stages.
    *   `[ ] 3.1.2.1 [TEST-UNIT]` Write tests for new seed data. (RED)
    *   `[ ] 3.1.2.2` Parenthesis template (e.g., `dialectic_parenthesis_refine_cite_v1`): "Given the synthesized solution: {{synthesis_content}}, refine it for clarity, accuracy, structure, and completeness. Ensure factual correctness. **If the problem domain or solution implies external knowledge, provide citations or references for key claims or data points.** Format citations clearly. Original problem: {{initial_user_prompt}}."
    *   `[ ] 3.1.2.3` Paralysis template (e.g., `dialectic_paralysis_reflect_iterate_v1`): "Reflecting on the refined solution (Parenthesis): {{parenthesis_content}}. Consider the entire process: Initial Problem: {{initial_user_prompt}}; Key Thesis Points: {{all_thesis_summaries}}; Key Antithesis Critiques: {{all_antithesis_summaries}}; Synthesized Solution: {{synthesis_summary}}.
        1.  Identify any remaining limitations, unaddressed critiques, or areas for significant improvement in the Parenthesis output.
        2.  Assess the overall quality and completeness.
        3.  **Explicitly recommend: Should another iteration be performed?** If yes, suggest specific focus areas or modifications to prompts for the next iteration (e.g., 'Re-run synthesis focusing on critique X', 'Generate new theses with an emphasis on Y'). If no, explain why the current solution is adequate or why further iteration is unlikely to yield significant benefit.
        4.  What are the key takeaways or learning from this entire dialectic process?" (GREEN)
    *   `[ ] 3.1.2.4 [TEST-UNIT]` Run tests.
*   `[ ] 3.1.4 [DB]` Update `dialectic_contributions` table:
    *   `[ ] 3.1.4.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 3.1.4.2` Add `iteration_number` (INTEGER, not nullable, default 1) to associate contribution with a specific iteration cycle within the session.
    *   `[ ] 3.1.4.3` Add `citations` (JSONB, nullable, array of objects e.g., `[{text: "Source A", url: "link_to_source_a"}, {text: "Another reference"}]`) - primarily for Parenthesis stage. (GREEN)
    *   `[ ] 3.1.4.4` Run migration test.
*   `[ ] 3.1.5 [COMMIT]` feat(db,prompt): schema for full 5-stage cycle, iteration, citations

### 3.2 Backend Logic for Parenthesis, Paralysis, Iteration & Advanced Orchestration
*   `[ ] 3.2.1 [BE]` `dialectic-service` Actions: `generateParenthesisContribution`, `generateParalysisContribution`.
    *   `[ ] 3.2.1.1 [TEST-INT]` Write tests for `generateParenthesisContribution`. (RED)
    *   `[ ] 3.2.1.2` Implement `generateParenthesisContribution`: Input `sessionId`, `iterationNumber`. Fetches active Parenthesis prompt template. Uses latest 'synthesis' contribution from the current `iterationNumber` as primary input. Saves result as 'parenthesis' stage for current `iterationNumber`, including any parsed `citations`. Log status. (GREEN)
    *   `[ ] 3.2.1.3 [TEST-INT]` Run tests for `generateParenthesisContribution`.
    *   `[ ] 3.2.1.4 [TEST-INT]` Write tests for `generateParalysisContribution`. (RED)
    *   `[ ] 3.2.1.5` Implement `generateParalysisContribution`: Input `sessionId`, `iterationNumber`. Fetches active Paralysis prompt template. Uses latest 'parenthesis' contribution and summaries of prior stage outputs (thesis, antithesis, synthesis) from current `iterationNumber` as input. Saves result as 'paralysis' stage for current `iterationNumber`. Log status. (GREEN)
    *   `[ ] 3.2.1.6 [TEST-INT]` Run tests for `generateParalysisContribution`.
    *   `[ ] 3.2.1.7` Ensure these actions are called sequentially after the previous stage completes (Synthesis -> Parenthesis -> Paralysis). Update the project stage in its store selector so that the correct stage is set unless the user actively resets the project to a different stage. 
    *   `[ ] 3.2.1.8 [REFACTOR]` Review both actions.
*   `[ ] 3.2.2 [BE]` Orchestration logic in `generateParalysisContribution's completion (for `sessionId`, `current_iteration`):
    *   `[ ] 3.2.2.1 [TEST-INT]` Write tests for orchestration logic (convergence, termination, iteration). (RED)
    *   `[ ] 3.2.2.2` **Convergence/Termination Detection:**
        *   Parse Paralysis output (the `content` of the 'paralysis' `dialectic_contribution`) for explicit recommendation on iteration (e.g., looking for keywords like "another iteration recommended", "solution is adequate", "do not iterate").
        *   If recommendation is to stop, or if `current_iteration >= max_iterations`:
            *   Update `dialectic_sessions.status` to `session_complete`.
            *   Set `dialectic_sessions.convergence_status` based on paralysis output (e.g., 'converged_by_recommendation', 'max_iterations_reached').
            *   STOP further processing for this session. Log completion.
        *   Else (recommendation is to iterate AND `current_iteration < max_iterations`):
            *   Increment `dialectic_sessions.current_iteration`.
            *   Extract suggested focus areas or prompt modifications from Paralysis output.
            *   Construct the seed prompt for the next iteration's Thesis (or Synthesis, if design allows skipping). This might involve combining `initial_user_prompt` with the focus areas from Paralysis. Store this as `dialectic_sessions.seed_prompt_url` for the new iteration.
            *   Update `dialectic_sessions.status` to `pending_thesis` (or `pending_synthesis`). Log this.
            *   The system will now wait for the user to trigger the stage via a frontend action. It does not automatically trigger `generateContributions`.
    *   `[ ] 3.2.2.3` (GREEN)
    *   `[ ] 3.2.2.4 [REFACTOR]` Review (including parsing paralysis output and iteration triggering).
    *   `[ ] 3.2.2.5 [TEST-INT]` Run tests.
*   `[ ] 3.2.3 [BE]` `dialectic-service` Action: `updateSessionParameters`.
    *   `[ ] 3.2.3.1 [TEST-INT]` Write tests. (RED)
    *   `[ ] 3.2.3.2` Input: `sessionId`, `maxIterations` (optional). Allows user to change these for an ongoing or future session.
    *   `[ ] 3.2.3.3` Updates `dialectic_sessions` table, update all `active_..._prompt_template_id` fields in the session from the new structure's defaults. (GREEN)
    *   `[ ] 3.2.3.4 [REFACTOR]` Review.
    *   `[ ] 3.2.3.5 [TEST-INT]` Run tests.
*   `[ ] 3.2.4 [BE]` (Experimental) Dynamic Model Routing for Stages:
    *   `[ ] 3.2.4.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 3.2.4.2` Add `preferred_model_for_stage` (JSONB, e.g., `{"parenthesis": "openai/gpt-4-turbo", "synthesis": "anthropic/claude-3-opus"}`) to `dialectic_sessions`. (DB change, ensure migration)
    *   `[ ] 3.2.4.3` When executing `generate[StageName]Contribution`, if a preferred model is set for that stage, use it. Otherwise, fall back to the general list of session models. (GREEN)
    *   `[ ] 3.2.4.4 [TEST-UNIT]` Run tests for this routing logic.
*   `[ ] 3.2.5 [COMMIT]` feat(be): implement Parenthesis, Paralysis, iteration, convergence, dynamic model routing

### 3.3 API/Store Updates for Full Cycle & Advanced Features
*   `[ ] 3.3.1 [API]` Update types in `interface.ts`:
    *   `DialecticSession`: add `maxIterations`, `currentIteration`, `convergenceStatus`, new prompt template IDs, `preferredModelForStage`.
    *   `DialecticContribution`: add `iterationNumber`, `citations`.
    *   Add `UpdateSessionParametersPayload`.
*   `[ ] 3.3.2 [API]` Add API methods:
    *   `updateSessionParameters(payload: UpdateSessionParametersPayload): Promise<DialecticSession>`
*   `[ ] 3.3.3 [API]` Implement new methods in adapter.
    *    `[ ] 3.3.3.1 [TEST-UNIT]` Write tests. (RED)
    *    `[ ] 3.3.3.2` Implement. (GREEN)
    *    `[ ] 3.3.3.3 [TEST-UNIT]` Run tests.
*   `[ ] 3.3.5 [STORE]` Add Thunks/Actions/Reducers for `updateSessionParameters`.
    *    `[ ] 3.3.5.1 [TEST-UNIT]` Write tests. (RED)
    *    `[ ] 3.3.5.2` Implement. (GREEN)
    *    `[ ] 3.3.5.3 [TEST-UNIT]` Run tests.
*   `[ ] 3.3.6 [STORE]` Ensure `fetchDialecticProjectDetails` populates all new fields, including contributions from all iterations, properly associated.
*   `[ ] 3.3.7 [COMMIT]` feat(api,store): support full 5-stage cycle, iteration params

### 3.4 UI for Full Cycle, Iteration, Advanced Features
*   `[ ] 3.4.1 [UI]` Update `DialecticSessionDetailsPage`:
    *   `[ ] 3.4.1.1 [TEST-UNIT]` Write tests for new stage views, iteration controls, citation display. (RED)
    *   `[ ] 3.4.1.2` Update Stage Progression Indicator to show all 5 stages (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis).
    *   `[ ] 3.4.1.3` Add "Parenthesis" and "Paralysis" views/tabs. Display contributions for the current iteration, including parsed `citations` in Parenthesis view (e.g., as a list of links or embedded references).
    *   `[ ] 3.4.1.4` Display `current_iteration` / `max_iterations`.
    *   `[ ] 3.4.1.5` Display `convergence_status` and overall session status (e.g., "Iteration 2/3 - Generating Parenthesis", "Session Complete - Converged").
    *   `[ ] 3.4.1.6` Add controls for managing iterations:
        *   If session is `session_complete`: Display final status.
        *   If session is active and `paralysis_complete` for current iteration: Display paralysis recommendation. Button "Proceed to Next Iteration" (if not max_iterations and paralysis recommends it or user overrides). Button "Mark Session as Complete" (user termination).
        *   Display contributions from previous iterations, perhaps in a collapsed view or via an iteration selector.
    *   `[ ] 3.4.1.7` Ensure a11y. (GREEN)
    *   `[ ] 3.4.1.8 [TEST-UNIT]` Run tests.
*   `[ ] 3.4.2 [UI]` `StartDialecticSessionModal` (or a new "Session Settings" modal accessible from `DialecticProjectDetailsPage`):
    *   `[ ] 3.4.2.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 3.4.2.3` Input for `max_iterations`.
    *   `[ ] 3.4.2.4` (Optional for Phase 3) UI to set preferred models for specific stages if dynamic routing is implemented. (GREEN)
    *   `[ ] 3.4.2.5 [TEST-UNIT]` Run tests.
*   `[ ] 3.4.3 [UI]` Basic Argument Mapping View Component:
    *   `[ ] 3.4.3.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 3.4.3.2` A new tab or section in `DialecticSessionDetailsPage`.
    *   `[ ] 3.4.3.3` For the current iteration:
        *   Display Thesis contributions as root nodes.
        *   Antithesis contributions link to the Thesis they critique.
        *   Synthesis contribution(s) link from the Theses and Antitheses they considered.
        *   Parenthesis links from Synthesis.
        *   Paralysis links from Parenthesis.
        *   Use simple boxes and lines; no complex graphing library needed yet. Focus on clear flow. Ensure a11y. (GREEN)
    *   `[ ] 3.4.3.4 [TEST-UNIT]` Run tests.
*   `[ ] 3.4.4 [REFACTOR]` Review all new UI elements and logic.
*   `[ ] 3.4.5 [COMMIT]` feat(ui): display full 5-stage cycle, iteration controls, basic argument map, citation display

### 3.5 Advanced GitHub & IDE Foundation
*   `[ ] 3.5.1 [BE]` GitHub Integration:
    *   `[ ] 3.5.1.1` Ensure Parenthesis and Paralysis outputs are saved to GitHub by the respective backend actions (`generateParenthesisContribution`, `generateParalysisContribution`).
        *   File paths:
            *   **General Structure for all stages (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis) within an iteration {N}:**
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage_number}_{stage_name}/{model_name_slug}_{stage_suffix}.md`
                *   Example Parenthesis: `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_{N}/4_parenthesis/{model_name_slug}_parenthesis.md`
                *   Example Paralysis: `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_{N}/5_paralysis/{model_name_slug}_paralysis.md`
            *   User feedback files: `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage_number}_{stage_name}/user_feedback_{stage_name}.md`
            *   **Documents Subfolders (for Hypothesis, Synthesis, Parenthesis, Paralysis):**
            *   `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage_number}_{stage_name}/documents/`
                *   Synthesis Example: `.../3_synthesis/documents/{model_name_slug}_prd_synthesis.md`
                *   Synthesis Example: `.../3_synthesis/documents/{model_name_slug}_business_case_synthesis.md`
                *   Parenthesis Example: `.../4_parenthesis/documents/{model_name_slug}_implementation_plan_parenthesis.md`
                *   Paralysis Documents (Canonical/Chosen by User):
                    *   `.../5_paralysis/documents/chosen_implementation_plan.md`
                    *   `.../5_paralysis/documents/project_checklist.csv` (or other PM tool formats)
            *   Optional iteration summary: `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/session_{session_id_short}/iteration_{N}/iteration_summary.md`
        *   Ensure Markdown templates include citation rendering for Parenthesis stage.
    *   `[ ] 3.5.1.2` All stage outputs (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis, including their `documents/` subfolders and user feedback files) should be consistently saved under the appropriate iteration-specific folders (`iteration_{N}`).
    *   `[ ] 3.5.1.3` The `project_readme.md`, `Implementation/`, and `Complete/` folders are at the project level: `{repo_root}/{dialectic_outputs_base_dir_name}/{project_name_slug}/`.
*   `[ ] 3.5.2 [IDE]` Foundational work for IDE plugins (VS Code, JetBrains - primarily design and API needs analysis for Phase 3):
    *   `[ ] 3.5.2.1 [DOCS]` Define core IDE use cases:
        *   Initiate a dialectic session from IDE (e.g., right-click on a code block or requirement file).
        *   View session progress and results within an IDE panel.
        *   Insert/apply outputs (e.g., code snippets from Parenthesis) directly into the editor.
    *   `[ ] 3.5.2.2 [API]` Analyze and document any new API endpoints or modifications to existing ones needed for smooth IDE plugin interaction (e.g., streaming results for long generations, more granular status updates, context-specific prompt generation based on IDE selection). This is analysis, not implementation of new API endpoints unless trivial and essential for planning.
*   `[ ] 3.5.3 [COMMIT]` feat(be,ide): GitHub outputs for all stages with iteration folders, IDE plugin groundwork analysis

### 3.6 Finalizing Phase 3
*   `[ ] 3.6.1 [TEST-E2E]` Write/Update E2E tests for the full 5-stage iterative workflow, including:
    *   Session proceeding through multiple iterations.
    *   Session terminating due to convergence or max iterations.
    *   Viewing citations.
    *   Viewing the basic argument map.
*   `[ ] 3.6.2 [DOCS]` Update all user and developer documentation for the 5-stage process, iteration management, citation support, and argument mapping.
*   `[ ] 3.6.3 [REFACTOR]` Perform a general review and refactor of all Phase 3 code.
*   `[ ] 3.6.4 [COMMIT]` feat: complete Phase 3 of AI Dialectic Engine
*   `[ ] 3.6.5 [DEPLOY]` Phase 3 deployment checkpoint. Review deployment readiness.

### 3.7 Refactor Chat Service for Scalable Content Storage

**Objective:** To align the `chat` service with the scalable, file-based content storage pattern used by `dialectic-service`. This refactoring will move large message content from the `chat_messages` database table into Supabase Storage, replacing it with a reference. This prevents database performance degradation and reduces costs associated with storing large text blobs directly in the database, especially for messages generated by the new continuation logic.

**Core Principle:** All AI-generated content exceeding a trivial size should be treated as a file asset, not as a direct database column entry. The `FileManagerService` should be the single source of truth for this process.

*   `[ ] 3.7.1 [DB]` **Phase 1: Update `chat_messages` Table Schema**
    *   `[ ] 3.7.1.1 [TEST-UNIT]` Write a migration test to verify schema changes. (RED)
    *   `[ ] 3.7.1.2 [DB]` Create a new Supabase migration script to alter `chat_messages`:
        *   Add `storage_path` (TEXT, nullable) to store the path to the message content file.
        *   Add `storage_bucket` (TEXT, nullable, e.g., 'chat_content').
        *   Add `mime_type` (TEXT, nullable, e.g., 'text/plain').
        *   Add `size_bytes` (INTEGER, nullable).
        *   Add `file_name` (UUID, nullable).
    *   `[ ] 3.7.1.3 [DB]` Write a one-off script to migrate existing `content` to storage for historical messages, or decide to only apply this to new messages going forward. (Decision needed)
    *   `[ ] 3.7.1.4 [TEST-UNIT]` Run the migration and test. (GREEN)
    *   `[ ] 3.7.1.5 [DB]` Regenerate database types (`types_db.ts`).

*   `[ ] 3.7.2 [BE]` **Phase 2: Refactor `chat` Edge Function Logic**
    *   `[ ] 3.7.2.1 [BE]` Integrate `FileManagerService` into `supabase/functions/chat/index.ts`.
    *   `[ ] 3.7.2.2 [TEST-INT]` Update integration tests for `handlePostRequest`. (RED)
        *   Mock `FileManagerService`.
        *   Assert that `FileManagerService.uploadAndRegisterFile` is called **exactly once** after the final, potentially continued, response is generated.
        *   Assert that the data prepared for the `chat_messages` table insert contains the `storage_path` from the file manager and that the `content` column is either null or a short summary.
    *   `[ ] 3.7.2.3 [BE]` Refactor `handlePostRequest` to orchestrate the new flow:
        1.  Declare a variable `finalAdapterResponse: AdapterResponsePayload`.
        2.  Conditionally call either `handleContinuationLoop` or the standard `adapter.sendMessage`. Store the result in `finalAdapterResponse`.
        3.  **After** the response is finalized, take `finalAdapterResponse.content` and pass it to `FileManagerService.uploadAndRegisterFile` to save the single, complete file.
        4.  When creating the new `chat_messages` record, populate the new storage-related columns (`storage_path`, `storage_bucket`, etc.) with the result from the file manager.
        5.  Set the original `content` column to a truncated summary of the full text.
    *   `[ ] 3.7.2.4 [BE]` Refactor `constructMessageHistory` (or wherever chat history is fetched for subsequent calls):
        *   When fetching `chat_messages`, if `storage_path` is not null, the function must download the content from Supabase Storage before adding it to the message history array sent to the AI model.

*   `[ ] 3.7.3 [API/STORE]` **Phase 3: Ensure Frontend Compatibility**
    *   `[ ] 3.7.3.1 [BE]` Refactor backend logic that returns chat history to the client (`chat-history` edge function or similar).
        *   This function must now also perform the same logic as `constructMessageHistory`: detect `storage_path`, download the content from storage, and assemble the complete `ChatMessage` object before sending it in the API response.
        *   This ensures the change is transparent to the frontend and the `ChatMessage` type in `@paynless/types` does not need to change.
    *   `[ ] 3.7.3.2 [TEST-E2E]` Manually verify or update E2E tests to ensure the chat UI continues to display full message histories correctly after the refactoring.

*   `[ ] 3.7.4 [REFACTOR]` Conduct a review of the changes to ensure performance (e.g., parallelizing storage downloads if fetching many messages).
*   `[ ] 3.7.5 [COMMIT]` feat(chat): refactor message content to use storage bucket

---
**Checkpoint Reminder for User:** After Section 3 / Phase 3:
1.  Run all tests. Build. Restart. Manually verify all 5 stages and iteration. Ensure tests are in CI/CD.
2.  Commit: `git commit -m "feat: AI Dialectic Engine Phase 3 complete (Full 5-Stage Cycle & Iteration)"`
3.  If ready, proceed with Phase 3 deployment.
---

## Section 4: Phase 4 - Advanced Collaboration & Ecosystem (Ongoing)

**Phase 4 Value:** Domain specialization, deeper Human-in-the-Loop (HitL) integration, ecosystem building, learning from dialectical patterns, and advanced tooling. This phase is ongoing and features will be prioritized based on learning and user feedback.

**Phase 4 Objectives (High-Level from PRD, specific items to be broken down further in future planning):**
1.  **Domain-Specific Configurations:** Create specialized DialeqAI setups for coding, legal, scientific research, etc. (e.g., pre-canned prompt libraries, model selections, workflow rules).
2.  **Advanced HitL:** Allow user intervention at any stage (e.g., edit a model's contribution before it's used in the next stage), collaborative editing of outputs, and more granular feedback mechanisms that directly influence subsequent steps.
3.  **Learning & Auto-Tuning:** System learns from successful dialectical patterns (user feedback, convergence rates, quality of output) to improve prompt generation, model selection for stages, or orchestration strategies. (Long-term research-oriented).
4.  **Expanded Model Support:** Integrate more models, including open-source (e.g., via local Ollama or Hugging Face integrations if feasible) and potentially user-provided custom models (BYOM - Bring Your Own Model API keys/endpoints).
5.  **Public API:** Offer a well-documented, versioned public API for third-party integrations to programmatically run dialectic sessions.
6.  **Advanced Argument Mapping & Visualization:** Rich, interactive visualization of the dialectic flow, allowing users to explore connections, expand/collapse threads, and understand the reasoning evolution.
7.  **Meta-Model Orchestration (Experimental):** Investigate using a dedicated AI model to manage the dialectic flow itself, deciding when to iterate, which models to use for which stage, or how to synthesize conflicting information based on context.
8.  **Advanced Code-Specific Tools (If "Coding" Domain is prioritized):** Deeper integration for developers (e.g., generating unit tests for code produced in Parenthesis, suggesting refactors, linking dialectic discussions to specific code blocks or PRs).
9.  **CLI Enhancements:** Develop a feature-rich CLI tool as described in PRDs (`aigc new`, `aigc models`, `aigc prompt`, `aigc status`, `aigc review`, `aigc resolve`, `aigc export`) for power users and automation.
10. **Failure Mode Mitigation & UX:** Robust cost controls (hard limits), latency optimization (e.g., streaming partial results for long generations where possible), UX patterns that emphasize critical thinking and human oversight.
11. **UGC Showcase & Community Prompts:** Platform for users to share successful prompt templates.

**Estimated Duration:** Ongoing, iterative development.

**Starting Point:** Completion of Section 3 (Phase 3). A fully functional 5-stage iterative dialectic engine is in place.

**Deliverables for Phase 4 (Iterative & Ongoing, examples for first few sprints):**
*   (Sprint 1-2) Enhanced CLI tool with key commands (`list-projects`, `create-project`, `start-session`, `get-session-status`).
*   (Sprint 1-2) Initial Domain Specialization: "Software Development - Architecture Planning" tailored prompts.
*   (Sprint 3-4) Advanced HitL: Allow user to edit a "Synthesis" output before it goes to "Parenthesis".
*   (Sprint 3-4) Public API V1: Document and expose core endpoints for session creation and status retrieval with API key auth.
*   (Ongoing) Incremental improvements to argument mapping, model support, cost controls, etc.
*   (Ongoing) Periodic [DEPLOY] checkpoints as significant features are completed.

---
### 4.1 Initial Focus for Phase 4 (Example Sprints/Epics)

#### Epic 4.1.A: Robust CLI Tool (MVP)
*   **Objective:** Provide a functional CLI for core dialectic operations.
*   **Key Steps:**
    *   `[ ] 4.1.A.1 [CLI]` Set up a new package for `@paynless/dialectic-cli` (e.g., using `oclif` or a similar Node.js CLI framework if not already done for other features).
    *   `[ ] 4.1.A.2 [CLI]` Implement secure authentication for CLI (e.g., device flow, token-based, leveraging existing user auth).
        *   `[ ] 4.1.A.2.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.A.2.2` Implement. (GREEN)
    *   `[ ] 4.1.A.3 [CLI]` Command: `dialectic-cli projects list` (Uses `@paynless/api` `listProjects`).
    *   `[ ] 4.1.A.4 [CLI]` Command: `dialectic-cli projects create --name "<name>" --prompt "<initial_prompt>"` (Uses `createProject`).
    *   `[ ] 4.1.A.5 [CLI]` Command: `dialectic-cli sessions start --project-id <id> --models "<model_id_1>,<model_id_2>" [--description "<desc>"] [--structure "<debate_structure_name_or_id>"]` (Uses `startSession`, may need to fetch available models/structures first).
    *   `[ ] 4.1.A.6 [CLI]` Command: `dialectic-cli sessions status --session-id <id>` (Uses `getProjectDetails` and extracts relevant session status).
    *   `[ ] 4.1.A.7 [CLI]` Command: `dialectic-cli sessions export --session-id <id> [--output-path <path>]` (Triggers GitHub export if configured, or allows local saving of all contributions as markdown).
    *   `[ ] 4.1.A.8 [TEST-INT]` Comprehensive integration tests for all CLI commands against the API.
    *   `[ ] 4.1.A.9 [DOCS]` User documentation for installing and using the CLI tool.
    *   `[ ] 4.1.A.10 [COMMIT]` feat(cli): MVP for dialectic CLI tool

#### Epic 4.1.B: Domain Specialization - "Software Architecture Planning"
*   **Objective:** Create a tailored experience for using the Dialectic Engine for software architecture planning.
*   **Key Steps:**
    *   `[ ] 4.1.B.1 [PROMPT]` Research and define a set of 5 highly effective prompt templates (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis) specifically for generating and critiquing software architecture proposals.
        *   *Thesis Example:* "Given the following requirements: {{initial_user_prompt}}, propose a high-level software architecture. Detail key components, technologies, data flow, and deployment strategy. Justify your choices."
        *   *Antithesis Example:* "Critique the proposed architecture: {{thesis_content}} based on requirements: {{initial_user_prompt}}. Focus on scalability, maintainability, security, cost, and potential bottlenecks. Offer specific alternative approaches for weak areas."
    *   `[ ] 4.1.B.2 [DB]` Seed these new prompts into `prompt_templates`.
        *   `[ ] 4.1.B.2.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.B.2.2` Implement. (GREEN)
    *   `[ ] 4.1.B.3 [DB]` Create a new entry "Software Architecture Planning" linking these 5 new prompt templates.
        *   `[ ] 4.1.B.3.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.B.3.2` Implement. (GREEN)
    *   `[ ] 4.1.B.4 [UI]` Ensure this new structure is selectable in the UI when starting a session. Add a "Domain" or "Category" filter for debate structures if the list becomes long.
        *   `[ ] 4.1.B.4.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.B.4.2` Implement. (GREEN)
    *   `[ ] 4.1.B.5 [DOCS]` Document this domain specialization and how to use it effectively.
    *   `[ ] 4.1.B.6 [COMMIT]` feat(content): add "Software Architecture Planning" domain specialization

#### Epic 4.1.C: Advanced HitL - Editing Contributions
*   **Objective:** Allow users to directly edit the content of a specific stage's output before it is used as input for the subsequent stage.
*   **Key Steps:**
    *   `[ ] 4.1.C.1 [DB]` Add `edited_content` (TEXT, nullable) and `is_edited_by_user` (BOOLEAN, default false) to `dialectic_contributions` table.
        *   `[ ] 4.1.C.1.1 [TEST-UNIT]` Write migration test. (RED)
        *   `[ ] 4.1.C.1.2` Migration script. (GREEN)
    *   `[ ] 4.1.C.2 [BE]` When an upstream stage (e.g., Parenthesis) fetches input from a downstream stage (e.g., Synthesis), it should prioritize using `edited_content` if `is_edited_by_user` is true, otherwise use `original_content` (which is the current `content` field). Modify `generateParenthesisContribution` etc. accordingly.
        *   `[ ] 4.1.C.2.1 [TEST-INT]` Write tests. (RED)
        *   `[ ] 4.1.C.2.2` Implement. (GREEN)
    *   `[ ] 4.1.C.3 [BE]` `dialectic-service` Action: `editContributionContent`. Input: `contributionId`, `newContent`. Updates `edited_content` and sets `is_edited_by_user = true`. User must own the session.
        *   `[ ] 4.1.C.3.1 [TEST-INT]` Write tests. (RED)
        *   `[ ] 4.1.C.3.2` Implement. (GREEN)
    *   `[ ] 4.1.C.4 [API]` Add `editContributionContent` to API client.
        *   `[ ] 4.1.C.4.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.C.4.2` Implement. (GREEN)
    *   `[ ] 4.1.C.5 [STORE]` Add thunk/action for `editContributionContent`. Refetch project details or update specific contribution in state.
        *   `[ ] 4.1.C.5.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.C.5.2` Implement. (GREEN)
    *   `[ ] 4.1.C.6 [UI]` In `DialecticSessionDetailsPage`, for each contribution display (e.g., Synthesis output):
        *   `[ ] 4.1.C.6.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.C.6.2` Display `edited_content` if available, otherwise `content`. Indicate if it has been user-edited.
        *   `[ ] 4.1.C.6.3` Add an "Edit" button. Clicking it opens a modal/text area pre-filled with the current content (original or previously edited).
        *   `[ ] 4.1.C.6.4` On save, dispatch `editContributionContent` thunk. (GREEN)
    *   `[ ] 4.1.C.7 [UI]` Consider how to handle re-triggering subsequent stages after an edit. E.g., if Synthesis is edited, should Parenthesis automatically re-run? For now, user might need to manually trigger "Proceed to next stage" which would then use the edited content.
    *   `[ ] 4.1.C.8 [REFACTOR]` Review.
    *   `[ ] 4.1.C.9 [COMMIT]` feat(hitl): allow user editing of stage contributions

#### Epic 4.1.D: Public API v1 (Read-Only & Session Start)
*   **Objective:** Expose core functionalities via a documented public API.
*   **Key Steps:**
    *   `[ ] 4.1.D.1 [BE]` Design API key authentication mechanism for external users/services (e.g., new table `api_keys`, link to `user_id`, secure generation and storage).
        *   `[ ] 4.1.D.1.1 [TEST-UNIT]` Write tests for DB and key generation. (RED)
        *   `[ ] 4.1.D.1.2` Implement. (GREEN)
    *   `[ ] 4.1.D.2 [BE]` Modify `dialectic-service` (or create new dedicated public API Edge Functions if separation is desired for security/rate-limiting):
        *   `[ ] 4.1.D.2.1 [TEST-INT]` Write tests for public endpoints with API key auth. (RED)
        *   `[ ] 4.1.D.2.2` Expose `listProjects`, `getProjectDetails`, `startSession`, `listModelCatalog`actions.
        *   `[ ] 4.1.D.2.3` Ensure these endpoints check for a valid API key if user session is not present.
        *   `[ ] 4.1.D.2.4` Apply appropriate rate limiting for API key access. (GREEN)
    *   `[ ] 4.1.D.3 [DOCS]` Create OpenAPI (Swagger) V3 specification for these public endpoints. Document authentication, request/response schemas, rate limits. Host this documentation (e.g., using Supabase's built-in API docs if Edge Functions are standard, or a separate tool like Redocly).
    *   `[ ] 4.1.D.4 [UI]` (Admin UI, separate from main app, or in user profile settings) Interface for users to generate/manage their API keys.
        *   `[ ] 4.1.D.4.1 [TEST-UNIT]` Write tests. (RED)
        *   `[ ] 4.1.D.4.2` Implement. (GREEN)
    *   `[ ] 4.1.D.5 [REFACTOR]` Review public API implementation and security.
    *   `[ ] 4.1.D.6 [COMMIT]` feat(api): Public API v1 for core dialectic operations

#### Epic 4.1.E: Foundational Analytics & Monitoring Infrastructure
*   **Objective:** Establish basic infrastructure for collecting and reviewing operational metrics and logs.
*   **Key Steps:**
    *   `[ ] 4.1.E.1 [CONFIG]` Identify a logging/monitoring solution compatible with Supabase (e.g., Supabase's built-in logging, or integration with a third-party service like BetterStack, Logflare, Datadog if project needs warrant).
    *   `[ ] 4.1.E.2 [BE]` Ensure `dialectic-service` and other relevant backend functions emit structured logs for key events:
        *   Project/Session creation.
        *   Stage transitions (e.g., `pending_contribution` -> `generating_contribution` -> `complete_contribution`) using the next `stage` tag from `DialecticStage` and the `domain` tag selected by the user.
        *   AI model calls (model used, tokens in/out, duration, cost, success/failure).
        *   HitL interactions.
        *   Errors and exceptions, with correlation IDs if possible.
    *   `[ ] 4.1.E.3 [BE]` Define key metrics to track initially:
        *   Number of active projects/sessions.
        *   Average duration per stage.
        *   Error rates per model/provider.
        *   Total token consumption/cost per session/project.
        *   Frequency of HitL feature usage.
    *   `[ ] 4.1.E.4 [BE]` Set up basic dashboards or queries in the chosen logging/monitoring solution to visualize these key metrics.
    *   `[ ] 4.1.E.5 [DOCS]` Document the logging strategy and how to access/interpret logs and metrics.
    *   `[ ] 4.1.E.6 [COMMIT]` feat(ops): foundational analytics and monitoring infrastructure

### Enable Org Dialectic & Notifications 
*   [ ] Add Org Switcher to Dialectic page
*   [ ] Add Org Dialectic toggle to Org page
*   [ ] Add notification triggers for members joining orgs
*   [ ] Add notification triggers for participating group chat updates 
*   [ ] Add org access to projects 
*   [ ] Add org projects card to org page
*   [ ] Add notification triggers for org projects 
*   [ ] Add Posthog triggers for every GUI interaction 

---

### Epic 5: Future Integrations to Consider

Project & Task Management (beyond Jira):
*   [ ] Asana: Very popular for task and project management.
*   [ ] Monday.com: Highly visual and flexible work OS.
*   [ ] ClickUp: Aims to be an all-in-one productivity platform.
*   [ ] Wrike: Robust for enterprise project management.
*   [ ] Trello: Kanban-style, simpler task management.
*   [ ] Basecamp: Known for its focus on simplicity and remote team collaboration.
*   [ ] Smartsheet: Spreadsheet-like interface with powerful PM features.
Version Control & Dev Platforms (beyond GitHub):
*   [ ] GitLab: Offers a complete DevOps platform.
*   [ ] Bitbucket: Atlassian's Git solution, integrates well with Jira.
Collaboration & Document Management (beyond what's listed):
*   [ ] Confluence: Atlassian's wiki/documentation tool, often paired with Jira.
*   [ ] Slack: Ubiquitous for team communication; could integrate for notifications or initiating dialectic processes.
*   [ ] Zoho Projects / Zoho One: A comprehensive suite of business apps.
Design & Whiteboarding (for early-stage hypothesis/ideation):
*   [ ] Miro: Online collaborative whiteboard.
*   [ ] Figma / FigJam: Design and whiteboarding.
General Principles for Future-Proofing Integrations:
*   [ ] Standardized Data Formats for Export/Import:
*   [ ] Prioritize common formats like CSV, JSON, and Markdown. These are widely supported.
*   [ ] For more complex data (like task dependencies), investigate if there's a common interchange format (though this is rare, often it's API-to-API).
Well-Defined API for Your Engine:
*   [ ] As planned for Phase 4 (Public API), having your own robust API is the most critical step. Other platforms will integrate with you via this API.
*   [ ] Ensure the API can provide data in easily consumable formats (JSON primarily).
Webhook Support:
*   [ ] For your system to send updates to other platforms (e.g., "Paralysis complete, new checklist available"), implement outgoing webhooks.
*   [ ] For your system to receive updates (e.g., task status changed in Jira), you'd consume webhooks from those platforms.
Modular Integration Layer:
*   [ ] When you start building specific integrations, try to create an abstraction layer. So, instead of code_that_talks_to_jira.ts, you might have task_management_adapter.ts with a JiraSpecificImplementation.ts. This makes adding AsanaSpecificImplementation.ts easier later.
Authentication Strategy:
*   [ ] OAuth 2.0 is the standard for user-authorized access to other platforms. For service-to-service, API keys or service accounts are common.
Focus on Core Data, Not Just UI:
*   [ ] The key for portability is the data. If the core dialectic outputs (prompts, responses, feedback, decisions, final documents) are well-structured and accessible via API or export, integrating the representation of that data into another tool's UI becomes a secondary problem.
User-Driven Demand:
*   [ ] While it's great to be proactive, let user demand guide which specific integrations you build out first after the foundational ones (like GitHub).
*   [ ] By focusing on Markdown and structured JSON/CSV for your core outputs (as planned for Paralysis documents), and building a solid API, you'll be in a very good position for future portability and integrations without boxing yourself in now. The GitHub integration itself will teach you a lot about the patterns needed for other tools.
