Okay, let's break down the implementation of the Platform Capability Abstraction layer using a TDD-inspired approach, focusing on compatibility and minimal disruption to your existing structure.

**Goal:** Integrate platform-specific features (starting with Desktop filesystem access via Tauri) into the shared UI codebase (`apps/web`) without altering the backend API, existing stores, or unrelated frontend components significantly.

**Core Principle:** Isolate platform-specific code and provide a unified interface for the shared UI to consume, enabling graceful degradation on platforms lacking certain features.

**Implementation Plan & Checklist**

This plan assumes we'll start by implementing the core service and then focus on the Web (as the baseline) and Tauri Desktop (as the first platform with extended capabilities, specifically filesystem access).

**Phase 0: Foundation & Interface Definition (Shared Package)**

*   **Goal:** Define the contracts (interfaces) for capabilities and the basic structure of the service.
*   **Location:** `packages/types` (for interfaces), `packages/utils` or a new `packages/platform-capabilities` (for the service implementation). Let's assume `packages/platform-capabilities` for clarity.
*   **Checklist:**
    *   [ ] **Define Capability Interfaces (`packages/types/src/platform.types.ts`):**
        *   [ ] Define `FileSystemCapabilities`:
            ```typescript
            export interface FileSystemCapabilities {
              isAvailable: true; // Mark explicitly that the FS capability object exists
              readFile: (path: string) => Promise<Uint8Array>;
              writeFile: (path: string, data: Uint8Array) => Promise<void>;
              pickFile: (options?: { accept?: string }) => Promise<string | null>; // Path or null
              pickSaveFile: (options?: { defaultPath?: string, accept?: string }) => Promise<string | null>; // Path or null
              // Add other relevant FS operations as needed
            }
            ```
        *   [ ] Define `PlatformCapabilities` interface:
            ```typescript
            export interface PlatformCapabilities {
              platform: 'web' | 'tauri' | 'react-native' | 'unknown';
              os?: 'windows' | 'macos' | 'linux' | 'ios' | 'android'; // Optional, if needed for finer control
              fileSystem: FileSystemCapabilities | { isAvailable: false }; // Use a flag object for unavailable
              // Add other future capability groups here (e.g., notifications, registry)
              // Example: windowsRegistry: WindowsRegistryCapabilities | { isAvailable: false };
            }
            ```
        *   [ ] Export these types from `packages/types/src/index.ts`.
    *   [ ] **Create Service Stub (`packages/platform-capabilities/src/index.ts`):**
        *   [ ] Create the basic service file.
        *   [ ] Define the main export function signature: `getPlatformCapabilities(): PlatformCapabilities`.
        *   [ ] Write initial *failing* unit test (`*.test.ts`) asserting the basic structure/return type.
        *   [ ] Implement a basic stub returning 'unknown' platform and `isAvailable: false` for all capabilities to make the test pass.

**Phase 1: Platform Detection & Basic Service Implementation (Shared Package)**

*   **Goal:** Implement the logic within the service to detect the current platform (Web, Tauri, future RN) and OS.
*   **Location:** `packages/platform-capabilities/src/index.ts`
*   **Checklist:**
    *   [ ] **(TDD) Write Unit Tests for Platform Detection:**
        *   [ ] Test case for detecting standard web browser environment.
        *   [ ] Test case for detecting Tauri environment (e.g., checking for `window.__TAURI__`).
        *   [ ] Test case for detecting React Native environment (placeholder for future).
        *   [ ] Test case for detecting OS (if needed, might leverage Tauri API later).
    *   [ ] **Implement Platform/OS Detection Logic:**
        *   [ ] Add logic within `getPlatformCapabilities` (or helper functions) to perform the checks.
        *   [ ] Make the detection tests pass.
    *   [ ] **(TDD) Write Unit Tests for Capability Dispatching:**
        *   [ ] Test that `getPlatformCapabilities` returns the correct `platform` string.
        *   [ ] Test that `getPlatformCapabilities` initially returns `{ isAvailable: false }` for `fileSystem` on *all* detected platforms (as providers aren't implemented yet).
    *   [ ] **Refine `getPlatformCapabilities`:**
        *   [ ] Ensure it returns the detected `platform` and potentially `os`.
        *   [ ] Ensure it returns the default `{ isAvailable: false }` stubs for capabilities. Make tests pass.
        *   Consider making the service a singleton or memoizing the result for performance if detection is costly, though initial detection is likely cheap.

**Phase 2: Web Platform Provider Implementation (Shared Package)**

*   **Goal:** Implement the web-specific provider, offering baseline functionality or explicitly stating unavailability.
*   **Location:** `packages/platform-capabilities/src/webPlatformCapabilities.ts` (new file)
*   **Checklist:**
    *   [ ] **Create Web Provider File:** `webPlatformCapabilities.ts`.
    *   [ ] **Implement `fileSystem` for Web:**
        *   [ ] Define a `webFileSystemCapabilities` object.
        *   [ ] Set `isAvailable: false`. For now, we won't implement Web File System Access API to keep it simple. If needed later, this could be enhanced.
        *   *Rationale:* Web file access is significantly different (user-prompted, sandboxed) and often handled by standard `<input type="file">` elements. Abstracting it fully might be complex or unnecessary initially compared to just using standard web patterns where the capability service indicates FS isn't available in the *same way* as Desktop.
    *   [ ] **(TDD) Write Unit Tests for Web Provider:** Test that `webFileSystemCapabilities.isAvailable` is `false`.
    *   [ ] **Integrate Web Provider:**
        *   [ ] In `packages/platform-capabilities/src/index.ts`, import the web provider.
        *   [ ] Update `getPlatformCapabilities`: When the platform is detected as 'web', return the imported `webFileSystemCapabilities` object for the `fileSystem` key.
        *   [ ] Update/add unit tests for `getPlatformCapabilities` to verify it returns the correct web capabilities object when 'web' is detected.

**Phase 3: Tauri Desktop Platform Provider (TypeScript Layer)**

*   **Goal:** Implement the TypeScript part of the Tauri provider, defining functions that will call the Rust backend via `invoke`.
*   **Location:** `packages/platform-capabilities/src/tauriPlatformCapabilities.ts` (new file)
*   **Checklist:**
    *   [ ] **Create Tauri Provider File:** `tauriPlatformCapabilities.ts`.
    *   [ ] **Import Tauri API:** Add `@tauri-apps/api` as a dependency to `packages/platform-capabilities`. Import `invoke` from `@tauri-apps/api/tauri`. Import `open`, `save` from `@tauri-apps/api/dialog`. Import FS functions if using direct Tauri FS API for simple cases.
    *   [ ] **Implement `fileSystem` for Tauri:**
        *   [ ] Define `tauriFileSystemCapabilities` object implementing `FileSystemCapabilities`.
        *   [ ] Set `isAvailable: true`.
        *   [ ] Implement `pickFile`: Use Tauri's `open()` dialog API.
        *   [ ] Implement `pickSaveFile`: Use Tauri's `save()` dialog API.
        *   [ ] Implement `readFile`: Define function calling `invoke('plugin:capabilities|read_file', { path })`. Define the expected Rust command name (`plugin:capabilities|read_file` is just an example convention).
        *   [ ] Implement `writeFile`: Define function calling `invoke('plugin:capabilities|write_file', { path, data })`. (Note: Passing `Uint8Array` might require base64 encoding/decoding across the bridge or using Tauri's Buffer support).
    *   [ ] **(TDD) Write Unit Tests for Tauri Provider (TS Layer):**
        *   [ ] Mock the `@tauri-apps/api` module (`vi.mock` or `jest.mock`).
        *   [ ] Test that `pickFile`/`pickSaveFile` call the mocked `open`/`save` functions correctly.
        *   [ ] Test that `readFile`/`writeFile` call the mocked `invoke` function with the correct command name and arguments. Test argument serialization if necessary (e.g., data conversion).
    *   [ ] **Integrate Tauri Provider:**
        *   [ ] In `packages/platform-capabilities/src/index.ts`, import the tauri provider.
        *   [ ] Update `getPlatformCapabilities`: When the platform is detected as 'tauri', return the imported `tauriFileSystemCapabilities` object for the `fileSystem` key.
        *   [ ] Update/add unit tests for `getPlatformCapabilities` to verify it returns the correct Tauri capabilities object when 'tauri' is detected.

**Phase 4: Tauri Desktop Backend (Rust Layer)**

*   **Goal:** Implement the Rust functions that perform the actual native operations for Tauri.
*   **Location:** `apps/desktop/src-tauri/src/`
*   **Checklist:**
    *   [ ] **Create Rust Module:** Create `apps/desktop/src-tauri/src/capabilities.rs` (or similar).
    *   [ ] **Add Crates:** Add necessary crates to `apps/desktop/src-tauri/Cargo.toml` (e.g., `serde`, potentially file system crates if not using Tauri's built-ins directly).
    *   [ ] **Implement Rust Commands (`capabilities.rs`):**
        *   [ ] Define `#[tauri::command] fn read_file(path: String) -> Result<Vec<u8>, String> { ... }`. Implement using standard Rust `std::fs::read`. Handle errors appropriately.
        *   [ ] Define `#[tauri::command] fn write_file(path: String, data: Vec<u8>) -> Result<(), String> { ... }`. Implement using standard Rust `std::fs::write`. Handle errors. (Ensure data type matches what's sent via `invoke`).
    *   [ ] **(TDD) Write Rust Unit Tests (`capabilities.rs`):**
        *   [ ] Use `#[cfg(test)]` and `mod tests { ... }`.
        *   [ ] Write tests for `read_file` and `write_file` using temporary files/directories. Test success and error cases.
    *   [ ] **Register Commands (`apps/desktop/src-tauri/src/main.rs`):**
        *   [ ] `mod capabilities;`
        *   [ ] Add `.invoke_handler(tauri::generate_handler![capabilities::read_file, capabilities::write_file])` to the `tauri::Builder`.
    *   [ ] **Build & Verify:** Build the Tauri app (`pnpm --filter desktop tauri build`) and manually test if the TS->Rust bridge works for the implemented commands. This serves as initial integration verification.

**Phase 5: UI Component Integration (Web App)**

*   **Goal:** Refactor existing components or build new ones in the web app to use the capability service.
*   **Location:** `apps/web/src/components/...` or `apps/web/src/pages/...`
*   **Checklist:**
    *   [ ] **Identify Components:** Find components that currently handle file input/output or will need desktop-specific features.
    *   [ ] **Refactor/Build Component (Example: `ConfigFileManager.tsx`):**
        *   [ ] Import `getPlatformCapabilities` from `packages/platform-capabilities`.
        *   [ ] Call `const capabilities = getPlatformCapabilities();` within the component.
        *   [ ] **(TDD) Write Component Unit Tests (Vitest/Jest):**
            *   [ ] Mock `packages/platform-capabilities`.
            *   [ ] Test Case 1: Simulate running on Web (`getPlatformCapabilities` returns web capabilities where `fileSystem.isAvailable` is `false`). Assert that Desktop-specific buttons (e.g., "Save Config Locally") are *not* rendered or are disabled. Assert that standard web file input is used if applicable.
            *   [ ] Test Case 2: Simulate running on Tauri (`getPlatformCapabilities` returns Tauri capabilities where `fileSystem.isAvailable` is `true`). Assert that Desktop-specific buttons *are* rendered.
            *   [ ] Test Case 3 (Tauri): Simulate clicking "Save Config Locally". Assert that `capabilities.fileSystem.pickSaveFile` and subsequently `capabilities.fileSystem.writeFile` are called with the correct arguments.
        *   [ ] **Implement Component Logic:**
            *   Use `capabilities.platform` or `capabilities.fileSystem.isAvailable` for conditional rendering.
            *   Replace direct file handling logic (if any existed beyond standard inputs) with calls to `capabilities.fileSystem.pickFile`, `readFile`, etc.
            *   Ensure graceful degradation or alternative UI when `isAvailable` is `false`.
            *   Make component tests pass.
    *   [ ] **Manual Test (Web):** Run the web app (`pnpm --filter web dev`). Verify the component shows the web-specific UI (no desktop buttons).
    *   [ ] **Manual Test (Tauri):** Run the desktop app (`pnpm --filter desktop tauri dev`). Verify the component shows the desktop-specific UI and that clicking the buttons triggers the Tauri dialogs and file operations successfully.

**Phase 6: Future Platforms (React Native - Outline)**

*   **Goal:** Prepare for implementing capabilities on mobile.
*   **Checklist:**
    *   [ ] Create `packages/platform-capabilities/src/reactNativePlatformCapabilities.ts`.
    *   [ ] Add `react-native-fs` or other necessary native modules to the React Native app.
    *   [ ] Implement the `FileSystemCapabilities` interface using the RN modules.
    *   [ ] Update `getPlatformCapabilities` service to detect React Native and return the corresponding provider.
    *   [ ] Write unit tests for the RN provider (mocking RN modules).
    *   [ ] Update component unit tests to simulate the RN environment.
    *   [ ] Perform integration/E2E tests on RN simulators/devices.

**How This Minimizes Changes & Ensures Compatibility:**

1.  **No Backend/API Changes:** This entire architecture lives within the frontend monorepo (`apps` and `packages`). The backend Supabase functions are untouched.
2.  **No API Client Changes:** The `@paynless/api-client` is not involved in platform-specific UI capabilities like filesystem access. It remains focused on HTTP communication with the backend.
3.  **Minimal Store Changes (Likely None Initially):** Global state related to *backend* data (auth, subscriptions, AI chats) remains in the existing Zustand stores. State directly related to platform capabilities (like the path of a currently opened file *on desktop*) might eventually warrant its own store or context *if* it needs to be shared widely, but initially, it can often be managed within the components using the capability service. We avoid polluting existing stores.
4.  **Localized Frontend Changes:**
    *   **Additive:** We add the new `platform-capabilities` package (or add to `utils` and `types`). We add new provider files and Rust code.
    *   **Targeted Refactoring:** Only components *directly* needing platform-specific features need to be refactored to use the service. Core components, layout, routing, and components dealing only with API data remain unchanged.
    *   **Shared Logic:** The core UI logic, API data fetching (via `api-client`), and state management (via stores) remain shared within `apps/web`. The capability service allows this shared code to *conditionally access* platform features.

This plan provides a structured, testable way to introduce platform-specific functionality incrementally while maintaining a high degree of code sharing and compatibility with your existing architecture.

# Implementation Plan

This file tracks major features or refactoring efforts.

## Testing Framework

- [x] Set up Deno testing environment.
- [x] Add basic tests for core utility functions.
- [x] Integrate Supabase local development environment for integration tests.

## Chat Function Tests

- [x] Refactor `chat/index.test.ts` to use shared utilities.
- [x] Fix environment variable handling for tests (`--env` flag).
- [x] Improve mock Supabase client for accurate DB simulations.
- [x] Add comprehensive test cases covering success paths and error conditions.

## Auth Interception for Anonymous Users

Implement a pattern to handle anonymous users attempting actions that require authentication (like submitting a chat). The goal is to interrupt the action, guide the user through login/signup, and resume the action afterwards.

### Phase 1: Backend Modification (Chat Function)

*   [ ] **Goal:** Modify the `chat` function (`supabase/functions/chat/index.ts`) to return a distinct signal for anonymous users instead of a generic 401.
*   [ ] **Action:** Inside the `mainHandler`, locate the `Authorization` header check.
*   [ ] **Action:** If the header is missing: return `401 Unauthorized` with a specific JSON body: `{ "error": "Authentication required", "code": "AUTH_REQUIRED" }`.

### Phase 2: Frontend Interception & State Storage

*   [ ] **Goal:** Intercept anonymous attempts on the frontend, store the intended action, and initiate the auth flow.
*   [ ] **Action:** Locate the frontend code that calls the `/chat` API endpoint.
*   [ ] **Action:** Modify this calling code (or create a wrapper/hook):
    *   When the API call promise *rejects*: check if the error response is `401` with `{ code: "AUTH_REQUIRED" }`.
    *   If it matches:
        *   Retrieve original request details (endpoint, method, body).
        *   Retrieve current page URL/route.
        *   Store these details securely in **session storage** (key: `pendingAction`).
        *   Clear any existing `pendingAction` before storing a new one.
        *   Trigger the authentication flow (e.g., redirect to `/login?redirect_uri=/current/page` or show login modal).
    *   If any other error, handle normally.

### Phase 3: Frontend Post-Authentication Action Replay

*   [ ] **Goal:** After successful login/signup, check for and execute the stored action.
*   [ ] **Action:** Locate the code that runs immediately after successful login/signup.
*   [ ] **Action:** In this post-auth code:
    *   Check session storage for `pendingAction`.
    *   If found:
        *   Retrieve stored action details.
        *   **Clear** `pendingAction` from session storage.
        *   Re-execute the API call using retrieved details and the user's new auth token.
        *   Handle success/error of the retry.
        *   If needed, redirect the user back to the original URL stored earlier.

### Phase 4: Generalization (Refactoring)

*   [ ] **Goal:** Refactor the frontend interception and replay logic into a reusable component/hook/service.
*   [ ] **Action:** Abstract logic from Phases 2 & 3 (e.g., `useProtectedApiCall` or API client interceptors).
*   [ ] **Action:** Ensure refactored solution still works for chat. Consider applying to another feature if available.

### Phase 5: Backend Security (Optional but Recommended)

*   [ ] **Goal:** Consider server-side storage for pending actions for higher security/reliability.
*   [ ] **Action (If Implementing):**
    *   Backend: Create temporary storage (e.g., `pending_actions` table) linked to an anonymous session identifier/token. Return token in the "AUTH_REQUIRED" response.
    *   Frontend: Store only the token.
    *   Backend (Post-Auth): Add endpoint for frontend to submit token post-login. Endpoint retrieves/executes action, clears storage.
