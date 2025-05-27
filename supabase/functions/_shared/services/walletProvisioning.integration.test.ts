import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.208.0/testing/bdd.ts"; // Using Deno's BDD test framework
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.208.0/assert/mod.ts"; // Deno's assertions
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"; // Supabase types
import type { Database } from "../../types_db.ts"; // Import the auto-generated DB types

// Assuming _testUtils.ts is in the same directory as this test file's PARENT directory
// e.g., if tests are in 'services/tests/' and _testUtils is in 'services/'
// Adjust path if _testUtils.ts is directly in 'services/' alongside this test file
import {
  adminClient, // Now importing the instance directly
  createTestUserUtil,
  type TestUserContext, // Interface from _testUtils.ts
  createOrgAndMakeUserAdminUtil, // Helper for org creation
} from "./_testUtils.ts"; // Path to _testUtils.ts

// Define a basic Organization type for direct creation if needed, or use one from _testUtils if available
interface TestOrganization {
  id: string;
  name: string;
  // Add other fields that might be returned or are required for creation
}

const generateUniqueEmail = () => `testuser_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`;

describe("Wallet Provisioning Triggers Integration Tests", () => {
  const usersToCleanup: TestUserContext[] = [];
  const orgsToCleanup: string[] = []; // Store org IDs for cleanup

  beforeAll(() => {
    // adminClient is imported directly and should already be initialized.
    // We just need to assert its existence to be sure it was imported correctly.
    assertExists(adminClient, "Admin client should be initialized via import from _testUtils.ts");
  });

  afterEach(async () => {
    for (const userCtx of usersToCleanup) {
      try {
        await adminClient.auth.admin.deleteUser(userCtx.id);
      } catch (e) {
        console.error(`Error cleaning up user ${userCtx.id}:`, Error);
      }
    }
    usersToCleanup.length = 0;

    for (const orgId of orgsToCleanup) {
      try {
        // Assuming ON DELETE CASCADE from organizations to token_wallets for organization_id
        // If not, delete wallet first: 
        // await adminClient.from('token_wallets').delete().eq('organization_id', orgId);
        await adminClient.from("organizations").delete().eq("id", orgId);
      } catch (e) {
        console.error(`Error cleaning up organization ${orgId}:`, Error);
      }
    }
    orgsToCleanup.length = 0;
  });

  it("should automatically create a user_profile and a token_wallet for a new auth.users entry", async () => {
    const email = generateUniqueEmail();
    const testUserCtx = await createTestUserUtil({
      email,
      password: "password123",
      email_confirm: true,
    });
    usersToCleanup.push(testUserCtx);
    const userId = testUserCtx.id;

    // createTestUserUtil includes a 500ms delay for profile creation.
    // Adding a bit more for wallet trigger if necessary, but often covered.
    await new Promise(resolve => setTimeout(resolve, 250)); // Shorter additional delay

    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    assert(!profileError, `Error fetching profile: ${profileError?.message}`);
    assertExists(profile, `Profile for user ${userId} should be created.`);
    assertEquals(profile.id, userId);

    const { data: wallet, error: walletError } = await adminClient
      .from("token_wallets")
      .select("*")
      .eq("user_id", userId)
      .is("organization_id", null)
      .single<Database['public']['Tables']['token_wallets']['Row']>();

    assert(!walletError, `Error fetching user wallet: ${walletError?.message}`);
    assertExists(wallet, `Wallet for user ${userId} should be created.`);
    assertEquals(wallet.user_id, userId);
    assertEquals(wallet.balance, 0);
    assertEquals(wallet.currency, "AI_TOKEN");
  });

  it("should automatically create a token_wallet for a new organization", async () => {
    const dummyUserEmail = generateUniqueEmail();
    const dummyUserCtx = await createTestUserUtil({ email: dummyUserEmail, email_confirm: true });
    usersToCleanup.push(dummyUserCtx);

    const orgNamePrefix = "TestOrgProvision";
    const orgId = await createOrgAndMakeUserAdminUtil(orgNamePrefix, dummyUserCtx.id, orgsToCleanup);
    
    // createOrgAndMakeUserAdminUtil inserts the org, trigger should fire.
    // Add a small delay for the wallet trigger to complete.
    await new Promise(resolve => setTimeout(resolve, 250)); 

    const { data: wallet, error: walletError } = await adminClient
      .from("token_wallets")
      .select("*")
      .eq("organization_id", orgId)
      .is("user_id", null)
      .single<Database['public']['Tables']['token_wallets']['Row']>();

    assert(!walletError, `Error fetching organization wallet: ${walletError?.message}`);
    assertExists(wallet, `Wallet for org ${orgId} should be created.`);
    assertEquals(wallet.organization_id, orgId);
    assertEquals(wallet.balance, 0);
    assertEquals(wallet.currency, "AI_TOKEN");
  });
});