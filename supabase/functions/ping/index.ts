// IMPORTANT: Supabase Edge Functions require relative paths for imports from shared modules.
// Do not use path aliases (like @shared/) as they will cause deployment failures.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

console.log("[ping/index.ts] Function loaded.");

async function handler(_req: Request): Promise<Response> {
  console.log("[ping/index.ts] Request received.");
  const data = { message: "pong" };
  return new Response(
    JSON.stringify(data),
    { headers: { "Content-Type": "application/json" }, status: 200 }
  );
}

serve(handler); 