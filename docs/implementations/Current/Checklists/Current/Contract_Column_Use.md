## Findings

- **`resource_type` never persisted**  
  `findSourceDocuments` now filters every project-resource query on `resource_type`, but `FileManagerService.uploadAndRegisterFile` still omits that column. When we insert into `dialectic_project_resources` we only populate a handful of fields:

```175:184:supabase/functions/_shared/services/file_manager.ts
const recordData: TablesInsert<'dialectic_project_resources'> = {
    project_id: pathContextForStorage.projectId,
    user_id: context.userId!,
    file_name: finalFileName,
    mime_type: context.mimeType,
    size_bytes: context.sizeBytes,
    storage_bucket: this.storageBucket,
    storage_path: finalMainContentFilePath,
    resource_description: resourceDescriptionForDb,
};
```

With the current runtime data, every Supabase `.eq('resource_type', …)` call returns zero rows, even though our RED tests pass (mocks inject `resource_type` manually). That’s a production regression in waiting.

- **Multiple contract columns are never set**  
  According to `types_db.ts`, project-resource rows also expose `session_id`, `stage_slug`, `iteration_number`, and `source_contribution_id`, all nullable but intended to be written when the context knows them. Our resource insert path doesn’t touch any of those fields, so even after we start writing `resource_type`, consumers still have to peel everything out of `resource_description`.

- **Resources still read the legacy JSON contract**  
  The live readers (`dialectic-service/getSessionDetails.ts`, `dialectic-service/listStageDocuments.ts`) continue to filter on `resource_description->>type`. Until we refresh those call-sites, flipping all queries to the column alone would break them; likewise, migrating to the column-only contract requires a data backfill.

```77:89:supabase/functions/dialectic-service/getSessionDetails.ts
const query = dbClient
  .from('dialectic_project_resources')
  .select('id, storage_path, file_name, storage_bucket')
  .eq('project_id', session.project_id)
  .eq('resource_description->>type', 'seed_prompt');
```

## Recommended Path

1. **Audit file-manager writes by table**
   - `dialectic_project_resources`: add `resource_type` (derive from `context.resourceTypeForDb ?? pathContext.fileType`), propagate `session_id`, `stage_slug`, `iteration_number`, and `source_contribution_id` when `PathContext` supplies them, and preserve JSON metadata for backward compatibility.
   - `dialectic_contributions`: confirm we are covering all non-nullable fields (looks good—`types_db` shows only `session_id`, `stage`, `iteration_number`, `storage_*`, `file_name` are mandatory and already present).
   - `dialectic_feedback`: we currently omit `target_contribution_id`; decide whether upload contexts can/should provide it.

2. **Catalogue every consumer of `resource_description->>type`** (current list is short). Decide whether we can update them immediately or need a staged rollout (column population + dual reads + cleanup).

3. **Plan the migration**
   - Update `FileManagerService` (and any other writers, if they exist) to persist the full column set.
   - Backfill `resource_type`, `session_id`, `stage_slug`, `iteration_number`, `source_contribution_id` for existing rows (likely via one-off script or DB migration).
   - Once data is trustworthy, switch readers off the JSON path and remove the redundant payload.

4. **Add coverage**
   - Extend the new RED tests or add targeted unit tests around file-manager to prove it writes the column matrix correctly (e.g. resource upload with stage/session info, resource upload without, etc.).

This keeps production stable (queries still match via JSON) while letting us transition to the first-class columns that the planner now expects. Let me know when you want the detailed TDD checklist for the file-manager changes.

## Contract Column Alignment Plan

*   `[ ]` 1. **`[BE]` Persist full project-resource contract in `FileManagerService`**
    *   `[ ]` 1.a. `[TEST-UNIT]` In `supabase/functions/_shared/services/file_manager.upload.test.ts`, add coverage for `FileType.SeedPrompt` (and a generic resource) that asserts the insert payload includes `resource_type`, `session_id`, `stage_slug`, `iteration_number`, and `source_contribution_id` when those values exist in the path context.
    *   `[ ]` 1.b. `[BE]` In `supabase/functions/_shared/services/file_manager.ts`, populate the columns above using `context.resourceTypeForDb ?? pathContext.fileType` and the session/stage/iteration values from `pathContext`. Preserve the JSON `resource_description` but stop relying on it for typed metadata.
    *   `[ ]` 1.c. `[TEST-UNIT]` Re-run the file-manager suite to prove the new metadata contract is enforced.

*   `[ ]` 2. **`[BE]` Update resource readers in `task_isolator`**
    *   `[ ]` 2.a. `[TEST-UNIT]` In `supabase/functions/dialectic-worker/task_isolator.test.ts` and `task_isolator.parallel.test.ts`, RED the planner tests so they expect queries to filter on `resource_type`, `session_id`, and `stage_slug` rather than JSON paths.
    *   `[ ]` 2.b. `[BE]` In `supabase/functions/dialectic-worker/task_isolator.ts`, replace every `resource_description->>` filter with the corresponding column filters (`resource_type`, `document_key`, etc.) and prune the JSON fallback.
    *   `[ ]` 2.c. `[TEST-UNIT]` Ensure both task-isolator suites pass, proving seed prompts and header-context resources are now discoverable through the column contract.

*   `[ ]` 3. **`[BE]` Align session seed prompt lookup**
    *   `[ ]` 3.a. `[TEST-UNIT]` In `supabase/functions/dialectic-service/getSessionDetails.test.ts`, RED the seed prompt coverage so it asserts the query filters on `resource_type = 'seed_prompt'` (and session/stage matching) instead of `resource_description`.
    *   `[ ]` 3.b. `[BE]` Update `supabase/functions/dialectic-service/getSessionDetails.ts` to query by the new columns only, discarding the JSON predicate.
    *   `[ ]` 3.c. `[TEST-UNIT]` Re-run the session-details suite to confirm the assembled response still includes the seed prompt when the column contract is in place.

*   `[ ]` 4. **`[BE]` Refresh stage document listing contract**
    *   `[ ]` 4.a. `[TEST-UNIT]` Extend `supabase/functions/dialectic-service/listStageDocuments.test.ts` so it expects `resource_type = 'rendered_document'` and filters on the new job identifier column (e.g., `source_contribution_id`) rather than `resource_description->>job_id`.
    *   `[ ]` 4.b. `[BE]` Update `supabase/functions/dialectic-service/listStageDocuments.ts` to use the new columns when fetching rendered documents and associated metadata.
    *   `[ ]` 4.c. `[TEST-UNIT]` Re-run the list-stage-documents tests to demonstrate the worker/UI now receive properly typed document metadata.

*   `[ ]` 5. **`[BE]` Fix resource checks in `submitStageResponses`**
    *   `[ ]` 5.a. `[TEST-UNIT]` Add RED coverage in `supabase/functions/dialectic-service/submitStageResponses.test.ts` (or create it if missing) that proves required-document validation uses `resource_type`/`document_key` rather than raw `resource_description` comparisons.
    *   `[ ]` 5.b. `[BE]` Update `supabase/functions/dialectic-service/submitStageResponses.ts` to perform those checks via the new columns (and align any helper utilities as needed).
    *   `[ ]` 5.c. `[TEST-UNIT]` Re-run the submit-stage-responses suite to confirm the validation path passes with the column-based contract.