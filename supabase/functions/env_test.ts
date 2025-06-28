// supabase/functions/env_test.ts
console.log("Attempting to read SUPABASE_URL:", Deno.env.get("SUPABASE_URL"));
console.log("Attempting to read SUPABASE_ANON_KEY:", Deno.env.get("SUPABASE_ANON_KEY"));
console.log("Attempting to read SUPABASE_SERVICE_ROLE_KEY:", Deno.env.get("SB_SERVICE_ROLE_KEY"));

Deno.test("simple env test", () => {
  const serviceKey = Deno.env.get("SB_SERVICE_ROLE_KEY");
  if (serviceKey) {
    console.log("Inside test - SUPABASE_SERVICE_ROLE_KEY:", serviceKey.substring(0, 20) + "..."); // Log a snippet
  } else {
    console.log("Inside test - SUPABASE_SERVICE_ROLE_KEY is undefined");
  }
  // No actual assertions, just logging
});