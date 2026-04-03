import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isValidInputTokenCostRate,
  isValidOutputTokenCostRate,
} from "./type_guards.affordability.ts";

Deno.test("Type Guard: isValidInputTokenCostRate", async (t) => {
  await t.step("accepts finite non-negative numbers", () => {
    assert(isValidInputTokenCostRate(0));
    assert(isValidInputTokenCostRate(0.01));
    assert(isValidInputTokenCostRate(1));
  });

  await t.step("rejects NaN", () => {
    assert(!isValidInputTokenCostRate(Number.NaN));
  });

  await t.step("rejects non-finite numbers", () => {
    assert(!isValidInputTokenCostRate(Number.POSITIVE_INFINITY));
    assert(!isValidInputTokenCostRate(Number.NEGATIVE_INFINITY));
  });

  await t.step("rejects negative numbers", () => {
    assert(!isValidInputTokenCostRate(-1));
    assert(!isValidInputTokenCostRate(-0.001));
  });

  await t.step("rejects non-numbers", () => {
    assert(!isValidInputTokenCostRate(undefined));
    assert(!isValidInputTokenCostRate(null));
    assert(!isValidInputTokenCostRate("1"));
    assert(!isValidInputTokenCostRate({}));
  });
});

Deno.test("Type Guard: isValidOutputTokenCostRate", async (t) => {
  await t.step("accepts finite positive numbers", () => {
    assert(isValidOutputTokenCostRate(0.01));
    assert(isValidOutputTokenCostRate(1));
  });

  await t.step("rejects zero", () => {
    assert(!isValidOutputTokenCostRate(0));
  });

  await t.step("rejects NaN", () => {
    assert(!isValidOutputTokenCostRate(Number.NaN));
  });

  await t.step("rejects non-finite numbers", () => {
    assert(!isValidOutputTokenCostRate(Number.POSITIVE_INFINITY));
    assert(!isValidOutputTokenCostRate(Number.NEGATIVE_INFINITY));
  });

  await t.step("rejects negative numbers", () => {
    assert(!isValidOutputTokenCostRate(-1));
    assert(!isValidOutputTokenCostRate(-0.001));
  });

  await t.step("rejects non-numbers", () => {
    assert(!isValidOutputTokenCostRate(undefined));
    assert(!isValidOutputTokenCostRate(null));
    assert(!isValidOutputTokenCostRate("1"));
    assert(!isValidOutputTokenCostRate({}));
  });
});
