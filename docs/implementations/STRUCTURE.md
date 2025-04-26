# Project Structure: Decentralized Content Distribution System (Synthesized)

This document outlines the high-level modular architecture of the decentralized content distribution system, reflecting the NFT-gated access model defined in `docs/protocols/key_management.md`. It reflects a design focused on **modularity, testability, security, and maintainability**.

## Guiding Architectural Principles

*   **Modularity:** The system is composed of loosely coupled Rust crates/modules, smart contracts, and potentially external services/protocols with clearly defined APIs.
*   **Layered Approach:** Functionality is layered: Core Crypto -> Blockchain/P2P -> Application Logic -> UI.
*   **Security by Design:** Security considerations permeate all layers, informed by threat modeling, especially around key management and access control.
*   **Testability:** Modules are designed to be testable in isolation and in combination.
*   **Explicit Interfaces:** Communication between frontend and backend occurs through `tauri-bridge`. Blockchain interactions are managed via `blockchain-adapter`. Decryption access is controlled via the Decryption Oracle.

## Blockchain Components (Smart Contracts)

*   **Content Registry Contract:**
    *   **Responsibility:** Stores the immutable mapping between a `Content ID` and its associated metadata, primarily the `Encrypted Content Hash/Pointer` and the `NFT Key Contract Address`.
    *   **Interface:** Allows creators to register content, allows clients to query content metadata by `Content ID`.
*   **NFT Key Contract(s):**
    *   **Responsibility:** Implements the NFT standard (e.g., ERC-721) representing transferable decryption rights for specific content. Manages ownership of `Token ID`s.
    *   **Interface:** Standard NFT functions (`ownerOf`, `transferFrom`, etc.), potentially with metadata linking `Token ID` to `Content ID` (depending on design). Creators interact to mint new keys.

## Core System Modules (Rust Backend)

1.  **`core-crypto`:**
    *   **Responsibility:** Handles all fundamental cryptographic operations (Hashing, Symmetric Encryption, Signatures, KDF). **Does NOT handle token validation logic anymore.**
    *   **Sub-components:** (As before, minus token logic) Symmetric encryption/decryption, hashing, digital signatures, key exchange, key derivation. Secure random number generation.
    *   **Dependencies:** Low-level crypto libraries.

2.  **`p2p-network`:**
    *   **Responsibility:** Manages P2P interactions for slice discovery and transfer.
    *   **Sub-components:** (As before) Peer discovery, connection management, slice transfer protocol, seeder logic. **Does NOT perform access validation based on tokens.** Seeders serve slices upon request; validation happens before download initiation via the Oracle mechanism.
    *   **Dependencies:** `libp2p`, `core-crypto`, `storage-layer`.

3.  **`blockchain-adapter`:**
    *   **Responsibility:** Abstracts all interactions with the chosen blockchain/L2 ledger.
    *   **Sub-components:** Wallet management interface, transaction construction/signing/submission, **interaction with Content Registry contract (reading metadata)**, **interaction with NFT Key contracts (querying `ownerOf`)**, event listening/parsing.
    *   **Dependencies:** Blockchain client libraries, `core-crypto`, `serde`.

4.  **`payment-protocol`:**
    *   **Responsibility:** Implements payment mechanisms, potentially linked to NFT acquisition or access fees.
    *   **Sub-components:** Payment initiation/validation/settlement logic. May interact with `blockchain-adapter` for on-chain payments or NFT transfers.
    *   **Dependencies:** `blockchain-adapter`, `p2p-network` (potentially), `core-crypto`.

5.  **`content-manager`:**
    *   **Responsibility:** Handles content lifecycle (chunking, encryption, reassembly).
    *   **Sub-components:** File chunking/reassembly, integration with `core-crypto` for encryption/decryption, Merkle tree generation, managing local download/upload state. **Does NOT generate access tokens.**
    *   **Dependencies:** `core-crypto`, `storage-layer`.

6.  **`storage-layer`:**
    *   **Responsibility:** Provides reliable persistence for application state, especially the **user's master seed/wallet keys**.
    *   **Sub-components:** Interface for secure key storage (prioritizing hardware/OS), wallet state, download/upload progress, config, potentially cached blockchain data or user NFT inventory.
    *   **Dependencies:** Database libraries, OS APIs.

7.  **`social-features`:** (Largely unchanged)
    *   **Responsibility:** Implements social interaction logic.
    *   **Dependencies:** `storage-layer`, `blockchain-adapter`.

8.  **`tauri-bridge`:**
    *   **Responsibility:** Mediates communication between frontend and backend.
    *   **Sub-components:** Definition of Tauri commands (e.g., initiate decryption attempt, sign challenge), event emission, state sync.
    *   **Dependencies:** `tauri`, other backend modules, `serde`.

## Decryption Oracle (Logical Component)

*   **Responsibility:** Gates access to the Symmetric Content Key (SCK) or performs decryption based on live verification of NFT ownership.
*   **Interface:** Accepts proof of NFT ownership (e.g., signed challenge, wallet address, token ID, contract address); returns SCK temporarily or performs decryption upon successful verification. Interacts with `blockchain-adapter` to query NFT ownership. Securely manages access to SCKs.
*   **Implementation:** Can be a decentralized protocol, federated service, or creator-hosted service (decision impacts overall architecture). *This component requires detailed design.*

## Frontend (Tauri Application)

*   **Responsibility:** GUI, user interaction, initiating decryption requests, **managing wallet interactions (signing challenges)**.
*   **Structure:** Standard web app.
*   **Components:** Views for discovery, playback (integrating potentially streamed decrypted data), wallet management (key import/generation, signing prompts), upload, settings.

## Interconnections & Data Flow (Updated NFT-Gated Flow Example)

1.  **User Action:** User selects content in **Frontend**.
2.  **Metadata Query:** **Frontend** -> **`tauri-bridge`** -> **`blockchain-adapter`** -> **Blockchain (Content Registry)** -> returns Content Hash & NFT Contract Address.
3.  **Content Download:** **Frontend** -> **`tauri-bridge`** -> **`p2p-network`** -> downloads encrypted content.
4.  **Identify NFT:** **Frontend/Client Logic** determines which `Token ID` user owns on the NFT Contract Address for this content.
5.  **Challenge Request:** **Frontend** -> **`tauri-bridge`** -> (potentially **Decryption Oracle** to get challenge).
6.  **Sign Challenge:** **Frontend** prompts user -> **Wallet Interaction** (via OS/browser extension/internal logic connected to `storage-layer`).
7.  **Verification & Decryption:** **Frontend** -> **`tauri-bridge`** -> **Decryption Oracle** (provides signed challenge, wallet addr, token ID, contract addr) -> **Oracle** interacts with **`blockchain-adapter`** -> **Blockchain (NFT Contract)** (verifies `ownerOf`) -> **Oracle** (if valid) accesses SCK -> performs decryption or returns SCK temporarily -> Data flows back to **Frontend** for display.

This modular structure, now incorporating blockchain state and the Oracle, facilitates the NFT-gated access model.

This modular structure facilitates parallel development (where dependencies allow), independent testing, and better long-term maintainability compared to a monolithic design. Detailed APIs between modules will be defined during Phase 0/1. 