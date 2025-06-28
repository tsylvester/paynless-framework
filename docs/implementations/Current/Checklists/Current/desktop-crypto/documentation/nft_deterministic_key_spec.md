# NFT-Based Deterministic Key Derivation Specification

**Status:** Design Proposal (Subject to implementation validation and security review)

This document outlines a cryptographic protocol for implementing NFT-gated content decryption using deterministic key derivation. This approach eliminates the need for oracles or consensus mechanisms while providing transferable digital ownership rights that behave similarly to physical objects. It builds upon the cryptographic primitives specified in `docs/cryptography.md` and extends the key derivation hierarchy established in the key management protocol.

## 1. Core Design Principles

### 1.1 Physical-like Digital Ownership
- **Creator Control**: Original content creator controls initial key generation and NFT minting
- **Transferability**: NFT owners can freely transfer their decryption rights to others
- **Automatic Revocation**: Previous owners lose access when they transfer the NFT
- **No Persistent Storage**: Decryption keys are derived on-demand, not stored permanently

### 1.2 Cryptographic Guarantees
- **No Oracles Required**: Ownership verification relies on blockchain consensus already achieved
- **Deterministic Access**: Current NFT owners can always derive the correct decryption key
- **Forward Security**: Key derivation incorporates recent blockchain state to prevent stale access
- **Creator Authenticity**: All decryption rights are cryptographically tied to the original creator

## 2. Architecture Overview

The system uses a hybrid approach combining:
1. **Content Encryption**: Files encrypted with symmetric keys (ChaCha20-Poly1305)
2. **NFT Metadata**: Each NFT contains encrypted content keys
3. **Ownership-Based Derivation**: Current NFT owners can derive decryption keys deterministically
4. **Blockchain Verification**: Ownership proofs leverage existing blockchain consensus

## 3. Extended Key Derivation Hierarchy

Building on the existing key derivation paths from the key management specification:

```
Master Seed
├── Root Identity Key (RIK)
│   ├── Identity Signing Key Pair (Ed25519)
│   └── Content Master Key (CMK) per content_id
│       ├── Symmetric Content Key (SCK) - ChaCha20 key
│       ├── Token Signing Key Pair (Ed25519)
│       └── NFT Key Seeds (per NFT, creator-generated)
│
└── Current NFT Owner's Wallet
    └── Ownership-Derived Key Seed (deterministic)
        └── Content Decryption Key (derived from NFT metadata)
```

## 4. Protocol Specification

### 4.1 Content Creation and Encryption (Creator)

Using the existing cryptographic primitives and key derivation:

```rust
// 1. Derive content-specific keys (as per existing spec)
let content_master_key = hkdf_derive(
    root_identity_key,
    salt: "content-key-derivation",
    info: content_id
);

let symmetric_content_key = hkdf_derive(
    content_master_key,
    salt: "symmetric-encryption", 
    info: "slice-encryption"
);

// 2. Encrypt content using ChaCha20-Poly1305
let encrypted_content = encrypt_content_slices(content, symmetric_content_key);

// 3. Generate unique NFT key seeds for each purchasable access right
let nft_key_seed = generate_secure_random(32); // CSPRNG as per Section 6

// 4. Encrypt the symmetric content key with the NFT key seed
let encrypted_content_key = chacha20poly1305_encrypt(
    symmetric_content_key,
    nft_key_seed,
    nonce: generate_unique_nonce()
);
```

### 4.2 NFT Minting with Embedded Access Rights

```rust
struct NFTMetadata {
    version: u32,
    content_id: Hash,              // BLAKE3 hash identifying the content
    encrypted_content_key: Vec<u8>, // Encrypted SCK using nft_key_seed
    encryption_nonce: [u8; 12],    // ChaCha20-Poly1305 nonce
    creator_pubkey: [u8; 32],      // Ed25519 public key
    creator_signature: [u8; 64],   // Ed25519 signature over metadata
    created_timestamp: u64,
}

// Creator signs the NFT metadata for authenticity
let metadata_bytes = canonicalize_metadata(nft_metadata);
let creator_signature = ed25519_sign(
    token_signing_private_key, // Derived as per existing spec
    metadata_bytes
);
```

### 4.3 Deterministic Key Derivation (Current Owner)

The breakthrough insight: instead of storing the `nft_key_seed`, we derive it deterministically from current ownership:

```rust
fn derive_ownership_key_seed(
    nft_contract: Address,
    nft_token_id: u256,
    current_owner_private_key: PrivateKey,
    recent_block_hash: Hash  // Prevents stale key usage
) -> Result<[u8; 32], CryptoError> {
    // 1. Create ownership proof by signing a challenge
    let ownership_challenge = format!(
        "nft-ownership:{}:{}:{}",
        nft_contract, nft_token_id, recent_block_hash
    );
    
    let ownership_proof = ed25519_sign(
        current_owner_private_key,
        ownership_challenge.as_bytes()
    );
    
    // 2. Derive key seed using HKDF-SHA256
    let derived_seed = hkdf_extract_expand(
        salt: nft_contract.as_bytes(),
        input_key_material: ownership_proof,
        info: format!("nft-key-seed:{}:{}", nft_token_id, recent_block_hash).as_bytes(),
        output_length: 32
    )?;
    
    Ok(derived_seed)
}
```

### 4.4 Content Decryption Process

```rust
fn decrypt_content_for_nft_owner(
    nft_contract: Address,
    nft_token_id: u256,
    user_wallet_private_key: PrivateKey,
    encrypted_content_chunks: Vec<EncryptedChunk>
) -> Result<Vec<u8>, DecryptionError> {
    // 1. Verify current NFT ownership (via blockchain query)
    let ownership_proof = verify_current_nft_ownership(
        nft_contract, 
        nft_token_id, 
        user_wallet_private_key
    )?;
    
    // 2. Retrieve NFT metadata from blockchain or IPFS
    let nft_metadata = get_nft_metadata(nft_contract, nft_token_id)?;
    
    // 3. Verify creator signature on metadata
    verify_creator_signature(&nft_metadata)?;
    
    // 4. Derive the NFT key seed from current ownership
    let derived_key_seed = derive_ownership_key_seed(
        nft_contract,
        nft_token_id,
        user_wallet_private_key,
        ownership_proof.recent_block_hash
    )?;
    
    // 5. Decrypt the content key using derived seed
    let symmetric_content_key = chacha20poly1305_decrypt(
        nft_metadata.encrypted_content_key,
        derived_key_seed,
        nft_metadata.encryption_nonce
    )?;
    
    // 6. Decrypt content chunks
    let decrypted_content = decrypt_content_chunks(
        encrypted_content_chunks,
        symmetric_content_key
    )?;
    
    // 7. Securely zero the symmetric key from memory
    secure_zero(symmetric_content_key);
    
    Ok(decrypted_content)
}
```

## 5. Blockchain Integration

### 5.1 Ownership Verification
The system leverages the blockchain's existing consensus to verify NFT ownership:

```rust
struct OwnershipProof {
    nft_contract: Address,
    nft_token_id: u256,
    current_owner: Address,
    recent_block_hash: Hash,
    confirmation_depth: u32,
}

fn verify_current_nft_ownership(
    nft_contract: Address,
    nft_token_id: u256,
    user_private_key: PrivateKey
) -> Result<OwnershipProof, VerificationError> {
    // 1. Derive user's public address from private key
    let user_address = derive_address_from_private_key(user_private_key);
    
    // 2. Query blockchain for current NFT owner
    let current_owner = blockchain_query_nft_owner(nft_contract, nft_token_id)?;
    
    // 3. Verify user owns the NFT
    if current_owner != user_address {
        return Err(VerificationError::NotOwner);
    }
    
    // 4. Get recent block hash with sufficient confirmation depth
    let recent_block = get_recent_confirmed_block(MIN_CONFIRMATION_DEPTH)?;
    
    Ok(OwnershipProof {
        nft_contract,
        nft_token_id,
        current_owner: user_address,
        recent_block_hash: recent_block.hash,
        confirmation_depth: recent_block.confirmations,
    })
}
```

### 5.2 Transfer Mechanics
When an NFT is transferred:

1. **Automatic Revocation**: Previous owner can no longer derive the correct key seed
2. **Immediate Access**: New owner can immediately derive the key seed and decrypt content
3. **No Oracle Updates**: The transfer is handled entirely by blockchain consensus
4. **Forward Security**: Using recent block hashes prevents replay of old ownership proofs

## 6. Security Properties

### 6.1 Addressing the Byzantine Generals Problem
As correctly identified in the original discussion, NFT ownership verification is **not** a new Byzantine Generals problem because:

- **Consensus Already Achieved**: The blockchain has already reached consensus on NFT ownership
- **Cryptographic Proof**: Current owners can prove ownership through digital signatures
- **No Additional Voting**: Seeders verify cryptographic proofs, not vote on ownership
- **Implicit Consensus**: Network participation in block validation constitutes implicit agreement on ownership state

### 6.2 Security Guarantees

- **Creator Authenticity**: Ed25519 signatures ensure only legitimate creators can issue valid NFTs
- **Transfer Atomicity**: Ownership and decryption rights transfer atomically via blockchain transactions
- **Forward Security**: Recent block hash inclusion prevents key derivation with stale ownership proofs
- **Non-Repudiation**: All ownership changes are permanently recorded on the blockchain
- **No Key Escrow**: No central party holds decryption keys or can revoke access arbitrarily

### 6.3 Attack Resistance

- **Replay Attacks**: Prevented by incorporating recent block hashes in key derivation
- **Key Theft**: Derived keys are ephemeral and tied to current ownership state
- **Oracle Manipulation**: No oracles exist to manipulate
- **Front-running**: Ownership verification uses confirmed blocks with sufficient depth
- **MEV Attacks**: Key derivation is deterministic and not dependent on transaction ordering

## 7. Implementation Considerations

### 7.1 Blockchain Interaction Requirements
- **Node Reliability**: Robust RPC connection handling with failover
- **Confirmation Depth**: Minimum block confirmations to prevent reorg attacks
- **Gas Optimization**: Efficient NFT ownership queries
- **Multi-chain Support**: Abstract interface for different blockchain networks

### 7.2 Performance Optimizations
- **Caching Strategy**: Cache ownership proofs for short periods with proper invalidation
- **Batch Verification**: Verify multiple NFT ownerships in single blockchain queries where possible
- **Lazy Loading**: Derive keys only when content access is actually requested
- **Memory Management**: Secure key zeroing after use

### 7.3 User Experience
- **Seamless Access**: Users don't need to understand the underlying cryptography
- **Offline Capability**: Content can be decrypted offline once ownership is verified
- **Error Handling**: Clear error messages for ownership verification failures
- **Recovery Scenarios**: Graceful handling of temporary blockchain connectivity issues

## 8. Deployment Strategy

### 8.1 Phase 1: Core Implementation
- Implement basic NFT ownership verification
- Develop deterministic key derivation functions
- Create content encryption/decryption pipeline
- Build test suite with simulated blockchain interactions

### 8.2 Phase 2: Blockchain Integration
- Integrate with specific blockchain networks (Ethereum, Polygon, etc.)
- Implement robust RPC handling and error recovery
- Add support for multiple NFT standards (ERC-721, ERC-1155)
- Deploy comprehensive testing on testnets

### 8.3 Phase 3: Production Hardening
- Security audits of cryptographic implementations
- Performance testing under load
- Gas cost optimization
- Mainnet deployment with monitoring

## 9. Future Considerations

### 9.1 Advanced Features
- **Time-limited Access**: NFTs with built-in expiration dates
- **Fractional Ownership**: Multiple NFTs granting partial access rights
- **Subscription Models**: Renewable NFTs for ongoing content access
- **Content Updates**: Mechanism for updating content while preserving access rights

### 9.2 Cross-chain Compatibility
- **Bridge Support**: Allow NFTs on one chain to unlock content registered on another
- **Multi-signature Requirements**: Enhanced security for high-value content
- **Atomic Swaps**: Enable trustless NFT trading across different blockchains

## 10. Conclusion

This deterministic key derivation approach solves the core challenge of creating transferable digital ownership rights without relying on oracles or additional consensus mechanisms. By leveraging the blockchain's existing consensus for ownership verification and using cryptographic derivation for access control, the system achieves the desired property of "physical-like" digital objects while maintaining strong security guarantees and decentralization principles.

The protocol eliminates the artificial complexity of oracle-based systems while providing immediate, cryptographically verifiable access rights that transfer atomically with NFT ownership. This represents a significant advancement in creating truly ownable digital assets that behave intuitively for users while maintaining robust security properties.