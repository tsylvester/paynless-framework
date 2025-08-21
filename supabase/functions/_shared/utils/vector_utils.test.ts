// supabase/functions/_shared/utils/vector_utils.test.ts
import {
  assertAlmostEquals,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cosineSimilarity } from "./vector_utils.ts";

Deno.test("cosineSimilarity: calculates similarity for basic vectors", () => {
  const vecA = [1, 2, 3];
  const vecB = [4, 5, 6];
  const expected = 0.974631846;
  assertAlmostEquals(cosineSimilarity(vecA, vecB), expected, 1e-7, "Failed on basic vector similarity");
});

Deno.test("cosineSimilarity: returns 1 for identical vectors", () => {
  const vecA = [1, 2, 3];
  const vecB = [1, 2, 3];
  assertEquals(cosineSimilarity(vecA, vecB), 1, "Failed on identical vectors");
});

Deno.test("cosineSimilarity: returns 1 for identical long vectors", () => {
    const vecA = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const vecB = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
         assertAlmostEquals(cosineSimilarity(vecA, vecB), 1, 1e-7, "Failed on identical long vectors");
});

Deno.test("cosineSimilarity: returns -1 for opposite vectors", () => {
  const vecA = [1, 2, 3];
  const vecB = [-1, -2, -3];
  assertAlmostEquals(cosineSimilarity(vecA, vecB), -1, 1e-7, "Failed on opposite vectors");
});

Deno.test("cosineSimilarity: returns 0 for orthogonal vectors", () => {
  const vecA = [1, 0];
  const vecB = [0, 1];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed on orthogonal vectors");
});

Deno.test("cosineSimilarity: returns 0 for more complex orthogonal vectors", () => {
    const vecA = [2, 3, -1];
    const vecB = [4, -2, 2]; // dot product is 8 - 6 - 2 = 0
    assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed on complex orthogonal vectors");
});

Deno.test("cosineSimilarity: returns 0 for vectors with different lengths", () => {
  const vecA = [1, 2, 3];
  const vecB = [1, 2];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed on different length vectors");
});

Deno.test("cosineSimilarity: returns 0 when one vector is a zero vector", () => {
  const vecA = [1, 2, 3];
  const vecB = [0, 0, 0];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed when one vector is zero");
});

Deno.test("cosineSimilarity: returns 0 when both vectors are zero vectors", () => {
    const vecA = [0, 0, 0];
    const vecB = [0, 0, 0];
    assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed when both vectors are zero");
});

Deno.test("cosineSimilarity: returns 0 for empty vectors", () => {
  const vecA: number[] = [];
  const vecB: number[] = [];
  assertEquals(cosineSimilarity(vecA, vecB), 0, "Failed for empty vectors");
});

