import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types.ts';
import type { HandlerContext } from '../../../stripe.mock.ts';
import { isRecord } from '../../../utils/type-guards/type_guards.common.ts';

const FREE_TIER_ITEM_ID_INTERNAL = 'SYS_FREE_TIER';

export async function handleCustomerSubscriptionDeleted(
  context: HandlerContext,
  event: Stripe.CustomerSubscriptionDeletedEvent
): Promise<PaymentConfirmation> {
  const subscription = event.data.object;
  const eventId = event.id;
  context.logger.info(`[handleCustomerSubscriptionDeleted] Processing deleted subscription ${subscription.id}, Event ID: ${eventId}`);

  const newStatus = 'canceled';
  let freePlanResolved = false;
  let freePlanRowId = '';

  try {
    const { data: freePlan, error: freePlanError } = await context.supabaseClient
      .from('subscription_plans')
      .select('id')
      .eq('item_id_internal', FREE_TIER_ITEM_ID_INTERNAL)
      .single();

    if (freePlanError && freePlanError.code !== 'PGRST116') {
      context.logger.error(`[handleCustomerSubscriptionDeleted] DB error looking up free plan for ${subscription.id}`, { error: freePlanError, eventId });
    } else if (freePlan) {
      freePlanResolved = true;
      freePlanRowId = freePlan.id;
      context.logger.info(`[handleCustomerSubscriptionDeleted] Found free plan ID ${freePlanRowId} for subscription ${subscription.id}`, { eventId });
    } else {
      context.logger.warn(`[handleCustomerSubscriptionDeleted] Internal free plan with item_id_internal ${FREE_TIER_ITEM_ID_INTERNAL} not found. Subscription ${subscription.id} will be updated without a specific free plan_id.`, { eventId });
    }
  } catch (e) {
    context.logger.error(`[handleCustomerSubscriptionDeleted] Unexpected error looking up free plan for subscription ${subscription.id}`, { error: e, eventId });
  }

  let p_plan_id = null;
  if (freePlanResolved) {
    p_plan_id = freePlanRowId;
  }

  try {
    const rpcResult = await context.supabaseClient.rpc('update_subscription_with_tier', {
      p_stripe_subscription_id: subscription.id,
      p_status: 'canceled',
      p_plan_id,
      p_cancel_at_period_end: false,
      p_set_ratchet: false,
    });

    const rpcErr = rpcResult.error;
    if (rpcErr) {
      let errMsg = '';
      if (rpcErr instanceof Error) {
        errMsg = rpcErr.message;
      } else {
        errMsg = 'update_subscription_with_tier failed: error value is not an Error instance.';
      }
      context.logger.error(`[handleCustomerSubscriptionDeleted] Error updating user_subscription ${subscription.id} to status ${newStatus}.`, { error: rpcErr });
      return { success: false, transactionId: eventId, error: errMsg };
    }

    const rpcData = rpcResult.data;
    if (!Array.isArray(rpcData) || rpcData.length === 0) {
      const errMsg = 'update_subscription_with_tier returned no rows.';
      context.logger.error(`[handleCustomerSubscriptionDeleted] ${errMsg}`, { eventId });
      return { success: false, transactionId: eventId, error: errMsg };
    }

    const firstRow = rpcData[0];
    if (!isRecord(firstRow)) {
      const errMsg = 'update_subscription_with_tier returned unexpected row shape.';
      context.logger.error(`[handleCustomerSubscriptionDeleted] ${errMsg}`, { eventId });
      return { success: false, transactionId: eventId, error: errMsg };
    }

    const rowsUpdatedRaw = firstRow['rows_updated'];
    if (typeof rowsUpdatedRaw !== 'number') {
      const errMsg = 'update_subscription_with_tier row missing rows_updated.';
      context.logger.error(`[handleCustomerSubscriptionDeleted] ${errMsg}`, { eventId });
      return { success: false, transactionId: eventId, error: errMsg };
    }
    const rowsUpdated = rowsUpdatedRaw;

    const tierLevelRaw = firstRow['tier_level'];
    let tierLevelLogFragment = '';
    if (tierLevelRaw === null) {
      tierLevelLogFragment = 'null';
    } else if (typeof tierLevelRaw === 'number') {
      tierLevelLogFragment = String(tierLevelRaw);
    } else {
      tierLevelLogFragment = 'unknown';
    }

    if (rowsUpdated === 0) {
      context.logger.warn(`[handleCustomerSubscriptionDeleted] No user_subscription found with stripe_subscription_id ${subscription.id} to mark as ${newStatus}.`);
    }

    context.logger.info(`[handleCustomerSubscriptionDeleted] Successfully processed delete event for subscription ${subscription.id}. Marked as ${newStatus}. Updated records: ${rowsUpdated}. tier_level: ${tierLevelLogFragment}`, { eventId });
    return { success: true, transactionId: eventId };

  } catch (error) {
    let errorMessage = '';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
    context.logger.error(`[handleCustomerSubscriptionDeleted] General error processing delete event for subscription ${subscription.id}, Event ${eventId}.`, { message: errorMessage, errorDetails: error });
    return { success: false, transactionId: eventId, error: errorMessage };
  }
}
