
## Multi-Provider AI Integration (Anthropic, Google First)

**Goal:** Extend the AI chat functionality to support multiple providers (starting with Anthropic and Google) and automatically sync their available models to the database, ensuring the frontend only displays usable models.

**Phase 1: Database Schema Update**

*   [✅] **Add `provider` Column:**
    *   [✅] Create migration file (`supabase/migrations/YYYYMMDDHHMMSS_add_provider_to_ai_providers.sql`) adding `provider` (text, nullable initially) and index to `public.ai_providers`.
    *   [✅] Add SQL to backfill existing rows (e.g., `provider = 'openai'`). Consider making column `NOT NULL` after backfill.
*   [✅] **Apply & Test:**
    *   [✅] Apply migration (`supabase db reset` local).
    *   [✅] **TEST:** Verify schema change with `supabase test db`.
    *   [✅] Update DB types (`supabase gen types typescript --local > supabase/functions/types_db.ts`).
    *   [✅] **COMMIT:** `feat(db): Add provider column to ai_providers table`

**Phase 2: Backend - Shared Adapters & Factory**

*   **Goal:** Create reusable adapters for interacting with provider APIs and a factory to select the correct one.
*   **Location:** `supabase/functions/_shared/ai_service/` (new directory)
*   **Checklist:**
    *   [✅] **Define `AiProviderAdapter` Interface (`packages/types/src/ai.types.ts`):**
        *   [✅] Define methods: `sendMessage(...)`, `listModels(...)`. Define `ProviderModelInfo`. Update `ChatMessage` if needed.
    *   [✅] **Create `_shared/ai_service/openai_adapter.ts`:**
        *   [✅] Refactor existing OpenAI chat logic into adapter, implementing `AiProviderAdapter`.
        *   [✅] Implement `listModels`.
        *   [✅] **TEST:** Unit tests written, passing. (`openai_adapter.test.ts`)
    *   [✅] **Create `_shared/ai_service/anthropic_adapter.ts`:**
        *   [✅] Implement `AiProviderAdapter` using Anthropic API. Read `ANTHROPIC_API_KEY`. (Note: `listModels` is hardcoded).
        *   [🚧] **TEST:** Unit tests written. Most pass, but `History Ends With Assistant (Invalid Format)` case needs revisit due to complex interaction between test data and validation logic. (`anthropic_adapter.test.ts`) *(Decision: Defer final fix)*.
    *   [✅] **Create `_shared/ai_service/google_adapter.ts`:**
        *   [✅] Implement `AiProviderAdapter` using Google Gemini API. Read `GOOGLE_API_KEY`.
        *   [✅] **TEST:** Unit tests written, passing. (`google_adapter.test.ts`)
    *   [✅] **Create `_shared/ai_service/factory.ts`:**
        *   [✅] Create `getAiProviderAdapter(provider: string)`. Return correct adapter instance based on string or null.
        *   [✅] **TEST:** Unit tests written, passing. (`factory.test.ts`) *
    *   [✅] **Build & Commit:** *(Pending test resolution/deferral)*
        *   [✅] **BUILD:** Ensure backend (`supabase functions build <func_name>`) or relevant packages build successfully.
        *   [✅] **COMMIT:** `feat(backend): Implement AI provider adapters and factory`
    *   *Lesson Learned:* Testing pre-flight validation logic requires careful test case design to ensure the intended code path is triggered before mocked API calls are made, especially when input data might interact with the validation logic itself.

**Phase 3: Backend - Refactor Core Functions**

*   **Goal:** Update existing Edge Functions to use the new adapters and filtering logic.
*   **Checklist:**
    *   [✅] **Refactor `/chat/index.ts`:**
        *   [✅] Fetch model details (incl. `provider`). Use factory to get adapter. Get API key based on provider. Call `adapter.sendMessage`.
        *   [✅] **TEST:** Update/pass unit tests.
    *   [✅] **Refactor `/ai-providers/index.ts`:**
        *   [✅] Fetch `is_active` models. Check env vars (`OPENAI_API_KEY`, etc.). Filter models based on `provider` and corresponding set API key. Return filtered list.
        *   [✅] **TEST:** Update/pass unit tests.
    *   [✅] **Build, Run & Commit:**
        *   [✅] **BUILD:** Ensure backend functions build.
        *   [✅] **RUN:** Manually test `/chat` and `/ai-providers` locally with relevant API keys set.
        *   [✅] **COMMIT:** `refactor(backend): Update chat and ai-providers functions to use adapters`

**Phase 4: Backend - Refactor & Implement Model Sync Function**

*   **Goal:** Refactor `sync-ai-models` to use a router pattern and implement sync logic for new providers.
*   **Location:** `supabase/functions/sync-ai-models/`
*   **Checklist:**
    *   [ ] **Create Provider Subfolders:** *(Not implemented as planned - provider files placed directly in `sync-ai-models/`)*
    *   [✅] **Move/Create Provider Logic:** *(Provider logic files `openai_sync.ts`, `anthropic_sync.ts`, `google_sync.ts` created directly in `sync-ai-models/`)*
        *   [✅] `openai_sync.ts` implemented.
        *   [✅] `anthropic_sync.ts` implemented.
        *   [✅] `google_sync.ts` implemented.
        *   [✅] **TEST:** Unit tests written/passed for each provider's `sync<Provider>Models` function.
    *   [✅] **Refactor `sync-ai-models/index.ts` (Router):**
        *   [✅] Defined supported providers & keys.
        *   [✅] Imported `sync<Provider>Models` functions.
        *   [✅] Implemented handler iterating through providers, checking keys, calling sync funcs.
        *   [✅] **TEST:** Unit tests written/passed for the router logic.
    *   [✅] **Add Env Vars:** Add `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` to `.env.example`. *(Needs confirmation/action)*
    *   [✅] **Build, Run & Commit:**
        *   [✅] **BUILD:** Ensure `sync-ai-models` function builds.
        *   [✅] **RUN:** Invoke function locally (`supabase functions invoke sync-ai-models`) with keys set. Verify DB updates for all configured providers. Test idempotency.
        *   [✅] **COMMIT:** `refactor(backend): Refactor sync-ai-models with provider logic and add Anthropic/Google sync`
    *   [ ] **Schedule Function:** *(Manual setup via Dashboard UI required, see DEV_PLAN.md)*

**Phase 5: Frontend Integration & Testing**

*   **Goal:** Ensure the frontend correctly displays and uses the new providers/models.
*   **Checklist:**
    *   [✅] **Verify `ModelSelector.tsx`:** Confirm it displays the filtered list from updated `/ai-providers` endpoint. (Should require no changes).
    *   [✅] **Manual Testing:**
        *   Add Anthropic/Google API keys to `.env`. Restart backend/frontend.
        *   Run `sync-ai-models`. Verify new models appear in `ModelSelector`.
        *   Test sending messages using OpenAI, Anthropic, and Google models.
    *   [✅] **Build, Run & Commit:**
        *   [✅] **BUILD:** Ensure frontend (`apps/web`) builds successfully.
        *   [✅] **RUN:** Verify manual tests pass in running application.
        *   [ ] **COMMIT:** `feat(ai): Integrate multi-provider support in frontend`
    *   [ ] **Update E2E Tests:** Add tests covering model selection and chat interaction with the new providers.
    *   [ ] **Test E2E:** Run and pass E2E tests.
    *   [ ] **Final Commit:** `test(e2e): Add multi-provider AI tests`