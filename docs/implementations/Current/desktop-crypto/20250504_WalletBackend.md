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

*   **[✅] Integrate Backend Calls into Frontend:**
    *   [✅] Modify `WalletBackupDemoCard.tsx` (kept name for now).
    *   [✅] Import the `invoke` function from `@tauri-apps/api/core` (and installed the package).
    *   [✅] Update `importMnemonicFile` (within the component):
        *   [✅] After reading the mnemonic string from the file, call `invoke('import_mnemonic', { mnemonic: importedString })`.
        *   [✅] Handle the Promise result: Update UI based on success or specific errors returned from the backend.
    *   [✅] Update `handleExport`:
        *   [✅] Call `invoke('export_mnemonic')` to retrieve the mnemonic string from the backend.
        *   [✅] Handle the Promise result: If successful, proceed with `pickSaveFile` and `writeFile` using the *retrieved* mnemonic. Update UI based on success or errors.
    *   [✅] Remove direct setting of mnemonic state from file read; the source of truth for export is now the backend (kept local state for display only).
    *   [✅] Adapt loading/error states to reflect Tauri command invocation.
    *   [✅] Update `WalletBackupDemoCard.test.tsx` to mock `invoke` and verify new flows.
    *   [ ] [COMMIT] Commit frontend integration of Tauri commands and test updates with message "feat(UI): Integrate Tauri commands into WalletBackupDemoCard" and "test(UI): Update WalletBackupDemoCard tests to mock invoke".

*   **[2.4] Enhance Security, Reliability & UX:**
    *   **[2.4.1] Authentication & Authorization Strategy (Security):**
        *   [ ] **Define Mechanism:** Determine and document the chosen authentication method required *before* executing the `export_mnemonic` command. Evaluate options:
            *   Simple Password Prompt (UI-driven, requires secure handling if sent to backend).
            *   OS-level Authentication Hook (Leveraging platform features via Tauri/plugins).
            *   Master Password/PIN stored securely (Requires robust *local* secure storage).
            *   Supabase Re-authentication (Requires secure frontend -> Supabase -> frontend -> Tauri command flow, adds network dependency).
        *   [ ] **Implement Placeholder:** Add necessary UI elements (e.g., password input, auth button) as placeholders for the chosen mechanism. Disable export functionality until authentication is successful (deferring full backend integration of the check).
        *   [ ] **Security Review:** Document potential attack vectors related to export (e.g., shoulder surfing, malware interception) and how the chosen strategy mitigates them.
    *   **[2.4.2] Robust Error Handling & Feedback (Reliability, UX):**
        *   [ ] **Map Backend Errors:** Explicitly map every defined Rust error variant (`MnemonicImportError`, `MnemonicExportError`, anticipated `StorageError` variants) to distinct, clear, user-friendly messages in the frontend `StatusDisplay`.
        *   [ ] **Differentiate Error Sources:** Ensure UI messages clearly distinguish between frontend validation, file I/O, backend crypto, backend storage, and Tauri communication errors.
        *   [ ] **Consistent Loading States:** Verify `isActionLoading` accurately reflects the entire duration of async operations (invoke + file system). Prevent race conditions.
        *   [ ] **Granular Status Updates:** Implement finer-grained status messages during longer operations (e.g., "Validating...", "Storing...", "Retrieving...", "Saving...").
    *   **[2.4.3] Improve UX Workflow (UX, Safety):**
        *   [ ] **Clear Intent:** Review button labels, placeholder texts, and info messages for clarity.
        *   [ ] **Confirmation Dialogs (Optional):** Consider confirmation (`dialog.ask`) before potential overwrites (like import). *Decision: Assess necessity.*
        *   [ ] **Accessibility Review:** Perform basic accessibility check (keyboard nav, focus, ARIA) for new UI elements.
    *   **[2.4.4] Design for Extensibility & Modularity (Modularity, Extensibility):**
        *   [ ] **Single Wallet Limitation:** Explicitly document the current single-wallet assumption.
        *   [ ] **Multi-Wallet Considerations:** Outline design changes needed for future multi-wallet support.
        *   [ ] **Component Refactoring Review:** Assess if `WalletBackupDemoCard.tsx` needs refactoring due to increased complexity.
    *   **[2.4.5] Plan Secure Storage Implementation (Security, Reliability):**
        *   [ ] **Strategy Definition:** Research and decide on the specific mechanism for the *real* `SecureStorage` trait implementation (replacing mock). **Decision: DO NOT use Supabase DB for mnemonic storage.** Focus on *local* secure storage:
            *   OS Keychain/Keystore (via `keyring-rs` crate or dedicated Tauri plugin like `tauri-plugin-stronghold` [if mature]).
            *   Filesystem encryption (using Rust crypto, requires robust key management derived from user password/PIN).
        *   [ ] **Document Tradeoffs:** Analyze security/usability tradeoffs of the chosen *local* storage approach.
        *   [ ] **Define Dependencies:** List necessary crates/plugins for the chosen implementation.
        *   *(Note: Actual implementation deferred to a later task/phase, this is planning).*
    *   [ ] **[COMMIT]** Commit enhancements with message "refactor(UI/Plan): Enhance security, reliability, and UX plan for WalletBackupDemoCard".

*   **[2.5] Integration Testing:**
    *   [ ] Write integration tests (potentially using Tauri's testing utilities or manual E2E tests initially) covering the full import/export flows:
        *   Frontend UI -> Tauri Command Invocation -> Rust Handler Execution (`core-crypto` + *mock* `storage-interface` interaction initially) -> Frontend UI Update.
    *   [ ] Test handling of backend errors propagated to the frontend.
    *   [ ] Test security checks during export (once implemented).

This phase transforms the demo into a core application feature, bridging the frontend UI with the secure backend cryptographic and storage logic. 