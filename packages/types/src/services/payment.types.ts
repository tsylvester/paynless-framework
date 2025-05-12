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
export interface IPaymentGatewayAdapter {
  gatewayId: string;

  /**
   * Initiates a payment process for a given purchase request.
   * @param request - The details of the purchase.
   * @returns A promise resolving to the initiation result (e.g., redirect URL, client secret).
   */
  initiatePayment(request: PurchaseRequest): Promise<PaymentInitiationResult>;

  /**
   * Handles incoming webhooks from the payment gateway to confirm or update payment status.
   * @param payload - The raw webhook payload.
   * @param headers - Optional headers (e.g., for signature verification).
   * @returns A promise resolving to the confirmation result, including tokens awarded if successful.
   */
  handleWebhook(payload: unknown, headers?: Record<string, unknown>): Promise<PaymentConfirmation>;
}
 