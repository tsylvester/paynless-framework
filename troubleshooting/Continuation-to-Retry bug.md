# Continuation-to-Retry Bug: Root Cause Analysis & Fix Plan

## Incident Summary

A user's project failed during the `synthesis` stage. Three EXECUTE jobs hit `retry_loop_failed` after exhausting continuation chains (4-5 successful continuations followed by terminal failure). The error details recorded only a generic `"Retry limit exceeded"` message with no underlying API error preserved. Troubleshooting files show progressively degrading model output (9KB → 3.5KB → 103 bytes → 1 byte) across continuations.

## Root Cause: Two Bugs + One Systemic Fix

### Bug 1: DB Trigger Overwrites Error Details

The `invoke_worker_on_status_change` trigger fires when `retryJob.ts` sets status to `retrying`. If `attempt_count >= max_retries + 1`, the trigger **overwrites** `error_details` with a generic message, destroying the actual `failedAttempts` array that `retryJob.ts` had already stored.

**The race:**
1. `retryJob.ts` sets `error_details: { failedAttempts: [...] }` in the same UPDATE that sets `status: 'retrying'`
2. The trigger fires on that UPDATE
3. The trigger replaces `error_details` entirely with `jsonb_build_object('finalError', 'Retry limit exceeded', ...)`
4. The actual API error messages are lost

**Evidence:** The failing jobs (e.g., `489e239e`, `7e8110fd`, `ee4cc449`) all show `error_details` containing only `{"message": "Job exceeded maximum retry limit...", "finalError": "Retry limit exceeded", ...}` with no trace of what actually went wrong.

**Trigger location:** `supabase/migrations/20260109165706_state_machine_fix.sql` lines 64-76

### Bug 2: Continuation Limit Hit Doesn't Trigger Final Document Assembly

When `continueJob.ts` line 60 evaluates `(continuation_count) < 5` as `false`, it returns `{ enqueued: false }` with no error and no distinguishing reason. Back in `executeModelCallAndSave.ts`, the caller only checks for `continueResult.error` — it doesn't handle the `enqueued: false` + no error case.

**The real problem:** The existing document assembly path (`assembleAndSaveFinalDocument` in `file_manager.ts`) already handles merging all continuation fragments into a final document. But it only runs when `isFinalChunk === true`, which requires `finish_reason === 'stop'`. When continuation limit is hit, the model's last response still has `finish_reason === 'length'` — so `isFinalChunk` is `false` and the existing assembly **never runs**. The fragments are left unassembled.

**Existing assembly flow that should be reused:**
1. `assembleAndSaveFinalDocument` (in `file_manager.ts` lines 684-943) already walks the `target_contribution_id` chain, downloads all fragments, concatenates and sanitizes them (Phase 2), falls back to per-chunk parse + deep merge (Phase 3), uploads the final assembled JSON, and updates `is_latest_edit` flags.
2. `gatherContinuationInputs` (in `prompt-assembler/gatherContinuationInputs.ts`) already queries all related chunks via `document_relationships` and sorts them.
3. `assembleContinuationPrompt` (in `prompt-assembler/assembleContinuationPrompt.ts`) already walks the `target_contribution_id` chain backward to find root.

All the fragment assembly machinery exists. The fix is to **also treat continuation-limit-reached as a final chunk** so the existing assembly path fires.

### Bug 3: Continuation Prompt Assembly Destroys Conversation Structure and Degrades Model Output

The continuation prompt assembly pipeline has two compounding defects: `gatherContinuationInputs` builds an N-message alternating conversation (correct structure, wrong format for this use case), then `assembleContinuationPrompt` strips all role information and flattens everything into a single string that becomes one undifferentiated user message. The model receives its own prior outputs, "Please continue." directives, and the original instructions as one blob with no way to distinguish any of them.

Additionally, the system has two undetected continuation paths: unexpected stream termination (network errors, model crashes) that produces truncated content which the sanitizer closes structurally but nobody triggers a continuation for, and missing-expected-keys where the model completes normally but omits required schema keys.

**Evidence:** The troubleshooting files in `troubleshooting/3_synthesis/` show identical continuation prompts across all 4 continuations — each one is the same system prompt followed by a growing chain of truncated JSON fragments interleaved with "Please continue." text, all in a single user message. The raw responses degrade: 9.2KB → 3.5KB → 103 bytes → 1 byte.

---

## Fix 1: DB Trigger — Preserve Error Details (Append, Don't Overwrite)

### Problem

`invoke_worker_on_status_change()` in the retry-exhausted branch (lines 64-76 of `20260109165706_state_machine_fix.sql`) replaces `error_details` with a generic object, destroying the actual error information from `retryJob.ts`.

### Solution

New migration: `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` — change the retry-exhausted branch to **merge** the existing `error_details` into the new object instead of replacing it.

Use `COALESCE(NEW.error_details, '{}'::jsonb) || jsonb_build_object(...)` or a similar merge strategy to preserve the `failedAttempts` array from `retryJob.ts` while adding the `finalError`/`message`/`attempt_count`/`max_retries` metadata.

### Files to Touch

| File | Change | Tests |
|---|---|---|
| **New migration** `supabase/migrations/YYYYMMDDHHMMSS_fix_retry_error_preserve.sql` | `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` — merge instead of overwrite `error_details` in the retry-exhausted branch | SQL-level / integration testing. No direct Deno unit test — trigger behavior validated through integration. |

### Files Confirmed No Change Needed

| File | Reason |
|---|---|
| `supabase/functions/dialectic-worker/retryJob.ts` | Already correctly stores `failedAttempts` in `error_details`. The fix is entirely in the trigger. |
| `supabase/functions/dialectic-worker/retryJob.test.ts` | Existing tests remain valid. |
| `supabase/functions/dialectic-worker/processSimpleJob.ts` | Lines 535-543 set `status: 'retry_loop_failed'` directly (not `retrying`), so the trigger's retry-checking branch doesn't fire for that path. No conflict. |
| `supabase/functions/dialectic-worker/processSimpleJob.test.ts` | No changes needed. |

### Verification

After the migration, retry-exhausted jobs should have `error_details` containing **both** the `failedAttempts` array from `retryJob.ts` **and** the `finalError`/`message`/`attempt_count`/`max_retries` metadata from the trigger.

---

## Fix 2: Treat Continuation Limit as Final Chunk (Trigger Existing Assembly)

### Problem

When `continueJob.ts` hits the continuation cap (`continuation_count >= 5`), it silently returns `{ enqueued: false }`. The caller doesn't distinguish this from a normal completion. Critically, the existing `assembleAndSaveFinalDocument` path in `file_manager.ts` only runs when `isFinalChunk === true` (i.e., `finish_reason === 'stop'`). Since the model's last response has `finish_reason === 'length'`, the assembly never fires and fragments are left unmerged.

### Solution

Three coordinated changes — no new document types, reuses existing assembly:

1. **`continueJob.ts`** returns a distinguishable result when continuation cap is hit, so the caller knows *why* enqueue was skipped
2. **`executeModelCallAndSave.ts`** treats continuation-limit-reached the same as `isFinalChunk` for the purpose of triggering the existing `assembleAndSaveFinalDocument` path
3. **`assembleAndSaveFinalDocument` in `file_manager.ts`** gains an optional `expectedSchema?: ContextForDocument` parameter so that when called for a continuation-limit case, it can walk `content_to_include` to fill in any keys the model never reached with a human-readable placeholder

#### Why schema completion is needed

The existing assembly (Phase 2 concatenate or Phase 3 deep-merge) produces a merged object from all fragments the model *did* generate. But when continuations ran out, the model never reached some keys. The merged object will be missing those keys entirely, or they'll still be empty strings/arrays from the initial schema. Downstream consumers (renderers, future synthesis steps, the UI) expect a complete object with all keys present and parsable.

The `context_for_documents` field in the job payload already defines the full expected shape for each document — every key, with empty values as placeholders. After assembly, we walk the merged object against this schema template. Any key that is missing or still has an empty value (`""`, `[]`) gets replaced with an intelligible placeholder like `"[Continuation limit reached — value not generated]"`. This produces valid, complete JSON that downstream consumers can parse without error, while clearly marking which sections the model did not complete.

#### How it fits into existing code

In `assembleAndSaveFinalDocument` (file_manager.ts), the merged object is fully available at line 846 (`const finalContent = JSON.stringify(mergedObject)`) before upload at line 906. The schema completion step goes between merge and upload:

1. If `expectedSchema` was provided, walk `mergedObject` against `expectedSchema.content_to_include` (typed as `ContentToInclude`)
2. For each key in `content_to_include` that is missing or empty in `mergedObject`, insert the placeholder value
3. Then stringify and upload as normal

This is a small addition to an existing function, not a new function or new file.

### Files to Touch

| # | File | Change | Tests |
|---|---|---|---|
| 1 | `supabase/functions/dialectic-service/dialectic.interface.ts` | Add `reason?: string` to `IContinueJobResult` (line 1915-1918). Add `"continuation_limit_reached"` to canonical `ModelProcessingResult.status` union (line 1221). Delete duplicate `ModelProcessingResult` at line 1903-1909. | Move `isModelProcessingResult` and `isJobResultsWithModelProcessing` guards to new `type_guards.modelProcessingResult.ts`; update status validation. |
| 2 | `supabase/functions/dialectic-worker/continueJob.ts` | Line 62: change `return { enqueued: false }` to `return { enqueued: false, reason: 'continuation_limit_reached' }` when `!underMaxContinuations`. Keep the existing `return { enqueued: false }` for the `!continueUntilComplete` case. | — |
| 3 | `supabase/functions/dialectic-worker/continueJob.test.ts` | Update the existing continuation limit test (lines 397-408) to assert `reason: 'continuation_limit_reached'`. Add/update test for the `continueUntilComplete: false` case to confirm no `reason` is returned. | — |
| 4 | `supabase/functions/_shared/services/file_manager.ts` | Add an optional second parameter `expectedSchema?: ContextForDocument` to `assembleAndSaveFinalDocument`. Between the merge (line 846) and upload (line 906): if `expectedSchema` is provided, walk `mergedObject` against `expectedSchema.content_to_include` (typed as `ContentToInclude`). For every key in the schema where `mergedObject` has a missing key, empty string (`""`), or empty array (`[]`), replace the value with `"[Continuation limit reached — value not generated]"`. Recurse for nested `ContentToInclude` objects. | — |
| 5 | `supabase/functions/_shared/services/file_manager.assemble.test.ts` | Add test: when `expectedSchema` is provided and merged object is missing keys, those keys are filled with the placeholder. Add test: when `expectedSchema` is provided and merged object already has values, those values are preserved. Add test: when `expectedSchema` is not provided (normal path), behavior is unchanged. | — |
| 6 | `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` | After line 1838, when `continueResult.enqueued === false && continueResult.reason === 'continuation_limit_reached'`: (a) log a warning; (b) set `modelProcessingResult.status` to `'continuation_limit_reached'`; (c) **treat this as a final chunk** — call the same `assembleAndSaveFinalDocument` that already exists for `isFinalChunk` (around line 1888), passing the matching `ContextForDocument` from `job.payload.context_for_documents` as the `expectedSchema` parameter. | — |
| 7 | `supabase/functions/dialectic-worker/executeModelCallAndSave.continuationCount.test.ts` | Add test that when continuation limit is hit, result status is `continuation_limit_reached`, `assembleAndSaveFinalDocument` is called, and the `ContextForDocument` parameter is passed. | — |

### Files Confirmed No Change Needed

| File | Reason |
|---|---|
| `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.ts` | Not involved in the fix — this is for building prompts during continuation, not for final assembly. |
| `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.ts` | Same — prompt-side, not assembly-side. |
| `supabase/functions/dialectic-worker/retryJob.ts` / `.test.ts` | Not involved in continuation logic. |
| `supabase/functions/dialectic-worker/processSimpleJob.ts` / `.test.ts` | The catch block retry path is independent of continuation handling. |
| Child-completion trigger (`20260306175850_fix_stage_auto_advance.sql`) | Already checks for `retry_loop_failed` in terminal status list. The job row will show `completed` — `continuation_limit_reached` is only in the `ModelProcessingResult`, not the job status. |

---

## Fix 3: Continuation Prompt Assembly — Correct Structure, Per-Chunk Assembly, Gap Detection

### Problem

Three interrelated defects cause continuation prompts to degrade across turns and leave two continuation paths completely unhandled.

#### Defect 3a: Conversation structure destroyed (causes the observed degradation)

`gatherContinuationInputs.ts` correctly builds a multi-turn message array with proper roles:

```
user:      seed prompt
assistant: chunk 0 content
user:      "Please continue."
assistant: chunk 1 content
user:      "Please continue."
assistant: chunk 2 content
```

Then `assembleContinuationPrompt.ts` (lines 157-163) strips all roles and joins every message's content with `\n\n` into a single flat string:

```typescript
for (const msg of messages) {
  if (typeof msg.content === "string") {
    promptParts.push(msg.content);
  }
}
const finalPrompt = promptParts.join("\n\n");
```

This flat string becomes `currentUserPrompt` in `processSimpleJob.ts` (line 299), which flows into `ChatApiRequest.message` — a single user message. Meanwhile `conversationHistory` is initialized as an empty array (line 126) and never populated for continuations, so `ChatApiRequest.messages` is empty.

**Result:** The model receives one giant user message containing the original instructions, multiple truncated JSON fragments, and multiple "Please continue." strings, all as undifferentiated text. No assistant turns. No conversation structure. The model cannot distinguish its own prior output from new instructions.

**Why it degrades progressively:** Each continuation appends another fragment + "Please continue." to the same user message. The signal-to-noise ratio drops with each turn. By continuation 3-4, the model produces near-empty output because it cannot parse the increasingly incoherent prompt.

**What the model should receive instead:**

```
user:      seed prompt (original instructions)
assistant: all prior fragments assembled into one coherent partial document
user:      context-aware continuation instruction
```

Three messages. Always exactly three, regardless of continuation number. The assistant turn contains everything the model has produced so far, assembled into a single coherent object. The model sees one clean partial output and one clear instruction to continue from where it ends.

#### Defect 3b: Unexpected stream termination not detected as continuation trigger

When a stream terminates unexpectedly (network error, model crash, timeout) but partial content was received:

1. `aiResponse.content` is non-null (partial content exists)
2. `finish_reason` may be `null`, `unknown`, or absent — NOT one of the explicit continue reasons
3. `shouldContinue` evaluates to `false` (line 1102 of `executeModelCallAndSave.ts`)
4. `isIntermediateChunk` is `false` — the response goes through full sanitization
5. The sanitizer's structural fix logic adds missing `}`/`]` to make the truncated JSON parseable
6. `sanitizationResult.wasStructurallyFixed` is set to `true` — but this flag is only logged, never acted upon
7. The structurally-fixed JSON is treated as a complete, final response

**Result:** Truncated responses from stream failures are silently accepted as complete. The stored content is parseable but missing everything after the truncation point. No continuation is triggered.

**The signal exists but is unused:** `wasStructurallyFixed === true` means "this JSON was broken and I repaired it by closing unclosed structures." When `continueUntilComplete` is set, this should trigger continuation — the response was not complete, the sanitizer just made it parseable.

#### Defect 3c: Missing expected keys not detected

When a model completes normally (`finish_reason === 'stop'`), produces valid JSON, sets no continuation flags, but omits keys that `context_for_documents` in the job payload defines as required:

1. `shouldContinue` is `false` (finish_reason is 'stop')
2. Content-level flag check finds no flags (lines 1167-1176)
3. The response is accepted as complete
4. Missing keys go entirely undetected

**Result:** The model thinks it's done, but the document is semantically incomplete. Downstream consumers (renderers, future synthesis steps) receive an object missing expected fields.

**The expected schema is already available:** `context_for_documents` in the job payload defines every key for each document. After parse, the system could compare the parsed object against this schema and trigger continuation for missing keys.

#### Defect 3d: Per-chunk assembly doesn't account for mixed chunk types

A continuation chain may contain chunks from any of the four continuation paths, in any order:

| Path | How Detected | What's Stored |
|------|-------------|---------------|
| **1. Provider-level explicit** | `finish_reason` ∈ {`length`, `max_tokens`, `content_truncated`, `unknown`} | Raw truncated text (sanitization skipped, line 1109-1110) |
| **2. Content-level explicit** | `finish_reason` = `stop`, but JSON body has `continuation_needed`/`stop_reason`/`resume_cursor` | Sanitized valid JSON with continuation metadata |
| **3. Unexpected termination** | Stream interrupted; `wasStructurallyFixed === true` after sanitization | Sanitized, structurally-closed JSON (parseable but content truncated) |
| **4. Missing expected keys** | `finish_reason` = `stop`, valid JSON, no flags, but keys missing vs `context_for_documents` | Sanitized valid JSON (structurally complete, semantically incomplete) |

Any chunk in a chain could be any of these types. The assembly function must handle each chunk according to its own type:

- **Path 1 chunks** (raw text): adjacent raw chunks are parts of one continuous stream — concatenate them, then sanitize the concatenated result to produce a parseable object
- **Path 2 chunks** (valid JSON with flags): parse, strip continuation metadata (`continuation_needed`, `stop_reason`, `resume_cursor`), merge
- **Path 3 chunks** (structurally-fixed JSON): parse, merge (the artificially-added closing braces are part of the stored content)
- **Path 4 chunks** (complete but missing keys): parse, merge

Mixed chains (e.g., raw fragments followed by a valid JSON chunk) require grouping adjacent raw fragments, sanitizing each group into a parseable object, then merging all parsed objects in order.

The existing `assembleAndSaveFinalDocument` in `file_manager.ts` has a two-phase approach (Phase 2: concatenate all → sanitize → parse; Phase 3: per-chunk sanitize → parse → deep merge) that handles all-raw or all-parseable chains but not mixed chains.

### Solution

Four coordinated changes addressing all four defects, plus a shared assembly utility that eliminates duplication between continuation prompt assembly and final document assembly.

#### 3.1: Shared chunk assembly utility (addresses Defect 3d)

A new shared function that both `gatherContinuationInputs` and `assembleAndSaveFinalDocument` use. Given an ordered array of chunk contents, it:

1. **Classifies each chunk**: attempt `JSON.parse()`. Failure → raw fragment (Path 1). Success → parseable (Paths 2/3/4).
2. **Groups adjacent raw fragments**: consecutive unparseable chunks are concatenated into a single string, then sanitized into a parseable object.
3. **Strips continuation metadata** from parseable chunks: removes `continuation_needed`, `stop_reason`, `resume_cursor` keys (these are control signals, not document content).
4. **Deep-merges all parsed objects** in order, using the existing `mergeObjects` logic (string concatenation for `content` keys, recursive merge for nested objects, last-write-wins for primitives).
5. Returns the single merged object.

This replaces Phase 2/3 in `assembleAndSaveFinalDocument` and provides the assembly logic for `gatherContinuationInputs`.

#### 3.2: Fix `gatherContinuationInputs` to return assembled 3-message structure (addresses Defect 3a)

Instead of returning N alternating user/assistant messages, `gatherContinuationInputs` returns exactly 3 messages:

1. `user`: the seed prompt (already fetched from `dialectic_project_resources`)
2. `assistant`: `JSON.stringify(assembledObject)` — the single assembled document from the shared utility
3. `user`: a context-aware continuation instruction

The continuation instruction is constructed based on the **last chunk's** state:

- **If the last chunk had explicit content-level flags** (Path 2): extract `resume_cursor` from the last chunk's JSON. Instruction includes the cursor: *"Continue the JSON object. Resume from `resume_cursor: { document_key: '...', section_id: '...' }`. Do not repeat any content already present."*
- **If the last chunk was a raw fragment or structurally-fixed** (Paths 1/3): the assembled object ends with incomplete content. Identify the last key in the assembled object that has a truncated or empty value. Instruction: *"Continue the JSON object from exactly where it ends. Do not restart the object or repeat prior content."*
- **If the last chunk was missing expected keys** (Path 4): compare assembled object against expected schema (from `context_for_documents`, passed as a parameter). List the missing keys. Instruction: *"The following keys were not completed: [`key_a`, `key_b`]. Generate content for these keys, maintaining the same JSON structure. Do not repeat keys already present."*

#### 3.3: Fix `assembleContinuationPrompt` to preserve message structure (addresses Defect 3a)

Stop flattening messages into a single string. Propagate the structured 3-message array through `AssembledPrompt` so downstream consumers can route them into `conversationHistory` + `currentUserPrompt`:

- Add optional `messages?: Messages[]` field to `AssembledPrompt` (in `prompt-assembler.interface.ts`)
- When `messages` is present (continuation path), `processSimpleJob.ts` populates `conversationHistory` from the first two messages (seed prompt + assembled assistant content) and sets `currentUserPrompt` to the third (continuation instruction)
- When `messages` is absent (non-continuation path), the existing `currentUserPrompt`-only flow works unchanged
- `executeModelCallAndSave` needs **no changes** — it already correctly maps `conversationHistory` → `ChatApiRequest.messages` and `currentUserPrompt` → `ChatApiRequest.message`

#### 3.4: Detect structurally-fixed responses as continuation triggers (addresses Defect 3b)

In `executeModelCallAndSave.ts`, after sanitization succeeds with `wasStructurallyFixed === true`: if `continueUntilComplete` is set, treat this as `shouldContinue = true`. The response was truncated and the sanitizer repaired it — it is not a complete response.

#### 3.5: Detect missing expected keys as continuation trigger (addresses Defect 3c)

In `executeModelCallAndSave.ts`, after successful parse with `finish_reason === 'stop'` and no content-level continuation flags: compare the parsed object's keys against `context_for_documents` from the job payload. If required keys are missing, set `shouldContinue = true`.

### Files to Touch

| # | File | Change | Tests |
|---|---|---|---|
| 1 | **New file** `supabase/functions/_shared/utils/assembleChunks.ts` | Shared chunk assembly utility: classify chunks, group raw fragments, strip continuation metadata, deep-merge. Replaces Phase 2/3 logic in `assembleAndSaveFinalDocument`. | New test file `assembleChunks.test.ts`: test raw-only chains, parseable-only chains, mixed chains, continuation metadata stripping, empty input. |
| 2 | `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.ts` | Use shared assembly to produce one assembled object. Accept optional `expectedSchema?: ContextForDocument` parameter for missing-key detection. Construct context-aware continuation instruction based on last chunk type. Return 3 messages instead of N. | Update existing tests in `gatherContinuationInputs.test.ts`: verify 3-message return structure, verify assembled assistant content, verify continuation instruction varies by chunk type. |
| 2b | `supabase/functions/_shared/prompt-assembler/prompt-assembler.ts` | Update facade: replace `GatherContinuationInputsFn` with `GatherContinuationInputsSignature` in imports, stored field type, and constructor parameter. | Update tests in `prompt-assembler.test.ts`: verify facade accepts and passes new signature. |
| 3 | `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.ts` | Remove the flatten loop (lines 157-163). Set `messages` on the returned `AssembledPrompt` from the structured array. Keep `promptContent` as the final user message (continuation instruction) for backward compatibility with file upload. | Update existing tests in `assembleContinuationPrompt.test.ts`: verify messages are propagated, not flattened. |
| 4 | `supabase/functions/_shared/prompt-assembler/prompt-assembler.interface.ts` | Add optional `messages?: Messages[]` field to `AssembledPrompt`. Update `AssembleContinuationPromptDeps.gatherContinuationInputs` type to `GatherContinuationInputsSignature`. | Type-level change, no runtime tests needed. |
| 5 | `supabase/functions/dialectic-worker/processSimpleJob.ts` | When `assembled.messages` is present: populate `conversationHistory` from the first two messages, set `currentUserPrompt` to the third. When absent: existing behavior unchanged. | Add test case in `processSimpleJob.test.ts` for continuation path populating `conversationHistory`. |
| 6 | `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` | (a) After sanitization: if `wasStructurallyFixed === true && continueUntilComplete`, set `shouldContinue = true`. (b) After successful parse with `finish_reason === 'stop'` and no content-level flags: compare parsed keys against matching `ContextForDocument` from `context_for_documents`; if missing, set `shouldContinue = true`. | Add tests in `executeModelCallAndSave.continue.test.ts` for both new continuation triggers. |
| 7 | `supabase/functions/_shared/services/file_manager.ts` | Refactor `assembleAndSaveFinalDocument` Phase 2/3 (lines 774-840) to use shared assembly utility from #1. | Existing tests in `file_manager.assemble.test.ts` must continue to pass (behavior unchanged, implementation refactored). |

### Files Confirmed No Change Needed

| File | Reason |
|---|---|
| `supabase/functions/dialectic-worker/continueJob.ts` | Not involved — continuation detection changes are in `executeModelCallAndSave.ts`. `continueJob` is the enqueue mechanism, not the detection mechanism. |
| `supabase/functions/dialectic-worker/retryJob.ts` / `.test.ts` | Not involved in continuation logic. |
| `supabase/functions/dialectic-service/callModel.ts` | Passes through `UnifiedAIResponse` unchanged. |
| `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` (message routing) | Already correctly maps `conversationHistory` → `ChatApiRequest.messages` and `currentUserPrompt` → `ChatApiRequest.message`. No change needed for message routing — only for continuation detection (3.4, 3.5). |
| `supabase/functions/_shared/utils/jsonSanitizer.ts` | Already returns `wasStructurallyFixed` flag correctly. No change needed — the fix is in the caller that ignores it. |

### Verification

1. **Defect 3a (prompt structure):** A continuation prompt captured to storage should show exactly 3 messages in the conversation: user (seed), assistant (assembled object), user (continuation instruction). The model's response should maintain or improve quality across continuations, not degrade.
2. **Defect 3b (unexpected termination):** When a response is structurally fixed by the sanitizer and `continueUntilComplete` is set, a continuation job should be enqueued. The partial content should be saved and included in the next continuation's assembled assistant message.
3. **Defect 3c (missing keys):** When a model returns valid JSON missing keys defined in `context_for_documents`, a continuation job should be enqueued. The continuation instruction should list the specific missing keys.
4. **Defect 3d (mixed chains):** A chain containing both raw fragments and valid JSON chunks should produce a correctly merged assembled object with no lost content.

---

## Dependency Order for Implementation

```
Fix 1 (migration) has no code dependencies — can be done first and independently.

Fix 2 dependency chain:
  dialectic.interface.ts (add reason to IContinueJobResult, add status to canonical
    ModelProcessingResult, delete duplicate, move guards to type_guards.modelProcessingResult.ts)
    → continueJob.ts + continueJob.test.ts (return reason when cap hit)
      → file_manager.ts + file_manager.assemble.test.ts (add expectedSchema?: ContextForDocument + fill logic)
        → executeModelCallAndSave.ts + executeModelCallAndSave.continuationCount.test.ts
          (handle reason, call assembleAndSaveFinalDocument with ContextForDocument)

Fix 3 dependency chain:
  assembleChunks/assembleChunks.ts + assembleChunks.test.ts (shared utility — no dependencies)
    → gatherContinuationInputs.ts + gatherContinuationInputs.test.ts (use shared utility, return 3 messages)
      → prompt-assembler.ts + prompt-assembler.test.ts (facade: update GatherContinuationInputsFn → GatherContinuationInputsSignature)
        → prompt-assembler.interface.ts (add messages to AssembledPrompt, update AssembleContinuationPromptDeps)
          → assembleContinuationPrompt.ts + assembleContinuationPrompt.test.ts (stop flattening)
            → processSimpleJob.ts + processSimpleJob.test.ts (route messages to conversationHistory)
    → file_manager.ts + file_manager.assembleChunks.integration.test.ts
        (refactor Phase 2/3 to use shared utility + integration proof — can parallel with above)
    → executeModelCallAndSave.ts + executeModelCallAndSave.continue.test.ts
        + continuation_prompt_assembly.integration.test.ts
        (3.4: wasStructurallyFixed trigger, 3.5: missing-keys trigger, full pipeline integration proof)

Fix 3 can begin in parallel with Fix 2. The shared assembly utility (assembleChunks/)
has no dependencies on Fix 2 and is the foundation for the rest of Fix 3.

Fix 3.4 and 3.5 (new continuation triggers in executeModelCallAndSave) are independent
of the prompt assembly chain (3.1-3.3) and can be developed in parallel.

All expectedSchema parameters use ContextForDocument (the explicit application type),
not Record<string, unknown>. No type-to-primitive conversion is performed anywhere.
```

---

## Consolidated File List (Dependency Order)

Every file that must be touched across all three fixes, listed once, in implementation order. Files with no dependency on prior files are grouped together. Test files are listed alongside their source files.

| # | File | Fix | Changes |
|---|------|-----|---------|
| 1 | **New migration** `supabase/migrations/YYYYMMDDHHMMSS_fix_retry_error_preserve.sql` | 1 | `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` — merge instead of overwrite `error_details` in the retry-exhausted branch. |
| 2 | **New file** `supabase/functions/_shared/utils/assembleChunks/assembleChunks.ts` | 3.1 | Shared chunk assembly utility: classify chunks (raw vs parseable), group adjacent raw fragments, strip continuation metadata, deep-merge all parsed objects. All support files (interface, guards, tests, mock, provides) live under `_shared/utils/assembleChunks/`. |
| 3 | **New file** `supabase/functions/_shared/utils/assembleChunks/assembleChunks.test.ts` | 3.1 | Tests: raw-only chains, parseable-only chains, mixed chains, continuation metadata stripping, empty input. |
| 4 | `supabase/functions/dialectic-service/dialectic.interface.ts` | 2 | Add `reason?: string` to `IContinueJobResult`. Add `"continuation_limit_reached"` to canonical `ModelProcessingResult.status` union (line 1219). Delete duplicate `ModelProcessingResult` at line 1903. |
| 4b | **New file** `supabase/functions/_shared/utils/type-guards/type_guards.modelProcessingResult.ts` | 2 | Move `isModelProcessingResult` and `isJobResultsWithModelProcessing` from `type_guards.dialectic.ts`. Add `isModelProcessingResultStatus`. Update status validation to include `"continuation_limit_reached"`. |
| 4c | **New file** `supabase/functions/_shared/utils/type-guards/type_guards.modelProcessingResult.test.ts` | 2 | Move existing tests from `type_guards.dialectic.test.ts`. Add tests for new status value. |
| 4d | `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.ts` | 2 | Remove `isModelProcessingResult` (lines 1341-1379) and `isJobResultsWithModelProcessing` (lines 1329-1339). |
| 4e | `supabase/functions/_shared/utils/type-guards/type_guards.dialectic.test.ts` | 2 | Remove moved test blocks. |
| 4f | `supabase/functions/_shared/utils/type_guards.ts` | 2 | Update barrel re-export to import from `type_guards.modelProcessingResult.ts`. Add re-export of `isModelProcessingResultStatus`. |
| 5 | `supabase/functions/_shared/prompt-assembler/prompt-assembler.interface.ts` | 3.3 | Add optional `messages?: Messages[]` field to `AssembledPrompt`. Update `AssembleContinuationPromptDeps.gatherContinuationInputs` type to `GatherContinuationInputsSignature`. |
| 6 | `supabase/functions/dialectic-worker/continueJob.ts` | 2 | Return `{ enqueued: false, reason: 'continuation_limit_reached' }` when `!underMaxContinuations`. |
| 7 | `supabase/functions/dialectic-worker/continueJob.test.ts` | 2 | Assert `reason: 'continuation_limit_reached'` on cap-hit test. Add/update test for `continueUntilComplete: false` case. |
| 8 | `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.ts` | 3.2 | Use shared assembly utility. Accept optional `expectedSchema?: ContextForDocument` for missing-key detection. Construct context-aware continuation instruction. Return 3 messages instead of N. |
| 9 | `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.test.ts` | 3.2 | Verify 3-message return structure, assembled assistant content, continuation instruction varies by last-chunk type. |
| 9b | `supabase/functions/_shared/prompt-assembler/prompt-assembler.ts` | 3.2 | Update facade: replace `GatherContinuationInputsFn` with `GatherContinuationInputsSignature` in imports, stored field type, constructor parameter. |
| 9c | `supabase/functions/_shared/prompt-assembler/prompt-assembler.test.ts` | 3.2 | Verify facade accepts and passes new DI signature. |
| 10 | `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.ts` | 3.3 | Remove flatten loop (lines 157-163). Set `messages` on returned `AssembledPrompt`. Keep `promptContent` as final user message for file upload compatibility. |
| 11 | `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.test.ts` | 3.3 | Verify messages are propagated, not flattened. |
| 12 | `supabase/functions/_shared/services/file_manager.ts` | 2, 3.1 | (Fix 2) Add optional `expectedSchema?: ContextForDocument` parameter to `assembleAndSaveFinalDocument`; walk `content_to_include` to fill missing keys with placeholder between merge and upload. (Fix 3.1) Refactor Phase 2/3 (lines 774-840) to use shared assembly utility. |
| 13 | `supabase/functions/_shared/services/file_manager.assemble.test.ts` | 2, 3.1 | (Fix 2) Tests for `expectedSchema` fill logic using `ContextForDocument`. (Fix 3.1) Existing tests must continue to pass after Phase 2/3 refactor. |
| 14 | `supabase/functions/dialectic-worker/processSimpleJob.ts` | 3.3 | When `assembled.messages` is present: populate `conversationHistory` from first two messages, set `currentUserPrompt` to third. When absent: existing behavior unchanged. |
| 15 | `supabase/functions/dialectic-worker/processSimpleJob.test.ts` | 3.3 | Add test case for continuation path populating `conversationHistory`. |
| 16 | `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` | 2, 3.4, 3.5 | (Fix 2) Handle `continueResult.reason === 'continuation_limit_reached'`: call `assembleAndSaveFinalDocument` with matching `ContextForDocument`. (Fix 3.4) After sanitization: if `wasStructurallyFixed === true && continueUntilComplete`, set `shouldContinue = true`. (Fix 3.5) After parse with `finish_reason === 'stop'` and no content-level flags: compare parsed keys against matching `ContextForDocument` from `context_for_documents`; if missing, set `shouldContinue = true`. |
| 17 | `supabase/functions/dialectic-worker/executeModelCallAndSave.continuationCount.test.ts` | 2 | Test that continuation-limit-reached triggers `assembleAndSaveFinalDocument` with `ContextForDocument`. |
| 18 | `supabase/functions/dialectic-worker/executeModelCallAndSave.continue.test.ts` | 3.4, 3.5 | Tests for `wasStructurallyFixed` continuation trigger and missing-keys continuation trigger. |
| 19 | **New file** `supabase/integration_tests/services/file_manager.assembleChunks.integration.test.ts` | 3.1 | Integration test for Node 7: `assembleAndSaveFinalDocument` → real `assembleChunks` merge parity proof. Detailed in Node 7 integration section. |
| 20 | **New file** `supabase/integration_tests/services/continuation_prompt_assembly.integration.test.ts` | 3 | Integration test for Node 9: full continuation prompt pipeline proof. Detailed in Node 9 integration section. |

---

# Work Breakdown Structure

## Node 1

* `[✅]` [DB] `supabase/migrations/` **Fix retry-exhausted trigger to preserve error details**
  * `[✅]` `objective`
    * `[✅]` When the `invoke_worker_on_status_change` trigger detects retry exhaustion (`attempt_count >= max_retries + 1`), it must **merge** existing `error_details` (which contains the `failedAttempts` array written by `retryJob.ts`) with the trigger's metadata — not overwrite them
    * `[✅]` After the fix, retry-exhausted jobs must have `error_details` containing **both** the `failedAttempts` array **and** the `finalError`/`message`/`attempt_count`/`max_retries` metadata
    * `[✅]` No other branch of the trigger function is modified
  * `[✅]` `role`
    * `[✅]` Infrastructure — database trigger function governing job state transitions
  * `[✅]` `module`
    * `[✅]` Dialectic generation job state machine — retry exhaustion branch of `invoke_worker_on_status_change()`
  * `[✅]` `deps`
    * `[✅]` Source trigger: `supabase/migrations/20260109165706_state_machine_fix.sql` lines 64-76 — the existing `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` that this migration supersedes
    * `[✅]` Producer: `supabase/functions/dialectic-worker/retryJob.ts` — writes `error_details: { failedAttempts: [...] }` in the same UPDATE that sets `status: 'retrying'`; this is the data the trigger currently destroys
    * `[✅]` No reverse dependency introduced — the trigger reads `NEW.error_details` but does not call or import any Deno code
  * `[✅]` `context_slice`
    * `[✅]` The trigger reads `NEW.error_details` (jsonb), `v_attempt_count` (integer), and `v_max_retries` (integer) — all already available in the function body
    * `[✅]` No new columns, no new tables, no new function parameters
  * `[✅]` `migration`
    * `[✅]` New file: `supabase/migrations/YYYYMMDDHHMMSS_fix_retry_error_preserve.sql`
    * `[✅]` `CREATE OR REPLACE FUNCTION public.invoke_worker_on_status_change()` — copy the full existing function body, changing only the retry-exhausted branch (lines 64-76 equivalent)
    * `[✅]` Replace line 70 (`error_details = jsonb_build_object(...)`) with a merge: `error_details = COALESCE(NEW.error_details, '{}'::jsonb) || jsonb_build_object('finalError', 'Retry limit exceeded', 'attempt_count', v_attempt_count, 'max_retries', v_max_retries, 'message', format('Job exceeded maximum retry limit. Attempt count: %s, Max retries: %s', v_attempt_count, v_max_retries))`
    * `[✅]` The `||` operator appends the trigger's metadata keys to the existing jsonb object, preserving the `failedAttempts` array and any other keys `retryJob.ts` stored
    * `[✅]` All other branches of the function remain identical
  * `[✅]` `directionality`
    * `[✅]` Layer: infrastructure (database trigger)
    * `[✅]` All dependencies are inward-facing — the trigger reads row data, it does not call application code
    * `[✅]` The trigger's output (updated row) is consumed by application code reading job status — outward-facing
  * `[✅]` `requirements`
    * `[✅]` After migration, a retry-exhausted job's `error_details` must contain the `failedAttempts` key from `retryJob.ts`
    * `[✅]` After migration, a retry-exhausted job's `error_details` must contain `finalError`, `attempt_count`, `max_retries`, and `message` from the trigger
    * `[✅]` No existing behavior is changed for any other trigger branch
    * `[✅]` Migration is idempotent (`CREATE OR REPLACE`)

## Node 2

* `[✅]` [BE] `supabase/functions/_shared/utils/assembleChunks/` **Shared chunk assembly utility — classify, group, strip, merge**
  * `[✅]` `objective`
    * `[✅]` Provide a single, shared function that both `gatherContinuationInputs` and `assembleAndSaveFinalDocument` can call to assemble an ordered array of chunk content strings into one merged object
    * `[✅]` Classify each chunk as raw (unparseable) or parseable (valid JSON)
    * `[✅]` Group adjacent raw fragments and concatenate them into a single string, then sanitize the concatenated result into a parseable object
    * `[✅]` Strip continuation metadata keys (`continuation_needed`, `stop_reason`, `resume_cursor`) from parseable chunks — these are control signals, not document content
    * `[✅]` Deep-merge all parsed objects in order using the existing `mergeObjects` merge rules: string concatenation for `content` keys, recursive merge for nested objects, last-write-wins for primitives
    * `[✅]` Return the single merged object on success, or a typed error on failure
  * `[✅]` `role`
    * `[✅]` Domain utility — pure data transformation with no I/O, no database access, no external calls
  * `[✅]` `module`
    * `[✅]` Chunk assembly — shared between continuation prompt assembly (`gatherContinuationInputs`) and final document assembly (`assembleAndSaveFinalDocument`)
    * `[✅]` Replaces the Phase 2/Phase 3 logic in `file_manager.ts` (lines 774-840) and provides assembly logic for `gatherContinuationInputs.ts`
  * `[✅]` `deps`
    * `[✅]` `sanitizeJsonContent` from `supabase/functions/_shared/utils/jsonSanitizer.ts` — infrastructure utility, inward-facing; used to sanitize concatenated raw fragment groups into parseable JSON strings
    * `[✅]` `isRecord` from `supabase/functions/_shared/utils/type-guards/type_guards.common.ts` — domain guard, inward-facing; used to verify parsed results are record objects before merging
    * `[✅]` No reverse dependency introduced — this is a leaf utility consumed by higher-level functions
  * `[✅]` `context_slice`
    * `[✅]` From `sanitizeJsonContent`: accepts `string`, returns `JsonSanitizationResult` (`{ sanitized: string, wasSanitized: boolean, wasStructurallyFixed: boolean, hasDuplicateKeys: boolean }`)
    * `[✅]` From `isRecord`: accepts `unknown`, returns type predicate `item is Record<PropertyKey, unknown>`
    * `[✅]` Injection shape: both dependencies injected via `AssembleChunksDeps` interface — no concrete imports from higher or lateral layers
  * `[✅]` interface/`assembleChunks.interface.ts`
    * `[✅]` `AssembleChunksSignature` — function signature type: `(deps: AssembleChunksDeps, params: AssembleChunksParams, payload: AssembleChunksPayload) => AssembleChunksReturn`
    * `[✅]` `AssembleChunksDeps` — `{ sanitizeJsonContent: (rawContent: string) => JsonSanitizationResult; isRecord: (item: unknown) => item is Record<PropertyKey, unknown>; }`
    * `[✅]` `AssembleChunksParams` — empty object `{}` (no configuration parameters for this utility; must be defined, not equivocated with another empty object)
    * `[✅]` `AssembleChunksPayload` — `{ chunks: string[]; }` — ordered array of chunk content strings to assemble
    * `[✅]` `AssembleChunksReturn` — `Promise<AssembleChunksSuccess | AssembleChunksError>`
    * `[✅]` `AssembleChunksSuccess` — `{ success: true; mergedObject: Record<string, unknown>; chunkCount: number; rawGroupCount: number; parseableCount: number; }`
    * `[✅]` `AssembleChunksError` — `{ success: false; error: string; failedAtStep: "classification" | "sanitization" | "parse" | "merge"; }`
  * `[✅]` interface/tests/`assembleChunks.interface.test.ts`
    * `[✅]` Contract: `AssembleChunksDeps` requires both `sanitizeJsonContent` and `isRecord` — neither optional
    * `[✅]` Contract: `AssembleChunksPayload.chunks` is `string[]` — not optional, not nullable
    * `[✅]` Contract: `AssembleChunksParams` is an empty object — defined separately, not aliased to any other empty type
    * `[✅]` Contract: `AssembleChunksReturn` discriminates on `success: true | false`
    * `[✅]` Contract: `AssembleChunksSuccess.mergedObject` is `Record<string, unknown>` — not optional
    * `[✅]` Contract: `AssembleChunksError.failedAtStep` is a string union of exactly `"classification" | "sanitization" | "parse" | "merge"`
  * `[✅]` interface/guards/`assembleChunks.interface.guards.ts`
    * `[✅]` `isAssembleChunksSuccess` — narrows `AssembleChunksReturn` to `AssembleChunksSuccess` via `success === true`
    * `[✅]` `isAssembleChunksError` — narrows `AssembleChunksReturn` to `AssembleChunksError` via `success === false`
    * `[✅]` `isAssembleChunksDeps` — validates that an object satisfies `AssembleChunksDeps` (both function properties present and are functions)
    * `[✅]` `isAssembleChunksPayload` — validates that an object satisfies `AssembleChunksPayload` (`chunks` is an array of strings)
  * `[✅]` unit/`assembleChunks.test.ts`
    * `[✅]` Test: empty `chunks` array returns `AssembleChunksSuccess` with empty merged object, all counts zero
    * `[✅]` Test: single parseable chunk returns that chunk's parsed content as `mergedObject`
    * `[✅]` Test: multiple parseable chunks are deep-merged in order — `content` string fields concatenated, nested objects recursively merged, primitives last-write-wins
    * `[✅]` Test: single raw (unparseable) chunk is sanitized then parsed — `mergedObject` contains the sanitized result
    * `[✅]` Test: adjacent raw chunks are grouped, concatenated, sanitized as one string, then parsed
    * `[✅]` Test: mixed chain — raw fragments followed by parseable chunk — raw group is sanitized, then merged with parseable chunk in order
    * `[✅]` Test: mixed chain — parseable chunk followed by raw fragments followed by parseable chunk — three groups merged in order
    * `[✅]` Test: continuation metadata keys (`continuation_needed`, `stop_reason`, `resume_cursor`) are stripped from parseable chunks before merge
    * `[✅]` Test: continuation metadata keys inside nested objects are NOT stripped (only top-level stripping)
    * `[✅]` Test: when sanitization of a raw group fails to produce parseable JSON, returns `AssembleChunksError` with `failedAtStep: "sanitization"`
    * `[✅]` Test: `mergedObject` preserves all non-metadata keys from all chunks
  * `[✅]` `construction`
    * `[✅]` Canonical entry point: `assembleChunks(deps, params, payload)` — the only exported function
    * `[✅]` Prohibited: direct construction of internal merge state outside the function
    * `[✅]` Object completeness: all fields in `AssembleChunksSuccess` and `AssembleChunksError` must be populated at construction boundary — no optional fields, no defaults
    * `[✅]` Initialization order: classify → group raw → sanitize raw groups → parse all → strip metadata → merge → return
  * `[✅]` `assembleChunks.ts`
    * `[✅]` Add construction rationale comment explaining why this is a shared utility (eliminates duplication between `gatherContinuationInputs` and `assembleAndSaveFinalDocument`), why deps are injected (testability), and why `mergeObjects` is an internal helper (single responsibility)
    * `[✅]` Implement `assembleChunks` matching `AssembleChunksSignature`
    * `[✅]` Step 1 — Classify: iterate `payload.chunks`, attempt `JSON.parse()` on each. Success → parseable. Failure → raw fragment.
    * `[✅]` Step 2 — Group adjacent raw fragments: consecutive raw chunks concatenated into single strings, producing an ordered list of `{ type: "raw", content: string } | { type: "parsed", value: Record<string, unknown> }`
    * `[✅]` Step 3 — Sanitize raw groups: for each raw group, call `deps.sanitizeJsonContent(content)`, then `JSON.parse(result.sanitized)`. Verify with `deps.isRecord()`. If sanitization or parse fails, return `AssembleChunksError`.
    * `[✅]` Step 4 — Strip continuation metadata: from each parsed object (whether originally parseable or sanitized from raw), delete `continuation_needed`, `stop_reason`, `resume_cursor` at top level only
    * `[✅]` Step 5 — Deep merge: fold all parsed objects left-to-right using `mergeObjects` logic (internal helper, same rules as `file_manager.ts` lines 752-769: `content` key string concatenation, recursive merge for nested records, last-write-wins for primitives)
    * `[✅]` Step 6 — Return `AssembleChunksSuccess` with the merged object and counts
    * `[✅]` `mergeObjects` is an internal helper within this file — not exported, not a second function file; it is a private implementation detail of `assembleChunks`
  * `[✅]` provides/`assembleChunks.provides.ts`
    * `[✅]` Exports `assembleChunks` function as the sole public symbol
    * `[✅]` Exports all interface types from `assembleChunks.interface.ts` for consumer use
    * `[✅]` Exports all guards from `assembleChunks.interface.guards.ts` for consumer use
    * `[✅]` No other access path bypasses this file
  * `[✅]` `assembleChunks.mock.ts`
    * `[✅]` Provides a mock `assembleChunks` function that returns a configurable `AssembleChunksSuccess` or `AssembleChunksError`
    * `[✅]` Consumers (`gatherContinuationInputs`, `assembleAndSaveFinalDocument`) use this mock to test in isolation without exercising real chunk assembly
    * `[✅]` Mock respects `AssembleChunksSignature` — same deps/params/payload/return shape
  * `[✅]` `directionality`
    * `[✅]` Layer: domain utility (pure transformation)
    * `[✅]` All dependencies are inward-facing: `sanitizeJsonContent` (infrastructure utility), `isRecord` (domain guard) — both lower-level
    * `[✅]` All provides are outward-facing: consumed by `gatherContinuationInputs` (app-level) and `assembleAndSaveFinalDocument` (app-level)
  * `[✅]` `requirements`
    * `[✅]` Given an ordered array of chunk strings, produces a single merged object with all content preserved and continuation metadata stripped
    * `[✅]` Handles raw-only, parseable-only, and mixed chains correctly
    * `[✅]` Adjacent raw fragments are grouped and sanitized as one unit
    * `[✅]` Deep merge follows existing `mergeObjects` rules exactly — no behavioral change from current Phase 2/3 merge logic
    * `[✅]` Returns typed error with specific `failedAtStep` when assembly cannot complete
    * `[✅]` No I/O, no database calls, no side effects — pure function

## Node 3

* `[✅]` [BE] `supabase/functions/dialectic-worker/continueJob` **Return distinguishable result when continuation cap is hit**
  * `[✅]` `objective`
    * `[✅]` When `continueJob` determines that the continuation count has reached the cap (`continuation_count >= 5`), it must return `{ enqueued: false, reason: 'continuation_limit_reached' }` so the caller (`executeModelCallAndSave`) can distinguish "cap hit" from "continueUntilComplete is false"
    * `[✅]` The existing `return { enqueued: false }` for the `!continueUntilComplete` case must remain unchanged (no `reason` property)
    * `[✅]` Add `"continuation_limit_reached"` to the `ModelProcessingResult.status` union so the caller can set the appropriate status
    * `[✅]` Add `reason?: string` to `IContinueJobResult` so the return type supports the new field
  * `[✅]` `role`
    * `[✅]` Application — worker-level continuation orchestration
  * `[✅]` `module`
    * `[✅]` Dialectic worker — continuation enqueue logic
    * `[✅]` Boundary: determines whether to enqueue a continuation job and reports the reason when it does not
  * `[✅]` `deps`
    * `[✅]` `IContinueJobDeps` from `dialectic.interface.ts` (line 1911-1913) — `{ logger: ILogger }`, inward-facing
    * `[✅]` `IContinueJobResult` from `dialectic.interface.ts` (line 1915-1918) — return type, modified in this node
    * `[✅]` `ModelProcessingResult` from `dialectic.interface.ts` (canonical definition at line 1219-1225; duplicate at line 1903-1909 to be deleted in this node) — modified to add `"continuation_limit_reached"` to status union
    * `[✅]` `SupabaseClient<Database>` — infrastructure, injected via parameter (Supabase client cast exception applies)
    * `[✅]` `isModelProcessingResult` from `_shared/utils/type-guards/type_guards.dialectic.ts` (line 1341-1379) — existing guard to be moved to new file in this node
    * `[✅]` `isJobResultsWithModelProcessing` from `_shared/utils/type-guards/type_guards.dialectic.ts` (line 1329-1339) — existing guard to be moved alongside `isModelProcessingResult`
    * `[✅]` Type guards from `_shared/utils/type_guards.ts` (barrel re-export) and `type-guards/type_guards.file_manager.ts` — domain guards, inward-facing
    * `[✅]` No reverse dependency introduced
  * `[✅]` `context_slice`
    * `[✅]` From `IContinueJobDeps`: `{ logger: ILogger }` — logging only
    * `[✅]` From `SupabaseClient<Database>`: `.from('dialectic_generation_jobs').insert()` — single table insert
    * `[✅]` Injection shape: `deps` parameter for logger, `dbClient` parameter for database — no concrete imports from higher layers
  * `[✅]` interface/`dialectic.interface.ts`
    * `[✅]` `IContinueJobResult` (line 1915-1918): add `reason?: string` — optional because only the cap-hit path sets it
    * `[✅]` `ModelProcessingResult` (line 1219-1225): change `status` from `"completed" | "failed" | "needs_continuation"` to `"completed" | "failed" | "needs_continuation" | "continuation_limit_reached"` — this is the canonical definition
    * `[✅]` Delete the duplicate `ModelProcessingResult` at line 1903-1909 — a single canonical definition at line 1219 is the only valid source of truth; duplicate interface declarations cause silent merge behavior that masks drift
  * `[✅]` guards/tests/`_shared/utils/type-guards/type_guards.modelProcessingResult.test.ts` **(new file — tests moved from `type_guards.dialectic.test.ts`)**
    * `[✅]` Move existing `isModelProcessingResult` tests from `type_guards.dialectic.test.ts` (lines 1857-1905)
    * `[✅]` Move existing `isJobResultsWithModelProcessing` tests from the same file
    * `[✅]` Add test: `isModelProcessingResult` accepts object with `status: "continuation_limit_reached"` — returns `true`
    * `[✅]` Add test: `isModelProcessingResultStatus` accepts `"continuation_limit_reached"` — returns `true`
    * `[✅]` Add test: `isModelProcessingResultStatus` rejects `"invalid_status"` — returns `false`
    * `[✅]` Add test: `isModelProcessingResultStatus` accepts each of `"completed"`, `"failed"`, `"needs_continuation"` — no regression
  * `[✅]` barrel/`_shared/utils/type_guards.ts`
    * `[✅]` Update re-export of `isModelProcessingResult` and `isJobResultsWithModelProcessing` to import from `type-guards/type_guards.modelProcessingResult.ts` instead of `type-guards/type_guards.dialectic.ts`
    * `[✅]` Add re-export of `isModelProcessingResultStatus` from `type-guards/type_guards.modelProcessingResult.ts`
  * `[✅]` removal/`_shared/utils/type-guards/type_guards.dialectic.ts`
    * `[✅]` Remove `isModelProcessingResult` (lines 1341-1379)
    * `[✅]` Remove `isJobResultsWithModelProcessing` (lines 1329-1339)
  * `[✅]` removal/`_shared/utils/type-guards/type_guards.dialectic.test.ts`
    * `[✅]` Remove `isModelProcessingResult` test block (lines 1857-1905)
    * `[✅]` Remove `isJobResultsWithModelProcessing` test block
  * `[✅]` unit/`continueJob.test.ts`
    * `[✅]` Update existing test (line 397-408): `'CONTINUATION_COUNT: should not enqueue when continuation_count is 5 (at max)'` — add assertion `assertEquals(result.reason, 'continuation_limit_reached')`
    * `[✅]` Update existing test (line 410-421): `'CONTINUATION_COUNT: should not enqueue when continuation_count is 6 (over max)'` — add assertion `assertEquals(result.reason, 'continuation_limit_reached')`
    * `[✅]` Add new test: `'CONTINUATION_COUNT: should not include reason when continueUntilComplete is false'` — assert `result.reason` is `undefined` when `continueUntilComplete: false` causes the early return
    * `[✅]` Existing test (line 315-325): `'CONTINUE_FLAG: should not enqueue when continueUntilComplete is false'` — add assertion `assertEquals(result.reason, undefined)` to confirm no reason for this path
  * `[✅]` `construction`
    * `[✅]` Canonical entry point: `continueJob(deps, dbClient, job, aiResponse, savedContribution, projectOwnerUserId)` — existing signature, unchanged
    * `[✅]` The `reason` field is only set on the cap-hit path; the `continueUntilComplete: false` path returns without `reason`
    * `[✅]` Object completeness: the returned `IContinueJobResult` is fully constructed at each return site — no post-construction mutation
  * `[✅]` `continueJob.ts`
    * `[✅]` Line 60-62: split the combined `if (!underMaxContinuations || !job.payload.continueUntilComplete)` into two separate checks
    * `[✅]` First check: `if (!underMaxContinuations)` → `return { enqueued: false, reason: 'continuation_limit_reached' }`
    * `[✅]` Second check: `if (!job.payload.continueUntilComplete)` → `return { enqueued: false }` (no reason, existing behavior)
    * `[✅]` No other lines of the function are modified
    * `[✅]` The split preserves the same logical behavior — both conditions still prevent enqueue, but now they return distinguishable results
  * `[✅]` `directionality`
    * `[✅]` Layer: application (worker)
    * `[✅]` All dependencies are inward-facing: interface types (domain), type guards (domain), logger (infrastructure), database client (infrastructure)
    * `[✅]` Provides are outward-facing: consumed by `executeModelCallAndSave` (same layer, lateral — acceptable because `executeModelCallAndSave` is the caller)
  * `[✅]` `requirements`
    * `[✅]` When `continuation_count >= 5`, return includes `reason: 'continuation_limit_reached'`
    * `[✅]` When `continueUntilComplete` is false, return does NOT include `reason`
    * `[✅]` All existing return paths and behavior are preserved — only the cap-hit return is enriched
    * `[✅]` `ModelProcessingResult.status` union includes `"continuation_limit_reached"` at the single canonical definition (line 1219); duplicate at line 1903 is deleted
    * `[✅]` `isModelProcessingResult` guard moved to `type_guards.modelProcessingResult.ts` with updated status validation
    * `[✅]` `isJobResultsWithModelProcessing` guard moved alongside
    * `[✅]` Barrel `type_guards.ts` re-exports from new location
    * `[✅]` `IContinueJobResult` supports optional `reason` field

## Node 4

* `[✅]` [BE] `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs` **Return assembled 3-message structure instead of N alternating messages**
  * `[✅]` `objective`
    * `[✅]` Replace the current N-message alternating user/assistant return with exactly 3 messages: (1) user seed prompt, (2) assistant assembled document from all prior chunks, (3) user context-aware continuation instruction
    * `[✅]` Use the shared `assembleChunks` utility (Node 2) to assemble all chunk content strings into a single merged object for the assistant message
    * `[✅]` Construct the continuation instruction based on the last chunk's state: explicit content-level flags (resume cursor), raw/structurally-fixed (continue from end), or missing expected keys (list missing keys)
    * `[✅]` Accept an optional `expectedSchema` parameter (typed as `ContextForDocument` from `dialectic.interface.ts`) so missing-key detection can inform the continuation instruction — uses the explicit application type, not a primitive `Record<string, unknown>`
  * `[✅]` `role`
    * `[✅]` Application — prompt assembly pipeline component
  * `[✅]` `module`
    * `[✅]` Prompt assembler — continuation input gathering
    * `[✅]` Boundary: fetches chunk data from database/storage and transforms it into a structured 3-message array for downstream prompt assembly
  * `[✅]` `deps`
    * `[✅]` `assembleChunks` from Node 2 (`_shared/utils/assembleChunks`) — domain utility, inward-facing; assembles chunk strings into merged object
    * `[✅]` `SupabaseClient<Database>` — infrastructure, injected via parameter (Supabase client cast exception applies)
    * `[✅]` `downloadFromStorageFn` — infrastructure adapter, injected via parameter; downloads chunk content from storage
    * `[✅]` `Messages` from `_shared/types.ts` (line 395-400) — domain type for message structure
    * `[✅]` No reverse dependency introduced — this function is consumed by `assembleContinuationPrompt` (higher layer)
  * `[✅]` `context_slice`
    * `[✅]` From `assembleChunks`: accepts `AssembleChunksDeps`, `AssembleChunksParams`, `AssembleChunksPayload`; returns `AssembleChunksSuccess | AssembleChunksError`
    * `[✅]` From `SupabaseClient<Database>`: `.from('dialectic_contributions').select().eq().single()`, `.from('dialectic_contributions').select().contains()`, `.from('dialectic_project_resources').select().eq().eq().order().limit().maybeSingle()` — three query patterns
    * `[✅]` From `downloadFromStorageFn`: accepts `(bucket: string, path: string)`, returns `Promise<DownloadStorageResult>`
    * `[✅]` Injection shape: all dependencies injected via function parameters — no concrete imports from higher layers
  * `[✅]` interface/`gatherContinuationInputs.interface.ts`
    * `[✅]` `GatherContinuationInputsSignature` — function signature type incorporating DI structure
    * `[✅]` `GatherContinuationInputsDeps` — `{ assembleChunks: AssembleChunksSignature; downloadFromStorageFn: (bucket: string, path: string) => Promise<DownloadStorageResult>; dbClient: SupabaseClient<Database>; }` (Supabase client cast exception applies)
    * `[✅]` `GatherContinuationInputsParams` — `{ chunkId: string; }` — the root chunk ID to gather continuations for
    * `[✅]` `GatherContinuationInputsPayload` — `{ expectedSchema?: ContextForDocument; }` — optional schema for missing-key detection in continuation instruction; uses the explicit `ContextForDocument` type (which contains `document_key: FileType` and `content_to_include: ContentToInclude`) rather than a primitive record
    * `[✅]` `GatherContinuationInputsReturn` — `Promise<GatherContinuationInputsSuccess | GatherContinuationInputsError>`
    * `[✅]` `GatherContinuationInputsSuccess` — `{ success: true; messages: Messages[]; }` — always exactly 3 messages
    * `[✅]` `GatherContinuationInputsError` — `{ success: false; error: string; }`
    * `[✅]` Remove the existing `GatherContinuationInputsFn` type export (lines 6-13 of current file) — it is superseded by `GatherContinuationInputsSignature`. Both consumers (`prompt-assembler.interface.ts` and `prompt-assembler.ts`) are updated to use the new type in Node 5. No other consumers exist.
  * `[✅]` interface/tests/`gatherContinuationInputs.interface.test.ts`
    * `[✅]` Contract: `GatherContinuationInputsDeps` requires `assembleChunks`, `downloadFromStorageFn`, and `dbClient` — none optional
    * `[✅]` Contract: `GatherContinuationInputsParams.chunkId` is `string` — not optional
    * `[✅]` Contract: `GatherContinuationInputsPayload.expectedSchema` is optional `ContextForDocument`
    * `[✅]` Contract: `GatherContinuationInputsSuccess.messages` is `Messages[]` — not optional
    * `[✅]` Contract: `GatherContinuationInputsReturn` discriminates on `success: true | false`
  * `[✅]` interface/guards/`gatherContinuationInputs.interface.guards.ts`
    * `[✅]` `isGatherContinuationInputsSuccess` — narrows return to success via `success === true`
    * `[✅]` `isGatherContinuationInputsError` — narrows return to error via `success === false`
  * `[✅]` unit/`gatherContinuationInputs.test.ts`
    * `[✅]` Update existing tests to expect 3-message return structure instead of N alternating messages
    * `[✅]` Test: single chunk (root only) — messages are: (1) user seed prompt, (2) assistant with root chunk content as JSON string, (3) user continuation instruction
    * `[✅]` Test: multiple chunks — assistant message contains the assembled/merged object from all chunks, not individual chunk contents
    * `[✅]` Test: continuation instruction references resume cursor when last chunk has `resume_cursor` in its content-level flags (Path 2)
    * `[✅]` Test: continuation instruction says "continue from where it ends" when last chunk is raw/structurally-fixed (Paths 1/3)
    * `[✅]` Test: continuation instruction lists missing keys when `expectedSchema` is provided and assembled object is missing keys (Path 4)
    * `[✅]` Test: when `assembleChunks` returns an error, `gatherContinuationInputs` returns `GatherContinuationInputsError`
    * `[✅]` Test: when no `expectedSchema` is provided and last chunk has no flags, continuation instruction is a generic "continue from where it ends"
    * `[✅]` Test: seed prompt is always the first message with role `user`
    * `[✅]` Test: assembled object is always the second message with role `assistant`
    * `[✅]` Test: continuation instruction is always the third message with role `user`
  * `[✅]` `construction`
    * `[✅]` Canonical entry point: `gatherContinuationInputs(deps, params, payload)` — new DI signature replacing the old positional signature
    * `[✅]` The function constructs exactly 3 `Messages` objects — no more, no less
    * `[✅]` The continuation instruction is constructed internally based on last-chunk analysis — not configurable externally
    * `[✅]` Initialization order: fetch root chunk → fetch related chunks → sort → download all chunk content → call `assembleChunks` → fetch seed prompt → analyze last chunk → construct continuation instruction → return 3 messages
  * `[✅]` `gatherContinuationInputs.ts`
    * `[✅]` Add construction rationale comment explaining the DI structure (deps/params/payload), why `ContextForDocument` is used instead of a primitive record, and why exactly 3 messages are always returned
    * `[✅]` Refactor function signature from positional `(dbClient, downloadFromStorageFn, chunkId)` to DI `(deps, params, payload)`
    * `[✅]` Steps 1-4 (fetch root chunk, query related chunks, sort, download seed prompt) — preserve existing logic, adapt to use `deps.dbClient` and `deps.downloadFromStorageFn` instead of positional parameters
    * `[✅]` Step 5 (currently lines 146-176: build N alternating messages) — replace entirely:
      * `[✅]` Download all chunk content strings into an ordered array
      * `[✅]` Call `deps.assembleChunks(assembleChunksDeps, assembleChunksParams, { chunks: chunkContentStrings })` to get the merged object
      * `[✅]` If `assembleChunks` returns error, return `GatherContinuationInputsError`
    * `[✅]` Step 6 — Analyze last chunk for continuation instruction type:
      * `[✅]` Parse last chunk content. If it contains `resume_cursor`, use Path 2 instruction with cursor details
      * `[✅]` If last chunk was unparseable (raw) or was structurally fixed, use Path 1/3 instruction ("continue from where it ends")
      * `[✅]` If `payload.expectedSchema` provided, compare assembled object keys against `expectedSchema.content_to_include` (typed as `ContentToInclude`). If keys missing, use Path 4 instruction listing missing keys
      * `[✅]` Default: generic continuation instruction
    * `[✅]` Step 7 — Return `GatherContinuationInputsSuccess` with exactly 3 messages:
      * `[✅]` `{ role: "user", content: seedPromptContent }` — seed prompt
      * `[✅]` `{ role: "assistant", content: JSON.stringify(assembledObject) }` — assembled document
      * `[✅]` `{ role: "user", content: continuationInstruction }` — context-aware instruction
  * `[✅]` `directionality`
    * `[✅]` Layer: application (prompt assembly)
    * `[✅]` All dependencies are inward-facing: `assembleChunks` (domain utility), database client (infrastructure), storage download (infrastructure), types (domain)
    * `[✅]` Provides are outward-facing: consumed by `assembleContinuationPrompt` (same layer, lateral — acceptable as direct caller)
  * `[✅]` `requirements`
    * `[✅]` Always returns exactly 3 messages regardless of number of continuation chunks
    * `[✅]` Assistant message contains the single assembled object as a JSON string, not individual chunk contents
    * `[✅]` Continuation instruction is context-aware based on last chunk state (resume cursor, truncation, missing keys, or generic)
    * `[✅]` When `expectedSchema` is provided, missing keys are listed in the continuation instruction
    * `[✅]` All existing data-fetching logic (root chunk lookup, related chunk query, sort, seed prompt download) is preserved
    * `[✅]` Function signature transitions to DI structure; callers must be updated (addressed in Node 5 for `prompt-assembler` facade and Node 6 for `assembleContinuationPrompt`)

## Node 5

* `[✅]` [BE] `supabase/functions/_shared/prompt-assembler/prompt-assembler` **Update facade to use new GatherContinuationInputs DI signature**
  * `[✅]` `objective`
    * `[✅]` Update the `PromptAssembler` class to store and pass the new DI-signature version of `gatherContinuationInputs` from Node 4
    * `[✅]` Replace `GatherContinuationInputsFn` with `GatherContinuationInputsSignature` in imports, stored field type, and constructor parameter type
    * `[✅]` The facade is a pass-through wiring layer — it stores the function reference and forwards it to `assembleContinuationPrompt` via deps; it does not invoke `gatherContinuationInputs` directly
  * `[✅]` `role`
    * `[✅]` Application — prompt assembly facade/orchestrator
  * `[✅]` `module`
    * `[✅]` Prompt assembler — dependency wiring layer between `gatherContinuationInputs` and `assembleContinuationPrompt`
    * `[✅]` Boundary: constructs deps objects for assembly functions, delegates all assembly work
  * `[✅]` `deps`
    * `[✅]` `GatherContinuationInputsSignature` from Node 4 (`gatherContinuationInputs.interface.ts`) — new DI function signature type, inward-facing
    * `[✅]` `gatherContinuationInputs` from Node 4 (`gatherContinuationInputs.ts`) — concrete implementation with new DI signature, inward-facing
    * `[✅]` `AssembleContinuationPromptDeps` from `prompt-assembler.interface.ts` — deps type passed to `assembleContinuationPrompt`, modified in this node
    * `[✅]` No reverse dependency introduced — the facade is consumed by `processSimpleJob` (higher layer)
  * `[✅]` `context_slice`
    * `[✅]` From `GatherContinuationInputsSignature`: the function type stored as private field and passed through to `assembleContinuationPrompt` deps
    * `[✅]` No direct invocation of `gatherContinuationInputs` — facade stores and forwards only
    * `[✅]` Injection shape: function reference injected via constructor parameter, stored as private field
  * `[✅]` interface/`prompt-assembler.interface.ts`
    * `[✅]` `AssembleContinuationPromptDeps` (line 38-52): update `gatherContinuationInputs` property type from `GatherContinuationInputsFn` to `GatherContinuationInputsSignature`
    * `[✅]` Update import: remove `GatherContinuationInputsFn` import, add `GatherContinuationInputsSignature` import from `gatherContinuationInputs.interface.ts`
    * `[✅]` `IPromptAssembler` — update if it types the stored field
  * `[✅]` interface/tests/ — no new type contracts needed; the `GatherContinuationInputsSignature` contract is covered in Node 4
  * `[✅]` interface/guards/ — no new guards needed
  * `[✅]` unit/`prompt-assembler.test.ts`
    * `[✅]` Test: constructor accepts new-signature `gatherContinuationInputs` function
    * `[✅]` Test: `assembleContinuationPrompt` deps receive the stored function with correct type
    * `[✅]` Test: default `gatherContinuationInputs` (when not injected via constructor) matches new DI signature
    * `[✅]` Test: all non-continuation assembly paths (seed, planner, turn) are unaffected
  * `[✅]` `construction`
    * `[✅]` Canonical entry point: `new PromptAssembler(dbClient, fileManager, ...)` — existing constructor, parameter type updated
    * `[✅]` `gatherContinuationInputsFn` private field type changes from `GatherContinuationInputsFn` to `GatherContinuationInputsSignature`
    * `[✅]` Default assignment (line 74) continues to reference the concrete `gatherContinuationInputs` function — its signature already changed in Node 4
  * `[✅]` `prompt-assembler.ts`
    * `[✅]` Add construction rationale comment explaining why the facade stores function references rather than invoking them directly — this enables DI and testability
    * `[✅]` Line 24: change import from `GatherContinuationInputsFn` to `GatherContinuationInputsSignature` (from `gatherContinuationInputs.interface.ts`)
    * `[✅]` Line 47: change stored field type from `GatherContinuationInputsFn` to `GatherContinuationInputsSignature`
    * `[✅]` Line 61: change constructor parameter type accordingly
    * `[✅]` Line 74: default assignment — `gatherContinuationInputs` concrete function already has new signature from Node 4, no logic change needed
    * `[✅]` No other lines of the class are modified
  * `[✅]` `directionality`
    * `[✅]` Layer: application (facade)
    * `[✅]` All dependencies are inward-facing: types (domain), concrete functions (application)
    * `[✅]` Provides are outward-facing: consumed by `processSimpleJob` (worker layer)
  * `[✅]` `requirements`
    * `[✅]` Facade compiles with new `GatherContinuationInputsSignature` function type
    * `[✅]` Default `gatherContinuationInputs` works when not injected via constructor
    * `[✅]` All existing non-continuation prompt assembly paths (seed, planner, turn) are completely unaffected
    * `[✅]` The old `GatherContinuationInputsFn` type alias is no longer imported or used by the facade

## Node 6

* `[✅]` [BE] `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt` **Stop flattening messages; propagate structured 3-message array**
  * `[✅]` `objective`
    * `[✅]` Remove the flatten loop (lines 157-163) that strips roles and joins all message content into a single string
    * `[✅]` Instead, propagate the structured 3-message array from `gatherContinuationInputs` (Node 4) through `AssembledPrompt` so downstream consumers can route messages into `conversationHistory` + `currentUserPrompt`
    * `[✅]` Add optional `messages?: Messages[]` field to the `AssembledPrompt` type in `prompt-assembler.interface.ts`
    * `[✅]` Keep `promptContent` set to the final user message (continuation instruction) for backward compatibility with file upload
    * `[✅]` Update the call to `gatherContinuationInputs` to use the new DI signature from Node 4
  * `[✅]` `role`
    * `[✅]` Application — prompt assembly pipeline component
  * `[✅]` `module`
    * `[✅]` Prompt assembler — continuation prompt assembly
    * `[✅]` Boundary: receives structured messages from `gatherContinuationInputs`, preserves their structure in the returned `AssembledPrompt`, and saves the prompt to storage
  * `[✅]` `deps`
    * `[✅]` `AssembledPrompt` from `prompt-assembler.interface.ts` (line 104-107) — return type, modified in this node to add `messages`
    * `[✅]` `AssembleContinuationPromptDeps` from `prompt-assembler.interface.ts` — deps type, already updated in Node 5 to use `GatherContinuationInputsSignature`
    * `[✅]` `gatherContinuationInputs` from Node 4 via Node 5 facade — now returns `GatherContinuationInputsSuccess | GatherContinuationInputsError` via DI signature
    * `[✅]` `Messages` from `_shared/types.ts` (line 395-400) — domain type for message structure
    * `[✅]` `isRecord` from `_shared/utils/type_guards.ts` — domain guard, inward-facing
    * `[✅]` `FileType` from `_shared/types/file_manager.types.ts` — domain enum, inward-facing
    * `[✅]` `HeaderContext` from `dialectic-service/dialectic.interface.ts` — domain type, inward-facing
    * `[✅]` No reverse dependency introduced
  * `[✅]` `context_slice`
    * `[✅]` From `gatherContinuationInputs`: new DI signature returning `GatherContinuationInputsSuccess` with `messages: Messages[]` (always 3 messages)
    * `[✅]` From `AssembledPrompt`: `{ promptContent: string; source_prompt_resource_id: string; messages?: Messages[]; }` — the new optional field
    * `[✅]` Injection shape: all dependencies via `AssembleContinuationPromptDeps` — no concrete imports from higher layers
  * `[✅]` interface/`prompt-assembler.interface.ts`
    * `[✅]` `AssembledPrompt` (line 104-107): add `messages?: Messages[]` — optional because only the continuation path sets it; non-continuation paths return `AssembledPrompt` without `messages`
    * `[✅]` `AssembleContinuationPromptDeps` — `gatherContinuationInputs` property type already updated to `GatherContinuationInputsSignature` in Node 5; no additional change needed here
    * `[✅]` Import `Messages` type if not already imported
  * `[✅]` interface/tests/`assembleContinuationPrompt.interface.test.ts`
    * `[✅]` Contract: `AssembledPrompt` accepts `{ promptContent: string, source_prompt_resource_id: string, messages: [...] }` — compiles with messages
    * `[✅]` Contract: `AssembledPrompt` accepts `{ promptContent: string, source_prompt_resource_id: string }` — compiles without messages (backward compatible)
    * `[✅]` Contract: `AssembledPrompt.messages` is `Messages[] | undefined` — optional, not required
  * `[✅]` interface/guards/`assembleContinuationPrompt.interface.guards.ts`
    * `[✅]` `isAssembledPromptWithMessages` — narrows `AssembledPrompt` to confirm `messages` is present and is a non-empty array
  * `[✅]` unit/`assembleContinuationPrompt.test.ts`
    * `[✅]` Update existing tests to account for the new return shape
    * `[✅]` Test: when `gatherContinuationInputs` returns success with 3 messages, `assembled.messages` contains those 3 messages
    * `[✅]` Test: `assembled.promptContent` is the final user message (third message content) plus any header context, not the flattened blob of all messages
    * `[✅]` Test: when `gatherContinuationInputs` returns error, `assembleContinuationPrompt` throws with the error message
    * `[✅]` Test: file upload still receives `promptContent` (for storage), not the structured messages
    * `[✅]` Test: `source_prompt_resource_id` is still populated from the file upload response
  * `[✅]` `construction`
    * `[✅]` Canonical entry point: `assembleContinuationPrompt(deps)` — existing signature shape, deps type updated
    * `[✅]` `messages` is set on the returned `AssembledPrompt` only when `gatherContinuationInputs` returns structured messages
    * `[✅]` `promptContent` is set to the continuation instruction (third message) concatenated with any header context — this preserves file upload content
    * `[✅]` Object completeness: `promptContent` and `source_prompt_resource_id` always present; `messages` present on continuation path
  * `[✅]` `assembleContinuationPrompt.ts`
    * `[✅]` Add construction rationale comment explaining why messages are propagated as structured array instead of flattened, and why `promptContent` is kept for file upload backward compatibility
    * `[✅]` Update the call to `gatherContinuationInputs` (line 151-155) to use the new DI signature: pass deps/params/payload instead of positional args
    * `[✅]` Handle the `gatherContinuationInputs` return: check for `success === false` and throw; on success, extract `messages`
    * `[✅]` Remove the flatten loop (lines 157-161): no longer iterate messages to push content into `promptParts`
    * `[✅]` Instead, construct `promptParts` from header context (if any) + the third message content (continuation instruction)
    * `[✅]` Set `messages` on the returned `AssembledPrompt`: `return { promptContent: finalPrompt, source_prompt_resource_id: response.record.id, messages: gatherResult.messages }`
    * `[✅]` All other logic (model fetch, header context fetch, root contribution resolution, file upload) remains unchanged
  * `[✅]` `directionality`
    * `[✅]` Layer: application (prompt assembly)
    * `[✅]` All dependencies are inward-facing: `gatherContinuationInputs` (same layer, lateral — direct producer), types (domain), guards (domain), database client (infrastructure), file manager (infrastructure)
    * `[✅]` Provides are outward-facing: consumed by `processSimpleJob` (higher layer — worker) via `ctx.promptAssembler.assemble()`
  * `[✅]` `requirements`
    * `[✅]` Messages from `gatherContinuationInputs` are propagated through `AssembledPrompt` without flattening
    * `[✅]` `promptContent` contains the continuation instruction (+ header context) for file upload — not the full flattened blob
    * `[✅]` `AssembledPrompt.messages` is optional — non-continuation assembly paths are unaffected
    * `[✅]` Backward compatibility: consumers that only read `promptContent` and `source_prompt_resource_id` continue to work unchanged
    * `[✅]` Consumers that check for `messages` (Node 8: `processSimpleJob`) can populate `conversationHistory` from the structured array

## Node 7

* `[✅]` [BE] `supabase/functions/_shared/services/file_manager` **Add expectedSchema parameter + refactor Phase 2/3 to use assembleChunks**
  * `[✅]` `objective`
    * `[✅]` (Fix 2) Add an optional `expectedSchema?: ContextForDocument` parameter to `assembleAndSaveFinalDocument`. Between the merge (line 846) and upload (line 905): if `expectedSchema` is provided, walk `mergedObject` against `expectedSchema.content_to_include` (typed as `ContentToInclude`). For every key in the schema where `mergedObject` has a missing key, empty string (`""`), or empty array (`[]`), replace the value with `"[Continuation limit reached — value not generated]"`. Recurse for nested `ContentToInclude` objects. Uses the explicit application type throughout — no conversion to primitive records.
    * `[✅]` (Fix 3.1) Refactor Phase 2 (lines 774-797) and Phase 3 (lines 799-840) to use the shared `assembleChunks` utility from Node 2. Remove the inline `mergeObjects` helper (lines 752-769) — this logic now lives inside `assembleChunks`.
    * `[✅]` Existing behavior must be preserved — the refactor is implementation-only, not behavioral.
  * `[✅]` `role`
    * `[✅]` Application — file management service
  * `[✅]` `module`
    * `[✅]` File manager — document assembly and storage
    * `[✅]` Boundary: assembles continuation fragments into a final document, optionally fills missing keys from expected schema, uploads to storage
  * `[✅]` `deps`
    * `[✅]` `assembleChunks` from Node 2 (`_shared/utils/assembleChunks`) — domain utility, inward-facing; replaces inline Phase 2/3 logic
    * `[✅]` `sanitizeJsonContent` from `_shared/utils/jsonSanitizer.ts` — infrastructure utility, inward-facing (currently used inline, will be passed through `assembleChunks` deps)
    * `[✅]` `isRecord` from `_shared/utils/type-guards/type_guards.common.ts` — domain guard, inward-facing
    * `[✅]` `isJsonSanitizationResult` from type guards — domain guard, inward-facing (currently used in Phase 2/3, may be removable after refactor)
    * `[✅]` Supabase client — infrastructure, injected via constructor (`this.supabase`)
    * `[✅]` No reverse dependency introduced
  * `[✅]` `context_slice`
    * `[✅]` From `assembleChunks`: accepts `AssembleChunksDeps`, `AssembleChunksParams`, `AssembleChunksPayload`; returns `AssembleChunksSuccess | AssembleChunksError`
    * `[✅]` From `this.supabase`: storage download (`.storage.from().download()`), contribution queries
    * `[✅]` Injection shape: `assembleChunks` injected as a new dependency on the `FileManagerService` class or passed as a parameter; Supabase client already injected via constructor
  * `[✅]` interface/`file_manager.interface.ts` (or existing type location)
    * `[✅]` `assembleAndSaveFinalDocument` signature: add optional second parameter `expectedSchema?: ContextForDocument`
    * `[✅]` Import `ContextForDocument` from `dialectic-service/dialectic.interface.ts`
    * `[✅]` If `assembleAndSaveFinalDocument` is defined in an interface (e.g., `IFileManager`), update the interface to include the new optional parameter
  * `[✅]` interface/tests/`file_manager.assemble.interface.test.ts`
    * `[✅]` Contract: `assembleAndSaveFinalDocument` accepts `(rootContributionId: string)` — existing signature still valid
    * `[✅]` Contract: `assembleAndSaveFinalDocument` accepts `(rootContributionId: string, expectedSchema: ContextForDocument)` — new signature valid
    * `[✅]` Contract: `expectedSchema` is optional — callers that don't provide it are unaffected
  * `[✅]` interface/guards/ — no new guards needed for this node; the `assembleChunks` guards from Node 2 handle the assembly result
  * `[✅]` unit/`file_manager.assemble.test.ts`
    * `[✅]` Test: (Fix 2) when `expectedSchema` is provided and merged object is missing keys, those keys are filled with `"[Continuation limit reached — value not generated]"`
    * `[✅]` Test: (Fix 2) when `expectedSchema` is provided and merged object already has values for all keys, those values are preserved — no overwriting
    * `[✅]` Test: (Fix 2) when `expectedSchema` has nested objects and merged object is missing nested keys, the fill recurses correctly
    * `[✅]` Test: (Fix 2) when `expectedSchema` is provided and merged object has empty string values, those are replaced with the placeholder
    * `[✅]` Test: (Fix 2) when `expectedSchema` is provided and merged object has empty array values, those are replaced with the placeholder
    * `[✅]` Test: (Fix 2) when `expectedSchema` is not provided (normal path), behavior is unchanged — no fill logic runs
    * `[✅]` Test: (Fix 3.1) existing assembly tests must continue to pass after Phase 2/3 refactor — same inputs produce same outputs
    * `[✅]` Test: (Fix 3.1) when `assembleChunks` returns an error, `assembleAndSaveFinalDocument` throws with a descriptive error
  * `[✅]` `construction`
    * `[✅]` `assembleAndSaveFinalDocument(rootContributionId, expectedSchema?: ContextForDocument)` — existing method on `FileManagerService` class, signature extended
    * `[✅]` `assembleChunks` dependency: either injected via constructor (preferred — consistent with other service deps) or imported directly (acceptable for a pure utility)
    * `[✅]` Schema fill logic is a private method or inline block between merge and upload — not a separate exported function
    * `[✅]` Initialization order: download chunks → call `assembleChunks` → (optional) fill from schema → stringify → upload
  * `[✅]` `file_manager.ts`
    * `[✅]` Add construction rationale comment explaining why `ContextForDocument` is used instead of a primitive record, and how `content_to_include` maps to the schema fill walk
    * `[✅]` Add optional `expectedSchema?: ContextForDocument` parameter to `assembleAndSaveFinalDocument` (line 684-686)
    * `[✅]` Remove inline `mergeObjects` helper (lines 752-769) — this logic is now inside `assembleChunks`
    * `[✅]` Replace Phase 2 (lines 774-797) and Phase 3 (lines 799-840) with a single call to `assembleChunks`:
      * `[✅]` Collect `downloadedChunks.map(d => d.text)` into a `string[]`
      * `[✅]` Call `assembleChunks(assembleChunksDeps, assembleChunksParams, { chunks })`
      * `[✅]` If result is `AssembleChunksError`, throw with descriptive error including chunk IDs and paths
      * `[✅]` If result is `AssembleChunksSuccess`, set `mergedObject = result.mergedObject`
    * `[✅]` After merge (line 846 equivalent), before upload: if `expectedSchema` is provided, walk `mergedObject` against `expectedSchema.content_to_include` (typed as `ContentToInclude`):
      * `[✅]` For each key in `content_to_include`: if key is missing in `mergedObject`, or value is `""`, or value is `[]`, set `mergedObject[key] = "[Continuation limit reached — value not generated]"`
      * `[✅]` If `content_to_include` value is a nested `ContentToInclude` and merged value is also an object, recurse
      * `[✅]` If `content_to_include` value is a nested `ContentToInclude` and merged value is missing/empty, set entire nested object with placeholders
    * `[✅]` All other logic (download chunks, path construction, render check, upload, is_latest_edit update) remains unchanged
  * `[✅]` integration/`file_manager.assembleChunks.integration.test.ts`
    * `[✅]` **Boundary**: `assembleAndSaveFinalDocument` (service) → real `assembleChunks` (domain utility) → real `sanitizeJsonContent` (infrastructure utility). Real Supabase storage for chunk download and final upload. Mocked: nothing within this boundary — the point is to prove the real `assembleChunks` produces identical results to the replaced Phase 2/3 inline code.
    * `[✅]` **Fixture setup** (follows existing `file_manager.assemble.integration.test.ts` pattern):
      * `[✅]` `initializeSupabaseAdminClient()` → `setSharedAdminClient()` → `initializeTestDeps()`
      * `[✅]` `coreCreateAndSetupTestUser()` for auth/JWT; `coreEnsureTestUserAndWallet()` for wallet
      * `[✅]` `createUniqueProjectAndSession()` helper per test for isolation
      * `[✅]` Per-test helper `createContinuationChain(chunks: { content: string, type: 'raw' | 'parseable_with_metadata' | 'structurally_fixed' }[])`: inserts a root `dialectic_contributions` row, then N continuation rows each with `target_contribution_id` pointing to the previous; uploads each chunk's content string to Supabase storage at the contribution's `storage_path/file_name`; returns the root contribution ID
    * `[✅]` **Test: raw-only chain** — 3 chunks of raw truncated JSON (e.g., `'{"executive_summary":"The project'`, `' aims to deliver'`, `' value to stakeholders"}'`). Call `assembleAndSaveFinalDocument(rootId)`. Download the final assembled file from storage. Assert: parsed content equals `{ "executive_summary": "The project aims to deliver value to stakeholders" }`. Assert: `is_latest_edit` is `true` on the final contribution, `false` on all intermediaries.
    * `[✅]` **Test: parseable-only chain** — 3 chunks of valid JSON, chunk 1 has `continuation_needed: true` and `resume_cursor` metadata, chunk 2 has `continuation_needed: true`, chunk 3 has no metadata. Call `assembleAndSaveFinalDocument(rootId)`. Assert: merged object contains all content keys from all 3 chunks deep-merged. Assert: no `continuation_needed`, `stop_reason`, or `resume_cursor` keys in the final document (metadata stripped).
    * `[✅]` **Test: mixed chain** — chunk 1 is raw truncated JSON, chunk 2 is valid JSON with `continuation_needed: true`, chunk 3 is raw truncated JSON. Call `assembleAndSaveFinalDocument(rootId)`. Assert: raw groups are sanitized, parseable chunk is merged, final document contains content from all 3 chunks in order. Assert: string `content` fields from adjacent chunks are concatenated (not overwritten).
    * `[✅]` **Test: expectedSchema fill** — 2-chunk parseable chain that produces a merged object missing keys defined in a `ContextForDocument` fixture. Call `assembleAndSaveFinalDocument(rootId, expectedSchema)`. Assert: missing keys are filled with `"[Continuation limit reached — value not generated]"`. Assert: existing keys with real values are NOT overwritten.
    * `[✅]` **Test: no expectedSchema (normal path)** — same 2-chunk chain, call without `expectedSchema`. Assert: missing keys remain absent (no fill logic). Assert: behavior identical to pre-refactor — this is the parity proof.
    * `[✅]` **Cleanup**: `cleanupProjectAndSession()` per test in `finally` block; `coreCleanupTestResources()` in `afterAll`
  * `[✅]` `directionality`
    * `[✅]` Layer: application (service)
    * `[✅]` All dependencies are inward-facing: `assembleChunks` (domain utility), sanitizer (infrastructure), guards (domain), Supabase client (infrastructure)
    * `[✅]` Provides are outward-facing: consumed by `executeModelCallAndSave` (worker layer) which calls `assembleAndSaveFinalDocument`
  * `[✅]` `requirements`
    * `[✅]` (Fix 2) When `expectedSchema` is provided, missing/empty keys are filled with `"[Continuation limit reached — value not generated]"` before upload
    * `[✅]` (Fix 2) When `expectedSchema` is not provided, behavior is identical to current — no fill logic runs
    * `[✅]` (Fix 2) Fill is recursive for nested objects
    * `[✅]` (Fix 3.1) Phase 2/3 replacement produces identical merge results for all existing test cases
    * `[✅]` (Fix 3.1) Inline `mergeObjects` is removed — single source of truth is now `assembleChunks`
    * `[✅]` (Fix 3.1) Integration proof sequence: after refactoring Phase 2/3 to use `assembleChunks`, run `file_manager.assemble.test.ts` with the real `assembleChunks` wired in (not mock) to prove merge logic parity with the replaced inline code. Only after all existing tests pass against the real implementation, insert the `assembleChunks` mock for ongoing unit test isolation. This sequence is mandatory — the parity proof must precede mocking.
    * `[✅]` (Fix 3.1) Dedicated integration test in this node (`file_manager.assembleChunks.integration.test.ts`) — prevents merge logic regression after unit tests are mocked
    * `[✅]` All existing tests continue to pass — refactor is implementation-only

## Node 8

* `[✅]` [BE] `supabase/functions/dialectic-worker/processSimpleJob` **Route structured messages into conversationHistory for continuation path**
  * `[✅]` `objective`
    * `[✅]` When `assembled.messages` is present (continuation path from Node 6), populate `conversationHistory` from the first two messages (seed prompt + assembled assistant content) and set `currentUserPrompt` to the third (continuation instruction)
    * `[✅]` When `assembled.messages` is absent (non-continuation path), existing behavior is completely unchanged — `conversationHistory` stays empty, `currentUserPrompt` is `assembled.promptContent`
    * `[✅]` This is the critical routing change that makes the model receive a proper 3-message conversation instead of one giant undifferentiated user message
  * `[✅]` `role`
    * `[✅]` Application — worker-level job orchestration
  * `[✅]` `module`
    * `[✅]` Dialectic worker — prompt construction payload routing
    * `[✅]` Boundary: receives `AssembledPrompt` from the prompt assembler and routes its content into `PromptConstructionPayload` for `executeModelCallAndSave`
  * `[✅]` `deps`
    * `[✅]` `AssembledPrompt` from `prompt-assembler.interface.ts` — now has optional `messages?: Messages[]` (added in Node 6)
    * `[✅]` `PromptConstructionPayload` from `dialectic.interface.ts` (line 1521-1528) — `{ conversationHistory: Messages[], currentUserPrompt: Prompt, ... }`
    * `[✅]` `Messages` from `_shared/types.ts` (line 395-400) — domain type
    * `[✅]` `isAssembledPromptWithMessages` guard from Node 6 — narrows `AssembledPrompt` to confirm `messages` is present
    * `[✅]` No reverse dependency introduced — `processSimpleJob` consumes `AssembledPrompt` (inward-facing)
  * `[✅]` `context_slice`
    * `[✅]` From `AssembledPrompt`: `{ promptContent: string; source_prompt_resource_id: string; messages?: Messages[]; }`
    * `[✅]` From `PromptConstructionPayload`: `{ conversationHistory: Messages[]; currentUserPrompt: Prompt; ... }`
    * `[✅]` The routing logic only reads `assembled.messages` and writes to `conversationHistory` + `currentUserPrompt` — no other fields touched
  * `[✅]` interface/ — no new interface types needed for this node; `AssembledPrompt` and `PromptConstructionPayload` already exist and are sufficient
  * `[✅]` interface/tests/ — no new type contracts needed; the `AssembledPrompt.messages` contract is covered in Node 6
  * `[✅]` interface/guards/ — no new guards needed; `isAssembledPromptWithMessages` from Node 6 is used
  * `[✅]` unit/`processSimpleJob.test.ts`
    * `[✅]` Test: when `assembled.messages` is present with 3 messages, `conversationHistory` contains the first two messages (seed prompt user message + assembled assistant message) and `currentUserPrompt` is the third message content (continuation instruction)
    * `[✅]` Test: when `assembled.messages` is absent, `conversationHistory` is empty and `currentUserPrompt` is `assembled.promptContent` — existing behavior unchanged
    * `[✅]` Test: when `assembled.messages` is present, `source_prompt_resource_id` is still populated from `assembled.source_prompt_resource_id` — no regression
    * `[✅]` Test: the `executeModelCallAndSave` call receives the correctly routed `promptConstructionPayload` in both continuation and non-continuation paths
  * `[✅]` `construction`
    * `[✅]` `processSimpleJob` is an existing function — no signature change
    * `[✅]` The routing logic is a conditional block inserted between the `assembled` assignment (line 294) and the `promptConstructionPayload` construction (line 296)
    * `[✅]` No new objects constructed — the existing `conversationHistory` array (line 126) and `currentUserPrompt` field are populated differently based on the presence of `assembled.messages`
  * `[✅]` `processSimpleJob.ts`
    * `[✅]` Add construction rationale comment explaining the conditional routing: why `conversationHistory` is populated only when structured messages are present, and why this preserves backward compatibility for non-continuation paths
    * `[✅]` After `const assembled = await ctx.promptAssembler.assemble(assembleOptions)` (line 294):
      * `[✅]` Check if `assembled.messages` is present and is a non-empty array (use `isAssembledPromptWithMessages` guard or inline check)
      * `[✅]` If present: push `assembled.messages[0]` (seed prompt, role: user) and `assembled.messages[1]` (assembled content, role: assistant) into `conversationHistory`; set `currentUserPrompt` to `assembled.messages[2].content` (continuation instruction)
      * `[✅]` If absent: existing behavior — `currentUserPrompt = assembled.promptContent`, `conversationHistory` stays empty
    * `[✅]` Update the `promptConstructionPayload` construction (lines 296-301) to use the conditionally-set values:
      * `[✅]` `conversationHistory` already declared at line 126 — just push into it when messages are present
      * `[✅]` `currentUserPrompt` is either `assembled.messages[2].content` (continuation) or `assembled.promptContent` (non-continuation)
    * `[✅]` No other lines of the function are modified
    * `[✅]` `executeModelCallAndSave` already correctly maps `conversationHistory` → `ChatApiRequest.messages` and `currentUserPrompt` → `ChatApiRequest.message` — no changes needed downstream
  * `[✅]` `directionality`
    * `[✅]` Layer: application (worker)
    * `[✅]` All dependencies are inward-facing: `AssembledPrompt` (domain type from prompt assembler), `PromptConstructionPayload` (domain type), `Messages` (domain type), guard (domain)
    * `[✅]` Provides are outward-facing: the populated `promptConstructionPayload` is consumed by `executeModelCallAndSave` (same layer, lateral)
  * `[✅]` `requirements`
    * `[✅]` When continuation messages are present, the model receives a 3-message conversation: user (seed), assistant (assembled content), user (continuation instruction)
    * `[✅]` When continuation messages are absent, the model receives a single user message (existing behavior) — no regression
    * `[✅]` `conversationHistory` flows through to `ChatApiRequest.messages` and `currentUserPrompt` flows through to `ChatApiRequest.message` — the existing downstream mapping in `executeModelCallAndSave` handles this correctly without changes
    * `[✅]` This is the fix that eliminates the progressive degradation described in Defect 3a — the model can now distinguish its own prior output from new instructions

## Node 9

* `[✅]` [BE] `supabase/functions/dialectic-worker/executeModelCallAndSave` **Handle continuation-limit-reached, structurally-fixed trigger, and missing-keys trigger**
  * `[✅]` `objective`
    * `[✅]` (Fix 2) After `continueJob` returns, check for `continueResult.reason === 'continuation_limit_reached'`: log a warning, set `modelProcessingResult.status` to `'continuation_limit_reached'`, and call `assembleAndSaveFinalDocument(rootIdFromSaved, expectedSchema)` passing the matching `ContextForDocument` from `context_for_documents` — treating continuation-limit-reached as a final chunk that triggers the existing assembly path with schema fill
    * `[✅]` (Fix 3.4) After sanitization succeeds with `wasStructurallyFixed === true`: if `continueUntilComplete` is set, override `shouldContinue = true` — the response was truncated and the sanitizer repaired it, so it is not a complete response
    * `[✅]` (Fix 3.5) After successful parse with `finish_reason === 'stop'` and no content-level continuation flags: compare the parsed object's keys against `context_for_documents` from the job payload. If required keys are missing, set `shouldContinue = true`
  * `[✅]` `role`
    * `[✅]` Application — worker-level model call execution and continuation orchestration
  * `[✅]` `module`
    * `[✅]` Dialectic worker — model response processing and continuation decision logic
    * `[✅]` Boundary: receives model responses, determines continuation needs, triggers assembly when done
  * `[✅]` `deps`
    * `[✅]` `continueJob` from Node 3 — now returns `IContinueJobResult` with optional `reason: 'continuation_limit_reached'`
    * `[✅]` `isContinuationLimitReached` guard from Node 3 — narrows `IContinueJobResult` to confirm cap-hit
    * `[✅]` `assembleAndSaveFinalDocument` from Node 7 — now accepts optional `expectedSchema?: ContextForDocument` parameter
    * `[✅]` `ModelProcessingResult` from Node 3 — status union now includes `'continuation_limit_reached'`
    * `[✅]` `DialecticExecuteJobPayload.context_for_documents` — `ContextForDocument[]` defining expected document schema
    * `[✅]` `sanitizeJsonContent` / `JsonSanitizationResult` — already used, `wasStructurallyFixed` flag now acted upon
    * `[✅]` `isRecord` from type guards — already used for parsed content checks
    * `[✅]` No reverse dependency introduced
  * `[✅]` `context_slice`
    * `[✅]` From `continueJob`: `IContinueJobResult` with `{ enqueued: boolean; error?: Error; reason?: string; }`
    * `[✅]` From `assembleAndSaveFinalDocument`: `(rootContributionId: string, expectedSchema?: ContextForDocument) => Promise<{ finalPath: string | null; error: Error | null; }>`
    * `[✅]` From `job.payload.context_for_documents`: `ContextForDocument[]` — each entry has `document_key` and `content_to_include` defining expected keys
    * `[✅]` From `sanitizationResult`: `{ wasStructurallyFixed: boolean; ... }` — already available after sanitization
    * `[✅]` Injection shape: all dependencies already injected via `deps` parameter — no new injection points needed
  * `[✅]` interface/ — no new interface types needed for this node; all types modified in Nodes 3 and 7 are consumed here
  * `[✅]` interface/tests/ — no new type contracts needed; contracts for `IContinueJobResult.reason` and `ModelProcessingResult.status` covered in Node 3
  * `[✅]` interface/guards/ — no new guards needed; `isContinuationLimitReached` from Node 3 is used
  * `[✅]` unit/`executeModelCallAndSave.continuationCount.test.ts`
    * `[✅]` Test: when `continueResult.reason === 'continuation_limit_reached'`, `modelProcessingResult.status` is set to `'continuation_limit_reached'`
    * `[✅]` Test: when `continueResult.reason === 'continuation_limit_reached'`, `assembleAndSaveFinalDocument` is called with `rootIdFromSaved` and `expectedSchema` from `context_for_documents`
    * `[✅]` Test: when `continueResult.reason === 'continuation_limit_reached'` but `rootIdFromSaved` is null or equals `contribution.id` (single chunk), `assembleAndSaveFinalDocument` is NOT called — no assembly needed for single-chunk artifacts
    * `[✅]` Test: when `continueResult.enqueued === true` (normal continuation), `assembleAndSaveFinalDocument` is NOT called and status is `'needs_continuation'` — existing behavior preserved
    * `[✅]` Test: when `continueResult.enqueued === false` with no reason (continueUntilComplete is false), `assembleAndSaveFinalDocument` is NOT called and status is `'completed'` — existing behavior preserved
  * `[✅]` unit/`executeModelCallAndSave.continue.test.ts`
    * `[✅]` Test: (Fix 3.4) when `sanitizationResult.wasStructurallyFixed === true` and `job.payload.continueUntilComplete === true`, `shouldContinue` is set to `true` even if `finish_reason` was not a continuation reason
    * `[✅]` Test: (Fix 3.4) when `sanitizationResult.wasStructurallyFixed === true` but `job.payload.continueUntilComplete === false`, `shouldContinue` is NOT overridden — structural fix is logged but not acted upon (same as current behavior for non-continuation jobs)
    * `[✅]` Test: (Fix 3.4) when `sanitizationResult.wasStructurallyFixed === false` and `job.payload.continueUntilComplete === true`, `shouldContinue` is not changed by the structural fix check — only the existing continuation logic applies
    * `[✅]` Test: (Fix 3.5) when `finish_reason === 'stop'`, no content-level flags, but parsed object is missing keys defined in `context_for_documents`, `shouldContinue` is set to `true`
    * `[✅]` Test: (Fix 3.5) when `finish_reason === 'stop'`, no content-level flags, and parsed object has all keys from `context_for_documents`, `shouldContinue` remains `false` — normal completion
    * `[✅]` Test: (Fix 3.5) when `context_for_documents` is not present in job payload, missing-key check is skipped — `shouldContinue` determined by existing logic only
    * `[✅]` Test: (Fix 3.5) when `finish_reason === 'stop'`, content-level flags ARE present (e.g., `continuation_needed: true`), `shouldContinue` is already `true` from flag check — missing-key check is not needed (but is harmless if it runs)
  * `[✅]` `construction`
    * `[✅]` `executeModelCallAndSave` is an existing function — no signature change
    * `[✅]` Fix 3.4 logic is inserted after sanitization (after line 1139), before the content-level flag check
    * `[✅]` Fix 3.5 logic is inserted after the content-level flag check (after line 1176), before `needsContinuation` is computed
    * `[✅]` Fix 2 logic is inserted after `continueResult` handling (after line 1839), before the `isFinalChunk` block
    * `[✅]` No new functions created — all three fixes are conditional blocks added to the existing function flow
  * `[✅]` `executeModelCallAndSave.ts`
    * `[✅]` Add construction rationale comment explaining the three new continuation triggers (structural fix, missing keys, continuation limit) and why each uses `ContextForDocument` / `ContentToInclude` instead of primitive records for schema comparison
    * `[✅]` (Fix 3.4) After sanitization logging (line 1139): add conditional block:
      * `[✅]` `if (sanitizationResult.wasStructurallyFixed && job.payload.continueUntilComplete && !shouldContinue)`
      * `[✅]` Log warning: `'[executeModelCallAndSave] Response was structurally fixed by sanitizer — treating as truncated, triggering continuation'`
      * `[✅]` Set `shouldContinue = true`
    * `[✅]` (Fix 3.5) After content-level flag check (line 1176): add conditional block:
      * `[✅]` Only run if `!shouldContinue && isRecord(parsedContent) && job.payload.continueUntilComplete`
      * `[✅]` Find the matching `ContextForDocument` from `job.payload.context_for_documents` by matching `document_key` to the current document's file type; compare parsed object keys against `matchedDoc.content_to_include` (typed as `ContentToInclude`)
      * `[✅]` If any expected keys are missing from `parsedContent`, log warning listing missing keys and set `shouldContinue = true`
    * `[✅]` (Fix 2) After `continueResult.error` check (line 1839): add conditional block:
      * `[✅]` `if (continueResult.enqueued === false && continueResult.reason === 'continuation_limit_reached')` (or use `isContinuationLimitReached` guard)
      * `[✅]` Log warning: `'[executeModelCallAndSave] Continuation limit reached for job — triggering final assembly with schema fill'`
      * `[✅]` Set `modelProcessingResult.status = 'continuation_limit_reached'`
      * `[✅]` Find the matching `ContextForDocument` from `job.payload.context_for_documents` by matching `document_key` to the current document's file type — pass the typed `ContextForDocument` directly, no conversion
      * `[✅]` If `rootIdFromSaved && rootIdFromSaved !== contribution.id && !shouldRender`: call `await deps.fileManager.assembleAndSaveFinalDocument(rootIdFromSaved, matchedContextForDocument)`
    * `[✅]` Update `ModelProcessingResult` construction (line 1818-1823): the status ternary `needsContinuation ? 'needs_continuation' : 'completed'` remains as-is — the Fix 2 block overrides `status` to `'continuation_limit_reached'` after construction when the cap is hit
  * `[✅]` `directionality`
    * `[✅]` Layer: application (worker)
    * `[✅]` All dependencies are inward-facing: `continueJob` (same layer, lateral), `assembleAndSaveFinalDocument` (service layer), interface types (domain), guards (domain), sanitizer (infrastructure)
    * `[✅]` Provides are outward-facing: `ModelProcessingResult` consumed by `processSimpleJob` (same layer) and job completion logic
  * `[✅]` `requirements`
    * `[✅]` (Fix 2) When continuation limit is reached, final document assembly runs with schema fill — fragments are not left unmerged
    * `[✅]` (Fix 2) `ModelProcessingResult.status` is `'continuation_limit_reached'` — distinguishable from `'completed'` and `'needs_continuation'`
    * `[✅]` (Fix 3.4) Structurally-fixed responses trigger continuation when `continueUntilComplete` is set — truncated responses from stream failures are no longer silently accepted as complete
    * `[✅]` (Fix 3.5) Missing expected keys trigger continuation when `continueUntilComplete` is set — semantically incomplete responses are no longer accepted as complete
    * `[✅]` All existing continuation logic (provider-level explicit, content-level explicit) is preserved — the new triggers are additive
    * `[✅]` Non-continuation jobs (`continueUntilComplete` is false) are completely unaffected by Fix 3.4 and Fix 3.5
  * `[✅]` integration/`continuation_prompt_assembly.integration.test.ts`
    * `[✅]` **Boundary**: Full continuation prompt pipeline from chunk storage through to the `ChatApiRequest` payload that would be sent to the model. Real code paths: `assembleChunks` → `gatherContinuationInputs` → `assembleContinuationPrompt` → `processSimpleJob` routing → `executeModelCallAndSave` payload construction. Mocked: `callUnifiedAIModel` (intercepted to capture the `ChatApiRequest` it receives and return a fixed response), `tokenWalletService`, `ragService`. Real: Supabase storage, database, `FileManagerService`, `PromptAssembler`, `continueJob`, `retryJob`.
    * `[✅]` **Fixture setup** (follows existing `continuation_dispatch.integration.test.ts` pattern):
      * `[✅]` `initializeSupabaseAdminClient()` → `setSharedAdminClient()` → `initializeTestDeps()`
      * `[✅]` `coreCreateAndSetupTestUser()` for auth/JWT; `coreEnsureTestUserAndWallet()` with 1M token balance
      * `[✅]` Fetch or create test AI model in `ai_providers` with `MOCK_MODEL_CONFIG`
      * `[✅]` `createUniqueProjectAndSession()` helper for isolation
      * `[✅]` Create a seed prompt resource in `dialectic_project_resources` with `resource_type: 'seed_prompt'` containing the original instruction text
      * `[✅]` Create a continuation chain of 3 contributions in the database with mixed chunk types:
        * `[✅]` Chunk 0 (root): raw truncated JSON uploaded to storage — `'{"executive_summary":"The project aims to'` — simulates provider-level `finish_reason: 'length'` truncation
        * `[✅]` Chunk 1: valid JSON with continuation metadata uploaded to storage — `'{"executive_summary":" deliver value","methodology":"Agile","continuation_needed":true,"resume_cursor":{"document_key":"methodology","section_id":"overview"}}'` — simulates content-level explicit continuation
        * `[✅]` Chunk 2: valid JSON without metadata uploaded to storage — `'{"methodology":" framework with iterative sprints","timeline":"6 months"}'` — simulates a normal completion chunk
        * `[✅]` Each chunk's contribution row has `target_contribution_id` linking to the previous, `continuation_count` incrementing
      * `[✅]` Create an EXECUTE job row in `dialectic_generation_jobs` with `status: 'processing'`, `payload` containing `continueUntilComplete: true`, `continuation_count: 3`, and `context_for_documents` defining `executive_summary`, `methodology`, `timeline`, and `budget` as expected keys
      * `[✅]` Wire `executeModelCallAndSave` deps with a `callUnifiedAIModel` mock that captures the `ChatApiRequest` argument into a test-accessible variable before returning a fixed `UnifiedAIResponse`
    * `[✅]` **Test: 3-message conversation structure reaches the model** — Run `processSimpleJob` (or the continuation assembly path that feeds into `executeModelCallAndSave`) with the fixture job and continuation chain. Inspect the captured `ChatApiRequest`. Assert:
      * `[✅]` `ChatApiRequest.messages` has exactly 2 entries: one `user` message (seed prompt) and one `assistant` message (assembled content)
      * `[✅]` The `user` message content matches the seed prompt text from `dialectic_project_resources`
      * `[✅]` The `assistant` message content is a JSON string that, when parsed, contains the deep-merged content from all 3 chunks: `executive_summary` is the concatenation `"The project aims to deliver value"`, `methodology` is `"Agile framework with iterative sprints"`, `timeline` is `"6 months"`
      * `[✅]` No `continuation_needed`, `stop_reason`, or `resume_cursor` keys exist in the assembled assistant content
      * `[✅]` `ChatApiRequest.message` (the current user prompt) is a continuation instruction string, NOT a flattened blob of all messages — it does not contain the seed prompt text or the assembled JSON content
    * `[✅]` **Test: continuation instruction is context-aware** — Same fixture, inspect the captured `ChatApiRequest.message`. Assert: the continuation instruction references the missing `budget` key (present in `context_for_documents` but absent from the assembled object). The instruction tells the model to generate content for `budget` without repeating existing keys.
    * `[✅]` **Test: mixed chunk types are correctly assembled** — Same fixture, but verify the assembly path specifically. Assert: chunk 0 (raw) was sanitized before merge, chunk 1 (parseable with metadata) had metadata stripped, chunk 2 (parseable without metadata) was merged as-is. The final assembled object in the assistant message is a valid, coherent JSON object — not a concatenation of raw strings or a blob with duplicate keys.
    * `[✅]` **Test: non-continuation path is unaffected** — Create a job without `assembled.messages` (non-continuation, normal seed prompt). Run through the same `processSimpleJob` path. Assert: `ChatApiRequest.messages` is empty (no conversation history), `ChatApiRequest.message` is the assembled prompt content. Existing behavior preserved.
    * `[✅]` **Cleanup**: `cleanupProjectAndSession()` per test in `finally` block; `coreCleanupTestResources()` in `afterAll`
  * `[✅]` **Commit** `fix: continuation-to-retry bug — preserve error details, fix prompt assembly, add continuation triggers`
    * `[✅]` Node 1: New migration preserving error details in retry-exhausted trigger
    * `[✅]` Node 2: New shared `assembleChunks/` utility with interface, guards, tests, mock, provides
    * `[✅]` Node 3: `continueJob` returns distinguishable result on cap hit; `IContinueJobResult.reason` and `ModelProcessingResult.status` updated; duplicate `ModelProcessingResult` deleted; guards moved to `type_guards.modelProcessingResult.ts`
    * `[✅]` Node 4: `gatherContinuationInputs` returns 3-message structure with context-aware continuation instruction using `ContextForDocument`; old `GatherContinuationInputsFn` type removed
    * `[✅]` Node 5: `prompt-assembler` facade updated to use new `GatherContinuationInputsSignature` DI type
    * `[✅]` Node 6: `assembleContinuationPrompt` propagates structured messages; `AssembledPrompt.messages` added
    * `[✅]` Node 7: `file_manager.assembleAndSaveFinalDocument` gains `expectedSchema?: ContextForDocument` parameter; Phase 2/3 refactored to use `assembleChunks`; integration test proves merge parity
    * `[✅]` Node 8: `processSimpleJob` routes structured messages into `conversationHistory` + `currentUserPrompt`
    * `[✅]` Node 9: `executeModelCallAndSave` handles continuation-limit-reached, structurally-fixed trigger, missing-keys trigger; continuation pipeline integration test proves 3-message structure reaches the model

---

## Fix 4: Session Context Desync Guard — Prevent UI Crash During Navigation

### Problem

When navigating to a session page (after `startDialecticSession` or via deep-link/refresh), `fetchDialecticProjectDetails` resets `activeContextSessionId` to `null` (line 497 of `dialecticStore.ts`). `StageTabCard` throws `"Unified progress required"` because it reads `selectActiveContextSessionId` as `null`, producing a `null` unified progress object that it then dereferences.

Two flows produce this desync:

1. **Post-start navigation:** `startDialecticSession` calls `fetchDialecticProjectDetails(successData.project_id)` without `preserveContext: true` → context reset to `sessionId: null` → caller navigates → `DialecticSessionDetailsPage` mounts → deep-link `useEffect` calls `activateProjectAndSessionContextForDeepLink` → which calls `fetchDialecticProjectDetails` again → context reset to `sessionId: null` again → `fetchAndSetCurrentSessionDetails` finally sets the correct ID.

2. **Deep-link / browser refresh:** `activateProjectAndSessionContextForDeepLink` calls `fetchDialecticProjectDetails(projectId)` without `preserveContext: true` → context reset to `sessionId: null` → `fetchAndSetCurrentSessionDetails` eventually corrects it.

Between the reset and the correction, the store has `activeContextSessionId: null` while `activeSessionDetail` may still reference a prior session, and components that assume alignment crash.

### Solution

Four defense-in-depth guards:

**Option A — Set context at end of `startDialecticSession`:** After `fetchDialecticProjectDetails` completes at line 767, explicitly call `setActiveDialecticContext({ projectId: successData.project_id, sessionId: successData.id, stage: null })`. The project fetch runs normally, then the caller immediately sets the correct session context.

**Option B — Set context in `activateProjectAndSessionContextForDeepLink` after project fetch:** After `fetchDialecticProjectDetails(projectId)` completes at line 3103, explicitly call `setActiveDialecticContext({ projectId, sessionId, stage: null })`. Both values are already available as function parameters.

**Option C — Clear `activeSessionDetail` when session context is cleared:** When `setActiveDialecticContext` receives `sessionId: null`, also set `activeSessionDetail: null` and `activeSessionDetailError: null`. This maintains the invariant that session detail is never present without a matching session context.

**Option D — UI gate on `sessionContextReady`:** Derive a boolean requiring `activeContextProjectId === urlProjectId && activeContextSessionId === urlSessionId && activeSessionDetail?.id === urlSessionId && !isLoadingProject && !isLoadingSession`. Do not render session-scoped chrome until this is true; show a loading skeleton instead.

### Files to Touch

| File | Change | Tests |
|---|---|---|
| `packages/store/src/dialecticStore.ts` | (A) In `startDialecticSession`, after line 767 project refetch, call `setActiveDialecticContext` with the new session ID. (B) In `activateProjectAndSessionContextForDeepLink`, after line 3103 project fetch, call `setActiveDialecticContext` with the target `projectId` and `sessionId`. (C) In `setActiveDialecticContext`, when `context.sessionId === null`, also set `activeSessionDetail: null` and `activeSessionDetailError: null`. | Update `dialecticStore.session.test.ts` |
| `apps/web/src/pages/DialecticSessionDetailsPage.tsx` | (D) Derive `sessionContextReady` from URL params + store state. Replace the existing `isLoading` gate with `!sessionContextReady` → skeleton. Preserve error gates. Session chrome only renders when ready. | Update `DialecticSessionDetailsPage.test.tsx` |

### Files Confirmed No Change Needed

| File | Reason |
|---|---|
| `packages/store/src/dialecticStore.selectors.ts` | No new selectors required; existing `selectActiveContextSessionId` is sufficient. |
| `apps/web/src/components/dialectic/StageTabCard.tsx` | The crash is caused by bad input state, not a defect in `StageTabCard`. The fix prevents the bad state from reaching the component. |
| Existing `preserveContext: true` callers (lines 825, 1575, 2060, 2239) | These paths already manage context explicitly and do not flow through the modified code. |

### Checklist

*   `[✅]` packages/store/src/`dialecticStore` **Eliminate transient null-session context during navigation and deep-link hydration**
    *   `[✅]` `objective`
        *   `[✅]` After `startDialecticSession` completes and refetches project details, the store must have `activeContextSessionId` set to the newly created session ID before the function returns — preventing a null-context window when the caller navigates
        *   `[✅]` After `activateProjectAndSessionContextForDeepLink` fetches project details, the store must have `activeContextSessionId` set to the target `sessionId` parameter before `fetchAndSetCurrentSessionDetails` runs — preventing a null-context window during deep-link hydration
        *   `[✅]` Whenever `setActiveDialecticContext` receives `sessionId: null`, it must also clear `activeSessionDetail` and `activeSessionDetailError` to maintain the invariant that session detail is never present without a matching session context
    *   `[✅]` `role`
        *   `[✅]` State management (store layer) — these actions govern the authoritative session context that all downstream UI consumers depend on
    *   `[✅]` `module`
        *   `[✅]` Dialectic store — session context lifecycle
        *   `[✅]` Boundary: state transitions for `activeContextSessionId`, `activeSessionDetail`, `activeSessionDetailError` during navigation and hydration flows
    *   `[✅]` `deps`
        *   `[✅]` `api.dialectic().getProjectDetails` — adapter layer, fetched within `fetchDialecticProjectDetails` (existing, no change)
        *   `[✅]` `api.dialectic().startSession` — adapter layer, fetched within `startDialecticSession` (existing, no change)
        *   `[✅]` `setActiveDialecticContext` — internal store action, called by `startDialecticSession` and `activateProjectAndSessionContextForDeepLink` (modified in this node)
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `startDialecticSession` requires access to `successData.project_id` and `successData.id` after the API call succeeds — both are already available at line 767
        *   `[✅]` `activateProjectAndSessionContextForDeepLink` requires its own `projectId` and `sessionId` parameters — both are already function arguments at line 3083-3085
        *   `[✅]` `setActiveDialecticContext` requires access to `activeSessionDetail` and `activeSessionDetailError` in the store state — already accessible via `set()`
        *   `[✅]` No new injections or concrete imports required
    *   `[✅]` unit/`dialecticStore.session.test.ts`
        *   `[✅]` Test: `startDialecticSession` — after success, `activeContextSessionId` equals the returned session ID (not null)
        *   `[✅]` Test: `startDialecticSession` — after success, `activeContextProjectId` equals the returned project ID
        *   `[✅]` Test: `activateProjectAndSessionContextForDeepLink` — after project fetch completes but before session fetch, `activeContextSessionId` equals the target `sessionId` parameter (not null)
        *   `[✅]` Test: `setActiveDialecticContext({ projectId: 'x', sessionId: null, stage: null })` — `activeSessionDetail` is set to null
        *   `[✅]` Test: `setActiveDialecticContext({ projectId: 'x', sessionId: null, stage: null })` — `activeSessionDetailError` is set to null
        *   `[✅]` Test: `setActiveDialecticContext({ projectId: 'x', sessionId: 'y', stage: null })` — `activeSessionDetail` is NOT cleared (only cleared when sessionId is null)
    *   `[✅]` `dialecticStore.ts`
        *   `[✅]` **Option A** — In `startDialecticSession`, after `await get().fetchDialecticProjectDetails(successData.project_id)` at line 767, add: `get().setActiveDialecticContext({ projectId: successData.project_id, sessionId: successData.id, stage: null })`
        *   `[✅]` **Option B** — In `activateProjectAndSessionContextForDeepLink`, after `await state.fetchDialecticProjectDetails(projectId)` at line 3103, add: `get().setActiveDialecticContext({ projectId, sessionId, stage: null })`
        *   `[✅]` **Option C** — In `setActiveDialecticContext` (lines 2511-2524), add: when `context.sessionId === null`, also set `activeSessionDetail: null` and `activeSessionDetailError: null`
    *   `[✅]` `directionality`
        *   `[✅]` Store layer (state management)
        *   `[✅]` All dependencies are inward-facing (store actions calling other store actions and existing API adapters)
        *   `[✅]` All state mutations are consumed outward by UI layer via selectors
    *   `[✅]` `requirements`
        *   `[✅]` After `startDialecticSession` returns successfully, `activeContextSessionId` must equal the new session's ID
        *   `[✅]` After `activateProjectAndSessionContextForDeepLink` completes its project fetch, `activeContextSessionId` must equal the target `sessionId` — not null
        *   `[✅]` `activeSessionDetail` must never be non-null when `activeContextSessionId` is null
        *   `[✅]` Existing `preserveContext: true` callers (lines 825, 1575, 2060, 2239) are unaffected — those paths already manage context explicitly and do not flow through the modified code
        *   `[✅]` All existing store tests continue to pass

*   `[✅]` apps/web/src/pages/`DialecticSessionDetailsPage` **Gate session UI chrome on unified context readiness**
    *   `[✅]` `objective`
        *   `[✅]` No session-scoped UI components (`StageTabCard`, `SessionInfoCard`, `SessionContributionsDisplayCard`, `GenerateContributionButton`) render until the store state fully matches the URL parameters
        *   `[✅]` During the transient window where context is not yet ready, display a loading skeleton — not an error state
    *   `[✅]` `role`
        *   `[✅]` UI layer — page-level rendering contract that enforces store/URL alignment before mounting session-dependent children
    *   `[✅]` `module`
        *   `[✅]` Dialectic session details page — render gating
        *   `[✅]` Boundary: the page component's return path, between the existing loading/error checks and the session chrome render
    *   `[✅]` `deps`
        *   `[✅]` `useParams` — provides `urlProjectId` and `urlSessionId` from the route (existing, no change)
        *   `[✅]` `useDialecticStore` — provides `activeContextProjectId`, `activeContextSessionId`, `activeSessionDetail`, `isLoadingProjectDetail`, `isLoadingActiveSessionDetail` (existing selectors, no change)
        *   `[✅]` Store-level guards from prior node — provider, store layer, inward-facing, ensures context is set correctly so the readiness condition resolves to `true` promptly
        *   `[✅]` Confirm no reverse dependency is introduced
    *   `[✅]` `context_slice`
        *   `[✅]` `urlProjectId` and `urlSessionId` from `useParams` (already used at line 23-26)
        *   `[✅]` `activeContextProjectId`, `activeContextSessionId`, `activeSessionDetail` from store (already subscribed at lines 37-45)
        *   `[✅]` `isLoadingProjectDetail`, `isLoadingActiveSessionDetail` from store (already subscribed at lines 57-63)
        *   `[✅]` No new injections or concrete imports required
    *   `[✅]` unit/`DialecticSessionDetailsPage.test.tsx`
        *   `[✅]` Test: when `activeContextSessionId` does not match `urlSessionId`, skeleton loading is rendered, `StageTabCard` is not in the document
        *   `[✅]` Test: when `activeContextProjectId` does not match `urlProjectId`, skeleton loading is rendered, `StageTabCard` is not in the document
        *   `[✅]` Test: when `activeSessionDetail` is null but `activeContextSessionId` matches URL, skeleton loading is rendered
        *   `[✅]` Test: when `activeSessionDetail.id` does not match `urlSessionId`, skeleton loading is rendered
        *   `[✅]` Test: when all four conditions align (`activeContextProjectId === urlProjectId`, `activeContextSessionId === urlSessionId`, `activeSessionDetail?.id === urlSessionId`, not loading), session chrome renders normally
        *   `[✅]` Test: existing error-state rendering (projectError, sessionError) is unchanged
    *   `[✅]` `DialecticSessionDetailsPage.tsx`
        *   `[✅]` Derive `sessionContextReady` as: `activeContextProjectId === urlProjectId && activeContextSessionId === urlSessionId && activeSessionDetail?.id === urlSessionId && !isLoadingProject && !isLoadingSession`
        *   `[✅]` Replace the existing `isLoading` gate (line 121) with a check on `!sessionContextReady` — when not ready, render the existing skeleton loading UI
        *   `[✅]` Preserve the existing error gates (lines 136-153) — errors still short-circuit before the session chrome
        *   `[✅]` The existing `!activeSessionDetail` gate (line 155) remains as a fallback for the case where loading completes but session was not found
        *   `[✅]` The session chrome block (lines 174-244) only renders when `sessionContextReady` is true and `activeSessionDetail` is non-null
    *   `[✅]` integration/`DialecticSessionDetailsPage.integration.test.ts`
        *   `[✅]` Test: simulate the full `activateProjectAndSessionContextForDeepLink` flow with store — page transitions from skeleton to rendered session chrome when context aligns
        *   `[✅]` Test: simulate store desync (project fetched, session not yet fetched) — page shows skeleton, not a crash or error
    *   `[✅]` `directionality`
        *   `[✅]` UI layer
        *   `[✅]` All dependencies are inward-facing (reads from store via selectors, reads URL params from router)
        *   `[✅]` No outward-facing provides — this is a leaf page component
    *   `[✅]` `requirements`
        *   `[✅]` `StageTabCard` never mounts when `activeContextSessionId` is null or mismatched with URL
        *   `[✅]` Loading skeleton is shown during transient desync — never an error state for a transient condition
        *   `[✅]` All existing page behavior (error display, deep-link hydration, auto-start generation) is preserved
        *   `[✅]` All existing page tests continue to pass
    *   `[✅]` **Commit** `fix(store,ui): guard session context during navigation and deep-link hydration`
        *   `[✅]` `dialecticStore.ts` — `startDialecticSession` sets session context after project refetch
        *   `[✅]` `dialecticStore.ts` — `activateProjectAndSessionContextForDeepLink` sets session context after project fetch
        *   `[✅]` `dialecticStore.ts` — `setActiveDialecticContext` clears `activeSessionDetail` when `sessionId` is null
        *   `[✅]` `dialecticStore.session.test.ts` — tests for all three store-level guards
        *   `[✅]` `DialecticSessionDetailsPage.tsx` — `sessionContextReady` gate prevents session chrome rendering during desync
        *   `[✅]` `DialecticSessionDetailsPage.test.tsx` — tests for readiness gating behavior


* `[✅]` [BE] dialectic-worker/`executeModelCallAndSave` **Stop stripping identity fields from resourceDocuments before passing to adapters**
  * `[✅]` `objective`
    * `[✅]` `executeModelCallAndSave` gathers identity-rich documents via `gatherArtifacts()` returning `ResourceDocuments[number]` with `id`, `content`, `document_key`, `stage_slug`, and `type`
    * `[✅]` At line 457, it strips these to `{ id, content }` via `idContentDocs`, then at line 587 strips again in the `chatApiRequest` construction
    * `[✅]` This guarantees every adapter receives documents missing `document_key`, `stage_slug`, and `type` — making it impossible for any adapter to identify what the documents are or construct valid provider-specific payloads
    * `[✅]` The fix must pass the full `ResourceDocuments[number]` objects through to adapters without stripping identity fields
    * `[✅]` The `idContentDocs` variable and its usage at lines 457, 459, 486, 587, and 682 must be replaced with the identity-rich documents
  * `[✅]` `role`
    * `[✅]` Infrastructure — this is the execution boundary that wires gathered data to adapter consumers
  * `[✅]` `module`
    * `[✅]` dialectic-worker execution pipeline
    * `[✅]` Boundary: receives gathered artifacts from database, constructs `ChatApiRequest`, delegates to AI adapters
  * `[✅]` `deps`
    * `[✅]` `gatherArtifacts` (internal) — produces `ResourceDocuments[number]` — domain layer — provides document identity and content
    * `[✅]` `ResourceDocuments` type from `_shared/types.ts` — domain layer — defines the shape of documents passed to adapters
    * `[✅]` `ChatApiRequest` type — port layer — defines the adapter request contract
    * `[✅]` Confirm no reverse dependency is introduced
  * `[✅]` `context_slice`
    * `[✅]` Requires `ResourceDocuments` type (already imported)
    * `[✅]` Requires `ChatApiRequest` interface (already imported)
    * `[✅]` No new concrete imports required — this is a data passthrough fix
  * `[✅]` interface/`types.ts`
    * `[✅]` Verify `ResourceDocuments` type already includes `document_key`, `stage_slug`, `type` as optional fields — it does (lines 166-172 of `_shared/types.ts`)
    * `[✅]` No type changes required; the type already supports the full shape, the caller just wasn't using it
  * `[✅]` unit/`executeModelCallAndSave.test.ts`
    * `[✅]` Add test: when `gatherArtifacts` returns documents with `id`, `content`, `document_key`, `stage_slug`, `type`, the `chatApiRequest.resourceDocuments` passed to the adapter must contain all five fields
    * `[✅]` Add test: the `resourceDocuments` array must not contain any element where `document_key`, `stage_slug`, or `type` is `undefined`
    * `[✅]` Update any existing test fixtures that construct `resourceDocuments` to use the `ResourceDocuments` type, lines 1240, 1261-1269 capture logic strips to `{ id, content }`, line 1876 comment, assertions at 1306/1379-1381
  * `[✅]` unit/`executeModelCallAndSave.rag.test.ts`
    * `[✅]`  lines 84, 108, 214 capture/normalization typed as `{ id?: string; content: string }` instead of `ResourceDocuments[number]`
  * `[✅]` unit/`executeModelCallAndSave.rag2.test.ts`
    * `[✅]`  line 435 comment, assertions at 421-436
  * `[✅]` `construction`
    * `[✅]` Remove the `idContentDocs` intermediate variable (line 457) that strips identity fields
    * `[✅]` Replace all usages of `idContentDocs` with the original typed variable
    * `[✅]` The `chatApiRequest.resourceDocuments` mapping at line 587 must pass the full typed object, not `{ id: d.id, content: d.content }`
    * `[✅]` The `workingResourceDocs` at line 682 must also use the fulll typed object
    * `[✅]` Prohibited: constructing partial objects then backfilling — pass the complete objects from the start
  * `[✅]` `executeModelCallAndSave.ts`
    * `[✅]` Remove line 457: `const idContentDocs: ResourceDocuments = identityRichDocs.map(d => ({ id: d.id, content: d.content }));`
    * `[✅]` Update line 459: `const initialResourceDocuments` must reference `identityRichDocs` directly (or a properly typed copy)
    * `[✅]` Update line 587: `resourceDocuments: currentResourceDocuments` (remove the `.map((d) => ({ id: d.id, content: d.content }))` stripping)
    * `[✅]` Update line 682: `const workingResourceDocs: ResourceDocuments = [...identityRichDocs]` (or equivalent scoped source)
    * `[✅]` Verify no other location re-strips the documents before they reach adapters
  * `[✅]` `directionality`
    * `[✅]` Layer: infrastructure (execution boundary)
    * `[✅]` All dependencies are inward-facing (types, domain artifacts)
    * `[✅]` All provides are outward-facing (ChatApiRequest to adapters)
  * `[✅]` `requirements`
    * `[✅]` Every `ResourceDocuments` element reaching an adapter must contain `id`, `content`, `document_key`, `stage_slug`, and `type`
    * `[✅]` No stripping of identity fields between `gatherArtifacts` and adapter invocation
    * `[✅]` Existing compression path (lines 644-680) must continue to work identically
    * `[✅]` All existing tests must continue to pass with updated fixtures

* `[✅]` [BE] _shared/ai_service/`anthropic_adapter` **Demand valid document data or omit invalid document blocks — no fallback defaults**
  * `[✅]` `objective`
    * `[✅]` The Anthropic adapter at lines 104-110 constructs `document` content blocks using `doc.document_key ?? doc.id ?? ''` for `title` and `doc.stage_slug ?? ''` for `context`
    * `[✅]` The `?? ''` fallbacks violate application standards: they paper over missing data with values that are both semantically wrong and rejected by the Anthropic API (`context` must be at least 1 character)
    * `[✅]` The fix must validate each document before constructing a document block: if `document_key` or `stage_slug` is missing/empty, reject the document (throw) rather than silently producing an invalid API payload
    * `[✅]` Valid documents must produce a well-formed `document` content block with `title` from `document_key` and `context` from `stage_slug`
  * `[✅]` `role`
    * `[✅]` Adapter — translates domain request into Anthropic-specific API payload
  * `[✅]` `module`
    * `[✅]` AI service adapter layer
    * `[✅]` Boundary: receives `ChatApiRequest` with `resourceDocuments`, produces Anthropic `MessageParam[]`
  * `[✅]` `deps`
    * `[✅]` `ResourceDocuments` type from `_shared/types.ts` — domain layer — defines document shape
    * `[✅]` `ChatApiRequest` type — port layer — defines incoming request contract
    * `[✅]` Anthropic SDK `MessageParam` type — external dependency — defines valid content block shapes
    * `[✅]` Confirm no reverse dependency is introduced
  * `[✅]` `context_slice`
    * `[✅]` Requires `ResourceDocuments` type (already imported via `ChatApiRequest`)
    * `[✅]` Requires Anthropic SDK types (already imported)
    * `[✅]` No new imports required
  * `[✅]` interface/`types.ts`
    * `[✅]` No type changes required — the `ResourceDocuments` type already has the fields; the adapter must validate they are present at runtime
  * `[✅]` unit/`anthropic_adapter.test.ts`
    * `[✅]` Add test: when `resourceDocuments` contains a document with valid `document_key` and `stage_slug`, the adapter constructs a `document` block with `title` equal to `document_key` and `context` equal to `stage_slug`
    * `[✅]` Add test: when `resourceDocuments` contains a document where `document_key` is missing or empty string, the adapter throws an error indicating invalid document data
    * `[✅]` Add test: when `resourceDocuments` contains a document where `stage_slug` is missing or empty string, the adapter throws an error indicating invalid document data
    * `[✅]` Add test: when `resourceDocuments` is empty array, no document blocks are prepended (existing behavior preserved)
    * `[✅]` Add test: when `resourceDocuments` is undefined, no document blocks are prepended (existing behavior preserved)
    * `[✅]` Update any existing test that relies on fallback behavior to instead provide full valid document objects
  * `[✅]` `construction`
    * `[✅]` Before mapping `resourceDocuments` to document blocks, validate each element has non-empty `document_key` and `stage_slug`
    * `[✅]` If validation fails, throw a descriptive error (not silently skip, not fallback)
    * `[✅]` Construct `title` directly from `doc.document_key` and `context` directly from `doc.stage_slug` — no `??` fallbacks
    * `[✅]` Prohibited: default values, fallback strings, silent skipping of invalid documents
  * `[✅]` `anthropic_adapter.ts`
    * `[✅]` Add validation loop before document block construction (before line 105): for each doc in `request.resourceDocuments`, assert `doc.document_key` is a non-empty string and `doc.stage_slug` is a non-empty string; throw if not
    * `[✅]` Replace line 108: `title: doc.document_key` (remove `?? doc.id ?? ''`)
    * `[✅]` Replace line 109: `context: doc.stage_slug` (remove `?? ''`)
    * `[✅]` The adapter must fail fast and loud when it receives bad data, not silently produce an invalid Anthropic API request
  * `[✅]` `directionality`
    * `[✅]` Layer: adapter
    * `[✅]` All dependencies are inward-facing (types, domain request)
    * `[✅]` Provides outward-facing Anthropic API call
  * `[✅]` `requirements`
    * `[✅]` Document blocks sent to Anthropic API must have non-empty `title` and non-empty `context`
    * `[✅]` No `?? ''` or other fallback defaults in document block construction
    * `[✅]` Adapter throws a clear error if any document is missing `document_key` or `stage_slug`
    * `[✅]` Existing tests for non-document scenarios must continue to pass unchanged

* `[✅]` [BE] _shared/ai_service/`openai_adapter` **Fix max_tokens parameter selection for GPT-5+ models and demand valid document data**
  * `[✅]` `objective`
    * `[✅]` The `isOSeries` check at line 78 (`modelApiName.startsWith('gpt-4o') || modelApiName.startsWith('o')`) does not match `gpt-5.2` or any future GPT-5+ model, causing the adapter to send `max_tokens` which GPT-5.2 rejects with `400 Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.`
    * `[✅]` The parameter selection logic must be updated to correctly identify all models that require `max_completion_tokens` — GPT-5+ models require `max_completion_tokens`, not just o-series
    * `[✅]` Additionally, the document construction at lines 61-66 uses `doc.document_key ?? ''` and `doc.stage_slug ?? ''` fallback defaults that violate application standards — these must validate and reject bad data
  * `[✅]` `role`
    * `[✅]` Adapter — translates domain request into OpenAI-specific API payload
  * `[✅]` `module`
    * `[✅]` AI service adapter layer
    * `[✅]` Boundary: receives `ChatApiRequest` with `resourceDocuments`, produces OpenAI `ChatCompletionCreateParams`
  * `[✅]` `deps`
    * `[✅]` `ResourceDocuments` type from `_shared/types.ts` — domain layer — defines document shape
    * `[✅]` `ChatApiRequest` type — port layer — defines incoming request contract
    * `[✅]` OpenAI SDK types — external dependency — defines valid request parameter shapes
    * `[✅]` Confirm no reverse dependency is introduced
  * `[✅]` `context_slice`
    * `[✅]` Requires `ResourceDocuments` type (already imported via `ChatApiRequest`)
    * `[✅]` Requires OpenAI SDK types (already imported)
    * `[✅]` No new imports required
  * `[✅]` interface/`types.ts`
    * `[✅]` No type changes required
  * `[✅]` unit/`openai_adapter.test.ts`
    * `[✅]` Add test: when model is `gpt-5.2`, the request payload uses `max_completion_tokens` (not `max_tokens`)
    * `[✅]` Add test: when model is `gpt-5.2-mini` or similar GPT-5+ variant, the request payload uses `max_completion_tokens`
    * `[✅]` Add test: when model is `gpt-4o`, the request payload uses `max_completion_tokens` (existing o-series behavior preserved)
    * `[✅]` Add test: when model is `o1` or `o3`, the request payload uses `max_completion_tokens` (existing o-series behavior preserved)
    * `[✅]` Add test: when model is `gpt-4-turbo`, the request payload uses `max_tokens` (legacy behavior preserved for older models)
    * `[✅]` Add test: when `resourceDocuments` contains a document where `document_key` is missing or empty, the adapter throws an error
    * `[✅]` Add test: when `resourceDocuments` contains a document where `stage_slug` is missing or empty, the adapter throws an error
    * `[✅]` Add test: when `resourceDocuments` contains valid documents, the text label includes `document_key` and `stage_slug` correctly
    * `[✅]` Update any existing test that relies on fallback behavior to provide full valid document objects
  * `[✅]` `construction`
    * `[✅]` Rename `isOSeries` to a broader check that captures all models requiring `max_completion_tokens`: o-series (`o1`, `o3`, etc.), GPT-4o variants, and GPT-5+ models
    * `[✅]` The check must be forward-compatible — `gpt-5`, `gpt-5.2`, `gpt-6`, etc. should all route to `max_completion_tokens`
    * `[✅]` One approach: invert the logic — use `max_completion_tokens` by default and only use `max_tokens` for known legacy models (`gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo`)
    * `[✅]` Add validation before document text construction: assert `doc.document_key` and `doc.stage_slug` are non-empty strings; throw if not
    * `[✅]` Prohibited: default values, fallback strings, silent acceptance of missing identity fields
  * `[✅]` `openai_adapter.ts`
    * `[✅]` Replace the `isOSeries` check (line 78) with a `usesLegacyMaxTokens` check that identifies legacy models (`gpt-3.5-turbo*`, `gpt-4-turbo*`, `gpt-4` without `-o` suffix) — all other models get `max_completion_tokens`
    * `[✅]` Invert the conditional at lines 81-86: default to `max_completion_tokens`, only use `max_tokens` for explicitly identified legacy models
    * `[✅]` Add validation at line 61-66: before constructing doc labels, validate each document has non-empty `document_key` and `stage_slug`; throw if not
    * `[✅]` Remove `?? ''` fallbacks from the document label template string
  * `[✅]` integration/`openai_adapter.integration.test.ts`
    * `[✅]` If not already present, add integration test confirming the full flow from `executeModelCallAndSave` through `openai_adapter` sends `max_completion_tokens` for a GPT-5.2 model configuration
    * `[✅]` Add integration test confirming identity-rich `resourceDocuments` flow through to the adapter's document label construction without stripping
  * `[✅]` `directionality`
    * `[✅]` Layer: adapter
    * `[✅]` All dependencies are inward-facing (types, domain request)
    * `[✅]` Provides outward-facing OpenAI API call
  * `[✅]` `requirements`
    * `[✅]` GPT-5+ models must use `max_completion_tokens` parameter
    * `[✅]` O-series and GPT-4o models must continue to use `max_completion_tokens`
    * `[✅]` Legacy models (GPT-4-turbo, GPT-4, GPT-3.5-turbo) must continue to use `max_tokens`
    * `[✅]` The parameter selection logic must be forward-compatible for future model names
    * `[✅]` No `?? ''` or other fallback defaults in document label construction
    * `[✅]` Adapter throws a clear error if any document is missing `document_key` or `stage_slug`
    * `[✅]` All existing tests for non-document, non-max-tokens scenarios must continue to pass unchanged
  * `[✅]` **Commit** `fix(be): pass full resourceDocuments to adapters, reject invalid document data, fix OpenAI max_tokens for GPT-5+`
    * `[✅]` executeModelCallAndSave.ts — removed identity-stripping of resourceDocuments
    * `[✅]` anthropic_adapter.ts — validate document fields, remove fallback defaults, throw on bad data
    * `[✅]` openai_adapter.ts — invert max_tokens logic to default to max_completion_tokens for non-legacy models, validate document fields, remove fallback defaults
    * `[✅]` executeModelCallAndSave.test.ts — tests proving full identity fields pass through
    * `[✅]` anthropic_adapter.test.ts — tests proving validation rejects bad data, accepts good data
    * `[✅]` openai_adapter.test.ts — tests proving correct parameter selection per model, validation rejects bad data
