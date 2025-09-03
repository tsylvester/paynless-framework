# Model Call Refinement 3: system instructions, output artifacts, and convergent final stages. 

## Problem Statement
- Stage prompts are not optimized for their expected utility. 
- The Parenthesis and Paralysis stages branch, instead of staying coherent. 
- The application does not provide a System Instructions prompt to ensure models provide desired documents. 
- Documents generated are not fully aligned to project needs & FAANG/startup documentation quality or ordering 

## Objectives
- Convergent logic for final stages 
- Optimized stage prompts
- System Instructions detailing stage specific output artifacts 
- Formatting requirements for iteratable implementation plans 
    - High level milestones -> intermediate signposting / sprints -> low level checklist steps 
    - Phases & Milestones at the beginning, then is interpolated with signposts & sprints. 
    - At each iteration another signpost / sprint section is filled in with prompt checklists for implementation
    - This is iterated until the full project is complete
- Github integration for exporting plans to projects 
- Site builder integration for beginning projects 
-- Bolt.new
-- Lovable.dev
-- v0
-- Replit

## Expected Outcome
- Stage prompts emulate a FAANG style production process optimized for startups / small teams / solo coders
- System Instructions explains to agent how to build artifacts for the stage
- Artifacts can be reprocessed for next iteration/phase 
- Users can sync their plans to their repo
- Users can immediately launch a project using the plans 


## Instructions for Agent
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

## Stage Prompt Optimization

### Proposal (Thesis) Stage
- Each agent generates a project proposal based on user's input

#### Input
- User prompt
- System inputs (domain, prompt overlays, isntructions) 

#### Output
- Business case w/ market opportunity, user problem validation, competitive analysis
- MVP feature specification with user stories
- High-level technical approach overview

### Review (Antithesis) Stage
- Each agent performs comparative analysis, feasibility analysis, and risk assessment of each proposal 

#### Input
- Proposal (Thesis) outputs 
- User feedback
- System inputs

#### Output
- Comparative analysis between options provided
- Technical feasibility assessment with identified risks & mitigation strategies 
- Risk register & non-functional requirements
- Dependency map 

### Refinement (Synthesis) Stage
- Each agent synthesizes multiple proposals into product requirements and draft technical plan

#### Input
- All Proposals (Thesis), Reviews (Antithesis), and user feedback
- System inputs 

#### Output
- A PRD with a revised MVP description, user stories, and feature specifications. 
- System architecture overview
- Tech stack recommendations 

### Planning (Parenthesis) Stage
- Each agent produces a TRD, project plan, and master plan for each proposal.  

#### Input
- Refinement (Synthesis) stage outputs
- User feedback

#### Output
- TRD incl. subsystem design, API, schema, proposed file tree, detailed technical architecture
- Project roadmap w/ milestones & dependencies that implements MVP PRD/TRD. 
- Master Plan for iterative generation & progress tracking

### Implementation (Paralysis) Stage
- Each agent generates a WBS, backlog, and master plan for each proposal. 

#### Input
- Planning (Parenthesis) stage outputs 
- User feedback

#### Output
- Work breakdown structure in the form of a checklist of prompts to feed to an agent / developer
-- Structured, dependency-ordered, TDD ordered, one-file-per-step.   
- Updated Master Plan reflecting WBS & backlog  

## Fix `Export` & Add to Beside `Submit Response`
[✅] 1. [TEST-UNIT] Create `ExportProjectButton` component tests
    [✅] a. [UI] File: `apps/web/src/components/dialectic/ExportProjectButton.test.tsx`
        [✅] i. Renders a button, disabled while exporting, shows spinner/aria-busy.
        [✅] ii. Calls `useDialecticStore().exportDialecticProject(projectId)` with provided `projectId`.
        [✅] iii. On success with `{ export_url }`, triggers a browser download (e.g., programmatic anchor click to the signed URL).
        [✅] iv. On error, surfaces a toast/error message without navigation.

[✅] 2. [UI] Implement `ExportProjectButton` as a self-managing component
    [✅] a. File: `apps/web/src/components/dialectic/ExportProjectButton.tsx`
        [✅] i. Props: `projectId: string`, optional `variant/size` passthrough to match UI buttons.
        [✅] ii. Internally calls `exportDialecticProject(projectId)`; on success, creates a temporary `<a href={export_url} download />` and clicks it; restores state.
        [✅] iii. Shows loading state; handles errors via the app’s logger/toast.
    [✅] b. [COMMIT] feat(ui): add self-managing ExportProjectButton

[✅] 3. [TEST-UNIT] Update `DialecticProjectCard` tests for composition
    [✅] a. File: `apps/web/src/components/dialectic/DialecticProjectCard.test.tsx`
        [✅] i. Assert the Export button renders via the new component (mock it) and is clickable.

[✅] 4. [UI] Replace inline export logic in `DialecticProjectCard` with `ExportProjectButton`
    [✅] a. File: `apps/web/src/components/dialectic/DialecticProjectCard.tsx`
        [✅] i. Remove `handleExport`; render `<ExportProjectButton projectId={project.id} />`.
    [✅] b. [COMMIT] refactor(ui): use ExportProjectButton inside DialecticProjectCard

[✅] 5. [TEST-UNIT] Add Export button on the session page
    [✅] a. Files:
        [✅] i. `apps/web/src/components/dialectic/SessionContributionsDisplayCard.test.tsx`
            - Assert Export button is present for any session view (always available).
    [✅] b. [UI] Add `ExportProjectButton` to session UI
        [✅] i. File: `apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx` (or `DialecticSessionDetails.tsx` header)
            - Render `<ExportProjectButton projectId={currentProjectDetail.id} />` whenever a project is active.
    [✅] c. [COMMIT] feat(ui): add ExportProjectButton to session page header

[✅] 6. [TEST-UNIT] Replace “Submit Responses” with “Export Project” at Implementation end
    [✅] a. File: `apps/web/src/components/dialectic/SessionContributionsDisplayCard.test.tsx`
        [✅] i. When `useDialecticStore().activeContextStage?.slug === 'paralysis'`, assert Submit button is hidden and Export button is shown instead.
    [✅] b. [UI] Conditional rendering
        [✅] i. File: `apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx`
            - If `activeContextStage?.slug === 'paralysis'`, hide “Submit Responses & Advance Stage” and render `ExportProjectButton`.
    [✅] c. [COMMIT] feat(ui): swap submit for export at final (paralysis) stage

[✅] 7. [TEST-UNIT] Strengthen backend export TDD around FileManager integration
    [✅] a. File: `supabase/functions/dialectic-service/exportProject.test.ts`
        [✅] i. Assert `uploadAndRegisterFile` is called once with `fileType: project_export_zip` and `originalFileName` set (derives from project name).
        [✅] ii. On upload failure, verify error code `EXPORT_FM_UPLOAD_FAILED` and message “Failed to store project export file using FileManager.”
        [✅] iii. On success, assert `createSignedUrlForPath` uses `fileRecord.storage_bucket` and the `storage_path/file_name`.

[✅] 8. [BE] Export robustness and error clarity (single file)
    [✅] a. File: `supabase/functions/dialectic-service/exportProject.ts`
        [✅] i. No functional change if tests pass; otherwise:
            - Add explicit log for missing `SB_CONTENT_STORAGE_BUCKET` caught via `FileManagerService` throw (already throws). Ensure fmError.details propagate into `details`.
            - Keep `FileType.ProjectExportZip` and current UploadContext; do not alter file tree ownership (remains with `file_manager.ts`).
    [✅] b. [COMMIT] fix(be): clearer error propagation for exportProject upload failures

[✅] 9. [TEST-INT] Frontend download handoff
    [✅] a. File: `packages/api/src/dialectic.api.integration.test.ts`
        [✅] i. Assert `exportProject` posts `{ action: 'exportProject', payload: { projectId } }` and returns `{ export_url }`.
    [✅] b. File: `packages/store/src/dialecticStore.integration.test.ts`
        [✅] i. Assert store sets loading/error states and returns `{ export_url }` to the component.
    [✅] c. [COMMIT] test(int): API/store integration for export and URL handoff

[✅] 10. [UI] Optional: user feedback on export completion
    [✅] a. File: `ExportProjectButton.tsx`
        [✅] i. After triggering download, show a “Export started” toast; handle `exportProjectError` in store and show a failure toast.

[✅] 11. [TEST-UNIT] Prove FileManager registration bug for project export
    [✅] a. File: `supabase/functions/_shared/services/file_manager.upload.test.ts`
        [✅] i. Add a test for `FileType.ProjectExportZip` where storage upload succeeds but `dialectic_project_resources.insert` returns a PostgREST-style error (include `code` and `details`).
        [✅] ii. Assert `uploadAndRegisterFile` returns `{ record: null, error }` with `error.message === 'Database registration failed after successful upload.'` and `error.details` containing the DB `code/details`.
        [✅] iii. Assert cleanup attempts to remove the uploaded file (verify `storage.remove` called with the uploaded path).

[✅] 12. [BE] Fix FileManager registration for project export JSON and error propagation
    [✅] a. File: `supabase/functions/_shared/services/file_manager.ts`
        [✅] i. Persist `resource_description` as a JSON object (not a string) for `dialectic_project_resources` rows; include `{ type: 'project_export_zip', originalDescription? }` (or merged parsed JSON when provided).
        [✅] ii. Improve error propagation: when insert fails, include PostgREST `details`/`code` in `error.details`.
    [✅] b. [COMMIT] fix(be): FileManager export registration JSON + clearer DB error details

[✅] 13. [TEST-UNIT] Validate happy path for project export registration
    [✅] a. File: `supabase/functions/_shared/services/file_manager.upload.test.ts`
        [✅] i. Add/extend a passing test for `project_export_zip` asserting:
            - Insert payload uses `storage_path/file_name` from `constructStoragePath`.
            - `resource_description` includes `{ type: 'project_export_zip', ... }` as JSON (not string).
            - Returns `{ record }` without error.

[ ] 14. [TEST-INT] Backend integration: exportProject ↔ FileManager
    [ ] a. File: `supabase/integration_tests/services/export_project.integration.test.ts`
        [ ] i. Re-run with real functions: assert `{ export_url }` returned and a `.zip` resource exists for the project (latest rows), no 500 error.
    [ ] b. [COMMIT] test(int): export integration succeeds with FileManager registration

[✅] 15. [TEST-INT] RED: prove unique-constraint collision at project root
    [✅] a. File: `supabase/integration_tests/services/export_project.integration.test.ts`
        [✅] i. Add a test that first registers `initial_user_prompt` at project root, then attempts to export the project (export stored at project root per `@file_manager.md`).
        [✅] ii. Assert current behavior returns a 500 from `exportProject` with details indicating a unique constraint on `(storage_bucket, storage_path)`.
        [✅] iii. This documents the real user error observed in manual testing.

[✅] 16. [TEST-UNIT] RED: define desired overwrite semantics and deterministic export filename
    [✅] a. File: `supabase/functions/dialectic-service/exportProject.test.ts`
        [✅] i. Assert that the export filename is deterministic: `project_export_{slug}.zip` (no timestamp), stored at the project root path.
        [✅] ii. Assert FileManager is invoked such that storage upload uses `upsert: true` and DB registration performs an upsert on conflict keys so repeated exports overwrite the same record.
        [✅] iii. This will fail until code and schema changes are made.

[✅] 17. [DB-MIGRATION] Update uniqueness to allow multiple files at the same root path
    [✅] a. File: `supabase/migrations/*_dialectic_project_resources_unique_path_fix.sql`
        [✅] i. Drop existing unique constraint/index on `(storage_bucket, storage_path)` for `public.dialectic_project_resources`.
        [✅] ii. Create a new unique index/constraint on `(storage_bucket, storage_path, file_name)` to allow multiple files under the same directory.
        [✅] iii. Include a safe IF EXISTS check for dropping and name the new constraint consistently (e.g., `unique_bucket_path_file_name`).

[✅] 18. [BE] Implement overwrite behavior for exports at project root
    [✅] a. File: `supabase/functions/dialectic-service/exportProject.ts`
        [✅] i. Generate `originalFileName` as `project_export_{slug}.zip` (no timestamp) so the export is a single, stable artifact per project.
        [✅] ii. Ensure `FileManagerService` is called with that filename and description `{ type: 'project_export_zip', ... }`.
    [✅] b. File: `supabase/functions/_shared/services/file_manager.ts`
        [✅] i. For `fileType: 'project_export_zip'`, use DB `upsert` (not `insert`) with `onConflict: ['storage_bucket','storage_path','file_name']` so the record is overwritten if it already exists.
        [✅] ii. Storage upload should continue to use `upsert: true` so the zip file content is overwritten atomically.

[✅] 19. [TEST-INT] GREEN: export coexists with initial prompt at root and overwrites on repeat
    [✅] a. File: `supabase/integration_tests/services/export_project.integration.test.ts`
        [✅] i. Re-run the step-15 scenario; assert success (200), and both `initial_user_prompt` and `project_export_zip` rows exist for the project.
        [✅] ii. Call `exportProject` twice; assert only one `project_export_zip` row remains (or that the same row is updated), and storage reflects the latest content.

[ ] 20. [DOCS] Align file tree and uniqueness policy
    [ ] a. File: `supabase/functions/_shared/services/file_manager.md`
        [ ] i. Confirm documentation reflects exports stored at project root and uniqueness by `(bucket, path, file_name)` with overwrite behavior for deterministic export filenames.

[✅] 21. [TEST-UNIT] Export UI downloads without navigation and with correct filename
    [✅] a. File: `apps/web/src/components/dialectic/ExportProjectButton.test.tsx`
        [✅] i. Add a test asserting that when `export_url` is cross-origin, the component:
            - Calls `fetch(export_url)` and receives a Blob response.
            - Creates an object URL via `URL.createObjectURL` and clicks an anchor with the `download` attribute.
            - Does not call `window.location.assign` or `window.open`.
            - Calls `URL.revokeObjectURL` after triggering the click.
        [✅] ii. Add a test for filename extraction from `Content-Disposition` (supports `filename=` and RFC5987 `filename*=`) and asserts the anchor `download` name uses the decoded filename; fallback to `project_export.zip` when header is absent.
    [✅] b. [COMMIT] test(ui): ExportProjectButton uses blob/object URL; no navigation; preserves filename

[✅] 22. [UI] Implement blob/object-URL download flow in ExportProjectButton
    [✅] a. File: `apps/web/src/components/dialectic/ExportProjectButton.tsx`
        [✅] i. On success, `fetch` the signed `export_url`, build a `Blob`, create an object URL, and programmatically click an anchor with `rel="noopener"` and `download` set to the parsed filename or `project_export.zip`.
        [✅] ii. Revoke the object URL after the click (defer revocation to the next tick).
        [✅] iii. Do not navigate (do not set `window.location` or use `target` navigation).
    [✅] b. [COMMIT] fix(ui): export uses blob/object URL to trigger browser download UI

[✅] 23. [TEST-UNIT] Verify regression guard for navigation
    [✅] a. File: `apps/web/src/components/dialectic/ExportProjectButton.test.tsx`
        [✅] i. Add a test that spies on `window.location.assign` and `window.open` to assert neither is called during export.
    [✅] b. [COMMIT] test(ui): guard against navigation during export download

[✅] 24. [TEST-UNIT] exportProject propagates FileManager error.details
    [✅] a. File: `supabase/functions/dialectic-service/exportProject.test.ts`
        [✅] i. In the FileManager failure test, assert returned error includes `details` equal to the FileManager error `details` string (not undefined).
    [✅] b. File: `supabase/functions/dialectic-service/exportProject.ts`
        [✅] i. When `uploadAndRegisterFile` fails, set `details` to `fmError?.details || fmError?.message` so the client sees specifics.
    [✅] c. [COMMIT] fix(be): upsert export resource and propagate fm error details

[✅] 25. [TEST-UNIT] FileManager upserts DB record for project_export_zip
    [✅] a. File: `supabase/functions/_shared/services/file_manager.upload.test.ts`
        [✅] i. Add a test that when inserting a `project_export_zip` row that already exists (same `(storage_bucket, storage_path, file_name)`), the DB call performs an upsert and returns the updated record without error.
        [✅] ii. Assert storage upload uses `{ upsert: true }`.
    [✅] b. File: `supabase/functions/_shared/services/file_manager.ts`
        [✅] i. For `fileType: 'project_export_zip'`, use `upsert` with `onConflict: ['storage_bucket','storage_path','file_name']` for `dialectic_project_resources`.
        [✅] ii. Ensure storage upload passes `{ upsert: true }` so the blob overwrites.

[ ] 26. [TEST-INT] GREEN: export succeeds and returns URL after upsert fix
    [ ] a. File: `supabase/integration_tests/services/export_project.integration.test.ts`
        [ ] i. Re-run export with an existing export at root; assert 200, `{ export_url }` present, and only one `project_export_zip` row exists (updated).
    [ ] b. [COMMIT] test(int): export succeeds post-upsert and details propagation

[ ] 27. [TDD] Export download URL normalization (dev and prod)
    [✅] a. Problem: The signed URL may use an internal gateway host (e.g., `kong`) that browsers cannot resolve; users see network errors. Objective: Always return a browser-resolvable URL using the public Supabase base while preserving path and token.
    [✅] b. [TEST-UNIT] File: `supabase/functions/_shared/supabase_storage_utils.test.ts`
        [✅] i. Given `SUPABASE_URL` and a mocked `createSignedUrl` returning `http://kong:8000/storage/v1/object/sign/...?...`, expect `createSignedUrlForPath` to return `${SUPABASE_URL}/storage/v1/object/sign/...?...` with identical pathname/query (token unchanged).
        [✅] ii. When the returned URL already uses the public base, expect the function to return a URL with the same origin/path/query (no change in behavior).
    [✅] c. [SRC] File: `supabase/functions/_shared/supabase_storage_utils.ts`
        [✅] i. After successful `createSignedUrl`, normalize: determine `publicBase = Deno.env.get('SUPABASE_URL')`; compute `storagePublicBase = new URL('/storage/v1', publicBase)`; parse original URL and rebuild as `storagePublicBase.origin + original.pathname.replace(/^.*\/storage\/v1/, '/storage/v1') + original.search`.
    [✅] d. [TEST-INT] File: `supabase/integration_tests/services/export_project.integration.test.ts`
        [ ] i. Extend assertion to verify the `export_url` host matches the configured public base host and includes the expected `/storage/v1/object/sign/` path and token query.
    [ ] e. [COMMIT] fix(be): normalize storage signed URLs to public base to avoid internal hostnames
    [✅] f. [TEST-UNIT] API wiring uses normalized signed URL for exportProject (RED)
        [✅] i. File: `supabase/functions/dialectic-service/index.test.ts`
            - Under `withSupabaseEnv`, set `SUPABASE_URL` to `http://localhost:54321`.
            - Mock storage `createSignedUrl` to return `http://kong:8000/storage/v1/object/sign/...?...`.
            - Call `handleRequest` with action `"exportProject"` and assert the JSON `export_url` origin equals `SUPABASE_URL` and the `/storage/v1/object/sign/...` path and token are preserved.
            - Expect failure (proves handler is not using normalized util).
    [✅] g. [SRC] Wire normalized util in API handler
        [✅] i. File: `supabase/functions/dialectic-service/index.ts`
            - In the `"exportProject"` case, replace `createSignedUrlDefaultFn` with `createSignedUrlForPath` imported from `../_shared/supabase_storage_utils.ts`.
    [✅] h. [TEST-UNIT] GREEN: API wiring returns normalized URL
        [✅] i. Re-run 27.f test; assert it now passes with normalized origin and preserved `/storage/v1/object/sign/...` path and query.
    [✅] i. [TEST-UNIT] Normalize when SUPABASE_URL itself is internal (RED)
        [✅] i. File: `supabase/functions/_shared/supabase_storage_utils.test.ts`
            - Case A: `SUPABASE_URL = http://kong:8000`, storage returns `http://kong:8000/storage/v1/object/sign/...?...`.
              Expect `createSignedUrlForPath` → `http://localhost:54321/storage/v1/object/sign/...?...` with identical path/query.
            - Case B: `SUPABASE_URL = http://host.docker.internal:54321`, storage returns same host.
              Expect normalized `http://localhost:54321/storage/v1/object/sign/...?...` (preserve port and query).
    [✅] j. [SRC] Implement internal→localhost normalization (GREEN)
        [✅] i. File: `supabase/functions/_shared/supabase_storage_utils.ts`
            - If original hostname OR `SUPABASE_URL` hostname is internal (`kong`, `host.docker.internal`):
              derive `normalizedPublicBase` by swapping hostname to `localhost`, preserving port (fallback to 54321 if no port).
              Rebuild `${normalizedPublicBase}/storage/v1...` with original pathname suffix and query.
            - Otherwise, keep existing behavior.
            - Enable console diagnostics in `createSignedUrlForPath` for this test scope: log redacted original URL (`replace(/(token=)[^&]+/, '$1REDACTED')`), `SUPABASE_URL`, `original.hostname`, `publicBase.origin`, `isInternal`, and the redacted normalized URL.
    [✅] k. [TEST-INT] Verify normalized URL via API
        [✅] i. File: `supabase/functions/dialectic-service/index.test.ts`
            - Under `withSupabaseEnv` set `SUPABASE_URL` to an internal host; mock storage to return an internal signed URL.
              Call `handleRequest("exportProject")`; assert the returned `export_url` begins with `http://localhost:54321/storage/v1/...` and query token is preserved.
            - Capture and assert presence of the storage utils/export service log lines (with token redacted) confirming: original URL host, `SUPABASE_URL`, internal-host detection, and final returned URL.
[ ] 28. [TDD] Remove filename fallback; pass exact export file name unchanged
    [✅] a. Problem: Frontend uses a default 'project_export.zip' when Content-Disposition is absent, violating no-fallbacks. Objective: Always use the exact file name returned by the backend; if missing, fail (no download).
    [✅] b. [TEST-UNIT] Backend: `supabase/functions/dialectic-service/exportProject.test.ts`
        [ ] i. Assert exportProject returns `{ data: { export_url, file_name } }` where `file_name` equals the DB `fileRecord.file_name` (e.g., `project_export_{slug}.zip`).
    [✅] c. [SRC] Backend: `supabase/functions/dialectic-service/exportProject.ts`
        [✅] i. Include `file_name: fileRecord.file_name` in the success response alongside `export_url`.
    [✅] d. [TEST-UNIT] Frontend: `apps/web/src/components/dialectic/ExportProjectButton.test.tsx`
        [✅] i. Assert anchor `download` equals `response.data.file_name` exactly (no transformation).
        [✅] ii. When `file_name` is not provided, assert we show a toast error and do not trigger a download (no fallback name, no navigation).
    [✅] e. [SRC] Frontend: `apps/web/src/components/dialectic/ExportProjectButton.tsx`
        [✅] i. Use `response.data.file_name` for `anchor.download`; remove the `'project_export.zip'` fallback and header-parsing logic.
        [✅] ii. If `file_name` is absent, log and toast an error; return without downloading.
        [✅] iii. [TEST-UNIT] Store: `packages/store/src/dialecticStore.test.ts`
            [✅] Assert `exportDialecticProject(projectId)` resolves with `{ status: 200, data: { export_url, file_name } }` and that `file_name` equals backend value exactly.
            [✅] When backend omits `file_name` or returns an error, assert we surface an error (no defaults) and set `exportProjectError`.
        [✅] iv. [SRC] Store: `packages/store/src/dialecticStore.ts`
            [✅] Update `exportDialecticProject` return type to `ApiResponse<{ export_url: string; file_name: string }>` and forward `file_name` unchanged from backend.
            [✅] Remove any defaults/fallbacks; do not synthesize `file_name`.
            [✅] Align types in `packages/types/src/dialectic.types.ts` for `DialecticActions.exportDialecticProject` and `DialecticApiClient.exportProject` to use `ApiResponse<{ export_url: string; file_name: string }>`.

    [✅] f. [TEST-INT] Integration: `supabase/integration_tests/services/export_project.integration.test.ts`
        [✅] i. Assert response includes both `export_url` and exact `file_name`; verify overwrite semantics remain unchanged.
    [ ] g. [COMMIT] fix(be,fe): remove filename fallback; return and use exact file_name            

## Prompt Improvements & Convergent Logic

[ ] 1. [PROMPT] Parenthesis: make prompts and stage recipe convergent
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/_shared/prompt-assembler.test.ts` proving Parenthesis prompts include a clear convergent directive to “synthesize a single, unified document from all relevant prior-stage context.”
        [ ] i. Assert assembled prompt includes both: (1) convergent directive language, (2) reference to using all prior-stage documents via the RAG pipeline.
    [ ] b. [DB/PROMPT] Migration/seed to update `system_prompts.prompt_text` for Parenthesis with explicit convergent instructions and the plan/checklist style guide.
    [ ] c. [BE] Update prompt assembly to inject Parenthesis convergent directive
        [ ] i. File: `supabase/functions/_shared/prompt-assembler.ts` (or the stage prompt assembly utility used by Parenthesis) to combine system prompt and convergent directive correctly.
    [ ] d. [TEST-INT] Add/extend `dialectic-service` integration test to assert the Parenthesis request carries the convergent directive and full prior-stage context when building the prompt.

[ ] 2. [PROMPT] Paralysis: make prompts and stage recipe convergent
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/_shared/prompt-assembler.test.ts` proving Paralysis prompts include a convergent directive AND the “First Mention, Full Implementation Prioritization” reordering rule.
        [ ] i. Assert assembled prompt includes: (1) convergent directive, (2) explicit dependency-driven reordering rule text referencing first-mention principle, (3) usage of all Parenthesis outputs via RAG.
    [ ] b. [DB/PROMPT] Migration/seed to update `system_prompts.prompt_text` for Paralysis with convergent instructions, reordering rule, and style guide.
    [ ] c. [BE] Update prompt assembly to inject Paralysis convergent directive and reordering instructions
        [ ] i. File: `supabase/functions/_shared/prompt-assembler.ts` (or the stage prompt assembly utility used by Paralysis).
    [ ] d. [TEST-INT] Add/extend `dialectic-service` integration test to assert the Paralysis request includes convergent + reordering directives and full Parenthesis context in the assembled prompt.

[ ] 3. [BE] Add final “advisor” job after Paralysis completes
    [ ] a. [TEST-UNIT] Add failing test in `supabase/functions/dialectic-service/submitStageResponses.success.test.ts` proving a single `advisor` job is enqueued when submitting at terminal Paralysis stage.
        [ ] i. Assert: no job enqueued for non-terminal stages; exactly one `advisor` job for terminal Paralysis; DI respected.
    [ ] b. [BE] Enqueue advisor job in `supabase/functions/dialectic-service/submitStageResponses.ts`
        [ ] i. After detecting Paralysis completion, enqueue one `advisor` job with session/project context for downstream processing.
    [ ] c. [TEST-UNIT] Add failing tests for `processAdvisorJob` worker in `supabase/functions/dialectic-worker/processAdvisorJob.test.ts`
        [ ] i. Asserts: gathers all Paralysis final plans via RAG, calls model once, writes a `dialectic_contribution` with type `final_summary`.
    [ ] d. [BE] Implement `supabase/functions/dialectic-worker/processAdvisorJob.ts`
        [ ] i. DI for storage/db/model invocation; retrieve all Paralysis contributions; invoke high-capability model; save one `final_summary` contribution; return success metrics.
    [ ] e. [BE] Route new job type in `supabase/functions/dialectic-worker/index.ts`
        [ ] i. Add dispatcher branch for `'advisor'` → `processAdvisorJob.ts`.
    [ ] f. [TEST-INT] Add/extend `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [ ] i. Submit at terminal Paralysis; assert n plans remain and exactly one `final_summary` contribution is created and surfaced in outputs.
    [ ] g. [DOCS] Update developer docs describing advisor job purpose/output and where it appears in the UI.
    [ ] h. [❓] [DB] If a strict job-type enum/table is used, add `'advisor'`; if `dialectic_contributions.type` is an enum, add `'final_summary'`. Otherwise, skip.

### General System Instructions Implementation

[ ] 1. [PROMPT/DOCS] Finalize the “Formatting and Style Guide” text
    [ ] a. [DOCS] Store finalized style guide text for embedding into `system_prompts.prompt_text` (kept in DB; optionally mirrored in a shared doc for version control).
        [ ] i. The guide matches the convention used throughout this document (status markers, labels, 1/a/i structure).

[ ] 2. [DB/SEED] Seed `expected_output_artifacts` JSON templates per stage
    [ ] a. [DB/MIGRATION] Create/extend migration to populate `dialectic_stages.expected_output_artifacts`
        [ ] i. One template per stage (Thesis, Antithesis, Synthesis, Parenthesis, Paralysis) with fixed `files_to_generate[].template_filename` and placeholders.
    [ ] b. [COMMIT] feat(db): seed expected_output_artifacts templates for dialectic stages
    [ ] c. [TEST] Update `file_manager.test.ts` to assert that it can build the file tree for the `expected_output_artifacts` for each stage. 
    [ ] d. [BE] Update `file_manager.ts` and its documentation to build the file tree for the `expected_output_artifacts` for each stage. 
    [ ] e. [DOCS] Update `file_manager.md` demonstrate the file tree for the `expected_output_artifacts` for each stage. 

[ ] 3. [DB/SEED] Embed style guide into relevant `system_prompts.prompt_text`
    [ ] a. [DB/MIGRATION] Update system prompts for stages that output structured plans to include the full style guide text block.
    [ ] b. [COMMIT] feat(db,prompt): integrate formatting/style guide into relevant system prompts

[ ] 4. [PROMPT] Add meta-instruction wrapper when a stage has `expected_output_artifacts`
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/_shared/prompt-assembler.test.ts`
        [ ] i. When `StageContext.expected_output_artifacts` is non-null, `PromptAssembler.render(...)` output includes:
            - “SYSTEM: ... MUST be a single, valid JSON object”
            - “Expected JSON Output Structure:”
            - The exact stringified JSON template from `expected_output_artifacts`
            - The concluding “Ensure your response is ONLY the JSON object ... END_OF_RESPONSE_FORMAT_INSTRUCTIONS.”
    [ ] b. [BE] Implement wrapper in `supabase/functions/_shared/prompt-assembler.ts`
        [ ] i. Fetch stage `expected_output_artifacts` from the provided stage context; conditionally append the meta-instruction + JSON template.
    [ ] c. [COMMIT] feat(prompt): meta-instruction wrapper for JSON response formatting

[ ] 5. [BE] Parse AI JSON response and process deliverables
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/dialectic-service/generateContribution.test.ts`
        [ ] i. Mock `callUnifiedAIModel` to return a JSON string matching a sample template.
        [ ] ii. Assert `JSON.parse` of entire text, extraction of keys, and iteration of `files_to_generate[]`.
        [ ] iii. Assert each file is passed to `FileManagerService.uploadAndRegisterFile` with correct dynamic filename mapping and `FileType`.
        [ ] iv. Add tests for malformed JSON → error handling path.
    [ ] b. [BE] Implement in `supabase/functions/dialectic-service/generateContribution.ts`
        [ ] i. `JSON.parse()` the entire model response; if error, log and return structured error.
        [ ] ii. Extract deliverables and map `template_filename` → system dynamic filename (includes model/stage/iteration/attempt).
        [ ] iii. Use `FileManagerService.uploadAndRegisterFile` for each generated file; persist non-file fields as appropriate.
    [ ] c. [COMMIT] feat(be): implement JSON response parsing and dynamic file processing

[ ] 6. [TEST-INT] Validate end-to-end prompt assembly and JSON processing
    [ ] a. [TEST-INT] Extend `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [ ] i. Simulate a stage with `expected_output_artifacts` and assert the outbound assembled request contains the meta-instruction + template.
        [ ] ii. Return a valid JSON response; assert files are saved with correctly mapped dynamic names and surfaced in the contribution.
        [ ] iii. Return malformed JSON; assert robust error handling/logging.
    [ ] b. [COMMIT] test(int): prompt assembly + JSON parsing/processing

[ ] 7. [DOCS] Document the system-level mechanism
    [ ] a. [DOCS] Update developer docs to cover:
        [ ] i. `expected_output_artifacts` templates and how to evolve them
        [ ] ii. Meta-instruction wrapper behavior in `PromptAssembler`
        [ ] iii. JSON parsing flow and dynamic filename mapping policy
    [ ] b. [COMMIT] docs: system instructions, artifacts, and JSON formatting flow

[ ] 8. [ARCH/DESIGN] Define canonical output artifact keys
    [ ] a. [TYPES] Add union type for artifact keys in `@paynless/types` (e.g., 'business_case' | 'prd' | 'trd' | 'implementation_plan' | 'risk_register' | 'architecture_overview' | 'roadmap' | 'backlog' | 'final_summary').
        [ ] i. Include docstrings describing each artifact’s purpose.
    [ ] b. [COMMIT] feat(types): add OutputArtifactKey union and docs

[ ] 9. [DB/MIGRATION] Persist stage defaults and per-session overrides
    [ ] a. [DB] Add `default_output_artifacts JSONB` to `dialectic_stages` (array of OutputArtifactKey).
    [ ] b. [DB] Add `selected_output_artifacts JSONB` to `dialectic_sessions` (keyed by stage slug or current stage only).
        [ ] i. Structure: `{ stage_slug: OutputArtifactKey[] }` or for current stage: `OutputArtifactKey[]`.
    [ ] c. [SEED] Populate `default_output_artifacts` for all stages with sensible defaults (e.g., Thesis: ['business_case','prd']; Antithesis: ['risk_register']; Synthesis: ['architecture_overview','implementation_plan']; Parenthesis: ['trd','roadmap']; Paralysis: ['implementation_plan','backlog']).
    [ ] d. [COMMIT] feat(db): add defaults/overrides for output artifacts

[ ] 10. [API] Expose session-level selection update/read
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/dialectic-service/index.test.ts`
        [ ] i. New action: `updateStageOutputArtifacts` validates payload `{ sessionId, stageSlug, selectedArtifacts: OutputArtifactKey[] }`, RLS user, and writes to `dialectic_sessions.selected_output_artifacts`.
        [ ] ii. New action: `getStageOutputArtifacts` returns `{ selectedArtifacts, defaults }` for a given `{ sessionId, stageSlug }`.
    [ ] b. [BE] Implement handlers in `supabase/functions/dialectic-service/index.ts`
        [ ] i. Wire to functions `updateStageOutputArtifacts.ts` and `getStageOutputArtifacts.ts` (one file each).
    [ ] c. [COMMIT] feat(api): selection endpoints for stage output artifacts

[ ] 11. [PROMPT] Make prompt assembly honor selected artifacts
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/_shared/prompt-assembler.test.ts`
        [ ] i. When `StageContext.expected_output_artifacts` is present:
            - If session has `selected_output_artifacts` for `stageSlug`, filter the JSON template to include only selected files/sections.
            - Else include stage `default_output_artifacts`.
            - Always wrap with the meta-instruction and EOF marker as previously specified.
    [ ] b. [BE] Update `supabase/functions/_shared/prompt-assembler.ts`
        [ ] i. Fetch selection via provided context/dep; filter the JSON template to only the selected artifacts before rendering.
    [ ] c. [COMMIT] feat(prompt): honor user-selected output artifacts in assembly

[ ] 12. [BE] Generate only selected artifacts in response processing
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/dialectic-service/generateContribution.test.ts`
        [ ] i. Mock model to return JSON containing multiple potential artifacts; ensure only the selected ones are uploaded using `FileManagerService.uploadAndRegisterFile`.
        [ ] ii. Verify dynamic filename mapping and `FileType` as before.
    [ ] b. [BE] Update `supabase/functions/dialectic-service/generateContribution.ts`
        [ ] i. Respect the current session’s selected artifacts (fallback to defaults).
    [ ] c. [COMMIT] feat(be): filter deliverables to selected output artifacts

[ ] 13. [API/CLIENT] Frontend API methods
    [ ] a. [TEST-UNIT] Add failing tests in `packages/api/src/dialectic.api.project.test.ts`
        [ ] i. `updateStageOutputArtifacts({ sessionId, stageSlug, selectedArtifacts })` posts to dialectic-service.
        [ ] ii. `getStageOutputArtifacts({ sessionId, stageSlug })` retrieves defaults + selected values.
    [ ] b. [API] Implement in `packages/api/src/dialectic.api.ts`
    [ ] c. [COMMIT] feat(api): add output artifact selection methods

[ ] 14. [STORE] App state + actions for selection
    [ ] a. [TEST-UNIT] Add failing tests in `packages/store/src/dialecticStore.project.test.ts`
        [ ] i. `setSelectedOutputArtifacts(stageSlug, keys[])` updates local state and calls API update.
        [ ] ii. `loadOutputArtifacts(stageSlug)` fetches defaults/selection and populates state.
    [ ] b. [STORE] Implement actions in `packages/store/src/dialecticStore.ts`
        [ ] i. Persist to backend; keep in-memory selection keyed by session + stage.
    [ ] c. [COMMIT] feat(store): output artifacts selection state/actions

[ ] 15. [UI] OutputArtifactsSelector component
    [ ] a. [TEST-UNIT] Add failing tests in `apps/web/src/components/dialectic/OutputArtifactsSelector.test.tsx`
        [ ] i. Renders checkboxes for all available artifacts; defaults checked based on stage defaults or session selection.
        [ ] ii. Toggling updates store; disabled during save.
    [ ] b. [UI] Implement `apps/web/src/components/dialectic/OutputArtifactsSelector.tsx`
        [ ] i. Props: `sessionId`, `stageSlug`; reads/writes via store.
    [ ] c. [COMMIT] feat(ui): OutputArtifactsSelector with default + override behavior

[ ] 16. [UI] Integrate selector into session workflow
    [ ] a. [TEST-UNIT] Update `apps/web/src/components/dialectic/SessionContributionsDisplayCard.test.tsx`
        [ ] i. Selector is visible at stages that produce artifacts (e.g., Synthesis/Parenthesis/Paralysis).
        [ ] ii. Generating contributions uses latest selection (assert via store call).
    [ ] b. [UI] Render `OutputArtifactsSelector` in `SessionContributionsDisplayCard.tsx` (or session header) when a project/session is active.
    [ ] c. [COMMIT] feat(ui): allow per-stage customization of outputs on session page

[ ] 17. [TEST-INT] End-to-end: selection → prompt → generation
    [ ] a. [TEST-INT] Extend `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [ ] i. Set selection for a stage, trigger generation, assert prompt contains only selected JSON template items, and only selected files are saved.
    [ ] b. [COMMIT] test(int): pipeline respects output artifact selection

### Proposal / Thesis 
*   `[ ]` Prompt rework

ROLE: "senior product strategist and technical architect",
STAGE: "proposal",
OUTPUTS: "a high-quality, actionable proposal",
USER_PROMPT: original_user_input,
DOMAIN: dialectic_domain,
REFERENCE_MATERIALS: reference_materials,
OTHER_DOCUMENTS: other_documents

You are a {{ROLE}}. Your task in the {{STAGE}} stage is to produce outputs based on the provided inputs and references.
- {{USER_PROMPT}}
- {{DOMAIN}}
- {{REFERENCE_MATERIALS}}
- {{OTHER_DOCUMENTS}}

You will produce the following outputs: 
- {{OUTPUTS}}

Formatting and Style Guide {{OUTPUTS}}:
- {{STAGE_STYLE_GUIDE_MARKDOWN}}

Your response must: 
- Build upon the inputs provide by the user and system, 
- Be compatible with established described systems, adhere to standards, and respect constraints.
- Produce the full {{STAGE}} {{OUTPUTS}} using the Json Output Structure appended at the end of the template. 
- Your narrative content for the {{OUTPUTS}} must be comprehensive and pragmatic.
- Follow the formatting and style guide for the stage.
- Be specific, complete, and professional.
- Be verbose, comprehensive, explanatory. 
- Include sufficient detail any skilled implementer can follow the plan you provide. 
- You must not summarize! 

Quality expectations:
- Address all stated constraints and stakeholder considerations
- Provide explicit risks and mitigation strategies
- Define clear success metrics
- Reflect domain best practices and technical feasibility

Validation (mentally verify before finalizing):
- Requirements fully addressed
- Domain-specific practices applied
- Stakeholder needs considered
- Feasible, modular architecture
- Reference documents integrated or explicitly addressed
- Standards/compliance met
- Distinctive perspective and trade-offs explained

*   `[ ]` System instructions for stage 

    SYSTEM: Your entire response for this stage MUST be a single, valid JSON object. Strictly adhere to the JSON structure under 'Expected JSON Output Structure:'. Populate all placeholders with your generated content. Do not include any content outside of the JSON. The JSON must begin with '{' and end with '}'.

    {{template inserts}}
    STAGE_NAME: {{STAGE_NAME}}                # e.g., "Thesis"
    SELECTED_OUTPUT_ARTIFACTS: {{SELECTED_OUTPUT_ARTIFACTS_JSON}}
    STYLE_GUIDE_MARKDOWN: {{STYLE_GUIDE_MARKDOWN}}
    PROJECT_CONTEXT: {{PROJECT_CONTEXT}}      # name, objective, domain
    USER_INPUT_PROMPT: {{USER_INPUT_PROMPT}}
    DEPLOYMENT_CONTEXT: {{DEPLOYMENT_CONTEXT}}
    REFERENCE_DOCUMENTS: {{REFERENCE_DOCUMENTS_SUMMARY}}
    CONSTRAINTS: {{CONSTRAINTS}}
    STAKEHOLDER_CONSIDERATIONS: {{STAKEHOLDER_CONSIDERATIONS}}
    COMPLIANCE_REQUIREMENTS: {{COMPLIANCE_REQUIREMENTS}}
    {{/template inserts}}

    Expected JSON Output Structure:
    {{EXPECTED_OUTPUT_ARTIFACTS_JSON}}

    CRITICAL REMINDER: Ensure your response is ONLY the JSON object detailed above. End of Instructions. END_OF_RESPONSE_FORMAT_INSTRUCTIONS.

*   `[ ]` expected_output_artifacts for stage 
    `{
        "executive_summary": "placeholder for executive summary",
        "detailed_implementation_strategy": "placeholder for implementation strategy (overview of stack, services, data, deployment, sequencing assumptions)",
        "development_checklist": ["placeholder for step 1"],
        "risk_assessment_and_mitigation": "placeholder for key risks and mitigations",
        "success_metrics": "placeholder for measurable success criteria",
        "files_to_generate": [
            {
            "template_filename": "thesis_product_requirements_document.md",
            "content_placeholder": "complete PRD in markdown, referencing and integrating provided context and references"
            },
            {
            "template_filename": "thesis_implementation_plan_proposal.md",
            "content_placeholder": "initial implementation plan proposal with checklist sections using the style guide"
            }
        ]
    }`

### Review / Antithesis 
*   `[ ]` Prompt rework
*   `[ ]` System instructions for stage 

### Refinement / Synthesis 
*   `[ ]` Prompt rework
*   `[ ]` System instructions for stage 

### Planning / Parenthesis
*   `[ ]` Prompt rework
*   `[ ]` System instructions for stage 

### Implementation / Paralysis 
*   `[ ]` Prompt rework
*   `[ ]` System instructions for stage 

## Github Integration (Cursor, Windsurf, Roo, Cline, Claude Code, Firebase)
[ ] 1. [API/OAUTH] GitHub OAuth initiation and callback
    [ ] a. [TEST-UNIT] Add failing tests for OAuth endpoints
        [ ] i. File: `supabase/functions/GitHub/index.test.ts`
            - New actions: `githubAuthStart` returns a redirect URL to GitHub with correct client_id, scopes (repo, workflow), and state.
            - `githubAuthCallback` exchanges code for access token; persists token for the user.
    [ ] b. [BE] Implement endpoints
        [ ] i. Files:
            - `supabase/functions/GitHub/githubAuthStart.ts`
            - `supabase/functions/GitHub/githubAuthCallback.ts`
        [ ] ii. Store token securely (e.g., `user_oauth_credentials` table with provider='github', encrypted token, user_id foreign key).
    [ ] c. [DB/MIGRATION] Create `user_oauth_credentials` with fields: id, user_id, provider, encrypted_access_token, refresh_token (nullable), scopes, created_at, updated_at.
    [ ] d. [CONFIG] Add env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OAUTH_REDIRECT_URL.
    [ ] e. [COMMIT] feat(api,db): GitHub OAuth start/callback and credential storage

[ ] 2. [API] GitHub identity fetch
    [ ] a. [TEST-UNIT] Add failing test: `githubGetIdentity` returns `{ login, name, email, avatar_url }` for authenticated user.
        [ ] i. File: `supabase/functions/GitHub/index.test.ts`
    [ ] b. [BE] Implement `githubGetIdentity.ts` using stored token.
    [ ] c. [COMMIT] feat(api): fetch GitHub identity for current user

[ ] 3. [API] List or create repository
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `githubListRepos` returns paginated list with `{ full_name, default_branch, permissions }`.
        [ ] ii. `githubCreateRepo` creates repo under user or org; returns `{ full_name, default_branch }`.
        [ ] iii. Validate permission to push.
        [ ] iv. File: `supabase/functions/GitHub/index.test.ts`
    [ ] b. [BE] Implement:
        [ ] i. `githubListRepos.ts` (supports pagination, optional org filter)
        [ ] ii. `githubCreateRepo.ts` (visibility, description)
    [ ] c. [COMMIT] feat(api): list/create GitHub repositories

[ ] 4. [API] List branches and create branch (optional)
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `githubListBranches` returns branches and default branch.
        [ ] ii. `githubCreateBranch` creates a branch from default or given base SHA.
    [ ] b. [BE] Implement:
        [ ] i. `githubListBranches.ts`
        [ ] ii. `githubCreateBranch.ts`
    [ ] c. [COMMIT] feat(api): branch listing/creation

[ ] 5. [API] Export project tree to GitHub
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `githubExportProject` payload: `{ projectId, repoFullName, branch, commitMessage }`
            - Reads file tree using `FileManagerService` path rules (download via storage utils).
            - Creates commit via GitHub API (prefer tree/commit API for batch).
            - Creates PR if branch != default (optional).
        [ ] ii. Validates binary vs text mime types; preserves directories from `constructStoragePath`.
        [ ] iii. File: `supabase/functions/GitHub/index.test.ts`
    [ ] b. [BE] Implement `githubExportProject.ts`
        [ ] i. Walk project files from storage (resources + contributions), reconstruct canonical paths using `path_constructor`/metadata, upload blobs, create tree and commit to selected branch.
    [ ] c. [COMMIT] feat(api): export project tree to GitHub

[ ] 6. [API/CLIENT] Frontend API methods
    [ ] a. [TEST-UNIT] Add failing tests in `packages/api/src/github.api.test.ts`
        [ ] i. Methods: `githubAuthStart`, `githubAuthCallback`, `githubGetIdentity`, `githubListRepos`, `githubCreateRepo`, `githubListBranches`, `githubCreateBranch`, `githubExportProject`.
    [ ] b. [API] Implement in `packages/api/src/dialectic.api.ts`
    [ ] c. [COMMIT] feat(api): client methods for GitHub integration

[ ] 7. [STORE] State/actions for GitHub integration
    [ ] a. [TEST-UNIT] Add failing tests in `packages/store/src/gitHubStore.test.ts`
        [ ] i. State: `githubIdentity`, `githubRepos`, `githubBranches`, `isGitHubLinked`, loading/error states.
        [ ] ii. Actions: `linkGitHub`, `fetchGitHubIdentity`, `fetchGitHubRepos`, `createGitHubRepo`, `fetchGitHubBranches`, `createGitHubBranch`, `exportProjectToGitHub`.
    [ ] b. [STORE] Implement in `packages/store/src/gitHubStore.ts`
    [ ] c. [COMMIT] feat(store): GitHub integration state and actions

[ ] 8. [UI] GitHubConnectButton + GitHubExportDialog
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `GitHubConnectButton` initiates OAuth, reflects linked status.
        [ ] ii. `GitHubExportDialog` flow: pick identity (readonly), select repo or create, pick branch or create, confirm export; shows progress/success/failure.
        [ ] iii. Files:
            - `apps/web/src/components/gitHub/GitHubConnectButton.test.tsx`
            - `apps/web/src/components/gitHub/GitHubExportDialog.test.tsx`
    [ ] b. [UI] Implement:
        [ ] i. `GitHubConnectButton.tsx`
        [ ] ii. `GitHubExportDialog.tsx`
            - Uses store actions; validates permissions; disables actions during async.
    [ ] c. [UI] Integration:
        [ ] i. Add `GitHubConnectButton` to settings/profile menu.
        [ ] ii. Add “Export to GitHub” button beside “Export Project” on project and session pages, opening `GitHubExportDialog`.
    [ ] d. [COMMIT] feat(ui): GitHub OAuth/connect and export dialog

[ ] 9. [TEST-INT] End-to-end happy path
    [ ] a. Simulate linked GitHub account, list repos, create/select repo, list/create branch, export, verify 200 OK and commit URL in response.
    [ ] b. [COMMIT] test(int): GitHub export end-to-end

[ ] 10. [DOCS] Document GitHub integration
    [ ] a. Explain permissions, OAuth setup, environment configuration, and limitations.
    [ ] b. [COMMIT] docs: GitHub integration guide

[ ] 11. [API] “Support the Project” actions (Star / Watch / Fork)
    [ ] a. [TEST-UNIT] Add failing tests (JSON actions)
        [ ] i. File: `supabase/functions/dialectic-service/index.test.ts`
            - `githubStarRepo({ owner, repo })` → 204/304 on success
            - `githubWatchRepo({ owner, repo })` → 200 subscription object
            - `githubForkRepo({ owner, repo, org? })` → 202 fork initiated
    [ ] b. [BE] Implement handlers (REST GitHub API)
        [ ] i. Files:
            - `githubStarRepo.ts` (PUT /user/starred/{owner}/{repo})
            - `githubWatchRepo.ts` (PUT /repos/{owner}/{repo}/subscription payload: {subscribed:true})
            - `githubForkRepo.ts` (POST /repos/{owner}/{repo}/forks)
        [ ] ii. Use stored GitHub token; require scopes including `repo`.
    [ ] c. [CONFIG] Add `SUPPORT_REPO_OWNER`, `SUPPORT_REPO_NAME` envs for our project

[ ] 12. [API/CLIENT] Add client methods
    [ ] a. [TEST-UNIT] `packages/api/src/dialectic.api.project.test.ts`
        [ ] i. Methods: `githubStarRepo`, `githubWatchRepo`, `githubForkRepo`
    [ ] b. [API] Implement in `packages/api/src/dialectic.api.ts`

[ ] 13. [STORE] State/actions for support actions
    [ ] a. [TEST-UNIT] `packages/store/src/dialecticStore.project.test.ts`
        [ ] i. Actions: `starSupportRepo`, `watchSupportRepo`, `forkSupportRepo`
        [ ] ii. Loading/error states; success toast hook points
    [ ] b. [STORE] Implement in `packages/store/src/dialecticStore.ts`

[ ] 14. [UI] Integrate “Support the Project” into GitHub export flow
    [ ] a. [TEST-UNIT] `apps/web/src/components/dialectic/GitHubExportDialog.test.tsx`
        [ ] i. Render a “Support the Project” section with toggles: Star, Watch, Fork (unchecked by default)
        [ ] ii. On confirm, performs selected actions before/after export (order: star → watch → fork → export)
        [ ] iii. Shows per-action success/failure; does not block export if support actions fail
    [ ] b. [UI] Update `GitHubExportDialog.tsx`
        [ ] i. Wire toggles to store actions; read `SUPPORT_REPO_OWNER/NAME` from config provider
    [ ] c. [UI] Optional “Pin” UX
        [ ] i. If GraphQL token available, show “Pin repo to profile” and call GraphQL mutation; else show a link/instruction to manually pin
    [ ] d. [COMMIT] feat(ui): support actions within GitHub export dialog

[ ] 15. [TEST-INT] End-to-end support + export
    [ ] a. Simulate linked account; run Star/Watch/Fork (mock GitHub), then export; assert all calls made in order and export completes
    [ ] b. [COMMIT] test(int): support actions integrated with export flow

## Site Integrations 
*   `[ ]` Site integrations 

### Replit Integration 

### Bolt.new Integration

### Lovable.dev Integration

### v0 Integration 

## Add User Analytics Notices
[ ] A. [ARCH] Subscriptions analytics taxonomy
    [ ] a. [TYPES] Extend `@paynless/types` with `AnalyticsEventName` additions:
        - 'Subscriptions: View Pricing', 'Subscriptions: Toggle Billing Interval',
          'Subscriptions: Click Plan', 'Subscriptions: Start Checkout',
          'Subscriptions: Checkout Succeeded', 'Subscriptions: Checkout Abandoned',
          'Subscriptions: Payment Error', 'Subscriptions: Apply Promo',
          'Subscriptions: View Manage Billing', 'Subscriptions: Upgrade Initiated',
          'Subscriptions: Upgrade Confirmed', 'Subscriptions: Downgrade Initiated',
          'Subscriptions: Downgrade Confirmed', 'Subscriptions: Cancel Initiated',
          'Subscriptions: Cancel Confirmed', 'Subscriptions: Reactivate',
          'Subscriptions: View Plan Comparison'
    [ ] b. [DOCS] Define required props: { planId, planName, price, billingInterval, currency, projectId?, userTierBefore?, userTierAfter?, source }

[ ] B. [TEST-UNIT] Coverage guard for payment UI
    [ ] a. File: `apps/web/src/tests/analytics.subscriptions.coverage.test.ts`
        [ ] i. Walk `apps/web/src/**/{pricing,billing,subscription,checkout,manage}/*.tsx`
        [ ] ii. Assert each file has an interaction wired to `analytics.track(` or contains `/* analytics:ignore */`

[ ] C. [UI] Pricing page instrumentation
    [ ] a. [TEST-UNIT] `PricingPage.test.tsx`
        [ ] i. Tracks on mount: 'Subscriptions: View Pricing'
        [ ] ii. Tracks on billing toggle: 'Subscriptions: Toggle Billing Interval' with { billingInterval }
        [ ] iii. Tracks on plan click: 'Subscriptions: Click Plan' with { planId, price, billingInterval }
        [ ] iv. Tracks on “Compare Plans” open: 'Subscriptions: View Plan Comparison'
        [ ] v. Tracks on promo apply: 'Subscriptions: Apply Promo'
    [ ] b. [UI] `PricingPage.tsx` add `analytics.track` at those interaction points

[ ] D. [UI] Checkout flow instrumentation
    [ ] a. [TEST-UNIT] `CheckoutDialog.test.tsx` (or equivalent)
        [ ] i. 'Subscriptions: Start Checkout' when dialog opens/confirm pressed
        [ ] ii. 'Subscriptions: Checkout Succeeded' on success callback with { planId, price, billingInterval }
        [ ] iii. 'Subscriptions: Checkout Abandoned' when closed without completion
        [ ] iv. 'Subscriptions: Payment Error' on error with { code, message? }
    [ ] b. [UI] Implement in `CheckoutDialog.tsx` (or current checkout component)

[ ] E. [UI] Manage subscription (upgrade/downgrade/cancel)
    [ ] a. [TEST-UNIT] `ManageSubscription.test.tsx`
        [ ] i. 'Subscriptions: View Manage Billing' on open
        [ ] ii. 'Subscriptions: Upgrade Initiated'/'Confirmed' with { fromTier, toTier, deltaPrice }
        [ ] iii. 'Subscriptions: Downgrade Initiated'/'Confirmed'
        [ ] iv. 'Subscriptions: Cancel Initiated'/'Confirmed'
        [ ] v. 'Subscriptions: Reactivate' on reactivation
    [ ] b. [UI] Implement in `ManageSubscription.tsx` (or equivalent settings/billing page)

[ ] F. [STORE] Track key payment actions in centralized flows
    [ ] a. [TEST-UNIT] `packages/store/src/dialecticStore.project.test.ts`
        [ ] i. Ensure store actions (if any exist for purchase/plan changes) call analytics once per action path:
            - start checkout, success, error; upgrade/downgrade confirm; cancel/renew
    [ ] b. [STORE] Implement minimal `analytics.track` in store actions (avoid duplicate double-counting with UI; prefer one source per event type)

[ ] G. [ADAPTER] Validate provider mapping & privacy
    [ ] a. [TEST-UNIT] `packages/analytics/src/index.test.ts`
        [ ] i. Props scrubbing: hash/anonymize userId, exclude payment PII; include plan/billing metadata
        [ ] ii. Environment guard (disable in local if desired, enable in staging/prod)
    [ ] b. [COMMIT] chore(analytics): provider map + privacy checks

[ ] H. [TEST-INT] Funnel smoke tests
    [ ] a. Simulate user flows with analytics mock:
        [ ] i. View pricing → toggle monthly/annual → click plan → start checkout → success
        [ ] ii. View pricing → click plan → start checkout → abandon
        [ ] iii. Manage billing → upgrade → confirm; downgrade → confirm; cancel → confirm; reactivate
        [ ] iv. Assert event sequence and required props
    [ ] b. [COMMIT] test(int): subscriptions funnel analytics

[ ] I. [DOCS] Analytics guide for subscriptions
    [ ] a. Event names, when to fire, required props, examples
    [ ] b. Guidance on adding `/* analytics:ignore */` for non-interactive files

[ ] 1. [ARCH] Define standard event taxonomy and adapter usage
    [ ] a. [TYPES] Extend `@paynless/types` with `AnalyticsEventName` union and `AnalyticsProps` map for common fields (projectId, sessionId, userId anonymized/hash, stageSlug, componentId).
    [ ] b. [DOCS] Document naming conventions: “Area: Action Verb Object” (e.g., “Project: Click Export”, “Session: Start Generation”).
    [ ] c. [COMMIT] feat(types,docs): analytics event taxonomy

[ ] 2. [TEST-UNIT] Lint-like guard for UI analytics coverage
    [ ] a. File: `apps/web/src/tests/analytics.coverage.test.ts`
        [ ] i. Walk `apps/web/src/components` and `apps/web/src/pages` (TSX only).
        [ ] ii. For each file, require at least one `analytics.track` on an interaction (click/submit/change/keypress/navigation).
        [ ] iii. Allow explicit `/* analytics:ignore */` pragma for non-interactive views (assert pragma exists).
    [ ] b. [COMMIT] test: analytics coverage guard for UI

[ ] 3. [UI] Add analytics to high-traffic core pages first (iterative)
    [ ] a. [TEST-UNIT] For each targeted file, add failing tests asserting `analytics.track` is called with correct event name and props on interactions.
        [ ] i. Examples:
            - `DialecticProjectCard.test.tsx`: track on Export/Clone/Delete/View clicks.
            - `SessionContributionsDisplayCard.test.tsx`: track on Submit/Export/Model selection.
            - Navigation buttons/links in layout/sidebar.
    [ ] b. [UI] Implement analytics calls
        [ ] i. Import `analytics` from `@paynless/analytics`
        [ ] ii. Use taxonomy names; include minimal stable props: `{ projectId, sessionId, stageSlug, source: 'componentName' }`
    [ ] c. [COMMIT] feat(ui): add analytics to core components

[ ] 4. [TEST-UNIT] Expand to remaining UI components (batch by folder)
    [ ] a. Batch A: `apps/web/src/components/dialectic/**`
    [ ] b. Batch B: shared UI (buttons/forms where appropriate; avoid double counting)
    [ ] c. Batch C: pages (all interactions)
    [ ] d. For each batch:
        [ ] i. Add/extend component tests to assert tracking for each interaction path.
        [ ] ii. Implement `analytics.track` in code.
        [ ] iii. Ensure coverage test passes without `analytics:ignore`.

[ ] 5. [STORE] Key user actions also tracked centrally
    [ ] a. [TEST-UNIT] In `packages/store/src/dialecticStore.project.test.ts`, assert track calls for major flows:
        [ ] i. `generateContributions`, `submitStageResponses`, `exportDialecticProject`, `cloneDialecticProject`, `deleteDialecticProject`, `startDialecticSession`
    [ ] b. [STORE] Implement adapter calls inside actions (do not duplicate if UI already tracks; prefer one clear source of truth per action)
    [ ] c. [COMMIT] feat(store): add analytics in store actions

[ ] 6. [ADAPTER] Ensure Posthog provider mapping is up to date
    [ ] a. [TEST-UNIT] `packages/analytics/src/index.test.ts`
        [ ] i. Verify `analytics.track(name, props)` forwards to Posthog with props scoping and environment filters (dev vs prod).
        [ ] ii. Verify `analytics.identify` behavior and `reset` on logout (already in `authStore`).
    [ ] b. [COMMIT] chore(analytics): verify provider mapping

[ ] 7. [CONFIG] Privacy and PII
    [ ] a. Hash/minimize potentially sensitive fields (userId) in adapter before sending.
    [ ] b. Respect Do-Not-Track/consent flags if present; add toggles if missing.
    [ ] c. [COMMIT] feat(analytics): privacy-safe props defaults

[ ] 8. [TEST-INT] Smoke flows exercise analytics
    [ ] a. Add integration tests that simulate a few user flows and assert analytics adapter received expected sequence of events (using mock for `@paynless/analytics`).
    [ ] b. [COMMIT] test(int): analytics smoke coverage

[ ] 9. [DOCS] Developer guide
    [ ] a. Where to place events, naming, props, and how to add `analytics:ignore`.
    [ ] b. [COMMIT] docs: UI analytics guidelines

## Fix ChatWoot

## 