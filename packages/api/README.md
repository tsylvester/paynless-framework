# @paynless/api

This package provides API client services for interacting with the Paynless backend, including Supabase Edge Functions.

## Dialectic API Client (`DialecticApiClient`)

The `DialecticApiClient` is responsible for all communications with the `dialectic-service` Supabase Edge Function, which manages the AI Dialectic Engine's operations. It handles creating and managing dialectic projects, sessions, contributions, and model interactions.

### Initialization

The `DialecticApiClient` is typically not instantiated directly but is made available as a property on the main `ApiClient` instance.

```typescript
import { ApiClient } from '@paynless/api';
import { supabaseClient } from './supabase'; // Your Supabase client instance
import { type AuthChangeEvent, type Session as SupabaseSession } from '@supabase/supabase-js';


const apiClient = new ApiClient(
    supabaseClient,
    (event: AuthChangeEvent, session: SupabaseSession | null): void => {
        // Handle auth changes, e.g., update user state
        console.log('Auth event:', event, session);
    }
);


// Access dialectic methods like so:
// await apiClient.dialectic.listProjects();
```

### Methods

The `DialecticApiClient` provides the following methods:

#### `listAvailableDomains(): Promise<ApiResponse<string[]>>`
Fetches the list of available domains that can be associated with dialectic projects. This endpoint is public.
-   **Returns:** A promise that resolves to an `ApiResponse` containing an array of strings (domains).

#### `createProject(payload: CreateProjectPayload): Promise<ApiResponse<DialecticProject>>`
Creates a new dialectic project.
-   **Parameters:**
    -   `payload: CreateProjectPayload`: An object containing details for the new project, such as `projectName`, `initialUserPrompt`, and optionally `selected_domain_id`.
-   **Returns:** A promise that resolves to an `ApiResponse` containing the created `DialecticProject` object.

#### `listProjects(): Promise<ApiResponse<DialecticProject[]>>`
Fetches the list of dialectic projects for the authenticated user.
-   **Returns:** A promise that resolves to an `ApiResponse` containing an array of `DialecticProject` objects.

#### `startSession(payload: StartSessionPayload): Promise<ApiResponse<DialecticSession>>`
Starts a new dialectic session for a given project.
-   **Parameters:**
    -   `payload: StartSessionPayload`: An object containing `projectId`, `selectedModelIds`, and optional `sessionDescription`, `thesisPromptTemplateName`, `antithesisPromptTemplateName`.
-   **Returns:** A promise that resolves to an `ApiResponse` containing the created `DialecticSession` object.

#### `getProjectDetails(projectId: string): Promise<ApiResponse<DialecticProject>>`
Fetches the details of a specific dialectic project, including its sessions, models, and contributions.
-   **Parameters:**
    -   `projectId: string`: The ID of the project to fetch.
-   **Returns:** A promise that resolves to an `ApiResponse` containing the detailed `DialecticProject` object.

#### `listModelCatalog(): Promise<ApiResponse<AIModelCatalogEntry[]>>`
Fetches the list of available AI models from the catalog that can be used in dialectic sessions.
-   **Returns:** A promise that resolves to an `ApiResponse` containing an array of `AIModelCatalogEntry` objects.

#### `getContributionContentSignedUrl(contributionId: string): Promise<ApiResponse<ContributionContentSignedUrlResponse | null>>`
Fetches a short-lived signed URL to access the content of a specific dialectic contribution stored in Supabase Storage.
-   **Parameters:**
    -   `contributionId: string`: The ID of the dialectic contribution.
-   **Returns:** A promise that resolves to an `ApiResponse` containing an object with `signedUrl`, `mimeType`, and `sizeBytes`, or `null` if not found.

### Interaction with `dialectic-service`

All methods in the `DialecticApiClient` make authenticated (unless specified otherwise, like `listAvailableDomains`) POST requests to the `dialectic-service` Supabase Edge Function. The specific action to be performed by the Edge Function is sent in the request body, along with any necessary payload.

For example, calling `apiClient.dialectic.createProject({ projectName: 'Test', initialUserPrompt: 'Test prompt' })` would result in a POST request to the `/functions/v1/dialectic-service` endpoint with a body similar to:

```json
{
  "action": "createProject",
  "payload": {
    "projectName": "Test",
    "initialUserPrompt": "Test prompt"
  }
}
```

Error handling and response parsing are managed within the `ApiClient` and its specific method implementations. Logger calls are included to provide insights into requests and responses. 