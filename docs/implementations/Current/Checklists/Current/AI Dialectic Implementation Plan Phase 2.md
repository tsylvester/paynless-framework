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

The `StartSessionPayload` interface in `dialectic.interface.ts` confirms this. It only accepts a `projectId`, `sessionDescription`, and `selectedModelIds`. There are no fields for the detailed prompt variables. The UI has no input fields for them, and the backend has no logic to process them.

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
*   [X] Add model selector to StageTabCard to set models for the session
*   [X] Remove Generate Thesis Contributions button from Contributions Display component 
*   [X] When Contributions already exist, change "Generate {Stage}" to "Regenerate {Stage}"
*   [X] Add "Begin Next Stage" button to Contributions tab to signal it's time to move on. 
*   [ ] (Too complex for now) Use TextInputArea on SessionInfoCard so users can edit & save their prompt 
*   [ ] (Too complex for now) When overlays are not provided, the assembler should omit the section. 

## File Structure for Supabase Storage and Export Tools

{repo_root}/  (Root of the user's GitHub repository)
└── {project_name_slug}/
    ├── project_readme.md      (Optional high-level project description, goals, defined by user or initial setup, *Generated at project finish, not start, not yet implemented*)
    ├── {user_prompt}.md (the initial prompt submitted by the user to begin the project generated by createProject, whether provided as a file or text string, *Generated at project start, implemented*)
    ├── project_settings.json (The json object includes keys for the dialectic_domain row, dialectic_process_template, dialectic_stage_transitions, dialectic_stages, dialectic_process_associations, domain_specific_prompt_overlays, and system_prompt used for the project where the key is the table and the value is an object containing the values of the row, *Generated on project finish, not project start, not yet implemented*)
    ├── {export_project_file}.zip (a zip file of the entire project for the user to download generated by exportProject)
    ├── general_resource (all optional)
    │    ├── `{deployment_context}` (where/how the solution will be implemented), 
    │    ├── `{domain_standards}` (domain-specific quality standards and best practices), 
    │    ├── `{success_criteria}` (measurable outcomes that define success), 
    │    ├── `{constraint_boundaries}` (non-negotiable requirements and limitations), 
    │    ├── `{stakeholder_considerations}` (who will be affected and how),
    │    ├── `{reference_documents}` (user-provided reference materials and existing assets), 
    │    └── `{compliance_requirements}` (regulatory, legal, or organizational compliance mandates)    
    ├── Pending/          (System-managed folder populated as the final step of the Paralysis stage)
    │   └── ...                     (When the user begins their work, they move the first file they're going to work on from Pending to Current)
    ├── Current/          (User-managed folder for the file they are actively working on for this project)
    │   └── ...                     (This is the file the user is currently working on, drawn from Pending)
    ├── Complete/         (User-managed folder for the files they have already completed for this project)       
    │   └── ...                     (When the user finishes all the items in the Current file, they move it to Complete, and move the next Pending file into Current)
    └── session_{session_id_short}/  (Each distinct run of the dialectic process)
        └── iteration_{N}/        (N being the iteration number, e.g., "iteration_1")
            ├── 1_thesis/
            │   ├── raw_responses
            │   │   └──{model_name_slug}_{n}_{stage_slug}_raw.json
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_name_slug}_{n}_{stage_slug}.md (Contains YAML frontmatter + AI response, appends a count so a single model can provide multiple contributions)
            │   ├── ... (other models' hypothesis outputs)
            │   ├── user_feedback_hypothesis.md   (User's feedback on this stage)
            │   └── documents/                      (Optional refined documents, e.g., PRDs from each model)
            │       └── (generated from .json object located at Database['dialectic_stages']['row']['expected_output_artifacts'])
            ├── 2_antithesis/
            │   ├── raw_responses
            │   │   └──{model_name_slug}_{n}_{stage_slug}_raw.json
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_name_slug}_{n}_{stage_slug}.md 
            │   ├── ...
            │   ├── user_feedback_antithesis.md
            │   └── documents/                    (Optional refined documents, e.g., PRDs from each model)
            │       └── (generated from .json object located at Database['dialectic_stages']['row']['expected_output_artifacts'])                
            ├── 3_synthesis/
            │   ├── raw_responses
            │   │   └──{model_name_slug}_{n}_{stage_slug}_raw.json
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_name_slug}_{n}_{stage_slug}.md
            │   ├── ...
            │   ├── user_feedback_synthesis.md
            │   └── documents/                      (Optional refined documents, e.g., PRDs from each model)
            │       └── (generated from .json object located at Database['dialectic_stages']['row']['expected_output_artifacts'])
            ├── 4_parenthesis/
            │   ├── raw_responses
            │   │   └──{model_name_slug}_{n}_{stage_slug}_raw.json
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_name_slug}_{n}_{stage_slug}.md
            │   ├── ...
            │   ├── user_feedback_parenthesis.md
            │   └── documents/                      (Optional refined documents, e.g., PRDs from each model)
            │       └── (generated from .json object located at Database['dialectic_stages']['row']['expected_output_artifacts'])
            └── 5_paralysis/
                ├── raw_responses
                │   └──{model_name_slug}_{n}_{stage_slug}_raw.json
                ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                ├── {model_name_slug}_{n}_{stage_slug}.md
                ├── ...
                └── documents/                      (Optional refined documents, e.g., PRDs from each model)
                    └── (generated from .json object located at Database['dialectic_stages']['row']['expected_output_artifacts'])

---

### Section 2.B: UI/Store Refinement for Stage Readiness Display

**Objective:** To implement a clear and consistent way for UI components to determine if a specific stage (for a given session and iteration) is "ready" (i.e., its seed prompt has been successfully generated and stored), and to update relevant UI components to reflect this readiness state, particularly for controlling the "Generate Contributions" button and displaying warnings.

---

*   `[✅] 2.B.1 [STORE]` **Create `selectIsStageReadyForSessionIteration` Selector**
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

*   `[✅] 2.X.2.4 [COMMIT]` refactor(be): refactor dialectic-service actions to use FileManagerService

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

---

## Section 2.Y: Refactor User Feedback to File-Based Storage

**Objective:** To transition the storage of user feedback from direct database text fields to Markdown files within the designated Supabase Storage structure. This aligns with the project's overall file management strategy, facilitates easier export/sync, and prevents database bloat. The `dialectic_feedback` table will store metadata and a link to these feedback files.

---

*   `[✅] 2.Y.1 [DB]` **Update `dialectic_feedback` Table Schema**
    *   `[✅] 2.Y.1.2 [DB]` Create a new Supabase migration script (`YYYYMMDDHHMMSS_update_dialectic_feedback.sql`):
        *   `[✅]` `ALTER TABLE public.dialectic_feedback DROP COLUMN IF EXISTS feedback_value_text;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback DROP COLUMN IF EXISTS feedback_value_structured;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback DROP COLUMN IF EXISTS contribution_id;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.dialectic_projects(id) ON DELETE CASCADE NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS stage_slug TEXT NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS iteration_number INTEGER NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT 'text/markdown';`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS size_bytes INTEGER NOT NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ALTER COLUMN feedback_type SET NOT NULL;` (Ensure `feedback_type` describes the feedback file, e.g., "StageReviewSummary")
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD COLUMN IF NOT EXISTS resource_description JSONB NULL;`
        *   `[✅]` `ALTER TABLE public.dialectic_feedback ADD CONSTRAINT unique_session_stage_iteration_feedback UNIQUE (session_id, project_id, stage_slug, iteration_number);`
        *   `[✅]` (GREEN)
    *   `[✅] 2.Y.1.4 [DB]` Regenerate database types: `supabase gen types typescript --project-id "$PROJECT_REF" --schema public > supabase/functions/types_db.ts`.
    *   `[✅] 2.Y.1.5 [COMMIT]` feat(db): update dialectic_feedback table for file-based storage

*   `[✅] 2.Y.2 [TYPES]` **Update Shared Type Definitions**
    *   `[✅] 2.Y.2.1 [TYPES]` In `packages/types/src/dialectic.types.ts`:
        *   `[✅]` Modify `SubmitStageResponsesPayload`:
            *   Add optional `userStageFeedback: { content: string; feedbackType: string; resourceDescription?: Record<string, any>; }`.
        *   `[✅]` Define/Update `DialecticFeedback` interface to match the new table structure (id, session_id, project_id, user_id, stage_slug, iteration_number, storage_bucket, storage_path, file_name, mime_type, size_bytes, feedback_type, resource_description, created_at, updated_at).
    *   `[✅] 2.Y.2.2 [TYPES]` Mirror changes from `packages/types/src/dialectic.types.ts` to `supabase/functions/dialectic-service/dialectic.interface.ts`.
    *   `[✅] 2.Y.2.3 [COMMIT]` feat(types): update dialectic types for file-based user feedback

*   `[✅] 2.Y.3 [BE/UTIL]` **Update Path Construction Utilities**
    *   `[✅] 2.Y.3.0 [TYPES]` In `supabase/functions/_shared/types/file_manager.types.ts`, add an optional `attemptCount?: number` to the `PathContext` interface.
    *   `[✅] 2.Y.3.1 [TEST-UNIT]` Review and update `supabase/functions/_shared/utils/path_constructor.test.ts`. (GREEN)
        *   `[✅]` Add/verify unit tests for `sanitizeForPath(input: string): string`.
        *   `[✅]` Add unit tests for `generateShortId(uuid: string, length: number = 8): string`.
        *   `[✅]` Add unit tests for `mapStageSlugToDirName(stageSlug: string): string`.
        *   `[✅]` Add unit tests for `constructStoragePath` to verify correct filename construction (e.g., `{model_slug}_{attemptCount}_{stage_slug}.md`) when `attemptCount` is present for `model_contribution_main` and `model_contribution_raw_json`.
        *   `[✅]` Ensure other `constructStoragePath` tests are updated to use `generateShortId` for session path segments and `mapStageSlugToDirName` for stage path segments consistently.
        *   `[✅]` Verify `constructStoragePath` correctly generates paths for `user_feedback` files: `{DIALECTIC_OUTPUTS_BASE_DIR}/{project_slug}/session_{session_id_short}/iteration_{iteration_number}/{mapped_stage_dir_name}/user_feedback_{stage_slug}.md`.
    *   `[✅] 2.Y.3.2 [BE/UTIL]` In `supabase/functions/_shared/utils/path_constructor.ts`, modify `constructStoragePath`:
        *   `[✅]` Consistently use `generateShortId` for session ID parts of paths.
        *   `[✅]` Consistently use `mapStageSlugToDirName` for stage directory parts of paths.
        *   `[✅]` For `model_contribution_main` and `model_contribution_raw_json` file types: if `attemptCount` is provided in `PathContext`, construct the filename as `{model_slug}_{attemptCount}_{stage_slug}.md` (or `_raw.json`). Sanitize `model_slug` and `stage_slug` parts of the filename. Otherwise, use `originalFileName`.
        *   `[✅]` For `user_feedback` file type, ensure path is `{DIALECTIC_OUTPUTS_BASE_DIR}/{project_slug}/session_{session_id_short}/iteration_{iteration_number}/{mapped_stage_dir_name}/user_feedback_{stage_slug}.md`. The `originalFileName` in `PathContext` for this type can be ignored for path construction if a fixed name based on `stage_slug` is used.
    *   `[✅] 2.Y.3.3 [TEST-UNIT]` Run unit tests for `path_constructor.ts`. (GREEN)
    *   `[✅] 2.Y.3.4 [COMMIT]` Commit changes with message: "feat(shared): update path_constructor for attempt_count and user_feedback"

*   `[✅] 2.Y.4 [BE/SVC]` **Enhance `FileManagerService`**
    *   `[✅] 2.Y.4.1 [TYPES]` In `supabase/functions/_shared/types/file_manager.types.ts`:
        *   `[✅]` Ensure `'user_feedback'` is in `FileType`.
        *   `[✅]` (Already done in 2.Y.3.0) Ensure `attemptCount?: number` is in `PathContext`.
        *   `[✅]` Ensure `UploadContext` can appropriately handle `user_feedback` (no changes currently needed).
    *   `[✅] 2.Y.4.2 [BE/SVC]` In `supabase/functions/_shared/services/file_manager.service.ts` (`uploadAndRegisterFile` method):
        *   `[✅]` When `context.pathContext.fileType === 'user_feedback'`, set `targetTable = 'dialectic_feedback'` and map fields correctly.
        *   `[✅]` For `fileType === 'model_contribution_main'` or `'model_contribution_raw_json'`:
            *   `[✅]` Implement a retry loop (e.g., max 5-10 attempts).
            *   `[✅]` Initialize `currentAttemptCount = 0`.
            *   `[✅]` In each loop iteration:
                *   `[✅]` Create/update a `PathContext` to pass to `constructStoragePath`, including `modelSlug`, `stageSlug` (from the input `context.pathContext`) and the current `attemptCount`.
                *   `[✅]` Call `supabaseClient.storage.from(bucket).upload(path, fileContent, { contentType, upsert: false })`.
                *   `[✅]` If upload succeeds: break loop, use the current path for the DB record.
                *   `[✅]` If upload fails due to a "file already exists"-type error: increment `currentAttemptCount`, continue loop.
                *   `[✅]` If upload fails for other reasons or retries exhausted: throw an error.
            *   `[✅]` When inserting into `dialectic_contributions`, the `file_name` and `storage_path` will naturally contain the counter. No separate `attempt_count_in_stage` field is saved.
    *   `[✅] 2.Y.4.3 [TEST-UNIT]` Run `path_constructor.test.ts` (if changes made here, otherwise covered by 2.Y.3.3).
    *   `[✅] 2.Y.4.4 [TEST-UNIT]` In `supabase/functions/_shared/services/file_manager.test.ts`: (RED)
        *   `[✅]` Add tests for `uploadAndRegisterFile` when `fileType` is `'user_feedback'`. Assert it attempts to insert into `dialectic_feedback`.
        *   `[✅]` Add tests for `uploadAndRegisterFile` for `fileType: 'model_contribution_main'` (and `_raw_json`):
            *   `[✅]` Caller provides base `modelSlug` and `stageSlug` in `PathContext`.
            *   `[✅]` Simulate "file already exists" errors from `storage.upload()` (when `upsert: false`).
            *   `[✅]` Assert that `FileManagerService` retries by calling `constructStoragePath` with an incremented `attemptCount` in the `PathContext` (e.g., `attemptCount: 0`, then `attemptCount: 1`).
            *   `[✅]` Assert the final successful filename (e.g., `claude-3-opus_1_hypothesis.md`) and its path are used for DB insertion into `dialectic_contributions`.
            *   `[✅]` Test the case where the first attempt (e.g., with `attemptCount: 0`) succeeds without collision.
    *   `[✅] 2.Y.4.5 [TEST-UNIT]` Run `file_manager.test.ts`.
    *   `[✅] 2.Y.4.6 [BE/SERVICE]` In `supabase/functions/_shared/services/file_manager.ts` - `uploadAndRegisterFile`: (GREEN)
        *   `[✅]` When `context.pathContext.fileType === 'user_feedback'`, set `targetTable = 'dialectic_feedback'` and map fields correctly.
        *   `[✅]` For `fileType === 'model_contribution_main'` or `'model_contribution_raw_json'`:
            *   `[✅]` Implement a retry loop (e.g., max 5-10 attempts).
            *   `[✅]` Initialize `currentAttemptCount = 0`.
            *   `[✅]` In each loop iteration:
                *   `[✅]` Create/update a `PathContext` to pass to `constructStoragePath`, including `modelSlug`, `stageSlug` (from the input `context.pathContext`) and the current `attemptCount`.
                *   `[✅]` Call `supabaseClient.storage.from(bucket).upload(path, fileContent, { contentType, upsert: false })`.
                *   `[✅]` If upload succeeds: break loop, use the current path for the DB record.
                *   `[✅]` If upload fails due to a "file already exists"-type error: increment `currentAttemptCount`, continue loop.
                *   `[✅]` If upload fails for other reasons or retries exhausted: throw an error.
            *   `[✅]` When inserting into `dialectic_contributions`, the `file_name` and `storage_path` will naturally contain the counter. No separate `attempt_count_in_stage` field is saved.
    *   `[✅] 2.Y.4.7 [TEST-UNIT]` Run `file_manager.test.ts`.
    *   `[✅] 2.Y.4.8 [COMMIT]` feat(be,fm): FileManager handles attempt counts in contribution filenames; user_feedback paths

*   `[✅] 2.Y.5 [BE/REFACTOR]` **Refactor `submitStageResponses.ts` Edge Function**
    *   `[✅] 2.Y.5.1 [TEST-INT]` In `submitStageResponses.test.ts`: (RED)
        *   `[✅]` Update tests to use the new `SubmitStageResponsesPayload` (including `userStageFeedback` object).
        *   `[✅]` Mock `FileManagerService.uploadAndRegisterFile`.
        *   `[✅]` Assert it's called correctly for `fileType: 'user_feedback'` if `userStageFeedback` is present.
            *   `[✅]` Verify `PathContext` uses `projectId`, `sessionId`, `iterationNumber`, `stageSlug`.
            *   `[✅]` Verify `originalFileName` (e.g., `user_feedback_${stageSlug}.md`).
            *   `[✅]` Verify `UploadContext` passes `userStageFeedback.content`.
            *   `[✅]` `mimeType: 'text/markdown'`.
            *   `[✅]` `customMetadata` including `feedbackType` and `resourceDescription` from payload.
    *   `[✅] 2.Y.5.2 [BE]` In `supabase/functions/dialectic-service/submitStageResponses.ts`:
        *   `[✅]` Adapt to the new `SubmitStageResponsesPayload` structure.
        *   `[✅]` If `payload.userStageFeedback` is provided:
            *   `[✅]` Instantiate `FileManagerService`.
            *   `[✅]` Prepare `PathContext` and `UploadContext` as detailed for the test.
            *   `[✅]` Call `fileManager.uploadAndRegisterFile(...)`.
            *   `[✅]` The ID of the created `dialectic_project_resources` record (for the feedback file) should be stored in the `dialectic_feedback.feedback_file_id` (or similar new field) when creating feedback records related to `payload.responses` later in the function. This links specific textual responses to the overall stage feedback document.
            *   `[✅]` Handle success/error from `FileManagerService`.
        *   `[✅]` The existing logic for handling `payload.responses` (user inputs for the AI's *next* step) will proceed largely as before, focusing on preparing the next seed prompt. Rename or refactor `storeAndSummarizeUserFeedback` if its name is now misleading. (GREEN)
    *   `[✅] 2.Y.5.3 [TEST-INT]` Run `submitStageResponses.test.ts`.
    *   `[✅] 2.Y.5.4 [REFACTOR]` Review `submitStageResponses.ts` for clarity and correctness.
    *   `[✅] 2.Y.5.5 [COMMIT]` refactor(be): adapt submitStageResponses to handle file-based user feedback

*   `[✅] 2.Y.6 [API/STORE]` **Update API Client and Store for Feedback File Handling**
    *   `[✅] 2.Y.6.1 [TEST-UNIT]` In `packages/api/src/dialectic.api.test.ts`, update tests for `submitStageResponses` to use the new payload structure. (RED)
    *   `[✅] 2.Y.6.2 [API]` In `packages/api/src/dialectic.api.ts`, update the `submitStageResponses` method signature and payload. (GREEN)
    *   `[✅] 2.Y.6.3 [TEST-UNIT]` Run `dialectic.api.test.ts`.
    *   `[✅] 2.Y.6.4 [TEST-UNIT]` In `packages/store/src/dialecticStore.test.ts`, update tests for `submitStageResponses` thunk with the new payload. (RED)
    *   `[✅] 2.Y.6.5 [STORE]` In `packages/store/src/dialecticStore.ts`, update the `submitStageResponses` thunk and its payload type. (GREEN)
    *   `[✅] 2.Y.6.6 [TEST-UNIT]` Run `dialecticStore.test.ts`.
    *   `[✅] 2.Y.6.7 [STORE]` Ensure `fetchDialecticProjectDetails` correctly fetches and stores `DialecticFeedback` records (metadata for feedback files) associated with sessions/projects. Update selectors if needed (e.g., `selectFeedbackForStageIteration`).
    *   `[✅] 2.Y.6.8 [COMMIT]` feat(api,store): update API and store for file-based feedback submission
*   [✅] 2.Y.6.A [UI/REFACTOR] **Implement UI for Consolidating and Submitting Text Feedback as Markdown File Content**
    *   [✅] 2.Y.6.A.1 [TEST-UNIT] In `SessionContributionsDisplayCard.test.tsx`: (RED)
        *   [✅] Test client-side logic for collecting `responseText` for each AI contribution.
        *   [✅] Test the logic that formats these collected items into a single Markdown string.
        *   [✅] Test that the `submitStageResponses` thunk is called with the correct `SubmitStageResponsesPayload`, including `userStageFeedback.content` (the Markdown string) and `userStageFeedback.feedbackType`.
    *   [✅] 2.Y.6.A.2 [UI] In `SessionContributionsDisplayCard.tsx`: (GREEN)
        *   [✅] Implement logic to gather all `responseText` from `stageResponses` for the currently displayed contributions.
        *   [✅] Implement a function to format this feedback into a structured Markdown string (e.g., `## Feedback for Contribution by {model_name} (ID: {contrib_id.substring(0,5)}...)\n\n{response_text}\n\n---\n\n`).
        *   [✅] When preparing to submit (in `proceedWithSubmission`):
            *   Populate `userStageFeedback.content` with the generated Markdown.
            *   Set `userStageFeedback.feedbackType` to `StageContributionResponses_v1`.
            *   Ensure `responses` array in the payload is empty.
            *   Call the `submitStageResponses` thunk with this payload.
    *   [✅] 2.Y.6.A.3 [TEST-UNIT] Run `SessionContributionsDisplayCard.test.tsx` tests to confirm they pass. (GREEN)
    *   [✅] 2.Y.6.A.4 [REFACTOR] Review UI logic in `SessionContributionsDisplayCard.tsx` for clarity.
    *   [✅] 2.Y.6.A.5 [COMMIT] refactor(web): consolidate text feedback to markdown for submission
*   [✅] 2.Y.7 [UI/REFACTOR] **Implement UI for Viewing Submitted Stage Feedback (SessionContributionsDisplayCard.tsx)**
    *   [✅] 2.Y.7.1 [UI] Identify UI component(s) responsible for displaying feedback for a specific stage/iteration. (SessionContributionsDisplayCard).
    *   [✅] 2.Y.7.2 [UI] Display Feedback Metadata: Use `selectFeedbackForStageIteration` to access and show `file_name`, `created_at`.
    *   [✅] 2.Y.7.3 [UI] Fetch Feedback Content:
        *   [✅] 2.Y.7.3.1 [STORE] Create thunk in `dialecticStore.ts` (`fetchFeedbackFileContent`) to call `api.dialectic.getProjectResourceContent` using `project_id` and `storage_path` from `DialecticFeedback`.
            *   [✅] 2.Y.7.3.1.1 [STORE] Add state: `currentFeedbackFileContent: GetProjectResourceContentResponse | null`, `isFetchingFeedbackFileContent: boolean`, `fetchFeedbackFileContentError: ApiError | null`.
            *   [✅] 2.Y.7.3.1.2 [STORE] Add actions: `fetchFeedbackFileContent`, `resetFetchFeedbackFileContentError`, `clearCurrentFeedbackFileContent`.
            *   [✅] 2.Y.7.3.1.3 [TEST-UNIT] Add tests for new feedback content actions in `dialecticStore.feedback.test.ts`.
        *   [✅] 2.Y.7.3.2 [UI] Implement UI logic in `SessionContributionsDisplayCard.tsx` to call `fetchFeedbackFileContent` when a "View Feedback" button/link is clicked (e.g., in a modal).
        *   [✅] 2.Y.7.3.3 [UI] Show loading state while content is fetching.
        *   [✅] 2.Y.7.3.4 [UI] Show error state if fetching fails.
    *   [✅] 2.Y.7.4 [UI] Rendering Markdown: Display the fetched Markdown content from `currentFeedbackFileContent.content` using `MarkdownRenderer` component in the modal.
    *   [✅] 2.Y.7.5 [TEST-UNIT] Update/add unit tests for `SessionContributionsDisplayCard.tsx` to verify metadata display, content fetching modal, and markdown rendering.
    *   [✅] 2.Y.7.6 [COMMIT] feat(web,store): implement UI for viewing submitted stage feedback
*   [ ] 2.Y.8 [DOCS] **Update Documentation**
    *   [ ] 2.Y.8.1 [DOCS] Update `supabase/functions/_shared/services/file_manager.md` to include `'user_feedback'` file type and its path structure if different from generic resources.
    *   [ ] 2.Y.8.2 [DOCS] Update any backend or API documentation regarding `submitStageResponses` payload, `dialectic_feedback` table, and the new markdown consolidation.
    *   [ ] 2.Y.8.3 [DOCS] Update "File Structure for Supabase Storage and Export Tools" in the main plan if necessary to ensure it perfectly reflects the implemented paths for feedback files.
    *   [ ] 2.Y.8.4 [COMMIT] docs: update documentation for file-based user feedback
*   [ ] 2.Y.9 [UI] Create/Update UI for submitting new iteration feedback (if significantly different from initial submission) - *Defer if 2.Y.6.A covers it well enough for now.*
    *   [ ] 2.Y.9.1 [UI] Design changes for submitting feedback on subsequent iterations.
*   [ ] 2.Y.10 [TEST-E2E]` **End-to-End Testing**
    *   [ ] 2.Y.10.1 [TEST-E2E] Test the complete flow:
        *   User provides feedback on AI contributions for a stage.
        *   User proceeds to the next stage or submits feedback.
        *   Verify a Markdown file with the consolidated feedback is created in Supabase Storage at the correct path.
        *   Verify a corresponding record exists in the `dialectic_feedback` table with correct metadata.

---

### Section X: Architectural Refactor - Decouple UI Components from URL Parameters & Guarantee Data Freshness

**Goal:** Enhance component reusability, testability, and simplify state management by making core components rely on store selectors for their operational context. Ensure that explicitly navigating to a project or session always presents the user with the most up-to-date data directly fetched from the database. `useParams` will be strictly limited to initial deep-link hydration of the store's context.

**Phase X.1: Project Context Refactoring (Ensuring Project Freshness)**

*   **Task X.1.1: Store - Project Level Fetch and Context Setting**
    *   `[✅] X.1.1.1 [TEST-UNIT]` **Write/Update Tests for `fetchDialecticProjectDetails` Thunk Enhancement** (RED)
        *   **File:** `packages/store/src/dialecticStore.project.test.ts`
        *   **Assertions:** After `fetchDialecticProjectDetails` successfully completes:
            *   `currentProjectDetail` is updated with fetched project data.
            *   `activeContextProjectId` is set to the fetched project's ID.
            *   `activeContextSessionId` is set to `null`.
            *   `activeContextStage` is set to `null` (or a default project stage if applicable).
            *   `selectedModelIds` is set to an empty array.
    *   `[✅] X.1.1.2 [SFC] [MOD]` **Enhance `fetchDialecticProjectDetails(projectId: string)` Thunk** (GREEN)
        *   **File:** `packages/store/src/dialecticStore.ts`
        *   **Action:** Modify the thunk to, upon successful fetch of project details:
            *   Update `currentProjectDetail`.
            *   Call the existing `setActiveDialecticContext({ projectId: fetchedProjectId, sessionId: null, stage: null });`.
            *   Dispatch `setSelectedModelIds([])`.
    *   `[✅] X.1.1.3 [REFACTOR]` Review changes to `fetchDialecticProjectDetails` for clarity and correctness.
    *   `[✅] X.1.1.4 [API] [VERIFY]` Confirm `api.dialectic().getProjectDetails(projectId)` is not subject to overly aggressive client-side caching that would prevent fetching the latest data from the database on demand. (This is a verification step, results might inform future tasks).
    *   `[ ] X.1.1.5 [COMMIT]` `refactor(store): enhance fetchDialecticProjectDetails to set project context and clear session`

*   **Task X.1.2: `ViewProjectButton` Component**
    *   `[✅] X.1.2.1 [TEST-UNIT]` **Write Tests for `ViewProjectButton`** (RED)
        *   **File:** `apps/web/src/components/dialectic/controls/ViewProjectButton.test.tsx` (Create if not exists)
        *   **Assertions:**
            *   Use existing mock for `useDialecticStore` to provide `fetchDialecticProjectDetails` action.
            *   Mock `useNavigate`.
            *   On button click, assert `fetchDialecticProjectDetails` is called with the correct `projectId`.
            *   Assert `navigate` is called with the correct project details URL (e.g., `/dialectic/${projectId}`) after the fetch action resolves.
    *   `[✅] X.1.2.2 [CMP] [NEW]` **Create `ViewProjectButton.tsx`** (GREEN)
        *   **File:** `apps/web/src/components/dialectic/ViewProjectButton.tsx`
        *   **Props:** `projectId: string`, `projectName: string` (or other display info).
        *   **Logic:** Uses `fetchDialecticProjectDetails` and `useNavigate` as per test assertions.
    *   `[✅] X.1.2.3 [REFACTOR]` Review `ViewProjectButton` component.
    *   `[✅] X.1.2.4 [TEST-UNIT]` **Write/Update Tests for `ViewProjectButton` Integration** (RED)
        *   **File:** `apps/web/src/pages/DialecticProjectsListPage.test.tsx` (or equivalent projects list component test file).
        *   **Assertions:** Assert `ViewProjectButton` is rendered for each project and that interaction with it behaves as expected (mocking underlying store/navigation).
    *   `[✅] X.1.2.5 [PAGE] [MOD]` **Integrate `ViewProjectButton` into Projects List Page** (GREEN)
        *   **File:** `apps/web/src/pages/DialecticProjectsListPage.tsx` (or equivalent).
        *   **Action:** Replace current `<Link>`-based navigation for viewing project details with `<ViewProjectButton />`.
    *   `[✅] X.1.2.6 [REFACTOR]` Review integration of `ViewProjectButton`.
    *   `[✅] X.1.2.7 [COMMIT]` `feat(web): implement ViewProjectButton and integrate into projects list`

*   **Task X.1.3: Refactor `DialecticProjectDetailsPage.tsx` for Initial Deep-Link Load**
    *   `[✅] X.1.3.1 [TEST-UNIT]` **Write/Update Tests for `DialecticProjectDetailsPage.tsx`** (RED)
        *   **File:** `apps/web/src/pages/DialecticProjectDetailsPage.test.tsx`
        *   **Assertions:**
            *   Mock `useParams` to provide `urlProjectId`.
            *   Use existing mock for `useDialecticStore` to provide `activeContextProjectId`, `currentProjectDetail`, and `fetchDialecticProjectDetails` action.
            *   Scenario 1: `urlProjectId` exists AND (`urlProjectId !== activeContextProjectId` OR `!currentProjectDetail` OR `currentProjectDetail.id !== urlProjectId`) -> assert `fetchDialecticProjectDetails(urlProjectId)` is called.
            *   Scenario 2: `urlProjectId` exists but context is already aligned -> assert `fetchDialecticProjectDetails` is NOT called for this reason.
            *   Assert component rendering relies on store-derived context (`activeContextProjectId`, `currentProjectDetail`) and not directly on `useParams` for operational logic.
    *   `[✅] X.1.3.2 [PAGE] [MOD]` **Refactor `DialecticProjectDetailsPage.tsx`** (GREEN)
        *   **File:** `apps/web/src/pages/DialecticProjectDetailsPage.tsx`
        *   **Logic:**
            *   Use `useParams` in an `useEffect` hook *only* for initial deep-link hydration.
            *   If `urlProjectId` from params warrants a fetch (differs from `activeContextProjectId` or relevant data is missing), call `store.fetchDialecticProjectDetails(urlProjectId)`.
            *   All operational logic (rendering, event handlers) must use `activeContextProjectId` and `currentProjectDetail` from the store.
    *   `[✅] X.1.3.3 [REFACTOR]` Review refactoring of `DialecticProjectDetailsPage.tsx`.
    *   `[✅] X.1.3.4 [COMMIT]` `refactor(web,store): use store context in ProjectDetailsPage, limit useParams to deep-links`

**Phase X.2: Session Context Refactoring (Ensuring Session Freshness & Decoupling)**

*   **Task X.2.1: API - New Endpoint for Single Session Details**
    *   `[✅] X.2.1.1 [TEST-UNIT]` **Write Tests for `api.dialectic().getSessionDetails()` Client Method** (RED)
        *   **File:** `packages/api/src/dialectic.api.test.ts`
        *   **Assertions:** Mock `apiClient.post`. Assert it's called with the correct Edge Function name (e.g., `dialectic-service`), action (e.g., `getSessionDetails`), and payload (`{ sessionId }`).
    *   `[✅] X.2.1.2 [API] [NEW]` **Define `api.dialectic().getSessionDetails(sessionId: string)` Client Method** (GREEN)
        *   **File:** `packages/api/src/dialectic.api.ts`
    *   `[✅] X.2.1.3 [REFACTOR]` Review new API client method.
    *   `[✅] X.2.1.4 [TEST-INT]` **Write Integration Tests for `getSessionDetails` Edge Function** (RED)
        *   **File:** `supabase/functions/dialectic-service/getSessionDetails.test.ts` (Create, or add to existing test suite for the service).
        *   **Assertions:** Mock database client. Test successful fetch of a session by ID, and error scenarios (e.g., session not found).
    *   `[✅] X.2.1.5 [EDGE] [NEW]` **Implement Supabase Edge Function for `getSessionDetails`** (GREEN)
        *   **File:** `supabase/functions/dialectic-service/index.ts` (add new case or new file if structured differently).
        *   **Logic:** Receives `sessionId`, fetches full session details from DB.
    *   `[✅] X.2.1.6 [REFACTOR]` Review `getSessionDetails` Edge Function.
    *   `[✅] X.2.1.7 [COMMIT]` `feat(api,edge): implement getSessionDetails endpoint and client method`

*   **Task X.2.2: Store - Fetching and Setting Single Session Context**
    *   `[✅] X.2.2.1 [TEST-UNIT]` **Write Tests for New Session State and `fetchAndSetCurrentSessionDetails` Thunk** (RED)
        *   **File:** `packages/store/src/dialecticStore.test.ts`
        *   **Assertions for State:** Verify presence of `activeSessionDetail`, `isLoadingActiveSessionDetail`, `activeSessionDetailError`.
        *   **Assertions for Thunk:**
            *   Mock `api.dialectic().getSessionDetails(sessionId)`.
            *   On success:
                *   `isLoadingActiveSessionDetail` is handled.
                *   `activeSessionDetail` is updated with `freshSessionData`.
                *   `currentProjectDetail.dialectic_sessions` is correctly updated.
                *   `setActiveDialecticContext` is called with `projectId`, `sessionId`, and derived stage.
                *   `setSelectedModelIds` is called with session's model IDs.
            *   On error: `isLoadingActiveSessionDetail` and `activeSessionDetailError` are handled.
    *   `[✅] X.2.2.2 [TYPES] [MOD]` **Add/Update Session State in `DialecticStateValues`** (GREEN - Part 1)
        *   **File:** `packages/types/src/dialectic.types.ts` (within `DialecticStateValues` interface)
        *   **Action:** Add `activeSessionDetail: DialecticSession | null;`, `isLoadingActiveSessionDetail: boolean;`, `activeSessionDetailError: ApiError | null;`.
    *   `[✅] X.2.2.3 [SFC] [NEW]` **Define `fetchAndSetCurrentSessionDetails(sessionId: string)` Thunk** (GREEN - Part 2)
        *   **File:** `packages/store/src/dialecticStore.ts`
    *   `[✅] X.2.2.4 [REFACTOR]` Review new session state and thunk.
    *   `[✅] X.2.2.5 [TEST-UNIT]` **Write Tests for `activateProjectAndSessionContextForDeepLink` Thunk** (RED)
        *   **File:** `packages/store/src/dialecticStore.test.ts`
        *   **Assertions:** Mock `fetchDialecticProjectDetails` and `fetchAndSetCurrentSessionDetails`.
            *   Scenario 1: `activeContextProjectId !== projectId` -> `fetchDialecticProjectDetails` is called, then `fetchAndSetCurrentSessionDetails`.
            *   Scenario 2: `activeContextProjectId === projectId` -> only `fetchAndSetCurrentSessionDetails` is called.
    *   `[✅] X.2.2.6 [SFC] [NEW]` **Define `activateProjectAndSessionContextForDeepLink(projectId: string, sessionId: string)` Thunk** (GREEN)
        *   **File:** `packages/store/src/dialecticStore.ts`
    *   `[✅] X.2.2.7 [REFACTOR]` Review `activateProjectAndSessionContextForDeepLink` thunk.
    *   `[✅] X.2.2.8 [COMMIT]` `feat(store,types): add state and thunks for fetching and activating single session context`

*   **Task X.2.3: `ViewSessionButton` Component**
    *   `[✅] X.2.3.1 [TEST-UNIT]` **Write Tests for `ViewSessionButton`** (RED)
        *   **File:** `apps/web/src/components/dialectic/controls/ViewSessionButton.test.tsx` (Create if not exists)
        *   **Assertions:**
            *   Use existing mock for `useDialecticStore` to provide `fetchDialecticProjectDetails`, `fetchAndSetCurrentSessionDetails`, and `activeContextProjectId`.
            *   Mock `useNavigate`.
            *   Scenario 1 (Project context matches): Assert `fetchAndSetCurrentSessionDetails` is called.
            *   Scenario 2 (Project context differs): Assert `fetchDialecticProjectDetails` is called, then `fetchAndSetCurrentSessionDetails`.
            *   Assert `navigate` is called with the correct session URL after actions resolve.
    *   `[✅] X.2.3.2 [CMP] [NEW]` **Create `ViewSessionButton.tsx`** (GREEN)
        *   **File:** `apps/web/src/components/dialectic/controls/ViewSessionButton.tsx`
        *   **Props:** `sessionId: string`, `projectId: string`.
    *   `[✅] X.2.3.3 [REFACTOR]` Review `ViewSessionButton` component.
    *   `[✅] X.2.3.4 [TEST-UNIT]` **Write/Update Tests for `ViewSessionButton` Integration in `ProjectSessionsList`** (RED)
        *   **File:** `apps/web/src/components/dialectic/ProjectSessionsList.test.tsx`
        *   **Assertions:** Assert `ViewSessionButton` is rendered for each session and that interaction triggers the expected behavior (relying on mocks for the button's internal logic).
    *   `[✅] X.2.3.5 [CMP] [MOD]` **Integrate `ViewSessionButton` in `ProjectSessionsList.tsx`** (GREEN)
        *   **File:** `apps/web/src/components/dialectic/ProjectSessionsList.tsx`
        *   **Action:** Replace direct `<Link>` navigation with `<ViewSessionButton />`.
    *   `[✅] X.2.3.6 [REFACTOR]` Review integration of `ViewSessionButton`.
    *   `[✅] X.2.3.7 [COMMIT]` `feat(web): implement ViewSessionButton and integrate into sessions list`

    *   `[✅] X.2.3.8 [ARCH/REFACTOR]` **Enhancements to Underlying Services for Correct Stage Context on ViewSessionButton Click**
        *   **Objective:** To ensure that when `ViewSessionButton` initiates the loading of session details, the specific `DialecticStage` object corresponding to the session's `current_stage_id` is fetched and set as the active stage in the store. This involves modifying the `getSessionDetails` Edge Function, its API client interface, and the store's handling of this data.
        *   `[✅] X.2.3.8.1 [EDGE]` **Modify `getSessionDetails` Edge Function (`supabase/functions/dialectic-service/getSessionDetails.ts`)**
            *   `[✅] X.2.3.8.1.1` Update the Supabase database query within the function.
                *   The query should `JOIN` the `dialectic_sessions` table with the `dialectic_stages` table.
                *   The `JOIN` condition will be `dialectic_sessions.current_stage_id = dialectic_stages.id`.
                *   The `SELECT` clause should retrieve all columns from `dialectic_sessions` (aliased if necessary to avoid name clashes) and all columns from `dialectic_stages` (these will form the `DialecticStage` object).
            *   `[✅] X.2.3.8.1.2` Change the structure of the data returned by the function. Instead of just returning the `DialecticSession` object, it should return an object containing two properties:
                *   `session`: The fetched `DialecticSession` object.
                *   `currentStageDetails`: The full `DialecticStage` object derived from the `JOIN`, or `null` if `current_stage_id` was null or no matching stage was found.
                *   Example return structure: `{ data: { session: DialecticSession, currentStageDetails: DialecticStage | null }, status: 200 }`.
            *   `[✅] X.2.3.8.1.3` Ensure RLS or appropriate user authorization checks are still performed to confirm the user can access the session (as previously implemented by checking project ownership).
        *   `[✅] X.2.3.8.2 [TYPES/API]` **Update API Client and Type Definitions**
            *   `[✅] X.2.3.8.2.1` In `packages/types/src/dialectic.types.ts` (and potentially mirrored in `supabase/functions/dialectic-service/dialectic.interface.ts` if it defines distinct response types for actions):
                *   Define a new interface for the response of the `getSessionDetails` action, e.g.:
                    ```typescript
                    export interface GetSessionDetailsResponse {
                      session: DialecticSession;
                      currentStageDetails: DialecticStage | null;
                    }
                    ```
                *   The existing `DialecticSession` and `DialecticStage` types themselves should remain unchanged.
            *   `[✅] X.2.3.8.2.2` In `packages/api/src/dialectic.api.ts`:
                *   Update the `getSessionDetails(sessionId: string)` method in `DialecticApiClient`. Its expected return type from `this.apiClient.post<...>` should now be `ApiResponse<GetSessionDetailsResponse>`.
            *   `[✅] X.2.3.8.2.3` In `supabase/functions/dialectic-service/index.ts`:
                *   Update the return type signature for `getSessionDetails` within the `ActionHandlers` interface to reflect the new `GetSessionDetailsResponse` structure:
                    ```typescript
                    getSessionDetails: (payload: GetSessionDetailsPayload, dbClient: SupabaseClient, user: User) => Promise<{ data?: GetSessionDetailsResponse; error?: ServiceError; status?: number }>;
                    ```
        *   `[✅] X.2.3.8.3 [STORE]` **Update Store Logic (`packages/store/src/dialecticStore.ts`)**
            *   `[✅] X.2.3.8.3.1` Modify the `fetchAndSetCurrentSessionDetails(sessionId: string)` thunk:
                *   It should now expect the API call `api.dialectic().getSessionDetails(sessionId)` to return an `ApiResponse<GetSessionDetailsResponse>`.
                *   Upon successful API response (`response.data` is not null):
                    *   Destructure the response: `const { session: fetchedSession, currentStageDetails: fetchedStageDetails } = response.data;`.
                    *   Update `activeSessionDetail` in the store state with `fetchedSession`.
                    *   Update the `dialectic_sessions` array within `currentProjectDetail` to reflect the potentially updated `fetchedSession`.
                    *   Crucially, when calling `get().setActiveDialecticContext(...)` (or a similar action for setting the active context):
                        *   Pass `projectId: fetchedSession.project_id`.
                        *   Pass `sessionId: fetchedSession.id`.
                        *   Pass `stage: fetchedStageDetails || null`. This directly sets the `activeContextStage` using the stage object provided by the backend, eliminating the need for client-side lookups against `currentProcessTemplate` for this specific initialization step.
            *   `[✅] X.2.3.8.3.2` Verify that the `activateProjectAndSessionContextForDeepLink(projectId: string, sessionId: string)` thunk correctly calls the updated `fetchAndSetCurrentSessionDetails` and thus benefits from these changes. No direct changes might be needed in `activateProjectAndSessionContextForDeepLink` itself if its primary role is orchestration.
        *   `[✅] X.2.3.8.4 [TEST-UNIT]` **Update Unit and Integration Tests**
            *   Update unit tests for `getSessionDetails` Edge Function to assert the new return structure.
            *   Update unit tests for `DialecticApiClient.getSessionDetails` to mock and assert the new response type.
            *   Update unit tests for the `fetchAndSetCurrentSessionDetails` store thunk to mock the new API response and assert that `activeSessionDetail` and `activeContextStage` are set correctly.
            *   Ensure tests for `ViewSessionButton` still pass, verifying it correctly triggers the thunks that now lead to the desired stage context being set.
        *   `[✅] X.2.3.8.5 [COMMIT]` `refactor(dialectic): enhance getSessionDetails to return current stage object, update store for direct stage context setting`

*   **Task X.2.4: Refactor `DialecticSessionDetailsPage.tsx` for Initial Deep-Link Load & Store Context**
    *   `[✅] X.2.4.1 [TEST-UNIT]` **Write/Update Tests for `DialecticSessionDetailsPage.tsx`** (RED)
        *   **File:** `apps/web/src/pages/DialecticSessionDetailsPage.test.tsx`
        *   **Assertions:**
            *   Mock `useParams` to provide `urlProjectId`, `urlSessionId`.
            *   Use existing mock for `useDialecticStore` (actions: `activateProjectAndSessionContextForDeepLink`; selectors: `activeContextProjectId`, `activeContextSessionId`, `activeSessionDetail`).
            *   Scenario 1: URL params exist AND context is different (`urlProjectId !== activeContextProjectId` OR `urlSessionId !== activeContextSessionId`) -> assert `activateProjectAndSessionContextForDeepLink` is called.
            *   Scenario 2: Context is already aligned -> assert action is NOT called.
            *   Assert rendering relies on store-derived context (`activeSessionDetail`, etc.), not `useParams`.
    *   `[✅] X.2.4.2 [PAGE] [MOD]` **Refactor `DialecticSessionDetailsPage.tsx`** (GREEN)
        *   **File:** `apps/web/src/pages/DialecticSessionDetailsPage.tsx`
        *   **Logic:**
            *   Use `useParams` in `useEffect` *only* for initial deep-link hydration. Call `store.activateProjectAndSessionContextForDeepLink(urlProjectId, urlSessionId)` if context needs to be set/updated.
            *   All operational logic (rendering, data display) must use data selected from the store (e.g., `activeSessionDetail`).
    *   `[✅] X.2.4.3 [REFACTOR]` Review `DialecticSessionDetailsPage.tsx` refactoring.
    *   `[✅] X.2.4.4 [COMMIT]` `refactor(web,store): use store context in SessionDetailsPage, limit useParams to deep-links`

**Phase X.3: Decouple All Child Components & Final Cleanup**

*   **Task X.3.1: Systematically Refactor Child Components**
    *   For each relevant child component of `DialecticProjectDetailsPage.tsx` and `DialecticSessionDetailsPage.tsx` (e.g., `InitialProblemStatement.tsx`, `SessionInfoCard.tsx`, `StageTabCard.tsx`, `SessionContributionsDisplayCard.tsx`, AI model selectors, etc.):
        *   `[✅] X.3.1.1 [TEST-UNIT]` **Update Unit Tests for Child Component** (RED)
            *   **File:** `apps/web/src/components/dialectic/.../<ComponentName>.test.tsx`
            *   **Assertions:** Remove mocks for `useParams` or prop-drilled IDs. Mock relevant store selectors to provide context. Assert rendering and behavior based on this store context.
        *   `[✅] X.3.1.2 [CMP] [MOD]` **Refactor Child Component** (GREEN)
            *   **File:** `apps/web/src/components/dialectic/.../<ComponentName>.tsx`
            *   **Action:** Modify component to consume all necessary context directly from `useDialecticStore` using selectors.
        *   `[✅] X.3.1.3 [REFACTOR]` Review refactored child component.
    *   `[✅] X.3.1.4 [COMMIT]` `refactor(components): decouple child UI components from useParams, use store context` (This commit might be iterative if done component-by-component).

*   **Task X.3.2: Comprehensive Testing**
    *   `[ ] X.3.2.1 [TEST-E2E]` Conduct thorough end-to-end and manual testing of all navigation scenarios:
        *   Direct navigation to project URLs (deep link, refresh).
        *   Direct navigation to session URLs (deep link, refresh).
        *   Navigation via `ViewProjectButton`.
        *   Navigation via `ViewSessionButton`.
        *   Switching between sessions within the same project.
        *   Switching between different projects.
        *   Verification of data freshness after explicit navigation.
        *   Correct behavior of `selectedModelIds` and other session-specific UI elements.
        *   Error handling for invalid IDs or API failures during context setting.
    *   `[ ] X.3.2.2 [COMMIT]` `test(e2e): complete testing for context-based navigation and data freshness` (If automated E2E tests are added/updated, otherwise this is a QA checkpoint).

*   **Task X.3.3: Final Review and Cleanup**
    *   `[ ] X.3.3.1 [LINT]` Ensure all code changes pass linting and type-checking.
    *   `[ ] X.3.3.2 [CODE] [DEL]` Search for and remove any remaining operational (non-deep-link) usages of `useParams` within the dialectic feature's components.
    *   `[ ] X.3.3.3 [DOCS]` Update any relevant developer documentation regarding context management or component data flow if significantly changed.
    *   `[ ] X.3.3.4 [COMMIT]` `chore(refactor): complete UI decoupling, cleanup, and documentation updates`

### Dynamic Display of Generated Contributions and Enhanced User Feedback

**Goal:** To provide clear visual feedback to the user throughout the lifecycle of AI contribution generation, from initiation to display. This involves refining store loading states and enhancing UI components (`SessionInfoCard.tsx` and primarily `SessionContributionsDisplayCard.tsx`) to react to these states, ensuring a smooth and informative user experience.

*   **[STORE] Refine and Expose Loading/Status Indicators in DialecticStore for Contribution Generation Lifecycle:**
    *   `[✅]` **`[BE]` (Verification):** Confirm that the backend `dialectic-service` consistently updates the `dialectic_sessions.status` (e.g., to something like `stage_generating_contributions`, then `stage_generation_complete` or similar) and that this status is included in the `DialecticSession` object fetched by `getProjectDetails`.
        *   *Status: Verified. `generateContribution.ts` updates session status appropriately.*
    *   `[✅]` **Introduce `isGeneratingContributions` state:**
        *   `[STORE]` Add a new boolean state variable, `isGeneratingContributions` (or a more specific status enum like `contributionGenerationStatus: 'idle' | 'initiating' | 'generating' | 'failed'`), to `DialecticStore`.
            *   *Status: Implemented as `contributionGenerationStatus` with the specified enum values.*
        *   `[STORE]` This state should be set to `true` (or `'initiating'/'generating'`) when the `generateContributions` action is dispatched and the API call is in flight, and also while the backend is processing (if a specific session status like `stage_generating_contributions` can be polled or is pushed via websockets - if not, this state might primarily reflect the refetch period).
            *   *Status: `contributionGenerationStatus` is set to `'generating'` during the API call. Post-API call, UI relies on `isLoadingProjectDetail` for refresh feedback. Continuous backend processing state (if applicable beyond API call) is not explicitly polled into this specific store variable.*
        *   `[STORE]` Set it to `false` (or `'idle'/'failed'`) once the subsequent `fetchProjectDetails` (that includes the new contributions) completes or if the initial generation request fails.
            *   *Status: Implemented. `contributionGenerationStatus` is reset in the thunk's `finally` block or on error.*
        *   `[STORE]` Expose a selector for this new state.
            *   *Status: Implemented (`selectContributionGenerationStatus`).*
    *   `[✅]` **Utilize `isLoadingCurrentProjectDetail` for post-generation refresh:**
        *   `[STORE]` Ensure the existing `isLoadingCurrentProjectDetail` (or equivalent state that tracks the loading of `currentProjectDetail`) is active during the `fetchProjectDetails` call that occurs *after* the "Contributions generated for session..." log message. This state will be key for showing loading in `SessionContributionsDisplayCard`.
            *   *Status: Implemented (`isLoadingProjectDetail` is used by `SessionContributionsDisplayCard.tsx`).*
    *   `[✅]` **Error Handling:**
        *   `[STORE]` Ensure that any errors during the `generateContributions` API call or the subsequent `fetchProjectDetails` call are stored appropriately (e.g., `generateContributionsError`, `fetchProjectDetailsError`) and selectors are available.
            *   *Status: Implemented (`generateContributionsError`, `projectDetailError` exist and are used).*
    *   `[✅]` **[TEST-UNIT]` Update store unit tests:**
        *   `[✅]` Add tests for the new `isGeneratingContributions` state transitions.
        *   `[✅]` Verify that `isLoadingCurrentProjectDetail` is correctly managed during the post-generation refresh.
        *   `[✅]` Test error states.
            *   *Status: Verified as complete based on review of `test.log` (`dialecticStore.contribution.test.ts` and `dialecticStore.test.ts` cover these scenarios for `generateContributions` thunk).*

*   **[UI] Enhance `SessionInfoCard.tsx` (now `GenerateContributionButton.tsx` / `StageTabCard.tsx`) for Initial Contribution Generation Feedback:**
    *   `[✅]` **Display Initial Generation Indicator:**
        *   `[UI]` Subscribe to the new `isGeneratingContributions` (or `contributionGenerationStatus`) state from `DialecticStore`.
        *   `[UI]` When `isGeneratingContributions` is `true` (or status is `'initiating'/'generating'`), display a subtle, non-blocking indicator within the `SessionInfoCard` or near the action button that triggered generation (e.g., "Generating contributions, please wait..." or a small spinner). This gives immediate feedback.
            *   *Status: Implemented in `GenerateContributionButton.tsx` (shows spinner and "Generating...").*
    *   `[✅]` **Error Handling for Initiation Failure:**
        *   `[UI]` If `contributionGenerationStatus` reflects a failure at the initiation step, display an appropriate error message.
            *   *Status: `GenerateContributionButton.tsx` uses toasts for API errors. An inline error message within the button/card based on `contributionGenerationStatus === 'failed'` is not present; `SessionContributionsDisplayCard.tsx` handles `failed` status later. This could be considered partially addressed or sufficiently handled by toasts for initiation.*
    *   `[✅]` **[TEST-UNIT]` Update `SessionInfoCard.tsx` (or `GenerateContributionButton.tsx`/`StageTabCard.tsx`) unit tests:**
        *   `[✅]` Test the display of the generation indicator and error messages based on store states.
            *   *Status: Unknown without direct test file access.*

*   **[UI] Enhance `SessionContributionsDisplayCard.tsx` for Dynamic Updates and Detailed Loading/Error States:**
    *   `[✅]` **Targeted Loading State for Contributions:**
        *   `[UI]` Subscribe to `isLoadingCurrentProjectDetail` from `DialecticStore`.
        *   `[UI]` While `isLoadingCurrentProjectDetail` is true AND the component expects new contributions (e.g., after generation was triggered for the current `activeStage` and `session.iteration_count`), display a clear loading state specifically within the contributions area. This could be:
            *   Skeleton versions of `GeneratedContributionCard`.
            *   A message like "Loading new contributions..." with a spinner.
        *   `[UI]` This state should be active *after* the initial generation is confirmed and the project details are being refetched.
            *   *Status: Implemented. Shows "Loading new contributions..." and skeletons.*
    *   `[✅]` **Display Generation Initiation Message:**
        *   `[UI]` If `isGeneratingContributions` is true (or a similar status from the store indicates that generation is in progress but details haven't been fetched yet), and `isLoadingCurrentProjectDetail` might not yet be true (or is true for a different reason), show a message like "Contributions are being generated. This card will update shortly."
            *   *Status: Implemented. Shows "Contributions are being generated. This card will update shortly." with spinner when `contributionGenerationStatus` is 'initiating' or 'generating'.*
    *   `[✅]` **Improved Handling of Empty/No Contributions:**
        *   `[UI]` Refine the logic for when `displayedContributions` is empty. Distinguish between:
            *   No contributions yet generated for this stage/iteration.
            *   Contributions are actively being loaded/generated.
            *   Generation attempted but resulted in no contributions (if this is a possible backend state).
            *   *Status: Implemented. UI distinguishes these states (generating, loading, stage not ready, no contributions yet).*
    *   `[✅]` **Error Display for Fetching Contributions:**
        *   `[UI]` If `fetchProjectDetailsError` (from the store, related to the post-generation refresh) is present, display a clear error message within the card (e.g., "Failed to load new contributions. Please try again or refresh.").
            *   *Status: Implemented. Shows "Error Loading Contributions" if `projectDetailError` is set post-generation attempt.*
    *   `[✅]` **Automatic Re-render:**
        *   `[UI]` (Verification) Confirm that the existing `displayedContributions` useMemo hook correctly re-evaluates and causes a re-render when `session.dialectic_contributions` (via `project` from the store) changes after the successful refetch of project details. This is likely already working given its dependencies.
            *   *Status: Verified as likely complete based on dependencies.*
    *   `[✅]` **[TEST-UNIT]` Update `SessionContributionsDisplayCard.tsx` unit tests:**
        *   `[✅]` Test the display of targeted loading skeletons/messages.
        *   `[✅]` Test the display of generation initiation messages.
        *   `[✅]` Test different scenarios for empty contributions.
        *   `[✅]` Test the display of error messages related to fetching contributions.
            *   *Status: Unknown without direct test file access.*

*   **[DOCS] Update Developer and UI/UX Documentation:**
    *   `[ ]` **Developer Docs:** Briefly document the new/refined store states (`isGeneratingContributions`, `contributionGenerationStatus`, usage of `isLoadingCurrentProjectDetail` in this context) and how UI components should consume them for providing feedback during the contribution lifecycle.
    *   `[ ]` **UI/UX Design Specs (if applicable):** Update any relevant UI/UX design specifications to reflect the new loading indicators and user feedback messages.
        *   *Status: Unknown without direct documentation file access.*

*   **[COMMIT] Commit changes for dynamic contribution display and UX enhancements for contribution generation.**
    *   `feat(dialectic-ui): enhance contribution display with dynamic loading and feedback`
    *   `test(dialectic-store): update tests for new contribution generation loading states`
    *   `test(dialectic-ui): update tests for SessionInfoCard and SessionContributionsDisplayCard loading states`
        *   *Status: Not applicable for AI to verify commits.*

*   [ ] Fix Clone so it works again. 
*   [ ] Fix Export so that it exports the entire project. 
*   [ ] Fix Delete to use the new path structuring
*   [X] Fix path_constructor so it does NOT append a filename to storage_path in "finalMainContentFilePath". 
    *    [X] For files that need filenames constructed, return the path and file name separately, not as a single string. 
*   [ ] Fix PromptParser to construct all stage prompts correctly
    *    [ ] Fill in all {variable} elements from the project details
    *    [ ] Append all prompt resources to the actual prompt sent 
*   [ ] Update all the prompts with the right content 
*   [ ] Add the sync/export button to the Paralysis stage   
*   [ ] Add a slice button to the Paralysis stage to take the selected plan, slice it according to an algorithm, then create a new project for each slice 

---

`[✅] 1. [BE] Design and Implement `path_deconstructor.ts` Utility**
    `[✅] a. [ARCH/DESIGN] Define `DeconstructedPathInfo` Interface`
        `[✅] i. [TYPES]` Analyze `supabase/functions/_shared/file_manager.types.ts` type PathContext to determine if it is appropriate to use as the `DeconstructedPathInfo` interface. This interface should include optional fields for all components that can be parsed from a path (e.g., `originalProjectId`, `shortSessionId`, `iteration`, `stageDirName`, `modelSlug`, `attemptCount`, `parsedFileNameFromPath`, and an optional `error` string). 
    `[✅] b. [BE/UTIL] Implement `deconstructStoragePath` Function`
        `[✅] i. [BE]` Create the file `supabase/functions/_shared/utils/path_deconstructor.ts`.
        `[✅] ii. [BE]` Implement the `deconstructStoragePath(storagePath: string, dbOriginalFileName?: string): DeconstructedPathInfo` function.
            `[✅] 1. [BE]` Use a series of regular expressions, ordered from most specific path structure to most general, to parse the input `storagePath`.
            `[✅] 2. [BE]` For each successful regex match, populate the `DeconstructedPathInfo` object with the extracted components.
            `[✅] 3. [BE]` Include logic to infer `fileTypeGuess` based on path structure or characteristic filenames (e.g., "seed_prompt.md", "project_readme.md"). This is a 'guess' because the authoritative `fileType` will come from the database record during `cloneProject`.
            `[✅] 4. [BE]` If the `dbOriginalFileName` is provided and relevant (e.g., for `model_contribution` types where parts of the context are in the filename), implement logic to parse it.
            `[✅] 5. [BE]` If no pattern matches, populate the `error` field in `DeconstructedPathInfo`.
    `[✅] c. [BE/UTIL] Implement Helper Utilities (if necessary)`
        `[✅] i. [BE]` If needed, implement `mapDirNameToStageSlug(dirName: string): string` as an inverse to `mapStageSlugToDirName` from `path_constructor.ts`. This is only required if `cloneProject` needs the original `rawStageSlug` and it differs from the `stageDirName` captured from the path. (Analyze `path_constructor.ts` usage to confirm necessity).

`[ ] 2. [TEST-UNIT] Develop Comprehensive Unit Tests for `path_constructor.ts` and `path_deconstructor.ts``
    `[✅] a. [TEST-UNIT] Create `path_deconstructor.test.ts``
        `[✅] i. [TEST-UNIT]` Write unit tests for each regex and parsing path within `deconstructStoragePath`. (RED)
        `[✅] ii. [TEST-UNIT]` Test with various valid storage paths representing all `FileType`s and their structural variations (e.g., with and without session/iteration/stage components, with attempt counts). (RED)
        `[✅] iii. [TEST-UNIT]` Test with edge cases and malformed paths to ensure robust error reporting. (RED)
        `[✅] iv. [BE]` Ensure `deconstructStoragePath` implementation passes all tests. (GREEN)
    `[ ] b. [TEST-UNIT] Implement Yin/Yang (Inverse Function) Testing Strategy`
        `[✅] i. [TEST-UNIT]` In `path_deconstructor.test.ts` (or a dedicated `path_constructor_inverse.test.ts`):
            `[✅] 1. [TEST-UNIT]` For every `FileType` defined in `file_manager.types.ts`:
                `[✅] a. [TEST-UNIT]` Construct a comprehensive set of valid `PathContext` objects covering all permutations (e.g., with/without optional `sessionId`, `iteration`, `stageSlug`, `modelSlug`, `attemptCount` as appropriate for the `FileType`).
                `[✅] b. [TEST-UNIT]` For each `pathContext`:
                    `[✅] i. [BE]` Generate `constructedPath = constructStoragePath(pathContext)`.
                    `[✅] ii. [BE]` Call `deconstructedInfo = deconstructStoragePath(constructedPath, pathContext.originalFileName)`.
                    `[✅] iii. [ASSERT]` Assert that `deconstructedInfo.error` is undefined.
                    `[✅] iv. [ASSERT]` Assert that `deconstructedInfo` correctly contains the structural components corresponding to the input `pathContext` (e.g., `deconstructedInfo.shortSessionId` matches `generateShortId(pathContext.sessionId)`, `deconstructedInfo.iteration` matches `pathContext.iteration`, `deconstructedInfo.stageDirName` matches `mapStageSlugToDirName(pathContext.stageSlug)`, etc.).
                    `[✅] v. [ASSERT]` Assert `deconstructedInfo.parsedFileNameFromPath` matches `sanitizeForPath(pathContext.originalFileName)` if the filename in path is dynamic, or the fixed filename (e.g., `project_readme.md`) if it's static for the `FileType`.
        `[✅] ii. [TEST-UNIT]` In `path_constructor.test.ts` (or the dedicated inverse test file):
            `[✅] 1. [TEST-UNIT]` For a representative set of valid storage path strings (covering all `FileType` variations):
                `[✅] a. [BE]` Call `deconstructedInfo = deconstructStoragePath(samplePath, sampleDbOriginalFileName)`.
                `[✅] b. [ASSERT]` Assert `deconstructedInfo.error` is undefined.
                `[✅] c. [BE]` Create a new `reconstructedPathContext: PathContext` using:
                    `[✅] i. ` `projectId: "new_test_project_id"` (or any consistent mock ID).
                    `[✅] ii. ` `fileType: deconstructedInfo.fileTypeGuess` (or the known `FileType` for the `samplePath`).
                    `[✅] iii. ` `originalFileName: sampleDbOriginalFileName` (or `deconstructedInfo.parsedFileNameFromPath` if that's the correct source for `originalFileName` in `PathContext`).
                    `[✅] iv. ` `sessionId: "new_test_session_id"` if `deconstructedInfo.shortSessionId` was present.
                    `[✅] v. ` `iteration: deconstructedInfo.iteration`.
                    `[✅] vi. ` `stageSlug: deconstructedInfo.stageDirName` (or `mapDirNameToStageSlug(deconstructedInfo.stageDirName)` if an inverse mapping is used).
                    `[✅] vii. ` `modelSlug: deconstructedInfo.modelSlug`.
                    `[✅] viii. ` `attemptCount: deconstructedInfo.attemptCount`.
                `[✅] d. [BE]` Generate `reconstructedPath = constructStoragePath(reconstructedPathContext)`.
                `[✅] e. [ASSERT]` Assert that `reconstructedPath` matches the `samplePath` structure, substituting the new project/session IDs. (e.g., `samplePath.replace(deconstructedInfo.originalProjectId, "new_test_project_id").replace(deconstructedInfo.shortSessionId, generateShortId("new_test_session_id"))`).
    `[✅] c. [REFACTOR]` Refactor `path_constructor.ts` and `path_deconstructor.ts` as needed until all inverse tests pass, ensuring they handle all `FileType`s and path variations correctly.

`[✅] 3. [BE/REFACTOR] Modify `cloneProject.ts` to Utilize `path_deconstructor.ts``
    `[✅] a. [BE/REFACTOR] Pre-computation of Session ID Maps`
        `[✅] i. [BE]` Before the `originalResources` loop, fetch all `originalSessions` for the `originalProjectId`.
        `[✅] ii. [BE]` Create `originalShortSessionIdToFullSessionIdMap: Map<string, string>`.
        `[✅] iii. [BE]` Create `originalFullSessionIdToNewFullSessionIdMap: Map<string, string>`.
        `[✅] iv. [BE]` Populate these maps by iterating `originalSessions`, generating a new UUID for each cloned session, and storing the mappings.
    `[✅] b. [BE/REFACTOR] Refactor Project Resources Cloning Loop`
        `[✅] i. [BE]` Within the `for (const res of originalResources)` loop:
            `[✅] 1. [BE]` Get `actualFileType = getFileTypeFromResourceDescription(res.resource_description)`.
            `[✅] 2. [BE]` Call `deconstructedInfo = deconstructStoragePath(res.storage_path, res.file_name)`.
            `[✅] 3. [BE]` If `deconstructedInfo.error` is present, log a critical error and decide on failure strategy (e.g., throw error to fail the entire clone).
            `[✅] 4. [BE]` Construct the `newPathContext: PathContext` for `FileManagerService.uploadAndRegisterFile`:
                `[✅] a. [BE]` `projectId: actualClonedProjectId`.
                `[✅] b. [BE]` `fileType: actualFileType`.
                `[✅] c. [BE]` `originalFileName: res.file_name` (from the original DB record).
                `[✅] d. [BE]` `sessionId`: If `deconstructedInfo.shortSessionId`, derive `newClonedSessionId` using the pre-computed maps. Set this in `newPathContext`.
                `[✅] e. [BE]` `iteration`: `deconstructedInfo.iteration`.
                `[✅] f. [BE]` `stageSlug`: `deconstructedInfo.stageDirName` (or its reverse-mapped equivalent if necessary).
                `[✅] g. [BE]` `modelSlug`: `deconstructedInfo.modelSlug`.
                `[✅] h. [BE]` `attemptCount`: `deconstructedInfo.attemptCount`.
            `[✅] 5. [BE]` **Crucial Validation Step:** Before calling `fileManager.uploadAndRegisterFile`, verify that `newPathContext` contains all mandatory fields required by `constructStoragePath` for the `actualFileType`. If not, log an error and handle failure. This step uses knowledge from `constructStoragePath`'s internal logic.
            `[✅] 6. [BE]` Proceed with `fileManager.uploadAndRegisterFile(newUploadContext)` (where `newUploadContext` uses `newPathContext`).
    `[✅] c. [BE/REFACTOR] Refactor Session Cloning Loop`
        `[✅] i. [BE]` Ensure that when new session records are inserted into `dialectic_sessions`, the `id` used is the pre-generated new UUID from `originalFullSessionIdToNewFullSessionIdMap.get(originalSession.id)`.
    `[✅] d. [BE/REFACTOR] Refactor Contributions Cloning Loop`
        `[✅] i. [BE]` Within the `for (const originalContrib of originalContributions)` loop:
            `[✅] 1. [BE]` For the main contribution file:
                `[✅] a. [BE]` `actualFileType = 'model_contribution_main'` (or derived if more specific, e.g. from `effectiveFileType` logic).
                `[✅] b. [BE]` If `originalContrib.storage_path` exists, call `deconstructedInfo = deconstructStoragePath(originalContrib.storage_path, originalContrib.file_name)`.
                `[✅] c. [BE]` If `deconstructedInfo.error` or path doesn't exist, handle appropriately (e.g., skip file, log warning, or potentially reconstruct context from DB fields if path is missing but file content exists).
                `[✅] d. [BE]` Construct `newContribPathContext: PathContext`:
                    `[✅] i. ` `projectId: actualClonedProjectId`.
                    `[✅] ii. ` `fileType: actualFileType`.
                    `[✅] iii. ` `originalFileName: effectiveFileName` (as determined by existing logic).
                    `[✅] iv. ` `sessionId: actualNewSessionId` (this is already known at this point in `cloneProject`).
                    `[✅] v. ` `iteration: deconstructedInfo.iteration` (or `originalContrib.iteration_number` if path parsing failed but DB field is reliable).
                    `[✅] vi. ` `stageSlug: deconstructedInfo.stageDirName` (or `originalContrib.stage`).
                    `[✅] vii. ` `modelSlug: deconstructedInfo.modelSlug` (or `sanitizeForPath(originalContrib.model_name)`).
                    `[✅] viii. ` `attemptCount: deconstructedInfo.attemptCount`.
                `[✅] e. [BE]` Validate `newContribPathContext` against `constructStoragePath` requirements for `actualFileType`.
                `[✅] f. [BE]` Update `contribUploadContext.pathContext` with `newContribPathContext`.
            `[✅] 2. [BE]` Similar deconstruction/reconstruction logic might be needed if `raw_response_storage_path` is parsed for context, though `FileManagerService` handles raw response files based on metadata more than its own distinct path usually. Focus on getting the main contribution path correct.
            `[✅] 3. [BE]` Proceed with `fileManager.uploadAndRegisterFile(contribUploadContext)`.

`[ ] 4. [TEST-INT] Integration Testing for `cloneProject.ts``
    `[ ] a. [TEST-INT]` Create/update integration tests for `cloneProject`.
        `[ ] i. [TEST-INT]` Test cloning a project with various structures:
            `[ ] 1. [TEST-INT]` Project with only project-level resources.
            `[ ] 2. [TEST-INT]` Project with sessions and session-specific resources (like `seed_prompt`s stored as project resources).
            `[ ] 3. [TEST-INT]` Project with sessions and contributions (including those with potential filename attempt counters).
        `[ ] ii. [TEST-INT]` In each test, after `cloneProject` completes:
            `[ ] 1. [ASSERT]` Verify the new project and session records are created correctly in the database.
            `[ ] 2. [ASSERT]` Fetch all `dialectic_project_resources` and `dialectic_contributions` for the *cloned* project.
            `[ ] 3. [ASSERT]` For each cloned resource/contribution, verify its `storage_path` is correctly structured for the *new* `projectId` and *new* `sessionId`(s), and matches what `constructStoragePath` would produce for its `FileType` and context.
            `[ ] 4. [ASSERT]` (Optional but recommended) Verify that the file content was actually copied/uploaded to the new path in Supabase Storage (requires mocking storage appropriately or careful setup/teardown if hitting a live dev storage).
        `[ ] iii. [TEST-INT]` Test error handling scenarios (e.g., if `deconstructStoragePath` returns an error for a critical file).

`[ ] 5. [DOCS] Documentation Updates`
    `[ ] a. [DOCS]` Create `supabase/functions/_shared/utils/path_deconstructor.md` (or similar) documenting its purpose, API, and the `DeconstructedPathInfo` interface.
    `[ ] b. [DOCS]` Update documentation for `cloneProject` to mention its reliance on `path_deconstructor` for path mapping.
    `[ ] c. [DOCS]` Update any architectural diagrams or file structure documentation if the understanding of path components has been refined.

`[ ] 6. [COMMIT] Final Commit and Code Review`
    `[ ] a. [COMMIT]` `feat(be,util): implement path_deconstructor and integrate into cloneProject for robust path mapping`
    `[ ] b. [COMMIT]` `test(be,util): add comprehensive unit and integration tests for path deconstruction and project cloning`
    `[ ] c. [REFACTOR]` Conduct a final code review of all changes.

---

# Centralizing Prompt Assembly Logic

### Phase 1: Prepare Shared Utilities

1.  **`Util`: `parseInputArtifactRules`**
    *   `[✅]` (`BE`) Identify `parseInputArtifactRules` function within `supabase/functions/dialectic-service/submitStageResponses.ts`.
    *   `[✅]` (`Test`) Write comprehensive unit tests for `parseInputArtifactRules`, covering valid structures, various rule types, optional fields, and error conditions (e.g., malformed JSON, missing required fields).
    *   `[✅]` (`BE`) Move `parseInputArtifactRules` and its related type `InputArtifactRules` (and `ArtifactSourceRule`) to a new shared utility file (e.g., `supabase/functions/_shared/utils/input-artifact-parser.ts`).
    *   `[✅]` (`BE`) Update `supabase/functions/dialectic-service/submitStageResponses.ts` to import `parseInputArtifactRules` and its types from the new shared location.
    *   `[✅]` (`Test`) Run existing tests for `submitStageResponses.ts` that might indirectly depend on this function to ensure they still pass after the import change.

2.  **`Util`: `downloadFromStorage` Access**
    *   `[✅]` (`BE`) Confirm `downloadFromStorage` (from `supabase/functions/_shared/supabase_storage_utils.ts`) is suitable and accessible for `PromptAssembler`.
    *   `[✅]` (`BE`) Ensure `PromptAssembler` (or its methods) can access the `STORAGE_BUCKET` environment variable, or have it passed appropriately if direct access is not ideal.

3.  **`Util`: `getInitialPromptContent` (Moved Utility)**
    *   `[✅]` (`BE`) Analyze `getInitialPromptContent` from `supabase/functions/dialectic-service/startSession.ts`.
    *   `[✅]` (`BE`) Move `getInitialPromptContent` from `startSession`. This function will be responsible for retrieving the initial user prompt for a project, whether it's stored directly or as a resource.
    *   `[✅]` (`Test`) Write unit tests for the new `getInitialPromptContent` utility, mocking DB calls and covering cases where the prompt is direct, a resource, or not found.

### Phase 2: Enhance `PromptAssembler` (`supabase/functions/_shared/prompt-assembler.ts`)

1.  **Update Type Definitions:**
    *   `[✅]` (`BE`) Review and update `ProjectContext`, `SessionContext`, and `StageContext` types if needed.
        *   Ensure `StageContext` includes `input_artifact_rules: Json | null` (or the parsed type).
        *   Consider if `ProjectContext` needs `user_domain_overlay_id` or similar for user-specific overlays if not already present.

2.  **Implement Private Method: `_gatherInputsForStage`**
    *   `[✅]` (`BE`) Define the method signature: `private async _gatherInputsForStage(stage: StageContext, project: ProjectContext, session: SessionContext, iterationNumber: number): Promise<{ priorStageContributions: string; priorStageFeedback: string }>`
    *   `[✅]` (`Test`) Outline unit test cases for `_gatherInputsForStage`:
        *   `[✅]` Stage with no `input_artifact_rules`.
        *   `[✅]` Rules fetching only contributions.
        *   `[✅]` Rules fetching only feedback.
        *   `[✅]` Rules fetching both contributions and feedback.
        *   `[✅]` Rules with custom `section_header`.
        *   `[✅]` Optional feedback file not found (should not error, provide default content).
        *   `[✅]` Required feedback file not found (should throw an error, mimicking `fetchAndAssembleArtifacts`).
        *   `[✅]` Error during DB query for contributions.
        *   `[✅]` Error during `downloadFromStorage` for contributions or feedback.
    *   `[✅]` (`BE`) Implement the logic for `_gatherInputsForStage`:
        *   `[✅]` Use `this.dbClient` for database operations.
        *   `[✅]` Import and use `parseInputArtifactRules` (from the shared utility created in Phase 1).
        *   `[✅]` Import and use `downloadFromStorage` (from `_shared/supabase_storage_utils.ts`).
        *   `[✅]` Adapt the artifact fetching logic from the original `fetchAndAssembleArtifacts` in `submitStageResponses.ts`. This includes querying `dialectic_contributions` and downloading feedback files based on `stage.input_artifact_rules`, `session.id`, and `iterationNumber`.
        *   `[✅]` Concatenate fetched content into `priorStageContributions` and `priorStageFeedback` strings, incorporating `section_header` from rules.
    *   `[✅]` (`Test`) Implement the unit tests for `_gatherInputsForStage`, using mocks for `dbClient`, `parseInputArtifactRules`, and `downloadFromStorage`.

3.  **Update Public Method: `assemble`**
    *   `[✅]` (`BE`) Modify the `assemble` method signature: `async assemble(project: ProjectContext, session: SessionContext, stage: StageContext, projectInitialUserPrompt: string, iterationNumber: number): Promise<string>`
    *   `[✅]` (`Test`) Outline unit test cases for the updated `assemble` method:
        *   `[✅]` Scenario: Assembling for the initial stage (e.g., `iterationNumber = 1`, `input_artifact_rules` might be minimal or empty).
        *   `[✅]` Scenario: Assembling for a subsequent stage (e.g., `iterationNumber > 1` or current `iterationNumber` if advancing, uses `_gatherInputsForStage`).
        *   `[✅]` Verification: Correct population of `dynamicContextVariables`, including:
            *   `user_objective`
            *   `domain`
            *   `agent_count`
            *   `initial_project_context` (new, from `projectInitialUserPrompt`)
            *   `prior_stage_ai_outputs` (from `_gatherInputsForStage`)
            *   `prior_stage_user_feedback` (from `_gatherInputsForStage`)
        *   `[✅]` Verification: Correct `basePromptText` (from `stage.system_prompts.prompt_text`).
        *   `[✅]` Verification: Correct `systemDefaultOverlayValues` (from `stage.domain_specific_prompt_overlays`).
        *   `[✅]` Verification: Handling of `userProjectOverlayValues` (e.g., fetched based on `project.selected_domain_overlay_id`).
    *   `[✅]` (`BE`) Implement the changes in `assemble`:
        *   `[✅]` Call `await this._gatherInputsForStage(stage, project, session, iterationNumber)` if `stage.input_artifact_rules` exist and are relevant.
        *   `[✅]` Update `dynamicContextVariables` creation:
            *   `[✅]` Set `dynamicContextVariables.initial_project_context = projectInitialUserPrompt;` (replacing/clarifying `context_description`).
            *   `[✅]` Populate `dynamicContextVariables.prior_stage_ai_outputs` and `dynamicContextVariables.prior_stage_user_feedback` using results from `_gatherInputsForStage`. Provide defaults like "N/A" or empty strings if no relevant rules or content.
            *   `[✅]` Retain other variables like `user_objective`, `domain`, `agent_count`, and placeholders for `deployment_context`, etc.
        *   `[✅]` Ensure `basePromptText` is sourced from `stage.system_prompts.prompt_text`.
        *   `[✅]` Ensure `systemDefaultOverlayValues` are sourced from `stage.domain_specific_prompt_overlays` associated with the current `stage`.
        *   `[✅]` Implement logic for `userProjectOverlayValues` (e.g., fetch using `project.selected_domain_overlay_id` if available).
    *   `[✅]` (`Test`) Write/update unit tests for the `assemble` method, mocking `_gatherInputsForStage` and other dependencies.
        *   `[✅]` Test Case 1: Initial Stage Assembly
        *   `[✅]` Test Case 2: Subsequent Stage Assembly
        *   `[✅]` Test Case 3: Missing System Prompt for Stage

### Phase 3: Refactor `startSession.ts` (`supabase/functions/dialectic-service/startSession.ts`)

1.  **Adapt `PromptAssembler` Usage:**
    *   `[✅]` (`Test`) Review existing unit tests for `startSession.ts` that cover prompt assembly. Identify necessary modifications to reflect the new `PromptAssembler.assemble` signature.
    *   `[✅]` (`BE`) Locate the existing call to `assembler.assemble`.
    *   `[✅]` (`BE`) Ensure `initialPrompt.content` (which is the `projectInitialUserPrompt` for the first stage) is correctly passed.
    *   `[✅]` (`BE`) Pass the current iteration number for a new session, which is `1`.
    *   `[✅]` (`BE`) Update the call to: `assembler.assemble(projectContext, sessionContextForAssembler, stageContext, initialPrompt.content, 1)`
    *   `[✅]` (`Test`) Update the unit tests for `startSession.ts`. Mock the `PromptAssembler.assemble` method and verify it's called with the correct arguments for an initial stage.

### Phase 4: Refactor `submitStageResponses.ts` (`supabase/functions/dialectic-service/submitStageResponses.ts`)

1.  **Integrate Enhanced `PromptAssembler`:**
    *   `[✅]` (`Test`) Review existing unit tests for `submitStageResponses.ts`, particularly those testing `prepareNextStageSeedPrompt` and `fetchAndAssembleArtifacts`. These tests will need significant updates.
    *   `[✅]` (`BE`) In the logic responsible for preparing the next stage's seed prompt (where `prepareNextStageSeedPrompt` was previously called):
        *   Instantiate `const assembler = new PromptAssembler(dbClient);`.
        *   Fetch `projectContext` (e.g., `sessionData.project` mapped to `ProjectContext`).
        *   Fetch `sessionContext` (e.g., `sessionData` mapped to `SessionContext`).
        *   `nextStage` (already fetched as `DialecticStage`) will serve as the `stage: StageContext` for the assembler. Ensure it includes `input_artifact_rules`, `system_prompts`, and `domain_specific_prompt_overlays`.
        *   Fetch the `projectInitialUserPrompt` using the utility from Phase 1.3: `const { content: projectInitialUserPrompt, error: initPromptError } = await fetchProjectInitialPrompt(sessionData.project.id, dbClient, logger);` (handle `initPromptError`).
        *   The `iterationNumber` for the `assemble` call should be `sessionData.iteration_count` (the current iteration, as `assemble` is preparing the prompt *for input into* models for this iteration of the *next stage*).
        *   Call `const assembledSeedPrompt = await assembler.assemble(projectContext, sessionContext, nextStage, projectInitialUserPrompt, sessionData.iteration_count);`.
        *   The `pathContext` for saving the assembled prompt can be constructed as before, using `nextStage.slug`, `sessionData.id`, `sessionData.iteration_count`.
    *   `[✅]` (`Test`) Update unit tests for `submitStageResponses.ts`:
        *   Mock `PromptAssembler.assemble` and verify it's called with the correct arguments (project context, session context, next stage details, project's initial prompt, current iteration number).
        *   Verify the prompt string returned by `assemble` is correctly used for saving the seed prompt file.

2.  **Remove Obsolete Logic:**
    *   `[✅]` (`BE`) Delete the `fetchAndAssembleArtifacts` function from `submitStageResponses.ts`.
    *   `[✅]` (`BE`) Delete the `prepareNextStageSeedPrompt` function from `submitStageResponses.ts`.
    *   `[✅]` (`BE`) If `parseInputArtifactRules` was not moved in Phase 1 (it should have been), remove its local definition.
    *   `[✅]` (`Chore`) Clean up any unused imports, variables, or types that were specific to the removed functions.

3.  **Final Test Pass for `submitStageResponses.ts`:**
    *   `[✅]` (`Test`) Ensure all unit and relevant integration tests for `submitStageResponses.ts` pass after the refactoring.

### Phase 5: Integration Testing and Finalization

1.  **End-to-End Integration Tests:**
    *   `[ ]` (`Test`) Write or update integration tests that cover the complete flow:
        *   `startSession`: Verify the creation of a session and the generation/storage of the correct initial seed prompt using the refactored `PromptAssembler`.
        *   `submitStageResponses`:
            *   Test a transition to a subsequent stage where `input_artifact_rules` require fetching prior contributions and/or feedback.
            *   Verify the refactored `PromptAssembler` is used to generate the next stage's seed prompt correctly, incorporating these artifacts.
            *   Verify the new seed prompt is stored correctly.
    *   Consider scenarios with different `input_artifact_rules` for different stages.

*   [ ] Update Domains to be non-auth so they load on the homepage
*   [ ] Update Domains to have is_enabled flag
*   [ ] Update DomainSelector to check is_enabled and only fetch enabled domains

**Integration Test Plan: Full Dialectic Workflow**

**1. Test Suite Setup (`describe`, `beforeAll`, `afterAll`, `beforeEach`, `afterEach`)**

*   `[ ] 1.1. [SETUP]` **`beforeAll`**:
    *   `[ ] 1.1.1.` Call `initializeTestDeps()` if not already handled globally.
    *   `[ ] 1.1.2.` Initialize a shared `adminClient` using `initializeSupabaseAdminClient()` for seeding and direct DB assertions.
*   `[ ] 1.2. [SETUP]` **`beforeEach`**:
    *   `[ ] 1.2.1.` Call `coreInitializeTestStep(config, 'local')` to:
        *   Create a primary test user (`primaryUserId`, `primaryUserClient`, `primaryUserJwt`).
        *   Seed all necessary prerequisite data using the `resources` array in `TestSetupConfig`. This is a critical step and will include:
            *   `dialectic_domains` (at least one relevant domain).
            *   `dialectic_process_templates` (one template that defines the 5 stages: Thesis, Antithesis, Synthesis, Parenthesis, Paralysis, with correct transitions).
            *   `dialectic_stages` (all 5 stages linked to the template, with `id`, `slug`, `display_name`, `stage_order`, and crucially, their `expected_output_artifacts` JSON as per Section 2.Z of your plan, and `input_artifact_rules` as per "Centralizing Prompt Assembly Logic").
            *   `dialectic_stage_transitions` (defining the flow between the 5 stages).
            *   `system_prompts` (one for each of the 5 stages, ensuring they include the "Formatting and Style Guide" if they produce structured docs, as per your plan).
            *   `domain_specific_prompt_overlays` (if your stages or prompts rely on them).
            *   `ai_model_catalog` (at least 2-3 mock AI models to simulate multi-model contributions).
            *   Seed a `dialectic_projects` record for the `primaryUserId`. Store its `id` as `testProjectId`.
    *   `[ ] 1.2.2.` Store `testProjectId`, `primaryUserId`, `primaryUserClient`, and `primaryUserJwt` for use in test steps.
*   `[ ] 1.3. [TEARDOWN]` **`afterEach`**:
    *   `[ ] 1.3.1.` Call `coreCleanupTestResources('local')` to clean up resources created during the test.
*   `[ ] 1.4. [TEARDOWN]` **`afterAll`**:
    *   `[ ] 1.4.1.` Call `coreTeardown()` if needed for global cleanup.

**2. Mocking AI Model Responses (`Deno` test suite)**

*   `[ ] 2.1. [MOCK]` Identify the core function(s) responsible for making actual AI API calls (e.g., `callUnifiedAIModel`, or specific provider calls like `callOpenAIChat` if `callUnifiedAIModel` is a wrapper). This function is likely within `generateContributions.ts` or `callModel.ts`.
*   `[ ] 2.2. [MOCK]` Mock this function globally for the test suite.
    *   The mock implementation should be dynamic enough to:
        *   Return different responses based on the current stage (`stageSlug`) and potentially the model being "called".
        *   Crucially, if Section 2.Z (`expected_output_artifacts`) is implemented, the mock AI response's `content` field **must be a stringified JSON object** that conforms to the `expected_output_artifacts` template for that specific stage.
        *   The JSON should include placeholders for content that will become files in the `documents/` directory.
        *   Example mock structure:
            ```typescript
            // In your test file
            deno.test('path/to/callUnifiedAIModel', () => ({
              callUnifiedAIModel: deno.fn().mockImplementation(async (modelId, promptContent, stageContext) => {
                // stageContext might contain stage.slug or expected_output_artifacts
                // For simplicity, assume stageSlug is available or derivable
                const stageSlug = stageContext.slug; // or parse from promptContent if necessary
                let responseContent = {};
                if (stageSlug === 'thesis') {
                  responseContent = { /* JSON for Thesis based on its expected_output_artifacts */ };
                } else if (stageSlug === 'antithesis') {
                  responseContent = { /* JSON for Antithesis */ };
                } // ... and so on for all 5 stages
                return {
                  content: JSON.stringify(responseContent),
                  contentType: 'application/json', // Or whatever your system expects
                  inputTokens: 100,
                  outputTokens: 200,
                  processingTimeMs: 500,
                  modelIdUsed: modelId,
                  // Any other fields your AIResponseFormat expects
                };
              })
            }));
            ```
*   `[ ] 2.3. [MOCK]` Ensure the mocked AI calls are registered for cleanup if necessary (though `deno.clearAllMocks()` in `afterEach` usually handles this).

**3. Test Case: Full Workflow (`it` block)**

*   `[ ] 3.1. [ACTION]` **Invoke `startSession` Edge Function**
    *   `[ ] 3.1.1.` Construct the payload for `startSession`: `{ projectId: testProjectId, sessionDescription: "Test Session", selectedModelIds: [mockModelId1, mockModelId2] }`.
    *   `[ ] 3.1.2.` Use `primaryUserClient.functions.invoke('dialectic-service', { body: { action: 'startSession', payload: startSessionPayload } })`.
    *   `[ ] 3.1.3.` Assert the invocation was successful and extract the `sessionId` from the response.
    *   `[ ] 3.1.4.` **DB Assertions:**
        *   Verify a `dialectic_sessions` record exists for `sessionId` linked to `testProjectId`.
        *   Verify `current_stage_id` points to the "Thesis" stage, `iteration_count` is 1.
    *   `[ ] 3.1.5.` **Storage Assertions (using `adminClient.storage`):**
        *   Verify `project_readme.md` exists at `projects/{project_slug}/project_readme.md`.
        *   Verify `initial_user_prompt.md` (or similar, based on `user_prompt` in file tree) exists.
        *   Verify `project_settings.json` exists.
        *   Verify the initial Thesis seed prompt: `projects/{project_slug}/session_{session_id_short}/iteration_1/1_thesis/seed_prompt.md`. (Helper function to get short session ID needed).

*   `[ ] 3.2. [WORKFLOW]` **Iterate `submitStageResponses` for Thesis, Antithesis, Synthesis, Parenthesis**
    *   For each stage (`stageSlug`, `stageDisplayName`, `nextStageSlug`):
        *   `[ ] 3.2.1.` Construct `submitStageResponsesPayload`:
            *   `projectId: testProjectId`, `sessionId`, `iterationNumber: 1`, `stageSlug: currentStageSlug`.
            *   `responses`: Simulate user input/feedback relevant for *this* stage (e.g., ratings, text comments for each contribution from the *previous* stage if applicable, or selections that will guide the *current* stage's AI generation). This part might be minimal for the first stage (Thesis) if it has no prior contributions to respond to. For subsequent stages, it's more critical.
            *   `userStageFeedback` (as per section 2.Y): `{ content: "Markdown feedback for " + stageDisplayName, feedbackType: "StageReviewSummary_v1" }`.
        *   `[ ] 3.2.2.` Invoke `primaryUserClient.functions.invoke('dialectic-service', { body: { action: 'submitStageResponses', payload: submitStageResponsesPayload } })`. Assert success.
        *   `[ ] 3.2.3.` **DB Assertions:**
            *   Verify `dialectic_contributions` records were created for the current stage, linked to `sessionId` and `iterationNumber: 1`, for each mock model.
            *   Verify `dialectic_feedback` record was created for the stage feedback file.
            *   Verify `dialectic_sessions.current_stage_id` is updated to `nextStageSlug`.
            *   Verify `dialectic_sessions.status` reflects processing/completion.
        *   `[ ] 3.2.4.` **Storage Assertions for current stage:**
            *   `projects/{project_slug}/session_{session_id_short}/iteration_1/{stage_dir_X}/raw_responses/{model_slug}_X_{stage_slug}_raw.json` (for each model).
            *   `projects/{project_slug}/session_{session_id_short}/iteration_1/{stage_dir_X}/{model_slug}_X_{stage_slug}.md` (main AI contributions).
            *   `projects/{project_slug}/session_{session_id_short}/iteration_1/{stage_dir_X}/user_feedback_{stage_slug}.md`.
            *   `projects/{project_slug}/session_{session_id_short}/iteration_1/{stage_dir_X}/documents/` (verify files based on the mock AI response and `expected_output_artifacts` for the current stage).
            *   Verify seed prompt for *next* stage: `projects/{project_slug}/session_{session_id_short}/iteration_1/{next_stage_dir}/seed_prompt.md`.

*   `[ ] 3.3. [WORKFLOW]` **Invoke `submitStageResponses` for Paralysis Stage (Final Stage)**
    *   `[ ] 3.3.1.` Construct `submitStageResponsesPayload` for "Paralysis" stage, similar to `3.2.1`.
    *   `[ ] 3.3.2.` Invoke `primaryUserClient.functions.invoke(...)`. Assert success.
    *   `[ ] 3.3.3.` **DB Assertions:** Similar to `3.2.3`, but `current_stage_id` might be null or a terminal state.
    *   `[ ] 3.3.4.` **Storage Assertions for Paralysis stage:** Similar to `3.2.4` for the "Paralysis" directory.
    *   `[ ] 3.3.5.` **Crucial File Tree Assertion (Paralysis Output):**
        *   The plan states: "Pending/ (System-managed folder populated as the final step of the Paralysis stage)".
        *   Verify that the main output of the Paralysis stage (e.g., the reordered checklist Markdown from the mocked AI response for Paralysis) is saved into the `projects/{project_slug}/Pending/` directory. The exact filename will depend on your system's logic for Paralysis outputs.

**4. Helper Functions for Assertions**

*   `[ ] 4.1. [UTIL]` Create a helper function `getProjectSlug(projectId)` (if not already available) or `getProjectNameSlug(projectName)` if project names are used for slugs.
*   `[ ] 4.2. [UTIL]` Create a helper `getShortSessionId(sessionId)` (e.g., first 8 chars).
*   `[ ] 4.3. [UTIL]` Create a helper `verifyFileExists(storageClient, bucket, path)` that lists and checks.
*   `[ ] 4.4. [UTIL]` Create a helper `mapStageSlugToDirName(stageSlug)` (e.g., "thesis" -> "1_thesis") if this mapping is consistent.

**Important Considerations:**

*   **Idempotency & Cleanup:** Your `_integration.test.utils.ts` with `registerUndoAction` is excellent for this. Ensure storage objects are also registered for cleanup.
*   **Error Handling in Test:** Assert that if an intermediate step fails, the test reports it clearly.
*   **Determinism:** The mocked AI responses are key to making this test deterministic.
*   **Test Data Management:** The seeding of `expected_output_artifacts`, `input_artifact_rules`, and system prompts must precisely match what your application logic expects.
*   **Focus of the Test:** This test primarily validates the orchestration of services, data flow, DB interactions, and Storage interactions. It *relies* on the unit/smaller integration tests for `FileManagerService`, `PromptAssembler`, `path_constructor`, etc., to be correct.

This detailed plan should provide a solid foundation for this complex but highly valuable integration test. Good luck!
2.  **Manual Verification (Optional but Recommended):**
    *   `[ ]` (`Chore`) If feasible, manually trigger the `startSession` and `submitStageResponses` functions with a sample project configuration to observe the behavior and inspect generated prompts in storage.

3.  **Code Review and Cleanup:**
    *   `[ ]` (`Chore`) Review all modified files (`prompt-assembler.ts`, `startSession.ts`, `submitStageResponses.ts`, and any new utility files) for code quality, clarity, comments, and adherence to project conventions.
    *   `[ ]` (`Chore`) Ensure all `TODOs` introduced during this refactoring are either addressed or documented for future work.

4.  **Documentation (If Applicable):**
    *   `[ ]` (`Docs`) If any architectural diagrams or developer documentation describe the prompt assembly process, update them to reflect the new centralized approach in `PromptAssembler`.

---

## Section 2.Z: Implementing Data-Driven AI Response Formatting via `expected_output_artifacts`

**Objective:** To standardize and control the structure of AI model responses by leveraging the `dialectic_stages.expected_output_artifacts` JSONB column. This column will store a JSON template defining the exact output format expected from the AI for each stage. The backend will wrap this template with a strong "meta-instruction" to guide the AI, parse the JSON response, and process the structured deliverables.

**Core Principles:**
*   **Declarative Formatting:** Define AI output structures in the database, not in code.
*   **Strong Guidance:** Use explicit meta-instructions to maximize AI compliance.
*   **Parsing Robustness:** Expect and parse a JSON object from the AI.
*   **Controlled Filenaming:** Use fixed filenames in the AI-requested template, then map them to dynamic, system-defined filenames upon processing.

---

*   `[ ] 2.Z.1 [DB/SEED]` **Define and Populate `expected_output_artifacts` Templates**
    *   `[ ] 2.Z.1.1 [ARCH/DESIGN]` **Finalize JSON Structure for Deliverables**
        *   Define a consistent master JSON structure template that can be adapted for each stage. This structure should include keys for all common deliverable types (e.g., `executive_summary`, `main_content_markdown`, `risk_assessment`, and an array for `files` like `[{ "template_filename": "fixed_prd.md", "content": "..."}]`).
    *   `[ ] 2.Z.1.2 [DB/MIGRATION]` **Create/Update Migration/Seeding Script for `expected_output_artifacts`**
        *   For each `dialectic_stages` record (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis):
            *   Populate the `expected_output_artifacts` column with a stage-specific JSON object template. This template will instruct the AI on how to structure its entire response.
            *   **Example for Thesis Stage (Illustrative):**
                ```json
                {
                  "executive_summary": "placeholder for executive summary",
                  "detailed_implementation_strategy": "placeholder for implementation strategy",
                  "development_checklist": ["placeholder for step 1"],
                  "risk_assessment_and_mitigation": "placeholder for risk assessment",
                  "success_metrics": "placeholder for success metrics",
                  "files_to_generate": [
                    {
                      "template_filename": "thesis_product_requirements_document.md",
                      "content_placeholder": "complete markdown content for PRD here"
                    },
                    {
                      "template_filename": "thesis_implementation_plan_proposal.md",
                      "content_placeholder": "complete markdown content for implementation plan here"
                    }
                  ]
                }
                ```
            *   Ensure filenames within `files_to_generate` are fixed (e.g., `stage_specific_output_type.md`).
    *   `[ ] 2.Z.1.3 [DOCS]` Document the standard JSON structure and the purpose of `expected_output_artifacts` in the project's technical documentation.
    *   `[ ] 2.Z.1.4 [COMMIT]` `feat(db): define and seed expected_output_artifacts templates for dialectic stages`

*   `[ ] 2.Z.2 [BE/PROMPT]` **Design and Implement Meta-Instruction Wrapper**
    *   `[ ] 2.Z.2.1 [PROMPT]` **Craft the Meta-Instruction String**
        *   Develop a clear, forceful instruction block that will precede the JSON template from `expected_output_artifacts` in the prompt sent to the AI.
        *   **Example:**
            ```
            SYSTEM: Your entire response for this stage MUST be a single, valid JSON object. Strictly adhere to the JSON structure provided below under 'Expected JSON Output Structure:'. Populate all placeholder values (e.g., "placeholder for ...", "complete markdown content here") with your generated content. Do not include any conversational text, acknowledgments, apologies, or any other content outside of this JSON object. The JSON object must begin with '{' and end with '}'.

            Expected JSON Output Structure:
            ```
            *(This will be followed by the JSON template)*
            ```
            Ensure your response is ONLY the JSON object. End of instructions.
            ```
    *   `[ ] 2.Z.2.2 [BE]` In `dialectic-service` (e.g., within `callUnifiedAIModel` or a prompt assembly utility):
        *   Implement logic to fetch the `expected_output_artifacts` JSON for the current `DialecticStage`.
        *   If `expected_output_artifacts` is present and valid:
            *   Prepend the crafted meta-instruction.
            *   Append the stringified JSON from `expected_output_artifacts`.
            *   Append the concluding part of the meta-instruction ("Ensure your response is ONLY the JSON object. End of instructions.").
            *   This becomes part of the main user/assistant prompt content sent to the AI model.
    *   `[ ] 2.Z.2.3 [TEST-UNIT]` Write unit tests for the prompt assembly logic to verify correct construction of the meta-instruction and template inclusion. (RED then GREEN)
    *   `[ ] 2.Z.2.4 [COMMIT]` `feat(be): implement meta-instruction wrapper for JSON response formatting`

*   `[ ] 2.Z.3 [BE/SERVICE]` **Implement AI Response Parsing and Deliverable Processing**
    *   `[ ] 2.Z.3.1 [BE]` In `dialectic-service` (e.g., in `generateContributions.ts` or where `callUnifiedAIModel`'s response is handled):
        *   Attempt to `JSON.parse()` the AI's entire text response.
        *   If parsing fails:
            *   Log the error and the malformed response.
            *   Implement error handling (e.g., return a specific error to the user, potentially attempt a retry with a stronger instruction).
    *   `[ ] 2.Z.3.2 [BE]` If JSON parsing succeeds:
        *   Extract the various deliverables based on the known keys from the `expected_output_artifacts` template (e.g., `parsedResponse.executive_summary`, etc.).
        *   For each item in the `parsedResponse.files_to_generate` array (or similar key):
            *   Get the `template_filename` and `content`.
            *   **Implement Dynamic Filename Mapping:** Convert the `template_filename` (e.g., `"thesis_product_requirements_document.md"`) into the actual dynamic filename required by `FileManagerService` (e.g., incorporating `model_slug`, `stage_slug`, `iteration`, `attempt_count`). This logic will reside in `generateContributions.ts`.
            *   Determine the correct `FileType` for `FileManagerService` based on the `template_filename` or other metadata (e.g., 'contribution\_document\_prd', 'contribution\_document\_plan').
            *   Use `FileManagerService.uploadAndRegisterFile` to save the `content` with the dynamic filename, correct `FileType`, and other necessary context (`projectId`, `sessionId`, `model_id_used`, tokenomics data, etc.).
        *   Store other non-file deliverables (like `executive_summary`) appropriately. This might involve new columns on `dialectic_contributions` if they are distinct from the main Markdown file content, or they could be part of a primary "summary" artifact. *Decision: For now, assume these are fields within a primary structured contribution; if they need to be separate files, the JSON template and parsing must reflect that.*
    *   `[ ] 2.Z.3.3 [TEST-INT]` Write integration tests for `generateContributions.ts`: (RED then GREEN)
        *   Mock `callUnifiedAIModel` to return a stringified JSON adhering to a sample `expected_output_artifacts` template.
        *   Assert that the JSON is parsed correctly.
        *   Assert that `FileManagerService.uploadAndRegisterFile` is called for each file in the `files_to_generate` array with correctly mapped dynamic filenames and `FileType`.
        *   Test scenarios with malformed JSON responses from the AI.
    *   `[ ] 2.Z.3.4 [COMMIT]` `feat(be): implement JSON response parsing and dynamic file processing in dialectic-service`

*   `[ ] 2.Z.4 [REFACTOR]` **Review and Refine**
    *   `[ ] 2.Z.4.1 [PROMPT/BE]` Test the entire flow with actual AI models. Refine the meta-instruction and JSON templates in `expected_output_artifacts` based on observed AI compliance and any parsing issues.
    *   `[ ] 2.Z.4.2 [CODE]` Ensure all related code (prompt assembly, response parsing, error handling) is robust and well-documented.

*   `[ ] 2.Z.5 [DOCS]` **Update System Documentation**
    *   `[ ] 2.Z.5.1 [DOCS]` Document the new `expected_output_artifacts` column, its purpose, and the standard JSON structure.
    *   `[ ] 2.Z.5.2 [DOCS]` Document the prompt assembly logic, including the meta-instruction.
    *   `[ ] 2.Z.5.3 [DOCS]` Document the response parsing and dynamic filename mapping logic.
    *   `[ ] 2.Z.5.4 [COMMIT]` `docs: document data-driven AI response formatting mechanism`

---You're thinking ahead very effectively! Ensuring that the AI-generated implementation plans and checklists are well-structured, human-readable, and adhere to a consistent style is crucial for their practical use. Your refined legend and numbering scheme are excellent improvements.

This "Formatting and Style Guide" should indeed be part of the instructions provided to the AI. The best place for this is within the `prompt_text` of the `system_prompts` table, specifically for those system prompts associated with stages that are expected to produce these structured documents (e.g., the system prompt for the "Parenthesis" stage).

Let's extend "Section 2.Z" in your `AI Dialectic Implementation Plan Phase 2.md` to include these steps. I'll rename the section slightly to encompass both the JSON response structure and this content styling.

---

**Formatting and Style Guide for Implementation Plans & Checklists:**

When generating implementation plans, detailed checklists, or any hierarchically structured task lists, you MUST adhere to the following formatting and style guide precisely:

1.  **Overall Structure:**
    *   Organize all plans and checklists into clear, hierarchical sections.
    *   Start with high-level phases or major components and progressively detail sub-tasks and steps.

2.  **Task Status Legend:**
    *   Prefix EVERY actionable task item with one of the following status markers:
        *   `[ ]` : Unstarted task.
        *   `[✅]` : Completed task (use sparingly, as you are generating a plan for future work).
        *   `[🚧]` : Task is in progress or partially completed (use sparingly).
        *   `[⏸️]` : Task is paused or waiting for external input/clarification.
        *   `[❓]` : There is significant uncertainty about this task that needs resolution.
        *   `[🚫]` : Task is blocked by an unresolved issue or dependency.
    *   The status marker is mandatory for all list items that represent an actionable step.

3.  **Component Type Labels (Optional but Recommended):**
    *   If a task directly relates to a specific type of system component or development activity, include ONE of the following labels immediately after the status marker and before the task description.
    *   Use these labels judiciously where they add clarity.
    *   Available Labels: `[DB]`, `[RLS]`, `[BE]`, `[API]`, `[STORE]`, `[UI]`, `[CLI]`, `[IDE]`, `[TEST-UNIT]`, `[TEST-INT]`, `[TEST-E2E]`, `[DOCS]`, `[REFACTOR]`, `[PROMPT]`, `[CONFIG]`.
    *   Example: `[ ] [BE] Implement user authentication endpoint.`

4.  **Numbering, Lettering, and Indentation Scheme:**
    *   You MUST use the following scheme for hierarchical levels:
        *   **Level 1 (Main Headings/Phases):** `[ ] 1. Task Description`
        *   **Level 2 (Sub-tasks/Components):** `[ ] a. Task Description` (indented under Level 1)
        *   **Level 3 (Detailed Steps):** `[ ] i. Task Description` (indented under Level 2)
    *   Ensure proper Markdown indentation for nested lists to render correctly.
    *   For clarity, try to limit nesting to these three levels. If a fourth level is absolutely essential for a very specific detail, you may restart with `1.` (indented under `i.`), or use a simple unnumbered bullet `-` for very fine-grained sub-points. Avoid overly deep numerical nesting (e.g., 1.2.3.4.5.a.i).

5.  **Task Descriptions:**
    *   Keep task descriptions clear, actionable, and concise.
    *   Start task descriptions with a verb where appropriate.

6.  **Plan Development Principles:**
    *   **TDD (Test-Driven Development):** For any implementation tasks, explicitly include steps for writing tests *before* writing the implementation code. For example:
        *   `[ ] [TEST-UNIT] Write failing unit tests for the new service (RED).`
        *   `[ ] [BE] Implement the core logic for the new service (GREEN).`
        *   `[ ] [REFACTOR] Refactor the new service code and tests.`
    *   **Modularity:** Design components and tasks to be modular and reusable.
    *   **Dependencies:** If tasks have clear dependencies, you can note them, but the hierarchical structure should imply the primary flow.
    *   **Documentation:** Include explicit tasks for documentation (e.g., `[ ] [DOCS] Update the API documentation for the new endpoint.`).

**Example of Expected Output Format:**

```markdown
[ ] 1. [BE] Phase 1: Setup Core Backend Infrastructure
    [ ] a. [DB] Define database schema for user profiles.
    [ ] b. [TEST-UNIT] Write failing unit tests for profile creation (RED).
    [ ] c. [BE] Implement API endpoint for user profile creation (GREEN).
        [ ] i. [BE] Add input validation.
        [ ] ii. [BE] Implement database insertion logic.
    [ ] d. [DOCS] Document the user profile API endpoint.
[ ] 2. [UI] Phase 2: Develop User Interface
    [ ] a. [UI] Design wireframes for the registration page.
    [ ] b. [UI] Implement the registration form component.
```

By including such a guide in your system prompts, you are setting clear expectations for the AI, which should lead to more consistent, human-readable, and useful implementation plans and checklists. This aligns perfectly with making your overall system more robust and predictable.

## Section 2.Z: Implementing Data-Driven AI Response Formatting & Content Styling

**Objective:** To standardize and control both the *structure of AI model JSON responses* and the *formatting/style of detailed textual deliverables (like implementation plans)*. This involves using the `dialectic_stages.expected_output_artifacts` JSONB column for overall response structure and embedding a "Formatting and Style Guide" within relevant `system_prompts.prompt_text` for content styling.

**Core Principles:**
*   **Declarative Formatting:** Define AI output structures (JSON) and content styles (Markdown plans) in the database.
*   **Strong Guidance:** Use explicit meta-instructions and style guides to maximize AI compliance.
*   **Parsing Robustness:** Expect and parse a JSON object from the AI.
*   **Controlled Filenaming:** Use fixed filenames in the AI-requested template, then map them to dynamic, system-defined filenames upon processing.
*   **Content Usability:** Ensure generated plans/checklists are human-readable and consistently formatted.

---

*   `[ ] 2.Z.1 [PROMPT/DOCS]` **Develop the "Formatting and Style Guide" for Structured Documents**
    *   `[ ] 2.Z.1.1 [PROMPT]` Finalize the detailed text for the "Formatting and Style Guide." This guide should include:
        *   The refined Task Status Legend (e.g., `[ ] 1.`, `[ ] a.`, `[ ] i.`).
        *   Instructions for using Component Type Labels (e.g., `[BE]`, `[UI]`).
        *   Guidance on task description clarity, hierarchical structure, and limiting nesting depth.
        *   Emphasis on plan development principles like TDD.
        *   A clear example of the expected output format for a small plan.
    *   `[ ] 2.Z.1.2 [DOCS]` Store this finalized guide text. If it's extensive, consider placing it in a shared, version-controlled document referenced by system prompts, or as a constant in a shared backend module if it needs programmatic access. For direct use, it will be embedded into system prompt texts.

*   `[ ] 2.Z.2 [DB/SEED]` **Update `system_prompts` with Formatting and Style Guide**
    *   `[ ] 2.Z.2.1 [DB/PROMPT]` Identify all `system_prompts` records (e.g., the default system prompts for "Parenthesis", "Paralysis", or any custom stage that should produce detailed plans/checklists) that require this style guide.
    *   `[ ] 2.Z.2.2 [DB/MIGRATION]` Create or update a database migration/seeding script to modify the `prompt_text` of these identified `system_prompts`.
        *   Embed the full "Formatting and Style Guide" (from `2.Z.1.1`) into the `prompt_text`. This guide should be clearly delineated within the system prompt (e.g., under a heading like "**Formatting and Style Guide for Implementation Plans & Checklists:**").
        *   This ensures the AI receives these styling instructions as part of its core task directions for that stage.
    *   `[ ] 2.Z.2.3 [COMMIT]` `feat(db,prompt): integrate formatting/style guide into relevant system prompts`

*   `[ ] 2.Z.3 [DB/SEED]` **Define and Populate `expected_output_artifacts` JSON Templates**
    *   `[ ] 2.Z.3.1 [ARCH/DESIGN]` Finalize the master JSON structure template for AI responses (as previously discussed in the original 2.Z.1.1). This template dictates keys like `executive_summary`, `files_to_generate`, etc.
    *   `[ ] 2.Z.3.2 [DB/MIGRATION]` Ensure the migration/seeding script for `dialectic_stages.expected_output_artifacts` (from the original 2.Z.1.2) correctly populates this column for each stage with its specific JSON response template.
        *   The `content_placeholder` for any deliverable that is a structured plan/checklist (e.g., `"content_placeholder": "complete markdown content for implementation plan here, adhering to the provided Formatting and Style Guide"`) implicitly relies on the AI having received the style guide via the system prompt.
    *   `[ ] 2.Z.3.3 [DOCS]` Document the standard JSON structure and the purpose of `expected_output_artifacts`.
    *   `[ ] 2.Z.3.4 [COMMIT]` `feat(db): define and seed expected_output_artifacts JSON templates for dialectic stages` (Commit may be merged with 2.Z.2.3 if done in one migration).

*   `[ ] 2.Z.4 [BE/PROMPT]` **Implement Meta-Instruction Wrapper for JSON Response Structure**
    *   `[ ] 2.Z.4.1 [PROMPT]` Craft the "meta-instruction" string that explicitly tells the AI to respond ONLY in the provided JSON format (as in the original 2.Z.2.1). This meta-instruction will wrap the JSON template taken from `expected_output_artifacts`.
        *   **Refined Example considering SYSTEM prefix and EOF:**
            ```
            SYSTEM: Your entire response for this stage MUST be a single, valid JSON object. Strictly adhere to the JSON structure provided below under 'Expected JSON Output Structure:'. Populate all placeholder values (e.g., "placeholder for ...", "complete markdown content here") with your generated content. Do not include any conversational text, acknowledgments, apologies, or any other content outside of this JSON object. The JSON object must begin with '{' and end with '}'.

            Expected JSON Output Structure:
            [Insert JSON template from expected_output_artifacts here by the backend]

            CRITICAL REMINDER: Ensure your response is ONLY the JSON object detailed above. End of Instructions. END_OF_RESPONSE_FORMAT_INSTRUCTIONS.
            ```
    *   `[ ] 2.Z.4.2 [BE]` In `dialectic-service` (e.g., within a prompt assembly utility called by `generateContributions.ts` before `callUnifiedAIModel`):
        *   Fetch the `default_system_prompt_id` for the current `DialecticStage`.
        *   Fetch the `prompt_text` from `system_prompts` using this ID (this text now includes the "Formatting and Style Guide").
        *   Fetch the `expected_output_artifacts` JSON string for the current `DialecticStage`.
        *   If `expected_output_artifacts` is present:
            *   Construct the full user-facing part of the prompt by:
                1.  Taking the main task description/context for the stage.
                2.  Appending the meta-instruction (from `2.Z.4.1`).
                3.  Appending the `expected_output_artifacts` JSON string itself.
                4.  Appending the concluding part of the meta-instruction.
        *   The final prompt sent to the AI model will consist of:
            1.  The fetched system prompt content (which includes the style guide).
            2.  The assembled user-facing prompt (task + JSON output structure instructions).
    *   `[ ] 2.Z.4.3 [TEST-UNIT]` Write unit tests for the full prompt assembly logic, verifying correct inclusion and ordering of the system prompt (with style guide), task prompt, meta-instruction, and the JSON template. (RED then GREEN)
    *   `[ ] 2.Z.4.4 [COMMIT]` `feat(be): implement full prompt assembly including style guide and JSON meta-instructions`

*   `[ ] 2.Z.5 [BE/SERVICE]` **Implement AI JSON Response Parsing and Deliverable Processing**
    *   `(Sub-steps 2.Z.3.1 to 2.Z.3.3 from the original plan remain largely the same, now referred to as 2.Z.5.1 to 2.Z.5.3)`
    *   `[ ] 2.Z.5.1 [BE]` Attempt to `JSON.parse()` the AI's entire text response. Handle parsing failures.
    *   `[ ] 2.Z.5.2 [BE]` If JSON parsing succeeds:
        *   Extract deliverables based on keys from the `expected_output_artifacts` template.
        *   For items in `files_to_generate`:
            *   Implement dynamic filename mapping (fixed template filename to system's dynamic filename).
            *   Determine `FileType`.
            *   Use `FileManagerService.uploadAndRegisterFile` to save content. Ensure the content (which should be Markdown formatted according to the style guide) is passed correctly.
        *   Store other non-file deliverables.
    *   `[ ] 2.Z.5.3 [TEST-INT]` Write/update integration tests for `generateContributions.ts` to reflect this full flow. (RED then GREEN)
    *   `[ ] 2.Z.5.4 [COMMIT]` `feat(be): implement JSON response parsing and processing with styled content`

*   `[ ] 2.Z.6 [REFACTOR]` **Review, Test, and Refine**
    *   `[ ] 2.Z.6.1 [PROMPT/BE]` Test the entire flow with actual AI models. Refine the "Formatting and Style Guide" in `system_prompts`, the meta-instruction for JSON output, and the JSON templates in `expected_output_artifacts` based on AI compliance and quality of generated content/structure.
    *   `[ ] 2.Z.6.2 [CODE]` Ensure all related code is robust and well-documented.

*   `[ ] 2.Z.7 [DOCS]` **Update System Documentation**
    *   `(Sub-steps 2.Z.5.1 to 2.Z.5.3 from the original plan remain relevant, now 2.Z.7.1 to 2.Z.7.3)`
    *   `[ ] 2.Z.7.1 [DOCS]` Document `expected_output_artifacts` (purpose, JSON structure).
    *   `[ ] 2.Z.7.2 [DOCS]` Document the "Formatting and Style Guide" and its location/integration within system prompts.
    *   `[ ] 2.Z.7.3 [DOCS]` Document the full prompt assembly logic (system prompt + style guide + task + meta-instruction + JSON template).
    *   `[ ] 2.Z.7.4 [DOCS]` Document response parsing, dynamic filename mapping, and processing of styled content.
    *   `[ ] 2.Z.7.5 [COMMIT]` `docs: update documentation for data-driven AI response formatting and content styling`

---

**Understanding the Core Challenge for AI:**

*   **Gap Identification (Parenthesis):** This requires the AI to not just generate content, but to *analyze* existing content (the checklist from Synthesis) and identify what's *missing*. It needs to infer unstated prerequisites.
*   **Dependency-Driven Reordering (Paralysis):** This is even harder. It requires the AI to build a mental (or implicit) dependency graph of a potentially very long list of tasks and then re-linearize it. This is akin to a topological sort.

**General Prompting Strategies for Parenthesis & Paralysis:**

1.  **Clear Role and Context:**
    *   Assign a specific expert role to the AI (e.g., "You are a Senior Technical Architect and Project Planner responsible for ensuring the completeness and logical flow of implementation plans.").
    *   Clearly state the purpose of the current stage (Parenthesis or Paralysis).
    *   Provide the *entire* current checklist (from Synthesis for Parenthesis, from Parenthesis for Paralysis) as the primary input.

2.  **Explicit Instructions on *How* to Analyze:**
    *   Don't just say "find gaps." Guide its thought process.
    *   Don't just say "reorder." Explain the reordering principle.

3.  **Output Format Reinforcement:**
    *   Continuously remind it of your desired checklist formatting (your refined legend `[ ] 1.`, `[ ] a.`, `[ ] i.`, component labels `[BE]`, etc.).
    *   Remind it to produce the *entire* modified checklist as output, not just the changes.
    *   Reinforce the need for the final output to be wrapped in the JSON structure defined by `expected_output_artifacts`.

4.  **Leverage Strengths, Mitigate Weaknesses:**
    *   AI is good at pattern matching and local context. Your "first mention" rule for Paralysis is a good way to give it a concrete heuristic.
    *   AI struggles with long-term memory and global consistency across very long documents. Breaking down the analysis might help.

**Structuring the Prompt for the "Parenthesis" Stage (Gap Analysis & Elaboration):**

**Goal:** To take the checklist from Synthesis and add missing steps/sections.

```
SYSTEM: Your entire response for this stage MUST be a single, valid JSON object. Strictly adhere to the JSON structure provided below under 'Expected JSON Output Structure:'. Populate all placeholder values with your generated content. Do not include any conversational text, acknowledgments, apologies, or any other content outside of this JSON object. The JSON object must begin with '{' and end with '}'.

You are a meticulous Senior Software Architect and Technical Planner. Your current task is to review and enhance an existing software implementation plan to ensure its absolute completeness. This is the "Parenthesis" stage of a dialectic process.

**Input Implementation Plan/Checklist:**
(Your backend service will insert the full checklist from the Synthesis stage here)

**Your Task for the Parenthesis Stage (Gap Analysis and Elaboration):**

1.  **Thoroughly Review:** Carefully read the entire "Input Implementation Plan/Checklist" provided above.
2.  **Identify Missing Prerequisites & Gaps:** As you review, critically analyze the plan for any missing steps or components. Specifically look for:
    *   Tasks that refer to components, modules, functions, data stores, UI elements, API endpoints, or services that have not yet been defined OR whose creation/setup steps are not detailed *earlier* in the plan.
    *   Assumptions about the existence of foundational elements (e.g., project setup, core libraries, authentication context) without explicit checklist items for their establishment.
    *   Descriptions of interactions (e.g., "Component X calls API Y," "Store Z fetches data from Backend Service A") where any part of that interaction (X, Y, Z, A, or the specific endpoint/function) has not been adequately planned for.
    *   Steps that are too vague or high-level and require more detailed sub-tasks for a developer to implement effectively.
3.  **Generate and Insert Missing Sections/Steps:** For each identified gap or overly vague step:
    *   Generate a new, comprehensive set of checklist items required to design, implement, test, and document the missing element or to elaborate on the vague step.
    *   These new items MUST strictly follow the "Formatting and Style Guide for Implementation Plans & Checklists" (using `[ ] 1.`, `[ ] a.`, `[ ] i.` numbering, status markers `[ ]`, and component labels like `[BE]`, `[UI]`, etc., as previously defined).
    *   **Insertion Strategy:** Logically insert these new sections/steps into the plan. The ideal placement is *just before* the point where the missing element is first needed or used, or where the vague step needs detail. If it's a major new component, it might form its own new top-level section (e.g., a new `[ ] N. Define and Implement New Core Service Z`).
4.  **Maintain Original Content and Structure:** Preserve all existing, valid checklist items and their relative order where no gaps are being filled around them. Your goal is to *augment and complete* the plan, not to reorder it at this stage.
5.  **Output the Complete, Enhanced Plan:** Your final output must be the *entire, revised implementation plan*, incorporating all your additions and elaborations. This output will be the content for the primary checklist file defined in the 'Expected JSON Output Structure' below.

Expected JSON Output Structure:
(Your backend service will insert the JSON template from dialectic_stages.expected_output_artifacts for the Parenthesis stage here. This template will specify where the AI should place the full, revised checklist string.)

CRITICAL REMINDER: Ensure your response is ONLY the JSON object detailed above. End of Instructions. END_OF_RESPONSE_FORMAT_INSTRUCTIONS.
```

**Structuring the Prompt for the "Paralysis" Stage (Dependency-Driven Reordering):**

**Goal:** To take the (now more complete) checklist from Parenthesis and reorder it logically based on dependencies.

```
SYSTEM: Your entire response for this stage MUST be a single, valid JSON object. Strictly adhere to the JSON structure provided below under 'Expected JSON Output Structure:'. Populate all placeholder values with your generated content. Do not include any conversational text, acknowledgments, apologies, or any other content outside of this JSON object. The JSON object must begin with '{' and end with '}'.

You are an expert Project Planner and System Architect specializing in optimizing software development workflows by ensuring strict dependency ordering. Your current task is to take a detailed (but potentially unordered) implementation plan and resequence it into a perfectly logical, step-by-step, buildable order. This is the "Paralysis" stage of a dialectic process.

**Input Implementation Plan/Checklist:**
(Your backend service will insert the full checklist from the Parenthesis stage here)

**Your Task for the Paralysis Stage (Dependency-Driven Reordering):**

1.  **Deeply Analyze Dependencies:** Meticulously examine every task, sub-task, and component mentioned in the "Input Implementation Plan/Checklist." Identify all explicit and implicit dependencies. For example:
    *   A UI component displaying data depends on the API endpoint that provides the data.
    *   An API endpoint depends on the backend service logic that implements it.
    *   A backend service might depend on a database schema or another service.
    *   Store actions/selectors depend on API client methods being available.
    *   Tests for a feature depend on the feature itself being implemented.
2.  **Reorder Based on "First Mention, Full Implementation Prioritization":**
    *   Your primary goal is to reconstruct the *entire* checklist such that: When any component, module, function, data store, API, UI element, or service (let's call it 'Element X') is *first mentioned* as being needed, used by, or a prerequisite for another task in the plan, then ALL checklist items required to fully design, implement, test, and document 'Element X' MUST be placed *immediately before* that first mentioning task.
    *   This ensures that no task attempts to use or refer to an 'Element X' before all steps for 'Element X's' creation and readiness have been listed.
3.  **Maintain Granularity and Enforce Formatting:**
    *   Do not lose, merge, or alter the content of any individual task descriptions from the input plan. Preserve all detailed sub-tasks.
    *   The reordered plan MUST strictly adhere to the "Formatting and Style Guide for Implementation Plans & Checklists" (using `[ ] 1.`, `[ ] a.`, `[ ] i.` numbering, status markers `[ ]`, and component labels like `[BE]`, `[UI]`, etc., as previously defined). You will need to re-number and re-letter the *entire plan* according to its new logical sequence.
4.  **Handle Ordering Conflicts:** If you encounter what appear to be circular dependencies that cannot be easily resolved into a linear sequence (this should be rare), make the most logical ordering choice possible. If a true conflict persists, you may add a `[❓]` comment briefly noting the items involved in the potential circular dependency, but still present a linear plan.
5.  **Output the Complete, Reordered Plan:** Your final output must be the *entire, re-sequenced implementation plan*. This output will be the content for the primary checklist file defined in the 'Expected JSON Output Structure' below.

Expected JSON Output Structure:
(Your backend service will insert the JSON template from dialectic_stages.expected_output_artifacts for the Paralysis stage here. This template will specify where the AI should place the full, reordered checklist string.)

CRITICAL REMINDER: Ensure your response is ONLY the JSON object detailed above. End of Instructions. END_OF_RESPONSE_FORMAT_INSTRUCTIONS.
```

**Key Improvements and Why They Might Work:**

*   **Specificity of Analysis:** The prompts now guide *how* the AI should think about gaps and dependencies, rather than just stating the goal.
*   **"First Mention, Full Implementation Prioritization":** This is a strong, actionable heuristic for the reordering task, which AI can often follow better than abstract dependency mapping.
*   **Emphasis on Outputting the *Entire* Plan:** This is critical to avoid the AI just giving you diffs or fragments.
*   **Reinforcement of Formatting:** Consistent reminders about your checklist style guide.
*   **Acknowledging Your Workflow:** The prompt structure (SYSTEM block, then main task, then JSON structure request) is designed to work with your `expected_output_artifacts` strategy.

**Your Multi-Agent Approach:**

This is where your system can really shine. Even with these improved prompts:
*   **Parenthesis:** Different models might identify different (or overlapping) gaps. Synthesizing these will lead to a more complete plan than any single model might produce.
*   **Paralysis:** Different models might interpret "logical order" or the "first mention" rule slightly differently, especially for complex interdependencies. Comparing their reordered plans and synthesizing a final order (perhaps with some human oversight for tricky sections) will likely yield the most robust sequence.

You are essentially using the AI ensemble to overcome individual model limitations in deep, long-range planning. This is a very advanced and effective way to use current AI capabilities.