/**
 * @file Defines interfaces and types related to payment processing and gateways.
 */

/**
 * Represents a request to purchase an item (e.g., a package of tokens).
 */
export interface PurchaseRequest {
  userId: string;
  organizationId?: string | null;
  itemId: string; // e.g., package_1000_tokens
  quantity: number;
  currency: string; // e.g., USD, ETH
  paymentGatewayId: string; // e.g., 'stripe', 'coinbase', 'internal_tauri_wallet'
  metadata?: Record<string, unknown>;
}

/**
 * Represents the context passed to the payment adapter after initial processing by the edge function.
 * It includes resolved details like target wallet ID, internal payment ID, and specific pricing info.
 */
export interface StripePurchase extends PurchaseRequest {
  targetWalletId: string;
  internalPaymentId: string;
  stripePriceId: string; // Specific to Stripe, consider making this generic if other gateways need similar
  tokensToAward: number;
  amount: number; // The actual fiat amount for this transaction
  currency: string; // The actual fiat currency for this transaction
}

/**
 * Represents the processed and enriched context passed from the orchestrating Edge Function
 * to a specific payment gateway adapter.
 */
export interface PaymentOrchestrationContext {
  // Information from the original PurchaseRequest, still relevant to the adapter
  userId: string;
  organizationId?: string | null;
  itemId: string;           // Crucial: The adapter uses this to find its specific price/plan ID
  quantity: number;
  paymentGatewayId: string; // For context, as the factory selected the adapter based on this
  metadata?: Record<string, unknown>; // Original metadata from PurchaseRequest

  // Information resolved by the initiate-payment Edge Function (our system's view of the transaction)
  internalPaymentId: string; // Our DB record's ID for this payment attempt
  targetWalletId: string;    // The wallet to be credited
  tokensToAward: number;     // How many tokens this item yields, as determined by our system
  amountForGateway: number;  // The monetary amount the gateway should process, as determined by our system
  currencyForGateway: string;// The currency the gateway should use, as determined by our system
}

/**
 * Represents the result of initiating a payment attempt with a gateway.
 */
export interface PaymentInitiationResult {
  success: boolean;
  transactionId?: string; // Our internal payment_transactions.id
  paymentGatewayTransactionId?: string; // Stripe's session_id, etc.
  redirectUrl?: string;
  clientSecret?: string; // For Stripe Elements
  error?: string;
}

/**
 * Represents the result of confirming a payment, often via webhook.
 */
export interface PaymentConfirmation {
  success: boolean;
  transactionId: string | undefined; // Allow undefined for cases like signature failure before ID is known
  paymentGatewayTransactionId?: string;
  tokensAwarded?: number;
  error?: string;
}

/**
 * Interface for a payment gateway adapter.
 * Each specific gateway (Stripe, Coinbase, etc.) will implement this.
 */

/**
 * @interface IPaymentGatewayAdapter
 * Defines the contract for payment gateway adapters.
 * Each payment gateway (Stripe, Coinbase, etc.) will implement this interface.
 */
export interface IPaymentGatewayAdapter {
  /**
   * A unique identifier for the payment gateway (e.g., 'stripe', 'coinbase').
   */
  readonly gatewayId: string;

  /**
   * Initiates a payment process for a given purchase request.
   * This could involve creating a checkout session, a payment intent, or similar,
   * and returning details needed by the client to proceed with the payment.
   *
   * @param request - The details of the purchase.
   * @returns A promise that resolves to a PaymentInitiationResult.
   */
  initiatePayment(context: PaymentOrchestrationContext): Promise<PaymentInitiationResult>;

  /**
   * Handles incoming webhook events from the payment gateway.
   * This method is responsible for verifying the webhook's authenticity,
   * processing the event (e.g., payment success, failure), updating internal
   * transaction records, and potentially awarding tokens or services.
   *
   * @param rawBody - The raw request body of the webhook.
   * @param signature - The signature header from the webhook request (e.g., 'stripe-signature').
   * @param webhookSecret - The secret key used to verify the webhook signature.
   * @returns A promise that resolves to a PaymentConfirmation.
   */
  handleWebhook(rawBody: string | Uint8Array, signature: string | undefined): Promise<PaymentConfirmation>;

  // Future methods might include:
  // processRefund(transactionId: string, amount?: number): Promise<RefundResult>;
  // getTransactionDetails(gatewayTransactionId: string): Promise<TransactionDetails>;
}