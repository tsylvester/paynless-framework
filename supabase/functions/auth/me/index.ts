import { corsHeaders } from '../../_shared/cors-headers.ts';

export default async function handleMe(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get the current user using REST API
    const userResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/auth/v1/user`,
      {
        headers: {
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          'Authorization': authHeader,
        }
      }
    );

    if (!userResponse.ok) {
      const error = await userResponse.json();
      throw new Error(error.message || 'Failed to get user');
    }

    const user = await userResponse.json();

    // Get the user's profile using the user's access token
    const profileResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/user_profiles?id=eq.${user.id}&select=*`,
      {
        headers: {
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          'Authorization': authHeader,
        }
      }
    );

    if (!profileResponse.ok) {
      throw new Error('Failed to fetch user profile');
    }

    const [profile] = await profileResponse.json();

    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        profile: profile || null,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
} 