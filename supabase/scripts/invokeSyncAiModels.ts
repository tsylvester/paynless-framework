// supabase/scripts/invokeSyncAiModels.ts

// This script invokes the 'sync-ai-models' Supabase Edge Function.
// It can be run against a local development environment or production.
//
// To run against production, use the --production flag:
// deno run --allow-net --allow-env supabase/scripts/invokeSyncAiModels.ts --production
//
// When running in production, ensure the PROD_SUPABASE_SERVICE_ROLE_KEY environment variable is set.
//
// For local development, ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// available in your environment or a .env file.

const args = Deno.args;
const isProduction = args.includes("--production");

let SUPABASE_URL: string | undefined;
let SERVICE_KEY: string | undefined;

if (isProduction) {
  console.log("Targeting production environment.");
  SUPABASE_URL = Deno.env.get("SUPABASE_PROD_URL");
  // For production, the service key should be provided via a specific environment variable
  // to avoid accidentally using a local development key.
  SERVICE_KEY = Deno.env.get("SUPABASE_PROD_SRK");
} else {
  console.log(
    "Targeting local environment. Use --production to target production.",
  );
  SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

const FUNCTION_NAME = "sync-ai-models";

if (!SUPABASE_URL) {
  console.error("Error: SUPABASE_URL is not configured.");
  if (!isProduction) {
    console.error(
      "Please ensure it is defined in your .env file or environment.",
    );
  }
  Deno.exit(1);
}

if (!SERVICE_KEY) {
  console.error("Error: Service key is not set.");
  if (isProduction) {
    console.error(
      "Please set the SUPABASE_PROD_SRK environment variable.",
    );
  } else {
    console.error(
      "Please ensure SUPABASE_SERVICE_ROLE_KEY is defined in your .env file or environment.",
    );
  }
  Deno.exit(1);
}

async function invokeSyncFunction(providersToSync?: string[]) {
  // If providersToSync is undefined or an empty array, send an empty body to sync all providers.
  // Otherwise, send the specified providers.
  const body = (providersToSync && providersToSync.length > 0) ? { providers: providersToSync } : {};
  const url = `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`;

  console.log(`Invoking ${FUNCTION_NAME} at ${url}`);
  if (providersToSync && providersToSync.length > 0) {
    console.log(`Targeting specific providers: ${JSON.stringify(providersToSync)}`);
  } else {
    console.log("Attempting to sync all providers.");
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const responseBodyText = await response.text();
    let responseBody;

    try {
        responseBody = JSON.parse(responseBodyText);
    } catch (e) {
        console.warn("Response from function was not valid JSON. Raw text will be shown.");
        console.log("Raw response text:", responseBodyText);
        // If it's not JSON, we can't assume an error structure, but still report HTTP status
        if (!response.ok) {
            console.error(`Error invoking function: ${response.status} ${response.statusText}`);
        }
        return; // Exit function early if response not JSON
    }

    if (!response.ok) {
      console.error(`Error invoking function: ${response.status} ${response.statusText}`);
      console.error("Response body:", responseBody);
    } else {
      console.log("Function invoked. Status:", response.status);
      console.log("Response:", responseBody);
    }
  } catch (error) {
    console.error("Failed to fetch function:", error.message);
    if (error instanceof TypeError && error.message.includes("fetch failed")) {
        console.error("This might be due to the local Supabase services not running or an incorrect SUPABASE_URL.");
        console.error(`Current SUPABASE_URL: ${SUPABASE_URL}`);
        console.error("Ensure 'supabase start' has been run and the URL is correct (usually http://127.0.0.1:54321 for local development).");
    }
  }
}

// To sync specific providers, pass an array: e.g., invokeSyncFunction(["google", "openai"]);
// To sync all providers (default behavior of the target function when body is empty or providers array is empty):
invokeSyncFunction();

/*
To run this script:
1. Ensure you have a .env file in your Supabase project root (e.g., C:/Users/Tim/paynless-framework/.env)
   with at least the following (use your actual local Supabase details):
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_SERVICE_KEY=your_local_service_role_key_here

   Provider API keys (OPENAI_API_KEY, GOOGLE_API_KEY, etc.) must also be in this .env file
   for the sync-ai-models Edge Function to use them.

2. Run the script from your project root (e.g., paynless-framework):
   deno run --allow-net --allow-env supabase/scripts/invokeSyncAiModels.ts
   Alternatively, to explicitly load the .env file if your Deno version requires it:
   deno run --allow-net --allow-env --env-file=.env supabase/scripts/invokeSyncAiModels.ts
*/ 