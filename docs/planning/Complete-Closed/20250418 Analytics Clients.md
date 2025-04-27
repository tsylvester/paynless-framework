
## Abstract Analytics Client (PostHog First)

**Goal:** Implement an analytics layer that can use PostHog (or potentially others later) based on environment variable configuration. If no provider is configured or the required key is missing, the application must function without errors, and analytics calls should become no-ops.

**Phase 0: Setup & Interface Definition**
*   **Goal:** Add dependencies, create the new package structure, and define the shared interface.
*   **Steps:**
    *   [x] **Add Dependencies:** Add `posthog-js` to `packages/analytics/package.json`.
    *   [x] **Create Package:** Create the directory `packages/analytics`.
    *   [x] **Package Files:** Add `packages/analytics/package.json`, `packages/analytics/tsconfig.json` (extending base tsconfig).
    *   [x] **Source Dir:** Create `packages/analytics/src/`.
    *   [x] **Define Interface:** In `packages/types/src/`, create `analytics.types.ts`. Define the `AnalyticsClient` interface (`init?`, `identify`, `track`, `reset`).
    *   [x] **Export Interface:** Export `AnalyticsClient` from `packages/types/src/index.ts`.
    *   [x] **Update Workspace:** Ensure `pnpm-workspace.yaml` includes `packages/analytics`.
    *   [x] **Install:** Run `pnpm install` from the root.
*   **Testing & Commit Point:** Verify builds, workspace recognition. Commit: `feat(analytics): Setup analytics package and define core interface`

**Phase 1: Null Adapter & Default Service**
*   **Goal:** Implement the default "do nothing" behavior.
*   **Steps:**
    *   [x] **Null Adapter:** Create `packages/analytics/src/nullAdapter.ts`. Implement `AnalyticsClient` with empty functions.
    *   [x] **Central Service Stub:** Create `packages/analytics/src/index.ts`. Import `NullAnalyticsAdapter`. Read placeholder env vars. Default to exporting `new NullAnalyticsAdapter()` as `analytics`.
*   **Testing & Commit Point:** Unit test `NullAnalyticsAdapter`, unit test `index.ts` defaulting to null adapter. Commit: `feat(analytics): Implement null analytics adapter and default service`

**Phase 2: PostHog Adapter & Service Logic**
*   **Goal:** Implement the PostHog adapter and selection logic.
*   **Steps:**
    *   [x] **Environment Variables:** Define `VITE_ANALYTICS_PROVIDER`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` in `.env.example` (optional).
    *   [x] **PostHog Adapter:** Create `packages/analytics/src/posthogAdapter.ts`. Import `posthog-js`. Implement `AnalyticsClient` interface using `posthog.init`, `posthog.identify`, `posthog.capture`, `posthog.reset`, etc.
    *   [x] **Central Service Update (`index.ts`):** Import `PostHogAdapter`. Read actual env vars. Add logic: If provider is "posthog" and key exists, instantiate and `init` PostHog adapter; else, instantiate null adapter. Export the chosen instance as `analytics`. Add logging for chosen adapter.
*   **Testing & Commit Point:** Unit test `PostHogAdapter` (mocking `posthog-js`). Unit test `index.ts` selection logic with different env var combinations. Commit: `feat(analytics): Implement PostHog adapter and configure service selection`

**Phase 3: Application Initialization & User Identification**
*   **Goal:** Initialize the client and integrate user identification/reset.
*   **Steps:**
    *   [✅] **App Initialization:** Ensure `import { analytics } from '@paynless/analytics';` happens early in `apps/web/src/main.tsx` or `App.tsx` (init happens on import).
    *   [✅] **Integrate with `useAuthStore`:** Import `analytics`. In `login`, `register`, `initialize` success handlers, call `analytics.identify(user.id, { traits... })`. In `logout` action, call `analytics.reset();`.
*   **Testing & Commit Point:** Unit test `authStore` (mocking analytics client, verifying `identify`
