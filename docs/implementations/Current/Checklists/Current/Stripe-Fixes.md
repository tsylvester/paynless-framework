[ ] // So that find->replace will stop unrolling my damned instructions! 

# **Stripe Webhook Bug Fixes**

## Problem Statement
Multiple production errors in the Stripe webhook processing pipeline are blocking new subscription creation. Live error logs show three runtime failures; code analysis reveals a fourth architectural bug (root cause), and the existing `TokenWalletService` class is out-of-spec: it conflates admin-scoped and user-scoped operations into one class, causing the `webhooks` handler to instantiate it incorrectly. Bringing the service into spec is a prerequisite for fixing the webhook call site.

## Objectives
1. Split `TokenWalletService` into `AdminTokenWalletService` (server-only: `createWallet`, `recordTransaction`) and `UserTokenWalletService` (client-scoped: `getWallet`, `getWalletForContext`, `getBalance`, `checkBalance`, `getTransactionHistory`, `getWalletByIdAndUser`), each with the full spec support tree under `_shared/services/tokenwallet/admin/` and `_shared/services/tokenwallet/client/`
2. Migrate all callers to the correct service class via proper DI; callers needing both receive two injected deps
3. Fix the `payment_transactions` DB check constraint to include every status the application code writes
4. Fix `handleInvoicePaymentSucceeded` to skip `subscription_create` invoices and use consistent uppercase status literals throughout
5. Prove the repaired call stack with a new integration test

## Expected Outcome
- `AdminTokenWalletService` is server-only, admin-scoped, never exposed to user context
- `UserTokenWalletService` is user-scoped, RLS-enforced, never performs admin operations
- All callers inject the correct service(s) and call each for its designated operation
- New subscriptions complete without constraint violations or `Cannot read properties of undefined (reading 'from')` crashes
- All existing tests in `_shared/adapters/stripe/**` and `_shared/services/tokenWallet*` remain GREEN
- A new integration test proves the full new-subscription flow

# Instructions for Agent
* Read `.cursor/rules/rules.md` before every turn.

# Work Breakdown Structure

---

## Part 1 — TokenWalletService Refactor (Prerequisite)

*The existing `TokenWalletService` mixes admin-scoped and user-scoped operations in one class. This part brings the service into spec. Dependency order: admin service → client service → each caller file.*

---

* `[✅] `   `supabase/functions/_shared/services/tokenwallet/admin/adminTokenWalletService.ts` **[BE] AdminTokenWalletService — server-only token wallet operations**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Create `AdminTokenWalletService(adminClient: SupabaseClient<Database>)` to own all operations that require service-role access: `createWallet` (inserts bypassing RLS) and `recordTransaction` (RPC + notification lookup)
    * `[✅] `   Remove these methods from the existing `TokenWalletService`; they must not exist on the user-scoped class
    * `[✅] `   The class is instantiated only at server boundaries (webhooks, cron jobs, periodic-token allocation); never in user-request handlers without explicit authorization

  * `[✅] `   `role`
    * `[✅] `   Infrastructure/service layer — admin-scoped token wallet writes
    * `[✅] `   Must NOT expose any user-scoped read operations (those belong to `UserTokenWalletService`)
    * `[✅] `   Must NOT be instantiated with anything other than an admin/service-role client

  * `[✅] `   `module`
    * `[✅] `   Bounded context: server-side token wallet mutation
    * `[✅] `   Inside: `createWallet`, `recordTransaction`, admin Supabase client
    * `[✅] `   Outside: user-scoped reads, RLS-enforced queries, user auth context

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `SupabaseClient<Database>` from `npm:@supabase/supabase-js` — admin/service-role client only
    * `[✅] `   `Database` from `../../../types_db.ts`
    * `[✅] `   Shared domain types (`TokenWallet`, `TokenWalletTransaction`, `TokenWalletTransactionType`) from `../../types/tokenWallet.types.ts`

  * `[✅] `   `context_slice`
    * `[✅] `   Constructor consumes exactly: `adminClient: SupabaseClient<Database>`
    * `[✅] `   No user auth context, no user JWT, no RLS-enforced queries

  ### 3. Contract Definition

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.interface.test.ts`
    * `[✅] `   `createWallet` with `userId` only → returns `TokenWallet` with correct `userId`, `currency: 'AI_TOKEN'`
    * `[✅] `   `createWallet` with `organizationId` only → returns `TokenWallet` with correct `organizationId`
    * `[✅] `   `createWallet` with neither → throws
    * `[✅] `   `recordTransaction` with valid params → returns `TokenWalletTransaction` with all required fields
    * `[✅] `   `recordTransaction` RPC failure → throws
    * `[✅] `   `recordTransaction` notification failure → does NOT throw (notification errors are non-fatal)

  ### 4. Structural Boundary

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.interface.ts`
    * `[✅] `   `IAdminTokenWalletService` with:
      * `createWallet(userId?: string, organizationId?: string): Promise<TokenWallet>`
      * `recordTransaction(params: RecordTransactionParams): Promise<TokenWalletTransaction>`
    * `[✅] `   `RecordTransactionParams` type (extracted from existing inline params object in `tokenWalletService.ts`)
    * `[✅] `   No `any`, no optional fields that should be required

  ### 5. Interaction Semantics

  * `[✅] `   `interaction.spec`
    * `[✅] `   `createWallet`: inserts via `adminClient` bypassing RLS; requires `userId` XOR `organizationId`
    * `[✅] `   `recordTransaction`: calls `record_token_transaction` RPC via `adminClient`, then looks up wallet owner and creates `WALLET_TRANSACTION` notification — notification failure is caught and logged, not re-thrown
    * `[✅] `   Both methods throw on DB errors; callers are responsible for error handling

  ### 6. Enforcement

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.guard.test.ts`
    * `[✅] `   `isIAdminTokenWalletService(x)` → true for valid implementors, false for `null`, `{}`, user-service instance
  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.guard.ts`
    * `[✅] `   `isIAdminTokenWalletService`: checks `createWallet` and `recordTransaction` are functions

  ### 7. Behavioral Verification

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.test.ts`
    * `[✅] `   `createWallet` happy path (userId)
    * `[✅] `   `createWallet` happy path (organizationId)
    * `[✅] `   `createWallet` throws when neither provided
    * `[✅] `   `recordTransaction` happy path — RPC succeeds, notification created
    * `[✅] `   `recordTransaction` — notification error does not propagate
    * `[✅] `   `recordTransaction` — RPC error propagates

  ### 8. Construction

  * `[✅] `   Constructor: `AdminTokenWalletService(adminClient: SupabaseClient<Database>)`
  * `[✅] `   Single required arg; no optional params, no defaults, no partial construction

  ### 9. Implementation

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.ts`
    * `[✅] `   Lift `createWallet` verbatim from `tokenWalletService.ts` — all `this.supabaseAdminClient` references become `this.adminClient`
    * `[✅] `   Lift `recordTransaction` verbatim — all `this.supabaseClient` and `this.supabaseAdminClient` references become `this.adminClient`
    * `[✅] `   Lift `_transformDbWalletToTokenWallet` private helper (shared by both services; each gets its own copy)
    * `[✅] `   Implements `IAdminTokenWalletService`

  ### 10. Simulation

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.mock.ts`
    * `[✅] `   `createMockAdminTokenWalletService(): MockAdminTokenWalletService` — stub implementations of `createWallet` and `recordTransaction` using `spy()`
    * `[✅] `   Conforms to `IAdminTokenWalletService`

  ### 11. External Boundary

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.provides.ts`
    * `[✅] `   Re-exports: `AdminTokenWalletService`, `IAdminTokenWalletService`, `isIAdminTokenWalletService`, `createMockAdminTokenWalletService`
    * `[✅] `   Does NOT re-export user-scoped types

  ### 12. Edge Validation

  * `[✅] `   `tokenwallet/admin/adminTokenWalletService.integration.test.ts`
    * `[✅] `   Uses `coreInitializeTestStep` from `_integration.test.utils.ts`
    * `[✅] `   `createWallet` against live local DB — wallet row inserted, fields correct
    * `[✅] `   `recordTransaction` against live local DB — transaction row inserted, balance updated

  ### 13. Directionality

  * `[✅] `   Node layer: infrastructure/service (admin)
  * `[✅] `   Deps inward-facing: `SupabaseClient<Database>` injected at server boundary
  * `[✅] `   No cycles

  ### 14. Completion Criteria

  * `[✅] `   All files in `tokenwallet/admin/` lint clean
  * `[✅] `   All unit tests GREEN
  * `[✅] `   Integration test GREEN against local Supabase
  * `[✅] `   `IAdminTokenWalletService` guard correctly rejects non-conforming objects

---

* `[ ]`   `supabase/functions/_shared/services/tokenwallet/client/userTokenWalletService.ts` **[BE] UserTokenWalletService — user-scoped, RLS-enforced token wallet reads**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Create `UserTokenWalletService(userClient: SupabaseClient<Database>)` to own all RLS-enforced, user-visible wallet operations: `getWallet`, `getWalletForContext`, `getBalance`, `checkBalance`, `getTransactionHistory`, `getWalletByIdAndUser`
    * `[ ]`   Remove these methods from the existing `TokenWalletService`; they must not exist on the admin-scoped class
    * `[ ]`   Instantiated only with a user Supabase client; never with service-role

  * `[ ]`   `role`
    * `[ ]`   Infrastructure/service layer — user-scoped token wallet reads
    * `[ ]`   Must NOT perform admin operations (createWallet, recordTransaction)
    * `[ ]`   Must NOT bypass RLS

  * `[ ]`   `module`
    * `[ ]`   Bounded context: user-facing token wallet reads
    * `[ ]`   Inside: all read methods, user Supabase client, RLS-enforced queries
    * `[ ]`   Outside: wallet creation, transaction recording, admin client

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `SupabaseClient<Database>` from `npm:@supabase/supabase-js` — user-context client only
    * `[ ]`   `Database` from `../../../types_db.ts`
    * `[ ]`   Shared domain types from `../../types/tokenWallet.types.ts`

  * `[ ]`   `context_slice`
    * `[ ]`   Constructor consumes exactly: `userClient: SupabaseClient<Database>`
    * `[ ]`   No admin client, no service-role bypass

  ### 3. Contract Definition

  * `[ ]`   `tokenwallet/client/userTokenWalletService.interface.test.ts`
    * `[ ]`   `getWallet` with valid UUID → returns `TokenWallet` or `null`
    * `[ ]`   `getWallet` with invalid UUID → returns `null`
    * `[ ]`   `getWalletForContext` with `userId` → returns wallet or `null`
    * `[ ]`   `getWalletForContext` with neither → returns `null`
    * `[ ]`   `getBalance` with valid wallet → returns balance string
    * `[ ]`   `getBalance` with non-existent wallet → throws
    * `[ ]`   `checkBalance` sufficient funds → `true`; insufficient → `false`
    * `[ ]`   `getTransactionHistory` → returns `PaginatedTransactions` with correct shape
    * `[ ]`   `getWalletByIdAndUser` → returns wallet for owner, `null` for non-owner (RLS)

  ### 4. Structural Boundary

  * `[ ]`   `tokenwallet/client/userTokenWalletService.interface.ts`
    * `[ ]`   `IUserTokenWalletService` with:
      * `getWallet(walletId: string): Promise<TokenWallet | null>`
      * `getWalletForContext(userId?: string, organizationId?: string): Promise<TokenWallet | null>`
      * `getBalance(walletId: string): Promise<string>`
      * `checkBalance(walletId: string, amountToSpend: string): Promise<boolean>`
      * `getTransactionHistory(walletId: string, params?: GetTransactionHistoryParams): Promise<PaginatedTransactions>`
      * `getWalletByIdAndUser(walletId: string, userId: string): Promise<TokenWallet | null>`

  ### 5. Interaction Semantics

  * `[ ]`   `interaction.spec`
    * `[ ]`   All methods use `userClient` — RLS is the enforcement boundary
    * `[ ]`   `checkBalance` delegates to `getBalance`; returns `boolean`, never throws on wallet-not-found (re-throws from `getBalance`)
    * `[ ]`   `getTransactionHistory` supports pagination via `GetTransactionHistoryParams`; `fetchAll: true` bypasses pagination

  ### 6. Enforcement

  * `[ ]`   `tokenwallet/client/userTokenWalletService.guard.test.ts`
    * `[ ]`   `isIUserTokenWalletService(x)` → true for valid, false for `null`, `{}`, admin-service instance
  * `[ ]`   `tokenwallet/client/userTokenWalletService.guard.ts`
    * `[ ]`   `isIUserTokenWalletService`: checks all six method names are functions

  ### 7. Behavioral Verification

  * `[ ]`   `tokenwallet/client/userTokenWalletService.test.ts`
    * `[ ]`   One test per contract case from Section 3
    * `[ ]`   All existing `tokenWalletService.balance.test.ts`, `tokenWalletService.createWallet.test.ts`, `tokenWalletService.getWallet.test.ts`, `tokenWalletService.history.test.ts`, `tokenWalletService.IdAndUser.test.ts` behaviors must be covered in the new test file

  ### 8. Construction

  * `[ ]`   Constructor: `UserTokenWalletService(userClient: SupabaseClient<Database>)`
  * `[ ]`   Single required arg; no optional params, no defaults

  ### 9. Implementation

  * `[ ]`   `tokenwallet/client/userTokenWalletService.ts`
    * `[ ]`   Lift `getWallet`, `getWalletForContext`, `getBalance`, `checkBalance`, `getTransactionHistory`, `getWalletByIdAndUser` verbatim from `tokenWalletService.ts` — all `this.supabaseClient` references become `this.userClient`
    * `[ ]`   Lift `_transformDbWalletToTokenWallet` private helper
    * `[ ]`   Implements `IUserTokenWalletService`

  ### 10. Simulation

  * `[ ]`   `tokenwallet/client/userTokenWalletService.mock.ts`
    * `[ ]`   `createMockUserTokenWalletService(): MockUserTokenWalletService` — stub all six methods with `spy()`
    * `[ ]`   Conforms to `IUserTokenWalletService`

  ### 11. External Boundary

  * `[ ]`   `tokenwallet/client/userTokenWalletService.provides.ts`
    * `[ ]`   Re-exports: `UserTokenWalletService`, `IUserTokenWalletService`, `isIUserTokenWalletService`, `createMockUserTokenWalletService`
    * `[ ]`   Does NOT re-export admin-scoped types

  ### 12. Edge Validation

  * `[ ]`   `tokenwallet/client/userTokenWalletService.integration.test.ts`
    * `[ ]`   Uses `coreInitializeTestStep`
    * `[ ]`   `getWalletForContext` with valid userId → returns wallet
    * `[ ]`   `getBalance` → returns correct string balance
    * `[ ]`   `getTransactionHistory` → returns paginated results
    * `[ ]`   RLS: user cannot read another user's wallet via `getWalletByIdAndUser`

  ### 13. Directionality

  * `[ ]`   Node layer: infrastructure/service (user)
  * `[ ]`   Deps inward-facing: user `SupabaseClient<Database>` injected at request boundary
  * `[ ]`   No cycles

  ### 14. Completion Criteria

  * `[ ]`   All files in `tokenwallet/client/` lint clean
  * `[ ]`   All unit tests GREEN
  * `[ ]`   Integration test GREEN
  * `[ ]`   `IUserTokenWalletService` guard correctly rejects admin-service instances

---

* `[ ]`   `supabase/functions/webhooks/index.ts` **[BE] Migrate webhooks handler to AdminTokenWalletService**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Replace the incorrect single-arg `tokenWalletServiceFactory: new (adminClient) => ITokenWalletService` with `adminTokenWalletServiceFactory: (adminClient: SupabaseClient<Database>) => IAdminTokenWalletService`
    * `[ ]`   Update `WebhookRouterDependencies`, `webhookRouterHandler`, and `serve()` wiring to use `AdminTokenWalletService`
    * `[ ]`   `WebhookHandlerDependencies.tokenWalletService` type narrows from `ITokenWalletService` to `IAdminTokenWalletService`

  * `[ ]`   `role`
    * `[ ]`   Application boundary — wires server-side dependencies for the webhook handler
    * `[ ]`   Must NOT import or reference `UserTokenWalletService` or `IUserTokenWalletService`

  * `[ ]`   `module`
    * `[ ]`   Bounded context: webhook request routing
    * `[ ]`   Inside: dependency wiring, adapter factory invocation
    * `[ ]`   Outside: handler logic (in stripe adapter files)

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `AdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.provides.ts`
    * `[ ]`   `IAdminTokenWalletService` from same
    * `[ ]`   Remove import of old `TokenWalletService` and `ITokenWalletService`

  * `[ ]`   `context_slice`
    * `[ ]`   `WebhookRouterDependencies.adminTokenWalletServiceFactory: (adminClient: SupabaseClient<Database>) => IAdminTokenWalletService`

  ### 3. Contract Definition

  * `[ ]`   `index.router.test.ts` (existing — update relevant test cases)
    * `[ ]`   `adminTokenWalletServiceFactory` receives `adminClient` and returns an `IAdminTokenWalletService` instance
    * `[ ]`   `serve()` wiring passes `AdminTokenWalletService.createForContext` (or direct instantiation) as factory

  ### 4. Structural Boundary

  * `[ ]`   `WebhookRouterDependencies` type: replace `tokenWalletServiceFactory: new (adminClient) => ITokenWalletService` with `adminTokenWalletServiceFactory: (adminClient: SupabaseClient<Database>) => IAdminTokenWalletService`
  * `[ ]`   `WebhookHandlerDependencies.tokenWalletService` type: `IAdminTokenWalletService`

  ### 5–11. (Not applicable — updating existing file, no new interface/guard/mock/provides)

  ### 12. Edge Validation

  * `[ ]`   Existing `index.invoice.integration.test.ts` and `index.checkoutSession.integration.test.ts` remain GREEN

  ### 13. Directionality

  * `[ ]`   Node layer: application boundary
  * `[ ]`   Admin service flows inward from server context only

  ### 14. Completion Criteria

  * `[ ]`   `webhooks/index.ts` lints clean
  * `[ ]`   All existing webhook integration tests GREEN
  * `[ ]`   No reference to old `ITokenWalletService` or `TokenWalletService` remains in this file

---

* `[ ]`   `supabase/functions/allocate-periodic-tokens/index.ts` **[BE] Migrate allocate-periodic-tokens to AdminTokenWalletService**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Replace `new TokenWalletService(supabaseAdminClient)` (single-arg, broken) with `new AdminTokenWalletService(supabaseAdminClient)` using the correct class
    * `[ ]`   Update deps type to reference `IAdminTokenWalletService`

  * `[ ]`   `role`
    * `[ ]`   Server-side cron/periodic function — uses only `recordTransaction`
    * `[ ]`   Must NOT import `UserTokenWalletService`

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `AdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.provides.ts`
    * `[ ]`   Remove import of `TokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[ ]`   Existing tests for `allocate-periodic-tokens` remain GREEN

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   No reference to old `TokenWalletService` remains

---

* `[ ]`   `supabase/functions/wallet-info/index.ts` **[BE] Migrate wallet-info to UserTokenWalletService**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Replace `new NewTokenWalletService(supabaseUserClient)` (single-arg, wrong class) with `new UserTokenWalletService(supabaseUserClient)`
    * `[ ]`   Update `Deps` interface: `NewTokenWalletService: typeof TokenWalletService` → `NewTokenWalletService: typeof UserTokenWalletService`
    * `[ ]`   Update `tokenWalletServiceInstance` type from `TokenWalletService` to `IUserTokenWalletService`

  * `[ ]`   `role`
    * `[ ]`   User-facing endpoint — only calls `getWalletForContext`
    * `[ ]`   Must NOT import `AdminTokenWalletService`

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `UserTokenWalletService`, `IUserTokenWalletService` from `tokenwallet/client/userTokenWalletService.provides.ts`
    * `[ ]`   Remove import of `TokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[ ]`   Existing `wallet-info` tests remain GREEN

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   No reference to old `TokenWalletService` remains

---

* `[ ]`   `supabase/functions/wallet-history/index.ts` **[BE] Migrate wallet-history to UserTokenWalletService**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Replace `new deps.NewTokenWalletService(supabaseUserClient)` with `new deps.NewTokenWalletService(supabaseUserClient)` using `UserTokenWalletService`
    * `[ ]`   Update `Deps` interface: `NewTokenWalletService` and `tokenWalletServiceInstance` types to `UserTokenWalletService` / `IUserTokenWalletService`

  * `[ ]`   `role`
    * `[ ]`   User-facing endpoint — calls `getWalletForContext` and `getTransactionHistory`
    * `[ ]`   Must NOT import `AdminTokenWalletService`

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `UserTokenWalletService`, `IUserTokenWalletService` from `tokenwallet/client/userTokenWalletService.provides.ts`
    * `[ ]`   Remove import of `TokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[ ]`   Existing `wallet-history` tests remain GREEN

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   No reference to old `TokenWalletService` remains

---

* `[ ]`   `supabase/functions/initiate-payment/index.ts` **[BE] Migrate initiate-payment to UserTokenWalletService for getWalletForContext; AdminTokenWalletService where recordTransaction is passed to adapter**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Line 178: `getWalletForContext` → inject `UserTokenWalletService`
    * `[ ]`   Line 52: `TokenWalletService` passed to `StripePaymentAdapter` which calls `recordTransaction` → inject `AdminTokenWalletService`; update adapter dep type to `IAdminTokenWalletService`
    * `[ ]`   Two separate injected deps; no single class serves both roles

  * `[ ]`   `role`
    * `[ ]`   Application boundary — initiates Stripe checkout; uses user-scoped wallet lookup and passes admin-scoped service to adapter

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `UserTokenWalletService`, `IUserTokenWalletService` from client provides
    * `[ ]`   `AdminTokenWalletService`, `IAdminTokenWalletService` from admin provides
    * `[ ]`   `StripePaymentAdapter` dep type for wallet service narrows to `IAdminTokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[ ]`   Existing `initiate-payment` tests remain GREEN

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   No reference to old `TokenWalletService` or `ITokenWalletService` remains

---

* `[ ]`   `supabase/functions/chat/index.ts` **[BE] Migrate chat handler to separate UserTokenWalletService (checkBalance) and AdminTokenWalletService (recordTransaction)**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Split the single `tokenWalletService: TokenWalletService` dep into two:
      * `userTokenWalletService: IUserTokenWalletService` — for `checkBalance` prior to processing
      * `adminTokenWalletService: IAdminTokenWalletService` — for `recordTransaction` after processing
    * `[ ]`   Update `handleStreamingRequest` and `handlePostRequest` signatures to receive the two separate deps (or both in context); each call site uses the correct service
    * `[ ]`   No single dep does both; the separation is explicit and enforced by type

  * `[ ]`   `role`
    * `[ ]`   Application boundary — user-facing chat; uses user client for balance check, admin client for token deduction
    * `[ ]`   User-scoped check → `UserTokenWalletService`; server-side mutation → `AdminTokenWalletService`

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `UserTokenWalletService`, `IUserTokenWalletService` from client provides
    * `[ ]`   `AdminTokenWalletService`, `IAdminTokenWalletService` from admin provides
    * `[ ]`   Remove import of `TokenWalletService`, `ITokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[ ]`   Existing `chat` tests remain GREEN
  * `[ ]`   `checkBalance` path verified to use user-scoped service
  * `[ ]`   `recordTransaction` path verified to use admin-scoped service

  ### 13. Directionality

  * `[ ]`   User-scoped read flows from user-context boundary
  * `[ ]`   Admin-scoped write flows from server-context boundary; not exposed to user JWT

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   No reference to old `TokenWalletService` or `ITokenWalletService` remains in any migrated caller
  * `[ ]`   Old `_shared/services/tokenWalletService.ts`, `tokenWalletService.mock.ts`, and all `tokenWalletService*.test.ts` files are safe to delete once this node is GREEN — confirm deletion with user before executing

  ### 15. Versioning

  * `[ ]`   **Commit** `refactor(tokenwallet): split TokenWalletService into AdminTokenWalletService and UserTokenWalletService with full spec support trees`
    * `[ ]`   Structural: new `tokenwallet/admin/` and `tokenwallet/client/` packages; old `tokenWalletService.ts` deprecated
    * `[ ]`   Behavioral: admin ops (createWallet, recordTransaction) isolated to service-role context; user ops (getWallet, getBalance, etc.) isolated to RLS-enforced context
    * `[ ]`   Contract: `IAdminTokenWalletService` and `IUserTokenWalletService` replace `ITokenWalletService`

---

## Part 2 — Stripe Bug Fixes

*Prerequisites: Part 1 must be complete. Dependency order: DB migration → invoicePaymentSucceeded → integration test.*

---

* `[ ]`   `supabase/migrations/20260403000000_fix_payment_transactions_status_constraint.sql` **[DB] Widen payment_transactions.status column and add missing statuses to check constraint**

  **This node is a database migration and is exempt from TDD structure.**

  ### Problem
  * `[ ]`   `objective`
    * `[ ]`   `payment_transactions.status` is `VARCHAR(20)` with `CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'))`
    * `[ ]`   Application code writes `'PROCESSING_RENEWAL'` (18 chars) and `'TOKEN_AWARD_FAILED'` (18 chars) — neither is in the constraint
    * `[ ]`   The lowercase `'succeeded'` written by `handleInvoicePaymentSucceeded` is also absent; it will be corrected to `'COMPLETED'` in the source fix node, but the constraint must be correct first

  ### Migration Steps
  * `[ ]`   `supabase/migrations/20260403000000_fix_payment_transactions_status_constraint.sql`
    * `[ ]`   `ALTER TABLE public.payment_transactions ALTER COLUMN status TYPE VARCHAR(30)`
    * `[ ]`   `DROP CONSTRAINT IF EXISTS payment_transactions_status_check`
    * `[ ]`   `ADD CONSTRAINT payment_transactions_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSING_RENEWAL', 'COMPLETED', 'FAILED', 'REFUNDED', 'TOKEN_AWARD_FAILED'))`

  ### Completion Criteria
  * `[ ]`   Migration applies cleanly against local Supabase instance
  * `[ ]`   Insert with `status = 'PROCESSING_RENEWAL'` succeeds
  * `[ ]`   Insert with `status = 'TOKEN_AWARD_FAILED'` succeeds
  * `[ ]`   Insert with `status = 'INVALID_STATUS'` is rejected

---

* `[ ]`   `supabase/functions/_shared/adapters/stripe/handlers/stripe.invoicePaymentSucceeded.ts` **[BE] Fix billing_reason routing and status literal consistency**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   **Bug A (architectural):** Handler never checks `invoice.billing_reason`. It processes every `invoice.payment_succeeded` event including `subscription_create` as a renewal. `subscription_create` invoices arrive before `checkout.session.completed` has written the subscription record, so `user_subscriptions` lookup fails with PGRST116. Additionally, calling a new subscription a renewal is semantically wrong
    * `[ ]`   **Bug B (status):** Idempotency check at line 71 uses `eq('status', 'succeeded')` (lowercase). No record is ever written with that value, so the guard never fires
    * `[ ]`   **Bug C (status):** Final status update at line 270 writes `status: 'succeeded'` (lowercase), violating the constraint once the migration runs
    * `[ ]`   **Fix A:** Early return after `stripeCustomerId` extraction: if `billing_reason === 'subscription_create'`, log and return `{ success: true, message: 'subscription_create invoice skipped; handled by checkout.session.completed' }`
    * `[ ]`   **Fix B:** Change idempotency check to `eq('status', 'COMPLETED')`
    * `[ ]`   **Fix C:** Change final status update to `{ status: 'COMPLETED' }`

  * `[ ]`   `role`
    * `[ ]`   Adapter/handler — processes `invoice.payment_succeeded` for renewals (`subscription_cycle`) only
    * `[ ]`   Must NOT process `subscription_create` invoices
    * `[ ]`   Must NOT touch the checkout session handler or any other handler file

  * `[ ]`   `module`
    * `[ ]`   Inside: billing_reason guard, status literals, idempotency check
    * `[ ]`   Outside: `handleCheckoutSessionCompleted`, DB schema, `AdminTokenWalletService` (injected via `HandlerContext`)

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `HandlerContext.tokenWalletService` type is now `IAdminTokenWalletService` (from Part 1)
    * `[ ]`   DB migration must be applied (constraint must allow `PROCESSING_RENEWAL`, `TOKEN_AWARD_FAILED`, `COMPLETED`)

  ### 3. Contract Definition

  * `[ ]`   `stripe.invoicePaymentSucceeded.test.ts` (existing — add new tests at end)
    * `[ ]`   **NEW:** `billing_reason = 'subscription_create'` → returns `{ success: true }` without any DB calls
    * `[ ]`   **NEW:** idempotency check finds `status = 'COMPLETED'` record → early success return
    * `[ ]`   **NEW:** full `subscription_cycle` success path → `payment_transactions` record ends with `status: 'COMPLETED'`
    * `[ ]`   **EXISTING:** `subscription_cycle` full flow still processes correctly

  ### 4. Structural Boundary

  * `[ ]`   No interface or type file changes — `billing_reason` exists on `Stripe.Invoice`; status literals are strings

  ### 5. Interaction Semantics

  * `[ ]`   `subscription_create` → early return, zero DB writes, zero wallet calls
  * `[ ]`   `subscription_cycle` with existing `COMPLETED` → idempotency early return
  * `[ ]`   `subscription_cycle` new → full flow, final status `COMPLETED`

  ### 6–10. (Not applicable — updating existing file; no new guards, mocks, or provides)

  ### 11. External Boundary

  * `[ ]`   `PaymentConfirmation` return type unchanged

  ### 12. Edge Validation

  * `[ ]`   Covered by the integration test node (next)

  ### 13. Directionality

  * `[ ]`   Node layer: adapter/handler
  * `[ ]`   `HandlerContext` injected at webhook boundary

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   Three new tests GREEN
  * `[ ]`   All existing tests in `stripe.invoice.*.test.ts` and `stripe.invoicePaymentSucceeded.test.ts` GREEN
  * `[ ]`   No other handler files touched

---

* `[ ]`   `supabase/functions/webhooks/index.subscriptionCreate.integration.test.ts` **[TEST-INT] Integration: full new-subscription flow — checkout.session.completed writes subscription, invoice.payment_succeeded for subscription_create is skipped, subscription_cycle renewal is fully processed**

  ### 1. Intent & Position

  * `[ ]`   `objective`
    * `[ ]`   Prove the repaired call stack end-to-end: subscription plan in DB → checkout completed → `user_subscriptions` and `token_wallets` updated → `invoice.payment_succeeded` (`subscription_create`) returns early → `invoice.payment_succeeded` (`subscription_cycle`) fully processes with `COMPLETED` status
    * `[ ]`   Prove all existing tests in `_shared/adapters/stripe/**` and `_shared/services/tokenwallet/**` remain GREEN
    * `[ ]`   Uses `_integration.test.utils.ts` harness for transactional isolation

  * `[ ]`   `role`
    * `[ ]`   Integration test — boundary: webhook handler → Stripe adapter → DB
    * `[ ]`   Stripe SDK calls stubbed; no live Stripe API

  ### 2. Dependencies & Injection

  * `[ ]`   `deps`
    * `[ ]`   `coreInitializeTestStep`, `coreCleanupTestResources` from `_integration.test.utils.ts`
    * `[ ]`   `handleWebhookRequestLogic` from `webhooks/index.ts`
    * `[ ]`   `AdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.provides.ts`
    * `[ ]`   All Part 1 and Part 2 fix nodes must be GREEN

  ### 3. Contract Definition

  * `[ ]`   Five cases:
    * `[ ]`   **Case 1:** seed `subscription_plans` row → readable via admin client
    * `[ ]`   **Case 2:** `checkout.session.completed` → `user_subscriptions` row created, `payment_transactions` row `COMPLETED`, `token_wallets` balance credited
    * `[ ]`   **Case 3:** `invoice.payment_succeeded` / `subscription_create` → NO new `payment_transactions` row, NO additional wallet credit
    * `[ ]`   **Case 4:** `invoice.payment_succeeded` / `subscription_cycle` → new `payment_transactions` row with `status = 'COMPLETED'`, balance incremented
    * `[ ]`   **Case 5:** replay same `subscription_cycle` event → idempotency: no second row, balance unchanged

  ### 9. Implementation

  * `[ ]`   `index.subscriptionCreate.integration.test.ts`
    * `[ ]`   `Deno.test` with `t.step` grouping per `tokenWalletService.test.ts` pattern
    * `[ ]`   Typed Stripe event fixtures using `Stripe.InvoicePaymentSucceededEvent` and `Stripe.CheckoutSessionCompletedEvent`
    * `[ ]`   Seed `subscription_plans` directly via admin client
    * `[ ]`   Assert DB state after each case using admin client reads

  ### 12. Edge Validation

  * `[ ]`   This file IS the edge validation for the entire fix set

  ### 14. Completion Criteria

  * `[ ]`   File lints clean
  * `[ ]`   All five cases GREEN
  * `[ ]`   All existing tests in `_shared/adapters/stripe/**` GREEN
  * `[ ]`   All existing tests in `_shared/services/tokenwallet/**` GREEN
  * `[ ]`   `index.invoice.integration.test.ts`, `index.checkoutSession.integration.test.ts`, `index.subscriptions.integration.test.ts` remain GREEN

  ### 15. Versioning

  * `[ ]`   **Commit** `fix(stripe): fix payment_transactions constraint, webhook AdminTokenWalletService wiring, and invoice billing_reason routing`
    * `[ ]`   Structural: new migration `20260403000000_fix_payment_transactions_status_constraint.sql`; new integration test
    * `[ ]`   Behavioral: `handleInvoicePaymentSucceeded` returns early for `subscription_create`; uses `COMPLETED` throughout; `webhooks/index.ts` uses `AdminTokenWalletService`
    * `[ ]`   Contract: `payment_transactions.status` accepts `PROCESSING_RENEWAL` and `TOKEN_AWARD_FAILED`

---

## Other Backlog Items

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

## Swap default model to Gemini Flash

## Let users pick model on "Start Project" page 

## Fix continuation naming to use continuation naming instead of iterations 

## 
