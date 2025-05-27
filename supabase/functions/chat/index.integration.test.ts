import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.220.1/assert/mod.ts";
// TestContext is Deno.TestContext, a global type, no import needed.
import {
  initializeSupabaseAdminClient,
  initializeTestDeps,
  coreTeardown,
  coreResetDatabaseState,
  coreSeedAiProviders,
  coreInitializeTestStep,
  setSharedAdminClient,
  setSharedTestDeps,
  CHAT_FUNCTION_URL,
} from "./_integration.test.utils.ts";

// Import types directly from their canonical location
import type { ChatApiRequest, ChatHandlerSuccessResponse, AiModelExtendedConfig } from "../_shared/types.ts";

// Import the test group runner
import { runHappyPathTests } from './happy_path.integration.test.ts';
import { runEdgeCaseTests } from './edge_cases.integration.test.ts';
import { runSpecificConfigsTests } from './specific_configs.integration.test.ts';
import { runAuthValidationTests } from "./auth_validation.integration.test.ts";

// --- Router-level Helper Functions (wrappers around core logic) ---
async function setupTestSuiteRouter() {
  console.log("Setting up test suite (router)...");
  const adminClient = initializeSupabaseAdminClient();
  setSharedAdminClient(adminClient); 

  const deps = initializeTestDeps(adminClient);
  setSharedTestDeps(deps); 
  
  await coreResetDatabaseState(); 
  await coreSeedAiProviders();
  console.log("Test suite setup complete (router).");
}

async function teardownTestSuiteRouter() {
  console.log("Tearing down test suite (router)...");
  await coreTeardown();
  console.log("Test suite teardown complete (router).");
}

async function initializeTestGroupEnvironmentRouter(
  options: { 
    userProfile?: Partial<{ role: string; first_name: string }>; 
    initialWalletBalance?: number; 
    aiProviderApiIdentifier?: string;
    aiProviderConfigOverride?: Partial<AiModelExtendedConfig>;
  } = {}
): Promise<string> {
  const userId = await coreInitializeTestStep(options);
  return userId;
}

Deno.test({
  name: "Chat Integration Tests Suite Router",
  sanitizeOps: false, 
  sanitizeResources: false, 
  sanitizeExit: false, 
  async fn(t: Deno.TestContext) {
    await setupTestSuiteRouter();

    try {
      // Call the Happy Path tests
      await t.step("[Test Group] Happy Path Scenarios", async (innerT: Deno.TestContext) => {
        await runHappyPathTests(innerT, initializeTestGroupEnvironmentRouter);
      });

      // Call the Edge Case tests
      await t.step("[Test Group] Edge Cases", async (innerT: Deno.TestContext) => {
        await runEdgeCaseTests(innerT, initializeTestGroupEnvironmentRouter);
      });

      // Call the Specific Configs tests
      await t.step("[Test Group] Specific Configurations", async (innerT: Deno.TestContext) => {
        await runSpecificConfigsTests(innerT, initializeTestGroupEnvironmentRouter);
      });

      // Run Auth and Validation tests
      await t.step("[Test Group] Auth and Input Validation", async (t_auth_val) => {
        await runAuthValidationTests(t_auth_val, coreInitializeTestStep);
      });

      console.log("All specified test groups completed.");

    } finally {
      await teardownTestSuiteRouter();
    }
  },
});