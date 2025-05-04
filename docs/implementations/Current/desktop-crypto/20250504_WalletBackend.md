
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