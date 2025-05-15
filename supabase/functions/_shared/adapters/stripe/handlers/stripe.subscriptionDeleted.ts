import Stripe from 'npm:stripe';
import { HandlerContext } from '../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';

export async function handleCustomerSubscriptionDeleted(
  context: HandlerContext,
  event: Stripe.CustomerSubscriptionDeletedEvent
): Promise<PaymentConfirmation> {
  const subscription = event.data.object; 
  const eventId = event.id;
  context.logger.info(`[handleCustomerSubscriptionDeleted] Processing deleted subscription ${subscription.id}, Event ID: ${eventId}, Status: ${subscription.status}`);

  const newStatus = subscription.status === 'canceled' ? 'canceled' : 'deleted'; 

  try {
    const subscriptionUpdateData = {
      status: newStatus,
      updated_at: new Date().toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end, 
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
