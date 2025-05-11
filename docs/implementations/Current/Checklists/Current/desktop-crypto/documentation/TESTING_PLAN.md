# Testing Plan: Decentralized Content Distribution System (Synthesized)

This document outlines the comprehensive testing strategy for the project, ensuring robustness, security, performance, and usability across all development phases defined in `DEV_PLAN.md`. It aligns with the NFT-gated access model defined in `docs/protocols/key_management.md`.

## Guiding Principles

*   **Test-Driven Development (TDD) / Behavior-Driven Development (BDD):** Write tests before or alongside feature implementation where practical, especially for core logic, cryptographic operations, **smart contracts**, **Decryption Oracle logic**, protocol implementations, and critical state transitions.
*   **Layered Testing:** Employ a pyramid of tests: extensive unit tests (including **smart contracts**), thorough integration tests (including **Oracle and blockchain interactions**), targeted end-to-end (E2E) tests, and specialized tests (security, performance, network simulation, usability).
*   **Continuous Integration & Automation:** Automate test execution (unit, integration, basic E2E, linting, formatting, **smart contract tests**) within CI/CD pipelines.
*   **Security First:** Integrate security testing (threat modeling, SAST, DAST, fuzzing, **smart contract audits**, **Oracle security review**) throughout the lifecycle.
*   **Performance Awareness:** Establish performance benchmarks for critical operations (**including blockchain queries and Oracle response times**) early.
*   **Economic Soundness Testing:** Test the economic model (e.g., NFT pricing/royalties, Oracle fees if any).
*   **Usability Focus:** Validate the UX, especially around **wallet interactions for signing challenges**.

## Testing Types and Scope

### 1. Unit Tests
*   **Goal:** Verify correctness of individual functions, modules, classes, **and smart contract functions** in isolation.
*   **Scope:**
    *   Cryptographic primitives (`core-crypto`).
    *   Data structure manipulation/validation.
    *   Parsing/serialization logic.
    *   State transition logic within modules.
    *   **Smart Contract Functions:** Individual functions of Content Registry and NFT Key contracts (using mock environments like Hardhat/Foundry).
    *   **Decryption Oracle Logic:** Internal logic for handling requests, managing SCKs (if applicable), interacting with mocks for blockchain-adapter.
    *   Client-side business logic (input validation, **challenge generation/handling**).
    *   Helper functions.
*   **Tools:** Rust unit tests (`#[test]`), **Hardhat/Foundry (Solidity/Vyper)**, Vitest/Jest (JS/TS), Mocking libraries.

### 2. Integration Tests
*   **Goal:** Verify interaction and data exchange between components, including backend modules, smart contracts, and the Oracle.
*   **Scope:**
    *   **Module Interactions (Rust Backend):** (Existing interactions remain relevant)
        *   `core-crypto` <-> `content-manager`.
        *   `core-crypto` <-> `blockchain-adapter` (signing challenges/txns).
        *   `p2p-network` <-> `content-manager` (slice transfer).
        *   `payment-protocol` <-> `blockchain-adapter`.
        *   Module -> `storage-layer`.
    *   **Blockchain Interactions:**
        *   Deployment of Content Registry and NFT Key contracts to a local testnet.
        *   **`blockchain-adapter` <-> Smart Contracts:** Test contract calls (register content, mint NFT, query registry, **query `ownerOf`**) and event parsing.
    *   **Decryption Oracle Interactions:**
        *   Test the Oracle receiving requests, interacting with `blockchain-adapter` (for NFT ownership checks), handling SCKs, and returning responses/decrypting data.
        *   Test Oracle interactions with secure SCK storage (if applicable).
    *   **Client <-> Backend/Oracle:**
        *   Test `tauri-bridge` API for initiating decryption, handling challenges, receiving decrypted data/SCK access results.
        *   Simulate the full flow: Client -> Registry Query -> Content Download -> Challenge Signing -> Oracle Verification -> Decryption.
*   **Tools:** Rust integration tests, **local blockchain nodes (Anvil, Hardhat Network)**, **potentially Docker Compose for Oracle service**, Tauri integration utilities.

### 3. End-to-End (E2E) Tests
*   **Goal:** Simulate real user workflows through the entire system via the UI.
*   **Scope (Key Workflows Updated):**
    *   Creator: Onboarding -> Upload Content -> **Register Content & Mint NFT Key** -> Monitor Earnings/Sales.
    *   Consumer: Onboarding -> Discover Content -> **Acquire NFT Key** -> **Download Encrypted Content -> Trigger Decryption (inc. Wallet Signing Prompt) -> Access/View Content**.
    *   Seeder: Joining Network -> Seeding Content -> (Potentially) Earning Rewards (Mechanism TBD).
    *   Key Management: Mnemonic Backup/Recovery.
    *   **NFT Transfer:** Transfer NFT Key -> Verify previous owner loses decryption access -> Verify new owner gains decryption access.
*   **Tools:** E2E testing frameworks (Playwright, Cypress), custom orchestration scripts.

### 4. Security Testing
*   **Goal:** Identify and mitigate security vulnerabilities.
*   **Scope (Additions):**
    *   **Smart Contract Security:**
        *   Apply SAST tools (Slither, Mythril).
        *   Perform extensive fuzzing on contract inputs.
        *   Conduct manual code reviews focusing on access control, reentrancy, economic exploits.
        *   **Schedule external Smart Contract Audits before mainnet deployment.**
    *   **Decryption Oracle Security:**
        *   Threat model the specific Oracle implementation.
        *   Test authentication, authorization, input validation.
        *   Audit SCK handling and storage procedures.
        *   Test resistance to DoS attacks.
    *   **Challenge-Response Mechanism:**
        *   Test for replay attacks (nonce reuse, timing issues).
        *   Ensure secure signing implementation.
        *   Fuzz the challenge/response parsing logic.
    *   **(Existing scope remains relevant):** SAST/DAST on Rust code, fuzzing parsers, dependency auditing, Pen Testing (Phase 4).
*   **Tools:** (Existing tools + specific smart contract tools like Slither, Mythril).

### 5. Performance and Scalability Testing
*   **Goal:** Ensure system meets NFRs for performance and scalability.
*   **Scope (Additions):**
    *   **Blockchain Query Performance:** Benchmark latency and throughput of `ownerOf` queries and registry lookups under load.
    *   **Decryption Oracle Performance:** Measure response time, throughput, and resource usage under load.
    *   **(Existing scope remains relevant):** Benchmarking crypto ops, load/stress testing P2P, network simulation.
*   **Tools:** (Existing tools).

### 6. Economic Simulation & Testing
*   **Goal:** Validate economic model (NFT sales, potential Oracle fees).
*   **Scope:** Simulate NFT market dynamics, impact of gas fees, potential Oracle service costs/incentives.
*   **Tools:** (Existing tools).

### 7. Usability Testing
*   **Goal:** Ensure client application is intuitive.
*   **Scope (Additions):**
    *   Test clarity and ease of **wallet signing prompts** during decryption attempts.
    *   Test user understanding of NFT ownership relating to access.
*   **Tools:** (Existing tools).

## Testing Strategy per Phase (Aligned with `DEV_PLAN.md` - Updated)

*   **Phase 0:**
    *   Focus on Unit Tests for PoC code (crypto, **mock contracts**, **mock Oracle**).
    *   Test Plans for PoCs must validate core **NFT gating assumptions**.
    *   Establish CI/CD with basic checks.
    *   Draft detailed test cases for contracts, Oracle, core modules.
*   **Phase 1:**
    *   Heavy focus on Unit Tests (TDD/BDD) for backend modules, **smart contracts**, and **Oracle components**.
    *   Develop comprehensive **Integration Tests** covering module interactions, **contract calls (on testnet)**, and the **full Client -> Oracle -> Blockchain decryption flow**.
    *   Refine CI/CD with contract tests, integration tests, coverage.
    *   Start Benchmarking (crypto ops, **initial blockchain queries**).
*   **Phase 2:**
    *   Add tests for Seeder logic, payment splitting (if related to NFT sales), social features.
    *   Execute Economic Simulations (including NFT market aspects).
    *   Run Network Simulation tests (focus remains on P2P).
*   **Phase 3:**
    *   Unit Tests for frontend (inc. **wallet interaction logic**).
    *   Integration Tests for `tauri-bridge`.
    *   Develop **E2E Tests covering NFT-gated workflows** (acquisition, decryption, transfer).
    *   Conduct Usability Testing focusing on **signing prompts**.
*   **Phase 4:**
    *   Execute comprehensive Security Testing: **Smart Contract Audits**, Oracle security review, Fuzzing (contracts, Oracle interfaces), Pen Testing.
    *   Execute comprehensive Performance Testing: Blockchain query load, Oracle load/stress testing, Network Simulation.
    *   Test Fault Tolerance (Oracle failure modes, blockchain node failures).
    *   Run full E2E Regression Suite.
    *   Test deployment/rollback (Contracts, Oracle, Backend, Frontend).

## Test Environment Strategy
*   (Largely unchanged, but Staging Environment needs deployed contracts and a functional Oracle instance).

This detailed testing plan ensures multiple layers of quality assurance are integrated throughout the development lifecycle. It will be treated as a living document, updated as requirements evolve and new risks or testing needs are identified. 