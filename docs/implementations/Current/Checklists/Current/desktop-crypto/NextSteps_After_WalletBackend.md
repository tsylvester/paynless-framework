# Next Steps After WalletBackend Implementation

**Context:** This document outlines the next logical development phases and tasks following the completion of the `20250504_WalletBackend.md` plan. That plan established the foundational `WalletBackupDemoCard` UI component and integrated it with the Rust backend via Tauri commands (`import_mnemonic`, `export_mnemonic`) using `core-crypto` for basic validation/derivation and a `MockSecureStorage` implementation.

**Goal:** To build upon this foundation towards the broader goals of the decentralized content distribution system, focusing on making the wallet functional and preparing for blockchain and P2P integration as outlined in the overall project synthesis and implementation plans (`docs/implementations/Current/desktop-crypto/genesis/3. synthesis/`, `docs/implementations/Current/desktop-crypto/documentation/IMPLEMENTATION_PLAN.md`).

## Immediate Priorities (Building on WalletBackend Phase)

These tasks directly follow from the work completed and address immediate needs for a functional local wallet.

1.  **Implement Real Secure Storage (Ref: `IMPLEMENTATION_PLAN.md` Phase 1 - `storage-layer` / `20250504_WalletBackend.md` Task 2.4.5):**
    *   **Objective:** Replace the `MockSecureStorage` with a production-ready implementation of the `SecureStorage` trait defined in the `storage-interface` crate.
    *   **Tasks:**
        *   [ ] Finalize the decision on the local secure storage mechanism (OS Keychain/Keystore via `keyring-rs` or plugin, or Filesystem encryption).
        *   [ ] Implement the chosen `SecureStorage` provider crate/module.
        *   [ ] Integrate the real provider into the Tauri application state in `main.rs`, replacing the `MockSecureStorage` instance.
        *   [ ] Update relevant unit tests in `wallet_commands.rs` to potentially test interaction with the real storage interface (might require conditional compilation or feature flags if testing directly against OS keychains is difficult in CI).
        *   [ ] Update `storage-interface` documentation if necessary.
    *   **Rationale:** This is critical for actual persistence and security of the user's mnemonic/seed, moving beyond the demo stage.

2.  **Implement Export Authentication Placeholder (Ref: `20250504_WalletBackend.md` Task 2.4.1):**
    *   **Objective:** Add the placeholder UI flow for authorizing the export operation, deferring the final mechanism.
    *   **Tasks:**
        *   [ ] Implement a simple password input dialog in `WalletBackupDemoCard.tsx` triggered on export click.
        *   [ ] Temporarily allow export to proceed after dialog confirmation (no real validation).
        *   [ ] Update frontend tests (`WalletBackupDemoCard.test.tsx`) to cover this new dialog flow.
    *   **Rationale:** Establishes the required security checkpoint in the UX, even if the underlying mechanism is implemented later (Task 2.4.6).

3.  **Refine Error Handling & Feedback (Ref: `20250504_WalletBackend.md` Task 2.4.2):**
    *   **Objective:** Make error messages more user-friendly and informative.
    *   **Tasks:**
        *   [ ] Review `MnemonicImportError` and `MnemonicExportError` variants in Rust.
        *   [ ] Define clear, user-facing messages for each potential error (including anticipated storage errors from the real implementation) in `WalletBackupDemoCard.tsx`.
        *   [ ] Ensure UI distinguishes between different error sources (validation, file I/O, storage, etc.).
        *   [ ] Update frontend tests to assert specific error messages are shown.
    *   **Rationale:** Improves usability and helps users diagnose problems.

4.  **Initial Integration Testing (Ref: `20250504_WalletBackend.md` Task 2.5):**
    *   **Objective:** Verify the end-to-end flow from UI to the Rust backend command handlers, using the (still mock, then real) storage layer.
    *   **Tasks:**
        *   [ ] Set up initial integration testing framework (e.g., using Rust's `tests/` directory structure, potentially leveraging Tauri utilities if available/suitable).
        *   [ ] Write tests covering successful import and export flows, interacting with the Tauri command handlers directly.
        *   [ ] Write tests verifying the propagation of specific backend errors to the caller.
    *   **Rationale:** Ensures the Tauri bridge and command handling work correctly before adding more complex integrations.

## Subsequent Phases (Towards Broader Project Goals)

Once the local wallet functionality is robust and secure, development should progress towards the goals outlined in the main synthesis/implementation plans, likely starting with:

5.  **Blockchain Integration (Ref: `IMPLEMENTATION_PLAN.md` Phase 1 - `blockchain-adapter`):**
    *   **Objective:** Enable the wallet to interact with the chosen blockchain.
    *   **Tasks (High-Level):**
        *   [ ] Implement the `blockchain-adapter` module based on the chosen blockchain technology (Phase 0 decision).
        *   [ ] Integrate key derivation from `core-crypto` to generate blockchain-compatible keys/addresses.
        *   [ ] Add Tauri commands for basic blockchain interactions (e.g., `get_address`, `get_balance`, `sign_transaction`).
        *   [ ] Update UI to display address/balance.

6.  **P2P Network Foundation (Ref: `IMPLEMENTATION_PLAN.md` Phase 1 - `p2p-network`):**
    *   **Objective:** Establish basic P2P connectivity.
    *   **Tasks (High-Level):**
        *   [ ] Implement the `p2p-network` module using `libp2p`.
        *   [ ] Implement basic peer discovery (e.g., bootstrap nodes, mDNS).
        *   [ ] Add Tauri commands/events for managing P2P status.

7.  **Finalize Export Authentication (Ref: `20250504_WalletBackend.md` Task 2.4.6):**
    *   **Objective:** Replace the placeholder authentication with the final chosen mechanism (likely OS Auth).
    *   **Tasks:** Requires research and implementation based on chosen plugin/method.

**Note:** The order of subsequent phases (Blockchain vs. P2P) may depend on specific project priorities and the outcomes of Phase 0 PoCs (if those are run concurrently or next). However, implementing **Real Secure Storage** is the most critical next step to make the current wallet functionality meaningful. 