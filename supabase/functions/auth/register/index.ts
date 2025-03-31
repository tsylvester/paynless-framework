import { corsHeaders } from '../../_shared/cors-headers.ts';

export default async function handleRegister(req: Request) {
  try {
    const { email, password, firstName, lastName } = await req.json();
    
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use Supabase REST API to create user
    const signUpResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
          }
        })
      }
    );

    if (!signUpResponse.ok) {
      const error = await signUpResponse.json();
      throw new Error(error.message || 'Failed to create user');
    }

    const { id: userId } = await signUpResponse.json();

    // Create the user profile
    const profileResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/user_profiles`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        },
        body: JSON.stringify({
          id: userId,
          email,
          first_name: firstName,
          last_name: lastName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!profileResponse.ok) {
      // If profile creation fails, delete the user to maintain consistency
      await fetch(
        `${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
          }
        }
      );
      throw new Error('Failed to create user profile');
    }

    // Sign in the user to get a session
    const signInResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        },
        body: JSON.stringify({ email, password })
      }
    );

    if (!signInResponse.ok) {
      throw new Error('Failed to sign in user');
    }

    const { access_token, refresh_token, expires_at } = await signInResponse.json();

    return new Response(
      JSON.stringify({
        user: {
          id: userId,
          email,
          firstName,
          lastName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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