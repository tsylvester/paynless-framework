# Key Management & NFT-Gated Decryption Protocol

**Status:** Revised Design (Incorporating NFT-based access control, subject to further refinement, PoC validation, and security review)

This document outlines the protocols for managing cryptographic keys and controlling access to encrypted content using Non-Fungible Tokens (NFTs) as transferable decryption rights. It replaces previous token-based approaches and aims to tie decryption capability directly and exclusively to current NFT ownership, verified via the blockchain. It complements `docs/cryptography.md`.

## 1. Core Concepts

*   **Content Encryption:** Each piece of content is encrypted with a unique Symmetric Content Key (SCK), generated using primitives from `docs/cryptography.md`.
*   **NFT as Decryption Right:** Access to decrypt a specific piece of content is represented by ownership of a unique NFT (e.g., ERC-721 standard or similar) on a designated blockchain.
*   **Blockchain as Source of Truth:** The blockchain immutably stores:
    *   The mapping between a `Content Identifier` and the hash/pointer of the corresponding encrypted content blob (e.g., stored on IPFS, Arweave, or other P2P storage).
    *   The mapping between the `Content Identifier` and the specific NFT Contract Address and Token ID that grants decryption rights for it.
    *   The current owner of each NFT-key.
*   **Gated Decryption:** Decryption is only possible if the user can prove, *at the time of decryption*, that they currently own the specific NFT associated with the content. The SCK is never permanently delivered to the user's client.

## 2. Master Key / Seed & Initial Key Generation (Creator)

*   **(Unchanged from previous draft):** Creator uses a BIP-39 mnemonic -> Master Seed -> HKDF derivation path.
*   **Key Derivation Paths (Relevant subset):**
    1.  `Master Seed | salt="master" | info="root-identity" -> RootIdentitySecret (RIS)`
    2.  `RIS | salt="identity-signing" | info=<purpose_string> -> IdentitySigningKeyPair (Ed25519)` (Used for blockchain txns, potentially contract deployment)
    3.  `RIS | salt="content-key-derivation" | info=<content_id> -> ContentMasterSecret (CMS)`
    4.  `CMS | salt="symmetric-encryption" | info="slice-encryption" -> SymmetricContentKey (SCK - ChaCha20 Key)`
        *   This SCK is used to encrypt the actual content. **It is NOT directly given to consumers.**
*   **Secure SCK Handling (Creator):** After content encryption, the creator must handle the SCK securely. Options include:
    *   Encrypting the SCK and storing it accessibly only via the "Decryption Oracle" (see Section 4).
    *   Storing it in a secure backend service managed by the creator (less decentralized).
    *   (Advanced) Using threshold encryption or MPC schemes.

## 3. Blockchain Setup (Creator)

*   **Content Registration:** The creator (or a designated contract) registers the content on the blockchain. This MUST immutably record:
    *   `Content ID`
    *   `Encrypted Content Hash/Pointer` (e.g., IPFS CID)
    *   Creator's identity/address
    *   `NFT Key Contract Address` # The contract managing keys for this content
*   **NFT Minting:** The creator mints the specific NFT (Token ID) on the specified NFT Key Contract Address, initially owning it or transferring it to the first purchaser.
*   **Ongoing Minting & Dynamic Rights:** The NFT Key Contract Address serves as the primary gate for decryption rights; the creator can continue minting new NFTs under this contract at any time after content registration. The Decryption Oracle should verify ownership of any current token from this contract that corresponds to the Content ID, enabling dynamic assignment of decryption rights without requiring a contract update for each new token.

## 4. NFT-Gated Decryption Protocol (Consumer)

*   **Initiation:** User selects encrypted content they wish to access via the client application.
*   **Metadata Fetch:** Client retrieves the `Content ID`, `Encrypted Content Hash/Pointer`, and `NFT Key Contract Address` from the blockchain registry based on the desired content.
*   **Content Download:** Client downloads the encrypted content blob using the hash/pointer from P2P storage.
*   **NFT Ownership Verification (Challenge-Response):**
    1.  **Identify User Wallet & Potential Token ID(s):** Client identifies the active user wallet. It then determines which specific `Token ID(s)` within that wallet, issued on the fetched `NFT Key Contract Address`, potentially grant access to the `Content ID`. (This determination might involve checking the user's local inventory, querying NFT metadata if available, or using an auxiliary index). Let the chosen candidate be `Candidate Token ID`.
    2.  **Generate Challenge:** Client (or Decryption Oracle) generates a unique, time-sensitive challenge string (e.g., a random nonce + timestamp).
    3.  **Sign Challenge:** Client prompts the user to sign the challenge string using the private key of the identified wallet.
    4.  **Verification Request:** Client sends the signed challenge, the original challenge, the user's wallet address, the `NFT Key Contract Address`, and the `Candidate Token ID` to the "Decryption Oracle" (or performs verification locally).
    5.  **Oracle/Client Verification:**
        *   Verify the signature using the provided wallet address and challenge string.
        *   **Crucially: Perform a LIVE query on the blockchain** to confirm that the `wallet address` is the *current owner* of the `Candidate Token ID` on the `NFT Key Contract Address`. Handle potential blockchain reorgs appropriately (e.g., require confirmation depth).
        *   Check challenge timeliness/uniqueness to prevent replay.
        *   (Optional but Recommended): Verify that the `Candidate Token ID` metadata (if available on-chain or via Oracle lookup) actually corresponds to the intended `Content ID`. This prevents using a valid token for the wrong content.
*   **SCK Access / Decryption:**
    *   **If Verification Succeeds:** The Decryption Oracle grants *temporary* access to the SCK for the client to perform decryption locally, OR the Oracle performs the decryption itself and streams the plaintext back (depending on the Oracle's design). The SCK MUST NOT be stored persistently by the client.
    *   **If Verification Fails:** Access is denied. The user does not own the required NFT-key at this moment or the presented token ID is invalid/incorrect.
*   **NFT Transfer:** If the user transfers the NFT to another wallet, subsequent verification attempts using the original wallet will fail the live blockchain ownership check, effectively revoking decryption access.

## 5. The "Decryption Oracle"

*   **Role:** A logical component responsible for gating access to the SCK based on successful NFT ownership verification.
*   **Implementation Options:**
    *   **Decentralized Protocol:** Could involve interactions with a dedicated smart contract, a decentralized network of nodes performing verification and potentially SCK reconstruction (e.g., via MPC or threshold decryption), or interaction with secure oracles. (Most aligned with decentralization goal, but complex).
    *   **Federated Service:** Run by a consortium of trusted parties.
    *   **Creator-Hosted Service:** A simpler, centralized approach where the creator runs a service that verifies ownership and releases the SCK. (Least decentralized).
*   **Security:** The security and availability of the Oracle are critical. Its design needs careful consideration and specification. It must securely store/manage SCKs (if holding them) and reliably perform blockchain queries.

## 6. Key Storage Interface (`storage-layer`) - Client Side

*   **(Largely Unchanged):** Primarily needed for storing the user's *wallet* master seed securely (using hardware/OS stores or password-based encryption). It does *not* store SCKs long-term.

## 7. Security Considerations & Future Work

*   **Blockchain Interaction:** Requires robust interaction with the blockchain via `blockchain-adapter` for registry queries and live NFT ownership checks. Must handle node unreliability, RPC errors, and reorgs.
*   **Oracle Security:** The chosen Oracle implementation is a critical security component. Requires threat modeling for attacks against the Oracle itself.
*   **Challenge-Response Security:** Protect against replay attacks (unique challenges, timestamps). Ensure secure signing process in the client.
*   **SCK Security:** Prevent leakage of the SCK during temporary access or decryption by the Oracle/client. Zeroize keys in memory promptly.
*   **Gas Costs:** Live blockchain checks incur gas costs or require reliable node access. Optimize queries.
*   **Future Considerations:** Token revocation (if needed beyond ownership transfer), key rotation for the SCK (potentially requiring re-encryption or Oracle updates), Oracle decentralization strategies, consumer key management (for potential direct creator-consumer communication). Audit logging for Oracle access and verification results. 