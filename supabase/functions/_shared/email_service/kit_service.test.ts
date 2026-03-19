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
import type { KitServiceConfig } from "./kit.interface.ts";
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
  baseUrl: "https://api.kit.com",
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

  await t.step("`addUserToList` calls POST /v4/subscribers with email_address and X-Kit-Api-Key header", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    setMockFetchResponse(
      new Response(JSON.stringify({ subscriber: { id: 9876 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await service.addUserToList(testUserData);

    // Check fetch was called once
    assertEquals(fetchStub.calls.length, 1);
    // Assert v4 endpoint
    const calledUrl: string = fetchStub.calls[0].args[0] as string;
    assertStringIncludes(calledUrl, "/v4/subscribers");
    // Assert auth header
    const calledOptions: RequestInit = fetchStub.calls[0].args[1] as RequestInit;
    const headers: Record<string, string> = calledOptions.headers as Record<string, string>;
    assertEquals(headers["X-Kit-Api-Key"], validConfig.apiKey);
    // Assert email_address field in body (not "email")
    const body: Record<string, unknown> = JSON.parse(calledOptions.body as string);
    assertEquals(body.email_address, testUserData.email);
    // Assert no api_key in body
    assertEquals(body.api_key, undefined);
    // Assert method is POST
    assertEquals(calledOptions.method, "POST");
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
    "`updateUserAttributes` calls find via GET /v4/subscribers and PATCH /v4/subscribers/{id}",
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
      // Mock PATCH response for the update itself
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
      // Assert find call uses v4 endpoint with email_address and X-Kit-Api-Key header
      const findUrl: string = fetchStub.calls[0].args[0] as string;
      assertStringIncludes(findUrl, "/v4/subscribers");
      assertStringIncludes(findUrl, `email_address=${encodeURIComponent(testUserData.email)}`);
      const findOptions: RequestInit = fetchStub.calls[0].args[1] as RequestInit;
      const findHeaders: Record<string, string> = findOptions.headers as Record<string, string>;
      assertEquals(findHeaders["X-Kit-Api-Key"], validConfig.apiKey);
      // Assert update call uses PATCH (not PUT) on v4 endpoint
      const updateUrl: string = fetchStub.calls[1].args[0] as string;
      assertStringIncludes(updateUrl, `/v4/subscribers/${kitSubscriberId}`);
      const updateOptions: RequestInit = fetchStub.calls[1].args[1] as RequestInit;
      assertEquals(updateOptions.method, "PATCH");
      const updateHeaders: Record<string, string> = updateOptions.headers as Record<string, string>;
      assertEquals(updateHeaders["X-Kit-Api-Key"], validConfig.apiKey);
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

  await t.step("`removeUser` calls find and DELETE /v4/subscribers/{id} with X-Kit-Api-Key header", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const kitSubscriberId = 11223;
    // Mock GET response for findSubscriberIdByEmail
    const findResponse = new Response(
      JSON.stringify({ subscribers: [{ id: kitSubscriberId }] }),
      { status: 200 },
    );
    // Mock DELETE response (Kit v4 returns 204 No Content on success)
    const deleteResponse = new Response(null, { status: 204 });
    setMockFetchResponse([findResponse, deleteResponse]);

    await service.removeUser(testUserData.email);

    // Verify fetch was called twice (find then delete)
    assertEquals(fetchStub.calls.length, 2);
    // Assert delete call uses v4 endpoint
    const deleteUrl: string = fetchStub.calls[1].args[0] as string;
    assertStringIncludes(deleteUrl, `/v4/subscribers/${kitSubscriberId}`);
    const deleteOptions: RequestInit = fetchStub.calls[1].args[1] as RequestInit;
    assertEquals(deleteOptions.method, "DELETE");
    const deleteHeaders: Record<string, string> = deleteOptions.headers as Record<string, string>;
    assertEquals(deleteHeaders["X-Kit-Api-Key"], validConfig.apiKey);
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

  // --- Tests for makeApiRequest auth header ---

  await t.step("`makeApiRequest` sends X-Kit-Api-Key header for GET requests, not api_key in query", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    // findSubscriberIdByEmail makes a GET request internally
    setMockFetchResponse(
      new Response(JSON.stringify({ subscribers: [] }), { status: 200 }),
    );

    await service.updateUserAttributes(testUserData.email, { firstName: "Test" });

    assertEquals(fetchStub.calls.length, 1);
    const calledUrl: string = fetchStub.calls[0].args[0] as string;
    // Assert no api_key in query string
    assert(!calledUrl.includes("api_key="), "URL should not contain api_key query parameter");
    // Assert X-Kit-Api-Key header is present
    const calledOptions: RequestInit = fetchStub.calls[0].args[1] as RequestInit;
    const headers: Record<string, string> = calledOptions.headers as Record<string, string>;
    assertEquals(headers["X-Kit-Api-Key"], validConfig.apiKey);
  });

  // --- Tests for addTagToSubscriber ---

  await t.step("`addTagToSubscriber` calls POST /v4/tags/{tagId}/subscribers with email_address", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const tagId = "99887";
    setMockFetchResponse(
      new Response(JSON.stringify({ subscriber: { id: 123 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await service.addTagToSubscriber(testUserData.email, tagId);

    assertEquals(fetchStub.calls.length, 1);
    const calledUrl: string = fetchStub.calls[0].args[0] as string;
    assertStringIncludes(calledUrl, `/v4/tags/${tagId}/subscribers`);
    const calledOptions: RequestInit = fetchStub.calls[0].args[1] as RequestInit;
    assertEquals(calledOptions.method, "POST");
    const headers: Record<string, string> = calledOptions.headers as Record<string, string>;
    assertEquals(headers["X-Kit-Api-Key"], validConfig.apiKey);
    const body: Record<string, unknown> = JSON.parse(calledOptions.body as string);
    assertEquals(body.email_address, testUserData.email);
  });

  await t.step("`addTagToSubscriber` throws on API error", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const tagId = "99887";
    const errorMsg = "Tag not found";
    setMockFetchResponse(
      new Response(JSON.stringify({ error: { message: errorMsg } }), { status: 404 }),
    );

    await assertRejects(
      async () => {
        await service.addTagToSubscriber(testUserData.email, tagId);
      },
      Error,
      `Kit API Error (404): ${errorMsg}`,
    );
    assertEquals(fetchStub.calls.length, 1);
  });

  // --- Tests for removeTagFromSubscriber ---

  await t.step("`removeTagFromSubscriber` calls DELETE /v4/tags/{tagId}/subscribers with email_address", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const tagId = "99887";
    // Kit v4 DELETE tag subscriber returns 204
    setMockFetchResponse(new Response(null, { status: 204 }));

    await service.removeTagFromSubscriber(testUserData.email, tagId);

    assertEquals(fetchStub.calls.length, 1);
    const calledUrl: string = fetchStub.calls[0].args[0] as string;
    assertStringIncludes(calledUrl, `/v4/tags/${tagId}/subscribers`);
    const calledOptions: RequestInit = fetchStub.calls[0].args[1] as RequestInit;
    assertEquals(calledOptions.method, "DELETE");
    const headers: Record<string, string> = calledOptions.headers as Record<string, string>;
    assertEquals(headers["X-Kit-Api-Key"], validConfig.apiKey);
    const body: Record<string, unknown> = JSON.parse(calledOptions.body as string);
    assertEquals(body.email_address, testUserData.email);
  });

  await t.step("`removeTagFromSubscriber` throws on API error", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const tagId = "99887";
    const errorMsg = "Subscriber not found for tag";
    setMockFetchResponse(
      new Response(JSON.stringify({ error: { message: errorMsg } }), { status: 404 }),
    );

    await assertRejects(
      async () => {
        await service.removeTagFromSubscriber(testUserData.email, tagId);
      },
      Error,
      `Kit API Error (404): ${errorMsg}`,
    );
    assertEquals(fetchStub.calls.length, 1);
  });

  // --- Tests for 204 response handling ---

  await t.step("`makeApiRequest` handles 204 responses correctly without body parsing", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const kitSubscriberId = 55566;
    // find succeeds, then delete returns 204
    const findResponse = new Response(
      JSON.stringify({ subscribers: [{ id: kitSubscriberId }] }),
      { status: 200 },
    );
    const deleteResponse = new Response(null, { status: 204 });
    setMockFetchResponse([findResponse, deleteResponse]);

    // removeUser triggers a DELETE which should get 204 — should not throw
    await service.removeUser(testUserData.email);

    assertEquals(fetchStub.calls.length, 2);
  });

  // --- Tests for error handling ---

  await t.step("non-OK responses throw with status and message", async () => {
    const { stub: fetchStub } = stubFetchForTestScope();
    await using _disposable = fetchStub;

    const service = new KitService(validConfig);
    const errorMsg = "Rate limit exceeded";
    setMockFetchResponse(
      new Response(JSON.stringify({ message: errorMsg }), { status: 429 }),
    );

    await assertRejects(
      async () => {
        await service.addUserToList(testUserData);
      },
      Error,
      "Kit API Error (429)",
    );
    assertEquals(fetchStub.calls.length, 1);
  });

});