import { SupabaseClient } from "npm:@supabase/supabase-js@2.39.3";
import { corsHeaders, UserDetails } from "../types.ts";

/**
 * Get user details
 */
export const getDetails = async (
  supabase: SupabaseClient,
  userId: string
): Promise<Response> => {
  try {
    const { data: details, error } = await supabase
      .from('user_details')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching details:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch details' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify(details),
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
 * Update user details
 */
export const updateDetails = async (
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<UserDetails>
): Promise<Response> => {
  try {
    const { data: details, error } = await supabase
      .from('user_details')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating details:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to update details' }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify(details),
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