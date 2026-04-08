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

* `[✅] `   `supabase/functions/_shared/services/tokenwallet/client/userTokenWalletService.ts` **[BE] UserTokenWalletService — user-scoped, RLS-enforced token wallet reads**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Create `UserTokenWalletService(userClient: SupabaseClient<Database>)` to own all RLS-enforced, user-visible wallet operations: `getWallet`, `getWalletForContext`, `getBalance`, `checkBalance`, `getTransactionHistory`, `getWalletByIdAndUser`
    * `[✅] `   Remove these methods from the existing `TokenWalletService`; they must not exist on the admin-scoped class
    * `[✅] `   Instantiated only with a user Supabase client; never with service-role

  * `[✅] `   `role`
    * `[✅] `   Infrastructure/service layer — user-scoped token wallet reads
    * `[✅] `   Must NOT perform admin operations (createWallet, recordTransaction)
    * `[✅] `   Must NOT bypass RLS

  * `[✅] `   `module`
    * `[✅] `   Bounded context: user-facing token wallet reads
    * `[✅] `   Inside: all read methods, user Supabase client, RLS-enforced queries
    * `[✅] `   Outside: wallet creation, transaction recording, admin client

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `SupabaseClient<Database>` from `npm:@supabase/supabase-js` — user-context client only
    * `[✅] `   `Database` from `../../../types_db.ts`
    * `[✅] `   Shared domain types from `../../types/tokenWallet.types.ts`

  * `[✅] `   `context_slice`
    * `[✅] `   Constructor consumes exactly: `userClient: SupabaseClient<Database>`
    * `[✅] `   No admin client, no service-role bypass

  ### 3. Contract Definition

  * `[✅] `   `tokenwallet/client/userTokenWalletService.interface.test.ts`
    * `[✅] `   `getWallet` with valid UUID → returns `TokenWallet` or `null`
    * `[✅] `   `getWallet` with invalid UUID → returns `null`
    * `[✅] `   `getWalletForContext` with `userId` → returns wallet or `null`
    * `[✅] `   `getWalletForContext` with neither → returns `null`
    * `[✅] `   `getBalance` with valid wallet → returns balance string
    * `[✅] `   `getBalance` with non-existent wallet → throws
    * `[✅] `   `checkBalance` sufficient funds → `true`; insufficient → `false`
    * `[✅] `   `getTransactionHistory` → returns `PaginatedTransactions` with correct shape
    * `[✅] `   `getWalletByIdAndUser` → returns wallet for owner, `null` for non-owner (RLS)

  ### 4. Structural Boundary

  * `[✅] `   `tokenwallet/client/userTokenWalletService.interface.ts`
    * `[✅] `   `IUserTokenWalletService` with:
      * `getWallet(walletId: string): Promise<TokenWallet | null>`
      * `getWalletForContext(userId?: string, organizationId?: string): Promise<TokenWallet | null>`
      * `getBalance(walletId: string): Promise<string>`
      * `checkBalance(walletId: string, amountToSpend: string): Promise<boolean>`
      * `getTransactionHistory(walletId: string, params?: GetTransactionHistoryParams): Promise<PaginatedTransactions>`
      * `getWalletByIdAndUser(walletId: string, userId: string): Promise<TokenWallet | null>`

  ### 5. Interaction Semantics

  * `[✅] `   `interaction.spec`
    * `[✅] `   All methods use `userClient` — RLS is the enforcement boundary
    * `[✅] `   `checkBalance` delegates to `getBalance`; returns `boolean`, never throws on wallet-not-found (re-throws from `getBalance`)
    * `[✅] `   `getTransactionHistory` supports pagination via `GetTransactionHistoryParams`; `fetchAll: true` bypasses pagination

  ### 6. Enforcement

  * `[✅] `   `tokenwallet/client/userTokenWalletService.guard.test.ts`
    * `[✅] `   `isIUserTokenWalletService(x)` → true for valid, false for `null`, `{}`, admin-service instance
  * `[✅] `   `tokenwallet/client/userTokenWalletService.guard.ts`
    * `[✅] `   `isIUserTokenWalletService`: checks all six method names are functions

  ### 7. Behavioral Verification

  * `[✅] `   `tokenwallet/client/userTokenWalletService.test.ts`
    * `[✅] `   One test per contract case from Section 3
    * `[✅] `   All existing `tokenWalletService.balance.test.ts`, `tokenWalletService.createWallet.test.ts`, `tokenWalletService.getWallet.test.ts`, `tokenWalletService.history.test.ts`, `tokenWalletService.IdAndUser.test.ts` behaviors must be covered in the new test file

  ### 8. Construction

  * `[✅] `   Constructor: `UserTokenWalletService(userClient: SupabaseClient<Database>)`
  * `[✅] `   Single required arg; no optional params, no defaults

  ### 9. Implementation

  * `[✅] `   `tokenwallet/client/userTokenWalletService.ts`
    * `[✅] `   Lift `getWallet`, `getWalletForContext`, `getBalance`, `checkBalance`, `getTransactionHistory`, `getWalletByIdAndUser` verbatim from `tokenWalletService.ts` — all `this.supabaseClient` references become `this.userClient`
    * `[✅] `   Lift `_transformDbWalletToTokenWallet` private helper
    * `[✅] `   Implements `IUserTokenWalletService`

  ### 10. Simulation

  * `[✅] `   `tokenwallet/client/userTokenWalletService.mock.ts`
    * `[✅] `   `createMockUserTokenWalletService(): MockUserTokenWalletService` — stub all six methods with `spy()`
    * `[✅] `   Conforms to `IUserTokenWalletService`

  ### 11. External Boundary

  * `[✅] `   `tokenwallet/client/userTokenWalletService.provides.ts`
    * `[✅] `   Re-exports: `UserTokenWalletService`, `IUserTokenWalletService`, `isIUserTokenWalletService`, `createMockUserTokenWalletService`
    * `[✅] `   Does NOT re-export admin-scoped types

  ### 12. Edge Validation

  * `[✅] `   `tokenwallet/client/userTokenWalletService.integration.test.ts`
    * `[✅] `   Uses `coreInitializeTestStep`
    * `[✅] `   `getWalletForContext` with valid userId → returns wallet
    * `[✅] `   `getBalance` → returns correct string balance
    * `[✅] `   `getTransactionHistory` → returns paginated results
    * `[✅] `   RLS: user cannot read another user's wallet via `getWalletByIdAndUser`

  ### 13. Directionality

  * `[✅] `   Node layer: infrastructure/service (user)
  * `[✅] `   Deps inward-facing: user `SupabaseClient<Database>` injected at request boundary
  * `[✅] `   No cycles

  ### 14. Completion Criteria

  * `[✅] `   All files in `tokenwallet/client/` lint clean
  * `[✅] `   All unit tests GREEN
  * `[✅] `   Integration test GREEN
  * `[✅] `   `IUserTokenWalletService` guard correctly rejects admin-service instances

---

* `[✅] `   `supabase/functions/_shared/adapters/stripe/stripePaymentAdapter.ts` **[BE] Narrow tokenWalletService dependency to IAdminTokenWalletService**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   `StripePaymentAdapter` constructor takes `tokenWalletService: ITokenWalletService` (line 41) — a combined interface that no longer exists after the refactor
    * `[✅] `   The adapter only calls `recordTransaction` (admin operation) via `HandlerContext`; it never calls user-scoped methods
    * `[✅] `   Narrow constructor parameter and `HandlerContext.tokenWalletService` field to `IAdminTokenWalletService`

  * `[✅] `   `role`
    * `[✅] `   Adapter/infrastructure — translates Stripe webhook events into DB writes via admin-scoped token wallet calls
    * `[✅] `   Must NOT accept or hold a reference to `IUserTokenWalletService`

  * `[✅] `   `module`
    * `[✅] `   Inside: constructor signature, `HandlerContext` assembly
    * `[✅] `   Outside: webhook routing, wallet reads, user-scoped operations

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   Replace `import { ITokenWalletService } from '../../types/tokenWallet.types.ts'` with `import { IAdminTokenWalletService } from '../services/tokenwallet/admin/adminTokenWalletService.provides.ts'`
    * `[✅] `   `AdminTokenWalletService` node must be complete before this node

  ### 3–11. (Not applicable — updating existing file; no new guards, mocks, or provides)

  ### 12. Edge Validation

  * `[✅] `   Existing `stripePaymentAdapter` tests remain GREEN
  * `[✅] `   `HandlerContext.tokenWalletService` is typed `IAdminTokenWalletService` in all handler files

  ### 14. Completion Criteria

  * `[✅] `   File lints clean
  * `[✅] `   No reference to `ITokenWalletService` remains in this file

---

* `[✅] `   `supabase/functions/_shared/adapters/adapterFactory.ts` **[BE] Narrow tokenWalletService parameter to IAdminTokenWalletService**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   `getPaymentAdapter` takes `tokenWalletService: ITokenWalletService` (line 13) and passes it to `StripePaymentAdapter` (line 78) — the combined interface no longer exists after the refactor
    * `[✅] `   The factory only passes the service to `StripePaymentAdapter`, which uses it for admin operations only
    * `[✅] `   Narrow parameter type to `IAdminTokenWalletService`; update `PaymentAdapterFactoryFn` export type in `webhooks/index.ts` in the same pass (coordinate with the `webhooks/index.ts` node)

  * `[✅] `   `role`
    * `[✅] `   Infrastructure/factory — constructs the correct payment adapter for a given source
    * `[✅] `   Must NOT import `IUserTokenWalletService`

  * `[✅] `   `module`
    * `[✅] `   Inside: `getPaymentAdapter` signature, `StripePaymentAdapter` construction
    * `[✅] `   Outside: routing, webhook verification, handler logic

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   Replace `import { ITokenWalletService } from '../types/tokenWallet.types.ts'` with `import { IAdminTokenWalletService } from './services/tokenwallet/admin/adminTokenWalletService.provides.ts'`
    * `[✅] `   `stripePaymentAdapter.ts` node must be complete before this node

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[✅] `   Existing adapter factory tests remain GREEN

  ### 14. Completion Criteria

  * `[✅] `   File lints clean
  * `[✅] `   No reference to `ITokenWalletService` remains in this file

---

* `[✅] `   `supabase/functions/webhooks/index.ts` **[BE] Migrate webhooks handler to AdminTokenWalletService**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Replace the incorrect single-arg `tokenWalletServiceFactory: new (adminClient) => ITokenWalletService` with `adminTokenWalletServiceFactory: (adminClient: SupabaseClient<Database>) => IAdminTokenWalletService`
    * `[✅] `   Update `WebhookRouterDependencies`, `webhookRouterHandler`, and `serve()` wiring to use `AdminTokenWalletService`
    * `[✅] `   `WebhookHandlerDependencies.tokenWalletService` type narrows from `ITokenWalletService` to `IAdminTokenWalletService`

  * `[✅] `   `role`
    * `[✅] `   Application boundary — wires server-side dependencies for the webhook handler
    * `[✅] `   Must NOT import or reference `UserTokenWalletService` or `IUserTokenWalletService`

  * `[✅] `   `module`
    * `[✅] `   Bounded context: webhook request routing
    * `[✅] `   Inside: dependency wiring, adapter factory invocation
    * `[✅] `   Outside: handler logic (in stripe adapter files)

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `AdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.provides.ts`
    * `[✅] `   `IAdminTokenWalletService` from same
    * `[✅] `   Remove import of old `TokenWalletService` and `ITokenWalletService`

  * `[✅] `   `context_slice`
    * `[✅] `   `WebhookRouterDependencies.adminTokenWalletServiceFactory: (adminClient: SupabaseClient<Database>) => IAdminTokenWalletService`

  ### 3. Contract Definition

  * `[✅] `   `index.router.test.ts` (existing — update relevant test cases)
    * `[✅] `   `adminTokenWalletServiceFactory` receives `adminClient` and returns an `IAdminTokenWalletService` instance
    * `[✅] `   `serve()` wiring passes `AdminTokenWalletService.createForContext` (or direct instantiation) as factory

  ### 4. Structural Boundary

  * `[✅] `   `WebhookRouterDependencies` type: replace `tokenWalletServiceFactory: new (adminClient) => ITokenWalletService` with `adminTokenWalletServiceFactory: (adminClient: SupabaseClient<Database>) => IAdminTokenWalletService`
  * `[✅] `   `WebhookHandlerDependencies.tokenWalletService` type: `IAdminTokenWalletService`

  ### 5–11. (Not applicable — updating existing file, no new interface/guard/mock/provides)

  ### 12. Edge Validation

  * `[✅] `   Existing `index.invoice.integration.test.ts` and `index.checkoutSession.integration.test.ts` remain GREEN

  ### 13. Directionality

  * `[✅] `   Node layer: application boundary
  * `[✅] `   Admin service flows inward from server context only

  ### 14. Completion Criteria

  * `[✅] `   `webhooks/index.ts` lints clean
  * `[✅] `   All existing webhook integration tests GREEN
  * `[✅] `   No reference to old `ITokenWalletService` or `TokenWalletService` remains in this file

---

* `[✅] `   `supabase/functions/allocate-periodic-tokens/index.ts` **[BE] Migrate allocate-periodic-tokens to AdminTokenWalletService**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Replace `new TokenWalletService(supabaseAdminClient)` (single-arg, broken) with `new AdminTokenWalletService(supabaseAdminClient)` using the correct class
    * `[✅] `   Update deps type to reference `IAdminTokenWalletService`

  * `[✅] `   `role`
    * `[✅] `   Server-side cron/periodic function — uses only `recordTransaction`
    * `[✅] `   Must NOT import `UserTokenWalletService`

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `AdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.provides.ts`
    * `[✅] `   Remove import of `TokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[✅] `   Existing tests for `allocate-periodic-tokens` remain GREEN

  ### 14. Completion Criteria

  * `[✅] `   File lints clean
  * `[✅] `   No reference to old `TokenWalletService` remains

---

* `[✅] `   `supabase/functions/wallet-info/index.ts` **[BE] Migrate wallet-info to UserTokenWalletService**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Replace `new NewTokenWalletService(supabaseUserClient)` (single-arg, wrong class) with `new UserTokenWalletService(supabaseUserClient)`
    * `[✅] `   Update `Deps` interface: `NewTokenWalletService: typeof TokenWalletService` → `NewTokenWalletService: typeof UserTokenWalletService`
    * `[✅] `   Update `tokenWalletServiceInstance` type from `TokenWalletService` to `IUserTokenWalletService`

  * `[✅] `   `role`
    * `[✅] `   User-facing endpoint — only calls `getWalletForContext`
    * `[✅] `   Must NOT import `AdminTokenWalletService`

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `UserTokenWalletService`, `IUserTokenWalletService` from `tokenwallet/client/userTokenWalletService.provides.ts`
    * `[✅] `   Remove import of `TokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[✅] `   Existing `wallet-info` tests remain GREEN

  ### 14. Completion Criteria

  * `[✅] `   File lints clean
  * `[✅] `   No reference to old `TokenWalletService` remains

---

* `[✅] `   `supabase/functions/wallet-history/index.ts` **[BE] Migrate wallet-history to UserTokenWalletService**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Replace `new deps.NewTokenWalletService(supabaseUserClient)` with `new deps.NewTokenWalletService(supabaseUserClient)` using `UserTokenWalletService`
    * `[✅] `   Update `Deps` interface: `NewTokenWalletService` and `tokenWalletServiceInstance` types to `UserTokenWalletService` / `IUserTokenWalletService`

  * `[✅] `   `role`
    * `[✅] `   User-facing endpoint — calls `getWalletForContext` and `getTransactionHistory`
    * `[✅] `   Must NOT import `AdminTokenWalletService`

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `UserTokenWalletService`, `IUserTokenWalletService` from `tokenwallet/client/userTokenWalletService.provides.ts`
    * `[✅] `   Remove import of `TokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[✅] `   Existing `wallet-history` tests remain GREEN

  ### 14. Completion Criteria

  * `[✅] `   File lints clean
  * `[✅] `   No reference to old `TokenWalletService` remains

---

* `[✅] `   `supabase/functions/initiate-payment/index.ts` **[BE] Migrate initiate-payment to UserTokenWalletService for getWalletForContext; AdminTokenWalletService where recordTransaction is passed to adapter**

  ### 1. Intent & Position

  * `[✅] `   `objective`
    * `[✅] `   Line 178: `getWalletForContext` → inject `UserTokenWalletService`
    * `[✅] `   Line 52: `TokenWalletService` passed to `StripePaymentAdapter` which calls `recordTransaction` → inject `AdminTokenWalletService`; update adapter dep type to `IAdminTokenWalletService`
    * `[✅] `   Two separate injected deps; no single class serves both roles

  * `[✅] `   `role`
    * `[✅] `   Application boundary — initiates Stripe checkout; uses user-scoped wallet lookup and passes admin-scoped service to adapter

  ### 2. Dependencies & Injection

  * `[✅] `   `deps`
    * `[✅] `   `UserTokenWalletService`, `IUserTokenWalletService` from client provides
    * `[✅] `   `AdminTokenWalletService`, `IAdminTokenWalletService` from admin provides
    * `[✅] `   `StripePaymentAdapter` dep type for wallet service narrows to `IAdminTokenWalletService`

  ### 3–11. (Not applicable — updating existing file)

  ### 12. Edge Validation

  * `[✅] `   Existing `initiate-payment` tests remain GREEN

  ### 14. Completion Criteria

  * `[✅] `   File lints clean
  * `[✅] `   No reference to old `TokenWalletService` or `ITokenWalletService` remains

---

* `[✅] `   `supabase/functions/chat/handleNormalPath.ts` **[DELETE] Remove dead non-streaming normal path — all normal messages use streaming**

  ### Justification
  * `[✅] `   `isStreamingEnabled` is hardcoded `true` in `ChatInput.tsx` (line 34); all normal (non-rewind) messages use `sendStreamingMessage` → `handleStreamingRequest` → `handleStreamingNormalPath`
  * `[✅] `   `handleNormalPath` is only reachable via `handlePostRequest` when streaming is not requested — no frontend path triggers this
  * `[✅] `   No other edge function or service imports `handleNormalPath`
  * `[✅] `   Maintaining a dead non-streaming code path that duplicates `handleStreamingNormalPath` logic creates confusion and maintenance burden

  ### Deletion Steps
  * `[✅] `   Delete `supabase/functions/chat/handleNormalPath.ts`
  * `[✅] `   Delete `supabase/functions/chat/handleNormalPath.test.ts`
  * `[✅] `   Remove `handleNormalPath` import and reference from `supabase/functions/chat/index.ts` (`defaultDeps.handleNormalPath`)
  * `[✅] `   Remove `handleNormalPath` import and reference from `supabase/functions/chat/handlePostRequest.ts` (this file is also being deleted — see below)
  * `[✅] `   Remove `handleNormalPath` from `ChatHandlerDeps` in `_shared/types.ts`
  * `[✅] `   Grep entire codebase for remaining references; remove any dead imports

  ### Completion Criteria
  * `[✅] `   No file named `handleNormalPath*` exists in `chat/`
  * `[✅] `   No import of `handleNormalPath` exists anywhere in the codebase
  * `[✅] `   All remaining tests GREEN

---

* `[✅]`   `supabase/functions/chat/constructMessageHistory/constructMessageHistory.ts` **[BE] Decompose constructMessageHistory into spec-compliant function with proper DI, typed interface, deps/params/payload/return**

  ### 1. Intent & Position

  * `[✅]`   `objective`
    * `[✅]`   `constructMessageHistory` currently takes seven positional args `(supabaseClient, existingChatId, newUserMessageContent, system_prompt_text, rewindFromMessageId, selectedMessages, logger)` — no typed deps/params/payload/return interfaces
    * `[✅]`   Imports `ChatHandlerDeps` solely for `ChatHandlerDeps['logger']` type narrowing — should use `ILogger` directly
    * `[✅]`   Create `constructMessageHistory.interface.ts` defining `ConstructMessageHistoryDeps`, `ConstructMessageHistoryParams`, `ConstructMessageHistoryPayload`, `ConstructMessageHistoryReturn`
    * `[✅]`   Refactor function signature to `constructMessageHistory(deps: ConstructMessageHistoryDeps, params: ConstructMessageHistoryParams, payload: ConstructMessageHistoryPayload): Promise<ConstructMessageHistoryReturn>`
    * `[✅]`   `ConstructMessageHistoryDeps` contains: `logger: ILogger`, `supabaseClient: SupabaseClient<Database>`
    * `[✅]`   `ConstructMessageHistoryParams` contains: `existingChatId: string | null | undefined`, `system_prompt_text: string | null`, `rewindFromMessageId: string | null | undefined`
    * `[✅]`   `ConstructMessageHistoryPayload` contains: `newUserMessageContent: string`, `selectedMessages: ChatApiRequest['selectedMessages']`
    * `[✅]`   `ConstructMessageHistoryReturn` = `ConstructMessageHistorySuccess | ConstructMessageHistoryError`
    * `[✅]`   `ConstructMessageHistorySuccess` = `{ history: { role: ChatMessageRole, content: string }[] }`
    * `[✅]`   `ConstructMessageHistoryError` = `{ history: { role: ChatMessageRole, content: string }[], historyFetchError: Error }`

  * `[✅]`   `role`
    * `[✅]`   Domain/helper — assembles message history from selectedMessages, DB fetch, or empty state, appending the new user message
    * `[✅]`   Pure data assembly — reads from DB but does not write; no token operations, no AI calls
    * `[✅]`   Must NOT perform any wallet, AI, or routing operations

  * `[✅]`   `module`
    * `[✅]`   Bounded context: message history construction for chat requests
    * `[✅]`   Inside: system prompt insertion, selectedMessages formatting, DB message fetch, user message append
    * `[✅]`   Outside: request parsing, auth, routing, AI calls, token debit, wallet operations

  ### 2. Dependencies & Injection

  * `[✅]`   `deps`
    * `[✅]`   `ILogger` from `_shared/types.ts` — logging
    * `[✅]`   `SupabaseClient<Database>` from `npm:@supabase/supabase-js@2` — DB reads for chat message history
    * `[✅]`   `isChatMessageRole` from `_shared/utils/type_guards.ts` — runtime type narrowing for DB messages (imported directly, not injected — pure utility)
    * `[✅]`   No reverse dependencies

  * `[✅]`   `context_slice`
    * `[✅]`   `ConstructMessageHistoryDeps` holds cross-cutting injectable deps (logger, supabase client)
    * `[✅]`   `ConstructMessageHistoryParams` holds per-request contextual data (chat ID, prompt text, rewind flag)
    * `[✅]`   `ConstructMessageHistoryPayload` holds the actual message data being assembled into history

  ### 3. Contract Definition

  * `[✅]`   `constructMessageHistory.interface.test.ts`
    * `[✅]`   Valid: `ConstructMessageHistoryDeps` has `logger` with `info`/`warn`/`error` functions and `supabaseClient` with `from` function
    * `[✅]`   Valid: `ConstructMessageHistoryParams` has `existingChatId` as string, `system_prompt_text` as string, `rewindFromMessageId` as null
    * `[✅]`   Valid: `ConstructMessageHistoryParams` has `existingChatId` as null, `system_prompt_text` as null, `rewindFromMessageId` as string
    * `[✅]`   Valid: `ConstructMessageHistoryPayload` has `newUserMessageContent` as string and `selectedMessages` as array of `{ role, content }` objects
    * `[✅]`   Valid: `ConstructMessageHistoryPayload` has `newUserMessageContent` as string and `selectedMessages` as undefined
    * `[✅]`   Valid: `ConstructMessageHistorySuccess` has `history` array with `{ role: ChatMessageRole, content: string }` entries
    * `[✅]`   Valid: `ConstructMessageHistoryError` has `history` array and `historyFetchError` as `Error`
    * `[✅]`   Valid: `ConstructMessageHistoryReturn` accepts `ConstructMessageHistorySuccess` value
    * `[✅]`   Valid: `ConstructMessageHistoryReturn` accepts `ConstructMessageHistoryError` value
    * `[✅]`   Valid: `ConstructMessageHistory` function type is `(deps, params, payload) => Promise<ConstructMessageHistoryReturn>`

  ### 4. Structural Boundary

  * `[✅]`   `constructMessageHistory.interface.ts`
    * `[✅]`   `ConstructMessageHistoryDeps` — `logger: ILogger`, `supabaseClient: SupabaseClient<Database>`
    * `[✅]`   `ConstructMessageHistoryParams` — `existingChatId: string | null | undefined`, `system_prompt_text: string | null`, `rewindFromMessageId: string | null | undefined`
    * `[✅]`   `ConstructMessageHistoryPayload` — `newUserMessageContent: string`, `selectedMessages: ChatApiRequest['selectedMessages']`
    * `[✅]`   `ConstructMessageHistorySuccess` — `{ history: { role: ChatMessageRole, content: string }[] }`
    * `[✅]`   `ConstructMessageHistoryError` — `{ history: { role: ChatMessageRole, content: string }[], historyFetchError: Error }`
    * `[✅]`   `ConstructMessageHistoryReturn` — `ConstructMessageHistorySuccess | ConstructMessageHistoryError`
    * `[✅]`   `ConstructMessageHistory` — function type `(deps, params, payload) => Promise<ConstructMessageHistoryReturn>`
    * `[✅]`   No `any`, no optional fields except where the current function explicitly supports `null | undefined`

  ### 5. Interaction Semantics

  * `[✅]`   `interaction.spec`
    * `[✅]`   Called by `streamChat` and `streamRewind` path handlers to assemble message history before AI call
    * `[✅]`   Receives `deps` (logger, supabaseClient), `params` (chatId, prompt text, rewind flag), `payload` (user message, selectedMessages)
    * `[✅]`   Behavior:
      * If `system_prompt_text` is non-null: prepends system message to history
      * If `selectedMessages` present: uses them as history body
      * Else if `existingChatId` and no `rewindFromMessageId`: fetches history from DB, filters with `isChatMessageRole`
      * Else if `rewindFromMessageId`: skips DB fetch (rewind path handles history)
      * Else: minimal history (no prior messages)
      * Always appends user message as final entry
    * `[✅]`   On DB fetch error: returns `ConstructMessageHistoryError` with partial history and `historyFetchError`
    * `[✅]`   On success: returns `ConstructMessageHistorySuccess` with complete history

  ### 6. Enforcement

  * `[✅]`   `constructMessageHistory.guard.test.ts`
    * `[✅]`   `isConstructMessageHistoryDeps(x)` → true for valid deps with `logger` and `supabaseClient`
    * `[✅]`   `isConstructMessageHistoryDeps(x)` → false for `null`, `{}`, object missing `logger`, object missing `supabaseClient`

  * `[✅]`   `constructMessageHistory.guard.ts`
    * `[✅]`   `isConstructMessageHistoryDeps`: checks `logger` and `supabaseClient` present with expected shapes

  ### 7. Behavioral Verification

  * `[✅]`   `constructMessageHistory.test.ts` (update existing)
    * `[✅]`   Update all tests to use `ConstructMessageHistoryDeps`, `ConstructMessageHistoryParams`, `ConstructMessageHistoryPayload` types
    * `[✅]`   Test: selectedMessages provided → history contains system prompt + selectedMessages + user message
    * `[✅]`   Test: no selectedMessages, existing chatId → fetches from DB, filters invalid roles, appends user message
    * `[✅]`   Test: DB fetch error → returns `ConstructMessageHistoryError` with `historyFetchError` and partial history
    * `[✅]`   Test: no selectedMessages, no chatId, no rewind → minimal history with system prompt + user message
    * `[✅]`   Test: rewindFromMessageId present → skips DB fetch, returns system prompt + user message
    * `[✅]`   Test: no system prompt → history starts without system message
    * `[✅]`   Each test covers exactly one behavior

  ### 8. Construction

  * `[✅]`   `construction`
    * `[✅]`   `constructMessageHistory(deps, params, payload)` — all three args required
    * `[✅]`   `deps` constructed by caller (path handlers) from their own deps
    * `[✅]`   Invalid: calling with old seven positional args — rejected by type system

  ### 9. Implementation

  * `[✅]`   `constructMessageHistory.ts`
    * `[✅]`   Change signature from `constructMessageHistory(supabaseClient, existingChatId, newUserMessageContent, system_prompt_text, rewindFromMessageId, selectedMessages, logger)` to `constructMessageHistory(deps: ConstructMessageHistoryDeps, params: ConstructMessageHistoryParams, payload: ConstructMessageHistoryPayload): Promise<ConstructMessageHistoryReturn>`
    * `[✅]`   Remove import of `ChatHandlerDeps` — use `ILogger` directly via interface
    * `[✅]`   Destructure `deps` → `{ logger, supabaseClient }`, `params` → `{ existingChatId, system_prompt_text, rewindFromMessageId }`, `payload` → `{ newUserMessageContent, selectedMessages }`
    * `[✅]`   Return `ConstructMessageHistorySuccess` on success, `ConstructMessageHistoryError` on DB fetch error
    * `[✅]`   All existing logic preserved, only structural refactor of arguments and return type

  ### 10. Simulation

  * `[✅]`   `constructMessageHistory.mock.ts`
    * `[✅]`   `createMockConstructMessageHistory(): MockConstructMessageHistory` — stub returning mock `ConstructMessageHistorySuccess`
    * `[✅]`   `buildContractConstructMessageHistoryDeps(): ConstructMessageHistoryDeps` — valid deps for contract tests
    * `[✅]`   `buildContractConstructMessageHistoryParams(): ConstructMessageHistoryParams` — valid params for contract tests
    * `[✅]`   Conforms to `ConstructMessageHistory` function type from interface

  ### 11. External Boundary

  * `[✅]`   `constructMessageHistory.provides.ts`
    * `[✅]`   Re-exports: `constructMessageHistory`, `ConstructMessageHistoryDeps`, `ConstructMessageHistoryParams`, `ConstructMessageHistoryPayload`, `ConstructMessageHistoryReturn`, `ConstructMessageHistorySuccess`, `ConstructMessageHistoryError`, `ConstructMessageHistory`, `isConstructMessageHistoryDeps`, `createMockConstructMessageHistory`, `buildContractConstructMessageHistoryDeps`, `buildContractConstructMessageHistoryParams`

  ### 12. Edge Validation

  * `[✅]`   `constructMessageHistory.integration.test.ts`
    * `[✅]`   Validate: `constructMessageHistory` (subject) with mocked `supabaseClient` returning DB messages → correct history assembly
    * `[✅]`   Validate: `streamChat` (consumer) can construct `ConstructMessageHistoryDeps` from its own deps and invoke `constructMessageHistory` with correct params/payload
    * `[✅]`   Uses mocks only for external nodes (Supabase client)

  ### 13. Directionality

  * `[✅]`   Node layer: domain/helper (inner)
  * `[✅]`   Deps inward-facing: `ILogger`, `SupabaseClient` — infrastructure layer
  * `[✅]`   Provides outward-facing: consumed by `streamChat` and `streamRewind` path handlers
  * `[✅]`   No cycles

  ### 14. Completion Criteria

  * `[✅]`   All interface, guard, test, mock, provides files created and lint clean
  * `[✅]`   `constructMessageHistory.ts` uses new `(deps, params, payload)` signature, no reference to `ChatHandlerDeps`, no positional args
  * `[✅]`   Return type is `ConstructMessageHistorySuccess | ConstructMessageHistoryError`, not a bare tuple
  * `[✅]`   All tests GREEN
  * `[✅]`   Integration test GREEN

---

* `[✅]`   `supabase/functions/chat/prepareChatContext/prepareChatContext.ts` **[BE] Decompose prepareChatContext into spec-compliant function with proper DI, typed interface, IUserTokenWalletService, and removal of PathHandlerContext God object**

  ### 1. Intent & Position

  * `[✅]`   `objective`
    * `[✅]`   `prepareChatContext` currently takes `(requestBody: ChatApiRequest, userId: string, deps: PrepareChatContextDeps)` where `PrepareChatContextDeps extends ChatHandlerDeps` — inherits the entire God object
    * `[✅]`   Line 43: destructures `tokenWalletService` from `deps` — this is the old unsplit `TokenWalletService`, must be replaced with `userTokenWalletService: IUserTokenWalletService`
    * `[✅]`   Lines 145/150: calls `tokenWalletService!.getWalletByIdAndUser()` and `.getWalletForContext()` — these are `IUserTokenWalletService` methods (user-scoped, RLS-enforced reads)
    * `[✅]`   Line 6: `PrepareChatContextDeps extends ChatHandlerDeps` — must be replaced with a narrow, standalone interface
    * `[✅]`   Lines 20-25: defines `PathHandlerContext` which embeds `deps: ChatHandlerDeps` — this God object must be removed; downstream consumers already have their own typed deps
    * `[✅]`   Test file imports `createMockTokenWalletService` from old deleted `tokenWalletService.mock.ts` — must use `createMockUserTokenWalletService`
    * `[✅]`   Create `prepareChatContext.interface.ts` defining `PrepareChatContextDeps`, `PrepareChatContextParams`, `PrepareChatContextPayload`, `PrepareChatContextReturn`
    * `[✅]`   Refactor function signature to `prepareChatContext(deps: PrepareChatContextDeps, params: PrepareChatContextParams, payload: PrepareChatContextPayload): Promise<PrepareChatContextReturn>`
    * `[✅]`   `PrepareChatContextDeps` contains: `logger: ILogger`, `userTokenWalletService: IUserTokenWalletService`, `getAiProviderAdapter: GetAiProviderAdapterFn`, `supabaseClient: SupabaseClient<Database>`
    * `[✅]`   `PrepareChatContextParams` contains: `userId: string`
    * `[✅]`   `PrepareChatContextPayload` contains: `requestBody: ChatApiRequest`
    * `[✅]`   `PrepareChatContextReturn` = `PrepareChatContextSuccess | PrepareChatContextError`
    * `[✅]`   `PrepareChatContextSuccess` = `SuccessfulChatContext` (wallet, adapter, modelConfig, prompt text, apiKey, providerApiIdentifier)
    * `[✅]`   `PrepareChatContextError` = `ErrorChatContext` (error with message and status)
    * `[✅]`   Remove `PathHandlerContext` interface entirely — it is the God object being eliminated
    * `[✅]`   Keep `SuccessfulChatContext` and `ErrorChatContext` as return type components

  * `[✅]`   `role`
    * `[✅]`   Domain/service — resolves all context needed for a chat request: system prompt, AI provider, model config, API key, wallet
    * `[✅]`   Reads from DB (prompts, providers), validates provider state, resolves wallet via `IUserTokenWalletService`
    * `[✅]`   Must NOT perform token counting, AI calls, message history construction, or routing

  * `[✅]`   `module`
    * `[✅]`   Bounded context: chat request context resolution
    * `[✅]`   Inside: system prompt lookup, provider/model config resolution, API key retrieval, wallet resolution via `IUserTokenWalletService`
    * `[✅]`   Outside: message history, AI calls, token estimation, token debit, response streaming, routing

  ### 2. Dependencies & Injection

  * `[✅]`   `deps`
    * `[✅]`   `ILogger` from `_shared/types.ts` — logging
    * `[✅]`   `IUserTokenWalletService` from `tokenwallet/client/userTokenWalletService.interface.ts` — wallet reads (`getWalletByIdAndUser`, `getWalletForContext`)
    * `[✅]`   `GetAiProviderAdapterFn` (type to be defined or located) — factory for creating AI provider adapters
    * `[✅]`   `SupabaseClient<Database>` from `npm:@supabase/supabase-js@2` — DB reads for prompts and providers
    * `[✅]`   `AiModelExtendedConfigSchema` from `./zodSchema.ts` — imported directly, pure validation schema
    * `[✅]`   No reverse dependencies

  * `[✅]`   `context_slice`
    * `[✅]`   `PrepareChatContextDeps` holds injectable services (logger, wallet service, adapter factory, supabase client)
    * `[✅]`   `PrepareChatContextParams` holds per-request context (userId)
    * `[✅]`   `PrepareChatContextPayload` holds the request data being processed (requestBody with providerId, promptId, walletId, organizationId)

  ### 3. Contract Definition

  * `[✅]`   `prepareChatContext.interface.test.ts`
    * `[✅]`   Valid: `PrepareChatContextDeps` has `logger`, `userTokenWalletService` with `getWalletByIdAndUser`/`getWalletForContext`, `getAiProviderAdapter` function, `supabaseClient` with `from`
    * `[✅]`   Valid: `PrepareChatContextParams` has `userId` as string
    * `[✅]`   Valid: `PrepareChatContextPayload` has `requestBody` as `ChatApiRequest` with `message`, `providerId`, `promptId`, `walletId`, `organizationId`
    * `[✅]`   Valid: `PrepareChatContextSuccess` has `wallet`, `aiProviderAdapter`, `modelConfig`, `actualSystemPromptText`, `finalSystemPromptIdForDb`, `apiKey`, `providerApiIdentifier`
    * `[✅]`   Valid: `PrepareChatContextError` has `error` with `message` string and `status` number
    * `[✅]`   Valid: `PrepareChatContextReturn` accepts `PrepareChatContextSuccess` value
    * `[✅]`   Valid: `PrepareChatContextReturn` accepts `PrepareChatContextError` value
    * `[✅]`   Valid: `PrepareChatContext` function type is `(deps, params, payload) => Promise<PrepareChatContextReturn>`

  ### 4. Structural Boundary

  * `[✅]`   `prepareChatContext.interface.ts`
    * `[✅]`   `PrepareChatContextDeps` — `logger: ILogger`, `userTokenWalletService: IUserTokenWalletService`, `getAiProviderAdapter: GetAiProviderAdapterFn`, `supabaseClient: SupabaseClient<Database>`
    * `[✅]`   `PrepareChatContextParams` — `userId: string`
    * `[✅]`   `PrepareChatContextPayload` — `requestBody: ChatApiRequest`
    * `[✅]`   `PrepareChatContextSuccess` — `SuccessfulChatContext` (reuse existing type, kept here or in shared types)
    * `[✅]`   `PrepareChatContextError` — `ErrorChatContext` (reuse existing type)
    * `[✅]`   `PrepareChatContextReturn` — `PrepareChatContextSuccess | PrepareChatContextError`
    * `[✅]`   `PrepareChatContext` — function type `(deps, params, payload) => Promise<PrepareChatContextReturn>`
    * `[✅]`   Remove `PathHandlerContext` — the God object embedding `deps: ChatHandlerDeps` is eliminated
    * `[✅]`   No `any`, no optional fields, no `extends ChatHandlerDeps`

  ### 5. Interaction Semantics

  * `[✅]`   `interaction.spec`
    * `[✅]`   Called by `streamRequest` (sole router) after request parsing and auth
    * `[✅]`   Receives `deps` (logger, userTokenWalletService, getAiProviderAdapter, supabaseClient), `params` (userId), `payload` (requestBody)
    * `[✅]`   Behavior:
      * Resolves system prompt from DB if `promptId` is not `__none__`
      * Fetches provider from DB by `providerId`, validates active and configured
      * Parses model config via `AiModelExtendedConfigSchema`
      * Retrieves API key from environment
      * Creates AI provider adapter via `getAiProviderAdapter`
      * Resolves wallet: if `walletId` → `getWalletByIdAndUser`, else → `getWalletForContext`
      * On success: returns `PrepareChatContextSuccess` with all resolved context
    * `[✅]`   Error modes:
      * Provider not found → `{ error: { message, status: 404 } }`
      * Provider inactive → `{ error: { message, status: 400 } }`
      * Invalid provider config → `{ error: { message, status: 500 } }`
      * Missing API key → `{ error: { message, status: 500 } }`
      * Adapter creation failure → `{ error: { message, status: 400 } }`
      * Wallet not found (by ID) → `{ error: { message, status: 403 } }`
      * Wallet not found (by context) → `{ error: { message, status: 402 } }`
      * Wallet service error → `{ error: { message, status: 500 } }`
      * Unhandled exception → `{ error: { message, status: 500 } }`

  ### 6. Enforcement

  * `[✅]`   `prepareChatContext.guard.test.ts`
    * `[✅]`   `isPrepareChatContextDeps(x)` → true for valid deps with `logger`, `userTokenWalletService`, `getAiProviderAdapter`, `supabaseClient`
    * `[✅]`   `isPrepareChatContextDeps(x)` → false for `null`, `{}`, object missing `userTokenWalletService`, object missing `getAiProviderAdapter`
    * `[✅]`   `isPrepareChatContextSuccess(x)` → true for object with `wallet`, `aiProviderAdapter`, `modelConfig`, `apiKey`, `providerApiIdentifier`
    * `[✅]`   `isPrepareChatContextError(x)` → true for object with `error.message` and `error.status`

  * `[✅]`   `prepareChatContext.guard.ts`
    * `[✅]`   `isPrepareChatContextDeps`: checks all required dep fields present
    * `[✅]`   `isPrepareChatContextSuccess`: checks for `wallet` and `aiProviderAdapter` (discriminates from error)
    * `[✅]`   `isPrepareChatContextError`: checks for `error` with `message` and `status`

  ### 7. Behavioral Verification

  * `[✅`   `prepareChatContext.test.ts` (update existing)
    * `[✅`   Update all tests to use `PrepareChatContextDeps`, `PrepareChatContextParams`, `PrepareChatContextPayload` types
    * `[✅`   Replace all `createMockTokenWalletService` with `createMockUserTokenWalletService` from `tokenwallet/client/userTokenWalletService.mock.ts`
    * `[✅`   Replace `deps.tokenWalletService` with `deps.userTokenWalletService`
    * `[✅`   Test: valid request with walletId → calls `userTokenWalletService.getWalletByIdAndUser`, returns `PrepareChatContextSuccess`
    * `[✅`   Test: valid request without walletId → calls `userTokenWalletService.getWalletForContext`, returns `PrepareChatContextSuccess`
    * `[✅`   Test: provider not found → returns `PrepareChatContextError` with status 404
    * `[✅`   Test: provider inactive → returns `PrepareChatContextError` with status 400
    * `[✅`   Test: invalid model config → returns `PrepareChatContextError` with status 500
    * `[✅`   Test: missing API key → returns `PrepareChatContextError` with status 500
    * `[✅`   Test: wallet not found by ID → returns `PrepareChatContextError` with status 403
    * `[✅`   Test: wallet not found by context → returns `PrepareChatContextError` with status 402
    * `[✅`   Test: wallet service error → returns `PrepareChatContextError` with status 500
    * `[✅`   Test: system prompt lookup with valid promptId → `actualSystemPromptText` populated
    * `[✅`   Test: system prompt `__none__` → `actualSystemPromptText` null
    * `[✅`   Each test covers exactly one behavior

  ### 8. Construction

  * `[✅`   `construction`
    * `[✅`   `prepareChatContext(deps, params, payload)` — all three args required
    * `[✅`   `deps` constructed by caller (`streamRequest` router) from its own deps
    * `[✅`   Invalid: calling with old `(requestBody, userId, deps: PrepareChatContextDeps extends ChatHandlerDeps)` — rejected by type system

  ### 9. Implementation

  * `[✅`   `prepareChatContext.ts`
    * `[✅`   Change signature from `prepareChatContext(requestBody, userId, deps: PrepareChatContextDeps)` to `prepareChatContext(deps: PrepareChatContextDeps, params: PrepareChatContextParams, payload: PrepareChatContextPayload): Promise<PrepareChatContextReturn>`
    * `[✅`   Remove `import { ChatHandlerDeps }` — no longer extends it
    * `[✅`   Replace `PrepareChatContextDeps extends ChatHandlerDeps` with standalone narrow interface from `prepareChatContext.interface.ts`
    * `[✅`   Replace `tokenWalletService` destructuring with `userTokenWalletService`
    * `[✅`   Replace `tokenWalletService!.getWalletByIdAndUser` with `userTokenWalletService.getWalletByIdAndUser` (no `!` — field is required, not optional)
    * `[✅`   Replace `tokenWalletService!.getWalletForContext` with `userTokenWalletService.getWalletForContext`
    * `[✅`   Remove `PathHandlerContext` interface definition — God object eliminated
    * `[✅`   Keep `SuccessfulChatContext` and `ErrorChatContext` — move to interface file or keep as return type components
    * `[✅`   Destructure `params` → `{ userId }`, `payload` → `{ requestBody }`
    * `[✅`   All existing logic preserved, only structural refactor of arguments, deps, and return type

  ### 10. Simulation

  * `[✅`   `prepareChatContext.mock.ts`
    * `[✅`   `createMockPrepareChatContext(): MockPrepareChatContext` — stub returning mock `PrepareChatContextSuccess`
    * `[✅`   `buildContractPrepareChatContextDeps(): PrepareChatContextDeps` — valid deps for contract tests with mock `IUserTokenWalletService`
    * `[✅`   `buildContractPrepareChatContextParams(): PrepareChatContextParams` — valid params for contract tests
    * `[✅`   Conforms to `PrepareChatContext` function type from interface

  ### 11. External Boundary

  * `[✅`   `prepareChatContext.provides.ts`
    * `[✅`   Re-exports: `prepareChatContext`, `PrepareChatContextDeps`, `PrepareChatContextParams`, `PrepareChatContextPayload`, `PrepareChatContextReturn`, `PrepareChatContextSuccess`, `PrepareChatContextError`, `PrepareChatContext`, `SuccessfulChatContext`, `ErrorChatContext`, `isPrepareChatContextDeps`, `isPrepareChatContextSuccess`, `isPrepareChatContextError`, `createMockPrepareChatContext`, `buildContractPrepareChatContextDeps`, `buildContractPrepareChatContextParams`

  ### 12. Edge Validation

  * `[✅`   `prepareChatContext.integration.test.ts`
    * `[✅`   Validate: `prepareChatContext` (subject) with mocked `supabaseClient` and mock `IUserTokenWalletService` → correct `SuccessfulChatContext` or `ErrorChatContext` returned
    * `[✅`   Validate: `streamRequest` (consumer) can construct `PrepareChatContextDeps` from its own deps and invoke `prepareChatContext` with correct params/payload
    * `[✅`   Uses mocks only for external nodes (Supabase client, wallet service, adapter factory)

  ### 13. Directionality

  * `[✅`   Node layer: domain/service (inner)
  * `[✅`   Deps inward-facing: `ILogger`, `IUserTokenWalletService`, `SupabaseClient`, `GetAiProviderAdapterFn` — infrastructure/adapter layer
  * `[✅`   Provides outward-facing: consumed by `streamRequest` router
  * `[✅`   No cycles

  ### 14. Completion Criteria

  * `[✅`   All interface, guard, test, mock, provides files created and lint clean
  * `[✅`   `prepareChatContext.ts` uses new `(deps, params, payload)` signature, no reference to `ChatHandlerDeps`, no `extends ChatHandlerDeps`
  * `[✅`   `tokenWalletService` replaced with `userTokenWalletService: IUserTokenWalletService` — no `!` assertion, field is required
  * `[✅`   `PathHandlerContext` removed — no God object embedding `deps: ChatHandlerDeps`
  * `[✅`   Return type is `PrepareChatContextSuccess | PrepareChatContextError`
  * `[✅`   All tests GREEN — `createMockTokenWalletService` replaced with `createMockUserTokenWalletService`
  * `[✅`   Integration test GREEN

---

* `[✅]`   `supabase/functions/chat/streamChat/streamChat.ts` **[BE] Decompose handleStreamingNormalPath into spec-compliant function with proper DI, typed interface, and AdminTokenWalletService dependency**

  ### 1. Intent & Position

  * `[✅]`   `objective`
    * `[✅]`   `streamChat` has identical structural problems to `handleNormalPath`: takes `PathHandlerContext` God object, destructures `tokenWalletService` from `deps` at line 30 (field no longer exists on `ChatHandlerDeps`), passes it to `debitTokens` at line 250
    * `[✅]`   Imports `debitTokens` directly (line 12) instead of receiving via DI
    * `[✅]`   Create `streamChat.interface.ts` defining `StreamChatDeps`, `StreamChatParams`, `StreamChatPayload`, `StreamChatReturn`
    * `[✅]`   Refactor function signature to `StreamChat(deps: StreamChatDeps, params: StreamChatParams, payload: StreamChatPayload): Promise<StreamChatReturn>`
    * `[✅]`   `StreamChatDeps` contains: `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `countTokens`, `debitTokens`, `createErrorResponse`, `findOrCreateChat`, `constructMessageHistory`, `getMaxOutputTokens`
    * `[✅]`   `StreamChatParams` contains: `supabaseClient`, `userId`, `requestBody`, `wallet`, `aiProviderAdapter`, `modelConfig`, `actualSystemPromptText`, `finalSystemPromptIdForDb`, `apiKey`, `providerApiIdentifier`
    * `[✅]`   `StreamChatPayload` contains: `requestBody: ChatApiRequest`, `req: Request` — `req` forwarded for `createErrorResponse` CORS
    * `[✅]`   `StreamChatReturn` is `Response`

  * `[✅]`   `role`
    * `[✅]`   Application/handler — processes SSE streaming chat requests for the normal (non-rewind, non-dialectic) path
    * `[✅]`   Coordinates chat creation, message history, AI adapter invocation, token debit, and SSE stream construction
    * `[✅]`   Must NOT perform user-scoped wallet reads
    * `[✅]`   Must NOT import `debitTokens` directly — must receive via DI

  * `[✅]`   `module`
    * `[✅]`   Bounded context: streaming normal chat message processing
    * `[✅]`   Inside: SSE stream creation, chunked response delivery, chat creation, message history, AI adapter call, token debit, message persistence
    * `[✅]`   Outside: wallet lookups, balance checks, provider resolution, rewind logic, dialectic logic, non-streaming responses

  ### 2. Dependencies & Injection

  * `[✅]`   `deps`
    * `[✅]`   `ILogger` from `_shared/types.ts`
    * `[✅]`   `IAdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.interface.ts` — token debit via `debitTokens`
    * `[✅]`   `debitTokens` from `_shared/utils/debitTokens.ts` (via DI)
    * `[✅]`   `countTokens` typed from `_shared/types/tokenizer.types.ts`
    * `[✅]`   `createErrorResponse` from `_shared/cors-headers.ts` (via DI) — used for pre-stream error responses
    * `[✅]`   `findOrCreateChat` from `./findOrCreateChat.ts` (via DI)
    * `[✅]`   `constructMessageHistory` from `./constructMessageHistory.ts` (via DI)
    * `[✅]`   `getMaxOutputTokens` from `_shared/utils/affordability_utils.ts` (via DI)
    * `[✅]`   `SupabaseClient<Database>` — in params
    * `[✅]`   `AiProviderAdapterInstance` — in params
    * `[✅]`   No reverse dependencies

  * `[✅]`   `context_slice`
    * `[✅]`   `StreamChatDeps` is the minimal interface
    * `[✅]`   No reference to `ChatHandlerDeps`

  ### 3. Contract Definition

  * `[✅]`   `StreamChat.interface.test.ts`
    * `[✅]`   Valid: happy path → returns `Response` with SSE content type and `chat_start`, `content_chunk`, `chat_complete` events
    * `[✅]`   Valid: AI adapter failure → returns SSE stream with `error` event
    * `[✅]`   Valid: insufficient balance → returns error `Response` with 402
    * `[✅]`   Valid: token counting exceeds provider max → returns error `Response` with 413
    * `[✅]`   Valid: modelConfig is null → returns error `Response` with 500
    * `[✅]`   Invalid: deps missing `adminTokenWalletService` → rejected by type system
    * `[✅]`   Edge: history fetch error with existing chatId → creates new chat, proceeds with stream

  ### 4. Structural Boundary

  * `[✅]`   `StreamChat.interface.ts`
    * `[✅]`   `StreamChatDeps` — `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `countTokens: CountTokensFn`, `debitTokens: DebitTokens`, `createErrorResponse: CreateErrorResponse`, `findOrCreateChat: FindOrCreateChat`, `constructMessageHistory: ConstructMessageHistory`, `getMaxOutputTokens: GetMaxOutputTokens`
    * `[✅]`   `StreamChatParams` — `supabaseClient: SupabaseClient<Database>`, `userId: string`, `wallet: TokenWallet`, `aiProviderAdapter: AiProviderAdapterInstance`, `modelConfig: AiModelExtendedConfig`, `actualSystemPromptText: string | null`, `finalSystemPromptIdForDb: string | null`, `apiKey: string`, `providerApiIdentifier: string`
    * `[✅]`   `StreamChatPayload` — `{ requestBody: ChatApiRequest, req: Request }` — `req` forwarded from `streamRequest` for `createErrorResponse` CORS
    * `[✅]`   `StreamChatReturn` — `StreamChatSuccess = Response | StreamChatError = Error`
    * `[✅]`   No `any`, no optional fields that should be required

  ### 5. Interaction Semantics

  * `[✅]`   `interaction.spec`
    * `[✅]`   Called by `handleStreamChatRequest` when request is not dialectic and not rewind
    * `[✅]`   Calls `findOrCreateChat` → `constructMessageHistory` → `countTokens` → `getMaxOutputTokens` → `aiProviderAdapter.sendMessage` → `debitTokens`
    * `[✅]`   `debitTokens` receives `{ logger, tokenWalletService: adminTokenWalletService }` as its deps
    * `[✅]`   Constructs `ReadableStream` with SSE events: `chat_start`, `content_chunk` (chunked), `chat_complete`
    * `[✅]`   On error inside stream: sends SSE `error` event, closes stream
    * `[✅]`   On pre-stream error (balance, token count): returns error `Response` via `createErrorResponse`

  ### 6. Enforcement

  * `[✅]`   `StreamChat.guard.test.ts`
    * `[✅]`   `isStreamChatDeps(x)` → true for valid, false for `null`, `{}`, object missing `adminTokenWalletService`

  * `[✅]`   `StreamChat.guard.ts`
    * `[✅]`   `isStreamChatDeps`: checks all required dep fields are present and correctly typed

  ### 7. Behavioral Verification

  * `[✅]`   `StreamChat.test.ts` (create — no existing test file)
    * `[✅]`   Construct `StreamChatDeps`, `StreamChatParams`, `StreamChatPayload` with proper types
    * `[✅]`   Use `createMockAdminTokenWalletService` from admin provides
    * `[✅]`   Test cases: happy path SSE stream, adapter failure, insufficient balance, token limit exceeded
    * `[✅]`   Each test covers exactly one behavior
    * `[✅]`   Uses real application types

  ### 8. Construction

  * `[✅]`   `construction`
    * `[✅]`   `StreamChat(deps, params, payload)` — all three args required
    * `[✅]`   `deps` constructed at call site in `handleStreamChatRequest`
    * `[✅]`   Invalid: calling with old `PathHandlerContext` — rejected by type system
`
  ### 9. Implementation

  * `[✅]`   `StreamChat.ts`
    * `[✅]`   Change signature from `StreamChat(context: PathHandlerContext)` to `StreamChat(deps: StreamChatDeps, params: StreamChatParams, payload: StreamChatPayload): Promise<StreamChatReturn>`
    * `[✅]`   Remove direct imports of `debitTokens`, `findOrCreateChat`, `constructMessageHistory`, `getMaxOutputTokens` — receive via `deps`
    * `[✅]`   Destructure `adminTokenWalletService` from `deps` (not `tokenWalletService`)
    * `[✅]`   Pass `{ logger, tokenWalletService: adminTokenWalletService }` to `deps.debitTokens`
    * `[✅]`   Replace all `new Request("")` with `payload.req` in `createErrorResponse` calls
    * `[✅]`   All streaming/SSE logic remains unchanged

  ### 10. Simulation

  * `[✅]`   `StreamChat.mock.ts`
    * `[✅]`   `createMockStreamChat(): MockStreamChat` — stub returning a mock SSE `Response`
    * `[✅]`   Conforms to function signature from interface
    * `[✅]`   Controllable: can set success or error responses

  ### 11. External Boundary

  * `[✅]`   `StreamChat.provides.ts`
    * `[✅]`   Re-exports: `StreamChat`, `StreamChatDeps`, `StreamChatParams`, `StreamChatPayload`, `StreamChatReturn`, `isStreamChatDeps`, `createMockStreamChat`

  ### 12. Edge Validation

  * `[✅]`   `StreamChat.integration.test.ts`
    * `[✅]`   Validate: `debitTokens` (producer) → `StreamChat` (subject) — real `debitTokens` with mocked `IAdminTokenWalletService`, verify `recordTransaction` called
    * `[✅]`   Validate: `StreamChat` (subject) → `handleStreamChatRequest` (consumer) — verify consumer can construct deps and invoke
    * `[✅]`   Uses mocks only for external nodes (Supabase, AI adapter)

  ### 13. Directionality

  * `[✅]`   Node layer: application/handler
  * `[✅]`   Deps inward-facing: `IAdminTokenWalletService`, `debitTokens`, `findOrCreateChat`, `constructMessageHistory` — infrastructure/service layer
  * `[✅]`   Provides outward-facing: consumed by `handleStreamChatRequest`
  * `[✅]`   No cycles

  ### 14. Completion Criteria

  * `[✅]`   All interface, guard, test, mock, provides files created and lint clean
  * `[✅]`   `StreamChat.ts` uses new signature, no reference to `tokenWalletService` or `PathHandlerContext`, no direct imports of injected deps
  * `[✅]`   All tests GREEN
  * `[✅]`   Integration test GREEN
  * `[✅]`   No reference to old `tokenWalletService` field remains

---

* `[✅]`   `supabase/functions/chat/streamRewind/streamRewind.ts` **[BE] Port handleRewindPath to streaming, decompose into spec-compliant function with proper DI, typed interface, and AdminTokenWalletService dependency**

  ### 1. Intent & Position

  * `[✅]`   `objective`
    * `[✅]`   `handleRewindPath` takes `PathHandlerContext` God object, destructures `logger` and `countTokens` from `deps: ChatHandlerDeps` at line 32
    * `[✅]`   Source is partially migrated: line 241 already uses `deps.adminTokenWalletService` to pass to `debitTokens`, but `deps` is still typed as `ChatHandlerDeps` (the entire top-level bag)
    * `[✅]`   Imports `debitTokens` directly (line 11) and `getMaxOutputTokens` directly (line 12) instead of receiving via DI
    * `[✅]`   Tests (`handleRewindPath.test.ts`) import old `createMockTokenWalletService` from `tokenWalletService.mock.ts` and assign to `deps.tokenWalletService` — field no longer exists on `ChatHandlerDeps`
    * `[✅]`   **Currently returns `ChatHandlerSuccessResponse` (non-streaming)** — must be ported to return `Response` (SSE streaming) to conform with the rest of the application. `handlePostRequest` is being deleted; rewind is now dispatched by `StreamRequest`
    * `[✅]`   Port response format to SSE streaming following the same pattern as `handleStreamingNormalPath`: send `chat_start`, `content_chunk`, `chat_complete` events via `ReadableStream`, return `Response` with `Content-Type: text/event-stream`
    * `[✅]`   Create `StreamRewind.interface.ts` defining `StreamRewindDeps`, `StreamRewindParams`, `StreamRewindPayload`, `StreamRewindReturn`
    * `[✅]`   Refactor function signature to `StreamRewind(deps: StreamRewindDeps, params: StreamRewindParams, payload: StreamRewindPayload): Promise<StreamRewindReturn>`
    * `[✅]`   `StreamRewindDeps` contains: `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `countTokens`, `debitTokens`, `getMaxOutputTokens`, `createErrorResponse`
    * `[✅]`   `StreamRewindParams` contains: `supabaseClient`, `userId`, `wallet`, `aiProviderAdapter`, `modelConfig`, `actualSystemPromptText`, `finalSystemPromptIdForDb`
    * `[✅]`   `StreamRewindPayload` contains: `requestBody: ChatApiRequest`, `req: Request` — `req` forwarded for `createErrorResponse` CORS
    * `[✅]`   `StreamRewindReturn` is `StreamRewindReturn = StreamRewindSuccessResponse | StreamRewindErrorResponse` (SSE stream — same as `streaming`)

  * `[✅]`   `role`
    * `[✅]`   Application/handler — processes chat rewind requests via SSE streaming
    * `[✅]`   Coordinates rewind point lookup, message history reconstruction, AI adapter invocation, token debit, message persistence via `perform_chat_rewind` RPC, and SSE stream delivery
    * `[✅]`   Must NOT perform user-scoped wallet reads
    * `[✅]`   Must NOT import injected deps directly
    * `[✅]`   Must return SSE `Response` — not `ChatHandlerSuccessResponse`

  * `[✅]`   `module`
    * `[✅]`   Bounded context: chat rewind processing with streaming response
    * `[✅]`   Inside: rewind point lookup, message history reconstruction, AI adapter call, token debit, `perform_chat_rewind` RPC, SSE stream construction
    * `[✅]`   Outside: wallet lookups, balance checks, provider resolution, normal path logic

  ### 2. Dependencies & Injection

  * `[✅]`   `deps`
    * `[✅]`   `ILogger` from `_shared/types.ts`
    * `[✅]`   `IAdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.interface.ts` — token debit via `debitTokens`
    * `[✅]`   `debitTokens` from `_shared/utils/debitTokens.ts` (via DI)
    * `[✅]`   `countTokens` from `_shared/types/tokenizer.types.ts` (via DI)
    * `[✅]`   `getMaxOutputTokens` from `_shared/utils/affordability_utils.ts` (via DI)
    * `[✅]`   `createErrorResponse` from `_shared/cors-headers.ts` (via DI) — for pre-stream errors
    * `[✅]`   `SupabaseClient<Database>` — in params (varies per request)
    * `[✅]`   `AiProviderAdapterInstance` — in params
    * `[✅]`   No reverse dependencies

  * `[✅]`   `context_slice`
    * `[✅]`   `StreamRewindDeps` is the minimal interface — only capabilities this function calls
    * `[✅]`   No over-fetching of `ChatHandlerDeps`

  ### 3. Contract Definition

  * `[✅]`   `StreamRewind.interface.test.ts`
    * `[✅]`   Valid: happy path with rewind → returns SSE `Response` with `chat_start`, `content_chunk`, `chat_complete` events containing `userMessage`, `assistantMessage`, `chatId`
    * `[✅]`   Valid: no `chatId` provided → returns error `Response` with 400
    * `[✅]`   Valid: rewind point not found → returns error `Response`
    * `[✅]`   Valid: AI adapter failure → returns SSE stream with `error` event
    * `[✅]`   Valid: insufficient balance → returns error `Response` with 402
    * `[✅]`   Valid: debitTokens returns error → sends SSE `error` event
    * `[✅]`   Invalid: deps missing `adminTokenWalletService` → rejected by type system
    * `[✅]`   Edge: `perform_chat_rewind` RPC failure → sends SSE `error` event

  ### 4. Structural Boundary

  * `[✅]`   `StreamRewind.interface.ts`
    * `[✅]`   `StreamRewindDeps` — `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `countTokens: CountTokensFn`, `debitTokens: DebitTokens`, `getMaxOutputTokens: GetMaxOutputTokens`, `createErrorResponse: CreateErrorResponse`
    * `[✅]`   `StreamRewindParams` — `supabaseClient: SupabaseClient<Database>`, `userId: string`, `wallet: TokenWallet`, `aiProviderAdapter: AiProviderAdapterInstance`, `modelConfig: AiModelExtendedConfig`, `actualSystemPromptText: string | null`, `finalSystemPromptIdForDb: string | null`
    * `[✅]`   `StreamRewindPayload` — `{ requestBody: ChatApiRequest, req: Request }` — `req` forwarded for `createErrorResponse` CORS
    * `[✅]`   `StreamRewindReturn` — `StreamRewindReturn = StreamRewindSuccessResponse: Response | StreamRewindErrorResponse: Error` (SSE stream)
    * `[✅]`   No `any`, no optional fields that should be required

  ### 5. Interaction Semantics

  * `[✅]`   `interaction.spec`
    * `[✅]`   Called by `StreamRequest` when `rewindFromMessageId` is present
    * `[✅]`   Calls: rewind point lookup (Supabase query) → message history reconstruction → `countTokens` → `getMaxOutputTokens` → `aiProviderAdapter.sendMessage` → `debitTokens` (which calls `adminTokenWalletService.recordTransaction`)
    * `[✅]`   `debitTokens` receives `{ logger, tokenWalletService: adminTokenWalletService }` as its deps
    * `[✅]`   Inside `debitTokens` databaseOperation callback: calls `perform_chat_rewind` RPC to atomically deactivate old messages and insert new ones
    * `[✅]`   SSE streaming: wraps the response in a `ReadableStream` sending `chat_start` → `content_chunk` (chunked) → `chat_complete` events, matching `handleStreamingNormalPath` pattern
    * `[✅]`   On pre-stream error (missing chatId, insufficient balance, token limit): returns error `Response` via `createErrorResponse`
    * `[✅]`   On in-stream error (adapter failure, debit failure, RPC failure): sends SSE `error` event, closes stream
    * `[✅]`   On debit failure with "Insufficient funds": sends SSE `error` event with 402 semantics

  ### 6. Enforcement

  * `[✅]`   `StreamRewind.guard.test.ts`
    * `[✅]`   `isStreamRewindDeps(x)` → true for valid, false for `null`, `{}`, object missing `adminTokenWalletService`

  * `[✅]`   `StreamRewind.guard.ts`
    * `[✅]`   `isStreamRewindDeps`: checks all required dep fields present and correctly typed

  ### 7. Behavioral Verification

  * `[✅]`   `StreamRewind.test.ts` (update existing)
    * `[✅]`   Update all tests to construct `StreamRewindDeps` and `StreamRewindParams` instead of `PathHandlerContext` with embedded `ChatHandlerDeps`
    * `[✅]`   Replace `createMockTokenWalletService` imports with `createMockAdminTokenWalletService` from admin provides
    * `[✅]`   Replace `deps.tokenWalletService` assignments with `deps.adminTokenWalletService`
    * `[✅]`   Ensure `debitTokens` is injected via deps
    * `[✅]`   **Update all assertions to expect SSE `Response`** instead of `ChatHandlerSuccessResponse` — parse SSE events from response body to verify `chat_start`, `content_chunk`, `chat_complete` event payloads
    * `[✅]`   Existing test behaviors preserved but assertion format changes: happy path rewind, token debit verification (DEBIT_USAGE + CREDIT_ADJUSTMENT calls), missing chatId, AI adapter failure, insufficient balance, RPC failure
    * `[✅]`   Each test covers exactly one behavior
    * `[✅]`   Uses real application types

  ### 8. Construction

  * `[✅]`   `construction`
    * `[✅]`   `StreamRewind(deps, params, payload)` — all three args required
    * `[✅]`   `deps` constructed at call site in `StreamRequest` (not `handlePostRequest` — deleted)
    * `[✅]`   Invalid: calling with old `PathHandlerContext` — rejected by type system

  ### 9. Implementation

  * `[✅]`   `StreamRewind.ts`
    * `[✅]`   Change signature from `StreamRewind(context: PathHandlerContext)` to `StreamRewind(deps: StreamRewindDeps, params: StreamRewindParams, payload: StreamRewindPayload): Promise<StreamRewindReturn>`
    * `[✅]`   Change return type from `ChatHandlerSuccessResponse | { error }` to `Response` (SSE stream)
    * `[✅]`   Remove direct imports of `debitTokens`, `getMaxOutputTokens` — receive via `deps`
    * `[✅]`   Destructure `adminTokenWalletService` from `deps`
    * `[✅]`   Pass `{ logger, tokenWalletService: adminTokenWalletService }` to `deps.debitTokens`
    * `[✅]`   Wrap response in SSE `ReadableStream` following `handleStreamingNormalPath` pattern:
      * Send `chat_start` event with `chatId` and `timestamp`
      * Send `content_chunk` events with chunked assistant content
      * Send `chat_complete` event with final `assistantMessage`, `finish_reason`
      * On error: send `error` event, close stream
    * `[✅]`   Replace all `new Request("")` with `payload.req` in `createErrorResponse` calls
    * `[✅]`   Pre-stream validation errors (missing chatId, modelConfig null) return error `Response` via `createErrorResponse` before stream starts
    * `[✅]`   All rewind logic (RPC call, message history, debit) remains unchanged — only the response wrapper changes

  ### 10. Simulation

  * `[✅]`   `StreamRewind.mock.ts`
    * `[✅]`   `createMockStreamRewind(): MockStreamRewind` — stub using `spy()` returning mock SSE `Response`
    * `[✅]`   Conforms to function signature from interface
    * `[✅]`   Controllable: can set success or error responses for testing consumers (`StreamRequest`)

  ### 11. External Boundary

  * `[✅]`   `StreamRewind.provides.ts`
    * `[✅]`   Re-exports: `StreamRewind`, `StreamRewindDeps`, `StreamRewindParams`, `StreamRewindPayload`, `StreamRewindReturn`, `isStreamRewindDeps`, `createMockStreamRewind`

  ### 12. Edge Validation

  * `[✅]`   `StreamRewind.integration.test.ts`
    * `[✅]`   Validate: `debitTokens` (producer) → `StreamRewind` (subject) — real `debitTokens` with mocked `IAdminTokenWalletService`, verify `recordTransaction` called with correct params
    * `[✅]`   Validate: `StreamRewind` (subject) → `StreamRequest` (consumer) — verify consumer can construct `StreamRewindDeps` and invoke
    * `[✅]`   Validate: SSE response contains correct event sequence (`chat_start` → `content_chunk` → `chat_complete`)
    * `[✅]`   Uses mocks only for external nodes (Supabase, AI adapter)

  ### 13. Directionality

  * `[✅]`   Node layer: application/handler
  * `[✅]`   Deps inward-facing: `IAdminTokenWalletService`, `debitTokens`, `getMaxOutputTokens` — infrastructure/service layer
  * `[✅]`   Provides outward-facing: consumed by `StreamRequest` (sole router)
  * `[✅]`   No cycles

  ### 14. Completion Criteria

  * `[✅]`   All interface, guard, test, mock, provides files created and lint clean
  * `[✅]`   `StreamRewind.ts` returns SSE `Response`, uses new signature, no reference to `tokenWalletService` or `PathHandlerContext`, no direct imports of injected deps
  * `[✅]`   All existing test behaviors preserved with updated SSE response assertions
  * `[✅]`   Integration test GREEN — verifies SSE event sequence
  * `[✅]`   No reference to old `tokenWalletService` field remains in this file or its tests

---

* `[✅] `   `supabase/functions/chat/handleDialecticPath.ts` **[DELETE] Remove dead dialectic path — dialectic processing uses separate dialectic-worker/dialectic-service edge functions**

  ### Justification
  * `[✅] `   No frontend code, API client, or store ever sends `isDialectic: true` to the `/chat` endpoint
  * `[✅] `   Dialectic processing is handled entirely by `dialectic-worker` and `dialectic-service` edge functions, which have their own `executeModelCallAndSave` — they do NOT import `handleDialecticPath`
  * `[✅] `   `handleDialecticPath` is only reachable via `handlePostRequest` when `isDialectic === true` — a condition no caller ever sets
  * `[✅] `   The code references `deps.adminTokenWalletService` and old `deps.tokenWalletService` in tests — maintaining this dead code compounds the migration burden

  ### Deletion Steps
  * `[✅] `   Delete `supabase/functions/chat/handleDialecticPath.ts`
  * `[✅] `   Delete `supabase/functions/chat/handleDialecticPath.test.ts`
  * `[✅] `   Remove `handleDialecticPath` import and reference from `supabase/functions/chat/index.ts` (`defaultDeps.handleDialecticPath`)
  * `[✅] `   Remove `handleDialecticPath` import and reference from `supabase/functions/chat/handlePostRequest.ts` (this file is also being deleted — see below)
  * `[✅] `   Remove `handleDialecticPath` from `ChatHandlerDeps` in `_shared/types.ts`
  * `[✅] `   Remove `isDialectic` routing branch from `handleStreamingRequest.ts` (returns 400 — dead branch)
  * `[✅] `   Grep entire codebase for remaining references; remove any dead imports

  ### Completion Criteria
  * `[✅] `   No file named `handleDialecticPath*` exists in `chat/`
  * `[✅] `   No import of `handleDialecticPath` exists anywhere in the codebase
  * `[✅] `   All remaining tests GREEN

---

* `[✅] `   `supabase/functions/chat/handlePostRequest.ts` **[DELETE] Remove dead non-streaming router — all requests now route through handleStreamingRequest**

  ### Justification
  * `[✅] `   `isStreamingEnabled` is hardcoded `true` in `ChatInput.tsx`; all normal messages use `handleStreamingRequest`
  * `[✅] `   Rewind currently uses `handlePostRequest` → `handleRewindPath`, but rewind is being ported to streaming (see `handleRewindPath` node below)
  * `[✅] `   `handlePostRequest` dispatched to `handleNormalPath` (dead) and `handleDialecticPath` (dead) — the only remaining live path (rewind) is moving to the streaming router
  * `[✅]`   After rewind is ported to streaming, `handlePostRequest` has zero callers

  ### Deletion Steps
  * `[✅] `   Delete `supabase/functions/chat/handlePostRequest.ts`
  * `[✅] `   Delete `supabase/functions/chat/handlePostRequest.test.ts`
  * `[✅] `   Remove `handlePostRequest` import and reference from `supabase/functions/chat/index.ts` (`defaultDeps.handlePostRequest`)
  * `[✅] `   Remove `handlePostRequest` from `ChatHandlerDeps` in `_shared/types.ts`
  * `[✅] `   Remove the non-streaming POST branch from `index.ts` handler (lines 124-138) — all POSTs go through `handleStreamingRequest`
  * `[✅] `   Grep entire codebase for remaining references; remove any dead imports

  ### Completion Criteria
  * `[✅] `   No file named `handlePostRequest*` exists in `chat/`
  * `[✅] `   No import of `handlePostRequest` exists anywhere in the codebase
  * `[✅] `   All remaining tests GREEN

---

* `[✅]`   `supabase/functions/chat/streamRequest/streamRequest.ts` **[BE] Decompose handleStreamingRequest into spec-compliant sole router with proper DI, typed interface, dispatching to streamChat and streamRewind**

  ### 1. Intent & Position

  * `[✅`   `objective`
    * `[✅`   `streamRequest` will be the **sole router** for all chat POST requests — `handlePostRequest` is deleted, the non-streaming branch in `index.ts` is removed
    * `[✅`   Currently takes four positional args `(requestBody, supabaseClient, userId, deps: ChatHandlerDeps)` — no typed deps/params/payload/return interfaces
    * `[✅`   Builds a `PathHandlerContext` God object and passes it to the old `handleStreamingNormalPath`
    * `[✅`   Currently returns 400 for dialectic and rewind — dialectic branch removed (dead code), rewind branch dispatches to `streamRewind`
    * `[✅`   Create `streamRequest.interface.ts` defining `StreamRequestDeps`, `StreamRequestParams`, `StreamRequestPayload`, `StreamRequestReturn`
    * `[✅`   Refactor function signature to `streamRequest(deps: StreamRequestDeps, params: StreamRequestParams, payload: StreamRequestPayload): Promise<StreamRequestReturn>`
    * `[✅`   `StreamRequestDeps` contains: `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `prepareChatContext: PrepareChatContext`, `streamChat: StreamChat`, `streamRewind: StreamRewind`, `createErrorResponse: CreateErrorResponse`, `countTokens: CountTokensFn`, `debitTokens: DebitTokens`, `getMaxOutputTokens: GetMaxOutputTokens`, `findOrCreateChat: FindOrCreateChat`, `constructMessageHistory: ConstructMessageHistory`
    * `[✅`   `StreamRequestParams` contains: `supabaseClient: SupabaseClient<Database>`, `userId: string`, `userTokenWalletService: IUserTokenWalletService`
    * `[✅`   `StreamRequestPayload` contains: `req: Request` — `streamRequest` owns parsing `req.json()` to extract `requestBody: ChatApiRequest`
    * `[✅`   `StreamRequestReturn` = `StreamRequestSuccess | StreamRequestError`
    * `[✅`   `StreamRequestSuccess` = `Response` (SSE stream or error Response)
    * `[✅`   `StreamRequestError` = `Error`

  * `[✅`   `role`
    * `[✅`   Application/router — sole router for all chat POST requests
    * `[✅`   Dispatches to `streamChat` (normal messages) or `streamRewind` (rewind, streaming)
    * `[✅`   `isDialectic` branch removed entirely — no dialectic dispatch
    * `[✅`   Must NOT perform token wallet operations directly

  * `[✅`   `module`
    * `[✅`   Bounded context: POST request routing for chat (all requests, streaming only)
    * `[✅`   Inside: context preparation via `prepareChatContext`, path handler dispatch (`streamChat` + `streamRewind`)
    * `[✅`   Outside: auth, CORS, DELETE handling, dialectic processing (request JSON parsing is INSIDE — `streamRequest` owns `req.json()`)

  ### 2. Dependencies & Injection

  * `[✅`   `deps`
    * `[✅`   `ILogger` from `_shared/types.ts`
    * `[✅`   `IAdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.interface.ts` — passed through to path handler deps
    * `[✅`   `prepareChatContext` from `./prepareChatContext/prepareChatContext.provides.ts` (via DI) — typed as `PrepareChatContext`
    * `[✅`   `streamChat` from `./streamChat/streamChat.provides.ts` (via DI) — typed as `StreamChat`
    * `[✅`   `streamRewind` from `./streamRewind/streamRewind.provides.ts` (via DI) — typed as `StreamRewind`
    * `[✅`   `createErrorResponse` from `_shared/cors-headers.ts` (via DI)
    * `[✅`   `countTokens`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory` — passed through to path handler deps
    * `[✅`   No reverse dependencies

  * `[✅`   `context_slice`
    * `[✅`   `StreamRequestDeps` holds injectable services and path handler functions for dispatch + deps construction
    * `[✅`   `StreamRequestParams` holds per-request context including `userTokenWalletService` for `prepareChatContext`
    * `[✅`   `StreamRequestPayload` holds the raw HTTP request (`req: Request`) — `streamRequest` parses it to extract domain data

  ### 3. Contract Definition

  * `[✅`   `streamRequest.interface.test.ts`
    * `[✅`   Valid: `StreamRequestDeps` has `logger`, `adminTokenWalletService`, `prepareChatContext`, `streamChat`, `streamRewind`, `createErrorResponse`, `countTokens`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory` — all present with correct callable shapes
    * `[✅`   Valid: `StreamRequestParams` has `supabaseClient` with `from` function, `userId` as string, `userTokenWalletService` with `getWalletByIdAndUser`/`getWalletForContext`
    * `[✅`   Valid: `StreamRequestPayload` has `req` as `Request` with `method`, `headers`, `json` function
    * `[✅`   Valid: `StreamRequestPayload` with `req` whose JSON body contains `rewindFromMessageId` — rewind request
    * `[✅`   Valid: `StreamRequestPayload` with `req` whose JSON body has no `rewindFromMessageId` — normal request
    * `[✅`   Valid: `StreamRequestSuccess` is a `Response` with `text/event-stream` content type
    * `[✅`   Valid: `StreamRequestSuccess` is an error `Response` with status 402/413/500
    * `[✅`   Valid: `StreamRequestError` is an `Error` with message
    * `[✅`   Valid: `StreamRequestReturn` accepts `StreamRequestSuccess` value
    * `[✅`   Valid: `StreamRequestReturn` accepts `StreamRequestError` value
    * `[✅`   Valid: `StreamRequest` function type is `(deps, params, payload) => Promise<StreamRequestReturn>`

  ### 4. Structural Boundary

  * `[✅`   `streamRequest.interface.ts`
    * `[✅`   `StreamRequestDeps` — `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `prepareChatContext: PrepareChatContext`, `streamChat: StreamChat`, `streamRewind: StreamRewind`, `createErrorResponse: CreateErrorResponse`, `countTokens: CountTokensFn`, `debitTokens: DebitTokens`, `getMaxOutputTokens: GetMaxOutputTokens`, `findOrCreateChat: FindOrCreateChat`, `constructMessageHistory: ConstructMessageHistory`
    * `[✅`   `StreamRequestParams` — `supabaseClient: SupabaseClient<Database>`, `userId: string`, `userTokenWalletService: IUserTokenWalletService`
    * `[✅`   `StreamRequestPayload` — `req: Request`
    * `[✅`   `StreamRequestSuccess` — `Response`
    * `[✅`   `StreamRequestError` — `Error`
    * `[✅`   `StreamRequestReturn` — `StreamRequestSuccess | StreamRequestError`
    * `[✅`   `StreamRequest` — function type `(deps: StreamRequestDeps, params: StreamRequestParams, payload: StreamRequestPayload) => Promise<StreamRequestReturn>`
    * `[✅`   No `any`, no optional fields

  ### 5. Interaction Semantics

  * `[✅`   `interaction.spec`
    * `[✅`   Called by `handler` in `index.ts` for ALL POST requests (sole router)
    * `[✅`   Parses `payload.req.json()` to get `requestBody: ChatApiRequest`
    * `[✅`   Calls `deps.prepareChatContext(prepareDeps, prepareParams, { requestBody })` to resolve context
    * `[✅`   On context success: checks `requestBody.rewindFromMessageId`
      * If rewind: constructs `StreamRewindDeps` from its own deps, constructs `StreamRewindParams` from context success, invokes `deps.streamRewind(rewindDeps, rewindParams, { requestBody, req: payload.req })`
      * Otherwise: constructs `StreamChatDeps` from its own deps, constructs `StreamChatParams` from context success, invokes `deps.streamChat(chatDeps, chatParams, { requestBody, req: payload.req })`
    * `[✅`   No `isDialectic` check — branch removed entirely
    * `[✅`   On context error: returns error `Response` via `deps.createErrorResponse`
    * `[✅`   On unhandled exception: returns 500 error `Response`

  ### 6. Enforcement

  * `[✅`   `streamRequest.guard.test.ts`
    * `[✅`   `isStreamRequestDeps(x)` → true for valid deps with `logger`, `adminTokenWalletService`, `prepareChatContext`, `streamChat`, `streamRewind`, `createErrorResponse`, `countTokens`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory`
    * `[✅`   `isStreamRequestDeps(x)` → false for `null`, `{}`, object missing `streamChat`, object missing `streamRewind`, object missing `prepareChatContext`

  * `[✅`   `streamRequest.guard.ts`
    * `[✅`   `isStreamRequestDeps`: checks all required dep fields present including `streamChat`, `streamRewind`, `prepareChatContext`

  ### 7. Behavioral Verification

  * `[✅`   `streamRequest.test.ts` (create — no existing test file)
    * `[✅`   Construct `StreamRequestDeps`, `StreamRequestParams`, `StreamRequestPayload` with proper types
    * `[✅`   Inject mock `streamChat`, mock `streamRewind`, mock `prepareChatContext` from their respective mock/provides files
    * `[✅]`   Test: normal request (`req` body has no `rewindFromMessageId`) → parses `req.json()`, calls `deps.streamChat` with correct `StreamChatDeps`, `StreamChatParams`, `StreamChatPayload = { requestBody, req: payload.req }`
    * `[✅]`   Test: rewind request (`req` body has `rewindFromMessageId`) → parses `req.json()`, calls `deps.streamRewind` with correct `StreamRewindDeps`, `StreamRewindParams`, `StreamRewindPayload = { requestBody, req: payload.req }`
    * `[✅`   Test: `prepareChatContext` returns `PrepareChatContextError` → returns error `Response` with matching status
    * `[✅`   Test: unhandled exception in `prepareChatContext` → returns 500 error `Response`
    * `[✅`   Each test covers exactly one behavior

  ### 8. Construction

  * `[✅`   `construction`
    * `[✅`   `streamRequest(deps, params, payload)` — all three args required
    * `[✅`   `deps` constructed in `handler` (`index.ts`) from `ChatHandlerDeps`
    * `[✅`   Invalid: calling with old positional args `(requestBody, supabaseClient, userId, deps)` — rejected by type system

  ### 9. Implementation

  * `[✅`   `streamRequest.ts`
    * `[✅`   Change signature from `handleStreamingRequest(requestBody, supabaseClient, userId, deps: ChatHandlerDeps)` to `streamRequest(deps: StreamRequestDeps, params: StreamRequestParams, payload: StreamRequestPayload): Promise<StreamRequestReturn>`
    * `[✅`   Remove import of `PathHandlerContext` — God object eliminated
    * `[✅`   Remove import of `ChatHandlerDeps` — replaced by `StreamRequestDeps`
    * `[✅`   Parse `payload.req.json()` to get `requestBody: ChatApiRequest` — `streamRequest` owns request parsing
    * `[✅`   Remove `isDialectic` check and 400 return
    * `[✅]`   Remove rewind 400 return — replace with dispatch to `deps.streamRewind(rewindDeps, rewindParams, { requestBody, req: payload.req })`
    * `[✅`   After `prepareChatContext` success: if `requestBody.rewindFromMessageId` → `deps.streamRewind`, else → `deps.streamChat`
    * `[✅`   Construct `StreamChatDeps` by narrowing from `deps` (logger, adminTokenWalletService, countTokens, debitTokens, createErrorResponse, findOrCreateChat, constructMessageHistory, getMaxOutputTokens)
    * `[✅`   Construct `StreamChatParams` from context success (supabaseClient, userId, wallet, aiProviderAdapter, modelConfig, actualSystemPromptText, finalSystemPromptIdForDb, apiKey, providerApiIdentifier)
    * `[✅`   Construct `StreamRewindDeps` by narrowing from `deps` (logger, adminTokenWalletService, countTokens, debitTokens, getMaxOutputTokens, createErrorResponse)
    * `[✅`   Construct `StreamRewindParams` from context success (supabaseClient, userId, wallet, aiProviderAdapter, modelConfig, actualSystemPromptText, finalSystemPromptIdForDb)

  ### 10. Simulation

  * `[✅`   `streamRequest.mock.ts`
    * `[✅`   `createMockStreamRequest(): StreamRequest` — stub returning mock SSE `Response`
    * `[✅`   `buildContractStreamRequestDeps(): StreamRequestDeps` — valid deps with mock `streamChat`, `streamRewind`, `prepareChatContext`
    * `[✅`   `buildContractStreamRequestParams(): StreamRequestParams` — valid params for contract tests
    * `[✅`   Conforms to `StreamRequest` function type from interface
    * `[✅]`   Controllable: can set success or error responses

  ### 11. External Boundary

  * `[✅`   `streamRequest.provides.ts`
    * `[✅`   Re-exports: `streamRequest`, `StreamRequestDeps`, `StreamRequestParams`, `StreamRequestPayload`, `StreamRequestReturn`, `StreamRequestSuccess`, `StreamRequestError`, `StreamRequest`, `isStreamRequestDeps`, `createMockStreamRequest`, `buildContractStreamRequestDeps`, `buildContractStreamRequestParams`

  ### 12. Edge Validation

  * `[✅`   `streamRequest.integration.test.ts`
    * `[✅`   Validate: `streamChat` + `streamRewind` (producers) → `streamRequest` (subject) — real path handlers with mocked external deps, verify correct handler called for normal vs rewind
    * `[✅`   Validate: `streamRequest` (subject) → `handler` in `index.ts` (consumer) — verify consumer can construct `StreamRequestDeps` and invoke with correct params/payload
    * `[✅`   Uses mocks only for external nodes (Supabase, AI adapter, wallet services)

  ### 13. Directionality

  * `[✅`   Node layer: application/router
  * `[✅`   Deps inward-facing: `streamChat`, `streamRewind`, `prepareChatContext`, wallet services — handler/service layer
  * `[✅`   Provides outward-facing: consumed by `handler` in `index.ts`
  * `[✅`   No cycles

  ### 14. Completion Criteria

  * `[✅`   All interface, guard, test, mock, provides files created and lint clean
  * `[✅`   `streamRequest.ts` is the sole router, dispatches to `streamChat` and `streamRewind`, no reference to `PathHandlerContext`, `ChatHandlerDeps`, `handlePostRequest`, `handleNormalPath`, `handleDialecticPath`, `handleStreamingNormalPath`, or `handleRewindPath`
  * `[✅`   Return type is `StreamRequestSuccess | StreamRequestError`
  * `[✅`   `StreamRequestPayload` contains `req: Request` — `streamRequest` owns JSON parsing
  * `[✅`   All tests GREEN
  * `[✅`   Integration test GREEN

---

* `[ ]`   `supabase/functions/chat/index.ts` **[BE] Decompose chat handler into spec-compliant application boundary with proper DI, typed interface, AdminTokenWalletService + UserTokenWalletService wiring, and _chat.test.utils.ts migration**

  ### 1. Intent & Position

  * `[✅`   `objective`
    * `[✅`   `handler` in `index.ts` currently takes five positional args `(req, deps: ChatHandlerDeps, userClient, adminClient, getUserFn)` — no typed deps/params/payload/return interfaces
    * `[✅`   Line 20: imports old `TokenWalletService` from `_shared/services/tokenWalletService.ts` (file deleted/deprecated)
    * `[✅`   Lines 88-91: constructs `new TokenWalletService(userClient, adminClient)` and assigns to `deps.tokenWalletService` — field no longer exists on `ChatHandlerDeps`, class no longer exists
    * `[✅`   Lines 114-138: bifurcates POST handling into streaming vs non-streaming branches — non-streaming branch is being deleted (all POSTs now go through `StreamRequest`)
    * `[✅`   `defaultDeps` (line 181) references `handleNormalPath`, `handleDialecticPath`, `handlePostRequest`, `tokenWalletService: undefined` — all being removed
    * `[✅`   Create `chat/index.interface.ts` defining `ChatDeps` (replacing the one in `_shared/types.ts`), `ChatParams`, `ChatPayload`, `ChatReturn`
    * `[✅`   Refactor `handler` signature to `handler(deps: ChatDeps, params: ChatParams, payload: ChatPayload): Promise<ChatReturn>`
    * `[✅`   `ChatDeps` (new, local to chat) contains: `logger: ILogger`, `adminTokenWalletService: IAdminTokenWalletService`, `userTokenWalletService: IUserTokenWalletService`, `streamRequest: StreamRequest` (sole router — no `handlePostRequest`), `handleCorsPreflightRequest`, `createSuccessResponse`, `createErrorResponse`, `prepareChatContext: PrepareChatContext`, `countTokens: CountTokensFn`, `debitTokens: DebitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory: ConstructMessageHistory`, `getAiProviderAdapter`
    * `[✅`   `ChatParams` contains: `userClient: SupabaseClient<Database>`, `adminClient: SupabaseClient<Database>`, `getUserFn: GetUserFn`
    * `[✅`   `ChatPayload` contains: `req: Request` — the raw incoming HTTP request (body parsed here, domain data extracted and passed to `streamRequest`)
    * `[✅`   `ChatReturn` = `ChatSuccess | ChatError`
    * `[✅`   `ChatSuccess` = `Response` (SSE stream, JSON, CORS preflight, or error HTTP response)
    * `[✅`   `ChatError` = `Error`
    * `[✅`   Update `_chat.test.utils.ts`: replace old `createMockTokenWalletService` import with `createMockAdminTokenWalletService` and `createMockUserTokenWalletService`; update `createTestDeps` to assign `deps.adminTokenWalletService` and `deps.userTokenWalletService`; remove all references to old `tokenWalletService` field, old mock types, `handlePostRequest`, `handleNormalPath`, `handleDialecticPath`
    * `[✅`   Remove `ChatHandlerDeps` from `_shared/types.ts` — it is now defined locally in `chat/index.interface.ts` with the correct narrow shape
    * `[✅`   Delete old `_shared/services/tokenWalletService.ts`, `tokenWalletService.mock.ts`, and all `tokenWalletService*.test.ts` files — confirm deletion with user before executing

  * `[✅`   `role`
    * `[✅`   Application boundary — entry point for chat edge function
    * `[✅`   Constructs `AdminTokenWalletService(adminClient)` and `UserTokenWalletService(userClient)` at the boundary
    * `[✅`   Handles auth, CORS, request method routing (POST/DELETE), and delegates ALL POST requests to `StreamRequest` (sole router)
    * `[✅`   No `handlePostRequest` — removed. No streaming vs non-streaming bifurcation — all POSTs are streaming
    * `[✅`   Must NOT perform token wallet operations directly — constructs services and passes them down

  * `[✅`   `module`
    * `[✅`   Bounded context: chat edge function entry point and request routing
    * `[✅`   Inside: auth check, CORS, method routing, deps construction, service instantiation, `serve()` wiring
    * `[✅`   Outside: all chat processing logic (delegated to path handlers via `StreamRequest`)

  ### 2. Dependencies & Injection

  * `[✅`   `deps`
    * `[✅`   `AdminTokenWalletService` from `tokenwallet/admin/adminTokenWalletService.provides.ts` — constructed at boundary with `adminClient`
    * `[✅`   `UserTokenWalletService` from `tokenwallet/client/userTokenWalletService.provides.ts` — constructed at boundary with `userClient`
    * `[✅`   `streamRequest` from `./streamRequest/streamRequest.provides.ts` (via DI) — sole POST router, typed as `StreamRequest`
    * `[✅`   `handleCorsPreflightRequest`, `createSuccessResponse`, `createErrorResponse` from `_shared/cors-headers.ts`
    * `[✅`   `prepareChatContext` from `./prepareChatContext.ts`
    * `[✅`   `countTokens`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory`, `handleContinuationLoop`, `getAiProviderAdapter` — all injected for passthrough to router
    * `[✅`   Remove imports of deleted `handlePostRequest`, `handleNormalPath`, `handleDialecticPath`
    * `[✅`   Remove import of old `TokenWalletService`
    * `[✅`   No reverse dependencies

  * `[✅`   `context_slice`
    * `[✅`   `ChatDeps` is the full set of injectable deps for the application boundary
    * `[✅`   `ChatParams` is per-request data (request, clients, auth)
    * `[✅`   Routers receive narrowed deps constructed from `ChatDeps`

  ### 3. Contract Definition

  * `[✅`   `chat/index.interface.test.ts` (create or update)
    * `[✅`   Valid: `ChatDeps` has `logger`, `adminTokenWalletService`, `userTokenWalletService`, `streamRequest`, `handleCorsPreflightRequest`, `createSuccessResponse`, `createErrorResponse`, `prepareChatContext`, `countTokens`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory`, `getAiProviderAdapter` — all present with correct callable shapes
    * `[✅`   Valid: `ChatParams` has `userClient` with `from` function, `adminClient` with `from` function, `getUserFn` as function
    * `[✅`   Valid: `ChatPayload` has `req` as `Request` with `method`, `headers`, `json` function
    * `[✅`   Valid: `ChatSuccess` is a `Response` (SSE stream, JSON, CORS, or error HTTP response)
    * `[✅`   Valid: `ChatError` is an `Error` with message
    * `[✅`   Valid: `ChatReturn` accepts `ChatSuccess` value
    * `[✅`   Valid: `ChatReturn` accepts `ChatError` value
    * `[✅`   Valid: `Chat` function type is `(deps, params, payload) => Promise<ChatReturn>`

  ### 4. Structural Boundary

  * `[✅`   `chat/index.interface.ts`
    * `[✅`   `ChatDeps` — all injectable deps for the application boundary (see §1 objective)
    * `[✅`   `ChatParams` — `userClient: SupabaseClient<Database>`, `adminClient: SupabaseClient<Database>`, `getUserFn: GetUserFn`
    * `[✅`   `ChatPayload` — `req: Request`
    * `[✅`   `ChatSuccess` — `Response`
    * `[✅`   `ChatError` — `Error`
    * `[✅`   `ChatReturn` — `ChatSuccess | ChatError`
    * `[✅`   `Chat` — function type `(deps: ChatDeps, params: ChatParams, payload: ChatPayload) => Promise<ChatReturn>`
    * `[✅`   No `any`, no optional fields except where the current API explicitly supports optionality
    * `[✅`   This replaces `ChatHandlerDeps` in `_shared/types.ts` — the old definition must be removed from `_shared/types.ts`

  ### 5. Interaction Semantics

  * `[✅`   `interaction.spec`
    * `[✅`   `serve()` creates `adminClient` and `getSupabaseClient` factory, then calls `createChatServiceHandler`
    * `[✅`   `createChatServiceHandler` constructs `AdminTokenWalletService(adminClient)`, extracts `userClient` from auth token, constructs `UserTokenWalletService(userClient)`, and invokes `handler`
    * `[✅`   `handler` checks auth, routes by method:
      * OPTIONS → CORS preflight
      * POST → construct `StreamRequestDeps`, `StreamRequestParams`, `StreamRequestPayload = { req: payload.req }` → call `deps.streamRequest(streamDeps, streamParams, { req: payload.req })` — no JSON parsing here, `streamRequest` owns that
      * DELETE → RPC call for chat deletion
      * Other → 405
    * `[✅`   Constructs `StreamRequestDeps` by narrowing from `ChatDeps` (logger, adminTokenWalletService, prepareChatContext, streamChat, streamRewind, createErrorResponse, countTokens, debitTokens, getMaxOutputTokens, findOrCreateChat, constructMessageHistory)
    * `[✅`   Constructs `StreamRequestParams` with `supabaseClient`, `userId`, `userTokenWalletService` from `ChatDeps`/`ChatParams`
    * `[✅`   Constructs `StreamRequestPayload` with `req` from `payload.req`

  ### 6. Enforcement

  * `[✅`   `chat/index.guard.test.ts`
    * `[✅`   `isChatDeps(x)` → true for valid deps with `logger`, `adminTokenWalletService`, `userTokenWalletService`, `streamRequest`, `handleCorsPreflightRequest`, `createSuccessResponse`, `createErrorResponse`, `prepareChatContext`, `countTokens`, `debitTokens`, `getMaxOutputTokens`, `findOrCreateChat`, `constructMessageHistory`, `getAiProviderAdapter`
    * `[✅`   `isChatDeps(x)` → false for `null`, `{}`, object missing `adminTokenWalletService`, object missing `streamRequest`

  * `[✅`   `chat/index.guard.ts`
    * `[✅`   `isChatDeps`: checks all required dep fields present including `adminTokenWalletService`, `userTokenWalletService`, `streamRequest`

  ### 7. Behavioral Verification

  * `[✅]`   `index.test.ts` (update existing)
    * `[✅]`   Update all tests to construct `ChatDeps` (new local type) and `ChatParams`
    * `[✅]`   Replace any `deps.tokenWalletService` with `deps.adminTokenWalletService` and `deps.userTokenWalletService`
    * `[✅]`   Inject mock `StreamRequest` from its provides file to verify dispatch (sole router)
    * `[✅]`   Update tests consuming `createTestDeps` to use new return shape
    * `[✅]`   Remove tests for streaming vs non-streaming POST bifurcation — all POSTs go through `StreamRequest`
    * `[✅]`   Existing test cases preserved: auth validation, CORS, POST routing, DELETE routing, method rejection
    * `[✅]`   Uses real application types

  ### 8. Construction

  * `[✅]`   `construction`
    * `[✅]`   `handler(deps, params, payload)` — all three args required
    * `[✅]`   `AdminTokenWalletService` and `UserTokenWalletService` constructed in `createChatServiceHandler` at boundary
    * `[✅]`   `defaultDeps` updated to include all real implementations, no `tokenWalletService: undefined`
    * `[✅]`   Invalid: calling with old five positional args — rejected by type system

  ### 9. Implementation

  * `[✅]`   `index.ts`
    * `[✅]`   Change `handler` signature from `handler(req, deps, userClient, adminClient, getUserFn)` to `handler(deps: ChatDeps, params: ChatParams, payload: ChatPayload): Promise<ChatReturn>`
    * `[✅]`   Remove `import { TokenWalletService }` — replace with `import { AdminTokenWalletService }` and `import { UserTokenWalletService }`
    * `[✅]`   In `createChatServiceHandler`: construct `new AdminTokenWalletService(adminClient)` and `new UserTokenWalletService(userClient)`, pass both into `ChatDeps`
    * `[✅]`   Remove lines 88-91 (old `TokenWalletService` fallback construction)
    * `[✅]`   For ALL POSTs: construct `StreamRequestDeps`, `StreamRequestParams`, `StreamRequestPayload = { req: payload.req }`, call `deps.streamRequest(streamDeps, streamParams, { req: payload.req })` — no JSON parsing, `streamRequest` owns that
    * `[✅]`   Remove all references to `handlePostRequest`, `handleNormalPath`, `handleDialecticPath`, `handleStreamingNormalPath`, `handleRewindPath` from imports and `defaultDeps`
    * `[✅]`   DELETE and OPTIONS handling unchanged
    * `[✅]`   Update `defaultDeps` to new `ChatDeps` shape with all real implementations — `streamRequest` replaces old router refs
    * `[✅]`   Remove `ChatHandlerDeps` from `_shared/types.ts`

  ### 10. Simulation

  * `[✅]`   `chat/index.mock.ts`
    * `[✅]`   `createMockChat(): ChatFn` — stub using `spy()` returning mock `Response`
    * `[✅]`   Conforms to function signature from interface

  ### 11. External Boundary

  * `[✅]`   `chat/index.provides.ts`
    * `[✅]`   Re-exports: `handler`, `createChatServiceHandler`, `ChatDeps`, `ChatParams`, `ChatPayload`, `ChatReturn`, `isChatDeps`, `createMockChat`, `defaultDeps`

  ### 12. Edge Validation

  * `[✅]`   `index.integration.test.ts` (update existing)
    * `[✅]`   Validate: full POST flow with real `StreamRequest` → real path handlers → mocked external deps (Supabase, AI adapter, wallet services)
    * `[✅]`   Validate: `AdminTokenWalletService` and `UserTokenWalletService` correctly constructed and passed through
    * `[✅]`   Validate: old `tokenWalletService` field does not exist anywhere in the dependency chain

  * `[ ]`   `happy_path.integration.test.ts` (update existing)
    * `[ ]`   Update to use new mock types from `_chat.test.utils.ts`
    * `[ ]`   Replace `mockTokenWalletService` references with `mockAdminTokenWalletService` and `mockUserTokenWalletService`
    * `[ ]`   All existing test cases remain GREEN

  ### 13. Directionality

  * `[✅]`   Node layer: application boundary (outermost)
  * `[✅]`   Deps inward-facing: all injected deps flow inward to handlers and services
  * `[✅]`   Provides outward-facing: `serve()` is the edge function entry point — nothing consumes `handler` externally
  * `[✅]`   No cycles

  ### 14. Completion Criteria

  * `[✅]`   All interface, guard, test, mock, provides files created/updated and lint clean
  * `[✅]`   `index.ts` uses new signature, constructs `AdminTokenWalletService` and `UserTokenWalletService` at boundary, no reference to old `TokenWalletService`
  * `[✅]`   `_chat.test.utils.ts` updated — no reference to old mock types or `deps.tokenWalletService`
  * `[✅]`   `ChatHandlerDeps` removed from `_shared/types.ts`
  * `[ ]`   All existing + new tests GREEN across `index.test.ts`, `happy_path.integration.test.ts`, and all other test files consuming `_chat.test.utils.ts`
  * `[✅]`   Old `_shared/services/tokenWalletService.ts`, `tokenWalletService.mock.ts`, and all `tokenWalletService*.test.ts` files confirmed safe to delete — confirm with user before executing

  ### 15. Versioning

  * `[✅]`   **Commit** `refactor(chat): decompose chat handlers into spec-compliant functions with proper DI, typed interfaces, and AdminTokenWalletService/UserTokenWalletService wiring`
    * `[✅]`   Structural: `handleNormalPath`, `handleDialecticPath`, `handlePostRequest` deleted; new packaged functions `constructMessageHistory`, `handleContinuationLoop`, `prepareChatContext`, `streamChat`, `streamRewind`, `streamRequest` each with interface/guard/mock/provides files; `ChatHandlerDeps` removed from `_shared/types.ts`; `PathHandlerContext` removed; `_chat.test.utils.ts` migrated to new mock types
    * `[✅]`   Behavioral: all functions use `(deps, params, payload)` signatures with narrow typed deps and `Success | Error` return unions; `adminTokenWalletService` replaces `tokenWalletService` throughout; `userTokenWalletService` replaces `tokenWalletService` in `prepareChatContext`; `debitTokens` received via DI not direct import; rewind ported to SSE streaming
    * `[✅]`   Contract: `ConstructMessageHistoryDeps`, `HandleContinuationLoopDeps`, `PrepareChatContextDeps`, `StreamChatDeps`, `StreamRewindDeps`, `StreamRequestDeps`, `ChatDeps` (new local) replace old positional args + `PathHandlerContext` + `ChatHandlerDeps` (shared)

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
