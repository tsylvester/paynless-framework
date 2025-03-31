import { corsHeaders } from '../../_shared/cors-headers.ts';

export default async function handleLogin(req: Request) {
  try {
    const { email, password } = await req.json();
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use regular auth endpoint for login
    const signInResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        },
        body: JSON.stringify({ email, password })
      }
    );

    if (!signInResponse.ok) {
      const error = await signInResponse.json();
      throw new Error(error.message || 'Invalid email or password');
    }

    const { access_token, refresh_token, expires_at, user } = await signInResponse.json();

    // Get the user's profile using the user's access token
    const profileResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/user_profiles?id=eq.${user.id}&select=*`,
      {
        headers: {
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          'Authorization': `Bearer ${access_token}`,
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
          firstName: profile.first_name,
          lastName: profile.last_name,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        session: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: expires_at
        }
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