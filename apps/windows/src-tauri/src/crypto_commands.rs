// src/crypto_commands.rs

use core_crypto::*;
use hex;
use tauri::command;
// No longer need Deref here
// use std::ops::Deref;
// Ed25519 types are only needed inside core-crypto

// Helper function to map CryptoError to a String suitable for the frontend
fn map_crypto_err(err: CryptoError) -> String {
    format!("Crypto Error: {}", err)
}

#[command]
pub fn generate_signing_keypair_hex() -> Result<(String, String), String> {
    let (secret_key, public_key) = generate_signing_keypair();
    // Note: We return the secret key bytes (seed) as hex.
    // The frontend should handle this sensitive data appropriately.
    Ok((
        hex::encode(secret_key.as_bytes()), // Use as_bytes()
        hex::encode(public_key.as_bytes()), // Use as_bytes()
    ))
}

#[command]
pub fn sign_hex(secret_key_hex: String, message: Vec<u8>) -> Result<String, String> {
    let secret_bytes = hex::decode(secret_key_hex).map_err(|e| format!("Invalid secret key hex: {}", e))?;
    let secret_key_array: [u8; SIGNING_SECRET_KEY_BYTES] = secret_bytes
        .try_into()
        .map_err(|_| format!("Invalid secret key length, expected {}", SIGNING_SECRET_KEY_BYTES))?;

    // Construct using the ::from_bytes constructor from core-crypto
    let core_secret_key = SigningSecretKey::from_bytes(secret_key_array);

    sign(&core_secret_key, &message)
        .map(|sig| hex::encode(sig.as_bytes())) // Use as_bytes()
        .map_err(map_crypto_err)
}

#[command]
pub fn verify_hex(public_key_hex: String, message: Vec<u8>, signature_hex: String) -> Result<(), String> {
    let public_bytes = hex::decode(public_key_hex).map_err(|e| format!("Invalid public key hex: {}", e))?;
    let signature_bytes = hex::decode(signature_hex).map_err(|e| format!("Invalid signature hex: {}", e))?;

    let public_key_array: [u8; SIGNING_PUBLIC_KEY_BYTES] = public_bytes
        .try_into()
        .map_err(|_| format!("Invalid public key length, expected {}", SIGNING_PUBLIC_KEY_BYTES))?;
    let signature_array: [u8; SIGNATURE_BYTES] = signature_bytes
        .try_into()
        .map_err(|_| format!("Invalid signature length, expected {}", SIGNATURE_BYTES))?;

    // Construct using the ::try_from_bytes constructors (which validate)
    let core_public_key = SigningPublicKey::try_from_bytes(&public_key_array).map_err(map_crypto_err)?;
    let core_signature = Signature::try_from_bytes(&signature_array).map_err(map_crypto_err)?;

    verify(&core_public_key, &message, &core_signature).map_err(map_crypto_err)
}

#[command]
pub fn generate_nonce_hex() -> Result<String, String> {
    let nonce = generate_nonce();
    Ok(hex::encode(nonce))
}

#[command]
pub fn encrypt_symmetric_hex(
    key_hex: String,
    nonce_hex: String,
    plaintext: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid key hex: {}", e))?;
    let nonce_bytes = hex::decode(nonce_hex).map_err(|e| format!("Invalid nonce hex: {}", e))?;

    let key_array: [u8; SYMMETRIC_KEY_BYTES] = key_bytes
        .try_into()
        .map_err(|_| format!("Invalid key length, expected {}", SYMMETRIC_KEY_BYTES))?;
    let nonce_array: [u8; NONCE_BYTES] = nonce_bytes
        .try_into()
        .map_err(|_| format!("Invalid nonce length, expected {}", NONCE_BYTES))?;

    // encrypt_symmetric expects arrays directly, no wrapper types
    encrypt_symmetric(&key_array, &plaintext, &nonce_array, None).map_err(map_crypto_err)
}

#[command]
pub fn decrypt_symmetric_hex(
    key_hex: String,
    nonce_hex: String,
    ciphertext: Vec<u8>,
) -> Result<Vec<u8>, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid key hex: {}", e))?;
    let nonce_bytes = hex::decode(nonce_hex).map_err(|e| format!("Invalid nonce hex: {}", e))?;

    let key_array: [u8; SYMMETRIC_KEY_BYTES] = key_bytes
        .try_into()
        .map_err(|_| format!("Invalid key length, expected {}", SYMMETRIC_KEY_BYTES))?;
    let nonce_array: [u8; NONCE_BYTES] = nonce_bytes
        .try_into()
        .map_err(|_| format!("Invalid nonce length, expected {}", NONCE_BYTES))?;

    // decrypt_symmetric expects arrays directly, no wrapper types
    decrypt_symmetric(&key_array, &ciphertext, &nonce_array, None).map_err(map_crypto_err)
} 