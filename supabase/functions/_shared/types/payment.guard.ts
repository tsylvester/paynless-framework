import type {
  OrchestrationLineItem,
  PurchaseRequestItem,
} from "./payment.types.ts";

export function isPurchaseRequestItem(
  value: unknown,
): value is PurchaseRequestItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (!("itemId" in value) || !("quantity" in value)) {
    return false;
  }
  const itemId: unknown = value["itemId"];
  const quantity: unknown = value["quantity"];
  if (typeof itemId !== "string" || itemId.length === 0) {
    return false;
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return false;
  }
  return true;
}

export function isOrchestrationLineItem(
  value: unknown,
): value is OrchestrationLineItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  if (
    !("itemId" in value) ||
    !("stripePriceId" in value) ||
    !("quantity" in value) ||
    !("tokensToAward" in value) ||
    !("planType" in value) ||
    !("amount" in value) ||
    !("currency" in value)
  ) {
    return false;
  }
  const itemId: unknown = value["itemId"];
  const stripePriceId: unknown = value["stripePriceId"];
  const quantity: unknown = value["quantity"];
  const tokensToAward: unknown = value["tokensToAward"];
  const planType: unknown = value["planType"];
  const amount: unknown = value["amount"];
  const currency: unknown = value["currency"];
  if (typeof itemId !== "string") {
    return false;
  }
  if (typeof stripePriceId !== "string" || stripePriceId.length === 0) {
    return false;
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    return false;
  }
  if (typeof tokensToAward !== "number" || Number.isNaN(tokensToAward)) {
    return false;
  }
  if (typeof planType !== "string") {
    return false;
  }
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return false;
  }
  if (typeof currency !== "string") {
    return false;
  }
  return true;
}
