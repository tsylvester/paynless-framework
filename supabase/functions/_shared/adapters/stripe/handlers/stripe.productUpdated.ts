import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types.ts';
import { parseProductDescription } from '../../../utils/productDescriptionParser.ts';
import { TablesUpdate, Json } from '../../../../types_db.ts';
// import { Json } from '../../../../types_db.ts'; // Import if syncing metadata_json
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';

export async function handleProductUpdated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // Assuming product is in event.data.object
): Promise<PaymentConfirmation> {
  const product = event.data.object as Stripe.Product;
  const { logger, supabaseClient } = context;

  logger.info(
    `[handleProductUpdated] Handling ${event.type} for product ${product.id}. Active: ${product.active}, Event ID: ${event.id}`
  );

  // Removed _updatePaymentTransaction call for initial processing log

  // It seems 'price_FREE' was a placeholder or specific internal ID. 
  // If this product ID is truly special and should be ignored, this logic can remain.
  // Otherwise, it might need re-evaluation.
  if (product.id === 'price_FREE') { // Example specific ID check
    logger.info(`[handleProductUpdated] Ignoring product.updated event for special product ID 'price_FREE'.`);
    // Removed _updatePaymentTransaction call for skipped log
    return {
        success: true,
        transactionId: event.id // Include eventId for traceability
    };
  }

  try {
    const parsedDescription = parseProductDescription(product.name, product.description);

    const fieldsToUpdate: TablesUpdate<'subscription_plans'> = {
      name: product.name,
      description: parsedDescription as unknown as Json,
      active: product.active,
      metadata: product.metadata || {},
      updated_at: new Date().toISOString(),
    };

    logger.info(
      `[handleProductUpdated] Prepared data for subscription_plans update for product ${product.id}.`,
      { fieldsToUpdate: JSON.stringify(fieldsToUpdate, null, 2) }
    );

    const { error: updateError, count } = await supabaseClient
      .from('subscription_plans')
      .update(fieldsToUpdate)
      .eq('stripe_product_id', product.id)
      .neq('stripe_price_id', 'price_FREE'); // Protect the local free plan

    if (updateError) {
      logger.error(
        `[handleProductUpdated] Error updating subscription_plans for product ${product.id}.`,
        { error: updateError, productId: product.id, active: product.active }
      );
      // Removed _updatePaymentTransaction call for error logging
      return {
        success: false,
        error: `Failed to update plans for product ${product.id}: ${updateError.message}`,
        transactionId: event.id
      };
    }

    logger.info(
      `[handleProductUpdated] Successfully updated plans for product ${product.id}. Active: ${product.active}. Records affected: ${count ?? 0}`
    );
    // Removed _updatePaymentTransaction call for success logging
    return {
        success: true,
        transactionId: event.id
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      `[handleProductUpdated] Unexpected error processing ${event.type} for product ${product.id}: ${errorMessage}`,
      { error: err, eventId: event.id, productId: product.id }
    );
    // Removed _updatePaymentTransaction call for unexpected error
    return {
        success: false,
        error: `Unexpected error processing ${event.type} for product ${product.id}: ${errorMessage}`,
        transactionId: event.id
    };
  }
}
