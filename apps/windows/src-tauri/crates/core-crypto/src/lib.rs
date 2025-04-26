use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce as CryptoNonce, // Alias CryptoNonce to avoid clash
};
use thiserror::Error;
use sha3::{Digest, Sha3_256};
use signature::Error as SignatureTraitError;

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
    #[error("Signature verification failed")]
    SignatureVerificationFailed,
    #[error("Underlying cryptographic operation failed: {0}")]
    InternalError(String), // Catch-all for unexpected library errors
    #[error("Failed to parse signature: {0}")]
    SignatureParsingError(String),
}

// Implement From trait to allow '?' conversion from signature::Error
impl From<SignatureTraitError> for CryptoError {
    fn from(e: SignatureTraitError) -> Self {
        CryptoError::SignatureParsingError(e.to_string())
    }
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

// --- Ed25519 Imports ---
use ed25519_dalek::{Signer, Verifier, VerifyingKey, SigningKey, Signature as EdSignature};
use rand::rngs::OsRng as RandOsRng; // Keep only necessary rand imports

// --- Ed25519 Digital Signatures ---

pub const SIGNING_PUBLIC_KEY_BYTES: usize = 32;
pub const SIGNING_SECRET_KEY_BYTES: usize = 32; // ed25519 secret keys are 32 bytes
pub const SIGNATURE_BYTES: usize = 64;

// Wrapper structs for type safety and potential future abstraction
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SigningPublicKey([u8; SIGNING_PUBLIC_KEY_BYTES]);

#[derive(Debug)] // Avoid Clone, Eq, PartialEq for secret key wrapper
pub struct SigningSecretKey([u8; SIGNING_SECRET_KEY_BYTES]);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature([u8; SIGNATURE_BYTES]);

// Implement Deref to easily access the inner byte array if needed
impl std::ops::Deref for SigningPublicKey {
    type Target = [u8; SIGNING_PUBLIC_KEY_BYTES];
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::Deref for Signature {
    type Target = [u8; SIGNATURE_BYTES];
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// Implement From traits for easier conversion from dalek types
impl From<VerifyingKey> for SigningPublicKey {
    fn from(key: VerifyingKey) -> Self {
        SigningPublicKey(key.to_bytes())
    }
}

impl From<SigningKey> for SigningSecretKey {
    fn from(key: SigningKey) -> Self {
        // Note: SigningKey encapsulates the secret scalar and the public key bytes.
        // We only store the secret part here for simplicity, assuming the public key
        // can be derived or is stored separately when needed for signing pair generation.
        // The to_bytes() method returns the 32-byte secret scalar.
        SigningSecretKey(key.to_bytes())
    }
}

impl From<EdSignature> for Signature {
    fn from(sig: EdSignature) -> Self {
        Signature(sig.to_bytes())
    }
}

// Allow converting our wrapper back to dalek types (requires error handling for public key)
impl TryFrom<&SigningPublicKey> for VerifyingKey {
    type Error = CryptoError;
    fn try_from(value: &SigningPublicKey) -> Result<Self, Self::Error> {
        VerifyingKey::from_bytes(&value.0)
            .map_err(|e| CryptoError::InternalError(format!("Failed to parse public key: {}", e)))
    }
}

// Function to generate a new Ed25519 key pair
pub fn generate_signing_keypair() -> (SigningSecretKey, SigningPublicKey) {
    let mut csprng = RandOsRng;
    let signing_key: SigningKey = SigningKey::generate(&mut csprng);
    let verifying_key: VerifyingKey = signing_key.verifying_key();
    (signing_key.into(), verifying_key.into())
}

// Function to sign a message with a secret key
pub fn sign(secret_key: &SigningSecretKey, message: &[u8]) -> Result<Signature, CryptoError> {
    // Reconstruct the SigningKey from the secret bytes.
    // Note: This assumes the SigningSecretKey wrapper only holds the secret scalar bytes.
    // Note 2: SigningKey::from_bytes will panic if the length is incorrect. We assume
    // our SigningSecretKey is always constructed correctly (e.g., via generate_signing_keypair).
    let signing_key = SigningKey::from_bytes(&secret_key.0);

    // Sign the message
    let signature: EdSignature = signing_key.sign(message);
    Ok(signature.into())
}

// Function to verify a signature
pub fn verify(
    public_key: &SigningPublicKey,
    message: &[u8],
    signature: &Signature,
) -> Result<(), CryptoError> {
    let verifying_key = VerifyingKey::try_from(public_key)?;
    let ed_signature = <EdSignature as TryFrom<&[u8]>>::try_from(&signature.0)?;

    verifying_key
        .verify(message, &ed_signature)
        .map_err(|_| CryptoError::SignatureVerificationFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::RngCore; // This is needed for generate_random_key in tests
    use hex; // Ensure use hex is present inside the test module

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
        // Use OsRng from chacha20poly1305::aead imports
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
    // fn test_encrypt_decrypt_roundtrip_with_aad() { ... }

    // --- Ed25519 Signing Tests ---

    #[test]
    fn test_signing_keypair_generation() {
        let (secret_key, public_key) = generate_signing_keypair();

        // Check lengths
        assert_eq!(secret_key.0.len(), SIGNING_SECRET_KEY_BYTES);
        assert_eq!(public_key.0.len(), SIGNING_PUBLIC_KEY_BYTES);

        // Try to reconstruct dalek keys to ensure validity (basic check)
        assert!(SigningKey::from_bytes(&secret_key.0).verifying_key().to_bytes() == public_key.0);
        assert!(VerifyingKey::try_from(&public_key).is_ok());
    }

    #[test]
    fn test_sign_verify_roundtrip() {
        let (secret_key, public_key) = generate_signing_keypair();
        let message = b"This message needs to be signed";

        // Sign the message
        let signature = sign(&secret_key, message).expect("Signing failed");
        assert_eq!(signature.0.len(), SIGNATURE_BYTES);

        // Verify the signature
        let verification_result = verify(&public_key, message, &signature);
        assert!(verification_result.is_ok(), "Verification failed when it should succeed");
    }

    #[test]
    fn test_verify_wrong_key() {
        let (secret_key1, _public_key1) = generate_signing_keypair();
        let (_secret_key2, public_key2) = generate_signing_keypair(); // Different key pair
        let message = b"Message signed by key 1";

        let signature = sign(&secret_key1, message).expect("Signing failed");

        // Verify with the wrong public key
        let verification_result = verify(&public_key2, message, &signature);
        assert!(verification_result.is_err());
        assert_eq!(verification_result.unwrap_err(), CryptoError::SignatureVerificationFailed);
    }

    #[test]
    fn test_verify_tampered_message() {
        let (secret_key, public_key) = generate_signing_keypair();
        let original_message = b"Original message content";
        let tampered_message = b"Tampered message content";

        let signature = sign(&secret_key, original_message).expect("Signing failed");

        // Verify with the tampered message
        let verification_result = verify(&public_key, tampered_message, &signature);
        assert!(verification_result.is_err());
        assert_eq!(verification_result.unwrap_err(), CryptoError::SignatureVerificationFailed);
    }

    #[test]
    fn test_verify_tampered_signature() {
        let (secret_key, public_key) = generate_signing_keypair();
        let message = b"A message to verify";

        let mut signature = sign(&secret_key, message).expect("Signing failed");

        // Tamper with the signature (flip a bit)
        let last_byte_index = signature.0.len() - 1;
        signature.0[last_byte_index] ^= 0x01;

        // Verify with the tampered signature
        let verification_result = verify(&public_key, message, &signature);
        assert!(verification_result.is_err());

        // Check if the error is either ParsingError or VerificationFailed
        match verification_result.unwrap_err() {
            CryptoError::SignatureParsingError(_) | CryptoError::SignatureVerificationFailed => {
                // Test passes if either error occurs
            }
            e => panic!(
                "Expected SignatureParsingError or SignatureVerificationFailed, got {:?}",
                e
            ),
        }
    }
}
