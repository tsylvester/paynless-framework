[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* **Hydrate user tier from profile fetch and surface it across FE**

  This ticket covers two concerns: (A) plumbing — the BE `/me` endpoint returns tier data, the FE stores it separately from the user profile, and (B) UI consumption — every surface that displays or reacts to the user's tier reads from the new store property.

  ### A. Plumbing (BE edit + types + store)

  **BE edit — `supabase/functions/me/index.ts`**: The GET handler currently fetches only `user_profiles`. It must also query `user_subscriptions.tier_level` for the authenticated user's tier, and  `tier_definitions` to get `name`, `output_cap_tokens`, and `max_models_per_project` to get the full `tier_definitions` object. Return the tier object alongside `profile` in the response: `{ user, profile, userTier: { level, name, output_cap_tokens, max_models_per_project }, tiers: [] }`. When no `user_subscriptions` row exists (edge case — should not happen, `handle_new_user` creates one), default to `userTier = { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }`. Update the corresponding test file `supabase/functions/me/index.test.ts` and integration test `supabase/functions/me/me.integration.test.ts`.

  **FE type — `packages/types/src/auth.types.ts`**: Add a `UserTier` interface: `{ level: number; name: string; output_cap_tokens: number | null; max_models_per_project: number | null }`. Add `tier: UserTier | null` to `ProfileResponse`. Add `userTier: UserTier | null` to `AuthStore` (state property) and `setTier: (tier: UserTier | null) => void` (setter). `UserTier` is a FE application type, not a DB row alias — it maps the `/me` response shape, not the `tier_definitions` table directly. The user's tier is a separate concern from `UserProfile` ("what can they access" vs "who they are") and must be stored and accessed independently. Add `availableTiers: Tier[]` where each entry in `Tier[]` is mapped to a tier from the tier object returned alongside the profile. 

  **FE store — `packages/store/src/authStore.ts`**: 
  - Add `tier: null` to initial state (alongside `profile: null`).
  - Add `setTier` setter.
  - In `_fetchAndSetProfile` (line 507): after receiving the `/me` response, set `userTier` from `profileResponse.data.tier` separately from `profile`. On fetch failure or logout, set `userTier: 0`, the lowest (free) tier. Do not set `tier: null` which can be misinterpreted for Ultra (unlimited) where restrictions are set to null.
  - The auth listener `SIGNED_OUT` case (line 642) must also clear `userTier: undefined` (not null, which can be mistaken for Ultra/unlimited).
  - Update `authStore.profile.test.ts` for the new tier state management.

  ### B. UI consumption (read tier from store, display dynamically)

  **Dashboard "Plan" card — `apps/web/src/pages/Dashboard.tsx`**:
  - Line 170 is hardcoded: `<div className="text-2xl font-bold">Free</div>`. Replace with the tier name from store (e.g., "Free", "Basic", "Premium", "Ultra").
  - Line 172 is hardcoded: `<Link to="/subscription">Upgrade to Pro</Link>`. Replace with a dynamic CTA: if tier is not the highest, show "Upgrade to {next tier name}"; if tier is highest, show nothing or a "Top up tokens" CTA when wallet balance is low. The actual CTA destination and marketing copy can be refined later; the plumbing must be dynamic from day one.
  - Update `apps/web/src/pages/Dashboard.test.tsx`.

  **Sidebar user popup — `apps/web/src/components/sidebar/nav-user.tsx`**:
  - Line 127 is hardcoded: `Upgrade to Pro`. The `NavUser` component renders a dropdown when the user clicks their name/email. The "Upgrade to Pro" button (line 121-128) must read the user's tier from the auth store. If the user is on the highest tier, hide or rephrase the CTA. Otherwise, show "Upgrade to {next tier name}" or similar.
  - The `NavUser` component currently receives only `{ email: string }` as props. It already imports `useAuthStore` (line 3). The tier should be read directly from `useAuthStore` inside the component, not passed as a prop — this keeps the prop interface stable and the component self-sufficient for tier awareness.
  - Update `apps/web/src/components/sidebar/nav-user.test.tsx`.

  **Subscription page — `apps/web/src/pages/Subscription.tsx`**:
  - Currently identifies the user's plan via `currentUserResolvedPlan` from the subscription store. The tier level is a separate, more authoritative indicator of the user's access level (tier is computed by the BE from subscription + ratchet logic). The subscription page should read tier from the auth store to:
    - Visually highlight the user's current tier among the plan cards.
    - Show an "upgrade" badge or CTA on plans that are a higher tier than the user's current tier.
    - Plans below or at the user's tier should show "Current" or "Downgrade" as appropriate.
  - Update `apps/web/src/pages/Subscription.test.tsx`.

  **Profile page — `apps/web/src/pages/Profile.tsx`**:
  - Currently shows: wallet balance, name, email, password, privacy settings, notification settings. No tier display.
  - Add a "Plan & Tier" card (or similar) that shows the user's current tier name, output cap, max models per project, and a link to the subscription page for upgrades.
  - Update `apps/web/src/pages/Profile.test.tsx`.

  ### Known files in dependency order

  1. `packages/types/src/auth.types.ts` — add `UserTier` interface, update `ProfileResponse`, update `AuthStore`
  2. `supabase/functions/me/index.ts` — BE: add tier query + response shape
  3. `supabase/functions/me/index.test.ts` — BE: update tests for new response
  4. `supabase/functions/me/me.integration.test.ts` — BE: integration test for tier in response
  5. `packages/store/src/authStore.ts` — add `tier` state, `setTier`, update `_fetchAndSetProfile` and logout
  6. `packages/store/src/authStore.profile.test.ts` — update tests for tier state
  7. `apps/web/src/pages/Dashboard.tsx` — dynamic Plan card
  8. `apps/web/src/pages/Dashboard.test.tsx` — update tests
  9. `apps/web/src/components/sidebar/nav-user.tsx` — dynamic Upgrade CTA
  10. `apps/web/src/components/sidebar/nav-user.test.tsx` — update tests
  11. `apps/web/src/pages/Subscription.tsx` — tier-aware plan display
  12. `apps/web/src/pages/Subscription.test.tsx` — update tests
  13. `apps/web/src/pages/Profile.tsx` — new tier card
  14. `apps/web/src/pages/Profile.test.tsx` — update tests
  15. `apps/web/src/mocks/profile.mock.ts` — may need tier mock data for test support

  ### Dependencies on other tickets

  - This ticket is a prerequisite for Ticket 2 (model selector gating), Ticket 3 (output clamp slider), and Ticket 7 (marketing/upgrade prompts). All of those read tier from the auth store established here.
  - No dependency on other tickets — this is the first ticket in the FE tier implementation.

  * `[ ]` `supabase/functions/me/index.ts` **[BE] Add tier data to GET /me response**

    * `[ ]` `objective`
      * `[ ]` The GET `/me` handler currently returns only `{ user, profile }`. It must also return the authenticated user's tier record and all available tier definitions so the FE can hydrate tier state from a single fetch — with no defaults, no silent fallbacks, and no swallowed errors.
      * `[ ]` Functional goals: (1) query `user_subscriptions.tier_level` for the authenticated user, (2) fetch all `tier_definitions` rows ordered by `level`, (3) find the matching tier definition by `level`, (4) include `userTier: TierRow` and `tiers: TierRow[]` in the response.
      * `[ ]` Non-functional: all query failures must return explicit error responses — no fallback tier data, no substituted defaults, no swallowed errors. The additional queries must not break existing POST behavior or response shape for `user` and `profile`.

    * `[ ]` `role`
      * `[ ]` Adapter layer — Supabase Edge Function endpoint that serves as the API boundary for user profile + tier data.
      * `[ ]` This node must NOT define FE types, FE store logic, or UI behavior — those belong to downstream nodes.

    * `[ ]` `module`
      * `[ ]` Bounded context: user identity and access level. The `/me` endpoint is the single source of truth for "who is this user and what can they access."
      * `[ ]` Inside this boundary: user profile, user subscription tier level, tier definitions.
      * `[ ]` Outside this boundary: subscription management, payment flows, model gating.

    * `[ ]` `deps`
      * `[ ]` `MeHandlerDeps` — currently defined inline in `index.ts` lines 18–25 in violation of the no-inline-interfaces rule; must be extracted to `index.interface.ts` in this node.
      * `[ ]` DB tables consumed: `user_profiles` (existing, FK column `id`), `user_subscriptions` (new — FK column `user_id: string`, `tier_level: number`, confirmed by `types_db.ts` line 2281 and FK `user_subscriptions_user_id_fkey` at line 2329), `tier_definitions` (new — `level: number`, `name: string`, `output_cap_tokens: number | null`, `max_models_per_project: number | null`, per `types_db.ts` lines 2081–2084).
      * `[ ]` DB types used: `Database['public']['Tables']['tier_definitions']['Row']` aliased as `TierRow` in `index.interface.ts`; `Database['public']['Tables']['user_subscriptions']['Row']` for subscription query result typing.
      * `[ ]` No reverse or lateral layer violations — `types_db.ts` is the lowest-level type provider.

    * `[ ]` `context_slice`
      * `[ ]` The handler uses the existing Supabase client (from `deps.createSupabaseClient(req)`) for all queries — no new injection surface needed.
      * `[ ]` The authenticated `user.id` (from `supabase.auth.getUser()`) keys `user_profiles.id` and `user_subscriptions.user_id` (column names confirmed above from `types_db.ts`).

    * `[ ]` `supabase/functions/me/index.interface.test.ts`
      * `[ ]` Contract cases for `TierRow`:
        * Valid: `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }` — all fields present with correct types
        * Valid: `{ level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }` — nullable fields are null
        * Invalid: missing `level` field
        * Invalid: missing `name` field
        * Invalid: `level` is a string instead of number
        * Invalid: `null` value for the whole object
      * `[ ]` Contract cases for `MeGetResponse`:
        * Valid: object with non-null `user`, non-null `profile`, `userTier` satisfying `TierRow`, non-empty `tiers` array of `TierRow`
        * Invalid: missing `userTier` key
        * Invalid: missing `tiers` key
        * Invalid: `tiers` is an empty array (response requires at least one tier)

    * `[ ]` `supabase/functions/me/index.interface.ts`
      * `[ ]` Import `Database` from `'../types_db.ts'`
      * `[ ]` Import `User` from `'npm:@supabase/gotrue-js@^2.6.3'`
      * `[ ]` Import `typeof` dep-function types from their source files (same modules already imported in `index.ts` lines 5–14): `handleCorsPreflightRequest`, `createErrorResponse`, `createSuccessResponse` from `'../_shared/cors-headers.ts'`; `createSupabaseClient`, `createUnauthorizedResponse` from `'../_shared/auth.ts'`; `getEmailMarketingService` from `'../_shared/email_service/factory.ts'`
      * `[ ]` Define and export `TierRow` type alias: `export type TierRow = Database['public']['Tables']['tier_definitions']['Row']`
      * `[ ]` Define and export `MeGetResponse` interface:
        * `user: User`
        * `profile: Database['public']['Tables']['user_profiles']['Row']`
        * `userTier: TierRow`
        * `tiers: TierRow[]`
      * `[ ]` Move `MeHandlerDeps` verbatim from `index.ts` lines 18–25 into this file and export it
      * `[ ]` After this file is written: remove the inline `export interface MeHandlerDeps` block from `index.ts` (lines 17–25) and add `import type { MeHandlerDeps, MeGetResponse, TierRow } from './index.interface.ts'`

    * `[ ]` `interaction.spec`
      * `[ ]` GET `/me` updated call pattern — all failure modes return explicit error responses, no fallbacks:
        1. Authenticate user via `supabase.auth.getUser()`; if `userError` or no `user`, return 401
        2. Fetch `user_profiles` by `id = user.id` using `.single()` (existing logic — PGRST116 triggers profile creation, other errors return 500)
        3. Fetch `user_subscriptions` selecting `tier_level` where `user_id = user.id` using `.maybeSingle()`:
           - If `subscriptionError` → `return deps.createErrorResponse("Failed to fetch user subscription", 500, req)`
           - If `subscriptionData` is `null` (no row exists) → `return deps.createErrorResponse("No subscription found for user", 500, req)`
        4. Fetch all `tier_definitions` selecting `level, name, output_cap_tokens, max_models_per_project` ordered by `level` ascending:
           - If `tiersError` → `return deps.createErrorResponse("Failed to fetch tier definitions", 500, req)`
           - If `allTiers` is empty → `return deps.createErrorResponse("No tier definitions configured", 500, req)`
        5. Find matching tier: `(allTiers as TierRow[]).find(t => t.level === subscriptionData.tier_level)`:
           - If no match → `return deps.createErrorResponse("User tier level not found in definitions", 500, req)`
        6. Build typed `responseData: MeGetResponse = { user, profile: profileData, userTier: matchingTier, tiers: allTiers as TierRow[] }` and return via `deps.createSuccessResponse(responseData, 200, req)`
      * `[ ]` Failure modes — all return explicit 500 error responses, no swallowed errors, no substituted defaults:
        * `user_subscriptions` query errors → 500 "Failed to fetch user subscription"
        * `user_subscriptions` returns null (no row exists) → 500 "No subscription found for user"
        * `tier_definitions` query errors → 500 "Failed to fetch tier definitions"
        * `tier_definitions` returns empty array → 500 "No tier definitions configured"
        * No `tier_definitions` entry matches `tier_level` → 500 "User tier level not found in definitions"
      * `[ ]` POST `/me` is unchanged — no tier logic in the update path.

    * `[ ]` `supabase/functions/me/index.guard.test.ts`
      * `[ ]` Test `isTierRow` — no false negatives:
        * Accepts: `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }`
        * Accepts: `{ level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }`
      * `[ ]` Test `isTierRow` — no false positives:
        * Rejects: `null`
        * Rejects: object missing `level`
        * Rejects: object missing `name`
        * Rejects: object where `level` is a string
      * `[ ]` Test `isMeGetResponse` — no false negatives:
        * Accepts: full valid `MeGetResponse` with populated `userTier` and non-empty `tiers`
      * `[ ]` Test `isMeGetResponse` — no false positives:
        * Rejects: object missing `userTier`
        * Rejects: object missing `tiers`
        * Rejects: object where `tiers` is an empty array

    * `[ ]` `supabase/functions/me/index.guard.ts`
      * `[ ]` Import `TierRow`, `MeGetResponse` from `'./index.interface.ts'`
      * `[ ]` Export `isTierRow(value: unknown): value is TierRow`:
        * `typeof value === 'object' && value !== null`
        * `typeof (value as Record<string, unknown>).level === 'number'`
        * `typeof (value as Record<string, unknown>).name === 'string'`
        * `(value as Record<string, unknown>).output_cap_tokens === null || typeof (value as Record<string, unknown>).output_cap_tokens === 'number'`
        * `(value as Record<string, unknown>).max_models_per_project === null || typeof (value as Record<string, unknown>).max_models_per_project === 'number'`
      * `[ ]` Export `isMeGetResponse(value: unknown): value is MeGetResponse`:
        * `typeof value === 'object' && value !== null`
        * `(value as Record<string, unknown>).user != null`
        * `(value as Record<string, unknown>).profile != null`
        * `isTierRow((value as Record<string, unknown>).userTier)`
        * `Array.isArray((value as Record<string, unknown>).tiers) && ((value as Record<string, unknown>).tiers as unknown[]).length > 0 && ((value as Record<string, unknown>).tiers as unknown[]).every(isTierRow)`

    * `[ ]` `supabase/functions/me/index.test.ts`
      * `[ ]` Update default `setup()` mock config to include `user_subscriptions` and `tier_definitions` table mock results (arrays — `supabase.mock.ts` lines 862–874 confirm the mock unwraps single-element arrays to a single object for `.maybeSingle()` calls):
        * `user_subscriptions.select`: `{ data: [{ tier_level: 0 }], error: null }`
        * `tier_definitions.select`: `{ data: [{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }, { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 }, { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 }, { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }], error: null }`
      * `[ ]` Update existing test "GET: successful profile fetch returns profile" to assert `createSuccessSpy` was called with an object containing `userTier` (with all four `TierRow` fields) and `tiers` (array of length 4).
      * `[ ]` Add test: "GET: returns correct userTier for tier_level 0"
        * Setup: default mock (`tier_level: 0`)
        * Assert: `userTier` in success response equals `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }`
      * `[ ]` Add test: "GET: returns correct userTier for tier_level 20"
        * Setup: `user_subscriptions.select` returns `{ data: [{ tier_level: 20 }], error: null }`
        * Assert: `userTier` in response equals `{ level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 }`
      * `[ ]` Add test: "GET: returns all tier_definitions in tiers array"
        * Assert: `tiers` in response is the full array of 4 tier definitions ordered by `level` ascending
      * `[ ]` Add test: "GET: returns 500 when user_subscriptions query errors"
        * Setup: `user_subscriptions.select` returns `{ data: null, error: new Error('query failed') }`
        * Assert: `createErrorSpy` called; `createSuccessSpy` not called
      * `[ ]` Add test: "GET: returns 500 when user_subscriptions row does not exist"
        * Setup: `user_subscriptions.select` returns `{ data: null, error: null }` (maybeSingle with no row — mock returns null data, null error per `supabase.mock.ts` line 873)
        * Assert: `createErrorSpy` called; `createSuccessSpy` not called
      * `[ ]` Add test: "GET: returns 500 when tier_definitions query errors"
        * Setup: `tier_definitions.select` returns `{ data: null, error: new Error('query failed') }`
        * Assert: `createErrorSpy` called; `createSuccessSpy` not called
      * `[ ]` Add test: "GET: returns 500 when tier_definitions returns empty array"
        * Setup: `tier_definitions.select` returns `{ data: [], error: null }`
        * Assert: `createErrorSpy` called; `createSuccessSpy` not called
      * `[ ]` Add test: "GET: returns 500 when tier_level has no matching tier definition"
        * Setup: `user_subscriptions.select` returns `{ data: [{ tier_level: 99 }], error: null }` (level 99 not present in tier_definitions)
        * Assert: `createErrorSpy` called; `createSuccessSpy` not called

    * `[ ]` `supabase/functions/me/index.ts`
      * `[ ]` Add import: `import type { MeHandlerDeps, MeGetResponse, TierRow } from './index.interface.ts'`
      * `[ ]` Remove inline `export interface MeHandlerDeps` block (lines 17–25) — it now lives in `index.interface.ts`
      * `[ ]` In the GET case, after the profile fetch block (line 106) and before the current `responseData` construction (line 110), insert:
        1. `const { data: subscriptionData, error: subscriptionError } = await supabase.from('user_subscriptions').select('tier_level').eq('user_id', user.id).maybeSingle();`
        2. `console.log('[me/index.ts] Subscription fetch: data=%s, error=%s', !!subscriptionData, subscriptionError?.message);`
        3. `if (subscriptionError) { return deps.createErrorResponse("Failed to fetch user subscription", 500, req); }`
        4. `if (!subscriptionData) { return deps.createErrorResponse("No subscription found for user", 500, req); }`
        5. `const { data: allTiers, error: tiersError } = await supabase.from('tier_definitions').select('level, name, output_cap_tokens, max_models_per_project').order('level', { ascending: true });`
        6. `console.log('[me/index.ts] Tier definitions fetch: count=%s, error=%s', allTiers?.length, tiersError?.message);`
        7. `if (tiersError) { return deps.createErrorResponse("Failed to fetch tier definitions", 500, req); }`
        8. `if (!allTiers || allTiers.length === 0) { return deps.createErrorResponse("No tier definitions configured", 500, req); }`
        9. `const userTier: TierRow | undefined = (allTiers as TierRow[]).find(t => t.level === (subscriptionData as { tier_level: number }).tier_level);`
        10. `if (!userTier) { return deps.createErrorResponse("User tier level not found in definitions", 500, req); }`
      * `[ ]` Replace the `responseData` block (lines 110–115) with: `const responseData: MeGetResponse = { user, profile: profileData as Database['public']['Tables']['user_profiles']['Row'], userTier, tiers: allTiers as TierRow[] };` followed by `return deps.createSuccessResponse(responseData, 200, req);` — casting of Supabase client return values is permitted per the explicit Supabase typing exception in `rules.md`.
      * `[ ]` Add import of `Database` from `'../types_db.ts'` to support the cast in the previous step.
      * `[ ]` No changes to POST handler, CORS handling, or error handling outside the GET case.

    * `[ ]` `supabase/functions/me/index.mock.ts`
      * `[ ]` Import `MeGetResponse`, `TierRow` from `'./index.interface.ts'`
      * `[ ]` Import `User` from `'npm:@supabase/gotrue-js@^2.6.3'`
      * `[ ]` Export `createMockTierRow(overrides?: Partial<TierRow>): TierRow` — factory for a full valid free-tier `TierRow`: `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }` merged with `overrides`; `overrides` may be omitted for the default free-tier shape
      * `[ ]` Export `createMockMeGetResponse(user: User, overrides?: Partial<MeGetResponse>): MeGetResponse` — factory that builds a full valid `MeGetResponse` using `createMockTierRow()` for `userTier` and a single-element `tiers` array, merged with `overrides`

    * `[ ]` `supabase/functions/me/index.provides.ts`
      * `[ ]` Re-export `handleMeRequest` from `'./index.ts'`
      * `[ ]` Re-export `MeHandlerDeps`, `MeGetResponse`, `TierRow` from `'./index.interface.ts'`
      * `[ ]` Re-export `isTierRow`, `isMeGetResponse` from `'./index.guard.ts'`
      * `[ ]` Re-export `createMockTierRow`, `createMockMeGetResponse` from `'./index.mock.ts'`
      * `[ ]` No external consumer of this module imports from any file other than `index.provides.ts`

    * `[ ]` `supabase/functions/me/me.integration.test.ts`
      * `[ ]` In the "GET /me handler" suite, update "Success: Call /me with a valid token returns user and profile" to add:
        * `assertExists(body.userTier)` — user tier object exists
        * `assertEquals(typeof body.userTier.level, 'number')` — level is a number
        * `assertEquals(typeof body.userTier.name, 'string')` — name is a string
        * `assertExists(body.tiers)` — tiers array exists
        * `assertEquals(Array.isArray(body.tiers), true)` — tiers is an array
        * `assert(body.tiers.length > 0)` — at least one tier definition returned
      * `[ ]` Add test: "Success: userTier fields match TierRow shape"
        * Assert: `body.userTier` has exactly `level`, `name`, `output_cap_tokens`, `max_models_per_project` keys
        * Assert: `body.userTier.level` is `0` (test user gets free tier from `handle_new_user` trigger)
        * Assert: `body.userTier.name` is `'free'`
      * `[ ]` Add test: "Success: tiers array contains all seeded tier definitions"
        * Assert: `body.tiers` contains entries with levels `[0, 10, 20, 30]`
        * Assert: each entry has `level`, `name`, `output_cap_tokens`, `max_models_per_project`

    * `[ ]` `requirements`
      * `[ ]` GET `/me` returns `userTier: TierRow` derived from `user_subscriptions.tier_level` joined to `tier_definitions` — no default or fallback value
      * `[ ]` GET `/me` returns `tiers: TierRow[]` with all `tier_definitions` rows ordered by `level`
      * `[ ]` All five failure modes (`user_subscriptions` error, no subscription row, `tier_definitions` error, empty definitions, unmatched tier level) return explicit 500 error responses — no swallowed errors, no silent defaults
      * `[ ]` `MeHandlerDeps` interface lives in `index.interface.ts`, not inline in `index.ts`
      * `[ ]` `MeGetResponse` and `TierRow` types are defined and exported from `index.interface.ts`
      * `[ ]` `isTierRow` and `isMeGetResponse` type guards exist in `index.guard.ts`
      * `[ ]` `createMockTierRow` and `createMockMeGetResponse` factories exist in `index.mock.ts`
      * `[ ]` `index.provides.ts` is the sole external boundary for this module
      * `[ ]` POST `/me` behavior is unchanged
      * `[ ]` All existing unit and integration tests continue to pass
      * `[ ]` All new unit and integration tests pass

  * `[ ]` `packages/store/src/authStore.ts` **[STORE] Add tier state, setter, hydration from /me response, logout clear**

    * `[ ]` `objective`
      * `[ ]` The auth store has no concept of tier. After this node, the store holds `userTier` (the authenticated user's tier) and `availableTiers` (all tier definitions), both hydrated from the `/me` response. Every FE surface that needs tier data reads from this store.
      * `[ ]` Functional goals: (1) add `UserTier` type, (2) update `ProfileResponse` to include tier data, (3) add tier state properties and setters to `AuthStore`, (4) hydrate tier from `_fetchAndSetProfile` with explicit conditional — no defaults or fallbacks, (5) clear tier on logout/SIGNED_OUT.
      * `[ ]` Non-functional: must not break existing profile, session, or auth state management.

    * `[ ]` `role`
      * `[ ]` State management layer — Zustand store that holds and distributes user identity and access-level data to all FE consumers.
      * `[ ]` This node must NOT define UI behavior, model gating, or subscription logic.

    * `[ ]` `module`
      * `[ ]` Bounded context: FE auth state. The auth store is the single source of truth for "who is the user and what tier are they."
      * `[ ]` Inside: user, session, profile, userTier, availableTiers.
      * `[ ]` Outside: subscription management, model selection, cost estimation.

    * `[ ]` `deps`
      * `[ ]` Depends on prior node `supabase/functions/me/index.ts` — the BE must return `userTier` and `tiers` in the GET `/me` response before the FE can consume them.
      * `[ ]` `packages/types/src/auth.types.ts` — type changes are included in this node (types are never orphaned into their own node).
      * `[ ]` `@paynless/api` — the existing `getApiClient().get<ProfileResponse>('me', ...)` call in `_fetchAndSetProfile` already fetches the response; the new fields are consumed from the same response.

    * `[ ]` `context_slice`
      * `[ ]` `_fetchAndSetProfile` (line 507 of `authStore.ts`) already fetches the `/me` response as `ProfileResponse`. After the type update, `profileResponse.data.userTier` and `profileResponse.data.tiers` become available. No new API call or injection surface needed.

    * `[ ]` `packages/types/src/auth.types.ts`
      * `[ ]` Add `UserTier` interface after `UserProfile` (line 66):
        ```
        export interface UserTier {
          level: number;
          name: string;
          output_cap_tokens: number | null;
          max_models_per_project: number | null;
        }
        ```
      * `[ ]` Update `ProfileResponse` (line 129-132) — add two optional fields to accommodate deployment order (FE may run briefly against a BE not yet serving these fields):
        * `userTier?: UserTier` — the user's current tier (optional for deployment compat)
        * `tiers?: UserTier[]` — all tier definitions (optional for deployment compat)
      * `[ ]` Update `AuthStore` interface (line 69):
        * Add state property: `userTier: UserTier | null;` (after `profile` at line 104)
        * Add state property: `availableTiers: UserTier[];` (after `userTier`)
        * Add setter: `setTier: (tier: UserTier | null) => void;` (after `setProfile` at line 73)
        * Add setter: `setAvailableTiers: (tiers: UserTier[]) => void;` (after `setTier`)

    * `[ ]` `packages/store/src/authStore.profile.test.ts`
      * `[ ]` Add `UserTier` to the type imports from `@paynless/types`.
      * `[ ]` Add mock tier constants at the top of the file (after existing mock data):
        * `const mockFreeTier: UserTier = { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 };`
        * `const mockAllTiers: UserTier[] = [{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }, { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 }, { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 }, { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }];`
      * `[ ]` Add new describe block "AuthStore - Tier State Management" at the end of the file with tests:
        * `[ ]` Test: "initial state has userTier: null and availableTiers: []"
          * Assert: `useAuthStore.getState().userTier` is `null`
          * Assert: `useAuthStore.getState().availableTiers` deep equals `[]`
        * `[ ]` Test: "setTier sets userTier in state"
          * Call `useAuthStore.getState().setTier(mockFreeTier)`
          * Assert: `useAuthStore.getState().userTier` deep equals `mockFreeTier`
        * `[ ]` Test: "setTier(null) clears userTier"
          * Set tier then clear: `setTier(mockFreeTier)` then `setTier(null)`
          * Assert: `useAuthStore.getState().userTier` is `null`
        * `[ ]` Test: "setAvailableTiers sets availableTiers in state"
          * Call `useAuthStore.getState().setAvailableTiers(mockAllTiers)`
          * Assert: `useAuthStore.getState().availableTiers` deep equals `mockAllTiers`
        * `[ ]` Test: "setAvailableTiers([]) clears availableTiers"
          * Set then clear: `setAvailableTiers(mockAllTiers)` then `setAvailableTiers([])`
          * Assert: `useAuthStore.getState().availableTiers` deep equals `[]`

    * `[ ]` `packages/store/src/authStore.ts`
      * `[ ]` Update imports (line 1-11): add `UserTier` to the import from `@paynless/types`.
      * `[ ]` Add initial state properties inside `create<AuthStore>()` (after `profile: null` at line 58):
        * `userTier: null,`
        * `availableTiers: [],`
      * `[ ]` Add `setTier` setter (after `setProfile` at line 70):
        * `setTier: (tier: UserTier | null) => set({ userTier: tier }),`
      * `[ ]` Add `setAvailableTiers` setter (after `setTier`):
        * `setAvailableTiers: (tiers: UserTier[]) => set({ availableTiers: tiers }),`
      * `[ ]` Update `_fetchAndSetProfile` (line 507-570) — in the success branch (line 522, `if (profileResponse.data?.profile)`):
        * After `useAuthStore.setState({ profile: fetchedProfile, error: null })` at line 525, add tier hydration with an explicit conditional — no `??` operators, no hardcoded default tier data:
          ```
          if (profileResponse.data.userTier && profileResponse.data.tiers) {
              const userTier: UserTier = profileResponse.data.userTier;
              const availableTiers: UserTier[] = profileResponse.data.tiers;
              useAuthStore.setState({ userTier, availableTiers });
              logger.debug('[AuthListener Helper] Tier hydrated.', { userTier, tierCount: availableTiers.length });
          } else {
              logger.error('[AuthListener Helper] Profile response missing tier data — cannot determine user privilege level.');
              useAuthStore.setState({ userTier: null, availableTiers: [], error: new Error('Failed to load tier data') });
          }
          ```
        * In the failure branches (line 551-553 `else` block and line 560-564 `catch` block), add to the existing `useAuthStore.setState` calls — same pattern already used for `profile: null` and its `error`:
          * Add `userTier: null, availableTiers: [],` to each existing setState call in these branches (the `error` field is already set in those branches)
      * `[ ]` Update SIGNED_OUT case (line 639-666) — in the `useAuthStore.setState` call at line 641:
        * Add `userTier: null,` and `availableTiers: [],` to the state clear object alongside `user: null, session: null, profile: null`.

    * `[ ]` `apps/web/src/mocks/profile.mock.ts`
      * `[ ]` Add import for `UserTier` from `@paynless/types`.
      * `[ ]` Add mock tier data exports after the existing `mockUserProfile`:
        * `export const mockUserTier: UserTier = { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 };`
        * `export const mockAllTiers: UserTier[] = [{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }, { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 }, { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 }, { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }];`

    * `[ ]` `apps/web/src/mocks/authStore.mock.ts`
      * `[ ]` In `initializeMockAuthState()` (line 19-59), add the four new `AuthStore` fields so the mock compiles after the `AuthStore` interface update:
        * After `showWelcomeModal: false,` (line 27), add:
          * `userTier: null,`
          * `availableTiers: [],`
        * After `setShowWelcomeModal: vi.fn(...)` (line 37-39), add:
          * `setTier: vi.fn(),`
          * `setAvailableTiers: vi.fn(),`

    * `[ ]` `requirements`
      * `[ ]` `UserTier` interface exists in `packages/types/src/auth.types.ts` with `{ level: number; name: string; output_cap_tokens: number | null; max_models_per_project: number | null }`
      * `[ ]` `ProfileResponse` includes optional `userTier?: UserTier` and `tiers?: UserTier[]` fields
      * `[ ]` `AuthStore` interface includes `userTier: UserTier | null`, `availableTiers: UserTier[]`, `setTier`, and `setAvailableTiers`
      * `[ ]` `authStore.ts` initial state has `userTier: null` and `availableTiers: []`
      * `[ ]` `_fetchAndSetProfile` hydrates `userTier: UserTier` and `availableTiers: UserTier[]` from the `/me` response when both fields are present; when either field is absent, calls `logger.error` and sets `{ userTier: null, availableTiers: [], error: new Error('Failed to load tier data') }` — the error surfaces to the UI so the user is not silently presented a broken application that cannot determine their privilege level
      * `[ ]` `_fetchAndSetProfile` failure branches (profile fetch error and catch block) add `userTier: null, availableTiers: []` to the existing `useAuthStore.setState` calls — the `error` field is already set in those branches
      * `[ ]` SIGNED_OUT clears `userTier` to `null` and `availableTiers` to `[]`
      * `[ ]` `setTier` and `setAvailableTiers` setters work correctly (proven by unit tests)
      * `[ ]` Mock tier data exists in `apps/web/src/mocks/profile.mock.ts` for downstream node test support
      * `[ ]` `authStore.mock.ts` includes `userTier: null`, `availableTiers: []`, `setTier: vi.fn()`, and `setAvailableTiers: vi.fn()` so all downstream test files compile after `AuthStore` type update
      * `[ ]` All existing auth store tests continue to pass
      * `[ ]` All new tier state management tests pass

  * `[ ]` `apps/web/src/pages/Dashboard.tsx` **[UI] Dynamic Plan card — tier name and upgrade CTA from store**

    * `[ ]` `objective`
      * `[ ]` The Plan card in the stats row is hardcoded to show "Free" and "Upgrade to Pro". After this node, the card reads the user's tier from the auth store and displays the tier name dynamically, with a context-aware upgrade CTA.
      * `[ ]` Non-functional: must not break existing dashboard layout, loading, or redirect behavior.

    * `[ ]` `role`
      * `[ ]` UI presentation layer — a React page component that reads from the auth store and renders tier-aware content.
      * `[ ]` This node must NOT modify store logic, types, or BE endpoints.

    * `[ ]` `module`
      * `[ ]` Bounded context: dashboard overview. The Plan card is one of four stats cards.
      * `[ ]` Inside: rendering the user's tier name and a contextual upgrade/top-up CTA.
      * `[ ]` Outside: subscription management, checkout flows, tier mutation.

    * `[ ]` `deps`
      * `[ ]` Depends on prior node `packages/store/src/authStore.ts` — `userTier` and `availableTiers` must be available in the auth store.
      * `[ ]` `useAuthStore` is already imported (line 3). The selector at line 41-45 must be extended to also read `userTier` and `availableTiers`.

    * `[ ]` `context_slice`
      * `[ ]` The component already calls `useAuthStore((state) => ({ user, profile, isLoading }))` at line 41. The tier data is read from the same store with `userTier: state.userTier` and `availableTiers: state.availableTiers` added to the selector.

    * `[ ]` `apps/web/src/pages/Dashboard.test.tsx`
      * `[ ]` Import `UserTier` and `Tier` from `@paynless/types`.
      * `[ ]` Add mock tier data constants at the top:
        * `const mockFreeTier: UserTier = { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 };`
        * `const mockPremiumTier: UserTier = { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 };`
        * `const mockUltraTier: UserTier = { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null };`
        * `const mockAllTiers: Tier[] = [{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }, { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 }, { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 }, { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }];`
      * `[ ]` Update default `useAuthStore` mock (line 85-89) to include `userTier: mockFreeTier` and `availableTiers: mockAllTiers`.
      * `[ ]` Add test: "Plan card shows tier name from store"
        * Default mock has `userTier: mockFreeTier`
        * Assert: the Plan card contains text "Free" (capitalized from `name`)
      * `[ ]` Add test: "Plan card shows Premium when user has premium tier"
        * Override `useAuthStore` mock with `userTier: mockPremiumTier`
        * Assert: the Plan card contains text "Premium"
      * `[ ]` Add test: "Plan card shows Upgrade to basic when user is on free tier"
        * Default mock with `userTier: mockFreeTier` and `availableTiers: mockAllTiers`
        * Assert: CTA link text contains "Upgrade" and the next tier name "Basic"
        * Assert: CTA links to `/subscription`
      * `[ ]` Add test: "Plan card hides upgrade CTA when user is on highest tier"
        * Override with `userTier: mockUltraTier`
        * Assert: no "Upgrade" link rendered in the Plan card
      * `[ ]` Add test: "Plan card shows fallback when userTier is null"
        * Override with `userTier: null, availableTiers: []`
        * Assert: the Plan card shows "Free" as fallback tier name and shows "Upgrade" CTA linking to `/subscription`

    * `[ ]` `apps/web/src/pages/Dashboard.tsx`
      * `[ ]` Update the `useAuthStore` selector (line 41-45) to also destructure `userTier` and `availableTiers`:
        ```
        const { user, profile, isLoading, userTier, availableTiers } = useAuthStore((state) => ({
          user: state.user,
          profile: state.profile,
          isLoading: state.isLoading,
          userTier: state.userTier,
          availableTiers: state.availableTiers,
        }));
        ```
      * `[ ]` Derive the display tier name and next tier before the return statement (after line 93):
        * `const tierName = userTier?.name ?? 'free';`
        * `const displayTierName = tierName.charAt(0).toUpperCase() + tierName.slice(1);`
        * `const nextTier = availableTiers.find(t => t.level > (userTier?.level ?? -1));`
        * `const nextTierName = nextTier ? nextTier.name.charAt(0).toUpperCase() + nextTier.name.slice(1) : null;`
      * `[ ]` Replace the hardcoded Plan card content (lines 170-173):
        * Line 170: replace `<div className="text-2xl font-bold">Free</div>` with `<div className="text-2xl font-bold">{displayTierName}</div>`
        * Lines 171-173: replace the static `<Link to="/subscription">Upgrade to Pro</Link>` with conditional rendering:
          * If `nextTierName` exists: render `<Link to="/subscription">Upgrade to {nextTierName}</Link>`
          * If `nextTierName` is null (user is on highest tier): render nothing (or optionally a "Top up tokens" CTA if wallet balance is low — the actual top-up CTA logic can be refined in a later ticket; for now, render nothing)

    * `[ ]` `requirements`
      * `[ ]` The Plan card displays the user's current tier name from the auth store, not hardcoded "Free"
      * `[ ]` The Plan card CTA dynamically shows "Upgrade to {next tier name}" when a higher tier exists
      * `[ ]` The Plan card CTA is hidden when the user is on the highest tier
      * `[ ]` When `userTier` is null (loading/not hydrated), the card falls back to displaying "Free" and a generic upgrade CTA
      * `[ ]` All existing dashboard tests continue to pass
      * `[ ]` All new dashboard tests pass

  * `[ ]` `apps/web/src/components/sidebar/nav-user.tsx` **[UI] Dynamic Upgrade CTA in sidebar user dropdown**

    * `[ ]` `objective`
      * `[ ]` The sidebar user dropdown has a hardcoded "Upgrade to Pro" button (line 127). After this node, the button reads the user's tier from the auth store and displays a context-aware CTA: "Upgrade to {next tier}" when a higher tier exists, or hides the CTA entirely when the user is on the highest tier.
      * `[ ]` Non-functional: must not break existing dropdown behavior, logout flow, notification display, or theme toggle.

    * `[ ]` `role`
      * `[ ]` UI presentation layer — a sidebar dropdown component that reads from the auth store and renders tier-aware content.
      * `[ ]` This node must NOT modify store logic, types, or BE endpoints.

    * `[ ]` `module`
      * `[ ]` Bounded context: sidebar user menu. The Upgrade CTA is one of five dropdown items.
      * `[ ]` Inside: rendering a dynamic upgrade button based on the user's tier and the next available tier.
      * `[ ]` Outside: subscription management, checkout flows, tier mutation.

    * `[ ]` `deps`
      * `[ ]` Depends on prior node `packages/store/src/authStore.ts` — `userTier` and `availableTiers` must be available in the auth store, and `AuthStore` interface must include these fields.
      * `[ ]` `useAuthStore` is already imported (line 3) and used (lines 46-48 reads `logout`). The existing selector must be extended to also read `userTier` and `availableTiers`.

    * `[ ]` `context_slice`
      * `[ ]` The component calls `useAuthStore((state) => ({ logout: state.logout }))` at line 46. The tier data is read from the same store by extending this selector to include `userTier: state.userTier` and `availableTiers: state.availableTiers`.

    * `[ ]` `apps/web/src/components/sidebar/nav-user.test.tsx`
      * `[ ]` Import `UserTier` and `Tier` from `@paynless/types`.
      * `[ ]` Add mock tier data constants after existing mocks:
        * `const mockFreeTier: UserTier = { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 };`
        * `const mockPremiumTier: UserTier = { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 };`
        * `const mockUltraTier: UserTier = { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null };`
        * `const mockAllTiers: Tier[] = [{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }, { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 }, { level: 20, name: 'premium', output_cap_tokens: 131072, max_models_per_project: 3 }, { level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }];`
      * `[ ]` In `beforeEach` (line 163-212), after `authState.logout = mockLogout;` (line 211), add:
        * `authState.userTier = mockFreeTier;`
        * `authState.availableTiers = mockAllTiers;`
      * `[ ]` Update existing test "should render 'Upgrade to Pro' button with Sparkles icon" (line 473-479):
        * Change assertion from `screen.getByText('Upgrade to Pro')` to `screen.getByText('Upgrade to Basic')` (since default mock is free tier, next tier is basic).
        * Update test description to: "should render dynamic upgrade CTA with Sparkles icon when a higher tier exists"
      * `[ ]` Update existing test "should navigate to /subscription when 'Upgrade to Pro' is clicked" (line 482-491):
        * Change `screen.getByText('Upgrade to Pro')` to `screen.getByText('Upgrade to Basic')`.
        * Update test description to: "should navigate to /subscription when upgrade CTA is clicked"
      * `[ ]` Add test: "should show 'Upgrade to Premium' when user is on basic tier"
        * Override auth state: `authState.userTier = { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 };`
        * Open dropdown, assert `screen.getByText('Upgrade to Premium')` is in the document
      * `[ ]` Add test: "should hide upgrade CTA when user is on highest tier"
        * Override auth state: `authState.userTier = mockUltraTier;`
        * Open dropdown, assert `screen.queryByText(/Upgrade to/i)` is `null`
        * Assert Sparkles icon is NOT present in dropdown content (only the Sparkles icon from the CTA, not other icons)
      * `[ ]` Add test: "should show fallback 'Upgrade' CTA when userTier is null"
        * Override auth state: `authState.userTier = null; authState.availableTiers = [];`
        * Open dropdown, assert `screen.getByText('Upgrade')` is in the document
        * Assert clicking it navigates to `/subscription`

    * `[ ]` `apps/web/src/components/sidebar/nav-user.tsx`
      * `[ ]` Extend the `useAuthStore` selector (lines 46-48) to also read tier data:
        ```
        const { logout, userTier, availableTiers } = useAuthStore((state) => ({
          logout: state.logout,
          userTier: state.userTier,
          availableTiers: state.availableTiers,
        }));
        ```
      * `[ ]` Derive the next tier before the return statement (after `const handleLogout`):
        * `const nextTier = availableTiers.find(t => t.level > (userTier?.level ?? -1));`
        * `const nextTierName = nextTier ? nextTier.name.charAt(0).toUpperCase() + nextTier.name.slice(1) : null;`
      * `[ ]` Replace the hardcoded "Upgrade to Pro" button (lines 121-128) with conditional rendering:
        * If `nextTierName` exists: render `<Button variant="ghost" className="w-full justify-start hover:underline" onClick={() => navigate("/subscription")}><Sparkles />Upgrade to {nextTierName}</Button>`
        * If `nextTierName` is null and `userTier` is null (not hydrated): render `<Button variant="ghost" className="w-full justify-start hover:underline" onClick={() => navigate("/subscription")}><Sparkles />Upgrade</Button>`
        * If `nextTierName` is null and `userTier` is not null (user is on highest tier): render nothing

    * `[ ]` `requirements`
      * `[ ]` The sidebar upgrade CTA displays "Upgrade to {next tier name}" when a higher tier exists
      * `[ ]` The sidebar upgrade CTA is hidden when the user is on the highest tier
      * `[ ]` When `userTier` is null, the CTA falls back to a generic "Upgrade" label linking to `/subscription`
      * `[ ]` All existing nav-user tests continue to pass (with updated assertions for dynamic text)
      * `[ ]` All new nav-user tests pass

  * `[ ]` `apps/web/src/pages/Subscription.tsx` **[UI] Tier-aware plan display — badges and tier comparison from auth store**

    * `[ ]` `objective`
      * `[ ]` The subscription page currently identifies the user's plan via `currentUserResolvedPlan` (plan ID comparison) from the subscription store. After this node, the page also reads `userTier` from the auth store and compares each plan's `tier_level` against `userTier.level` to add tier-aware badges ("Your Tier", "Upgrade") on plan cards. This provides a second, more authoritative signal of the user's access level alongside the existing subscription-based "Current Plan" button.
      * `[ ]` Non-functional: must not break existing subscription management flows (subscribe, cancel, manage billing), plan card rendering, or loading/redirect behavior.

    * `[ ]` `role`
      * `[ ]` UI presentation layer — a React page component that reads from both the auth store (tier) and the subscription store (plans), and renders tier-aware badge overlays around existing `PlanCard` components.
      * `[ ]` This node must NOT modify `PlanCard.tsx`, store logic, types, or BE endpoints.

    * `[ ]` `module`
      * `[ ]` Bounded context: subscription plan selection page.
      * `[ ]` Inside: reading `userTier` from auth store, computing tier relationship per plan, rendering tier badges around `PlanCard` components.
      * `[ ]` Outside: PlanCard button logic (unchanged), checkout flows, subscription store mutations, tier mutation.

    * `[ ]` `deps`
      * `[ ]` Depends on prior node `packages/store/src/authStore.ts` — `userTier` and `availableTiers` must be available in the auth store.
      * `[ ]` `useAuthStore` is already imported (line 3) and used (line 22). The destructured selector must be extended to also read `userTier`.
      * `[ ]` `SubscriptionPlan` (from `@paynless/types`) already has a `tier_level: number` field (from `subscription_plans` DB table, `types_db.ts` line 1918). No type changes needed.

    * `[ ]` `context_slice`
      * `[ ]` The component calls `useAuthStore()` at line 22 to get `{ user, isLoading: authLoading }`. Extend to include `userTier: state.userTier`.
      * `[ ]` Each `SubscriptionPlan` object in `availablePlans` already contains `tier_level: number`. The comparison is `plan.tier_level` vs `userTier?.level`.

    * `[ ]` `apps/web/src/pages/Subscription.test.tsx`
      * `[ ]` Import `UserTier` from `@paynless/types`.
      * `[ ]` Add `userTier` to `authStoreInitialState` (line 43-60):
        * Add `userTier: { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 } as UserTier,`
        * Add `availableTiers: [],` (not consumed by this page but needed for store shape)
        * Add `setTier: vi.fn(),`
        * Add `setAvailableTiers: vi.fn(),`
      * `[ ]` Ensure mock plans have `tier_level` values in `subscriptionStoreInitialState` (they already use `as unknown as SubscriptionPlan` casts — add `tier_level: 10` to Basic Monthly Plan and `tier_level: 20` to Pro Monthly Plan in the mock data).
      * `[ ]` Add test: "should render 'Your Tier' badge on plan cards matching user's tier level"
        * Set `useAuthStore.setState({ userTier: { level: 10, name: 'basic', output_cap_tokens: 32768, max_models_per_project: 2 } })` and ensure a plan with `tier_level: 10` exists
        * Render, find the plan card for the matching plan
        * Assert: a badge with text "Your Tier" is visible within or adjacent to that plan card
      * `[ ]` Add test: "should render 'Upgrade' badge on plan cards with higher tier level"
        * Default mock: user is on free tier (level 0), plans have `tier_level: 10` and `tier_level: 20`
        * Assert: both plan cards show an "Upgrade" badge
      * `[ ]` Add test: "should not render 'Upgrade' badge on plan cards at or below user's tier level"
        * Set user to premium tier (level 20), plans have `tier_level: 10` and `tier_level: 20`
        * Assert: the `tier_level: 10` plan does NOT have an "Upgrade" badge
        * Assert: the `tier_level: 20` plan has a "Your Tier" badge
      * `[ ]` Add test: "should not render any tier badge when userTier is null"
        * Set `useAuthStore.setState({ userTier: null })`
        * Assert: no "Your Tier" or "Upgrade" badges are rendered

    * `[ ]` `apps/web/src/pages/Subscription.tsx`
      * `[ ]` Extend the `useAuthStore` call (line 22) to also read `userTier`:
        ```
        const { user, isLoading: authLoading, userTier } = useAuthStore((state) => ({
          user: state.user,
          isLoading: state.isLoading,
          userTier: state.userTier,
        }));
        ```
      * `[ ]` Add a helper function (before the return statement) to compute tier relationship:
        ```
        const getTierBadge = (planTierLevel: number): string | null => {
          if (userTier == null) return null;
          if (planTierLevel === userTier.level) return 'Your Tier';
          if (planTierLevel > userTier.level) return 'Upgrade';
          return null;
        };
        ```
      * `[ ]` In each `TabsContent` section (monthly, annual, top-up), wrap each `PlanCard` in a relative-positioned container and conditionally render a badge based on `getTierBadge(plan.tier_level)`:
        * If badge text is not null, render a `<Badge>` element (from `@/components/ui/badge`) positioned at the top-right or top-left of the card container:
          * "Your Tier" → `<Badge variant="outline">Your Tier</Badge>`
          * "Upgrade" → `<Badge variant="default">Upgrade</Badge>`
        * If badge text is null, render no badge
      * `[ ]` Import `Badge` from `@/components/ui/badge` (add to existing imports).
      * `[ ]` The wrapper div for each `PlanCard` gets `className="relative"` to position the badge absolutely within it.

    * `[ ]` `requirements`
      * `[ ]` The subscription page reads `userTier` from the auth store
      * `[ ]` Plan cards at the user's tier level show a "Your Tier" badge
      * `[ ]` Plan cards above the user's tier level show an "Upgrade" badge
      * `[ ]` Plan cards below the user's tier level show no tier badge
      * `[ ]` When `userTier` is null (not hydrated), no tier badges are rendered
      * `[ ]` Existing plan card button behavior (Subscribe, Change Plan, Current Plan, Downgrade to Free) is unchanged
      * `[ ]` All existing subscription page tests continue to pass
      * `[ ]` All new tier badge tests pass

  * `[ ]` `apps/web/src/pages/Profile.tsx` **[UI] Plan & Tier card — display tier details and upgrade link**

    * `[ ]` `objective`
      * `[ ]` The profile page currently shows wallet balance, name, email, password, privacy settings, and notification settings. No tier information is displayed. After this node, a new "Plan & Tier" card appears in the profile card stack showing the user's tier name, output cap, max models per project, and a link to the subscription page.
      * `[ ]` Non-functional: must not break existing profile page layout, loading states, error states, or ErrorBoundary behavior.

    * `[ ]` `role`
      * `[ ]` UI presentation layer — a React page component that reads tier data from the auth store and renders a read-only display card.
      * `[ ]` This node must NOT modify store logic, types, or BE endpoints.

    * `[ ]` `module`
      * `[ ]` Bounded context: user profile overview. The Plan & Tier card is a new read-only card in the existing vertical card stack.
      * `[ ]` Inside: rendering the user's tier name, output cap tokens, max models per project, and an upgrade link.
      * `[ ]` Outside: tier mutation, subscription management, checkout flows.

    * `[ ]` `deps`
      * `[ ]` Depends on prior node `packages/store/src/authStore.ts` — `userTier` must be available in the auth store.
      * `[ ]` `useAuthStore` is already imported (line 1) and used (lines 19-21). A new selector call reads `userTier`.
      * `[ ]` Uses `Card`, `CardContent`, `CardHeader`, `CardTitle` already imported (lines 11-15). Uses `Link` from `react-router-dom` for the upgrade CTA — must be imported.

    * `[ ]` `context_slice`
      * `[ ]` The component makes three separate `useAuthStore` calls (lines 19-21). A fourth call reads `userTier`: `const userTier = useAuthStore((state) => state.userTier);`
      * `[ ]` The card renders inline in `ProfilePage` (not a separate component) because it is purely display logic with no form, state management, or side effects.

    * `[ ]` `apps/web/src/pages/Profile.test.tsx`
      * `[ ]` Import `UserTier` from `@paynless/types`.
      * `[ ]` Import `MemoryRouter` from `react-router-dom` (needed because the new card includes a `<Link>`). Update `renderProfilePage` to wrap in `<MemoryRouter>`.
      * `[ ]` Import `mockedUseAuthStoreHookLogic` or use the existing `resetAuthStoreMock` + state setter pattern to set `userTier` on the mock auth store. Since `authStore.mock.ts` will already include `userTier` (from Node B), set it in `beforeEach` after `resetAuthStoreMock()`:
        * Add: `internalMockAuthStoreGetState().userTier = { level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 };`
      * `[ ]` Import `internalMockAuthStoreGetState` from `../mocks/authStore.mock` (already imported: `resetAuthStoreMock` comes from there).
      * `[ ]` Add test: "should render Plan & Tier card with tier details when profile is loaded"
        * Default mock has `userTier` set to free tier
        * Assert: text "Plan & Tier" is present (card title)
        * Assert: text "Free" is present (tier name, capitalized)
        * Assert: text "8,192" is present (output cap formatted with locale)
        * Assert: text "1" is present (max models)
        * Assert: a link to `/subscription` exists within the card
      * `[ ]` Add test: "should render 'Unlimited' for null output_cap_tokens and max_models_per_project"
        * Set `userTier` to `{ level: 30, name: 'ultra', output_cap_tokens: null, max_models_per_project: null }`
        * Assert: text "Ultra" is present
        * Assert: text "Unlimited" appears twice (once for output cap, once for max models)
      * `[ ]` Add test: "should not render Plan & Tier card when userTier is null"
        * Set `userTier` to `null`
        * Assert: text "Plan & Tier" is NOT present
      * `[ ]` Update existing test "should render all profile components when profile is loaded":
        * Assert: text "Plan & Tier" is present (the new card renders alongside existing cards)

    * `[ ]` `apps/web/src/pages/Profile.tsx`
      * `[ ]` Add import: `import { Link } from "react-router-dom";`
      * `[ ]` Add a fourth `useAuthStore` selector call after line 21:
        * `const userTier = useAuthStore((state) => state.userTier);`
      * `[ ]` Derive display values before the return statement (after the early-return guards, before line 80):
        * `const tierName = userTier ? userTier.name.charAt(0).toUpperCase() + userTier.name.slice(1) : null;`
        * `const outputCap = userTier?.output_cap_tokens != null ? userTier.output_cap_tokens.toLocaleString() : 'Unlimited';`
        * `const maxModels = userTier?.max_models_per_project != null ? String(userTier.max_models_per_project) : 'Unlimited';`
      * `[ ]` Insert the Plan & Tier card into the card stack, after the `WalletBalanceDisplay` ErrorBoundary block (after line 104) and before the `EditName` ErrorBoundary block (line 106). Wrap in an ErrorBoundary with a fallback matching the existing pattern:
        ```
        {userTier && (
          <ErrorBoundary
            fallback={
              <Card className="w-full border-destructive bg-destructive/10">
                <CardHeader>
                  <CardTitle className="flex items-center text-destructive text-lg">
                    <AlertTriangle size={20} className="mr-2 shrink-0" />
                    Error in Plan & Tier
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-destructive/90 text-sm">
                    This section could not be loaded. Please try refreshing.
                  </p>
                </CardContent>
              </Card>
            }
          >
            <Card>
              <CardHeader>
                <CardTitle>Plan & Tier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Tier</span>
                  <span className="font-medium">{tierName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Output Cap</span>
                  <span className="font-medium">{outputCap} tokens</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Max Models per Project</span>
                  <span className="font-medium">{maxModels}</span>
                </div>
                <Link
                  to="/subscription"
                  className="inline-block mt-2 text-sm text-primary hover:underline"
                >
                  Manage subscription
                </Link>
              </CardContent>
            </Card>
          </ErrorBoundary>
        )}
        ```
      * `[ ]` When `userTier` is null, the entire card block is not rendered (the conditional `{userTier && (...)}` handles this).

    * `[ ]` `requirements`
      * `[ ]` The profile page displays a "Plan & Tier" card when `userTier` is not null
      * `[ ]` The card shows the tier name (capitalized), output cap (formatted with locale or "Unlimited"), and max models per project (number or "Unlimited")
      * `[ ]` The card includes a link to `/subscription`
      * `[ ]` When `userTier` is null, the card is not rendered
      * `[ ]` The card is wrapped in an ErrorBoundary matching the existing page pattern
      * `[ ]` All existing profile page tests continue to pass
      * `[ ]` All new tier card tests pass

* **Multi-item checkout cart — select a subscription plan + one or more OTP token packages in a single Stripe Checkout flow**

  The subscription page is currently single-item-only and tab-switched between plan types (monthly/annual/top-up). Each `PlanCard` fires `handleSubscribe(priceId)` which constructs a single-item `PurchaseRequest` and calls `walletStore.initiatePurchase()`, producing a one-item Stripe Checkout redirect. This means a user who needs both a plan upgrade and a token top-up must complete two separate checkout flows.

  This ticket replaces the single-item purchase path with a multi-item cart model. The cart allows selection of one subscription plan plus any number of OTP token packages, displays the selected items, and produces a single Stripe Checkout session with multiple `line_items`. Additionally, the cart can be pre-filled programmatically by CTAs elsewhere in the app (model selector upgrade prompts, NSF top-up links, cost ceiling warnings) so that clicking "Upgrade to Premium + add 6M tokens" from a feature gate routes to the subscription page with those items already in the cart — or launches checkout directly.

  ### Stripe support — confirmed, no investigation needed

  Stripe Checkout natively supports multiple `line_items` in a single session. The BE already constructs `line_items` as an array in `stripePaymentAdapter.ts` (line 110): `line_items: [{ price: stripePriceId, quantity: quantity }]`. The array simply needs to contain more than one entry. Stripe allows mixing `mode: 'subscription'` line items with one-time `price` items in a single Checkout session when the mode is `subscription` — the one-time items are charged immediately alongside the first subscription invoice. When the mode is `payment` (pure OTP, no subscription), all items are one-time charges. This is a documented Stripe Checkout feature, not a workaround.

  **Constraint**: A Stripe Checkout session in `subscription` mode requires at least one recurring `price`. A session in `payment` mode cannot include recurring prices. The cart must enforce: if a subscription plan is selected, `mode = 'subscription'` and OTP items are added as one-time line items alongside it. If no subscription plan is selected (pure OTP purchase), `mode = 'payment'` and only OTP items are in the session.

  ### A. Cart state — FE store for selected items

  **`packages/types/src/subscription.types.ts`**: Add a `CartItem` interface: `{ plan: SubscriptionPlan; quantity: number }`. Add a `CheckoutCart` interface: `{ subscriptionItem: CartItem | null; otpItems: CartItem[] }`. The separation between `subscriptionItem` (at most one) and `otpItems` (zero or more) enforces the constraint that only one subscription plan can be active at a time.

  **`packages/store/src/subscriptionStore.ts`** (or a new `cartStore.ts` — investigate during node planning whether the cart should be its own store or a slice of the subscription store): Add cart state and actions:
  - `cart: CheckoutCart` — initially `{ subscriptionItem: null, otpItems: [] }`
  - `setSubscriptionItem: (plan: SubscriptionPlan | null) => void` — sets or clears the subscription plan in the cart. Setting a new plan replaces any existing one (only one subscription at a time).
  - `addOtpItem: (plan: SubscriptionPlan, quantity?: number) => void` — adds an OTP token package to the cart. If the same plan is already in the cart, increment its quantity.
  - `removeOtpItem: (planId: string) => void` — removes an OTP item from the cart.
  - `clearCart: () => void` — empties the entire cart.
  - `prefillCart: (items: { subscriptionPlanId?: string; otpPlanIds?: string[] }) => void` — programmatic prefill for CTAs. Looks up plans from `availablePlans` by ID or stripe_price_id, populates the cart, and optionally navigates to the subscription page (or starts checkout directly). This is how feature-gate CTAs ("Upgrade to Premium + add 6M tokens") populate the cart without the user manually selecting items.
  - `checkoutCart: () => Promise<void>` — builds a multi-item `PurchaseRequest` (or a new multi-item request type) from the cart contents and calls the payment initiation flow.

  The cart should NOT be persisted across sessions (no `persist` middleware) — it's ephemeral. A user who navigates away loses their cart. This is intentional: the cart is a transient shopping intent, not a saved configuration.

  ### B. BE edit — accept multiple line items in `PurchaseRequest` / `initiate-payment`

  **`packages/types/src/services/payment.types.ts`**: The current `PurchaseRequest` carries a single `itemId: string` and `quantity: number`. For multi-item checkout, extend to accept an array of items. Two options:

  **Option 1 (additive, backward-compatible)**: Add `items?: { itemId: string; quantity: number }[]` to `PurchaseRequest`. When `items` is present, use it; when absent, fall back to the existing `itemId` + `quantity` fields. This keeps existing single-item callers working without changes.

  **Option 2 (replace)**: Change `itemId` and `quantity` to `items: { itemId: string; quantity: number }[]` (always an array). Requires updating all callers. Cleaner but higher blast radius.

  **Recommendation**: Option 1 for now — additive, backward-compatible. The single-item path continues to work for any caller that hasn't been updated yet.

  **`supabase/functions/initiate-payment/index.ts`**: The handler currently resolves one plan from `itemId`, constructs one `PaymentOrchestrationContext`, and calls `adapter.initiatePayment()` with it. For multi-item:
  - If `request.items` is present, resolve each item's plan from `subscription_plans` by `stripe_price_id`.
  - Determine Stripe mode: if any item is a subscription plan (`plan_type = 'subscription'`), `mode = 'subscription'`; otherwise `mode = 'payment'`.
  - Compute aggregate `tokens_to_award`: sum of all items' `tokens_to_award × quantity`.
  - Create a single `payment_transactions` record with the aggregate amount and metadata listing all items.
  - Pass all items to the adapter.

  **`supabase/functions/_shared/adapters/stripe/stripePaymentAdapter.ts`**: `initiatePayment()` currently builds `line_items: [{ price: stripePriceId, quantity }]` (line 110). For multi-item:
  - Accept an array of `{ stripePriceId, quantity }` (from the orchestration context or a new multi-item context).
  - Build `line_items: items.map(i => ({ price: i.stripePriceId, quantity: i.quantity }))`.
  - The `mode` parameter is determined by the handler (subscription if any recurring item, payment otherwise).
  - `metadata` must encode all item IDs and token amounts so webhook handlers can process the completed session correctly.

  **Webhook handlers**: `handleCheckoutSessionCompleted` currently processes one plan from the session metadata. For multi-item sessions, it must:
  - Read the items array from session metadata.
  - The subscription item (if any) triggers the subscription upsert + tier refresh (already handled by `complete_checkout_payment` RPC).
  - OTP items trigger token awards (already handled by the token award path in the RPC).
  - The `complete_checkout_payment` RPC already handles both subscription and token awards atomically — it just needs the correct aggregate `tokens_to_award` from the session metadata.
  - **Discovery required during node planning**: Read `stripe.checkoutSessionCompleted.ts` to confirm whether the gather phase correctly extracts multi-item metadata, or if it assumes single-item.

  ### C. Subscription page UI — cart display and checkout

  **`apps/web/src/pages/Subscription.tsx`**: Replace the current single-item-per-click model with a cart model:

  1. **Plan cards become selectable, not immediate-checkout**: Currently, clicking a `PlanCard`'s subscribe button calls `handleSubscribe(priceId)` which immediately initiates checkout. Instead:
     - Subscription plan cards: clicking "Select" adds the plan to `cart.subscriptionItem`. If another subscription is already selected, it replaces it. The card shows a "Selected" state (checkmark, highlighted border).
     - OTP plan cards: clicking "Add" adds the OTP to `cart.otpItems`. If the same OTP is already in the cart, increment quantity. The card shows "Added (×{quantity})" with increment/decrement controls.
     - A "Checkout" button appears only when the cart has items.

  2. **Cart summary panel**: A sidebar or bottom panel showing all selected items:
     - Subscription item (if any) with name, price, interval.
     - OTP items with name, price, quantity, subtotal.
     - Total price.
     - "Remove" button per item.
     - "Clear All" button.
     - "Checkout" button that calls `checkoutCart()`.

  3. **Tab structure**: The existing tabs (Monthly/Annual/Top-Up) can remain as organizational views. The cart persists across tab switches — selecting a monthly plan on the Monthly tab, then switching to Top-Up to add tokens, keeps the subscription item in the cart.

  4. **Current plan awareness**: If the user already has an active subscription, the subscription section should show "Change plan" semantics instead of "Select". Stripe handles plan changes via the billing portal or by creating a new subscription Checkout session (which cancels the old one). The cart should warn: "Selecting a new plan will replace your current {plan name} subscription."

  **`apps/web/src/components/subscription/PlanCard.tsx`**: Props change from `handleSubscribe: (priceId: string) => void` to support cart actions:
  - `onSelect: (plan: SubscriptionPlan) => void` — for subscription plans
  - `onAdd: (plan: SubscriptionPlan) => void` — for OTP plans
  - `isInCart: boolean` — whether this plan is currently in the cart
  - `cartQuantity?: number` — for OTP plans, the current quantity in cart
  - The card renders different button labels based on plan type and cart state.

  **`apps/web/src/components/subscription/CartSummary.tsx`** (new file): The cart summary component. Reads from the cart store, displays items, handles remove/clear/checkout actions.

  **`apps/web/src/components/subscription/CartSummary.test.tsx`** (new file): Tests for cart summary.

  ### D. Programmatic cart prefill — CTAs from other surfaces

  CTAs in Tickets 2, 3, 4, and 7 need to drive checkout flows with specific items pre-selected. The `prefillCart` action on the store enables this:

  **Pattern 1 — Navigate to subscription page with pre-filled cart**:
  ```
  prefillCart({ subscriptionPlanId: 'premium-monthly', otpPlanIds: ['6m-token-pack'] });
  navigate('/subscription');
  ```
  The subscription page renders with those items already in the cart summary. The user can review, adjust, and checkout.

  **Pattern 2 — Direct checkout (skip subscription page)**:
  ```
  prefillCart({ subscriptionPlanId: 'premium-monthly', otpPlanIds: ['6m-token-pack'] });
  checkoutCart();
  ```
  Launches Stripe Checkout immediately with the pre-filled items. For users who trust the CTA and want a frictionless upgrade path.

  Both patterns are supported by the same store actions. The CTA surface decides which pattern to use. For the initial implementation, Pattern 1 (navigate to subscription page with pre-filled cart) is safer — the user sees what they're buying. Pattern 2 can be added later as a "quick checkout" option.

  **URL-based prefill**: The subscription page can also accept query parameters to prefill the cart on load: `/subscription?plan=premium-monthly&otp=6m-token-pack`. This supports deep linking from email campaigns, in-app notifications, or external marketing. The page's `useEffect` parses the query params, calls `prefillCart`, and clears the params from the URL.

  ### E. Bundle suggestions

  The ticket originally mentioned "Suggest bundles, e.g. Basic + 6 MT OTP, Premium + 18 MT OTP, Ultra + 50 MT OTP." These are pre-configured cart combinations displayed as promotional cards on the subscription page. Implementation:

  - Define bundles as a static configuration (not DB-driven initially): an array of `{ label: string; subscriptionPlanFilter: (plan) => boolean; otpPlanFilter: (plan) => boolean; otpQuantity: number }`.
  - Render bundle cards above or alongside the plan tabs: "Recommended: Premium + 18M tokens — $X/mo + $Y one-time."
  - Clicking a bundle card calls `prefillCart` with the matching plan IDs and shows the cart summary.
  - Bundles are a UX enhancement — they don't change the underlying cart/checkout mechanism.

  ### Known files in dependency order

  **Types:**
  1. `packages/types/src/subscription.types.ts` — add `CartItem`, `CheckoutCart` interfaces
  2. `packages/types/src/services/payment.types.ts` — add `items?: { itemId: string; quantity: number }[]` to `PurchaseRequest`

  **BE (stray edits — multi-item support):**
  3. `supabase/functions/initiate-payment/index.ts` — handle `request.items` array, resolve multiple plans, determine mode, aggregate tokens
  4. `supabase/functions/initiate-payment/index.test.ts` — test multi-item flow
  5. `supabase/functions/_shared/adapters/stripe/stripePaymentAdapter.ts` — build multi-item `line_items` array
  6. `supabase/functions/_shared/adapters/stripe/handlers/stripe.initiatiePayment.test.ts` — test multi-item adapter behavior
  7. `supabase/functions/_shared/adapters/stripe/handlers/stripe.checkoutSessionCompleted.ts` — **discovery**: confirm gather phase handles multi-item session metadata; update if it assumes single-item

  **FE store:**
  8. `packages/store/src/subscriptionStore.ts` (or new `cartStore.ts`) — add cart state and actions: `setSubscriptionItem`, `addOtpItem`, `removeOtpItem`, `clearCart`, `prefillCart`, `checkoutCart`
  9. `packages/store/src/subscriptionStore.test.ts` — test cart actions

  **FE API:**
  10. `packages/api/src/wallet.api.ts` — `initiateTokenPurchase` may need to accept the multi-item request shape (or a new method)
  11. `packages/api/src/wallet.api.test.ts` — test multi-item API call

  **FE UI — subscription page:**
  12. `apps/web/src/components/subscription/PlanCard.tsx` — change from immediate-checkout to cart-add behavior, update props
  13. `apps/web/src/components/subscription/PlanCard.test.tsx` — update tests
  14. `apps/web/src/components/subscription/CartSummary.tsx` (new) — cart summary panel
  15. `apps/web/src/components/subscription/CartSummary.test.tsx` (new) — cart summary tests
  16. `apps/web/src/pages/Subscription.tsx` — integrate cart model, replace `handleSubscribe` with cart actions, add cart summary, add bundle cards, add URL-based prefill
  17. `apps/web/src/pages/Subscription.test.tsx` — update tests
  18. `apps/web/src/components/subscription/CurrentSubscriptionCard.tsx` — may need "Change plan" semantics when cart has a different subscription item

  **FE UI — CTA integration points (consumers of `prefillCart`):**
  19. `apps/web/src/components/dialectic/AIModelSelector.tsx` — upgrade CTA from Ticket 2 calls `prefillCart` + navigate
  20. `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — NSF top-up CTA from Ticket 4 calls `prefillCart` + navigate
  21. `apps/web/src/pages/CreateDialecticProjectPage.tsx` — pre-project cost warning CTA from Ticket 4 calls `prefillCart` + navigate
  22. `apps/web/src/pages/Dashboard.tsx` — "Upgrade" CTA from Ticket 1 calls `prefillCart` + navigate

  ### Dependencies on other tickets

  - **Depends on Ticket 1**: The cart needs `availablePlans` (already loaded by `subscriptionStore`) and `userTier` (from Ticket 1 auth store) to determine upgrade vs. current plan semantics.
  - **Tickets 2, 3, 4, and 7 are consumers**: Their CTAs call `prefillCart` to populate the cart. Those tickets can implement their CTAs with placeholder `navigate('/subscription')` links first, then upgrade to `prefillCart` once this ticket is complete. The dependency is soft — the CTAs work (just less smoothly) without this ticket.
  - **BE stray edits are blocking for the checkout path**: The FE cart UI can be built and tested with mocked checkout responses, but the actual multi-item Stripe Checkout flow requires the BE `initiate-payment` and `stripePaymentAdapter` changes to be complete.

  ### Open questions for node planning

  1. **Should the cart live in `subscriptionStore` or a new `cartStore`?** If the cart is ephemeral and the subscription store is already complex, a separate `cartStore.ts` may be cleaner. If the cart is tightly coupled to `availablePlans` (which lives in `subscriptionStore`), co-location may be simpler. Investigate during node planning.
  2. **Stripe plan change semantics**: When a user with an active subscription selects a different subscription plan in the cart, does Stripe handle the proration automatically via the new Checkout session, or does the app need to cancel the old subscription first? Read Stripe docs on "switching subscriptions via Checkout" during node planning.
  3. **Webhook handler multi-item**: Does `handleCheckoutSessionCompleted` need to process each line item separately, or does Stripe aggregate them into a single session result? Read the handler and Stripe webhook payload docs during node planning.

* **Gate model selection by user tier, enforce model count limit, and remove invalid `trialing` status from FE**

  All BE work for this ticket is complete: `validate_model_tier_access` RPC guards all three write paths (`startSession`, `updateSessionModels`, `cloneProject`), output cap enforcement is in all three provider adapters via `resolveOutputCap`, both model catalog endpoints return `min_plan_tier_level`, and `max_models_per_project` is enforced in the SQL RPC. This ticket is FE-only: make the model selector tier-aware, enforce model count limits client-side, and clean up the dead `trialing` status from FE types and stores.

  ### A. FE type — add `min_plan_tier_level` to `AIModelCatalogEntry`

  **`packages/types/src/dialectic.types.ts`**: The BE `AIModelCatalogEntry` in `supabase/functions/dialectic-service/dialectic.interface.ts` already has `min_plan_tier_level: number`. The FE duplicate at `packages/types/src/dialectic.types.ts` (line 162, `AIModelCatalogEntry` interface) does not. Add `min_plan_tier_level: number` to the FE interface. This field is already returned by the `listModelCatalog` BE endpoint and is already present on the `AiProvider` DB row type (since `AiProvider = Database['public']['Tables']['ai_providers']['Row']` and `types_db.ts` includes the column). The `AIModelCatalogEntry` type is used by the dialectic store's `modelCatalog` state and the `fetchAIModelCatalog` action.

  ### B. FE type — remove `trialing` from `SubscriptionStatus`

  **`packages/types/src/subscription.types.ts`**: Line 43 includes `'trialing'` in the `SubscriptionStatus` union type. The BE audit confirmed `trialing` is not a valid status — no handler ever writes it, and the corrective migration removed it from `current_plan_tier`. Remove `'trialing'` from the union. Also audit the union for other invalid statuses: `'past_due'`, `'unpaid'`, `'incomplete'`, `'incomplete_expired'` — the BE only writes `'active'`, `'canceled'`, and `'free'`. Statuses that are never written by any handler are dead code. Confirm with the user which statuses to keep before removing — at minimum, `'trialing'` is confirmed dead and must go.

  ### C. FE store — remove `trialing` from `subscriptionStore` active checks

  **`packages/store/src/subscriptionStore.ts`**: Lines 53 and 112 both check `subscription.status === 'trialing'` when computing `hasActiveSubscription`. Since `trialing` is never a valid status, these checks are dead code. Remove `|| subscription.status === 'trialing'` from both lines so that `hasActiveSubscription` is `subscription.status === 'active'` only.

  **`packages/store/src/subscriptionStore.selectors.ts`**: Line 23 comment says "either 'active' or 'trialing'". Update the comment to reflect that only `'active'` is valid.

  **`packages/store/src/subscriptionStore.selectors.test.ts`**: Line 81 uses `status: 'trialing'` in a test fixture. Remove or replace with a valid status. Update any assertions that depend on `trialing` producing `hasActiveSubscription: true`.

  ### D. Model selector — tier-gate model selection

  **`apps/web/src/components/dialectic/AIModelSelector.tsx`**: The model selector currently renders every model in `availableProviders` as selectable with no restrictions. It must become tier-aware:

  1. **Read user tier from auth store**: Import `useAuthStore` and read `tier` (the `UserTier` object established in Ticket 1). The user's `tier.level` is compared against each model's `min_plan_tier_level`. The user's `tier.max_models_per_project` is the count cap.

  2. **Disable unavailable models**: For each model in the dropdown, if `provider.min_plan_tier_level > tier.level`, render the model row as visually disabled (greyed out, non-interactive increment/decrement). The model is still visible — the frontend shows all models but prevents selection of inaccessible ones. The `MultiplicitySelector` for that model should not be rendered; instead, show a lock icon or "Requires {tier name}" label.

  3. **Hover/click upgrade CTA**: When a user hovers over or attempts to interact with a disabled model row, show a tooltip or inline message explaining why they can't access it: "This model requires a {required tier name} plan." Include a CTA link to the subscription page (e.g., "Upgrade to {required tier name}" linking to `/subscription`). The required tier name can be derived from the `tier_definitions` data — if `tier_definitions` is not cached in a store yet, consider whether to fetch it once on app init or derive the tier name from the model's `min_plan_tier_level` using a simple level-to-name mapping (0→Free, 10→Basic, 20→Premium, 30→Ultra). The `tier_definitions` table is the authoritative source, but a static map is acceptable for the model selector tooltip if fetching `tier_definitions` is deferred to a later ticket.

  4. **Enforce `max_models_per_project` count limit**: The **total** number of models selected, both unique and duplicated, must not exceed `tier.max_models_per_project` (when non-null). Currently, `MultiplicitySelector` has a `maxValue` prop but `AIModelSelector.tsx` does not pass it. When the total model count has reached the limit:
     - Models that are not currently selected should have their increment button disabled (they cannot be added).
     - Models that are already selected can still reduce their multiplicity (decrement instances of an already-selected model).
     - Show an inline message in the dropdown footer: "You've reached the model limit for your plan ({count}/{max}). Upgrade to {next tier name} to add more models." with a CTA to `/subscription`.
     - When `tier.max_models_per_project` is `null` (ultra tier), no count limit is applied.

  5. **Multiplicity gating**: The same model can currently be selected multiple times (multiplicity > 1). Each instance counts toward the `selected_model_ids` array sent to the BE, but they are the same unique model. The `max_models_per_project` limit gates total models selected, whether duplicates or different models.

  **`apps/web/src/components/dialectic/AIModelSelectorList.tsx`**: This is a second model selector component used on the "Start Project" page. It uses checkboxes instead of multiplicity. It also needs tier gating: disable checkboxes for models above the user's tier, enforce `max_models_per_project` on the number of checked models, and show the same upgrade CTAs. Same logic as `AIModelSelector.tsx` but adapted to the checkbox UI.

  **`apps/web/src/components/dialectic/AIModelSelector.test.tsx`**: Update tests:
  - Test: model above user tier renders as disabled, multiplicity controls hidden
  - Test: hovering/clicking disabled model shows upgrade CTA
  - Test: model count at `max_models_per_project` limit disables unselected models
  - Test: already-selected model can only reduce multiplicity when count limit is reached
  - Test: `max_models_per_project: null` (ultra) imposes no count limit
  - Test: all models accessible when user tier is highest (ultra)

  ### E. Dialectic store — handle BE tier validation errors

  **`packages/store/src/dialecticStore.ts`**: `setSelectedModels` (line 1284) and `setModelMultiplicity` (line 1311) call `updateSessionModels` on the BE after setting local state. If the BE rejects the update (e.g., `MODEL_TIER_DISALLOWED` or `MODEL_LIMIT_EXCEEDED` from `validate_model_tier_access`), the current error handling only logs. It should also revert the local state to the previous selection and surface the error to the user. This is a resilience concern — the FE gating should prevent these errors, but the BE guard is the authoritative enforcement. When the BE rejects:
  - Revert `selectedModels` to the previous state (before the optimistic local update).
  - Surface the error message from the BE response so the UI can display it (e.g., toast notification).

  ### Known files in dependency order

  1. `packages/types/src/subscription.types.ts` — remove `'trialing'` from `SubscriptionStatus`
  2. `packages/types/src/dialectic.types.ts` — add `min_plan_tier_level: number` to `AIModelCatalogEntry`
  3. `packages/store/src/subscriptionStore.ts` — remove `trialing` checks from `hasActiveSubscription` (lines 53, 112)
  4. `packages/store/src/subscriptionStore.selectors.ts` — update comment (line 23)
  5. `packages/store/src/subscriptionStore.selectors.test.ts` — remove `trialing` test fixture (line 81)
  6. `packages/store/src/subscriptionStore.test.ts` — update any tests using `trialing` status
  7. `packages/store/src/dialecticStore.ts` — add error handling + revert for `setSelectedModels` and `setModelMultiplicity` when BE rejects
  8. `packages/store/src/dialecticStore.test.ts` — update tests for revert behavior
  9. `packages/store/src/dialecticStore.session.test.ts` — update tests if session model tests reference multiplicity
  10. `apps/web/src/components/dialectic/AIModelSelector.tsx` — tier gating, count limit, upgrade CTAs
  11. `apps/web/src/components/dialectic/AIModelSelector.test.tsx` — new tests for tier gating
  12. `apps/web/src/components/dialectic/AIModelSelectorList.tsx` — tier gating for checkbox variant
  13. `apps/web/src/components/dialectic/MultiplicitySelector.tsx` — no changes expected (already supports `maxValue`), but confirm it handles the disabled state gracefully when parent hides it for tier-locked models

  ### Dependencies on other tickets

  - **Depends on Ticket 1**: User tier must be available in the auth store (`useAuthStore().tier`) before the model selector can read it.
  - **Ticket 7 (marketing/upgrade prompts) extends this ticket**: Ticket 7 adds richer upgrade messaging and subscription page pre-selection. This ticket provides the foundational tier gating and basic upgrade CTAs that Ticket 7 enhances.

  ### Tier reference values

  For context during node planning, the `tier_definitions` seed values are:
  - `(0, 'free', 8192, 1)` — Free: 8k output cap, max 1 unique model per project
  - `(10, 'basic', 32768, 2)` — Basic: 32k output cap, max 2 unique models per project
  - `(20, 'premium', 131072, 3)` — Premium: 128k output cap, max 3 unique models per project
  - `(30, 'ultra', NULL, NULL)` — Ultra: no output cap, no model limit

* **Output clamp slider — user-selectable output token cap, bounded by tier maximum**

  An independent, reusable slider component that lets the user choose a `max_output_tokens` value anywhere from a minimum floor of Free (8192) up to (but not exceeding) their tier's `output_cap_tokens`. The slider is a self-contained component that reads tier data from the auth store and writes the chosen value to the dialectic store. It mounts wherever model selection or work submission occurs, with no prop drilling — the store is the sole communication channel.

  ### A. Slider behavior

  1. **Range**: The slider spans from minimum (Free) to the highest tier's `output_cap_tokens`. The slider thumb can be dragged to any value within the user's permitted range (0 through `tier.output_cap_tokens`). Values above the user's tier max are visible on the track but not selectable — the thumb stops at the user's max.

  2. **Tier markers**: The slider track shows labeled markers at each tier boundary: Free (8192), Basic (32768), Premium (131072), Ultra (unlimited). Each marker shows the semantic tier name above and the token value below. Marker positions and values come from `tier_definitions` — they are not hardcoded. `tier_definitions` is loaded by the `/me` route when the user logs in.

  3. **Clickable markers**: Clicking a tier marker's name or token value sets the slider to that value — if the value is within the user's tier. If the marker is above the user's tier, clicking it triggers an upgrade CTA (tooltip, inline message, or modal) showing "Upgrade to {tier name} to unlock {token value} output" with a link. Clicking the link selects the required tier and begins the checkout flow. 

  4. **Drag behavior**: The user can drag the thumb to any value between the minimum and their tier max. Dragging beyond the tier max is blocked — the thumb snaps back to the tier max. When snapped, the upgrade CTA fires briefly (tooltip or subtle animation).

  5. **Display**: The slider shows the currently chosen value numerically (e.g., "64,000 tokens") alongside or below the thumb. The tier name corresponding to the chosen value's bracket is also shown (e.g., "within Basic range").

  6. **Ultra tier**: When the user's tier has `output_cap_tokens: null` (ultra), the slider has no upper bound from tier. The practical upper bound is the model's `hard_cap_output_tokens` or a sensible UI maximum. No upgrade CTA fires for ultra users.

  ### B. Store integration — persist the user's chosen value

  **`packages/store/src/dialecticStore.ts`**: Add a new state property `userChosenOutputCap: number | null` to the dialectic store (not the auth store — auth store holds what the user *can* do, dialectic store holds what the user *chooses* to do). Add a setter `setUserChosenOutputCap: (value: number | null) => void`. The value persists across page navigations within a session — the user sets the slider once and it holds until they change it or log out. On logout or auth state clear, reset to `null` (which means "use tier default"). On login, initialize to `null`.

  The store should persist this value via Zustand `persist` middleware (already used by `subscriptionStore` for `availablePlans`). This way the user's choice survives page refreshes within the same browser session.

  **`packages/types/src/dialectic.types.ts`**: Add `userChosenOutputCap: number | null` to `DialecticState` and `setUserChosenOutputCap: (value: number | null) => void` to `DialecticActions`.

  ### C. BE consumption — discovery required

  **Discovery: The BE may not currently accept a user-specified output cap.** The BE's `prepareModelJob.ts` fetches `tier_definitions.output_cap_tokens` from the DB and passes it as `UserConfig.tier_output_cap_tokens` to `calculateAffordability` and `enqueueModelCall`. This is the platform-imposed tier cap. There is currently no mechanism for the FE to send a user-chosen value that the BE applies as `min(user_chosen, tier_cap)`.

  Neither `StartSessionPayload` nor `GenerateContributionsPayload` has an output cap field. The BE would need to:
  - Accept a `user_output_cap: number | null` field on `GenerateContributionsPayload` (or on the session/project level).
  - In `prepareModelJob.ts`, apply `min(user_chosen, tier_cap)` instead of just `tier_cap` when constructing `UserConfig.tier_output_cap_tokens`.
  - The `null` case means "no user preference — use tier default", which is the current behavior.

  This is a **stray BE edit** that needs to be scoped. The files involved would be:
  - `packages/types/src/dialectic.types.ts` — add `userOutputCap?: number | null` to `GenerateContributionsPayload`
  - `supabase/functions/dialectic-service/index.ts` — pass the field through to the worker
  - `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts` — apply `min(userChosenCap, tierCap)` when constructing `UserConfig`
  - `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.test.ts` — test the min logic
  - The exact scope depends on how deeply the field threads — this needs further investigation during node planning.

  ### D. Slider component

  **`apps/web/src/components/dialectic/OutputCapSlider.tsx`** (new file): The reusable slider component. Props: none (reads everything from stores). Internal behavior:
  - Reads `tier` from `useAuthStore()` (user's current tier, from Ticket 1)
  - Reads `userChosenOutputCap` from `useDialecticStore()` (current selection, or null for tier default)
  - Reads `availableTiers` from `useAuthStore()` (all tier definitions, from Ticket 1 — see section E)
  - Renders the slider with tier markers, the current value, and upgrade CTAs for above-tier values
  - Calls `setUserChosenOutputCap(value)` on change

  **`apps/web/src/components/dialectic/OutputCapSlider.test.tsx`** (new file): Tests:
  - Test: slider renders with tier markers at correct positions from tier_definitions
  - Test: slider thumb cannot exceed user's `tier.output_cap_tokens`
  - Test: clicking a within-tier marker sets the value
  - Test: clicking an above-tier marker triggers upgrade CTA, does not set value
  - Test: dragging beyond tier max snaps back and shows CTA
  - Test: ultra user has no upper tier bound
  - Test: value persists across re-renders (store-backed)
  - Test: `null` value shows "Tier default" or similar label

  ### E. Tier definitions — already provided by Ticket 1

  The slider needs the full `tier_definitions` list (all tiers, not just the user's) to render markers. **Ticket 1 already solves this**: the `/me` response returns `tiers: []` (all tier definitions), and the auth store caches them as `availableTiers: Tier[]`. The slider reads `useAuthStore().availableTiers` directly — no additional hook, fetch, or caching is needed.

  The `Tier` type is also defined in Ticket 1 (in `packages/types/src/auth.types.ts`). No new type is needed here for tier definitions.

  ### F. Mount points — where the slider appears

  The slider component mounts in the following locations, adjacent to or near model selection:

  1. **Create Project page — `apps/web/src/pages/CreateDialecticProjectPage.tsx`**: The "Start Project" form at `/dialectic/new`. The slider appears alongside or below the model selector, before the user clicks "Create Project". The chosen value is stored in the dialectic store and submitted with the session/generation payload.

  2. **Session details page — `apps/web/src/pages/DialecticSessionDetailsPage.tsx`**: The session view at `/dialectic/:projectId/session/:sessionId`. The slider appears in the session controls area (where models are displayed and generation is triggered). The user can adjust the cap before each generation round.

  3. **Potentially `CreateDialecticProjectForm.tsx`** — if the form component (not the page) is where model selection lives, the slider mounts there instead of or in addition to the page.

  4. **Potentially `SessionInfoCard.tsx`** — if the session info area is where model display/controls live, the slider mounts there.

  During node planning, read these four files to determine exactly where the slider mounts. The slider is a single `<OutputCapSlider />` with no props, so mounting is trivial — the question is where in the layout it fits.

  ### G. Submission path — threading the chosen value to the BE

  When `generateContributions` is called (line 2244 of `dialecticStore.ts`), it currently sends `GenerateContributionsPayload` without any output cap. After the BE is prepared to accept it (section C), the store action must read `userChosenOutputCap` from state and include it in the payload: `userOutputCap: get().userChosenOutputCap`. If the value is `null`, the BE uses the tier default (current behavior, no change).

  Similarly, if the output cap should apply at session creation time (not just generation time), `startDialecticSession` (line 721) would also need to include it.

  ### Known files in dependency order

  1. `packages/types/src/dialectic.types.ts` — add `userChosenOutputCap: number | null` to `DialecticState`, add `setUserChosenOutputCap` to `DialecticActions`, add `userOutputCap?: number | null` to `GenerateContributionsPayload`
  2. `packages/store/src/dialecticStore.ts` — add `userChosenOutputCap` state, `setUserChosenOutputCap` setter, persist config, thread `userChosenOutputCap` into `generateContributions` payload
  3. `packages/store/src/dialecticStore.test.ts` — test `userChosenOutputCap` state and setter
  4. `apps/web/src/components/dialectic/OutputCapSlider.tsx` (new) — the slider component
  5. `apps/web/src/components/dialectic/OutputCapSlider.test.tsx` (new) — slider tests
  6. `apps/web/src/pages/CreateDialecticProjectPage.tsx` — mount slider on Start Project page
  7. `apps/web/src/pages/CreateDialecticProjectPage.test.tsx` — update tests
  8. `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — mount slider on session page
  9. `apps/web/src/pages/DialecticSessionDetailsPage.test.tsx` — update tests
  10. `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx` — possibly mount slider here (investigate)
  11. `apps/web/src/components/dialectic/SessionInfoCard.tsx` — possibly mount slider here (investigate)

  **BE files (stray edits, discovery required during node planning):**
  12. `supabase/functions/dialectic-service/index.ts` — accept and pass `userOutputCap` from payload
  13. `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.ts` — apply `min(userChosenCap, tierCap)`
  14. `supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob.test.ts` — test min logic

  ### Dependencies on other tickets

  - **Depends on Ticket 1**: The slider reads `tier` from the auth store to know the user's max. Ticket 1 must be complete first.
  - **Depends on Ticket 2** (partially): Ticket 2 establishes tier-aware UI patterns (upgrade CTAs, disabled states). The slider reuses the same UX patterns. However, the slider can be implemented independently — it only strictly depends on Ticket 1 for store data.
  - **BE discovery**: The stray BE edits (section C) must be confirmed and scoped before the submission path (section G) can be implemented. The slider component and store plumbing can be built independently of the BE work — the value just won't flow to the BE until the BE is ready to consume it.

  ### Tier reference values

  For context during node planning, the `tier_definitions` seed values are:
  - `(0, 'free', 8192, 1)` — Free: 8k output cap, max 1 model per project
  - `(10, 'basic', 32768, 2)` — Basic: 32k output cap, max 2 models per project
  - `(20, 'premium', 131072, 3)` — Premium: 128k output cap, max 3 models per project
  - `(30, 'ultra', NULL, NULL)` — Ultra: no output cap, no model limit

* **Dynamic cost ceiling estimation — per-stage and full-project token cost based on user configuration**

  This ticket provides a FE-computable cost ceiling that dynamically updates when the user changes model selection or output cap. The ceiling answers: "at most, how many tokens will this stage/project consume?" It drives two UX surfaces: (A) the NSF UI (disable start/continue buttons when ceiling > wallet balance, show top-up CTA), and (B) the pre-project cost preview (estimated cost before "Create Project" is clicked).

  ### Core math

  The cost ceiling for one stage is:

  `stage_ceiling = Σ(expected_job_count_per_step × output_cap × max_output_cost_rate)`

  where:
  - `expected_job_count_per_step` = number of jobs a step produces, determined by its `granularity_strategy` and the model count `n`. The BE already computes this in `computeExpectedCounts` (at `supabase/functions/dialectic-service/computeExpectedCounts.ts`). This logic must be ported to the FE as a pure function (or the pre-computed values used from the existing progress response).
  - `output_cap` = the user's chosen output cap from the slider (Ticket 3), or the tier default from `tier_definitions.output_cap_tokens`
  - `max_output_cost_rate` = the highest `output_token_cost_rate` across the selected models (from `ai_providers.config`). Using the max is the ceiling — actual cost may be lower if cheaper models handle some jobs.

  The total project ceiling is `Σ(stage_ceiling)` across all stages in the DAG.

  ### Data already available on the FE

  1. **Full project DAG (all stages, topologically sorted)**: `getAllStageProgress` (at `supabase/functions/dialectic-service/getAllStageProgress.ts`) already fetches ALL stages in the process template — not just the current stage. It performs a topological sort via `orderedStageIds` and returns all stages as `stages: StageProgressEntry[]` in the `GetAllStageProgressResponse`. The FE stores this in `dagProgressByRun` and `stageRunProgress` on the dialectic store. So the full project map is available once a session exists and progress has been hydrated.

  2. **Recipe steps per stage**: `fetchStageRecipe` hydrates `recipesByStageSlug: Record<string, DialecticStageRecipe>` in the dialectic store. Each `DialecticStageRecipe` has `steps: DialecticStageRecipeStep[]` where each step has `granularity_strategy: RecipeGranularity`. These are fetched for ALL stages in the template by `fetchProcessTemplate` (line 628 of `dialecticStore.ts` — `Promise.all(template.stages.map(...))`). So the recipe steps are available for all stages.

  3. **Model count `n`**: `selectedModels` (from `selectSelectedModels`) gives the model count. The model count combined with the `granularity_strategy` determines how many jobs each step produces.

  4. **Model cost rates**: `availableProviders` in the AI store gives `AiProvider[]`. Each `AiProvider` has a `config` JSONB field containing `output_token_cost_rate: number`. The FE can read the max `output_token_cost_rate` across all selected models.

  5. **Output cap**: From the dialectic store's `userChosenOutputCap` (Ticket 3), or from the auth store's `userTier.output_cap_tokens` if the slider hasn't been adjusted.

  6. **Wallet balance**: Already available via `useWalletStore` → `selectActiveChatWalletInfo`.

  ### What's missing — pre-project estimation (before session exists)

  The `getAllStageProgress` response requires a `sessionId` and `iterationNumber` — it's only available after the project is created and a session exists. For the "Show estimated cost before Create Project" UX, the user has not yet created a project, so there is no session.

  However, `fetchProcessTemplate` is callable with just a `templateId` (the process template chosen for the project). The FE can call `fetchProcessTemplate` before project creation to get all stages and their recipes. The FE already does this during `fetchProjectDetails` (line 503-508 of `dialecticStore.ts`), but it also needs to be callable standalone for pre-project estimation.

  The `DialecticProcessTemplate` type (at `packages/types/src/dialectic.types.ts` line 16) has `stages?: DialecticStage[]` and `transitions?: DialecticStageTransition[]`. The stages have `active_recipe_instance_id` (or `recipe_template_id`), and the recipe steps are fetched per stage via `fetchStageRecipe`. So all the data needed for estimation is available via template + recipe fetch — no new BE endpoint required.

  **Remaining question**: does `fetchStageRecipe` work before a session exists, or does it require a session/instance context? If it requires a session, we need an alternative path (e.g., fetch recipe template steps directly). This must be confirmed during node planning by reading `fetchStageRecipe` in `dialecticStore.ts` and its BE handler.

  ### Expected job count computation — FE port or pre-computed values

  The expected job count per step depends on `granularity_strategy` and `n` (model count). The BE `computeExpectedCounts` computes this. Two approaches:

  **Option A: Port `computeExpectedCounts` to a FE utility.** It's a pure function with no I/O — it takes `steps`, `edges`, `n`, and optional `priorStageContext` and returns `Map<stepId, expectedCount>`. The granularity strategies are: `per_model` (count = n), `all_to_one` (count = 1), `per_source_document` (count = predecessor cardinality), `pairwise_by_origin` (count = n×(n-1)/2 × predecessor lineage count), `per_source_group` (count = predecessor lineage count), `per_source_document_by_lineage` (count = predecessor lineage count × n). Porting this is a self-contained utility with no dependencies beyond the step/edge types.

  **Option B: Use pre-computed values from `getAllStageProgress`.** The progress response already includes `StageProgressEntry.progress.totalSteps` and `StageProgressEntry.steps: StepProgressDto[]`. But these are per-step statuses (completed/in_progress/not_started), not expected job counts per step. The expected job count is not directly exposed in `StageProgressEntry` — it's an internal value in `computeExpectedCounts` used to derive progress percentages. To use this approach, the BE would need to include expected counts in the response.

  **Recommendation**: Option A (FE port) is preferable — it's a pure function, gives the FE independence from BE response shape changes, and enables pre-project estimation (where no `getAllStageProgress` call is possible). The port can be tested exhaustively against the BE version using the same test cases from `computeExpectedCounts.test.ts`.

  ### NSF UI — disable/enable based on cost ceiling vs wallet balance

  Once the cost ceiling is computed:
  - If `stage_ceiling > wallet_balance`: disable the "Generate" / "Continue" button for the current stage. Show a prominent CTA: "Insufficient tokens. Top up {shortfall} tokens to continue." with a link to `/subscription` (top-up tab). The shortfall is `stage_ceiling - wallet_balance`. Pre-select the smallest token top-up that would satisfy the requirement and begin the checkout flow. 
  - If `project_ceiling > wallet_balance`: show a secondary indicator: "Your wallet may not cover the full project ({project_ceiling} tokens estimated, {wallet_balance} available). Consider a top-up to avoid interruption." with a link to `/subscription` (top-up tab). The shortfall is `stage_ceiling - wallet_balance`. Pre-select the smallest token top-up that would satisfy the requirement and begin the checkout flow. 
  - If `stage_ceiling <= wallet_balance`: enable the button. Show estimated cost as informational text: "Estimated cost for this stage: ~{stage_ceiling} tokens."
  - if `project_ceiling <= wallet_balance`: enable the button. Show estimated cost as informational text: "Estimated cost for this project: ~{project_ceiling} tokens." 
  - Both `stage_ceiling` and `project_ceiling` notices can be visible simultaneously so that the user can see the estimated stage and project ceiling costs. 
  - When the user adjusts the output cap slider, recalculate dynamically. If lowering the slider brings the ceiling below the wallet balance, the button re-enables immediately.
  - When the user changes model selection (add/remove models), recalculate dynamically.

  The existing `paused_nsf` status from the BE indicates the generation has actually run out of funds mid-execution. The NSF UI here is a *preventive* UX — it warns the user before they start, not after the fact. Both surfaces coexist: the preventive check runs before generation, the `paused_nsf` status handles the case where actual consumption exceeded the ceiling estimate. 

  ### Pre-project cost preview

  On the "Start Project" page (`CreateDialecticProjectPage.tsx`), after the user selects models and a process template:
  - Compute `project_ceiling` using the template's stages/recipes and the selected models/output cap.
  - Compute `stage_ceiling` for the first stage. 
  - Display: "Estimated token cost: ~{project_ceiling} tokens for the full project, ~{stage_ceiling} for the first stage."
  - If `project_ceiling > wallet_balance`: show a warning and top-up CTA, but do NOT disable "Create Project" — the user may intend to top up later or accept partial execution.
  - If `stage_ceiling > wallet_balance`: disable "Autostart", set to "Autoconfig", show a warning and a top-up CTA explaining why the user can't select Autostart, but let the user "Create Project". With "Autostart" disabled, the "Generate" button will be locked with the NSF warning, so the user can't incur token expenses until they top-up.  

  ### Known files in dependency order

  **FE utility (new — pure function, no I/O):**
  1. `packages/store/src/costCeiling.ts` (new) — pure `computeStageCeiling(steps, edges, n, outputCap, maxCostRate)` and `computeProjectCeiling(stages, ...)` functions. Port of `computeExpectedCounts` logic adapted for cost calculation.
  2. `packages/store/src/costCeiling.test.ts` (new) — test with cases mirroring `computeExpectedCounts.test.ts`

  **FE store (selector / derived state):**
  3. `packages/types/src/dialectic.types.ts` — add `CostCeilingEstimate` interface: `{ stageCeilings: Record<stageSlug, number>; projectCeiling: number }`. Add `costCeilingEstimate: CostCeilingEstimate | null` to `DialecticStateValues`. Add `recomputeCostCeiling: () => void` to `DialecticActions`.
  4. `packages/store/src/dialecticStore.ts` — add `costCeilingEstimate` state, `recomputeCostCeiling` action. The action reads `recipesByStageSlug`, `selectedModels`, `userChosenOutputCap`, and `availableProviders` (from AI store), computes via `computeProjectCeiling`, and sets `costCeilingEstimate`. The recomputation should be triggered when `selectedModels`, `userChosenOutputCap`, or `recipesByStageSlug` change.
  5. `packages/store/src/dialecticStore.test.ts` — test cost ceiling recomputation

  **FE UI — NSF enhancements:**
  6. `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — read `costCeilingEstimate` and `walletBalance` from stores. Conditionally disable generation button and show NSF CTA when `stageCeiling > walletBalance`.
  7. `apps/web/src/pages/DialecticSessionDetailsPage.test.tsx` — test NSF disable/enable
  8. `apps/web/src/components/dialectic/SessionInfoCard.tsx` — show estimated stage cost and project cost in session info area

  **FE UI — pre-project cost preview:**
  9. `apps/web/src/pages/CreateDialecticProjectPage.tsx` — read `costCeilingEstimate` and `walletBalance`. Show project cost estimate and wallet warning.
  10. `apps/web/src/pages/CreateDialecticProjectPage.test.tsx` — test cost display
  11. `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx` — if cost display lives in the form component rather than the page

  **BE investigation (may need stray edits):**
  12. `packages/store/src/dialecticStore.ts` — `fetchStageRecipe` and `fetchProcessTemplate`: confirm whether these work without an active session (for pre-project estimation). If `fetchStageRecipe` requires a session, either add a template-based recipe fetch path on the BE or compute expected counts from template steps directly.
  13. `supabase/functions/dialectic-service/computeExpectedCounts.ts` — reference for FE port; no changes expected to this file, but it is the source of truth for the algorithm

  ### Dependencies on other tickets

  - **Depends on Ticket 1**: Reads `userTier.output_cap_tokens` from the auth store as the default output cap when the slider hasn't been adjusted.
  - **Depends on Ticket 3**: Reads `userChosenOutputCap` from the dialectic store. If the slider hasn't been implemented yet, the cost calculation falls back to the tier cap from Ticket 1. The calculation function accepts the cap as a parameter, so it's independent of the slider's implementation.
  - **Model cost rates come from `aiStore.availableProviders`**: These are already loaded when the model selector initializes. No new fetch needed.
  - **Wallet balance comes from `useWalletStore`**: Already available.

  ### Scope split — FE vs BE

  All core cost ceiling computation is FE-only — the data is already available on the FE, and the algorithm is a pure function port. No new BE endpoint is required for the basic cost ceiling.

  The only BE investigation needed is: does `fetchStageRecipe` work without an active session? If not, a small BE adjustment may be needed to support pre-project estimation. This is a discovery item for node planning, not a confirmed BE edit.

* Update Stripe plans per spreadsheet — **Ops task (deferred). Prereq**: after tier infrastructure migration, update `subscription_plans.tier_level` for each Stripe plan to match the correct tier. This is a data-only change via direct DB update or a follow-up migration, not a code change.

* Fix session bug: 
    Unexpected Application Error!
    [selectUnifiedProjectProgress] Session is required when stages exist
    Error: [selectUnifiedProjectProgress] Session is required when stages exist
        at vo (https://paynless.app/assets/vendor-store-B-XaJYVV.js:1885:17)
        at https://paynless.app/assets/DialecticSessionDetailsPage-BPXjc1k_.js:488:77
        at r (https://paynless.app/assets/vendor-store-B-XaJYVV.js:85:34)
        at https://paynless.app/assets/vendor-store-B-XaJYVV.js:97:14
        at Object.Tf [as useSyncExternalStore] (https://paynless.app/assets/router-DYLlmPMm.js:2872:29)
        at K.useSyncExternalStore (https://paynless.app/assets/router-DYLlmPMm.js:247:21)
        at Lt.useSyncExternalStoreWithSelector (https://paynless.app/assets/vendor-store-B-XaJYVV.js:102:11)
        at Kr (https://paynless.app/assets/vendor-store-B-XaJYVV.js:114:13)
        at t (https://paynless.app/assets/vendor-store-B-XaJYVV.js:119:63)
        at qs (https://paynless.app/assets/DialecticSessionDetailsPage-BPXjc1k_.js:487:229)


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