use core_crypto::{mnemonic_to_seed, validate_mnemonic, CryptoError};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use storage_interface::{SecureStorage, StorageError};
use thiserror::Error;

#[derive(Debug, Serialize, Deserialize, Error)]
pub enum MnemonicImportError {
    #[error("Invalid mnemonic format: {0}")]
    InvalidFormat(String),
    #[error("Invalid mnemonic checksum")]
    InvalidChecksum,
    #[error("Storage layer error during import: {error}")]
    StorageFailed { error: String },
    #[error("Internal error: {0}")]
    InternalError(String), // Catch-all for unexpected issues
}

#[derive(Debug, Serialize, Deserialize, Error)]
pub enum MnemonicExportError {
    #[error("Wallet not initialized or mnemonic not found")]
    NotInitialized,
    #[error("Authentication failed")] // Placeholder - specific checks TBD
    AuthenticationFailed,
    #[error("Storage layer error during export: {error}")]
    RetrievalFailed { error: String },
    #[error("Failed to derive mnemonic from seed")]
    DerivationFailed,
    #[error("Internal error: {0}")]
    InternalError(String), // Catch-all
}

// --- Mock Secure Storage (FOR DEVELOPMENT/TESTING ONLY) ---
#[derive(Debug, Clone, Default)]
pub struct MockSecureStorage {
    seed: Arc<Mutex<Option<Vec<u8>>>>,
    mnemonic: Arc<Mutex<Option<String>>>, // Add storage for mnemonic
}

impl SecureStorage for MockSecureStorage {
    fn store_seed(&self, seed: &[u8]) -> Result<(), StorageError> {
        println!("[MockStorage] Storing seed ({} bytes)", seed.len());
        let mut lock = self
            .seed
            .lock()
            .map_err(|e| StorageError::InternalError(format!("Mutex poisoned: {}", e)))?;
        *lock = Some(seed.to_vec());
        Ok(())
    }

    fn retrieve_seed(&self) -> Result<Option<Vec<u8>>, StorageError> {
        println!("[MockStorage] Retrieving seed...");
        let lock = self
            .seed
            .lock()
            .map_err(|e| StorageError::InternalError(format!("Mutex poisoned: {}", e)))?;
        match lock.as_ref() {
            Some(seed_vec) => {
                println!("[MockStorage] Seed found ({} bytes)", seed_vec.len());
                Ok(Some(seed_vec.clone()))
            }
            None => {
                println!("[MockStorage] No seed found.");
                Ok(None)
            }
        }
    }

    // Implement new methods
    fn store_mnemonic(&self, phrase: &str) -> Result<(), StorageError> {
        println!("[MockStorage] Storing mnemonic: {}", phrase);
        let mut lock = self
            .mnemonic
            .lock()
            .map_err(|e| StorageError::InternalError(format!("Mutex poisoned: {}", e)))?;
        *lock = Some(phrase.to_string());
        Ok(())
    }

    fn retrieve_mnemonic(&self) -> Result<Option<String>, StorageError> {
        println!("[MockStorage] Retrieving mnemonic...");
        let lock = self
            .mnemonic
            .lock()
            .map_err(|e| StorageError::InternalError(format!("Mutex poisoned: {}", e)))?;
        match lock.as_ref() {
            Some(phrase) => {
                println!("[MockStorage] Mnemonic found: {}", phrase);
                Ok(Some(phrase.clone()))
            }
            None => {
                println!("[MockStorage] No mnemonic found.");
                Ok(None)
            }
        }
    }
}
// --- End Mock Secure Storage ---

#[tauri::command]
pub async fn import_mnemonic(
    mnemonic: String,
    storage: tauri::State<'_, MockSecureStorage>, // Inject state
) -> Result<(), MnemonicImportError> {
    println!(
        "[Rust Backend] Received import_mnemonic command with mnemonic: {}",
        &mnemonic
    );

    // [2.2.1] Use core-crypto to validate the mnemonic phrase format and checksum.
    validate_mnemonic(&mnemonic).map_err(|e| match e {
        CryptoError::MnemonicValidationError(msg) => MnemonicImportError::InvalidFormat(msg),
        _ => MnemonicImportError::InternalError(format!("Unexpected validation error: {}", e)),
    })?;
    println!("[Rust Backend] Mnemonic validated.");

    // [2.2.2] Use core-crypto (BIP-39 logic) to derive the master seed.
    let seed_array = mnemonic_to_seed(&mnemonic)
        .map_err(|e| MnemonicImportError::InternalError(format!("Failed to derive seed: {}", e)))?;
    println!("[Rust Backend] Seed derived ({} bytes).", seed_array.len());

    // [2.2.3] Call the storage-interface function to securely store BOTH the seed and the original mnemonic.
    storage
        .store_seed(&seed_array)
        .map_err(|e| MnemonicImportError::StorageFailed {
            error: e.to_string(),
        })?;
    storage
        .store_mnemonic(&mnemonic)
        .map_err(|e| MnemonicImportError::StorageFailed {
            error: e.to_string(),
        })?;
    println!("[Rust Backend] Seed and mnemonic stored via interface.");

    println!("[Rust Backend] import_mnemonic processed successfully.");
    Ok(())
}

#[tauri::command]
pub async fn export_mnemonic(
    storage: tauri::State<'_, MockSecureStorage>, // Inject state
) -> Result<String, MnemonicExportError> {
    println!("[Rust Backend] Received export_mnemonic command.");

    // [2.2.5] Implement necessary security checks (e.g., password confirmation).
    let authenticated = true; // Simulate successful auth for now
    if !authenticated {
        return Err(MnemonicExportError::AuthenticationFailed);
    }
    println!("[Rust Backend] Security check passed (placeholder).");

    // [2.2.6] Retrieve the securely stored mnemonic phrase using the interface.
    let maybe_mnemonic =
        storage
            .retrieve_mnemonic()
            .map_err(|e| MnemonicExportError::RetrievalFailed {
                error: e.to_string(),
            })?;

    match maybe_mnemonic {
        Some(phrase) => {
            println!("[Rust Backend] export_mnemonic processed successfully.");
            Ok(phrase)
        }
        None => Err(MnemonicExportError::NotInitialized),
    }
}

// --- Unit Tests ---
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use storage_interface::{SecureStorage, StorageError};

    // --- Test Cases ---

    #[tokio::test]
    async fn test_import_mnemonic_success() {
        let storage = MockSecureStorage::default();
        let valid_mnemonic =
            "radar blur cabbage chef fix engine embark frames garbage bracket ruling image"
                .to_string();

        let result =
            import_mnemonic(valid_mnemonic.clone(), tauri::State::from(storage.clone())).await;
        assert!(result.is_ok());

        // Verify mnemonic and seed were stored
        let stored_mnemonic_result = storage.retrieve_mnemonic();
        assert!(stored_mnemonic_result.is_ok());
        assert_eq!(stored_mnemonic_result.unwrap(), Some(valid_mnemonic));

        let stored_seed_result = storage.retrieve_seed();
        assert!(stored_seed_result.is_ok());
        assert!(stored_seed_result.unwrap().is_some());
    }

    #[tokio::test]
    async fn test_import_mnemonic_invalid_format() {
        let storage = MockSecureStorage::default();
        let invalid_mnemonic = "invalid format short".to_string();

        let result = import_mnemonic(invalid_mnemonic, tauri::State::from(storage.clone())).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            MnemonicImportError::InvalidFormat(_) => {} // Expected error
            e => panic!("Unexpected error type: {:?}", e),
        }
        // Verify nothing was stored
        assert!(storage.retrieve_mnemonic().unwrap().is_none());
        assert!(storage.retrieve_seed().unwrap().is_none());
    }

    // TODO: Add more import error tests (StorageFailed etc.)

    #[tokio::test]
    async fn test_export_mnemonic_success() {
        let storage = MockSecureStorage::default();
        let mnemonic =
            "radar blur cabbage chef fix engine embark frames garbage bracket ruling image"
                .to_string();
        let seed = core_crypto::mnemonic_to_seed(&mnemonic).unwrap();
        storage.store_mnemonic(&mnemonic).unwrap(); // Pre-populate storage
        storage.store_seed(&seed).unwrap(); // Also store seed

        let result = export_mnemonic(tauri::State::from(storage)).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), mnemonic);
    }

    #[tokio::test]
    async fn test_export_mnemonic_not_initialized() {
        let storage = MockSecureStorage::default(); // Empty storage

        let result = export_mnemonic(tauri::State::from(storage)).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            MnemonicExportError::NotInitialized => {} // Expected error
            e => panic!("Unexpected error type: {:?}", e),
        }
    }

    // TODO: Add more export error tests (AuthenticationFailed, RetrievalFailed)
}
