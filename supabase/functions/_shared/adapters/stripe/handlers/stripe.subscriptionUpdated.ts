import Stripe from 'npm:stripe';
import { HandlerContext } from '../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import { Database } from '../../../../types_db.ts'; // Added import for Database types

export async function handleCustomerSubscriptionUpdated(
  context: HandlerContext,
  event: Stripe.CustomerSubscriptionUpdatedEvent
): Promise<PaymentConfirmation> {
  const subscription = event.data.object;
  const eventId = event.id;
  context.logger.info(`[handleCustomerSubscriptionUpdated] Processing subscription ${subscription.id}, Event ID: ${eventId}, Status: ${subscription.status}`);

  if (!subscription.customer || typeof subscription.customer !== 'string') {
    context.logger.warn(`[handleCustomerSubscriptionUpdated] Subscription ${subscription.id} has no valid customer ID. Skipping.`);
    return { success: true, transactionId: eventId };
  }
  const stripeCustomerId = subscription.customer;

  try {
    let internalPlanId: string | undefined;
    if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0]?.price?.id) {
      const stripePriceId = subscription.items.data[0].price.id;
      const { data: planData, error: planError } = await context.supabaseClient
        .from('subscription_plans')
        .select('id')
        .eq('stripe_price_id', stripePriceId)
        .single();
      if (planError || !planData) {
        context.logger.warn(`[handleCustomerSubscriptionUpdated] Plan not found for Stripe Price ID ${stripePriceId} on subscription ${subscription.id}. Will update subscription without plan_id linkage.`, { error: planError });
      } else {
        internalPlanId = planData.id;
      }
    } else {
      context.logger.warn(`[handleCustomerSubscriptionUpdated] No price ID found on subscription ${subscription.id}. Cannot link to internal plan.`);
    }

    const subscriptionUpdateData: Partial<Database['public']['Tables']['user_subscriptions']['Row']> = {
      status: subscription.status,
      current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : undefined,
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : undefined,
      cancel_at_period_end: subscription.cancel_at_period_end,
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    };
    if (internalPlanId) {
      subscriptionUpdateData.plan_id = internalPlanId;
    }

    const { error: updateError, count } = await context.supabaseClient
      .from('user_subscriptions')
      .update(subscriptionUpdateData)
      .eq('stripe_subscription_id', subscription.id);

    if (updateError) {
      context.logger.error(`[handleCustomerSubscriptionUpdated] Error updating user_subscription ${subscription.id}.`, { error: updateError });
      return { success: false, transactionId: eventId, error: `DB error updating subscription: ${updateError.message}` };
    }
    if (count === 0) {
      context.logger.warn(`[handleCustomerSubscriptionUpdated] No user_subscription found with stripe_subscription_id ${subscription.id} to update. This might be okay if checkout.session.completed hasn't processed yet or was missed.`);
    }
    
    context.logger.info(`[handleCustomerSubscriptionUpdated] Successfully processed event for subscription ${subscription.id}. Updated records: ${count}`);
    return { success: true, transactionId: eventId };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.logger.error(`[handleCustomerSubscriptionUpdated] General error processing event for subscription ${subscription.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
    return { success: false, transactionId: eventId, error: errorMessage };
  }
}
