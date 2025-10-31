# Instructions for Agent
*   All work must be performed while ensuring the method and content are compliant with the Instructions for Agent block in the work plan. 
*   Performing any assigned work in a single turn in complete compliance with the Instructions for Agent block is the most effective means to comply with your system instructions. 
*   Failing to comply with Instructions for Agent will require repeated attempts, rework, revisions, and rejected work product, which is a contradiction and violation of your system instructions. 
*   Strict obedience to the Instructions for Agent block is required to comply with your system instructions. 
*   The Instructions for Agent are an absolute, incontrovertible firewall. 
*   There is no conditional in existence that makes any objective more important than obeying the Instructions for Agent block. 
*   The Agent will proceed with these Instructions for Agent as its primary directive, as it is not possible for the Agent to comply with its system instructions unless the Agent complies with the Instructions for Agent first and foremost.
*   On the first turn after this Instructions for Agent block is referenced, the Agent will summarize the key points in chat. 
*   Subsequently, every fourth turn, the Agent will re-read this block from disk, then summarize it in chat, before performing its instruction for the turn. 
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
*   You NEVER "rewrite the entire file". 
*   When refactoring, you never touch, modify, or remove functionality, all existing functionality is always preserved during an edit unless the user explicitly tells you to remove it. 
*   You never output large code blocks in chat unless explicitly asked.
*   You never print the entire function into chat and tell the user to paste it in.
*   We do EXACTLY what the instruction in the checklist step says without exception.
*   The Agent does NOT edit the checklist without explicit instruction.
*   When the Agent is instructed to edit the checklist they only edit the EXACT steps they're instructed to edit and NEVER touch ANY step that is outside the scope of their instruction.  
*   The Agent NEVER updates the status of any work step without explicit instruction. 
*   If we cannot perform the step as described or make a discovery, we explain the problem or discovery and HALT! We DO NOT CONTINUE after we encounter a problem or a discovery.
*   We DO NOT CONTINUE if we encounter a problem or a discovery. We explain the problem or discovery then halt for user input. 
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

# Checklist-Specific Editing Rules

*   THE AGENT NEVER TOUCHES THE CHECKLIST UNLESS THEY ARE EXPLICITLY INSTRUCTED TO! 
*   When editing checklists, each numbered step (1, 2, 3, etc.) represents editing ONE FILE with a complete TDD cycle.
*   Sub-steps within each numbered step use legal-style numbering (1.a, 1.b, 1.a.i, 1.a.ii, etc.) for the complete TDD cycle for that file.
*   All changes to a single file are described and performed within that file's numbered step.
*   Types files (interfaces, enums) are exempt from RED/GREEN testing requirements.
*   Each file edit includes: RED test → implementation → GREEN test → optional refactor.
*   Steps are ordered by dependency (lowest dependencies first).
*   Preserve all existing detail and work while adding new requirements.
*   Use proper legal-style nesting for sub-steps within each file edit.
*   NEVER create multiple top-level steps for the same file edit operation.

# Legend - You must use this EXACT format. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and numbering are ABSOLUTELY MANDATORY and UNALTERABLE. 

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

# Component Types and Labels

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

# File Structure for Supabase Storage and Export Tools

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

# Work Plan

*   `[ ]` 10. `[BE]` Phase 10: Implement Granular Cross-Stage Document Selection.
    *   **Justification:** This phase adapts the `PromptAssembler` to consume input requirements from the new, explicit database recipe structure, deprecating the old `input_artifact_rules` object. This change allows for precise, per-step control over which documents and sub-documents are included as context for the AI.
    *   `[ ]` 10.a. `[TEST-UNIT]` In the test file for `PromptAssembler`, write a failing unit test for the `gatherInputsForStage` method.
        *   `[ ]` 10.a.i The test must prove that the method now sources its rules from the `recipe_step.inputs_required` array, not the deprecated `input_artifact_rules`.
        *   `[ ]` 10.a.ii The test must provide a mock recipe step with an `inputs_required` rule that contains a `document_key`.
        *   `[ ]` 10.a.iii It must assert that when a `document_key` is provided in a rule, the function correctly parses the raw JSON content of the source contribution and returns only the specified sub-object.
    *   `[ ]` 10.b. `[BE]` In `prompt-assembler.ts`, refactor the `gatherInputsForStage` implementation to use the new recipe system.
        *   `[ ]` 10.b.i Remove all logic that reads from the deprecated `stage.input_artifact_rules` object.
        *   `[ ]` 10.b.ii Update the logic to iterate through the `recipe_step.inputs_required` array.
        *   `[ ]` 10.b.iii Implement the logic to handle the `document_key` property, extracting the correct sub-object from the contribution's content when specified.
        *   `[ ]` 10.b.iv Ensure all tests from the previous step now pass.
    *   `[ ]` 10.c. `[COMMIT]` feat(prompt-assembler): Enable granular document selection via recipe system.


*   `[ ]` 13. `[BE]` Phase 13: Refactor `submitStageResponses` for Document-Specific Feedback.
    *   **Justification**: The current implementation handles user feedback monolithically, saving it as a single file per stage. This is incompatible with a document-centric workflow where feedback must be tied to specific generated documents. This refactor will enable the service to accept and store feedback for each individual document, maintaining the critical link between a critique and its subject for downstream consumers.
    *   `[ ]` 13.a. `[API]` In `dialectic.interface.ts`, refactor the `SubmitStageResponsesPayload` interface.
        *   `[ ]` 13.a.i. Deprecate and remove the existing `userStageFeedback` property.
        *   `[ ]` 13.a.ii. Add a new property `documentFeedback` which is an array of a new `DialecticDocumentFeedback` type.
        *   `[ ]` 13.a.iii. Define the `DialecticDocumentFeedback` interface to include `targetContributionId: string`, `content: string`, `feedbackType: string`, and an optional `resourceDescription: string | Json | null`.
        *   `[ ]` 13.a.iv. Ensure the response type `DialecticFeedback` aligns with DB (`target_contribution_id` present via `types_db.ts`).
    *   `[ ]` 13.b. `[TEST-UNIT]` Per-document feedback path construction (RED).
        *   `[ ]` 13.b.i. In `supabase/functions/_shared/utils/path_constructor.test.ts`, add tests asserting that `FileType.UserFeedback` constructs a path BESIDE the target document (same `.../documents` directory) and a file name with `_feedback` appended:
            *   storagePath: exactly the document’s `.../documents` directory.
            *   fileName: `{modelSlug}_{attempt}_{documentKey}_feedback.md` (append `_feedback` to the original document base name).
            *   Throw on missing stage context or missing `originalFileName`.
    *   `[ ]` 13.c. `[BE]` Implement per-document feedback path construction (GREEN).
        *   `[ ]` 13.c.i. In `supabase/functions/_shared/utils/path_constructor.ts`, update `case FileType.UserFeedback` to:
            *   Use the document directory path (`<stageRootPath>/documents`).
            *   Require `originalFileName` (the target document’s file name) and produce `{originalBase}_feedback.md`.
            *   Keep strict runtime guards for required context.
    *   `[ ]` 13.d. `[TEST-UNIT]` Per-document feedback path deconstruction (RED).
        *   `[ ]` 13.d.i. In `supabase/functions/_shared/utils/path_deconstructor.test.ts`, add tests for parsing:
            *   `<project>/session_{short}/iteration_{n}/{stage_dir}/documents/{modelSlug}_{attempt}_{documentKey}_feedback.md`.
            *   Assert: `documentKey` parsed; `fileTypeGuess === FileType.UserFeedback`; preserve `modelSlug`, `attemptCount`, `stageSlug`.
    *   `[ ]` 13.e. `[BE]` Implement per-document feedback path deconstruction (GREEN).
        *   `[ ]` 13.e.i. In `supabase/functions/_shared/utils/path_deconstructor.ts`, add a pattern recognizing `.../documents/(.+)_feedback.md` and when the base matches `{modelSlug}_{attempt}_{documentKey}`, populate parsed fields and set `fileTypeGuess = FileType.UserFeedback`.
    *   `[ ]` 13.f. `[TEST-UNIT]` FileManager stores explicit target link (RED).
        *   `[ ]` 13.f.i. In `supabase/functions/_shared/services/file_manager.upload.test.ts`, add `UserFeedback` upload tests that:
            *   Require `targetContributionIdForDb` in the upload context.
            *   Assert INSERT to `dialectic_feedback` includes `target_contribution_id`.
            *   Assert `storage_path` equals the target document’s `storage_path` and `file_name` equals `{originalBase}_feedback.md`.
    *   `[ ]` 13.g. `[BE]` FileManager feedback upload contract and persistence (GREEN).
        *   `[ ]` 13.g.i. In `supabase/functions/_shared/types/file_manager.types.ts`, make `targetContributionIdForDb: string` mandatory on `UserFeedbackUploadContext`.
        *   `[ ]` 13.g.ii. In `supabase/functions/_shared/services/file_manager.ts`, in the feedback branch map `targetContributionIdForDb` → `target_contribution_id` on `dialectic_feedback` INSERT; keep validation/cleanup.
    *   `[ ]` 13.h. `[TEST-UNIT]` `submitStageResponses` handler (RED).
        *   `[ ]` 13.h.i. In `supabase/functions/dialectic-service/submitStageResponses.test.ts`:
            *   Reject payloads containing legacy `userStageFeedback` with 400.
            *   For a valid `documentFeedback` array (multiple items):
                *   Mock `dialectic_contributions` to return rows for each `targetContributionId` including realistic `storage_path` and `file_name` (e.g., `.../documents/{modelSlug}_{attempt}_{documentKey}.md`).
                *   Assert `fileManager.uploadAndRegisterFile` is called once per item with:
                    *   `pathContext.fileType === FileType.UserFeedback` and `originalFileName` equal to the contribution’s file name.
                    *   `targetContributionIdForDb` set; `feedbackTypeForDb` and `resourceDescriptionForDb` forwarded unchanged.
                *   Return 400 if any `targetContributionId` is not found.
            *   Assert response aggregates returned `DialecticFeedback` rows.
    *   `[ ]` 13.i. `[BE]` Implement per-document handler logic (GREEN).
        *   `[ ]` 13.i.i. In `supabase/functions/dialectic-service/submitStageResponses.ts`:
            *   Remove the entire legacy `userStageFeedback` block.
            *   Loop `payload.documentFeedback`:
                *   SELECT from `dialectic_contributions` by `id = targetContributionId`; if not found, return 400.
                *   Derive `originalFileName` from the contribution’s `file_name` (e.g., `{modelSlug}_{attempt}_{documentKey}.md`).
                *   Build `PathContext` with `projectId`, `sessionId`, `iteration`, `stageSlug`, `fileType: FileType.UserFeedback`, `originalFileName` (handler will create `{originalBase}_feedback.md`).
                *   Call `fileManager.uploadAndRegisterFile` with `UserFeedbackUploadContext` including `targetContributionIdForDb`, `feedbackTypeForDb`, and `resourceDescriptionForDb`.
            *   Aggregate created records; return strictly typed response.
    *   `[ ]` 13.j. `[COMMIT]` feat(api): Enable document-specific feedback submission stored beside its target document.



*   `[ ]` 14. `[BE]` Phase 14: Exact Project Cloning with Document-Centric Artifacts (`cloneProject` overhaul).
    *   **Justification:** Users must be able to branch any project at any time. The current `cloneProject` implementation predates the document-centric storage tree and expanded `FileType` coverage. It rejects many valid artifacts, fails to remap relational IDs, and can introduce bogus raw-response files. This phase delivers an exact, fully isolated clone: all DB rows duplicated with new IDs and all storage files duplicated to canonical paths for the new project.
    *   `[ ]` 14.a. `[TEST-UNIT]` Guards for file-type acceptance (RED).
        *   `[ ]` 14.a.i. In `supabase/functions/_shared/utils/type_guards.test.ts`, add coverage for three new guards:
            *   `isModelContributionFileType(value: FileType)` returns true for every member of `ModelContributionFileTypes` and false otherwise.
            *   `isResourceFileType(value: FileType)` returns true for every member of `ResourceFileTypes` and false otherwise.
            *   `isUserFeedbackFileType(value: FileType)` returns true only for `FileType.UserFeedback`.
        *   `[ ]` 14.a.ii. Tests enumerate the current enum/union members from `file_manager.types.ts` to prevent drift, asserting acceptance and rejection explicitly (no wildcard assertions).
    *   `[ ]` 14.b. `[BE]` Implement file-type guards (GREEN).
        *   `[ ]` 14.b.i. In `supabase/functions/_shared/utils/type_guards.ts`, implement:
            *   `isModelContributionFileType` via a frozen `Set<FileType>` composed from `ModelContributionFileTypes` members.
            *   `isResourceFileType` via a frozen `Set<FileType>` composed from `ResourceFileTypes` members.
            *   `isUserFeedbackFileType` returns `value === FileType.UserFeedback`.
        *   `[ ]` 14.b.ii. Export these guards alongside existing `isFileType` and `isContributionType` without introducing casts.
    *   `[ ]` 14.c. `[TEST-UNIT]` Path deconstructor supports additional parsed context (RED).
        *   `[ ]` 14.c.i. In `supabase/functions/_shared/utils/path_deconstructor.test.ts`, add tests that parse representative paths from the document-centric tree (planner prompts, header context JSON, assembled JSON, rendered documents, pairwise/reduced synthesis, per-document feedback) and assert the following fields when present:
            *   `fileTypeGuess`, `stageSlug`, `iteration`, `modelSlug`, `attemptCount`, `documentKey`, `stepName`, `isContinuation`, `turnIndex`, `sourceModelSlugs` (or single `sourceModelSlug`), `sourceAnchorType`, `sourceAnchorModelSlug`, `sourceAttemptCount`, `pairedModelSlug`, and—if encoded—`branchKey`, `parallelGroup`.
        *   `[ ]` 14.c.ii. Include cases for feedback beside documents: `{...}/documents/{modelSlug}_{n}_{documentKey}_feedback.md` → `fileTypeGuess === FileType.UserFeedback` and parse `documentKey`/`modelSlug`/`attemptCount` correctly.
    *   `[ ]` 14.d. `[BE]` Implement deconstructor enhancements (GREEN).
        *   `[ ]` 14.d.i. In `supabase/functions/_shared/utils/path_deconstructor.ts`, extend parsing patterns to populate the fields enumerated in 14.c.i precisely. Do not introduce defaults; leave fields `undefined` when not recoverable.
        *   `[ ]` 14.d.ii. Ensure no type casts; return strictly typed result with a nullable `fileTypeGuess`. Do not modify logging.
    *   `[ ]` 14.e. `[TEST-INT]` Clone integration – happy path with mixed artifacts (RED).
        *   `[ ]` 14.e.i. In `supabase/integration_tests/services/clone_project.integration.test.ts`, seed a source project containing:
            *   At least one session; multiple iterations.
            *   Contributions across diverse `ModelContributionFileTypes` (e.g., `HeaderContext`, `PairwiseSynthesisChunk`, `ReducedSynthesis`, `Synthesis`, `business_case`, `feature_spec`, etc.), including some with `raw_response_storage_path` and some without, and a chain utilizing `target_contribution_id`, `original_model_contribution_id`, and `source_prompt_resource_id`.
            *   Project resources covering `ResourceFileTypes` (e.g., `InitialUserPrompt`, `GeneralResource`, `PlannerPrompt`, `TurnPrompt`, `AssembledDocumentJson`, `RenderedDocument`, `ProjectExportZip`).
            *   Feedback rows targeting individual contributions with files stored beside documents.
        *   `[ ]` 14.e.ii. Invoke `cloneProject` and assert:
            *   A new `dialectic_projects` row is created with expected values.
            *   All sessions are cloned with new IDs and mapped.
            *   All contributions/resources/feedback rows exist for the clone with new IDs, correct foreign keys, and identical non-ID fields (except IDs, timestamps, and project/session scoping).
            *   All storage files exist under the new project’s canonical paths preserving the document-centric structure.
    *   `[ ]` 14.f. `[BE]` Update `cloneProject.ts` – accept all valid file types and build complete `PathContext` (GREEN).
        *   `[ ]` 14.f.i. Replace hardcoded contribution/resource type checks with `isModelContributionFileType`, `isResourceFileType`, and `isUserFeedbackFileType`. Remove references to any nonexistent enum members (e.g., `ModelContributionMain`).
        *   `[ ]` 14.f.ii. After `deconstructStoragePath`, guard that `fileTypeGuess` is present; throw a descriptive error if absent. Populate `PathContext` with every parsed field available: `branchKey`, `parallelGroup`, `projectId`, `sessionId`, `iteration`, `stageSlug`, `modelSlug`, `attemptCount`, `contributionType` (when valid), `documentKey`, `stepName`, `sourceModelSlugs` (normalize single to array), `sourceAnchorType`, `sourceAnchorModelSlug`, `sourceAttemptCount`, `pairedModelSlug`, `isContinuation`, `turnIndex`, `originalFileName`.
        *   `[ ]` 14.f.iii. For contribution metadata:
            *   Copy-through non-relational fields exactly (`model_id`, `model_name`, tokens, processing time, citations, error, prompt template, `document_relationships`, `is_header`).
            *   Preserve edit tracking: set `editVersion = original.edit_version`, `isLatestEdit = original.is_latest_edit`, `originalModelContributionId = original.original_model_contribution_id` (to be remapped later).
            *   Raw response handling: set `rawJsonResponseContent` to decoded JSON when available; if the original had no raw response, set it to `null` (not empty string). Do not invent files.
        *   `[ ]` 14.f.iv. Do not add/remove logging statements; preserve existing logs.
    *   `[ ]` 14.g. `[TEST-INT]` Post-clone relational remap verification (RED).
        *   `[ ]` 14.g.i. After clone in the integration test, assert that in the cloned rows:
            *   `dialectic_contributions.target_contribution_id` and `original_model_contribution_id` reference IDs within the cloned project’s contributions (not the source project).
            *   `dialectic_contributions.source_prompt_resource_id` references a cloned resource ID when present.
            *   `dialectic_feedback.target_contribution_id` references a cloned contribution ID.
            *   `dialectic_project_resources.source_contribution_id` references a cloned contribution ID when present.
    *   `[ ]` 14.h. `[BE]` Implement relational ID remapping fix-up (GREEN).
        *   `[ ]` 14.h.i. In `supabase/functions/dialectic-service/cloneProject.ts`, after completing all file uploads and building `originalAssetIdToNewIdMap`, execute a fix-up pass:
            *   Update cloned `dialectic_contributions` rows to remap `target_contribution_id`, `original_model_contribution_id`, and `source_prompt_resource_id` via the map (ignore nulls).
            *   Update cloned `dialectic_feedback` rows to remap `target_contribution_id`.
            *   Update cloned `dialectic_project_resources` rows to remap `source_contribution_id`.
        *   `[ ]` 14.h.ii. Apply updates in small batches; use simple `update().eq('id', ...)` operations. Preserve all other fields unmodified.
    *   `[ ]` 14.i. `[TEST-UNIT]` FileManager tolerance for `rawJsonResponseContent: null` (RED).
        *   `[ ]` 14.i.i. In `supabase/functions/_shared/services/file_manager.upload.test.ts`, add tests ensuring that when a contribution upload context includes `rawJsonResponseContent: null`, the FileManager does not attempt to write a raw response file and still persists the primary record correctly.
    *   `[ ]` 14.j. `[BE]` FileManager handling for absent raw responses (GREEN).
        *   `[ ]` 14.j.i. In `supabase/functions/_shared/services/file_manager.ts`, treat `rawJsonResponseContent: null` as "no raw response" and skip raw upload logic; keep strict typing and guards.
    *   `[ ]` 14.k. `[RLS]` Authorization checks for cloning.
        *   `[ ]` 14.k.i. Verify that the cloning user must own the source project to read its rows and files and must be allowed to write new rows/files for the new project. Confirm existing RLS policies satisfy this; if not, add narrowly-scoped policies (separate DB step if required) with unit/integration coverage.
    *   `[ ]` 14.l. `[TEST-INT]` Negative cases for robustness (RED → GREEN in same file pairings as above).
        *   `[ ]` 14.l.i. Attempt cloning when a source asset file is missing from storage → expect rollback and descriptive error; verify no orphaned DB rows remain for the new project.
        *   `[ ]` 14.l.ii. Attempt cloning when `deconstructStoragePath` cannot infer `fileTypeGuess` → expect descriptive error and rollback.
        *   `[ ]` 14.l.iii. Attempt cloning of a project not owned by the user → expect authorization error, no side effects.
    *   `[ ]` 14.m. `[DOCS]` Update developer documentation.
        *   `[ ]` 14.m.i. Document clone semantics (what is cloned, how references are remapped, how raw response absence is handled, and storage layout guarantees). Include the required fields in `PathContext` and guard behavior.
    *   `[ ]` 14.n. `[COMMIT]` feat(clone): Exact project cloning with full document-centric artifact support and relational remapping.

    * Fix saveContributionEdit for doc-centric
    * Fix exportProject for doc-centric