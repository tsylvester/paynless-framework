import { corsHeaders } from '../_shared/cors-headers.ts';
import { createSupabaseClient } from '../_shared/supabase-client.ts';
import { verifyApiKey } from '../_shared/auth.ts';

export default async function handleProfile(req: Request) {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  // Verify API key
  const isValid = verifyApiKey(req);
  if (!isValid) {
    return new Response(
      JSON.stringify({ error: 'Invalid or missing API key' }),
      { 
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const supabase = createSupabaseClient(req);
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Handle different HTTP methods
    switch (req.method) {
      case 'GET': {
        // Get the user's profile
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
          return new Response(
            JSON.stringify({ error: 'Failed to fetch profile' }),
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(
          JSON.stringify(profile || null),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      case 'PUT': {
        const profileData = await req.json();
        
        // Update or create the profile
        const { data: profile, error: updateError } = await supabase
          .from('user_profiles')
          .upsert({
            id: user.id,
            first_name: profileData.firstName,
            last_name: profileData.lastName,
            avatar_url: profileData.avatarUrl,
            role: profileData.role || 'user',
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (updateError) {
          console.error('Error updating profile:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to update profile' }),
            { 
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(
          JSON.stringify(profile),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { 
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }
  } catch (error) {
    console.error('Error in profile handler:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
} 