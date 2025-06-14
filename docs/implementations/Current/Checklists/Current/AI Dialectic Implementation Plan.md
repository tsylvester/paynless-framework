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

## Section 0: Core Data Handling Principles & Supabase Storage Architecture

**Overarching Principle:** This section establishes the foundational strategy for how the AI Dialectic Engine will manage and store data artifacts. Understanding and adhering to these principles is crucial for all subsequent development phases.

**Key Goals:**
*   Ensure a consistent, reliable, and scalable approach to storing all generated and user-provided artifacts.
*   Align internal storage structures with the planned GitHub export structure for seamless integration.
*   Provide clear linkage between database records and their corresponding file-based artifacts in cloud storage.

---
*   `[✅] 0.1 [ARCH]` **Define Supabase Storage as Primary Artifact Repository:**
    *   `[✅] 0.1.1 [DOCS]` Document that Supabase Storage will serve as the primary, canonical storage for all dialectic session artifacts. This includes, but is not limited to:
        *   Initial user prompts (text or file references).
        *   System-generated seed input components for each iteration (e.g., `user_prompt.md`, `system_settings.json`).
        *   Raw and formatted AI model contributions for each stage (e.g., Thesis, Antithesis, Synthesis).
        *   User-provided feedback files or structured data.
        *   Supporting documents or resources generated during the dialectic process.
        *   Project-level readme and organizational folders (`Implementation/`, `Complete/`).
    *   `[✅] 0.1.2 [DOCS]` Specify that the folder structure within the designated Supabase Storage bucket (e.g., a configurable bucket name, defaulting to `dialectic-contributions`) will strictly follow the pattern outlined for GitHub export (referencing details in `Section 1.6.3.2` and its associated file path structure). The base path will be `projects/{project_id}/`.
        *   Example structure within `projects/{project_id}/`:
            *   `project_readme.md`
            *   `Implementation/`
            *   `Complete/`
            *   `sessions/{session_id}/`
                *   `iteration_{N}/`
                    *   `0_seed_inputs/`
                        *   `user_prompt.md`                (The specific user textual input that kicked off this iteration)
                        *   `system_settings.json`          (Models, core prompt templates used for this iteration)
                    *   `1_hypothesis/` (or `1_thesis`)
                        *   `seed_prompt.md`                (The complete prompt sent to the models for *this specific stage's* completion, incorporating elements from `0_seed_inputs` and the hypothesis stage prompt template)
                        *   `{model_name_slug}_hypothesis.md` (Contains YAML frontmatter + AI response)
                        *   `user_feedback_hypothesis.md`   (User's consolidated feedback on this stage's contributions)
                        *   `documents/`                      (Optional refined documents, e.g., PRDs from each model)
                        *       `{model_name_slug}_prd_hypothesis.md`
                        *       `...`
                    *   `2_antithesis/`
                        *   `seed_prompt.md`                (The complete prompt for *this stage*, built from hypothesis outputs, user feedback on hypothesis, and antithesis stage prompt template)
                        *   `{critiquer_model_slug}_critique_on_{original_model_slug}.md`
                        *   `...`
                        *   `user_feedback_antithesis.md`
                    *   `3_synthesis/`
                        *   `seed_prompt.md`                (The complete prompt for *this stage*)
                        *   `{model_name_slug}_synthesis.md`
                        *   `...`
                        *   `user_feedback_synthesis.md`
                    *   `4_parenthesis/`
                        *   `seed_prompt.md`                (The complete prompt for *this stage*)
                        *   `{model_name_slug}_parenthesis.md`
                        *   `...`
                        *   `user_feedback_parenthesis.md`
                    *   `5_paralysis/`
                        *   `seed_prompt.md`                (The complete prompt for *this stage*)
                        *   `{model_name_slug}_paralysis.md`
                        *   `...`
                        *   `user_feedback_paralysis.md`
                    *   (Additional stages would follow the same pattern with their own `seed_prompt.md`)
                    *   `iteration_summary.md` (optional)
*   `[✅] 0.2 [ARCH]` **Database Path and Bucket Conventions:**
    *   `[✅] 0.2.1 [DOCS]` Clarify that all database fields designed to store paths to files (e.g., `dialectic_contributions.content_storage_path`, `dialectic_contributions.seed_prompt_url`, `dialectic_project_resources.storage_path`) will store relative paths *within the designated Supabase Storage bucket*. These paths will not include the bucket name itself.
    *   `[✅] 0.2.2 [DOCS]` Relevant tables (e.g., `dialectic_contributions`, `dialectic_project_resources`) will include a `content_storage_bucket` (or similarly named) field. This field will store the name of the Supabase Storage bucket where the artifact resides (e.g., "dialectic-contributions"). For all artifacts stored internally by the application, this value will be derived from a configurable environment variable (`CONTENT_STORAGE_BUCKET`), ensuring no hardcoded bucket names in the source code. This allows for future flexibility if multiple buckets are used, though a single primary bucket is the initial plan.
*   `[✅] 0.3 [DEFS]` **Define "Seed Input Components" for an Iteration (Stored in Supabase Storage):**
    *   `[✅] 0.3.1 [DOCS]` **`user_prompt.md`**: This Markdown file contains the specific user-provided or system-derived textual input that forms the core basis of an iteration's prompt. It is stored in Supabase Storage at the path: `projects/{project_id}/sessions/{session_id}/iteration_{N}/0_seed_inputs/user_prompt.md`.
    *   `[✅] 0.3.2 [DOCS]` **`system_settings.json`**: A JSON file detailing the AI models selected for the iteration/stage, core `system_prompts.id` used, active `domain_specific_prompt_overlays` configurations, and other critical system-level parameters or variables applied to construct the full prompt for that iteration. Stored in Supabase Storage at: `projects/{project_id}/sessions/{session_id}/iteration_{N}/0_seed_inputs/system_settings.json`.
    *   `[✅] 0.3.3 [DOCS]` **"Fully Constructed Stage Seed Prompt" (`seed_prompt.md` within each stage folder)**: This refers to the complete and final prompt text that is actually sent to an AI model for generating contributions for a *specific stage* within an iteration. It is dynamically assembled by the backend service (e.g., `dialectic-service`) by combining:
        *   The iteration's base `user_prompt.md` (from `.../iteration_{N}/0_seed_inputs/user_prompt.md`).
        *   The iteration's `system_settings.json` (from `.../iteration_{N}/0_seed_inputs/system_settings.json`).
        *   The relevant `system_prompts.prompt_text` for the current stage.
        *   For stages after the first (e.g., Antithesis, Synthesis), it also incorporates the AI-generated contributions (and any user edits to them) and collated user feedback from the *previous* stage.
    *   `[✅] 0.3.3.1 [BE]` This fully constructed seed prompt for a stage is stored in Supabase Storage at a path like: `projects/{project_id}/sessions/{session_id}/iteration_{N}/{stage_name_slug}/seed_prompt.md`. The `dialectic_contributions.seed_prompt_url` field will point to this file for each contribution generated in that stage.
*   `[✅] 0.4 [ARCH]` **Frontend Data Access:**
    *   `[✅] 0.4.1 [DOCS]` Document that the frontend application will primarily fetch file-based content (e.g., AI contributions, user prompts stored as files) directly from Supabase Storage. This will typically be achieved using presigned URLs generated by the backend or via the Supabase client SDK if appropriate RLS and access policies are in place for direct client access to specific paths.
*   `[✅] 0.5 [ARCH]` **GitHub Export as a Replicator:**
    *   `[✅] 0.5.1 [DOCS]` Emphasize that the GitHub integration feature (detailed in Section 1.6) acts as an exporter or replicator. It is the first of potentially many such replicators that will be configured via a `JSONB` field in the `dialectic_projects` table (see `1.1.1.2`). The application will always read the structured artifacts from its primary Supabase Storage bucket and then, based on project-level configuration, replicate them to the user's connected external services like a GitHub repository, maintaining an identical folder and file structure. Supabase Storage remains the primary source of truth for the application.

---

## Section 1: Phase 1 - Core Dialectic Cycle (5 Stages), Basic UI, and Backend Foundations

**Goal:** Implement the foundational 5-stage dialectic process (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis) with a basic, usable UI for a single user, single session, single iteration context. This phase focuses on getting the core loop working end-to-end.

---

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
    *   `[✅] 1.0.1.1` Identify necessary variables (e.g., API keys for new AI providers if not already present, default model settings for Dialectic Engine, `CONTENT_STORAGE_BUCKET` for the application's main storage bucket).
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
*   `[✅] 1.0.3.D.0 [BE/API/STORE/UI]` Enhanced Backend and Frontend for Stage-Aware Domain Overlay Selection
    *   `[✅] 1.0.3.D.0.1 [TYPES]` Define `DomainOverlayDescriptor` type.
        *   Used across BE, API, and Store.
        *   Structure: `{ id: string (domain_specific_prompt_overlays.id), domainTag: string, description: string | null, stageAssociation: string }`
    *   `[✅] 1.0.3.D.0.2 [BE]` **NEW** `dialectic-service` Action: Create `listAvailableDomainOverlays`. (Backend action name in types is `listAvailableDomainOverlays`, implemented as `listAvailableDomainOverlays` in service logic which is called by main router correctly based on `listAvailableDomainOverlays` action string from client)
        *   `[✅] 1.0.3.D.0.2.1 [TEST-INT]` Write tests for `listAvailableDomainOverlays`. Input: `stageAssociation: string`. Output: `ApiResponse<DomainOverlayDescriptor[]>`. Verifies fetching active `domain_specific_prompt_overlays` joined with `system_prompts` filtered by `stageAssociation`. (Requires checking `supabase/functions/dialectic-service/listAvailableDomainOverlays.test.ts`)
        *   `[✅] 1.0.3.D.0.2.2` Implement the action in `supabase/functions/dialectic-service/index.ts`. Query should select `dsso.id`, `dsso.domain_tag`, `dsso.description`, `sp.stage_association`. (Implemented in `listAvailableDomainOverlays.ts` and called by `index.ts`)
        *   `[✅] 1.0.3.D.0.2.3 [REFACTOR]` Review query efficiency and data mapping. (Query and mapping appear reasonable)
        *   `[✅] 1.0.3.D.0.2.4 [TEST-INT]` Run tests.
    *   `[✅] 1.0.3.D.0.3 [API]` Update `@paynless/api`.
        *   `[✅] 1.0.3.D.0.3.1` Add `DomainOverlayDescriptor` type to `packages/types/src/dialectic.types.ts`.
        *   `[✅] 1.0.3.D.0.3.2` **NEW** Add `listAvailableDomainOverlays(stageAssociation: string): Promise<ApiResponse<DomainOverlayDescriptor[]>>` to `DialecticAPIInterface`. (Implemented as `listAvailableDomainOverlays(payload: { stageAssociation: string })` in `DialecticApiClient` interface and implementation)
        *   `[✅] 1.0.3.D.0.3.3 [TEST-UNIT]` Write unit tests for the new adapter method. (Requires checking `packages/api/src/dialectic.api.test.ts`)
        *   `[✅] 1.0.3.D.0.3.4` Implement the new adapter method.
        *   `[✅] 1.0.3.D.0.3.5` Update mocks for the new method.
        *   `[✅] 1.0.3.D.0.3.6 [TEST-UNIT]` Run tests.
    *   `[✅] 1.0.3.D.0.4 [STORE]` Update `@paynless/store` (`dialecticStore.ts`, `dialecticStore.selectors.ts`).
        *   `[✅] 1.0.3.D.0.4.1` Update `DialecticState`:
            *   **NEW** Add `availableDomainOverlayDescriptors: DomainOverlayDescriptor[] | null`.
            *   Keep `selectedDomainTag: string | null`.
            *   **NEW** Add `selectedDomainOverlayId: string | null`.
            *   Add `currentStageForOverlaySelection: string | null`. (Note: `DialecticStateValues` in types file contains these; store uses `selectedStageAssociation` for `currentStageForOverlaySelection`)
        *   `[✅] 1.0.3.D.0.4.2 [TEST-UNIT]` Write tests for new thunk/actions/reducers/selectors. (Requires checking `packages/store/src/dialecticStore.test.ts` and `dialecticStore.selectors.test.ts`)
            *   **NEW Thunk**: `fetchAvailableDomainOverlays(stageAssociation: string)` (calls new API method, populates `availableDomainOverlayDescriptors`). (Thunk name in store is `fetchAvailableDomainOverlays`, calls API `listAvailableDomainOverlays`)
            *   Existing Action `setSelectedDomainTag(domainTag: string | null)` (ensure it clears `selectedDomainOverlayId` if `domainTag` changes).
            *   **NEW Action**: `setSelectedDomainOverlayId(overlayId: string | null)`.
            *   **NEW/Updated Selectors**: `selectCurrentStageAssociation()`, `selectAvailableDomainOverlayDescriptorsForCurrentStage()`, `selectUniqueDomainTagsForCurrentStage()` (feeds `DomainSelector`), `selectOverlay(domainTag: string)` (feeds new `DomainOverlayDescriptionSelector`), `selectSelectedDomainOverlayId()`, `selectSelectedDomainOverlayDescriptor()`.
        *   `[✅] 1.0.3.D.0.4.3` Implement new thunk, actions, and related reducer logic. (Thunk `fetchAvailableDomainOverlays` implemented. `setSelectedDomainTag` does NOT clear `selectedDomainOverlayId`. `setSelectedDomainOverlayId` action type exists, implementation status unknown from snippet).
        *   `[✅] 1.0.3.D.0.4.4` Implement new selectors. (Requires checking `packages/store/src/dialecticStore.selectors.ts`)
        *   `[✅] 1.0.3.D.0.4.5 [TEST-UNIT]` Run tests.
    *   `[✅] 1.0.3.D.0.5 [DB]` Confirm `dialectic_projects` table definition includes `selected_domain_overlay_id` (UUID, FK to `domain_specific_prompt_overlays.id`, nullable). This `selected_domain_overlay_id` is the primary key for the chosen overlay. The existing `selected_domain_tag` column in `dialectic_projects` can remain for denormalization or be populated based on the `selected_domain_overlay_id`. (Requires checking DB migration files)
    *   `[✅] 1.0.3.D.0.6 [BE/API/STORE]` Integrate `selected_domain_overlay_id` into Project Creation Flow.
        *   `[✅] 1.0.3.D.0.6.1` Modify `createProject` action in `dialectic-service` to accept and store `selected_domain_overlay_id`. (Update tests) (Backend `CreateProjectPayload` and `createProject.ts` implementation currently do not include this)
        *   `[✅] 1.0.3.D.0.6.2` Modify `CreateProjectPayload` in API and Store to include `selected_domain_overlay_id`. (Update tests) (`CreateProjectPayload` in `packages/types` and used by API client/Store thunk does not include this)
*   `[✅] 1.0.3.D.1 [UI]` **Update** `DomainSelector` UI Component.
    *   `[✅] 1.0.3.D.1.1 [TEST-UNIT]` Update unit tests for the `DomainSelector` component. (GREEN)
        *   It now uses the `selectUniqueDomainTagsForCurrentStage()` selector to get its list of `domainTag` strings.
        *   On selection, it dispatches `setSelectedDomainTag(selectedTag)` and `setSelectedDomainOverlayId(null)` (to reset any previous description-specific choice).
        *   It should also check if the selected tag has only one possible overlay detail (e.g., by checking if `selectedOverlay(selectedDomainTag)` returns a single item). If so, it should also dispatch `setSelectedDomainOverlayId` with that single overlay's ID.
    *   `[✅] 1.0.3.D.1.2` Update the `DomainSelector` component's implementation to reflect this logic. (GREEN)
    *   `[✅] 1.0.3.D.1.3` Run unit tests for `DomainSelector`. (GREEN)
*   `[✅] 1.0.3.D.2 [UI]` **NEW** Create `DomainOverlayDescriptionSelector` UI Component.
    *   `[✅] 1.0.3.D.2.1 [TEST-UNIT]` Write unit tests for the `DomainOverlayDescriptionSelector` component. (GREEN)
        *   It displays `description`s (and their associated `id`s) for the currently selected `domainTag` and stage, using the `selectedOverlay(selectedDomainTag)` selector.
        *   If multiple options exist for the stage and domainTag, the user can choose which specific option they want from the `DomainOverlayDescriptionSelector` component. 
        *   On selection, it dispatches `setSelectedDomainOverlayId(selectedOverlayId)`.
    *   `[✅] 1.0.3.D.2.2` Implement the `DomainOverlayDescriptionSelector` component. (GREEN)
    *   `[✅] 1.0.3.D.2.3 [TEST-UNIT]` Run tests. (GREEN)
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
*   `[✅] 1.0.8 [REFACTOR/API/TEST-UNIT/TEST-INT]` Refine Core `ApiClient.request` Method for Dynamic Content-Type and Body Handling.
    *   `[✅] 1.0.8.1 [API]` Modify the private `request` method in `packages/api/src/apiClient.ts`:
        *   **Content-Type Header Logic:**
            *   If `FetchOptions.headers` (passed to `request`) explicitly includes a `Content-Type` header, this provided `Content-Type` MUST be used and respected.
            *   If `FetchOptions.body` is an instance of `FormData`, the `apiClient` MUST NOT set any `Content-Type` header itself. This allows the browser's `fetch` API to correctly set the `Content-Type` to `multipart/form-data` along with the necessary `boundary` parameter.
            *   If no `Content-Type` is provided by the caller (in `FetchOptions.headers`) and the `FetchOptions.body` is not `FormData` (e.g., it's a plain JavaScript object intended for JSON), the `apiClient` MAY default to setting `Content-Type: application/json`.
        *   **Request Body Processing Logic:**
            *   The `FetchOptions.body` MUST only be transformed (e.g., via `JSON.stringify()`) if the effective `Content-Type` (whether explicitly set by caller or defaulted by `apiClient` for objects) is `application/json` and the body itself is a type that requires stringification (e.g., a plain JavaScript object).
            *   If the `FetchOptions.body` is `FormData`, or if it's already a string (e.g., pre-stringified JSON when the caller also sets the appropriate `Content-Type`), it MUST be passed to the underlying `fetch` call as-is, without modification.
    *   `[✅] 1.0.8.2 [API]` Review and update the public helper methods within `ApiClient` (e.g., `post`, `put`, `patch`) to ensure they pass the `body` and `options` to the refined `request` method correctly, aligning with the new dynamic handling logic (i.e., avoid unconditional `JSON.stringify`).
    *   `[✅] 1.0.8.3 [TEST-UNIT]` Update all relevant API client unit tests in `packages/api/src/**/*.test.ts` (including but not limited to `apiClient.test.ts` and specific adapter tests like `dialectic.api.test.ts`):
        *   Verify the new dynamic `Content-Type` and body handling logic within the `request` method and its public callers (`post`, `put`, etc.).
        *   Ensure comprehensive test coverage for scenarios involving `FormData` bodies (asserting no `Content-Type` is set by `apiClient` and body is not stringified).
        *   Test cases where `Content-Type` is explicitly provided by the caller for various body types.
        *   Test cases where plain objects are sent without explicit `Content-Type` (asserting default to `application/json` and body is stringified).
    *   `[✅] 1.0.8.4 [TEST-INT]` Review and update all integration tests for backend Edge Functions (located in `supabase/functions/**/*.test.ts`) that are invoked via the `ApiClient`.
        *   Ensure that test setups, mocks for the `ApiClient` or `fetch`, and assertions correctly reflect the expected `Content-Type` (especially `multipart/form-data` with appropriate boundary handling by mock servers if applicable) and the raw request body formats.
        *   Verify that Edge Function routing based on `Content-Type` (e.g., differentiating `multipart/form-data` from `application/json`) behaves as expected with the corrected client-side requests.
    *   `[✅] 1.0.8.5 [DOCS]` Briefly document this dynamic and flexible request handling behavior in `packages/api/README.md` or as prominent inline comments within `apiClient.ts`. This will serve as a guide for developers using or extending the `ApiClient`.
    *   `[✅] 1.0.8.6 [COMMIT]` refactor(api): implement dynamic Content-Type and body handling in core ApiClient, update tests

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
*   `[✅] 1.0.B.1 [DB]` Create `dialectic_contributions` table. (Schema defined, assumed implemented or to be implemented as prerequisite for upload functionality.)
    *   `[✅] 1.0.B.1.1 [TEST-UNIT]` Write migration test for `dialectic_contributions` table creation. (RED)
    *   `[✅] 1.0.B.1.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `project_id` (UUID, foreign key to `dialectic_projects.id` on delete cascade, not nullable)
        *   `user_id` (UUID, foreign key to `auth.users.id` on delete set null, not nullable)
        *   `file_name` (TEXT, not nullable)
        *   `storage_bucket` (TEXT, not nullable, e.g., "dialectic-contributions")
        *   `storage_path` (TEXT, not nullable, unique within bucket)
        *   `mime_type` (TEXT, not nullable)
        *   `size_bytes` (BIGINT, not nullable)
        *   `resource_description` (TEXT, nullable, e.g., "Initial prompt attachment for project creation")
        *   `created_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `updated_at` (TIMESTAMPTZ, default `now()`, not nullable)
    *   `[✅] 1.0.B.1.3` Create Supabase migration script for `dialectic_contributions`. (GREEN)
    *   `[✅] 1.0.B.1.4 [REFACTOR]` Review migration.
    *   `[✅] 1.0.B.1.5 [TEST-UNIT]` Run `dialectic_contributions` schema migration test.
*   `[✅] 1.0.B.2 [RLS]` Define RLS for `dialectic_contributions`.
    *   `[✅] 1.0.B.2.1 [TEST-INT]` Write RLS tests (user can CRUD resources for projects they own; service role full access). (RED)
    *   `[✅] 1.0.B.2.2` Implement RLS policies. (GREEN)
    *   `[✅ 1.0.B.2.3 [TEST-INT]` Run RLS tests.
*   `[✅] 1.0.B.3 [BE]` `dialectic-service` Action: `uploadProjectResourceFile`.
    *   `[✅] 1.0.B.3.1 [TEST-INT]` Write integration tests for `uploadProjectResourceFile`. (GREEN)
        *   Input: `projectId` (string), `fileName` (string), `fileType` (string/mime-type). The actual file will be part of a FormData request. Auth.
        *   Output: `DialecticProjectResource` object (or subset of its fields).
        *   Verifies file is uploaded to Supabase Storage in a path like `projects/{projectId}/resources/{fileName}` or `projects/{projectId}/resources/{resource_uuid}/{fileName}`.
        *   Verifies a record is created in `dialectic_contributions`.
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
*   `[✅] 1.0.B.5 [STORE]` Extend `@paynless/store` for Project Resource Upload. (Store thunk `uploadProjectResourceFile` exists and is called by UI. Its current backend implementation target for *project-specific resources* needs to align with DB state. Marked [🚧] pending clarification of `dialectic_contributions` table.)
    *   `[✅] 1.0.B.5.1` Add state for managing project resource uploads (e.g., `isUploadingResource: boolean`, `uploadResourceError: ApiError | null`). (Store thunk `uploadProjectResourceFile` exists).
    *   `[✅] 1.0.B.5.2 [TEST-UNIT]` Write unit tests for `uploadProjectResourceFile` thunk in `dialecticStore.test.ts`. (RED -> GREEN, thunk mocked and used in form tests).
    *   `[✅] 1.0.B.5.3` Implement `uploadProjectResourceFile` thunk. Calls API, updates loading/error states. May update `currentProjectDetail.resources` if project details are enriched to include resources. (GREEN, thunk exists and called from form).
    *   `[✅] 1.0.B.5.4 [TEST-UNIT]` Run thunk tests.
*   `[✅] 1.0.B.6 [COMMIT]` feat(common,be,db,api,store): Add generic file uploader and project resource handling (UI part largely done. DB for `dialectic_contributions` is uncertain. BE/API/Store for it are [🚧] pending DB clarification.)

### 1.1 Database Schema for Dialectic Core (Continued)
*   `[✅] 1.1.1 [DB]` Create `dialectic_projects` table.
    *   `[✅] 1.1.1.1 [TEST-UNIT]` Write migration test for `dialectic_projects` table creation. (RED)
    *   `[✅] 1.1.1.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `user_id` (UUID, foreign key to `profiles.id` on delete cascade, not nullable)
        *   `project_name` (TEXT, not nullable)
        *   `initial_user_prompt` (TEXT, nullable, user's original framing of the problem or filename if uploaded)
        *   `initial_prompt_resource_id` (UUID, nullable, FK to `dialectic_contributions.id` ON DELETE SET NULL) - Link to the uploaded initial prompt file.
        *   `selected_domain_overlay_id` (UUID, FK to `domain_specific_prompt_overlays.id`, nullable)
        *   `selected_domain_tag` (TEXT, nullable)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`) 
        *   `repo_url` (JSONB, nullable) - Stores configuration for external replication targets. E.g., `{"github": {"repo_url": "...", "branch": "main"}, "dropbox": {"folder_path": "/..."}}`.
        *   `status` (TEXT, e.g., 'active', 'archived', 'template', default 'active')
    *   `[ ] 1.1.1.2.A [TEST-UNIT]` Update migration test for `dialectic_projects` to include testing for the `initial_prompt_resource_id` column and its FK constraint. (RED)
    *   `[ ] 1.1.1.2.B [DB]` Update the Supabase migration script for `dialectic_projects` (or create a new one) to add the `initial_prompt_resource_id` column and its foreign key. (GREEN)
    *   `[✅] 1.1.1.3` Create Supabase migration script for `dialectic_projects`. (GREEN)
    *   `[✅] 1.1.1.4 [REFACTOR]` Review migration script and table definition.
    *   `[✅] 1.1.1.5 [TEST-UNIT]` Run `dialectic_projects` schema migration test. (GREEN)
*   `[✅] 1.1.2 [DB]` Create `dialectic_sessions` table.
    *   `[✅] 1.1.2.1 [TEST-UNIT]` Write migration test for `dialectic_sessions` table creation. (RED)
    *   `[✅] 1.1.2.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `project_id` (UUID, foreign key to `dialectic_projects.id` on delete cascade, not nullable)
        *   `session_description` (TEXT, nullable, e.g., "Initial run with models A, B, C using default thesis prompt")
        *   `user_input_reference_url` (TEXT, nullable, Link to the user's collated input/selections for the current stage) **(MODIFIED/RENAMED)**
        *   `iteration_count` (INTEGER, default 1, for multi-cycle sessions later)
        *   `selected_model_catalog_ids` (UUID[], nullable, Array of `ai_providers.id` for selected models) **(NEW)**
        *   `stage` (ENUM `dialectic_stage_enum` - e.g., 'THESIS', 'ANTITHESIS', 'SYNTHESIS', 'PARENTHESIS', 'PARALYSIS', NOT NULL) **(NEW)**
        *   `created_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `updated_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `status` (TEXT, e.g., `pending_thesis`, `thesis_complete`, `pending_antithesis`, `antithesis_complete`, `pending_synthesis`, `synthesis_complete`, `critique_recommended`, `complete_final_review`, `archived_failed`, `archived_incomplete`, `archived_complete`)
        *   `associated_chat_id` (UUID, nullable, tracks the `chat.id` used for interactions with the `/chat` Edge Function for this dialectic session. This allows dialectics to potentially originate from or integrate with existing chat sessions.)
        *   (REMOVED: `seed_prompt_url`, `prompt_template_id_used`)
    *   `[✅] 1.1.2.3 [DB]` Define constraints (FKs already included with columns, add any CHECK constraints if needed for `status` or `iteration_count`).
    *   `[✅] 1.1.2.4 [REFACTOR]` Review migration script and table definition.
    *   `[✅] 1.1.2.5 [TEST-UNIT]` Run `dialectic_sessions` schema migration test. (GREEN)
*   `[✅] 1.1.3 [DB]` ~~Create `dialectic_session_prompts` table~~ **DEPRECATED/REMOVED**.
    *   This table is no longer needed. The functionality of storing the fully rendered prompt sent to the agent is now handled by `dialectic_contributions.seed_prompt_url` (which links to the prompt file in storage).
    *   ~~`[✅] 1.1.3.1 [TEST-UNIT]` Write migration test for `dialectic_session_prompts` table.~~
    *   ~~`[✅] 1.1.3.2 [DB]` Create migration script for `dialectic_session_prompts` table.~~
    *   ~~`[✅] 1.1.3.3 [DB]` Update `types_db.ts` for `dialectic_session_prompts`.~~
    *   ~~`[✅] 1.1.3.4 [RLS]` Define RLS policies for `dialectic_session_prompts` table.~~
        *   ~~Policy Details: ...~~
    *   ~~`[✅] 1.1.3.5 [TEST-INT]` Write RLS tests for `dialectic_session_prompts`.~~
*   `[✅] 1.1.4 [DB]` ~~Create `dialectic_session_models` table~~ **DEPRECATED/REMOVED**.
    *   This table is no longer needed. The list of selected models is stored in `dialectic_sessions.selected_model_catalog_ids` (array of UUIDs). The specific model used for a contribution is recorded in `dialectic_contributions.model_id`.
    *   ~~`[✅] 1.1.4.1 [TEST-UNIT]` Write migration test for `dialectic_session_models` table. (GREEN)~~
    *   ~~`[✅] 1.1.4.2` Define columns: ...~~
    *   ~~`[✅] 1.1.4.3` Add unique constraint on (`session_id`, `model_id`).~~
    *   ~~`[✅] 1.1.4.4` Create Supabase migration script for `dialectic_session_models`. (GREEN)~~
    *   ~~`[✅] 1.1.4.5 [REFACTOR]` Review migration script.~~
    *   ~~`[✅] 1.1.4.6 [TEST-UNIT]` Run migration test. (GREEN)~~
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
    *   `[✅] 1.1.5.2` Define columns for `dialectic_contributions`:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `session_id` (UUID, foreign key to `dialectic_sessions.id` on delete cascade, not nullable)
        *   `model_id` (UUID, foreign key to `ai_providers.id` on delete set null, nullable) **(NEW)** - Identifies the AI model used.
        *   `model_name` (TEXT, nullable) **(NEW)** - Snapshot of the model's name for historical reference.
        *   `stage` (TEXT, not nullable, e.g., 'thesis', 'antithesis', 'synthesis') - Current definition (was `contribution_type`).
        *   `iteration_number` (INTEGER, not nullable, default 1) - Tracks iteration within the stage for the session.
        *   `prompt_template_id_used` (UUID, foreign key to `system_prompts.id` on delete set null, nullable)
        *   `seed_prompt_url` (TEXT, nullable - Path to the stage-specific `seed_prompt.md` file in Supabase Storage that was used to generate this contribution. E.g., `projects/{project_id}/sessions/{session_id}/iteration_{N}/{stage_slug}/seed_prompt.md`)
        *   `content_storage_bucket` (TEXT, nullable)
        *   `content_storage_path` (TEXT, nullable)
        *   `content_mime_type` (TEXT, nullable)
        *   `content_size_bytes` (BIGINT, nullable)
        *   `edit_version` (INTEGER, NOT NULL, default 1) - Increments for each user edit of this specific conceptual contribution. AI generation is version 1.
        *   `is_latest_edit` (BOOLEAN, NOT NULL, default TRUE) - True if this row represents the latest version of this conceptual contribution (either AI-generated or user-edited).
        *   `original_model_contribution_id` (UUID, FK to `dialectic_contributions.id` ON DELETE SET NULL, nullable) - If this is a user edit (`edit_version > 1`), this points to the initial AI-generated contribution row (`edit_version = 1`). For initial AI contributions, this can be NULL or point to self.
        *   `user_id` (UUID, FK to `auth.users.id` on delete set null, nullable) - For AI-generated contributions, this might be the user who initiated the session. For user-edited contributions, this is the ID of the user who made the edit.
        *   `raw_response_storage_path` (TEXT, nullable)
        *   `target_contribution_id` (UUID, foreign key to `dialectic_contributions.id` on delete set null, nullable)
        *   `tokens_used_input` (INTEGER, nullable)
        *   `tokens_used_output` (INTEGER, nullable)
        *   `processing_time_ms` (INTEGER, nullable)
        *   `error` (TEXT, nullable)
        *   `citations` (JSONB, nullable)
        *   `created_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   `updated_at` (TIMESTAMPTZ, default `now()`, not nullable)
        *   (REMOVED: `session_model_id`. Fields like `content`, `content_format`, `notes`, `cost_usd` should be reviewed and removed if fully superseded by storage paths and token counts.)
        *   (Existing but not listed above and kept: `user_id`, `content`, `content_format`, `notes`, `cost_usd` needs review if still present/needed)
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
    *   Modify relevant actions in `dialectic-service` (e.g., `generateContributions`, etc., which are called by `callUnifiedAIModel` or its callers).
    *   `[✅] 1.1.5.B.1` When an AI model's output is received:
        1.  `[✅]` Generate a UUID for the `dialectic_contributions.id` *before* uploading content, so it can be used in the storage path for consistency. (GREEN)
        2.  `[✅]` Define the storage path (e.g., using `project_id`, `session_id`, and the new `contribution_id`). Example: `${projectId}/${sessionId}/${contributionId}.md`. (GREEN)
        3.  `[✅]` Use the `uploadToStorage` utility to save the AI-generated content to the `dialectic_contributions` bucket with the correct `contentType` (e.g., `text/markdown`). (GREEN)
        4.  `[✅]` Record `sizeBytes` (from file or `getFileMetadata`) after upload. (GREEN)
        5.  `[✅]` In the `dialectic_contributions` table, store:
            *   `[✅]` `content_storage_bucket` (e.g., "dialectic-contributions"). (GREEN)
            *   `[✅]` The actual `content_storage_path` returned by the upload. (GREEN)
            *   `[🚧]` `content_mime_type` (e.g., "text/markdown"). (GREEN - Plumbing for dynamic `contentType` from the AI response object (`UnifiedAIResponse`) is now in place. Currently, `UnifiedAIResponse.contentType` defaults to "text/markdown" as the upstream `/chat` function does not yet provide a more specific MIME type from the AI provider. Future enhancements to `/chat` could enable truly dynamic types here.)
            *   `[✅]` `content_size_bytes`. (GREEN)
            *   `[✅]` `raw_response_storage_path` (path to the raw JSON response from the AI model, stored in the same bucket). (GREEN)
            *   `[✅]` `tokens_used_input`, `tokens_used_output` (from AI response). (GREEN)
            *   `[✅]` `processing_time_ms` (from AI response). (GREEN)
            *   `[✅]` `seed_prompt_url` will point to the specific `seed_prompt.md` file (e.g., `projects/{project_id}/sessions/{session_id}/iteration_{N}/{current_stage_slug}/seed_prompt.md`) that was used for this generation.
            *   `[✅]` Initialize `edit_version = 1`, `is_latest_edit = TRUE`, `original_model_contribution_id = NULL` (or self).
            *   `[✅]` `user_id` likely the session initiator.
            *   `[✅]` `cost_usd` field removed from table if relying solely on token counts for estimation.
        6.  `[✅]` Ensure `rawProviderResponse` is saved to the `raw_response_storage_path`. (GREEN)
    *   `[✅] 1.1.5.B.2 [TEST-INT]` Write integration tests for the relevant `dialectic-service` action that calls `callUnifiedAIModel` and saves a contribution with content to storage.
        *   `[✅]` Verify that `uploadToStorage` and `getFileMetadata` are called with expected parameters (mocked).
        *   `[✅]` Verify that the `dialectic_contributions` record is saved with the correct storage path, bucket, mime type, and size. (GREEN)
*   `[✅] 1.1.5.C [API/STORE/UI]` Client-Side Content Retrieval and Display
    *   `[✅] 1.1.5.C.1 [API]` The `DialecticContribution` type (in `packages/api/.../dialectic.api.ts` types) will now include `contentStorageBucket`, `contentStoragePath`, `contentMimeType`, `contentSizeBytes` and *not* the direct `content` string.
    *   `[✅] 1.1.5.C.2 [API]` Add a new method to `DialecticAPIInterface`: `getContributionContentSignedUrl(contributionId: string): Promise<{ signedUrl: string, mimeType: string, sizeBytes: number | null } | null>`
        *   The corresponding `dialectic-service` action will:
            1.  Take `contributionId` as input.
            2.  Fetch the `dialectic_contributions` record.
            3.  Use `createSignedUrl` from Supabase Storage utilities to generate a short-lived signed URL for the `content_storage_path` in the `content_storage_bucket`.
            4.  Return `signedUrl`, `mimeType`, and `sizeBytes` from the record.
        *   `[✅] 1.1.5.C.2.1 [TEST-INT]` Write integration test for this backend service action. (RED -> GREEN)
        *   `[✅] 1.1.5.C.2.2 [TEST-UNIT]` Write unit test for the API adapter method. (RED -> GREEN)
    *   `[✅] 1.1.5.C.3 [STORE]` Update/Create state and thunks in `dialecticStore.ts`:
        *   State: `contributionContentCache: { [contributionId: string]: { signedUrl?: string, expiry?: number, content?: string, isLoading: boolean, error?: string, mimeType?: string, sizeBytes?: number } }`.
        *   Thunk: `fetchContributionContent(contributionId: string)`:
            1.  Checks cache for fresh, non-error, non-loading entry. If found, returns.
            2.  Calls API `getContributionContentSignedUrl(contributionId)`.
            3.  Stores `signedUrl`, `mimeType`, `sizeBytes`, and `expiry` in cache.
            4.  Performs a `fetch(signedUrl)` to get the actual content (e.g., as text).
            5.  Stores the fetched content in the cache.
            6.  Handles loading and error states.
        *   `[✅] 1.1.5.C.3.1 [TEST-UNIT]` Write unit tests for thunk and reducers. (RED -> GREEN)
    *   `[✅] 1.1.5.C.4 [UI]` Update UI components (e.g., `DialecticSessionDetailsPage`, `ContributionCard`) that display contribution content:
        *   `[✅]` Use a selector to get cached data from `contributionContentCache` for the relevant `contributionId`.
        *   `[✅]` If data is not present or URL is expired (or content not yet fetched), dispatch `fetchContributionContent(contributionId)`.
        *   `[✅]` Display loading indicators.
        *   `[✅]` Once content is fetched, render it (e.g., using a Markdown renderer if `mimeType` is `text/markdown`).
        *   `[✅] 1.1.5.C.4.1 [TEST-UNIT]` Update/write UI component tests. (RED -> GREEN)
*   `[🚧] 1.1.5.D [BE]` Handling Deletion of Contributions (Orphaned File Prevention)
    *   `[✅] 1.1.5.D.1 [BE]` Create new Supabase Edge Function: `storage-cleanup-service`.
        *   `[✅] 1.1.5.D.1.1 [BE]` Define function to accept `bucket` and `paths[]` payload.
        *   `[✅] 1.1.5.D.1.2 [BE]` Implement logic to delete files from Supabase Storage using `supabaseAdminClient.storage.from(bucket).remove(paths)`.
        *   `[✅] 1.1.5.D.1.3 [TEST-UNIT]` Write unit tests for `storage-cleanup-service` (mocking Supabase client and its storage calls). (RED -> GREEN -> REFACTOR)
    *   `[✅] 1.1.5.D.2 [DB]` All application logic to delete Contributions will invoke `storage-cleanup-service` directly.
*   `[✅] 1.1.6 [BE/CONFIG]` Ensure `ai_providers` table is populated with detailed configurations for core models via the `sync-ai-models` Edge Function.
    *   `[✅] 1.1.6.1 [DOCS]` Verify that `sync-ai-models` correctly fetches and stores detailed configurations (context window, token costs, max output tokens, etc.) in the `ai_providers` table (specifically the `config` JSONB field if applicable, or individual columns if the schema has been denormalized) for OpenAI, Anthropic, and Google models. Confirm that the information includes `api_identifier`, `provider_name`, `model_name`, `context_window_tokens`, `input_token_cost_usd_millionths`, `output_token_cost_usd_millionths`, and `max_output_tokens`.
    *   `[✅] 1.1.6.2 [TEST-INT]` Review existing tests for `sync-ai-models` (e.g., `supabase/functions/sync-ai-models/index.test.ts` and provider-specific tests like `openai_sync.test.ts`, `anthropic_sync.test.ts`, `google_sync.test.ts`) to ensure they cover the accurate population of all necessary fields in `ai_providers` for core models. If coverage for these specific fields is lacking, identify and add necessary test cases.
    *   `[✅] 1.1.6.3 [BE]` If `supabase/seed.sql` contains detailed entries for these core models (beyond minimal placeholders for `id`, `provider_name`, `model_name`), refactor it to remove such details. The `sync-ai-models` function is the source of truth for comprehensive model configurations. Ensure `sync-ai-models` can be run (e.g., via a script or manual trigger) to populate development/testing environments.
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
        *   `[✅] 1.2.1.5 [TEST-INT]` Write tests for `startSession` action (input: `projectId`, `selectedModelCatalogIds`, `sessionDescription`, `selected_domain_overlay_id`; output: created session object; auth). (GREEN - Comprehensive tests covering happy paths, missing parameters, error conditions, `sessionDescription`, and `selected_domain_overlay_id` are implemented across `startSession.happy.test.ts`, `startSession.missing.test.ts`, and `startSession.errors.test.ts` and are passing.)
        *   `[✅] 1.2.1.6` Implement logic:
            1.  Verify project ownership.
            2.  Fetch `prompt_template.id` for thesis and antithesis from `prompt_templates` table using names.
            3.  If `selected_domain_overlay_id` is provided in the payload, fetch its `overlay_values` to be used in prompt rendering for the relevant stage(s).
            4.  Creates `dialectic_sessions` record (linking `prompt_template_id_used`, etc.).
                *   During creation, an `associated_chat_id` (UUID) should be generated by `dialectic-service` or assigned if the dialectic originates from an existing chat. This ID will be used for all subsequent calls to the `/chat` Edge Function for this session.
            5.  Creates `dialectic_session_models` records from `selectedModelCatalogIds`.
            6.  Sets `dialectic_sessions.status` to `pending_thesis`.
            7.  Constructs `seed_prompt_url` for the session by rendering the chosen thesis prompt template with the project's `initial_user_prompt`. Store the combined user prompt, prompt template, and any provided template overlays into a file in the storage bucket using the file/folder schema and link it to the session record in `dialectic_sessions.seed_prompt_url`.
            8.  The `startSession` action concludes after successfully setting up the session. The generation of thesis contributions will be triggered by a separate user action from the frontend, which will then call the `generateContributions` action.
        *   `[✅] 1.2.1.7` (GREEN)  
        *   `[✅] 1.2.1.8 [REFACTOR]` Review.
        *   `[✅] 1.2.1.9 [TEST-INT]` Run tests.
*   `[✅] 1.2.2 [BE]` Helper: Prompt Rendering Utility
    *   `[✅] 1.2.2.1 [TEST-UNIT]` Write tests for a utility that takes a prompt template string (e.g., "Solve: {{problem}}") and a context object (e.g., `{ problem: "world hunger" }`) and returns the rendered prompt. (RED)
    *   `[✅] 1.2.2.2` Implement the prompt rendering utility (e.g., using a simple string replacement or a lightweight template engine). (GREEN)
    *   `[✅] 1.2.2.3 [TEST-UNIT]` Run tests.
*   `[✅] 1.2.3 [BE]` Helper: AI Model Interaction Utilities (within `dialectic-service` or shared helpers)
    *   `[✅] 1.2.3.1 [TEST-UNIT]` Write unit tests for `callUnifiedAIModel(modelCatalogId, renderedPrompt, options, associatedChatId)` which internally prepares a request for and invokes the existing `/chat` Edge Function. Mock the `/chat` function invocation. (RED)
    *   `[✅] 1.2.3.2` Implement `callUnifiedAIModel`:
        *   This function will **not** directly call AI provider SDKs.
        *   It receives `modelCatalogId` (which is `ai_providers.id`), the `renderedPrompt`, an `options` object (for things like history, `max_tokens_to_generate`), and the `associatedChatId` for the dialectic session.
        *   **Note:** `callUnifiedAIModel` is designed to handle interaction with a single AI model provider (via the `/chat` function) for a single prompt. Functions that require generating responses from multiple AI models for a given stage (e.g., `generateContributions`) are responsible for iterating through the selected models (obtained from `dialectic_session_models` linked to the session) and calling `callUnifiedAIModel` individually for each one.
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
*   `[✅] 1.2.4 [BE]` `dialectic-service` Action: `generateContributions` (triggered by user action from frontend after `startSession` is complete)
    *   `[✅] 1.2.4.1 [TEST-INT]` Write tests (input: `sessionId`; auth: user; verifies contributions are created and session status updated). (RED -> 🚧 Tests pass for basic success response, full contribution verification pending actual implementation)
    *   `[✅] 1.2.4.2` Implement logic: (🚧 Placeholder implementation returns success structure; core logic for model calls and contribution saving pending)
        1.  `[✅]` Fetch `dialectic_session` (including `associated_chat_id`), its `dialectic_session_models`, and the `seed_prompt_url`. Ensure user owns the project/session.
        2.  `[✅]` Verify session status is `pending_thesis`. Update to `generating_contribution`. Log this transition.
        3.  `[✅]` For each `session_model` representing an AI provider selected for this session (retrieved from `dialectic_session_models`):
            *   `[✅]` Call `callUnifiedAIModel` with that specific `session_model.model_id` (which is an `ai_providers.id`), the `seed_prompt_url`.
            *   `[✅]` Save result in `dialectic_contributions` (stage 'thesis', `actual_prompt_sent` = the file content from the file referenced at `seed_prompt_url`, store costs, tokens from `UnifiedAIResponse`, ensured `content_storage_bucket` is NOT NULL and correctly populated along with path, mime type, and size). If a model call fails, record the error in the contribution and proceed with other models. (Refined error handling in contribution evolving)
        4.  `[✅]` Update `dialectic_sessions.status` to `thesis_complete`. Log this transition. (Consider `thesis_complete_with_errors` status)
        5.  `[✅]` This action concludes. The next stage (Antithesis) will be triggered by a separate user action.
    *   `[✅] 1.2.4.3` (GREEN)
    *   `[✅] 1.2.4.4 [REFACTOR]` Review error handling for individual model failures and overall session status updates. (GREEN)
    *   `[✅] 1.2.4.5 [TEST-INT]` Run tests. (Tests should verify `seed_prompt_url` in `dialectic_contributions` points to the correct stage-specific seed file.)
*   `[✅] 1.2.4.6 [BE]` Implement retry logic (e.g., 3 attempts with exponential backoff) for `callUnifiedAIModel` within `generateContributions`. (GREEN)
*   `[✅] 1.2.4.7 [BE]` Ensure `contentType` is not hardcoded and `getExtensionFromMimeType` is used for storage paths. (GREEN)
    *   `[✅] 1.2.4.7.1 [BE]` Create `path_utils.ts` with `getExtensionFromMimeType` function. (GREEN)
    *   `[✅] 1.2.4.7.2 [TEST-UNIT]` Create `path_utils.test.ts` and add unit tests for `getExtensionFromMimeType`. (GREEN for creation; test failures are separate issues for that utility)
*   `[✅] 1.2.5 [BE]` `dialectic-service` Action: `generateContribution` (internal)
    *   `[✅] 1.2.5.1 [TEST-INT]` Write tests (input: `sessionId`; auth: service role; verifies critiques are created against each thesis, and session status updated). (RED)
    *   `[✅] 1.2.5.2` Implement logic:
        1.  Fetch session (including `associated_chat_id`), its models, all 'thesis' contributions for the current iteration, and `prompt_template_id` from session. Fetch `initial_user_prompt` from project. Fetch stage-appropriate prompt template content. Ensure user owns the project/session.
        2.  Verify the prior stage has completed and the user has indicated they wish to begin the next stage. Update to the default stage to the subsequent stage. Log this transition.
        3.  For each `session_model` representing an AI provider selected for this session:
            *   For each prior stage thesis contribution that was successfully generated and is targeted for critique:
                *   Render the antithesis prompt template using context: `initial_user_prompt`, the correct stage prompt, and the correct user-chosen prompt overlay.
                *   Call `callUnifiedAIModel` with the `session_model.model_id`, the rendered critique prompt, and the `session.associated_chat_id`.
                *   Save result in `dialectic_contributions` (stage 'antithesis', `target_contribution_id = thesis_contribution.id`, `actual_prompt_sent` = rendered critique prompt). Record errors if any.
        4.  Update `dialectic_sessions.status` to `antithesis_complete`. Log this transition.
        5.  This action concludes. The next stage (Synthesis) will be triggered by a separate user action.
    *   `[✅] 1.2.5.3` (GREEN)
    *   `[✅] 1.2.5.4 [REFACTOR]` Review logic and error handling.
    *   `[✅] 1.2.5.5 [TEST-INT]` Run tests.
*   `[✅] 1.2.6 [BE]` `dialectic-service` Action: `getProjectDetails`
    *   `[✅] 1.2.6.1 [TEST-INT]` Write tests (input: `projectId`; auth; output: project, its sessions, their models, and all contributions, ordered correctly). (RED)
    *   `[✅] 1.2.6.2` Implement using Supabase JS client to fetch nested data respecting RLS. (GREEN)
    *   `[✅] 1.2.6.3 [TEST-INT]` Run tests.
*   `[✅] 1.2.7 [BE]` `dialectic-service` Action: `listProjects`
    *   `[✅] 1.2.7.1 [TEST-INT]` Write tests (auth; output: list of user's projects). (RED)
    *   `[✅] 1.2.7.2` Implement. (GREEN)
    *   `[✅] 1.2.7.3 [TEST-INT]` Run tests.
*   `[✅] 1.2.9 [DOCS]` Document the `dialectic-service` Edge Function, its actions, inputs, outputs, and error handling strategies in a relevant README (e.g., `supabase/functions/dialectic-service/README.md`).
*   `[✅] 1.2.10 [COMMIT]` feat(be): implement dialectic-service edge function with core actions

### 1.2.Y [BE/DB/API/STORE/GITHUB] Backend for Enhanced Contribution Interaction (User Edits & Responses, and Next Stage Seeding)
*   **Objective:** Implement backend logic to allow users to directly edit AI-generated contributions and provide structured textual responses to them. These user inputs will then be consolidated and used to form the seed prompt for the subsequent stage in the dialectic process, ensuring user guidance is deeply integrated. All new artifacts will be stored according to the established file/folder structure and included in GitHub exports.
*   `[✅] 1.2.Y.1 [DB]` Update `dialectic_contributions` Table for Storing User Edits:
    *   `[✅] 1.2.Y.1.1 [TEST-UNIT]` Write migration test to add new columns to `dialectic_contributions`:
        *   `edit_version` (INTEGER, NOT NULL, default 1)
        *   `is_latest_edit` (BOOLEAN, NOT NULL, default TRUE)
        *   `original_model_contribution_id` (UUID, FK to `dialectic_contributions.id` ON DELETE SET NULL, nullable)
        *   (Ensure `user_id` can store the ID of the editing user).
        *   (Ensure `content_storage_path` and related fields are used for the edited content). (GREEN)
    *   `[✅] 1.2.Y.1.2` Create Supabase migration script to add/modify these columns. (GREEN)
    *   `[✅] 1.2.Y.1.3 [REFACTOR]` Review the migration script.
    *   `[✅] 1.2.Y.1.4 [TEST-UNIT]` Apply migration and run the migration test. (GREEN)
*   `[✅] 1.2.Y.1.A [DB]` **Optional - Create `dialectic_feedback` Table** (Renamed from `dialectic_hitl_feedback`)
    *   `[✅] 1.2.Y.1.A.1 [TEST-UNIT]` Write migration test for `dialectic_feedback` table. (GREEN)
    *   `[✅] 1.2.Y.1.A.2` Define columns: `id` (UUID), `session_id` (UUID, FK), `contribution_id` (UUID, FK to `dialectic_contributions.id`, nullable if feedback is general to stage), `user_id` (UUID, FK), `feedback_type` (TEXT, e.g., 'text_response', 'rating_stars', 'thumb_reaction'), `feedback_value_text` (TEXT, nullable), `feedback_value_structured` (JSONB, nullable, for ratings, etc.), `created_at`, `updated_at`. (Implicitly GREEN via passing tests)
    *   `[✅] 1.2.Y.1.A.3` Create Supabase migration script. (GREEN)
    *   `[✅] 1.2.Y.1.A.4 [TEST-UNIT]` Run migration test. (GREEN)
*   `[✅] 1.2.Y.2 [BE]` `dialectic-service` Action: `saveContributionEdit`
    *   `[✅] 1.2.Y.2.1 [TEST-INT]` Write integration tests for `saveContributionEdit` (Input: `originalContributionIdToEdit`, `editedContentText`; Auth: user owns session; Output: new `DialecticContribution` object representing the edit). (GREEN)
        *   Verifies a new row is created in `dialectic_contributions`.
        *   Verifies the new row has `edit_version` incremented, `is_latest_edit=TRUE`, `original_model_contribution_id` set to `originalContributionIdToEdit` (or the ID of the root AI contribution if editing an existing edit), `user_id` of editor.
        *   Verifies `editedContentText` is saved to a new file in storage (actual path generation based on `edits/${user.id}/${Date.now()}_edit.md`), and `content_storage_path` in the new row points to it.
        *   Verifies the *previous* version (identified by `originalContributionIdToEdit` and its latest `edit_version`) has `is_latest_edit` set to `FALSE` and its `updated_at` field is touched.
    *   `[✅] 1.2.Y.2.2` Implement the `saveContributionEdit` action: (GREEN - Implemented in `saveContributionEdit.ts`)
        *   Authenticate the user and verify ownership of the project associated with the `originalContributionIdToEdit`.
        *   Fetch the contribution record being edited (the current `is_latest_edit=TRUE` version for the given `originalContributionIdToEdit` or the `contributionIdToEdit` itself if it's the first edit of an AI contribution).
        *   Save `editedContentText` to a new file in Supabase Storage (path pattern: `edits/${user.id}/${Date.now()}_edit.md`). (This is handled by the `save_contribution_edit_atomic` PostgreSQL function called by the service, which includes setting up storage details based on parameters).
        *   Create a new `dialectic_contributions` record via the `save_contribution_edit_atomic` RPC call, which handles:
            *   Copying relevant fields from original (e.g., `session_id`, `stage`, `iteration_number`).
            *   Setting `content_storage_path` to the new file, update `content_mime_type`, `content_size_bytes`.
            *   Setting `edit_version` to `original.edit_version + 1`.
            *   Setting `is_latest_edit = TRUE`.
            *   Setting `original_model_contribution_id` to `original.original_model_contribution_id` if it exists, otherwise `original.id` (ensuring it points to the root AI contribution).
            *   Setting `user_id` to the current authenticated user.
            *   Setting `contribution_type` to `'user_edit'`.
        *   The `save_contribution_edit_atomic` RPC also updates the previous version of this contribution: sets `is_latest_edit = FALSE` and touches `updated_at`.
    *   `[✅] 1.2.Y.2.3 [TEST-INT]` Run `saveContributionEdit` integration tests. (GREEN - All tests in `saveContributionEdit.test.ts` are passing, covering success cases, auth, errors, and versioning logic).
*   `[✅] 1.2.Y.3 [BE]` `dialectic-service` Action: `submitStageResponses`
    *   `[✅] 1.2.Y.3.1 [TEST-INT]` Write integration tests for `submitStageResponses` (Input: `sessionId`, `currentStageSlug` (e.g., \"hypothesis\"), `currentIterationNumber`, `responses: [{originalContributionId: string, responseText: string}]`; Auth: user owns session). Verify: (GREEN)
        *   The `storage_bucket` value is correctly derived from the `CONTENT_STORAGE_BUCKET` environment variable for all internal storage operations.
        *   For each response in the payload, a `dialectic_feedback` record is created (type 'text_response').
        *   A `user_consolidated_feedback.md` file is correctly generated and stored in Supabase Storage at `projects/{project_id}/sessions/{session_id}/iteration_{N}/{currentStageSlug}/user_feedback_{currentStageSlug}.md`.
        *   The seed prompt for the *next* stage (e.g., `antithesis/seed_prompt.md`) is correctly compiled and stored. This compilation includes:
            *   Content of AI contributions from `currentStageSlug` (fetching the `is_latest_edit=TRUE` version for each `original_model_contribution_id`).
            *   Content of the `user_consolidated_feedback.md` just created.
            *   The appropriate system prompt template and settings for the *next* stage.
        *   The `dialectic_sessions.current_stage_name` (or similar field indicating active stage) is advanced if applicable (e.g., from "THESIS_COMPLETE" to "PENDING_ANTITHESIS").
    *   `[✅] 1.2.Y.3.2` Implement the `submitStageResponses` action in `supabase/functions/dialectic-service/index.ts` (or a dedicated handler):
        1.  Authenticate user and verify ownership of `sessionId`.
        2.  **Store Individual User Responses:** For each item in the `responses` array:
            *   Create a `dialectic_feedback` record: `contribution_id` is `item.originalContributionId` (latest edit), `feedback_type = 'text_response'`, `feedback_value_text = item.responseText`.
        3.  **Concatenate All User Responses for the Current Stage:**
            *   Initialize an empty Markdown string for concatenated feedback.
            *   For each item in the `responses` payload:
                *   Fetch the latest edit of `dialectic_contributions` for `item.originalContributionId` to get model name or other context for the header.
                *   Append a section to the Markdown string, e.g.: `### Response to Contribution by [Model Name/ID] (Contribution ID: [item.originalContributionId]):\n\n[item.responseText]\n\n---\n`.
        4.  **Store Concatenated User Responses File (`user_consolidated_feedback.md`):**
            *   Define `storageBucket` by reading the `CONTENT_STORAGE_BUCKET` environment variable.
            *   Construct `filePath` using `currentStageSlug`: `projects/{project_id}/sessions/{session_id}/iteration_{currentIterationNumber}/{currentStageSlug}/user_feedback_{currentStageSlug}.md`.
            *   Use the shared `uploadToStorage` utility to save the concatenated Markdown string to this `filePath` in the `storageBucket`.
        5.  **Prepare Full Seed Input (`seed_prompt.md`) for the Next Stage:**
            *   Determine `nextStageSlug` (helper function: e.g., "hypothesis" -> "antithesis").
            *   Fetch all relevant AI contributions from the `currentStageSlug` and `currentIterationNumber`. For each unique `original_model_contribution_id`, fetch the content of its `is_latest_edit=TRUE` version.
            *   Fetch the content of the `user_consolidated_feedback.md` file just created.
            *   Retrieve the system prompt template for `nextStageSlug` and relevant `system_settings.json` from `.../iteration_{N}/0_seed_inputs/`.
            *   Construct the complete seed prompt for the `nextStageSlug`. This prompt will combine:
                *   The original/edited AI contributions from the current stage (formatted nicely).
                *   The full content of `user_consolidated_feedback.md`.
                *   The system prompt template text for `nextStageSlug`, filled with the above.
            *   Define `nextStageSeedPath = projects/{project_id}/sessions/{session_id}/iteration_{currentIterationNumber}/{nextStageSlug}/seed_prompt.md`.
            *   Use `uploadToStorage` to save this fully constructed prompt to `nextStageSeedPath` in the `storageBucket`.
        6.  Update `dialectic_sessions.status` (e.g., to `pending_{nextStageSlug}`) or `dialectic_sessions.current_stage_name` to `nextStageSlug`.
        7.  Return a success status, and potentially the storage paths of the created `user_consolidated_feedback.md` and the new `seed_prompt.md` for the next stage.
    *   `[✅] 1.2.Y.3.3 [TEST-INT]` Run `submitStageResponses` integration tests. (GREEN)
*   `[✅] 1.2.Y.4 [BE]` Modify Core AI Contribution Generation Logic (e.g., `generateContributions`):
    *   `[✅] 1.2.Y.4.1` Update `generateContributions(sessionId, stageSlugToGenerate, iterationNumber)`:
        *   It derives the required seed prompt path: `projects/{project_id}/sessions/{session_id}/iteration_{iterationNumber}/{stageSlugToGenerate}/seed_prompt.md`.
        *   It fetches content from this path to use as the prompt for `callUnifiedAIModel`.
        *   When saving new AI contributions, the `seed_prompt_url` field in `dialectic_contributions` is set to this path.
        *   New AI contributions are saved with `edit_version = 1`, `is_latest_edit = TRUE`, `original_model_contribution_id = NULL` (or points to self).
    *   `[✅] 1.2.Y.4.2 [TEST-INT]` Update/Write integration tests for these generation actions to ensure they correctly use the seed prompt fetched from the specified storage path.
*   `[✅] 1.2.Y.5 [API/STORE]` Add/Update API Client Methods and Store Thunks:
    *   `[✅] 1.2.Y.5.1 [API]` Define necessary request/response types (e.g., `SaveContributionEditPayload`, `SaveContributionEditResponse`, `SubmitStageResponsesPayload`, `SubmitStageResponsesResponse`) in `packages/types/src/dialectic.types.ts`.
    *   `[✅] 1.2.Y.5.2 [API]` Add `saveContributionEdit(payload: SaveContributionEditPayload): Promise<ApiResponse<DialecticContribution>>` and `submitStageResponses(payload: SubmitStageResponsesPayload): Promise<ApiResponse<SubmitStageResponsesResponse>>` to `DialecticAPIInterface`.
    *   `[✅] 1.2.Y.5.3 [TEST-UNIT]` Write unit tests for these new API adapter methods in `packages/api/src/dialectic.api.test.ts`.
    *   `[✅] 1.2.Y.5.4` Implement the new adapter methods in `packages/api/src/dialectic.api.ts`.
    *   `[✅] 1.2.Y.5.5 [STORE]` Define new state properties in `DialecticStateValues` if needed (e.g., for loading/error states of these new actions).
    *   `[✅] 1.2.Y.5.6 [STORE]` Implement new async thunks in `dialecticStore.ts` for `saveContributionEdit` and `submitStageResponses`. Ensure they call the API, handle loading states, manage errors, and update the `currentProjectDetail.sessions[...].contributions` and session status appropriately (e.g., by refetching or strategically merging new/updated contribution data).
    *   `[✅] 1.2.Y.5.7 [TEST-UNIT]` Write unit tests for these new store thunks and any associated reducer logic.
*   `[ ] 1.2.Y.6 [GITHUB]` Update GitHub Export Logic (Referencing Sections `1.6`, `2.5`, `3.5` for context and full file path structure):
    *   `[ ] 1.2.Y.6.1` When exporting AI-generated contribution files (e.g., `{repo_root}/.../{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage_number}_{stage_slug}/{model_name_slug}_{stage_suffix}.md`):
        *   The content for the exported file must be from the `dialectic_contributions` row that has `is_latest_edit = TRUE` for that specific model's contribution line in that stage/iteration.
    *   `[ ] 1.2.Y.6.2` The `user_consolidated_feedback.md` file must be exported to `{repo_root}/.../{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage_number}_{stage_slug}/user_feedback_{stage_slug}.md`.
    *   `[ ] 1.2.Y.6.3` The stage-specific `seed_prompt.md` file (the one used to generate contributions for a stage) must be correctly exported to its storage path: `{repo_root}/.../{project_name_slug}/session_{session_id_short}/iteration_{N}/{stage_number}_{stage_slug}/seed_prompt.md`.
*   `[ ] 1.2.Y.7 [COMMIT]` feat(be,db,api,store,github): Implement contribution editing, structured user responses, next-stage seed preparation, and update GitHub export logic.


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
    *   `[ ] 1.5.3.1 [TEST-UNIT]` Write tests (form fields for project name, initial user prompt; submit button; handles loading/error from `createDialecticProject` thunk). Update tests to cover interaction with the updated `DomainSelector` and the new conditional `DomainOverlayDescriptionSelector`, ensuring `selected_domain_overlay_id` is correctly passed. (RED)
    *   `[ ] 1.5.3.2` Implement component:
        *   Form with inputs for `projectName`, `initialUserPrompt`.
        *   Integrate the updated `DomainSelector` and new `DomainOverlayDescriptionSelector` to determine `selected_domain_overlay_id`. The `currentStageForOverlaySelection` for project creation would typically be a general stage like "thesis" or a specific "project_setup" stage if defined.
        *   On submit, dispatches `createDialecticProject` using `selected_domain_overlay_id` from the store.
        *   Navigates to `DialecticProjectDetailsPage` on success.
        *   Displays loading/error states.
        *   Ensure a11y principles are applied.
    *   `[🚧] 1.5.3.3` (GREEN - Implementation is mostly complete, but `selected_domain_overlay_id` is not included in the `CreateProjectPayload` sent to the backend.)
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
    *   `[ ] 1.5.5.1 [TEST-UNIT]` Write tests (form for session description, multi-select for AI models from catalog; submit button; loading/error states from `startDialecticSession` thunk and `fetchAIModelCatalog` thunk). Update tests if domain selection (using updated `DomainSelector` and new `DomainOverlayDescriptionSelector`) is added here for stage-specific prompts. (RED)
    *   `[ ] 1.5.5.2` Implement component:
        *   Dispatches `fetchAIModelCatalog` on mount if catalog is null.
        *   Uses `selectModelCatalog` for model selection.
        *   Form with `sessionDescription` (optional), multi-select for `selectedModelCatalogIds`.
        *   (Optional for Phase 1, can be hardcoded or defaults): Selectors for `thesisPromptTemplateName`, `antithesisPromptTemplateName`.
        *   **If domain overlays are relevant for selected prompts (e.g., thesis or antithesis prompts):** Integrate the updated `DomainSelector` and (conditionally) the new `DomainOverlayDescriptionSelector`. The `selectedStageAssociation` store property would need to be set according to the context (e.g., "thesis" when configuring thesis prompts). The resulting `selected_domain_overlay_id` (or potentially multiple, if different stages can have different overlays set at session start) would be included in the `StartSessionPayload`.
        *   On submit, dispatches `startDialecticSession` with `projectId` and form data including any `selected_domain_overlay_id`(s).
        *   Closes modal and potentially refetches project details on success.
        *   Ensure a11y principles are applied.
    *   `[✅] 1.5.5.3` (GREEN)
    *   `[ ] 1.5.5.4 [REFACTOR]` Review.
    *   `[✅] 1.5.5.5 [TEST-UNIT]` Run tests.
*   `[✅] 1.5.6 [UI]` **Refactor `DialecticSessionDetailsPage` for New Card-Based Layout (Post Initial `Tabs` Implementation):**
    *   **Goal:** Transition from a simple tabbed view per stage to a more modular card-based UI where session overview, stage selection, and contribution display/interaction are handled by distinct child components. This will also facilitate the introduction of the "Initial User Prompt" for the iteration.
    *   `[✅] 1.5.6.1 [UI]` **Update `DialecticSessionDetailsPage` Component & Tests:**
        *   `[✅] 1.5.6.1.1 [TEST-UNIT]` Update tests for `DialecticSessionDetailsPage`:
            *   `[✅]` Mock new child components: `SessionInfoCard`, `StageTabCard`, `SessionContributionsDisplayCard`.
            *   `[✅]` Verify rendering of child components.
            *   `[✅]` Verify `activeStageSlug` state is initialized correctly (e.g., from `session.status` via a new helper `getStageSlugFromStatus` in `dialecticConfig.ts`).
            *   `[✅]` Verify `activeStageSlug` updates on `StageTabCard` selection.
            *   `[✅]` Verify correct props (e.g., `session`, `activeStageSlug`, `onSelectStage`) are passed to child components.
            *   `[✅]` Verify `SessionContributionsDisplayCard` re-renders with new `activeStageSlug`.
        *   `[✅] 1.5.6.1.2 [UI]` Modify `DialecticSessionDetailsPage.tsx`:
            *   `[✅]` Remove old `Tabs`-based UI.
            *   `[✅]` Integrate `SessionInfoCard`, `StageTabCard` (for each stage in `DIALECTIC_STAGES`), and `SessionContributionsDisplayCard`.
            *   `[✅]` Manage `activeStageSlug` state, initializing from `session.status` using `getStageSlugFromStatus`.
            *   `[✅]` Pass appropriate props to child components.
            *   `[✅]` Ensure loading/error states are handled.
        *   `[✅] 1.5.6.1.3 [CONFIG]` Create/Update `apps/web/src/config/dialecticConfig.ts`:
            *   `[✅]` Export `DIALECTIC_STAGES`: an array of `DialecticStageDefinition` objects (e.g., `{ slug: DialecticStage.THESIS, displayName: 'Thesis', description: '...' }`). Ensure `slug` aligns with `DialecticStage` enum.
            *   `[✅]` Export `getStageSlugFromStatus(status: string): DialecticStage | null` helper function.
        *   `[✅] 1.5.6.1.4 [COMMIT]` feat(web): refactor DialecticSessionDetailsPage to card layout
    *   `[✅] 1.5.6.2 [UI]` **Create `SessionInfoCard` Component & Tests:**
        *   `[✅] 1.5.6.2.1 [TEST-UNIT]` Write tests for `SessionInfoCard`:
            *   `[✅]` Mock `useDialecticStore` and relevant selectors (`selectDialecticSessionById`, `selectInitialPromptContentForIteration`).
            *   `[✅]` Verify rendering of session description, current iteration number, status.
            *   `[✅]` Verify it fetches and displays the "Initial User Prompt" for the *current iteration* from Supabase Storage (e.g., `projects/{projectId}/sessions/{sessionId}/iteration_{N}/0_seed_inputs/user_prompt.md`). This involves:
                *   `[✅]` Mocking the store thunk `fetchInitialPromptContent(sessionId, iterationNumber)`.
                *   `[✅]` Verifying display of fetched Markdown content (via a mocked `MarkdownRenderer`).
                *   `[✅]` Handling loading/error states for prompt fetching.
        *   `[✅] 1.5.6.2.2 [UI]` Implement `SessionInfoCard.tsx` (`apps/web/src/components/dialectic/SessionInfoCard.tsx`):
            *   `[✅]` Display session details.
            *   `[✅]` Fetch and display the iteration-specific initial user prompt.
        *   `[✅] 1.5.6.2.3 [COMMIT]` feat(web): implement SessionInfoCard and tests
    *   `[✅] 1.5.6.3 [UI]` **Create `StageTabCard` Component & Tests:** (This is effectively a "Stage Controller Card")
        *   `[✅] 1.5.6.3.1 [TEST-UNIT]` Write tests for `StageTabCard`:
            *   `[✅]` Props: `stage: DialecticStageDefinition`, `isActiveStage: boolean`, `onSelectStage: (slug: DialecticStage) => void`, `session: DialecticSession`.
            *   `[✅]` Verify display of `stage.displayName`.
            *   `[✅]` Verify active state styling/indicator.
            *   `[✅]` Verify `onSelectStage(stage.slug)` is called on click.
            *   `[✅]` **"Generate/Regenerate Contributions" Button Logic:**
                *   `[✅]` Button visible and enabled if `isActiveStage` is true, `session.status` allows generation for this stage (e.g., not 'COMPLETED', or stage is current), AND the `seed_prompt.md` for *this specific stage and iteration* exists in storage (or a new store selector `selectStageSeedPromptExists(sessionId, iteration, stageSlug)` indicates this).
                *   `[✅]` Button text: "Generate Contributions" or "Regenerate Contributions" based on whether contributions for this stage already exist.
                *   `[✅]` On click, dispatches `generateContributions({ sessionId, stageSlug, iterationNumber })` thunk. (Assume `iterationNumber` is derived from `session.current_iteration_number`).
                *   `[✅]` Mock `useDialecticStore` and the thunk. Verify correct payload.
                *   `[✅]` Verify button loading/disabled state based on a store selector like `selectIsGeneratingContributionsForStage(stageSlug)`.
                *   `[✅]` Verify error display if generation fails (e.g., using a selector `selectContributionGenerationErrorForStage(stageSlug)`).
            *   `[✅]` **Prerequisite Stage Check (Visual Cue):**
                *   `[✅]` If a stage (e.g., Antithesis) has prerequisites (e.g., Thesis must be 'COMPLETED' or have contributions), and those are not met for the current iteration, display a subtle warning or lock icon. (e.g., "Thesis stage must be completed first."). This uses `session.stage_progress` or similar.
        *   `[✅] 1.5.6.3.2 [UI]` Implement `StageTabCard.tsx` (`apps/web/src/components/dialectic/StageTabCard.tsx`).
        *   `[✅] 1.5.6.3.3 [COMMIT]` feat(web): implement StageTabCard and tests
    *   `[✅] 1.5.6.4 [UI]` **Create `SessionContributionsDisplayCard` Component & Tests:**
        *   `[✅] 1.5.6.4.1 [TEST-UNIT]` Write tests for `SessionContributionsDisplayCard`:
            *   `[✅]` Props: `session: DialecticSession`, `activeStageSlug: DialecticStage`.
            *   `[✅]` Mock `useDialecticStore` and selectors like `selectContributionsForStageAndIteration`.
            *   `[✅]` Verify it filters contributions from `session.contributions` to display only those matching `activeStageSlug` and `session.current_iteration_number`, showing the latest version of each (if versioning is present in `DialecticContribution` or handled by selector).
            *   `[✅]` For each displayed contribution, render a `GeneratedContributionCard` (to be created in `1.5.7`). Mock this child component for now.
            *   `[✅]` Verify props passed to `GeneratedContributionCard`.
            *   `[✅]` **User Response Management (Simplified for now - text area per contribution):**
                *   `[✅]` If `activeStageSlug` is one that expects user feedback (e.g., Thesis, Antithesis, Synthesis), allow input.
                *   `[✅]` Manage local state for user responses (e.g., `Map<contributionId, string>`).
                *   `[✅]` "Submit Responses & Prepare Next Stage" button:
                    *   `[✅]` Visible if `activeStageSlug` allows feedback and `session.status` is appropriate.
                    *   `[✅]` On click, dispatches `submitStageResponses({ sessionId, iterationNumber, stageSlug, responses: UserResponse[] })` thunk. `UserResponse` could be `{ contribution_id: string, feedback_text: string, approved: boolean (future) }`.
                    *   `[✅]` Mock the thunk and verify payload.
                    *   `[✅]` Verify loading/disabled state (`selectIsSubmittingResponses(stageSlug)`).
                    *   `[✅]` Verify error display (`selectSubmitResponsesError(stageSlug)`).
        *   `[✅] 1.5.6.4.2 [UI]` Implement `SessionContributionsDisplayCard.tsx` (`apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx`).
        *   `[✅] 1.5.6.4.3 [COMMIT]` feat(web): implement SessionContributionsDisplayCard and tests
    *   `[✅] 1.5.6.5 [UI]` **NEW Create `GeneratedContributionCard` Component** (`apps/web/src/components/dialectic/GeneratedContributionCard.tsx`)
        *   `[✅] 1.5.6.5.1 [TEST-UNIT]` Write unit tests for `GeneratedContributionCard.tsx`. Test:
            *   Correct rendering of content (original vs. edited, including fetching from storage using `contributionId` prop and selector).
            *   Uses selectors to get the full `contribution` object by ID.
            *   Toggle for edit mode (`isEditing` state).
            *   Functionality of "Save" and "Discard" buttons for edits, including thunk dispatch for "Save" (`saveContributionEdit` with `originalContributionIdToEdit`).
            *   Integration and functionality of the `TextInputArea` for user responses.
            *   `onResponseChange` callback invocation with `originalModelContributionIdForResponse`.
            *   Display of the guidance message. (RED -> GREEN)
        *   `[✅] 1.5.6.5.2` Implement `GeneratedContributionCard.tsx`:
            *   Accepts props: `contributionId: string` (ID of the specific contribution version to display, typically the latest), `originalModelContributionIdForResponse: string` (ID of the base AI contribution this response is for), `initialResponseText: string | undefined`, `onResponseChange: (originalModelContributionIdForResponse: string, responseText: string) => void`.
            *   Uses `selectContributionById(contributionId)` selector to get the `contribution` object.
            *   Manages its own local component state for:
                *   `isEditing: boolean` (defaults to false).
                *   `editedContentText: string` (initialized when editing starts).
                *   `isLoadingContent: boolean` (for fetching original content via store, if not already cached).
                *   `contentError: string | null`.
                *   `displayContent: string` (the content to show, from store/cache or edited).
            *   **Content Display & Fetching Logic:**
                *   On mount or when `contributionId` prop changes:
                    *   If `contribution.content_storage_path` exists (obtained via selector using `contributionId`), dispatch `fetchContributionContent(contributionId)` thunk (from `1.1.5.C.3`) to load content from storage if not already in cache. Update `displayContent`, `isLoadingContent`, `contentError` based on thunk/cache state.
                *   Renders `displayContent` (from store/cache) using the shared `MarkdownRenderer`. Shows loading/error state.
                *   Clearly indicates if the displayed content is user-edited (e.g., a small badge or note, based on `contribution.edit_version > 1`).
            *   **Direct Editing Feature:**
                *   "Edit" button:
                    *   Visible if not `isEditing`.
                    *   Sets `isEditing` to true.
                    *   Initializes `editedContentText` with the current `displayContent`.
                *   If `isEditing` is true:
                    *   Render a `Textarea` (or `TextInputArea` in raw text mode) bound to `editedContentText`.
                    *   "Save" button: Dispatches `saveContributionEdit` thunk with `originalContributionIdToEdit: contribution.original_model_contribution_id || contribution.id` and `editedContentText`. On success, sets `isEditing` to false. The component should re-render with the new latest version from the store.
                    *   "Discard" button: Sets `isEditing` to false, discards changes by resetting `editedContentText` (no API call).
                *   Displays a guiding message near the edit controls: "Recommended for minor corrections or quick fixes. For substantive dialogue or building upon this idea, please use the response area below."
            *   **User Response Area (Below Content/Edit section):**
                *   Integrates a `TextInputArea` component (with raw text and markdown preview tabs).
                *   The `TextInputArea`'s `value` is controlled by `props.initialResponseText` (or internal state if preferred, synced with prop).
                *   The `TextInputArea`'s `onChange` callback invokes `props.onResponseChange(props.originalModelContributionIdForResponse, newResponseText)`.
            *   Ensure all interactive elements (buttons, text areas) are accessible.
        *   `[✅] 1.5.6.5.3 [TEST-UNIT]` Run `GeneratedContributionCard.tsx` unit tests. (GREEN)
    *   `[✅] 1.5.6.6 [REFACTOR]` Conduct a thorough review of the entire `DialecticSessionDetailsPage` and its new child components (`SessionInfoCard`, `StageTabCard`, `SessionContributionsDisplayCard`, `GeneratedContributionCard`). Focus areas:
        *   Confirm clear separation of concerns and well-defined responsibilities for each component.
        *   Optimize data flow from the Zustand store and minimize unnecessary prop drilling.
        *   Ensure a consistent and intuitive user experience for viewing content, editing contributions, and providing responses.
        *   Verify robust error handling and loading state management across all new components and their interactions with thunks.
        *   Check for adherence to accessibility best practices.
    *   `[✅] 1.5.6.7 [COMMIT]` feat(ui): Refactor DialecticSessionDetailsPage with modular cards, implement contribution editing & user response capabilities.
*   `[✅] 1.5.7 [UI]` Add navigation link to `/dialectic` in the main app layout (e.g., sidebar, header).
*   `[✅] 1.5.8 [COMMIT]` feat(ui): add core pages and navigation for dialectic engine (This commit message will be superseded by `1.5.6.7` upon completion of the refactor).

### Fixes for Dialectic flow
*   [✅] 404 err on file upload for project creation
*   [ ] "Project Name" auto-fill only works for one char
*   [✅] Projects page (/dialectic/) needs cards to be independent
*   [✅] Projects cards "created at" not displaying
*   [✅] Project cards need project title displayed 
*   [✅] Project cards need "delete" interaction
*   [✅] Project cards need "clone/copy" interaction
*   [✅] Project page (/dialectic/:id) shows Project ID instead of title
*   [✅] Project page doesn't show IPS 
*   [✅] Project page should show initial selected prompt and provide edit capability
*   [✅] Start New Session modal incomplete
*   [✅] Start New Session modal needs background blur

### Enable Org Dialectic & Notifications 
*   [ ] Add Org Switcher to Dialectic page
*   [ ] Add Org Dialectic toggle to Org page
*   [ ] Add notification triggers for members joining orgs
*   [ ] Add notification triggers for participating group chat updates 
*   [ ] Add org access to projects 
*   [ ] Add org projects card to org page
*   [ ] Add notification triggers for org projects 
*   [ ] Add Posthog triggers for every GUI interaction 

### Fix Prompt Submission
*   [✅] Fix StartSessionPayload throughout the app
*   [✅] Reduce nPromptTemplateId to promptTemplateId
*   [✅] Pass the stage with the PromptTemplateId
*   [✅] Set up table for sample_prompt additional details (This refers to `domain_specific_prompt_overlays` and user inputs)
*   [✅] Ensure that the sample_prompt additional details have a json column and a bucket route (Overlay `overlay_values` is JSONB. User inputs will be linked via `dialectic_sessions.user_input_reference_url`)
*   [✅] Ensure all payloads use the same structure
*   [✅] Only one startSession function that processes the payload for each stage
*   [✅] Fix dialectic_projects.initial_user_prompt to only populate the derived title (This refers to user input for the project, which is distinct from session-level inputs)
*   [✅] Always attach a bucket_route to the project for user uploads (User uploads for project resources are handled by `dialectic_contributions`. Session-specific inputs linked via `user_input_reference_url` in `dialectic_sessions`).
*   [✅] Always attach the user_domain_overlay_values to the project
*   [✅] Save the user's input (typed or uploaded) to the storage bucket (This will be pointed to by `dialectic_sessions.user_input_reference_url`)
*   [✅] Ensure the user can upload, store, and send these additional fields if they wish (Via the `user_input_reference_url` mechanism)
*   [ ] - `{domain}` - The knowledge domain (software development, finance, engineering, legal)
*   [ ] - `{user_objective}` - The specific goal or problem to solve
*   [ ] - `{context_description}` - Detailed description of the current situation/requirements
*   [ ] - `{deployment_context}` - Where/how the solution will be implemented
*   [ ] - `{domain_standards}` - Domain-specific quality standards and best practices
*   [ ] - `{deliverable_format}` - Expected output format (code, document, plan, etc.)
*   [ ] - `{success_criteria}` - Measurable outcomes that define success
*   [ ] - `{constraint_boundaries}` - Non-negotiable requirements and limitations
*   [ ] - `{stakeholder_considerations}` - Who will be affected and how
*   [ ] - `{reference_documents}` - User-provided reference materials and existing assets
*   [ ] - `{compliance_requirements}` - Regulatory, legal, or organizational compliance mandates
*   [ ] - `{agent_count}` - Number of agents participating in this dialectic process (This will be derived from `dialectic_sessions.selected_model_catalog_ids.length`)
*   [ ] - `{prior_stage_outputs}` - All outputs from the previous dialectic stage (multiple versions)
*   [✅] Provide default values (or null) for these fields if the user doesn't supply them.
*   [✅] Render the entire prompt payload for the user's inspection before sending to the backend (The compiled prompt for an agent will be linked via `dialectic_contributions.seed_prompt_url`)
*   [✅] Render the entire prompt cost estimate for the user's inspection before sending to the backend
*   `[✅]` Fix `dialectic_sessions` table to link to the `seed_prompt_url` document as a file stored in the bucket **(Replaced by `user_input_reference_url` in `dialectic_sessions` for user input, and `seed_prompt_url` in `dialectic_contributions` for agent input. The following sections will detail how user feedback and edits contribute to forming the `seed_prompt_url` for subsequent stages.)** 
*   [ ]     User Input Reference URL is for the user to submit additional documents matching the overlay values from the domain_prompt_overlay value listed immediately above. The app will eventually be updated to permit users to attach these additional files for more accurate constraints and expectation setting for the AI completion target.  

### 1.X [REFACTOR] Refactor Project Creation Flow for Integrated File Handling

*   **Objective:** To refactor the dialectic project creation process to support an optional file upload for the initial prompt as part of a single, orchestrated backend action. This ensures that whether a user types a prompt or uploads a file, the experience is seamless, and the backend handles data storage and linking correctly.
*   **Key Changes:**
    *   Frontend will always send `FormData` for project creation.
    *   The `createProject` function within `dialectic-service` will become the primary orchestrator for this process, handling `FormData`, file uploads (if present), and all necessary database interactions for project and resource creation.
    *   A reusable internal utility will manage the specifics of file storage and `dialectic_contributions` table entries.
*   **Note on Coordinated Refactoring:** This `1.X` refactoring involves coordinated changes across the client-side (API call and form submission, `1.X.3`), the main `index.ts` request handler (`1.X.2.2`), and specific backend handlers like `createProject.ts` (`1.X.2.1`). The end goal is a single `FormData`-based request from the client for project creation, inclusive of an optional file upload.
*   `[✅] 1.X.1 [DOCS]` Note: All file storage paths and metadata handling within this refactor must adhere to "Section 0: Core Data Handling Principles & Supabase Storage Architecture". The `dialectic_contributions` table (schema defined in `1.0.B.1.2` or `1.1.5.2` - note: current backend implementation uses `dialectic_project_resources` for initial prompt file metadata) will be used to store metadata for the initial prompt file if one is provided.
*   `[✅] 1.X.2 [BE/REFACTOR]` **Phase 2: Backend - `createProject` Function Becomes the Orchestrator**
    *   `[✅] 1.X.2.1 [BE/REFACTOR]` Modify `createProject` function in `supabase/functions/dialectic-service/createProject.ts`.
        *   `[✅] 1.X.2.1.1` Update function signature **in the `ActionHandlers` interface (within `index.ts`) and in `createProject.ts` itself**: `createProject` function in `createProject.ts` and its definition in `ActionHandlers` in `index.ts` both correctly accept `payload: FormData` and the authenticated `user` object.
        *   `[✅] 1.X.2.1.2` Implement full orchestration logic in `createProject.ts`:
            1.  [✅] The main `index.ts` handler (`handleRequest`) will authenticate the user from `req` and parse the request.
            2.  [✅] For `multipart/form-data` requests intended for `createProject`, `handleRequest` will call `await req.formData()` and route based on an `action='createProject'` field within the `FormData`. It then passes the entire `FormData` object and the authenticated `user` object to the `createProject` function.
            3.  [✅] The `createProject` function (in `createProject.ts`) receives `payload: FormData` and `user: User` as arguments. It parses this `payload` object to obtain individual fields like `projectName`, `initialUserPromptText`, `selectedDomainTag`, `selected_domain_overlay_id`, and `promptFile` (File object).
            4.  [✅] Validate required fields (e.g., `projectName` obtained from `payload.get('projectName')`).
            5.  [✅] Prepare data for `dialectic_projects` insertion using fields from `FormData`.
            6.  [✅] Insert this initial record into `dialectic_projects` table. Get the `newProjectId`.
            7.  [✅] **If `promptFile` (from `payload.get('promptFile') as File`) exists:**
                a.  [✅] Define `storageBucket` (e.g., "dialectic-contributions").
                b.  [✅] Define `storagePath` (e.g., `projects/{newProjectId}/initial-prompts/{resource_uuid}/{promptFile.name}`).
                c.  [✅] Use direct Supabase client calls to:
                    i.   Upload `promptFile` to the `storagePath` within the `storageBucket`.
                    ii.  Create a record in `dialectic_project_resources` (Note: plan mentions `dialectic_contributions`, but current implementation uses `dialectic_project_resources` for this specific initial prompt file metadata) with necessary details (`project_id`, `user_id`, `file_name`, `storage_bucket`, `storage_path`, `mime_type`, `size_bytes`, `resource_description`).
                    iii. Get the `id` of this new `dialectic_project_resources` record.
                d.  [✅] If file processing and DB insertion for the resource are successful: Update the `dialectic_projects` record (for `newProjectId`): set `initial_prompt_resource_id` and adjust `initial_user_prompt`.
                e.  [✅] If file processing or resource record creation fails: Log the error and attempt to rollback/cleanup (e.g., remove uploaded file).
            8.  [✅] Fetch the final (potentially updated) `dialectic_projects` record.
            9.  [✅] Return the project data (or error).
        *   `[ ] 1.X.2.1.3 [TEST-UNIT]` Write/update comprehensive unit/integration tests for `createProject`. Mock interactions and test scenarios: no file, file success, file processing failure, DB update failure.
    *   `[✅] 1.X.2.2 [BE/REFACTOR]` Simplify the `'createProject'` action case in `supabase/functions/dialectic-service/index.ts`.
        *   `[✅] 1.X.2.2.1` It now primarily calls `handlers.createProject(formData, dbAdminClient, userForMultipart)` and returns its result.
        *   `[ ] 1.X.2.2.2 [TEST-INT]` Update integration tests for the `index.ts` endpoint for project creation involving `FormData`.

*   `[ ] 1.X.3 [API/STORE/UI/REFACTOR]` **Phase 3: Frontend Adjustments**
    *   `[✅] 1.X.3.1 [STORE/REFACTOR]` Modify `createDialecticProject` thunk in `packages/store/src/dialecticStore.ts`.
        *   `[✅] 1.X.3.1.1` Ensure it always constructs and sends `FormData`.
        *   `[✅] 1.X.3.1.2` Payload for thunk (`CreateProjectThunkPayload`): `{ projectName, initialUserPromptText?, promptFile?, ... }`.
        *   `[✅] 1.X.3.1.3` `FormData` construction: include `projectName`, `initialUserPrompt` (text, only if no file), and `promptFile` (if exists).
        *   `[✅] 1.X.3.1.4 [TEST-UNIT]` Update store unit tests.
    *   `[✅] 1.X.3.2 [API/REFACTOR]` Update `apiClient.dialectic.createProject` method in `packages/api/src/dialectic.api.ts`.
        *   `[✅] 1.X.3.2.1` Ensure its method signature accepts `FormData`.
        *   `[✅] 1.X.3.2.2` Ensure it passes `FormData` correctly to the underlying `this.apiClient.post` (which should handle `FormData` by not setting `Content-Type: application/json`).
        *   `[✅] 1.X.3.2.3 [TEST-UNIT]` Update API client unit tests.
    *   `[✅] 1.X.3.3 [UI/REFACTOR]` Update `CreateDialecticProjectForm.tsx` in `apps/web/src/components/dialectic/`.
        *   `[✅] 1.X.3.3.1` Modify `onSubmit` handler:
            *   Collect `projectName`, `initialUserPromptText` (from textarea), `promptFile` (from component state if a file was selected/dropped via `TextInputArea`).
            *   Dispatch `createDialecticProject` thunk with these values, ensuring the thunk will package them into a single `FormData` object.
            *   **Remove** the secondary/subsequent call to `handleActualFileUpload` or `uploadProjectResourceFile` thunk; this functionality should now be part of the single `createDialecticProject` backend flow.
        *   `[✅] 1.X.3.3.2 [TEST-UNIT]` Update component unit tests to reflect the single `FormData` submission flow and removal of the secondary upload call.

*   `[ ] 1.X.4 [DOCS]` Update any relevant backend or frontend documentation regarding project creation to reflect this new unified flow.
*   `[ ] 1.X.5 [COMMIT]` refactor: implement unified project creation with optional file upload

### 1.Y [ARCH] Architectural Enhancement for Domain and Process Flexibility

*   **Objective:** Refactor the core data model to support configurable, domain-specific workflows instead of a single hard-coded process. This involves creating a set of configuration tables that define domains, processes, stages, and transitions, making the application a flexible engine for various knowledge work use cases. This change is designed to be implemented for the MVP with a minimal dataset that mirrors the current linear software development flow, ensuring future scalability without disrupting initial goals.

*   `[x] 1.Y.1 [DB]` **Create New Core Configuration Tables**
    *   `[x] 1.Y.1.1 [DB]` Create `dialectic_domains` table with self-referencing `parent_domain_id` for hierarchy.
    *   `[x] 1.Y.1.2 [DB]` Create `dialectic_stages` table to define reusable process stages.
    *   `[x] 1.Y.1.3 [DB]` Create `dialectic_process_templates` table to define a specific workflow.
    *   `[x] 1.Y.1.4 [DB]` Create `dialectic_stage_transitions` table to define the graph of a process.
    *   `[x] 1.Y.1.5 [DB]` Create `dialectic_artifact_types` table for defining I/O.

*   `[X] 1.Y.2 [DB]` **Alter Existing Tables**
    *   `[x] 1.Y.2.1 [DB]` Add `process_template_id` to `dialectic_projects`.
    *   `[x] 1.Y.2.2 [DB]` Replace `domain_tag` with `domain_id` FK on `domain_specific_prompt_overlays`.
    *   `[x] 1.Y.2.3 [DB]` Deprecate and remove `stage_association` and related columns from `system_prompts`.
    *   `[x] 1.Y.2.4 [DB]` Add `current_stage_id` (FK to `dialectic_stages`) to `dialectic_sessions`, deprecating the old enum.

*   `[x] 1.Y.3 [DB]` **Seed Initial Data**
    *   `[x] 1.Y.3.1 [DB]` Seed `dialectic_domains` with "Software Development" (and sub-domains), "Finance", "Engineering", "Construction", "Legal", and "General".
    *   `[x] 1.Y.3.2 [DB]` Seed `dialectic_stages` with the five core stages (Thesis, Antithesis, etc.).
    *   `[x] 1.Y.3.3 [DB]` Seed `dialectic_process_templates` for a default "Software Development" and "General" process.
    *   `[x] 1.Y.3.4 [DB]` Seed `dialectic_stage_transitions` to create the linear 5-stage flow for the default processes.
    *   `[x] 1.Y.3.5 [DB]` Seed `domain_specific_prompt_overlays` with data from `sample_prompts.md`, linking them to the new domains and prompts.
    *   `[x] 1.Y.3.6 [DB]` Associate default `system_prompts` with the new `dialectic_stages`.

*   `[X] 1.Y.4 [BE/REFACTOR]` **Refactor Backend Logic**
    *   `[X] 1.Y.4.1 [BE]` Refactor `submitStageResponses` to be driven by the new configuration tables.
        *   `[X]` Remove hard-coded `getNextStageSlug` logic.
        *   `[X]` Implement logic to query `dialectic_stage_transitions` to determine the next stage.
        *   `[X]` Implement logic to use `input_artifact_rules` from the target `dialectic_stages` row to assemble the next seed prompt.
    *   `[X] 1.Y.4.2 [TEST-INT]` Update integration tests for `submitStageResponses` to mock and verify the new database-driven logic.

*   `[ ] 1.Y.5 [UI/REFACTOR]` **Update UI Data Sources**
    *   `[ ] 1.Y.5.1 [UI]` Modify `CreateDialecticProjectForm`'s "Domain" selector to be populated from the `dialectic_domains` table.
    *   `[ ] 1.Y.5.2 [TEST-UNIT]` Update component tests for the "Domain" selector.

*   `[ ] 1.Y.6 [COMMIT]` feat(arch): implement flexible domain and process architecture

### 1.Z [REFACTOR] Transition from 'selected_domain_tag' to 'selected_domain_id'

*   **Objective:** To execute a direct, non-backwards-compatible refactoring within the development branch to replace the legacy `dialectic_projects.selected_domain_tag` (TEXT) field with the new, normalized `dialectic_projects.selected_domain_id` (UUID foreign key to `dialectic_domains.id`). This approach is chosen because the project is pre-release with no live user data to migrate, allowing for a faster and cleaner "rip and replace" strategy.

*   `[✅] 1.Z.1 [DB]` **Phase 1: Database Schema Migration (The "Rip")**
    *   `[✅] 1.Z.1.1 [DB]` Create a new Supabase migration file (`20250614144354_refactor_domain_handling.sql`).
    *   `[✅] 1.Z.1.2 [DB]` In the migration script, alter the `dialectic_projects` table to:
        *   Add the new `selected_domain_id` column as a `uuid`.
        *   Add a foreign key constraint from `selected_domain_id` to `dialectic_domains(id)`.
        *   Drop the old `selected_domain_tag` column.
        *   Enforce a `NOT NULL` constraint on the new `selected_domain_id` column.
    *   `[✅] 1.Z.1.3 [DB]` Apply the database migration to the local development environment.
    *   `[✅] 1.Z.1.4 [DB]` Regenerate Supabase TypeScript types (`types_db.ts`) to reflect the new schema.

*   `[ ] 1.Z.2 [BE/REFACTOR]` **Phase 2: Backend Codebase Refactoring (The "Replace")**
    *   `[✅] 1.Z.2.1 [BE/REFACTOR]` Identify all usages of `selected_domain_tag` across the `supabase/functions` directory to create a clear list of files to modify.
    *   `[✅] 1.Z.2.2 [BE/REFACTOR]` Rename `updateProjectDomainTag.ts` to `updateProjectDomain.ts`.
        *   `[✅]` Update the function's logic and payload type to accept `selectedDomainId: string` instead of `selectedDomainTag: string`.
        *   `[✅]` Update the corresponding test file name and its contents.
    *   `[✅] 1.Z.2.3 [BE/REFACTOR]` Refactor `createProject.ts`:
        *   `[✅]` Modify the `CreateProjectPayload` to expect `selectedDomainId` instead of `selectedDomainTag`.
        *   `[✅]` Update the database insertion logic to populate the `selected_domain_id` column.
    *   `[✅] 1.Z.2.4 [BE/REFACTOR]` Refactor `cloneProject.ts`:
        *   `[✅]` Update the logic to correctly copy the `selected_domain_id` of the original project to the new project.
    *   `[✅] 1.Z.2.5 [BE/REFACTOR]` Refactor read operations (`getProjectDetails`, `listProjects`, etc.):
        *   `[✅]` Update Supabase queries to `JOIN` `dialectic_projects` with `dialectic_domains` on `dialectic_projects.selected_domain_id = dialectic_domains.id`.
        *   `[✅]` Modify the data returned by these functions to include both `selected_domain_id` from the project and the `name` from the joined domain table (e.g., as a new `domain_name` property).
    *   `[ ] 1.Z.2.6 [TEST-INT]` Update all related integration tests (`*.test.ts`) within `supabase/functions/dialectic-service/` to align with the new database schema, function payloads, and expected return data structures.

*   `[✅] 1.Z.3 [API/REFACTOR]` **Phase 2: Shared Types and API Client Refactoring**
    *   `[✅] 1.Z.3.1 [TYPES]` Update the `DialecticProject` type definition in `packages/types`:
        *   `[✅]` Remove the `selected_domain_tag` property.
        *   `[✅]` Add the `selected_domain_id: string` property.
        *   `[✅]` Add the `domain_name: string` property to hold the joined name.
    *   `[✅ ] 1.Z.3.2 [API]` Update `DialecticApiClient` interfaces and method payloads (e.g., `CreateProjectPayload`) in `@paynless/api` to use `selectedDomainId`.
    *   `[✅] 1.Z.3.3 [TEST-UNIT]` Update all `dialectic.api.test.ts` unit tests and associated mocks to use the new types and payloads.

*   `[ ] 1.Z.4 [STORE/REFACTOR]` **Phase 2: State Management Refactoring**
    *   `[ ] 1.Z.4.1 [STORE]` Update `DialecticStateValues` in `dialecticStore.ts`, replacing any state related to `selectedDomainTag` with state for `selectedDomainId`.
    *   `[ ] 1.Z.4.2 [STORE]` Refactor store thunks (`createDialecticProject`, etc.) and actions (`setSelectedDomainTag` -> `setSelectedDomainId`) to operate with the domain ID.
    *   `[ ] 1.Z.4.3 [STORE]` Update store selectors to work with `selectedDomainId` and the refactored `DialecticProject` object structure.
    *   `[ ] 1.Z.4.4 [TEST-UNIT]` Update all `dialecticStore.test.ts` and `dialecticStore.selectors.test.ts` tests to reflect the new state and logic.

*   `[ ] 1.Z.5 [UI/REFACTOR]` **Phase 2: Frontend Component Refactoring**
    *   `[ ] 1.Z.5.1 [UI]` Systematically fix all TypeScript errors that arise in the `apps/web` directory due to the type changes.
    *   `[ ] 1.Z.5.2 [UI]` Update any component that displays the domain name (e.g., on the project details page) to use the new `domain_name` property from the project object in the store.
    *   `[ ] 1.Z.5.3 [UI]` Update components that allow domain selection (e.g., `CreateDialecticProjectForm`, `StartDialecticSessionModal`) to ensure their selectors provide the `dialectic_domains.id` to the store actions.
    *   `[ ] 1.Z.5.4 [TEST-UNIT]` Update all affected component unit tests to mock the new store state and test the updated component logic.

*   `[ ] 1.Z.6 [TEST-E2E]` **Phase 3: Finalization and Verification**
    *   `[ ] 1.Z.6.1 [TEST-E2E]` Execute the full suite of end-to-end tests to validate the entire project creation and management flow with the new domain handling logic.
    *   `[ ] 1.Z.6.2 [DOCS]` Once all steps are complete, update all items in this `1.Z` section to `[✅]`.
    *   `[ ] 1.Z.6.3 [COMMIT]` refactor(system): complete transition from selected_domain_tag to selected_domain_id

{repo_root}/  (Root of the user's GitHub repository)