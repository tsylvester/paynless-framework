# Transactable Key Protocol: Cryptographic Specification

## 1. Overview and Threat Model

The Transactable Key Protocol provides a decentralized, frictionless mechanism for distributing encrypted digital assets and dynamically provisioning access based on blockchain state.

### 1.1 Core Philosophy

This protocol optimizes for **frictionless distribution and access**, not hostile digital rights management (DRM).

* **The Distribution Problem:** Piracy is fundamentally a distribution and friction problem. By making legitimate, highest-quality access seamless and inexpensive, the incentive for piracy is mitigated.
* **No Hardware Enclaves:** The protocol strictly avoids proprietary Trusted Execution Environments (TEEs) or hardware-level DRM. Such mechanisms introduce massive platform friction, punish honest users, and violate the ethos of open software development.
* **The DRM Boundary:** We acknowledge the mathematical reality that if decryption occurs on a user-controlled device, a sufficiently motivated and technically skilled user can extract the Symmetric Content Key (SCK) from memory. This is treated as equivalent to screen-recording and is considered out-of-scope for protocol-level enforcement.
* **Application-Layer Revocation:** The enforcement of "loss of access upon transfer" relies on the state transitions of the open-source reference client, which is programmed to honor blockchain state and flush keys gracefully when ownership changes.

---

## 2. Cryptographic Primitives

To ensure high performance and broad compatibility across open-source environments, the protocol utilizes the following primitives:

* **Symmetric Encryption (Payload):** `ChaCha20-Poly1305` (RFC 8439). Chosen for superior software performance without hardware acceleration, and immunity to timing side-channel attacks.
* **Key Management Network (DKMN):** A decentralized threshold cryptography network (e.g., Lit Protocol) for locking and provisioning the SCK based on on-chain conditions.
* **Wallet Signatures:** `Ed25519` or `Secp256k1` (depending on the target blockchain) for zero-cost proof-of-possession handshakes.

---

## 3. Protocol Flow

### Phase 1: Encryption, Minting, and Seeding (The Publisher)

The publisher encrypts the content and defines the access rules without ever knowing who will eventually purchase the token.

1. **SCK Generation:** The publisher's client generates a 256-bit cryptographically secure random Symmetric Content Key (SCK).
2. **Payload Encryption:** The asset is encrypted using the SCK via `ChaCha20-Poly1305`.
3. **Trustless Seeding:** The encrypted payload is uploaded to public, unauthenticated seeding networks (IPFS, BitTorrent, or standard HTTP CDNs). Seeders host opaque bytes and perform zero authorization.
4. **Condition-Locking the Key:** The publisher encrypts the SCK using the public key of the DKMN. During this process, the publisher attaches an immutable, on-chain Access Control Condition (ACC):
* *Condition:* `msg.sender` must hold a balance of `> 0` for Token Contract Address `0x...` at the current block height.


5. **Minting:** The publisher mints the corresponding tokens on-chain as standard, transferable bearer assets (e.g., ERC-1155, ERC-20). The tokens contain no secret data.

### Phase 2: Consumption and Decryption (The Consumer)

Access is granted dynamically based on proof-of-possession. Historical purchase data is irrelevant.

1. **The Download:** The consumer downloads the encrypted payload from any available seeder.
2. **The Handshake:** The consumer's client initiates a request to the DKMN to retrieve the SCK. The consumer signs a zero-cost message (e.g., Sign-In with Ethereum / SIWE) using their local wallet to prove control of their address.
3. **State Verification:** The DKMN nodes independently read the blockchain to verify that the consumer's wallet currently satisfies the Access Control Condition (holds the token).
4. **Provisioning:** Upon consensus, the DKMN nodes collaborate to decrypt the SCK and transmit it to the consumer's client over a secure TLS channel.
5. **Playback:** The consumer's client receives the SCK, decrypts the payload in memory, and renders the digital asset to the user.

### Phase 3: Secondary Transfer and Revocation

When a consumer sells or transfers the token, they must lose access to the underlying asset.

1. **State Monitoring:** The open-source reference client maintains a lightweight websocket or polling connection to an RPC node, actively watching the user's wallet address for state changes regarding the specific Token Contract.
2. **Event Detection:** If the user transfers the token to another wallet, the RPC node emits a `Transfer` event reflecting a balance of `0`.
3. **Application-Layer Flush:** Upon detecting that the Access Control Condition is no longer met, the client immediately executes a memory flush:
* Zeroes out the SCK in RAM.
* Flushes the decrypted payload buffer.
* Locks the application UI, prompting the user that their access rights have been transferred.


4. **New Owner Access:** The receiving wallet can immediately execute **Phase 2**, as the DKMN will now validate their address against the immutable on-chain condition.

---

## 4. Security Considerations

### 4.1 Seeder Agnosticism

Because the payload is encrypted with ChaCha20-Poly1305, the data at rest is entirely opaque. Seeders cannot access the content, nor do they hold any key material. This allows the encrypted file to be treated as public infrastructure.

### 4.2 Replay Attacks

The DKMN handshake relies on timestamped or nonce-based signatures from the consumer's wallet to prevent bad actors from intercepting a signature and replaying it later to obtain the SCK.

### 4.3 Modified Clients (The "Honesty" Assumption)

A user who controls their own hardware can compile a modified version of the open-source client that intentionally disables the "Application-Layer Flush" during Phase 3, or simply writes the provisioned SCK to disk. The protocol accepts this edge case. The system's primary directive is to ensure that *unauthorized wallets cannot obtain the SCK from the network*, and that *honest clients effortlessly honor creator rights*.