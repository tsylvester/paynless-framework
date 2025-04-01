import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsHeaders, UpdateProfileRequest } from "../types.ts";

/**
 * Get user profile
 */
export const getProfile = async (
  supabase: SupabaseClient,
  userId: string
): Promise<Response> => {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!data) {
      // Create a default profile if it doesn't exist
      const { data: newProfile, error: createError } = await supabase
        .from("user_profiles")
        .insert([
          {
            id: userId,
            firstName: null,
            lastName: null,
            role: "user",
          }
        ])
        .select()
        .single();

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(newProfile), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify(data), {
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
 * Update user profile
 */
export const updateProfile = async (
  supabase: SupabaseClient,
  userId: string,
  profileData: UpdateProfileRequest
): Promise<Response> => {
  try {
    // First check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (checkError) {
      return new Response(JSON.stringify({ error: checkError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result;
    if (!existingProfile) {
      // Create new profile
      result = await supabase
        .from("user_profiles")
        .insert([
          {
            id: userId,
            ...profileData,
            role: "user",
            updatedAt: new Date().toISOString(),
          }
        ])
        .select()
        .single();
    } else {
      // Update existing profile
      result = await supabase
        .from("user_profiles")
        .update({
          ...profileData,
          updatedAt: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();
    }
    
    if (result.error) {
      return new Response(JSON.stringify({ error: result.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify(result.data), {
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