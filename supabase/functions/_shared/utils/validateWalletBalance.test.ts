import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateWalletBalance } from "./validateWalletBalance.ts";

Deno.test("validateWalletBalance - returns parsed number for valid positive integer string", () => {
    const result: number = validateWalletBalance("1000", "w1");
    assertEquals(result, 1000);
});

Deno.test("validateWalletBalance - returns parsed number for valid decimal string", () => {
    const result: number = validateWalletBalance("99.5", "w1");
    assertEquals(result, 99.5);
});

Deno.test("validateWalletBalance - returns 0 for the string '0'", () => {
    const result: number = validateWalletBalance("0", "w1");
    assertEquals(result, 0);
});

Deno.test("validateWalletBalance - throws for NaN-producing input", () => {
    assertThrows(
        () => validateWalletBalance("abc", "w1"),
        Error,
        "Could not parse wallet balance for walletId: w1",
    );
});

Deno.test("validateWalletBalance - throws for Infinity", () => {
    assertThrows(
        () => validateWalletBalance("Infinity", "w1"),
        Error,
        "Could not parse wallet balance for walletId: w1",
    );
});

Deno.test("validateWalletBalance - throws for negative values", () => {
    assertThrows(
        () => validateWalletBalance("-1", "w1"),
        Error,
        "Could not parse wallet balance for walletId: w1",
    );
});

Deno.test("validateWalletBalance - throws for empty string", () => {
    assertThrows(
        () => validateWalletBalance("", "w1"),
        Error,
        "Could not parse wallet balance for walletId: w1",
    );
});

Deno.test("validateWalletBalance - error message includes wallet ID for diagnostics", () => {
    assertThrows(
        () => validateWalletBalance("abc", "wallet-xyz"),
        Error,
        "wallet-xyz",
    );
});
