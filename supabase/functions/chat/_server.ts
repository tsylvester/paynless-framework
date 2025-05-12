// supabase/functions/chat/_server.ts
// This file contains the Deno-specific HTTP server setup.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts' 
// Import the main HTTP handler logic and default dependencies
import { mainHandler, defaultDeps } from './index.ts'

console.log('Initializing chat function server...');

// Start the server, passing requests to the main handler
serve((req) => mainHandler(req, defaultDeps));

console.log(`Function "chat" server is up and running!`); 