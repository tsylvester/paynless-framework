import Stripe from "npm:stripe";
import { ProductPriceHandlerContext, PaymentConfirmation } from "../../../types.ts";
import { Database } from "../../../../types_db.ts";

export async function handlePriceCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event
): Promise<PaymentConfirmation> {
  const { supabaseClient, logger, stripe } = context;
  const price = event.data.object as Stripe.Price;
  const functionName = 'handlePriceCreated';

  logger.info(
    `[${functionName}] Handling ${event.type} for price ${price.id}. Active: ${price.active}, Product ID: ${price.product}`,
    {
      eventId: event.id,
      priceId: price.id,
      productId: price.product,
      active: price.active,
      livemode: event.livemode
    }
  );

  if (price.id === 'price_FREE') {
    logger.info(`[${functionName}] Ignoring price.created event for 'price_FREE'.`, {
      eventId: event.id,
      priceId: price.id
    });
    return {
      success: true,
      transactionId: event.id,
      error: "Price 'price_FREE' event ignored as per specific rule.",
    };
  }

  if (!price.product || typeof price.product !== 'string') {
    logger.error(`[${functionName}] Product ID is missing or not a string on price object.`, { priceId: price.id, productField: price.product });
    return {
      success: false,
      transactionId: event.id,
      error: "Product ID missing or invalid on price object."
    };
  }
  
  if (typeof price.unit_amount !== 'number') {
    logger.error(`[${functionName}] Price ${price.id} has null or undefined unit_amount (${price.unit_amount}), which is required and must be a number. Skipping upsert.`);
    return {
        success: false,
        transactionId: event.id,
        error: `Price ${price.id} has invalid unit_amount. Cannot sync.`
    };
  }

  try {
    let retrievedProduct: Stripe.Product | Stripe.DeletedProduct;
    try {
      retrievedProduct = await stripe.products.retrieve(price.product as string);
    } catch (productRetrieveError) {
      let retrieveErrorMessage = 'Unknown error during product retrieval';
      if (productRetrieveError instanceof Error) {
        retrieveErrorMessage = productRetrieveError.message;
      } else if (typeof productRetrieveError === 'string') {
        retrieveErrorMessage = productRetrieveError;
      }      
      logger.error(`[${functionName}] Error retrieving product ${price.product} from Stripe.`, {
        error: productRetrieveError,
        productId: price.product,
        message: retrieveErrorMessage
      });
      return {
        success: false,
        transactionId: event.id,
        error: `Failed to retrieve product ${price.product} from Stripe: ${retrieveErrorMessage}`
      };
    }

    // If we reach here, retrievedProduct is defined (either Stripe.Product or Stripe.DeletedProduct)

    const productData = retrievedProduct as Stripe.Product | Stripe.DeletedProduct; // Assert type

    if (productData.object === 'product' && productData.deleted === true) {
        // This is how Stripe's type definition for DeletedProduct looks:
        // interface DeletedProduct { id: string; object: 'product'; deleted: true; }
        logger.warn(`[${functionName}] Product ${price.product} is marked as deleted by Stripe. Skipping upsert for price ${price.id}.`, { productId: price.product });
        return {
          success: false,
          transactionId: event.id,
          error: `Product ${price.product} is deleted and cannot be synced.`
        };
    } else if (productData.object === 'product' && !productData.deleted) {
        // This should be a live Stripe.Product.
        // The Stripe.Product type doesn't have a 'deleted' field, or if it did, it would be false.
        const liveProduct = productData as Stripe.Product;
        logger.info(`[${functionName}] Successfully retrieved product ${liveProduct.id} for price ${price.id}.`);

        const planType = price.type === 'one_time' ? 'one_time_purchase' : 'subscription';
        const tokensAwardedString = liveProduct.metadata?.tokens_awarded || price.metadata?.tokens_awarded;
        let tokensAwarded: number | undefined = undefined;
        if (tokensAwardedString) {
          const parsedTokens = parseInt(tokensAwardedString, 10);
          if (!isNaN(parsedTokens)) {
            tokensAwarded = parsedTokens;
          } else {
            logger.warn(`[${functionName}] Invalid non-numeric value for tokens_awarded metadata: "${tokensAwardedString}". Product ID: ${liveProduct.id}, Price ID: ${price.id}. Setting tokens_awarded to undefined.`);
          }
        }
        
        let subtitle = liveProduct.name; // Default to product name
        let features: string[] = [];

        if (liveProduct.description && typeof liveProduct.description === 'string') {
          try {
            const parsedFeatures = JSON.parse(liveProduct.description);
            if (Array.isArray(parsedFeatures) && parsedFeatures.every(f => typeof f === 'string')) {
              features = parsedFeatures;
              // Subtitle remains product name when description is a feature array
            } else {
              // Description is a string, but not a valid JSON array of strings -> use as subtitle
              subtitle = liveProduct.description;
            }
          } catch (e) {
            // JSON.parse failed, so description is a plain string -> use as subtitle
            subtitle = liveProduct.description;
          }
        } else {
          // No product.description, try metadata for subtitle and features
          if (price.metadata?.subtitle && typeof price.metadata.subtitle === 'string') {
            subtitle = price.metadata.subtitle;
          } else if (liveProduct.metadata?.subtitle && typeof liveProduct.metadata.subtitle === 'string') {
            subtitle = liveProduct.metadata.subtitle;
          }

          const featuresString = price.metadata?.features || liveProduct.metadata?.features;
          if (featuresString && typeof featuresString === 'string') {
            features.push(...featuresString.split(',').map(f => f.trim()).filter(f => f));
          }
        }
        
        const intervalValue = price.recurring?.interval ?? (planType === 'one_time_purchase' ? 'day' : 'month');
        const intervalCountValue = price.recurring?.interval_count ?? (planType === 'one_time_purchase' ? 1 : 1 );

        const planData: Database['public']['Tables']['subscription_plans']['Insert'] = {
          stripe_price_id: price.id,
          stripe_product_id: liveProduct.id,
          name: liveProduct.name,
          description: { subtitle, features },
          amount: price.unit_amount,
          currency: price.currency,
          interval: intervalValue,
          interval_count: intervalCountValue,
          active: price.active,
          metadata: { ...liveProduct.metadata, ...price.metadata },
          item_id_internal: liveProduct.metadata?.item_id_internal || price.metadata?.item_id_internal || price.id,
          tokens_awarded: tokensAwarded,
          plan_type: planType,
        };

        logger.info(`[${functionName}] Prepared data for subscription_plans upsert.`, { planData: JSON.stringify(planData, null, 2) });

        const { error: upsertError } = await supabaseClient
          .from('subscription_plans')
          .upsert(planData, { onConflict: 'stripe_price_id' });

        if (upsertError) {
          logger.error(`[${functionName}] Error upserting subscription_plan for price ${price.id}.`, {
            error: upsertError,
            priceId: price.id
          });
          return {
            success: false,
            transactionId: event.id,
            error: `Failed to upsert plan for price ${price.id}: ${upsertError.message}`
          };
        }

        logger.info(`[${functionName}] Successfully upserted plan for price ${price.id}.`);
        return {
          success: true,
          transactionId: event.id,
        };
    } else {
        // Unexpected product object structure
        logger.error(`[${functionName}] Retrieved product ${price.product} is in an unexpected state. Skipping upsert.`, { productData });
        return {
            success: false,
            transactionId: event.id,
            error: `Retrieved product ${price.product} is in an unexpected state.`
        };
    }

  } catch (err) {
    let errorMessage = 'Unexpected error';
    if (err instanceof Error) {
      errorMessage = err.message;
    } else if (typeof err === 'string') {
      errorMessage = err;
    }
    logger.error(
      `[${functionName}] Unexpected error: ${errorMessage}`,
      {
        eventId: event.id,
        priceId: price.id,
        error: err 
      }
    );
    return {
      success: false,
      transactionId: event.id,
      error: `Unexpected error processing price.created: ${errorMessage}`
    };
  }
}
