# Integrations and Analytics. 

## Problem Statement
- The application provides ExportProject for a zip file.
- Users have to manually extract the desired files and move them to their consumption site.
- The application needs to have native integration for popular repo and project platforms. 
- Analytics are bare-bones and most user interactions are not collected. 

## Objectives
- Github integration for exporting plans to repos. 
- Site builder integration for beginning projects. 
-- Bolt.new
-- Lovable.dev
-- v0
-- Replit
- Rich analytics that collect data on all user interaction touchpoints in the app. 

## Expected Outcome
- Users can sync their plans to their repo.
- Users can immediately launch a project using the plans. 
- All user interactions in the UI are collected and analyzed. 


## Instructions for Agent
*   You MUST read the file every time you need to touch it. YOU CAN NOT RELY ON YOUR "MEMORY" of having read a file at some point previously. YOU MUST READ THE FILE FROM DISK EVERY TIME! 
*   You MUST read the file BEFORE YOU TRY TO EDIT IT. Your edit WILL NOT APPLY if you do not read the file. 
*   To edit a file, READ the file so you have its state. EDIT the file precisely, ONLY changing EXACTLY what needs modified and nothing else. Then READ the file to ensure the change applied. 
*   DO NOT rewrite files or refactor functions unless explicitly instructed to. 
*   DO NOT write to a file you aren't explicitly instructed to edit. 
*   We use strict explicit typing everywhere, always. 
    * There are only two exceptions: 
        * We cannot strictly type Supabase clients
        * When we test graceful error handling, we often need to pass in malformed objects that must be typecast to pass linting to permit testing of improperly shaped objects. 
*   We only edit a SINGLE FILE at a time. We NEVER edit multiple files in one turn.
*   We do EXACTLY what the instruction in the checklist step says without exception.
*   If we cannot perform the step as described or make a discovery, we explain the problem or discovery and HALT! We DO NOT CONTINUE after we encounter a problem or a discovery.
*   We DO NOT CONTINUE if we encounter a problem or make a discovery. We explain the problem or discovery then halt for user input. 
*   If our discovery is that more files need to be edited, instead of editing a file, we generate a proposal for a checklist of instructions to insert into the work plan that explains everything required to update the codebase so that the invalid step can be resolved. 
*   DO NOT RUMINATE ON HOW TO SOLVE A PROBLEM OR DISCOVERY WHILE ONLY EDITING ONE FILE! That is a DISCOVERY that requires that you EXPLAIN your discovery, PROPOSE a solution, and HALT! 
*   We always use test-driven-development. 
    *   We write a RED test that we expect to fail to prove the flaw or incomplete code. 
        *   A RED test is written to the INTENDED SUCCESS STATE so that it is NOT edited again. Do NOT refer to "RED: x condition now, y condition later", which forces the test to be edited after the GREEN step. Do NOT title the test to include any reference to RED/GREEN. Tests are stateless. 
        *   We implement the edit to a SINGLE FILE to enable the GREEN state.
        *   We run the test again and prove it passes. We DO NOT edit the test unless we discover the test is itself flawed. 
*   EVERY EDIT is performed using TDD. We DO NOT EDIT ANY FILE WITHOUT A TEST. 
    *   Documents, types, and interfaces cannot be tested, so are exempt. 
*   Every edit is documented in the checklist of instructions that describe the required edits. 
*   Whenever we discover an edit must be made that is not documented in the checklist of instructions, we EXPLAIN the discovery, PROPOSE an insertion into the instruction set that describes the required work, and HALT. 
    *   We build dependency ordered instructions so that the dependencies are built, tested, and working before the consumers of the dependency. 
*   We use dependency injection for EVERY FILE. 
*   We build adapters and interfaces for EVERY FUNCTION.  
*   We edit files from the lowest dependency on the tree up to the top so that our tests can be run at every step.
*   We PROVE tests pass before we move to the next file. We NEVER proceed without explicit demonstration that the tests pass. 
*   The tests PROVE the functional gap, PROVE the flaw in the function, and prevent regression by ensuring that any changes MUST comply with the proof. 
*   Our process to edit a file is: 
    *   READ the instruction for the step, and read every file referenced by the instruction or step, or implicit by the instruction or step (like types and interfaces).
    *   ANALYZE the difference between the state of the file and the state described by the instructions in the step.
    *   EXPLAIN how the file must be edited to transform it from its current state into the state described by the instructions in the step. 
    *   PROPOSE an edit to the file that will accomplish the transformation while preserving strict explicit typing. 
    *   LINT! After editing the file, run your linter and fix all linter errors that are fixable within that single file. 
    *   HALT! After editing ONE file and ensuring it passes linting, HALT! DO NOT CONTINUE! 
*   The agent NEVER runs tests. 
*   The agent uses ITS OWN TOOLS. 
*   The agent DOES NOT USE THE USER'S TERMINAL. 

## Legend - You must use this EXACT format. Do not modify it, adapt it, or "improve" it. The bullets, square braces, ticks, nesting, and numbering are ABSOLUTELY MANDATORY and UNALTERABLE. 

*   `[ ]` 1. Unstarted work step. Each work step will be uniquely named for easy reference. We begin with 1.
    *   `[ ]` 1.a. Work steps will be nested as shown. Substeps use characters, as is typical with legal documents.
        *   `[ ]` 1. a. i. Nesting can be as deep as logically required, using roman numerals, according to standard legal document numbering processes.
*   `[✅]` Represents a completed step or nested set.
*   `[🚧]` Represents an incomplete or partially completed step or nested set.
*   `[⏸️]` Represents a paused step where a discovery has been made that requires backtracking or further clarification.
*   `[❓]` Represents an uncertainty that must be resolved before continuing.
*   `[🚫]` Represents a blocked, halted, or stopped step or has an unresolved problem or prior dependency to resolve before continuing.

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   `[DB]` Database Schema Change (Migration)
*   `[RLS]` Row-Level Security Policy
*   `[BE]` Backend Logic (Edge Function / RLS / Helpers / Seed Data)
*   `[API]` API Client Library (`@paynless/api` - includes interface definition in `interface.ts`, implementation in `adapter.ts`, and mocks in `mocks.ts`)
*   `[STORE]` State Management (`@paynless/store` - includes interface definition, actions, reducers/slices, selectors, and mocks)
*   `[UI]` Frontend Component (e.g., in `apps/web`, following component structure rules)
*   `[CLI]` Command Line Interface component/feature
*   `[IDE]` IDE Plugin component/feature
*   `[TEST-UNIT]` Unit Test Implementation/Update
*   `[TEST-INT]` Integration Test Implementation/Update (API-Backend, Store-Component, RLS)
*   `[TEST-E2E]` End-to-End Test Implementation/Update
*   `[DOCS]` Documentation Update (READMEs, API docs, user guides)
*   `[REFACTOR]` Code Refactoring Step
*   `[PROMPT]` System Prompt Engineering/Management
*   `[CONFIG]` Configuration changes (e.g., environment variables, service configurations)
*   `[COMMIT]` Checkpoint for Git Commit (aligns with "feat:", "test:", "fix:", "docs:", "refactor:" conventions)
*   `[DEPLOY]` Checkpoint for Deployment consideration after a major phase or feature set is complete and tested.

---

## Integrations - Github (enables Cursor, Windsurf, Roo, Cline, Claude Code, Firebase)
[ ] 1. [API/OAUTH] GitHub OAuth initiation and callback
    [ ] a. [TEST-UNIT] Add failing tests for OAuth endpoints
        [ ] i. File: `supabase/functions/GitHub/index.test.ts`
            - New actions: `githubAuthStart` returns a redirect URL to GitHub with correct client_id, scopes (repo, workflow), and state.
            - `githubAuthCallback` exchanges code for access token; persists token for the user.
    [ ] b. [BE] Implement endpoints
        [ ] i. Files:
            - `supabase/functions/GitHub/githubAuthStart.ts`
            - `supabase/functions/GitHub/githubAuthCallback.ts`
        [ ] ii. Store token securely (e.g., `user_oauth_credentials` table with provider='github', encrypted token, user_id foreign key).
    [ ] c. [DB/MIGRATION] Create `user_oauth_credentials` with fields: id, user_id, provider, encrypted_access_token, refresh_token (nullable), scopes, created_at, updated_at.
    [ ] d. [CONFIG] Add env vars: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OAUTH_REDIRECT_URL.
    [ ] e. [COMMIT] feat(api,db): GitHub OAuth start/callback and credential storage

[ ] 2. [API] GitHub identity fetch
    [ ] a. [TEST-UNIT] Add failing test: `githubGetIdentity` returns `{ login, name, email, avatar_url }` for authenticated user.
        [ ] i. File: `supabase/functions/GitHub/index.test.ts`
    [ ] b. [BE] Implement `githubGetIdentity.ts` using stored token.
    [ ] c. [COMMIT] feat(api): fetch GitHub identity for current user

[ ] 3. [API] List or create repository
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `githubListRepos` returns paginated list with `{ full_name, default_branch, permissions }`.
        [ ] ii. `githubCreateRepo` creates repo under user or org; returns `{ full_name, default_branch }`.
        [ ] iii. Validate permission to push.
        [ ] iv. File: `supabase/functions/GitHub/index.test.ts`
    [ ] b. [BE] Implement:
        [ ] i. `githubListRepos.ts` (supports pagination, optional org filter)
        [ ] ii. `githubCreateRepo.ts` (visibility, description)
    [ ] c. [COMMIT] feat(api): list/create GitHub repositories

[ ] 4. [API] List branches and create branch (optional)
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `githubListBranches` returns branches and default branch.
        [ ] ii. `githubCreateBranch` creates a branch from default or given base SHA.
    [ ] b. [BE] Implement:
        [ ] i. `githubListBranches.ts`
        [ ] ii. `githubCreateBranch.ts`
    [ ] c. [COMMIT] feat(api): branch listing/creation

[ ] 5. [API] Export project tree to GitHub
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `githubExportProject` payload: `{ projectId, repoFullName, branch, commitMessage }`
            - Reads file tree using `FileManagerService` path rules (download via storage utils).
            - Creates commit via GitHub API (prefer tree/commit API for batch).
            - Creates PR if branch != default (optional).
        [ ] ii. Validates binary vs text mime types; preserves directories from `constructStoragePath`.
        [ ] iii. File: `supabase/functions/GitHub/index.test.ts`
    [ ] b. [BE] Implement `githubExportProject.ts`
        [ ] i. Walk project files from storage (resources + contributions), reconstruct canonical paths using `path_constructor`/metadata, upload blobs, create tree and commit to selected branch.
    [ ] c. [COMMIT] feat(api): export project tree to GitHub

[ ] 6. [API/CLIENT] Frontend API methods
    [ ] a. [TEST-UNIT] Add failing tests in `packages/api/src/github.api.test.ts`
        [ ] i. Methods: `githubAuthStart`, `githubAuthCallback`, `githubGetIdentity`, `githubListRepos`, `githubCreateRepo`, `githubListBranches`, `githubCreateBranch`, `githubExportProject`.
    [ ] b. [API] Implement in `packages/api/src/dialectic.api.ts`
    [ ] c. [COMMIT] feat(api): client methods for GitHub integration

[ ] 7. [STORE] State/actions for GitHub integration
    [ ] a. [TEST-UNIT] Add failing tests in `packages/store/src/gitHubStore.test.ts`
        [ ] i. State: `githubIdentity`, `githubRepos`, `githubBranches`, `isGitHubLinked`, loading/error states.
        [ ] ii. Actions: `linkGitHub`, `fetchGitHubIdentity`, `fetchGitHubRepos`, `createGitHubRepo`, `fetchGitHubBranches`, `createGitHubBranch`, `exportProjectToGitHub`.
    [ ] b. [STORE] Implement in `packages/store/src/gitHubStore.ts`
    [ ] c. [COMMIT] feat(store): GitHub integration state and actions

[ ] 8. [UI] GitHubConnectButton + GitHubExportDialog
    [ ] a. [TEST-UNIT] Add failing tests:
        [ ] i. `GitHubConnectButton` initiates OAuth, reflects linked status.
        [ ] ii. `GitHubExportDialog` flow: pick identity (readonly), select repo or create, pick branch or create, confirm export; shows progress/success/failure.
        [ ] iii. Files:
            - `apps/web/src/components/gitHub/GitHubConnectButton.test.tsx`
            - `apps/web/src/components/gitHub/GitHubExportDialog.test.tsx`
    [ ] b. [UI] Implement:
        [ ] i. `GitHubConnectButton.tsx`
        [ ] ii. `GitHubExportDialog.tsx`
            - Uses store actions; validates permissions; disables actions during async.
    [ ] c. [UI] Integration:
        [ ] i. Add `GitHubConnectButton` to settings/profile menu.
        [ ] ii. Add “Export to GitHub” button beside “Export Project” on project and session pages, opening `GitHubExportDialog`.
    [ ] d. [COMMIT] feat(ui): GitHub OAuth/connect and export dialog

[ ] 9. [TEST-INT] End-to-end happy path
    [ ] a. Simulate linked GitHub account, list repos, create/select repo, list/create branch, export, verify 200 OK and commit URL in response.
    [ ] b. [COMMIT] test(int): GitHub export end-to-end

[ ] 10. [DOCS] Document GitHub integration
    [ ] a. Explain permissions, OAuth setup, environment configuration, and limitations.
    [ ] b. [COMMIT] docs: GitHub integration guide

[ ] 11. [API] “Support the Project” actions (Star / Watch / Fork)
    [ ] a. [TEST-UNIT] Add failing tests (JSON actions)
        [ ] i. File: `supabase/functions/dialectic-service/index.test.ts`
            - `githubStarRepo({ owner, repo })` → 204/304 on success
            - `githubWatchRepo({ owner, repo })` → 200 subscription object
            - `githubForkRepo({ owner, repo, org? })` → 202 fork initiated
    [ ] b. [BE] Implement handlers (REST GitHub API)
        [ ] i. Files:
            - `githubStarRepo.ts` (PUT /user/starred/{owner}/{repo})
            - `githubWatchRepo.ts` (PUT /repos/{owner}/{repo}/subscription payload: {subscribed:true})
            - `githubForkRepo.ts` (POST /repos/{owner}/{repo}/forks)
        [ ] ii. Use stored GitHub token; require scopes including `repo`.
    [ ] c. [CONFIG] Add `SUPPORT_REPO_OWNER`, `SUPPORT_REPO_NAME` envs for our project

[ ] 12. [API/CLIENT] Add client methods
    [ ] a. [TEST-UNIT] `packages/api/src/dialectic.api.project.test.ts`
        [ ] i. Methods: `githubStarRepo`, `githubWatchRepo`, `githubForkRepo`
    [ ] b. [API] Implement in `packages/api/src/dialectic.api.ts`

[ ] 13. [STORE] State/actions for support actions
    [ ] a. [TEST-UNIT] `packages/store/src/dialecticStore.project.test.ts`
        [ ] i. Actions: `starSupportRepo`, `watchSupportRepo`, `forkSupportRepo`
        [ ] ii. Loading/error states; success toast hook points
    [ ] b. [STORE] Implement in `packages/store/src/dialecticStore.ts`

[ ] 14. [UI] Integrate “Support the Project” into GitHub export flow
    [ ] a. [TEST-UNIT] `apps/web/src/components/dialectic/GitHubExportDialog.test.tsx`
        [ ] i. Render a “Support the Project” section with toggles: Star, Watch, Fork (unchecked by default)
        [ ] ii. On confirm, performs selected actions before/after export (order: star → watch → fork → export)
        [ ] iii. Shows per-action success/failure; does not block export if support actions fail
    [ ] b. [UI] Update `GitHubExportDialog.tsx`
        [ ] i. Wire toggles to store actions; read `SUPPORT_REPO_OWNER/NAME` from config provider
    [ ] c. [UI] Optional “Pin” UX
        [ ] i. If GraphQL token available, show “Pin repo to profile” and call GraphQL mutation; else show a link/instruction to manually pin
    [ ] d. [COMMIT] feat(ui): support actions within GitHub export dialog

[ ] 15. [TEST-INT] End-to-end support + export
    [ ] a. Simulate linked account; run Star/Watch/Fork (mock GitHub), then export; assert all calls made in order and export completes
    [ ] b. [COMMIT] test(int): support actions integrated with export flow

## Platform Integrations 
*   `[ ]` Site integrations 

### Replit Integration 

### Bolt.new Integration

### Lovable.dev Integration

### v0 Integration 

## Add User Analytics Notices
[ ] A. [ARCH] Subscriptions analytics taxonomy
    [ ] a. [TYPES] Extend `@paynless/types` with `AnalyticsEventName` additions:
        - 'Subscriptions: View Pricing', 'Subscriptions: Toggle Billing Interval',
          'Subscriptions: Click Plan', 'Subscriptions: Start Checkout',
          'Subscriptions: Checkout Succeeded', 'Subscriptions: Checkout Abandoned',
          'Subscriptions: Payment Error', 'Subscriptions: Apply Promo',
          'Subscriptions: View Manage Billing', 'Subscriptions: Upgrade Initiated',
          'Subscriptions: Upgrade Confirmed', 'Subscriptions: Downgrade Initiated',
          'Subscriptions: Downgrade Confirmed', 'Subscriptions: Cancel Initiated',
          'Subscriptions: Cancel Confirmed', 'Subscriptions: Reactivate',
          'Subscriptions: View Plan Comparison'
    [ ] b. [DOCS] Define required props: { planId, planName, price, billingInterval, currency, projectId?, userTierBefore?, userTierAfter?, source }

[ ] B. [TEST-UNIT] Coverage guard for payment UI
    [ ] a. File: `apps/web/src/tests/analytics.subscriptions.coverage.test.ts`
        [ ] i. Walk `apps/web/src/**/{pricing,billing,subscription,checkout,manage}/*.tsx`
        [ ] ii. Assert each file has an interaction wired to `analytics.track(` or contains `/* analytics:ignore */`

[ ] C. [UI] Pricing page instrumentation
    [ ] a. [TEST-UNIT] `PricingPage.test.tsx`
        [ ] i. Tracks on mount: 'Subscriptions: View Pricing'
        [ ] ii. Tracks on billing toggle: 'Subscriptions: Toggle Billing Interval' with { billingInterval }
        [ ] iii. Tracks on plan click: 'Subscriptions: Click Plan' with { planId, price, billingInterval }
        [ ] iv. Tracks on “Compare Plans” open: 'Subscriptions: View Plan Comparison'
        [ ] v. Tracks on promo apply: 'Subscriptions: Apply Promo'
    [ ] b. [UI] `PricingPage.tsx` add `analytics.track` at those interaction points

[ ] D. [UI] Checkout flow instrumentation
    [ ] a. [TEST-UNIT] `CheckoutDialog.test.tsx` (or equivalent)
        [ ] i. 'Subscriptions: Start Checkout' when dialog opens/confirm pressed
        [ ] ii. 'Subscriptions: Checkout Succeeded' on success callback with { planId, price, billingInterval }
        [ ] iii. 'Subscriptions: Checkout Abandoned' when closed without completion
        [ ] iv. 'Subscriptions: Payment Error' on error with { code, message? }
    [ ] b. [UI] Implement in `CheckoutDialog.tsx` (or current checkout component)

[ ] E. [UI] Manage subscription (upgrade/downgrade/cancel)
    [ ] a. [TEST-UNIT] `ManageSubscription.test.tsx`
        [ ] i. 'Subscriptions: View Manage Billing' on open
        [ ] ii. 'Subscriptions: Upgrade Initiated'/'Confirmed' with { fromTier, toTier, deltaPrice }
        [ ] iii. 'Subscriptions: Downgrade Initiated'/'Confirmed'
        [ ] iv. 'Subscriptions: Cancel Initiated'/'Confirmed'
        [ ] v. 'Subscriptions: Reactivate' on reactivation
    [ ] b. [UI] Implement in `ManageSubscription.tsx` (or equivalent settings/billing page)

[ ] F. [STORE] Track key payment actions in centralized flows
    [ ] a. [TEST-UNIT] `packages/store/src/dialecticStore.project.test.ts`
        [ ] i. Ensure store actions (if any exist for purchase/plan changes) call analytics once per action path:
            - start checkout, success, error; upgrade/downgrade confirm; cancel/renew
    [ ] b. [STORE] Implement minimal `analytics.track` in store actions (avoid duplicate double-counting with UI; prefer one source per event type)

[ ] G. [ADAPTER] Validate provider mapping & privacy
    [ ] a. [TEST-UNIT] `packages/analytics/src/index.test.ts`
        [ ] i. Props scrubbing: hash/anonymize userId, exclude payment PII; include plan/billing metadata
        [ ] ii. Environment guard (disable in local if desired, enable in staging/prod)
    [ ] b. [COMMIT] chore(analytics): provider map + privacy checks

[ ] H. [TEST-INT] Funnel smoke tests
    [ ] a. Simulate user flows with analytics mock:
        [ ] i. View pricing → toggle monthly/annual → click plan → start checkout → success
        [ ] ii. View pricing → click plan → start checkout → abandon
        [ ] iii. Manage billing → upgrade → confirm; downgrade → confirm; cancel → confirm; reactivate
        [ ] iv. Assert event sequence and required props
    [ ] b. [COMMIT] test(int): subscriptions funnel analytics

[ ] I. [DOCS] Analytics guide for subscriptions
    [ ] a. Event names, when to fire, required props, examples
    [ ] b. Guidance on adding `/* analytics:ignore */` for non-interactive files

[ ] 1. [ARCH] Define standard event taxonomy and adapter usage
    [ ] a. [TYPES] Extend `@paynless/types` with `AnalyticsEventName` union and `AnalyticsProps` map for common fields (projectId, sessionId, userId anonymized/hash, stageSlug, componentId).
    [ ] b. [DOCS] Document naming conventions: “Area: Action Verb Object” (e.g., “Project: Click Export”, “Session: Start Generation”).
    [ ] c. [COMMIT] feat(types,docs): analytics event taxonomy

[ ] 2. [TEST-UNIT] Lint-like guard for UI analytics coverage
    [ ] a. File: `apps/web/src/tests/analytics.coverage.test.ts`
        [ ] i. Walk `apps/web/src/components` and `apps/web/src/pages` (TSX only).
        [ ] ii. For each file, require at least one `analytics.track` on an interaction (click/submit/change/keypress/navigation).
        [ ] iii. Allow explicit `/* analytics:ignore */` pragma for non-interactive views (assert pragma exists).
    [ ] b. [COMMIT] test: analytics coverage guard for UI

[ ] 3. [UI] Add analytics to high-traffic core pages first (iterative)
    [ ] a. [TEST-UNIT] For each targeted file, add failing tests asserting `analytics.track` is called with correct event name and props on interactions.
        [ ] i. Examples:
            - `DialecticProjectCard.test.tsx`: track on Export/Clone/Delete/View clicks.
            - `SessionContributionsDisplayCard.test.tsx`: track on Submit/Export/Model selection.
            - Navigation buttons/links in layout/sidebar.
    [ ] b. [UI] Implement analytics calls
        [ ] i. Import `analytics` from `@paynless/analytics`
        [ ] ii. Use taxonomy names; include minimal stable props: `{ projectId, sessionId, stageSlug, source: 'componentName' }`
    [ ] c. [COMMIT] feat(ui): add analytics to core components

[ ] 4. [TEST-UNIT] Expand to remaining UI components (batch by folder)
    [ ] a. Batch A: `apps/web/src/components/dialectic/**`
    [ ] b. Batch B: shared UI (buttons/forms where appropriate; avoid double counting)
    [ ] c. Batch C: pages (all interactions)
    [ ] d. For each batch:
        [ ] i. Add/extend component tests to assert tracking for each interaction path.
        [ ] ii. Implement `analytics.track` in code.
        [ ] iii. Ensure coverage test passes without `analytics:ignore`.

[ ] 5. [STORE] Key user actions also tracked centrally
    [ ] a. [TEST-UNIT] In `packages/store/src/dialecticStore.project.test.ts`, assert track calls for major flows:
        [ ] i. `generateContributions`, `submitStageResponses`, `exportDialecticProject`, `cloneDialecticProject`, `deleteDialecticProject`, `startDialecticSession`
    [ ] b. [STORE] Implement adapter calls inside actions (do not duplicate if UI already tracks; prefer one clear source of truth per action)
    [ ] c. [COMMIT] feat(store): add analytics in store actions

[ ] 6. [ADAPTER] Ensure Posthog provider mapping is up to date
    [ ] a. [TEST-UNIT] `packages/analytics/src/index.test.ts`
        [ ] i. Verify `analytics.track(name, props)` forwards to Posthog with props scoping and environment filters (dev vs prod).
        [ ] ii. Verify `analytics.identify` behavior and `reset` on logout (already in `authStore`).
    [ ] b. [COMMIT] chore(analytics): verify provider mapping

[ ] 7. [CONFIG] Privacy and PII
    [ ] a. Hash/minimize potentially sensitive fields (userId) in adapter before sending.
    [ ] b. Respect Do-Not-Track/consent flags if present; add toggles if missing.
    [ ] c. [COMMIT] feat(analytics): privacy-safe props defaults

[ ] 8. [TEST-INT] Smoke flows exercise analytics
    [ ] a. Add integration tests that simulate a few user flows and assert analytics adapter received expected sequence of events (using mock for `@paynless/analytics`).
    [ ] b. [COMMIT] test(int): analytics smoke coverage

[ ] 9. [DOCS] Developer guide
    [ ] a. Where to place events, naming, props, and how to add `analytics:ignore`.
    [ ] b. [COMMIT] docs: UI analytics guidelines

## Prompt Improvements & Convergent Logic

[ ] 1. [PROMPT] Parenthesis: make prompts and stage recipe convergent
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/_shared/prompt-assembler.test.ts` proving Parenthesis prompts include a clear convergent directive to “synthesize a single, unified document from all relevant prior-stage context.”
        [ ] i. Assert assembled prompt includes both: (1) convergent directive language, (2) reference to using all prior-stage documents via the RAG pipeline.
    [ ] b. [DB/PROMPT] Migration/seed to update `system_prompts.prompt_text` for Parenthesis with explicit convergent instructions and the plan/checklist style guide.
    [ ] c. [BE] Update prompt assembly to inject Parenthesis convergent directive
        [ ] i. File: `supabase/functions/_shared/prompt-assembler.ts` (or the stage prompt assembly utility used by Parenthesis) to combine system prompt and convergent directive correctly.
    [ ] d. [TEST-INT] Add/extend `dialectic-service` integration test to assert the Parenthesis request carries the convergent directive and full prior-stage context when building the prompt.

[ ] 2. [PROMPT] Paralysis: make prompts and stage recipe convergent
    [ ] a. [TEST-UNIT] Add failing tests in `supabase/functions/_shared/prompt-assembler.test.ts` proving Paralysis prompts include a convergent directive AND the “First Mention, Full Implementation Prioritization” reordering rule.
        [ ] i. Assert assembled prompt includes: (1) convergent directive, (2) explicit dependency-driven reordering rule text referencing first-mention principle, (3) usage of all Parenthesis outputs via RAG.
    [ ] b. [DB/PROMPT] Migration/seed to update `system_prompts.prompt_text` for Paralysis with convergent instructions, reordering rule, and style guide.
    [ ] c. [BE] Update prompt assembly to inject Paralysis convergent directive and reordering instructions
        [ ] i. File: `supabase/functions/_shared/prompt-assembler.ts` (or the stage prompt assembly utility used by Paralysis).
    [ ] d. [TEST-INT] Add/extend `dialectic-service` integration test to assert the Paralysis request includes convergent + reordering directives and full Parenthesis context in the assembled prompt.

[ ] 3. [BE] Add optional “advisor” job users can run after any stage
    [ ] a. [TEST-UNIT] Add failing tests for enqueueing `advisor` on-demand
        [ ] i. File: `supabase/functions/dialectic-service/index.test.ts`
            - Action: `runAdvisor({ sessionId, stageSlug })` enqueues one `advisor` job with session/project context; DI respected.
            - RLS: only the session owner can enqueue.
    [ ] b. [BE] Implement enqueue in `supabase/functions/dialectic-service/index.ts`
        [ ] i. Handler `runAdvisor.ts` creates an `advisor` job for the given `{ sessionId, stageSlug }`.
    [ ] c. [TEST-UNIT] Add failing tests for `processAdvisorJob` worker in `supabase/functions/dialectic-worker/processAdvisorJob.test.ts`
        [ ] i. Asserts: gathers all contributions for `{ sessionId, stageSlug }` via RAG; calls model once (or batched if needed); writes comparison outputs.
    [ ] d. [BE] Implement `supabase/functions/dialectic-worker/processAdvisorJob.ts`
        [ ] i. DI for storage/db/model; collect all stage outputs; generate:
            - `advisor_comparison_matrix.md`, `advisor_comparative_analysis.md`, `advisor_recommendations.md`, `advisor_selection_rationale.md`.
            - Save as `dialectic_contribution` records; return success metrics.
    [ ] e. [BE] Route new job type in `supabase/functions/dialectic-worker/index.ts`
        [ ] i. Add dispatcher branch for `'advisor'` → `processAdvisorJob.ts`.
    [ ] f. [TEST-INT] Add/extend `supabase/integration_tests/services/dialectic_pipeline.integration.test.ts`
        [ ] i. After any stage, call `runAdvisor`; assert comparison docs created and surfaced in outputs.
    [ ] g. [UI] Add "Run Advisor" button after each stage’s results list
        [ ] i. Disabled during async; shows outputs inline upon completion.
    [ ] h. [DOCS] Update developer docs describing advisor purpose/output and where it appears in the UI.
    [ ] i. [❓] [DB] If strict enums exist, ensure job-type includes `'advisor'`; add a contribution type for advisor artifacts as needed.