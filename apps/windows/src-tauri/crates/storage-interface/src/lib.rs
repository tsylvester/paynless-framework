use thiserror::Error;

/// Errors that can occur during secure storage operations.
#[derive(Debug, Error)]
pub enum StorageError {
    #[error("Platform secure storage unavailable or initialization failed: {0}")]
    InitializationFailed(String),
    #[error("Failed to store seed: {0}")]
    StoreSeedFailed(String),
    #[error("Failed to retrieve seed: {0}")]
    RetrieveSeedFailed(String),
    #[error("Failed to store mnemonic: {0}")]
    StoreMnemonicFailed(String),
    #[error("Failed to retrieve mnemonic: {0}")]
    RetrieveMnemonicFailed(String),
    #[error("Seed not found")]
    NotFound,
    #[error("Internal storage error: {0}")]
    InternalError(String),
}

/// Trait defining the interface for securely storing and retrieving wallet secrets.
/// Implementations should handle platform-specific secure storage mechanisms.
/// 
/// Must be `Send + Sync` to be safely stored and shared across threads by Tauri's state management.
pub trait SecureStorage: Send + Sync {
    /// Stores the master seed securely.
    /// 
    /// # Arguments
    /// 
    /// * `seed` - The master seed bytes to store.
    /// 
    /// # Returns
    /// 
    /// * `Ok(())` if storage was successful.
    /// * `Err(StorageError)` if an error occurred.
    fn store_seed(&self, seed: &[u8]) -> Result<(), StorageError>;

    /// Retrieves the master seed securely.
    /// 
    /// # Returns
    /// 
    /// * `Ok(Some(Vec<u8>))` if the seed was found and retrieved successfully.
    /// * `Ok(None)` if no seed was found (e.g., wallet not initialized).
    /// * `Err(StorageError)` if an error occurred during retrieval.
    fn retrieve_seed(&self) -> Result<Option<Vec<u8>>, StorageError>;

    /// Stores the mnemonic phrase securely.
    fn store_mnemonic(&self, phrase: &str) -> Result<(), StorageError>;

    /// Retrieves the mnemonic phrase securely.
    fn retrieve_mnemonic(&self) -> Result<Option<String>, StorageError>;

    // Optional: Consider adding a method to clear the seed if needed.
    // fn clear_seed(&self) -> Result<(), StorageError>;
}

// Example of how a concrete implementation might be used (won't be defined here):
// pub struct OsSecureStorage { /* platform-specific handles */ }
// impl SecureStorage for OsSecureStorage { ... } 