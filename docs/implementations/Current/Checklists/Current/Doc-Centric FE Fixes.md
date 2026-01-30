# Doc-Centric Front End Fixes

[ ] // So that find->replace will stop unrolling my damned instructions! 

## Problem Statement
-The doc-centric backend refactor is complete. The front end needs updated to consume the documents.  

## Objectives
- Transform the front end for displaying documents and enabling feedback. 

## Expected Outcome
- Users can complete the entire dialectic work flow.

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn so that you remember your instructions. 

# Work Breakdown Structure

*   `[✅]` 1. **[STORE] Fix `handleRenderCompletedLogic` to update document descriptor without requiring `stepKey`**
    *   `[✅]` 1.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 1.a.i. `handleRenderCompletedLogic` in `packages/store/src/dialecticStore.documents.ts` handles `render_completed` events
        *   `[✅]` 1.a.ii. `render_completed` fires for EACH chunk render, not just final document - document may still be generating
        *   `[✅]` 1.a.iii. RENDER is a post-processing job type, NOT a recipe step - `stepKey` lookup always fails
        *   `[✅]` 1.a.iv. Current early return at line 769 prevents `latestRenderedResourceId` update on document descriptor
        *   `[✅]` 1.a.v. `handleDocumentCompletedLogic` (separate function, line 834) handles final document completion and status='completed'
        *   `[✅]` 1.a.vi. `StageRunChecklist` uses document descriptor's `latestRenderedResourceId` to determine if content is loadable
    *   `[✅]` 1.b. [TYPES] No new types required
    *   `[✅]` 1.c. [TEST-UNIT] Add unit tests in `dialecticStore.documents.test.ts` for render_completed without stepKey
        *   `[✅]` 1.c.i. Assert document descriptor's `latestRenderedResourceId` is updated when `render_completed` has no `step_key`
        *   `[✅]` 1.c.ii. Assert document descriptor's `status` is NOT changed to 'completed' by `render_completed` (status unchanged)
        *   `[✅]` 1.c.iii. Assert `stepStatuses` is NOT updated when `stepKey` is undefined in a RENDER notification. 
        *   `[✅]` 1.c.iv. Assert multiple `render_completed` events update `latestRenderedResourceId` to latest value each time
        *   `[✅]` 1.c.v. Assert existing behavior preserved when valid `stepKey` IS provided
        *   `[✅]` 1.c.vi. Assert existing `stepKey` is preserved when a `render_completed` notification arrives. 
    *   `[✅]` 1.d. [STORE] Modify `handleRenderCompletedLogic` in `packages/store/src/dialecticStore.documents.ts`
        *   `[✅]` 1.d.i. Move document descriptor update (`ensureRenderedDocumentDescriptor`) BEFORE the stepKey check
        *   `[✅]` 1.d.ii. Update `latestRenderedResourceId` on descriptor without changing `status`
        *   `[✅]` 1.d.iii. Make `stepStatuses[stepKey] = 'completed'` conditional on `stepKey` being defined, ensure that a `render_completed` notification with an undefined `stepKey` does not change stepStatuses. 
        *   `[✅]` 1.d.iv. Keep early return for truly invalid events (no `latestRenderedResourceId`, no recipe, no progress bucket)
        *   `[✅]` 1.d.v. Remove the early return specifically for undefined `stepKey` in a `render_completed` notification after descriptor update
    *   `[✅]` 1.e. [TEST-UNIT] Rerun tests to confirm GREEN state, verify no regression in status tracking
    *   `[✅]` 1.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 1.f.i. `render_completed` events update `latestRenderedResourceId` even without `stepKey`
        *   `[✅]` 1.f.ii. Document `status` NOT changed by `render_completed` (remains 'generating' or current value)
        *   `[✅]` 1.f.iii. `StageRunChecklist` can determine document is loadable via `latestRenderedResourceId`
        *   `[✅]` 1.f.iv. Console warning "step not found" no longer appears for valid `render_completed` events
        *   `[✅]` 1.f.v. Progressive rendering works - user can view partial content while document still generating
    *   `[✅]` 1.g. [COMMIT] `fix(store): update latestRenderedResourceId on render_completed without stepKey`

*   `[✅]` 2. **[STORE] Ensure `setFocusedStageDocument` triggers content fetch when document is loadable**
    *   `[✅]` 2.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 2.a.i. `setFocusedStageDocument` in `packages/store/src/dialecticStore.ts` handles user clicking a document
        *   `[✅]` 2.a.ii. Currently calls `beginStageDocumentEdit` but does NOT fetch content
        *   `[✅]` 2.a.iii. User may click document while it's still generating (status != 'completed') but has rendered content
        *   `[✅]` 2.a.iv. User may arrive at page AFTER document rendered (logged out, different page, etc.)
        *   `[✅]` 2.a.v. Click action should fetch content if: document has `latestRenderedResourceId` AND content not cached/stale
    *   `[✅]` 2.b. [TYPES] No new types required
    *   `[✅]` 2.c. [TEST-UNIT] Add unit tests for content fetch on focus
        *   `[✅]` 2.c.i. Assert `setFocusedStageDocument` fetches content when `latestRenderedResourceId` exists and content not cached
        *   `[✅]` 2.c.ii. Assert fetch triggered even when document status is 'generating' (progressive rendering)
        *   `[✅]` 2.c.iii. Assert no fetch when content already cached with same `latestRenderedResourceId`
        *   `[✅]` 2.c.iv. Assert re-fetch when `latestRenderedResourceId` changed (new chunk rendered)
        *   `[✅]` 2.c.v. Assert no fetch when document has no `latestRenderedResourceId`
    *   `[✅]` 2.d. [STORE] Modify `setFocusedStageDocument` in `packages/store/src/dialecticStore.ts`
        *   `[✅]` 2.d.i. After setting focused document, lookup document descriptor from `stageRunProgress`
        *   `[✅]` 2.d.ii. Check if descriptor has `latestRenderedResourceId`
        *   `[✅]` 2.d.iii. Check if cached content matches current `latestRenderedResourceId` (version check)
        *   `[✅]` 2.d.iv. If loadable and not cached/stale, call `fetchStageDocumentContent`
    *   `[✅]` 2.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 2.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 2.f.i. Clicking document fetches content if loadable and not cached
        *   `[✅]` 2.f.ii. User can view partial content while document still generating
        *   `[✅]` 2.f.iii. Content refreshes when new chunk is rendered (new `latestRenderedResourceId`)
        *   `[✅]` 2.f.iv. User returning after logout can load documents
    *   `[✅]` 2.g. [COMMIT] `fix(store): fetch document content on user focus action`

*   `[✅]` 3. **[BE] Fix `listStageDocuments` endpoint to return array directly and extract `documentKey` correctly**
    *   `[✅]` 3.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 3.a.i. `listStageDocuments` in `supabase/functions/dialectic-service/listStageDocuments.ts` returns stage documents for hydration
        *   `[✅]` 3.a.ii. Backend currently returns `{ documents: StageDocumentChecklistEntry[] }` but should return `StageDocumentChecklistEntry[]` directly to match frontend type
        *   `[✅]` 3.a.iii. `ListStageDocumentsPayload` already includes `userId` and `projectId` (verified in types)
        *   `[✅]` 3.a.iv. `documentKey` must be extracted from `file_name` using `deconstructStoragePath`, not from `resource_description`
        *   `[✅]` 3.a.v. File naming contract: `{modelSlug}_{attemptCount}_{documentKey}[_{fragment}].md`
    *   `[✅]` 3.b. [TYPES] No type changes required
        *   `[✅]` 3.b.i. `ListStageDocumentsPayload` already has `userId: string` and `projectId: string`
        *   `[✅]` 3.b.ii. `ListStageDocumentsResponse` is already `StageDocumentChecklistEntry[]` (array type)
    *   `[✅]` 3.c. [BE] Modify `listStageDocuments.ts` to return array directly and extract `documentKey` from file path
        *   `[✅]` 3.c.i. Import `deconstructStoragePath` from `../_shared/utils/path_deconstructor.ts`
        *   `[✅]` 3.c.ii. Add `storage_path, file_name` to the select query
        *   `[✅]` 3.c.iii. Use `deconstructStoragePath({ storageDir: resource.storage_path, fileName: resource.file_name })` to extract `pathInfo.documentKey`
        *   `[✅]` 3.c.iv. Use extracted `documentKey` for the `resourceMapByDocumentKey` lookup
        *   `[✅]` 3.c.v. Return `StageDocumentChecklistEntry[]` array directly (remove `{ documents: [...] }` wrapper)
    *   `[✅]` 3.d. [CRITERIA] Acceptance criteria
        *   `[✅]` 3.d.i. `ListStageDocumentsPayload` includes `userId` and `projectId` (already true)
        *   `[✅]` 3.d.ii. Backend returns `StageDocumentChecklistEntry[]` array directly (no wrapper object)
        *   `[✅]` 3.d.iii. `documentKey` correctly extracted from file path (e.g., `google-gemini-2.5-flash_0_success_metrics_a0fc0d7d.md` → `success_metrics`)
    *   `[✅]` 3.e. [COMMIT] `fix(be): return array directly from listStageDocuments and fix documentKey extraction`

*   `[✅]` 4. **[UI] Fix `useStageRunProgressHydration` hook to call `hydrateStageProgress`**
    *   `[✅]` 4.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 4.a.i. `useStageRunProgressHydration` in `apps/web/src/hooks/useStageRunProgressHydration.ts` fetches recipe but never calls `hydrateStageProgress`
        *   `[✅]` 4.a.ii. Document descriptors are never populated on page load/refresh
        *   `[✅]` 4.a.iii. Hook needs `userId` from `useAuthStore` and `projectId` from `activeSessionDetail.project_id`
        *   `[✅]` 4.a.iv. Step 3 must be complete (backend fix)
    *   `[✅]` 4.b. [TYPES] No new types required; mock infrastructure update needed
    *   `[✅]` 4.c. [TEST-UNIT] Add test in `useStageRunProgressHydration.test.tsx`
        *   `[✅]` 4.c.i. Assert `hydrateStageProgress` is called with correct payload `{ sessionId, stageSlug, iterationNumber, userId, projectId }`
        *   `[✅]` 4.c.ii. Assert `hydrateStageProgress` called in both `hydrate()` and `ensureProgress()` paths
    *   `[✅]` 4.d. [UI] Modify `useStageRunProgressHydration.ts`
        *   `[✅]` 4.d.i. Import `useAuthStore` to get `user.id`
        *   `[✅]` 4.d.ii. Extract `projectId` from `activeSessionDetail.project_id`
        *   `[✅]` 4.d.iii. Call `hydrateStageProgress({ sessionId, stageSlug, iterationNumber, userId, projectId })` in `hydrate()` path
        *   `[✅]` 4.d.iv. Call `hydrateStageProgress` in `ensureProgress()` path
        *   `[✅]` 4.d.v. Add `user` to useEffect dependency array
    *   `[✅]` 4.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 4.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 4.f.i. `hydrateStageProgress` called on page load/refresh
        *   `[✅]` 4.f.ii. Document descriptors populated after hydration
        *   `[✅]` 4.f.iii. User can view documents after returning to page
    *   `[✅]` 4.g. [COMMIT] `fix(ui): call hydrateStageProgress in useStageRunProgressHydration hook`

*   `[✅]` 5. **[UI] Update `SessionContributionsDisplayCard` to render `GeneratedContributionCard` for each model**
    *   `[✅]` 5.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 5.a.i. `SessionContributionsDisplayCard` is the container for document display
        *   `[✅]` 5.a.ii. `GeneratedContributionCard` has proper display logic including "Generating" states
        *   `[✅]` 5.a.iii. Steps 1-4 must be complete for document loading to work
    *   `[✅]` 5.b. [TYPES] No new types required
    *   `[✅]` 5.c. [TEST-UNIT] Add/update tests in `SessionContributionsDisplayCard.test.tsx`
        *   `[✅]` 5.c.i. Assert `GeneratedContributionCard` is rendered for each unique modelId
        *   `[✅]` 5.c.ii. Assert `modelId` prop passed correctly
    *   `[✅]` 5.d. [UI] Modify `SessionContributionsDisplayCard.tsx`
        *   `[✅]` 5.d.i. Add import for `GeneratedContributionCard`
        *   `[✅]` 5.d.ii. Replace inline Card rendering with `GeneratedContributionCard` components
        *   `[✅]` 5.d.iii. Remove unused imports/helpers
    *   `[✅]` 5.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 5.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 5.f.i. `GeneratedContributionCard` rendered for each model
        *   `[✅]` 5.f.ii. Document content visible after clicking in StageRunChecklist
        *   `[✅]` 5.f.iii. Progressive rendering visible (content updates as chunks arrive)
    *   `[✅]` 5.g. [COMMIT] `fix(ui): render GeneratedContributionCard in SessionContributionsDisplayCard`

*   `[✅]` 6. **[TEST-INT] Store integration test for progressive document rendering lifecycle**
    *   `[✅]` 6.a. [DEPS] Dependencies and boundary definition
        *   `[✅]` 6.a.i. **Integration boundary:** NotificationStore → DialecticStore (documents module) → API mock
        *   `[✅]` 6.a.ii. **Test file:** `packages/store/src/dialecticStore.progressive-rendering.integration.test.ts` (new file, follows pattern from `dialecticStore.notifications.integration.test.ts`)
        *   `[✅]` 6.a.iii. **Key functions under test:** `handleDocumentStartedLogic`, `handleRenderCompletedLogic`, `handleDocumentCompletedLogic`, `setFocusedStageDocument`, `fetchStageDocumentContentLogic` (all in `dialecticStore.documents.ts` or `dialecticStore.ts`)
        *   `[✅]` 6.a.iv. **Event simulation:** call `useNotificationStore.getState().handleIncomingNotification(notification)` wrapped in `act()` to trigger lifecycle handlers
        *   `[✅]` 6.a.v. **API mock:** use MSW `server.use()` to intercept `POST /functions/v1/dialectic-service` for `action: 'getProjectResourceContent'` and return versioned markdown content
    *   `[✅]` 6.b. [TYPES] No new types; use existing `Notification`, `StageDocumentDescriptor`, `StageDocumentContentState` from `@paynless/types`
    *   `[✅]` 6.c. [TEST-INT] Test cases in `dialecticStore.progressive-rendering.integration.test.ts`
        *   `[✅]` 6.c.i. **Test: "multiple render_completed events progressively update latestRenderedResourceId"**
            *   Setup: seed `recipesByStageSlug` and `stageRunProgress` with empty `documents` bucket; mock `getProjectResourceContent` to return content keyed by `latestRenderedResourceId`
            *   Execute: dispatch `document_started` (no `latestRenderedResourceId`), then `render_completed` with `latestRenderedResourceId: 'resource-v1'` and no `step_key`, then `render_completed` with `latestRenderedResourceId: 'resource-v2'` and no `step_key`
            *   Assert after each `render_completed`: `stageRunProgress[progressKey].documents[documentKey].latestRenderedResourceId` equals the new value; `status` remains `'generating'` (not `'completed'`)
        *   `[✅]` 6.c.ii. **Test: "setFocusedStageDocument fetches content when status='generating' and latestRenderedResourceId exists"**
            *   Setup: seed descriptor with `status: 'generating'`, `latestRenderedResourceId: 'resource-v1'`; mock API returns markdown `# Content v1`
            *   Execute: call `useDialecticStore.getState().setFocusedStageDocument({ sessionId, stageSlug, modelId, documentKey })`
            *   Assert: `stageDocumentContent[compositeKey].baselineMarkdown === '# Content v1'`; `isLoading` transitions `true → false`; API was called with correct `resourceId`
        *   `[✅]` 6.c.iii. **Test: "document_completed sets status='completed' and preserves latestRenderedResourceId"**
            *   Setup: seed descriptor with `status: 'generating'`, `latestRenderedResourceId: 'resource-v2'`
            *   Execute: dispatch `document_completed` notification with `step_key` matching a recipe step
            *   Assert: `descriptor.status === 'completed'`; `latestRenderedResourceId` unchanged; `stepStatuses[step_key] === 'completed'`
        *   `[✅]` 6.c.iv. **Test: "hydrateStageProgress loads content for completed documents (simulates user return)"**
            *   Setup: mock `listStageDocuments` API to return `StageDocumentChecklistEntry[]` with `latestRenderedResourceId`; mock `getProjectResourceContent` to return content
            *   Execute: call `useDialecticStore.getState().hydrateStageProgress({ sessionId, stageSlug, iterationNumber, userId, projectId })`
            *   Assert: `stageRunProgress[progressKey].documents` populated with descriptors; calling `setFocusedStageDocument` then fetches and populates `stageDocumentContent`
        *   `[✅]` 6.c.v. **Test: "no duplicate fetch when latestRenderedResourceId unchanged"**
            *   Setup: seed `stageDocumentContent[key]` with `baselineMarkdown` and `lastBaselineVersion.resourceId === 'resource-v1'`; seed descriptor with `latestRenderedResourceId: 'resource-v1'`
            *   Execute: call `setFocusedStageDocument` twice for same document
            *   Assert: API `getProjectResourceContent` called at most once (second call skipped due to version match)
    *   `[✅]` 6.d. [CRITERIA] Acceptance criteria
        *   `[✅]` 6.d.i. All five integration tests pass, proving the cross-function lifecycle for progressive rendering
        *   `[✅]` 6.d.ii. Tests use real store state mutations (no mocking internal logic functions)
        *   `[✅]` 6.d.iii. Tests mock only external boundaries: NotificationStore entry point and API HTTP responses
    *   `[✅]` 6.e. [COMMIT] `test(dialectic): add integration tests for progressive document rendering lifecycle`

*   `[✅]` 7. **[BE] Fix `document_renderer.ts` to handle array-structured content**
    *   `[✅]` 7.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 7.a.i. `renderDocument` in `supabase/functions/_shared/services/document_renderer.ts` extracts `content` from AI response
        *   `[✅]` 7.a.ii. Current: passes `mergedStructuredData` directly to `renderPrompt` without array handling
        *   `[✅]` 7.a.iii. Problem: `content = { features: [...] }` but template expects `{ feature_name, feature_objective, ... }`
        *   `[✅]` 7.a.iv. Solution: detect array structures, iterate, render template per item, concatenate results
        *   `[✅]` 7.a.v. Template stays unchanged (flat field placeholders)
    *   `[✅]` 7.b. [TYPES] No new types required
    *   `[✅]` 7.c. [TEST-UNIT] Add tests in `document_renderer.test.ts`
        *   `[✅]` 7.c.i. Assert: array content `{ features: [{...}, {...}] }` renders template once per feature
        *   `[✅]` 7.c.ii. Assert: item fields available as top-level keys during render (`{feature_name}` works)
        *   `[✅]` 7.c.iii. Assert: results concatenated with separator (e.g., `\n---\n`)
        *   `[✅]` 7.c.iv. Assert: flat content (non-array) still works as before
        *   `[✅]` 7.c.v. Assert: nested arrays handled (e.g., `phases[].milestones[]`)
    *   `[✅]` 7.d. [BE] Modify `document_renderer.ts` to iterate over array content
        *   `[✅]` 7.d.i. After extracting `structuredData`, detect if primary value is an array
        *   `[✅]` 7.d.ii. If array, iterate and render template per item with item fields as context
        *   `[✅]` 7.d.iii. Concatenate rendered outputs with separator
        *   `[✅]` 7.d.iv. If flat object, render as before (no change)
    *   `[✅]` 7.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 7.f. [CRITERIA] Acceptance criteria
        *   `[✅]` 7.f.i. `thesis_feature_spec` renders all 5 features from sample JSON
        *   `[✅]` 7.f.ii. Each feature rendered with complete sections
        *   `[✅]` 7.f.iii. Existing flat-content documents unaffected
    *   `[✅]` 7.g. [COMMIT] `fix(be): handle array-structured content in document_renderer`

*   `[✅]` 8. **[TEST-INT] Integration test for document rendering with array data**
    *   `[✅]` 8.a. [TEST-INT] Integration tests
        *   `[✅]` 8.a.i. Assert: `thesis_feature_spec` renders all features from sample JSON
        *   `[✅]` 8.a.ii. Assert: nested iteration works for `parenthesis_master_plan` phases/milestones
        *   `[✅]` 8.a.iii. Assert: empty arrays produce no output (no empty sections)
    *   `[✅]` 8.b. [COMMIT] `test(dialectic): add integration tests for array template rendering`

*   `[✅]` 9. **[UI] Remove StageRunChecklist from GeneratedContributionCard so the card is detail-only**
    *   `[✅]` 9.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 9.a.i. `GeneratedContributionCard` in `apps/web/src/components/dialectic/GeneratedContributionCard.tsx` currently renders `StageRunChecklist` inside the card
        *   `[✅]` 9.a.ii. Sidebar (StageTabCard → StageRunChecklist) is the single source of document list; clicking a document there will drive display in SessionContributionsDisplayCard
        *   `[✅]` 9.a.iii. Removing the checklist from GeneratedContributionCard makes the card display only one model’s version of one document (detail-only)
    *   `[✅]` 9.b. [TYPES] No new types required
    *   `[✅]` 9.c. [TEST-UNIT] Add or update tests in `GeneratedContributionCard.test.tsx`
        *   `[✅]` 9.c.i. Assert card renders model name, focused document detail, document content, document feedback, and Save Edit / Save Feedback when a document is focused
    *   `[✅]` 9.d. [UI] Modify `GeneratedContributionCard.tsx`
        *   `[✅]` 9.d.i. Remove the `StageRunChecklist` component and its usage from the card body
        *   `[✅]` 9.d.ii. Remove any props or imports used only by the checklist
        *   `[✅]` 9.d.iii. Keep document detail panel (content, feedback, save actions) unchanged
    *   `[✅]` 9.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 9.f. [TEST-INT] If applicable, assert GeneratedContributionCard still integrates with store and focused-document state
        *   `[✅]` 9.f.i. Assert selecting a document elsewhere (e.g. sidebar) causes this card to show that document’s content and feedback for its model
    *   `[✅]` 9.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 9.g.i. GeneratedContributionCard renders a detail-only panel: model name, focused document content, document feedback, and Save Edit / Save Feedback when a document is focused
        *   `[✅]` 9.g.ii. Card shows one model’s document detail (content, feedback, save actions) when that document is focused
    *   `[✅]` 9.h. [COMMIT] `refactor(ui): remove StageRunChecklist from GeneratedContributionCard for detail-only card`

*   `[✅]` 10. **[BE] Fix `FileManagerService` resource uploads to persist `resourceDescriptionForDb`**
    *   `[✅]` 10.a. [DEPS] `FileManagerService.uploadAndRegisterFile` in `supabase/functions/_shared/services/file_manager.ts` handles `isResourceContext(context)` DB upserts into `dialectic_project_resources`
    *   `[✅]` 10.b. [TYPES] Use existing `ResourceUploadContext.resourceDescriptionForDb?: Json | null` from `supabase/functions/_shared/types/file_manager.types.ts` (no new types)
    *   `[✅]` 10.c. [TEST-UNIT] Add or update unit tests in `supabase/functions/_shared/services/file_manager.upload.test.ts`
        *   `[✅]` 10.c.i. Assert `resource_description` includes merged `resourceDescriptionForDb` when provided for resource uploads (and preserves existing `type` / `originalDescription` fields)
    *   `[✅]` 10.d. [BE] Modify `supabase/functions/_shared/services/file_manager.ts`
        *   `[✅]` 10.d.i. In the `isResourceContext(context)` branch, merge `context.resourceDescriptionForDb` into the `resource_description` used for the `dialectic_project_resources` upsert
    *   `[✅]` 10.e. [TEST-UNIT] Rerun and expand tests proving the merge behavior
    *   `[✅]` 10.f. [CRITERIA] `resourceDescriptionForDb` is persisted for resource uploads; existing behavior unchanged when it is absent
    *   `[✅]` 10.g. [COMMIT] `fix(be): persist resourceDescriptionForDb for file manager resource uploads`

*   `[✅]` 11. **[STORE] Align `SaveContributionEditPayload` in `@paynless/types` with backend requirements and remove store-side ambiguity**
    *   `[✅]` 11.a. [DEPS] `saveContributionEdit` in `packages/store/src/dialecticStore.ts` forwards `SaveContributionEditPayload` to `api.dialectic().saveContributionEdit` and updates `stageDocumentContent` / `stageDocumentResources`
    *   `[✅]` 11.b. [TYPES] Update `SaveContributionEditPayload` in `packages/types/src/dialectic.types.ts` so `documentKey` and `resourceType` are required (handler currently 400s when missing)
        *   `[✅]` 11.b.i. [TYPE-GUARD-TEST] Omit if no type guards change
        *   `[✅]` 11.b.ii. [TYPE-GUARDS] Omit if no type guards change
    *   `[✅]` 11.c. [TEST-UNIT] Add or update unit tests for `saveContributionEdit` behavior in `packages/store/src/dialecticStore.test.ts` if coverage exists; otherwise omit
    *   `[✅]` 11.d. [STORE] Modify `packages/store/src/dialecticStore.ts`
        *   `[✅]` 11.d.i. Remove/avoid `documentKey` fallback derivations that mask missing required payload fields and rely on the now-required payload fields
    *   `[✅]` 11.e. [TEST-UNIT] Rerun and expand tests proving strict payload handling
    *   `[✅]` 11.f. [CRITERIA] Store cannot compile/call `saveContributionEdit` without `documentKey` / `resourceType`; behavior unchanged for valid payloads
    *   `[✅]` 11.g. [COMMIT] `fix(store): require documentKey/resourceType for saveContributionEdit payload`

*   `[✅]` 12. **[BE] Align `dialectic-service` router typing for `saveContributionEdit`**
    *   `[✅]` 12.a. [DEPS] `ActionHandlers.saveContributionEdit` type in `supabase/functions/dialectic-service/index.ts` must match the actual handler signature in `supabase/functions/dialectic-service/saveContributionEdit.ts`
    *   `[✅]` 12.b. [TYPES] No new types required
    *   `[✅]` 12.c. [TEST-UNIT] Omit unless existing tests cover this boundary
    *   `[✅]` 12.d. [BE] Modify `supabase/functions/dialectic-service/index.ts`
        *   `[✅]` 12.d.i. Update the `ActionHandlers.saveContributionEdit` type (or introduce a small adapter function) so the router contract matches the handler’s `(payload, user, deps)` shape without relying on extra-arg ignore
    *   `[✅]` 12.e. [CRITERIA] Router typing matches implementation; no runtime behavior change
    *   `[✅]` 12.f. [COMMIT] `refactor(be): align dialectic-service saveContributionEdit handler typing`

*   `[✅]` 13. **[BE] Fix `saveContributionEdit`: overwrite rendered document at canonical `/documents/...` path and upsert `dialectic_project_resources` (no raw overwrite, no new iteration)**
    *   `[✅]` 13.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 13.a.i. UI triggers “Save Edit” in `apps/web/src/components/dialectic/GeneratedContributionCard.tsx` by calling `saveContributionEdit(payload)`
        *   `[✅]` 13.a.ii. Store action `saveContributionEdit` in `packages/store/src/dialecticStore.ts` calls API and updates `stageDocumentContent` / `stageDocumentResources` from the returned `resource`
        *   `[✅]` 13.a.iii. API method `saveContributionEdit` in `packages/api/src/dialectic.api.ts` posts `{ action: 'saveContributionEdit', payload }` to `dialectic-service`
        *   `[✅]` 13.a.iv. Edge Function routes `action: 'saveContributionEdit'` in `supabase/functions/dialectic-service/index.ts` to `supabase/functions/dialectic-service/saveContributionEdit.ts`
        *   `[✅]` 13.a.v. `saveContributionEdit.ts` deconstructs the original contribution’s `(storage_path, file_name)` to derive canonical context (projectId, stageSlug, modelSlug, attemptCount, iteration)
        *   `[✅]` 13.a.vi. `saveContributionEdit.ts` persists edits by writing a **RenderedDocument** via `FileManagerService.uploadAndRegisterFile` (resource upload), which uploads with overwrite and registers via DB upsert on `(storage_bucket, storage_path, file_name)`
        *   `[✅]` 13.a.vii. `saveContributionEdit.ts` updates `dialectic_contributions.is_latest_edit=false` on the original contribution (but does not insert a new contribution row)
        *   `[✅]` 13.a.viii. “No new iteration” means the rendered document remains in the original iteration directory derived from the canonical path (no iteration counter increment, no new `iteration_*` folder)
    *   `[✅]` 13.b. [TYPES] Align backend payload requirements with handler behavior (grouped with this step)
        *   `[✅]` 13.b.i. Update `SaveContributionEditPayload` in `supabase/functions/dialectic-service/dialectic.interface.ts` so `documentKey` and `resourceType` reflect actual requirements in `saveContributionEdit.ts` (handler currently 400s when missing)
        *   `[✅]` 13.b.ii. Confirm `SaveContributionEditSuccessResponse` returns `{ resource: EditedDocumentResource, sourceContributionId: string }`
        *   `[✅]` 13.b.iii. [TYPE-GUARD-TEST] Omit if no type guards change
        *   `[✅]` 13.b.iv. [TYPE-GUARDS] Omit if no type guards change
    *   `[✅]` 13.c. [TEST-UNIT] Add or update unit tests in `supabase/functions/dialectic-service/saveContributionEdit.test.ts`
        *   `[✅]` 13.c.i. Assert it calls `fileManager.uploadAndRegisterFile` exactly once with `pathContext.fileType = FileType.RenderedDocument` and canonical pathContext fields derived from the original contribution’s canonical storage path
        *   `[✅]` 13.c.ii. Assert it overwrites the rendered document at the canonical `/documents/...` address (resource uploads may overwrite; DB registration is an upsert on `(storage_bucket, storage_path, file_name)`)
        *   `[✅]` 13.c.iii. Assert it does not write to raw-response paths (raw response artifacts are not overwritten)
        *   `[✅]` 13.c.iv. Assert it preserves iteration (uses deconstructed `iteration`, does not create a new iteration)
        *   `[✅]` 13.c.v. Assert it sets `dialectic_contributions.is_latest_edit=false` for the original contribution and does not touch unrelated fields
        *   `[✅]` 13.c.vi. Assert 404 for missing original contribution, 403 for non-owner, and 500 when the original path cannot be deconstructed into canonical context
    *   `[✅]` 13.d. [BE] Implement/adjust `supabase/functions/dialectic-service/saveContributionEdit.ts`
        *   `[✅]` 13.d.i. Validate payload (`originalContributionIdToEdit`, `editedContentText`, and doc-centric `documentKey` / `resourceType` as required)
        *   `[✅]` 13.d.ii. Deconstruct original contribution path; write rendered markdown to the canonical **RenderedDocument** path for that same iteration and documentKey; register via FileManager resource upload
        *   `[✅]` 13.d.iii. Update `dialectic_contributions.is_latest_edit=false` on the original contribution; handle cleanup on failure as currently structured
    *   `[✅]` 13.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 13.f. [TEST-INT] Omit unless needed for storage+DB boundary proof beyond unit tests
    *   `[✅]` 13.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 13.g.i. Saving an edit overwrites the rendered document at its canonical `/documents/...` address
        *   `[✅]` 13.g.ii. A `dialectic_project_resources` record exists for the rendered document at that address (upserted on conflict)
        *   `[✅]` 13.g.iii. Raw response artifacts are not overwritten
        *   `[✅]` 13.g.iv. No new iteration is created on “Save Edit”
    *   `[✅]` 13.h. [COMMIT] `fix(be): saveContributionEdit overwrites rendered document and upserts resource without new iteration`

*   `[✅]` 14. **[UI] SessionContributionsDisplayCard: render GeneratedContributionCard per model for selected documentKey and submit all document-level feedback and edited documents on Advance**
    *   `[✅]` 14.a. [DEPS] Dependencies and signature analysis
        *   `[✅]` 14.a.i. `SessionContributionsDisplayCard` in `apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx` is the main-area container; user selects a document in the sidebar (StageRunChecklist) by documentKey
        *   `[✅]` 14.a.ii. When one documentKey is selected, display one `GeneratedContributionCard` per model that has that document so users can compare that document across models
        *   `[✅]` 14.a.iii. “Submit Responses & Advance Stage” must submit all document-level feedback (all drafts) and edited documents then advance the stage; there is only document-level feedback, no stage-level feedback
        *   `[✅]` 14.a.iv. Step 9 and Step 13 must be complete (GeneratedContributionCard is detail-only; backend handles edited-document submission). If an API or store layer exists for edited-document submission, implement and test it in additional steps between 13 and 14 (BE → API maybe → Store maybe → FE).
    *   `[✅]` 14.b. [TYPES] No new types required unless existing types do not support “selected documentKey” and “models that have this documentKey”; add or extend only in this file’s step per checklist rules
        *   `[✅]` 14.b.i. Omit type guard test/substeps if no type changes
        *   `[✅]` 14.b.ii. Omit type guard substeps if no type changes
    *   `[✅]` 14.c. [TEST-UNIT] Add or update tests in `SessionContributionsDisplayCard.test.tsx`
        *   `[✅]` 14.c.i. Assert when a documentKey is focused (e.g. from sidebar), one `GeneratedContributionCard` is rendered per model that has that documentKey
        *   `[✅]` 14.c.ii. Assert “Submit Responses & Advance Stage” submits all document-level feedback then advances stage (mock store, assert correct submit payload and advance called)
        *   `[✅]` 14.c.iii. Assert that when a document’s feedback area is empty, no feedback is submitted for that document
        *   `[✅]` 14.c.iv. Assert that when the user has edited the document content and submits, the component invokes the submit action with payload that includes the edited content for each edited document
    *   `[✅]` 14.d. [UI] Modify `SessionContributionsDisplayCard.tsx`
        *   `[✅]` 14.d.i. Replace inline Card rendering with one `GeneratedContributionCard` per model for the selected documentKey (derive selected documentKey from focused document state; derive list of modelIds that have that documentKey from stage progress/checklist data)
        *   `[✅]` 14.d.ii. Ensure “Submit Responses & Advance Stage” submits all document-level feedback (all drafts) and edited documents then advances the stage
        *   `[✅]` 14.d.iii. Remove unused imports and helpers that were only used by the removed inline cards
    *   `[✅]` 14.e. [TEST-UNIT] Rerun tests to confirm GREEN state
    *   `[✅]` 14.f. [TEST-INT] If there is a chain (StageRunChecklist → setFocusedStageDocument → SessionContributionsDisplayCard → GeneratedContributionCard), prove it; assert that submitting edited documents results in backend receiving and persisting them (FE → Store → API → BE)
        *   `[✅]` 14.f.i. Assert clicking a document in StageRunChecklist results in SessionContributionsDisplayCard rendering GeneratedContributionCard(s) for each model’s version of that document
        *   `[✅]` 14.f.ii. Assert that when edited document content is submitted, the chain (FE → Store → API → BE) results in the backend persisting the edited document as specified in Step 13
    *   `[✅]` 14.g. [CRITERIA] Acceptance criteria
        *   `[✅]` 14.g.i. Selecting a document in the sidebar shows one GeneratedContributionCard per model for that documentKey
        *   `[✅]` 14.g.ii. Document content and feedback visible per model after selection; progressive rendering unchanged
        *   `[✅]` 14.g.iii. “Submit Responses & Advance Stage” submits all document-level feedback and edited documents then advances the stage
    *   `[✅]` 14.h. [COMMIT] `fix(ui): render GeneratedContributionCard per model for selected document in SessionContributionsDisplayCard; submit all document feedback and edited documents on Advance`

*   `[✅]` 15. **[STORE] Add feedback draft to `StageDocumentContentState` and implement feedback-draft logic in `packages/store/src/dialecticStore.documents.ts`**
    *   `[✅]` 15.a. [DEPS] Dependencies and signatures for the functions that need the new state and logic.
        *   `[✅]` 15.a.i. `ensureStageDocumentContentLogic` in `dialecticStore.documents.ts` creates/updates entries in `stageDocumentContent`; it must initialize the new feedback-draft fields.
        *   `[✅]` 15.a.ii. New logic: `recordStageDocumentFeedbackDraftLogic` and `flushStageDocumentFeedbackDraftLogic` in `dialecticStore.documents.ts` update only feedback draft fields; `submitStageDocumentFeedbackLogic` (or caller) must call flush on success.
    *   `[✅]` 15.b. [TYPES] Strict typing for the new state and logic.
        *   `[✅]` 15.b.i. [TYPE-GUARD-TEST] Omit if no type guards change.
        *   `[✅]` 15.b.ii. Extend `StageDocumentContentState` in `packages/types/src/dialectic.types.ts` with `feedbackDraftMarkdown: string` and `feedbackIsDirty: boolean`. Every construction site for `StageDocumentContentState` in this file (and any used by it) must set these (e.g. `feedbackDraftMarkdown: ''`, `feedbackIsDirty: false`).
    *   `[✅]` 15.c. [TEST-UNIT] Unit tests for feedback-draft logic in `packages/store/src/dialecticStore.documents.test.ts`.
        *   `[✅]` 15.c.i. Assert `recordStageDocumentFeedbackDraftLogic` updates only `feedbackDraftMarkdown` and `feedbackIsDirty` and does not change `currentDraftMarkdown` or `isDirty`.
        *   `[✅]` 15.c.ii. Assert `flushStageDocumentFeedbackDraftLogic` clears feedback draft (`feedbackDraftMarkdown` reset, `feedbackIsDirty: false`) and does not change content draft.
        *   `[✅]` 15.c.iii. Assert new entries from `ensureStageDocumentContentLogic` include `feedbackDraftMarkdown: ''` and `feedbackIsDirty: false`.
    *   `[✅]` 15.d. [STORE] Implementation in `packages/store/src/dialecticStore.documents.ts`.
        *   `[✅]` 15.d.i. In `ensureStageDocumentContentLogic` (and any other construction of `StageDocumentContentState` in this file), set `feedbackDraftMarkdown: ''` and `feedbackIsDirty: false`.
        *   `[✅]` 15.d.ii. Implement `recordStageDocumentFeedbackDraftLogic(state, key, feedbackMarkdown)` and `flushStageDocumentFeedbackDraftLogic(state, key)`; call flush after successful `submitStageDocumentFeedback` where appropriate.
    *   `[✅]` 15.e. [TEST-UNIT] Rerun and expand tests for feedback-draft behavior.
        *   `[✅]` 15.e.i. Confirm all new and existing unit tests for this file are GREEN.
    *   `[✅]` 15.f. [TEST-INT] If there is a chain, prove it.
        *   `[✅]` 15.f.i. Omit or add only if a defined integration boundary for this file requires it.
    *   `[✅]` 15.g. [CRITERIA] Acceptance for this file.
        *   `[✅]` 15.g.i. Each document slot has independent content draft and feedback draft; feedback-draft logic does not touch content draft.
        *   `[✅]` 15.g.ii. Feedback draft is flushed after successful feedback submit.
    *   `[✅]` 15.h. [COMMIT] `feat(store): add feedback draft to StageDocumentContentState and feedback-draft logic in dialecticStore.documents`

*   `[✅]` 16. **[STORE] `submitStageResponses` submits both content edits and feedback drafts; add `updateStageDocumentFeedbackDraft` in `packages/store/src/dialecticStore.ts`**
    *   `[✅]` 16.a. [DEPS] Dependencies and signatures.
        *   `[✅]` 16.a.i. `submitStageResponses` in `dialecticStore.ts` reads `stageDocumentContent` and calls `saveContributionEdit` and `submitStageDocumentFeedback`; it must consider both `isDirty` (content) and `feedbackIsDirty` per key.
        *   `[✅]` 16.a.ii. New action `updateStageDocumentFeedbackDraft(key, feedbackMarkdown)` in `dialecticStore.ts` delegates to feedback-draft logic in `dialecticStore.documents.ts` (step 15).
    *   `[✅]` 16.b. [TYPES] No new types; use `StageDocumentContentState` and existing payload types from step 15.
        *   `[✅]` 16.b.i. Omit if no type guards change.
        *   `[✅]` 16.b.ii. Omit if no type guards change.
    *   `[✅]` 16.c. [TEST-UNIT] Unit tests in `packages/store/src/dialecticStore.test.ts`.
        *   `[✅]` 16.c.i. Assert when one key has both content dirty and feedback dirty, `submitStageResponses` calls both `saveContributionEdit` (with `currentDraftMarkdown`) and `submitStageDocumentFeedback` (with `feedbackDraftMarkdown`) for that key.
        *   `[✅]` 16.c.ii. Assert when multiple keys have mixed states, every dirty content edit and every dirty feedback draft is submitted exactly once; advance runs only after all succeed.
        *   `[✅]` 16.c.iii. Assert `updateStageDocumentFeedbackDraft` only updates feedback draft state (mock or inspect store state).
    *   `[✅]` 16.d. [STORE] Implementation in `packages/store/src/dialecticStore.ts`.
        *   `[✅]` 16.d.i. Expose `updateStageDocumentFeedbackDraft(key, feedbackMarkdown)` and wire it to the feedback-draft logic from step 15.
        *   `[✅]` 16.d.ii. In `submitStageResponses`, for each key with unsaved work (`isDirty` or `feedbackIsDirty`): if content dirty and `sourceContributionId` set, enqueue `saveContributionEdit` with `currentDraftMarkdown`; if feedback dirty, enqueue `submitStageDocumentFeedback` with `feedbackDraftMarkdown`. Await all (e.g. `Promise.all`), then call advance-stage API.
    *   `[✅]` 16.e. [TEST-UNIT] Rerun and expand store tests.
        *   `[✅]` 16.e.i. Confirm unit tests for `submitStageResponses` and `updateStageDocumentFeedbackDraft` are GREEN.
    *   `[✅]` 16.f. [TEST-INT] If there is a chain, prove it.
        *   `[✅]` 16.f.i. No new integration test required for this step unless a defined boundary says otherwise.
    *   `[✅]` 16.g. [CRITERIA] Acceptance for this file.
        *   `[✅]` 16.g.i. "Submit Responses & Advance Stage" submits every dirty content edit via `saveContributionEdit` and every dirty feedback draft via `submitStageDocumentFeedback`; no input lost.
        *   `[✅]` 16.g.ii. Stage advances only after all such submissions succeed.
    *   `[✅]` 16.h. [COMMIT] `feat(store): submitStageResponses submits content edits and feedback drafts; add updateStageDocumentFeedbackDraft`

*   `[✅]` 17. **[UI] Bind Document Content and Document Feedback to separate drafts in `apps/web/src/components/dialectic/GeneratedContributionCard.tsx`**
    *   `[✅]` 17.a. [DEPS] Dependencies and how the component uses store state and actions.
        *   `[✅]` 17.a.i. Document Content field must bind only to content draft (`currentDraftMarkdown`) and `updateStageDocumentDraft`; Document Feedback field only to feedback draft (`feedbackDraftMarkdown`) and `updateStageDocumentFeedbackDraft` so the two do not overwrite each other.
    *   `[✅]` 17.b. [TYPES] No new types; use store state and actions from steps 15-16.
        *   `[✅]` 17.b.i. Omit if no type guards change.
        *   `[✅]` 17.b.ii. Omit if no type guards change.
    *   `[✅]` 17.c. [TEST-UNIT] Tests in `GeneratedContributionCard.test.tsx`.
        *   `[✅]` 17.c.i. Assert Document Content input is bound to content draft and Document Feedback input to feedback draft (separate bindings; changing one does not change the other).
        *   `[✅]` 17.c.ii. Assert Advance (or submit) triggers submission of both when both are filled, per store mocks.
    *   `[✅]` 17.d. [UI] Implementation in `GeneratedContributionCard.tsx`.
        *   `[✅]` 17.d.i. Document Content: `value` and `onChange` use `currentDraftMarkdown` and `updateStageDocumentDraft` only.
        *   `[✅]` 17.d.ii. Document Feedback: `value` and `onChange` use `feedbackDraftMarkdown` and `updateStageDocumentFeedbackDraft` only.
    *   `[✅]` 17.e. [TEST-UNIT] Rerun and expand component tests.
        *   `[✅]` 17.e.i. Confirm Document Content and Document Feedback tests are GREEN.
    *   `[✅]` 17.f. [TEST-INT] If there is a chain, prove it.
        *   `[✅]` 17.f.i. Assert in SessionContributionsDisplayCard (or integration test) that submitting with both content and feedback filled results in both being submitted (per step 16).
    *   `[✅]` 17.g. [CRITERIA] Acceptance for this file.
        *   `[✅]` 17.g.i. User can edit every document and provide feedback on every document; the two fields retain separate values.
        *   `[✅]` 17.g.ii. "Submit Responses & Advance Stage" submits both drafts when both are present; no input lost.
    *   `[✅]` 17.h. [COMMIT] `feat(ui): bind Document Content and Document Feedback to separate drafts in GeneratedContributionCard`

*   `[✅]` supabase/migrations/`handle_job_completion_stage_completed_status` **[DB] Trigger sets {stage}_completed status instead of auto-advancing**
    *   `[✅]` `objective.md`
        *   `[✅]` Modify `handle_job_completion()` trigger so when all stage jobs complete, session status becomes `{current_stage_slug}_completed`
        *   `[✅]` Trigger must NOT update `current_stage_id` - stage advancement is user-initiated only
        *   `[✅]` Apply to ALL stages including terminal (no special case for "no next stage")
    *   `[✅]` `role.md`
        *   `[✅]` Infrastructure layer - database trigger function
        *   `[✅]` Decouples "work completed" from "advance to next stage"
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `public.handle_job_completion()` function in PostgreSQL
        *   `[✅]` Affects `dialectic_sessions.status` column only
        *   `[✅]` Does NOT modify `current_stage_id`
    *   `[✅]` `deps.md`
        *   `[✅]` `dialectic_sessions` table
        *   `[✅]` `dialectic_generation_jobs` table
        *   `[✅]` Existing trigger infrastructure
    *   `[✅]` `migration.sql`
        *   `[✅]` Create migration: `YYYYMMDDHHMMSS_stage_completed_status.sql`
        *   `[✅]` DROP and recreate `handle_job_completion()` function
        *   `[✅]` Line ~349-352: Change `'pending_' || v_next_stage_slug` to `v_stage_slug || '_completed'`
        *   `[✅]` Lines ~353-356: Remove `current_stage_id` update entirely (keep it unchanged)
        *   `[✅]` Remove special handling for `v_next_stage_slug IS NULL` - all stages use `{stage}_completed`
    *   `[✅]` supabase/functions/integration_tests/services/`handle_job_completion.integration.test.ts`
        *   `[✅]` 66.b.i: Assert session status `thesis_completed` (not `pending_antithesis`) when all root PLAN jobs complete for thesis
        *   `[✅]` 66.b.ii: Assert session status `synthesis_completed` (not `pending_parenthesis`) when all root PLAN jobs complete for synthesis
        *   `[✅]` 66.b.v: Assert session status `paralysis_completed` (not `iteration_complete_pending_review`) when all root PLAN jobs complete for terminal stage
        *   `[✅]` Do not assert trigger updates `current_stage_id`; remove or adjust any such assertion if present
    *   `[✅]` `requirements.md`
        *   `[✅]` When all root PLAN jobs complete, session status becomes `{stage_slug}_completed`
        *   `[✅]` `current_stage_id` unchanged by trigger
        *   `[✅]` Works for all stages including terminal (paralysis_completed)
        *   `[✅]` Existing job dependency logic (prerequisite unblocking, parent/child) unchanged
    *   `[✅]` **Commit** `fix(db): handle_job_completion sets {stage}_completed status without advancing stage`

*   `[✅]` supabase/functions/dialectic-service/`submitStageResponses.ts` **[BE] Validate stage status and perform actual advancement with idempotency**
    *   `[✅]` `objective.md`
        *   `[✅]` Accept sessions with `{stage}_completed` OR `running_{stage}` status for the target stage
        *   `[✅]` Save all edits/feedback regardless of current session status (idempotent for prior stages)
        *   `[✅]` Advance stage only if session is currently at that stage; otherwise return success without advancing
        *   `[✅]` On advancement: set `current_stage_id` to next stage and status to `pending_{next_stage}`
        *   `[✅]` Terminal stage advancement: set `iteration_complete_pending_review`
    *   `[✅]` `role.md`
        *   `[✅]` Backend API handler - application layer
        *   `[✅]` Single owner of user-initiated stage advancement
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `submitStageResponses` function in `dialectic-service`
        *   `[✅]` Consumes: session status, stage transitions, edits/feedback payloads
        *   `[✅]` Produces: saved edits/feedback; optionally advanced session
    *   `[✅]` `deps.md`
        *   `[✅]` `dialectic_sessions` table
        *   `[✅]` `dialectic_stage_transitions` table
        *   `[✅]` `dialectic_stages` table
        *   `[✅]` `PromptAssembler` service
        *   `[✅]` FileManager for edits persistence
    *   `[✅]` interface/`submitStageResponses.interface.ts`
        *   `[✅]` Add JSDoc documenting expected status patterns: `{stage}_completed`, `running_{stage}`
        *   `[✅]` Document idempotency: saves always succeed; advancement conditional on current stage
    *   `[✅]` unit/`submitStageResponses.test.ts`
        *   `[✅]` Assert accepts session with `{stageSlug}_completed` status
        *   `[✅]` Assert accepts session with `running_{stageSlug}` status (race condition tolerance)
        *   `[✅]` Assert saves edits/feedback for prior stage even after advancement (idempotency)
        *   `[✅]` Assert advances only when session is currently at target stage
        *   `[✅]` Assert returns success without advancing when session already past target stage
        *   `[✅]` Assert updates `current_stage_id` to next stage on advancement
        *   `[✅]` Assert sets status to `pending_{next_stage}` on advancement
        *   `[✅]` Assert terminal stage sets `iteration_complete_pending_review`
        *   `[✅]` Assert "last non-empty wins" for edits/feedback overwrites
    *   `[✅]` `submitStageResponses.ts`
        *   `[✅]` Extract stage from status: parse `{slug}_completed` or `running_{slug}` pattern
        *   `[✅]` Validate: allow saves for any stage; advancement only if current stage matches
        *   `[✅]` Save edits/feedback via existing mechanisms
        *   `[✅]` Determine next stage via `dialectic_stage_transitions`
        *   `[✅]` Update session: `current_stage_id = next_stage_id`, `status = 'pending_' || next_stage_slug`
        *   `[✅]` Terminal: set `iteration_complete_pending_review`, keep `current_stage_id`
        *   `[✅]` Return success in all valid cases (idempotent)
    *   `[✅]` integration/`submitStageResponses.integration.test.ts`
        *   `[✅]` Test: `thesis_completed` → submit → `pending_antithesis` with updated `current_stage_id`
        *   `[✅]` Test: Already at `pending_antithesis` → submit for thesis → saves succeed, no advancement, no error
        *   `[✅]` Test: `running_thesis` → submit → saves succeed, advancement succeeds (trigger may not have fired yet)
        *   `[✅]` Test: `paralysis_completed` → submit → `iteration_complete_pending_review`
    *   `[✅]` `requirements.md`
        *   `[✅]` Edits/feedback saved regardless of session status (idempotent)
        *   `[✅]` Advancement only when session is at target stage
        *   `[✅]` "Last non-empty wins" for overwrite semantics
        *   `[✅]` No collision with trigger - trigger marks complete, handler advances
    *   `[✅]` **Commit** `fix(be): submitStageResponses validates stage status and advances with idempotency`

*   `[✅]` apps/web/src/components/dialectic/`SessionContributionsDisplayCard.tsx` **[UI] Update Submit button logic for new status lifecycle**
    *   `[✅]` `objective.md`
        *   `[✅]` Submit button should remain enabled based on `stageProgressSummary?.isComplete` (existing behavior)
        *   `[✅]` Button label and behavior should reflect idempotent save-and-advance semantics
        *   `[✅]` Allow submit for prior stages when user navigates back (edits/feedback still saveable)
    *   `[✅]` `role.md`
        *   `[✅]` UI component - presentation layer
        *   `[✅]` Consumes store state for button enablement
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `SessionContributionsDisplayCard` component
        *   `[✅]` Interacts with `dialecticStore` for progress summary and submit action
    *   `[✅]` `deps.md`
        *   `[✅]` `selectStageProgressSummary` selector
        *   `[✅]` `submitStageResponses` store action
        *   `[✅]` Session and stage state from store
    *   `[✅]` unit/`SessionContributionsDisplayCard.test.tsx`
        *   `[✅]` Assert Submit button enabled when `isComplete` is true (existing)
        *   `[✅]` Assert Submit button works when viewing prior stage after advancement (idempotency)
        *   `[✅]` Assert appropriate messaging on success (stage advanced vs edits saved)
    *   `[✅]` `SessionContributionsDisplayCard.tsx`
        *   `[✅]` Review `canSubmitStageResponses` derivation - may need to allow submit for prior stages
        *   `[✅]` Update success toast messaging to distinguish "advanced" vs "saved without advancing"
        *   `[✅]` If session already past this stage, show "Save Edits & Feedback" instead of "Submit & Advance"
    *   `[✅]` `requirements.md`
        *   `[✅]` Button enabled based on document completion (store state)
        *   `[✅]` User can submit for prior stages after advancement
        *   `[✅]` Clear feedback on what happened (advanced vs saved)
    *   `[✅]` **Commit** `fix(ui): update Submit button for idempotent save-and-advance semantics`

*   `[✅]` supabase/integration_tests/triggers/`state_management_stage_completed.integration.test.ts` **[TEST-INT] Validate complete status lifecycle**
    *   `[✅]` `objective.md`
        *   `[✅]` Prove trigger sets `{stage}_completed` without advancing
        *   `[✅]` Prove `submitStageResponses` advances correctly
        *   `[✅]` Prove idempotency for prior-stage submissions
        *   `[✅]` Prove no collision between trigger and manual submit
    *   `[✅]` `role.md`
        *   `[✅]` Integration test - proves DB trigger + Backend handler boundary
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to: `handle_job_completion` trigger ↔ `submitStageResponses` handler
    *   `[✅]` `deps.md`
        *   `[✅]` Test database with new migration applied
        *   `[✅]` `handle_job_completion` trigger
        *   `[✅]` `submitStageResponses` handler
    *   `[✅]` integration/`state_management_stage_completed.integration.test.ts`
        *   `[✅]` Test: Jobs complete → trigger sets `thesis_completed`, `current_stage_id` unchanged
        *   `[✅]` Test: `thesis_completed` → submit → `pending_antithesis` + `current_stage_id` updated
        *   `[✅]` Test: Already `pending_antithesis` → submit for thesis → success, no error, no duplicate advancement
        *   `[✅]` Test: User submits during `running_thesis` (trigger not yet fired) → success
        *   `[✅]` Test: `paralysis_completed` → submit → `iteration_complete_pending_review`
    *   `[✅]` `requirements.md`
        *   `[✅]` All tests pass proving decoupled lifecycle
        *   `[✅]` No regressions in existing state management tests
    *   `[✅]` **Commit** `test(integration): validate {stage}_completed lifecycle and idempotent advancement`

*   `[✅]` packages/store/src/`dialecticStore.ts` **[STORE] Prevent fetchProcessTemplate from overwriting user's viewed stage**
    *   `[✅]` `objective.md`
        *   `[✅]` `fetchProcessTemplate` must NOT set `activeContextStage` after initial load
        *   `[✅]` User's stage selection must persist through data refreshes triggered by notifications
        *   `[✅]` Only set stage on: (1) initial page load when no stage is set, (2) explicit user navigation
    *   `[✅]` `role.md`
        *   `[✅]` State management layer - store action
        *   `[✅]` Decouples backend data refresh from UI navigation state
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `fetchProcessTemplate` function in `dialecticStore.ts`
        *   `[✅]` Affects lines 553-596 where `activeContextStage` is set
    *   `[✅]` `deps.md`
        *   `[✅]` `activeContextStage` state field
        *   `[✅]` `activeStageSlug` state field (should remain unchanged by this function)
        *   `[✅]` `currentProjectDetail.dialectic_sessions` for reading session data
    *   `[✅]` interface/`interface.ts`
        *   `[✅]` No interface changes required; internal logic change only
    *   `[✅]` unit/`dialecticStore.fetchProcessTemplate.test.ts`
        *   `[✅]` Assert `activeContextStage` is NOT overwritten when already set and `activeStageSlug` is set
        *   `[✅]` Assert `activeContextStage` IS set on initial load (when both are null)
        *   `[✅]` Assert data refresh after `contribution_generation_complete` does NOT change `activeContextStage` or `activeStageSlug`
        *   `[✅]` Assert `activeContextStage` can still be set via `setActiveContextStage` action (explicit navigation)
    *   `[✅]` `dialecticStore.ts`
        *   `[✅]` Add guard at line ~585: only set `activeContextStage` if `get().activeStageSlug === null`
        *   `[✅]` Remove unconditional `set({ activeContextStage: stageToSet })` at line 586
        *   `[✅]` Preserve fallback logic at line 587-595 (only when no stage is set)
        *   `[✅]` Add logging to indicate when stage set is skipped due to user selection
    *   `[✅]` `requirements.md`
        *   `[✅]` Data refresh does not change user's viewed stage
        *   `[✅]` Initial page load still sets appropriate starting stage
        *   `[✅]` User can still navigate to any stage manually
    *   `[✅]` **Commit** `fix(store): prevent fetchProcessTemplate from overwriting user's viewed stage selection`

*   `[✅]` apps/web/src/components/dialectic/`StageTabCard.tsx` **[UI] Strengthen stage initialization guard to prevent race conditions**
    *   `[✅]` `objective.md`
        *   `[✅]` useEffect that sets initial stage must not re-fire during data refreshes
        *   `[✅]` Guard must be robust against transient state changes
    *   `[✅]` `role.md`
        *   `[✅]` UI component - stage navigation sidebar
        *   `[✅]` Owns initial stage selection on page mount
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `StageTabCard.tsx` useEffect at lines 203-215
        *   `[✅]` Affects dependency array and guard condition
    *   `[✅]` `deps.md`
        *   `[✅]` `activeStageSlug` from store (via `selectActiveStageSlug`)
        *   `[✅]` `activeSessionDetail` from store
        *   `[✅]` `stages` from `selectSortedStages`
        *   `[✅]` `setActiveStage` action
    *   `[✅]` interface/`interface.ts`
        *   `[✅]` No interface changes required
    *   `[✅]` unit/`StageTabCard.test.tsx`
        *   `[✅]` Assert useEffect does NOT call `setActiveStage` when `activeStageSlug` is already set
        *   `[✅]` Assert useEffect does NOT re-fire when `activeSessionDetail` reference changes but `current_stage_id` is unchanged
        *   `[✅]` Assert initial stage IS set on mount when `activeStageSlug` is null
    *   `[✅]` `StageTabCard.tsx`
        *   `[✅]` Add `useRef` to track if initial stage has been set (`hasInitializedStage`)
        *   `[✅]` Modify guard to: `if (!hasInitializedStage.current && !activeStageSlug && stages.length > 0)`
        *   `[✅]` Set `hasInitializedStage.current = true` after calling `setActiveStage`
        *   `[✅]` Remove `activeSessionDetail` from dependency array (no longer needed for initial stage logic)
    *   `[✅]` `requirements.md`
        *   `[✅]` Stage tabs do not change during document generation lifecycle
        *   `[✅]` User's stage selection persists through all notification-driven data refreshes
        *   `[✅]` Initial stage is still set correctly on page mount
    *   `[✅]` **Commit** `fix(ui): strengthen StageTabCard stage initialization guard against race conditions`

*   `[✅]` apps/web/src/pages/`DialecticSessionDetailsPage.tsx` **[UI] Decouple progress bar from activeContextStage**
    *   `[✅]` `objective.md`
        *   `[✅]` Progress bar must use `activeStageSlug` for consistency with tab selection
        *   `[✅]` Progress display must not change when backend refreshes data
        *   `[✅]` (Future: progress bar should show step-level DAG completion, not just stage position)
    *   `[✅]` `role.md`
        *   `[✅]` UI page component - main dialectic session view
        *   `[✅]` Renders progress indicator in sidebar
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to progress bar JSX at lines 164-193
        *   `[✅]` Uses `activeContextStage` currently, should use derived stage from `activeStageSlug`
    *   `[✅]` `deps.md`
        *   `[✅]` `activeContextStage` (to be replaced)
        *   `[✅]` `activeStageSlug` (new source)
        *   `[✅]` `selectSortedStages` selector
        *   `[✅]` `selectCurrentProcessTemplate` selector (to derive stage object from slug)
    *   `[✅]` interface/`interface.ts`
        *   `[✅]` No interface changes required
    *   `[✅]` unit/`DialecticSessionDetailsPage.test.tsx`
        *   `[✅]` Assert progress bar reflects `activeStageSlug`, not `activeContextStage`
        *   `[✅]` Assert progress bar does not update when `activeContextStage` changes but `activeStageSlug` is constant
    *   `[✅]` `DialecticSessionDetailsPage.tsx`
        *   `[✅]` Add selector for `activeStageSlug` from store
        *   `[✅]` Derive `activeStageForProgressBar` from `processTemplate.stages.find(s => s.slug === activeStageSlug)`
        *   `[✅]` Replace `activeContextStage` usage in progress bar with `activeStageForProgressBar`
        *   `[✅]` Keep conditional render check or update to use derived stage
    *   `[✅]` `requirements.md`
        *   `[✅]` Progress bar stays stable during document generation lifecycle
        *   `[✅]` Progress bar accurately reflects user's current view, not backend state
    *   `[✅]` **Commit** `fix(ui): decouple progress bar from activeContextStage to prevent display jumps`

*   `[✅]` **[TEST-INT]** Integration test for stage view stability during generation lifecycle
    *   `[✅]` `objective.md`
        *   `[✅]` Prove that stage navigation state remains stable during document generation and completion
        *   `[✅]` Prove that notifications do not cause unwanted stage changes
    *   `[✅]` `role.md`
        *   `[✅]` Integration test - proves NotificationStore → DialecticStore → UI boundary
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to: NotificationStore handlers → DialecticStore state → StageTabCard/DialecticSessionDetailsPage
    *   `[✅]` `deps.md`
        *   `[✅]` NotificationStore `handleIncomingNotification`
        *   `[✅]` DialecticStore `fetchProcessTemplate`, `activeStageSlug`, `activeContextStage`
        *   `[✅]` MSW for mocking API responses
    *   `[✅]` integration/`stage-navigation-stability.integration.test.ts`
        *   `[✅]` Test: User viewing thesis, `contribution_generation_complete` fires → `activeStageSlug` unchanged, tabs unchanged
        *   `[✅]` Test: User viewing thesis, `document_completed` fires → `activeStageSlug` unchanged
        *   `[✅]` Test: User viewing thesis, `render_completed` fires → `activeStageSlug` unchanged
        *   `[✅]` Test: User explicitly clicks antithesis tab → `activeStageSlug` changes to antithesis
        *   `[✅]` Test: User clicks Submit → `activeStageSlug` advances to next stage (intentional navigation)
    *   `[✅]` `requirements.md`
        *   `[✅]` All notification-driven data refreshes preserve user's stage selection
        *   `[✅]` Only explicit user actions (tab click, Submit) change viewed stage
    *   `[✅]` **Commit** `test(integration): add stage navigation stability tests for generation lifecycle`

*   `[✅]` supabase/functions/_shared/ai_service/`anthropic_adapter.ts` **[BE] Format resourceDocuments as Claude document content blocks**
    *   `[✅]` `objective.md`
        *   `[✅]` When `request.resourceDocuments` has items, format each as a Claude `document` content block
        *   `[✅]` Use `PlainTextSource` with document_key as title and stage as context
        *   `[✅]` Prepend document blocks to the content array before text/user messages
    *   `[✅]` `role.md`
        *   `[✅]` AI provider adapter - Anthropic/Claude specific implementation
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `AnthropicAdapter.sendMessage` method
        *   `[✅]` Affects message construction before `this.client.messages.create`
    *   `[✅]` `deps.md`
        *   `[✅]` `request.resourceDocuments` - array of `{ id, content, document_key?, stage_slug?, type? }`
        *   `[✅]` Anthropic SDK `MessageParam` type with content blocks
    *   `[✅]` interface/`interface.ts`
        *   `[✅]` No interface changes; uses existing `ChatApiRequest.resourceDocuments`
    *   `[✅]` unit/`anthropic_adapter.test.ts`
        *   `[✅]` Assert when `resourceDocuments` present, they appear as `type: "document"` blocks in API call
        *   `[✅]` Assert document title is set to document_key
        *   `[✅]` Assert document context includes stage_slug
        *   `[✅]` Assert empty resourceDocuments does not add document blocks
        *   `[✅]` Assert document blocks are prepended before user message content
    *   `[✅]` `anthropic_adapter.ts`
        *   `[✅]` In `sendMessage`, after extracting messages, check `request.resourceDocuments`
        *   `[✅]` For each doc, create content block: `{ type: "document", source: { type: "text", media_type: "text/plain", data: doc.content }, title: doc.document_key, context: doc.stage_slug }`
        *   `[✅]` Build final content array as `[...documentBlocks, ...textBlocks]`
        *   `[✅]` Pass structured content array to `this.client.messages.create`
    *   `[✅]` `requirements.md`
        *   `[✅]` Documents reach Claude as native document blocks with metadata
        *   `[✅]` Claude can reference documents by title in responses
        *   `[✅]` Citations enabled for document content
    *   `[✅]` **Commit** `fix(be): format resourceDocuments as Claude document content blocks in AnthropicAdapter`

*   `[✅]` supabase/functions/_shared/ai_service/`google_adapter.ts` **[BE] Format resourceDocuments as Gemini inline_data parts**
    *   `[✅]` `objective.md`
        *   `[✅]` When `request.resourceDocuments` has items, format each as Gemini `inline_data` part
        *   `[✅]` Use `text/plain` mime_type for markdown content
        *   `[✅]` Include document label text part before each inline_data for context
    *   `[✅]` `role.md`
        *   `[✅]` AI provider adapter - Google Gemini specific implementation
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `GoogleAdapter.sendMessage` method
        *   `[✅]` Affects parts construction before `chat.sendMessage`
    *   `[✅]` `deps.md`
        *   `[✅]` `request.resourceDocuments` - array of `{ id, content, document_key?, stage_slug?, type? }`
        *   `[✅]` Google Generative AI SDK `Content` and parts types
    *   `[✅]` interface/`interface.ts`
        *   `[✅]` No interface changes
    *   `[✅]` unit/`google_adapter.test.ts`
        *   `[✅]` Assert when `resourceDocuments` present, they appear as `inline_data` parts
        *   `[✅]` Assert mime_type is `text/plain`
        *   `[✅]` Assert document label text precedes each inline_data
        *   `[✅]` Assert empty resourceDocuments does not add extra parts
    *   `[✅]` `google_adapter.ts`
        *   `[✅]` In `sendMessage`, after building history, check `request.resourceDocuments`
        *   `[✅]` For each doc, add parts: `{ text: "[Document: ${doc.document_key} from ${doc.stage_slug}]" }` and `{ inline_data: { mime_type: "text/plain", data: doc.content } }`
        *   `[✅]` Prepend document parts to the final user message parts
    *   `[✅]` `requirements.md`
        *   `[✅]` Documents reach Gemini as inline_data with proper mime_type
        *   `[✅]` Documents are labeled for model to reference
    *   `[✅]` **Commit** `fix(be): format resourceDocuments as Gemini inline_data parts in GoogleAdapter`

*   `[✅]` supabase/functions/_shared/ai_service/`openai_adapter.ts` **[BE] Format resourceDocuments as labeled text in messages**
    *   `[✅]` `objective.md`
        *   `[✅]` When `request.resourceDocuments` has items, embed as labeled text content
        *   `[✅]` OpenAI Chat Completions lacks native document blocks - use structured text
        *   `[✅]` Format: `[Document: {key} from {stage}]\n{content}`
    *   `[✅]` `role.md`
        *   `[✅]` AI provider adapter - OpenAI specific implementation
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `OpenAiAdapter.sendMessage` method
        *   `[✅]` Affects message construction before `this.client.chat.completions.create`
    *   `[✅]` `deps.md`
        *   `[✅]` `request.resourceDocuments` - array of `{ id, content, document_key?, stage_slug?, type? }`
        *   `[✅]` OpenAI SDK `ChatCompletionMessageParam` type
    *   `[✅]` interface/`interface.ts`
        *   `[✅]` No interface changes
    *   `[✅]` unit/`openai_adapter.test.ts`
        *   `[✅]` Assert when `resourceDocuments` present, they appear as text in messages
        *   `[✅]` Assert document labels are present in message content
        *   `[✅]` Assert empty resourceDocuments does not add placeholder messages
    *   `[✅]` `openai_adapter.ts`
        *   `[✅]` In `sendMessage`, after building openaiMessages, check `request.resourceDocuments`
        *   `[✅]` For each doc, prepend user message: `{ role: "user", content: "[Document: ${doc.document_key} from ${doc.stage_slug}]\n${doc.content}" }`
        *   `[✅]` Or concatenate all docs into single context message before the user prompt
    *   `[✅]` `requirements.md`
        *   `[✅]` Documents reach OpenAI as labeled text
        *   `[✅]` Model can reference documents by key
    *   `[✅]` **Commit** `fix(be): format resourceDocuments as labeled text in OpenAiAdapter`

*   `[✅]` supabase/functions/dialectic-worker/`executeModelCallAndSave.ts` **[BE] Fail-fast guard: error if required inputsRequired documents are empty**
    *   `[✅]` `objective.md`
        *   `[✅]` After gathering and scoping, validate required documents exist
        *   `[✅]` Error BEFORE API call if required documents missing
        *   `[✅]` Prevents wasted API spend on useless "no documents" responses
    *   `[✅]` `role.md`
        *   `[✅]` Backend worker - execution layer guard
    *   `[✅]` `module.md`
        *   `[✅]` Bounded to `executeModelCallAndSave` after `applyInputsRequiredScope`
    *   `[✅]` `deps.md`
        *   `[✅]` `params.inputsRequired` - rules specifying required documents
        *   `[✅]` `scopedDocs` - result of document gathering
    *   `[✅]` unit/`executeModelCallAndSave.test.ts`
        *   `[✅]` Assert error thrown when required docs missing
        *   `[✅]` Assert error message identifies missing document_key/stage
        *   `[✅]` Assert optional docs don't cause error when missing
        *   `[✅]` Update test at line ~1353 (remove assertion that docs must NOT be in messages - that was wrong)
    *   `[✅]` `executeModelCallAndSave.ts`
        *   `[✅]` Remove outdated comment at line 1005
        *   `[✅]` After line ~428, add validation for each `required: true` rule
        *   `[✅]` Throw descriptive error if required doc missing
    *   `[✅]` `requirements.md`
        *   `[✅]` Required documents validated before expensive API call
        *   `[✅]` Clear error message for missing inputs
    *   `[✅]` **Commit** `fix(be): fail-fast when required inputsRequired documents are missing`

*   `[✅]` **[TEST-INT]** Integration test for provider-specific document formatting
    *   `[✅]` `objective.md`
        *   `[✅]` Prove each adapter correctly formats resourceDocuments for its provider
        *   `[✅]` Prove documents reach the model (via mock/spy on provider API call)
    *   `[✅]` integration/`adapter_resource_documents.integration.test.ts`
        *   `[✅]` Test: AnthropicAdapter includes document content blocks with title/context
        *   `[✅]` Test: GoogleAdapter includes inline_data parts with text/plain
        *   `[✅]` Test: OpenAiAdapter includes labeled text in messages
        *   `[✅]` Test: Empty resourceDocuments doesn't break any adapter
    *   `[✅]` `requirements.md`
        *   `[✅]` All adapters correctly handle resourceDocuments
        *   `[✅]` Provider-specific formatting verified
    *   `[✅]` **Commit** `test(integration): add tests for provider-specific resourceDocuments formatting`

*   `[✅]`   packages/types + packages/store / submitStageDocumentFeedback payload **[STORE] Frontend: align SubmitStageDocumentFeedback payload with backend contract**
    *   `[✅]`   `objective.md`
        *   `[✅]`   Backend requires feedbackContent, userId, projectId, feedbackType; frontend must send them so the request is valid and verifiable.
        *   `[✅]`   Remove trust of minimal frontend shape: caller proves identity and context in the payload.
    *   `[✅]`   `role.md`
        *   `[✅]`   Application types (packages/types) define the wire contract for dialectic-service.
        *   `[✅]`   Store (packages/store) builds the payload from auth and dialectic state and calls API.
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: SubmitStageDocumentFeedbackPayload in packages/types and all call sites that build or pass it (dialecticStore.ts, dialecticStore.documents.ts).
        *   `[✅]`   Boundary: API (packages/api) forwards the typed payload; no enrichment.
    *   `[✅]`   `deps.md`
        *   `[✅]`   packages/types: SubmitStageDocumentFeedbackPayload must match backend SubmitStageDocumentFeedbackPayload (dialectic.interface.ts).
        *   `[✅]`   Store depends on useAuthStore (userId), activeSessionDetail or session/project (projectId), feedbackDraftMarkdown (feedbackContent), and a constant or config for feedbackType (e.g. 'user_feedback').
        *   `[✅]`   API depends on the type from packages/types; no extra fields.
    *   `[✅]`   interface/`interface.ts` (packages/types dialectic.types.ts)
        *   `[✅]`   SubmitStageDocumentFeedbackPayload: require feedbackContent (string), userId (string), projectId (string), feedbackType (string); keep sessionId, stageSlug, iterationNumber, modelId, documentKey; optional feedbackId, sourceContributionId. Remove or deprecate feedback in favor of feedbackContent.
        *   `[✅]`   Each field is its own nested item for comparison and iteration.
    *   `[✅]`   interface/tests/`[function].interface.test.ts`
        *   `[✅]`   If type-guard or contract tests exist for this payload, update them for the new required fields.
    *   `[✅]`   unit/`[function].test.ts` (store tests)
        *   `[✅]`   Assert that submitStageDocumentFeedback (and submitStageResponses when feedback is dirty) builds payload with feedbackContent, userId, projectId, feedbackType.
        *   `[✅]`   Assert payload shape matches backend contract (no missing required fields).
    *   `[✅]`   `[function].ts` (packages/store dialecticStore.ts + dialecticStore.documents.ts)
        *   `[✅]`   Where feedback payload is built: set feedbackContent from feedback draft; set userId from auth; set projectId from session/project; set feedbackType (e.g. 'user_feedback'). Use SubmitStageDocumentFeedbackPayload from packages/types.
        *   `[✅]`   Each requirement is its own nested item.
    *   `[✅]`   provides/`[function].provides.ts`
        *   `[✅]`   Store action submitStageDocumentFeedback and submitStageResponses path that builds feedback payload; API method submitStageDocumentFeedback that sends payload as-is.
    *   `[✅]`   integration/`[function].integration.test.ts`
        *   `[✅]`   If present: assert that when feedback is submitted, the payload sent to dialectic-service includes feedbackContent, userId, projectId, feedbackType.
    *   `[✅]`   `requirements.md`
        *   `[✅]`   SubmitStageDocumentFeedbackPayload in types has required feedbackContent, userId, projectId, feedbackType.
        *   `[✅]`   All call sites build payload with those fields; backend validation passes without relaxing checks.
    *   `[✅]`   **Commit** `fix(types,store): align SubmitStageDocumentFeedback payload with backend contract (feedbackContent, userId, projectId, feedbackType)`
        *   `[✅]`   Detail each change in types and store payload construction.

*   `[✅]`   supabase/functions/dialectic-service/index.ts / saveContributionEdit branch **[BE] Backend: use service-role client for FileManager in saveContributionEdit**
    *   `[✅]`   `objective.md`
        *   `[✅]`   saveContributionEdit currently uses userClient for FileManager; storage bucket RLS disallows INSERT for authenticated, causing 403 and 500.
        *   `[✅]`   Edge Function must perform upload and dialectic_project_resources upsert with service role so the write is allowed.
    *   `[✅]`   `role.md`
        *   `[✅]`   Router (index.ts) wires handlers and constructs context (dbClient, fileManager, etc.) per action.
        *   `[✅]`   saveContributionEdit handler receives SaveContributionEditContext including fileManager; user is already validated via JWT.
    *   `[✅]`   `module.md`
        *   `[✅]`   Boundary: saveContributionEdit case in index.ts only; no change to saveContributionEdit.ts or FileManagerService implementation.
        *   `[✅]`   Boundary: FileManager is constructed in index.ts and passed into SaveContributionEditContext.
    *   `[✅]`   `deps.md`
        *   `[✅]`   SaveContributionEditContext requires fileManager: IFileManager. FileManagerService(supabaseClient, deps) uses that client for storage and DB.
        *   `[✅]`   For saveContributionEdit branch only: pass adminClient (service role) to FileManagerService instead of userClient; keep userClient for dbClient if reads must remain RLS-bound.
    *   `[✅]`   interface/`interface.ts`
        *   `[✅]`   No interface change; SaveContributionEditContext and IFileManager unchanged.
    *   `[✅]`   unit/`[function].test.ts`
        *   `[✅]`   If index tests stub or assert FileManager construction per action: assert saveContributionEdit branch uses adminClient (or equivalent) for fileManager.
    *   `[✅]`   `[function].ts` (index.ts)
        *   `[✅]`   In case "saveContributionEdit": build FileManager with adminClient (e.g. new FileManagerService(adminClient, FileManagerDependencies)) when constructing SaveContributionEditContext; do not use userClient for fileManager in this branch.
        *   `[✅]`   Each requirement is its own nested item.
    *   `[✅]`   provides/`[function].provides.ts`
        *   `[✅]`   createDialecticHandler / handleRequest: saveContributionEdit branch exposes no new routes; only wiring of fileManager client changes.
    *   `[✅]`   integration/`[function].integration.test.ts`
        *   `[✅]`   If present: assert saveContributionEdit flow completes (upload + resource upsert) without RLS 403; may require local Supabase or mocked storage.
    *   `[✅]`   `requirements.md`
        *   `[✅]`   FileManager used by saveContributionEdit is created with adminClient so storage INSERT and dialectic_project_resources upsert succeed.
        *   `[✅]`   No relaxation of payload or user validation; only the client used for the write is elevated.
    *   `[✅]`   **Commit** `fix(be): use adminClient for FileManager in saveContributionEdit to satisfy storage RLS`
        *   `[✅]`   Detail the change in index.ts saveContributionEdit context construction.

## Progress Tracking SSOT Implementation

### User Complaints Addressed
- Progress bar starts at 20% instead of 0%
- Multiple progress indicators disagree (badge, title bar, documents, progress bar)
- StageRunChecklist hides documents for future stages
- Not all backend steps emit started/completed notices
- Progress bar shows useless/inaccurate information

### Scope
- Consolidate to single source of truth for progress tracking
- Remove unused `sessionProgress` system in favor of `stageRunProgress`
- Ensure ALL backend jobs emit start/error/fail/completed notifications for complete DAG visibility
- Calculate progress dynamically from recipe × model count × actual completion
- Steps with model calls: progress = completedModels / totalModels
- Steps without model calls: progress = 1/1 (complete when step completes)
- Extract embedded progress bar from page into reusable component
- Consolidate ALL progress indicators (title bar, badge, progress bar, documents) to SSOT
- Show all stage documents with appropriate status indicators

---

*   `[ ]` [BE] supabase/functions/dialectic-worker/`processComplexJob` **Emit complete lifecycle notifications for PLAN jobs (started, completed, error, failed)**
    *   `[ ]` `deps.md`
        *   `[ ]` NotificationService from `_shared/utils/notification.service.ts`
        *   `[ ]` DocumentCentricNotificationEvent types from `_shared/types/notification.service.types.ts`
    *   `[ ]` `notification.service.types.ts`
        *   `[ ]` Add `PlannerCompletedPayload` interface extending DocumentPayload with type: 'planner_completed'
        *   `[ ]` Add `PlannerErrorPayload` interface with error details for recoverable errors
        *   `[ ]` Add `PlannerFailedPayload` interface with error details for terminal failures
    *   `[ ]` `processComplexJob.test.ts`
        *   `[ ]` Test: emits `planner_started` event when PLAN job begins processing (verify existing)
        *   `[ ]` Test: emits `planner_completed` event when PLAN job transitions to 'completed' status
        *   `[ ]` Test: emits `planner_error` event when PLAN job encounters recoverable error
        *   `[ ]` Test: emits `planner_failed` event when PLAN job exhausts retries
        *   `[ ]` Test: all payloads include sessionId, stageSlug, job_id, document_key, modelId, iterationNumber
        *   `[ ]` Test: notification is sent to projectOwnerUserId
    *   `[ ]` `processComplexJob.ts`
        *   `[ ]` Verify `planner_started` emission exists at job start (should already exist)
        *   `[ ]` Add `planner_completed` emission in the job completion path after all child jobs complete
        *   `[ ]` Add `planner_error` emission in catch blocks for recoverable errors
        *   `[ ]` Add `planner_failed` emission when job status becomes 'failed' or 'retry_loop_failed'
    *   `[ ]` **Commit** `feat(dialectic-worker): emit complete PLAN job lifecycle notifications (started/completed/error/failed)`

*   `[ ]` [BE] supabase/functions/dialectic-worker/`processRenderJob` **Emit complete lifecycle notifications for RENDER jobs (started, completed, error, failed)**
    *   `[ ]` `deps.md`
        *   `[ ]` NotificationService from `_shared/utils/notification.service.ts`
        *   `[ ]` DocumentCentricNotificationEvent types from `_shared/types/notification.service.types.ts`
    *   `[ ]` `notification.service.types.ts`
        *   `[ ]` Add `RenderStartedPayload` interface extending DocumentPayload with type: 'render_started'
        *   `[ ]` Add `RenderErrorPayload` interface with error details for recoverable errors
        *   `[ ]` Add `RenderFailedPayload` interface with error details for terminal failures
    *   `[ ]` `processRenderJob.test.ts`
        *   `[ ]` Test: emits `render_started` event when RENDER job begins processing
        *   `[ ]` Test: emits `render_completed` event when RENDER job finishes (verify existing)
        *   `[ ]` Test: emits `render_error` event when RENDER job encounters recoverable error
        *   `[ ]` Test: emits `render_failed` event when RENDER job exhausts retries
        *   `[ ]` Test: all payloads include sessionId, stageSlug, job_id, document_key, modelId, iterationNumber
        *   `[ ]` Test: notification is sent to projectOwnerUserId
    *   `[ ]` `processRenderJob.ts`
        *   `[ ]` Add `render_started` emission at the start of render job processing
        *   `[ ]` Verify `render_completed` emission exists at job completion (should already exist)
        *   `[ ]` Add `render_error` emission in catch blocks for recoverable errors
        *   `[ ]` Add `render_failed` emission when job status becomes 'failed' or 'retry_loop_failed'
    *   `[ ]` **Commit** `feat(dialectic-worker): emit complete RENDER job lifecycle notifications (started/completed/error/failed)`

*   `[ ]` [BE] supabase/functions/dialectic-worker/`processSimpleJob` **Emit complete lifecycle notifications for EXECUTE jobs (started, completed, error, failed)**
    *   `[ ]` `deps.md`
        *   `[ ]` NotificationService from `_shared/utils/notification.service.ts`
        *   `[ ]` DocumentCentricNotificationEvent types from `_shared/types/notification.service.types.ts`
    *   `[ ]` `notification.service.types.ts`
        *   `[ ]` Add `DocumentErrorPayload` interface extending DocumentPayload with type: 'document_error', error details
        *   `[ ]` Add `DocumentFailedPayload` interface extending DocumentPayload with type: 'document_failed', error details
    *   `[ ]` `processSimpleJob.test.ts`
        *   `[ ]` Test: emits `document_started` event when EXECUTE job begins processing (verify existing)
        *   `[ ]` Test: emits `document_completed` event when EXECUTE job finishes (verify existing)
        *   `[ ]` Test: emits `document_error` event when EXECUTE job encounters recoverable error
        *   `[ ]` Test: emits `document_failed` event when EXECUTE job exhausts retries
        *   `[ ]` Test: all payloads include sessionId, stageSlug, job_id, document_key, modelId, iterationNumber
        *   `[ ]` Test: error/failed payloads include error code and message
        *   `[ ]` Test: notification is sent to projectOwnerUserId
    *   `[ ]` `processSimpleJob.ts`
        *   `[ ]` Verify `document_started` emission exists at job start (should already exist)
        *   `[ ]` Verify `document_completed` emission exists at job completion (should already exist)
        *   `[ ]` Add `document_error` emission in catch blocks for recoverable errors
        *   `[ ]` Add `document_failed` emission when job status becomes 'failed' or 'retry_loop_failed'
    *   `[ ]` **Commit** `feat(dialectic-worker): emit complete EXECUTE job lifecycle notifications (started/completed/error/failed)`

*   `[ ]` [STORE] packages/store/src/`dialecticStore.selectors` **Add selectUnifiedProjectProgress selector for SSOT progress calculation**
    *   `[ ]` `deps.md`
        *   `[ ]` DialecticStateValues from `@paynless/types`
        *   `[ ]` recipesByStageSlug state for step counts
        *   `[ ]` stageRunProgress state for document completion status
        *   `[ ]` selectedModelIds state for model count
        *   `[ ]` currentProjectDetail.dialectic_process_templates for stage list
        *   `[ ]` selectSessionById for current stage/iteration
    *   `[ ]` `dialectic.types.ts`
        *   `[ ]` Add `UnifiedProjectProgress` interface with totalStages, completedStages, currentStageSlug, overallPercentage, currentStage, projectStatus
        *   `[ ]` Add `StepProgressDetail` interface with stepKey, stepName, totalModels, completedModels, stepPercentage, status
        *   `[ ]` Add `StageProgressDetail` interface with stageSlug, totalSteps, completedSteps, stagePercentage, stepsDetail, stageStatus
    *   `[ ]` `dialecticStore.selectors.test.ts`
        *   `[ ]` Test: returns 0% progress for new project with no completed documents
        *   `[ ]` Test: calculates step progress as completedModels/totalModels (e.g., 1/3 = 33%)
        *   `[ ]` Test: calculates stage progress as sum of step progress / total steps
        *   `[ ]` Test: calculates overall progress as (completed stages + current stage progress) / total stages
        *   `[ ]` Test: returns 100% when all stages complete
        *   `[ ]` Test: handles multi-model steps correctly (3 models = step complete only when all 3 finish)
        *   `[ ]` Test: handles non-model steps as 1/1 (step without model call counts as complete when step completes)
        *   `[ ]` Test: mixed recipe with model and non-model steps calculates correctly
        *   `[ ]` Test: returns 'failed' status if any document has failed status
        *   `[ ]` Test: returns 'in_progress' status when documents are generating
        *   `[ ]` Test: returns 'not_started' status for stages with no progress data
    *   `[ ]` `dialecticStore.selectors.ts`
        *   `[ ]` Implement `selectUnifiedProjectProgress(state, sessionId)` selector
        *   `[ ]` Get total stages from process template
        *   `[ ]` Get model count from selectedModelIds.length
        *   `[ ]` For each step, determine if it requires model calls (check job_type or outputs_required)
        *   `[ ]` Model steps: progress = completedModels / totalModels
        *   `[ ]` Non-model steps (e.g., assembly, render): progress = 1/1 when step status is completed
        *   `[ ]` For each stage, calculate step progress from stageRunProgress documents filtered by modelId
        *   `[ ]` Aggregate step → stage → project progress with proper weighting
        *   `[ ]` Derive status from document statuses (not_started | in_progress | completed | failed)
    *   `[ ]` **Commit** `feat(store): add selectUnifiedProjectProgress selector for SSOT progress tracking`

*   `[ ]` [UI] apps/web/src/components/common/`DynamicProgressBar` **Refactor to use selectUnifiedProjectProgress**
    *   `[ ]` `deps.md`
        *   `[ ]` selectUnifiedProjectProgress from `@paynless/store`
        *   `[ ]` UnifiedProjectProgress type from `@paynless/types`
        *   `[ ]` Progress UI component from `../ui/progress`
    *   `[ ]` `DynamicProgressBar.test.tsx`
        *   `[ ]` Test: renders 0% progress bar for new project
        *   `[ ]` Test: renders correct percentage from selectUnifiedProjectProgress.overallPercentage
        *   `[ ]` Test: displays current stage name in message
        *   `[ ]` Test: displays step detail (e.g., "Step 2/4: 2/3 models complete")
        *   `[ ]` Test: renders null when no session selected
    *   `[ ]` `DynamicProgressBar.tsx`
        *   `[ ]` Replace `state.sessionProgress[sessionId]` with `selectUnifiedProjectProgress(state, sessionId)`
        *   `[ ]` Update display to show overallPercentage from selector
        *   `[ ]` Update message to show meaningful progress info (stage, step, model counts)
        *   `[ ]` Remove dependency on legacy sessionProgress
    *   `[ ]` **Commit** `refactor(ui): DynamicProgressBar uses selectUnifiedProjectProgress SSOT`

*   `[ ]` [UI] apps/web/src/components/dialectic/`StageRunChecklist` **Show documents for all stages with appropriate status indicators**
    *   `[ ]` `deps.md`
        *   `[ ]` selectValidMarkdownDocumentKeys from `@paynless/store`
        *   `[ ]` selectStageRunProgress from `@paynless/store`
        *   `[ ]` selectStageRecipe from `@paynless/store`
        *   `[ ]` Process template stages from currentProjectDetail
    *   `[ ]` `StageRunChecklist.test.tsx`
        *   `[ ]` Test: displays documents for current stage with real-time status
        *   `[ ]` Test: displays documents for completed (past) stages with completed status
        *   `[ ]` Test: displays documents for future stages with "stage not ready" indicator
        *   `[ ]` Test: distinguishes "stage not ready" from "document not started" (stage ready but not run)
        *   `[ ]` Test: shows model progress per document (e.g., "2/3 models complete")
        *   `[ ]` Test: shows documents for all selected models, not just one
        *   `[ ]` Test: does not filter out documents lacking modelId for future stages
    *   `[ ]` `StageRunChecklist.tsx`
        *   `[ ]` Remove filter that hides future stage documents
        *   `[ ]` Add logic to determine stage readiness (is current stage or prior stage)
        *   `[ ]` Add "Stage not ready" visual indicator for stages after current
        *   `[ ]` Add "Not started" visual indicator for documents in ready stage that haven't begun
        *   `[ ]` Show model progress count for in-progress documents
        *   `[ ]` Always show what documents the stage will produce regardless of progress
    *   `[ ]` **Commit** `feat(ui): StageRunChecklist shows all stage documents with status indicators`

*   `[ ]` [UI] apps/web/src/components/dialectic/`StageTabCard` **Use SSOT for stage completion status**
    *   `[ ]` `deps.md`
        *   `[ ]` selectUnifiedProjectProgress from `@paynless/store`
        *   `[ ]` UnifiedProjectProgress type from `@paynless/types`
    *   `[ ]` `StageTabCard.test.tsx`
        *   `[ ]` Test: shows "Completed" label when stage is fully complete per SSOT
        *   `[ ]` Test: shows progress percentage for current stage from SSOT
        *   `[ ]` Test: shows "Not started" for future stages
        *   `[ ]` Test: shows "Failed" indicator when stage has failed documents
    *   `[ ]` `StageTabCard.tsx`
        *   `[ ]` Replace selectStageProgressSummary usage with selectUnifiedProjectProgress
        *   `[ ]` Derive stage completion from SSOT instead of separate calculation
        *   `[ ]` Ensure visual indicators align with DynamicProgressBar and StageRunChecklist
    *   `[ ]` **Commit** `refactor(ui): StageTabCard uses selectUnifiedProjectProgress SSOT`

*   `[ ]` [UI] apps/web/src/components/dialectic/`SessionInfoCard` **Consolidate ALL competing progress indicators (title bar, badge, progress bar, generating indicator)**
    *   `[ ]` `deps.md`
        *   `[ ]` selectUnifiedProjectProgress from `@paynless/store`
        *   `[ ]` DynamicProgressBar component
        *   `[ ]` UnifiedProjectProgress type from `@paynless/types`
    *   `[ ]` `SessionInfoCard.test.tsx`
        *   `[ ]` Test: displays single unified progress indicator from SSOT
        *   `[ ]` Test: title bar status text reflects SSOT projectStatus (not session.status)
        *   `[ ]` Test: status badge reflects SSOT projectStatus (not session.status)
        *   `[ ]` Test: title bar and badge show identical status
        *   `[ ]` Test: removes duplicate "Generating contributions..." indicator when progress bar is active
        *   `[ ]` Test: all status displays (title, badge, progress bar) agree with each other
    *   `[ ]` `SessionInfoCard.tsx`
        *   `[ ]` Replace `session.status` in title bar (line ~185) with SSOT-derived status
        *   `[ ]` Replace `session.status` in Badge (lines ~187-203) with SSOT-derived status
        *   `[ ]` Remove conditional that hides DynamicProgressBar when sessionProgress is missing
        *   `[ ]` Remove duplicate "Generating contributions..." indicator (redundant with progress bar)
        *   `[ ]` Ensure DynamicProgressBar is the single progress display
        *   `[ ]` All status text derived from selectUnifiedProjectProgress.projectStatus
    *   `[ ]` **Commit** `refactor(ui): SessionInfoCard consolidates ALL progress indicators (title/badge/bar) to SSOT`

*   `[ ]` [UI] apps/web/src/pages/`DialecticSessionDetailsPage` **Extract embedded progress bar and consolidate with SSOT**
    *   `[ ]` `deps.md`
        *   `[ ]` selectUnifiedProjectProgress from `@paynless/store`
        *   `[ ]` DynamicProgressBar component from `@/components/common/DynamicProgressBar`
        *   `[ ]` UnifiedProjectProgress type from `@paynless/types`
    *   `[ ]` `DialecticSessionDetailsPage.test.tsx`
        *   `[ ]` Test: sidebar uses DynamicProgressBar component (not inline calculation)
        *   `[ ]` Test: sidebar progress bar uses SSOT overallPercentage
        *   `[ ]` Test: stage count display (X/Y) derived from SSOT totalStages/completedStages
        *   `[ ]` Test: embedded progress bar removed in favor of DynamicProgressBar
        *   `[ ]` Test: progress bar percentage matches SessionInfoCard progress bar
    *   `[ ]` `DialecticSessionDetailsPage.tsx`
        *   `[ ]` Remove embedded progress bar div (lines ~169-197 with inline `width: ${...}%` calculation)
        *   `[ ]` Replace with DynamicProgressBar component
        *   `[ ]` Remove `activeStageForProgressBar` variable (no longer needed)
        *   `[ ]` Use selectUnifiedProjectProgress for stage count display
        *   `[ ]` Ensure stage count and percentage align with SessionInfoCard
    *   `[ ]` **Commit** `refactor(ui): DialecticSessionDetailsPage extracts embedded progress bar, uses DynamicProgressBar + SSOT`

*   `[ ]` [TEST-INT] packages/store/src/`dialecticStore.progress.integration` **Integration test: Frontend progress tracking from notifications to display**
    *   `[ ]` `deps.md`
        *   `[ ]` dialecticStore with all handlers and selectors
        *   `[ ]` Mock notification payloads for all lifecycle events
        *   `[ ]` Mock recipe and process template data
        *   `[ ]` selectUnifiedProjectProgress selector
    *   `[ ]` `dialecticStore.progress.integration.test.ts`
        *   `[ ]` Test: planner_started notification → store updates stepStatus to 'in_progress' → selector returns in_progress status
        *   `[ ]` Test: document_started notification → store updates document status → selector returns correct step progress
        *   `[ ]` Test: document_completed for 1 of 3 models → selector returns 33% step progress
        *   `[ ]` Test: document_completed for all 3 models → selector returns 100% step progress
        *   `[ ]` Test: all steps complete in stage → selector returns 100% stage progress
        *   `[ ]` Test: planner_failed notification → store updates status → selector returns 'failed' status
        *   `[ ]` Test: render_started → render_completed flow → selector reflects render step progress
        *   `[ ]` Test: non-model step completion → selector counts as 1/1
        *   `[ ]` Test: full stage lifecycle (started → documents → completed) → progress flows correctly 0% → 100%
        *   `[ ]` Test: multi-stage project with 5 stages → completing stage 1 shows 20% overall, completing stage 2 shows 40%, etc.
    *   `[ ]` **Commit** `test(store): integration tests for progress tracking from notifications to SSOT selector`

*   `[ ]` [TEST-INT] supabase/integration_tests/`notifications.progress.integration` **Integration test: Backend provides complete notifications for frontend progress tracking**
    *   `[ ]` `deps.md`
        *   `[ ]` dialectic-worker with all job processors
        *   `[ ]` NotificationService
        *   `[ ]` Test database with sample jobs
    *   `[ ]` `notifications.progress.integration.test.ts`
        *   `[ ]` Test: PLAN job lifecycle emits planner_started, planner_completed (happy path)
        *   `[ ]` Test: PLAN job error emits planner_error with error details
        *   `[ ]` Test: PLAN job retry exhaustion emits planner_failed
        *   `[ ]` Test: EXECUTE job lifecycle emits document_started, document_chunk_completed, document_completed
        *   `[ ]` Test: EXECUTE job error emits document_error with error details
        *   `[ ]` Test: EXECUTE job retry exhaustion emits document_failed
        *   `[ ]` Test: RENDER job lifecycle emits render_started, render_completed
        *   `[ ]` Test: RENDER job error emits render_error
        *   `[ ]` Test: RENDER job retry exhaustion emits render_failed
        *   `[ ]` Test: all notifications include required fields (sessionId, stageSlug, job_id, document_key, modelId, iterationNumber)
        *   `[ ]` Test: full recipe execution emits notifications in correct order matching DAG structure
        *   `[ ]` Test: notifications for multi-model stage include correct modelId per document
        *   `[ ]` Test: error notifications include actionable error details
    *   `[ ]` **Commit** `test(integration): backend emits complete job lifecycle notifications for progress tracking`

*   `[ ]` [STORE] packages/store/src/`dialecticStore` **Remove deprecated sessionProgress state and handler**
    *   `[ ]` `deps.md`
        *   `[ ]` Confirm no consumers of sessionProgress remain (frontend migrated)
        *   `[ ]` DialecticStateValues type from `@paynless/types`
    *   `[ ]` `dialectic.types.ts`
        *   `[ ]` Remove `sessionProgress: { [sessionId: string]: ProgressData }` from DialecticStateValues
        *   `[ ]` Remove `ProgressData` interface (no longer used)
    *   `[ ]` `dialecticStore.test.ts`
        *   `[ ]` Remove tests for `_handleProgressUpdate` handler
        *   `[ ]` Remove tests that reference `sessionProgress` state
        *   `[ ]` Verify no regressions in other handlers
    *   `[ ]` `dialecticStore.ts`
        *   `[ ]` Remove `sessionProgress: {}` from initial state
        *   `[ ]` Remove `_handleProgressUpdate` handler function
        *   `[ ]` Remove `dialectic_progress_update` case from `_handleDialecticLifecycleEvent`
    *   `[ ]` **Commit** `refactor(store): remove deprecated sessionProgress in favor of stageRunProgress SSOT`

*   `[ ]` [BE] supabase/functions/_shared/utils/`notification.service` **Remove unused sendDialecticProgressUpdateEvent method**
    *   `[ ]` `deps.md`
        *   `[ ]` Confirm no callers of sendDialecticProgressUpdateEvent exist (was never called)
        *   `[ ]` NotificationServiceType interface from `notification.service.types.ts`
    *   `[ ]` `notification.service.types.ts`
        *   `[ ]` Remove `DialecticProgressUpdatePayload` interface
        *   `[ ]` Remove `sendDialecticProgressUpdateEvent` from `NotificationServiceType` interface
        *   `[ ]` Remove `DialecticProgressUpdatePayload` from `DialecticLifecycleEvent` union type
    *   `[ ]` `notification.service.test.ts`
        *   `[ ]` Remove test for `sendDialecticProgressUpdateEvent`
        *   `[ ]` Verify no regressions in other notification methods
    *   `[ ]` `notification.service.ts`
        *   `[ ]` Remove `sendDialecticProgressUpdateEvent` method implementation
    *   `[ ]` `notification.service.mock.ts`
        *   `[ ]` Remove `mockDialecticProgressUpdatePayload` mock
        *   `[ ]` Remove mock implementation for `sendDialecticProgressUpdateEvent`
    *   `[ ]` **Commit** `refactor(notification-service): remove unused sendDialecticProgressUpdateEvent method`

---

### Verification Checklist (Post-Implementation)

*   `[ ]` Progress bar starts at 0% for new projects
*   `[ ]` Progress increments correctly: models → steps → stages → project
*   `[ ]` Non-model steps (assembly, render) count as 1/1 when complete
*   `[ ]` All progress indicators (title bar, badge, progress bar, documents) show same value
*   `[ ]` Embedded progress bar extracted from DialecticSessionDetailsPage
*   `[ ]` SessionInfoCard title, badge, and progress bar all use SSOT
*   `[ ]` StageRunChecklist shows documents for all stages (past, current, future)
*   `[ ]` "Stage not ready" vs "Document not started" clearly distinguished
*   `[ ]` Multi-model progress shows correctly (e.g., "2/3 models complete")
*   `[ ]` Backend emits complete lifecycle for all job types: started, completed, error, failed
*   `[ ]` PLAN jobs emit: planner_started, planner_completed, planner_error, planner_failed
*   `[ ]` EXECUTE jobs emit: document_started, document_chunk_completed, document_completed, document_error, document_failed
*   `[ ]` RENDER jobs emit: render_started, render_completed, render_error, render_failed
*   `[ ]` All notifications include required fields for frontend tracking
*   `[ ]` No references to deprecated `sessionProgress` or `dialectic_progress_update` remain
*   `[ ]` Frontend integration tests pass (notifications → store → selector → display)
*   `[ ]` Backend integration tests pass (all job types emit complete notifications)
*   `[ ]` All lint checks pass
*   `[ ]` All existing tests pass
*   `[ ]` New tests cover all added functionality

    - Each back end recipe step needs to emit granular notifications so that the store knows the exact progress through the DAG 
    -- Dev reports that not all steps/jobs emit started/completed notices
    -- Since job/step completed notices are patchy, they can't be relied on for tracking 
    -- Ensure every step/job start/error/fail/completed emits a notification 
    -- If every step/job emits a notification to the store, the store can track progress and inform the user   

    - All stage progress needs to draw from a SSOT in the store informed by the step progress notifications 
    -- User reports that dialectic page has multiple "progress" and "status" indicators that do not always agree 
    -- Upper right badge says one thing, title bar says another, documents say a third, progress indicator a fourth
    -- Proposed fix: Align and distill. SSOT for progress/status in store, all badges and notices draw from SSOT, remove duplicate progress/status indicators
    -- Each PROJECT has a status, each STAGE of the project has a status, each DOCUMENT of the stage has a status. Progress flows from documents -> stages -> project 
    -- This can all be consolidated in a single progress bar
    -- The objective of the work is to get documents, so we currently show a document-specific badge on each document 
    -- DEP: "each step needs to emit completed notice"  

    - StageRunChecklist must always show the documents stages will produce regardless of user progress or status  
    -- User reports when viewing future stages, StageTabCard / StageRunChecklist complains inputs_required isn't satisfied. 
    -- inputs_required isn't satisfied because the stage isn't ready yet, this isn't an error
    -- StageTabCard / StageRunChecklist must always show what the stage will produce 

    - Progress starts at 0% (project exists but nothing is done), and increment progress when steps are complete until reaching 100% (project finished)
    -- User reports progress indicator is confusing, it starts the first stage at 20% when there's no work done
    -- Going to the next stage increments to 40% even though the stage isn't done 
    -- Progress bar needs to start at 0% and increment on step completed/stage completed notices for accurate, granular progress 
    -- DEP: "each step needs to emit completed notice" & "progress SSOT" 

    - Progress bar is embedded in page, hard to test, shows useless info
    -- Progress bar needs to be extracted into its own component so it can be independent and testable 
    -- Progress bar must show granular, informed values
    --- Start at 0% for a new project
    --- Know how many "stages" are in the DAG the user has chosen, total progress is 1/(stages)
    --- Know how many "steps" are in each stage the user has chosen, stage progress is 1/(steps)
    --- Know how many "models" the user has chosen, each step that uses a model call is 1/(model)
    ---- Steps that do not have a model call are 1/1
    -- The stages/steps/models info should all be available in the store for the SSOT 
    -- The notifications are received by the store from the back end 
    -- The store therefore knows the exact status of the progress the user has made 
    -- Calculate the user's actual progress against the stages, steps, and models 
    -- Consume step start/completed notifications to increment progress dynamically 
    -- Each time the store updates its progress calculation, increment the progress bar accurately
    -- DEP: started/completed notices, store SSOT, start progress at 0%

    - Determine an index value for a full flow for 3 models and set that as the new user signup token deposit
    -- User reports their new sign up allocation was only enough to get 3/4 docs in thesis 
    -- Reasonable for a new user to want to complete an entire first project from their initial token allocation
    -- Not a dev task per se, but we need to run a few e2e multi-model flows and index the cost then set the new user sign up deposit close to that value
    -- This is not recurring, just a new user sign up 
    -- Dep: Will need to finally set up email validation so that users can't just create new accounts for each project 

    - Regenerate individual specific documents on demand without regenerating inputs or other sibling documents 
    -- User reports that a single document failed and they liked the other documents, but had to regenerate the entire stage
    -- User requests option to only regenerate the exact document that failed
    -- Initial investigation shows this should be possible, all the deps are met, we just need a means to dispatch a job for only the exact document that errored or otherwise wasn't produced so that the user does't have to rerun the entire stage to get a single document
    -- Added bonus, this lets users "roll the dice" to get a different/better/alternative version of an existing document if they want to try again 
    -- FOR CONSIDERATION: This is a powerful feature but implies a branch in the work
    --- User generates stage, all succeeds
    --- User advances stages, decides they want to fix an oversight in a prior stage
    --- User regenerates a prior document
    --- Now all subsequent documents are invalid
    --- Is this a true branch/iteration, or do we highlight the downstream products so that those can be regenerated from the new input that was produced? 
    --- PROPOSED: Implement regeneration prior to stage advancement, disable regeneration for documents who have downstream documents, set up future sprint for branching/iteration to support hints to regenerate downstream documents if a user regenerates upstream documents
    --- BLOCKER: Some stages are fundamentally dependent on all prior outputs, like synthesis, and the entire stage needs to be rerun if thesis/antithesis documents are regenerated

    - Email validation disabled
    -- Need to actually set up email validation
    
    - User password changes disabled
    -- need to actually set up password changes 

    - New user sign in banner doesn't display, throws console error  
    -- Chase, diagnose, fix 
