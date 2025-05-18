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

*   [✅] **4.0.A.1: [BE] [DB] Define Wallet Provisioning Triggers & Logic**
    *   [✅] **4.0.A.1.1: [BE] User Wallet Provisioning:**
        *   [✅] **Option 1 (Preferred for new users):** Modify user creation process (e.g., after Supabase `auth.users` insertion, trigger a function or use a DB trigger) to automatically call `TokenWalletService.createWallet` for the new user. (Implemented via `handle_new_user` SQL function and trigger in `20250514123855_add_wallet_to_users.sql`)
        *   [✅] **Option 2 (For existing users / fallback):** Implement logic triggered on user login (e.g., in a custom `/on-login` endpoint or session handler) to check for and create a user wallet if one doesn't exist using `TokenWalletService.getWalletForContext` and `TokenWalletService.createWallet`. (Effectively addressed by profile and wallet backfill scripts in `20250514123855_add_wallet_to_users.sql`)
        *   [✅] **Decision Point:** Choose and document the primary mechanism for user wallet creation. (Option 1 is primary; backfill handles existing.)
    *   [✅] **4.0.A.1.2: [BE] Organization Wallet Provisioning:**
        *   [✅] Define the trigger for organization wallet creation (e.g., upon organization creation via API/service, or on first relevant action requiring an org wallet). (Implemented via `handle_new_organization` SQL function and trigger in `20250514123855_add_wallet_to_users.sql`)
        *   [✅] Implement the call to `TokenWalletService.createWallet` for the new organization. (Implemented via direct SQL INSERT in `handle_new_organization` function in `20250514123855_add_wallet_to_users.sql`)
        *   [✅] **4.0.A.1.3: [DB] [BE] Idempotency:** Ensure wallet creation logic is idempotent (i.e., attempting to create a wallet that already exists does not cause errors or duplicates). `TokenWalletService.createWallet` should handle this, or the calling logic should check first. (Handled by `ON CONFLICT DO NOTHING` clauses in SQL functions and underlying unique constraints on `token_wallets` table as per migration `20250514123855_add_wallet_to_users.sql`).
*   [✅] **4.0.A.2: [BE] [TEST-UNIT] Write Unit/Integration Tests for Wallet Provisioning**
    *   Test automatic user wallet creation upon new user signup.
    *   Test user wallet creation on login for users missing a wallet. (Covered by testing backfill's effect)
    *   Test organization wallet creation.
*   [✅] **4.0.A.3: [BE] [DB] (Optional) Backfill Wallets for Existing Entities**
    *   [✅] Develop and run a script/process to create wallets for any existing users/organizations that do not currently have one. (Implemented in migration `20250514123855_add_wallet_to_users.sql`).
*   [✅] **4.0.A.4: [COMMIT]** "feat(ARCH|BE): Implement and test automatic wallet provisioning strategy"

---

## Phase 4.1: [BE] Core Wallet Service & Payment Gateway Integration

**Goal:** Implement the backend service for managing token wallets and integrate the first payment gateway (Stripe).

### 4.1.1: [BE] Core Wallet Service & Payment Gateway Integration
*   [✅] **4.1.1.1: [TEST-UNIT] Implement and Test `TokenWalletService` Methods using TDD**
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
*   [✅] **4.1.1.1a: [ARCH] [DB] [TYPES] Enhance `recorded_by_user_id` for Full Auditability**
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
    *   [✅] **4.1.1.4.3: [RLS] Define and Apply RLS for `payment_transactions`**
        *   `SELECT`: Users can select their own payment transactions (`user_id = auth.uid()`) or payments related to organizations they manage. (User part implemented. Org part is missing).
        *   [✅] **Sub-task: Implement SELECT RLS for organization-managed `payment_transactions`.**
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
        *   Cover success and failure scenarios for both `initiatePayment` (with its refactored, simpler signature and responsibilities) and `handleWebhook`, including idempotency.
*   [✅] **4.1.2.2: [COMMIT]** "feat(BE): Implement StripePaymentAdapter, abstracting Stripe logic, with tests"

*   [✅] **4.1.2.A: [BE] [REFACTOR] Refine `StripePaymentAdapter` for Dynamic Checkout Mode and Correct Data Sourcing**
    *   **Goal:** Ensure the `StripePaymentAdapter` correctly handles different product types (one-time vs. subscription) by dynamically setting the Stripe Checkout mode and properly sourcing Stripe-specific identifiers. This corrects oversights in the initial implementation (4.1.2.1).
    *   **`initiatePayment(context: PaymentOrchestrationContext)` Method Refinements:**
        *   [✅] **4.1.2.A.1: [BE] Gateway-Specific Item Interpretation (Adapter Responsibility):**
            *   Adapter receives the generic `PaymentOrchestrationContext` (containing `itemId`, `quantity`, `internalPaymentId`, `userId`, `amountForGateway`, `currencyForGateway`, etc.).
            *   Adapter uses `context.itemId` to query the `subscription_plans` table (using its own admin Supabase client) to fetch Stripe-specific details:
                *   `stripe_price_id`
                *   `plan_type`
            *   If `stripe_price_id` or necessary `plan_type` is not found for the `itemId`, return an appropriate error in `PaymentInitiationResult`.
        *   [✅] **4.1.2.A.2: [BE] Dynamic Stripe Session Creation:**
            *   Construct `Stripe.Checkout.SessionCreateParams`.
            *   Set `mode` dynamically based on the `plan_type` fetched from `subscription_plans` (e.g., map 'one_time' to 'payment', 'recurring' to 'subscription').
            *   Use the fetched `stripe_price_id` for `line_items`.
            *   Use `context.quantity`.
            *   Use `context.internalPaymentId` for Stripe's `metadata.internal_payment_id`.
            *   Use `context.userId` for `client_reference_id`.
            *   Populate `success_url` and `cancel_url`.
        *   [✅] **4.1.2.A.3: [BE] Return `PaymentInitiationResult`:** (As before)
    *   [✅] **4.1.2.A.4: [TEST-UNIT] Update/Add Unit Tests for `StripePaymentAdapter` Refinements**
        *   Verify the adapter correctly queries `subscription_plans` for `stripe_price_id` and `plan_type`.
        *   Verify dynamic `mode` setting based on `plan_type`.
        *   Cover scenarios for both 'payment' and 'subscription' modes.
    *   [✅] **4.1.2.A.5: [COMMIT]** "refactor(BE): Refine StripePaymentAdapter for dynamic mode and correct data sourcing"

### 4.1.3: [BE] Payment Initiation & Webhook Endpoints (Refactored)
*   [✅] **4.1.3.1: [BE] Refactor/Create Central `POST /initiate-payment` Edge Function**
    *   **Path:** `supabase/functions/initiate-payment/index.ts`
    *   **Functionality (Orchestrator Role - Ensure this reflects generic behavior):**
        *   [✅] **4.1.3.1.1: [BE] Authentication & Request Handling:** (As before)
        *   [✅] **4.1.3.1.1a: [BE] Generic Item Details Extraction:** From `PurchaseRequest.itemId`, orchestrator determines generic item details like `tokens_to_award`, monetary value (`amountForGateway`), and `currencyForGateway` by querying `subscription_plans`. **The orchestrator does NOT fetch or pass adapter-specific fields like `stripe_price_id` or `plan_type` into the generic context.**
        *   [✅] **4.1.3.1.1b: [BE] Target Wallet Identification:** (As before)
        *   [✅] **4.1.3.1.1c: [BE] Create `payment_transactions` Record:** (As before, using generic data)
        *   [✅] **4.1.3.1.2: [BE] Adapter Factory/Selection:** (As before)
        *   [✅] **4.1.3.1.3: [BE] Adapter Instantiation:** (As before)
        *   [✅] **4.1.3.1.4: [BE] Call Adapter:** Call `adapter.initiatePayment(paymentOrchestrationContext)`. The `paymentOrchestrationContext` is **generic** and includes `itemId`, `quantity`, `userId`, `metadata`, `internalPaymentId`, `target_wallet_id`, `tokens_to_award`, `amountForGateway`, `currencyForGateway`. The adapter uses this generic `itemId` to resolve its own specific needs (like Stripe Price ID or mode).
        *   [✅] **4.1.3.1.5: [BE] Return Response:** (As before)
    *   [✅] **4.1.3.1.6: [TEST-INT] Write/Update Integration Tests for `/initiate-payment`**.
        *   Ensure tests verify the orchestration logic passes a purely **generic** `PaymentOrchestrationContext` to the adapter.
*   [🚧] **4.1.3.2: [BE] [ARCH] Implement Generic Webhook Router at `/webhooks/{source}` & Integrate Stripe**
    *   **Goal:** Create a single Edge Function at `/webhooks/` that acts as a router. It will use a path segment (e.g., `/webhooks/stripe`, `/webhooks/coinbase`) to identify the webhook source, fetch the appropriate payment gateway adapter, and delegate handling.
    *   **Sub-Tasks:**
        *   [✅] **4.1.3.2.1: [ARCH] Design Generic Webhook Router Function at `/webhooks/`**
            *   The function will be deployed to handle requests to `supabase/functions/webhooks/index.ts`.
            *   It will parse the URL to extract the `{source}` (e.g., 'stripe', 'coinbase') from `/webhooks/{source}`.
            *   It will read the raw request body and relevant signature headers.
        *   [✅] **4.1.3.2.2: [TEST-INT] Define and Write Failing Integration Tests for Generic Webhook Router (RED)**
            *   Test routing `/webhooks/nonexistent-source` (expect 404 or 400).
            *   Test routing `/webhooks/stripe` (expect mock `StripePaymentAdapter.handleWebhook` to be called with correct parameters).
            *   (Optional) Test routing `/webhooks/coinbase` (expect mock `CoinbasePaymentAdapter.handleWebhook` to be called if a skeleton adapter exists).
        *   [✅] **4.1.3.2.3: [BE] [DI] Utilize/Adapt Adapter Factory for Webhooks**
            *   Ensure `getPaymentAdapter` (or a similar factory, potentially in `_shared/adapters/adapterFactory.ts`) can provide the router with the correct `IPaymentGatewayAdapter` instance based on the `{source}`.
            *   The factory should ensure the adapter is instantiated with all necessary dependencies (e.g., admin Supabase client, `TokenWalletService`, and its specific `webhookSecret`).
        *   [✅] **4.1.3.2.4: [TYPES] Verify `IPaymentGatewayAdapter.handleWebhook` Interface Signature**
            *   Confirm the existing signature: `handleWebhook(rawBody: string | Uint8Array, signature: string | undefined): Promise<PaymentConfirmation>;` The adapter holds its own webhook secret, so the router doesn't pass it.
        *   [✅] **4.1.3.2.5: [BE] Implement Generic Webhook Router Logic at `supabase/functions/webhooks/index.ts` (GREEN)**
            *   Implement the router to:
                *   Parse `{source}` from the path.
                *   Get the adapter using the factory.
                *   Pass the raw body and signature (extracted by the router) to `adapter.handleWebhook()`.
                *   Translate the `PaymentConfirmation` result from the adapter into an appropriate HTTP response.
        *   [✅] **4.1.3.2.6: [REFACTOR] Refactor Router and Associated Tests.**
        *   [✅] **4.1.3.2.7: [TEST-INT] Ensure Stripe Webhook Processing via `/webhooks/stripe` Passes Tests.**
            *   Run integration tests targeting the new `/webhooks/` function with a `/stripe` path segment.
        *   [🚧] **4.1.3.2.8: [BE] [REFACTOR] Enhance `StripePaymentAdapter` to Handle All Critical Stripe Webhook Events (Persistent Tokens)**
            *   **Goal:** Ensure the `StripePaymentAdapter`, when invoked by the generic `/webhooks/stripe` router, correctly processes all necessary Stripe events for payments, token awards, subscription lifecycle management, and product/price synchronization, replicating and improving upon the logic from the old `stripe-webhook` function. **All tokens awarded are persistent and do not expire.**
            *   [✅] **4.1.3.2.8.A: [REFACTOR] Internal `StripePaymentAdapter` Refactor for Separation of Concerns (SoC)**
                *   **Goal:** Improve maintainability and testability of `StripePaymentAdapter.ts` by breaking it down into smaller, focused modules.
                *   [✅] **4.1.3.2.8.A.1: [BE] Create Directory Structure:**
                    *   Confirm/create `supabase/functions/_shared/adapters/stripe/`.
                    *   Confirm/create `supabase/functions/_shared/adapters/stripe/handlers/`.
                    *   Confirm/create `supabase/functions/_shared/adapters/stripe/utils/` (for helpers like `updatePaymentTransaction`).
                *   [✅] **4.1.3.2.8.A.2: [BE] Externalize `_updatePaymentTransaction` Helper:**
                    *   Move logic from `_updatePaymentTransaction` into `supabase/functions/_shared/adapters/stripe/utils/updatePaymentTransaction.ts`.
                    *   Ensure it takes necessary context (Supabase client, logger) as parameters.
                    *   Update `StripePaymentAdapter` to use this utility if it was calling its own private method.
                *   [✅] **4.1.3.2.8.A.3: [BE] Define `HandlerContext` Type:**
                    *   Create a type (e.g., in `supabase/functions/_shared/adapters/stripe/stripeTypes.ts` or similar) for `HandlerContext` that includes `stripe`, `supabaseClient`, `log`, `tokenWalletService`, the `updatePaymentTransaction` utility function, etc.
                *   [✅] **4.1.3.2.8.A.4: [BE] Externalize Individual Event Handler Logic (Iterative):**
                    *   For each private `_handle...` method in `stripePaymentAdapter.ts` (e.g., `_handleCheckoutSessionCompleted`, `_handleInvoicePaymentSucceeded`, etc.):
                        *   Move its core logic to a new, corresponding file in `supabase/functions/_shared/adapters/stripe/handlers/` (e.g., `handleCheckoutSessionCompleted.ts`).
                        *   The new file will export a function that accepts the `HandlerContext`, the Stripe `Event`, and the specific event `data.object`.
                        *   Update the main `stripePaymentAdapter.ts` to import and call these new handler functions from its `handleWebhook` switch statement, passing the `HandlerContext` and event details.
                *   [✅] **4.1.3.2.8.A.5: [TEST-UNIT] Write Unit Test for `updatePaymentTransaction` Utility.**
                *   [✅] **4.1.3.2.8.A.6: [COMMIT]** "refactor(BE): Restructure StripePaymentAdapter for SoC, externalizing handlers and utils"
            *   [✅] **4.1.3.2.8.1: [ANALYZE] Finalize Review of `stripe-webhook/handlers/` and `stripe-webhook/services/`**
                *   Complete review of `product.ts`, `price.ts` handlers, and associated services (`product_webhook_service.ts`, `price_webhook_service.ts`).
                *   Consolidate all identified logic and database interactions for porting.
            *   [✅] **4.1.3.2.8.2: [DB] [TYPES] Define and Confirm Target Supabase Table Strategy**
                *   **`payment_transactions`:** Confirm as the primary log for all payment attempts and their outcomes (both one-time and subscription-initial). Ensure it captures sufficient detail for auditing token awards.
                *   **`user_subscriptions`:** Confirm existence and schema. This table is critical for storing `user_id`, `stripe_customer_id`, `stripe_subscription_id`, current `status` (e.g., active, past_due, canceled), `plan_id` (FK to `subscription_plans`), `current_period_start`, `current_period_end`, `cancel_at_period_end`.
                *   **`subscription_plans`:** Confirm as the SOLE target for product/price data synced from Stripe (via webhooks). It should store `stripe_product_id`, `stripe_price_id`, `name`, `description`, `amount`, `currency`, `interval`, `active`, `tokens_awarded` (if applicable to the plan itself), `plan_type` (one-time, subscription), `item_id_internal`.
                *   **`users` (or `user_profiles`):** Confirm if a user `status` or `role` field needs to be updated based on subscription active/inactive status (e.g., 'free_user', 'subscriber_basic', 'subscriber_premium').
                *   **Retire `subscription_transactions`?** Evaluate if the old `subscription_transactions` table can be retired, with its essential logging purposes absorbed by `payment_transactions` (for payments) and detailed adapter logging for other event types.
            *   [✅] **4.1.3.2.8.3: [BE] [REFACTOR] Implement Comprehensive `checkout.session.completed` Handling in `StripePaymentAdapter`**
                *   [✅]   [TEST-UNIT] Add unit tests covering both one-time and subscription scenarios, including token awards and user/subscription table updates.
                *   [✅]   Tests go in supabase/functions/_shared/adapters/stripe.checkoutSessionCompleted.test.ts and stripe.checkoutSessionErrors.test.ts
                *   [✅] **Distinguish Mode:** If `session.mode === 'payment'` (one-time purchase, e.g., token pack):
                    *   [✅] Update `payment_transactions` status to 'COMPLETED'.
                    *   [✅] Award tokens via `TokenWalletService`, linking to `payment_transactions.id`.
                *   [✅] If `session.mode === 'subscription'` (new subscription): 
                    *   [✅] Create/Update `user_subscriptions` record with details from Stripe Session and retrieved Stripe Subscription object (plan, status, period dates, Stripe IDs).
                    *   [✅] Update user status/role in `users` or `user_profiles` table if applicable.
                    *   [✅] Update `payment_transactions` for the initial payment.
                    *   [✅] Award tokens associated with the subscription plan's initiation via `TokenWalletService`.
                *   [✅] Ensure idempotency and robust error handling.
            *   [✅] **4.1.3.2.8.4: [BE] [REFACTOR] Implement Subscription Lifecycle Event Handling (`customer.subscription.updated`, `customer.subscription.deleted`) in `StripePaymentAdapter`**
                *   [✅]   [TEST-UNIT] Add unit tests for various subscription update/deletion scenarios.
                *   [✅]   Tests go in supabase/functions/_shared/adapters/stripe.subscriptionUpdated.test.ts and stripe.subscriptionDeleted.test.ts
                *   `customer.subscription.updated`:
                    *   Update the corresponding record in `user_subscriptions` (status, plan, period dates, `cancel_at_period_end`).
                    *   Update user status/role if necessary.
                    *   Handle plan changes (upgrades/downgrades) if applicable.
                *   `customer.subscription.deleted` (or `status: 'canceled'` within an update event):
                    *   Update `user_subscriptions.status` to 'canceled'.
                    *   Update user status/role if necessary.
                *   Ensure idempotency.
            *   [✅] **4.1.3.2.8.5: [BE] [REFACTOR] Implement Invoice Event Handling (`invoice.payment_succeeded`, `invoice.payment_failed`) in `StripePaymentAdapter`**
                *   [✅]   [TEST-UNIT] Add unit tests for invoice payment success (including token award) and failure.
                *   [✅]   Tests go in supabase/functions/_shared/adapters/stripe.invoicePaymentFailed.test.ts and stripe.invoicePaymentSucceeded.test.ts
                *   `invoice.payment_succeeded`:
                    *   Primarily for recurring subscription payments.
                    *   Verify `user_subscriptions` record is active and period dates align.
                    *   Log the successful recurring payment (e.g., could be a new entry in `payment_transactions` with a type like 'RENEWAL', or update an existing one if applicable).
                    *   **Credit the user's wallet with the full token amount defined by the renewed subscription plan using `TokenWalletService`.** (Tokens are persistent).
                *   `invoice.payment_failed`:
                    *   Update `user_subscriptions.status` to 'past_due' or 'unpaid'.
                    *   Update user status/role if necessary (e.g., downgrade access).
                *   Ensure idempotency.
            *   [✅] **4.1.3.2.8.6: [BE] [REFACTOR] Implement Product & Price Synchronization (`product.*`, `price.*`) in `StripePaymentAdapter`**
                *   [✅]   [TEST-UNIT] Add unit tests for product/price create, update, and delete scenarios and their effect on `subscription_plans`.
                *   [✅]   Tests go in supabase/functions/_shared/adapters/stripe.priceCreated.test.ts, stripe.priceUpdated.test.ts, and stripe.priceDeleted.test.ts, stripe.productCreated.test.ts, stripe.productUpdated.test.ts, and stripe.productDeleted.test.ts
            *   [✅] **4.1.3.2.8.7: [BE] [REFACTOR] Implement Product & Price Synchronization (`product.*`, `price.*`) in `StripePaymentAdapter`**
                *   Move each major function into its own file
                *   Break down test into a test for each file                 
            *   [🚧] **4.1.3.2.8.8: [BE] [TEST-INT] Comprehensive Integration Testing for All Handled Event Types**
                *   Expand tests for `webhooks/index.test.ts` to simulate all Stripe events now handled by `StripePaymentAdapter`.
                *   Verify correct processing flow, database updates (all relevant tables), and token awards.
                *   Test idempotency thoroughly for each event type.
                *   Currently a few failing tests but most pass 
            *   [ ] **4.1.3.2.8.9: [COMMIT]** "refactor(BE|TEST): Enhance StripePaymentAdapter for comprehensive webhook event handling (payments, subscriptions, products, prices, tokens)"
    *   [🚧] **4.1.3.2.9: [BE] Decommission Old `stripe-webhook/index.ts` Function**
        *   [✅] **4.1.3.2.9.1: [INFRA] Update Stripe Dashboard Webhook URL** (Point to new generic `/webhooks/stripe` - User confirmed for Sandbox)
        *   [🚧] **4.1.3.2.9.2: [TEST-SETUP] Install/Configure Stripe CLI and Start Webhook Listening**
            *   [✅] Ensure Stripe CLI is installed.
            *   [✅] Run `stripe login` if first time (User confirmed completed).
            *   [✅] Execute `stripe listen --forward-to http://localhost:54321/functions/v1/webhooks/stripe` (User confirmed running, secret `whsec_bcf8937105a230e3d33714dbbd66430260ee31c3da7b2337288a0860058cebd5` obtained and confirmed by logs).
            *   [✅] Note the `whsec_...` signing secret provided by `stripe listen`.
            *   [✅] Update local environment (e.g., `.env` file used by `supabase start` or Supabase local dev Vault) with this `whsec_...` for `STRIPE_WEBHOOK_SIGNING_SECRET_TEST` (used by adapter) and `STRIPE_WEBHOOK_SIGNING_SECRET` (potentially for other direct uses, though adapter uses _TEST). Restart Supabase local dev server if needed. (User confirmed `STRIPE_WEBHOOK_SIGNING_SECRET_TEST` is correctly set and used).
        *   [🚧] **4.1.3.2.9.3: [TEST-INT] Trigger and Verify Stripe Test Events via CLI**
            *   For each of the critical event types your `StripePaymentAdapter` handles:
                *   `checkout.session.completed` (mode: payment) - [🚧] Partially working. CLI fixture interaction complex. Able to trigger default and minimal override. `internal_payment_id` handling fixed.
                *   `checkout.session.completed` (mode: subscription) - [🚧] CLI error: `The price specified is a one-time price, but mode is subscription.` Needs a confirmed recurring Price ID.
                *   `invoice.payment_succeeded` - [🚧] CLI error `resource_missing` for `subscription`. Needs a valid existing subscription.
                *   `invoice.payment_failed` - [🚧] CLI error `resource_missing` for `subscription`. Needs a valid existing subscription.
                *   `customer.subscription.updated` - [🚧] CLI error `resource_missing` for `id`. Needs a valid existing subscription ID.
                *   `customer.subscription.deleted` - [🚧] CLI error `resource_missing` for `id`. Needs a valid existing subscription ID.
                *   `product.created`, `product.updated`, `product.deleted` - [✅] Working with default fixtures.
                *   `price.created`, `price.updated`, `price.deleted` - [✅] Working with default fixtures.
            *   [🚧] **Sub-task (for each event type listed above, focusing on [🚧] items):**
                *   [❓] Identify/Create necessary test data in Stripe Sandbox (Customer IDs, Recurring Price IDs, Product IDs, Subscription IDs, etc.) **OR** develop a strategy to manage/clean up Stripe objects created by CLI fixtures to allow for repeatable tests.
                *   [🚧] Construct the `stripe trigger <event_name> ...` command with appropriate test data. PowerShell script (`trigger_stripe_test_events.ps1`) exists and has been iteratively refined. Focus on providing correct, existing Stripe object IDs for overrides where the default fixture is insufficient.
                *   [✅] Execute the command. (Process established).
                *   [✅] **Observe Stripe CLI `listen` output:** Confirm event is forwarded and a `2xx` response is received from your local endpoint. (Process established).
                *   [✅] **Observe Supabase function logs:** Check for any errors and verify expected log messages from your `StripePaymentAdapter` and its handlers. (Process established, logging added).
                *   [🚧] **Verify database state:** Query relevant tables (`payment_transactions`, `token_wallets`, `token_wallet_transactions`, `user_subscriptions`, `subscription_plans`) to ensure records were created/updated correctly. (Partially verified for working events).
                *   [🚧] **Verify token awards:** Ensure `TokenWalletService.recordTransaction` was called correctly and tokens were awarded for relevant events. (Partially verified for working events).
        *   [ ] **4.1.3.2.9.4: [MONITOR] (Placeholder for Production) Monitor New `/webhooks/stripe` Endpoint for all event types.** (Once deployed, you'd monitor this in Supabase logs and Stripe Dashboard).
        *   [✅] **4.1.3.2.9.5: [BE] Delete `supabase/functions/stripe-webhook/` Directory** (After successful local testing and confident porting)
        *   [ ] **4.1.3.2.9.6: [DOCS] Update Internal Documentation** (Reflect new webhook structure and testing procedures, especially regarding Stripe CLI fixture management).
        *   [ ] **4.1.3.2.9.7: [COMMIT]** "feat(BE|INFRA|TEST): Decommission old stripe-webhook, test new router with Stripe CLI"
    *   [ ] **4.1.3.2.10: [BE] Decommission `sync-stripe-plans/index.ts` Function**
        *   [ ] **4.1.3.2.10.1: [ANALYZE] Confirm `sync-stripe-plans` No Longer Needed** (Ensure real-time webhook handling for products/prices is sufficient and no other process relies on the batch sync).
        *   [✅] **4.1.3.2.10.2: [BE] Delete `supabase/functions/sync-stripe-plans/` Directory**
        *   [ ] **4.1.3.2.10.3: [DOCS] Remove any documentation or scheduled triggers for `sync-stripe-plans`.**
        *   [ ] **4.1.3.2.10.4: [COMMIT]** "refactor(BE): Decommission sync-stripe-plans function, replaced by real-time webhook sync"
    *   [ ] **4.1.3.2.11: [BE] [ARCH] Implement Universal Periodic Token Allocation System**
        *   **Goal:** Periodically grant a base number of tokens to all eligible users (e.g., free tier users, or all users as a baseline).
        *   [ ] **4.1.3.2.11.1: [ARCH] Define Allocation Rules & Schedule**
            *   Determine token amount, frequency (e.g., monthly, weekly), and eligibility criteria (e.g., all active users, users on a specific 'free' plan type).
        *   [ ] **4.1.3.2.11.2: [DB] [TYPES] User Plan/Tier Tracking (If Needed)**
            *   If allocation depends on user tier (e.g. 'free' vs 'paid'), ensure `users` or `user_subscriptions` table can identify this tier.
        *   [ ] **4.1.3.2.11.3: [BE] Create Scheduled Edge Function (`/allocate-periodic-tokens`)**
            *   This function will query eligible users.
            *   For each eligible user, it will use `TokenWalletService.recordTransaction` to credit their wallet with the defined token amount.
            *   Type could be `CREDIT_PERIODIC_ALLOCATION` or similar.
            *   Ensure idempotency for the allocation period (e.g., a user doesn't get tokens twice for the same month if the function reruns).
        *   [ ] **4.1.3.2.11.4: [TEST-UNIT] Unit Test the Allocation Logic**
            *   Mock `TokenWalletService` and user data sources.
            *   Verify correct users are selected and correct token amounts are calculated for credit.
        *   [ ] **4.1.3.2.11.5: [INFRA] Schedule the Function (e.g., using Supabase Cron Jobs)**
        *   [ ] **4.1.3.2.11.6: [COMMIT]** "feat(BE|ARCH): Implement universal periodic token allocation system"
*   [✅] **4.1.3.A: [BE] [TEST-UNIT] Unit Test Payment Adapter Factory (`adapterFactory.ts`)**
    *   [✅] **Goal:** Ensure the `getPaymentAdapter` function in `_shared/adapters/adapterFactory.ts` correctly instantiates and returns the appropriate payment gateway adapters with their necessary dependencies.
    *   [✅] **4.1.3.A.1: [TEST-UNIT] Define Test Cases for `adapterFactory.getPaymentAdapter`**
        *   Mock adapter constructors (e.g., `StripePaymentAdapter`).
        *   Mock services passed to adapters (e.g., `TokenWalletService`, `createSupabaseAdminClient`).
        *   Mock `Deno.env.get` for environment variables (e.g., webhook secrets).
        *   Verify correct adapter instantiation for 'stripe' (with correct dependencies: admin client, token wallet service, Stripe webhook secret).
        *   Verify `null` or error for 'unknown-source'.
        *   (Future) Verify correct adapter instantiation for 'coinbase' if added.
    *   [✅] **4.1.3.A.2: [TEST-UNIT] Create Test File: `supabase/functions/_shared/adapters/tests/adapterFactory.test.ts`**
    *   [✅] **4.1.3.A.3: [TEST-UNIT] Write Failing Tests for `getPaymentAdapter` (RED)**
    *   [✅] **4.1.3.A.4: [BE] Implement/Update `adapterFactory.getPaymentAdapter` to use the Real `StripePaymentAdapter` (GREEN)`
        *   `Ensure `getPaymentAdapter` for source 'stripe' imports and instantiates the functional `StripePaymentAdapter` (from `_shared/adapters/stripePaymentAdapter.ts`).`
        *   `This includes fetching the Stripe webhook secret (e.g., from Deno.env.get) and passing it, along with `adminClient` and `tokenWalletService`, to the `StripePaymentAdapter` constructor.`
        *   `Ensure it robustly handles other sources (returning null) and that all test cases defined in 4.1.3.A.1 now pass.`
    *   [✅] **4.1.3.A.5: [TEST-UNIT] Run `adapterFactory` Tests until GREEN.**
    *   [✅] **4.1.3.A.6: [REFACTOR] Refactor `adapterFactory.ts` and its Tests for Clarity and Robustness.**
    *   [✅] **4.1.3.A.7: [COMMIT]** "feat(BE|TEST): Implement, test, and refine Payment Adapter Factory (`adapterFactory.ts`)"

### 4.1.4: [BE] Placeholder for Coinbase/Crypto Payment Gateway Adapter
*   [ ] **4.1.4.1: [BE] Create `supabase/functions/_shared/adapters/coinbasePaymentAdapter.ts` (Skeleton)**

---

**Phase 4.5: [API-STORE-UI-BE] Enhanced AI Chat Context Management**

**Goal:** Provide users with granular control over the chat messages included in the context sent to the AI, and ensure accurate token accounting for this dynamic context. This allows users to curate the conversation history, potentially improving AI responses and managing token consumption effectively.

---

**4.5.1: [UI|STORE] Implement Chat Message Selection UI and State**

**Goal:** Develop the frontend components and state management for selecting/deselecting chat messages for context.

*   [✅] **4.5.1.1: [STORE] Enhance `useAiStore` for Message Selection State**
    *   [✅] **4.5.1.1.1: [STORE] [TEST-UNIT] Define Test Cases for `useAiStore` Message Selection**
        *   [✅] Test an action to toggle the selection state for a single message ID.
        *   [✅] Test actions for "select all" currently visible/loaded messages and "deselect all" currently visible/loaded messages.
        *   [✅] Test action to clear all selections for a chat.
        *   [✅] Test a selector that returns an array of all currently selected `ChatMessage` objects.
        *   [✅] Test that newly added/streamed messages are selected by default. (Covered for _addOptimisticUserMessage)
        *   [✅] Test that messages from `sendMessage` (new user message, assistant response) are selected by default.
        *   [✅] Test that messages loaded via `loadChatDetails` are selected by default.
        *   [✅] Test that `startNewChat` correctly initializes/clears selections for the new chat context.
    *   [✅] **4.5.1.1.2: [STORE] [TEST-UNIT] Write Failing Tests for `useAiStore` Message Selection (RED)** (All interactions: core actions, _addOptimisticUserMessage, `sendMessage`, `loadChatDetails`, `startNewChat`, and selectSelectedChatMessages selector are now covered with tests)
    *   [✅] **4.5.1.1.3: [STORE] Implement `useAiStore` Enhancements**
        *   [N/A] ~~Modify your `ChatMessage` type or implement a selection map.~~ (Decision: `selectedMessagesMap` in store is sufficient)
        *   [✅] Add actions: `toggleMessageSelection(messageId: string): void`, `selectAllMessages(): void`, `deselectAllMessages(): void`, `clearMessageSelections(chatId: string): void`.
        *   [✅] Modify existing actions (`_addOptimisticUserMessage`, `sendMessage` success, `loadChatDetails`, `startNewChat`) to ensure new messages default to selected (`true` in `selectedMessagesMap`).
        *   [✅] Implement selector `selectSelectedChatMessages: ChatMessage[]`.
    *   [✅] **4.5.1.1.4: [STORE] [TEST-UNIT] Ensure All Tests Pass for `useAiStore` Message Selection (GREEN)**
    *   [✅] **4.5.1.1.5: [STORE] Refactor and Cleanup `useAiStore` Message Selection Logic** (As needed after tests pass)
*   [🚧] **4.5.1.2: [UI] Update Chat Message Display for Selection (`ChatMessageBubble.tsx` or equivalent)**
    *   [✅] **4.5.1.2.1: [UI] [TEST-UNIT] Define Test Cases for Selection UI in `ChatMessageBubble.test.tsx`**
        *   [✅] Test for the presence of a checkbox for selection.
        *   [✅] Test that checkbox state reflects `selectedMessagesMap` from `useAiStore`.
        *   [✅] Test that clicking checkbox calls `toggleMessageSelection` action.
        *   [✅] Test for new layout of checkbox and edit button (outside the bubble, stacked column for user, right-aligned for AI).
        *   [✅] Test edit button remains functional for user messages and absent for AI messages.
    *   [✅] **4.5.1.2.2: [UI] [TEST-UNIT] Write Failing Tests for Selection UI (RED)** (Ensure tests from 4.5.1.2.1 actually fail before implementation)
    *   [✅] **4.5.1.2.3: [UI] Implement Selection UI in `ChatMessageBubble.tsx`**
        *   [✅] Add a checkbox (e.g., from ShadCN/ui or custom) to `ChatMessageBubble.tsx`.
        *   [✅] Connect checkbox to `useAiStore`'s `selectedMessagesMap` and `toggleMessageSelection` action.
        *   [✅] Reposition checkbox and edit button: 
            *   For user messages: Checkbox and Edit button stacked vertically to the left of the bubble.
            *   For AI messages: Checkbox to the right of the bubble. No edit button.
        *   [✅] Ensure `is_active_in_thread` still controls overall visibility/styling if applicable.
    *   [✅] **4.5.1.2.4: [UI] [TEST-UNIT] Ensure All Tests Pass for Selection UI (GREEN)**
    *   [✅] **4.5.1.2.5: [UI] Refactor and Cleanup Selection UI in `ChatMessageBubble.tsx`**
*   [🚧] **4.5.1.3: [UI] Implement "Select All" / "Deselect All" Controls (`MessageSelectionControls.tsx` integrated into `AiChatbox.tsx`)**
    *   [✅] **4.5.1.3.1: [UI] [TEST-UNIT] Define Test Cases for "Select All" / "Deselect All" (in `apps/web/src/components/ai/MessageSelectionControls.test.tsx`)**
        *   [✅] Test that a "Select All" button is rendered.
        *   [✅] Test that a "Deselect All" button is rendered.
        *   [✅] Test that clicking the "Select All" button calls the `selectAllMessages` action from `useAiStore`.
        *   [✅] Test that clicking the "Deselect All" button calls the `deselectAllMessages` action from `useAiStore`.
        *   [✅] (Future consideration: Test button states if/when they become conditional, e.g., disabled if no messages or all already selected/deselected).
    *   [✅] **4.5.1.3.2: [UI] [TEST-UNIT] Write Failing Tests (RED) for `MessageSelectionControls.tsx`**
    *   [✅] **4.5.1.3.3: [UI] Implement UI Component `MessageSelectionControls.tsx`**
    *   [✅] **4.5.1.3.4: [UI] [TEST-UNIT] Ensure All Tests Pass (GREEN) for `MessageSelectionControls.tsx`**
    *   [✅] **4.5.1.3.5: [UI] Refactor and Cleanup `MessageSelectionControls.tsx`**
    *   [✅] **4.5.1.3.6: [UI] Integrate `MessageSelectionControls` into `AiChatbox.tsx` (or `ChatInput.tsx`)**
    *   [✅] **4.5.1.3.7: [UI] [TEST-UNIT] Update `AiChatbox.test.tsx` to verify `MessageSelectionControls` is rendered.**

---

**4.5.2: [UI|API|BE] Adapt Token Accounting and Context Passing**

**Goal:** Ensure token estimation and the context sent to the AI accurately reflect the user's message selections. The backend must process this curated context, including any overarching system prompt.

*   [🚧] **4.5.2.1: [UI|STORE] Update Token Estimator (`useTokenEstimator`) and Affordability Hook (`useAIChatAffordabilityStatus`)**
    *   [ ] **4.5.2.1.1: [UI] [TEST-UNIT] Define Test Cases for `useTokenEstimator` with Selected Context**
        *   Test that the estimator correctly calculates token counts based on the current user input text PLUS the content of all messages returned by `useAiStore(selectSelectedChatMessages)`.
        *   Test that the estimated token count updates dynamically when messages are selected or deselected via `useAiStore` actions.
    *   [ ] **4.5.2.1.2: [UI] [TEST-UNIT] Write Failing Tests for `useTokenEstimator` (RED)**
    *   [ ] **4.5.2.1.3: [UI] Modify `apps/web/src/hooks/useTokenEstimator.ts`**
        *   The hook should now subscribe to `useAiStore(selectSelectedChatMessages)`.
        *   It needs to iterate through these selected messages, concatenate their textual content with the current input field's text, and then calculate the total token count.
    *   [ ] **4.5.2.1.4: [UI] [TEST-UNIT] Run `useTokenEstimator` Tests until GREEN.**
    *   [ ] **4.5.2.1.5: [UI] [TEST-UNIT] Review and Update Tests for `useAIChatAffordabilityStatus`**
        *   Ensure tests for `useAIChatAffordabilityStatus.unit.test.ts` are still valid or update them to reflect that `useTokenEstimator` now provides the total estimated cost including the selected context. The hook itself might not need changes if `useTokenEstimator`'s output remains its input.
    *   [ ] **4.5.2.1.6: [REFACTOR] Refactor `useTokenEstimator` and its tests. Review `useAIChatAffordabilityStatus` for any indirect impacts.**
    *   [ ] **4.5.2.1.7: [COMMIT]** "feat(UI|STORE): Update token estimator for dynamic chat context selection"

*   [ ] **4.5.2.2: [API] Modify API Client for Context Passing**
    *   [ ] **4.5.2.2.1: [API] [TEST-UNIT] Define Test Cases for the Chat API Method (e.g., in `AiApiClient.ts`)**
        *   Test that the primary chat method (e.g., `streamedChatRequest` or similar) now accepts an array of `ChatMessage` objects (or a simplified version like `{ role: string, content: string }[]`) representing the selected context.
        *   Test that the HTTP request payload sent to the backend correctly includes this array of context messages.
    *   [ ] **4.5.2.2.2: [API] [TEST-UNIT] Write Failing Tests for API Client Chat Method (RED)**
    *   [ ] **4.5.2.2.3: [API] Update `packages/api/src/clients/AiApiClient.ts` (or the relevant API client file)**
        *   Modify the signature of the chat method to accept the array of selected `ChatMessage` objects.
        *   Ensure this array is properly formatted and included in the request body sent to the `/chat` backend endpoint.
    *   [ ] **4.5.2.2.4: [API] [TEST-UNIT] Run API Client Tests until GREEN.**
    *   [ ] **4.5.2.2.5: [REFACTOR] Refactor the API Client Chat Method and its tests.**
    *   [ ] **4.5.2.2.6: [COMMIT]** "feat(API): Update AI API client to send selected chat messages as context"

*   [ ] **4.5.2.3: [UI] Update Chat Submission Logic (e.g., in `AiChatbox.tsx` or `ChatInput.tsx`)**
    *   [ ] **4.5.2.3.1: [UI] [TEST-UNIT] Define Test Cases for Chat Submission Logic**
        *   Verify that when a user submits a message, the logic retrieves the currently selected messages using `useAiStore(selectSelectedChatMessages)`.
        *   Verify that this array of selected messages (along with the new user input) is passed to the updated API client chat method.
    *   [ ] **4.5.2.3.2: [UI] [TEST-UNIT] Write Failing Tests for Chat Submission Logic (RED)**
    *   [ ] **4.5.2.3.3: [UI] Modify Chat Submission Logic**
        *   On message submission:
            *   Get the array of `ChatMessage` objects from `useAiStore(selectSelectedChatMessages)`.
            *   Prepare the new user message (e.g., `{ role: 'user', content: newText }`).
            *   Pass the combined context (selected messages + new user message) to the API client method.
    *   [ ] **4.5.2.3.4: [UI] [TEST-UNIT] Run Chat Submission Logic Tests until GREEN.**
    *   [ ] **4.5.2.3.5: [REFACTOR] Refactor Chat Submission Logic and its tests.**
    *   [ ] **4.5.2.3.6: [COMMIT]** "feat(UI): Update chat submission to use selected messages for context"

*   [ ] **4.5.2.4: [BE] Adapt `/chat` Edge Function for Selected Context and System Prompt**
    *   [ ] **4.5.2.4.1: [BE] [TEST-INT] Define Integration Test Cases for `/chat` Endpoint**
        *   Test scenarios where the endpoint receives an array of selected context messages in the request body.
        *   Test how the "current prompt selection" (system prompt) is handled:
            *   If sent by the client: test it's correctly received and prepended.
            *   If retrieved by the backend: test this retrieval and prepending.
        *   Test that the final history constructed for the AI provider (e.g., OpenAI) accurately reflects the system prompt (once) followed by the user-selected messages and the latest user input.
        *   Test that only messages marked as selected (or all messages if selection feature is bypassed for a simpler call) are used to form the context.
    *   [ ] **4.5.2.4.2: [BE] [TEST-INT] Write Failing Integration Tests for `/chat` Endpoint (RED)**
    *   [ ] **4.5.2.4.3: [BE] Modify `supabase/functions/chat/index.ts`**
        *   Update the request body parsing to expect an optional array of `selectedMessages` (e.g., `ChatMessage[]`).
        *   Implement logic for handling the "current prompt selection" (system prompt). This could be a string passed in the request body (e.g., `systemPrompt: "You are a helpful assistant."`) or retrieved server-side based on user/org settings.
        *   Construct the final message history for the AI provider:
            1.  Start with the system prompt (if any).
            2.  Append the `selectedMessages` provided by the client.
            3.  Append the latest user message from the current request.
            *   Ensure the system prompt is included exactly once at the beginning.
        *   The `relatedEntityId` for `TokenWalletService.recordTransaction` should continue to be the ID of the newly created `chat_messages` table entry that stores the user's latest turn and the AI's response.
    *   [ ] **4.5.2.4.4: [BE] [TEST-INT] Run `/chat` Integration Tests until GREEN.**
    *   [ ] **4.5.2.4.5: [REFACTOR] Refactor `/chat` Endpoint Logic and its tests for clarity and robustness.**
    *   [ ] **4.5.2.4.6: [COMMIT]** "feat(BE): Adapt /chat endpoint for selected context and system prompt integration"

---

## Phase 4.2: [BE] Token Consumption Logic

**Goal:** Adapt AI service usage to debit tokens from the new wallet system.

*   [ ] **4.2.1: [BE] Modify `chat` Edge Function for Wallet Debits**
    *   In `supabase/functions/chat/index.ts`:
        1.  Get `userId` and `organizationId` for context.
        2.  Instantiate `TokenWalletService`.
        3.  Call `tokenWalletService.getWalletForContext(userId, organizationId)` to get `walletId` and `currentBalance`.
        4.  Estimate `tokensRequiredForNextMessage` (using server-side `tiktoken` on user prompt, or a pre-defined cost - **Note: this estimation will now incorporate the full selected context as developed in Phase 4.5**).
        5.  If `currentBalance < tokensRequiredForNextMessage`, return 402 error "Insufficient token balance".
        6.  Proceed to call AI Provider.
        7.  On successful AI response, get `actualTokensConsumed` from provider's response (prompt + completion).
        8.  Call `tokenWalletService.recordTransaction({ walletId, type: 'DEBIT_USAGE', amount: actualTokensConsumed.toString(), relatedEntityId: newChatMessage.id, relatedEntityType: 'chat_message' })`.
        9.  If `recordTransaction` fails (e.g., rare concurrent update led to insufficient balance despite initial check), handle gracefully (log error, potentially don't show AI response or mark as failed). *This step requires careful thought on UX vs. strict accounting.*
    *   Still log `actualTokensConsumed` in `chat_messages.token_usage` for granular per-message data.
*   [ ] **4.2.2: [TEST-INT] Update `POST /chat` Integration Tests**
    *   Verify wallet balance checks before AI call (now with full context estimation).
    *   Verify wallet debits occur after successful AI call via `token_wallet_transactions` ledger.
    *   Verify error handling for insufficient funds.
*   [ ] **4.2.3: [COMMIT]** "feat(BE): Integrate AI chat with token wallet for debits (with full context estimation)"

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
    *   **Note:** The functionality described in section 4.4.1 (Token Estimator Hook) is now comprehensively addressed by **Phase 4.5.2.1 ([UI|STORE] Update Token Estimator (`useTokenEstimator`) and Affordability Hook (`useAIChatAffordabilityStatus`))**, which implements token estimation based on the full selected chat context. This section 4.4.1 is considered fulfilled by the tasks in Phase 4.5.2.1. The original sub-tasks below are superseded.
    *   // *   In `apps/web/src/hooks/useTokenEstimator.unit.test.ts`. Mock `tiktoken`. Test samples, empty string.
*   [ ] **4.4.1.2: [UI] Create hook `apps/web/src/hooks/useTokenEstimator.ts`**
    *   // *   `import { getEncoding } from 'tiktoken'; const encoding = getEncoding('cl100k_base'); export const useTokenEstimator = (text: string) => React.useMemo(() => text ? encoding.encode(text).length : 0, [text]);`
*   [ ] **4.4.1.3: [UI] [TEST-UNIT] Write tests for the hook. Expect failure (RED).**
*   [ ] **4.4.1.4: [UI] Implement the hook. Run tests until pass (GREEN).**
*   [ ] **4.4.1.5: [UI] Integrate Hook into Chat Input Component (`AiChatbox.tsx` or `ChatInput.tsx`)**
    *   // *   Use the `useTokenEstimator` hook with the current text input value.
    *   // *   Display the estimated count near the input field (e.g., "Tokens for this message: ~{count}").
*   [ ] **4.4.1.6: [UI] [TEST-UNIT] Write/Update component tests for chat input to verify display.**
*   [ ] **4.4.1.7: [COMMIT]** "feat(UI): Implement token estimator hook and display in chat input w/ tests" (Commit message will be covered by 4.5.2.1.7)

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
    *   Mocks `useTokenEstimator` (or takes estimated cost as prop - **this will be the enhanced version from Phase 4.5.2.1 that considers full context**).
    *   Test various balance/cost scenarios.
    *   Verify correct status: `{ currentBalance: string, estimatedNextCost: number, canAffordNext: boolean, lowBalanceWarning: boolean }`.
*   [ ] **4.4.5.2: [UI] Create `apps/web/src/hooks/useAIChatAffordabilityStatus.ts` Hook**
    *   Takes `estimatedNextCost: number` as input (derived from the comprehensive `useTokenEstimator` developed in **Phase 4.5.2.1**).
    *   Gets `currentBalance` from `useWalletStore(selectCurrentWalletBalance)`.
    *   Compares. `lowBalanceWarning` if `currentBalance < estimatedNextCost * 3` (configurable threshold).
*   [ ] **4.4.5.3: [UI] [TEST-UNIT] Write tests for the hook. Debug until (GREEN).**
*   [ ] **4.4.5.4: [UI] Integrate Hook into Chat Input (`AiChatbox.tsx` or `ChatInput.tsx`)**
    *   Use `estimatedTokens = useTokenEstimator(currentInputValue)` (this `useTokenEstimator` refers to the enhanced version from **Phase 4.5.2.1**).
    *   Use `const { canAffordNext, lowBalanceWarning } = useAIChatAffordabilityStatus(estimatedTokens);`.
    *   If `lowBalanceWarning`, display a message (e.g., "Token balance is low").
    *   If `!canAffordNext`, disable send button and show message (e.g., "Insufficient balance for this message").
*   [ ] **4.4.5.5: [UI] [TEST-UNIT] Update Chat Input component tests for these conditional UI changes.**
*   [ ] **4.4.5.6: [COMMIT]** "feat(UI): Implement AI chat affordability hook (with full context) and integrate into chat input w/ tests"

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


