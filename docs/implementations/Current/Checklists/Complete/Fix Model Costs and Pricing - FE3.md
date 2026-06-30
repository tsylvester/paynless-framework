[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

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

  * `[✅]`   supabase/functions/dialectic-worker/prepareModelJob/prepareModelJob **Apply user-chosen output cap via min(userChosen, tierCap)**

    * `[✅]`   `objective`
      * `[✅]`   The BE currently ignores the user's chosen output cap (`maxOutputTokens`) sent by the FE in `GenerateContributionsPayload`. The worker's `prepareModelJob` reads only the platform-imposed tier cap from `tier_definitions.output_cap_tokens` and passes it as `UserConfig.tier_output_cap_tokens` to `calculateAffordability`. The user's slider choice has no effect on actual generation.
      * `[✅]`   Functional goal: When `maxOutputTokens` is present on the job payload and is less than the tier cap, use `maxOutputTokens` as the effective output cap. When absent or greater than the tier cap, use the tier cap (current behavior). When tier cap is null (ultra), use `maxOutputTokens` as-is if present.
      * `[✅]`   Non-functional: Zero behavioral change when `maxOutputTokens` is absent from the payload (backward compatibility).

    * `[✅]`   `role`
      * `[✅]`   Infrastructure / BE worker — `prepareModelJob` is the boundary where user configuration meets platform constraints before a model call is dispatched.
      * `[✅]`   This node applies the `min(userChosen, tierCap)` logic. It does NOT modify `calculateAffordability`, `getMaxOutputTokens`, or `enqueueModelCall` — those already consume `UserConfig.tier_output_cap_tokens` correctly.
      * `[✅]`   Out of scope: FE store changes, FE component changes, API adapter changes, affordability algorithm changes.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-worker` — job preparation and dispatch.
      * `[✅]`   Inside this boundary: reading user-chosen cap from job payload, combining it with tier cap, constructing `UserConfig`.
      * `[✅]`   Outside this boundary: how the FE collects the value, how the API transports it, how `calculateAffordability` consumes the cap.

    * `[✅]`   `deps`
      * `[✅]`   `GenerateContributionsPayload` — provider: `dialectic-service/dialectic.interface.ts`, layer: service interface, direction: inward (worker reads the type defined by the service layer), purpose: declares `maxOutputTokens?: number` field on the payload contract.
      * `[✅]`   `UserConfig` — provider: `calculateAffordability/calculateAffordability.interface.ts`, layer: worker internal, direction: inward, purpose: carries `tier_output_cap_tokens` to affordability calculation.
      * `[✅]`   `isRecord` — provider: `_shared/utils/type-guards/type_guards.common.ts`, layer: shared utility, direction: inward, purpose: type-guard for JSONB payload fields.
      * `[✅]`   Five payload guards in `_shared/utils/type-guards/type_guards.dialectic.ts` — `isDialecticJobPayload`, `isDialecticPlanJobPayload`, `isDialecticExecuteJobPayload`, `isDialecticSkeletonJobPayload`, `isDialecticRenderJobPayload` — all validate payload shapes that inherit from `GenerateContributionsPayload` and must accept the new `maxOutputTokens` field.
      * `[✅]`   No reverse dependencies. No lateral layer violations.

    * `[✅]`   `context_slice`
      * `[✅]`   From `GenerateContributionsPayload`: only `maxOutputTokens?: number` (new field).
      * `[✅]`   From `job.payload` (JSONB): read `maxOutputTokens` via `isRecord` + `typeof` guard — no new type guard function needed, pattern already established in the function for reading `tier_definitions.output_cap_tokens`.
      * `[✅]`   No over-fetching. No hidden coupling.

    * `[✅]`   dialectic-service/`dialectic.interface.ts`
      * `[✅]`   Add `maxOutputTokens?: number` to `GenerateContributionsPayload` (after `idempotencyKey: string`, line 1235)
      * `[✅]`   This field cascades through `DialecticBaseJobPayload` (extends `Omit<GenerateContributionsPayload, "chatId">`) → `DialecticPlanJobPayload` → `DialecticSimpleJobPayload` → `DialecticExecuteJobPayload` → `DialecticSkeletonJobPayload` → `DialecticRenderJobPayload`. No edits needed to those types — they inherit the field.

    * `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.test.ts`
      * `[✅]`   `isDialecticJobPayload` suite (line 859): add test with valid `maxOutputTokens` present on payload — assert true.
      * `[✅]`   `isDialecticPlanJobPayload` suite (line 1273): add test with valid `maxOutputTokens: 8192` present — assert true. Add test with `maxOutputTokens: "not a number"` — assert false.
      * `[✅]`   `isDialecticExecuteJobPayload` suite: add test with valid `maxOutputTokens` present — assert true (no throw). Add test with `maxOutputTokens: "string"` — assert throws.
      * `[✅]`   `isDialecticSkeletonJobPayload` suite: add test with valid `maxOutputTokens` present — assert true.
      * `[✅]`   `isDialecticRenderJobPayload` suite: add test with valid `maxOutputTokens` present — assert true (no throw). Add test with `maxOutputTokens: "string"` — assert throws.

    * `[✅]`   _shared/utils/type-guards/`type_guards.dialectic.ts`
      * `[✅]`   `isDialecticJobPayload` (line 1050): add `'maxOutputTokens'` to the `allowedKeys` array (line 1081-1085).
      * `[✅]`   `isDialecticPlanJobPayload` (line 1214): add optional field validation after line 1236: `if ('maxOutputTokens' in payload && typeof payload.maxOutputTokens !== 'number') return false;`
      * `[✅]`   `isDialecticExecuteJobPayload` (line 977): add optional field validation: `if (('maxOutputTokens' in payload) && typeof payload.maxOutputTokens !== 'number') throw new Error('Invalid maxOutputTokens.');` Add `'maxOutputTokens'` to the `allowedKeys` Set (line 1014-1022).
      * `[✅]`   `isDialecticSkeletonJobPayload` (line 1241): add optional field validation: `if ('maxOutputTokens' in payload && typeof payload.maxOutputTokens !== 'number') return false;`
      * `[✅]`   `isDialecticRenderJobPayload` (line 1261): add optional field validation: `if (('maxOutputTokens' in payload) && typeof payload.maxOutputTokens !== 'number') throw new Error('Invalid maxOutputTokens.');` Add `'maxOutputTokens'` to the `allowedKeys` Set (line 1290-1296).

    * `[✅]`   prepareModelJob/`prepareModelJob.test.ts`
      * `[✅]`   Add test: when `job.payload` contains `maxOutputTokens` less than `tierOutputCapTokens`, `UserConfig.tier_output_cap_tokens` equals `maxOutputTokens`
      * `[✅]`   Add test: when `job.payload` contains `maxOutputTokens` greater than `tierOutputCapTokens`, `UserConfig.tier_output_cap_tokens` equals `tierOutputCapTokens` (tier wins)
      * `[✅]`   Add test: when `job.payload` does not contain `maxOutputTokens`, `UserConfig.tier_output_cap_tokens` equals `tierOutputCapTokens` (backward compatibility)
      * `[✅]`   Add test: when `tierOutputCapTokens` is `null` (ultra) and `job.payload` contains `maxOutputTokens`, `UserConfig.tier_output_cap_tokens` equals `maxOutputTokens`
      * `[✅]`   Add test: when `tierOutputCapTokens` is `null` (ultra) and `job.payload` does not contain `maxOutputTokens`, `UserConfig.tier_output_cap_tokens` remains `null`

    * `[✅]`   prepareModelJob/`prepareModelJob.ts`
      * `[✅]`   After extracting `tierOutputCapTokens` from DB (line 42-71) and before constructing `userConfig` (line 73):
        * Read `maxOutputTokens` from `job.payload` using `isRecord(job.payload) && 'maxOutputTokens' in job.payload && typeof job.payload.maxOutputTokens === 'number'` guard pattern
        * If extracted value is a valid number, compute effective cap:
          * If `tierOutputCapTokens === null`: effective = extracted value
          * If `tierOutputCapTokens !== null`: effective = `Math.min(extracted, tierOutputCapTokens)`
        * If value is not present or not a number: effective = `tierOutputCapTokens` (current behavior)
      * `[✅]`   Replace `const userConfig: UserConfig = { tier_output_cap_tokens: tierOutputCapTokens }` with `const userConfig: UserConfig = { tier_output_cap_tokens: effectiveCap }`
      * `[✅]`   Add logging: `deps.logger.info('[prepareModelJob] Effective output cap', { tierCap: tierOutputCapTokens, userChosen: ..., effective: effectiveCap })`

    * `[✅]`   prepareModelJob/`prepareModelJob.integration.test.ts`
      * `[✅]`   Add integration test: job with `maxOutputTokens` on payload flows through `prepareModelJob` → `calculateAffordability` → the affordability calculation respects the lower effective cap.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: infrastructure (worker)
      * `[✅]`   Deps: inward (reads service-layer types, shared utilities)
      * `[✅]`   Provides: outward (passes `UserConfig` to `calculateAffordability`)
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   When `maxOutputTokens < tierCap`: effective cap = `maxOutputTokens`. Observable: test asserts `UserConfig.tier_output_cap_tokens === maxOutputTokens`.
      * `[✅]`   When `maxOutputTokens > tierCap`: effective cap = `tierCap`. Observable: test asserts `UserConfig.tier_output_cap_tokens === tierCap`.
      * `[✅]`   When `maxOutputTokens` absent: effective cap = `tierCap`. Observable: test asserts identical behavior to current implementation.
      * `[✅]`   When `tierCap` is null (ultra) + `maxOutputTokens` present: effective cap = `maxOutputTokens`. Observable: test asserts `UserConfig.tier_output_cap_tokens === maxOutputTokens`.
      * `[✅]`   When `tierCap` is null (ultra) + `maxOutputTokens` absent: effective cap = `null`. Observable: test asserts `UserConfig.tier_output_cap_tokens === null`.
      * `[✅]`   All five payload guards accept `maxOutputTokens` as valid optional number. Observable: guard tests assert true for valid, false/throw for non-number.
      * `[✅]`   Execute and render guard `allowedKeys` sets include `maxOutputTokens`. Observable: guard tests with `maxOutputTokens` present do not throw "unknown properties" error.

  * `[✅]`   apps/web/src/hooks/useStartContributionGeneration **Fix payload construction to include maxOutputTokens directly**

    * `[✅]`   `objective`
      * `[✅]`   The hook constructs `GenerateContributionsPayload` at lines 263-272 then conditionally spreads `maxOutputTokens` via `...(maxOutputTokens && { maxOutputTokens })`. This rebuilds the object unnecessarily and is subtly buggy — the `&&` operator is falsy for `0`, which would silently drop a valid value. The field should be included in the initial object construction.
      * `[✅]`   Functional goal: Construct the `GenerateContributionsPayload` once, correctly, with `maxOutputTokens` included directly. Use `?? undefined` to convert the store's `null` to `undefined` for the optional field.
      * `[✅]`   Non-functional: No behavioral change for non-zero values. Fix for the `0` edge case.

    * `[✅]`   `role`
      * `[✅]`   Application / FE hook — `useStartContributionGeneration` is the boundary where the dialectic store's state is read and assembled into the API payload for contribution generation.
      * `[✅]`   This node fixes payload construction only. It does NOT modify the store, the types, the API adapter, or the component.
      * `[✅]`   Out of scope: store state shape, type definitions, API transport, BE consumption, slider component.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/hooks` — React hooks that bridge store state to UI actions.
      * `[✅]`   Inside this boundary: reading `state.maxOutputTokens` from dialectic store, constructing `GenerateContributionsPayload`.
      * `[✅]`   Outside this boundary: how the store value is set (slider), how the API sends it, how the BE reads it.

    * `[✅]`   `deps`
      * `[✅]`   `GenerateContributionsPayload` — provider: `@paynless/types`, layer: types, direction: inward, purpose: payload shape contract. Already has `maxOutputTokens?: number`.
      * `[✅]`   `useDialecticStore` — provider: `@paynless/store`, layer: store, direction: inward, purpose: reads `state.maxOutputTokens`.
      * `[✅]`   No reverse dependencies. No lateral layer violations.

    * `[✅]`   `context_slice`
      * `[✅]`   From dialectic store: `state.maxOutputTokens: number | null` — the user's chosen output cap.
      * `[✅]`   No over-fetching. No hidden coupling.

    * `[✅]`   hooks/`useStartContributionGeneration.test.ts`
      * `[✅]`   Add test: when `state.maxOutputTokens` is a non-null number, the `GenerateContributionsPayload` passed to `generateContributions` includes `maxOutputTokens` equal to that number.
      * `[✅]`   Add test: when `state.maxOutputTokens` is `null`, the `GenerateContributionsPayload` passed to `generateContributions` has `maxOutputTokens` as `undefined` (field absent or undefined).

    * `[✅]`   hooks/`useStartContributionGeneration.ts`
      * `[✅]`   Remove line 261: `const maxOutputTokens = state.maxOutputTokens;`
      * `[✅]`   Remove line 271: `...(maxOutputTokens && { maxOutputTokens }),`
      * `[✅]`   Add `maxOutputTokens: state.maxOutputTokens ?? undefined,` as a direct field in the `GenerateContributionsPayload` object literal (alongside `sessionId`, `projectId`, etc.)
      * `[✅]`   Net result: one clean object construction, no spreads, no intermediate variable, `null` converts to `undefined` for the optional field.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: application (FE hook)
      * `[✅]`   Deps: inward (reads store state, uses types)
      * `[✅]`   Provides: outward (passes payload to store action `generateContributions`)
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   When `state.maxOutputTokens` is a number: payload includes `maxOutputTokens` equal to that number. Observable: test spy on `generateContributions` asserts payload field.
      * `[✅]`   When `state.maxOutputTokens` is `null`: payload has `maxOutputTokens` as `undefined`. Observable: test spy asserts field is `undefined`.
      * `[✅]`   When `state.maxOutputTokens` is `0`: payload includes `maxOutputTokens: 0` (not dropped). Observable: test spy asserts `payload.maxOutputTokens === 0`. This is the bug fix — the old spread pattern dropped `0`.

  * `[✅]`   apps/web/src/components/dialectic/OutputCapSlider **Fix component to use application types and auth store data, add tests**

    * `[✅]`   `objective`
      * `[✅]`   The slider component exists but is disconnected from the application's type system and store data. It defines a local `TierDefinition` interface that duplicates `UserTier` from `@paynless/types`. It hardcodes tier definitions in a `DEFAULT_TIERS` array instead of reading `availableTiers` from `useAuthStore()`. It does not read `userTier` from `useAuthStore()` — it defaults all users to free tier. The upgrade CTA has no link to the subscription page. The tier boundary tick marks on the slider are positioned proportionally to token values while the tier description buttons are evenly distributed via flexbox, so the marks do not align with their descriptions. The slider max is wrong. The component exposes a `testTierLevel` prop that is a test backdoor in production code. No test file exists.
      * `[✅]`   **Domain context — tier system (the implementer MUST know this):**
        * The database table `tier_definitions` contains exactly **5** tiers, inserted across two migrations:
          * `(0, 'free', 8192, 1)` — Free: 8k output cap, 1 model per project
          * `(10, 'basic', 32768, 2)` — Basic: 32k output cap, 2 models per project
          * `(20, 'premium', 131072, 3)` — Premium: 128k output cap, 3 models per project
          * `(30, 'ultra', NULL, NULL)` — Ultra: no output cap, no model limit
          * `(99, 'unreachable', NULL, NULL)` — Unreachable: system-only tier for gating models with null cost rates. **No user can ever reach tier 99. No subscription plan maps to it. It exists solely to make unconfigured models inaccessible.**
        * The `/me` endpoint returns **ALL 5 rows** from `tier_definitions` ordered by level ascending. The auth store stores all 5 as `availableTiers: UserTier[]`.
        * **The slider must filter `availableTiers` before rendering.** The `unreachable` tier must be excluded. Filter condition: `tier.name !== 'unreachable'`. Do NOT use a hardcoded level threshold like `level <= 30` — that breaks when new tiers are added above 30. All tiers except `unreachable` are user-facing and appear as markers.
      * `[✅]`   **Domain context — slider range and limits (the implementer MUST know this):**
        * The **slider track max** (the right edge of the slider range) is the highest `max_output_tokens` from the selected models' `AIModelCatalogEntry` records. This is determined by **model selection**, not by the user's tier. When models change, the slider max changes. With multiple selected models, use the **highest** `max_output_tokens` among them — each model naturally caps at its own max regardless of what the slider requests.
        * The **thumb max** (how far the user can drag) is determined by the user's tier: `userTier.output_cap_tokens`. For non-ultra users, the thumb stops at their tier's cap. For ultra users (`output_cap_tokens === null`), the thumb can go all the way to the slider track max because ultra imposes no cap below the model's capability.
        * **The slider uses a logarithmic scale.** Tier caps span orders of magnitude (8k, 32k, 128k, 2M+). A linear scale would cram free and basic into the first few percent of the track. A log scale naturally distributes granularity — fine-grained at low values (where 1024 increments matter), coarse at high values (where they don't). With 2M frontier models the log positions are approximately: free 27%, basic 46%, premium 64%, ultra 100% — readable and well-spaced.
        * **Tier markers** are reference points positioned along the slider track at their log-scale positions. Markers for tiers above the user's tier are visible but locked (greyed out, click triggers upgrade CTA). The ultra marker sits at the slider track max (the model's max) since ultra has no numeric cap of its own.
        * When no models are selected, `selectedModels` is empty — the slider cannot determine a track max. **Do not render the slider.** No models means no output cap to select. The component returns null (or a disabled/hidden state) when `selectedModels` is empty or has no matching catalog entries with non-null `max_output_tokens`.
        * **Human-readable guidance.** Token counts are meaningless to users. Each tier marker and the current slider value must show an approximate word/page equivalent to help users understand the scale of what they're requesting. Conversion: **words ≈ tokens × 0.75**, **pages ≈ words / 250** (standard double-spaced page). Tier markers show: Free "at most ~25 pages", Basic "at most ~100 pages", Premium "at most ~400 pages", Ultra "at most ~6,000 pages". The current value display updates dynamically (e.g., "64,000 tokens · at most ~192 pages"). This helps users understand they don't need a massive token budget — it reframes the choice from an abstract number to a document length.
      * `[✅]`   Functional goals:
        * Read `availableTiers: UserTier[]` and `userTier: UserTier | null` from `useAuthStore()` instead of hardcoded data
        * **Filter `availableTiers` to exclude `unreachable` before rendering tier markers** — filter: `tier.name !== 'unreachable'`
        * Use `UserTier` from `@paynless/types` instead of local `TierDefinition`
        * Read `modelCatalog: AIModelCatalogEntry[]` and `selectedModels: SelectedModels[]` from `useDialecticStore()` to compute slider track max
        * Slider track max = highest `max_output_tokens` from selected models' `AIModelCatalogEntry` catalog entries (cross-reference `selectedModels[].id` → `modelCatalog[].id`). This applies to **all** users, not just ultra.
        * Thumb max = `userTier.output_cap_tokens` for non-ultra users. For ultra users (`output_cap_tokens === null`), thumb max = slider track max.
        * Navigate to `/subscription` on upgrade CTA click instead of relying on a callback prop
        * Align tier tick marks and tier description buttons so each mark is centered below its description
        * Remove `testTierLevel` prop — tests mock the store instead
        * Remove `onUpgradeClick` callback prop — replaced by `useNavigate`
        * Retain `className` prop for mount-point styling
      * `[✅]`   Non-functional: No changes to mount points (already mounted in `SessionInfoCard.tsx` and `CreateDialecticProjectForm.tsx`). No changes to store state shape. No changes to types.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   UI component — `OutputCapSlider` is a presentational component that reads tier and model data from stores, renders a slider with tier markers, and writes the user's choice back to the dialectic store.
      * `[✅]`   This node fixes the component's data sources, visual alignment, and upgrade path. It does NOT modify the auth store, dialectic store, type definitions, API adapter, hook, or BE.
      * `[✅]`   Out of scope: store state changes, type file edits, mount point changes, BE changes, hook changes.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/components/dialectic` — dialectic UI components.
      * `[✅]`   Inside this boundary: rendering slider, filtering tiers, reading tier data from auth store, reading model data from dialectic store, computing slider max from model catalog, writing chosen value to dialectic store, navigating to subscription page.
      * `[✅]`   Outside this boundary: how tiers are fetched and cached (auth store), how `maxOutputTokens` flows to the BE (hook + store action), how the BE consumes the value (worker).

    * `[✅]`   `deps`
      * `[✅]`   `UserTier` — provider: `@paynless/types` via `auth.types.ts`, layer: types, direction: inward, purpose: type for tier definitions and the user's current tier. Shape: `{ level: number; name: string; output_cap_tokens: number | null; max_models_per_project: number | null; }`.
      * `[✅]`   `AIModelCatalogEntry` — provider: `@paynless/types` via `dialectic.types.ts`, layer: types, direction: inward, purpose: type for model catalog entries. The field `max_output_tokens: number | null` provides each model's hard output cap. Used to compute slider track max.
      * `[✅]`   `SelectedModels` — provider: `@paynless/types` via `dialectic.types.ts`, layer: types, direction: inward, purpose: type for selected model references. Shape: `{ id: string; displayName: string; }`. The `id` cross-references `modelCatalog[].id` to find each selected model's `AIModelCatalogEntry`.
      * `[✅]`   `useAuthStore` — provider: `@paynless/store`, layer: store, direction: inward, purpose: reads `userTier` and `availableTiers`.
      * `[✅]`   `useDialecticStore` — provider: `@paynless/store`, layer: store, direction: inward, purpose: reads `maxOutputTokens`, `setMaxOutputTokens`, `modelCatalog`, `selectedModels`.
      * `[✅]`   `useNavigate` — provider: `react-router-dom`, layer: framework, direction: inward, purpose: navigate to `/subscription` on upgrade CTA.
      * `[✅]`   `Slider`, `Tooltip`, `Button` — provider: `@/components/ui`, layer: UI primitives, direction: inward, purpose: rendering.
      * `[✅]`   No reverse dependencies. No lateral layer violations.

    * `[✅]`   `context_slice`
      * `[✅]`   From auth store: `userTier: UserTier | null` (user's current tier — determines thumb max), `availableTiers: UserTier[]` (all 5 tier definitions from DB — **must be filtered to exclude level 99 before rendering**).
      * `[✅]`   From dialectic store: `maxOutputTokens: number | null` (current slider value), `setMaxOutputTokens: (n: number) => void` (setter), `modelCatalog: AIModelCatalogEntry[]` (all models — cross-reference with `selectedModels` to compute slider track max from `max_output_tokens`), `selectedModels: SelectedModels[] | null | undefined` (currently selected model IDs).
      * `[✅]`   No over-fetching. No hidden coupling.

    * `[✅]`   dialectic/`OutputCapSlider.test.tsx`
      * `[✅]`   Mock `useAuthStore` to provide controlled `userTier` and `availableTiers` values using production `UserTier` type.
      * `[✅]`   Mock `useDialecticStore` to provide controlled `maxOutputTokens`, `setMaxOutputTokens`, `modelCatalog`, `selectedModels` values using production types.
      * `[✅]`   Mock `useNavigate` from `react-router-dom`.
      * `[✅]`   **All test `availableTiers` arrays must include the `unreachable` tier `{ level: 99, name: 'unreachable', output_cap_tokens: null, max_models_per_project: null }` to prove the component filters it out.** Tests must assert that no marker renders for `unreachable`.
      * `[✅]`   Test: renders exactly 4 tier markers (free, basic, premium, ultra) from `availableTiers` — NOT 5. The `unreachable` tier (level 99) must not render. Assert no element contains text "unreachable".
      * `[✅]`   Test: slider track max equals the highest `max_output_tokens` from selected models' catalog entries — not any tier's `output_cap_tokens`. Provide `modelCatalog` with a model whose `max_output_tokens` is 200000, set `selectedModels` to reference that model, assert slider max is 200000.
      * `[✅]`   Test: slider thumb cannot exceed `userTier.output_cap_tokens` — set `userTier` to basic (cap 32768), assert thumb stops at 32768 even though slider track extends to model max.
      * `[✅]`   Test: clicking a within-tier marker calls `setMaxOutputTokens` with that tier's `output_cap_tokens`.
      * `[✅]`   Test: clicking an above-tier marker shows upgrade CTA with tier name, does NOT call `setMaxOutputTokens`.
      * `[✅]`   Test: upgrade CTA click calls `navigate('/subscription')`.
      * `[✅]`   Test: ultra user (`userTier.output_cap_tokens === null`) — thumb can reach slider track max (model's max_output_tokens). No upgrade CTA fires.
      * `[✅]`   Test: when `maxOutputTokens` is `null` in store, component renders with tier default display.
      * `[✅]`   Test: when `availableTiers` is empty, component handles gracefully (loading or no-render state).
      * `[✅]`   Test: when `selectedModels` is empty, slider does not render — component returns null. No fallback value.
      * `[✅]`   Test: tier markers display approximate page counts (e.g., free marker shows "at most ~25 pages"). Current value display updates dynamically with page equivalent as slider moves.

    * `[✅]`   dialectic/`OutputCapSlider.tsx`
      * `[✅]`   Remove local `TierDefinition` interface (lines 15-20).
      * `[✅]`   Remove `DEFAULT_TIERS` hardcoded array (lines 23-48).
      * `[✅]`   Remove `testTierLevel` and `onUpgradeClick` from the props interface. Retain only `className?: string`.
      * `[✅]`   Import `UserTier` from `@paynless/types`.
      * `[✅]`   Import `useNavigate` from `react-router-dom`.
      * `[✅]`   Read `userTier` and `availableTiers` from `useAuthStore()`.
      * `[✅]`   Read `modelCatalog` and `selectedModels` from `useDialecticStore()`.
      * `[✅]`   **Filter `availableTiers` to produce `displayTiers`: exclude any tier where `name === 'unreachable'`. All rendering, marker positioning, and iteration uses `displayTiers`, never raw `availableTiers`.**
      * `[✅]`   Remove the `useEffect` that sets `tierDefinitions` from `DEFAULT_TIERS` (lines 80-84) and the `useEffect` that determines user tier from `testTierLevel` or defaults to free (lines 87-105). Replace with direct reads from auth store.
      * `[✅]`   Replace `onUpgradeClick` callback usage with `navigate('/subscription')`.
      * `[✅]`   **Compute slider track max (`sliderRangeMax`):** cross-reference `selectedModels[].id` against `modelCatalog[].id` to collect `AIModelCatalogEntry.max_output_tokens` for each selected model. Take the highest value. If `selectedModels` is empty or no matching catalog entry has a non-null `max_output_tokens`, **do not render the slider** — return null. No fallback. No default. No models means no output cap to select. This value is the slider's `max` prop and the right edge of the track. It is NOT tier-dependent — it is model-dependent.
      * `[✅]`   **Compute thumb max (`thumbMax`):** if `userTier.output_cap_tokens` is a number, `thumbMax = userTier.output_cap_tokens`. If `userTier.output_cap_tokens` is `null` (ultra), `thumbMax = sliderRangeMax`. The thumb cannot be dragged past `thumbMax`. Dragging beyond snaps back to `thumbMax` and triggers the upgrade CTA briefly.
      * `[✅]`   **Logarithmic scale.** The slider operates on a log-transformed internal scale. The Radix Slider's `step` prop is uniform — the log mapping produces naturally variable grain (fine-grained at low values where 1024 increments matter, coarse at high values where they don't). Implementation:
        * Internal-to-real: `realValue = Math.exp(internalValue)`
        * Real-to-internal: `internalValue = Math.log(realValue)`
        * Slider `min` = `Math.log(1024)`, slider `max` = `Math.log(sliderRangeMax)`
        * `onValueChange` receives internal values — convert to real values via `Math.exp` before calling `setMaxOutputTokens`
        * Display the real token value to the user, not the internal log value
      * `[✅]`   **Position tier markers along the slider track** using the same log scale: `(Math.log(tier.output_cap_tokens) - Math.log(1024)) / (Math.log(sliderRangeMax) - Math.log(1024)) * 100` percent. Ultra marker (which has `output_cap_tokens === null`) is positioned at 100% (the right edge). With 2M frontier models this produces ~27%, ~18%, ~18%, ~36% spacing between markers — readable and well-distributed. Each marker and its corresponding tick mark must use the same positioning so the tick appears centered below its description.
      * `[✅]`   Fix tier marker layout: replace the two separate positioning systems (flexbox buttons + absolute-positioned tick marks) with a single consistent layout where each tier marker and its corresponding tick mark are co-located using absolute positioning based on the log percentage formula above.
      * `[✅]`   **Word/page guidance display.** Each tier marker label shows three lines: tier name, token count, and approximate page count. The current slider value display also shows the dynamic word/page equivalent. Conversion: `words = Math.round(tokens * 0.75)`, `pages = Math.round(words / 250)`. Format pages as "~N pages" (e.g., "at most ~25 pages"). For values under 1 page, show "at most ~N words" instead.
      * `[✅]`   Replace all local `TierDefinition` type references with `UserTier` throughout the file (function parameters, state variables, callbacks).
      * `[✅]`   Preserve all existing logging.

    * `[✅]`   dialectic/`OutputCapSlider.integration.test.tsx`
      * `[✅]`   Integration test using real stores, mocks only for external nodes (router `useNavigate`).
      * `[✅]`   **Seed `availableTiers` with all 5 tiers including `unreachable` (level 99) to prove the component filters it in the real integration path.**
      * `[✅]`   provider → function: seed real `useAuthStore` with `availableTiers` (all 5 tiers) and `userTier` data, seed real `useDialecticStore` with `modelCatalog` and `selectedModels`. Mount `OutputCapSlider`. Verify component renders exactly 4 tier markers (not 5). Verify no element contains "unreachable".
      * `[✅]`   function → consumer: interact with slider (set value). Verify `useDialecticStore.getState().maxOutputTokens` reflects the chosen value in real store state — not via a mock spy, but by reading the actual store.
      * `[✅]`   full chain: set `userTier` to basic (cap 32768) in real auth store. Provide `modelCatalog` with a model whose `max_output_tokens` is 200000 and set `selectedModels` to reference it. Verify slider track max is 200000. Drag slider to 16384. Assert real dialectic store `maxOutputTokens === 16384`. Click a locked premium marker. Assert upgrade CTA visible. Click CTA. Assert `navigate('/subscription')` called (router is the only mock).

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI component (presentation)
      * `[✅]`   Deps: inward (reads from stores, uses types, uses UI primitives)
      * `[✅]`   Provides: outward (writes `maxOutputTokens` to dialectic store via `setMaxOutputTokens`)
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   Tier markers render from filtered `availableTiers` (excluding `unreachable`) — not hardcoded. Observable: test provides all 5 tiers and asserts exactly 4 markers render, no "unreachable" text present.
      * `[✅]`   Slider track max equals highest `max_output_tokens` from selected models. Observable: test provides model catalog with known `max_output_tokens`, asserts slider max matches.
      * `[✅]`   User's tier limits thumb, not slider range. Observable: test sets `userTier` to basic (cap 32768) with model max 200000, asserts slider track extends to 200000 but thumb stops at 32768.
      * `[✅]`   Above-tier marker click shows upgrade CTA with link to `/subscription`. Observable: test clicks locked marker, asserts CTA visible, clicks CTA, asserts `navigate('/subscription')`.
      * `[✅]`   Ultra user thumb reaches slider max. Observable: test provides ultra tier + model catalog with `max_output_tokens` 200000, asserts thumb can reach 200000.
      * `[✅]`   Tick marks aligned below their tier description. Observable: visual test or snapshot confirming co-located layout using same absolute positioning.
      * `[✅]`   No local `TierDefinition` type. Observable: grep confirms `TierDefinition` does not appear in file.
      * `[✅]`   No hardcoded `DEFAULT_TIERS`. Observable: grep confirms `DEFAULT_TIERS` does not appear in file.
      * `[✅]`   No `testTierLevel` prop. Observable: grep confirms `testTierLevel` does not appear in file.
      * `[✅]`   Empty `selectedModels` = no render. Observable: test provides empty `selectedModels`, asserts component returns null — no slider rendered, no fallback value.

    * `[✅]`   **Commit** `feat(output-cap-slider) deliver end-to-end user-selectable output token cap`
      * `[✅]`   Structural: BE `GenerateContributionsPayload` gains `maxOutputTokens` field; `prepareModelJob` reads it from job payload
      * `[✅]`   Behavioral: user's slider choice now flows FE → store → hook → API → BE worker → affordability calculation; `min(userChosen, tierCap)` enforced server-side
      * `[✅]`   Contract: FE component reads `UserTier` from auth store and `modelCatalog` from dialectic store instead of hardcoded data; filters out `unreachable` tier; slider max is model-determined; upgrade CTA links to `/subscription`

* **Dynamic cost ceiling estimation — per-stage and full-project token cost based on user configuration**

  This ticket delivers a dynamic cost ceiling that answers "at most, how many tokens will this stage / this project consume?" and drives two UX surfaces: (A) a **preventive NSF gate** on the session page (disable Generate/Continue and show a top-up CTA when the stage ceiling exceeds the wallet balance), and (B) a **pre-project cost preview** on the Create Project form (estimated project + first-stage cost before the project is created, gating Autostart).

  **Architecture decisions (resolved — do not relitigate):**
  - **Job counting stays on the BE; the estimate arithmetic is computed on the FE in `computeCostCeiling`.** The BE returns **total** expected job count per stage (`expectedCount` / `totalExpected` at the current model count). The utility computes `expectedCount × maxOutputTokens × meanRate` where `meanRate = (Σ output_token_cost_rate(m)) / |selectedModels|`. Model multiplicity is already in `expectedCount` — the FE does not multiply by `|selectedModels|` again. Strategy/DAG math stays on the BE; the slider stays instant (no BE round-trip per slider tick, because only counts come from the BE and those change only with model count / template). Nothing about the estimate is persisted to the DB.
  - **Use the existing `maxOutputTokens` symbol** (dialectic store; output-cap slider ticket).
  - **Model cost rates come from the dialectic store's `modelCatalog: AiProvidersRow[]`** (the dialectic-specific source `OutputCapSlider` already reads), NOT `aiStore.availableProviders`.
  - **Project ceiling = actual(completed stages) + estimate(remaining stages).** It starts estimate-weighted and resolves toward actual as stages complete (actual ≤ estimate, so the user perceives a saving).

  ### Core math

  `stageCeilings[stageSlug]` (incomplete) = `expectedCount(stage) × maxOutputTokens × (Σ_{m ∈ selectedModels} output_token_cost_rate(m) / |selectedModels|)`

  Equivalently: `stageCeilings[stageSlug] = Σ_{m ∈ selectedModels} (expectedCount(stage) / |selectedModels|) × maxOutputTokens × output_token_cost_rate(m)`

  `stageCeilings[stageSlug]` (complete) = `Σ contributions (tokens_used_input × input_token_cost_rate + tokens_used_output × output_token_cost_rate)` — each contribution uses its model's rates from `modelCatalog`

  `projectCeiling = Σ stages`: contribution sum when the stage has contributions; else mean-rate estimate for that stage

  where:
  - `expectedCount(stage)` — **total** expected jobs for that stage from the BE (hydrated into `stageExpectedCountsByRun` in-session or `preProjectStageExpectedCounts` on Create). Computed on the BE (Group 2).
  - `maxOutputTokens` — dialectic store (output-cap slider). **When null, selectors return `null`.**
  - `output_token_cost_rate(m)` — from each selected model's `modelCatalog[].config` (`AiModelExtendedConfig`), assembled into payload `outputTokenCostRates[]`.
  - Completed stages: selectors copy contribution token fields + rates into payload `contributions[]`; utility sums. Incomplete stages: `contributions: []`.

  ### Discovery — BE/FE granularity strategy desync (fix first, Group 1)

  The BE is the authority for granularity strategies. `GranularityStrategy` (`dialectic-service/dialectic.interface.ts`) defines six: `per_source_document | pairwise_by_origin | per_source_group | all_to_one | per_source_document_by_lineage | per_model`.
  - **BE bug:** the worker actively executes `per_source_group` (real planner `planPerSourceGroup` with full tests, producing real child jobs), but `computeExpectedCounts` has no `per_source_group` case and throws in `default`. This is confirmed in `getAllStageProgress.test.ts` ("All strategies supported by computeExpectedCounts (excludes per_source_group)"). Any stage using `per_source_group` cannot be counted today. `computeExpectedCounts` must be corrected to support it.
  - **FE phantom values:** `RecipeGranularity` (`packages/types/src/dialectic.types.ts`) carries eight values, including `one_to_many` and `many_to_one`, which the BE does NOT define. These must be removed to sync the FE type to the BE contract.

  ### BE design — decompose, don't bolt a "no-progress" mode onto `getAllStageProgress`

  `getAllStageProgress` is ~921 lines (over the 600-line decomposition threshold) and reads `n` from `session.selected_model_ids` and `processTemplateId` from the `project` row, so it cannot serve the pre-project (no session/project) case without invasive bimodal branching. Critically, `computeExpectedCounts` is per-stage and does NOT derive the inter-stage `priorStageContext` (`lineageCount` from leaf-step cardinalities, `reviewerCount = n`) — that walk lives inside `getAllStageProgress` (the section threading context across topologically-ordered stages, lines ~790–839). So "just call `computeExpectedCounts`" is incomplete for multi-stage projects using `pairwise_by_origin` / `per_source_document_by_lineage`.

  Resolution: **extract the shared count core** — "template transitions → topological stage order → recipe steps/edges fetch → per-stage `computeExpectedCounts` with the inter-stage context walk" — into its own function (the DI hooks `topologicalSortSteps` and `computeExpectedCounts` already exist on `GetAllStageProgressDeps`). Then:
  - `getAllStageProgress` (post-project) delegates to the core and layers its job/resource/document/status logic on top (behavior unchanged).
  - A new **thin, session-less count handler** takes `{ templateId, modelCount }` and calls the same core, returning expected counts per stage — serving the pre-project preview without a session. Both paths share identical count logic, so the pre-project estimate and post-project progress can never drift.

  ### Data already available on the FE

  - **Post-project counts**: surfaced from the extended `getAllStageProgress` response (per-stage expected counts added to `StageProgressEntry` / `GetAllStageProgressResponse`). The session/iteration path is already fully hydrated via `fetchProjectDetails → fetchProcessTemplate` (the recipes loop runs because `currentProjectDetail` exists).
  - **Pre-project counts**: from the session-less count handler, called with `processTemplateId` from `DomainProcessAssociationRow.process_template_id` after `fetchProcessAssociation({ domainId: selectedDomain.id })` on domain selection (not from `listDomains` / `DialecticDomainRow`) + the selected model count.
  - **Actuals**: `DialecticContribution` rows (loaded with session detail) — per stage/iteration token usage (`tokens_used_input`, `tokens_used_output`, `model_id`).
  - **maxOutputTokens**: dialectic store.
  - **Model cost rates**: `modelCatalog[].config` (dialectic store), read via a shape-specific `AiModelExtendedConfig` guard (Group 3). Note: `fetchProcessTemplate` takes `{ templateId }` and `getStageRecipe` takes `{ stageSlug }` — neither requires a session (the function that requires `sessionId`/`iterationNumber` is `getAllStageProgress`).
  - **Wallet balance**: `useWalletStore` → `selectActiveChatWalletInfo` (`balance`).

  ### FE estimate utility (pure, SRP)

  A pure FE utility (`packages/utils/src/computeCostCeiling`, exported from `@paynless/utils`) owns **all cost-ceiling arithmetic** — mean-rate estimates, contribution actuals, `stageCeilings`, and `projectCeiling` — NOT strategy/DAG math and NOT job counting. Given `ComputeCostCeilingPayload`, it returns `ComputeCostCeilingReturn`: success `{ stageCeilings: Record<string, number>; projectCeiling: number }` or `{ error: ApiError }`. **`selectCostCeiling` / `selectPreProjectCostCeiling` assemble the payload from store state, call `computeCostCeiling`, and return the result unchanged (success or error).** Return `null` only when prerequisite state is incomplete. **`null` is not used to swallow function errors.** Group 5 handles `'error' in result` (fail closed). Tested in isolation in the utils package (Vitest).

  Reading model config rates requires a **shape-specific guard for `AiModelExtendedConfig`** (replacing the generic `isJson` / `isPlainObject` checks). Introduce that guard and migrate the existing in-scope consumer (`OutputCapSlider.tsx`) to it.

  ### NSF UI — preventive gate (session page)

  The Generate/Continue disable + threshold logic currently lives in the `useStartContributionGeneration` hook (it computes `balanceMeetsThreshold` from `viewingStage.minimum_balance`) and renders a `/subscription` callout in `GenerateContributionButton`. Replace the hardcoded `minimum_balance` gate with `stageCeilings[viewingStage.slug]` from `selectCostCeiling` (success branch only):
  - `stageCeilings[viewingStage.slug] > wallet_balance`: disable the button; show "Insufficient tokens. Top up {shortfall} to continue." linking to `/subscription` (top-up tab), where `shortfall = stageCeilings[viewingStage.slug] - wallet_balance`.
  - `stageCeilings[viewingStage.slug] <= wallet_balance`: enable; show "Estimated cost for this stage: ~{stageCeilings[viewingStage.slug]} tokens."
  - `projectCeiling > wallet_balance`: secondary, non-blocking notice with `projectCeiling - wallet_balance` shortfall and top-up CTA.
  - Both stage and project notices may show simultaneously. Recompute dynamically on slider and model-selection changes.
  - This is preventive UX; the BE `paused_nsf` status (runs out mid-execution) still coexists as the after-the-fact handler.
  - Pages remain hosts; logic lives in the hook + components for portability.

  ### Pre-project cost preview (Create Project form)

  Most users pick "Autostart", so the estimate cannot be deferred to the session page. On `CreateDialecticProjectForm` (which already gates Autostart on `firstStageMinBalance` vs `walletInfo.balance` and mounts `AIModelSelector` + `OutputCapSlider`):
  - Compute `projectCeiling` and `stageCeilings[firstStage]` from **`selectPreProjectCostCeiling`** (fed by `fetchProcessAssociation` → `fetchStageExpectedCounts` → `preProjectStageExpectedCounts`).
  - Display: "Estimated token cost: ~{projectCeiling} for the full project, ~{stageCeilings[firstStage]} for the first stage."
  - `projectCeiling > wallet_balance`: warning + top-up CTA, do NOT block Create.
  - first-stage `stageCeilings[firstStage] > wallet_balance`: extend the existing gate to disable Autostart (fall back to Autoconfig) with a top-up CTA, but allow Create. With Autostart off, the session-page Generate button stays NSF-locked until top-up.

  ### Work groups in dependency order (formal nodes to be authored in a fresh thread)

  **Group 1 — BE strategy correctness:**
  - `supabase/functions/dialectic-service/computeExpectedCounts.ts` (+ `.test.ts`) — add `per_source_group` support (define its expected-count rule with BE confirmation; mirror the per-stage strategy switch).
  - `packages/types/src/dialectic.types.ts` — `RecipeGranularity`: remove `one_to_many` / `many_to_one` (this type change rides in its first consumer node per the rules, never orphaned).

  **Group 2 — BE counts (decomposed):**
  - Extract the count core (transitions → topo order → recipe fetch → per-stage `computeExpectedCounts` + inter-stage context walk) into its own function (+ interface / guards / tests).
  - Refactor `getAllStageProgress` to delegate to the core; add per-stage expected counts to `StageProgressEntry` / `GetAllStageProgressResponse` (+ guards / tests).
  - New session-less count handler `{ templateId, modelCount }` → per-stage counts (+ interface / guards / tests), wired into `dialectic-service/index.ts` and the API client.

  **Group 3 — FE estimate utility:**
  - `packages/utils/src/computeCostCeiling` (+ test) — mean-rate math, contribution sums, `{ stageCeilings, projectCeiling }`; `ComputeCostCeilingReturn`; exported via `@paynless/utils`.
  - `AiModelExtendedConfig` shape guard (+ test); migrate `OutputCapSlider.tsx` to it.

  **Group 4 — types + store wiring:**
  - `selectCostCeiling` / `selectPreProjectCostCeiling` in `dialecticStore.selectors.ts` — assemble payload (`outputTokenCostRates[]`, per-stage `contributions[]`); call `computeCostCeiling`; return **`ComputeCostCeilingReturn | null`** (+ `dialecticStore.selectors.costCeiling.test.ts`).

  **Group 5 — consumers:**
  - `useStartContributionGeneration` (+ its return type) — replace `minimum_balance` with `stageCeilings[viewingStage.slug]` / `projectCeiling` from `selectCostCeiling`; **`ComputeCostCeilingReturn | null`**; fail closed on `null` **and** `'error' in result`; expose `costCeilingError`.
  - `GenerateContributionButton.tsx` (+ nsf test) — ceiling-based NSF CTA.
  - `SessionInfoCard.tsx` — project ceiling (actual + estimate) + stage estimate display.
  - `CreateDialecticProjectForm.tsx` (+ autostart test) — pre-project preview + Autostart gate on first-stage ceiling.
  - Commit closes the chain.

  **Deferred / out of scope:** wallet-debit metadata enrichment (referencing jobs/stages for richer summation); any DB persistence of estimates.

  ### Dependencies on other tickets

  - **Depends on Ticket 1**: `userTier.output_cap_tokens` is the slider's effective default when `maxOutputTokens` is null (handled by the output-cap slider's clamping).
  - **Depends on the output-cap slider ticket (complete)**: supplies `maxOutputTokens` and the `modelCatalog` config-reading pattern.
  - **Wallet balance**: `selectActiveChatWalletInfo` already provides `balance`.

  ### Scope split — FE vs BE

  - **BE**: fix `computeExpectedCounts` (`per_source_group`); extract the count core; refactor `getAllStageProgress` to delegate and expose counts; add the session-less count handler; wire `dialectic-service/index.ts` + API client.
  - **FE**: remove phantom `RecipeGranularity` values; `AiModelExtendedConfig` guard + `OutputCapSlider` migration; pure `computeCostCeiling` in `@paynless/utils`; selector-derived ceiling wiring; NSF gate in `useStartContributionGeneration` + `GenerateContributionButton`; `SessionInfoCard` + `CreateDialecticProjectForm` displays.

  * `[✅]`   supabase/functions/dialectic-service/computeExpectedCounts **Add `per_source_group` expected-count support (one job per source group)**

    * `[✅]`   `objective`
      * `[✅]`   `computeExpectedCounts` switches on `step.granularity_strategy` but has no `case "per_source_group"`; the `default` branch throws `Unsupported granularity_strategy "per_source_group" for step "..."` (lines 118-122). The worker actively executes `per_source_group` via `planPerSourceGroup` (groups source docs by `document_relationships.source_group`, emits exactly one child job per distinct group). Consequently any stage whose recipe contains a `per_source_group` step cannot be counted — every count call for that stage throws.
      * `[✅]`   Functional goal: when `step.granularity_strategy === "per_source_group"`, set `expected[step.step_key]` and `cardinality[step.id]` to the number of distinct source groups feeding the step. That number equals the prior stage's lineage count, carried as `params.priorStageContext.lineageCount`. Grounding: `planPerSourceGroup` reduces `sourceDocs` by `document_relationships.source_group` and creates one job per group (its test: 2 groups → 2 jobs); `Dialectic Modeling Explanation.md` states `per_source_group` → "N = number of distinct source_groups" and defines `source_group` as the lineage root UUID.
      * `[✅]`   Functional goal: the count is NOT multiplied by `n` (model count). A `per_source_group` step consolidates all models' documents sharing a `source_group` into a single job, so the count is independent of `n` (planner test produces 2 jobs for 2 groups regardless of how many models contributed).
      * `[✅]`   Functional goal: `per_source_group` requires `priorStageContext` (it is a downstream consolidation strategy, like `pairwise_by_origin` and `per_source_document_by_lineage`). When `priorStageContext` is absent, throw a descriptive error mirroring the existing prior-context cases — never silently default.
      * `[✅]`   Non-functional: zero change to the computed counts of every existing strategy (`all_to_one`, `per_model`, `per_source_document`, `pairwise_by_origin`, `per_source_document_by_lineage`); the `default` branch must still throw for genuinely unknown values.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   Domain / pure function — `computeExpectedCounts` is the per-stage expected-job-count calculator over a single stage's recipe DAG.
      * `[✅]`   This node adds exactly one `switch` case. It does NOT modify `topologicalSortSteps`, the `hasPsdChildren` / `findPrimaryInputPredecessor` helpers, the inter-stage `priorStageContext` derivation (that walk lives in `getAllStageProgress`), or any other strategy case.
      * `[✅]`   Out of scope: `getAllStageProgress`, the count-core extraction, the session-less count handler, and all FE work.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` DAG progress computation.
      * `[✅]`   Inside this boundary: mapping a `per_source_group` step to its `expected` count and `cardinality` using `priorStageContext.lineageCount`.
      * `[✅]`   Outside this boundary: how `lineageCount` is derived (the topologically-ordered inter-stage walk in `getAllStageProgress`), and how `planPerSourceGroup` constructs the actual jobs.

    * `[✅]`   `deps`
      * `[✅]`   `ProgressRecipeStep`, `ProgressRecipeEdge`, `ComputeExpectedCountsDeps`, `ComputeExpectedCountsParams`, `ExpectedCountsResult`, `PriorStageContext`, `TopologicalSortStepsDeps` — provider: `dialectic-service/dialectic.interface.ts`; layer: service interface; direction: inward; purpose: the function signature and the `priorStageContext` carrier. No interface change is needed — `per_source_group` already exists in the `GranularityStrategy` union (`dialectic.interface.ts:140-154`) and `PriorStageContext.lineageCount` already exists (`dialectic.interface.ts:627-630`).
      * `[✅]`   `topologicalSortSteps` — provider: `dialectic-service/topologicalSortSteps.ts`, injected through `ComputeExpectedCountsDeps`; layer: domain; direction: inward; purpose: orders steps before the count loop (unchanged).
      * `[✅]`   No reverse dependencies. No lateral layer violations.

    * `[✅]`   `context_slice`
      * `[✅]`   From `params`: only `priorStageContext.lineageCount` (number of distinct prior-stage lineages = number of source groups).
      * `[✅]`   No over-fetching. No hidden coupling. No new parameter fields.

    * `[✅]`   dialectic-service/`computeExpectedCounts.test.ts`
      * `[✅]`   Append test: single `per_source_group` step, `priorStageContext = { lineageCount: 2, reviewerCount: 2 }`, `n: 2` → assert `result.expected.get(step_key) === 2` and `result.cardinality.get(id) === 2`.
      * `[✅]`   Append test (independence from `n`): single `per_source_group` step, `priorStageContext = { lineageCount: 3, reviewerCount: 1 }`, `n: 5` → assert `result.expected.get(step_key) === 3` and `result.cardinality.get(id) === 3` (proves no `× n`).
      * `[✅]`   Append test (missing context): single `per_source_group` step with `priorStageContext` omitted → assert it throws `Error` whose message matches `per_source_group step "..." requires priorStageContext`.
      * `[✅]`   Reuse the existing `step` / `edge` helpers and the existing `deps` (real `topologicalSortSteps`); use production types from `dialectic.interface.ts`; one behavior per test; appended at the end of the file.

    * `[✅]`   dialectic-service/`computeExpectedCounts.ts`
      * `[✅]`   In the `switch (strategy)` block, add `case "per_source_group":` immediately before `default:` (before line 118):
        * Read `const ctx = params.priorStageContext;`
        * If `!ctx`, `throw new Error(\`per_source_group step "${step.step_key}" requires priorStageContext\`);`
        * `const val = ctx.lineageCount;`
        * `expected.set(step.step_key, val);`
        * `cardinality.set(step.id, val);`
        * `break;`
      * `[✅]`   Leave the `default` branch intact so unknown strategies still throw `Unsupported granularity_strategy ...`. No other lines change.

    * `[✅]`   dialectic-service/`computeExpectedCounts.integration.test.ts`
      * `[✅]`   Add `"per_source_group"` to `STRATEGIES_NEEDING_PRIOR_CONTEXT` (lines 18-21) so the random-valid-DAG pipeline tests exercise it end-to-end through `topologicalSortSteps → computeExpectedCounts` with `includePriorContextStrategies: true`.
      * `[✅]`   Append a deterministic step: real-shaped steps including a `per_source_group` consolidation step fed through the real `topologicalSortSteps`, with `priorStageContext = { lineageCount: 2, reviewerCount: 2 }`; assert the `per_source_group` step's `expected` equals `lineageCount` (2) and the total matches the hand-computed sum of all steps.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: domain (pure function).
      * `[✅]`   Deps: inward (interface types, injected `topologicalSortSteps`).
      * `[✅]`   Provides: outward (`ExpectedCountsResult` consumed by `getAllStageProgress` and, later, the extracted count core).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `per_source_group` with `priorStageContext` → `expected` and `cardinality` both equal `lineageCount`. Observable: unit test asserts both maps.
      * `[✅]`   `per_source_group` count is independent of `n`. Observable: unit test with `n: 5`, `lineageCount: 3` asserts `3`.
      * `[✅]`   `per_source_group` without `priorStageContext` throws. Observable: unit test asserts the throw and message.
      * `[✅]`   No regression for other strategies and the `default` branch still throws for unknown values. Observable: pre-existing unit and integration tests remain green.
      * `[✅]`   The `topologicalSortSteps → computeExpectedCounts` pipeline covers `per_source_group`. Observable: integration test includes it in the prior-context strategy pool and a deterministic assertion.

  * `[✅]`   supabase/functions/dialectic-service/computeTemplateStageCounts/ **Extract the session-less multi-stage count core as its own package (transitions → topo order → recipe fetch → per-stage counts + inter-stage context walk)**

    * `[✅]`   `objective`
      * `[✅]`   `getAllStageProgress` (921 lines, over the 600-line decomposition threshold) embeds the entire count derivation: fetch stage transitions for the process template (lines 86-108), topologically order the template's stages (lines 141-187), fetch recipe instances/steps/edges (lines 260-537), and walk the ordered stages calling `computeExpectedCounts` per stage while threading the inter-stage `PriorStageContext` — `lineageCount` from leaf-step cardinalities and `reviewerCount = n` (lines 727-839). This walk reads `n` from `session.selected_model_ids` and `processTemplateId` from the project row, so it cannot serve the pre-project (no session/project) case, and `computeExpectedCounts` alone is per-stage and does NOT derive the inter-stage context.
      * `[✅]`   Functional goal: create a new pure-orchestration function `computeTemplateStageCounts` that takes `{ processTemplateId, modelCount }` and returns, per stage in topological order: the resolved recipe `steps` and `edges`, the per-step `expected` count map, the `totalExpected` (Σ expected), plus the template-wide `stepIdToStepKey` map and `totalStages`. It performs the transitions fetch, stage topological sort, recipe instance/step/edge fetch, and the per-stage `computeExpectedCounts` call with the inter-stage `PriorStageContext` walk — nothing about jobs, resources, contributions, documents, or status.
      * `[✅]`   Functional goal: this core is the single source of count logic shared by `getAllStageProgress` (post-project, which derives `processTemplateId`/`modelCount` from the project + session and layers status/document/job logic on top — node `getAllStageProgress`) and by the session-less count handler (pre-project — node `getStageExpectedCounts`). Both paths produce identical counts, so the pre-project estimate and post-project progress can never drift.
      * `[✅]`   Functional goal: preserve the existing error-as-value contract used by `getAllStageProgress` — return `{ status, error }` for DB failures and for a topological cycle/unresolved node, and wrap the `computeExpectedCounts` call in try/catch converting a throw into `{ status: 500, error }` (mirrors lines 805-821). Never throw to callers.
      * `[✅]`   Non-functional: this is a NEW source file, so it is authored as a full package folder `dialectic-service/computeTemplateStageCounts/` matching the established new-file convention (exemplar: `dialectic-worker/calculateAffordability/`) — `.interface.ts`, `.interface.test.ts`, `.guard.ts`, `.guard.test.ts`, `.mock.ts`, `.test.ts`, `.ts`, `.provides.ts`, `.integration.test.ts`. It does NOT cram its contract types into the monolithic `dialectic.interface.ts`.
      * `[✅]`   Non-functional: the per-stage `expected`/`totalExpected` values for the existing DAG (thesis/antithesis/synthesis/parenthesis/paralysis) must equal what `computeExpectedCounts` already produces today for the same template and `n`; this node moves the logic without changing the numbers.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   Domain orchestration (BE service) — `computeTemplateStageCounts` composes DB reads with the injected `topologicalSortSteps` and `computeExpectedCounts` to produce template-wide, topologically-ordered per-stage counts.
      * `[✅]`   This node CREATES the new package folder only. It does NOT edit `getAllStageProgress.ts` (that delegation/removal is the `getAllStageProgress` node) and does NOT edit `dialectic-service/index.ts` or the API client (those are separate nodes). It must NOT compute job status, documents, resources, or contributions.
      * `[✅]`   Out of scope: `StageProgressEntry`/`GetAllStageProgressResponse` count fields (node `getAllStageProgress`), the session-less HTTP handler and its payload/guards (node `getStageExpectedCounts`), all FE work.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` DAG progress computation, packaged under `dialectic-service/computeTemplateStageCounts/`.
      * `[✅]`   Inside this boundary: stage transitions fetch, stage topological sort, recipe instance/step/edge fetch (cloned-instance and template paths, mirroring `getAllStageProgress` lines 260-537), per-stage `computeExpectedCounts` invocation, the `PriorStageContext` walk (`lineageCount` from leaf-step cardinalities, `reviewerCount = modelCount`), and the package's own contract types + guards.
      * `[✅]`   Outside this boundary: jobs, project resources, contributions, document descriptors, step statuses, and the project/session row reads that derive `processTemplateId`/`modelCount` (those remain in `getAllStageProgress`).

    * `[✅]`   `deps`
      * `[✅]`   `SupabaseClient<Database>` — provider: `@supabase/supabase-js` via `../../types_db.ts`; layer: infrastructure; direction: inward (injected); purpose: read `dialectic_stage_transitions`, `dialectic_stages`, `dialectic_stage_recipe_instances`, `dialectic_stage_recipe_steps`, `dialectic_recipe_template_steps`, `dialectic_stage_recipe_edges`, `dialectic_recipe_template_edges`. Supabase client typing exception applies.
      * `[✅]`   `topologicalSortSteps` — provider: `../topologicalSortSteps.ts`, injected via deps; layer: domain; direction: inward; purpose: ordering steps inside `computeExpectedCounts` (passed through).
      * `[✅]`   `computeExpectedCounts` — provider: `../computeExpectedCounts.ts` (corrected by the prior node to support `per_source_group`), injected via deps; layer: domain; direction: inward; purpose: per-stage expected counts.
      * `[✅]`   `ProgressRecipeStep`, `ProgressRecipeEdge`, `PriorStageContext`, `ExpectedCountsResult`, `ComputeExpectedCountsDeps`, `ComputeExpectedCountsParams`, `TopologicalSortStepsDeps`, `TopologicalSortStepsParams`, `ServiceError`, `GranularityStrategy` — provider: `../dialectic.interface.ts` (original source; imported directly, never re-exported); layer: service interface; direction: inward; purpose: borrowed types for the recipe DAG, the context carrier, and the error-as-value branch. These are NOT redefined in this package; only the new types this function owns are added to its own `.interface.ts`.
      * `[✅]`   `isProgressRecipeStep`, `isProgressRecipeEdge`, `isPriorStageContext` — provider: `../../_shared/utils/type-guards/type_guards.dialectic.progress.ts` (confirmed present, lines 37-59); layer: shared utility; direction: inward; purpose: reused by this package's guards to validate `StageCountsEntry.steps`/`edges` and the threaded context.
      * `[✅]`   `isRecord` — provider: `../../_shared/utils/type-guards/type_guards.common.ts`; `isGranularityStrategy`, `isJobTypeEnum` — provider: `../../_shared/utils/type-guards/type_guards.dialectic.ts`; layer: shared utility; direction: inward; purpose: validate raw DB step rows (same guards `getAllStageProgress` uses at lines 366-395, 436-465).
      * `[✅]`   No reverse dependencies. No lateral layer violations. Depends on the prior node’s `computeExpectedCounts` `per_source_group` fix.

    * `[✅]`   `context_slice`
      * `[✅]`   From the dbClient: only the columns the recipe walk requires — transitions (`source_stage_id`, `target_stage_id`), stages (`id`, `slug`, `active_recipe_instance_id`), instances (`id`, `stage_id`, `template_id`, `is_cloned`), recipe steps (`id`, `instance_id`/`template_id`, `step_key`, `job_type`, `granularity_strategy`), recipe edges (`instance_id`/`template_id`, `from_step_id`, `to_step_id`). It does NOT select `minimum_balance`/`display_name`/etc. — those stay in `getAllStageProgress`’s own full-stage fetch.
      * `[✅]`   From `params`: `{}` (empty). No session/project/iteration inputs.
      * `[✅]`   From `payload`: `processTemplateId` and `modelCount` only.
      * `[✅]`   Injection shape: `ComputeTemplateStageCountsDeps` exposes only the injected `dbClient`, `topologicalSortSteps`, and `computeExpectedCounts` — no concrete service objects, no over-fetched surface, no hidden coupling.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.interface.test.ts`
      * `[✅]`   Contract (truth) test for the package's own types, asserted through the package guards. Construct a full valid `ComputeTemplateStageCountsResult` success object (`{ status: 200, data: { stages: StageCountsEntry[], totalStages, stepIdToStepKey: Map } }`) from the production types and assert `isComputeTemplateStageCountsResult` accepts it.
      * `[✅]`   Construct a full valid `ComputeTemplateStageCountsPayload` and assert `isComputeTemplateStageCountsPayload` accepts it; define invalid payload cases that must fail the guard.
      * `[✅]`   Construct a full valid error object (`{ status: 500, error }`) and assert it is accepted; assert an object carrying BOTH `data` and `error` is rejected (mutual exclusivity invariant).
      * `[✅]`   Construct a valid `StageCountsEntry` and assert `isStageCountsEntry` accepts it; assert invariants: non-empty `stageId`/`stageSlug`, `steps`/`edges` arrays, `expected` is a `Map`, `totalExpected` is a non-negative integer equal to the sum of `expected` values.
      * `[✅]`   Define invalid cases (must fail the guard): empty `stageSlug`; `expected` not a `Map`; `totalExpected` ≠ Σ expected; a `steps` element failing `isProgressRecipeStep`. No implementation details — pure expectation against the contract.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.interface.ts`
      * `[✅]`   Own the new contract types here (NOT in `dialectic.interface.ts`), importing borrowed types directly from `../dialectic.interface.ts`:
        * `StageCountsEntry`: `{ stageId: string; stageSlug: string; steps: ProgressRecipeStep[]; edges: ProgressRecipeEdge[]; expected: Map<string, number>; totalExpected: number; }` (per-stage, topologically ordered; `expected` keyed by `step_key`, `totalExpected` is its sum).
        * `ComputeTemplateStageCountsDeps`: `{ dbClient: SupabaseClient<Database>; topologicalSortSteps: (deps: TopologicalSortStepsDeps, params: TopologicalSortStepsParams) => ProgressRecipeStep[]; computeExpectedCounts: (deps: ComputeExpectedCountsDeps, params: ComputeExpectedCountsParams) => ExpectedCountsResult; }`.
        * `ComputeTemplateStageCountsParams`: `{}`.
        * `ComputeTemplateStageCountsPayload`: `{ processTemplateId: string; modelCount: number; }`.
        * `ComputeTemplateStageCountsResult`: `{ data?: { stages: StageCountsEntry[]; totalStages: number; stepIdToStepKey: Map<string, string>; }; error?: ServiceError; status?: number; }`.
        * `ComputeTemplateStageCountsFn = (deps: ComputeTemplateStageCountsDeps, params: ComputeTemplateStageCountsParams, payload: ComputeTemplateStageCountsPayload) => Promise<ComputeTemplateStageCountsResult>;`.
      * `[✅]`   Types only (exempt from RED/GREEN). Each type minimal and composable; no inline ad-hoc types; no `any`.

    * `[✅]`   `interaction.spec`
      * `[✅]`   Callers: `getAllStageProgress` (injects real `dbClient`/`topologicalSortSteps`/`computeExpectedCounts`, derives `processTemplateId`/`modelCount` from project+session) and `getStageExpectedCounts` (session-less handler, supplies `processTemplateId` from payload and `modelCount` from selected models).
      * `[✅]`   Required interactions: calls `dbClient` reads in order transitions → stages → instances → steps → edges; calls injected `topologicalSortSteps` once per stage inside `computeExpectedCounts`; calls injected `computeExpectedCounts` once per stage in topological order, passing the predecessor's produced `PriorStageContext`.
      * `[✅]`   Input → output: `payload: { processTemplateId, modelCount }` → `{ status: 200, data }` on success; side effects: none (pure reads, no writes).
      * `[✅]`   Failure modes: any DB read error → `{ status: 500, error }`; topological cycle/unresolved node → `{ status: 500, error }`; a thrown `computeExpectedCounts` → caught and returned as `{ status: 500, error }`. Never throws.
      * `[✅]`   Ordering/temporal: stages are processed strictly in topological order so each stage's predecessor context exists before it is consumed. Declarative only — no code.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.guard.test.ts`
      * `[✅]`   Verify `isComputeTemplateStageCountsPayload`, `isStageCountsEntry`, and `isComputeTemplateStageCountsResult` against the contract cases: no false negatives (every valid contract object from `.interface.test.ts` passes) and no false positives (each malformed variant — wrong-typed `expected`, mismatched `totalExpected`, empty ids, invalid `steps`/`edges` element, both-`data`-and-`error`, non-`Map` `stepIdToStepKey`) is rejected.
      * `[✅]`   Intentionally malformed objects built from a mock factory then overridden to invalid values (typed per the strict-typing exception), not by casting arbitrary literals.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.guard.ts`
      * `[✅]`   Implement `isComputeTemplateStageCountsPayload(value: unknown): value is ComputeTemplateStageCountsPayload` — non-empty string `processTemplateId`; finite positive integer `modelCount`.
      * `[✅]`   Implement `isStageCountsEntry(value: unknown): value is StageCountsEntry` — `isRecord`; non-empty string `stageId`/`stageSlug`; `Array.isArray(steps)` and every element `isProgressRecipeStep`; `Array.isArray(edges)` and every element `isProgressRecipeEdge`; `expected instanceof Map` with string keys and finite non-negative-integer values; `totalExpected` finite non-negative integer equal to the summed `expected` values.
      * `[✅]`   Implement `isComputeTemplateStageCountsResult(value: unknown): value is ComputeTemplateStageCountsResult` — `isRecord`; mutually exclusive `data`/`error`; when `data` present: `isRecord(data)`, `Array.isArray(data.stages)` and every element `isStageCountsEntry`, `data.totalStages` finite non-negative integer, `data.stepIdToStepKey instanceof Map` with string keys and string values; when `error` present: `isRecord(error)` with string `message`; `status` is a number when present.
      * `[✅]`   Reuse `isProgressRecipeStep`/`isProgressRecipeEdge` from `../../_shared/utils/type-guards/type_guards.dialectic.progress.ts` and `isRecord` from `type_guards.common.ts`. No new element-level guards invented.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.mock.ts`
      * `[✅]`   Per `.cursor/commands/mock.md`: provide `build*` builders with defaults and per-field overrides for each owned signature element — `ComputeTemplateStageCountsDeps`, `ComputeTemplateStageCountsParams`, `ComputeTemplateStageCountsPayload`, and return shapes. Use actual type names only; do not invent config objects or new types.
      * `[✅]`   Export `createMockComputeTemplateStageCountsFn()` returning a `ComputeTemplateStageCountsFn` that accepts the provided `deps`, `params`, and `payload` at call time and resolves output as a product of those inputs — if the caller supplies a real function in `deps`, call it; if the caller supplies a mock in `deps`, produce that mock's output.
      * `[✅]`   Conforms to the `interface` and `interaction.spec`; produces full valid objects via the production types and `build*` overrides only.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.test.ts`
      * `[✅]`   Use the `mockFetch`/`restoreFetch` harness from `../../_shared/supabase.mock.ts` with a real `createClient` (same pattern as `getAllStageProgress.test.ts`) to seed transitions/stages/instances/steps/edges rows, and inject controllable `topologicalSortSteps` and `computeExpectedCounts` doubles to test orchestration in isolation.
      * `[✅]`   Test: two-stage template (A → B) returns `data.stages` in topological order `[A, B]`, each entry carrying the seeded `steps`/`edges`, `expected` and `totalExpected` from the injected `computeExpectedCounts` double, and `data.totalStages === 2`.
      * `[✅]`   Test: `stepIdToStepKey` in the result is the union of all stages’ steps (`id → step_key`).
      * `[✅]`   Test: the predecessor’s produced `PriorStageContext` (`lineageCount` from B’s predecessor leaf-step cardinalities, `reviewerCount === payload.modelCount`) is the `priorStageContext` passed to the injected `computeExpectedCounts` for stage B — assert via a spy capturing the params.
      * `[✅]`   Test: a transitions fetch error returns `{ status: 500, error }` (no throw).
      * `[✅]`   Test: a transitions graph with a cycle returns `{ status: 500, error }` whose message matches the cycle/unresolved-node condition.
      * `[✅]`   Test: when the injected `computeExpectedCounts` throws, the result is `{ status: 500, error }` with the wrapped message (mirrors `getAllStageProgress` lines 805-821).
      * `[✅]`   Tests use production types from the package `.interface.ts` and borrowed types from `../dialectic.interface.ts`; one behavior per test; appended at the end. Do NOT re-test type shape or guard correctness here.

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: the bare async function `computeTemplateStageCounts(deps, params, payload)`; no class, no partially-constructed instance. All dependencies (`dbClient`, `topologicalSortSteps`, `computeExpectedCounts`) are required at call time via `ComputeTemplateStageCountsDeps`.
      * `[✅]`   Invalid construction: calling without a `dbClient`, or with a missing injected function, is a type error at the boundary — there are no defaults and no internal fallback construction.
      * `[✅]`   No initialization order concerns beyond the documented DB read order in `interaction.spec`.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.ts`
      * `[✅]`   Implement `computeTemplateStageCounts(deps: ComputeTemplateStageCountsDeps, params: ComputeTemplateStageCountsParams, payload: ComputeTemplateStageCountsPayload): Promise<ComputeTemplateStageCountsResult>` by extracting (verbatim logic, re-homed) the count-only sections of `getAllStageProgress.ts`: transitions fetch + `nonSelfTransitions`/`templateStageIds`/`totalStages` (lines 86-108); the light stages fetch (`id`, `slug`, `active_recipe_instance_id`) and `stageIdToStage` map (replacing lines 110-139/221-275 with only the columns this core needs); stage topological sort producing `orderedStageIds` (lines 141-187); instances fetch + clone/template mapping (lines 278-337); cloned + template steps fetch building `stepIdToStepKey` and `stepsBy*` maps (lines 339-482); cloned + template edges fetch (lines 484-537); and the per-stage walk (lines 727-839) that resolves `steps`/`edges`, determines `needsPriorContext`, pulls the predecessor’s stored `PriorStageContext`, calls `deps.computeExpectedCounts`, computes leaf `lineageCount` + `reviewerCount = modelCount`, stores the produced context for successors, and accumulates a `StageCountsEntry` (`expected` + `totalExpected = Σ expected.values()`).
      * `[✅]`   Because the file moves one level deeper into the package folder, imports shift accordingly: `../dialectic.interface.ts`, `../topologicalSortSteps.ts`, `../computeExpectedCounts.ts`, `../../types_db.ts`, `../../_shared/utils/type-guards/...`.
      * `[✅]`   Use `payload.modelCount` as `n` (no session read). Use `payload.processTemplateId` as the transitions filter (no project read).
      * `[✅]`   Return `{ status: 200, data: { stages, totalStages, stepIdToStepKey } }` with `stages` in `orderedStageIds` order. Return `{ status: 500, error }` for every DB failure / null-data / invalid-row condition exactly as the source sections do today. Preserve all existing `logger`/error messages encountered in the extracted sections.
      * `[✅]`   One function in the file; no undeclared dependencies; does not bypass the guards/contract; does not import or call any job/resource/contribution/document/status helper.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.provides.ts`
      * `[✅]`   External boundary barrel (the only sanctioned re-export point for this package, exemplar `calculateAffordability.provides.ts`): export `computeTemplateStageCounts`, the contract types (`StageCountsEntry`, `ComputeTemplateStageCounts*`, `ComputeTemplateStageCountsFn`), and the guards (`isComputeTemplateStageCountsPayload`, `isStageCountsEntry`, `isComputeTemplateStageCountsResult`).
      * `[✅]`   Declares the public API surface so external callers (`getAllStageProgress`, `getStageExpectedCounts`) consume the package through a single boundary; no external access bypasses it.

    * `[✅]`   computeTemplateStageCounts/`computeTemplateStageCounts.integration.test.ts`
      * `[✅]`   Inject the REAL `topologicalSortSteps` and REAL `computeExpectedCounts` (post-`per_source_group`-fix) and seed a real-shaped multi-stage template via `mockFetch` (e.g., thesis → synthesis, mirroring the step/granularity specs in `getAllStageProgress.test.ts` lines 52-101).
      * `[✅]`   Assert per-stage `totalExpected` matches the hand-computed spec totals (thesis `4n+1`; synthesis `4n³+4n+5` shape per `computeExpectedCounts.integration.test.ts` lines 134-174) for a fixed `modelCount`, proving the inter-stage `PriorStageContext` walk (thesis leaf cardinalities → synthesis `lineageCount`) is correct end-to-end through the DB-fetch + sort + count pipeline.
      * `[✅]`   Assert the stages are returned in topological order and `totalStages` equals the seeded stage count. Mocks used only for the external DB (fetch); the count code paths are real within the boundary.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: domain orchestration (BE service).
      * `[✅]`   Deps: inward (injected dbClient, `topologicalSortSteps`, `computeExpectedCounts`; borrowed interface types; shared guards).
      * `[✅]`   Provides: outward via `computeTemplateStageCounts.provides.ts` (`ComputeTemplateStageCountsResult` consumed by `getAllStageProgress` and `getStageExpectedCounts`).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `payload: { processTemplateId, modelCount }` → topologically-ordered `stages` with per-stage `steps`/`edges`/`expected`/`totalExpected`, plus `totalStages` and union `stepIdToStepKey`. Observable: unit test asserts shape, order, and union map.
      * `[✅]`   Inter-stage `PriorStageContext` (`lineageCount` from predecessor leaf cardinalities, `reviewerCount = payload.modelCount`) is threaded to each stage’s `computeExpectedCounts`. Observable: unit test spy on the injected `computeExpectedCounts` params; integration test asserts spec totals.
      * `[✅]`   Counts equal current `computeExpectedCounts` output for the existing DAG. Observable: integration test asserts `4n+1` / `4n³+4n+5` totals.
      * `[✅]`   DB failures, cycles, and `computeExpectedCounts` throws all return `{ status: 500, error }` (no throw to callers). Observable: unit tests for each.
      * `[✅]`   The package's contract types live in its own `.interface.ts` and its guards in its own `.guard.ts`; nothing is added to `dialectic.interface.ts`. Observable: review confirms file locations; guards reuse `isProgressRecipeStep`/`isProgressRecipeEdge`.
      * `[✅]`   The function reads no session/project/job/resource/contribution data. Observable: source contains no such fetches; review confirms only recipe-DAG tables are queried.

  * `[✅]`   supabase/functions/dialectic-service/getAllStageProgress **Delegate counting to the count core and surface per-stage expected counts on the progress response**

    * `[✅]`   `objective`
      * `[✅]`   `getAllStageProgress.ts` (921 lines) currently owns the full count derivation inline: transitions fetch (lines 86-108), stage topological sort (141-187), recipe instance/step/edge fetch (221-537), and the per-stage `computeExpectedCounts` + leaf-cardinality `lineageCount` / `PriorStageContext` walk (727-839). The prior node extracted that exact logic into `computeTemplateStageCounts`. This node makes `getAllStageProgress` delegate to that core so the count logic exists in one place, and it stops re-implementing the walk.
      * `[✅]`   Functional goal: inject `computeTemplateStageCounts` and call it once with `{ processTemplateId, modelCount: n }` (derived from the existing project + session reads), receiving `{ stages: StageCountsEntry[], totalStages, stepIdToStepKey }`. Replace the removed transitions/stages/instances/steps/edges fetches (86-537) and the per-stage count block (790-839) with consumption of the core result; keep the job/resource/document/status layering (538-705, 841-902) intact and behaviorally unchanged.
      * `[✅]`   Functional goal: surface the per-stage expected job count on the response — add `expectedCount` to `StageProgressEntry`, populated from each `StageCountsEntry.totalExpected`, so the FE cost-ceiling utility can read post-project counts directly from `GetAllStageProgressResponse` (per the ticket's "post-project counts" data source).
      * `[✅]`   Non-functional: existing-DAG progress output (statuses, step DTOs, documents, jobs, `dagProgress`) must be byte-for-byte unchanged except for the additive `expectedCount` field; the per-stage `expectedCount` must equal what the inline `computeExpectedCounts` summed to today for the same template and `n`.
      * `[✅]`   Non-functional: `getAllStageProgress.ts` is a pre-existing flat module (no own `.interface.ts`/`.guard.ts`/`.provides.ts`), so per the rules it is NOT forced into the package-folder format — the new field rides in its existing owner `dialectic.interface.ts` and the existing shared guard `type_guards.dialectic.progress.ts`.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   App-service orchestration (BE) — `getAllStageProgress` is the post-project progress endpoint: it authenticates, reads session/project, delegates counting to the core, then layers job/resource/document/status computation and assembles `GetAllStageProgressResponse`.
      * `[✅]`   This node edits exactly one source file (`getAllStageProgress.ts`) plus its support set (interface type, shared progress guard + guard test, unit test, mock, integration test). It does NOT modify `computeTemplateStageCounts` (prior node) and does NOT wire `dialectic-service/index.ts` (the production injection of the new dep is a separate wiring node; this node's unit/integration tests inject the dep directly).
      * `[✅]`   Out of scope: the session-less handler `getStageExpectedCounts`, `dialectic-service/index.ts` wiring, the API client, and all FE consumers.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` post-project DAG progress.
      * `[✅]`   Inside this boundary: payload/auth validation (28-44), session fetch → `n` (46-64), project fetch → `processTemplateId` (66-84), the single delegated `computeTemplateStageCounts` call, jobs/resources fetch + `buildDocumentDescriptors`/`buildJobProgressDtos`/`deriveStepStatuses`, per-stage status tallies, and response assembly with the new `expectedCount`.
      * `[✅]`   Outside this boundary: transitions/topo/recipe-fetch and the inter-stage count walk (now owned by `computeTemplateStageCounts`); session-less counting; index/API wiring.

    * `[✅]`   `deps`
      * `[✅]`   `computeTemplateStageCounts` (`ComputeTemplateStageCountsFn`) — provider: `computeTemplateStageCounts/computeTemplateStageCounts.provides.ts` (prior node's barrel; imported from original source, never re-exported); layer: domain orchestration; direction: inward (injected); purpose: the single count source. New field on `GetAllStageProgressDeps`.
      * `[✅]`   `dbClient` (`SupabaseClient<Database>`), `topologicalSortSteps`, `computeExpectedCounts` — existing `GetAllStageProgressDeps` fields, now FORWARDED into the core call as its `{ dbClient, topologicalSortSteps, computeExpectedCounts }` deps rather than used inline; layer: infra/domain; direction: inward.
      * `[✅]`   `deriveStepStatuses`, `buildDocumentDescriptors`, `buildJobProgressDtos`, `user` — existing `GetAllStageProgressDeps` fields, unchanged; layer: domain/app; direction: inward; purpose: the retained job/resource/document/status layering.
      * `[✅]`   `StageCountsEntry`, `ComputeTemplateStageCountsFn` — provider: `computeTemplateStageCounts/computeTemplateStageCounts.interface.ts`; layer: service interface; direction: inward; purpose: typing the injected dep and the iterated core result.
      * `[✅]`   No reverse dependencies. No lateral layer violations. Depends on the `computeTemplateStageCounts` node.

    * `[✅]`   `context_slice`
      * `[✅]`   From the core: only `data.stages` (each `StageCountsEntry`'s `stageId`/`stageSlug`/`steps`/`edges`/`totalExpected`), `data.totalStages`, and `data.stepIdToStepKey`. It no longer reads transitions/instances/recipe tables directly.
      * `[✅]`   From session/project: only `selected_model_ids` (→ `n`) and `process_template_id` (→ core param), exactly as today.
      * `[✅]`   No over-fetching; the dbClient is forwarded to the core for the recipe reads instead of duplicating them here.

    * `[✅]`   dialectic-service/`dialectic.interface.ts`
      * `[✅]`   Add `expectedCount: number` to `StageProgressEntry` (lines 1002-1011), after `progress`. Per-stage expected job count (= `StageCountsEntry.totalExpected`). Additive; no existing field changes.
      * `[✅]`   Add `computeTemplateStageCounts: ComputeTemplateStageCountsFn;` to `GetAllStageProgressDeps` (lines 1018-1041), importing `ComputeTemplateStageCountsFn` from `./computeTemplateStageCounts/computeTemplateStageCounts.interface.ts` (original source). Keep all existing deps fields.
      * `[✅]`   Types only (exempt from RED/GREEN).

    * `[✅]`   type-guards/`type_guards.dialectic.progress.test.ts`
      * `[✅]`   Add a case: a `StageProgressEntry` with a valid finite non-negative-integer `expectedCount` passes `isStageProgressEntry`; variants with `expectedCount` missing, negative, non-integer, or non-number fail. Build the valid object from production types; build invalid variants via a factory-then-override (typed per the strict-typing exception).
      * `[✅]`   Add the same coverage flowing through `isGetAllStageProgressResponse` (a response whose stage lacks a valid `expectedCount` is rejected). Appended at the end.

    * `[✅]`   type-guards/`type_guards.dialectic.progress.ts`
      * `[✅]`   In `isStageProgressEntry` (lines 76-85), add `if (!isFiniteNonNegativeInteger(value.expectedCount)) return false;` (reuse the existing module-local `isFiniteNonNegativeInteger`, lines 25-27). No other guard changes; `isGetAllStageProgressResponse` already delegates to `isStageProgressEntry`.

    * `[✅]`   dialectic-service/`getAllStageProgress.test.ts`
      * `[✅]`   Inject a mocked `computeTemplateStageCounts` via `createMockComputeTemplateStageCountsFn` (prior node's mock) returning deterministic `stages`/`totalStages`/`stepIdToStepKey`; retain the existing `mockFetch` seeding for the still-owned session/project/jobs/resources reads only (drop the transitions/stages/instances/steps/edges seeding now owned by the core).
      * `[✅]`   Add test: each response `StageProgressEntry.expectedCount` equals the injected `StageCountsEntry.totalExpected` for that stage.
      * `[✅]`   Add test: `buildDocumentDescriptors`/`buildJobProgressDtos`/`deriveStepStatuses` receive the core's `stepIdToStepKey` and each stage's `steps`/`edges` (spy on injected doubles), proving the layering consumes core output.
      * `[✅]`   Add test: when the injected core returns `{ status: 500, error }`, `getAllStageProgress` propagates `{ status: 500, error }` without running the job/document layering.
      * `[✅]`   Relocate (do not delete coverage): the inline count-logic tests that exercised strategy support and the `lineageCount` walk now belong to `computeTemplateStageCounts`/`computeExpectedCounts` tests (prior nodes); note the relocation so no behavior loses coverage. Existing status/document/job assertions remain green with the injected core. One behavior per test; new tests appended at the end.

    * `[✅]`   dialectic-service/`getAllStageProgress.ts`
      * `[✅]`   After the project fetch (line 84), call `const countsResult = await deps.computeTemplateStageCounts({ dbClient, topologicalSortSteps: deps.topologicalSortSteps, computeExpectedCounts: deps.computeExpectedCounts }, { processTemplateId, modelCount: n });` and on `countsResult.error` return `{ status: countsResult.status, error: countsResult.error }`. Bind `stages`/`totalStages`/`stepIdToStepKey` from `countsResult.data`.
      * `[✅]`   Remove the now-delegated fetch sections: transitions (86-108), stages/topo (110-187), the full stages fetch + instances + clone/template mapping + steps + edges (221-537), plus the loop's per-stage recipe resolution (728-788) and the count block (790-839, including `priorStageContextByStageId` at 725 and `computeExpectedCountsDeps` at 722).
      * `[✅]`   Iterate `countsResult.data.stages` (already topologically ordered) in place of `orderedStageIds`; for each `StageCountsEntry` use `entry.steps`/`entry.edges` for `deriveStepStatuses` (841-844), keep the status tallies and step DTO build (845-878), and build `StageProgressEntry` (880-902) adding `expectedCount: entry.totalExpected`. Use `stepIdToStepKey` from the core result for `buildDocumentDescriptors`/`buildJobProgressDtos` (707-720) and `deriveStepStatuses`.
      * `[✅]`   Build the final `stages` array (905-913) in `countsResult.data.stages` order and set `dagProgress.totalStages` from `countsResult.data.totalStages`; keep `completedStages` derivation (915). Preserve all existing error messages for the retained sections.
      * `[✅]`   Remove imports that become unused after extraction (`PriorStageContext`; `isGranularityStrategy`/`isJobTypeEnum`/`isRecord` if only used by removed recipe-row validation; `GranularityStrategy` if unused); add the `computeTemplateStageCounts` dep types via the interface. Do not change retained log/error strings. One function in the file.

    * `[✅]`   dialectic-service/`getAllStageProgress.mock.ts`
      * `[✅]`   Add `expectedCount: number` to `MockStageConfig` (lines 11-20) and set it in `stageFromConfig` (lines 40-55) so `createMockGetAllStageProgressResult` produces spec-valid `StageProgressEntry` objects with the new field. No behavioral change beyond the additive field.

    * `[✅]`   dialectic-service/`getAllStageProgress.integration.test.ts`
      * `[✅]`   New integration test (consistent with `computeExpectedCounts.integration.test.ts` for this flat module): inject the REAL `computeTemplateStageCounts` (with real `topologicalSortSteps`/`computeExpectedCounts`) and seed session/project/transitions/recipe/jobs/resources via `mockFetch`; assert each `StageProgressEntry.expectedCount` equals the hand-computed spec totals (thesis `4n+1`, etc.) and that statuses/documents/jobs still resolve — proving the `getAllStageProgress → computeTemplateStageCounts` boundary end-to-end with mocks only at the DB edge.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: app-service orchestration (BE).
      * `[✅]`   Deps: inward (injected core, dbClient, leaf helpers; interface types).
      * `[✅]`   Provides: outward (`GetAllStageProgressResponse` with additive `expectedCount`, consumed by the API client → store → FE cost-ceiling utility).
      * `[✅]`   No cycles (delegates downward to the count core).

    * `[✅]`   `requirements`
      * `[✅]`   `getAllStageProgress` calls `computeTemplateStageCounts` exactly once and derives every stage's recipe `steps`/`edges` and `expectedCount` from its result. Observable: unit test spies on the injected core and asserts no direct transitions/recipe fetch remains.
      * `[✅]`   Each `StageProgressEntry.expectedCount` equals the corresponding `StageCountsEntry.totalExpected`. Observable: unit test asserts equality; integration test asserts spec totals.
      * `[✅]`   A core error short-circuits with `{ status, error }` and no layering runs. Observable: unit test.
      * `[✅]`   Statuses/documents/jobs/`dagProgress` are unchanged for the existing DAG. Observable: pre-existing assertions remain green with the injected core; integration test confirms.
      * `[✅]`   `isStageProgressEntry` rejects entries lacking a valid `expectedCount`. Observable: guard test.

  * `[✅]`   supabase/functions/dialectic-service/getStageExpectedCounts/ **Session-less count handler: `{ processTemplateId, modelCount }` → per-stage expected counts (new package)**

    * `[✅]`   `objective`
      * `[✅]`   The pre-project cost preview (Create Project form, Autostart gate) needs per-stage expected job counts BEFORE any session or project exists, so it cannot use `getAllStageProgress` (which requires `sessionId`/`iterationNumber`/`projectId` and reads `n` from `session.selected_model_ids`). The shared count core `computeTemplateStageCounts` already takes `{ processTemplateId, modelCount }` with no session — this node exposes it as a thin authenticated handler.
      * `[✅]`   Functional goal: create `getStageExpectedCounts(deps, params, payload)` per §7 DI (`deps` / `params` / `payload` separate — do not nest `payload` inside `params`) that validates an authenticated user (`deps.user`) and a `GetStageExpectedCountsPayload` `{ processTemplateId, modelCount }`, calls `deps.computeTemplateStageCounts`, and returns `GetStageExpectedCountsResult` (`GetStageExpectedCountsSuccessReturn | GetStageExpectedCountsErrorReturn`). Success `data` is `{ stages: StageExpectedCount[]; totalStages }` where each `StageExpectedCount` is `{ stageSlug, expectedCount }` (`expectedCount = StageCountsEntry.totalExpected`). No `Map` in the response (HTTP boundary).
      * `[✅]`   Functional goal: identical counts to `getAllStageProgress` for the same template + model count, because both call the same core — the pre-project estimate and post-project progress can never drift.
      * `[✅]`   Functional goal: preserve the error-as-value contract per §7 union returns — invalid payload → `GetStageExpectedCountsErrorReturn` `{ status: 400, error }`; unauthenticated → `GetStageExpectedCountsErrorReturn` `{ status: 401, error }`; core failure → `GetStageExpectedCountsErrorReturn` propagated `{ status, error }`; success → `GetStageExpectedCountsSuccessReturn` `{ status: 200, data }`. Never throw.
      * `[✅]`   Non-functional: NEW source file → authored as a full package folder `dialectic-service/getStageExpectedCounts/` (`.interface.ts`, `.interface.test.ts`, `.guard.ts`, `.guard.test.ts`, `.mock.ts`, `.test.ts`, `.ts`, `.provides.ts`, `.integration.test.ts`); owns its contract types in its own `.interface.ts` (not `dialectic.interface.ts`).
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   App-service handler (BE) — the session-less entry for expected-count queries; authenticates, validates payload, delegates to the count core, and projects the core result into a serializable response.
      * `[✅]`   This node CREATES the new package folder only. It does NOT edit `dialectic-service/index.ts` (the adapter, `ActionHandlers` entry, dispatch `case`, and the new `GetStageExpectedCountsAction` member of `DialecticServiceRequest` are the index-wiring node) and does NOT touch the API client or FE.
      * `[✅]`   Out of scope: `computeTemplateStageCounts` internals (prior node), index/API wiring, all FE consumers, and the Create-form domain → `process_template_id` resolution (the FE node supplies `processTemplateId`).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` session-less expected-count query, packaged under `dialectic-service/getStageExpectedCounts/`.
      * `[✅]`   Inside this boundary: auth check, payload validation, the single `computeTemplateStageCounts` call, projection of `StageCountsEntry[]` → `StageExpectedCount[]`, and the package's own contract types + guards.
      * `[✅]`   Outside this boundary: transitions/topo/recipe-fetch and the count walk (core), session/project reads, job/document/status logic, and HTTP routing/auth-token parsing (index dispatch).

    * `[✅]`   `deps`
      * `[✅]`   `computeTemplateStageCounts` (`ComputeTemplateStageCountsFn`) — provider: `../computeTemplateStageCounts/computeTemplateStageCounts.provides.ts`; layer: domain orchestration; direction: inward (injected); purpose: the shared count source.
      * `[✅]`   `dbClient` (`SupabaseClient<Database>`), `topologicalSortSteps`, `computeExpectedCounts` — forwarded into the core call as its `{ dbClient, topologicalSortSteps, computeExpectedCounts }` deps (same forwarding pattern as `getAllStageProgress`); providers: `@supabase/supabase-js` via `../../types_db.ts`, `../topologicalSortSteps.ts`, `../computeExpectedCounts.ts`; layer: infra/domain; direction: inward. Supabase client typing exception applies.
      * `[✅]`   `user` (`User`) — provider: `@supabase/supabase-js`; layer: app; direction: inward; purpose: authenticated-user gate (401 when absent), mirroring `getAllStageProgress` lines 41-44.
      * `[✅]`   `ServiceError`, `ProgressRecipeStep`, `ExpectedCountsResult`, `ComputeExpectedCountsDeps`, `ComputeExpectedCountsParams`, `TopologicalSortStepsDeps`, `TopologicalSortStepsParams` — provider: `../dialectic.interface.ts` (original source); `StageCountsEntry`/`ComputeTemplateStageCountsFn` — provider: `../computeTemplateStageCounts/computeTemplateStageCounts.interface.ts`; layer: service interface; direction: inward.
      * `[✅]`   `isRecord` — provider: `../../_shared/utils/type-guards/type_guards.common.ts`; layer: shared utility; direction: inward; purpose: payload guard primitive.
      * `[✅]`   No reverse dependencies. No lateral layer violations. Depends on the `computeTemplateStageCounts` node.

    * `[✅]`   `context_slice`
      * `[✅]`   From `GetStageExpectedCountsParams` (`{}`): no call-time fields at the handler boundary (index adapter passes an empty params object; session/project/iteration never appear here).
      * `[✅]`   From `GetStageExpectedCountsPayload` (third argument): only `processTemplateId` and `modelCount`. No session/project/iteration inputs.
      * `[✅]`   From the core result: only `data.stages[].stageSlug`, `data.stages[].totalExpected`, and `data.totalStages` (the handler discards `steps`/`edges`/`expected`/`stepIdToStepKey` — not needed pre-project).
      * `[✅]`   Injection shape: `GetStageExpectedCountsDeps` exposes only the injected core, the forwarded core deps, and `user` — no concrete services, no over-fetch, no hidden coupling.

    * `[✅]`   getStageExpectedCounts/`getStageExpectedCounts.interface.test.ts`
      * `[✅]`   Contract: `GetStageExpectedCountsPayload` (`{ processTemplateId, modelCount }`) — valid shape and invalid assignable cases (empty `processTemplateId`, non-integer/zero/negative `modelCount`). Payload is a top-level contract type, not nested under `params` (§7).
      * `[✅]`   Contract: `GetStageExpectedCountsParams` is `{}` (zero keys; confirms payload is not blobbed into params).
      * `[✅]`   Contract: `GetStageExpectedCountsDeps` required keys (`dbClient`, `user`, `computeTemplateStageCounts`, `topologicalSortSteps`, `computeExpectedCounts`).
      * `[✅]`   Contract: `GetStageExpectedCountsFn` signature accepts `(deps: GetStageExpectedCountsDeps, params: GetStageExpectedCountsParams, payload: GetStageExpectedCountsPayload)` and returns `Promise<GetStageExpectedCountsResult>` (§7 function definition).
      * `[✅]`   Construct a full valid `GetStageExpectedCountsResponse` and a `StageExpectedCount`; assert invariants (non-empty `stageSlug`, finite non-negative-integer `expectedCount`, `stages` array, finite non-negative-integer `totalStages`).
      * `[✅]`   Contract: `GetStageExpectedCountsSuccessReturn` (`{ status: 200; data: GetStageExpectedCountsResponse }` — no `error`). Contract: `GetStageExpectedCountsErrorReturn` (`{ status: number; error: ServiceError }` — no `data`). Contract: `GetStageExpectedCountsResult` = `GetStageExpectedCountsSuccessReturn | GetStageExpectedCountsErrorReturn` (§7 — assign each branch; combined `data`+`error` must not be assignable).
      * `[✅]`   Guard contract (separate from shape-only interface tests): via package guards after `.guard.ts` exists — `isGetStageExpectedCountsPayload` accepts valid payload and rejects invalid cases; `isGetStageExpectedCountsResponse`/`isStageExpectedCount` accept valid response shapes.

    * `[✅]`   getStageExpectedCounts/`getStageExpectedCounts.interface.ts`
      * `[✅]`   Own the contract types (NOT in `dialectic.interface.ts`), importing borrowed types directly from `../dialectic.interface.ts` and the core's `.interface.ts`. §7 function definition: separate `deps`, `params`, `payload`, `returns`; do not nest `payload` inside `params`.
        * `GetStageExpectedCountsPayload`: `{ processTemplateId: string; modelCount: number; }` — request/body slice (third handler argument).
        * `GetStageExpectedCountsParams`: `{}` — call-time params with no fields at this boundary (not a wrapper for payload).
        * `GetStageExpectedCountsDeps`: `{ dbClient: SupabaseClient<Database>; user: User; computeTemplateStageCounts: ComputeTemplateStageCountsFn; topologicalSortSteps: (deps: TopologicalSortStepsDeps, params: TopologicalSortStepsParams) => ProgressRecipeStep[]; computeExpectedCounts: (deps: ComputeExpectedCountsDeps, params: ComputeExpectedCountsParams) => ExpectedCountsResult; }`.
        * `StageExpectedCount`: `{ stageSlug: string; expectedCount: number; }`.
        * `GetStageExpectedCountsResponse`: `{ stages: StageExpectedCount[]; totalStages: number; }` — success `data` payload inside `GetStageExpectedCountsSuccessReturn`.
        * `GetStageExpectedCountsSuccessReturn`: `{ status: 200; data: GetStageExpectedCountsResponse; }`.
        * `GetStageExpectedCountsErrorReturn`: `{ status: number; error: ServiceError; }`.
        * `GetStageExpectedCountsResult`: `GetStageExpectedCountsSuccessReturn | GetStageExpectedCountsErrorReturn`.
        * `GetStageExpectedCountsFn = (deps: GetStageExpectedCountsDeps, params: GetStageExpectedCountsParams, payload: GetStageExpectedCountsPayload) => Promise<GetStageExpectedCountsResult>;`.
      * `[✅]`   Types only (exempt from RED/GREEN). No inline ad-hoc types; no `any`.

    * `[✅]`   `interaction.spec`
      * `[✅]`   Caller: the `dialectic-service/index.ts` dispatch (separate node) on `action: "getStageExpectedCounts"`, supplying `dbClient`/`user` and the leaf functions; the FE API client originates `GetStageExpectedCountsPayload`; the index adapter calls `getStageExpectedCounts(deps, params, payload)` with `params: {}` and `payload` from the request body (§7 — payload not nested in params).
      * `[✅]`   Required interactions: validate `deps.user` → validate third-argument `payload` (`GetStageExpectedCountsPayload`) → call injected `computeTemplateStageCounts` exactly once with the forwarded deps and `{ processTemplateId: payload.processTemplateId, modelCount: payload.modelCount }` → map result. Side effects: none (pure reads inside the core).
      * `[✅]`   Input → output: valid authed request → `GetStageExpectedCountsSuccessReturn`; missing user → `GetStageExpectedCountsErrorReturn` `{ status: 401, error }`; invalid payload → `GetStageExpectedCountsErrorReturn` `{ status: 400, error }`; core error → `GetStageExpectedCountsErrorReturn` propagated `{ status, error }`. Never throws.
      * `[✅]`   Ordering: auth before payload validation before the core call; no count call happens on a 400/401. Declarative only — no code.

    * `[✅]`   getStageExpectedCounts/`getStageExpectedCounts.guard.test.ts`
      * `[✅]`   Verify `isGetStageExpectedCountsPayload`, `isStageExpectedCount`, `isGetStageExpectedCountsResponse` against the contract cases: no false negatives (valid objects pass) and no false positives (empty `processTemplateId`; non-integer/zero/negative `modelCount`; empty `stageSlug`; negative/non-integer `expectedCount`; non-array `stages`; bad `totalStages`).
      * `[✅]`   Malformed objects built via factory-then-override (typed per the strict-typing exception), not arbitrary casts.

    * `[✅]`   getStageExpectedCounts/`getStageExpectedCounts.guard.ts`
      * `[✅]`   Implement `isGetStageExpectedCountsPayload(value): value is GetStageExpectedCountsPayload` — `isRecord`; non-empty string `processTemplateId`; finite positive integer `modelCount`.
      * `[✅]`   Implement `isStageExpectedCount(value): value is StageExpectedCount` — `isRecord`; non-empty string `stageSlug`; finite non-negative integer `expectedCount`.
      * `[✅]`   Implement `isGetStageExpectedCountsResponse(value): value is GetStageExpectedCountsResponse` — `isRecord`; `Array.isArray(stages)` and every element `isStageExpectedCount`; finite non-negative integer `totalStages`.
      * `[✅]`   Reuse `isRecord` from `../../_shared/utils/type-guards/type_guards.common.ts`. No new primitive guards invented.

    * `[✅]`   getStageExpectedCounts/`getStageExpectedCounts.mock.ts`
      * `[✅]`   Export `createMockGetStageExpectedCountsFn()` returning a `GetStageExpectedCountsFn` that consumes the provided `deps`/`params`/`payload` objects, real or mocked, and resolves against the inputs provided. If a mocked object is provided, the mocked outputs are used. If a real input is provided, outputs from the real inputs are used. 
      * `[✅]`   Conforms to `interface` + `interaction.spec`; full valid objects via production types; no behavior beyond returning the configured result.

    * ` [✅]`   getStageExpectedCounts/`getStageExpectedCounts.test.ts`
      * ` [✅]`   Inject a mocked `computeTemplateStageCounts` via `createMockComputeTemplateStageCountsFn` (node 2 mock) and a typed `user`; call `getStageExpectedCounts(deps, params, payload)` with `params: {}` and a typed `GetStageExpectedCountsPayload`; assert orchestration in isolation (no real DB).
      * ` [✅]`   Test: valid authed request → `GetStageExpectedCountsSuccessReturn` whose `data.stages` map `{ stageSlug, expectedCount }` from each core `StageCountsEntry` (`expectedCount === totalExpected`) and `data.totalStages` passes through.
      * ` [✅]`   Test: missing `user` → `GetStageExpectedCountsErrorReturn` `{ status: 401, error }` and the core is never called (spy).
      * ` [✅]`   Test: invalid `payload` (empty `processTemplateId`; non-integer/zero/negative `modelCount`) → `GetStageExpectedCountsErrorReturn` `{ status: 400, error }` and the core is never called.
      * ` [✅]`   Test: core returns `{ status: 500, error }` → handler returns `GetStageExpectedCountsErrorReturn` `{ status: 500, error }`.
      * ` [✅]`   Production types from the package `.interface.ts`; one behavior per test; appended at the end. Do NOT re-test guard correctness here.

    * ` [✅]`   `construction`
      * ` [✅]`   Entrypoint: bare async `getStageExpectedCounts(deps, params, payload)` per §7 (`GetStageExpectedCountsFn`); no class; all deps required at call time via `GetStageExpectedCountsDeps` (no defaults, no internal fallback); `params` is `{}` at this boundary.
      * ` [✅]`   Invalid construction: missing `dbClient`/`user`/injected functions is a type error at the boundary.
      * ` [✅]`   No initialization order concerns beyond the auth → validate `payload` → call sequence in `interaction.spec`.

    * ` [✅]`   getStageExpectedCounts/`getStageExpectedCounts.ts`
      * ` [✅]`   Implement `getStageExpectedCounts(deps: GetStageExpectedCountsDeps, params: GetStageExpectedCountsParams, payload: GetStageExpectedCountsPayload): Promise<GetStageExpectedCountsResult>`: if `!deps.user` return `GetStageExpectedCountsErrorReturn` `{ status: 401, error }`; validate `payload` (non-empty `processTemplateId`, finite positive integer `modelCount`) returning `GetStageExpectedCountsErrorReturn` `{ status: 400, error }` on failure; call `await deps.computeTemplateStageCounts({ dbClient: deps.dbClient, topologicalSortSteps: deps.topologicalSortSteps, computeExpectedCounts: deps.computeExpectedCounts }, { processTemplateId: payload.processTemplateId, modelCount: payload.modelCount })`; on core `error` return `GetStageExpectedCountsErrorReturn` `{ status: countsResult.status, error: countsResult.error }` (default status 500 when missing); on success map `data.stages` → `StageExpectedCount[]` and return `GetStageExpectedCountsSuccessReturn` `{ status: 200, data: { stages, totalStages: data.totalStages } }`.
      * ` [✅]`   Imports shift for the package folder: `../dialectic.interface.ts`, `../computeTemplateStageCounts/computeTemplateStageCounts.provides.ts`, `../topologicalSortSteps.ts`, `../computeExpectedCounts.ts`, `../../types_db.ts`, `../../_shared/utils/type-guards/...`. One function in the file; no session/project/job reads; never throws.

    * ` [✅]`   getStageExpectedCounts/`getStageExpectedCounts.provides.ts`
      * ` [✅]`   External boundary barrel: export `getStageExpectedCounts`, the contract types (`GetStageExpectedCountsPayload`, `GetStageExpectedCountsParams`, `GetStageExpectedCountsDeps`, `GetStageExpectedCountsFn`, `GetStageExpectedCountsResponse`, `GetStageExpectedCountsSuccessReturn`, `GetStageExpectedCountsErrorReturn`, `GetStageExpectedCountsResult`, `StageExpectedCount`), and the guards (`isGetStageExpectedCountsPayload`, `isStageExpectedCount`, `isGetStageExpectedCountsResponse`) so the index-wiring node and the API client consume the package through one boundary.

    * ` [✅]`   getStageExpectedCounts/`getStageExpectedCounts.integration.test.ts`
      * ` [✅]`   Inject the REAL `computeTemplateStageCounts` (with real `topologicalSortSteps`/`computeExpectedCounts`) and a typed `user`; call `getStageExpectedCounts(deps, params, payload)` with `params: {}` and a typed `GetStageExpectedCountsPayload`; seed a real-shaped multi-stage template via `mockFetch` (thesis → synthesis, per `getAllStageProgress.test.ts` lines 52-101).
      * ` [✅]`   Assert on `GetStageExpectedCountsSuccessReturn`: `data.stages[].expectedCount` equals hand-computed spec totals (thesis `4n+1`, etc.) for a fixed `modelCount` and `data.totalStages` equals the seeded stage count — proving `getStageExpectedCounts → computeTemplateStageCounts` end-to-end with mocks only at the DB edge, and matching what `getAllStageProgress` reports for the same template/`n`.

    * ` [✅]`   `directionality`
      * ` [✅]`   Layer: app-service handler (BE).
      * ` [✅]`   Deps: inward (injected core, forwarded core deps, `user`; interface types; shared guard primitive).
      * ` [✅]`   Provides: outward via `getStageExpectedCounts.provides.ts` (`GetStageExpectedCountsResult` union consumed by index dispatch; success `data` shape `GetStageExpectedCountsResponse` consumed by API client → FE pre-project preview).
      * ` [✅]`   No cycles.

    * ` [✅]`   `requirements`
      * ` [✅]`   Handler signature is `getStageExpectedCounts(deps, params, payload)` with `GetStageExpectedCountsParams` = `{}`, payload not nested in params, and `GetStageExpectedCountsResult` = success | error union (§7). Observable: interface test + unit tests invoke three arguments.
      * ` [✅]`   Valid authed `GetStageExpectedCountsPayload` → `GetStageExpectedCountsSuccessReturn` with `expectedCount === core totalExpected` per stage. Observable: unit test asserts the projection; integration test asserts spec totals.
      * ` [✅]`   Counts equal `getAllStageProgress` for the same template/model count. Observable: integration test asserts the same `4n+1`/… totals as the `getAllStageProgress` integration test.
      * ` [✅]`   Missing user → 401 (no core call); invalid payload → 400 (no core call); core error → propagated. Observable: unit tests for each.
      * ` [✅]`   Contract types live in the package's own `.interface.ts` and guards in its own `.guard.ts`; nothing added to `dialectic.interface.ts`. Observable: review confirms file locations.
      * ` [✅]`   No session/project/job/document reads. Observable: source contains none; the only DB access is via the injected core.

  * `[✅]`   supabase/functions/dialectic-service/index **Wire the count core + session-less handler into the service dispatch (and complete the `getAllStageProgress` dep)**

    * ` [✅]`   `objective`
      * ` [✅]`   The prior nodes added a required `computeTemplateStageCounts` dep to `GetAllStageProgressDeps` and created the `getStageExpectedCounts` handler, but `dialectic-service/index.ts` does not yet provide the core to `getAllStageProgress` (so it no longer compiles) and has no route for `getStageExpectedCounts`. This node wires both through the existing `ActionHandlers` / adapter / `defaultHandlers` dispatch.
      * ` [✅]`   Functional goal: update the `handleGetAllStageProgress` adapter (lines 721-735) to include `computeTemplateStageCounts` in the constructed `GetAllStageProgressDeps`, restoring compilation and giving the post-project path its count source.
      * ` [✅]`   Functional goal: add a `getStageExpectedCounts` route — a new `ActionHandlers` member, a `handleGetStageExpectedCounts` adapter constructing `GetStageExpectedCountsDeps`, a dispatch `case "getStageExpectedCounts"` (auth-gated like `getAllStageProgress`, lines 647-656), and the `defaultHandlers` entry (lines 738-768).
      * ` [✅]`   Functional goal: add the discriminated-union member `GetStageExpectedCountsAction = { action: "getStageExpectedCounts"; payload: GetStageExpectedCountsPayload }` to `DialecticServiceRequest` (lines 882-914) so the request body narrows on `action` and `requestBody.payload` types correctly in the new case.
      * ` [✅]`   Non-functional: `index.ts` is a pre-existing flat dispatch file → reduced footprint (no package format); preserve every existing handler, route, log, and error string.
      * ` [✅]`   Each goal is atomic and testable.

    * ` [✅]`   `role`
      * ` [✅]`   Composition root / HTTP dispatch (BE) — `index.ts` is where dependencies are constructed and injected into the action handlers and where request bodies are routed by `action`.
      * ` [✅]`   This node edits exactly one source file (`index.ts`) plus its support set (the `DialecticServiceRequest` union member in `dialectic.interface.ts`; the dispatch test `index.test.ts`). It does NOT modify `getStageExpectedCounts`/`computeTemplateStageCounts`/`getAllStageProgress` internals (prior nodes) and does NOT touch the API client or FE.
      * ` [✅]`   Out of scope: the `@paynless/api` client method (separate node), FE consumers, and the Create-form domain → template resolution.

    * ` [✅]`   `module`
      * ` [✅]`   Bounded context: `dialectic-service` composition + routing.
      * ` [✅]`   Inside this boundary: dependency construction for the two count paths, the new route + union member, and the dispatch tests.
      * ` [✅]`   Outside this boundary: handler logic, counting math, API-client transport, and FE state.

    * ` [✅]`   `deps`
      * ` [✅]`   `computeTemplateStageCounts` — provider: `./computeTemplateStageCounts/computeTemplateStageCounts.provides.ts`; layer: domain orchestration; direction: inward; purpose: injected into BOTH `handleGetAllStageProgress` and `handleGetStageExpectedCounts` deps. New import in `index.ts`.
      * ` [✅]`   `getStageExpectedCounts` (`GetStageExpectedCountsFn`) — provider: `./getStageExpectedCounts/getStageExpectedCounts.provides.ts`; layer: app-service handler; direction: inward; purpose: the new routed handler. New import.
      * ` [✅]`   `GetStageExpectedCountsPayload`, `GetStageExpectedCountsParams`, `GetStageExpectedCountsDeps`, `GetStageExpectedCountsResult`, `GetStageExpectedCountsSuccessReturn`, `GetStageExpectedCountsErrorReturn` — provider: `./getStageExpectedCounts/getStageExpectedCounts.interface.ts`; layer: service interface; direction: inward; purpose: typing the `ActionHandlers` member, the adapter deps, the dispatch case, and branch narrowing.
      * ` [✅]`   `topologicalSortSteps`, `computeExpectedCounts`, `getAllStageProgress`, `GetAllStageProgressDeps` — already imported in `index.ts` (used by `handleGetAllStageProgress`); reused, no new import.
      * ` [✅]`   `SupabaseClient<Database>`, `User`, `ServiceError` — already imported; reused for the new adapter/handler signature.
      * ` [✅]`   No reverse dependencies. No lateral layer violations. Depends on the `computeTemplateStageCounts` and `getStageExpectedCounts` nodes.

    * ` [✅]`   `context_slice`
      * ` [✅]`   The new adapters construct only the deps each function declares: `handleGetAllStageProgress` adds `computeTemplateStageCounts` to its existing 7-field deps; `handleGetStageExpectedCounts` builds `{ dbClient, user, computeTemplateStageCounts, topologicalSortSteps, computeExpectedCounts }`.
      * ` [✅]`   The dispatch case reads only `requestBody.payload` (narrowed to `GetStageExpectedCountsPayload`) and `userForJson`; no extra request surface.
      * ` [✅]`   No over-fetching; no hidden globals (all injected at the composition root).

    * ` [✅]`   dialectic-service/`dialectic.interface.ts`
      * ` [✅]`   Add `type GetStageExpectedCountsAction = { action: "getStageExpectedCounts"; payload: GetStageExpectedCountsPayload };` (mirroring `GetAllStageProgressAction`, lines 497-500), importing `GetStageExpectedCountsPayload` directly from `./getStageExpectedCounts/getStageExpectedCounts.interface.ts` (original source).
      * ` [✅]`   Add `| GetStageExpectedCountsAction` to the `DialecticServiceRequest` union (lines 882-914). Additive; no existing member changes. Types only (exempt from RED/GREEN).

    * ` [✅]`   dialectic-service/`index.test.ts`
      * ` [✅]`   Add test: `handleRequest` with `{ action: "getStageExpectedCounts", payload: { processTemplateId, modelCount } }` and an authenticated user routes to `handlers.getStageExpectedCounts` and returns HTTP success from `GetStageExpectedCountsSuccessReturn.data`; an unauthenticated request returns 401 without calling the handler (mirror the existing `getAllStageProgress` dispatch tests).
      * ` [✅]`   Add test: `defaultHandlers.getStageExpectedCounts` is defined and `defaultHandlers.getAllStageProgress` (`handleGetAllStageProgress`) constructs `GetAllStageProgressDeps` including `computeTemplateStageCounts` — assert via a spy/injection that the dep is passed (proving the node-3 break is closed).
      * ` [✅]`   Use the existing `index.test.ts` harness and mocks; one behavior per test; appended at the end.

    * ` [✅]`   dialectic-service/`index.ts`
      * ` [✅]`   Add imports: `computeTemplateStageCounts` from `./computeTemplateStageCounts/computeTemplateStageCounts.provides.ts`; `getStageExpectedCounts` from `./getStageExpectedCounts/getStageExpectedCounts.provides.ts`; `GetStageExpectedCountsPayload`/`GetStageExpectedCountsResult`/`GetStageExpectedCountsSuccessReturn`/`GetStageExpectedCountsErrorReturn` from `./getStageExpectedCounts/getStageExpectedCounts.interface.ts`.
      * ` [✅]`   In `handleGetAllStageProgress` (726-734), add `computeTemplateStageCounts,` to the `GetAllStageProgressDeps` object literal. No other change to that adapter.
      * ` [✅]`   Add `getStageExpectedCounts: (payload: GetStageExpectedCountsPayload, dbClient: SupabaseClient<Database>, user: User) => Promise<GetStageExpectedCountsResult>;` to the `ActionHandlers` interface (after line 217, beside `getAllStageProgress`).
      * ` [✅]`   Add adapter `async function handleGetStageExpectedCounts(payload: GetStageExpectedCountsPayload, dbClient: SupabaseClient<Database>, user: User): Promise<GetStageExpectedCountsResult>` building `const deps: GetStageExpectedCountsDeps = { dbClient, user, computeTemplateStageCounts, topologicalSortSteps, computeExpectedCounts };` and returning `getStageExpectedCounts(deps, {}, payload)` with `params: {}` and request-body `payload` as separate arguments per §7 (place beside `handleGetAllStageProgress`).
      * ` [✅]`   Add dispatch `case "getStageExpectedCounts": { if (!userForJson) return createErrorResponse('User not authenticated for getStageExpectedCounts', 401, req, { message: 'User not authenticated', status: 401, code: 'USER_AUTH_FAILED' }); const payload: GetStageExpectedCountsPayload = requestBody.payload; const result: GetStageExpectedCountsResult = await handlers.getStageExpectedCounts(payload, adminClient as SupabaseClient<Database>, userForJson); if ('error' in result) return createErrorResponse(result.error.message, result.status, req, result.error); const success: GetStageExpectedCountsSuccessReturn = result; return createSuccessResponse(success.data, success.status, req); }` (mirrors lines 647-656; narrow `GetStageExpectedCountsResult` union — do not use optional `data`/`error` on one type). Also add `'getStageExpectedCounts'` to the authenticated-actions list if one is enumerated near line 301.
      * ` [✅]`   Add `getStageExpectedCounts: handleGetStageExpectedCounts,` to `defaultHandlers` (738-768). Preserve all other entries and ordering.

    * ` [✅]`   `directionality`
      * ` [✅]`   Layer: composition root / HTTP dispatch (BE).
      * ` [✅]`   Deps: inward (handlers, core, leaf functions; interface types).
      * ` [✅]`   Provides: outward (HTTP responses for `getStageExpectedCounts` and the extended `getAllStageProgress`).
      * ` [✅]`   No cycles.

    * ` [✅]`   `requirements`
      * ` [✅]`   `handleGetAllStageProgress` injects `computeTemplateStageCounts`; the service compiles and `getAllStageProgress` runs. Observable: dispatch test + compile.
      * ` [✅]`   `action: "getStageExpectedCounts"` routes to the handler and returns its result; unauthenticated → 401 without calling it. Observable: dispatch tests.
      * ` [✅]`   `DialecticServiceRequest` narrows the new action's payload. Observable: type-checks in the new case; no `any`.
      * ` [✅]`   The routed `getStageExpectedCounts` response equals `getAllStageProgress` counts for the same template/model count. Observable: integration test.

    * ` [✅]`   **Commit** `feat(dialectic): dynamic cost ceiling — BE counts (per_source_group fix, shared count core, session-less handler, service wiring)`
      * ` [✅]`   Structural: new `computeTemplateStageCounts/` and `getStageExpectedCounts/` packages; `computeExpectedCounts` gains `per_source_group`; `getAllStageProgress` delegates to the core; `dialectic-service/index.ts` routes the new handler.
      * ` [✅]`   Behavioral: `per_source_group` stages now count; pre-project and post-project counts come from one core and cannot drift; `getAllStageProgress` returns per-stage `expectedCount`; new `getStageExpectedCounts` action returns session-less per-stage counts.
      * ` [✅]`   Contract: `StageProgressEntry.expectedCount` added; new `GetStageExpectedCounts*` (including `GetStageExpectedCountsSuccessReturn | GetStageExpectedCountsErrorReturn`)/`StageCountsEntry`/`StageExpectedCount` types + guards; `DialecticServiceRequest` gains `GetStageExpectedCountsAction`.

  * `[✅]`   supabase/functions/dialectic-service/listDomains/ **Enabled `dialectic_domains` catalog (package refactor; full table rows only)**

    * `[✅]`   `objective`
      * `[✅]`   The Create flow needs a domain picker backed by real `dialectic_domains` rows. The flat `dialectic-service/listDomains.ts` handler (39 lines) predates current package/DI standards, exports a hand-trimmed `DialecticDomain` interface (missing `created_at`/`updated_at`), and uses `as DialecticDomain[]` on a partial `select` — schema drift from `types_db.ts`. Default `process_template_id` for a domain lives on `domain_process_associations`, not on `dialectic_domains`; that read is owned by the sibling `fetchProcessAssociation/` node, not this handler.
      * `[✅]`   Functional goal: replace the flat file with a full package `dialectic-service/listDomains/` that exposes `listDomains(deps, params, payload)` per §7 DI (`deps` / `params` / `payload` separate) and returns `ListDomainsResult` (`ListDomainsSuccessReturn | ListDomainsErrorReturn`). Success `data` is `DialecticDomainRow[]` where `DialecticDomainRow = Database['public']['Tables']['dialectic_domains']['Row']` — every column from the table, no merged fields, no FE projection type defined here.
      * `[✅]`   Functional goal: query `dialectic_domains` with `.select('*')`, `.eq('is_enabled', true)`, `.order('name', { ascending: true })` — same filter/order as today (`listDomains.ts` lines 19-23). Preserve existing log strings (`Fetching all enabled dialectic domains.`, `Successfully fetched ${n} dialectic domains.`) and DB-failure contract: `ListDomainsErrorReturn` `{ status: 500, error: { message: 'Could not fetch dialectic domains.', code: 'DB_FETCH_FAILED', details } }`, no `data`. Never throw.
      * `[✅]`   Functional goal: when the query returns zero enabled domains, return `ListDomainsSuccessReturn` `{ status: 200, data: [] }` (not an error).
      * `[✅]`   Non-functional: NEW package folder with the nine files mirroring `getStageExpectedCounts/` (`.interface.ts`, `.interface.test.ts`, `.guard.ts`, `.guard.test.ts`, `.mock.ts`, `.test.ts`, `.ts`, `.provides.ts`, `.integration.test.ts`). Contract types live in `listDomains.interface.ts` only (do not add types to `dialectic.interface.ts`). Delete the obsolete flat `listDomains.ts` and `listDomains.test.ts` after the package tests pass.
      * `[✅]`   Out of scope: `domain_process_associations` reads (`fetchProcessAssociation/` node); `dialectic-service/index.ts` import/route/adapter updates (index-wiring node); `packages/types` / `@paynless/api` / `dialecticStore` (API node owns first FE consumer and replaces hand-written `DialecticDomain` with `DialecticDomainRow` from `@paynless/db-types`); `createProject`, `fetchProcessTemplate`, `getStageExpectedCounts`, count/ceiling logic.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   App-service read handler (BE) — SSOT catalog read for enabled `dialectic_domains` rows only.
      * `[✅]`   This node CREATES `dialectic-service/listDomains/` and DELETES the flat `listDomains.ts` + `listDomains.test.ts`. It does NOT edit `index.ts`, `dialectic.interface.ts`, `createProject.ts`, or any FE package.
      * `[✅]`   Downstream index node imports `listDomains` from `./listDomains/listDomains.provides.ts` and adapts to `ListDomainsFn`; FE obtains default template ids via `fetchProcessAssociation` after domain selection (separate nodes).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` enabled-domain listing, packaged under `dialectic-service/listDomains/`.
      * `[✅]`   Inside: single-table read of `dialectic_domains`, package contract types + guards + mocks + unit/integration tests.
      * `[✅]`   Outside: junction-table default template resolution, process-template graph fetch, session/project reads, HTTP routing (index), FE store orchestration.

    * `[✅]`   `deps`
      * `[✅]`   `dbClient` (`SupabaseClient<Database>`) — provider: `npm:@supabase/supabase-js@^2` via `../../types_db.ts`; layer: infrastructure; direction: inward (injected); purpose: the only DB access. Supabase client typing exception applies.
      * `[✅]`   `ServiceError` — provider: `../../_shared/types.ts`; layer: shared; direction: inward; purpose: `ListDomainsErrorReturn.error`.
      * `[✅]`   `logger` — provider: `../../_shared/logger.ts`; layer: shared; direction: inward; purpose: existing info/error logs (do not remove).
      * `[✅]`   `Database` / `DialecticDomainRow` — provider: `../../types_db.ts`; layer: schema; direction: inward; purpose: row typing for response elements.
      * `[✅]`   `isRecord` — provider: `../../_shared/utils/type-guards/type_guards.common.ts`; layer: shared utility; direction: inward; purpose: guard primitives.
      * `[✅]`   No reverse dependencies. No lateral layer violations. No injected leaf functions beyond `dbClient`.

    * `[✅]`   `context_slice`
      * `[✅]`   From `ListDomainsParams` (`{}`): no call-time fields at the handler boundary (index adapter passes `{}`).
      * `[✅]`   From `ListDomainsPayload` (`{}`): no request-body fields (list-all enabled domains; action has no payload today).
      * `[✅]`   From `ListDomainsDeps`: only `dbClient`.
      * `[✅]`   Success output: full `DialecticDomainRow[]` as returned by PostgREST for `select('*')` on enabled domains, name-ascending. No column stripping, no defaults, no association fields.

    * `[✅]`   listDomains/`listDomains.interface.test.ts`
      * `[✅]`   Contract tests only: import types from `./listDomains.interface.ts` and `../../types_db.ts` (`Database`, `DialecticDomainRow`). Do NOT import or call any function from `listDomains.guard.ts`. Guard behavior is exclusively `listDomains.guard.test.ts`.
      * `[✅]`   Contract: `ListDomainsPayload` and `ListDomainsParams` are `{}` (zero keys; payload is not nested under params). Assert `Object.keys(params).length === 0` and same for payload.
      * `[✅]`   Contract: `ListDomainsDeps` required key `dbClient` (use `keyof ListDomainsDeps` assertions mirroring `getStageExpectedCounts.interface.test.ts`).
      * `[✅]`   Contract: `ListDomainsFn` signature `(deps: ListDomainsDeps, params: ListDomainsParams, payload: ListDomainsPayload) => Promise<ListDomainsResult>` (§7) — stub fn typed as `ListDomainsFn` returns a typed success branch; assert `typeof fn === 'function'`.
      * `[✅]`   Construct a full valid `DialecticDomainRow` with every `Database['public']['Tables']['dialectic_domains']['Row']` field populated; assert invariants via direct field assertions (non-empty `id`/`name`, `typeof is_enabled === 'boolean'`, non-empty `created_at`/`updated_at`).
      * `[✅]`   Contract: `ListDomainsSuccessReturn` `{ status: 200; data: DialecticDomainRow[] }` — assert `status`, `data` present, `error` undefined. Contract: `ListDomainsErrorReturn` `{ status: number; error: ServiceError }` — assert `data` undefined. Contract: `ListDomainsResult` — assign each branch; a combined object with both `data` and `error` must remain structurally writable but is not a valid member of the union (document via separate success/error variable assignments, not guard calls).
      * `[✅]`   Shape-only negative cases (no guards): e.g. empty-string `id` on a `DialecticDomainRow` literal is structurally assignable but noted invalid in test comment/assertion on the field value; partial row missing `created_at` is structurally invalid at compile time if omitted — use required-field completeness on the valid literal only.

    * `[✅]`   listDomains/`listDomains.interface.ts`
      * `[✅]`   Own all contract types (NOT in `dialectic.interface.ts`). §7: separate `deps`, `params`, `payload`, `returns`.
        * `DialecticDomainRow`: `Database['public']['Tables']['dialectic_domains']['Row']` (import `Database` from `../../types_db.ts`).
        * `ListDomainsPayload`: `{}`.
        * `ListDomainsParams`: `{}`.
        * `ListDomainsDeps`: `{ dbClient: SupabaseClient<Database> }`.
        * `ListDomainsSuccessReturn`: `{ status: 200; data: DialecticDomainRow[]; error?: never }`.
        * `ListDomainsErrorReturn`: `{ status: number; error: ServiceError; data?: never }`.
        * `ListDomainsResult`: `ListDomainsSuccessReturn | ListDomainsErrorReturn`.
        * `ListDomainsFn`: `(deps: ListDomainsDeps, params: ListDomainsParams, payload: ListDomainsPayload) => Promise<ListDomainsResult>`.
      * `[✅]`   Types only (exempt from RED/GREEN). No `any`. No inline ad-hoc domain DTO. Do not export legacy `DialecticDomain`.

    * `[✅]`   `interaction.spec`
      * `[✅]`   Caller (separate index node): `action: "listDomains"` → adapter builds `ListDomainsDeps` with `adminClient` → `listDomains(deps, {}, {})` → HTTP 200 with `success.data` array on success.
      * `[✅]`   Required interactions: `dbClient.from('dialectic_domains').select('*').eq('is_enabled', true).order('name', { ascending: true })` → map to `ListDomainsSuccessReturn` or `ListDomainsErrorReturn`. Side effects: logging only.
      * `[✅]`   Input → output: DB success with rows → `ListDomainsSuccessReturn`; DB success empty → `{ status: 200, data: [] }`; DB error → `ListDomainsErrorReturn` `{ status: 500, code: 'DB_FETCH_FAILED' }`. Never throws.
      * `[✅]`   No `domain_process_associations` access in this handler. Declarative only — no code.

    * `[✅]`   listDomains/`listDomains.guard.test.ts`
      * `[✅]`   Verify `isListDomainsPayload`, `isListDomainsParams`, `isDialecticDomainRow`, `isListDomainsSuccessReturn`, `isListDomainsErrorReturn`, `isListDomainsResult`: no false negatives on valid fixtures; no false positives on `{}` with extra keys, partial domain rows (missing `created_at`), success objects with `error` present, error objects with `data` present.
      * `[✅]`   Malformed variants via `buildDialecticDomainRow` factory-then-override (typed per strict-typing exception).

    * `[✅]`   listDomains/`listDomains.guard.ts`
      * `[✅]`   `isListDomainsPayload` / `isListDomainsParams`: `isRecord` and `Object.keys(value).length === 0`.
      * `[✅]`   `isDialecticDomainRow`: `isRecord`; non-empty string `id` and `name`; `description` is `string` or `null`; `parent_domain_id` is `string` or `null`; `typeof is_enabled === 'boolean'`; non-empty string `created_at` and `updated_at`.
      * `[✅]`   `isListDomainsSuccessReturn`: `status === 200`; `Array.isArray(data)`; every element `isDialecticDomainRow`.
      * `[✅]`   `isListDomainsErrorReturn`: `isRecord`; finite `status`; `error` is `isRecord` with string `message`.
      * `[✅]`   `isListDomainsResult`: discriminates success vs error branches without accepting combined shapes.
      * `[✅]`   Reuse `isRecord` from `../../_shared/utils/type-guards/type_guards.common.ts`.

    * `[✅]`   listDomains/`listDomains.mock.ts`
      * `[✅]`   `buildDialecticDomainRow(overrides?)` — full `DialecticDomainRow` with domain-approved defaults documented in-file (e.g. fixed ISO timestamps) when overrides omit fields.
      * `[✅]`   `buildListDomainsDeps`, `buildListDomainsParams`, `buildListDomainsPayload`, `buildListDomainsSuccessReturn`, `buildListDomainsErrorReturn`, `buildListDomainsResult`.
      * `[✅]`   `createMockListDomainsFn()` returning `ListDomainsFn` controllable for unit tests.
      * `[✅]`   Conforms to interface + interaction.spec; production types only.

    * `[✅]`   listDomains/`listDomains.test.ts`
      * `[✅]`   Use `createMockSupabaseClient` from `../../_shared/supabase.mock.ts` with `genericMockResults.dialectic_domains.select` (mirror existing flat-test behavior: return name-sorted enabled rows as full `DialecticDomainRow` objects including `created_at`/`updated_at`).
      * `[✅]`   Test: valid call → `ListDomainsSuccessReturn`; `data.length === 3`; `data[0].name === 'Finance'` when mock rows are Software/Finance/Web (name sort); each element satisfies full row shape (assert `created_at`/`updated_at` present).
      * `[✅]`   Test: DB error on domains query → `ListDomainsErrorReturn`; `error.code === 'DB_FETCH_FAILED'`; `error.message === 'Could not fetch dialectic domains.'`; `status === 500`; no `data`.
      * `[✅]`   Test: empty enabled set → `ListDomainsSuccessReturn` `{ status: 200, data: [] }`.
      * `[✅]`   Test: `from('dialectic_domains')` only — spy/assert `from` never called with `domain_process_associations`.
      * `[✅]`   Call `listDomains(deps, {}, {})` with `buildListDomainsDeps`; one behavior per test; appended at end. Do NOT re-test guard correctness here.

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: bare async `listDomains(deps, params, payload)` (`ListDomainsFn`); no class; `ListDomainsDeps` requires `dbClient` at call time (no hidden globals, no defaults inside handler).
      * `[✅]`   Invalid construction: missing `dbClient` is a type error at the boundary.
      * `[✅]`   Initialization order: DB query → log count → return (per `interaction.spec`).

    * `[✅]`   listDomains/`listDomains.ts`
      * `[✅]`   Implement `listDomains(deps, params, payload): Promise<ListDomainsResult>`: log info start; `const { data, error } = await deps.dbClient.from('dialectic_domains').select('*').eq('is_enabled', true).order('name', { ascending: true })`; on `error` log and return `ListDomainsErrorReturn` with existing message/code/details; on success bind `const rows: DialecticDomainRow[] = data` (if `data === null` treat as `[]`); log success count; return `ListDomainsSuccessReturn` `{ status: 200, data: rows }`.
      * `[✅]`   Do not read `domain_process_associations`. Do not export `DialecticDomain`. Do not cast with `as`. One function in the file. Package imports: `../../types_db.ts`, `../../_shared/logger.ts`, `../../_shared/types.ts`, `./listDomains.interface.ts`.

    * `[✅]`   listDomains/`listDomains.provides.ts`
      * `[✅]`   Barrel boundary: export `listDomains`, all contract types from `.interface.ts`, all guards from `.guard.ts`, all mock builders/`createMockListDomainsFn` from `.mock.ts`. Index-wiring node imports ONLY from this file.

    * `[✅]`   listDomains/`listDomains.integration.test.ts`
      * `[✅]`   **Real database integration** (mirrors `getStageExpectedCounts.integration.test.ts`, `modelTiers.integration.test.ts`): `initializeTestDeps()`; `coreInitializeTestStep({}, 'global')` for `adminClient`; `coreCleanupTestResources` in `try`/`finally`. Inject real `adminClient` into `buildListDomainsDeps({ dbClient: adminClient })`; call real `listDomains(deps, {}, {})`. Do NOT use `createMockSupabaseClient` in this file.
      * `[✅]`   Independently query the live DB: `adminClient.from('dialectic_domains').select('*').eq('is_enabled', true).order('name', { ascending: true })` — assert no query error; bind `expectedRows: DialecticDomainRow[]`.
      * `[✅]`   Assert handler returns `ListDomainsSuccessReturn` with `status === 200`; `result.data.length === expectedRows.length`; for each index `i`, `result.data[i].id === expectedRows[i].id` and every column (`name`, `description`, `parent_domain_id`, `is_enabled`, `created_at`, `updated_at`) matches the direct DB row.
      * `[✅]`   Assert name-ascending order matches the independent query (e.g. when multiple enabled domains exist, `result.data[0].name <= result.data[1].name` lexicographically for adjacent pairs).
      * `[✅]`   Prove handler → real `dialectic_domains` table only: no `domain_process_associations` query in this test path (optional: assert seeded domain such as `'Software Development'` appears when `is_enabled = true` in seed data).
      * `[✅]`   Out of scope for this file: `index.ts` dispatch, FE API/store. Mocks only where `_integration.test.utils` already does auth/setup — not for domain rows.

    * `[✅]`   dialectic-service/`listDomains.ts` (DELETE)
      * `[✅]`   Remove flat `listDomains.ts` after package is complete. No re-export shim at the old path.

    * `[✅]`   dialectic-service/`listDomains.test.ts` (DELETE)
      * `[✅]`   Remove flat `listDomains.test.ts` after cases are ported to `listDomains/listDomains.test.ts`.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: app-service handler (BE).
      * `[✅]`   Deps: inward (`dbClient`, `ServiceError`, `logger`, schema row type, shared guard primitive).
      * `[✅]`   Provides: outward via `listDomains.provides.ts` (`ListDomainsResult` consumed by index dispatch; `DialecticDomainRow[]` consumed by API/store after index/API nodes).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   Handler signature is `listDomains(deps, params, payload)` with empty `params`/`payload` and `ListDomainsResult` union (§7). Observable: interface tests + unit tests use three arguments.
      * `[✅]`   Success returns full `DialecticDomainRow[]` from `select('*')`, `is_enabled = true`, `name` ascending. Observable: unit test asserts Finance-first sort and presence of `created_at`/`updated_at`.
      * `[✅]`   DB failure returns `DB_FETCH_FAILED` / 500 with no `data`. Observable: unit test.
      * `[✅]`   Handler never queries `domain_process_associations`. Observable: unit test `from` spy.
      * `[✅]`   Integration test uses real Postgres via `adminClient` and matches an independent `dialectic_domains` query. Observable: `listDomains.integration.test.ts`.
      * `[✅]`   `listDomains.interface.test.ts` does not import guards. Observable: file review.
      * `[✅]`   Contract types and guards live only under `listDomains/`. Observable: file review.
      * `[✅]`   Flat `listDomains.ts` / `listDomains.test.ts` deleted. Observable: paths absent.
      * `[✅]`   Index compile/route is explicitly deferred to the index-wiring node (not a requirement of this node).

  * `[✅]`   supabase/functions/dialectic-service/fetchProcessAssociation/ **Default `domain_process_associations` row for a domain (package; full table row only)**

    * `[✅]`   `objective`
      * `[✅]`   Pre-project cost preview and `createProject` both need the default `process_template_id` for a selected domain before a project exists. That value is not on `dialectic_domains`; it lives on `domain_process_associations` where `domain_id` matches and `is_default_for_domain === true` — the same lookup `createProject.ts` performs today (lines 68-81) via `.from('domain_process_associations').select('process_template_id').eq('domain_id', selectedDomainId).eq('is_default_for_domain', true).single()`. There is no flat handler for this read; the FE will call a dedicated action after domain selection, then pass `process_template_id` into `fetchProcessTemplate` and `getStageExpectedCounts`.
      * `[✅]`   Functional goal: NEW package `dialectic-service/fetchProcessAssociation/` exposing `fetchProcessAssociation(deps, params, payload)` per §7 DI (`deps` / `params` / `payload` separate) returning `FetchProcessAssociationResult` (`FetchProcessAssociationSuccessReturn | FetchProcessAssociationErrorReturn`). Success `data` is one `DomainProcessAssociationRow` where `DomainProcessAssociationRow = Database['public']['Tables']['domain_process_associations']['Row']` — every column from the table (`id`, `domain_id`, `process_template_id`, `is_default_for_domain`, `created_at`, `updated_at`), no merged domain fields, no FE projection type defined here.
      * `[✅]`   Functional goal: query `domain_process_associations` with `.select('*').eq('domain_id', payload.domainId).eq('is_default_for_domain', true).single()` — same filter rule as `createProject.ts` 68-74, but full row not `process_template_id` only. On success return `FetchProcessAssociationSuccessReturn` `{ status: 200, data: row }` where `row.is_default_for_domain === true` and `row.domain_id === payload.domainId`.
      * `[✅]`   Functional goal: invalid payload (missing/empty/non-string `domainId`) → `FetchProcessAssociationErrorReturn` `{ status: 400, error: { message: 'domainId is required and must be a non-empty string', code: 'VALIDATION_ERROR' } }` after `isFetchProcessAssociationPayload` fails at handler entry (mirror `fetchProcessTemplate.ts` missing `templateId` → 400 `MISSING_PARAM` pattern).
      * `[✅]`   Functional goal: no default row for domain (PostgREST `.single()` `PGRST116`, or `data === null` with no error) → `FetchProcessAssociationErrorReturn` `{ status: 404, error: { message: 'No default process association found for the domain.', code: 'NOT_FOUND' } }` (read semantics; `createProject` uses 400 for the same DB miss — this handler is the catalog read path, not project mutation).
      * `[✅]`   Functional goal: other DB errors → `FetchProcessAssociationErrorReturn` `{ status: 500, error: { message: 'Could not fetch domain process association.', code: 'DB_FETCH_FAILED', details: error.message } }`, no `data`. Never throw.
      * `[✅]`   Non-functional: NEW package folder with nine files mirroring `listDomains/` and `getStageExpectedCounts/` (`fetchProcessAssociation.interface.ts`, `.interface.test.ts`, `.guard.ts`, `.guard.test.ts`, `.mock.ts`, `.test.ts`, `.ts`, `.provides.ts`, `.integration.test.ts`). Contract types live in `fetchProcessAssociation.interface.ts` only (do not add types to `dialectic.interface.ts` in this node). No flat predecessor file to delete.
      * `[✅]`   Out of scope: `dialectic_domains` listing (`listDomains/` node); `dialectic_process_templates` graph fetch (`fetchProcessTemplate`); `createProject` mutation/validation changes; `dialectic-service/index.ts` route/adapter (`index-wiring` node adds `action: "fetchProcessAssociation"`); `packages/types` / `@paynless/api` / `dialecticStore` (API node owns first FE consumer and `DomainProcessAssociationRow` alias from `@paynless/db-types`); count/ceiling logic.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   App-service read handler (BE) — SSOT read for the default `domain_process_associations` row for one `domain_id`.
      * `[✅]`   This node CREATES `dialectic-service/fetchProcessAssociation/` only. It does NOT edit `listDomains/`, `index.ts`, `dialectic.interface.ts`, `createProject.ts`, or any FE package.
      * `[✅]`   Downstream: index node wires `action: "fetchProcessAssociation"` with payload `{ domainId }` and `adminClient`; API node adds client method; store calls it on domain selection and reads `data.process_template_id` for `fetchProcessTemplate` / `fetchStageExpectedCounts`. Optional future composite handler may call this leaf via DI without changing its contract.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` default domain↔process association read, packaged under `dialectic-service/fetchProcessAssociation/`.
      * `[✅]`   Inside: single-domain default-association query, package contract types + guards + mocks + unit/integration tests.
      * `[✅]`   Outside: enabled-domain catalog (`listDomains/`), process-template stage graph, project create, HTTP routing, FE orchestration.

    * `[✅]`   `deps`
      * `[✅]`   `dbClient` (`SupabaseClient<Database>`) — provider: `npm:@supabase/supabase-js@^2` via `../../types_db.ts`; layer: infrastructure; direction: inward (injected); purpose: the only DB access. Supabase client typing exception applies.
      * `[✅]`   `ServiceError` — provider: `../../_shared/types.ts`; layer: shared; direction: inward; purpose: `FetchProcessAssociationErrorReturn.error`.
      * `[✅]`   `logger` — provider: `../../_shared/logger.ts`; layer: shared; direction: inward; purpose: info at start (`Fetching default domain process association.`, include `domainId`); error log on DB failure; info on success with `process_template_id` (do not remove logging).
      * `[✅]`   `Database` / `DomainProcessAssociationRow` — provider: `../../types_db.ts`; layer: schema; direction: inward; purpose: row typing for success `data`.
      * `[✅]`   `isRecord` — provider: `../../_shared/utils/type-guards/type_guards.common.ts`; layer: shared utility; direction: inward; purpose: guard primitives.
      * `[✅]`   `isFetchProcessAssociationPayload` (local) — provider: `./fetchProcessAssociation.guard.ts`; layer: enforcement; direction: inward; purpose: handler entry validation.
      * `[✅]`   No reverse dependencies. No lateral layer violations. No injected leaf functions beyond `dbClient`.

    * `[✅]`   `context_slice`
      * `[✅]`   From `FetchProcessAssociationParams` (`{}`): no call-time fields at the handler boundary (index adapter passes `{}`).
      * `[✅]`   From `FetchProcessAssociationPayload`: required `domainId: string` (non-empty UUID string for the selected domain; comes from `selectedDomain.id` on the FE after `listDomains`).
      * `[✅]`   From `FetchProcessAssociationDeps`: only `dbClient`.
      * `[✅]`   Success output: exactly one full `DomainProcessAssociationRow` for the default association of that domain. No array, no partial column select in the returned object.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.interface.test.ts`
      * `[✅]`   Contract tests only: import types from `./fetchProcessAssociation.interface.ts` and `../../types_db.ts` (`Database`, `DomainProcessAssociationRow`). Do NOT import or call any function from `fetchProcessAssociation.guard.ts`. Guard behavior is exclusively `fetchProcessAssociation.guard.test.ts`.
      * `[✅]`   Contract: `FetchProcessAssociationParams` is `{}` (zero keys). Assert `Object.keys(params).length === 0`.
      * `[✅]`   Contract: `FetchProcessAssociationPayload` required key `domainId` only — assert `keyof` / assign `{ domainId: 'uuid-string' }`; empty-object payload is structurally assignable to partial shapes but invalid per guard tests (document in comment, not guard import).
      * `[✅]`   Contract: `FetchProcessAssociationDeps` required key `dbClient` (use `keyof FetchProcessAssociationDeps` assertions mirroring `listDomains.interface.test.ts`).
      * `[✅]`   Contract: `FetchProcessAssociationFn` signature `(deps, params, payload) => Promise<FetchProcessAssociationResult>` (§7) — stub fn typed as `FetchProcessAssociationFn` returns a typed success branch; assert `typeof fn === 'function'`.
      * `[✅]`   Construct a full valid `DomainProcessAssociationRow` with every `Database['public']['Tables']['domain_process_associations']['Row']` field populated; assert invariants via direct field assertions (non-empty `id`/`domain_id`/`process_template_id`; `is_default_for_domain === true`; non-empty `created_at`/`updated_at`).
      * `[✅]`   Contract: `FetchProcessAssociationSuccessReturn` `{ status: 200; data: DomainProcessAssociationRow }` — assert `status`, `data` present, `error` undefined. Contract: `FetchProcessAssociationErrorReturn` `{ status: number; error: ServiceError }` — assert `data` undefined. Contract: `FetchProcessAssociationResult` — assign each branch separately.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.interface.ts`
      * `[✅]`   Own all contract types (NOT in `dialectic.interface.ts`). §7: separate `deps`, `params`, `payload`, `returns`.
        * `DomainProcessAssociationRow`: `Database['public']['Tables']['domain_process_associations']['Row']` (import `Database` from `../../types_db.ts`).
        * `FetchProcessAssociationPayload`: `{ domainId: string }`.
        * `FetchProcessAssociationParams`: `{}`.
        * `FetchProcessAssociationDeps`: `{ dbClient: SupabaseClient<Database> }`.
        * `FetchProcessAssociationSuccessReturn`: `{ status: 200; data: DomainProcessAssociationRow; error?: never }`.
        * `FetchProcessAssociationErrorReturn`: `{ status: number; error: ServiceError; data?: never }`.
        * `FetchProcessAssociationResult`: `FetchProcessAssociationSuccessReturn | FetchProcessAssociationErrorReturn`.
        * `FetchProcessAssociationFn`: `(deps: FetchProcessAssociationDeps, params: FetchProcessAssociationParams, payload: FetchProcessAssociationPayload) => Promise<FetchProcessAssociationResult>`.
      * `[✅]`   Types only (exempt from RED/GREEN). No `any`. No inline ad-hoc DTO. Do not export merged domain+template shapes.

    * `[✅]`   `interaction.spec`
      * `[✅]`   Caller (separate index node): `action: "fetchProcessAssociation"` with body payload `{ domainId }` → adapter builds `FetchProcessAssociationDeps` with `adminClient` → `fetchProcessAssociation(deps, {}, payload)` → HTTP 200 with `success.data` as full association row on success.
      * `[✅]`   Required interactions: `dbClient.from('domain_process_associations').select('*').eq('domain_id', domainId).eq('is_default_for_domain', true).single()` → map to success or error union. Side effects: logging only.
      * `[✅]`   Input → output: valid payload + row exists → `FetchProcessAssociationSuccessReturn`; invalid payload → 400 `VALIDATION_ERROR`; no row → 404 `NOT_FOUND`; DB error (not PGRST116) → 500 `DB_FETCH_FAILED`. Never throws.
      * `[✅]`   No `dialectic_domains` or `dialectic_process_templates` access in this handler. Declarative only — no code.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.guard.test.ts`
      * `[✅]`   Verify `isFetchProcessAssociationPayload`, `isFetchProcessAssociationParams`, `isDomainProcessAssociationRow`, `isFetchProcessAssociationSuccessReturn`, `isFetchProcessAssociationErrorReturn`, `isFetchProcessAssociationResult`: no false negatives on valid fixtures; no false positives on `{}` with extra keys, empty `domainId`, partial association rows (missing `updated_at`), success objects with `error` present, error objects with `data` present.
      * `[✅]`   Malformed variants via `buildDomainProcessAssociationRow` factory-then-override (typed per strict-typing exception for tests).

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.guard.ts`
      * `[✅]`   `isFetchProcessAssociationPayload`: `isRecord`; `typeof domainId === 'string'` and `domainId.length > 0`; reject records with keys other than `domainId` (exactly one key) OR allow only `domainId` key present — match `isGetStageExpectedCountsPayload` strictness (no extra keys): `Object.keys(value).length === 1` and `domainId` valid.
      * `[✅]`   `isFetchProcessAssociationParams`: `isRecord` and `Object.keys(value).length === 0`.
      * `[✅]`   `isDomainProcessAssociationRow`: `isRecord`; non-empty string `id`, `domain_id`, `process_template_id`; `typeof is_default_for_domain === 'boolean'` and must be `true` for success-row guard; non-empty string `created_at`, `updated_at`.
      * `[✅]`   `isFetchProcessAssociationSuccessReturn`: `status === 200`; `isDomainProcessAssociationRow(data)`.
      * `[✅]`   `isFetchProcessAssociationErrorReturn`: `isRecord`; finite `status`; `error` is `isRecord` with string `message` and string `code`.
      * `[✅]`   `isFetchProcessAssociationResult`: discriminates success vs error branches.
      * `[✅]`   Reuse `isRecord` from `../../_shared/utils/type-guards/type_guards.common.ts`.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.mock.ts`
      * `[✅]`   `buildDomainProcessAssociationRow(overrides?)` — full `DomainProcessAssociationRow` with domain-approved defaults documented in-file (e.g. `is_default_for_domain: true`, fixed ISO timestamps, placeholder UUIDs) when overrides omit fields.
      * `[✅]`   `buildFetchProcessAssociationDeps`, `buildFetchProcessAssociationParams`, `buildFetchProcessAssociationPayload`, `buildFetchProcessAssociationSuccessReturn`, `buildFetchProcessAssociationErrorReturn`, `buildFetchProcessAssociationResult`.
      * `[✅]`   `createMockFetchProcessAssociationFn()` returning `FetchProcessAssociationFn` controllable for unit tests.
      * `[✅]`   Conforms to interface + interaction.spec; production types only.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.test.ts`
      * `[✅]`   Use `createMockSupabaseClient` from `../../_shared/supabase.mock.ts` with `genericMockResults.domain_process_associations.select` returning full `DomainProcessAssociationRow` objects (include all six columns).
      * `[✅]`   Test: valid `domainId` + mock default row → `FetchProcessAssociationSuccessReturn`; `data.process_template_id === 'pt-thesis'` (or mocked value); `data.is_default_for_domain === true`; `data.domain_id` matches payload `domainId`; assert `created_at`/`updated_at` present.
      * `[✅]`   Test: mock `.single()` returns `error: { code: 'PGRST116', message: '...' }` → `FetchProcessAssociationErrorReturn`; `status === 404`; `error.code === 'NOT_FOUND'`; no `data`.
      * `[✅]`   Test: mock returns `data: null`, `error: null` → treat as not found → `404` `NOT_FOUND` (same branch as PGRST116 in handler spec).
      * `[✅]`   Test: invalid payload `{ domainId: '' }` or `{}` → `400` `VALIDATION_ERROR` without calling DB (spy `from` not invoked or zero calls).
      * `[✅]`   Test: DB error with code other than `PGRST116` → `500` `DB_FETCH_FAILED`; `error.message === 'Could not fetch domain process association.'`; no `data`.
      * `[✅]`   Test: `from('domain_process_associations')` only — assert `from` never called with `dialectic_domains` or `dialectic_process_templates`.
      * `[✅]`   Call `fetchProcessAssociation(deps, {}, payload)` with `buildFetchProcessAssociationDeps`; one behavior per test; appended at end. Do NOT re-test guard correctness here.

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: bare async `fetchProcessAssociation(deps, params, payload)` (`FetchProcessAssociationFn`); no class; `FetchProcessAssociationDeps` requires `dbClient` at call time (no hidden globals, no defaults inside handler).
      * `[✅]`   Invalid construction: missing `dbClient` is a type error at the boundary.
      * `[✅]`   Initialization order: validate payload → log → DB query → map PostgREST result to union → return (per `interaction.spec`).

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.ts`
      * `[✅]`   Implement `fetchProcessAssociation(deps, params, payload): Promise<FetchProcessAssociationResult>`: if `!isFetchProcessAssociationPayload(payload)` return `400` `VALIDATION_ERROR`; log info with `domainId`; `const { data, error } = await deps.dbClient.from('domain_process_associations').select('*').eq('domain_id', payload.domainId).eq('is_default_for_domain', true).single()`; if `error` and `error.code === 'PGRST116'` (use `isPostgrestError` from shared guards if available, else narrow `error` as `PostgrestError` with `code` field per Supabase exception) return `404` `NOT_FOUND`; if `error` return `500` `DB_FETCH_FAILED` with details; if `data === null` return `404` `NOT_FOUND`; bind `const row: DomainProcessAssociationRow = data`; if `!isDomainProcessAssociationRow(row)` return `500` with message indicating invalid row shape (defensive — should not happen when DB schema matches); log success with `process_template_id`; return `FetchProcessAssociationSuccessReturn` `{ status: 200, data: row }`.
      * `[✅]`   Do not read `dialectic_domains`. Do not read `dialectic_process_templates`. Do not cast with `as`. One function in the file. Package imports: `../../types_db.ts`, `../../_shared/logger.ts`, `../../_shared/types.ts`, `./fetchProcessAssociation.interface.ts`, `./fetchProcessAssociation.guard.ts`.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.provides.ts`
      * `[✅]`   Barrel boundary: export `fetchProcessAssociation`, all contract types from `.interface.ts`, all guards from `.guard.ts`, all mock builders/`createMockFetchProcessAssociationFn` from `.mock.ts`. Index-wiring node imports ONLY from this file.

    * `[✅]`   fetchProcessAssociation/`fetchProcessAssociation.integration.test.ts`
      * `[✅]`   **Real database integration** (mirrors `listDomains.integration.test.ts`): `initializeTestDeps()`; `coreInitializeTestStep({}, 'global')` for `adminClient`; `coreCleanupTestResources` in `try`/`finally`. Inject real `adminClient` into `buildFetchProcessAssociationDeps({ dbClient: adminClient })`.
      * `[✅]`   Resolve a domain id with a known default association from seed data: `adminClient.from('dialectic_domains').select('id').eq('name', 'Software Development').eq('is_enabled', true).maybeSingle()` — assert domain row exists; bind `domainId`.
      * `[✅]`   Independently query: `adminClient.from('domain_process_associations').select('*').eq('domain_id', domainId).eq('is_default_for_domain', true).single()` — assert no error; bind `expectedRow: DomainProcessAssociationRow`.
      * `[✅]`   Call real `fetchProcessAssociation(deps, {}, { domainId })` — assert `FetchProcessAssociationSuccessReturn`; `result.data.id === expectedRow.id`; every column matches independent query; `result.data.process_template_id === expectedRow.process_template_id`.
      * `[✅]`   Negative integration (optional second test in same file): domain with no default (e.g. resolve `'Financial Analysis'` id from seed if enabled, or insert-enabled domain without default in test setup only if seed guarantees no default) → assert `404` `NOT_FOUND`. If seed state is ambiguous, skip negative case with comment referencing seed migration `20250616153421` (Finance has non-default association only).
      * `[✅]`   Prove handler → real `domain_process_associations` only. Out of scope: `index.ts` dispatch, FE API/store.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: app-service handler (BE).
      * `[✅]`   Deps: inward (`dbClient`, `ServiceError`, `logger`, schema row type, shared guard primitives, local guards).
      * `[✅]`   Provides: outward via `fetchProcessAssociation.provides.ts` (`FetchProcessAssociationResult` consumed by index dispatch; `DomainProcessAssociationRow` / `process_template_id` consumed by API/store after index/API nodes).
      * `[✅]`   No cycles. May be composed by a future optional composite handler (option 1) via injected `FetchProcessAssociationFn` without modifying this package.

    * `[✅]`   `requirements`
      * `[✅]`   Handler signature is `fetchProcessAssociation(deps, params, payload)` with empty `params`, payload `{ domainId }`, and `FetchProcessAssociationResult` union (§7). Observable: interface tests + unit tests use three arguments.
      * `[✅]`   Success returns full `DomainProcessAssociationRow` from `select('*')` with `is_default_for_domain = true` for supplied `domainId`. Observable: unit + integration tests.
      * `[✅]`   Missing default returns `NOT_FOUND` / 404 with no `data`. Observable: unit test (PGRST116) and integration test when seed permits.
      * `[✅]`   Invalid payload returns `VALIDATION_ERROR` / 400. Observable: unit test; `from` not called.
      * `[✅]`   Non-PGRST116 DB failure returns `DB_FETCH_FAILED` / 500. Observable: unit test.
      * `[✅]`   Handler never queries `dialectic_domains` or `dialectic_process_templates`. Observable: unit test `from` spy.
      * `[✅]`   `fetchProcessAssociation.interface.test.ts` does not import guards. Observable: file review.
      * `[✅]`   Contract types and guards live only under `fetchProcessAssociation/`. Observable: file review.
      * `[✅]`   Integration test uses real Postgres via `adminClient` and matches independent `domain_process_associations` query for seeded `Software Development`. Observable: `fetchProcessAssociation.integration.test.ts`.
      * `[✅]`   Index compile/route is explicitly deferred to the index-wiring node (not a requirement of this node).


  * `[✅]`   supabase/functions/dialectic-service/createProject **Accept client-supplied `processTemplateId`; validate default association; remove domain-only template lookup**

    * `[✅]`   `objective`
      * `[✅]`   Pre-project cost preview and `createProject` both need the default `process_template_id` for the selected domain before a project exists. `listDomains` returns full `dialectic_domains` rows only (no association columns). `createProject.ts` (lines 68-81) still resolves the default template server-side today; after FE wiring, the client supplies `processTemplateId` from `DomainProcessAssociationRow.process_template_id` obtained via `fetchProcessAssociation` on domain selection (same association rule as today, different read path).
      * `[✅]`   After `dialectic.api` + store/Create-form consumers call `fetchProcessAssociation` and send `processTemplateId` on FormData, `createProject` must stop discovering the template by `selectedDomainId` alone and instead accept the client-supplied id, validate it against `domain_process_associations`, and insert that id on `dialectic_projects.process_template_id`.
      * `[✅]`   Functional goal: read `processTemplateId` from `FormData` (`payload.get('processTemplateId')`); require a non-empty string after trim; return `{ error, status: 400 }` when missing or not a string (same error-as-value pattern as `selectedDomainId`, lines 64-66).
      * `[✅]`   Functional goal: remove the domain-only default lookup block (lines 68-81) that calls `domain_process_associations` with only `domain_id` + `is_default_for_domain` and assigns `defaultProcessTemplateId` from the result.
      * `[✅]`   Functional goal: validate the supplied id — query `domain_process_associations` with `.eq('domain_id', selectedDomainId)`, `.eq('process_template_id', processTemplateId)`, `.eq('is_default_for_domain', true)`, `.single()`; when the row is missing or the query errors, return `{ error: { message: "Could not find a default process template for the selected domain.", status: 400 } }` (preserve existing user-facing message and status for this failure mode).
      * `[✅]`   Functional goal: on success, set `process_template_id: processTemplateId` on the `dialectic_projects` insert (line 91) and keep all post-insert behavior unchanged (idempotency, file upload, resource upsert, `process_template` join on response).
      * `[✅]`   Functional goal: `dialectic-service/index.ts` dispatch for `createProject` unchanged — still `handlers.createProject` with `FormData`; no new action.
      * `[✅]`   Non-functional: flat handler file (`createProject.ts` + `createProject.test.ts` only). No FE types (owned by `dialectic.api` node). No `listDomains` edits.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   App-service write handler (BE) — project creation with client-supplied default process template id validated against the domain association table.
      * `[✅]`   This node owns exactly `createProject.ts` and `createProject.test.ts`. It does NOT edit `listDomains.ts`, `dialectic-service/index.ts`, `packages/types`, `dialectic.api.ts`, `dialecticStore.ts`, or UI components.
      * `[✅]`   Provides: outward (trusted `process_template_id` on created projects when FE sends the same id `fetchProcessAssociation` returned for that domain).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` project creation.
      * `[✅]`   Inside: FormData parsing for `processTemplateId`, association validation, insert `process_template_id`.
      * `[✅]`   Outside: domain catalog (`listDomains`), template stage fetch (`fetchProcessTemplate`), expected counts, cost ceiling, UI.

    * `[✅]`   `deps`
      * `[✅]`   `SupabaseClient` — provider: `@supabase/supabase-js`; layer: infrastructure; direction: inward; purpose: `domain_process_associations` validation query and `dialectic_projects` insert. Supabase client typing exception applies.
      * `[✅]`   `User`, `FormData`, `FileManagerService`, `assembleChunks`, storage helpers — existing `createProject` deps; unchanged.
      * `[✅]`   HARD dependency: `fetchProcessAssociation` BE + `dialectic.api` + store/Create-form orchestration (FE reads `process_template_id` from the association row before submit). FE `processTemplateId` on FormData is produced by those nodes — this handler assumes that field is present on successful create requests.
      * `[✅]`   No reverse dependencies.

    * `[✅]`   `context_slice`
      * `[✅]`   Input from `FormData`: existing fields unchanged plus required `processTemplateId` (string, non-empty after trim) alongside required `selectedDomainId`.
      * `[✅]`   Validation read: one `domain_process_associations` row proving `(domain_id, process_template_id, is_default_for_domain = true)`.
      * `[✅]`   Output: unchanged `DialecticProject` success shape; `process_template_id` on inserted row equals the supplied `processTemplateId`.

    * `[✅]`   `interaction.spec`
      * `[✅]`   Caller: `dialectic-service/index.ts` `case "createProject"` → `handlers.createProject(formData, ...)` (unchanged).
      * `[✅]`   Upstream: `api.dialectic().createProject(formData)` where `formData` includes `processTemplateId` appended by `dialecticStore.createDialecticProject` (prior node).
      * `[✅]`   Ordering: validate `idempotencyKey`, `projectName`, prompt, `selectedDomainId` as today → read and validate `processTemplateId` → association validation query → project insert and remainder of handler unchanged.
      * `[✅]`   Failure: missing/invalid `processTemplateId` → 400 before insert; association validation failure → 400 with existing default-template message; DB/insert failures unchanged.

    * `[✅]`   dialectic-service/`createProject.test.ts`
      * `[✅]`   Add `processTemplateId: mockProcessTemplateId` to every `formDataValues` object and every manual `formData.append` sequence used on success paths (including the primary success test starting ~line 88).
      * `[✅]`   Update `mockExpectedDbInsert` / insert payload assertions: `process_template_id` on insert equals the `processTemplateId` sent in FormData (not a value only returned from a mocked association lookup).
      * `[✅]`   Replace test `createProject - no default process template found for domain` (lines 572-608): drive failure via validation — e.g. FormData includes `processTemplateId` that does not match a default association for `selectedDomainId`, or association mock returns empty — assert `{ error, status: 400 }` and message `"Could not find a default process template for the selected domain."`.
      * `[✅]`   Append test: `processTemplateId` omitted from FormData → `{ error, status: 400 }` with message requiring `processTemplateId`; no `dialectic_projects` insert.
      * `[✅]`   Append test: `processTemplateId` empty string or whitespace-only → same 400 as missing.
      * `[✅]`   Append test: `processTemplateId` present and association mock returns matching default row → success; `insert` payload `process_template_id` equals supplied id.
      * `[✅]`   Update `fromSpy` / call-order assertions on tests that currently require the first `from` call to be `domain_process_associations` for domain-only discovery (e.g. line 195): first association call is validation with `process_template_id` + `domain_id` + `is_default_for_domain`, not an unfiltered default lookup.
      * `[✅]`   Preserve all unrelated tests (idempotency, file upload, overlay, auth). New/updated cases appended at end where possible.

    * `[✅]`   dialectic-service/`createProject.ts`
      * `[✅]`   After `selectedDomainId` validation (lines 64-66), read `processTemplateId` from `payload.get('processTemplateId')`; if not a non-empty string after trim, return `{ error: { message: "processTemplateId is required and must be a string", status: 400 } }`.
      * `[✅]`   Delete lines 68-81 (domain-only default template lookup and `defaultProcessTemplateId` assignment).
      * `[✅]`   Add association validation query: `from('domain_process_associations').select('process_template_id').eq('domain_id', selectedDomainId).eq('process_template_id', processTemplateId).eq('is_default_for_domain', true).single()`; on error or no row, return `{ error: { message: "Could not find a default process template for the selected domain.", status: 400 } }`.
      * `[✅]`   On insert (line 91), set `process_template_id: processTemplateId` (the trimmed FormData value).
      * `[✅]`   No other behavioral changes to idempotency, prompt file handling, or response mapping.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: app-service handler (BE).
      * `[✅]`   Deps: inward (`dbAdminClient`, existing helpers).
      * `[✅]`   Provides: outward (created projects use client-validated default template id; pairs with `listDomains` read path).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `createProject` returns 400 when `processTemplateId` is missing, empty, or not a string. Observable: unit tests.
      * `[✅]`   `createProject` returns 400 with the existing default-template message when the supplied id is not the default association for `selectedDomainId`. Observable: updated no-default / mismatch test.
      * `[✅]`   Successful create inserts `process_template_id` equal to the FormData `processTemplateId`. Observable: insert payload assertion on primary success test.
      * `[✅]`   Lines 68-81 domain-only lookup removed. Observable: grep `createProject.ts` for the old `defaultProcessTemplateId` lookup block; review shows validation-only association query.
      * `[✅]`   All preserved `createProject.test.ts` cases remain green after FormData fixture updates.

  * `[✅]`   supabase/functions/dialectic-service/index **Wire `listDomains/` and `fetchProcessAssociation/` into service dispatch (after all BE handler nodes)**

    * `[✅]`   `objective`
      * `[✅]`   The `listDomains/` and `fetchProcessAssociation/` packages exist with §7 handlers and `.provides.ts` barrels, but `index.ts` still imports the deleted flat `./listDomains.ts`, types `listDomains` as legacy `{ data?: DialecticDomain[]; error?: ServiceError }`, and has no route for `fetchProcessAssociation`. Until this node lands, the service does not compile after the package nodes and the FE cannot call the new association read.
      * `[✅]`   Functional goal: remove the flat `listDomains` import and `DialecticDomain` type from `index.ts`; import `listDomains` and contract types only from `./listDomains/listDomains.provides.ts` and `fetchProcessAssociation` only from `./fetchProcessAssociation/fetchProcessAssociation.provides.ts` (plus result/guard types from each package `.interface.ts` / `.guard.ts`).
      * `[✅]`   Functional goal: update `ActionHandlers.listDomains` to `ListDomainsFn`; update the existing `case "listDomains"` to build `ListDomainsDeps` with `adminClient`, call `handlers.listDomains(deps, {}, {})`, narrow `ListDomainsResult` with `isListDomainsSuccessReturn` (success → `createSuccessResponse(result.data, result.status, req)`; error → `createErrorResponse` with `result.error` / `result.status`). Preserve public action name `"listDomains"` and no-auth behavior (no `userForJson` gate — same as today lines 330-336).
      * `[✅]`   Functional goal: add `ActionHandlers.fetchProcessAssociation: FetchProcessAssociationFn`; add `case "fetchProcessAssociation"` that reads `requestBody.payload` as `FetchProcessAssociationPayload`, builds `FetchProcessAssociationDeps` with `adminClient`, calls `handlers.fetchProcessAssociation(deps, {}, payload)`, narrows with `isFetchProcessAssociationSuccessReturn` (success → HTTP 200 with full association row; error branches → `createErrorResponse` with handler `status` and `error`). No auth gate (catalog read beside `listDomains`, uses `adminClient`).
      * `[✅]`   Functional goal: add `FetchProcessAssociationAction = { action: "fetchProcessAssociation"; payload: FetchProcessAssociationPayload }` to `DialecticServiceRequest` in `dialectic.interface.ts`, importing `FetchProcessAssociationPayload` from `./fetchProcessAssociation/fetchProcessAssociation.interface.ts`. Leave `ListDomainsAction = { action: "listDomains" }` unchanged (no payload).
      * `[✅]`   Functional goal: register `listDomains` and `fetchProcessAssociation` on `defaultHandlers` (imported fns from `.provides.ts`, not flat files). `createProject` dispatch unchanged (still `FormData` → `handlers.createProject` — owned by `createProject` node).
      * `[✅]`   Non-functional: flat `index.ts` only (no new package folder); preserve every unrelated handler, route, log, and error string. Minimal diff focused on wiring mandated by the three prior BE nodes.
      * `[✅]`   HARD dependency: `listDomains/` node complete (flat files deleted); `fetchProcessAssociation/` node complete; `createProject` node complete (handler signature unchanged at index boundary). Runs immediately before FE `dialectic.api` node. Out of scope: API client, store, UI, `packages/types` (API node owns first FE consumer).
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   Composition root / HTTP dispatch (BE) — sole wiring surface for the new leaf handlers.
      * `[✅]`   This node edits exactly `index.ts`, `dialectic.interface.ts` (`DialecticServiceRequest` union member only), and `index.test.ts`. It does NOT modify handler bodies inside `listDomains/`, `fetchProcessAssociation/`, or `createProject.ts`.
      * `[✅]`   Provides: outward HTTP for `action: "listDomains"` (full `DialecticDomainRow[]`) and `action: "fetchProcessAssociation"` (full `DomainProcessAssociationRow`).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `dialectic-service` composition + routing.
      * `[✅]`   Inside: imports from `.provides.ts`, `ActionHandlers` signatures, adapters/dispatch cases, union member, dispatch tests.
      * `[✅]`   Outside: SQL, guards (except narrow imports), FE transport, store orchestration.

    * `[✅]`   `deps`
      * `[✅]`   `listDomains` (`ListDomainsFn`) — provider: `./listDomains/listDomains.provides.ts`; purpose: enabled-domain catalog.
      * `[✅]`   `fetchProcessAssociation` (`FetchProcessAssociationFn`) — provider: `./fetchProcessAssociation/fetchProcessAssociation.provides.ts`; purpose: default association row for `domainId`.
      * `[✅]`   `ListDomainsDeps`, `ListDomainsParams`, `ListDomainsPayload`, `ListDomainsResult`, `ListDomainsSuccessReturn`, `ListDomainsErrorReturn`, `isListDomainsSuccessReturn` — provider: `listDomains/` package interface + guard files.
      * `[✅]`   `FetchProcessAssociationDeps`, `FetchProcessAssociationParams`, `FetchProcessAssociationPayload`, `FetchProcessAssociationResult`, `FetchProcessAssociationSuccessReturn`, `FetchProcessAssociationErrorReturn`, `isFetchProcessAssociationSuccessReturn` — provider: `fetchProcessAssociation/` package interface + guard files.
      * `[✅]`   `adminClient`, `createSuccessResponse`, `createErrorResponse`, `logger` — existing; reused.
      * `[✅]`   No reverse dependencies.

    * `[✅]`   `context_slice`
      * `[✅]`   `listDomains`: `ListDomainsDeps = { dbClient: adminClient }`; `params`/`payload` `{}`; response body is `ListDomainsSuccessReturn.data` (`DialecticDomainRow[]`).
      * `[✅]`   `fetchProcessAssociation`: `FetchProcessAssociationDeps = { dbClient: adminClient }`; `payload.domainId` from JSON body; response body is `FetchProcessAssociationSuccessReturn.data` (`DomainProcessAssociationRow`).
      * `[✅]`   Remove all references to exported `DialecticDomain` from deleted flat `listDomains.ts`.

    * `[✅]`   `interaction.spec`
      * `[✅]`   `POST { action: "listDomains" }` → `handlers.listDomains` → 200 + `DialecticDomainRow[]` or 500 `DB_FETCH_FAILED`.
      * `[✅]`   `POST { action: "fetchProcessAssociation", payload: { domainId } }` → `handlers.fetchProcessAssociation` → 200 + association row, or 400 `VALIDATION_ERROR`, 404 `NOT_FOUND`, 500 `DB_FETCH_FAILED` per handler union.
      * `[✅]`   Declarative only — no code.

    * `[✅]`   dialectic-service/`dialectic.interface.ts`
      * `[✅]`   Add `type FetchProcessAssociationAction = { action: "fetchProcessAssociation"; payload: FetchProcessAssociationPayload };` importing `FetchProcessAssociationPayload` from `./fetchProcessAssociation/fetchProcessAssociation.interface.ts`.
      * `[✅]`   Add `| FetchProcessAssociationAction` to `DialecticServiceRequest` (with other payload actions). Do not add package contract types to `dialectic.interface.ts` beyond this union member. Types only (exempt RED/GREEN).

    * `[✅]`   dialectic-service/`index.test.ts`
      * `[✅]`   Update `createMockHandlers` default `listDomains` stub to return a valid `ListDomainsSuccessReturn` `{ status: 200, data: [] }` (not legacy `{ data: [] }` optional-error shape).
      * `[✅]`   Add `fetchProcessAssociation` to `createMockHandlers` with default stub returning `FetchProcessAssociationSuccessReturn` (use `buildFetchProcessAssociationSuccessReturn` from package mock or inline full row via factory import in test file only).
      * `[✅]`   Add test: `handleRequest` + `{ action: "listDomains" }` routes to `handlers.listDomains` with `(deps, {}, {})` and returns HTTP 200 with array body on success stub (spy `handlers.listDomains`).
      * `[✅]`   Add test: `listDomains` error stub (`ListDomainsErrorReturn`) → HTTP 500 with `DB_FETCH_FAILED` message path.
      * `[✅]`   Add test: `handleRequest` + `{ action: "fetchProcessAssociation", payload: { domainId: "<uuid>" } }` routes to `handlers.fetchProcessAssociation` with `(deps, {}, payload)` and returns HTTP 200 with association row on success stub.
      * `[✅]`   Add test: `fetchProcessAssociation` error stub (`404` `NOT_FOUND` and `400` `VALIDATION_ERROR`) maps to matching HTTP status via `createErrorResponse`.
      * `[✅]`   Add test: `defaultHandlers.listDomains` and `defaultHandlers.fetchProcessAssociation` are defined (import from `.provides.ts`, not missing after flat file deletion).
      * `[✅]`   One behavior per test; appended at end; use existing harness.

    * `[✅]`   dialectic-service/`index.ts`
      * `[✅]`   Delete `import { listDomains, type DialecticDomain } from './listDomains.ts';`.
      * `[✅]`   Add imports: `listDomains` from `./listDomains/listDomains.provides.ts`; `ListDomainsFn`, `ListDomainsDeps`, `ListDomainsParams`, `ListDomainsPayload`, `ListDomainsResult`, `ListDomainsSuccessReturn`, `ListDomainsErrorReturn` from `./listDomains/listDomains.interface.ts`; `isListDomainsSuccessReturn` from `./listDomains/listDomains.guard.ts`.
      * `[✅]`   Add imports: `fetchProcessAssociation` from `./fetchProcessAssociation/fetchProcessAssociation.provides.ts`; `FetchProcessAssociationFn`, `FetchProcessAssociationDeps`, `FetchProcessAssociationParams`, `FetchProcessAssociationPayload`, `FetchProcessAssociationResult`, `FetchProcessAssociationSuccessReturn`, `FetchProcessAssociationErrorReturn` from `./fetchProcessAssociation/fetchProcessAssociation.interface.ts`; `isFetchProcessAssociationSuccessReturn` from `./fetchProcessAssociation/fetchProcessAssociation.guard.ts`.
      * `[✅]`   Replace `ActionHandlers.listDomains: (dbClient: SupabaseClient) => Promise<{ data?: DialecticDomain[]; error?: ServiceError }>` with `listDomains: ListDomainsFn`.
      * `[✅]`   Add `fetchProcessAssociation: FetchProcessAssociationFn` to `ActionHandlers`.
      * `[✅]`   Replace `case "listDomains"` body with deps/params/payload construction, `handlers.listDomains` call, `isListDomainsSuccessReturn` narrow (mirror `getStageExpectedCounts` case lines 652-670).
      * `[✅]`   Add `case "fetchProcessAssociation":` before or after `listDomains` in the public JSON switch; same narrow pattern; no `userForJson` check.
      * `[✅]`   `defaultHandlers`: `listDomains` and `fetchProcessAssociation` entries point at provides exports; remove any dead import of flat `listDomains.ts`. Do not change `createProject` entry.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: composition root / HTTP dispatch (BE).
      * `[✅]`   Deps: inward (packaged leaf handlers + their interface/guard types).
      * `[✅]`   Provides: outward (HTTP JSON for domain catalog + default association read).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   Service compiles with flat `listDomains.ts` absent and package imports present. Observable: Deno/TS check.
      * `[✅]`   `action: "listDomains"` returns full domain rows via `ListDomainsSuccessReturn` mapping. Observable: dispatch test.
      * `[✅]`   `action: "fetchProcessAssociation"` routes with payload `{ domainId }` and returns association row or handler error status. Observable: dispatch tests.
      * `[✅]`   `DialecticServiceRequest` includes `FetchProcessAssociationAction`. Observable: type-check in new case.
      * `[✅]`   `createProject` case unchanged at index. Observable: grep `case "createProject"` — still FormData handler.
      * `[✅]`   No `DialecticDomain` symbol remains in `index.ts`. Observable: grep.

    * `[✅]`   **Commit** `feat(dialectic): wire listDomains and fetchProcessAssociation dispatch`
      * `[✅]`   Structural: `index.ts` imports package provides; `DialecticServiceRequest` gains `fetchProcessAssociation`; flat `listDomains` import removed.
      * `[✅]`   Behavioral: HTTP actions `listDomains` and `fetchProcessAssociation` return full table rows per package contracts.
      * `[✅]`   Contract: `ActionHandlers` uses `ListDomainsFn` and `FetchProcessAssociationFn`; legacy `DialecticDomain` DTO removed from dispatch layer.

  * `[✅]`   packages/api/src/dialectic.api **Domain rows, default association read, and session-less counts (first FE `@paynless/db-types` consumer)**

    * `[✅]`   `objective`
      * `[✅]`   After the `dialectic-service/index` wiring node, HTTP exposes `action: "listDomains"` (full `DialecticDomainRow[]` body) and `action: "fetchProcessAssociation"` (full `DomainProcessAssociationRow` body for `{ domainId }`). The FE still uses a hand-written `DialecticDomain` interface (partial projection, no `created_at`/`updated_at`) and has no client for the association read — store cannot obtain `process_template_id` after domain selection without inventing a merged DTO on `listDomains`.
      * `[✅]`   Functional goal (row types — first FE consumer): in `packages/types/src/dialectic.types.ts`, add `DialecticDomainRow = Database['public']['Tables']['dialectic_domains']['Row']` and `DomainProcessAssociationRow = Database['public']['Tables']['domain_process_associations']['Row']` using `Database` from `@paynless/db-types` (workspace ref to `types_db`). **Delete** the hand-written `export interface DialecticDomain { ... }`. Replace every remaining `DialecticDomain` reference in that file (`DialecticStateValues.domains`, `selectedDomain`, `setSelectedDomain`, `DialecticApiClient.listDomains`, and any other symbol still named `DialecticDomain`) with `DialecticDomainRow`. No `default_process_template_id` on the domain row; template id comes only from `DomainProcessAssociationRow.process_template_id` after `fetchProcessAssociation`.
      * `[✅]`   Functional goal (`listDomains` transport): change `DialecticApiClient.listDomains()` to `Promise<ApiResponse<DialecticDomainRow[]>>`; keep posting `{ action: 'listDomains' }` to `'dialectic-service'` with `{ isPublic: true }` (unchanged public catalog behavior, `dialectic.api.ts` lines 778-802). Return the typed `ApiResponse` unchanged — HTTP body is the full domain row array from `ListDomainsSuccessReturn.data`. No in-method response guard (same as today).
      * `[✅]`   Functional goal (`fetchProcessAssociation` transport): add `FetchProcessAssociationPayload`: `{ domainId: string }`; add `async fetchProcessAssociation(payload: FetchProcessAssociationPayload): Promise<ApiResponse<DomainProcessAssociationRow>>` posting `{ action: 'fetchProcessAssociation', payload }` to `'dialectic-service'` with the same `try/catch` `NETWORK_ERROR` contract as `fetchProcessTemplate` (`dialectic.api.domain.test.ts` / `dialectic.api.ts` lines 805-826): log, `post`, surface `response.error` (including `404` `NOT_FOUND` from handler), catch → `{ code: 'NETWORK_ERROR', message, status: 0 }`. No `isPublic` flag unless index node later requires auth (match index node: no `userForJson` gate → do not add auth headers beyond default client). Place method immediately after `listDomains` in `dialectic.api.ts` so the call chain reads `listDomains` → `fetchProcessAssociation` → `fetchProcessTemplate(templateId)`.
      * `[✅]`   Functional goal (`getStageExpectedCounts` transport): add `getStageExpectedCounts(payload: GetStageExpectedCountsPayload): Promise<ApiResponse<GetStageExpectedCountsResponse>>` posting `{ action: 'getStageExpectedCounts', payload }`, mirroring `getAllStageProgress` (`dialectic.api.ts` lines 597-622) including `NETWORK_ERROR` handling.
      * `[✅]`   Functional goal (action union): add to `DialecticServiceActionPayload`: `{ action: 'fetchProcessAssociation'; payload: FetchProcessAssociationPayload }`, `{ action: 'getStageExpectedCounts'; payload: GetStageExpectedCountsPayload }`; keep `{ action: 'listDomains'; payload?: undefined }`. Add `GetStageExpectedCountsPayload`, `StageExpectedCount`, `GetStageExpectedCountsResponse` in the same `dialectic.types.ts` edit block as the row aliases (types ride with this node — no standalone types node).
      * `[✅]`   Non-functional: flat `dialectic.api.ts` only (no API package folder). No in-method response guards for any of the three methods (mirror existing list/count/template clients). Does not touch store, hooks, or components.
      * `[✅]`   HARD dependency: `dialectic-service/index` node complete (`listDomains` + `fetchProcessAssociation` routes return full table rows). Runs before `dialecticStore` and Group 5 UI nodes.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   API client adapter (FE transport) — first consumer of `@paynless/db-types` row aliases for domains and associations; wires three edge actions into typed `ApiResponse`s.
      * `[✅]`   This node edits exactly one source file (`dialectic.api.ts`) plus support: `packages/types/src/dialectic.types.ts` (row aliases + action/count types + `DialecticApiClient` signature updates); `mocks/dialectic.api.mock.ts`; `dialectic.api.domain.test.ts` (`listDomains` + `fetchProcessAssociation`); `dialectic.api.documents.test.ts` (`getStageExpectedCounts`); `dialectic.api.integration.test.ts` (transport-boundary cases for new/changed methods as needed).
      * `[✅]`   Does NOT add `expectedCount` to `StageProgressEntry` (Group 3/4). Does NOT implement store orchestration (store node calls these methods after domain selection). Does NOT change `fetchProcessTemplate` signature beyond existing imports.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `@paynless/api` dialectic transport.
      * `[✅]`   Inside: HTTP envelopes, `ApiResponse` typing, `NETWORK_ERROR` paths, FE row aliases from `@paynless/db-types`, removal of legacy `DialecticDomain` interface.
      * `[✅]`   Outside: SQL, BE guards, store state, ceiling math, UI.

    * `[✅]`   `deps`
      * `[✅]`   `this.apiClient.post<..., DialecticServiceActionPayload>` — provider: base `ApiClient`; layer: transport; direction: inward.
      * `[✅]`   `Database`, `DialecticDomainRow`, `DomainProcessAssociationRow`, `FetchProcessAssociationPayload`, `GetStageExpectedCountsPayload`, `GetStageExpectedCountsResponse`, `StageExpectedCount`, `DialecticServiceActionPayload`, `ApiResponse` — provider: `@paynless/types` / `@paynless/db-types` (row aliases defined in `dialectic.types.ts` using `Database` from `@paynless/db-types`); direction: inward.
      * `[✅]`   `logger` — existing api logger; reused.
      * `[✅]`   No reverse dependencies. Depends on `dialectic-service/index` wiring node only among BE work in this chain.

    * `[✅]`   `context_slice`
      * `[✅]`   `listDomains()`: no payload; output `ApiResponse<DialecticDomainRow[]>` (full six domain columns per row).
      * `[✅]`   `fetchProcessAssociation({ domainId })`: output `ApiResponse<DomainProcessAssociationRow>` (full six association columns; `process_template_id` is the field downstream store/UI use for `fetchProcessTemplate` / `getStageExpectedCounts`).
      * `[✅]`   `getStageExpectedCounts({ processTemplateId, modelCount })`: output `ApiResponse<GetStageExpectedCountsResponse>`.
      * `[✅]`   Methods forward payloads verbatim; no merging domain + association in the client.

    * `[✅]`   packages/types/src/`dialectic.types.ts`
      * `[✅]`   Add `export type DialecticDomainRow = Database['public']['Tables']['dialectic_domains']['Row'];`
      * `[✅]`   Add `export type DomainProcessAssociationRow = Database['public']['Tables']['domain_process_associations']['Row'];`
      * `[✅]`   Remove `export interface DialecticDomain { ... }` entirely.
      * `[✅]`   Replace all `DialecticDomain` identifiers in this file with `DialecticDomainRow` (`DialecticStateValues`, `DialecticActions.setSelectedDomain`, `DialecticApiClient.listDomains`, etc.).
      * `[✅]`   Add `FetchProcessAssociationPayload`: `{ domainId: string }`.
      * `[✅]`   Add `GetStageExpectedCountsPayload`, `StageExpectedCount`, `GetStageExpectedCountsResponse` (BE mirror).
      * `[✅]`   Add union members `{ action: 'fetchProcessAssociation'; payload: FetchProcessAssociationPayload }` and `{ action: 'getStageExpectedCounts'; payload: GetStageExpectedCountsPayload }` to `DialecticServiceActionPayload`.
      * `[✅]`   Types only in this file section (exempt from RED/GREEN). No `any`. No `default_process_template_id` anywhere.

    * `[✅]`   packages/api/src/`dialectic.api.domain.test.ts`
      * `[✅]`   **Update** `describe('listDomains')`: import `DialecticDomainRow` (not `DialecticDomain`). Mock rows must include **all** `DialecticDomainRow` fields (`id`, `name`, `description`, `parent_domain_id`, `is_enabled`, `created_at`, `updated_at`) — use fixed ISO strings for timestamps. Keep existing four behaviors (correct POST + `{ isPublic: true }`, success data, server error, network error); assert `result.data` is full rows.
      * `[✅]`   **Append** `describe('fetchProcessAssociation')` mirroring `fetchProcessTemplate` (lines 45-88): POST `{ action: 'fetchProcessAssociation', payload: { domainId } }` to `'dialectic-service'` **without** `{ isPublic: true }` (authenticated default client path, same as `fetchProcessTemplate`); success returns full `DomainProcessAssociationRow` mock (all six columns, `is_default_for_domain: true`); server error (e.g. `404` `NOT_FOUND`) surfaces `response.error`; network reject → `NETWORK_ERROR`. One behavior per test; appended after `listDomains` block.
      * `[✅]`   Use `mockApiClient` harness; production types from `@paynless/types`; no inline parallel DTO types.

    * `[✅]`   packages/api/src/`dialectic.api.documents.test.ts`
      * `[✅]`   Append `getStageExpectedCounts` tests mirroring `getAllStageProgress` (lines 256-344): success posts `{ action: 'getStageExpectedCounts', payload }` and returns `stages`/`totalStages`; server error; `NETWORK_ERROR` on reject. One behavior per test; appended at end.

    * `[✅]`   packages/api/src/`dialectic.api.ts`
      * `[✅]`   Imports: add `DialecticDomainRow`, `DomainProcessAssociationRow`, `FetchProcessAssociationPayload`, `GetStageExpectedCountsPayload`, `GetStageExpectedCountsResponse`; remove `DialecticDomain` import.
      * `[✅]`   Change `listDomains()` return type to `Promise<ApiResponse<DialecticDomainRow[]>>` and generic on `post<DialecticDomainRow[], ...>`; behavior unchanged otherwise.
      * `[✅]`   Add `fetchProcessAssociation(payload)` immediately after `listDomains` (mirror `fetchProcessTemplate` try/catch/logging; `post<DomainProcessAssociationRow, DialecticServiceActionPayload>` with action `fetchProcessAssociation`).
      * `[✅]`   Add `getStageExpectedCounts(payload)` immediately after `getAllStageProgress` (mirror lines 597-622).
      * `[✅]`   Update `DialecticApiClient` class declaration in `@paynless/types` (same node's types file) — not in `dialectic.api.ts` — to list all three signatures.

    * `[✅]`   packages/api/src/mocks/`dialectic.api.mock.ts`
      * `[✅]`   Update `listDomains` mock fn type to `ApiResponse<DialecticDomainRow[]>`.
      * `[✅]`   Add `fetchProcessAssociation` mock fn typed with `FetchProcessAssociationPayload` → `ApiResponse<DomainProcessAssociationRow>`.
      * `[✅]`   Add `getStageExpectedCounts` mock fn typed with `GetStageExpectedCountsPayload` → `ApiResponse<GetStageExpectedCountsResponse>`.
      * `[✅]`   Factory entries beside existing dialectic mocks; `vi.fn` only.

    * `[✅]`   packages/api/src/`dialectic.api.integration.test.ts`
      * `[✅]`   Add transport-boundary case for `fetchProcessAssociation`: assert posted `action`/`payload.domainId` and stubbed full association row returned.
      * `[✅]`   Add transport-boundary case for `getStageExpectedCounts` (mirror `getAllStageProgress` pattern in this file).
      * `[✅]`   Update any `listDomains` integration stub if present to use full `DialecticDomainRow` shape.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: API client adapter (FE transport).
      * `[✅]`   Deps: inward (`ApiClient`, `@paynless/types`, `@paynless/db-types` via row aliases).
      * `[✅]`   Provides: outward (`listDomains`, `fetchProcessAssociation`, `getStageExpectedCounts` consumed by store then UI).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   No `DialecticDomain` interface remains in `@paynless/types`; `DialecticDomainRow` and `DomainProcessAssociationRow` are `Database[...]['Row']` aliases. Observable: grep `interface DialecticDomain` in `dialectic.types.ts` — absent.
      * `[✅]`   `listDomains()` still posts public catalog request; returns `ApiResponse<DialecticDomainRow[]>`. Observable: updated `dialectic.api.domain.test.ts`.
      * `[✅]`   `fetchProcessAssociation({ domainId })` posts correct envelope; returns full association row or surfaces server/network errors. Observable: four tests in `dialectic.api.domain.test.ts`.
      * `[✅]`   `getStageExpectedCounts(payload)` posts correct envelope; returns typed counts response. Observable: `dialectic.api.documents.test.ts`.
      * `[✅]`   `DialecticServiceActionPayload` includes `fetchProcessAssociation` and `getStageExpectedCounts` members. Observable: type-check in `dialectic.api.ts` post calls.
      * `[✅]`   `StageProgressEntry` unchanged. Observable: no edit to that interface in this node.
      * `[✅]`   No merged `default_process_template_id` on domain type. Observable: grep in `packages/types` — absent.

  * `[✅]`   packages/utils/src/computeCostCeiling **Pure cost-ceiling arithmetic: mean-rate estimates, contribution actuals, stageCeilings and projectCeiling (`@paynless/utils`)**

    * `[✅]`   `objective`
      * `[✅]`   The cost-ceiling ticket needs a single, side-effect-free arithmetic function that the session NSF surface and the pre-project preview both consume, so the estimate math lives in exactly one tested place and cannot drift between the two surfaces. Today no such function exists; the ceiling formulas are defined in the ticket intro core math (mean rate over `outputTokenCostRates[]`, contribution sums for completed stages).
      * `[✅]`   Functional goal: implement `computeCostCeiling(deps: ComputeCostCeilingDeps, params: ComputeCostCeilingParams, payload: ComputeCostCeilingPayload): ComputeCostCeilingReturn` where `meanRate = sum(payload.outputTokenCostRates) / payload.outputTokenCostRates.length`. For each stage: if `stage.contributions.length === 0`, `stageCeilings[stageSlug] = stage.expectedCount × payload.maxOutputTokens × meanRate` and `projectCeiling` adds that estimate; if `stage.contributions.length > 0`, `stageCeilings[stageSlug] = Σ (tokensUsedInput × inputTokenCostRate + tokensUsedOutput × outputTokenCostRate)` over contributions and `projectCeiling` adds that sum (including `0` when contributions sum to zero).
      * `[✅]`   Functional goal: the completed-vs-remaining choice is made by an explicit `stage.contributions.length === 0` branch — NEVER a `??`/ternary default — so a completed stage whose real cost is `0` contributes `0` to `projectCeiling` (not its estimate). This is the load-bearing edge: `0` is a valid actual sum, empty `contributions` means "not yet run".
      * `[✅]`   Functional goal: if any step yields `ComputeCostCeilingReturn` with `'error' in result`, return it unchanged — `computeCostCeiling` does not construct, reinterpret, or substitute errors; then run arithmetic on payload. `stages`, `maxOutputTokens`, and `outputTokenCostRates` arrive pre-assembled from Group 4 selectors as `ComputeCostCeilingPayload`.
      * `[✅]`   Non-functional: zero side effects, deterministic, synchronous, and stable under empty input (`stages: []` → `{ stageCeilings: {}, projectCeiling: 0 }`) and zero factors (`maxOutputTokens: 0` or empty `outputTokenCostRates` → all ceilings `0`, never `NaN`).
      * `[✅]`   Non-functional: full mandatory function construction — `interface.test` → `interface` → `interaction.spec` → `guard.test` → `guard` → `mock` → `test` → `construction` → `computeCostCeiling.ts` → `provides` → `integration.test` — colocated in `packages/utils/src/`, exported via `computeCostCeiling.provides.ts`.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   Domain / pure utility in `@paynless/utils` — the single source of cost-ceiling arithmetic; one function per file with the full support system (`computeCostCeiling.interface.ts`, guards, mock, tests, `provides.ts`); consumed by `@paynless/store` via `import { computeCostCeiling } from '@paynless/utils'`.
      * `[✅]`   This node CREATES `computeCostCeiling.ts`, the entire `computeCostCeiling.*` support file set, and one `index.ts` export line. Group 4 `dialecticStore.selectors` assembles payload and calls this function; Group 5 UI reads selector output.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `@paynless/utils` FE cost-estimation arithmetic.
      * `[✅]`   Inside this boundary: mean-rate per-stage estimates, contribution actual sums, `stageCeilings`, and `projectCeiling` aggregation.
      * `[✅]`   Outside this boundary: payload assembly only (Group 4 selectors); UI display (Group 5).
      * `[✅]`   The function reads only `payload` fields.

    * `[✅]`   `deps`
      * `[✅]`   `ComputeCostCeilingDeps`, `ComputeCostCeilingParams`, `ComputeCostCeilingPayload`, `ComputeCostCeilingContributionInput`, `ComputeCostCeilingStageInput`, `ComputeCostCeilingSuccessReturn`, `ComputeCostCeilingErrorReturn`, `ComputeCostCeilingReturn`, `ComputeCostCeilingFn` — provider: `packages/utils/src/computeCostCeiling.interface.ts` (this node); layer: types; direction: inward; purpose: owned function contract (sole definition site).
      * `[✅]`   `isRecord` — provider: `packages/utils/src/dialectic.guard.ts`; layer: utils guard; direction: inward; purpose: guard primitive for owned type guards.
      * `[✅]`   `ApiError` — provider: `@paynless/types` (`api.types.ts`); layer: shared types; direction: inward; purpose: `ComputeCostCeilingErrorReturn.error` shape only (not a cost-ceiling-owned symbol).
      * `[✅]`   Confirm: no reverse dependencies; no `@paynless/store`, no `@paynless/api`, no `@paynless/db-types`; no `@paynless/types` cost-ceiling symbols beyond `ApiError`.

    * `[✅]`   `context_slice`
      * `[✅]`   `ComputeCostCeilingDeps`: `{}`. `ComputeCostCeilingParams`: `{}`. `ComputeCostCeilingPayload`: `{ stages: ComputeCostCeilingStageInput[]; maxOutputTokens: number; outputTokenCostRates: number[]; }` where `ComputeCostCeilingStageInput` is `{ stageSlug: string; expectedCount: number; contributions: ComputeCostCeilingContributionInput[] }` and `ComputeCostCeilingContributionInput` is `{ tokensUsedInput: number; tokensUsedOutput: number; inputTokenCostRate: number; outputTokenCostRate: number }`. **`contributions: []` = incomplete stage.**
      * `[✅]`   Injection shape: `(deps: ComputeCostCeilingDeps, params: ComputeCostCeilingParams, payload: ComputeCostCeilingPayload)`.
      * `[✅]`   Function reads only `payload` fields.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.interface.test.ts`
      * `[✅]`   Contract (truth) test for owned types, asserted through the package guards. Construct a full valid `ComputeCostCeilingContributionInput` (`{ tokensUsedInput: 100, tokensUsedOutput: 200, inputTokenCostRate: 1, outputTokenCostRate: 2 }`) and assert `isComputeCostCeilingContributionInput` accepts it; invalid contribution cases: non-finite `tokensUsedInput`, non-finite `outputTokenCostRate`.
      * `[✅]`   Construct a full valid incomplete `ComputeCostCeilingStageInput` (`{ stageSlug: 's1', expectedCount: 4, contributions: [] }`) and assert `isComputeCostCeilingStageInput` accepts it; construct a completed stage with one contribution row and assert acceptance.
      * `[✅]`   Construct a full valid `ComputeCostCeilingPayload` (`{ stages: [valid stage], maxOutputTokens: 1000, outputTokenCostRates: [3] }`) and assert `isComputeCostCeilingPayload` accepts it; define invalid payload cases that must fail the guard: `{}`; `stages` not an array; `maxOutputTokens` not finite; `outputTokenCostRates` not a non-empty array of finite numbers.
      * `[✅]`   Construct a full valid `ComputeCostCeilingSuccessReturn` (`{ stageCeilings: { s1: 12000 }, projectCeiling: 12000 }`) and assert `isComputeCostCeilingSuccessReturn` accepts it; construct invalid success-return cases: `stageCeilings` not a record; `projectCeiling` not finite.
      * `[✅]`   Construct a full valid `ComputeCostCeilingErrorReturn` by wrapping any object that satisfies `isApiError` as `{ error: thatObject }` and assert `isComputeCostCeilingErrorReturn` accepts it; invalid error cases: missing `error`; `error` fails `isApiError`.
      * `[✅]`   Construct valid empty `{}` for `ComputeCostCeilingDeps` and `ComputeCostCeilingParams`; assert `isComputeCostCeilingDeps` and `isComputeCostCeilingParams` accept them.
      * `[✅]`   Invalid `ComputeCostCeilingStageInput` cases (must fail): empty `stageSlug`; non-finite `expectedCount`; `contributions` not an array; contribution element fails contribution guard. Invariants: `stageSlug` non-empty; `contributions.length === 0` means incomplete; non-empty contributions with sum `0` is valid completed. No mocks. No implementation details.

    * `[✅]`   packages/types/src/`dialectic.types.ts`
      * `[✅]`   Line 189 `RecipeGranularity`: remove `'one_to_many' | 'many_to_one' |`, leaving `'all_to_one' | 'per_source_document' | 'pairwise_by_origin' | 'per_source_group' | 'per_source_document_by_lineage' | 'per_model'` to match the BE `GranularityStrategy` contract (disk line 189 still carries phantoms — edit is mandatory). Types only (exempt from RED/GREEN).

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.interface.ts`
      * `[✅]`   Own the complete function contract here — import `ApiError` from `@paynless/types` for the error return only; no other `@paynless/types` cost-ceiling symbols:
        * `ComputeCostCeilingContributionInput`: `{ tokensUsedInput: number; tokensUsedOutput: number; inputTokenCostRate: number; outputTokenCostRate: number; }`.
        * `ComputeCostCeilingStageInput`: `{ stageSlug: string; expectedCount: number; contributions: ComputeCostCeilingContributionInput[]; }` (`contributions: []` when the stage has not completed; non-empty when completed — utility sums rows).
        * `ComputeCostCeilingDeps`: `{}`.
        * `ComputeCostCeilingParams`: `{}`.
        * `ComputeCostCeilingPayload`: `{ stages: ComputeCostCeilingStageInput[]; maxOutputTokens: number; outputTokenCostRates: number[]; }`.
        * `ComputeCostCeilingSuccessReturn`: `{ stageCeilings: Record<string, number>; projectCeiling: number; }`.
        * `ComputeCostCeilingErrorReturn`: `{ error: ApiError; }`.
        * `ComputeCostCeilingReturn`: `ComputeCostCeilingSuccessReturn | ComputeCostCeilingErrorReturn`.
        * `ComputeCostCeilingFn = (deps: ComputeCostCeilingDeps, params: ComputeCostCeilingParams, payload: ComputeCostCeilingPayload) => ComputeCostCeilingReturn`.
      * `[✅]`   Types only (exempt from RED/GREEN). No inline ad-hoc types; no `any`.

    * `[✅]`   `interaction.spec`
      * `[✅]`   Callers: `selectCostCeiling` and `selectPreProjectCostCeiling` (`dialecticStore.selectors`, Group 4) — assemble `ComputeCostCeilingPayload` from store state; call `computeCostCeiling(deps, params, payload)` imported from `@paynless/utils` **without** pre-guarding with `isComputeCostCeilingPayload`; return the function result unchanged (propagate success or error). Selectors return `null` only when prerequisite state is incomplete (counts/cap/rate absent — selectors node); `null` is not used to swallow function errors.
      * `[✅]`   Required dependency interactions: none at runtime — `ComputeCostCeilingDeps` and `ComputeCostCeilingParams` are empty; no injected services are called inside `computeCostCeiling`.
      * `[✅]`   Input → output: valid path → `ComputeCostCeilingSuccessReturn` (`{ stageCeilings, projectCeiling }`); error path → `ComputeCostCeilingErrorReturn` (`{ error: ApiError }`) returned unchanged; side effects: none; synchronous; no throws.
      * `[✅]`   Failure modes: any step yielding `ComputeCostCeilingErrorReturn` → return unchanged; selectors propagate that result to consumers; Group 5 UI handles `'error' in result`.
      * `[✅]`   Ordering/temporal: none. Declarative only — no code.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.guard.test.ts`
      * `[✅]`   Verify `isComputeCostCeilingContributionInput`, `isComputeCostCeilingStageInput`, `isComputeCostCeilingDeps`, `isComputeCostCeilingParams`, `isComputeCostCeilingPayload`, `isComputeCostCeilingSuccessReturn`, and `isComputeCostCeilingErrorReturn` against every contract case from `computeCostCeiling.interface.test.ts`: no false negatives (every valid contract object passes) and no false positives (every malformed variant is rejected).
      * `[✅]`   Intentionally malformed objects built from `build*` mock factories then overridden to invalid values (typed per the strict-typing exception), not by casting arbitrary literals.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.guard.ts`
      * `[✅]`   Implement `isComputeCostCeilingContributionInput(value: unknown): value is ComputeCostCeilingContributionInput` — `isRecord`; finite number `tokensUsedInput`, `tokensUsedOutput`, `inputTokenCostRate`, `outputTokenCostRate`.
      * `[✅]`   Implement `isComputeCostCeilingStageInput(value: unknown): value is ComputeCostCeilingStageInput` — `isRecord`; non-empty string `stageSlug`; finite number `expectedCount`; `Array.isArray(contributions)` and every element `isComputeCostCeilingContributionInput`.
      * `[✅]`   Implement `isComputeCostCeilingDeps(value: unknown): value is ComputeCostCeilingDeps` — `isRecord` with no required keys.
      * `[✅]`   Implement `isComputeCostCeilingParams(value: unknown): value is ComputeCostCeilingParams` — `isRecord` with no required keys.
      * `[✅]`   Implement `isComputeCostCeilingPayload(value: unknown): value is ComputeCostCeilingPayload` — `isRecord`; `Array.isArray(stages)` and every element `isComputeCostCeilingStageInput`; finite `maxOutputTokens`; `outputTokenCostRates` is a non-empty array and every element is a finite number.
      * `[✅]`   Implement `isComputeCostCeilingSuccessReturn(value: unknown): value is ComputeCostCeilingSuccessReturn` — `isRecord`; `stageCeilings` is a record with finite number values; finite `projectCeiling`.
      * `[✅]`   Implement `isComputeCostCeilingErrorReturn(value: unknown): value is ComputeCostCeilingErrorReturn` — `isRecord`; `isApiError(value['error'])`.
      * `[✅]`   Import `isRecord` from `../dialectic.guard`; import `isApiError` from `../type_guards`. Guards must accept all valid contract cases and reject all invalid contract cases.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.mock.ts`
      * `[✅]`   Per `.cursor/commands/mock.md`: provide `build*` builders with defaults and per-field overrides for each owned signature element — `ComputeCostCeilingDeps`, `ComputeCostCeilingParams`, `ComputeCostCeilingContributionInput`, `ComputeCostCeilingStageInput`, `ComputeCostCeilingPayload`, `ComputeCostCeilingSuccessReturn`, `ComputeCostCeilingErrorReturn`.
      * `[✅]`   `buildComputeCostCeilingDeps(overrides?)` → `{}`; `buildComputeCostCeilingParams(overrides?)` → `{}`; `buildComputeCostCeilingContributionInput(overrides?)` → `{ tokensUsedInput: 100, tokensUsedOutput: 200, inputTokenCostRate: 1, outputTokenCostRate: 2 }`; `buildComputeCostCeilingStageInput(overrides?)` → `{ stageSlug: 's1', expectedCount: 4, contributions: [] }`; `buildComputeCostCeilingPayload(overrides?)` → `{ stages: [buildComputeCostCeilingStageInput()], maxOutputTokens: 1000, outputTokenCostRates: [3] }`; `buildComputeCostCeilingSuccessReturn(overrides?)` → `{ stageCeilings: { s1: 12000 }, projectCeiling: 12000 }`; `buildComputeCostCeilingErrorReturn(overrides?)` → `{ error: … }` where default `error` is any minimal object satisfying `isApiError`, mergeable via `overrides` (including `overrides.error`); no cost-ceiling-specific `code` or `message` in defaults.
      * `[✅]`   Export `createMockComputeCostCeilingFn()` returning a `ComputeCostCeilingFn` that records `(deps, params, payload)` at call time and returns `buildComputeCostCeilingSuccessReturn()` unless the caller overrides the mock return via the factory pattern. Conforms to `interface` and `interaction.spec`; mocks owned symbols only.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.test.ts`
      * `[✅]`   Vitest unit test importing `computeCostCeiling` from `./computeCostCeiling` and using `build*` from `./computeCostCeiling.mock.ts`; validate behavior against `requirements` and `interaction.spec`; one behavior per test; appended at the end. Do NOT re-test type shape or guard correctness.
      * `[✅]`   Test (per-stage estimate): `buildComputeCostCeilingPayload({ stages: [buildComputeCostCeilingStageInput({ stageSlug: 's1', expectedCount: 4, contributions: [] })], maxOutputTokens: 1000, outputTokenCostRates: [3] })` → `stageCeilings.s1 === 12000` and `projectCeiling === 12000`.
      * `[✅]`   Test (all remaining): `s1` `{ expectedCount: 2, contributions: [] }` + `s2` `{ expectedCount: 3, contributions: [] }`, `maxOutputTokens: 1000`, `outputTokenCostRates: [2]` → `stageCeilings.s1 === 4000`, `stageCeilings.s2 === 6000`, `projectCeiling === 10000`.
      * `[✅]`   Test (two-model mean rate): one stage `{ expectedCount: 4, contributions: [] }`, `maxOutputTokens: 1000`, `outputTokenCostRates: [2, 3]` → `stageCeilings.s1 === 10000` and `projectCeiling === 10000` (mean rate `2.5`, not max `3`).
      * `[✅]`   Test (mixed actual + estimate): `s1` `{ expectedCount: 4, contributions: [buildComputeCostCeilingContributionInput({ tokensUsedInput: 100, tokensUsedOutput: 200, inputTokenCostRate: 1, outputTokenCostRate: 2 })] }` (sum `500`) + `s2` `{ expectedCount: 3, contributions: [] }`, `maxOutputTokens: 1000`, `outputTokenCostRates: [3]` → `stageCeilings.s1 === 500`, `stageCeilings.s2 === 9000`, `projectCeiling === 9500`.
      * `[✅]`   Test (zero actual is honored, not defaulted): `s1` `{ expectedCount: 4, contributions: [buildComputeCostCeilingContributionInput({ tokensUsedInput: 0, tokensUsedOutput: 0, inputTokenCostRate: 1, outputTokenCostRate: 2 })] }` + `s2` `{ expectedCount: 1, contributions: [] }`, `maxOutputTokens: 1000`, `outputTokenCostRates: [3]` → `projectCeiling === 3000` (not `12000`), proving the `contributions.length === 0` discriminator for incomplete stages only.
      * `[✅]`   Test (empty input): `stages: []` → `{ stageCeilings: {}, projectCeiling: 0 }`.
      * `[✅]`   Test (zero factors): `maxOutputTokens: 0` with pending stages → every `stageCeilings` value is `0`, `projectCeiling === 0`, no `NaN`.
      * `[✅]`   Test (invalid payload): malformed payload (e.g. `{}` or `stages` not an array) → `'error' in result` and `isApiError(result.error)`.

    * `[✅]`   `construction`
      * `[✅]`   Entrypoint: the bare pure function `computeCostCeiling(deps, params, payload)`; no class, no state, no partially-constructed instance. Required at call time: `deps: ComputeCostCeilingDeps` (empty object), `params: ComputeCostCeilingParams` (empty object), `payload: ComputeCostCeilingPayload`.
      * `[✅]`   Enforce: no partially constructed instances; no defaults and no internal fallback values inside the function.
      * `[✅]`   Invalid construction contexts: external consumers importing from `./computeCostCeiling` instead of `@paynless/utils` / `computeCostCeiling.provides.ts`.
      * `[✅]`   Initialization order: callers do not pre-guard; if any internal step yields `'error' in result`, return that result before arithmetic.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.ts`
      * `[✅]`   Implement `export function computeCostCeiling(deps: ComputeCostCeilingDeps, params: ComputeCostCeilingParams, payload: ComputeCostCeilingPayload): ComputeCostCeilingReturn`: for each step that may yield `ComputeCostCeilingReturn`, if `'error' in stepResult`, return `stepResult` unchanged; `computeCostCeiling` does not construct, reinterpret, or substitute `ApiError` inline; validate payload via guard — on failure return `{ error: … }`; after validation succeeds, compute `meanRate = sum(outputTokenCostRates) / outputTokenCostRates.length`; initialize `const stageCeilings: Record<string, number> = {};` and `let projectCeiling: number = 0;`; for each `stage` of `payload.stages`, if `stage.contributions.length === 0`, compute `estimate = stage.expectedCount * payload.maxOutputTokens * meanRate`, set `stageCeilings[stage.stageSlug] = estimate`, `projectCeiling += estimate`; else compute `actual = Σ (tokensUsedInput × inputTokenCostRate + tokensUsedOutput × outputTokenCostRate)` over contributions, set `stageCeilings[stage.stageSlug] = actual`, `projectCeiling += actual`; return `{ stageCeilings, projectCeiling }`.
      * `[✅]`   Import contract types from `./computeCostCeiling.interface.ts`; import from `./computeCostCeiling.guard.ts` as required by steps. One function in the file; explicit `stage.contributions.length === 0` branch for the incomplete/complete choice.

    * `[✅]`   packages/utils/src/computeCostCeiling/`computeCostCeiling.provides.ts`
      * `[✅]`   External boundary barrel (sole sanctioned re-export point): export `computeCostCeiling`; contract types (`ComputeCostCeilingDeps`, `ComputeCostCeilingParams`, `ComputeCostCeilingContributionInput`, `ComputeCostCeilingStageInput`, `ComputeCostCeilingPayload`, `ComputeCostCeilingSuccessReturn`, `ComputeCostCeilingErrorReturn`, `ComputeCostCeilingReturn`, `ComputeCostCeilingFn`); guards (`isComputeCostCeilingContributionInput`, `isComputeCostCeilingStageInput`, `isComputeCostCeilingDeps`, `isComputeCostCeilingParams`, `isComputeCostCeilingPayload`, `isComputeCostCeilingSuccessReturn`, `isComputeCostCeilingErrorReturn`); mock builders and `createMockComputeCostCeilingFn`.
      * `[✅]`   Stability guarantees: synchronous; pure; deterministic; no throws.
      * `[✅]`   Semantic guarantees: incomplete stages — `stageCeilings[slug] = expectedCount × maxOutputTokens × meanRate`; complete stages — `stageCeilings[slug] = contribution sum`; `projectCeiling` uses `contributions.length === 0` vs non-empty discriminator; empty `stages` returns zero totals.
      * `[✅]`   No external access bypasses this file.

    * `[✅]`   packages/utils/src/`index.ts`
      * `[✅]`   Add `export * from './computeCostCeiling.provides';` beside the existing util exports. Do not change other export lines.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: domain (pure FE utility in the utils workspace).
      * `[✅]`   Deps: inward (`computeCostCeiling.interface.ts` owned types; `ApiError` from `@paynless/types`; `isRecord` from `dialectic.guard.ts`; `isApiError` from `type_guards.ts`).
      * `[✅]`   Provides: outward via `computeCostCeiling.provides.ts` → `index.ts` → `@paynless/utils` (consumed by `dialecticStore.selectors`, then NSF and pre-project UI in Group 5).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `computeCostCeiling(deps, params, payload)` uses separate `Deps`/`Params`/`Payload` (no blob). Observable: `computeCostCeiling.interface.ts` and `computeCostCeiling.ts` signatures.
      * `[✅]`   Incomplete per-stage `stageCeilings[stageSlug]` equals `expectedCount × maxOutputTokens × meanRate` where `meanRate = sum(outputTokenCostRates) / outputTokenCostRates.length`. Observable: `computeCostCeiling.test.ts` per-stage and two-model mean cases.
      * `[✅]`   Complete per-stage `stageCeilings[stageSlug]` equals the contribution sum for that stage. Observable: `computeCostCeiling.test.ts` mixed case (`stageCeilings.s1 === 500`).
      * `[✅]`   `projectCeiling` sums contribution totals for completed stages and mean-rate estimates for incomplete stages. Observable: `computeCostCeiling.test.ts` mixed case (`projectCeiling === 9500`).
      * `[✅]`   A completed stage whose contributions sum to `0` contributes `0`, not its estimate. Observable: `computeCostCeiling.test.ts` zero-actual case (`projectCeiling === 3000`).
      * `[✅]`   Empty `stages` and zero factors produce well-formed, `NaN`-free zero results. Observable: `computeCostCeiling.test.ts` empty-input and zero-factor cases.
      * `[✅]`   `'error' in result` → return unchanged (pass-through). Observable: `computeCostCeiling.test.ts` invalid-payload case; `computeCostCeiling.integration.test.ts` invalid-payload case.
      * `[✅]`   The function reads nothing beyond `payload`. Observable: review — `computeCostCeiling.ts` imports `./computeCostCeiling.interface.ts` and `./computeCostCeiling.guard.ts` only.
      * `[✅]`   `computeCostCeiling` is exported from `@paynless/utils` via `computeCostCeiling.provides.ts`. Observable: `computeCostCeiling.integration.test.ts` package import; grep `packages/utils/src/index.ts`.
      * `[✅]`   Producer → function → consumer chain works. Observable: `computeCostCeiling.integration.test.ts`.
      * `[✅]`   `RecipeGranularity` no longer contains `one_to_many`/`many_to_one`. Observable: grep `dialectic.types.ts` line 189; FE set matches BE `GranularityStrategy`.

  * `[✅]`   packages/store/src/dialecticStore **Domain rows, default association fetch, expected-counts state, and pre-project count action**

    * `[✅]`   `objective`
      * `[✅]`   After the `dialectic.api` node, `listDomains()` returns `DialecticDomainRow[]` and `fetchProcessAssociation({ domainId })` returns `DomainProcessAssociationRow` (`@paynless/db-types` row aliases — no hand-written `DialecticDomain`, no `default_process_template_id` on the domain row). The store still types `domains` / `selectedDomain` as legacy partial `DialecticDomain` and has no association fetch — pre-project cost preview cannot obtain `process_template_id` for `fetchProcessTemplate` / `getStageExpectedCounts` after domain selection.
      * `[✅]`   The selector that derives the dynamic cost ceiling (next node, `dialecticStore.selectors.ts`) needs per-stage expected job counts in two contexts: (a) **post-project** — authoritative counts on `GetAllStageProgressResponse.stages[].expectedCount`; (b) **pre-project** — via `api.dialectic().getStageExpectedCounts(...)` with `processTemplateId` taken from `selectedDomainProcessAssociation.process_template_id` after `fetchProcessAssociation`, never from `DialecticDomainRow`. Neither count source has store state today.
      * `[✅]`   Why a run-keyed map and NOT a field on `StageRunProgressSnapshot`: snapshots are built at sites without counts (`dialecticStore.documents.ts:1724`, `dialecticStore.ts:636`, notification job upserts). Mirror `dagProgressByRun` (`dialectic.types.ts:409`, `dialecticStore.ts:209`, populated only in `hydrateAllStageProgressLogic` at `dialecticStore.documents.ts:1847`). Absent counts ⇒ selector returns `null`, never a fabricated zero.
      * `[✅]`   Functional goal (domain catalog): update `fetchDomains` to store `response.data` as `DialecticDomainRow[]` when every element passes `isDialecticDomainRow`; on API error, network failure, or invalid row shape → `domains: []` and `domainsError` set (mirror existing paths). No merged template field on domain rows.
      * `[✅]`   Functional goal (association): add `selectedDomainProcessAssociation: DomainProcessAssociationRow | null`, `isLoadingDomainProcessAssociation: boolean`, and `domainProcessAssociationError: ApiError | null` to `DialecticStateValues`, initialized `null` / `false` / `null`. Add `fetchProcessAssociation: (payload: FetchProcessAssociationPayload) => Promise<void>` calling `api.dialectic().fetchProcessAssociation(payload)`; mirror `fetchProcessTemplate` loading/error handling. On success validate `response.data` with `isDomainProcessAssociationRow` and require `data.is_default_for_domain === true` and `data.domain_id === payload.domainId` before storing the full row; on API error or failed validation leave `selectedDomainProcessAssociation` `null` and set `domainProcessAssociationError`. No fallback, no partial row, no invented `process_template_id`.
      * `[✅]`   Functional goal (domain selection reset): update `setSelectedDomain(domain: DialecticDomainRow | null)` so every call clears pre-project association-dependent state: `selectedDomainProcessAssociation: null`, `domainProcessAssociationError: null`, `isLoadingDomainProcessAssociation: false`, `preProjectStageExpectedCounts: null`, `stageExpectedCountsError: null`, `isLoadingStageExpectedCounts: false`. Does **not** invoke `fetchProcessAssociation` (callers orchestrate — see `interaction.spec`). Does not clear `currentProcessTemplate` (post-project / separate flows).
      * `[✅]`   Functional goal (post-project counts): add `stageExpectedCountsByRun: Record<string, Record<string, number>>` beside `dagProgressByRun`; **declare and initialize only** — `dialecticStore.documents` populates it.
      * `[✅]`   Functional goal (pre-project counts): add `preProjectStageExpectedCounts`, `isLoadingStageExpectedCounts`, `stageExpectedCountsError`; add `fetchStageExpectedCounts` mirroring `fetchProcessTemplate`; validate with `isGetStageExpectedCountsResponse`; store only `response.data.stages` on success. Callers pass `{ processTemplateId: selectedDomainProcessAssociation.process_template_id, modelCount }` — if association is `null`, callers must not invoke `fetchStageExpectedCounts`.
      * `[✅]`   Functional goal (guards in `@paynless/utils` `dialectic.guard.ts`): `isDialecticDomainRow`, `isDomainProcessAssociationRow`, `isStageExpectedCount`, `isGetStageExpectedCountsResponse` — financial-path responses rejected when invalid; import row/count types from `@paynless/types` only.
      * `[✅]`   Non-functional: edits `dialecticStore.ts`, `dialectic.types.ts` (state + actions only — `DialecticDomainRow` / `DomainProcessAssociationRow` aliases owned by `dialectic.api` node), `dialectic.guard.ts`, `dialecticStore.test.ts`, `dialecticStore.domain.test.ts`, `dialecticStore.mock.ts`. Does not touch BE, `dialectic.api.ts`, UI components, selectors, or `dialecticStore.documents` hydration.
      * `[✅]`   HARD dependency: `packages/api/src/dialectic.api` node complete (`DialecticDomainRow`, `DomainProcessAssociationRow`, `listDomains`, `fetchProcessAssociation`, `getStageExpectedCounts`). Runs before `dialecticStore.selectors` and Group 5 UI nodes.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   FE store state + actions (`dialecticStore.ts`) and FE response guards (`@paynless/utils` `dialectic.guard.ts`).
      * `[✅]`   This node wires the **two-table** pre-project read path in the store (domain list rows + per-selection association row), expected-counts state/actions, and guards. It updates `fetchDomains` / `setSelectedDomain` to consume `DialecticDomainRow`. It does NOT populate `stageExpectedCountsByRun` (`dialecticStore.documents`), compute ceilings (`computeCostCeiling`), derive ceilings (`dialecticStore.selectors`), or implement Create-form / chat-button orchestration (Group 5 — those components call the actions in order documented below).
      * `[✅]`   Out of scope: BE handlers; API transport implementation; `fetchProcessTemplate` body changes; `createProject` FormData (separate node); selector math.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `@paynless/store` dialectic module (`dialecticStore.ts`), store-owned slices of `@paynless/types` (`dialectic.types.ts` state/actions), `@paynless/utils` guards (`dialectic.guard.ts`).
      * `[✅]`   Inside: association + expected-count state/actions; domain-list/selection typing alignment; FE guards for association/count/domain-row API responses.
      * `[✅]`   Outside: SQL, index dispatch, API client methods (prior node), ceiling arithmetic, UI call sequencing beyond documented contract.

    * `[✅]`   `deps`
      * `[✅]`   `DialecticDomainRow`, `DomainProcessAssociationRow`, `FetchProcessAssociationPayload`, `GetStageExpectedCountsPayload`, `StageExpectedCount`, `GetStageExpectedCountsResponse`, `ApiError` — provider: `@paynless/types` (`dialectic.types.ts`; row aliases from `@paynless/db-types` added by `dialectic.api` node); direction: inward; never re-export from store.
      * `[✅]`   `api.dialectic().listDomains`, `api.dialectic().fetchProcessAssociation`, `api.dialectic().getStageExpectedCounts` — provider: `@paynless/api`; direction: inward.
      * `[✅]`   `isRecord` — provider: `@paynless/utils` `dialectic.guard.ts`; direction: inward.
      * `[✅]`   No reverse dependencies. Precedes `dialecticStore.documents` and `dialecticStore.selectors`.

    * `[✅]`   `context_slice`
      * `[✅]`   `fetchDomains`: stores validated `DialecticDomainRow[]` only.
      * `[✅]`   `fetchProcessAssociation({ domainId })`: stores one validated `DomainProcessAssociationRow` or leaves `selectedDomainProcessAssociation` null on failure.
      * `[✅]`   `fetchStageExpectedCounts({ processTemplateId, modelCount })`: stores validated `StageExpectedCount[]` in `preProjectStageExpectedCounts` only.
      * `[✅]`   Post-project: `stageExpectedCountsByRun[runKey][stageSlug]` — written later by documents node; read later by selector.
      * `[✅]`   Pre-project caller order (declarative — Group 5 / chat button implement): `setSelectedDomain(domainRow)` → `fetchProcessAssociation({ domainId: domainRow.id })` → on success `fetchProcessTemplate(association.process_template_id)` and `fetchStageExpectedCounts({ processTemplateId: association.process_template_id, modelCount })`. On association `404`/`error`, do not call template or counts; show no cost preview.

    * `[✅]`   `interaction.spec`
      * `[✅]`   `fetchDomains` unchanged transport (`listDomains` public catalog); success persists full domain rows or rejects entire list on any invalid element.
      * `[✅]`   `setSelectedDomain` synchronous; clears association + pre-project count state whenever selection changes.
      * `[✅]`   `fetchProcessAssociation` async; loading flag; success stores full association row; failure leaves association null and sets `domainProcessAssociationError` (including handler `404` `NOT_FOUND`).
      * `[✅]`   `fetchStageExpectedCounts` async; independent of `fetchProcessAssociation` except callers must supply `processTemplateId` from stored association row.
      * `[✅]`   Declarative only — no code.

    * `[✅]`   packages/types/src/`dialectic.types.ts`
      * `[✅]`   **Consume** `DialecticDomainRow` / `DomainProcessAssociationRow` already defined by `dialectic.api` node (`domains`, `selectedDomain`, `setSelectedDomain` — do not re-define row aliases here).
      * `[✅]`   In `DialecticStateValues` (beside `domains` / `selectedDomain`): add `selectedDomainProcessAssociation: DomainProcessAssociationRow | null;`, `isLoadingDomainProcessAssociation: boolean;`, `domainProcessAssociationError: ApiError | null;`.
      * `[✅]`   In `DialecticStateValues` (beside `dagProgressByRun`, ~409): add `stageExpectedCountsByRun: Record<string, Record<string, number>>;`, `preProjectStageExpectedCounts: StageExpectedCount[] | null;`, `isLoadingStageExpectedCounts: boolean;`, `stageExpectedCountsError: ApiError | null;`.
      * `[✅]`   In `DialecticActions`: add `fetchProcessAssociation: (payload: FetchProcessAssociationPayload) => Promise<void>;` and `fetchStageExpectedCounts: (payload: GetStageExpectedCountsPayload) => Promise<void>;`.
      * `[✅]`   Types only (exempt RED/GREEN). No `default_process_template_id`. No new row aliases in this node.

    * `[✅]`   utils/`dialectic.guard.test.ts`
      * `[✅]`   Append `describe('isDialecticDomainRow')`: passing full six-field row (`id`, `name`, `description`, `parent_domain_id`, `is_enabled`, `created_at`, `updated_at`); failing partial row (missing `created_at`), empty `id`, wrong `is_enabled` type.
      * `[✅]`   Append `describe('isDomainProcessAssociationRow')`: passing full row with `is_default_for_domain: true`; failing `is_default_for_domain: false`, missing `process_template_id`, empty `domain_id`.
      * `[✅]`   Append `describe('isStageExpectedCount')` and `describe('isGetStageExpectedCountsResponse')` (unchanged intent from prior draft).
      * `[✅]`   Valid objects from `@paynless/types`; invalid via factory-then-override per strict-typing exception. One behavior per test; appended at end.

    * `[✅]`   utils/`dialectic.guard.ts`
      * `[✅]`   Add `isDialecticDomainRow`: `isRecord`; non-empty `id`/`name`; `description` string|null; `parent_domain_id` string|null; `typeof is_enabled === 'boolean'`; non-empty `created_at`/`updated_at`.
      * `[✅]`   Add `isDomainProcessAssociationRow`: `isRecord`; non-empty `id`/`domain_id`/`process_template_id`; `is_default_for_domain === true`; non-empty `created_at`/`updated_at`.
      * `[✅]`   Add `isStageExpectedCount` and `isGetStageExpectedCountsResponse` (as prior draft).
      * `[✅]`   Import `DialecticDomainRow`, `DomainProcessAssociationRow`, `StageExpectedCount`, `GetStageExpectedCountsResponse` from `@paynless/types`. Reuse `isRecord`. No `any`, no casts.

    * `[✅]`   packages/store/src/`dialecticStore.domain.test.ts`
      * `[✅]`   Update fixtures: `DialecticDomainRow` with all six columns (`is_enabled: true`, fixed ISO `created_at`/`updated_at`). Remove `DialecticDomain` import.
      * `[✅]`   Update `fetchDomains` tests to expect full rows; add case: API returns array with one invalid element → `domains` `[]` and `domainsError` set (invalid catalog rejected).
      * `[✅]`   Update `setSelectedDomain` test: after `setSelectedDomain(row)`, assert `selectedDomainProcessAssociation` is `null` and `preProjectStageExpectedCounts` is `null` (reset on selection).
      * `[✅]`   Append `describe('fetchProcessAssociation')`: success stores full `DomainProcessAssociationRow`; API error leaves association `null`; invalid row shape leaves association `null` and sets error; loading toggles `isLoadingDomainProcessAssociation`.
      * `[✅]`   Use `api` mock from `@paynless/api/mocks`; production types only; one behavior per test; appended at end.

    * `[✅]`   packages/store/src/`dialecticStore.test.ts`
      * `[✅]`   Initial-state test: `stageExpectedCountsByRun` `{}`; `selectedDomainProcessAssociation` `null`; `isLoadingDomainProcessAssociation` `false`; `domainProcessAssociationError` `null`; `preProjectStageExpectedCounts` `null`; `isLoadingStageExpectedCounts` `false`; `stageExpectedCountsError` `null`.
      * `[✅]`   `fetchStageExpectedCounts` success / API-error / invalid-data / loading tests (as prior draft).
      * `[✅]`   Append test: `setSelectedDomain` after association was stored clears `selectedDomainProcessAssociation` and `preProjectStageExpectedCounts`.
      * `[✅]`   New cases appended at end; existing unrelated tests remain green.

    * `[✅]`   packages/store/src/`dialecticStore.ts`
      * `[✅]`   Initial state (beside `dagProgressByRun: {}`, ~209): add `selectedDomainProcessAssociation: null,`, `isLoadingDomainProcessAssociation: false,`, `domainProcessAssociationError: null,`, `stageExpectedCountsByRun: {},`, `preProjectStageExpectedCounts: null,`, `isLoadingStageExpectedCounts: false,`, `stageExpectedCountsError: null,`.
      * `[✅]`   `fetchDomains`: after `listDomains` response, if `response.error` or network catch — unchanged empty/error paths; on success require `Array.isArray(response.data)` and `response.data.every(isDialecticDomainRow)` else set `domainsError` `{ code: 'INVALID_RESPONSE', message: '...' }` and `domains: []`; else `set({ domains: response.data, ... })`.
      * `[✅]`   `setSelectedDomain(domain: DialecticDomainRow | null)`: `set({ selectedDomain: domain, selectedDomainProcessAssociation: null, domainProcessAssociationError: null, isLoadingDomainProcessAssociation: false, preProjectStageExpectedCounts: null, stageExpectedCountsError: null, isLoadingStageExpectedCounts: false })`.
      * `[✅]`   `fetchProcessAssociation(payload)`: mirror `fetchProcessTemplate` pattern — loading/error; validate with `isDomainProcessAssociationRow`; assert `data.domain_id === payload.domainId`; store full row or leave null on failure.
      * `[✅]`   `fetchStageExpectedCounts(payload)`: as prior draft with `isGetStageExpectedCountsResponse`.
      * `[✅]`   Imports: `DialecticDomainRow`, `DomainProcessAssociationRow`, `FetchProcessAssociationPayload`, `GetStageExpectedCountsPayload`, guards from `@paynless/utils`. Remove `DialecticDomain` import if present. No `as`, no defaulting of template id or counts.

    * `[✅]`   apps/web/src/mocks/`dialecticStore.mock.ts`
      * `[✅]`   Mock initial state: association fields + expected-count fields (same defaults as `dialecticStore.ts` initial state).
      * `[✅]`   Action mocks: `fetchProcessAssociation: vi.fn().mockResolvedValue(undefined),`, `fetchStageExpectedCounts: vi.fn().mockResolvedValue(undefined),` beside `fetchProcessTemplate`.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: store (FE state/actions) + shared guards (`@paynless/utils`).
      * `[✅]`   Deps: inward (`@paynless/types`, `@paynless/api`, guards).
      * `[✅]`   Provides: outward (`DialecticDomainRow[]` catalog; `DomainProcessAssociationRow` for template id; `preProjectStageExpectedCounts` + `stageExpectedCountsByRun` for selectors; actions consumed by Group 5).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `fetchDomains` stores only validated `DialecticDomainRow[]`. Observable: `dialecticStore.domain.test.ts`.
      * `[✅]`   `fetchProcessAssociation` stores only a validated default association row for the requested `domainId`, or leaves null on failure. Observable: domain test suite.
      * `[✅]`   `setSelectedDomain` clears association and pre-project count state on every selection change. Observable: domain + store tests.
      * `[✅]`   `fetchStageExpectedCounts` stores only validated `stages` on success; null on API/validation failure. Observable: `dialecticStore.test.ts`.
      * `[✅]`   Guards reject invalid domain rows, non-default association rows, and invalid count payloads. Observable: `dialectic.guard.test.ts`.
      * `[✅]`   No `default_process_template_id` on domain state; template id read only from `selectedDomainProcessAssociation.process_template_id`. Observable: grep store + types.
      * `[✅]`   `stageExpectedCountsByRun` declared, initialized `{}`, not populated in this node. Observable: review + documents node owns population.
      * `[✅]`   `dagProgressByRun`, `stageRunProgress`, and unrelated fetch actions behavior unchanged aside from typed domain list/selection. Observable: existing store tests remain green.

  * `[✅]`   packages/store/src/dialecticStore.documents **Populate `stageExpectedCountsByRun` from authoritative `getAllStageProgress` hydration; mirror the BE `expectedCount` onto the FE `StageProgressEntry`**

    * `[✅]`   `objective`
      * `[✅]`   **Post-project only.** Pre-project template id and per-stage counts use a separate path: `fetchProcessAssociation({ domainId })` → `DomainProcessAssociationRow.process_template_id` → `fetchStageExpectedCounts` → `preProjectStageExpectedCounts` (owned by the `packages/store/src/dialecticStore` node and Group 5 orchestration). This node does not call `fetchProcessAssociation`, does not read `listDomains` / `DialecticDomainRow`, and does not merge `process_template_id` onto domain rows.
      * `[✅]`   The `packages/store/src/dialecticStore` node declared and initialized `stageExpectedCountsByRun: Record<string, Record<string, number>>` to `{}`, but nothing populates it. The authoritative source of **post-project** per-stage counts is `GetAllStageProgressResponse.stages[].expectedCount` — the BE `getAllStageProgress` node adds `expectedCount: number` to the BE `StageProgressEntry` (`dialectic.interface.ts:1002-1011`), populated from `StageCountsEntry.totalExpected` and guarded as a finite non-negative integer by `isStageProgressEntry`. The FE mirror type `StageProgressEntry` (`dialectic.types.ts:1255-1264`) does not yet carry `expectedCount`, so `hydrateAllStageProgressLogic` (`dialecticStore.documents.ts:1799`) cannot read it and the count is dropped.
      * `[✅]`   Functional goal: add `expectedCount: number` to the FE `StageProgressEntry`, after `progress` (line 1259), mirroring the BE contract exactly — required, finite non-negative integer (no optional, no `null`; the BE always emits it).
      * `[✅]`   Functional goal: in `hydrateAllStageProgressLogic`, before the `set` (alongside the existing pre-`set` validations at lines 1820-1842), throw a `[hydrateAllStageProgress]`-prefixed error if any `entry.expectedCount` is not a finite non-negative integer — invalid count data is never admitted to the store, because users make financial decisions on it. This matches the function's existing throw-on-invalid pattern (lines 1814-1842); no silent skip, no default.
      * `[✅]`   Functional goal: inside the `set`, beside `state.dagProgressByRun[runKey] = dagProgress;` (line 1847), reset `state.stageExpectedCountsByRun[runKey] = {}` and, within the existing per-stage loop (lines 1848-1920), assign `state.stageExpectedCountsByRun[runKey][entry.stageSlug] = entry.expectedCount;`. Full overwrite on every authoritative hydration (refresh semantics), mirroring how `dagProgressByRun[runKey]` is overwritten.
      * `[✅]`   Non-functional: `hydrateStageProgressLogic` — the per-stage path fed by `listStageDocuments`, which returns NO counts (`dialecticStore.documents.ts:1693-1797`) — is NOT modified. It must never write `stageExpectedCountsByRun`, so an authoritative count is never overwritten by a fabricated or absent one. No `StageRunProgressSnapshot` field, no other hydrated field, and no other hydrate logic changes. `hydrateAllStageProgressLogic` must not read or write `selectedDomainProcessAssociation`, `domainProcessAssociationError`, `preProjectStageExpectedCounts`, or any domain-catalog field.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   FE hydration logic (`dialecticStore.documents.ts`) + the FE `StageProgressEntry` type mirror (`dialectic.types.ts` — `expectedCount` on `StageProgressEntry` only; do not add `DomainProcessAssociationRow` or `DialecticDomainRow` aliases here — those are owned by the `dialectic.api` node).
      * `[✅]`   This node reads `expectedCount` from the authoritative all-stages response and writes the run-keyed `stageExpectedCountsByRun` map for **post-project** `selectCostCeiling`. It does NOT compute or select ceilings, modify the per-stage hydrate path, call `fetchProcessAssociation`, or change the API client / BE beyond consuming `getAllStageProgress`.
      * `[✅]`   Out of scope: `packages/store/src/dialecticStore` association actions/state (`fetchProcessAssociation`, `selectedDomainProcessAssociation`, `fetchStageExpectedCounts`, `preProjectStageExpectedCounts`); `listDomains` / `DialecticDomainRow`; merged `default_process_template_id` on domains; the `selectCostCeiling` / `selectPreProjectCostCeiling` selectors (next node — pre-project selector reads `preProjectStageExpectedCounts`, not this map); UI (Group 5); the shallow `isGetAllStageProgressResponse` guard (`type_guards.ts:171-177`, `Array.isArray(stages)` only — not on this hydration path, left unchanged).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `@paynless/store` documents module (`dialecticStore.documents.ts`) + `@paynless/types` (`StageProgressEntry.expectedCount` field only in `dialectic.types.ts`).
      * `[✅]`   Inside this boundary: the FE `StageProgressEntry.expectedCount` field, and the validate-then-populate of `stageExpectedCountsByRun` in `hydrateAllStageProgressLogic`.
      * `[✅]`   Outside this boundary: BE count computation; `getAllStageProgress` API transport; pre-project `fetchProcessAssociation` / `getStageExpectedCounts` chain; domain catalog; ceiling selectors; UI consumers.

    * `[✅]`   `deps`
      * `[✅]`   `GetAllStageProgressResponse`, `StageProgressEntry` — provider: `@paynless/types` (`dialectic.types.ts`); layer: types; direction: inward; purpose: the response the hydrate reads, now carrying `expectedCount`. Imported from the original source, never re-exported.
      * `[✅]`   `stageExpectedCountsByRun` — provider: `packages/store/src/dialecticStore` node (`dialecticStore.ts` initial state + `DialecticStateValues`); layer: store state; direction: this node populates it only. HARD dependency: without that node's `{}` initialization, `state.stageExpectedCountsByRun[runKey]` is `undefined` and the assignment throws. That node also declares `selectedDomainProcessAssociation` / pre-project count state — this node must not touch those fields.
      * `[✅]`   `api.dialectic().getAllStageProgress` — provider: `@paynless/api`; layer: API client; direction: inward; purpose: returns the authoritative `GetAllStageProgressResponse`. Does **not** use `api.dialectic().fetchProcessAssociation` or `listDomains`.
      * `[✅]`   `set: (fn: (draft: Draft<DialecticStateValues>) => void) => void` — existing parameter of `hydrateAllStageProgressLogic`; provides the Immer draft.
      * `[✅]`   No reverse dependencies. HARD dependency: `packages/store/src/dialecticStore` node (initializes `stageExpectedCountsByRun`); BE `getAllStageProgress` node (`expectedCount` on response). HARD dependency: `packages/api/src/dialectic.api` node only for `getAllStageProgress` transport — not for association. Precedes `dialecticStore.selectors` (`selectCostCeiling` reads this map; `selectPreProjectCostCeiling` reads `preProjectStageExpectedCounts` from the store node).

    * `[✅]`   `interaction.spec`
      * `[✅]`   Trigger: existing post-project flows call `hydrateAllStageProgressLogic` after `api.dialectic().getAllStageProgress` returns (session + project context). Side effects: writes `dagProgressByRun[runKey]` and `stageExpectedCountsByRun[runKey]` only.
      * `[✅]`   Does **not** run on domain selection, does not invoke `fetchProcessAssociation`, and does not populate `preProjectStageExpectedCounts`. Declarative only — no code.

    * `[✅]`   `context_slice`
      * `[✅]`   From each `StageProgressEntry`: only `stageSlug` and `expectedCount` (the existing `steps`/`documents`/`jobs`/`progress` reads are unchanged).
      * `[✅]`   Writes only `stageExpectedCountsByRun[`${sessionId}:${iterationNumber}`][stageSlug]`. Must not read or write `selectedDomainProcessAssociation`, `isLoadingDomainProcessAssociation`, `domainProcessAssociationError`, `preProjectStageExpectedCounts`, `domains`, `selectedDomain`, or `currentProcessTemplate`. No over-fetch, no hidden coupling.

    * `[✅]`   packages/types/src/`dialectic.types.ts`
      * `[✅]`   In the FE `StageProgressEntry` (lines 1255-1264): add `expectedCount: number;` immediately after `progress: { completedSteps: number; totalSteps: number; failedSteps: number };` (line 1259), matching the BE field ordering. Required field, finite non-negative integer by contract.
      * `[✅]`   Types only (exempt from RED/GREEN). Additive to the interface; because it is required, every constructed `StageProgressEntry` must supply it — satisfied centrally by the `mockStageProgressEntry` factory default below, not by per-fixture edits.

    * `[✅]`   apps/web/src/mocks/`dialecticStore.mock.ts`
      * `[✅]`   The three FE tests that build `StageProgressEntry`/`GetAllStageProgressResponse` do so with inline literals (`dialecticStore.documents.test.ts` ~10 entries at 452/470/515/566/701/745/794/872/951/1034; `dialecticStore.test.ts` ≈1145; `dialectic.api.documents.test.ts` ≈221-242), which violates the no-inline-mocks rule and would force manual repair on every shape change. This file is already the project's dialectic mock factory (`mockDialecticProject`, `mockStageRunProgressSnapshot`, etc.); the `packages/store/src/dialecticStore` node already edits it for association + expected-count mock state/actions — this node adds progress-response factories only (no duplicate association action mocks). `packages/store` tests (`dialecticStore.notifications.test.ts`) and `packages/api` tests (`dialectic.api.contribution.test.ts`, `dialectic.api.integration.test.ts`) already import factories from here via `../../../apps/web/src/mocks/dialecticStore.mock` — NOT from `@paynless/api/mocks` (that barrel is only API client `vi.fn` stubs in `dialectic.api.mock.ts`).
      * `[✅]`   If the store node did not add it: `export function mockDomainProcessAssociationRow(overrides: Partial<DomainProcessAssociationRow> = {}): DomainProcessAssociationRow` — full six-column `DomainProcessAssociationRow` with `is_default_for_domain: true` defaults (for association-isolation test seeding). Import `DomainProcessAssociationRow` from `@paynless/types`.
      * `[✅]`   Add `export function mockStageProgressEntry(overrides: Partial<StageProgressEntry> = {}): StageProgressEntry` returning spec-valid defaults from the production type — `{ stageSlug: 'thesis', status: <valid UnifiedProjectStatus>, modelCount: 1, progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }, expectedCount: 0, steps: [], documents: [], jobs: [], edges: [], ...overrides }` (the default carries the new `expectedCount`).
      * `[✅]`   Add `export function mockGetAllStageProgressResponse(overrides: Partial<GetAllStageProgressResponse> = {}): GetAllStageProgressResponse` returning `{ dagProgress: <valid DagProgressDto, `dialectic.types.ts:1179`>, stages: [mockStageProgressEntry()], ...overrides }`. Extend the file's existing `@paynless/types` imports with `StageProgressEntry`, `GetAllStageProgressResponse`, `DagProgressDto`. No `as`, no inline ad-hoc types.

    * `[✅]`   packages/store/src/`dialecticStore.documents.test.ts`
      * `[✅]`   Migrate every inline `GetAllStageProgressResponse`/`StageProgressEntry` literal in the `hydrateAllStageProgressLogic` suite (452, 470, 515, 566, 701, 745, 794, 872, 951, 1034) to `mockGetAllStageProgressResponse({ stages: [mockStageProgressEntry({ ...asserted fields... })] })`, preserving each test's `stageSlug`/`modelCount`/`steps`/`documents`/`jobs`/`progress`/`dagProgress`. Import from `../../../apps/web/src/mocks/dialecticStore.mock` (same path as `dialecticStore.notifications.test.ts`). Existing assertions stay green.
      * `[✅]`   Success assertion: `mockStageProgressEntry({ stageSlug: 'thesis', expectedCount: <n> })`; after `hydrateAllStageProgressLogic` resolves, `store.getState().stageExpectedCountsByRun['${sessionId}:${iterationNumber}']['thesis']` equals `<n>`; a two-stage response asserts each stage keyed to its own count.
      * `[✅]`   Throw assertion: `mockStageProgressEntry({ expectedCount: -1 })` (and `1.5`, and a non-number via typed override) makes `hydrateAllStageProgressLogic` reject with `/\[hydrateAllStageProgress\].*expectedCount/`, and `stageExpectedCountsByRun` is left unchanged.
      * `[✅]`   Per-stage-path assertion: after an authoritative hydrate populates a stage's count, a subsequent `hydrateStageProgressLogic` (listStageDocuments path) for the same key does NOT clear or alter `stageExpectedCountsByRun`. New cases appended; all objects via the factory with typed overrides.
      * `[✅]`   Association isolation: `set({ selectedDomainProcessAssociation: mockDomainProcessAssociationRow(), preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 2 }] })` before `hydrateAllStageProgressLogic`; after hydrate, both fields deep-equal the seeded values (post-project hydration must not clobber pre-project / association state).

    * `[✅]`   packages/store/src/`dialecticStore.test.ts`
      * `[✅]`   Migrate the inline `StageProgressEntry`/response literal(s) (≈1145) to the factory + typed overrides; import from `../../../apps/web/src/mocks/dialecticStore.mock`. No assertion changes (the factory default supplies `expectedCount`).

    * `[✅]`   packages/api/src/`dialectic.api.documents.test.ts`
      * `[✅]`   Migrate the inline `StageProgressEntry`/response literal(s) (≈221-242) to the factory + typed overrides; import from `../../../apps/web/src/mocks/dialecticStore.mock` (same path as `dialectic.api.contribution.test.ts`). No assertion changes.

    * `[✅]`   packages/store/src/`dialecticStore.documents.ts`
      * `[✅]`   Add a pre-`set` validation loop after the document-validation block (which ends at line 1842) and before `const runKey` (line 1844): `for (const entry of stages) { if (!Number.isInteger(entry.expectedCount) || entry.expectedCount < 0) { throw new Error(`[hydrateAllStageProgress] expectedCount invalid for stage ${entry.stageSlug}; sessionId=${sessionId}, iterationNumber=${iterationNumber}`); } }`. Consistent with the existing inline validations/throws in this function; no shared FE helper exists (none in `@paynless/utils`), so the check is inline as the file already does for `steps`/`documents`.
      * `[✅]`   Inside the `set`, immediately after `state.dagProgressByRun[runKey] = dagProgress;` (line 1847): add `state.stageExpectedCountsByRun[runKey] = {};`. Within the existing `for (const entry of stages)` loop (starting line 1848), add `state.stageExpectedCountsByRun[runKey][entry.stageSlug] = entry.expectedCount;`.
      * `[✅]`   Do NOT modify `hydrateStageProgressLogic`. No new imports (the response type already flows through the existing `@paynless/types` import). No other behavioral change; all existing snapshot population (`stepStatuses`, `documents`, `jobProgress`, `progress`, `jobs`) is untouched. No `as`, no default, no fallback.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: store (FE hydration, post-project run scope).
      * `[✅]`   Deps: inward (`@paynless/types`, `@paynless/api` `getAllStageProgress` only, `packages/store/src/dialecticStore` initial state for `stageExpectedCountsByRun`, Immer `set`).
      * `[✅]`   Provides: outward (`stageExpectedCountsByRun[runKey]` for `selectCostCeiling`; does not provide pre-project counts or `process_template_id`).
      * `[✅]`   No cycles. No lateral call to `fetchProcessAssociation`.

    * `[✅]`   `requirements`
      * `[✅]`   FE `StageProgressEntry` carries a required `expectedCount: number`. Observable: type definition; all fixtures compile with the field present.
      * `[✅]`   After authoritative hydration, `stageExpectedCountsByRun[runKey][stageSlug]` equals each `entry.expectedCount`. Observable: success unit test (single- and multi-stage).
      * `[✅]`   An invalid `expectedCount` (negative, non-integer, or non-number) makes `hydrateAllStageProgressLogic` throw and stores nothing. Observable: throw unit test.
      * `[✅]`   `hydrateStageProgressLogic` never writes `stageExpectedCountsByRun`; an authoritative count survives a subsequent per-stage hydrate. Observable: per-stage-path unit test.
      * `[✅]`   `hydrateAllStageProgressLogic` does not read or mutate association or pre-project count state. Observable: association-isolation unit test; grep `dialecticStore.documents.ts` for `fetchProcessAssociation`, `selectedDomainProcessAssociation`, `preProjectStageExpectedCounts`, `default_process_template_id` → no matches.
      * `[✅]`   No `default_process_template_id` (or synthetic domain template field) in this module. Observable: grep confirms absent.
      * `[✅]`   No change to any other hydrated field or to the per-stage path. Observable: existing documents tests remain green.

  * `[✅]`   packages/store/src/dialecticStore.selectors **Selector-derived `selectCostCeiling` (post-project) and `selectPreProjectCostCeiling` (pre-project)**

    * `[✅]`   `objective`
      * `[✅]`   Cost ceilings are selector-derived. This node adds `isAiModelExtendedConfig` in `@paynless/utils` and two pure selectors that read live dialectic state, assemble `ComputeCostCeilingPayload`, call `computeCostCeiling(deps, params, payload)` from `@paynless/utils` **without** pre-guarding with `isComputeCostCeilingPayload`, and return the function result unchanged (success or error) — recomputing on every read when inputs change (model selection, slider, hydration, contributions, domain/association selection).
      * `[✅]`   **`selectCostCeiling(state, sessionId): ComputeCostCeilingReturn | null`** (post-project): read per-stage `expectedCount` from `state.stageExpectedCountsByRun[`${sessionId}:${iterationNumber}`][stageSlug]`; read `maxOutputTokens`; assemble `outputTokenCostRates: number[]` (one `output_token_cost_rate` per selected model from catalog via `isAiModelExtendedConfig`); for each stage when `selectUnifiedProjectProgress` reports `stageStatus === 'completed'`, copy contribution rows `{ tokensUsedInput, tokensUsedOutput, inputTokenCostRate, outputTokenCostRate }` from session contributions + catalog (no summation in selectors); else `contributions: []`; assemble `ComputeCostCeilingPayload`; `return computeCostCeiling(buildComputeCostCeilingDeps(), buildComputeCostCeilingParams(), payload)` (pass through success or error). Return `null` only when prerequisite inputs are incomplete (counts, cap, rates, session, contribution row fields) — not to swallow function errors.
      * `[✅]`   **`selectPreProjectCostCeiling(state): ComputeCostCeilingReturn | null`** (pre-project): read `state.preProjectStageExpectedCounts`; enforce association chain (`selectedDomain`, matching `selectedDomainProcessAssociation`, `domainProcessAssociationError == null`); same cap + `outputTokenCostRates[]` assembly; all stages `contributions: []`; assemble payload; call `computeCostCeiling` the same way and return the result unchanged. Return `null` only when prerequisite inputs are incomplete — not to swallow function errors.
      * `[✅]`   **`maxOutputTokens`**: use `state.maxOutputTokens` only when it is a finite number; when `null`, return `null`.
      * `[✅]`   **`outputTokenCostRates[]`**: one finite `output_token_cost_rate` per entry in `state.selectedModels` (in selection order), each read from the matching `modelCatalog[].config` narrowed by `isAiModelExtendedConfig`. When `selectedModels` is empty or any selected model lacks a valid config/rate, return `null`. No max pick — the utility computes mean rate.
      * `[✅]`   **Contribution rows** (post-project only): copy token counts and per-contribution model rates into payload `contributions[]`; propagate `null` when any included contribution lacks valid tokens, `model_id`, or catalog rates. Selectors do not multiply or sum — `computeCostCeiling` owns all arithmetic.
      * `[✅]`   **Counts** (post-project): iterate template stages via `getSortedStagesFromTemplate`; require finite non-negative integer counts for every template slug. (Pre-project): map `preProjectStageExpectedCounts` after association gates.
      * `[✅]`   Functional goal: implement `isAiModelExtendedConfig` in `packages/utils/src/dialectic.guard.ts` with full contract tests in `dialectic.guard.test.ts` (required + optional field validation per `AiModelExtendedConfig`). Required for narrowing `modelCatalog[].config` when assembling `outputTokenCostRates[]` and contribution rate fields — no string-indexed config reads.
      * `[✅]`   Non-functional: module-private assembly helpers only (`lookupModelConfig`, `assembleOutputTokenCostRates`, `buildPostProjectCostCeilingStages`, `buildPreProjectCostCeilingStages`); no cost arithmetic in selectors; no `extractMaxOutputCostRate`, no `sumStageActualCost`.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`  FE store selectors + shared guard — derivation layer between hydrated counts / contributions / catalog rates / association+count state and `computeCostCeiling`.
      * `[✅]`  This node CREATES `isAiModelExtendedConfig`, the two exported selectors, and module-private payload-assembly helpers.

    * `[✅]`   `module`
      * `[✅]`  Bounded context: `@paynless/utils` guard (`dialectic.guard.ts`) + `@paynless/store` dialectic selectors (`dialecticStore.selectors.ts`).
      * `[✅]`  Inside: `isAiModelExtendedConfig`; `selectCostCeiling`, `selectPreProjectCostCeiling`; private helpers that read dialectic state, assemble payload fields, and call `computeCostCeiling` (no multiply/sum/max-rate pick).
      * `[✅]`  Outside: BE handlers, API transport, association/count **actions**, `computeCostCeiling` arithmetic implementation, auth tier, UI orchestration.

    * `[✅]`   `deps`
      * `[✅]`   `StageExpectedCount`, `AiModelExtendedConfig` — provider: `@paynless/types` (`dialectic.types.ts`, `ai.types.ts`); layer: types; direction: inward.
      * `[✅]`   `ComputeCostCeilingContributionInput`, `ComputeCostCeilingStageInput`, `ComputeCostCeilingPayload`, `ComputeCostCeilingReturn`, `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload` — provider: `@paynless/utils` (`computeCostCeiling.provides.ts`); layer: domain utility; direction: inward.
      * `[✅]`   `isRecord` — provider: `@paynless/utils` (`dialectic.guard.ts`); layer: shared guard primitive; direction: inward; purpose: primitive for `isAiModelExtendedConfig` (implemented in this node).
      * `[✅]`   Post-project state: `stageExpectedCountsByRun`, `maxOutputTokens`, `selectedModels`, `modelCatalog`, `currentProcessTemplate`, `currentProjectDetail` — provider: `DialecticStateValues` + existing selectors in this file.
      * `[✅]`   Pre-project state: `selectedDomain` (`DialecticDomainRow | null`), `selectedDomainProcessAssociation` (`DomainProcessAssociationRow | null`), `domainProcessAssociationError`, `preProjectStageExpectedCounts`, `stageExpectedCountsError` — provider: `DialecticStateValues` (`packages/store/src/dialecticStore` node declares them; row aliases from `@paynless/db-types` via `dialectic.api` node). Selectors read these fields only; they do not fetch associations.
      * `[✅]`   `selectSessionById`, `selectUnifiedProjectProgress`, `getSortedStagesFromTemplate` — same file; direction: inward (composition, no cycles).
      * `[✅]`   HARD dependency chain: `packages/utils/src/computeCostCeiling` → `packages/api/src/dialectic.api` (row aliases + transport) → `packages/store/src/dialecticStore` (association row + `fetchStageExpectedCounts` + count error state) → `packages/store/src/dialecticStore.documents` (`stageExpectedCountsByRun` population) → **this node** (guard + selectors). This node is last in Group 4. `OutputCapSlider` and other consumers import `isAiModelExtendedConfig` from `@paynless/utils` after this node lands.

    * `[✅]`   `context_slice`
      * `[✅]`  Post-project reads: `stageExpectedCountsByRun[runKey]`, session `iteration_count`, template stage slugs, `selectUnifiedProjectProgress(...).stageDetails[].stageStatus`, session `dialectic_contributions` filtered by stage/iteration, `modelCatalog` configs for selected + contribution models (via `isAiModelExtendedConfig`), `maxOutputTokens`. No domain-catalog or association fields.
      * `[✅]`  Pre-project reads: `selectedDomain`, `selectedDomainProcessAssociation`, `domainProcessAssociationError`, `preProjectStageExpectedCounts`, `stageExpectedCountsError`, `maxOutputTokens`, `selectedModels`, `modelCatalog`. Selectors ignore `isLoadingDomainProcessAssociation` / `isLoadingStageExpectedCounts` (return `null` while counts/association are absent — loading is a UI concern; absent data must not produce a fabricated estimate).
      * `[✅]`  No wallet, no auth tier, no DB/API. No over-fetch.

    * `[✅]`   packages/utils/src/`dialectic.guard.test.ts`
      * `[✅]`   Append a `describe('isAiModelExtendedConfig')` suite (mirroring the existing `isJson`/`isPlainObject`/`isRecord` suites; `import { isAiModelExtendedConfig } from './dialectic.guard'`).
      * `[✅]`   Passing cases: a full valid `AiModelExtendedConfig` (all required + several optional fields) passes; a minimal valid config (only `input_token_cost_rate`, `output_token_cost_rate`, `tokenization_strategy: { type: 'tiktoken' }`) passes; `context_window_tokens: null` passes.
      * `[✅]`   Failing cases: missing `input_token_cost_rate`; missing `output_token_cost_rate`; a rate that is non-number / non-finite; missing `tokenization_strategy`; `tokenization_strategy.type` not in the literal set; an optional numeric field present but non-number (e.g. `hard_cap_output_tokens: "x"`); `null`; an array; a string; a number.
      * `[✅]`   Valid objects built from the `AiModelExtendedConfig` production type; invalid variants built via factory-then-override to invalid values (typed per the strict-typing exception), not by casting arbitrary literals. One behavior per test; appended at the end.

    * `[✅]`   packages/utils/src/`dialectic.guard.ts`
      * `[✅]`   Add `export function isAiModelExtendedConfig(value: unknown): value is AiModelExtendedConfig`, importing `AiModelExtendedConfig` from `@paynless/types` (add to the existing top-of-file import). Logic: `if (!isRecord(value)) return false;` require `typeof value['input_token_cost_rate'] === 'number' && Number.isFinite(value['input_token_cost_rate'])` and the same for `output_token_cost_rate`; require `isRecord(value['tokenization_strategy'])` and `value['tokenization_strategy']['type']` to be one of `'tiktoken' | 'rough_char_count' | 'provider_specific_api' | 'unknown'`; for each optional numeric key (`hard_cap_output_tokens`, `provider_max_output_tokens`, `provider_max_input_tokens`, `default_temperature`, `default_top_p`), if the key is present it must be a finite number else return false; for `context_window_tokens`, if present it must be a finite number or `null`; otherwise return `true`.
      * `[✅]`   Reuse `isRecord` from this same file (lines 37-39). No `any`, no casts, no inline ad-hoc types. Do not modify `isStageExpectedCount` / `isGetStageExpectedCountsResponse` suites added by the `dialecticStore` node.

    * `[✅]`   packages/store/src/`dialecticStore.selectors.costCeiling.test.ts`
      * `[✅]`   New file: unit tests for `selectCostCeiling` and `selectPreProjectCostCeiling`; import selectors from `./dialecticStore.selectors`; import `mockAiProvidersRow` / `mockAiModelConfig` from `../../../apps/web/src/mocks/dialecticStore.mock`; import `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload`, `buildComputeCostCeilingErrorReturn`, `ComputeCostCeilingSuccessReturn` from `@paynless/utils`; import `isApiError` from `@paynless/utils` (or the package path used elsewhere in store tests). For pre-project fixtures, seed `selectedDomain` and `selectedDomainProcessAssociation` with matching `domain_id` (production row shapes / existing dialectic mock factories — no inline ad-hoc domain types). Do not mock `computeCostCeiling` except in dedicated error pass-through tests (`vi.spyOn`).
      * `[✅]`   `selectCostCeiling` — returns estimate (single rate): seed `maxOutputTokens: 1000`, one selected model, `modelCatalog` with `output_token_cost_rate: 3`, `stageExpectedCountsByRun[runKey]` with counts for every template stage, valid session/project/template; assert `'error' not in result`; assert `stageCeilings[slug] === expectedCount × 1000 × 3` and `projectCeiling` matches real `computeCostCeiling(...)` hand-check with `outputTokenCostRates: [3]` and all stages `contributions: []`.
      * `[✅]`   `selectCostCeiling` — two-model mean rate: two selected models with catalog rates `2` and `3`, `expectedCount: 4`, `maxOutputTokens: 1000` → assert `stageCeilings[slug] === 10000` (mean 2.5, not 5, not max 3).
      * `[✅]`   `selectCostCeiling` — mixed actual + estimate: one stage `stageStatus: 'completed'` with contribution rows copied into payload (valid tokens + rates) and a second pending stage (`contributions: []`); assert `'error' not in result`; assert `projectCeiling === 9500` when completed stage contributions sum to 500 and pending stage estimate is 9000 (hand-check via real `computeCostCeiling`).
      * `[✅]`   `selectCostCeiling` — returns `null` when: `maxOutputTokens` is `null`; `selectedModels` is `[]`; no valid catalog config for a selected model; `stageExpectedCountsByRun` missing run-key; a template stage slug missing from the counts map; a completed-stage contribution with `tokens_used_input: null`; `expectedCount` invalid on counts map. One behavior per test.
      * `[✅]`   `selectCostCeiling` — passes through error: when `computeCostCeiling` returns `buildComputeCostCeilingErrorReturn(...)` (via `vi.spyOn` on the real `@paynless/utils` import), assert selector returns the same error object (`'error' in result`, `isApiError(result.error)`), not `null`. One behavior per test.
      * `[✅]`   `selectPreProjectCostCeiling` — returns estimate: `selectedDomain` + `selectedDomainProcessAssociation` with matching `domain_id`, `domainProcessAssociationError: null`, `preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }, ...]`, cap + rates set; assert `'error' not in result`; assert `projectCeiling` equals real `computeCostCeiling` hand-check (all stages `contributions: []`, mean rate over `outputTokenCostRates[]`).
      * `[✅]`   `selectPreProjectCostCeiling` — returns `null` when: `selectedDomain` is `null`; `domainProcessAssociationError` is set; `selectedDomainProcessAssociation` is `null`; `selectedDomainProcessAssociation.domain_id` does not match `selectedDomain.id`; `preProjectStageExpectedCounts` is `null` or `[]`; cap or rates missing; invalid `expectedCount` on a stored count. One behavior per test.
      * `[✅]`   `selectPreProjectCostCeiling` — passes through error: when `computeCostCeiling` returns `buildComputeCostCeilingErrorReturn(...)`, assert selector returns the same error object (`'error' in result`, `isApiError(result.error)`), not `null`. One behavior per test. New cases appended; state built from `initialDialecticStateValues` + production types.

    * `[✅]`   packages/store/src/`dialecticStore.selectors.ts`
      * `[✅]`   Add imports: `AiModelExtendedConfig`, `StageExpectedCount` from `@paynless/types`; `isAiModelExtendedConfig`, `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload`, `ComputeCostCeilingContributionInput`, `ComputeCostCeilingStageInput`, `ComputeCostCeilingReturn` from `@paynless/utils`.
      * `[✅]`   `function lookupModelConfig(modelId: string | null, catalog: AiProvidersRow[]): AiModelExtendedConfig | null`: find catalog row by id; if `isAiModelExtendedConfig(catalogEntry.config)`, return config; else `null`.
      * `[✅]`   `function assembleOutputTokenCostRates(state: DialecticStateValues): number[] | null`: if `state.selectedModels == null` or `length === 0`, return `null`; loop each selected model id in order against `state.modelCatalog`; for each match where `isAiModelExtendedConfig(catalogEntry.config)`, push `config.output_token_cost_rate`; if pushed length !== `selectedModels.length`, return `null`; else return the array. No max pick; no default rate.
      * `[✅]`   `function buildPostProjectCostCeilingStages(state: DialecticStateValues, sessionId: string): ComputeCostCeilingStageInput[] | null`: resolve `session` via `selectSessionById(state, sessionId)` — if missing or `iteration_count` not a number, return `null`; `runKey = `${sessionId}:${iterationNumber}`; `countsBySlug = state.stageExpectedCountsByRun[runKey]` — if missing, return `null`; `stages = getSortedStagesFromTemplate(state.currentProcessTemplate)` — if empty, return `null`; `unified = selectUnifiedProjectProgress(state, sessionId)` (may throw if session/stage invalid — callers must pass a valid sessionId in production; tests seed valid session); build `ComputeCostCeilingStageInput[]` in template order: for each `stage.slug`, if `countsBySlug[stage.slug]` is not a finite non-negative integer, return `null`; if unified `stageDetails` entry has `stageStatus === 'completed'`, filter `session.dialectic_contributions` for stage/iteration; for each contribution require finite `tokens_used_input`, `tokens_used_output`, non-null `model_id`; resolve rates via `lookupModelConfig`; if any fails return `null`; push `{ tokensUsedInput, tokensUsedOutput, inputTokenCostRate: config.input_token_cost_rate, outputTokenCostRate: config.output_token_cost_rate }` into `contributions[]`; else `contributions: []`; push `{ stageSlug: stage.slug, expectedCount: countsBySlug[stage.slug], contributions }`.
      * `[✅]`   `export function selectCostCeiling(state: DialecticStateValues, sessionId: string): ComputeCostCeilingReturn | null`: if `state.maxOutputTokens` is not a finite number, return `null`; `const outputTokenCostRates = assembleOutputTokenCostRates(state)`; if `null`, return `null`; `const stages = buildPostProjectCostCeilingStages(state, sessionId)`; if `null`, return `null`; `const payload = buildComputeCostCeilingPayload({ stages, maxOutputTokens: state.maxOutputTokens, outputTokenCostRates })`; `return computeCostCeiling(buildComputeCostCeilingDeps(), buildComputeCostCeilingParams(), payload)` — no branch on `'error' in result`.
      * `[✅]`   `function buildPreProjectCostCeilingStages(state: DialecticStateValues): ComputeCostCeilingStageInput[] | null`: if `state.selectedDomain == null`, return `null`; if `state.domainProcessAssociationError != null`, return `null`; if `state.selectedDomainProcessAssociation == null`, return `null`; if `state.selectedDomainProcessAssociation.domain_id !== state.selectedDomain.id`, return `null`; if `state.preProjectStageExpectedCounts == null` or `length === 0`, return `null`; map each `StageExpectedCount` to `{ stageSlug, expectedCount, contributions: [] }` — if any `expectedCount` is not a finite non-negative integer, return `null`; return the array. Does not read `process_template_id` (counts were already fetched for that template by `fetchStageExpectedCounts` in `dialecticStore.ts`).
      * `[✅]`   `export function selectPreProjectCostCeiling(state: DialecticStateValues): ComputeCostCeilingReturn | null`: same cap + `outputTokenCostRates` guards as `selectCostCeiling`; `const stages = buildPreProjectCostCeilingStages(state)`; if `null`, return `null`; `const payload = buildComputeCostCeilingPayload({ stages, maxOutputTokens: state.maxOutputTokens, outputTokenCostRates })`; `return computeCostCeiling(buildComputeCostCeilingDeps(), buildComputeCostCeilingParams(), payload)` — no branch on `'error' in result`.
      * `[✅]`   Place exports after `selectUnifiedProjectProgress` (≈line 814) or at the end of the progress section; helpers are `function` declarations above the exports (same pattern as `getSortedStagesFromTemplate`). No `createSelector` memoization required (cheap pure read; matches `selectUnifiedProjectProgress` signature style). Grep this file: no `default_process_template_id`, no `fetchProcessAssociation`, no `domains[]` reads for template id, no `maxOutputCostRate`, no `actualCost`, no `extractMaxOutputCostRate`, no `sumStageActualCost`.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: shared guard (`@paynless/utils`) + store selectors.
      * `[✅]`   Deps: inward (`@paynless/types`, `@paynless/utils` including `computeCostCeiling` + `buildComputeCostCeiling*` + `ComputeCostCeilingReturn` from `computeCostCeiling.provides.ts`, `DialecticStateValues` association+count fields from `dialecticStore`, existing selectors in this file).
      * `[✅]`   Provides: outward (`isAiModelExtendedConfig` from `@paynless/utils`; `ComputeCostCeilingReturn | null` from both selectors for Group 5 NSF, SessionInfoCard, Create form, OutputCapSlider).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `isAiModelExtendedConfig` accepts valid configs and rejects invalid variants per `dialectic.guard.test.ts`. Observable: guard test suite green.
      * `[✅]`   `selectCostCeiling` returns `ComputeCostCeilingReturn` (success or error from `computeCostCeiling`) when prerequisite inputs are complete; returns `null` only when prerequisites are incomplete (counts, cap, rates, session, contribution row fields). Observable: success-path unit tests + null-path unit tests in `dialecticStore.selectors.costCeiling.test.ts`.
      * `[✅]`   `selectPreProjectCostCeiling` returns `ComputeCostCeilingReturn` when association chain, `preProjectStageExpectedCounts`, cap, and rates are complete; returns `null` only when prerequisites are incomplete. Observable: unit tests in `dialecticStore.selectors.costCeiling.test.ts`.
      * `[✅]`   Both selectors call `computeCostCeiling(deps, params, payload)` with assembled `payload` and return the function result unchanged — no pre-call `isComputeCostCeilingPayload`, no mapping `'error' in result` to `null`. Observable: review + error pass-through unit tests + hand-computed success expectations.
      * `[✅]`   When `computeCostCeiling` returns `{ error: ApiError }`, the selector returns the same error object. Observable: error pass-through unit tests for both selectors.
      * `[✅]`   `outputTokenCostRates[]` uses `isAiModelExtendedConfig` on catalog configs only — one rate per selected model in selection order; no max pick; no string-indexed config reads. Observable: review + two-model mean-rate test (`stageCeilings[slug] === 10000`).
      * `[✅]`   Selectors copy contribution token+rate fields into payload; they do not sum actuals or compute mean rate. Observable: grep `dialecticStore.selectors.ts` for multiply/sum patterns on token costs → none; mixed actual+estimate test hand-checks utility output.
      * `[✅]`   `dialecticStore.selectors.ts` contains no `isComputeCostCeilingPayload`, `fetchProcessAssociation`, `fetchStageExpectedCounts`, `default_process_template_id`, `maxOutputCostRate`, `actualCost`, `extractMaxOutputCostRate`, or `sumStageActualCost`. Observable: grep `dialecticStore.selectors.ts`.
      * `[✅]`   Cost-ceiling selector tests live in `dialecticStore.selectors.costCeiling.test.ts` only — not in `dialecticStore.selectors.progress.test.ts`. Observable: grep progress test file for `selectCostCeiling` → no matches.
      * `[✅]`   Existing selector tests remain green. Observable: full `dialecticStore.selectors.progress.test.ts` (and sibling selector test files except the new cost-ceiling file) pass.

  * `[✅]`   apps/web/src/components/dialectic/OutputCapSlider **Narrow `modelCatalog[].config` with `isAiModelExtendedConfig`, replacing generic `isJson`/`isPlainObject` reads**

    * `[✅]`   `objective`
      * `[✅]`   `OutputCapSlider.tsx` reads each selected model's `modelCatalog[].config` (a Supabase `Json | null` on `AiProvidersRow`) using the generic guards `isJson` + `isPlainObject` (lines 62-71), then indexes raw string keys `configValue["hard_cap_output_tokens"]` / `configValue["provider_max_output_tokens"]` as `unknown` and re-validates each inline with `typeof === "number" && Number.isFinite && >= 0` (lines 73-100). The application type `AiModelExtendedConfig` (`@paynless/types`, `ai.types.ts:129-159`) is never proven, and string-indexed access is fragile.
      * `[✅]`   Functional goal: import `isAiModelExtendedConfig` from `@paynless/utils` (implemented in the prior `dialecticStore.selectors` node) and use it to narrow `catalogEntry.config` before reading `hard_cap_output_tokens` / `provider_max_output_tokens` for `sliderRangeMax`. Malformed configs are skipped (same exclusion behavior as today when config fails validation).
      * `[✅]`   Non-functional: no change to slider props, existing store reads, tier filtering, log-segment scale, markers, thumb-max math, or upgrade CTA. `logger` import is retained; the slider's `isJson`/`isPlainObject` imports are removed (both remain exported from `@paynless/utils` for other consumers). The only behavioral change is the config-narrowing path (lines 62-100). **No coupling to `fetchProcessAssociation`:** pre-project `process_template_id` comes from `DomainProcessAssociationRow` via store/API nodes on domain selection; this component never reads `selectedDomain`, `selectedDomainProcessAssociation`, `domains`, or calls `fetchProcessAssociation` / `fetchStageExpectedCounts`.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   UI component — `OutputCapSlider` data-source hardening: first UI consumer of `isAiModelExtendedConfig` for catalog config narrowing.
      * `[✅]`   This node migrates the slider to the shared guard. It does NOT implement `isAiModelExtendedConfig` (prior `dialecticStore.selectors` node owns guard + tests in `dialectic.guard.ts` / `dialectic.guard.test.ts`). It does NOT modify the `AiModelExtendedConfig` type, dialectic store actions/state beyond what the slider already reads/writes (`maxOutputTokens`, `modelCatalog`, `selectedModels`), or tier/marker/scale/CTA logic.
      * `[✅]`   Out of scope: `computeCostCeiling` arithmetic; `dialecticStore.selectors` (`selectCostCeiling` / `selectPreProjectCostCeiling` / `assembleOutputTokenCostRates` — prior node, same guard); `fetchProcessAssociation` / `listDomains` BE packages, index wiring, `dialectic.api` transport, `fetchProcessAssociation` / `fetchStageExpectedCounts` store actions, `selectedDomain` / `selectedDomainProcessAssociation` / `DomainProcessAssociationRow` / `DialecticDomainRow` (API + `dialecticStore` nodes); `CreateDialecticProjectForm` domain-selection orchestration (Group 5); all other UI except this slider's config path.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web` dialectic UI (`OutputCapSlider.tsx`, tests).
      * `[✅]`   Inside this boundary: importing `isAiModelExtendedConfig` from `@paynless/utils`; narrowing `catalogEntry.config` before reading cap fields; writing `maxOutputTokens` to the dialectic store (unchanged contract).
      * `[✅]`   Outside this boundary: `isAiModelExtendedConfig` implementation and guard tests (`dialecticStore.selectors` node); how `modelCatalog` is loaded; domain/association orchestration; selector ceiling assembly (`selectCostCeiling` / `selectPreProjectCostCeiling` read `maxOutputTokens` this slider sets and rates from the same guard).

    * `[✅]`   `deps`
      * `[✅]`   `isAiModelExtendedConfig` — provider: `@paynless/utils` (`dialectic.guard.ts`, **`dialecticStore.selectors` node**); layer: shared guard; direction: inward; purpose: narrow `catalogEntry.config` before reading cap fields. Import from `@paynless/utils` only — do not reimplement or duplicate guard logic in the slider.
      * `[✅]`   `AiModelExtendedConfig` — provider: `@paynless/types` (`ai.types.ts`); layer: types; direction: inward; purpose: typed fields after narrowing. Imported from the original source, never re-exported.
      * `[✅]`   `useAuthStore`, `useDialecticStore`, `useNavigate`, `Slider`/`Tooltip`/`Button`, `UserTier`, `logger` — existing slider dependencies, unchanged. Dialectic store reads remain limited to `maxOutputTokens`, `setMaxOutputTokens`, `modelCatalog`, `selectedModels` (no `selectedDomain`, no association fields, no `api.dialectic()`).
      * `[✅]`   HARD dependency: `dialecticStore.selectors` node must land first (`isAiModelExtendedConfig` exported from `@paynless/utils`). No reverse dependencies. No lateral layer violations.

    * `[✅]`   `context_slice`
      * `[✅]`   Slider reads: `useAuthStore` (`userTier`, `availableTiers`); `useDialecticStore` (`maxOutputTokens`, `setMaxOutputTokens`, `modelCatalog`, `selectedModels` only). From each matched `catalogEntry.config`, only `hard_cap_output_tokens` and `provider_max_output_tokens` after `isAiModelExtendedConfig(config)` (for `sliderRangeMax`); writes user cap via `setMaxOutputTokens` (consumed later by `selectCostCeiling` / `selectPreProjectCostCeiling` when finite).
      * `[✅]`   Slider does NOT read: `domains`, `selectedDomain`, `selectedDomainProcessAssociation`, `domainProcessAssociationError`, `preProjectStageExpectedCounts`, `stageExpectedCountsError`, or any `default_process_template_id` / merged domain field. Does NOT call `fetchProcessAssociation`, `fetchDomains`, `fetchStageExpectedCounts`, or `fetchProcessTemplate`.
      * `[✅]`   No over-fetching, no hidden coupling to the association-read path.

    * `[✅]`   dialectic/`OutputCapSlider.test.tsx`
      * `[✅]`   Rebuild the `modelCatalog` fixtures so each `mockAiProvidersRow({ config })` carries a FULL valid `AiModelExtendedConfig` — replace the bare `config: { provider_max_output_tokens: 200000 }` (lines 162, 215, 398, 419) and the two-model ultra fixtures (lines 343, 348) with `config: { ...mockAiModelConfig(), provider_max_output_tokens: <value> }`, spreading the existing `mockAiModelConfig()` factory (already used as `mockAiProvidersRow`'s default config, `dialecticStore.mock.ts:798`) so the guard accepts the fixture and `sliderRangeMax` is computed identically. Import `mockAiModelConfig` if not already imported.
      * `[✅]`   Add test: a selected model whose `config` fails `isAiModelExtendedConfig` (e.g. `config: { provider_max_output_tokens: 200000 }` with the required rate/tokenization fields removed) is NOT counted toward `sliderRangeMax`; with only that model selected the slider returns null (no track), proving the guard gates malformed config.
      * `[✅]`   Add test: with a valid full config whose `provider_max_output_tokens` is `200000`, `sliderRangeMax` is `200000` (unchanged from the pre-migration assertion), proving the typed read matches the previous string-indexed read.
      * `[✅]`   All other existing assertions (4 markers, thumb max, within/above-tier marker clicks, CTA → `/subscription`, ultra thumb reach, page guidance, empty-`availableTiers`, empty-`selectedModels`) remain green. New tests appended at the end; full typed objects from production types.

    * `[✅]`   dialectic/`OutputCapSlider.tsx`
      * `[✅]`   Replace the import on line 21 `import { isJson, isPlainObject, logger } from "@paynless/utils";` with `import { isAiModelExtendedConfig, logger } from "@paynless/utils";`.
      * `[✅]`   In the `sliderRangeMax` memo (lines 62-100): replace the `configValue === null` / `!isJson(configValue)` / `!isPlainObject(configValue)` gate and the raw `configValue["hard_cap_output_tokens"]` / `configValue["provider_max_output_tokens"]` reads with `const config = catalogEntry.config; if (!isAiModelExtendedConfig(config)) { continue; }` then read the typed `config.hard_cap_output_tokens` and `config.provider_max_output_tokens`. Preserve the existing `applicationCap`/`providerCap`/`Math.min`/`Number.isFinite` selection and the `highest` accumulation (lines 76-108) unchanged — only the source of the two values changes from `unknown`-indexed to typed-field access (the present-and-finite optional fields are guaranteed numbers by the guard, so the per-field `typeof`/`Number.isFinite` checks collapse to a presence check `if (config.hard_cap_output_tokens !== undefined)` / `if (config.provider_max_output_tokens !== undefined)`).
      * `[✅]`   No other change: tier filtering (`displayTiers`), `thumbMax`/`activeThumbMax`, the log-segment slider math, markers, page guidance, and the upgrade CTA are untouched. Preserve all existing logging.

    * `[✅]`   dialectic/`OutputCapSlider.integration.test.tsx`
      * `[✅]`   Rebuild the `modelCatalog` fixtures here the same way (full `AiModelExtendedConfig` via `{ ...mockAiModelConfig(), provider_max_output_tokens: <value> }`) so the real-store integration path passes the guard and the existing assertions (4 markers excluding `unreachable`, track max from model, thumb clamp, locked-marker CTA → `navigate('/subscription')`, real `maxOutputTokens` write) remain green with router as the only mock. Add one assertion that the slider's track max derives from the guarded `provider_max_output_tokens` of the seeded model.
      * `[✅]`   Seed `useDialecticStore` with `modelCatalog` + `selectedModels` only — do not seed `selectedDomain`, `selectedDomainProcessAssociation`, or association loading flags to prove the slider path does not depend on `fetchProcessAssociation` having run (Create-form orchestration is a separate Group 5 node).

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI component (`apps/web`).
      * `[✅]`   Deps: inward (`isAiModelExtendedConfig` from `@paynless/utils`; `@paynless/types`; `useAuthStore` + limited `useDialecticStore` fields; router; UI primitives).
      * `[✅]`   Provides: outward (slider continues to write `maxOutputTokens` consumed by `selectCostCeiling` / `selectPreProjectCostCeiling`; demonstrates guard usage for cap fields — same guard selectors use for `outputTokenCostRates[]`). Does not provide association rows, `process_template_id`, or guard implementation.
      * `[✅]`   No cycles. No dependency on `fetchProcessAssociation` BE/API/store nodes.

    * `[✅]`   `requirements`
      * `[✅]`   The slider narrows `catalogEntry.config` via imported `isAiModelExtendedConfig` and reads typed `hard_cap_output_tokens`/`provider_max_output_tokens`; `isJson`/`isPlainObject` no longer appear in `OutputCapSlider.tsx`. Observable: grep + unit test that `sliderRangeMax` matches the prior value for a valid config.
      * `[✅]`   A selected model with malformed config is excluded from `sliderRangeMax`. Observable: unit test asserts null/no-track when only that model is selected.
      * `[✅]`   All pre-existing slider unit and integration assertions remain green with the full-config fixtures. Observable: the existing tests pass after the fixture rebuild.
      * `[✅]`   No change to slider props, tier/marker/scale/CTA logic, or logging. Dialectic store surface unchanged: still only `maxOutputTokens`, `setMaxOutputTokens`, `modelCatalog`, `selectedModels`. Observable: grep `OutputCapSlider.tsx` / `OutputCapSlider.test.tsx` / `OutputCapSlider.integration.test.tsx` for `fetchProcessAssociation`, `selectedDomain`, `selectedDomainProcessAssociation`, `DomainProcessAssociationRow`, `DialecticDomainRow`, `default_process_template_id`, `fetchStageExpectedCounts`, `fetchDomains` → no matches.
      * `[✅]`   This node does not edit `dialectic.guard.ts` or `dialectic.guard.test.ts` — guard correctness is owned by the prior `dialecticStore.selectors` node. Observable: grep this node's file steps for guard implementation → no matches; slider imports `isAiModelExtendedConfig` only.

  * `[✅]`   apps/web/src/hooks/useStartContributionGeneration **Replace minimum_balance NSF gate with `stageCeilings[viewingStage.slug]` and `projectCeiling` from `selectCostCeiling`**

    * `[✅]`   `objective`
      * `[✅]`   The session-page preventive NSF gate still compares `viewingStage.minimum_balance` (a static DB column) to wallet balance in `useStartContributionGeneration.ts` (lines 133-142, 170, 173-176, 240-241). That hardcoded threshold does not reflect the user's selected models, output-cap slider, or per-stage job counts, and it diverges from the ticket's ceiling math (lines 448-456).
      * `[✅]`   Non-functional: `startContributionGeneration` is a financial operation that consumes wallet tokens — it **must fail safe** (fail closed). Generation and paused-NSF resume are allowed **only** when `selectCostCeiling` returns a success estimate with a finite viewing-stage ceiling **and** wallet balance meets or exceeds that ceiling. Unknown estimate (`null` prerequisites) or selector/function error (`'error' in result`) **must block** spend — no fail-open path. No fallback to `minimum_balance`.
      * `[✅]`   Functional goal: derive the viewing-stage ceiling from `selectCostCeiling(state, sessionId)` (`dialecticStore.selectors` node) — success branch `stageCeilings[viewingStage.slug]` — and use it everywhere the hook previously used `minimum_balance` for disable logic, balance callout visibility, and paused-NSF resume eligibility.
      * `[✅]`   Functional goal: when `selectCostCeiling` returns `null` (prerequisite inputs incomplete) or `{ error: ApiError }` (call happened, estimate failed), treat as **not affordable / not known**: `isCostEstimateKnown` is `false`, `stageCeiling`/`projectCeiling`/`stageBalanceShortfall` are `null`, `costCeilingError` is set on the error branch else `null`, `balanceMeetsThreshold` is `false`, `showCostEstimateBlocked` is `true`, `showStageCostEstimate` is `false`, `showBalanceCallout` is `true`, and `isDisabled` is `true` (via `!balanceMeetsThreshold`) when other guards pass. The Generate button must not allow spend until a success estimate exists.
      * `[✅]`   Functional goal: when `selectCostCeiling` returns success and `stageCeiling` is a finite number and `Number(walletBalance) < stageCeiling`, set `balanceMeetsThreshold` to `false`, include `!balanceMeetsThreshold` in `isDisabled`, set `showBalanceCallout` to `true`, `showCostEstimateBlocked` to `false`, and expose `stageBalanceShortfall = stageCeiling - walletBalance` (finite, positive). When balance meets or exceeds the ceiling, `isCostEstimateKnown` is `true`, `balanceMeetsThreshold` is `true`, `showBalanceCallout` is `false`, `showCostEstimateBlocked` is `false`, and `showStageCostEstimate` is `true` so the button consumer can render "Estimated cost for this stage: ~{stageCeiling} tokens."
      * `[✅]`   Functional goal: expose `projectCeiling` from the same success `selectCostCeiling` result for the next `GenerateContributionButton` node (project-level notice); this hook does not render UI.
      * `[✅]`   Functional goal: in `startContributionGeneration` (callback, lines 232-243), before `resumePausedNsfJobs` or `generateContributions`, re-read `selectCostCeiling(state, activeContextSessionId)` and apply the same fail-safe rule — reject with toast and `{ success: false, error }` when result is `null`, `'error' in result`, viewing-stage ceiling is not finite, or `balanceNum < stageCeiling`. **Not** `viewingStage.minimum_balance`; **not** fail-open when estimate unknown.
      * `[✅]`   Non-functional: remove `stageThreshold` from `UseStartContributionGenerationReturn` (consumers must migrate in the next node). Keep `balanceMeetsThreshold` and `showBalanceCallout` names so mock factories need minimal renames, but their semantics are now fail-safe ceiling-based. No changes to `GenerateContributionButton.tsx`, `SessionInfoCard.tsx`, or `CreateDialecticProjectForm.tsx` in this node.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   Application / FE hook — bridges dialectic store selectors, wallet balance, and contribution-generation actions for the session Generate/Continue control.
      * `[✅]`   This node replaces the threshold source and extends the hook return contract. It does NOT edit button components, subscription deep links, or store selector implementation.
      * `[✅]`   Out of scope: rendering NSF/cost copy (`GenerateContributionButton` next node); project/stage cost displays on `SessionInfoCard` / Create form; `selectPreProjectCostCeiling`; BE `paused_nsf` handling (unchanged).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/hooks` — `useStartContributionGeneration`.
      * `[✅]`   Inside this boundary: reading `selectCostCeiling`, three-way result handling (`null` / error / success), deriving stage/project ceiling fields, fail-safe wallet comparison, disable/callout/resume flags, and the callback's fail-safe ceiling guard before any spend.
      * `[✅]`   Outside this boundary: ceiling arithmetic (`computeCostCeiling`), count hydration, API transport, and UI markup.

    * `[✅]`   `deps`
      * `[✅]`   `selectCostCeiling` — provider: `@paynless/store` (`dialecticStore.selectors.ts`, prior node); layer: store selector; direction: inward; purpose: post-project `ComputeCostCeilingReturn | null` for the active session.
      * `[✅]`   `ComputeCostCeilingReturn`, `ComputeCostCeilingSuccessReturn` — provider: `@paynless/utils` (`computeCostCeiling.provides.ts`); layer: types; direction: inward; purpose: selector result shape (`ComputeCostCeilingReturn`) and success-branch fields (`stageCeilings` / `projectCeiling`).
      * `[✅]`   `ApiError` — provider: `@paynless/types` (`api.types.ts`); layer: types; direction: inward; purpose: `costCeilingError` when `'error' in selectCostCeiling(...)`.
      * `[✅]`   `selectViewingStage`, `selectSessionById`, `selectUnifiedProjectProgress`, `selectIsStageReadyForSessionIteration`, `selectSelectedModels`, `selectActiveChatWalletInfo`, `selectSortedStages` — existing hook deps, unchanged.
      * `[✅]`   `useDialecticStore`, `useWalletStore`, `useAiStore` — existing stores.
      * `[✅]`   HARD dependency: `dialecticStore.selectors` node (`selectCostCeiling` exported from `@paynless/store` via `dialecticStore.selectors.ts` re-export). Precedes `GenerateContributionButton` node.
      * `[✅]`   No reverse dependencies. No lateral layer violations.

    * `[✅]`   `context_slice`
      * `[✅]`   From dialectic store (via `selectCostCeiling`): full `ComputeCostCeilingReturn | null`; on success only — `stageCeilings[viewingStage.slug]`, `projectCeiling` for the active `activeContextSessionId`.
      * `[✅]`   From wallet store: `activeWalletInfo.balance` (string) converted with `Number()` for comparison.
      * `[✅]`   No reads of `viewingStage.minimum_balance` after this node. When `maxOutputTokens` is null the selector returns `null`; the hook **must** fail closed (block spend) until prerequisites complete and a success estimate is available.

    * `[✅]`   packages/types/src/`dialectic.types.ts`
      * `[✅]`   Update `UseStartContributionGenerationReturn` (lines 1121-1142): remove `stageThreshold: number | undefined`.
      * `[✅]`   Add `stageCeiling: number | null` — finite viewing-stage preventive ceiling from success `selectCostCeiling` only; `null` when result is `null`, `'error' in result`, or slug missing/invalid in `stageCeilings`.
      * `[✅]`   Add `projectCeiling: number | null` — full-project ceiling from success estimate only; `null` when result is `null`, error, or `projectCeiling` not finite.
      * `[✅]`   Add `stageBalanceShortfall: number | null` — `stageCeiling - walletBalance` when `isCostEstimateKnown` and balance is below ceiling; `null` otherwise.
      * `[✅]`   Add `costCeilingError: ApiError | null` — set to `result.error` when `'error' in selectCostCeiling(...)`; else `null` (import `ApiError` from `@paynless/types`).
      * `[✅]`   Add `isCostEstimateKnown: boolean` — `true` only when `selectCostCeiling` returns success and `stageCeiling` is a finite non-negative number for the viewing slug.
      * `[✅]`   Add `showCostEstimateBlocked: boolean` — `true` when `viewingStage != null && !isCostEstimateKnown` (estimate unavailable or error — distinct from NSF shortfall for the next button node).
      * `[✅]`   Add `showStageCostEstimate: boolean` — `true` when `isCostEstimateKnown && balanceMeetsThreshold`.
      * `[✅]`   Retain `balanceMeetsThreshold: boolean` and `showBalanceCallout: boolean` with fail-safe ceiling semantics: `balanceMeetsThreshold` is `false` unless `isCostEstimateKnown && balance >= stageCeiling`; `showBalanceCallout` is `true` when `viewingStage != null && !balanceMeetsThreshold`. Types only (exempt from RED/GREEN).

    * `[✅]`   hooks/`useStartContributionGeneration.test.ts`
      * `[✅]`   Extend the existing `vi.mock('@paynless/store', ...)` block: import `selectCostCeiling` from the actual `@paynless/store` module and expose `selectCostCeiling: vi.fn<[DialecticStateValues, string], ComputeCostCeilingReturn | null>()` on the mock return (default implementation delegates to `actualPaynlessStore.selectCostCeiling` once the prior node lands; until then the mock implementation is the test-controlled surface). Import `ComputeCostCeilingReturn`, `ComputeCostCeilingSuccessReturn`, `buildComputeCostCeilingErrorReturn` from `@paynless/utils`.
      * `[✅]`   Add `const defaultCostCeiling: ComputeCostCeilingSuccessReturn = { stageCeilings: { thesis: 120000 }, projectCeiling: 350000 }` (explicit ceiling decoupled from `minimum_balance`) and `beforeEach` default: `vi.mocked(selectCostCeiling).mockImplementation((_state, sessionId) => sessionId === 'sess-1' ? defaultCostCeiling : null);`.
      * `[✅]`   Update the test `derived state values correctly reflect store state`: assert `result.current.isCostEstimateKnown` is `true`; assert `result.current.stageCeiling` equals the mocked ceiling for `thesis` (not `stageThreshold === minimum_balance`); assert `result.current.projectCeiling` matches the mock; remove any `stageThreshold` assertion.
      * `[✅]`   Add test: when `selectCostCeiling` returns `null`, `stageCeiling`/`projectCeiling`/`stageBalanceShortfall` are `null`, `costCeilingError` is `null`, `isCostEstimateKnown` is `false`, `balanceMeetsThreshold` is `false`, `showCostEstimateBlocked` is `true`, `showBalanceCallout` is `true`, `showStageCostEstimate` is `false`, and `isDisabled` is `true` when all other guards pass; `startContributionGeneration` does not call `generateContributions`.
      * `[✅]`   Add test: when `selectCostCeiling` returns `buildComputeCostCeilingErrorReturn(...)`, `costCeilingError` matches the mocked error, `isCostEstimateKnown` is `false`, `balanceMeetsThreshold` is `false`, `showCostEstimateBlocked` is `true`, `isDisabled` is `true`, and `startContributionGeneration` returns `{ success: false }` with toast using `error.message` (does not call `generateContributions`).
      * `[✅]`   Add test: when `stageCeilings.thesis` is `150000` and wallet balance is `100000`, `isCostEstimateKnown` is `true`, `balanceMeetsThreshold` is `false`, `isDisabled` is `true`, `showBalanceCallout` is `true`, `showCostEstimateBlocked` is `false`, `stageBalanceShortfall` is `50000`, `showStageCostEstimate` is `false`.
      * `[✅]`   Add test: when `stageCeilings.thesis` is `80000` and wallet balance is `100000`, `isCostEstimateKnown` is `true`, `balanceMeetsThreshold` is `true`, `showBalanceCallout` is `false`, `showCostEstimateBlocked` is `false`, `showStageCostEstimate` is `true`, `stageBalanceShortfall` is `null`, `isDisabled` is `false` (other guards passing).
      * `[✅]`   Add test: `startContributionGeneration` resume path — `hasPausedNsfJobs` with balance below `minimum_balance` but **above** `stageCeiling` calls `resumePausedNsfJobs` when estimate is success (ceiling gate satisfied); mirror with balance below `stageCeiling` verifying resume is **not** taken; mirror with `selectCostCeiling` returning `null` or error verifying resume is **not** taken.
      * `[✅]`   Add test: `startContributionGeneration` generate path — when `selectCostCeiling` returns `null` or error, callback returns failure and does not call `generateContributions` even when other UI guards would pass.
      * `[✅]`   Update `isDisabled is true when any guard fails` case that relied on low balance vs `minimum_balance`: drive low balance vs mocked `stageCeiling` instead.
      * `[✅]`   Preserve all unrelated tests (payload construction, pause, viewing-ahead, stale-closure reads, `maxOutputTokens` payload). New cases appended at the end.

    * `[✅]`   hooks/`useStartContributionGeneration.ts`
      * `[✅]`   Add `selectCostCeiling` to the import from `@paynless/store` (line 3-13).
      * `[✅]`   Add `ComputeCostCeilingReturn` to the import from `@paynless/utils`; add `ApiError` to the import from `@paynless/types`.
      * `[✅]`   Remove the `stageThreshold` `useMemo` (lines 133-136).
      * `[✅]`   Add `costCeilingResult: ComputeCostCeilingReturn | null` subscription: `useDialecticStore((state) => { const sid = state.activeContextSessionId; if (sid === null) return null; return selectCostCeiling(state, sid); })`.
      * `[✅]`   Add `costCeilingError: ApiError | null` `useMemo`: if `costCeilingResult !== null && 'error' in costCeilingResult`, return `costCeilingResult.error`; else `null`.
      * `[✅]`   Add `stageCeiling: number | null` `useMemo`: if `costCeilingResult === null || 'error' in costCeilingResult || viewingStage === null`, return `null`; read `costCeilingResult.stageCeilings[viewingStage.slug]`; if not a finite non-negative number, return `null`; else return the number.
      * `[✅]`   Add `projectCeiling: number | null` `useMemo`: if `costCeilingResult === null || 'error' in costCeilingResult`, return `null`; if `costCeilingResult.projectCeiling` is not a finite non-negative number, return `null`; else return it.
      * `[✅]`   Add `isCostEstimateKnown: boolean` `useMemo`: `stageCeiling !== null`.
      * `[✅]`   Replace `balanceMeetsThreshold` `useMemo` (lines 138-142): if `!isCostEstimateKnown`, return `false`; else `Number(activeWalletInfo.balance) >= stageCeiling` (reject `NaN` as not meeting).
      * `[✅]`   Add `stageBalanceShortfall: number | null` `useMemo`: when `isCostEstimateKnown` and balance is a valid number and balance `< stageCeiling`, return `stageCeiling - balance`; else `null`.
      * `[✅]`   Add `showCostEstimateBlocked: boolean` `useMemo`: `viewingStage != null && !isCostEstimateKnown`.
      * `[✅]`   Add `showStageCostEstimate: boolean` `useMemo`: `isCostEstimateKnown && balanceMeetsThreshold`.
      * `[✅]`   Update `showBalanceCallout` (lines 173-176): `viewingStage != null && !balanceMeetsThreshold` (covers NSF and unknown/error estimate; remove `stageThreshold` checks).
      * `[✅]`   In `startContributionGeneration` callback (before resume/generate): read `selectCostCeiling(state, activeContextSessionId)`; if `null`, toast and return `{ success: false, error }`; if `'error' in result`, toast `result.error.message` and return failure; resolve viewing-stage ceiling from success `stageCeilings[viewingStage.slug]`; if not finite, toast and return failure; if `balanceNum < ceiling`, toast and return failure; only then proceed with resume or generate (replaces L239-241 `minimum_balance` check — fail closed on unknown/error, not fail open).
      * `[✅]`   Update the return object (lines 309-330): remove `stageThreshold`; add `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `costCeilingError`, `isCostEstimateKnown`, `showCostEstimateBlocked`, `showStageCostEstimate`.
      * `[✅]`   No other behavioral changes to pause/generate payloads, viewing-ahead, or unrelated toasts.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: application (FE hook).
      * `[✅]`   Deps: inward (`@paynless/store` selectors/state, `@paynless/types`, wallet/ai stores).
      * `[✅]`   Provides: outward (ceiling-aware flags for `GenerateContributionButton` and any other hook consumers).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `viewingStage.minimum_balance` is not read anywhere in `useStartContributionGeneration.ts`. Observable: grep the file for `minimum_balance` returns no matches.
      * `[✅]`   When `selectCostCeiling` returns success and wallet balance is below `stageCeilings[viewingSlug]`, `isDisabled` is `true`, `isCostEstimateKnown` is `true`, `showCostEstimateBlocked` is `false`, and `showBalanceCallout` is `true` with `stageBalanceShortfall` equal to the difference. Observable: unit test.
      * `[✅]`   When balance meets or exceeds `stageCeiling` on a success estimate, `isCostEstimateKnown` is `true`, `balanceMeetsThreshold` is `true`, `showStageCostEstimate` is `true`, and `showBalanceCallout` is `false`. Observable: unit test.
      * `[✅]`   When `selectCostCeiling` returns `null` or `{ error: ApiError }`, `balanceMeetsThreshold` is `false`, `isCostEstimateKnown` is `false`, `showCostEstimateBlocked` is `true`, `isDisabled` is `true` (via `!balanceMeetsThreshold`), and `startContributionGeneration` does not call `generateContributions` or `resumePausedNsfJobs`. Observable: unit tests.
      * `[✅]`   Paused-NSF resume and generate paths in `startContributionGeneration` use the dynamic fail-safe ceiling guard, not `minimum_balance`. Observable: unit tests on resume and generate branches.
      * `[✅]`   `UseStartContributionGenerationReturn` no longer exposes `stageThreshold`; exposes `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `costCeilingError`, `isCostEstimateKnown`, `showCostEstimateBlocked`, `showStageCostEstimate`. Observable: type definition + tests compile.

  * `[✅]`   apps/web/src/components/dialectic/GenerateContributionButton **Ceiling-based NSF CTA, stage cost estimate, project balance notice, and post-project ceiling stack integration**

    * `[✅]`   `objective`
      * `[✅]`   `GenerateContributionButton.tsx` still destructures `stageThreshold` from the hook (line 34), returns `null` when `stageThreshold` is falsy (lines 101-102), and renders the balance callout as "Minimum {formattedThreshold} token balance for {displayName}" (lines 135-146). That UI is tied to the removed `minimum_balance` contract and hides the spend control whenever no static threshold exists.
      * `[✅]`   Non-functional: this button activates a financial operation that consumes wallet tokens — it **must fail safe** (fail closed). Generate and paused-NSF resume are allowed **only** when the hook reports a success estimate (`isCostEstimateKnown`) and wallet balance meets `stageCeiling`. When there is **no estimate** (prerequisites incomplete) or the estimate **failed** (`costCeilingError`), the hook sets `isDisabled` — this component must render the disabled control and the matching callout; it must not imply spend is allowed. Do not frame missing prerequisites as "unknown cost"; the problem is **we do not have an estimate yet** — a different problem from NSF when an estimate exists.
      * `[✅]`   Non-functional: no `selectCostCeiling` call in this component (hook owns derivation). No edits to `useStartContributionGeneration.ts` (prior node). Subscription cart prefill deferred. This node owns the **session post-project epic stack integration test** (API MSW edge → `hydrateAllStageProgress` / `stageExpectedCountsByRun` → real `selectCostCeiling` → real `computeCostCeiling` → real `useStartContributionGeneration` → button UI/gating → `generateContributions` observation).
      * `[✅]`   Functional goal (no estimate): when `showCostEstimateBlocked` is `true` and `costCeilingError` is `null` (selector returned `null` — prerequisites incomplete), render `data-testid="generate-button-no-estimate-callout"` with copy that states **no cost estimate is available yet** (e.g. "No cost estimate yet. Select models and set output cap to continue.") — not "unknown cost". Button label via `getButtonText`: **"No Estimate"**. No top-up link (not an NSF case).
      * `[✅]`   Functional goal (estimate error): when `showCostEstimateBlocked` is `true` and `costCeilingError` is non-null (`'error' in selectCostCeiling` result propagated by hook), render `data-testid="generate-button-estimate-error-callout"` displaying `costCeilingError.message` from the hook — do not invent error text; this is a **failed estimate**, not missing prerequisites and not NSF. Button label: **"Estimate Failed"**.
      * `[✅]`   Functional goal (NSF callout): when `isCostEstimateKnown` is `true`, `showBalanceCallout` is `true`, `showCostEstimateBlocked` is `false`, and `stageBalanceShortfall` is a finite positive number, render "Insufficient tokens. Top up {formattedShortfall} to continue." with a `Link` to `/subscription?tab=top-up` (`data-testid="generate-button-balance-callout"`; top-up intent per ticket line 451; full cart prefill deferred). Use `stageBalanceShortfall` from the hook — do not recompute shortfall in the component.
      * `[✅]`   Functional goal (stage estimate): when `showStageCostEstimate` is `true` and `stageCeiling` is a finite number, render a non-blocking line: "Estimated cost for this stage: ~{formattedStageCeiling} tokens." (`data-testid="generate-button-stage-cost-estimate"`).
      * `[✅]`   Functional goal (project notice): when `isCostEstimateKnown` is `true`, `projectCeiling` from the hook is a finite number, and wallet balance (read in-component via `useWalletStore` + `selectActiveChatWalletInfo` + `useAiStore().newChatContext`, same pattern as the hook) is below `projectCeiling`, render a secondary, non-blocking notice with shortfall `projectCeiling - balance` and a top-up `Link` to `/subscription?tab=top-up` (`data-testid="generate-button-project-balance-callout"`). Informational only — does not override stage gate disable. May show alongside stage estimate or NSF callout.
      * `[✅]`   Functional goal (visibility): remove the `stageThreshold` early return. Render the button host when `viewingStage` and `activeSession` from the hook are non-null. When there is no estimate or estimate failed, the hook disables spend — component **still renders** the disabled button and the appropriate blocked callout (does not return `null` and does not fail open).
      * `[✅]`   Non-functional: keep pause/resume/DAG dialog behavior unchanged except resume follows hook fail-safe disable. `getButtonText`: `showCostEstimateBlocked && costCeilingError === null` → "No Estimate"; `showCostEstimateBlocked && costCeilingError !== null` → "Estimate Failed"; `isCostEstimateKnown && !balanceMeetsThreshold` → "Insufficient Balance"; other priority unchanged.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   UI component — session-page Generate/Continue control, cost/NSF messaging, and **post-project spend-entry integration proof** for the dynamic ceiling epic.
      * `[✅]`   This node consumes the extended hook return contract and adds wallet read only for the project-level notice (project ceiling vs balance is not on the hook). It does NOT change store selectors, hook logic, or `SessionInfoCard` / Create form.
      * `[✅]`   Out of scope: subscription cart prefill helpers; `SessionInfoCard` project/stage display (next node); pre-project Autostart gates (Create form / chat button nodes).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/components/dialectic` — `GenerateContributionButton`.
      * `[✅]`   Inside: no-estimate callout, estimate-error callout, NSF callout copy, stage estimate line, project warning line, early-return rule, token number formatting, fail-safe button labels, post-project stack integration test.
      * `[✅]`   Outside: ceiling arithmetic, hook disable logic, wallet store implementation, `hydrateAllStageProgressLogic` implementation (`dialecticStore.documents` node).

    * `[✅]`   `deps`
      * `[✅]`   `useStartContributionGeneration` — provider: `@/hooks/useStartContributionGeneration`; layer: application hook; direction: inward; purpose: `isCostEstimateKnown`, `showCostEstimateBlocked`, `costCeilingError`, `showBalanceCallout`, `stageBalanceShortfall`, `stageCeiling`, `projectCeiling`, `showStageCostEstimate`, `balanceMeetsThreshold`, `isDisabled`, `viewingStage`, `activeSession`, and all existing button flags. **Integration test uses the real hook — do not mock.**
      * `[✅]`   `selectCostCeiling` — provider: `@paynless/store` (`dialecticStore.selectors.ts` node); layer: store selector; direction: inward (hook consumer only — not imported by button component); purpose: post-project `ComputeCostCeilingReturn | null` exercised by real hook in integration test.
      * `[✅]`   `ComputeCostCeilingReturn`, `ComputeCostCeilingStageInput`, `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload` — provider: `@paynless/utils` (`computeCostCeiling.provides.ts`); layer: domain utility; direction: inward; purpose: integration test hand-check expected `stageCeiling` / `projectCeiling` via mean-rate payload (`outputTokenCostRates[]`, `contributions: []` on pending stages).
      * `[✅]`   `hydrateAllStageProgress`, `GetAllStageProgressResponse`, `mockGetAllStageProgressResponse`, `mockStageProgressEntry` — provider: `@paynless/store` action + `@paynless/types` + `apps/web/src/mocks/dialecticStore.mock` (`dialecticStore.documents` node); direction: inward; purpose: populate `stageExpectedCountsByRun` from MSW-backed `getAllStageProgress` in integration test.
      * `[✅]`   `ApiError` — provider: `@paynless/types` (`api.types.ts`); layer: types; direction: inward; purpose: type of `costCeilingError` for estimate-error callout display only (import from original source in tests if needed; component reads string via hook field).
      * `[✅]`   `useWalletStore`, `selectActiveChatWalletInfo`, `useAiStore` — provider: `@paynless/store`; layer: store; direction: inward; purpose: wallet balance for project-level shortfall (component) and NSF gate (hook, integration test).
      * `[✅]`   `Link` — provider: `react-router-dom`; existing.
      * `[✅]`   `@paynless/api` client + MSW `server` from `packages/api/src/setupTests` — integration test only; mocks at API transport edge (`getAllStageProgress`, `listModelCatalog`).
      * `[✅]`   HARD dependency: `useStartContributionGeneration` node (hook return shape + `selectCostCeiling` consumption), `dialecticStore.selectors` node, `dialecticStore.documents` node (`stageExpectedCountsByRun` hydration), `computeCostCeiling` node. Precedes `SessionInfoCard` node.
      * `[✅]`   No reverse dependencies.

    * `[✅]`   `context_slice`
      * `[✅]`   From hook: `isCostEstimateKnown`, `showCostEstimateBlocked`, `costCeilingError`, `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `showStageCostEstimate`, `showBalanceCallout`, `balanceMeetsThreshold`, `isDisabled`, `viewingStage`, `activeSession`.
      * `[✅]`   From wallet store: `balance` string → `Number()` for project notice comparison only.
      * `[✅]`   No reads of `viewingStage.minimum_balance`, `stageThreshold`, or `selectCostCeiling`.

    * `[✅]`   dialectic/`GenerateContributionButton.nsf.test.tsx`
      * `[✅]`   Update `getDefaultHookReturn`: remove `stageThreshold`; add `stageCeiling: 200000`, `projectCeiling: 400000`, `stageBalanceShortfall: null`, `isCostEstimateKnown: true`, `showCostEstimateBlocked: false`, `costCeilingError: null`, `showStageCostEstimate: true`, `showBalanceCallout: false`, `balanceMeetsThreshold: true`, `isViewingAheadOfCurrentStage: false`, `viewingAheadReason: null` (defaults aligned to production `UseStartContributionGenerationReturn` after hook node).
      * `[✅]`   Replace callout assertion `Minimum.*200,000.*token balance` with `Insufficient tokens` and `Top up` and formatted shortfall (e.g. mock `isCostEstimateKnown: true`, `showCostEstimateBlocked: false`, `stageBalanceShortfall: 50000`, `showBalanceCallout: true`, `balanceMeetsThreshold: false` → "50,000" in copy); assert `href` is `/subscription?tab=top-up`; assert `generate-button-balance-callout` present; assert `generate-button-no-estimate-callout` and `generate-button-estimate-error-callout` absent.
      * `[✅]`   Update paused-NSF callout test similarly (shortfall-driven NSF copy only when `isCostEstimateKnown`; same top-up link).
      * `[✅]`   Add test: when `showStageCostEstimate` is `true` and `stageCeiling` is `120000`, `generate-button-stage-cost-estimate` shows `~120,000` (or locale-formatted equivalent) and "Estimated cost for this stage".
      * `[✅]`   Add test: when `projectCeiling` is `500000`, `isCostEstimateKnown: true`, hook supplies affordable stage ceiling, and mocked wallet `balance` is `300000`, `generate-button-project-balance-callout` is present with top-up link and shortfall `200,000`; button remains enabled when hook says so.
      * `[✅]`   Add test: when `projectCeiling` is `null`, `isCostEstimateKnown` is `false`, or wallet meets `projectCeiling`, project callout absent.
      * `[✅]`   Add test: when `isCostEstimateKnown: false`, `showCostEstimateBlocked: true`, `costCeilingError: null`, `isDisabled: true`, button renders disabled with label "No Estimate" and `generate-button-no-estimate-callout` (copy references no estimate yet — not "unknown cost"); NSF and estimate-error callouts absent.
      * `[✅]`   Add test: when `showCostEstimateBlocked: true`, `costCeilingError: { message: 'Invalid payload' }` (full `ApiError` shape from test factory), `isDisabled: true`, button label "Estimate Failed", `generate-button-estimate-error-callout` shows `Invalid payload`; no-estimate and NSF callouts absent.
      * `[✅]`   Add test: paused-NSF resume blocked when `showCostEstimateBlocked: true` and `isDisabled: true` (`costCeilingError: null` or error) — resume control disabled; `startContributionGeneration` not invoked on click.
      * `[✅]`   Preserve existing NSF tests for disabled/enabled Generate/Resume (with success estimate seeded), resume/generate click paths, pause priority. New cases appended at the end.

    * `[✅]`   dialectic/`GenerateContributionButton.test.tsx`
      * `[✅]`   Update `getDefaultHookReturn` the same way (remove `stageThreshold`; add `isCostEstimateKnown`, `showCostEstimateBlocked`, `costCeilingError`, and other hook fields from nsf test defaults).
      * `[✅]`   Replace `component returns null when stageThreshold is falsy`: assert component **renders** disabled button when `stageCeiling: null`, `isCostEstimateKnown: false`, `showCostEstimateBlocked: true`, `costCeilingError: null`, `isDisabled: true`, `viewingStage` and `activeSession` present — `generate-button-no-estimate-callout` present; component does not return `null`.
      * `[✅]`   Replace `handles currentProjectDetail being null gracefully by being disabled` cases that set `stageThreshold: undefined`: use fail-safe hook mocks (`isDisabled: true` as appropriate) without `stageThreshold`.
      * `[✅]`   Update `balance callout renders when showBalanceCallout is true` to require `isCostEstimateKnown: true`, `showCostEstimateBlocked: false`, `stageBalanceShortfall: 25000`; assert NSF copy uses shortfall ("Top up", "25,000"); no-estimate callout absent.
      * `[✅]`   Preserve all unrelated tests (pause, DAG dialog, chat context, viewing-ahead). New/updated cases appended at the end.

    * `[✅]`   dialectic/`GenerateContributionButton.tsx`
      * `[✅]`   Destructure from hook: remove `stageThreshold`; add `isCostEstimateKnown`, `showCostEstimateBlocked`, `costCeilingError`, `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `showStageCostEstimate`.
      * `[✅]`   Add imports: `useWalletStore`, `selectActiveChatWalletInfo` from `@paynless/store`; `useAiStore` from `@paynless/store` (if not already present).
      * `[✅]`   Add `const newChatContext = useAiStore((state) => state.newChatContext);` and `const activeWalletInfo = useWalletStore((state) => selectActiveChatWalletInfo(state, newChatContext));`.
      * `[✅]`   Add `formatTokenCount = (n: number): string => new Intl.NumberFormat("en-US").format(n)` (reuse for stage ceiling, shortfall, project ceiling).
      * `[✅]`   Replace early return (lines 101-102): `if (viewingStage == null || activeSession == null) return null;` — remove `formattedThreshold` and all `stageThreshold` usage.
      * `[✅]`   Update `getButtonText`: after existing stage-ready guards, if `showCostEstimateBlocked && costCeilingError === null` return `"No Estimate"`; if `showCostEstimateBlocked && costCeilingError !== null` return `"Estimate Failed"`; if `isCostEstimateKnown && !balanceMeetsThreshold` return `"Insufficient Balance"`; remaining priority unchanged (pause, resume, retry, generate).
      * `[✅]`   Compute project notice flags after wallet read: only when `isCostEstimateKnown`; `walletBalanceNum = Number(activeWalletInfo.balance)`; if `projectCeiling` is finite and `walletBalanceNum` is finite and `walletBalanceNum < projectCeiling`, set `showProjectBalanceCallout` true and `projectBalanceShortfall = projectCeiling - walletBalanceNum`; else no project callout.
      * `[✅]`   Add no-estimate callout block before NSF callout: when `showCostEstimateBlocked && costCeilingError === null` → `data-testid="generate-button-no-estimate-callout"` with fixed copy stating no cost estimate yet (not unknown cost); no `Link`.
      * `[✅]`   Add estimate-error callout block: when `showCostEstimateBlocked && costCeilingError !== null` → `data-testid="generate-button-estimate-error-callout"` displaying `costCeilingError.message`; no invented error strings.
      * `[✅]`   Replace balance callout block (lines 135-146): condition `isCostEstimateKnown && showBalanceCallout && !showCostEstimateBlocked && viewingStage && stageBalanceShortfall !== null`; link `to="/subscription?tab=top-up"`; text `Insufficient tokens. Top up {formatTokenCount(stageBalanceShortfall)} to continue.`; `data-testid="generate-button-balance-callout"`.
      * `[✅]`   Add stage estimate block: `showStageCostEstimate && stageCeiling !== null` → `data-testid="generate-button-stage-cost-estimate"` with `Estimated cost for this stage: ~{formatTokenCount(stageCeiling)} tokens.`
      * `[✅]`   Add project notice block (non-blocking, below stage estimate/callouts): when `showProjectBalanceCallout` and `projectBalanceShortfall` computed — `data-testid="generate-button-project-balance-callout"`, copy includes formatted `projectCeiling` and shortfall, `Link` to `/subscription?tab=top-up`. Wording concise (e.g. project may need ~X tokens; top up Y for the full project).
      * `[✅]`   Button remains `disabled={isDisabled || isDebouncing}` from hook — do not bypass fail-safe disable in `handleClick`. No other behavioral changes.

    * `[✅]`   dialectic/`GenerateContributionButton.integration.test.tsx`
      * `[✅]`   **Scope after hook node:** existing pause/resume/DAG dialog tests remain in this file. **Remove all `minimum_balance` wallet seeding** — replace with wallet balance derived from hand-computed `expectedStageCeiling` (via real `computeCostCeiling` on mean-rate payload: `outputTokenCostRates[]`, per-stage `contributions: []`) or explicit numeric literals decoupled from `mockThesisStage.minimum_balance`.
      * `[✅]`   Extend `vi.mock('@paynless/store', ...)` to pass through actual `selectCostCeiling`, `selectSortedStages`, and any other selectors the real `useStartContributionGeneration` hook reads (mirror additions in cost-ceiling integration file — keep both files' store mocks aligned).
      * `[✅]`   **Do not mock** `@/hooks/useStartContributionGeneration` in this file.
      * `[✅]`   Update paused-NSF resume enabled/disabled cases: sufficient wallet = balance **≥** `expectedStageCeiling`; low balance = balance **<** `expectedStageCeiling` (not `minimum_balance`).
      * `[✅]`   Preserve DAG dialog open/close behavior tests unchanged aside from wallet/ceiling fixture migration.

    * `[✅]`   dialectic/`GenerateContributionButton.costCeiling.integration.test.tsx`
      * `[✅]`   **Approved integration boundary:** MSW mocks at API transport only (mirror `CreateDialecticProjectForm.costCeiling.integration.test.tsx` and `packages/api/src/dialectic.api.integration.test.ts` — `initializeApiClient`, `server.use`, handlers for `getAllStageProgress`, `listModelCatalog`). Everything inward is **real**: `@paynless/api` client, real `hydrateAllStageProgress` store action (populates `stageExpectedCountsByRun` from `GetAllStageProgressResponse.stages[].expectedCount`), real `selectCostCeiling`, real `computeCostCeiling` (via selector), real `useStartContributionGeneration` hook, real `GenerateContributionButton`. **Do not mock** `selectCostCeiling`, `computeCostCeiling`, or `useStartContributionGeneration`. Mock only `generateContributions` / `resumePausedNsfJobs` on the dialectic store (spy) to observe click outcome without full BE generation.
      * `[✅]`   Harness: `MemoryRouter`; real `useDialecticStore` / `useWalletStore` wired with MSW-backed API (extend the pattern from existing `GenerateContributionButton.integration.test.tsx` — pass through actual `selectCostCeiling`, `selectUnifiedProjectProgress`, `selectViewingStage`, `selectSessionById`, `selectIsStageReadyForSessionIteration`, `selectSelectedModels`, `selectSortedStages` from `@paynless/store`; wallet via `walletStore.mock` or real wallet store). Import `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload`, `ComputeCostCeilingStageInput` from `@paynless/utils`; import `mockGetAllStageProgressResponse`, `mockStageProgressEntry`, `mockAiProvidersRow`, `mockAiModelConfig` from `apps/web/src/mocks/dialecticStore.mock`.
      * `[✅]`   Shared fixture constants: `stageSlug: 'thesis'`, `sessionId`, `iterationNumber`, `runKey = \`${sessionId}:${iterationNumber}\``, `maxOutputTokens`, `output_token_cost_rate` from full `AiModelExtendedConfig` on seeded `modelCatalog` row(s), `expectedCount` on `mockStageProgressEntry({ stageSlug, expectedCount: <n> })` matching BE `getAllStageProgress` integration spec for the seeded template. Derive `outputTokenCostRates: number[]` — one `output_token_cost_rate` per seeded `selectedModels` entry matched to catalog (single-model fixtures: `[rate]`; two-model mean-rate anchor: `[2, 3]` with `expectedCount: 4`, `maxOutputTokens: 1000` → `expectedStageCeiling === 10000`). Build `stages: ComputeCostCeilingStageInput[]` in template order: for each template slug, `{ stageSlug, expectedCount, contributions: [] }` (default success path — all stages pending). Compute `expectedStageCeiling` and `expectedProjectCeiling` via real `computeCostCeiling(buildComputeCostCeilingDeps(), buildComputeCostCeilingParams(), buildComputeCostCeilingPayload({ stages, maxOutputTokens, outputTokenCostRates }))` — assert `'error' not in result` in fixture setup; viewing-stage ceiling must equal `expectedCount × maxOutputTokens × (sum(outputTokenCostRates) / outputTokenCostRates.length)` (mean rate — not max across models). Seed session/project/template/recipe/progress snapshot so `selectIsStageReadyForSessionIteration` passes and button is not blocked by stage-ready guards.
      * `[✅]`   MSW handlers (success path): `getAllStageProgress` returns `mockGetAllStageProgressResponse({ stages: [mockStageProgressEntry({ stageSlug, expectedCount: <n> })] })` with required `expectedCount` on every stage entry; `listModelCatalog` returns catalog row(s) with full `AiModelExtendedConfig` matching seeded `selectedModels`.
      * `[✅]`   Setup helper: after seeding store session context, invoke real `hydrateAllStageProgress({ sessionId, iterationNumber, userId, projectId })` (or the store action the app uses on session load) so `stageExpectedCountsByRun[runKey][stageSlug]` is populated from the MSW response — **do not** write `stageExpectedCountsByRun` directly unless the hydration action cannot be invoked in the harness (prefer real hydration path; document in test comment if direct seed is unavoidable).
      * `[✅]`   Test (success stack + afford generate): wallet balance **above** `expectedStageCeiling`; after hydration `waitFor` `generate-button-stage-cost-estimate` with hand-formatted `expectedStageCeiling`; button enabled (`Generate Proposal` or stage display name); click → `generateContributions` called once. Proves API → hydration → selector → `computeCostCeiling` → hook → button allows spend.
      * `[✅]`   Test (null prerequisites — fail closed): success MSW handlers but seed `maxOutputTokens: null` (or `selectedModels: []`) before render/hydration → `waitFor` disabled button with `generate-button-no-estimate-callout`; click → `generateContributions` **not** called (no mocked selector).
      * `[✅]`   Test (API progress error — fail closed): MSW `getAllStageProgress` returns 500 so `stageExpectedCountsByRun` is not populated / selector returns `null` → disabled button + `generate-button-no-estimate-callout`; click → `generateContributions` not called; document observed store path in test comment.
      * `[✅]`   Test (insufficient wallet — fail closed): success stack + hydration; wallet **below** `expectedStageCeiling` → `waitFor` `generate-button-balance-callout` with shortfall copy; button disabled (`Insufficient Balance`); click → `generateContributions` not called.
      * `[✅]`   Test (hook callback guard — fail closed): button appears enabled only if UI guards pass, but if prerequisites are cleared between render and click (e.g. set `maxOutputTokens: null` on store immediately before click), `startContributionGeneration` returns failure and `generateContributions` not called — optional if harness can trigger; otherwise covered by hook unit tests. One behavior per test; appended at end of file.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI component + session post-project epic integration boundary.
      * `[✅]`   Deps: inward (fail-safe hook, wallet/ai stores, router `Link`; integration: API → store hydration → selectors → utils).
      * `[✅]`   Provides: outward (session-page fail-safe spend gate, no-estimate / estimate-error / NSF messaging, **proof that API → hydration → selector → computeCostCeiling → hook → button gating works** for success / null / NSF paths).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   No `stageThreshold` or `minimum_balance` in `GenerateContributionButton.tsx`. Observable: grep.
      * `[✅]`   When `showCostEstimateBlocked` and `costCeilingError === null`, disabled button shows "No Estimate" and `generate-button-no-estimate-callout` (no estimate yet — not "unknown cost" copy). Observable: unit test.
      * `[✅]`   When `showCostEstimateBlocked` and `costCeilingError !== null`, disabled button shows "Estimate Failed" and `generate-button-estimate-error-callout` with `costCeilingError.message`. Observable: unit test.
      * `[✅]`   NSF callout (`generate-button-balance-callout`) renders only when `isCostEstimateKnown` with shortfall-based copy and `/subscription?tab=top-up`. Observable: `GenerateContributionButton.nsf.test.tsx`.
      * `[✅]`   Stage estimate line renders when `showStageCostEstimate` and `stageCeiling` set. Observable: unit test.
      * `[✅]`   Project notice renders when `isCostEstimateKnown` and `projectCeiling > wallet`; informational only. Observable: unit test.
      * `[✅]`   Component renders disabled (not `null`) when `viewingStage`/`activeSession` exist but there is no estimate or estimate failed; fail closed — no enabled spend without success estimate. Observable: unit tests.
      * `[✅]`   Existing Generate/Resume/pause/DAG tests in `GenerateContributionButton.integration.test.tsx` remain green after wallet fixture migration off `minimum_balance`.
      * `[✅]`   Integration test exercises real `selectCostCeiling`, real `hydrateAllStageProgress` path (or documented equivalent), and real `useStartContributionGeneration` with MSW at API edge only. Observable: `GenerateContributionButton.costCeiling.integration.test.tsx` success + null + NSF cases green.
      * `[✅]`   Integration fixture hand-check uses `outputTokenCostRates[]` and per-stage `contributions: []` — no `maxOutputCostRate`, no `actualCost` on stage input. Observable: grep checklist node + `GenerateContributionButton.costCeiling.integration.test.tsx`.
      * `[✅]`   Existing Generate/Resume/pause/DAG unit tests remain green after `getDefaultHookReturn` migration (success-estimate defaults).

  * `[✅]`   apps/web/src/components/dialectic/SessionInfoCard **Project and viewing-stage cost estimates in session header**

    * `[✅]`   `objective`
      * `[✅]`   `SessionInfoCard.tsx` (lines 40-215) renders session chrome (back, title, model popover, wallet, progress bar, seed prompt) but shows no token-cost context. Users on the session page cannot see `projectCeiling` (completed contribution actuals + mean-rate estimates for remaining stages, from `selectCostCeiling` success) or the viewing-stage value `stageCeilings[viewingStage.slug]` without opening Generate or inferring from NSF state.
      * `[✅]`   Non-functional: read-only **inform** layer — tells users cost estimates when available; when no estimate exists, **what is required to obtain one**; when estimate computation failed, **the error message**. Does not disable Generate (hook/button own spend gate). Do not frame missing prerequisites as "unknown cost"; the problem is **we do not have an estimate yet** — distinct from estimate failure and from NSF when an estimate exists.
      * `[✅]`   Functional goal (no estimate): when `selectCostCeiling(state, session.id)` returns `null` (prerequisites incomplete — selector call never happened), render `data-testid="session-info-no-estimate-notice"` with fixed copy: `No cost estimate yet. Open Model Settings, select at least one model, set the output cap, and wait for stage counts to finish loading.` (labels match row-2 popover header "Model Settings" at L164). No numeric estimate lines; no project balance warning; no "unknown cost" wording.
      * `[✅]`   Functional goal (estimate error): when `selectCostCeiling` returns `{ error: ApiError }`, render `data-testid="session-info-estimate-error-notice"` with fixed prefix `Cost estimate failed: ` followed by `costCeilingResult.error.message` pass-through only — do not invent error text. No numeric estimate lines; no project balance warning.
      * `[✅]`   Functional goal (stage estimate): when result is success (`costCeilingResult !== null && 'error' not in costCeilingResult`) and `selectViewingStage` resolves a stage whose `slug` has a finite non-negative `stageCeilings[slug]`, render non-blocking: `Estimated cost for this stage: ~{formatTokenCount(stageCeiling)} tokens.` (`data-testid="session-info-stage-cost-estimate"`). Not gated on wallet balance (informational).
      * `[✅]`   Functional goal (project estimate): on success branch, when `projectCeiling` is finite non-negative, render `Estimated project cost: ~{formatTokenCount(projectCeiling)} tokens.` (`data-testid="session-info-project-cost-estimate"`). `projectCeiling` sums completed actuals + remaining estimates (no breakdown in this node).
      * `[✅]`   Functional goal (project balance notice): on success branch only — when `projectCeiling` is finite and wallet balance (`useWalletStore` + `selectActiveChatWalletInfo` + `useAiStore().newChatContext`, same pattern as `GenerateContributionButton`) is below `projectCeiling`, render `data-testid="session-info-project-balance-warning"`: `This project may need ~{formatTokenCount(projectCeiling)} tokens total. Top up {formatTokenCount(projectBalanceShortfall)} to cover the full project.` with `Link to="/subscription?tab=top-up"`. Informational only — does not enable Generate. May appear alongside stage/project estimate lines.
      * `[✅]`   Functional goal (branching): `costCeilingResult === null` → no-estimate notice only; `'error' in costCeilingResult` → estimate-error notice only; else → success lines (stage and/or project and/or warning per finite checks). Mutually exclusive null/error notices vs success block.
      * `[✅]`   Non-functional: preserve existing toolbar, seed prompt, progress bar, and `generateContributionsError` alert behavior. No `useStartContributionGeneration` import. No `selectPreProjectCostCeiling`. No subscription cart prefill (deferred). No edits to `GenerateContributionButton` or the hook (prior nodes).
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   UI component — session-page header cost transparency and prerequisite guidance.
      * `[✅]`   This node adds read-only cost display and no-estimate / estimate-error notices beside wallet/progress. It does NOT implement NSF disable, Autostart gating, or selector logic.
      * `[✅]`   Out of scope: `CreateDialecticProjectForm` pre-project preview (next node); hook/button spend-gate copy (prior nodes).

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/components/dialectic` — `SessionInfoCard`.
      * `[✅]`   Inside: `selectCostCeiling` / `selectViewingStage` subscriptions, three-way result branching, token formatting, no-estimate notice, estimate-error notice, success estimate lines, project balance warning, placement under row 2.
      * `[✅]`   Outside: ceiling arithmetic, counts hydration, wallet store implementation.

    * `[✅]`   `deps`
      * `[✅]`   `selectCostCeiling`, `selectViewingStage` — provider: `@paynless/store` (`dialecticStore.selectors` node); layer: store selectors; direction: inward; purpose: `ComputeCostCeilingReturn | null` and viewing-stage slug object.
      * `[✅]`   `ComputeCostCeilingReturn` — provider: `@paynless/utils` (`computeCostCeiling.provides.ts`); layer: types; direction: inward; import from original source only (success fields read only after `'error' not in result` narrow).
      * `[✅]`   `useWalletStore`, `selectActiveChatWalletInfo`, `useAiStore` — provider: `@paynless/store`; layer: store; direction: inward; purpose: wallet balance for project shortfall notice on success branch only.
      * `[✅]`   `Link` — provider: `react-router-dom`; add alongside existing `useNavigate` import site.
      * `[✅]`   HARD dependency: `dialecticStore.selectors` node (`selectCostCeiling` export). Soft ordering: after `GenerateContributionButton` node; this component does not consume the hook.
      * `[✅]`   No reverse dependencies.

    * `[✅]`   `context_slice`
      * `[✅]`   `session` from `state.activeSessionDetail` (lines 44-46) supplies `session.id` for `selectCostCeiling(state, session.id)`.
      * `[✅]`   `costCeilingResult: ComputeCostCeilingReturn | null` from `selectCostCeiling`; branch null / error / success before reading numeric fields.
      * `[✅]`   `viewingStage` from `selectViewingStage(state)`; on success only — `stageCeiling` from `costCeilingResult.stageCeilings[viewingStage.slug]` when finite non-negative.
      * `[✅]`   On success only — `projectCeiling` from `costCeilingResult.projectCeiling` when finite non-negative.
      * `[✅]`   No reads of `minimum_balance`, `stageThreshold`, `useStartContributionGeneration`, or `selectPreProjectCostCeiling`.

    * `[✅]`   dialectic/`SessionInfoCard.test.tsx`
      * `[✅]`   Extend `vi.hoisted`: `selectCostCeilingMock = vi.fn<[DialecticStateValues, string], ComputeCostCeilingReturn | null>()` defaulting to `null`.
      * `[✅]`   Extend `vi.mock('@paynless/store', ...)`: expose `selectCostCeiling: selectCostCeilingMock` and `selectViewingStage` from actual `@paynless/store` or dialectic mock (must supply viewing stage with `slug` for cost tests). Import `ComputeCostCeilingReturn`, `buildComputeCostCeilingErrorReturn` from `@paynless/utils`; `ApiError` from `@paynless/types` for error factory in tests.
      * `[✅]`   In cost-test fixtures: seed `viewingStageSlug` / `selectViewingStage` return with `slug: 'thesis'`, `currentProjectDetail` with stages array, `selectedModels` non-empty when mirroring Group-4 selector fixtures.
      * `[✅]`   Append `describe('cost ceiling display (SessionInfoCard)')` at end of file; `beforeEach` resets `selectCostCeilingMock` to `null`. One behavior per test.
      * `[✅]`   Test (success both lines): mock `{ stageCeilings: { thesis: 120000 }, projectCeiling: 350000 }`, viewing stage `thesis` → `session-info-stage-cost-estimate` shows `~120,000` and "Estimated cost for this stage"; `session-info-project-cost-estimate` shows `~350,000` and "Estimated project cost"; `session-info-no-estimate-notice` and `session-info-estimate-error-notice` absent.
      * `[✅]`   Test (null → guidance): mock `null` → `session-info-no-estimate-notice` present with copy containing "Model Settings", "output cap", and "stage counts"; `session-info-stage-cost-estimate`, `session-info-project-cost-estimate`, `session-info-project-balance-warning`, and `session-info-estimate-error-notice` absent.
      * `[✅]`   Test (estimate error): mock `buildComputeCostCeilingErrorReturn({ error: { message: 'Invalid payload', ... } })` (full `ApiError` from test factory) → `session-info-estimate-error-notice` contains `Invalid payload`; `session-info-no-estimate-notice` absent; numeric estimate testids absent.
      * `[✅]`   Test (project warning): success mock `projectCeiling: 400000`, stage ceiling present, `initializeMockWalletStore` balance `250000` → `session-info-project-balance-warning` present, top-up `Link` `href="/subscription?tab=top-up"`, shortfall `150,000` in copy; stage/project estimate testids present.
      * `[✅]`   Test (wallet sufficient): success mock, wallet balance ≥ `projectCeiling` → `session-info-project-balance-warning` absent; estimates present.
      * `[✅]`   Test (missing stage slug): success mock without `thesis` in `stageCeilings`, viewing stage `thesis` → `session-info-stage-cost-estimate` absent; `session-info-project-cost-estimate` present if `projectCeiling` finite.
      * `[✅]`   Preserve all existing tests (seed prompt, progress bar, export dropdown, 2-row toolbar). New cases appended only.

    * `[✅]`   dialectic/`SessionInfoCard.tsx`
      * `[✅]`   Add imports: `selectCostCeiling`, `selectViewingStage`, `useWalletStore`, `selectActiveChatWalletInfo`, `useAiStore` from `@paynless/store`; `ComputeCostCeilingReturn` from `@paynless/utils`; `Link` from `react-router-dom`.
      * `[✅]`   Subscribe `costCeilingResult: ComputeCostCeilingReturn | null`: `useDialecticStore(useShallow((state) => { const sid = state.activeSessionDetail?.id; if (sid === undefined) return null; return selectCostCeiling(state, sid); }))` (before skeleton early return is fine).
      * `[✅]`   `const viewingStage = useDialecticStore(selectViewingStage);`
      * `[✅]`   `const newChatContext = useAiStore((state) => state.newChatContext);` and `const activeWalletInfo = useWalletStore((state) => selectActiveChatWalletInfo(state, newChatContext));`
      * `[✅]`   `const formatTokenCount = (n: number): string => new Intl.NumberFormat("en-US").format(n);` (match `GenerateContributionButton` node).
      * `[✅]`   After row 2 block (after line 183 `</div>`), before `generateContributionsError` alert: wrapper `div` with `className="text-xs text-muted-foreground space-y-1"`.
      * `[✅]`   When `costCeilingResult === null`: render `data-testid="session-info-no-estimate-notice"` — `No cost estimate yet. Open Model Settings, select at least one model, set the output cap, and wait for stage counts to finish loading.`
      * `[✅]`   When `costCeilingResult !== null && 'error' in costCeilingResult`: render `data-testid="session-info-estimate-error-notice"` — `Cost estimate failed: {costCeilingResult.error.message}`
      * `[✅]`   When `costCeilingResult !== null && 'error' not in costCeilingResult`: derive `stageCeiling` from `costCeilingResult.stageCeilings[viewingStage.slug]` when `viewingStage !== null` and value is finite non-negative; derive `projectCeiling` from `costCeilingResult.projectCeiling` when finite non-negative; when `stageCeiling !== null` render `session-info-stage-cost-estimate`; when `projectCeiling !== null` render `session-info-project-cost-estimate`; when `projectCeiling` and `Number(activeWalletInfo.balance)` are finite and balance < `projectCeiling`, compute `projectBalanceShortfall = projectCeiling - balance` and render `session-info-project-balance-warning` with copy and `Link to="/subscription?tab=top-up"` per objective.
      * `[✅]`   No other behavioral changes.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI component.
      * `[✅]`   Deps: inward (store selectors `ComputeCostCeilingReturn | null`, wallet/ai stores, router `Link`).
      * `[✅]`   Provides: outward (session-header cost transparency, prerequisite guidance, estimate-error display).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   No `minimum_balance`, `stageThreshold`, `project_ceiling`, `stage_ceiling`, `useStartContributionGeneration`, or `selectPreProjectCostCeiling` in `SessionInfoCard.tsx`. Observable: grep.
      * `[✅]`   When `selectCostCeiling` returns `null`, `session-info-no-estimate-notice` renders with prerequisite copy (Model Settings, output cap, stage counts). Observable: unit test.
      * `[✅]`   When `selectCostCeiling` returns `{ error: ApiError }`, `session-info-estimate-error-notice` renders with pass-through `error.message`. Observable: unit test.
      * `[✅]`   Stage and project estimate lines render on success branch when ceilings finite for session/viewing slug. Observable: unit tests.
      * `[✅]`   Project balance warning renders on success branch only when `projectCeiling > wallet`; does not hide toolbar or progress. Observable: unit test.
      * `[✅]`   Existing SessionInfoCard tests (seed prompt, progress, export, 2-row layout) remain green.

  * `[✅]`   apps/web/src/components/dialectic/CreateDialecticProjectForm **Pre-project cost preview, fail-safe Autostart gate, project balance warning, and pre-project ceiling stack integration**

    * `[✅]`   `objective`
      * `[✅]`   `CreateDialecticProjectForm.tsx` gates Autostart on `sortedStages[0]?.minimum_balance` (lines 400-418, 420-431) and never surfaces dynamic ceilings. Ticket lines 458-464 require pre-project `projectCeiling` and first-stage `stageCeilings[firstStageSlug]` from `selectPreProjectCostCeiling` (fed by `fetchProcessAssociation` → `fetchStageExpectedCounts` → `preProjectStageExpectedCounts`), display copy, a non-blocking project warning when `projectCeiling > wallet`, and Autostart forced off when `stageCeilings[firstStageSlug]` exceeds wallet (Create still allowed via Autoconfig/Manual).
      * `[✅]`   Non-functional: Autostart (`startGeneration === true` → navigation with `autoStartGeneration: true`) is a **financial operation that consumes wallet tokens** — it **must fail safe** (fail closed). Autostart is allowed **only** when `selectPreProjectCostCeiling` returns a **success** estimate with a finite first-stage ceiling **and** wallet balance meets or exceeds that ceiling. Unknown estimate (`null` prerequisites) or selector/function error (`'error' in result`) **must block Autostart and block autostart submit** — no fail-open path. No fallback to `minimum_balance`. Autoconfig and Manual Create remain allowed per ticket when project ceiling exceeds wallet (informational warning only); they do not auto-start generation.
      * `[✅]`   Functional goal (association + template + counts orchestration): when `selectedDomain` (`DialecticDomainRow | null`) has a non-empty `id`, call `fetchProcessAssociation({ domainId: selectedDomain.id })` (re-fetch when `selectedDomain?.id` changes). When `selectedDomainProcessAssociation` is a validated row with non-empty `process_template_id`, call `fetchProcessTemplate(association.process_template_id)` and, when `uniqueModelCount >= 1`, call `fetchStageExpectedCounts({ processTemplateId: association.process_template_id, modelCount: uniqueModelCount })` (re-fetch template/counts when association row or `uniqueModelCount` changes). When `selectedDomain` is `null`, association is `null`, `domainProcessAssociationError` is set, or `process_template_id` is missing — do not call `fetchProcessTemplate` or `fetchStageExpectedCounts`; render no-estimate notice (not cost preview). No fabricated template id; do not read `process_template_id` from `DialecticDomainRow`.
      * `[✅]`   Functional goal (fetch counts guard): do not call `fetchStageExpectedCounts` when `uniqueModelCount < 1` or `selectedDomainProcessAssociation?.process_template_id` is absent. Count payload uses `association.process_template_id`, not `currentProcessTemplate?.id` alone (template hydration may lag; association row is the SSOT for pre-project `processTemplateId`).
      * `[✅]`   Functional goal (three-way selector result): subscribe `preProjectCostCeilingResult: ComputeCostCeilingReturn | null` from `selectPreProjectCostCeiling`. Branch before reading numeric fields: `null` → prerequisites incomplete; `'error' in result` → estimate computation failed; else → success. Derive `preProjectCostCeilingError: ApiError | null` on error branch only; `isPreProjectCostEstimateKnown: boolean` — `true` only on success when `firstStageCeiling` is finite non-negative for `sortedStages[0].slug`; `canAffordAutostart: boolean` — `isPreProjectCostEstimateKnown && Number(walletInfo.balance) >= firstStageCeiling`.
      * `[✅]`   Functional goal (no estimate): when `preProjectCostCeilingResult === null` (includes `isLoadingDomainProcessAssociation`, `isLoadingStageExpectedCounts`, missing cap/rate/counts), render `data-testid="create-project-no-estimate-notice"`: `No cost estimate yet. Select at least one model, set the output cap, and wait for stage counts to finish loading.` No preview; no project balance warning; **Autostart forced off** (fail closed).
      * `[✅]`   Functional goal (estimate error): when `'error' in preProjectCostCeilingResult`, render `data-testid="create-project-estimate-error-notice"`: `Cost estimate failed: {preProjectCostCeilingResult.error.message}` pass-through only. No preview; no project balance warning; **Autostart forced off** (fail closed).
      * `[✅]`   Functional goal (preview copy — success only): when success and `sortedStages[0]` exists with slug `firstSlug`, read `firstStageCeiling = result.stageCeilings[firstSlug]` and `projectCeiling = result.projectCeiling` (finite non-negative only); when both finite, render `data-testid="create-project-cost-preview"`: "Estimated token cost: ~{projectCeiling} for the full project, ~{firstStageCeiling} for the first stage." (`Intl.NumberFormat("en-US")`). No fallback to `minimum_balance`.
      * `[✅]`   Functional goal (project warning — success only): when `projectCeiling` is finite and wallet balance (`walletInfo` via `selectActiveChatWalletInfo(state, null)`) is below `projectCeiling`, render non-blocking `data-testid="create-project-project-balance-warning"` with shortfall and `Link` to `/subscription?tab=top-up`. Does not disable Create submit.
      * `[✅]`   Functional goal (Autostart gate): replace `firstStageMinBalance` / `minimum_balance` in autostart `useEffect` (lines 400-418) and `autoUncheckReason` (lines 420-431). When `!configureManually`: `noDefaults` → `setStartGeneration(false)` (unchanged); else if `!canAffordAutostart` → `setStartGeneration(false)` (**includes null, error, and insufficient balance**); else → `setStartGeneration(true)`. `autoUncheckReason` priority: `noDefaults` → "No default models available"; `preProjectCostCeilingError !== null` → pass-through error message; `!isPreProjectCostEstimateKnown` → estimate-not-ready copy; `autostartBlockedByBalance` → "Estimated first-stage cost exceeds wallet balance for auto-start" with `create-project-autostart-top-up-link` → `/subscription?tab=top-up`.
      * `[✅]`   Functional goal (`cycleSetupMode` fail-safe): when transition would enable Autostart (`setStartGeneration(true)`), if `!canAffordAutostart`, do not enable Autostart — remain Autoconfig and surface `autoUncheckReason` (defense against checkbox cycling past the effect).
      * `[✅]`   Functional goal (submit fail-safe): in `onSubmit`, when `!configureManually && startGeneration` (Autostart spend path), before `createProjectAndAutoStart`: if `preProjectCostCeilingResult === null`, toast error and return; if `'error' in preProjectCostCeilingResult`, toast `preProjectCostCeilingResult.error.message` and return; if `firstStageCeiling === null` or `Number(walletInfo.balance) < firstStageCeiling`, toast and return. Only then call `createProjectAndAutoStart` with autostart intent. Autoconfig (`!configureManually && !startGeneration`) and Manual paths unchanged except ceiling-based autostart eligibility (Create allowed per ticket). Defense in depth — UI gate plus submit guard.
      * `[✅]`   Functional goal (submit template id): on submit, set `processTemplateId` on `CreateProjectPayload` / `CreateProjectAndAutoStartPayload` from `selectedDomainProcessAssociation.process_template_id` when association is stored and `process_template_id` is a non-empty string; if missing at submit time, log error and return (same as missing `selectedDomainId`). Store `createDialecticProject` / `createProjectAndAutoStart` append `processTemplateId` to FormData (prior `dialecticStore.ts` node).
      * `[✅]`   Non-functional: no `selectCostCeiling` (post-project) in this form; no edits to `dialecticStore.ts`, selectors, or BE. Subscription cart prefill deferred. `currentProcessTemplate` must be hydrated (via association → `fetchProcessTemplate`) before `selectSortedStages` / cost preview can render. This node owns the **pre-project epic stack integration test** (API MSW edge → store actions → real selectors → real `computeCostCeiling` → form UI/gating).
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   UI component — pre-project cost transparency and **fail-safe Autostart affordability gate** (primary pre-project spend entry point for the dynamic ceiling epic).
      * `[✅]`   This node orchestrates the pre-project call chain documented in `dialecticStore` `interaction.spec`: `fetchProcessAssociation` → `fetchProcessTemplate` / `fetchStageExpectedCounts`, wires `selectPreProjectCostCeiling` into the create UX, and proves the full pre-project stack via integration test. It does NOT implement store actions, guards, or selector arithmetic (prior Group 3/4 nodes).
      * `[✅]`   Out of scope: session-page consumers (prior nodes); subscription cart prefill; BE handlers; `listDomains` / `fetchDomains` implementation (domain picker elsewhere calls `fetchDomains`; this form reads `selectedDomain` only); `CreateProjectFromChatButton` (separate node).
      * `[✅]`   HARD dependency: `dialectic.api` node (`DialecticDomainRow`, `DomainProcessAssociationRow`, `fetchProcessAssociation`, `getStageExpectedCounts`, `CreateProjectPayload.processTemplateId`), `dialecticStore.ts` node (`fetchProcessAssociation`, `selectedDomainProcessAssociation`, `fetchStageExpectedCounts`, `createDialecticProject` FormData `processTemplateId`), `dialecticStore.selectors` node (`selectPreProjectCostCeiling`, `ComputeCostCeilingReturn | null`), `computeCostCeiling` node, `createProject` BE node. Precedes `CreateProjectFromChatButton` and commit node below.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/components/dialectic` — `CreateDialecticProjectForm`.
      * `[✅]`   Inside: domain-selection orchestration effects, three-way ceiling result branching, no-estimate / estimate-error notices, success preview + project warning, fail-safe Autostart gate + submit guard, `processTemplateId` on submit, token formatting, pre-project stack integration test.
      * `[✅]`   Outside: `computeCostCeiling` implementation body, store action implementations, API transport handlers, association SQL.

    * `[✅]`   `deps`
      * `[✅]`   `fetchProcessAssociation` — provider: `@paynless/store` (`dialecticStore.ts` node); layer: store action; direction: inward; purpose: load `selectedDomainProcessAssociation` after domain selection.
      * `[✅]`   `fetchProcessTemplate` — provider: `@paynless/store` (`dialecticStore.ts`, existing action); layer: store action; direction: inward; purpose: hydrate `currentProcessTemplate` from `selectedDomainProcessAssociation.process_template_id` for `selectSortedStages`.
      * `[✅]`   `fetchStageExpectedCounts` — provider: `@paynless/store` (`dialecticStore.ts` node); layer: store action; direction: inward; purpose: populate `preProjectStageExpectedCounts` using `processTemplateId` from association row.
      * `[✅]`   `selectedDomainProcessAssociation`, `domainProcessAssociationError`, `isLoadingDomainProcessAssociation`, `isLoadingStageExpectedCounts`, `stageExpectedCountsError` — provider: `@paynless/store` `DialecticStateValues`; direction: inward; purpose: orchestration gates and loading → selector `null`.
      * `[✅]`   `selectPreProjectCostCeiling`, `selectSortedStages` — provider: `@paynless/store` (`dialecticStore.selectors` node); layer: selectors; direction: inward; purpose: `ComputeCostCeilingReturn | null`.
      * `[✅]`   `ComputeCostCeilingReturn`, `ComputeCostCeilingSuccessReturn`, `ComputeCostCeilingStageInput`, `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload` — provider: `@paynless/utils` (`computeCostCeiling.provides.ts`); layer: domain utility; direction: inward; purpose: integration test hand-check expected `firstStageCeiling` / `projectCeiling` via mean-rate payload (`outputTokenCostRates[]`, per-stage `contributions: []` on pre-project path).
      * `[✅]`   `ApiError` — provider: `@paynless/types` (`api.types.ts`); layer: types; direction: inward; purpose: `preProjectCostCeilingError` typing.
      * `[✅]`   `DomainProcessAssociationRow`, `GetStageExpectedCountsResponse` — provider: `@paynless/types`; direction: inward; purpose: integration MSW fixtures and typed reads.
      * `[✅]`   `currentProcessTemplate`, `selectedDomain` (`DialecticDomainRow`), `selectSelectedModels` / `uniqueModelCount`, `maxOutputTokens`, `modelCatalog` — existing store reads.
      * `[✅]`   `walletInfo` / `selectActiveChatWalletInfo` — existing (line 121-124).
      * `[✅]`   `Link` — provider: `react-router-dom`; direction: inward.
      * `[✅]`   `@paynless/api` client + MSW `server` from `packages/api/src/setupTests` — integration test only; mocks at API transport edge.
      * `[✅]`   HARD dependency: `dialecticStore.selectors`, `dialecticStore.ts`, `computeCostCeiling`, `dialectic.api`. Precedes `CreateProjectFromChatButton` and commit node.
      * `[✅]`   No reverse dependencies.

    * `[✅]`   `context_slice`
      * `[✅]`   `domainId` = `selectedDomain?.id` (full `DialecticDomainRow`, no template field on domain).
      * `[✅]`   `processTemplateId` (pre-project SSOT) = `selectedDomainProcessAssociation?.process_template_id` (non-empty string only); used for `fetchProcessTemplate`, `fetchStageExpectedCounts`, and submit payload.
      * `[✅]`   `modelCount` = `uniqueModelCount` (existing lines 152-155).
      * `[✅]`   `firstStageSlug` = `sortedStages[0]?.slug` when `sortedStages.length > 0` (requires `currentProcessTemplate` hydrated).
      * `[✅]`   `preProjectCostCeilingResult: ComputeCostCeilingReturn | null` = `useDialecticStore(selectPreProjectCostCeiling)`; branch null / error / success before numeric reads.
      * `[✅]`   No reads of `minimum_balance` or `default_process_template_id` anywhere in the file after this node.

    * `[✅]`   dialectic/`CreateDialecticProjectForm.autostart.test.tsx`
      * `[✅]`   Extend `vi.mock('@paynless/store', ...)`: expose `selectPreProjectCostCeiling: vi.fn<[DialecticStateValues], ComputeCostCeilingReturn | null>()` (default `null`); expose `fetchProcessAssociation`, `fetchProcessTemplate`, and `fetchStageExpectedCounts` via `getDialecticStoreActionMock` / mock store actions (spy on calls). Import `ComputeCostCeilingReturn`, `ComputeCostCeilingSuccessReturn`, `buildComputeCostCeilingErrorReturn` from `@paynless/utils`; `ApiError` from `@paynless/types`.
      * `[✅]`   Seed `selectedDomain` as full `DialecticDomainRow` (no `default_process_template_id`). Seed `selectedDomainProcessAssociation` as full `DomainProcessAssociationRow` with `domain_id` matching `selectedDomain.id`, `is_default_for_domain: true`, and `process_template_id` matching `processTemplateForAutostartBalanceTest.id` in cost-preview / autostart tests.
      * `[✅]`   Add test: when `selectedDomain.id` is set, `fetchProcessAssociation` called with `{ domainId: selectedDomain.id }` after render (`waitFor`).
      * `[✅]`   Add test: when `selectedDomainProcessAssociation` is `null` (association error / not loaded), `fetchProcessTemplate` and `fetchStageExpectedCounts` are not called.
      * `[✅]`   Add test: when association row present with `process_template_id`, `fetchProcessTemplate` called with that id (`waitFor`).
      * `[✅]`   Add test: Manual submit payload includes `processTemplateId` equal to `selectedDomainProcessAssociation.process_template_id`.
      * `[✅]`   Add test: Autoconfig submit payload includes `processTemplateId` on `createProjectAndAutoStart` mock call from association row.
      * `[✅]`   Replace test `defaults to Autoconfig when wallet balance below thesis threshold` (lines 474-493): remove reliance on `stageThesisForAutostart.minimum_balance`; mock success `{ stageCeilings: { thesis: firstStageMinBalanceForAutostartTest }, projectCeiling: firstStageMinBalanceForAutostartTest }` with wallet `balance: String(firstStageMinBalanceForAutostartTest - 1)`; expect Autoconfig + ceiling copy (not `minimum_balance`).
      * `[✅]`   Add test: when mock returns success and wallet meets first-stage ceiling, default remains Autostart (checked).
      * `[✅]`   Add test: when mock returns `null`, `create-project-no-estimate-notice` present; Autostart unchecked; `autoUncheckReason` mentions estimate not ready; `create-project-cost-preview` absent.
      * `[✅]`   Add test: when mock returns `buildComputeCostCeilingErrorReturn(...)`, `create-project-estimate-error-notice` contains pass-through `error.message`; Autostart unchecked; preview absent.
      * `[✅]`   Add test: when mock returns `null` or error, submit with Autostart intent (`startGeneration true`) does not call `createProjectAndAutoStart` (or toast.error and no call); Autoconfig submit may still proceed when other guards pass.
      * `[✅]`   Add test: when mock returns success and wallet meets ceiling, Autostart submit calls `createProjectAndAutoStart` once.
      * `[✅]`   Add test: `fetchStageExpectedCounts` called with `{ processTemplateId: selectedDomainProcessAssociation.process_template_id, modelCount: 1 }` after association + template seeded (`waitFor`).
      * `[✅]`   Add test: success mock → `create-project-cost-preview` shows formatted project + first-stage ceilings when `sortedStages[0].slug === 'thesis'`.
      * `[✅]`   Add test: success mock → `create-project-project-balance-warning` when `projectCeiling` exceeds wallet; Create button still enabled.
      * `[✅]`   Add test: `create-project-autostart-top-up-link` present when autostart blocked by balance; `href` `/subscription?tab=top-up`.
      * `[✅]`   Add test: `cycleSetupMode` from Autoconfig does not enable Autostart when mock returns `null` or error (`canAffordAutostart` false).
      * `[✅]`   Preserve all other autostart tests (setup mode cycle, submit paths, loaders). New cases appended.

    * `[✅]`   dialectic/`CreateDialecticProjectForm.test.tsx`
      * `[✅]`   Align store mock with autostart file: `selectPreProjectCostCeiling: vi.fn<..., ComputeCostCeilingReturn | null>()` default `null`; expose `fetchProcessAssociation` spy; seed `selectedDomainProcessAssociation` with `process_template_id` on submit tests.
      * `[✅]`   Add test: success mock → `create-project-cost-preview` visible; `null` → `create-project-no-estimate-notice` visible, preview absent; error mock → `create-project-estimate-error-notice` visible, preview absent.
      * `[✅]`   Update Manual-path tests: expect `processTemplateId` equal to `selectedDomainProcessAssociation.process_template_id`.
      * `[✅]`   Preserve unrelated tests (TextInputArea props, manual submit, placeholders). New cases appended.

    * `[✅]`   dialectic/`CreateDialecticProjectForm.tsx`
      * `[✅]`   Add imports: `selectPreProjectCostCeiling`, `fetchProcessAssociation`, `fetchStageExpectedCounts` from `@paynless/store`; `ComputeCostCeilingReturn` from `@paynless/utils`; `ApiError` from `@paynless/types`; `Link` from `react-router-dom`.
      * `[✅]`   Store subscriptions: `fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`, `selectedDomainProcessAssociation`, `currentProcessTemplate`, `isLoadingDomainProcessAssociation`, `isLoadingStageExpectedCounts` (read-only for loading context if needed in copy).
      * `[✅]`   `const preProjectCostCeilingResult: ComputeCostCeilingReturn | null = useDialecticStore(selectPreProjectCostCeiling);`
      * `[✅]`   `const formatTokenCount = (n: number): string => new Intl.NumberFormat("en-US").format(n);`
      * `[✅]`   Add `useEffect` for association fetch (deps: `selectedDomain?.id`, `fetchProcessAssociation`): when `selectedDomain?.id` is a non-empty string, call `fetchProcessAssociation({ domainId: selectedDomain.id })`.
      * `[✅]`   Add `useEffect` for template + counts (deps: `selectedDomainProcessAssociation?.process_template_id`, `uniqueModelCount`, `fetchProcessTemplate`, `fetchStageExpectedCounts`): when `selectedDomainProcessAssociation?.process_template_id` is a non-empty string, call `fetchProcessTemplate(...)`; when same id present and `uniqueModelCount >= 1`, call `fetchStageExpectedCounts({ processTemplateId, modelCount: uniqueModelCount })`.
      * `[✅]`   Derive `preProjectCostCeilingError: ApiError | null`: if `preProjectCostCeilingResult !== null && 'error' in preProjectCostCeilingResult`, return `preProjectCostCeilingResult.error`; else `null`.
      * `[✅]`   Derive `firstStageSlug: string | null` from `sortedStages[0]?.slug ?? null`.
      * `[✅]`   Derive `firstStageCeiling: number | null`: if `preProjectCostCeilingResult === null || 'error' in preProjectCostCeilingResult || firstStageSlug === null`, return `null`; read `preProjectCostCeilingResult.stageCeilings[firstStageSlug]`; if not finite non-negative, return `null`; else return the number.
      * `[✅]`   Derive `projectCeiling: number | null`: if `preProjectCostCeilingResult === null || 'error' in preProjectCostCeilingResult`, return `null`; if `preProjectCostCeilingResult.projectCeiling` not finite non-negative, return `null`; else return it.
      * `[✅]`   Derive `isPreProjectCostEstimateKnown: boolean` = `firstStageCeiling !== null`.
      * `[✅]`   Derive `canAffordAutostart: boolean` = `isPreProjectCostEstimateKnown && Number(walletInfo.balance) >= firstStageCeiling` (reject `NaN`).
      * `[✅]`   Replace autostart `useEffect` (lines 400-418): remove `minimum_balance`; when `configureManually` return; `noDefaults` → `setStartGeneration(false)`; else if `!canAffordAutostart` → `setStartGeneration(false)`; else → `setStartGeneration(true)`.
      * `[✅]`   Replace `autoUncheckReason` (lines 420-431): priority chain per objective (noDefaults → error message → estimate not ready → balance ceiling copy).
      * `[✅]`   Update `cycleSetupMode`: when enabling Autostart, if `!canAffordAutostart`, do not call `setStartGeneration(true)`.
      * `[✅]`   In `CardContent` (before `CardFooter`): when `preProjectCostCeilingResult === null` → `create-project-no-estimate-notice`; when `'error' in preProjectCostCeilingResult` → `create-project-estimate-error-notice`; on success → preview when both ceilings finite; project warning when `projectCeiling > wallet`; top-up link in autostart reason area when balance blocks autostart.
      * `[✅]`   In `onSubmit`: read `processTemplateId` from association row — abort if missing; when `!configureManually && startGeneration`, apply fail-safe guard (null / error / insufficient ceiling → toast + return) before `createProjectAndAutoStart`; set `processTemplateId` on payloads.
      * `[✅]`   Remove all `minimum_balance` and `default_process_template_id` identifiers from the file.

    * `[✅]`   dialectic/`CreateDialecticProjectForm.costCeiling.integration.test.tsx`
      * `[✅]`   **Approved integration boundary:** MSW mocks at API transport only (mirror `packages/api/src/dialectic.api.integration.test.ts` — `initializeApiClient`, `server.use`, `http.post` to `dialectic-service`). Everything inward is **real**: `@paynless/api` client, real store actions (`fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`), real `selectPreProjectCostCeiling`, real `computeCostCeiling` (via selector). **Do not mock** `selectPreProjectCostCeiling` or `computeCostCeiling`. Mock only outbound `createProjectAndAutoStart` / `createDialecticProject` on the dialectic store mock (or spy) to observe submit without full BE project creation.
      * `[✅]`   Harness: `MemoryRouter`; real `useDialecticStore` / `useWalletStore` from `@paynless/store` (or test harness that wires real store with MSW-backed API — same pattern as `GenerateContributionButton.integration.test.tsx` but import actual `selectPreProjectCostCeiling` from `@paynless/store` alongside actual selectors). Seed `fetchAIModelCatalog` / catalog ready path so form renders past loader. Import `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload`, `ComputeCostCeilingStageInput` from `@paynless/utils` for hand-check expected ceilings.
      * `[✅]`   Shared fixture constants: `domainId`, `processTemplateId`, `firstStageSlug: 'thesis'`, `modelCount: 1`, `maxOutputTokens`, `output_token_cost_rate` from full `AiModelExtendedConfig` on seeded `modelCatalog` row(s), `GetStageExpectedCountsResponse` counts matching BE integration spec (e.g. thesis `expectedCount: 5` for `modelCount: 1` — use the same hand-computed value as `getStageExpectedCounts.integration.test.ts` for the seeded template). Derive `outputTokenCostRates: number[]` — one `output_token_cost_rate` per seeded `selectedModels` entry matched to catalog (single-model fixtures: `[rate]`; two-model mean-rate anchor: `[2, 3]` with `expectedCount: 4`, `maxOutputTokens: 1000` → first-stage `expectedFirstStageCeiling === 10000`). Build `stages: ComputeCostCeilingStageInput[]` from response counts: for each stage slug, `{ stageSlug, expectedCount, contributions: [] }` (pre-project — all stages pending). Compute `expectedFirstStageCeiling` and `expectedProjectCeiling` via real `computeCostCeiling(buildComputeCostCeilingDeps(), buildComputeCostCeilingParams(), buildComputeCostCeilingPayload({ stages, maxOutputTokens, outputTokenCostRates }))` — assert `'error' not in result` in fixture setup; first-stage ceiling must equal `expectedCount(firstStageSlug) × maxOutputTokens × (sum(outputTokenCostRates) / outputTokenCostRates.length)` (mean rate — not max across models).
      * `[✅]`   MSW handlers (success path): `fetchProcessAssociation` action → return full `DomainProcessAssociationRow` with matching `domain_id` and `process_template_id`; `getStageExpectedCounts` → return full `GetStageExpectedCountsResponse` with per-stage counts; `fetchProcessTemplate` / template fetch → hydrate template with stage slug `thesis` (match existing autostart test template fixtures in `dialecticStore.mock`).
      * `[✅]`   Test (success stack + afford autostart): render `CreateDialecticProjectForm`; `waitFor` association + counts + template effects; `waitFor` `create-project-cost-preview` with hand-computed formatted `expectedProjectCeiling` and `expectedFirstStageCeiling`; wallet balance seeded **above** `expectedFirstStageCeiling`; setup mode Autostart checked; submit form → `createProjectAndAutoStart` called once with `processTemplateId` from association row. Proves API → store → selector → `computeCostCeiling` → UI → submit gate allows spend.
      * `[✅]`   Test (null prerequisites — fail closed): same MSW success handlers but seed store with `maxOutputTokens: null` (or `selectedModels: []`) before render; `waitFor` `create-project-no-estimate-notice`; Autostart unchecked; submit → `createProjectAndAutoStart` **not** called when setup would be Autostart; Autoconfig path may call `createProjectAndAutoStart` with `startGeneration` false when user cycles to Autoconfig (optional second click in same test or separate test). Proves fail-safe without mocked selector.
      * `[✅]`   Test (API counts error — fail closed): MSW `getStageExpectedCounts` returns 500 or store action surfaces fetch error so `preProjectStageExpectedCounts` stays absent / selector returns `null`; `waitFor` `create-project-no-estimate-notice` (or association error path — assert whichever the real store produces, document in test comment); Autostart unchecked; autostart submit not called.
      * `[✅]`   Test (insufficient wallet — fail closed autostart, allow autoconfig): success stack seeded; wallet balance **below** `expectedFirstStageCeiling`; `waitFor` Autoconfig (Autostart unchecked); `create-project-autostart-top-up-link` or balance reason present; Create submit still enabled; `createProjectAndAutoStart` called when submitting in Autoconfig mode (not autostart spend). One behavior per test; appended at end of file.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI component + pre-project epic integration boundary.
      * `[✅]`   Deps: inward (store actions, `selectPreProjectCostCeiling` `ComputeCostCeilingReturn | null`, wallet, API via store).
      * `[✅]`   Provides: outward (fail-safe pre-project spend gate, cost preview UX, **proof that API → store → selector → computeCostCeiling → form gating works** for success / null / error paths).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `minimum_balance`, `default_process_template_id`, `project_ceiling`, `stage_ceiling`, `maxOutputCostRate`, and `actualCost` do not appear in `CreateDialecticProjectForm.tsx`. Observable: grep.
      * `[✅]`   `fetchProcessAssociation` invoked with `{ domainId: selectedDomain.id }` when domain selected. Observable: autostart unit test + integration test.
      * `[✅]`   `fetchProcessTemplate` and `fetchStageExpectedCounts` invoked only after `selectedDomainProcessAssociation.process_template_id` is available. Observable: autostart unit tests + integration test.
      * `[✅]`   Submit payloads include `processTemplateId` matching association row on Manual and Autoconfig/Autostart paths. Observable: unit tests.
      * `[✅]`   When `selectPreProjectCostCeiling` returns `null`, `create-project-no-estimate-notice` renders; Autostart off; autostart submit blocked. Observable: unit + integration tests.
      * `[✅]`   When selector returns `{ error: ApiError }`, `create-project-estimate-error-notice` renders with pass-through message; Autostart off; autostart submit blocked. Observable: unit test (error mock); integration test covers null/fetch-failure path at minimum.
      * `[✅]`   On success branch, preview copy matches hand-computed ceilings. Observable: unit test + integration test (`create-project-cost-preview` vs `computeCostCeiling` hand-check).
      * `[✅]`   Autostart enabled only when success estimate and wallet ≥ first-stage ceiling; defaults to Autoconfig when balance below ceiling; Create remains enabled. Observable: unit + integration tests.
      * `[✅]`   `onSubmit` fail-safe: Autostart path never calls `createProjectAndAutoStart` when result is `null`, error, or unaffordable. Observable: unit + integration tests.
      * `[✅]`   Project warning is non-blocking with top-up link on success branch only. Observable: unit test.
      * `[✅]`   Integration test exercises real `selectPreProjectCostCeiling` and real store fetch actions with MSW at API edge only — not mocked selector. Observable: `CreateDialecticProjectForm.costCeiling.integration.test.tsx` success + null + insufficient-wallet cases green.
      * `[✅]`   Integration fixture hand-check uses `outputTokenCostRates[]` and per-stage `contributions: []` — no `maxOutputCostRate`, no `actualCost` on stage input. Observable: grep checklist node + `CreateDialecticProjectForm.costCeiling.integration.test.tsx`.
      * `[✅]`   Existing autostart and form unit tests remain green.

  * `[✅]`   apps/web/src/components/ai/CreateProjectFromChatButton **Pre-project ceiling fail-safe, `processTemplateId`, and chat create+autostart stack integration**

    * `[✅]`   `objective`
      * `[✅]`   `CreateProjectFromChatButton.tsx` builds `CreateProjectAndAutoStartPayload` with `projectName`, `initialUserPrompt`, `selectedDomainId`, and idempotency keys only (lines 55-61) and calls `createProjectAndAutoStart` without association lookup, without `processTemplateId`, and without any pre-project cost-ceiling gate. Navigation passes `autoStartGeneration: result.hasDefaultModels` (line 73) — when default generation models exist, this is a **financial operation that consumes wallet tokens** on session load; it **must fail safe** (fail closed) using the same pre-project stack as `CreateDialecticProjectForm` Autostart, not static `minimum_balance`.
      * `[✅]`   Non-functional: chat has no cost-preview UI and no output-cap slider — fail-safe gating runs at click time in `handleClick` only. No `selectCostCeiling` (post-project). No edits to `dialecticStore.ts`, `CreateDialecticProjectForm.tsx`, selectors, `computeCostCeiling`, or BE handlers. Subscription cart prefill deferred. This node owns the **chat pre-project epic stack integration test** (API MSW edge → store actions → real `selectPreProjectCostCeiling` → real `computeCostCeiling` → click guard → `createProjectAndAutoStart` observation).
      * `[✅]`   Functional goal (domain + association): after `fetchDomains` when needed, resolve `selectedDomain: DialecticDomainRow | null` via `selectSelectedDomain(useDialecticStore.getState())`; require non-empty `selectedDomain.id`; `await fetchProcessAssociation({ domainId: selectedDomain.id })`; read `selectedDomainProcessAssociation` from `useDialecticStore.getState()`. When row is absent or `process_template_id` is missing/empty, toast error and return — no `createProjectAndAutoStart`. No fabricated template id; do not read `process_template_id` from `DialecticDomainRow`.
      * `[✅]`   Functional goal (catalog + default model count): before ceiling reads, mirror `createProjectAndAutoStart` catalog bootstrap (`dialecticStore.ts:750-753`): when `modelCatalog.length === 0 && !isLoadingModelCatalog`, `await fetchAIModelCatalog()`. Derive `defaultModelCount: number` from `new Set(selectDefaultGenerationModels(state).map((m) => m.id)).size` (same models the store will autostart with when `selectedModels` is empty — `dialecticStore.ts:763`). When `defaultModelCount < 1`, skip ceiling orchestration and ceiling gate (store returns `hasDefaultModels: false` — no generation spend); still require valid `processTemplateId` on payload before `createProjectAndAutoStart`.
      * `[✅]`   Functional goal (template + counts orchestration — autostart spend path only): when `defaultModelCount >= 1` and association row has non-empty `process_template_id`, `await fetchProcessTemplate(processTemplateId)` then `await fetchStageExpectedCounts({ processTemplateId, modelCount: defaultModelCount })`. Count payload uses association `process_template_id`, not `currentProcessTemplate?.id` alone (association row is SSOT — same rule as `CreateDialecticProjectForm` node).
      * `[✅]`   Functional goal (three-way selector result — autostart spend path only): after orchestration, read `preProjectCostCeilingResult: ComputeCostCeilingReturn | null` via `selectPreProjectCostCeiling(useDialecticStore.getState())`. Branch before spend: `null` → prerequisites incomplete; `'error' in result` → estimate computation failed; else → success. Resolve `firstStageSlug` from `currentProcessTemplate`: find stage where `stage.id === currentProcessTemplate.starting_stage_id` (mirror `createProjectAndAutoStart` lines 790-796); read `firstStageCeiling` from success `stageCeilings[firstStageSlug]` when finite non-negative. **Fail closed:** when `defaultModelCount >= 1`, do not call `createProjectAndAutoStart` when result is `null`, `'error' in result`, `firstStageCeiling` is not finite, or `Number(walletBalance) < firstStageCeiling` — toast with pass-through `error.message` on error branch, fixed copy on null branch (e.g. "No cost estimate yet. Set the output cap in Model Settings, then try again."), fixed copy on NSF branch (e.g. "Insufficient tokens for auto-start. Top up your wallet to continue."). No fallback to `minimum_balance`.
      * `[✅]`   Functional goal (payload): when guards pass, set `processTemplateId` from `selectedDomainProcessAssociation.process_template_id` on `CreateProjectAndAutoStartPayload` alongside existing fields; call `createProjectAndAutoStart`. When `selectedDomain` is `null` or id missing, keep existing toast "No domain available…" and return without association fetch or create.
      * `[✅]`   Each goal is atomic and testable.

    * `[✅]`   `role`
      * `[✅]`   UI component — chat toolbar control that creates a dialectic project from selected messages and may trigger autostart generation spend.
      * `[✅]`   This node orchestrates the pre-project call chain documented in `dialecticStore` `interaction.spec` at click time (`fetchProcessAssociation` → `fetchProcessTemplate` / `fetchStageExpectedCounts` → `selectPreProjectCostCeiling` fail-safe gate → `createProjectAndAutoStart` with `processTemplateId`). It does NOT implement store actions, selector arithmetic, or BE handlers.
      * `[✅]`   Out of scope: cost preview markup (form owns preview copy); Autostart/mode UI; `createDialecticProject` manual path; `setSelectedDomain` / domain-picker UX; post-project `selectCostCeiling`.

    * `[✅]`   `module`
      * `[✅]`   Bounded context: `apps/web/src/components/ai` — `CreateProjectFromChatButton`.
      * `[✅]`   Inside: click-time domain resolution, association/template/counts orchestration for autostart spend path, three-way `selectPreProjectCostCeiling` branching, wallet fail-safe gate, `processTemplateId` on payload, chat pre-project stack integration test.
      * `[✅]`   Outside: `computeCostCeiling` implementation body, store action implementations, API transport handlers, association SQL, `createProjectAndAutoStart` FormData append.

    * `[✅]`   `deps`
      * `[✅]`   `fetchDomains`, `fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`, `fetchAIModelCatalog`, `createProjectAndAutoStart` — provider: `@paynless/store` (`dialecticStore.ts` node + existing actions); layer: store actions; direction: inward.
      * `[✅]`   `selectSelectedDomain`, `selectDomains`, `selectDefaultGenerationModels`, `selectPreProjectCostCeiling` — provider: `@paynless/store` (`dialecticStore.selectors.ts` node); layer: selectors; direction: inward; purpose: domain resolution, default model count, `ComputeCostCeilingReturn | null`.
      * `[✅]`   `selectedDomainProcessAssociation`, `currentProcessTemplate`, `maxOutputTokens`, `modelCatalog`, `isLoadingModelCatalog` — provider: `@paynless/store` `DialecticStateValues`; direction: inward; purpose: orchestration gates and selector prerequisites (`maxOutputTokens` must be finite for success estimate — chat reads store value set elsewhere, e.g. OutputCapSlider on a prior dialectic visit; when `null`, selector returns `null` and click gate fail-closes).
      * `[✅]`   `selectActiveChatWalletInfo`, `useWalletStore` — provider: `@paynless/store`; layer: store; direction: inward; purpose: wallet balance for NSF gate (`useAiStore().newChatContext` pattern — same as `useStartContributionGeneration`).
      * `[✅]`   `ComputeCostCeilingReturn`, `ComputeCostCeilingStageInput`, `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload` — provider: `@paynless/utils` (`computeCostCeiling.provides.ts`); layer: domain utility; direction: inward; purpose: integration test hand-check expected `firstStageCeiling` / `projectCeiling` via mean-rate payload (`outputTokenCostRates[]`, per-stage `contributions: []` on pre-project path; component does not import `computeCostCeiling` directly).
      * `[✅]`   `DialecticDomainRow`, `DomainProcessAssociationRow`, `CreateProjectAndAutoStartPayload`, `ApiError` — provider: `@paynless/types`; direction: inward.
      * `[✅]`   `GetStageExpectedCountsResponse` — provider: `@paynless/types`; direction: inward; purpose: integration MSW fixtures.
      * `[✅]`   `useAiStore` selectors, `formatChatMessagesAsPrompt`, `useNavigate`, `toast` — existing; unchanged.
      * `[✅]`   `@paynless/api` client + MSW `server` from `packages/api/src/setupTests` — integration test only; mocks at API transport edge.
      * `[✅]`   HARD dependency: `CreateDialecticProjectForm` node (establishes pre-project orchestration contract), `dialecticStore.selectors` node (`selectPreProjectCostCeiling`, `ComputeCostCeilingReturn | null`), `dialecticStore.ts` node (association + counts actions), `computeCostCeiling` node, `dialectic.api` node, `createProject` BE node. Precedes commit node below.
      * `[✅]`   No reverse dependencies.

    * `[✅]`   `context_slice`
      * `[✅]`   After `fetchDomains` (if `domains.length === 0`), re-read `selectedDomain: DialecticDomainRow | null = selectSelectedDomain(useDialecticStore.getState())`.
      * `[✅]`   `processTemplateId` (pre-project SSOT) = `selectedDomainProcessAssociation?.process_template_id` after `fetchProcessAssociation` — non-empty string only.
      * `[✅]`   `defaultModelCount` = unique id count from `selectDefaultGenerationModels(state)` after catalog ready.
      * `[✅]`   `firstStageSlug` = slug of template stage where `stage.id === currentProcessTemplate.starting_stage_id` after `fetchProcessTemplate`.
      * `[✅]`   `preProjectCostCeilingResult: ComputeCostCeilingReturn | null` = `selectPreProjectCostCeiling(state)` after counts orchestration; branch null / error / success before calling `createProjectAndAutoStart` when `defaultModelCount >= 1`.
      * `[✅]`   Wallet balance from `selectActiveChatWalletInfo(useWalletStore.getState(), useAiStore.getState().newChatContext)`.
      * `[✅]`   No reads of `minimum_balance`, `default_process_template_id`, or `selectCostCeiling`.

    * `[✅]`   ai/`CreateProjectFromChatButton.test.tsx`
      * `[✅]`   Replace `DialecticDomain` imports/fixtures with full `DialecticDomainRow` literals (`created_at`, `updated_at` included). Domain fixtures carry **no** `process_template_id` / `default_process_template_id`.
      * `[✅]`   Add `mockGeneralAssociation: DomainProcessAssociationRow` with `domain_id: generalDomain.id`, `is_default_for_domain: true`, `process_template_id: 'pt-general'`, and remaining required columns. Add `mockOtherAssociation` with `process_template_id: 'pt-other'` for multi-domain tests.
      * `[✅]`   Extend store mock: expose `selectPreProjectCostCeiling: vi.fn<[DialecticStateValues], ComputeCostCeilingReturn | null>()` defaulting to success `{ stageCeilings: { thesis: 120000 }, projectCeiling: 350000 }` for autostart-path tests; expose `fetchProcessTemplate`, `fetchStageExpectedCounts`, `fetchAIModelCatalog` via `getDialecticStoreActionMock`; seed `currentProcessTemplate` with `starting_stage_id` pointing at stage slug `thesis` in cost-gate tests. Import `ComputeCostCeilingReturn`, `buildComputeCostCeilingErrorReturn` from `@paynless/utils`.
      * `[✅]`   Wire `fetchProcessAssociation` mock: default sets `selectedDomainProcessAssociation` matching payload `domainId`.
      * `[✅]`   Seed happy-path autostart tests: `modelCatalog` with at least one `is_default_generation: true` row, `maxOutputTokens` finite, wallet balance ≥ mocked `firstStageCeiling`, `selectPreProjectCostCeiling` success mock.
      * `[✅]`   Update every successful `createProjectAndAutoStart` payload assertion to include `processTemplateId: 'pt-general'` (or matching fixture id).
      * `[✅]`   Add test: `fetchProcessAssociation` called with `{ domainId: generalDomain.id }` on click (`waitFor`).
      * `[✅]`   Add test: when `defaultModelCount >= 1`, `fetchProcessTemplate` called with association `process_template_id` and `fetchStageExpectedCounts` called with `{ processTemplateId, modelCount: defaultModelCount }` (`waitFor`).
      * `[✅]`   Add test: association null after fetch → no `createProjectAndAutoStart`; `toast.error`.
      * `[✅]`   Add test: `selectPreProjectCostCeiling` returns `null` with defaults present → no `createProjectAndAutoStart`; `toast.error` with no-estimate copy.
      * `[✅]`   Add test: `selectPreProjectCostCeiling` returns `buildComputeCostCeilingErrorReturn(...)` → no create; `toast.error` with pass-through `error.message`.
      * `[✅]`   Add test: success estimate but wallet below `firstStageCeiling` → no create; NSF toast.
      * `[✅]`   Add test: `defaultModelCount === 0` (no default generation models) → `createProjectAndAutoStart` still called with `processTemplateId` when association valid; `fetchStageExpectedCounts` **not** called; ceiling gate skipped.
      * `[✅]`   Preserve existing tests (disabled states, navigation, idempotency keys, API error toast, does not call `createDialecticProject`). New/updated cases appended.

    * `[✅]`   ai/`CreateProjectFromChatButton.tsx`
      * `[✅]`   Add imports: `DialecticDomainRow`, `ApiError` from `@paynless/types`; `ComputeCostCeilingReturn` from `@paynless/utils`; `selectDefaultGenerationModels`, `selectPreProjectCostCeiling`, `selectActiveChatWalletInfo`, `useWalletStore` from `@paynless/store`.
      * `[✅]`   Store action subscriptions: `fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`, `fetchAIModelCatalog` (besides existing `fetchDomains`, `createProjectAndAutoStart`).
      * `[✅]`   In `handleClick` after `fetchDomains` block: read `selectedDomain: DialecticDomainRow | null = selectSelectedDomain(useDialecticStore.getState())`; if `selectedDomain?.id` undefined, existing toast and return.
      * `[✅]`   `await fetchProcessAssociation({ domainId: selectedDomain.id })`; read association; if `process_template_id` not non-empty string, toast and return.
      * `[✅]`   If `modelCatalog.length === 0 && !isLoadingModelCatalog`, `await fetchAIModelCatalog()`.
      * `[✅]`   `const defaultModelCount = new Set(selectDefaultGenerationModels(useDialecticStore.getState()).map((m) => m.id)).size`.
      * `[✅]`   When `defaultModelCount >= 1`: `await fetchProcessTemplate(processTemplateId)`; `await fetchStageExpectedCounts({ processTemplateId, modelCount: defaultModelCount })`; read `const preProjectCostCeilingResult: ComputeCostCeilingReturn | null = selectPreProjectCostCeiling(useDialecticStore.getState())`.
      * `[✅]`   When `defaultModelCount >= 1`: if `preProjectCostCeilingResult === null`, toast no-estimate copy and return; if `'error' in preProjectCostCeilingResult`, toast `preProjectCostCeilingResult.error.message` and return; resolve `firstStageSlug` from `currentProcessTemplate` starting stage; read `firstStageCeiling` from success `stageCeilings[firstStageSlug]`; if not finite or wallet `< firstStageCeiling`, toast NSF copy and return.
      * `[✅]`   Build payload with `processTemplateId` added to existing fields; call `createProjectAndAutoStart` (existing try/navigate unchanged).
      * `[✅]`   No reads of `default_process_template_id` or `minimum_balance`.

    * `[✅]`   ai/`CreateProjectFromChatButton.costCeiling.integration.test.tsx`
      * `[✅]`   **Approved integration boundary:** MSW mocks at API transport only (mirror `CreateDialecticProjectForm.costCeiling.integration.test.tsx` and `packages/api/src/dialectic.api.integration.test.ts` — `initializeApiClient`, `server.use`, handlers for `fetchProcessAssociation`, `getStageExpectedCounts`, `listModelCatalog`, template fetch). Everything inward is **real**: `@paynless/api` client, real store actions (`fetchProcessAssociation`, `fetchProcessTemplate`, `fetchStageExpectedCounts`, `fetchAIModelCatalog`), real `selectPreProjectCostCeiling`, real `computeCostCeiling` (via selector). **Do not mock** `selectPreProjectCostCeiling` or `computeCostCeiling`. Mock only `createProjectAndAutoStart` (spy) to observe click outcome without full BE project creation.
      * `[✅]`   Harness: `MemoryRouter`; real `useDialecticStore` / `useWalletStore` wired with MSW-backed API (same pattern as form integration test). Seed `useAiStore` selection state (`selectCurrentChatSelectionState` → `'some'`, selected messages non-empty). Import `computeCostCeiling`, `buildComputeCostCeilingDeps`, `buildComputeCostCeilingParams`, `buildComputeCostCeilingPayload`, `ComputeCostCeilingStageInput` from `@paynless/utils` for hand-check expected `firstStageCeiling` / `projectCeiling`.
      * `[✅]`   Shared fixture constants: duplicate in-file the same `domainId`, `processTemplateId`, `firstStageSlug: 'thesis'`, `defaultModelCount: 1`, `maxOutputTokens`, `output_token_cost_rate`, and `GetStageExpectedCountsResponse` counts as `CreateDialecticProjectForm.costCeiling.integration.test.tsx` (do not import from form test). Derive `outputTokenCostRates: number[]` — one `output_token_cost_rate` per default-generation model on seeded catalog (single-model fixtures: `[rate]`; two-model mean-rate anchor: `[2, 3]` with `expectedCount: 4`, `maxOutputTokens: 1000` → `expectedFirstStageCeiling === 10000`). Build `stages: ComputeCostCeilingStageInput[]` from response counts: for each stage slug, `{ stageSlug, expectedCount, contributions: [] }`. Compute `expectedFirstStageCeiling` and `expectedProjectCeiling` via real `computeCostCeiling(buildComputeCostCeilingDeps(), buildComputeCostCeilingParams(), buildComputeCostCeilingPayload({ stages, maxOutputTokens, outputTokenCostRates }))` — assert `'error' not in result` in fixture setup; first-stage ceiling must equal `expectedCount(firstStageSlug) × maxOutputTokens × (sum(outputTokenCostRates) / outputTokenCostRates.length)` (mean rate — not max across models).
      * `[✅]`   MSW handlers (success path): full `DomainProcessAssociationRow`; `getStageExpectedCounts` success; `listModelCatalog` with one `is_default_generation: true` row carrying full `AiModelExtendedConfig`; template fetch hydrates `starting_stage_id` → `thesis`.
      * `[✅]`   Test (success stack + afford autostart): seed `selectedDomain`, finite `maxOutputTokens`, wallet **above** hand-computed `expectedFirstStageCeiling`; click button → `waitFor` `createProjectAndAutoStart` called once with `processTemplateId` from association row. Proves API → store → selector → `computeCostCeiling` → click gate allows spend.
      * `[✅]`   Test (null prerequisites — fail closed): success MSW handlers but seed `maxOutputTokens: null` before click → `createProjectAndAutoStart` **not** called; `toast.error` invoked (no mocked selector).
      * `[✅]`   Test (API counts error — fail closed): MSW `getStageExpectedCounts` returns 500 → click → `createProjectAndAutoStart` not called; document observed store path in test comment.
      * `[✅]`   Test (insufficient wallet — fail closed): success stack; wallet **below** `expectedFirstStageCeiling` → click → `createProjectAndAutoStart` not called; NSF toast. One behavior per test; appended at end of file.

    * `[✅]`   `directionality`
      * `[✅]`   Layer: UI component + chat pre-project epic integration boundary.
      * `[✅]`   Deps: inward (store actions, `selectPreProjectCostCeiling` `ComputeCostCeilingReturn | null`, wallet/ai stores, API via store).
      * `[✅]`   Provides: outward (fail-safe chat create+autostart spend gate, **proof that API → store → selector → computeCostCeiling → click guard → createProjectAndAutoStart works** for success / null / error / NSF paths).
      * `[✅]`   No cycles.

    * `[✅]`   `requirements`
      * `[✅]`   `minimum_balance`, `default_process_template_id`, `project_ceiling`, `stage_ceiling`, `maxOutputCostRate`, and `actualCost` do not appear in `CreateProjectFromChatButton.tsx` or its unit/integration tests. Observable: grep.
      * `[✅]`   `fetchProcessAssociation` invoked with `{ domainId: selectedDomain.id }` before create when domain selected. Observable: unit + integration tests.
      * `[✅]`   When `defaultModelCount >= 1`, `fetchProcessTemplate` and `fetchStageExpectedCounts` invoked with association `process_template_id` before ceiling read. Observable: unit test + integration test.
      * `[✅]`   Every successful `createProjectAndAutoStart` call includes `processTemplateId` equal to association row. Observable: unit + integration tests.
      * `[✅]`   When `defaultModelCount >= 1` and `selectPreProjectCostCeiling` returns `null`, click does not call `createProjectAndAutoStart`. Observable: unit + integration tests.
      * `[✅]`   When `defaultModelCount >= 1` and selector returns `{ error: ApiError }`, click does not call `createProjectAndAutoStart`; toast shows pass-through message. Observable: unit test.
      * `[✅]`   When `defaultModelCount >= 1`, success estimate, and wallet `< firstStageCeiling`, click does not call `createProjectAndAutoStart`. Observable: unit + integration tests.
      * `[✅]`   When `defaultModelCount === 0`, create may proceed with `processTemplateId` without counts fetch or ceiling gate. Observable: unit test.
      * `[✅]`   Integration test exercises real `selectPreProjectCostCeiling` and real store fetch actions with MSW at API edge only. Observable: `CreateProjectFromChatButton.costCeiling.integration.test.tsx` success + null + NSF cases green.
      * `[✅]`   Integration fixture hand-check uses `outputTokenCostRates[]` and per-stage `contributions: []` — no `maxOutputCostRate`, no `actualCost` on stage input. Observable: grep checklist node + `CreateProjectFromChatButton.costCeiling.integration.test.tsx`.
      * `[✅]`   Existing navigation, disabled, and idempotency unit tests remain green.

    * `[✅]`   **Commit** `feat(dialectic): dynamic cost ceiling — FE estimate utility, selectors, and consumers`
      * `[✅]`   Structural: `computeCostCeiling` + owned contract types in `computeCostCeiling.interface.ts`; `stageExpectedCountsByRun` / `preProjectStageExpectedCounts` store state; `selectCostCeiling` / `selectPreProjectCostCeiling`; BE count core + session-less handler + API client (Groups 1–4 nodes).
      * `[✅]`   Behavioral: post-project ceilings drive NSF gate (`useStartContributionGeneration`, `GenerateContributionButton`); session header shows project/stage estimates (`SessionInfoCard`); create form and chat button gate autostart spend on first-stage ceiling from `selectPreProjectCostCeiling`; estimates recompute with model/cap changes; no `minimum_balance` preventive gates in Group 5 consumers.
      * `[✅]`   Contract: selectors assemble payload, call `computeCostCeiling`, return result unchanged (`ComputeCostCeilingReturn | null`); `null` only for incomplete prerequisites; `'error' in result` fail-closes spend at all three entry points; pre-project counts via `getStageExpectedCounts`; subscription cart prefill explicitly deferred to next ticket.

* **Subscription checkout deep links — prepopulate cart from upgrade and top-up CTAs**

  Implement after the **Dynamic cost ceiling** ticket above. Cost ceiling supplies `stage_ceiling`, `project_ceiling`, and token shortfalls for NSF and pre-project surfaces; this ticket wires every `/subscription` CTA to the cart using those values (where applicable) plus tier-aware plan resolution for feature-gate upgrades. Do this in **one pass** once `selectCostCeiling` / `selectPreProjectCostCeiling` exist — do not ship another round of naked `/subscription` links.

  ### Problem

  Multiple tickets (FE Ticket 1 dashboard/sidebar, FE2 model selector gating, FE3 output-cap slider and cost-ceiling NSF) added upgrade and top-up CTAs that navigate to `/subscription` with no cart context. The user lands on the subscription page and must manually find the right plan or token pack. The original FE plan (**Multi-item checkout cart**, now implemented) specified `prefillCart`, URL query params (`?plan=` / `?otp=`), and CTA consumers — but consumers were left as placeholders (`Link to="/subscription"` or `navigate("/subscription")`).

  ### What already exists (no reinvention)

  - **`packages/store/src/cartStore/cartStore.ts`**: `prefillCart({ subscriptionPlanId?, otpPlanIds? })` clears the cart, resolves plans from `useSubscriptionStore.getState().availablePlans` by `plan.id` or `plan.stripe_price_id`, then populates `subscriptionItem` / `otpItems`.
  - **`apps/web/src/pages/Subscription.tsx`**: On load, if `?plan=` or `?otp=` query params are present and `availablePlans` is loaded, calls `prefillCart` and clears params from the URL (`setSearchParams({}, { replace: true })`).
  - **Cart checkout**: `checkoutCart()` builds multi-item `PurchaseRequest` and redirects to Stripe.

  **Gaps in existing infrastructure:**
  - No shared helper maps **tier level** or **token shortfall** → plan IDs; each CTA would duplicate lookup logic.
  - `prefillCart` does not match `item_id_internal` (only `id` and `stripe_price_id`); extend if production plans are keyed internally.
  - Subscription page tabs (`monthly` / `annual` / `top-up`) are local state only; NSF/top-up CTAs need **`?tab=top-up`** (or equivalent) read on mount so the Top-Up tab is visible after navigation.

  ### Resolution helpers (new — shared by all CTAs)

  Add a small pure module (location TBD during node planning — e.g. `apps/web/src/utils/subscriptionCta.ts`) that operates on `SubscriptionPlan[]` from `availablePlans`:

  1. **`subscriptionPlanForTierLevel(targetLevel, plans, preferInterval?)`**
     - Filter: `plan_type === 'subscription'`, `active`, `tier_level === targetLevel`, exclude free/zero-amount plans.
     - Prefer monthly vs annual by name or interval when multiple plans share a tier (default: monthly).
     - Return `SubscriptionPlan | null` (use `.id` in URLs and `prefillCart`).

  2. **`smallestOtpPlanForShortfall(shortfallTokens, plans)`**
     - Filter: `plan_type === 'one_time_purchase'`, `tokens_to_award` not null.
     - Sort ascending by `tokens_to_award`; return first plan where `tokens_to_award >= shortfallTokens`.

  3. **`buildSubscriptionCtaUrl(intent)`** (or equivalent)
     - Inputs: `{ subscriptionPlanId?: string; otpPlanIds?: string[]; tab?: 'top-up' }`.
     - Output: `/subscription?plan=...&otp=...&tab=top-up` with repeated `otp` params when needed.
     - Use **runtime plan UUIDs** from `availablePlans` — do not hardcode doc examples like `premium-monthly`.

  CTAs may use **URL-only** deep links (preferred for `<Link>`) or **prefillCart + navigate** for buttons; URL prefill on `SubscriptionPage` must remain the single source of truth on arrival so refresh and shared links work.

  ### CTA inventory — current naked links and intended prefill

  **Tier / feature-gate upgrades (subscription plan only)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Tier-locked model | `AIModelSelector.tsx` | `min_plan_tier_level > userTier.level` | `plan` = subscription for `provider.min_plan_tier_level` |
  | Model-count cap | `AIModelSelector.tsx` | at cap on multiplicity | `plan` = subscription for tier from `resolveNextTierName` → that tier's `level` |
  | Tier-locked row | `AIModelSelectorList.tsx` | same as selector | same |
  | Count-cap row | `AIModelSelectorList.tsx` | same | same |
  | Output cap upgrade | `OutputCapSlider.tsx` | locked marker / drag past thumb max | `plan` = subscription for tier matching `upgradeTargetName` (`availableTiers` by name → `level`) |

  **Account / navigation (tier upgrade or browse)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Plan card | `Dashboard.tsx` | `nextTierName` | `plan` = next tier's `level` |
  | Plan card fallback | `Dashboard.tsx` | `userTier === null` | no plan (generic `/subscription`) |
  | Quick action "Upgrade" | `Dashboard.tsx` | marketing | next tier `plan`, or OTP-only if product decides ultra users need tokens only |
  | Sidebar upgrade | `nav-user.tsx` | `nextTierName` | same as dashboard |
  | Sidebar "Billing" | `nav-user.tsx` | manage billing | no prefill (portal on page) |
  | Profile | `Profile.tsx` | "Manage subscription" | no prefill |
  | Header / Help / Pricing (logged in) | `Header.tsx`, `Help.tsx`, `PricingPage.tsx` | browse | no prefill |

  **Token top-up (OTP only — often `tab=top-up`)**

  | Surface | File | Trigger | Prefill |
  |--------|------|---------|---------|
  | Wallet | `WalletBalanceDisplay.tsx` | "Purchase Tokens" | optional smallest OTP or none; `tab=top-up` |
  | Generate callout | `GenerateContributionButton.tsx` | wallet below stage `minimum_balance` | `otp` = pack covering `stageThreshold - balance` (interim until cost ceiling ships) |
  | Session NSF (this ticket + cost ceiling) | `DialecticSessionDetailsPage.tsx`, `GenerateContributionButton` / session controls | `stage_ceiling > wallet_balance` | `otp` = `smallestOtpPlanForShortfall(stage_ceiling - wallet_balance)`; `tab=top-up` |
  | Project warning (cost ceiling) | session / `SessionInfoCard.tsx` | `project_ceiling > wallet_balance` | `otp` for `project_ceiling - wallet_balance`; informational, do not block create |
  | Pre-project autostart (cost ceiling) | `CreateDialecticProjectForm.tsx` | first-stage `stage_ceiling > wallet` | same OTP shortfall for first stage; disable Autostart, allow Create |

  **Dual intent (upgrade + top-up):** When a surface needs both a higher tier and tokens (e.g. locked premium model with insufficient wallet for estimated run), pass both `plan` and `otp` in one URL. FE cart ticket Pattern 1 applies.

  ### Implementation sequence (single pass, after cost ceiling)

  1. **Cost ceiling** — `@paynless/utils` `computeCostCeiling`, selector-derived ceilings, UI hooks for estimates and shortfalls (per Dynamic cost ceiling ticket above).
  2. **Subscription CTA helpers** — `subscriptionPlanForTierLevel`, `smallestOtpPlanForShortfall`, `buildSubscriptionCtaUrl`; unit tests with `SubscriptionPlan` fixtures from `PlanCard.mock.ts`.
  3. **`Subscription.tsx`** — honor `?tab=top-up` on mount (set `activeTab`); optionally extend `prefillCart` lookup to `item_id_internal`.
  4. **Wire all CTAs** in one change set: replace naked `to="/subscription"` / `navigate("/subscription")` with URLs from helpers; dialectic components first (`AIModelSelector`, `AIModelSelectorList`, `OutputCapSlider`, `GenerateContributionButton`, `CreateDialecticProjectForm`, session page / `SessionInfoCard`), then account surfaces (`Dashboard`, `nav-user`, `WalletBalanceDisplay`).
  5. **Tests** — update existing tests that assert `href === '/subscription'` to assert query strings when prefill applies; add helper unit tests.

  ### Known files in dependency order

  **Helpers (new):**
  1. `packages/store/src/subscriptionCta.ts` (new) — plan resolution and URL builder (or `apps/web/src/utils/subscriptionCta.ts` if web-only; prefer store package if dialectic store will import shortfall helpers)
  2. `packages/store/src/subscriptionCta.test.ts` (new)

  **Subscription page:**
  3. `apps/web/src/pages/Subscription.tsx` — `?tab=` query handling; confirm prefill runs after `loadSubscriptionData`
  4. `apps/web/src/pages/Subscription.test.tsx` — tab param + combined `plan` + `otp` prefill

  **Optional cart store:**
  5. `packages/store/src/cartStore/cartStore.ts` — optional `item_id_internal` in `prefillCart` lookup

  **CTA consumers (modify — replace naked links):**
  6. `apps/web/src/components/dialectic/AIModelSelector.tsx`
  7. `apps/web/src/components/dialectic/AIModelSelector.test.tsx`
  8. `apps/web/src/components/dialectic/AIModelSelectorList.tsx`
  9. `apps/web/src/components/dialectic/AIModelSelectorList.test.tsx`
  10. `apps/web/src/components/dialectic/OutputCapSlider.tsx`
  11. `apps/web/src/components/dialectic/OutputCapSlider.test.tsx`
  12. `apps/web/src/components/dialectic/OutputCapSlider.integration.test.tsx`
  13. `apps/web/src/components/dialectic/GenerateContributionButton.tsx`
  14. `apps/web/src/components/dialectic/GenerateContributionButton.nsf.test.tsx`
  15. `apps/web/src/pages/DialecticSessionDetailsPage.tsx` — NSF + cost display (depends on cost ceiling)
  16. `apps/web/src/components/dialectic/SessionInfoCard.tsx`
  17. `apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx`
  18. `apps/web/src/components/dialectic/CreateDialecticProjectForm.autostart.test.tsx`
  19. `apps/web/src/pages/Dashboard.tsx`
  20. `apps/web/src/pages/Dashboard.test.tsx`
  21. `apps/web/src/components/sidebar/nav-user.tsx`
  22. `apps/web/src/components/sidebar/nav-user.test.tsx`
  23. `apps/web/src/components/wallet/WalletBalanceDisplay.tsx`

  **No prefill required (leave generic `/subscription` or document explicitly):**
  - `Profile.tsx`, `Header.tsx`, `Help.tsx`, `PricingPage.tsx`, `nav-user` Billing button

  ### Dependencies

  - **Depends on Dynamic cost ceiling** (same FE3 doc): OTP shortfalls for NSF, pre-project autostart, and project-level warnings require `costCeilingEstimate` / `stage_ceiling` / `project_ceiling`. Tier-only CTAs (model lock, output cap, dashboard upgrade) can be implemented with helpers alone but should ship in the same pass to avoid duplicate churn.
  - **Depends on FE cart ticket (complete)**: `cartStore`, `Subscription.tsx` URL prefill, multi-item checkout.
  - **Depends on Ticket 1**: `userTier`, `availableTiers`, `availablePlans` / `loadSubscriptionData`.
  - **Depends on Output clamp slider (complete)**: `maxOutputTokens` for cost ceiling `output_cap` input.
  - **Ops (deferred)**: `subscription_plans.tier_level` must match `tier_definitions.level` in production data for `subscriptionPlanForTierLevel` to resolve correctly (see Stripe plans ops task below).

  ### Scope split — FE vs BE

  FE-only. No BE changes unless plan catalog fetch is incomplete before navigation (ensure `loadSubscriptionData` runs for authenticated users hitting deep links).

  ### Open questions for node planning

  1. **Helper package location:** `packages/store` (shared with dialectic recompute) vs `apps/web` only?
  2. **Billing interval preference:** Default monthly for tier upgrades, or infer from `userSubscription` / current plan?
  3. **Ultra users on Dashboard quick action:** Next tier is null — link to top-up tab only, or hide?
  4. **GenerateContributionButton:** Retain `minimum_balance` shortfall until cost ceiling is wired on session page, then unify on `stage_ceiling` shortfall.
  5. **Bundle cards** (FE cart ticket §E): Optional follow-up — static bundle config calling same `prefillCart` / URL builder; not required for CTA pass.

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