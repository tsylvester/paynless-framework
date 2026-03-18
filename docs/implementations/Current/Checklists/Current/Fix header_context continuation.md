[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## Fix 1: HeaderContext continuation filenames

*   `[✅]`   _shared/utils/`path_constructor.ts` **Add continuation suffix to HeaderContext and SynthesisHeaderContext filenames**
    *   `[✅]`   `objective`
        *   `[✅]`   HeaderContext filenames must include `_continuation_${turnIndex}` when `isContinuation` is true, consistent with all other file types that support continuations
        *   `[✅]`   SynthesisHeaderContext filenames must include the same continuation suffix for consistency
        *   `[✅]`   Non-continuation HeaderContext filenames must remain unchanged (no suffix when `isContinuation` is false or undefined)
    *   `[✅]`   `role`
        *   `[✅]`   Infrastructure utility — deterministic path construction for all file types in the dialectic storage layer
    *   `[✅]`   `module`
        *   `[✅]`   Path construction for HeaderContext and SynthesisHeaderContext file types within `constructStoragePath`
        *   `[✅]`   Both the antithesis pattern and simple pattern branches of HeaderContext must be updated
    *   `[✅]`   `deps`
        *   `[✅]`   `FileType` enum from `_shared/types/file_manager.types.ts` — type definition, domain layer, inward-facing, used for case matching
        *   `[✅]`   `PathContext` from `_shared/types/file_manager.types.ts` — type definition, domain layer, inward-facing, provides `isContinuation` and `turnIndex` fields
        *   `[✅]`   `extractSourceGroupFragment` from `_shared/utils/path_utils.ts` — utility, infrastructure layer, inward-facing, fragment extraction
        *   `[✅]`   No new dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `PathContext.isContinuation: boolean | undefined` — whether this is a continuation chunk
        *   `[✅]`   `PathContext.turnIndex: number | undefined` — the turn index of the continuation
        *   `[✅]`   Injection shape: `PathContext` interface already contains both fields
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   unit/`path_constructor.test.ts`
        *   `[✅]`   Test: HeaderContext antithesis pattern with `isContinuation: true, turnIndex: 3` produces filename containing `_continuation_3`
        *   `[✅]`   Test: HeaderContext simple pattern with `isContinuation: true, turnIndex: 2` produces filename containing `_continuation_2`
        *   `[✅]`   Test: HeaderContext antithesis pattern with `isContinuation: false` produces filename without `_continuation_` suffix (regression guard)
        *   `[✅]`   Test: HeaderContext simple pattern with `isContinuation: undefined` produces filename without `_continuation_` suffix (regression guard)
        *   `[✅]`   Test: SynthesisHeaderContext with `isContinuation: true, turnIndex: 1` produces filename containing `_continuation_1`
        *   `[✅]`   Test: SynthesisHeaderContext with `isContinuation: false` produces filename without `_continuation_` suffix (regression guard)
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors — `constructStoragePath` is a pure function, no factory required
        *   `[✅]`   Prohibited: constructing `PathContext` with `isContinuation: true` but `turnIndex: undefined`
        *   `[✅]`   Object completeness: `turnIndex` must be a number > 0 when `isContinuation` is true
    *   `[✅]`   `path_constructor.ts`
        *   `[✅]`   In the `FileType.HeaderContext` case: add `const continuationSuffix = isContinuation ? '_continuation_${turnIndex}' : '';` and append to both antithesis and simple pattern filenames before `.json`
        *   `[✅]`   In the `FileType.SynthesisHeaderContext` case: add the same `continuationSuffix` and append before `.json`
    *   `[✅]`   `directionality`
        *   `[✅]`   Infrastructure layer
        *   `[✅]`   All dependencies are inward-facing (types, utilities)
        *   `[✅]`   Provides outward-facing: `constructStoragePath` consumed by `FileManagerService`, `executeModelCallAndSave`, `assembleAndSaveFinalDocument`
    *   `[✅]`   `requirements`
        *   `[✅]`   HeaderContext continuation filenames are unique per turnIndex, eliminating the 5-attempt collision exhaustion
        *   `[✅]`   Non-continuation filenames remain unchanged
        *   `[✅]`   All existing path_constructor tests continue to pass

*   `[✅]`   _shared/utils/`path_deconstructor.ts` **Parse continuation suffix from HeaderContext and SynthesisHeaderContext filenames**
    *   `[✅]`   `objective`
        *   `[✅]`   The deconstructor must correctly parse `_continuation_${turnIndex}` from HeaderContext filenames (both antithesis and simple patterns)
        *   `[✅]`   The deconstructor must correctly parse `_continuation_${turnIndex}` from SynthesisHeaderContext filenames
        *   `[✅]`   Parsed results must set `isContinuation: true` and `turnIndex: N` on the `DeconstructedPathInfo`
        *   `[✅]`   Non-continuation HeaderContext paths must continue to parse correctly with `isContinuation` and `turnIndex` unset
    *   `[✅]`   `role`
        *   `[✅]`   Infrastructure utility — reverse-engineers path components from stored file paths for chain-walking and assembly
    *   `[✅]`   `module`
        *   `[✅]`   Regex patterns and match blocks for HeaderContext antithesis, HeaderContext simple, and SynthesisHeaderContext paths
    *   `[✅]`   `deps`
        *   `[✅]`   `DeconstructedPathInfo` from `_shared/utils/path_deconstructor.types.ts` — type definition, domain layer, inward-facing, already has `isContinuation` and `turnIndex` fields
        *   `[✅]`   `FileType` from `_shared/types/file_manager.types.ts` — type definition, domain layer, inward-facing
        *   `[✅]`   No new dependencies introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `DeconstructedPathInfo.isContinuation` and `DeconstructedPathInfo.turnIndex` — already defined in `path_deconstructor.types.ts`
        *   `[✅]`   No new types required
    *   `[✅]`   unit/`path_deconstructor.test.ts`
        *   `[✅]`   Test: HeaderContext antithesis path with `_continuation_3` suffix correctly parses `isContinuation: true, turnIndex: 3`
        *   `[✅]`   Test: HeaderContext simple path with `_continuation_2` suffix correctly parses `isContinuation: true, turnIndex: 2`
        *   `[✅]`   Test: SynthesisHeaderContext path with `_continuation_1` suffix correctly parses `isContinuation: true, turnIndex: 1`
        *   `[✅]`   Test: HeaderContext antithesis path without continuation suffix does not set `isContinuation` or `turnIndex` (regression guard)
        *   `[✅]`   Test: HeaderContext simple path without continuation suffix does not set `isContinuation` or `turnIndex` (regression guard)
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors — `deconstructStoragePath` is a pure function
    *   `[✅]`   `path_deconstructor.ts`
        *   `[✅]`   Update `headerContextAntithesisPatternString` regex to optionally capture `_continuation_(\d+)` before `.json`
        *   `[✅]`   Update `headerContextPatternString` regex to optionally capture `_continuation_(\d+)` before `.json`
        *   `[✅]`   Update `synthesisHeaderContextPatternString` regex to optionally capture `_continuation_(\d+)` before `.json`
        *   `[✅]`   In each corresponding match block, set `info.isContinuation = true` and `info.turnIndex = parseInt(...)` when the continuation capture group is present
    *   `[✅]`   `directionality`
        *   `[✅]`   Infrastructure layer
        *   `[✅]`   All dependencies are inward-facing (types)
        *   `[✅]`   Provides outward-facing: `deconstructStoragePath` consumed by `assembleAndSaveFinalDocument`, `gatherArtifacts`, `gatherContinuationInputs`
    *   `[✅]`   `requirements`
        *   `[✅]`   Round-trip fidelity: paths constructed by `constructStoragePath` with continuation fields must be correctly deconstructed back to the same fields
        *   `[✅]`   All existing path_deconstructor tests continue to pass
    *   `[✅]`   **Commit** `fix(_shared): add continuation suffix to HeaderContext/SynthesisHeaderContext path construction and deconstruction`
        *   `[✅]`   `path_constructor.ts` — added `_continuation_${turnIndex}` suffix to HeaderContext (antithesis + simple) and SynthesisHeaderContext cases
        *   `[✅]`   `path_constructor.test.ts` — added tests for continuation and non-continuation HeaderContext/SynthesisHeaderContext filenames
        *   `[✅]`   `path_deconstructor.ts` — updated regexes to parse optional `_continuation_N` suffix for HeaderContext and SynthesisHeaderContext paths
        *   `[✅]`   `path_deconstructor.test.ts` — added tests for continuation and non-continuation HeaderContext/SynthesisHeaderContext path parsing

## Fix 2: Assemble prior fragments for continuation prompts

*   `[✅]`   _shared/prompt-assembler/`assembleContinuationPrompt.ts` **Walk full continuation chain instead of fetching only the prior fragment**
    *   `[✅]`   `objective`
        *   `[✅]`   On each continuation turn, assemble ALL prior fragments from the full contribution chain (not just the single `target_contribution_id`) and include them in the prompt sent to the model
        *   `[✅]`   The model must see the complete accumulated output from all prior turns so it can coherently continue or resolve incomplete/malformed output
        *   `[✅]`   Use the existing `gatherContinuationInputs` function which already correctly walks the chain, sorts by `turnIndex`/`created_at`, downloads all fragments, and builds an alternating assistant/user message array
    *   `[✅]`   `role`
        *   `[✅]`   Application service — prompt assembly for continuation jobs in the dialectic worker pipeline
    *   `[✅]`   `module`
        *   `[✅]`   Continuation prompt assembly: replaces single-fragment fetch with full chain assembly
        *   `[✅]`   Boundary: consumes contribution chain from database/storage, produces assembled prompt content for model call
    *   `[✅]`   `deps`
        *   `[✅]`   `AssembleContinuationPromptDeps` from `prompt-assembler.interface.ts` — interface, app layer, inward-facing, must be extended to include `gatherContinuationInputs` dependency
        *   `[✅]`   `GatherContinuationInputsFn` from `gatherContinuationInputs.ts` — function type, app layer, inward-facing, provides chain-walking and fragment assembly
        *   `[✅]`   `downloadFromStorage` from `_shared/supabase_storage_utils.ts` — adapter, infrastructure layer, inward-facing, required by `gatherContinuationInputs`
        *   `[✅]`   `HeaderContext` from `dialectic-service/dialectic.interface.ts` — type, domain layer, inward-facing
        *   `[✅]`   `FileType` from `_shared/types/file_manager.types.ts` — type, domain layer, inward-facing
        *   `[✅]`   `IFileManager` from `_shared/types/file_manager.types.ts` — interface, app layer, inward-facing
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `GatherContinuationInputsFn` — the function that walks the contribution chain and returns `Messages[]`
        *   `[✅]`   `downloadFromStorage` — needed to pass to `gatherContinuationInputs` as its download dependency
        *   `[✅]`   Injection shape: both injected via `AssembleContinuationPromptDeps` interface (interface only, never concrete)
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   interface/`prompt-assembler.interface.ts`
        *   `[✅]`   Extend `AssembleContinuationPromptDeps` to include `gatherContinuationInputs: GatherContinuationInputsFn`
        *   `[✅]`   Extend `AssembleContinuationPromptDeps` to include `downloadFromStorage` with the signature required by `gatherContinuationInputs`
    *   `[✅]`   unit/`assembleContinuationPrompt.test.ts`
        *   `[✅]`   Update all existing test deps constructions to include `gatherContinuationInputs` and `downloadFromStorage` fields (compilation will fail without this)
        *   `[✅]`   Test: When continuation has multiple prior fragments in chain, all fragments are included in prompt content in order
        *   `[✅]`   Test: When continuation has a single prior fragment (first continuation), that fragment is included in prompt content
        *   `[✅]`   Test: `gatherContinuationInputs` is called with the root contribution ID from the chain (not just `target_contribution_id`)
        *   `[✅]`   Test: Header context from `inputs.header_context_id` is still fetched and prepended when available
        *   `[✅]`   Test: Prompt saved to storage includes the assembled multi-fragment content
        *   `[✅]`   Test: Error when `gatherContinuationInputs` fails to retrieve chain propagates correctly
    *   `[✅]`   `construction`
        *   `[✅]`   `assembleContinuationPrompt` is a standalone async function, no factory
        *   `[✅]`   Prohibited: calling `assembleContinuationPrompt` without providing `gatherContinuationInputs` in deps
        *   `[✅]`   Object completeness: `AssembleContinuationPromptDeps` must have all fields populated at the call boundary
    *   `[✅]`   `assembleContinuationPrompt.ts`
        *   `[✅]`   Replace the single-contribution fetch (current lines 128-165) with a call to `deps.gatherContinuationInputs` that walks the full chain from the root contribution
        *   `[✅]`   To find the root contribution: walk backwards from `target_contribution_id` via `target_contribution_id` links until reaching a contribution with no `target_contribution_id` (the root)
        *   `[✅]`   Pass the root contribution ID to `gatherContinuationInputs` which returns ordered `Messages[]` with all prior fragments
        *   `[✅]`   Build the prompt from: optional header context `system_materials` + all prior fragment messages (the assembled chain content)
        *   `[✅]`   Preserve: header context fetch from `inputs.header_context_id` (lines 52-115) — this is upstream context, not the thing being generated
        *   `[✅]`   Preserve: prompt file upload to storage (lines 191-219)
    *   `[✅]`   `directionality`
        *   `[✅]`   Application layer
        *   `[✅]`   All dependencies are inward-facing (interfaces, types, injected functions)
        *   `[✅]`   Provides outward-facing: consumed by `PromptAssembler.assemble` which is consumed by `processSimpleJob`
    *   `[✅]`   `requirements`
        *   `[✅]`   On each continuation, the model receives the complete accumulated output from all prior turns
        *   `[✅]`   The model can coherently continue or resolve incomplete/malformed JSON because it sees the full context
        *   `[✅]`   Existing non-continuation prompt assembly paths are unaffected

*   `[✅]`   _shared/prompt-assembler/`prompt-assembler.ts` **Wire gatherContinuationInputs into assembleContinuationPrompt call site**
    *   `[✅]`   `objective`
        *   `[✅]`   The `PromptAssembler` class must pass the `gatherContinuationInputs` dependency and `downloadFromStorage` to `assembleContinuationPrompt` when calling it
    *   `[✅]`   `role`
        *   `[✅]`   Application service — facade that dispatches to the correct prompt assembly strategy
    *   `[✅]`   `module`
        *   `[✅]`   The `assemble` method's continuation branch and the `assembleContinuationPrompt` method wrapper
    *   `[✅]`   `deps`
        *   `[✅]`   `GatherContinuationInputsFn` from `gatherContinuationInputs.ts` — already wired as `this.gatherContinuationInputsFn` in constructor (line 74)
        *   `[✅]`   `downloadFromStorage` — already wired as `this.downloadFromStorageFn` in constructor (line 66)
        *   `[✅]`   No new dependencies introduced; both are already available on the class instance
    *   `[✅]`   `context_slice`
        *   `[✅]`   `this.gatherContinuationInputsFn` — already stored on class from constructor
        *   `[✅]`   `this.downloadFromStorageFn` — already stored on class from constructor
        *   `[✅]`   No new injection shapes required
    *   `[✅]`   unit/`prompt-assembler.test.ts`
        *   `[✅]`   Update existing deps construction at lines 508-516 to include `gatherContinuationInputs` and `downloadFromStorage` fields (compilation will fail without this)
        *   `[✅]`   Test: When dispatching to continuation path, `gatherContinuationInputs` and `downloadFromStorage` are passed in the deps object
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors — `PromptAssembler` constructor already accepts and stores `gatherContinuationInputsFn`
    *   `[✅]`   `prompt-assembler.ts`
        *   `[✅]`   In the `assemble` method's continuation branch (line 88-97), add `gatherContinuationInputs: this.gatherContinuationInputsFn` and `downloadFromStorage: this.downloadFromStorageFn` to the deps object passed to `this.assembleContinuationPrompt`
    *   `[✅]`   `directionality`
        *   `[✅]`   Application layer
        *   `[✅]`   All dependencies are inward-facing (already wired)
        *   `[✅]`   Provides outward-facing: `assemble` consumed by `processSimpleJob`
    *   `[✅]`   integration/`prompt_assembler.integration.test.ts`
        *   `[✅]`   Update existing deps construction at lines 745-753 to include `gatherContinuationInputs` and `downloadFromStorage` fields (compilation will fail without this)
        *   `[✅]`   `gatherContinuationInputs` must be provided as the real function or an appropriate mock/spy matching `GatherContinuationInputsFn`
        *   `[✅]`   `downloadFromStorage` must be provided matching the signature `(bucket: string, path: string) => Promise<DownloadStorageResult>`
    *   `[✅]`   `requirements`
        *   `[✅]`   `assembleContinuationPrompt` receives the chain-walking dependency it needs
        *   `[✅]`   All existing prompt assembly paths (seed, planner, turn) are unaffected
        *   `[✅]`   All existing tests that construct `AssembleContinuationPromptDeps` compile and pass with the extended interface
    *   `[✅]`   **Commit** `fix(prompt-assembler): assemble full continuation chain for model context instead of single prior fragment`
        *   `[✅]`   `prompt-assembler.interface.ts` — extended `AssembleContinuationPromptDeps` with `gatherContinuationInputs` and `downloadFromStorage`
        *   `[✅]`   `assembleContinuationPrompt.ts` — replaced single-fragment fetch with full chain assembly via `gatherContinuationInputs`
        *   `[✅]`   `assembleContinuationPrompt.test.ts` — updated existing deps constructions and added tests for multi-fragment chain assembly, root resolution, and error propagation
        *   `[✅]`   `prompt-assembler.ts` — wired `gatherContinuationInputs` and `downloadFromStorage` into continuation dispatch
        *   `[✅]`   `prompt-assembler.test.ts` — updated existing deps constructions and added test for dependency passthrough
        *   `[✅]`   `prompt_assembler.integration.test.ts` — updated deps construction to include new required fields

## Fix 3: AIModelSelector loads its own default models; createProjectAndAutoStart uses user-selected models

*   `[✅]`   [UI] apps/web/src/components/dialectic/`AIModelSelector.tsx` **Self-initialize default models on mount when selection is empty and no active session**
    *   `[✅]`   `objective`
        *   `[✅]`   On mount, if the dialectic model catalog is empty and not loading, trigger `fetchAIModelCatalog` so that default models can be resolved
        *   `[✅]`   On mount, if `selectedModels` is empty, `defaultModels` is non-empty, and there is no `activeContextSessionId`, call `setSelectedModels(defaultModels)` exactly once (ref-guarded) so the selector pre-populates with defaults
        *   `[✅]`   If the user clears all models after defaults were applied, the selection must stay cleared — no re-application of defaults within the same mount
        *   `[✅]`   On the session page (`activeContextSessionId` is set), defaults must never be applied — the session's persisted `selected_models` is the source of truth
    *   `[✅]`   `role`
        *   `[✅]`   UI component — model selection widget used in project creation and session management views
    *   `[✅]`   `module`
        *   `[✅]`   Catalog-fetch effect: ensures model catalog availability regardless of which consumer mounts the selector
        *   `[✅]`   Default-apply effect: one-time initialization of `selectedModels` from catalog defaults, guarded by ref and session presence
    *   `[✅]`   `deps`
        *   `[✅]`   `selectDefaultGenerationModels` from `@paynless/store` — selector, store layer, inward-facing, reads `modelCatalog` and filters for `is_default_generation && is_active`
        *   `[✅]`   `selectSelectedModels` from `@paynless/store` — selector, store layer, inward-facing, already consumed by this component
        *   `[✅]`   `fetchAIModelCatalog` from dialectic store — action, store layer, inward-facing, fetches catalog from API
        *   `[✅]`   `isLoadingModelCatalog` from dialectic store — state field, store layer, inward-facing, prevents redundant fetches
        *   `[✅]`   `modelCatalog` from dialectic store — state field, store layer, inward-facing, used to check if catalog is populated
        *   `[✅]`   `setSelectedModels` from dialectic store — action, store layer, inward-facing, sets `selectedModels` in state
        *   `[✅]`   `activeContextSessionId` from dialectic store — state field, store layer, inward-facing, guards against overwriting session models
        *   `[✅]`   No reverse dependency introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   From dialectic store: `modelCatalog`, `isLoadingModelCatalog`, `fetchAIModelCatalog`, `setSelectedModels`, `activeContextSessionId`
        *   `[✅]`   Selectors: `selectDefaultGenerationModels`, `selectSelectedModels` (already used)
        *   `[✅]`   Injection shape: Zustand selector functions and direct state access via `useDialecticStore`
        *   `[✅]`   No concrete imports from higher or lateral layers
    *   `[✅]`   unit/`AIModelSelector.test.tsx`
        *   `[✅]`   Update `setupMockStores` to include `fetchAIModelCatalog`, `setSelectedModels`, and `activeContextSessionId` in `dialecticActions` / `dialecticState`
        *   `[✅]`   Test: When `modelCatalog` is empty and `isLoadingModelCatalog` is false, `fetchAIModelCatalog` is called on mount
        *   `[✅]`   Test: When `modelCatalog` is non-empty, `fetchAIModelCatalog` is NOT called on mount
        *   `[✅]`   Test: When `selectedModels` is empty, `defaultModels` is non-empty (via `modelCatalog` with `is_default_generation: true`), and `activeContextSessionId` is null, `setSelectedModels` is called with the default models
        *   `[✅]`   Test: When `selectedModels` is already non-empty, `setSelectedModels` is NOT called for defaults (even if defaults exist)
        *   `[✅]`   Test: When `activeContextSessionId` is set (session page), `setSelectedModels` is NOT called for defaults even if `selectedModels` is empty
        *   `[✅]`   Test: After defaults are applied once, clearing all models (re-render with empty `selectedModels`) does NOT re-apply defaults (ref guard)
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors — component is a React FC, no factory required
        *   `[✅]`   `defaultsAppliedRef` is a `useRef<boolean>(false)` that flips to `true` after the first `setSelectedModels(defaultModels)` call and prevents re-application
    *   `[✅]`   `AIModelSelector.tsx`
        *   `[✅]`   Add `useRef` to React imports
        *   `[✅]`   Add `selectDefaultGenerationModels` to `@paynless/store` imports
        *   `[✅]`   From `useDialecticStore`, additionally select: `fetchAIModelCatalog`, `isLoadingModelCatalog`, `modelCatalog`, `setSelectedModels`, `activeContextSessionId`
        *   `[✅]`   Add `defaultModels` via `useDialecticStore(selectDefaultGenerationModels)`
        *   `[✅]`   Add `const defaultsAppliedRef = useRef<boolean>(false)`
        *   `[✅]`   Effect A — catalog fetch: when `modelCatalog.length === 0 && !isLoadingModelCatalog`, call `fetchAIModelCatalog()`
        *   `[✅]`   Effect B — apply defaults: when `!defaultsAppliedRef.current && defaultModels.length > 0 && selectedModels.length === 0 && !activeContextSessionId`, set `defaultsAppliedRef.current = true` and call `setSelectedModels(defaultModels)`
    *   `[✅]`   `directionality`
        *   `[✅]`   UI layer
        *   `[✅]`   All dependencies are inward-facing (store selectors, store actions, store state)
        *   `[✅]`   Provides outward-facing: `AIModelSelector` component consumed by `CreateDialecticProjectForm` and `SessionInfoCard`
    *   `[✅]`   `requirements`
        *   `[✅]`   On the create project form, the selector pre-populates with default models so the user can see and modify them before starting
        *   `[✅]`   On the session page, the selector reflects the session's persisted models without overwriting
        *   `[✅]`   User clearing all models is respected — no automatic re-selection
        *   `[✅]`   Catalog is fetched if missing, regardless of which consumer mounts the selector

*   `[✅]`   [STORE] packages/store/src/`dialecticStore.ts` **createProjectAndAutoStart prefers user-selected models over catalog defaults**
    *   `[✅]`   `objective`
        *   `[✅]`   `createProjectAndAutoStart` must read `selectedModels` from state (which the selector now pre-populates) and use them if non-empty
        *   `[✅]`   Fall back to `selectDefaultGenerationModels` only when `selectedModels` is empty (edge case / no selector mounted)
        *   `[✅]`   `hasDefaultModels` return field must reflect whether `modelsToUse` is non-empty, not whether catalog defaults specifically exist
    *   `[✅]`   `role`
        *   `[✅]`   Store action — orchestrates project creation, session start, and model resolution for the autostart flow
    *   `[✅]`   `module`
        *   `[✅]`   `createProjectAndAutoStart` action within the dialectic store slice
        *   `[✅]`   Boundary: model resolution logic at lines 848-851
    *   `[✅]`   `deps`
        *   `[✅]`   `selectSelectedModels` from `dialecticStore.selectors.ts` — selector, store layer, inward-facing, reads `state.selectedModels`
        *   `[✅]`   `selectDefaultGenerationModels` from `dialecticStore.selectors.ts` — selector, store layer, inward-facing, already imported and used (line 70, line 848)
        *   `[✅]`   No new dependencies introduced; `selectSelectedModels` is already exported from the selectors file
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `state.selectedModels` via `selectSelectedModels(get())` — the user's current model selection from the UI
        *   `[✅]`   `state.modelCatalog` via `selectDefaultGenerationModels(get())` — fallback when no user selection exists
        *   `[✅]`   No new injection shapes required
    *   `[✅]`   unit/`dialecticStore.autostart.test.ts`
        *   `[✅]`   Test: When `selectedModels` in state is non-empty, `startDialecticSession` is called with those models (not catalog defaults)
        *   `[✅]`   Test: When `selectedModels` in state is empty and catalog has defaults, `startDialecticSession` is called with catalog defaults (fallback)
        *   `[✅]`   Test: When `selectedModels` in state is empty and catalog has no defaults, `startDialecticSession` is NOT called and result has `hasDefaultModels: false`
        *   `[✅]`   Update existing test "calls startDialecticSession with projectId, stageSlug, selectedModels defaultModels" to set `selectedModels: []` in state to prove the fallback path
    *   `[✅]`   `construction`
        *   `[✅]`   No new constructors — `createProjectAndAutoStart` is an async action on the store
    *   `[✅]`   `dialecticStore.ts`
        *   `[✅]`   Import `selectSelectedModels` if not already imported in this file
        *   `[✅]`   At line 848, replace `const defaultModels = selectDefaultGenerationModels(get());` with model resolution that prefers user selection:
            *   `const currentSelectedModels: SelectedModels[] = selectSelectedModels(get());`
            *   `const modelsToUse: SelectedModels[] = currentSelectedModels.length > 0 ? currentSelectedModels : selectDefaultGenerationModels(get());`
        *   `[✅]`   At line 849, change `if (defaultModels.length === 0)` to `if (modelsToUse.length === 0)`
        *   `[✅]`   At line 857, change `selectedModels: defaultModels` to `selectedModels: modelsToUse`
        *   `[✅]`   At line 867, change `hasDefaultModels: true` to reflect `modelsToUse.length > 0`
    *   `[✅]`   `directionality`
        *   `[✅]`   Store layer
        *   `[✅]`   All dependencies are inward-facing (selectors from same module)
        *   `[✅]`   Provides outward-facing: `createProjectAndAutoStart` consumed by `CreateDialecticProjectForm`
    *   `[✅]`   `requirements`
        *   `[✅]`   When the user modifies model selection in the selector before clicking Create, those choices are used for session start
        *   `[✅]`   When no user selection exists (selector not mounted, or edge case), catalog defaults are used as fallback
        *   `[✅]`   Existing autostart flows that rely on catalog defaults continue to work when `selectedModels` is empty
    *   `[✅]`   **Commit** `feat(ui,store): AIModelSelector self-initializes default models; createProjectAndAutoStart respects user model selection`
        *   `[✅]`   `AIModelSelector.tsx` — added catalog-fetch effect and ref-guarded default-apply effect with session guard
        *   `[✅]`   `AIModelSelector.test.tsx` — added tests for catalog fetch trigger, default application, session guard, and ref guard
        *   `[✅]`   `dialecticStore.ts` — `createProjectAndAutoStart` prefers `selectedModels` from state over `selectDefaultGenerationModels` fallback
        *   `[✅]`   `dialecticStore.autostart.test.ts` — added tests for user-selected model preference and fallback path

## StageDAGProgressDialog does not color nodes correctly, probably relies on explicit hydration instead of dynamic hydration from notifications
- Update StageDAGProgressDialog to use notifications to change color too 

## Highlight the chosen Chat or Project in the left sidebar 
- Currently the sidebar gives no indication of which Chat or Project the user has focused
- Outline and/or highlight the chosen Chat or Project in the left sidebar

## New user sign in banner doesn't display, throws console error  
- Chase, diagnose, fix 

## Refactor EMCAS to break apart the functions, segment out the tests
- Move gatherArtifacts call to processSimpleJob
- Decide where to measure & RAG

## Switch to stream-to-buffer instead of chunking
- This lets us render the buffer in real time to show document progress 

## Build test fixtures for major function groups 
- Provide standard mock factories and objects 
- dialectic-worker, dialectic-service, document_renderer, anything else that has huge test files  

## Support user-provided API keys for their preferred providers 

## Regenerate existing document from user feedback & edits 

## Have an additional user input panel where they user can build their own hybrid versions from the ones provided 
AND/OR
## Let the user pick/rate their preferred version and drop the others 

## Use a gentle color schema to differentiate model outputs visually / at a glance 

## When doc loads for the first time, position at top 

## Search across documents for key terms 

## Collect user satisfaction evaluation after each generation "How would you feel if you couldn't use this again?" 

## Add optional outputs for selected stages
- A "landing page" output for the proposal stage
-- Landing page
-- Hero banner
-- Call to action
-- Email sign up 
- A "financial analysis" output for the "refinement" stage
-- 1/3/5 year 
-- Conservative / base / aggressive
-- IS, BS, CF 
- A "generate next set of work" for the implementation stage 

## Ensure front end components use friendly names 
- SessionInfoCard uses formal names instead of friendly names 

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 
