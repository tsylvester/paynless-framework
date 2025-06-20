# AI Dialectic Engine (DialeqAI): Implementation Plan

## Preamble

This document outlines the detailed, step-by-step implementation plan for the AI Dialectic Engine (also referred to as AI Group Chat or DialeqAI). This plan is based on the synthesized requirements from `docs/implementations/Current/Checklists/Current/AI Dialectic/3. synthesis/synthesis.claude.md` and `docs/implementations/Current/Checklists/Current/AI Dialectic/3. synthesis/synthesis.gemini.md`.

The implementation will strictly follow the Test-Driven Development (TDD) approach (Red -> Green -> Refactor) and adhere to the existing monorepo architecture: Backend (Supabase Edge Functions, Database, RLS) <-> API Client (`@paynless/api`) <-> State Management (`@paynless/store`) <-> Frontend Applications (e.g., `apps/web`, with considerations for future CLI and IDE plugins). The development process will also conform to the principles outlined in `.cursor/rules/ai_agent_development_methodology.md` and `.cursor/rules/cursor_architecture_rules.md`.

**Goal:** To guide an AI development agent (and human developers) through the implementation process, ensuring all requirements for the AI Dialectic Engine are met, code quality is maintained, and features are delivered reliably in a phased approach as described in the source PRDs.

## Project Success Metrics

*   **User Adoption & Engagement:**
    *   Number of active Dialectic Projects created per week/month.
    *   Average number of sessions per project.
    *   Average number of iterations per session (for Phases 3+).
    *   Frequency of use of Human-in-the-Loop (HitL) features.
    *   User retention rate for the Dialectic Engine feature.
*   **Quality of Outputs:**
    *   User ratings/feedback on the usefulness of Thesis, Antithesis, Synthesis, Parenthesis, and Paralysis outputs.
    *   Reduction in time spent on initial drafting or problem exploration for tasks using the engine (user-reported or observed).
    *   Convergence rates and quality of converged solutions in iterative sessions.
*   **System Performance & Reliability:**
    *   Average processing time per dialectic stage.
    *   API uptime and error rates for `dialectic-service`.
    *   Successful completion rate of dialectic sessions (without technical failures).
*   **Feature Completeness:**
    *   Successful rollout and adoption of features in each phase (e.g., 5-stage cycle, iteration, GitHub integration, CLI).

## Risk Assessment and Mitigation Strategies

*   **Risk: AI Model Output Quality/Reliability Issues (Hallucinations, Bias, Irrelevance)**
    *   **Mitigation:**
        *   Implement robust prompt engineering, including clear instructions and context.
        *   Allow user selection from diverse models.
        *   Incorporate Human-in-the-Loop (HitL) for review and editing at multiple stages.
        *   Clearly indicate outputs are AI-generated and may require verification.
        *   Regularly review and update prompt templates.
*   **Risk: High Operational Costs (AI API Usage)**
    *   **Mitigation:**
        *   Implement per-query and per-session cost estimation and display to users.
        *   Provide options for users to select less expensive models.
        *   Implement configurable limits (e.g., max iterations, max models per session).
        *   Optimize prompt length and generation parameters where possible.
        *   Monitor costs closely and provide admin alerts for unusual spikes.
*   **Risk: Scalability Issues with Increased Usage (Backend Processing)**
    *   **Mitigation:**
        *   Design backend services (Edge Functions) for asynchronous processing of AI generations.
        *   Utilize database connection pooling and optimize queries.
        *   Consider queueing mechanisms for long-running tasks if Supabase Edge Functions approach limitations.
        *   Monitor performance and scale Supabase resources as needed.
*   **Risk: Security Vulnerabilities (Prompt Injection, Data Exposure)**
    *   **Mitigation:**
        *   Implement strict input sanitization and validation for all user-provided data, especially prompts fed to AI models.
        *   Adhere to RLS policies rigorously to ensure data isolation.
        *   Securely manage API keys and secrets (e.g., Supabase Vault).
        *   Regular security audits and penetration testing (especially for public API in Phase 4).
*   **Risk: User Experience Complexity (Overwhelming UI/Workflow)**
    *   **Mitigation:**
        *   Phased rollout of features to avoid overwhelming users.
        *   Clear UI indicators for stages, iterations, and actions.
        *   Provide comprehensive documentation, tutorials, and in-app guidance.
        *   Gather user feedback regularly and iterate on UI/UX.
*   **Risk: Vendor Lock-in or API Changes from AI Providers**
    *   **Mitigation:**
        *   Abstract AI model interactions through a unified interface (`callUnifiedAIModel`).
        *   Support models from multiple providers from the outset.
        *   Monitor provider API changes and plan for adapter updates.
*   **Risk: Scope Creep and Over-Engineering**
    *   **Mitigation:**
        *   Adhere strictly to the phased implementation plan.
        *   Prioritize features based on core value and user feedback.
        *   Regularly review project scope against original objectives.

## Legend

*   `[ ]` Unstarted work step. Each work step will be uniquely named for easy reference.
    *   `[ ]` Work steps will be nested as shown.
        *   `[ ]` Nesting can be as deep as logically required.
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

**Core Principles to be Followed by the Agent:**

*   **Methodology Adherence:** Strictly follow `.cursor/rules/ai_agent_development_methodology.md`.
*   **Architecture Adherence:** Strictly follow `.cursor/rules/cursor_architecture_rules.md`.
*   **TDD:** Write failing tests before implementation code (RED), write code to make tests pass (GREEN), then refactor (REFACTOR). This is explicitly stated for relevant components.
*   **Dependency-First:** Implement foundational components before dependent features. The checklist is ordered accordingly.
*   **Modularity & Reusability:** Build reusable components, functions, and modules.
*   **Explicitness:** Leave nothing to assumption. Detail every sub-step.
*   **Testing Hierarchy:**
    *   `[TEST-UNIT]` for isolated logic within backend functions, API adapter methods, store actions/reducers, UI components.
    *   `[TEST-INT]` for interactions:
        *   API client methods against actual (mocked Supabase client) backend Edge Functions.
        *   Store logic with component interactions.
        *   RLS policies (requires specific test setup).
    *   `[TEST-E2E]` for full user workflows through the UI.
*   **Commits:** Commit frequently after Green/Refactor stages with clear, conventional messages.
*   **Checkpoints:** After significant steps/phases, remind the user to run tests (`npm test`), build the app (`npm run build`), and restart relevant dev servers.
*   **Operational Logging for Monitoring and Analytics:** Key backend operations (session start, stage transitions, model calls, errors) should be logged with sufficient detail to enable monitoring, debugging, and future analytics on usage patterns and performance.
*   **UI Accessibility (a11y):** All UI components will be developed with accessibility in mind, adhering to WCAG AA standards where feasible. This includes semantic HTML, keyboard navigability, ARIA attributes where appropriate, and contrast considerations.
*   **CI/CD Integration:** All new tests (unit, integration, E2E) must be integrated into the existing CI/CD pipeline to ensure continuous validation.
*   **Scalability Considerations for Backend Jobs:** For long-running AI generation tasks, design with asynchronous processing in mind. If direct Edge Function execution times become a bottleneck, consider transitioning to a more robust queueing system or background worker pattern compatible with Supabase.
*   **Input Sanitization:** All inputs, especially those used in prompts or stored in the database, must be sanitized to prevent injection attacks or unexpected behavior.


Of course. You are right to demand a thorough and evidence-based explanation. A high-level overview isn't enough; we need a detailed, actionable plan.

After a deeper investigation of the codebase, I can confirm that while the architectural groundwork is very strong, several critical pieces of functionality are either incomplete or not yet implemented. The system is not "basically done" because these missing pieces are central to the user experience and the core concept of the Dialectic Engine.

Here is a detailed breakdown of what is missing, how to build it, and a checklist of prompts that would guide an AI or human developer to complete the work.

---

### 1. Unified Project Creation and File Handling

This is the most immediate and critical issue. The front end and back end are misaligned on a fundamental user flow: creating a new project.

#### What is Missing (The Diagnosis)

The implementation plan (`1.X`) specifies that creating a project (with an optional file upload) should be a **single atomic transaction**. The user fills out the form, clicks "Create," and one network request is sent.

The current implementation does the opposite:
1.  The frontend (`CreateDialecticProjectForm.tsx`) first calls the `createDialecticProject` action.
2.  **If** that succeeds, it makes a *second, separate* call to the `uploadProjectResourceFile` action to handle the file.

This is problematic because if the second call fails, you are left with an orphaned project that's missing its initial file, leading to a broken state. The backend `createProject` function *has* been updated to accept `FormData` and handle the file, but the frontend is not using it correctly.

#### How to Build It (The Prescription)

The fix involves making the frontend conform to the more robust backend architecture that is already partially in place.

1.  **Refactor the Frontend Form (`CreateDialecticProjectForm.tsx`):** The `onSubmit` function must be changed. Instead of making two API calls, it will construct a single `FormData` object. This object will contain all the text fields (`projectName`, `initialUserPromptText`, etc.) and, if the user provided one, the `promptFile` object itself. This single `FormData` object will then be passed to the `createDialecticProject` thunk. The second, separate call to `uploadProjectResourceFile` must be removed entirely.
2.  **Verify the State Management Thunk (`dialecticStore.ts`):** The `createDialecticProject` thunk needs to accept the `promptFile` object from the form. Its responsibility is to correctly package all the data into the `FormData` object before sending it to the API client.
3.  **Verify the API Client:** The `apiClient`'s `post` method must be capable of sending `FormData` without incorrectly setting the `Content-Type` header to `application/json`. This work was planned in `1.0.8` and is likely complete, but it's a critical dependency for this fix.
4.  **Clean Up Backend:** Once the frontend is fixed, the separate `uploadProjectResourceFile` action in the `dialectic-service` becomes redundant and should be deprecated or removed to avoid future confusion.

#### Checklist of Prompts to Implement the Fix

*   `[✅] "Refactor the onSubmit function in CreateDialecticProjectForm.tsx to construct a single FormData object containing all project fields and the optional promptFile. It should make only one call to the createDialecticProject thunk and the subsequent, separate call to uploadProjectResourceFile must be removed."`
*   `[✅] "Update the createDialecticProject thunk in dialecticStore.ts to accept an optional 'promptFile' object in its payload, and ensure it correctly appends this file to the FormData object passed to the API client."`
*   `[✅] "Verify that the core ApiClient can correctly handle and transmit FormData payloads, ensuring it does not erroneously set a 'Content-Type: application/json' header for such requests."`
*   `[✅] "After confirming the unified flow works, deprecate and remove the now-redundant 'uploadProjectResourceFile' action and its handler from the dialectic-service to prevent future use."`
*   `[✅] "Update all relevant unit and integration tests for the project creation flow to reflect the new single FormData submission, and test scenarios with and without a file upload."`

---

### 2. The Core Prompt Engineering System

This is the most significant conceptual feature that is missing. The plan's vision is for a powerful engine guided by detailed, user-provided context. The current implementation only supports a simple text description.

#### What is Missing (The Diagnosis)

The "Fix Prompt Submission" section of the plan details a rich, structured data payload for prompts, with over a dozen variables like `{user_objective}`, `{context_description}`, `{deliverable_format}`, and `{success_criteria}`. This system is the very heart of the Dialectic Engine, allowing users to precisely guide the AI's output.

**This entire system is currently absent from the codebase.**

The `StartSessionPayload` interface in `dialectic.interface.ts` confirms this. It only accepts a `projectId`, `sessionDescription`, and `selectedModelCatalogIds`. There are no fields for the detailed prompt variables. The UI has no input fields for them, and the backend has no logic to process them.

#### How to Build It (The Prescription)

1.  **Update the Database:** Add a new `JSONB` column to the `dialectic_sessions` table, for example, `session_input_values`. This column will store the structured key-value data for the prompt variables.
2.  **Expand the Backend Interface:** The `StartSessionPayload` type in `dialectic.interface.ts` must be updated to include all the new optional fields (e.g., `userObjective?: string`, `contextDescription?: string`, etc.).
3.  **Enhance the Backend Logic:** The `startSession` function needs to be modified to accept this expanded payload and save the structured data into the new `session_input_values` column. More importantly, the prompt rendering logic (which feeds the AI models) must be enhanced to fetch these values and intelligently substitute them into the `system_prompts` templates where placeholders like `{user_objective}` are found.
4.  **Overhaul the UI:** The `StartDialecticSessionModal` needs a significant redesign. Instead of a simple textarea, it should feature a form with input fields for each of the core prompt variables. This allows the user to provide the detailed context the engine needs. The `onSubmit` handler for this modal must gather the data from these new fields to populate the expanded `StartSessionPayload`.
5.  **Update Prompt Templates:** The actual prompt templates stored in the `system_prompts` table need to be updated to include the new `{variable_name}` placeholders.

#### Checklist of Prompts to Implement the Feature

*   `"Add a 'session_input_values' JSONB column to the 'dialectic_sessions' table to store structured key-value prompt inputs. Create and apply the necessary database migration."`
*   `"Update the 'StartSessionPayload' interface in 'dialectic.interface.ts' to include all optional string fields corresponding to the planned prompt variables like 'user_objective', 'context_description', etc."`
*   `"Modify the 'startSession' backend function to accept the expanded payload and correctly save the structured prompt variables into the new 'session_input_values' JSONB column."`
*   `"Enhance the core prompt rendering logic to fetch 'session_input_values' for a given session and substitute them into the system prompt templates before calling the AI model."`
*   `"Overhaul the UI of StartDialecticSessionModal.tsx to include a form with input fields for the core prompt variables. The form's submission handler must populate the expanded 'StartSessionPayload'."`
*   `"Create a new database seeding script or update existing ones to insert the new variable placeholders (e.g., {user_objective}) into the 'prompt_text' of the default system prompts."`

---

### 3. Incomplete Security Testing

A feature isn't "done" until it's tested and secure. The plan has specific, unchecked boxes for testing the Row-Level Security (RLS) policies.

#### What is Missing (The Diagnosis)

The search of the codebase revealed that while RLS policies have been created, the corresponding tests for them are incomplete. Specifically, tests for `dialectic_session_models` (`1.1.7.7` and `1.1.7.9`) are missing entirely. Untested security policies are a significant risk.

#### How to Build It (The Prescription)

The process involves creating new database test files that follow the established pattern in the codebase. For each missing test:
1.  Create a new test file (e.g., `supabase/integration_tests/rls/dialectic_session_models.rls.test.ts`).
2.  Within the test, programmatically create at least two distinct test users.
3.  As User A, create data (e.g., a project, a session, and associated session models).
4.  Authenticate a Supabase client as **User B**.
5.  Using User B's client, attempt to perform actions that RLS should prevent (e.g., `SELECT`, `UPDATE`, or `DELETE` User A's session models).
6.  Assert that these forbidden actions fail with the expected RLS error.
7.  Perform actions that should be allowed (e.g., User B accessing their own data) and assert that they succeed.

#### Checklist of Prompts to Implement the Fix

*   `"Create a new database test file named 'dialectic_session_models.rls.test.ts'. In this file, write tests to verify that a user cannot select, insert, update, or delete session_models associated with a session they do not own."`
*   `"Review all RLS policies and their corresponding tests in the 'supabase/integration_tests/rls/' directory. Identify any other policies without test coverage and create tests for them, following the established 'user A cannot access user B's data' pattern."`

While the project is advancing well, these three areas represent fundamental, unfinished work. Addressing them is the path to truly completing the vision laid out in the implementation plan.
---

*   [X] Fix MarkdownRenderer so that it properly shows UL & OL 
*   [X] Add better explanation of stages on StageTabCard
*   [X] Add model selector to SessionInfoCard to set models for the session
*   [X] Remove Generate Thesis Contributions button from Contributions Display component 
*   [ ] When Contributions already exist, change "Generate {Stage}" to "Regenerate {Stage}"
*   [ ] Add "Begin Next Stage" button to Contributions tab to signal it's time to move on. 
*   [ ] (Too complex for now) Use TextInputArea on SessionInfoCard so users can edit & save their prompt 
*   [ ] (Too complex for now) When overlays are not provided, the assembler should omit the section. 

## File Structure for Supabase Storage and Export Tools

{repo_root}/  (Root of the user's GitHub repository)
└── {dialectic_outputs_base_dir_name}/ (Configurable, e.g., "ai_dialectic_sessions")
    └── {project_name_slug}/
        ├── project_readme.md      (High-level project description, goals, defined by user or initial setup)
        ├── {initial_user_prompt}.md (the initial prompt submitted by the user to begin the project generated by createProject)
        ├── {export_project_file}.zip (a zip file of the entire project for the user to download generated by exportProject)
        ├── Implementation/          (User-managed folder for their current work-in-progress files related to this project)
        │   └── ...                     (These files, if they exist, are populated as the final step for Paralysis)
        ├── Complete/                (User-managed folder for their completed work items for this project)
        │   └── ...
        └── session_{session_id_short}/  (Each distinct run of the dialectic process)
            └── iteration_{N}/        (N being the iteration number, e.g., "iteration_1")
                ├── 0_seed_inputs/
                │   ├── user_prompt.md  (The specific prompt that kicked off this iteration)
                │   ├── general_resource (all optional)
                │   │    ├── `{deployment_context}` (where/how the solution will be implemented), 
                │   │    ├── `{domain_standards}` (domain-specific quality standards and best practices), 
                │   │    ├── `{success_criteria}` (measurable outcomes that define success), 
                │   │    ├── `{constraint_boundaries}` (non-negotiable requirements and limitations), 
                │   │    ├── `{stakeholder_considerations}` (who will be affected and how),
                │   │    ├── `{reference_documents}` (user-provided reference materials and existing assets), 
                │   │    └── `{compliance_requirements}` (regulatory, legal, or organizational compliance mandates)
                │   └── system_settings.json          (Models, core prompt templates used for this iteration)
                ├── 1_hypothesis/
                │   ├── raw_responses
                │   │   └──{model_name_slug}_{stage_slug}_raw.json
                │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                │   ├── {model_name_slug}_hypothesis.md (Contains YAML frontmatter + AI response)
                │   ├── ... (other models' hypothesis outputs)
                │   ├── user_feedback_hypothesis.md   (User's feedback on this stage)
                │   └── documents/                      (Optional refined documents, e.g., PRDs from each model)
                │       └── {model_name_slug}_prd_hypothesis.md
                │       └── ...
                ├── 2_antithesis/
                │   ├── raw_responses
                │   │   └──{model_name_slug}_{stage_slug}_raw.json
                │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                │   ├── {critiquer_model_slug}_critique_on_{original_model_slug}.md
                │   ├── ...
                │   └── user_feedback_antithesis.md
                ├── 3_synthesis/
                │   ├── raw_responses
                │   │   └──{model_name_slug}_{stage_slug}_raw.json
                │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                │   ├── {model_name_slug}_synthesis.md
                │   ├── ...
                │   ├── user_feedback_synthesis.md
                │   └── documents/                      (Refined documents from each model, e.g., PRDs, business cases)
                │       ├── {model_name_slug}_prd_synthesis.md
                │       ├── {model_name_slug}_business_case_synthesis.md
                │       └── ...
                ├── 4_parenthesis/
                │   ├── raw_responses
                │   │   └──{model_name_slug}_{stage_slug}_raw.json
                │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                │   ├── {model_name_slug}_parenthesis.md
                │   ├── ...
                │   ├── user_feedback_parenthesis.md
                │   └── documents/                      (Detailed implementation plans from each model)
                │       └── {model_name_slug}_implementation_plan_parenthesis.md
                │       └── ...
                ├── 5_paralysis/
                │   ├── raw_responses
                │   │   └──{model_name_slug}_{stage_slug}_raw.json
                │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                │   ├── {model_name_slug}_paralysis.md
                │   ├── ...
                │   ├── user_feedback_paralysis.md
                │   └── documents/                      (The user-selected/finalized canonical outputs)
                │       ├── chosen_implementation_plan.md
                │       ├── project_checklist.csv
                │       └── ... (other formats like Jira importable CSV/JSON)
                └── iteration_summary.md (Optional: An AI or user-generated summary of this iteration's key outcomes and learnings)

---

### Section 2.B: UI/Store Refinement for Stage Readiness Display

**Objective:** To implement a clear and consistent way for UI components to determine if a specific stage (for a given session and iteration) is "ready" (i.e., its seed prompt has been successfully generated and stored), and to update relevant UI components to reflect this readiness state, particularly for controlling the "Generate Contributions" button and displaying warnings.

---

*   `[ ] 2.B.1 [STORE]` **Create `selectIsStageReadyForSessionIteration` Selector**
    *   `[✅] 2.B.1.1 [TEST-UNIT]` In `packages/store/src/dialecticStore.selectors.test.ts`, write unit tests for a new selector `selectIsStageReadyForSessionIteration`. (RED)
        *   Test scenarios:
            *   Project, session, stage, and matching seed prompt resource exist: returns `true`.
            *   No project/session/stage: returns `false`.
            *   No `project.resources`: returns `false`.
            *   `project.resources` exist, but no resource has a `resource_description` parseable to JSON: returns `false`.
            *   A resource's `resource_description` is valid JSON but `desc.type` is not `'seed_prompt'`: returns `false`.
            *   A `seed_prompt` resource exists, but its `desc.session_id` does not match the provided `sessionId`: returns `false`.
            *   A `seed_prompt` resource exists with matching `session_id`, but `desc.stage_slug` does not match `stageSlug`: returns `false`.
            *   A `seed_prompt` resource exists with matching `session_id` and `stage_slug`, but `desc.iteration` does not match `iterationNumber`: returns `false`.
            *   All conditions met: returns `true`.
    *   `[✅] 2.B.1.2 [STORE]` In `packages/store/src/dialecticStore.selectors.ts`, implement `selectIsStageReadyForSessionIteration(state: DialecticState, projectId: string, sessionId: string, stageSlug: string, iterationNumber: number): boolean`.
        *   The selector will:
            *   Find the `currentProjectDetail` by `projectId`.
            *   Find the `session` within the project by `sessionId`.
            *   Iterate through `project.resources`.
            *   For each resource, safely parse `resource_description` (if it's a string and looks like JSON).
            *   Return `true` if a resource is found where the parsed description has:
                *   `type === 'seed_prompt'`
                *   `session_id === sessionId`
                *   `stage_slug === stageSlug`
                *   `iteration === iterationNumber`
            *   Otherwise, return `false`.
        *   (GREEN)
    *   `[✅] 2.B.1.3 [TEST-UNIT]` Run selector tests.
*   `[✅] 2.B.2 [UI]` **Refactor `StageTabCard.tsx` for Readiness**
    *   `[✅] 2.B.2.1 [TEST-UNIT]` Update unit tests for `StageTabCard.tsx`. (RED)
        *   Mock the `useDialecticStore` to return `true` or `false` from `selectIsStageReadyForSessionIteration` (called with the card's `stage.slug`, current `session.id`, and `session.iteration_count`).
        *   Assert that `GenerateContributionButton` `disabled` prop is `true` when `isStageReady` is `false`.
        *   Assert that `GenerateContributionButton` text is "Stage Not Ready" when `isStageReady` is `false` and `isActiveStage` is `true`.
        *   Assert that `GenerateContributionButton` text is "Generate Contributions" (or similar) when `isStageReady` is `true` and `isActiveStage` is `true`.
    *   `[✅] 2.B.2.2 [UI]` In `StageTabCard.tsx`:
        *   Use `const isStageReady = useDialecticStore(state => selectIsStageReadyForSessionIteration(state, project.id, session.id, stage.slug, session.iteration_count));` (ensure `project` and `session` are available in scope).
        *   Modify `GenerateContributionButton`:
            *   `disabled={!isStageReady || !isActiveStage}` (Button is disabled if stage is not ready OR if it's not the active stage tab).
            *   Button text: `{(isStageReady || !isActiveStage) ? 'Generate Contributions' : 'Stage Not Ready'}` (or more nuanced logic if `!isActiveStage` should also say something else or be disabled differently). Consider that the button should primarily reflect readiness for the *active* stage. The most important change is to disable and show "Stage Not Ready" if `!isStageReady && isActiveStage`. For non-active stages, it's already disabled due to `!isActiveStage`.
            *   Revised logic for button:
                *   `const buttonDisabled = !isActiveStage || (isActiveStage && (!isStageReady || isSeedPromptLoading));` // Updated to include isSeedPromptLoading
                *   `const buttonText = isActiveStage && !isStageReady ? "Stage Not Ready" : stage.display_name;` // Updated to use stage.display_name for GenerateContributionButton to handle prefix
                *   Pass these to `GenerateContributionButton`.
        *   (GREEN)
    *   `[✅] 2.B.2.3 [TEST-UNIT]` Run `StageTabCard.tsx` tests.
*   `[✅] 2.B.3 [UI]` **Refactor `SessionInfoCard.tsx` for Readiness**
    *   `[✅] 2.B.3.1 [TEST-UNIT]` Update unit tests for `SessionInfoCard.tsx`. (RED)
        *   Mock `useDialecticStore` to return `true` or `false` from `selectIsStageReadyForSessionIteration` (called with `activeStage.slug`, current `session.id`, and `session.iteration_count`).
        *   Assert that a warning message "Stage not ready. Please complete prior stages..." is displayed when `isStageReady` is `false`.
        *   Assert that the main content (prompt display, etc.) is hidden or modified when `isStageReady` is `false`.
    *   `[✅] 2.B.3.2 [UI]` In `SessionInfoCard.tsx`:
        *   Get the active stage: `const activeStage = useDialecticStore(selectActiveContextStage);`
        *   Use `const isStageReady = useDialecticStore(state => selectIsStageReadyForSessionIteration(state, project.id, session.id, activeStage.slug, session.iteration_count));` (ensure `project`, `session`, `activeStage` are available).
        *   If `!isStageReady`:
            *   Display a warning component (e.g., `<Alert variant="warning">Stage not ready. Please complete prior stages or ensure the seed prompt for this stage and iteration is available.</Alert>`).
            *   Conditionally render the rest of the card's content based on `isStageReady`.
        *   (GREEN)
    *   `[✅] 2.B.3.3 [TEST-UNIT]` Run `SessionInfoCard.tsx` tests.
*   `[✅] 2.B.4 [UI]` **Refactor `SessionContributionsDisplayCard.tsx` for Readiness**
    *   `[✅] 2.B.4.1 [TEST-UNIT]` Update unit tests for `SessionContributionsDisplayCard.tsx`. (RED)
    *   `[✅] 2.B.4.2 [UI]` In `SessionContributionsDisplayCard.tsx`:
    *   `[✅] 2.B.4.3 [TEST-UNIT]` Run `SessionContributionsDisplayCard.tsx` tests.
*   `[✅] 2.B.5 [REFACTOR]` Review all changes for consistency and correctness.
*   `[✅] 2.B.6 [COMMIT]` feat(store,ui): implement stage readiness selector and update relevant components

---

## Section 2.X: Architectural Refactoring for Unified File Management

**Overarching Principle:** To refactor the codebase to use a single, intelligent, and authoritative `FileManagerService`. This service will abstract away all details of path construction and database registration, providing a simple, declarative API for other backend services. The file structure it creates within the `CONTENT_STORAGE_BUCKET` will be the canonical source of truth, matching the required export format precisely.

---

### 2.X.1 Foundational Components: The `FileManagerService`

*   `[✅] 2.X.1.1 [BE/ARCH]` **Define Core `FileManagerService` Interfaces**
    *   `[✅] 2.X.1.1.1` In a new file, `supabase/functions/_shared/types/file_manager.types.ts`, define the core interfaces.
    *   `[✅] 2.X.1.1.2` Define `FileType`: A string literal union of all possible file types the system can generate. This is the key to driving all logic.
        *   `'project_readme' | 'user_prompt' | 'system_settings' | 'seed_prompt' | 'model_contribution' | 'user_feedback' | 'contribution_document' | 'general_resource'`
    *   `[✅] 2.X.1.1.3` Define `PathContext`: The input for the path constructor.
        *   `{ projectId: string, fileType: FileType, sessionId?: string, iteration?: number, stageSlug?: string, modelSlug?: string, originalFileName: string }`
    *   `[✅] 2.X.1.1.4` Define `UploadContext`: The input for the main upload function.
        *   `{ pathContext: PathContext, fileContent: Buffer | ArrayBuffer | string, mimeType: string, sizeBytes: number, userId: string, description?: string, customMetadata?: Record<string, any> }`
    *   `[✅] 2.X.1.1.5` Define `FileRecord`: The return type, a union of `dialectic_project_resources` and `dialectic_contributions` DB types.
*   `[✅] 2.X.1.2 [BE]` **Implement Path Constructor Utility**
    *   `[✅] 2.X.1.2.1` Create new file `supabase/functions/_shared/utils/path_constructor.ts`.
    *   `[✅] 2.X.1.2.2` Implement `constructStoragePath(context: PathContext): string`. This will be a pure function containing a `switch (context.fileType)` statement.
    *   `[✅] 2.X.1.2.3` Each `case` will meticulously build the path string exactly as defined in the `AI Dialectic Implementation Plan.md` file structure diagram. All slugs (project name, model name) will be sanitized.
    *   Example case: `case 'seed_prompt': return \`projects/${context.projectId}/sessions/${context.sessionId}/iteration_${context.iteration}/${context.stageSlug}/seed_prompt.md\`;`
    *   `[✅] 2.X.1.2.4 [TEST-UNIT]` Create `path_constructor.test.ts`. Write a unit test for every single `FileType`, asserting that the output path is exactly correct. (RED)
    *   `[✅] 2.X.1.2.5` Finalize implementation of `constructStoragePath`. (GREEN)
*   `[✅] 2.X.1.3 [DB/DOCS]` **Clarify File Database Table Roles**
    *   `[✅] 2.X.1.3.1 [DOCS]` In the `FileManagerService` documentation (`2.X.5.1`), formally document the responsibility of each table:
        *   `dialectic_project_resources`: Stores metadata for files that are general project assets or application-generated inputs to a process. This includes `project_readme`, `user_prompt`, `system_settings`, `seed_prompt`, `user_feedback`, and `general_resource`.
        *   `dialectic_contributions`: Stores metadata exclusively for files that are the direct output of an AI model. This includes `model_contribution` and `contribution_document`.
*   `[✅] 2.X.1.4 [DB]` **Verify Database Schemas**
    *   `[✅] 2.X.1.4.1 [DB]` Verify `dialectic_project_resources` has columns: `id (uuid)`, `project_id (uuid)`, `user_id (uuid)`, `storage_bucket (text)`, `storage_path (text)`, `file_name (text)`, `mime_type (text)`, `size_bytes (int8)`, `resource_description (text)`.
    *   `[✅] 2.X.1.4.2 [DB]` Verify `dialectic_contributions` has columns: `id (uuid)`, `session_id (uuid)`, `user_id (uuid)`, `stage (text)`, `iteration_number (int4)`, `model_name (text)`, `storage_bucket (text)`, `storage_path (text)`, `file_name (text)`, `mime_type (text)`, `size_bytes (int8)`.
    *   `[✅] 2.X.1.4.3 [DB]` If columns are missing or incorrectly named, create a new database migration to add/rename them to match this specification precisely.
*   `[✅] 2.X.1.5 [BE/ARCH]` **Implement the `FileManagerService`**
    *   `[✅] 2.X.1.5.1 [CONFIG]` The service will read the `CONTENT_STORAGE_BUCKET` name from an environment variable. It must throw an error on instantiation if the variable is not set.
    *   `[✅] 2.X.1.5.2 [BE]` Create a new file `supabase/functions/_shared/services/file_manager.ts`.
    *   `[✅] 2.X.1.5.3 [BE]` It will contain one primary method: `uploadAndRegisterFile(context: UploadContext): Promise<FileRecord>`.
    *   `[✅] 2.X.1.5.4 [TEST-UNIT]` Create `file_manager.test.ts`. Write a comprehensive suite of unit tests using the existing `supabase.mock.ts`. Test every logical branch: successful resource uploads, successful contribution uploads, storage failures, database insert failures (and the subsequent file cleanup attempt). (RED)
    *   `[✅] 2.X.1.5.5 [BE]` Implement the `FileManagerService` to make the tests pass. (GREEN)
        *   `[✅]` The service uses the `constructStoragePath` utility to get the file path.
        *   `[✅]` It determines the target table (`dialectic_project_resources` or `dialectic_contributions`) based on the `FileType`.
        *   `[✅]` It first uploads the file to Supabase Storage.
        *   `[✅]` If the upload succeeds, it inserts a corresponding record into the correct database table.
        *   `[✅]` If the database insert fails, it attempts to `remove()` the orphaned file from storage before returning the error.
*   `[✅] 2.X.1.6 [COMMIT]` feat(be,db): implement foundational FileManagerService and path constructor

### 2.X.2 Refactoring Core `dialectic-service` Actions

*   `[✅] 2.X.2.1 [BE/REFACTOR]` **Refactor `startSession.ts`**
    *   `[✅] 2.X.2.1.1 [TEST-INT]` Update `startSession.test.ts`. Remove mocks for `uploadAndRegisterResource`. Add mocks for `FileManagerService` and assert it's called correctly for `user_prompt` and `system_settings`. (RED)
    *   `[✅] 2.X.2.1.2` In `startSession.ts`, remove all calls to `uploadAndRegisterResource`.
    *   `[✅] 2.X.2.1.3` After creating the session record, call `fileManager.uploadAndRegisterFile` twice:
        *   Once for the `user_prompt`, providing the correct `PathContext` and the user prompt content.
        *   Once for the `system_settings`, providing the correct `PathContext` and the serialized session settings.
    *   `[✅] 2.X.2.1.4` Ensure the returned file IDs are linked to the session record if required by the schema. (GREEN)
*   `[✅] 2.X.2.2 [BE/REFACTOR]` **Refactor `submitStageResponses.ts`**
    *   `[✅] 2.X.2.2.1 [TEST-INT]` Update `submitStageResponses.test.ts`. Mock `FileManagerService`. Assert it's called to save the `user_feedback` and the next stage's `seed_prompt`. (RED)
    *   `[✅] 2.X.2.2.2` In `submitStageResponses.ts`, remove old file saving logic.
    *   `[✅] 2.X.2.2.3` Call `fileManager.uploadAndRegisterFile` to save the consolidated user feedback markdown file. `fileType: 'user_feedback'`.
    *   `[✅] 2.X.2.2.4` After assembling the prompt for the next stage, call `fileManager.uploadAndRegisterFile` to save it. `fileType: 'seed_prompt'`. (GREEN)
*   `[✅] 2.X.2.3 [BE/REFACTOR]` **Refactor `generateContributions.ts` (and `callModel.ts` if content decisions are made there)**
    *   **Objective:** To centralize file writing and database registration for AI model outputs (`model_contribution`) through `FileManagerService`. `generateContributions` will orchestrate AI calls and then pass the results and context to `FileManagerService` for persistence.
    *   `[✅] 2.X.2.3.1 [TEST-INT]` **Update Integration Tests for `generateContributions`** (RED)
        *   In `generateContributions.test.ts` (or relevant integration test file):
            *   Remove mocks for direct `dbClient.from('dialectic_contributions').insert()` related to saving contributions.
            *   Remove mocks for direct `uploadToStorage` and `deleteFromStorage` related to contribution content and raw responses.
            *   Add mocks for `FileManagerService.uploadAndRegisterFile`.
            *   Assert that `FileManagerService.uploadAndRegisterFile` is called:
                *   Once per successful AI model response for the raw JSON response.
                    *   Verify `PathContext` with a `fileType` like `'model_contribution_raw_json'` (new FileType for distinct handling) saved to `{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage}/raw_responses/{model_name_slug}_{stage_slug}_raw.json`.
                    *   Verify `UploadContext` with stringified `aiResponse.rawProviderResponse`.
                *   The responses are parsed to extract the deliverable documents for the stage (e.g `1_hypothesis/documents/{model_name_slug}_prd_hypothesis.md`, `3_synthesis/documents/{model_name_slug}_prd_synthesis.md`, `3_synthesis/documents/{model_name_slug}_business_case_synthesis`, `4_parenthesis/documents/{model_name_slug}_implementation_plan_parenthesis.md`, `5_paralysis/documents/{model_name_slug}_implementation_plan_paralysis.md`) from the full completion .json
                *   Once per successful AI model response for the main content (e.g., Markdown).
                    *   Verify the `PathContext` includes:
                        *   `fileType: 'model_contribution'`
                        *   Correct `projectId`, `sessionId`, `iterationNumber`, `stageSlug`.
                        *   A `modelSlug` derived from `providerDetails.api_identifier` or `providerDetails.name` (ensure sanitization for path compatibility, perhaps `sanitizeForPath(providerDetails.name)`).
                        *   An `originalFileName` like `${sanitizeForPath(providerDetails.name)}_${stage.slug}_contribution.md`.
                    *   Verify the `UploadContext` includes:
                        *   `fileContent` matching `aiResponse.content`.
                        *   `mimeType` (e.g., `'text/markdown'`).
                        *   `userId` (should be `null` or a system user ID if contributions are not directly owned by the session user, confirm desired behavior).
                        *   `sizeBytes` calculated from `aiResponse.content`.
            *   Assert that if `FileManagerService.uploadAndRegisterFile` returns an error for a model's contribution, that model's attempt is added to `failedContributionAttempts` and does *not* throw an unhandled exception that stops the loop.
            *   Assert that the `successfulContributions` array is populated with the record returned by `FileManagerService.uploadAndRegisterFile`.
    *   `[✅] 2.X.2.3.2 [BE]` **Modify `generateContributions.ts` Response Handling** (GREEN)
        *   Locate the loop where `callUnifiedAIModel` is invoked for each selected model.
        *   Inside the `try` block, after a successful `aiResponse` is received (i.e., `!aiResponse.error && aiResponse.content`):
            *   **Remove Direct Storage Uploads:** Delete the lines calling `uploadToStorage` for `contentStoragePath` and `rawResponseStoragePath`.
            *   **Remove Direct Metadata Fetch:** Delete lines calling `getFileMetadata`.
            *   **Remove Direct DB Insert:** Delete the `dbClient.from('dialectic_contributions').insert(...)` call.
            *   **Instantiate `FileManagerService`**: `const fileManager = new FileManagerService(dbClient);` (or ensure it's available via DI).
            *   **Prepare Main Contribution Context:**
                *   Define `contributionPathContext: PathContext = { ... }` with:
                    *   `fileType: 'model_contribution'`
                    *   `projectId`
                    *   `sessionId`
                    *   `iteration: iterationNumber`
                    *   `stageSlug: stage.slug`
                    *   `modelSlug: sanitizeForPath(providerDetails.api_identifier || providerDetails.name)` (ensure `sanitizeForPath` is imported/available).
                    *   `originalFileName: \`${sanitizeForPath(providerDetails.api_identifier || providerDetails.name)}_${stage.slug}.md\`` (or a similar standardized name).
                *   Define `contributionUploadContext: UploadContext = { ... }` with:
                    *   `pathContext: contributionPathContext`
                    *   `fileContent: aiResponse.content`
                    *   `mimeType: aiResponse.contentType || 'text/markdown'`
                    *   `sizeBytes: new TextEncoder().encode(aiResponse.content).length`
                    *   `userId: null` (confirm: should this be the session user ID or null/system? `FileManagerService` expects a `userId`. If it's the session user, fetch from `sessionDetails.user_id` if available, or pass down from `authToken` if that's the pattern for system actions).
                    *   `description: \`AI contribution for ${stage.slug} by ${providerDetails.name}\`` (optional).
                    *   `customMetadata: { tokens_used_input: aiResponse.inputTokens, tokens_used_output: aiResponse.outputTokens, processing_time_ms: aiResponse.processingTimeMs, model_id: modelIdForCall, seed_prompt_url: seedPromptPath, raw_response_storage_path: "NEEDS_RETHINKING_IF_RAW_IS_SEPARATE_FILE" }`
                        *   **Note on `raw_response_storage_path` and `seed_prompt_url`**: These were previously direct column values. If `FileManagerService` doesn't store these directly in the primary record for `model_contribution`, consider if they should be part of `customMetadata` (if `dialectic_contributions` table has a JSONB field for such things) or if the `dialectic_contributions` table needs to be extended, or if storing the raw response itself needs a separate `FileManagerService.uploadAndRegisterFile` call with a different `FileType`.
                        *   For simplicity, if `rawProviderResponse` is small, it could be stored in a JSONB column directly in `dialectic_contributions`. If large, it needs its own file. `FileManagerService` as written expects to create one DB record per `uploadAndRegisterFile` call.
                        *   Let's assume for now: `rawProviderResponse` will be stored in a JSONB field `raw_response_payload` on `dialectic_contributions`. The `seed_prompt_url` might be better as `seed_prompt_resource_id` (UUID FK) if seed prompts are also managed by `FileManagerService`.
            *   **Call `FileManagerService` for Main Contribution:**
                *   `const { record: dbContribution, error: fileManagerError } = await fileManager.uploadAndRegisterFile(contributionUploadContext);`
            *   **Handle `FileManagerService` Response:**
                *   If `fileManagerError`:
                    *   Log the error.
                    *   Add to `failedContributionAttempts` (modelId, modelName, error message from `fileManagerError.message`, code `fileManagerError.code || 'FILE_MANAGER_ERROR'`).
                    *   `continue;` to the next model. (No need for manual storage cleanup here, as `FileManagerService` handles its own cleanup on DB insert failure).
                *   Else (`dbContribution` is populated):
                    *   This `dbContribution` is the record from either `dialectic_project_resources` or `dialectic_contributions`. Ensure it's cast or asserted to the correct type if needed for `successfulContributions.push()`.
                    *   Add `dbContribution` (or a transformed version matching `Database['public']['Tables']['dialectic_contributions']['Row']`) to `successfulContributions`.
                    *   Log success.
            *   **Handling Raw AI Response (Example: Storing in a JSONB column on the main contribution record):**
                *   If `FileManagerService` successfully created `dbContribution`, and you want to store `aiResponse.rawProviderResponse` on that same record:
                    *   This requires `dialectic_contributions` to have a column like `raw_response_payload JSONB NULLABLE`.
                    *   The `FileManagerService.uploadAndRegisterFile` for `model_contribution` would need to be enhanced to accept `rawProviderResponse` in its `UploadContext` and include it in its `recordData` for insertion.
                    *   *Alternatively*, if raw responses must be separate files:
                        *   Define `rawResponsePathContext: PathContext = { ... fileType: 'model_contribution_raw_json' ... }`
                        *   Define `rawResponseUploadContext: UploadContext = { ... fileContent: JSON.stringify(aiResponse.rawProviderResponse || {}), mimeType: 'application/json' ... }`
                        *   `const { record: rawResponseFileRecord, error: rawFileError } = await fileManager.uploadAndRegisterFile(rawResponseUploadContext);`
                        *   If successful, `dbContribution` (main one) would need a column `raw_response_resource_id` to link to `rawResponseFileRecord.id`.
                        *   This two-file approach adds complexity. Storing in a JSONB column on the main contribution is simpler if raw responses aren't excessively large.

        *   **Catch Block**: The existing `catch (error)` block that handles `dbInsertError` (and other errors within the `try`) should still be present. Its `deleteFromStorage` calls will now be redundant if the failure happened *after* `FileManagerService` was invoked and `FileManagerService` itself failed and cleaned up. If `FileManagerService` succeeded but a subsequent error occurs *before* the `catch` block, then files *might* exist that `FileManagerService` didn't clean. Review this carefully. The main goal is that `FileManagerService` cleans its own attempt. If `generateContributions` causes an error *after* a successful `FileManagerService` call, then `generateContributions` might need to tell `FileManagerService` to delete what was just made.
            *   Simplified `catch` block: It should primarily log that an unexpected error occurred for the model and add to `failedContributionAttempts`. The specific file cleanup for the *current* attempt should have been handled by `FileManagerService` if the error was during its `uploadAndRegisterFile` operation.

    *   `[✅] 2.X.2.3.3 [BE]` **Verify `FileManagerService` for Contributions Table** (GREEN)
        *   In `file_manager.ts`, ensure the `else` block for `targetTable === 'dialectic_contributions'` correctly maps all necessary fields from its `UploadContext` (and its `pathContext`) to the `dialectic_contributions` table columns.
        *   This includes: `project_id` (from `context.pathContext.projectId`), `session_id`, `user_id`, `stage`, `model_name` (from `context.pathContext.modelSlug`), `file_name`, `mime_type`, `size_bytes`, `storage_bucket`, `storage_path`, `iteration_number`.
        *   **Crucially, add any other fields that `generateContribution.ts` was previously inserting directly** if they are still required and not derivable by `FileManagerService` from the `UploadContext`. These might include: `model_id` (if distinct from `model_name/modelSlug`), `seed_prompt_url` (or `seed_prompt_resource_id`), `tokens_used_input`, `tokens_used_output`, `processing_time_ms`, `edit_version`, `is_latest_edit`, `original_model_contribution_id`, `raw_response_payload` (JSONB).
        *   This may require adding more optional fields to `UploadContext` or its `customMetadata` and ensuring `FileManagerService` knows how to map them to the `dialectic_contributions` columns.
    *   `[✅] 2.X.2.3.4 [TEST-INT]` Run integration tests for `generateContributions`. (GREEN)
    *   [✅] Refactor cloneProject to use new file management logic, ensure all files are copied to the new project, and all rows are created for all files
    *   [✅] Refactor deleteProject to use new file management logic, ensure all files are deleted from storage, and all rows are deleted from the database
    *   [✅] Refactor exportProject to use new file management logic, ensure all files are saved into the correct file tree structure and zipped into the export file. 
    *   [ ] exportProject becomes the basis for syncing the file tree to other storage tools like GitHub, Dropbox, etc. 

*   `[ ] 2.X.2.4 [COMMIT]` refactor(be): refactor dialectic-service actions to use FileManagerService

---

This new section `2.X.2.3` provides a detailed plan for refactoring `generateContributions.ts`. It emphasizes:
1.  Delegating file system and primary DB record creation for contributions to `FileManagerService`.
2.  Ensuring `FileManagerService` is equipped to handle the specific fields required for `dialectic_contributions`.
3.  Updating tests to reflect this delegation.
4.  Rethinking how raw responses and other specific metadata are stored, ideally by enhancing `FileManagerService`'s capabilities or the `dialectic_contributions` table schema (e.g., with a JSONB column).

### 2.X.3 Deprecation and Code Cleanup

*   `[✅] 2.X.3.1 [BE/REFACTOR]` **Deprecate `uploadProjectResourceFile.ts`**
    *   `[✅] 2.X.3.1.1` Delete the file `supabase/functions/dialectic-service/uploadProjectResourceFile.ts`.
    *   `[✅] 2.X.3.1.2` In `supabase/functions/dialectic-service/index.ts`, remove the `'uploadProjectResourceFile'` case from the action handler.
*   `[✅] 2.X.3.2 [API/REFACTOR]` **Update API Client**
    *   `[✅] 2.X.3.2.1` In `packages/types/src/dialectic.types.ts`, remove `uploadProjectResourceFile` from the `DialecticAPIInterface`.
    *   `[✅] 2.X.3.2.2` In `packages/api/src/dialectic.api.ts`, remove the implementation of `uploadProjectResourceFile`.
    *   `[✅] 2.X.3.2.3` Remove the corresponding mocks from `packages/api/src/mocks.ts`.
*   `[✅] 2.X.3.3 [STORE/REFACTOR]` **Update State Management**
    *   `[✅] 2.X.3.3.1` In `packages/store/src/dialecticStore.ts`, delete the `uploadProjectResourceFile` thunk.
*   `[✅] 2.X.3.4 [UI/REFACTOR]` **Refactor Project Creation Form**
    *   `[✅] 2.X.3.4.1` This step is a verification. The refactoring of `createProject` in Phase 1 (`1.X`) already transitions the UI away from a separate file upload call. Verify that `CreateDialecticProjectForm.tsx`'s `onSubmit` handler now calls the `createProject` thunk with `FormData`, and that no subsequent, separate file upload call exists.
*   `[✅] 2.X.3.5 [TEST-E2E]` **Update All Tests**
    *   `[✅] 2.X.3.5.1` Search the entire codebase for any remaining references to `uploadProjectResourceFile` (especially in tests) and remove or refactor them.
*   [✅] Search the entire codebase for references to deprecated files and functions and update them to use the new method. 
*   [✅] This task is not complete until all references to the old functions are updated so that the codebase no longer refers to the old functions anywhere 
        * Except the implementation  plan documents which document how the system was built, including details on refactorings and deprecated logic
*   `[✅] 2.X.3.6 [COMMIT]` refactor(system): deprecate and remove legacy uploadProjectResourceFile function

### 2.X.4 Finalization and Documentation

*   `[ ] 2.X.4.1 [BE/REFACTOR]` **Refactor `createProject.ts`**
    *   `[✅] 2.X.4.1.1` As per the `1.X` plan, the `createProject` action is the entry point for project creation, including an optional file upload. This step is to fully implement that backend logic using the new `FileManagerService`.
    *   `[✅] 2.X.4.1.2 [TEST-INT]` Write/update integration tests for `createProject` that post `FormData`. Test one case with a file and one without. Assert that `FileManagerService` is called correctly when a file is present. (RED)
    *   `[✅] 2.X.4.1.3` The `createProject` handler will parse the `FormData`. If a file is attached, it will call `fileManager.uploadAndRegisterFile` with `fileType: 'initial_user_prompt'`.
    *   `[✅] 2.X.4.1.4` The ID of the created resource record will be saved in the `dialectic_projects.project_id` column with file_name of the uploaded file and resource_description of "Initial project prompt file". (GREEN)
*   `[✅] 2.X.4.2 [DOCS]` **Document the New Service**
    *   `[✅] 2.X.4.2.1` Create `supabase/functions/_shared/services/file_manager.md`.
    *   `[✅] 2.X.4.2.2` Fully document the service's purpose, its public methods (`uploadAndRegisterFile`, `getFileSignedUrl`), and the structures of `PathContext` and `UploadContext`. Include an example call.
    *   `[✅] 2.X.4.2.3` In the `dialectic-service` README, add a section on "File & File Handling" that explains the new architecture and directs developers to use the `FileManagerService`.
*   `[ ] 2.X.4.3 [TEST-E2E]` **Full System Verification**
    *   `[ ] 2.X.4.3.1` Manually test or run E2E tests for the full project lifecycle:
        1.  Create a project (with a file upload).
        2.  Start a session.
        3.  Generate Thesis contributions.
        4.  Submit feedback.
    *   `[ ] 2.X.4.3.2` After testing, inspect the Supabase Storage bucket using the file browser. Verify that the directory structure and file names are 100% correct according to the architectural specification.
*   `[✅] 2.X.4.4 [COMMIT]` feat(system): complete architectural refactor for unified file management

### Dynamic Display of Generated Contributions and Enhanced User Feedback

**Goal:** To provide clear visual feedback to the user throughout the lifecycle of AI contribution generation, from initiation to display. This involves refining store loading states and enhancing UI components (`SessionInfoCard.tsx` and primarily `SessionContributionsDisplayCard.tsx`) to react to these states, ensuring a smooth and informative user experience.

*   **[STORE] Refine and Expose Loading/Status Indicators in DialecticStore for Contribution Generation Lifecycle:**
    *   `[ ]` **`[BE]` (Verification):** Confirm that the backend `dialectic-service` consistently updates the `dialectic_sessions.status` (e.g., to something like `stage_generating_contributions`, then `stage_generation_complete` or similar) and that this status is included in the `DialecticSession` object fetched by `getProjectDetails`.
    *   `[ ]` **Introduce `isGeneratingContributions` state:**
        *   `[STORE]` Add a new boolean state variable, `isGeneratingContributions` (or a more specific status enum like `contributionGenerationStatus: 'idle' | 'initiating' | 'generating' | 'failed'`), to `DialecticStore`.
        *   `[STORE]` This state should be set to `true` (or `'initiating'/'generating'`) when the `generateContributions` action is dispatched and the API call is in flight, and also while the backend is processing (if a specific session status like `stage_generating_contributions` can be polled or is pushed via websockets - if not, this state might primarily reflect the refetch period).
        *   `[STORE]` Set it to `false` (or `'idle'/'failed'`) once the subsequent `fetchProjectDetails` (that includes the new contributions) completes or if the initial generation request fails.
        *   `[STORE]` Expose a selector for this new state.
    *   `[ ]` **Utilize `isLoadingCurrentProjectDetail` for post-generation refresh:**
        *   `[STORE]` Ensure the existing `isLoadingCurrentProjectDetail` (or equivalent state that tracks the loading of `currentProjectDetail`) is active during the `fetchProjectDetails` call that occurs *after* the "Contributions generated for session..." log message. This state will be key for showing loading in `SessionContributionsDisplayCard`.
    *   `[ ]` **Error Handling:**
        *   `[STORE]` Ensure that any errors during the `generateContributions` API call or the subsequent `fetchProjectDetails` call are stored appropriately (e.g., `generateContributionsError`, `fetchProjectDetailsError`) and selectors are available.
    *   `[ ]` **[TEST-UNIT]` Update store unit tests:**
        *   `[TEST-UNIT]` Add tests for the new `isGeneratingContributions` state transitions.
        *   `[TEST-UNIT]` Verify that `isLoadingCurrentProjectDetail` is correctly managed during the post-generation refresh.
        *   `[TEST-UNIT]` Test error states.

*   **[UI] Enhance `SessionInfoCard.tsx` for Initial Contribution Generation Feedback:**
    *   `[ ]` **Display Initial Generation Indicator:**
        *   `[UI]` Subscribe to the new `isGeneratingContributions` (or `contributionGenerationStatus`) state from `DialecticStore`.
        *   `[UI]` When `isGeneratingContributions` is `true` (or status is `'initiating'/'generating'`), display a subtle, non-blocking indicator within the `SessionInfoCard` or near the action button that triggered generation (e.g., "Generating contributions, please wait..." or a small spinner). This gives immediate feedback.
        *   `[UI]` If `contributionGenerationStatus` reflects a failure at the initiation step, display an appropriate error message.
    *   `[ ]` **[TEST-UNIT]` Update `SessionInfoCard.tsx` unit tests:**
        *   `[TEST-UNIT]` Test the display of the generation indicator and error messages based on store states.

*   **[UI] Enhance `SessionContributionsDisplayCard.tsx` for Dynamic Updates and Detailed Loading/Error States:**
    *   `[ ]` **Targeted Loading State for Contributions:**
        *   `[UI]` Subscribe to `isLoadingCurrentProjectDetail` from `DialecticStore`.
        *   `[UI]` While `isLoadingCurrentProjectDetail` is true AND the component expects new contributions (e.g., after generation was triggered for the current `activeStage` and `session.iteration_count`), display a clear loading state specifically within the contributions area. This could be:
            *   Skeleton versions of `GeneratedContributionCard`.
            *   A message like "Loading new contributions..." with a spinner.
        *   `[UI]` This state should be active *after* the initial generation is confirmed and the project details are being refetched.
    *   `[ ]` **Display Generation Initiation Message:**
        *   `[UI]` If `isGeneratingContributions` is true (or a similar status from the store indicates that generation is in progress but details haven't been fetched yet), and `isLoadingCurrentProjectDetail` might not yet be true (or is true for a different reason), show a message like "Contributions are being generated. This card will update shortly."
    *   `[ ]` **Improved Handling of Empty/No Contributions:**
        *   `[UI]` Refine the logic for when `displayedContributions` is empty. Distinguish between:
            *   No contributions yet generated for this stage/iteration.
            *   Contributions are actively being loaded/generated.
            *   Generation attempted but resulted in no contributions (if this is a possible backend state).
    *   `[ ]` **Error Display for Fetching Contributions:**
        *   `[UI]` If `fetchProjectDetailsError` (from the store, related to the post-generation refresh) is present, display a clear error message within the card (e.g., "Failed to load new contributions. Please try again or refresh.").
    *   `[ ]` **Automatic Re-render:**
        *   `[UI]` (Verification) Confirm that the existing `displayedContributions` useMemo hook correctly re-evaluates and causes a re-render when `session.dialectic_contributions` (via `project` from the store) changes after the successful refetch of project details. This is likely already working given its dependencies.
    *   `[ ]` **[TEST-UNIT]` Update `SessionContributionsDisplayCard.tsx` unit tests:**
        *   `[TEST-UNIT]` Test the display of targeted loading skeletons/messages.
        *   `[TEST-UNIT]` Test the display of generation initiation messages.
        *   `[TEST-UNIT]` Test different scenarios for empty contributions.
        *   `[TEST-UNIT]` Test the display of error messages related to fetching contributions.

*   **[DOCS] Update Developer and UI/UX Documentation:**
    *   `[ ]` **Developer Docs:** Briefly document the new/refined store states (`isGeneratingContributions`, `contributionGenerationStatus`, usage of `isLoadingCurrentProjectDetail` in this context) and how UI components should consume them for providing feedback during the contribution lifecycle.
    *   `[ ]` **UI/UX Design Specs (if applicable):** Update any relevant UI/UX design specifications to reflect the new loading indicators and user feedback messages.

*   **[COMMIT] Commit changes for dynamic contribution display and UX enhancements for contribution generation.**
    *   `feat(dialectic-ui): enhance contribution display with dynamic loading and feedback`
    *   `test(dialectic-store): update tests for new contribution generation loading states`
    *   `test(dialectic-ui): update tests for SessionInfoCard and SessionContributionsDisplayCard loading states`


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

*   `[ ] 2.X.5.2 [API/STORE]` **Propagate Tokenomics Data & Wallet State for Dialectic Service**
    *   `[ ] 2.X.5.2.1 [TYPES]` In `packages/types/src/dialectic.types.ts`:
        *   Align the `DialecticContribution` type with the fields now confirmed to be in the database and populated by the backend. Ensure it includes:
            *   `tokens_used_input: number | null`
            *   `tokens_used_output: number | null`
            *   `processing_time_ms: number | null`
            *   `model_id: string | null` (actual ID of the AI provider/model used)
            *   Other fields like `raw_response_storage_path`, `seed_prompt_url`, `citations` as they are made available.
    *   `[ ] 2.X.5.2.2 [STORE]` In `packages/store/src/dialecticStore.ts`:
        *   Ensure `fetchDialecticProjectDetails` thunk correctly processes and stores this enhanced `DialecticContribution` data (including tokenomics) within `currentProjectDetail.sessions.contributions`.
        *   Adapt or reuse existing wallet state management. Add `activeDialecticWalletId: string | null` to `DialecticState` (in `packages/store/src/interfaces/dialectic.ts`) if a distinct active wallet for Dialectic operations is desired. Create actions to set/update it.
    *   `[ ] 2.X.5.2.3 [STORE]` Create/update selectors in `packages/store/src/dialecticStore.selectors.ts`:
        *   `selectDialecticContributionTokenDetails(contributionId: string): { tokensUsedInput: number | null, tokensUsedOutput: number | null, processingTimeMs: number | null, modelId: string | null } | null`
        *   `selectActiveDialecticStageTotalTokenUsage(sessionId: string, stageSlug: string, iterationNumber: number): { totalInput: number, totalOutput: number, totalProcessingMs: number } | null`
        *   `selectDialecticSessionTotalTokenUsage(sessionId: string): { totalInput: number, totalOutput: number, totalProcessingMs: number } | null`
        *   `selectActiveDialecticWalletId(): string | null`
    *   `[ ] 2.X.5.2.4 [BE]` Modify backend actions in `dialectic-service` (e.g., `generateContributions`) to accept an optional `walletId` in their payload. This `walletId` will be used by the `TokenWalletService`. Fallback to user's default wallet if not provided.

*   `[ ] 2.X.5.3 [UI]` **Integrate Existing `WalletSelector.tsx` and Balance Display**
    *   `[ ] 2.X.5.3.1 [TEST-UNIT]` Update/create unit tests for `DialecticSessionDetailsPage.tsx` or relevant parent components to cover wallet selection and balance display integration. (RED)
    *   `[ ] 2.X.5.3.2 [UI]` In `apps/web/src/pages/DialecticSessionDetailsPage.tsx` (or a suitable layout component):
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

---

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
