# Periodic Token Allocation (`allocate-periodic-tokens`)

## Purpose

This Supabase Edge Function is responsible for automatically allocating tokens to users on a periodic basis. Its primary current use case is to grant free plan users their monthly token allowance.

## Token Allocation Logic

- **Target Users**: The function specifically targets users subscribed to the 'Free' plan.
- **Frequency**: It's designed to be run monthly.
- **Action**: For each eligible free plan user whose current billing period has ended, the function will:
    1. Update their `current_period_start` and `current_period_end` in the `user_subscriptions` table to reflect the new month.
    2. Grant them the configured number of tokens for the 'Free' plan (currently 100,000 tokens) by creating a `CREDIT_ALLOCATION_FREE_PLAN` transaction in the `token_wallet_transactions` table.
    3. Update the `balance` in their `token_wallets` table.
    4. The transaction is recorded as being performed by the `system-token-allocator` user.

## Cron Job Setup

To ensure this function runs automatically every month, you need to set up a cron job that invokes this Edge Function.

**Endpoint URL:**

The URL for the Edge Function will be:
`[YOUR_SUPABASE_PROJECT_URL]/functions/v1/allocate-periodic-tokens`

Replace `[YOUR_SUPABASE_PROJECT_URL]` with your actual Supabase project URL (e.g., `https://xyzabc.supabase.co`).

**Authorization:**

The cron job request **MUST** include the Supabase `service_role_key` for authorization, as this function performs privileged operations. The key should be passed in the `Authorization` header as a Bearer token.

Header: `Authorization: Bearer [YOUR_SUPABASE_SERVICE_ROLE_KEY]`

**HTTP Method:**

The request should be a `POST` request. Although the function might not strictly require a POST body for its current operation, using POST is a good practice for functions that perform state changes.

**Cron Expression:**

To run the job at the beginning of every month (e.g., on the 1st day of the month at 00:00 UTC), you can use the following cron expression:

`0 0 1 * *`

This translates to: "At minute 0, hour 0, on day 1 of the month, for any month, and any day of the week."

**Example `curl` command:**

You can test invoking the function (replace placeholders) using `curl`:

```bash
curl -X POST \
  '[YOUR_SUPABASE_PROJECT_URL]/functions/v1/allocate-periodic-tokens' \
  -H 'Authorization: Bearer [YOUR_SUPABASE_SERVICE_ROLE_KEY]' \
  -H 'Content-Type: application/json' \
  --data '{}' # Empty JSON body for POST
```

### Setup Options:

1.  **External Cron Service (Recommended for most users):**
    *   Services like GitHub Actions (scheduled workflows), Vercel Cron Jobs, EasyCron, Cron-job.org, or a traditional cron daemon on a server you manage.
    *   Configure the service to make a `POST` request to the endpoint URL with the correct `Authorization` header and the cron expression `0 0 1 * *`.

2.  **Supabase pg_cron (Advanced):**
    *   If you prefer to keep scheduling within Supabase, you can use `pg_cron`. This requires the `pg_cron` extension to be enabled on your Supabase instance. You might also need the `http` and `pg_net` extensions for `pg_cron` to make HTTP requests.
    *   You would schedule a job that uses `http_post` or similar functionality to call the Edge Function.
    *   **Example Migration Snippet (Conceptual - requires `http` and `pg_net` to be set up):**
        ```sql
        -- Ensure pg_cron is enabled
        -- CREATE EXTENSION IF NOT EXISTS pg_cron; 
        -- (May require superuser or specific permissions)

        -- Grant usage of http extension to postgres role if needed
        -- GRANT USAGE ON SCHEMA net TO postgres; 

        -- Schedule the job
        -- Note: Storing your service_role_key directly in a cron job definition 
        -- within SQL might have security implications. Consider alternatives 
        -- like fetching it from a secure Vault or using a Supabase secrets manager if available.
        -- For simplicity, this example shows it directly but evaluate security for your production environment.

        SELECT cron.schedule(
          'monthly-token-allocation', -- Job name
          '0 0 1 * *',                -- Cron expression: At 00:00 on day-of-month 1.
          $$
          SELECT net.http_post(
              url:='[YOUR_SUPABASE_PROJECT_URL]/functions/v1/allocate-periodic-tokens',
              headers:=jsonb_build_object(
                  'Authorization', 'Bearer [YOUR_SUPABASE_SERVICE_ROLE_KEY]',
                  'Content-Type', 'application/json'
              ),
              body:='{}'::jsonb
          );
          $$
        );

        -- To unschedule:
        -- SELECT cron.unschedule('monthly-token-allocation');
        ```
    *   **Important Considerations for pg_cron:**
        *   **Security:** Storing the `service_role_key` directly in the cron job SQL is a security risk. Explore safer ways to manage this secret if using `pg_cron`.
        *   **Extensions:** Ensure `http` and `pg_net` extensions are enabled and the `postgres` user (or the user `pg_cron` runs as) has permissions to use them. This might involve running `CREATE EXTENSION IF NOT EXISTS http; CREATE EXTENSION IF NOT EXISTS pg_net;` and potentially `GRANT USAGE ON SCHEMA net TO postgres;`. This setup can be complex.
        *   **Error Handling & Logging:** Invoking Edge Functions via `pg_cron` might offer less visibility into HTTP errors compared to dedicated cron services with dashboards.

Due to the ease of setup, visibility, and potentially better secret management, using an **external cron service is generally recommended** over `pg_cron` for invoking Edge Functions.

## Development & Testing

To invoke this function during development or for testing, you can use the Supabase CLI:

```bash
supabase functions invoke allocate-periodic-tokens --no-verify-jwt
```

If you need to pass the service role key for a more realistic test (though `--no-verify-jwt` often suffices for local invocation if the function doesn't strictly check the JWT issuer for the service role but rather just its presence and validity for RLS bypass):

```bash
supabase functions invoke allocate-periodic-tokens --header "Authorization: Bearer $(supabase secrets get SERVICE_ROLE_KEY)"
```
(Assuming `SERVICE_ROLE_KEY` is set in your Supabase project secrets).
Alternatively, you can use the `curl` example provided above. 