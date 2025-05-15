import Stripe from 'npm:stripe';
import { ProductPriceHandlerContext } from '../types.ts'; // Using ProductPriceHandlerContext
import { PaymentConfirmation } from '../../../types/payment.types.ts';
// Json import was here, but not used after removing _updatePaymentTransaction calls that used invoke_result.
// import { Json } from '../../../../types_db.ts'; 

// Define a simple type for the expected result of sync-stripe-plans if known, otherwise use any/unknown
interface SyncPlansFunctionResult {
  success: boolean;
  message?: string;
  // add other expected properties
}

export async function handleProductCreated(
  context: ProductPriceHandlerContext,
  event: Stripe.Event // Assuming the product is in event.data.object
): Promise<PaymentConfirmation> {
  const product = event.data.object as Stripe.Product;
  context.logger.info(`[handleProductCreated] Handling ${event.type} for product ${product.id}, Event ID: ${event.id}`);
  const isTestMode = event.livemode === false;

  // Removed _updatePaymentTransaction call for initial processing log

  try {
    context.logger.info(`[handleProductCreated] Invoking sync-stripe-plans function (isTestMode: ${isTestMode}).`);
    const { data: invokeData, error: invokeError } = await context.supabaseClient.functions.invoke<
      SyncPlansFunctionResult 
    >('sync-stripe-plans', {
        body: { isTestMode }, 
    });

    if (invokeError) {
      const errorMessage = invokeError.message || JSON.stringify(invokeError);
      context.logger.error(
          `[handleProductCreated] Error invoking sync-stripe-plans function.`,
          { error: invokeError, functionName: 'sync-stripe-plans', isTestMode }
      );
      // Removed _updatePaymentTransaction call for error logging
      return {
          success: false,
          // message: `Product created, but failed to invoke sync-stripe-plans: ${invokeError.message || JSON.stringify(invokeError)}`,
          error: `Product created, but failed to invoke sync-stripe-plans: ${errorMessage}`,
          // error: { type: 'FunctionInvocationError', details: invokeError }, // Simplified error reporting for PaymentConfirmation
          transactionId: event.id // Added transactionId for consistency
      };
    }

    context.logger.info(
        `[handleProductCreated] Successfully invoked sync-stripe-plans. Result: ${JSON.stringify(invokeData)}`,
    );
    // Removed _updatePaymentTransaction call for success logging
    return {
        success: true,
        // message: 'Product created event processed and plan sync invoked.',
        transactionId: event.id // Return eventId as a reference
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err); // Type check for err
    context.logger.error(
        `[handleProductCreated] Unexpected error: ${errorMessage}`,
        // Pass the original error object if it's an Error, otherwise the stringified version
        { error: err instanceof Error ? err : String(err), eventId: event.id, productId: product.id }
    );
    // Removed _updatePaymentTransaction call for unexpected error
    return {
        success: false,
        // message: `Unexpected error processing product.created: ${err.message}`,
        error: `Unexpected error processing product.created: ${errorMessage}`,
        // error: { type: 'InternalError', details: err }, // Simplified error reporting
        transactionId: event.id
    };
  }
}
