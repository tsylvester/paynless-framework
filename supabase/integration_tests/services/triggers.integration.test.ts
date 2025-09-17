import { assert, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { initializeSupabaseAdminClient, SUPABASE_URL, SERVICE_ROLE_KEY } from "../../functions/_shared/_integration.test.utils.ts";
import { getTriggersForTable } from "../../functions/_shared/_integration.test.utils.ts";

let adminClient: SupabaseClient;

Deno.test("Trigger introspection: on_new_job_created invokes invoke_dialectic_worker with Authorization header", async (t) => {
  adminClient = initializeSupabaseAdminClient();

  await t.step("Fetch triggers for dialectic_generation_jobs", async () => {
    const triggers = await getTriggersForTable(adminClient as any, 'dialectic_generation_jobs', 'public');
    assertExists(triggers, 'No triggers returned for dialectic_generation_jobs');

    const onNew = triggers.find(trg => trg.trigger_name.toLowerCase() === 'on_new_job_created');
    assertExists(onNew, 'Trigger on_new_job_created not found on public.dialectic_generation_jobs');

    // action_statement contains CREATE TRIGGER ... EXECUTE FUNCTION public.invoke_dialectic_worker()
    if (!onNew) {
      throw new Error('Trigger on_new_job_created not found on public.dialectic_generation_jobs');
    }
    const stmt = onNew.action_statement || '';
    assert(stmt.toLowerCase().includes('execute function public.invoke_dialectic_worker'), 'on_new_job_created does not invoke public.invoke_dialectic_worker');
  });

  await t.step("Verify Authorization header appears in invoke_dialectic_worker definition", async () => {
    // Read the function source via pg_get_functiondef
    const { data, error } = await (adminClient as any).rpc('execute_sql', { query: `
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'invoke_dialectic_worker'
    ` });
    assert(!error, `Error fetching function definition: ${error?.message}`);
    assertExists(data && data.length > 0, 'invoke_dialectic_worker definition not found');
    const def: string = data[0].def;
    assert(def.includes('Authorization'), 'invoke_dialectic_worker does not include Authorization header');
    assert(def.includes('Bearer'), 'invoke_dialectic_worker Authorization header is missing Bearer token format');
  });

  await t.step("Verify service role key and pg_net guard are present in invoke_dialectic_worker", async () => {
    const { data, error } = await (adminClient as any).rpc('execute_sql', { query: `
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'invoke_dialectic_worker'
    ` });
    assert(!error, `Error fetching function definition: ${error?.message}`);
    assertExists(data && data.length > 0, 'invoke_dialectic_worker definition not found');
    const def: string = data[0].def;

    const lower = def.toLowerCase();
    // Must reference the service role key (allow either current_setting or vault.get_secret)
    assert(
      lower.includes("current_setting('secret.supabase_service_role_key')") ||
      lower.includes("vault.get_secret('supabase_service_role_key')"),
      "invoke_dialectic_worker does not reference SUPABASE_SERVICE_ROLE_KEY via current_setting or vault.get_secret"
    );
    // Must guard on pg_net being installed
    assert(
      lower.includes('pg_extension') && lower.includes("pg_net"),
      "invoke_dialectic_worker does not include a pg_net extension guard (pg_extension / pg_net missing)"
    );
  });

  await t.step("Verify secrets exist for trigger (SUPABASE_URL, SERVICE_ROLE_KEY)", async () => {
    // Follow project convention: secrets are provided to tests via Deno.env, not read as GUCs.
    console.log('[Diagnostics] Using Deno.env values from test utils. URL set?:', !!SUPABASE_URL, 'SERVICE_ROLE_KEY length:', SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY.length : 0);
    assertExists(SUPABASE_URL, 'SUPABASE_URL env is not set');
    assertExists(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY env is not set');
  });
});


