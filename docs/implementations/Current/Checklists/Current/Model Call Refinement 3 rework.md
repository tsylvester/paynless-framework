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

### General System Instructions Implementation

[ ] 1. [PROMPT/DOCS] Finalize the “Formatting and Style Guide” text from `StyleGuide.md` and `Prompt Templating Example.md`
    [ ] a. [DOCS] Store finalized style guide text for embedding into `domain_specific_prompt_overlays.overlay_values` in jsonb format (kept in DB; optionally mirrored in a shared doc for version control).
        [✅] i. The guide matches the convention used throughout this document (status markers, labels, 1/a/i structure).
    [ ] b. [DB] Update `system_prompts` to support UI selection and align overlays with renderer behavior.
        [✅] i. Add `user_selectable BOOLEAN NOT NULL DEFAULT false` to `system_prompts`; backfill using both signals:
            - Set `user_selectable = false` if the prompt is referenced by any `dialectic_stages.default_system_prompt_id` OR if `system_prompts.name` contains an underscore (`_`).
            - Set `user_selectable = true` otherwise (no underscore in name and not stage-linked).
        [✅] ii. Merge per-stage keys into the existing `domain_specific_prompt_overlays.overlay_values` jsonb (use `overlay_values = overlay_values || jsonb_build_object(...)`) for the target `(system_prompt_id, domain_id)` pairs as `system_instructions`, following the Stage Application Map in `StyleGuide.md` §11.
        [✅] iii. Mark all `dialectic` (stage-bound) templates in `system_prompts` as not `user_selectable` via backfill.
        [✅] iv. Update `supabase/seed.sql` to set `user_selectable` for generic prompts and to merge the overlay keys into `overlay_values` for the correct overlays (no separate "checklist" prompt rows).
        [✅] v. Scour migrations for other `system_prompts` inserts and reflect them in `seed.sql` with appropriate `user_selectable` values and, where applicable, overlay merges (e.g., `3-card tarot`, `celtic cross tarot`, `horoscope`, `relationship expert`, `cooking expert`).
        [✅] vi. Add additional consulting roles from explicitly named roles in `dialectic_stages` prompts and implicit from stage-based document outputs. 


[ ] 2. [PROMPT] Ensure every call to `promptAssembler.render` provides complete stage data (strict, no fallbacks)
    [✅] a. [TEST-UNIT] `processSimpleJob` requires overlays and stage prompt
        [✅] i. **File**: `supabase/functions/dialectic-worker/processSimpleJob.test.ts`
        [✅] ii. RED: when `stageContext.domain_specific_prompt_overlays` is `[]`, assert the worker throws with code `STAGE_CONFIG_MISSING_OVERLAYS` before rendering.
        [✅] iii. GREEN: fetch overlays by `(system_prompt_id, project.selected_domain_id)`, set `stageContext.domain_specific_prompt_overlays`, and assert the rendered prompt includes `style_guide_markdown` and `expected_output_artifacts_json` sections.
    [✅] b. [BE] `processSimpleJob`: fetch and attach overlays; fail hard if missing
        [✅] i. Select `dialectic_stages` with `system_prompts(id, prompt_text)`.
        [✅] ii. Fetch `domain_specific_prompt_overlays.overlay_values` by `(system_prompt_id, project.selected_domain_id)`.
        [✅] iii. If none, throw `Error("STAGE_CONFIG_MISSING_OVERLAYS")` and stop.
        [✅] iv. Build `StageContext` with non-empty `domain_specific_prompt_overlays`; call `gatherContext`/`render`.
    [✅] c. [TEST-UNIT] `startSession` enforces overlays on initial prompt assembly
        [✅] i. **File**: `supabase/functions/dialectic-service/startSession.test.ts`
        [✅] ii. RED: simulate overlays query returning empty; assert function fails with `STAGE_CONFIG_MISSING_OVERLAYS`.
        [✅] iii. GREEN: provide overlays; assert assembled initial prompt includes style guide and expected JSON structure.
    [✅] d. [BE] `startSession`: fail fast if overlays missing
        [✅] i. After overlay fetch, if empty/error, throw `STAGE_CONFIG_MISSING_OVERLAYS`; do not proceed with empty arrays.
    [✅] e. [TEST-UNIT] `submitStageResponses` requires overlays for next stage
        [✅] i. **File**: `supabase/functions/dialectic-service/submitStageResponses.test.ts`
        [✅] ii. RED: assert it fails when overlays are not fetched / empty.
        [✅] iii. GREEN: fetch overlays by `(system_prompt_id, project.selected_domain_id)`, set `StageContext`, assert assembled seed prompt contains sections.
    [✅] f. [BE] `submitStageResponses`: fetch overlays and enforce strict presence
        [✅] i. Select next stage with `system_prompts(id, prompt_text)`.
        [✅] ii. Fetch overlays as above; if none, throw `STAGE_CONFIG_MISSING_OVERLAYS`.
    [✅] g. [TEST-UNIT] PromptAssembler adds `expected_output_artifacts_json` when present
        [✅] i. **File**: `supabase/functions/_shared/prompt-assembler.test.ts`
        [✅] ii. RED: when `stage.expected_output_artifacts` is null, assert `{expected_output_artifacts_json}` is not provided and the conditional block strips cleanly.
        [✅] iii. GREEN: when `stage.expected_output_artifacts` is an object, `gatherContext` includes `expected_output_artifacts_json = JSON.stringify(...)`; assert renderer receives it.
    [✅] h. [BE] `PromptAssembler.gatherContext`: add `expected_output_artifacts_json`
        [✅] i. Set dynamic var `expected_output_artifacts_json` from `stage.expected_output_artifacts`; do not synthesize fallbacks.
    [✅] i. [TEST-UNIT] Strict precondition guard in `PromptAssembler.render`
        [✅] i. **File**: `supabase/functions/_shared/prompt-assembler.test.ts`
        [✅] ii. RED: assembling with missing/empty `style_guide_markdown` or `expected_output_artifacts_json` (when required by stage) yields `RENDER_PRECONDITION_FAILED`.
        [✅] iii. GREEN: with required keys present and non-empty, render proceeds and includes both sections.
    [✅] j. [BE] Enforce preconditions in `PromptAssembler.render`
        [✅] i. Validate before render:
            - `stage.system_prompts.prompt_text` is a non-empty string
            - `stage.domain_specific_prompt_overlays[0].overlay_values` contains non-empty `style_guide_markdown` for Parenthesis/Paralysis, and `expected_output_artifacts_json` for all five stages
        [✅] ii. If any required key is missing/empty, throw `Error("RENDER_PRECONDITION_FAILED: missing <key> for stage <slug>")`.
    [✅] k. [TEST-INT] End-to-end: seed prompt contains all required sections
        [✅] i. **File**: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [✅] ii. Assert assembled prompt for Thesis contains `user_objective`, `context_description`, style guide text, and the expected JSON structure.
        [✅] iii. Assert assembled prompt for Antithesis contains `user_objective`, `context_description`, style guide text, and the expected JSON structure.
        [✅] iv. Assert assembled prompt for Synthesis contains `user_objective`, `context_description`, style guide text, and the expected JSON structure.
        [✅] v. Assert assembled prompt for Parenthesis contains `user_objective`, `context_description`, style guide text, and the expected JSON structure.
        [✅] vi. Assert assembled prompt for Paralysis contains `user_objective`, `context_description`, style guide text, and the expected JSON structure.
        [✅] vii. For each stage, verify conditional sections strip cleanly when corresponding values are absent and are present when values exist in overlays/context.


[ ] 3. [BE] Ensure continuation jobs are dispatched (trigger/worker Authorization) — TDD, one file at a time
    [✅] a. [TEST-INT] Add a continuation dispatch test `supabase/integration_tests/services/continuation_dispatch.integration.test.ts`
        [✅] i. Create an initial execute job that predictably returns `finish_reason = max_tokens` using the dummy adapter (e.g., inject SIMULATE_MAX_TOKENS) so `continueJob` enqueues a row with `status = 'pending_continuation'`.
        [✅] ii. Without manually calling the worker, poll the jobs table to assert the newly inserted continuation transitions from `'pending_continuation'` → `'processing'` → terminal (`'completed'` or `'needs_continuation'`), proving the trigger invoked the worker.
        [✅] iii. Assert there are no leftover continuation jobs in non-terminal states after the drain step.
    [✅] b. [TEST-INT] Add a trigger introspection test `supabase/integration_tests/services/triggers.integration.test.ts`
        [✅] i. Use the existing trigger introspection helper in `_integration.test.utils.ts` to fetch trigger definitions.
        [✅] ii. Assert trigger `on_new_job_created` exists on `public.dialectic_generation_jobs` and invokes `public.invoke_dialectic_worker`.
        [✅] iii. Assert the function body for `invoke_dialectic_worker` includes an `Authorization` header (search for the string `Authorization` and `Bearer`).
    [✅] c. [BE] Fix headers in `public.invoke_dialectic_worker` (single file)
        [✅] i. **File**: `supabase/migrations/20250711205050_create_job_completion_trigger.sql` -> {`new migration to fix the header`}
        [✅] ii. Replace string-concatenated headers with a proper JSON object:
            - `headers := jsonb_build_object('Content-Type','application/json','Authorization', concat('Bearer ', current_setting('secret.SUPABASE_SERVICE_ROLE_KEY')))::text`
        [✅] iii. Keep `AFTER INSERT` trigger `on_new_job_created` idempotent and unchanged otherwise; do not add status filters.
    [ ] d. [TEST-INT] GREEN: re-run continuation dispatch test; assert continuation jobs auto-dispatch and complete; assert no "Missing authorization header" errors are logged during the test run.
    [ ] e. [TEST-INT] Pipeline hardening
        [ ] i. In `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`, after any operation that can enqueue continuations, drain pending jobs until empty (status IN ['pending','retrying','pending_continuation','pending_next_step']).
        [ ] ii. Add an assertion that no rows remain with `status = 'pending_continuation'` before advancing to the next stage.


[ ] 4. [BE/DB] Continuation dispatch & worker auth consistency (TDD; one file at a time)
    [✅] a. [TEST-UNIT] Continuation payload must preserve the full original payload and overlay continuation fields
        [✅] i. **File**: `supabase/functions/dialectic-worker/continueJob.test.ts`
            - Arrange: create a fake job row with `payload` that includes many keys (e.g., `user_jwt`, `inputs`, `canonicalPathParams`, `output_type`, `walletId`, etc.).
            - Act: call `continueJob` with a saved contribution and verify the inserted row’s `payload` contains all original keys unchanged plus only these overlays:
              `job_type: 'execute'`, `target_contribution_id` set, `continuation_count` incremented by 1, and `canonicalPathParams.contributionType = output_type`.
            - Assert: no keys are dropped (including `user_jwt` if present), and `document_relationships` is present/valid; otherwise `continueJob` returns `{ enqueued:false, error }`.
        [✅] ii. **File**: `supabase/functions/dialectic-worker/continueJob.ts`    
            - Fix `continueJob.ts` to pass the failing test by correctly passing the entire payload and only overlaying keys that need updated. 
    [✅] b. [TEST-INT] Trigger function uses service-role Authorization and pg_net
        [✅] i. **File**: `supabase/integration_tests/services/triggers.integration.test.ts`
            - Extend introspection to assert `public.invoke_dialectic_worker` body contains both:
              `current_setting('secret.SUPABASE_SERVICE_ROLE_KEY')` and `FROM pg_extension WHERE extname = 'pg_net'` (or equivalent pg_net guard clause).
            - Keep `on_new_job_created` unchanged (AFTER INSERT; no status filters).
    [✅] c. [DB-MIGRATION] CREATE OR REPLACE `public.invoke_dialectic_worker` to standardize Authorization and extension guard
        [✅] i. **File**: `supabase/migrations/*_fix_auth_header.sql`
            - Build headers with JSONB: `jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('secret.SUPABASE_SERVICE_ROLE_KEY'))`.
            - Guard on pg_net only: `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN … END IF;`
            - Compute the functions URL for cloud/local; do not introduce fallbacks that mutate behavior.
            - Add NOTICE diagnostics (redacted) for URL and `auth_source: 'service_role'`.
            - Do not alter or add status-based trigger filters; keep `on_new_job_created` idempotent.
    [✅] d. [DB-MIGRATION] CREATE OR REPLACE `public.handle_job_completion` to use predicate-based incomplete checks
        [✅] i. **File**: `supabase/migrations/*_fix_auth_header.sql`
            - Replace `status IN ('pending','processing','retrying')` checks with predicate equivalents:
              `(status LIKE 'pending%' OR status LIKE 'processing%' OR status LIKE 'retrying%')` so future suffixed variants remain covered.
            - Leave `on_job_terminal_state` trigger unchanged; the WHEN clause remains terminal-only.

        [✅] ii. [DB-MIGRATION] Add durable trigger diagnostics to `public.invoke_dialectic_worker`
            [✅] i. **File**: `supabase/migrations/*_fix_auth_header.sql`
            [✅] ii. Before `net.http_post`, insert row into `public.dialectic_trigger_logs` with: `{ job_id: NEW.id, status: NEW.status, url: v_functions_url, has_auth: (header value IS NOT NULL), phase: 'before_post' }`.
            [✅] iii. After successful `net.http_post`, insert row with `phase: 'after_post'`.
            [✅] iv. In the EXCEPTION block, insert row with `phase: 'post_failed'` and `error: SQLERRM`.
            [✅] v. Do not change trigger timing or add status filters.
           
    [ ] e. [TDD-FIX] Guarantee payload JWT presence/preservation at all handoffs (single-file steps)
        [✅] A. continueJob (one file only)
            [✅] 1) RED — continueJob
                - **File**: `supabase/functions/dialectic-worker/continueJob.test.ts`
                - Add test: "continueJob enforces contract: missing payload.user_jwt causes immediate failure" (throw/error; no insert; no mutation).
                - Add test: "continueJob passes through a correctly constructed payload unchanged" (payload includes user_jwt; enqueues; payload unchanged).
            [✅] 2) GREEN — continueJob
                - **File**: `supabase/functions/dialectic-worker/continueJob.ts`
                - At function start: if `job.payload.user_jwt` is not a non-empty string, return `{ enqueued: false, error: new Error('payload.user_jwt required') }` and log; do not mutate payloads; do not insert.
                - When constructing the new payload, explicitly preserve `user_jwt` from the triggering job payload; do not synthesize/replace it.
            [✅] 3) PROVE — continueJob
                - Run unit tests; new tests are green; existing tests remain green.
        [✅] B. task_isolator (one file only)
            [✅] 1) RED — task_isolator
                - **File**: `supabase/functions/dialectic-worker/task_isolator.test.ts`
                - Add test: "planComplexStage constructs child execute payloads with user_jwt inherited from parent job payload" (all child payloads include the exact parent `payload.user_jwt`; no post-hoc patching).
                - Add test: "planComplexStage throws when parent payload.user_jwt is missing/empty" (no jobs created).
            [✅] 2) GREEN — task_isolator
                - **File**: `supabase/functions/dialectic-worker/task_isolator.ts`
                - When constructing child payloads, set `user_jwt` strictly from `parentJob.payload.user_jwt`; if missing/empty, throw. Do not use `authToken` as a fallback or replacement.
            [✅] 3) PROVE — task_isolator
                - Run unit tests; new tests green; existing tests remain green.
        [✅] C. planner: planPerSourceDocument (one file only)
            [✅] 1) RED — planner
                - **File**: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts`
                - Add test: child execute payloads include `user_jwt` copied from `parentJob.payload.user_jwt`.
                - Add test: throws when `parentJob.payload.user_jwt` is missing/empty.
            [✅] 2) GREEN — planner
                - **File**: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts`
                - Use `parentJob.payload.user_jwt` for child payloads; never use `authToken` as a fallback; throw if missing.
            [✅] 3) PROVE — planner
                - Run unit tests; new tests green; existing tests remain green.
        [✅] D. executeModelCallAndSave (one file only)
            [✅] 1) RED — executeModelCallAndSave
                - **File**: `supabase/functions/dialectic-worker/executeModelCallAndSave*.test.ts`
                - Add test: "missing payload.user_jwt causes immediate failure before adapter call" (no adapter invocation; no DB mutation).
                - Add test: "uses only payload.user_jwt, never an external authToken fallback".
            [✅] 2) GREEN — executeModelCallAndSave
                - **File**: `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`
                - Remove fallback to function `authToken`; require `job.payload.user_jwt` and throw if missing/empty.
            [✅] 3) PROVE — executeModelCallAndSave
                - Run unit tests; new tests green; existing tests remain green.
        [✅] E. generateContributions (one file only)
            [✅] 1) RED — generateContributions
                - **File**: `supabase/functions/dialectic-service/generateContribution.test.ts`
                - Add test: "missing authToken fails and does not insert jobs".
                - Add test: "plan jobs are constructed with payload.user_jwt equal to provided authToken".
            [✅] 2) GREEN — generateContributions
                - **File**: `supabase/functions/dialectic-service/generateContribution.ts`
                - Validate `authToken` at entry; fail fast if missing/empty; ensure payload construction includes `user_jwt`.
            [✅] 3) PROVE — generateContributions
                - Run tests; new tests green; existing tests remain green.
        [ ] F. worker threading (one file only)
            [✅] 1) RED — worker handler
                - **File**: `supabase/functions/dialectic-worker/index.test.ts` (or add minimal test file)
                - Add test: "handleJob NEVER patches or injects user_jwt; it only consumes payloads as-is" (when missing, the handler throws an error).
            [✅] 2) GREEN — worker handler
                - **File**: `supabase/functions/dialectic-worker/index.ts`
                - Ensure no code path mutates or injects `payload.user_jwt`; pass-through only.
            [✅] 3) PROVE — worker handler
                - Run tests; green.
        [✅] F. Integration verification (no edits)
            - **File**: `supabase/integration_tests/services/continuation_dispatch.integration.test.ts`
            - Assert continuation rows transition pending_continuation → processing → terminal; diagnostics show `contHasJwt: true`; no missing-Authorization errors.

        [ ] G. processSimpleJob transformation correctness (plan → execute)
            [✅] 1) RED — processSimpleJob
                - **Problem**: For simple stages, the worker transforms a 'plan' job into an 'execute' payload in-memory. The integration logs show initial plan jobs include `payload.user_jwt`, but the downstream `executeModelCallAndSave` path fails with "payload.user_jwt required", indicating `user_jwt` is dropped during this plan→execute transformation.
                - **File**: `supabase/functions/dialectic-worker/processSimpleJob.test.ts` (append tests at end)
                - Add test: "when transforming plan→execute, payload.user_jwt must be preserved"
                  - Arrange: plan payload includes valid `user_jwt` and minimal required fields; set `continueUntilComplete` as needed to hit execute path.
                  - Act: run `processSimpleJob` with deps wired to a spy on `executeModelCallAndSave`.
                  - Assert: the execute payload passed into `executeModelCallAndSave` contains a non-empty `user_jwt` equal to the original plan payload value.
                - Add test: "missing payload.user_jwt fails early (no healing/injection)"
                  - Arrange: plan payload omits `user_jwt`.
                  - Act: run `processSimpleJob`.
                  - Assert: returns/throws an error; job not progressed; `executeModelCallAndSave` not called.
            [✅] 2) GREEN — processSimpleJob
                - **File**: `supabase/functions/dialectic-worker/processSimpleJob.ts`
                - Ensure the execute payload is constructed strictly by copying through all required fields from the plan payload, including `payload.user_jwt` (no injection, no substitution from handler authToken).
                - Before calling `executeModelCallAndSave`, validate `payload.user_jwt` is a non-empty string; on failure, mark job failed (or bubble a clear error) without attempting to heal.
            [✅] 3) PROVE — processSimpleJob
                - **Files**: the two RED tests above (now GREEN) and the integration test `continuation_dispatch.integration.test.ts`.
                - Re-run both the unit tests for `processSimpleJob` and the continuation integration test.
                - Verify: unit tests confirm preservation and fail-fast; integration logs show continuation rows progress and diagnostics report `contHasJwt: true`.

            [✅] 4) RED — processJob (plan → execute transform)
                - **Problem**: For simple stages, `processJob` rebuilds an execute payload and overwrites the original, dropping `payload.user_jwt`.
                - **Files**:
                  - `supabase/functions/dialectic-worker/processJob.test.ts` (append tests at end; create file if missing)
                - Add test: "plan→execute transform preserves payload.user_jwt"
                  - Arrange: plan job payload includes a valid non-empty `user_jwt` and minimal required plan fields for a simple stage.
                  - Act: call `processJob` with spies on `processSimpleJob` to capture the transformed job.
                  - Assert: the transformed execute job passed into `processSimpleJob` has `payload.user_jwt` equal to the original value; assert non-empty string.
                - Add test: "missing payload.user_jwt in plan job fails before transform"
                  - Arrange: plan payload omits `user_jwt`.
                  - Act: call `processJob`.
                  - Assert: returns/throws a clear error and/or marks job as failed with an auth error; must NOT call `processSimpleJob`.

            [✅] 5) GREEN — processJob
                - **File**: `supabase/functions/dialectic-worker/processJob.ts`
                - In the simple-stage branch where the execute payload is constructed, strictly copy through `payload.user_jwt` from the incoming plan payload (no fallback to handler `authToken`).
                - Validate `user_jwt` is a non-empty string in the incoming plan payload prior to constructing `executePayload`; on failure, fail fast without attempting to heal or inject.
                - Ensure no other fields overwrite or remove `user_jwt` during the transform.

            [✅] 6) PROVE — processJob
                - **Files**: `processJob.test.ts` (new tests) + `continuation_dispatch.integration.test.ts`.
                - Re-run unit tests for `processJob` to confirm preservation and fail-fast behavior.
                - Re-run the continuation integration test and verify:
                  - initial jobs move beyond the plan→execute transform (no AUTH_MISSING at start of `processSimpleJob`)
                  - continuation row exists with `contHasJwt: true` and proceeds to processing/terminal as expected.

    [ ] f. [TEST-INT] GREEN: continuation dispatch works end-to-end without missing-Authorization errors
        [ ] i. **File**: `supabase/integration_tests/services/continuation_dispatch.integration.test.ts`
            - Re-run and assert continuation rows transition `pending_continuation` → `processing` → terminal.
            - Assert no "Missing authorization header" logs are captured during the run.
    [ ] g. [TEST-INT] Pipeline hardening (drain & predicates)
        [ ] i. **File**: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
            - Add drain that treats any status starting with `pending` as in-queue; ensure queue empties before advancing stages.
            - Assert zero `pending_continuation` rows before proceeding.
    [ ] g. [TEST-UNIT] Worker entry continues to enforce Authorization header (contract remains explicit)
        [ ] i. **File**: `supabase/functions/dialectic-worker/index.test.ts`
            - Case A: Missing `Authorization` → returns 400 with error message; no processing performed.
            - Case B: Present `Authorization` (dummy token) → handler accepts and begins processing (mocked deps).
    [ ] h. [COMMIT] fix(be,db): continuation payload pass-through; trigger uses service-role + pg_net; completion uses predicate statuses; worker auth consistent

[ ] H. Stage slug consistency (ONE FILE AT A TIME: RED → GREEN → PROVE)
    [✅] H.1) RED — task_isolator (planner delegates)
        - File: `supabase/functions/dialectic-worker/task_isolator.test.ts` (append at end)
        - Add tests asserting dynamic stage invariants without hardcoding:
          - "planComplexStage constructs execute child rows with consistent stage markers"
            - Assert for each child: `row.stage_slug === payload.stageSlug` and both equal the stage derived from the parent’s payload/recipe context.
          - "missing/empty parent payload.stageSlug fails immediately (no jobs created)".
    [✅] H.2) GREEN — task_isolator
        - File: `supabase/functions/dialectic-worker/task_isolator.ts`
        - When mapping child rows, set `child.stage_slug` from the same dynamic value used for `payload.stageSlug` (parent payload.stageSlug). Do not synthesize or default.
    [✅] H.3) PROVE — task_isolator
        - Run unit tests for `task_isolator.test.ts`; confirm invariants hold.

    [✅] H.4) RED — processJob (simple transform path)
        - File: `supabase/functions/dialectic-worker/processJob.test.ts` (append at end)
        - Add test: "plan→execute simple transform preserves dynamic stage consistency"
          - Arrange a non-thesis simple stage where DB `stage_slug` equals `payload.stageSlug`.
          - Assert the transformed execute job passed to `processSimpleJob` satisfies `row.stage_slug === payload.stageSlug` and both match the expected dynamic stage (derived, not hardcoded).
    [✅] H.5) GREEN — processJob
        - File: `supabase/functions/dialectic-worker/processJob.ts`
        - In the simple-stage transform, copy stage solely from incoming `payload.stageSlug` into the execute payload; do not derive from DB row or defaults.
    [✅] H.6) PROVE — processJob
        - Run unit tests for `processJob.test.ts`; confirm invariants hold.

    [✅] H.7) RED — planPerSourceDocument (granularity planner)
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.test.ts` (append at end)
        - Add test: "planner constructs child payloads with dynamic stage consistency" asserting `payload.stageSlug` equals the parent’s dynamic stage for every child.
    [✅] H.8) GREEN — planPerSourceDocument
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocument.ts`
        - Ensure `payload.stageSlug` is inherited from parent payload; no injection/defaulting.
    [✅] H.9) PROVE — planPerSourceDocument
        - Run unit tests for the planner; confirm invariants hold.

    [✅] H.10) RED — planPerSourceGroup
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.test.ts` (append at end)
        - Add test asserting all children have `payload.stageSlug` equal to the parent’s dynamic stage (no hardcoding).
    [✅] H.11) GREEN — planPerSourceGroup
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceGroup.ts`
        - Inherit `payload.stageSlug` from parent payload for every child; no synthesis/defaults.
    [✅] H.12) PROVE — planPerSourceGroup
        - Run unit tests; confirm invariants hold.

    [✅] H.13) RED — planPerSourceDocumentByLineage
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.test.ts` (append at end)
        - Add test asserting child `payload.stageSlug` equals the parent’s dynamic stage for every lineage group.
    [✅] H.14) GREEN — planPerSourceDocumentByLineage
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`
        - Inherit `payload.stageSlug` from parent payload; no defaults or hardcoding.
    [✅] H.15) PROVE — planPerSourceDocumentByLineage
        - Run unit tests; confirm invariants hold.

    [✅] H.16) RED — planPairwiseByOrigin
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.test.ts` (append at end)
        - Add test asserting both children in each pair have `payload.stageSlug` equal to the parent’s dynamic stage.
    [✅] H.17) GREEN — planPairwiseByOrigin
        - File: `supabase/functions/dialectic-worker/strategies/planners/planPairwiseByOrigin.ts`
        - Inherit `payload.stageSlug` from parent for all constructed child payloads.
    [✅] H.18) PROVE — planPairwiseByOrigin
        - Run unit tests; confirm invariants hold.

    [✅] H.19) RED — planAllToOne
        - File: `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.test.ts` (append at end)
        - Add test asserting the single child’s `payload.stageSlug` equals the parent’s dynamic stage.
    [✅] H.20) GREEN — planAllToOne
        - File: `supabase/functions/dialectic-worker/strategies/planners/planAllToOne.ts`
        - Inherit `payload.stageSlug` from parent when constructing the single child payload.
    [✅] H.21) PROVE — planAllToOne
        - Run unit tests; confirm invariants hold.

    [🚧] H.22) PROVE — integration diagnostics only (no edits)
        - File: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        - At verification points, log `{ id, status, row_stage: stage_slug, payload_stage: payload.stageSlug }` and assert equality before dereferencing contributions to catch mismatches early.
        - Confirm antithesis flow produces contributions and no 409 duplicates due to stage path collisions.

[ ] 5. [TDD] Fix continuation file path generation to prevent overwrites
    [✅] a. [TYPES] Ensure PathContext supports continuation flags
        [✅] i. In `supabase/functions/_shared/types/file_manager.types.ts`, verify that the `PathContext` interface includes optional `isContinuation?: boolean` and `turnIndex?: number` properties. If not, add them. This change is a prerequisite for subsequent steps.
    [✅] b. [TEST-UNIT] RED: Prove `executeModelCallAndSave` constructs an incomplete `pathContext` for continuations
        [✅] i. In a new or existing test file for `executeModelCallAndSave` (e.g., `supabase/functions/dialectic-worker/executeModelCallAndSave.test.ts`), add a failing test case.
        [✅] ii. The test will prove that when handling a continuation job, the `pathContext` within the `UploadContext` passed to `fileManager.uploadAndRegisterFile` is missing the `isContinuation` and `turnIndex` flags.
        [✅] iii. To do this, create a mock continuation job, spy on the `fileManager.uploadAndRegisterFile` method, call `executeModelCallAndSave`, and assert that `uploadContext.pathContext.isContinuation` is undefined or false.
    [✅] c. [BE] GREEN: Correctly populate `pathContext` for continuation jobs
        [✅] i. In `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`, modify the creation of the `uploadContext` object.
        [✅] ii. Move the `isContinuation` and `turnIndex` properties from the `contributionMetadata` object and place them directly into the `pathContext` object to ensure the path constructor receives all necessary information.
    [✅] d. [REFACTOR] Introduce dependency injection for FileManagerService to enable testing
        [✅] i. [BE] Modify FileManagerService to accept its dependencies
            [✅] 1. In `supabase/functions/_shared/services/file_manager.ts`:
                [✅] a. Add a new exported interface `FileManagerDependencies` that includes `{ constructStoragePath: typeof constructStoragePath }`.
                [✅] b. Modify the `FileManagerService` constructor to accept a `dependencies` object of this type as its second argument.
                [✅] c. Store the injected `constructStoragePath` function on a private class property (e.g., `this.constructStoragePath`).
                [✅] d. Replace all internal, direct calls to the imported `constructStoragePath` with `this.constructStoragePath`.
        [✅] ii. [BE] Update production call sites of FileManagerService
            [✅] 1. In `supabase/functions/dialectic-worker/index.ts`:
                [✅] a. Import the real `constructStoragePath` function.
                [✅] b. When creating `FileManagerService`, instantiate it with the real dependencies: `new FileManagerService(adminClient, { constructStoragePath })`.
            [✅] 2. In `supabase/functions/dialectic-service/startSession.ts`:
                [✅] a. Import the real `constructStoragePath`.
                [✅] b. Update the instantiation to: `new FileManagerService(dbClient, { constructStoragePath })`.
        [✅] iii. [TEST-INT] Update integration test call sites of FileManagerService
            [✅] 1. In `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`:
                [✅] a. Import the real `constructStoragePath`.
                [✅] b. Update the instantiation to: `new FileManagerService(adminClient, { constructStoragePath })`.
            [✅] 2. In `supabase/integration_tests/services/continuation_dispatch.integration.test.ts`:
                [✅] a. Import the real `constructStoragePath`.
                [✅] b. Update the instantiation to: `new FileManagerService(adminClient, { constructStoragePath })`.
    [✅] e. [TEST-UNIT] RED: Prove `FileManagerService` incorrectly synthesizes `pathContext` for continuations
        [✅] i. In `supabase/functions/_shared/services/file_manager.upload.test.ts`, add a new failing test case written to the final, GREEN state.
        [✅] ii. The test will prove that the service fails to correctly synthesize the `pathContext` passed to `constructStoragePath`. The correct behavior is to preserve stable identifiers from the base `pathContext` while correctly sourcing turn-specific data from `contributionMetadata` and initializing the `attemptCount`.
        [✅] iii. To do this, the test will:
            [✅] 1. Create a base `pathContext` with correct stable identifiers (`projectId`, `sessionId`, `modelSlug`, etc.) but intentionally stale turn-specific data (e.g., `isContinuation: false`, `attemptCount: 5`).
            [✅] 2. Create an `UploadContext` that includes this base context and `contributionMetadata` with correct, fresh turn-specific data (`isContinuation: true`, `turnIndex: 1`).
            [✅] 3. Inject a spy for the `constructStoragePath` dependency.
            [✅] 4. Call `uploadAndRegisterFile`.
            [✅] 5. Assert that the `pathContext` passed to the spy contains the **correctly merged and initialized data**:
                [✅] a. **Preserved values**: `projectId`, `sessionId`, `modelSlug`, `stageSlug`, `contributionType` must match the base `pathContext`.
                [✅] b. **Sourced values**: `isContinuation` and `turnIndex` must match the `contributionMetadata`.
                [✅] c. **Initialized value**: `attemptCount` must be `0`, as this is the first attempt for this specific file.    
    [✅] f. [BE] GREEN: Correct the faulty path context synthesis in `FileManagerService`
        [✅] i. **File**: `supabase/functions/_shared/services/file_manager.ts`
        [✅] ii. **Action**: Modify the `isContinuation` logic block within the `uploadAndRegisterFile` method.
        [✅] iii. **Change**: The current logic incorrectly overwrites `attemptCount` with `turnIndex`, which conflates two distinct concepts and causes downstream errors. The fix is to ensure that when `isContinuation` is true, the `pathContextForStorage` correctly sources `isContinuation: true` and `turnIndex` from `contributionMetadata` while preserving the incoming `attemptCount` from `context.pathContext`. This ensures that the subsequent upload loop can manage retry attempts correctly for each turn.
        [✅] iv. **Code (Conceptual)**:
            ```typescript
            if (isContinuation) {
              pathContextForStorage = {
                ...context.pathContext,
                isContinuation: true,
                turnIndex: context.contributionMetadata?.turnIndex,
                // `attemptCount` from context.pathContext is preserved by the spread operator
              };
            }
            ```
    [ ] g. [REFACTOR/TEST-UNIT] Refactor continuation cleanup test to assert behavior, not implementation
        [✅] i. [TEST-UNIT] RED: Prove the existing test is brittle and implementation-coupled
            [✅] 1. **File**: `supabase/functions/_shared/services/file_manager.upload.test.ts`
            [✅] 2. **Problem**: The test named `"should reject continuation without target_contribution_id and cleanup uploaded files"` is fundamentally flawed. Instead of testing the behavioral contract ("the file that was created is the one that was deleted"), it creates a parallel implementation of the service's internal logic by calling `constructStoragePath` itself to build an "expected" path. This makes the test brittle; any valid refactor of the service's internal path generation logic could break the test, or worse, allow a bug to go undetected.
            [✅] 3. **Action**: The current test failure, which is caused by a mismatch between the test's parallel logic and the service's actual logic, serves as the RED state. It proves the test is brittle and coupled to implementation details. No code change is required to demonstrate this flaw.
        [✅] ii. [TEST-UNIT] GREEN: Refactor the test to use spies and assert the behavioral contract
            [✅] 1. **File**: `supabase/functions/_shared/services/file_manager.upload.test.ts`
            [✅] 2. **Action**: Rewrite the failing test to remove the parallel implementation and directly test the service's behavior.
            [✅] 3. **Change**:
                [✅] a. Inject a `spy` on the `constructStoragePath` dependency when instantiating the `FileManagerService` for this test.
                [✅] b. When `uploadAndRegisterFile` is called, the spy will capture the *actual* path returned by the service's internal call to `constructStoragePath`.
                [✅] c. Modify the assertion to check that the argument passed to the `storage.remove` spy is identical to the path captured by the `constructStoragePath` spy. This directly verifies the contract without mirroring any logic.
        [✅] iii. [TEST-UNIT] PROVE: Verify the refactored test passes
            [✅] 1. **File**: `supabase/functions/_shared/services/file_manager.upload.test.ts`
            [✅] 2. **Action**: Re-run the test suite. The refactored test must now pass, confirming it correctly validates the cleanup behavior in a robust and implementation-agnostic way. 
    [ ] h. [TDD] Fix upstream `turnIndex` population in `executeModelCallAndSave`
        [✅] i. [TEST-UNIT] RED: Prove `executeModelCallAndSave` fails to pass `turnIndex` correctly
            [✅] 1. **File**: `supabase/functions/dialectic-worker/executeModelCallAndSave.continue.test.ts`
            [✅] 2. **Action**: Modify the existing test case, "continuation jobs should populate pathContext with continuation flags".
            [✅] 3. **Change**: The current test asserts `turnIndex` is `1`. This is insufficient to prove our bug. Modify the `continuationPayload` inside this test to set `continuation_count: 2`. Then, modify the final assertion to expect the `turnIndex` to be `2`.
            [✅] 4. **Expectation**: This test MUST fail because the implementation is currently hardcoding or incorrectly deriving the `turnIndex` instead of sourcing it from `job.payload.continuation_count`. This proves the bug.
        [✅] ii. [BE] GREEN: Correctly pass `turnIndex` from the job payload
            [✅] 1. **File**: `supabase/functions/dialectic-worker/executeModelCallAndSave.ts`
            [✅] 2. **Action**: Locate the construction of the `uploadContext` object. Modify the `pathContext` to correctly source the `turnIndex` from `job.payload.continuation_count`.
            [✅] 3. **Code**: `turnIndex: isContinuationForStorage ? job.payload.continuation_count : undefined,`
        [✅] iii. [TEST-UNIT] PROVE: Verify the `executeModelCallAndSave` fix
            [✅] 1. **File**: `supabase/functions/dialectic-worker/executeModelCallAndSave.continue.test.ts`
            [✅] 2. **Action**: Re-run the test modified in step `h.i`. It must now pass.
   [ ] i. [TEST-INT] PROVE: Verify the end-to-end fix with the pipeline integration test
       [✅] i. In `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`, the existing test is the proof, but it must first be stabilized.
       [✅] ii. **Identify and Resolve Race Condition:** The test is currently unstable. It executes two asynchronous jobs (`jobA` and `jobB`) back-to-back and then polls for the result of the first job. This creates a race condition where the polling for Job A's status can start *before* the database write operation to update its status has completed, leading to a timeout.
       [✅] iii. **Action - Serialize Test Operations:** To fix this, the test logic must be reordered to ensure a deterministic sequence. Modify Step 3 (`should generate contributions for Thesis stage...`) to perform the following operations in strict order:
           1.  Execute `handleJob` for `jobA`.
           2.  **Immediately** `await pollForJobStatus` to confirm `jobA`'s status is `'retrying'`. This acts as a synchronization barrier, pausing the test until the database is updated.
           3.  Only after Job A's status is confirmed, execute `handleJob` for `jobB`.
           4.  Proceed with polling for the status of `jobB` and the rest of the test assertions.
       [✅] iv. **Stabilize Test Assertions:** The fix for the initial race condition has successfully revealed a second instability: a state leakage failure between test steps. The test now fails when Step 4 is enabled because the setup for Step 4 creates new jobs that cause the broad assertions at the end of Step 3 to fail. We must now scope Step 3's assertions to be self-contained before we can perform the final verification.
       [✅] v. **Action - Scope Step 3 Assertions:** The final `pollForCondition` at the end of Step 3 must be modified to be specific *only* to the jobs created and processed within that step.
           1.  Create an array (`thesisStageJobIds`) at the beginning of Step 3.
           2.  Capture the UUIDs of the initial `jobA` and `jobB` and add them to this array.
           3.  When polling for and identifying the continuation and retry jobs, capture their UUIDs and add them to the array as well.
           4.  Rewrite the final `pollForCondition` logic. The query must now be scoped to the collected IDs: `...select('id').in('id', thesisStageJobIds).in('status', ['pending', ...])`. This will ensure the assertion only validates the outcome of Step 3's work.
       [🚧] vi. **Verification:** With both the initial race condition and the cross-step assertion logic now fixed, the integration test is finally stable. Run the full test and examine the logs to provide a definitive confirmation that the original `409 Duplicate` error is resolved and the entire pipeline can complete successfully without intermittent failures.
       [✅] vii. **Identify and Resolve Root Cause of 409 Error:** The previous test stabilization steps have successfully revealed that the original `409 Duplicate` error is the true root cause of the test's instability. The error occurs because the `antithesis` stage in the database is misconfigured to use the `per_source_document` granularity planner, which does not provide enough unique context to the `path_constructor` when multiple models critique the same source document.
       [✅] viii. **Action - Correct Seed Data Configuration:** The fix is not in the application code but in the data used to seed the database. The `seed.sql` file must be updated to include the `INSERT` statements for the `dialectic_stages` table. Within these new statements, the `input_artifact_rules` for the `antithesis` stage must specify `per_source_document_by_lineage` as its `granularity_strategy`. This will engage the correct planner that groups source documents by their origin, providing the necessary context to generate unique filenames and resolve the conflict.
       [✅] ix. **Verification:** After reseeding the database with the corrected `dialectic_stages` definition, run the full integration test. The test should now pass all steps reliably, confirming that both the initial race condition and the underlying `409 Duplicate` error are fully resolved.
    [ ] x. **Stabilize and Correct Test Logic for Final Verification:** The previous fixes have successfully addressed the database configuration and initial race conditions, but have revealed two problems: a non-deterministic model behavior in Step 3 and a logic flaw in the `planPerSourceDocumentByLineage` planner that causes Step 4 to fail. We will now address these using a strict TDD approach.
    [✅] xi. **Part 1: Deterministically Control Step 3 Model Behavior**
        [✅] i. **RED - Prove the Flaw:** The current test log (`step3failStep4Fail.log`) provides the proof. Step 3 fails intermittently with a timeout because the test asserts that all jobs must be `completed`. However, the dummy adapter for Model A can sometimes return a `finish_reason: 'max_tokens'`, which causes an unexpected continuation job to be created. The test does not account for this new job, and the polling condition fails.
        [✅] ii. **GREEN - Implement the Fix:** The fix is to explicitly control the model's continuation behavior within the test.
            1. **File to Edit:** `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
            2. **Action:** Locate the `jobAPayload` object created at the beginning of Step 3. Add the property `continue_until_complete: false` to this payload. This instructs the job handler to disregard a `max_tokens` finish reason from the adapter and force the job's status to `completed`, aligning with the test's assertion. This also serves as a negative test for the `continue_until_complete` flag.
        [✅] iii. **VERIFY - Prove the Fix:** Run the integration test with only Steps 1, 2, and 3 enabled. The test should now pass Step 3 reliably every time, as Model A's behavior is now deterministic.
    [✅] xii. **Part 2: Correct the Antithesis Stage Planner Logic**
        [✅] i. **RED - Prove the Flaw:** The test log (`step3passStep4Fail.log`) provides the proof. When Step 4 is enabled, it fails because no jobs are created for the 'Antithesis' stage. The log contains the warning: `[planPerSourceDocumentByLineage] Source document ... is missing a source_group in document_relationships. It will be skipped.` This confirms the planner is discarding the newly-created Thesis documents instead of processing them.
        [✅] ii. **GREEN - Implement the Fix:** The `planPerSourceDocumentByLineage` planner is responsible for establishing lineage when it doesn't exist. It must be modified to handle this initial case.
            1. **File to Edit:** `supabase/functions/dialectic-worker/strategies/planners/planPerSourceDocumentByLineage.ts`
            2. **Action:** Modify the loop that iterates over `sourceDocs`. If a document is missing a `source_group` (`doc.document_relationships?.source_group`), the planner should treat it as the root of a new lineage. The logic should be updated to use the document's own `id` as the `groupId` in this scenario, ensuring it is correctly grouped and processed.
        [✅] iii. **VERIFY - Prove the Fix:** Run the full integration test with all steps enabled. With the planner logic corrected, the Antithesis jobs will be created, Step 4 will pass, and the entire pipeline will complete successfully and deterministically.
   [ ] xiii. **Part 3: Stabilize Antithesis Stage Test Execution**
       [✅] i. **RED - Prove the Flaw:** The test log (`test.log`) proves the flaw. Step 5 fails with a timeout error: `Timeout waiting for condition: All jobs for the antithesis stage, including parents, should be completed`. This happens because a race condition exists between Step 4 and Step 5. The test attempts to execute the child jobs in Step 5 immediately after they are created in Step 4, but the execution query runs before the database transaction that creates the jobs has fully committed. As a result, the job executor finds no pending jobs to run, and the test's final polling condition times out.
       [✅] ii. **GREEN - Implement the Fix:** The fix is to eliminate the race condition by adding a synchronization barrier to the end of Step 4, ensuring the child jobs are visible in the database before Step 5 begins.
           1. **File to Edit:** `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
           2. **Action:** At the end of Step 4 (`should plan child jobs for the Antithesis stage`), after the parent jobs have been processed, add a `pollForCondition` block. This new block will poll the `dialectic_generation_jobs` table until it confirms that the four expected child jobs exist and have a status of `'pending'`. This guarantees that the test will not proceed to Step 5 until the child jobs are ready for execution.
       [✅] iii. **VERIFY - Prove the Fix:** Run the full integration test. With the race condition resolved, Step 4 will now correctly wait for the child jobs to be created, and Step 5 will begin.

## Isolate Test Runner from Database Trigger

[ ] 1. [BE] RED: Add diagnostic logging to differentiate execution context
    [✅] a. [TEST-UNIT] RED: Prove `handleJob` does not yet log the execution context
        [✅] i. **File**: `supabase/functions/dialectic-worker/index.test.ts`
        [✅] ii. Write a new test titled: "should log isTestRunner context when the flag is present in the payload".
        [✅] iii. **Arrange**:
            [✅] 1. Create a mock `ILogger` with a spy on its `info` method (e.g., `const loggerSpy = spy(mockLogger, 'info');`).
            [✅] 2. Create a mock `IDialecticJobDeps` object that includes this spied-upon logger.
            [✅] 3. Create a mock `DialecticJobRow` object. Its `payload` must include the property `"is_test_runner_context": true`.
        [✅] iv. **Act**:
            [✅] 1. Call the `handleJob` function, passing in the mock job and mock dependencies.
        [✅] v. **Assert**:
            [✅] 1. Assert that the `loggerSpy` was called at least once.
            [✅] 2. Search through all the calls to the `loggerSpy` to find one where the first argument is `'[handleJob] context_check'`.
            [✅] 3. Assert that the second argument (the log payload object) for that specific call contains the key-value pair `{ isTestRunner: true }`.
        [✅] vi. **Expectation**: This test will fail because the `context_check` log entry does not exist yet.
    [✅] b. File: `supabase/functions/dialectic-worker/index.ts`
        [✅] i. In the `handleJob` function, immediately after the entry log, add logic to check for a temporary flag on the job payload, log its presence, and then remove it to prevent side effects.
            ```typescript
            // Conceptual code for diagnostics
            const isTestRunner = job.payload.is_test_runner_context ?? false;
            // Use an existing or new logger call to record the context
            deps.logger.info(`[handleJob] context_check`, { jobId: job.id, isTestRunner });
            ```

[✅] 2. [TEST-INT] RED: Create a new, dedicated test to prove the trigger can be isolated
    [✅] a. File: `supabase/integration_tests/services/job_trigger_isolation.integration.test.ts`
        [✅] i. Write a test titled "should not invoke worker for jobs marked as test jobs".
        [✅] ii. In the test, directly insert a job into `dialectic_generation_jobs` with a payload containing `{ "is_test_job": true }`.
        [✅] iii. Poll the `dialectic_trigger_logs` table for an entry with the new job's ID.
        [✅] iv. Assert that the `log_message` for this entry is `'Test job detected. Skipping HTTP worker invocation.'`. This test will fail as the trigger lacks this logic.

[✅] 3. [DB] GREEN: Modify the database trigger to ignore test-specific jobs
    [✅] a. File: `supabase/migrations/20250905142613_fix_auth_header.sql`
        [✅] i. Modify the `invoke_dialectic_worker` function. Add logic at the start to check for `NEW.payload ->> 'is_test_job'`. If true, log the "skipping" message to `dialectic_trigger_logs` and `RETURN NEW;` to stop execution.

[✅] 4. [TEST-INT] PROVE: Verify the trigger isolation test now passes
    [✅] a. Run the `job_trigger_isolation.integration.test.ts` file. The test from step 3 should now pass.
    [✅] b. [COMMIT] fix(db): prevent trigger from firing on test jobs

[ ] 5. [TEST-INT] GREEN: Apply the isolation fix to the main pipeline test
    [ ] a. File: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [✅] i. For every job created in the test, immediately after it is created, fetch it from the database and update its payload to include `"is_test_job": true`.
        [✅] ii. **Thesis Stage (Step 3)**
            [✅] - **2 initial jobs:** Created by `generateContributions` at **line 477**. Update their payloads after this call.
            [ ] - **1 continuation job:** Created implicitly when the first job for `modelBId` completes. The test verifies its creation at **line 556**. Update its payload after this verification.
        [ ] iii. **Antithesis Stage (Step 4)**
            [✅] - **2 parent planner jobs:** Created by `generateContributions` at **line 833**. Update their payloads after this call.
            [ ] - **4 child execution jobs:** Created implicitly when the parent jobs are executed via `executePendingDialecticJobs` at **line 851**. The test verifies their creation at **line 856**. Update their payloads after this verification.
        [ ] iv. **Synthesis Stage (Step 8)**
            [✅] - **2 parent planner jobs:** Created by `generateContributions` at **line 1043**.
            [ ] - **8 Step-1 child jobs:** Created implicitly by `executePendingDialecticJobs` at **line 1050**, verified at **line 1054**.
            [ ] - **4 Step-2 child jobs:** Created implicitly by `executePendingDialecticJobs` at **line 1063**, verified at **line 1066**.
            [ ] - **2 Step-3 child jobs:** Created implicitly by `executePendingDialecticJobs` at **line 1075**, verified at **line 1078**.
        [✅] v. **Parenthesis Stage (Step 9)**
            [✅] - **2 initial jobs:** Created by `generateContributions` at **line 1192**.
        [✅] vi. **Paralysis Stage (Step 10)**
            [✅] - **2 initial jobs:** Created by `generateContributions` at **line 1312**.

## Refine Test Injection Logic and Propagate Test Flag

### Part 1: Scope `SIMULATE_` Injection to Thesis Stage Only

[✅] 1. [TEST-INT] RED: Prove `SIMULATE_ERROR` is incorrectly injected into Antithesis jobs.
    [✅] a. File: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [✅] i. The existing test logs from our investigation already prove this flaw. The logs clearly show `[Test] Injecting SIMULATE_ERROR` for jobs in the Antithesis stage. This log is our proof of the flaw, so no code changes are needed to prove it exists.

[✅] 2. [SRC] GREEN: Restrict SIMULATE_ injection logic to the 'thesis' stage.
    [✅] a. File: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [✅] i. Modify the `executeModelCallAndSave` mock (around line 391).
        [✅] ii. Add a condition to the `if` statements that checks if the job is part of the thesis stage. The logic should look like this: `if (job.payload.stageSlug === 'thesis' && job.payload.model_id === modelAId)` and `else if (job.payload.stageSlug === 'thesis' && job.payload.model_id === modelBId)`.

[✅] 3. [TEST-INT] PROVE: Verify injection is now scoped correctly.
    [✅] a. Run the `dialectic_pipeline.integration.test.ts` test again.
    [✅] b. Examine the new `test.log`. The `[Test] Injecting SIMULATE_` messages should now *only* appear twice, for the initial ModelA and ModelB calls.

### Part 2: Propagate `is_test_job` Flag to Continuation Jobs

[✅] 4. [TEST-UNIT] RED: Prove continuation jobs do not inherit the `is_test_job` flag from the dialectic_generation_jobs.payload object.
    [✅] a. File: `supabase/functions/dialectic-worker/continueJob.test.ts` 
        [✅] i. Add a new Deno test case titled "continueJob should propagate 'is_test_job' flag from parent to new job".
        [✅] ii. Create a mock `parentJob` object. In its `dialectic_generation_jobs.payload` object, set `"is_test_job": true`.
        [✅] iii. Stub the `adminClient.from('dialectic_generation_jobs').insert` method to capture the job payload that `continueJob` tries to insert.
        [✅] iv. Call the `continueJob` function with the mock `parentJob` and other required mock dependencies.
        [✅] v. Assert that the captured payload passed to the `insert` stub contains the property `"is_test_job": true`.
        [✅] vi. Run the unit test; this assertion will fail.

[✅] 5. [SRC] GREEN: Pass the `is_test_job` flag during continuation.
    [✅] a. File: `supabase/functions/dialectic-worker/continueJob.ts`
        [✅] i. In the `continueJob` function, locate where the `newJobPayload` is constructed.
        [✅] ii. Add the `is_test_job` property to this new payload, copying it from the parent job's payload. The line should be `is_test_job: parentJob.payload.is_test_job,`.

[✅] 6. [TEST-UNIT] PROVE: Verify continuation jobs are now correctly marked.
    [✅] a. Run the unit test file again. The assertion from step 4 should now pass.
    [✅] b. The run produces 5 collisions because the test flag is set after the trigger activates. A more fundamental solution is required. 

### Part 3: Inject `is_test_job` Flag at Creation Source

[ ] 7. [TYPES] Add `is_test_job` to the payload interface.
    [ ] a. File: `supabase/functions/dialectic-service/dialectic.interface.ts`
    [ ] b. Add a new optional property to the `GenerateContributionsPayload` interface (line 321): `is_test_job?: boolean;`.

[ ] 8. [TEST-SRC] RED: Prove `generateContributions` does not apply the test flag.
    [ ] a. Create a new unit test file: `supabase/functions/dialectic-service/generateContribution.test.ts`.
    [ ] b. Add a Deno test case titled "should create jobs with an 'is_test_job' flag in the payload when specified".
    [ ] c. Create a mock `GenerateContributionsPayload` that includes `is_test_job: true`.
    [ ] d. Mock all necessary dependencies for `generateContributions`, especially the `dbClient`.
    [ ] e. Stub the `dbClient.from('dialectic_generation_jobs').insert()` method to capture the `payload` property of the object being inserted.
    [ ] f. Call `generateContributions` with the mock payload and dependencies.
    [ ] g. Assert that the `payload` object captured by the `insert` stub contains the key-value pair `"is_test_job": true`.
    [ ] h. Run the test; the assertion will fail because the current implementation discards that property when it builds the new `jobPayload`.

[ ] 9. [SRC] GREEN: Modify `generateContributions` to apply the test flag.
    [ ] a. File: `supabase/functions/dialectic-service/generateContribution.ts`
    [ ] b. Locate the `jobPayload` object construction at **line 113**.
    [ ] c. Add a conditional check: `if (payload.is_test_job) { jobPayload.is_test_job = true; }` right after the object is created. This will ensure the flag is added to the final payload that gets inserted.

[ ] 10. [TEST-SRC] GREEN: Prove the source code fix works.
    [ ] a. File: `supabase/functions/dialectic-service/generateContribution.test.ts`
    [ ] b. Run the test from step 9 again. The assertion should now pass.

[ ] 11. [TEST-INT] Refactor the integration test to use the new payload flag.
    [ ] a. File: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
    [ ] b. Delete the `markJobsAsTestJobs` helper function.
    [ ] c. Locate the `generatePayload` object within the `setup` function. Add the property `is_test_job: true` to this base payload.
    [ ] d. Remove all four now-redundant calls to `markJobsAsTestJobs` from the Thesis, Antithesis, Synthesis, and Parenthesis stages.

[ ] 12. [TEST-INT] Final Validation: Prove the race condition is resolved.
    [ ] a. Reset the test database.
    [ ] b. Run the main integration test file: `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`.
    [ ] c. Assert that the test now completes successfully with zero "409 Duplicate" errors in the log.
    
### Part 4: Propagate `is_test_job` Flag to Planner-Generated Child Jobs

[ ] 13. [TEST-UNIT] RED: Prove planner child jobs do not inherit the `is_test_job` flag.
    [ ] a. Create File: `supabase/functions/dialectic-worker/task_isolator.test.ts`
        [ ] i. Add a new Deno test case titled "planComplexStage should propagate 'is_test_job' flag to child jobs".
        [ ] ii. Create a mock parent `job` object. Its `payload` must include `"is_test_job": true`.
        [ ] iii. Mock all necessary dependencies for `planComplexStage`, ensuring the inputs will cause it to generate at least one child job.
        [ ] iv. Stub the `dbClient.from('dialectic_generation_jobs').insert` method to capture the array of jobs being created.
        [ ] v. Call `planComplexStage` with the mock parent job and its dependencies.
        [ ] vi. Assert that every job object in the array captured by the `insert` stub has a `payload` that contains `"is_test_job": true`.
        [ ] vii. Run the unit test; this assertion will fail.

[ ] 14. [SRC] GREEN: Pass the `is_test_job` flag from planner to children.
    [ ] a. File: `supabase/functions/dialectic-worker/task_isolator.ts`
        [ ] i. In the `planComplexStage` function, find where the `payload` for each new child job is defined (likely within a `.map()` over `childJobDefinitions`).
        [ ] ii. Add the `is_test_job` property to this new payload, copying it from the parent planner job: `is_test_job: job.payload.is_test_job,`.

[ ] 15. [TEST-UNIT] PROVE: Verify all child jobs are now correctly marked.
    [ ] a. Run the `task_isolator.test.ts` file again. The assertion from step 7 should now pass.

[ ] 16. [TEST-INT] PROVE: Verify the pipeline is fixed and the race condition is gone
    [ ] a. Run the full `dialectic_pipeline.integration.test.ts`. There should be no 409 Duplicate File errors.
    [ ] c. [COMMIT] test(int): resolve pipeline race condition by isolating test jobs






[ ] 6. [BE] Parse AI JSON response and process deliverables
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

### Review / Antithesis 

### Refinement / Synthesis 

### Planning / Parenthesis

### Implementation / Paralysis 


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

[ ] 3. [BE] Add optional “advisor” job users can run after any stage
    [ ] a. [TEST-UNIT] Add failing tests for enqueueing `advisor` on-demand
        [ ] i. File: `supabase/functions/dialectic-service/index.test.ts`
            - Action: `runAdvisor({ sessionId, stageSlug })` enqueues one `advisor` job with session/project context; DI respected.
            - RLS: only the session owner can enqueue.
    [ ] b. [BE] Implement enqueue in `supabase/functions/dialectic-service/index.ts`
        [ ] i. Handler `runAdvisor.ts` creates an `advisor` job for the given `{ sessionId, stageSlug }`.
    [ ] c. [TEST-UNIT] Add failing tests for `processAdvisorJob` worker in `supabase/functions/dialectic-worker/processAdvisorJob.test.ts`
        [ ] i. Asserts: gathers all contributions for `{ sessionId, stageSlug }` via RAG; calls model once (or batched if needed); writes comparison outputs.
    [ ] d. [BE] Implement `supabase/functions/dialectic-worker/processAdvisorJob.ts`
        [ ] i. DI for storage/db/model; collect all stage outputs; generate:
            - `advisor_comparison_matrix.md`, `advisor_comparative_analysis.md`, `advisor_recommendations.md`, `advisor_selection_rationale.md`.
            - Save as `dialectic_contribution` records; return success metrics.
    [ ] e. [BE] Route new job type in `supabase/functions/dialectic-worker/index.ts`
        [ ] i. Add dispatcher branch for `'advisor'` → `processAdvisorJob.ts`.
    [ ] f. [TEST-INT] Add/extend `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [ ] i. After any stage, call `runAdvisor`; assert comparison docs created and surfaced in outputs.
    [ ] g. [UI] Add "Run Advisor" button after each stage’s results list
        [ ] i. Disabled during async; shows outputs inline upon completion.
    [ ] h. [DOCS] Update developer docs describing advisor purpose/output and where it appears in the UI.
    [ ] i. [❓] [DB] If strict enums exist, ensure job-type includes `'advisor'`; add a contribution type for advisor artifacts as needed.


## Fix ChatWoot


