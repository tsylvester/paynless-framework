import Stripe from "npm:stripe";
import { ProductPriceHandlerContext, PaymentConfirmation } from "../types.ts";
import { TablesUpdate } from "../../../../types_db.ts"; // Adjusted path

export async function handlePriceDeleted(
    context: ProductPriceHandlerContext,
    event: Stripe.Event // Price object is in event.data.object
): Promise<PaymentConfirmation> {
    const { supabaseClient, logger } = context;
    const price = event.data.object as Stripe.Price;
    const functionName = 'handlePriceDeleted'; // For logger clarity
    const targetActiveStatus = false; // When a price is deleted, associated plan should become inactive.

    logger.info(
        `[${functionName}] Handling ${event.type} for price ${price.id}. Setting active to ${targetActiveStatus}.`,
        {
            eventId: event.id,
            priceId: price.id,
            livemode: event.livemode
        }
    );

    if (price.id === 'price_FREE') {
        logger.info(`[${functionName}] Ignoring price.deleted event for 'price_FREE'.`, {
            eventId: event.id,
            priceId: price.id
        });
        return {
            success: true,
            transactionId: event.id,
            error: "Price 'price_FREE' deletion event ignored.", // Using error to convey info
        };
    }

    try {
        const updateData: TablesUpdate<'subscription_plans'> = {
            active: targetActiveStatus,
            updated_at: new Date().toISOString(),
        };

        const { error: updateError, data: updatedPlans } = await supabaseClient
            .from('subscription_plans')
            .update(updateData)
            .eq('stripe_price_id', price.id)
            .select(); // select to see if anything was updated and for logging count

        if (updateError) {
            logger.error(
                `[${functionName}] Error deactivating subscription_plan for deleted price ${price.id}.`,
                {
                    eventId: event.id,
                    priceId: price.id,
                    error: updateError
                }
            );
            return {
                success: false,
                transactionId: event.id,
                error: `Failed to deactivate plan for deleted price ${price.id}: ${updateError.message}`,
            };
        }

        logger.info(
            `[${functionName}] Successfully deactivated ${updatedPlans?.length || 0} subscription plan(s) for deleted price ${price.id}.`,
            {
                eventId: event.id,
                priceId: price.id,
                deactivatedCount: updatedPlans?.length || 0,
            }
        );
        return {
            success: true,
            transactionId: event.id,
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
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
            error: `Unexpected error processing price.deleted: ${errorMessage}`,
        };
    }
}
