import type { PurchaseRequest } from "../_shared/types/payment.types.ts";
import type {
  MockQueryBuilderState,
  MockResolveQueryResult,
} from "../_shared/supabase.mock.ts";

export const MOCK_USER_ID: string = "usr_initiate_payment_test";
export const MOCK_ORGANIZATION_ID: string = "org_initiate_payment_test";
export const MOCK_ITEM_ID: string = "price_mock_item";
export const MOCK_INVALID_ITEM_ID: string = "price_mock_invalid";
export const MOCK_INCOMPLETE_ITEM_ID: string = "price_mock_incomplete";
export const MOCK_WRONG_CURRENCY_ITEM_ID: string = "price_mock_wrong_currency";
export const MOCK_SUBSCRIPTION_ITEM_ID: string = "price_mock_subscription";
export const MOCK_OTP_ITEM_ID: string = "price_mock_otp";
export const MOCK_OTP_ITEM_2_ID: string = "price_mock_otp_2";

export const MOCK_SUBSCRIPTION_PLAN_TYPE: string = "subscription";
export const MOCK_OTP_PLAN_TYPE: string = "one_time_purchase";

export const MOCK_tokens_to_award: number = 1000;
export const MOCK_ITEM_AMOUNT: number = 10;
export const MOCK_SUBSCRIPTION_tokens_to_award: number = 500;
export const MOCK_SUBSCRIPTION_AMOUNT: number = 15;
export const MOCK_OTP_tokens_to_award: number = 1000;
export const MOCK_OTP_AMOUNT: number = 20;
export const MOCK_OTP_2_tokens_to_award: number = 2000;
export const MOCK_OTP_2_AMOUNT: number = 30;

export const MOCK_CURRENCY: string = "usd";
export const MOCK_WALLET_ID: string = "wallet_initiate_payment_test";
export const MOCK_PAYMENT_TRANSACTION_ID: string = "txn_initiate_payment_test";
export const MOCK_SITE_URL: string = "http://localhost:5173";

function firstRowFromInsertData(
  insertData: MockQueryBuilderState["insertData"],
): Record<string, unknown> {
  if (insertData === null) {
    return {};
  }
  if (Array.isArray(insertData)) {
    const row0: unknown = insertData[0];
    if (typeof row0 === "object" && row0 !== null && !Array.isArray(row0)) {
      return { ...row0 };
    }
    return {};
  }
  return { ...insertData };
}

export async function mockInitiatePaymentSubscriptionPlansSelect(
  state: MockQueryBuilderState,
): Promise<MockResolveQueryResult> {
  const itemIdFilter = state.filters.find(
    (f) => f.column === "stripe_price_id" && f.type === "eq",
  );
  const activeFilter = state.filters.find(
    (f) => f.column === "active" && f.type === "eq" && f.value === true,
  );

  if (itemIdFilter && activeFilter) {
    if (itemIdFilter.value === MOCK_ITEM_ID) {
      return {
        data: [{
          stripe_price_id: MOCK_ITEM_ID,
          item_id_internal: MOCK_ITEM_ID,
          plan_type: MOCK_OTP_PLAN_TYPE,
          tokens_to_award: MOCK_tokens_to_award,
          amount: MOCK_ITEM_AMOUNT,
          currency: MOCK_CURRENCY,
        }],
        error: null,
        count: 1,
        status: 200,
        statusText: "OK",
      };
    }
    if (itemIdFilter.value === MOCK_INCOMPLETE_ITEM_ID) {
      return {
        data: [{
          stripe_price_id: MOCK_INCOMPLETE_ITEM_ID,
          item_id_internal: MOCK_INCOMPLETE_ITEM_ID,
          plan_type: MOCK_OTP_PLAN_TYPE,
          tokens_to_award: null,
          amount: MOCK_ITEM_AMOUNT,
          currency: MOCK_CURRENCY,
        }],
        error: null,
        count: 1,
        status: 200,
        statusText: "OK",
      };
    }
    if (itemIdFilter.value === MOCK_WRONG_CURRENCY_ITEM_ID) {
      return {
        data: [{
          stripe_price_id: MOCK_WRONG_CURRENCY_ITEM_ID,
          item_id_internal: MOCK_WRONG_CURRENCY_ITEM_ID,
          plan_type: MOCK_OTP_PLAN_TYPE,
          tokens_to_award: MOCK_tokens_to_award,
          amount: MOCK_ITEM_AMOUNT,
          currency: "eur",
        }],
        error: null,
        count: 1,
        status: 200,
        statusText: "OK",
      };
    }
    if (itemIdFilter.value === MOCK_INVALID_ITEM_ID) {
      return {
        data: [],
        error: null,
        count: 0,
        status: 200,
        statusText: "OK",
      };
    }
    if (itemIdFilter.value === MOCK_SUBSCRIPTION_ITEM_ID) {
      return {
        data: [{
          stripe_price_id: MOCK_SUBSCRIPTION_ITEM_ID,
          item_id_internal: MOCK_SUBSCRIPTION_ITEM_ID,
          plan_type: MOCK_SUBSCRIPTION_PLAN_TYPE,
          tokens_to_award: MOCK_SUBSCRIPTION_tokens_to_award,
          amount: MOCK_SUBSCRIPTION_AMOUNT,
          currency: MOCK_CURRENCY,
        }],
        error: null,
        count: 1,
        status: 200,
        statusText: "OK",
      };
    }
    if (itemIdFilter.value === MOCK_OTP_ITEM_ID) {
      return {
        data: [{
          stripe_price_id: MOCK_OTP_ITEM_ID,
          item_id_internal: MOCK_OTP_ITEM_ID,
          plan_type: MOCK_OTP_PLAN_TYPE,
          tokens_to_award: MOCK_OTP_tokens_to_award,
          amount: MOCK_OTP_AMOUNT,
          currency: MOCK_CURRENCY,
        }],
        error: null,
        count: 1,
        status: 200,
        statusText: "OK",
      };
    }
    if (itemIdFilter.value === MOCK_OTP_ITEM_2_ID) {
      return {
        data: [{
          stripe_price_id: MOCK_OTP_ITEM_2_ID,
          item_id_internal: MOCK_OTP_ITEM_2_ID,
          plan_type: MOCK_OTP_PLAN_TYPE,
          tokens_to_award: MOCK_OTP_2_tokens_to_award,
          amount: MOCK_OTP_2_AMOUNT,
          currency: MOCK_CURRENCY,
        }],
        error: null,
        count: 1,
        status: 200,
        statusText: "OK",
      };
    }
  }

  const notFoundError: Error = new Error(
    "Mock: Item not found or query unexpected",
  );
  return {
    data: [],
    error: notFoundError,
    count: 0,
    status: 404,
    statusText: "Not Found",
  };
}

export async function mockInitiatePaymentPaymentTransactionsInsert(
  state: MockQueryBuilderState,
): Promise<MockResolveQueryResult> {
  const row: Record<string, unknown> = firstRowFromInsertData(state.insertData);
  return {
    data: [{ id: MOCK_PAYMENT_TRANSACTION_ID, ...row }],
    error: null,
    count: 1,
    status: 201,
    statusText: "Created",
  };
}

export async function mockInitiatePaymentPaymentTransactionsUpdate(
  _state: MockQueryBuilderState,
): Promise<MockResolveQueryResult> {
  return {
    data: [{ id: MOCK_PAYMENT_TRANSACTION_ID }],
    error: null,
    count: 1,
    status: 200,
    statusText: "OK",
  };
}

/** Body parsed by initiatePaymentHandler: await req.json() as PurchaseRequest */
export function mockPurchaseRequest(
  overrides: Partial<PurchaseRequest> = {},
): PurchaseRequest {
  const request: PurchaseRequest = {
    userId: MOCK_USER_ID,
    itemId: MOCK_ITEM_ID,
    quantity: 1,
    currency: MOCK_CURRENCY,
    paymentGatewayId: "stripe",
    ...overrides,
  };
  return request;
}

/** First parameter to initiatePaymentHandler(req, ...) */
export function mockInitiatePaymentRequest(
  method: string,
  urlPath: string,
  body: unknown | null,
  headers: Record<string, string> | undefined,
): Request {
  const url: URL = new URL(urlPath, MOCK_SITE_URL);
  const requestInit: RequestInit = {
    method: method,
    headers: new Headers(headers ?? {}),
  };
  if (body !== null) {
    requestInit.body = JSON.stringify(body);
  }
  const req: Request = new Request(url.toString(), requestInit);
  return req;
}
