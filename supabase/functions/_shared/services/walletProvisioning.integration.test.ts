import {
  afterEach,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.224.0/testing/bdd.ts";
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { Database } from "../../types_db.ts";
import {
  supabaseAdminClient,
  initializeSupabaseAdminClient,
} from "../_integration.test.utils.ts";

interface TestUserContext {
  id: string;
  email: string;
}

const generateUniqueEmail = () =>
  `testuser_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`;

async function createTestUserUtil(args: {
  email: string;
  password?: string;
  email_confirm?: boolean;
}): Promise<TestUserContext> {
  const { data, error } = await supabaseAdminClient.auth.admin.createUser({
    email: args.email,
    password: args.password ?? "password123",
    email_confirm: args.email_confirm ?? true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { id: data.user.id, email: data.user.email ?? args.email };
}

async function createOrgAndMakeUserAdminUtil(
  orgNamePrefix: string,
  userId: string,
  orgsToCleanup: string[],
): Promise<string> {
  const orgName = `${orgNamePrefix}-${Date.now()}`;
  const { data: org, error: orgError } = await supabaseAdminClient
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgError || !org) {
    throw new Error(`Failed to create test org: ${orgError?.message}`);
  }
  const orgId: string = org.id;
  orgsToCleanup.push(orgId);
  const { error: memberError } = await supabaseAdminClient
    .from("organization_members")
    .insert({ organization_id: orgId, user_id: userId, role: "admin", status: "active" });
  if (memberError) {
    throw new Error(`Failed to add user as org admin: ${memberError.message}`);
  }
  return orgId;
}

describe("Wallet Provisioning Triggers Integration Tests", () => {
  const usersToCleanup: TestUserContext[] = [];
  const orgsToCleanup: string[] = []; // Store org IDs for cleanup

  beforeAll(() => {
    initializeSupabaseAdminClient();
  });

  afterEach(async () => {
    for (const userCtx of usersToCleanup) {
      try {
        await supabaseAdminClient.auth.admin.deleteUser(userCtx.id);
      } catch (e) {
        console.error(`Error cleaning up user ${userCtx.id}:`, Error);
      }
    }
    usersToCleanup.length = 0;

    for (const orgId of orgsToCleanup) {
      try {
        await supabaseAdminClient.from("organizations").delete().eq("id", orgId);
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

    const { data: profile, error: profileError } = await supabaseAdminClient
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    assert(!profileError, `Error fetching profile: ${profileError?.message}`);
    assertExists(profile, `Profile for user ${userId} should be created.`);
    assertEquals(profile.id, userId);

    const { data: wallet, error: walletError } = await supabaseAdminClient
      .from("token_wallets")
      .select("*")
      .eq("user_id", userId)
      .is("organization_id", null)
      .single<Database['public']['Tables']['token_wallets']['Row']>();

    assert(!walletError, `Error fetching user wallet: ${walletError?.message}`);
    assertExists(wallet, `Wallet for user ${userId} should be created.`);
    assertEquals(wallet.user_id, userId);
    assertEquals(wallet.balance, 1000000);
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

    const { data: wallet, error: walletError } = await supabaseAdminClient
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