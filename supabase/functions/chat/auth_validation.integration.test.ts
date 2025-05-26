import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
import type { ChatApiRequest, AiModelExtendedConfig } from "../_shared/types.ts"; // TokenUsage might be needed for wallet checks
import { CHAT_FUNCTION_URL, supabaseAdminClient } from "./_integration.test.utils.ts";
// import { createMockSupabaseClient } from "../_shared/supabase.mock.ts"; // May not be needed for all auth tests if errors are immediate
// import type { MockQueryBuilderState, MockPGRSTError } from "../_shared/supabase.mock.ts";


export async function runAuthValidationTests(
  t: Deno.TestContext,
  initializeTestGroupEnvironment: (options?: {
    userProfile?: Partial<{ role: string; first_name: string }>;
    initialWalletBalance?: number;
    aiProviderConfigOverride?: Partial<AiModelExtendedConfig>;
    aiProviderApiIdentifier?: string; 
  }) => Promise<string>
) {
  await t.step("[Security/Auth] Invalid or expired JWT", async () => {
    const invalidJwt = "this-is-not-a-valid-jwt";

    // A minimal valid-looking request body, though it shouldn't be processed.
    const requestBody: ChatApiRequest = {
      providerId: crypto.randomUUID(), // Dummy UUID, won't be reached
      promptId: "__none__",
      message: "Hello?",
      max_tokens_to_generate: 50,
    };

    const response = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${invalidJwt}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson: Record<string, any> = await response.json();

    assertEquals(response.status, 401, "Expected 401 Unauthorized for invalid JWT. Body: " + JSON.stringify(responseJson));
    
    // Check for common error keys and that the value is a string
    const errorMessage = responseJson.error || responseJson.msg || responseJson.message;
    assertExists(errorMessage, "Response JSON should contain an error, msg, or message field.");
    assertEquals(typeof errorMessage, "string", "Error message in JSON should be a string.");

    assertStringIncludes(errorMessage.toLowerCase(), "invalid authentication credentials", 
      `Error message should indicate an auth credentials problem. Got: ${errorMessage}`
    ); 
  });

  await t.step("[Security/Auth] User not found for JWT", async () => {
    const testUserId = await initializeTestGroupEnvironment({
      userProfile: { first_name: "ToBeDeleted User" },
      initialWalletBalance: 0, // Balance not relevant
    });

    // Dynamically import getTestUserAuthToken AFTER initializeTestGroupEnvironment has run
    const { getTestUserAuthToken } = await import("./_integration.test.utils.ts");
    const authToken = getTestUserAuthToken(); // This token is for testUserId
    assertExists(authToken, "Auth token should exist for the created user.");

    // supabaseAdminClient is now directly imported
    assertExists(supabaseAdminClient, "Supabase admin client should be available.");

    // Delete the user from auth.users
    const { error: deleteError } = await supabaseAdminClient.auth.admin.deleteUser(testUserId);
    if (deleteError) {
      console.error("Failed to delete user for test: ", deleteError);
      throw new Error(`Failed to delete user ${testUserId}: ${deleteError.message}`);
    }
    console.log(`Test user ${testUserId} deleted for '[Security/Auth] User not found for JWT' test.`);

    const requestBody: ChatApiRequest = {
      providerId: crypto.randomUUID(), // Dummy provider ID, won't be reached
      promptId: "__none__",
      message: "Attempting chat with token of deleted user.",
      max_tokens_to_generate: 10,
    };

    const response = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson: Record<string, any> = await response.json();

    // Supabase typically returns 401 if the user for a validly-structured JWT is not found
    assertEquals(response.status, 401, "Expected 401 Unauthorized for JWT of a non-existent user. Body: " + JSON.stringify(responseJson));
    const errorMessage = responseJson.error || responseJson.msg || responseJson.message;
    assertExists(errorMessage, "Response JSON should contain an error for JWT of non-existent user.");
    assertEquals(typeof errorMessage, "string", "Error message should be a string.");
    
    assertStringIncludes(errorMessage.toLowerCase(), "invalid authentication credentials", 
      `Error message should indicate an auth credentials problem. Got: ${errorMessage}`
    );
  });

  await t.step("[Input Validation] Missing required fields in request body", async () => {
    await initializeTestGroupEnvironment({
      userProfile: { first_name: "InputValidation User" },
      initialWalletBalance: 100, // Balance not strictly relevant but good for full setup
    });
    const { getTestUserAuthToken } = await import("./_integration.test.utils.ts");
    const authToken = getTestUserAuthToken();
    assertExists(authToken, "Auth token is required for input validation tests.");

    const baseRequestBody = {
      promptId: "__none__",
      message: "A valid message.",
      providerId: crypto.randomUUID(), // A valid UUID for providerId initially
      max_tokens_to_generate: 10,
    };

    // Test Case 1: Missing providerId
    const bodyMissingProvider = { ...baseRequestBody };
    delete (bodyMissingProvider as Partial<ChatApiRequest>).providerId; 

    let response = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify(bodyMissingProvider),
    });
    let responseJson: Record<string, any> = await response.json();
    assertEquals(response.status, 400, "Expected 400 Bad Request when providerId is missing. Body: " + JSON.stringify(responseJson));
    assertExists(responseJson.error, "Response JSON should contain an error field when providerId is missing.");
    assertStringIncludes(responseJson.error.toLowerCase(), "providerid: required", 
      "Error message should indicate providerId is required. Got: " + responseJson.error);

    // Test Case 2: Missing message
    const bodyMissingMessage = { ...baseRequestBody };
    delete (bodyMissingMessage as Partial<ChatApiRequest>).message;

    response = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify(bodyMissingMessage),
    });
    responseJson = await response.json();
    assertEquals(response.status, 400, "Expected 400 Bad Request when message is missing. Body: " + JSON.stringify(responseJson));
    assertExists(responseJson.error, "Response JSON should contain an error field when message is missing.");
    assertStringIncludes(responseJson.error.toLowerCase(), "message: required", 
      "Error message should indicate message is required. Got: " + responseJson.error);

    // Test Case 3: Missing promptId
    const bodyMissingPromptId = { ...baseRequestBody };
    delete (bodyMissingPromptId as Partial<ChatApiRequest>).promptId;

    response = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify(bodyMissingPromptId),
    });
    responseJson = await response.json();
    assertEquals(response.status, 400, "Expected 400 Bad Request when promptId is missing. Body: " + JSON.stringify(responseJson));
    assertExists(responseJson.error, "Response JSON should contain an error field when promptId is missing.");
    assertStringIncludes(responseJson.error.toLowerCase(), "promptid: promptid is required and must be a valid uuid or '__none__'.", 
      "Error message should indicate promptId is required/invalid. Got: " + responseJson.error);
  });

  await t.step("[Input Validation] Invalid providerId (malformed UUID)", async () => {
    await initializeTestGroupEnvironment({
      userProfile: { first_name: "MalformedProviderId User" },
      initialWalletBalance: 100, 
    });
    const { getTestUserAuthToken } = await import("./_integration.test.utils.ts");
    const authToken = getTestUserAuthToken();
    assertExists(authToken, "Auth token is required for malformed providerId test.");

    const requestBody: ChatApiRequest = {
      providerId: "not-a-valid-uuid", // Malformed UUID
      promptId: "__none__",
      message: "A message that won't be processed.",
      max_tokens_to_generate: 10,
    };

    const response = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify(requestBody),
    });

    const responseJson: Record<string, any> = await response.json();

    assertEquals(response.status, 400, "Expected 400 Bad Request for malformed providerId. Body: " + JSON.stringify(responseJson));
    assertExists(responseJson.error, "Response JSON should contain an error field for malformed providerId.");
    
    // Error message should come from Zod schema validation
    assertStringIncludes(responseJson.error.toLowerCase(), "providerid: providerid is required and must be a valid uuid", 
      `Error message should indicate an invalid UUID for providerId. Got: ${responseJson.error}`
    );
  });

  await t.step("[Input Validation] Invalid promptId (malformed or non-existent)", async () => {
    await initializeTestGroupEnvironment({
      userProfile: { first_name: "MalformedPromptId User" },
      initialWalletBalance: 100, 
    });
    const { getTestUserAuthToken } = await import("./_integration.test.utils.ts");
    const authToken = getTestUserAuthToken();
    assertExists(authToken, "Auth token is required for malformed promptId test.");
    
    const validProviderId = crypto.randomUUID(); // Any valid UUID will do for providerId to pass its own validation

    // Test Case 1: Malformed promptId (not a UUID, not '__none__')
    const requestBodyMalformed: ChatApiRequest = {
      providerId: validProviderId,
      promptId: "not-a-uuid-and-not-none", // Malformed promptId
      message: "A message that won't be processed.",
      max_tokens_to_generate: 10,
    };

    const responseMalformed = await fetch(CHAT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken}` },
      body: JSON.stringify(requestBodyMalformed),
    });

    const responseJsonMalformed: Record<string, any> = await responseMalformed.json();

    assertEquals(responseMalformed.status, 400, "Expected 400 Bad Request for malformed promptId. Body: " + JSON.stringify(responseJsonMalformed));
    assertExists(responseJsonMalformed.error, "Response JSON should contain an error field for malformed promptId.");
    // Zod schema validation for a malformed string failing the .uuid() check within the union.
    assertStringIncludes(responseJsonMalformed.error.toLowerCase(), "promptid: promptid must be a valid uuid if provided and not '__none__'.", 
      `Error message should indicate an invalid promptId. Got: ${responseJsonMalformed.error}`
    );

    // Test Case 2: Non-existent but valid UUID promptId (should NOT error at validation, might proceed without system prompt)
    // This case might not result in a 400 from Zod, but the chat should proceed (possibly without a system message)
    // or potentially a 404 if the DB lookup for system_prompts is strict and errors if not found (current logic doesn't seem to do this).
    // For now, we will only assert that a malformed one IS a 400. Actual behavior of non-existent valid UUID can be a separate test if needed.
    
    // console.log("Test shell for: [Input Validation] Invalid promptId (malformed or non-existent)");
    // assertEquals(true, true); // Placeholder removed
  });
} 