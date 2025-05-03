# Cryptographic Primitives Specification

**Status:** Initial Selection (Pending Phase 0 PoC Final Validation)

This document specifies the cryptographic algorithms chosen for the Decentralized Content Distribution System. These selections are based on current best practices regarding security, performance, and availability of well-audited Rust implementations. They are subject to final validation based on Phase 0 Proof-of-Concept results and specific requirements identified (e.g., blockchain integration constraints).

## 1. Hashing

*   **Primary Algorithm:** BLAKE3
*   **Backup Algorithm:** SHA3-256 (if required by specific integrations or compliance)
*   **Primary Use Cases:** Content integrity checking (Merkle Trees), Meta Hash generation.
*   **Justification:** BLAKE3 offers excellent performance on modern CPUs while providing a high security level (256-bit equivalent). It has well-maintained Rust implementations (`blake3` crate). SHA3-256 provides a NIST-standard alternative.
*   **Output Length:** 256 bits (32 bytes) typically.

## 2. Symmetric Encryption (Authenticated Encryption)

*   **Algorithm:** ChaCha20-Poly1305 (AEAD, RFC 8439)
*   **Primary Use Cases:** Encrypting content slices for storage and transport.
*   **Justification:** ChaCha20-Poly1305 is a modern, fast, and secure AEAD cipher, particularly performant in software. It avoids timing side-channel concerns. Requires a unique nonce per encryption with the same key. Good Rust implementations available (e.g., `chacha20poly1305` crate). AES-256-GCM is a common alternative if hardware acceleration is consistently available and preferred.
*   **Key Length:** 256 bits (32 bytes).
*   **Nonce Length:** 96 bits (12 bytes).
*   **Nonce Strategy:** Nonces MUST be unique for each encryption operation with the same key. Generation should ideally use a counter-based scheme or a secure random generation method that guarantees uniqueness to prevent catastrophic security failures.

## 3. Digital Signatures

*   **Algorithm:** Ed25519 (RFC 8032)
*   **Primary Use Cases:** Signing blockchain transactions, signing "Transactable Key" tokens, potentially signing P2P messages or peer identities.
*   **Justification:** Ed25519 offers high performance, strong security guarantees, small key/signature sizes, and resistance to many side-channel attacks. It is widely adopted. Excellent Rust implementations exist (`ed25519-dalek` crate).
*   **Public Key Size:** 32 bytes.
*   **Secret Key Size:** 32 bytes (seed).
*   **Signature Size:** 64 bytes.

## 4. Key Exchange

*   **Algorithm:** X25519 (RFC 7748)
*   **Primary Use Cases:** Establishing shared secrets between peers for potential end-to-end encrypted communication or deriving shared session keys.
*   **Justification:** X25519 is the standard ECDH function over Curve25519, compatible with Ed25519. It is fast and secure. Good Rust implementations exist (e.g., `x25519-dalek` crate).
*   **Key Sizes:** 32 bytes (public/secret).
*   **Shared Secret Size:** 32 bytes.
*   **Note on Key Reuse:** While X25519 keys can potentially be derived from Ed25519 key material, direct reuse is discouraged. It is generally safer and clearer to derive distinct signing and key exchange keys from a common seed using the KDF (see below).

## 5. Key Derivation Function (KDF)

*   **Algorithm:** HKDF-SHA256 (HMAC-based Key Derivation Function using SHA-256, RFC 5869)
*   **Primary Use Cases:** Deriving specific-purpose keys (e.g., symmetric encryption keys, signing keys for tokens) from a master secret or intermediate keys.
*   **Justification:** HKDF is a standard KDF designed to securely derive multiple keys from a single source of entropy. Using SHA-256 as the underlying hash function is common and secure. Requires a salt (ideally non-secret, high-entropy) and context-specific "info" parameter to ensure derived keys are unique and bound to their purpose. Good Rust implementations exist (e.g., `hkdf` crate).
*   **Underlying Hash:** SHA-256.

## 6. Random Number Generation

*   **Requirement:** All cryptographic operations requiring randomness (key generation, nonce generation if applicable, etc.) MUST use a cryptographically secure pseudorandom number generator (CSPRNG).
*   **Implementation:** Utilize standard library or well-audited crate functionalities for accessing the OS's CSPRNG (e.g., via the `rand` crate's `OsRng`).

## 7. Post-Quantum Considerations

Currently, standard NIST-approved post-quantum algorithms are not specified due to relative immaturity, performance overhead, and larger key/signature sizes. This decision should be revisited periodically as standards mature and implementations become more widespread. Future architecture should consider the possibility of migrating to hybrid schemes (e.g., combining classical and post-quantum algorithms) to ease transition. 

# Key Management Protocol Specification

**Status:** Initial Design (Subject to refinement during implementation and security review)

This document outlines the protocols and strategies for managing cryptographic keys within the Decentralized Content Distribution System. It complements `docs/cryptography.md` by specifying *how* the selected primitives are used for key generation, derivation, storage interface, and the "Transactable Key" token mechanism.

## 1. Master Key / Seed

*   **Concept:** Each user identity within the system is associated with a single high-entropy master secret, typically represented as a BIP-39 mnemonic phrase (e.g., 12 or 24 words).
*   **Generation:** Generated securely using a CSPRNG (see `docs/cryptography.md`, Section 6) during user onboarding. The mnemonic phrase is presented to the user for backup.
*   **Storage:**
    *   The raw mnemonic phrase itself SHOULD NOT be stored directly by the application after initial generation/import, unless explicitly requested and secured by strong user-provided encryption (e.g., password-based KDF like Argon2id).
    *   The derived master *seed* (binary entropy derived from the mnemonic) is the operational root secret.
    *   The master seed requires extremely secure storage. The `storage-layer` module will provide an interface for this, ideally leveraging platform-specific secure enclaves (e.g., Keychain on macOS, TPM on Windows/Linux) or OS credential managers where possible. If unavailable, file-based storage MUST use strong encryption tied to a user-provided password/passphrase (using Argon2id + AEAD).
*   **Backup/Recovery:** Relies entirely on the user securely backing up their mnemonic phrase. The application should strongly emphasize this during onboarding. Recovery involves re-importing the mnemonic phrase.

## 2. Key Derivation Hierarchy

*   **Standard:** Follows a BIP-32/BIP-44 like hierarchical deterministic (HD) structure where feasible, but simplified for the specific needs of this application.
*   **KDF:** Uses HKDF-SHA256 as specified in `docs/cryptography.md`.
*   **Derivation Path:**
    1.  `Master Seed -> HKDF(salt="master", info="root-identity") -> Root Identity Key (RIK)`
        *   The RIK is the primary long-term secret derived directly from the seed.
    2.  `RIK -> HKDF(salt="identity-signing", info=purpose_string) -> Identity Signing Key Pair (Ed25519)`
        *   Used for signing transactions, high-level attestations. `purpose_string` could differentiate keys for different blockchains if needed.
    3.  `RIK -> HKDF(salt="content-key-derivation", info=content_id) -> Content Master Key (CMK)`
        *   A specific master key derived for a particular piece of content. `content_id` is a unique identifier for the content.
    4.  `CMK -> HKDF(salt="symmetric-encryption", info="slice-encryption") -> Symmetric Content Key (SCK - ChaCha20 Key)`
        *   The actual key used to encrypt the content slices.
    5.  `CMK -> HKDF(salt="token-signing", info="transactable-key-token") -> Token Signing Key Pair (Ed25519)`
        *   The specific key pair used by the *creator* to sign the "Transactable Key" tokens for *this specific content*.

*   **Rationale:**
    *   Using HKDF with distinct `salt` and `info` parameters ensures cryptographic separation between keys used for different purposes, minimizing the impact of a potential key compromise.
    *   Deriving content-specific keys allows for potential future revocation or different handling per content item.
    *   This avoids exposing the Root Identity Key directly for frequent operations like token signing.

## 3. "Transactable Key" Token Protocol

*   **Purpose:** To grant temporary, verifiable access rights to encrypted content slices, linking access to payment/ownership status without revealing the underlying Symmetric Content Key (SCK) directly until necessary or embedding it unsafely.
*   **Concept:** A digitally signed data structure (the token) created by the content *creator*. This token is provided to the *consumer* after successful payment/authorization. The consumer presents this token to *seeders* to prove their right to download specific slices. The token itself does *not* directly contain the SCK. It acts as a capability credential.
*   **Token Structure (Conceptual):**
    ```
    {
      "version": 1,
      "content_id": "unique_content_identifier", // Identifies the content
      "consumer_id": "optional_consumer_identifier", // Optional: Bind token to specific consumer?
      "permissions": ["read_slices"], // Defines allowed actions
      "valid_from": timestamp,      // Start time for validity
      "valid_until": timestamp,     // Expiry time for validity
      "issuance_timestamp": timestamp, // Time the token was created
      "creator_pubkey": "creator_signing_public_key_bytes" // Public key of the creator (for verification)
      // Other metadata as needed (e.g., rate limits?)
    }
    ```
*   **Token Generation (Creator):**
    1.  Gather the necessary metadata (content ID, validity times, etc.).
    2.  Canonicalize the metadata structure into a reproducible byte string (e.g., using JSON Canonicalization Scheme - RFC 8785, or a simpler fixed-format serialization).
    3.  Sign the canonical byte string using the content-specific `Token Signing Key Pair` (derived via HKDF as per section 2).
    4.  Format the final token: e.g., `base64url(canonical_metadata_bytes) + "." + base64url(signature_bytes)`. (Similar to JWT structure but simpler).
*   **Token Validation (Seeder / Verifier):**
    1.  Receive the token string from the consumer.
    2.  Parse the token string (e.g., split metadata and signature parts, decode base64url).
    3.  Deserialize/parse the metadata bytes.
    4.  Extract the `creator_pubkey` from the metadata. *(Initially, this pubkey might need to be fetched separately based on `content_id`, e.g., from the blockchain meta-hash entry, to prevent spoofing within the token itself)*.
    5.  Verify the signature against the metadata bytes using the *trusted* creator's public key associated with the `content_id`.
    6.  Check `valid_from` / `valid_until` against the current time.
    7.  Check `permissions` against the requested action (e.g., downloading a slice).
    8.  (Optional) Check `consumer_id` if present and relevant.
    9.  If all checks pass, the token is valid, and the seeder can proceed with the action (e.g., serving the requested slice).
*   **Key Revelation:** The token *validates the right to access*. The actual SCK (Symmetric Content Key) needed to decrypt the slices must be obtained separately by the authorized consumer, likely directly from the creator or via a mechanism tied to the payment/authorization step (e.g., encrypted with the consumer's public key after payment). This token protocol is primarily for *seeders* to verify download requests *without* needing access to the SCK.

## 4. Key Storage Interface (`storage-layer`)

*   The `storage-layer` module must provide an abstract interface for securely storing and retrieving sensitive key material (specifically the master seed or potentially derived long-term keys like RIK).
*   Implementations should prioritize hardware-backed stores (Secure Enclave, TPM, Keychain) or OS credential managers.
*   Fallback implementations MUST use strong password-based encryption (Argon2id + AEAD) requiring user interaction.
*   Short-term keys (like derived session keys or SCK during download) might be held securely in memory but should not be persisted unencrypted.

## 5. Security Considerations

*   **Mnemonic Backup:** User education on secure mnemonic backup is paramount.
*   **Secure Storage:** Protecting the master seed is critical. Compromise leads to full identity/fund loss.
*   **Key Derivation Context:** Using unique `salt` and `info` parameters in HKDF is crucial for domain separation.
*   **Token Security:**
    *   The creator's public key used for validation MUST be obtained securely (e.g., from the blockchain record), not solely trusted from within the token itself initially.
    *   Short token validity periods limit the window for misuse if a token is compromised.
    *   Replay attacks need consideration (e.g., nonces within requests, or linking tokens tightly to sessions).
*   **Implementation:** Use constant-time cryptographic operations where possible to avoid timing side channels. Rely on well-audited cryptographic libraries.
