import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
// Note: We are not using the postgres client anymore as we only generate the SQL.
// import { Client } from "https://deno.land/x/postgres@v0.19.2/mod.ts"; 
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";

async function generateTriggerSql() {
  // Load environment variables from the root .env file
  const envPath = path.resolve(Deno.cwd(), "..", "..", ".env");
  console.log(`Attempting to load environment variables from: ${envPath}`);
  try {
    await config({ path: envPath, export: true });
    console.log("Environment variables loaded successfully.");
  } catch (error) {
    console.error(`Error loading .env file from ${envPath}:`, error);
    console.warn("Proceeding with Deno.env.get() as fallback...");
  }

  // --- Get required variables ---
  const supabaseUrl = Deno.env.get("VITE_SUPABASE_URL");
  if(!supabaseUrl) {
    console.error("Could not find VITE_SUPABASE_URL in .env.local or .env file.");
    Deno.exit(1);
  }
  const serviceRoleKey = Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY");
  if(!serviceRoleKey) {
    console.error("Could not find VITE_SUPABASE_SERVICE_ROLE_KEY in .env.local or .env file.");
    Deno.exit(1);
  }
  // DB Password no longer needed as we only generate SQL

  // --- Construct Function URL ---
  const functionUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/on-user-created`;

  // --- Construct the multi-part SQL string --- 
  // IMPORTANT: Using the exact structure from the working example,
  // but injecting the service key safely.

  const finalSql = `
-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_user_created_hook ON auth.users;

-- Create the helper function
CREATE OR REPLACE FUNCTION handle_user_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Note: Using supabase_function.http_post as per the working example
  PERFORM supabase_function.http_post(
    '${functionUrl}', -- URL
    jsonb_build_object( -- Headers
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ${serviceRoleKey}' -- Inject key safely
    ),
    ('{"type": "INSERT", "table": "users", "schema": "auth", "record": ' || row_to_json(NEW)::text || '}')::jsonb, -- Body
    5000 -- Timeout
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- SECURITY DEFINER is important if the function needs elevated privileges,
-- common for triggers calling external services.

-- Create the trigger to call the helper function
CREATE TRIGGER on_user_created_hook
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_created();

-- Comment on the trigger
COMMENT ON TRIGGER on_user_created_hook ON auth.users IS 'Trigger to sync new user to external services via handle_user_created function.';
`;

  // --- Print the final SQL ---
  console.log("\n--- SQL to run manually on remote database via Supabase Dashboard SQL Editor: ---");
  console.log(finalSql);
  console.log("--- End SQL ---\n");

  // Ensure the service key wasn't accidentally printed if something went wrong
  if (finalSql.includes(serviceRoleKey) && serviceRoleKey.length > 5) {
      console.log("SQL generated successfully. Please copy the block above and run it in the Supabase SQL Editor.");
  } else {
      console.error("Error: SQL generation might have failed (key missing?).");
      Deno.exit(1);
  }
}

// Run the function
generateTriggerSql(); 