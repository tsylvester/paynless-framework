import {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "https://deno.land/std@0.208.0/testing/bdd.ts";
import {
  assertEquals,
  assertExists,
  assertNotEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parse } from "https://deno.land/std@0.208.0/dotenv/mod.ts";

// --- Test Configuration ---
let loadedEnvConfig: Record<string, string> = {};

// Load environment variables from project root .env file by parsing manually
const envPath = new URL('../../.env', import.meta.url).pathname;
const correctedEnvPath = Deno.build.os === 'windows' ? envPath.slice(1) : envPath;
try {
    console.log(`Attempting to read .env file from: ${correctedEnvPath}`);
    const envContent = Deno.readTextFileSync(correctedEnvPath);
    loadedEnvConfig = parse(envContent); // Parse the content directly
    console.log(".env file parsed into object.");
} catch (readOrParseError) {
    if (readOrParseError instanceof Deno.errors.NotFound) {
        console.warn("Warning: .env file not found. Relying on existing Deno.env variables.");
    } else {
        // Log other errors (e.g., permission denied, parse errors)
        console.warn("Warning: Error encountered during .env reading/parsing:", readOrParseError);
    }
}

// Get config - prioritize parsed .env, then Deno.env, then default
// FORCE localhost for integration tests, ignore .env URLs
const supabaseUrl = "http://localhost:54321"; 
// Prioritize VITE key from parsed .env, then fallback
const supabaseAnonKey = loadedEnvConfig.VITE_SUPABASE_ANON_KEY || loadedEnvConfig.SUPABASE_ANON_KEY || Deno.env.get("VITE_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY"); 
const functionBaseUrl = `${supabaseUrl}/functions/v1`;

if (!supabaseAnonKey) {
    console.error("CRITICAL ERROR: VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY not found in parsed .env or Deno.env.");
}

const testUserEmail = "test-integration@example.com";
const testUserPassword = "password";
let authToken: string | null = null;

// --- Helper Functions ---

// Updated makeRequest to handle missing anon key slightly better
async function makeRequest(path: string, method: string, token: string | null, body?: any): Promise<Response> {
  if (!supabaseAnonKey) {
      throw new Error("Supabase Anon Key not configured for tests.");
  }
  const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey 
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const options: RequestInit = { method, headers };
  if (body) { options.body = JSON.stringify(body); }

  const url = `${functionBaseUrl}${path}`;
  console.log(`Making request: ${method} ${url}`);
  return await fetch(url, options);
}

// New helper to login and get token
async function loginAndGetToken(email: string, password: string): Promise<string | null> {
    console.log(`Attempting login for ${email}...`);
    try {
        const res = await makeRequest('/login', 'POST', null, { email, password });
        if (res.status !== 200) {
            console.error(`Login failed with status ${res.status}:`, await res.text());
            return null;
        }
        const json = await res.json();
        if (!json.access_token) {
            console.error("Login response missing access_token:", json);
            return null;
        }
        console.log("Login successful, token obtained.");
        return json.access_token;
    } catch (error) {
        console.error("Error during login request:", error);
        return null;
    }
}

// --- Test Suite ---

describe("/me Endpoint Integration Tests", () => {

  beforeAll(async () => {
    console.log("Integration test setup: Logging in test user...");
    // TODO: Add registration step here if user doesn't exist
    // For now, assumes user test-integration@example.com exists with password 'password'
    authToken = await loginAndGetToken(testUserEmail, testUserPassword);
    
    if (!authToken) {
        console.error("CRITICAL: Auth token not obtained in beforeAll. Authenticated tests cannot run.");
        // Optionally throw an error to halt tests if auth is critical
        // throw new Error("Failed to obtain auth token for integration tests.");
    }
  });
  
  // Optional: Add afterAll for cleanup if needed
  afterAll(async() => {
      // TODO: Add user deletion logic if users are created per-run
      console.log("Integration tests finished.");
  });

  it("GET /me should return 401 if not authenticated", async () => {
      const res = await makeRequest('/me', 'GET', null); // No token
      assertEquals(res.status, 401);
      const json = await res.json();
      assertEquals(json.error, "Not authenticated"); // Match error from me/index.ts
  });

  it("GET /me should return 200 and profile data if authenticated", async () => {
      if (!authToken) {
          console.warn("Skipping authenticated GET /me test - no auth token from beforeAll.");
          // Use assertExists to make the test fail clearly if token is missing
          assertExists(authToken, "Auth token was not obtained in beforeAll hook."); 
          return; 
      }
      const res = await makeRequest('/me', 'GET', authToken);
      assertEquals(res.status, 200);
      const json = await res.json();
      assertExists(json.id, "Profile data should include an ID");
      // assertEquals(json.id, "user-123"); // THIS WILL FAIL!
      // Basic check: Ensure ID is a non-empty string (likely a UUID)
      assertNotEquals(json.id, "", "User ID should not be empty");
      assertEquals(typeof json.id, "string", "User ID should be a string");
      // TODO: Could add more robust checks (e.g., UUID format) or fetch expected ID
  });

  // TODO: Add tests for PUT /me

}); 