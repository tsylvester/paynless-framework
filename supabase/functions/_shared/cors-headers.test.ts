import { assertEquals, assert } from "jsr:@std/assert@0.225.3";
import {
    corsHeaders,
    handleCorsPreflightRequest,
    createErrorResponse,
    createSuccessResponse
} from "./cors-headers.ts";

Deno.test("CORS Headers Utilities", async (t) => {

    await t.step("handleCorsPreflightRequest should return null for non-OPTIONS", () => {
        const req = new Request("http://example.com", { method: "GET" });
        const res = handleCorsPreflightRequest(req);
        assertEquals(res, null);
    });

    await t.step("handleCorsPreflightRequest should return 204 with headers for OPTIONS", () => {
        const req = new Request("http://example.com", { method: "OPTIONS" });
        const res = handleCorsPreflightRequest(req);
        assert(res instanceof Response, "Should return a Response object");
        assertEquals(res.status, 204);
        assertEquals(res.body, null); // No body for 204
        // Check if all expected CORS headers are present
        for (const [key, value] of Object.entries(corsHeaders)) {
            assertEquals(res.headers.get(key), value);
        }
    });

    await t.step("createErrorResponse should return correct structure and headers", async () => {
        const message = "Something went wrong";
        const status = 400;
        const res = createErrorResponse(message, status);
        
        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        // Check for CORS headers - Corrected assertion
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*", "CORS header mismatch"); 

        const body = await res.json();
        assertEquals(body, { error: { code: "bad_request", message: message } });
    });

    await t.step("createErrorResponse should default to 500 and server_error code", async () => {
        const message = "Server issue";
        const res = createErrorResponse(message); // Default status 500
        
        assert(res instanceof Response);
        assertEquals(res.status, 500);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        // Corrected assertion
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*", "CORS header mismatch");

        const body = await res.json();
        assertEquals(body, { error: { code: "server_error", message: message } });
    });

    // Add tests for other status codes mapped to specific error codes (e.g., 401, 403, 404)
    await t.step("createErrorResponse should map status 401 to unauthorized code", async () => {
        const res = createErrorResponse("Unauthorized", 401);
        const body = await res.json();
        assertEquals(body.error.code, "unauthorized");
    });
     await t.step("createErrorResponse should map status 403 to forbidden code", async () => {
        const res = createErrorResponse("Forbidden", 403);
        const body = await res.json();
        assertEquals(body.error.code, "forbidden");
    });
     await t.step("createErrorResponse should map status 404 to not_found code", async () => {
        const res = createErrorResponse("Not Found", 404);
        const body = await res.json();
        assertEquals(body.error.code, "not_found");
    });

    await t.step("createSuccessResponse should return correct structure and headers", async () => {
        const data = { id: 1, name: "Test" };
        const status = 201;
        const res = createSuccessResponse(data, status);

        assert(res instanceof Response);
        assertEquals(res.status, status);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        // Corrected assertion
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*", "CORS header mismatch");

        const body = await res.json();
        assertEquals(body, data);
    });

    await t.step("createSuccessResponse should default to status 200", async () => {
        const data = { success: true };
        const res = createSuccessResponse(data); // Default status 200

        assert(res instanceof Response);
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/json");
        // Corrected assertion
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*", "CORS header mismatch");

        const body = await res.json();
        assertEquals(body, data);
    });
}); 