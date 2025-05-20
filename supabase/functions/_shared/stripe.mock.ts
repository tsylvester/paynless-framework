import type Stripe from 'npm:stripe';
import { stub, type Stub } from 'jsr:@std/testing@0.225.1/mock';
import type { SupabaseClient } from 'npm:@supabase/supabase-js';
import type { ITokenWalletService } from './types/tokenWallet.types.ts';
import type { UpdatePaymentTransactionFn } from './types.ts';
import type { ILogger } from './types.ts';

// Get the actual method types
export type CheckoutSessionCreateType = Stripe['checkout']['sessions']['create'];
export type WebhookConstructEventType = Stripe['webhooks']['constructEventAsync'];
export type PaymentIntentsRetrieveType = Stripe['paymentIntents']['retrieve'];
export type SubscriptionsRetrieveType = Stripe['subscriptions']['retrieve'];
export type ProductsRetrieveType = Stripe['products']['retrieve'];

// Define a type for the structure of the mocked Stripe, exposing stubs
export interface MockStripe {
  instance: Stripe;
  stubs: {
    checkoutSessionsCreate: Stub<
      Stripe.Checkout.SessionsResource, 
      Parameters<Stripe.Checkout.SessionsResource['create']>,
      Promise<Stripe.Response<Stripe.Checkout.Session>>
    >;
    webhooksConstructEvent: Stub<
      Stripe.Webhooks, 
      Parameters<Stripe.Webhooks['constructEventAsync']>,
      Promise<Stripe.Event>
    >;
    paymentIntentsRetrieve: Stub<
      Stripe.PaymentIntentsResource,
      Parameters<Stripe.PaymentIntentsResource['retrieve']>,
      Promise<Stripe.Response<Stripe.PaymentIntent>>
    >;
    subscriptionsRetrieve: Stub<
      Stripe.SubscriptionsResource,
      Parameters<Stripe.SubscriptionsResource['retrieve']>,
      Promise<Stripe.Response<Stripe.Subscription>>
    >;
    productsRetrieve: Stub<
      Stripe.ProductsResource,
      [id: string, options?: Stripe.RequestOptions],
      Promise<Stripe.Response<Stripe.Product | Stripe.DeletedProduct>>
    >;
  };
  clearStubs: () => void;
}

export interface HandlerContext {
  stripe: Stripe;
  supabaseClient: SupabaseClient;
  logger: ILogger;
  tokenWalletService: ITokenWalletService;
  updatePaymentTransaction: UpdatePaymentTransactionFn;
  featureFlags?: Record<string, boolean>; // Optional feature flags
  functionsUrl: string; // Base URL for invoking other functions if needed
  stripeWebhookSecret: string; // The specific webhook secret for this adapter
}

// Specific context for product/price handlers that might not need token wallet or full payment transaction updates directly
export interface ProductPriceHandlerContext {
  stripe: Stripe;
  supabaseClient: SupabaseClient;
  logger: ILogger;
  functionsUrl: string;
  stripeWebhookSecret: string;
}


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
        id: 'evt_test_default_sync',
        type: 'charge.succeeded' as Stripe.Event.Type,
        object: 'event', 
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: {
          object: { id: 'cs_test_default_data_sync', object: 'checkout.session' } as Stripe.Checkout.Session 
        }
      } as Stripe.Event),
    constructEventAsync: (
      payload: string | Uint8Array, 
      sig: string | string[] | Uint8Array, 
      secret: string,
      tolerance?: number,
      cryptoProvider?: Stripe.CryptoProvider
    ): Promise<Stripe.Event> =>
      Promise.resolve(({
        id: 'evt_test_default_async',
        type: 'charge.succeeded' as Stripe.Event.Type,
        object: 'event', 
        api_version: '2020-08-27',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: { id: null, idempotency_key: null },
        data: {
          object: { id: 'cs_test_default_data_async', object: 'checkout.session' } as Stripe.Checkout.Session 
        }
      } as Stripe.Event)),
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
    webhooksConstructEvent: stub(mockInstance.webhooks, "constructEventAsync"),
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
    stubs.webhooksConstructEvent = stub(mockInstance.webhooks, "constructEventAsync");
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