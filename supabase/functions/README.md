# Supabase Functions Development Notes

## Viewing Local Function Logs

When running Supabase locally via `supabase start`, the Edge Functions run in a Docker container. To view their real-time logs (including `console.log` output):

1.  Ensure `supabase start` is running.
2.  Find the function container name:
    ```bash
    docker ps
    ```
    (Look for a container with "functions" or "edge-runtime" in the name, e.g., `supabase_edge_runtime_paynless-framework`).
3.  View the logs using the container name:
    ```bash
    docker logs <container_name>
    ```
    Or stream logs continuously:
    ```bash
    docker logs -f <container_name>
    ```
    (Replace `<container_name>` with the actual name found in step 2).

## Dependency Injection Pattern & `serve`

To facilitate unit testing, we use a dependency injection (DI) pattern where handler functions accept a `deps` object with default implementations:

```typescript
// Example structure
import { serve } from "https://deno.land/std/http/server.ts";

interface HandlerDeps {
  // ... dependency types
}

const defaultDeps: HandlerDeps = { /* ... actual implementations */ };

export async function handler(req: Request, deps: HandlerDeps = defaultDeps): Promise<Response> {
  // Use deps.someFunction()
}
```

**Important:** When starting the server at the end of the file, simply calling `serve(handler)` might lead to `TypeError` in the Supabase Edge Runtime because the `defaultDeps` might not initialize correctly.

**Solution:** Explicitly pass the `defaultDeps` object when calling `serve`:

```typescript
if (import.meta.main) {
    serve((req) => handler(req, defaultDeps));
}
```

This ensures dependencies are correctly available while preserving the DI pattern for unit tests.

## IMPORTANT: Local JWT Runtime Issue (BLOCKER)

**Status:** As of [Current Date], the local Supabase environment (`supabase start`, CLI v2.20.5) incorrectly enforces authentication (likely JWT via `Authorization` header) on **ALL** function routes by default, returning `401 Unauthorized` even for functions designed for no auth or API key auth.

*   **Symptom:** Requests fail with `401 Unauthorized`. Docker logs (`docker logs <container_name>`) show errors like `Error: Missing authorization header` originating from the runtime (`/root/index.ts`), often before the function's own code is fully executed.
*   **Verification:** A simple `/ping` function requiring no auth fails with 401 when tested locally.
*   **Impact:** This currently **BLOCKS** reliable local integration testing of Supabase functions via HTTP requests.
*   **Likely Cause:** A bug or default behavior change in the Supabase CLI (v2.20.5 or recent) local runtime setup, where the internal proxy/router incorrectly demands JWT auth globally.

*   **Troubleshooting Steps:**
    1.  **Check `config.toml`:** Verify no global setting enforces JWT (Checked, seems ok, only function-specific `verify_jwt = false` for `login`).
    2.  **Check/Update/Rollback Supabase CLI:**
        *   Current Version: `2.20.5` (as of this writing).
        *   Check for newer versions: `supabase update`.
        *   Search [Supabase CLI GitHub Issues](https://github.com/supabase/cli/issues) for reports related to local 401s, JWT enforcement, or specific CLI versions (e.g., `2.20.5`).
        *   If issues are reported for the current version, consider rolling back to a known stable version as a temporary workaround (e.g., `npm install -g supabase@<older_version>`).
    3.  **Report Bug:** If unresolved and reproducible, file/comment on a GitHub issue.
    4.  **Alternative Testing:** If blocked, consider integration tests against a hosted Supabase preview environment instead of local.

## Standard Library Imports (`serve`, etc.)

Supabase Functions run on a specific Deno version (check `supabase start` logs, e.g., "compatible with Deno v1.45.2"). Ensure imports from the Deno Standard Library (`std`) use a recent and compatible version number.

Example (using `std@0.224.0`):
```typescript
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
```
Using significantly older versions (like `std@0.168.0`) can lead to runtime errors (e.g., `ReferenceError: serve is not defined`).

## NPM Package Imports (`npm:` Prefix)

// ... npm prefix explanation ...

## Deno Test: Resource Leaks

When writing integration tests that use `fetch`, ensure every response body is fully consumed or explicitly closed, even if you only need the status code. Otherwise, Deno's test runner will report a resource leak error.

Examples:
```typescript
// Reading the body:
const body = await response.json(); // or .text(), .arrayBuffer(), etc.

// Closing without reading:
await response.body?.cancel();
``` 