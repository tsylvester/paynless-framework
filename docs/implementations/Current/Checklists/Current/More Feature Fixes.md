[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement


## Objectives

## Expected Outcome


# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## Chat to Project

*   `[✅]`   [UI] apps/web/src/utils/formatChatMessagesAsPrompt **Format selected chat messages into a project initial prompt string**
  *   `[✅]`   `objective`
    *   `[✅]`   Create a pure utility function that accepts `ChatMessage[]` and returns a single formatted `string` suitable for `CreateProjectPayload.initialUserPrompt`
    *   `[✅]`   Output format is a structured conversation transcript: each message prefixed with its capitalised role label (`User:`, `Assistant:`, `System:`), messages separated by double newlines
    *   `[✅]`   Empty input array returns empty string
    *   `[✅]`   Messages are emitted in the order received (chronological, matching the array order from `selectSelectedChatMessages`)
  *   `[✅]`   `role`
    *   `[✅]`   App layer utility — pure formatting function bridging AI chat messages to dialectic project input
  *   `[✅]`   `module`
    *   `[✅]`   Chat-to-Project bridge: message content formatting
    *   `[✅]`   Boundary: receives `ChatMessage[]` (AI chat domain), produces `string` (dialectic project domain `initialUserPrompt`)
  *   `[✅]`   `deps`
    *   `[✅]`   `ChatMessage` from `@paynless/types` — domain type, `Database['public']['Tables']['chat_messages']['Row'] & { status?: ... }` — fields used: `role: string`, `content: string`
    *   `[✅]`   Confirm no reverse dependency is introduced — pure function with no store, hook, or side-effect imports
  *   `[✅]`   `context_slice`
    *   `[✅]`   Input: `ChatMessage[]` — only `role` and `content` fields are read
    *   `[✅]`   Output: `string` — formatted transcript
    *   `[✅]`   No store reads, no side effects, no concrete imports from higher or lateral layers
  *   `[✅]`   unit/`apps/web/src/utils/formatChatMessagesAsPrompt.test.ts`
    *   `[✅]`   Test: returns empty string when input array is empty
    *   `[✅]`   Test: single user message formats as `"User: <content>"`
    *   `[✅]`   Test: single assistant message formats as `"Assistant: <content>"`
    *   `[✅]`   Test: single system message formats as `"System: <content>"`
    *   `[✅]`   Test: multiple messages are separated by double newlines (`\n\n`)
    *   `[✅]`   Test: preserves message order (chronological)
    *   `[✅]`   Test: capitalises the first letter of the role label regardless of input casing
    *   `[✅]`   Test: preserves multi-line content within a single message
    *   `[✅]`   Test: handles unknown role values gracefully (uses role as-is with capitalisation)
  *   `[✅]`   `construction`
    *   `[✅]`   Signature: `export function formatChatMessagesAsPrompt(messages: ChatMessage[]): string`
    *   `[✅]`   No class, no factory — single exported function
    *   `[✅]`   Pure function — no side effects, no closures over external state
  *   `[✅]`   `formatChatMessagesAsPrompt.ts`
    *   `[✅]`   Import `ChatMessage` from `@paynless/types`
    *   `[✅]`   Map each message: capitalise `message.role` → label, concatenate `"${label}: ${message.content}"`
    *   `[✅]`   Join mapped strings with `"\n\n"`
    *   `[✅]`   Return joined string, or empty string if array is empty
  *   `[✅]`   `directionality`
    *   `[✅]`   App layer (utility)
    *   `[✅]`   Dependencies inward: `ChatMessage` type from domain layer
    *   `[✅]`   Provides outward: formatting function to `CreateProjectFromChatButton` (UI layer consumer)
  *   `[✅]`   `requirements`
    *   `[✅]`   Function is pure — no store reads, no side effects
    *   `[✅]`   Output is human-readable and preserves the conversational structure
    *   `[✅]`   Empty input produces empty string (not null, not undefined)
    *   `[✅]`   All unit tests pass
    *   `[✅]`   `apps/web/src/utils/` directory created if it does not exist

*   `[✅]`   [UI] apps/web/src/components/ai/CreateProjectFromChatButton **Create Project button that feeds selected chat messages into autostart**
  *   `[✅]`   `objective`
    *   `[✅]`   Create a self-contained React button component that gathers the user's selected chat messages, formats them as `initialUserPrompt`, resolves a domain, derives a project name, and calls the existing `createProjectAndAutoStart` store action
    *   `[✅]`   On success, navigates to `/dialectic/${projectId}/session/${sessionId}` with `state: { autoStartGeneration: true }` — identical to the navigation path used by `CreateDialecticProjectForm`
    *   `[✅]`   On success with no default models (`hasDefaultModels: false`), navigates to `/dialectic/${projectId}` so the user can configure manually
    *   `[✅]`   Shows progressive loading state via `isAutoStarting` and `autoStartStep` from the dialectic store
    *   `[✅]`   Disabled when no messages are selected, when already auto-starting, or when domain resolution fails
    *   `[✅]`   No duplication: calls the same `createProjectAndAutoStart` action that `CreateDialecticProjectForm` calls — no new store actions, no new types, no parallel orchestration logic
  *   `[✅]`   `role`
    *   `[✅]`   UI layer — cross-store bridge component connecting AI chat to dialectic project creation
  *   `[✅]`   `module`
    *   `[✅]`   AI chat interface: project creation action trigger
    *   `[✅]`   Boundary: reads selected messages from AI store, reads domain and autostart state from dialectic store, calls dialectic store action, navigates via `react-router-dom`
  *   `[✅]`   `deps`
    *   `[✅]`   `formatChatMessagesAsPrompt` from `@/utils/formatChatMessagesAsPrompt` — Node 1, app layer, formats `ChatMessage[]` → `string`
    *   `[✅]`   `useAiStore` from `@paynless/store` — AI store hook (app layer)
    *   `[✅]`   `selectSelectedChatMessages` from `@paynless/store` — selector returning `ChatMessage[]` of user-selected messages (app layer)
    *   `[✅]`   `selectCurrentChatSelectionState` from `@paynless/store` — selector returning `'all' | 'some' | 'none' | 'empty'` for disable logic (app layer)
    *   `[✅]`   `useDialecticStore` from `@paynless/store` — dialectic store hook (app layer)
    *   `[✅]`   `selectDomains` from `@paynless/store` — selector returning `DialecticDomain[]` (app layer)
    *   `[✅]`   `selectSelectedDomain` from `@paynless/store` — selector returning `DialecticDomain | null` (app layer)
    *   `[✅]`   `CreateProjectPayload` from `@paynless/types` — `{ projectName: string; initialUserPrompt?: string | null; selectedDomainId: string; ... }` (domain layer)
    *   `[✅]`   `CreateProjectAutoStartResult` from `@paynless/types` — return type from `createProjectAndAutoStart` (domain layer)
    *   `[✅]`   `useNavigate` from `react-router-dom` — navigation (infra layer)
    *   `[✅]`   `toast` from `sonner` — error feedback (infra layer)
    *   `[✅]`   `Button` from `@/components/ui/button` — UI primitive (UI layer)
    *   `[✅]`   `Loader2` from `lucide-react` — loading spinner icon (UI layer)
    *   `[✅]`   `logger` from `@paynless/utils` — logging (infra layer)
    *   `[✅]`   Confirm no reverse dependency is introduced — component reads from stores via hooks, does not write to AI store
  *   `[✅]`   `context_slice`
    *   `[✅]`   From `useAiStore`: `selectSelectedChatMessages` → `ChatMessage[]` — the messages to format
    *   `[✅]`   From `useAiStore`: `selectCurrentChatSelectionState` → `'all' | 'some' | 'none' | 'empty'` — for disable state (`'none'` or `'empty'` → disabled)
    *   `[✅]`   From `useDialecticStore`: `createProjectAndAutoStart` action, `fetchDomains` action, `isAutoStarting: boolean`, `autoStartStep: string | null`
    *   `[✅]`   From `useDialecticStore`: `selectDomains` → `DialecticDomain[]`, `selectSelectedDomain` → `DialecticDomain | null`
    *   `[✅]`   Output: navigation side effect on success, toast side effect on error
    *   `[✅]`   No concrete imports from higher or lateral layers
  *   `[✅]`   unit/`apps/web/src/components/ai/CreateProjectFromChatButton.test.tsx`
    *   `[✅]`   Test: renders a button with text "Create Project"
    *   `[✅]`   Test: button is disabled when selection state is `'none'` or `'empty'`
    *   `[✅]`   Test: button is disabled when `isAutoStarting` is `true`
    *   `[✅]`   Test: button is enabled when selection state is `'all'` or `'some'` and not auto-starting
    *   `[✅]`   Test: on click, calls `fetchDomains` if `domains` array is empty
    *   `[✅]`   Test: on click, uses `selectedDomain.id` as `selectedDomainId` when a domain is already selected
    *   `[✅]`   Test: on click, falls back to the domain named `'General'` from `domains` list when `selectedDomain` is null
    *   `[✅]`   Test: on click, shows error toast if no domain can be resolved (empty domains list, no selectedDomain)
    *   `[✅]`   Test: on click, calls `formatChatMessagesAsPrompt` with the selected messages
    *   `[✅]`   Test: on click, derives `projectName` from first user message content (first line, truncated to 50 chars)
    *   `[✅]`   Test: on click, calls `createProjectAndAutoStart` with `{ projectName, initialUserPrompt, selectedDomainId }`
    *   `[✅]`   Test: on success with `sessionId !== null` and `hasDefaultModels: true`, navigates to `/dialectic/${projectId}/session/${sessionId}` with `state: { autoStartGeneration: true }`
    *   `[✅]`   Test: on success with `sessionId !== null` and `hasDefaultModels: false`, navigates to `/dialectic/${projectId}/session/${sessionId}` without `autoStartGeneration` state
    *   `[✅]`   Test: on success with `sessionId === null`, navigates to `/dialectic/${projectId}`
    *   `[✅]`   Test: on error from `createProjectAndAutoStart`, shows error toast and remains on chat page
    *   `[✅]`   Test: displays loading spinner and `autoStartStep` text while `isAutoStarting` is `true`
    *   `[✅]`   Test: does not call `createDialecticProject` directly (only calls `createProjectAndAutoStart`)
  *   `[✅]`   `construction`
    *   `[✅]`   Signature: `export const CreateProjectFromChatButton: React.FC`
    *   `[✅]`   No props — reads all state from stores via hooks
    *   `[✅]`   Click handler is `async` — awaits `createProjectAndAutoStart`, then navigates or toasts
    *   `[✅]`   Domain resolution order: `selectedDomain?.id` → `domains.find(d => d.name === 'General')?.id` → error toast
    *   `[✅]`   Project name derivation: find first message with `role === 'user'` in selected messages, take first line of `content`, truncate to 50 chars; fallback to `'Chat Project'`
  *   `[✅]`   `CreateProjectFromChatButton.tsx`
    *   `[✅]`   Import `formatChatMessagesAsPrompt` from `@/utils/formatChatMessagesAsPrompt`
    *   `[✅]`   Import `useAiStore`, `selectSelectedChatMessages`, `selectCurrentChatSelectionState` from `@paynless/store`
    *   `[✅]`   Import `useDialecticStore`, `selectDomains`, `selectSelectedDomain` from `@paynless/store`
    *   `[✅]`   Import `useNavigate` from `react-router-dom`
    *   `[✅]`   Import `toast` from `sonner`, `logger` from `@paynless/utils`
    *   `[✅]`   Import `Button` from `@/components/ui/button`, `Loader2` from `lucide-react`
    *   `[✅]`   Import `CreateProjectPayload` from `@paynless/types`
    *   `[✅]`   Read `selectedMessages` via `useAiStore(selectSelectedChatMessages)`
    *   `[✅]`   Read `selectionState` via `useAiStore(selectCurrentChatSelectionState)`
    *   `[✅]`   Read `createProjectAndAutoStart`, `fetchDomains`, `isAutoStarting`, `autoStartStep` from `useDialecticStore`
    *   `[✅]`   Read `domains` via `useDialecticStore(selectDomains)`, `selectedDomain` via `useDialecticStore(selectSelectedDomain)`
    *   `[✅]`   Compute `isDisabled`: `selectionState === 'none' || selectionState === 'empty' || isAutoStarting`
    *   `[✅]`   Click handler:
      *   `[✅]`   If `domains.length === 0`, await `fetchDomains()`; re-read domains from `useDialecticStore.getState()`
      *   `[✅]`   Resolve `selectedDomainId`: `selectedDomain?.id ?? domains.find(d => d.name === 'General')?.id`; if null, toast error and return
      *   `[✅]`   Format `initialUserPrompt` via `formatChatMessagesAsPrompt(selectedMessages)`
      *   `[✅]`   Derive `projectName` from first user message, truncated to 50 chars, fallback `'Chat Project'`
      *   `[✅]`   Build `payload: CreateProjectPayload` with `{ projectName, initialUserPrompt, selectedDomainId }`
      *   `[✅]`   `const result = await createProjectAndAutoStart(payload)`
      *   `[✅]`   If `result.error`, `toast.error(result.error.message ?? 'Failed to create project')` and return
      *   `[✅]`   If `result.sessionId !== null`, navigate to `/dialectic/${result.projectId}/session/${result.sessionId}` with `state: { autoStartGeneration: result.hasDefaultModels }`
      *   `[✅]`   Else navigate to `/dialectic/${result.projectId}`
    *   `[✅]`   Render: `<Button>` with loading state — when `isAutoStarting`, show `<Loader2>` spinner and `autoStartStep` text; otherwise show `"Create Project"`
  *   `[✅]`   `directionality`
    *   `[✅]`   UI layer (React component)
    *   `[✅]`   Dependencies inward: utility function (app layer), store hooks and selectors (app layer), types (domain layer), UI primitives (UI layer), infra (`react-router-dom`, `sonner`, `logger`)
    *   `[✅]`   Provides outward: rendered button to `ChatInput` (UI layer consumer)
  *   `[✅]`   `requirements`
    *   `[✅]`   Calls the same `createProjectAndAutoStart` store action used by `CreateDialecticProjectForm` — zero orchestration duplication
    *   `[✅]`   Navigation path and state match the form's autostart success path exactly
    *   `[✅]`   Domain resolution uses existing store state with "General" fallback — no new domain selector UI
    *   `[✅]`   Progressive loading feedback via existing `isAutoStarting` and `autoStartStep` store fields
    *   `[✅]`   Disabled when no messages selected or during autostart
    *   `[✅]`   Error feedback via toast — user stays on chat page to retry or continue chatting
    *   `[✅]`   All unit tests pass

*   `[✅]`   [UI] apps/web/src/components/ai/ChatInput **Render CreateProjectFromChatButton in chat input controls area**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `CreateProjectFromChatButton` to the controls area of `ChatInput`, alongside the existing `MessageSelectionControls` and `ContinueUntilCompleteToggle`
    *   `[✅]`   Minimal change: one import, one render call — no logic changes to `ChatInput` itself
  *   `[✅]`   `role`
    *   `[✅]`   UI layer — chat input controls composition
  *   `[✅]`   `module`
    *   `[✅]`   AI chat input: control surface composition
    *   `[✅]`   Boundary: renders child components in the controls area, no new state or logic
  *   `[✅]`   `deps`
    *   `[✅]`   `CreateProjectFromChatButton` from `./CreateProjectFromChatButton` — Node 2, UI layer, the new button component
    *   `[✅]`   All existing imports unchanged
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   No new store reads — `CreateProjectFromChatButton` is self-contained and reads its own store state
    *   `[✅]`   Render only — no new props, state, or effects in `ChatInput`
    *   `[✅]`   No concrete imports from higher or lateral layers
  *   `[✅]`   unit/`apps/web/src/components/ai/ChatInput.test.tsx`
    *   `[✅]`   Add mock for `CreateProjectFromChatButton`: `vi.mock('./CreateProjectFromChatButton', () => ({ CreateProjectFromChatButton: () => <div data-testid="mock-create-project-button"></div> }))`
    *   `[✅]`   Test: `CreateProjectFromChatButton` mock renders in the controls area (verify `data-testid="mock-create-project-button"` is present in the document)
    *   `[✅]`   Existing tests continue to pass unchanged
  *   `[✅]`   `construction`
    *   `[✅]`   Add import: `import { CreateProjectFromChatButton } from "./CreateProjectFromChatButton";`
    *   `[✅]`   Add render: `<CreateProjectFromChatButton />` inside the controls `<div>` at line ~263–266, alongside `MessageSelectionControls` and `ContinueUntilCompleteToggle`
  *   `[✅]`   `ChatInput.tsx`
    *   `[✅]`   Add import line for `CreateProjectFromChatButton`
    *   `[✅]`   Add `<CreateProjectFromChatButton />` render inside `<div className="flex items-center space-x-4">` in the controls area (line ~263)
    *   `[✅]`   No other changes to `ChatInput` — no new state, props, effects, or logic
  *   `[✅]`   `directionality`
    *   `[✅]`   UI layer (React component)
    *   `[✅]`   Dependencies inward: `CreateProjectFromChatButton` (UI layer, same level — justified as component composition)
    *   `[✅]`   Provides outward: complete chat input control surface to `AiChatbox` (UI layer consumer)
  *   `[✅]`   `requirements`
    *   `[✅]`   `CreateProjectFromChatButton` renders in the controls area alongside existing controls
    *   `[✅]`   No existing `ChatInput` behavior is changed
    *   `[✅]`   Existing `ChatInput` tests pass without modification (beyond adding the new component mock)
    *   `[✅]`   New component mock is present in test output
  *   `[✅]`   **Commit** `feat(ui): add Chat to Project button — create dialectic project from selected chat messages`
    *   `[✅]`   `apps/web/src/utils/formatChatMessagesAsPrompt.ts` — new pure utility formatting `ChatMessage[]` into prompt string
    *   `[✅]`   `apps/web/src/utils/formatChatMessagesAsPrompt.test.ts` — unit tests for the formatter
    *   `[✅]`   `apps/web/src/components/ai/CreateProjectFromChatButton.tsx` — new button component bridging AI chat to dialectic autostart
    *   `[✅]`   `apps/web/src/components/ai/CreateProjectFromChatButton.test.tsx` — unit tests for the button
    *   `[✅]`   `apps/web/src/components/ai/ChatInput.tsx` — render `CreateProjectFromChatButton` in controls area
    *   `[✅]`   `apps/web/src/components/ai/ChatInput.test.tsx` — add mock for new child component, verify render

## Add Github login & sync
- Enable Github for login 
- Let users sync to Github
- New repo or current
- Choose main or branch
- Populate finished docs to root/docs folder 
- Sync adds new docs or new versions of docs at each sync 

### Phase 1: Infrastructure & Backend

*   `[ ]`   [DB]+[RLS] supabase/migrations **Create `github_connections` table for storing user GitHub tokens**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a `github_connections` table that stores each user's GitHub OAuth access token, GitHub user ID, and GitHub username
    *   `[ ]`   Enforce one connection per user via UNIQUE constraint on `user_id`
    *   `[ ]`   RLS: users may SELECT and DELETE their own row; INSERT and UPDATE restricted to service role (edge functions store tokens server-side)
    *   `[ ]`   Cascade delete on `auth.users` removal
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — database schema and security policy
  *   `[ ]`   `module`
    *   `[ ]`   Database schema: `github_connections` table — user-to-GitHub credential mapping
    *   `[ ]`   Boundary: stores credentials consumed by `github-service` and `dialectic-service` edge functions
  *   `[ ]`   `deps`
    *   `[ ]`   `auth.users` table — FK target for `user_id`, infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `supabase/migrations/YYYYMMDDHHMMSS_create_github_connections.sql`
    *   `[ ]`   `CREATE TABLE public.github_connections` with columns: `id uuid PK DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `github_user_id text NOT NULL`, `github_username text NOT NULL`, `access_token text NOT NULL`, `token_scopes text`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()`, `UNIQUE(user_id)`
    *   `[ ]`   RLS enabled: `ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;`
    *   `[ ]`   Policy `github_connections_select_own`: `USING (auth.uid() = user_id)` for SELECT
    *   `[ ]`   Policy `github_connections_delete_own`: `USING (auth.uid() = user_id)` for DELETE
    *   `[ ]`   No INSERT/UPDATE policy for `authenticated` role — writes go through service role client in edge functions
    *   `[ ]`   Add table and column comments
  *   `[ ]`   `supabase/functions/types_db.ts`
    *   `[ ]`   Regenerate from database schema after migration
    *   `[ ]`   Verify `github_connections` row type appears with all columns
  *   `[ ]`   `directionality`
    *   `[ ]`   Infrastructure layer
    *   `[ ]`   All dependencies inward (schema definition references `auth.users`)
    *   `[ ]`   Provides table to backend edge functions (`github-service`, `dialectic-service`)
  *   `[ ]`   `requirements`
    *   `[ ]`   Migration applies cleanly on existing database
    *   `[ ]`   RLS prevents cross-user reads/deletes
    *   `[ ]`   Service role can INSERT/UPDATE (for edge function token storage)
    *   `[ ]`   `types_db.ts` regenerated to include `github_connections`
    *   `[ ]`   Exempt from TDD (database migration / generated types)

*   `[ ]`   [CONFIG] supabase/config.toml **Enable GitHub OAuth provider and manual identity linking**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `[auth.external.github]` section enabling GitHub as an OAuth sign-in provider
    *   `[ ]`   Set `enable_manual_linking = true` so users who signed in via email or Google can link a GitHub identity to their existing account
    *   `[ ]`   Document required environment variables for GitHub OAuth App credentials
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — Supabase Auth configuration
  *   `[ ]`   `module`
    *   `[ ]`   Auth config: external OAuth providers
    *   `[ ]`   Boundary: enables Supabase Auth to redirect to GitHub and process OAuth callbacks
  *   `[ ]`   `deps`
    *   `[ ]`   Supabase Auth service — infrastructure layer
    *   `[ ]`   GitHub OAuth App — external dependency (user must register at `github.com/settings/applications/new` and set callback URL to Supabase auth callback endpoint)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `supabase/config.toml`
    *   `[ ]`   Change `enable_manual_linking = false` to `enable_manual_linking = true`
    *   `[ ]`   Add `[auth.external.github]` block after `[auth.external.apple]`:
      *   `[ ]`   `enabled = true`
      *   `[ ]`   `client_id = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)"`
      *   `[ ]`   `secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"`
      *   `[ ]`   `redirect_uri = ""`
      *   `[ ]`   `url = ""`
      *   `[ ]`   `skip_nonce_check = false`
  *   `[ ]`   `directionality`
    *   `[ ]`   Infrastructure layer
    *   `[ ]`   Provides GitHub OAuth to all auth consumers (authStore `loginWithGitHub`, `linkIdentity`)
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub OAuth login works end-to-end when env vars are set
    *   `[ ]`   Existing Google OAuth unaffected
    *   `[ ]`   Manual identity linking enabled for all providers
    *   `[ ]`   Exempt from TDD (configuration file)

*   `[ ]`   [BE] supabase/functions/_shared/adapters/github_adapter **GitHub REST API adapter with interface and backend types**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `IGitHubAdapter` interface defining all GitHub REST API operations needed by the application
    *   `[ ]`   Create `GitHubApiAdapter` implementation that calls the GitHub REST API v3 using `fetch`
    *   `[ ]`   Create backend GitHub types file defining request/response shapes for GitHub API interactions
    *   `[ ]`   Follows the existing adapter/DI pattern used by `AnthropicAdapter`, `OpenAIAdapter`, `StripePaymentAdapter`
  *   `[ ]`   `role`
    *   `[ ]`   Adapter — wraps external GitHub REST API behind an application-owned interface
  *   `[ ]`   `module`
    *   `[ ]`   External integration: GitHub REST API v3
    *   `[ ]`   Boundary: all GitHub HTTP calls flow through this adapter; no other module calls GitHub directly
  *   `[ ]`   `deps`
    *   `[ ]`   GitHub REST API v3 — external dependency, infrastructure layer
    *   `[ ]`   `fetch` (Deno built-in) — HTTP client, infrastructure layer
    *   `[ ]`   Backend GitHub types (`_shared/types/github.types.ts`) — created in this node as support file
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: GitHub access token (string) — injected at construction
    *   `[ ]`   All methods return typed response objects or throw typed errors
    *   `[ ]`   No Supabase or database interaction — pure HTTP adapter
  *   `[ ]`   interface/`supabase/functions/_shared/types/github.types.ts`
    *   `[ ]`   `GitHubUser` — `{ id: number; login: string; avatar_url: string; }`
    *   `[ ]`   `GitHubRepo` — `{ id: number; name: string; full_name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string; }`
    *   `[ ]`   `GitHubBranch` — `{ name: string; commit: { sha: string }; protected: boolean; }`
    *   `[ ]`   `GitHubCreateRepoPayload` — `{ name: string; description?: string; private?: boolean; auto_init?: boolean; }`
    *   `[ ]`   `GitHubPushFile` — `{ path: string; content: string; encoding: 'base64' | 'utf-8'; }`
    *   `[ ]`   `GitHubPushResult` — `{ commitSha: string; filesUpdated: number; }`
    *   `[ ]`   `IGitHubAdapter` — interface with methods: `getUser(): Promise<GitHubUser>`, `listRepos(): Promise<GitHubRepo[]>`, `listBranches(owner: string, repo: string): Promise<GitHubBranch[]>`, `createRepo(payload: GitHubCreateRepoPayload): Promise<GitHubRepo>`, `pushFiles(owner: string, repo: string, branch: string, files: GitHubPushFile[], commitMessage: string): Promise<GitHubPushResult>`
  *   `[ ]`   unit/`supabase/functions/tests/_shared/adapters/github_adapter.test.ts`
    *   `[ ]`   Test: constructor stores token, sets `Authorization: Bearer <token>` header on requests
    *   `[ ]`   Test: `getUser` calls `GET https://api.github.com/user` and returns typed `GitHubUser`
    *   `[ ]`   Test: `listRepos` calls `GET https://api.github.com/user/repos` with `sort=updated&per_page=100` and returns `GitHubRepo[]`
    *   `[ ]`   Test: `listBranches` calls `GET https://api.github.com/repos/:owner/:repo/branches` and returns `GitHubBranch[]`
    *   `[ ]`   Test: `createRepo` calls `POST https://api.github.com/user/repos` with JSON body and returns `GitHubRepo`
    *   `[ ]`   Test: `pushFiles` creates blobs, builds tree, creates commit, updates ref — returns `GitHubPushResult`
    *   `[ ]`   Test: non-200 responses throw with status and error message from GitHub API
  *   `[ ]`   `construction`
    *   `[ ]`   `constructor(token: string)` — stores token, creates default headers with `Authorization`, `Accept: application/vnd.github.v3+json`, `User-Agent: paynless-framework`
    *   `[ ]`   All methods are `async` and use `fetch` with the constructed headers
    *   `[ ]`   `pushFiles` uses the Git Trees API for efficient batch commits: `POST /git/blobs` per file, `POST /git/trees`, `POST /git/commits`, `PATCH /git/refs/heads/:branch`
  *   `[ ]`   `github_adapter.ts`
    *   `[ ]`   Import `IGitHubAdapter` and all request/response types from `../types/github.types.ts`
    *   `[ ]`   Implement `GitHubApiAdapter` class satisfying `IGitHubAdapter`
    *   `[ ]`   Private `fetchGitHub<T>(path: string, options?: RequestInit): Promise<T>` helper handling base URL, headers, error checking
    *   `[ ]`   `getUser()` — `GET /user`
    *   `[ ]`   `listRepos()` — `GET /user/repos?sort=updated&per_page=100`
    *   `[ ]`   `listBranches(owner, repo)` — `GET /repos/${owner}/${repo}/branches`
    *   `[ ]`   `createRepo(payload)` — `POST /user/repos` with JSON body, sets `auto_init: true` if not specified
    *   `[ ]`   `pushFiles(owner, repo, branch, files, commitMessage)` — Git Trees API batch commit:
      *   `[ ]`   Get current ref SHA via `GET /repos/${owner}/${repo}/git/ref/heads/${branch}`
      *   `[ ]`   Get current tree SHA from ref
      *   `[ ]`   Create blobs for each file via `POST /repos/${owner}/${repo}/git/blobs`
      *   `[ ]`   Create tree via `POST /repos/${owner}/${repo}/git/trees` with `base_tree`
      *   `[ ]`   Create commit via `POST /repos/${owner}/${repo}/git/commits`
      *   `[ ]`   Update ref via `PATCH /repos/${owner}/${repo}/git/refs/heads/${branch}`
      *   `[ ]`   Return `{ commitSha, filesUpdated: files.length }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer
    *   `[ ]`   Dependencies outward: GitHub REST API (external)
    *   `[ ]`   Provides inward: `IGitHubAdapter` interface to `github-service` and `dialectic-service`
  *   `[ ]`   `requirements`
    *   `[ ]`   All GitHub API calls flow through the adapter — no direct `fetch` to `api.github.com` elsewhere
    *   `[ ]`   Token never logged or exposed in error messages
    *   `[ ]`   All unit tests pass with mocked `fetch`
    *   `[ ]`   Adapter is injectable via `IGitHubAdapter` interface

*   `[ ]`   [BE] supabase/functions/github-service/index **Edge function handling GitHub token storage, connection status, and repo operations**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `github-service` edge function with action-based router handling: `storeToken`, `getConnectionStatus`, `disconnectGitHub`, `listRepos`, `listBranches`, `createRepo`
    *   `[ ]`   `storeToken`: validates GitHub token via `IGitHubAdapter.getUser()`, upserts into `github_connections` using admin client
    *   `[ ]`   `getConnectionStatus`: queries `github_connections` for the authenticated user, returns connection state and username
    *   `[ ]`   `disconnectGitHub`: deletes the user's row from `github_connections`
    *   `[ ]`   `listRepos`, `listBranches`, `createRepo`: read the user's token from `github_connections`, instantiate `GitHubApiAdapter`, proxy calls to adapter
    *   `[ ]`   All actions require JWT authentication except none — all are authenticated
  *   `[ ]`   `role`
    *   `[ ]`   Backend adapter — edge function exposing GitHub operations to the frontend via Supabase Functions
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: token lifecycle and repo operations
    *   `[ ]`   Boundary: receives authenticated requests from `GitHubApiClient` (frontend), interacts with `github_connections` table and GitHub API via `IGitHubAdapter`
  *   `[ ]`   `deps`
    *   `[ ]`   `IGitHubAdapter` / `GitHubApiAdapter` from `_shared/adapters/github_adapter.ts` — adapter layer, Node 3
    *   `[ ]`   Backend GitHub types from `_shared/types/github.types.ts` — domain types, Node 3
    *   `[ ]`   `github_connections` table — infrastructure layer, Node 1
    *   `[ ]`   `createSupabaseClient`, `createSupabaseAdminClient` from `_shared/auth.ts` — infrastructure layer
    *   `[ ]`   `handleCorsPreflightRequest`, `createErrorResponse`, `createSuccessResponse` from `_shared/cors-headers.ts` — infrastructure layer
    *   `[ ]`   `logger` from `_shared/logger.ts` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From request: JWT for user authentication, action name, action-specific payload
    *   `[ ]`   From `github_connections`: user's GitHub access token, GitHub user ID, GitHub username
    *   `[ ]`   From `IGitHubAdapter`: GitHub API responses (repos, branches, user info)
    *   `[ ]`   No concrete imports from higher or lateral layers
  *   `[ ]`   unit/`supabase/functions/tests/github-service/index.test.ts`
    *   `[ ]`   Test: `storeToken` — validates token via `getUser`, upserts row into `github_connections`, returns `{ connected: true, username }`
    *   `[ ]`   Test: `storeToken` — returns error if `getUser` call fails (invalid token)
    *   `[ ]`   Test: `getConnectionStatus` — returns `{ connected: true, username, github_user_id }` when row exists
    *   `[ ]`   Test: `getConnectionStatus` — returns `{ connected: false }` when no row exists
    *   `[ ]`   Test: `disconnectGitHub` — deletes row from `github_connections`, returns `{ disconnected: true }`
    *   `[ ]`   Test: `listRepos` — reads token from `github_connections`, calls `adapter.listRepos()`, returns repos
    *   `[ ]`   Test: `listRepos` — returns error if no GitHub connection exists
    *   `[ ]`   Test: `listBranches` — reads token, calls `adapter.listBranches(owner, repo)`, returns branches
    *   `[ ]`   Test: `createRepo` — reads token, calls `adapter.createRepo(payload)`, returns new repo
    *   `[ ]`   Test: unauthenticated requests return 401
    *   `[ ]`   Test: unknown action returns 400
  *   `[ ]`   `construction`
    *   `[ ]`   `serve` handler with CORS preflight check
    *   `[ ]`   Parse JSON body for `{ action, payload }`
    *   `[ ]`   Authenticate user via `createSupabaseClient(req)` + `getUser()`
    *   `[ ]`   Switch on `action` to dispatch to inline handler functions
    *   `[ ]`   For repo operations: read token from `github_connections` using admin client, construct `GitHubApiAdapter(token)`, call adapter method
  *   `[ ]`   `index.ts`
    *   `[ ]`   Import shared auth, CORS, logger utilities
    *   `[ ]`   Import `GitHubApiAdapter` and types
    *   `[ ]`   Helper `getUserGitHubToken(adminClient, userId)`: queries `github_connections` for user's `access_token`, returns token or null
    *   `[ ]`   Action `storeToken`: receive `{ providerToken }`, create `GitHubApiAdapter(providerToken)`, call `getUser()` to validate and get GitHub identity, upsert `github_connections` row via admin client
    *   `[ ]`   Action `getConnectionStatus`: query `github_connections` for user, return connection shape or `{ connected: false }`
    *   `[ ]`   Action `disconnectGitHub`: delete from `github_connections` where `user_id` matches
    *   `[ ]`   Action `listRepos`: get token via helper, create adapter, call `listRepos()`
    *   `[ ]`   Action `listBranches`: get token, create adapter, call `listBranches(payload.owner, payload.repo)`
    *   `[ ]`   Action `createRepo`: get token, create adapter, call `createRepo(payload)`
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer (edge function)
    *   `[ ]`   Dependencies inward: `IGitHubAdapter` (adapter), `github_connections` (infrastructure), auth utilities (infrastructure)
    *   `[ ]`   Provides outward: HTTP API consumed by `GitHubApiClient` in `@paynless/api`
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub token is never returned to the frontend — only stored server-side and used for API calls
    *   `[ ]`   `storeToken` validates the token before storing (rejects invalid tokens)
    *   `[ ]`   All actions require valid JWT
    *   `[ ]`   All unit tests pass
  *   `[ ]`   **Commit** `feat(be): add github_connections migration, GitHub OAuth config, GitHub adapter, and github-service edge function`
    *   `[ ]`   `supabase/migrations/YYYYMMDDHHMMSS_create_github_connections.sql` — new migration
    *   `[ ]`   `supabase/config.toml` — GitHub OAuth provider enabled, manual linking enabled
    *   `[ ]`   `supabase/functions/_shared/types/github.types.ts` — backend GitHub types
    *   `[ ]`   `supabase/functions/_shared/adapters/github_adapter.ts` — `IGitHubAdapter` + `GitHubApiAdapter`
    *   `[ ]`   `supabase/functions/github-service/index.ts` — new edge function with token + repo handlers
    *   `[ ]`   `supabase/functions/types_db.ts` — regenerated to include `github_connections`

*   `[ ]`   [BE] supabase/functions/dialectic-service/syncToGitHub **Sync rendered project documents to a GitHub repository**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a handler that syncs all rendered documents from `dialectic_project_resources` for a given project to the user's configured GitHub repository
    *   `[ ]`   Only sync rendered documents (from `dialectic_project_resources`), not raw contributions or manifests — this is NOT the full export
    *   `[ ]`   Files are placed in the configured target folder (default `/docs`) on the configured branch
    *   `[ ]`   Sync is additive/upsert — adds new files or updates existing files; does not delete files from the repo
    *   `[ ]`   Uses `IGitHubAdapter.pushFiles()` for efficient batch commit via Git Trees API
  *   `[ ]`   `role`
    *   `[ ]`   Backend service handler — orchestrates document retrieval from storage and push to GitHub
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service: GitHub document sync
    *   `[ ]`   Boundary: reads from `dialectic_project_resources` and `github_connections`, downloads from Supabase storage, pushes to GitHub via adapter
  *   `[ ]`   `deps`
    *   `[ ]`   `dialectic_project_resources` table — source of rendered documents, infrastructure layer
    *   `[ ]`   `dialectic_projects` table — `repo_url` JSONB column for repo/branch/folder config, infrastructure layer
    *   `[ ]`   `github_connections` table — user's GitHub token, infrastructure layer, Node 1
    *   `[ ]`   `IGitHubAdapter` / `GitHubApiAdapter` from `_shared/adapters/github_adapter.ts` — adapter layer, Node 3
    *   `[ ]`   `IStorageUtils` from `_shared/types/storage_utils.types.ts` — download files from Supabase storage, infrastructure layer
    *   `[ ]`   `downloadFromStorage` from `_shared/supabase_storage_utils.ts` — infrastructure layer
    *   `[ ]`   Backend GitHub types from `_shared/types/github.types.ts` — domain types, Node 3
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: `{ projectId: string }` from request payload + authenticated user
    *   `[ ]`   From `dialectic_projects.repo_url`: `{ provider, owner, repo, branch, folder }`
    *   `[ ]`   From `dialectic_project_resources`: list of resources with `storage_bucket`, `storage_path`, `file_name`, `mime_type`
    *   `[ ]`   From `github_connections`: user's GitHub `access_token`
    *   `[ ]`   Output: `{ commitSha, filesUpdated, syncedAt }` or error
  *   `[ ]`   interface/`supabase/functions/dialectic-service/dialectic.interface.ts`
    *   `[ ]`   `SyncToGitHubPayload` — `{ projectId: string }`
    *   `[ ]`   `GitHubRepoSettings` — `{ provider: 'github'; owner: string; repo: string; branch: string; folder: string; last_sync_at: string | null; }`
    *   `[ ]`   `SyncToGitHubResponse` — `{ commitSha: string; filesUpdated: number; syncedAt: string; }`
    *   `[ ]`   `UpdateProjectGitHubSettingsPayload` — `{ projectId: string; settings: GitHubRepoSettings; }`
    *   `[ ]`   Add `syncToGitHub` and `updateProjectGitHubSettings` to `DialecticServiceActionPayload` union
  *   `[ ]`   unit/`supabase/functions/tests/dialectic-service/syncToGitHub.test.ts`
    *   `[ ]`   Test: returns error if project not found
    *   `[ ]`   Test: returns error if user does not own the project
    *   `[ ]`   Test: returns error if `repo_url` is null (no GitHub repo configured)
    *   `[ ]`   Test: returns error if user has no GitHub connection in `github_connections`
    *   `[ ]`   Test: queries `dialectic_project_resources` for the project and downloads each file from storage
    *   `[ ]`   Test: converts downloaded file content to base64 and constructs `GitHubPushFile[]` with paths under the configured folder
    *   `[ ]`   Test: calls `adapter.pushFiles()` with correct owner, repo, branch, files, and commit message
    *   `[ ]`   Test: updates `dialectic_projects.repo_url` with `last_sync_at` timestamp after successful push
    *   `[ ]`   Test: returns `{ commitSha, filesUpdated, syncedAt }` on success
    *   `[ ]`   Test: handles empty `dialectic_project_resources` gracefully (returns success with 0 files)
  *   `[ ]`   `construction`
    *   `[ ]`   Signature: `export async function syncToGitHub(supabaseClient, adminClient, projectId, userId): Promise<SyncToGitHubResponse | { error }>`
    *   `[ ]`   DI: receives `supabaseClient` for user-scoped queries, `adminClient` for reading `github_connections`
  *   `[ ]`   `syncToGitHub.ts`
    *   `[ ]`   Fetch project from `dialectic_projects`, verify ownership
    *   `[ ]`   Parse `repo_url` JSONB as `GitHubRepoSettings`, validate required fields
    *   `[ ]`   Query `github_connections` for user's `access_token` via admin client
    *   `[ ]`   Construct `GitHubApiAdapter(token)`
    *   `[ ]`   Query `dialectic_project_resources` WHERE `project_id = projectId`
    *   `[ ]`   For each resource: download file bytes from `storage_bucket/storage_path` via `downloadFromStorage`
    *   `[ ]`   Convert each file to base64, build `GitHubPushFile` with path `${settings.folder}/${resource.file_name}`
    *   `[ ]`   Call `adapter.pushFiles(owner, repo, branch, files, commitMessage)`
    *   `[ ]`   Update `dialectic_projects.repo_url` JSONB merging `last_sync_at: new Date().toISOString()`
    *   `[ ]`   Return `{ commitSha, filesUpdated, syncedAt }`
  *   `[ ]`   `directionality`
    *   `[ ]`   Service layer (backend handler)
    *   `[ ]`   Dependencies inward: `IGitHubAdapter` (adapter), tables (infrastructure), storage utils (infrastructure)
    *   `[ ]`   Provides outward: sync handler consumed by `dialectic-service/index.ts` router
  *   `[ ]`   `requirements`
    *   `[ ]`   Only `dialectic_project_resources` rows are synced — not raw contributions, manifests, or export ZIPs
    *   `[ ]`   Sync is additive — existing repo files not managed by sync are untouched
    *   `[ ]`   File paths in the repo use `${folder}/${file_name}` structure
    *   `[ ]`   `last_sync_at` is updated on the project after each successful sync
    *   `[ ]`   All unit tests pass

*   `[ ]`   [BE] supabase/functions/dialectic-service/index **Add `syncToGitHub` and `updateProjectGitHubSettings` action routing**
  *   `[ ]`   `objective`
    *   `[ ]`   Add two new action cases to the existing dialectic-service action router: `syncToGitHub` and `updateProjectGitHubSettings`
    *   `[ ]`   `syncToGitHub`: delegates to the `syncToGitHub` handler from Node 5
    *   `[ ]`   `updateProjectGitHubSettings`: inline handler that updates `dialectic_projects.repo_url` JSONB for the authenticated user's project
    *   `[ ]`   Add `github-service` to the `functions_without_jwt_verification` list in `config.toml` if needed, or ensure JWT is enforced (it should be enforced)
  *   `[ ]`   `role`
    *   `[ ]`   Backend adapter — action router extension
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic service: action routing for GitHub sync and settings
    *   `[ ]`   Boundary: extends existing router; no new edge function
  *   `[ ]`   `deps`
    *   `[ ]`   `syncToGitHub` from `./syncToGitHub.ts` — backend handler, Node 5
    *   `[ ]`   `SyncToGitHubPayload`, `UpdateProjectGitHubSettingsPayload`, `GitHubRepoSettings` from `dialectic.interface.ts` — domain types, Node 5
    *   `[ ]`   Existing `dialectic-service/index.ts` router infrastructure — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `action === 'syncToGitHub'`: extract `projectId` from payload, pass to handler
    *   `[ ]`   `action === 'updateProjectGitHubSettings'`: extract `projectId` and `settings`, UPDATE `dialectic_projects` SET `repo_url` WHERE `id = projectId` AND `user_id = userId`
    *   `[ ]`   No new store reads or external calls beyond existing patterns
  *   `[ ]`   unit/`supabase/functions/tests/dialectic-service/index.routing.test.ts`
    *   `[ ]`   Test: action `syncToGitHub` dispatches to `syncToGitHub` handler with correct args
    *   `[ ]`   Test: action `updateProjectGitHubSettings` updates `repo_url` on the correct project for the authenticated user
    *   `[ ]`   Test: action `updateProjectGitHubSettings` returns error if project not owned by user
  *   `[ ]`   `construction`
    *   `[ ]`   Import `syncToGitHub` handler
    *   `[ ]`   Import new payload types from `dialectic.interface.ts`
    *   `[ ]`   Add case blocks in the action switch
  *   `[ ]`   `index.ts`
    *   `[ ]`   Add import for `syncToGitHub` handler
    *   `[ ]`   Add `case 'syncToGitHub'`: call `syncToGitHub(dbClient, adminClient, payload.projectId, user.id)`, return response
    *   `[ ]`   Add `case 'updateProjectGitHubSettings'`: validate payload, UPDATE `dialectic_projects` SET `repo_url = payload.settings` WHERE `id = payload.projectId` AND `user_id = user.id`, return updated project
    *   `[ ]`   Add new action types to `ActionHandlers` interface if needed
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer (edge function router)
    *   `[ ]`   Dependencies inward: `syncToGitHub` handler (service layer), types (domain layer)
    *   `[ ]`   Provides outward: HTTP API consumed by `DialecticApiClient` in `@paynless/api`
  *   `[ ]`   `requirements`
    *   `[ ]`   Existing dialectic-service actions unaffected
    *   `[ ]`   New actions require authentication
    *   `[ ]`   All unit tests pass
  *   `[ ]`   **Commit** `feat(be): add syncToGitHub handler and routing for GitHub document sync`
    *   `[ ]`   `supabase/functions/dialectic-service/syncToGitHub.ts` — sync rendered docs to GitHub
    *   `[ ]`   `supabase/functions/dialectic-service/dialectic.interface.ts` — sync + settings types
    *   `[ ]`   `supabase/functions/dialectic-service/index.ts` — new action routing

### Phase 2: Frontend API, Store, and Auth

*   `[ ]`   [API] packages/api/src/github.api **Frontend GitHub API client with types and ApiClient wiring**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `packages/types/src/github.types.ts` — frontend GitHub type definitions independent from dialectic types
    *   `[ ]`   Create `GitHubApiClient` class in `packages/api/src/github.api.ts` following the pattern of `DialecticApiClient`
    *   `[ ]`   Wire `GitHubApiClient` into `ApiClient` via a `github` accessor in `packages/api/src/apiClient.ts`
    *   `[ ]`   All methods call the `github-service` edge function via `this.apiClient.post()`
  *   `[ ]`   `role`
    *   `[ ]`   Port — frontend API adapter bridging stores to backend edge functions
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: frontend API client
    *   `[ ]`   Boundary: provides typed methods consumed by `githubStore` and `authStore`; calls `github-service` edge function
  *   `[ ]`   `deps`
    *   `[ ]`   `ApiClient` from `./apiClient.ts` — infrastructure layer (modified in this node to add accessor)
    *   `[ ]`   `ApiResponse` from `@paynless/types` — domain type
    *   `[ ]`   Frontend GitHub types from `@paynless/types` — domain types (created in this node as support file)
    *   `[ ]`   `logger` from `@paynless/utils` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: action payloads (providerToken for storeToken, owner+repo for listBranches, etc.)
    *   `[ ]`   Output: `ApiResponse<T>` for each method
    *   `[ ]`   Auth handled by `ApiClient` — JWT injected automatically
  *   `[ ]`   interface/`packages/types/src/github.types.ts`
    *   `[ ]`   `GitHubConnectionStatus` — `{ connected: boolean; username?: string; githubUserId?: string; }`
    *   `[ ]`   `GitHubRepo` — `{ id: number; name: string; full_name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string; }`
    *   `[ ]`   `GitHubBranch` — `{ name: string; commit: { sha: string }; protected: boolean; }`
    *   `[ ]`   `GitHubCreateRepoPayload` — `{ name: string; description?: string; private?: boolean; }`
    *   `[ ]`   `GitHubRepoSettings` — `{ provider: 'github'; owner: string; repo: string; branch: string; folder: string; last_sync_at: string | null; }`
    *   `[ ]`   `SyncToGitHubResponse` — `{ commitSha: string; filesUpdated: number; syncedAt: string; }`
    *   `[ ]`   `GitHubApiClient` interface — `storeToken(providerToken: string)`, `getConnectionStatus()`, `disconnectGitHub()`, `listRepos()`, `listBranches(owner, repo)`, `createRepo(payload)`, `syncToGitHub(projectId)`, `updateProjectGitHubSettings(projectId, settings)`
  *   `[ ]`   unit/`packages/api/src/github.api.test.ts`
    *   `[ ]`   Test: `storeToken` posts `{ action: 'storeToken', payload: { providerToken } }` to `github-service`
    *   `[ ]`   Test: `getConnectionStatus` posts `{ action: 'getConnectionStatus' }` to `github-service`
    *   `[ ]`   Test: `disconnectGitHub` posts `{ action: 'disconnectGitHub' }` to `github-service`
    *   `[ ]`   Test: `listRepos` posts `{ action: 'listRepos' }` to `github-service`
    *   `[ ]`   Test: `listBranches` posts correct action and payload to `github-service`
    *   `[ ]`   Test: `createRepo` posts correct action and payload to `github-service`
    *   `[ ]`   Test: `syncToGitHub` posts `{ action: 'syncToGitHub', payload: { projectId } }` to `dialectic-service`
    *   `[ ]`   Test: `updateProjectGitHubSettings` posts correct action and payload to `dialectic-service`
    *   `[ ]`   Test: error responses are returned as `ApiResponse` with error field populated
  *   `[ ]`   `construction`
    *   `[ ]`   `constructor(apiClient: ApiClient)` — stores reference to `ApiClient`
    *   `[ ]`   Each method calls `this.apiClient.post<ResponseType, PayloadType>(endpoint, body)` and returns `ApiResponse<T>`
  *   `[ ]`   `github.api.ts`
    *   `[ ]`   Import `ApiClient` from `./apiClient`
    *   `[ ]`   Import all types from `@paynless/types`
    *   `[ ]`   Implement `GitHubApiClient` class with all methods
    *   `[ ]`   Token and repo operations call `github-service` endpoint
    *   `[ ]`   Sync and settings operations call `dialectic-service` endpoint
  *   `[ ]`   `apiClient.ts` (support wiring)
    *   `[ ]`   Import `GitHubApiClient` from `./github.api`
    *   `[ ]`   Add `get github(): GitHubApiClient` accessor that returns `new GitHubApiClient(this)` (matching the pattern of existing domain client accessors)
  *   `[ ]`   `directionality`
    *   `[ ]`   Port layer (API client)
    *   `[ ]`   Dependencies inward: `ApiClient` (infrastructure), types (domain)
    *   `[ ]`   Provides outward: typed API methods to `githubStore` and `authStore`
  *   `[ ]`   `requirements`
    *   `[ ]`   All methods match the backend `github-service` and `dialectic-service` action contracts
    *   `[ ]`   Error handling follows existing `DialecticApiClient` pattern (try/catch, network error wrapping)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [STORE] packages/store/src/authStore **Add `loginWithGitHub`, `linkGitHubAccount`, and provider token capture**
  *   `[ ]`   `objective`
    *   `[ ]`   Implement `loginWithGitHub()` action mirroring the existing `loginWithGoogle()` pattern but with `scopes: 'repo'` for GitHub API access
    *   `[ ]`   Implement `linkGitHubAccount()` action using `supabase.auth.linkIdentity({ provider: 'github', options: { scopes: 'repo' } })` for existing users to add GitHub
    *   `[ ]`   Update `handleOAuthLogin('github')` to call `loginWithGitHub()` instead of throwing
    *   `[ ]`   In `onAuthStateChange` listener: when `SIGNED_IN` event fires with `session.provider_token` and the provider is `github`, call `api.github.storeToken(providerToken)` to persist the token server-side
  *   `[ ]`   `role`
    *   `[ ]`   App layer — state management for authentication
  *   `[ ]`   `module`
    *   `[ ]`   Auth: GitHub OAuth login, identity linking, and token capture
    *   `[ ]`   Boundary: calls Supabase Auth SDK and `GitHubApiClient.storeToken()`
  *   `[ ]`   `deps`
    *   `[ ]`   Supabase Auth SDK (`signInWithOAuth`, `linkIdentity`) — infrastructure layer
    *   `[ ]`   `GitHubApiClient.storeToken()` from `@paynless/api` — port layer, Node 7
    *   `[ ]`   `AuthStore` interface from `@paynless/types` — domain types (add `loginWithGitHub` and `linkGitHubAccount` to interface)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   `loginWithGitHub()`: calls `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo, scopes: 'repo' } })`
    *   `[ ]`   `linkGitHubAccount()`: calls `supabase.auth.linkIdentity({ provider: 'github', options: { scopes: 'repo', redirectTo } })`
    *   `[ ]`   `onAuthStateChange`: detect `session.provider_token` on `SIGNED_IN` events, check `session.user.app_metadata.provider === 'github'`, fire `api.github.storeToken(session.provider_token)`
  *   `[ ]`   interface/`packages/types/src/auth.types.ts`
    *   `[ ]`   Add `loginWithGitHub: () => Promise<void>` to `AuthStore` interface
    *   `[ ]`   Add `linkGitHubAccount: () => Promise<void>` to `AuthStore` interface
  *   `[ ]`   unit/`packages/store/src/authStore.test.ts`
    *   `[ ]`   Test: `loginWithGitHub` calls `supabase.auth.signInWithOAuth` with `provider: 'github'` and `scopes: 'repo'`
    *   `[ ]`   Test: `loginWithGitHub` sets `isLoading` during call and clears after
    *   `[ ]`   Test: `loginWithGitHub` sets `error` on failure
    *   `[ ]`   Test: `handleOAuthLogin('github')` calls `loginWithGitHub` (no longer throws)
    *   `[ ]`   Test: `linkGitHubAccount` calls `supabase.auth.linkIdentity` with `provider: 'github'` and `scopes: 'repo'`
    *   `[ ]`   Test: auth listener captures `provider_token` on GitHub `SIGNED_IN` event and calls `api.github.storeToken()`
    *   `[ ]`   Test: auth listener does NOT call `storeToken` when provider is not `github`
    *   `[ ]`   Test: auth listener does NOT call `storeToken` when `provider_token` is null
  *   `[ ]`   `construction`
    *   `[ ]`   `loginWithGitHub` mirrors `loginWithGoogle` exactly, substituting `provider: 'github'` and adding `scopes: 'repo'`
    *   `[ ]`   `linkGitHubAccount` uses `linkIdentity` (Supabase Auth method for adding an identity to an existing user)
    *   `[ ]`   Token capture logic in `initAuthListener` — minimal addition to existing `SIGNED_IN` handler
  *   `[ ]`   `authStore.ts`
    *   `[ ]`   Add `loginWithGitHub` action (pattern mirrors `loginWithGoogle` at lines 155-184)
    *   `[ ]`   Add `linkGitHubAccount` action
    *   `[ ]`   Update `handleOAuthLogin` switch: change `case 'github': throw` to `case 'github': return get().loginWithGitHub()`
    *   `[ ]`   In `initAuthListener`, inside the `SIGNED_IN` case: check `session?.provider_token` and `session?.user?.app_metadata?.provider === 'github'`, if true call `api.github.storeToken(session.provider_token)`
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer (store)
    *   `[ ]`   Dependencies inward: Supabase Auth SDK (infrastructure), `GitHubApiClient` (port)
    *   `[ ]`   Provides outward: `loginWithGitHub`, `linkGitHubAccount` actions to UI components
  *   `[ ]`   `requirements`
    *   `[ ]`   `loginWithGitHub` works end-to-end: redirects to GitHub, comes back, stores token
    *   `[ ]`   `linkGitHubAccount` adds GitHub identity to existing user account
    *   `[ ]`   Existing `loginWithGoogle` and email login unaffected
    *   `[ ]`   Provider token captured and stored on first GitHub sign-in
    *   `[ ]`   All unit tests pass

*   `[ ]`   [STORE] packages/store/src/githubStore **GitHub connection state, repo/branch listing, and sync actions**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `githubStore` as an independent Zustand store slice for GitHub integration state
    *   `[ ]`   Manage GitHub connection status (connected/disconnected, username)
    *   `[ ]`   Manage repo list, branch list, and repo creation for the repo picker UI
    *   `[ ]`   Manage sync-to-GitHub state (loading, error, result) for sync operations
    *   `[ ]`   Independent from `dialecticStore` and `authStore` — reads from `GitHubApiClient` only
  *   `[ ]`   `role`
    *   `[ ]`   App layer — state management for GitHub integration
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: connection lifecycle, repo browsing, sync state
    *   `[ ]`   Boundary: calls `GitHubApiClient` methods, provides state to UI components
  *   `[ ]`   `deps`
    *   `[ ]`   `GitHubApiClient` from `@paynless/api` — port layer, Node 7
    *   `[ ]`   Frontend GitHub types from `@paynless/types` — domain types, Node 7
    *   `[ ]`   `ApiResponse`, `ApiError` from `@paynless/types` — domain types
    *   `[ ]`   `logger` from `@paynless/utils` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced — does NOT import from `dialecticStore` or `authStore`
  *   `[ ]`   `context_slice`
    *   `[ ]`   Connection: `connectionStatus`, `isLoadingConnection`, `connectionError`
    *   `[ ]`   Repos: `repos`, `isLoadingRepos`, `reposError`
    *   `[ ]`   Branches: `branches`, `isLoadingBranches`, `branchesError`
    *   `[ ]`   Sync: `isSyncing`, `syncError`, `lastSyncResult`
    *   `[ ]`   Actions: `fetchConnectionStatus`, `disconnectGitHub`, `fetchRepos`, `fetchBranches`, `createRepo`, `syncToGitHub`, `updateProjectGitHubSettings`
  *   `[ ]`   interface/`packages/types/src/github.types.ts` (extend from Node 7)
    *   `[ ]`   `GitHubStoreState` — all state fields listed above
    *   `[ ]`   `GitHubStoreActions` — all action signatures
    *   `[ ]`   `GitHubStore` — `GitHubStoreState & GitHubStoreActions`
  *   `[ ]`   unit/`packages/store/src/githubStore.test.ts`
    *   `[ ]`   Test: `fetchConnectionStatus` calls `api.github.getConnectionStatus()` and sets `connectionStatus`
    *   `[ ]`   Test: `fetchConnectionStatus` sets `isLoadingConnection` during call
    *   `[ ]`   Test: `disconnectGitHub` calls `api.github.disconnectGitHub()` and clears `connectionStatus`
    *   `[ ]`   Test: `fetchRepos` calls `api.github.listRepos()` and sets `repos`
    *   `[ ]`   Test: `fetchBranches` calls `api.github.listBranches(owner, repo)` and sets `branches`
    *   `[ ]`   Test: `createRepo` calls `api.github.createRepo(payload)`, adds new repo to `repos` list
    *   `[ ]`   Test: `syncToGitHub` calls `api.github.syncToGitHub(projectId)`, sets `lastSyncResult`
    *   `[ ]`   Test: `syncToGitHub` sets `isSyncing` during call and `syncError` on failure
    *   `[ ]`   Test: `updateProjectGitHubSettings` calls `api.github.updateProjectGitHubSettings(projectId, settings)`
    *   `[ ]`   Test: initial state has `connectionStatus: null`, empty arrays, no errors
  *   `[ ]`   `construction`
    *   `[ ]`   `create<GitHubStore>()((set, get) => ({ ... }))` — Zustand store following existing store patterns
    *   `[ ]`   Each action uses `getApiClient().github` to access `GitHubApiClient`
  *   `[ ]`   `githubStore.ts`
    *   `[ ]`   Import `GitHubStore`, `GitHubConnectionStatus`, `GitHubRepo`, `GitHubBranch`, `GitHubRepoSettings`, `SyncToGitHubResponse` from `@paynless/types`
    *   `[ ]`   Import `getApiClient` from `@paynless/api`
    *   `[ ]`   Import `logger` from `@paynless/utils`
    *   `[ ]`   Define initial state values
    *   `[ ]`   Implement all actions: `fetchConnectionStatus`, `disconnectGitHub`, `fetchRepos`, `fetchBranches`, `createRepo`, `syncToGitHub`, `updateProjectGitHubSettings`, `reset`
    *   `[ ]`   Export `useGitHubStore` hook
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer (store)
    *   `[ ]`   Dependencies inward: `GitHubApiClient` (port), types (domain)
    *   `[ ]`   Provides outward: state and actions to UI components (`GitHubConnectionCard`, `GitHubRepoSettings`, `SyncToGitHubButton`)
  *   `[ ]`   `requirements`
    *   `[ ]`   Independent store — no cross-store imports
    *   `[ ]`   All actions handle loading and error states
    *   `[ ]`   All unit tests pass

### Phase 3: UI Components

*   `[ ]`   [UI] apps/web/src/components/auth/LoginForm **Add GitHub OAuth login button**
  *   `[ ]`   `objective`
    *   `[ ]`   Add a "Sign in with GitHub" button alongside the existing "Sign in with Google" button
    *   `[ ]`   Button calls `handleOAuthLogin('github')` from `authStore` (which now dispatches to `loginWithGitHub`)
    *   `[ ]`   Minimal change — one button addition, no logic changes
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — login form
  *   `[ ]`   `module`
    *   `[ ]`   Auth: login page — OAuth provider buttons
    *   `[ ]`   Boundary: renders button, calls existing store action
  *   `[ ]`   `deps`
    *   `[ ]`   `handleOAuthLogin` from `useAuthStore` — app layer (pre-existing, now supports `'github'`)
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   GitHub icon (from `lucide-react` or inline SVG) — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useAuthStore`: `handleOAuthLogin` action, `isLoading` state
    *   `[ ]`   No new store reads beyond existing
  *   `[ ]`   unit/`apps/web/src/components/auth/LoginForm.test.tsx`
    *   `[ ]`   Test: renders "Sign in with GitHub" button
    *   `[ ]`   Test: clicking GitHub button calls `handleOAuthLogin('github')`
    *   `[ ]`   Test: GitHub button is disabled when `isLoading` is true
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   Add GitHub icon import
    *   `[ ]`   Add `<Button>` with GitHub icon and "Sign in with GitHub" text, `onClick={() => handleOAuthLogin('github')}`
    *   `[ ]`   Place below or alongside existing Google button in the OAuth section
  *   `[ ]`   `LoginForm.tsx`
    *   `[ ]`   Add GitHub icon import
    *   `[ ]`   Add GitHub `<Button>` in the OAuth buttons section, matching styling of the Google button
    *   `[ ]`   No other changes to `LoginForm`
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `authStore` (app layer), UI primitives (UI layer)
    *   `[ ]`   Provides outward: GitHub login entry point to end user
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub button visually matches the existing Google button style
    *   `[ ]`   Existing login flow unaffected
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/components/profile/GitHubConnectionCard **Profile card to connect, view, and disconnect GitHub account**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a profile settings card showing GitHub connection status
    *   `[ ]`   When disconnected: show "Connect GitHub" button that calls `linkGitHubAccount()` from `authStore`
    *   `[ ]`   When connected: show GitHub username and "Disconnect" button that calls `disconnectGitHub()` from `githubStore`
    *   `[ ]`   Fetches connection status on mount via `githubStore.fetchConnectionStatus()`
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — profile settings card
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: connection management UI
    *   `[ ]`   Boundary: reads from `githubStore`, calls `authStore.linkGitHubAccount()` and `githubStore.disconnectGitHub()`
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   `useAuthStore` from `@paynless/store` — app layer (for `linkGitHubAccount`)
    *   `[ ]`   `GitHubConnectionStatus` from `@paynless/types` — domain type, Node 7
    *   `[ ]`   `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card` — UI layer
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `connectionStatus`, `isLoadingConnection`, `connectionError`, `fetchConnectionStatus`, `disconnectGitHub`
    *   `[ ]`   From `useAuthStore`: `linkGitHubAccount`
  *   `[ ]`   unit/`apps/web/src/components/profile/GitHubConnectionCard.test.tsx`
    *   `[ ]`   Test: calls `fetchConnectionStatus` on mount
    *   `[ ]`   Test: shows loading skeleton while `isLoadingConnection` is true
    *   `[ ]`   Test: when disconnected, renders "Connect GitHub" button
    *   `[ ]`   Test: clicking "Connect GitHub" calls `linkGitHubAccount()`
    *   `[ ]`   Test: when connected, renders GitHub username and "Disconnect" button
    *   `[ ]`   Test: clicking "Disconnect" calls `disconnectGitHub()` and shows success toast
    *   `[ ]`   Test: shows error state when `connectionError` is set
  *   `[ ]`   `construction`
    *   `[ ]`   `export const GitHubConnectionCard: React.FC`
    *   `[ ]`   `useEffect` on mount: call `fetchConnectionStatus()`
    *   `[ ]`   Conditional render based on `connectionStatus?.connected`
  *   `[ ]`   `GitHubConnectionCard.tsx`
    *   `[ ]`   Import `useGitHubStore` and `useAuthStore` from `@paynless/store`
    *   `[ ]`   Import Card components and Button from UI primitives
    *   `[ ]`   Fetch connection status on mount
    *   `[ ]`   Render card with title "GitHub" and description
    *   `[ ]`   Connected state: show `@username`, "Disconnect" button
    *   `[ ]`   Disconnected state: show "Connect GitHub" button
    *   `[ ]`   Loading state: show skeleton
    *   `[ ]`   Error state: show error message
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), `authStore` (app), types (domain), UI primitives (UI)
    *   `[ ]`   Provides outward: rendered card to `Profile.tsx`
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub connection status reflects actual state from `github_connections` table
    *   `[ ]`   Connect and disconnect flows work end-to-end
    *   `[ ]`   Follows existing profile card patterns (`NotificationSettingsCard`, `ProfilePrivacySettingsCard`)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/pages/Profile **Render GitHubConnectionCard in profile page**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `GitHubConnectionCard` to the profile page alongside existing settings cards
    *   `[ ]`   Wrap in `ErrorBoundary` following existing pattern
    *   `[ ]`   Minimal change — one import, one render block
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — page composition
  *   `[ ]`   `module`
    *   `[ ]`   Profile page: settings card composition
    *   `[ ]`   Boundary: renders child component, no new state or logic
  *   `[ ]`   `deps`
    *   `[ ]`   `GitHubConnectionCard` from `../components/profile/GitHubConnectionCard` — UI layer, Node 11
    *   `[ ]`   All existing imports unchanged
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   No new store reads — `GitHubConnectionCard` is self-contained
    *   `[ ]`   Render only — no new props, state, or effects in `Profile.tsx`
  *   `[ ]`   unit/`apps/web/src/pages/Profile.test.tsx`
    *   `[ ]`   Add mock for `GitHubConnectionCard`
    *   `[ ]`   Test: `GitHubConnectionCard` mock renders in the profile page
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   Add import for `GitHubConnectionCard`
    *   `[ ]`   Add `<ErrorBoundary>` wrapping `<GitHubConnectionCard />` after the `NotificationSettingsCard` block
  *   `[ ]`   `Profile.tsx`
    *   `[ ]`   Add import line for `GitHubConnectionCard`
    *   `[ ]`   Add `<ErrorBoundary fallback={...}><GitHubConnectionCard /></ErrorBoundary>` block in the cards list
    *   `[ ]`   No other changes
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer (page)
    *   `[ ]`   Dependencies inward: `GitHubConnectionCard` (UI layer, component composition)
    *   `[ ]`   Provides outward: complete profile page to router
  *   `[ ]`   `requirements`
    *   `[ ]`   `GitHubConnectionCard` renders in the profile page
    *   `[ ]`   No existing profile behavior is changed
    *   `[ ]`   All existing tests pass

*   `[ ]`   [UI] apps/web/src/components/dialectic/GitHubRepoSettings **Repo, branch, and folder picker for dialectic project GitHub sync configuration**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a settings card for configuring which GitHub repo, branch, and folder a dialectic project syncs to
    *   `[ ]`   Repo selector: dropdown listing user's repos from `githubStore.repos`, plus "Create new repo" option
    *   `[ ]`   When "Create new repo" is selected: show name input and create button
    *   `[ ]`   Branch selector: dropdown listing branches for the selected repo, defaults to `default_branch`
    *   `[ ]`   Folder input: text field for target folder path, defaults to `/docs`
    *   `[ ]`   Save button: calls `githubStore.updateProjectGitHubSettings(projectId, settings)`
    *   `[ ]`   Shows "Connect GitHub first" message if user has no GitHub connection
    *   `[ ]`   Pre-populates fields from existing `project.repo_url` JSONB if previously configured
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — dialectic project settings component
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: project repo configuration UI
    *   `[ ]`   Boundary: reads from `githubStore`, reads project from `dialecticStore`, writes settings via `githubStore.updateProjectGitHubSettings`
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   `useDialecticStore` from `@paynless/store` — app layer (for `currentProjectDetail` and `repo_url`)
    *   `[ ]`   `GitHubRepo`, `GitHubBranch`, `GitHubRepoSettings`, `GitHubConnectionStatus` from `@paynless/types` — domain types, Node 7
    *   `[ ]`   `DialecticProject` from `@paynless/types` — domain type (for `repo_url`)
    *   `[ ]`   Card, Select, Input, Button, Label from UI primitives — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `connectionStatus`, `repos`, `branches`, `isLoadingRepos`, `isLoadingBranches`, `fetchRepos`, `fetchBranches`, `createRepo`, `updateProjectGitHubSettings`
    *   `[ ]`   From `useDialecticStore`: `currentProjectDetail` (for `id` and `repo_url`)
    *   `[ ]`   Output: calls `updateProjectGitHubSettings(projectId, settings)` on save
  *   `[ ]`   unit/`apps/web/src/components/dialectic/GitHubRepoSettings.test.tsx`
    *   `[ ]`   Test: shows "Connect GitHub" message when `connectionStatus.connected` is false
    *   `[ ]`   Test: fetches repos on mount when connected
    *   `[ ]`   Test: renders repo dropdown populated from `repos`
    *   `[ ]`   Test: selecting a repo fetches branches for that repo
    *   `[ ]`   Test: renders branch dropdown populated from `branches`
    *   `[ ]`   Test: renders folder input defaulting to `/docs`
    *   `[ ]`   Test: pre-populates fields from `project.repo_url` when previously configured
    *   `[ ]`   Test: "Create new repo" option shows name input and create button
    *   `[ ]`   Test: creating a repo calls `createRepo` and selects the new repo
    *   `[ ]`   Test: save button calls `updateProjectGitHubSettings` with correct settings shape
    *   `[ ]`   Test: save button is disabled when required fields are empty
  *   `[ ]`   `construction`
    *   `[ ]`   `export const GitHubRepoSettings: React.FC<{ projectId: string }>`
    *   `[ ]`   Local state for selected repo, branch, folder, and "create new" mode
    *   `[ ]`   `useEffect` on mount: fetch repos if connected
    *   `[ ]`   `useEffect` on repo selection: fetch branches
  *   `[ ]`   `GitHubRepoSettings.tsx`
    *   `[ ]`   Import `useGitHubStore`, `useDialecticStore` from `@paynless/store`
    *   `[ ]`   Import types from `@paynless/types`
    *   `[ ]`   Import UI primitives
    *   `[ ]`   Render: Card with title "GitHub Repository"
    *   `[ ]`   If not connected: show message with link to Profile page
    *   `[ ]`   If connected: render repo dropdown, branch dropdown, folder input, save button
    *   `[ ]`   "Create new repo" inline form when selected
    *   `[ ]`   Pre-populate from `currentProjectDetail.repo_url` if it exists
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), `dialecticStore` (app), types (domain), UI primitives (UI)
    *   `[ ]`   Provides outward: rendered card to `DialecticProjectDetailsPage`
  *   `[ ]`   `requirements`
    *   `[ ]`   Users can pick existing repo, create new repo, select branch, and set target folder
    *   `[ ]`   Default folder is `/docs` when not previously configured
    *   `[ ]`   Default branch is repo's `default_branch` when not previously configured
    *   `[ ]`   Settings persist to `dialectic_projects.repo_url` JSONB via backend
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/components/dialectic/SyncToGitHubButton **Button to trigger document sync to configured GitHub repository**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a button component that triggers `githubStore.syncToGitHub(projectId)` for the current project
    *   `[ ]`   Disabled when no GitHub repo is configured on the project (`repo_url` is null)
    *   `[ ]`   Shows loading state during sync and success/error feedback via toast
    *   `[ ]`   Placed alongside the existing `ExportProjectButton` on the project details page
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — dialectic project action button
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: sync trigger
    *   `[ ]`   Boundary: reads sync state from `githubStore`, reads project from `dialecticStore`, triggers sync action
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   `useDialecticStore` from `@paynless/store` — app layer (for `currentProjectDetail`)
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   `Loader2` from `lucide-react` — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `isSyncing`, `syncError`, `syncToGitHub`
    *   `[ ]`   From `useDialecticStore`: `currentProjectDetail` (for `id` and `repo_url`)
    *   `[ ]`   Output: triggers sync, displays toast result
  *   `[ ]`   unit/`apps/web/src/components/dialectic/SyncToGitHubButton.test.tsx`
    *   `[ ]`   Test: renders "Sync to GitHub" button
    *   `[ ]`   Test: button is disabled when `currentProjectDetail.repo_url` is null
    *   `[ ]`   Test: button is disabled when `isSyncing` is true
    *   `[ ]`   Test: clicking button calls `syncToGitHub(projectId)`
    *   `[ ]`   Test: shows loading spinner while `isSyncing` is true
    *   `[ ]`   Test: shows success toast with file count on successful sync
    *   `[ ]`   Test: shows error toast on sync failure
  *   `[ ]`   `construction`
    *   `[ ]`   `export const SyncToGitHubButton: React.FC<{ projectId: string }>`
    *   `[ ]`   Click handler calls `syncToGitHub(projectId)`, then toasts result
    *   `[ ]`   `isDisabled`: `!currentProjectDetail?.repo_url || isSyncing`
  *   `[ ]`   `SyncToGitHubButton.tsx`
    *   `[ ]`   Import `useGitHubStore`, `useDialecticStore` from `@paynless/store`
    *   `[ ]`   Import `Button`, `Loader2`, `toast`
    *   `[ ]`   Compute disabled state from `repo_url` and `isSyncing`
    *   `[ ]`   Render button with GitHub icon, loading spinner when syncing
    *   `[ ]`   Handle click: call sync, toast success/error
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), `dialecticStore` (app), UI primitives (UI)
    *   `[ ]`   Provides outward: rendered button to `DialecticProjectDetailsPage`
  *   `[ ]`   `requirements`
    *   `[ ]`   Sync only triggers when a repo is configured
    *   `[ ]`   Feedback on sync result (success with file count, or error)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/pages/DialecticProjectDetailsPage **Render GitHubRepoSettings and SyncToGitHubButton on project details page**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `GitHubRepoSettings` card and `SyncToGitHubButton` to the project details page
    *   `[ ]`   `SyncToGitHubButton` placed alongside the existing `ExportProjectButton` in the project actions area
    *   `[ ]`   `GitHubRepoSettings` rendered as a settings section below the project details
    *   `[ ]`   Minimal change — imports and render calls only
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — page composition
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic project details: action and settings composition
    *   `[ ]`   Boundary: renders child components, no new state or logic
  *   `[ ]`   `deps`
    *   `[ ]`   `GitHubRepoSettings` from `../components/dialectic/GitHubRepoSettings` — UI layer, Node 13
    *   `[ ]`   `SyncToGitHubButton` from `../components/dialectic/SyncToGitHubButton` — UI layer, Node 14
    *   `[ ]`   All existing imports unchanged
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   No new store reads — both components are self-contained
    *   `[ ]`   Render only — no new props, state, or effects in `DialecticProjectDetailsPage`
    *   `[ ]`   Pass `projectId` prop from route params to both components
  *   `[ ]`   unit/`apps/web/src/pages/DialecticProjectDetailsPage.test.tsx`
    *   `[ ]`   Add mocks for `GitHubRepoSettings` and `SyncToGitHubButton`
    *   `[ ]`   Test: `GitHubRepoSettings` mock renders on the page
    *   `[ ]`   Test: `SyncToGitHubButton` mock renders on the page
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `construction`
    *   `[ ]`   Add imports for both components
    *   `[ ]`   Render `<SyncToGitHubButton projectId={projectId} />` near `<ExportProjectButton>`
    *   `[ ]`   Render `<GitHubRepoSettings projectId={projectId} />` in a settings section
  *   `[ ]`   `DialecticProjectDetailsPage.tsx`
    *   `[ ]`   Add import for `GitHubRepoSettings` and `SyncToGitHubButton`
    *   `[ ]`   Add `<SyncToGitHubButton projectId={projectId} />` alongside `ExportProjectButton` in the actions area
    *   `[ ]`   Add `<GitHubRepoSettings projectId={projectId} />` in a settings section below project details
    *   `[ ]`   No other changes
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer (page)
    *   `[ ]`   Dependencies inward: `GitHubRepoSettings` (UI), `SyncToGitHubButton` (UI) — component composition
    *   `[ ]`   Provides outward: complete project details page to router
  *   `[ ]`   `requirements`
    *   `[ ]`   Both new components render on the project details page
    *   `[ ]`   No existing project details behavior is changed
    *   `[ ]`   All existing tests pass
  *   `[ ]`   **Commit** `feat(ui): add GitHub login, connection management, repo settings, and sync-to-GitHub UI`
    *   `[ ]`   `packages/types/src/github.types.ts` — frontend GitHub types
    *   `[ ]`   `packages/api/src/github.api.ts` — GitHub API client
    *   `[ ]`   `packages/api/src/apiClient.ts` — add `github` accessor
    *   `[ ]`   `packages/types/src/auth.types.ts` — add `loginWithGitHub`, `linkGitHubAccount` to `AuthStore`
    *   `[ ]`   `packages/store/src/authStore.ts` — GitHub login, link, and token capture
    *   `[ ]`   `packages/store/src/githubStore.ts` — new GitHub store slice
    *   `[ ]`   `apps/web/src/components/auth/LoginForm.tsx` — GitHub login button
    *   `[ ]`   `apps/web/src/components/profile/GitHubConnectionCard.tsx` — connection management card
    *   `[ ]`   `apps/web/src/pages/Profile.tsx` — render connection card
    *   `[ ]`   `apps/web/src/components/dialectic/GitHubRepoSettings.tsx` — repo/branch/folder picker
    *   `[ ]`   `apps/web/src/components/dialectic/SyncToGitHubButton.tsx` — sync trigger button
    *   `[ ]`   `apps/web/src/pages/DialecticProjectDetailsPage.tsx` — render repo settings and sync button

## Download Each Document
x Add a "download" button to file view in GeneratedContributionsCard so that each file can be downloaded separately. 
- Add toggle for Export Project to export full project OR only export finished documents 

## Fix GeneratedContributionCard
x GeneratedContributionCard tries to display header_context, which it should never even acknowledge since it's not a document and isn't available to the FE 
x Never try to display header_context during generation

## Add onHover eye to each stage and document
- What is the purpose
- What do you get
- ELIF, give the user engagement

### Phase 1 — Dynamic stage metadata and stage tooltips

*   `[✅]`   [DB] supabase/migrations **Add friendly display_name, description, and minimum_balance to dialectic_stages**
  *   `[✅]`   `objective`
    *   `[✅]`   Write a new SQL migration that UPDATEs `dialectic_stages.display_name` from formal names ("Thesis", "Antithesis", "Synthesis", "Parenthesis", "Paralysis") to user-friendly names ("Proposal", "Review", "Refinement", "Planning", "Implementation")
    *   `[✅]`   UPDATE `dialectic_stages.description` to user-facing explanations suitable for tooltip display (e.g., "Generate initial, diverse proposals for your project" instead of "Generate initial, diverse solutions to the prompt.")
    *   `[✅]`   ALTER TABLE `dialectic_stages` ADD COLUMN `minimum_balance INTEGER NOT NULL DEFAULT 0`
    *   `[✅]`   UPDATE each stage's `minimum_balance` with values currently hardcoded in `STAGE_BALANCE_THRESHOLDS`: thesis=200000, antithesis=400000, synthesis=1000000, parenthesis=250000, paralysis=250000
    *   `[✅]`   Regenerate `supabase/functions/types_db.ts` to reflect the new column
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — database schema change providing dynamic stage metadata to all consumers
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic stage configuration
    *   `[✅]`   Boundary: migration modifies `dialectic_stages` table only
  *   `[✅]`   `deps`
    *   `[✅]`   Existing `dialectic_stages` table from migration `20250613190311_domains_and_processes_improvement.sql`
    *   `[✅]`   No reverse dependency introduced — this is a leaf schema change consumed by downstream code
  *   `[✅]`   `context_slice`
    *   `[✅]`   Adds `minimum_balance` column to `dialectic_stages` Row type
    *   `[✅]`   Updates `display_name` and `description` values for all 5 stages
    *   `[✅]`   No code imports, no concrete dependencies
  *   `[✅]`   `requirements`
    *   `[✅]`   Migration is idempotent (uses IF NOT EXISTS for ADD COLUMN, UPDATE is safe to re-run)
    *   `[✅]`   All 5 stages receive updated `display_name`, `description`, and `minimum_balance`
    *   `[✅]`   `types_db.ts` regenerated and includes `minimum_balance: number` on `dialectic_stages` Row

*   `[✅]`   [STORE] packages/types/src/dialectic.types.ts **Remove hardcoded stage enum, getDisplayName, isDialecticStageSlug, and STAGE_BALANCE_THRESHOLDS**
  *   `[✅]`   `objective`
    *   `[✅]`   Delete the `DialecticStages` enum (lines 13-19)
    *   `[✅]`   Delete the `isDialecticStageSlug` function (lines 21-29)
    *   `[✅]`   Delete the `getDisplayName` function (lines 31-36)
    *   `[✅]`   Delete the `STAGE_BALANCE_THRESHOLDS` constant (lines 38-45)
    *   `[✅]`   These are all replaced by `stage.display_name`, `stage.description`, and `stage.minimum_balance` from the database row type
  *   `[✅]`   `role`
    *   `[✅]`   Domain type file — removing hardcoded slug-keyed lookups that violate the dynamic COW DAG pattern
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic types
    *   `[✅]`   Boundary: type definitions only, no executable logic remains after deletions
  *   `[✅]`   `deps`
    *   `[✅]`   `DialecticStage` type (unchanged, remains as `Database['public']['Tables']['dialectic_stages']['Row']`) — now includes `minimum_balance` from regenerated `types_db.ts`
    *   `[✅]`   No reverse dependency introduced — consumers will be updated in subsequent nodes
  *   `[✅]`   `context_slice`
    *   `[✅]`   Removes 4 exported symbols: `DialecticStages`, `isDialecticStageSlug`, `getDisplayName`, `STAGE_BALANCE_THRESHOLDS`
    *   `[✅]`   `DialecticStage` row type now carries `display_name`, `description`, and `minimum_balance` from the database
  *   `[✅]`   `requirements`
    *   `[✅]`   No hardcoded stage slug mappings remain in this file
    *   `[✅]`   `DialecticStage` type still exported and unchanged
    *   `[✅]`   File lints clean after deletions
    *   `[✅]`   Downstream consumers will have lint errors until updated in subsequent nodes — this is expected and acceptable

*   `[✅]`   [UI] apps/web/src/components/dialectic/GenerateContributionButton.tsx **Replace getDisplayName with stage.display_name**
  *   `[✅]`   `objective`
    *   `[✅]`   Remove import of `getDisplayName` from `@paynless/types`
    *   `[✅]`   Replace `getDisplayName(activeStage.slug)` calls (lines 69, 92) with `activeStage.display_name`
  *   `[✅]`   `role`
    *   `[✅]`   UI component — adapter layer consuming stage metadata from store
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic generation controls
    *   `[✅]`   Boundary: component rendering and button label logic only
  *   `[✅]`   `deps`
    *   `[✅]`   `DialecticStage` type from `@paynless/types` — `display_name: string` field (populated by migration)
    *   `[✅]`   `useDialecticStore` from `@paynless/store` — provides `activeStage` object
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Reads `activeStage.display_name` instead of calling `getDisplayName(activeStage.slug)`
    *   `[✅]`   No new imports required
  *   `[✅]`   unit/`GenerateContributionButton.test.tsx`
    *   `[✅]`   Update any test mocks that reference `getDisplayName` to use `display_name` field on stage objects
  *   `[✅]`   `GenerateContributionButton.tsx`
    *   `[✅]`   Remove `getDisplayName` import
    *   `[✅]`   Replace `getDisplayName(activeStage.slug)` with `activeStage.display_name` at both call sites
  *   `[✅]`   `requirements`
    *   `[✅]`   No import of `getDisplayName` remains
    *   `[✅]`   Button labels use database-driven `display_name`
    *   `[✅]`   File lints clean

*   `[✅]`   [UI] apps/web/src/hooks/useStartContributionGeneration.ts **Replace STAGE_BALANCE_THRESHOLDS with stage.minimum_balance**
  *   `[✅]`   `objective`
    *   `[✅]`   Remove import of `STAGE_BALANCE_THRESHOLDS` from `@paynless/types`
    *   `[✅]`   Replace `STAGE_BALANCE_THRESHOLDS[activeStage.slug]` (line 106) with `activeStage.minimum_balance`
  *   `[✅]`   `role`
    *   `[✅]`   App layer hook — wallet balance gating logic for stage generation
  *   `[✅]`   `module`
    *   `[✅]`   Contribution generation orchestration
    *   `[✅]`   Boundary: hook logic that determines wallet readiness
  *   `[✅]`   `deps`
    *   `[✅]`   `DialecticStage` type from `@paynless/types` — `minimum_balance: number` field (populated by migration)
    *   `[✅]`   `useDialecticStore` from `@paynless/store` — provides `activeStage` object
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Reads `activeStage.minimum_balance` instead of looking up `STAGE_BALANCE_THRESHOLDS[activeStage.slug]`
    *   `[✅]`   No new imports required
  *   `[✅]`   unit/`useStartContributionGeneration.test.ts`
    *   `[✅]`   Update any test mocks that reference `STAGE_BALANCE_THRESHOLDS` to use `minimum_balance` field on stage objects
  *   `[✅]`   `useStartContributionGeneration.ts`
    *   `[✅]`   Remove `STAGE_BALANCE_THRESHOLDS` import
    *   `[✅]`   Replace threshold lookup with `activeStage.minimum_balance`
  *   `[✅]`   `requirements`
    *   `[✅]`   No import of `STAGE_BALANCE_THRESHOLDS` remains
    *   `[✅]`   Threshold is sourced from database via stage object
    *   `[✅]`   File lints clean

*   `[✅]`   [UI] apps/web/src/components/dialectic/CreateDialecticProjectForm.tsx **Replace STAGE_BALANCE_THRESHOLDS with stage data**
  *   `[✅]`   `objective`
    *   `[✅]`   Remove import of `STAGE_BALANCE_THRESHOLDS` from `@paynless/types`
    *   `[✅]`   Replace `STAGE_BALANCE_THRESHOLDS['thesis']` (lines 303, 315) with the first stage's `minimum_balance` from the store (the sorted stages array provides this)
  *   `[✅]`   `role`
    *   `[✅]`   UI component — project creation form with auto-start gating
  *   `[✅]`   `module`
    *   `[✅]`   Project creation
    *   `[✅]`   Boundary: form logic determining whether to auto-check "start generation"
  *   `[✅]`   `deps`
    *   `[✅]`   `selectSortedStages` from `@paynless/store` — provides stages with `minimum_balance`
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Reads `stages[0].minimum_balance` (first stage threshold) instead of `STAGE_BALANCE_THRESHOLDS['thesis']`
    *   `[✅]`   May require adding `selectSortedStages` to existing store subscriptions
  *   `[✅]`   unit/`CreateDialecticProjectForm.autostart.test.tsx`
    *   `[✅]`   Update any test mocks that reference `STAGE_BALANCE_THRESHOLDS` to use `minimum_balance` field on stage objects
  *   `[✅]`   `CreateDialecticProjectForm.tsx`
    *   `[✅]`   Remove `STAGE_BALANCE_THRESHOLDS` import
    *   `[✅]`   Replace hardcoded `'thesis'` lookup with first sorted stage's `minimum_balance`
  *   `[✅]`   `requirements`
    *   `[✅]`   No import of `STAGE_BALANCE_THRESHOLDS` remains
    *   `[✅]`   Auto-start gating uses database-driven threshold from first stage
    *   `[✅]`   File lints clean

*   `[✅]`   [UI] apps/web/src/components/dialectic/SessionContributionsDisplayCard.tsx **Remove duplicate stageNameMap, use stage.display_name and stage.description**
  *   `[✅]`   `objective`
    *   `[✅]`   Delete the local `stageNameMap` constant (lines 44-50)
    *   `[✅]`   Delete the local `getDisplayName` function (lines 52-57)
    *   `[✅]`   Replace `getDisplayName(activeStage)` (line 465) with `activeStage.display_name`
    *   `[✅]`   `activeStage.description` is already used on line 466 — no change needed there
  *   `[✅]`   `role`
    *   `[✅]`   UI component — adapter layer displaying stage content and documents
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic session workspace
    *   `[✅]`   Boundary: stage header display
  *   `[✅]`   `deps`
    *   `[✅]`   `DialecticStage` type from `@paynless/types` — `display_name: string` field
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Reads `activeStage.display_name` directly instead of mapping through local constant
    *   `[✅]`   No new imports required
  *   `[✅]`   unit/`SessionContributionsDisplayCard.test.tsx`
    *   `[✅]`   Update any test mocks that reference `stageNameMap` or local `getDisplayName` to use `display_name` field on stage objects
  *   `[✅]`   `SessionContributionsDisplayCard.tsx`
    *   `[✅]`   Delete `stageNameMap` and local `getDisplayName`
    *   `[✅]`   Replace call site with `activeStage.display_name`
  *   `[✅]`   `requirements`
    *   `[✅]`   No hardcoded stage name mapping remains in this file
    *   `[✅]`   Stage header uses database-driven `display_name`
    *   `[✅]`   File lints clean

*   `[✅]`   [UI] apps/web/src/components/common/DynamicProgressBar.tsx **Use stage display_name instead of raw slug**
  *   `[✅]`   `objective`
    *   `[✅]`   Replace `progress.currentStageSlug` (line 15) with the display name for the current stage
    *   `[✅]`   This requires looking up the stage object from sorted stages using `currentStageSlug` to get `display_name`
  *   `[✅]`   `role`
    *   `[✅]`   UI component — progress display
  *   `[✅]`   `module`
    *   `[✅]`   Common progress indicator
    *   `[✅]`   Boundary: progress bar label rendering
  *   `[✅]`   `deps`
    *   `[✅]`   `selectSortedStages` from `@paynless/store` — provides stages with `display_name`
    *   `[✅]`   `useDialecticStore` from `@paynless/store` — existing store hook
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Reads sorted stages to find stage matching `currentStageSlug`, uses its `display_name`
    *   `[✅]`   Falls back to slug if stage not found
  *   `[✅]`   unit/`DynamicProgressBar.test.tsx` (create if not exists)
    *   `[✅]`   Test: progress bar label shows friendly display_name instead of raw slug
    *   `[✅]`   Test: falls back to slug when stage object is not found
  *   `[✅]`   `DynamicProgressBar.tsx`
    *   `[✅]`   Add `selectSortedStages` usage to look up `display_name` for `currentStageSlug`
    *   `[✅]`   Replace raw slug in display message with resolved `display_name`
    *   `[✅]`   Remove `console.log(progress)` on line 17
  *   `[✅]`   `requirements`
    *   `[✅]`   Progress bar shows "Stage 2/5: Review" not "Stage 2/5: antithesis"
    *   `[✅]`   File lints clean

*   `[✅]`   [UI] apps/web/src/components/dialectic/StageTabCard.tsx **Add tooltip with stage description and minimum balance on hover**
  *   `[✅]`   `objective`
    *   `[✅]`   Remove import of `getDisplayName` from `@paynless/types`
    *   `[✅]`   Replace `getDisplayName(stage.slug)` (line 50) with `stage.display_name`
    *   `[✅]`   Wrap each `StageCard` button with `Tooltip` / `TooltipTrigger` / `TooltipContent` from `@/components/ui/tooltip`
    *   `[✅]`   Tooltip content shows: stage `description` and formatted `minimum_balance` (e.g., "Minimum balance: 200,000 tokens")
  *   `[✅]`   `role`
    *   `[✅]`   UI component — stage navigation with contextual help
  *   `[✅]`   `module`
    *   `[✅]`   Dialectic stage sidebar
    *   `[✅]`   Boundary: stage tab rendering and tooltip display
  *   `[✅]`   `deps`
    *   `[✅]`   `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
    *   `[✅]`   `DialecticStage` type from `@paynless/types` — `display_name`, `description`, `minimum_balance` fields
    *   `[✅]`   No reverse dependency introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Reads `stage.display_name`, `stage.description`, `stage.minimum_balance` from the stage object already passed as props
    *   `[✅]`   Imports tooltip components from existing UI library
  *   `[✅]`   interface/`StageCardProps` in StageTabCard.tsx
    *   `[✅]`   No changes needed — `stage: DialecticStage` prop already carries `description` and `minimum_balance`
  *   `[✅]`   unit/`StageTabCard.test.tsx` (create if not exists)
    *   `[✅]`   Test: stage card renders `display_name` from stage object, not hardcoded mapping
    *   `[✅]`   Test: tooltip appears on hover showing stage description
    *   `[✅]`   Test: tooltip shows formatted minimum balance
  *   `[✅]`   `StageTabCard.tsx`
    *   `[✅]`   Remove `getDisplayName` import from `@paynless/types`
    *   `[✅]`   Replace `getDisplayName(stage.slug)` with `stage.display_name`
    *   `[✅]`   Wrap stage button with `Tooltip` components
    *   `[✅]`   Render `stage.description` and formatted `stage.minimum_balance` in `TooltipContent`
  *   `[✅]`   `requirements`
    *   `[✅]`   No import of `getDisplayName` remains
    *   `[✅]`   Stage name sourced from database `display_name`
    *   `[✅]`   Hovering over a stage shows description and minimum token balance
    *   `[✅]`   File lints clean
  *   `[✅]`   **Commit** `feat(dialectic): replace hardcoded stage metadata with database-driven display_name, description, and minimum_balance — add stage tooltips`
    *   `[✅]`   Migration adds `minimum_balance` column and updates `display_name`/`description` for all 5 stages
    *   `[✅]`   Regenerated `types_db.ts`
    *   `[✅]`   Deleted `DialecticStages` enum, `getDisplayName`, `isDialecticStageSlug`, `STAGE_BALANCE_THRESHOLDS` from `dialectic.types.ts`
    *   `[✅]`   Updated `GenerateContributionButton.tsx` to use `stage.display_name`
    *   `[✅]`   Updated `useStartContributionGeneration.ts` to use `stage.minimum_balance`
    *   `[✅]`   Updated `CreateDialecticProjectForm.tsx` to use `stage.minimum_balance`
    *   `[✅]`   Updated `SessionContributionsDisplayCard.tsx` — removed duplicate `stageNameMap`
    *   `[✅]`   Updated `DynamicProgressBar.tsx` to show `display_name` instead of raw slug
    *   `[✅]`   Updated `StageTabCard.tsx` — removed `getDisplayName`, added tooltip with description and minimum balance

### Phase 2 — Dynamic document metadata and document tooltips (Option B)

*   `[ ]`   [DB] supabase/migrations **Add display_name and description to document entries in outputs_required JSONB**
  *   `[ ]`   `objective`
    *   `[ ]`   Write a new SQL migration that UPDATEs the `outputs_required` JSONB on `dialectic_recipe_template_steps` and `dialectic_stage_recipe_steps` to add `display_name` and `description` fields alongside each existing `document_key` in the `documents` array entries
    *   `[ ]`   Every markdown document entry across all 5 stage recipes receives a `display_name` (e.g., `"business_case"` → `"Business Case"`) and a `description` (e.g., `"Market analysis, user problem validation, and value proposition for the project"`)
    *   `[ ]`   Non-markdown entries (`header_context`, `seed_prompt`, `comparison_vector`, etc.) are excluded — only rendered document entries visible to users need friendly metadata
    *   `[ ]`   The pipeline passes `outputs_required` as opaque JSONB — no backend code changes are needed
  *   `[ ]`   `role`
    *   `[ ]`   Infrastructure — database schema enrichment providing document display metadata to front-end selectors
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic recipe configuration
    *   `[ ]`   Boundary: JSONB content update within `outputs_required` on recipe step rows — no schema DDL
  *   `[ ]`   `deps`
    *   `[ ]`   Existing `dialectic_recipe_template_steps` and `dialectic_stage_recipe_steps` tables from migration `20251006194452_dialectic_stage_recipes.sql`
    *   `[ ]`   Existing stage-specific recipe migrations (`20251006194531` through `20251006194605`)
    *   `[ ]`   No reverse dependency introduced — JSONB is opaque to the pipeline
  *   `[ ]`   `context_slice`
    *   `[ ]`   Adds `display_name: string` and `description: string` to document entries inside `outputs_required` JSONB
    *   `[ ]`   No new columns, no DDL, no code imports
  *   `[ ]`   `requirements`
    *   `[ ]`   Migration is idempotent (uses `jsonb_set` or equivalent UPDATE pattern)
    *   `[ ]`   All user-visible markdown document entries across all 5 stage recipes receive `display_name` and `description`
    *   `[ ]`   Pipeline passes the enriched JSONB through without modification — no backend test failures

*   `[ ]`   [STORE] packages/store/src/dialecticStore.selectors.ts **Add selectDocumentDisplayMetadata selector**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a new memoized selector `selectDocumentDisplayMetadata` that returns `Map<string, { displayName: string; description: string }>` keyed by `document_key`
    *   `[ ]`   The selector parses `outputs_required` JSONB from recipe steps (same pattern as `selectValidMarkdownDocumentKeys`) and extracts `display_name` and `description` from document entries
    *   `[ ]`   Falls back to a title-cased `document_key` for `displayName` and empty string for `description` if fields are absent
  *   `[ ]`   `role`
    *   `[ ]`   Store selector — app layer deriving display metadata from recipe data already in state
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic store selectors
    *   `[ ]`   Boundary: reads `recipesByStageSlug` from state, returns derived display metadata map
  *   `[ ]`   `deps`
    *   `[ ]`   `selectRecipeSteps` from `dialecticStore.selectors.ts` — existing memoized selector providing recipe steps
    *   `[ ]`   `createSelector` from `dialecticStore.selectors.ts` — existing selector factory
    *   `[ ]`   Existing helpers `isPlainRecord`, `toPlainArray` in same file
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: recipe steps from state (same as `selectValidMarkdownDocumentKeys`)
    *   `[ ]`   Output: `Map<string, { displayName: string; description: string }>`
    *   `[ ]`   No new store state, no new actions
  *   `[ ]`   interface/`DocumentDisplayMetadata` type
    *   `[ ]`   Define `DocumentDisplayMetadata` type: `{ displayName: string; description: string }` — in `@paynless/types` or locally in the selector file if only used here
  *   `[ ]`   unit/`dialecticStore.selectors.documents.test.ts`
    *   `[ ]`   Test: returns empty map when no recipe steps exist
    *   `[ ]`   Test: extracts `display_name` and `description` from document entries in `outputs_required`
    *   `[ ]`   Test: falls back to title-cased `document_key` when `display_name` is absent
    *   `[ ]`   Test: falls back to empty string when `description` is absent
    *   `[ ]`   Test: ignores `header_context` output_type steps
    *   `[ ]`   Test: handles string JSONB (unparsed) `outputs_required`
  *   `[ ]`   `dialecticStore.selectors.ts`
    *   `[ ]`   Add `selectDocumentDisplayMetadata` selector using `createSelector([selectRecipeSteps], ...)`
    *   `[ ]`   Parse `outputs_required` documents array, extract `display_name` and `description` alongside `document_key`
    *   `[ ]`   Export the new selector
  *   `[ ]`   `requirements`
    *   `[ ]`   Selector is memoized via `createSelector`
    *   `[ ]`   Follows same JSONB parsing pattern as `selectValidMarkdownDocumentKeys`
    *   `[ ]`   Exported from `@paynless/store` barrel
    *   `[ ]`   File lints clean

*   `[ ]`   [UI] apps/web/src/components/dialectic/StageRunChecklist.tsx **Add tooltip with document description on hover, show display_name instead of raw document_key**
  *   `[ ]`   `objective`
    *   `[ ]`   Import and use `selectDocumentDisplayMetadata` to look up `displayName` and `description` for each document row
    *   `[ ]`   Replace `{entry.documentKey}` (line 725) with the resolved `displayName`
    *   `[ ]`   Wrap each document row with `Tooltip` / `TooltipTrigger` / `TooltipContent` from `@/components/ui/tooltip`
    *   `[ ]`   Tooltip content shows the document `description`
  *   `[ ]`   `role`
    *   `[ ]`   UI component — document checklist with contextual help
  *   `[ ]`   `module`
    *   `[ ]`   Dialectic stage run checklist
    *   `[ ]`   Boundary: document row rendering and tooltip display
  *   `[ ]`   `deps`
    *   `[ ]`   `selectDocumentDisplayMetadata` from `@paynless/store` — provides display metadata map
    *   `[ ]`   `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
    *   `[ ]`   No reverse dependency introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Calls `selectDocumentDisplayMetadata` for the effective stage slug to get `Map<string, { displayName, description }>`
    *   `[ ]`   Reads `displayName` and `description` for each `entry.documentKey`
    *   `[ ]`   Imports tooltip components from existing UI library
  *   `[ ]`   unit/`StageRunChecklist.test.tsx` (create or extend)
    *   `[ ]`   Test: document row renders friendly `displayName` instead of raw `document_key`
    *   `[ ]`   Test: tooltip appears on hover showing document `description`
    *   `[ ]`   Test: falls back to title-cased `document_key` when display metadata is unavailable
  *   `[ ]`   `StageRunChecklist.tsx`
    *   `[ ]`   Import `selectDocumentDisplayMetadata` from `@paynless/store`
    *   `[ ]`   Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip`
    *   `[ ]`   Call selector to get display metadata map for the current stage
    *   `[ ]`   Replace `{entry.documentKey}` with resolved `displayName`
    *   `[ ]`   Wrap document list items with tooltip showing `description`
  *   `[ ]`   `requirements`
    *   `[ ]`   Document names shown as friendly display names, not snake_case keys
    *   `[ ]`   Hovering over a document shows its description
    *   `[ ]`   Falls back gracefully when metadata is absent
    *   `[ ]`   File lints clean
  *   `[ ]`   **Commit** `feat(dialectic): add document display_name and description to recipe JSONB — add document tooltips`
    *   `[ ]`   Migration enriches `outputs_required` JSONB with `display_name` and `description` for all markdown document entries
    *   `[ ]`   Added `selectDocumentDisplayMetadata` selector to `dialecticStore.selectors.ts`
    *   `[ ]`   Updated `StageRunChecklist.tsx` to show friendly document names with hover descriptions

## Expand paused_nsf for general pause/resume
- Add explicit "Pause" condition that sets all jobs to "paused" and can be restarted. 
- Users can pause and resume jobs at any time 
- Jobs may need new JWT set when resumed for handler to accept them 

## n/n Done only hydrates on page refresh, not dynamic, and sometimes overcounts 
- Check if n/n Done is calculating correctly
- Ensure n/n Done updates from notifications, not just page refresh 

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

## Ensure front end components use friendly names 
- DynamicProgressBar uses formal names instead of friendly names
- SessionContributionsDisplayCard uses formal names instead of friendly names 
- SessionInfoCard uses formal names instead of friendly names 

## Move "Generate" button into StageRunCard left hand side where the icons are 

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)
