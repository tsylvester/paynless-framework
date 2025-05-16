import Stripe from 'npm:stripe';
import { HandlerContext } from '../../../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import { Database } from '../../../../types_db.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER';

export async function handleCustomerSubscriptionDeleted(
  context: HandlerContext,
  event: Stripe.CustomerSubscriptionDeletedEvent
): Promise<PaymentConfirmation> {
  const subscription = event.data.object; 
  const eventId = event.id;
  context.logger.info(`[handleCustomerSubscriptionDeleted] Processing deleted subscription ${subscription.id}, Event ID: ${eventId}`);

  const newStatus = 'DELETED';
  let internalPlanId: string | undefined = undefined;

  try {
    const { data: freePlan, error: freePlanError } = await context.supabaseClient
      .from('subscription_plans')
      .select('id')
      .eq('item_id_internal', FREE_TIER_ITEM_ID_INTERNAL)
      .single();

    if (freePlanError && freePlanError.code !== 'PGRST116') {
      context.logger.error(`[handleCustomerSubscriptionDeleted] DB error looking up free plan for ${subscription.id}`, { error: freePlanError, eventId });
    } else if (freePlan) {
      internalPlanId = freePlan.id;
      context.logger.info(`[handleCustomerSubscriptionDeleted] Found free plan ID ${internalPlanId} for subscription ${subscription.id}`, { eventId });
    } else {
      context.logger.warn(`[handleCustomerSubscriptionDeleted] Internal free plan with item_id_internal ${FREE_TIER_ITEM_ID_INTERNAL} not found. Subscription ${subscription.id} will be updated without a specific free plan_id.`, { eventId });
    }
  } catch (e) {
    context.logger.error(`[handleCustomerSubscriptionDeleted] Unexpected error looking up free plan for subscription ${subscription.id}`, { error: e, eventId });
  }

  try {
    const subscriptionUpdateData: Partial<Database['public']['Tables']['user_subscriptions']['Row']> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      cancel_at_period_end: false,
      plan_id: internalPlanId,
    };

    const { error: updateError, count } = await context.supabaseClient
      .from('user_subscriptions')
      .update(subscriptionUpdateData)
      .eq('stripe_subscription_id', subscription.id);

    if (updateError) {
      context.logger.error(`[handleCustomerSubscriptionDeleted] Error updating user_subscription ${subscription.id} to status ${newStatus}.`, { error: updateError });
      return { success: false, transactionId: eventId, error: `DB error updating subscription: ${updateError.message}` };
    }
    if (count === 0) {
      context.logger.warn(`[handleCustomerSubscriptionDeleted] No user_subscription found with stripe_subscription_id ${subscription.id} to mark as ${newStatus}.`);
    }

    context.logger.info(`[handleCustomerSubscriptionDeleted] Successfully processed delete event for subscription ${subscription.id}. Marked as ${newStatus}. Updated records: ${count}`);
    return { success: true, transactionId: eventId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`[handleCustomerSubscriptionDeleted] General error processing delete event for subscription ${subscription.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
    return { success: false, transactionId: eventId, error: errorMessage };
  }
}
