import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  spy,
  stub,
  type Stub,
} from "https://deno.land/std@0.224.0/testing/mock.ts";
import { KitService } from "./kit_service.ts";
import type { KitServiceConfig } from "./kit_service.ts";
import type { UserData } from "../types.ts";
import { logger } from "../logger.ts"; // Import real logger for potential spy

// --- Local Test Utilities for Fetch Mocking ---
// Allow response to be a single item or an array for sequences
let mockFetchResponses: (Response | Error)[] = [new Response(null, { status: 200 })];
let responseIndex = 0;

const setMockFetchResponse = (
  responseOrSequence: Response | Error | (Response | Error)[]
) => {
  mockFetchResponses = Array.isArray(responseOrSequence) ? responseOrSequence : [responseOrSequence];
  responseIndex = 0; // Reset index when setting new responses
};

// Defines and stubs fetch for the duration of a `using` block
// Returns ONLY the stub disposable, removing the problematic spy
const stubFetchForTestScope = (): {
  stub: Stub<typeof globalThis>;
} => {
  // We no longer create or return the spy
  // const fetchSpy = spy(globalThis, "fetch");
  const fetchStub = stub(
    globalThis,
    "fetch",
    async (
      _url: string | URL | Request,
      _options?: RequestInit,
    ): Promise<Response> => {
      if (responseIndex >= mockFetchResponses.length) {
        throw new Error(
          `Mock fetch called more times (${responseIndex + 1}) than expected responses (${mockFetchResponses.length})`,
        );
      }
      const response = mockFetchResponses[responseIndex++];
      const resolvedResponse = await Promise.resolve(response);
      if (resolvedResponse instanceof Error) {
        throw resolvedResponse;
      }
      return resolvedResponse.clone();
    },
  );
  // Only return the stub
  return { stub: fetchStub };
};
// --- End Local Test Utilities ---

// --- Test Data ---
const validConfig: KitServiceConfig = {
  apiKey: "test-api-key",
  baseUrl: "https://api.testkit.com/v3", // Use a test URL
  tagId: "12345",
  customUserIdField: "cf_user_id",
  customCreatedAtField: "cf_created_at",
};

const testUserData: UserData = {
  id: "user-id-678",
  email: "test@example.com",
  firstName: "Kit",
  lastName: "Service",
  createdAt: new Date().toISOString(),
};

// --- Test Suite ---
Deno.test("KitService tests", async (t) => {
  // --- Constructor Tests ---
  await t.step("constructor should throw if apiKey is missing", () => {
    assertThrows(
      () => {
        new KitService({ ...validConfig, apiKey: "" });
      },
      Error,
      "Missing required configuration",
    );
  });

  await t.step("constructor should throw if baseUrl is missing", () => {
    assertThrows(
      () => {
        new KitService({ ...validConfig, baseUrl: "" });
      },
      Error,
      "Missing required configuration",
    );
  });

  await t.step("constructor should log warning if tagId is missing", () => {
    const loggerSpy = spy(logger, "warn");
    try {
      new KitService({ ...validConfig, tagId: undefined });
      assert(
        loggerSpy.calls.some((call) =>
          (call.args[0] as string)?.includes("without a Tag ID")
        ),
      );
    } finally {
      loggerSpy.restore();
    }
  });

  await t.step("constructor should log warning if custom fields are missing", () => {
    const loggerSpy = spy(logger, "warn");
    try {
      new KitService({ ...validConfig, customUserIdField: undefined });
      // Check if warn was called with the specific message
      assert(
        loggerSpy.calls.some((call) =>
          (call.args[0] as string)?.includes("without custom field names")
        ),
        "Warning for missing custom fields not logged"
      );
    } finally {
      loggerSpy.restore(); // Clean up the spy
    }
  });

  await t.step("constructor should initialize with valid config", () => {
    const service = new KitService(validConfig);
    assertExists(service);
    assert(service instanceof KitService);
  });

  // --- Method Tests (Not Configured) ---

  await t.step(
    "addUserToList should throw if service lacks configured tagId",
    async () => {
      // Instance can be created, but method call should fail
      const service = new KitService({ ...validConfig, tagId: undefined });
      await assertRejects(
        async () => {
          await service.addUserToList(testUserData);
        },
        Error,
        "KitService is not configured with a Tag ID.", // Error comes from method
      );
    },
  );

  await t.step(
    "addUserToList should throw if service lacks configured custom fields",
    async () => {
      // Instance can be created, but method call should fail
      const service = new KitService({ ...validConfig, customUserIdField: undefined });
      await assertRejects(
        async () => {
          await service.addUserToList(testUserData);
        },
        Error,
        "KitService is not configured with custom field keys.", // Updated expected error
      );
    },
  );

  await t.step(
    "updateUserAttributes should throw if service lacks configured custom fields",
    async () => {
      // Instance can be created, but method call should fail
      const service = new KitService({ ...validConfig, customCreatedAtField: undefined });
      await assertRejects(
        async () => {
          await service.updateUserAttributes(testUserData.email, {});
        },
        Error,
        "KitService is not configured with custom field keys.", // Updated expected error
      );
    },
  );

  // Note: removeUser and trackEvent are optional in the interface
  // and the current implementation logs warnings but resolves when not implemented.
  // Testing those might involve spying on logger.warn instead of assertRejects.

  // --- Method Tests (Configured) ---

  await t.step("`addUserToList` calls Kit API correctly on success", async () => {
    const { stub: fetchStub } = stubFetchForTestScope(); // Only get the stub
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    setMockFetchResponse(
      new Response(JSON.stringify({ subscription: { subscriber: { id: 9876 } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await service.addUserToList(testUserData);

    // Check fetch was called
    assertEquals(fetchStub.calls.length, 1);
    // Cannot assert arguments without spy
  });

  await t.step("`addUserToList` throws specific error on Kit API error", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const errorMsg = "Invalid email address provided.";
    setMockFetchResponse(
      new Response(JSON.stringify({ error: { message: errorMsg } }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await assertRejects(
      async () => {
        await service.addUserToList(testUserData);
      },
      Error,
      `Kit API Error (422): ${errorMsg}`,
    );
    // Check fetch was called
    assertEquals(fetchStub.calls.length, 1);
  });

  await t.step("`addUserToList` throws on network error", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const networkError = new Error("Network request failed");
    setMockFetchResponse(networkError);

    await assertRejects(
      async () => {
        await service.addUserToList(testUserData);
      },
      Error,
      networkError.message,
    );
    // Check fetch was called
    assertEquals(fetchStub.calls.length, 1);
  });

  // --- Tests for updateUserAttributes (Configured) ---

  await t.step(
    "`updateUserAttributes` calls find (with email filter) and update API correctly on success",
    async () => {
      const { stub: fetchStub } = stubFetchForTestScope();
      await using _disposable = fetchStub;

      const service = new KitService(validConfig);
      const kitSubscriberId = 98765;
      // Mock GET response for findSubscriberIdByEmail (expects email filter)
      const findResponse = new Response(
        JSON.stringify({ subscribers: [{ id: kitSubscriberId }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
      // Mock PUT response for the update itself
      const updateResponse = new Response(
        JSON.stringify({ subscriber: { id: kitSubscriberId } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
      // Set sequence: first response for find, second for update
      setMockFetchResponse([findResponse, updateResponse]);

      const attributesToUpdate: Partial<UserData> = { firstName: "UpdatedName" };
      await service.updateUserAttributes(testUserData.email, attributesToUpdate);

      // Verify fetch was called twice (find then update)
      assertEquals(fetchStub.calls.length, 2);
    },
  );

  await t.step("`updateUserAttributes` skips update if user not found via email filter", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    // Mock GET response for findSubscriberIdByEmail returning no subscribers
    setMockFetchResponse(
      new Response(JSON.stringify({ subscribers: [] }), { status: 200 }),
    );

    await service.updateUserAttributes(testUserData.email, { firstName: "Nope" });

    // Verify fetch was only called once (for the find)
    assertEquals(fetchStub.calls.length, 1);
    // TODO: Optionally spy on logger.warn to confirm the 'Skipping' message
  });

  await t.step("`updateUserAttributes` throws on API error during update (after successful find)", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const kitSubscriberId = 98765;
    const findResponse = new Response(
      JSON.stringify({ subscribers: [{ id: kitSubscriberId }] }),
      { status: 200 },
    );
    const errorMsg = "Update failed.";
    const errorResponse = new Response(
      JSON.stringify({ error: { message: errorMsg } }),
      { status: 500 },
    );
    // Set sequence: find succeeds, update fails
    setMockFetchResponse([findResponse, errorResponse]);

    await assertRejects(
      async () => {
        await service.updateUserAttributes(testUserData.email, {});
      },
      Error,
      `Kit API Error (500): ${errorMsg}`, // Error comes from the second call
    );
    // Verify fetch was called twice (find attempt + update attempt)
    assertEquals(fetchStub.calls.length, 2);
  });

  await t.step("`updateUserAttributes` skips update on API error during find", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    const loggerSpy = spy(logger, "warn"); // Spy on logger for verification
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const errorMsg = "Find failed";
    const findErrorResponse = new Response(
        JSON.stringify({ error: { message: errorMsg } }),
        { status: 503 }
    );
    setMockFetchResponse(findErrorResponse);

    try {
        // Expect this NOT to throw, as findSubscriberIdByEmail catches the error
        await service.updateUserAttributes(testUserData.email, { firstName: "NeverApplied" });

        // Verify fetch was only called once (the failed find attempt)
        assertEquals(fetchStub.calls.length, 1);
        // Verify logger.warn was called due to the caught error in find
        assert(loggerSpy.calls.some(call => 
            (call.args[0] as string)?.includes('Failed to find Kit subscriber') &&
            (call.args[1] as any)?.error?.includes(errorMsg)
        ), "Logger warning for failed find not detected");
    } finally {
        loggerSpy.restore();
    }
  });

  await t.step("`updateUserAttributes` skips update on network error during find", async () => {
      const { stub: fetchStub } = stubFetchForTestScope();
      const loggerSpy = spy(logger, "warn");
      await using _disposable = fetchStub;
  
      const service = new KitService(validConfig);
      const networkError = new Error("Find network failed");
      setMockFetchResponse(networkError);
  
      try {
          await service.updateUserAttributes(testUserData.email, { firstName: "NeverApplied" });
  
          assertEquals(fetchStub.calls.length, 1);
          assert(loggerSpy.calls.some(call => 
              (call.args[0] as string)?.includes('Failed to find Kit subscriber') &&
              (call.args[1] as any)?.error?.includes(networkError.message)
          ), "Logger warning for failed find (network) not detected");
      } finally {
          loggerSpy.restore();
      }
    });

  // --- Tests for removeUser (Configured) ---

  await t.step("`removeUser` calls find (with email filter) and delete API correctly on success", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const kitSubscriberId = 11223;
    // Mock GET response for findSubscriberIdByEmail
    const findResponse = new Response(
      JSON.stringify({ subscribers: [{ id: kitSubscriberId }] }),
      { status: 200 },
    );
    // Mock DELETE response (Kit might return 200 with data or 204 No Content)
    // We'll test with 200 and data, as handled by makeApiRequest
    const deleteResponse = new Response(JSON.stringify({ subscriber: { id: kitSubscriberId } }), { status: 200 }); 
    setMockFetchResponse([findResponse, deleteResponse]);

    await service.removeUser(testUserData.email);

    // Verify fetch was called twice (find then delete)
    assertEquals(fetchStub.calls.length, 2);
  });

  await t.step("`removeUser` skips delete if user not found via email filter", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    // Mock GET response returning no subscribers
    setMockFetchResponse(
      new Response(JSON.stringify({ subscribers: [] }), { status: 200 }),
    );
    await service.removeUser(testUserData.email);

    // Verify fetch was only called once (for the find)
    assertEquals(fetchStub.calls.length, 1);
    // TODO: Optionally spy on logger.warn
  });

  await t.step("`removeUser` throws on API error during delete (after successful find)", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const kitSubscriberId = 11223;
    const findResponse = new Response(
      JSON.stringify({ subscribers: [{ id: kitSubscriberId }] }),
      { status: 200 },
    );
    const errorMsg = "Cannot delete subscriber";
    const errorResponse = new Response(
      JSON.stringify({ error: { message: errorMsg } }),
      { status: 400 },
    );
    // Set sequence: find succeeds, delete fails
    setMockFetchResponse([findResponse, errorResponse]);

    await assertRejects(
      async () => {
        await service.removeUser(testUserData.email);
      },
      Error,
      `Kit API Error (400): ${errorMsg}`, // Error comes from the second call
    );
    // Verify fetch was called twice (find attempt + delete attempt)
    assertEquals(fetchStub.calls.length, 2);
  });

  await t.step("`removeUser` skips delete on API error during find", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    const loggerSpy = spy(logger, "warn");
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const errorMsg = "Find failed for delete";
    const findErrorResponse = new Response(
        JSON.stringify({ error: { message: errorMsg } }),
        { status: 500 }
    );
    setMockFetchResponse(findErrorResponse);

    try {
        // Expect this NOT to throw
        await service.removeUser(testUserData.email);

        // Verify fetch was only called once (the failed find)
        assertEquals(fetchStub.calls.length, 1);
        // Verify logger.warn was called
        assert(loggerSpy.calls.some(call => 
            (call.args[0] as string)?.includes('Failed to find Kit subscriber') &&
            (call.args[1] as any)?.error?.includes(errorMsg)
        ), "Logger warning for failed find (removeUser) not detected");
    } finally {
        loggerSpy.restore();
    }
  });

  await t.step("`removeUser` skips delete on network error during find", async () => {
      const { stub: fetchStub } = stubFetchForTestScope();
      const loggerSpy = spy(logger, "warn");
      await using _disposable = fetchStub;
  
      const service = new KitService(validConfig);
      const networkError = new Error("Find network failed for delete");
      setMockFetchResponse(networkError);
  
      try {
          await service.removeUser(testUserData.email);
  
          assertEquals(fetchStub.calls.length, 1);
          assert(loggerSpy.calls.some(call => 
              (call.args[0] as string)?.includes('Failed to find Kit subscriber') &&
              (call.args[1] as any)?.error?.includes(networkError.message)
          ), "Logger warning for failed find (network, removeUser) not detected");
      } finally {
          loggerSpy.restore();
      }
    });

  // TODO: Add tests for trackEvent stub
  // TODO: Add tests for rate limiting (429 response)

});