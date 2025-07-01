import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TokenWalletService } from '../_shared/services/tokenWalletService.ts';
import { Database } from '../types_db.ts'; // Assuming your DB types are here

const SYSTEM_USER_ID = '19c35c50-eab5-49db-997f-e6fea60253eb'; // IMPORTANT: Replace with actual UUID from migrations
const FREE_PLAN_ITEM_ID = 'SYSTEM_FREE_TIER_MONTHLY_ALLOWANCE'; // Match with item_id_internal in subscription_plans
const TRANSACTION_TYPE_RECURRING_FREE = 'CREDIT_MONTHLY_FREE_ALLOCATION';

// Exportable handler function
export async function handleAllocatePeriodicTokens(
  req: Request,
  supabaseAdminClientInstance: SupabaseClient<Database>,
  tokenWalletService: TokenWalletService
): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 1. Initialize Supabase Admin Client - Now passed as parameter
  // const supabaseAdminClientInstance = createClient<Database>(
  //   Deno.env.get('SUPABASE_URL') ?? '',
  //   Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  // );

  // Pass console as a simple logger; consider a more structured logger if needed.
  // const tokenWalletService = new TokenWalletService(supabaseAdminClientInstance); // Now passed as parameter

  try {
    console.log('Starting periodic token allocation for free users...');

    // 2. Get Free Plan Details
    const { data: freePlan, error: planError } = await supabaseAdminClientInstance
      .from('subscription_plans')
      .select('id, tokens_to_award, interval, interval_count')
      .eq('item_id_internal', FREE_PLAN_ITEM_ID)
      .eq('name', 'Free') // Additional guard
      .single();

    if (planError || !freePlan) {
      console.error('Error fetching free plan details or plan not found:', planError?.message);
      return new Response(JSON.stringify({ error: 'Free plan configuration not found.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!freePlan.tokens_to_award || freePlan.tokens_to_award <= 0) {
      console.error('Free plan has no tokens_to_award configured:', freePlan);
      return new Response(JSON.stringify({ error: 'Free plan tokens_to_award is not configured or is zero.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const tokensToAward = freePlan.tokens_to_award;
    // Assuming free plan is always monthly for this logic.
    // If interval/interval_count from freePlan needs to be dynamically used for date math, adjust accordingly.
    // For simplicity, we assume '1 month' as per initial requirements for free tier.

    // 3. Fetch Eligible Free Users
    // Users on the free plan whose current period has ended
    const now = new Date().toISOString();
    const { data: freeUserSubscriptions, error: userSubError } = await supabaseAdminClientInstance
      .from('user_subscriptions')
      .select('id, user_id, current_period_start, current_period_end, plan_id')
      .eq('plan_id', freePlan.id)
      .eq('status', 'free')
      .lte('current_period_end', now); // current_period_end is in the past or now

    if (userSubError) {
      console.error('Error fetching free user subscriptions:', userSubError.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch user subscriptions.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!freeUserSubscriptions || freeUserSubscriptions.length === 0) {
      console.log('No free users due for token allocation at this time.');
      return new Response(JSON.stringify({ message: 'No users due for allocation.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${freeUserSubscriptions.length} free users for potential token allocation.`);
    let usersAllocated = 0;
    let usersFailed = 0;

    for (const sub of freeUserSubscriptions) {
      if (!sub.user_id || !sub.current_period_end) {
        console.warn(`Skipping subscription ${sub.id} due to missing user_id or current_period_end.`);
        continue;
      }

      try {
        // 4. Get Wallet ID
        const { data: wallet, error: walletError } = await supabaseAdminClientInstance
          .from('token_wallets')
          .select('wallet_id')
          .eq('user_id', sub.user_id)
          .is('organization_id', null) // Ensure it's a user wallet
          .single();

        if (walletError || !wallet) {
          console.error(`Wallet not found for user ${sub.user_id}. Subscription ID: ${sub.id}`, walletError?.message);
          usersFailed++;
          continue;
        }

        // 5. Grant Tokens
        // Idempotency: The primary check is current_period_end.
        // A more robust idempotency for recordTransaction would be to use an idempotency key
        // combining user_id and the target new current_period_start (or an allocation period identifier).
        // Example: `monthly_free_${sub.user_id}_${new Date(sub.current_period_end).toISOString().substring(0,10)}`
        // For now, we rely on the period logic. The DB function record_token_transaction may have its own.

        await tokenWalletService.recordTransaction({
          walletId: wallet.wallet_id,
          type: TRANSACTION_TYPE_RECURRING_FREE,
          amount: tokensToAward.toString(),
          recordedByUserId: SYSTEM_USER_ID,
          idempotencyKey: `${sub.id}-${freePlan.id}-${sub.current_period_end}`,
          relatedEntityId: sub.plan_id ?? undefined,
          relatedEntityType: 'subscription_plans',
          notes: String(`Monthly free token allocation. Period ending ${new Date(sub.current_period_end!).toISOString().substring(0,10)}.`),
          // idempotencyKey: `...` // Optional: if TokenWalletService supports it directly.
        });
        
        console.log(`Successfully awarded ${tokensToAward} tokens to user ${sub.user_id}.`);

        // 6. Update Subscription Period
        const newPeriodStart = sub.current_period_end; // The old end becomes the new start
        const newPeriodEnd = new Date(new Date(newPeriodStart).setMonth(new Date(newPeriodStart).getMonth() + 1)).toISOString();

        const { error: updateSubError } = await supabaseAdminClientInstance
          .from('user_subscriptions')
          .update({
            current_period_start: newPeriodStart,
            current_period_end: newPeriodEnd,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sub.id);

        if (updateSubError) {
          console.error(`Failed to update subscription period for user ${sub.user_id} after token grant. Sub ID: ${sub.id}. Error: ${updateSubError.message}. CRITICAL: This may lead to double allocation if not manually corrected.`);
          // Consider a retry mechanism or dead-letter queue for such critical failures.
          usersFailed++;
        } else {
          console.log(`Successfully updated subscription period for user ${sub.user_id} to start ${newPeriodStart} and end ${newPeriodEnd}.`);
          usersAllocated++;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to process token allocation for user ${sub.user_id}. Subscription ID: ${sub.id}. Error:`, errorMessage);
        usersFailed++;
      }
    }

    const summary = `Periodic token allocation complete. Users processed: ${freeUserSubscriptions.length}. Tokens awarded to: ${usersAllocated}. Failed attempts: ${usersFailed}.`;
    console.log(summary);
    return new Response(JSON.stringify({ message: 'Allocation process finished.', summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e)); // Ensure error is an Error instance
    console.error('Unhandled error in allocate-periodic-tokens function:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Original serve call, now uses the exported handler
serve(async (req) => {
  // Instantiate dependencies here for the actual function execution
  const supabaseAdminClient = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const tokenWalletSvc = new TokenWalletService(supabaseAdminClient);

  return await handleAllocatePeriodicTokens(req, supabaseAdminClient, tokenWalletSvc);
});
