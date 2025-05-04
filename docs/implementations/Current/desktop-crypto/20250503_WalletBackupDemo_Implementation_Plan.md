# Implementation Plan: WalletBackupDemo Component

**Goal:** Implement a demonstration UI component (`WalletBackupDemo`) to showcase the integration of the Platform Capability Abstraction Layer (`@paynless/platform`) for essential file system operations (reading, writing, picking files/save locations) within the context of a core application need: mnemonic phrase backup and recovery. This component will serve as a pattern for integrating platform capabilities into other features while adhering to the project's layered architecture and security principles.

**Scope:** This plan focuses *solely* on the frontend implementation of the `WalletBackupDemo` component and its interaction with the `@paynless/platform` service. It **explicitly excludes** the implementation of any cryptographic validation, seed derivation, or secure storage logic; those functionalities belong in the Rust backend (`core-crypto`, `storage-layer`) and will be accessed via Tauri bridge commands in production components.

## Guiding Principles

*   **Clear Demonstration:** The component should clearly illustrate the use of `usePlatform` hook and the relevant `fileSystem` capabilities (`pickFile`, `readFile`, `pickSaveFile`, `writeFile`).
*   **Layered Architecture Adherence:** The component interacts only with the platform abstraction layer, not directly with Tauri APIs or backend crypto logic.
*   **User Experience:** Provide clear feedback to the user during operations (loading states using skeletons, success messages, informative error messages). Handle user cancellation gracefully.
*   **Safety:** Utilize platform dialogs for user confirmation of file read/write locations. Use `ErrorBoundary` for robustness.
*   **Maintainability:** Keep the component focused and well-structured.

## Implementation Plan

**Phase 1: WalletBackupDemo Component Implementation**

*   **[1.1] Component Setup & Structure:**
    *   [ ] Create the component file: `apps/web/src/components/demos/WalletBackupDemo.tsx` (or similar appropriate location).
    *   [ ] Create the corresponding unit test file: `apps/web/src/components/demos/WalletBackupDemo.test.tsx`.
    *   [ ] Define basic component structure (e.g., using `React.FC`).
    *   [ ] Add the component to a relevant storybook or development page for easy visualization.
    *   [ ] [COMMIT] Commit initial component shell with message "feat(UI): Add initial WalletBackupDemo component structure".

*   **[1.2] UI Element Implementation:**
    *   [ ] Add a `TextArea` component (e.g., from `@/components/ui/textarea`) for displaying/entering the mnemonic phrase.
    *   [ ] Add state management (e.g., `useState`) to hold the mnemonic string displayed in the text area.
    *   [ ] Add an "Import Mnemonic from File" `Button` component.
    *   [ ] Add an "Export Mnemonic to File" `Button` component.
    *   [ ] Add designated areas (e.g., using `Alert` components or simple text) to display status messages (loading, success, error).
    *   [ ] Implement basic skeleton UI elements to be shown during loading states.
    *   [ ] [COMMIT] Commit UI elements with message "feat(UI): Implement basic UI elements for WalletBackupDemo".

*   **[1.3] Integrate Platform Capabilities:**
    *   [ ] Import and use the `usePlatform` hook from `@paynless/platform` within the component.
    *   [ ] Add component state to track loading status (e.g., `isLoading: boolean`, `isImporting: boolean`, `isExporting: boolean`) and error messages (`error: string | null`).
    *   [ ] Conditionally render UI elements based on `platformCapabilities.fileSystem.isAvailable`:
        *   [ ] Disable "Import" and "Export" buttons if `isAvailable` is false.
        *   [ ] Show an informative message if `isAvailable` is false (e.g., "File operations require the Desktop app.").
    *   [ ] Display skeleton UI if `isLoadingCapabilities` from `usePlatform` is true.
    *   [ ] [COMMIT] Commit platform hook integration and conditional rendering with message "feat(UI): Integrate usePlatform hook into WalletBackupDemo".

*   **[1.4] Implement Import Functionality:**
    *   [ ] Create an `async` function `handleImport`.
    *   [ ] Add an `onClick` handler to the "Import" button that calls `handleImport`.
    *   [ ] Inside `handleImport`:
        *   [ ] Set loading state (`isImporting = true`), clear previous errors.
        *   [ ] Check `platformCapabilities.fileSystem.isAvailable` (type guard). Return early if false.
        *   [ ] Call `platformCapabilities.fileSystem.pickFile({ accept: '.txt', multiple: false })`.
        *   [ ] Handle potential errors from `pickFile` (e.g., user cancellation, platform error) and update error state.
        *   [ ] If a file path (`string[]`) is returned and not empty/null:
            *   [ ] Call `platformCapabilities.fileSystem.readFile(filePath[0])`.
            *   [ ] Handle potential errors from `readFile`.
            *   [ ] If `readFile` succeeds (returns `Uint8Array`):
                *   [ ] Convert the `Uint8Array` to a string (e.g., using `TextDecoder`).
                *   [ ] Update the component's mnemonic state with the string content.
                *   [ ] Display a success message.
            *   [ ] Catch any exceptions during the process, update error state.
        *   [ ] Finally, set loading state (`isImporting = false`).
    *   [ ] [COMMIT] Commit import functionality with message "feat(UI): Implement mnemonic import functionality in WalletBackupDemo".

*   **[1.5] Implement Export Functionality:**
    *   [ ] Create an `async` function `handleExport`.
    *   [ ] Add an `onClick` handler to the "Export" button that calls `handleExport`.
    *   [ ] Inside `handleExport`:
        *   [ ] Set loading state (`isExporting = true`), clear previous errors.
        *   [ ] Get the current mnemonic string from component state. Handle case where it's empty.
        *   [ ] Check `platformCapabilities.fileSystem.isAvailable` (type guard). Return early if false.
        *   [ ] Call `platformCapabilities.fileSystem.pickSaveFile({ defaultPath: 'wallet-backup.txt' })`.
        *   [ ] Handle potential errors from `pickSaveFile` (e.g., user cancellation, platform error) and update error state.
        *   [ ] If a save path (`string`) is returned and not null:
            *   [ ] Convert the mnemonic string to `Uint8Array` (e.g., using `TextEncoder`).
            *   [ ] Call `platformCapabilities.fileSystem.writeFile(savePath, data)`.
            *   [ ] Handle potential errors from `writeFile`.
            *   [ ] If `writeFile` succeeds, display a success message.
            *   [ ] Catch any exceptions during the process, update error state.
        *   [ ] Finally, set loading state (`isExporting = false`).
    *   [ ] [COMMIT] Commit export functionality with message "feat(UI): Implement mnemonic export functionality in WalletBackupDemo".

*   **[1.6] Implement State Handling & Feedback:**
    *   [ ] Ensure loading states correctly display skeleton UI or loading indicators within buttons.
    *   [ ] Ensure error messages are clearly displayed when errors occur during import/export or if capabilities are unavailable.
    *   [ ] Ensure success messages are displayed appropriately.
    *   [ ] Clear error/success messages when a new operation starts.
    *   [ ] Wrap the core component logic/return statement in the existing `ErrorBoundary` component (`apps/web/src/components/common/ErrorBoundary.tsx`) to catch unexpected runtime errors.
    *   [ ] [COMMIT] Commit refined state handling and feedback with message "refactor(UI): Improve state handling and feedback in WalletBackupDemo".

*   **[1.7] Unit Testing:**
    *   [ ] In `WalletBackupDemo.test.tsx`.
    *   [ ] Mock the `usePlatform` hook.
    *   [ ] Write tests covering various scenarios:
        *   [ ] Rendering correctly when capabilities are loading (`isLoadingCapabilities: true`).
        *   [ ] Rendering correctly when capabilities are unavailable (`fileSystem: { isAvailable: false }`). Buttons disabled, message shown.
        *   [ ] Rendering correctly when capabilities are available (`fileSystem: { isAvailable: true, ...mocks }`). Buttons enabled.
        *   [ ] Simulating "Import" click:
            *   Verify `pickFile` is called.
            *   Test handling of `pickFile` returning null (cancellation).
            *   Test handling of `pickFile` returning a path, verify `readFile` is called.
            *   Test handling of `readFile` error.
            *   Test successful import: verify mnemonic state is updated, success message shown.
            *   Verify loading/skeleton states during import.
        *   [ ] Simulating "Export" click:
            *   Verify `pickSaveFile` is called.
            *   Test handling of `pickSaveFile` returning null (cancellation).
            *   Test handling of `pickSaveFile` returning a path, verify `writeFile` is called with correct data.
            *   Test handling of `writeFile` error.
            *   Test successful export: verify success message shown.
            *   Verify loading/skeleton states during export.
        *   [ ] Test error message display for different failure points.
        *   [ ] Test interaction with the `ErrorBoundary` wrapper (if possible to simulate).
    *   [ ] Ensure all tests pass.
    *   [ ] [COMMIT] Commit unit tests with message "test(UI): Add unit tests for WalletBackupDemo".

*   **[1.8] Manual Verification:**
    *   [ ] Run the application in a web browser. Verify the component displays the "unavailable" state correctly.
    *   [ ] Run the application in Tauri (`pnpm --filter desktop tauri dev`).
    *   [ ] Verify the component displays the "available" state correctly (buttons enabled).
    *   [ ] Test the Import flow: Select a text file, verify content appears in the text area. Test cancellation.
    *   [ ] Test the Export flow: Enter text, click export, save the file. Verify the file contains the entered text. Test cancellation.
    *   [ ] Test error conditions (e.g., try importing a binary file if possible, attempt to save to a restricted location if possible - though platform dialogs might prevent this).
    *   [ ] Document verification results.

This completes the implementation of the `WalletBackupDemo` component placeholder. 

---

## Phase 2: Backend Integration & Feature Completion (Future Work)

**Goal:** Transition the `WalletBackupDemo` component from a placeholder demonstrating platform file I/O into a fully functional, secure wallet backup and recovery feature by integrating it with the Rust backend via Tauri commands. This involves implementing the necessary backend logic using `core-crypto` and the `storage-layer` interface.

**Prerequisites:**
*   Phase 1 (Placeholder Implementation) completed and verified.
*   `core-crypto` crate implemented and tested (as per `docs/implementations/Current/desktop-crypto/genesis/4. implementation/20250426_crypto_core.md`).
*   `storage-layer` crate defined with interfaces for secure seed storage (even if initial implementation uses less secure fallback).
*   Tauri setup allowing command definitions and invocation.

**Tasks:**

*   **[2.1] Define Tauri Commands:**
    *   [ ] Define a Tauri command (e.g., `import_mnemonic`) that accepts a mnemonic phrase string.
        *   Responsibility: Validate the mnemonic, derive the master seed (using `core-crypto`), securely store the seed (using `storage-layer`), and return success/failure or potentially basic wallet info.
    *   [ ] Define a Tauri command (e.g., `export_mnemonic`) that requires authentication/authorization.
        *   Responsibility: Securely retrieve the master seed (from `storage-layer`), potentially re-derive the mnemonic if only the seed is stored (using `core-crypto`), and return the mnemonic string. Requires careful security considerations.
    *   [ ] Define command signatures (arguments, return types) including robust error types.
    *   [ ] Document these commands (e.g., in `tauri-bridge.md` or similar).

*   **[2.2] Implement Rust Backend Logic:**
    *   [ ] Within the appropriate Rust backend module (e.g., `storage-layer`, `wallet-manager`, or directly in `tauri-bridge` handlers if simple):
        *   [ ] Implement the `import_mnemonic` command handler:
            *   [ ] Use `core-crypto` to validate the mnemonic phrase format and checksum.
            *   [ ] Use `core-crypto` (BIP-39 logic) to derive the master seed from the validated mnemonic.
            *   [ ] Call the `storage-layer` interface function to securely store the derived master seed.
            *   [ ] Implement robust error handling (invalid mnemonic, storage failure).
        *   [ ] Implement the `export_mnemonic` command handler:
            *   [ ] Implement necessary security checks (e.g., password confirmation, device attestation - depends on security model).
            *   [ ] Call the `storage-layer` interface function to retrieve the securely stored master seed.
            *   [ ] If only the seed is stored, use `core-crypto` (BIP-39 logic) to convert the seed back to a mnemonic phrase.
            *   [ ] Implement robust error handling (retrieval failure, derivation failure, security check failure).
    *   [ ] Add unit tests for these backend handlers, mocking `storage-layer` and `core-crypto` where necessary.
    *   [ ] [COMMIT] Commit backend command handlers and tests with message "feat(Backend): Implement Tauri commands for mnemonic import/export".

*   **[2.3] Integrate Backend Calls into Frontend:**
    *   [ ] Modify `WalletBackupDemo.tsx` (or rename/refactor to `WalletManager.tsx`).
    *   [ ] Import the `invoke` function from `@tauri-apps/api/core`.
    *   [ ] Update `handleImport`:
        *   [ ] After reading the mnemonic string from the file, instead of just setting state, call `invoke('import_mnemonic', { mnemonic: importedString })`.
        *   [ ] Handle the Promise result: Update UI based on success or specific errors returned from the backend (e.g., "Invalid Mnemonic", "Storage Failed").
    *   [ ] Update `handleExport`:
        *   [ ] Instead of reading the mnemonic from the text area, call `invoke('export_mnemonic')`.
        *   [ ] Handle the Promise result: If successful (returns mnemonic string), proceed with `pickSaveFile` and `writeFile` using the *retrieved* mnemonic. Update UI based on success or errors (e.g., "Authentication Failed", "Failed to retrieve seed").
    *   [ ] Remove direct setting of mnemonic state from file read; the source of truth for export is now the backend.
    *   [ ] Adapt loading/error states to reflect Tauri command invocation.
    *   [ ] [COMMIT] Commit frontend integration of Tauri commands with message "feat(UI): Integrate Tauri commands into WalletBackupDemo for import/export".

*   **[2.4] Enhance Security & UX:**
    *   [ ] Implement necessary UI elements for security checks during export (e.g., password confirmation dialog).
    *   [ ] Provide clearer user feedback differentiating file I/O errors from backend cryptographic/storage errors.
    *   [ ] Consider UI implications if multiple wallets/identities are supported in the future.
    *   [ ] Review and refine the overall workflow for security and usability.

*   **[2.5] Integration Testing:**
    *   [ ] Write integration tests (potentially using Tauri's testing utilities or manual E2E tests initially) covering the full import/export flows:
        *   Frontend UI -> Tauri Command Invocation -> Rust Handler Execution (`core-crypto` + `storage-layer` interaction) -> Frontend UI Update.
    *   [ ] Test handling of backend errors propagated to the frontend.
    *   [ ] Test security checks during export.

This phase transforms the demo into a core application feature, bridging the frontend UI with the secure backend cryptographic and storage logic. 