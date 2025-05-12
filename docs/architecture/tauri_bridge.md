# Tauri <-> Rust Interface Design

This document specifies the communication bridge between the frontend (Tauri application) and the Rust backend, primarily through Tauri commands and events.

## Commands

Tauri commands allow the frontend to invoke Rust functions in the backend.

### Wallet Management Commands

These commands handle operations related to user wallet keys (mnemonics, seeds).

#### `import_mnemonic`

*   **Purpose:** Validates a mnemonic phrase provided by the frontend, derives the master seed, and securely stores it using the `storage-layer`.
*   **Frontend Call:** `invoke('import_mnemonic', { mnemonic: string })`
*   **Arguments:**
    *   `mnemonic: string`: The BIP-39 mnemonic phrase to import.
*   **Return Type (Rust `Result`):** `Result<(), MnemonicImportError>`
    *   `Ok(())`: Indicates successful validation, derivation, and storage.
    *   `Err(MnemonicImportError)`: Indicates failure. Possible error variants:
        *   `InvalidFormat`: Mnemonic structure/word count is wrong.
        *   `InvalidChecksum`: Mnemonic words are valid, but the checksum fails.
        *   `StorageFailed { error: String }`: An error occurred accessing the `storage-layer`.

#### `export_mnemonic`

*   **Purpose:** Securely retrieves the master seed from the `storage-layer`, optionally derives the corresponding mnemonic phrase (if only the seed is stored), and returns it to the frontend after performing necessary security checks.
*   **Frontend Call:** `invoke('export_mnemonic')`
*   **Arguments:** None (Security checks like password confirmation handled internally or via future arguments).
*   **Return Type (Rust `Result`):** `Result<string, MnemonicExportError>`
    *   `Ok(string)`: The exported mnemonic phrase.
    *   `Err(MnemonicExportError)`: Indicates failure. Possible error variants:
        *   `NotInitialized`: No seed/mnemonic found in storage.
        *   `AuthenticationFailed`: Required security checks failed.
        *   `RetrievalFailed { error: String }`: An error occurred accessing the `storage-layer`.
        *   `DerivationFailed`: An error occurred converting the seed back to a mnemonic.

## Events

*(Placeholder for future event definitions)* 