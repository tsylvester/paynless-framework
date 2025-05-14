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
  transactionId: string; // Our internal payment_transactions.id
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
  initiatePayment(request: PurchaseRequest): Promise<PaymentInitiationResult>;

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
  handleWebhook(rawBody: string | Uint8Array, signature: string | undefined, webhookSecret: string): Promise<PaymentConfirmation>;

  // Future methods might include:
  // processRefund(transactionId: string, amount?: number): Promise<RefundResult>;
  // getTransactionDetails(gatewayTransactionId: string): Promise<TransactionDetails>;
}