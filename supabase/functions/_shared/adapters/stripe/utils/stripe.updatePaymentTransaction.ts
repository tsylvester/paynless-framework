import { SupabaseClient } from 'npm:@supabase/supabase-js';
import { Database, Json, TablesUpdate, Tables } from '../../../../types_db.ts';

export type PaymentTransaction = Tables<'payment_transactions'>;

export async function updatePaymentTransaction(
  adminClient: SupabaseClient<Database>,
  transactionId: string,
  updates: Partial<Omit<PaymentTransaction, 'id' | 'created_at' | 'user_id' | 'payment_provider' | 'transaction_type' | 'amount' | 'currency' | 'provider_transaction_id'>>,
  stripeEventId?: string
): Promise<PaymentTransaction | null> {
  const updatePayload: TablesUpdate<'payment_transactions'> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (stripeEventId) {
    const existingMeta: { [key: string]: Json | undefined } =
      typeof updates.metadata_json === 'object' &&
      updates.metadata_json !== null &&
      !Array.isArray(updates.metadata_json)
        ? { ...updates.metadata_json }
        : {};

    const existingEventIds = Array.isArray(existingMeta.stripe_event_ids)
      ? existingMeta.stripe_event_ids.filter((id): id is string => typeof id === 'string')
      : [];

    if (!existingEventIds.includes(stripeEventId)) {
      existingMeta.stripe_event_ids = [...existingEventIds, stripeEventId];
    }

    updatePayload.metadata_json = existingMeta;
  }

  const { data, error } = await adminClient
    .from('payment_transactions')
    .update(updatePayload)
    .eq('id', transactionId)
    .select()
    .single();

  if (error) {
    console.error(`[updatePaymentTransaction] Error updating payment_transactions for ID ${transactionId}:`, error);
    return null;
  }

  return data;
}
