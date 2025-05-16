import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
import { parseProductDescription } from '../../../utils/productDescriptionParser.ts'; // Utility for description
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';

export async function handleProductCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const product = event.data.object as Stripe.Product;
  const { logger, supabaseClient } = context;

  logger.info(
    `[handleProductCreated] Handling ${event.type} for product ${product.id}. Active: ${product.active}`,
    { eventId: event.id, productId: product.id, active: product.active, livemode: event.livemode }
  );

  try {
    const parsedDescription = parseProductDescription(product.name, product.description);

    const planDataToUpsert = {
      stripe_product_id: product.id,
      name: product.name,
      description: parsedDescription, // Parsed { subtitle, features }
      active: product.active,
      metadata: product.metadata || {}, // Default to empty object if null/undefined
      // item_id_internal: product.id, // Default internal ID to product ID
      // plan_type: 'product_shell', // Indicate this is a product shell, not a full plan
      // Fields like amount, currency, interval, tokens_awarded will be set by price.created
    };

    logger.info(
      `[handleProductCreated] Prepared data for subscription_plans upsert for product ${product.id}.`,
      { planData: JSON.stringify(planDataToUpsert, null, 2) }
    );

    const { error: upsertError } = await supabaseClient
      .from('subscription_plans')
      .upsert(planDataToUpsert, { onConflict: 'stripe_product_id' });

    if (upsertError) {
      logger.error(
        `[handleProductCreated] Error upserting subscription_plan for product ${product.id}.`,
        { error: upsertError, productId: product.id }
      );
      return {
        success: false,
        error: `Failed to upsert plan for product ${product.id}: ${upsertError.message}`,
        transactionId: event.id,
      };
    }

    logger.info(
      `[handleProductCreated] Successfully upserted product information for product ${product.id}.`
    );
    return {
      success: true,
      transactionId: event.id,
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(
      `[handleProductCreated] Unexpected error processing ${event.type} for product ${product.id}: ${errorMessage}`,
      { error: err, eventId: event.id, productId: product.id }
    );
    return {
      success: false,
      error: `Unexpected error processing ${event.type} for product ${product.id}: ${errorMessage}`,
      transactionId: event.id,
    };
  }
}
