import type Stripe from 'npm:stripe';
import { stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';
import type { Stub } from 'https://deno.land/std@0.224.0/testing/mock.ts';

// Get the actual method types
type CheckoutSessionCreateType = Stripe['checkout']['sessions']['create'];
type WebhookConstructEventType = Stripe['webhooks']['constructEvent'];

// Define a type for the structure of the mocked Stripe, exposing stubs
export interface MockStripe {
  instance: Stripe;
  stubs: {
    checkoutSessionsCreate: Stub<
      Stripe.Checkout.SessionsResource, 
      Parameters<Stripe.Checkout.SessionsResource['create']>, // Use Parameters<T> utility type
      Promise<Stripe.Response<Stripe.Checkout.Session>>
    >;
    webhooksConstructEvent: Stub<
      Stripe.Webhooks, 
      Parameters<Stripe.Webhooks['constructEvent']>, // Use Parameters<T> utility type
      Stripe.Event
    >;
  };
  clearStubs: () => void;
}

// A simplified mock of the Stripe instance parts we use
// We cast to 'Stripe' type, so it needs to satisfy the parts of Stripe our adapter uses.
const getMockStripeInstance = (): Stripe => ({
  checkout: {
    sessions: {
      create: (params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) => 
        Promise.resolve({
          id: 'cs_test_default',
          object: 'checkout.session',
          url: 'https://stripe.com/pay/default',
          status: 'open',
          livemode: false,
          // Minimal compliant Stripe.Response<Stripe.Checkout.Session>
          // Tests should fake this for specific scenarios
        } as Stripe.Checkout.Session) as Promise<Stripe.Response<Stripe.Checkout.Session>>, 
    } as Stripe.Checkout.SessionsResource,
  },
  webhooks: {
    constructEvent: (
      payload: string | Uint8Array, 
      sig: string | string[] | Uint8Array, 
      secret: string,
      tolerance?: number,
      cryptoProvider?: Stripe.CryptoProvider
    ): Stripe.Event =>  // Explicit return type for the function itself
      ({
        id: 'evt_test_default',
        type: 'checkout.session.completed',
        object: 'event', 
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: {
          object: { id: 'cs_test_default_data', object: 'checkout.session' } as Stripe.Checkout.Session 
        }
      } as Stripe.Event),
  } as Stripe.Webhooks,
  // Add other top-level Stripe properties/methods if the adapter uses them
  // For now, casting to Stripe for simplicity, assuming only above are used.
}) as Stripe;

export function createMockStripe(): MockStripe {
  let mockInstance = getMockStripeInstance();

  const stubs = {
    checkoutSessionsCreate: stub(mockInstance.checkout.sessions, "create"),
    webhooksConstructEvent: stub(mockInstance.webhooks, "constructEvent"),
  };

  const clearStubs = () => {
    stubs.checkoutSessionsCreate.restore();
    stubs.webhooksConstructEvent.restore();
    
    mockInstance = getMockStripeInstance(); 
    stubs.checkoutSessionsCreate = stub(mockInstance.checkout.sessions, "create");
    stubs.webhooksConstructEvent = stub(mockInstance.webhooks, "constructEvent");
  };

  return {
    instance: mockInstance,
    stubs,
    clearStubs,
  };
} 