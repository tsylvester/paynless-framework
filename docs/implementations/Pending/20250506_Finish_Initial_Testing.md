*   **Phase 1: Backend (`supabase/`)**
    *   **1.1 Unit Tests:**
        *   **Status:** Most core function unit tests passing. AI function tests added.
        *   **Framework:** Deno Standard Library
        *   **Functions/Modules Tested:**
            *   [✅] `login/`
            *   [✅] `logout/`
            *   [✅] `me/`
            *   [✅] `profile/`
            *   [✅] `refresh/`
            *   [✅] `register/`
            *   [✅] `reset-password/`
            *   [✅] `session/`
            *   [✅] `ping/`
            *   [✅] `api-subscriptions/handlers/checkout.ts`
            *   [?] `api-subscriptions/` (Other handlers)
                *   [✅] Implement `handlers/billing-portal.ts`
                *   [✅] Unit Test `handlers/billing-portal.ts`
                *   [✅] Implement/Verify `handlers/subscription.ts` (cancel/resume)
                *   [✅] Unit Test `handlers/subscription.ts`
                *   [✅] Review/Test `handlers/plans.ts`
                *   [✅] Review/Test `handlers/current.ts`
                *   [✅] Review/Test `handlers/usage.ts`
            *   [✅] `stripe-webhook/`
                *   [✅] Implement handling for key events (checkout complete, sub updated, etc.)
                *   [✅] Unit test webhook handler logic & signature verification
            *   [✅] **AI Chat Functions:**
                *   [✅] Unit Test `ai-providers/index.ts` (Mock Supabase client)
                *   [ ] Unit Test `system-prompts/index.ts` (Mock Supabase client) *(Pending)*
                *   [✅] **Unit Test `chat/index.ts`:**
                *   [✅] Unit Test `chat-history/index.ts`
                *   [✅] Unit Test `chat-details/index.ts`
            *   **[NEW] Email Marketing Sync:**
                *   [✅] `_shared/email_service/kit_service.ts` (Mock fetch, env vars)
                *   [✅] `_shared/email_service/no_op_service.ts`
                *   [✅] `_shared/email_service/factory.ts` (Checked type returns)
                *   [✅] `on-user-created/index.ts` (Tested handler logic via DI)
            *   [⏸️] `sync-stripe-plans/` *(Unit tests exist but ignored locally due to Supabase lib type resolution errors. Pending deployed testing.)*
            *   [⏸️] `sync-ai-models/` *(Placeholder - No tests needed yet)*
            *   [✅] `_shared/auth.ts`
            *   [✅] `_shared/cors-headers.ts`
            *   [✅] `_shared/responses.ts`
            *   [✅] `_shared/stripe-client.ts` *(Partially tested, webhook verify pending)*
            *   [⏸️] `_shared/supabase.mock.ts` *(Deferred - implicitly tested via integration tests)*
            *   [❓] `test-auth.ts` *(Purpose unclear, review/remove?)*
        *   **Task:** `[🚧] Complete implementation and unit tests for [ ], [?], and [❓] items above.`
    *   **1.2 Integration Tests:**
        *   [✅] **Environment Setup:** Local Supabase environment configured (`config.toml`, `.env.local`).
        *   **Function Integration (Auth & Profile):** (All ✅)
        *   [⏸️] **Function Integration (Stripe - API Endpoints):** *(Local Integration Blocked due to env var issue - Test in deployed env.)*
            *   `[⏸️]` `/api-subscriptions/checkout`
            *   `[ ]` `/api-subscriptions/billing-portal` 
            *   `[ ]` `/api-subscriptions/.../cancel` 
            *   `[ ]` `/api-subscriptions/.../resume` 
            *   `[?]` `/api-subscriptions/plans`
            *   `[?]` `/api-subscriptions/current`
            *   `[?]` `/api-subscriptions/usage/:metric`
        *   [🚧] **Function Integration (AI Chat):**
            *   [✅] `/ai-providers`
            *   [✅] `/system-prompts`
            *   [🚧] `/chat`: (Existing issues remain) **Add manual `curl`/Postman tests** for:
            *   [✅] `/chat-history`
            *   [✅] `/chat-details/:chatId`
        *   [⏸️] **Function Integration (Stripe - Webhook):** *(Test in deployed env)*
        *   [⏸️] `sync-stripe-plans` *(Needs Integration Test - Requires deployed env)*
        *   [⏸️] `sync-ai-models` *(Needs Integration Test - Requires deployed env)*
        *   [ ] **Database Integration:** Use `supabase test db` to validate migrations and RLS policies. *(RLS policies for AI tables need verification)*
        *   [❓] **Stripe Integration:** Test against Stripe's test environment API and webhooks.
        *   [ ] **Email Marketing Sync:**
            *   [ ] **`on-user-created` Function Integration:**
                *   [ ] Test user registration flow triggering the hook.
                *   [ ] Case 1 (Kit Disabled): Verify no attempt to call Kit API is made (check logs).
                *   [ ] Case 2 (Kit Enabled): Verify the Kit API *is* called (requires test Kit account/API key/form ID, or mock endpoint). Check for subscriber in Kit.
            *   [ ] **Supabase Auth Hook Configuration:** Verify `on-user-created` is configured as an Auth Hook in `config.toml` and functions in deployed env.
    *   **1.3 Automation:**
        *   [ ] Implement script (`create-hooks.ts`?) using Supabase Management API to automate Auth Hook creation based on a config file.
    *   **1.4 Final Validation & Lockdown:**
        *   [ ] **Task:** Add comments to function code indicating validation status.

*   **Phase 2: Shared Packages (`packages/`)**
    *   **2.1 Unit Tests:**
        *   [✅] `packages/api` (All sub-clients: `apiClient`, `stripe.api`, `ai.api` tests passing)
        *   [✅] `packages/store` (Vitest setup complete)
            *   [✅] `authStore.ts` (All actions covered across multiple `authStore.*.test.ts` files)
                *   **NOTE:** Replay logic tests (in `register.test.ts`, `login.test.ts`) and session/state restoration tests (in `initialize.test.ts`) related to `_checkAndReplayPendingAction` and the `initialize` action are currently unreliable/skipped/adjusted due to known issues in the underlying store functions. These tests need revisiting after the functions are fixed.
                *   [✅] *(Analytics)* Verify `analytics.identify` called on login/init success.
                *   [✅] *(Analytics)* Verify `analytics.reset` called on logout.
                *   [ ] *(Analytics)* Verify `analytics.track('Signed Up')` called on register success.
                *   [ ] *(Analytics)* Verify `analytics.track('Logged In')` called on login success.
                *   [ ] *(Analytics)* Verify `analytics.track('Profile Updated')` called on updateProfile success.
            *   [✅] `subscriptionStore.ts` *(Tests passing, including refresh failures in cancel/resume)*
                *   [ ] *(Analytics)* Verify `analytics.track('Subscription Checkout Started')` called on createCheckoutSession success.
                *   [ ] *(Analytics)* Verify `analytics.track('Billing Portal Opened')` called on createBillingPortalSession success.
            *   [✅] `aiStore.ts` *(Status: Refactored into `aiStore.*.test.ts` files. All tests passing after fixing mock strategy and store logic.)*
                *   [ ] *(Analytics)* Verify `analytics.track('Message Sent')` called on sendMessage success.
                *   *Note: Utilizes `vi.mocked(useAuthStore.getState).mockReturnValue` pattern for dependent store state.*
        *   [⏭️] `packages/ui-components` *(Skipped - Package empty)*.
        *   [✅] `packages/utils` (`logger.ts` tests passing)
        *   [✅] `packages/types` *(Implicitly tested via usage)*.
            *   [✅] *(Analytics)* Verify `AnalyticsClient` interface exists in `analytics.types.ts`.
        *   [✅] `packages/analytics` *(Setup Complete)*
            *   [✅] Unit Test `nullAdapter.ts` (interface compliance, callable methods).
            *   [✅] Unit Test `posthogAdapter.ts` (mock `posthog-js`, verify calls to `init`, `identify`, `capture`, `reset`, etc.).
            *   [✅] Unit Test `index.ts` (service logic: verify null adapter default [✅], verify PostHog selection [✅]).
        *   [ ] `packages/utils` or `packages/platform`: Unit test `platformCapabilitiesService` (mock platform detection).
        *   [ ] Unit test TypeScript capability providers (mock underlying APIs like `invoke`, Web APIs, RN Modules).
    *   **2.2 Integration Tests:** (Frontend MSW-based tests are covered in Phase 3.2)

*   **Phase 3: Web App (`apps/web/`)**
    *   **3.1 Unit Tests:**
        *   [✅] **Component Review:** `LoginForm`, `RegisterForm`, `ProfileEditor`, `SubscriptionPage`, `AiChatbox`, `ModelSelector`, `PromptSelector` exist and follow store interaction pattern.
        *   [ ] `apps/web/src/components/ai/` *(Unit test new AI components)*
        *   [🚧] Other `apps/web/src/` Components/Pages/Hooks: *(Status needs re-evaluation)*
        *   [ ] Components using `platformCapabilitiesService`: Mock the service to test conditional rendering and logic for different platforms/capabilities.
    *   **3.2 Integration Tests (MSW):**
        *   [✅] **Refactoring Complete:** Structure standardized, utilities/handlers consolidated.
        *   [🚧] **API Integration (Mocked):** Key user flows tested with MSW.
            *   **Authentication (`auth.integration.test.tsx`):**
                *   `[✅]` Login: Success, Invalid Credentials, Server Error.
                *   `[✅]` Register: Success, Email Exists, Server Error.
                *   `[ ]` Logout (Manually tested as working, integration test not implemented)
                *   `[ ]` Session Load/Refresh (Manually tested as working, integration test not implemented)
                *   `[ ]` Password Reset 
                *   `[ ]` Register -> Redirect to Chat (Test handling of `redirectTo` from `authStore`)
            *   **Profile Management (`profile.integration.test.tsx`):**
                *   `[✅]` Profile Load: Data displayed in editor.
                *   `[✅]`

*   **Phase 4: End-to-End Validation**
    *   **[NEW] User Registration with Email Sync:**
        *   [ ] Case 1 (Kit Disabled): Register via UI. Verify user created, NO user added to Kit list.
        *   [ ] Case 2 (Kit Enabled): Configure E2E env with Kit credentials. Register via UI. Verify user created AND user appears in Kit list/form.

        
## Testing Plan: Multi-Provider AI Integration

*   **Phase 1: Backend Unit Tests**
    *   [✅] **DB Migration:** Test `YYYYMMDDHHMMSS_add_provider_to_ai_providers.sql` using `supabase test db`.
    *   [✅] **Adapters (`_shared/ai_service/*_adapter.ts`):**
        *   [✅] OpenAI (`openai_adapter.test.ts`): Tests passing.
        *   [🚧] Anthropic (`anthropic_adapter.test.ts`): Most tests passing. `History Ends With Assistant (Invalid Format)` case deferred due to complex interaction between test data and validation logic (failsafe error not triggering as expected). Needs revisit.
        *   [✅] Google (`google_adapter.test.ts`): Tests passing.
    *   [✅] **Factory (`_shared/ai_service/factory.ts`):** Tests passing.
    *   [✅] **`/chat/index.ts`:**
        *   Mock factory, DB client, env vars.
        *   Test routing to correct adapter based on fetched provider.
        *   Test error handling (model not found, adapter error, etc.).
    *   [✅] **`/ai-providers/index.ts`:**
        *   Mock DB client, env vars.
        *   Test filtering logic (models returned only if API key env var set).
        *   Test empty list if no keys set.
    *   [🚧] **`sync-ai-models/` (Provider Logic):**
        *   [✅] `google_sync.ts` (Mock provider adapter, Supabase client; Test INSERT, UPDATE, DEACTIVATE, Error Handling)
        *   [✅] `anthropic_sync.ts` (Mock provider adapter, Supabase client; Test INSERT, UPDATE, DEACTIVATE, Error Handling)
        *   [✅] `openai_sync.ts` (Mock provider adapter, Supabase client; Test INSERT, UPDATE, DEACTIVATE, Error Handling)
    *   [✅] **`sync-ai-models/index.ts` (Router):**
        *   Mock provider `sync<Provider>Models` functions, env vars.
        *   Test calling correct sync functions based on set keys.

*   **Phase 2: Backend Integration Tests (Local & Deployed)**
    *   [ ] **`/ai-providers`:** Test endpoint returns correctly filtered list based on local `.env` keys.
    *   [ ] **`/chat`:** Test sending messages via different configured providers (requires API keys in local `.env`).
    *   [ ] **`sync-ai-models` (Manual Invocation):**
        *   Manually invoke function (`supabase functions invoke sync-ai-models`, requires API keys configured in Supabase project secrets).
        *   Verify database changes (new/updated/deactivated models).
        *   Test idempotency (running again should ideally result in no changes or expected updates).
    *   [ ] **Cron Job (Manual Setup / Deferred):** *(No automated cron setup currently. Verification requires manual setup via Dashboard or is deferred until automation is possible).* 

*   **Phase 3: Frontend Integration Tests (MSW)**
    *   [✅] **`ModelSelector.tsx`:** Mock `/ai-providers` response. Test component renders the correct list.
    *   [✅] **`AiChatbox.tsx` / `aichat.tsx`:** Mock `/chat` response. Test sending message results in correct API call (verify payload).

*   **Phase 4: End-to-End Validation**
    *   [ ] Manually configure API keys (OpenAI, Anthropic, Google).
    *   [ ] Run `sync-ai-models`.
    *   [ ] Start web app.
    *   [ ] Verify `ModelSelector` shows models from all configured providers.
    *   [ ] Send messages using models from each provider; verify success.
    *   [ ] Remove an API key, restart backend, refresh frontend. Verify corresponding models disappear.
    *   [ ] Add E2E tests (Playwright/Cypress) covering model selection and chat for each provider.

---