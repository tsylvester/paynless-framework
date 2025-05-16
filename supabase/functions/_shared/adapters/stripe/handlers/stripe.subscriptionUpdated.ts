import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types.ts';
import { Database } from '../../../../types_db.ts'; // Added import for Database types
import type { HandlerContext } from '../../../stripe.mock.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER'; // Define constant for free tier

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

  let internalPlanId: string | undefined = undefined;

  if (subscription.status === 'canceled') {
    // If subscription is canceled, attempt to set to the internal free plan
    try {
      const { data: freePlan, error: freePlanError } = await context.supabaseClient
        .from('subscription_plans')
        .select('id')
        .eq('item_id_internal', FREE_TIER_ITEM_ID_INTERNAL)
        .single();

      if (freePlanError) {
        context.logger.error(`DB error looking up free plan for item_id_internal ${FREE_TIER_ITEM_ID_INTERNAL}`, { error: freePlanError, eventId: event.id });
        // Proceed without free plan if lookup fails, effectively nullifying the plan_id if no other plan is found
      } else if (freePlan) {
        internalPlanId = freePlan.id;
        context.logger.info(`Subscription ${subscription.id} canceled, setting plan to default free plan ID ${internalPlanId}`, { eventId: event.id });
      } else {
        context.logger.warn(`Internal free plan with item_id_internal ${FREE_TIER_ITEM_ID_INTERNAL} not found. Subscription ${subscription.id} will have no plan_id.`, { eventId: event.id });
      }
    } catch (e) {
      context.logger.error(`Unexpected error looking up free plan for subscription ${subscription.id}`, { error: e, eventId: event.id });
      // Proceed without free plan if lookup fails
    }
  } else if (subscription.items && subscription.items.data.length > 0 && subscription.items.data[0]?.price?.id) {
    // If not canceled, and there's a price ID, try to find the corresponding internal plan
    const stripePriceId = subscription.items.data[0].price.id;
    try {
      const { data: planData, error: planError } = await context.supabaseClient
        .from('subscription_plans')
        .select('id')
        .eq('stripe_price_id', stripePriceId)
        .single();

      if (planError && planError.code !== 'PGRST116') {
        context.logger.error(`[handleCustomerSubscriptionUpdated] DB error looking up plan for Stripe Price ID ${stripePriceId} on subscription ${subscription.id}.`, { error: planError });
        return { success: false, transactionId: eventId, error: `DB error looking up plan: ${planError.message}` };
      }
      if (!planData) {
        context.logger.warn(`[handleCustomerSubscriptionUpdated] Plan not found for Stripe Price ID ${stripePriceId} on subscription ${subscription.id}. Will update subscription without plan_id linkage.`);
      } else {
        internalPlanId = planData.id;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      context.logger.error(`[handleCustomerSubscriptionUpdated] General error processing event for subscription ${subscription.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
      return { success: false, transactionId: eventId, error: errorMessage };
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
}
