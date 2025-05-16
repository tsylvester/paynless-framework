import Stripe from "npm:stripe";
import { PaymentConfirmation } from "../../../types.ts";
import { TablesUpdate } from "../../../../types_db.ts"; // Adjusted path
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';

export async function handleProductDeleted(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // The event object, product is event.data.object
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger } = context;
  const product = event.data.object as Stripe.Product;

  logger.info(
    `[stripe.productDeleted.ts] Received product.deleted event for product ID: ${product.id}`,
    {
      productId: product.id,
      eventId: event.id,
    }
  );

  try {
    const updateData: TablesUpdate<'subscription_plans'> = {
      active: false,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError, data: updatedPlans } = await supabaseClient
      .from('subscription_plans')
      .update(updateData)
      .eq('stripe_product_id', product.id)
      .neq('stripe_price_id', 'price_FREE') // Ensure we don't touch the Free plan row
      .select();

    if (updateError) {
      logger.error(
        `[stripe.productDeleted.ts] Error deactivating subscription plans for product ID: ${product.id}`,
        {
          productId: product.id,
          eventId: event.id,
          error: updateError,
        }
      );
      return {
        success: false,
        transactionId: event.id, // Use event.id for consistency if no transaction is created
        error: `Failed to deactivate plans for product ${product.id}: ${updateError.message}`,
      };
    }

    logger.info(
      `[stripe.productDeleted.ts] Successfully deactivated ${updatedPlans?.length || 0} subscription plan(s) for product ID: ${product.id}.`,
      {
        productId: product.id,
        eventId: event.id,
        deactivatedCount: updatedPlans?.length || 0,
      }
    );

    // Unlike product.created/updated, we might not need to invoke sync-stripe-plans here,
    // as deletion implies the plans are gone and shouldn't be synced *as active*.
    // If a full re-sync is needed for other reasons, other mechanisms should handle it.

    return {
      success: true,
      transactionId: event.id, // Use event.id if no specific transaction is created
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      `[stripe.productDeleted.ts] Unexpected error handling product.deleted for product ID: ${product.id}`,
      {
        productId: product.id,
        eventId: event.id,
        error: err, // Log the original error object
      }
    );
    return {
      success: false,
      transactionId: event.id,
      error: `Unexpected error handling product.deleted for ${product.id}: ${errorMessage}`,
    };
  }
}
