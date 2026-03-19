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
3. **`assembleAndSaveFinalDocument` in `file_manager.ts`** gains an optional `expectedSchema` parameter so that when called for a continuation-limit case, it can fill in any keys the model never reached with a human-readable placeholder

#### Why schema completion is needed

The existing assembly (Phase 2 concatenate or Phase 3 deep-merge) produces a merged object from all fragments the model *did* generate. But when continuations ran out, the model never reached some keys. The merged object will be missing those keys entirely, or they'll still be empty strings/arrays from the initial schema. Downstream consumers (renderers, future synthesis steps, the UI) expect a complete object with all keys present and parsable.

The `context_for_documents` field in the job payload already defines the full expected shape for each document — every key, with empty values as placeholders. After assembly, we walk the merged object against this schema template. Any key that is missing or still has an empty value (`""`, `[]`) gets replaced with an intelligible placeholder like `"[Continuation limit reached — value not generated]"`. This produces valid, complete JSON that downstream consumers can parse without error, while clearly marking which sections the model did not complete.

#### How it fits into existing code

In `assembleAndSaveFinalDocument` (file_manager.ts), the merged object is fully available at line 846 (`const finalContent = JSON.stringify(mergedObject)`) before upload at line 906. The schema completion step goes between merge and upload:

1. If `expectedSchema` was provided, walk `mergedObject` against it
2. For each key in the schema that is missing or empty in `mergedObject`, insert the placeholder value
3. Then stringify and upload as normal

This is a small addition to an existing function, not a new function or new file.

### Files to Touch

| # | File | Change | Tests |
|---|---|---|---|
| 1 | `supabase/functions/dialectic-service/dialectic.interface.ts` | Add `reason?: string` to `IContinueJobResult` (line 1915-1918). Add `"continuation_limit_reached"` to `ModelProcessingResult.status` union (lines 1221 and 1905). | Type guard tests for new status value if guards exist for `ModelProcessingResult`. |
| 2 | `supabase/functions/dialectic-worker/continueJob.ts` | Line 62: change `return { enqueued: false }` to `return { enqueued: false, reason: 'continuation_limit_reached' }` when `!underMaxContinuations`. Keep the existing `return { enqueued: false }` for the `!continueUntilComplete` case. | — |
| 3 | `supabase/functions/dialectic-worker/continueJob.test.ts` | Update the existing continuation limit test (lines 397-408) to assert `reason: 'continuation_limit_reached'`. Add/update test for the `continueUntilComplete: false` case to confirm no `reason` is returned. | — |
| 4 | `supabase/functions/_shared/services/file_manager.ts` | Add an optional second parameter `expectedSchema?: Record<string, unknown>` to `assembleAndSaveFinalDocument`. Between the merge (line 846) and upload (line 906): if `expectedSchema` is provided, walk `mergedObject` against the schema. For every key in the schema where `mergedObject` has a missing key, empty string (`""`), or empty array (`[]`), replace the value with `"[Continuation limit reached — value not generated]"`. Recurse for nested objects. | — |
| 5 | `supabase/functions/_shared/services/file_manager.assemble.test.ts` | Add test: when `expectedSchema` is provided and merged object is missing keys, those keys are filled with the placeholder. Add test: when `expectedSchema` is provided and merged object already has values, those values are preserved. Add test: when `expectedSchema` is not provided (normal path), behavior is unchanged. | — |
| 6 | `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` | After line 1838, when `continueResult.enqueued === false && continueResult.reason === 'continuation_limit_reached'`: (a) log a warning; (b) set `modelProcessingResult.status` to `'continuation_limit_reached'`; (c) **treat this as a final chunk** — call the same `assembleAndSaveFinalDocument` that already exists for `isFinalChunk` (around line 1888), passing `context_for_documents` from `job.payload` as the `expectedSchema` parameter. | — |
| 7 | `supabase/functions/dialectic-worker/executeModelCallAndSave.continuationCount.test.ts` | Add test that when continuation limit is hit, result status is `continuation_limit_reached`, `assembleAndSaveFinalDocument` is called, and the `expectedSchema` parameter is passed. | — |

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
| 2 | `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.ts` | Use shared assembly to produce one assembled object. Accept optional `expectedSchema` parameter for missing-key detection. Construct context-aware continuation instruction based on last chunk type. Return 3 messages instead of N. | Update existing tests in `gatherContinuationInputs.test.ts`: verify 3-message return structure, verify assembled assistant content, verify continuation instruction varies by chunk type. |
| 3 | `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.ts` | Remove the flatten loop (lines 157-163). Set `messages` on the returned `AssembledPrompt` from the structured array. Keep `promptContent` as the final user message (continuation instruction) for backward compatibility with file upload. | Update existing tests in `assembleContinuationPrompt.test.ts`: verify messages are propagated, not flattened. |
| 4 | `supabase/functions/_shared/prompt-assembler/prompt-assembler.interface.ts` | Add optional `messages?: Messages[]` field to `AssembledPrompt`. | Type-level change, no runtime tests needed. |
| 5 | `supabase/functions/dialectic-worker/processSimpleJob.ts` | When `assembled.messages` is present: populate `conversationHistory` from the first two messages, set `currentUserPrompt` to the third. When absent: existing behavior unchanged. | Add test case in `processSimpleJob.test.ts` for continuation path populating `conversationHistory`. |
| 6 | `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` | (a) After sanitization: if `wasStructurallyFixed === true && continueUntilComplete`, set `shouldContinue = true`. (b) After successful parse with `finish_reason === 'stop'` and no content-level flags: compare parsed keys against `context_for_documents`; if missing, set `shouldContinue = true`. | Add tests in `executeModelCallAndSave.continue.test.ts` for both new continuation triggers. |
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
  dialectic.interface.ts (add reason to IContinueJobResult, add status to ModelProcessingResult)
    → continueJob.ts + continueJob.test.ts (return reason when cap hit)
      → file_manager.ts + file_manager.assemble.test.ts (add expectedSchema param + fill logic)
        → executeModelCallAndSave.ts + executeModelCallAndSave.continuationCount.test.ts
          (handle reason, call assembleAndSaveFinalDocument with schema)

Fix 3 dependency chain:
  assembleChunks.ts + assembleChunks.test.ts (shared utility — no dependencies)
    → gatherContinuationInputs.ts + gatherContinuationInputs.test.ts (use shared utility, return 3 messages)
      → prompt-assembler.interface.ts (add messages to AssembledPrompt)
        → assembleContinuationPrompt.ts + assembleContinuationPrompt.test.ts (stop flattening)
          → processSimpleJob.ts + processSimpleJob.test.ts (route messages to conversationHistory)
    → file_manager.ts (refactor Phase 2/3 to use shared utility — can parallel with above)
    → executeModelCallAndSave.ts + executeModelCallAndSave.continue.test.ts
        (3.4: wasStructurallyFixed trigger, 3.5: missing-keys trigger)

Fix 3 can begin in parallel with Fix 2. The shared assembly utility (assembleChunks.ts)
has no dependencies on Fix 2 and is the foundation for the rest of Fix 3.

Fix 3.4 and 3.5 (new continuation triggers in executeModelCallAndSave) are independent
of the prompt assembly chain (3.1-3.3) and can be developed in parallel.
```

---

## Consolidated File List (Dependency Order)

Every file that must be touched across all three fixes, listed once, in implementation order. Files with no dependency on prior files are grouped together. Test files are listed alongside their source files.

| # | File | Fix | Changes |
|---|------|-----|---------|
| 1 | **New migration** `supabase/migrations/YYYYMMDDHHMMSS_fix_retry_error_preserve.sql` | 1 | `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` — merge instead of overwrite `error_details` in the retry-exhausted branch. |
| 2 | **New file** `supabase/functions/_shared/utils/assembleChunks.ts` | 3.1 | Shared chunk assembly utility: classify chunks (raw vs parseable), group adjacent raw fragments, strip continuation metadata, deep-merge all parsed objects. |
| 3 | **New file** `supabase/functions/_shared/utils/assembleChunks.test.ts` | 3.1 | Tests: raw-only chains, parseable-only chains, mixed chains, continuation metadata stripping, empty input. |
| 4 | `supabase/functions/dialectic-service/dialectic.interface.ts` | 2 | Add `reason?: string` to `IContinueJobResult`. Add `"continuation_limit_reached"` to `ModelProcessingResult.status` union. |
| 5 | `supabase/functions/_shared/prompt-assembler/prompt-assembler.interface.ts` | 3.3 | Add optional `messages?: Messages[]` field to `AssembledPrompt`. |
| 6 | `supabase/functions/dialectic-worker/continueJob.ts` | 2 | Return `{ enqueued: false, reason: 'continuation_limit_reached' }` when `!underMaxContinuations`. |
| 7 | `supabase/functions/dialectic-worker/continueJob.test.ts` | 2 | Assert `reason: 'continuation_limit_reached'` on cap-hit test. Add/update test for `continueUntilComplete: false` case. |
| 8 | `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.ts` | 3.2 | Use shared assembly utility. Accept optional `expectedSchema` for missing-key detection. Construct context-aware continuation instruction. Return 3 messages instead of N. |
| 9 | `supabase/functions/_shared/prompt-assembler/gatherContinuationInputs.test.ts` | 3.2 | Verify 3-message return structure, assembled assistant content, continuation instruction varies by last-chunk type. |
| 10 | `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.ts` | 3.3 | Remove flatten loop (lines 157-163). Set `messages` on returned `AssembledPrompt`. Keep `promptContent` as final user message for file upload compatibility. |
| 11 | `supabase/functions/_shared/prompt-assembler/assembleContinuationPrompt.test.ts` | 3.3 | Verify messages are propagated, not flattened. |
| 12 | `supabase/functions/_shared/services/file_manager.ts` | 2, 3.1 | (Fix 2) Add optional `expectedSchema` parameter to `assembleAndSaveFinalDocument`; fill missing keys with placeholder between merge and upload. (Fix 3.1) Refactor Phase 2/3 (lines 774-840) to use shared assembly utility. |
| 13 | `supabase/functions/_shared/services/file_manager.assemble.test.ts` | 2, 3.1 | (Fix 2) Tests for `expectedSchema` fill logic. (Fix 3.1) Existing tests must continue to pass after Phase 2/3 refactor. |
| 14 | `supabase/functions/dialectic-worker/processSimpleJob.ts` | 3.3 | When `assembled.messages` is present: populate `conversationHistory` from first two messages, set `currentUserPrompt` to third. When absent: existing behavior unchanged. |
| 15 | `supabase/functions/dialectic-worker/processSimpleJob.test.ts` | 3.3 | Add test case for continuation path populating `conversationHistory`. |
| 16 | `supabase/functions/dialectic-worker/executeModelCallAndSave.ts` | 2, 3.4, 3.5 | (Fix 2) Handle `continueResult.reason === 'continuation_limit_reached'`: call `assembleAndSaveFinalDocument` with `expectedSchema`. (Fix 3.4) After sanitization: if `wasStructurallyFixed === true && continueUntilComplete`, set `shouldContinue = true`. (Fix 3.5) After parse with `finish_reason === 'stop'` and no content-level flags: compare parsed keys against `context_for_documents`; if missing, set `shouldContinue = true`. |
| 17 | `supabase/functions/dialectic-worker/executeModelCallAndSave.continuationCount.test.ts` | 2 | Test that continuation-limit-reached triggers `assembleAndSaveFinalDocument` with `expectedSchema`. |
| 18 | `supabase/functions/dialectic-worker/executeModelCallAndSave.continue.test.ts` | 3.4, 3.5 | Tests for `wasStructurallyFixed` continuation trigger and missing-keys continuation trigger. |

---

# Work Breakdown Structure

## Node 1

* `[ ]` [DB] `supabase/migrations/` **Fix retry-exhausted trigger to preserve error details**
  * `[ ]` `objective`
    * `[ ]` When the `invoke_worker_on_status_change` trigger detects retry exhaustion (`attempt_count >= max_retries + 1`), it must **merge** existing `error_details` (which contains the `failedAttempts` array written by `retryJob.ts`) with the trigger's metadata — not overwrite them
    * `[ ]` After the fix, retry-exhausted jobs must have `error_details` containing **both** the `failedAttempts` array **and** the `finalError`/`message`/`attempt_count`/`max_retries` metadata
    * `[ ]` No other branch of the trigger function is modified
  * `[ ]` `role`
    * `[ ]` Infrastructure — database trigger function governing job state transitions
  * `[ ]` `module`
    * `[ ]` Dialectic generation job state machine — retry exhaustion branch of `invoke_worker_on_status_change()`
  * `[ ]` `deps`
    * `[ ]` Source trigger: `supabase/migrations/20260109165706_state_machine_fix.sql` lines 64-76 — the existing `CREATE OR REPLACE FUNCTION invoke_worker_on_status_change()` that this migration supersedes
    * `[ ]` Producer: `supabase/functions/dialectic-worker/retryJob.ts` — writes `error_details: { failedAttempts: [...] }` in the same UPDATE that sets `status: 'retrying'`; this is the data the trigger currently destroys
    * `[ ]` No reverse dependency introduced — the trigger reads `NEW.error_details` but does not call or import any Deno code
  * `[ ]` `context_slice`
    * `[ ]` The trigger reads `NEW.error_details` (jsonb), `v_attempt_count` (integer), and `v_max_retries` (integer) — all already available in the function body
    * `[ ]` No new columns, no new tables, no new function parameters
  * `[ ]` `migration`
    * `[ ]` New file: `supabase/migrations/YYYYMMDDHHMMSS_fix_retry_error_preserve.sql`
    * `[ ]` `CREATE OR REPLACE FUNCTION public.invoke_worker_on_status_change()` — copy the full existing function body, changing only the retry-exhausted branch (lines 64-76 equivalent)
    * `[ ]` Replace line 70 (`error_details = jsonb_build_object(...)`) with a merge: `error_details = COALESCE(NEW.error_details, '{}'::jsonb) || jsonb_build_object('finalError', 'Retry limit exceeded', 'attempt_count', v_attempt_count, 'max_retries', v_max_retries, 'message', format('Job exceeded maximum retry limit. Attempt count: %s, Max retries: %s', v_attempt_count, v_max_retries))`
    * `[ ]` The `||` operator appends the trigger's metadata keys to the existing jsonb object, preserving the `failedAttempts` array and any other keys `retryJob.ts` stored
    * `[ ]` All other branches of the function remain identical
  * `[ ]` `directionality`
    * `[ ]` Layer: infrastructure (database trigger)
    * `[ ]` All dependencies are inward-facing — the trigger reads row data, it does not call application code
    * `[ ]` The trigger's output (updated row) is consumed by application code reading job status — outward-facing
  * `[ ]` `requirements`
    * `[ ]` After migration, a retry-exhausted job's `error_details` must contain the `failedAttempts` key from `retryJob.ts`
    * `[ ]` After migration, a retry-exhausted job's `error_details` must contain `finalError`, `attempt_count`, `max_retries`, and `message` from the trigger
    * `[ ]` No existing behavior is changed for any other trigger branch
    * `[ ]` Migration is idempotent (`CREATE OR REPLACE`)
