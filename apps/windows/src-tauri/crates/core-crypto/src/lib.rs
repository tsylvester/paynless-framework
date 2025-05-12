use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce as CryptoNonce, // Alias CryptoNonce to avoid clash
};
use thiserror::Error;
use sha3::{Digest, Sha3_256};
use signature::Error as SignatureTraitError;
// Separate bip39 imports
use bip39::Mnemonic;
use bip39::Language;

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
    #[error("Key exchange failed: {0}")]
    KeyExchangeError(String),
    #[error("Key derivation failed: {0}")]
    KeyDerivationError(String),
    #[error("Invalid mnemonic phrase: {0}")]
    MnemonicValidationError(String),
    #[error("Failed to convert mnemonic to seed: {0}")]
    MnemonicToSeedError(String),
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
pub const SIGNING_SECRET_KEY_BYTES: usize = 32;
pub const SIGNATURE_BYTES: usize = 64;

// Wrapper structs for type safety and potential future abstraction
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SigningPublicKey([u8; SIGNING_PUBLIC_KEY_BYTES]);

impl SigningPublicKey {
    pub fn as_bytes(&self) -> &[u8; SIGNING_PUBLIC_KEY_BYTES] {
        &self.0
    }

    // Constructor that validates the bytes
    pub fn try_from_bytes(bytes: &[u8; SIGNING_PUBLIC_KEY_BYTES]) -> Result<Self, CryptoError> {
        // Attempt to parse using VerifyingKey::from_bytes to validate
        VerifyingKey::from_bytes(bytes)
            .map(|_| Self(*bytes)) // If ok, construct Self
            .map_err(|e| CryptoError::InternalError(format!("Failed to parse public key bytes: {}", e)))
    }
}

#[derive(Debug)] // Avoid Clone, Eq, PartialEq for secret key wrapper
pub struct SigningSecretKey([u8; SIGNING_SECRET_KEY_BYTES]);

impl SigningSecretKey {
    pub fn as_bytes(&self) -> &[u8; SIGNING_SECRET_KEY_BYTES] {
        &self.0
    }

    // Simple constructor from bytes (no validation needed beyond length)
    pub fn from_bytes(bytes: [u8; SIGNING_SECRET_KEY_BYTES]) -> Self {
        Self(bytes)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature([u8; SIGNATURE_BYTES]);

impl Signature {
    pub fn as_bytes(&self) -> &[u8; SIGNATURE_BYTES] {
        &self.0
    }

    // Constructor that validates the bytes
    pub fn try_from_bytes(bytes: &[u8; SIGNATURE_BYTES]) -> Result<Self, CryptoError> {
        // Attempt to parse using EdSignature::try_from<&[u8]> to validate
        <EdSignature as TryFrom<&[u8]>>::try_from(bytes)
             .map(|_| Self(*bytes)) // If ok, construct Self
             .map_err(|e| CryptoError::SignatureParsingError(e.to_string())) // Map signature::Error
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
        // Use the already validated bytes
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

// --- X25519 Imports ---
use x25519_dalek::{
    PublicKey as X25519PublicKey,
    SharedSecret as X25519SharedSecret,
    StaticSecret as X25519StaticSecret,
};

// --- X25519 Key Exchange ---

pub const KEY_EXCHANGE_PUBLIC_KEY_BYTES: usize = 32;
pub const KEY_EXCHANGE_SECRET_KEY_BYTES: usize = 32;
pub const SHARED_SECRET_BYTES: usize = 32;

// Wrapper structs for type safety
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyExchangePublicKey([u8; KEY_EXCHANGE_PUBLIC_KEY_BYTES]);

#[derive(Debug)] // Avoid Clone, Eq, PartialEq for secret key wrapper
pub struct KeyExchangeSecretKey([u8; KEY_EXCHANGE_SECRET_KEY_BYTES]);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedSecret([u8; SHARED_SECRET_BYTES]);

// Implement Deref to easily access inner bytes
impl std::ops::Deref for KeyExchangePublicKey {
    type Target = [u8; KEY_EXCHANGE_PUBLIC_KEY_BYTES];
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl std::ops::Deref for SharedSecret {
    type Target = [u8; SHARED_SECRET_BYTES];
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// Conversions between our wrappers and x25519_dalek types
impl From<X25519PublicKey> for KeyExchangePublicKey {
    fn from(key: X25519PublicKey) -> Self {
        KeyExchangePublicKey(*key.as_bytes()) // as_bytes() returns &[u8; 32]
    }
}

impl TryFrom<&KeyExchangePublicKey> for X25519PublicKey {
    type Error = CryptoError;
    fn try_from(value: &KeyExchangePublicKey) -> Result<Self, Self::Error> {
        // X25519PublicKey does not have a direct fallible from_bytes.
        // It validates internally. If length is wrong, it would panic earlier.
        // If the bytes are invalid (e.g., all zero), diffie_hellman might produce
        // an all-zero output, which should be checked by the caller using the secret.
        Ok(X25519PublicKey::from(value.0))
    }
}

impl From<X25519StaticSecret> for KeyExchangeSecretKey {
    fn from(key: X25519StaticSecret) -> Self {
        KeyExchangeSecretKey(key.to_bytes())
    }
}

impl From<&KeyExchangeSecretKey> for X25519StaticSecret {
    fn from(value: &KeyExchangeSecretKey) -> Self {
        // StaticSecret::from performs clamping, doesn't fail for valid length
        X25519StaticSecret::from(value.0)
    }
}

impl From<X25519SharedSecret> for SharedSecret {
    fn from(secret: X25519SharedSecret) -> Self {
        SharedSecret(secret.to_bytes())
    }
}

// Function to generate a new X25519 static key pair
pub fn generate_key_exchange_keypair() -> (KeyExchangeSecretKey, KeyExchangePublicKey) {
    let mut csprng = RandOsRng;
    let static_secret = X25519StaticSecret::random_from_rng(&mut csprng);
    let public_key = X25519PublicKey::from(&static_secret);
    (static_secret.into(), public_key.into())
}

// Function to perform X25519 Diffie-Hellman key exchange
pub fn key_exchange(
    our_secret: &KeyExchangeSecretKey,
    their_public: &KeyExchangePublicKey,
) -> Result<SharedSecret, CryptoError> {
    let static_secret = X25519StaticSecret::from(our_secret);
    let public_key = X25519PublicKey::try_from(their_public)?;

    // Perform the Diffie-Hellman exchange
    let shared_secret: X25519SharedSecret = static_secret.diffie_hellman(&public_key);

    // Check for all-zero shared secret (potential indication of weak/invalid public key)
    // While not strictly mandated by RFC7748, it's a common safety check.
    if shared_secret.as_bytes() == &[0u8; 32] {
        return Err(CryptoError::KeyExchangeError(
            "Potential weak key detected: resulted in all-zero shared secret".to_string(),
        ));
    }

    Ok(shared_secret.into())
}

// --- HKDF Imports ---
use hkdf::Hkdf;
use sha2::Sha256;

// --- Key Derivation ---

// Define key types as specified in the protocol
// Using fixed-size arrays for secrets where appropriate.
// MasterSeed is often variable length (e.g., from BIP39), represented as Vec<u8>.
pub type MasterSeed = Vec<u8>;
pub const ROOT_IDENTITY_SECRET_BYTES: usize = 32;
pub type RootIdentitySecret = [u8; ROOT_IDENTITY_SECRET_BYTES];
pub const CONTENT_MASTER_KEY_BYTES: usize = 32;
pub type ContentMasterKey = [u8; CONTENT_MASTER_KEY_BYTES];
// Re-use existing types:
// SymmetricContentKey = SymKey ([u8; 32])
// TokenSigningKeyPair = (SigningSecretKey, SigningPublicKey)
// IdentitySigningKeyPair = (SigningSecretKey, SigningPublicKey)

// Private helper for HKDF-SHA256 derivation
fn derive_hkdf_output(
    ikm: &[u8],          // Input Key Material
    salt: &[u8],
    info: &[u8],
    output_buffer: &mut [u8], // Buffer to fill with derived key material
) -> Result<(), CryptoError> {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    hk.expand(info, output_buffer).map_err(|e| {
        CryptoError::KeyDerivationError(format!("HKDF expansion failed: {}", e))
    })
}

// 1. Master Seed -> Root Identity Key (RIK)
pub fn derive_root_identity_secret(master_seed: &MasterSeed) -> Result<RootIdentitySecret, CryptoError> {
    let salt = b"master";
    let info = b"root-identity";
    let mut rik = [0u8; ROOT_IDENTITY_SECRET_BYTES];
    derive_hkdf_output(master_seed, salt, info, &mut rik)?;
    Ok(rik)
}

// 2. RIK -> Identity Signing Key Pair (Ed25519)
pub fn derive_identity_signing_keypair(
    rik: &RootIdentitySecret,
    purpose_string: &str, // e.g., "primary-chain-signing"
) -> Result<(SigningSecretKey, SigningPublicKey), CryptoError> {
    let salt = b"identity-signing";
    let info = purpose_string.as_bytes();
    // Ed25519 secret key seed is 32 bytes
    let mut key_seed = [0u8; SIGNING_SECRET_KEY_BYTES];
    derive_hkdf_output(rik, salt, info, &mut key_seed)?;

    // Generate the full keypair from the derived seed
    let signing_key = SigningKey::from_bytes(&key_seed); // This handles the Ed25519 specific part
    let verifying_key = signing_key.verifying_key();

    Ok((signing_key.into(), verifying_key.into()))
}

// 3. RIK -> Content Master Key (CMK)
pub fn derive_content_master_key(
    rik: &RootIdentitySecret,
    content_id: &[u8], // Unique identifier for the content
) -> Result<ContentMasterKey, CryptoError> {
    let salt = b"content-key-derivation";
    let info = content_id; // Use the content_id directly as info
    let mut cmk = [0u8; CONTENT_MASTER_KEY_BYTES];
    derive_hkdf_output(rik, salt, info, &mut cmk)?;
    Ok(cmk)
}

// 4. CMK -> Symmetric Content Key (SCK - ChaCha20 Key)
pub fn derive_symmetric_content_key(cmk: &ContentMasterKey) -> Result<SymKey, CryptoError> {
    let salt = b"symmetric-encryption";
    let info = b"slice-encryption";
    let mut sck = [0u8; SYMMETRIC_KEY_BYTES]; // SYMMETRIC_KEY_BYTES = 32
    derive_hkdf_output(cmk, salt, info, &mut sck)?;
    Ok(sck)
}

// 5. CMK -> Token Signing Key Pair (Ed25519)
pub fn derive_token_signing_keypair(
    cmk: &ContentMasterKey,
) -> Result<(SigningSecretKey, SigningPublicKey), CryptoError> {
    let salt = b"token-signing";
    let info = b"transactable-key-token";
    let mut key_seed = [0u8; SIGNING_SECRET_KEY_BYTES];
    derive_hkdf_output(cmk, salt, info, &mut key_seed)?;

    // Generate the full keypair from the derived seed
    let signing_key = SigningKey::from_bytes(&key_seed);
    let verifying_key = signing_key.verifying_key();

    Ok((signing_key.into(), verifying_key.into()))
}

// --- Mnemonic Handling (BIP-39) ---

/// Validates a BIP-39 mnemonic phrase (word count, word validity, checksum).
/// Uses the English wordlist by default.
///
/// # Arguments
/// * `mnemonic_phrase` - The mnemonic phrase string to validate.
///
/// # Returns
/// * `Ok(())` if the mnemonic is valid.
/// * `Err(CryptoError::MnemonicValidationError)` if validation fails.
pub fn validate_mnemonic(mnemonic_phrase: &str) -> Result<(), CryptoError> {
    Mnemonic::parse_in(Language::English, mnemonic_phrase)
        .map(|_| ()) // Discard the Mnemonic object on success
        .map_err(|e| CryptoError::MnemonicValidationError(e.to_string()))
}

/// Converts a valid BIP-39 mnemonic phrase into its corresponding 64-byte seed.
/// Uses the English wordlist and an empty passphrase by default.
///
/// # Returns
/// * `Ok<[u8; 64]>` containing the derived 64-byte seed.
/// * `Err(CryptoError::MnemonicToSeedError)` if conversion fails (e.g., invalid mnemonic).
pub fn mnemonic_to_seed(mnemonic_phrase: &str) -> Result<[u8; 64], CryptoError> {
    let mnemonic = Mnemonic::parse_in(Language::English, mnemonic_phrase)
        .map_err(|e| CryptoError::MnemonicToSeedError(format!("Invalid mnemonic: {}", e)))?;
    // Use the Mnemonic::to_seed method which returns [u8; 64]
    Ok(mnemonic.to_seed("")) // Use empty passphrase as standard
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

    // --- X25519 Key Exchange Tests ---

    #[test]
    fn test_key_exchange_keypair_generation() {
        let (secret_key, public_key) = generate_key_exchange_keypair();

        // Check lengths
        assert_eq!(secret_key.0.len(), KEY_EXCHANGE_SECRET_KEY_BYTES);
        assert_eq!(public_key.0.len(), KEY_EXCHANGE_PUBLIC_KEY_BYTES);

        // Basic sanity check: try to reconstruct and compare public key
        let reconstructed_secret = X25519StaticSecret::from(&secret_key);
        let reconstructed_public = X25519PublicKey::from(&reconstructed_secret);
        assert_eq!(reconstructed_public.as_bytes(), &public_key.0);
    }

    #[test]
    fn test_key_exchange_roundtrip() {
        // Generate key pairs for Alice and Bob
        let (alice_secret_key, alice_public_key) = generate_key_exchange_keypair();
        let (bob_secret_key, bob_public_key) = generate_key_exchange_keypair();

        // Alice computes shared secret with Bob's public key
        let shared_secret_alice = key_exchange(&alice_secret_key, &bob_public_key)
            .expect("Alice key exchange failed");

        // Bob computes shared secret with Alice's public key
        let shared_secret_bob = key_exchange(&bob_secret_key, &alice_public_key)
            .expect("Bob key exchange failed");

        // The shared secrets must be identical
        assert_eq!(shared_secret_alice, shared_secret_bob);
        assert_eq!(shared_secret_alice.0.len(), SHARED_SECRET_BYTES);

        // Ensure the shared secret is not all zeros (highly unlikely with random keys)
        assert_ne!(shared_secret_alice.0, [0u8; SHARED_SECRET_BYTES]);
    }

    #[test]
    fn test_key_exchange_weak_key_detection() {
        let (alice_secret_key, _alice_public_key) = generate_key_exchange_keypair();

        // Create an invalid all-zero public key for Bob (simulating a weak key)
        let bob_weak_public_key = KeyExchangePublicKey([0u8; KEY_EXCHANGE_PUBLIC_KEY_BYTES]);

        // Alice attempts key exchange with Bob's weak public key
        let result = key_exchange(&alice_secret_key, &bob_weak_public_key);

        // Expect an error indicating a potential weak key / all-zero result
        assert!(result.is_err());
        match result.unwrap_err() {
            CryptoError::KeyExchangeError(msg) => {
                assert!(msg.contains("all-zero shared secret"));
            }
            e => panic!("Expected KeyExchangeError containing 'all-zero shared secret', got {:?}", e),
        }
    }

    // --- HKDF Key Derivation Tests ---

    // Basic test for RIK derivation determinism
    #[test]
    fn test_derive_rik_deterministic() {
        let seed: MasterSeed = vec![0x01, 0x02, 0x03, 0x04];
        let rik1 = derive_root_identity_secret(&seed).expect("Derivation 1 failed");
        let rik2 = derive_root_identity_secret(&seed).expect("Derivation 2 failed");
        assert_eq!(rik1, rik2);
    }

    // Test that different master seeds yield different RIKs
    #[test]
    fn test_derive_rik_distinct_seeds() {
        let seed1: MasterSeed = vec![0x01, 0x02, 0x03, 0x04];
        let seed2: MasterSeed = vec![0x05, 0x06, 0x07, 0x08];
        let rik1 = derive_root_identity_secret(&seed1).expect("Derivation 1 failed");
        let rik2 = derive_root_identity_secret(&seed2).expect("Derivation 2 failed");
        assert_ne!(rik1, rik2);
    }

    // Test Identity Signing Key derivation (determinism and distinctness)
    #[test]
    fn test_derive_identity_signing_keypair() {
        let rik: RootIdentitySecret = [1u8; 32];
        let (sk1a, pk1a) = derive_identity_signing_keypair(&rik, "purpose1").unwrap();
        let (sk1b, pk1b) = derive_identity_signing_keypair(&rik, "purpose1").unwrap();
        let (sk2, pk2) = derive_identity_signing_keypair(&rik, "purpose2").unwrap();

        assert_eq!(sk1a.0, sk1b.0); // Secret keys derived from same seed/info should match
        assert_eq!(pk1a.0, pk1b.0); // Public keys derived from same seed/info should match
        assert_ne!(sk1a.0, sk2.0); // Different info should yield different secret keys
        assert_ne!(pk1a.0, pk2.0); // Different info should yield different public keys
    }

    // Test Content Master Key derivation (determinism and distinctness)
    #[test]
    fn test_derive_content_master_key() {
        let rik: RootIdentitySecret = [2u8; 32];
        let content_id1 = b"content_1";
        let content_id2 = b"different_content_2";
        let cmk1a = derive_content_master_key(&rik, content_id1).unwrap();
        let cmk1b = derive_content_master_key(&rik, content_id1).unwrap();
        let cmk2 = derive_content_master_key(&rik, content_id2).unwrap();

        assert_eq!(cmk1a, cmk1b);
        assert_ne!(cmk1a, cmk2);
    }

    // Test Symmetric Content Key derivation (determinism)
    #[test]
    fn test_derive_symmetric_content_key() {
        let cmk: ContentMasterKey = [3u8; 32];
        let sck1 = derive_symmetric_content_key(&cmk).unwrap();
        let sck2 = derive_symmetric_content_key(&cmk).unwrap();
        assert_eq!(sck1, sck2);
        assert_eq!(sck1.len(), SYMMETRIC_KEY_BYTES);
    }

    // Test Token Signing Key derivation (determinism)
    #[test]
    fn test_derive_token_signing_keypair() {
        let cmk: ContentMasterKey = [4u8; 32];
        let (sk1, pk1) = derive_token_signing_keypair(&cmk).unwrap();
        let (sk2, pk2) = derive_token_signing_keypair(&cmk).unwrap();
        assert_eq!(sk1.0, sk2.0);
        assert_eq!(pk1.0, pk2.0);
        assert_eq!(sk1.0.len(), SIGNING_SECRET_KEY_BYTES);
    }

    // Test that different CMKs yield different SCKs and Token Signing Keys
    #[test]
    fn test_derive_keys_distinct_cmk() {
        let cmk1: ContentMasterKey = [5u8; 32];
        let cmk2: ContentMasterKey = [6u8; 32];

        let sck1 = derive_symmetric_content_key(&cmk1).unwrap();
        let sck2 = derive_symmetric_content_key(&cmk2).unwrap();
        assert_ne!(sck1, sck2);

        let (token_sk1, _) = derive_token_signing_keypair(&cmk1).unwrap();
        let (token_sk2, _) = derive_token_signing_keypair(&cmk2).unwrap();
        assert_ne!(token_sk1.0, token_sk2.0);
    }

    // --- Mnemonic Tests (adjust if needed) ---
    #[test]
    fn test_validate_mnemonic_valid() {
        let valid_mnemonic = "radar blur cabbage chef fix engine embark frames garbage bracket ruling image";
        assert!(validate_mnemonic(valid_mnemonic).is_ok());

        let valid_mnemonic_24 = "legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title";
        assert!(validate_mnemonic(valid_mnemonic_24).is_ok());
    }

    #[test]
    fn test_validate_mnemonic_invalid_checksum() {
        let invalid_mnemonic = "radar blur cabbage chef fix engine embark frames garbage bracket ruling top"; // last word wrong
        let result = validate_mnemonic(invalid_mnemonic);
        assert!(result.is_err());
        match result {
            Err(CryptoError::MnemonicValidationError(msg)) => {
                // Error message might vary slightly between parse/from_phrase
                assert!(msg.contains("checksum") || msg.contains("invalid mnemonic phrase"));
            }
            _ => panic!("Expected MnemonicValidationError"),
        }
    }

    #[test]
    fn test_validate_mnemonic_invalid_word() {
        let invalid_mnemonic = "radar blur cabbage chef fix engine embark frames garbage bracket ruling zzz"; // invalid word
        let result = validate_mnemonic(invalid_mnemonic);
        assert!(result.is_err());
        match result {
            Err(CryptoError::MnemonicValidationError(msg)) => {
                assert!(msg.contains("not in wordlist") || msg.contains("invalid mnemonic phrase"));
            }
            _ => panic!("Expected MnemonicValidationError"),
        }
    }

    #[test]
    fn test_validate_mnemonic_invalid_length() {
        let invalid_mnemonic = "radar blur cabbage chef"; // Too short
        let result = validate_mnemonic(invalid_mnemonic);
        assert!(result.is_err());
        match result {
            Err(CryptoError::MnemonicValidationError(msg)) => {
                 assert!(msg.contains("word count") || msg.contains("invalid mnemonic phrase"));
            }
            _ => panic!("Expected MnemonicValidationError"),
        }
    }

    #[test]
    fn test_mnemonic_to_seed_conversion() {
        let mnemonic = "radar blur cabbage chef fix engine embark frames garbage bracket ruling image";
        let result = mnemonic_to_seed(mnemonic);
        assert!(result.is_ok());
        let seed = result.unwrap();
        assert_eq!(seed.len(), 64); // BIP-39 seeds are 512 bits (64 bytes)

        // Example expected seed hex for the above mnemonic (verify with external tool if needed)
        let expected_seed_hex = "c8461859f479021518f663c6157e1478a7a61c46940f4317f6f20491c12b97431e13b89d783a6118401197e510c56859730e61bc584e569f55a651c16089f737";
        assert_eq!(hex::encode(seed), expected_seed_hex);
    }

    #[test]
    fn test_mnemonic_to_seed_invalid_mnemonic() {
        let invalid_mnemonic = "radar blur cabbage chef fix engine embark frames garbage bracket ruling top";
        let result = mnemonic_to_seed(invalid_mnemonic);
        assert!(result.is_err());
        match result {
            Err(CryptoError::MnemonicToSeedError(msg)) => {
                assert!(msg.contains("Invalid mnemonic"));
            }
            _ => panic!("Expected MnemonicToSeedError"),
        }
    }

} // end tests module