# Implementation Plan: WalletBackupDemo Component

**Goal:** Implement a demonstration UI component (`WalletBackupDemoCard` and its sub-components) to showcase the integration of the Platform Capability Abstraction Layer (`@paynless/platform`) for essential file system operations (reading, writing, picking files/save locations) within the context of a core application need: mnemonic phrase backup and recovery. This component will serve as a pattern for integrating platform capabilities into other features while adhering to the project's layered architecture and security principles.

**Scope:** This plan focuses *solely* on the frontend implementation of the `WalletBackupDemoCard` and its sub-components (`MnemonicInputArea`, `FileActionButtons`, `StatusDisplay`) and their interaction with the `@paynless/platform` service. It **explicitly excludes** the implementation of any cryptographic validation, seed derivation, or secure storage logic; those functionalities belong in the Rust backend (`core-crypto`, `storage-layer`) and will be accessed via Tauri bridge commands in production components.

## Guiding Principles

*   **Clear Demonstration:** The component should clearly illustrate the use of `usePlatform` hook and the relevant `fileSystem` capabilities (`pickFile`, `readFile`, `pickSaveFile`, `writeFile`).
*   **Layered Architecture Adherence:** The component interacts only with the platform abstraction layer, not directly with Tauri APIs or backend crypto logic.
*   **Component Structure:** Follow project conventions by breaking the feature into smaller, focused sub-components orchestrated by a container card.
*   **User Experience:** Provide clear feedback to the user during operations (loading states using skeletons, success messages, informative error messages). Handle user cancellation gracefully.
*   **Safety:** Utilize platform dialogs for user confirmation of file read/write locations. Use `ErrorBoundary` for robustness.
*   **Maintainability:** Keep components focused and well-structured.

## Implementation Plan

**Phase 1: WalletBackupDemo Component Implementation**

*   **[1.1] Component Setup & Structure:**
    *   [X] Create the main container component file: `apps/web/src/components/demos/WalletBackupDemo/WalletBackupDemoCard.tsx`.
    *   [X] Create the corresponding unit test file: `apps/web/src/components/demos/WalletBackupDemo/WalletBackupDemoCard.test.tsx`.
    *   [X] Define basic component structure for `WalletBackupDemoCard`.
    *   [X] Update tests for TDD: Add failing tests for loading, unavailable, and available states.
    *   [ ] Add the `WalletBackupDemoCard` component to a relevant storybook or development page for easy visualization.
    *   [C] [COMMIT] Commit initial card component structure and tests with message "feat(UI): Add initial WalletBackupDemoCard structure and tests".

*   **[1.2] UI Element Implementation (Sub-Components):**
    *   [X] Create the `MnemonicInputArea.tsx` sub-component file with `Textarea` and props (`value`, `onChange`, `disabled`).
    *   [X] Create the `FileActionButtons.tsx` sub-component file with Import/Export `Button`s and props (`onImport`, `onExport`, `disabled`, `isExportDisabled`, `isLoading`).
    *   [X] Create the `StatusDisplay.tsx` sub-component file with `Alert` for displaying status/error messages and props (`message`, `variant`).
    *   [C] [COMMIT] Commit sub-component implementations with message "feat(UI): Implement WalletBackupDemo sub-components (MnemonicInputArea, FileActionButtons, StatusDisplay)".

*   **[1.3] Integrate Platform Capabilities & Sub-Components:**
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Import and use the `usePlatform` hook.
        *   [X] Add state management (e.g., `useState`) for `mnemonic`, `statusMessage`, `statusVariant`, `isActionLoading`.
        *   [X] Implement logic to determine `isFileSystemAvailable` and `isDisabled` based on hook results and action state.
        *   [X] Implement conditional rendering for loading state (using `Skeleton` components).
        *   [X] Implement conditional rendering for capability error state.
        *   [X] Implement conditional rendering for unavailable state (showing message).
        *   [X] Render the sub-components (`MnemonicInputArea`, `FileActionButtons`, `StatusDisplay`), passing the necessary state and handlers (placeholder handlers for now) as props.
        *   [X] Wrap the main content in the `ErrorBoundary` component.
    *   [X] Update tests for loading state in `WalletBackupDemoCard.test.tsx` to assert skeleton presence.
    *   [X] Verify tests for loading, unavailable, and available states pass.
    *   [X] [COMMIT] Commit platform hook integration and sub-component rendering in WalletBackupDemoCard with message "feat(UI): Integrate usePlatform and sub-components into WalletBackupDemoCard".

*   **[1.4] Implement Import Functionality:**
    *   [X] In `WalletBackupDemoCard.test.tsx`:
        *   [X] Add tests for the import workflow:
            *   [X] Mock `platformCapabilities.fileSystem.pickFile` to return null (user cancel).
            *   [X] Simulate Import button click, verify no state change / appropriate status.
            *   [X] Mock `pickFile` to return a file path.
            *   [X] Mock `platformCapabilities.fileSystem.readFile` to throw an error.
            *   [X] Simulate Import click, verify loading state, verify `pickFile` and `readFile` called, verify error status displayed.
            *   [X] Mock `readFile` to return valid mnemonic data (`Uint8Array`).
            *   [X] Simulate Import click, verify loading state, verify `pickFile` and `readFile` called, verify `mnemonic` state updated, verify success status displayed.
            *   [X] Add test for invalid mnemonic format (e.g., < 12 words).
            *   [X] Add test for platform hook returning `capabilityError`.
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Implement the `async handleImport` function:
            *   [X] Set `isActionLoading` to true, clear status message.
            *   [X] Perform `isAvailable` check.
            *   [X] Call `platformCapabilities.fileSystem.pickFile`. Handle null return.
            *   [X] Call `platformCapabilities.fileSystem.readFile`. Handle errors.
            *   [X] Convert result using `TextDecoder`, update `mnemonic` state via `setMnemonic`.
            *   [X] Add basic validation for mnemonic format.
            *   [X] Set success/error status message and variant via `setStatusMessage`/`setStatusVariant`.
            *   [X] Set `isActionLoading` to false in a `finally` block.
        *   [X] Pass `handleImport` to `FileActionButtons` component.
        *   [X] Implement rendering logic for `capabilityError` state.
    *   [X] Verify all import tests pass.
    *   [X] [COMMIT] Commit import functionality and tests with message "feat(UI): Implement mnemonic import functionality in WalletBackupDemoCard".

*   **[1.5] Implement Export Functionality:**
    *   [X] In `WalletBackupDemoCard.test.tsx`:
        *   [X] Add tests for the export workflow (similar structure to import tests, mocking `pickSaveFile` and `writeFile`).
    *   [X] In `WalletBackupDemoCard.tsx`:
        *   [X] Implement the `async handleExport` function:
            *   [X] Set `isActionLoading` to true, clear status message.
            *   [X] Get current `mnemonic` from state. Handle empty case.
            *   [X] Perform `isAvailable` check.
            *   [X] Call `platformCapabilities.fileSystem.pickSaveFile`. Handle null return.
            *   [X] Convert mnemonic string to `Uint8Array` using `TextEncoder`.
            *   [X] Call `platformCapabilities.fileSystem.writeFile`. Handle errors.
            *   [X] Set success/error status message and variant.
            *   [X] Set `isActionLoading` to false in `finally` block.
        *   [X] Pass `handleExport` to `FileActionButtons` component.
    *   [X] Verify all export tests pass.
    *   [ ] [COMMIT] Commit export functionality and tests with message "feat(UI): Implement mnemonic export functionality in WalletBackupDemoCard".

*   **[1.6] Refine State Handling & Feedback (Covered by 1.4 & 1.5):**
    *   *Note: State handling (loading, error, success) is implemented directly within the import/export steps.*
    *   *Note: ErrorBoundary wrapping was done in Step 1.3.*

*   **[1.7] Unit Testing (Covered by 1.4 & 1.5):**
    *   *Note: Unit tests are added incrementally alongside the functionality in steps 1.4 and 1.5.*

*   **[1.8] Manual Verification:**
    *   [ ] Run the application in a web browser. Verify the component displays the "unavailable" state correctly.
    *   [ ] Run the application in Tauri (`pnpm --filter desktop tauri dev`).
    *   [ ] Verify the component displays the "available" state correctly (buttons enabled).
    *   [ ] Test the Import flow: Select a text file, verify content appears in the text area. Test cancellation. Verify loading/success/error states.
    *   [ ] Test the Export flow: Enter text, click export, save the file. Verify the file contains the entered text. Test cancellation. Verify loading/success/error states.
    *   [ ] Document verification results.
    *   [ ] [COMMIT] Commit manual verification results/fixes with message "test(UI): Manual verification of WalletBackupDemoCard functionality".

This completes the implementation of the `WalletBackupDemo` component placeholder using a structured approach.

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