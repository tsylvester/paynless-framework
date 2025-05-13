import {
  assertEquals,
  assertRejects,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  stub,
  type Stub,
  assertSpyCall,
} from "https://deno.land/std@0.224.0/testing/mock.ts";

// Ensure SupabaseClient is imported correctly for Deno (npm specifier if not using import map)
import { SupabaseClient, createClient } from 'npm:@supabase/supabase-js@2'; // Specify version for stability
import { TokenWalletService } from './tokenWalletService.ts';
import {
  type ITokenWalletService,
  type TokenWallet,
  type TokenWalletTransaction,
  type TokenWalletTransactionType,
} from '../types/tokenWallet.types.ts'; // Corrected import path
import type { Database } from '../../types_db.ts';

// Configuration for Supabase client - get from environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
  throw new Error("Supabase environment variables for tests are not set.");
}

// Create a single Supabase client for all tests in this file
// The service itself will receive this client, or one derived from it.
const supabaseTestClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false } // Recommended for test environments
});

// This function creates the mock implementation for rpc.
// It will return a function that itself returns a Promise resolving to the desired structure.
const createRpcMock = (resolveValue: { data: unknown; error: unknown | null }) => {
  return () => Promise.resolve(resolveValue);
};

Deno.test("TokenWalletService (Integration with Dev Server)", async (t) => {
  const tokenWalletService: ITokenWalletService = new TokenWalletService(supabaseTestClient);

  const cleanupWallet = async (walletId: string) => {
    const { error: txnError } = await supabaseTestClient
      .from('token_wallet_transactions')
      .delete()
      .eq('wallet_id', walletId);
    if (txnError) console.error(`[Test Cleanup] Error cleaning up transactions for wallet ${walletId}:`, txnError.message);

    const { error: walletError } = await supabaseTestClient
      .from('token_wallets')
      .delete()
      .eq('wallet_id', walletId);
    if (walletError) console.error(`[Test Cleanup] Error cleaning up wallet ${walletId}:`, walletError.message);
  };

  await t.step("recordTransaction: successful CREDIT_PURCHASE", async () => {
    const testUserId = `test-user-${Date.now()}`;
    let tempWalletId = "";

    try {
      const { data: newWallet, error: createWalletError } = await supabaseTestClient
        .from('token_wallets')
        .insert({ user_id: testUserId, balance: 0, currency: 'AI_TOKEN' })
        .select()
        .single();
      
      assertExists(newWallet, "Test wallet should be created.");
      assertEquals(createWalletError, null, `Failed to create test wallet: ${createWalletError ? createWalletError.message : 'Unknown error'}`);
      tempWalletId = newWallet.wallet_id;

      const params = {
        walletId: tempWalletId,
        type: 'CREDIT_PURCHASE' as TokenWalletTransactionType,
        amount: '1000',
        relatedEntityId: `payment-${Date.now()}`,
        relatedEntityType: 'payment_transaction',
        notes: 'Test credit purchase',
      };

      const transactionResult = await tokenWalletService.recordTransaction(params);

      assertExists(transactionResult, "Transaction result should exist.");
      assertEquals(transactionResult.walletId, params.walletId);
      assertEquals(transactionResult.type, params.type);
      assertEquals(transactionResult.amount, params.amount);
      assertExists(transactionResult.transactionId, "Transaction ID should be present.");

      const { data: dbTxn, error: dbTxnError } = await supabaseTestClient
        .from('token_wallet_transactions')
        .select('*')
        .eq('transaction_id', transactionResult.transactionId)
        .single();

      assertEquals(dbTxnError, null, `Error fetching transaction from DB: ${dbTxnError?.message}`);
      assertExists(dbTxn, "Transaction should be in the database.");
      assertEquals(dbTxn.wallet_id, params.walletId);
      assertEquals(dbTxn.transaction_type, params.type);
      assertEquals(dbTxn.amount.toString(), params.amount);
      assertEquals(dbTxn.notes, params.notes);

      const { data: updatedWallet, error: fetchWalletError } = await supabaseTestClient
        .from('token_wallets')
        .select('balance')
        .eq('wallet_id', tempWalletId)
        .single();
      
      assertEquals(fetchWalletError, null, `Error fetching updated wallet: ${fetchWalletError?.message}`);
      assertExists(updatedWallet, "Updated wallet data should exist.");
      assertEquals(updatedWallet.balance.toString(), params.amount, "Wallet balance should be updated by the amount of credit.");
      assertEquals(dbTxn.balance_after_txn.toString(), params.amount, "Ledger balance_after_txn should match new wallet balance.");

    } finally {
      if (tempWalletId) {
        await cleanupWallet(tempWalletId);
      }
    }
  });

  await t.step("recordTransaction: fails if wallet does not exist", async () => {
    const nonExistentWalletId = `wallet-does-not-exist-${Date.now()}`;
    const params = {
      walletId: nonExistentWalletId,
      type: 'DEBIT_USAGE' as TokenWalletTransactionType,
      amount: '50',
      notes: 'Test debit from non-existent wallet',
    };

    await assertRejects(
      async () => { await tokenWalletService.recordTransaction(params); },
      Error,
      "Failed to record token transaction"
    );
  });

  // TODO: Add more test cases for recordTransaction (e.g., DEBIT_USAGE, different amounts, error scenarios from PG function)
  
  // TODO: Write integration tests for other service methods (createWallet, getWallet, etc.)
  // These will also involve direct DB interaction for setup and verification.
  // Example for createWallet:
  // await t.step("createWallet: successfully creates a new user wallet", async () => {
  //   const newUserId = `test-user-create-${Date.now()}`;
  //   let createdWalletId = "";
  //   try {
  //     const newWallet = await tokenWalletService.createWallet(newUserId, undefined);
  //     assertExists(newWallet);
  //     assertEquals(newWallet.userId, newUserId);
  //     createdWalletId = newWallet.walletId;
  //     // Verify in DB
  //     const { data: dbWallet, error } = await supabaseTestClient.from('token_wallets').select('*').eq('wallet_id', createdWalletId).single();
  //     assertNull(error);
  //     assertExists(dbWallet);
  //     assertEquals(dbWallet.user_id, newUserId);
  //   } finally {
  //     if (createdWalletId) await cleanupWallet(createdWalletId);
  //   }
  // });
}); 