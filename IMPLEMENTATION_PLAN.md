**Incomplete Features** 
*   [✅] AI Chat on homepage doesn't work **Now pushes through login flow**
*   [✅] AI Chat signup/login flow
*   [✅] Mixpanel or Posthog integration
*   [✅] Change email from within app
*   [✅] Fix chat history box so it fills correctly  
*   [✅] Integrate the session replay logic that broke authStore, but fix it so it's compatible with the working method 
*   [✅] Fix dark mode for last card on homepage **It actually works, it's just way blue-er than anything else.**
*   [✅] Constrain AI Chatbox and Chat History to viewport size 
*   [✅] Fix chat so it scrolls with user **I //think// this works now, needs better testing**
*   [✅] Revert changes in authStore for initialize and updateProfile to working version in commit 58d6e17a
*   [ ] AI model sync automation
*   [🚧] Test project on Bolt & Lovable 
    *   [ ] Bolt & Lovable don't support pnpm monorepos well atm 
*   [ ] User email automation - abstract for generic but specific implementation with Kit 
*   [ ] Change password from within app
*   [✅] shadcn implemented
    *   [ ] Convert all pages / components to shadcn
    *   [ ] Loading skeletons for all components 
*   [ ] Change payment method doesn't register site
*   [ ] Run SEO scan 
*   [ ] Header scroll with user
*   [ ] Figure out how to parse chat responses better, they get messy if the assistant uses markdown 
*   [✅] Cancel Subscription doesn't work, API error
*   [ ] Manage Billing sends user to portal but doesn't return user after action. 
*   [ ] Fix super long login delay on chat flow 

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
    *   [x] **(TDD) Write Unit Tests for Platform Detection:**
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

1.  **No Backend/API changes:** This entire architecture lives within the frontend monorepo (`apps` and `packages`). The backend Supabase functions are untouched.
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

Implement a pattern to handle anonymous users attempting actions that require authentication (like submitting a chat). The goal is to interrupt the action, guide the user through login/signup, execute the action, and then land the user on the `chat` page displaying the newly created chat.

### Auth Interception Flow (Revised: Redirect to /chat)

**Phase 1: Implement New Logic & Flow**

1.  **Modify `aiStore.sendMessage`:**
    *   [✅] Located section for anonymous users.
    *   [✅] Ensured `returnPath: 'chat'` stored in `pendingAction`.

2.  **Use `loadChatDetails` Action in `aiStore`:**
    *   [✅] Confirmed `loadChatDetails(chatId: string)` exists and fetches messages.
    *   [✅] Confirmed necessary API client method (`api.ai().getChatMessages(chatId)`) exists or is handled.

3.  **Modify `authStore._checkAndReplayPendingAction`:**
    *   [✅] Located success handler after API replay.
    *   [✅] Checked if replayed action was `POST /chat`.
    *   [✅] Extracted `chat_id` from response.
    *   [✅] Stored `chat_id` in `localStorage` key `loadChatIdOnRedirect`.
    *   [✅] Navigated user to `/chat` using stored `navigate` function.
    *   [✅] Ensured `pendingAction` is cleared.

4.  **Modify `/chat` Page Component (`ChatPage.tsx`):**
    *   [✅] Identified `apps/web/src/pages/aichat.tsx`.
    *   [✅] Added `useEffect` hook on mount.
    *   [✅] Inside `useEffect`, checked for `loadChatIdOnRedirect` key.
    *   [✅] If key exists: Retrieved `chatId`, called `aiStore.loadChatDetails(chatId)`, removed key from session storage.
    *   [✅] If key doesn't exist, normal history loading proceeds.

**Phase 2: Cleanup Remnants of Previous Attempt**

1.  **Review `authStore._checkAndReplayPendingAction`:**
    *   [✅] Removed conflicting logic related to homepage chat.
2.  **Review `HomePage` Component:**
    *   [✅] Removed conflicting `useEffect` checking for `pendingChatMessage`.

**Phase 3: Update Unit Tests**

1.  **`aiStore.*.test.ts` (Refactored):**
    *   [✅] **`sendMessage` Tests:** Verified `pendingAction` stored correctly (including `returnPath: 'chat'`).
    *   [✅] **`loadChatDetails` Tests:** Added/verified tests for loading state, error states (invalid ID, missing token), successful API call, API error, and thrown errors.
2.  **`authStore.test.ts`:**
    *   [✅] Updated tests for `_checkAndReplayPendingAction` (or callers):
        *   [✅] Verified `localStorage.setItem('loadChatIdOnRedirect', ...)` called on successful chat replay.
        *   [✅] Verified `navigate('chat')` called on successful replay.
        *   [✅] Tested failure cases (replay API fails, non-chat action).
3.  **`/chat` Page Component Tests (e.g., `apps/web/src/pages/aichat.test.tsx`):**
    *   [✅] Tested component mount with `loadChatIdOnRedirect` present (verified `loadChatDetails` called, storage cleared).
    *   [✅] Tested component mount without `loadChatIdOnRedirect` present (verified normal history loading called).
    *   **NOTE (April 2025):** The `_checkAndReplayPendingAction` logic and the `initialize` action in `authStore.ts` have known issues introduced recently. Unit tests related to these functions (especially in `authStore.register.test.ts` and `authStore.initialize.test.ts`) may fail or are temporarily adjusted/skipped until the core logic is fixed.

**Phase 4: Manual Verification**

1.  [ ] Test the end-to-end flow:
    *   Log out.
    *   Go to the homepage.
    *   Type a message and send.
    *   Verify redirection to `/login`.
    *   Log in.
    *   Verify redirection to `/chat`.
    *   Verify the chat conversation you just initiated is loaded and displayed correctly.
    *   Refresh the `/chat` page and verify it loads the chat history list as normal.

## Proposed Refactoring: Consolidate localStorage Usage in authStore (Deferred)

**Context (April 2025):** During work on stabilizing `authStore` tests, it was noted that while Zustand's `persist` middleware (using `localStorage` via `createJSONStorage`) is the standard pattern for persisting session state (`authStore.session`), two related pieces of state are handled differently:
    *   `pendingAction`: Stored directly in `localStorage` via `localStorage.setItem('pendingAction', ...)` when an action needs to be replayed after login (e.g., anonymous chat attempt).
    *   `loadChatIdOnRedirect`: Stored directly in `localStorage` via `localStorage.setItem('loadChatIdOnRedirect', ...)` by `_checkAndReplayPendingAction` to tell the `/chat` page which specific chat to load after a successful replay and redirect.

This direct usage of `localStorage` breaks the established pattern of using `persist` for managing potentially sensitive or session-related state that needs to survive page loads/redirects.

**Proposed Solution:**
Refactor `authStore` to manage `pendingAction` and `loadChatIdOnRedirect` within its own state, persisted via the existing `persist` middleware configuration.

**High-Level Steps:**
1.  **Modify `AuthStore` State:** Add `pendingAction: PendingAction | null` and `loadChatIdOnRedirect: string | null` properties to the store's state interface and initial state.
2.  **Update `persist` Configuration:** Modify the `partialize` function within the `persist` middleware options to include `pendingAction` and `loadChatIdOnRedirect` alongside `session`.
3.  **Add Actions:** Create new actions like `setPendingAction(action)` and `clearLoadChatIdOnRedirect()` to manage these state properties.
4.  **Refactor `_checkAndReplayPendingAction`:** Modify this function to read `pendingAction` from `get()` and write `loadChatIdOnRedirect` using `set()` or the new action, instead of direct `localStorage` calls.
5.  **Refactor Consumers:**
    *   Update code that currently sets `pendingAction` in `localStorage` (e.g., in `aiStore` error handling) to call `useAuthStore.getState().setPendingAction(...)`.
    *   Update the `/chat` page component (`apps/web/src/pages/aichat.tsx`) to read `loadChatIdOnRedirect` from the `useAuthStore` hook and clear it using the new `clearLoadChatIdOnRedirect` action, instead of direct `localStorage` calls.
6.  **Update Tests:** Adjust `authStore` unit tests to assert against store state changes instead of `localStorage` mocks for these items.

**Rationale:**
*   **Consistency:** Aligns all persisted auth-related state management under the standard `persist` pattern.
*   **Centralization:** Consolidates logic related to this temporary state within the `authStore`.
*   **Maintainability & Testability:** Simplifies reasoning about state persistence and makes testing easier by focusing on Zustand state manipulation rather than direct `localStorage` mocking for these specific keys.

**Risks:**
1.  **Modifying Fragile Logic:** The primary risk involves changing the `_checkAndReplayPendingAction` and related `initialize` logic, which are known to be complex, have had recent issues, and may have testing gaps (as noted in `TESTING_PLAN.md`). Introducing changes here, even for pattern improvement, could inadvertently break the replay flow.
2.  **Implementation Errors:** Standard risk of introducing bugs during the refactoring of state access and action calls.
3.  **Hydration Interaction:** While integrating these into the existing `persist` config seems compatible with the current `skipHydration`/`rehydrate` pattern, any mistake could affect how state is restored on load.

**Decision (May 2024): DEFERRED**
*   While architecturally desirable, this refactoring should **not** be performed immediately.
*   **Prerequisite:** The core `authStore` functions (`initialize`, `_checkAndReplayPendingAction`) must first be fully stabilized, their logic confirmed correct, and robust unit tests implemented to cover all known edge cases and replay scenarios.
*   **Future Action:** Once the core auth logic is stable and well-tested, revisit this refactoring as a cleanup task to improve pattern consistency.

## Abstract Analytics Client (PostHog First)

**Goal:** Implement an analytics layer that can use PostHog (or potentially others later) based on environment variable configuration. If no provider is configured or the required key is missing, the application must function without errors, and analytics calls should become no-ops.

**Phase 0: Setup & Interface Definition**
*   **Goal:** Add dependencies, create the new package structure, and define the shared interface.
*   **Steps:**
    *   [x] **Add Dependencies:** Add `posthog-js` to `packages/analytics-client/package.json`.
    *   [x] **Create Package:** Create the directory `packages/analytics-client`.
    *   [x] **Package Files:** Add `packages/analytics-client/package.json`, `packages/analytics-client/tsconfig.json` (extending base tsconfig).
    *   [x] **Source Dir:** Create `packages/analytics-client/src/`.
    *   [x] **Define Interface:** In `packages/types/src/`, create `analytics.types.ts`. Define the `AnalyticsClient` interface (`init?`, `identify`, `track`, `reset`).
    *   [x] **Export Interface:** Export `AnalyticsClient` from `packages/types/src/index.ts`.
    *   [x] **Update Workspace:** Ensure `pnpm-workspace.yaml` includes `packages/analytics-client`.
    *   [x] **Install:** Run `pnpm install` from the root.
*   **Testing & Commit Point:** Verify builds, workspace recognition. Commit: `feat(analytics): Setup analytics-client package and define core interface`

**Phase 1: Null Adapter & Default Service**
*   **Goal:** Implement the default "do nothing" behavior.
*   **Steps:**
    *   [x] **Null Adapter:** Create `packages/analytics-client/src/nullAdapter.ts`. Implement `AnalyticsClient` with empty functions.
    *   [x] **Central Service Stub:** Create `packages/analytics-client/src/index.ts`. Import `NullAnalyticsAdapter`. Read placeholder env vars. Default to exporting `new NullAnalyticsAdapter()` as `analytics`.
*   **Testing & Commit Point:** Unit test `NullAnalyticsAdapter`, unit test `index.ts` defaulting to null adapter. Commit: `feat(analytics): Implement null analytics adapter and default service`

**Phase 2: PostHog Adapter & Service Logic**
*   **Goal:** Implement the PostHog adapter and selection logic.
*   **Steps:**
    *   [x] **Environment Variables:** Define `VITE_ANALYTICS_PROVIDER`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` in `.env.example` (optional).
    *   [x] **PostHog Adapter:** Create `packages/analytics-client/src/posthogAdapter.ts`. Import `posthog-js`. Implement `AnalyticsClient` interface using `posthog.init`, `posthog.identify`, `posthog.capture`, `posthog.reset`, etc.
    *   [x] **Central Service Update (`index.ts`):** Import `PostHogAdapter`. Read actual env vars. Add logic: If provider is "posthog" and key exists, instantiate and `init` PostHog adapter; else, instantiate null adapter. Export the chosen instance as `analytics`. Add logging for chosen adapter.
*   **Testing & Commit Point:** Unit test `PostHogAdapter` (mocking `posthog-js`). Unit test `index.ts` selection logic with different env var combinations. Commit: `feat(analytics): Implement PostHog adapter and configure service selection`

**Phase 3: Application Initialization & User Identification**
*   **Goal:** Initialize the client and integrate user identification/reset.
*   **Steps:**
    *   [✅] **App Initialization:** Ensure `import { analytics } from '@paynless/analytics-client';` happens early in `apps/web/src/main.tsx` or `App.tsx` (init happens on import).
    *   [✅] **Integrate with `useAuthStore`:** Import `analytics`. In `login`, `register`, `initialize` success handlers, call `analytics.identify(user.id, { traits... })`. In `logout` action, call `analytics.reset();`.
*   **Testing & Commit Point:** Unit test `authStore` (mocking analytics client, verifying `identify` and `reset` calls).

**Phase 4: Event Tracking Implementation**
*   **Goal:** Add `analytics.track` calls for key user actions.
*   **Steps:**
    *   [✅] Add `analytics.track('Signed Up')` to `authStore.register` success path.
    *   [✅] Add corresponding unit test to `authStore.register.test.ts`.
    *   [✅] Add `analytics.track('Logged In')` to `authStore.login` success path.
    *   [✅] Add corresponding unit test to `authStore.login.test.ts`.
    *   [✅] Add `analytics.track('Profile Updated')` to `authStore.updateProfile` success path.
    *   [✅] Add corresponding unit test to `authStore.profile.test.ts`.
    *   [✅] Add `analytics.track('Subscription Checkout Started')` to `subscriptionStore.createCheckoutSession` success path.
    *   [✅] Add corresponding unit test to `subscriptionStore.test.ts`.
    *   [✅] Add `analytics.track('Billing Portal Opened')` to `subscriptionStore.createBillingPortalSession` success path.
    *   [✅] Add corresponding unit test to `subscriptionStore.test.ts`.
    *   [✅] Add `analytics.track('Message Sent')` to `aiStore.sendMessage` success path.
    *   [✅] Add corresponding unit test to `aiStore.test.ts`.
    *   [✅] Add other desired tracking events:
        *   [✅] `Auth: Submit Login Form`
        *   [✅] `Auth: Submit Register Form`
        *   [✅] `Auth: Clicked Register Link`
        *   [✅] `Auth: Clicked Login Link`
        *   [✅] `Auth: Clicked Logout`
        *   [✅] `Profile: Submit Profile Update Form`
        *   [✅] `Chat: Clicked New Chat`
        *   [✅] `Chat: Provider Selected`
        *   [✅] `Chat: Prompt Selected`
        *   [✅] `Chat: History Item Selected`
        *   [✅] `Subscription: Clicked Subscribe`
        *   [✅] `Subscription: Clicked Cancel Subscription`
        *   [✅] `Subscription: Clicked Manage Billing`
        *   [✅] `Settings: Theme Changed`
        *   [✅] `Navigation: Clicked Header Link`
        *   [✅] `Navigation: Clicked Footer Link`
        *   [⏭️] `Navigation: User Menu Opened`
        *   [⏭️] `Navigation: Mobile Menu Opened`
*   **Testing & Commit Point:** Add tests for each tracking call. Commit incrementally: `feat(analytics): Track [Event Name]`