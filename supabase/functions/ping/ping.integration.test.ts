import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { startSupabase, stopSupabase } from "../_shared/supabase.mock.ts";

const PING_URL = "http://localhost:54321/functions/v1/ping";

Deno.test("/ping Integration Test", async () => {
    await startSupabase();

    console.log(`[Test] Calling: ${PING_URL}`);
    const response = await fetch(PING_URL, {
        method: "GET", // Or POST, shouldn't matter for this simple function
        // NO apikey or Authorization headers
    });
    console.log(`[Test] Response Status: ${response.status}`);

    assertEquals(response.status, 200, `Expected 200 OK, got ${response.status}`);
    const body = await response.json();
    assertExists(body, "Response body should exist");
    assertEquals(body.message, "pong", "Response message should be pong");

    await stopSupabase();
}); 