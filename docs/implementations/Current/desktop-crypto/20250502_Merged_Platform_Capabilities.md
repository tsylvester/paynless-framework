# Merged Implementation Plan: Platform Capability Abstraction Layer

**Goal:** Implement a robust Platform Capability Abstraction Layer to integrate platform-specific features (starting with Desktop filesystem access via Tauri) into the shared UI codebase (`apps/web`). This layer should allow the UI to conditionally render elements and invoke native functionality based on the detected platform and its capabilities, ensuring graceful degradation on platforms lacking specific features (like standard web browsers). This plan focuses on compatibility and minimal disruption to existing structures (backend API, stores, unrelated UI).

**Core Principle:** Isolate platform-specific code (providers) behind a unified service interface (`packages/platform/src/index.ts`). The shared UI interacts only with this service (potentially via a context wrapper), remaining agnostic to the underlying platform implementation details. This approach adheres to the **Dependency Inversion Principle**, relying on defined **Interfaces** (contracts) in `@paynless/types` to decouple high-level modules (UI) from low-level implementation details (platform-specific providers).

## Legend

*   [ ] Each work step will be uniquely named for easy reference
    *   [ ] Worksteps will be nested as shown
        *   [ ] Nesting can be as deep as logically required
*   [✅] Represents a completed step or nested set
*   [🚧] Represents an incomplete or partially completed step or nested set
*   [⏸️] Represents a paused step where a discovery has been made that requires backtracking
*   [❓] Represents an uncertainty that must be resolved before continuing
*   [🚫] Represents a blocked, halted, stopped step or nested set that has some unresolved problem or prior dependency to resolve before continuing

## Component Types and Labels

The implementation plan uses the following labels to categorize work steps:

*   **[PLAN]:** Planning or Investigation Step
*   **[TYPES]:** TypeScript Type Definition (`packages/types`)
*   **[SVC]:** Shared Service Logic (`packages/platform`)
*   **[PROV-WEB]:** Web Platform Provider Logic (`packages/platform`)
*   **[PROV-TS-Tauri]:** Tauri Platform Provider TypeScript Logic (`packages/platform`)
*   **[PROV-RUST-Tauri]:** Tauri Platform Provider Rust Logic (`apps/desktop/src-tauri`)
*   **[TS]:** General Frontend Logic (`apps/web`)
*   **[UI]:** Frontend Component/Rendering (`apps/web`)
*   **[TEST-UNIT]:** Unit Test Implementation/Update
*   **[TEST-INT]:** Integration Test Implementation/Update
*   **[REFACTOR]:** Code Refactoring Step
*   **[COMMIT]:** Checkpoint for Git Commit

## Implementation Plan Overview

This implementation plan follows a phased approach:

1.  **Phase 0: Foundation & Interface Definition:** Define contracts and structure. (✅ Complete)
2.  **Phase R: Service Logic Consolidation & Refactoring:** Centralize core logic and update types. (✅ Complete)
3.  **Phase 1: Platform Detection & Service Core:** (✅ Superseded by Phase R)
4.  **Phase 2: Web Platform Provider:** (✅ Superseded by Phase R)
5.  **Phase 3: Tauri Platform Provider (TypeScript Layer):** (✅ Superseded by Phase R)
6.  **Phase 4: Tauri Platform Provider (Rust Layer):** Implement Tauri Rust commands. (🚧 In Progress)
7.  **Phase 5: Frontend Integration & UI:** Integrate service into UI, handle loading/errors, implement conditional rendering. (🚧 Not Started)
8.  **Phase 6: Testing & Refinement:** Comprehensive testing and adjustments. (🚧 Not Started)
9.  **Phase 7: Documentation:** Document the new layer and patterns. (🚧 Not Started)

---

## Phase 0: Foundation & Interface Definition (Shared Packages) [✅]

*   **Goal:** Define the common interfaces for platform capabilities and the basic structure of the central capability service.
*   **Location:** `packages/types` (for interfaces), new `packages/platform` (for the service and providers).

### STEP-0.1: Setup New Package [SVC] [✅]

#### STEP-0.1.1: Create Package Structure [COMMIT] [✅]
*   [✅] Create a new package directory: `packages/platform`.
*   [✅] Initialize it as a standard TypeScript package (e.g., with `package.json`, `tsconfig.json`, basic `src/index.ts`).
*   [✅] Add necessary base dependencies (e.g., `typescript`, potentially `@paynless/types` if needed early).
*   [✅] Configure build scripts in its `package.json`.
*   [✅] Add the new package to the monorepo's workspace configuration (e.g., `pnpm-workspace.yaml`).
*   [✅] Run bootstrap/install command (e.g., `pnpm install`) from the monorepo root.
*   [✅] Commit changes with message "feat(SVC): Initialize platform capabilities package".

### STEP-0.2: Define Capability Interfaces [TYPES] [✅]

#### STEP-0.2.1: Define File System Capability Interface [COMMIT] [✅]
*   [✅] In `packages/types/src/platform.types.ts` (create file if needed).
*   [✅] Define `FileSystemCapabilities` interface:
    ```typescript
    export interface FileSystemCapabilities {
      readonly isAvailable: true; // Explicit marker that the *object* for FS capabilities exists and is functional
      readFile: (path: string) => Promise<Uint8Array>; // Returns file content as byte array
      writeFile: (path: string, data: Uint8Array) => Promise<void>; // Writes byte array to file
      pickFile: (options?: { accept?: string; multiple?: boolean }) => Promise<string[] | null>; // Returns array of paths or null if cancelled
      pickDirectory: (options?: { multiple?: boolean }) => Promise<string[] | null>; // Returns array of directory paths or null if cancelled
      pickSaveFile: (options?: { defaultPath?: string; accept?: string }) => Promise<string | null>; // Returns single path or null
      // Add other relevant FS operations as needed (e.g., readDir, exists, deleteFile)
    }
    ```
*   [✅] Build the `types` package.
*   [✅] Commit changes with message "feat(TYPES): Define FileSystemCapabilities interface".

#### STEP-0.2.2: Define Main Platform Capabilities Interface [COMMIT] [✅]
*   [✅] In `packages/types/src/platform.types.ts`.
*   [✅] Define `CapabilityUnavailable` interface:
    ```typescript
    // Represents the *absence* of a specific capability group
    export interface CapabilityUnavailable {
      readonly isAvailable: false;
    }
    ```
*   [✅] Define `PlatformType` and `OperatingSystem` types:
    ```typescript
    export type PlatformType = 'web' | 'tauri' | 'react-native' | 'unknown';
    export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'ios' | 'android' | 'unknown';
    ```
*   [✅] Define `PlatformCapabilities` interface:
    ```typescript
    export interface PlatformCapabilities {
      readonly platform: PlatformType;
      readonly os: OperatingSystem; // Determined OS (required)
      readonly fileSystem: FileSystemCapabilities | CapabilityUnavailable; // Union type for presence/absence
      // Add other future capability groups here using the same pattern:
      // readonly notifications: NotificationCapabilities | CapabilityUnavailable;
      // readonly windowManagement: WindowManagementCapabilities | CapabilityUnavailable;
    }
    ```
*   [✅] Build the `types` package.
*   [✅] Commit changes with message "feat(TYPES): Define PlatformCapabilities interface".

#### STEP-0.2.3: Export Types [TYPES] [COMMIT] [✅]
*   [✅] Add exports for `FileSystemCapabilities`, `CapabilityUnavailable`, `PlatformCapabilities`, `PlatformType`, `OperatingSystem` to `packages/types/src/index.ts`.
*   [✅] Build the `types` package.
*   [✅] Commit changes with message "feat(TYPES): Export platform capability types".

### STEP-0.3: Create Initial Service Stub [SVC] [⏸️]
*   **Status Note:** Logic was initially implemented directly in `context.tsx`. This step is superseded by Phase R.

#### STEP-0.3.1: Define Service Signature and Initial Failing Test [TEST-UNIT] [COMMIT] [⏸️]
*   [⏸️] In `packages/platform/src/index.ts`.
*   [⏸️] Import `PlatformCapabilities` from `@paynless/types` (or your types package name).
*   [⏸️] Define the main export function signature: `getPlatformCapabilities(): PlatformCapabilities`.
*   [⏸️] Create a corresponding test file (`packages/platform/src/index.test.ts`).
*   [⏸️] Write an initial *failing* unit test asserting that `getPlatformCapabilities()` is callable and returns an object loosely matching the `PlatformCapabilities` structure (e.g., has a `platform` property).
*   [⏸️] Commit the failing test with message "test(SVC): Add initial failing test for getPlatformCapabilities service".

#### STEP-0.3.2: Implement Basic Service Stub to Pass Initial Test [TEST-UNIT] [COMMIT] [⏸️]
*   [⏸️] In `packages/platform/src/index.ts`.
*   [⏸️] Implement the most basic version of `getPlatformCapabilities`:
    ```typescript
    import { PlatformCapabilities, CapabilityUnavailable } from '@paynless/types'; // Adjust import path

    export function getPlatformCapabilities(): PlatformCapabilities {
      // Platform detection logic will go here later
      return {
        platform: 'unknown',
        os: 'unknown',
        fileSystem: { isAvailable: false },
        // Initialize other capability groups as unavailable
      };
    }
    ```
*   [⏸️] Run the unit test from STEP-0.3.1; it should now pass.
*   [⏸️] Build the `platform` package.
*   [⏸️] Commit changes with message "feat(SVC): Implement basic stub for getPlatformCapabilities".

---

## Phase R: Service Logic Consolidation & Refactoring [✅]

*   **Goal:** Centralize core platform detection and capability provider logic into `packages/platform/src/index.ts`, update types, and refactor consuming context/components.
*   **Location:** `packages/platform`, `apps/web`.

### STEP-R.1: Centralize Service Logic in `index.ts` [SVC] [TEST-UNIT] [COMMIT] [✅]
*   [✅] In `packages/platform/src/index.ts`.
*   [✅] Refactor/Implement `getPlatformCapabilities()` function.
*   [✅] Update imports and return types to use `PlatformCapabilities`, `CapabilityUnavailable`, etc.
*   [✅] Implement reliable platform detection (e.g., using `@tauri-apps/api/core` `isTauri`).
*   [✅] Implement OS detection (must return `OperatingSystem`, default to `'unknown'`).
*   [✅] Implement logic to dynamically import appropriate provider based on platform (`web.ts`, `tauri.ts`).
*   [✅] Implement/verify memoization logic.
*   [✅] Create/Update unit tests for `getPlatformCapabilities` covering detection, provider selection, OS determination, and memoization.
*   [✅] Build `platform` package.
*   [✅] Commit changes with message "refactor(SVC): Centralize platform capability logic in service".

### STEP-R.2: Update Platform Providers [PROV-WEB] [PROV-TS-Tauri] [TEST-UNIT] [COMMIT] [✅]
*   [✅] In `packages/platform/src/web.ts`:
    *   [✅] Update function (`getWebCapabilities` or similar) to align with `PlatformCapabilities` / `FileSystemCapabilities` types (return structure, use `CapabilityUnavailable`).
    *   [✅] Ensure it can be imported and used by `index.ts`.
    *   [✅] Update associated tests (`web.test.ts`).
*   [✅] In `packages/platform/src/tauri.ts`:
    *   [✅] Update factory function (`createTauriFileSystemCapabilities`) and its return type to implement `FileSystemCapabilities`.
    *   [✅] Update `pickFile` signature and implementation (handle `multiple`, return `string[] | null`).
    *   [✅] Implement `pickDirectory` method (invoke Rust command `pick_directory`). *(Completed post-Phase 4)*
    *   [✅] Correct Rust command names used by `invoke` (`read_file`, `write_file`, `pick_directory`).
    *   [✅] Ensure it can be imported and used by `index.ts`.
    *   [✅] Update associated tests (`tauri.test.ts`).
*   [✅] Build `platform` package.
*   [✅] Commit changes with message "refactor(PROV): Align providers with updated interfaces".

### STEP-R.3: Refactor `PlatformProvider` (`context.tsx`) [TS] [TEST-UNIT] [COMMIT] [✅]
*   [✅] In `packages/platform/src/context.tsx`.
*   [✅] Update type imports and state management to use `PlatformCapabilities`.
*   [✅] Remove internal platform detection, OS detection, and provider loading logic.
*   [✅] Modify `useEffect` to call `getPlatformCapabilities()` from `index.ts`.
*   [✅] Handle the (potentially async, if OS detection becomes async) result and set state.
*   [✅] Update `usePlatform` hook return type.
*   [✅] Update associated tests (`context.test.tsx`).
*   [✅] Build `platform` package.
*   [✅] Commit changes with message "refactor(TS): Simplify PlatformProvider to use core service".

### STEP-R.4: Verify Consuming Components (e.g., `PlatformFeatureTester`) [UI] [TEST-UNIT] [COMMIT] [✅]
*   [✅] STEP-R.4.1: Locate consumers, update logic & tests.
    *   [✅] Identified component path: `apps/web/src/components/debug/PlatformFeatureTester.tsx`
    *   [✅] Reviewed component(s) and updated `pickFile` handler for `string[]` return.
    *   [✅] Updated associated component unit tests (`PlatformFeatureTester.test.tsx`).
    *   [✅] Fixed warning in `apps/web/vitest.config.ts` (duplicate key).
    *   [✅] Ran unit tests for `@paynless/web` component - Passed.
*   [✅] STEP-R.4.2: Perform Manual Verification.
    *   [✅] Built and ran the `web` application.
    *   [✅] Verified component behavior in standard web browser (rendered null).
    *   [✅] Built and ran the `desktop` application (`pnpm --filter desktop tauri dev`).
    *   [✅] Verified component rendered in Tauri, but file buttons non-functional (Confirms Rust backend needed - Phase 4).
*   [✅] Commit changes with message "refactor(UI): Update capability consumers post-service refactor".

---

## Phase 1: Platform Detection & Service Core Implementation (Shared Package) [✅ Superseded by Phase R]
*   **Status Note:** Steps superseded by consolidation in Phase R.

### STEP-1.1: Implement Platform Detection Logic [SVC] [✅ Superseded]

#### STEP-1.1.1: Write Unit Tests for Platform Detection [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

#### STEP-1.1.2: Implement Platform Detection [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

### STEP-1.2: Implement OS Detection Logic [SVC] [✅ Superseded]

#### STEP-1.2.1: Write Unit Tests for OS Detection [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

#### STEP-1.2.2: Implement Placeholder OS Detection [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

### STEP-1.3: Refine Service Structure for Providers [SVC] [✅ Superseded]

#### STEP-1.3.1: Write Unit Tests for Capability Dispatching [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

#### STEP-1.3.2: Consider Service Memoization/Singleton [REFACTOR] [COMMIT] [✅ Superseded]
*   [✅] ...

---

## Phase 2: Web Platform Provider Implementation (Shared Package) [✅ Superseded by Phase R]
*   **Status Note:** Steps superseded by `STEP-R.1` and `STEP-R.2`.

### STEP-2.1: Implement Web File System Provider [PROV-WEB] [✅ Superseded]

#### STEP-2.1.1: Create Web Provider File and Structure [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

### STEP-2.2: Integrate Web Provider into Service [SVC] [✅ Superseded]

#### STEP-2.2.1: Write Unit Tests for Web Provider Integration [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

#### STEP-2.2.2: Update Service to Use Web Provider [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

---

## Phase 3: Tauri Platform Provider (TypeScript Layer) [✅ Superseded by Phase R]
*   **Status Note:** Steps superseded by `STEP-R.1` and `STEP-R.2`.

### STEP-3.1: Add Tauri Dependencies [PROV-TS-Tauri] [✅ Superseded]

#### STEP-3.1.1: Install Tauri API Package [COMMIT] [✅ Superseded]
*   [✅] ...

### STEP-3.2: Implement Tauri File System Provider [PROV-TS-Tauri] [✅ Superseded]

#### STEP-3.2.1: Create Tauri Provider File and Structure [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

#### STEP-3.2.2: Write Unit Tests for Tauri Provider (TS Layer) [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

### STEP-3.3: Integrate Tauri Provider into Service [SVC] [✅ Superseded]

#### STEP-3.3.1: Write Unit Tests for Tauri Provider Integration [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

#### STEP-3.3.2: Update Service to Use Tauri Provider [TEST-UNIT] [COMMIT] [✅ Superseded]
*   [✅] ...

---

## Phase 4: Tauri Platform Provider (Rust Layer) [🚧 In Progress]

*   **Goal:** Implement the Rust functions (`tauri::command`s) that perform the actual native operations invoked by the Tauri TypeScript provider.
*   **Location:** `apps/windows/src-tauri/src/`.

### STEP-4.1: Implement Rust File System Commands [PROV-RUST-Tauri] [🚧]

#### STEP-4.1.1: Create Rust Module and Add Dependencies [COMMIT] [✅]
*   [✅] Verified `apps/windows/src-tauri/src/capabilities.rs` exists.
*   [✅] Verified relevant dependencies (`tauri`, `serde`, `tempfile`) are in `Cargo.toml`.
*   [✅] Commit message: "feat(PROV-RUST-Tauri): Setup Rust module for platform capabilities".

#### STEP-4.1.2: Implement read_file Command [TEST-UNIT] [COMMIT] [✅]
*   [✅] Command `read_file` already existed in `capabilities.rs`.
*   [✅] Updated unit tests for success and failure cases.
*   [✅] Ran Rust tests (`cargo test`) - Passed.
*   [✅] Commit changes with message "fix(PROV-RUST-Tauri): Correct tests for existing read_file command".

#### STEP-4.1.3: Implement write_file Command [TEST-UNIT] [COMMIT] [✅]
*   [✅] Command `write_file` already existed in `capabilities.rs`.
*   [✅] Updated unit tests for success and failure cases.
*   [✅] Ran Rust tests (`cargo test`) - Passed.
*   [✅] Commit changes with message "fix(PROV-RUST-Tauri): Correct tests for existing write_file command".

#### STEP-4.1.4: Implement pick_directory Command [TEST-UNIT] [COMMIT] [✅]
*   [✅] In `capabilities.rs`.
*   [✅] Implemented the command using `tauri_plugin_dialog` (blocking approach).
*   [✅] Skipped unit tests due to complexity of mocking dialogs.
*   [✅] Built the Tauri application (`cargo build`) - Passed.
*   [✅] Commit changes with message "feat(PROV-RUST-Tauri): Implement pick_directory command".

### STEP-4.2: Register Rust Commands [PROV-RUST-Tauri] [✅]

#### STEP-4.2.1: Update Invoke Handler [TEST-INT] [COMMIT] [✅]
*   [✅] In `apps/windows/src-tauri/src/main.rs`.
*   [✅] Added `capabilities::pick_directory` to `tauri::generate_handler!`.
*   [✅] Built the Tauri application (`pnpm tauri dev` restart) - Compiled successfully.
*   [✅] Commit changes with message "feat(PROV-RUST-Tauri): Register pick_directory command".

---

## Phase 5: Frontend Integration & UI [🚧 Not Started]

*   **Goal:** Integrate the refactored service/context into the main application setup and ensure UI components use the service correctly for conditional rendering and invoking platform-specific actions.
*   **Location:** `apps/web/src/...`
*   **Prerequisite:** Phase R completed.

### STEP-5.1: Integrate Service Call into App Initialization [TS] [🚧]

#### STEP-5.1.1: Define State for Capabilities and Loading [TEST-UNIT] [COMMIT]
*   [ ] In the main App component (`App.tsx`, `main.ts`, or a dedicated context/store provider).
*   [ ] Create unit tests for the initial state and expected state transitions.
*   [ ] Define state variables:
    *   [ ] `platformCapabilities: PlatformCapabilities | null = null;` (Start as null until loaded)
    *   [ ] `isLoadingCapabilities: boolean = true;`
    *   [ ] `capabilityError: string | null = null;` (For storing potential errors)
*   [ ] Run unit tests for initial state.
*   [ ] Build frontend.
*   [ ] Commit changes with message "feat(TS): Define state for platform capabilities loading".

#### STEP-5.1.2: Implement Initial Capability Fetching Logic [TEST-UNIT] [COMMIT]
*   [ ] In the main App component or provider, using `useEffect` (React) or equivalent.
*   [ ] Create unit tests for this effect (mocking `getPlatformCapabilities`).
*   [ ] Implement the effect:
    ```typescript
    import { getPlatformCapabilities } from 'packages/platform'; // Adjust import
    import { useState, useEffect } from 'react'; // Or framework equivalent

    // Inside your main component/provider
    const [platformCapabilities, setPlatformCapabilities] = useState<PlatformCapabilities | null>(null);
    const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(true);
    const [capabilityError, setCapabilityError] = useState<string | null>(null);

    useEffect(() => {
      let isMounted = true;
      try {
        const caps = getPlatformCapabilities(); // Assumes sync for now
        if (isMounted) {
          setPlatformCapabilities(caps);
          setIsLoadingCapabilities(false);
        }
      } catch (error: any) {
        console.error("Failed to get platform capabilities:", error);
        if (isMounted) {
          setCapabilityError(error.message || 'Unknown error fetching capabilities');
          // Set default/fallback capabilities if desired upon error
          // setPlatformCapabilities({ platform: 'unknown', os: 'unknown', fileSystem: { isAvailable: false } }); 
          setIsLoadingCapabilities(false);
        }
      }
      return () => { isMounted = false; }; // Cleanup for async scenarios
    }, []); // Empty dependency array: run once on mount
    ```
    *   *Note:* If `getPlatformCapabilities` or parts of it (like detailed OS detection) become async, this effect needs `async/await` and careful handling of the component unmounting during the async operation.
*   [ ] Pass the `platformCapabilities`, `isLoadingCapabilities`, `capabilityError` down via props or context.
*   [ ] Run unit tests (mocking the service). Ensure loading and error states are set correctly.
*   [ ] Build frontend.
*   [ ] Commit changes with message "feat(TS): Implement initial fetch of platform capabilities".

### STEP-5.2: Implement UI Loading/Error States [UI] [🚧]

#### STEP-5.2.1: Implement Global Loading/Error Handling [TEST-UNIT] [COMMIT]
*   [ ] In the main App layout.
*   [ ] Create unit tests for loading/error display.
*   [ ] Use the `isLoadingCapabilities` and `capabilityError` state:
    *   [ ] If `isLoadingCapabilities` is true, potentially show a global loading indicator (e.g., splash screen, main layout skeleton) or delay rendering main content.
    *   [ ] If `capabilityError` is not null, display a user-friendly error message (e.g., a banner) indicating platform features might be limited.
*   [ ] Run unit tests.
*   [ ] Build frontend. Test visually.
*   [ ] Commit changes with message "feat(UI): Implement global loading/error states for capability detection".

### STEP-5.3: Refactor/Build UI Components [UI] [🚧]

#### STEP-5.3.1: Identify/Create Example Component (e.g., `ConfigFileManager`) [COMMIT]
*   [ ] Identify an existing component needing file access or create a new placeholder component (`apps/web/src/components/features/ConfigFileManager.tsx`).
*   [ ] Commit placeholder if created.

#### STEP-5.3.2: Write Component Unit Tests [TEST-UNIT] [COMMIT]
*   [ ] Create test file (`ConfigFileManager.test.tsx`).
*   [ ] Write tests covering different capability scenarios:
    *   [ ] Test Case 1: Web Environment - Provide mock capabilities (`platform: 'web'`, `fileSystem: { isAvailable: false }`). Assert Desktop buttons are hidden/disabled. Assert standard web inputs are shown (if applicable).
    *   [ ] Test Case 2: Tauri Environment - Provide mock capabilities (`platform: 'tauri'`, `fileSystem: { isAvailable: true, pickSaveFile: mockFn, writeFile: mockFn }`). Assert Desktop buttons are visible/enabled.
    *   [ ] Test Case 3: Tauri Interaction - Simulate clicking Desktop 'Save' button. Assert the mocked `pickSaveFile` and `writeFile` methods on the mock capabilities object are called correctly.
    *   [ ] Test Case 4: Loading State - Provide `isLoadingCapabilities: true` (or `platformCapabilities: null`). Assert a loading indicator is shown within the component.
    *   [ ] Test Case 5: Error State - Provide `capabilityError: 'some error'`. Assert appropriate fallback UI or disabled state.
*   [ ] Commit failing tests with message "test(UI): Add unit tests for ConfigFileManager component with platform capabilities".

#### STEP-5.3.3: Implement Component Logic Using Capability Service [TEST-UNIT] [COMMIT]
*   [ ] In `ConfigFileManager.tsx`.
*   [ ] Consume the `platformCapabilities`, `isLoadingCapabilities`, `capabilityError` state (e.g., via context or props).
*   [ ] Implement conditional rendering based on `isLoadingCapabilities` and `capabilityError` first.
*   [ ] If capabilities are loaded and no error:
    *   [ ] Use `platformCapabilities.fileSystem.isAvailable` to conditionally render Desktop-specific buttons/UI vs. Web-specific UI.
    *   [ ] Add `onClick` handlers for Desktop buttons.
    *   [ ] Inside handlers, check `if (platformCapabilities.fileSystem.isAvailable)` again (type guard) before calling methods like `platformCapabilities.fileSystem.pickSaveFile(...)` and `platformCapabilities.fileSystem.writeFile(...)`.
    *   [ ] Add state within the component to handle the async nature of file operations (e.g., `isSaving: true`).
    *   [ ] Implement appropriate error handling for the file operation promises.
*   [ ] Run unit tests. Refine component implementation until all tests pass.
*   [ ] Build frontend.
*   [ ] Commit changes with message "feat(UI): Implement ConfigFileManager using platform capability service".

---

## Phase 6: Testing & Refinement [🚧 Not Started]

*   **Prerequisite:** Phase 4 and 5 completed.

### STEP-6.1: Manual Integration Testing [TEST-INT] [🚧]

#### STEP-6.1.1: Test in Web Environment [COMMIT] [ ]
*   [ ] Run the web app standalone (`pnpm --filter web dev`).
*   [ ] Navigate to the component using capabilities (e.g., `ConfigFileManager`).
*   [ ] Verify: Desktop-specific UI is hidden/disabled. Web fallback UI works as expected.
*   [ ] Commit verification results with message "test(INT): Verified web environment UI for capability components".

#### STEP-6.1.2: Test in Tauri Environment [COMMIT] [ ]
*   [ ] Run the desktop app (`pnpm --filter desktop tauri dev`).
*   [ ] Navigate to the component.
*   [ ] Verify: Loading state shows briefly (if applicable). Desktop-specific UI is visible/enabled.
*   [ ] Interact with Desktop features (e.g., click 'Save File' button).
*   [ ] Verify: Tauri dialogs appear correctly. Files are read/written correctly to the chosen locations.
*   [ ] Verify: Error handling within the component works if file operations fail (e.g., cancel dialog, disk full).
*   [ ] Commit verification results with message "test(INT): Verified Tauri environment UI and functionality for capability components".
*   [ ] Specifically test `pickDirectory`.

### STEP-6.2: Code Review [🚧]

#### STEP-6.2.1: Review Shared Packages (`types`, `platform`) [COMMIT] [ ]
*   [ ] Review interfaces, service logic, provider implementations for clarity, correctness, efficiency.
*   [ ] Address feedback.
*   [ ] Commit changes.

#### STEP-6.2.2: Review Rust Code (`src-tauri`) [COMMIT] [ ]
*   [ ] Review command implementations, error handling, testing.
*   [ ] Address feedback.
*   [ ] Commit changes.

#### STEP-6.2.3: Review Frontend Integration (`apps/web`) [COMMIT] [ ]
*   [ ] Review capability state consumption, loading/error handling, conditional rendering, component logic.
*   [ ] Address feedback.
*   [ ] Commit changes.

---

## Phase 7: Documentation [🚧 Not Started]

### STEP-7.1: Update Development Documentation [🚧]

#### STEP-7.1.1: Document Platform Capability Service [COMMIT] [ ]
*   [ ] Add a new documentation page explaining the Platform Capability Abstraction Layer.
*   [ ] Describe the purpose and structure of the `packages/platform` service.
*   [ ] Document the `PlatformCapabilities` interface and the provider pattern.
*   [ ] Explain how to add support for new capabilities or platforms.
*   [ ] Commit documentation with message "docs: Document platform capability service architecture".

#### STEP-7.1.2: Document Usage in UI Components [COMMIT] [ ]
*   [ ] Provide examples of how UI components should consume the service.
*   [ ] Emphasize checking `isLoadingCapabilities`, `capabilityError`, and `isAvailable` flags.
*   [ ] Show examples of conditional rendering and calling capability methods.
*   [ ] Commit documentation with message "docs: Document usage pattern for capability service in UI components".

--- 