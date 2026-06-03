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
  - **Job counting stays on the BE; the estimate arithmetic is computed on the FE.** The BE returns expected job counts per stage; the FE multiplies `counts × maxOutputTokens × maxOutputCostRate`. Strategy/DAG math stays in one place (the BE), and the slider stays instant (no BE round-trip per slider tick, because only counts come from the BE and those change only with model count / template). Nothing about the estimate is persisted to the DB.
  - **Use the existing `maxOutputTokens` symbol** (dialectic store; output-cap slider ticket).
  - **Model cost rates come from the dialectic store's `modelCatalog: AiProvidersRow[]`** (the dialectic-specific source `OutputCapSlider` already reads), NOT `aiStore.availableProviders`.
  - **Project ceiling = actual(completed stages) + estimate(remaining stages).** It starts estimate-weighted and resolves toward actual as stages complete (actual ≤ estimate, so the user perceives a saving).

  ### Core math

  `stage_ceiling = (Σ_step expected_job_count[step]) × maxOutputTokens × maxOutputCostRate`

  `project_ceiling = Σ_completed_stage actual_cost(stage) + Σ_remaining_stage stage_ceiling(stage)`

  where:
  - `expected_job_count[step]` — number of jobs a step produces, from its `granularity_strategy` and the model count `n`. Computed on the BE (see Group 2). The estimate is linear in `maxOutputTokens` and `maxOutputCostRate`, so the FE applies those two factors locally for instant slider response.
  - `maxOutputTokens` — the dialectic store value (output-cap slider ticket). When null, the slider's effective default applies (tier cap / model cap), consistent with how the slider already clamps.
  - `maxOutputCostRate` — the highest `output_token_cost_rate` across the selected models, read from `modelCatalog[].config` (`AiModelExtendedConfig.output_token_cost_rate`). Max is the ceiling; real cost is usually lower.
  - `actual_cost(stage)` — summed on the FE from `DialecticContribution` rows of that stage/iteration: `Σ (tokens_used_input × input_token_cost_rate + tokens_used_output × output_token_cost_rate)`, rates from each contribution's model config. Contributions already carry `stage`, `iteration_number`, `model_id`, `tokens_used_input`, `tokens_used_output`. This avoids any wallet-transaction change; enriching debit metadata to reference jobs is deferred.

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
  - **Pre-project counts**: from the new session-less count handler, called with the process template chosen for the project (derived from the selected domain on the Create form) + the selected model count. Confirm domain → `process_template_id` resolution when scoping that node.
  - **Actuals**: `DialecticContribution` rows (loaded with session detail) — per stage/iteration token usage (`tokens_used_input`, `tokens_used_output`, `model_id`).
  - **maxOutputTokens**: dialectic store.
  - **Model cost rates**: `modelCatalog[].config` (dialectic store), read via a shape-specific `AiModelExtendedConfig` guard (Group 3). Note: `fetchProcessTemplate` takes `{ templateId }` and `getStageRecipe` takes `{ stageSlug }` — neither requires a session (the function that requires `sessionId`/`iterationNumber` is `getAllStageProgress`).
  - **Wallet balance**: `useWalletStore` → `selectActiveChatWalletInfo` (`balance`).

  ### FE estimate utility (pure, SRP)

  A pure FE utility (e.g. `packages/store/src/computeCostCeiling.ts`) performs the **arithmetic only** — NOT strategy/DAG math. Given per-stage expected counts, `maxOutputTokens`, `maxOutputCostRate`, and per-completed-stage actuals, it returns `{ stageCeilings: Record<stageSlug, number>; projectCeiling: number }`. Consumed by both the session NSF surface and the pre-project preview. Tested in isolation.

  Reading model config rates requires a **shape-specific guard for `AiModelExtendedConfig`** (replacing the generic `isJson` / `isPlainObject` checks). Introduce that guard and migrate the existing in-scope consumer (`OutputCapSlider.tsx`) to it.

  ### NSF UI — preventive gate (session page)

  The Generate/Continue disable + threshold logic currently lives in the `useStartContributionGeneration` hook (it computes `balanceMeetsThreshold` from `viewingStage.minimum_balance`) and renders a `/subscription` callout in `GenerateContributionButton`. Replace the hardcoded `minimum_balance` gate with the dynamic `stage_ceiling`:
  - `stage_ceiling > wallet_balance`: disable the button; show "Insufficient tokens. Top up {shortfall} to continue." linking to `/subscription` (top-up tab), where `shortfall = stage_ceiling - wallet_balance`.
  - `stage_ceiling <= wallet_balance`: enable; show "Estimated cost for this stage: ~{stage_ceiling} tokens."
  - `project_ceiling > wallet_balance`: secondary, non-blocking notice with `project_ceiling - wallet_balance` shortfall and top-up CTA.
  - Both stage and project notices may show simultaneously. Recompute dynamically on slider and model-selection changes.
  - This is preventive UX; the BE `paused_nsf` status (runs out mid-execution) still coexists as the after-the-fact handler.
  - Pages remain hosts; logic lives in the hook + components for portability.

  ### Pre-project cost preview (Create Project form)

  Most users pick "Autostart", so the estimate cannot be deferred to the session page. On `CreateDialecticProjectForm` (which already gates Autostart on `firstStageMinBalance` vs `walletInfo.balance` and mounts `AIModelSelector` + `OutputCapSlider`):
  - Compute `project_ceiling` and first-stage `stage_ceiling` from the session-less count handler + selected models / `maxOutputTokens`.
  - Display: "Estimated token cost: ~{project_ceiling} for the full project, ~{stage_ceiling} for the first stage."
  - `project_ceiling > wallet_balance`: warning + top-up CTA, do NOT block Create.
  - first-stage `stage_ceiling > wallet_balance`: extend the existing gate to disable Autostart (fall back to Autoconfig) with a top-up CTA, but allow Create. With Autostart off, the session-page Generate button stays NSF-locked until top-up.

  ### Work groups in dependency order (formal nodes to be authored in a fresh thread)

  **Group 1 — BE strategy correctness:**
  - `supabase/functions/dialectic-service/computeExpectedCounts.ts` (+ `.test.ts`) — add `per_source_group` support (define its expected-count rule with BE confirmation; mirror the per-stage strategy switch).
  - `packages/types/src/dialectic.types.ts` — `RecipeGranularity`: remove `one_to_many` / `many_to_one` (this type change rides in its first consumer node per the rules, never orphaned).

  **Group 2 — BE counts (decomposed):**
  - Extract the count core (transitions → topo order → recipe fetch → per-stage `computeExpectedCounts` + inter-stage context walk) into its own function (+ interface / guards / tests).
  - Refactor `getAllStageProgress` to delegate to the core; add per-stage expected counts to `StageProgressEntry` / `GetAllStageProgressResponse` (+ guards / tests).
  - New session-less count handler `{ templateId, modelCount }` → per-stage counts (+ interface / guards / tests), wired into `dialectic-service/index.ts` and the API client.

  **Group 3 — FE estimate utility:**
  - `packages/store/src/computeCostCeiling.ts` (+ test) — pure arithmetic utility (counts + cap + rate + completed-stage actuals → stage/project ceilings).
  - `AiModelExtendedConfig` shape guard (+ test); migrate `OutputCapSlider.tsx` to it.

  **Group 4 — types + store wiring:**
  - `CostCeilingEstimate` type + `costCeilingEstimate` state + selector/action in `dialectic.types.ts` and `dialecticStore.ts` (reads counts, contributions/actuals, `maxOutputTokens`, `modelCatalog` rates; recompute on model / cap / recipe change) (+ store tests).

  **Group 5 — consumers:**
  - `useStartContributionGeneration` (+ its return type) — replace the `minimum_balance` gate with the dynamic `stage_ceiling`.
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
  - **FE**: remove phantom `RecipeGranularity` values; `AiModelExtendedConfig` guard + `OutputCapSlider` migration; pure `computeCostCeiling` utility; `CostCeilingEstimate` types/state/wiring; NSF gate in `useStartContributionGeneration` + `GenerateContributionButton`; `SessionInfoCard` + `CreateDialecticProjectForm` displays.

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

  * ` [✅]`   supabase/functions/dialectic-service/getStageExpectedCounts/ **Session-less count handler: `{ processTemplateId, modelCount }` → per-stage expected counts (new package)**

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

  * `[ ]`   supabase/functions/dialectic-service/index **Wire the count core + session-less handler into the service dispatch (and complete the `getAllStageProgress` dep)**

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

  * `[ ]`   supabase/functions/dialectic-service/listDomains **Return each enabled domain's default process template id for pre-project cost preview and create**

    * `[ ]`   `objective`
      * `[ ]`   Pre-project cost preview and `createProject` both need the default `process_template_id` for the selected domain before a project exists. `listDomains` today returns only `dialectic_domains` columns (`listDomains.ts` lines 19-23) with no association data. `createProject.ts` (lines 68-81) resolves the default template per domain via `domain_process_associations` where `is_default_for_domain = true` — that lookup is duplicated nowhere else on read paths, so the Create form cannot call `fetchProcessTemplate` or `fetchStageExpectedCounts` after domain selection without an extra round trip invented ad hoc.
      * `[ ]`   Functional goal: extend the BE `DialecticDomain` returned by `listDomains` with `default_process_template_id: string | null` — the `process_template_id` from the row in `domain_process_associations` where `domain_id` matches and `is_default_for_domain === true`, using the same rule as `createProject.ts` 68-81. When no such row exists for a domain, set `default_process_template_id` to `null` and still return the domain in the list (enabled domains are not filtered out).
      * `[ ]`   Functional goal: when a domain has more than one association row (non-default links exist), only the row with `is_default_for_domain = true` supplies the id; the partial unique index `one_default_process_per_domain_idx` guarantees at most one default per domain at the DB level.
      * `[ ]`   Functional goal: preserve existing behavior for ordering and filtering — still only `is_enabled = true` domains, still ordered by `name` ascending; existing error contract on DB failure (`DB_FETCH_FAILED`, status 500) unchanged.
      * `[ ]`   Non-functional: flat handler file (pre-existing, under 600 lines) — no new package folder; no guards file unless a response guard is added in a later FE node (this node does not add FE guards). `dialectic-service/index.ts` dispatch for `listDomains` (lines 336-341) is unchanged — same handler signature and return shape with an additive field on each element.
      * `[ ]`   Out of scope for this node: `packages/types` FE `DialecticDomain` (owned by the `dialectic.api` node); `dialectic.api.ts` / `dialectic.api.domain.test.ts`; `dialecticStore.fetchDomains`; `createProject` accepting client-supplied template id (separate `createProject` node); `fetchProcessTemplate`; count/ceiling logic.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   App-service read handler (BE) — public domain catalog with default process-template resolution for each domain.
      * `[ ]`   This node owns exactly `listDomains.ts` and `listDomains.test.ts`. It does NOT edit `createProject.ts`, `dialectic-service/index.ts`, or any FE file.
      * `[ ]`   Provides the SSOT read path for "which template this domain uses by default" that the FE will mirror on `DialecticDomain` after the API/types node.

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `dialectic-service` domain listing.
      * `[ ]`   Inside: enabled-domain query, default-association resolution per domain, `default_process_template_id` on the response DTO.
      * `[ ]`   Outside: process-template stage/recipe fetch, expected job counts, project creation, RLS policy changes (read policy on `domain_process_associations` already exists — `20250616153421_refactor_domain_process_association.sql`).

    * `[ ]`   `deps`
      * `[ ]`   `SupabaseClient` — provider: `@supabase/supabase-js`; layer: infrastructure; direction: inward; purpose: read `dialectic_domains` and `domain_process_associations`. Supabase client typing exception applies.
      * `[ ]`   `ServiceError` — provider: `../_shared/types.ts`; layer: shared; direction: inward; purpose: error-as-value on DB failure (existing).
      * `[ ]`   `logger` — provider: `../_shared/logger.ts`; existing.
      * `[ ]`   No reverse dependencies. No new injected functions.

    * `[ ]`   `context_slice`
      * `[ ]`   Input: `dbClient` only (unchanged).
      * `[ ]`   Output: `DialecticDomain[]` where each element includes `default_process_template_id: string | null`.
      * `[ ]`   Association read: `process_template_id` from `domain_process_associations` filtered by `is_default_for_domain = true` keyed by `domain_id`. No session, no project, no model count.

    * `[ ]`   `interaction.spec`
      * `[ ]`   Caller: `dialectic-service/index.ts` `case "listDomains"` → `handlers.listDomains(adminClient)` → `createSuccessResponse(data, 200)` (unchanged dispatch).
      * `[ ]`   Downstream consumers (separate nodes): `api.dialectic().listDomains()` → `dialecticStore.fetchDomains` → `domains` / `selectedDomain` → Create form `fetchProcessTemplate(default_process_template_id)` and submit `processTemplateId`.
      * `[ ]`   Ordering: fetch enabled domains first (or join in one query); map template id per domain before return; log success count unchanged.
      * `[ ]`   Failure: DB error on domains query → `{ error: ServiceError, status: 500 }`, no `data` (existing). DB error on association leg → same failure contract; do not return partial domain rows without template ids unless the domains query succeeded and association leg can be treated as empty map (all nulls) — prefer single transactional read pattern that fails closed on association read failure.
      * `[ ]`   Declarative only — no code in this section.

    * `[ ]`   dialectic-service/`listDomains.test.ts`
      * `[ ]`   Update `mockDomains` fixtures: every `DialecticDomain` literal includes `default_process_template_id` (`string` or `null`).
      * `[ ]`   Update the success-path chain mock: adjust `select` expectation if the query string changes (embed/join); assert returned `data[0].default_process_template_id` equals the mocked default for that domain.
      * `[ ]`   Append test: domain with default association — mock returns `default_process_template_id: 'pt-thesis'` for domain `'1'`; assert `data` contains the domain and the field equals `'pt-thesis'`.
      * `[ ]`   Append test: domain with no default association — mock returns `default_process_template_id: null`; domain still present in `data`.
      * `[ ]`   Append test: multiple enabled domains — each row has the correct `default_process_template_id` (including mixed null and non-null).
      * `[ ]`   Preserve existing failure test (`DB_FETCH_FAILED` on domains query). Existing tests remain green after fixture updates.
      * `[ ]`   One behavior per test; new cases appended at end.

    * `[ ]`   dialectic-service/`listDomains.ts`
      * `[ ]`   Add `default_process_template_id: string | null` to exported `DialecticDomain` (lines 6-12).
      * `[ ]`   Replace the single-table `select('id, name, description, parent_domain_id, is_enabled')` (line 21) with a query that resolves default template ids per domain — acceptable implementations: (a) PostgREST embed/filter on `domain_process_associations` with `is_default_for_domain = true` mapped to `default_process_template_id`, or (b) fetch enabled domains then one association query `in('domain_id', domainIds)` with `eq('is_default_for_domain', true)` and merge into a `Map<domainId, processTemplateId>`. Choose one approach; both must satisfy the contract above.
      * `[ ]`   Map each domain row to `{ id, name, description, parent_domain_id, is_enabled, default_process_template_id }` where `default_process_template_id` is the merged template id or `null`.
      * `[ ]`   Keep `eq('is_enabled', true)` and `order('name', { ascending: true })`. Keep error handling block (lines 25-34) and success log (lines 37-38).
      * `[ ]`   No other exports or behavior changes.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: app-service handler (BE).
      * `[ ]`   Deps: inward (`dbClient`, shared error/logger types).
      * `[ ]`   Provides: outward (`DialecticDomain[]` with `default_process_template_id`, consumed by index dispatch → FE API → store → Create form / chat create).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   Every enabled domain in the response includes `default_process_template_id` (string or `null`). Observable: unit tests.
      * `[ ]`   Default id matches `domain_process_associations` where `is_default_for_domain = true` for that `domain_id`, same rule as `createProject.ts` 68-81. Observable: unit test with explicit association mock.
      * `[ ]`   Domains without a default association remain in the list with `null`. Observable: unit test.
      * `[ ]`   Ordering and `is_enabled` filter unchanged. Observable: existing success test updated, still asserts Finance first when mocked sort order applies.
      * `[ ]`   DB failure still returns `{ error, status: 500 }` with no `data`. Observable: existing failure test.
      * `[ ]`   `index.ts` `listDomains` case compiles without signature change. Observable: TypeScript compile / existing index tests if present.

  * `[ ]`   packages/api/src/dialectic.api **Add the `getStageExpectedCounts` API client method (session-less pre-project counts)**

    * `[ ]`   `objective`
      * `[ ]`   The FE has no way to call the new `getStageExpectedCounts` edge-function action; the Create-Project preview node (Group 5) needs an `@paynless/api` method to fetch pre-project per-stage counts.
      * `[ ]`   Functional goal: add `getStageExpectedCounts(payload: GetStageExpectedCountsPayload): Promise<ApiResponse<GetStageExpectedCountsResponse>>` to the `DialecticApiClient`, POSTing `{ action: 'getStageExpectedCounts', payload }` to `'dialectic-service'` and returning the typed `ApiResponse`, exactly mirroring `getAllStageProgress` (lines 667-693) including the `try/catch` `NETWORK_ERROR` path and logging.
      * `[ ]`   Functional goal: add the FE-side contract types in `packages/types` (the FE cannot import the BE `dialectic.interface.ts`): `GetStageExpectedCountsPayload`, `StageExpectedCount`, `GetStageExpectedCountsResponse`, and the `DialecticServiceActionPayload` union member `{ action: 'getStageExpectedCounts'; payload: GetStageExpectedCountsPayload }`.
      * `[ ]`   Non-functional: `dialectic.api.ts` is a pre-existing flat client → reduced footprint (no package format); the new FE types ride in the existing `packages/types/src/dialectic.types.ts`; no response guard is added in the method (mirrors `getAllStageProgress`, which does not guard in-method).
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   API client adapter (FE transport boundary) — translates a typed FE call into the `dialectic-service` action envelope and returns the typed `ApiResponse`.
      * `[ ]`   This node edits exactly one source file (`dialectic.api.ts`) plus its support set (FE types in `dialectic.types.ts`; the mock in `mocks/dialectic.api.mock.ts`; the unit tests in `dialectic.api.documents.test.ts` where `getAllStageProgress` is already tested; the integration test in `dialectic.api.integration.test.ts`).
      * `[ ]`   It does NOT add `expectedCount` to the FE `StageProgressEntry` (the method only passes `GetAllStageProgressResponse` through; that field rides with the first FE node that READS it — Group 3/4). It does NOT touch the store, hooks, or components.

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `@paynless/api` dialectic transport.
      * `[ ]`   Inside this boundary: the request envelope, response typing, error/`NETWORK_ERROR` handling, and the FE contract types for this action.
      * `[ ]`   Outside this boundary: BE counting, store consumption, ceiling arithmetic, and UI.

    * `[ ]`   `deps`
      * `[ ]`   `this.apiClient.post<GetStageExpectedCountsResponse, DialecticServiceActionPayload>` — provider: the base `ApiClient` (already used by every method); layer: transport; direction: inward; purpose: HTTP POST to the edge function.
      * `[ ]`   `GetStageExpectedCountsPayload`, `GetStageExpectedCountsResponse`, `StageExpectedCount`, `DialecticServiceActionPayload` — provider: `@paynless/types` (`packages/types/src/dialectic.types.ts`); layer: types; direction: inward; purpose: typed request/response. `ApiResponse` — provider: `@paynless/types`; existing.
      * `[ ]`   `logger` — provider: existing api logger; reused for the info/error logs mirroring `getAllStageProgress`.
      * `[ ]`   No reverse dependencies. No lateral layer violations. Depends on the `dialectic-service/index` wiring node (the action must exist server-side).

    * `[ ]`   `context_slice`
      * `[ ]`   Input: only `{ processTemplateId, modelCount }`. Output: `ApiResponse<{ stages: StageExpectedCount[]; totalStages: number }>`.
      * `[ ]`   No over-fetching; the method forwards the payload verbatim and returns the response unchanged.

    * `[ ]`   packages/types/src/`dialectic.types.ts`
      * `[ ]`   Add `GetStageExpectedCountsPayload`: `{ processTemplateId: string; modelCount: number; }`.
      * `[ ]`   Add `StageExpectedCount`: `{ stageSlug: string; expectedCount: number; }`.
      * `[ ]`   Add `GetStageExpectedCountsResponse`: `{ stages: StageExpectedCount[]; totalStages: number; }` (FE mirror of the BE handler contract).
      * `[ ]`   Add the union member `{ action: 'getStageExpectedCounts'; payload: GetStageExpectedCountsPayload }` to `DialecticServiceActionPayload` (the union ending at line 1445). Additive; types only (exempt from RED/GREEN).

    * `[ ]`   packages/api/src/`dialectic.api.documents.test.ts`
      * `[ ]`   Add tests mirroring the existing `getAllStageProgress` cases (lines 256-344): a successful call posts `{ action: 'getStageExpectedCounts', payload }` and returns `response.data` (`stages`/`totalStages`); a server error surfaces `response.error`; a thrown network error returns `{ data: undefined, error: { code: 'NETWORK_ERROR', message }, status: 0 }`.
      * `[ ]`   Use the existing api test harness + mocked `apiClient.post`; production types from `@paynless/types`; one behavior per test; appended at the end.

    * `[ ]`   packages/api/src/`dialectic.api.ts`
      * `[ ]`   Add `async getStageExpectedCounts(payload: GetStageExpectedCountsPayload): Promise<ApiResponse<GetStageExpectedCountsResponse>>` immediately after `getAllStageProgress` (line 693), structured identically: `logger.info`, `try { const response = await this.apiClient.post<GetStageExpectedCountsResponse, DialecticServiceActionPayload>('dialectic-service', { action: 'getStageExpectedCounts', payload }); ...error/success logging...; return response; } catch ... NETWORK_ERROR`.
      * `[ ]`   Import the new types from `@paynless/types`. One method added; no other method changes.

    * `[ ]`   packages/api/src/mocks/`dialectic.api.mock.ts`
      * `[ ]`   Add `getStageExpectedCounts: ReturnType<typeof vi.fn<[payload: GetStageExpectedCountsPayload], Promise<ApiResponse<GetStageExpectedCountsResponse>>>>;` to the mock client type (beside line 73) and `getStageExpectedCounts: vi.fn<[GetStageExpectedCountsPayload], Promise<ApiResponse<GetStageExpectedCountsResponse>>>(),` to the mock factory (beside line 109). No behavior beyond the configurable `vi.fn`.

    * `[ ]`   packages/api/src/`dialectic.api.integration.test.ts`
      * `[ ]`   Add an integration case exercising the real `DialecticApiClient.getStageExpectedCounts` against the package's existing mocked-transport boundary: assert the posted envelope (`action`/`payload`) and that a stubbed `{ stages, totalStages }` transport response is returned as a typed `ApiResponse`, mirroring how `getAllStageProgress` is integration-tested in this file.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: API client adapter (FE transport).
      * `[ ]`   Deps: inward (base `ApiClient`, `@paynless/types`).
      * `[ ]`   Provides: outward (`getStageExpectedCounts` consumed by the store / Create-form preview).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   `getStageExpectedCounts(payload)` posts the correct action envelope and returns the typed `ApiResponse<GetStageExpectedCountsResponse>`. Observable: unit test asserts the posted body and returned data.
      * `[ ]`   Server error and network error are surfaced per the `getAllStageProgress` contract. Observable: unit tests.
      * `[ ]`   The new FE types exist in `@paynless/types` and the action union includes the member. Observable: type-checks; no `any`.
      * `[ ]`   The FE `StageProgressEntry` is unchanged in this node. Observable: review confirms no edit to that interface.

  * `[ ]`   packages/store/src/computeCostCeiling **Pure arithmetic: per-stage ceilings and project ceiling from counts × cap × rate, with completed-stage actuals**

    * `[ ]`   `objective`
      * `[ ]`   The cost-ceiling ticket needs a single, side-effect-free arithmetic function that the session NSF surface and the pre-project preview both consume, so the estimate math lives in exactly one tested place and cannot drift between the two surfaces. Today no such function exists; the ceiling formulas (`stage_ceiling = (Σ_step expected_job_count) × maxOutputTokens × maxOutputCostRate`; `project_ceiling = Σ_completed actual + Σ_remaining stage_ceiling`) are only described in prose (lines 409-417).
      * `[ ]`   Functional goal: implement `computeCostCeiling(params: ComputeCostCeilingParams): CostCeilingEstimate` where, for each stage, `stageCeilings[stageSlug] = stage.expectedCount × params.maxOutputTokens × params.maxOutputCostRate` (the per-stage "at most" estimate, computed for every stage regardless of completion), and `projectCeiling` is the sum over stages of the stage's `actualCost` when it is a number (completed) and the stage's estimate when `actualCost` is `null` (remaining).
      * `[ ]`   Functional goal: the completed-vs-remaining choice is made by an explicit `stage.actualCost === null` branch — NEVER a `??`/ternary default — so a completed stage whose real cost is `0` contributes `0` to `projectCeiling` (not its estimate). This is the load-bearing edge: `0` is a valid actual, `null` means "not yet run".
      * `[ ]`   Functional goal: arithmetic only. The function performs NO model-catalog reading, NO `AiModelExtendedConfig` rate extraction, NO `DialecticContribution` summation, NO strategy/DAG/count derivation, and NO store/DB access. `maxOutputCostRate`, `maxOutputTokens`, `expectedCount`, and per-completed-stage `actualCost` arrive pre-computed from the caller (the `dialecticStore` recompute node, Group 4).
      * `[ ]`   Non-functional: zero side effects, deterministic, and stable under empty input (`stages: []` → `{ stageCeilings: {}, projectCeiling: 0 }`) and zero factors (`maxOutputTokens` or `maxOutputCostRate` of `0` → all ceilings `0`, never `NaN`).
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   Domain / pure utility in `@paynless/store` — the single source of cost-ceiling arithmetic, mirroring the existing flat pure-util convention (`packages/store/src/upsertJobFromLifecycleEvent.ts`: flat file, types in `@paynless/types`, `.test.ts` only, consumed by the store via relative import — no barrel export, no `.interface/.guard/.mock/.provides`).
      * `[ ]`   This node CREATES one flat source file plus its types and unit test. It does NOT add a runtime guard (inputs are typed values constructed by the store, not parsed from an untrusted boundary), a mock (no injected dependency to fake), a `provides` barrel (internal relative consumption), or an integration test (no collaborators — its composition with real counts/rates/actuals is proven in the Group 4 store node).
      * `[ ]`   Out of scope: the `AiModelExtendedConfig` shape guard and `OutputCapSlider` migration (next Group 3 node), `costCeilingEstimate` store state / `recompute` action / contribution summation / rate extraction (Group 4), and every UI consumer (Group 5).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `@paynless/store` FE cost-estimation arithmetic.
      * `[ ]`   Inside this boundary: multiplying per-stage `expectedCount` by `maxOutputTokens` and `maxOutputCostRate` to produce `stageCeilings`, and summing actuals (completed) with estimates (remaining) into `projectCeiling`.
      * `[ ]`   Outside this boundary: where `expectedCount` comes from (BE counts via `getAllStageProgress`/`getStageExpectedCounts`), where `maxOutputCostRate` comes from (`modelCatalog[].config` via the `AiModelExtendedConfig` guard), where `actualCost` comes from (`DialecticContribution` summation), and where `maxOutputTokens` comes from (dialectic store). All are the caller's responsibility.

    * `[ ]`   `deps`
      * `[ ]`   `CostCeilingEstimate`, `ComputeCostCeilingParams`, `CostCeilingStageInput` — provider: `@paynless/types` (`packages/types/src/dialectic.types.ts`); layer: types; direction: inward; purpose: the function's input/output contract. Imported from the original source, never re-exported.
      * `[ ]`   No runtime dependencies, no injected functions, no external packages. No reverse dependencies. No lateral layer violations.

    * `[ ]`   `context_slice`
      * `[ ]`   From `params`: only `stages: CostCeilingStageInput[]` (each `{ stageSlug, expectedCount, actualCost }`), `maxOutputTokens: number`, and `maxOutputCostRate: number`. Nothing else is read or reachable.
      * `[ ]`   No over-fetching, no hidden coupling, no store/DB/catalog access.

    * `[ ]`   packages/types/src/`dialectic.types.ts`
      * `[ ]`   Add `CostCeilingStageInput`: `{ stageSlug: string; expectedCount: number; actualCost: number | null; }` (`actualCost` is the completed stage's summed token cost, or `null` when the stage has not completed). Co-locate near the FE count types added by the `dialectic.api` node (`StageExpectedCount` / `GetStageExpectedCountsResponse`).
      * `[ ]`   Add `ComputeCostCeilingParams`: `{ stages: CostCeilingStageInput[]; maxOutputTokens: number; maxOutputCostRate: number; }`.
      * `[ ]`   Add `CostCeilingEstimate`: `{ stageCeilings: Record<string, number>; projectCeiling: number; }` (the type Group 4 will store as `costCeilingEstimate: CostCeilingEstimate | null`).
      * `[ ]`   Add `ComputeCostCeilingFn = (params: ComputeCostCeilingParams) => CostCeilingEstimate;` for typed injection where consumers reference the function shape.
      * `[ ]`   `RecipeGranularity` (line 185): remove the non-existent members `'one_to_many'` and `'many_to_one'`, leaving `'all_to_one' | 'per_source_document' | 'pairwise_by_origin' | 'per_source_group' | 'per_source_document_by_lineage' | 'per_model'` to match the BE `GranularityStrategy` contract. This is a contract-correction removal with no functional consumer (no FE source switches on the removed members; only `DialecticStageRecipeStep.granularity_strategy` references the type), so per the user directive it rides here as the first in-scope FE node that opens `dialectic.types.ts`. No other edit to `DialecticStageRecipeStep` is required.
      * `[ ]`   Types only (exempt from RED/GREEN). No inline ad-hoc types; no `any`; each type minimal and composable.

    * `[ ]`   packages/store/src/`computeCostCeiling.test.ts`
      * `[ ]`   Vitest unit test (`describe`/`it`/`expect`, mirroring `upsertJobFromLifecycleEvent.test.ts`), importing `computeCostCeiling` from `./computeCostCeiling` and the production types from `@paynless/types`; one behavior per test.
      * `[ ]`   Test (per-stage estimate): a single stage `{ stageSlug: 's1', expectedCount: 4, actualCost: null }`, `maxOutputTokens: 1000`, `maxOutputCostRate: 3` → `stageCeilings.s1 === 12000` and `projectCeiling === 12000`.
      * `[ ]`   Test (all remaining): two pending stages (`actualCost: null`) → `projectCeiling` equals the sum of both `stageCeilings` entries.
      * `[ ]`   Test (mixed actual + estimate): one completed stage `{ actualCost: 500 }` and one pending stage with estimate `9000` → `projectCeiling === 9500`, while `stageCeilings` still reports BOTH stages' estimates (the completed stage's estimate is present in `stageCeilings` but its `actualCost` is what counts toward `projectCeiling`).
      * `[ ]`   Test (zero actual is honored, not defaulted): a completed stage `{ expectedCount: 4, actualCost: 0 }` plus a pending stage → `projectCeiling` adds `0` for the completed stage (NOT its estimate), proving the `=== null` discriminator rather than a falsy/`??` default.
      * `[ ]`   Test (empty input): `stages: []` → `{ stageCeilings: {}, projectCeiling: 0 }`.
      * `[ ]`   Test (zero factors): `maxOutputTokens: 0` (or `maxOutputCostRate: 0`) with pending stages → every `stageCeilings` value is `0` and `projectCeiling === 0`, with no `NaN`.
      * `[ ]`   New tests authored at the end of the file; full typed objects built from the production types (no partials, no casts).

    * `[ ]`   `construction`
      * `[ ]`   Entrypoint: the bare pure function `computeCostCeiling(params)`; no class, no state, no partially-constructed instance. All inputs arrive in `params`; there are no defaults and no internal fallback values.
      * `[ ]`   Invalid construction: omitting any `params` field is a type error at the boundary; the function does not synthesize missing inputs.

    * `[ ]`   packages/store/src/`computeCostCeiling.ts`
      * `[ ]`   Implement `export function computeCostCeiling(params: ComputeCostCeilingParams): CostCeilingEstimate`: initialize `const stageCeilings: Record<string, number> = {};` and `let projectCeiling: number = 0;`; for each `stage` of `params.stages`, compute `const estimate: number = stage.expectedCount * params.maxOutputTokens * params.maxOutputCostRate;`, set `stageCeilings[stage.stageSlug] = estimate;`, then `if (stage.actualCost === null) { projectCeiling += estimate; } else { projectCeiling += stage.actualCost; }`; return `{ stageCeilings, projectCeiling }`.
      * `[ ]`   Import the three types from `@paynless/types`. One function in the file; no side effects; no store/catalog/DB access; no `??`/ternary defaults for the completed/remaining choice.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: domain (pure FE utility).
      * `[ ]`   Deps: inward (`@paynless/types` only).
      * `[ ]`   Provides: outward (`CostCeilingEstimate`, consumed by the `dialecticStore` recompute action in Group 4 and, through it, by the NSF and pre-project surfaces in Group 5).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   Per-stage `stageCeilings[stageSlug]` equals `expectedCount × maxOutputTokens × maxOutputCostRate` for every stage. Observable: unit test asserts the product.
      * `[ ]`   `projectCeiling` sums actuals for completed stages and estimates for remaining stages. Observable: mixed-input unit test asserts the combined total.
      * `[ ]`   A completed stage with `actualCost: 0` contributes `0`, not its estimate. Observable: the zero-actual unit test.
      * `[ ]`   Empty `stages` and zero factors produce well-formed, `NaN`-free zero results. Observable: empty-input and zero-factor unit tests.
      * `[ ]`   The function reads nothing beyond `params` (no store/catalog/DB/contribution access). Observable: review confirms only `params` is referenced; no imports beyond `@paynless/types`.
      * `[ ]`   `RecipeGranularity` no longer contains `one_to_many`/`many_to_one`. Observable: grep confirms the members are absent and the FE type matches the BE `GranularityStrategy` set.

  * `[ ]`   apps/web/src/components/dialectic/OutputCapSlider **Narrow `modelCatalog[].config` with a shape-specific `AiModelExtendedConfig` guard, replacing generic `isJson`/`isPlainObject` reads**

    * `[ ]`   `objective`
      * `[ ]`   `OutputCapSlider.tsx` reads each selected model's `modelCatalog[].config` (a Supabase `Json | null` on `AiProvidersRow`) using the generic guards `isJson` + `isPlainObject` (lines 62-71), then indexes raw string keys `configValue["hard_cap_output_tokens"]` / `configValue["provider_max_output_tokens"]` as `unknown` and re-validates each inline with `typeof === "number" && Number.isFinite && >= 0` (lines 73-100). The application type `AiModelExtendedConfig` (`@paynless/types`, `ai.types.ts:129-159`) is never proven, the cost-rate fields (`input_token_cost_rate`, `output_token_cost_rate`) the cost-ceiling work needs stay invisible, and string-indexed access is fragile.
      * `[ ]`   Functional goal: introduce a shape-specific guard `isAiModelExtendedConfig(value: unknown): value is AiModelExtendedConfig` in `@paynless/utils` and migrate the slider to narrow `catalogEntry.config` with it, then read the now-typed `config.hard_cap_output_tokens` / `config.provider_max_output_tokens` directly. The computed `sliderRangeMax` (and therefore all visible slider behavior) is unchanged.
      * `[ ]`   Functional goal: the guard validates the REQUIRED fields — `input_token_cost_rate: number` (finite), `output_token_cost_rate: number` (finite), and `tokenization_strategy` is a record whose `type` is one of `'tiktoken' | 'rough_char_count' | 'provider_specific_api' | 'unknown'` — and, for each OPTIONAL field that is present, enforces its type (`hard_cap_output_tokens`, `provider_max_output_tokens`, `provider_max_input_tokens`, `default_temperature`, `default_top_p` finite numbers; `context_window_tokens` a finite number or `null`). A config missing a required field or carrying a wrong-typed field is rejected.
      * `[ ]`   Functional goal: this guard is the shared rate-reading primitive the Group 4 store recompute will reuse to extract `maxOutputCostRate` from `modelCatalog[].config`; it is introduced here in its first demanding consumer (the slider migration) and reused later — never duplicated (per the rule that a guard rides with the function that first demands the type change).
      * `[ ]`   Non-functional: no change to slider props, store reads, tier filtering, log-segment scale, markers, thumb-max math, or upgrade CTA. `logger` import is retained; the slider's `isJson`/`isPlainObject` imports are removed (both remain exported from `@paynless/utils` for other consumers). The only behavioral change is the config-narrowing path (lines 62-100).
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   UI component (`OutputCapSlider`) data-source hardening, plus a new shared FE type guard in `@paynless/utils`.
      * `[ ]`   The guard rides in this node because the slider is its first demanding consumer. This node does NOT modify the `AiModelExtendedConfig` type (it already exists), the auth/dialectic stores, the slider's tier/marker/scale/CTA logic, or any other consumer.
      * `[ ]`   Out of scope: `computeCostCeiling` (prior node); `costCeilingEstimate` state / recompute / `maxOutputCostRate` extraction (Group 4 — reuses this guard); all other UI (Group 5).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `@paynless/utils` FE type guards (`dialectic.guard.ts`) + `apps/web` dialectic UI (`OutputCapSlider.tsx`).
      * `[ ]`   Inside this boundary: the `isAiModelExtendedConfig` guard, and the slider narrowing `catalogEntry.config` to `AiModelExtendedConfig` before reading `hard_cap_output_tokens`/`provider_max_output_tokens`.
      * `[ ]`   Outside this boundary: how `modelCatalog` is fetched/hydrated (api/store), and how the cost rates are consumed downstream (Group 4).

    * `[ ]`   `deps`
      * `[ ]`   `AiModelExtendedConfig` — provider: `@paynless/types` (`ai.types.ts`); layer: types; direction: inward; purpose: the guarded shape. Imported from the original source, never re-exported.
      * `[ ]`   `isRecord` — provider: `@paynless/utils` (`dialectic.guard.ts`, lines 37-39); layer: shared utility; direction: inward; purpose: the guard's object primitive (the new guard lives in the same file and reuses it).
      * `[ ]`   `useAuthStore`, `useDialecticStore`, `useNavigate`, `Slider`/`Tooltip`/`Button`, `UserTier`, `logger` — existing slider dependencies, unchanged.
      * `[ ]`   No reverse dependencies. No lateral layer violations. Independent of the `computeCostCeiling` node; precedes Group 4 (which reuses this guard).

    * `[ ]`   `context_slice`
      * `[ ]`   Guard input: only `value: unknown` (a `Json | null` config value).
      * `[ ]`   Slider: from each `catalogEntry.config`, only `hard_cap_output_tokens` and `provider_max_output_tokens` (now typed via the guard). No new store reads; `modelCatalog`/`selectedModels` are already read.
      * `[ ]`   No over-fetching, no hidden coupling.

    * `[ ]`   utils/`dialectic.guard.test.ts`
      * `[ ]`   Append a `describe('isAiModelExtendedConfig')` suite (mirroring the existing `isJson`/`isPlainObject`/`isRecord` suites; `import { isAiModelExtendedConfig } from './dialectic.guard'`).
      * `[ ]`   Passing cases: a full valid `AiModelExtendedConfig` (all required + several optional fields) passes; a minimal valid config (only `input_token_cost_rate`, `output_token_cost_rate`, `tokenization_strategy: { type: 'tiktoken' }`) passes; `context_window_tokens: null` passes.
      * `[ ]`   Failing cases: missing `input_token_cost_rate`; missing `output_token_cost_rate`; a rate that is non-number / non-finite; missing `tokenization_strategy`; `tokenization_strategy.type` not in the literal set; an optional numeric field present but non-number (e.g. `hard_cap_output_tokens: "x"`); `null`; an array; a string; a number.
      * `[ ]`   Valid objects built from the `AiModelExtendedConfig` production type; invalid variants built via factory-then-override to invalid values (typed per the strict-typing exception), not by casting arbitrary literals. One behavior per test; appended at the end.

    * `[ ]`   utils/`dialectic.guard.ts`
      * `[ ]`   Add `export function isAiModelExtendedConfig(value: unknown): value is AiModelExtendedConfig`, importing `AiModelExtendedConfig` from `@paynless/types` (add to the existing top-of-file import). Logic: `if (!isRecord(value)) return false;` require `typeof value['input_token_cost_rate'] === 'number' && Number.isFinite(value['input_token_cost_rate'])` and the same for `output_token_cost_rate`; require `isRecord(value['tokenization_strategy'])` and `value['tokenization_strategy']['type']` to be one of `'tiktoken' | 'rough_char_count' | 'provider_specific_api' | 'unknown'`; for each optional numeric key (`hard_cap_output_tokens`, `provider_max_output_tokens`, `provider_max_input_tokens`, `default_temperature`, `default_top_p`), if the key is present it must be a finite number else return false; for `context_window_tokens`, if present it must be a finite number or `null`; otherwise return `true`.
      * `[ ]`   Reuse `isRecord` from this same file (lines 37-39). No `any`, no casts, no inline ad-hoc types.

    * `[ ]`   dialectic/`OutputCapSlider.test.tsx`
      * `[ ]`   Rebuild the `modelCatalog` fixtures so each `mockAiProvidersRow({ config })` carries a FULL valid `AiModelExtendedConfig` — replace the bare `config: { provider_max_output_tokens: 200000 }` (lines 162, 215, 398, 419) and the two-model ultra fixtures (lines 343, 348) with `config: { ...mockAiModelConfig(), provider_max_output_tokens: <value> }`, spreading the existing `mockAiModelConfig()` factory (already used as `mockAiProvidersRow`'s default config, `dialecticStore.mock.ts:798`) so the new guard accepts the fixture and `sliderRangeMax` is computed identically. Import `mockAiModelConfig` if not already imported.
      * `[ ]`   Add test: a selected model whose `config` fails `isAiModelExtendedConfig` (e.g. `config: { provider_max_output_tokens: 200000 }` with the required rate/tokenization fields removed) is NOT counted toward `sliderRangeMax`; with only that model selected the slider returns null (no track), proving the guard gates malformed config.
      * `[ ]`   Add test: with a valid full config whose `provider_max_output_tokens` is `200000`, `sliderRangeMax` is `200000` (unchanged from the pre-migration assertion), proving the typed read matches the previous string-indexed read.
      * `[ ]`   All other existing assertions (4 markers, thumb max, within/above-tier marker clicks, CTA → `/subscription`, ultra thumb reach, page guidance, empty-`availableTiers`, empty-`selectedModels`) remain green. New tests appended at the end; full typed objects from production types.

    * `[ ]`   dialectic/`OutputCapSlider.tsx`
      * `[ ]`   Replace the import on line 21 `import { isJson, isPlainObject, logger } from "@paynless/utils";` with `import { isAiModelExtendedConfig, logger } from "@paynless/utils";`.
      * `[ ]`   In the `sliderRangeMax` memo (lines 62-100): replace the `configValue === null` / `!isJson(configValue)` / `!isPlainObject(configValue)` gate and the raw `configValue["hard_cap_output_tokens"]` / `configValue["provider_max_output_tokens"]` reads with `const config = catalogEntry.config; if (!isAiModelExtendedConfig(config)) { continue; }` then read the typed `config.hard_cap_output_tokens` and `config.provider_max_output_tokens`. Preserve the existing `applicationCap`/`providerCap`/`Math.min`/`Number.isFinite` selection and the `highest` accumulation (lines 76-108) unchanged — only the source of the two values changes from `unknown`-indexed to typed-field access (the present-and-finite optional fields are guaranteed numbers by the guard, so the per-field `typeof`/`Number.isFinite` checks collapse to a presence check `if (config.hard_cap_output_tokens !== undefined)` / `if (config.provider_max_output_tokens !== undefined)`).
      * `[ ]`   No other change: tier filtering (`displayTiers`), `thumbMax`/`activeThumbMax`, the log-segment slider math, markers, page guidance, and the upgrade CTA are untouched. Preserve all existing logging.

    * `[ ]`   dialectic/`OutputCapSlider.integration.test.tsx`
      * `[ ]`   Rebuild the `modelCatalog` fixtures here the same way (full `AiModelExtendedConfig` via `{ ...mockAiModelConfig(), provider_max_output_tokens: <value> }`) so the real-store integration path passes the new guard and the existing assertions (4 markers excluding `unreachable`, track max from model, thumb clamp, locked-marker CTA → `navigate('/subscription')`, real `maxOutputTokens` write) remain green with router as the only mock. Add one assertion that the slider's track max derives from the guarded `provider_max_output_tokens` of the seeded model.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: shared utility guard (`@paynless/utils`) + UI component (`apps/web`).
      * `[ ]`   Deps: inward (`@paynless/types`, `isRecord`; stores, router, UI primitives).
      * `[ ]`   Provides: outward (`isAiModelExtendedConfig` consumed by the Group 4 store recompute; the slider continues to write `maxOutputTokens`).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   `isAiModelExtendedConfig` accepts valid configs (required + optional) and rejects configs missing a required field, with a bad rate, with an invalid `tokenization_strategy.type`, or with a wrong-typed optional field. Observable: guard tests.
      * `[ ]`   The slider narrows `catalogEntry.config` via `isAiModelExtendedConfig` and reads typed `hard_cap_output_tokens`/`provider_max_output_tokens`; `isJson`/`isPlainObject` no longer appear in the file. Observable: grep + unit test that `sliderRangeMax` matches the prior value for a valid config.
      * `[ ]`   A selected model with malformed config is excluded from `sliderRangeMax`. Observable: unit test asserts null/no-track when only that model is selected.
      * `[ ]`   All pre-existing slider unit and integration assertions remain green with the full-config fixtures. Observable: the existing tests pass after the fixture rebuild.
      * `[ ]`   No change to slider props, store reads, tier/marker/scale/CTA logic, or logging. Observable: review confirms only the config-narrowing path and the import line changed.

  * `[ ]`   packages/store/src/dialecticStore **Establish expected-counts store state (post-project run-keyed `stageExpectedCountsByRun` map + pre-project counts) and the `fetchStageExpectedCounts` action**

    * `[ ]`   `objective`
      * `[ ]`   The selector that derives the dynamic cost ceiling (next Group 4 node, `dialecticStore.selectors.ts`) needs per-stage expected job counts in two contexts: (a) **post-project** — the authoritative counts the BE already computed and returns on `GetAllStageProgressResponse.stages[].expectedCount` (added by the `getAllStageProgress` node); and (b) **pre-project** — before any session exists, fetched on demand via `api.dialectic().getStageExpectedCounts(...)` (added by the `dialectic.api` node). Neither value has a home in the store today, so both are dropped and the selector cannot read counts.
      * `[ ]`   Why a run-keyed map and NOT a field on `StageRunProgressSnapshot`: a snapshot is constructed at multiple sites that have no counts — `dialecticStore.documents.ts:1724` (per-stage `hydrateStageProgressLogic`, fed by `listStageDocuments`, which returns no counts), `dialecticStore.ts:636` (init of `stageRunProgress` for all stages), and the notification-driven job upserts. Putting `expectedCount` on the snapshot would force every one of those creators to invent a value, which is a forbidden fallback for data users make financial decisions on. Instead this node mirrors the existing `dagProgressByRun` pattern (`dialectic.types.ts:409`, initialized at `dialecticStore.ts:209`, populated ONLY by the authoritative `hydrateAllStageProgressLogic` at `dialecticStore.documents.ts:1847`): a run-keyed map fed solely by authoritative hydration. Absent ⇒ the selector returns `null` (no estimate shown), never a fabricated zero.
      * `[ ]`   Functional goal (post-project): add `stageExpectedCountsByRun: Record<string, Record<string, number>>` to `DialecticStateValues` (key `${sessionId}:${iterationNumber}` → `stageSlug` → `expectedCount`), declared in `@paynless/types` and initialized `{}` in the store's initial state beside `dagProgressByRun`. **This node only declares and initializes it; the next `dialecticStore.documents` node populates it.** Between the two nodes the map exists and is empty, and the selector treats empty as "no estimate".
      * `[ ]`   Functional goal (pre-project): add `preProjectStageExpectedCounts: StageExpectedCount[] | null`, `isLoadingStageExpectedCounts: boolean`, and `stageExpectedCountsError: ApiError | null` to `DialecticStateValues`, initialized `null` / `false` / `null`.
      * `[ ]`   Functional goal (action): add `fetchStageExpectedCounts: (payload: GetStageExpectedCountsPayload) => Promise<void>` to `DialecticActions` and implement it in `dialecticStore.ts`, mirroring `fetchProcessTemplate` (`dialecticStore.ts:538`) for loading/error handling. It calls `api.dialectic().getStageExpectedCounts(payload)`; on `response.error` it sets `stageExpectedCountsError` and clears loading, leaving `preProjectStageExpectedCounts` null; on success it validates `response.data` with the new `isGetStageExpectedCountsResponse` guard and, only if valid, stores `response.data.stages` into `preProjectStageExpectedCounts`; if validation fails it sets `stageExpectedCountsError` and leaves counts null. No fallback, no partial or zeroed data is ever stored.
      * `[ ]`   Functional goal (guards): introduce `isStageExpectedCount(value: unknown): value is StageExpectedCount` and `isGetStageExpectedCountsResponse(value: unknown): value is GetStageExpectedCountsResponse` in `@paynless/utils` `dialectic.guard.ts`, demanded first by this action. `expectedCount` must be a finite non-negative integer and `stageSlug` a non-empty string — any violation rejects the response so the financial path never reads invalid counts.
      * `[ ]`   Non-functional: additive only. No existing state field, initial value, or action is modified; `dagProgressByRun`, `stageRunProgress`, and all existing fetch actions are untouched.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   FE store state + action (`dialecticStore.ts`), plus FE response guards in `@paynless/utils` (`dialectic.guard.ts`).
      * `[ ]`   This node declares/initializes the expected-counts state (post-project run-keyed map + pre-project counts) and the pre-project fetch action, and adds the response guards that fetch demands. It does NOT populate `stageExpectedCountsByRun` (the `dialecticStore.documents` node), compute ceilings (`computeCostCeiling`, prior node), derive ceilings (`dialecticStore.selectors`, next node), or touch any UI.
      * `[ ]`   Out of scope: BE count computation; api transport (`dialectic.api`, prior node); hydration population (next node); the `selectCostCeiling` selector (next node); the Create form / NSF / SessionInfoCard consumers (Group 5).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `@paynless/store` dialectic module (`dialecticStore.ts`), `@paynless/types` (`dialectic.types.ts`), and `@paynless/utils` FE guards (`dialectic.guard.ts`).
      * `[ ]`   Inside this boundary: the new state shape and its initial values, the `fetchStageExpectedCounts` action, and the two response guards.
      * `[ ]`   Outside this boundary: how the counts are computed (BE), transported (`dialectic.api`), populated into `stageExpectedCountsByRun` (next node), derived into a ceiling (selector), or consumed by UI.

    * `[ ]`   `deps`
      * `[ ]`   `GetStageExpectedCountsPayload`, `StageExpectedCount`, `GetStageExpectedCountsResponse` — provider: `@paynless/types` (`dialectic.types.ts`, added by the `dialectic.api` node); layer: types; direction: inward; purpose: the action payload, the stored element type, and the validated response. Imported from the original source, never re-exported.
      * `[ ]`   `api.dialectic().getStageExpectedCounts` — provider: `@paynless/api` (added by the `dialectic.api` node); layer: API client; direction: inward; purpose: fetches the pre-project counts.
      * `[ ]`   `isRecord` — provider: `@paynless/utils` (`dialectic.guard.ts:37-39`); layer: shared utility; direction: inward; purpose: the object primitive the two new guards reuse (they live in the same file).
      * `[ ]`   `ApiError` — provider: `@paynless/types`; layer: types; direction: inward; purpose: the `stageExpectedCountsError` field type, matching the store's existing `*Error` fields (e.g. `processTemplateError`).
      * `[ ]`   No reverse dependencies. Depends on the `dialectic.api` node (types + method) and rides ahead of the `getAllStageProgress`-fed `expectedCount` (consumed by the next, documents, node). Precedes the `dialecticStore.documents` and `dialecticStore.selectors` nodes.

    * `[ ]`   `context_slice`
      * `[ ]`   From `GetStageExpectedCountsResponse`: only `stages[]` (each `{ stageSlug, expectedCount }`). No over-fetch.
      * `[ ]`   Post-project: `stageExpectedCountsByRun[`${sessionId}:${iterationNumber}`][stageSlug]` — read later by the selector; written later by the documents node.
      * `[ ]`   No hidden coupling.

    * `[ ]`   packages/types/src/`dialectic.types.ts`
      * `[ ]`   In `DialecticStateValues` (beside `dagProgressByRun`, line 409): add `stageExpectedCountsByRun: Record<string, Record<string, number>>;`, `preProjectStageExpectedCounts: StageExpectedCount[] | null;`, `isLoadingStageExpectedCounts: boolean;`, `stageExpectedCountsError: ApiError | null;`. (`StageExpectedCount` and `ApiError` are already importable in this file — `StageExpectedCount` from the `dialectic.api` node, `ApiError` already used by the existing `*Error` fields.)
      * `[ ]`   In `DialecticActions`: add `fetchStageExpectedCounts: (payload: GetStageExpectedCountsPayload) => Promise<void>;`.
      * `[ ]`   Types only (exempt from RED/GREEN). Additive; no existing member modified.

    * `[ ]`   utils/`dialectic.guard.test.ts`
      * `[ ]`   Append `describe('isStageExpectedCount')` (mirroring the existing suites; `import { isStageExpectedCount } from './dialectic.guard'`). Passing: `{ stageSlug: 'thesis', expectedCount: 3 }`; `expectedCount: 0`. Failing: empty `stageSlug`; `stageSlug` non-string; `expectedCount` negative; non-integer (`1.5`); `Infinity`/`NaN`; non-number; missing; `null`; array; string.
      * `[ ]`   Append `describe('isGetStageExpectedCountsResponse')`. Passing: a response whose `stages` is an array of valid `StageExpectedCount` (including empty `stages: []`). Failing: `stages` not an array; a `stages` element that fails `isStageExpectedCount`; non-record; `null`.
      * `[ ]`   Valid objects built from the production types; invalid variants built via factory-then-override to invalid values (typed per the strict-typing exception), not by casting arbitrary literals. One behavior per test; appended at the end.

    * `[ ]`   utils/`dialectic.guard.ts`
      * `[ ]`   Add `export function isStageExpectedCount(value: unknown): value is StageExpectedCount`: `if (!isRecord(value)) return false;` require `typeof value['stageSlug'] === 'string' && value['stageSlug'].length > 0`; require `typeof value['expectedCount'] === 'number' && Number.isInteger(value['expectedCount']) && value['expectedCount'] >= 0`; else `return true`.
      * `[ ]`   Add `export function isGetStageExpectedCountsResponse(value: unknown): value is GetStageExpectedCountsResponse`: `if (!isRecord(value)) return false;` require `Array.isArray(value['stages']) && value['stages'].every(isStageExpectedCount)`; validate any additional fields on `GetStageExpectedCountsResponse` as defined by the `dialectic.api` node; else `return true`.
      * `[ ]`   Import `StageExpectedCount`, `GetStageExpectedCountsResponse` from `@paynless/types` (add to the existing top-of-file import). Reuse `isRecord` (lines 37-39). No `any`, no casts, no inline ad-hoc types.

    * `[ ]`   packages/store/src/`dialecticStore.test.ts`
      * `[ ]`   Initial-state test: a fresh store has `stageExpectedCountsByRun` equal to `{}`, `preProjectStageExpectedCounts` `null`, `isLoadingStageExpectedCounts` `false`, `stageExpectedCountsError` `null`.
      * `[ ]`   `fetchStageExpectedCounts` success: mock `api.dialectic().getStageExpectedCounts` to resolve a valid `GetStageExpectedCountsResponse` → after the call, `preProjectStageExpectedCounts` deep-equals `response.data.stages`, `isLoadingStageExpectedCounts` is `false`, `stageExpectedCountsError` is `null`.
      * `[ ]`   API-error path: mock to resolve `{ error: <ApiError>, data: undefined }` → `stageExpectedCountsError` is the error, `preProjectStageExpectedCounts` stays `null`, loading `false`.
      * `[ ]`   Invalid-data path: mock to resolve a response that fails `isGetStageExpectedCountsResponse` (e.g. a `stages` element with `expectedCount: -1` or `expectedCount: 1.5`) → `stageExpectedCountsError` is set, `preProjectStageExpectedCounts` stays `null`, loading `false`, proving invalid financial data is never stored.
      * `[ ]`   Loading toggle: assert `isLoadingStageExpectedCounts` is `true` while the call is in flight and `false` after it settles.
      * `[ ]`   Use the existing dialectic api mock; build all request/response objects from production types. New cases appended at the end.

    * `[ ]`   packages/store/src/`dialecticStore.ts`
      * `[ ]`   In the initial state (lines 204-211, beside `dagProgressByRun: {}`): add `stageExpectedCountsByRun: {},`, `preProjectStageExpectedCounts: null,`, `isLoadingStageExpectedCounts: false,`, `stageExpectedCountsError: null,`.
      * `[ ]`   Add the `fetchStageExpectedCounts` action mirroring `fetchProcessTemplate` (line 538): `set({ isLoadingStageExpectedCounts: true, stageExpectedCountsError: null });`, `logger.info(...)`; `const response = await api.dialectic().getStageExpectedCounts(payload);`; if `response.error` → `logger.error(...)` + `set({ isLoadingStageExpectedCounts: false, stageExpectedCountsError: response.error });` and return; else `if (!isGetStageExpectedCountsResponse(response.data))` → construct an `ApiError` (`{ code: 'INVALID_RESPONSE', message: '...' }`) and `set({ isLoadingStageExpectedCounts: false, stageExpectedCountsError: <that error> });` and return; else `set({ isLoadingStageExpectedCounts: false, preProjectStageExpectedCounts: response.data.stages });`.
      * `[ ]`   Add imports: `isGetStageExpectedCountsResponse` from `@paynless/utils`, `GetStageExpectedCountsPayload` from `@paynless/types` (extend the existing imports; never re-export). No fallback, no `as`, no defaulting of counts.
      * `[ ]`   No other behavioral change; all existing actions and state remain untouched.

    * `[ ]`   apps/web/src/mocks/`dialecticStore.mock.ts`
      * `[ ]`   In the mock initial state (lines 889-908, beside `dagProgressByRun: {}` at 889): add `stageExpectedCountsByRun: {},`, `preProjectStageExpectedCounts: null,`, `isLoadingStageExpectedCounts: false,`, `stageExpectedCountsError: null,`.
      * `[ ]`   In the action mocks (~973-1003, beside `fetchProcessTemplate`): add `fetchStageExpectedCounts: vi.fn().mockResolvedValue(undefined),`.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: store (FE state/actions) + shared guards (`@paynless/utils`).
      * `[ ]`   Deps: inward (`@paynless/types`, `@paynless/api`, `isRecord`).
      * `[ ]`   Provides: outward (`stageExpectedCountsByRun` + `preProjectStageExpectedCounts` read by `selectCostCeiling`; `fetchStageExpectedCounts` called by the Create form in Group 5; the two guards reusable).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   The four new state fields are declared and initialized; `stageExpectedCountsByRun` initializes to `{}`. Observable: initial-state unit test.
      * `[ ]`   `fetchStageExpectedCounts` stores only validated `stages` on success. Observable: success unit test.
      * `[ ]`   On API error OR failed validation, `preProjectStageExpectedCounts` stays `null` and `stageExpectedCountsError` is set — no partial or zeroed data. Observable: the API-error and invalid-data unit tests.
      * `[ ]`   `isStageExpectedCount` rejects negative, non-integer, non-finite, missing, or non-number `expectedCount` and empty/non-string `stageSlug`; `isGetStageExpectedCountsResponse` rejects non-array `stages` and bad elements. Observable: guard tests.
      * `[ ]`   Additive only: `dagProgressByRun`, `stageRunProgress`, and all existing actions are unchanged. Observable: review + existing store tests remain green.

  * `[ ]`   packages/store/src/dialecticStore.documents **Populate `stageExpectedCountsByRun` from authoritative `getAllStageProgress` hydration; mirror the BE `expectedCount` onto the FE `StageProgressEntry`**

    * `[ ]`   `objective`
      * `[ ]`   The prior node declared and initialized `stageExpectedCountsByRun: Record<string, Record<string, number>>` to `{}`, but nothing populates it. The authoritative source of post-project per-stage counts is `GetAllStageProgressResponse.stages[].expectedCount` — the BE `getAllStageProgress` node adds `expectedCount: number` to the BE `StageProgressEntry` (`dialectic.interface.ts:1002-1011`), populated from `StageCountsEntry.totalExpected` and guarded as a finite non-negative integer by `isStageProgressEntry`. The FE mirror type `StageProgressEntry` (`dialectic.types.ts:1255-1264`) does not yet carry `expectedCount`, so `hydrateAllStageProgressLogic` (`dialecticStore.documents.ts:1799`) cannot read it and the count is dropped.
      * `[ ]`   Functional goal: add `expectedCount: number` to the FE `StageProgressEntry`, after `progress` (line 1259), mirroring the BE contract exactly — required, finite non-negative integer (no optional, no `null`; the BE always emits it).
      * `[ ]`   Functional goal: in `hydrateAllStageProgressLogic`, before the `set` (alongside the existing pre-`set` validations at lines 1820-1842), throw a `[hydrateAllStageProgress]`-prefixed error if any `entry.expectedCount` is not a finite non-negative integer — invalid count data is never admitted to the store, because users make financial decisions on it. This matches the function's existing throw-on-invalid pattern (lines 1814-1842); no silent skip, no default.
      * `[ ]`   Functional goal: inside the `set`, beside `state.dagProgressByRun[runKey] = dagProgress;` (line 1847), reset `state.stageExpectedCountsByRun[runKey] = {}` and, within the existing per-stage loop (lines 1848-1920), assign `state.stageExpectedCountsByRun[runKey][entry.stageSlug] = entry.expectedCount;`. Full overwrite on every authoritative hydration (refresh semantics), mirroring how `dagProgressByRun[runKey]` is overwritten.
      * `[ ]`   Non-functional: `hydrateStageProgressLogic` — the per-stage path fed by `listStageDocuments`, which returns NO counts (`dialecticStore.documents.ts:1693-1797`) — is NOT modified. It must never write `stageExpectedCountsByRun`, so an authoritative count is never overwritten by a fabricated or absent one. No `StageRunProgressSnapshot` field, no other hydrated field, and no other hydrate logic changes.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   FE hydration logic (`dialecticStore.documents.ts`) + the FE `StageProgressEntry` type mirror (`dialectic.types.ts`).
      * `[ ]`   This node reads `expectedCount` from the authoritative all-stages response and writes the run-keyed `stageExpectedCountsByRun` map declared by the prior node. It does NOT compute or select ceilings, modify the per-stage hydrate path, or change the API client / BE.
      * `[ ]`   Out of scope: the prior node's state/action; the `selectCostCeiling` selector (next node); UI (Group 5); the shallow `isGetAllStageProgressResponse` guard (`type_guards.ts:171-177`, `Array.isArray(stages)` only — not on this hydration path, left unchanged).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `@paynless/store` documents module (`dialecticStore.documents.ts`) + `@paynless/types` (`dialectic.types.ts`).
      * `[ ]`   Inside this boundary: the FE `StageProgressEntry.expectedCount` field, and the validate-then-populate of `stageExpectedCountsByRun` in `hydrateAllStageProgressLogic`.
      * `[ ]`   Outside this boundary: BE count computation, API transport, the selector, and UI consumers.

    * `[ ]`   `deps`
      * `[ ]`   `GetAllStageProgressResponse`, `StageProgressEntry` — provider: `@paynless/types` (`dialectic.types.ts`); layer: types; direction: inward; purpose: the response the hydrate reads, now carrying `expectedCount`. Imported from the original source, never re-exported.
      * `[ ]`   `stageExpectedCountsByRun` — provider: the prior node (`dialecticStore.ts` initial state + `DialecticStateValues`); layer: store state; direction: this node populates it. HARD dependency: without the prior node's `{}` initialization, `state.stageExpectedCountsByRun[runKey]` is `undefined` and the assignment throws.
      * `[ ]`   `api.dialectic().getAllStageProgress` — provider: `@paynless/api`; layer: API client; direction: inward; purpose: returns the authoritative `GetAllStageProgressResponse`.
      * `[ ]`   `set: (fn: (draft: Draft<DialecticStateValues>) => void) => void` — existing parameter of `hydrateAllStageProgressLogic`; provides the Immer draft.
      * `[ ]`   No reverse dependencies. Depends on the prior (`dialecticStore.ts`) node and the BE `getAllStageProgress` node (the `expectedCount` contract). Precedes the `dialecticStore.selectors` node (which reads the map).

    * `[ ]`   `context_slice`
      * `[ ]`   From each `StageProgressEntry`: only `stageSlug` and `expectedCount` (the existing `steps`/`documents`/`jobs`/`progress` reads are unchanged).
      * `[ ]`   Writes only `stageExpectedCountsByRun[`${sessionId}:${iterationNumber}`][stageSlug]`. No other state touched. No over-fetch, no hidden coupling.

    * `[ ]`   packages/types/src/`dialectic.types.ts`
      * `[ ]`   In the FE `StageProgressEntry` (lines 1255-1264): add `expectedCount: number;` immediately after `progress: { completedSteps: number; totalSteps: number; failedSteps: number };` (line 1259), matching the BE field ordering. Required field, finite non-negative integer by contract.
      * `[ ]`   Types only (exempt from RED/GREEN). Additive to the interface; because it is required, every constructed `StageProgressEntry` must supply it — satisfied centrally by the `mockStageProgressEntry` factory default below, not by per-fixture edits.

    * `[ ]`   apps/web/src/mocks/`dialecticStore.mock.ts`
      * `[ ]`   The three FE tests that build `StageProgressEntry`/`GetAllStageProgressResponse` do so with inline literals (`dialecticStore.documents.test.ts` ~10 entries at 452/470/515/566/701/745/794/872/951/1034; `dialecticStore.test.ts` ≈1145; `dialectic.api.documents.test.ts` ≈221-242), which violates the no-inline-mocks rule and would force manual repair on every shape change. This file is already the project's dialectic mock factory (`mockDialecticProject`, `mockStageRunProgressSnapshot`, etc.); the prior node in this ticket already edits it for the new store state fields. `packages/store` tests (`dialecticStore.notifications.test.ts`) and `packages/api` tests (`dialectic.api.contribution.test.ts`, `dialectic.api.integration.test.ts`) already import factories from here via `../../../apps/web/src/mocks/dialecticStore.mock` — NOT from `@paynless/api/mocks` (that barrel is only API client `vi.fn` stubs in `dialectic.api.mock.ts`).
      * `[ ]`   Add `export function mockStageProgressEntry(overrides: Partial<StageProgressEntry> = {}): StageProgressEntry` returning spec-valid defaults from the production type — `{ stageSlug: 'thesis', status: <valid UnifiedProjectStatus>, modelCount: 1, progress: { completedSteps: 0, totalSteps: 0, failedSteps: 0 }, expectedCount: 0, steps: [], documents: [], jobs: [], edges: [], ...overrides }` (the default carries the new `expectedCount`).
      * `[ ]`   Add `export function mockGetAllStageProgressResponse(overrides: Partial<GetAllStageProgressResponse> = {}): GetAllStageProgressResponse` returning `{ dagProgress: <valid DagProgressDto, `dialectic.types.ts:1179`>, stages: [mockStageProgressEntry()], ...overrides }`. Extend the file's existing `@paynless/types` imports with `StageProgressEntry`, `GetAllStageProgressResponse`, `DagProgressDto`. No `as`, no inline ad-hoc types.

    * `[ ]`   packages/store/src/`dialecticStore.documents.test.ts`
      * `[ ]`   Migrate every inline `GetAllStageProgressResponse`/`StageProgressEntry` literal in the `hydrateAllStageProgressLogic` suite (452, 470, 515, 566, 701, 745, 794, 872, 951, 1034) to `mockGetAllStageProgressResponse({ stages: [mockStageProgressEntry({ ...asserted fields... })] })`, preserving each test's `stageSlug`/`modelCount`/`steps`/`documents`/`jobs`/`progress`/`dagProgress`. Import from `../../../apps/web/src/mocks/dialecticStore.mock` (same path as `dialecticStore.notifications.test.ts`). Existing assertions stay green.
      * `[ ]`   Success assertion: `mockStageProgressEntry({ stageSlug: 'thesis', expectedCount: <n> })`; after `hydrateAllStageProgressLogic` resolves, `store.getState().stageExpectedCountsByRun['${sessionId}:${iterationNumber}']['thesis']` equals `<n>`; a two-stage response asserts each stage keyed to its own count.
      * `[ ]`   Throw assertion: `mockStageProgressEntry({ expectedCount: -1 })` (and `1.5`, and a non-number via typed override) makes `hydrateAllStageProgressLogic` reject with `/\[hydrateAllStageProgress\].*expectedCount/`, and `stageExpectedCountsByRun` is left unchanged.
      * `[ ]`   Per-stage-path assertion: after an authoritative hydrate populates a stage's count, a subsequent `hydrateStageProgressLogic` (listStageDocuments path) for the same key does NOT clear or alter `stageExpectedCountsByRun`. New cases appended; all objects via the factory with typed overrides.

    * `[ ]`   packages/store/src/`dialecticStore.test.ts`
      * `[ ]`   Migrate the inline `StageProgressEntry`/response literal(s) (≈1145) to the factory + typed overrides; import from `../../../apps/web/src/mocks/dialecticStore.mock`. No assertion changes (the factory default supplies `expectedCount`).

    * `[ ]`   packages/api/src/`dialectic.api.documents.test.ts`
      * `[ ]`   Migrate the inline `StageProgressEntry`/response literal(s) (≈221-242) to the factory + typed overrides; import from `../../../apps/web/src/mocks/dialecticStore.mock` (same path as `dialectic.api.contribution.test.ts`). No assertion changes.

    * `[ ]`   packages/store/src/`dialecticStore.documents.ts`
      * `[ ]`   Add a pre-`set` validation loop after the document-validation block (which ends at line 1842) and before `const runKey` (line 1844): `for (const entry of stages) { if (!Number.isInteger(entry.expectedCount) || entry.expectedCount < 0) { throw new Error(`[hydrateAllStageProgress] expectedCount invalid for stage ${entry.stageSlug}; sessionId=${sessionId}, iterationNumber=${iterationNumber}`); } }`. Consistent with the existing inline validations/throws in this function; no shared FE helper exists (none in `@paynless/utils`), so the check is inline as the file already does for `steps`/`documents`.
      * `[ ]`   Inside the `set`, immediately after `state.dagProgressByRun[runKey] = dagProgress;` (line 1847): add `state.stageExpectedCountsByRun[runKey] = {};`. Within the existing `for (const entry of stages)` loop (starting line 1848), add `state.stageExpectedCountsByRun[runKey][entry.stageSlug] = entry.expectedCount;`.
      * `[ ]`   Do NOT modify `hydrateStageProgressLogic`. No new imports (the response type already flows through the existing `@paynless/types` import). No other behavioral change; all existing snapshot population (`stepStatuses`, `documents`, `jobProgress`, `progress`, `jobs`) is untouched. No `as`, no default, no fallback.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: store (FE hydration).
      * `[ ]`   Deps: inward (`@paynless/types`, `@paynless/api`, the prior node's state, Immer `set`).
      * `[ ]`   Provides: outward (`stageExpectedCountsByRun` populated, read by `selectCostCeiling` in the next node).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   FE `StageProgressEntry` carries a required `expectedCount: number`. Observable: type definition; all fixtures compile with the field present.
      * `[ ]`   After authoritative hydration, `stageExpectedCountsByRun[runKey][stageSlug]` equals each `entry.expectedCount`. Observable: success unit test (single- and multi-stage).
      * `[ ]`   An invalid `expectedCount` (negative, non-integer, or non-number) makes `hydrateAllStageProgressLogic` throw and stores nothing. Observable: throw unit test.
      * `[ ]`   `hydrateStageProgressLogic` never writes `stageExpectedCountsByRun`; an authoritative count survives a subsequent per-stage hydrate. Observable: per-stage-path unit test.
      * `[ ]`   No change to any other hydrated field or to the per-stage path. Observable: existing documents tests remain green.

  * `[ ]`   packages/store/src/dialecticStore.selectors **Selector-derived `selectCostCeiling` (post-project) and `selectPreProjectCostCeiling` (pre-project); no stored estimate, no recompute action**

    * `[ ]`   `objective`
      * `[ ]`   Group 4 architecture (resolved): cost ceilings are **selector-derived**, not stored. The ticket originally listed `costCeilingEstimate` state + `recomputeCostCeiling` action (line 482); that is superseded. This node adds two pure selectors that read live dialectic state, assemble `ComputeCostCeilingParams`, and call `computeCostCeiling` — recomputing on every read when inputs change (model selection, slider, hydration, contributions).
      * `[ ]`   **`selectCostCeiling(state, sessionId): CostCeilingEstimate | null`** (post-project): for the session's current `iteration_count`, read per-stage `expectedCount` from `state.stageExpectedCountsByRun[`${sessionId}:${iterationNumber}`][stageSlug]` (populated by the `dialecticStore.documents` node); read `maxOutputTokens` and `maxOutputCostRate` from dialectic state; determine per-stage `actualCost` by summing `DialecticContribution` token usage × model rates when `selectUnifiedProjectProgress` reports `stageStatus === 'completed'`, else `actualCost: null`; call `computeCostCeiling`. Return `null` when any required input is absent or invalid — never a fabricated zero estimate.
      * `[ ]`   **`selectPreProjectCostCeiling(state): CostCeilingEstimate | null`** (pre-project): read `state.preProjectStageExpectedCounts` (stored by `fetchStageExpectedCounts` in the `dialecticStore.ts` node); same `maxOutputTokens` / `maxOutputCostRate` extraction; all stages `actualCost: null` (no session/contributions yet); call `computeCostCeiling`.
      * `[ ]`   **`maxOutputTokens`**: use `state.maxOutputTokens` only when it is a finite number. When `null`, return `null` — the tier-default clamp (`userTier.output_cap_tokens`) lives in `authStore` / `OutputCapSlider` (`OutputCapSlider.tsx:176-182`), not in `DialecticStateValues`, so this selector does not invent a tier cap. The slider's `useEffect` writes the effective value into `maxOutputTokens` once tier/model bounds are known; until then consumers show no estimate.
      * `[ ]`   **`maxOutputCostRate`**: highest `output_token_cost_rate` across `state.selectedModels` matched to `state.modelCatalog[].config` via `isAiModelExtendedConfig` (`@paynless/utils`). When `selectedModels` is `null`, `undefined`, or `[]`, or no selected model has a valid config, return `null`.
      * `[ ]`   **Contribution actuals** (post-project only): for a completed stage, sum every `DialecticContribution` on that session where `c.stage === stageSlug` and `c.iteration_number === iterationNumber`: `tokens_used_input × input_token_cost_rate + tokens_used_output × output_token_cost_rate`, rates from the contribution's `model_id` catalog entry (guard-required). If any included contribution has `tokens_used_input`/`tokens_used_output`/`model_id` null, or its model config fails the guard, return `null` for the whole estimate. An empty sum on a completed stage is `actualCost: 0` (valid).
      * `[ ]`   **Counts** (post-project): iterate template stages via `getSortedStagesFromTemplate(state.currentProcessTemplate)`; if template missing, run-key missing, or any template `stage.slug` lacks a finite non-negative integer in `stageExpectedCountsByRun[runKey]`, return `null`. (Pre-project): if `preProjectStageExpectedCounts` is `null` or empty, return `null`.
      * `[ ]`   Non-functional: module-private helpers only (`extractMaxOutputCostRate`, `sumStageActualCost`, `buildPostProjectCostCeilingInputs`); no new `DialecticStateValues` fields, no actions, no `costCeilingEstimate` / `recomputeCostCeiling`. `computeCostCeiling` remains arithmetic-only; this node owns rate extraction, contribution summation, and count assembly.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`  FE store selectors (`dialecticStore.selectors.ts`) — the derivation layer between hydrated counts / contributions / catalog rates and the pure `computeCostCeiling` utility.
      * `[ ]`  This node CREATES the two exported selectors and their private helpers. It does NOT add store state, actions, UI, or duplicate `computeCostCeiling` / `isAiModelExtendedConfig` logic.
      * `[ ]`  Out of scope: Group 5 consumers (`useStartContributionGeneration`, `GenerateContributionButton`, `SessionInfoCard`, `CreateDialecticProjectForm`); wallet balance (`selectActiveChatWalletInfo` stays in wallet store).

    * `[ ]`   `module`
      * `[ ]`  Bounded context: `@paynless/store` dialectic selectors (`dialecticStore.selectors.ts`).
      * `[ ]`  Inside: `selectCostCeiling`, `selectPreProjectCostCeiling`, and private helpers that read dialectic state and call `computeCostCeiling`.
      * `[ ]`  Outside: BE counts, hydration, pre-project fetch, arithmetic, auth tier, UI.

    * `[ ]`   `deps`
      * `[ ]`   `CostCeilingEstimate`, `CostCeilingStageInput`, `ComputeCostCeilingParams` — provider: `@paynless/types` (`dialectic.types.ts`, `computeCostCeiling` node); layer: types; direction: inward.
      * `[ ]`   `computeCostCeiling` — provider: `./computeCostCeiling.ts` (prior Group 3 node); layer: domain utility; direction: inward; relative import, never re-export.
      * `[ ]`   `isAiModelExtendedConfig` — provider: `@paynless/utils` (`dialectic.guard.ts`, OutputCapSlider node); layer: shared guard; direction: inward.
      * `[ ]`   `stageExpectedCountsByRun`, `preProjectStageExpectedCounts`, `maxOutputTokens`, `selectedModels`, `modelCatalog`, `currentProcessTemplate`, `currentProjectDetail` — provider: `DialecticStateValues` (prior Group 4 nodes + existing store).
      * `[ ]`   `selectSessionById`, `selectUnifiedProjectProgress`, `getSortedStagesFromTemplate` — same file; direction: inward (composition, no cycles).
      * `[ ]`   HARD dependency chain: `computeCostCeiling` node → `isAiModelExtendedConfig` node → `dialecticStore.ts` (state + pre-project counts) → `dialecticStore.documents` (populate `stageExpectedCountsByRun`). This node is last in Group 4.

    * `[ ]`   `context_slice`
      * `[ ]`  Post-project reads: `stageExpectedCountsByRun[runKey]`, session `iteration_count`, template stage slugs, `selectUnifiedProjectProgress(...).stageDetails[].stageStatus`, session `dialectic_contributions` filtered by stage/iteration, `modelCatalog` configs for selected + contribution models, `maxOutputTokens`.
      * `[ ]`  Pre-project reads: `preProjectStageExpectedCounts`, `maxOutputTokens`, `selectedModels`, `modelCatalog`.
      * `[ ]`  No wallet, no auth tier, no DB. No over-fetch.

    * `[ ]`   packages/store/src/`dialecticStore.selectors.ts`
      * `[ ]`   Add imports: `CostCeilingEstimate`, `CostCeilingStageInput`, `ComputeCostCeilingParams`, `AiModelExtendedConfig` from `@paynless/types`; `isAiModelExtendedConfig` from `@paynless/utils`; `computeCostCeiling` from `./computeCostCeiling`.
      * `[ ]`   `function extractMaxOutputCostRate(state: DialecticStateValues): number | null`: if `state.selectedModels == null` or `length === 0`, return `null`; loop each selected model id against `state.modelCatalog`; for each match where `isAiModelExtendedConfig(catalogEntry.config)`, track the max `config.output_token_cost_rate`; if no valid rate found, return `null`; else return the max. No default rate.
      * `[ ]`   `function lookupModelRates(modelId: string | null, catalog: AiProvidersRow[]): AiModelExtendedConfig | null`: find catalog row by id; return narrowed config or `null`.
      * `[ ]`   `function sumStageActualCost(session: DialecticSession, stageSlug: string, iterationNumber: number, catalog: AiProvidersRow[]): number | null`: filter `session.dialectic_contributions` where `c.stage === stageSlug && c.iteration_number === iterationNumber`; for each, require non-null `model_id`, `tokens_used_input`, `tokens_used_output`; resolve rates via `lookupModelRates`; if any contribution fails, return `null`; sum `input × input_rate + output × output_rate`; return the sum (may be `0`).
      * `[ ]`   `function buildPostProjectCostCeilingInputs(state: DialecticStateValues, sessionId: string): CostCeilingStageInput[] | null`: resolve `session` via `selectSessionById(state, sessionId)` — if missing or `iteration_count` not a number, return `null`; `runKey = `${sessionId}:${iterationNumber}`; `countsBySlug = state.stageExpectedCountsByRun[runKey]` — if missing, return `null`; `stages = getSortedStagesFromTemplate(state.currentProcessTemplate)` — if empty, return `null`; `unified = selectUnifiedProjectProgress(state, sessionId)` (may throw if session/stage invalid — callers must pass a valid sessionId in production; tests seed valid session); build `CostCeilingStageInput[]` in template order: for each `stage.slug`, if `countsBySlug[stage.slug]` is not a finite non-negative integer, return `null`; if unified `stageDetails` entry has `stageStatus === 'completed'`, set `actualCost = sumStageActualCost(...)` (propagate `null`); else `actualCost: null`; push `{ stageSlug, expectedCount: countsBySlug[stage.slug], actualCost }`.
      * `[ ]`   `export function selectCostCeiling(state: DialecticStateValues, sessionId: string): CostCeilingEstimate | null`: `const maxOutputTokens = state.maxOutputTokens`; if not finite number, return `null`; `const maxOutputCostRate = extractMaxOutputCostRate(state)`; if `null`, return `null`; `const stages = buildPostProjectCostCeilingInputs(state, sessionId)`; if `null`, return `null`; `return computeCostCeiling({ stages, maxOutputTokens, maxOutputCostRate })`.
      * `[ ]`   `export function selectPreProjectCostCeiling(state: DialecticStateValues): CostCeilingEstimate | null`: same cap/rate guards; if `state.preProjectStageExpectedCounts == null` or `length === 0`, return `null`; map each `StageExpectedCount` to `{ stageSlug, expectedCount, actualCost: null }` — if any `expectedCount` is not a finite non-negative integer, return `null`; `return computeCostCeiling({ stages, maxOutputTokens, maxOutputCostRate })`.
      * `[ ]`   Place exports after `selectUnifiedProjectProgress` (≈line 814) or at the end of the progress section; helpers are `function` declarations above the exports (same pattern as `getSortedStagesFromTemplate`). No `createSelector` memoization required (cheap pure read; matches `selectUnifiedProjectProgress` signature style).

    * `[ ]`   packages/store/src/`dialecticStore.selectors.progress.test.ts`
      * `[ ]`   Append `describe('selectCostCeiling')` and `describe('selectPreProjectCostCeiling')` at the end; import the new selectors and `mockAiProvidersRow` / `mockAiModelConfig` from `../../../apps/web/src/mocks/dialecticStore.mock`.
      * `[ ]`   `selectCostCeiling` — returns estimate: seed `maxOutputTokens`, `selectedModels`, `modelCatalog` (full config via `mockAiProvidersRow({ config: { ...mockAiModelConfig(), output_token_cost_rate: 3 } })`), `stageExpectedCountsByRun[runKey]` with counts for every template stage, valid session/project/template (reuse the `selectUnifiedProjectProgress` fixture patterns in this file); assert `stageCeilings[slug] === expectedCount × maxOutputTokens × rate` and `projectCeiling` matches `computeCostCeiling` for all-pending stages.
      * `[ ]`   `selectCostCeiling` — mixed actual + estimate: one stage `stageStatus: 'completed'` with contributions (valid tokens + rates) and a second pending stage; assert `projectCeiling` uses actual for completed and estimate for pending (hand-check against `computeCostCeiling`).
      * `[ ]`   `selectCostCeiling` — returns `null` when: `maxOutputTokens` is `null`; `selectedModels` is `[]`; no valid catalog config; `stageExpectedCountsByRun` missing run-key; a template stage slug missing from the counts map; a completed-stage contribution with `tokens_used_input: null`; `expectedCount` invalid on counts map. One behavior per test.
      * `[ ]`   `selectPreProjectCostCeiling` — returns estimate: `preProjectStageExpectedCounts: [{ stageSlug: 'thesis', expectedCount: 4 }, ...]`, cap + rate set; all `actualCost` paths null → `projectCeiling` equals sum of stage estimates.
      * `[ ]`   `selectPreProjectCostCeiling` — returns `null` when: `preProjectStageExpectedCounts` is `null`; cap or rate missing. New cases appended; state built from `initialDialecticStateValues` + production types.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: store selectors.
      * `[ ]`   Deps: inward (`@paynless/types`, `@paynless/utils`, `./computeCostCeiling`, existing selectors/state).
      * `[ ]`   Provides: outward (`CostCeilingEstimate | null` for Group 5 NSF, SessionInfoCard, Create form).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   No `costCeilingEstimate` state and no `recomputeCostCeiling` action added. Observable: grep `DialecticStateValues` / `DialecticActions` unchanged for those symbols.
      * `[ ]`   `selectCostCeiling` returns `CostCeilingEstimate` only when counts, cap, rate, and (for completed stages) contribution actuals are all valid; otherwise `null`. Observable: null-path unit tests.
      * `[ ]`   `selectPreProjectCostCeiling` returns `CostCeilingEstimate` only when `preProjectStageExpectedCounts`, cap, and rate are valid; otherwise `null`. Observable: unit tests.
      * `[ ]`   Both selectors delegate arithmetic to `computeCostCeiling` (no duplicated multiply/sum). Observable: review + spot-check against hand-computed `computeCostCeiling` outputs in tests.
      * `[ ]`   `maxOutputCostRate` uses `isAiModelExtendedConfig` on catalog configs only; no string-indexed config reads. Observable: review.
      * `[ ]`   Existing selector tests remain green. Observable: full `dialecticStore.selectors.progress.test.ts` (and sibling selector test files) pass.

  * `[ ]`   apps/web/src/hooks/useStartContributionGeneration **Replace `minimum_balance` NSF gate with dynamic `stage_ceiling` from `selectCostCeiling`**

    * `[ ]`   `objective`
      * `[ ]`   The session-page preventive NSF gate still compares `viewingStage.minimum_balance` (a static DB column) to wallet balance in `useStartContributionGeneration.ts` (lines 133-142, 170, 173-176, 240-241). That hardcoded threshold does not reflect the user's selected models, output-cap slider, or per-stage job counts, and it diverges from the ticket's ceiling math (lines 448-456).
      * `[ ]`   Functional goal: derive the viewing-stage ceiling from `selectCostCeiling(state, sessionId)` (`dialecticStore.selectors` node) — `stageCeilings[viewingStage.slug]` — and use it everywhere the hook previously used `minimum_balance` for disable logic, balance callout visibility, and paused-NSF resume eligibility.
      * `[ ]`   Functional goal: when `selectCostCeiling` returns `null` (counts/cap/rate/actuals not yet valid), do **not** apply a preventive ceiling gate — `balanceMeetsThreshold` is `true`, `showBalanceCallout` is `false`, `stageCeiling`/`projectCeiling`/`stageBalanceShortfall` are `null`. The Generate button remains subject to the other existing guards (models, wallet ready, stage ready, viewing-ahead). No fallback to `minimum_balance`.
      * `[ ]`   Functional goal: when `stageCeiling` is a finite number and `Number(walletBalance) < stageCeiling`, set `balanceMeetsThreshold` to `false`, include `!balanceMeetsThreshold` in `isDisabled`, set `showBalanceCallout` to `true`, and expose `stageBalanceShortfall = stageCeiling - walletBalance` (finite, positive). When balance meets or exceeds the ceiling, `balanceMeetsThreshold` is `true`, `showBalanceCallout` is `false`, and `showStageCostEstimate` is `true` so the button consumer can render "Estimated cost for this stage: ~{stageCeiling} tokens."
      * `[ ]`   Functional goal: expose `projectCeiling` from the same `selectCostCeiling` result (`projectCeiling` field) for the next `GenerateContributionButton` node (project-level notice); this hook does not render UI.
      * `[ ]`   Functional goal: in `startContributionGeneration` (callback, lines 232-243), recompute resume eligibility using `selectCostCeiling(state, activeContextSessionId)` and the viewing stage slug — **not** `viewingStage.minimum_balance`.
      * `[ ]`   Non-functional: remove `stageThreshold` from `UseStartContributionGenerationReturn` (consumers must migrate in the next node). Keep `balanceMeetsThreshold` and `showBalanceCallout` names so mock factories need minimal renames, but their semantics are now ceiling-based. No changes to `GenerateContributionButton.tsx`, `SessionInfoCard.tsx`, or `CreateDialecticProjectForm.tsx` in this node.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   Application / FE hook — bridges dialectic store selectors, wallet balance, and contribution-generation actions for the session Generate/Continue control.
      * `[ ]`   This node replaces the threshold source and extends the hook return contract. It does NOT edit button components, subscription deep links, or store selector implementation.
      * `[ ]`   Out of scope: rendering NSF/cost copy (`GenerateContributionButton` next node); project/stage cost displays on `SessionInfoCard` / Create form; `selectPreProjectCostCeiling`; BE `paused_nsf` handling (unchanged).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `apps/web/src/hooks` — `useStartContributionGeneration`.
      * `[ ]`   Inside this boundary: reading `selectCostCeiling`, deriving stage/project ceiling fields, wallet comparison, disable/callout/resume flags, and the callback's ceiling-aware resume check.
      * `[ ]`   Outside this boundary: ceiling arithmetic (`computeCostCeiling`), count hydration, API transport, and UI markup.

    * `[ ]`   `deps`
      * `[ ]`   `selectCostCeiling` — provider: `@paynless/store` (`dialecticStore.selectors.ts`, prior node); layer: store selector; direction: inward; purpose: post-project `CostCeilingEstimate | null` for the active session.
      * `[ ]`   `CostCeilingEstimate` — provider: `@paynless/types` (`dialectic.types.ts`, `computeCostCeiling` node); layer: types; direction: inward; purpose: shape of `stageCeilings` / `projectCeiling`.
      * `[ ]`   `selectViewingStage`, `selectSessionById`, `selectUnifiedProjectProgress`, `selectIsStageReadyForSessionIteration`, `selectSelectedModels`, `selectActiveChatWalletInfo`, `selectSortedStages` — existing hook deps, unchanged.
      * `[ ]`   `useDialecticStore`, `useWalletStore`, `useAiStore` — existing stores.
      * `[ ]`   HARD dependency: `dialecticStore.selectors` node (`selectCostCeiling` exported from `@paynless/store` via `dialecticStore.selectors.ts` re-export). Precedes `GenerateContributionButton` node.
      * `[ ]`   No reverse dependencies. No lateral layer violations.

    * `[ ]`   `context_slice`
      * `[ ]`   From dialectic store (via `selectCostCeiling`): `stageCeilings[viewingStage.slug]`, `projectCeiling` for the active `activeContextSessionId` only.
      * `[ ]`   From wallet store: `activeWalletInfo.balance` (string) converted with `Number()` for comparison.
      * `[ ]`   No reads of `viewingStage.minimum_balance` after this node. No auth-tier cap invention when `maxOutputTokens` is null (selector returns `null`; hook does not gate).

    * `[ ]`   packages/types/src/`dialectic.types.ts`
      * `[ ]`   Update `UseStartContributionGenerationReturn` (lines 1121-1142): remove `stageThreshold: number | undefined`.
      * `[ ]`   Add `stageCeiling: number | null` — viewing-stage preventive ceiling from `selectCostCeiling`; `null` when estimate unavailable or slug missing from `stageCeilings`.
      * `[ ]`   Add `projectCeiling: number | null` — full-project ceiling from the same estimate; `null` when estimate unavailable.
      * `[ ]`   Add `stageBalanceShortfall: number | null` — `stageCeiling - walletBalance` when balance is below ceiling; `null` when no shortfall or no ceiling.
      * `[ ]`   Add `showStageCostEstimate: boolean` — `true` when `stageCeiling` is a finite number and balance meets the ceiling (enough tokens for the preventive estimate).
      * `[ ]`   Retain `balanceMeetsThreshold: boolean` and `showBalanceCallout: boolean` with ceiling semantics documented above. Types only (exempt from RED/GREEN).

    * `[ ]`   hooks/`useStartContributionGeneration.test.ts`
      * `[ ]`   Extend the existing `vi.mock('@paynless/store', ...)` block: import `selectCostCeiling` from the actual `@paynless/store` module and expose `selectCostCeiling: vi.fn<[DialecticStateValues, string], CostCeilingEstimate | null>()` on the mock return (default implementation delegates to `actualPaynlessStore.selectCostCeiling` once the prior node lands; until then the mock implementation is the test-controlled surface).
      * `[ ]`   Add `const defaultCostCeiling: CostCeilingEstimate = { stageCeilings: { thesis: mockThesisStage.minimum_balance }, projectCeiling: mockThesisStage.minimum_balance };` (or an explicit ceiling value such as `120000` decoupled from `minimum_balance`) and `beforeEach` default: `vi.mocked(selectCostCeiling).mockImplementation((_state, sessionId) => sessionId === 'sess-1' ? defaultCostCeiling : null);`.
      * `[ ]`   Update the test `derived state values correctly reflect store state`: assert `result.current.stageCeiling` equals the mocked ceiling for `thesis` (not `stageThreshold === minimum_balance`); assert `result.current.projectCeiling` matches the mock; remove any `stageThreshold` assertion.
      * `[ ]`   Add test: when `selectCostCeiling` returns `null`, `stageCeiling`/`projectCeiling`/`stageBalanceShortfall` are `null`, `balanceMeetsThreshold` is `true`, `showBalanceCallout` is `false`, `showStageCostEstimate` is `false`, and `isDisabled` is `false` when all other guards pass.
      * `[ ]`   Add test: when `stageCeilings.thesis` is `150000` and wallet balance is `100000`, `balanceMeetsThreshold` is `false`, `isDisabled` is `true`, `showBalanceCallout` is `true`, `stageBalanceShortfall` is `50000`, `showStageCostEstimate` is `false`.
      * `[ ]`   Add test: when `stageCeilings.thesis` is `80000` and wallet balance is `100000`, `balanceMeetsThreshold` is `true`, `showBalanceCallout` is `false`, `showStageCostEstimate` is `true`, `stageBalanceShortfall` is `null`, `isDisabled` is `false` (other guards passing).
      * `[ ]`   Add test: `startContributionGeneration` resume path — `hasPausedNsfJobs` with balance below `minimum_balance` but **above** `stageCeiling` calls `resumePausedNsfJobs` (ceiling gate satisfied); mirror with balance below `stageCeiling` verifying resume is **not** taken when `balanceMeetsThreshold` is false (generation path or early behavior per existing toast rules).
      * `[ ]`   Update `isDisabled is true when any guard fails` case that relied on low balance vs `minimum_balance`: drive low balance vs mocked `stageCeiling` instead.
      * `[ ]`   Preserve all unrelated tests (payload construction, pause, viewing-ahead, stale-closure reads, `maxOutputTokens` payload). New cases appended at the end.

    * `[ ]`   hooks/`useStartContributionGeneration.ts`
      * `[ ]`   Add `selectCostCeiling` to the import from `@paynless/store` (line 3-13).
      * `[ ]`   Add `CostCeilingEstimate` to the import from `@paynless/types` (line 14-19).
      * `[ ]`   Remove the `stageThreshold` `useMemo` (lines 133-136).
      * `[ ]`   Add `costCeilingEstimate` subscription: `useDialecticStore((state) => { const sid = state.activeContextSessionId; if (sid === null) return null; return selectCostCeiling(state, sid); })`.
      * `[ ]`   Add `stageCeiling: number | null` `useMemo`: if `viewingStage === null` or `costCeilingEstimate === null`, return `null`; read `costCeilingEstimate.stageCeilings[viewingStage.slug]`; if not a finite non-negative number, return `null`; else return the number.
      * `[ ]`   Add `projectCeiling: number | null` `useMemo`: if `costCeilingEstimate === null`, return `null`; if `projectCeiling` on the estimate is not a finite non-negative number, return `null`; else return it.
      * `[ ]`   Replace `balanceMeetsThreshold` `useMemo` (lines 138-142): if `stageCeiling === null`, return `true`; else `Number(activeWalletInfo.balance)` compared with `>= stageCeiling` (reject `NaN` as not meeting).
      * `[ ]`   Add `stageBalanceShortfall: number | null` `useMemo`: when `stageCeiling` and balance are valid numbers and balance `< stageCeiling`, return `stageCeiling - balance`; else `null`.
      * `[ ]`   Add `showStageCostEstimate: boolean` `useMemo`: `stageCeiling !== null && balanceMeetsThreshold`.
      * `[ ]`   Update `showBalanceCallout` (lines 173-176): `viewingStage != null && stageCeiling !== null && !balanceMeetsThreshold` (remove `stageThreshold` checks).
      * `[ ]`   In `startContributionGeneration` callback (lines 239-243): replace `balanceNum >= viewingStage.minimum_balance` with the same ceiling rule — read `selectCostCeiling(state, activeContextSessionId)`, resolve viewing-stage ceiling for `viewingStage.slug`, if finite then require `balanceNum >= ceiling`, else treat as meeting threshold for resume (`true`).
      * `[ ]`   Update the return object (lines 309-330): remove `stageThreshold`; add `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `showStageCostEstimate`.
      * `[ ]`   No other behavioral changes to pause/generate payloads, viewing-ahead, or toasts.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: application (FE hook).
      * `[ ]`   Deps: inward (`@paynless/store` selectors/state, `@paynless/types`, wallet/ai stores).
      * `[ ]`   Provides: outward (ceiling-aware flags for `GenerateContributionButton` and any other hook consumers).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   `viewingStage.minimum_balance` is not read anywhere in `useStartContributionGeneration.ts`. Observable: grep the file for `minimum_balance` returns no matches.
      * `[ ]`   When `selectCostCeiling` returns a valid estimate and wallet balance is below `stageCeilings[viewingSlug]`, `isDisabled` is `true` and `showBalanceCallout` is `true` with `stageBalanceShortfall` equal to the difference. Observable: unit test.
      * `[ ]`   When balance meets or exceeds `stageCeiling`, `balanceMeetsThreshold` is `true`, `showStageCostEstimate` is `true`, and `showBalanceCallout` is `false`. Observable: unit test.
      * `[ ]`   When `selectCostCeiling` returns `null`, no preventive ceiling disable or callout is applied. Observable: unit test.
      * `[ ]`   Paused-NSF resume in `startContributionGeneration` uses the dynamic ceiling, not `minimum_balance`. Observable: unit test on resume branch.
      * `[ ]`   `UseStartContributionGenerationReturn` no longer exposes `stageThreshold`; exposes `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `showStageCostEstimate`. Observable: type definition + tests compile.

  * `[ ]`   apps/web/src/components/dialectic/GenerateContributionButton **Ceiling-based NSF CTA, stage cost estimate, and project balance notice**

    * `[ ]`   `objective`
      * `[ ]`   `GenerateContributionButton.tsx` still destructures `stageThreshold` from the hook (line 34), returns `null` when `stageThreshold` is falsy (lines 101-102), and renders the balance callout as "Minimum {formattedThreshold} token balance for {displayName}" (lines 135-146). That UI is tied to the removed `minimum_balance` contract and blocks the control whenever no static threshold exists, even when the hook allows rendering with a null ceiling estimate.
      * `[ ]`   Functional goal (NSF callout): when `showBalanceCallout` is `true` and `stageBalanceShortfall` is a finite positive number, render "Insufficient tokens. Top up {formattedShortfall} to continue." with a `Link` to `/subscription?tab=top-up` (top-up intent per ticket line 451; full cart prefill is deferred to the Subscription deep-links ticket). Use `stageBalanceShortfall` from the hook — do not recompute shortfall in the component.
      * `[ ]`   Functional goal (stage estimate): when `showStageCostEstimate` is `true` and `stageCeiling` is a finite number, render a non-blocking line: "Estimated cost for this stage: ~{formattedStageCeiling} tokens." (`data-testid="generate-button-stage-cost-estimate"`).
      * `[ ]`   Functional goal (project notice): when `projectCeiling` from the hook is a finite number and wallet balance (read in-component via `useWalletStore` + `selectActiveChatWalletInfo` + `useAiStore().newChatContext`, same pattern as the hook) is below `projectCeiling`, render a secondary, non-blocking notice with shortfall `projectCeiling - balance` and a top-up `Link` to `/subscription?tab=top-up` (`data-testid="generate-button-project-balance-callout"`). This notice does not disable the button. It may show at the same time as the stage NSF callout or the stage estimate.
      * `[ ]`   Functional goal (visibility): remove the `stageThreshold` early return. Render the button host when `viewingStage` and `activeSession` from the hook are non-null (same minimum the button already needs for labels and `StageDAGProgressDialog`). When `stageCeiling` is `null`, the hook already avoids preventive disable — the component still renders.
      * `[ ]`   Non-functional: keep `getButtonText` priority and "Insufficient Balance" label when `!balanceMeetsThreshold`; keep pause/resume/DAG dialog behavior unchanged. No `selectCostCeiling` call in this component (hook owns derivation). No edits to `useStartContributionGeneration.ts` (prior node).
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   UI component — session-page Generate/Continue control and its cost/NSF messaging.
      * `[ ]`   This node consumes the extended hook return contract and adds wallet read only for the project-level notice (project ceiling vs balance is not on the hook). It does NOT change store selectors, hook logic, or `SessionInfoCard` / Create form.
      * `[ ]`   Out of scope: subscription cart prefill helpers; `SessionInfoCard` project/stage display (next node); Autostart gate (Create form node).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `apps/web/src/components/dialectic` — `GenerateContributionButton`.
      * `[ ]`   Inside: NSF callout copy, stage estimate line, project warning line, early-return rule, token number formatting.
      * `[ ]`   Outside: ceiling arithmetic, hook disable logic, wallet store implementation.

    * `[ ]`   `deps`
      * `[ ]`   `useStartContributionGeneration` — provider: `@/hooks/useStartContributionGeneration`; layer: application hook; direction: inward; purpose: `showBalanceCallout`, `stageBalanceShortfall`, `stageCeiling`, `projectCeiling`, `showStageCostEstimate`, `balanceMeetsThreshold`, `viewingStage`, `activeSession`, and all existing button flags.
      * `[ ]`   `useWalletStore`, `selectActiveChatWalletInfo`, `useAiStore` — provider: `@paynless/store`; layer: store; direction: inward; purpose: wallet balance for project-level shortfall only.
      * `[ ]`   `Link` — provider: `react-router-dom`; existing.
      * `[ ]`   HARD dependency: `useStartContributionGeneration` node (hook return shape). Precedes `SessionInfoCard` node.
      * `[ ]`   No reverse dependencies.

    * `[ ]`   `context_slice`
      * `[ ]`   From hook: `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `showStageCostEstimate`, `showBalanceCallout`, `viewingStage`, `activeSession`.
      * `[ ]`   From wallet store: `balance` string → `Number()` for project notice comparison only.
      * `[ ]`   No reads of `viewingStage.minimum_balance` or `stageThreshold`.

    * `[ ]`   dialectic/`GenerateContributionButton.nsf.test.tsx`
      * `[ ]`   Update `getDefaultHookReturn`: remove `stageThreshold`; add `stageCeiling: 200000`, `projectCeiling: 400000`, `stageBalanceShortfall: null`, `showStageCostEstimate: true`, `isViewingAheadOfCurrentStage: false`, `viewingAheadReason: null` (defaults aligned to production `UseStartContributionGenerationReturn` after hook node).
      * `[ ]`   Replace callout assertion `Minimum.*200,000.*token balance` with `Insufficient tokens` and `Top up` and formatted shortfall (e.g. mock `stageBalanceShortfall: 50000` → "50,000" in copy); assert `href` is `/subscription?tab=top-up`.
      * `[ ]`   Update paused-NSF callout test similarly (shortfall-driven copy, same link).
      * `[ ]`   Add test: when `showStageCostEstimate` is `true` and `stageCeiling` is `120000`, `generate-button-stage-cost-estimate` shows `~120,000` (or locale-formatted equivalent) and "Estimated cost for this stage".
      * `[ ]`   Add test: when `projectCeiling` is `500000`, hook supplies `stageCeiling`/`showBalanceCallout` satisfied, and mocked wallet `balance` is `300000`, `generate-button-project-balance-callout` is present with top-up link and shortfall `200,000`; button remains enabled when hook says so.
      * `[ ]`   Add test: when `projectCeiling` is `null` or wallet meets `projectCeiling`, project callout absent.
      * `[ ]`   Preserve existing NSF tests for disabled/enabled Generate/Resume, resume/generate click paths, pause priority. New cases appended at the end.

    * `[ ]`   dialectic/`GenerateContributionButton.test.tsx`
      * `[ ]`   Update `getDefaultHookReturn` the same way (remove `stageThreshold`, add new hook fields).
      * `[ ]`   Replace `component returns null when stageThreshold is falsy` and `handles currentProjectDetail being null gracefully by being disabled` cases that set `stageThreshold: undefined`: instead assert the component **renders** the button when `stageCeiling: null`, `viewingStage` and `activeSession` present (estimate unavailable does not hide the control).
      * `[ ]`   Add test: `stageThreshold: undefined` removed — use `stageCeiling: null` with `showBalanceCallout: false` and button visible.
      * `[ ]`   Update `balance callout renders when showBalanceCallout is true` to assert new NSF copy uses `stageBalanceShortfall` from hook mock (e.g. `stageBalanceShortfall: 25000`, expect "Top up" and "25,000" in callout).
      * `[ ]`   Preserve all unrelated tests (pause, DAG dialog, chat context, viewing-ahead). New/updated cases appended at the end.

    * `[ ]`   dialectic/`GenerateContributionButton.tsx`
      * `[ ]`   Destructure from hook: remove `stageThreshold`; add `stageCeiling`, `projectCeiling`, `stageBalanceShortfall`, `showStageCostEstimate`.
      * `[ ]`   Add imports: `useWalletStore`, `selectActiveChatWalletInfo` from `@paynless/store`; `useAiStore` from `@paynless/store` (if not already present).
      * `[ ]`   Add `const newChatContext = useAiStore((state) => state.newChatContext);` and `const activeWalletInfo = useWalletStore((state) => selectActiveChatWalletInfo(state, newChatContext));`.
      * `[ ]`   Add `formatTokenCount = (n: number): string => new Intl.NumberFormat("en-US").format(n)` (reuse for stage ceiling, shortfall, project ceiling).
      * `[ ]`   Replace early return (lines 101-102): `if (viewingStage == null || activeSession == null) return null;` — remove `formattedThreshold` derived from `stageThreshold`.
      * `[ ]`   Compute project notice flags after wallet read: `const walletBalanceNum = Number(activeWalletInfo.balance);` — if `projectCeiling` is finite and `walletBalanceNum` is finite and `walletBalanceNum < projectCeiling`, set `showProjectBalanceCallout` true and `projectBalanceShortfall = projectCeiling - walletBalanceNum`; else no project callout. No default/fallback when `projectCeiling` is `null`.
      * `[ ]`   Replace balance callout block (lines 135-146): condition `showBalanceCallout && viewingStage && stageBalanceShortfall !== null`; link `to="/subscription?tab=top-up"`; text `Insufficient tokens. Top up {formatTokenCount(stageBalanceShortfall)} to continue.`
      * `[ ]`   After balance callout (or before project notice), add stage estimate block: `showStageCostEstimate && stageCeiling !== null` → `data-testid="generate-button-stage-cost-estimate"` with `Estimated cost for this stage: ~{formatTokenCount(stageCeiling)} tokens.`
      * `[ ]`   Add project notice block (non-blocking, below stage estimate/callout): when `showProjectBalanceCallout` and `projectBalanceShortfall` computed — `data-testid="generate-button-project-balance-callout"`, copy includes formatted `projectCeiling` and shortfall, `Link` to `/subscription?tab=top-up`. Wording concise (e.g. project may need ~X tokens; top up Y for the full project).
      * `[ ]`   No other behavioral changes.

    * `[ ]`   dialectic/`GenerateContributionButton.integration.test.tsx`
      * `[ ]`   If this file uses the real hook (not mocked), seed store state so `selectCostCeiling` can return a valid estimate once Group 4 is implemented (`maxOutputTokens`, `selectedModels`, `modelCatalog`, `stageExpectedCountsByRun`) — or assert only that the button renders without `stageThreshold` gate when wallet and models are seeded.
      * `[ ]`   Append at most one integration assertion: with sufficient mocked wallet balance and a hydrated ceiling, `generate-button-stage-cost-estimate` appears when the real hook sets `showStageCostEstimate`. Skip if the integration harness cannot seed counts without scope creep.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: UI component.
      * `[ ]`   Deps: inward (hook, wallet/ai stores, router `Link`).
      * `[ ]`   Provides: outward (session-page NSF/top-up UX).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   No `stageThreshold` or `minimum_balance` in `GenerateContributionButton.tsx`. Observable: grep.
      * `[ ]`   NSF callout shows shortfall-based copy and links to `/subscription?tab=top-up`. Observable: `GenerateContributionButton.nsf.test.tsx`.
      * `[ ]`   Stage estimate line renders when `showStageCostEstimate` and `stageCeiling` set. Observable: unit test.
      * `[ ]`   Project notice renders when `projectCeiling > wallet` and does not disable the button. Observable: unit test.
      * `[ ]`   Component renders when `viewingStage`/`activeSession` exist even if `stageCeiling` is `null`. Observable: updated unit tests (no null render on missing estimate).
      * `[ ]`   Existing Generate/Resume/pause/DAG tests remain green after `getDefaultHookReturn` migration.

  * `[ ]`   apps/web/src/components/dialectic/SessionInfoCard **Project and viewing-stage cost estimates in session header**

    * `[ ]`   `objective`
      * `[ ]`   `SessionInfoCard.tsx` (lines 40-215) renders session chrome (back, title, model popover, wallet, progress bar, seed prompt) but shows no token-cost context. Users on the session page cannot see the dynamic `project_ceiling` (actual completed stages + estimate for remaining) or the viewing-stage `stage_ceiling` without opening Generate or inferring from NSF state.
      * `[ ]`   Functional goal (stage estimate): when `selectCostCeiling(state, session.id)` returns a non-null estimate and `selectViewingStage` resolves a stage whose `slug` has a finite `stageCeilings[slug]`, render a non-blocking line: "Estimated cost for this stage: ~{formattedStageCeiling} tokens." (`data-testid="session-info-stage-cost-estimate"`). Show whenever the ceiling is available — not gated on wallet balance (informational; the hook/button own the preventive NSF gate).
      * `[ ]`   Functional goal (project estimate): when the same estimate has a finite `projectCeiling`, render "Estimated project cost: ~{formattedProjectCeiling} tokens." (`data-testid="session-info-project-cost-estimate"`). Copy reflects ticket math: `projectCeiling` already sums actuals for completed stages and estimates for remaining (no separate "actual vs estimate" breakdown in this node).
      * `[ ]`   Functional goal (project balance notice): when `projectCeiling` is finite and wallet balance (`useWalletStore` + `selectActiveChatWalletInfo` + `useAiStore().newChatContext`, same pattern as `GenerateContributionButton`) is below `projectCeiling`, render a secondary, non-blocking notice with shortfall `projectCeiling - balance` and a `Link` to `/subscription?tab=top-up` (`data-testid="session-info-project-balance-warning"`). Does not disable any control. May appear alongside stage estimate lines.
      * `[ ]`   Functional goal (null estimate): when `selectCostCeiling` returns `null`, render none of the three cost elements (no fabricated zeros, no fallback to `minimum_balance`).
      * `[ ]`   Non-functional: preserve existing toolbar, seed prompt, progress bar, and error alert behavior. No `useStartContributionGeneration` import (header is independent of Generate button). No subscription cart prefill (deferred ticket). No edits to `GenerateContributionButton` or the hook (prior nodes).
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   UI component — session-page header cost transparency.
      * `[ ]`   This node adds read-only cost display beside wallet/progress. It does NOT implement NSF disable, Autostart gating, or store/selector logic.
      * `[ ]`   Out of scope: `CreateDialecticProjectForm` pre-project preview (next node); hook/button NSF copy changes (prior nodes).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `apps/web/src/components/dialectic` — `SessionInfoCard`.
      * `[ ]`   Inside: `selectCostCeiling` / `selectViewingStage` subscriptions, token formatting, three cost UI blocks, placement under row 2.
      * `[ ]`   Outside: ceiling arithmetic, counts hydration, wallet store implementation.

    * `[ ]`   `deps`
      * `[ ]`   `selectCostCeiling`, `selectViewingStage` — provider: `@paynless/store` (`dialecticStore.selectors` node); layer: store selectors; direction: inward; purpose: `CostCeilingEstimate | null` and viewing-stage slug object.
      * `[ ]`   `CostCeilingEstimate` — provider: `@paynless/types` (`dialectic.types.ts`, `computeCostCeiling` node); layer: types; direction: inward; import from original source only.
      * `[ ]`   `useWalletStore`, `selectActiveChatWalletInfo`, `useAiStore` — provider: `@paynless/store`; layer: store; direction: inward; purpose: wallet balance for project shortfall notice only.
      * `[ ]`   `Link` — provider: `react-router-dom`; existing `useNavigate` import site.
      * `[ ]`   HARD dependency: `dialecticStore.selectors` node (`selectCostCeiling` export). Soft ordering: after `GenerateContributionButton` node is fine; this component does not consume the hook.
      * `[ ]`   No reverse dependencies.

    * `[ ]`   `context_slice`
      * `[ ]`   `session` from `state.activeSessionDetail` (already line 44-46) supplies `session.id` for `selectCostCeiling(state, session.id)`.
      * `[ ]`   `viewingStage` from `selectViewingStage(state)`; `stageCeiling` from `costCeilingEstimate.stageCeilings[viewingStage.slug]` when both non-null and value is finite non-negative.
      * `[ ]`   `projectCeiling` from `costCeilingEstimate.projectCeiling` when estimate non-null and finite.
      * `[ ]`   No reads of `minimum_balance`, `stageThreshold`, or `useStartContributionGeneration`.

    * `[ ]`   dialectic/`SessionInfoCard.test.tsx`
      * `[ ]`   Extend `vi.hoisted`: `selectCostCeilingMock = vi.fn<[DialecticStateValues, string], CostCeilingEstimate | null>()` defaulting to `null`.
      * `[ ]`   Extend `vi.mock('@paynless/store', ...)`: import `selectCostCeiling`, `selectViewingStage` from actual `@paynless/store`; expose `selectCostCeiling: selectCostCeilingMock` and `selectViewingStage: dialecticMockModule.selectViewingStage` (or delegate to actual once selectors exist). Import `CostCeilingEstimate` from `@paynless/types`.
      * `[ ]`   In `setupMockStore` defaults for cost tests: set `viewingStageSlug: mockStageSlug`, `currentProjectDetail: mockProjectWithStages` (stages array present), `selectedModels` non-empty if required by selector tests in sibling nodes — mirror minimal fields other Group-4 tests use when mocking ceiling.
      * `[ ]`   Append `describe('cost ceiling display (SessionInfoCard)')` at end of file with `beforeEach` resetting `selectCostCeilingMock` to `null`.
      * `[ ]`   Test: when `selectCostCeilingMock` returns `{ stageCeilings: { thesis: 120000 }, projectCeiling: 350000 }`, viewing stage `thesis`, `session-info-stage-cost-estimate` shows `~120,000` (locale-formatted) and "Estimated cost for this stage"; `session-info-project-cost-estimate` shows `~350,000` and "Estimated project cost".
      * `[ ]`   Test: when mock returns `null`, all three `session-info-*` cost testids absent; existing toolbar/seed-prompt tests unchanged.
      * `[ ]`   Test: when `projectCeiling` is `400000`, stage ceiling present, and `initializeMockWalletStore` sets balance `250000`, `session-info-project-balance-warning` present with top-up `Link` `href` `/subscription?tab=top-up` and shortfall `150,000` in copy; stage/project estimate testids still present.
      * `[ ]`   Test: when wallet balance meets or exceeds `projectCeiling`, `session-info-project-balance-warning` absent; estimates still shown when mock supplies ceilings.
      * `[ ]`   Test: when `viewingStageSlug` does not match a key in `stageCeilings` (mock returns estimate without `thesis` key), `session-info-stage-cost-estimate` absent; `session-info-project-cost-estimate` still shown if `projectCeiling` finite.
      * `[ ]`   Preserve all existing tests (seed prompt, progress bar, export dropdown, 2-row toolbar). New cases appended only.

    * `[ ]`   dialectic/`SessionInfoCard.tsx`
      * `[ ]`   Add imports: `selectCostCeiling`, `selectViewingStage`, `useWalletStore`, `selectActiveChatWalletInfo`, `useAiStore` from `@paynless/store`; `CostCeilingEstimate` from `@paynless/types`; `Link` from `react-router-dom`.
      * `[ ]`   After `session` is known (inside component, before skeleton early return is fine for subscriptions — use `session?.id` guard in selector): `const costCeilingEstimate = useDialecticStore(useShallow((state) => { const sid = state.activeSessionDetail?.id; if (sid === undefined) return null; return selectCostCeiling(state, sid); }));` — typed `CostCeilingEstimate | null`.
      * `[ ]`   `const viewingStage = useDialecticStore(selectViewingStage);`
      * `[ ]`   `const newChatContext = useAiStore((state) => state.newChatContext);` and `const activeWalletInfo = useWalletStore((state) => selectActiveChatWalletInfo(state, newChatContext));`
      * `[ ]`   `const formatTokenCount = (n: number): string => new Intl.NumberFormat("en-US").format(n);` (module-level `const` or inner — match `GenerateContributionButton` node).
      * `[ ]`   Derive `stageCeiling: number | null`: if `costCeilingEstimate === null` or `viewingStage === null`, `null`; else read `costCeilingEstimate.stageCeilings[viewingStage.slug]`; if not finite non-negative number, `null`.
      * `[ ]`   Derive `projectCeiling: number | null`: if `costCeilingEstimate === null`, `null`; else if `projectCeiling` on estimate not finite non-negative, `null`; else return it.
      * `[ ]`   Derive project warning: `walletBalanceNum = Number(activeWalletInfo.balance)`; when `projectCeiling` and `walletBalanceNum` finite and `walletBalanceNum < projectCeiling`, `projectBalanceShortfall = projectCeiling - walletBalanceNum` and `showProjectBalanceWarning = true`; else no warning.
      * `[ ]`   After row 2 block (after line 183 `</div>`), before `generateContributionsError` alert: wrap cost lines in a container `div` with `className="text-xs text-muted-foreground space-y-1"` (or equivalent existing muted copy).
      * `[ ]`   When `stageCeiling !== null`: render `data-testid="session-info-stage-cost-estimate"` — `Estimated cost for this stage: ~{formatTokenCount(stageCeiling)} tokens.`
      * `[ ]`   When `projectCeiling !== null`: render `data-testid="session-info-project-cost-estimate"` — `Estimated project cost: ~{formatTokenCount(projectCeiling)} tokens.`
      * `[ ]`   When `showProjectBalanceWarning` and `projectBalanceShortfall` computed: render `data-testid="session-info-project-balance-warning"` with concise copy (e.g. full project may need ~{projectCeiling}; top up {shortfall}) and `Link to="/subscription?tab=top-up"`.
      * `[ ]`   No other behavioral changes.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: UI component.
      * `[ ]`   Deps: inward (store selectors, wallet/ai stores, router `Link`).
      * `[ ]`   Provides: outward (session-header cost transparency for wallet/top-up decisions).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   No `minimum_balance` reads in `SessionInfoCard.tsx`. Observable: grep.
      * `[ ]`   Stage and project estimate lines render when `selectCostCeiling` returns valid ceilings for the active session and viewing slug. Observable: `SessionInfoCard.test.tsx`.
      * `[ ]`   When `selectCostCeiling` returns `null`, no cost estimate testids render. Observable: unit test.
      * `[ ]`   Project balance warning renders when `projectCeiling > wallet` with top-up link; does not hide toolbar or progress. Observable: unit test.
      * `[ ]`   Existing SessionInfoCard tests (seed prompt, progress, export, 2-row layout) remain green.

  * `[ ]`   apps/web/src/components/dialectic/CreateDialecticProjectForm **Pre-project cost preview, dynamic Autostart gate, and project balance warning**

    * `[ ]`   `objective`
      * `[ ]`   `CreateDialecticProjectForm.tsx` gates Autostart on `sortedStages[0]?.minimum_balance` (lines 400-418, 420-431) and never surfaces dynamic ceilings. Ticket lines 458-464 require pre-project `project_ceiling` + first-stage `stage_ceiling` from `selectPreProjectCostCeiling` (fed by `fetchStageExpectedCounts` + `preProjectStageExpectedCounts`), display copy, a non-blocking project warning when `project_ceiling > wallet`, and Autostart forced off when first-stage ceiling exceeds wallet (Create still allowed).
      * `[ ]`   Functional goal (load template): when `selectedDomain?.default_process_template_id` is a non-empty string (from `listDomains` / `fetchDomains`, prior nodes), call `fetchProcessTemplate(default_process_template_id)` (re-fetch when `selectedDomain?.id` or `default_process_template_id` changes). When `default_process_template_id` is `null` or missing, do not call `fetchProcessTemplate`; do not call `fetchStageExpectedCounts`; render no cost preview and no ceiling-based Autostart block. No fabricated template id.
      * `[ ]`   Functional goal (fetch counts): when `selectedDomain` is set, `currentProcessTemplate?.id` is a non-empty string, and `uniqueModelCount >= 1`, call `fetchStageExpectedCounts({ processTemplateId: currentProcessTemplate.id, modelCount: uniqueModelCount })` (re-fetch when domain, template id, or model count changes). Do not call when `modelCount < 1` or template id missing. No fabricated counts.
      * `[ ]`   Functional goal (preview copy): when `selectPreProjectCostCeiling(state)` returns a non-null estimate and `sortedStages[0]` exists with slug `firstSlug`, read `firstStageCeiling = estimate.stageCeilings[firstSlug]` (finite non-negative only); when both `estimate.projectCeiling` and `firstStageCeiling` are finite, render `data-testid="create-project-cost-preview"`: "Estimated token cost: ~{projectCeiling} for the full project, ~{firstStageCeiling} for the first stage." (use `Intl.NumberFormat("en-US")` formatting). When estimate is `null`, render no preview (no fallback to `minimum_balance`).
      * `[ ]`   Functional goal (project warning): when `projectCeiling` is finite and wallet balance (`walletInfo` via existing `selectActiveChatWalletInfo(state, null)`) is below `projectCeiling`, render non-blocking `data-testid="create-project-project-balance-warning"` with shortfall and `Link` to `/subscription?tab=top-up`. Does not disable Create submit.
      * `[ ]`   Functional goal (Autostart gate): replace `firstStageMinBalance` / `minimum_balance` checks in the autostart `useEffect` (lines 400-418) and `lowBalanceForReason` (lines 420-431) with `firstStageCeiling` from `selectPreProjectCostCeiling` + `sortedStages[0].slug`. When `firstStageCeiling` is finite and `Number(walletInfo.balance) < firstStageCeiling`, set `startGeneration` false (Autoconfig) and set `autoUncheckReason` to explanatory copy (e.g. "Estimated first-stage cost exceeds wallet balance for auto-start") with optional inline top-up `Link` (`data-testid="create-project-autostart-top-up-link"`) to `/subscription?tab=top-up`. When `firstStageCeiling` is `null`, do not apply a ceiling-based autostart block (same as hook: no preventive gate without estimate). Preserve "No default models available" branch unchanged.
      * `[ ]`   Functional goal (submit): Create / Autoconfig / Manual submit paths unchanged except autostart eligibility now uses ceiling, not `minimum_balance`.
      * `[ ]`   Functional goal (submit template id): on submit, set `processTemplateId` on `CreateProjectPayload` / `CreateProjectAndAutoStartPayload` from `selectedDomain.default_process_template_id` when it is a non-empty string; if missing at submit time, do not submit (log error and return, same as missing `selectedDomainId`). Store `createDialecticProject` / `createProjectAndAutoStart` append `processTemplateId` to FormData (prior `dialecticStore.ts` node); this form supplies the field on the payload object.
      * `[ ]`   Non-functional: no `selectCostCeiling` (post-project) in this form; no edits to `dialecticStore.ts`, selectors, or BE. Subscription cart prefill deferred. `currentProcessTemplate` must be hydrated for counts (same implicit dependency as today's `sortedStages[0]` gate — tests already set `currentProcessTemplate` in `CreateDialecticProjectForm.autostart.test.tsx`; production create page may need template load wired separately if preview is absent in manual QA).
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   UI component — pre-project cost transparency and Autostart affordability gate.
      * `[ ]`   This node wires `fetchStageExpectedCounts` + `selectPreProjectCostCeiling` into the create UX. It does NOT implement selector arithmetic or store actions (prior Group 4 nodes).
      * `[ ]`   Out of scope: session-page consumers (prior nodes); subscription cart prefill; domain→template association API (BE `domain_process_associations` at create time only — template id for preview comes from `currentProcessTemplate` already used by `selectSortedStages`).
      * `[ ]`   HARD dependency: `listDomains` node (`default_process_template_id` on each domain), `dialectic.api` node (`DialecticDomain` + `CreateProjectPayload.processTemplateId` types and tests), `dialecticStore.ts` node (`fetchStageExpectedCounts`, `createDialecticProject` FormData `processTemplateId`), `dialecticStore.selectors` node (`selectPreProjectCostCeiling`), `createProject` BE node (accept supplied `processTemplateId`). Precedes commit node below.

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `apps/web/src/components/dialectic` — `CreateDialecticProjectForm`.
      * `[ ]`   Inside: domain-change `fetchProcessTemplate` effect, count-fetch effect, cost preview, project warning, Autostart gate rewrite, submit `processTemplateId`, token formatting.
      * `[ ]`   Outside: `computeCostCeiling`, `fetchStageExpectedCounts` implementation, API transport.

    * `[ ]`   `deps`
      * `[ ]`   `fetchProcessTemplate` — provider: `@paynless/store` (`dialecticStore.ts`, existing action); layer: store action; direction: inward; purpose: hydrate `currentProcessTemplate` from `selectedDomain.default_process_template_id` before counts and `selectSortedStages`.
      * `[ ]`   `fetchStageExpectedCounts` — provider: `@paynless/store` (`dialecticStore.ts` node); layer: store action; direction: inward; purpose: populate `preProjectStageExpectedCounts`.
      * `[ ]`   `selectPreProjectCostCeiling`, `selectSortedStages` — provider: `@paynless/store` (`dialecticStore.selectors` node); layer: selectors; direction: inward.
      * `[ ]`   `CostCeilingEstimate` — provider: `@paynless/types`; layer: types; direction: inward (import only if needed for test mocks).
      * `[ ]`   `currentProcessTemplate`, `selectedDomain`, `selectSelectedModels` / `uniqueModelCount` — existing store reads.
      * `[ ]`   `walletInfo` / `selectActiveChatWalletInfo` — existing (line 121-124).
      * `[ ]`   `Link` — provider: `react-router-dom`; direction: inward.
      * `[ ]`   HARD dependency: `dialecticStore.selectors` (`selectPreProjectCostCeiling`) and `dialecticStore.ts` (`fetchStageExpectedCounts`). Precedes commit node below.
      * `[ ]`   No reverse dependencies.

    * `[ ]`   `context_slice`
      * `[ ]`   `default_process_template_id` = `selectedDomain?.default_process_template_id` (from `domains` / `fetchDomains`, not a separate form field).
      * `[ ]`   `processTemplateId` = `currentProcessTemplate.id`; `modelCount` = `uniqueModelCount` (existing lines 152-155).
      * `[ ]`   `firstStageSlug` = `sortedStages[0]?.slug` when `sortedStages.length > 0`.
      * `[ ]`   `preProjectEstimate` = `useDialecticStore(selectPreProjectCostCeiling)` (no session id).
      * `[ ]`   No reads of `minimum_balance` anywhere in the file after this node.

    * `[ ]`   dialectic/`CreateDialecticProjectForm.autostart.test.tsx`
      * `[ ]`   Extend `vi.mock('@paynless/store', ...)`: expose `selectPreProjectCostCeiling: vi.fn<[DialecticStateValues], CostCeilingEstimate | null>()` (default `null`); expose `fetchStageExpectedCounts` and `fetchProcessTemplate` via `getDialecticStoreActionMock` / mock store actions (spy on calls).
      * `[ ]`   Seed `selectedDomain` with `default_process_template_id` matching `processTemplateForAutostartBalanceTest.id` (or dedicated template fixture) in cost-preview / counts tests — do not rely on `currentProcessTemplate` alone without domain template id.
      * `[ ]`   Add test: when `selectedDomain.default_process_template_id` is set, `fetchProcessTemplate` called with that id after render (`waitFor`).
      * `[ ]`   Add test: when `default_process_template_id` is `null`, `fetchProcessTemplate` and `fetchStageExpectedCounts` are not called.
      * `[ ]`   Add test: Manual submit payload includes `processTemplateId` equal to `selectedDomain.default_process_template_id`.
      * `[ ]`   Add test: Autostart / Autoconfig submit payload includes `processTemplateId` on `createProjectAndAutoStart` mock call.
      * `[ ]`   Replace test `defaults to Autoconfig when wallet balance below thesis threshold` (lines 474-493): remove reliance on `stageThesisForAutostart.minimum_balance`; mock `selectPreProjectCostCeiling` to return `{ stageCeilings: { thesis: firstStageMinBalanceForAutostartTest }, projectCeiling: firstStageMinBalanceForAutostartTest }` with wallet `balance: String(firstStageMinBalanceForAutostartTest - 1)`; expect Autoconfig + reason matching new ceiling copy (not "thesis threshold" / `minimum_balance`).
      * `[ ]`   Add test: when `selectPreProjectCostCeiling` returns estimate and wallet meets first-stage ceiling, default remains Autostart (checked).
      * `[ ]`   Add test: when estimate is `null`, autostart default follows existing no-default-models / catalog rules only (no ceiling block).
      * `[ ]`   Add test: `fetchStageExpectedCounts` called with `{ processTemplateId: processTemplateForAutostartBalanceTest.id, modelCount: 1 }` after render when `currentProcessTemplate` and default model seeded (use `waitFor`).
      * `[ ]`   Add test: `create-project-cost-preview` shows formatted project + first-stage ceilings when mock estimate and `sortedStages[0].slug === 'thesis'`.
      * `[ ]`   Add test: `create-project-project-balance-warning` when `projectCeiling` exceeds wallet; Create button still enabled.
      * `[ ]`   Add test: `create-project-autostart-top-up-link` (or warning copy) present when autostart blocked by ceiling; `href` `/subscription?tab=top-up`.
      * `[ ]`   Preserve all other autostart tests (setup mode cycle, submit paths, loaders). New cases appended.

    * `[ ]`   dialectic/`CreateDialecticProjectForm.test.tsx`
      * `[ ]`   If the shared store mock is duplicated, align with autostart file: mock `selectPreProjectCostCeiling` default `null`.
      * `[ ]`   Add test: when mock estimate present, `create-project-cost-preview` visible; when `null`, absent.
      * `[ ]`   Update Manual-path tests that assert `createDialecticProject` payload: expect `processTemplateId` on the payload object (alongside existing `idempotencyKey` / domain fields).
      * `[ ]`   Preserve unrelated tests (TextInputArea props, manual submit, placeholders). New cases appended.

    * `[ ]`   dialectic/`CreateDialecticProjectForm.tsx`
      * `[ ]`   Add imports: `selectPreProjectCostCeiling`, `fetchStageExpectedCounts` from `@paynless/store`; `Link` from `react-router-dom`.
      * `[ ]`   `const fetchProcessTemplate = useDialecticStore((state) => state.fetchProcessTemplate);`
      * `[ ]`   `const fetchStageExpectedCounts = useDialecticStore((state) => state.fetchStageExpectedCounts);`
      * `[ ]`   `const currentProcessTemplate = useDialecticStore((state) => state.currentProcessTemplate);`
      * `[ ]`   `const preProjectEstimate = useDialecticStore(selectPreProjectCostCeiling);`
      * `[ ]`   `const formatTokenCount = (n: number): string => new Intl.NumberFormat("en-US").format(n);`
      * `[ ]`   Add `useEffect` for template load (deps: `selectedDomain?.id`, `selectedDomain?.default_process_template_id`, `fetchProcessTemplate`): when `default_process_template_id` is a non-empty string, call `fetchProcessTemplate(default_process_template_id)`.
      * `[ ]`   Add `useEffect` for counts (deps: `selectedDomain?.id`, `currentProcessTemplate?.id`, `uniqueModelCount`, `fetchStageExpectedCounts`): when domain id and template id defined and `uniqueModelCount >= 1`, call `fetchStageExpectedCounts({ processTemplateId: currentProcessTemplate.id, modelCount: uniqueModelCount })`.
      * `[ ]`   Derive `firstStageSlug: string | null` from `sortedStages[0]?.slug ?? null`.
      * `[ ]`   Derive `firstStageCeiling: number | null` from `preProjectEstimate` + `firstStageSlug` (finite non-negative only).
      * `[ ]`   Derive `projectCeiling: number | null` from `preProjectEstimate?.projectCeiling` when finite.
      * `[ ]`   Replace autostart `useEffect` (lines 400-418): remove `firstStageMinBalance` / `minimum_balance`; use `firstStageCeiling` vs `Number(walletInfo.balance)` when `firstStageCeiling !== null`; keep `noDefaults` branch.
      * `[ ]`   Replace `lowBalanceForReason` block (lines 420-423): compare wallet to `firstStageCeiling` instead of `firstStageMinBalance`.
      * `[ ]`   Update `autoUncheckReason` string for ceiling case (lines 424-431).
      * `[ ]`   In `CardContent` (before `CardFooter`): render cost preview block when both ceilings available; render project warning when `projectCeiling > wallet`; render top-up link in autostart reason area when ceiling blocks autostart.
      * `[ ]`   In `onSubmit` (lines 464-533): before building `CreateProjectPayload`, read `processTemplateId` from `selectedDomain?.default_process_template_id`; if not a non-empty string, log error and return; set `processTemplateId` on `payload` and `autoStartPayload` spread from `payload`.
      * `[ ]`   Remove all `minimum_balance` identifiers from the file.
      * `[ ]`   No other behavioral changes.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: UI component.
      * `[ ]`   Deps: inward (store action + selectors + wallet).
      * `[ ]`   Provides: outward (pre-project cost UX; closes Group 5 consumer chain).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   `minimum_balance` does not appear in `CreateDialecticProjectForm.tsx`. Observable: grep.
      * `[ ]`   `fetchProcessTemplate` invoked with `selectedDomain.default_process_template_id` when that field is a non-empty string. Observable: autostart unit test.
      * `[ ]`   Submit payloads include `processTemplateId` matching `selectedDomain.default_process_template_id` on Manual and Autostart paths. Observable: `CreateDialecticProjectForm.test.tsx` and `CreateDialecticProjectForm.autostart.test.tsx`.
      * `[ ]`   `fetchStageExpectedCounts` invoked with template id + model count when prerequisites met. Observable: autostart unit test.
      * `[ ]`   Preview copy matches ticket when `selectPreProjectCostCeiling` returns valid data. Observable: unit test.
      * `[ ]`   Autostart defaults to Autoconfig when wallet below first-stage ceiling; Create remains enabled. Observable: updated autostart test.
      * `[ ]`   Project warning is non-blocking with top-up link. Observable: unit test.
      * `[ ]`   When estimate is `null`, no preview and no ceiling autostart block. Observable: unit test.

  * `[ ]`   apps/web/src/components/ai/CreateProjectFromChatButton **Supply `processTemplateId` on chat-initiated `createProjectAndAutoStart`**

    * `[ ]`   `objective`
      * `[ ]`   `CreateProjectFromChatButton.tsx` builds `CreateProjectAndAutoStartPayload` with `projectName`, `initialUserPrompt`, `selectedDomainId`, and idempotency keys only (lines 55-61). After the `createProject` BE node requires `processTemplateId` on FormData (validated against `domain_process_associations`), this path omits the field and create fails even when `listDomains` / `fetchDomains` already returned `default_process_template_id` on each domain.
      * `[ ]`   Functional goal: after `fetchDomains` when needed, resolve `selectedDomain` via `selectSelectedDomain(useDialecticStore.getState())` (not only `selectedDomainId`); read `default_process_template_id` from that domain object (prior `listDomains` + `DialecticDomain` type nodes).
      * `[ ]`   Functional goal: when `default_process_template_id` is a non-empty string, include `processTemplateId: default_process_template_id` on `CreateProjectAndAutoStartPayload` passed to `createProjectAndAutoStart` (store appends to FormData per `dialecticStore.ts` node).
      * `[ ]`   Functional goal: when `selectedDomainId` is missing, keep existing toast "No domain available…" and return without calling `createProjectAndAutoStart`.
      * `[ ]`   Functional goal: when `selectedDomainId` is present but `default_process_template_id` is missing, null, or empty, show an error toast (e.g. no process template for this domain) and return without calling `createProjectAndAutoStart`.
      * `[ ]`   Non-functional: no pre-project cost preview, no `fetchProcessTemplate`, no `fetchStageExpectedCounts`, no `selectPreProjectCostCeiling` in this component (chat surface only submits create+autostart). No edits to `dialecticStore.ts`, `CreateDialecticProjectForm`, or BE handlers.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   UI component — chat toolbar control that creates a dialectic project from selected messages.
      * `[ ]`   This node threads the domain default template id into the existing auto-start payload. It does NOT implement domain listing, store FormData assembly, or project creation on the BE.
      * `[ ]`   Out of scope: cost ceiling display; Autostart/mode UI; `createDialecticProject` manual path.

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `apps/web/src/components/ai` — `CreateProjectFromChatButton`.
      * `[ ]`   Inside: domain resolution after `fetchDomains`, `processTemplateId` on payload, guard toasts when template id absent.
      * `[ ]`   Outside: `listDomains` BE shape, `createProject` validation, `createDialecticProject` FormData append.

    * `[ ]`   `deps`
      * `[ ]`   `selectSelectedDomain`, `selectDomains`, `fetchDomains`, `createProjectAndAutoStart` — provider: `@paynless/store`; layer: store; direction: inward; purpose: domain list, selected domain with `default_process_template_id`, project creation.
      * `[ ]`   `CreateProjectAndAutoStartPayload` — provider: `@paynless/types` (`dialectic.types.ts`, `dialectic.api` node adds `processTemplateId` on `CreateProjectPayload`); layer: types; direction: inward.
      * `[ ]`   `useAiStore` selectors, `formatChatMessagesAsPrompt`, `useNavigate`, `toast` — existing; unchanged.
      * `[ ]`   HARD dependency: `listDomains` node, `dialectic.api` + `dialectic.types` (`DialecticDomain.default_process_template_id`, `CreateProjectPayload.processTemplateId`), `dialecticStore.ts` node (FormData `processTemplateId`), `createProject` BE node. Runs after those nodes; before or with `CreateDialecticProjectForm` (parallel consumer).

    * `[ ]`   `context_slice`
      * `[ ]`   After `fetchDomains` (if `domains.length === 0`), re-read `const selectedDomain: DialecticDomain | null = selectSelectedDomain(useDialecticStore.getState())`.
      * `[ ]`   `selectedDomainId = selectedDomain?.id`; `processTemplateId` candidate = `selectedDomain?.default_process_template_id` when non-empty string.
      * `[ ]`   Payload includes `processTemplateId` only when candidate is valid; otherwise early return with toast.

    * `[ ]`   ai/`CreateProjectFromChatButton.test.tsx`
      * `[ ]`   Add `default_process_template_id: 'pt-general'` to `generalDomain` fixture; add `default_process_template_id: 'pt-other'` to `otherDomain` (or `null` on `otherDomain` for a dedicated null-path test).
      * `[ ]`   Update `on click, calls createProjectAndAutoStart with { projectName, initialUserPrompt, selectedDomainId, idempotencyKey, sessionIdempotencyKey }` (line 351): assert `processTemplateId: 'pt-general'` (or matching fixture id) in `expect.objectContaining`.
      * `[ ]`   Update every `createProjectAndAutoStart` payload assertion in this file (lines 340-346, 370-377, and any other `expect.objectContaining` on the mock call) to include `processTemplateId` equal to the seeded domain's `default_process_template_id`.
      * `[ ]`   Add test: when `selectedDomain` has `default_process_template_id: null` (or domain lacks the field), click does not call `createProjectAndAutoStart`; `toast.error` called.
      * `[ ]`   Add test: when `fetchDomains` runs and store then has `selectedDomain` with valid `default_process_template_id`, payload includes that id.
      * `[ ]`   Preserve existing tests (disabled states, navigation, idempotency keys distinct, error toast on API failure, does not call `createDialecticProject`). New/updated cases appended.

    * `[ ]`   ai/`CreateProjectFromChatButton.tsx`
      * `[ ]`   Import `DialecticDomain` from `@paynless/types` if needed for typing `selectedDomain` after `getState()`.
      * `[ ]`   In `handleClick` after `fetchDomains` block: replace `const selectedDomainId = selectSelectedDomain(...)?.id` with read full `selectedDomain`; derive `selectedDomainId` and `processTemplateId` from `selectedDomain?.default_process_template_id` (non-empty string check).
      * `[ ]`   If `selectedDomainId === undefined`, keep existing toast and return.
      * `[ ]`   If `processTemplateId` is not a non-empty string, `toast.error(...)` and return.
      * `[ ]`   Add `processTemplateId` to the `CreateProjectAndAutoStartPayload` object (lines 55-61).
      * `[ ]`   No other behavioral changes.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: UI component.
      * `[ ]`   Deps: inward (store selectors/actions, types, ai store, router, toast).
      * `[ ]`   Provides: outward (chat → project create payload aligned with Create form and BE contract).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   Every successful `createProjectAndAutoStart` call includes `processTemplateId` equal to `selectedDomain.default_process_template_id`. Observable: unit tests on mock payload.
      * `[ ]`   When `default_process_template_id` is absent, `createProjectAndAutoStart` is not invoked. Observable: unit test + `toast.error`.
      * `[ ]`   Existing navigation, disabled, and idempotency behavior unchanged. Observable: preserved tests green.

  * `[ ]`   supabase/functions/dialectic-service/createProject **Accept client-supplied `processTemplateId`; validate default association; remove domain-only template lookup**

    * `[ ]`   `objective`
      * `[ ]`   Pre-project cost preview and `createProject` both need the default `process_template_id` for the selected domain before a project exists. `listDomains` today returns only `dialectic_domains` columns (`listDomains.ts` lines 19-23) with no association data. `createProject.ts` (lines 68-81) resolves the default template per domain via `domain_process_associations` where `is_default_for_domain = true` — that lookup is duplicated nowhere else on read paths, so the Create form cannot call `fetchProcessTemplate` or `fetchStageExpectedCounts` after domain selection without an extra round trip invented ad hoc.
      * `[ ]`   After the `listDomains` node returns `default_process_template_id` on each domain and FE consumers (`dialectic.api`, `dialecticStore`, `CreateDialecticProjectForm`, `CreateProjectFromChatButton`) send `processTemplateId` on FormData, `createProject` must stop discovering the template by `selectedDomainId` alone and instead accept the client-supplied id, validate it against `domain_process_associations`, and insert that id on `dialectic_projects.process_template_id`.
      * `[ ]`   Functional goal: read `processTemplateId` from `FormData` (`payload.get('processTemplateId')`); require a non-empty string after trim; return `{ error, status: 400 }` when missing or not a string (same error-as-value pattern as `selectedDomainId`, lines 64-66).
      * `[ ]`   Functional goal: remove the domain-only default lookup block (lines 68-81) that calls `domain_process_associations` with only `domain_id` + `is_default_for_domain` and assigns `defaultProcessTemplateId` from the result.
      * `[ ]`   Functional goal: validate the supplied id — query `domain_process_associations` with `.eq('domain_id', selectedDomainId)`, `.eq('process_template_id', processTemplateId)`, `.eq('is_default_for_domain', true)`, `.single()`; when the row is missing or the query errors, return `{ error: { message: "Could not find a default process template for the selected domain.", status: 400 } }` (preserve existing user-facing message and status for this failure mode).
      * `[ ]`   Functional goal: on success, set `process_template_id: processTemplateId` on the `dialectic_projects` insert (line 91) and keep all post-insert behavior unchanged (idempotency, file upload, resource upsert, `process_template` join on response).
      * `[ ]`   Functional goal: `dialectic-service/index.ts` dispatch for `createProject` unchanged — still `handlers.createProject` with `FormData`; no new action.
      * `[ ]`   Non-functional: flat handler file (`createProject.ts` + `createProject.test.ts` only). No FE types (owned by `dialectic.api` node). No `listDomains` edits.
      * `[ ]`   Each goal is atomic and testable.

    * `[ ]`   `role`
      * `[ ]`   App-service write handler (BE) — project creation with client-supplied default process template id validated against the domain association table.
      * `[ ]`   This node owns exactly `createProject.ts` and `createProject.test.ts`. It does NOT edit `listDomains.ts`, `dialectic-service/index.ts`, `packages/types`, `dialectic.api.ts`, `dialecticStore.ts`, or UI components.
      * `[ ]`   Provides: outward (trusted `process_template_id` on created projects when FE sends the same id `listDomains` exposed for that domain).

    * `[ ]`   `module`
      * `[ ]`   Bounded context: `dialectic-service` project creation.
      * `[ ]`   Inside: FormData parsing for `processTemplateId`, association validation, insert `process_template_id`.
      * `[ ]`   Outside: domain catalog (`listDomains`), template stage fetch (`fetchProcessTemplate`), expected counts, cost ceiling, UI.

    * `[ ]`   `deps`
      * `[ ]`   `SupabaseClient` — provider: `@supabase/supabase-js`; layer: infrastructure; direction: inward; purpose: `domain_process_associations` validation query and `dialectic_projects` insert. Supabase client typing exception applies.
      * `[ ]`   `User`, `FormData`, `FileManagerService`, `assembleChunks`, storage helpers — existing `createProject` deps; unchanged.
      * `[ ]`   HARD dependency: `listDomains` node (FE reads `default_process_template_id` before submit). FE `processTemplateId` on FormData is produced by `dialecticStore.ts` / Create-form / chat-button nodes — this node assumes that field is present on successful create requests.
      * `[ ]`   No reverse dependencies.

    * `[ ]`   `context_slice`
      * `[ ]`   Input from `FormData`: existing fields unchanged plus required `processTemplateId` (string, non-empty after trim) alongside required `selectedDomainId`.
      * `[ ]`   Validation read: one `domain_process_associations` row proving `(domain_id, process_template_id, is_default_for_domain = true)`.
      * `[ ]`   Output: unchanged `DialecticProject` success shape; `process_template_id` on inserted row equals the supplied `processTemplateId`.

    * `[ ]`   `interaction.spec`
      * `[ ]`   Caller: `dialectic-service/index.ts` `case "createProject"` → `handlers.createProject(formData, ...)` (unchanged).
      * `[ ]`   Upstream: `api.dialectic().createProject(formData)` where `formData` includes `processTemplateId` appended by `dialecticStore.createDialecticProject` (prior node).
      * `[ ]`   Ordering: validate `idempotencyKey`, `projectName`, prompt, `selectedDomainId` as today → read and validate `processTemplateId` → association validation query → project insert and remainder of handler unchanged.
      * `[ ]`   Failure: missing/invalid `processTemplateId` → 400 before insert; association validation failure → 400 with existing default-template message; DB/insert failures unchanged.

    * `[ ]`   dialectic-service/`createProject.test.ts`
      * `[ ]`   Add `processTemplateId: mockProcessTemplateId` to every `formDataValues` object and every manual `formData.append` sequence used on success paths (including the primary success test starting ~line 88).
      * `[ ]`   Update `mockExpectedDbInsert` / insert payload assertions: `process_template_id` on insert equals the `processTemplateId` sent in FormData (not a value only returned from a mocked association lookup).
      * `[ ]`   Replace test `createProject - no default process template found for domain` (lines 572-608): drive failure via validation — e.g. FormData includes `processTemplateId` that does not match a default association for `selectedDomainId`, or association mock returns empty — assert `{ error, status: 400 }` and message `"Could not find a default process template for the selected domain."`.
      * `[ ]`   Append test: `processTemplateId` omitted from FormData → `{ error, status: 400 }` with message requiring `processTemplateId`; no `dialectic_projects` insert.
      * `[ ]`   Append test: `processTemplateId` empty string or whitespace-only → same 400 as missing.
      * `[ ]`   Append test: `processTemplateId` present and association mock returns matching default row → success; `insert` payload `process_template_id` equals supplied id.
      * `[ ]`   Update `fromSpy` / call-order assertions on tests that currently require the first `from` call to be `domain_process_associations` for domain-only discovery (e.g. line 195): first association call is validation with `process_template_id` + `domain_id` + `is_default_for_domain`, not an unfiltered default lookup.
      * `[ ]`   Preserve all unrelated tests (idempotency, file upload, overlay, auth). New/updated cases appended at end where possible.

    * `[ ]`   dialectic-service/`createProject.ts`
      * `[ ]`   After `selectedDomainId` validation (lines 64-66), read `processTemplateId` from `payload.get('processTemplateId')`; if not a non-empty string after trim, return `{ error: { message: "processTemplateId is required and must be a string", status: 400 } }`.
      * `[ ]`   Delete lines 68-81 (domain-only default template lookup and `defaultProcessTemplateId` assignment).
      * `[ ]`   Add association validation query: `from('domain_process_associations').select('process_template_id').eq('domain_id', selectedDomainId).eq('process_template_id', processTemplateId).eq('is_default_for_domain', true).single()`; on error or no row, return `{ error: { message: "Could not find a default process template for the selected domain.", status: 400 } }`.
      * `[ ]`   On insert (line 91), set `process_template_id: processTemplateId` (the trimmed FormData value).
      * `[ ]`   No other behavioral changes to idempotency, prompt file handling, or response mapping.

    * `[ ]`   `directionality`
      * `[ ]`   Layer: app-service handler (BE).
      * `[ ]`   Deps: inward (`dbAdminClient`, existing helpers).
      * `[ ]`   Provides: outward (created projects use client-validated default template id; pairs with `listDomains` read path).
      * `[ ]`   No cycles.

    * `[ ]`   `requirements`
      * `[ ]`   `createProject` returns 400 when `processTemplateId` is missing, empty, or not a string. Observable: unit tests.
      * `[ ]`   `createProject` returns 400 with the existing default-template message when the supplied id is not the default association for `selectedDomainId`. Observable: updated no-default / mismatch test.
      * `[ ]`   Successful create inserts `process_template_id` equal to the FormData `processTemplateId`. Observable: insert payload assertion on primary success test.
      * `[ ]`   Lines 68-81 domain-only lookup removed. Observable: grep `createProject.ts` for the old `defaultProcessTemplateId` lookup block; review shows validation-only association query.
      * `[ ]`   All preserved `createProject.test.ts` cases remain green after FormData fixture updates.

    * `[ ]`   **Commit** `feat(dialectic): dynamic cost ceiling — FE estimate utility, selectors, and consumers`
      * `[ ]`   Structural: `computeCostCeiling` + `CostCeilingEstimate` types; `stageExpectedCountsByRun` / `preProjectStageExpectedCounts` store state; `selectCostCeiling` / `selectPreProjectCostCeiling`; BE count core + session-less handler + API client (Groups 1–4 nodes).
      * `[ ]`   Behavioral: post-project ceilings drive NSF gate (`useStartContributionGeneration`, `GenerateContributionButton`); session header shows project/stage estimates (`SessionInfoCard`); create form previews full-project + first-stage cost, gates Autostart on first-stage ceiling, warns when project ceiling exceeds wallet; estimates recompute with model/cap changes; no `minimum_balance` preventive gates in Group 5 consumers.
      * `[ ]`   Contract: arithmetic-only `computeCostCeiling`; selectors return `null` without valid counts/cap/rate; pre-project counts via `getStageExpectedCounts`; subscription cart prefill explicitly deferred to next ticket.

* **Subscription checkout deep links — prepopulate cart from upgrade and top-up CTAs**

  Implement after the **Dynamic cost ceiling** ticket above. Cost ceiling supplies `stage_ceiling`, `project_ceiling`, and token shortfalls for NSF and pre-project surfaces; this ticket wires every `/subscription` CTA to the cart using those values (where applicable) plus tier-aware plan resolution for feature-gate upgrades. Do this in **one pass** once `costCeiling` / `recomputeCostCeiling` exist — do not ship another round of naked `/subscription` links.

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

  1. **Cost ceiling** — `costCeiling.ts`, store state, `recomputeCostCeiling`, UI hooks for estimates and shortfalls (per Dynamic cost ceiling ticket above).
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