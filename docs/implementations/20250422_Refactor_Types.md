
### 2.3 Refactor to Centralized Supabase DB Types

*   [X] **Setup Internal Types Package:**
    *   [X] Create a minimal `package.json` file in `supabase/functions/` with the content:
        ```json
        {
          "name": "@paynless/db-types",
          "version": "0.0.0",
          "private": true,
          "types": "./types_db.ts"
        }
        ```
        *(Note: This file only defines the package for type resolution; it does not make `supabase/functions` buildable)*.
    *   [X] Add `"supabase/functions"` to the `workspaces` array in the root `pnpm-workspace.yaml`.
    *   [X] Run `pnpm install` in the workspace root to link the new internal package.
*   [X] **Generate Up-to-Date DB Types:**
    *   [X] Ensure your local Supabase instance is running (`supabase start`).
    *   [X] Run the Supabase CLI command to regenerate the types file, capturing all recent migrations (including `organizations`, `organization_members`, `notifications`, etc.):
        ```bash
        supabase gen types typescript --local > supabase/functions/types_db.ts
        ```
    *   [X] Verify the generated `supabase/functions/types_db.ts` contains definitions for all expected tables (`organizations`, `organization_members`, `notifications`, `user_profiles`, etc.) and enums (`user_role`, etc.).
*   [X] **Add Dependency:**
    *   [X] Add the internal types package as a development dependency to packages that need DB types:
        ```bash
        pnpm add -D @paynless/db-types@workspace:* --filter=@paynless/api --filter=@paynless/store --filter=web
        ```
    *   [X] Add the internal types package as a development dependency to `@paynless/types` package itself to aid TS resolution:
        ```bash
        pnpm add -D @paynless/db-types@workspace:* --filter=@paynless/types
        ```
*   [X] **Refactor Codebase:**
    *   [X] **Identify Redundant Types:** Review files in `packages/types/src`. Primarily target types duplicating table structures or enums now present in `@paynless/db-types`:
        *   `auth.types.ts`: `UserProfile`, `UserRole`.
        *   `notification.types.ts`: `Notification`.
        *   `subscription.types.ts`: `SubscriptionPlan`, `UserSubscription`, `SubscriptionTransaction`.
        *   `ai.types.ts`: `AiProvider`, `SystemPrompt`, `Chat`, `ChatMessage`, local `Json` alias.
    *   [X] **Update Imports & Usage (in `@paynless/types`):**
        *   Refactored `auth.types.ts` (removed redundant, updated `User`, used DB types).
        *   Refactored `notification.types.ts` (removed manual, used alias).
        *   Refactored `subscription.types.ts` (removed manual DB types, used aliases, moved in API types from `_shared`).
        *   Refactored `ai.types.ts` (removed manual DB types, used aliases, removed `Json`, updated API/Store types).
        *   Updated `organizations.types.ts` to import `@paynless/db-types`.
    *   [X] **Update Imports & Usage (in `supabase/functions`):**
        *   Corrected `supabase/functions/_shared/types.ts` to only contain necessary *application-level* types (removing DB duplicates).
        *   Updated imports in relevant function files (`email_service`, `ai_service`, `sync-ai-models`, `on-user-created`, `notifications`, `chat`, `api-subscriptions`) to use relative paths `../_shared/types.ts` for App types or `../types_db.ts` for DB types.
*   [X] **Cleanup:**
    *   [X] Delete the now-unused manual type definitions (e.g., `UserProfile`, `UserRole`, `Notification`, `SubscriptionPlan`, etc.) from the files in `packages/types/src`.
*   [X] **Create Sync Script:**
    *   [X] Implement script (`supabase/scripts/sync-supabase-shared-types.mjs`) to automatically copy necessary application-level types from `packages/types/*` into `supabase/functions/_shared/types.ts`.
    *   [X] Add the script command `sync:types` to root `package.json`.
*   [X] **Verification:**
    *   [X] Run TypeScript checks across the monorepo: `pnpm typecheck` (or equivalent `tsc -b` command). Fix any type errors.
        *   **Status:** Known failures due to planned but unimplemented code in `packages/api` (Phase 2.4). 
    *   [X] Run all existing tests: `pnpm test`. Ensure tests pass after refactoring. Address any failures, potentially updating mocks to reflect the new type structures if necessary.
        *   **Status:** `@paynless/store` tests passed after fixing `UserRole` mock references. `apps/web` tests have known failures unrelated to this refactor or requiring broader updates (deferred).
*   [X] **Commit:** `refactor: centralize database types using supabase gen types (#issue_number)`

