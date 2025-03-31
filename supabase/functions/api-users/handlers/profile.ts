import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsHeaders, UserProfile, UpdateProfileRequest } from "../types.ts";

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
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Transform to client-side profile format
    const profile: UserProfile = {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      avatarUrl: data.avatar_url,
      role: data.role,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    return new Response(JSON.stringify(profile), {
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
    const { firstName, lastName, avatarUrl } = profileData;
    
    const { data, error } = await supabase
      .from("user_profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select()
      .single();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Transform to client-side profile format
    const profile: UserProfile = {
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      avatarUrl: data.avatar_url,
      role: data.role,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    return new Response(JSON.stringify(profile), {
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