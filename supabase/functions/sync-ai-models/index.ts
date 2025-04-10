// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors-headers.ts'

// We don't store types and interfaces inline, we store them in the types directories. These inline interfaces need to be fixed. 
// We also need this sync function to be extensible for other model providers. It's probably best to create subfolders for each provider and have the provider-specific code in their own file. 

// Define the expected structure of a model from the OpenAI API
interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  // Add other potential fields if needed
}

// Define the structure of the expected response from OpenAI API
interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

console.log(`Function "sync-ai-models" up and running!`);

async function syncModels() {
  console.log('Starting AI model sync process...');

  // 1. Get API Key
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    console.error('Missing environment variable: OPENAI_API_KEY');
    throw new Error('Server configuration error: OpenAI API Key not found.');
  }
  console.log('Retrieved OPENAI_API_KEY.');

  // 2. Call OpenAI API
  const openaiUrl = 'https://api.openai.com/v1/models';
  let openAIModels: OpenAIModel[] = [];

  try {
    const response = await fetch(openaiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenAI API error: ${response.status} ${response.statusText}`, errorBody);
      throw new Error(`Failed to fetch models from OpenAI: ${response.statusText}`);
    }

    const responseData: OpenAIModelsResponse = await response.json();
    if (responseData?.object === 'list' && Array.isArray(responseData.data)) {
      openAIModels = responseData.data;
      console.log(`Successfully fetched ${openAIModels.length} models from OpenAI.`);
      // Optional: Log the model IDs fetched
      // console.log('Fetched model IDs:', openAIModels.map(m => m.id).join(', '));
    } else {
      console.error('Invalid response structure from OpenAI API:', responseData);
      throw new Error('Received invalid data structure from OpenAI API.');
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    // Re-throw or handle appropriately for the function's response
    throw error;
  }

  // TODO:
  // 3. Create Supabase Admin Client (Service Role Key)
  // 4. Fetch current providers from DB
  // 5. Compare and sync (insert/update/deactivate)

  return { syncedCount: 0, newCount: 0, deactivatedCount: 0 }; // Placeholder return
}

serve(async (req) => {
  // --- Security Check (Example: Simple Header Check - NOT PRODUCTION READY) ---
  // For production, use Supabase Cron Job triggers or proper RBAC/Auth
  // Also ensure SYNC_SECRET is set in env vars
  const syncSecret = Deno.env.get('SYNC_SECRET');
  const authHeader = req.headers.get('X-Sync-Secret');
  if (!syncSecret || !authHeader || authHeader !== syncSecret) {
      console.warn('Unauthorized sync attempt received.');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
  }

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') { // Typically trigger sync via POST
     return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       status: 405,
     });
  }

  try {
    const result = await syncModels();
    console.log('Sync process completed.', result);
    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Sync function failed:', error);
    return new Response(JSON.stringify({ error: error.message || 'Sync failed due to an internal server error.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});