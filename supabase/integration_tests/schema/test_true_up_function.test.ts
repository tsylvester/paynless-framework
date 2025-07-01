import {
    assert,
    assertEquals,
    assertExists,
  } from "https://deno.land/std@0.224.0/assert/mod.ts";
  import {
    coreCleanupTestResources,
    coreInitializeTestStep,
    findProcessedResource,
    initializeSupabaseAdminClient,
    TestSetupConfig,
  } from "../../functions/_shared/_integration.test.utils.ts";
  
  // Using a hardcoded value as the definitive source could not be located in the codebase.
  // If tests fail on this value, it should be updated.
  const CREDIT_INITIAL_FREE_ALLOCATION = 100000;
  
  Deno.test("Database Function: true_up_user", async (t) => {
    // Initialize the admin client once for the suite
    initializeSupabaseAdminClient();
  
    // --- Group 1: Tests where handle_new_user IS active ---
    // The goal is to prove true_up_user is idempotent for modern, fully-provisioned users.
    await t.step("should be idempotent and do nothing for a user provisioned by handle_new_user", async () => {
      // 1. Setup: Create a user and let handle_new_user run automatically.
      // No trigger disabling needed here.
      const { primaryUserId, adminClient } = await coreInitializeTestStep({
        // We start with a undefined balance, handle_new_user will set it.
        initialWalletBalance: undefined 
      });
      
      // We need the original state created by the trigger for our assertions.
      const { data: initialWallet } = await adminClient.from("token_wallets").select("*").eq("user_id", primaryUserId).single();
      assertExists(initialWallet, "handle_new_user should have created a wallet.");
      assertEquals(initialWallet.balance, CREDIT_INITIAL_FREE_ALLOCATION, "handle_new_user should have granted the initial token allocation.");
  
      const { data: initialTxs } = await adminClient.from("token_wallet_transactions").select("*").eq("wallet_id", initialWallet.wallet_id);
      assertEquals(initialTxs?.length, 1, "handle_new_user should have created exactly one transaction.");
  
      // 2. Action: Call true_up_user on the already-provisioned user.
      const { error: rpcError } = await adminClient.rpc("true_up_user", { p_user_id: primaryUserId });
      assertEquals(rpcError, null, "RPC call failed for modern user.");
  
      // 3. Assertions: Prove that nothing has changed.
      const { data: finalWallet } = await adminClient.from("token_wallets").select("*").eq("user_id", primaryUserId).single();
      assertEquals(finalWallet?.balance, initialWallet.balance, "Wallet balance should not change for a modern user.");
  
      const { data: finalTxs } = await adminClient.from("token_wallet_transactions").select("*").eq("wallet_id", finalWallet!.wallet_id);
      assertEquals(finalTxs?.length, 1, "No new transactions should be created for a modern user.");
  
      // 4. Teardown
      await coreCleanupTestResources();
    });
  
  
    // --- Group 2: Tests where handle_new_user IS disabled ---
    // The goal is to prove true_up_user correctly provisions legacy users.
    await t.step("should provision a legacy user with profile, wallet, and subscription", async (t) => {
        let primaryUserId: string;
        let adminClient: any;
        
        await t.step("Setup Legacy User", async () => {
          // Disable trigger, create a bare user, then re-enable for test isolation.
          const setupAdminClient = initializeSupabaseAdminClient();
          await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;" });
          const setupResult = await coreInitializeTestStep();
          await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;" });
          primaryUserId = setupResult.primaryUserId;
          adminClient = setupResult.adminClient;
          // Manually delete anything that might have been created before the trigger was disabled.
          await adminClient.from('user_profiles').delete().eq('id', primaryUserId);
          await adminClient.from('token_wallets').delete().eq('user_id', primaryUserId).is('organization_id', null);
          await adminClient.from('user_subscriptions').delete().eq('user_id', primaryUserId);
        });
        
        await t.step("Action and Assertions", async () => {
          // 2. Action
          const { error: rpcError } = await adminClient.rpc("true_up_user", { p_user_id: primaryUserId });
          assertEquals(rpcError, null, "RPC call failed for legacy user.");
  
          // 3. Assertions
          const { data: profile } = await adminClient.from("user_profiles").select("*").eq("id", primaryUserId).single();
          assertExists(profile, "Profile was not created for legacy user.");
  
          const { data: wallet } = await adminClient.from("token_wallets").select("*").eq("user_id", primaryUserId).is('organization_id', null).single();
          assertExists(wallet, "Wallet was not created for legacy user.");
          assertEquals(wallet.balance, CREDIT_INITIAL_FREE_ALLOCATION);
  
          const { data: plan } = await adminClient.from("subscription_plans").select("id").eq("name", "Free").single();
          const { data: sub } = await adminClient.from("user_subscriptions").select("*").eq("user_id", primaryUserId).single();
          assertExists(sub, "Subscription was not created for legacy user.");
          assertEquals(sub.plan_id, plan?.id);
  
          const { data: txs } = await adminClient.from("token_wallet_transactions").select("*").eq("wallet_id", wallet.wallet_id);
          assertEquals(txs?.length, 1, "Incorrect number of token transactions created.");
          assertEquals(txs?.[0].amount, CREDIT_INITIAL_FREE_ALLOCATION);
        });
  
        await t.step("Teardown", async () => await coreCleanupTestResources());
      }
    );
  
    await t.step("should not change the plan of a user with an existing (non-free) subscription", async (t) => {
        let primaryUserId: string, adminClient: any, paidPlan: any;
  
        await t.step("Setup", async () => {
          const setupAdminClient = initializeSupabaseAdminClient();
          await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;" });
          
          const config: TestSetupConfig = {
            resources: [{
              tableName: "subscription_plans",
              identifier: { name: "Paid Plan" },
              desiredState: { name: "Paid Plan", tokens_to_award: 0, plan_type: "paid" },
              exportId: "paidPlan"
            }]
          };
          const setupResult = await coreInitializeTestStep(config);
          primaryUserId = setupResult.primaryUserId;
          adminClient = setupResult.adminClient;
          paidPlan = findProcessedResource(setupResult.processedResources, "paidPlan");
          assertExists(paidPlan, "Paid plan setup failed");
  
          // Clean slate for the user, then assign the paid plan
          await adminClient.from('token_wallets').delete().eq('user_id', primaryUserId).is('organization_id', null);
          await adminClient.from('user_subscriptions').delete().eq('user_id', primaryUserId);
          
          await adminClient.from("user_subscriptions").insert({ user_id: primaryUserId, plan_id: paidPlan.id, status: "active" });
          const { data: wallet } = await adminClient.from("token_wallets").insert({ user_id: primaryUserId, balance: 0, currency: 'AI_TOKEN' }).select('wallet_id').single();
          assertExists(wallet, "Test setup failed: Wallet was not created for paid plan test.");
          await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;" });
        });
  
        await t.step("Action and Assertions", async () => {
          const { error: rpcError } = await adminClient.rpc("true_up_user", { p_user_id: primaryUserId });
          assertEquals(rpcError, null, "RPC call failed.");
  
          const { data: sub } = await adminClient.from("user_subscriptions").select("*").eq("user_id", primaryUserId).single();
          assertExists(sub, "Subscription should still exist.");
          assertEquals(sub.plan_id, paidPlan!.id, "User's plan should not be changed to Free.");
        });
  
        await t.step("Teardown", async () => await coreCleanupTestResources());
      }
    );
    
    await t.step("should grant tokens to a user with a wallet but no initial allocation", async (t) => {
      let primaryUserId: string, adminClient: any;
      await t.step("Setup", async () => {
        const setupAdminClient = initializeSupabaseAdminClient();
        await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;" });
        const setupResult = await coreInitializeTestStep();
        primaryUserId = setupResult.primaryUserId;
        adminClient = setupResult.adminClient;
        // Clean slate then add back a zero-balance wallet
        await adminClient.from('token_wallets').delete().eq('user_id', primaryUserId).is('organization_id', null);
        await adminClient.from('user_subscriptions').delete().eq('user_id', primaryUserId);
        const { data: wallet } = await adminClient.from("token_wallets").insert({ user_id: primaryUserId, balance: 0, currency: 'AI_TOKEN' }).select('wallet_id').single();
        assertExists(wallet, "Test setup failed: Wallet was not created for token grant test.");
        await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;" });
      });
  
      await t.step("Action and Assertions", async () => {
        await adminClient.rpc("true_up_user", { p_user_id: primaryUserId });
  
        const { data: finalWallet } = await adminClient.from("token_wallets").select("*").eq("user_id", primaryUserId).single();
        assertEquals(finalWallet?.balance, CREDIT_INITIAL_FREE_ALLOCATION, "Initial tokens should be granted.");
  
        const { data: txs } = await adminClient.from("token_wallet_transactions").select("*").eq("wallet_id", finalWallet!.wallet_id);
        assertEquals(txs?.length, 1, "A new transaction should have been created.");
      });
      
      await t.step("Teardown", async () => await coreCleanupTestResources());
    });
  
    await t.step("should NOT grant tokens to a user with zero balance but a prior grant", async (t) => {
      let primaryUserId: string, adminClient: any, wallet: any;
      await t.step("Setup", async () => {
        const setupAdminClient = initializeSupabaseAdminClient();
        await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;" });
        const setupResult = await coreInitializeTestStep();
        primaryUserId = setupResult.primaryUserId;
        adminClient = setupResult.adminClient;
        // Clean slate then setup the specific state
        await adminClient.from('token_wallets').delete().eq('user_id', primaryUserId).is('organization_id', null);
        await adminClient.from('user_subscriptions').delete().eq('user_id', primaryUserId);
        
        const { data: walletData } = await adminClient.from("token_wallets").insert({ user_id: primaryUserId, balance: 0, currency: 'AI_TOKEN' }).select().single();
        assertExists(walletData, "Test setup failed: Wallet was not created.");
        wallet = walletData;
        
        // Manually insert a "prior grant" transaction
        await adminClient.from("token_wallet_transactions").insert({
            wallet_id: wallet.wallet_id,
            transaction_type: "CREDIT_INITIAL_FREE_ALLOCATION",
            amount: CREDIT_INITIAL_FREE_ALLOCATION,
            balance_after_txn: 0, // Balance was 0 after this txn
            recorded_by_user_id: primaryUserId,
            idempotency_key: `initial_free_grant_${primaryUserId}` // This key should be unique
        });
        await setupAdminClient.rpc('execute_sql' as any, { query: "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;" });
      });
  
      await t.step("Action and Assertions", async () => {
        await adminClient.rpc("true_up_user", { p_user_id: primaryUserId });
  
        const { data: finalWallet } = await adminClient.from("token_wallets").select("*").eq("user_id", primaryUserId).single();
        assertEquals(finalWallet?.balance, 0, "Balance should remain zero.");
  
        const { data: txs } = await adminClient.from("token_wallet_transactions").select("*").eq("wallet_id", finalWallet!.wallet_id);
        assertEquals(txs?.length, 1, "No new transaction should have been created.");
      });
      
      await t.step("Teardown", async () => await coreCleanupTestResources());
    });
  });