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

*   `[ ]`   _shared/prompt-assembler/`assembleContinuationPrompt.ts` **Walk full continuation chain instead of fetching only the prior fragment**
    *   `[ ]`   `objective`
        *   `[ ]`   On each continuation turn, assemble ALL prior fragments from the full contribution chain (not just the single `target_contribution_id`) and include them in the prompt sent to the model
        *   `[ ]`   The model must see the complete accumulated output from all prior turns so it can coherently continue or resolve incomplete/malformed output
        *   `[ ]`   Use the existing `gatherContinuationInputs` function which already correctly walks the chain, sorts by `turnIndex`/`created_at`, downloads all fragments, and builds an alternating assistant/user message array
    *   `[ ]`   `role`
        *   `[ ]`   Application service — prompt assembly for continuation jobs in the dialectic worker pipeline
    *   `[ ]`   `module`
        *   `[ ]`   Continuation prompt assembly: replaces single-fragment fetch with full chain assembly
        *   `[ ]`   Boundary: consumes contribution chain from database/storage, produces assembled prompt content for model call
    *   `[ ]`   `deps`
        *   `[ ]`   `AssembleContinuationPromptDeps` from `prompt-assembler.interface.ts` — interface, app layer, inward-facing, must be extended to include `gatherContinuationInputs` dependency
        *   `[ ]`   `GatherContinuationInputsFn` from `gatherContinuationInputs.ts` — function type, app layer, inward-facing, provides chain-walking and fragment assembly
        *   `[ ]`   `downloadFromStorage` from `_shared/supabase_storage_utils.ts` — adapter, infrastructure layer, inward-facing, required by `gatherContinuationInputs`
        *   `[ ]`   `HeaderContext` from `dialectic-service/dialectic.interface.ts` — type, domain layer, inward-facing
        *   `[ ]`   `FileType` from `_shared/types/file_manager.types.ts` — type, domain layer, inward-facing
        *   `[ ]`   `IFileManager` from `_shared/types/file_manager.types.ts` — interface, app layer, inward-facing
        *   `[ ]`   Confirm no reverse dependency is introduced
    *   `[ ]`   `context_slice`
        *   `[ ]`   `GatherContinuationInputsFn` — the function that walks the contribution chain and returns `Messages[]`
        *   `[ ]`   `downloadFromStorage` — needed to pass to `gatherContinuationInputs` as its download dependency
        *   `[ ]`   Injection shape: both injected via `AssembleContinuationPromptDeps` interface (interface only, never concrete)
        *   `[ ]`   No concrete imports from higher or lateral layers
    *   `[ ]`   interface/`prompt-assembler.interface.ts`
        *   `[ ]`   Extend `AssembleContinuationPromptDeps` to include `gatherContinuationInputs: GatherContinuationInputsFn`
        *   `[ ]`   Extend `AssembleContinuationPromptDeps` to include `downloadFromStorage` with the signature required by `gatherContinuationInputs`
    *   `[ ]`   unit/`assembleContinuationPrompt.test.ts`
        *   `[ ]`   Update all existing test deps constructions to include `gatherContinuationInputs` and `downloadFromStorage` fields (compilation will fail without this)
        *   `[ ]`   Test: When continuation has multiple prior fragments in chain, all fragments are included in prompt content in order
        *   `[ ]`   Test: When continuation has a single prior fragment (first continuation), that fragment is included in prompt content
        *   `[ ]`   Test: `gatherContinuationInputs` is called with the root contribution ID from the chain (not just `target_contribution_id`)
        *   `[ ]`   Test: Header context from `inputs.header_context_id` is still fetched and prepended when available
        *   `[ ]`   Test: Prompt saved to storage includes the assembled multi-fragment content
        *   `[ ]`   Test: Error when `gatherContinuationInputs` fails to retrieve chain propagates correctly
    *   `[ ]`   `construction`
        *   `[ ]`   `assembleContinuationPrompt` is a standalone async function, no factory
        *   `[ ]`   Prohibited: calling `assembleContinuationPrompt` without providing `gatherContinuationInputs` in deps
        *   `[ ]`   Object completeness: `AssembleContinuationPromptDeps` must have all fields populated at the call boundary
    *   `[ ]`   `assembleContinuationPrompt.ts`
        *   `[ ]`   Replace the single-contribution fetch (current lines 128-165) with a call to `deps.gatherContinuationInputs` that walks the full chain from the root contribution
        *   `[ ]`   To find the root contribution: walk backwards from `target_contribution_id` via `target_contribution_id` links until reaching a contribution with no `target_contribution_id` (the root)
        *   `[ ]`   Pass the root contribution ID to `gatherContinuationInputs` which returns ordered `Messages[]` with all prior fragments
        *   `[ ]`   Build the prompt from: optional header context `system_materials` + all prior fragment messages (the assembled chain content)
        *   `[ ]`   Preserve: header context fetch from `inputs.header_context_id` (lines 52-115) — this is upstream context, not the thing being generated
        *   `[ ]`   Preserve: prompt file upload to storage (lines 191-219)
    *   `[ ]`   `directionality`
        *   `[ ]`   Application layer
        *   `[ ]`   All dependencies are inward-facing (interfaces, types, injected functions)
        *   `[ ]`   Provides outward-facing: consumed by `PromptAssembler.assemble` which is consumed by `processSimpleJob`
    *   `[ ]`   `requirements`
        *   `[ ]`   On each continuation, the model receives the complete accumulated output from all prior turns
        *   `[ ]`   The model can coherently continue or resolve incomplete/malformed JSON because it sees the full context
        *   `[ ]`   Existing non-continuation prompt assembly paths are unaffected

*   `[ ]`   _shared/prompt-assembler/`prompt-assembler.ts` **Wire gatherContinuationInputs into assembleContinuationPrompt call site**
    *   `[ ]`   `objective`
        *   `[ ]`   The `PromptAssembler` class must pass the `gatherContinuationInputs` dependency and `downloadFromStorage` to `assembleContinuationPrompt` when calling it
    *   `[ ]`   `role`
        *   `[ ]`   Application service — facade that dispatches to the correct prompt assembly strategy
    *   `[ ]`   `module`
        *   `[ ]`   The `assemble` method's continuation branch and the `assembleContinuationPrompt` method wrapper
    *   `[ ]`   `deps`
        *   `[ ]`   `GatherContinuationInputsFn` from `gatherContinuationInputs.ts` — already wired as `this.gatherContinuationInputsFn` in constructor (line 74)
        *   `[ ]`   `downloadFromStorage` — already wired as `this.downloadFromStorageFn` in constructor (line 66)
        *   `[ ]`   No new dependencies introduced; both are already available on the class instance
    *   `[ ]`   `context_slice`
        *   `[ ]`   `this.gatherContinuationInputsFn` — already stored on class from constructor
        *   `[ ]`   `this.downloadFromStorageFn` — already stored on class from constructor
        *   `[ ]`   No new injection shapes required
    *   `[ ]`   unit/`prompt-assembler.test.ts`
        *   `[ ]`   Update existing deps construction at lines 508-516 to include `gatherContinuationInputs` and `downloadFromStorage` fields (compilation will fail without this)
        *   `[ ]`   Test: When dispatching to continuation path, `gatherContinuationInputs` and `downloadFromStorage` are passed in the deps object
    *   `[ ]`   `construction`
        *   `[ ]`   No new constructors — `PromptAssembler` constructor already accepts and stores `gatherContinuationInputsFn`
    *   `[ ]`   `prompt-assembler.ts`
        *   `[ ]`   In the `assemble` method's continuation branch (line 88-97), add `gatherContinuationInputs: this.gatherContinuationInputsFn` and `downloadFromStorage: this.downloadFromStorageFn` to the deps object passed to `this.assembleContinuationPrompt`
    *   `[ ]`   `directionality`
        *   `[ ]`   Application layer
        *   `[ ]`   All dependencies are inward-facing (already wired)
        *   `[ ]`   Provides outward-facing: `assemble` consumed by `processSimpleJob`
    *   `[ ]`   integration/`prompt_assembler.integration.test.ts`
        *   `[ ]`   Update existing deps construction at lines 745-753 to include `gatherContinuationInputs` and `downloadFromStorage` fields (compilation will fail without this)
        *   `[ ]`   `gatherContinuationInputs` must be provided as the real function or an appropriate mock/spy matching `GatherContinuationInputsFn`
        *   `[ ]`   `downloadFromStorage` must be provided matching the signature `(bucket: string, path: string) => Promise<DownloadStorageResult>`
    *   `[ ]`   `requirements`
        *   `[ ]`   `assembleContinuationPrompt` receives the chain-walking dependency it needs
        *   `[ ]`   All existing prompt assembly paths (seed, planner, turn) are unaffected
        *   `[ ]`   All existing tests that construct `AssembleContinuationPromptDeps` compile and pass with the extended interface
    *   `[ ]`   **Commit** `fix(prompt-assembler): assemble full continuation chain for model context instead of single prior fragment`
        *   `[ ]`   `prompt-assembler.interface.ts` — extended `AssembleContinuationPromptDeps` with `gatherContinuationInputs` and `downloadFromStorage`
        *   `[ ]`   `assembleContinuationPrompt.ts` — replaced single-fragment fetch with full chain assembly via `gatherContinuationInputs`
        *   `[ ]`   `assembleContinuationPrompt.test.ts` — updated existing deps constructions and added tests for multi-fragment chain assembly, root resolution, and error propagation
        *   `[ ]`   `prompt-assembler.ts` — wired `gatherContinuationInputs` and `downloadFromStorage` into continuation dispatch
        *   `[ ]`   `prompt-assembler.test.ts` — updated existing deps constructions and added test for dependency passthrough
        *   `[ ]`   `prompt_assembler.integration.test.ts` — updated deps construction to include new required fields



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

## Swap default model to Gemini Flash

## Let users pick model on "Start Project" page 

## Fix continuation naming to use continuation naming instead of iterations 

## 