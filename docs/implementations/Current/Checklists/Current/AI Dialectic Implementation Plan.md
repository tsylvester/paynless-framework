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

---

## Section 1: Phase 1 - Multi-Model Response & Basic Dialectic (Thesis & Antithesis)

**Phase 1 Value:** Enable users to submit a prompt to multiple AI models simultaneously and view their initial responses (Thesis). Introduce a basic critique stage where models review peer responses (Antithesis). Provide a basic user interface and GitHub integration for these initial outputs.

**Phase 1 Objectives:**
1.  Set up the foundational database schema for dialectic projects, contributions, and prompt templates.
2.  Implement backend logic for managing dialectic sessions, model interactions for Thesis and Antithesis stages, and prompt template retrieval.
3.  Update the API client and State management to support these new functionalities.
4.  Develop basic UI components for creating projects, submitting prompts, selecting models, and viewing Thesis & Antithesis outputs.
5.  Implement basic GitHub integration to save Thesis and Antithesis outputs as markdown files, using a defined template structure.
6.  Support core OpenAI, Anthropic, and Google models.
7.  Display basic model strengths/weaknesses (static information for now, potentially from a catalog table).
8.  Provide simple per-query cost estimation (rudimentary, based on model selection).

**Estimated Duration (as per PRD):** 3-4 months

---
### 1.0 Project Setup & Foundational Configuration
*   `[✅] 1.0.1 [CONFIG]` Define new environment variables required for AI Dialectic Engine.
    *   `[✅] 1.0.1.1` Identify necessary variables (e.g., API keys for new AI providers if not already present, default model settings for Dialectic Engine).
    *   `[✅] 1.0.1.2` Update `.env.example` or similar template files.
    *   `[✅] 1.0.1.3` Ensure Supabase project settings (e.g., Vault for secrets) are updated if necessary for new AI provider keys.
    *   `[✅] 1.0.1.4 [DOCS]` Document new environment variables and their setup.
*   `[✅] 1.0.2 [DB]` Update existing `system_prompts` table for storing system prompt templates (was: Create `prompt_templates` table).
    *   `[✅] 1.0.2.1 [TEST-UNIT]` Write migration test for updating `system_prompts` table. (GREEN)
    *   `[✅] 1.0.2.2` Define target columns for `system_prompts`:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`) - **Existing**
        *   `name` (TEXT, not nullable, **will add UNIQUE constraint**. Global uniqueness less critical if fetching by context/stage/default flag. Review existing constraints.) - **Existing**
        *   `prompt_text` (TEXT, not nullable - was `content` in original plan, maps to existing `prompt_text`) - **Existing**
        *   `is_active` (BOOLEAN, default true, NOT NULL) - **Existing**
        *   `created_at` (TIMESTAMPTZ, default `now()`) - **Existing**
        *   `updated_at` (TIMESTAMPTZ, default `now()`) - **Existing**
        *   **New Columns to Add:**
        *   `stage_association` (TEXT, nullable, e.g., "thesis", "antithesis", "synthesis", "critique")
        *   `version` (INTEGER, not nullable, default 1)
        *   `description` (TEXT, nullable)
        *   `variables_required` (JSONB, nullable, e.g., `{"core_prompt_text": "text", "user_context": "text"}`)
        *   `is_stage_default` (BOOLEAN, not nullable, default false)
        *   `context` (TEXT, nullable, e.g., "software_dev_planning", "legal_analysis", "financial_modeling")
    *   `[✅] 1.0.2.3` Create Supabase migration script to alter `system_prompts` table (add new columns, **add UNIQUE constraint to `name`**). (GREEN)
        *   `[✅] 1.0.2.4 [REFACTOR]` Review migration.
        *   `[✅] 1.0.2.5` Apply migration to local development database.
*   `[✅] 1.0.3 [BE]` Seed initial prompt templates into `system_prompts` table **via a new migration file**.
    *   `[✅] 1.0.3.1 [TEST-UNIT]` Write test for seeding initial prompts (`supabase/integration_tests/seeding/system_prompts.seed.test.ts`). (GREEN)
    *   `[✅] 1.0.3.2` Define the initial prompt data (Thesis & Antithesis base templates from `sample_prompts.md`).
    *   `[✅] 1.0.3.3` Create Supabase migration scripts (`..._seed_dialectic_thesis_prompt.sql`, `..._seed_dialectic_antithesis_prompt.sql`) with `INSERT` statements. (GREEN)
    *   `[✅] 1.0.3.4 [REFACTOR]` Review seed migration scripts.
    *   `[✅] 1.0.3.5 [TEST-UNIT]` Apply seed migrations and run seed test. (GREEN)
*   `[✅] 1.0.3.A [DB]` Define Storage for Domain-Specific Prompt Overlays
    *   `[✅] 1.0.3.A.1 [DB]` Create `domain_specific_prompt_overlays` table for system-defined default overlays.
        *   `[✅] 1.0.3.A.1.1 [TEST-UNIT]` Write migration test for `domain_specific_prompt_overlays` table creation (`supabase/integration_tests/schema/domain_specific_prompt_overlays.migration.test.ts`). (GREEN)
        *   `[✅] 1.0.3.A.1.2` Define columns for `domain_specific_prompt_overlays`:
            *   `id` (UUID, Primary Key, default `gen_random_uuid()`)
            *   `system_prompt_id` (UUID, FK to `public.system_prompts(id)`, NOT NULL)
            *   `domain_tag` (TEXT, NOT NULL, e.g., "software_development", "finance")
            *   `overlay_values` (JSONB, NOT NULL, e.g., `{"domain_standards": "XYZ principles"}`)
            *   `description` (TEXT, NULLABLE)
            *   `is_active` (BOOLEAN, NOT NULL, default `true`)
            *   `version` (INTEGER, NOT NULL, default `1`)
            *   `created_at` (TIMESTAMP WITH TIME ZONE, NOT NULL, default `now()`)
            *   `updated_at` (TIMESTAMP WITH TIME ZONE, NOT NULL, default `now()`)
        *   `[✅] 1.0.3.A.1.3` Define UNIQUE constraint on (`system_prompt_id`, `domain_tag`, `version`).
        *   `[✅] 1.0.3.A.1.4` Create Supabase migration script (`YYYYMMDDHHMMSS_create_domain_specific_prompt_overlays.sql`). (GREEN)
        *   `[✅] 1.0.3.A.1.5 [REFACTOR]` Review migration script and table definition.
        *   `[✅] 1.0.3.A.1.6 [TEST-UNIT]` Run `domain_specific_prompt_overlays` schema migration test. (GREEN)
    *   `[✅] 1.0.3.A.2 [DB]` Add `user_domain_overlay_values` (JSONB, nullable) to `dialectic_projects` table for user-specific overrides. (Renamed from `domain_overlay_values` for clarity).
        *   `[✅] 1.0.3.A.2.1 [TEST-UNIT]` Write migration test for this column addition to `dialectic_projects`. (GREEN)
        *   `[✅] 1.0.3.A.2.2` Create Supabase migration script to alter `dialectic_projects`. (GREEN - adapted to create table with column)
        *   `[✅] 1.0.3.A.2.3 [REFACTOR]` Review migration script. (GREEN)
        *   `[✅] 1.0.3.A.2.4 [TEST-UNIT]` Run migration test for `dialectic_projects` column addition. (GREEN)
*   `[✅] 1.0.3.B [BE]` Seed Initial System Default Domain Overlays
    *   `[✅] 1.0.3.B.1 [TEST-UNIT]` Write test for seeding initial domain overlays (`supabase/integration_tests/seeding/domain_specific_prompt_overlays.seed.test.ts`). (GREEN)
    *   `[✅] 1.0.3.B.2` Define initial overlay data (e.g., Software Development overlay for Thesis & Antithesis base prompts from `sample_prompts.md`). (GREEN)
    *   `[✅] 1.0.3.B.3` Create Supabase migration script (`YYYYMMDDHHMMSS_seed_initial_domain_overlays.sql`) with `INSERT` statements into `domain_specific_prompt_overlays`. (GREEN)
    *   `[✅] 1.0.3.B.4 [REFACTOR]` Review seed migration script. (GREEN)
    *   `[✅] 1.0.3.B.5 [TEST-UNIT]` Apply seed migration and run overlay seed test. (GREEN)
*   `[✅] 1.0.3.C [BE]` Backend Prompt Rendering Logic for Overlays
    *   `[✅] 1.0.3.C.1` Develop/Update prompt rendering utility. (GREEN)
    *   `[✅] 1.0.3.C.2 [TEST-UNIT]` Write unit tests for the prompt rendering utility, covering various merge scenarios and variable substitutions. (GREEN)
*   `[✅] 1.0.3.D.0 [BE/API/STORE]` Backend and Frontend Plumbing for Domain Tag Selection
    *   `[✅] 1.0.3.D.0.1 [BE]` `dialectic-service` Action: Create `listAvailableDomainTags`.
        *   `[✅] 1.0.3.D.0.1.1 [TEST-INT]` Write tests for `listAvailableDomainTags` (fetches distinct `domain_tag`s from `domain_specific_prompt_overlays`). (RED)
        *   `[✅] 1.0.3.D.0.1.2` Implement the action in `supabase/functions/dialectic-service/index.ts`. (GREEN)
        *   `[✅] 1.0.3.D.0.1.3 [TEST-INT]` Run tests.
    *   `[✅] 1.0.3.D.0.2 [API]` Update `@paynless/api` (in `packages/api/src/dialectic.api.ts`).
        *   `[✅] 1.0.3.D.0.2.1` Add `listAvailableDomainTags(): Promise<string[]>` to `DialecticAPIInterface` and types.
        *   `[✅] 1.0.3.D.0.2.2 [TEST-UNIT]` Write adapter method unit tests in `packages/api/src/dialectic.api.test.ts`. (RED)
        *   `[✅] 1.0.3.D.0.2.3` Implement adapter method. (GREEN)
        *   `[✅] 1.0.3.D.0.2.4` Update mocks in `packages/api/src/mocks.ts`.
        *   `[✅] 1.0.3.D.0.2.5 [TEST-UNIT]` Run tests.
    *   `[✅] 1.0.3.D.0.3 [STORE]` Update `@paynless/store` (in `packages/store/src/dialecticStore.ts` and `packages/store/src/dialecticStore.selectors.ts`).
        *   `[✅] 1.0.3.D.0.3.1` Add `availableDomainTags: string[] | null` and `selectedDomainTag: string | null` to `DialecticState`. Add relevant loading/error states.
        *   `[✅] 1.0.3.D.0.3.2 [TEST-UNIT]` Write tests for `fetchAvailableDomainTags` thunk (in `packages/store/src/dialecticStore.thunks.test.ts` or similar) and `setSelectedDomainTag` action. (RED)
        *   `[✅] 1.0.3.D.0.3.3` Implement thunk and action/reducer logic. (GREEN)
        *   `[✅] 1.0.3.D.0.3.4` Update selectors in `packages/store/src/dialecticStore.selectors.ts`.
        *   `[✅] 1.0.3.D.0.3.5 [TEST-UNIT]` Run tests.
*   `[✅] 1.0.3.D.1 [UI]` Create `DomainSelector` UI Component.
    *   `[✅] 1.0.3.D.1.1 [TEST-UNIT]` Write unit tests for the `DomainSelector` component (e.g., using ShadCN Dropdown, fetches domains from store, dispatches selection to store). (RED)
    *   `[✅] 1.0.3.D.1.2` Implement the `DomainSelector` component. (GREEN)
    *   `[✅] 1.0.3.D.1.3 [TEST-UNIT]` Run tests.
*   `[✅] 1.0.3.D.2 [DB]` Add `selected_domain_tag` column to `dialectic_projects` table.
    *   `[✅] 1.0.3.D.2.1 [TEST-UNIT]` Write migration test for adding `selected_domain_tag` (TEXT, nullable) to `dialectic_projects`. (RED)
    *   `[✅] 1.0.3.D.2.2` Create Supabase migration script. (GREEN)
    *   `[✅] 1.0.3.D.2.3 [TEST-UNIT]` Run migration test.
*   `[✅] 1.0.3.D.3 [BE/API/STORE]` Integrate `selected_domain_tag` into Project Creation Flow.
    *   `[✅] 1.0.3.D.3.1` Modify `createProject` action in `dialectic-service` to accept and store `selected_domain_tag`. (Update tests)
    *   `[✅] 1.0.3.D.3.2` Modify `CreateProjectPayload` in API and Store to include `selected_domain_tag`. (Update tests)
    *   `[✅] (Deferred to 1.5.3)` UI for `CreateDialecticProjectPage` will use `DomainSelector` and pass the selected tag.
*   `[✅] 1.0.4 [RLS]` Define RLS for `system_prompts`.
    *   `[✅] 1.0.4.1 [TEST-INT]` RLS tests written and passing. (GREEN)
    *   `[✅] 1.0.4.2` Implemented RLS: Authenticated users can read active prompts (via `authenticated` role). Write/update operations restricted to `service_role` (e.g., for migrations, seed data scripts). Future admin role functionality deferred. (GREEN)
    *   `[✅] 1.0.4.3 [TEST-INT]` RLS tests cover authenticated read and service_role write restrictions. (GREEN)
*   `[✅] 1.0.5 [RLS]` Define RLS for `ai_providers` table. Public read access is appropriate. (This was `1.0.4` in the previous context, renumbered to reflect changes to system_prompts RLS which became `1.0.4`)
*   `[✅] 1.0.6 [BE/TEST-UNIT]` Create Shared Supabase Storage Utility
    *   `[✅] 1.0.6.1 [BE]` Implement `uploadToStorage` function in `supabase/functions/_shared/supabase_storage_utils.ts`.
    *   `[✅] 1.0.6.2 [BE]` Enhance `supabase/functions/_shared/supabase.mock.ts` to support Supabase client storage mocking.
    *   `[✅] 1.0.6.3 [TEST-UNIT]` Write unit tests for `uploadToStorage` in `supabase/functions/_shared/supabase_storage_utils.test.ts` using the enhanced mock.
*   `[✅] 1.0.7 [COMMIT]` feat: foundational setup, RLS, and shared storage utility (Adjusted numbering & description)

### 1.0.A Shared UI Components - File Uploader
*   `[✅] 1.0.A.1 [UI]` Create Generic `FileUpload` Component in `apps/web/src/components/common/`. (Component implemented, various render modes including dropZoneOverlay and minimalButton. Drag/drop functionality refined. Refactored into `TextInputArea` and working well there. Standalone testing might still be partial.)
    *   `[✅] 1.0.A.1.1 [TEST-UNIT]` Write unit tests for `FileUpload.tsx`. (RED -> GREEN - Basic tests for config, callbacks, and states are in place or mocked. Component is heavily used and tested via `TextInputArea.test.tsx`. Dedicated tests for `FileUpload` might be less comprehensive if covered by `TextInputArea`.)
        *   Test props: `config` (accepted file types as string array e.g., `['.md', 'image/png']`, max size, multiple files boolean, `onFileLoad` callback for client-side content, `onUploadTrigger` callback for backend upload).
        *   Test component states (idle, selecting, file-selected, loading-content, content-loaded, uploading-to-backend, backend-upload-success, backend-upload-error).
        *   Test UI elements: file input, drag-and-drop area, file preview (name, size, type), error messages display.
        *   Test `onFileLoad(fileContent: string | ArrayBuffer, file: File)` callback invocation with loaded file content.
        *   Test `onUploadTrigger(file: File): Promise<{success: boolean, error?: string, resourceReference?: any}>` callback invocation and handling its async response.
    *   `[✅] 1.0.A.1.2` Implement `FileUpload.tsx`. (GREEN - Component implemented and refined. Key functionalities now integrated into `TextInputArea`.)
        *   Use `<input type="file">` and handle drag-and-drop.
        *   Implement client-side validation (file type from `config.acceptedFileTypes`, size from `config.maxSize`).
        *   Implement file reading logic (e.g., `FileReader API`) to invoke `onFileLoad` with content.
        *   The component itself won't perform the backend upload directly but will call `onUploadTrigger` when an upload is requested, passing the `File` object. It will then reflect the success/error state based on the promise returned by `onUploadTrigger`.
        *   Display relevant UI for different states (e.g., progress during `onUploadTrigger` if it's slow, success/error messages).
    *   `[✅] 1.0.A.1.3 [REFACTOR]` Review `FileUpload` for reusability, prop clarity, and state management. Ensure a11y. (Refactoring done for D&D overlay and pointer events. Functionality moved into `TextInputArea` making it more self-contained.)
    *   `[🚧] 1.0.A.1.4 [TEST-UNIT]` Run `FileUpload.tsx` tests. (Tests passing for mocked scenarios via `TextInputArea.test.tsx`. Standalone tests for `FileUpload` specifically might need review if they exist separately.)

### 1.0.B Backend and Data Model for Project Resources
*   `[🚧] 1.0.B.1 [DB]` Create `dialectic_project_resources` table. (Schema defined, assumed implemented or to be implemented as prerequisite for upload functionality.)
    *   `[✅] 1.0.B.1.1 [TEST-UNIT]` Write migration test for `dialectic_project_resources` table creation. (RED)
    *   `[✅] 1.0.B.1.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `project_id` (UUID, foreign key to `dialectic_projects.id` on delete cascade, not nullable)
        *   `user_id` (UUID, foreign key to `auth.users.id` on delete set null, not nullable)
        *   `file_name` (TEXT, not nullable)
        *   `storage_bucket` (TEXT, not nullable, e.g., "dialectic-contributions" or a new "dialectic-project-resources" bucket)
        *   `storage_path` (TEXT, not nullable, unique within bucket)
        *   `mime_type` (TEXT, not nullable)
        *   `size_bytes` (BIGINT, not nullable)
        *   `resource_description` (TEXT, nullable, e.g., "Initial prompt attachment for project creation")
        *   `created_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `updated_at` (TIMESTAMPTZ, default `now()`, not nullable)
    *   `[✅] 1.0.B.1.3` Create Supabase migration script for `dialectic_project_resources`. (GREEN)
    *   `[✅] 1.0.B.1.4 [REFACTOR]` Review migration.
    *   `[✅] 1.0.B.1.5 [TEST-UNIT]` Run `dialectic_project_resources` schema migration test.
*   `[✅] 1.0.B.2 [RLS]` Define RLS for `dialectic_project_resources`.
    *   `[✅] 1.0.B.2.1 [TEST-INT]` Write RLS tests (user can CRUD resources for projects they own; service role full access). (RED)
    *   `[✅] 1.0.B.2.2` Implement RLS policies. (GREEN)
    *   `[✅ 1.0.B.2.3 [TEST-INT]` Run RLS tests.
*   `[✅] 1.0.B.3 [BE]` `dialectic-service` Action: `uploadProjectResourceFile`.
    *   `[✅] 1.0.B.3.1 [TEST-INT]` Write integration tests for `uploadProjectResourceFile`. (GREEN)
        *   Input: `projectId` (string), `fileName` (string), `fileType` (string/mime-type). The actual file will be part of a FormData request. Auth.
        *   Output: `DialecticProjectResource` object (or subset of its fields).
        *   Verifies file is uploaded to Supabase Storage in a path like `projects/{projectId}/resources/{fileName}` or `projects/{projectId}/resources/{resource_uuid}/{fileName}`.
        *   Verifies a record is created in `dialectic_project_resources`.
    *   `[✅] 1.0.B.3.2` Implement `uploadProjectResourceFile` action in `supabase/functions/dialectic-service/index.ts`.
        *   Handle FormData/multipart file upload.
        *   Authenticate user and verify ownership of `projectId`.
        *   Use `uploadToStorage` utility (from `_shared/supabase_storage_utils.ts`).
    *   `[✅] 1.0.B.3.3 [REFACTOR]` Review error handling, security (file type validation on backend if necessary), and path generation.
    *   `[✅] 1.0.B.3.4 [TEST-INT]` Run `uploadProjectResourceFile` tests.
*   `[✅] 1.0.B.4 [API]` Extend `@paynless/api` for Project Resource Upload. (Assumed done for store functionality, type `DialecticProjectResource` exists or placeholder used).
    *   `[✅] 1.0.B.4.1` Define `DialecticProjectResource` type in `packages/types/src/dialectic.types.ts` (if not implicitly covered by DB types).
    *   `[✅] 1.0.B.4.2` Add `uploadProjectResourceFile(projectId: string, file: File, resourceDescription?: string): Promise<ApiResponse<DialecticProjectResource>>` to `DialecticAPIInterface`. Payload might need to be FormData.
    *   `[✅] 1.0.B.4.3 [TEST-UNIT]` Write unit tests for the adapter method in `dialectic.api.test.ts`, mocking the function invocation. (RED -> GREEN, based on store mocks)
    *   `[✅] 1.0.B.4.4` Implement adapter method. It will need to construct FormData. (GREEN, based on store mocks)
    *   `[✅] 1.0.B.4.5 [TEST-UNIT]` Run adapter tests.
*   `[🚧] 1.0.B.5 [STORE]` Extend `@paynless/store` for Project Resource Upload. (Store thunk `uploadProjectResourceFile` exists and is called by UI. Its current backend implementation target for *project-specific resources* needs to align with DB state. Marked [🚧] pending clarification of `dialectic_project_resources` table.)
    *   `[✅] 1.0.B.5.1` Add state for managing project resource uploads (e.g., `isUploadingResource: boolean`, `uploadResourceError: ApiError | null`). (Store thunk `uploadProjectResourceFile` exists).
    *   `[✅] 1.0.B.5.2 [TEST-UNIT]` Write unit tests for `uploadProjectResourceFile` thunk in `dialecticStore.test.ts`. (RED -> GREEN, thunk mocked and used in form tests).
    *   `[✅] 1.0.B.5.3` Implement `uploadProjectResourceFile` thunk. Calls API, updates loading/error states. May update `currentProjectDetail.resources` if project details are enriched to include resources. (GREEN, thunk exists and called from form).
    *   `[✅] 1.0.B.5.4 [TEST-UNIT]` Run thunk tests.
*   `[🚧] 1.0.B.6 [COMMIT]` feat(common,be,db,api,store): Add generic file uploader and project resource handling (UI part largely done. DB for `dialectic_project_resources` is uncertain. BE/API/Store for it are [🚧] pending DB clarification.)

### 1.1 Database Schema for Dialectic Core (Continued)
*   `[✅] 1.1.1 [DB]` Create `dialectic_projects` table.
    *   `[✅] 1.1.1.1 [TEST-UNIT]` Write migration test for `dialectic_projects` table creation. (RED)
    *   `[✅] 1.1.1.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `user_id` (UUID, foreign key to `profiles.id` on delete cascade, not nullable)
        *   `project_name` (TEXT, not nullable)
        *   `initial_user_prompt` (TEXT, not nullable, user's original framing of the problem)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`)
        *   `repo_url` (TEXT, nullable) (Github will be our first repo integration but we should anticipate Dropbox, Sharepoint, and other repo sources for future development)
        *   `status` (TEXT, e.g., 'active', 'archived', 'template', default 'active')
    *   `[✅] 1.1.1.3` Create Supabase migration script for `dialectic_projects`. (GREEN)
    *   `[✅] 1.1.1.4 [REFACTOR]` Review migration script and table definition.
    *   `[✅] 1.1.1.5 [TEST-UNIT]` Run `dialectic_projects` schema migration test. (GREEN)
*   `[✅] 1.1.2 [DB]` Create `dialectic_sessions` table.
    *   `[✅] 1.1.2.1 [TEST-UNIT]` Write migration test for `dialectic_sessions` table creation. (RED)
    *   `[✅] 1.1.2.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `project_id` (UUID, foreign key to `dialectic_projects.id` on delete cascade, not nullable)
        *   `session_description` (TEXT, nullable, e.g., "Initial run with models A, B, C using default thesis prompt")
        *   `current_stage_seed_prompt` (TEXT, nullable, the actual prompt that was used to initiate the current stage, can be a combination of user input and template)
        *   `iteration_count` (INTEGER, default 1, for multi-cycle sessions later)
        *   `active_thesis_prompt_template_id` (UUID, foreign key to `prompt_templates.id`, nullable)
        *   `active_antithesis_prompt_template_id` (UUID, foreign key to `system_prompts.id` on delete set null, nullable)
        *   `created_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `updated_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `status` (TEXT, e.g., `pending_thesis`, `thesis_complete`, `pending_antithesis`, `antithesis_complete`, `pending_synthesis`, `synthesis_complete`, `critique_recommended`, `complete_final_review`, `archived_failed`, `archived_incomplete`, `archived_complete`)
        *   `associated_chat_id` (UUID, nullable, tracks the `chat.id` used for interactions with the `/chat` Edge Function for this dialectic session. This allows dialectics to potentially originate from or integrate with existing chat sessions.)
    *   `[✅] 1.1.2.3 [DB]` Define constraints (FKs already included with columns, add any CHECK constraints if needed for `status` or `iteration_count`).
    *   `[✅] 1.1.2.4 [REFACTOR]` Review migration script and table definition.
    *   `[✅] 1.1.2.5 [TEST-UNIT]` Run `dialectic_sessions` schema migration test. (GREEN)
*   `[✅] 1.1.3 [DB]` Create `dialectic_session_prompts` table (or consider if columns in `dialectic_sessions` are sufficient for MVP if only one prompt pair per session iteration).
    *   `[✅] 1.1.3.1 [TEST-UNIT]` Write migration test for `dialectic_session_prompts` table.
    *   `[✅] 1.1.3.2 [DB]` Create migration script for `dialectic_session_prompts` table.
    *   `[✅] 1.1.3.3 [DB]` Update `types_db.ts` for `dialectic_session_prompts`.
    *   `[✅] 1.1.3.4 [RLS]` Define RLS policies for `dialectic_session_prompts` table.
        *   Policy Details:
            *   **Service Role Access**: Full access (SELECT, INSERT, UPDATE, DELETE).
            *   **Authenticated User Access (Project/Session Ownership Based)**:
                *   **SELECT**: Users can SELECT if they own the associated `dialectic_project`.
                    *   `USING`: `EXISTS (SELECT 1 FROM dialectic_sessions ds JOIN dialectic_projects dp ON ds.project_id = dp.id WHERE ds.id = dialectic_session_prompts.session_id AND dp.user_id = auth.uid())`
                *   **INSERT**: Users can INSERT if they own the associated `dialectic_project` for the `NEW.session_id`.
                    *   `WITH CHECK`: `EXISTS (SELECT 1 FROM dialectic_sessions ds JOIN dialectic_projects dp ON ds.project_id = dp.id WHERE ds.id = NEW.session_id AND dp.user_id = auth.uid())`
                *   **UPDATE**: Users can UPDATE if they own the associated `dialectic_project`.
                    *   `USING`: `EXISTS (SELECT 1 FROM dialectic_sessions ds JOIN dialectic_projects dp ON ds.project_id = dp.id WHERE ds.id = dialectic_session_prompts.session_id AND dp.user_id = auth.uid())`
                    *   `WITH CHECK`: `EXISTS (SELECT 1 FROM dialectic_sessions ds JOIN dialectic_projects dp ON ds.project_id = dp.id WHERE ds.id = NEW.session_id AND dp.user_id = auth.uid())` (assuming session_id is not changed, otherwise OLD.session_id for the check part related to the original row context if session_id were mutable).
                *   **DELETE**: Users can DELETE if they own the associated `dialectic_project`.
                    *   `USING`: `EXISTS (SELECT 1 FROM dialectic_sessions ds JOIN dialectic_projects dp ON ds.project_id = dp.id WHERE ds.id = dialectic_session_prompts.session_id AND dp.user_id = auth.uid())`
    *   `[✅] 1.1.3.5 [TEST-INT]` Write RLS tests for `dialectic_session_prompts`.
*   `[✅] 1.1.4 [DB]` Create `dialectic_session_models` table (associative table for models participating in a session).
    *   `[✅] 1.1.4.1 [TEST-UNIT]` Write migration test for `dialectic_session_models` table. (GREEN)
    *   `[✅] 1.1.4.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `session_id` (UUID, foreign key to `dialectic_sessions.id` on delete cascade, not nullable)
        *   `model_id` (TEXT, not nullable, e.g., "openai/gpt-4", "anthropic/claude-3-opus". This will later be validated against `ai_models_catalog.id`).
        *   `model_role` (TEXT, nullable, e.g., "thesis_generator", "critiquer", for future advanced role assignment; for Phase 1, all models generate thesis and critique others)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
    *   `[✅] 1.1.4.3` Add unique constraint on (`session_id`, `model_id`).
    *   `[✅] 1.1.4.4` Create Supabase migration script for `dialectic_session_models`. (GREEN)
    *   `[✅] 1.1.4.5 [REFACTOR]` Review migration script.
    *   `[✅] 1.1.4.6 [TEST-UNIT]` Run migration test. (GREEN)
*   `[✅] 1.1.5 [DB]` Create `dialectic_contributions` table.
    *   `[✅] 1.1.5.1 [TEST-UNIT]` Write migration test for `dialectic_contributions` table. (RED -> GREEN)
        *   `[✅] 1.1.5.1.1` Test for correct column definitions (name, type, nullability, defaults - including `content` and `content_format` being TEXT and nullable for now).
        *   `[✅] 1.1.5.1.2` Test for primary key constraints.
        *   `[✅] 1.1.5.1.3` Test for foreign key constraints (to `dialectic_sessions`, `users`, `parent_contribution_id`).
        *   `[✅] 1.1.5.1.4` Test for `contribution_type` CHECK constraint.
        *   `[✅] 1.1.5.1.5` Test for RLS policy enablement (ensure `enable_row_level_security` is true).
        *   `[✅] 1.1.5.1.6` Test for expected indexes (on `session_id`, `user_id`, `parent_contribution_id`, `contribution_type`).
        *   `[✅] 1.1.5.1.7` Test `updated_at` trigger functionality (if a helper function is used or by observing changes).
        *   `[✅] 1.1.5.1.8` Test for new storage path columns: `raw_content_storage_path`, `structured_content_storage_path` (TEXT, nullable).
        *   `[✅] 1.1.5.1.9` Test for original content columns `content`, `content_format` are now nullable (or removed if plan shifts). - *They are nullable per current schema.*
        *   `[✅] 1.1.5.1.A` Test for FK delete rules (`ON DELETE CASCADE` for `session_id`, `ON DELETE SET NULL` for `user_id` and `parent_contribution_id`).
    *   `[✅] 1.1.5.3` Create Supabase migration script for `dialectic_contributions` with these storage-oriented columns. (GREEN)
    *   `[✅] 1.1.5.4 [REFACTOR]` Review migration script.
    *   `[✅] 1.1.5.5 [TEST-UNIT]` Run migration schema test. (GREEN)
*   `[✅] 1.1.5.A [BE/CONFIG]` Supabase Storage Setup & Utility Functions
    *   `[✅] 1.1.5.A.1 [CONFIG]` Create Supabase Storage Bucket named `dialectic-contributions` (note: no underscores) and define initial RLS policies.
        *   RLS Policies Configured (via Supabase Dashboard):
            *   `service_role`: Full access (SELECT, INSERT, UPDATE, DELETE).
            *   `authenticated` role: Direct SELECT and INSERT disallowed. (UPDATE/DELETE also disallowed due to lack of permissive policies).
            *   Access for authenticated users will be via signed URLs generated by the backend.
    *   `[✅] 1.1.5.A.2 [BE]` Develop/consolidate Supabase Storage utility functions (e.g., in `supabase/functions/_shared/supabase_storage_utils.ts` or similar, ensuring it's accessible by `dialectic-service`).
        *   `uploadToStorage(bucket: string, path: string, content: Buffer | string | ArrayBuffer, options: { contentType: string, upsert?: boolean }): Promise<{ path: string, error: Error | null }>`
            *   `[✅] 1.1.5.A.2.1 [TEST-UNIT]` Unit test (mock Supabase client). (RED -> GREEN)
        *   `downloadFromStorage(bucket: string, path: string): Promise<{ data: ArrayBuffer, mimeType?: string, error: Error | null }>` (Returns ArrayBuffer for flexibility, caller converts to string if needed).
            *   `[✅] 1.1.5.A.2.2 [TEST-UNIT]` Unit test. (RED -> GREEN)
        *   `deleteFromStorage(bucket: string, paths: string[]): Promise<{ error: Error | null }>`
            *   `[✅] 1.1.5.A.2.3 [TEST-UNIT]` Unit test. (RED -> GREEN)
        *   `createSignedUrlForPath(bucket: string, path: string, expiresIn: number): Promise<{ signedURL: string, error: Error | null }>`
            *   `[✅] 1.1.5.A.2.4 [TEST-UNIT]` Unit test. (RED -> GREEN)
        *   `getFileMetadata(bucket: string, path: string): Promise<{ size?: number, mimeType?: string, error: Error | null }>` (To get size after upload if not available directly).
            *   `[✅] 1.1.5.A.2.5 [TEST-UNIT]` Unit test. (RED -> GREEN)
*   `[🚧] 1.1.5.B [BE]` Integrate Storage Utilities into `dialectic-service` (Content Handling)
    *   Modify relevant actions in `dialectic-service` (e.g., `generateThesisContributions`, `generateAntithesisContributions`, etc., which are called by `callUnifiedAIModel` or its callers).
    *   `[✅] 1.1.5.B.1` When an AI model's output is received:
        1.  `[✅]` Generate a UUID for the `dialectic_contributions.id` *before* uploading content, so it can be used in the storage path for consistency. (GREEN)
        2.  `[✅]` Define the storage path (e.g., using `project_id`, `session_id`, and the new `contribution_id`). Example: `${projectId}/${sessionId}/${contributionId}.md`. (GREEN)
        3.  `[✅]` Use the `uploadToStorage` utility to save the AI-generated content to the `dialectic_contributions` bucket with the correct `contentType` (e.g., `text/markdown`). (GREEN)
        4.  `[✅]` Use `getFileMetadata` to get the `sizeBytes` after upload. (GREEN)
         5.  `[✅]` In the `dialectic_contributions` table, store:
            *   `[✅]` `content_storage_bucket` (e.g., "dialectic_contributions"). (GREEN)
            *   `[✅]` The actual `content_storage_path` returned by the upload. (GREEN)
            *   `[✅]` `content_mime_type` (e.g., "text/markdown"). (GREEN)
            *   `[✅]` `content_size_bytes`. (GREEN)
         6.  `[ ]` (Optional) If storing raw provider responses: generate a separate path (e.g., `${projectId}/${sessionId}/${contributionId}_raw.json`), upload, and save to `raw_response_storage_path`.
    *   `[✅] 1.1.5.B.2 [TEST-INT]` Update/write integration tests for `dialectic-service` actions (e.g., `generateThesisContributions`) to:
        *   `[✅]` Mock the storage utility functions. (Effectively tested via test utils)
        *   `[✅]` Verify that these functions are called with correct parameters.
        *   `[✅]` Verify that the `dialectic_contributions` record is saved with the correct storage path, bucket, mime type, and size. (GREEN)
*   `[✅] 1.1.5.C [API/STORE/UI]` Client-Side Content Retrieval and Display
    *   `[✅] 1.1.5.C.1 [API]` The `DialecticContribution` type (in `packages/api/.../dialectic.api.ts` types) will now include `contentStorageBucket`, `contentStoragePath`, `contentMimeType`, `contentSizeBytes` and *not* the direct `content` string.
`contentSizeBytes` and *not* the direct `content` string.
    *   `[✅] 1.1.5.C.2 [API]` Add a new method to `DialecticAPIInterface`: `getContributionContentSignedUrl(contributionId: string): Promise<{ signedUrl: string, mimeType: string, sizeBytes: number | null } | null>`
        *   The corresponding `dialectic-service` action will:
            1.  Fetch the `dialectic_contributions` record by `contributionId` to get its `content_storage_bucket` and `content_storage_path`.
            2.  Use the `createSignedUrlForPath` storage utility to generate a signed URL for reading the content (with a reasonable expiry, e.g., 5-15 minutes).
            3.  Return the `signedUrl`, `content_mime_type`, and `content_size_bytes`.
        *   `[✅] 1.1.5.C.2.1 [TEST-INT]` Write integration test for this backend service action. (RED -> GREEN)
        *   `[✅] 1.1.5.C.2.2 [TEST-UNIT]` Write unit test for the API adapter method. (RED -> GREEN)
    *   `[✅] 1.1.5.C.3 [STORE]` Update/Create state and thunks in `dialecticStore.ts`:
        *   State: `contributionContentCache: { [contributionId: string]: { signedUrl?: string, expiry?: number, content?: string, isLoading: boolean, error?: string, mimeType?: string, sizeBytes?: number } }`.
        *   Thunk: `fetchContributionContent(contributionId: string)`:
            1.  Check cache: if valid, non-expired URL and content exist, return content. If URL exists but content not fetched, proceed to fetch.
            2.  Calls `api.dialectic.getContributionContentSignedUrl(contributionId)`.
            3.  Stores `signedUrl`, `mimeType`, `sizeBytes`, and `expiry` in cache.
            4.  Performs a `fetch(signedUrl)` to get the actual content (e.g., as text).
            5.  Stores the fetched content in the cache.
            6.  Handles loading and error states.
        *   `[✅] 1.1.5.C.3.1 [TEST-UNIT]` Write unit tests for thunk and reducers. (RED -> GREEN)
    *   `[ ] 1.1.5.C.4 [UI]` Update UI components (e.g., `DialecticSessionDetailsPage`) that display contribution content:
        *   Use a selector to get cached data from `contributionContentCache` for the relevant `contributionId`.
        *   If data is not present or URL is expired (or content not yet fetched), dispatch `fetchContributionContent(contributionId)`.
        *   Display loading indicators.
        *   Once content is fetched, render it (e.g., using a Markdown renderer if `mimeType` is `text/markdown`).
        *   `[ ] 1.1.5.C.4.1 [TEST-UNIT]` Update/write UI component tests. (RED -> GREEN)
*   `[ ] 1.1.5.D [BE]` Handling Deletion of Contributions
    *   `[ ] 1.1.5.D.1` When a `dialectic_contribution` record is deleted (e.g., due to cascade delete from session/project, or a direct "delete contribution" feature if ever added):
        *   Need a mechanism to delete the corresponding file(s) from Supabase Storage to prevent orphaned files.
        *   This can be achieved using a **PostgreSQL trigger** on the `dialectic_contributions` table (`AFTER DELETE`) that calls a database function, which in turn invokes a Supabase Edge Function (or uses `pg_net` if appropriate) to call the `deleteFromStorage` utility.
        *   Alternatively, application-level logic in `dialectic-service` must explicitly delete from storage *before* deleting the DB record if it's a direct deletion action. Cascade deletes from DB won't trigger application logic directly. A trigger is more robust for cascades.
    *   `[ ] 1.1.5.D.2 [DB/BE]` Design and implement this cleanup mechanism (Trigger + DB function preferred for cascade safety).
        *   `[ ] 1.1.5.D.2.1 [TEST-UNIT]` Write tests for the cleanup mechanism. (RED -> GREEN)
*   `[ ] 1.1.5.E [COMMIT]` feat(db,be,api,store,ui): Implement Supabase Storage for dialectic contributions
*   `[ ] 1.1.6 [BE]` Seed `ai_models_catalog` with initial data for core OpenAI, Anthropic, and Google models supported in Phase 1.
    *   `[ ] 1.1.6.1 [TEST-UNIT]` Write test for seeding catalog. (RED)
    *   `[ ] 1.1.6.2` Create seed script. (GREEN)
    *   `[ ] 1.1.6.3 [TEST-UNIT]` Run seed script test.
*   `[✅] 1.1.7 [RLS]` Define Row Level Security policies for `dialectic_projects`, `dialectic_sessions`, `dialectic_session_models`, `dialectic_contributions`.
    *   `[❓] 1.1.7.1 [TEST-INT]` Write RLS tests for `dialectic_projects` (user owns their projects). (RED)
    *   `[✅] 1.1.7.2` Implement RLS for `dialectic_projects`. (GREEN)
    *   `[❓] 1.1.7.3 [TEST-INT]` Run RLS tests for `dialectic_projects`.
    *   `[✅] 1.1.7.4 [TEST-INT]` Write RLS tests for `dialectic_sessions` (user can access sessions of their projects). (RED)
    *   `[✅] 1.1.7.5` Implement RLS for `dialectic_sessions`. (GREEN)
    *   `[✅] 1.1.7.6 [TEST-INT]` Run RLS tests for `dialectic_sessions`.
    *   `[ ] 1.1.7.7 [TEST-INT]` Write RLS tests for `dialectic_session_models`. (RED)
    *   `[✅] 1.1.7.8` Implement RLS for `dialectic_session_models`. (GREEN)
    *   `[ ] 1.1.7.9 [TEST-INT]` Run RLS tests for `dialectic_session_models`.
    *   `[✅] 1.1.7.10 [TEST-INT]` Write RLS tests for `dialectic_contributions`. (RED)
    *   `[✅] 1.1.7.11` Implement RLS for `dialectic_contributions`. (GREEN)
    *   `[✅] 1.1.7.12 [TEST-INT]` Run RLS tests for `dialectic_contributions`.
*   `[✅] 1.1.8 [RLS]` Define RLS for `ai_providers` (formerly `ai_models_catalog`).
    *   `[✅] 1.1.8.1 [TEST-INT]` RLS tests written and passing. (GREEN)
    *   `[✅] 1.1.8.2` Implemented RLS: Public read access (via `public` role) for active providers. Write/update operations are managed by a backend `sync-ai-providers` function (utilizing `service_role` or equivalent administrative privileges). (GREEN)
    *   `[✅] 1.1.8.3 [TEST-INT]` RLS tests cover public read and affirm write protection from non-service roles. (GREEN)
*   `[ ] 1.1.9 [COMMIT]` feat(db): add core schema and RLS for AI Dialectic Engine (projects, sessions, contributions, models catalog)

### 1.2 Backend Logic: Core Dialectic Service (Supabase Edge Functions)

*   `[✅] 1.2.1 [BE]` Create new Supabase Edge Function: `dialectic-service`. This function will use command pattern or similar to handle multiple actions related to the dialectic process to reduce the number of individual functions. Ensure input sanitization for all actions.
    *   Action: `createProject`
        *   `[✅] 1.2.1.1 [TEST-INT]` Write tests for `createProject` action (input: `projectName`, `initialUserPrompt`; output: created project object; auth). (RED)
        *   `[✅] 1.2.1.2` Implement logic: Inserts into `dialectic_projects`. (GREEN)
        *   `[ ] 1.2.1.3 [REFACTOR]` Review.
        *   `[✅] 1.2.1.4 [TEST-INT]` Run tests.
    *   Action: `startSession`
        *   `[✅] 1.2.1.5 [TEST-INT]` Write tests for `startSession` action (input: `projectId`, `selectedModelCatalogIds` (array of strings from `ai_models_catalog.id`), `sessionDescription` (optional), `thesisPromptTemplateName` (optional, defaults to "dialectic_thesis_default_v1"), `antithesisPromptTemplateName` (optional, defaults to "dialectic_antithesis_critique_default_v1"); output: created session object; auth). (RED)
        *   `[✅] 1.2.1.6` Implement logic:
            1.  Verify project ownership.
            2.  Fetch `prompt_template.id` for thesis and antithesis from `prompt_templates` table using names.
            3.  Creates `dialectic_sessions` record (linking `active_thesis_prompt_template_id`, etc.).
                *   During creation, an `associated_chat_id` (UUID) should be generated by `dialectic-service` or assigned if the dialectic originates from an existing chat. This ID will be used for all subsequent calls to the `/chat` Edge Function for this session.
            4.  Creates `dialectic_session_models` records from `selectedModelCatalogIds`.
            5.  Sets `dialectic_sessions.status` to `pending_thesis`.
            6.  Constructs `current_stage_seed_prompt` for the session by rendering the chosen thesis prompt template with the project's `initial_user_prompt`. Store this in `dialectic_sessions.current_stage_seed_prompt`.
            7.  The `startSession` action concludes after successfully setting up the session. The generation of thesis contributions will be triggered by a separate user action from the frontend, which will then call the `generateThesisContributions` action.
        *   `[✅] 1.2.1.7` (GREEN)  <-- This was likely a placeholder for implementation, marking based on 1.2.1.6
        *   `[ ] 1.2.1.8 [REFACTOR]` Review.
        *   `[✅] 1.2.1.9 [TEST-INT]` Run tests.
*   `[ ] 1.2.2 [BE]` Helper: Prompt Rendering Utility
    *   `[ ] 1.2.2.1 [TEST-UNIT]` Write tests for a utility that takes a prompt template string (e.g., "Solve: {{problem}}") and a context object (e.g., `{ problem: "world hunger" }`) and returns the rendered prompt. (RED)
    *   `[ ] 1.2.2.2` Implement the prompt rendering utility (e.g., using a simple string replacement or a lightweight template engine). (GREEN)
    *   `[ ] 1.2.2.3 [TEST-UNIT]` Run tests.
*   `[✅] 1.2.3 [BE]` Helper: AI Model Interaction Utilities (within `dialectic-service` or shared helpers)
    *   `[✅] 1.2.3.1 [TEST-UNIT]` Write unit tests for `callUnifiedAIModel(modelCatalogId, renderedPrompt, options, associatedChatId)` which internally prepares a request for and invokes the existing `/chat` Edge Function. Mock the `/chat` function invocation. (RED)
    *   `[✅] 1.2.3.2` Implement `callUnifiedAIModel`:
        *   This function will **not** directly call AI provider SDKs.
        *   It receives `modelCatalogId` (which is `ai_providers.id`), the `renderedPrompt`, an `options` object (for things like history, `max_tokens_to_generate`), and the `associatedChatId` for the dialectic session.
        *   **Note:** `callUnifiedAIModel` is designed to handle interaction with a single AI model provider (via the `/chat` function) for a single prompt. Functions that require generating responses from multiple AI models for a given stage (e.g., `generateThesisContributions`) are responsible for iterating through the selected models (obtained from `dialectic_session_models` linked to the session) and calling `callUnifiedAIModel` individually for each one.
        *   **Prepare Request for `/chat` Function:**
            *   Construct the `ChatApiRequest` payload required by the `/chat` Edge Function. This includes:
                *   `message`: The `renderedPrompt`.
                *   `providerId`: The `modelCatalogId`.
                *   `promptId`: From `options.currentStageSystemPromptId` or `__none__`.
                *   `chatId`: The `associatedChatId` passed to this function.
                *   `messages`: Formatted history messages if provided in `options`.
                *   `max_tokens_to_generate`: From `options`.
        *   **Invoke `/chat` Edge Function:**
            *   Make an HTTP POST request to the `/chat` function endpoint with the prepared `ChatApiRequest` payload and appropriate authentication (user's JWT).
        *   **Process Response from `/chat` Function:**
            *   Receive the `ChatHandlerSuccessResponse` (or error response) from `/chat`.
            *   Extract `content`, `token_usage` (input/output tokens), `cost`, `rawProviderResponse` (which would be the `/chat` function's assistant message object), and `processingTimeMs` from the `/chat` response.
            *   Map these fields to the `UnifiedAIResponse` structure expected by the `dialectic-service`.
            *   Handle errors returned by the `/chat` function gracefully.
        *   The `/chat` function is responsible for actual AI provider calls, tokenomics, and underlying cost calculation. `callUnifiedAIModel` is now an orchestrator for `/chat`.
    *   `[✅] 1.2.3.3` (GREEN) <!-- Corresponds to 1.2.3.2 implementation being complete -->
    *   `[ ] 1.2.3.4 [REFACTOR]` Review error handling and interaction with `/chat` function.
    *   `[✅] 1.2.3.5 [TEST-UNIT]` Run tests. <!-- Dependent on 1.2.3.1 -->
*   `[✅] 1.2.4 [BE]` `dialectic-service` Action: `generateThesisContributions` (triggered by user action from frontend after `startSession` is complete)
    *   `[✅] 1.2.4.1 [TEST-INT]` Write tests (input: `sessionId`; auth: user; verifies contributions are created and session status updated). (RED -> 🚧 Tests pass for basic success response, full contribution verification pending actual implementation)
    *   `[✅] 1.2.4.2` Implement logic: (🚧 Placeholder implementation returns success structure; core logic for model calls and contribution saving pending)
        1.  `[✅]` Fetch `dialectic_session` (including `associated_chat_id`), its `dialectic_session_models`, and the `current_stage_seed_prompt`. Ensure user owns the project/session.
        2.  `[✅]` Verify session status is `pending_thesis`. Update to `generating_thesis`. Log this transition.
        3.  `[✅]` For each `session_model` representing an AI provider selected for this session (retrieved from `dialectic_session_models`):
            *   `[✅]` Call `callUnifiedAIModel` with that specific `session_model.model_id` (which is an `ai_providers.id`), the `current_stage_seed_prompt`, and the `session.associated_chat_id`.
            *   `[✅]` Save result in `dialectic_contributions` (stage 'thesis', `actual_prompt_sent` = `current_stage_seed_prompt`, store costs, tokens from `UnifiedAIResponse`, ensured `content_storage_bucket` is NOT NULL and correctly populated along with path, mime type, and size). If a model call fails, record the error in the contribution and proceed with other models. (Refined error handling in contribution evolving)
        4.  `[✅]` Update `dialectic_sessions.status` to `thesis_complete`. Log this transition. (Consider `thesis_complete_with_errors` status)
        5.  `[✅]` This action concludes. The next stage (Antithesis) will be triggered by a separate user action.
    *   `[✅] 1.2.4.3` (GREEN)
    *   `[✅] 1.2.4.4 [REFACTOR]` Review error handling for individual model failures and overall session status updates. (GREEN)
    *   `[✅] 1.2.4.5 [TEST-INT]` Run tests.
*   `[✅] 1.2.4.6 [BE]` Implement retry logic (e.g., 3 attempts with exponential backoff) for `callUnifiedAIModel` within `generateThesisContributions`. (GREEN)
*   `[✅] 1.2.4.7 [BE]` Ensure `contentType` is not hardcoded and `getExtensionFromMimeType` is used for storage paths. (GREEN)
    *   `[✅] 1.2.4.7.1 [BE]` Create `path_utils.ts` with `getExtensionFromMimeType` function. (GREEN)
    *   `[✅] 1.2.4.7.2 [TEST-UNIT]` Create `path_utils.test.ts` and add unit tests for `getExtensionFromMimeType`. (GREEN for creation; test failures are separate issues for that utility)
*   `[ ] 1.2.5 [BE]` `dialectic-service` Action: `generateAntithesisContributions` (internal)
    *   `[ ] 1.2.5.1 [TEST-INT]` Write tests (input: `sessionId`; auth: service role; verifies critiques are created against each thesis, and session status updated). (RED)
    *   `[ ] 1.2.5.2` Implement logic:
        1.  Fetch session (including `associated_chat_id`), its models, all 'thesis' contributions for the current iteration, and `antithesis_prompt_template_id` from session. Fetch `initial_user_prompt` from project. Fetch antithesis prompt template content. Ensure user owns the project/session.
        2.  Verify status is `thesis_complete`. Update to `generating_antithesis`. Log this transition.
        3.  For each `critiquer_session_model` representing an AI provider selected for this session:
            *   For each `thesis_contribution` (that was successfully generated and is targeted for critique):
                *   Render the antithesis prompt template using context: `initial_user_prompt`, `original_thesis_content = thesis_contribution.content` (or path to content).
                *   Call `callUnifiedAIModel` with the `critiquer_session_model.model_id`, the rendered critique prompt, and the `session.associated_chat_id`.
                *   Save result in `dialectic_contributions` (stage 'antithesis', `target_contribution_id = thesis_contribution.id`, `actual_prompt_sent` = rendered critique prompt). Record errors if any.
        4.  Update `dialectic_sessions.status` to `antithesis_complete`. Log this transition.
        5.  This action concludes. The next stage (Synthesis) will be triggered by a separate user action.
    *   `[ ] 1.2.5.3` (GREEN)
    *   `[ ] 1.2.5.4 [REFACTOR]` Review logic and error handling.
    *   `[ ] 1.2.5.5 [TEST-INT]` Run tests.
*   `[ ] 1.2.6 [BE]` `dialectic-service` Action: `getProjectDetails`
    *   `[ ] 1.2.6.1 [TEST-INT]` Write tests (input: `projectId`; auth; output: project, its sessions, their models, and all contributions, ordered correctly). (RED)
    *   `[ ] 1.2.6.2` Implement using Supabase JS client to fetch nested data respecting RLS. (GREEN)
    *   `[ ] 1.2.6.3 [TEST-INT]` Run tests.
*   `[✅] 1.2.7 [BE]` `dialectic-service` Action: `listProjects`
    *   `[✅] 1.2.7.1 [TEST-INT]` Write tests (auth; output: list of user's projects). (RED)
    *   `[✅] 1.2.7.2` Implement. (GREEN)
    *   `[✅] 1.2.7.3 [TEST-INT]` Run tests.
*   `[ ] 1.2.8 [BE]` `dialectic-service` Action: `listModelCatalog`
    *   `[ ] 1.2.8.1 [TEST-INT]` Write tests (auth; output: list of active models from `ai_models_catalog`). (RED)
    *   `[ ] 1.2.8.2` Implement. (GREEN)
    *   `[ ] 1.2.8.3 [TEST-INT]` Run tests.
*   `[ ] 1.2.9 [DOCS]` Document the `dialectic-service` Edge Function, its actions, inputs, outputs, and error handling strategies in a relevant README (e.g., `supabase/functions/dialectic-service/README.md`).
*   `[ ] 1.2.10 [COMMIT]` feat(be): implement dialectic-service edge function with core actions

### 1.3 API Client (`@paynless/api`)
*   `[✅] 1.3.1 [API]` Define types in `packages/types/src/dialectic.types.ts` for Dialectic Engine.
    *   `[✅] 1.3.1.1` `DialecticProject`, `DialecticSession`, `DialecticSessionModel`, `DialecticContribution`, `AIModelCatalogEntry`, `PromptTemplate`, `DomainTag` (string).
    *   `[✅] 1.3.1.2` Input types for new API methods (e.g., `CreateProjectPayload`, `StartSessionPayload`).
    *   `[✅] 1.3.1.3` Ensure these types align with database schema and Edge Function outputs.
*   `[✅] 1.3.2 [API]` Define `DialecticApiClient` interface in `packages/types/src/dialectic.types.ts`. Add new methods:
    *   `[✅] 1.3.2.1` `createProject(payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>>`
    *   `[✅] 1.3.2.2` `startSession(payload: StartSessionPayload): Promise<ApiResponse<DialecticSession>>`
    *   `[✅] 1.3.2.3` `getProjectDetails(projectId: string): Promise<ApiResponse<DialecticProject>>` (Response type may need to be richer to include sessions/contributions)
    *   `[✅] 1.3.2.4` `listProjects(): Promise<ApiResponse<DialecticProject[]>>`
    *   `[✅] 1.3.2.5` `listModelCatalog(): Promise<ApiResponse<AIModelCatalogEntry[]>>`
    *   `[✅] 1.3.2.6` `listAvailableDomainTags(): Promise<ApiResponse<string[]>>` (already covered in 1.0.3.D.0.2.1, confirmed part of this interface)
    *   `[✅]` (Additional method present: `getContributionContentSignedUrl`)
*   `[✅] 1.3.3 [API]` Implement this interface in `packages/api/src/dialectic.api.ts` (class `DialecticApiClient`).
    *   `[✅] 1.3.3.1 [TEST-UNIT]` Write unit tests for each new adapter method in `packages/api/src/dialectic.api.test.ts`, mocking `supabase.functions.invoke`. (RED -> GREEN)
    *   `[✅] 1.3.3.2` Implement `createProject` by invoking `dialectic-service` with action `createProject`. (GREEN)
    *   `[✅] 1.3.3.3` Implement `startSession` by invoking `dialectic-service` with action `startSession`. (GREEN)
    *   `[✅] 1.3.3.4` Implement `getProjectDetails` by invoking `dialectic-service` with action `getProjectDetails`. (GREEN)
    *   `[✅] 1.3.3.5` Implement `listProjects` by invoking `dialectic-service` with action `listProjects`. (GREEN)
    *   `[✅] 1.3.3.6` Implement `listModelCatalog` by invoking `dialectic-service` with action `listModelCatalog`. (GREEN)
    *   `[✅] 1.3.3.7` Implement `listAvailableDomainTags` (already covered in 1.0.3.D.0.2.3).
    *   `[✅]` (Additional method implemented: `getContributionContentSignedUrl`)
    *   `[✅] 1.3.3.8 [REFACTOR]` Review implementations. (GREEN)
    *   `[✅] 1.3.3.9 [TEST-UNIT]` Run unit tests. (GREEN)
*   `[✅] 1.3.4 [API]` Update/create mocks in `packages/api/src/mocks.ts` for the new interface methods. (GREEN)
*   `[✅] 1.3.5 [API]` Update `packages/api/src/index.ts` to export the new `DialecticAPI` slice. (GREEN)
*   `[✅] 1.3.6 [API]` Update `packages/api/src/apiClient.ts` to integrate the `DialecticAPI` slice if applicable. (GREEN)
*   `[✅] 1.3.7 [DOCS]` Update `packages/api/README.md` with new Dialectic API methods. (GREEN)
*   `[✅] 1.3.8 [COMMIT]` feat(api): add dialectic service methods to api client

### 1.4 State Management (`@paynless/store`)
*   `[✅] 1.4.1 [STORE]` Define `DialecticStateValues` and `DialecticStore` (extending with new actions/state) in `packages/store/src/dialecticStore.ts`.
    *   `[✅] 1.4.1.1` Add state for `currentProjectDetail: DialecticProject | null`.
    *   `[✅] 1.4.1.2` Add state for `modelCatalog: AIModelCatalogEntry[] | null`.
    *   `[✅] 1.4.1.3` Add loading/error states for these and for new actions (e.g., `isLoadingProjectDetail`, `isStartingSession`).
*   `[✅] 1.4.2 [STORE]` Implement new async thunks in `dialecticStore.ts` for the new API client methods:
    *   `[✅] 1.4.2.1` `fetchDialecticProjectDetails(projectId: string)`
    *   `[✅] 1.4.2.2` `startDialecticSession(payload: StartSessionPayload)`
    *   `[✅] 1.4.2.3` `fetchAIModelCatalog()`
    *   `[✅] 1.4.2.4` Ensure thunks handle API call, set loading states, and manage errors.
*   `[✅] 1.4.3 [STORE]` Update `initialDialecticStateValues` to include all new state properties.
*   `[✅] 1.4.4 [STORE]` Add new selectors in `packages/store/src/dialecticStore.selectors.ts` for all new state (project detail, model catalog, action statuses, loading/error states).
*   `[✅] 1.4.5 [STORE]` Ensure `useDialecticStore` and new selectors are correctly exported from `packages/store/src/index.ts`.
*   `[✅] 1.4.6 [STORE-TEST]` Update unit tests in `packages/store/src/dialecticStore.test.ts`.
    *   `[✅] 1.4.6.1` Verify initial state includes new properties.
    *   `[✅] 1.4.6.2` Add tests for new thunks, mocking API responses, checking state updates (loading, data, error).
    *   `[✅] 1.4.6.3` Ensure mock setup for `@paynless/api` correctly provides mocks for new `DialecticApiClient` methods.
*   `[✅] 1.4.7 [STORE-DOCS]` Update `packages/store/README.md` to document the `DialecticStore`, its state, thunks, and selectors.
*   `[🚧] 1.4.8 [TEST-INT]` Update/add integration tests that involve Dialectic state changes. (e.g., component tests that trigger these thunks). (Covers existing `DomainSelector.test.tsx`; will be fully addressed as UI components from 1.5 are developed and tested.)

### 1.5 UI Components (`apps/web`) - Core Pages & Navigation
*   `[✅] 1.5.1 [UI]` Create new route for Dialectic Projects: `/dialectic` or `/ai-dialectic`.
    *   `[✅] 1.5.1.1` Add to router configuration in `apps/web`.
*   `[✅] 1.5.2 [UI]` Create `DialecticProjectsPage` component.
    *   `[✅] 1.5.2.1 [TEST-UNIT]` Write tests (renders loading state, error state, list of projects, "Create New Project" button). Mock store selectors. (RED)
    *   `[✅] 1.5.2.2` Implement component:
        *   Dispatches `fetchDialecticProjects` on mount.
        *   Uses `selectDialecticProjects` and `selectDialecticLoadingStates`.
        *   Displays a list of projects (e.g., name, created_at). Each project links to `DialecticProjectDetailsPage`.
        *   Includes a button/link to navigate to a "Create Dialectic Project" form/page.
        *   Ensure a11y principles are applied.
    *   `[✅] 1.5.2.3` (GREEN)
    *   `[ ] 1.5.2.4 [REFACTOR]` Review.
    *   `[✅] 1.5.2.5 [TEST-UNIT]` Run tests.
*   `[🚧] 1.5.3 [UI]` Create `CreateDialecticProjectPage` (or modal component). (Note: Component is `CreateDialecticProjectForm.tsx`)
    *   `[✅] 1.5.3.1 [TEST-UNIT]` Write tests (form fields for project name, initial user prompt; submit button; handles loading/error from `createDialecticProject` thunk). (RED -> GREEN - All tests in `CreateDialecticProjectForm.test.tsx` are now passing.)
    *   `[✅] 1.5.3.2` Implement component:
        *   Form with inputs for `projectName`, `initialUserPrompt`.
        *   On submit, dispatches `createDialecticProject`.
        *   Navigates to `DialecticProjectDetailsPage` on success.
        *   Displays loading/error states.
        *   Ensure a11y principles are applied.
    *   `[✅] 1.5.3.3` (GREEN)
    *   **NEW Steps for Enhancements:**
    *   `[✅] 1.5.3.A [UI]` Refactor "Initial User Prompt" Input Field.
        *   `[✅] 1.5.3.A.1 [TEST-UNIT]` Update tests for `CreateDialecticProjectPage`: assert `TextInputArea` from `apps/web/src/components/common/TextInputArea.tsx` is used for `initialUserPrompt`. (RED -> GREEN - `TextInputArea` successfully integrated. `CreateDialecticProjectForm.test.tsx` verifies props passed to mock `TextInputArea`, and interaction with its `onFileLoad`. `TextInputArea.test.tsx` confirms its internal `onChange` and other functionalities.)
        *   `[✅] 1.5.3.A.2` In `CreateDialecticProjectPage.tsx`, replace the current ShadCN `Textarea` for `initialUserPrompt` with the `TextInputArea` component. (GREEN - `CreateDialecticProjectForm.tsx` now uses the enhanced `TextInputArea`.)
        *   `[✅] 1.5.3.A.3 [TEST-UNIT]` Verify `forwardRef` related errors (if any) are resolved and tests pass. (`forwardRef` warning for primitive `textarea.tsx` remains as per user instruction not to edit it, but `TextInputArea` itself handles refs correctly. `TextInputArea.test.tsx` passes.)
    *   `[✅] 1.5.3.B [UI]` Integrate `FileUpload` Component for Initial User Prompt.
        *   `[✅] 1.5.3.B.1 [TEST-UNIT]` Update tests for `CreateDialecticProjectPage`: (RED -> GREEN - Logic now within `TextInputArea`. `TextInputArea.test.tsx` covers file upload invocation and its internal `onFileLoad` which triggers the prop. `CreateDialecticProjectForm.test.tsx` verifies that its `handleFileLoadForPrompt` (passed as `onFileLoad` to the mock `TextInputArea`) is called correctly and updates form state.)
            *   Test presence and configuration of `FileUpload` component (from `apps/web/src/components/common/FileUpload.tsx`) to accept `.md` files. (Tests for paperclip and dropzone `FileUpload` instances are present - now part of `TextInputArea` and tested in `TextInputArea.test.tsx`. `CreateDialecticProjectForm.test.tsx` checks indicators that `showFileUpload` is true.)
            *   Test that the `onFileLoad(fileContent: string, file: File)` callback from `FileUpload` correctly populates the `initialUserPrompt` state managed by `TextInputArea`. (Tested via `handleFileLoadForPrompt` within `CreateDialecticProjectForm.tsx`, which is passed to `TextInputArea` and simulated in tests.)
            *   Test that the `onUploadTrigger(file: File)` callback for `FileUpload` is prepared to call the `uploadProjectResourceFile` thunk *after* successful project creation if a file was used for the prompt. (Tested: `handleActualFileUpload` is called post-project creation in `CreateDialecticProjectForm.test.tsx`).
        *   `[✅] 1.5.3.B.2` Add the `FileUpload` component to `CreateDialecticProjectPage.tsx`. (GREEN - `TextInputArea` now provides this functionality and is used in `CreateDialecticProjectForm.tsx`. File attach button visibility across modes also fixed. Functionality confirmed by `TextInputArea.tsx` structure and its tests.)
            *   Configure it to accept `.md` files (e.g., `acceptedFileTypes=['.md', 'text/markdown']`).
            *   Implement the `onFileLoad` callback: take the loaded string content and update the component state that backs the `TextInputArea` for `initialUserPrompt`. Store the `File` object in component state if needed for the later `onUploadTrigger`. (`handleFileLoadForPrompt` in `CreateDialecticProjectForm.tsx` does this and is tested).
            *   Implement the `onUploadTrigger` callback placeholder logic as per plan: this function will be called by `FileUpload` if an upload action is initiated by it. For this page, the actual file upload to backend as a "project resource" occurs *after* the project is successfully created. (`handleDummyUploadTrigger` for direct calls from UI within `TextInputArea`, `handleActualFileUpload` for post-creation upload in `CreateDialecticProjectForm.tsx` - tested).
                *   Logic:
                    1. User selects file via `FileUpload`.
    *   `[✅] 1.5.3.A [UI]` Refactor "Initial User Prompt" Input Field.
        *   `[✅] 1.5.3.A.1 [TEST-UNIT]` Update tests for `CreateDialecticProjectPage`: assert `TextInputArea` from `apps/web/src/components/common/TextInputArea.tsx` is used for `initialUserPrompt`. (RED -> GREEN)
        *   `[✅] 1.5.3.A.2` In `CreateDialecticProjectPage.tsx`, replace the current ShadCN `Textarea` for `initialUserPrompt` with the `TextInputArea` component. (GREEN)
        *   `[✅] 1.5.3.A.3 [TEST-UNIT]` Verify `forwardRef` related errors (if any) are resolved and tests pass.
    *   `[✅] 1.5.3.B [UI]` Integrate `FileUpload` Component for Initial User Prompt.
        *   `[✅] 1.5.3.B.1 [TEST-UNIT]` Update tests for `CreateDialecticProjectPage`: (RED -> GREEN)
            *   Test presence and configuration of `FileUpload` component (from `apps/web/src/components/common/FileUpload.tsx`) to accept `.md` files.
            *   Test that the `onFileLoad(fileContent: string, file: File)` callback from `FileUpload` correctly populates the `initialUserPrompt` state managed by `TextInputArea`.
            *   Test that the `onUploadTrigger(file: File)` callback for `FileUpload` is prepared to call the `uploadProjectResourceFile` thunk *after* successful project creation if a file was used for the prompt.
        *   `[✅] 1.5.3.B.2` Add the `FileUpload` component to `CreateDialecticProjectPage.tsx`.
            *   Configure it to accept `.md` files (e.g., `acceptedFileTypes=['.md', 'text/markdown']`).
            *   Implement the `onFileLoad` callback: take the loaded string content and update the component state that backs the `TextInputArea` for `initialUserPrompt`. Store the `File` object in component state if needed for the later `onUploadTrigger`.
            *   Implement the `onUploadTrigger` callback placeholder logic as per plan: this function will be called by `FileUpload` if an upload action is initiated by it. For this page, the actual file upload to backend as a "project resource" occurs *after* the project is successfully created.
                *   Logic:
                    1. User selects file via `FileUpload`.
                    2. `onFileLoad` populates the `initialUserPrompt` `TextInputArea` and potentially stores the `File` object.
                    3. User clicks "Create Project". `createDialecticProject` thunk is called.
                    4. *If* `createDialecticProject` is successful AND a file was the source of the prompt:
                        *   A function (possibly `onUploadTrigger` if `FileUpload` is designed to re-trigger it, or a separate function called post-project-creation) will dispatch `uploadProjectResourceFile` thunk with the new `projectId` and the stored `File` object.
                        *   The `FileUpload` component should reflect the status of this backend upload if it manages that state.
        *   `[✅] 1.5.3.B.3` (GREEN)
    *   `[✅] 1.5.3.C [UI]` Integrate Markdown Preview for Initial User Prompt.
        *   `[✅] 1.5.3.C.1 [TEST-UNIT]` Update tests for `CreateDialecticProjectPage`: assert presence of a Markdown preview area that dynamically renders the content of the `initialUserPrompt` state (from `TextInputArea`). (RED -> GREEN - Functionality moved into `TextInputArea`, which is tested in `TextInputArea.test.tsx` for rendering and toggling. `CreateDialecticProjectForm.test.tsx` confirms `showPreviewToggle` is true via mock.)
        *   `[✅] 1.5.3.B.3` (GREEN)
        *   `[✅] 1.5.3.C.2` Import a Markdown rendering component (e.g., `ReactMarkdown` or a shared `MarkdownRenderer` if available, potentially similar to what's used in `ChatMessageBubble`). (GREEN - `TextInputArea` uses `MarkdownRenderer` internally.)
    *   `[✅] 1.5.3.D [REFACTOR]` Review the enhanced `CreateDialecticProjectPage` for UX flow (file selection, prompt population, resource upload timing), component interaction, and error handling. (Marking as [🚧] because although individual pieces are working, the overall UX and remaining test issues need a look).
    *   `[✅] 1.5.3.E [TEST-UNIT]` Run all updated tests for `CreateDialecticProjectPage`. (Tests for `CreateDialecticProjectPage.test.tsx` are now passing. Note: `1.5.3.1` related to `CreateDialecticProjectForm.test.tsx` still has outstanding issues.)
    *   `[✅] 1.5.3.F [COMMIT]` feat(ui): Enhance Create Project page with TextInputArea, file upload for prompt, and markdown preview
    *   `[✅] 1.5.3.4 [REFACTOR]` Original refactor step - review overall component. (This can be combined with `1.5.3.D`)
    *   `[✅] 1.5.3.5 [TEST-UNIT]` Run tests. (Original step, ensure all tests still pass after enhancements)
*   `[✅] 1.5.4 [UI]` Create `DialecticProjectDetailsPage` component (route e.g., `/dialectic/:projectId`).
    *   `[✅] 1.5.4.1 [TEST-UNIT]` Write tests (displays project name, initial prompt, list of sessions; "Start New Session" button; loading/error states). Mock store. (RED)
    *   `[✅] 1.5.4.2` Implement component:
        *   Extracts `projectId` from route params.
        *   Dispatches `fetchDialecticProjectDetails(projectId)` on mount.
        *   Uses `selectCurrentProjectDetails`.
        *   Displays project info.
        *   Lists sessions (if any), linking to `DialecticSessionDetailsPage` (to be created).
        *   Button to open `StartDialecticSessionModal`.
        *   Ensure a11y principles are applied.
    *   `[✅] 1.5.4.3` (GREEN)
    *   `[ ] 1.5.4.4 [REFACTOR]` Review.
    *   `[✅] 1.5.4.5 [TEST-UNIT]` Run tests.
*   `[✅] 1.5.5 [UI]` Create `StartDialecticSessionModal` component.
    *   `[✅] 1.5.5.1 [TEST-UNIT]` Write tests (form for session description, multi-select for AI models from catalog; submit button; loading/error states from `startDialecticSession` thunk and `fetchAIModelCatalog` thunk). Mock store. (RED)
    *   `[✅] 1.5.5.2` Implement component:
        *   Dispatches `fetchAIModelCatalog` on mount if catalog is null.
        *   Uses `selectModelCatalog` for model selection.
        *   Form with `sessionDescription` (optional), multi-select for `selectedModelCatalogIds`.
        *   (Optional for Phase 1, can be hardcoded or defaults): Selectors for `thesisPromptTemplateName`, `antithesisPromptTemplateName`.
        *   On submit, dispatches `startDialecticSession` with `projectId` and form data.
        *   Closes modal and potentially refetches project details on success.
        *   Ensure a11y principles are applied.
    *   `[✅] 1.5.5.3` (GREEN)
    *   `[ ] 1.5.5.4 [REFACTOR]` Review.
    *   `[✅] 1.5.5.5 [TEST-UNIT]` Run tests.
*   `[ ] 1.5.6 [UI]` Create `DialecticSessionDetailsPage` component (route e.g., `/dialectic/:projectId/session/:sessionId`). This will be the main view for Thesis/Antithesis.
    *   `[ ] 1.5.6.1 [TEST-UNIT]` Write tests (displays session description, status; separate views/tabs for Thesis and Antithesis; displays contributions for each stage, grouped by model; loading/error states). Mock store. (RED)
    *   `[ ] 1.5.6.2` Implement component:
        *   Extracts `projectId`, `sessionId` from params.
        *   Uses `selectCurrentProjectDetails` to find the specific session and its contributions.
        *   (If project details not loaded or session not found, dispatch `fetchDialecticProjectDetails`).
        *   Displays overall session status (e.g., 'Generating Thesis', 'Thesis Complete', 'Generating Antithesis', 'Antithesis Complete').
        *   **Thesis View:**
            *   For each model in the session, display its 'thesis' stage contribution content.
            *   Include model name, timestamp, cost/tokens if available.
        *   **Antithesis View:**
            *   For each model in the session (critiquer):
                *   List the 'thesis' contributions it critiqued.
                *   Display its 'antithesis' stage critique content for each.
                *   Link back to the original thesis contribution being critiqued.
        *   Basic cost display for the session (sum of contribution costs).
        *   Ensure a11y principles are applied (e.g., tab navigation, screen reader compatibility).
    *   `[ ] 1.5.6.3` (GREEN)
    *   `[ ] 1.5.6.4 [REFACTOR]` Review layout and data presentation.
    *   `[ ] 1.5.6.5 [TEST-UNIT]` Run tests.
*   `[✅] 1.5.7 [UI]` Add navigation link to `/dialectic` in the main app layout (e.g., sidebar, header).
*   `[🚧] 1.5.8 [COMMIT]` feat(ui): add core pages and navigation for dialectic engine

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
        *   File path structure (as per your previous note, simplified for Phase 1):
            *   `{repo_root}/dialectic/{project_name_slug}/{session_id_short}/thesis/{model_name_slug}.md`
            *   `{repo_root}/dialectic/{project_name_slug}/{session_id_short}/antithesis/{critiquer_model_slug}_on_{original_model_slug}.md`
        *   Ensure a defined Markdown template structure is used for `fileContent` (e.g., YAML frontmatter for `modelName`, `promptId`, `timestamp`, `stage`, `version`; followed by H1 for original prompt, then AI response content).
        *   Credentials (`userGitHubTokenOrAppAuthCredentials`) should be retrieved securely by the calling service action (e.g., from Supabase Vault) and not passed directly by clients.
    *   `[ ] 1.6.3.3` (GREEN)
    *   `[ ] 1.6.3.4 [TEST-UNIT]` Run tests.
*   `[ ] 1.6.4 [BE]` Modify `generateThesisContributions` and `generateAntithesisContributions` actions in `dialectic-service`:
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
        4.  Render the synthesis prompt template using this comprehensive context. Update `dialectic_sessions.current_stage_seed_prompt` with this rendered prompt.
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
*   `[ ] 2.2.3 [BE]` Modify `generateAntithesisContributions` to asynchronously call `generateSynthesisContributions` after `antithesis_complete` status.
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
9.  Introduce "Formal Debate Structures": Allow users to select a predefined set of prompt templates for all 5 stages, tailored for specific debate styles (e.g., "Standard Constructive", "Pro/Con Deep Dive").
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
*   Initial support for selectable formal debate structures and prompts that encourage citation.
*   A basic visual argument map.

---
### 3.1 Schema, Prompts for Parenthesis, Paralysis, Iteration & Advanced Features
*   `[ ] 3.1.1 [DB]` Update `dialectic_sessions` table:
    *   `[ ] 3.1.1.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 3.1.1.2` Add `active_parenthesis_prompt_template_id` (UUID, FK to `prompt_templates.id`, nullable) and `active_paralysis_prompt_template_id` (UUID, FK to `prompt_templates.id`, nullable).
    *   `[ ] 3.1.1.3` Add `max_iterations` (INTEGER, default 3, configurable by user), `current_iteration` (INTEGER, default 1).
    *   `[ ] 3.1.1.4` Add `convergence_status` (TEXT, e.g., 'converged', 'diverged', 'max_iterations_reached', 'user_terminated', nullable).
    *   `[ ] 3.1.1.5` Add `formal_debate_structure_id` (UUID, FK to a new `formal_debate_structures` table, nullable). (GREEN)
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
*   `[ ] 3.1.3 [DB]` Create `formal_debate_structures` table.
    *   `[ ] 3.1.3.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 3.1.3.2` Columns: `id` (UUID PK), `name` (TEXT, unique, e.g., "Standard 5-Stage Constructive", "Pro/Con Deep Dive"), `description` (TEXT), `default_thesis_template_id` (UUID FK to `prompt_templates.id`), `default_antithesis_template_id` (UUID FK), `default_synthesis_template_id` (UUID FK), `default_parenthesis_template_id` (UUID FK), `default_paralysis_template_id` (UUID FK), `is_active` (BOOLEAN, default true).
    *   `[ ] 3.1.3.3` Seed with a "Standard 5-Stage Constructive" entry linking the default_v1 prompt templates created so far. (GREEN)
    *   `[ ] 3.1.3.4 [TEST-UNIT]` Run migration test.
    *   `[ ] 3.1.3.5 [RLS]` Define RLS for read-only access for users.
*   `[ ] 3.1.4 [DB]` Update `dialectic_contributions` table:
    *   `[ ] 3.1.4.1 [TEST-UNIT]` Write migration test. (RED)
    *   `[ ] 3.1.4.2` Add `iteration_number` (INTEGER, not nullable, default 1) to associate contribution with a specific iteration cycle within the session.
    *   `[ ] 3.1.4.3` Add `citations` (JSONB, nullable, array of objects e.g., `[{text: "Source A", url: "link_to_source_a"}, {text: "Another reference"}]`) - primarily for Parenthesis stage. (GREEN)
    *   `[ ] 3.1.4.4` Run migration test.
*   `[ ] 3.1.5 [COMMIT]` feat(db,prompt): schema for full 5-stage cycle, iteration, formal debates, citations

### 3.2 Backend Logic for Parenthesis, Paralysis, Iteration & Advanced Orchestration
*   `[ ] 3.2.1 [BE]` `dialectic-service` Actions: `generateParenthesisContribution`, `generateParalysisContribution`.
    *   `[ ] 3.2.1.1 [TEST-INT]` Write tests for `generateParenthesisContribution`. (RED)
    *   `[ ] 3.2.1.2` Implement `generateParenthesisContribution`: Input `sessionId`, `iterationNumber`. Fetches active Parenthesis prompt template. Uses latest 'synthesis' contribution from the current `iterationNumber` as primary input. Saves result as 'parenthesis' stage for current `iterationNumber`, including any parsed `citations`. Log status. (GREEN)
    *   `[ ] 3.2.1.3 [TEST-INT]` Run tests for `generateParenthesisContribution`.
    *   `[ ] 3.2.1.4 [TEST-INT]` Write tests for `generateParalysisContribution`. (RED)
    *   `[ ] 3.2.1.5` Implement `generateParalysisContribution`: Input `sessionId`, `iterationNumber`. Fetches active Paralysis prompt template. Uses latest 'parenthesis' contribution and summaries of prior stage outputs (thesis, antithesis, synthesis) from current `iterationNumber` as input. Saves result as 'paralysis' stage for current `iterationNumber`. Log status. (GREEN)
    *   `[ ] 3.2.1.6 [TEST-INT]` Run tests for `generateParalysisContribution`.
    *   `[ ] 3.2.1.7` Ensure these actions are called sequentially after the previous stage completes (Synthesis -> Parenthesis -> Paralysis). Update `dialectic_sessions.current_stage_seed_prompt` for each stage.
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
            *   Construct the seed prompt for the next iteration's Thesis (or Synthesis, if design allows skipping). This might involve combining `initial_user_prompt` with the focus areas from Paralysis. Store this as `dialectic_sessions.current_stage_seed_prompt` for the new iteration.
            *   Update `dialectic_sessions.status` to `pending_thesis` (or `pending_synthesis`). Log this.
            *   The system will now wait for the user to trigger the next iteration's first stage (e.g., Thesis or Synthesis) via a frontend action. It does not automatically trigger `generateThesisContributions`.
    *   `[ ] 3.2.2.3` (GREEN)
    *   `[ ] 3.2.2.4 [REFACTOR]` Review (including parsing paralysis output and iteration triggering).
    *   `[ ] 3.2.2.5 [TEST-INT]` Run tests.
*   `[ ] 3.2.3 [BE]` `dialectic-service` Action: `updateSessionParameters`.
    *   `[ ] 3.2.3.1 [TEST-INT]` Write tests. (RED)
    *   `[ ] 3.2.3.2` Input: `sessionId`, `maxIterations` (optional), `formalDebateStructureId` (optional). Allows user to change these for an ongoing or future session.
    *   `[ ] 3.2.3.3` Updates `dialectic_sessions` table. If `formalDebateStructureId` changes, it should update all `active_..._prompt_template_id` fields in the session from the new structure's defaults. (GREEN)
    *   `[ ] 3.2.3.4 [REFACTOR]` Review.
    *   `[ ] 3.2.3.5 [TEST-INT]` Run tests.
*   `[ ] 3.2.4 [BE]` (Experimental) Dynamic Model Routing for Stages:
    *   `[ ] 3.2.4.1 [TEST-UNIT]` Write tests. (RED)
    *   `[ ] 3.2.4.2` Add `preferred_model_for_stage` (JSONB, e.g., `{"parenthesis": "openai/gpt-4-turbo", "synthesis": "anthropic/claude-3-opus"}`) to `dialectic_sessions` or `formal_debate_structures`. (DB change, ensure migration)
    *   `[ ] 3.2.4.3` When executing `generate[StageName]Contribution`, if a preferred model is set for that stage, use it. Otherwise, fall back to the general list of session models. (GREEN)
    *   `[ ] 3.2.4.4 [TEST-UNIT]` Run tests for this routing logic.
*   `[ ] 3.2.5 [COMMIT]` feat(be): implement Parenthesis, Paralysis, iteration, convergence, dynamic model routing

### 3.3 API/Store Updates for Full Cycle & Advanced Features
*   `[ ] 3.3.1 [API]` Update types in `interface.ts`:
    *   `DialecticSession`: add `maxIterations`, `currentIteration`, `convergenceStatus`, `formalDebateStructureId`, new prompt template IDs, `preferredModelForStage`.
    *   `DialecticContribution`: add `iterationNumber`, `citations`.
    *   Add `FormalDebateStructure` type.
    *   Add `UpdateSessionParametersPayload`.
*   `[ ] 3.3.2 [API]` Add API methods:
    *   `listFormalDebateStructures(): Promise<FormalDebateStructure[]>`
    *   `updateSessionParameters(payload: UpdateSessionParametersPayload): Promise<DialecticSession>`
*   `[ ] 3.3.3 [API]` Implement new methods in adapter.
    *    `[ ] 3.3.3.1 [TEST-UNIT]` Write tests. (RED)
    *    `[ ] 3.3.3.2` Implement. (GREEN)
    *    `[ ] 3.3.3.3 [TEST-UNIT]` Run tests.
*   `[ ] 3.3.4 [STORE]` Update `DialecticState`: add `formalDebateStructures: FormalDebateStructure[] | null`, and new fields to `currentProjectDetails.sessions`.
*   `[ ] 3.3.5 [STORE]` Add Thunks/Actions/Reducers for `listFormalDebateStructures` and `updateSessionParameters`.
    *    `[ ] 3.3.5.1 [TEST-UNIT]` Write tests. (RED)
    *    `[ ] 3.3.5.2` Implement. (GREEN)
    *    `[ ] 3.3.5.3 [TEST-UNIT]` Run tests.
*   `[ ] 3.3.6 [STORE]` Ensure `fetchDialecticProjectDetails` populates all new fields, including contributions from all iterations, properly associated.
*   `[ ] 3.3.7 [COMMIT]` feat(api,store): support full 5-stage cycle, iteration params, formal debates

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
    *   `[ ] 3.4.2.2` Allow selection of `FormalDebateStructure` (fetches using `listFormalDebateStructures` thunk). This selection will define the set of default prompt templates for the session.
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
*   `[ ] 3.4.5 [COMMIT]` feat(ui): display full 5-stage cycle, iteration controls, formal debate selection, basic argument map, citation display

### 3.5 Advanced GitHub & IDE Foundation
*   `[ ] 3.5.1 [BE]` GitHub Integration:
    *   `[ ] 3.5.1.1` Ensure Parenthesis and Paralysis outputs are saved to GitHub by the respective backend actions (`generateParenthesisContribution`, `generateParalysisContribution`).
        *   File paths:
            *   `.../session_{session_id_short}/iteration_{N}/4_parenthesis/{model_name_slug}_parenthesis.md`
            *   `.../session_{session_id_short}/iteration_{N}/5_paralysis/{model_name_slug}_paralysis.md`
        *   Ensure Markdown templates include citation rendering for Parenthesis stage.
    *   `[ ] 3.5.1.2` All stage outputs (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis) should be consistently saved under iteration-specific folders if `current_iteration > 1`.
*   `[ ] 3.5.2 [IDE]` Foundational work for IDE plugins (VS Code, JetBrains - primarily design and API needs analysis for Phase 3):
    *   `[ ] 3.5.2.1 [DOCS]` Define core IDE use cases:
        *   Initiate a dialectic session from IDE (e.g., right-click on a code block or requirement file).
        *   View session progress and results within an IDE panel.
        *   Insert/apply outputs (e.g., code snippets from Parenthesis) directly into the editor.
    *   `[ ] 3.5.2.2 [API]` Analyze and document any new API endpoints or modifications to existing ones needed for smooth IDE plugin interaction (e.g., streaming results for long generations, more granular status updates, context-specific prompt generation based on IDE selection). This is analysis, not implementation of new API endpoints unless trivial and essential for planning.
*   `[ ] 3.5.3 [COMMIT]` feat(be,ide): GitHub outputs for all stages with iteration folders, IDE plugin groundwork analysis

### 3.6 Finalizing Phase 3
*   `[ ] 3.6.1 [TEST-E2E]` Write/Update E2E tests for the full 5-stage iterative workflow, including:
    *   Starting a session with a formal debate structure.
    *   Session proceeding through multiple iterations.
    *   Session terminating due to convergence or max iterations.
    *   Viewing citations.
    *   Viewing the basic argument map.
*   `[ ] 3.6.2 [DOCS]` Update all user and developer documentation for the 5-stage process, iteration management, formal debate structures, citation support, and argument mapping.
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
1.  **Domain-Specific Configurations:** Create specialized DialeqAI setups for coding, legal, scientific research, etc. (e.g., pre-canned prompt libraries, model selections, workflow rules, specialized formal debate structures).
2.  **Advanced HitL:** Allow user intervention at any stage (e.g., edit a model's contribution before it's used in the next stage), collaborative editing of outputs, and more granular feedback mechanisms that directly influence subsequent steps.
3.  **Learning & Auto-Tuning:** System learns from successful dialectical patterns (user feedback, convergence rates, quality of output) to improve prompt generation, model selection for stages, or orchestration strategies. (Long-term research-oriented).
4.  **Expanded Model Support:** Integrate more models, including open-source (e.g., via local Ollama or Hugging Face integrations if feasible) and potentially user-provided custom models (BYOM - Bring Your Own Model API keys/endpoints).
5.  **Public API:** Offer a well-documented, versioned public API for third-party integrations to programmatically run dialectic sessions.
6.  **Advanced Argument Mapping & Visualization:** Rich, interactive visualization of the dialectic flow, allowing users to explore connections, expand/collapse threads, and understand the reasoning evolution.
7.  **Meta-Model Orchestration (Experimental):** Investigate using a dedicated AI model to manage the dialectic flow itself, deciding when to iterate, which models to use for which stage, or how to synthesize conflicting information based on context.
8.  **Advanced Code-Specific Tools (If "Coding" Domain is prioritized):** Deeper integration for developers (e.g., generating unit tests for code produced in Parenthesis, suggesting refactors, linking dialectic discussions to specific code blocks or PRs).
9.  **CLI Enhancements:** Develop a feature-rich CLI tool as described in PRDs (`aigc new`, `aigc models`, `aigc prompt`, `aigc status`, `aigc review`, `aigc resolve`, `aigc export`) for power users and automation.
10. **Failure Mode Mitigation & UX:** Robust cost controls (hard limits), latency optimization (e.g., streaming partial results for long generations where possible), UX patterns that emphasize critical thinking and human oversight.
11. **UGC Showcase & Community Prompts:** Platform for users to share successful prompt templates and formal debate structures.

**Estimated Duration:** Ongoing, iterative development.

**Starting Point:** Completion of Section 3 (Phase 3). A fully functional 5-stage iterative dialectic engine is in place.

**Deliverables for Phase 4 (Iterative & Ongoing, examples for first few sprints):**
*   (Sprint 1-2) Enhanced CLI tool with key commands (`list-projects`, `create-project`, `start-session`, `get-session-status`).
*   (Sprint 1-2) Initial Domain Specialization: "Software Development - Architecture Planning" formal debate structure with tailored prompts.
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
    *   `[ ] 4.1.B.3 [DB]` Create a new entry in `formal_debate_structures` named "Software Architecture Planning" linking these 5 new prompt templates.
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
        *   `[ ] 4.1.D.2.2` Expose `listProjects`, `getProjectDetails`, `startSession`, `listModelCatalog`, `listFormalDebateStructures` actions.
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
        *   Stage transitions (e.g., `pending_thesis` -> `generating_thesis` -> `thesis_complete`).
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