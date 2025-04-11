import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { spy, stub } from "jsr:@std/testing/mock";
import { KitService } from "./kit_service.ts";
import { type UserData, type IEmailMarketingService, type SubscriptionPlan, type UserSubscription } from "../types.ts";
// Import shared test utilities
import {
    mockFetch, 
    setMockFetchResponse,
    stubFetchForTestScope
} from "../test-utils.ts"; 

// Remove local mock definitions - now imported from test-utils
/*
let mockFetchResponse: Response | Promise<Response> = new Response(null, { status: 200 });
const mockFetch = spy(async (url: string | URL, options?: RequestInit): Promise<Response> => {
  // ... local mockFetch implementation ...
});

function withMockEnv(envVars: Record<string, string>, testFn: () => Promise<void>) {
  // ... local withMockEnv implementation ...
}
*/

Deno.test("KitService Tests", async (t) => {
  // No global stubbing here anymore

  const BASE_URL = "https://fake-kit.com/api";
  const API_KEY = "test-api-key";
  const TAG_ID = "123456";
  const USER_ID_FIELD_KEY = "fields[test_user_id]"; // Example custom field key
  const CREATED_AT_FIELD_KEY = "fields[test_created_at]"; // Example custom field key

  // Define base valid config for tests
  const validConfig = {
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    tagId: TAG_ID,
    customUserIdField: USER_ID_FIELD_KEY,
    customCreatedAtField: CREATED_AT_FIELD_KEY,
  };

  const testUser: UserData = {
    id: "user-uuid-123",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    createdAt: new Date().toISOString(),
  };

  const kitSubscriberId = 98765;

  await t.step("`constructor` throws if required config is missing", async () => {
      // Test missing API Key
      await assertRejects(
          async () => { new KitService({ ...validConfig, apiKey: "" }); },
          Error,
          "Missing required configuration for KitService"
      );
       // Test missing Base URL
       await assertRejects(
          async () => { new KitService({ ...validConfig, baseUrl: "" }); },
          Error,
          "Missing required configuration for KitService"
      );
       // Test missing custom fields (if validation requires them)
       await assertRejects(
          async () => { new KitService({ ...validConfig, customUserIdField: undefined }); },
          Error,
          "Missing required custom field configuration"
      );
       await assertRejects(
          async () => { new KitService({ ...validConfig, customCreatedAtField: undefined }); },
          Error,
          "Missing required custom field configuration"
      );
       // Test valid config doesn't throw
       new KitService(validConfig); // Should not throw
  });


  await t.step("`addUserToList` successfully adds a user to a tag", async () => {
    const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
    await using _stubDisposable = localFetchStub;
    
    // Instantiate with valid config
    const service = new KitService(validConfig); 
    setMockFetchResponse(new Response(JSON.stringify({ subscriber: { id: 9876 } }), { status: 200 })); 
    await service.addUserToList(testUser);

    // Assert against the local spy
    assertEquals(localFetchSpy.calls.length, 1);
    const args = localFetchSpy.calls[0].args as any[];
    const url = args[0];
    const options = args[1];

    assertEquals(url, `${BASE_URL}/v1/tags/${TAG_ID}/subscribe`);
    assertEquals(options?.method, "POST");
    assert(options?.headers instanceof Headers);
    assertEquals((options.headers as Headers).get("Content-Type"), "application/json");
    assertEquals((options.headers as Headers).get("Accept"), "application/json");

    assert(options?.body, "Request body should exist");
    const body = JSON.parse(options.body as string);
    assertEquals(body.api_key, API_KEY);
    assertEquals(body.email, testUser.email);
    assertEquals(body.first_name, testUser.firstName);
    assertEquals(body.last_name, testUser.lastName);
    assertEquals(body[USER_ID_FIELD_KEY], testUser.id);
    assertEquals(body[CREATED_AT_FIELD_KEY], testUser.createdAt);
  });

  await t.step("`addUserToList` handles API error response", async () => {
      const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
      await using _stubDisposable = localFetchStub;

      // Instantiate with valid config
      const service = new KitService(validConfig); 
      const errorMessage = "Invalid email address";
      setMockFetchResponse(new Response(JSON.stringify({ error: { message: errorMessage } }), { status: 422 })); 
      await assertRejects(
          async () => { await service.addUserToList(testUser); },
          Error,
          `Kit API Error (422): ${errorMessage}`
      );
      assertEquals(localFetchSpy.calls.length, 1);
  });

   await t.step("`addUserToList` handles network error", async () => {
      const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
      await using _stubDisposable = localFetchStub;
      
      // Instantiate with valid config
      const service = new KitService(validConfig); 
      const networkErrorMessage = "Failed to fetch";
      setMockFetchResponse(Promise.reject(new Error(networkErrorMessage)));  
      await assertRejects(
          async () => { await service.addUserToList(testUser); },
          Error, 
          networkErrorMessage
      );
      assertEquals(localFetchSpy.calls.length, 1);
   });

  // --- Tests for updateUserAttributes ---
  await t.step("`updateUserAttributes` successfully finds and updates a user", async () => {
    const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
    await using _stubDisposable = localFetchStub;

    // Instantiate with valid config
    const service = new KitService(validConfig); 
    const updatedUser = { 
        ...testUser, 
        firstName: "Updated",
        // Ensure non-updatable fields aren't sent in PUT
    };
    const kitSubscriberId = 98765; 

    const findResponse = new Response(JSON.stringify({
        subscribers: [{ id: kitSubscriberId, email_address: testUser.email }]
    }), { status: 200 });
    const updateResponse = new Response(JSON.stringify({ subscriber: { id: kitSubscriberId, /* ... updated fields ... */ } }), { status: 200 });

    // Use setMockFetchResponse with an array for the sequence
    setMockFetchResponse([findResponse, updateResponse]);

    await service.updateUserAttributes(updatedUser.email, { 
        firstName: updatedUser.firstName, 
        lastName: updatedUser.lastName, 
        // Pass custom fields directly if service expects them here
        [USER_ID_FIELD_KEY]: updatedUser.id, 
        [CREATED_AT_FIELD_KEY]: updatedUser.createdAt 
    });

    assertEquals(localFetchSpy.calls.length, 2);
    const findArgs = localFetchSpy.calls[0].args as any[]; 
    const findUrl = findArgs[0];
    const findOptions = findArgs[1];
    const expectedFindUrl = new URL(`${BASE_URL}/v1/subscribers`);
    expectedFindUrl.searchParams.set('api_key', API_KEY);
    expectedFindUrl.searchParams.set('email_address', testUser.email);
    assertEquals(findUrl?.toString(), expectedFindUrl.toString());
    assertEquals(findOptions?.method, "GET");

    const updateArgs = localFetchSpy.calls[1].args as any[]; 
    const updateUrl = updateArgs[0];
    const updateOptions = updateArgs[1];
    const expectedUpdateUrl = new URL(`${BASE_URL}/v1/subscribers/${kitSubscriberId}`);
    expectedUpdateUrl.searchParams.set('api_key', API_KEY);
    assertEquals(updateUrl?.toString(), expectedUpdateUrl.toString());
    assertEquals(updateOptions?.method, "PUT");
    assert(updateOptions?.headers instanceof Headers);
    assertEquals((updateOptions.headers as Headers).get("Content-Type"), "application/json");
    assert(updateOptions?.body, "Update request body should exist");
    const updateBody = JSON.parse(updateOptions.body as string);
    assertEquals(updateBody.first_name, updatedUser.firstName); 
    assertEquals(updateBody.last_name, updatedUser.lastName); 
    assertEquals(updateBody[USER_ID_FIELD_KEY], updatedUser.id); 
    assertEquals(updateBody[CREATED_AT_FIELD_KEY], updatedUser.createdAt); 
    assertEquals(updateBody.email_address, undefined, "Email should not be sent in update payload");

  });

  await t.step("`updateUserAttributes` handles user not found", async () => {
    const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
    await using _stubDisposable = localFetchStub;

    // Instantiate with valid config
    const service = new KitService(validConfig); 
    setMockFetchResponse(new Response(JSON.stringify({ subscribers: [] }), { status: 200 })); 
    await service.updateUserAttributes(testUser.email, { firstName: "ShouldNotUpdate" });
    assertEquals(localFetchSpy.calls.length, 1);
  });

  // --- Tests for removeUser ---
  await t.step("`removeUser` successfully finds and removes a user", async () => {
    const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
    await using _stubDisposable = localFetchStub;
    
    // Instantiate with valid config
    const service = new KitService(validConfig); 
    const kitSubscriberId = 98765; // Assuming defined

    const findResponse = new Response(JSON.stringify({
        subscribers: [{ id: kitSubscriberId, email_address: testUser.email }]
    }), { status: 200 });
    const deleteResponse = new Response(null, { status: 200 });

    // Use setMockFetchResponse with an array for the sequence
    setMockFetchResponse([findResponse, deleteResponse]);

    await service.removeUser(testUser.email);

    assertEquals(localFetchSpy.calls.length, 2);
    const findArgs = localFetchSpy.calls[0].args as any[];
    const findUrl = findArgs[0];
    const findOptions = findArgs[1];
    const expectedFindUrl = new URL(`${BASE_URL}/v1/subscribers`);
    expectedFindUrl.searchParams.set('api_key', API_KEY);
    expectedFindUrl.searchParams.set('email_address', testUser.email);
    assertEquals(findUrl?.toString(), expectedFindUrl.toString());
    assertEquals(findOptions?.method, "GET");

    const deleteArgs = localFetchSpy.calls[1].args as any[];
    const deleteUrl = deleteArgs[0];
    const deleteOptions = deleteArgs[1];
    const expectedDeleteUrl = new URL(`${BASE_URL}/v1/subscribers/${kitSubscriberId}`);
    expectedDeleteUrl.searchParams.set('api_key', API_KEY);
    assertEquals(deleteUrl?.toString(), expectedDeleteUrl.toString());
    assertEquals(deleteOptions?.method, "DELETE");
    assertEquals(deleteOptions?.body, undefined, "DELETE should not have a body");
  });

  await t.step("`removeUser` handles user not found", async () => {
    const { spy: localFetchSpy, stub: localFetchStub } = stubFetchForTestScope();
    await using _stubDisposable = localFetchStub;
    
    // Instantiate with valid config
    const service = new KitService(validConfig); 
    setMockFetchResponse(new Response(JSON.stringify({ subscribers: [] }), { status: 200 })); 
    await service.removeUser(testUser.email);
    assertEquals(localFetchSpy.calls.length, 1);
  });

}); 