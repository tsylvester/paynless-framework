[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* `[✅]`   dialectic-worker/enqueueModelCall  **[BE] Replace user JWT in Netlify event with HMAC job signature**

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

  * `[✅]`   `enqueueModelCall.ts`
    * `[✅]`   Validate `params.job.user_id` is a non-empty string; return non-retriable error if not
    * `[✅]`   `const sig: string = deps.computeJobSig(params.job.id, params.job.user_id, params.job.created_at)` wrapped in try/catch → non-retriable error on throw
    * `[✅]`   Set `sig` in `AiStreamEventData`; remove `user_jwt` from `AiStreamEventData`

  * `[✅]`   `enqueueModelCall.mock.ts`
    * `[✅]`   Add `computeJobSig` to `EnqueueModelCallDepsOverrides`
    * `[✅]`   `createMockEnqueueModelCallDeps` default: `computeJobSig` returns `'mock-sig'`

  * `[✅]`   `enqueueModelCall.provides.ts`
    * `[✅]`   No change required

* `[✅]`   dialectic-worker/createJobContext  **[BE] Thread computeJobSig through IJobContext and JobContextParams**

  * `[✅]`   `objective`
    * `[✅]`   `computeJobSig` must be a first-class field on `IJobContext` and `JobContextParams` so it is injectable at the composition root and flows to `boundEnqueueModelCall` via the context slicer
    * `[✅]`   Interface and factory files are exempt from TDD per rules

  * `[✅]`   `role`
    * `[✅]`   Context factory / composition boundary — owns the shape of the root context
    * `[✅]`   Must NOT implement `computeJobSig` — receives it from `index.ts`

  * `[✅]`   `JobContext.interface.ts`
    * `[✅]`   Add `readonly computeJobSig: (jobId: string, userId: string, createdAt: string) => string` to `IJobContext`
    * `[✅]`   Add `readonly computeJobSig: (jobId: string, userId: string, createdAt: string) => string` to `JobContextParams`

  * `[✅]`   `createJobContext.ts`
    * `[✅]`   Add `computeJobSig: params.computeJobSig` to the object returned by `createJobContext`

* `[✅]`   dialectic-worker/index  **[BE] Implement computeJobSig with HMAC-SHA256 and wire into composition root**

  * `[✅]`   `objective`
    * `[✅]`   Adopt the concrete `computeJobSig` implementation in `createDialecticWorkerDeps` using `SUPABASE_HMAC_SECRET` and the Web Crypto API (available in Deno); wire into `boundEnqueueModelCall` closure deps and `createJobContext` params
    * `[✅]`   Functional goals:
      * Reads `SUPABASE_HMAC_SECRET` from `Deno.env`; throws if missing
      * Signs `job_id + ":" + user_id + ":" + created_at` with HMAC-SHA256; returns hex string
      * `boundEnqueueModelCall` closure includes `computeJobSig` in its deps object
      * `createJobContext` receives `computeJobSig` in its params

  * `[✅]`   `role`
    * `[✅]`   Composition root / infrastructure adapter — owns secret access and wires all deps
    * `[✅]`   Must NOT leak `SUPABASE_HMAC_SECRET`

  * `[✅]`   `index.ts`
    * `[✅]`   In `createDialecticWorkerDeps`: read `SUPABASE_HMAC_SECRET`; throw if missing
    * `[✅]`   Import `computeJobSig` 
    * `[✅]`   Add `computeJobSig` to `boundEnqueueModelCall` inline deps object
    * `[✅]`   Add `computeJobSig` to `createJobContext` params

* `[✅]`   netlify/functions/ai-stream  **[BE] Carry HMAC sig through Netlify event and callback payload**

  * `[✅]`   `objective`
    * `[✅]`   `AiStreamEvent.sig` replaces `AiStreamEvent.user_jwt` on the Netlify side; the sig is forwarded unchanged into `AiStreamPayload` so it reaches the `netlifyResponse` handler
    * `[✅]`   Functional goals:
      * `AiStreamEvent.sig: string` replaces `user_jwt`
      * `AiStreamPayload.sig: string` is added
      * `postAiStreamPayload` forwards `sig` in the request body; no Authorization header required
    * `[✅]`   Non-functional: no other fields in the event or payload change

  * `[✅]`   `ai-stream.interface.test.ts`
    * `[✅]`   `AiStreamEvent` valid: has `sig`; invalid: missing `sig`; invalid: has `user_jwt` (removed)
    * `[✅]`   `AiStreamPayload` valid: has `sig`

  * `[✅]`   `ai-stream.interface.ts`
    * `[✅]`   Replace `user_jwt: string` with `sig: string` in `AiStreamEvent`
    * `[✅]`   Add `sig: string` to `AiStreamPayload`

  * `[✅]`   `ai-stream.guard.test.ts`
    * `[✅]`   `isAiStreamEvent`: rejects missing `sig`; rejects `user_jwt`-only object; accepts `sig`
    * `[✅]`   `isAiStreamPayload` (if exists): accepts `sig`

  * `[✅]`   `ai-stream.guard.ts`
    * `[✅]`   Update `isAiStreamEvent` to check `sig` instead of `user_jwt`

  * `[✅]`   `ai-stream.test.ts`
    * `[✅]`   `postAiStreamPayload`: sends `sig` from payload in request body; no `Authorization` header
    * `[✅]`   Regression: `user_jwt` does not appear in request body or headers

  * `[✅]`   `ai-stream.ts`
    * `[✅]`   `postAiStreamPayload`: remove `userJwt` parameter; add `sig: string` parameter; remove `Authorization` header; include `sig` in JSON body
    * `[✅]`   Update both call sites to pass `validated.sig` instead of `validated.user_jwt`

* `[ ]`   supabase/functions/netlifyResponse  **[BE] Unauth HMAC-verified handler — side door for Netlify callback**

  * `[✅]`   `objective`
    * `[✅]`   Provide a dedicated Supabase Edge Function with `verify_jwt = false` that acts as the exclusive entry point for Netlify's `saveResponse` callback. Validates the HMAC sig and expiry before forwarding to `saveResponse` using `adminClient`. Rejects any request with an invalid or expired sig without entering the secure processing area.
    * `[✅]`   Functional goals:
      * Accepts POST with `{ job_id, assembled_content, token_usage, finish_reason, sig }`
      * Rejects non-POST with 405; rejects unparseable JSON body with 400
      * Narrows the body using `isNetlifyResponseBody`; 400 on failure
      * Fetches job row from `dialectic_generation_jobs` selecting `id, user_id, created_at` via `adminClient`; 404 if not found
      * Calls `deps.computeJobSig(job.id, job.user_id, job.created_at)` to produce `expectedSig`
      * Converts both `body.sig` and `expectedSig` to `Uint8Array` via `new TextEncoder().encode()`; compares element-by-element (constant-time, no short-circuit); 401 on mismatch
      * Rejects with 401 if `new Date(job.created_at).getTime() + 2 * 60 * 60 * 1000 < Date.now()` (expired)
      * Wires `SaveResponseParams` with `{ job_id: body.job_id, dbClient: deps.adminClient }`; calls `deps.saveResponse(deps.saveResponseDeps, params, payload)`; maps result to HTTP response
    * `[✅]`   Non-functional:
      * `SUPABASE_HMAC_SECRET` must be set in this function's env (read at cold-start via `createComputeJobSig`)
      * `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be set (consumed by `createSupabaseAdminClient`)
      * The caller (`ai-stream`) must point `DIALECTIC_SAVERESPONSE_URL` at this function's URL
      * The `/saveResponse` route in `dialectic-worker/index.ts` is superseded by this function and must be removed

  * `[✅]`   `role`
    * `[✅]`   Infrastructure adapter / auth boundary — owns the unauthenticated entry point and HMAC sig verification
    * `[✅]`   Must NOT contain business logic — delegates entirely to `saveResponse` after verification passes
    * `[✅]`   Must NOT accept or validate user JWTs — HMAC is the sole authentication mechanism

  * `[✅]`   `module`
    * `[✅]`   Bounded context: `netlifyResponse` owns the Netlify-to-Supabase callback boundary
    * `[✅]`   Inside boundary: request method enforcement, body parsing and narrowing, sig recomputation, expiry check, `saveResponse` dep wiring, HTTP response mapping
    * `[✅]`   Outside boundary: HMAC key management (`computeJobSig`), business logic (`saveResponse`), DB access beyond the single job lookup, user authentication

  * `[✅]`   `deps`
    * `[✅]`   `createSupabaseAdminClient` — from `_shared/auth.ts`; constructs `SupabaseClient<Database>` using service role key; used for job lookup and `SaveResponseParams.dbClient`
    * `[✅]`   `createComputeJobSig(secret)` — from `_shared/utils/computeJobSig/computeJobSig.ts`; called once at cold-start with `SUPABASE_HMAC_SECRET`; returns the `ComputeJobSig` function bound to the HMAC key
    * `[✅]`   `saveResponse` — from `dialectic-worker/saveResponse/saveResponse.provides.ts`; called after sig and expiry checks pass
    * `[✅]`   Full `SaveResponseDeps` tree (wired in `index.ts`): `logger`, `fileManager`, `notificationService`, `continueJob`, `retryJob`, `resolveFinishReason`, `isIntermediateChunk`, `determineContinuation`, `buildUploadContext`, `debitTokens` (bound to `adminTokenWalletService`), `sanitizeJsonContent`, `enqueueRenderJob` (bound to `adminClient`) — same wiring strategy as `createDialecticWorkerDeps` in `dialectic-worker/index.ts`

  * `[✅]`   `context_slice`
    * `[✅]`   `NetlifyResponseDeps` is the minimal injection surface: `{ computeJobSig: ComputeJobSig; adminClient: SupabaseClient<Database>; saveResponse: SaveResponseFn; saveResponseDeps: SaveResponseDeps }`
    * `[✅]`   `index.ts` constructs `NetlifyResponseDeps` at cold-start and passes it to `netlifyResponseHandler` on every request
    * `[✅]`   No concrete types leak into `netlifyResponseHandler` — all external access is through the typed deps interface

  * `[✅]`   `netlifyResponse.interface.test.ts`
    * `[✅]`   `NetlifyResponseBody` valid: `{ job_id, assembled_content, token_usage: NodeTokenUsage, finish_reason: string, sig: string }`
    * `[✅]`   `NetlifyResponseBody` valid: `token_usage: null`, `finish_reason: null`
    * `[✅]`   `NetlifyResponseBody` invalid: missing `job_id`
    * `[✅]`   `NetlifyResponseBody` invalid: missing `sig`
    * `[✅]`   `NetlifyResponseBody` invalid: missing `assembled_content`
    * `[✅]`   `NetlifyResponseBody` invalid: `job_id` is not a string
    * `[✅]`   `NetlifyResponseBody` invalid: `sig` is not a string
    * `[✅]`   `NetlifyResponseDeps` valid: all required fields present and correctly typed
    * `[✅]`   `NetlifyResponseDeps` invalid: missing `computeJobSig`
    * `[✅]`   `NetlifyResponseDeps` invalid: missing `adminClient`
    * `[✅]`   `NetlifyResponseDeps` invalid: missing `saveResponse`
    * `[✅]`   `NetlifyResponseDeps` invalid: missing `saveResponseDeps`

  * `[✅]`   `netlifyResponse.interface.ts`
    * `[✅]`   `NetlifyResponseBody`: `{ job_id: string; assembled_content: string; token_usage: NodeTokenUsage | null; finish_reason: string | null; sig: string }` — import `NodeTokenUsage` from `saveResponse.interface.ts`
    * `[✅]`   `NetlifyResponseDeps`: `{ computeJobSig: ComputeJobSig; adminClient: SupabaseClient<Database>; saveResponse: SaveResponseFn; saveResponseDeps: SaveResponseDeps }`
    * `[✅]`   `NetlifyResponseHandlerFn`: `(deps: NetlifyResponseDeps, req: Request) => Promise<Response>`

  * `[✅]`   `netlifyResponse.guard.test.ts`
    * `[✅]`   `isNetlifyResponseBody`: accepts all valid contract cases from `interface.test.ts`
    * `[✅]`   `isNetlifyResponseBody`: rejects all invalid contract cases from `interface.test.ts`
    * `[✅]`   `isNetlifyResponseDeps`: accepts a fully valid deps object
    * `[✅]`   `isNetlifyResponseDeps`: rejects missing `computeJobSig`; rejects non-function `computeJobSig`; rejects missing `adminClient`; rejects missing `saveResponse`; rejects missing `saveResponseDeps`

  * `[✅]`   `netlifyResponse.guard.ts`
    * `[✅]`   `isNetlifyResponseBody(value: unknown): value is NetlifyResponseBody` — checks `string` `job_id`, `string` `assembled_content`, `NodeTokenUsage | null` `token_usage`, `string | null` `finish_reason`, `string` `sig`
    * `[✅]`   `isNetlifyResponseDeps(value: unknown): value is NetlifyResponseDeps` — checks all four required fields; `typeof value.computeJobSig === 'function'`

  * `[✅]`   `netlifyResponseHandler.test.ts`
    * `[✅]`   POST + valid body + valid sig + unexpired job → `saveResponse` called; returns 200 `{ status: 'completed' }`
    * `[✅]`   POST + valid body + valid sig + unexpired job + `saveResponse` returns retriable `SaveResponseErrorReturn` → 503
    * `[✅]`   POST + valid body + valid sig + unexpired job + `saveResponse` returns non-retriable `SaveResponseErrorReturn` → 500
    * `[✅]`   POST + valid body + sig mismatch → 401; `saveResponse` not called
    * `[✅]`   POST + valid body + expired job (`created_at` > 2hr ago) → 401; `saveResponse` not called
    * `[✅]`   POST + valid body + job not found in DB → 404; `saveResponse` not called
    * `[✅]`   POST + body missing `job_id` → 400 (guard rejects before any DB call)
    * `[✅]`   POST + body missing `sig` → 400 (guard rejects before any DB call)
    * `[✅]`   Non-POST request → 405; `saveResponse` not called
    * `[✅]`   POST + invalid JSON body → 400

  * `[✅]`   `construction`
    * `[✅]`   `NetlifyResponseDeps` is constructed once at cold-start in `index.ts`, not per-request
    * `[✅]`   `createComputeJobSig(secret)` is async; must be `await`ed before `serve()` is called; missing `SUPABASE_HMAC_SECRET` throws at startup, not at request time
    * `[✅]`   `createSupabaseAdminClient()` is called once at cold-start; the resulting client is reused across requests
    * `[✅]`   Full `SaveResponseDeps` wiring follows the same pattern as `createDialecticWorkerDeps` in `dialectic-worker/index.ts`; `adminTokenWalletService` is used for `debitTokens`; `enqueueRenderJob` is bound to `adminClient`
    * `[✅]`   Missing `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` also throws at startup via `createSupabaseAdminClient`

  * `[✅]`   `netlifyResponseHandler.ts`
    * `[✅]`   Signature: `netlifyResponseHandler(deps: NetlifyResponseDeps, req: Request): Promise<Response>`
    * `[✅]`   Enforce POST only; return 405 for other methods
    * `[✅]`   Parse body with `req.json()` wrapped in try/catch; 400 on parse failure
    * `[✅]`   Narrow with `isNetlifyResponseBody(body)`; 400 on failure
    * `[✅]`   Fetch job from `dialectic_generation_jobs` selecting `id, user_id, created_at` via `deps.adminClient`; 404 if not found or DB error
    * `[✅]`   Call `deps.computeJobSig(job.id, job.user_id, job.created_at)` to get `expectedSig`
    * `[✅]`   Convert `body.sig` and `expectedSig` to `Uint8Array` via `new TextEncoder().encode()`; compare element-by-element in a loop (constant-time — accumulate mismatches without early return); 401 if any mismatch
    * `[✅]`   Check `new Date(job.created_at).getTime() + 2 * 60 * 60 * 1000 < Date.now()`; 401 if expired
    * `[✅]`   Build `SaveResponseParams` with `{ job_id: body.job_id, dbClient: deps.adminClient }` and `SaveResponsePayload` from `body`; call `deps.saveResponse(deps.saveResponseDeps, srParams, srPayload)`
    * `[✅]`   Map `SaveResponseSuccessReturn` → 200; retriable `SaveResponseErrorReturn` → 503; non-retriable → 500

  * `[✅]`   `index.ts` (netlifyResponse entry point)
    * `[✅]`   Read `SUPABASE_HMAC_SECRET`; throw at startup if missing
    * `[✅]`   `const computeJobSig: ComputeJobSig = await createComputeJobSig(hmacSecret)`
    * `[✅]`   `const adminClient: SupabaseClient<Database> = createSupabaseAdminClient()` (throws at startup if env vars missing)
    * `[✅]`   Wire full `SaveResponseDeps` following `createDialecticWorkerDeps` pattern from `dialectic-worker/index.ts`
    * `[✅]`   Construct `NetlifyResponseDeps` from the above; `serve((req) => netlifyResponseHandler(deps, req))`

  * `[✅]`   `netlifyResponse.mock.ts`
    * `[✅]`   `createMockNetlifyResponseDeps(overrides?)`: fully typed `NetlifyResponseDeps`; `computeJobSig` returns `'mock-sig'`; stub `adminClient`; stub `saveResponse` returning `{ status: 'completed' }`; stub `saveResponseDeps`
    * `[✅]`   `mockNetlifyResponseHandler`: a `NetlifyResponseHandlerFn` spy resolving to a 200 response by default

  * `[✅]`   `netlifyResponse.provides.ts`
    * `[✅]`   Exports: `netlifyResponseHandler`, `NetlifyResponseBody`, `NetlifyResponseDeps`, `NetlifyResponseHandlerFn`, `isNetlifyResponseBody`, `isNetlifyResponseDeps`, `createMockNetlifyResponseDeps`, `mockNetlifyResponseHandler`

  * `[✅]`   `netlifyResponse.integration.test.ts`
    * `[✅]`   Valid sig + unexpired job → 200 and `saveResponse` called (real `isNetlifyResponseBody`, real `netlifyResponseHandler`; mock `adminClient` returning a job row; real `computeJobSig` via `createComputeJobSig`; mock `saveResponse`)
    * `[✅]`   Invalid sig → 401; `saveResponse` not called
    * `[✅]`   Expired job (`created_at` > 2hr ago) → 401; `saveResponse` not called
    * `[✅]`   Missing `job_id` → 400; no DB call made

  * `[✅]`   `directionality`
    * `[✅]`   Node layer: infrastructure adapter (entry-point boundary)
    * `[✅]`   Deps are inward-facing: `_shared/auth.ts`, `_shared/utils/computeJobSig`, `dialectic-worker/saveResponse` (all lower-layer producers)
    * `[✅]`   Provides are outward-facing: receives HTTP POST from Netlify; returns HTTP response to Netlify
    * `[✅]`   No cycles: `netlifyResponse` does not import from `dialectic-worker/index.ts`

  * `[✅]`   `requirements`
    * `[✅]`   POST with valid HMAC sig and unexpired job → `saveResponse` called; 200 returned
    * `[✅]`   POST with invalid HMAC sig → 401; `saveResponse` not called
    * `[✅]`   POST with expired job → 401; `saveResponse` not called
    * `[✅]`   POST with missing `job_id` → 400; no DB call
    * `[✅]`   Non-POST → 405
    * `[✅]`   `SUPABASE_HMAC_SECRET` missing at startup → function throws before serving any request
    * `[✅]`   `saveResponse` retriable error → 503; non-retriable error → 500
    * `[✅]`   Sig comparison is constant-time (no short-circuit on first byte mismatch)

  * `[✅]`   `supabase/config.toml`
    * `[✅]`   Add `[functions.netlifyResponse]` with `verify_jwt = false`

  * `[✅]`   Environment
    * `[✅]`   Update `DIALECTIC_SAVERESPONSE_URL` in `netlify/.env` and `supabase/functions/.env` to point to the `netlifyResponse` function URL
    * `[✅]`   Add `SUPABASE_HMAC_SECRET` to `supabase/functions/.env` (generate a strong random secret; must match the value in `dialectic-worker`'s env)

  * `[✅]`   dialectic-worker/index.ts cleanup
    * `[✅]`   Remove the `/saveResponse` path branch (`requestUrl.pathname.endsWith('/saveResponse')`) and the `handleSaveResponse` export — superseded by `netlifyResponse`
    * `[✅]`   Remove `CreateUserDbClientFn` type and its wiring from `handleSaveResponse`

  * `[✅]`   **Commit** `feat(netlifyResponse): HMAC-signed Netlify callback side door — removes user JWT dependency from saveResponse path`
    * `[✅]`   Structural: new `netlifyResponse` function group — `netlifyResponseHandler.ts`, `netlifyResponse.interface.ts`, `netlifyResponse.guard.ts`, `netlifyResponse.mock.ts`, `netlifyResponse.provides.ts`, `index.ts`; `[functions.netlifyResponse]` added to `supabase/config.toml`
    * `[✅]`   Behavioral: Netlify carries HMAC sig instead of user JWT; sig verified using constant-time element-by-element comparison before `saveResponse` is invoked; expired jobs rejected at the boundary; `adminClient` used as `SaveResponseParams.dbClient`
    * `[✅]`   Contract: `NetlifyResponseBody`, `NetlifyResponseDeps`, `NetlifyResponseHandlerFn` introduced; `isNetlifyResponseBody`, `isNetlifyResponseDeps` guards added
    * `[✅]`   Cleanup: `/saveResponse` route, `handleSaveResponse`, and `CreateUserDbClientFn` removed from `dialectic-worker/index.ts`

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