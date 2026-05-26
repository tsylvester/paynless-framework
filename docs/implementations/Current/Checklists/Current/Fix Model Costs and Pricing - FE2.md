[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

* **Gate model selection by user tier, enforce model count limit, and remove invalid `trialing` status from FE**

  All BE work for this ticket is complete: `validate_model_tier_access` RPC guards all three write paths (`startSession`, `updateSessionModels`, `cloneProject`), output cap enforcement is in all three provider adapters via `resolveOutputCap`, both model catalog endpoints return `min_plan_tier_level`, and `max_models_per_project` is enforced in the SQL RPC. This ticket is FE-only: make the model selector tier-aware, enforce model count limits client-side, and clean up the dead `trialing` status from FE types and stores.

  ### A. FE type — add `min_plan_tier_level` to `AIModelCatalogEntry`

  **`packages/types/src/dialectic.types.ts`**: The BE `AIModelCatalogEntry` in `supabase/functions/dialectic-service/dialectic.interface.ts` already has `min_plan_tier_level: number`. The FE duplicate at `packages/types/src/dialectic.types.ts` (line 162, `AIModelCatalogEntry` interface) does not. Add `min_plan_tier_level: number` to the FE interface. This field is already returned by the `listModelCatalog` BE endpoint and is already present on the `AiProvider` DB row type (since `AiProvider = Database['public']['Tables']['ai_providers']['Row']` and `types_db.ts` includes the column). The `AIModelCatalogEntry` type is used by the dialectic store's `modelCatalog` state and the `fetchAIModelCatalog` action.

  ### B. FE type — `SubscriptionStatus` reflects Stripe; application support is narrower

  **`packages/types/src/subscription.types.ts`**: `SubscriptionStatus` is the set of status strings Stripe may emit on a subscription object (`trialing`, `past_due`, `active`, etc.). Keep every Stripe-relevant member in the union, including `'trialing'`. Do not remove union members solely because the Paynless BE handlers currently persist only `'active'`, `'canceled'`, and `'free'`. Document on the type (JSDoc) that the union describes Stripe wire values, not application semantics for “active paid access.”

  ### C. FE store — stop treating `trialing` as active; only `'active'` counts for `hasActiveSubscription`

  **`packages/store/src/subscriptionStore.ts`**: Lines 53 and 112 check `subscription.status === 'trialing'` when computing `hasActiveSubscription`. The application has not implemented trialing-period entitlements; only `status === 'active'` must set `hasActiveSubscription` to true. Remove `|| subscription.status === 'trialing'` from both lines. A subscription may still arrive with `status: 'trialing'` (valid `SubscriptionStatus`); it must not be treated as active.

  **`packages/store/src/subscriptionStore.selectors.ts`**: Line 23 comment says "either 'active' or 'trialing'". Update the comment: `hasActiveSubscription` in store state is true only for `'active'`; `'trialing'` is a valid Stripe status but is not application-supported as active.

  **`packages/store/src/subscriptionStore.selectors.test.ts`**: Line 81 defines `mockUserSubTrialingPlan2` with `status: 'trialing'`. If unused, delete the dead fixture. If retained for future selector tests, do not assert `hasActiveSubscription: true` for trialing unless explicitly testing Stripe-status display, not active access.

  ### D. Model selector — tier-gate model selection

  **`apps/web/src/components/dialectic/AIModelSelector.tsx`**: The model selector currently renders every model in `availableProviders` as selectable with no restrictions. It must become tier-aware:

  1. **Read user tier from auth store**: Import `useAuthStore` and read `userTier` (the `UserTier` object established in Ticket 1). The user's `userTier.level` is compared against each model's `min_plan_tier_level`. The user's `userTier.max_models_per_project` is the count cap.

  2. **Disable unavailable models**: For each model in the dropdown, if `provider.min_plan_tier_level > userTier.level`, render the model row as visually disabled (greyed out, non-interactive increment/decrement). The model is still visible — the frontend shows all models but prevents selection of inaccessible ones. The `MultiplicitySelector` for that model should not be rendered; instead, show a lock icon or "Requires {tier name}" label.

  3. **Upgrade CTA at the disabled interaction point (not the dropdown footer)**: Whenever the user hovers or attempts a cursor action that is blocked (tier lock or count cap), the upgrade explanation and link must appear **at that control** — tooltip or inline message on the row/control they interacted with. The dropdown footer is usually off-screen; do **not** rely on footer-only CTAs. Tier lock: "This model requires a {required tier name} plan." + link to `/subscription`. Count cap: "You've reached the model limit for your plan ({count}/{max}). Upgrade to {next tier name} to add more models." + link to `/subscription`, shown on the disabled `MultiplicitySelector` (or its increment control), not in the footer. Tier names from `availableTiers` or static map (0→Free, 10→Basic, 20→Premium, 30→Ultra).

  4. **Enforce `max_models_per_project` count limit**: The **total** number of models selected, both unique and duplicated, must not exceed `userTier.max_models_per_project` (when non-null). Currently, `MultiplicitySelector` has a `maxValue` prop but `AIModelSelector.tsx` does not pass it. When the total model count has reached the limit:
     - Models that are not currently selected should have their increment button disabled (they cannot be added).
     - Models that are already selected can still reduce their multiplicity (decrement instances of an already-selected model).
     - When increment is disabled due to count cap, show the count-limit upgrade CTA at that increment interaction point (same rule as §D.3).
     - When `userTier.max_models_per_project` is `null` (ultra tier), no count limit is applied.

  5. **Multiplicity gating**: The same model can currently be selected multiple times (multiplicity > 1). Each instance counts toward the `selected_model_ids` array sent to the BE, but they are the same unique model. The `max_models_per_project` limit gates total models selected, whether duplicates or different models.

  **`apps/web/src/components/dialectic/AIModelSelectorList.tsx`**: This is a second model selector component used on the "Start Project" page. It uses checkboxes instead of multiplicity. It also needs tier gating: disable checkboxes for models above the user's tier, enforce `max_models_per_project` on the number of checked models, and show the same upgrade CTAs. Same logic as `AIModelSelector.tsx` but adapted to the checkbox UI.

  **`apps/web/src/components/dialectic/AIModelSelector.test.tsx`**: Update tests:
  - Test: model above user tier renders as disabled, multiplicity controls hidden
  - Test: hovering/clicking tier-locked row shows upgrade CTA at that row
  - Test: model count at `max_models_per_project` limit disables unselected increment
  - Test: hovering/clicking disabled increment at count cap shows upgrade CTA at that control (not footer)
  - Test: already-selected model can only reduce multiplicity when count limit is reached; disabled increment shows count-cap CTA at control
  - Test: `max_models_per_project: null` (ultra) imposes no count limit
  - Test: all models accessible when user tier is highest (ultra)

  ### E. Dialectic store — handle BE tier validation errors

  **`packages/store/src/dialecticStore.ts`**: `setSelectedModels` (line 1284) and `setModelMultiplicity` (line 1311) call `updateSessionModels` on the BE after setting local state. If the BE rejects the update (e.g., `MODEL_TIER_DISALLOWED` or `MODEL_LIMIT_EXCEEDED` from `validate_model_tier_access`), the current error handling only logs. It should also revert the local state to the previous selection and surface the error to the user. This is a resilience concern — the FE gating should prevent these errors, but the BE guard is the authoritative enforcement. When the BE rejects:
  - Revert `selectedModels` to the previous state (before the optimistic local update).
  - Surface the error message from the BE response so the UI can display it (e.g., toast notification).

  ### Known files in dependency order

  1. `packages/types/src/subscription.types.ts` — JSDoc on `SubscriptionStatus`: Stripe wire values vs application “active” semantics (keep `'trialing'` in union)
  2. `packages/types/src/dialectic.types.ts` — add `min_plan_tier_level: number` to `AIModelCatalogEntry`
  3. `packages/store/src/subscriptionStore.ts` — `hasActiveSubscription` only when `status === 'active'` (lines 53, 112); do not treat `trialing` as active
  4. `packages/store/src/subscriptionStore.selectors.ts` — update comment (line 23)
  5. `packages/store/src/subscriptionStore.selectors.test.ts` — remove unused `mockUserSubTrialingPlan2` fixture if still dead (line 81); do not treat trialing as active in assertions
  6. `packages/store/src/subscriptionStore.test.ts` — add tests: `trialing` status does not set `hasActiveSubscription`
  7. `packages/store/src/dialecticStore.ts` — add error handling + revert for `setSelectedModels` and `setModelMultiplicity` when BE rejects
  8. `packages/store/src/dialecticStore.test.ts` — update tests for revert behavior
  9. `packages/store/src/dialecticStore.session.test.ts` — update tests if session model tests reference multiplicity
  10. `apps/web/src/components/dialectic/AIModelSelector.tsx` — tier gating, count limit, upgrade CTAs
  11. `apps/web/src/components/dialectic/AIModelSelector.test.tsx` — new tests for tier gating
  12. `apps/web/src/components/dialectic/AIModelSelectorList.tsx` — tier gating for checkbox variant
  13. `apps/web/src/components/dialectic/MultiplicitySelector.tsx` — no changes expected (already supports `maxValue`), but confirm it handles the disabled state gracefully when parent hides it for tier-locked models

  ### Dependencies on other tickets

  - **Depends on Ticket 1**: User tier must be available in the auth store (`useAuthStore().userTier`) before the model selector can read it.
  - **Ticket 7 (marketing/upgrade prompts) extends this ticket**: Ticket 7 adds richer upgrade messaging and subscription page pre-selection. This ticket provides the foundational tier gating and basic upgrade CTAs that Ticket 7 enhances.

  ### Tier reference values

  For context during node planning, the `tier_definitions` seed values are:
  - `(0, 'free', 8192, 1)` — Free: 8k output cap, max 1 unique model per project
  - `(10, 'basic', 32768, 2)` — Basic: 32k output cap, max 2 unique models per project
  - `(20, 'premium', 131072, 3)` — Premium: 128k output cap, max 3 unique models per project
  - `(30, 'ultra', NULL, NULL)` — Ultra: no output cap, no model limit

  * `[✅]`   [STORE] `packages/store/src/`subscriptionStore` **`hasActiveSubscription` is application-active only (`active`); Stripe `trialing` stays in type**

    * `[✅]`   `objective`
      * `[✅]`   `SubscriptionStatus` in `@paynless/types` must represent Stripe subscription status strings the payment system may emit (including `'trialing'`). That is separate from what the application treats as “user has active paid access.” Today `hasActiveSubscription` in `subscriptionStore` (and the web Vitest mock) sets true for `active || trialing`, implying implemented support for trialing entitlements. Paynless handlers currently persist only `'active'`, `'canceled'`, and `'free'`; trialing is not implemented. The store must not conflate “valid Stripe status on the wire” with “application treats subscription as active.”
      * `[✅]`   Functional goals:
        * `hasActiveSubscription` is `true` only when `userSubscription` is non-null and `userSubscription.status === 'active'`
        * `hasActiveSubscription` is `false` when `userSubscription` is null
        * `hasActiveSubscription` is `false` when `userSubscription.status === 'trialing'` (valid `SubscriptionStatus`, not application-active)
        * `hasActiveSubscription` is `false` for other non-`'active'` statuses (`'free'`, `'canceled'`, `'past_due'`, etc.) unless a future node explicitly expands application support
        * `setUserSubscription` and `loadSubscriptionData` both apply the same rule
        * `SubscriptionStatus` union in `packages/types/src/subscription.types.ts` retains `'trialing'` and other Stripe members; JSDoc documents Stripe vs application semantics
        * `apps/web/src/mocks/subscriptionStore.mock.ts` mirrors production `setUserSubscription` behavior for `hasActiveSubscription`
      * `[✅]`   Non-functional constraints:
        * Do not remove any member from `SubscriptionStatus` in this node
        * Do not edit `subscriptionStore.selectors.ts`, `subscriptionStore.selectors.test.ts`, or `CurrentSubscriptionCard.tsx` in this node — those are separate source-file nodes
        * Preserve all other `subscriptionStore` actions, persist middleware, and logging
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Application state store (Zustand) — owns subscription slice state and billing API orchestration for the web app
      * `[✅]`   Appropriate because: `hasActiveSubscription` is derived and stored here in `setUserSubscription` and `loadSubscriptionData`; this is the authoritative FE source for that flag before selectors and UI read it
      * `[✅]`   Must NOT: edit dialectic or auth stores; tier-gate model selectors; change selector implementations; change `CurrentSubscriptionCard` status styling

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Subscription state (`userSubscription`, `availablePlans`, `hasActiveSubscription`, billing actions)
      * `[✅]`   Inside boundary: `hasActiveSubscription` derivation, `setUserSubscription`, `loadSubscriptionData` success path state writes, web Vitest mock that replaces `useSubscriptionStore` for `apps/web` tests
      * `[✅]`   Outside boundary: `selectHasActiveSubscription` comment/fixture cleanup (`subscriptionStore.selectors` node), UI components that compare `status` directly (`CurrentSubscriptionCard` node), `AIModelCatalogEntry` / dialectic work (later nodes)
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `packages/types/src/subscription.types.ts` — domain types — inward — provides `UserSubscription`, `SubscriptionPlan`, `SubscriptionStatus` (MODIFY in this node: JSDoc only; union unchanged)
        * `@paynless/api` — API client — inward — `api.billing().getSubscriptionPlans`, `api.billing().getUserSubscription` used by `loadSubscriptionData`
        * `@paynless/utils` — infra — inward — `logger`
        * `./authStore` — store layer — inward — `useAuthStore.getState().user`, `.session?.access_token` for authenticated API calls
      * `[✅]`   Confirm:
        * No reverse dependencies — types and API do not import `subscriptionStore`
        * No lateral layer violations

    * `[✅]`   `context_slice`
      * `[✅]`   From `@paynless/types`: `UserSubscription` row shape (`status: SubscriptionStatus` includes Stripe values such as `'trialing'`), `SubscriptionPlan[]`
      * `[✅]`   From `authStore`: authenticated `user` and `session.access_token` only — no profile/tier fields required for this node
      * `[✅]`   From `@paynless/api` billing adapter: resolved `{ data, error }` for plans and user subscription
      * `[✅]`   Injection shape: Zustand `create` + `persist` factory; no `RequestContext`
      * `[✅]`   Confirm: no over-fetching; mock file implements `SubscriptionStore` interface only

    * `[✅]`   `subscriptionStore.interaction.spec`
      * `[✅]`   Call patterns:
        * **Initial state**: `hasActiveSubscription === false`, `userSubscription === null`
        * **`setUserSubscription(null)`**: sets `userSubscription` to null, `hasActiveSubscription` to false
        * **`setUserSubscription(sub)` where `sub.status === 'active'`**: sets `userSubscription` to `sub`, `hasActiveSubscription` to true
        * **`setUserSubscription(sub)` where `sub.status === 'trialing'`**: sets `userSubscription` to `sub`, `hasActiveSubscription` to false
        * **`setUserSubscription(sub)` where `sub.status` is any other non-`'active'` value** (e.g. `'canceled'`, `'free'`, `'past_due'`): sets `userSubscription` to `sub`, `hasActiveSubscription` to false
        * **`loadSubscriptionData` success** with `getUserSubscription` returning subscription `status === 'active'`**: sets `hasActiveSubscription` to true
        * **`loadSubscriptionData` success** with subscription `status !== 'active'`**: sets `hasActiveSubscription` to false
        * **`loadSubscriptionData` success** with null subscription data: sets `hasActiveSubscription` to false
      * `[✅]`   Side effects: persist middleware writes subscription slice to storage (unchanged)
      * `[✅]`   Failure modes: unauthenticated user — early return, loading reset; plans fetch error — error state, unchanged `hasActiveSubscription` derivation rule on partial success paths unchanged
      * `[✅]`   Ordering: JSDoc on `SubscriptionStatus` in `subscription.types.ts` before store implementation and tests
      * `[✅]`   No code — purely declarative

    * `[✅]`   `packages/types/src/subscription.types.ts` (MODIFY — documentation demanded by this store)
      * `[✅]`   Add a JSDoc block immediately above `export type SubscriptionStatus` (before line 35)
      * `[✅]`   JSDoc text must state explicitly:
        * This union lists Stripe subscription status strings that may appear on subscription objects from the payment system
        * `'trialing'` and other non-`'active'` values are valid members of this type when present on the wire
        * Application billing logic in `@paynless/store` currently treats only `'active'` as “has active subscription” (`hasActiveSubscription`); statuses not implemented by Paynless handlers (including `'trialing'`) must not be assumed to grant active access
      * `[✅]`   Do not add, remove, or reorder any union member — `'trialing'` remains on line 43
      * `[✅]`   Do not alter `UserSubscription`, `SubscriptionState`, or other exports in this file
      * `[✅]`   Types exempt from RED/GREEN tests

    * `[✅]`   `subscriptionStore.test.ts`
      * `[✅]`   Add at end of `describe('SubscriptionStore')` block (after existing `setUserSubscription` tests, before unrelated describe blocks):
        * **Test: `setUserSubscription` with Stripe trialing status does not set hasActiveSubscription`**
          * Define `mockUserSubTrialing: UserSubscription` with the same required row fields as `mockUserSubActivePlan1` in `subscriptionStore.selectors.test.ts` (lines 63–75): `id`, `user_id`, `plan_id`, `current_period_start`, `current_period_end`, `created_at`, `updated_at`, `cancel_at_period_end`, `stripe_customer_id`, `stripe_subscription_id`
          * Set `status: 'trialing'` (valid `SubscriptionStatus` — no type cast)
          * `act(() => useSubscriptionStore.getState().setUserSubscription(mockUserSubTrialing))`
          * `expect(useSubscriptionStore.getState().userSubscription).toEqual(mockUserSubTrialing)`
          * `expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(false)`
        * **Test: `loadSubscriptionData` with Stripe trialing status does not set hasActiveSubscription`**
          * Reuse `setAuthenticated()` helper already in this file
          * `mockStripeGetSubscriptionPlans.mockResolvedValue({ data: mockPlans, error: null })`
          * `mockStripeGetUserSubscription.mockResolvedValue({ data: mockUserSubTrialing, error: null })` (same fixture as above)
          * `await act(async () => { await useSubscriptionStore.getState().loadSubscriptionData(); })`
          * `expect(useSubscriptionStore.getState().hasActiveSubscription).toBe(false)`
          * `expect(useSubscriptionStore.getState().userSubscription?.status).toBe('trialing')`
      * `[✅]`   Do not modify existing tests that use `status: 'active'` or `status: 'canceled'` — they must continue to pass unchanged
      * `[✅]`   Focus on `hasActiveSubscription` branching; do not re-test persist middleware or unrelated billing actions

    * `[✅]`   `apps/web/src/mocks/subscriptionStore.mock.ts`
      * `[✅]`   In `wireMockImplementations`, replace lines 49–51:
        * **From:** `internalMockSubscriptionStoreState.hasActiveSubscription = subscription ? subscription.status === 'active' || subscription.status === 'trialing' : false;`
        * **To:** `internalMockSubscriptionStoreState.hasActiveSubscription = subscription ? subscription.status === 'active' : false;`
      * `[✅]`   Do not change exported mock function names, `buildInitialSubscriptionStore`, or `mockedUseSubscriptionStoreHookLogic` shape
      * `[✅]`   Mock must conform to `SubscriptionStore` from `@paynless/store` and match `subscriptionStore.interaction.spec` for `setUserSubscription`

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: `export const useSubscriptionStore = create<SubscriptionStore>()(persist(...))` — unchanged
      * `[✅]`   Required dependencies at creation: none beyond Zustand defaults
      * `[✅]`   Invalid construction contexts: unchanged from current file

    * `[✅]`   `subscriptionStore.ts`
      * `[✅]`   In `setUserSubscription` (lines 49–55), replace the `hasActiveSubscription` expression:
        * **From:** `subscription ? subscription.status === 'active' || subscription.status === 'trialing' : false`
        * **To:** `subscription ? subscription.status === 'active' : false`
      * `[✅]`   In `loadSubscriptionData` (lines 110–113), replace the `hasActiveSubscription` local variable assignment:
        * **From:** `userSubscription ? userSubscription.status === 'active' || userSubscription.status === 'trialing' : false`
        * **To:** `userSubscription ? userSubscription.status === 'active' : false`
      * `[✅]`   Do not edit any other action, setter, persist config, or `SubscriptionStore` / `SubscriptionState` interfaces in this file
      * `[✅]`   Each functional goal maps to these two code paths only

    * `[✅]`   `packages/store/src/index.ts` (export boundary)
      * `[✅]`   Confirm `export * from './subscriptionStore'` remains — no export list changes required
      * `[✅]`   Public API: `useSubscriptionStore`, `SubscriptionStore` interface — behavior change only for `hasActiveSubscription` semantics

    * `[✅]`   `packages/store/src/subscriptionStore.integration.test.ts` ([TEST-INT] — new file)
      * `[✅]`   Approved integration boundary: **auth slice + billing API (mocked) → `subscriptionStore` → `apps/web` Vitest mock consumer** — exercises real `useSubscriptionStore` with external deps mocked, not re-assertions inside `subscriptionStore.test.ts`
      * `[✅]`   Setup (mirror `packages/store/src/cartStore/cartStore.integration.test.ts`):
        * `vi.mock('@paynless/api')` via `@paynless/api/mocks/api.mock` or `stripe.mock` billing fns
        * `vi.mock('../authStore')` via `apps/web/src/mocks/authStore.mock` (`mockSetAuthUser`, `mockSetAuthSession`, `resetAuthStoreMock`)
        * Import real `useSubscriptionStore` from `./subscriptionStore`
        * Import `initializeMockSubscriptionStore`, `mockSetUserSubscription`, `mockedUseSubscriptionStoreHookLogic` from `apps/web/src/mocks/subscriptionStore.mock.ts`; call `initializeMockSubscriptionStore()` in `beforeEach`
        * Import trialing/active `UserSubscription` fixtures consistent with `subscriptionStore.test.ts` (`mockUserSubTrialing`, `mockSubscription` / active row)
      * `[✅]`   **Test: `loadSubscriptionData` — auth + billing API → store state**
        * **Providers (mocked):** `useAuthStore` holds `user` + `session.access_token`; `mockStripeGetSubscriptionPlans` resolves `{ data: mockPlans, error: null }`; `mockStripeGetUserSubscription` resolves `{ data: mockUserSubTrialing, error: null }`
        * **Subject:** `await act(() => useSubscriptionStore.getState().loadSubscriptionData(user.id))` (or current signature — store reads auth/token internally)
        * **Consumers:** `useSubscriptionStore.getState().hasActiveSubscription === false`; `userSubscription?.status === 'trialing'`; `mockStripeGetUserSubscription` called with `{ token: session.access_token }` from auth slice
      * `[✅]`   **Test: `loadSubscriptionData` with `status: 'active'` — same chain sets application-active**
        * **Providers:** same auth wiring; `getUserSubscription` returns active subscription fixture
        * **Subject:** `loadSubscriptionData` completes without error
        * **Consumer:** `hasActiveSubscription === true` on real store
      * `[✅]`   **Test: `setUserSubscription` — production store and web mock consumer derive identical `hasActiveSubscription` for trialing**
        * **Producer:** `UserSubscription` with `status: 'trialing'` (valid `SubscriptionStatus`)
        * **Subject (real store):** `useSubscriptionStore.getState().setUserSubscription(fixture)`
        * **Subject (web mock consumer):** `mockSetUserSubscription(fixture)` on initialized mock store (`wireMockImplementations` path)
        * **Consumers:** `useSubscriptionStore.getState().hasActiveSubscription === false` and `mockedUseSubscriptionStoreHookLogic.getState().hasActiveSubscription === false`; both retain `userSubscription` with `status: 'trialing'`
      * `[✅]`   Do not import `selectHasActiveSubscription`, render `Subscription.tsx`, or assert page-level `userIsOnPaidPlan` — deferred to `subscriptionStore.selectors` and page nodes
      * `[✅]`   Each `it` covers exactly one behavior; append tests at end of file per §8

    * `[✅]`   `directionality`
      * `[✅]`   Layer: application store (`@paynless/store`)
      * `[✅]`   Deps inward: `@paynless/types`, `@paynless/api`, `@paynless/utils`, `authStore`
      * `[✅]`   Provides outward: `useSubscriptionStore`, `SubscriptionStore` type to selectors, pages, and `apps/web/src/mocks/subscriptionStore.mock.ts`
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `SubscriptionStatus` in `packages/types/src/subscription.types.ts` still includes `'trialing'` and has JSDoc distinguishing Stripe wire values from application-active semantics
      * `[✅]`   `setUserSubscription` with `status === 'active'` sets `hasActiveSubscription === true` — existing test remains green
      * `[✅]`   `setUserSubscription` with `status === 'trialing'` sets `hasActiveSubscription === false` — new test
      * `[✅]`   `loadSubscriptionData` with API returning `status === 'trialing'` sets `hasActiveSubscription === false` — new test
      * `[✅]`   `apps/web/src/mocks/subscriptionStore.mock.ts` uses active-only rule — observable lines 49–51
      * `[✅]`   No `|| subscription.status === 'trialing'` (or `userSubscription.status === 'trialing'`) remains in `packages/store/src/subscriptionStore.ts` — ripgrep `trialing` on that file returns zero matches

  * `[✅]`   [UI] `apps/web/src/components/subscription/`CurrentSubscriptionCard` **Props contract (interface + mocks), dual `subscription`/`plan` props, status styling active-only (not `trialing`)**

    * `[✅]`   `objective`
      * `[✅]`   After the `subscriptionStore` node, `hasActiveSubscription` is true only for `status === 'active'`, but `CurrentSubscriptionCard.tsx` still applies `text-green-600` when `subscription.status === 'active' || subscription.status === 'trialing'`, and defines `CurrentSubscriptionCardProps` inline with `UserSubscription & { plan: SubscriptionPlan }` — an invalid cram of two domain objects into one prop. `SubscriptionStatus` still includes `'trialing'` as a valid Stripe wire value; the card must display the status string as returned but must not use success (green) styling for trialing. Cancel (line 92) already gates on `status === 'active'` only; trialing must remain non-cancellable like `past_due`.
      * `[✅]`   Functional goals:
        * Extract `CurrentSubscriptionCardProps` to `CurrentSubscriptionCard.interface.ts` with **separate** `subscription: UserSubscription` and `plan: SubscriptionPlan` props (no merged object, no `Type & { … }` anywhere)
        * Add `CurrentSubscriptionCard.interface.test.ts`, `CurrentSubscriptionCard.mock.ts`, and `apps/web/src/mocks/userSubscription.mock.ts` per repo component standards (`PlanCard`, `CartSummary`)
        * Refactor `CurrentSubscriptionCard.test.tsx` to import fixtures/builders from mocks; remove inline `mockPlan`, `mockSubscription`, duplicate formatters
        * Status label uses `text-green-600` only when `subscription.status === 'active'`
        * Status label uses `text-yellow-600` when `subscription.status === 'trialing'` and all other non-`'active'` statuses
        * Status text renders `subscription.status` with `capitalize` (Stripe value visible)
        * `Cancel Subscription` visible only when `subscription.status === 'active' && !subscription.cancel_at_period_end`
        * `Cancel Subscription` absent when `subscription.status === 'trialing'`
        * `Manage Billing / Payment` unchanged for trialing (rendered; disabled when `isProcessing`)
        * `Subscription.tsx` passes `subscription={userSubscription}` and `plan={currentUserResolvedPlan}` (no spread-merge object)
        * All refactored behavioral tests for `active`, `past_due`, cancel-at-period-end, and `isProcessing` remain green
      * `[✅]`   Non-functional constraints:
        * **Depends on** `packages/store/src/subscriptionStore` node complete
        * Do not edit `subscriptionStore.ts`, `subscriptionStore.selectors.ts`, or `packages/types/src/subscription.types.ts` in this node
        * Do not use `UserSubscription & { plan: SubscriptionPlan }` or any intersection/merge type to represent subscription + plan
        * Component remains presentational — no `@paynless/store` imports in `CurrentSubscriptionCard.tsx`
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Presentation component (`apps/web`) — current paid subscription summary on `Subscription` page
      * `[✅]`   Appropriate because: owns status display styling and props contract for the card; parent resolves plan via store selector and passes row + plan separately
      * `[✅]`   Must NOT: change billing store logic; change whether `Subscription` page mounts the card; implement tier gating or dialectic model selection

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Subscription management UI — current subscription summary card and its interface/mock support files
      * `[✅]`   Inside boundary: `CurrentSubscriptionCard.interface.ts`, `CurrentSubscriptionCard.interface.test.ts`, `CurrentSubscriptionCard.mock.ts`, `apps/web/src/mocks/userSubscription.mock.ts`, `CurrentSubscriptionCard.tsx`, `CurrentSubscriptionCard.test.tsx`, `CurrentSubscriptionCard.provides.ts`, `Subscription.tsx` prop wiring for this card only
      * `[✅]`   Outside boundary: `subscriptionStore` / `subscriptionStore.selectors`, `PlanCard` implementation (import `PlanCard.mock.ts` only), `Subscription.test.tsx` page tests (no edit required unless in scope)
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `@paynless/types` — domain — inward — `UserSubscription`, `SubscriptionPlan`, `SubscriptionStatus` (read-only)
        * `PlanCard.mock.ts` — same folder — inward — `mockSubscriptionPlan`, `buildSubscriptionPlan`, `mockFormatAmount`, `mockFormatInterval` for plan + formatter test doubles
        * `userSubscription.mock.ts` — `apps/web/src/mocks` — inward — row fixtures and `buildUserSubscription` (created in this node)
        * Parent `Subscription.tsx` — consumer — MODIFY in this node — passes `subscription` and `plan` as separate props
        * `lucide-react` — external — inward — `Award`, `CreditCard` (unchanged)
      * `[✅]`   Confirm:
        * No reverse dependencies — types do not import this component
        * No lateral layer violations — card does not import `@paynless/store`

    * `[✅]`   `context_slice`
      * `[✅]`   `CurrentSubscriptionCardProps`: `subscription: UserSubscription`, `plan: SubscriptionPlan`, `isProcessing: boolean`, `handleManageSubscription`, `handleCancelSubscription`, `formatAmount: CurrentSubscriptionCardFormatAmountFn`, `formatInterval: CurrentSubscriptionCardFormatIntervalFn`
      * `[✅]`   Status display: `subscription.status` on `<span data-testid="subscription-status">`
      * `[✅]`   Plan display: `plan.name`, `plan.amount`, `plan.currency`, `plan.interval`, `plan.interval_count` — not read from `subscription.plan`
      * `[✅]`   Cancel gated on `subscription.status === 'active'` only
      * `[✅]`   Injection shape: props from parent only — no Zustand in card source

    * `[✅]`   `CurrentSubscriptionCard.interface.test.ts` (NEW — contract tests)
      * `[✅]`   Create `describe('CurrentSubscriptionCard.interface contract')` mirroring `CartSummary.interface.test.ts` pattern
      * `[✅]`   Valid cases (must compile and pass):
        * Full `CurrentSubscriptionCardProps` with `subscription` from `buildUserSubscription()`, `plan` from `buildSubscriptionPlan()`, all callbacks typed to named fn types
        * `subscription.status: 'active'`, `'trialing'`, `'past_due'` each valid with same props shape
      * `[✅]`   Invalid cases (document contract; use null/absent checks like `CartSummary.interface.test.ts`, no `as` on incomplete props):
        * Props must expose two required props `subscription` and `plan` — not a single merged subscription+plan object
      * `[✅]`   Each `it` covers one contract rule; append at end of file per §8

    * `[✅]`   `CurrentSubscriptionCard.interface.ts` (NEW — structural boundary)
      * `[✅]`   Import `UserSubscription`, `SubscriptionPlan` from `@paynless/types`
      * `[✅]`   Export `CurrentSubscriptionCardFormatAmountFn` — `(amount: number, currency: string) => string`
      * `[✅]`   Export `CurrentSubscriptionCardFormatIntervalFn` — `(interval: string | null | undefined, count: number | null | undefined) => string`
      * `[✅]`   Export `CurrentSubscriptionCardProps`:
        * `subscription: UserSubscription`
        * `plan: SubscriptionPlan`
        * `isProcessing: boolean`
        * `handleManageSubscription: () => void`
        * `handleCancelSubscription: () => void`
        * `formatAmount: CurrentSubscriptionCardFormatAmountFn`
        * `formatInterval: CurrentSubscriptionCardFormatIntervalFn`
      * `[✅]`   No inline `UserSubscription & { plan: … }`; no optional `plan` on `subscription` prop

    * `[✅]`   `apps/web/src/mocks/userSubscription.mock.ts` (NEW — canonical `UserSubscription` row fixtures for web tests)
      * `[✅]`   Import `UserSubscription` from `@paynless/types`
      * `[✅]`   Export `MOCK_USER_SUBSCRIPTION_TIMESTAMP` (stable ISO string, same pattern as `PlanCard.mock.ts`)
      * `[✅]`   Export `mockUserSubscriptionActive: UserSubscription` — full row, `status: 'active'`, all required DB row fields populated, **no** `plan` property on object
      * `[✅]`   Export `mockUserSubscriptionTrialing: UserSubscription` — same row shape, `status: 'trialing'`
      * `[✅]`   Export `mockUserSubscriptionPastDue: UserSubscription` — same row shape, `status: 'past_due'`
      * `[✅]`   Export `UserSubscriptionOverrides` typed partial keyed by `UserSubscription` fields
      * `[✅]`   Export `buildUserSubscription(overrides?: UserSubscriptionOverrides): UserSubscription` — copies `mockUserSubscriptionActive` base, applies overrides via explicit loop (same pattern as `buildSubscriptionPlan` in `PlanCard.mock.ts`)
      * `[✅]`   Do not import `PlanCard.mock` here — row-only mock; plan pairing happens in `CurrentSubscriptionCard.mock.ts`

    * `[✅]`   `CurrentSubscriptionCard.mock.ts` (NEW — card props builders)
      * `[✅]`   Import `vi`, `Mock` from `vitest`
      * `[✅]`   Import `buildSubscriptionPlan`, `mockFormatAmount`, `mockFormatInterval` from `./PlanCard.mock.ts`
      * `[✅]`   Import `buildUserSubscription`, `mockUserSubscriptionActive` from `../../mocks/userSubscription.mock.ts`
      * `[✅]`   Import `CurrentSubscriptionCardProps` from `./CurrentSubscriptionCard.interface.ts`
      * `[✅]`   Export `mockHandleManageSubscription`, `mockHandleCancelSubscription` as `Mock<[], void>`
      * `[✅]`   Export `CurrentSubscriptionCardPropsOverrides` partial keyed by `CurrentSubscriptionCardProps`
      * `[✅]`   Export `buildCurrentSubscriptionCardProps(overrides?: CurrentSubscriptionCardPropsOverrides): CurrentSubscriptionCardProps` defaulting to `subscription: mockUserSubscriptionActive`, `plan: buildSubscriptionPlan()`, formatters from `PlanCard.mock`, vi.fn handlers
      * `[✅]`   Export `defaultCurrentSubscriptionCardProps` as `buildCurrentSubscriptionCardProps()` result for tests

    * `[✅]`   `CurrentSubscriptionCard.interaction.spec`
      * `[✅]`   Call patterns:
        * **Render:** parent passes `subscription` + `plan`; card shows `plan.name`, formatted price/interval, `subscription.status`, period end when `subscription.current_period_end` set
        * **Status styling:** `subscription.status === 'active'` → `text-green-600` on `data-testid="subscription-status"`; else → `text-yellow-600` (includes `'trialing'`, `'past_due'`, etc.)
        * **Cancel:** rendered iff `subscription.status === 'active' && !subscription.cancel_at_period_end`
        * **Manage:** always rendered (disabled when `isProcessing`)
      * `[✅]`   Side effects: none — callbacks on button click only
      * `[✅]`   Failure modes: missing `plan.amount` or `plan.currency` → throw (sourced from `plan` prop); do not read `subscription.plan`
      * `[✅]`   Ordering: interface → interface.test → userSubscription.mock → card.mock → behavior test refactor → `.tsx` implementation → `Subscription.tsx` wiring → provides
      * `[✅]`   No code — purely declarative

    * `[✅]`   `CurrentSubscriptionCard.test.tsx` (MODIFY — refactor + trialing tests)
      * `[✅]`   Remove inline `mockPlan`, `mockSubscription`, `mockFormatAmount`, `mockFormatInterval`, untyped `defaultProps` (lines 6–57)
      * `[✅]`   Import `CurrentSubscriptionCardProps` from `./CurrentSubscriptionCard.interface`
      * `[✅]`   Import `buildCurrentSubscriptionCardProps`, `mockHandleManageSubscription`, `mockHandleCancelSubscription` from `./CurrentSubscriptionCard.mock`
      * `[✅]`   Import `buildUserSubscription` from `../../mocks/userSubscription.mock`
      * `[✅]`   Replace `renderCurrentSubscriptionCard` helper to accept `Partial<CurrentSubscriptionCardProps>` and merge via `buildCurrentSubscriptionCardProps(overrides)`
      * `[✅]`   Update all existing `it` blocks to use `buildCurrentSubscriptionCardProps` / overrides (e.g. `subscription` prop; `past_due` via `buildUserSubscription({ status: 'past_due' })`) — behavior assertions unchanged
      * `[✅]`   Append at end of `describe('CurrentSubscriptionCard Component')`:
        * **Test: trialing status uses non-success (yellow) styling, not green** — `buildCurrentSubscriptionCardProps({ subscription: buildUserSubscription({ status: 'trialing' }) })`, `getByTestId('subscription-status')`, `text-yellow-600`, not `text-green-600`, text contains `trialing`
        * **Test: trialing status does not show Cancel Subscription button** — same props; no cancel button; Manage Billing present
      * `[✅]`   Each new `it` one behavior; append at end per §8

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: `export function CurrentSubscriptionCard(props: CurrentSubscriptionCardProps)` importing props type from interface file
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):**
        * (1) `CurrentSubscriptionCard.interface.ts` → lint → halt
        * (2) `CurrentSubscriptionCard.interface.test.ts` → lint → halt
        * (3) `apps/web/src/mocks/userSubscription.mock.ts` → lint → halt
        * (4) `CurrentSubscriptionCard.mock.ts` → lint → halt
        * (5) `CurrentSubscriptionCard.test.tsx` — refactor + append trialing RED tests → lint → halt
        * (6) `CurrentSubscriptionCard.tsx` — destructure `subscription`, `plan`; status styling; `data-testid` → lint → halt
        * (7) `apps/web/src/pages/Subscription.tsx` — wire `subscription` + `plan` props (remove spread-merge) → lint → halt
        * (8) `CurrentSubscriptionCard.provides.ts` → lint → halt
      * `[✅]`   Prerequisite: `packages/store/src/subscriptionStore` node complete

    * `[✅]`   `CurrentSubscriptionCard.tsx` (MODIFY — implementation)
      * `[✅]`   Delete inline `interface CurrentSubscriptionCardProps` (lines 4–11)
      * `[✅]`   Import `CurrentSubscriptionCardProps` from `./CurrentSubscriptionCard.interface`
      * `[✅]`   Destructure `subscription`, `plan` (replace `userSubscription` identifier throughout)
      * `[✅]`   Remove early return on `userSubscription.plan` — parent guarantees `plan` when card mounts; validate `plan.amount` / `plan.currency` from `plan` prop (throw messages unchanged)
      * `[✅]`   Plan copy uses `plan.name`, `formatInterval(plan.interval, plan.interval_count)`, etc.
      * `[✅]`   Status `<span>`: add `data-testid="subscription-status"`; class `subscription.status === 'active' ? 'text-green-600' : 'text-yellow-600'` (remove `|| subscription.status === 'trialing'` from green branch)
      * `[✅]`   Cancel button: `subscription.status === 'active' && !subscription.cancel_at_period_end`
      * `[✅]`   ripgrep `\|\|.*trialing` and `trialing.*\|\|` on `CurrentSubscriptionCard.tsx` returns zero matches; `{subscription.status}` render allowed

    * `[✅]`   `apps/web/src/pages/Subscription.tsx` (MODIFY — immediate consumer wiring)
      * `[✅]`   Replace `<CurrentSubscriptionCard userSubscription={{ ...userSubscription, plan: currentUserResolvedPlan }}` with:
        * `subscription={userSubscription}`
        * `plan={currentUserResolvedPlan}`
      * `[✅]`   Other props unchanged (`isProcessing`, handlers, formatters)

    * `[✅]`   `CurrentSubscriptionCard.provides.ts` (NEW — export boundary)
      * `[✅]`   Re-export `CurrentSubscriptionCard` from `./CurrentSubscriptionCard`
      * `[✅]`   Re-export type `CurrentSubscriptionCardProps` from `./CurrentSubscriptionCard.interface`
      * `[✅]`   Do not re-export domain types from `@paynless/types`

    * `[✅]`   `CurrentSubscriptionCard.integration.test` (NEW - mock only at boundaries)
      * `[✅]`   Validate in `CurrentSubscriptionCard.test.tsx`: `buildCurrentSubscriptionCardProps` → render → status/cancel DOM outcomes for active, trialing, past_due
      * `[✅]`   Validate `Subscription.tsx` passes two props; existing `Subscription.test.tsx` page tests remain green without editing that file in this node

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI (`apps/web`)
      * `[✅]`   Deps inward: `@paynless/types`, `PlanCard.mock`, `userSubscription.mock`
      * `[✅]`   Provides outward: card + props type consumed by `Subscription.tsx`
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `subscriptionStore` node complete
      * `[✅]`   `CurrentSubscriptionCard.interface.ts` exists; props use separate `subscription` and `plan` — no intersection merge type
      * `[✅]`   `CurrentSubscriptionCard.interface.test.ts` passes
      * `[✅]`   `userSubscription.mock.ts` and `CurrentSubscriptionCard.mock.ts` exist; card tests import builders (no inline full-row literals in test file)
      * `[✅]`   `data-testid="subscription-status"` on status span
      * `[✅]`   `status === 'active'` → green; `trialing` → yellow, not green, no cancel; `past_due` → no cancel
      * `[✅]`   `Subscription.tsx` uses `subscription` + `plan` props
      * `[✅]`   ripgrep `UserSubscription &` on card/interface/mock files returns zero matches
      * `[✅]`   All behavioral tests in `CurrentSubscriptionCard.test.tsx` pass (refactored + two trialing)

    * `[✅]`   **Canonical `userSubscription` mock — optional follow-up for other tests (not required in this node)**
      * `[✅]`   Once `apps/web/src/mocks/userSubscription.mock.ts` exists, these locations may replace inline `UserSubscription` literals with `buildUserSubscription` / exported constants **when that file is already in scope for the work being done**:
        * `apps/web/src/pages/Subscription.test.tsx` — `activeUserSubscription`, `freeUserSubscription`
        * `apps/web/src/pages/Subscription.integration.test.tsx` — `activeUserSubscription`
        * `apps/web/src/components/subscription/Subscription.integration.test.tsx` — `mockCurrentSub` fixtures
        * `packages/store/src/subscriptionStore.integration.test.ts` — `mockSubscriptionActive`, `mockUserSubTrialing` (different package; only if store integration file is in scope)

  * `[✅]`   [STORE] `packages/store/src/`subscriptionStore.selectors` **Align selector docs and tests with store `hasActiveSubscription` (active-only; `trialing` not application-active)**

    * `[✅]`   `objective`
      * `[✅]`   `selectHasActiveSubscription` in `subscriptionStore.selectors.ts` is a passthrough: it returns `state.hasActiveSubscription` and does not re-derive from `userSubscription.status`. After the `subscriptionStore` node, the store sets `hasActiveSubscription` only for `status === 'active'`; `'trialing'` remains a valid `SubscriptionStatus` but must not produce `hasActiveSubscription: true`. This node completes B/C for the selector family: fix the stale JSDoc that claims trialing counts as active, remove the unused trialing fixture, and prove the selector reflects store state when `userSubscription.status === 'trialing'` and `hasActiveSubscription === false`.
      * `[✅]`   Functional goals:
        * JSDoc on `selectHasActiveSubscription` documents that the selector returns the store-computed flag and that only `'active'` is application-active (not `'trialing'`)
        * `selectHasActiveSubscription` implementation remains `state.hasActiveSubscription` — no change to selector logic body
        * Tests prove passthrough returns `false` when state matches post-`subscriptionStore` output for a trialing subscription (`hasActiveSubscription: false`, `userSubscription.status: 'trialing'`)
        * Tests prove passthrough still returns `true` when `hasActiveSubscription: true` (existing behavior preserved)
        * Dead fixture `mockUserSubTrialingPlan2` is removed if still unused, or wired into the new trialing passthrough test (not both)
      * `[✅]`   Non-functional constraints:
        * **Depends on** `packages/store/src/subscriptionStore` node complete (store + mock + types JSDoc) before starting this node
        * Do not change `subscriptionStore.ts`, `subscription.types.ts`, or `apps/web/src/mocks/subscriptionStore.mock.ts` in this node
        * Do not change `selectCurrentUserResolvedPlan`, `selectCurrentUserTokenBudget`, or other selectors beyond `selectHasActiveSubscription` JSDoc
        * Do not edit `CurrentSubscriptionCard.tsx` or `Subscription.tsx` in this node
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Reselect selectors — read-only projections of `SubscriptionState` for UI and other consumers
      * `[✅]`   Appropriate because: selectors do not compute billing entitlement; they expose store state. Documentation must not contradict store semantics after B/C
      * `[✅]`   Must NOT: re-implement `hasActiveSubscription` derivation from `userSubscription.status` in the selector layer; modify the store; change UI styling for trialing

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Subscription state projections (`selectUserSubscription`, `selectHasActiveSubscription`, plan resolution, token budget)
      * `[✅]`   Inside boundary: `selectHasActiveSubscription` JSDoc, passthrough behavior verification, test fixtures for `SubscriptionState` shapes
      * `[✅]`   Outside boundary: store writes (`subscriptionStore.ts`), Stripe type union (`subscription.types.ts`), web mock, UI components that compare `userSubscription.status` directly for styling
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `packages/store/src/subscriptionStore` node (producer) — must be complete — provides `SubscriptionState.hasActiveSubscription` semantics (active-only)
        * `@paynless/types` — domain — inward — `SubscriptionState`, `UserSubscription`, `SubscriptionStatus` (read-only; `'trialing'` remains in union)
        * `reselect` — external — inward — `createSelector` for derived selectors (unchanged in this node)
      * `[✅]`   Confirm:
        * No reverse dependencies — selectors do not import `subscriptionStore` implementation
        * No lateral layer violations

    * `[✅]`   `context_slice`
      * `[✅]`   Input: `SubscriptionState` slice (`hasActiveSubscription`, `userSubscription`, `availablePlans`, etc.)
      * `[✅]`   `selectHasActiveSubscription(state)` → `boolean` equal to `state.hasActiveSubscription` with no additional branching
      * `[✅]`   Injection shape: pure functions `(state: SubscriptionState) => T` — no store hooks in this file

    * `[✅]`   `subscriptionStore.selectors.interaction.spec`
      * `[✅]`   Call patterns:
        * **`selectHasActiveSubscription`**: returns `state.hasActiveSubscription` exactly; never reads `userSubscription.status` to override
        * **Consumer (immediate)**: `Subscription.tsx` calls `useSubscriptionStore(selectHasActiveSubscription)` — consumer reads boolean; when store sets `hasActiveSubscription: false` for trialing, consumer receives `false`
      * `[✅]`   State shapes after producer node:
        * `{ userSubscription: { status: 'trialing', ... }, hasActiveSubscription: false }` → selector returns `false`
        * `{ userSubscription: { status: 'active', ... }, hasActiveSubscription: true }` → selector returns `true`
        * `{ userSubscription: null, hasActiveSubscription: false }` → selector returns `false`
      * `[✅]`   Failure modes: none — passthrough has no error branches
      * `[✅]`   No code — purely declarative

    * `[✅]`   `subscriptionStore.selectors.test.ts`
      * `[✅]`   In `describe('selectHasActiveSubscription')`, add at end of that describe block (after existing passthrough-true test):
        * **Test: `selectHasActiveSubscription` returns false when store has trialing subscription and hasActiveSubscription false**
          * Build `state: SubscriptionState` as `{ ...initialMockState, userSubscription: mockUserSubTrialingPlan2, hasActiveSubscription: false }`
          * Use existing `mockUserSubTrialingPlan2` fixture (lines 77–89): `status: 'trialing'`, full `UserSubscription` row fields — valid `SubscriptionStatus`, no type cast
          * `expect(selectHasActiveSubscription(state)).toBe(false)`
          * `expect(state.userSubscription?.status).toBe('trialing')` — documents state shape matches store output for non-active trialing
      * `[✅]`   Remove duplicate dead code: if `mockUserSubTrialingPlan2` is only referenced by the new test, keep the fixture; if any other reference is added, do not duplicate a second trialing fixture
      * `[✅]`   Do not change existing `selectHasActiveSubscription` test that sets `hasActiveSubscription: true` without `userSubscription` — it must still pass
      * `[✅]`   Each new `it` covers exactly one behavior; append at end of `describe('selectHasActiveSubscription')` per §8
      * `[✅]`   Do not re-test `selectCurrentUserResolvedPlan`, token budget, or other selectors

    * `[✅]`   `subscriptionStore.selectors.ts`
      * `[✅]`   Replace JSDoc on `selectHasActiveSubscription` (lines 22–24):
        * **From:** `Selects whether the user has an active subscription (either 'active' or 'trialing').`
        * **To:** `Selects whether the user has an active subscription per store state (hasActiveSubscription). The store sets this true only when userSubscription.status === 'active'. Stripe status 'trialing' is valid on the subscription object but is not treated as application-active.`
      * `[✅]`   Do not change line 25 implementation: `export const selectHasActiveSubscription = (state: SubscriptionState): boolean => state.hasActiveSubscription;`
      * `[✅]`   Do not edit any other export in this file

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: named selector exports — unchanged
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):** (1) `subscriptionStore.selectors.test.ts` — add trialing passthrough test (RED if store node not done; GREEN after store node) → lint → halt; (2) `subscriptionStore.selectors.ts` — JSDoc only → lint → halt; (3) confirm `packages/store/src/index.ts` `export * from './subscriptionStore.selectors'` unchanged → halt
      * `[✅]`   Prerequisite: `subscriptionStore` node requirements all satisfied before step (1)

    * `[✅]`   `packages/store/src/index.ts` (export boundary)
      * `[✅]`   Confirm `export * from './subscriptionStore.selectors'` unchanged
      * `[✅]`   Public API: all selector exports stable; only JSDoc semantics change for `selectHasActiveSubscription`

    * `[✅]`   `subscriptionStore.selectors.integration.test` (boundary — no new file on disk)
      * `[✅]`   Validate in `subscriptionStore.selectors.test.ts` using `SubscriptionState` objects that mirror **producer** output from `subscriptionStore` node:
        * **Producer → selector:** state `{ userSubscription: trialing, hasActiveSubscription: false }` (as `setUserSubscription` / `loadSubscriptionData` leave it) → `selectHasActiveSubscription(state) === false`
        * **Producer → selector:** state `{ userSubscription: active, hasActiveSubscription: true }` → `selectHasActiveSubscription(state) === true`
      * `[✅]`   **Consumer note (not edited here):** `apps/web/src/pages/Subscription.tsx` uses `selectHasActiveSubscription` for `userIsOnPaidPlan`; when trialing subscription is loaded, consumer must receive `false` after store node — no `Subscription.tsx` edit required in this node if store is correct
      * `[✅]`   UI that compares `userSubscription.status === 'trialing'` directly (`CurrentSubscriptionCard.tsx`) is a separate node — not part of selector family B/C completion

    * `[✅]`   `directionality`
      * `[✅]`   Layer: store selectors (projection of `SubscriptionState`)
      * `[✅]`   Deps inward: `@paynless/types`, producer `subscriptionStore` semantics
      * `[✅]`   Provides outward: selectors consumed by `Subscription.tsx` and other store consumers via `useSubscriptionStore(selector)`
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   JSDoc on `selectHasActiveSubscription` does not mention trialing as active — observable in `subscriptionStore.selectors.ts`
      * `[✅]`   `selectHasActiveSubscription` body unchanged and still passthrough — `state.hasActiveSubscription` only
      * `[✅]`   New test: trialing `userSubscription` + `hasActiveSubscription: false` → selector `false`
      * `[✅]`   Existing passthrough-true test still passes
      * `[✅]`   `mockUserSubTrialingPlan2` is used by the new trialing passthrough test (not left as unused dead fixture)
      * `[✅]`   ripgrep `trialing` on `subscriptionStore.selectors.ts` returns matches only inside JSDoc explaining trialing is **not** application-active (not `|| 'trialing'` in code)

  * `[✅]`   [API] `packages/api/src/`dialectic.api` **`listModelCatalog` catalog entries include `min_plan_tier_level` on FE `AIModelCatalogEntry`**

    * `[✅]`   `objective`
      * `[✅]`   The BE `listModelCatalog` action returns each catalog row with `min_plan_tier_level` (see `supabase/functions/dialectic-service/listModelCatalog.ts` and `dialectic.interface.ts` `AIModelCatalogEntry` L303). The FE `AIModelCatalogEntry` in `packages/types/src/dialectic.types.ts` omits that field, so `@paynless/api` `DialecticApiClient.listModelCatalog()` and every downstream consumer cannot type or rely on tier metadata from the catalog response. This node aligns the FE application type with the wire shape and updates all test fixtures that construct `AIModelCatalogEntry` literals so the monorepo compiles after the contract change — API client tests assert the field on `listModelCatalog` responses; dependent `apps/web` form tests only gain `min_plan_tier_level` on existing catalog mocks (no form behavior changes).
      * `[✅]`   Functional goals:
        * `AIModelCatalogEntry` in `@paynless/types` includes required `min_plan_tier_level: number`
        * `DialecticApiClient.listModelCatalog()` continues to POST `{ action: 'listModelCatalog' }` to `dialectic-service` and return `ApiResponse<AIModelCatalogEntry[]>` unchanged in call shape
        * `dialectic.api.contribution.test.ts` `mockModelCatalogEntry` is a complete `AIModelCatalogEntry` including `min_plan_tier_level`
        * A unit test proves a successful `listModelCatalog` response surfaces `min_plan_tier_level` on the first catalog entry
        * `apps/web/src/components/dialectic/CreateDialecticProjectForm.test.tsx` `modelCatalogWithDefault` satisfies `AIModelCatalogEntry` including `min_plan_tier_level`
        * `apps/web/src/components/dialectic/CreateDialecticProjectForm.autostart.test.tsx` `buildMinimalAIModelCatalogEntry()` base includes `min_plan_tier_level` so all `modelCatalog` fixtures compile
      * `[✅]`   Non-functional constraints:
        * This node performs the **only** edit to `packages/types/src/dialectic.types.ts` `AIModelCatalogEntry` for `min_plan_tier_level` in this ticket — later `dialecticStore` and selector nodes update their own test factories only
        * Do not edit `packages/store`, `supabase/functions`, or `apps/web` **source** (`.tsx` components) in this node — **only** the two `CreateDialecticProjectForm*.test.tsx` files listed below may be edited in `apps/web` because they require compile fixes caused by this type change
        * Do not add type guards, new mock factories, or new public API methods on `DialecticApiClient`
        * Preserve existing `listModelCatalog` error and network handling in `dialectic.api.ts`
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   API client adapter (`@paynless/api`) — transports dialectic-service catalog responses into typed FE domain objects
      * `[✅]`   Appropriate because: `listModelCatalog` is the first FE layer that binds the HTTP response to `AIModelCatalogEntry[]`; the type contract must match BE before `dialecticStore.fetchAIModelCatalog` assigns `response.data`
      * `[✅]`   Must NOT: implement tier gating UI; change subscription or auth stores; modify `fetchAIModelCatalog` store logic (deferred to `dialecticStore` node)

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Dialectic HTTP API client (`DialecticApiClient` methods on `dialectic-service`) and compile-time consumers of `AIModelCatalogEntry` in tests that break when the type gains a required field
      * `[✅]`   Inside boundary: `listModelCatalog` method, its return type `ApiResponse<AIModelCatalogEntry[]>`, tests in `dialectic.api.contribution.test.ts` under `describe('listModelCatalog')`, and `CreateDialecticProjectForm.test.tsx` / `CreateDialecticProjectForm.autostart.test.tsx` catalog fixture updates required by the type change
      * `[✅]`   Outside boundary: Zustand `dialecticStore.fetchAIModelCatalog` (store test fixtures in `dialecticStore` node), `ai_providers` / `AiProvider` row type (already has DB column), UI model selectors, `CreateDialecticProjectForm.tsx` component source, `subscriptionStore` B/C nodes
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `packages/types/src/dialectic.types.ts` — domain types — inward — provides `AIModelCatalogEntry`, `ApiResponse`, `ApiError` (MODIFY `AIModelCatalogEntry` in this node)
        * `@paynless/utils` — infra — inward — `logger` used by `listModelCatalog`
        * `apiClient` (injected on `DialecticApiClient`) — port — inward — `post<AIModelCatalogEntry[], { action: string }>`
      * `[✅]`   Confirm:
        * No reverse dependencies — `@paynless/types` does not import `@paynless/api`
        * No lateral layer violations

    * `[✅]`   `context_slice`
      * `[✅]`   From `@paynless/types`: `AIModelCatalogEntry` (full row shape), `ApiResponse<AIModelCatalogEntry[]>`, `ApiError`
      * `[✅]`   From `apiClient`: `post` resolves `{ data, error, status }` for `dialectic-service` + `{ action: 'listModelCatalog' }`
      * `[✅]`   Injection shape: `DialecticApiClient` constructed with `apiClient` instance (existing test setup in `dialectic.api.contribution.test.ts`)
      * `[✅]`   Confirm: no auth/tier fields required on the client for this node

    * `[✅]`   `dialectic.api.interaction.spec`
      * `[✅]`   Call patterns:
        * **`listModelCatalog()`**: logs info, calls `apiClient.post('dialectic-service', { action: 'listModelCatalog' })`, returns response unchanged on success
        * **Success response**: `data` is `AIModelCatalogEntry[]`; each element includes `min_plan_tier_level: number` when BE returns catalog rows
        * **Error response**: `error` populated, `data` undefined — unchanged behavior
        * **Network throw**: catch returns `{ error: { code: 'NETWORK_ERROR', message }, status: 0, data: undefined }` — unchanged behavior
      * `[✅]`   Side effects: logging only
      * `[✅]`   Failure modes: unchanged from current `dialectic.api.ts` L272–289
      * `[✅]`   Ordering: `dialectic.types.ts` `AIModelCatalogEntry` field added before all test fixture updates (`dialectic.api.contribution.test.ts`, then `CreateDialecticProjectForm*.test.tsx`, then new `listModelCatalog` assertion)
      * `[✅]`   No code — purely declarative

    * `[✅]`   `packages/types/src/dialectic.types.ts` (MODIFY — contract demanded by `listModelCatalog`)
      * `[✅]`   In `export interface AIModelCatalogEntry` (lines 162–181), after `is_default_generation: boolean;` add a new required property on its own line:
        * `min_plan_tier_level: number;`
      * `[✅]`   Field documents the minimum plan tier level (0 = free, 10 = basic, 20 = premium, 30 = ultra) required to select the model; matches BE `dialectic.interface.ts` `AIModelCatalogEntry` except BE types the column as `number | null` while this ticket §A specifies FE `number` because `listModelCatalog` maps `row.min_plan_tier_level` as a number from `ai_providers`
      * `[✅]`   Do not change any other property on `AIModelCatalogEntry` or any other export in this file
      * `[✅]`   Types exempt from RED/GREEN tests

    * `[✅]`   `dialectic.api.contribution.test.ts`
      * `[✅]`   In `describe('listModelCatalog')`, update `mockModelCatalogEntry` (lines 425–441): add after `is_default_generation: false,` the property `min_plan_tier_level: 10,`
      * `[✅]`   Append at end of `describe('listModelCatalog')` (after the network-error `it`, before the closing `});` of that describe):
        * **Test: `listModelCatalog` returns entries including `min_plan_tier_level`**
          * `mockApiClientPost.mockResolvedValue({ data: [mockModelCatalogEntry], status: 200 })`
          * `const result = await dialecticApiClient.listModelCatalog()`
          * `expect(result.data).toBeDefined()`
          * `expect(result.data?.length).toBe(1)`
          * `expect(result.data?.[0].min_plan_tier_level).toBe(10)`
          * `expect(result.error).toBeUndefined()`
      * `[✅]`   Do not modify the four existing `listModelCatalog` test bodies — only the shared `mockModelCatalogEntry` object gains `min_plan_tier_level: 10` so all five tests compile
      * `[✅]`   Each new `it` covers exactly one behavior; append at end of `describe('listModelCatalog')` per §8

    * `[✅]`   `CreateDialecticProjectForm.test.tsx` (MODIFY — compile fix required by `AIModelCatalogEntry` contract in this node)
      * `[✅]`   In `modelCatalogWithDefault` (lines 159–177), after `is_default_generation: true,` add `min_plan_tier_level: 0,`
      * `[✅]`   Do not change `describe('CreateDialecticProjectForm')` test assertions, mocks, or `createMockStoreState` usage — only the catalog array literal gains the required field
      * `[✅]`   Do not edit `CreateDialecticProjectForm.tsx` in this node

    * `[✅]`   `CreateDialecticProjectForm.autostart.test.tsx` (MODIFY — compile fix required by `AIModelCatalogEntry` contract in this node)
      * `[✅]`   In function `buildMinimalAIModelCatalogEntry` (lines 166–184), after `is_default_generation: overrides.is_default_generation,` add `min_plan_tier_level: 0,`
      * `[✅]`   All call sites (`defaultCatalogWithDefaultModel`, `catalogNoDefaults`, etc.) inherit `min_plan_tier_level: 0` unless `overrides` supplies a different `min_plan_tier_level`
      * `[✅]`   Do not change autostart behavior tests, `initializeMockDialecticState`, or `CreateDialecticProjectForm.tsx` — only the shared factory base object
      * `[✅]`   No new `it` blocks — fixture-only updates; existing tests must remain green

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: `DialecticApiClient` class in `dialectic.api.ts` — unchanged constructor and `listModelCatalog` signature
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):** (1) `packages/types/src/dialectic.types.ts` — add `min_plan_tier_level` → halt; (2) `dialectic.api.contribution.test.ts` — update fixture + add new `it` (RED until fixture complete) → lint → halt; (3) `apps/web/src/components/dialectic/CreateDialecticProjectForm.test.tsx` — add `min_plan_tier_level` to `modelCatalogWithDefault` → lint → halt; (4) `apps/web/src/components/dialectic/CreateDialecticProjectForm.autostart.test.tsx` — add `min_plan_tier_level` to `buildMinimalAIModelCatalogEntry` base → lint → halt; (5) `dialectic.api.ts` — confirm no edit required; read file and halt; (6) confirm `packages/api/src/index.ts` export unchanged → halt
      * `[✅]`   Invalid construction contexts: unchanged from current file

    * `[✅]`   `dialectic.api.ts`
      * `[✅]`   `listModelCatalog` (lines 272–289): **no code changes** — method already posts to `dialectic-service` and returns `ApiResponse<AIModelCatalogEntry[]>`; typed response will include `min_plan_tier_level` once `AIModelCatalogEntry` is updated
      * `[✅]`   Do not add mapping, filtering, or defaults for `min_plan_tier_level` in the client
      * `[✅]`   Do not edit any other method on `DialecticApiClient` in this node

    * `[✅]`   `packages/api/src/index.ts` (export boundary)
      * `[✅]`   Confirm `export * from './dialectic.api'` remains — no export list changes required
      * `[✅]`   Public API: `DialecticApiClient`, `listModelCatalog` — contract change is reflected type-only via `AIModelCatalogEntry`

    * `[✅]`   `dialectic.api.integration.test` (boundary — no new file on disk)
      * `[✅]`   Validate within `dialectic.api.contribution.test.ts` after unit tests pass:
        * **External (mocked):** `apiClient.post` returns `AIModelCatalogEntry[]` with `min_plan_tier_level`
        * **Subject:** `dialecticApiClient.listModelCatalog()` returns same array on `result.data` with field readable
        * **Consumer (immediate, typed only):** `AIModelCatalogEntry` assignable from `result.data[0]` without casts — store wiring proof deferred to `dialecticStore` node
      * `[✅]`   Validate compile ripple: `CreateDialecticProjectForm.test.tsx` and `CreateDialecticProjectForm.autostart.test.tsx` typecheck with updated `AIModelCatalogEntry` literals (no new behavior tests — fixture parity only)
      * `[✅]`   `packages/api/src/mocks/dialectic.api.mock.ts` — `listModelCatalog` remains `vi.fn<..., Promise<ApiResponse<AIModelCatalogEntry[]>>>()`; no literal catalog row in mock file — no edit

    * `[✅]`   `directionality`
      * `[✅]`   Layer: API client (`@paynless/api`)
      * `[✅]`   Deps inward: `@paynless/types`, `@paynless/utils`, injected `apiClient`
      * `[✅]`   Provides outward: typed `listModelCatalog()` to `@paynless/store` `fetchAIModelCatalog` and other consumers
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `AIModelCatalogEntry` in `packages/types/src/dialectic.types.ts` includes required `min_plan_tier_level: number` immediately after `is_default_generation`
      * `[✅]`   `mockModelCatalogEntry` in `dialectic.api.contribution.test.ts` includes `min_plan_tier_level` and satisfies `AIModelCatalogEntry` without `as` casts
      * `[✅]`   New test: successful `listModelCatalog` returns `data[0].min_plan_tier_level === 10` (fixture value)
      * `[✅]`   Existing four `listModelCatalog` tests still pass with updated fixture
      * `[✅]`   `CreateDialecticProjectForm.test.tsx` `modelCatalogWithDefault[0]` includes `min_plan_tier_level: 0` — satisfies `AIModelCatalogEntry` without casts
      * `[✅]`   `CreateDialecticProjectForm.autostart.test.tsx` `buildMinimalAIModelCatalogEntry()` return type includes `min_plan_tier_level: 0` by default
      * `[✅]`   All pre-existing `CreateDialecticProjectForm` and `CreateDialecticProjectForm (autostart)` tests pass with fixture-only changes
      * `[✅]`   `dialectic.api.ts` `listModelCatalog` body unchanged — ripgrep `min_plan_tier_level` on `dialectic.api.ts` returns zero matches
      * `[✅]`   `packages/api/src/dialectic.api.domain.test.ts` unchanged — file imports `AIModelCatalogEntry` but constructs no catalog object literals

  * `[✅]`   [STORE] `packages/store/src/`dialecticStore` **`modelCatalog` includes `min_plan_tier_level`; optimistic model selection reverts on BE tier validation failure**

    * `[✅]`   `objective`
      * `[✅]`   After the `dialectic.api` node, `AIModelCatalogEntry` includes required `min_plan_tier_level: number`, but every `AIModelCatalogEntry` literal and factory in `@paynless/store` tests and state setup must be updated or TypeScript fails. `fetchAIModelCatalog` in `dialecticStore.ts` assigns `response.data` directly into `modelCatalog` with no field stripping; the store does not need new runtime logic for §A — only test fixtures and compile-time-complete catalog rows. `selectDefaultGenerationModels` and other selectors read `modelCatalog` but do not branch on `min_plan_tier_level` in this node.
      * `[✅]`   §E: `setSelectedModels` (L1284) and `setModelMultiplicity` (L1311) optimistically update `selectedModels` then call `updateSessionModels` in the background when `activeContextSessionId` is set. Today, BE rejection (`MODEL_TIER_DISALLOWED`, `MODEL_LIMIT_EXCEEDED` from `validate_model_tier_access` via `updateSessionModels`) only logs — local `selectedModels` stays wrong and `updateSessionModelsError` is not set by these optimistic paths (though `updateSessionModels` itself sets `updateSessionModelsError` on direct call). The store must snapshot pre-update `selectedModels`, revert on `response.error`, and assign `updateSessionModelsError` from the BE `ApiError` so UI can surface the message (toast or existing error display). FE tier gating should prevent most failures; BE remains authoritative.
      * `[✅]`   Functional goals:
        * All `AIModelCatalogEntry` objects constructed in this node's test support files include `min_plan_tier_level: number`
        * `fetchAIModelCatalog` success path continues to set `modelCatalog: response.data || []` unchanged (lines 898–901)
        * `fetchAIModelCatalog` error and network paths continue to set `modelCatalog: []` unchanged (lines 889–892, 916–919)
        * Existing `fetchAIModelCatalog` success test in `dialecticStore.session.test.ts` still passes when `mockCatalog` entries include `min_plan_tier_level` and `expect(state.modelCatalog).toEqual(mockCatalog)` remains valid
        * `catalogEntry()` helper in `dialecticStore.autostart.test.ts` produces complete `AIModelCatalogEntry` rows including `min_plan_tier_level`
        * **`setSelectedModels` with `activeContextSessionId` set:** before optimistic `set`, capture `previousSelectedModels` (shallow copy of current `selectedModels` array); after background `updateSessionModels` resolves with `response.error`, `set({ selectedModels: previousSelectedModels, updateSessionModelsError: response.error })` and retain error log; on success (`!response.error`), do not revert (existing `updateSessionModels` success path may reconcile `selectedModels` from API — unchanged)
        * **`setSelectedModels` with `activeContextSessionId` null:** optimistic local update only — no background call — unchanged
        * **`setModelMultiplicity` with `activeContextSessionId` set:** before optimistic `set`, capture `previousSelectedModels` from `get().selectedModels || []`; compute `newModels` as today; on `response.error`, revert to `previousSelectedModels` and set `updateSessionModelsError: response.error`; on `.catch` network failure, revert to `previousSelectedModels` and set `updateSessionModelsError: { code: 'NETWORK_ERROR', message }` (same shape as `updateSessionModels` catch)
        * **`setModelMultiplicity` with `activeContextSessionId` null:** local multiplicity update only — unchanged
        * **`resetSelectedModels`:** out of scope for §E revert in this node — do not change unless a test breaks
        * BE error codes exercised in tests: `MODEL_TIER_DISALLOWED` (message `'Selected models are not available on your plan'`, status 403) and `MODEL_LIMIT_EXCEEDED` (message `'Model selection exceeds the limit for your plan'`, status 403) per `updateSessionModels.ts`
      * `[✅]`   Non-functional constraints:
        * **Depends on** `packages/api/src/dialectic.api` node complete (`AIModelCatalogEntry` type + API test fixture)
        * Do not edit `packages/types/src/dialectic.types.ts` in this node — type change is owned by `dialectic.api` node
        * Do not edit `dialecticStore.selectors.ts`, `dialecticStore.selectors.autostart.test.ts`, or `apps/web` in this node — `dialecticStore.selectors` is a separate source-file node
        * Do not tier-gate UI or edit `AIModelSelector` / `AIModelSelectorList` in this node
        * Do not change `updateSessionModels` implementation body except confirm it already sets `updateSessionModelsError` on error — optimistic actions consume its `ApiResponse` return value
        * Preserve logging on failure paths — add revert alongside existing `logger.error` calls, do not remove logs
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Application state store (Zustand) — owns `modelCatalog`, catalog fetch flags, `selectedModels`, `updateSessionModelsError`, and optimistic model-selection actions
      * `[✅]`   Appropriate because: sole owner of `fetchAIModelCatalog`, `setSelectedModels`, and `setModelMultiplicity`; catalog fixtures in store tests compile here; §E revert must live next to optimistic updates in `dialecticStore.ts`
      * `[✅]`   Must NOT: tier-gate UI; change `listModelCatalog` API client; modify subscription or auth stores; edit `dialecticStore.selectors.ts` catalog factories (separate node)

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Dialectic store catalog slice (`modelCatalog`, `fetchAIModelCatalog`, loading/error flags) and session model selection (`selectedModels`, `updateSessionModelsError`, optimistic `setSelectedModels` / `setModelMultiplicity` with background `updateSessionModels`)
      * `[✅]`   Inside boundary: `fetchAIModelCatalog` (passthrough confirm), `setSelectedModels` / `setModelMultiplicity` §E revert + error surface, all `AIModelCatalogEntry` literals/factories in listed `dialecticStore.*.test.ts` files, §E tests in `dialecticStore.session.test.ts` and catalog fixture updates in `dialecticStore.test.ts`
      * `[✅]`   Outside boundary: `AIModelCatalogEntry` interface definition (`dialectic.api` node), `dialecticStore.selectors` catalog factories, UI model selectors and toasts (consumers read `updateSessionModelsError` only — no toast wiring required in this node unless an existing global listener already exists)
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `packages/api/src/dialectic.api` node (producer) — must be complete — provides typed `listModelCatalog()` returning `AIModelCatalogEntry[]` with `min_plan_tier_level`
        * `@paynless/types` — domain — inward — `AIModelCatalogEntry`, `SelectedModels`, `ApiResponse`, `ApiError`, `DialecticStateValues`, `UpdateSessionModelsPayload` (read-only; no edits in this node)
        * `@paynless/api` — API client — inward — `api.dialectic().listModelCatalog()`, `api.dialectic().updateSessionModels()` via store `updateSessionModels` action
        * `@paynless/utils` — infra — inward — `logger` in catalog fetch and model-selection failure paths
      * `[✅]`   Confirm:
        * No reverse dependencies — types and API do not import `dialecticStore` implementation details
        * No lateral layer violations

    * `[✅]`   `context_slice`
      * `[✅]`   From `@paynless/types`: `AIModelCatalogEntry` including required `min_plan_tier_level: number`; `SelectedModels[]`; `ApiError` with `code`, `message`, optional `status`
      * `[✅]`   From `@paynless/api`: `listModelCatalog()` → `{ data, error, status }`; `updateSessionModels(payload)` → `{ data, error, status }`
      * `[✅]`   Store state fields: `modelCatalog`, `isLoadingModelCatalog`, `modelCatalogError`, `selectedModels`, `activeContextSessionId`, `updateSessionModelsError`, `isUpdatingSessionModels` (latter set by `updateSessionModels` — unchanged)
      * `[✅]`   Injection shape: Zustand `useDialecticStore` actions; tests mock `getMockDialecticClient().listModelCatalog` and `getMockDialecticClient().updateSessionModels` per `dialecticStore.session.test.ts`
      * `[✅]`   Confirm: no `userTier` or tier gating in this node

    * `[✅]`   `dialecticStore.interaction.spec`
      * `[✅]`   Call patterns:
        * **`fetchAIModelCatalog()` start**: sets `isLoadingModelCatalog: true`, `modelCatalogError: null`
        * **Success**: `api.dialectic().listModelCatalog()` returns `{ data: AIModelCatalogEntry[], error: undefined }` → sets `modelCatalog: response.data || []`, `isLoadingModelCatalog: false`, `modelCatalogError: null`
        * **API error**: `response.error` set → sets `modelCatalog: []`, `isLoadingModelCatalog: false`, `modelCatalogError: response.error`
        * **Network throw**: catch → sets `modelCatalog: []`, `isLoadingModelCatalog: false`, `modelCatalogError: { code: 'NETWORK_ERROR', message }`
        * **Catalog row shape**: each element in `modelCatalog` after success includes `min_plan_tier_level` when present on API `data` (no store-side omission)
        * **`setSelectedModels(models)` when `activeContextSessionId` non-null:** `previousSelectedModels = [...(get().selectedModels || [])]`; `set({ selectedModels: models })`; `updateSessionModels({ sessionId, selectedModels: models }).then(response => { if (response.error) { set({ selectedModels: previousSelectedModels, updateSessionModelsError: response.error }); logger.error(...); } })`; `.catch` → revert `selectedModels` to `previousSelectedModels`, `updateSessionModelsError: { code: 'NETWORK_ERROR', message }`, log
        * **`setSelectedModels(models)` when `activeContextSessionId` null:** `set({ selectedModels: models })` only — no `updateSessionModels` call
        * **`setModelMultiplicity(model, count)` when `activeContextSessionId` non-null:** `previousSelectedModels = [...(get().selectedModels || [])]`; build `newModels`; `set({ selectedModels: newModels })`; background `updateSessionModels` with same revert/error rules as `setSelectedModels` on `response.error` or `.catch`
        * **`setModelMultiplicity` when `activeContextSessionId` null:** local `set({ selectedModels: newModels })` only
        * **On successful background `updateSessionModels`:** `updateSessionModels` action may update `selectedModels` from session response — optimistic revert path not taken; `updateSessionModelsError` cleared on direct `updateSessionModels` success (unchanged)
      * `[✅]`   Side effects: logging on catalog fetch and on model-selection failure — preserve existing messages; add revert side effect on error paths only
      * `[✅]`   Failure modes: `MODEL_TIER_DISALLOWED` and `MODEL_LIMIT_EXCEEDED` revert selection and populate `updateSessionModelsError`; generic API errors (`BG_UPDATE_FAIL`, etc.) same revert semantics; network `.catch` same revert
      * `[✅]`   Ordering: (1) all §A catalog test fixture updates; (2) §E RED tests in `dialecticStore.session.test.ts`; (3) `dialecticStore.ts` §E implementation in `setSelectedModels` and `setModelMultiplicity`; (4) confirm `fetchAIModelCatalog` passthrough unchanged
      * `[✅]`   No code — purely declarative

    * `[✅]`   `dialecticStore.session.test.ts`
      * `[✅]`   In `describe('fetchAIModelCatalog action')`, `it('should fetch and set AI model catalog on success')`, update `mockCatalog` array (lines 267–302):
        * First entry (lines 268–284): after `max_output_tokens: null,` add `min_plan_tier_level: 0,`
        * Second entry (lines 285–301): after `max_output_tokens: null,` add `min_plan_tier_level: 10,`
      * `[✅]`   Do not change test assertions (`expect(state.modelCatalog).toEqual(mockCatalog)`, `listModelCatalog` call count) — fixtures must match assertions exactly including new fields
      * `[✅]`   Do not modify error-path or network-path `fetchAIModelCatalog` tests in this file — they use empty catalog or errors, not full entry literals
      * `[✅]`   In `describe('setSelectedModels action')`, update `it('should log an error if background updateSessionModels fails')` (lines 589–607):
        * Before `setSelectedModels(newModelsSelected)`, add `useDialecticStore.setState({ selectedModels: initialModelsSelected })` so revert target is defined
        * After `vi.waitFor`, add assertions: `expect(useDialecticStore.getState().selectedModels).toEqual(initialModelsSelected)` (reverted, not `newModelsSelected`)
        * Add `expect(useDialecticStore.getState().updateSessionModelsError).toEqual(mockApiError)`
        * Keep existing `logger.error` expectation unchanged
      * `[✅]`   Append at end of `describe('setSelectedModels action')` (after the updated log test):
        * **Test: `setSelectedModels` reverts and sets `updateSessionModelsError` on `MODEL_TIER_DISALLOWED`**
          * `useDialecticStore.setState({ selectedModels: initialModelsSelected })`
          * `getMockDialecticClient().updateSessionModels.mockResolvedValue({ error: { code: 'MODEL_TIER_DISALLOWED', message: 'Selected models are not available on your plan', status: 403 }, status: 403 })`
          * `setSelectedModels(newModelsSelected)`; `await vi.waitFor(...)`
          * `expect(selectedModels).toEqual(initialModelsSelected)`; `expect(updateSessionModelsError?.code).toBe('MODEL_TIER_DISALLOWED')`
        * **Test: `setSelectedModels` reverts and sets `updateSessionModelsError` on `MODEL_LIMIT_EXCEEDED`**
          * Same setup with `code: 'MODEL_LIMIT_EXCEEDED'`, message `'Model selection exceeds the limit for your plan'`, `status: 403`
      * `[✅]`   In `describe('setModelMultiplicity action')`, update `it('should log an error if background updateSessionModels fails for setModelMultiplicity')` (lines 688–709):
        * `beforeEach` already sets `selectedModels: selectedModelsThree` — keep as revert baseline
        * After `setModelMultiplicity(modelToChangeObj, count)` and `vi.waitFor`, add `expect(useDialecticStore.getState().selectedModels).toEqual(selectedModelsThree)` (reverted)
        * Add `expect(useDialecticStore.getState().updateSessionModelsError).toEqual(mockApiError)`
        * Keep existing `logger.error` nthCalledWith expectation
      * `[✅]`   Append at end of `describe('setModelMultiplicity action')` (after multiplicity-to-0 test block if present, else after log test):
        * **Test: `setModelMultiplicity` reverts and sets `updateSessionModelsError` on `MODEL_TIER_DISALLOWED`**
          * State `selectedModels: selectedModelsThree`; mock `updateSessionModels` error `MODEL_TIER_DISALLOWED`; `setModelMultiplicity(modelToChangeObj, 2)`; await wait; expect `selectedModels` equals `selectedModelsThree`; expect error code
        * **Test: `setModelMultiplicity` reverts and sets `updateSessionModelsError` on `MODEL_LIMIT_EXCEEDED`**
          * Same with `MODEL_LIMIT_EXCEEDED` code and message
      * `[✅]`   Each new §E `it` covers exactly one behavior; append at end of respective `describe` per §8
      * `[✅]`   Do not change `describe('updateSessionModels action')` direct-call tests (L352+) — they already assert `updateSessionModelsError`; only optimistic-path describes gain revert assertions

    * `[✅]`   `dialecticStore.autostart.test.ts`
      * `[✅]`   In function `catalogEntry(overrides: Partial<AIModelCatalogEntry>)` base object (lines 94–110), after `is_default_generation: false,` add `min_plan_tier_level: 0,`
      * `[✅]`   All `catalogEntry({ ... })` call sites inherit `min_plan_tier_level: 0` unless `overrides` supplies a different `min_plan_tier_level`
      * `[✅]`   Do not change autostart behavior tests — only the shared factory base object

    * `[✅]`   `dialecticStore.notifications.test.ts`
      * `[✅]`   In `mockModel1` (lines 30–45), after `max_output_tokens: null,` add:
        * `is_default_generation: false,`
        * `min_plan_tier_level: 0,`
      * `[✅]`   In `mockModel2` (lines 47–62), after `max_output_tokens: null,` add:
        * `is_default_generation: false,`
        * `min_plan_tier_level: 0,`
      * `[✅]`   Both objects must satisfy `AIModelCatalogEntry` without `as` casts
      * `[✅]`   Do not change notification behavior tests — only mock catalog row completeness

    * `[✅]`   `dialecticStore.project.test.ts`
      * `[✅]`   In `defaultCatalogEntry` (lines 342–358), after `is_default_generation: true,` add `min_plan_tier_level: 0,`
      * `[✅]`   Do not change auto-start or project creation test logic

    * `[✅]`   `dialecticStore.contribution.test.ts`
      * `[✅]`   In `mockModelCatalog` array (lines 60–63), each inline `AIModelCatalogEntry` object gains `min_plan_tier_level: 0` before the closing `}`:
        * First entry (`id: 'model-1'`, ... `is_default_generation: false`): add `, min_plan_tier_level: 0` after `is_default_generation: false`
        * Second entry (`id: 'model-2'`, ... `is_default_generation: false`): add `, min_plan_tier_level: 0` after `is_default_generation: false`
      * `[✅]`   Do not change contribution fetch or cache tests

    * `[✅]`   `dialecticStore.test.ts`
      * `[✅]`   In `describe('setModelMultiplicity action')`, `it('should add and remove full SelectedModels objects correctly')`, update each of the three inline `modelCatalog` entries (lines 197–247): after `is_default_generation: true,` on each object add `min_plan_tier_level: 0,`
      * `[✅]`   In `it('should preserve displayName when changing multiplicity')`, update the single inline `modelCatalog` entry (lines 295–311): after `is_default_generation: true,` add `min_plan_tier_level: 0,`
      * `[✅]`   In generate-contributions setup, `mockModelCatalog` array (lines 1645–1648), each inline entry: after `is_default_generation: true` add `, min_plan_tier_level: 0`
      * `[✅]`   Do not change multiplicity or generation assertions — only catalog fixture shape
      * `[✅]`   §E revert tests for `setSelectedModels` / `setModelMultiplicity` with background `updateSessionModels` live in `dialecticStore.session.test.ts` (this file's `describe('setSelectedModels action')` at L175 has no `activeContextSessionId` — no §E test additions required here unless a future test adds session context)

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: `useDialecticStore` Zustand store — `fetchAIModelCatalog`, `setSelectedModels`, `setModelMultiplicity`
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):** (1) `dialecticStore.session.test.ts` — update `mockCatalog` `min_plan_tier_level` → lint → halt; (2) `dialecticStore.autostart.test.ts` — update `catalogEntry` base → lint → halt; (3) `dialecticStore.notifications.test.ts` — update `mockModel1` / `mockModel2` → lint → halt; (4) `dialecticStore.project.test.ts` — update `defaultCatalogEntry` → lint → halt; (5) `dialecticStore.contribution.test.ts` — update `mockModelCatalog` → lint → halt; (6) `dialecticStore.test.ts` — update all three `modelCatalog` fixture sites → lint → halt; (7) `dialecticStore.session.test.ts` — update existing background-failure tests + append four §E RED `it` blocks (revert + `updateSessionModelsError`) → lint → halt; (8) `dialecticStore.ts` — implement §E revert in `setSelectedModels` (L1284–1308) and `setModelMultiplicity` (L1311–1354); confirm `fetchAIModelCatalog` (L880–922) unchanged → lint → halt; (9) confirm `packages/store/src/index.ts` export unchanged → halt
      * `[✅]`   Prerequisite: `dialectic.api` node requirements all satisfied before step (1)
      * `[✅]`   Invalid construction contexts: unchanged from current file

    * `[✅]`   `dialecticStore.ts`
      * `[✅]`   `fetchAIModelCatalog` (lines 880–922): **no code changes** — success branch `set({ modelCatalog: response.data || [], isLoadingModelCatalog: false, modelCatalogError: null })` already persists full API rows including `min_plan_tier_level` once typed
      * `[✅]`   Do not add mapping, defaults, or filtering of `min_plan_tier_level` in the store
      * `[✅]`   **`setSelectedModels` (lines 1284–1308):** before `set({ selectedModels: models })`, assign `const previousSelectedModels: SelectedModels[] = [...(get().selectedModels || [])]`; keep optimistic `set`; in `.then((response) => { ... })`, when `response.error`, call `set({ selectedModels: previousSelectedModels, updateSessionModelsError: response.error })` then existing `logger.error`; when no error, do not revert (optional: clear `updateSessionModelsError` only if product requires — default leave unchanged on success to avoid scope creep); in `.catch`, `set({ selectedModels: previousSelectedModels, updateSessionModelsError: { message: err instanceof Error ? err.message : '...', code: 'NETWORK_ERROR' } })` matching network error shape used elsewhere in file, then existing log
      * `[✅]`   **`setModelMultiplicity` (lines 1311–1354):** at function start after `const state = get()`, assign `const previousSelectedModels: SelectedModels[] = [...(state.selectedModels || [])]` before building `newModels`; keep optimistic `set({ selectedModels: newModels })`; apply identical `.then` revert + `updateSessionModelsError` and `.catch` revert + network error assignment as `setSelectedModels`
      * `[✅]`   Do not edit `resetSelectedModels`, `updateSessionModels` body, or unrelated actions in this node
      * `[✅]`   Import `SelectedModels` already present in file — use for `previousSelectedModels` typing; no new types inline

    * `[✅]`   `packages/store/src/index.ts` (export boundary)
      * `[✅]`   Confirm `export * from './dialecticStore'` and `useDialecticStore` export remain — no export list changes required
      * `[✅]`   Public API: `fetchAIModelCatalog`, `setSelectedModels`, `setModelMultiplicity`, `modelCatalog`, `updateSessionModelsError` — signatures unchanged; behavior change on optimistic failure paths only

    * `[✅]`   `directionality`
      * `[✅]`   Layer: application store (`@paynless/store`)
      * `[✅]`   Deps inward: `@paynless/types`, `@paynless/api` (`dialectic.api` node), `@paynless/utils`
      * `[✅]`   Provides outward: `modelCatalog`, `fetchAIModelCatalog`, `selectedModels`, `updateSessionModelsError`, optimistic model actions to selectors, UI components, and session flows
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `dialectic.api` node complete — `AIModelCatalogEntry` includes `min_plan_tier_level: number`
      * `[✅]`   `dialecticStore.session.test.ts` `mockCatalog` both entries include `min_plan_tier_level` (`0` and `10`)
      * `[✅]`   `dialecticStore.autostart.test.ts` `catalogEntry()` base includes `min_plan_tier_level: 0`
      * `[✅]`   `dialecticStore.notifications.test.ts` `mockModel1` and `mockModel2` include `is_default_generation: false` and `min_plan_tier_level: 0`
      * `[✅]`   `dialecticStore.project.test.ts` `defaultCatalogEntry` includes `min_plan_tier_level: 0`
      * `[✅]`   `dialecticStore.contribution.test.ts` `mockModelCatalog` both entries include `min_plan_tier_level: 0`
      * `[✅]`   `dialecticStore.test.ts` all three `modelCatalog` fixture sites include `min_plan_tier_level: 0` on every inline entry
      * `[✅]`   `fetchAIModelCatalog` in `dialecticStore.ts` body unchanged — ripgrep `min_plan_tier_level` on `dialecticStore.ts` returns zero matches
      * `[✅]`   Existing `fetchAIModelCatalog` success test still passes with `expect(state.modelCatalog).toEqual(mockCatalog)`
      * `[✅]`   `setSelectedModels` with mocked `MODEL_TIER_DISALLOWED` / `MODEL_LIMIT_EXCEEDED` reverts `selectedModels` and sets `updateSessionModelsError` — session tests
      * `[✅]`   `setModelMultiplicity` with mocked tier validation errors reverts `selectedModels` and sets `updateSessionModelsError` — session tests
      * `[✅]`   Updated background-failure tests assert revert (not only log) for `setSelectedModels` and `setModelMultiplicity`
      * `[✅]`   `setSelectedModels` / `setModelMultiplicity` in `dialecticStore.ts` implement `previousSelectedModels` snapshot and revert on `response.error` and `.catch` — ripgrep `previousSelectedModels` appears in both functions

  * `[✅]`   [STORE] `packages/store/src/`dialecticStore.selectors` **Selector catalog fixtures and passthrough include `min_plan_tier_level`; default-model selection unchanged**

    * `[✅]`   `objective`
      * `[✅]`   After the `dialectic.api` and `dialecticStore` nodes, `AIModelCatalogEntry` requires `min_plan_tier_level: number`, but `dialecticStore.selectors.autostart.test.ts` `catalogEntry()` and `dialecticStore.selectors.test.ts` `selectModelCatalog` fixture still omit the field (partial object with `as AIModelCatalogEntry` at L447). `selectModelCatalog`, `selectIsLoadingModelCatalog`, and `selectModelCatalogError` are passthroughs; `selectDefaultGenerationModels` filters only on `is_default_generation` and `is_active` and maps `{ id, displayName }` — it must not branch on `min_plan_tier_level` in §A. This node updates every `AIModelCatalogEntry` factory/literal in the selector test support files so they compile, replaces the invalid cast in `selectModelCatalog` test with a complete row, and proves default-model selection behavior is unchanged when catalog rows carry tier metadata.
      * `[✅]`   Functional goals:
        * `catalogEntry()` in `dialecticStore.selectors.autostart.test.ts` base object includes `min_plan_tier_level: 0`
        * All `catalogEntry({ ... })` call sites in `dialecticStore.selectors.autostart.test.ts` inherit `min_plan_tier_level` unless `overrides` supplies a different value
        * `dialecticStore.selectors.test.ts` `selectModelCatalog` test uses a complete `AIModelCatalogEntry` (no `as AIModelCatalogEntry` cast on a partial object)
        * `selectModelCatalog`, `selectIsLoadingModelCatalog`, `selectModelCatalogError`, and `selectDefaultGenerationModels` implementations in `dialecticStore.selectors.ts` remain logically unchanged — no filter/map on `min_plan_tier_level`
        * New test in `dialecticStore.selectors.autostart.test.ts` proves `selectDefaultGenerationModels` returns default active models regardless of `min_plan_tier_level` value on catalog rows
        * Existing six `selectDefaultGenerationModels` tests in `dialecticStore.selectors.autostart.test.ts` continue to pass with updated `catalogEntry` base only
      * `[✅]`   Non-functional constraints:
        * **Depends on** `packages/api/src/dialectic.api` node complete (`AIModelCatalogEntry` includes `min_plan_tier_level`)
        * **Depends on** `packages/store/src/dialecticStore` node complete (store `modelCatalog` fixtures updated; `fetchAIModelCatalog` passthrough confirmed)
        * Do not edit `packages/types/src/dialectic.types.ts` in this node — type change is owned by `dialectic.api` node
        * Do not edit `dialecticStore.ts`, `dialecticStore.session.test.ts`, `dialecticStore.autostart.test.ts`, or other `dialecticStore.*.test.ts` files in this node
        * Do not implement tier gating UI, §E `setSelectedModels` revert, or subscription B/C work
        * Do not edit `dialecticStore.selectors.progress.test.ts`, `dialecticStore.selectors.documents.test.ts`, or other selector test files that import `AIModelCatalogEntry` but do not construct catalog literals — ripgrep `modelCatalog` and `AIModelCatalogEntry =` on those files returns no fixture construction
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Reselect selectors — read-only projections of `DialecticStateValues` for UI and store consumers (`selectModelCatalog`, `selectDefaultGenerationModels`, catalog loading/error flags)
      * `[✅]`   Appropriate because: selector module owns `selectDefaultGenerationModels` behavior tests and the only selector-side `AIModelCatalogEntry` factories; store node explicitly defers selector fixture updates to this node
      * `[✅]`   Must NOT: change `fetchAIModelCatalog`; modify `dialecticStore.ts`; tier-gate `AIModelSelector` components; add `min_plan_tier_level` filtering to production selector logic in §A

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Dialectic store selectors for model catalog (`selectModelCatalog`, `selectIsLoadingModelCatalog`, `selectModelCatalogError`, `selectDefaultGenerationModels`)
      * `[✅]`   Inside boundary: `dialecticStore.selectors.ts` catalog-related exports (passthrough confirm only), `dialecticStore.selectors.autostart.test.ts`, `dialecticStore.selectors.test.ts` catalog-related tests
      * `[✅]`   Outside boundary: `AIModelCatalogEntry` interface definition (`dialectic.api` node), `dialecticStore.fetchAIModelCatalog` and store test fixtures (`dialecticStore` node), UI tier gating (`AIModelSelector` nodes), §E optimistic revert on model selection
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `packages/api/src/dialectic.api` node (producer) — must be complete — `AIModelCatalogEntry` includes `min_plan_tier_level: number`
        * `packages/store/src/dialecticStore` node (producer) — must be complete — `modelCatalog` state typed and store test fixtures updated
        * `@paynless/types` — domain — inward — `AIModelCatalogEntry`, `DialecticStateValues`, `SelectedModels`, `ApiError` (read-only; no edits in this node)
        * `reselect` — external — inward — `createSelector` used elsewhere in file; catalog selectors are plain functions (unchanged)
        * `./dialecticStore` — store layer — inward — `initialDialecticStateValues` imported by `dialecticStore.selectors.autostart.test.ts` only
      * `[✅]`   Confirm:
        * No reverse dependencies — selectors do not import `dialecticStore.ts` implementation beyond `initialDialecticStateValues` in tests
        * No lateral layer violations

    * `[✅]`   `context_slice`
      * `[✅]`   From `@paynless/types`: `AIModelCatalogEntry` including required `min_plan_tier_level: number`; `SelectedModels` as `{ id: string; displayName: string }`
      * `[✅]`   Input state slice: `modelCatalog: AIModelCatalogEntry[]`, `isLoadingModelCatalog: boolean`, `modelCatalogError: ApiError`
      * `[✅]`   `selectModelCatalog(state)` → `state.modelCatalog` (array reference equality to state field)
      * `[✅]`   `selectDefaultGenerationModels(state)` → filters `state.modelCatalog ?? []` where `is_default_generation === true && is_active === true`, maps to `{ id: m.id, displayName: m.model_name }` — does not read `min_plan_tier_level`
      * `[✅]`   Injection shape: pure selector functions `(state: DialecticStateValues) => T`; tests build `DialecticStateValues` via `initialDialecticStateValues` spread
      * `[✅]`   Confirm: no `userTier` or auth fields in this node

    * `[✅]`   `dialecticStore.selectors.interaction.spec`
      * `[✅]`   Call patterns:
        * **`selectModelCatalog(state)`**: returns `state.modelCatalog` exactly (including each row’s `min_plan_tier_level` when present on state)
        * **`selectIsLoadingModelCatalog(state)`**: returns `state.isLoadingModelCatalog` — unchanged
        * **`selectModelCatalogError(state)`**: returns `state.modelCatalogError` — unchanged
        * **`selectDefaultGenerationModels(state)`** with `modelCatalog` containing `{ is_default_generation: true, is_active: true, min_plan_tier_level: 30 }`: entry included in result with `{ id, displayName: model_name }` — tier field does not exclude row
        * **`selectDefaultGenerationModels(state)`** with `modelCatalog` empty: returns `[]` — unchanged
        * **`selectDefaultGenerationModels(state)`** with defaults inactive or non-default: unchanged filtering rules
      * `[✅]`   Side effects: none — selectors are pure
      * `[✅]`   Failure modes: none — no error branches on catalog selectors
      * `[✅]`   Ordering: test fixture updates in `dialecticStore.selectors.autostart.test.ts` and `dialecticStore.selectors.test.ts` before confirming `dialecticStore.selectors.ts` needs no logic change; new `min_plan_tier_level` behavior test appended after existing autostart tests
      * `[✅]`   No code — purely declarative

    * `[✅]`   `dialecticStore.selectors.autostart.test.ts`
      * `[✅]`   In function `catalogEntry(overrides: Partial<AIModelCatalogEntry>)` base object (lines 7–23), after `is_default_generation: false,` add `min_plan_tier_level: 0,`
      * `[✅]`   All seven existing `catalogEntry({ ... })` call sites inherit `min_plan_tier_level: 0` unless `overrides` passes `min_plan_tier_level`
      * `[✅]`   Append at end of `describe('selectDefaultGenerationModels')` (after `it('handles multiple default models correctly and returns all matching')`):
        * **Test: `selectDefaultGenerationModels` does not filter by min_plan_tier_level`**
          * `const state: DialecticStateValues = stateWithCatalog([ catalogEntry({ id: 'high-tier-default', model_name: 'High Tier Default', is_default_generation: true, is_active: true, min_plan_tier_level: 30 }) ])`
          * `const result: SelectedModels[] = selectDefaultGenerationModels(state)`
          * `expect(result).toEqual([{ id: 'high-tier-default', displayName: 'High Tier Default' }])`
      * `[✅]`   Do not change assertions in the six existing `it` blocks — only `catalogEntry` base and the new seventh `it`
      * `[✅]`   Each new `it` covers exactly one behavior; append at end of describe per §8

    * `[✅]`   `dialecticStore.selectors.test.ts`
      * `[✅]`   In `it('selectModelCatalog should return modelCatalog from testState and initial', () => {` (lines 446–449), replace line 447:
        * **From:** `testState.modelCatalog = [{ id: 'model1' } as AIModelCatalogEntry];`
        * **To:** assign `testState.modelCatalog` to a one-element array containing a complete `AIModelCatalogEntry` with all required fields matching `catalogEntry` base in `dialecticStore.selectors.autostart.test.ts` (lines 7–23) plus `id: 'model1'`, `model_name: 'Model One'`, `min_plan_tier_level: 0` — no `as` cast on a partial object
      * `[✅]`   Keep `expect(selectModelCatalog(testState)).toEqual(testState.modelCatalog)` and initial-state assertion unchanged
      * `[✅]`   Do not modify other selector tests in this file (domains, projects, sessions, progress, etc.)

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: named exports from `dialecticStore.selectors.ts` — unchanged
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):** (1) `dialecticStore.selectors.autostart.test.ts` — update `catalogEntry` base + append new `it` (RED until base complete) → lint → halt; (2) `dialecticStore.selectors.test.ts` — replace `selectModelCatalog` partial cast with complete entry → lint → halt; (3) `dialecticStore.selectors.ts` — read L103–118; confirm no edit required → lint → halt; (4) confirm `packages/store/src/index.ts` `export * from './dialecticStore.selectors'` unchanged → halt
      * `[✅]`   Prerequisite: `dialectic.api` and `dialecticStore` node requirements all satisfied before step (1)
      * `[✅]`   Invalid construction contexts: unchanged from current file

    * `[✅]`   `dialecticStore.selectors.ts`
      * `[✅]`   `selectModelCatalog` (line 104): **no change** — `return state.modelCatalog`
      * `[✅]`   `selectIsLoadingModelCatalog` (line 107): **no change**
      * `[✅]`   `selectModelCatalogError` (line 110): **no change**
      * `[✅]`   `selectDefaultGenerationModels` (lines 113–118): **no change** — filter on `is_default_generation` and `is_active` only; do not add `min_plan_tier_level` to filter predicate or mapped `SelectedModels` shape
      * `[✅]`   Do not edit any other export in this file (domains, projects, contributions, progress, etc.)

    * `[✅]`   `packages/store/src/index.ts` (export boundary)
      * `[✅]`   Confirm `export * from './dialecticStore.selectors'` remains — no export list changes required
      * `[✅]`   Public API: `selectModelCatalog`, `selectDefaultGenerationModels`, and all other selector exports — signatures unchanged; catalog row type widened via `@paynless/types`

    * `[✅]`   `directionality`
      * `[✅]`   Layer: store selectors (projection of `DialecticStateValues`)
      * `[✅]`   Deps inward: `@paynless/types`, `initialDialecticStateValues` from `./dialecticStore`, producer nodes `dialectic.api` + `dialecticStore`
      * `[✅]`   Provides outward: `selectModelCatalog`, `selectDefaultGenerationModels`, etc., consumed by `apps/web` components and other store tests via `useDialecticStore(selector)`
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `dialectic.api` and `dialecticStore` nodes complete
      * `[✅]`   `dialecticStore.selectors.autostart.test.ts` `catalogEntry()` base includes `min_plan_tier_level: 0`
      * `[✅]`   New test: `selectDefaultGenerationModels` includes default active model when `min_plan_tier_level: 30` on catalog row
      * `[✅]`   Six existing `selectDefaultGenerationModels` tests still pass
      * `[✅]`   `dialecticStore.selectors.test.ts` `selectModelCatalog` test assigns complete `AIModelCatalogEntry` without `as` cast — ripgrep `as AIModelCatalogEntry` on `dialecticStore.selectors.test.ts` returns zero matches
      * `[✅]`   `selectModelCatalog` test entry includes `min_plan_tier_level: 0`
      * `[✅]`   `dialecticStore.selectors.ts` L113–118 filter/map unchanged — ripgrep `min_plan_tier_level` on `dialecticStore.selectors.ts` returns zero matches
      * `[✅]`   `dialecticStore.selectors.progress.test.ts` and `dialecticStore.selectors.documents.test.ts` unchanged

  * `[✅]`   [UI] `apps/web/src/components/dialectic/`AIModelSelector` **Tier-gate multiplicity model selector by `userTier` and `min_plan_tier_level`**

    * `[✅]`   `objective`
      * `[✅]`   §D: `AIModelSelector.tsx` renders every `availableProviders` row with a `MultiplicitySelector` and no tier or count limits. Users must only be able to add models their plan allows (`provider.min_plan_tier_level` vs `userTier.level` from Ticket 1 auth store) and must not exceed `userTier.max_models_per_project` total instances (duplicates count). Locked models stay visible with upgrade messaging at the row; at-cap blocks increment with upgrade messaging **on the disabled control** (not in the dropdown footer, which is off-screen). Decrement on already-selected models remains allowed at cap.
      * `[✅]`   Functional goals:
        * Component reads `userTier` and `availableTiers` from `useAuthStore` (store field is `userTier`, not `tier`)
        * Row with `provider.min_plan_tier_level > userTier.level` is visually disabled, does not render `MultiplicitySelector`, shows lock + “Requires {tier name}” and tooltip upgrade CTA at that row linking to `/subscription`
        * Total selected count = `currentSelectedModelIds.length` (all instances); when `userTier.max_models_per_project` is a number and total ≥ max, unselected rows cannot increment; selected rows can decrement only
        * When increment is blocked by count cap, tooltip at the `MultiplicitySelector` (wrap controls) shows limit copy `{count}/{max}` + upgrade CTA to `/subscription` on hover/click of the disabled increment — same visibility rule as tier lock
        * When `userTier.max_models_per_project` is `null` (ultra), no count cap and no count-cap tooltip
        * Do **not** add count-limit upgrade CTA to dropdown footer — footer may retain existing “Clear All” / selection summary only
        * `handleMultiplicityChange` does not call `setModelMultiplicity` when tier-locked or when increment would exceed cap
        * Existing loading, error, default-model, and multiplicity behaviors unchanged when tier allows selection
      * `[✅]`   Non-functional constraints:
        * **Depends on** `packages/api/src/dialectic.api` node complete (`AIModelCatalogEntry` includes `min_plan_tier_level` for `catalogEntry()` in tests)
        * **Depends on** Ticket 1: `useAuthStore().userTier` and `availableTiers` populated in production (tests mock via `profile.mock.ts`)
        * Do not edit `AIModelSelectorList.tsx`, `MultiplicitySelector.tsx`, `dialecticStore.ts` §E revert logic, or `packages/types` in this node
        * Do not extract tier helpers to a new file — module-level typed helpers/constants live in `AIModelSelector.tsx` only (same file as existing `SelectedModelsDisplayContent`)
        * Preserve `AIModelSelectorProps` (`disabled?: boolean`) in `AIModelSelector.tsx`; no new props
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Presentation component (`apps/web`) — dialectic session model picker with multiplicity dropdown
      * `[✅]`   Appropriate because: owns dropdown UI, reads `useAiStore` `availableProviders`, `useDialecticStore` selection actions, and must enforce tier UX before store optimistic updates
      * `[✅]`   Must NOT: implement checkbox list (`AIModelSelectorList` node); change BE or store revert behavior; edit `aiStore` / `dialecticStore` producers

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Dialectic model selection UI (multiplicity dropdown in session/project flows)
      * `[✅]`   Inside boundary: `AIModelSelector.tsx`, `AIModelSelector.test.tsx`, tier gating helpers/constants in the same TSX file, test mocks for `useAuthStore` + updated `AiProvider` / `AIModelCatalogEntry` fixtures
      * `[✅]`   Outside boundary: `AIModelSelectorList.tsx`, `MultiplicitySelector.tsx` implementation (parent passes props only), `dialecticStore.setModelMultiplicity` / §E error revert, subscription B/C nodes
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `@paynless/store` — `useDialecticStore`, `useAiStore`, `useAuthStore`, `selectSelectedModels`, `selectDefaultGenerationModels` — inward — selection state, provider list, user tier
        * `@paynless/types` — inward — `AiProvider`, `UserTier`, `SelectedModels`, `AIModelCatalogEntry`, `DialecticStateValues`, `AiState`
        * `@/components/ui/*` — inward — `dropdown-menu`, `scroll-area`, `badge`, `button`, `tooltip`
        * `@/components/dialectic/MultiplicitySelector` — inward — increment/decrement control (parent supplies `maxValue`, `disabled`)
        * `react-router-dom` `Link` — inward — `/subscription` upgrade CTA
        * `lucide-react` — inward — `ChevronDown`, `X`, `Cpu`, `Lock` (add `Lock` import)
        * `apps/web/src/mocks/profile.mock.ts` — test-only — `mockUserTier`, `mockAllTiers` for default auth mock state
      * `[✅]`   Confirm:
        * No reverse dependencies — stores do not import `AIModelSelector`
        * `AiProvider` (`packages/types/src/ai.types.ts` DB row) already includes `min_plan_tier_level: number` — tier compare uses `availableProviders`, not `modelCatalog` entries, for row gating

    * `[✅]`   `context_slice`
      * `[✅]`   From `useAuthStore`: `userTier: UserTier`, `availableTiers: UserTier[]`
      * `[✅]`   From `useAiStore`: `availableProviders`, `isConfigLoading`, `loadAiConfig`, `aiError`
      * `[✅]`   From `useDialecticStore`: `selectedModels`, `setModelMultiplicity`, `setSelectedModels`, `fetchAIModelCatalog`, `modelCatalog`, `isLoadingModelCatalog`, `activeContextSessionId`; `selectDefaultGenerationModels` via second hook call
      * `[✅]`   Effective tier when `userTier` is null: treat as free tier `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }` for gating only (do not write to auth store)
      * `[✅]`   Injection shape: Zustand selector hooks in component body; tests mock hooks via extended `vi.mock('@paynless/store')`

    * `[✅]`   `AIModelSelector.interaction.spec`
      * `[✅]`   Call patterns (unchanged unless noted):
        * Mount: load AI config when providers empty; fetch catalog when `modelCatalog` empty; apply default models when no session and empty selection — unchanged
        * **Per provider row:** compute `tierLocked = provider.min_plan_tier_level > effectiveUserTier.level`
        * **Total count:** `totalSelectedCount = currentSelectedModelIds.length`
        * **At cap:** `modelLimit = effectiveUserTier.max_models_per_project`; `atCap = modelLimit !== null && totalSelectedCount >= modelLimit`
        * **Tier-locked row (§D.2–3):** no `MultiplicitySelector`; show lock UI + `Tooltip` on lock trigger; row `className` includes `opacity-50`; `data-testid={`tier-lock-${provider.id}`}` on lock container; increment/decrement absent; `TooltipContent` with tier message + `Link` `data-testid={`upgrade-link-tier-${provider.id}`}` to `/subscription`
        * **Count cap row (§D.4):** render `MultiplicitySelector` inside `Tooltip` when `atCap && modelLimit !== null && !tierLocked` — `TooltipTrigger asChild` wraps `span` `data-testid={`model-cap-controls-${provider.id}`}` containing `MultiplicitySelector` so tooltip fires on hover of disabled increment (Radix: wrapper `span` when child increment is `disabled`); parent passes `disabled={finalIsDisabled || tierLocked || (atCap && !isSelected)}` on unselected rows and `disabled={finalIsDisabled || tierLocked}` with `maxValue={atCap && isSelected ? count : undefined}` on selected rows; `TooltipContent` text `You've reached the model limit for your plan ({totalSelectedCount}/{modelLimit}). Upgrade to {nextTierName} to add more models.` + `Link` `data-testid={`upgrade-link-cap-${provider.id}`}` to `/subscription`
        * **`handleMultiplicityChange`:** if `tierLocked` OR (`atCap && newCount > count`) return without calling `setModelMultiplicity`; else existing provider/model lookup and `setModelMultiplicity` call unchanged
        * **`nextTierName`:** display name of lowest `availableTiers` entry where `entry.level > effectiveUserTier.level` and (`entry.max_models_per_project === null` OR `entry.max_models_per_project > modelLimit` when `modelLimit` is number); if none, `'Ultra'`
        * **Footer (lines 304–329):** unchanged selection summary + Clear All only — **no** `model-limit-footer`, **no** footer upgrade link
        * **Tier display name:** `tierDisplayName(level, availableTiers)` — prefer `availableTiers.find(t => t.level === level)?.name` capitalized; else static map `0→Free`, `10→Basic`, `20→Premium`, `30→Ultra`
      * `[✅]`   Failure modes: `userTier` null → free-tier effective limits; `availableProviders` empty → existing empty states unchanged
      * `[✅]`   Ordering: test mock/auth fixtures before component implementation; append new tier `it` blocks at end of `describe('AIModelSelector')` before `describe('AIModelSelector Pulsing animation')`
      * `[✅]`   No code — purely declarative

    * `[✅]`   `AIModelSelector.test.tsx`
      * `[✅]`   **Extend `vi.mock('@paynless/store')`:** keep `importOriginal` spread; add `useAuthStore` mock mirroring `useDialecticStore` / `useAiStore` pattern with mutable `currentAuthState: { userTier: UserTier; availableTiers: UserTier[] }`
      * `[✅]`   **Extend `setupMockStores`:** add optional third argument `initialAuthConfig: { userTier?: UserTier; availableTiers?: UserTier[] }` defaulting to `{ userTier: mockUserTier, availableTiers: mockAllTiers }` from `apps/web/src/mocks/profile.mock.ts`; assign `currentAuthState` on each call
      * `[✅]`   **Add `renderWithRouter` helper:** `render(<MemoryRouter>{children}</MemoryRouter>)` — use for every `render(<AIModelSelector` / `rerender` in this file so `Link` to `/subscription` does not throw (update all existing `render(` / `rerender(` call sites in `describe('AIModelSelector')` and `describe('AIModelSelector Pulsing animation')` to use `renderWithRouter`)
      * `[✅]`   **Update `mockAiProvidersData` (lines 85–88):** each `AiProvider` object gains `min_plan_tier_level: 0` (required DB row field) so free-tier default mock allows existing increment tests
      * `[✅]`   **Update `catalogEntry()` base (lines 100–117):** add `min_plan_tier_level: 0` after `is_default_generation: false,`
      * `[✅]`   **Update `geminiModel` literal (line 257):** add `min_plan_tier_level: 0`
      * `[✅]`   **Tier fixture providers** (use in new tests only; keep `mockAiProvidersData` at 0 for legacy tests):
        * `providerFree: AiProvider` — copy `mockAiProvidersData[0]` shape with `id: 'model-free'`, `name: 'Free Model'`, `min_plan_tier_level: 0`
        * `providerPremium: AiProvider` — `id: 'model-premium'`, `name: 'Premium Model'`, `min_plan_tier_level: 20`
        * `tierFree: UserTier` — `mockUserTier` from `profile.mock.ts` (`level: 0`, `max_models_per_project: 1`)
        * `tierUltra: UserTier` — entry from `mockAllTiers` with `level: 30`, `max_models_per_project: null`
      * `[✅]`   Append at end of `describe('AIModelSelector')` (before `describe('AIModelSelector Pulsing animation')`):
        * **Test: model above user tier renders disabled without multiplicity controls**
          * `setupMockStores({}, { availableProviders: [providerFree, providerPremium], isConfigLoading: false }, { userTier: tierFree, availableTiers: mockAllTiers })`
          * `renderWithRouter(<AIModelSelector />)`; open dropdown
          * `within(screen.getByTestId('model-item-model-premium')).queryByRole('button', { name: /Increment/i })` is null
          * `within(screen.getByTestId('model-item-model-premium')).getByTestId('tier-lock-model-premium')` is in the document
          * `within(screen.getByTestId('model-item-model-free')).getByRole('button', { name: /Increment/i })` is in the document
        * **Test: tier-locked row shows upgrade CTA with link to subscription at lock interaction point**
          * Same setup; open dropdown; `user.hover` or `user.click` on `tier-lock-model-premium`
          * `screen.getByText(/This model requires a Premium plan/i)` (or matching `tierDisplayName(20, …)` → `Premium`)
          * `screen.getByTestId('upgrade-link-tier-model-premium')` has attribute `href` `/subscription`
        * **Test: at max_models_per_project unselected models cannot increment**
          * `availableProviders: [providerFree, providerPremium with min_plan_tier_level 0]` — use two free-tier providers: duplicate `providerFree` with `id: 'model-free-b'`, `name: 'Free B'`, both `min_plan_tier_level: 0`
          * `setupMockStores({ selectedModels: selectedModelsFromIds(['model-free']) }, { availableProviders: [providerFree, providerFreeB] }, { userTier: tierFree })`
          * open dropdown; `model-free-b` row increment button `disabled` OR absent increment interaction does not call `setModelMultiplicity` on click
        * **Test: at count cap hover on disabled increment on unselected row shows upgrade CTA at control**
          * Same setup as unselected-increment test: `tierFree`, `selectedModels: selectedModelsFromIds(['model-free'])`, `[providerFree, providerFreeB]`, dropdown open
          * `within(screen.getByTestId('model-item-model-free-b')).getByTestId('model-cap-controls-model-free-b')` is in the document
          * `user.hover(within(screen.getByTestId('model-item-model-free-b')).getByRole('button', { name: /Increment/i }))` (or hover `model-cap-controls-model-free-b` wrapper)
          * `screen.getByText(/You've reached the model limit for your plan \(1\/1\)/i)`
          * `screen.getByTestId('upgrade-link-cap-model-free-b')` has attribute `href` `/subscription`
          * `screen.queryByTestId('model-limit-footer')` is null — count-cap CTA is not in footer
          * `user.click` disabled increment: `setModelMultiplicity` not called
        * **Test: at cap selected model can decrement; disabled increment shows count-cap CTA at control**
          * `selectedModels: selectedModelsFromIds(['model-free'])`, `tierFree` max 1, single provider `providerFree`, dropdown open
          * decrement click calls `setModelMultiplicity` with `0`
          * re-setup with count 1 at cap; hover disabled increment on `model-item-model-free`; `screen.getByTestId('upgrade-link-cap-model-free')` in document after hover; increment click does not call `setModelMultiplicity`
        * **Test: ultra tier max_models_per_project null imposes no count limit**
          * `userTier: tierUltra`; providers `min_plan_tier_level: 0`; repeated increments to count 3 succeed; `screen.queryByTestId('upgrade-link-cap-model-free')` null when not at cap
        * **Test: ultra user can access highest-tier model row**
          * `userTier: tierUltra`; `providerPremium` `min_plan_tier_level: 20`; row `model-item-model-premium` has increment button, no `tier-lock-model-premium`
      * `[✅]`   Do not remove or weaken existing tests in `describe('AIModelSelector')` or `describe('AIModelSelector Pulsing animation')` — updating fixtures (`min_plan_tier_level: 0`, `renderWithRouter`, auth defaults) must keep them green
      * `[✅]`   Each new `it` covers exactly one behavior; append at end per §8

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: `export const AIModelSelector: React.FC<AIModelSelectorProps>` — unchanged export
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):** (1) `AIModelSelector.test.tsx` — extend store mock, `renderWithRouter`, fixture updates, append seven RED `it` blocks → lint → halt; (2) `AIModelSelector.tsx` — tier gating implementation → lint → halt
      * `[✅]`   Prerequisite: `dialectic.api`, `dialecticStore`, and `dialecticStore.selectors` nodes complete

    * `[✅]`   `AIModelSelector.tsx`
      * `[✅]`   **Imports:** add `useAuthStore` from `@paynless/store`; add `Lock` from `lucide-react`; add `Link` from `react-router-dom`; add `Tooltip`, `TooltipContent`, `TooltipTrigger` from `@/components/ui/tooltip`; add type `UserTier` from `@paynless/types`
      * `[✅]`   **Module-level (above `SelectedModelsDisplayContent`):** add `const TIER_LEVEL_DISPLAY_NAMES: Record<number, string> = { 0: 'Free', 10: 'Basic', 20: 'Premium', 30: 'Ultra' };` and function `tierDisplayName(level: number, availableTiers: UserTier[]): string` returning capitalized `availableTiers` match name or map fallback or `` `Tier ${level}` ``
      * `[✅]`   **Inside `AIModelSelector` after existing store hooks:** subscribe `const userTier = useAuthStore((s) => s.userTier);` and `const availableTiers = useAuthStore((s) => s.availableTiers);`
      * `[✅]`   **Derive `effectiveUserTier: UserTier`:** if `userTier !== null` use `userTier`; else `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }`
      * `[✅]`   **Derive `totalSelectedCount`:** `currentSelectedModelIds.length`
      * `[✅]`   **Derive `modelLimit`:** `effectiveUserTier.max_models_per_project`
      * `[✅]`   **Derive `atCap`:** `modelLimit !== null && totalSelectedCount >= modelLimit`
      * `[✅]`   **Derive `nextTierName`:** from `availableTiers` sorted ascending by `level`, first tier where `level > effectiveUserTier.level` and (`max_models_per_project === null` OR `max_models_per_project > modelLimit` when `modelLimit` is number); if none, `'Ultra'`
      * `[✅]`   **Update `handleMultiplicityChange`:** at function start resolve `provider` from `availableProviders`; compute `tierLocked` and current `count` from `modelMultiplicities`; if `tierLocked || (atCap && newCount > count)` return; else existing body unchanged
      * `[✅]`   **In `availableProviders.map` row (lines 245–298):** for each `provider`:
        * `tierLocked = provider.min_plan_tier_level > effectiveUserTier.level`
        * `isSelected = count > 0`
        * Row `className`: add `tierLocked && 'opacity-50 cursor-not-allowed'`, remove `cursor-pointer` when `tierLocked`
        * Replace controls block: when `tierLocked`, render `Tooltip` > `TooltipTrigger` > div `data-testid={`tier-lock-${provider.id}`}` with `Lock` + text `Requires {tierDisplayName(provider.min_plan_tier_level, availableTiers)}`; `TooltipContent` with sentence `This model requires a {name} plan.` and `Link to="/subscription"` `data-testid={`upgrade-link-tier-${provider.id}`}` children `Upgrade to {name}`
        * When not `tierLocked` and `atCap && modelLimit !== null`, render `Tooltip` > `TooltipTrigger asChild` > `span` `data-testid={`model-cap-controls-${provider.id}`}` > `MultiplicitySelector` with `disabled={finalIsDisabled || (atCap && !isSelected)}`, `maxValue={atCap && isSelected ? count : undefined}`, `minValue={0}`, `onChange` unchanged; `TooltipContent` with count-limit copy + `Link` `data-testid={`upgrade-link-cap-${provider.id}`}` to `/subscription`
        * When not `tierLocked` and not at cap, bare `MultiplicitySelector` with same props except no cap tooltip wrapper
      * `[✅]`   **Footer block (lines 304–329):** keep existing clear-all / selection summary only — do **not** add `model-limit-footer` or footer upgrade link
      * `[✅]`   Do not change `SelectedModelsDisplayContent`, `AIModelSelectorProps`, or default-model `useEffect` logic except imports if needed
      * `[✅]`   Do not edit `MultiplicitySelector.tsx`

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI (`apps/web`)
      * `[✅]`   Deps inward: `@paynless/store`, `@paynless/types`, UI primitives, `MultiplicitySelector`, `react-router-dom`
      * `[✅]`   Provides outward: rendered model picker consumed by dialectic pages/forms importing `AIModelSelector`
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `useAuthStore` `userTier` and `availableTiers` read in `AIModelSelector.tsx` — ripgrep confirms
      * `[✅]`   Tier-locked provider row: no increment/decrement; `tier-lock-{id}` present — new test 1
      * `[✅]`   Per-row upgrade CTA (tier lock) at lock control + `/subscription` — new test 2 (`upgrade-link-tier-{id}`)
      * `[✅]`   At `max_models_per_project: 1`, second unselected provider increment disabled — new test 3
      * `[✅]`   At count cap, upgrade CTA on disabled increment (`upgrade-link-cap-{id}`), not footer — new test 4; `model-limit-footer` absent
      * `[✅]`   At cap, decrement allowed; disabled increment shows cap CTA at control — new test 5
      * `[✅]`   Ultra `max_models_per_project: null`: no count-cap tooltip/link, multiplicity can exceed 1 — new test 6
      * `[✅]`   Ultra user: `min_plan_tier_level: 20` model has multiplicity controls — new test 7
      * `[✅]`   All pre-existing `AIModelSelector` and pulsing tests pass with `min_plan_tier_level: 0` on fixtures and default free-tier auth mock
      * `[✅]`   `MultiplicitySelector.tsx` unchanged — no subscription copy inside child; parent owns tooltips
      * `[✅]`   ripgrep `model-limit-footer` on `AIModelSelector.tsx` returns zero matches

  * `[ ]`   [UI] `apps/web/src/components/dialectic/`AIModelSelectorList` **Tier-gate checkbox model list by `userTier` and `min_plan_tier_level` (Start Project / chat model step)**

    * `[✅]`   `objective`
      * `[✅]`   §D: `AIModelSelectorList.tsx` renders every `availableProviders` row as a full-width `<button>` with a `Checkbox` and toggles `modelsChecked` via local state + `onChange` with no tier or count limits. Users on the Start Project model step (`apps/web/src/components/chat/index.tsx` `currentStep === "model"`) must only check models their plan allows (`provider.min_plan_tier_level` vs `userTier.level`) and must not check more than `userTier.max_models_per_project` unique models when that value is a number. Locked models stay visible; upgrade messaging and `/subscription` link appear **at the row the user is trying to interact with** (tooltip on tier-locked row or on row blocked by count cap) — not in a distant footer or summary area.
      * `[✅]`   Functional goals:
        * Component reads `userTier` and `availableTiers` from `useAuthStore` (store field is `userTier`, not `tier`)
        * Row with `provider.min_plan_tier_level > effectiveUserTier.level` is visually disabled (`opacity-50`, `cursor-not-allowed`); `Checkbox` not checked and not toggleable; row shows `Lock` + `Requires {tier name}`; `Tooltip` on row interaction surface exposes tier message + `Link` to `/subscription` at `data-testid={`upgrade-link-tier-${provider.id}`}`
        * Checked count = `modelsChecked.length` (one id per checked row — no multiplicity in this component)
        * When `effectiveUserTier.max_models_per_project` is a number and `modelsChecked.length >= modelLimit`, unchecked rows cannot be checked; checked rows can be unchecked
        * When check is blocked by count cap, `Tooltip` on that row’s `<button>` (the control the user clicked/hovered) shows `You've reached the model limit for your plan ({checkedCount}/{modelLimit}). Upgrade to {nextTierName} to add more models.` + `Link` `data-testid={`upgrade-link-cap-${provider.id}`}` to `/subscription`
        * When `effectiveUserTier.max_models_per_project` is `null` (ultra), no count cap and no count-cap tooltip/link
        * `toggleModelChecked(providerId)` does not update state or call `onChange` when tier-locked or when adding would exceed cap
        * Preserve `loadAiConfig` `useEffect`, sorted provider list, `onChange` callback contract, and optional `disabled` prop from parent
      * `[✅]`   Non-functional constraints:
        * **Depends on** Ticket 1: `useAuthStore().userTier` and `availableTiers` in production (tests mock via `apps/web/src/mocks/profile.mock.ts`)
        * **Depends on** `apps/web/src/components/dialectic/AIModelSelector` node complete (establishes tier UX patterns; this node adapts to checkbox UI only)
        * Do not edit `AIModelSelector.tsx`, `MultiplicitySelector.tsx`, `dialecticStore.ts` §E revert logic, or `packages/types` in this node
        * Do not extract tier helpers to a new file — module-level typed helpers/constants live in `AIModelSelectorList.tsx` only
        * Do not add footer, banner, or scroll-area-level upgrade CTAs — CTAs only on tier-locked or count-blocked row tooltips
      * `[✅]`   Each goal is atomic and testable

    * `[✅]`   `role`
      * `[✅]`   Presentation component (`apps/web`) — checkbox list for model pick on chat/Start Project flow
      * `[✅]`   Appropriate because: owns list UI, reads `useAiStore` `availableProviders`, local selection state, and must enforce tier UX before `onChange` notifies parent (`setHasSelectedModel` in `chat/index.tsx`)
      * `[✅]`   Must NOT: implement multiplicity dropdown (`AIModelSelector`); call `dialecticStore` selection actions; change BE or store revert behavior

    * `[✅]`   `module`
      * `[✅]`   Bounded context: Dialectic model selection UI (checkbox list on model step)
      * `[✅]`   Inside boundary: `AIModelSelectorList.tsx`, `AIModelSelectorList.test.tsx` (new), tier gating helpers/constants in the same TSX file, test mocks for `useAuthStore` + `useAiStore`
      * `[✅]`   Outside boundary: `AIModelSelector.tsx`, `MultiplicitySelector.tsx`, `dialecticStore` §E, `chat/index.tsx` parent wiring (parent only passes `onChange`; no parent edit required in this node)
      * `[✅]`   Each boundary rule is explicit and reviewable

    * `[✅]`   `deps`
      * `[✅]`   For each dependency:
        * `@paynless/store` — `useAiStore`, `useAuthStore` — inward — provider list, user tier
        * `@paynless/types` — inward — `AiProvider`, `UserTier`
        * `@/components/ui/checkbox` — inward — visual checked state
        * `@/components/ui/scroll-area` — inward — list scroll container (unchanged)
        * `@/components/ui/tooltip` — inward — upgrade CTA at disabled interaction point
        * `react-router-dom` `Link` — inward — `/subscription` upgrade CTA
        * `lucide-react` — inward — `Lock`
        * `apps/web/src/mocks/profile.mock.ts` — test-only — `mockUserTier`, `mockAllTiers`
      * `[✅]`   Confirm:
        * No reverse dependencies — stores do not import `AIModelSelectorList`
        * `AiProvider` (`packages/types/src/ai.types.ts` DB row) includes `min_plan_tier_level: number` — tier compare uses `availableProviders` only

    * `[✅]`   `context_slice`
      * `[✅]`   From `useAuthStore`: `userTier: UserTier`, `availableTiers: UserTier[]`
      * `[✅]`   From `useAiStore`: `availableProviders`, `isConfigLoading`, `loadAiConfig`, `aiError`
      * `[✅]`   Props: `onChange: (modelsChecked: string[]) => void`; optional `disabled?: boolean` (wire through — currently declared on misnamed interface but not destructured)
      * `[✅]`   Local state: `modelsChecked: string[]` — unchanged ownership
      * `[✅]`   Effective tier when `userTier` is null: `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }` for gating only (do not write to auth store)
      * `[✅]`   Injection shape: Zustand selector hooks in component body; tests mock hooks via `vi.mock('@paynless/store')`

    * `[✅]`   `AIModelSelectorList.interaction.spec`
      * `[✅]`   Call patterns (unchanged unless noted):
        * Mount: `loadAiConfig` when providers empty and not loading — unchanged
        * **Per provider row:** `tierLocked = provider.min_plan_tier_level > effectiveUserTier.level`
        * **Checked count:** `checkedCount = modelsChecked.length`
        * **At cap:** `modelLimit = effectiveUserTier.max_models_per_project`; `atCap = modelLimit !== null && checkedCount >= modelLimit`
        * **Is checked:** `isChecked = modelsChecked.includes(provider.id)`
        * **Blocked add:** `blockedAdd = tierLocked || (atCap && !isChecked)`
        * **Tier-locked row (§D.2–3):** row `data-testid={`model-list-item-${provider.id}`}`; `className` includes `opacity-50 cursor-not-allowed`; `Checkbox` `checked={false}` `disabled={true}`; no state toggle on click/keyboard; show `Lock` + `Requires {tierDisplayName(provider.min_plan_tier_level, availableTiers)}` inside row; entire row `<button>` wrapped in `Tooltip` > `TooltipTrigger asChild` > button; `data-testid={`tier-lock-${provider.id}`}` on lock label container inside button; `TooltipContent`: `This model requires a {name} plan.` + `Link` `data-testid={`upgrade-link-tier-${provider.id}`}` `to="/subscription"` children `Upgrade to {name}`
        * **Count-cap blocked row (§D.4):** not `tierLocked`, `atCap`, `!isChecked` — row button wrapped in `Tooltip` > `TooltipTrigger asChild` > button `data-testid={`model-cap-row-${provider.id}`}`; click/Space/Enter on row does not add id; `Checkbox` remains unchecked `disabled={true}`; `TooltipContent`: count-limit copy + `Link` `data-testid={`upgrade-link-cap-${provider.id}`}` to `/subscription`
        * **Allowed row:** not `tierLocked`, not `blockedAdd` — existing toggle behavior: click/keyboard flips membership in `modelsChecked`, calls `onChange(newModelsChecked)`; `Checkbox` `checked={isChecked}` `disabled={disabledProp}` only when parent `disabled` true
        * **At cap, checked row:** `isChecked` true — toggle removes id (uncheck allowed); no count-cap tooltip on uncheck
        * **`toggleModelChecked(providerId)`:** resolve provider; if `tierLocked` return; if `atCap && !isChecked` return; else toggle id in `modelsChecked` and `onChange`
        * **`nextTierName`:** lowest `availableTiers` entry where `level > effectiveUserTier.level` and (`max_models_per_project === null` OR `max_models_per_project > modelLimit` when `modelLimit` is number); if none, `'Ultra'`
        * **`tierDisplayName(level, availableTiers)`:** prefer `availableTiers.find(t => t.level === level)?.name` capitalized; else static map `0→Free`, `10→Basic`, `20→Premium`, `30→Ultra`
      * `[✅]`   Failure modes: `userTier` null → free-tier effective limits; `availableProviders` null/empty → render empty list (unchanged); parent `disabled={true}` → all toggles no-op
      * `[✅]`   Ordering: create `AIModelSelectorList.test.tsx` with RED tests first; then implement `AIModelSelectorList.tsx`
      * `[✅]`   No code — purely declarative

    * `[✅]`   `AIModelSelectorList.test.tsx` (CREATE)
      * `[✅]`   **New file** `apps/web/src/components/dialectic/AIModelSelectorList.test.tsx` mirroring `AIModelSelector.test.tsx` store-mock pattern (ai + auth only — no dialectic store)
      * `[✅]`   **Imports:** `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` from `vitest`; `render`, `screen`, `within` from `@testing-library/react`; `userEvent` from `@testing-library/user-event`; `MemoryRouter` from `react-router-dom`; `AIModelSelectorList` from `./AIModelSelectorList`; types `AiProvider`, `UserTier`, `AiState` from `@paynless/types`; `initialAiStateValues` from `@paynless/types`; `mockUserTier`, `mockAllTiers` from `apps/web/src/mocks/profile.mock.ts`
      * `[✅]`   **`vi.mock('@paynless/store')`:** `importOriginal` spread; `useAiStore` mock with mutable `currentAiState` + `currentAiActions.loadAiConfig`; `useAuthStore` mock with mutable `currentAuthState: { userTier: UserTier; availableTiers: UserTier[] }`
      * `[✅]`   **`setupMocks(aiPartial?, authPartial?)`:** merge `initialAiStateValues`, default `availableProviders: []`, `isConfigLoading: false`, `aiError: null`; auth defaults `{ userTier: mockUserTier, availableTiers: mockAllTiers }`
      * `[✅]`   **`renderWithRouter(ui)`:** `render(<MemoryRouter>{ui}</MemoryRouter>)`
      * `[✅]`   **`onChange` spy:** `const onChange = vi.fn()` passed to every `AIModelSelectorList` render
      * `[✅]`   **Fixture providers:**
        * `providerFree: AiProvider` — full DB row fields required by `AiProvider` type; `id: 'model-free'`, `name: 'Free Model'`, `min_plan_tier_level: 0`, plus all other required columns copied from a minimal valid row in existing `AIModelSelector.test.tsx` `mockAiProvidersData[0]` pattern with `min_plan_tier_level: 0`
        * `providerFreeB: AiProvider` — `id: 'model-free-b'`, `name: 'Free B'`, `min_plan_tier_level: 0`, same required fields
        * `providerPremium: AiProvider` — `id: 'model-premium'`, `name: 'Premium Model'`, `min_plan_tier_level: 20`, same required fields
        * `tierFree: UserTier` — `mockUserTier` (`level: 0`, `max_models_per_project: 1`)
        * `tierUltra: UserTier` — entry from `mockAllTiers` with `level: 30`, `max_models_per_project: null`
      * `[✅]`   **`describe('AIModelSelectorList')` — append six `it` blocks (each one behavior):**
        * **Test: model above user tier renders disabled without checkable checkbox**
          * `setupMocks({ availableProviders: [providerFree, providerPremium], isConfigLoading: false }, { userTier: tierFree, availableTiers: mockAllTiers })`
          * `renderWithRouter(<AIModelSelectorList onChange={onChange} />)`
          * `within(screen.getByTestId('model-list-item-model-premium')).getByTestId('tier-lock-model-premium')` in document
          * `within(screen.getByTestId('model-list-item-model-premium')).getByRole('checkbox')` has attribute `disabled` or `aria-disabled` true
          * `user.click(screen.getByTestId('model-list-item-model-premium'))`; `expect(onChange).not.toHaveBeenCalled()`
          * `within(screen.getByTestId('model-list-item-model-free')).getByRole('checkbox')` not disabled; click checks model — `onChange` called with `['model-free']`
        * **Test: tier-locked row shows upgrade CTA at row interaction point**
          * Same setup; `user.hover(screen.getByTestId('model-list-item-model-premium'))` or `user.click` row
          * `screen.getByText(/This model requires a Premium plan/i)` (or matching `tierDisplayName(20, …)`)
          * `screen.getByTestId('upgrade-link-tier-model-premium')` has attribute `href` `/subscription`
        * **Test: at max_models_per_project unchecked rows cannot be checked**
          * `setupMocks({ availableProviders: [providerFree, providerFreeB] }, { userTier: tierFree })`
          * check `model-free` via click; `onChange` last call `['model-free']`
          * click `model-list-item-model-free-b`; `onChange` call count unchanged (still one call) or last call still `['model-free']`
        * **Test: at count cap hover on blocked unchecked row shows upgrade CTA at that row**
          * Same as above with one checked; `user.hover(screen.getByTestId('model-cap-row-model-free-b'))` or hover `model-list-item-model-free-b`
          * `screen.getByText(/You've reached the model limit for your plan \(1\/1\)/i)`
          * `screen.getByTestId('upgrade-link-cap-model-free-b')` has attribute `href` `/subscription`
        * **Test: at cap checked row can be unchecked**
          * one model checked; click same row; `onChange` last call `[]`
        * **Test: ultra tier has no count cap and can access premium model row**
          * `{ userTier: tierUltra }`, providers `[providerFree, providerPremium]`; check both ids via clicks; `onChange` last call includes both ids; `screen.queryByTestId('upgrade-link-cap-model-free')` null; `model-list-item-model-premium` has no `tier-lock-model-premium`
      * `[✅]`   Each `it` covers exactly one behavior; tests at end of `describe` per §8
      * `[✅]`   Do not re-test `loadAiConfig` effect beyond what existing mount behavior needs — focus tier gating only

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: `export const AIModelSelectorList: React.FC<AIModelSelectorListProps>` — replace misnamed `AIModelSelectorProps` with `AIModelSelectorListProps` in this file
      * `[✅]`   **Implementation sequence (`rules.md` §1 one file per turn):** (1) `AIModelSelectorList.test.tsx` — CREATE with mocks, fixtures, six RED `it` blocks → lint → halt; (2) `AIModelSelectorList.tsx` — tier gating implementation → lint → halt
      * `[✅]`   Prerequisite: `AIModelSelector` node complete; Ticket 1 auth tier hydration

    * `[✅]`   `AIModelSelectorList.tsx`
      * `[✅]`   **Rename interface:** `interface AIModelSelectorListProps { disabled?: boolean; onChange: (modelsChecked: string[]) => void; }` — remove duplicate/wrong `AIModelSelectorProps` name and inline `}: { onChange: ... }` on component signature; destructure `{ onChange, disabled: disabledProp }`
      * `[✅]`   **Imports:** add `useAuthStore` from `@paynless/store`; add `Lock` from `lucide-react`; add `Link` from `react-router-dom`; add `Tooltip`, `TooltipContent`, `TooltipTrigger` from `@/components/ui/tooltip`; add type `UserTier`, `AiProvider` from `@paynless/types`; add `cn` from `@/lib/utils`
      * `[✅]`   **Module-level (above component):** `const TIER_LEVEL_DISPLAY_NAMES: Record<number, string> = { 0: 'Free', 10: 'Basic', 20: 'Premium', 30: 'Ultra' };` and `function tierDisplayName(level: number, availableTiers: UserTier[]): string` — same semantics as `AIModelSelector` node
      * `[✅]`   **After `useAiStore` hook:** `const userTier = useAuthStore((s) => s.userTier);` `const availableTiers = useAuthStore((s) => s.availableTiers);`
      * `[✅]`   **Derive `effectiveUserTier: UserTier`:** if `userTier !== null` use `userTier`; else `{ level: 0, name: 'free', output_cap_tokens: 8192, max_models_per_project: 1 }`
      * `[✅]`   **Derive `modelLimit`:** `effectiveUserTier.max_models_per_project`
      * `[✅]`   **Derive `checkedCount`:** `modelsChecked.length`
      * `[✅]`   **Derive `atCap`:** `modelLimit !== null && checkedCount >= modelLimit`
      * `[✅]`   **Derive `nextTierName`:** same rule as `AIModelSelector.interaction.spec`
      * `[✅]`   **Add `toggleModelChecked(providerId: string)`:** lookup `provider` in `availableProviders`; compute `tierLocked`, `isChecked`, `blockedAdd`; if `disabledProp` return; if `tierLocked` return; if `atCap && !isChecked` return; else compute `newModelsChecked` toggle and `setModelsChecked` + `onChange(newModelsChecked)`
      * `[✅]`   **Replace inline `onClick` / `onKeyDown` on row button (lines 47–63):** call `toggleModelChecked(provider.id)`; keyboard handler only invokes toggle when key Space/Enter and not `blockedAdd`
      * `[✅]`   **In `availableProviders.sort(...).map` (lines 40–75):** for each `provider`:
        * `tierLocked`, `isChecked`, `atCap`, `blockedAdd` per interaction spec
        * `finalRowDisabled = disabledProp || tierLocked || (atCap && !isChecked)`
        * Build `rowButton` JSX: `type="button"`, `key={provider.id}`, `data-testid={`model-list-item-${provider.id}`}`, `className={cn(..., tierLocked && 'opacity-50 cursor-not-allowed', blockedAdd && !tierLocked && 'opacity-50 cursor-not-allowed')}`, `onClick={() => toggleModelChecked(provider.id)}`, `onKeyDown` as spec
        * Inner content: `Checkbox` `checked={isChecked}` `disabled={finalRowDisabled}`; when `tierLocked` add `span` `data-testid={`tier-lock-${provider.id}`}` with `Lock` + `Requires {tierDisplayName(...)}`; else existing `span` with `provider.name.toLowerCase()`
        * When `tierLocked`: wrap `rowButton` in `Tooltip` > `TooltipTrigger asChild` > `rowButton`; `TooltipContent` tier message + `upgrade-link-tier-{id}`
        * When `!tierLocked && atCap && !isChecked`: wrap in `Tooltip` with `data-testid={`model-cap-row-${provider.id}`}` on button; cap `TooltipContent` + `upgrade-link-cap-{id}`
        * Else: render `rowButton` without tooltip wrapper
      * `[✅]`   **Do not** add scroll-area footer, list header, or global upgrade banner
      * `[✅]`   Preserve outer `div` + `ScrollArea` structure and `loadAiConfig` `useEffect`

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI (`apps/web`)
      * `[✅]`   Deps inward: `@paynless/store`, `@paynless/types`, UI primitives, `react-router-dom`
      * `[✅]`   Provides outward: checkbox model list consumed by `apps/web/src/components/chat/index.tsx` and any future importers
      * `[✅]`   No cycles

    * `[✅]`   `requirements`
      * `[✅]`   `useAuthStore` `userTier` and `availableTiers` read in `AIModelSelectorList.tsx` — ripgrep confirms
      * `[✅]`   Tier-locked row: checkbox disabled; `tier-lock-{id}` present; `onChange` not called on row click — test 1
      * `[✅]`   Tier upgrade CTA at row (`upgrade-link-tier-{id}`) `/subscription` — test 2
      * `[✅]`   At `max_models_per_project: 1`, second unchecked row cannot be checked — test 3
      * `[✅]`   At cap, CTA on blocked row (`upgrade-link-cap-{id}`), not elsewhere — test 4
      * `[✅]`   At cap, uncheck allowed — test 5
      * `[✅]`   Ultra: both models checkable, no cap link, premium row not tier-locked — test 6
      * `[✅]`   `AIModelSelectorListProps` used (misnamed `AIModelSelectorProps` removed)
      * `[✅]`   ripgrep `model-limit-footer` on `AIModelSelectorList.tsx` returns zero matches
      * `[✅]`   ripgrep `Upgrade` on `AIModelSelectorList.tsx` only inside `TooltipContent` on row wrappers — no detached footer CTA

    * `[ ]`   **Commit** `feat(dialectic) tier-gate model selection, catalog min_plan_tier_level, and subscription active semantics`
      * `[ ]`   Structural changes: `AIModelCatalogEntry.min_plan_tier_level` in `@paynless/types`; `AIModelSelectorList.test.tsx` (new); `AIModelSelectorListProps` rename in `AIModelSelectorList.tsx`
      * `[ ]`   Behavioral changes: `hasActiveSubscription` active-only (`subscriptionStore`, web mock, selectors, `CurrentSubscriptionCard`); tier/count gating on `AIModelSelector` and `AIModelSelectorList` via `useAuthStore().userTier`; optimistic `selectedModels` revert on `MODEL_TIER_DISALLOWED` / `MODEL_LIMIT_EXCEEDED` in `dialecticStore`
      * `[ ]`   Contract changes: `SubscriptionStatus` JSDoc (Stripe wire vs application-active); `listModelCatalog` / `modelCatalog` rows include `min_plan_tier_level`; no change to `SubscriptionStatus` union members

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

  **`packages/store/src/dialecticStore.ts`**: Add a new state property `userChosenOutputCap: number` to the dialectic store (not the auth store — auth store holds what the user *can* do, dialectic store holds what the user *chooses* to do). Add a setter `setUserChosenOutputCap: (value: number) => void`. The value persists across page navigations within a session — the user sets the slider once and it holds until they change it or log out. On logout or auth state clear, reset to `null` (which means "use tier default"). On login, initialize to `null`.

  The store should persist this value via Zustand `persist` middleware (already used by `subscriptionStore` for `availablePlans`). This way the user's choice survives page refreshes within the same browser session.

  **`packages/types/src/dialectic.types.ts`**: Add `userChosenOutputCap: number | null` to `DialecticState` and `setUserChosenOutputCap: (value: number | null) => void` to `DialecticActions`.

  ### C. BE consumption — discovery required

  **Discovery: The BE may not currently accept a user-specified output cap.** The BE's `prepareModelJob.ts` fetches `tier_definitions.output_cap_tokens` from the DB and passes it as `UserConfig.tier_output_cap_tokens` to `calculateAffordability` and `enqueueModelCall`. This is the platform-imposed tier cap. There is currently no mechanism for the FE to send a user-chosen value that the BE applies as `min(user_chosen, tier_cap)`.

  Neither `StartSessionPayload` nor `GenerateContributionsPayload` has an output cap field. The BE would need to:
  - Accept a `user_output_cap: number` field on `GenerateContributionsPayload` (or on the session/project level).
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

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 

## Fix continuation naming to use continuation naming instead of iterations 

## 