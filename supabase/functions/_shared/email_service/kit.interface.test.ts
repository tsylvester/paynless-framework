import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  KitApiErrorBody,
  KitApiNestedError,
  KitSubscribersListResponse,
  KitSubscriberResponse,
  MakeApiRequestSuccess,
  MakeApiRequestFailure,
  FindSubscriberByEmailSuccess,
  FindSubscriberByEmailFailure,
} from "./kit.interface.ts";
import {
  isKitApiErrorBody,
  isKitApiNestedError,
  isKitSubscribersListResponse,
  isKitSubscriberResponse,
  isMakeApiRequestSuccess,
  isMakeApiRequestFailure,
  isFindSubscriberByEmailSuccess,
  isFindSubscriberByEmailFailure,
} from "./kit.interface.guards.ts";

// --- isKitApiNestedError ---

Deno.test("isKitApiNestedError", async (t) => {
  await t.step("returns true for object with string message", () => {
    const valid: KitApiNestedError = { message: "Something went wrong" };
    assertEquals(isKitApiNestedError(valid), true);
  });

  await t.step("returns false for null", () => {
    assertEquals(isKitApiNestedError(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isKitApiNestedError(undefined), false);
  });

  await t.step("returns false for string", () => {
    assertEquals(isKitApiNestedError("error"), false);
  });

  await t.step("returns false for object without message", () => {
    assertEquals(isKitApiNestedError({ code: 422 }), false);
  });

  await t.step("returns false for object with non-string message", () => {
    assertEquals(isKitApiNestedError({ message: 123 }), false);
  });

  await t.step("returns false for empty object", () => {
    assertEquals(isKitApiNestedError({}), false);
  });
});

// --- isKitApiErrorBody ---

Deno.test("isKitApiErrorBody", async (t) => {
  await t.step("returns true for nested error shape { error: { message } }", () => {
    const valid: KitApiErrorBody = { error: { message: "Not found" } };
    assertEquals(isKitApiErrorBody(valid), true);
  });

  await t.step("returns true for top-level message shape { message }", () => {
    const valid: KitApiErrorBody = { message: "Rate limited" };
    assertEquals(isKitApiErrorBody(valid), true);
  });

  await t.step("returns true for both nested error and top-level message", () => {
    const valid: KitApiErrorBody = {
      error: { message: "Detailed error" },
      message: "General error",
    };
    assertEquals(isKitApiErrorBody(valid), true);
  });

  await t.step("returns false for null", () => {
    assertEquals(isKitApiErrorBody(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isKitApiErrorBody(undefined), false);
  });

  await t.step("returns false for empty object (no error, no message)", () => {
    assertEquals(isKitApiErrorBody({}), false);
  });

  await t.step("returns false for object with non-object error field", () => {
    assertEquals(isKitApiErrorBody({ error: "string" }), false);
  });

  await t.step("returns false for object with error missing message", () => {
    assertEquals(isKitApiErrorBody({ error: { code: 500 } }), false);
  });

  await t.step("returns false for object with non-string message", () => {
    assertEquals(isKitApiErrorBody({ message: 42 }), false);
  });

  await t.step("returns false for string", () => {
    assertEquals(isKitApiErrorBody("error"), false);
  });

  await t.step("returns false for number", () => {
    assertEquals(isKitApiErrorBody(500), false);
  });
});

// --- isKitSubscribersListResponse ---

Deno.test("isKitSubscribersListResponse", async (t) => {
  await t.step("returns true for valid response with subscribers array", () => {
    const valid: KitSubscribersListResponse = {
      subscribers: [{ id: 1 }, { id: 2 }],
    };
    assertEquals(isKitSubscribersListResponse(valid), true);
  });

  await t.step("returns true for empty subscribers array", () => {
    const valid: KitSubscribersListResponse = { subscribers: [] };
    assertEquals(isKitSubscribersListResponse(valid), true);
  });

  await t.step("returns false for null", () => {
    assertEquals(isKitSubscribersListResponse(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isKitSubscribersListResponse(undefined), false);
  });

  await t.step("returns false for object without subscribers", () => {
    assertEquals(isKitSubscribersListResponse({ data: [] }), false);
  });

  await t.step("returns false for subscribers as non-array", () => {
    assertEquals(isKitSubscribersListResponse({ subscribers: "not-array" }), false);
  });

  await t.step("returns false for subscribers array with non-object items", () => {
    assertEquals(isKitSubscribersListResponse({ subscribers: ["a", "b"] }), false);
  });

  await t.step("returns false for subscribers array with items missing id", () => {
    assertEquals(isKitSubscribersListResponse({ subscribers: [{ name: "x" }] }), false);
  });

  await t.step("returns false for subscribers array with non-number id", () => {
    assertEquals(isKitSubscribersListResponse({ subscribers: [{ id: "abc" }] }), false);
  });
});

// --- isKitSubscriberResponse ---

Deno.test("isKitSubscriberResponse", async (t) => {
  await t.step("returns true for valid response with subscriber object", () => {
    const valid: KitSubscriberResponse = { subscriber: { id: 123 } };
    assertEquals(isKitSubscriberResponse(valid), true);
  });

  await t.step("returns false for null", () => {
    assertEquals(isKitSubscriberResponse(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isKitSubscriberResponse(undefined), false);
  });

  await t.step("returns false for object without subscriber", () => {
    assertEquals(isKitSubscriberResponse({ data: { id: 1 } }), false);
  });

  await t.step("returns false for subscriber as non-object", () => {
    assertEquals(isKitSubscriberResponse({ subscriber: 123 }), false);
  });

  await t.step("returns false for subscriber missing id", () => {
    assertEquals(isKitSubscriberResponse({ subscriber: { name: "x" } }), false);
  });

  await t.step("returns false for subscriber with non-number id", () => {
    assertEquals(isKitSubscriberResponse({ subscriber: { id: "abc" } }), false);
  });
});

// --- isMakeApiRequestSuccess ---

Deno.test("isMakeApiRequestSuccess", async (t) => {
  await t.step("returns true for success branch with data and no error", () => {
    const valid: MakeApiRequestSuccess<string> = { data: "hello" };
    assertEquals(isMakeApiRequestSuccess(valid), true);
  });

  await t.step("returns true for success branch with data and undefined error", () => {
    const valid: MakeApiRequestSuccess<number> = { data: 42, error: undefined };
    assertEquals(isMakeApiRequestSuccess(valid), true);
  });

  await t.step("returns false for failure branch with error", () => {
    const failure: MakeApiRequestFailure = {
      error: { message: "bad request" },
    };
    assertEquals(isMakeApiRequestSuccess(failure), false);
  });

  await t.step("returns false for null", () => {
    assertEquals(isMakeApiRequestSuccess(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isMakeApiRequestSuccess(undefined), false);
  });

  await t.step("returns false for object without data", () => {
    assertEquals(isMakeApiRequestSuccess({ value: 1 }), false);
  });
});

// --- isMakeApiRequestFailure ---

Deno.test("isMakeApiRequestFailure", async (t) => {
  await t.step("returns true for failure branch with error object", () => {
    const failure: MakeApiRequestFailure = {
      error: { message: "not found" },
    };
    assertEquals(isMakeApiRequestFailure(failure), true);
  });

  await t.step("returns true for failure branch with error and status", () => {
    const failure: MakeApiRequestFailure = {
      error: { message: "server error", status: 500 },
    };
    assertEquals(isMakeApiRequestFailure(failure), true);
  });

  await t.step("returns false for success branch with data", () => {
    const success: MakeApiRequestSuccess<string> = { data: "ok" };
    assertEquals(isMakeApiRequestFailure(success), false);
  });

  await t.step("returns false for null", () => {
    assertEquals(isMakeApiRequestFailure(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isMakeApiRequestFailure(undefined), false);
  });

  await t.step("returns false for object with non-object error", () => {
    assertEquals(isMakeApiRequestFailure({ error: "string" }), false);
  });

  await t.step("returns false for error object missing message", () => {
    assertEquals(isMakeApiRequestFailure({ error: { code: 500 } }), false);
  });
});

// --- isFindSubscriberByEmailSuccess ---

Deno.test("isFindSubscriberByEmailSuccess", async (t) => {
  await t.step("returns true for success branch with numeric data", () => {
    const valid: FindSubscriberByEmailSuccess = { data: 12345 };
    assertEquals(isFindSubscriberByEmailSuccess(valid), true);
  });

  await t.step("returns true for success branch with data and undefined error", () => {
    const valid: FindSubscriberByEmailSuccess = { data: 1, error: undefined };
    assertEquals(isFindSubscriberByEmailSuccess(valid), true);
  });

  await t.step("returns false for failure branch with error", () => {
    const failure: FindSubscriberByEmailFailure = {
      error: { message: "not found" },
    };
    assertEquals(isFindSubscriberByEmailSuccess(failure), false);
  });

  await t.step("returns false for success with non-number data", () => {
    assertEquals(isFindSubscriberByEmailSuccess({ data: "abc" }), false);
  });

  await t.step("returns false for null", () => {
    assertEquals(isFindSubscriberByEmailSuccess(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isFindSubscriberByEmailSuccess(undefined), false);
  });
});

// --- isFindSubscriberByEmailFailure ---

Deno.test("isFindSubscriberByEmailFailure", async (t) => {
  await t.step("returns true for failure branch with error object", () => {
    const failure: FindSubscriberByEmailFailure = {
      error: { message: "connection failed" },
    };
    assertEquals(isFindSubscriberByEmailFailure(failure), true);
  });

  await t.step("returns true for failure branch with error and status", () => {
    const failure: FindSubscriberByEmailFailure = {
      error: { message: "timeout", status: 504 },
    };
    assertEquals(isFindSubscriberByEmailFailure(failure), true);
  });

  await t.step("returns false for success branch with data", () => {
    const success: FindSubscriberByEmailSuccess = { data: 999 };
    assertEquals(isFindSubscriberByEmailFailure(success), false);
  });

  await t.step("returns false for null", () => {
    assertEquals(isFindSubscriberByEmailFailure(null), false);
  });

  await t.step("returns false for undefined", () => {
    assertEquals(isFindSubscriberByEmailFailure(undefined), false);
  });

  await t.step("returns false for object with non-object error", () => {
    assertEquals(isFindSubscriberByEmailFailure({ error: 404 }), false);
  });

  await t.step("returns false for error object missing message", () => {
    assertEquals(isFindSubscriberByEmailFailure({ error: { status: 500 } }), false);
  });
});
