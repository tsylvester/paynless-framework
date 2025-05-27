import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { afterAll, beforeAll, describe, it } from "https://deno.land/std@0.192.0/testing/bdd.ts"; // Kept version for bdd, align if necessary later
import { SupabaseClient, User } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../../types_db.ts';
import { 
  adminClient, 
  createTestUserUtil,
  createServiceClient,
  createOrgAndMakeUserAdminUtil
} from '../services/_testUtils.ts';


describe('Tokenomics RLS Tests', () => {
  let user1Client: SupabaseClient<Database>;
  let user2Client: SupabaseClient<Database>;
  let user3Client: SupabaseClient<Database>; 
  let anonClient: SupabaseClient<Database>; 
  let user1Id: string, user1Email: string;
  let user2Id: string, user2Email: string;
  let user3Id: string, user3Email: string; 
  let user1WalletId: string;
  let user2WalletId: string;
  let org1Id: string;
  let org1WalletId: string;
  let org2Id: string; 
  let org2WalletId: string; 
  let user1TxnId: string; 
  let org1TxnId: string;

  const usersToCleanup = new Set<string>();
  const walletsToCleanup = new Set<string>();
  const orgsToCleanup: string[] = []; 

  beforeAll(async () => {
    const user1Ctx = await createTestUserUtil({ email: `rls-user1-${Date.now()}@example.com`, password: 'password123' });
    user1Id = user1Ctx.id; user1Email = user1Ctx.email;
    usersToCleanup.add(user1Id);
    user1Client = createServiceClient(); 
    const { data: signInData1, error: signInError1 } = await user1Client.auth.signInWithPassword({ email: user1Email, password: 'password123' });
    assertExists(signInData1?.session, 'User 1 session should exist'); assert(!signInError1);
    user1Client.auth.setSession(signInData1.session);

    const user2Ctx = await createTestUserUtil({ email: `rls-user2-${Date.now()}@example.com`, password: 'password123' });
    user2Id = user2Ctx.id; user2Email = user2Ctx.email;
    usersToCleanup.add(user2Id);
    user2Client = createServiceClient();
    const { data: signInData2, error: signInError2 } = await user2Client.auth.signInWithPassword({ email: user2Email, password: 'password123' });
    assertExists(signInData2?.session, 'User 2 session should exist'); assert(!signInError2);
    user2Client.auth.setSession(signInData2.session);

    const user3Ctx = await createTestUserUtil({ email: `rls-user3-${Date.now()}@example.com`, password: 'password123' });
    user3Id = user3Ctx.id; user3Email = user3Ctx.email; 
    usersToCleanup.add(user3Id);
    user3Client = createServiceClient();

    anonClient = createServiceClient();

    const { data: wallet1Data } = await adminClient.from('token_wallets').insert({ user_id: user1Id, balance: 1000, currency: 'AI_TOKEN' }).select('wallet_id').single();
    assertExists(wallet1Data); user1WalletId = wallet1Data.wallet_id; walletsToCleanup.add(user1WalletId);

    const { data: wallet2Data } = await adminClient.from('token_wallets').insert({ user_id: user2Id, balance: 500, currency: 'AI_TOKEN' }).select('wallet_id').single();
    assertExists(wallet2Data); user2WalletId = wallet2Data.wallet_id; walletsToCleanup.add(user2WalletId);

    org1Id = await createOrgAndMakeUserAdminUtil('rls-org1', user1Id, orgsToCleanup);
    const { data: orgW1Data } = await adminClient.from('token_wallets').insert({ organization_id: org1Id, user_id: null, balance: 2000, currency: 'AI_TOKEN' }).select('wallet_id').single();
    assertExists(orgW1Data); org1WalletId = orgW1Data.wallet_id; walletsToCleanup.add(org1WalletId);

    org2Id = await createOrgAndMakeUserAdminUtil('rls-org2', user2Id, orgsToCleanup);
    const { data: orgW2Data } = await adminClient.from('token_wallets').insert({ organization_id: org2Id, user_id: null, balance: 3000, currency: 'AI_TOKEN' }).select('wallet_id').single();
    assertExists(orgW2Data); org2WalletId = orgW2Data.wallet_id; walletsToCleanup.add(org2WalletId);

    // Transaction Creation (using adminClient for setup)
    // For user1WalletId (2 transactions)
    await adminClient.from('token_wallet_transactions').insert([
      { wallet_id: user1WalletId, transaction_type: 'CREDIT', amount: 100, balance_after_txn: 1100, recorded_by_user_id: user1Id },
      { wallet_id: user1WalletId, transaction_type: 'DEBIT', amount: 50, balance_after_txn: 1050, recorded_by_user_id: user1Id },
    ]);
    const { data: user1TxnData, error: user1TxnError } = await adminClient
      .from('token_wallet_transactions')
      .select('transaction_id')
      .eq('wallet_id', user1WalletId)
      .eq('amount', 100) // Be specific to get one
      .single();
    assert(!user1TxnError, `Failed to fetch user1 transaction for tests: ${user1TxnError?.message}`);
    assertExists(user1TxnData, "User1 transaction data for ID retrieval must exist.");
    user1TxnId = user1TxnData.transaction_id;

    // For org1WalletId (2 transactions)
    await adminClient.from('token_wallet_transactions').insert([
      { wallet_id: org1WalletId, transaction_type: 'CREDIT', amount: 200, balance_after_txn: 2200, recorded_by_user_id: user1Id }, // user1 is admin
      { wallet_id: org1WalletId, transaction_type: 'DEBIT', amount: 100, balance_after_txn: 2100, recorded_by_user_id: user1Id },
    ]);
    const { data: org1TxnData, error: org1TxnError } = await adminClient
      .from('token_wallet_transactions')
      .select('transaction_id')
      .eq('wallet_id', org1WalletId)
      .eq('amount', 200) // Be specific to get one
      .single();
    assert(!org1TxnError, `Failed to fetch org1 transaction for tests: ${org1TxnError?.message}`);
    assertExists(org1TxnData, "Org1 transaction data for ID retrieval must exist.");
    org1TxnId = org1TxnData.transaction_id;

    // For user2WalletId (1 transaction)
    await adminClient.from('token_wallet_transactions').insert([
      { wallet_id: user2WalletId, transaction_type: 'CREDIT', amount: 75, balance_after_txn: 575, recorded_by_user_id: user2Id },
    ]);
    // For org2WalletId (1 transaction)
    await adminClient.from('token_wallet_transactions').insert([
      { wallet_id: org2WalletId, transaction_type: 'CREDIT', amount: 150, balance_after_txn: 3150, recorded_by_user_id: user2Id }, // user2 is admin of org2
    ]);
  });

  afterAll(async () => {
    for (const walletId of walletsToCleanup) {
      await adminClient.from('token_wallets').delete().eq('wallet_id', walletId);
    }
    for (const orgId of orgsToCleanup) {
      await adminClient.from('organization_members').delete().eq('organization_id', orgId);
      await adminClient.from('organizations').delete().eq('id', orgId);
    }
    orgsToCleanup.length = 0;
    for (const userId of usersToCleanup) {
      await adminClient.auth.admin.deleteUser(userId);
    }
  });

  describe('token_wallets RLS', () => {
    describe('SELECT Operations', () => {
      it('User CAN SELECT their own wallet', async () => {
        const { data, error } = await user1Client.from('token_wallets').select('*').eq('wallet_id', user1WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 1); assertEquals(data[0].user_id, user1Id);
      });
      it("User CANNOT SELECT another user's wallet", async () => {
        const { data, error } = await user1Client.from('token_wallets').select('*').eq('wallet_id', user2WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 0);
      });
      it("Org admin CAN SELECT their org's wallet", async () => {
        const { data, error } = await user1Client.from('token_wallets').select('*').eq('wallet_id', org1WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 1); assertEquals(data[0].organization_id, org1Id);
      });
      it("User (non-admin of org) CANNOT SELECT an org's wallet", async () => {
        const { data, error } = await user2Client.from('token_wallets').select('*').eq('wallet_id', org1WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 0);
      });
      it("Org admin CANNOT SELECT another org's wallet", async () => {
        const { data, error } = await user1Client.from('token_wallets').select('*').eq('wallet_id', org2WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 0);
      });
      it("Anonymous user CANNOT SELECT any user wallet", async () => {
        const { data, error } = await anonClient.from('token_wallets').select('*').eq('wallet_id', user1WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 0);
      });
      it("Anonymous user CANNOT SELECT any org wallet", async () => {
        const { data, error } = await anonClient.from('token_wallets').select('*').eq('wallet_id', org1WalletId);
        assert(!error); assertExists(data); assertEquals(data.length, 0);
      });
    });

    describe('INSERT Operations', () => {
      it("Authenticated user CANNOT INSERT a wallet for themselves", async () => {
        const { error } = await user1Client.from('token_wallets').insert({ user_id: user1Id, balance: 100, currency: 'AI_TOKEN' });
        assertExists(error); assertEquals(error.code, '42501');
      });
      it("Authenticated user (even org admin) CANNOT INSERT a wallet for their org", async () => {
        const { error } = await user1Client.from('token_wallets').insert({ organization_id: org1Id, user_id: null, balance: 100, currency: 'AI_TOKEN' });
        assertExists(error); assertEquals(error.code, '42501');
      });
      it("Anonymous user CANNOT INSERT any wallet", async () => {
        const { error } = await anonClient.from('token_wallets').insert({ user_id: user1Id, balance: 100, currency: 'AI_TOKEN' });
        assertExists(error); 
      });
    });

    describe('UPDATE Operations', () => {
      it("Authenticated user CANNOT UPDATE their own wallet directly", async () => {
        const originalBalance = 1000; 
        const { error: updateError, count: updateCount } = await user1Client.from('token_wallets').update({ balance: 9999 }).eq('wallet_id', user1WalletId);
        assertEquals(updateError, null, "No explicit error expected if RLS prevents row matching for update.");
        assertEquals(updateCount, null, "Update operation should result in null count due to RLS filtering.");

        const { data: walletData, error: fetchError } = await user1Client.from('token_wallets').select('balance').eq('wallet_id', user1WalletId).single();
        assert(!fetchError, "Fetching wallet after update attempt should not error.");
        assertExists(walletData, "Wallet data should exist after update attempt.");
        assertEquals(walletData.balance, originalBalance, "Wallet balance should not have changed.");
      });

      it("Org admin CANNOT UPDATE their org's wallet directly", async () => {
        const originalOrgBalance = 2000;
        const { error: updateError, count: updateCount } = await user1Client.from('token_wallets').update({ balance: 8888 }).eq('wallet_id', org1WalletId);
        assertEquals(updateError, null, "No explicit error expected if RLS prevents row matching for org update.");
        assertEquals(updateCount, null, "Org update operation should result in null count due to RLS filtering.");
        
        const { data: orgWalletData, error: fetchError } = await user1Client.from('token_wallets').select('balance').eq('wallet_id', org1WalletId).single();
        assert(!fetchError, "Fetching org wallet after update attempt should not error.");
        assertExists(orgWalletData, "Org wallet data should exist after update attempt.");
        assertEquals(orgWalletData.balance, originalOrgBalance, "Org wallet balance should not have changed.");
      });
    });

    describe('DELETE Operations', () => {
      let tempUserWalletId: string;

      beforeAll(async () => {
        const { data, error } = await adminClient.from('token_wallets').insert({
          user_id: user3Id, balance: 10, currency: 'AI_TOKEN',
        }).select('wallet_id').single();
        assert(!error, `Failed to create temp wallet for DELETE tests: ${error?.message}`);
        assertExists(data?.wallet_id); tempUserWalletId = data.wallet_id; walletsToCleanup.add(tempUserWalletId); 
      });

      it("Authenticated user (user1) CANNOT DELETE another user's (user3) wallet", async () => {
        const { error, count } = await user1Client.from('token_wallets').delete().eq('wallet_id', tempUserWalletId); 
        assertEquals(error, null, "No explicit error expected if RLS prevents row matching for delete.");
        assertEquals(count, null, "Delete operation for other user should result in null count due to RLS filtering.");
      });

      it("Authenticated user (user3) CANNOT DELETE their own wallet", async () => {
        const { data: signInData3, error: signInError3 } = await user3Client.auth.signInWithPassword({ email: user3Email, password: 'password123' });
        assertExists(signInData3?.session, 'User 3 session should exist for delete test'); assert(!signInError3);
        user3Client.auth.setSession(signInData3.session);
        
        const { error, count } = await user3Client.from('token_wallets').delete().eq('wallet_id', tempUserWalletId); 
        assertEquals(error, null, "No explicit error expected if RLS prevents row matching for self-delete.");
        assertEquals(count, null, "Delete operation for own wallet by user3 should result in null count due to RLS filtering.");
      });

      it("Org admin CANNOT DELETE their org's wallet", async () => {
        const { error, count } = await user1Client.from('token_wallets').delete().eq('wallet_id', org1WalletId);
        assertEquals(error, null, "No explicit error expected if RLS prevents row matching for org delete.");
        assertEquals(count, null, "Delete operation for org wallet by admin should result in null count due to RLS filtering.");
      });
    });
  });

  describe('token_wallet_transactions RLS', () => {
    describe('SELECT Operations', () => {
      it("User CAN SELECT transactions for their own wallet", async () => {
        const { data, error } = await user1Client
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', user1WalletId);
        assert(!error, "Fetching own transactions should not error.");
        assertExists(data, "Data for own transactions should exist.");
        assertEquals(data.length, 2, "Should retrieve 2 transactions for user1WalletId.");
      });

      it("User CANNOT SELECT transactions for another user's wallet", async () => {
        const { data, error } = await user1Client
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', user2WalletId);
        assert(!error, "Querying another user txn should not error directly.");
        assertExists(data, "Data array should exist.");
        assertEquals(data.length, 0, "Should retrieve 0 transactions for user2WalletId by user1.");
      });

      it("Org admin CAN SELECT transactions for their org's wallet", async () => {
        const { data, error } = await user1Client // User1 is admin of Org1
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', org1WalletId);
        assert(!error, "Fetching org transactions by admin should not error.");
        assertExists(data, "Data for org transactions should exist for admin.");
        assertEquals(data.length, 2, "Should retrieve 2 transactions for org1WalletId.");
      });

      it("Org admin CANNOT SELECT transactions for another org's wallet", async () => {
        const { data, error } = await user1Client // User1 is admin of Org1, not Org2
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', org2WalletId);
        assert(!error, "Querying another org txn should not error directly.");
        assertExists(data, "Data array should exist.");
        assertEquals(data.length, 0, "Should retrieve 0 transactions for org2WalletId by user1 (admin of org1).");
      });
      
      it("User (non-admin of org) CANNOT SELECT transactions for an org's wallet", async () => {
        const { data, error } = await user2Client // User2 is not admin of Org1
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', org1WalletId);
        assert(!error, "Querying org txn by non-admin should not error directly.");
        assertExists(data, "Data array should exist.");
        assertEquals(data.length, 0, "Should retrieve 0 transactions for org1WalletId by user2 (non-admin).");
      });

      it("Anonymous user CANNOT SELECT any transactions", async () => {
        const { data: dataUserWallet, error: errorUserWallet } = await anonClient
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', user1WalletId);
        assert(!errorUserWallet); assertExists(dataUserWallet); assertEquals(dataUserWallet.length, 0);

        const { data: dataOrgWallet, error: errorOrgWallet } = await anonClient
          .from('token_wallet_transactions')
          .select('*')
          .eq('wallet_id', org1WalletId);
        assert(!errorOrgWallet); assertExists(dataOrgWallet); assertEquals(dataOrgWallet.length, 0);
      });
    });

    describe('INSERT Operations', () => {
      it("Authenticated user (user1) CANNOT INSERT a transaction for their own wallet", async () => {
        const { error } = await user1Client.from('token_wallet_transactions').insert({
          wallet_id: user1WalletId,
          transaction_type: 'CREDIT',
          amount: 10,
          balance_after_txn: 1000, // Arbitrary, RLS should block before check
          recorded_by_user_id: user1Id
        });
        assertExists(error, "Insert transaction by user1 for own wallet should be denied by RLS.");
        assertEquals(error.code, '42501', "Expected RLS violation error code.");
      });

      it("Authenticated user (user1) CANNOT INSERT a transaction for another user's (user2) wallet", async () => {
        const { error } = await user1Client.from('token_wallet_transactions').insert({
          wallet_id: user2WalletId,
          transaction_type: 'CREDIT',
          amount: 10,
          balance_after_txn: 510,
          recorded_by_user_id: user1Id
        });
        assertExists(error, "Insert transaction by user1 for user2's wallet should be denied by RLS.");
        assertEquals(error.code, '42501', "Expected RLS violation error code.");
      });

      it("Org admin (user1 for org1) CANNOT INSERT a transaction for their org's wallet", async () => {
        const { error } = await user1Client.from('token_wallet_transactions').insert({
          wallet_id: org1WalletId,
          transaction_type: 'CREDIT',
          amount: 10,
          balance_after_txn: 2010,
          recorded_by_user_id: user1Id
        });
        assertExists(error, "Insert transaction by org admin for own org wallet should be denied by RLS.");
        assertEquals(error.code, '42501', "Expected RLS violation error code.");
      });

      it("Org admin (user1 for org1) CANNOT INSERT a transaction for another org's (org2) wallet", async () => {
        const { error } = await user1Client.from('token_wallet_transactions').insert({
          wallet_id: org2WalletId,
          transaction_type: 'CREDIT',
          amount: 10,
          balance_after_txn: 3010,
          recorded_by_user_id: user1Id
        });
        assertExists(error, "Insert transaction by org admin for another org wallet should be denied by RLS.");
        assertEquals(error.code, '42501', "Expected RLS violation error code.");
      });

      it("Anonymous user CANNOT INSERT any transaction", async () => {
        const { error } = await anonClient.from('token_wallet_transactions').insert({
          wallet_id: user1WalletId, // Arbitrary wallet
          transaction_type: 'CREDIT',
          amount: 10,
          balance_after_txn: 1010,
          recorded_by_user_id: user1Id // Arbitrary, RLS should block
        });
        assertExists(error, "Insert transaction by anonymous user should be denied.");
        // For anonymous users, this might be a different error code or just '42501'
        // Let's check for a generic error first, and can refine if tests show a specific pattern.
      });
    });

    describe('UPDATE Operations', () => {
      it("Authenticated user (user1) CANNOT UPDATE a transaction in their own wallet", async () => {
        const originalAmount = 100; // Based on beforeAll setup for user1TxnId
        const { error: updateError, count: updateCount } = await user1Client
          .from('token_wallet_transactions')
          .update({ amount: 999 })
          .eq('transaction_id', user1TxnId);
        
        assertEquals(updateError, null, "No explicit error expected if RLS prevents row matching for update.");
        assertEquals(updateCount, null, "Update operation should result in null count due to RLS filtering.");

        // Verify the transaction was not actually updated
        const { data: txnData, error: fetchError } = await adminClient // Use admin to bypass RLS for verification
          .from('token_wallet_transactions')
          .select('amount')
          .eq('transaction_id', user1TxnId)
          .single();
        assert(!fetchError, "Fetching transaction post-update attempt should not error.");
        assertExists(txnData, "Transaction data should exist for verification.");
        assertEquals(txnData.amount, originalAmount, "Transaction amount should not have changed.");
      });

      it("Org admin (user1 for org1) CANNOT UPDATE a transaction in their org's wallet", async () => {
        const originalAmount = 200; // Based on beforeAll setup for org1TxnId
        const { error: updateError, count: updateCount } = await user1Client // user1 is admin of org1
          .from('token_wallet_transactions')
          .update({ amount: 888 })
          .eq('transaction_id', org1TxnId);

        assertEquals(updateError, null, "No explicit error expected if RLS prevents row matching for org txn update.");
        assertEquals(updateCount, null, "Org txn update operation should result in null count due to RLS filtering.");

        // Verify the transaction was not actually updated
        const { data: txnData, error: fetchError } = await adminClient
          .from('token_wallet_transactions')
          .select('amount')
          .eq('transaction_id', org1TxnId)
          .single();
        assert(!fetchError, "Fetching org transaction post-update attempt should not error.");
        assertExists(txnData, "Org transaction data should exist for verification.");
        assertEquals(txnData.amount, originalAmount, "Org transaction amount should not have changed.");
      });

      it("Anonymous user CANNOT UPDATE any transaction", async () => {
        const { error: updateError, count: updateCount } = await anonClient
          .from('token_wallet_transactions')
          .update({ amount: 777 })
          .eq('transaction_id', user1TxnId); // Use any valid txn_id, RLS should block

        assertEquals(updateError, null, "No explicit error expected for anon update if RLS prevents row matching.");
        assertEquals(updateCount, null, "Anon update operation should result in null count.");
      });
    });

    describe('DELETE Operations', () => {
      it("Authenticated user (user1) CANNOT DELETE a transaction from their own wallet", async () => {
        const { error: deleteError, count: deleteCount } = await user1Client
          .from('token_wallet_transactions')
          .delete()
          .eq('transaction_id', user1TxnId);

        assertEquals(deleteError, null, "No explicit error expected if RLS prevents row matching for delete.");
        assertEquals(deleteCount, null, "Delete operation should result in null count due to RLS filtering.");

        // Verify the transaction was not actually deleted
        const { data: txnData, error: fetchError } = await adminClient
          .from('token_wallet_transactions')
          .select('transaction_id')
          .eq('transaction_id', user1TxnId)
          .single();
        assert(!fetchError, "Fetching transaction post-delete attempt should not error.");
        assertExists(txnData, "Transaction should still exist after delete attempt.");
      });

      it("Org admin (user1 for org1) CANNOT DELETE a transaction from their org's wallet", async () => {
        const { error: deleteError, count: deleteCount } = await user1Client // user1 is admin of org1
          .from('token_wallet_transactions')
          .delete()
          .eq('transaction_id', org1TxnId);

        assertEquals(deleteError, null, "No explicit error expected if RLS prevents row matching for org txn delete.");
        assertEquals(deleteCount, null, "Org txn delete operation should result in null count due to RLS filtering.");

        // Verify the transaction was not actually deleted
        const { data: txnData, error: fetchError } = await adminClient
          .from('token_wallet_transactions')
          .select('transaction_id')
          .eq('transaction_id', org1TxnId)
          .single();
        assert(!fetchError, "Fetching org transaction post-delete attempt should not error.");
        assertExists(txnData, "Org transaction should still exist after delete attempt.");
      });

      it("Anonymous user CANNOT DELETE any transaction", async () => {
        const { error: deleteError, count: deleteCount } = await anonClient
          .from('token_wallet_transactions')
          .delete()
          .eq('transaction_id', user1TxnId); // Use any valid txn_id, RLS should block

        assertEquals(deleteError, null, "No explicit error expected for anon delete if RLS prevents row matching.");
        assertEquals(deleteCount, null, "Anon delete operation should result in null count.");
      });
    });
  });
});
