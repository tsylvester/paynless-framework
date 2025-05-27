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
  const { logger, supabaseClient, stripe } = context;

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

    // Base fields from the product
    const fieldsToUpdate: TablesUpdate<'subscription_plans'> = {
      name: product.name,
      description: parsedDescription as unknown as Json,
      active: product.active, // Initial active state from product
      metadata: product.metadata || {},
      updated_at: new Date().toISOString(),
      // Price-related fields will be added/overridden if default_price is available
    };

    // Check for default_price and fetch its details
    if (typeof product.default_price === 'string' && product.default_price.trim() !== '') {
      try {
        // Ensure 'stripe' is the correct Stripe SDK instance on context
        const priceDetails = await stripe.prices.retrieve(product.default_price);

        if (priceDetails) {
          fieldsToUpdate.stripe_price_id = priceDetails.id;
          fieldsToUpdate.amount = priceDetails.unit_amount ?? undefined; // Handle null from Stripe
          fieldsToUpdate.currency = priceDetails.currency;
          fieldsToUpdate.interval = priceDetails.recurring?.interval ?? undefined; // Handle undefined recurring details
          fieldsToUpdate.interval_count = priceDetails.recurring?.interval_count ?? undefined; // Handle undefined recurring details
          fieldsToUpdate.plan_type = priceDetails.type === 'recurring' ? 'subscription' : 'one_time';
          // Update active status based on both product and price activity
          fieldsToUpdate.active = product.active && priceDetails.active;
          
          // Optional: Merge metadata if your design requires it
          // fieldsToUpdate.metadata = { ...fieldsToUpdate.metadata, ...priceDetails.metadata };
        }
      } catch (priceError) {
        logger.warn(
          `[handleProductUpdated] Could not retrieve details for default price ID '${product.default_price}' for product '${product.id}'. Price-specific fields will not be updated.`,
          { error: priceError, productId: product.id, defaultPriceId: product.default_price }
        );
        // If price retrieval fails, fieldsToUpdate retains product-based values,
        // including 'active: product.active' which was set initially.
      }
    }

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
