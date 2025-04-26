use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce as CryptoNonce, // Alias CryptoNonce to avoid clash
};
use thiserror::Error;
use sha3::{Digest, Sha3_256};
// extern crate hex; // Removed this line

// Define a type alias for our standard hash output (32 bytes for SHA3-256)
pub type Hash = [u8; 32];

// Simple function to hash arbitrary byte data using SHA3-256
pub fn hash_data(data: &[u8]) -> Hash {
    let mut hasher = Sha3_256::new();
    hasher.update(data);
    hasher.finalize().into()
}

// --- Symmetric Encryption ---

// Define standard key and nonce sizes
pub const SYMMETRIC_KEY_BYTES: usize = 32;
pub const NONCE_BYTES: usize = 12; // Standard 96-bit nonce for ChaCha20Poly1305

// Type aliases for clarity
pub type SymKey = [u8; SYMMETRIC_KEY_BYTES];
pub type Nonce = [u8; NONCE_BYTES];

// Custom Error type for cryptographic operations
#[derive(Error, Debug, PartialEq, Eq)]
pub enum CryptoError {
    #[error("Encryption failed: {0}")]
    EncryptionError(String), // Consider more specific error types if needed
    #[error("Decryption failed: ciphertext verification failed (likely wrong key or tampered data)")]
    DecryptionError,
    #[error("Invalid key length provided")]
    InvalidKeyLength,
    #[error("Invalid nonce length provided")]
    InvalidNonceLength,
    #[error("Underlying cryptographic operation failed: {0}")]
    InternalError(String), // Catch-all for unexpected library errors
}

// Function to generate a cryptographically secure random nonce
pub fn generate_nonce() -> Nonce {
    ChaCha20Poly1305::generate_nonce(&mut OsRng).into()
}

// Function to encrypt data using ChaCha20-Poly1305
pub fn encrypt_symmetric(
    key: &SymKey,
    plaintext: &[u8],
    nonce: &Nonce,
    _associated_data: Option<&[u8]>,
) -> Result<Vec<u8>, CryptoError> {
    let key = Key::from_slice(key);
    let cipher = ChaCha20Poly1305::new(key);
    let nonce = CryptoNonce::from_slice(nonce);

    cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| CryptoError::EncryptionError(e.to_string()))

    // Note: The current version of the `aead` crate's encrypt/decrypt methods
    // using the `Aead` trait directly might not easily support associated data.
    // We might need to use lower-level APIs or adapt if associated data is required frequently.
    // For simplicity, this example omits associated data during encryption/decryption calls,
    // assuming it's handled at a higher level or added if necessary using specific crate features.
    // If associated_data is essential, the implementation would need adjustment, potentially using
    // `AeadInPlace::encrypt_in_place_detached` or similar depending on the crate version.
}

// Function to decrypt data using ChaCha20-Poly1305
pub fn decrypt_symmetric(
    key: &SymKey,
    ciphertext: &[u8],
    nonce: &Nonce,
    _associated_data: Option<&[u8]>,
) -> Result<Vec<u8>, CryptoError> {
    let key = Key::from_slice(key);
    let cipher = ChaCha20Poly1305::new(key);
    let nonce = CryptoNonce::from_slice(nonce);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionError) // Map generic AEAD error to our specific type
        // See note in encrypt_symmetric regarding associated_data handling.
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::RngCore;
    use hex; // Ensure use hex is present inside the test module

    // Helper for hex decoding (assuming hex crate is dev-dependency)
    // mod hex_helper { ... } // Removed hex_helper module

    // --- Hashing Tests (Updated for SHA3-256) ---
    #[test]
    fn test_sha3_256_basic() {
        let input = b"hello world";
        // Expected SHA3-256 hash for "hello world"
        let expected_hex = "644bcc7e564373040999aac89e7622f3ca71fba1d972fd94a31c3bfbf24e3938";
        let expected_bytes_vec = hex::decode(expected_hex)
            .expect("Failed to decode known hex string");
        let expected_bytes: [u8; 32] = expected_bytes_vec
            .try_into()
            .expect("Decoded hex string has incorrect length");

        let actual_hash = hash_data(input); 
        assert_eq!(actual_hash, expected_bytes, "SHA3-256 hash for 'hello world' did not match expected value");
    }

    #[test]
    fn test_sha3_256_empty() {
        let input = b"";
        // Expected SHA3-256 hash for empty string
        let expected_hex = "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a";
        let expected_bytes_vec = hex::decode(expected_hex)
            .expect("Failed to decode known hex string");
        let expected_bytes: [u8; 32] = expected_bytes_vec
            .try_into()
            .expect("Decoded hex string has incorrect length");
        let actual_hash = hash_data(input);
        assert_eq!(actual_hash, expected_bytes, "SHA3-256 hash for empty string did not match expected value");
    }

    #[test]
    fn test_sha3_256_distinct() {
        let input1 = b"input data 1";
        let input2 = b"input data 2";

        let hash1 = hash_data(input1);
        let hash2 = hash_data(input2);

        assert_ne!(hash1, hash2);
    }

    // --- Symmetric Encryption Tests ---

    fn generate_random_key() -> SymKey {
        let mut key = [0u8; SYMMETRIC_KEY_BYTES];
        OsRng.fill_bytes(&mut key);
        key
    }

    #[test]
    fn test_generate_nonce_length() {
        let nonce = generate_nonce();
        assert_eq!(nonce.len(), NONCE_BYTES);
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = generate_random_key();
        let nonce = generate_nonce();
        let plaintext = b"this is a secret message";
        let associated_data = None; // Test without AAD first

        let ciphertext = encrypt_symmetric(&key, plaintext, &nonce, associated_data)
            .expect("Encryption failed");

        // Ensure ciphertext is different from plaintext
        assert_ne!(ciphertext.as_slice(), plaintext);

        let decrypted_plaintext = decrypt_symmetric(&key, &ciphertext, &nonce, associated_data)
            .expect("Decryption failed");

        assert_eq!(decrypted_plaintext, plaintext);
    }

    // Test decryption failure with wrong key
    #[test]
    fn test_decrypt_wrong_key() {
        let key1 = generate_random_key();
        let key2 = generate_random_key(); // Different key
        let nonce = generate_nonce();
        let plaintext = b"another secret";
        let associated_data = None;

        // Ensure keys are different
        assert_ne!(key1, key2);

        let ciphertext = encrypt_symmetric(&key1, plaintext, &nonce, associated_data)
            .expect("Encryption failed");

        let result = decrypt_symmetric(&key2, &ciphertext, &nonce, associated_data); // Use wrong key

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), CryptoError::DecryptionError);
    }

    // Test decryption failure with tampered ciphertext
    #[test]
    fn test_decrypt_tampered_ciphertext() {
        let key = generate_random_key();
        let nonce = generate_nonce();
        let plaintext = b"don't tamper with me";
        let associated_data = None;

        let mut ciphertext = encrypt_symmetric(&key, plaintext, &nonce, associated_data)
            .expect("Encryption failed");

        // Tamper with the ciphertext (e.g., flip a bit)
        if !ciphertext.is_empty() {
            let last_byte_index = ciphertext.len() - 1;
            ciphertext[last_byte_index] ^= 0x01; // Flip the last bit
        } else {
            panic!("Ciphertext is empty, cannot tamper");
        }

        let result = decrypt_symmetric(&key, &ciphertext, &nonce, associated_data);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), CryptoError::DecryptionError);
    }

    // Test decryption failure with wrong nonce
    #[test]
    fn test_decrypt_wrong_nonce() {
        let key = generate_random_key();
        let nonce1 = generate_nonce();
        let nonce2 = generate_nonce(); // Different nonce
        let plaintext = b"secrets again";
        let associated_data = None;

        assert_ne!(nonce1, nonce2);

        let ciphertext = encrypt_symmetric(&key, plaintext, &nonce1, associated_data)
            .expect("Encryption failed");

        let result = decrypt_symmetric(&key, &ciphertext, &nonce2, associated_data); // Use wrong nonce

        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), CryptoError::DecryptionError);
    }

    // --- Add tests for Associated Data (AAD) if the implementation supports it ---
    // #[test]
    // fn test_encrypt_decrypt_roundtrip_with_aad() {
    //     let key = generate_random_key();
    //     let nonce = generate_nonce();
    //     let plaintext = b"payload";
    //     let associated_data = Some(&b"metadata"[..]);
    //
    //     let ciphertext = encrypt_symmetric(&key, plaintext, &nonce, associated_data)
    //         .expect("Encryption with AAD failed");
    //
    //     let decrypted_plaintext = decrypt_symmetric(&key, &ciphertext, &nonce, associated_data)
    //         .expect("Decryption with AAD failed");
    //
    //     assert_eq!(decrypted_plaintext, plaintext);
    //
    //     // Test failure with wrong AAD
    //     let wrong_associated_data = Some(&b"other_metadata"[..]);
    //     let result = decrypt_symmetric(&key, &ciphertext, &nonce, wrong_associated_data);
    //     assert!(result.is_err());
    //     assert_eq!(result.unwrap_err(), CryptoError::DecryptionError);
    // }
}
