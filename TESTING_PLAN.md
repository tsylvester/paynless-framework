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
        *   **Status:** Most initially completed, **require review** due to integration findings/refactoring.
        *   [⚠️] `login/`, `me/`, `_shared/auth.ts`, `_shared/cors-headers.ts` need review.
        *   [🚫] Stripe functions need review post-implementation.
        *   [❓] `session/`, `refresh/`, `profile/`, `logout/`, `test-auth.ts` need verification/review.
        *   **Task:** `[🚧] **Review and update all [⚠️]/[❓] unit tests.**`
    *   **1.2 Integration Tests:**
        *   [✅] **Environment Setup:** Done.
        *   [ ] **Task (Postponed): Resolve Local Runtime Auth Issue** *(Workaround found: Use `[functions.<name>] verify_jwt = false` in `config.toml` for non-JWT functions)*.
        *   [✅] **Function Integration (Auth):**
            *   [✅] `/login` (Serve call updated, tests passing)
            *   [✅] `/me` (Tests passing)
            *   [✅] `/register` (Config updated, tests passing)
            *   [ ] `/reset-password`
            *   [ ] `/session`, `/refresh`, `/logout` (If applicable)
        *   [ ] **Function Integration (Profile):**
            *   [ ] `/profile` (If applicable)
        *   [ ] **Function Integration (Stripe):**
            *   [ ] `/api-subscriptions` (Create, Get, Update, Delete)
            *   [ ] `stripe-webhook`
            *   [ ] `sync-stripe-plans`
        *   [ ] **Database Integration:** (`supabase test db`).
        *   [ ] **Stripe Integration:** (Test environment).

*   **Phase 2: Shared Packages (`packages/`)**
    // ... unchanged ...
*   **Phase 3: Web App (`apps/web/`)**
    // ... unchanged ...
*   **Phase 4: CI/CD**
    // ... unchanged ...

---

**Current Focus / Immediate Next Steps:**

1.  **Integration Testing for `/reset-password`** (`supabase/functions/reset-password/`).
2.  **(Parallel Option):** Work on Database Integration tests (`supabase test db`) or Stripe Integration tests.
3.  **(Later Task):** Review and update affected Unit Tests (Phase 1.1). 