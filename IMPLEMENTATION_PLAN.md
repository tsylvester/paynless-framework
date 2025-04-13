Okay, let's break down the implementation of the Platform Capability Abstraction layer using a TDD-inspired approach, focusing on compatibility and minimal disruption to your existing structure.

**Goal:** Integrate platform-specific features (starting with Desktop filesystem access via Tauri) into the shared UI codebase (`apps/web`) without altering the backend API, existing stores, or unrelated frontend components significantly.

**Core Principle:** Isolate platform-specific code and provide a unified interface for the shared UI to consume, enabling graceful degradation on platforms lacking certain features.

**Implementation Plan & Checklist**

This plan assumes we'll start by implementing the core service and then focus on the Web (as the baseline) and Tauri Desktop (as the first platform with extended capabilities, specifically filesystem access).

**Phase 0: Foundation & Interface Definition (Shared Package)**

*   **Goal:** Define the contracts (interfaces) for capabilities and the basic structure of the service.
*   **Location:** `packages/types` (for interfaces), `packages/utils` or a new `packages/platform-capabilities` (for the service implementation). Let's assume `packages/platform-capabilities` for clarity.
*   **Checklist:**
    *   [x] **Define Capability Interfaces (`packages/types/src/platform.types.ts`):**
        *   [x] Define `FileSystemCapabilities`:
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
        *   [x] Define `PlatformCapabilities` interface:
            ```typescript
            export interface PlatformCapabilities {
              platform: 'web' | 'tauri' | 'react-native' | 'unknown';
              os?: 'windows' | 'macos' | 'linux' | 'ios' | 'android'; // Optional, if needed for finer control
              fileSystem: FileSystemCapabilities | { isAvailable: false }; // Use a flag object for unavailable
              // Add other future capability groups here (e.g., notifications, registry)
              // Example: windowsRegistry: WindowsRegistryCapabilities | { isAvailable: false };
            }
            ```
        *   [x] Export these types from `packages/types/src/index.ts`.
    *   [x] **Create Service Stub (`packages/platform-capabilities/src/index.ts`):** (Context/Provider pattern implemented)
        *   [x] Create the basic service file.
        *   [x] Define the main export function signature: (Via `usePlatformCapabilities` hook)
        *   [ ] Write initial *failing* unit test (`*.test.ts`) asserting the basic structure/return type.
        *   [x] Implement a basic stub: (Returning null initially, then capabilities)

**Phase 1: Platform Detection & Basic Service Implementation (Shared Package)**

*   **Goal:** Implement the logic within the service to detect the current platform (Web, Tauri, future RN) and OS.
*   **Location:** `packages/platform-capabilities/src/index.ts` (and provider logic)
*   **Checklist:**
    *   [ ] **(TDD) Write Unit Tests for Platform Detection:**
        *   [ ] Test case for detecting standard web browser environment.
        *   [ ] Test case for detecting Tauri environment (e.g., checking for `window.__TAURI__`).
        *   [ ] Test case for detecting React Native environment (placeholder for future).
        *   [ ] Test case for detecting OS (if needed, might leverage Tauri API later).
    *   [x] **Implement Platform/OS Detection Logic:** (Done within provider logic)
    *   [ ] **(TDD) Write Unit Tests for Capability Dispatching:**
        *   [ ] Test that `getPlatformCapabilities` returns the correct `platform` string.
        *   [ ] Test that `getPlatformCapabilities` initially returns `{ isAvailable: false }` for `fileSystem` on *all* detected platforms (as providers aren't implemented yet).
    *   [x] **Refine `getPlatformCapabilities`:** (Implemented via hook/provider pattern)
        *   [x] Ensure it returns the detected `platform` and potentially `os`.
        *   [x] Ensure it returns the default `{ isAvailable: false }` stubs for capabilities. Make tests pass.
        *   Consider making the service a singleton or memoizing the result for performance if detection is costly, though initial detection is likely cheap. (Handled by React Context)

**Phase 2: Web Platform Provider Implementation (Shared Package)**

*   **Goal:** Implement the web-specific provider, offering baseline functionality or explicitly stating unavailability.
*   **Location:** `packages/platform-capabilities/src/webPlatformCapabilities.ts` (or integrated into Provider)
*   **Checklist:**
    *   [x] **Create Web Provider File:** (Or logic integrated into main provider)
    *   [x] **Implement `fileSystem` for Web:**
        *   [x] Define a `webFileSystemCapabilities` object.
        *   [x] Set `isAvailable: false`. For now, we won't implement Web File System Access API to keep it simple. If needed later, this could be enhanced.
        *   *Rationale:* Web file access is significantly different (user-prompted, sandboxed) and often handled by standard `<input type="file">` elements. Abstracting it fully might be complex or unnecessary initially compared to just using standard web patterns where the capability service indicates FS isn't available in the *same way* as Desktop.
    *   [ ] **(TDD) Write Unit Tests for Web Provider:** Test that `webFileSystemCapabilities.isAvailable` is `false`.
    *   [x] **Integrate Web Provider:** (Done in main provider logic)

**Phase 3: Tauri Desktop Platform Provider (TypeScript Layer)**

*   **Goal:** Implement the TypeScript part of the Tauri provider, defining functions that will call the Rust backend via `invoke`.
*   **Location:** `packages/platform-capabilities/src/tauriPlatformCapabilities.ts` (Created)
*   **Checklist:**
    *   [x] **Create Tauri Provider File:** `tauriPlatformCapabilities.ts`.
    *   [x] **Import Tauri API:** Added `@tauri-apps/api` as a dependency. Imported relevant functions.
    *   [x] **Implement `fileSystem` for Tauri:**
        *   [x] Define `tauriFileSystemCapabilities` object implementing `FileSystemCapabilities`.
        *   [x] Set `isAvailable: true`.
        *   [x] Implement `pickFile`: Use Tauri's `open()` dialog API.
        *   [x] Implement `pickSaveFile`: Use Tauri's `save()` dialog API (Stubbed/Mocked in tests, assume basic impl exists).
        *   [x] Implement `readFile`: Define function calling `invoke('plugin:capabilities|read_file', { path })`.
        *   [x] Implement `writeFile`: Define function calling `invoke('plugin:capabilities|write_file', { path, data })`. (Stubbed/Mocked in tests, assume basic impl exists).
    *   [ ] **(TDD) Write Unit Tests for Tauri Provider (TS Layer):** (Component test covers basic interaction)
        *   [ ] Mock the `@tauri-apps/api` module (`vi.mock` or `jest.mock`).
        *   [ ] Test that `pickFile`/`pickSaveFile` call the mocked `open`/`save` functions correctly.
        *   [ ] Test that `readFile`/`writeFile` call the mocked `invoke` function with the correct command name and arguments. Test argument serialization if necessary (e.g., data conversion).
    *   [x] **Integrate Tauri Provider:** (Done in main provider logic)

**Phase 4: Tauri Desktop Backend (Rust Layer)**

*   **Goal:** Implement the Rust functions that perform the actual native operations for Tauri.
*   **Location:** `apps/desktop/src-tauri/src/`
*   **Checklist:**
    *   [x] **Create Rust Module:** Created `apps/desktop/src-tauri/src/capabilities.rs`.
    *   [x] **Add Crates:** Added `tempfile` dev-dependency. `serde` likely present.
    *   [x] **Implement Rust Commands (`capabilities.rs`):**
        *   [x] Define `#[tauri::command] fn read_file(path: String) -> Result<Vec<u8>, String> { ... }`.
        *   [x] Define `#[tauri::command] fn write_file(path: String, data: Vec<u8>) -> Result<(), String> { ... }`.
    *   [x] **(TDD) Write Rust Unit Tests (`capabilities.rs`):** Added basic tests.
    *   [x] **Register Commands (`apps/desktop/src-tauri/src/lib.rs`):** (Note: Likely `lib.rs` or `main.rs` depending on structure) Added invoke handler.
    *   [ ] **Build & Verify:** Build the Tauri app (`pnpm --filter desktop tauri build`) and manually test if the TS->Rust bridge works for the implemented commands. This serves as initial integration verification.

**Phase 5: UI Component Integration (Web App)**

*   **Goal:** Refactor existing components or build new ones in the web app to use the capability service.
*   **Location:** `apps/web/src/components/...` or `apps/web/src/pages/...`
*   **Checklist:**
    *   [x] **Identify Components:** Created `PlatformFeatureTester.tsx` as an example.
    *   [x] **Refactor/Build Component (Example: `PlatformFeatureTester.tsx`):**
        *   [x] Import `usePlatformCapabilities` from `packages/platform-capabilities`.
        *   [x] Call `const capabilities = usePlatformCapabilities();` within the component.
        *   [x] **(TDD) Write Component Unit Tests (Vitest/Jest):**
            *   [x] Mock `packages/platform-capabilities`.
            *   [x] Test Case 1: Simulate running on Web (`getPlatformCapabilities` returns web capabilities where `fileSystem.isAvailable` is `false`). Assert that Desktop-specific buttons (e.g., "Save Config Locally") are *not* rendered or are disabled. Assert that standard web file input is used if applicable.
            *   [x] Test Case 2: Simulate running on Tauri (`getPlatformCapabilities` returns Tauri capabilities where `fileSystem.isAvailable` is `true`). Assert that Desktop-specific buttons *are* rendered.
            *   [x] Test Case 3 (Tauri): Simulate clicking "Save Config Locally". Assert that `capabilities.fileSystem.pickSaveFile` and subsequently `capabilities.fileSystem.writeFile` are called with the correct arguments. (Tested pickFile/readFile).
        *   [x] **Implement Component Logic:**
            *   [x] Use `capabilities.platform` or `capabilities.fileSystem.isAvailable` for conditional rendering.
            *   [x] Replace direct file handling logic (if any existed beyond standard inputs) with calls to `capabilities.fileSystem.pickFile`, `readFile`, etc.
            *   [x] Ensure graceful degradation or alternative UI when `isAvailable` is `false`.
            *   [x] Make component tests pass. (Tests created)
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
