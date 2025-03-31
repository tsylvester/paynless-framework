import { corsHeaders } from '../../_shared/cors-headers.ts';

export default async function handleRefresh(req: Request) {
  try {
    // Get the refresh token from the request
    const { refreshToken } = await req.json();
    
    if (!refreshToken) {
      return new Response(
        JSON.stringify({ error: 'Refresh token is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use REST API for token refresh
    const refreshResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      }
    );

    if (!refreshResponse.ok) {
      const error = await refreshResponse.json();
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { access_token, refresh_token } = await refreshResponse.json();

    return new Response(
      JSON.stringify({
        access_token,
        refresh_token,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'An unknown error occurred' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
} 