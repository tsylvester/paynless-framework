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

