import { IPaymentGatewayAdapter, PaymentConfirmation, PaymentInitiationResult, PaymentOrchestrationContext } from '../types/payment.types.ts';
import { ITokenWalletService } from '../types/tokenWallet.types.ts';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types_db.ts';

// Dummy Stripe Adapter for placeholder
class DummyStripeAdapter implements IPaymentGatewayAdapter {
  gatewayId = 'stripe';
  private adminClient: SupabaseClient<Database>;
  private tokenWalletService: ITokenWalletService;

  constructor(
    adminClient: SupabaseClient<Database>,
    tokenWalletService: ITokenWalletService,
  ) {
    this.adminClient = adminClient;
    this.tokenWalletService = tokenWalletService;
  }

  async initiatePayment(
    context: PaymentOrchestrationContext,
  ): Promise<PaymentInitiationResult> {
    console.log('[DummyStripeAdapter] initiatePayment called with context:', context);
    return Promise.resolve({
      success: false,
      transactionId: context.internalPaymentId,
      error: 'DummyStripeAdapter.initiatePayment not implemented',
    });
  }

  async handleWebhook(
    rawBody: string | Uint8Array,
    signature: string | undefined,
    webhookSecret: string,
  ): Promise<PaymentConfirmation> {
    console.log('[DummyStripeAdapter] handleWebhook called with rawBody (type):', typeof rawBody, 'signature:', signature);
    console.log('[DummyStripeAdapter] webhookSecret received:', webhookSecret ? '******' : 'NOT PROVIDED');
    return { success: true, transactionId: 'dummy-txn-id-from-stripe-webhook' };
  }
}

export function getPaymentAdapter(
  source: string,
  adminClient: SupabaseClient<Database>,
  tokenWalletService: ITokenWalletService,
): IPaymentGatewayAdapter | null {
  if (source === 'stripe') {
    return new DummyStripeAdapter(adminClient, tokenWalletService);
  }
  
  console.warn(`[adapterFactory] No adapter found for source: ${source}`);
  return null;
}

// Placeholder for other potential exports or types if needed 