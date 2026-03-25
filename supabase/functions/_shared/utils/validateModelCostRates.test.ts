import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { validateModelCostRates, ValidatedCostRates } from "./validateModelCostRates.ts";

Deno.test("validateModelCostRates - returns validated rates for valid positive numbers", () => {
    const result: ValidatedCostRates = validateModelCostRates(1, 2);
    assertEquals(result, { inputRate: 1, outputRate: 2 });
});

Deno.test("validateModelCostRates - returns validated rates when input rate is 0 and output rate is positive", () => {
    const result: ValidatedCostRates = validateModelCostRates(0, 0.01);
    assertEquals(result, { inputRate: 0, outputRate: 0.01 });
});

Deno.test("validateModelCostRates - throws when input_token_cost_rate is null", () => {
    assertThrows(
        () => validateModelCostRates(null, 1),
        Error,
        "Model configuration is missing valid token cost rates.",
    );
});

Deno.test("validateModelCostRates - throws when output_token_cost_rate is null", () => {
    assertThrows(
        () => validateModelCostRates(1, null),
        Error,
        "Model configuration is missing valid token cost rates.",
    );
});

Deno.test("validateModelCostRates - throws when input_token_cost_rate is negative", () => {
    assertThrows(
        () => validateModelCostRates(-0.01, 1),
        Error,
        "Model configuration is missing valid token cost rates.",
    );
});

Deno.test("validateModelCostRates - throws when output_token_cost_rate is 0", () => {
    assertThrows(
        () => validateModelCostRates(1, 0),
        Error,
        "Model configuration is missing valid token cost rates.",
    );
});

Deno.test("validateModelCostRates - throws when output_token_cost_rate is negative", () => {
    assertThrows(
        () => validateModelCostRates(1, -1),
        Error,
        "Model configuration is missing valid token cost rates.",
    );
});

Deno.test("validateModelCostRates - error message matches expected text", () => {
    assertThrows(
        () => validateModelCostRates(null, null),
        Error,
        "Model configuration is missing valid token cost rates.",
    );
});
