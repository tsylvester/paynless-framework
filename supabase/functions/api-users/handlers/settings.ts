import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsHeaders, UserSettings } from "../types.ts";

/**
 * Get user settings
 */
export const getSettings = async (
  supabase: SupabaseClient,
  userId: string
): Promise<Response> => {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("metadata")
      .eq("id", userId)
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Default settings if none exist
    const settings = data.metadata?.settings || {
      notifications: {
        email: true,
        push: true,
        marketing: false,
      },
      theme: "light",
      language: "en",
    };
    
    return new Response(JSON.stringify(settings), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

/**
 * Update user settings
 */
export const updateSettings = async (
  supabase: SupabaseClient,
  userId: string,
  newSettings: UserSettings
): Promise<Response> => {
  try {
    // Get current user profile data
    const { data: currentData, error: fetchError } = await supabase
      .from("user_profiles")
      .select("metadata")
      .eq("id", userId)
      .single();
    
    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Prepare metadata object, preserving other metadata fields
    const metadata = {
      ...(currentData.metadata || {}),
      settings: newSettings,
    };
    
    // Update settings
    const { data, error } = await supabase
      .from("user_profiles")
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("metadata")
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify(data.metadata.settings), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};