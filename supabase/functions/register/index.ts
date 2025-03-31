import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  const { email, password } = await req.json();

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  return new Response(JSON.stringify({ user: data.user }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});