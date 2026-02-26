[ ] // So that find->replace will stop unrolling my damned instructions! 

# Stripe Fix: Auto and manual sync recurring and OTP 

## Problem Statement

The Stripe plan sync webhook correctly handles recurring subscription prices via both `price.created` and legacy `plan.created` events, but one-time purchase (OTP) prices are not reliably synced to the `subscription_plans` table. Two root causes:

1. **Webhook configuration gap:** If the Stripe webhook endpoint is only subscribed to `plan.created` (legacy Plans API) and not `price.created`, one-time prices never trigger a handler because Stripe only fires `plan.created` for recurring plans. The `price.created` handler exists and correctly distinguishes `one_time` vs `recurring`, but it must actually receive the event.
2. **Interval defaults bug:** In `handlePriceCreated` (lines 103-104), one-time prices receive `interval: 'day'` and `interval_count: 1` via fallback defaults instead of `null`. The DB schema allows nullable interval/interval_count (migration 20250521164601), but the handler assigns meaningless defaults for one-time prices.
3. **No manual sync capability:** The original `sync-stripe-plans` edge function was removed when the codebase shifted to the adapter/DI pattern. There is no way to bulk-sync existing Stripe prices to the database without deleting and recreating them in Stripe to trigger webhooks.

## Objectives

* Ensure `price.created` and `price.updated` webhook events are received and processed for both recurring and one-time prices
* Fix the `handlePriceCreated` handler so one-time prices store `null` for interval and interval_count
* Implement a manual sync edge function (`sync-stripe-plans`) that fetches all active prices from Stripe and feeds each through the existing `handlePriceCreated` handler, so sync logic is not duplicated
* The manual sync function uses the existing adapter/DI pattern and `ProductPriceHandlerContext`

## Expected Outcome

* Recurring and one-time prices are both synced to `subscription_plans` automatically via webhook events
* One-time prices have `plan_type = 'one_time_purchase'`, `interval = null`, `interval_count = null`
* An admin can trigger `POST /sync-stripe-plans` to bulk-sync all active Stripe prices to the database without recreating them in Stripe
* All new code follows the adapter/DI pattern established in the codebase

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## 1. Webhook configuration verification

*   `[✅]`   `[CONFIG]` Stripe Dashboard webhook event subscriptions
    *   `[✅]`   `objective`
        *   `[✅]`   Ensure the Stripe webhook endpoint is subscribed to `price.created`, `price.updated`, and `price.deleted` events in addition to `plan.created`
        *   `[✅]`   Without these events, one-time prices will never reach the existing handlers
    *   `[✅]`   `requirements`
        *   `[✅]`   In Stripe Dashboard → Developers → Webhooks, confirm the endpoint includes: `price.created`, `price.updated`, `price.deleted`, `product.created`, `product.updated`, `product.deleted`
        *   `[✅]`   Document which events were missing, if any, and confirm they have been added
        *   `[✅]`   This is a manual configuration step, not a code change

## 2. Fix handlePriceCreated interval defaults

*   `[✅]`   `_shared/adapters/stripe/handlers`/`stripe.priceCreated` **Fix one-time price interval defaults and in-file corrections**
    *   `[✅]`   `objective`
        *   `[✅]`   One-time prices must store `null` for `interval` and `interval_count` instead of defaulting to `'day'` and `1`
        *   `[✅]`   Remove the `|| 'day'` and `|| 1` fallback defaults on lines 103-104 that violate the no-defaults rule
        *   `[✅]`   Correct any other in-file violations of Instructions for Agent discovered during the edit (anti-patterns, missing types, defaults, etc.)
    *   `[✅]`   `role`
        *   `[✅]`   Adapter — translates Stripe `price.created` webhook events into `subscription_plans` DB upserts
    *   `[✅]`   `module`
        *   `[✅]`   Stripe payment adapter handler for price creation events
        *   `[✅]`   Boundary: receives `ProductPriceHandlerContext` + `Stripe.Event`, writes to `subscription_plans` table
    *   `[✅]`   `deps`
        *   `[✅]`   `ProductPriceHandlerContext` from `_shared/stripe.mock.ts` — adapter layer, provides Stripe client, Supabase client, logger
        *   `[✅]`   `parseProductDescription` from `_shared/utils/productDescriptionParser.ts` — utility layer, parses product description JSON
        *   `[✅]`   `PaymentConfirmation` from `_shared/types/payment.types.ts` — type layer, return type
        *   `[✅]`   `TablesInsert` from `types_db.ts` — infrastructure layer, DB insert type
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `ProductPriceHandlerContext.stripe` — Stripe SDK instance for `products.retrieve()`
        *   `[✅]`   `ProductPriceHandlerContext.supabaseClient` — Supabase client for `subscription_plans` upsert
        *   `[✅]`   `ProductPriceHandlerContext.logger` — structured logger
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   unit/`stripe.priceCreated.test.ts`
        *   `[✅]`   Test: one-time price upserts with `interval: null` and `interval_count: null`
        *   `[✅]`   Test: recurring price upserts with `interval` and `interval_count` from `price.recurring`
        *   `[✅]`   Test: one-time price sets `plan_type: 'one_time_purchase'`
        *   `[✅]`   Test: recurring price sets `plan_type: 'subscription'`
        *   `[✅]`   Preserve all existing test coverage
    *   `[✅]`   `stripe.priceCreated.ts`
        *   `[✅]`   Change line 103: `interval: price.type === 'recurring' ? price.recurring?.interval : null`
        *   `[✅]`   Change line 104: `interval_count: price.type === 'recurring' ? price.recurring?.interval_count : null`
        *   `[✅]`   Audit remaining file for defaults, casts, or other anti-patterns and correct in-file
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: adapter
        *   `[✅]`   Dependencies face inward (types, utils)
        *   `[✅]`   Provides face outward (called by `StripePaymentAdapter.handleWebhook` switch)
    *   `[✅]`   `requirements`
        *   `[✅]`   One-time prices produce `interval: null`, `interval_count: null` in the upsert payload
        *   `[✅]`   Recurring prices continue to produce correct `interval` and `interval_count` from Stripe data
        *   `[✅]`   No fallback defaults remain in the upsert construction
        *   `[✅]`   All existing tests continue to pass
    *   `[✅]`   **Commit** `fix: handlers/stripe.priceCreated — set null interval for one-time prices instead of default 'day'/1`

## 3. Implement sync-stripe-plans edge function

*   `[✅]`   `functions/sync-stripe-plans`/`syncAllPrices` **Manual bulk sync of all Stripe prices through existing handlers**
    *   `[✅]`   `objective`
        *   `[✅]`   Provide an admin-invocable edge function that fetches all active prices from Stripe and upserts them to `subscription_plans` by reusing the existing `handlePriceCreated` handler
        *   `[✅]`   Support both recurring and one-time prices in a single invocation
        *   `[✅]`   Support test/live mode selection consistent with the existing adapter factory pattern
    *   `[✅]`   `role`
        *   `[✅]`   Infrastructure — edge function entry point that orchestrates a bulk sync operation
    *   `[✅]`   `module`
        *   `[✅]`   Stripe plan synchronization
        *   `[✅]`   Boundary: receives authenticated POST request, fetches from Stripe API, delegates to `handlePriceCreated` for each price, returns summary response
    *   `[✅]`   `deps`
        *   `[✅]`   `handlePriceCreated` from `_shared/adapters/stripe/handlers/stripe.priceCreated.ts` — adapter layer, reused for per-price upsert logic
        *   `[✅]`   `ProductPriceHandlerContext` from `_shared/stripe.mock.ts` — adapter layer, context shape for handlers
        *   `[✅]`   `PaymentConfirmation` from `_shared/types/payment.types.ts` — type layer, return type from handler
        *   `[✅]`   `createSupabaseAdminClient` from `_shared/auth.ts` — infrastructure layer, Supabase admin client factory
        *   `[✅]`   `logger` from `_shared/logger.ts` — infrastructure layer, structured logger
        *   `[✅]`   `Stripe` SDK — external dependency, for `prices.list()` and constructing synthetic events
        *   `[✅]`   Stripe secret key resolution — follows same test/live mode pattern as `adapterFactory.ts`
        *   `[✅]`   Confirm no reverse dependency is introduced
    *   `[✅]`   `context_slice`
        *   `[✅]`   `ProductPriceHandlerContext` — constructed at the edge function boundary with Stripe instance, Supabase admin client, logger, functionsUrl, stripeWebhookSecret
        *   `[✅]`   Stripe instance — constructed from env-resolved secret key (test or live mode)
        *   `[✅]`   Confirm no concrete imports from higher or lateral layers
    *   `[✅]`   interface/`sync_plans.types.ts`
        *   `[✅]`   Update or replace the existing `_shared/types/sync_plans.types.ts` with types relevant to the new sync approach
        *   `[✅]`   `SyncStripePlansRequest` — shape of the POST body: `{ isTestMode?: boolean }`
        *   `[✅]`   `SyncStripePlansResult` — shape of the response: `{ success: boolean, synced: number, failed: number, errors: string[] }`
        *   `[✅]`   Remove or deprecate `ISyncPlansService` and `PlanUpsertData` if no longer referenced
    *   `[✅]`   unit/`syncAllPrices.test.ts`
        *   `[✅]`   Test: fetches all prices via `stripe.prices.list()` with `active: true` and auto-pagination
        *   `[✅]`   Test: constructs a synthetic `Stripe.Event` for each price and passes it to `handlePriceCreated`
        *   `[✅]`   Test: correctly counts successes and failures from handler results
        *   `[✅]`   Test: handles empty price list (no prices in Stripe) gracefully
        *   `[✅]`   Test: handles `handlePriceCreated` returning `success: false` for individual prices without aborting the batch
        *   `[✅]`   Test: both recurring and one-time prices are included in the fetch
    *   `[✅]`   `construction`
        *   `[✅]`   Edge function boundary constructs: Stripe instance (from env), Supabase admin client (from factory), `ProductPriceHandlerContext`
        *   `[✅]`   `syncAllPrices` receives `ProductPriceHandlerContext` via DI — no internal construction of dependencies
        *   `[✅]`   Prohibited: direct `Deno.env.get` inside `syncAllPrices` — env resolution happens at the edge function boundary only
    *   `[✅]`   `syncAllPrices.ts`
        *   `[✅]`   Accept `ProductPriceHandlerContext` as parameter
        *   `[✅]`   Call `context.stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] })` with auto-pagination to fetch all active prices
        *   `[✅]`   For each price, construct a synthetic `Stripe.Event` with `type: 'price.created'` and `data.object` set to the price
        *   `[✅]`   Call `handlePriceCreated(context, syntheticEvent)` for each price
        *   `[✅]`   Collect results: count successes and failures, accumulate error messages
        *   `[✅]`   Return `SyncStripePlansResult`
    *   `[✅]`   `functions/sync-stripe-plans/index.ts`
        *   `[✅]`   Edge function entry point using `serve()`
        *   `[✅]`   CORS preflight handling
        *   `[✅]`   Authorization: require `Authorization: Bearer <service_role_key>` — admin-only endpoint
        *   `[✅]`   Resolve test/live mode from request body `isTestMode` field, falling back to `VITE_STRIPE_TEST_MODE` env var (same pattern as `adapterFactory.ts`)
        *   `[✅]`   Construct Stripe instance with resolved secret key
        *   `[✅]`   Construct `ProductPriceHandlerContext` and pass to `syncAllPrices`
        *   `[✅]`   Return JSON response with `SyncStripePlansResult`
    *   `[✅]`   `stripe.mock.ts` updates
        *   `[✅]`   Add `pricesList` stub to `MockStripe.stubs` for `stripe.prices.list()`
        *   `[✅]`   Add `prices.list` to `getMockStripeInstance()` default implementation
    *   `[✅]`   `directionality`
        *   `[✅]`   Layer: infrastructure (edge function entry) calling adapter layer (handler)
        *   `[✅]`   Dependencies face inward (reuses existing handler, types, context)
        *   `[✅]`   Provides face outward (HTTP endpoint for admin invocation)
    *   `[✅]`   `requirements`
        *   `[✅]`   `POST /sync-stripe-plans` with optional `{ isTestMode: boolean }` body syncs all active Stripe prices
        *   `[✅]`   Both recurring and one-time prices are fetched and synced
        *   `[✅]`   Each price is processed through `handlePriceCreated`, so upsert logic is not duplicated
        *   `[✅]`   Response includes count of synced and failed prices, plus error details for failures
        *   `[✅]`   Endpoint requires service role key authorization
        *   `[✅]`   Test/live mode selection follows the same pattern as the existing adapter factory
    *   `[✅]`   **Commit** `feat: functions/sync-stripe-plans — bulk sync all Stripe prices through existing handlePriceCreated handler`

## 4. Update test script

*   `[✅]`   `[CONFIG]` `scripts/test_sync_stripe_plans.ps1` **Update test script for new edge function**
    *   `[✅]`   `objective`
        *   `[✅]`   Ensure the existing PowerShell test script works against the reimplemented `sync-stripe-plans` edge function
    *   `[✅]`   `requirements`
        *   `[✅]`   Verify the script's endpoint URL, headers, and request body shape match the new edge function's contract
        *   `[✅]`   Update if necessary to align with `SyncStripePlansRequest` shape
        *   `[✅]`   No functional changes unless the contract has changed



# ToDo

    - Regenerate individual specific documents on demand without regenerating inputs or other sibling documents 
    -- User reports that a single document failed and they liked the other documents, but had to regenerate the entire stage
    -- User requests option to only regenerate the exact document that failed
    -- Initial investigation shows this should be possible, all the deps are met, we just need a means to dispatch a job for only the exact document that errored or otherwise wasn't produced so that the user does't have to rerun the entire stage to get a single document
    -- Added bonus, this lets users "roll the dice" to get a different/better/alternative version of an existing document if they want to try again 
    -- FOR CONSIDERATION: This is a powerful feature but implies a branch in the work
    --- User generates stage, all succeeds
    --- User advances stages, decides they want to fix an oversight in a prior stage
    --- User regenerates a prior document
    --- Now subsequent documents derived from the original are invalid
    --- Is this a true branch/iteration, or do we highlight the downstream products so that those can be regenerated from the new input that was produced? 
    --- If we "only" highlight downstream products, all downstream products are invalid, because the header_context used to generate them would be invalid 
    --- PROPOSED: Implement regeneration prior to stage advancement, disable regeneration for documents who have downstream documents, set up future sprint for branching/iteration to support hints to regenerate downstream documents if a user regenerates upstream documents
    --- BLOCKER: Some stages are fundamentally dependent on all prior outputs, like synthesis, and the entire stage needs to be rerun if thesis/antithesis documents are regenerated

    - Set baseline values for each stage "Generate" action and encourage users to top up their account if they are at risk of NSF
    -- Pause the work mid-stream if NSF and encourage user to top up to continue 

    - hydrateAllStages doesn't, but the stage-specific one does
    -- Front end shows "complete" and "Submit Responses" as soon as a document is available instead of waiting for the entire stage to actually complete 
    -- Populating document list is unreliable
    -- Total progress indicator loses track constantly
    -- Stage completion indicators lose track the moment they're defocused

    - New user sign in banner doesn't display, throws console error  
    -- Chase, diagnose, fix 

   - Generating spinner stays present until page refresh 
   -- Needs to react to actual progress 
   -- Stop the spinner when a condition changes 

   - Checklist does not correctly find documents when multiple agents are chosen 

   - Refactor EMCAS to break apart the functions, segment out the tests
   -- Move gatherArtifacts call to processSimpleJob
   -- Decide where to measure & RAG

   - Switch to stream-to-buffer instead of chunking
   -- This lets us render the buffer in real time to show document progress 

   - Build test fixtures for major function groups 
   -- Provide standard mock factories and objects 

   - Show exact job progress in front end as pop up while working, then minimize to documents once documents arrive 