import { assertEquals, assert, assertExists, assertNotEquals } from "jsr:@std/assert@0.225.3";
// Import the functions to be tested
import {
    // corsHeaders is no longer exported
    // corsHeaders,
    handleCorsPreflightRequest,
    createErrorResponse,
    createSuccessResponse
} from "./cors-headers.ts";

// Define mock origins for testing - mirrors the structure in cors-headers.ts
const MOCK_ALLOWED_ORIGINS = [
    'http://localhost:5173', 
    'https://paynless.app', // Use one of the actual allowed production URLs
    'https://paynless-framework.netlify.app' // Add the other allowed production URL
];

// Helper to check base CORS headers (excluding Allow-Origin)
const checkBaseCorsHeaders = (headers: Headers) => {
    assertExists(headers.get("Access-Control-Allow-Headers"));
    assertExists(headers.get("Access-Control-Allow-Methods"));
    assertExists(headers.get("Access-Control-Allow-Credentials"));
    assertExists(headers.get("Access-Control-Max-Age"));
};

Deno.test("CORS Headers Utilities with Dynamic Origin", async (t) => {

    await t.step("handleCorsPreflightRequest: non-OPTIONS method returns null", () => {
        const req = new Request("http://example.com", { method: "GET" });
        const res = handleCorsPreflightRequest(req);
        assertEquals(res, null);
    });

    await t.step("handleCorsPreflightRequest: OPTIONS with allowed origin (localhost)", () => {
        const origin = MOCK_ALLOWED_ORIGINS[0];
        const req = new Request("http://example.com", { 
            method: "OPTIONS", 
            headers: { "Origin": origin }
        });
        const res = handleCorsPreflightRequest(req);
        assertExists(res, "Should return a Response object for OPTIONS");
        assertEquals(res.status, 204);
        assertEquals(res.body, null);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);
    });

    await t.step("handleCorsPreflightRequest: OPTIONS with allowed origin (prod 1 - paynless.app)", () => {
        const origin = MOCK_ALLOWED_ORIGINS[1]; // Use the first prod URL
        const req = new Request("http://example.com", { 
            method: "OPTIONS", 
            headers: { "Origin": origin }
        });
        const res = handleCorsPreflightRequest(req);
        assertExists(res);
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);
    });

    await t.step("handleCorsPreflightRequest: OPTIONS with allowed origin (prod 2 - netlify)", () => {
        const origin = MOCK_ALLOWED_ORIGINS[2]; // Use the second prod URL
        const req = new Request("http://example.com", { 
            method: "OPTIONS", 
            headers: { "Origin": origin }
        });
        const res = handleCorsPreflightRequest(req);
        assertExists(res);
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);
    });

    await t.step("handleCorsPreflightRequest: OPTIONS with disallowed origin", () => {
        const origin = "http://disallowed.com";
        const req = new Request("http://example.com", { 
            method: "OPTIONS", 
            headers: { "Origin": origin }
        });
        const res = handleCorsPreflightRequest(req);
        assertExists(res);
        assertEquals(res.status, 204); // Still returns 204 based on current impl
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), null, "Should NOT have Allow-Origin header");
    });

     await t.step("handleCorsPreflightRequest: OPTIONS with no origin header", () => {
        const req = new Request("http://example.com", { method: "OPTIONS" });
        const res = handleCorsPreflightRequest(req);
        assertExists(res);
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), null, "Should NOT have Allow-Origin header");
    });

    await t.step("createErrorResponse: with allowed origin (localhost)", async () => {
        const message = "Something went wrong";
        const status = 400;
        const origin = MOCK_ALLOWED_ORIGINS[0];
        const req = new Request("http://example.com", { headers: { "Origin": origin } });
        const res = createErrorResponse(message, status, req); // Pass request
        
        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);

        const body = await res.json();
        assertEquals(body, { error: message });
    });

    await t.step("createErrorResponse: with allowed origin (netlify)", async () => {
        const message = "Something went wrong on netlify";
        const status = 400;
        const origin = MOCK_ALLOWED_ORIGINS[2]; // Test with netlify origin
        const req = new Request("http://example.com", { headers: { "Origin": origin } });
        const res = createErrorResponse(message, status, req); // Pass request
        
        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);

        const body = await res.json();
        assertEquals(body, { error: message });
    });

    // Test specific error code mappings (kept from original, just pass req)
    await t.step("createErrorResponse should map status 401 to unauthorized code", async () => {
        const req = new Request("http://example.com", { headers: { "Origin": MOCK_ALLOWED_ORIGINS[0] } });
        const res = createErrorResponse("Unauthorized", 401, req);
        const body = await res.json();
        assertEquals(body.error, "Unauthorized");
    });
    // ... (similar updates for 403, 404 tests, passing req)
    await t.step("createErrorResponse should map status 403 to forbidden code", async () => {
        const req = new Request("http://example.com", { headers: { "Origin": MOCK_ALLOWED_ORIGINS[0] } });
        const res = createErrorResponse("Forbidden", 403, req);
        const body = await res.json();
        assertEquals(body.error, "Forbidden");
    });
    await t.step("createErrorResponse should map status 404 to not_found code", async () => {
        const req = new Request("http://example.com", { headers: { "Origin": MOCK_ALLOWED_ORIGINS[0] } });
        const res = createErrorResponse("Not Found", 404, req);
        const body = await res.json();
        assertEquals(body.error, "Not Found");
    });

    await t.step("createSuccessResponse: with allowed origin (paynless.app)", async () => {
        const data = { id: 1, name: "Test" };
        const status = 201;
        const origin = MOCK_ALLOWED_ORIGINS[1]; // Test with paynless.app origin
        const req = new Request("http://example.com", { headers: { "Origin": origin } });
        const res = createSuccessResponse(data, status, req); // Pass request

        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);

        const body = await res.json();
        assertEquals(body, data);
    });

    await t.step("createSuccessResponse: with allowed origin (netlify)", async () => {
        const data = { id: 2, name: "Netlify Test" };
        const status = 200;
        const origin = MOCK_ALLOWED_ORIGINS[2]; // Test with netlify origin
        const req = new Request("http://example.com", { headers: { "Origin": origin } });
        const res = createSuccessResponse(data, status, req); // Pass request

        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), origin);
        checkBaseCorsHeaders(res.headers);

        const body = await res.json();
        assertEquals(body, data);
    });

    await t.step("createSuccessResponse: with disallowed origin", async () => {
        const data = { success: true };
        const status = 200;
        const origin = "http://disallowed.com";
        const req = new Request("http://example.com", { headers: { "Origin": origin } });
        const res = createSuccessResponse(data, status, req); // Pass request

        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), null, "Should NOT have Allow-Origin header");

        const body = await res.json();
        assertEquals(body, data);
    });
}); 