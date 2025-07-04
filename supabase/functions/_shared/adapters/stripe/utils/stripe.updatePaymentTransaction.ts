import { SupabaseClient } from 'npm:@supabase/supabase-js';
import { Database, Json, TablesUpdate, Tables } from '../../../../types_db.ts';
// import { PaymentTransaction } from '../../types/payment.types.ts'; // Removed incorrect import

// Define PaymentTransaction using the Tables helper type from types_db.ts
export type PaymentTransaction = Tables<'payment_transactions'>;

// Define a more specific status type if possible, or use string
type PaymentTransactionStatus = 'pending' | 'succeeded' | 'failed' | 'requires_action' | 'cancelled' | 'processing' | 'requires_capture' | 'requires_confirmation' | 'requires_payment_method';


export async function updatePaymentTransaction(
  adminClient: SupabaseClient<Database>,
  transactionId: string,
  updates: Partial<Omit<PaymentTransaction, 'id' | 'created_at' | 'user_id' | 'payment_provider' | 'transaction_type' | 'amount' | 'currency' | 'provider_transaction_id' | 'metadata_json'>> & { metadata_json?: Json | Record<string, unknown> },
  stripeEventId?: string
): Promise<PaymentTransaction | null> {
  // console.log('[updatePaymentTransaction] Called with transactionId:', transactionId, 'updates:', updates, 'stripeEventId:', stripeEventId);

  const updatePayload: TablesUpdate<'payment_transactions'> = {
    ...(updates as Partial<TablesUpdate<'payment_transactions'>>), // Cast updates to be compatible
    updated_at: new Date().toISOString(),
  };

  // Ensure metadata_json is treated as Json compatible
  let metadata: Record<string, Json | undefined> = {};
  if (updatePayload.metadata_json && typeof updatePayload.metadata_json === 'object' && !Array.isArray(updatePayload.metadata_json)) {
    metadata = updatePayload.metadata_json as Record<string, Json | undefined>;
  } else if (updatePayload.metadata_json) {
    // If it's an array or primitive, it might be valid Json, but for adding stripe_event_ids we need an object.
    // Or, we could choose to store stripe_event_ids differently if metadata_json is already an array.
    // For now, let's assume if we're adding stripe_event_ids, metadata_json should be an object.
    // If it's not, we might overwrite or log a warning. For simplicity, we try to merge into an object.
    console.warn('[updatePaymentTransaction] metadata_json is not an object, attempting to merge. Original:', updatePayload.metadata_json)
    // This case needs careful handling based on desired behavior if metadata_json is, e.g., an array.
    // For now, we will initialize fresh if it's not a compatible object for our structured update.
  }

  if (stripeEventId) {
    const existingEventIds = Array.isArray(metadata.stripe_event_ids) ? metadata.stripe_event_ids : [];
    if (!existingEventIds.includes(stripeEventId)) {
      metadata.stripe_event_ids = [...existingEventIds, stripeEventId];
    }
  }
  
  // Only assign metadata to updatePayload if it has been modified or initialized.
  if (Object.keys(metadata).length > 0 || stripeEventId) {
      updatePayload.metadata_json = metadata as Json;
  } else if (updates.metadata_json !== undefined) {
      // If original updates had metadata_json (even null or primitive), preserve it
      updatePayload.metadata_json = updates.metadata_json as Json;
  }

  // console.log('[updatePaymentTransaction] Update payload for DB:', updatePayload);

  const { data, error } = await adminClient
    .from('payment_transactions')
    .update(updatePayload)
    .eq('id', transactionId)
    .select()
    .single();

  if (error) {
    console.error(`[updatePaymentTransaction] Error updating payment_transactions for ID ${transactionId}:`, error);
    // Consider how to handle this error. Throw, return null, or return an error object?
    // For now, logging and returning null.
    return null;
  }

  // console.log('[updatePaymentTransaction] Successfully updated payment_transaction:', data);
  return data as PaymentTransaction; // Ensure correct type casting
} 