# Document-Centric Generation 

## Problem Statement
- Stages are still continuous and monolithic. 
- A generation hiccup by a single model inhibits the assembly of its documents. 
- Individual jobs for models are still too monolithic. 
- The generation products are too large to be effectively handled by downstream consumers. 
- Prompts are dynamic by stage but not by continuation context or document context. 
- Each prompt for each model for each document or continuation is not saved uniquely, making troubleshooting and blame difficult. 
- Documents are not recast from json to markdown to be human usable. 
- Documents are not stored individually in the file tree. 
- Documents are not selected and sent dynamically to individual agents for each intra-stage or inter-stage generation. 

## Objectives
- Stepwise CI/CD so updates can be rolled out per-sprint. 
- Each and every prompt is context-aware and automatically generated for the specific job sent. 
- Each and every prompt sent in the entire process is saved for diagnostic, trouble-shooting, and blame. 
- Stage jobs are decomposed into an initial prompt to generate a header/master plan from an agent for that stage, then subsequent jobs are decomposed and parallelized into specific documents. 
- The first completion for each model for each stage is to generate a "header" response that establishes the context requirements for all the documents that will be generated in the step. 
- Each document generation uses the initial turn "header" to synchronize generated content across multiple documents to prevent drift / diff / contradiction. 
- Jobs, continuations, and retries are per-document-per-stage-per-model, not per-stage-per-model. 
- Partial document generation can be recovered without regeneration of the existing fragment. 
- Partial documents can be knit into a full document without duplicated fragments or losses. 
- Finished documents are recast from json to markdown and saved in the correct folder with the correct name.
- Finished documents are retrievable per-document for subsequent stage, inter-stage, or cross-model consumption. 

## Expected Outcome
- The decomposed document-centric generation model is applied to all jobs across all stages and all models. 
- Every element sent to or received from an agent is stored uniquely and accessible by the user and system. 
- Prompts are fully automated and decomposed to the specific turn, model, stage, step, document, or continuation. 
- Jobs are fully automated, decomposed, and parallelized across all documents to be generated while maintaining synchrony cross-document throughout the stage for each model. 
- Jobs and documents are synchronized by use of the initial completion as a header for additional jobs and documents. 
- Individual documents can be reliably generated, continued, retried, recovered from partial, composed into markdown, retrieved, and used dynamically by agents and users. 
- Improvements can be deployed continuously without requiring the entire epic to be completed for new functionality to be accessible by users and models. 

# Instructions for Agent
*   You MUST read the file every time you need to touch it. YOU CAN NOT RELY ON YOUR "MEMORY" of having read a file at some point previously. YOU MUST READ THE FILE FROM DISK EVERY TIME! 
*   You MUST read the file BEFORE YOU TRY TO EDIT IT. Your edit WILL NOT APPLY if you do not read the file. 
*   To edit a file, READ the file so you have its state. EDIT the file precisely, ONLY changing EXACTLY what needs modified and nothing else. Then READ the file to ensure the change applied. 
*   DO NOT rewrite files or refactor functions unless explicitly instructed to. 
*   DO NOT write to a file you aren't explicitly instructed to edit. 
*   We use strict explicit typing everywhere, always. 
    * There are only two exceptions: 
        * We cannot strictly type Supabase clients
        * When we test graceful error handling, we often need to pass in malformed objects that must be typecast to pass linting to permit testing of improperly shaped objects. 
*   We only edit a SINGLE FILE at a time. We NEVER edit multiple files in one turn.
*   We do EXACTLY what the instruction in the checklist step says without exception.
*   The Agent does NOT edit the checklist without explicit instruction.
*   When the Agent is instructed to edit the checklist they only edit the EXACT steps they're instructed to edit and NEVER touch ANY step that is outside the scope of their instruction.  
*   The Agent NEVER updates the status of any work step without explicit instruction. 
*   If we cannot perform the step as described or make a discovery, we explain the problem or discovery and HALT! We DO NOT CONTINUE after we encounter a problem or a discovery.
*   We DO NOT CONTINUE if we encounter a problem or make a discovery. We explain the problem or discovery then halt for user input. 
*   If our discovery is that more files need to be edited, instead of editing a file, we generate a proposal for a checklist of instructions to insert into the work plan that explains everything required to update the codebase so that the invalid step can be resolved. 
*   DO NOT RUMINATE ON HOW TO SOLVE A PROBLEM OR DISCOVERY WHILE ONLY EDITING ONE FILE! That is a DISCOVERY that requires that you EXPLAIN your discovery, PROPOSE a solution, and HALT! 
*   We always use test-driven-development. 
    *   We write a RED test that we expect to fail to prove the flaw or incomplete code. 
        *   A RED test is written to the INTENDED SUCCESS STATE so that it is NOT edited again. Do NOT refer to "RED: x condition now, y condition later", which forces the test to be edited after the GREEN step. Do NOT title the test to include any reference to RED/GREEN. Tests are stateless. 
        *   We implement the edit to a SINGLE FILE to enable the GREEN state.
        *   We run the test again and prove it passes. We DO NOT edit the test unless we discover the test is itself flawed. 
*   EVERY EDIT is performed using TDD. We DO NOT EDIT ANY FILE WITHOUT A TEST. 
    *   Documents, types, and interfaces cannot be tested, so are exempt. 
*   Every edit is documented in the checklist of instructions that describe the required edits. 
*   Whenever we discover an edit must be made that is not documented in the checklist of instructions, we EXPLAIN the discovery, PROPOSE an insertion into the instruction set that describes the required work, and HALT. 
    *   We build dependency ordered instructions so that the dependencies are built, tested, and working before the consumers of the dependency. 
*   We use dependency injection for EVERY FILE. 
*   We build adapters and interfaces for EVERY FUNCTION.  
*   We edit files from the lowest dependency on the tree up to the top so that our tests can be run at every step.
*   We PROVE tests pass before we move to the next file. We NEVER proceed without explicit demonstration that the tests pass. 
*   The tests PROVE the functional gap, PROVE the flaw in the function, and prevent regression by ensuring that any changes MUST comply with the proof. 
*   Our process to edit a file is: 
    *   READ the instruction for the step, and read every file referenced by the instruction or step, or implicit by the instruction or step (like types and interfaces).
    *   ANALYZE the difference between the state of the file and the state described by the instructions in the step.
    *   EXPLAIN how the file must be edited to transform it from its current state into the state described by the instructions in the step. 
    *   PROPOSE an edit to the file that will accomplish the transformation while preserving strict explicit typing. 
    *   LINT! After editing the file, run your linter and fix all linter errors that are fixable within that single file. 
    *   HALT! After editing ONE file and ensuring it passes linting, HALT! DO NOT CONTINUE! 
*   The agent NEVER runs tests. 
*   The agent uses ITS OWN TOOLS. 
*   The agent DOES NOT USE THE USER'S TERMINAL. 

## Legend - You must use this EXACT format. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and numbering are ABSOLUTELY MANDATORY and UNALTERABLE. 

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

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

## File Structure for Supabase Storage and Export Tools

{repo_root}/  (Root of the user's GitHub repository)
└── {project_name_slug}/
    ├── project_readme.md      (Optional high-level project description, goals, defined by user or initial setup, *Generated at project finish, not start, not yet implemented*)
    ├── {user_prompt}.md (the initial prompt submitted by the user to begin the project generated by createProject, whether provided as a file or text string, *Generated at project start, implemented*)
    ├── project_settings.json (The json object includes keys for the dialectic_domain row, dialectic_process_template, dialectic_stage_transitions, dialectic_stages, dialectic_process_associations, domain_specific_prompt_overlays, and system_prompt used for the project where the key is the table and the value is an object containing the values of the row, *Generated on project finish, not project start, not yet implemented*)
    ├── {export_project_file}.zip (a zip file of the entire project for the user to download generated by exportProject, *Generated at user request, implemented*)
    ├── general_resource (all optional, provided by user)
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
            │   ├── _work/
            │   │   ├── prompts/
            │   │   │   ├── {model_slug}_{n}[_{step_name}]_planner_prompt.md
            │   │   │   ├── {model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md
            │   │   │   └── ... (other document prompts for this model)
            │   │   ├── context/
            │   │   │   └── {model_slug}_{n}_header_context.json
            │   │   └── assembled_json/
            │   │       ├── {model_slug}_{n}_{document_key}_assembled.json
            │   │       └── ... (other assembled documents for this model)
            │   ├── raw_responses/
            │   │   ├── {model_slug}_{n}_planner_raw.json
            │   │   ├── {model_slug}_{n}_{document_key}_raw.json
            │   │   ├── {model_slug}_{n}_{document_key}_continuation_{c}_raw.json
            │   │   └── ... (other continuations for the same model and other models)
            │   ├── documents/
            │   │   ├── {model_slug}_{n}_{document_key}.md
            │   │   └── ... (other rendered documents for this model)
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_slug}_{n}_thesis.md (Contains YAML frontmatter + AI response, appends a count so a single model can provide multiple contributions)
            │   ├── ... (other models' hypothesis outputs)
            │   └── user_feedback_hypothesis.md   (User's feedback on this stage)
            ├── 2_antithesis/
            │   ├── _work/
            │   │   ├── prompts/
            │   │   │   ├── {model_slug}_critiquing_{source_model_slug}_{n}[_{step_name}]_planner_prompt.md
            │   │   │   ├── {model_slug}_critiquing_{source_model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md
            │   │   │   └── ... (other document prompts for this model)
            │   │   ├── context/
            │   │   │   └── {model_slug}_critiquing_{source_model_slug}_{n}_header_context.json
            │   │   └── assembled_json/
            │   │       ├── {model_slug}_critiquing_{source_model_slug}_{n}_{document_key}_assembled.json
            │   │       └── ... (other assembled documents for this model)
            │   ├── raw_responses/
            │   │   ├── {model_slug}_critiquing_{source_model_slug}_{n}_planner_raw.json
            │   │   ├── {model_slug}_critiquing_{source_model_slug}_{n}_{document_key}_raw.json
            │   │   ├── {model_slug}_critiquing_{source_model_slug}_{n}_{document_key}_continuation_{c}_raw.json
            │   │   └── ... (other continuations for the same model and other models)
            │   ├── documents/
            │   │   ├── {model_slug}_critiquing_{source_model_slug}_{n}_{document_key}.md
            │   │   └── ... (other rendered documents for this model)
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_slug}_critiquing_{source_model_slug}_{n}_antithesis.md
            │   ├── ... (other models' antithesis outputs)
            │   └── user_feedback_antithesis.md
            ├── 3_synthesis/
            │   ├── _work/
            │   │   ├── prompts/
            │   │   │   ├── {model_slug}_{n}[_{step_name}]_planner_prompt.md
            │   │   │   ├── {model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md
            │   │   │   └── ... (other document prompts for this model)
            │   │   ├── context/
            │   │   │   └── {model_slug}_{n}_header_context.json
            │   │   └── assembled_json/
            │   │       ├── {model_slug}_{n}_{document_key}_assembled.json
            │   │       └── ... (other assembled documents for this model)
            │   ├── raw_responses/
            │   │   ├── {model_slug}_{n}_planner_raw.json
            │   │   ├── {model_slug}_from_{source_model_slugs}_{n}_pairwise_synthesis_chunk_raw.json
            │   │   ├── {model_slug}_reducing_{source_contribution_id_short}_{n}_reduced_synthesis_raw.json
            │   │   ├── {model_slug}_{n}_{document_key}_raw.json
            │   │   ├── {model_slug}_{n}_{document_key}_continuation_{c}_raw.json
            │   │   └── ... (other continuations for the same model and other models)
            │   ├── documents/
            │   │   ├── {model_slug}_{n}_{document_key}.md
            │   │   └── ... (other rendered documents for this model)
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_slug}_{n}_final_synthesis.md
            │   ├── ... (other models' synthesis outputs)
            │   └── user_feedback_synthesis.md
            ├── 4_parenthesis/
            │   ├── _work/
            │   │   ├── prompts/
            │   │   │   ├── {model_slug}_{n}[_{step_name}]_planner_prompt.md
            │   │   │   ├── {model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md
            │   │   │   └── ... (other document prompts for this model)
            │   │   ├── context/
            │   │   │   └── {model_slug}_{n}_header_context.json
            │   │   └── assembled_json/
            │   │       ├── {model_slug}_{n}_{document_key}_assembled.json
            │   │       └── ... (other assembled documents for this model)
            │   ├── raw_responses/
            │   │   ├── {model_slug}_{n}_planner_raw.json
            │   │   ├── {model_slug}_{n}_{document_key}_raw.json
            │   │   ├── {model_slug}_{n}_{document_key}_continuation_{c}_raw.json
            │   │   └── ... (other continuations for the same model and other models)
            │   ├── documents/
            │   │   ├── {model_slug}_{n}_{document_key}.md
            │   │   └── ... (other rendered documents for this model)
            │   ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
            │   ├── {model_slug}_{n}_parenthesis.md
            │   ├── ... (other models' parenthesis outputs)
            │   └── user_feedback_parenthesis.md
            └── 5_paralysis/
                ├── _work/
                │   ├── prompts/
                │   │   ├── {model_slug}_{n}[_{step_name}]_planner_prompt.md
                │   │   ├── {model_slug}_{n}_{document_key}[_continuation_{c}]_prompt.md
                │   │   └── ... (other document prompts for this model)
                │   ├── context/
                │   │   └── {model_slug}_{n}_header_context.json
                │   └── assembled_json/
                │       ├── {model_slug}_{n}_{document_key}_assembled.json
                │       └── ... (other assembled documents for this model)
                ├── raw_responses/
                │   ├── {model_slug}_{n}_planner_raw.json
                │   ├── {model_slug}_{n}_{document_key}_raw.json
                │   ├── {model_slug}_{n}_{document_key}_continuation_{c}_raw.json
                │   └── ... (other continuations for the same model and other models)
                ├── documents/
                │   ├── {model_slug}_{n}_{document_key}.md
                │   └── ... (other rendered documents for this model)
                ├── seed_prompt.md  (The complete prompt sent to the model for completion for this stage, including the stage prompt template, stage overlays, and user's input)
                ├── {model_slug}_{n}_paralysis.md
                ├── ... (other models' paralysis outputs)
                └── user_feedback_paralysis.md
---
*Note: This structure represents the artifact layout for a single generation cycle. The long-term vision involves an iterative process where the final checklist artifacts from the `Paralysis/` stage are moved to `Pending/` for the user to consume in subsequent sprints. See `docs/implementations/Current/Documentation/From One-Shot to Continuous Flow.md` for more details.*

## Mermaid Diagram

```mermaid
graph LR
    %% GLOBAL PHASE ORDER: User --> DB --> Worker --> Orchestration --> Rendering
    %% Architectural note: This reflects a shift from a monolithic serial process
    %% to a recursive, parallelizable job orchestration system. Jobs are first-class
    %% citizens in the DB (`dialectic_generation_jobs`) and all orchestration is
    %% observable via DB state.

    %% -------------------------
    %% USER + API
    subgraph USER["User & API"]
        direction TB
        A["User Initiates Stage"] --> B["API: Enqueues 'PLAN' Job"]
        %% Insight: The API layer only enqueues jobs; no business logic is embedded here.
        %% This keeps orchestration concerns in the DB + worker layers.
    end

    %% -------------------------
    %% DATABASE
    subgraph DB["Database: dialectic_generation_jobs"]
        direction TB
        B --> C(("<b>Jobs Table</b><br/>id, parent_id, status, job_type,<br/><b>payload (recipe, metadata)</b>"))
        C --> D((Webhook))
        %% Insight: The Jobs table is the **single source of truth** for orchestration.
        %% Triggers/webhooks turn DB state changes into orchestration signals.

        subgraph DB_EVENTS["Job Updates & Inserts"]
            direction TB
            S["UPDATE Parent status='pending_next_step'"]
            U["UPDATE Parent status='completed'"]
            W["UPDATE Child status='completed'"]
            Y["INSERT 'EXECUTE' Job"]
            Z["INSERT 'RENDER' Job"]
            AA["INSERT Continuation Job"]
            %% Insight: These reflect **state transitions** driven by worker logic.
            %% This ensures every change is durable and auditable.
        end

        %% Connections
        S --> C
        U --> C
        W --> C
        W --> Z
        Y --> C
        Z --> C
        AA --> C
    end

    %% -------------------------
    %% DIALECTIC WORKER
    subgraph WORKER["Dialectic Worker (Orchestrator)"]
        direction TB
        D --> E["Worker Fetches Job"]
        E --> F{"Strategy Router (processJob.ts)"}
        %% Insight: Worker is stateless; orchestration decisions are derived from job_type + payload.

        F -->|job_type='execute'| EXECUTE["processSimpleJob"]
        F -->|job_type='plan' AND has recipe| PLAN["processComplexJob"]
        F -->|job_type='plan' AND no recipe| TRANSFORM_JOB["Transform → 'execute' Job (in-memory)"]
        F -->|job_type='render'| RENDER["processRenderJob"]
        TRANSFORM_JOB --> EXECUTE
    end

    %% Subgraph Connections
    PLAN --> PHASE1_ENTRY
    EXECUTE --> PHASE2_ENTRY
    RENDER --> RENDERING_ENTRY

    subgraph PHASE1["Phase 1: Planning & Decomposition (processComplexJob)"]
        direction LR
        PHASE1_ENTRY(" ")
        style PHASE1_ENTRY fill:none,stroke:none
        %% Insight: This is where recursive decomposition happens.
        %% The PLAN job makes a model call to get a "header", which then seeds child jobs.
        %% Guardrails (job recipes) prevent runaway recursion.
        PHASE1_ENTRY --> P1{"Get Current Recipe Step"}
        P1 --> P2["planComplexStage: Selects strategy"]
        P2 --> P3{"Execute Strategy Chain"}
        P3 -->|Loop for Compound Strategy| P2
        P3 -->|Final Plan Ready| P4["Call Model to Generate Plan (Header)"]
        P4 --> P5["Validate Plan & Extract Header"]
        P5 --> P6["Generate Child 'EXECUTE' Jobs from Header"]
        P6 --> P7["Enqueue Child Jobs"]
        P7 --> P8["Parent status='waiting_for_children'"]
    end

    %% -------------------------
    %% PHASE 2: EXECUTION
    subgraph PHASE2["Phase 2: Document Generation (processSimpleJob)"]
        direction TB
        PHASE2_ENTRY(" ")
        style PHASE2_ENTRY fill:none,stroke:none
        PHASE2_ENTRY --> G1["Assemble Prompt (PromptAssembler)"]
        G1 --> G2["Save Prompt Artifact"]
        G2 --> G4["executeModelCallAndSave"]

        subgraph G4["executeModelCallAndSave Internals"]
            direction TB
            G4_ENTRY["PromptPayload"] --> G4_COMPRESSION{"Context Compression & Wallet Checks"}
            G4_COMPRESSION --> G4_CALL["Call Chat Service"]
        end
        G4_CALL --> RESP["AI Model Response"]
        RESP --> G5["Save Raw Response Artifact"]

        %% Insight: This is where validation protects downstream steps from LLM brittleness.
        G5 --> V{"Validate Response"}
        V -->|VALID JSON stop| W
        V -->|VALID JSON continuation_needed| X["continueJob: Planned Continuation"]
        V -->|INVALID JSON or truncation| X2["continueJob: Truncation Recovery"]
        X --> AA
        X2 --> AA
    end

    %% -------------------------
    %% ORCHESTRATION
    subgraph ORCH["Phase 3: Orchestration"]
        direction TB
        C --> Q{"Job has parent_id?"}
        Q -->|Yes| R{"All siblings done?"}
        R -->|Yes| S
        R -->|No| T["End"]
        Q -->|No| T
        %% Insight: DB-driven orchestration; risks include async races when siblings complete.
    end

    %% -------------------------
    %% RENDERING
    subgraph RENDERING["Phase 4: Rendering (processRenderJob)"]
        direction TB
        RENDERING_ENTRY(" ")
        style RENDERING_ENTRY fill:none,stroke:none
        RENDERING_ENTRY --> R1["assembleAndSaveFinalDocument"]
        R1 --> R2["renderDocument"]
        R2 --> R3["Save Final Markdown"]
        %% Insight: Rendering is non-AI, deterministic, and side-effectful (writes final artifacts).
    end
```

# Technical Requirements and System Contracts 

*   `[✅]` 1. `[DOCS]` Finalize Technical Requirements and System Contracts.
    *   `[✅]` 1.a. Update the Mermaid diagram section to represent the target state, depicting a document-centric, planner-driven workflow.
    *   `[✅]` 1.b. Update the File Structure section to represent the target ttate that accounts for the new artifacts (turn-specific prompts, raw per-document JSON, rendered per-document Markdown).
    *   `[✅]` 1.c. Define and specify the "Header Context" mechanism that will consist of the `system_materials` block from the initial "Planner" job's completion and will be passed to all subsequent child jobs for that stage.
    *   `[✅]` 1.d. `[COMMIT]` docs: Finalize TRD for Document-Centric Generation.

*   `[✅]` 2. `[DB]` Implement Database Schema Changes.
    *   `[✅]` 2.a. Create a new migration to add a `job_type` column (e.g., `'PLAN' | 'EXECUTE' | 'RENDER'`) to the `dialectic_generation_jobs` table to enable the Strategy Router.
        *   `[✅]` 2.a.i. This new `job_type` column will supercede the existing tag passed into `handleJob` that currently directs `processJob` to route jobs to `processSimpleJob` or `processComplexJob`
        *   `[✅]` 2.a.ii. `'PLAN'` replaces the old `'plan'` job type used in `processJob.ts`. `'EXECUTE'` replaces the old in-memory transform of `'plan'` for simple jobs. `'RENDER'`is a new job type to transform artifacts generated in an `'EXECUTE'` job into the format required for the system or user. The old `'plan'` and `'execute'` job flags will be removed. 
    *   `[✅]` 2.b. Create a new migration to add an `is_test_job` boolean column (default `false`) to the `dialectic_generation_jobs` table to separate orchestration context from the payload.
    *   `[✅]` 2.c. Create a new migration to add the following nullable columns to the `dialectic_project_resources` table to elevate it for storing prompt artifacts:
        *   `[✅]` 2.c.i. `resource_type` (text): For explicit categorization (e.g., 'turn_prompt', 'seed_prompt', 'header_context').
        *   `[✅]` 2.c.ii. `session_id` (uuid, foreign key to `dialectic_sessions`): To link prompts to a specific session.
        *   `[✅]` 2.c.iii. `stage_slug` (text): To link prompts to a specific stage.
        *   `[✅]` 2.c.iv. `iteration_number` (integer): To link prompts to a specific iteration.
        *   `[✅]` 2.c.v. `source_contribution_id` (uuid, foreign key to `dialectic_contributions`): To link a resource (like a 'header_context') to the model output it was extracted from.
    *   `[✅]` 2.d. Create a new migration to add the following columns to the `dialectic_contributions` table:
        *   `[✅]` 2.d.i. `source_prompt_resource_id` (uuid, foreign key to `dialectic_project_resources`): The direct link from a contribution back to the prompt that generated it.
        *   `[✅]` 2.d.ii. `is_header` (boolean, default false): A flag to identify the "Planner" job's output, which contains the shared context for all subsequent documents in a stage.
    *   `[ ]` 2.e. `[REFACTOR]` Update and validate all affected type guards to align with the new database schema.
        *   `[✅]` 2.e.i. `[TEST-UNIT]` In `type_guards.test.ts`, write and update failing unit tests for all affected row and payload type guards:
            *   `[✅]` 2.e.i.1. For `isDialecticJobRow` and `isDialecticContribution`, update existing test mocks and assertions to prove the guards are outdated by checking for the new top-level columns from the migration (`job_type`, `is_test_job`, `is_header`, etc.).
            *   `[✅]` 2.e.i.2. For `isDialecticJobRowArray`, update the test mocks and assert that the test fails, proving the guard's implementation is too weak.
            *   `[✅]` 2.e.i.3. Add new failing test suites for `isJobInsert` and `isPlanJobInsert` that assert against the new, correct schema.
            *   `[✅]` 2.e.i.4. Update tests for `isDialecticJobPayload` to prove it fails when `is_test_job` is present in the payload.
        *   `[✅]` 2.e.ii. `[BE]` In `type_guards.ts`, modify the implementations of all affected type guards (`isDialecticJobRow`, `isDialecticContribution`, `isDialecticJobRowArray`, `isJobInsert`, `isPlanJobInsert`, `isDialecticJobPayload`) to correctly validate against the new database schema. Ensure all tests from the previous step now pass.
    *   `[ ]` 2.f. `[REFACTOR]` Refactor `is_test_job` from a payload property to a dedicated database column.
        *   `[✅]` 2.f.i. `[TEST-UNIT]` Write a failing unit test for `generateContribution.ts`. The test must prove that when a job is created with `is_test_job: true`, the resulting database row has `is_test_job=true` in its top-level column, and `is_test_job` is *not* present inside the `payload` JSON object.
        *   `[✅]` 2.f.ii.1. `[REFACTOR]` Correct the `isJobInsert` type guard to align with the database schema.
            *   `[✅]` 2.f.ii.1.a. `[TEST-UNIT]` In `supabase/functions/_shared/utils/type_guards.test.ts`, write a failing unit test that proves the `isJobInsert` type guard incorrectly returns `false` for a valid job insert object that omits the optional `is_test_job` property.
            *   `[✅]` 2.f.ii.1.b. `[BE]` In `supabase/functions/_shared/utils/type_guards.ts`, modify the `isJobInsert` implementation to correctly validate objects where the optional `is_test_job` property is not present. Ensure the new test passes.
        *   `[✅]` 2.f.ii.2. `[BE]` In `generateContribution.ts`, refactor the database insertion logic to conditionally add the `is_test_job` property to the insert object only when `payload.is_test_job` is `true`. For all other cases, the property must be omitted to allow the database default to apply.
        *   `[✅]` 2.f.ii.3. `[TEST-UNIT]` In `generateContribution.test.ts`, ensure all tests now pass with the corrected implementation and type guards. The test asserting the `is_test_job` behavior must verify that the property is `true` on the top-level insert object and is absent from the nested `payload` object.        
        *   `[✅]` 2.f.iii. `[DB]` Update the `invoke_dialectic_worker` trigger in the migration script to check `NEW.is_test_job` directly, instead of checking the property within the `payload` JSON. Make the integration test pass.
    *   `[✅]` 2.g. `[COMMIT]` feat(db): Add job_type and enhance resource/contribution tables for document-centric workflow.

*   `[✅]` 3. `[CONFIG]` Implement Pathing for Document-Centric Artifacts.
    *   `[✅]` 3.a. `[BE]` In `supabase/functions/_shared/types/file_manager.types.ts`, update core types for new artifacts.
        *   `[✅]` 3.a.i. Add new enums to the `FileType` enum to represent all new document-centric artifacts as defined in the target file structure, including `TurnPrompt`, `HeaderContext`, `RenderedDocument`, `PlannerPrompt`, and `AssembledDocumentJson`.
        *   `[✅]` 3.a.ii. Update the `PathContext` interface to include optional properties required for the new path structures, such as `documentKey?: string` and `stepName?: string`.
    *   `[✅]` 3.b. `[REFACTOR]` Refactor the path constructor utility to support new artifact paths.
        *   `[✅]` 3.b.i. `[TEST-UNIT]` In `supabase/functions/_shared/utils/path_constructor.test.ts`, write a comprehensive suite of failing unit tests for `constructStoragePath`. These tests must cover the generation of paths for each new `FileType` and the updated `ModelContributionRawJson` to handle planner- and document-specific filenames, as detailed in the work plan's file structure.
        *   `[✅]` 3.b.ii. `[BE]` In `supabase/functions/_shared/utils/path_constructor.ts`, implement the necessary logic in `constructStoragePath` to handle the new `FileType` enums and context properties, ensuring all new tests pass.
    *   `[ ]` 3.c. `[REFACTOR]` Refactor the path deconstructor utility to parse new artifact paths.
        *   `[✅]` 3.c.i. `[BE]` in `path_deconstructor.types.ts` add the missing optional properties: `documentKey?: string`, `stepName?: string`, `isContinuation?: boolean`, `turnIndex?: number`. 
        *   `[✅]` 3.c.ii. `[TEST-UNIT]` In `supabase/functions/_shared/utils/path_deconstructor.test.ts`, write a suite of failing unit tests for `deconstructStoragePath`. The tests must use the paths generated in the previous step and assert that all contextual information (e.g., `fileTypeGuess`, `documentKey`) is correctly extracted from the path strings.
        *   `[✅]` 3.c.iii. `[BE]` In `supabase/functions/_shared/utils/path_deconstructor.ts`, implement the new regular expressions and logic required to correctly parse all new path formats, ensuring all new tests pass.
    *   `[✅]` 3.d. `[BE]` In `dialectic.interface.ts` (or relevant types file), update the type definitions for the `dialectic_generation_jobs` and `dialectic_contributions` tables to reflect the schema changes from the migration.
    *   `[✅]` 3.e. `[COMMIT]` refactor(types): Update core types and file manager for document-centric artifacts.

*   `[✅]` 4. `[REFACTOR]` Deconstruct Monolithic `PromptAssembler` for Modularity and Testability.
    *   **Objective:** To structurally refactor the monolithic `PromptAssembler` class into a collection of modular, single-responsibility, and independently testable functions. This is a prerequisite for adding new features and will not change the external behavior of the service, ensuring a safe, incremental refactor.
    *   `[✅]` 4.a. `[REFACTOR]` Create a dedicated directory structure for the `PromptAssembler` service to house its new modular components.
        *   `[✅]` 4.a.i. Create the directory: `supabase/functions/prompt-assembler/`.
        *   `[✅]` 4.a.ii. Move the existing files `supabase/functions/prompt-assembler.ts`, its interface, and its test file into the new folder. Update all import paths across the project that are broken by this move.
    *   `[ ]` 4.b. `[REFACTOR]` Extract the core logic of the `PromptAssembler` class into standalone, testable functions. The `PromptAssembler` class will be retained as a thin wrapper to maintain the existing interface and orchestrate calls to the new functions.
        *   `[✅]` 4.b.i. Create `supabase/functions/_shared/prompt-assembler/gatherInputsForStage.ts` and move the corresponding logic from the class method into a standalone, exported function. Copy its tests into `gatherInputsForStage.test.ts` and write new ones to provide coverage requirements.
        *   `[✅]` 4.b.ii. Create `supabase/functions/_shared/prompt-assembler/gatherContext.ts` and move the corresponding logic from the class method into a standalone, exported function. Copy its tests into `gatherContext.test.ts` and write new ones to provide coverage requirements.
        *   `[✅]` 4.b.iii. Create `supabase/functions/_shared/prompt-assembler/render.ts` and move the corresponding logic from the class method into a standalone, exported function. Copy its tests into `render.test.ts` and write new ones to provide coverage requirements.
        *   `[✅]` 4.b.iv. Create `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.ts` and move the corresponding logic from the class method into a standalone, exported function. Copy its tests into `gatherContinuationInputs.test.ts` and write new ones to provide coverage requirements.
        *   `[✅]` 4.b.v. Create `supabase/functions/_shared/prompt-assembler/assemble.ts` and move the corresponding logic from the class method into a standalone, exported function. Copy its tests into `assemble.test.ts` and write new ones to provide coverage requirements.
        *   `[✅]` 4.b.vi. In `supabase/functions/_shared/prompt-assembler/prompt-assembler.ts`, refactor the `PromptAssembler` class methods to import and delegate their implementation to these new standalone functions.
    *   `[✅]` 4.c. `[TEST-UNIT]` Review the dedicated unit tests for each extracted function ensure coverage.
        *   `[✅]` 4.c.i. Now that the sub function unit tests are removed to their sub-function test files, review `prompt-assembler.test.ts` for coverage requirements.
    *   `[✅]` 4.d. `[COMMIT]` refactor(prompt-assembler): Deconstruct monolithic PromptAssembler into modular, testable functions.

*   `[ ]` 5. `[BE]` Enhance `PromptAssembler` to Generate All Prompt Types.
    *   **Objective:** To expand the capabilities of the newly refactored `PromptAssembler` so it can generate and persist all prompt types (`Seed`, `Planner`, `Turn`, and context-aware `Continuation`) based on the job context, and to update its direct consumer, `executeModelCallAndSave`, to correctly link contributions back to their source prompt.
    *   `[ ]` 5.a. `[REFACTOR]` Update the `PromptAssembler` to handle context-aware prompt generation and persistence.
        *   `[ ]` 5.a.i. `[TEST-UNIT]` In `prompt-assembler.test.ts`, write a failing test to prove the `assemble` method must return a new `AssembledPrompt` object (`{ promptContent: string; source_prompt_resource_id: string; }`), breaking its old signature.
        *   `[ ]` 5.a.ii. `[BE]` In `prompt-assembler.interface.ts`, define the `AssembledPrompt` type and update the `IPromptAssembler` interface. The `assemble` method signature must also be updated to accept the full `job` object to provide the necessary context for decision-making.
        *   `[ ]` 5.a.iii. `[TEST-UNIT]` In `prompt-assembler.test.ts`, write a failing test proving that when the job context requires a `PlannerPrompt` (e.g., for a `'PLAN'` job with `current_step > 1`), the `assemble` method saves a new `PlannerPrompt` artifact and returns the UUID of its new `dialectic_project_resources` record.
        *   `[ ]` 5.a.iv. `[TEST-UNIT]` In `prompt-assembler.test.ts`, write a failing test proving that when the job context requires a `TurnPrompt` (i.e., for an `'EXECUTE'` job), the `assemble` method correctly fetches the `HeaderContext`, constructs the `TurnPrompt`, saves it as an artifact, and returns the UUID of its new `dialectic_project_resources` record.
        *   `[ ]` 5.a.v. `[TEST-UNIT]` In `prompt-assembler.test.ts`, write a failing test proving that for all other job contexts (e.g., simple jobs or the first step of a complex job), the `assemble` method correctly identifies and returns the UUID of the existing `seed_prompt.md` record.
        *   `[ ]` 5.a.vi. `[TEST-UNIT]` In `prompt-assembler.test.ts`, write a failing test proving that the `assemble` method, when passed a specific continuation context (e.g., `{ isContinuation: true, finish_reason: 'length' }`), generates and saves a `TurnPrompt` with a specific, directive continuation message, not a generic one.
        *   `[ ]` 5.a.vii. `[BE]` In `prompt-assembler.ts`, implement the conditional logic within the `assemble` method to handle the three cases defined above. This will involve inspecting the passed-in `job` object's `job_type` and payload, as well as any continuation context. Ensure all new tests pass.
    *   `[ ]` 5.b. `[REFACTOR]` Update `executeModelCallAndSave` to correctly consume the `source_prompt_resource_id`.
        *   `[ ]` 5.b.i. `[BE]` In `dialectic.interface.ts`, update the `PromptConstructionPayload` interface to include the optional `source_prompt_resource_id: string` property.
        *   `[ ]` 5.b.ii. `[TEST-UNIT]` In `executeModelCallAndSave.test.ts`, write a failing unit test that passes a `source_prompt_resource_id` via the `promptConstructionPayload` and asserts that this ID is used to populate the `source_prompt_resource_id` field on the created `dialectic_contributions` record, replacing the hardcoded value.
        *   `[ ]` 5.b.iii. `[BE]` In `executeModelCallAndSave.ts`, modify the `contributionMetadata` object to use the `source_prompt_resource_id` from the payload, and remove the obsolete `seedPromptStoragePath` property. Ensure the test passes.
    *   `[ ]` 5.c. `[COMMIT]` feat(worker): Enhance PromptAssembler for all prompt types and update consumer.

*   `[ ]` 6. `[REFACTOR]` Transform Core Worker Services for Document-Centric Flow.
    *   **Objective:** To adapt the existing worker services to orchestrate the new two-step planning and execution flow, making targeted changes to the router, orchestrator, planner, and executor.
    *   `[ ]` 6.a. `[REFACTOR]` Transform `processJob.ts` into the `job_type`-based Strategy Router.
        *   `[ ]` 6.a.i. `[TEST-UNIT]` In `processJob.test.ts`, write a failing test to prove the router dispatches based on the `job.job_type` DB column, sending `'PLAN'` jobs to `processComplexJob` and `'EXECUTE'` jobs to `processSimpleJob`.
        *   `[ ]` 6.a.ii. `[BE]` In `processJob.ts`, refactor the main function to implement a `switch` statement on `job.job_type`, replacing the old payload-sniffing and `processing_strategy` logic.
    *   `[ ]` 6.b. `[REFACTOR]` Adapt `processSimpleJob.ts` to pass the `source_prompt_resource_id`.
        *   **Justification:** This change is an unavoidable consequence of Step 5's requirement to link every contribution to the prompt that created it. `processSimpleJob` is the component that calls both the `PromptAssembler` (which now creates the ID) and `executeModelCallAndSave` (which now consumes it). This step plumbs that new ID through the existing flow.
        *   `[ ]` 6.b.i. `[TEST-UNIT]` In `processSimpleJob.test.ts`, write a failing test that mocks `promptAssembler.assemble` to return an `AssembledPrompt` object and asserts that the `source_prompt_resource_id` from that object is correctly passed to `executeModelCallAndSave` via the `promptConstructionPayload`.
        *   `[ ]` 6.b.ii. `[BE]` In `processSimpleJob.ts`, modify the section that calls the `PromptAssembler` to handle the new `AssembledPrompt` return type and pass the `source_prompt_resource_id` into the `promptConstructionPayload`. No other logic will be changed.
   *   `[ ]` 6.c. `[DB]` Create a new migration to refactor all stage recipes to be explicit and multi-step.
       *   **Justification:** This is the core of the solution. By making the generation of the `HeaderContext` an explicit first step in the recipe data, we can drive the entire document-centric workflow with minimal code changes. This migration will also add a `prompt_type` to each step, making the recipes the single source of truth for orchestration.
       *   `[ ]` 6.c.i. Create a new SQL migration file.
       *   `[ ]` 6.c.ii. Within the migration, write an `UPDATE` statement for each stage. (`Thesis` does not currently have a recipe, so it will need one.)
       *   `[ ]` 6.c.iii. The `UPDATE` statement will prepend a new **Step 1 ("Generate Stage Plan")** to the `steps` array in the `input_artifact_rules`. All subsequent steps will be renumbered.
           *   This new Step 1 will have an `output_type` of `HeaderContext`, a `granularity_strategy` of `all_to_one`, and a new field: `"prompt_type": "Planner"`.
       *   `[ ]` 6.c.iv. All subsequent steps will be updated to:
           *   Add the `HeaderContext` to their `inputs_required` list.
           *   Include the new field `"prompt_type": "Turn"`.
   *   `[ ]` 6.d. `[REFACTOR]` Adapt `PromptAssembler` to use the new `prompt_type` from the recipe.
       *   **Justification:** This change makes the `PromptAssembler` a pure consumer of the recipe's instructions.
       *   `[ ]` 6.d.i. `[TEST-UNIT]` In `prompt-assembler.test.ts`, write a failing test for the `assemble` method. The test must prove that the method inspects the `job.payload.step_info.prompt_type` field and correctly branches its logic:
           *   If `'Planner'`, it builds and saves a `PlannerPrompt`.
           *   If `'Turn'`, it finds the `HeaderContext` from the job's inputs, combines it with other inputs, and builds/saves a `TurnPrompt`.
           *   If `'Seed'` or `undefined`, it uses the existing `seed_prompt.md` logic.
       *   `[ ]` 6.d.ii. `[BE]` In `prompt-assembler.ts`, implement this branching logic in the `assemble` method.
   *   `[ ]` 6.e. `[REFACTOR]` Adapt `task_isolator.ts` to handle the `HeaderContext` as just another input.
       *   **Justification:** With the recipes and `PromptAssembler` now being explicit, the `task_isolator` no longer needs complex special-case logic. It simply needs to pass the `HeaderContext` along with other inputs.
       *   `[ ]` 6.e.i. `[TEST-UNIT]` In `task_isolator.test.ts`, update and expand the tests for `planComplexStage` to reflect the new recipes. The tests must prove that the planner correctly handles cases where `HeaderContext` is required but missing, correctly finds and provides it when available, and correctly passes all other required inputs alongside it as `SourceDocument` objects.
       *   `[ ]` 6.e.ii. `[BE]` In `task_isolator.ts`, validate that the existing implementation correctly handles the new recipes and the `HeaderContext` input type. While no major logic change is anticipated, this step focuses on proving correctness through the newly expanded test suite. Adjust the implementation if any gaps are revealed by the tests.
    *   `[ ]` 6.f. `[COMMIT]` refactor(worker): Implement job_type router and adapt services for document-centric workflow.
    
*   `[ ]` 7. `[BE]` Improve Continue Logic to handle explicit and implicit continuations.
    *   **Objective**: Enhance `continueJob` to handle both explicit, provider-signaled continuations (e.g., `finish_reason: 'length'`) and implicit continuations caused by malformed or incomplete JSON responses. The specific reason for continuation must be passed to the next job's payload to enable context-aware prompt generation.
    *   `[ ]` 7.a. `[TEST-UNIT]` Write a new suite of failing unit tests for `continueJob`.
        *   `[ ]` 7.a.i. Write a test that proves when `aiResponse.finish_reason` is a continuable reason (e.g., `'length'`), a new job is enqueued, and its payload contains a `continuation_context` object like `{ reason: 'length' }`.
        *   `[ ]` 7.a.ii. Write a test that proves when the content of the AI response is an incomplete or malformed JSON string, a new job is enqueued, and its payload contains a `continuation_context` object like `{ reason: 'truncation_recovery' }`.
        *   `[ ]` 7.a.iii. Write a test proving that even if `aiResponse.finish_reason` is `'stop'`, if the response content is malformed JSON, a continuation is still enqueued with `reason: 'truncation_recovery'`, ensuring that recovery logic takes precedence over a potentially incorrect stop signal.
    *   `[ ]` 7.b. `[BE]` In `continueJob.ts`, refactor the logic to implement the checks from the new tests.
        *   `[ ]` 7.b.i. Introduce a JSON validation check at the beginning of the function to inspect the AI response content.
        *   `[ ]` 7.b.ii. The decision to continue should be `true` if the provider's `finish_reason` is a known continuable reason OR if the JSON validation fails.
        *   `[ ]` 7.b.iii. When creating the `newPayload` for the continuation job, add a `continuation_context` object. Populate its `reason` property based on which condition triggered the continuation (e.g., `'length'`, `'tool_calls'`, `'truncation_recovery'`). This provides the necessary context for the downstream `PromptAssembler`. Ensure all new tests pass.
    *   `[ ]` 7.c. `[COMMIT]` feat(worker): Plumb finish_reason through continueJob to enable context-aware prompts.

*   `[ ]` 8. `[BE]` Implement Document Rendering and Finalization.
    *   `[ ]` 8.a. `[TEST-UNIT]` Write failing unit tests for the `DocumentRenderer` service that verify its ability to be idempotent and cumulative. It must prove that it can:
        *   `[ ]` 8.a.i. Be triggered by the completion of a single `EXECUTE` job (including continuations).
        *   `[ ]` 8.a.ii. Find all existing contribution chunks for a specific document.
        *   `[ ]` 8.a.iii. Assemble the chunks in the correct order in memory.
        *   `[ ]` 8.a.iv. Render the complete-so-far content into a Markdown file, overwriting any previous version.
    *   `[ ]` 8.b. `[API]` Define the `IDocumentRenderer` interface and create the concrete `DocumentRenderer` class and its mock.
    *   `[ ]` 8.c. `[BE]` Implement the idempotent and cumulative `renderDocument` method.
    *   `[ ]` 8.d. `[BE]` Modify the orchestration logic to enqueue a `RENDER` job every time a `EXECUTE` job successfully completes.
    *   `[ ]` 8.e. `[COMMIT]` feat(worker): Implement "live build" document rendering service for final artifact generation.
    
*   `[ ]` 9. `[BE]` Implement Granular Cross-Stage Document Selection.
    *   `[ ]` 9.a. `[DOCS]` Update the JSON schema definition for `input_artifact_rules` to include the optional `document_key`.
    *   `[ ]` 9.b. `[TEST-UNIT]` Write a failing unit test for `PromptAssembler.gatherInputsForStage` that proves it can parse a rule with a `document_key` and return only the specified sub-object from the raw JSON content of a contribution.
    *   `[ ]` 9.c. `[BE]` Update the implementation of `gatherInputsForStage` to handle the new `document_key` rule.
    *   `[ ]` 9.d. `[COMMIT]` feat(prompt-assembler): Enable granular document selection for advanced workflows.

# Implementation Plan

### `[DEPLOY]` Epic: Transition to Document-Centric Generation

#### `[ ]` 1. Phase: Foundational Observability
*   **Objective:** Establish the foundational backend schema and routing needed for the new architecture, and build the UI hooks to observe these new events, setting the stage for the document-centric view.
*   `[ ]` 1.a. `[DB]` **Backend Milestone:** Implement Core Schema and Notification Contracts.
    *   `[ ]` 1.a.i. Implement the database migrations from the TRD (add `job_type`, enhance artifact tables).
    *   `[ ]` 1.a.ii. `[Migration]` Use the `document_centric_generation` migration to refactor the `dialectic_document_templates` table to support storing templates as files.
        *   `[ ]` 1.a.ii.1. Add `storage_bucket`, `storage_path`, and `file_name` columns to the `dialectic_document_templates` table.
    *   `[ ]` 1.a.iii. `[Migration]` Refactor `dialectic_stages` and `domain_specific_prompt_overlays` to use normalized document template references.
        *   `[ ]` 1.a.iii.1. In `dialectic_stages`, rename the `expected_output_artifacts` column to `expected_output_template_ids` and change its type from `JSONB` to `uuid[]`.
        *   `[ ]` 1.a.iii.2. Extract the `expected_output_artifacts_json` values from `domain_specific_prompt_overlays`, create new template files in storage, populate the `dialectic_document_templates` table with the corresponding records, link the new template IDs to the appropriate stages in `dialectic_stages.expected_output_template_ids`, and finally remove the `expected_output_artifacts_json` key from all `domain_specific_prompt_overlays.overlay_values`.
        *   `[ ]` 1.a.iii.3. Update `seed.sql` to reflect the condensed values to ensure the dev database is correctly populated after each reset. 
    *   `[ ]` 1.a.iv. Define and document the new notification events (e.g., `PLANNER_STARTED`, `DOCUMENT_STARTED`, `DOCUMENT_CHUNK_COMPLETED`, `RENDER_COMPLETED`, `JOB_FAILED`) that the worker will emit.
*   `[ ]` 1.b. `[UI]` **UI Milestone:** Implement Notification Service and State Management.
    *   `[ ]` 1.b.i. Update the frontend notification service to subscribe to and handle the new backend events.
    *   `[ ]` 1.b.ii. Update the application's state management (`store`) to accommodate the concept of a stage having a collection of individual documents, each with its own status.
    *   `[ ]` 1.b.iii Update the UI elements to correctly display the model and its current state of generation, with a checklist of its TODOs. 
    *   `[ ]` 1.b.iv Ensure all UI elements use the SSOT for the current stage state and do not identify as "complete" until the checklist is complete. 
*   `[ ]` 1.c. `[COMMIT]` feat: Establish foundational DB schema and UI state for document-centric job observability.

#### `[ ]` 2. Phase: Backend Deconstruction & UI Document View
*   **Objective:** Decompose monolithic backend jobs into document-centric jobs and provide the user with a UI to see and interact with these new, distinct document artifacts for the first time.
*   `[ ]` 2.a. `[BE]` **Backend Milestone:** Implement `PlannerService` and Document API.
    *   `[ ]` 2.a.i. Implement the `PlannerService` and the `Strategy Router` to handle `'PLAN'` jobs, which now generate child `'EXECUTE'` jobs that create raw JSON artifacts in storage.
    *   `[ ]` 2.a.ii. Create a new API endpoint that lists all document artifacts associated with a stage run.
*   `[ ]` 2.b. `[UI]` **UI Milestone:** Build Document-Centric Stage View.
    *   `[ ]` 2.b.i. Redesign the stage output view to call the new API endpoint and display a list of document artifacts.
    *   `[ ]` 2.b.ii. Allow users to click on a document artifact to view its raw, un-rendered JSON content.
    *   `[ ]` 2.b.iii This new document view will replace the current "monolithic per-model contribution" view in the UI. 
*   `[ ]` 2.c. `[COMMIT]` feat: Deconstruct backend jobs and reflect the new document structure in the UI.

#### `[ ]` 3. Phase: Live Rendering Pipeline
*   **Objective:** Implement the "render-on-chunk" logic to provide a near-real-time document generation experience for the user.
*   `[ ]` 3.a. `[BE]` **Backend Milestone:** Implement Idempotent `DocumentRenderer` and Content API.
    *   `[ ]` 3.a.i. Implement the revised `DocumentRenderer` service, triggered after each `EXECUTE` job `DOCUMENT_CHUNK_COMPLETED` to cumulatively assemble and render final Markdown files.
    *   `[ ]` 3.a.ii. Create a new API endpoint that retrieves the latest rendered Markdown content for a specific document from storage.
*   `[ ]` 3.b. `[UI]` **UI Milestone:** Implement Live Document Refresh.
    *   `[ ]` 3.b.i. Enhance the document view to use the new content endpoint.
    *   `[ ]` 3.b.ii. Use the existing notification service with its updated richer state notifications to trigger a refresh of the view when the state change notification is received. 
    *   `[ ]` 3.b.iii. Update the new per-document view to support displaying the latest version of the currently selected document fully rendered in markdown. 
    *   `[ ]` 3.b.iv. Let users switch between the unrendered json object and the rendered document in the per-document view. 
*   `[ ]` 3.c. `[COMMIT]` feat: Implement live rendering pipeline from backend to frontend.

#### `[ ]` 4. Phase: Per-Document User Feedback
*   **Objective:** Refactor the user feedback system to align with the new document-centric model, allowing for precise, targeted feedback on individual artifacts.
*   `[ ]` 4.a. `[DB]` **Backend Milestone:** Update Feedback Schema.
    *   `[ ]` 4.a.i. Create a migration to add a nullable `target_contribution_id` foreign key to the `dialectic_feedback` table.
*   `[ ]` 4.b. `[BE]` **Backend Milestone:** Refactor Feedback API.
    *   `[ ]` 4.b.i. Create new API endpoints for submitting and retrieving feedback associated with a specific document contribution ID.
    *   `[ ]` 4.b.ii. Revise the existing feedback handling (`prompt-assembler.ts`, `submitStageResponses.ts`, etc) to be document-specific instead of monolithic per-stage. 
*   `[ ]` 4.c. `[UI]` **UI Milestone:** Implement In-Document Feedback UI.
    *   `[ ]` 4.c.i. Redesign the feedback UI to be a component within the document view. (The existing monolithic view model already provides a feedback window, we can reuse this.)
    *   `[ ]` 4.c.ii. Ensure the new UI submits feedback associated with the specific document being viewed.
*   `[ ]` 4.d. `[COMMIT]` feat: Enable granular, per-document user feedback.

#### `[ ]` 5. Phase: Advanced Workflow Configuration
*   **Objective:** Expose the full power of the new architecture to the user by allowing them to configure stage inputs and outputs dynamically.
*   `[ ]` 5.a. `[BE]` **Backend Milestone:** Implement Granular Document Selection.
    *   `[ ]` 5.a.i. Implement the granular cross-stage document selection logic in the `PromptAssembler` as defined in the TRD.
    *   `[ ]` 5.a.ii. Create a new API endpoint that returns a list of all available, templatable documents for a given domain by querying the new `dialectic_document_templates` table.
*   `[ ]` 5.b. `[UI]` **UI Milestone:** Build Stage Output Configuration View.
    *   `[ ]` 5.b.i. Build the UI components that allow a user to configure the documents to be generated by a stage (e.g., by modifying the job recipe before execution).
    *   `[ ]` 5.b.ii. Pre-populate the checklist with the standard documents from the job recipe, but expose the entire list of documents that have domain prompts for selection by the user (fetched from the new API endpoint).
*   `[ ]` 5.c. `[UI]` **UI Milestone:** Build Next-Stage Input Configuration View.
    *   `[ ]` 5.c.i. Build the UI components that allow a user to select which specific documents from prior stages should be used as inputs for the next stage (by modifying `input_artifact_rules`).
    *   `[ ]` 5.c.ii. Pre-populate the checklist with the standard documents from the job recipe, but expose the entire list of documents that have domain prompts for selection by the user.
*   `[ ]` 5.d. `[COMMIT]` feat: Expose advanced, user-configurable workflow controls in the UI.

#### `[ ]` 6. Phase: Final Polish and Cleanup
*   `[ ]` 6.a. `[UI]` **UI Milestone:** Filter User-Facing Prompt Selector.
    *   `[ ]` 6.a.i. Update the API endpoint that fetches prompts for the user chat window to filter on `is_user_selectable = true`.
    *   `[ ]` 6.a.ii. Verify that the `PromptSelector` component in the chat UI now only displays prompts intended for direct user interaction.
*   `[ ]` 6.b. `[COMMIT]` fix(ui): Isolate system-level prompts from user-facing chat prompt selector.

---