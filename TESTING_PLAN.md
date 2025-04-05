**Consolidated Project Testing Plan & Status (v3)**

**Notes & Key Learnings (Summary):**

*   **Local Runtime Auth (`verify_jwt`):** The local Supabase runtime *does* respect function-specific `[functions.<name>] verify_jwt = false` settings in `config.toml`. This is crucial for allowing API key auth functions (`/login`, `/register`) to bypass the runtime's potentially overzealous default JWT checks. Failure symptom: `401 Unauthorized` with runtime logs showing "Missing authorization header".
*   **Dependency Injection & `serve`:** Using the DI pattern (`deps = defaultDeps`) for unit testability is viable, *but* the `serve` call at the end of the function file *must* explicitly pass the defaults: `serve((req) => handler(req, defaultDeps))`. Failure symptom: `TypeError` inside the function runtime.
*   **Deno Imports (`npm:`, `std` version):** Deno requires explicit handling for imports:
    *   Use the `npm:` prefix for Node packages like `@supabase/supabase-js` (e.g., `npm:@supabase/supabase-js`).
    *   Use a recent, compatible version of the Deno Standard Library (`std`) matching the runtime (e.g., `std@0.224.0` for `serve`). Failure symptoms: `worker boot error` (relative path), `ReferenceError` (undefined function).
*   **Environment Variables:** Function runtime relies on Supabase CLI injecting variables from `supabase/.env.local`. Ensure correct **local** (not hosted) keys are present. Direct loading within function code was unreliable due to Docker pathing.
*   **Deno Test Leaks:** `fetch` calls in tests must have their response bodies consumed (`await res.json()`, `.text()`) or closed (`await res.body?.cancel()`) to avoid resource leak errors.
*   **Profile Auto-Creation:** Local Supabase setup automatically creates `user_profiles` rows. Tests modifying profiles must use `update` after initial user creation.
*   **Back-testing/Regression:** Refactoring or changes require re-running affected unit/integration tests. Unit tests need updating post-integration changes.

---

*   **Phase 1: Backend (`supabase/`)**
    *   **1.1 Unit/Narrow Integration Tests:**
        *   **Status:** Most initially completed, but require review due to integration findings/refactoring.
        *   **Framework:** Deno Standard Library
        *   **Functions Tested:**
            *   [✅] `register/`
            *   [⚠️] `login/` *(Requires review/update due to DI usage & serve call)*
            *   [🚫] `sync-stripe-plans/` *(Test errors previously noted, likely needs significant review post-Stripe implementation)*
            *   [🚫] `stripe-webhook/` *(Test errors previously noted, needs review post-Stripe implementation)*
            *   [✅] `reset-password/`
            *   [❓] `session/` *(Not explicitly tested? Verify existence/need)*
            *   [❓] `refresh/` *(Not explicitly tested? Verify existence/need)*
            *   [⚠️] `me/` *(Requires review/update due to DI usage)*
            *   [❓] `profile/` *(Not explicitly tested? Verify existence/need, overlaps with `me`?)*
            *   [❓] `logout/` *(Not explicitly tested? Verify existence/need)*
            *   [✅] `api-subscriptions/`
            *   [⚠️] `_shared/auth.ts` *(Requires review/update)*
            *   [⚠️] `_shared/cors-headers.ts` *(Requires review/update)*
            *   [✅] `_shared/stripe-client.ts`
            *   [❓] `test-auth.ts` *(Purpose unclear, review/remove?)*
        *   **Task:** `[🚧] **Review and update all [⚠️] unit tests** based on integration test findings and refactoring.`
    *   **1.2 Integration Tests:**
        *   [✅] **Environment Setup:** Local Supabase environment configured (`config.toml`, `.env.local`). Test utilities created (`_shared/test-utils.ts`).
        *   [🚧] **Function Integration (Auth):** Test key auth endpoints against local Supabase.
            *   [✅] `/login` (Tests passing, function **requires `serve` call update**)
            *   [🚧] **Task:** Update `serve` call in `login/index.ts` & re-run tests.
            *   [✅] `/me` (Tests passing)
            *   [✅] `/register`
            *   [✅] `/reset-password`
            *   [✅] `/session`
            *   [✅] `/refresh`
            *   [⚠️] `/logout` *(Endpoint callable, but token invalidation side-effect unverified locally)*
        *   [ ] **Function Integration (Profile):**
            *   [✅] `/profile/<userId>`
        *   [ ] **Function Integration (Stripe):**
            *   [ ] `/api-subscriptions` (Create, Get, Update, Delete)
            *   [ ] `stripe-webhook` (Simulate events via Stripe CLI)
            *   [ ] `sync-stripe-plans` (If requires direct invocation/testing)
        *   [ ] **Database Integration:** Use `supabase test db` to validate migrations and RLS policies.
        *   [ ] **Stripe Integration:** Test against Stripe's test environment API and webhooks.
    *   **1.3 Final Validation & Lockdown:**
        *   [ ] **Task:** After all Phase 1.1 unit tests are reviewed/updated and Phase 1.2 integration tests pass, add comments to function code indicating validation status and advising caution for future changes without repeating testing phases.

*   **Phase 2: Shared Packages (`packages/`)**
    *   **2.1 Unit Tests:**
        *   [ ] `packages/api-client` (Vitest + MSW recommended).
        *   [ ] `packages/store` (Vitest recommended).
        *   [ ] `packages/ui-components` (Vitest + RTL recommended).
        *   [ ] `packages/types` (Implicitly tested).
        *   [ ] `packages/utils` (Vitest recommended).

*   **Phase 3: Web App (`apps/web/`)**
    *   **3.1 Unit Tests:**
        *   [ ] `apps/web/src` (Components, hooks, pages - Vitest + RTL recommended).
    *   **3.2 Integration Tests:**
        *   [ ] **Component Integration:** Test interactions between composed components.
        *   [ ] **API Integration (Mocked):** Test data fetching against MSW.
    *   **3.3 End-to-End Tests:**
        *   [ ] **Tooling:** Setup Playwright/Cypress.
        *   [ ] **Core User Flows:** Auth cycle, Profile management.
        *   [ ] **Payment Flows:** Subscription creation, Portal management.

*   **Phase 4: CI/CD**
    *   [ ] Setup CI pipeline (e.g., GitHub Actions).
    *   [ ] Configure pipeline for Phase 1.1 tests.
    *   [ ] Configure pipeline for Phase 2.1 tests.
    *   [ ] Configure pipeline for Phase 3.1 tests.
    *   [ ] (Optional): Configure Phase 1.2 tests.
    *   [ ] (Optional): Configure Phase 3.3 tests.
    *   [ ] Configure deployment steps.
---

**Current Focus / Immediate Next Steps:**

1.  **Integration Testing for `/api-subscriptions`** (`supabase/functions/api-subscriptions/`).
2.  **Integration Testing for `/profile`** (if necessary, depends on overlap with `/me`).
3.  **(Parallel Option):** Work on Database Integration tests (`supabase test db`) or Stripe Integration tests.
4.  **(Later Task):** Review and update affected Unit Tests (Phase 1.1).
5.  **(Final Backend Task):** Perform Phase 1.3 Validation & Lockdown.

### Function: `profile`
-   **Goal**: Allow authenticated users to fetch public profile data for *any* user ID.
-   **Endpoint**: `GET /profile/<userId>`
-   **Status**:
    -   Unit Tests: [ ]
    -   Integration Tests: [✅] /profile/<userId>
    -   End-to-end Tests: [ ]
-   **Notes**: Requires authenticated user (valid JWT). Fetches data from `user_profiles` table based on `<userId>` path parameter. Uses RLS policy `Allow authenticated read access`. 