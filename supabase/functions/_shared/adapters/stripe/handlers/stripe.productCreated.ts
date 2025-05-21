import Stripe from 'npm:stripe';
import { PaymentConfirmation } from '../../../types/payment.types.ts';
// import { parseProductDescription } from '../../../utils/productDescriptionParser.ts'; // Not needed if not writing to DB
import type { ProductPriceHandlerContext } from '../../../stripe.mock.ts';

export async function handleProductCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const product = event.data.object as Stripe.Product;
  const { logger } = context; // supabaseClient might not be needed if not writing to DB

  logger.info(
    `[handleProductCreated] Handling ${event.type} for product ${product.id}. Active: ${product.active}. Product data will be synced when associated prices are processed. `,
    { eventId: event.id, productId: product.id, active: product.active, livemode: event.livemode }
  );

  // No direct database interaction with subscription_plans for product.created event in this model.
  // The plan entries, keyed by stripe_price_id, will be created/updated by price-related events (price.created, price.updated),
  // which will fetch and include necessary product details at that time.
  // The handleProductUpdated function will handle updates to product information across existing plan records.

  // If other actions unrelated to subscription_plans were needed for product.created, they would go here.

  return {
    success: true,
    transactionId: event.id, // Acknowledge the Stripe event was received and handled by this function
  };
}
