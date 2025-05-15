import Stripe from 'npm:stripe';
import { ProductPriceHandlerContext } from '../types.ts';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
// import { Json } from '../../../../types_db.ts'; // Import if syncing metadata_json

export async function handleProductUpdated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // Assuming product is in event.data.object
): Promise<PaymentConfirmation> {
  const product = event.data.object as Stripe.Product;
  context.logger.info(
    `[handleProductUpdated] Handling ${event.type} for product ${product.id}. Active: ${product.active}, Event ID: ${event.id}`
  );

  // Removed _updatePaymentTransaction call for initial processing log

  // It seems 'price_FREE' was a placeholder or specific internal ID. 
  // If this product ID is truly special and should be ignored, this logic can remain.
  // Otherwise, it might need re-evaluation.
  if (product.id === 'price_FREE') { // Example specific ID check
    context.logger.info(`[handleProductUpdated] Ignoring product.updated event for special product ID 'price_FREE'.`);
    // Removed _updatePaymentTransaction call for skipped log
    return {
        success: true,
        transactionId: event.id // Include eventId for traceability
    };
  }

  try {
    const { error: updateError, count } = await context.supabaseClient
        .from('subscription_plans')
        .update({
            active: product.active,
            // metadata_json: product.metadata as unknown as Json, // Uncomment and ensure Json is imported if you want to sync metadata
            updated_at: new Date().toISOString(),
        })
        .eq('stripe_product_id', product.id);

    if (updateError) {
        context.logger.error(
            `[handleProductUpdated] Error updating subscription_plan for product ${product.id}.`,
            { error: updateError, productId: product.id, active: product.active }
        );
        // Removed _updatePaymentTransaction call for error logging
        return {
            success: false,
            error: `Failed to update plan status for product ${product.id}: ${updateError.message}`,
            transactionId: event.id
        };
    }

    context.logger.info(
        `[handleProductUpdated] Successfully updated plan status/details for product ${product.id}. Active: ${product.active}. Records updated: ${count}`
    );
    // Removed _updatePaymentTransaction call for success logging
    return {
        success: true,
        transactionId: event.id
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    context.logger.error(
        `[handleProductUpdated] Unexpected error: ${errorMessage}`,
        { error: err instanceof Error ? err : String(err), eventId: event.id, productId: product.id }
    );
    // Removed _updatePaymentTransaction call for unexpected error
    return {
        success: false,
        error: `Unexpected error processing product.updated: ${errorMessage}`,
        transactionId: event.id
    };
  }
}
