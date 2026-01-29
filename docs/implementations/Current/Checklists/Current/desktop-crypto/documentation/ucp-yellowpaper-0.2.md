# 📘 YELLOW PAPER (Candidate Release 0.2)
## The Universal Content & Ownership Protocol (UCOP)
**Formal Technical Specification**

### 1. INTRODUCTION
This document defines the architecture, algorithms, cryptographic foundations, consensus rules, identity model, economic model, and operational properties of the **Universal Content & Ownership Protocol (UCOP)**.

UCOP is a globally permissionless, meshed, content-addressed distributed ledger. Unlike legacy blockchains designed primarily for financial settlement or state-machine replication, UCOP is designed as a **Bio-Digital Civilization Layer**. It unifies encrypted content distribution, transferable digital ownership, corporate governance as executable code, and identity verification into a single Directed Acyclic Graph (DAG).

The protocol addresses the fundamental failures of "Generation 2" blockchains (oligarchic centralization, identity fragmentation, and immortal token inflation) by introducing a system where **Verified Human Liveness** is the root of all consensus and economic value.

### 2. SYSTEM OVERVIEW
UCOP consists of five distinct but interlocking operational layers:

#### 2.1 The Storage Mesh (Layer 1)
The physical substrate of the network is a non-linear, cryptographically coherent DAG of blocks ("The Mesh").
* **Local Coherence:** Unlike linear blockchains where every node must validate every transaction, UCOP nodes validate transactions against their local subgraph.
* **Pruning:** Nodes may prune historical data while maintaining the root hash, enabling operation on consumer hardware.
* **Global Finality:** Emerges via **Superblocks** generated at Epoch boundaries ($E_t$), which checkpoint the global state and resolve subgraph conflicts.
* **Chain-Torrent:** The ledger *is* the distribution map. Content addressing uses Multihash-compatible IDs, allowing nodes to act as seeders for encrypted blobs.

#### 2.2 The Identity Layer (Layer 0)
Identity is the root of the protocol. It follows a hierarchical **"Glass Wallet"** model to balance privacy with accountability:
1.  **Root Identity (The Soul):** A static keypair derived deterministically from biological input via Fuzzy Extractors. It is never exposed to the network for daily transactions.
2.  **Persona Keys (The Agents):** Ephemeral keys derived from the Root. These sign transactions and interact with the Mesh.
3.  **The Linkage:** Personas are linked to Roots via Zero-Knowledge Proofs (ZKPs). This ensures pseudonymity (privacy) while retaining the capability for judicial unmasking (accountability) via the Universal Logic Gate.

#### 2.3 The Resolution Layer (Layer 2)
A logic abstraction layer that sits between storage and application. It executes the **Universal Logic Gate (ULG)**, a single mathematical primitive that resolves all threshold-based state changes, including Governance, Access Control, and Estate Settlement. This layer replaces the ad-hoc smart contracts of Ethereum with a standardized, formally verifiable decision engine.

#### 2.4 The Reputation Layer
A consensus weighting mechanism that rejects "Proof of Stake" (Capital) and "Proof of Work" (Energy) in favor of **Recursive Reputation**. Power is derived from verified human liveness. Organizations are treated as derivative entities that inherit a saturated, logarithmic sum of their members' reputation.

#### 2.5 The Economic Layer
A bio-circular economy driven by:
* **Universal Basic Issuance (UBI):** Epoch-based expansion tied to liveness.
* **Bonded Curve Estates:** A lifecycle-based monetary policy where token supply is capped and settled upon the death of the user.

### 3. CRYPTOGRAPHIC PRIMITIVES
UCOP extends standard primitives to support privacy-preserving liveness and access.

* **Hashing:** BLAKE3 (chosen for high throughput and Merkle tree parallelism).
* **Signatures:** Ed25519 for standard transactions; BLS12-381 for aggregate consensus signatures.
* **Zero-Knowledge Proofs:** zk-SNARKs (PLONK or Groth16) for Identity Linkage and Access Gates.
* **Key Recovery:** Fuzzy Extractors (BCH Codes with Helper Data) to derive deterministic keys from noisy biometric inputs.
* **Secret Sharing:** Shamir’s Secret Sharing (SSS) for distributed content key storage.
* **Content Addressing:** IPFS-compatible CIDv1.

### 4. CONSENSUS: RECURSIVE REPUTATION
To prevent the centralization of power observed in legacy systems, UCOP utilizes **Recursive Reputation**.

#### 4.1 The Organization Problem
In legacy systems, a wealthy actor can spin up 1,000 nodes ("Sybil Attack") or buy 51% of the stake. In UCOP, reputation is attached to the **Verified Alive Human**. Organizations do not possess reputation intrinsically; they are aggregates.

#### 4.2 The Saturation Formula
Let $R_{org}$ be the Reputation Weight of an organization.
Let $R_{mem_i}$ be the Reputation of an individual verified member.
Let $C$ be the system-wide Saturation Cap (The maximum influence any single entity may wield).
Let $D(E)$ be the Epoch-based Decay function.

$$R_{org} = \min\left(C, D(E) \times \sum_{i=1}^{n} \log_2(R_{mem_i} + 1)\right)$$

#### 4.3 Behavioral Properties
1.  **Logarithmic Scaling:** The marginal utility of adding a new member decreases as the organization grows. Adding the 1000th member adds significantly less weight than adding the 1st. This disincentivizes mega-conglomerates.
2.  **Liveness Dependency:** If a member enters the **CNA (Confirmed Not Alive)** state, $R_{mem_i}$ becomes 0 immediately. The organization loses influence instantly upon the death or departure of human members.
3.  **The Cap ($C$):** A hard limit ensures no single entity can ever achieve a 51% attack threshold, regardless of membership size.

### 5. THE RESOLUTION LAYER: UNIVERSAL LOGIC GATE (ULG)
The ULG is the core processing unit for the Resolution Layer. It standardizes "Judgement" into a single function.

#### 5.1 The Core Primitive
The execution function $E$ is defined as:

$$E(A, S, T) \rightarrow \Delta$$

Where:
* $A$ (**Actors**): The set of entities initiating the call (e.g., a User, a Jury, the Electorate).
* $S$ (**State**): The current snapshot of the Ledger, Liveness Registry, and Epoch time.
* $T$ (**Threshold**): The logic function required to satisfy the gate (e.g., $>50\%$, "Has NFT", "Is Alive").
* $\Delta$ (**Delta**): The resulting state transition or data release.

#### 5.2 Instance A: ZK-Access Gates (Digital Rights)
Content on UCOP is encrypted statically using ChaCha20-Poly1305. The decryption key $K$ is split into shards $(k_1, k_2... k_n)$ via Shamir's Secret Sharing and distributed to storage nodes.
* **Actors ($A$):** Single User.
* **State ($S$):** Ledger at Block Height $H$.
* **Threshold ($T$):** $\text{VerifyZKP}(\text{User owns private key } SK \text{ matching Address } Addr \text{ AND } Addr \text{ owns NFT } X \text{ at Block } H)$.
* **Delta ($\Delta$):** Nodes release key shards $k_i$ to User. User reconstructs $K$ locally.
    * *Note:* The block hash is not part of the key derivation, ensuring the key remains static while permission remains dynamic.

#### 5.3 Instance B: Judicial Unmasking (Privacy)
* **Actors ($A$):** Randomly selected Jury of High-Reputation Nodes.
* **State ($S$):** An encrypted Identity Blob flagged for Protocol Violation (e.g., illegal content).
* **Threshold ($T$):** Consensus $> 75\%$ of Jury agrees content violates protocol constraints.
* **Delta ($\Delta$):** The ZK-Link is computationally broken; Root Identity is revealed to Authorities.

### 6. GOVERNANCE: EPOCH-RELATIVE STATE MACHINE
UCOP employs an **Optimistic Execution** model balanced by a **Veto Firewall**. This ensures agility during routine operations and stability during contentious crises.

#### 6.1 Adaptive Thresholds
The Governance Threshold $T_{gov}$ adapts based on Voter Turnout Ratio ($R = \text{Votes} / \text{Supply}$).

$$T_{gov} = 50\% + (K \times R^2)$$

* **Low Turnout:** $T_{gov} \approx 51\%$ (Simple Majority).
* **High Turnout:** $T_{gov} \rightarrow 75\%$ (Supermajority).

#### 6.2 The "Veto Firewall" State Machine
To secure the "Low Turnout" path against "Midnight Sneak Attacks," passed proposals do not execute immediately. They enter a **Provisional State** determined by the Epoch clock ($E$).

1.  **State: VOTING**
    * Voting concludes at Epoch $E_{end}$.
    * If **Pass (Low Turnout)** $\rightarrow$ State: `PROVISIONAL` (Timer: 14 Epochs). *Long delay for safety.*
    * If **Pass (High Turnout)** $\rightarrow$ State: `PROVISIONAL` (Timer: 1 Epoch). *Fast execution for consensus.*

2.  **State: PROVISIONAL (The Challenge Window)**
    * During this window, any user can signal `OBJECTION` by staking tokens.
    * If $\sum \text{Objection} > 5\%$ of Supply:
        * **Revert:** State returns to `VOTING`.
        * **Escalate:** Threshold $T_{gov}$ increases to 66%. Visibility flags are maximized.
        * **Extend:** Voting period extends by 5 Epochs.
    * *Note:* This forces an attacker to fight a public war rather than winning a quiet victory.

3.  **State: EXECUTED**
    * Occurs only if Timer expires with no successful Challenge.

### 7. IDENTITY & LIVENESS PROTOCOL
#### 7.1 Liveness States
Identity exists in three states:
1.  **Alive:** Full rights. UBI active.
2.  **NCA (Not Confirmed Alive):** A limbo state triggered by missed Epoch check-ins. Interaction is limited. UBI accumulates but is locked. Recoverable via re-verification.
3.  **CNA (Confirmed Not Alive):** An irreversible state triggered by consensus or prolonged NCA. Triggers Estate Logic.

#### 7.2 Fuzzy Extractors (Bio-Recovery)
To eliminate the "Lost Key" risk without centralized custody:
* **Enrollment:** $\text{Gen}(\text{Biometrics}) \rightarrow (R, P)$.
    * $R$: Root Private Key.
    * $P$: Public Helper Data (stored on-chain).
* **Recovery:** $\text{Rep}(\text{Biometrics}', P) \rightarrow R$.
    * Allows deterministic recovery from noisy biometric inputs (e.g., a slightly different face scan or lighting condition).

### 8. ECONOMIC MODEL: BONDED LIFECYCLE
UCOP implements a **Bio-Circular Economy**. The monetary supply is coupled to the biological lifecycle of the user base.

#### 8.1 Genesis: The Citizen Share
Upon verified `Proof-of-Life` (Birth/Enrollment):
1.  **Curve Deployment:** A Bonding Curve Contract ($BC_{user}$) is deployed.
2.  **Mint:** 1 `CitizenShare` (Soulbound) is minted to the Root Identity.
3.  **Function:** The `CitizenShare` controls the minting/burning rights of the curve.

#### 8.2 The UBI Loop
* **Issuance:** The Protocol Treasury issues `UnivToken` (Universal Token) to all Verified Alive users at each Epoch.
* **Staking:** Users deposit `UnivToken` into their $BC_{user}$ Reserve.
* **Minting:** Users mint `PersonalToken` against the Reserve. These tokens are liquid and used for trade.

#### 8.3 Settlement: The Death Protocol
When a Root Identity enters **CNA (Confirmed Not Alive)**, the protocol executes the Final Settlement logic to resolve the "Hot Potato" risk of trading with the elderly.

1.  **Minting Disabled:** The supply of `PersonalToken` is permanently capped.
2.  **Liquidation Mode:** The Reserve allows infinite buybacks at the **Book Value** ($P_{floor} = \text{Reserve} / \text{Supply}$).
3.  **Market Resolution Scenarios:**
    * **Scenario A (Standard):** Market Price $\approx$ Floor Price. Heirs/Holders sell tokens to the Reserve at $P_{floor}$. Tokens are burned. Reserve is transferred to the Estate.
    * **Scenario B (Numismatic / "The Einstein Effect"):** The deceased has high social capital. $P_{market} \gg P_{floor}$. The Reserve remains locked (backing the floor). Tokens circulate as fixed-supply digital artifacts/collectibles.
    * **Scenario C (Erasure / "The Villain Effect"):** The deceased is despised. $P_{market} < P_{floor}$. Arbitrageurs buy tokens cheap and sell to the Reserve. The supply is rapidly burned, erasing the digital footprint.

### 9. IMPLEMENTATION
* **Node Runtime:** Rust core, headless.
* **Client:** TypeScript-based UI with local key management.
* **Distribution:** Self-seeding via Chain-Torrent. Genesis block contains the hash of the node software; nodes seed updates.

### 10. CONCLUSION
UCOP defines a next-generation digital infrastructure platform merging content distribution, ownership, identity, governance, and economic incentives into a coherent, evolvable global system. By anchoring value to liveness and decisions to the Universal Logic Gate, it achieves stability without stagnation and privacy without impunity.