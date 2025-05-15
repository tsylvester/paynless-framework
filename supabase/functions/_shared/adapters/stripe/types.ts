import Stripe from 'stripe';
import { SupabaseClient } from '@supabase/supabase-js';
import { ITokenWalletService } from '../../types/tokenWallet.types.ts';
import { Json, Tables } from '../../../types_db.ts';
import { ILogger, LogMetadata } from '../../types.ts';

// Define PaymentTransaction using the Tables helper type from types_db.ts
export type PaymentTransaction = Tables<'payment_transactions'>;

export type UpdatePaymentTransactionFn = (
  transactionId: string,
  updates: Partial<Omit<PaymentTransaction, 'id' | 'created_at' | 'user_id' | 'payment_provider' | 'transaction_type' | 'amount' | 'currency' | 'provider_transaction_id' | 'metadata_json'>> & { 
    metadata_json?: Json | Record<string, unknown>;
    status?: string; // Explicitly allow status here, or ensure it's not in Omit
    gateway_transaction_id?: string; // Allow this as well, as it's used
  },
  stripeEventId?: string
) => Promise<PaymentTransaction | null>;

export interface HandlerContext {
  stripe: Stripe;
  supabaseClient: SupabaseClient;
  logger: ILogger;
  tokenWalletService: ITokenWalletService;
  updatePaymentTransaction: UpdatePaymentTransactionFn;
  featureFlags?: Record<string, boolean>; // Optional feature flags
  functionsUrl: string; // Base URL for invoking other functions if needed
  stripeWebhookSecret: string; // The specific webhook secret for this adapter
}

// Specific context for product/price handlers that might not need token wallet or full payment transaction updates directly
export interface ProductPriceHandlerContext {
  stripe: Stripe;
  supabaseClient: SupabaseClient;
  logger: ILogger;
  functionsUrl: string;
  stripeWebhookSecret: string;
}

// We can add more specific context types if needed for other categories of handlers.

export interface PaymentConfirmation {
  success: boolean;
  transactionId: string | undefined;
  error?: string;
}
