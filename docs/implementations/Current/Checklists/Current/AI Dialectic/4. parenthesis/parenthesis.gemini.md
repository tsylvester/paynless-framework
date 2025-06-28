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
*   `[ ] 1.0.1 [CONFIG]` Define new environment variables required for AI Dialectic Engine.
    *   `[ ] 1.0.1.1` Identify necessary variables (e.g., API keys for new AI providers if not already present, default model settings for Dialectic Engine).
    *   `[ ] 1.0.1.2` Update `.env.example` or similar template files.
    *   `[ ] 1.0.1.3` Ensure Supabase project settings (e.g., Vault for secrets) are updated if necessary for new AI provider keys.
    *   `[ ] 1.0.1.4 [DOCS]` Document new environment variables and their setup.
*   `[ ] 1.0.2 [DB]` Create `prompt_templates` table for storing system prompt templates.
    *   `[ ] 1.0.2.1 [TEST-UNIT]` Write migration test for `prompt_templates` table. (RED)
    *   `[ ] 1.0.2.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `template_name` (TEXT, not nullable, unique, e.g., "dialectic_thesis_default", "dialectic_antithesis_default_critique")
        *   `stage_association` (TEXT, nullable, e.g., "thesis", "antithesis", "synthesis", helps in filtering)
        *   `version` (INTEGER, default 1)
        *   `content` (TEXT, not nullable, the actual prompt template with placeholders like `{{initial_prompt}}`, `{{original_thesis_content}}`)
        *   `description` (TEXT, nullable)
        *   `variables_required` (JSONB, nullable, e.g., `["initial_prompt", "original_thesis_content"]` to document expected placeholders)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`)
    *   `[ ] 1.0.2.3` Create Supabase migration script for `prompt_templates`. (GREEN)
    *   `[ ] 1.0.2.4 [REFACTOR]` Review migration.
    *   `[ ] 1.0.2.5 [TEST-UNIT]` Run migration test.
*   `[ ] 1.0.3 [BE]` Seed initial prompt templates into `prompt_templates` table.
    *   `[ ] 1.0.3.1 [TEST-UNIT]` Write test for seeding initial prompts. (RED)
    *   `[ ] 1.0.3.2` Create a seed script (runnable as part of migrations or a separate utility) to insert:
        *   A default Thesis prompt (e.g., `template_name = "dialectic_thesis_default_v1"`, `stage_association = "thesis"`, content like "Given the following problem: {{initial_prompt}}, provide your initial comprehensive solution.")
        *   A default Antithesis critique prompt (e.g., `template_name = "dialectic_antithesis_critique_default_v1"`, `stage_association = "antithesis"`, content like "You are a critiquing AI. Review the following solution provided for the initial problem: '{{initial_prompt}}'. The solution is: '{{original_thesis_content}}'. Identify weaknesses, logical fallacies, missing elements, potential biases, and suggest specific improvements or alternative approaches. Be constructive but rigorous.")
    *   `[ ] 1.0.3.3` (GREEN)
    *   `[ ] 1.0.3.4 [REFACTOR]` Review seed script.
    *   `[ ] 1.0.3.5 [TEST-UNIT]` Run seed script test.
*   `[ ] 1.0.4 [RLS]` Define RLS for `prompt_templates` (e.g., all authenticated users can read, specific admin role to write/update).
    *   `[ ] 1.0.4.1 [TEST-INT]` Write RLS tests. (RED)
    *   `[ ] 1.0.4.2` Implement RLS. (GREEN)
    *   `[ ] 1.0.4.3 [TEST-INT]` Run RLS tests.
*   `[ ] 1.0.5 [COMMIT]` feat: initial setup, configuration, and prompt templates table for AI Dialectic Engine

### 1.1 Database Schema for Dialectic Core (Continued)
*   `[ ] 1.1.1 [DB]` Create `dialectic_projects` table.
    *   `[ ] 1.1.1.1 [TEST-UNIT]` Write migration test for `dialectic_projects` table creation. (RED)
    *   `[ ] 1.1.1.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `user_id` (UUID, foreign key to `profiles.id` on delete cascade, not nullable)
        *   `project_name` (TEXT, not nullable)
        *   `initial_user_prompt` (TEXT, not nullable, user's original framing of the problem)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`)
        *   `github_repo_url` (TEXT, nullable)
        *   `status` (TEXT, e.g., 'active', 'archived', 'template', default 'active')
    *   `[ ] 1.1.1.3` Create Supabase migration script for `dialectic_projects`. (GREEN)
    *   `[ ] 1.1.1.4 [REFACTOR]` Review migration script and table definition.
    *   `[ ] 1.1.1.5 [TEST-UNIT]` Run migration test.
*   `[ ] 1.1.2 [DB]` Create `dialectic_sessions` table.
    *   `[ ] 1.1.2.1 [TEST-UNIT]` Write migration test for `dialectic_sessions` table creation. (RED)
    *   `[ ] 1.1.2.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `project_id` (UUID, foreign key to `dialectic_projects.id` on delete cascade, not nullable)
        *   `session_description` (TEXT, nullable, e.g., "Initial run with models A, B, C using default thesis prompt")
        *   `current_stage_seed_prompt` (TEXT, nullable, the actual prompt that was used to initiate the current stage, can be a combination of user input and template)
        *   `iteration_count` (INTEGER, default 1, for multi-cycle sessions later)
        *   `active_thesis_prompt_template_id` (UUID, foreign key to `prompt_templates.id`, nullable)
        *   `active_antithesis_prompt_template_id` (UUID, foreign key to `prompt_templates.id`, nullable)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`)
        *   `status` (TEXT, e.g., 'pending_thesis', 'generating_thesis', 'thesis_complete', 'generating_antithesis', 'antithesis_complete', 'session_complete', 'failed', default 'pending_thesis')
    *   `[ ] 1.1.2.3` Create Supabase migration script for `dialectic_sessions`. (GREEN)
    *   `[ ] 1.1.2.4 [REFACTOR]` Review migration script and table definition.
    *   `[ ] 1.1.2.5 [TEST-UNIT]` Run migration test.
*   `[ ] 1.1.3 [DB]` Create `dialectic_session_models` table (associative table for models participating in a session).
    *   `[ ] 1.1.3.1 [TEST-UNIT]` Write migration test for `dialectic_session_models` table. (RED)
    *   `[ ] 1.1.3.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `session_id` (UUID, foreign key to `dialectic_sessions.id` on delete cascade, not nullable)
        *   `model_id` (TEXT, not nullable, e.g., "openai/gpt-4", "anthropic/claude-3-opus". This will later be validated against `ai_models_catalog.id`).
        *   `model_role` (TEXT, nullable, e.g., "thesis_generator", "critiquer", for future advanced role assignment; for Phase 1, all models generate thesis and critique others)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
    *   `[ ] 1.1.3.3` Add unique constraint on (`session_id`, `model_id`).
    *   `[ ] 1.1.3.4` Create Supabase migration script for `dialectic_session_models`. (GREEN)
    *   `[ ] 1.1.3.5 [REFACTOR]` Review migration script.
    *   `[ ] 1.1.3.6 [TEST-UNIT]` Run migration test.
*   `[ ] 1.1.4 [DB]` Create `dialectic_contributions` table.
    *   `[ ] 1.1.4.1 [TEST-UNIT]` Write migration test for `dialectic_contributions` table. (RED)
    *   `[ ] 1.1.4.2` Define columns:
        *   `id` (UUID, primary key, default `uuid_generate_v4()`)
        *   `session_id` (UUID, foreign key to `dialectic_sessions.id` on delete cascade, not nullable)
        *   `session_model_id` (UUID, foreign key to `dialectic_session_models.id` on delete cascade, not nullable, identifies the specific model instance in the session that made this contribution)
        *   `stage` (TEXT, not nullable, e.g., 'thesis', 'antithesis') // Corresponds to DialeqAI stages
        *   `content` (TEXT, not nullable, the actual output from the AI model)
        *   `target_contribution_id` (UUID, foreign key to `dialectic_contributions.id` on delete set null, nullable, used in 'antithesis' stage to link a critique to the 'thesis' it's critiquing)
        *   `prompt_template_id_used` (UUID, foreign key to `prompt_templates.id`, nullable)
        *   `actual_prompt_sent` (TEXT, nullable, the fully rendered prompt text fed to the model for this contribution)
        *   `tokens_used_input` (INTEGER, nullable)
        *   `tokens_used_output` (INTEGER, nullable)
        *   `cost_usd` (NUMERIC(10,6), nullable) // Assuming precision for cost
        *   `raw_provider_response` (JSONB, nullable, to store the full unprocessed response from the AI provider for debugging/auditing)
        *   `processing_time_ms` (INTEGER, nullable)
        *   `model_version_details` (TEXT, nullable, e.g. specific model snapshot if available from provider)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`)
    *   `[ ] 1.1.4.3` Create Supabase migration script for `dialectic_contributions`. (GREEN)
    *   `[ ] 1.1.4.4 [REFACTOR]` Review migration script.
    *   `[ ] 1.1.4.5 [TEST-UNIT]` Run migration test.
*   `[ ] 1.1.5 [DB]` Create `ai_models_catalog` table (moved from optional to required for Phase 1 to support model selection and cost estimation).
    *   `[ ] 1.1.5.1 [TEST-UNIT]` Write migration test for `ai_models_catalog`. (RED)
    *   `[ ] 1.1.5.2` Define columns:
        *   `id` (TEXT, primary key, e.g., "openai/gpt-4-turbo", "anthropic/claude-3-opus-20240229")
        *   `provider` (TEXT, not nullable, e.g., "openai", "anthropic", "google")
        *   `model_name` (TEXT, not nullable, e.g., "GPT-4 Turbo", "Claude 3 Opus")
        *   `description` (TEXT, nullable)
        *   `strengths` (TEXT[], nullable) // Array of text for multiple strengths
        *   `weaknesses` (TEXT[], nullable) // Array of text for multiple weaknesses
        *   `context_window_tokens` (INTEGER, nullable)
        *   `cost_per_million_input_tokens_usd` (NUMERIC(10,4), nullable)
        *   `cost_per_million_output_tokens_usd` (NUMERIC(10,4), nullable)
        *   `supports_json_mode` (BOOLEAN, default false)
        *   `supports_tool_use` (BOOLEAN, default false)
        *   `is_active` (BOOLEAN, default true, for soft deletes or deprecation)
        *   `created_at` (TIMESTAMPTZ, default `now()`)
        *   `updated_at` (TIMESTAMPTZ, default `now()`)
    *   `[ ] 1.1.5.3` Create Supabase migration script. (GREEN)
    *   `[ ] 1.1.5.4 [REFACTOR]` Review.
    *   `[ ] 1.1.5.5 [TEST-UNIT]` Run migration test.
*   `[ ] 1.1.6 [BE]` Seed `ai_models_catalog` with initial data for core OpenAI, Anthropic, and Google models supported in Phase 1.
    *   `[ ] 1.1.6.1 [TEST-UNIT]` Write test for seeding catalog. (RED)
    *   `[ ] 1.1.6.2` Create seed script. (GREEN)
    *   `[ ] 1.1.6.3 [TEST-UNIT]` Run seed script test.
*   `[ ] 1.1.7 [RLS]` Define Row Level Security policies for `dialectic_projects`, `dialectic_sessions`, `dialectic_session_models`, `dialectic_contributions`.
    *   `[ ] 1.1.7.1 [TEST-INT]` Write RLS tests for `dialectic_projects` (user owns their projects). (RED)
    *   `[ ] 1.1.7.2` Implement RLS for `dialectic_projects`. (GREEN)
    *   `[ ] 1.1.7.3 [TEST-INT]` Run RLS tests for `dialectic_projects`.
    *   `[ ] 1.1.7.4 [TEST-INT]` Write RLS tests for `dialectic_sessions` (user can access sessions of their projects). (RED)
    *   `[ ] 1.1.7.5` Implement RLS for `dialectic_sessions`. (GREEN)
    *   `[ ] 1.1.7.6 [TEST-INT]` Run RLS tests for `dialectic_sessions`.
    *   `[ ] 1.1.7.7 [TEST-INT]` Write RLS tests for `dialectic_session_models`. (RED)
    *   `[ ] 1.1.7.8` Implement RLS for `dialectic_session_models`. (GREEN)
    *   `[ ] 1.1.7.9 [TEST-INT]` Run RLS tests for `dialectic_session_models`.
    *   `[ ] 1.1.7.10 [TEST-INT]` Write RLS tests for `dialectic_contributions`. (RED)
    *   `[ ] 1.1.7.11` Implement RLS for `dialectic_contributions`. (GREEN)
    *   `[ ] 1.1.7.12 [TEST-INT]` Run RLS tests for `dialectic_contributions`.
*   `[ ] 1.1.8 [RLS]` Define RLS for `ai_models_catalog` (e.g., all authenticated users can read).
    *   `[ ] 1.1.8.1 [TEST-INT]` Write RLS tests. (RED)
    *   `[ ] 1.1.8.2` Implement RLS. (GREEN)
    *   `[ ] 1.1.8.3 [TEST-INT]` Run RLS tests.
*   `[ ] 1.1.9 [COMMIT]` feat(db): add core schema and RLS for AI Dialectic Engine (projects, sessions, contributions, models catalog)

### 1.2 Backend Logic: Core Dialectic Service (Supabase Edge Functions)

*   `[ ] 1.2.1 [BE]` Create new Supabase Edge Function: `dialectic-service`. This function will use command pattern or similar to handle multiple actions related to the dialectic process to reduce the number of individual functions. Ensure input sanitization for all actions.
    *   Action: `createProject`
        *   `[ ] 1.2.1.1 [TEST-INT]` Write tests for `createProject` action (input: `projectName`, `initialUserPrompt`; output: created project object; auth). (RED)
        *   `[ ] 1.2.1.2` Implement logic: Inserts into `dialectic_projects`. (GREEN)
        *   `[ ] 1.2.1.3 [REFACTOR]` Review.
        *   `[ ] 1.2.1.4 [TEST-INT]` Run tests.
    *   Action: `startSession`
        *   `[ ] 1.2.1.5 [TEST-INT]` Write tests for `startSession` action (input: `projectId`, `selectedModelIds` (array of strings from `ai_models_catalog.id`), `sessionDescription` (optional), `thesisPromptTemplateName` (optional, defaults to "dialectic_thesis_default_v1"), `antithesisPromptTemplateName` (optional, defaults to "dialectic_antithesis_critique_default_v1"); output: created session object; auth). (RED)
        *   `[ ] 1.2.1.6` Implement logic:
            1.  Verify project ownership.
            2.  Fetch `prompt_template.id` for thesis and antithesis from `prompt_templates` table using names.
            3.  Creates `dialectic_sessions` record (linking `active_thesis_prompt_template_id`, etc.).
            4.  Creates `dialectic_session_models` records from `selectedModelIds`.
            5.  Sets `dialectic_sessions.status` to `pending_thesis`.
            6.  Constructs `current_stage_seed_prompt` for the session by rendering the chosen thesis prompt template with the project's `initial_user_prompt`. Store this in `dialectic_sessions.current_stage_seed_prompt`.
            7.  **Asynchronously call `generateThesisContributions` action for this session.** (This will require a way to invoke another action within the same function or a separate, secure internal function. For Supabase, this might involve using `pg_net` or invoking another Edge Function with a service role key if direct async invocation within one function call isn't straightforward for long-running tasks.)
        *   `[ ] 1.2.1.7` (GREEN)
        *   `[ ] 1.2.1.8 [REFACTOR]` Review.
        *   `[ ] 1.2.1.9 [TEST-INT]` Run tests.
*   `[ ] 1.2.2 [BE]` Helper: Prompt Rendering Utility
    *   `[ ] 1.2.2.1 [TEST-UNIT]` Write tests for a utility that takes a prompt template string (e.g., "Solve: {{problem}}") and a context object (e.g., `{ problem: "world hunger" }`) and returns the rendered prompt. (RED)
    *   `[ ] 1.2.2.2` Implement the prompt rendering utility (e.g., using a simple string replacement or a lightweight template engine). (GREEN)
    *   `[ ] 1.2.2.3 [TEST-UNIT]` Run tests.
*   `[ ] 1.2.3 [BE]` Helper: AI Model Interaction Utilities (within `dialectic-service` or shared helpers)
    *   `[ ] 1.2.3.1 [TEST-UNIT]` Write unit tests for `callUnifiedAIModel(modelCatalogId, renderedPrompt, options)` which internally calls specific provider SDKs. Mock provider SDKs. (RED)
    *   `[ ] 1.2.3.2` Implement `callUnifiedAIModel`:
        *   Fetches model details (provider, API key secret name, specific model name for provider) from `ai_models_catalog` using `modelCatalogId`.
        *   Retrieves API key from Supabase Vault secrets.
        *   Uses a switch/strategy based on `provider` to call the correct underlying SDK (OpenAI, Anthropic, Google already exist in the project; ensure they return standardized response: `content`, `inputTokens`, `outputTokens`, `cost`, `rawProviderResponse`, `processingTimeMs`).
            *   **Cost Calculation Note:** The `cost` field is calculated using `inputTokens`, `outputTokens`, and the `cost_per_million_input_tokens_usd` / `cost_per_million_output_tokens_usd` from the `ai_models_catalog` for the respective model. This calculation should align with or extend existing cost utilities in the system.
        *   Handles errors from provider SDKs gracefully (e.g., log error, update contribution record with error status, do not halt entire session if one model fails, return specific error structure).
    *   `[ ] 1.2.3.3` (GREEN)
    *   `[ ] 1.2.3.4 [REFACTOR]` Review error handling and logging.
    *   `[ ] 1.2.3.5 [TEST-UNIT]` Run tests.
*   `[ ] 1.2.4 [BE]` `dialectic-service` Action: `generateThesisContributions` (internal, triggered by `startSession` or a scheduler for retries/long processes)
    *   `[ ] 1.2.4.1 [TEST-INT]` Write tests (input: `sessionId`; auth: service role; verifies contributions are created and session status updated). (RED)
    *   `[ ] 1.2.4.2` Implement logic:
        1.  Fetch `dialectic_session`, its `dialectic_session_models`, and the `current_stage_seed_prompt`.
        2.  Verify session status is `pending_thesis`. Update to `generating_thesis`. Log this transition.
        3.  For each `session_model`:
            *   Call `callUnifiedAIModel` with its `model_id` (from `session_model.model_id` which is a catalog ID) and the `current_stage_seed_prompt`.
            *   Save result in `dialectic_contributions` (stage 'thesis', `actual_prompt_sent` = `current_stage_seed_prompt`, store costs, tokens, etc.). If a model call fails, record the error in the contribution and proceed with other models. Retry the failed model once the other models complete. Communicate failure to user and ask if they'd like to select another model, retry again, or continue with the existing results. 
        4.  Update `dialectic_sessions.status` to `thesis_complete`. Log this transition.
        5.  **Asynchronously call `generateAntithesisContributions` action for this session.**
    *   `[ ] 1.2.4.3` (GREEN)
    *   `[ ] 1.2.4.4 [REFACTOR]` Review error handling for individual model failures and overall session status updates.
    *   `[ ] 1.2.4.5 [TEST-INT]` Run tests.
*   `[ ] 1.2.5 [BE]` `dialectic-service` Action: `generateAntithesisContributions` (internal)
    *   `[ ] 1.2.5.1 [TEST-INT]` Write tests (input: `sessionId`; auth: service role; verifies critiques are created against each thesis, and session status updated). (RED)
    *   `[ ] 1.2.5.2` Implement logic:
        1.  Fetch session, its models, all 'thesis' contributions, and `antithesis_prompt_template_id` from session. Fetch `initial_user_prompt` from project. Fetch antithesis prompt template content.
        2.  Verify status is `thesis_complete`. Update to `generating_antithesis`. Log this transition.
        3.  For each `critiquer_session_model`: (note, all models will critique their peers and their own work)
            *   For each `thesis_contribution` (and successfully generated):
                *   Render the antithesis prompt template using context: `initial_user_prompt`, `original_thesis_content = thesis_contribution.content`.
                *   Call `callUnifiedAIModel` with `critiquer_session_model.model_id` and the rendered critique prompt.
                *   Save result in `dialectic_contributions` (stage 'antithesis', `target_contribution_id = thesis_contribution.id`, `actual_prompt_sent` = rendered critique prompt). Record errors if any.
        4.  Update `dialectic_sessions.status` to `antithesis_complete`. Log this transition.
    *   `[ ] 1.2.5.3` (GREEN)
    *   `[ ] 1.2.5.4 [REFACTOR]` Review logic and error handling.
    *   `[ ] 1.2.5.5 [TEST-INT]` Run tests.
*   `[ ] 1.2.6 [BE]` `dialectic-service` Action: `getProjectDetails`
    *   `[ ] 1.2.6.1 [TEST-INT]` Write tests (input: `projectId`; auth; output: project, its sessions, their models, and all contributions, ordered correctly). (RED)
    *   `[ ] 1.2.6.2` Implement using Supabase JS client to fetch nested data respecting RLS. (GREEN)
    *   `[ ] 1.2.6.3 [TEST-INT]` Run tests.
*   `[ ] 1.2.7 [BE]` `dialectic-service` Action: `listProjects`
    *   `[ ] 1.2.7.1 [TEST-INT]` Write tests (auth; output: list of user's projects). (RED)
    *   `[ ] 1.2.7.2` Implement. (GREEN)
    *   `[ ] 1.2.7.3 [TEST-INT]` Run tests.
*   `[ ] 1.2.8 [BE]` `dialectic-service` Action: `listModelCatalog`
    *   `[ ] 1.2.8.1 [TEST-INT]` Write tests (auth; output: list of active models from `ai_models_catalog`). (RED)
    *   `[ ] 1.2.8.2` Implement. (GREEN)
    *   `[ ] 1.2.8.3 [TEST-INT]` Run tests.
*   `[ ] 1.2.9 [DOCS]` Document the `dialectic-service` Edge Function, its actions, inputs, outputs, and error handling strategies in a relevant README (e.g., `supabase/functions/dialectic-service/README.md`).
*   `[ ] 1.2.10 [COMMIT]` feat(be): implement dialectic-service edge function with core actions

### 1.3 API Client (`@paynless/api`)
*   `[ ] 1.3.1 [API]` Define types in `packages/api/src/interface.ts` for Dialectic Engine.
    *   `[ ] 1.3.1.1` `DialecticProject`, `DialecticSession`, `DialecticSessionModel`, `DialecticContribution`, `AIModelCatalogEntry`, `PromptTemplate`.
    *   `[ ] 1.3.1.2` Input types for new API methods (e.g., `CreateProjectPayload`, `StartSessionPayload`).
    *   `[ ] 1.3.1.3` Ensure these types align with database schema and Edge Function outputs.
*   `[ ] 1.3.2 [API]` Add new methods to `DialecticAPIInterface` in `packages/api/src/interface.ts`.
    *   `[ ] 1.3.2.1` `createProject(payload: CreateProjectPayload): Promise<DialecticProject>`
    *   `[ ] 1.3.2.2` `startSession(payload: StartSessionPayload): Promise<DialecticSession>`
    *   `[ ] 1.3.2.3` `getProjectDetails(projectId: string): Promise<DialecticProject>` (should include sessions and contributions)
    *   `[ ] 1.3.2.4` `listProjects(): Promise<DialecticProject[]>`
    *   `[ ] 1.3.2.5` `listModelCatalog(): Promise<AIModelCatalogEntry[]>`
*   `[ ] 1.3.3 [API]` Implement these methods in `packages/api/src/adapter.ts`.
    *   `[ ] 1.3.3.1 [TEST-UNIT]` Write unit tests for each new adapter method, mocking `supabase.functions.invoke`. (RED)
    *   `[ ] 1.3.3.2` Implement `createProject` by invoking `dialectic-service` with action `createProject`. (GREEN)
    *   `[ ] 1.3.3.3` Implement `startSession` by invoking `dialectic-service` with action `startSession`. (GREEN)
    *   `[ ] 1.3.3.4` Implement `getProjectDetails` by invoking `dialectic-service` with action `getProjectDetails`. (GREEN)
    *   `[ ] 1.3.3.5` Implement `listProjects` by invoking `dialectic-service` with action `listProjects`. (GREEN)
    *   `[ ] 1.3.3.6` Implement `listModelCatalog` by invoking `dialectic-service` with action `listModelCatalog`. (GREEN)
    *   `[ ] 1.3.3.7 [REFACTOR]` Review implementations.
    *   `[ ] 1.3.3.8 [TEST-UNIT]` Run unit tests.
*   `[ ] 1.3.4 [API]` Update/create mocks in `packages/api/src/mocks.ts` for the new interface methods.
*   `[ ] 1.3.5 [DOCS]` Update `packages/api/README.md` with new Dialectic API methods.
*   `[ ] 1.3.6 [COMMIT]` feat(api): add dialectic service methods to api client

### 1.4 State Management (`@paynless/store`)
*   `[ ] 1.4.1 [STORE]` Define a new state slice for Dialectic Engine: `dialecticSlice`.
    *   `[ ] 1.4.1.1` Interface: `DialecticState` in `packages/store/src/interfaces/dialectic.ts` (or similar location).
        *   `projects: DialecticProject[] | null`
        *   `currentProjectDetails: DialecticProject | null` (includes sessions with their models and contributions)
        *   `modelCatalog: AIModelCatalogEntry[] | null`
        *   `isLoadingProjects: boolean`
        *   `isLoadingProjectDetails: boolean`
        *   `isLoadingModelCatalog: boolean`
        *   `error: string | null` (for general errors in this slice)
        *   `isCreatingProject: boolean`
        *   `isStartingSession: boolean`
*   `[ ] 1.4.2 [STORE]` Define Thunks/Actions for `dialecticSlice`.
    *   `[ ] 1.4.2.1 [TEST-UNIT]` Write tests for `fetchDialecticProjects` thunk (mocks API call, checks loading states and projects update). (RED)
    *   `[ ] 1.4.2.2` Implement `fetchDialecticProjects` thunk: Calls `api.dialectic.listProjects()`. Handles pending, fulfilled (updates `projects`, clears error), rejected (sets error) states. (GREEN)
    *   `[ ] 1.4.2.3 [TEST-UNIT]` Write tests for `fetchDialecticProjectDetails` thunk. (RED)
    *   `[ ] 1.4.2.4` Implement `fetchDialecticProjectDetails(projectId: string)` thunk. (Updates `currentProjectDetails`). (GREEN)
    *   `[ ] 1.4.2.5 [TEST-UNIT]` Write tests for `createDialecticProject` thunk. (RED)
    *   `[ ] 1.4.2.6` Implement `createDialecticProject(payload: CreateProjectPayload)` thunk. (Updates `projects` list on success, or refetches). (GREEN)
    *   `[ ] 1.4.2.7 [TEST-UNIT]` Write tests for `startDialecticSession` thunk. (RED)
    *   `[ ] 1.4.2.8` Implement `startDialecticSession(payload: StartSessionPayload)` thunk. (Refetches project details or updates `currentProjectDetails.sessions` on success). (GREEN)
    *   `[ ] 1.4.2.9 [TEST-UNIT]` Write tests for `fetchAIModelCatalog` thunk. (RED)
    *   `[ ] 1.4.2.10` Implement `fetchAIModelCatalog` thunk. (Updates `modelCatalog`). (GREEN)
*   `[ ] 1.4.3 [STORE]` Implement reducers for `dialecticSlice` to handle these actions' lifecycle (pending, fulfilled, rejected).
*   `[ ] 1.4.4 [STORE]` Define selectors for accessing dialectic state (e.g., `selectDialecticProjects`, `selectCurrentProjectDetails`, `selectModelCatalog`, `selectDialecticLoadingStates`).
*   `[ ] 1.4.5 [STORE]` Add `dialecticSlice.reducer` to the root reducer.
*   `[ ] 1.4.6 [STORE]` Update/create mocks for `dialecticSlice` initial state and selectors for testing UI components.
*   `[ ] 1.4.7 [DOCS]` Update `packages/store/README.md` to include details about the new `dialecticSlice`.
*   `[ ] 1.4.8 [REFACTOR]` Review all store additions.
*   `[ ] 1.4.9 [TEST-UNIT]` Run all new store unit tests.
*   `[ ] 1.4.10 [COMMIT]` feat(store): add dialectic state management

### 1.5 UI Components (`apps/web`) - Core Pages & Navigation
*   `[ ] 1.5.1 [UI]` Create new route for Dialectic Projects: `/dialectic` or `/ai-dialectic`.
    *   `[ ] 1.5.1.1` Add to router configuration in `apps/web`.
*   `[ ] 1.5.2 [UI]` Create `DialecticProjectsPage` component.
    *   `[ ] 1.5.2.1 [TEST-UNIT]` Write tests (renders loading state, error state, list of projects, "Create New Project" button). Mock store selectors. (RED)
    *   `[ ] 1.5.2.2` Implement component:
        *   Dispatches `fetchDialecticProjects` on mount.
        *   Uses `selectDialecticProjects` and `selectDialecticLoadingStates`.
        *   Displays a list of projects (e.g., name, created_at). Each project links to `DialecticProjectDetailsPage`.
        *   Includes a button/link to navigate to a "Create Dialectic Project" form/page.
        *   Ensure a11y principles are applied (e.g., keyboard navigation, ARIA roles).
    *   `[ ] 1.5.2.3` (GREEN)
    *   `[ ] 1.5.2.4 [REFACTOR]` Review.
    *   `[ ] 1.5.2.5 [TEST-UNIT]` Run tests.
*   `[ ] 1.5.3 [UI]` Create `CreateDialecticProjectPage` (or modal component).
    *   `[ ] 1.5.3.1 [TEST-UNIT]` Write tests (form fields for project name, initial user prompt; submit button; handles loading/error from `createDialecticProject` thunk). (RED)
    *   `[ ] 1.5.3.2` Implement component:
        *   Form with inputs for `projectName`, `initialUserPrompt`.
        *   On submit, dispatches `createDialecticProject`.
        *   Navigates to `DialecticProjectDetailsPage` on success.
        *   Displays loading/error states.
        *   Ensure a11y principles are applied.
    *   `[ ] 1.5.3.3` (GREEN)
    *   `[ ] 1.5.3.4 [REFACTOR]` Review.
    *   `[ ] 1.5.3.5 [TEST-UNIT]` Run tests.
*   `[ ] 1.5.4 [UI]` Create `DialecticProjectDetailsPage` component (route e.g., `/dialectic/:projectId`).
    *   `[ ] 1.5.4.1 [TEST-UNIT]` Write tests (displays project name, initial prompt, list of sessions; "Start New Session" button; loading/error states). Mock store. (RED)
    *   `[ ] 1.5.4.2` Implement component:
        *   Extracts `projectId` from route params.
        *   Dispatches `fetchDialecticProjectDetails(projectId)` on mount.
        *   Uses `selectCurrentProjectDetails`.
        *   Displays project info.
        *   Lists sessions (if any), linking to `DialecticSessionDetailsPage` (to be created).
        *   Button to open `StartDialecticSessionModal`.
        *   Ensure a11y principles are applied.
    *   `[ ] 1.5.4.3` (GREEN)
    *   `[ ] 1.5.4.4 [REFACTOR]` Review.
    *   `[ ] 1.5.4.5 [TEST-UNIT]` Run tests.
*   `[ ] 1.5.5 [UI]` Create `StartDialecticSessionModal` component.
    *   `[ ] 1.5.5.1 [TEST-UNIT]` Write tests (form for session description, multi-select for AI models from catalog; submit button; loading/error states from `startDialecticSession` thunk and `fetchAIModelCatalog` thunk). Mock store. (RED)
    *   `[ ] 1.5.5.2` Implement component:
        *   Dispatches `fetchAIModelCatalog` on mount if catalog is null.
        *   Uses `selectModelCatalog` for model selection.
        *   Form with `sessionDescription` (optional), multi-select for `selectedModelIds`.
        *   (Optional for Phase 1, can be hardcoded or defaults): Selectors for `thesisPromptTemplateName`, `antithesisPromptTemplateName`.
        *   On submit, dispatches `startDialecticSession` with `projectId` and form data.
        *   Closes modal and potentially refetches project details on success.
        *   Ensure a11y principles are applied.
    *   `[ ] 1.5.5.3` (GREEN)
    *   `[ ] 1.5.5.4 [REFACTOR]` Review.
    *   `[ ] 1.5.5.5 [TEST-UNIT]` Run tests.
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
*   `[ ] 1.5.7 [UI]` Add navigation link to `/dialectic` in the main app layout (e.g., sidebar, header).
*   `[ ] 1.5.8 [COMMIT]` feat(ui): add core pages and navigation for dialectic engine

### 1.6 Basic GitHub Integration (Backend & API)
*   `[ ] 1.6.1 [CONFIG]` Add new environment variables if needed for GitHub App/PAT specifically for Dialectic outputs, or confirm existing ones are sufficient and securely stored (e.g., in Supabase Vault).
*   `[ ] 1.6.2 [BE]` `dialectic-service` Action: `configureGitHubRepo`
    *   `[ ] 1.6.2.1 [TEST-INT]` Write tests (input: `projectId`, `githubRepoUrl`; auth; output: success/failure; updates `dialectic_projects.github_repo_url`). (RED)
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
        *   Fetch `github_repo_url` for the project.
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
*   `[ ] 3.2.2 [BE]` Orchestration logic in `generateParalysisContribution`'s completion (for `sessionId`, `current_iteration`):
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
            *   Asynchronously trigger `generateThesisContributions` (or `generateSynthesisContributions`) for the new `current_iteration`.
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

This detailed plan, especially for Phases 1-3, should provide a strong foundation for an AI agent to implement the AI Dialectic Engine. Phase 4 is more open-ended and would evolve based on priorities and user feedback.