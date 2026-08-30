# Transactable Key Protocol: Cryptographic Specification

## 1. Overview and Threat Model

The Transactable Key Protocol provides a decentralized, frictionless architecture for distributing encrypted digital assets and dynamically provisioning access based on blockchain state.

### 1.1 Core Philosophy

This protocol optimizes for **frictionless distribution and access**, not hostile digital rights management (DRM).

* **The Distribution Problem:** Piracy is fundamentally a distribution and friction problem. By making legitimate, highest-quality access seamless and inexpensive, the incentive for piracy is mitigated.
* **No Hardware Enclaves:** The protocol strictly avoids proprietary Trusted Execution Environments (TEEs) or hardware-level DRM. Such mechanisms introduce platform friction, violate open-source ethos, and create centralized failure points.
* **The DRM Boundary (Key vs. Plaintext):** The protocol strictly governs the lifecycle of the **Symmetric Content Key (SCK)**. The protocol accepts the "analog hole" and acknowledges that attempting adversarial, OS-level plaintext enforcement on a user-controlled device is hostile and futile.
* **The Application-Layer Contract:** Enforcement relies on the state transitions of the open-source reference client. When token ownership changes, the client’s contractual obligation is to **destroy the key**, ceasing all further decryption. It explicitly does *not* attempt to track, flush, or purge plaintext that has already been rendered or exported.
* **Anti-Derivability & Random SCKs:** Symmetric Content Keys **must** be generated randomly per asset deployment, never derived deterministically from plaintext payloads. While deterministic key derivation would trivially solve swarm fragmentation, it completely destroys economic enforcement by allowing any possessor of plaintext to independently compute the key and bypass the DKMN escrow. Security and economic viability supersede naive payload deduplication.

## 2. Cryptographic Primitives

To ensure high performance, enable out-of-order streaming, and maintain native compatibility with Content-Addressable Networks (CAN) like BitTorrent and IPFS, the protocol utilizes:

**Symmetric Encryption (Payload):** `AES-CTR` utilizing a randomized 96-bit Initialization Vector (IV) per file alongside a 32-bit block counter. To support out-of-order chunk decryption and byte-range seeking without custom nonce hashing, the counter offset for any specific chunk is calculated directly via standard block arithmetic: $\text{Counter}_{\text{offset}} = \text{IV} + \left(\frac{\text{ChunkIndex} \times \text{ChunkSize}}{16}\right)$. Payload integrity and verification are handled natively by the BLAKE3-Bao Merkle tree layer, removing the need for redundant AEAD tag overhead while allowing instantaneous seek-and-decrypt capabilities.
**Integrity & Verification:** `BLAKE3` (utilizing a Bao-style verified streaming structure) provides a native Merkle tree for chunk verification. BLAKE3-Bao handles 100% of data authentication and chunk integrity down to 64-byte slices out-of-order, eliminating manual MAC tree management overhead and mapping directly to Merkle DAG structures (e.g., Git repositories).
* **Key Management Network (DKMN):** A decentralized threshold cryptography network (Multi-Party Computation, e.g., Lit Protocol) to lock, escrow, and provision the SCK based on on-chain conditions without ever exposing plaintext keys to blockchain validators.
* **Wallet Signatures:** `Ed25519` or `Secp256k1` for zero-cost proof-of-possession handshakes.

## 3. Protocol Flow

### Phase 1: Encryption, Minting, and Seeding

The protocol supports both explicit content creators (Publishers) and automated, non-owner proxies ("First Finders").

1. **Canonical Identity Pre-Check:** Before performing any local cryptographic operations, the client queries the on-chain `Registry` using the asset's deterministic Web2 metadata hash (e.g., `BLAKE3(packageName @ version)`). 
* **If a record exists:** The client halts the First Finder workflow, fetches the official CAN infohash and SCK access conditions from the ledger, and joins the existing swarm as a standard consumer/seeder.
* **If no record exists:** The client proceeds as the authorized First Finder, establishing that this is the network's initial ingestion point for the asset.
2. **SCK Generation:** The client generates a cryptographically secure, random Symmetric Content Key (SCK).
3. **Payload Encryption & Hashing:** The asset is chunked to perfectly align with the CAN piece size. Each chunk is encrypted using AES-CTR and structurally hashed using BLAKE3 to build the verified streaming manifest.
4. **Trustless Seeding:** The encrypted chunks and the manifest are seeded to public, unauthenticated CANs. Seeders host opaque bytes blindly.
5. **Condition-Locking & Universal Adapter Escrow:** The SCK is encrypted using the DKMN's public key and bound to an Access Control Condition (ACC). To ensure complete transferability of rights, key rotation, identity migration, and future identity resolution upgrades, **all publishers—whether explicit creators or automated First Finders—route authorization through an Abstract Identity Adapter** queried by the on-chain Identity Registry Contract (`Registry.isAuthorized(packageId, requestingWallet)`). This architecture ensures the protocol can seamlessly introduce native protocol-level identity adapters in the future with 100% backwards compatibility.
* *Explicit Publisher:* Registers via a Publisher Authority Adapter (e.g., a transferable bearer asset/ERC-721 token or cryptographic DID adapter). Copyright and publishing ownership are transferred simply by transferring the underlying authority token or updating identity resolution, without requiring protocol or asset state rewrites.
* *First Finder Escrow:* Registers via an Escrow Identity Adapter (e.g., `PackageJsonAdapter`). The DKMN holds the SCK in escrow, resolving authorization against the registry until the Web2 maintainer authenticates via the adapter and updates the registry state to claim administrative control or swap to a Publisher Authority Adapter.
* **First-In-First-Out (FIFO) Escrow Collision Handling:** If two independent non-owner nodes ("First Finders") attempt to ingest and register the same unlisted package simultaneously, the on-chain `Registry` enforces a strict FIFO state lock. The transaction that lands first in the block wins, establishing the official package hash and escrow binding. The losing node's client catches the on-chain revert, discards its locally generated ciphertext/SCK, and automatically switches to pointing its installation pipeline to the winning node's registered CAN infohash.
6. **Minting:** Tokens or access permissions are registered on-chain as standard, transferable bearer assets.

#### Abstract Identity Adapter & Generic Content Identity

To support generic content (movies, ebooks, audio, binaries, software), the identity verification layer is decoupled via an abstract verification interface (`IIdentityAdapter`). This interface normalizes both *authentication mechanisms* (e.g., DNS, Web3 signatures) and *authorization models* (e.g., ERC-721 ownership, Multi-Sig) into a single standard: `isAuthorized(address claimant, bytes context) -> bool`.

```text
                                        +------------------------------------------------+
                                        |           Identity Registry Contract           |
                                        +------------------------------------------------+
                                                                |
                                              Calls IIdentityAdapter.isAuthorized()
                                                                |
      +----------------------------+----------------------------+-------------------------------+------------------------------------+
      |                            |                            |                               |                                    |
+-----+--------------------+ +-----+--------------------+ +-----+--------------------+ +--------+------------------+ +--------+------------------+
| Software Package Adapter | |    Web/DNS Adapter       | | Public Key / DID Adapter | | Publisher Rights Adapter  | | Enterprise DID / MultiSig |
| (NPM/git/package.json)   | | (DNSSEC / ZK-Email)      | | (Web3/Cryptographic ID)  | | (Asset NFT / Bearer Token)| | Adapter (Corporate IP)    |
+--------------------------+ +--------------------------+ +--------------------------+ +---------------------------+ +---------------------------+
   Escrow via Package ID          Escrow via Web/Email        Escrow via Blockchain             Explicit Wallet             Corporate Catalog
          (?)                            (?)                         (?)                   (Owns Publisher ERC-721)    (Governed by Multi-Sig / DNS)

```

The intended strategy for populating the Escrow pairs relies on deferred on-chain binding to keep the base architecture protocol-agnostic until deployment. The escrow models leave these targets empty (`?`) to establish structural intent without locking into a specific standard, whereas explicit publishers provide concrete implementations at execution time (despite the identity being abstracted through the adapter and transferable later).

#### Population Strategy Breakdown

To ensure security and compatibility within a smart contract environment, populating the escrow variables must utilize strict on-chain patterns rather than mutable off-chain configurations:

* **Constructor-Injected Adapters:** The specific targets (e.g., an Oracle endpoint for DNS validation or a specific cryptographic DID registry) are passed as immutable arguments to the Escrow contract's constructor via an On-Chain Factory pattern at deployment.
* **On-Chain Adapter Registry:** Rather than hardcoding target resolutions in the foundational escrow logic, the Factory queries a trusted, governance-controlled `AdapterRegistry` to resolve the current implementation address for a given protocol (NPM, DNS, Web3) before injecting it into the new Escrow. Once injected, the binding is strictly immutable to prevent registry-manipulation attacks.
* **Proxy-Based Upgradability (Optional):** If adapter logic must evolve post-deployment without forcing a migration of Escrow funds, the adapter addresses injected into the Escrow point to EIP-1967 Proxy contracts rather than static implementations.

#### Protocol Abstraction Strategy

* **v0.0.1 (Bootstrap Spec):** Implement `PackageJsonAdapter` (NPM/Git maintainer email verification).
* **v1.0+ (Generic Content Spec):**
* **Ebooks/Publications:** `ISBN/DOI` or author DNS domain (`author.com` via ZK-Email/TLSNotary proof).
* **Media (Music/Film):** ISRC/ISAN identifier registries, signature from an established artist public key, or DID.
* **Generic Domain Claim:** DNSSEC proof linking content hash to domain root.

#### Identity Resolution Lifecycle

[ First Finder Pushes Package ] ---> [ DKMN Escrows SCK via Escrow Adapter ]
                                                |
                                                v
[ Maintainer Proves Identity (ZK-Email/DNS) ] -> [ Registry Updates Authorization ]
                                                |
                                                v
[ Maintainer Upgrades Adapter ] --------------> [ Full IP Control (Transferable Asset) ]

### Phase 2: Consumption and Decryption

Access is provisioned dynamically via proof-of-possession, optimized for batch execution across complex dependency trees.

1. **The Download:** The consumer fetches the CAN manifest and begins downloading encrypted chunks, in any order, from available peers.
2. **The Chunked Batch Handshake:** To respect threshold network payload limits and prevent MPC consensus timeouts over massive dependency trees, the client checks its local keystore first, filters out already-unlocked packages, and groups remaining target hashes into optimized sliding-window batches (e.g., 20–50 items per request). The consumer signs a single aggregate authorization payload for each batch.
3. **State Verification & Throttled Fetching:** DKMN nodes process each batch request against the on-chain Identity Registry via an optimized multicall view function (`Registry.isAuthorizedBatch([packageHashes], requestingWallet)`). 
4. **Provisioning & Asynchronous Streaming:** As each batch of SCKs is returned by the DKMN, the client unlocks matching local CAN chunks, validates them against the BLAKE3 root hash, and feeds them into the local CAS symlink chain concurrently while the next batch resolves.

### Phase 3: Secondary Transfer and Key Destruction

When a consumer transfers the token on-chain, their entitlement to decrypt the content is revoked locally.

1. **State Monitoring:** The open-source client monitors token balances via an RPC node.
2. **Key Destruction:** Upon detecting a transfer event where the balance hits zero, the client executes its core contractual obligation: **deleting the SCK from local memory and storage.**
3. **No More Decryption:** Without the SCK, the client is mathematically incapable of decrypting any further chunks. The application’s access to the encrypted data stream halts.
4. **Plaintext Agnosticism:** The client does not act as malware. It does not attempt to flush RAM buffers of already-rendered frames, hunt down exported files, or delete user-saved plaintext.
5. **Continued Network Support:** The user deliberately retains the *encrypted* chunks in their local CAN storage. The client continues to act as a seeder, strengthening the swarm, despite the user no longer possessing the key to read the data themselves.

## 4. Security Considerations

### 4.1 Seeder Agnosticism

Because payloads are chunk-encrypted and bound by a BLAKE3 tree, data at rest is opaque. Seeders (including former token holders) cannot access the content, allowing the encrypted files to scale horizontally as public infrastructure.

### 4.2 Replay Attacks

The DKMN handshake relies on timestamped or nonce-based signatures from the consumer's wallet to prevent bad actors from intercepting and replaying authorization requests.

### 4.3 Modified Clients (The "Honesty" Assumption)

A user can theoretically compile a modified version of the open-source client that disables Phase 3's Key Destruction, allowing them to save the SCK to disk indefinitely after selling the token. The protocol accepts this edge case. The system's primary directive is ensuring that *unauthorized wallets cannot obtain the SCK from the network*, and that the path of least resistance for honest users effortlessly honors creator rights without intrusive friction.

### 4.4 Escrow Claim Front-Running & Identity Proof Binding

To prevent front-running attacks during escrow settlement (where an attacker intercepts a maintainer's off-chain verification proof and submits it to claim ownership), state transitions on the `Registry` require identity proofs or ZK-nullifiers to be cryptographically bound to the claimant's target wallet address. Any settlement proof generated for `Address_A` will revert on-chain if executed by or directed to `Address_B`.