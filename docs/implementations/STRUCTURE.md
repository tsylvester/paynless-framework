# Project Structure: Decentralized Content Distribution System (Synthesized)

This document outlines the high-level modular architecture of the decentralized content distribution system, as defined by the synthesized plan in `docs/implementations/3. synthesis/synthesis.gemini.md`. It reflects a design focused on **modularity, testability, security, and maintainability**.

## Guiding Architectural Principles

*   **Modularity:** The system is composed of loosely coupled Rust crates/modules with clearly defined APIs (using Rust traits).
*   **Layered Approach:** Functionality is layered, starting with core cryptography and networking, building up to application-specific logic and UI.
*   **Security by Design:** Security considerations permeate all layers, informed by threat modeling.
*   **Testability:** Modules are designed to be testable in isolation (unit tests) and in combination (integration tests).
*   **Explicit Interfaces:** Communication between frontend (Tauri/Web) and backend (Rust) occurs through a well-defined bridge (`tauri-bridge`).

## Core System Modules (Rust Backend)

The backend is primarily composed of the following Rust modules (likely corresponding to crates):

1.  **`core-crypto`:**
    *   **Responsibility:** Handles all fundamental cryptographic operations.
    *   **Sub-components:** Symmetric encryption/decryption (e.g., AES-GCM, ChaCha20-Poly1305), hashing (e.g., SHA3, Blake3), digital signatures (e.g., Ed25519), key exchange (e.g., X25519), key derivation (Master -> Derived), "Transactable Key" token generation/validation logic. Secure random number generation.
    *   **Dependencies:** Low-level crypto libraries (e.g., `RustCrypto` suite, `ring`, `libsodium-sys`).

2.  **`p2p-network`:**
    *   **Responsibility:** Manages all peer-to-peer network interactions.
    *   **Sub-components:** Peer identity management, peer discovery (DHT - Kademlia, bootstrap), connection management, NAT traversal (STUN/TURN integration), P2P messaging protocol implementation, core slice transfer logic, **ordered streaming protocol implementation**, seeder advertisement/serving logic. Potentially includes reputation/Sybil resistance mechanisms at the network level.
    *   **Dependencies:** `libp2p`, `core-crypto` (for signing messages, potentially encrypting P2P traffic), `storage-layer` (for peer info caching).

3.  **`blockchain-adapter`:**
    *   **Responsibility:** Abstracts interactions with the chosen blockchain/L2 ledger.
    *   **Sub-components:** Wallet management (key generation/storage interface - delegates actual storage), transaction construction/signing/submission, event listening/parsing, smart contract interaction API (calling functions, decoding results), handling chain-specific details (RPC endpoints, gas estimation, nonce management). Adapts to the specific ledger chosen in Phase 0.
    *   **Dependencies:** Blockchain client libraries (e.g., `ethers-rs`, `web3`, specific L2 SDKs), `core-crypto` (for signing transactions), `serde` (for data serialization).

4.  **`payment-protocol`:**
    *   **Responsibility:** Implements the chosen microtransaction mechanism.
    *   **Sub-components:** Logic for initiating/validating/settling payments (potentially state channels, L2-specific interactions, etc.), linking payments to content access (slices/time), implementing the Creator/Seeder payment split.
    *   **Dependencies:** `blockchain-adapter`, `p2p-network` (for payment-related P2P messages), `core-crypto`.

5.  **`content-manager`:**
    *   **Responsibility:** Handles the lifecycle of content from ingestion to consumption.
    *   **Sub-components:** File chunking/reassembly logic, integration with `core-crypto` for encryption/decryption, Merkle tree generation/verification for content integrity, Meta Hash generation, management of download/upload state.
    *   **Dependencies:** `core-crypto`, `storage-layer` (for state persistence).

6.  **`storage-layer`:**
    *   **Responsibility:** Provides reliable persistence for application state.
    *   **Sub-components:** Interface for storing/retrieving cryptographic keys (interfacing with secure platform storage where possible), wallet state, download/upload progress, seeding status, peer information cache, application configuration. Uses an embedded database (e.g., `sled`, `RocksDB`) or platform-specific storage.
    *   **Dependencies:** Database libraries, potentially OS-specific APIs for secure storage.

7.  **`social-features`:**
    *   **Responsibility:** Implements social interaction logic (reactions, follows, etc.).
    *   **Sub-components:** Data storage/retrieval logic for social metadata (using `storage-layer` or potentially `blockchain-adapter` for on-chain elements), feed generation logic (if applicable).
    *   **Dependencies:** `storage-layer`, `blockchain-adapter`.

8.  **`tauri-bridge`:**
    *   **Responsibility:** Mediates communication between the Tauri frontend and the Rust backend modules.
    *   **Sub-components:** Definition of Tauri commands (invoked from frontend), event emission logic (Rust -> frontend), state synchronization mechanisms, serialization/deserialization of data crossing the boundary.
    *   **Dependencies:** `tauri`, all other backend modules it needs to expose functionality from, `serde`.

## Frontend (Tauri Application)

*   **Responsibility:** Provides the graphical user interface (GUI) and interacts with the Rust backend via the `tauri-bridge`.
*   **Structure:** Standard web application structure (HTML, CSS, JavaScript/TypeScript) using a chosen framework (e.g., React, Vue, Svelte).
*   **Components:** UI views for content discovery, playback/viewing, wallet management, content upload, settings, social interactions, etc.

## Interconnections & Data Flow

*   The **Frontend** interacts *only* with the **`tauri-bridge`**.
*   The **`tauri-bridge`** orchestrates calls to various backend modules based on frontend requests.
*   **`content-manager`** uses **`core-crypto`** for encryption and **`storage-layer`** for state.
*   **`p2p-network`** facilitates slice transfer, interacting with **`content-manager`** (what slices?), **`payment-protocol`** (payment validation), and potentially **`blockchain-adapter`** (peer discovery via registry?).
*   **`payment-protocol`** coordinates with **`p2p-network`** and **`blockchain-adapter`** to execute microtransactions.
*   **`blockchain-adapter`** handles all on-chain communication, including publishing meta-hashes generated by **`content-manager`** and verifying payments for **`payment-protocol`**.
*   **`core-crypto`** provides fundamental services to most other backend modules.
*   **`storage-layer`** persists state for multiple modules.

This modular structure facilitates parallel development (where dependencies allow), independent testing, and better long-term maintainability compared to a monolithic design. Detailed APIs between modules will be defined during Phase 0/1. 