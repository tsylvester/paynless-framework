[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* `[ ]`   dialectic-worker/enqueueModelCall  **[BE] Replace user JWT in Netlify event with HMAC job signature**

  * `[✅]`   `objective`
    * `[✅]`   The user JWT forwarded into `AiStreamEvent` expires independently of the job lifecycle, causing 401s when Netlify calls back to Supabase. Replace it with a deterministic HMAC signature bound to the specific job so the callback can be authenticated without a user credential.
    * `[✅]`   Functional goals:
      * `AiStreamEventData.sig` replaces `AiStreamEventData.user_jwt`; sig = `HMAC-SHA256(secret, job_id + ":" + user_id + ":" + created_at)`
      * `deps.computeJobSig(jobId, userId, createdAt)` is called to produce the sig
      * If `params.job.user_id` is null/empty, return non-retriable error before calling `computeJobSig`
      * If `computeJobSig` throws, return non-retriable error; fetch not called
    * `[✅]`   Non-functional: `user_jwt` is removed from `AiStreamEventData`; no other event fields change

  * `[✅]`   `role`
    * `[✅]`   Application layer orchestrator — coordinates DB status update and Netlify queue POST
    * `[✅]`   Must NOT implement HMAC signing — that is the responsibility of `computeJobSig` in deps

  * `[✅]`   `deps`
    * `[✅]`   `computeJobSig: (jobId: string, userId: string, createdAt: string) => string` — added to `EnqueueModelCallDeps`; provider is `index.ts` composition root via `IJobContext`

  * `[✅]`   `enqueueModelCall.interface.test.ts`
    * `[✅]`   `EnqueueModelCallDeps` valid: includes `computeJobSig` as a function
    * `[✅]`   `EnqueueModelCallDeps` invalid: missing `computeJobSig`
    * `[✅]`   `AiStreamEventData` valid: has `sig` field; no `user_jwt` field

  * `[✅]`   `enqueueModelCall.interface.ts`
    * `[✅]`   Add `computeJobSig: (jobId: string, userId: string, createdAt: string) => string` to `EnqueueModelCallDeps`
    * `[✅]`   Remove `user_jwt` from `AiStreamEventData`; add `sig: string`

  * `[✅]`   `enqueueModelCall.guard.test.ts`
    * `[✅]`   `isEnqueueModelCallDeps`: rejects object missing `computeJobSig`
    * `[✅]`   `isEnqueueModelCallDeps`: rejects object where `computeJobSig` is not a function
    * `[✅]`   `isAiStreamEventData`: rejects object with `user_jwt` field; accepts object with `sig` field

  * `[✅]`   `enqueueModelCall.guard.ts`
    * `[✅]`   Update `isEnqueueModelCallDeps` to assert `typeof value.computeJobSig === 'function'`
    * `[✅]`   Update `isAiStreamEventData` to check `sig` instead of `user_jwt`

  * `[✅]`   `enqueueModelCall.test.ts`
    * `[✅]`   Success: `deps.computeJobSig` is called with `(job.id, job.user_id, job.created_at)`; returned sig appears in posted event body as `sig`
    * `[✅]`   Error: `params.job.user_id` is null → non-retriable error; `computeJobSig` not called
    * `[✅]`   Error: `computeJobSig` throws → non-retriable error; fetch not called
    * `[✅]`   Regression: `user_jwt` does not appear in the posted event body

  * `[ ]`   `enqueueModelCall.ts`
    * `[ ]`   Validate `params.job.user_id` is a non-empty string; return non-retriable error if not
    * `[ ]`   `const sig: string = deps.computeJobSig(params.job.id, params.job.user_id, params.job.created_at)` wrapped in try/catch → non-retriable error on throw
    * `[ ]`   Set `sig` in `AiStreamEventData`; remove `user_jwt` from `AiStreamEventData`

  * `[ ]`   `enqueueModelCall.mock.ts`
    * `[ ]`   Add `computeJobSig` to `EnqueueModelCallDepsOverrides`
    * `[ ]`   `createMockEnqueueModelCallDeps` default: `computeJobSig` returns `'mock-sig'`

  * `[ ]`   `enqueueModelCall.provides.ts`
    * `[ ]`   No change required

* `[ ]`   dialectic-worker/createJobContext  **[BE] Thread computeJobSig through IJobContext and JobContextParams**

  * `[ ]`   `objective`
    * `[ ]`   `computeJobSig` must be a first-class field on `IJobContext` and `JobContextParams` so it is injectable at the composition root and flows to `boundEnqueueModelCall` via the context slicer
    * `[ ]`   Interface and factory files are exempt from TDD per rules

  * `[ ]`   `role`
    * `[ ]`   Context factory / composition boundary — owns the shape of the root context
    * `[ ]`   Must NOT implement `computeJobSig` — receives it from `index.ts`

  * `[ ]`   `JobContext.interface.ts`
    * `[ ]`   Add `readonly computeJobSig: (jobId: string, userId: string, createdAt: string) => string` to `IJobContext`
    * `[ ]`   Add `readonly computeJobSig: (jobId: string, userId: string, createdAt: string) => string` to `JobContextParams`

  * `[ ]`   `createJobContext.ts`
    * `[ ]`   Add `computeJobSig: params.computeJobSig` to the object returned by `createJobContext`

* `[ ]`   dialectic-worker/index  **[BE] Implement computeJobSig with HMAC-SHA256 and wire into composition root**

  * `[ ]`   `objective`
    * `[ ]`   Provide the concrete `computeJobSig` implementation in `createDialecticWorkerDeps` using `SUPABASE_HMAC_SECRET` and the Web Crypto API (available in Deno); wire into `boundEnqueueModelCall` closure deps and `createJobContext` params
    * `[ ]`   Functional goals:
      * Reads `SUPABASE_HMAC_SECRET` from `Deno.env`; throws if missing
      * Signs `job_id + ":" + user_id + ":" + created_at` with HMAC-SHA256; returns hex string
      * `boundEnqueueModelCall` closure includes `computeJobSig` in its deps object
      * `createJobContext` receives `computeJobSig` in its params

  * `[ ]`   `role`
    * `[ ]`   Composition root / infrastructure adapter — owns secret access and wires all deps
    * `[ ]`   Must NOT leak `SUPABASE_HMAC_SECRET`

  * `[ ]`   `index.ts`
    * `[ ]`   In `createDialecticWorkerDeps`: read `SUPABASE_HMAC_SECRET`; throw if missing
    * `[ ]`   Define `computeJobSig` using `crypto.subtle.importKey` + `crypto.subtle.sign` (HMAC-SHA256); encode result as hex string
    * `[ ]`   Add `computeJobSig` to `boundEnqueueModelCall` inline deps object
    * `[ ]`   Add `computeJobSig` to `createJobContext` params

* `[ ]`   netlify/functions/ai-stream  **[BE] Carry HMAC sig through Netlify event and callback payload**

  * `[ ]`   `objective`
    * `[ ]`   `AiStreamEvent.sig` replaces `AiStreamEvent.user_jwt` on the Netlify side; the sig is forwarded unchanged into `AiStreamPayload` so it reaches the `dialectic-saveResponse` handler
    * `[ ]`   Functional goals:
      * `AiStreamEvent.sig: string` replaces `user_jwt`
      * `AiStreamPayload.sig: string` is added
      * `postAiStreamPayload` forwards `sig` in the request body; no Authorization header required
    * `[ ]`   Non-functional: no other fields in the event or payload change

  * `[ ]`   `ai-stream.interface.test.ts`
    * `[ ]`   `AiStreamEvent` valid: has `sig`; invalid: missing `sig`; invalid: has `user_jwt` (removed)
    * `[ ]`   `AiStreamPayload` valid: has `sig`

  * `[ ]`   `ai-stream.interface.ts`
    * `[ ]`   Replace `user_jwt: string` with `sig: string` in `AiStreamEvent`
    * `[ ]`   Add `sig: string` to `AiStreamPayload`

  * `[ ]`   `ai-stream.guard.test.ts`
    * `[ ]`   `isAiStreamEvent`: rejects missing `sig`; rejects `user_jwt`-only object; accepts `sig`
    * `[ ]`   `isAiStreamPayload` (if exists): accepts `sig`

  * `[ ]`   `ai-stream.guard.ts`
    * `[ ]`   Update `isAiStreamEvent` to check `sig` instead of `user_jwt`

  * `[ ]`   `ai-stream.test.ts`
    * `[ ]`   `postAiStreamPayload`: sends `sig` from payload in request body; no `Authorization` header
    * `[ ]`   Regression: `user_jwt` does not appear in request body or headers

  * `[ ]`   `ai-stream.ts`
    * `[ ]`   `postAiStreamPayload`: remove `userJwt` parameter; add `sig: string` parameter; remove `Authorization` header; include `sig` in JSON body
    * `[ ]`   Update both call sites to pass `validated.sig` instead of `validated.user_jwt`

* `[ ]`   supabase/functions/dialectic-saveResponse  **[BE] Unauth HMAC-verified handler — side door for Netlify callback**

  * `[ ]`   `objective`
    * `[ ]`   Provide a dedicated Supabase Edge Function with `verify_jwt = false` that acts as the exclusive entry point for Netlify's `saveResponse` callback. Validates the HMAC sig and expiry before forwarding to `saveResponse` using `adminClient`. Rejects any request with an invalid or expired sig without entering the secure processing area.
    * `[ ]`   Functional goals:
      * Accepts POST with `{ job_id, assembled_content, token_usage, finish_reason, sig }`
      * Looks up job by `job_id` using `adminClient`
      * Recomputes `expectedSig = HMAC-SHA256(secret, job_id + ":" + user_id + ":" + created_at)`
      * Rejects with 401 if sig does not match
      * Rejects with 401 if `job.created_at + 2hr < now`
      * Calls `saveResponse` using `adminClient` for `srParams.dbClient` if sig is valid
    * `[ ]`   Non-functional: `SUPABASE_HMAC_SECRET` and `DIALECTIC_SAVERESPONSE_URL` must be set

  * `[ ]`   `role`
    * `[ ]`   Infrastructure adapter / auth boundary — owns the unauthenticated entry point and sig verification
    * `[ ]`   Must NOT contain business logic — delegates entirely to `saveResponse` after verification

  * `[ ]`   `deps`
    * `[ ]`   `adminClient` — `createSupabaseAdminClient()` from `_shared/auth.ts`
    * `[ ]`   `SUPABASE_HMAC_SECRET` — Deno env var; same secret used in `computeJobSig`
    * `[ ]`   `saveResponse` and its full dep tree from `dialectic-worker` — imported directly

  * `[ ]`   `index.ts` (dialectic-saveResponse)
    * `[ ]`   `serve`: POST only; parse body; extract `job_id` and `sig`
    * `[ ]`   Fetch job row using `adminClient`; 404 if not found
    * `[ ]`   Recompute sig using same HMAC formula as `computeJobSig`
    * `[ ]`   Compare received sig to expected sig using constant-time comparison; 401 on mismatch
    * `[ ]`   Check `new Date(job.created_at).getTime() + 2 * 60 * 60 * 1000 >= Date.now()`; 401 if expired
    * `[ ]`   Wire `saveResponse` deps using `adminClient` for `srParams.dbClient`; call `saveResponse`; return result

  * `[ ]`   `supabase/config.toml`
    * `[ ]`   Add `[functions.dialectic-saveResponse]` with `verify_jwt = false`

  * `[ ]`   Environment
    * `[ ]`   Update `DIALECTIC_SAVERESPONSE_URL` in `netlify/.env` and `supabase/functions/.env` to point to `dialectic-saveResponse` function URL
    * `[ ]`   Add `SUPABASE_HMAC_SECRET` to `supabase/functions/.env` (generate a strong random secret)

  * `[ ]`   `dialectic-saveResponse.integration.test.ts`
    * `[ ]`   Valid sig + unexpired job → 200 and `saveResponse` called
    * `[ ]`   Invalid sig → 401; `saveResponse` not called
    * `[ ]`   Expired job (created_at > 2hr ago) → 401; `saveResponse` not called
    * `[ ]`   Missing `job_id` → 400

  * `[ ]`   **Commit** `feat(dialectic-saveResponse): HMAC-signed Netlify callback side door — removes user JWT dependency from saveResponse path`
    * `[ ]`   Structural: new `dialectic-saveResponse` function group; `computeJobSig` added to `EnqueueModelCallDeps`, `IJobContext`, `JobContextParams`; `AiStreamEventData.sig` replaces `user_jwt`
    * `[ ]`   Behavioral: Netlify carries HMAC sig instead of user JWT; sig verified before `saveResponse` is invoked; expired jobs rejected at the boundary
    * `[ ]`   Contract: `isEnqueueModelCallDeps` and `isAiStreamEvent` guards updated; `AiStreamEventData` and `AiStreamPayload` schemas updated

## Netlify-Worker-Stream Phase 2 and Phase 3 — deferred detail

### Phase 2 (backend notification and status adaptation):

* getAllStageProgress.ts and its consumers need to understand queued as a distinct in-flight status (currently it would fall through to an unclassified state)
* The notification service needs updated event types for the new async lifecycle (stream_queued, stream_started, stream_complete) to give the frontend accurate real-time signals
* deriveStepStatuses and related step-progress logic need to account for jobs in queued state without treating them as failed or not-started

### Phase 3 (frontend):

* Status display components consuming UnifiedStageStatus need a new streaming or queued visual state
* Real-time subscription handlers need to act on the new job status transitions
* The user-facing progress indicators need to reflect the two-phase async lifecycle rather than a single blocking operation


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