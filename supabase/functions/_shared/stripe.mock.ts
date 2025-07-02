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
    pricesRetrieve: Stub<
      Stripe.PricesResource,
      [id: string, options?: Stripe.RequestOptions],
      Promise<Stripe.Response<Stripe.Price>>
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
  prices: {
    retrieve: (id: string, params?: Stripe.PriceRetrieveParams, options?: Stripe.RequestOptions) =>
      Promise.resolve({
        id: id,
        object: 'price',
        active: true,
        currency: 'usd',
        unit_amount: 1000,
        product: 'prod_default',
        lastResponse: {
          headers: {},
          requestId: 'req_default_price_retrieve',
          statusCode: 200,
        },
      } as Stripe.Response<Stripe.Price>),
  } as Stripe.PricesResource,
}) as Stripe;

export function createMockStripe(): MockStripe {
  const mockInstance = getMockStripeInstance();

  const stubs = {
    checkoutSessionsCreate: stub(mockInstance.checkout.sessions, "create"),
    webhooksConstructEvent: stub(mockInstance.webhooks, "constructEventAsync"),
    paymentIntentsRetrieve: stub(mockInstance.paymentIntents, "retrieve"),
    subscriptionsRetrieve: stub(mockInstance.subscriptions, "retrieve"),
    productsRetrieve: stub(mockInstance.products, "retrieve"),
    pricesRetrieve: stub(mockInstance.prices, "retrieve"),
  };

  const clearStubs = () => {
    if (stubs.checkoutSessionsCreate?.restore) {
      stubs.checkoutSessionsCreate.restore();
    }
    if (stubs.webhooksConstructEvent?.restore) {
      stubs.webhooksConstructEvent.restore();
    }
    if (stubs.paymentIntentsRetrieve?.restore) {
      stubs.paymentIntentsRetrieve.restore();
    }
    if (stubs.subscriptionsRetrieve?.restore) {
      stubs.subscriptionsRetrieve.restore();
    }
    if (stubs.productsRetrieve?.restore) {
      stubs.productsRetrieve.restore();
    }
  };

  return {
    instance: mockInstance,
    stubs,
    clearStubs,
  };
} 

// --- MOCK OBJECT CREATORS ---

export const MOCK_DEFAULTS = {
  productId: 'prod_mock_default',
  priceId: 'price_mock_default',
  subItemId: 'si_mock_default',
  subId: 'sub_mock_default',
  invoiceId: 'in_mock_default',
  invoiceLineItemId: 'il_mock_default',
  customerId: 'cus_mock_default',
  userId: 'user_mock_default',
  walletId: 'wallet_mock_default',
  chargeId: 'ch_mock_default',
  paymentIntentId: 'pi_mock_default',
  eventId: 'evt_mock_default',
};

export const createMockProduct = (overrides: Partial<Stripe.Product> = {}): Stripe.Product => ({
  id: MOCK_DEFAULTS.productId,
  object: 'product',
  active: true,
  created: Math.floor(Date.now() / 1000),
  default_price: null,
  description: 'A mock product',
  images: [],
  livemode: false,
  marketing_features: [],
  metadata: {},
  name: 'Mock Product',
  package_dimensions: null,
  shippable: null,
  statement_descriptor: null,
  tax_code: null,
  type: 'service',
  unit_label: null,
  updated: Math.floor(Date.now() / 1000),
  url: null,
  ...overrides,
});

export const createMockPrice = (overrides: Partial<Stripe.Price> = {}): Stripe.Price => {
  const product = typeof overrides.product === 'object' && overrides.product !== null ? overrides.product : createMockProduct({ id: typeof overrides.product === 'string' ? overrides.product : undefined });

  return {
    id: MOCK_DEFAULTS.priceId,
    object: 'price',
    active: true,
    billing_scheme: 'per_unit',
    created: Math.floor(Date.now() / 1000),
    currency: 'usd',
    custom_unit_amount: null,
    livemode: false,
    lookup_key: null,
    metadata: {},
    nickname: 'Mock Price',
    product: product.id,
    recurring: null,
    tax_behavior: 'unspecified',
    tiers_mode: null,
    transform_quantity: null,
    type: 'one_time',
    unit_amount: 1000,
    unit_amount_decimal: '1000',
    ...overrides,
  };
};

export const createMockPlanFromPrice = (price: Stripe.Price): Stripe.Plan => ({
  id: price.id,
  object: 'plan',
  active: price.active,
  amount: price.unit_amount,
  amount_decimal: price.unit_amount_decimal,
  billing_scheme: price.billing_scheme,
  created: price.created,
  currency: price.currency,
  interval: price.recurring?.interval ?? 'month',
  interval_count: price.recurring?.interval_count ?? 1,
  livemode: price.livemode,
  metadata: price.metadata,
  meter: null,
  nickname: price.nickname,
  product: typeof price.product === 'string' ? price.product : price.product?.id,
  tiers: undefined,
  tiers_mode: null,
  transform_usage: null,
  trial_period_days: null,
  usage_type: 'licensed',
});

export const createMockSubscriptionItem = (overrides: Partial<Stripe.SubscriptionItem> = {}): Stripe.SubscriptionItem => {
  const price = createMockPrice(overrides.price);
  const plan = createMockPlanFromPrice(price);
  return {
    id: MOCK_DEFAULTS.subItemId,
    object: 'subscription_item',
    created: Math.floor(Date.now() / 1000),
    discounts: [],
    metadata: {},
    plan: plan,
    price: price,
    quantity: 1,
    subscription: MOCK_DEFAULTS.subId,
    tax_rates: [],
    current_period_end: Math.floor(Date.now() / 1000),
    current_period_start: Math.floor(Date.now() / 1000),
    ...overrides
  };
};

export const createMockSubscription = (overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription => {
    const subId = overrides.id || MOCK_DEFAULTS.subId;
    const customerId = (typeof overrides.customer === 'string' ? overrides.customer : overrides.customer?.id) || MOCK_DEFAULTS.customerId;
    
    // Create a subscription item, ensuring it gets the correct subscription ID
    const subItemOverrides = overrides.items?.data?.[0];
    const subItem = createMockSubscriptionItem({ ...subItemOverrides, subscription: subId });

    return {
        invoice_settings: {
          account_tax_ids: [],
          issuer: { type: 'self' },
        },
        id: subId,
        object: 'subscription',
        application: null,
        application_fee_percent: null,
        automatic_tax: { enabled: false, liability: null, disabled_reason: null },
        billing_cycle_anchor: Math.floor(Date.now() / 1000),
        cancel_at: null,
        cancel_at_period_end: false,
        canceled_at: null,
        cancellation_details: { comment: null, feedback: null, reason: null },
        collection_method: 'charge_automatically',
        created: Math.floor(Date.now() / 1000),
        currency: 'usd',
        customer: customerId,
        days_until_due: null,
        default_payment_method: null,
        default_source: null,
        default_tax_rates: [],
        description: 'Mock Subscription',
        discounts: [],
        ended_at: null,
        items: {
            object: 'list',
            data: [subItem],
            has_more: false,
            url: `/v1/subscription_items?subscription=${subId}`,
        },
        latest_invoice: null,
        livemode: false,
        metadata: {},
        next_pending_invoice_item_invoice: null,
        on_behalf_of: null,
        pause_collection: null,
        payment_settings: {
            payment_method_options: null,
            payment_method_types: null,
            save_default_payment_method: 'off',
        },
        pending_invoice_item_interval: null,
        pending_setup_intent: null,
        pending_update: null,
        schedule: null,
        start_date: Math.floor(Date.now() / 1000),
        status: 'active',
        test_clock: null,
        transfer_data: null,
        trial_end: null,
        trial_settings: { end_behavior: { missing_payment_method: 'create_invoice' } },
        trial_start: null,
        billing_cycle_anchor_config: null,
        ...overrides,
    };
};

export const createMockInvoiceLineItem = (overrides: Partial<Stripe.InvoiceLineItem> = {}): Stripe.InvoiceLineItem => {
  const price = createMockPrice();
  
  return {
    id: MOCK_DEFAULTS.invoiceLineItemId,
    object: 'line_item',
    amount: 1000,
    currency: 'usd',
    description: 'Mock Line Item',
    discount_amounts: [],
    discountable: true,
    discounts: [],
    invoice: MOCK_DEFAULTS.invoiceId,
    livemode: false,
    metadata: {},
    period: {
        start: Math.floor(Date.now() / 1000),
        end: Math.floor(Date.now() / 1000) + 2592000,
    },
    parent: null,
    quantity: 1,
    subscription: MOCK_DEFAULTS.subId,
    ...overrides,
  } as Stripe.InvoiceLineItem;
};

export const createMockInvoice = (overrides: Partial<Stripe.Invoice> = {}): Stripe.Invoice => {
    const invoiceId = overrides.id || MOCK_DEFAULTS.invoiceId;
    const customerId = (typeof overrides.customer === 'string' ? overrides.customer : (overrides.customer as Stripe.Customer)?.id) || MOCK_DEFAULTS.customerId;
    
    const lineItemOverrides = overrides.lines?.data?.[0];
    const lineItemSubId = (lineItemOverrides as Stripe.InvoiceLineItem)?.subscription || MOCK_DEFAULTS.subId;
    const lineItem = createMockInvoiceLineItem({ ...lineItemOverrides, invoice: invoiceId, subscription: lineItemSubId });

    return {
        id: invoiceId,
        object: 'invoice',
        account_country: 'US',
        account_name: 'Mock Account',
        account_tax_ids: null,
        amount_due: 1000,
        amount_paid: 1000,
        amount_remaining: 0,
        amount_shipping: 0,
        amount_overpaid: 0,
        application: null,
        attempt_count: 1,
        attempted: true,
        auto_advance: false,
        billing_reason: 'manual',
        collection_method: 'charge_automatically',
        created: Math.floor(Date.now() / 1000),
        currency: 'usd',
        custom_fields: null,
        customer: customerId,
        customer_address: null,
        customer_email: 'mock@test.com',
        customer_name: 'Mock Customer',
        customer_phone: null,
        customer_shipping: null,
        customer_tax_exempt: 'none',
        customer_tax_ids: [],
        default_payment_method: null,
        default_source: null,
        default_tax_rates: [],
        description: 'Mock Invoice',
        discounts: [],
        due_date: null,
        effective_at: null,
        ending_balance: 0,
        footer: null,
        from_invoice: null,
        hosted_invoice_url: `https://invoice.stripe.com/i/inv_mock_${Date.now()}`,
        invoice_pdf: `https://invoice.stripe.com/i/inv_mock_${Date.now()}/pdf`,
        issuer: { type: 'self' },
        last_finalization_error: null,
        latest_revision: null,
        lines: {
            object: 'list',
            data: [lineItem],
            has_more: false,
            url: `/v1/invoices/${invoiceId}/lines`,
        },
        livemode: false,
        metadata: {},
        next_payment_attempt: null,
        number: `MOCK-${Date.now()}`,
        on_behalf_of: null,
        payment_settings: {
            default_mandate: null,
            payment_method_options: null,
            payment_method_types: null,
        },
        period_end: Math.floor(Date.now() / 1000) + 2592000,
        period_start: Math.floor(Date.now() / 1000),
        post_payment_credit_notes_amount: 0,
        pre_payment_credit_notes_amount: 0,
        receipt_number: null,
        shipping_cost: null,
        shipping_details: null,
        starting_balance: 0,
        statement_descriptor: null,
        status: 'paid',
        status_transitions: {
            finalized_at: Math.floor(Date.now() / 1000),
            marked_uncollectible_at: null,
            paid_at: Math.floor(Date.now() / 1000),
            voided_at: null,
        },
        subtotal: 1000,
        subtotal_excluding_tax: 1000,
        test_clock: null,
        total: 1000,
        total_discount_amounts: [],
        total_excluding_tax: 1000,
        webhooks_delivered_at: Math.floor(Date.now() / 1000),
        ...overrides,
    } as Stripe.Invoice;
};

export const createMockInvoicePaymentSucceededEvent = (
  invoiceOverrides: Partial<Stripe.Invoice> = {},
  eventOverrides: Partial<Omit<Stripe.InvoicePaymentSucceededEvent, 'data' | 'type'>> = {},
): Stripe.InvoicePaymentSucceededEvent => {
    const invoice = createMockInvoice(invoiceOverrides);
    return {
        id: MOCK_DEFAULTS.eventId,
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: invoice,
        },
        livemode: false,
        pending_webhooks: 0,
        request: {
            id: `req_${Date.now()}`,
            idempotency_key: `idem_${Date.now()}`
        },
        type: 'invoice.payment_succeeded',
        ...eventOverrides,
    };
};

export const createMockCheckoutSession = (overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session => {
    const sessionId = overrides.id || `cs_test_${Date.now()}`;
    return {
        id: sessionId,
        object: 'checkout.session',
        adaptive_pricing: null,
        after_expiration: null,
        allow_promotion_codes: null,
        amount_subtotal: 1000,
        amount_total: 1000,
        automatic_tax: { enabled: false, liability: null, status: null },
        billing_address_collection: null,
        cancel_url: 'https://example.com/cancel',
        client_reference_id: null,
        client_secret: null,
        collected_information: null,
        consent: null,
        consent_collection: null,
        created: Math.floor(Date.now() / 1000),
        currency: 'usd',
        currency_conversion: null,
        custom_fields: [],
        custom_text: {
            after_submit: null,
            shipping_address: null,
            submit: null,
            terms_of_service_acceptance: null,
        },
        customer: MOCK_DEFAULTS.customerId,
        customer_creation: 'if_required',
        customer_details: {
            address: null,
            email: 'mock@test.com',
            name: 'Mock Customer',
            phone: null,
            tax_exempt: 'none',
            tax_ids: null,
        },
        customer_email: null,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        invoice: null,
        invoice_creation: {
            enabled: false,
            invoice_data: {
                account_tax_ids: null,
                custom_fields: null,
                description: null,
                footer: null,
                issuer: null,
                metadata: {},
                rendering_options: null,
            },
        },
        livemode: false,
        locale: null,
        metadata: {},
        mode: 'payment',
        payment_intent: MOCK_DEFAULTS.paymentIntentId,
        payment_link: null,
        payment_method_collection: 'if_required',
        payment_method_configuration_details: null,
        payment_method_options: {},
        payment_method_types: ['card'],
        payment_status: 'paid',
        phone_number_collection: { enabled: false },
        recovered_from: null,
        setup_intent: null,
        shipping_address_collection: null,
        shipping_cost: null,
        shipping_options: [],
        status: 'complete',
        submit_type: null,
        subscription: null,
        success_url: 'https://example.com/success',
        total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
        ui_mode: 'hosted',
        url: `https://checkout.stripe.com/pay/${sessionId}`,
        ...overrides,
    } as Stripe.Checkout.Session;
};

export const createMockPaymentIntent = (overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent => ({
    id: MOCK_DEFAULTS.paymentIntentId,
    object: 'payment_intent',
    amount: 1000,
    amount_capturable: 0,
    amount_details: { tip: {} },
    amount_received: 1000,
    application: null,
    application_fee_amount: null,
    automatic_payment_methods: null,
    canceled_at: null,
    cancellation_reason: null,
    capture_method: 'automatic',
    client_secret: `${MOCK_DEFAULTS.paymentIntentId}_secret`,
    confirmation_method: 'automatic',
    created: Math.floor(Date.now() / 1000),
    currency: 'usd',
    customer: MOCK_DEFAULTS.customerId,
    description: null,
    last_payment_error: null,
    latest_charge: MOCK_DEFAULTS.chargeId,
    livemode: false,
    metadata: {},
    next_action: null,
    on_behalf_of: null,
    payment_method: 'pm_card_visa',
    payment_method_configuration_details: null,
    payment_method_options: {
        card: {
            installments: null,
            mandate_options: null,
            network: null,
            request_three_d_secure: 'automatic',
        },
    },
    payment_method_types: ['card'],
    processing: null,
    receipt_email: null,
    review: null,
    setup_future_usage: null,
    shipping: null,
    source: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: 'succeeded',
    transfer_data: null,
    transfer_group: null,
    ...overrides,
});


export const createMockCheckoutSessionCompletedEvent = (
  sessionOverrides: Partial<Stripe.Checkout.Session> = {},
  eventOverrides: Partial<Omit<Stripe.CheckoutSessionCompletedEvent, 'data' | 'type'>> = {},
): Stripe.CheckoutSessionCompletedEvent => {
    const session = createMockCheckoutSession(sessionOverrides);
    return {
        id: MOCK_DEFAULTS.eventId,
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
            object: session,
        },
        livemode: false,
        pending_webhooks: 0,
        request: {
            id: `req_${Date.now()}`,
            idempotency_key: `idem_${Date.now()}`
        },
        type: 'checkout.session.completed',
        ...eventOverrides,
    };
}; 