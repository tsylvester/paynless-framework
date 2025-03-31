import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors-headers.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/auth/, "");

  try {
    // Route to appropriate handler based on path
    switch (path) {
      case '/login':
        const { default: handleLogin } = await import('./login/index.ts');
        return await handleLogin(req);
      
      case '/register':
        const { default: handleRegister } = await import('./register/index.ts');
        return await handleRegister(req);
      
      case '/logout':
        const { default: handleLogout } = await import('./logout/index.ts');
        return await handleLogout(req);
      
      case '/me':
        const { default: handleMe } = await import('./me/index.ts');
        return await handleMe(req);
      
      case '/refresh':
        const { default: handleRefresh } = await import('./refresh/index.ts');
        return await handleRefresh(req);

      default:
        return new Response(
          JSON.stringify({ error: `Route ${path} not found` }),
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }
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
}); 