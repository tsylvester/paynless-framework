import type Stripe from 'npm:stripe';
import { stub, type Stub } from 'jsr:@std/testing@0.225.1/mock';
import type { MockStripe } from './types/payment.types.ts';
// Get the actual method types
type CheckoutSessionCreateType = Stripe['checkout']['sessions']['create'];
type WebhookConstructEventType = Stripe['webhooks']['constructEvent'];
type PaymentIntentsRetrieveType = Stripe['paymentIntents']['retrieve'];
type SubscriptionsRetrieveType = Stripe['subscriptions']['retrieve'];
type ProductsRetrieveType = Stripe['products']['retrieve'];



// A simplified mock of the Stripe instance parts we use
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
          lastResponse: {
            headers: {},
            requestId: 'req_default_checkout',
            statusCode: 200,
          },
        } as Stripe.Response<Stripe.Checkout.Session>),
    } as Stripe.Checkout.SessionsResource,
  },
  webhooks: {
    constructEvent: (
      payload: string | Uint8Array, 
      sig: string | string[] | Uint8Array, 
      secret: string,
      tolerance?: number,
      cryptoProvider?: Stripe.CryptoProvider
    ): Stripe.Event =>
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
  paymentIntents: {
    retrieve: (id: string, params?: Stripe.PaymentIntentRetrieveParams, options?: Stripe.RequestOptions) =>
      Promise.resolve({
        id: id,
        object: 'payment_intent',
        status: 'succeeded',
        client_secret: `${id}_secret_default`,
        lastResponse: {
          headers: {},
          requestId: 'req_default_pi_retrieve',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.PaymentIntent>),
  } as Stripe.PaymentIntentsResource,
  subscriptions: {
    retrieve: (id: string, params?: Stripe.SubscriptionRetrieveParams, options?: Stripe.RequestOptions) =>
      Promise.resolve({
        id: id,
        object: 'subscription',
        status: 'active',
        lastResponse: {
          headers: {},
          requestId: 'req_default_sub_retrieve',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.Subscription>),
  } as Stripe.SubscriptionsResource,
  products: {
    retrieve: (id: string, params?: Stripe.ProductRetrieveParams, options?: Stripe.RequestOptions) => 
      Promise.resolve({
        id: id,
        object: 'product' as const,
        active: true,
        name: 'Mocked Product',
        description: 'Default mocked product description',
        metadata: {},
        default_price: null,
        type: 'service',
        marketing_features: [],
        features: [],
        created: Math.floor(Date.now() / 1000),
        updated: Math.floor(Date.now() / 1000),
        livemode: false,
        images: [],
        package_dimensions: null,
        shippable: null,
        tax_code: null,
        url: null,
        lastResponse: {
            headers: {},
            requestId: 'req_default_prod_retrieve',
            statusCode: 200,
        },
      } as Stripe.Response<Stripe.Product | Stripe.DeletedProduct>),
  } as Stripe.ProductsResource,
}) as Stripe;

export function createMockStripe(): MockStripe {
  let mockInstance = getMockStripeInstance();

  const stubs = {
    checkoutSessionsCreate: stub(mockInstance.checkout.sessions, "create"),
    webhooksConstructEvent: stub(mockInstance.webhooks, "constructEvent"),
    paymentIntentsRetrieve: stub(mockInstance.paymentIntents, "retrieve"),
    subscriptionsRetrieve: stub(mockInstance.subscriptions, "retrieve"),
    productsRetrieve: stub(mockInstance.products, "retrieve"),
  };

  const clearStubs = () => {
    stubs.checkoutSessionsCreate.restore();
    stubs.webhooksConstructEvent.restore();
    stubs.paymentIntentsRetrieve.restore();
    stubs.subscriptionsRetrieve.restore();
    stubs.productsRetrieve.restore();
    
    mockInstance = getMockStripeInstance(); 
    stubs.checkoutSessionsCreate = stub(mockInstance.checkout.sessions, "create");
    stubs.webhooksConstructEvent = stub(mockInstance.webhooks, "constructEvent");
    stubs.paymentIntentsRetrieve = stub(mockInstance.paymentIntents, "retrieve");
    stubs.subscriptionsRetrieve = stub(mockInstance.subscriptions, "retrieve");
    stubs.productsRetrieve = stub(mockInstance.products, "retrieve");
  };

  return {
    instance: mockInstance,
    stubs,
    clearStubs,
  };
} 