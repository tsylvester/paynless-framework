[me/index.ts] API key verified.
[me/index.ts] Creating Supabase client...
[me/index.ts] Supabase client created.
[me/index.ts] Calling supabase.auth.getUser()...
[me/index.ts] supabase.auth.getUser() result: user=true, error=undefined
[me/index.ts] User authenticated: user-me-123
[me/index.ts] Handling PUT for user user-me-123
----- post-test output end -----
  PUT: successful profile update should return updated profile ... ok (0ms)
  PUT: invalid JSON body should return 400 ...
------- post-test output -------
[me/index.ts] Handling request: PUT http://example.com/me
[me/index.ts] Verifying API key...
[me/index.ts] API key verified.
[me/index.ts] Creating Supabase client...
[me/index.ts] Supabase client created.
[me/index.ts] Calling supabase.auth.getUser()...
[me/index.ts] supabase.auth.getUser() result: user=true, error=undefined
[me/index.ts] User authenticated: user-me-123
[me/index.ts] Handling PUT for user user-me-123
Failed to parse PUT body: SyntaxError: Unterminated string in JSON at position 14 (line 1 column 15)
    at parse (<anonymous>)
    at packageData (ext:deno_fetch/22_body.js:421:14)
    at consumeBody (ext:deno_fetch/22_body.js:274:12)
    at async handleMeRequest (file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.ts:123:23)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.test.ts:193:25
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.test.ts:186:9
----- post-test output end -----
  PUT: invalid JSON body should return 400 ... ok (0ms)
  PUT: profile update DB error should return 500 ...
------- post-test output -------
[me/index.ts] Handling request: PUT http://example.com/me
[me/index.ts] Verifying API key...
[me/index.ts] API key verified.
[me/index.ts] Creating Supabase client...
[me/index.ts] Supabase client created.
[me/index.ts] Calling supabase.auth.getUser()...
[me/index.ts] supabase.auth.getUser() result: user=true, error=undefined
[me/index.ts] User authenticated: user-me-123
[me/index.ts] Handling PUT for user user-me-123
Error updating profile: { message: "DB conflict" }
----- post-test output end -----
  PUT: profile update DB error should return 500 ... ok (1ms)
  PUT: profile update exception should return 500 ...
------- post-test output -------
[me/index.ts] Handling request: PUT http://example.com/me
[me/index.ts] Verifying API key...
[me/index.ts] API key verified.
[me/index.ts] Creating Supabase client...
[me/index.ts] Supabase client created.
[me/index.ts] Calling supabase.auth.getUser()...
[me/index.ts] supabase.auth.getUser() result: user=true, error=undefined
[me/index.ts] User authenticated: user-me-123
[me/index.ts] Handling PUT for user user-me-123
Exception during profile update: Error: Unexpected DB exception
    at Object.<anonymous> (file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.test.ts:226:63)
    at Object.spy [as single] (https://jsr.io/@std/testing/0.225.1/mock.ts:396:32)
    at handleMeRequest (file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.ts:138:16)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.test.ts:236:25
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/me/index.test.ts:225:9
    at async innerWrapped (ext:cli/40_test.js:180:5)
----- post-test output end -----
  PUT: profile update exception should return 500 ... ok (1ms)
  POST request should return 405 Method Not Allowed ...
------- post-test output -------
[me/index.ts] Handling request: POST http://example.com/me
[me/index.ts] Verifying API key...
[me/index.ts] API key verified.
[me/index.ts] Creating Supabase client...
[me/index.ts] Supabase client created.
[me/index.ts] Calling supabase.auth.getUser()...
[me/index.ts] supabase.auth.getUser() result: user=true, error=undefined
[me/index.ts] User authenticated: user-me-123
[me/index.ts] Method POST not allowed.
----- post-test output end -----
  POST request should return 405 Method Not Allowed ... ok (0ms)
Me Function (/me) Tests ... ok (11ms)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/me/me.integration.test.ts
/me Integration Tests ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
----- post-test output end -----
  Setup: Create test user ...
------- post-test output -------
Creating user: test-me-1743961260827@example.com
User test-me-1743961260827@example.com created successfully.
----- post-test output end -----
  Setup: Create test user ... ok (68ms)
  Setup: Login user to get access token ... ok (189ms)
  Success: Call /me with valid token ... ok (102ms)
  Failure: Call /me without token ... ok (3ms)
  Failure: Call /me with invalid token ... ok (3ms)
  Cleanup: Delete test user and profile ...
------- post-test output -------
Attempting to clean up user: test-me-1743961260827@example.com
Found user ID 723b4deb-6e45-46e2-ba24-d0a7a4f4dac0 for test-me-1743961260827@example.com. Proceeding with deletion.
User test-me-1743961260827@example.com (ID: 723b4deb-6e45-46e2-ba24-d0a7a4f4dac0) deleted successfully.
----- post-test output end -----
  Cleanup: Delete test user and profile ... ok (17ms)
------- post-test output -------
Executing: supabase stop...
Supabase stop finished successfully.
----- post-test output end -----
/me Integration Tests ... ok (38s)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/ping/ping.integration.test.ts
/ping Integration Test ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
[Test] Calling: http://localhost:54321/functions/v1/ping
[Test] Response Status: 401
----- post-test output end -----
/ping Integration Test ... FAILED (26s)
running 1 test from ./supabase/functions/profile/index.test.ts
Profile Handler (GET /profile/:userId) ...
  should handle CORS preflight requests ... ok (1ms)
  should return 401 for invalid API key ... ok (1ms)
  should return 401 if user is not authenticated ...
------- post-test output -------
Profile Auth error or no user: AuthError: Invalid JWT
    at Object.<anonymous> (file:///C:/Users/Tim/paynless-framework/supabase/functions/profile/index.test.ts:149:23)
    at TestSuiteInternal.runTest (https://deno.land/std@0.208.0/testing/_test_suite.ts:358:16)
    at TestSuiteInternal.runTest (https://deno.land/std@0.208.0/testing/_test_suite.ts:346:33)
    at fn (https://deno.land/std@0.208.0/testing/_test_suite.ts:316:37)
    at innerWrapped (ext:cli/40_test.js:180:11)
    at exitSanitizer (ext:cli/40_test.js:96:33)
    at Object.outerWrapped [as fn] (ext:cli/40_test.js:123:20)
    at TestContext.step (ext:cli/40_test.js:481:37)
    at TestSuiteInternal.run (https://deno.land/std@0.208.0/testing/_test_suite.ts:323:15)
    at async fn (https://deno.land/std@0.208.0/testing/_test_suite.ts:140:15) {
  __isAuthError: true,
  name: "AuthError",
  status: undefined,
  code: undefined
}
----- post-test output end -----
  should return 401 if user is not authenticated ... ok (2ms)
  should return 404 for invalid path (e.g., /profile/) ...
------- post-test output -------
[profile] Invalid path accessed: /profile/
----- post-test output end -----
  should return 404 for invalid path (e.g., /profile/) ... ok (0ms)
  should return 404 for invalid path (e.g., /profile) ...
------- post-test output -------
[profile] Invalid path accessed: /profile
----- post-test output end -----
  should return 404 for invalid path (e.g., /profile) ... ok (0ms)
  should return 405 for disallowed methods (e.g., PUT, POST) ...
------- post-test output -------
[profile] Requesting user user-requester-123 fetching profile for user user-target-456
[profile] Requesting user user-requester-123 fetching profile for user user-target-456
----- post-test output end -----
  should return 405 for disallowed methods (e.g., PUT, POST) ... ok (1ms)
  should successfully fetch profile with GET /profile/:userId ...
------- post-test output -------
[profile] Requesting user user-requester-123 fetching profile for user user-target-456
----- post-test output end -----
  should successfully fetch profile with GET /profile/:userId ... ok (0ms)
  should return 404 if profile for targetUserId is not found ...
------- post-test output -------
[profile] Requesting user user-requester-123 fetching profile for user non-existent-user
----- post-test output end -----
  should return 404 if profile for targetUserId is not found ... ok (0ms)
  should return 500 if Supabase fetch fails ...
------- post-test output -------
[profile] Requesting user user-requester-123 fetching profile for user user-target-456
[profile] Error fetching profile for user-target-456: {
  message: "DB connection error",
  code: "50000",
  details: "",
  hint: ""
}
----- post-test output end -----
  should return 500 if Supabase fetch fails ... ok (0ms)
Profile Handler (GET /profile/:userId) ... ok (9ms)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/profile/profile.integration.test.ts
/profile/<userId> Integration Tests ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
----- post-test output end -----
  Setup: Create users and login User A ...
------- post-test output -------
Creating user: test-profA-1743961302999@example.com
User test-profA-1743961302999@example.com created successfully.
Creating user: test-profB-1743961302999@example.com
User test-profB-1743961302999@example.com created successfully.
----- post-test output end -----
  Setup: Create users and login User A ... ok (304ms)
  Success: User A gets User B profile ... ok (95ms)
  Failure: User A gets non-existent profile ... ok (91ms)
  Failure: Request without JWT ... ok (3ms)
  Failure: Request with invalid JWT ... ok (3ms)
  Failure: Request without API Key ... ok (77ms)
  Failure: Method Not Allowed (POST) ... ok (85ms)
  Cleanup: Delete test users ...
------- post-test output -------
Attempting to clean up user: test-profA-1743961302999@example.com
User test-profA-1743961302999@example.com not found for cleanup.
Attempting to clean up user: test-profB-1743961302999@example.com
User test-profB-1743961302999@example.com not found for cleanup.
----- post-test output end -----
  Cleanup: Delete test users ... ok (15ms)
------- post-test output -------
Executing: supabase stop...
Supabase stop finished successfully.
----- post-test output end -----
/profile/<userId> Integration Tests ... ok (16s)
running 1 test from ./supabase/functions/refresh/index.test.ts
Refresh Function Tests ...
  OPTIONS request should handle CORS preflight ... ok (1ms)
  Request without API key should return 401 ... ok (1ms)
  Request without Authorization header should return 400 ... ok (0ms)
  Successful refresh, profile found ...
------- post-test output -------
[Mock refreshSession] Called. Returning mock data.
----- post-test output end -----
  Successful refresh, profile found ... ok (1ms)
  Successful refresh, profile fetch error ...
------- post-test output -------
Profile fetch error after refresh (non-critical): { message: "DB error" }
----- post-test output end -----
  Successful refresh, profile fetch error ... ok (1ms)
  Failed refresh should return 401 ...
------- post-test output -------
Refresh error: Error: Invalid refresh token
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/refresh/index.test.ts:194:35
    at innerWrapped (ext:cli/40_test.js:180:11)
    at exitSanitizer (ext:cli/40_test.js:96:33)
    at Object.outerWrapped [as fn] (ext:cli/40_test.js:123:20)
    at TestContext.step (ext:cli/40_test.js:481:37)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/refresh/index.test.ts:193:17
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async outerWrapped (ext:cli/40_test.js:123:14) {
  status: 401
}
----- post-test output end -----
  Failed refresh should return 401 ... ok (1ms)
  Successful refresh but missing user data should return 500 ...
------- post-test output -------
No session or user data returned after successful refresh
----- post-test output end -----
  Successful refresh but missing user data should return 500 ... ok (1ms)
  Successful refresh but missing session data should return 500 ...
------- post-test output -------
No session or user data returned after successful refresh
----- post-test output end -----
  Successful refresh but missing session data should return 500 ... ok (0ms)
Refresh Function Tests ... ok (8ms)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/refresh/refresh.integration.test.ts
/refresh Integration Tests ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
----- post-test output end -----
  Setup: Create and login user ...
------- post-test output -------
Creating user: test-refresh-1743961342866@example.com
User test-refresh-1743961342866@example.com created successfully.
----- post-test output end -----
  Setup: Create and login user ... ok (278ms)
  Success: Call /refresh with valid refresh token ... ok (110ms)
  Failure: Missing API Key ... ok (83ms)
  Failure: Missing Refresh Token (Authorization header) ... ok (86ms)
  Failure: Invalid Refresh Token ... ok (95ms)
  Cleanup: Delete test user ...
------- post-test output -------
Attempting to clean up user: test-refresh-1743961342866@example.com
Found user ID a71186f4-b5ca-4ba9-b77b-bca5eef754ab for test-refresh-1743961342866@example.com. Proceeding with deletion.
User test-refresh-1743961342866@example.com (ID: a71186f4-b5ca-4ba9-b77b-bca5eef754ab) deleted successfully.
----- post-test output end -----
  Cleanup: Delete test user ... ok (18ms)
------- post-test output -------
Executing: supabase stop...
Supabase stop finished successfully.
----- post-test output end -----
/refresh Integration Tests ... ok (39s)
------- post-test output -------
Listening on http://localhost:8000/
----- post-test output end -----
running 1 test from ./supabase/functions/register/index.test.ts
Register Function Tests ...
  OPTIONS request should handle CORS preflight ...
------- post-test output -------
[register/index.ts] Handling request: OPTIONS http://example.com/register
----- post-test output end -----
  OPTIONS request should handle CORS preflight ... ok (1ms)
  GET request should return 405 Method Not Allowed ...
------- post-test output -------
[register/index.ts] Handling request: GET http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Method GET not allowed.
----- post-test output end -----
  GET request should return 405 Method Not Allowed ... ok (1ms)
  POST request without API key should return 401 Unauthorized ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verification failed.
----- post-test output end -----
  POST request without API key should return 401 Unauthorized ... ok (1ms)
  POST request with valid API key but missing email should return 400 ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Parsing JSON body...
[register/index.ts] JSON body parsed.
[register/index.ts] Email or password missing.
----- post-test output end -----
  POST request with valid API key but missing email should return 400 ... ok (0ms)
  POST request with valid API key but missing password should return 400 ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Parsing JSON body...
[register/index.ts] JSON body parsed.
[register/index.ts] Email or password missing.
----- post-test output end -----
  POST request with valid API key but missing password should return 400 ... ok (0ms)
  POST with Supabase signUp error should return error response ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Parsing JSON body...
[register/index.ts] JSON body parsed.
[register/index.ts] Creating Supabase client...
[register/index.ts] Env Vars for client: URL=true, Key=true
[register/index.ts] Supabase client created.
[register/index.ts] Attempting signUp for: test@example.com
[register/index.ts] signUp result: user=false, session=false, error=User already registered
[register/index.ts] signUp Error: AuthApiError: User already registered
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/register/index.test.ts:129:31
    at innerWrapped (ext:cli/40_test.js:180:11)
    at exitSanitizer (ext:cli/40_test.js:96:33)
    at Object.outerWrapped [as fn] (ext:cli/40_test.js:123:20)
    at TestContext.step (ext:cli/40_test.js:481:37)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/register/index.test.ts:127:17
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async outerWrapped (ext:cli/40_test.js:123:14) {
  name: "AuthApiError",
  status: 400,
  __isAuthError: true,
  code: "supabase_auth_error"
}
----- post-test output end -----
  POST with Supabase signUp error should return error response ... ok (2ms)
  POST with signUp success but missing user data should return 500 ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Parsing JSON body...
[register/index.ts] JSON body parsed.
[register/index.ts] Creating Supabase client...
[register/index.ts] Env Vars for client: URL=true, Key=true
[register/index.ts] Supabase client created.
[register/index.ts] Attempting signUp for: test@example.com
[register/index.ts] signUp result: user=false, session=true, error=undefined
[register/index.ts] signUp succeeded but user/session data missing {
  user: null,
  session: {
    access_token: "abc",
    refresh_token: "def",
    expires_in: 3600,
    expires_at: 1743964955.979,
    token_type: "bearer",
    user: {
      id: "session-user",
      email: "session@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "test",
      created_at: "2025-04-06T17:42:35.979Z"
    }
  }
}
----- post-test output end -----
  POST with signUp success but missing user data should return 500 ... ok (1ms)
  POST with signUp success but missing session data should return 500 ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Parsing JSON body...
[register/index.ts] JSON body parsed.
[register/index.ts] Creating Supabase client...
[register/index.ts] Env Vars for client: URL=true, Key=true
[register/index.ts] Supabase client created.
[register/index.ts] Attempting signUp for: test@example.com
[register/index.ts] signUp result: user=true, session=false, error=undefined
[register/index.ts] signUp succeeded but user/session data missing {
  user: {
    id: "123",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: {},
    aud: "test",
    created_at: "2025-04-06T17:42:35.980Z"
  },
  session: null
}
----- post-test output end -----
  POST with signUp success but missing session data should return 500 ... ok (1ms)
  POST with successful registration should return 200 with user/session ...
------- post-test output -------
[register/index.ts] Handling request: POST http://example.com/register
[register/index.ts] Verifying API key...
[register/index.ts] Received API Key Header: null
[register/index.ts] Expected API Key from Env: test-anon-key
[register/index.ts] API key verified.
[register/index.ts] Parsing JSON body...
[register/index.ts] JSON body parsed.
[register/index.ts] Creating Supabase client...
[register/index.ts] Env Vars for client: URL=true, Key=true
[register/index.ts] Supabase client created.
[register/index.ts] Attempting signUp for: test@example.com
[register/index.ts] signUp result: user=true, session=true, error=undefined
[register/index.ts] signUp Success for: test@example.com
----- post-test output end -----
  POST with successful registration should return 200 with user/session ... ok (0ms)
Register Function Tests ... ok (9ms)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/register/register.integration.test.ts
/register Integration Tests ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
----- post-test output end -----
  Success: Register new user with valid credentials ... ok (228ms)
  Failure: Register user with existing email ... ok (91ms)
  Failure: Register with short password ...
------- post-test output -------
Attempting to clean up user: shortpass-1743961382729@example.com
User shortpass-1743961382729@example.com not found for cleanup.
----- post-test output end -----
  Failure: Register with short password ... ok (102ms)
  Failure: Missing Password ... ok (77ms)
  Failure: Missing Email ... ok (81ms)
  Failure: Missing API Key ... ok (82ms)
  Failure: Invalid API Key ... ok (81ms)
  Failure: Method Not Allowed (GET) ... ok (79ms)
  Cleanup: Delete successfully registered user ...
------- post-test output -------
Attempting to clean up user: test-register-1743961382410@example.com
Found user ID 4e085ad9-ac53-44e9-ba60-d18fbc432a39 for test-register-1743961382410@example.com. Proceeding with deletion.
User test-register-1743961382410@example.com (ID: 4e085ad9-ac53-44e9-ba60-d18fbc432a39) deleted successfully.
----- post-test output end -----
  Cleanup: Delete successfully registered user ... ok (14ms)
------- post-test output -------
Executing: supabase stop...
Supabase stop finished successfully.
----- post-test output end -----
/register Integration Tests ... ok (39s)
running 1 test from ./supabase/functions/reset-password/index.test.ts
Reset Password Handler ...
  should handle CORS preflight requests ... ok (1ms)
  should return 401 for invalid API key on POST ... ok (1ms)
  should return 405 for non-POST requests (after CORS/API key) ... ok (0ms)
  should return 400 if email is missing in body ... ok (0ms)
  should return 400 if email is not a string ... ok (1ms)
  should return 400 if body is invalid JSON ... ok (0ms)
  should return 500 if Supabase env vars are missing ...
------- post-test output -------
Reset password error: Missing Supabase URL or Anon Key
----- post-test output end -----
  should return 500 if Supabase env vars are missing ... ok (1ms)
  should return 500 if Supabase client initialization fails ...
------- post-test output -------
Reset password error: Failed to initialize Supabase client: Error: Failed to init
    at Object.<anonymous> (file:///C:/Users/Tim/paynless-framework/supabase/functions/reset-password/index.test.ts:191:25)
    at TestSuiteInternal.runTest (https://deno.land/std@0.208.0/testing/_test_suite.ts:358:16)
    at TestSuiteInternal.runTest (https://deno.land/std@0.208.0/testing/_test_suite.ts:346:33)
    at fn (https://deno.land/std@0.208.0/testing/_test_suite.ts:316:37)
    at innerWrapped (ext:cli/40_test.js:180:11)
    at exitSanitizer (ext:cli/40_test.js:96:33)
    at Object.outerWrapped [as fn] (ext:cli/40_test.js:123:20)
    at TestContext.step (ext:cli/40_test.js:481:37)
    at TestSuiteInternal.run (https://deno.land/std@0.208.0/testing/_test_suite.ts:323:15)
    at async fn (https://deno.land/std@0.208.0/testing/_test_suite.ts:140:15)
----- post-test output end -----
  should return 500 if Supabase client initialization fails ... ok (1ms)
  should return 500 if Supabase resetPasswordForEmail fails ...
------- post-test output -------
Attempting password reset for: test@example.com
Reset password error for test@example.com: Reset failed
----- post-test output end -----
  should return 500 if Supabase resetPasswordForEmail fails ... ok (1ms)
  should return 200 and call resetPasswordForEmail on success (with origin) ...
------- post-test output -------
Attempting password reset for: success@example.com
Password reset email sent successfully for: success@example.com
----- post-test output end -----
  should return 200 and call resetPasswordForEmail on success (with origin) ... ok (0ms)
  should return 200 and call resetPasswordForEmail on success (without origin) ...
------- post-test output -------
Reset password warning: Missing origin header, redirect might not work as expected.
Attempting password reset for: noorigin@example.com
Password reset email sent successfully for: noorigin@example.com
----- post-test output end -----
  should return 200 and call resetPasswordForEmail on success (without origin) ... ok (0ms)
Reset Password Handler ... ok (8ms)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/reset-password/reset-password.integration.test.ts
/reset-password Integration Tests ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
----- post-test output end -----
  Setup: Create existing user ...
------- post-test output -------
Creating user: test-reset-1743961423255@example.com
User test-reset-1743961423255@example.com created successfully.
----- post-test output end -----
  Setup: Create existing user ... ok (69ms)
  Success: Request reset for existing user ... ok (150ms)
  Success: Request reset for non-existent user ... ok (96ms)
  Failure: Missing Email ... ok (83ms)
  Failure: Invalid Email Format ... ok (85ms)
  Failure: Missing API Key ... ok (84ms)
  Failure: Invalid API Key ... ok (82ms)
  Failure: Method Not Allowed (GET) ... ok (85ms)
  Cleanup: Delete test user ...
------- post-test output -------
Attempting to clean up user: test-reset-1743961423255@example.com
Found user ID 60997d8a-6fdd-4e3a-a215-a5c47dc17a29 for test-reset-1743961423255@example.com. Proceeding with deletion.
User test-reset-1743961423255@example.com (ID: 60997d8a-6fdd-4e3a-a215-a5c47dc17a29) deleted successfully.
----- post-test output end -----
  Cleanup: Delete test user ... ok (17ms)
------- post-test output -------
Executing: supabase stop...
Supabase stop finished successfully.
----- post-test output end -----
/reset-password Integration Tests ... ok (39s)
running 1 test from ./supabase/functions/session/index.test.ts
Session Function Tests ...
  OPTIONS request should handle CORS preflight ... ok (1ms)
  POST missing access_token should return 400 ... ok (1ms)
  POST missing refresh_token should return 400 ... ok (0ms)
  POST invalid JSON body should return 400 ...
------- post-test output -------
Error in session handler: SyntaxError: Unterminated string in JSON at position 14 (line 1 column 15)
    at parse (<anonymous>)
    at packageData (ext:deno_fetch/22_body.js:421:14)
    at consumeBody (ext:deno_fetch/22_body.js:274:12)
    at async handleSessionRequest (file:///C:/Users/Tim/paynless-framework/supabase/functions/session/index.ts:52:45)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/session/index.test.ts:109:25
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/session/index.test.ts:103:9
----- post-test output end -----
  POST invalid JSON body should return 400 ... ok (2ms)
  POST valid access token, profile found ...
------- post-test output -------
Access token valid, fetching profile...
----- post-test output end -----
  POST valid access token, profile found ... ok (1ms)
  POST valid access token, profile fetch error (non-critical) ...
------- post-test output -------
Access token valid, fetching profile...
Profile fetch error (valid token, non-critical): { message: "DB error" }
----- post-test output end -----
  POST valid access token, profile fetch error (non-critical) ... ok (1ms)
  POST invalid token -> refresh success -> profile found ...
------- post-test output -------
Access token invalid or expired, attempting refresh...
Refresh successful, fetching profile...
----- post-test output end -----
  POST invalid token -> refresh success -> profile found ... ok (1ms)
  POST invalid token -> refresh success -> profile fetch error ...
------- post-test output -------
Access token invalid or expired, attempting refresh...
Refresh successful, fetching profile...
Profile fetch error (after refresh, non-critical): { message: "DB error" }
----- post-test output end -----
  POST invalid token -> refresh success -> profile fetch error ... ok (1ms)
  POST invalid token -> refresh fails ...
------- post-test output -------
Access token invalid or expired, attempting refresh...
Refresh error: Error: Invalid refresh token
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/session/index.test.ts:238:35
    at innerWrapped (ext:cli/40_test.js:180:11)
    at exitSanitizer (ext:cli/40_test.js:96:33)
    at Object.outerWrapped [as fn] (ext:cli/40_test.js:123:20)
    at TestContext.step (ext:cli/40_test.js:481:37)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/session/index.test.ts:237:17
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async outerWrapped (ext:cli/40_test.js:123:14) {
  status: 401
}
----- post-test output end -----
  POST invalid token -> refresh fails ... ok (0ms)
Session Function Tests ... ok (12ms)
------- post-test output -------
Attempting to manually load .env file from relative path: supabase/.env.local
Manually processed .env file: supabase/.env.local
Essential Supabase variables confirmed loaded.
----- post-test output end -----
running 1 test from ./supabase/functions/session/session.integration.test.ts
/session Integration Tests ...
------- post-test output -------
Executing: supabase start...
Supabase start finished successfully.
----- post-test output end -----
  Setup: Create and login user ...
------- post-test output -------
Creating user: test-session-1743961473478@example.com
User test-session-1743961473478@example.com created successfully.
----- post-test output end -----
  Setup: Create and login user ... ok (317ms)
  Success: Call /session with valid tokens ... ok (98ms)
  Success: Call /session with refresh token (simulating expired access token) ... ok (115ms)
  Failure: Missing access_token ... ok (81ms)
  Failure: Missing refresh_token ... ok (85ms)
  Failure: Invalid refresh_token ... ok (88ms)
  Cleanup: Delete test user ...
------- post-test output -------
Attempting to clean up user: test-session-1743961473478@example.com
Found user ID 9673620a-002b-4dea-bb11-d38d1fc65474 for test-session-1743961473478@example.com. Proceeding with deletion.
User test-session-1743961473478@example.com (ID: 9673620a-002b-4dea-bb11-d38d1fc65474) deleted successfully.
----- post-test output end -----
  Cleanup: Delete test user ... ok (46ms)
------- post-test output -------
Executing: supabase stop...
Supabase stop finished successfully.
----- post-test output end -----
/session Integration Tests ... ok (58s)
running 1 test from ./supabase/functions/sync-stripe-plans/index.test.ts
Sync Stripe Plans Function Tests ...
  OPTIONS request should return OK with CORS headers ... ok (1ms)
  Mode determination: uses request body when present (true) ...
------- post-test output -------
Mode determined from request body.
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
----- post-test output end -----
  Mode determination: uses request body when present (true) ... ok (4ms)
  Mode determination: uses request body when present (false) ...
------- post-test output -------
Mode determined from request body.
Stripe client initialized in LIVE mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
----- post-test output end -----
  Mode determination: uses request body when present (false) ... ok (0ms)
  Mode determination: uses env var (false) when body missing/invalid ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: false, IsTest: false).
Stripe client initialized in LIVE mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
Could not parse request body for mode setting: Expected property name or '}' in JSON at position 1 (line 1 column 2)
Mode determined from STRIPE_TEST_MODE env var (Value: false, IsTest: false).
Stripe client initialized in LIVE mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
----- post-test output end -----
  Mode determination: uses env var (false) when body missing/invalid ... ok (1ms)
  Mode determination: defaults to test mode if env var not 'false' ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
Mode determined from STRIPE_TEST_MODE env var (Value: undefined, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
----- post-test output end -----
  Mode determination: defaults to test mode if env var not 'false' ... ok (1ms)
  Missing Stripe test key should return 500 ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
STRIPE_SECRET_TEST_KEY is not configured.
----- post-test output end -----
  Missing Stripe test key should return 500 ... ok (0ms)
  Missing Stripe live key should return 500 ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: false, IsTest: false).
STRIPE_SECRET_LIVE_KEY is not configured.
----- post-test output end -----
  Missing Stripe live key should return 500 ... ok (0ms)
  Missing Supabase service key should return 500 ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Supabase URL or Service Role Key is not configured.
Stripe client initialized in TEST mode.
----- post-test output end -----
  Missing Supabase service key should return 500 ... ok (1ms)
  Successful sync: fetches, upserts, deactivates ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 4 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
----- post-test output end -----
  Successful sync: fetches, upserts, deactivates ... ok (0ms)
  Stripe prices.list fails ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Error in sync-stripe-plans function: Error: Stripe API error
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/sync-stripe-plans/index.test.ts:237:31
    at innerWrapped (ext:cli/40_test.js:180:11)
    at exitSanitizer (ext:cli/40_test.js:96:33)
    at Object.outerWrapped [as fn] (ext:cli/40_test.js:123:20)
    at TestContext.step (ext:cli/40_test.js:481:37)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/sync-stripe-plans/index.test.ts:235:17
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async outerWrapped (ext:cli/40_test.js:123:14)
----- post-test output end -----
  Stripe prices.list fails ... ok (1ms)
  Supabase upsert fails ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Supabase upsert error: { message: "DB constraint failed", code: "23505" }
----- post-test output end -----
  Supabase upsert fails ... ok (1ms)
  Deactivation: Fetch existing fails (should log warn, return success) ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
Could not fetch existing plans to check for deactivation: Permission denied
----- post-test output end -----
  Deactivation: Fetch existing fails (should log warn, return success) ... ok (0ms)
  Deactivation: Update fails (should log error, return success) ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 3 active prices.
Formatted 2 recurring plans for upsert.
Upserting plans into Supabase...
Upsert successful. 2 rows affected.
[sync-stripe-plans] Active Price IDs from Stripe for deactivation check: [ "price_1", "price_2" ]
[sync-stripe-plans] Fetching existing plan IDs from database...
[sync-stripe-plans] Found 2 plans in DB.
[sync-stripe-plans] Attempting to deactivate 1 plans.
[sync-stripe-plans] Deactivating plan: ID=3, Name=Stale Plan, StripePriceID=price_stale
[sync-stripe-plans] Error deactivating plan price_stale: Update failed
----- post-test output end -----
  Deactivation: Update fails (should log error, return success) ... ok (1ms)
  No recurring plans from Stripe: should succeed early ...
------- post-test output -------
Mode determined from STRIPE_TEST_MODE env var (Value: true, IsTest: true).
Stripe client initialized in TEST mode.
Supabase admin client initialized.
Fetching active products and prices from Stripe...
Fetched 1 active prices.
Formatted 0 recurring plans for upsert.
No recurring plans found to upsert.
----- post-test output end -----
  No recurring plans from Stripe: should succeed early ... ok (0ms)
Sync Stripe Plans Function Tests ... ok (13ms)

 ERRORS 

/api-subscriptions Integration Tests ... Success: GET /plans returns active plans => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:52:13
error: AssertionError: Values are not equal: GET /plans failed: Internal Server Error


    [Diff] Actual / Expected


-   500
+   200

  throw new AssertionError(message);
        ^
    at assertEquals (https://deno.land/std@0.192.0/testing/asserts.ts:189:9)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:61:9
    at eventLoopTick (ext:core/01_core.js:178:7)
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:52:5

/api-subscriptions Integration Tests ... Success: GET /current initially returns no subscription => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:85:13
error: AssertionError: Values are not equal: GET /current failed: Internal Server Error


    [Diff] Actual / Expected


-   500
+   200

  throw new AssertionError(message);
        ^
    at assertEquals (https://deno.land/std@0.192.0/testing/asserts.ts:189:9)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:94:9
    at eventLoopTick (ext:core/01_core.js:178:7)
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:85:5

/api-subscriptions Integration Tests ... Success: POST /checkout creates a session URL => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:102:13
error: AssertionError: Values are not equal: POST /checkout failed: 500 Internal Server Error


    [Diff] Actual / Expected


-   500
+   200

  throw new AssertionError(message);
        ^
    at assertEquals (https://deno.land/std@0.192.0/testing/asserts.ts:189:9)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:121:9
    at eventLoopTick (ext:core/01_core.js:178:7)
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:102:5

/api-subscriptions Integration Tests ... Success: POST /billing-portal creates a portal session URL => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:129:13
error: AssertionError: Values are not equal: POST /billing-portal failed: 500 Internal Server Error


    [Diff] Actual / Expected


-   500
+   200

  throw new AssertionError(message);
        ^
    at assertEquals (https://deno.land/std@0.192.0/testing/asserts.ts:189:9)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:146:9
    at eventLoopTick (ext:core/01_core.js:178:7)
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:129:5

/logout Integration Tests ... Success: Call /logout with valid token => ./supabase/functions/logout/logout.integration.test.ts:40:13
error: AssertionError: Values are not equal: Expected 200 OK, got 401


    [Diff] Actual / Expected


-   401
+   200

  throw new AssertionError(message);
        ^
    at assertEquals (https://deno.land/std@0.192.0/testing/asserts.ts:189:9)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/logout/logout.integration.test.ts:49:9
    at eventLoopTick (ext:core/01_core.js:178:7)
    at async innerWrapped (ext:cli/40_test.js:180:5)
    at async exitSanitizer (ext:cli/40_test.js:96:27)
    at async Object.outerWrapped [as fn] (ext:cli/40_test.js:123:14)
    at async TestContext.step (ext:cli/40_test.js:481:22)
    at async file:///C:/Users/Tim/paynless-framework/supabase/functions/logout/logout.integration.test.ts:40:5

/ping Integration Test => ./supabase/functions/ping/ping.integration.test.ts:6:6
error: AssertionError: Values are not equal: Expected 200 OK, got 401


    [Diff] Actual / Expected


-   401
+   200

  throw new AssertionError(message);
        ^
    at assertEquals (https://deno.land/std@0.192.0/testing/asserts.ts:189:9)
    at file:///C:/Users/Tim/paynless-framework/supabase/functions/ping/ping.integration.test.ts:16:5

 FAILURES

/api-subscriptions Integration Tests ... Success: GET /plans returns active plans => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:52:13
/api-subscriptions Integration Tests ... Success: GET /current initially returns no subscription => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:85:13
/api-subscriptions Integration Tests ... Success: POST /checkout creates a session URL => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:102:13
/api-subscriptions Integration Tests ... Success: POST /billing-portal creates a portal session URL => ./supabase/functions/api-subscriptions/api-subscriptions.integration.test.ts:129:13
/logout Integration Tests ... Success: Call /logout with valid token => ./supabase/functions/logout/logout.integration.test.ts:40:13
/ping Integration Test => ./supabase/functions/ping/ping.integration.test.ts:6:6

FAILED | 20 passed (205 steps) | 3 failed (5 steps) (6m24s)

error: Test failed