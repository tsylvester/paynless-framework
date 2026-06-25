import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  OrchestrationLineItem,
  PurchaseRequestItem,
} from "./payment.types.ts";
import {
  isOrchestrationLineItem,
  isPurchaseRequestItem,
} from "./payment.guard.ts";

Deno.test(
  "isPurchaseRequestItem returns true for valid item with non-empty itemId and positive quantity",
  () => {
    const valid: PurchaseRequestItem = {
      itemId: "price_guard_valid",
      quantity: 2,
    };
    assertEquals(isPurchaseRequestItem(valid), true);
  },
);

Deno.test(
  "isPurchaseRequestItem returns true for valid item with quantity of 1",
  () => {
    const valid: PurchaseRequestItem = {
      itemId: "price_guard_min_qty",
      quantity: 1,
    };
    assertEquals(isPurchaseRequestItem(valid), true);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false for null",
  () => {
    const value: null = null;
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false for undefined",
  () => {
    const value: undefined = undefined;
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false for non-object string",
  () => {
    const value = "not-a-purchase-request-item";
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false for non-object number",
  () => {
    const value = 0;
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when itemId is missing",
  () => {
    const value = { quantity: 1 };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when quantity is missing",
  () => {
    const value = { itemId: "price_guard_missing_qty" };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when itemId is empty string",
  () => {
    const value = { itemId: "", quantity: 1 };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when quantity is zero",
  () => {
    const value = { itemId: "price_guard_qty_zero", quantity: 0 };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when quantity is negative",
  () => {
    const value = { itemId: "price_guard_qty_negative", quantity: -1 };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when quantity is not a positive integer",
  () => {
    const value = { itemId: "price_guard_qty_fractional", quantity: 1.5 };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when itemId is not a string",
  () => {
    const value = { itemId: 1, quantity: 1 };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isPurchaseRequestItem returns false when quantity is not a number",
  () => {
    const value = { itemId: "price_guard_qty_string", quantity: "one" };
    assertEquals(isPurchaseRequestItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns true for valid line item with all required fields",
  () => {
    const valid: OrchestrationLineItem = {
      itemId: "price_line_guard",
      stripePriceId: "price_line_guard",
      quantity: 2,
      tokensToAward: 1000,
      planType: "one_time_purchase",
      amount: 20,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(valid), true);
  },
);

Deno.test(
  "isOrchestrationLineItem returns true for valid line item with tokensToAward of 0",
  () => {
    const valid: OrchestrationLineItem = {
      itemId: "price_free_guard",
      stripePriceId: "price_free_guard",
      quantity: 1,
      tokensToAward: 0,
      planType: "one_time_purchase",
      amount: 0,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(valid), true);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false for null",
  () => {
    const value: null = null;
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false for undefined",
  () => {
    const value: undefined = undefined;
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false for non-object string",
  () => {
    const value = "not-an-orchestration-line-item";
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false for non-object number",
  () => {
    const value = 42;
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when itemId is missing",
  () => {
    const value = {
      stripePriceId: "price_missing_item_id",
      quantity: 1,
      tokensToAward: 0,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when stripePriceId is missing",
  () => {
    const value = {
      itemId: "price_missing_stripe_price_id",
      quantity: 1,
      tokensToAward: 0,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when quantity is missing",
  () => {
    const value = {
      itemId: "price_missing_quantity",
      stripePriceId: "price_missing_quantity",
      tokensToAward: 0,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when tokensToAward is missing",
  () => {
    const value = {
      itemId: "price_missing_tokens",
      stripePriceId: "price_missing_tokens",
      quantity: 1,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when planType is missing",
  () => {
    const value = {
      itemId: "price_missing_plan_type",
      stripePriceId: "price_missing_plan_type",
      quantity: 1,
      tokensToAward: 500,
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when amount is missing",
  () => {
    const value = {
      itemId: "price_missing_amount",
      stripePriceId: "price_missing_amount",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when currency is missing",
  () => {
    const value = {
      itemId: "price_missing_currency",
      stripePriceId: "price_missing_currency",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when stripePriceId is empty string",
  () => {
    const value = {
      itemId: "price_empty_stripe_price_id",
      stripePriceId: "",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when itemId has wrong type",
  () => {
    const value = {
      itemId: 1,
      stripePriceId: "price_wrong_item_id_type",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when stripePriceId has wrong type",
  () => {
    const value = {
      itemId: "price_wrong_stripe_price_id_type",
      stripePriceId: true,
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when quantity has wrong type",
  () => {
    const value = {
      itemId: "price_wrong_quantity_type",
      stripePriceId: "price_wrong_quantity_type",
      quantity: "two",
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when tokensToAward has wrong type",
  () => {
    const value = {
      itemId: "price_wrong_tokens_type",
      stripePriceId: "price_wrong_tokens_type",
      quantity: 1,
      tokensToAward: "zero",
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when planType has wrong type",
  () => {
    const value = {
      itemId: "price_wrong_plan_type",
      stripePriceId: "price_wrong_plan_type",
      quantity: 1,
      tokensToAward: 500,
      planType: 0,
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when amount has wrong type",
  () => {
    const value = {
      itemId: "price_wrong_amount_type",
      stripePriceId: "price_wrong_amount_type",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: "fifteen",
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when currency has wrong type",
  () => {
    const value = {
      itemId: "price_wrong_currency_type",
      stripePriceId: "price_wrong_currency_type",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: 1,
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when quantity is zero",
  () => {
    const value = {
      itemId: "price_line_qty_zero",
      stripePriceId: "price_line_qty_zero",
      quantity: 0,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);

Deno.test(
  "isOrchestrationLineItem returns false when quantity is negative",
  () => {
    const value = {
      itemId: "price_line_qty_negative",
      stripePriceId: "price_line_qty_negative",
      quantity: -1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(isOrchestrationLineItem(value), false);
  },
);
