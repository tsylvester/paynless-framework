import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsHeaders, UserPreferences } from "../types.ts";

/**
 * Get user preferences
 */
export const getPreferences = async (
  supabase: SupabaseClient,
  userId: string
): Promise<Response> => {
  try {
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching preferences:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch preferences' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify(preferences),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};

/**
 * Update user preferences
 */
export const updatePreferences = async (
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<UserPreferences>
): Promise<Response> => {
  try {
    const { data: preferences, error } = await supabase
      .from('user_preferences')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating preferences:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update preferences' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify(preferences),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}; 