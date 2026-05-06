import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';
import { isRecord } from '../../../utils/type-guards/type_guards.common.ts';

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

  const firstItem = subscription.items?.data?.[0];

  let p_period_start: string | null = null;
  if (firstItem !== undefined && typeof firstItem.current_period_start === 'number') {
    p_period_start = new Date(firstItem.current_period_start * 1000).toISOString();
  }

  let p_period_end: string | null = null;
  if (firstItem !== undefined && typeof firstItem.current_period_end === 'number') {
    p_period_end = new Date(firstItem.current_period_end * 1000).toISOString();
  }

  let p_plan_id: string | null = null;
  if (internalPlanId !== undefined) {
    p_plan_id = internalPlanId;
  }

  const rpcResult = await context.supabaseClient.rpc('update_subscription_with_tier', {
    p_stripe_subscription_id: subscription.id,
    p_status: subscription.status,
    p_plan_id,
    p_period_start,
    p_period_end,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_stripe_customer_id: stripeCustomerId,
    p_set_ratchet: false,
  });

  if (rpcResult.error) {
    const rpcFailure: unknown = rpcResult.error;
    let errMsg: string;
    if (rpcFailure instanceof Error) {
      errMsg = rpcFailure.message;
    } else {
      errMsg = 'update_subscription_with_tier failed: error value is not an Error instance.';
    }
    context.logger.error(`[handleCustomerSubscriptionUpdated] Error updating user_subscription ${subscription.id}.`, { error: rpcFailure });
    return { success: false, transactionId: eventId, error: errMsg };
  }

  const rpcRowsUnknown: unknown = rpcResult.data;
  if (!Array.isArray(rpcRowsUnknown) || rpcRowsUnknown.length === 0) {
    const errMsg: string = 'update_subscription_with_tier returned no rows.';
    context.logger.error(`[handleCustomerSubscriptionUpdated] ${errMsg}`, { eventId });
    return { success: false, transactionId: eventId, error: errMsg };
  }

  const firstRowUnknown: unknown = rpcRowsUnknown[0];
  if (!isRecord(firstRowUnknown)) {
    const errMsg: string = 'update_subscription_with_tier returned unexpected row shape.';
    context.logger.error(`[handleCustomerSubscriptionUpdated] ${errMsg}`, { eventId });
    return { success: false, transactionId: eventId, error: errMsg };
  }

  const rowsUpdatedUnknown: unknown = firstRowUnknown['rows_updated'];
  if (typeof rowsUpdatedUnknown !== 'number') {
    const errMsg: string = 'update_subscription_with_tier row missing rows_updated.';
    context.logger.error(`[handleCustomerSubscriptionUpdated] ${errMsg}`, { eventId });
    return { success: false, transactionId: eventId, error: errMsg };
  }
  const rowsUpdated: number = rowsUpdatedUnknown;

  const tierLevelUnknown: unknown = firstRowUnknown['tier_level'];
  let tierLevelLogFragment: string;
  if (tierLevelUnknown === null) {
    tierLevelLogFragment = 'null';
  } else if (typeof tierLevelUnknown === 'number') {
    tierLevelLogFragment = String(tierLevelUnknown);
  } else {
    tierLevelLogFragment = 'unknown';
  }

  if (rowsUpdated === 0) {
    context.logger.warn(`[handleCustomerSubscriptionUpdated] No user_subscription found with stripe_subscription_id ${subscription.id} to update. This might be okay if checkout.session.completed hasn't processed yet or was missed.`);
  }

  context.logger.info(`[handleCustomerSubscriptionUpdated] Successfully processed event for subscription ${subscription.id}. Updated records: ${rowsUpdated}. tier_level: ${tierLevelLogFragment}`, { eventId });
  return { success: true, transactionId: eventId };
}
