[ ] // So that find->replace will stop unrolling my damned instructions! 

# **TITLE**

## Problem Statement

## Objectives

## Expected Outcome

# Instructions for Agent
* Read `docs/Instructions for Agent.md` before every turn.

# Work Breakdown Structure

## Add Github login & sync
- Enable Github for login 
- Let users sync to Github
- New repo or current
- Choose main or branch
- Populate finished docs to root/docs folder 
- Sync adds new docs or new versions of docs at each sync 

### Phase 1: Infrastructure & Backend

https://paynless.app/github-auth callback for Github App

https://paynless.app/github-hook callback for Github App event detail POST

https://github.com/apps/paynless-app public app link 

*   `[✅]`   [DB]+[RLS] supabase/migrations **Create `github_connections` table for storing GitHub App installation references**
  *   `[✅]`   `objective`
    *   `[✅]`   Create a `github_connections` table that stores each user's GitHub App installation reference, GitHub user ID, and GitHub username
    *   `[✅]`   No access tokens stored; tokens are generated on-demand using the GitHub App private key
    *   `[✅]`   Enforce one installation per user via UNIQUE constraint on `user_id`
    *   `[✅]`   RLS: users may SELECT and DELETE their own row; INSERT and UPDATE restricted to service role (edge functions store installation data server-side)
    *   `[✅]`   Cascade delete on `auth.users` removal
    *   `[✅]`   Works for any logged-in user regardless of login method (email, Google, or GitHub OAuth)
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — database schema and security policy
  *   `[✅]`   `module`
    *   `[✅]`   Database schema: `github_connections` table — user-to-GitHub App installation mapping
    *   `[✅]`   Boundary: stores installation references consumed by `github-service` and `dialectic-service` edge functions
    *   `[✅]`   Edge functions use the installation ID to generate short-lived access tokens via the GitHub App private key
  *   `[✅]`   `deps`
    *   `[✅]`   `auth.users` table — FK target for `user_id`, infrastructure layer
    *   `[✅]`   GitHub App private key stored in environment variable `GITHUB_APP_PRIVATE_KEY`
    *   `[✅]`   GitHub App ID stored in environment variable `GITHUB_APP_ID`
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `supabase/migrations/YYYYMMDDHHMMSS_create_github_connections.sql`
    *   `[✅]`   `CREATE TABLE public.github_connections` with columns:
      *   `[✅]`   `id uuid PK DEFAULT gen_random_uuid()`
      *   `[✅]`   `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
      *   `[✅]`   `installation_id bigint NOT NULL` — GitHub App installation ID
      *   `[✅]`   `installation_target_type text NOT NULL CHECK (installation_target_type IN ('User', 'Organization'))`
      *   `[✅]`   `installation_target_id bigint NOT NULL` — GitHub account ID that installed the app
      *   `[✅]`   `github_user_id text NOT NULL` — GitHub user numeric ID (fetched from GitHub API after installation)
      *   `[✅]`   `github_username text NOT NULL` — GitHub username (fetched from GitHub API after installation)
      *   `[✅]`   `permissions jsonb` — Snapshot of permissions granted at install time
      *   `[✅]`   `suspended_at timestamptz` — NULL if active; timestamp if user suspended the installation
      *   `[✅]`   `created_at timestamptz NOT NULL DEFAULT now()`
      *   `[✅]`   `updated_at timestamptz NOT NULL DEFAULT now()`
      *   `[✅]`   `UNIQUE(user_id)`
      *   `[✅]`   `UNIQUE(installation_id)` — each installation maps to one Paynless user
    *   `[✅]`   RLS enabled: `ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;`
    *   `[✅]`   Policy `github_connections_select_own`: `USING (auth.uid() = user_id)` for SELECT
    *   `[✅]`   Policy `github_connections_delete_own`: `USING (auth.uid() = user_id)` for DELETE
    *   `[✅]`   No INSERT/UPDATE policy for `authenticated` role — writes go through service role client in edge functions
    *   `[✅]`   Add table and column comments
  *   `[✅]`   `supabase/functions/types_db.ts`
    *   `[✅]`   Regenerate from database schema after migration
    *   `[✅]`   Verify `github_connections` row type appears with all columns
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer
    *   `[✅]`   All dependencies inward (schema definition references `auth.users`)
    *   `[✅]`   Provides table to backend edge functions (`github-service`, `dialectic-service`)
  *   `[✅]`   `requirements`
    *   `[✅]`   Migration applies cleanly on existing database
    *   `[✅]`   RLS prevents cross-user reads/deletes
    *   `[✅]`   Service role can INSERT/UPDATE (for edge function installation storage)
    *   `[✅]`   `types_db.ts` regenerated to include `github_connections`
    *   `[✅]`   Exempt from TDD (database migration / generated types)

*   `[✅]`   [CONFIG] supabase/config.toml **Enable GitHub OAuth provider as optional login method**
  *   `[✅]`   `objective`
    *   `[✅]`   Add `[auth.external.github]` section enabling GitHub as an OAuth sign-in provider (optional login method alongside email and Google)
    *   `[✅]`   Set `enable_manual_linking = true` so users who signed in via email or Google can link a GitHub identity to their existing account
    *   `[✅]`   Document required environment variables for GitHub OAuth App credentials
    *   `[✅]`   **Note:** This is separate from GitHub sync — GitHub App installation provides repo access, OAuth provides identity only
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — Supabase Auth configuration
  *   `[✅]`   `module`
    *   `[✅]`   Auth config: external OAuth providers
    *   `[✅]`   Boundary: enables Supabase Auth to redirect to GitHub and process OAuth callbacks for login
    *   `[✅]`   **Not required for GitHub sync** — sync works via GitHub App installation for any logged-in user
  *   `[✅]`   `deps`
    *   `[✅]`   Supabase Auth service — infrastructure layer
    *   `[✅]`   GitHub OAuth App — external dependency (separate from GitHub App; register at `github.com/settings/applications/new` for OAuth login)
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `supabase/config.toml`
    *   `[✅]`   Change `enable_manual_linking = false` to `enable_manual_linking = true`
    *   `[✅]`   Add `[auth.external.github]` block after `[auth.external.apple]`:
      *   `[✅]`   `enabled = true`
      *   `[✅]`   `client_id = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID)"`
      *   `[✅]`   `secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"`
      *   `[✅]`   `redirect_uri = ""`
      *   `[✅]`   `url = ""`
      *   `[✅]`   `skip_nonce_check = false`
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer
    *   `[✅]`   Provides GitHub OAuth to all auth consumers (authStore `loginWithGitHub`, `linkIdentity`)
  *   `[✅]`   `requirements`
    *   `[✅]`   GitHub OAuth login works end-to-end when env vars are set
    *   `[✅]`   Existing Google OAuth unaffected
    *   `[✅]`   Manual identity linking enabled for all providers
    *   `[✅]`   GitHub sync feature works independently of this OAuth config (sync uses GitHub App, not OAuth)
    *   `[✅]`   Exempt from TDD (configuration file)

*   `[✅]`   [BE] supabase/functions/_shared/adapters/github_adapter **GitHub REST API adapter with interface and backend types**
  *   `[✅]`   `objective`
    *   `[✅]`   Create `IGitHubAdapter` interface defining all GitHub REST API operations needed by the application
    *   `[✅]`   Create `GitHubApiAdapter` implementation that calls the GitHub REST API v3 using `fetch`
    *   `[✅]`   Create backend GitHub types file defining request/response shapes for GitHub API interactions
    *   `[✅]`   Follows the existing adapter/DI pattern used by `AnthropicAdapter`, `OpenAIAdapter`, `StripePaymentAdapter`
  *   `[✅]`   `role`
    *   `[✅]`   Adapter — wraps external GitHub REST API behind an application-owned interface
  *   `[✅]`   `module`
    *   `[✅]`   External integration: GitHub REST API v3
    *   `[✅]`   Boundary: all GitHub HTTP calls flow through this adapter; no other module calls GitHub directly
  *   `[✅]`   `deps`
    *   `[✅]`   GitHub REST API v3 — external dependency, infrastructure layer
    *   `[✅]`   `fetch` (Deno built-in) — HTTP client, infrastructure layer
    *   `[✅]`   Backend GitHub types (`_shared/types/github.types.ts`) — created in this node as support file
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Input: GitHub access token (string) — injected at construction
    *   `[✅]`   All methods return typed response objects or throw typed errors
    *   `[✅]`   No Supabase or database interaction — pure HTTP adapter
  *   `[✅]`   interface/`supabase/functions/_shared/types/github.types.ts`
    *   `[✅]`   `GitHubUser` — `{ id: number; login: string; avatar_url: string; }`
    *   `[✅]`   `GitHubRepo` — `{ id: number; name: string; full_name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string; }`
    *   `[✅]`   `GitHubBranch` — `{ name: string; commit: { sha: string }; protected: boolean; }`
    *   `[✅]`   `GitHubCreateRepoPayload` — `{ name: string; description?: string; private?: boolean; auto_init?: boolean; }`
    *   `[✅]`   `GitHubPushFile` — `{ path: string; content: string; encoding: 'base64' | 'utf-8'; }`
    *   `[✅]`   `GitHubPushResult` — `{ commitSha: string; filesUpdated: number; }`
    *   `[✅]`   `IGitHubAdapter` — interface with methods: `getUser(): Promise<GitHubUser>`, `listRepos(): Promise<GitHubRepo[]>`, `listBranches(owner: string, repo: string): Promise<GitHubBranch[]>`, `createRepo(payload: GitHubCreateRepoPayload): Promise<GitHubRepo>`, `pushFiles(owner: string, repo: string, branch: string, files: GitHubPushFile[], commitMessage: string): Promise<GitHubPushResult>`
  *   `[✅]`   unit/`supabase/functions/tests/_shared/adapters/github_adapter.test.ts`
    *   `[✅]`   Test: constructor stores token, sets `Authorization: Bearer <token>` header on requests
    *   `[✅]`   Test: `getUser` calls `GET https://api.github.com/user` and returns typed `GitHubUser`
    *   `[✅]`   Test: `listRepos` calls `GET https://api.github.com/user/repos` with `sort=updated&per_page=100` and returns `GitHubRepo[]`
    *   `[✅]`   Test: `listBranches` calls `GET https://api.github.com/repos/:owner/:repo/branches` and returns `GitHubBranch[]`
    *   `[✅]`   Test: `createRepo` calls `POST https://api.github.com/user/repos` with JSON body and returns `GitHubRepo`
    *   `[✅]`   Test: `pushFiles` creates blobs, builds tree, creates commit, updates ref — returns `GitHubPushResult`
    *   `[✅]`   Test: non-200 responses throw with status and error message from GitHub API
  *   `[✅]`   `construction`
    *   `[✅]`   `constructor(token: string)` — stores token, creates default headers with `Authorization`, `Accept: application/vnd.github.v3+json`, `User-Agent: paynless-framework`
    *   `[✅]`   All methods are `async` and use `fetch` with the constructed headers
    *   `[✅]`   `pushFiles` uses the Git Trees API for efficient batch commits: `POST /git/blobs` per file, `POST /git/trees`, `POST /git/commits`, `PATCH /git/refs/heads/:branch`
  *   `[✅]`   `github_adapter.ts`
    *   `[✅]`   Import `IGitHubAdapter` and all request/response types from `../types/github.types.ts`
    *   `[✅]`   Implement `GitHubApiAdapter` class satisfying `IGitHubAdapter`
    *   `[✅]`   Private `fetchGitHub<T>(path: string, options?: RequestInit): Promise<T>` helper handling base URL, headers, error checking
    *   `[✅]`   `getUser()` — `GET /user`
    *   `[✅]`   `listRepos()` — `GET /user/repos?sort=updated&per_page=100`
    *   `[✅]`   `listBranches(owner, repo)` — `GET /repos/${owner}/${repo}/branches`
    *   `[✅]`   `createRepo(payload)` — `POST /user/repos` with JSON body, sets `auto_init: true` if not specified
    *   `[✅]`   `pushFiles(owner, repo, branch, files, commitMessage)` — Git Trees API batch commit:
      *   `[✅]`   Get current ref SHA via `GET /repos/${owner}/${repo}/git/ref/heads/${branch}`
      *   `[✅]`   Get current tree SHA from ref
      *   `[✅]`   Create blobs for each file via `POST /repos/${owner}/${repo}/git/blobs`
      *   `[✅]`   Create tree via `POST /repos/${owner}/${repo}/git/trees` with `base_tree`
      *   `[✅]`   Create commit via `POST /repos/${owner}/${repo}/git/commits`
      *   `[✅]`   Update ref via `PATCH /repos/${owner}/${repo}/git/refs/heads/${branch}`
      *   `[✅]`   Return `{ commitSha, filesUpdated: files.length }`
  *   `[✅]`   `directionality`
    *   `[✅]`   Adapter layer
    *   `[✅]`   Dependencies outward: GitHub REST API (external)
    *   `[✅]`   Provides inward: `IGitHubAdapter` interface to `github-service` and `dialectic-service`
  *   `[✅]`   `requirements`
    *   `[✅]`   All GitHub API calls flow through the adapter — no direct `fetch` to `api.github.com` elsewhere
    *   `[✅]`   Token never logged or exposed in error messages
    *   `[✅]`   All unit tests pass with mocked `fetch`
    *   `[✅]`   Adapter is injectable via `IGitHubAdapter` interface

*   `[✅]`   [BE] supabase/functions/_shared/utils/github_token **Generate short-lived GitHub App installation access tokens**
  *   `[✅]`   `objective`
    *   `[✅]`   Create a utility function that generates a short-lived installation access token from the GitHub App's private key and an installation ID
    *   `[✅]`   Signs a JWT with the App's private key (RS256), then exchanges it via `POST /app/installations/{installation_id}/access_tokens`
    *   `[✅]`   Returns the installation access token string for use by `GitHubApiAdapter`
    *   `[✅]`   Tokens are ephemeral (1-hour TTL from GitHub) — never stored, always generated on-demand
  *   `[✅]`   `role`
    *   `[✅]`   Infrastructure — shared utility for GitHub App authentication
  *   `[✅]`   `module`
    *   `[✅]`   GitHub App authentication: installation token generation
    *   `[✅]`   Boundary: called by `github-service` and `dialectic-service` before constructing `GitHubApiAdapter`
  *   `[✅]`   `deps`
    *   `[✅]`   `GITHUB_APP_ID` environment variable — infrastructure layer
    *   `[✅]`   `GITHUB_APP_PRIVATE_KEY` environment variable — infrastructure layer (PEM-encoded RSA private key)
    *   `[✅]`   GitHub REST API `POST /app/installations/{installation_id}/access_tokens` — external dependency
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   Input: `installationId: number`
    *   `[✅]`   Output: `Promise<string>` — the installation access token
    *   `[✅]`   Reads `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` from `Deno.env`
    *   `[✅]`   No Supabase or database interaction — pure crypto + HTTP
  *   `[✅]`   interface/`supabase/functions/_shared/types/github.types.ts`
    *   `[✅]`   `GenerateInstallationTokenDeps` — `{ appId: string; privateKey: string; }`
    *   `[✅]`   `GenerateInstallationTokenParams` — `{ installationId: number; }`
    *   `[✅]`   `IGenerateInstallationToken` — `(deps: GenerateInstallationTokenDeps, params: GenerateInstallationTokenParams) => Promise<string>`
  *   `[✅]`   interface/tests/`supabase/functions/_shared/utils/type-guards/type_guards.github_token.test.ts`
    *   `[✅]`   Test: `GenerateInstallationTokenDeps` satisfies required shape with `appId` and `privateKey` as non-empty strings
    *   `[✅]`   Test: `GenerateInstallationTokenParams` requires `installationId` as number
  *   `[✅]`   interface/guards/`supabase/functions/_shared/utils/type-guards/type_guards.github_token.ts`
    *   `[✅]`   Guard: `isGenerateInstallationTokenDeps` — validates `appId` and `privateKey` are non-empty strings
    *   `[✅]`   Guard: `isGenerateInstallationTokenParams` — validates `installationId` is a positive integer
  *   `[✅]`   unit/`supabase/functions/_shared/utils/github_token.test.ts`
    *   `[✅]`   Test: generates a valid JWT with `iss` set to `appId`, `iat` and `exp` claims, signed with RS256
    *   `[✅]`   Test: calls `POST https://api.github.com/app/installations/{installationId}/access_tokens` with JWT as Bearer token
    *   `[✅]`   Test: returns the `token` field from the GitHub API response
    *   `[✅]`   Test: throws if `privateKey` is missing or empty
    *   `[✅]`   Test: throws if GitHub API returns non-201 response
  *   `[✅]`   `construction`
    *   `[✅]`   Signature: `generateInstallationToken(deps: GenerateInstallationTokenDeps, params: GenerateInstallationTokenParams): Promise<string>`
    *   `[✅]`   JWT payload: `{ iss: deps.appId, iat: Math.floor(Date.now() / 1000) - 60, exp: Math.floor(Date.now() / 1000) + 600 }` signed with RS256 using `deps.privateKey`
    *   `[✅]`   Uses `crypto.subtle.importKey` and `crypto.subtle.sign` for RS256 signing (Deno built-in, no external library)
    *   `[✅]`   HTTP call: `POST /app/installations/${params.installationId}/access_tokens` with `Authorization: Bearer ${jwt}`, `Accept: application/vnd.github.v3+json`
    *   `[✅]`   Return `response.json().token`
  *   `[✅]`   `github_token.ts`
    *   `[✅]`   Import `GenerateInstallationTokenDeps`, `GenerateInstallationTokenParams` from `../types/github.types.ts`
    *   `[✅]`   Implement PEM-to-CryptoKey conversion for RS256 private key
    *   `[✅]`   Implement JWT header + payload + signature construction
    *   `[✅]`   POST to GitHub App installation token endpoint with signed JWT
    *   `[✅]`   Parse response and return `token` string
    *   `[✅]`   Log errors without exposing private key material
  *   `[✅]`   `directionality`
    *   `[✅]`   Infrastructure layer (shared utility)
    *   `[✅]`   Dependencies outward: GitHub REST API (external), environment variables (infrastructure)
    *   `[✅]`   Provides inward: installation token generation to `github-service` and `dialectic-service`
  *   `[✅]`   `requirements`
    *   `[✅]`   JWT is correctly formed per GitHub App authentication spec (RS256, 10-minute max expiry)
    *   `[✅]`   Installation access token is never stored — always generated on-demand
    *   `[✅]`   Private key never logged or exposed in error messages
    *   `[✅]`   All unit tests pass with mocked `fetch` and `crypto.subtle`

*   `[✅]`   [BE] supabase/functions/github-service/index **Edge function handling GitHub App installation storage, connection status, and repo operations**
  *   `[✅]`   `objective`
    *   `[✅]`   Create `github-service` edge function with action-based router handling: `storeInstallation`, `getConnectionStatus`, `disconnectGitHub`, `listRepos`, `listBranches`, `createRepo`
    *   `[✅]`   `storeInstallation`: receives `installationId` from GitHub App callback, generates installation access token via `generateInstallationToken`, validates via `IGitHubAdapter.getUser()`, upserts `github_connections` row with `installation_id` and GitHub identity using admin client
    *   `[✅]`   `getConnectionStatus`: queries `github_connections` for the authenticated user, returns connection state and username
    *   `[✅]`   `disconnectGitHub`: deletes the user's row from `github_connections`
    *   `[✅]`   `listRepos`, `listBranches`, `createRepo`: read `installation_id` from `github_connections`, generate installation access token via `generateInstallationToken`, instantiate `GitHubApiAdapter`, proxy calls to adapter
    *   `[✅]`   All actions require JWT authentication — all are authenticated
  *   `[✅]`   `role`
    *   `[✅]`   Backend adapter — edge function exposing GitHub operations to the frontend via Supabase Functions
  *   `[✅]`   `module`
    *   `[✅]`   GitHub integration: installation lifecycle and repo operations
    *   `[✅]`   Boundary: receives authenticated requests from `GitHubApiClient` (frontend), interacts with `github_connections` table and GitHub API via `IGitHubAdapter`, uses `generateInstallationToken` to create ephemeral access tokens
  *   `[✅]`   `deps`
    *   `[✅]`   `IGitHubAdapter` / `GitHubApiAdapter` from `_shared/adapters/github_adapter.ts` — adapter layer
    *   `[✅]`   `generateInstallationToken` from `_shared/utils/github_token.ts` — infrastructure layer (generates installation access tokens from App credentials)
    *   `[✅]`   Backend GitHub types from `_shared/types/github.types.ts` — domain types
    *   `[✅]`   `github_connections` table — infrastructure layer
    *   `[✅]`   `createSupabaseClient`, `createSupabaseAdminClient` from `_shared/auth.ts` — infrastructure layer
    *   `[✅]`   `handleCorsPreflightRequest`, `createErrorResponse`, `createSuccessResponse` from `_shared/cors-headers.ts` — infrastructure layer
    *   `[✅]`   `logger` from `_shared/logger.ts` — infrastructure layer
    *   `[✅]`   Confirm no reverse dependency is introduced
  *   `[✅]`   `context_slice`
    *   `[✅]`   From request: JWT for user authentication, action name, action-specific payload
    *   `[✅]`   From `github_connections`: user's `installation_id`, GitHub user ID, GitHub username
    *   `[✅]`   From `generateInstallationToken`: ephemeral installation access token (generated on-demand, never stored)
    *   `[✅]`   From `IGitHubAdapter`: GitHub API responses (repos, branches, user info)
    *   `[✅]`   No concrete imports from higher or lateral layers
  *   `[✅]`   unit/`supabase/functions/github-service/index.test.ts`
    *   `[✅]`   Test: `storeInstallation` — receives `installationId`, generates installation token via `generateInstallationToken`, validates via `getUser`, upserts row into `github_connections` with `installation_id` and GitHub identity, returns `{ connected: true, username }`
    *   `[✅]`   Test: `storeInstallation` — returns error if `generateInstallationToken` fails (invalid installation)
    *   `[✅]`   Test: `storeInstallation` — returns error if `getUser` call fails after token generation
    *   `[✅]`   Test: `getConnectionStatus` — returns `{ connected: true, username, github_user_id }` when row exists
    *   `[✅]`   Test: `getConnectionStatus` — returns `{ connected: false }` when no row exists
    *   `[✅]`   Test: `disconnectGitHub` — deletes row from `github_connections`, returns `{ disconnected: true }`
    *   `[✅]`   Test: `listRepos` — reads `installation_id` from `github_connections`, generates installation token, calls `adapter.listRepos()`, returns repos
    *   `[✅]`   Test: `listRepos` — returns error if no GitHub connection exists
    *   `[✅]`   Test: `listBranches` — reads `installation_id`, generates token, calls `adapter.listBranches(owner, repo)`, returns branches
    *   `[✅]`   Test: `createRepo` — reads `installation_id`, generates token, calls `adapter.createRepo(payload)`, returns new repo
    *   `[✅]`   Test: unauthenticated requests return 401
    *   `[✅]`   Test: unknown action returns 400
  *   `[✅]`   `construction`
    *   `[✅]`   `serve` handler with CORS preflight check
    *   `[✅]`   Parse JSON body for `{ action, payload }`
    *   `[✅]`   Authenticate user via `createSupabaseClient(req)` + `getUser()`
    *   `[✅]`   Switch on `action` to dispatch to inline handler functions
    *   `[✅]`   For repo operations: read `installation_id` from `github_connections` using admin client, generate installation access token via `generateInstallationToken`, construct `GitHubApiAdapter(installationToken)`, call adapter method
  *   `[✅]`   `index.ts`
    *   `[✅]`   Import shared auth, CORS, logger utilities
    *   `[✅]`   Import `GitHubApiAdapter`, `generateInstallationToken`, and types
    *   `[✅]`   Helper `getInstallationToken(adminClient, userId)`: queries `github_connections` for user's `installation_id`, calls `generateInstallationToken({ appId, privateKey }, { installationId })` to create ephemeral access token, returns token or null
    *   `[✅]`   Action `storeInstallation`: receive `{ installationId }` from GitHub App callback, call `generateInstallationToken` to get ephemeral token, create `GitHubApiAdapter(token)`, call `getUser()` to validate and get GitHub identity, upsert `github_connections` row with `installation_id`, `github_user_id`, `github_username`, and installation metadata via admin client
    *   `[✅]`   Action `getConnectionStatus`: query `github_connections` for user, return connection shape or `{ connected: false }`
    *   `[✅]`   Action `disconnectGitHub`: delete from `github_connections` where `user_id` matches
    *   `[✅]`   Action `listRepos`: get installation token via helper, create adapter, call `listRepos()`
    *   `[✅]`   Action `listBranches`: get installation token via helper, create adapter, call `listBranches(payload.owner, payload.repo)`
    *   `[✅]`   Action `createRepo`: get installation token via helper, create adapter, call `createRepo(payload)`
  *   `[✅]`   `directionality`
    *   `[✅]`   Adapter layer (edge function)
    *   `[✅]`   Dependencies inward: `IGitHubAdapter` (adapter), `generateInstallationToken` (infrastructure), `github_connections` (infrastructure), auth utilities (infrastructure)
    *   `[✅]`   Provides outward: HTTP API consumed by `GitHubApiClient` in `@paynless/api`
  *   `[✅]`   `requirements`
    *   `[✅]`   Installation access tokens are generated on-demand and never stored — only `installation_id` persists in `github_connections`
    *   `[✅]`   `storeInstallation` validates the installation by generating a token and calling `getUser()` before persisting
    *   `[✅]`   All actions require valid JWT
    *   `[✅]`   All unit tests pass
  *   `[✅]`   **Commit** `feat(be): add github_connections migration, GitHub OAuth config, GitHub adapter, installation token utility, and github-service edge function`
    *   `[✅]`   `supabase/migrations/YYYYMMDDHHMMSS_create_github_connections.sql` — new migration
    *   `[✅]`   `supabase/config.toml` — GitHub OAuth provider enabled, manual linking enabled
    *   `[✅]`   `supabase/functions/_shared/types/github.types.ts` — backend GitHub types + installation token types
    *   `[✅]`   `supabase/functions/_shared/adapters/github_adapter.ts` — `IGitHubAdapter` + `GitHubApiAdapter`
    *   `[✅]`   `supabase/functions/_shared/utils/github_token.ts` — `generateInstallationToken` utility
    *   `[✅]`   `supabase/functions/github-service/index.ts` — new edge function with installation + repo handlers
    *   `[✅]`   `supabase/functions/types_db.ts` — regenerated to include `github_connections`

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
    *   `[ ]`   `github_connections` table — user's GitHub App installation reference (`installation_id`), infrastructure layer, Node 1
    *   `[ ]`   `generateInstallationToken` from `_shared/utils/github_token.ts` — infrastructure layer (generates installation access tokens from App credentials)
    *   `[ ]`   `IGitHubAdapter` / `GitHubApiAdapter` from `_shared/adapters/github_adapter.ts` — adapter layer, Node 3
    *   `[ ]`   `IStorageUtils` from `_shared/types/storage_utils.types.ts` — download files from Supabase storage, infrastructure layer
    *   `[ ]`   `downloadFromStorage` from `_shared/supabase_storage_utils.ts` — infrastructure layer
    *   `[ ]`   Backend GitHub types from `_shared/types/github.types.ts` — domain types, Node 3
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: `{ projectId: string }` from request payload + authenticated user
    *   `[ ]`   From `dialectic_projects.repo_url`: `{ provider, owner, repo, branch, folder }`
    *   `[ ]`   From `dialectic_project_resources`: list of resources with `storage_bucket`, `storage_path`, `file_name`, `mime_type`
    *   `[ ]`   From `github_connections`: user's `installation_id` (used with `generateInstallationToken` to produce ephemeral access token)
    *   `[ ]`   Output: `{ commitSha, filesUpdated, syncedAt }` or error
  *   `[ ]`   interface/`supabase/functions/dialectic-service/dialectic.interface.ts`
    *   `[ ]`   `SyncToGitHubPayload` — `{ projectId: string }`
    *   `[ ]`   `GitHubRepoSettings` — `{ provider: 'github'; owner: string; repo: string; branch: string; folder: string; last_sync_at: string | null; }`
    *   `[ ]`   `SyncToGitHubResponse` — `{ commitSha: string; filesUpdated: number; syncedAt: string; }`
    *   `[ ]`   `UpdateProjectGitHubSettingsPayload` — `{ projectId: string; settings: GitHubRepoSettings; }`
    *   `[ ]`   Add `syncToGitHub` and `updateProjectGitHubSettings` to `DialecticServiceActionPayload` union
  *   `[ ]`   unit/`supabase/functions/dialectic-service/syncToGitHub.test.ts`
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
    *   `[ ]`   Query `github_connections` for user's `installation_id` via admin client
    *   `[ ]`   Generate installation access token via `generateInstallationToken({ appId, privateKey }, { installationId })`
    *   `[ ]`   Construct `GitHubApiAdapter(installationToken)`
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
  *   `[ ]`   unit/`supabase/functions/dialectic-service/index.routing.test.ts`
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

*   `[ ]`   [BE] supabase/functions/github-webhook/index **GitHub App webhook handler for installation lifecycle events**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `github-webhook` edge function that receives POST events from the GitHub App webhook
    *   `[ ]`   Handle `installation` events: `created` (update metadata on existing `github_connections` row if present, no-op if not — row creation is handled by `storeInstallation` redirect flow), `deleted` (remove row), `suspend` (set `suspended_at`), `unsuspend` (clear `suspended_at`)
    *   `[ ]`   Handle `installation_repositories` events: log added/removed repos for future use
    *   `[ ]`   Verify webhook signature using `GITHUB_WEBHOOK_SECRET` to authenticate incoming requests from GitHub
    *   `[ ]`   This endpoint does NOT require JWT authentication — it is called by GitHub's webhook delivery system
  *   `[ ]`   `role`
    *   `[ ]`   Backend adapter — edge function receiving GitHub App lifecycle events
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: webhook lifecycle management
    *   `[ ]`   Boundary: receives POST from GitHub webhook delivery, updates `github_connections` table via admin client
  *   `[ ]`   `deps`
    *   `[ ]`   `GITHUB_WEBHOOK_SECRET` environment variable — infrastructure layer (used to verify webhook HMAC-SHA256 signature)
    *   `[ ]`   `github_connections` table — infrastructure layer
    *   `[ ]`   `createSupabaseAdminClient` from `_shared/auth.ts` — infrastructure layer
    *   `[ ]`   `logger` from `_shared/logger.ts` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: raw HTTP POST body from GitHub with `X-Hub-Signature-256` header, `X-GitHub-Event` header
    *   `[ ]`   From webhook payload: `action`, `installation.id`, `installation.account.id`, `installation.account.login`, `installation.target_type`, `installation.permissions`, `sender.id`
    *   `[ ]`   Output: HTTP 200 on success, HTTP 400/401/500 on error
    *   `[ ]`   No JWT authentication — webhook signature verification replaces JWT
    *   `[ ]`   No dependency on GitHub OAuth identity — user mapping is handled by the `storeInstallation` redirect flow, not the webhook
  *   `[ ]`   interface/`supabase/functions/_shared/types/github.types.ts`
    *   `[ ]`   `GitHubWebhookInstallationPayload` — `{ action: 'created' | 'deleted' | 'suspend' | 'unsuspend'; installation: { id: number; account: { id: number; login: string; }; target_type: 'User' | 'Organization'; permissions: Record<string, string>; }; sender: { id: number; login: string; }; }`
    *   `[ ]`   `GitHubWebhookVerifyDeps` — `{ webhookSecret: string; }`
    *   `[ ]`   `GitHubWebhookVerifyParams` — `{ payload: string; signature: string; }`
  *   `[ ]`   interface/tests/`supabase/functions/_shared/utils/type-guards/type_guards.github_webhook.test.ts`
    *   `[ ]`   Test: `GitHubWebhookInstallationPayload` satisfies required shape with all fields
    *   `[ ]`   Test: `action` field is constrained to `'created' | 'deleted' | 'suspend' | 'unsuspend'`
  *   `[ ]`   interface/guards/`supabase/functions/_shared/utils/type-guards/type_guards.github_webhook.ts`
    *   `[ ]`   Guard: `isGitHubWebhookInstallationPayload` — validates all required fields and action values
    *   `[ ]`   Guard: `isGitHubWebhookVerifyDeps` — validates `webhookSecret` is non-empty string
  *   `[ ]`   unit/`supabase/functions/github-webhook/index.test.ts`
    *   `[ ]`   Test: rejects requests with missing `X-Hub-Signature-256` header (401)
    *   `[ ]`   Test: rejects requests with invalid HMAC signature (401)
    *   `[ ]`   Test: `installation.created` — if `github_connections` row exists for `installation_id`, updates metadata (`permissions`, `installation_target_type`, `installation_target_id`); returns 200
    *   `[ ]`   Test: `installation.created` — if no `github_connections` row exists for `installation_id`, logs event and returns 200 (no-op; row is created by `storeInstallation` redirect flow)
    *   `[ ]`   Test: `installation.deleted` — removes `github_connections` row where `installation_id` matches
    *   `[ ]`   Test: `installation.suspend` — sets `suspended_at` on matching `github_connections` row
    *   `[ ]`   Test: `installation.unsuspend` — clears `suspended_at` on matching `github_connections` row
    *   `[ ]`   Test: unknown event types return 200 (acknowledge but no-op)
    *   `[ ]`   Test: returns 200 on success for all handled events
  *   `[ ]`   `construction`
    *   `[ ]`   `serve` handler — no CORS needed (server-to-server from GitHub)
    *   `[ ]`   Verify HMAC-SHA256 signature: compute `HMAC(GITHUB_WEBHOOK_SECRET, rawBody)`, compare with `X-Hub-Signature-256` header
    *   `[ ]`   Parse JSON body, extract `X-GitHub-Event` header to determine event type
    *   `[ ]`   Switch on event type and `action` to dispatch to handler logic
    *   `[ ]`   For `installation.created`: look up `github_connections` by `installation_id` — if row exists, update metadata (`permissions`, `installation_target_type`, `installation_target_id`); if no row exists, log and no-op (row is created by `storeInstallation` redirect flow, not by webhook)
    *   `[ ]`   For `installation.deleted`: delete from `github_connections` WHERE `installation_id` matches
    *   `[ ]`   For `installation.suspend`/`unsuspend`: UPDATE `github_connections` SET `suspended_at`
  *   `[ ]`   `index.ts`
    *   `[ ]`   Import `createSupabaseAdminClient`, `logger`
    *   `[ ]`   Import webhook types from `_shared/types/github.types.ts`
    *   `[ ]`   Helper `verifyWebhookSignature(secret: string, payload: string, signature: string): boolean` — HMAC-SHA256 verification using `crypto.subtle`
    *   `[ ]`   Handle `installation` event with sub-actions: `created` (metadata update if row exists, no-op if not), `deleted`, `suspend`, `unsuspend`
    *   `[ ]`   Return 200 for all successfully processed events, 401 for signature failures, 400 for malformed payloads
  *   `[ ]`   `supabase/config.toml` (support wiring)
    *   `[ ]`   Add `[functions.github-webhook]` section with `verify_jwt = false` — webhook uses HMAC signature verification, not JWT
  *   `[ ]`   `directionality`
    *   `[ ]`   Adapter layer (edge function, webhook receiver)
    *   `[ ]`   Dependencies inward: `github_connections` (infrastructure), admin client (infrastructure)
    *   `[ ]`   Provides outward: keeps `github_connections` in sync with GitHub App installation state
  *   `[ ]`   `requirements`
    *   `[ ]`   Webhook signature verified on every request — rejects unsigned/mismatched requests
    *   `[ ]`   `installation.deleted` removes connection so user must re-install to reconnect
    *   `[ ]`   `installation.suspend`/`unsuspend` correctly toggles `suspended_at` without deleting the connection
    *   `[ ]`   No JWT required — this is a server-to-server endpoint authenticated by webhook signature
    *   `[ ]`   All unit tests pass
  *   `[ ]`   **Commit** `feat(be): add github-webhook edge function for GitHub App lifecycle events`
    *   `[ ]`   `supabase/functions/_shared/types/github.types.ts` — webhook payload types
    *   `[ ]`   `supabase/functions/_shared/utils/type-guards/type_guards.github_webhook.ts` — webhook type guards
    *   `[ ]`   `supabase/functions/github-webhook/index.ts` — webhook handler edge function
    *   `[ ]`   `supabase/config.toml` — add `[functions.github-webhook]` with `verify_jwt = false`

### Phase 2: Frontend API, Store, and Auth

*   `[ ]`   [API] packages/api/src/github.api **Frontend GitHub API client with types**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `packages/types/src/github.types.ts` — frontend GitHub type definitions independent from dialectic types
    *   `[ ]`   Create `GitHubApiClient` class in `packages/api/src/github.api.ts` following the pattern of `DialecticApiClient`
    *   `[ ]`   All methods call the `github-service` edge function via `this.apiClient.post()`
  *   `[ ]`   `role`
    *   `[ ]`   Port — frontend API adapter bridging stores to backend edge functions
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: frontend API client
    *   `[ ]`   Boundary: provides typed methods consumed by `githubStore` and `authStore`; calls `github-service` edge function
  *   `[ ]`   `deps`
    *   `[ ]`   `ApiClient` from `./apiClient.ts` — infrastructure layer
    *   `[ ]`   `ApiResponse` from `@paynless/types` — domain type
    *   `[ ]`   Frontend GitHub types from `@paynless/types` — domain types (created in this node as support file)
    *   `[ ]`   `logger` from `@paynless/utils` — infrastructure layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   Input: action payloads (installationId for storeInstallation, owner+repo for listBranches, etc.)
    *   `[ ]`   Output: `ApiResponse<T>` for each method
    *   `[ ]`   Auth handled by `ApiClient` — JWT injected automatically
  *   `[ ]`   interface/`packages/types/src/github.types.ts`
    *   `[ ]`   `GitHubConnectionStatus` — `{ connected: boolean; username?: string; githubUserId?: string; }`
    *   `[ ]`   `GitHubRepo` — `{ id: number; name: string; full_name: string; owner: { login: string }; default_branch: string; private: boolean; html_url: string; }`
    *   `[ ]`   `GitHubBranch` — `{ name: string; commit: { sha: string }; protected: boolean; }`
    *   `[ ]`   `GitHubCreateRepoPayload` — `{ name: string; description?: string; private?: boolean; }`
    *   `[ ]`   `GitHubRepoSettings` — `{ provider: 'github'; owner: string; repo: string; branch: string; folder: string; last_sync_at: string | null; }`
    *   `[ ]`   `SyncToGitHubResponse` — `{ commitSha: string; filesUpdated: number; syncedAt: string; }`
    *   `[ ]`   `GitHubApiClient` interface — `storeInstallation(installationId: number)`, `getConnectionStatus()`, `disconnectGitHub()`, `listRepos()`, `listBranches(owner, repo)`, `createRepo(payload)`, `syncToGitHub(projectId)`, `updateProjectGitHubSettings(projectId, settings)`
  *   `[ ]`   unit/`packages/api/src/github.api.test.ts`
    *   `[ ]`   Test: `storeInstallation` posts `{ action: 'storeInstallation', payload: { installationId } }` to `github-service`
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
  *   `[ ]`   `packages/types/src/index.ts` (support wiring)
    *   `[ ]`   Add `export * from './github.types';` to barrel exports
  *   `[ ]`   `packages/types/src/dialectic.types.ts` (support wiring)
    *   `[ ]`   Update `repo_url` from `string | null` to `GitHubRepoSettings | null` — DB column is JSONB (migration `20250613150658`), import `GitHubRepoSettings` from `./github.types`
    *   `[ ]`   Verify existing references to `repo_url` as a string in tests and components; update as needed
  *   `[ ]`   `directionality`
    *   `[ ]`   Port layer (API client)
    *   `[ ]`   Dependencies inward: `ApiClient` (infrastructure), types (domain)
    *   `[ ]`   Provides outward: typed API methods to `githubStore` and `authStore`
  *   `[ ]`   `requirements`
    *   `[ ]`   All methods match the backend `github-service` and `dialectic-service` action contracts
    *   `[ ]`   Error handling follows existing `DialecticApiClient` pattern (try/catch, network error wrapping)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [API] packages/api/src/apiClient **Wire `GitHubApiClient` into `ApiClient` class and `api` export object**
  *   `[ ]`   `objective`
    *   `[ ]`   Add `github` property to `ApiClient` class, instantiate `GitHubApiClient` in constructor
    *   `[ ]`   Add `github` accessor to the `api` export object following existing pattern (`api.dialectic()`, `api.wallet()`)
  *   `[ ]`   unit/`packages/api/src/apiClient.test.ts`
    *   `[ ]`   Test: `api.github()` returns a `GitHubApiClient` instance
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `apiClient.ts`
    *   `[ ]`   Import `GitHubApiClient` from `./github.api`
    *   `[ ]`   Add `public github: GitHubApiClient;` property
    *   `[ ]`   Add `this.github = new GitHubApiClient(this);` in constructor
    *   `[ ]`   Add `github: () => getApiClient().github,` to `api` export object
  *   `[ ]`   `requirements`
    *   `[ ]`   `api.github()` accessor works following existing pattern
    *   `[ ]`   All existing tests pass

*   `[ ]`   [STORE] packages/store/src/authStore **Add `loginWithGitHub` and `linkGitHubAccount` for GitHub OAuth identity (no repo scopes)**
  *   `[ ]`   `objective`
    *   `[ ]`   Implement `loginWithGitHub()` action mirroring the existing `loginWithGoogle()` pattern — GitHub OAuth is for identity only, no special scopes required (repo access is handled by GitHub App installation, not OAuth)
    *   `[ ]`   Implement `linkGitHubAccount()` action using `supabase.auth.linkIdentity({ provider: 'github' })` for existing users to add GitHub identity to their account
    *   `[ ]`   Update `handleOAuthLogin('github')` to call `loginWithGitHub()` instead of throwing
    *   `[ ]`   **No `provider_token` capture needed** — repo access tokens are generated on-demand from the GitHub App installation, not from OAuth
  *   `[ ]`   `role`
    *   `[ ]`   App layer — state management for authentication
  *   `[ ]`   `module`
    *   `[ ]`   Auth: GitHub OAuth login and identity linking (identity only — no repo scopes)
    *   `[ ]`   Boundary: calls Supabase Auth SDK only — no dependency on `GitHubApiClient` (repo access is via GitHub App installation)
  *   `[ ]`   `deps`
    *   `[ ]`   Supabase Auth SDK (`signInWithOAuth`, `linkIdentity`) — infrastructure layer
    *   `[ ]`   `AuthStore` interface from `@paynless/types` — domain types (add `loginWithGitHub` and `linkGitHubAccount` to interface)
    *   `[ ]`   Confirm no reverse dependency is introduced — no dependency on `GitHubApiClient` (repo access is handled by GitHub App installation flow, not OAuth)
  *   `[ ]`   `context_slice`
    *   `[ ]`   `loginWithGitHub()`: calls `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })` — no special scopes, identity only
    *   `[ ]`   `linkGitHubAccount()`: calls `supabase.auth.linkIdentity({ provider: 'github', options: { redirectTo } })` — no special scopes, identity only
    *   `[ ]`   No `provider_token` capture in `onAuthStateChange` — GitHub App installation flow handles repo access separately
  *   `[ ]`   interface/`packages/types/src/auth.types.ts`
    *   `[ ]`   Add `loginWithGitHub: () => Promise<void>` to `AuthStore` interface
    *   `[ ]`   Add `linkGitHubAccount: () => Promise<void>` to `AuthStore` interface
  *   `[ ]`   unit/`packages/store/src/authStore.test.ts`
    *   `[ ]`   Test: `loginWithGitHub` calls `supabase.auth.signInWithOAuth` with `provider: 'github'` and no repo scopes
    *   `[ ]`   Test: `loginWithGitHub` sets `isLoading` during call and clears after
    *   `[ ]`   Test: `loginWithGitHub` sets `error` on failure
    *   `[ ]`   Test: `handleOAuthLogin('github')` calls `loginWithGitHub` (no longer throws)
    *   `[ ]`   Test: `linkGitHubAccount` calls `supabase.auth.linkIdentity` with `provider: 'github'` and no repo scopes
  *   `[ ]`   `construction`
    *   `[ ]`   `loginWithGitHub` mirrors `loginWithGoogle` exactly, substituting `provider: 'github'` — no special scopes (identity only)
    *   `[ ]`   `linkGitHubAccount` uses `linkIdentity` (Supabase Auth method for adding an identity to an existing user) — no special scopes
    *   `[ ]`   No token capture logic needed — GitHub App installation flow is separate from OAuth authentication
  *   `[ ]`   `authStore.ts`
    *   `[ ]`   Add `loginWithGitHub` action (pattern mirrors `loginWithGoogle` at lines 155-184, substituting `provider: 'github'`, no special scopes)
    *   `[ ]`   Add `linkGitHubAccount` action
    *   `[ ]`   Update `handleOAuthLogin` switch: change `case 'github': throw` to `case 'github': return get().loginWithGitHub()`
    *   `[ ]`   No changes to `initAuthListener` — GitHub App installation flow is handled separately via the GitHubAuthCallback page
  *   `[ ]`   `directionality`
    *   `[ ]`   App layer (store)
    *   `[ ]`   Dependencies inward: Supabase Auth SDK (infrastructure) — no dependency on `GitHubApiClient` for auth (repo access is via GitHub App installation)
    *   `[ ]`   Provides outward: `loginWithGitHub`, `linkGitHubAccount` actions to UI components
  *   `[ ]`   `requirements`
    *   `[ ]`   `loginWithGitHub` works end-to-end: redirects to GitHub, comes back, user is authenticated (identity only, no repo scopes)
    *   `[ ]`   `linkGitHubAccount` adds GitHub identity to existing user account (identity only, no repo scopes)
    *   `[ ]`   Existing `loginWithGoogle` and email login unaffected
    *   `[ ]`   No `provider_token` capture — repo access handled by GitHub App installation
    *   `[ ]`   All unit tests pass

*   `[ ]`   [STORE] packages/store/src/githubStore **GitHub connection state, repo/branch listing, and sync actions**
  *   `[ ]`   `objective`
    *   `[ ]`   Create `githubStore` as an independent Zustand store slice for GitHub integration state
    *   `[ ]`   Store GitHub App installation references via `storeInstallation` action (called from GitHubAuthCallback after App installation)
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
    *   `[ ]`   Actions: `storeInstallation`, `fetchConnectionStatus`, `disconnectGitHub`, `fetchRepos`, `fetchBranches`, `createRepo`, `syncToGitHub`, `updateProjectGitHubSettings`
  *   `[ ]`   interface/`packages/types/src/github.types.ts` (extend from Node 7)
    *   `[ ]`   `GitHubStoreState` — all state fields listed above
    *   `[ ]`   `GitHubStoreActions` — all action signatures including `storeInstallation(installationId: number): Promise<void>`
    *   `[ ]`   `GitHubStore` — `GitHubStoreState & GitHubStoreActions`
  *   `[ ]`   unit/`packages/store/src/githubStore.test.ts`
    *   `[ ]`   Test: `storeInstallation` calls `api.github.storeInstallation(installationId)` and updates `connectionStatus` on success
    *   `[ ]`   Test: `storeInstallation` sets `isLoadingConnection` during call and `connectionError` on failure
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
    *   `[ ]`   Implement all actions: `storeInstallation`, `fetchConnectionStatus`, `disconnectGitHub`, `fetchRepos`, `fetchBranches`, `createRepo`, `syncToGitHub`, `updateProjectGitHubSettings`, `reset`
    *   `[ ]`   Export `useGitHubStore` hook
  *   `[ ]`   `packages/store/src/index.ts` (support wiring)
    *   `[ ]`   Add `export * from './githubStore';` to barrel exports
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
    *   `[ ]`   When disconnected: show "Connect GitHub" button that redirects to the GitHub App installation page (`https://github.com/apps/paynless-app/installations/new`) — repo access is granted via App installation, not OAuth
    *   `[ ]`   When connected: show GitHub username and "Disconnect" button that calls `disconnectGitHub()` from `githubStore`
    *   `[ ]`   Fetches connection status on mount via `githubStore.fetchConnectionStatus()`
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — profile settings card
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: connection management UI
    *   `[ ]`   Boundary: reads from `githubStore`, redirects to GitHub App installation page for connect, calls `githubStore.disconnectGitHub()` for disconnect
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer, Node 9
    *   `[ ]`   GitHub App installation URL (`https://github.com/apps/paynless-app/installations/new`) — external link, configurable via environment variable
    *   `[ ]`   `GitHubConnectionStatus` from `@paynless/types` — domain type, Node 7
    *   `[ ]`   `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card` — UI layer
    *   `[ ]`   `Button` from `@/components/ui/button` — UI layer
    *   `[ ]`   `toast` from `sonner` — UI layer
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From `useGitHubStore`: `connectionStatus`, `isLoadingConnection`, `connectionError`, `fetchConnectionStatus`, `disconnectGitHub`
    *   `[ ]`   GitHub App installation URL from environment config (no store dependency for connect action)
  *   `[ ]`   unit/`apps/web/src/components/profile/GitHubConnectionCard.test.tsx`
    *   `[ ]`   Test: calls `fetchConnectionStatus` on mount
    *   `[ ]`   Test: shows loading skeleton while `isLoadingConnection` is true
    *   `[ ]`   Test: when disconnected, renders "Connect GitHub" button
    *   `[ ]`   Test: clicking "Connect GitHub" navigates to GitHub App installation URL
    *   `[ ]`   Test: when connected, renders GitHub username and "Disconnect" button
    *   `[ ]`   Test: clicking "Disconnect" calls `disconnectGitHub()` and shows success toast
    *   `[ ]`   Test: shows error state when `connectionError` is set
  *   `[ ]`   `construction`
    *   `[ ]`   `export const GitHubConnectionCard: React.FC`
    *   `[ ]`   `useEffect` on mount: call `fetchConnectionStatus()`
    *   `[ ]`   Conditional render based on `connectionStatus?.connected`
    *   `[ ]`   "Connect GitHub" navigates to `https://github.com/apps/paynless-app/installations/new` (returns to `/github-auth` callback after install)
  *   `[ ]`   `GitHubConnectionCard.tsx`
    *   `[ ]`   Import `useGitHubStore` from `@paynless/store`
    *   `[ ]`   Import Card components and Button from UI primitives
    *   `[ ]`   Fetch connection status on mount
    *   `[ ]`   Render card with title "GitHub" and description
    *   `[ ]`   Connected state: show `@username`, "Disconnect" button
    *   `[ ]`   Disconnected state: show "Connect GitHub" button
    *   `[ ]`   Loading state: show skeleton
    *   `[ ]`   Error state: show error message
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer
    *   `[ ]`   Dependencies inward: `githubStore` (app), types (domain), UI primitives (UI) — no `authStore` dependency (connect uses external URL redirect)
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

*   `[ ]`   [UI] apps/web/src/pages/GitHubAuthCallback **Handle GitHub App installation redirect and store installation reference**
  *   `[ ]`   `objective`
    *   `[ ]`   Create a frontend route page at `/github-auth` that handles the redirect from GitHub after a user installs the GitHub App
    *   `[ ]`   Parse `installation_id` and `setup_action` from URL query parameters (provided by GitHub's redirect)
    *   `[ ]`   Call `githubStore.storeInstallation(installationId)` to persist the installation reference server-side
    *   `[ ]`   Show loading state during the store operation, success/error feedback, then redirect to Profile page
    *   `[ ]`   Handle edge cases: missing `installation_id`, `setup_action=request` (permissions requested but not yet granted), unauthenticated users
  *   `[ ]`   `role`
    *   `[ ]`   UI layer — callback page handling GitHub App installation redirect
  *   `[ ]`   `module`
    *   `[ ]`   GitHub integration: installation callback handler
    *   `[ ]`   Boundary: parses URL params, calls `githubStore.storeInstallation()`, redirects to Profile
  *   `[ ]`   `deps`
    *   `[ ]`   `useGitHubStore` from `@paynless/store` — app layer (for `storeInstallation`, `isLoadingConnection`, `connectionError`)
    *   `[ ]`   `useAuthStore` from `@paynless/store` — app layer (to verify user is authenticated before storing installation)
    *   `[ ]`   `useSearchParams`, `useNavigate` from `react-router-dom` — UI layer (URL parsing and navigation)
    *   `[ ]`   `toast` from `sonner` — UI layer (success/error feedback)
    *   `[ ]`   Confirm no reverse dependency is introduced
  *   `[ ]`   `context_slice`
    *   `[ ]`   From URL: `installation_id` (number), `setup_action` (`'install'` | `'update'` | `'request'`)
    *   `[ ]`   From `useGitHubStore`: `storeInstallation`, `isLoadingConnection`, `connectionError`
    *   `[ ]`   From `useAuthStore`: `user` (must be authenticated)
    *   `[ ]`   Output: redirect to `/profile` on success, error display on failure
  *   `[ ]`   unit/`apps/web/src/pages/GitHubAuthCallback.test.tsx`
    *   `[ ]`   Test: parses `installation_id` from URL query params and calls `storeInstallation(installationId)`
    *   `[ ]`   Test: shows loading spinner while `isLoadingConnection` is true
    *   `[ ]`   Test: redirects to `/profile` on successful installation storage
    *   `[ ]`   Test: shows error toast and message when `connectionError` is set
    *   `[ ]`   Test: shows error when `installation_id` is missing from URL
    *   `[ ]`   Test: shows message when `setup_action` is `'request'` (permissions pending)
    *   `[ ]`   Test: redirects to `/login` when user is not authenticated
  *   `[ ]`   `construction`
    *   `[ ]`   `export const GitHubAuthCallback: React.FC`
    *   `[ ]`   `useEffect` on mount: parse `installation_id` from `useSearchParams`, if present call `storeInstallation(Number(installationId))`
    *   `[ ]`   `useEffect` on `connectionError`/`isLoadingConnection`: when loading completes without error, toast success and navigate to `/profile`
    *   `[ ]`   Guard: if no `user`, redirect to `/login`
  *   `[ ]`   `GitHubAuthCallback.tsx`
    *   `[ ]`   Import `useGitHubStore`, `useAuthStore` from `@paynless/store`
    *   `[ ]`   Import `useSearchParams`, `useNavigate` from `react-router-dom`
    *   `[ ]`   Import `toast` from `sonner`
    *   `[ ]`   Parse `installation_id` and `setup_action` from search params
    *   `[ ]`   If `setup_action === 'request'`: render "Permissions requested — waiting for approval" message
    *   `[ ]`   If `installation_id` present: call `storeInstallation`, show loading, redirect on success
    *   `[ ]`   If `installation_id` missing: render error state
  *   `[ ]`   `directionality`
    *   `[ ]`   UI layer (page)
    *   `[ ]`   Dependencies inward: `githubStore` (app), `authStore` (app), router (UI)
    *   `[ ]`   Provides outward: handles GitHub App installation redirect for end users
  *   `[ ]`   `requirements`
    *   `[ ]`   GitHub App redirect URL `https://paynless.app/github-auth` is handled by this page
    *   `[ ]`   Installation reference is stored server-side via `githubStore.storeInstallation()` → `api.github.storeInstallation()` → `github-service.storeInstallation`
    *   `[ ]`   User sees clear feedback: loading during store, success toast + redirect, or error message
    *   `[ ]`   Unauthenticated users are redirected to login (they must log in before installing the App)
    *   `[ ]`   All unit tests pass

*   `[ ]`   [UI] apps/web/src/routes/routes **Add `/github-auth` route for GitHub App installation callback**
  *   `[ ]`   `objective`
    *   `[ ]`   Add route entry for `/github-auth` pointing to `GitHubAuthCallback` component
    *   `[ ]`   Route should be wrapped in `ProtectedRoute` (user must be authenticated before installing GitHub App)
  *   `[ ]`   unit/`apps/web/src/routes/routes.test.tsx`
    *   `[ ]`   Test: `/github-auth` route renders `GitHubAuthCallback` component
    *   `[ ]`   Test: `/github-auth` route is protected (requires authentication)
    *   `[ ]`   Existing tests continue to pass unchanged
  *   `[ ]`   `routes.tsx`
    *   `[ ]`   Add lazy import for `GitHubAuthCallback`
    *   `[ ]`   Add `{ path: '/github-auth', element: <ProtectedRoute><GitHubAuthCallback /></ProtectedRoute> }` to routes array
  *   `[ ]`   `requirements`
    *   `[ ]`   Route matches the GitHub App redirect URL `https://paynless.app/github-auth`
    *   `[ ]`   Unauthenticated users are redirected by `ProtectedRoute`
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
    *   `[ ]`   `packages/types/src/index.ts` — barrel export for github types
    *   `[ ]`   `packages/types/src/dialectic.types.ts` — update `repo_url` type to `GitHubRepoSettings | null`
    *   `[ ]`   `packages/api/src/github.api.ts` — GitHub API client
    *   `[ ]`   `packages/api/src/apiClient.ts` — wire `GitHubApiClient` accessor
    *   `[ ]`   `packages/api/src/apiClient.test.ts` — test for `api.github()` accessor
    *   `[ ]`   `packages/types/src/auth.types.ts` — add `loginWithGitHub`, `linkGitHubAccount` to `AuthStore`
    *   `[ ]`   `packages/store/src/authStore.ts` — GitHub login and link actions
    *   `[ ]`   `packages/store/src/githubStore.ts` — new GitHub store slice
    *   `[ ]`   `packages/store/src/index.ts` — barrel export for githubStore
    *   `[ ]`   `apps/web/src/components/auth/LoginForm.tsx` — GitHub login button
    *   `[ ]`   `apps/web/src/components/profile/GitHubConnectionCard.tsx` — connection management card
    *   `[ ]`   `apps/web/src/pages/Profile.tsx` — render connection card
    *   `[ ]`   `apps/web/src/pages/GitHubAuthCallback.tsx` — GitHub App installation callback
    *   `[ ]`   `apps/web/src/routes/routes.tsx` — add `/github-auth` route
    *   `[ ]`   `apps/web/src/routes/routes.test.tsx` — test for `/github-auth` route
    *   `[ ]`   `apps/web/src/components/dialectic/GitHubRepoSettings.tsx` — repo/branch/folder picker
    *   `[ ]`   `apps/web/src/components/dialectic/SyncToGitHubButton.tsx` — sync trigger button
    *   `[ ]`   `apps/web/src/pages/DialecticProjectDetailsPage.tsx` — render repo settings and sync button


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
- SessionInfoCard uses formal names instead of friendly names 

## 504 Gateway Timeout on back end  
- Not failed, not running 
- Sometimes eventually resolves

## Set Free accounts to Gemini Flash only 
- Claude & ChatGPT only for paid
- Paying customers get BYOK (heavy lift)

## Front end hydration problems
- n/n Done does not up date real, only on refresh
- SubmitResponsesButton does not appear when docs are done 
- "Review" stage does not reliably advance 
