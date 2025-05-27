# Supabase Webhook Tests: Stripe Integration

This document outlines the integration tests for the Stripe webhook handlers located in `supabase/functions/webhooks/index.ts` and its associated adapter logic in `supabase/functions/_shared/adapters/stripe/`.

## Test Structure

Integration tests for specific Stripe event types are generally found in dedicated files within the `supabase/functions/webhooks/` directory, named according to the event they test (e.g., `index.invoice.integration.test.ts`).

## Test Coverage Checklist

### 1. Webhook Router Logic

File: `supabase/functions/webhooks/index.router.test.ts`

*   `[x]` **Unknown Source:** POST to `/webhooks/unknown-source` returns 404 if adapter not found.
*   `[x]` **Stripe Valid Call:** POST to `/webhooks/stripe` correctly calls the `StripePaymentAdapter.handleWebhook` method.
*   `[x]` **Adapter Error Response:** POST to `/webhooks/stripe` returns 400 if `adapter.handleWebhook` returns an error an object like `{ success: false, error: 'message' }`.
*   `[x]` **Adapter Throws Error:** POST to `/webhooks/stripe` returns 500 if `adapter.handleWebhook` throws an exception.
*   `[x]` **Missing Signature:** POST to `/webhooks/stripe` without a signature header still calls `adapter.handleWebhook` (with undefined signature).
*   `[x]` **CORS Options:** OPTIONS request to `/webhooks/stripe` is handled by the CORS handler.
*   `[x]` **Direct Router Handler Call:** Test `webhookRouterHandler` function directly for POST to `/webhooks/stripe`.

### 2. `checkout.session.completed` Events

File: `supabase/functions/webhooks/index.checkoutSession.integration.test.ts`

*   **Mode: `payment` (One-Time Purchases)**
    *   `[x]` **Success:** Updates `payment_transactions`, awards tokens, and returns 200.
    *   `[x]` **Idempotency:** Process the same event twice; ensure tokens are awarded only once and `payment_transactions` status is correct and processed once.
    *   `[x]` **Token Award Failure:** Simulate `TokenWalletService.recordTransaction` failure; verify `payment_transactions.status` (e.g., `TOKEN_AWARD_FAILED`) and appropriate HTTP response.
    *   `[x]` **DB Update Failure (PaymentTransaction):** Simulate failure when updating `payment_transactions` to `COMPLETED`; verify error handling and potential retry/logging.
    *   `[x]` **Missing Initial PaymentTransaction:** Handle scenario where the initial `PENDING` `payment_transactions` record (expected via `internalPaymentId` from metadata) is not found.
*   **Mode: `subscription` (New Subscriptions)**
    *   `[x]` **Success:** Upserts `user_subscriptions`, updates `payment_transactions` for initial payment, awards tokens, and returns 200.
    *   `[x]` **Idempotency:** Process the same event twice; ensure `user_subscriptions` is consistent, `payment_transactions` for initial payment is processed once, and tokens are awarded only once.
    *   `[x]` **Stripe API Error (`stripe.subscriptions.retrieve` fails):** Handles error gracefully, updates `payment_transactions` to `FAILED`, and returns an appropriate error response (e.g., 500).
    *   `[x]` **Token Award Failure (Initial Payment):** Simulate `TokenWalletService.recordTransaction` failure for initial tokens; verify `payment_transactions.status`, `user_subscriptions` state, and HTTP response.
    *   `[x]` **DB Upsert Failure (UserSubscriptions):** Simulate failure when upserting to `user_subscriptions`; verify error handling.
    *   `[x]` **DB Update Failure (PaymentTransaction - Initial):** Simulate failure when updating initial `payment_transactions`; verify error handling.
    *   `[x]` **Missing Subscription Plan:** Handle scenario where the `subscription_plans` record for the checkout item's price ID is not found.

### 3. `invoice.*` Events

File: `supabase/functions/webhooks/index.invoice.integration.test.ts`

*   **`invoice.payment_succeeded` (Subscription Renewals)**
    *   `[x]` **Success:** Updates `payment_transactions` (creates a new one for renewal or updates existing), updates `user_subscriptions` (e.g. period dates), awards tokens for renewal, and returns 200.
    *   `[x]` **Idempotency:** Process the same event twice; ensure tokens are awarded only once, and `payment_transactions`/`user_subscriptions` states are consistent. (Tested in `index.invoice.idempotency.integration.test.ts`)
    *   `[x]` **Token Award Failure:** Simulate `TokenWalletService.recordTransaction` failure; verify `payment_transactions.status` (e.g., `TOKEN_AWARD_FAILED` or `RENEWAL_TOKEN_FAIL`) and appropriate HTTP response.
    *   `[x]` **DB Update Failure (UserSubscriptions):** Simulate failure updating `user_subscriptions` (e.g., period dates); verify error handling, logging, and potentially `payment_transactions` status.
    *   `[x]` **DB Update/Insert Failure (PaymentTransaction):** Simulate failure creating/updating the `payment_transactions` record for the renewal; verify error handling.
    *   `[x]` **Missing User Subscription:** Handle scenario where `user_subscriptions` record is not found for the `customer_id` on the invoice.
    *   `[x]` **Missing Token Wallet:** Handle scenario where `token_wallets` record is not found for the `user_id` associated with the subscription.
    *   `[x]` **Missing Subscription Plan:** Handle scenario where `subscription_plans` record for the invoice line item's price ID is not found.
*   **`invoice.payment_failed`**
    *   `[x]` **Success (Scenario: Main):** Updates `payment_transactions` to `FAILED` and `user_subscriptions` status (e.g., `past_due`, `unpaid`), returns 200.
    *   `[x]` **Success (Scenario: MOVED):** Similar to Main, covering specific data.
    *   `[x]` **Success (Scenario: A):** Similar to Main, covering specific data.
    *   `[x]` **Success (Scenario: B / second failure):** Similar to Main, covering specific data.
    *   `[x]` **Stripe API Error (`stripe.subscriptions.retrieve` fails):** If the handler attempts to retrieve the subscription and fails, ensure graceful error handling and appropriate status updates.
    *   `[x]` **Missing User Subscription:** Handle if `user_subscriptions` record for the `customer_id` is not found.

### 4. `price.*` Events (Product Pricing)

File: `supabase/functions/webhooks/index.price.integration.test.ts`

*   **`price.created`**
    *   `[x]` **Success:** Fetches associated product data from Stripe, upserts new plan details into `subscription_plans`, and returns 200.
    *   `[x]` **Stripe Product Fetch Failure:** Handle error if `stripe.products.retrieve` fails when fetching associated product.
    *   `[x]` **DB Upsert Failure:** Handle error if upserting to `subscription_plans` fails.
*   **`price.updated`**
    *   `[x]` **Success:** Fetches associated product data, updates existing plan details in `subscription_plans`, and returns 200.
    *   `[N/A]` **Stripe Product Fetch Failure:** Handle error if `stripe.products.retrieve` fails. (Handler does not retrieve product)
    *   `[x]` **DB Update Failure:** Handle error if updating `subscription_plans` fails.
    *   `[x]` **Price Not Found:** Handle scenario where the `stripe_price_id` to update does not exist in `subscription_plans`.
*   **`price.deleted`**
    *   `[x]` **Success:** Updates `active` status of matching plans in `subscription_plans` to `false`, and returns 200.
    *   `[x]` **DB Update Failure:** Handle error if updating `