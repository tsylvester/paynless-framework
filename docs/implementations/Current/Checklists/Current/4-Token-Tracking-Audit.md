# AI Chat Enhancements: PARENTHESIS Implementation Plan

## Preamble

This document outlines the detailed, step-by-step implementation plan for the AI Chat Enhancements project, based on the synthesized requirements (SYNTHESIS #1, #2, #3) and user feedback. It follows a Test-Driven Development (TDD) approach (Red -> Green -> Refactor) and adheres to the existing monorepo architecture (`Backend (Supabase Functions) <-> API Client (@paynless/api) <-> State (@paynless/store) <-> Frontend (apps/web)`).

**Goal:** To guide the development team through the implementation process, ensuring all requirements are met, code quality is maintained, and features are delivered reliably.

## Legend

*   [ ] Each work step will be uniquely named for easy reference 
    *   [ ] Worksteps will be nested as shown
        *   [ ] Nesting can be as deep as logically required 
*   [✅] Represents a completed step or nested set
*   [🚧] Represents an incomplete or partially completed step or nested set
*   [⏸️] Represents a paused step where a discovery has been made that requires backtracking 
*   [❓] Represents an uncertainty that must be resolved before continuing 
*   [🚫] Represents a blocked, halted, stopped step or nested set that has some unresolved problem or prior dependency to resolve before continuing

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

* **[DB]:** Database Schema Change (Migration)
* **[RLS]:** Row-Level Security Policy
* **[BE]:** Backend Logic (Edge Function / RLS / Helpers)
* **[API]:** API Client Library (`@paynless/api`)
* **[STORE]:** State Management (`@paynless/store`)
* **[UI]:** Frontend Component (`apps/web`)
* **[TEST-UNIT]:** Unit Test Implementation/Update
* **[TEST-INT]:** Integration Test Implementation/Update (API, Store-Component, RLS)
* **[ANALYTICS]:** Analytics Integration (`@paynless/analytics`)
* **[REFACTOR]:** Code Refactoring Step
* **[COMMIT]:** Checkpoint for Git Commit

**Core Principles:**

*   **TDD:** Write failing tests before implementation code (RED), write code to make tests pass (GREEN), then refactor (REFACTOR).
*   **Modularity:** Build reusable components, functions, and modules.
*   **Architecture:** Respect the existing API <-> Store <-> UI flow and the `api` Singleton pattern.
*   **Explicitness:** Leave nothing to assumption. Detail every sub-step.
*   **Testing:** Unit tests (`[TEST-UNIT]`) for isolated logic, Integration tests (`[TEST-INT]`) for interactions (API-Store, Store-UI, Backend Endpoints). E2E tests (`[TEST-E2E]`) are optional/manual for this phase.
*   **Analytics:** Integrate `packages/analytics` for all relevant user interactions (`[ANALYTICS]`)
*   **Commits:** Commit frequently after Green/Refactor stages with clear messages (`[COMMIT]`)
*   **Checkpoints:** Stop, run tests (`npm test`), build (`npm run build`), restart dev server after significant steps/phases.

**Reference Requirements:** Use REQ-XXX codes from SYNTHESIS #2 PRD for traceability.

# Phase 4: Advanced Tokenomics - Wallets, Payments, and Auditing

**Overall Goal:** Implement a robust and extensible system for managing AI token wallets, allowing users to acquire tokens through various payment gateways (fiat and crypto), consume tokens for AI services, and provide a clear audit trail. This system will be built with abstractions to easily integrate new payment methods and potential future exchange functionalities.

**Legend:**
*   **[DB]:** Database
*   **[RLS]:** Row-Level Security
*   **[BE]:** Backend Logic (Edge Function / Services / Helpers)
*   **[TYPES]:** Shared Types (`@paynless/types`)
*   **[API]:** API Client (`@paynless/api`)
*   **[STORE]:** State Management (`@paynless/store`)
*   **[UI]:** Frontend Component/Hook (`apps/web`)
*   **[TEST-UNIT]:** Unit Test
*   **[TEST-INT]:** Integration Test
*   **[REFACTOR]:** Refactoring
*   **[COMMIT]:** Git Commit Point
*   **[ARCH]:** Architecture & Design

---

## Phase 4.0: [ARCH] Foundational Abstractions & Core Ledger Design

**Goal:** Define the core interfaces and database structures for a flexible token wallet and payment system.

*   [✅] **4.0.1: [TYPES] Define Core Service Interfaces**
    *   `packages/types/src/services/payment.types.ts` (new):
        *   `PurchaseRequest`: `{ userId: string; organizationId?: string | null; itemId: string; /* e.g., package_1000_tokens */ quantity: number; currency: string; /* e.g., USD, ETH */ paymentGatewayId: string; /* e.g., 'stripe', 'coinbase', 'internal_tauri_wallet' */ metadata?: Record<string, any>; }`
        *   `PaymentInitiationResult`: `{ success: boolean; transactionId?: string; /* Our internal payment_transactions.id */ paymentGatewayTransactionId?: string; /* Stripe's session_id, etc. */ redirectUrl?: string; clientSecret?: string; /* For Stripe Elements */ error?: string; }`
        *   `PaymentConfirmation`: `{ success: boolean; transactionId: string; tokensAwarded?: number; error?: string; }`
        *   `IPaymentGatewayAdapter`: `{ gatewayId: string; initiatePayment(request: PurchaseRequest): Promise<PaymentInitiationResult>; handleWebhook(payload: any, headers?: any): Promise<PaymentConfirmation>; /* headers for signature verification */ }`
    *   `packages/types/src/services/tokenWallet.types.ts` (new):
        *   `TokenWallet`: `{ walletId: string; userId?: string; organizationId?: string; balance: string; /* Using string for BigInt precision via NUMERIC */ currency: 'AI_TOKEN'; createdAt: Date; updatedAt: Date; }`
        *   `TokenWalletTransactionType`: `'CREDIT_PURCHASE' | 'CREDIT_ADJUSTMENT' | 'CREDIT_REFERRAL' | 'DEBIT_USAGE' | 'DEBIT_ADJUSTMENT' | 'TRANSFER_IN' | 'TRANSFER_OUT'`
        *   `TokenWalletTransaction`: `{ transactionId: string; walletId: string; type: TokenWalletTransactionType; amount: string; /* BigInt via NUMERIC */ balanceAfterTxn: string; /* BigInt via NUMERIC */ relatedEntityId?: string; /* e.g., chatMessageId, paymentTransactionId, referredUserId */ relatedEntityType?: string; notes?: string; timestamp: Date; }`
        *   `ITokenWalletService`: `{ createWallet(userId?: string, organizationId?: string): Promise<TokenWallet>; getWallet(walletId: string): Promise<TokenWallet | null>; getWalletForContext(userId?: string, organizationId?: string): Promise<TokenWallet | null>; getBalance(walletId: string): Promise<string>; recordTransaction(params: { walletId: string; type: TokenWalletTransactionType; amount: string; relatedEntityId?: string; relatedEntityType?: string; notes?: string; }): Promise<TokenWalletTransaction>; checkBalance(walletId: string, amountToSpend: string): Promise<boolean>; getTransactionHistory(walletId: string, limit?: number, offset?: number): Promise<TokenWalletTransaction[]>; }`
*   [✅] **4.0.2: [DB] Design Core Token Ledger Tables**
    *   `token_wallets` table: `wallet_id (PK UUID DEFAULT gen_random_uuid())`, `user_id (FK to public.users(id) ON DELETE CASCADE, NULLABLE)`, `organization_id (FK to public.organizations(id) ON DELETE CASCADE, NULLABLE)`, `balance (NUMERIC(19,0) NOT NULL DEFAULT 0)`, `currency (VARCHAR(10) NOT NULL DEFAULT 'AI_TOKEN')`, `created_at (TIMESTAMPTZ DEFAULT NOW())`, `updated_at (TIMESTAMPTZ DEFAULT NOW())`. `CONSTRAINT user_or_org_wallet CHECK ((user_id IS NOT NULL AND organization_id IS NULL) OR (user_id IS NULL AND organization_id IS NOT NULL) OR (user_id IS NOT NULL AND organization_id IS NOT NULL))`. Add unique constraint on `(user_id)` where `organization_id IS NULL`, and on `(organization_id)` where `user_id IS NULL`.
    *   `token_wallet_transactions` table (Ledger): `transaction_id (PK UUID DEFAULT gen_random_uuid())`, `wallet_id (FK to token_wallets(wallet_id) ON DELETE CASCADE, NOT NULL)`, `transaction_type (VARCHAR(50) NOT NULL)`, `amount (NUMERIC(19,0) NOT NULL)`, `balance_after_txn (NUMERIC(19,0) NOT NULL)`, `related_entity_id (VARCHAR(255), NULLABLE)`, `related_entity_type (VARCHAR(50), NULLABLE)`, `notes (TEXT, NULLABLE)`, `idempotency_key (VARCHAR(255) UNIQUE, NULLABLE)`, `timestamp (TIMESTAMPTZ DEFAULT NOW())`. Index on `(wallet_id, timestamp DESC)`.
    *   `payment_transactions` table: `id (PK UUID DEFAULT gen_random_uuid())`, `user_id (FK to public.users(id), NULLABLE)`, `organization_id (FK to public.organizations(id), NULLABLE)`, `target_wallet_id (FK to token_wallets(wallet_id) NOT NULL)`, `payment_gateway_id (VARCHAR(50) NOT NULL)`, `gateway_transaction_id (VARCHAR(255), NULLABLE, UNIQUE)`, `status (VARCHAR(20) NOT NULL DEFAULT 'PENDING')`, `amount_requested_fiat (NUMERIC(10,2), NULLABLE)`, `currency_requested_fiat (VARCHAR(3), NULLABLE)`, `amount_requested_crypto (NUMERIC(36,18), NULLABLE)`, `currency_requested_crypto (VARCHAR(10), NULLABLE)`, `tokens_to_award (NUMERIC(19,0) NOT NULL)`, `metadata_json (JSONB, NULLABLE)`, `created_at (TIMESTAMPTZ DEFAULT NOW())`, `updated_at (TIMESTAMPTZ DEFAULT NOW())`.
*   [✅] **4.0.3: [DB] Create Migration Scripts for New Tables.** Include `CREATE TRIGGER update_wallet_balance_and_log_txn BEFORE INSERT ON token_wallet_transactions` for atomicity or handle in service layer with DB transaction. (Prefer service layer transaction). Also `CREATE TRIGGER set_public_updated_at BEFORE UPDATE ON each_table`.
*   [✅] **4.0.4: [DB] Apply Migrations & Verify.**
*   [✅] **4.0.5: [COMMIT]** "feat(DB|TYPES): Design foundational abstractions and schema for token wallets & payments"

---

## Phase 4.0.A: [ARCH] Wallet Provisioning Strategy

**Goal:** Ensure all relevant entities (users, organizations) have a token wallet provisioned automatically and reliably.

*   [ ] **4.0.A.1: [BE] [DB] Define Wallet Provisioning Triggers & Logic**
    *   [ ] **4.0.A.1.1: [BE] User Wallet Provisioning:**
        *   [ ] **Option 1 (Preferred for new users):** Modify user creation process (e.g., after Supabase `auth.users` insertion, trigger a function or use a DB trigger) to automatically call `TokenWalletService.createWallet` for the new user.
        *   [ ] **Option 2 (For existing users / fallback):** Implement logic triggered on user login (e.g., in a custom `/on-login` endpoint or session handler) to check for and create a user wallet if one doesn't exist using `TokenWalletService.getWalletForContext` and `TokenWalletService.createWallet`.
        *   [ ] **Decision Point:** Choose and document the primary mechanism for user wallet creation.
    *   [ ] **4.0.A.1.2: [BE] Organization Wallet Provisioning:**
        *   [ ] Define the trigger for organization wallet creation (e.g., upon organization creation via API/service, or on first relevant action requiring an org wallet).
        *   [ ] Implement the call to `TokenWalletService.createWallet` for the new organization.
    *   [ ] **4.0.A.1.3: [DB] [BE] Idempotency:** Ensure wallet creation logic is idempotent (i.e., attempting to create a wallet that already exists does not cause errors or duplicates). `TokenWalletService.createWallet` should handle this, or the calling logic should check first. (Note: `createWallet` already has some checks, but the overall flow needs to be robust).
*   [ ] **4.0.A.2: [BE] [TEST-UNIT] Write Unit/Integration Tests for Wallet Provisioning**
    *   Test automatic user wallet creation upon new user signup.
    *   Test user wallet creation on login for users missing a wallet.
    *   Test organization wallet creation.
*   [ ] **4.0.A.3: [BE] [DB] (Optional) Backfill Wallets for Existing Entities**
    *   [ ] Develop and run a script/process to create wallets for any existing users/organizations that do not currently have one. (Only if a significant number of entities exist prior to this system going live).
*   [ ] **4.0.A.4: [COMMIT]** "feat(ARCH|BE): Implement and test automatic wallet provisioning strategy"

---

## Phase 4.1: [BE] Core Wallet Service & Payment Gateway Integration

**Goal:** Implement the backend service for managing token wallets and integrate the first payment gateway (Stripe).

### 4.1.1: [BE] Core Wallet Service & Payment Gateway Integration
*   [🚧] **4.1.1.1: [TEST-UNIT] Implement and Test `TokenWalletService` Methods using TDD**
    *   **Overall Prerequisites (ensure these are addressed before or during relevant TDD cycles below):**
        *   Task `4.1.1.1a` (Enhance `recorded_by_user_id` for Full Auditability) and its sub-tasks are critical, especially for `recordTransaction`.
            *   [✅] **4.1.1.1a.1: [DB] Make `recorded_by_user_id` mandatory.** (Verified as completed in existing migration `20250513135601_record_token_transaction.sql`, which makes the column `NOT NULL` and the PG function parameter effectively mandatory.)
            *   [✅] **4.1.1.1a.2: [TYPES] Update Type Definitions.** (Verified as completed in `packages/types/src/services/tokenWallet.types.ts`; `TokenWalletTransaction` and `ITokenWalletService.recordTransaction` params correctly define `recordedByUserId: string`.)
        *   [✅] Task `4.1.1.2` (Create Postgres function `record_token_transaction`) must be implemented, robust, and verified before the `recordTransaction` service method's TDD cycle can be successfully completed. (Function exists and basic interaction verified)
    *   **`createWallet` Method:**
        *   [✅] **4.1.1.1.1: [TEST-UNIT] Define Test Cases for `TokenWalletService.createWallet`**
            *   Successful user wallet creation (`userId` provided, `organizationId` is null).
            *   Successful organization wallet creation (`organizationId` provided, `userId` is null).
            *   Failure if neither `userId` nor `organizationId` is provided.
            *   Consider behavior if *both* `userId` and `organizationId` are provided (align with DB constraints: current `user_or_org_wallet` constraint allows this, but service might enforce mutual exclusivity or specific logic).
            *   Verify the returned `TokenWallet` object structure, default balance, currency, etc.
            *   Verify data persistence and correct field mapping in the `token_wallets` table.
        *   [✅] **4.1.1.1.2: [TEST-UNIT] Write Failing Integration Tests for `TokenWalletService.createWallet` (RED)** (Tests written, initial failures led to implementation)
        *   [✅] **4.1.1.1.3: [BE] Implement `TokenWalletService.createWallet` method.**
            *   Location: `supabase/functions/_shared/services/tokenWalletService.ts`.
            *   Handle insertion into `token_wallets` table.
            *   Return the created `TokenWallet` object.
        *   [✅] **4.1.1.1.4: [TEST-UNIT] Run `createWallet` Tests until GREEN.** (Tests are now passing)
        *   [✅] **4.1.1.1.5: [REFACTOR] Refactor `createWallet` Implementation and Associated Tests.** (Iterative improvements made for robustness, including admin client usage, dummy org handling, and assertion corrections).
        *   [✅] **4.1.1.1.6: [COMMIT]** "feat(BE|TEST): Implement and test TokenWalletService.createWallet"
    *   **`recordTransaction` Method:** (Depends on `createWallet` for test setup, and the finalized PG function from `4.1.1.2` & `4.1.1.1a` requirements)
        *   [✅] **4.1.1.1.7: [TEST-UNIT] Define Test Cases for `TokenWalletService.recordTransaction`**
            *   [✅] Successful `CREDIT_PURCHASE` transaction. (Covered by existing tests)
            *   [✅] Successful `DEBIT_USAGE` transaction. (Covered by existing tests)
            *   [✅] Failure scenario: Target wallet ID does not exist. (Covered by existing tests)
            *   [✅] Failure scenario: `recordedByUserId` is missing (as it's now mandatory). (Covered by existing tests)
            *   [✅] Verify the structure and content of the returned `TokenWalletTransaction` object. (Covered by assertions in existing tests)
            *   [✅] Verify correct data persistence in `token_wallet_transactions` table. (Covered by assertions in existing tests)
            *   [✅] Verify that `token_wallets.balance` is correctly updated by the underlying `record_token_transaction` PG function. (Covered by assertions in existing tests)
        *   [✅] **4.1.1.1.8: [TEST-UNIT] Write Failing Integration Tests for `TokenWalletService.recordTransaction` (RED)** (Tests for successful credit and non-existent wallet written; initial failures led to implementation refinements)
        *   [✅] **4.1.1.1.9: [BE] Verify/Refine `TokenWalletService.recordTransaction` method implementation.** (Method refined to handle RPC array return, snake_case to camelCase mapping, type conversions, and inclusion of `paymentTransactionId`).
        *   [✅] **4.1.1.1.10: [TEST-UNIT] Run `recordTransaction` Tests until GREEN.** (Tests for successful credit and non-existent wallet are now passing).
        *   [✅] **4.1.1.1.11: [REFACTOR] Refactor `recordTransaction` Implementation and Tests.** (Iterative improvements to RPC data handling and type mapping).
        *   [✅] **4.1.1.1.12: [COMMIT]** "feat(BE|TEST): Implement and test TokenWalletService.recordTransaction (credit, debit, error scenarios)"
    *   **`getWallet` Method:**
        *   [✅] **4.1.1.1.13: [TEST-UNIT] Define Test Cases & Write Failing Integration Tests for `TokenWalletService.getWallet` (RED)**
            *   Successfully retrieves an existing user wallet (verify all properties).
            *   Successfully retrieves an existing organization wallet (verify all properties, user is admin of org).
            *   Returns `null` if the provided `walletId` (valid UUID format) does not exist in the database.
            *   (RLS Check) Returns `null` when attempting to retrieve a wallet that exists but belongs to a different user and is accessed with a user-specific client context (simulating RLS denial).
            *   (RLS Check) Returns `null` for an organization wallet if the user is a member of the organization but not an admin.
            *   (Input Validation) Returns `null` if the provided `walletId` string is not a valid UUID format (service should gracefully handle potential database errors from malformed UUIDs).
        *   [✅] **4.1.1.1.14: [BE] Implement `TokenWalletService.getWallet` method.**
        *   [✅] **4.1.1.1.15: [TEST-UNIT] Run `getWallet` Tests until GREEN.**
        *   [✅] **4.1.1.1.16: [REFACTOR] Refactor `getWallet` Implementation and Tests.**
        *   [✅] **4.1.1.1.17: [COMMIT]** "feat(BE|TEST): Implement and test TokenWalletService.getWallet"
    *   **`getWalletForContext` Method:**
        *   [✅] **4.1.1.1.18: [TEST-UNIT] Define Test Cases & Write Failing Integration Tests for `TokenWalletService.getWalletForContext` (RED)**
        *   [✅] **4.1.1.1.19: [BE] Implement `TokenWalletService.getWalletForContext` method.**
        *   [✅] **4.1.1.1.20: [TEST-UNIT] Run `getWalletForContext` Tests until GREEN.**
        *   [✅] **4.1.1.1.21: [REFACTOR] Refactor `getWalletForContext` Implementation and Tests.**
        *   [✅] **4.1.1.1.22: [COMMIT]** "feat(BE|TEST): Implement, test, and refactor TokenWalletService.getWalletForContext"
    *   **`getBalance` Method:**
        *   [✅] **4.1.1.1.23: [TEST-UNIT] Define Test Cases & Write Failing Integration Tests for `TokenWalletService.getBalance` (RED)**
        *   [✅] **4.1.1.1.24: [BE] Implement `TokenWalletService.getBalance` method.**
        *   [✅] **4.1.1.1.25: [TEST-UNIT] Run `getBalance` Tests until GREEN.**
        *   [✅] **4.1.1.1.26: [REFACTOR] Refactor `getBalance` Implementation and Tests.**
        *   [✅] **4.1.1.1.27: [COMMIT]** "feat(BE|TEST): Implement and test TokenWalletService.getBalance"
    *   **`checkBalance` Method:**
        *   [✅] **4.1.1.1.28: [TEST-UNIT] Define Test Cases & Write Failing Integration Tests for `TokenWalletService.checkBalance` (RED)**
        *   [✅] **4.1.1.1.29: [BE] Implement `TokenWalletService.checkBalance` method.**
        *   [✅] **4.1.1.1.30: [TEST-UNIT] Run `checkBalance` Tests until GREEN.**
        *   [✅] **4.1.1.1.31: [REFACTOR] Refactor `checkBalance` Implementation and Tests.**
        *   [✅] **4.1.1.1.32: [COMMIT]** "feat(BE|TEST): Implement and test TokenWalletService.checkBalance"
    *   **`getTransactionHistory` Method:**
        *   [✅] **4.1.1.1.33: [TEST-UNIT] Define Test Cases & Write Failing Integration Tests for TokenWalletService.getTransactionHistory** (Utilized existing tests; primary challenges were RLS resolution and direct pagination implementation in the service method, both now addressed)
        *   [✅] **4.1.1.1.34: [BE] Implement TokenWalletService.getTransactionHistory (focused on fetching, RLS, and pagination)** (Method implemented with RLS operational and pagination included directly)
        *   [✅] **4.1.1.1.35: [TEST-INTEG] Test TokenWalletService.getTransactionHistory for various scenarios (user, org admin, pagination, RLS for non-accessing users)** (All relevant test scenarios are passing)
        *   [✅] **4.1.1.1.36: [COMMIT]** "feat(BE|TEST): Implement and test TokenWalletService.getTransactionHistory with RLS and pagination"
        *   [✅] **4.1.1.1.37: [DB] RPC Function (Optional): `get_user_token_transaction_history(p_user_id UUID, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)`** (To be re-evaluated; service method handles this, RPC might be redundant)
*   [🚧] **4.1.1.1a: [ARCH] [DB] [TYPES] Enhance `recorded_by_user_id` for Full Auditability**
    *   **Goal:** Ensure every transaction is auditable to a specific user, system process, or admin action.
    *   [✅] **4.1.1.1a.1: [DB] Make `recorded_by_user_id` mandatory.** (Moved to prerequisites above)
        *   Modify `record_token_transaction` SQL function: `p_recorded_by_user_id UUID` (not nullable). (Covered by 4.1.1.2)
        *   Modify `token_wallet_transactions` table: `recorded_by_user_id UUID NOT NULL`. (This needs to be done via a migration)
    *   [✅] **4.1.1.1a.2: [TYPES] Update Type Definitions.** (Moved to prerequisites above)
        *   Modify `ITokenWalletService` (`recordTransaction` params) to require `recordedByUserId: string`.
        *   Modify `TokenWalletTransaction` type to make `recordedByUserId: string` (non-nullable).
*   [✅] **4.1.1.2: [DB] Create Postgres function `record_token_transaction`**
    *   This function takes transaction parameters (including a mandatory `p_recorded_by_user_id`), updates `token_wallets.balance`, inserts into `token_wallet_transactions` (with `recorded_by_user_id NOT NULL`), and returns the new transaction record. It MUST run within a transaction and implement robust idempotency. (Verified as completed in existing migration `20250513135601_record_token_transaction.sql`)
*   [✅] **4.1.1.3: [COMMIT]** "feat(BE|DB): Implement core TokenWalletService and atomic DB transaction function with tests"

*   [🚧] **4.1.1.4: [BE] [RLS] Secure Tokenomics Tables**
    *   **Goal:** Implement Row-Level Security for `token_wallets`, `token_wallet_transactions`, and `payment_transactions` to ensure data integrity and proper access control.
    *   [✅] **4.1.1.4.1: [RLS] Define and Apply RLS for `token_wallets`** (All sub-points verified as complete through various migrations, culminating in `is_admin_of_org_for_wallet` helper for org admin SELECT.)
        *   `SELECT`: Users can select their own wallet(s) (`user_id = auth.uid()`) or wallets of organizations they are an **admin** member of (requires join with `organization_members` and check for `role = 'admin'`). Service role for full access.
        *   `INSERT`: Restrict to `service_role` or specific trusted roles/functions. End-users should not directly insert wallets.
        *   `UPDATE`: Generally restrict direct updates, especially to `balance`. Updates to `balance` should occur via the `record_token_transaction` function. Other fields (e.g., metadata if added) might have more permissive policies for owners.
        *   `DELETE`: Restrict to `service_role` or specific admin-only functions.
    *   [✅] **4.1.1.4.2: [RLS] Define and Apply RLS for `token_wallet_transactions`**
        *   `SELECT`: Users can select transactions belonging to their own wallet(s) or wallets of organizations they are an **admin** member of. (User part and Org Admin part are implemented).
        *   `INSERT`: Restrict to `service_role` or the `record_token_transaction` function (which is `SECURITY DEFINER`). End-users should not directly insert ledger entries. (Implemented)
        *   `UPDATE`: Forbid all updates (`USING (false)` and `WITH CHECK (false)`). Ledger entries should be immutable. (Implemented for authenticated users. `service_role` can currently bypass - potential refinement needed for strict immutability).
        *   `DELETE`: Forbid all deletes. Ledger entries should be immutable. (Implemented for authenticated users. `service_role` can currently bypass - potential refinement needed for strict immutability).
    *   [🚧] **4.1.1.4.3: [RLS] Define and Apply RLS for `payment_transactions`**
        *   `SELECT`: Users can select their own payment transactions (`user_id = auth.uid()`) or payments related to organizations they manage. (User part implemented. Org part is missing).
        *   [ ] **Sub-task: Implement SELECT RLS for organization-managed `payment_transactions`.**
        *   `INSERT`: Primarily by backend services when initiating payments. Authenticated users might trigger this via an edge function that runs with elevated privileges for the insert. (Implemented via disallowing direct user inserts).
        *   `UPDATE`: Status updates (e.g., 'pending' to 'completed') should be handled by trusted backend processes (like webhook handlers or payment confirmation services), not directly by users. (Implemented via disallowing direct user updates).
        *   `DELETE`: Generally restrict or disallow. Refunds should be new transactions or status updates. (Implemented via disallowing direct user deletes).
    *   [✅] **4.1.1.4.4: [TEST-INT] Write RLS tests.** Verify that users can/cannot access/modify data according to policies.
    *   [✅] **4.1.1.4.5: [COMMIT]** "feat(RLS): Implement row-level security for tokenomics tables"

### 4.1.2: [BE] Implement Stripe Payment Gateway Adapter
*   [✅] **4.1.2.1: [BE] Design and Implement `StripePaymentAdapter`**
    *   **Location:** `supabase/functions/_shared/adapters/stripePaymentAdapter.ts`
    *   **Interface Implementation:** Implement `IPaymentGatewayAdapter` for Stripe.
    *   **Dependencies:** The adapter will require an initialized Stripe SDK instance, an admin Supabase client, an instance of `TokenWalletService`, and the Stripe webhook secret (via environment variables).
    *   **`initiatePayment(request: PurchaseRequest)` Method:**
        *   [✅] **4.1.2.1.1: [DB] [BE] Item Mapping:** Determine Stripe Price ID and `tokens_to_award` from `request.itemId`.
            *   This involves querying a local table (e.g., `stripe_plans` or `service_offerings`, synced via `sync-stripe-plans` function) that maps an internal `itemId` to a `stripe_price_id` and `tokens_awarded`.
            *   Ensure `sync-stripe-plans` function correctly populates/maintains this mapping table.
        *   [✅] **4.1.2.1.2: [BE] Target Wallet Identification:** Determine `target_wallet_id` using `TokenWalletService.getWalletForContext(request.userId, request.organizationId)`.
            *   If no wallet exists, decide on creation strategy (e.g., create on-the-fly via `TokenWalletService.createWallet` or return an error).
        *   [✅] **4.1.2.1.3: [BE] Create `payment_transactions` Record:** Insert a new record into `payment_transactions` with `status: 'PENDING'`, `target_wallet_id`, `tokens_to_award`, `payment_gateway_id: 'stripe'`, and other relevant details from `PurchaseRequest`. Store the new `payment_transactions.id` (as `internalPaymentId`).
        *   [✅] **4.1.2.1.4: [BE] Stripe Session Creation:** Refactor existing Stripe Checkout Session (or Payment Intent) creation logic.
            *   Include `internalPaymentId` in Stripe's `metadata`.
            *   Populate `success_url` and `cancel_url` with `internalPaymentId` as a query parameter for potential client-side reconciliation if needed.
        *   [✅] **4.1.2.1.5: [BE] Return `PaymentInitiationResult`:** Populate and return the standardized result object.
    *   **`handleWebhook(rawBody: string | Buffer, signature: string | undefined)` Method:**
        *   [✅] **4.1.2.1.6: [BE] Webhook Signature Verification:** Verify the Stripe webhook signature using the raw body, signature header, and webhook secret.
        *   [✅] **4.1.2.1.7: [BE] Event Processing:** Handle relevant Stripe events (e.g., `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`).
        *   [✅] **4.1.2.1.8: [BE] Retrieve `internalPaymentId`:** Extract `internalPaymentId` from webhook event metadata.
        *   [✅] **4.1.2.1.9: [BE] Update `payment_transactions` Record:**
            *   Fetch the existing `payment_transactions` record using `internalPaymentId`.
            *   Implement idempotency check (e.g., if status is already 'COMPLETED' or 'FAILED').
            *   On success event, update status to 'COMPLETED', store `gateway_transaction_id`.
            *   On failure event, update status to 'FAILED'.
        *   [✅] **4.1.2.1.10: [BE] Award Tokens on Success:** If payment successful, call `TokenWalletService.recordTransaction` to credit the `target_wallet_id` with `tokens_to_award` from the `payment_transactions` record.
            *   Use `paymentTx.user_id` as `recordedByUserId`.
            *   Use `internalPaymentId` as `relatedEntityId` and `'payment_transaction'` as `relatedEntityType`.
            *   Handle potential failures in token awarding (e.g., update `payment_transactions.status` to 'TOKEN_AWARD_FAILED').
        *   [✅] **4.1.2.1.11: [BE] Return `PaymentConfirmation`:** Populate and return the standardized result object.
    *   [✅] **4.1.2.1.12: [TEST-UNIT] Write Unit Tests for `StripePaymentAdapter`**
        *   In `supabase/functions/_shared/adapters/tests/stripePaymentAdapter.test.ts`.
        *   Mock Stripe SDK, Supabase client (`adminClient`), and `TokenWalletService`.
        *   Cover success and failure scenarios for both `initiatePayment` and `handleWebhook`, including idempotency.
*   [✅] **4.1.2.2: [COMMIT]** "feat(BE): Implement StripePaymentAdapter, abstracting Stripe logic, with tests"

### 4.1.3: [BE] Payment Initiation & Webhook Endpoints (Refactored)
*   [🚧] **4.1.3.1: [BE] Refactor/Create Central `POST /initiate-payment` Edge Function**
    *   **Path:** `supabase/functions/initiate-payment/index.ts`
    *   **Functionality:**
        *   [ ] **4.1.3.1.1: [BE] Authentication & Request Handling:** Authenticate user. Parse `PurchaseRequest` from request body.
        *   [ ] **4.1.3.1.2: [BE] Adapter Factory/Selection:** Implement a mechanism to select and instantiate the correct payment adapter based on `PurchaseRequest.paymentGatewayId` (e.g., 'stripe').
        *   [ ] **4.1.3.1.3: [BE] Adapter Instantiation:** Instantiate the selected adapter (e.g., `StripePaymentAdapter`) with its required dependencies (Stripe SDK instance, admin Supabase client, `TokenWalletService` instance, webhook secret from env).
        *   [ ] **4.1.3.1.4: [BE] Call Adapter:** Call `adapter.initiatePayment(request)`.
        *   [ ] **4.1.3.1.5: [BE] Return Response:** Return the `PaymentInitiationResult` to the client.
    *   [ ] **4.1.3.1.6: [TEST-INT] Write/Update Integration Tests for `/initiate-payment`**. Test with 'stripe' gateway.
*   [🚧] **4.1.3.2: [BE] Refactor `POST /webhooks/stripe` Edge Function**
    *   **Path:** `supabase/functions/webhooks-stripe/index.ts`
    *   **Functionality (Thin Wrapper):**
        *   [ ] **4.1.3.2.1: [BE] Adapter Instantiation:** Instantiate `StripePaymentAdapter` with its dependencies.
        *   [ ] **4.1.3.2.2: [BE] Delegate to Adapter:** Pass the raw request body and signature header to `adapter.handleWebhook(rawBody, signature)`.
        *   [ ] **4.1.3.2.3: [BE] HTTP Response:** Return appropriate HTTP status code to Stripe based on `PaymentConfirmation` result.
    *   [ ] **4.1.3.2.4: [TEST-INT] Write/Update Integration Tests for `/webhooks/stripe`**. (May require Stripe CLI for local testing).
*   [ ] **4.1.3.3: [COMMIT]** "feat(BE): Refactor payment endpoints to use Payment Gateway Adapter pattern"

### 4.1.4: [BE] Placeholder for Coinbase/Crypto Payment Gateway Adapter
*   [ ] **4.1.4.1: [BE] Create `supabase/functions/_shared/adapters/coinbasePaymentAdapter.ts` (Skeleton)**

---

## Phase 4.2: [BE] Token Consumption Logic

**Goal:** Adapt AI service usage to debit tokens from the new wallet system.

*   [ ] **4.2.1: [BE] Modify `chat` Edge Function for Wallet Debits**
    *   In `supabase/functions/chat/index.ts`:
        1.  Get `userId` and `organizationId` for context.
        2.  Instantiate `TokenWalletService`.
        3.  Call `tokenWalletService.getWalletForContext(userId, organizationId)` to get `walletId` and `currentBalance`.
        4.  Estimate `tokensRequiredForNextMessage` (using server-side `tiktoken` on user prompt, or a pre-defined cost).
        5.  If `currentBalance < tokensRequiredForNextMessage`, return 402 error "Insufficient token balance".
        6.  Proceed to call AI Provider.
        7.  On successful AI response, get `actualTokensConsumed` from provider's response (prompt + completion).
        8.  Call `tokenWalletService.recordTransaction({ walletId, type: 'DEBIT_USAGE', amount: actualTokensConsumed.toString(), relatedEntityId: newChatMessage.id, relatedEntityType: 'chat_message' })`.
        9.  If `recordTransaction` fails (e.g., rare concurrent update led to insufficient balance despite initial check), handle gracefully (log error, potentially don't show AI response or mark as failed). *This step requires careful thought on UX vs. strict accounting.*
    *   Still log `actualTokensConsumed` in `chat_messages.token_usage` for granular per-message data.
*   [ ] **4.2.2: [TEST-INT] Update `POST /chat` Integration Tests**
    *   Verify wallet balance checks before AI call.
    *   Verify wallet debits occur after successful AI call via `token_wallet_transactions` ledger.
    *   Verify error handling for insufficient funds.
*   [ ] **4.2.3: [COMMIT]** "feat(BE): Integrate AI chat with token wallet for debits"

---

## Phase 4.3: [API] [STORE] API Client & State Management for Wallets

**Goal:** Expose wallet functionalities through the API client and manage wallet state on the frontend.

*   [ ] **4.3.1: [API] Add Wallet Methods to API Client**
    *   `packages/api/src/clients/WalletApiClient.ts` (new):
        *   `getWalletInfo(organizationId?: string | null): Promise<ApiResponse<TokenWallet | null>>`
        *   `getWalletTransactionHistory(organizationId?: string | null, limit?: number, offset?: number): Promise<ApiResponse<TokenWalletTransaction[]>>`
        *   `initiateTokenPurchase(request: PurchaseRequest): Promise<ApiResponse<PaymentInitiationResult>>`
    *   [TEST-UNIT] Write unit tests for these new API client methods in `packages/api/src/tests/clients/WalletApiClient.test.ts`.
*   [ ] **4.3.2: [BE] Create Backend Endpoints for Wallet Info & History**
    *   `GET /wallet-info`: Uses `TokenWalletService.getWalletForContext`.
    *   `GET /wallet-history`: Uses `TokenWalletService.getTransactionHistory`.
    *   [TEST-INT] Write integration tests for these new endpoints (`supabase/functions/wallet-info/index.ts`, `supabase/functions/wallet-history/index.ts`).
*   [ ] **4.3.3: [STORE] Create `useWalletStore`**
    *   `packages/store/src/walletStore.ts`:
        *   State: `currentWallet: TokenWallet | null`, `transactionHistory: TokenWalletTransaction[]`, `isLoadingWallet: boolean`, `isLoadingHistory: boolean`, `isLoadingPurchase: boolean`, `walletError: Error | null`, `purchaseError: Error | null`.
        *   Actions: `loadWallet(organizationId?: string | null)`, `loadTransactionHistory(organizationId?: string | null, ...paging)`, `initiatePurchase(request: PurchaseRequest): Promise<PaymentInitiationResult | null>`.
        *   Selectors: `selectCurrentWalletBalance` (returns `currentWallet.balance` or '0'), `selectWalletTransactions`.
    *   [TEST-UNIT] Write unit tests in `packages/store/src/tests/walletStore.test.ts`.
*   [ ] **4.3.4: [COMMIT]** "feat(API|STORE|BE): Expose wallet info/history via API and manage in useWalletStore"

---

## Phase 4.4: [UI] Frontend - Wallet & Token Consumption UI

**Goal:** Implement UI for users to view their token wallet, acquire tokens, and see usage. The "budget audit" concept shifts to "wallet balance check".

### 4.4.1: [UI] Token Estimator Hook (`useTokenEstimator`)
*   [ ] **4.4.1.1: [UI] [TEST-UNIT] Define Test Cases for `useTokenEstimator` Hook**
    *   In `apps/web/src/hooks/useTokenEstimator.unit.test.ts`. Mock `tiktoken`. Test samples, empty string.
*   [ ] **4.4.1.2: [UI] Create hook `apps/web/src/hooks/useTokenEstimator.ts`**
    *   `import { getEncoding } from 'tiktoken'; const encoding = getEncoding('cl100k_base'); export const useTokenEstimator = (text: string) => React.useMemo(() => text ? encoding.encode(text).length : 0, [text]);`
*   [ ] **4.4.1.3: [UI] [TEST-UNIT] Write tests for the hook. Expect failure (RED).**
*   [ ] **4.4.1.4: [UI] Implement the hook. Run tests until pass (GREEN).**
*   [ ] **4.4.1.5: [UI] Integrate Hook into Chat Input Component (`AiChatbox.tsx` or `ChatInput.tsx`)**
    *   Use the `useTokenEstimator` hook with the current text input value.
    *   Display the estimated count near the input field (e.g., "Tokens for this message: ~{count}").
*   [ ] **4.4.1.6: [UI] [TEST-UNIT] Write/Update component tests for chat input to verify display.**
*   [ ] **4.4.1.7: [COMMIT]** "feat(UI): Implement token estimator hook and display in chat input w/ tests"

### 4.4.2: [UI] Per-Message Token Usage Display (`ChatMessageBubble.tsx`)
*   [ ] **4.4.2.1: [UI] [TEST-UNIT] Define Test Cases for `ChatMessageBubble.tsx`**
    *   Verify token count (e.g., "P:{prompt}/C:{completion}") displays only for assistant messages with `message.token_usage` data.
*   [ ] **4.4.2.2: [UI] [TEST-UNIT] Write/Update tests for `apps/web/src/components/ai/ChatMessageBubble.tsx`.**
*   [ ] **4.4.2.3: [UI] Update `ChatMessageBubble.tsx`**
  *   If `message.role === 'assistant'` and `message.token_usage` (e.g., `message.token_usage.completionTokens`, `message.token_usage.promptTokens`), display the count. Style subtly.
*   [ ] **4.4.2.4: [UI] [TEST-UNIT] Run tests. Debug until pass (GREEN).**
*   [ ] **4.4.2.5: [COMMIT]** "feat(UI): Add token usage display to assistant chat messages w/ tests"

### 4.4.3: [UI] Cumulative Session Token Usage Display (`ChatTokenUsageDisplay.tsx`)
*   [ ] **4.4.3.1: [STORE] Enhance `useAiStore` for Cumulative Session Tokens** (If not already fully covered by 4.2.3 from the previous plan)
    *   `packages/store/src/aiStore.ts`:
        *   Selector: `selectCurrentChatSessionTokenUsage: () => { userTokens: number, assistantTokens: number, totalTokens: number }`
            *   Calculates sum from `currentChatMessages`' `token_usage` fields.
    *   [TEST-UNIT] Write/verify tests in `aiStore.selectors.test.ts`.
*   [ ] **4.4.3.2: [UI] [TEST-UNIT] Define Test Cases for `ChatTokenUsageDisplay.tsx`**
    *   In `apps/web/src/components/ai/ChatTokenUsageDisplay.unit.test.tsx`.
    *   Mocks `useAiStore` with `selectCurrentChatSessionTokenUsage`.
    *   Verifies correct display of User/Assistant/Total tokens for the *current session*.
*   [ ] **4.4.3.3: [UI] [TEST-UNIT] Write tests. Expect RED.**
*   [ ] **4.4.3.4: [UI] Create component `apps/web/src/components/ai/ChatTokenUsageDisplay.tsx`**
  *   Uses `useAiStore(selectCurrentChatSessionTokenUsage)`.
  *   Displays: `Session Usage - User: {userTokens}, AI: {assistantTokens}, Total: {totalTokens}`.
*   [ ] **4.4.3.5: [UI] [TEST-UNIT] Run component tests. Debug until pass (GREEN).**
*   [ ] **4.4.3.6: [REFACTOR]** Optimize calculation if needed. Ensure clear display.
*   [ ] **4.4.3.7: [COMMIT]** "feat(UI|STORE): Create cumulative session token usage display component & selector w/ tests"

### 4.4.4: [UI] Integrate Token UI into Main Chat Page (`AiChatPage.tsx`)
*   [ ] **4.4.4.1: [UI] Update `apps/web/src/pages/AiChatPage.tsx`**
  *   Ensure token estimator is displayed near input (covered by 4.4.1.5).
  *   Integrate `ChatTokenUsageDisplay` component. Place appropriately.
  *   Trigger `token_usage_displayed` analytics event when `ChatTokenUsageDisplay` is visible and has data.
*   [ ] **4.4.4.2: [TEST-INT] Perform manual integration tests.** Send messages, verify estimator updates. Verify assistant messages show tokens. Verify cumulative display updates. Verify analytics.
*   [ ] **4.4.4.3: [COMMIT]** "feat(UI): Integrate token tracking UI components into chat page w/ manual tests & analytics"

### 4.4.5: [UI] Wallet Balance Check Hook (`useAIChatAffordabilityStatus`) & Chat Input Integration
*   [ ] **4.4.5.1: [UI] [TEST-UNIT] Define Test Cases for `useAIChatAffordabilityStatus` Hook**
    *   In `apps/web/src/hooks/useAIChatAffordabilityStatus.unit.test.ts`.
    *   Mocks `useWalletStore` (for `selectCurrentWalletBalance`).
    *   Mocks `useTokenEstimator` (or takes estimated cost as prop).
    *   Test various balance/cost scenarios.
    *   Verify correct status: `{ currentBalance: string, estimatedNextCost: number, canAffordNext: boolean, lowBalanceWarning: boolean }`.
*   [ ] **4.4.5.2: [UI] Create `apps/web/src/hooks/useAIChatAffordabilityStatus.ts` Hook**
    *   Takes `estimatedNextCost: number` as input.
    *   Gets `currentBalance` from `useWalletStore(selectCurrentWalletBalance)`.
    *   Compares. `lowBalanceWarning` if `currentBalance < estimatedNextCost * 3` (configurable threshold).
*   [ ] **4.4.5.3: [UI] [TEST-UNIT] Write tests for the hook. Debug until (GREEN).**
*   [ ] **4.4.5.4: [UI] Integrate Hook into Chat Input (`AiChatbox.tsx` or `ChatInput.tsx`)**
    *   Use `estimatedTokens = useTokenEstimator(currentInputValue)`.
    *   Use `const { canAffordNext, lowBalanceWarning } = useAIChatAffordabilityStatus(estimatedTokens);`.
    *   If `lowBalanceWarning`, display a message (e.g., "Token balance is low").
    *   If `!canAffordNext`, disable send button and show message (e.g., "Insufficient balance for this message").
*   [ ] **4.4.5.5: [UI] [TEST-UNIT] Update Chat Input component tests for these conditional UI changes.**
*   [ ] **4.4.5.6: [COMMIT]** "feat(UI): Implement AI chat affordability hook and integrate into chat input w/ tests"

### 4.4.6: [UI] Wallet Balance Display, Top-Up, and History Pages
*   [ ] **4.4.6.1: [UI] Wallet Balance Display Component (`WalletBalanceDisplay.tsx`)**
    *   Create `apps/web/src/components/wallet/WalletBalanceDisplay.tsx`.
    *   Uses `useWalletStore(selectCurrentWalletBalance)` and `state.isLoadingWallet`.
    *   Displays balance or loading/error.
    *   [TEST-UNIT] Write tests.
    *   Integrate into `UserAccountPage.tsx` and relevant Org views. On mount, call `useWalletStore.getState().loadWallet()`.
*   [ ] **4.4.6.2: [UI] Token Acquisition/Top-Up UI (`TopUpPage.tsx` or Modal)**
    *   Create `apps/web/src/pages/TopUpPage.tsx`.
    *   User selects token package (defined statically or fetched).
    *   User selects payment method (Stripe initially).
    *   Calls `useWalletStore.getState().initiatePurchase({ itemId, paymentGatewayId: 'stripe', ... })`.
    *   Handles `PaymentInitiationResult` (e.g., redirect to Stripe or use Stripe Elements).
    *   [TEST-UNIT] Write tests (mocking store action).
*   [ ] **4.4.6.3: [UI] Wallet Transaction History UI (`WalletHistoryPage.tsx`)**
    *   Create `apps/web/src/pages/WalletHistoryPage.tsx`.
    *   Uses `useWalletStore(selectWalletTransactions)` and `state.isLoadingHistory`.
    *   Calls `useWalletStore.getState().loadTransactionHistory()` on mount. Supports pagination.
    *   [TEST-UNIT] Write tests.
*   [ ] **4.4.6.4: [COMMIT]** "feat(UI): Implement wallet balance display, top-up page, and transaction history page w/ tests"

---


## Phase 4.6: End-to-End Testing, Refinement, and Security Review

**Goal:** Ensure the entire advanced tokenomics system is robust, secure, and functions correctly.

*   [ ] **4.6.1: [TEST-INT] Comprehensive E2E Testing**
    *   Test full lifecycle: User sign-up -> No AI tokens -> Top-up via Stripe -> Wallet balance updates -> Use AI services (verify debits) -> View transaction history.
    *   Test with organization wallets if applicable.
    *   Test insufficient funds scenarios during AI usage and top-up.
    *   Test Stripe webhook processing reliability and idempotency (e.g., if webhook is sent twice).
    *   Test error handling and UI feedback for payment failures.
*   [ ] **4.6.2: [REFACTOR] Code Review and Refinement**
    *   Review all new services, adapters, stores, and UI components.
    *   Focus on atomicity of ledger transactions (DB functions/service layer transactions), error handling in payment flows, and clarity of abstractions (interfaces, adapters).
*   [ ] **4.6.3: [SECURITY] Security Review**
    *   Payment initiation: CSRF protection, input validation.
    *   Webhook verification: Strict signature checking, protection against replay.
    *   RLS policies for all new tables (`token_wallets`, `token_wallet_transactions`, `payment_transactions`).
    *   Authorization for all new backend endpoints.
    *   Prevention of unauthorized balance modifications.
*   [ ] **4.6.4: [COMMIT]** "refactor: Final refinements and hardening for advanced tokenomics system"

---
