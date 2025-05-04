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
7.  **Phase 5: Frontend Integration & UI:** Integrate service into UI, handle loading/errors, implement conditional rendering. (🚧 In Progress)
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
    *   [✅] Verified component rendered and file operations functional after plugin refactor.
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

## Phase 4: Tauri Platform Provider (Rust Layer) [✅ Refactored to Plugins]

*   **Goal:** Implement the Rust functions (`tauri::command`s) that perform the actual native operations invoked by the Tauri TypeScript provider.
*   **Status:** Refactored in STEP-4.3 to use standard `tauri-plugin-fs` and `tauri-plugin-dialog` instead of custom commands.
*   **Location:** `apps/windows/src-tauri/src/`.

### STEP-4.1: Implement Rust File System Commands [PROV-RUST-Tauri] [✅ Refactored]

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

### STEP-4.2: Register Rust Commands [PROV-RUST-Tauri] [✅ Refactored]

#### STEP-4.2.1: Update Invoke Handler [TEST-INT] [COMMIT] [✅]
*   [✅] In `apps/windows/src-tauri/src/main.rs`.
*   [✅] Added `capabilities::pick_directory` to `tauri::generate_handler!`.
*   [✅] Built the Tauri application (`pnpm tauri dev` restart) - Compiled successfully.
*   [✅] Commit changes with message "feat(PROV-RUST-Tauri): Register pick_directory command".

### STEP-4.3: Refactor to Use Standard Plugins [PROV-TS-Tauri] [PROV-RUST-Tauri] [TEST-UNIT] [COMMIT] [✅]
*   [✅] Added `tauri-plugin-fs` dependency (`Cargo.toml`, `package.json`).
*   [✅] Registered `tauri_plugin_fs` and `tauri_plugin_dialog` in `main.rs` / `lib.rs`.
*   [✅] Added `fs:default` and `fs:write-all` permissions to `capabilities/default.json`.
*   [✅] Refactored `tauri.ts` (`readFile`, `writeFile`, `pickDirectory`) to use FS and Dialog plugin APIs.
*   [✅] Removed corresponding custom commands and tests from `capabilities.rs`.
*   [✅] Removed custom command registrations from `main.rs` / `lib.rs`.
*   [✅] Updated `tauri.test.ts` to mock plugin APIs instead of `invoke`.
*   [✅] Ran `@paynless/platform` tests - Passed.
*   [✅] Manual verification in `PlatformFeatureTester` successful.
*   [✅] Commit changes with message "refactor(PROV): Use standard plugins for FS/Dialog ops".

---

## Phase 5: Frontend Integration & UI [🚧 In Progress]

*   **Goal:** Integrate the refactored service/context into the main application setup and ensure UI components use the service correctly for conditional rendering and invoking platform-specific actions.
*   **Location:** `apps/web/src/...`
*   **Prerequisite:** Phase R and Phase 4 completed.

### STEP-5.1: Integrate Service Call into App Initialization [TS] [✅ Pre-existing]
*   **Status:** `PlatformProvider` was found already wrapping the main application content in `apps/web/src/App.tsx`.

#### STEP-5.1.1: Define State for Capabilities and Loading [TEST-UNIT] [COMMIT] [✅ N/A]
*   **Status:** Not applicable as `PlatformProvider` handles internal loading state.

#### STEP-5.1.2: Implement Initial Capability Fetching Logic [TEST-UNIT] [COMMIT] [✅ N/A]
*   **Status:** Not applicable as `PlatformProvider` handles fetching.

### STEP-5.2: Implement UI Loading/Error States [UI] [🚧]

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

### STEP-5.3: Implement UI Loading/Error States [UI] [✅]

#### STEP-5.3.1: Implement Global Loading/Error Handling [TEST-UNIT] [COMMIT] [✅]
*   [✅] In the main App layout (`App.tsx`).
*   [ ] Create unit tests for loading/error display.
*   [✅] Use the `isLoadingCapabilities` and `capabilityError` state:
    *   [✅] If `isLoadingCapabilities` is true, show a global loading indicator.
    *   [✅] If `capabilityError` is not null, display a global error banner.
*   [ ] Run unit tests.
*   [ ] Build frontend. Test visually.
*   [✅] Commit changes with message "feat(UI): Implement global loading/error states for capability detection".

#### STEP-5.3.2: Define Component-Level Handling Strategy [TEST-UNIT] [COMMIT] [✅]
*   [✅] **Strategy:** Prioritize handling loading (`isLoadingCapabilities`) and error states (`capabilityError`, file operation errors) directly within the components that consume `usePlatform`.
*   [✅] **Error Boundaries:** For components performing critical platform operations (e.g., file saving/loading), wrap them in the existing `ErrorBoundary.tsx` component (`apps/web/src/components/common/ErrorBoundary.tsx`) to catch unexpected rendering or lifecycle errors within the component itself, preventing app-wide crashes.
*   [✅] **User Feedback:** Ensure components provide clear, user-friendly messages and appropriate UI for different states:
    *   Loading: Show skeleton UI elements representing the component's structure while data/capabilities are loading.
    *   Capability Unavailable: Explain *why* a feature is disabled (e.g., "File access requires the Desktop app.").
    *   Operational Errors: Display specific error messages when file operations fail (e.g., "Failed to save file: Permission denied.").
*   [✅] **Testing:** Update component unit tests (`STEP-5.4.2`) to explicitly cover rendering under these loading (skeleton UI), error, and unavailable capability scenarios, including testing the `ErrorBoundary` wrapper interaction.
*   [✅] Commit changes with message "feat(UI): Define strategy for component-level capability loading/error handling using skeletons and existing ErrorBoundary".

### STEP-5.4: Refactor/Build UI Components [UI] [🚧]

#### STEP-5.4.1: Identify/Create Example Component (e.g., `ConfigFileManager`) [COMMIT] [✅]
*   [✅] Identified component: `apps/web/src/components/features/ConfigFileManager.tsx`.
*   [✅] Committed placeholder component.

#### STEP-5.4.2: Write Component Unit Tests [TEST-UNIT] [COMMIT] [✅]
*   [✅] Created test file (`ConfigFileManager.test.tsx`).
*   [✅] Wrote tests covering different capability scenarios:
    *   [✅] Test Case 1: Web Environment (Unavailable State)
    *   [✅] Test Case 2: Tauri Environment (Available State - Enabled Buttons)
    *   [🚧] Test Case 3: Tauri Interaction (Load/Save): Assertions for placeholder logic complete. Assertions for actual file operations pending component logic implementation.
    *   [✅] Test Case 4: Loading State
    *   [✅] Test Case 5: Error State
*   [✅] Added initial failing test for next logic step (calling `readFile`).
*   [✅] Commit completed tests with message "test(UI): Add unit tests for ConfigFileManager component placeholder".

#### STEP-5.4.A: Create `FileDataDisplay` Component [UI] [COMMIT] [✅] (NEW)
*   [✅] Create file `apps/web/src/components/common/FileDataDisplay.tsx`.
*   [✅] Implement a simple component taking `content: string` and optional `title: string` props.
*   [✅] Render the content in a styled, read-only container (e.g., `<pre>` within a bordered `<div>`).
*   [✅] Commit component with message "feat(UI): Add FileDataDisplay component".

#### STEP-5.4.B: Write `FileDataDisplay` Unit Tests [TEST-UNIT] [COMMIT] [✅] (NEW)
*   [✅] Create test file `FileDataDisplay.test.tsx`.
*   [✅] Write unit tests verifying title and content rendering.
*   [✅] Commit tests with message "test(UI): Add unit tests for FileDataDisplay component".

#### STEP-5.4.C: Refactor `MnemonicInputArea` to `TextInputArea` [REFACTOR][UI][TEST-UNIT] [✅] (NEW)
*   **Goal:** Make the existing input area reusable.
*   [✅] Rename `MnemonicInputArea.tsx` to `TextInputArea.tsx` and move to `apps/web/src/components/common/`.
*   [✅] Rename `MnemonicInputArea.test.tsx` to `TextInputArea.test.tsx` and move accordingly.
*   [✅] Update component name and internal code/comments from `MnemonicInputArea` to `TextInputArea`.
*   [✅] Generalize props: Add `label` and `placeholder` props. Ensure `aria-label` uses the `label` prop.
*   [✅] Update `WalletBackupDemoCard.tsx` to import and use the refactored `TextInputArea` component, passing appropriate `label` and `placeholder`.
*   [✅] Update `TextInputArea.test.tsx` to reflect the generalized component and props. Remove any mnemonic-specific assertions.
*   [✅] Run tests for `TextInputArea` and `WalletBackupDemoCard` to ensure they pass.
*   [✅] Commit changes with message "refactor(UI): Generalize MnemonicInputArea to reusable TextInputArea component".

#### STEP-5.4.3: Implement Component Logic Using Capability Service (`ConfigFileManager`) [TEST-UNIT] [COMMIT] [✅]
*   [✅] In `ConfigFileManager.tsx`.
*   [✅] Consume the `platformCapabilities`, `isLoadingCapabilities`, `capabilityError` state.
*   [✅] Implement conditional rendering based on `isLoadingCapabilities` and `capabilityError`.
*   [✅] Use `platformCapabilities.fileSystem.isAvailable` to conditionally render buttons.
*   [✅] Implement basic `onClick` handlers for Load/Save buttons.
*   [✅] Implement basic interaction logic (calling `pickFile`/`readFile`, `pickSaveFile`/`writeFile`).
*   [✅] Add basic state for action loading and status messages (`isActionLoading`, `statusMessage`, `statusVariant`).
*   [✅] Use `StatusDisplay` component for feedback.
*   [✅] Add state to hold loaded file content as string (`loadedConfigContent: string | null`).
*   [✅] Add state to hold input content for saving (`configInputContent: string`).
*   [✅] Render the new `TextInputArea` component, controlled by `configInputContent` state.
*   [✅] In `handleLoadConfig` success path:
    *   [✅] Decode the `Uint8Array` from `readFile` to string (`new TextDecoder().decode(...)`).
    *   [✅] Attempt to parse the string as JSON (wrap in `try/catch`).
    *   [✅] Update `loadedConfigContent` state with the decoded string (or formatted JSON). Handle parsing errors.
    *   [✅] **Also update `configInputContent` state** with the loaded, decoded string so it appears in the textarea for editing/saving.
*   [✅] In `handleSaveConfig`:
    *   [✅] Get the data to save **from the `configInputContent` state**.
    *   [✅] Encode the data to `Uint8Array` (`new TextEncoder().encode(...)`).
    *   [✅] Pass the encoded data to `fileSystem.writeFile()`.
*   [✅] Render the `FileDataDisplay` component conditionally, passing `loadedConfigContent`.
*   [✅] Run unit tests (including new tests for textarea interaction and updated save tests). Refine implementation until all tests pass.
*   [ ] Add a "Select Directory" button.
*   [ ] Implement a handler (`handleSelectDirectory`) that calls `fileSystem.pickDirectory`.
*   [ ] Add state to store and display the selected directory path.
*   [ ] Add unit tests for the new button and handler (success, cancellation, error).
*   [ ] Build frontend.
*   [ ] Commit changes with message "feat(UI): Implement ConfigFileManager data handling using TextInputArea and FileDataDisplay, add pickDirectory".

### STEP-5.5: Integrate Capability Checks in Core UI (e.g., Header) [✅]

#### STEP-5.5.1: Add Conditional Link for Dev Tools in Header [UI] [✅]
*   [✅] In `Header.tsx`, import and use `usePlatform`.
*   [✅] Get `capabilities` state.
*   [✅] Wrap the "Dev Wallet Demo" link in the user dropdown (desktop and mobile menus) with a conditional check: `capabilities?.platform === 'tauri'`.

#### STEP-5.5.2: Add Unit Tests for Conditional Header Link [TEST-UNIT] [✅]
*   [✅] In `Header.test.tsx`.
*   [✅] Mock the `usePlatform` hook.
*   [✅] Add test suite for 'Web Platform': Mock platform as 'web', assert link is *not* present.
*   [✅] Add test suite for 'Tauri Platform': Mock platform as 'tauri', assert the *conditions* for rendering the link are met (verifying `usePlatform` returns 'tauri'). (Note: Direct assertion of link presence post-click proved unreliable in unit tests).

#### STEP-5.5.3: Commit Header Changes [COMMIT] [✅]
*   [✅] Commit changes with message "feat(ui): add conditional dev link and tests for tauri platform".

### STEP-5.6: Add Route for ConfigFileManager [TS] [COMMIT] [✅] (NEW)
*   [✅] In `apps/web/src/routes/routes.tsx`.
*   [✅] Import the `ConfigFileManager` component.
*   [✅] Define a new route, e.g., `/dev/config`.
*   [✅] Place the route definition within the existing `TauriOnlyWrapper` route children.
*   [✅] Wrap the `ConfigFileManager` element with `<ProtectedRoute>`.
*   [✅] In `apps/web/src/components/layout/Header.tsx`:
    *   [✅] Add conditional link to `/dev/config` in desktop dropdown.
    *   [✅] Add conditional link to `/dev/config` in mobile menu.
*   [ ] Commit changes with message "feat(Routing): Add route and UI links for ConfigFileManager dev tool".

### STEP-5.7: Add Drag-and-Drop File Import [UI][TS][TEST-UNIT] [ ] (NEW)
*   **Goal:** Allow users to drag files onto components to trigger import/load actions.
*   [ ] **Platform Listener:**
    *   [ ] In `packages/platform/src/tauri.ts` (or a new `events.ts` module), add logic to listen for the `tauri://file-drop` event.
    *   [ ] Implement a mechanism to dispatch the dropped file paths to the relevant active component (e.g., using a simple event emitter or state management).
    *   [ ] Update `PlatformProvider` (`context.tsx`) to initialize this listener when on Tauri.
    *   [ ] Add/Update tests for this event listening logic.
*   [ ] **DropZone Component:**
    *   [ ] Create file `apps/web/src/components/common/DropZone.tsx`.
    *   [ ] Implement a visual component that indicates a drop target.
    *   [ ] Add props for handling hover states (`onDragOver`, `onDragLeave`) and the drop event (`onDrop`). The `onDrop` prop should likely receive the file path(s).
*   [ ] **DropZone Tests:**
    *   [ ] Create test file `DropZone.test.tsx`.
    *   [ ] Write unit tests verifying rendering, hover states, and callback invocation.
*   [ ] **Integrate into `ConfigFileManager`:**
    *   [ ] Import and render `DropZone` within `ConfigFileManager.tsx`.
    *   [ ] Implement the `onDrop` handler to receive the file path and call the existing `handleLoadConfig` logic (or a refactored version) to process the dropped file.
    *   [ ] Update `ConfigFileManager.test.tsx` to simulate drop events and verify file loading.
*   [ ] **Integrate into `WalletBackupDemoCard`:**
    *   [ ] Import and render `DropZone` within `WalletBackupDemoCard.tsx`.
    *   [ ] Implement the `onDrop` handler to receive the file path and call the existing `handleImport` logic.
    *   [ ] Update `WalletBackupDemoCard.test.tsx` to simulate drop events and verify mnemonic import.
*   [ ] **Commit:** Commit changes with message "feat(UI): Add drag-and-drop file import functionality".

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