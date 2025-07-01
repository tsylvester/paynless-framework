import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { load } from 'https://deno.land/std@0.224.0/dotenv/mod.ts';

const env = await load();

const supabaseUrl =
  env['SUPABASE_PROD_URL'] ?? Deno.env.get('SUPABASE_PROD_URL');
const supabaseServiceKey =
  env['SUPABASE_PROD_SRK'] ?? Deno.env.get('SUPABASE_PROD_SRK');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    'Missing SUPABASE_PROD_URL or SUPABASE_PROD_SRK env variables.',
  );
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function backfillUserData() {
  console.log('Starting user data backfill...');

  // 1. Get all users from auth.users
  const { data: { users }, error: usersError } = await supabase.auth.admin
    .listUsers();
  if (usersError) {
    console.error('Error fetching users:', usersError);
    return;
  }
  console.log(`Found ${users.length} users in auth.users.`);

  // 2. Get all profiles
  const { data: profiles, error: profilesError } = await supabase.from(
    'user_profiles',
  ).select('user_id');
  if (profilesError) {
    console.error('Error fetching user profiles:', profilesError);
    return;
  }
  const profileUserIds = new Set(profiles.map((p) => p.user_id));
  console.log(`Found ${profileUserIds.size} user profiles.`);

  // 3. Find users without profiles and create them
  const usersWithoutProfiles = users.filter((u) => !profileUserIds.has(u.id));
  console.log(
    `Found ${usersWithoutProfiles.length} users without profiles.`,
  );

  if (usersWithoutProfiles.length > 0) {
    const newProfiles = usersWithoutProfiles.map((user) => ({
      user_id: user.id,
      email: user.email,
    }));
    const { error: insertProfilesError } = await supabase.from(
      'user_profiles',
    ).insert(newProfiles);
    if (insertProfilesError) {
      console.error('Error creating profiles:', insertProfilesError);
    } else {
      console.log(`Successfully created ${newProfiles.length} profiles.`);
    }
  }

  // 4. Get all token wallets
  const { data: wallets, error: walletsError } = await supabase.from(
    'token_wallets',
  ).select('user_id');
  if (walletsError) {
    console.error('Error fetching token wallets:', walletsError);
    return;
  }
  const walletUserIds = new Set(wallets.map((w) => w.user_id));
  console.log(`Found ${walletUserIds.size} token wallets.`);

  // 5. Find users without wallets and create them
  const usersWithoutWallets = users.filter((u) => !walletUserIds.has(u.id));
  console.log(
    `Found ${usersWithoutWallets.length} users without token wallets.`,
  );

  if (usersWithoutWallets.length > 0) {
    const newWallets = usersWithoutWallets.map((user) => ({
      user_id: user.id,
    }));
    const { error: insertWalletsError } = await supabase.from('token_wallets')
      .insert(newWallets);
    if (insertWalletsError) {
      console.error('Error creating token wallets:', insertWalletsError);
    } else {
      console.log(
        `Successfully created ${newWallets.length} token wallets.`,
      );
    }
  }

  // 6. Get the "Free" subscription plan
  const { data: freePlan, error: freePlanError } = await supabase.from(
    'subscription_plans',
  ).select('id').eq('name', 'Free').single();
  if (freePlanError || !freePlan) {
    console.error('Error fetching "Free" plan:', freePlanError);
    return;
  }
  console.log(`Found "Free" plan with id: ${freePlan.id}`);

  // 7. Get all user subscriptions
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('user_subscriptions').select('user_id');
  if (subscriptionsError) {
    console.error('Error fetching user subscriptions:', subscriptionsError);
    return;
  }
  const subscriptionUserIds = new Set(subscriptions.map((s) => s.user_id));
  console.log(`Found ${subscriptionUserIds.size} user subscriptions.`);

  // 8. Find users without subscriptions and create a "Free" one for them
  const usersWithoutSubscriptions = users.filter((u) =>
    !subscriptionUserIds.has(u.id)
  );
  console.log(
    `Found ${usersWithoutSubscriptions.length} users without subscriptions.`,
  );

  if (usersWithoutSubscriptions.length > 0) {
    const now = new Date();
    const oneMonthFromNow = new Date(now.setMonth(now.getMonth() + 1));

    const newSubscriptions = usersWithoutSubscriptions.map((user) => ({
      user_id: user.id,
      plan_id: freePlan.id,
      status: 'active',
      period_start: new Date().toISOString(),
      period_end: oneMonthFromNow.toISOString(),
    }));

    const { error: insertSubscriptionsError } = await supabase.from(
      'user_subscriptions',
    ).insert(newSubscriptions);
    if (insertSubscriptionsError) {
      console.error(
        'Error creating "Free" subscriptions:',
        insertSubscriptionsError,
      );
    } else {
      console.log(
        `Successfully created ${newSubscriptions.length} "Free" subscriptions.`,
      );
    }
  }

  console.log('User data backfill complete.');
}

backfillUserData(); 