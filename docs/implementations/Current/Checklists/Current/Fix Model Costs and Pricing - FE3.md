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