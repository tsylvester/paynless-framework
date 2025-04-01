// User API endpoints
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from "../_shared/cors-headers.ts"
import { getProfile, updateProfile } from "./handlers/profile.ts";

// Handle API routes
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get the JWT token from the Authorization header
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle different routes
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle /me routes
    if (path.startsWith("/me")) {
      const subPath = path.slice(3); // Remove /me from the path

      switch (subPath) {
        case "":
          if (req.method === "GET") {
            return await getProfile(supabaseClient, user.id);
          } else if (req.method === "PUT") {
            const body = await req.json();
            return await updateProfile(supabaseClient, user.id, body);
          }
          break;
      }
    }

    // Handle /profile/:userId routes
    if (path.startsWith("/profile/")) {
      const userId = path.split("/")[2];
      if (req.method === "GET") {
        return await getProfile(supabaseClient, userId);
      }
    }

    // Return 404 for unknown routes
    return new Response(
      JSON.stringify({ error: "Not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});