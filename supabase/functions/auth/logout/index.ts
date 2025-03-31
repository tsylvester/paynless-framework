import { corsHeaders } from '../../_shared/cors-headers.ts';

export default async function handleLogout(req: Request) {
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

    // Use regular auth endpoint for logout
    const logoutResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/logout`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          'Authorization': authHeader,
        }
      }
    );

    if (!logoutResponse.ok) {
      const error = await logoutResponse.json();
      throw new Error(error.message || 'Failed to logout');
    }

    return new Response(
      JSON.stringify({ message: 'Logged out successfully' }),
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