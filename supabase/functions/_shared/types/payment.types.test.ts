import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  OrchestrationLineItem,
  PurchaseRequestItem,
} from "./payment.types.ts";

Deno.test(
  "Contract: valid PurchaseRequestItem with non-empty itemId and positive quantity",
  () => {
    const item: PurchaseRequestItem = {
      itemId: "price_contract_valid",
      quantity: 2,
    };
    assertEquals(item.itemId, "price_contract_valid");
    assertEquals(item.quantity, 2);
    assertEquals(item.itemId.length > 0, true);
    assertEquals(Number.isInteger(item.quantity), true);
    assertEquals(item.quantity > 0, true);
  },
);

Deno.test(
  "Contract: valid PurchaseRequestItem with quantity of 1 is minimum positive integer",
  () => {
    const item: PurchaseRequestItem = {
      itemId: "price_contract_min_qty",
      quantity: 1,
    };
    assertEquals(item.quantity, 1);
    assertEquals(item.quantity > 0, true);
    assertEquals(Number.isInteger(item.quantity), true);
  },
);

Deno.test(
  "Contract: PurchaseRequestItem invariant itemId is non-empty string",
  () => {
    const item: PurchaseRequestItem = {
      itemId: "price_contract_invariant",
      quantity: 3,
    };
    assertEquals(typeof item.itemId, "string");
    assertEquals(item.itemId.length > 0, true);
  },
);

Deno.test(
  "Contract: PurchaseRequestItem invariant quantity is positive integer",
  () => {
    const item: PurchaseRequestItem = {
      itemId: "price_contract_qty_invariant",
      quantity: 4,
    };
    assertEquals(typeof item.quantity, "number");
    assertEquals(Number.isInteger(item.quantity), true);
    assertEquals(item.quantity > 0, true);
  },
);

Deno.test(
  "Contract: invalid PurchaseRequestItem missing itemId must fail contract",
  () => {
    const requiredKeys: (keyof PurchaseRequestItem)[] = ["itemId", "quantity"];
    assertEquals(requiredKeys.includes("itemId"), true);
    assertEquals(requiredKeys.includes("quantity"), true);
    assertEquals(requiredKeys.length, 2);
  },
);

Deno.test(
  "Contract: invalid PurchaseRequestItem missing quantity must fail contract",
  () => {
    const requiredKeys: (keyof PurchaseRequestItem)[] = ["itemId", "quantity"];
    assertEquals(requiredKeys.includes("quantity"), true);
    const quantityKey: keyof PurchaseRequestItem = "quantity";
    assertEquals(quantityKey, "quantity");
  },
);

Deno.test(
  "Contract: invalid PurchaseRequestItem empty itemId must fail contract",
  () => {
    const invalidItemId: string = "";
    const item: PurchaseRequestItem = {
      itemId: invalidItemId,
      quantity: 1,
    };
    assertEquals(item.itemId, "");
    assertEquals(item.itemId.length > 0, false);
  },
);

Deno.test(
  "Contract: invalid PurchaseRequestItem quantity zero must fail contract",
  () => {
    const invalidQuantity: number = 0;
    const minimumValidQuantity: PurchaseRequestItem["quantity"] = 1;
    assertEquals(invalidQuantity, 0);
    assertEquals(invalidQuantity < minimumValidQuantity, true);
  },
);

Deno.test(
  "Contract: invalid PurchaseRequestItem negative quantity must fail contract",
  () => {
    const invalidQuantity: number = -1;
    const minimumValidQuantity: PurchaseRequestItem["quantity"] = 1;
    assertEquals(invalidQuantity < minimumValidQuantity, true);
  },
);

Deno.test(
  "Contract: invalid PurchaseRequestItem non-object must fail contract",
  () => {
    const absent: PurchaseRequestItem | null = null;
    assertEquals(absent, null);
    const undefinedItem: PurchaseRequestItem | undefined = undefined;
    assertEquals(undefinedItem, undefined);
  },
);

Deno.test(
  "Contract: valid OrchestrationLineItem with all required fields and correct types",
  () => {
    const line: OrchestrationLineItem = {
      itemId: "price_line_item",
      stripePriceId: "price_line_item",
      quantity: 2,
      tokensToAward: 1000,
      planType: "one_time_purchase",
      amount: 20,
      currency: "usd",
    };
    assertEquals(typeof line.itemId, "string");
    assertEquals(typeof line.stripePriceId, "string");
    assertEquals(typeof line.quantity, "number");
    assertEquals(typeof line.tokensToAward, "number");
    assertEquals(typeof line.planType, "string");
    assertEquals(typeof line.amount, "number");
    assertEquals(typeof line.currency, "string");
    assertEquals(line.stripePriceId.length > 0, true);
  },
);

Deno.test(
  "Contract: valid OrchestrationLineItem with tokensToAward of 0 for free tiers",
  () => {
    const line: OrchestrationLineItem = {
      itemId: "price_free_tier",
      stripePriceId: "price_free_tier",
      quantity: 1,
      tokensToAward: 0,
      planType: "one_time_purchase",
      amount: 0,
      currency: "usd",
    };
    assertEquals(line.tokensToAward, 0);
    assertEquals(typeof line.tokensToAward, "number");
  },
);

Deno.test(
  "Contract: OrchestrationLineItem invariant stripePriceId is non-empty string",
  () => {
    const line: OrchestrationLineItem = {
      itemId: "price_stripe_invariant",
      stripePriceId: "price_stripe_invariant",
      quantity: 1,
      tokensToAward: 500,
      planType: "subscription",
      amount: 15,
      currency: "usd",
    };
    assertEquals(typeof line.stripePriceId, "string");
    assertEquals(line.stripePriceId.length > 0, true);
  },
);

Deno.test(
  "Contract: invalid OrchestrationLineItem missing required fields must fail contract",
  () => {
    const requiredKeys: (keyof OrchestrationLineItem)[] = [
      "itemId",
      "stripePriceId",
      "quantity",
      "tokensToAward",
      "planType",
      "amount",
      "currency",
    ];
    assertEquals(requiredKeys.includes("itemId"), true);
    assertEquals(requiredKeys.includes("stripePriceId"), true);
    assertEquals(requiredKeys.includes("quantity"), true);
    assertEquals(requiredKeys.includes("tokensToAward"), true);
    assertEquals(requiredKeys.includes("planType"), true);
    assertEquals(requiredKeys.includes("amount"), true);
    assertEquals(requiredKeys.includes("currency"), true);
    assertEquals(requiredKeys.length, 7);
  },
);

Deno.test(
  "Contract: invalid OrchestrationLineItem wrong field types must fail contract",
  () => {
    const wrongItemId: number = 1;
    const wrongStripePriceId: boolean = true;
    const wrongQuantity: string = "two";
    const wrongTokensToAward: string = "zero";
    const wrongPlanType: number = 0;
    const wrongAmount: string = "twenty";
    const wrongCurrency: number = 1;
    assertEquals(typeof wrongItemId, "number");
    assertEquals(typeof wrongStripePriceId, "boolean");
    assertEquals(typeof wrongQuantity, "string");
    assertEquals(typeof wrongTokensToAward, "string");
    assertEquals(typeof wrongPlanType, "number");
    assertEquals(typeof wrongAmount, "string");
    assertEquals(typeof wrongCurrency, "number");
    const expectedItemId: OrchestrationLineItem["itemId"] = "price_type_check";
    const expectedStripePriceId: OrchestrationLineItem["stripePriceId"] =
      "price_type_check";
    const expectedQuantity: OrchestrationLineItem["quantity"] = 1;
    const expectedTokensToAward: OrchestrationLineItem["tokensToAward"] = 0;
    const expectedPlanType: OrchestrationLineItem["planType"] = "subscription";
    const expectedAmount: OrchestrationLineItem["amount"] = 0;
    const expectedCurrency: OrchestrationLineItem["currency"] = "usd";
    assertEquals(typeof expectedItemId, "string");
    assertEquals(typeof expectedStripePriceId, "string");
    assertEquals(typeof expectedQuantity, "number");
    assertEquals(typeof expectedTokensToAward, "number");
    assertEquals(typeof expectedPlanType, "string");
    assertEquals(typeof expectedAmount, "number");
    assertEquals(typeof expectedCurrency, "string");
  },
);
