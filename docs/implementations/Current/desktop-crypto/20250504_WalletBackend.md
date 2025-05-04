## Phase 2: Backend Integration & Feature Completion (Future Work)

**Goal:** Transition the `WalletBackupDemo` component from a placeholder demonstrating platform file I/O into a fully functional, secure wallet backup and recovery feature by integrating it with the Rust backend via Tauri commands. This involves implementing the necessary backend logic using `core-crypto` and the `storage-interface`.

**Prerequisites:**
*   Phase 1 (Placeholder Implementation) completed and verified.
*   `core-crypto` crate implemented and tested (as per `docs/implementations/Current/desktop-crypto/genesis/4. implementation/20250426_crypto_core.md`).
*   `storage-interface` crate defined with the `SecureStorage` trait for secure seed storage (see Task [2.2] below).
*   Tauri setup allowing command definitions and invocation.

**Tasks:**

*   **[2.1] Define Tauri Commands [✅]:**
    *   [✅] Define a Tauri command (e.g., `import_mnemonic`) that accepts a mnemonic phrase string.
        *   Responsibility: Validate the mnemonic, derive the master seed (using `core-crypto`), securely store the seed (using `storage-interface`), and return success/failure or potentially basic wallet info.
    *   [✅] Define a Tauri command (e.g., `export_mnemonic`) that requires authentication/authorization.
        *   Responsibility: Securely retrieve the master seed (from `storage-interface`), potentially re-derive the mnemonic if only the seed is stored (using `core-crypto`), and return the mnemonic string. Requires careful security considerations.
    *   [✅] Define command signatures (arguments, return types) including robust error types.
    *   [✅] Document these commands (e.g., in `docs/architecture/tauri_bridge.md` or similar).

*   **[2.2] Implement Rust Backend Logic [🚧]:**
    *   [✅] Create `apps/windows/src-tauri/src/wallet_commands.rs` file with error types and command stubs.
    *   [✅] Register commands in `apps/windows/src-tauri/src/main.rs` handler.
    *   [✅] Add necessary dependencies (`thiserror`) to `apps/windows/src-tauri/Cargo.toml`.
    *   [✅] **Define `storage-interface`:**
        *   [✅] Create new crate `apps/windows/src-tauri/crates/storage-interface`.
        *   [✅] Define `StorageError` enum in `storage-interface/src/lib.rs`.
        *   [✅] Define `SecureStorage` trait (with `store_mnemonic`, `retrieve_mnemonic`, `store_seed`, `retrieve_seed`) in `storage-interface/src/lib.rs`.
    *   [✅] **Update `core-crypto`:**
        *   [✅] Add `bip39` dependency to `core-crypto/Cargo.toml`.
        *   [✅] Implement and expose mnemonic helper functions (`validate_mnemonic`, `mnemonic_to_seed`) in `core-crypto/src/lib.rs`. (Removed `seed_to_mnemonic`).
    *   [✅] **Implement Command Handlers** within the `wallet_commands` module:
        *   [✅] Implement the `import_mnemonic` command handler:
            *   [✅] Use `core-crypto::validate_mnemonic` for format/checksum check.
            *   [✅] Use `core-crypto::mnemonic_to_seed` to derive the master seed.
            *   [✅] Use the `SecureStorage` trait (via Tauri state and mock) to securely store the phrase and derived master seed.
            *   [✅] Implement robust error handling (mapping internal errors to `MnemonicImportError`).
        *   [✅] Implement the `export_mnemonic` command handler:
            *   [✅] Implement necessary security checks (placeholder for now).
            *   [✅] Use the `SecureStorage` trait (via Tauri state and mock) to retrieve the securely stored mnemonic phrase.
            *   [✅] Implement robust error handling (mapping internal errors to `MnemonicExportError`).
    *   [✅] Add unit tests for these backend handlers, mocking `storage-interface` (`SecureStorage` trait) and `core-crypto` where necessary. Added `tokio` dev dependency.
    *   [✅] **Fix Build Issues:** Resolved Tauri v2 plugin dependency conflicts and capability registration errors (`Permission opener:default not found`) by upgrading Tauri versions, adding `build.rs`, `.setup()` hook, and ensuring correct capability definition/window labeling.
    *   [ ] [COMMIT] Commit `storage-interface`, `core-crypto` updates, backend command handlers, tests, and build fixes with message "feat(Backend): Implement Tauri commands for mnemonic import/export and fix build issues".

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
        *   Frontend UI -> Tauri Command Invocation -> Rust Handler Execution (`core-crypto` + `storage-interface` interaction) -> Frontend UI Update.
    *   [ ] Test handling of backend errors propagated to the frontend.
    *   [ ] Test security checks during export.

This phase transforms the demo into a core application feature, bridging the frontend UI with the secure backend cryptographic and storage logic. 