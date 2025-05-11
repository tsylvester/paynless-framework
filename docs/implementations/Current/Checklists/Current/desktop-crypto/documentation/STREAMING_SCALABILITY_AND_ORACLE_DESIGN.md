# Streaming Scalability & Decryption Oracle Design Considerations

**Status:** Discussion Summary (Informing potential refinements to Oracle design)

This document captures the discussion regarding the scalability challenges of the NFT-gated decryption mechanism, particularly for near-real-time streaming use cases (like video), and potential design refinements for the Decryption Oracle.

## Initial Design & Challenge

*   **Core Mechanism:** The primary design outlined in `key_management.md` involves a "Decryption Oracle" verifying *live* NFT ownership on the blockchain before granting temporary access to the Symmetric Content Key (SCK) needed for decryption.
*   **Streaming Implication:** For streaming content, naively applying this check to every individual data slice/chunk would require constant interaction between the client, the Oracle, and the blockchain.
*   **Scalability Bottleneck:** For popular streams (e.g., live video with millions of viewers), performing potentially billions of live blockchain queries and Oracle interactions per second is infeasible due to:
    *   **Latency:** Blockchain confirmation times and network round-trips would hinder real-time playback.
    *   **Blockchain Load:** Overwhelming blockchain nodes with `ownerOf` or similar queries.
    *   **Cost:** Potentially high gas fees or infrastructure costs associated with constant verification.

## Distributed Oracle Considerations

*   **Goal:** Explore distributing the Oracle function, potentially leveraging the seeder network.
*   **Approach:** A fully distributed Oracle, where every seeder could verify and grant access, is insecure due to trust issues and the difficulty of securely distributing the SCK.
*   **Feasible Distributed Model:** A "Decentralized Protocol" Oracle (as mentioned in `key_management.md`) using Threshold Cryptography or Multi-Party Computation (MPC) is viable.
    *   A network of staked/trusted "Verification Nodes" (which *could* include participants acting as seeders) would hold shares of the SCK.
    *   A quorum of these nodes would independently verify NFT ownership on-chain.
    *   Upon successful verification, the nodes would cooperatively enable decryption for the user (via SCK reconstruction or MPC) without any single node holding the full key.
*   **Complexity:** This significantly increases system complexity compared to a centralized/federated Oracle.

## Session-Based Access & NFT Locking

*   **Idea:** To avoid per-slice checks, grant a decryption session for a period after an initial check, potentially time-locking the user's NFT to prevent transfer during the session.
*   **NFT Locking Challenge:** Standard NFT contracts (e.g., ERC-721) lack a built-in mechanism for temporary, externally triggered locking. Implementing this via custom smart contracts adds significant complexity, gas costs for lock/unlock transactions, security risks, and potentially poor user experience.

## Proposed Solution: Periodic Re-verification

*   **Mechanism:**
    1.  **Initial Check:** User initiates stream. Client contacts Decryption Authority (Oracle). Oracle performs the live blockchain NFT ownership check.
    2.  **Session Credential:** If successful, the Oracle issues a short-to-medium-lived session credential (e.g., valid for minutes or the expected event duration) to the client. This credential grants access to the SCK or enables decryption via the Oracle without further checks *during its validity*.
    3.  **Client Decryption:** Client uses the credential/SCK to decrypt the stream.
    4.  **Periodic Re-check (Optional but Recommended):** The client *periodically* (e.g., every 5-30 minutes, configurable) contacts the Oracle in the background to re-verify NFT ownership and obtain a refreshed session credential *before* the current one expires.
    5.  **Revocation:** If a periodic check fails (user no longer owns NFT), the Oracle denies a new credential. The client stops decrypting when the current credential expires.
*   **Benefits:**
    *   Drastically reduces verification load (1 check per user per session/interval vs. per slice).
    *   Improves scalability, reduces cost, and lowers latency.
    *   Avoids complex and costly on-chain NFT locking.
    *   Maintains standard NFT compatibility and better UX.
*   **Trade-off:** Introduces a small window (the duration of the session credential / check interval) where a user could transfer the NFT and potentially retain access until the credential expires or the next check fails. This is deemed an acceptable trade-off for the significant practical benefits.

## Conclusion

The periodic re-verification approach, combined with session credentials, offers a pragmatic and scalable solution for NFT-gated streaming. It effectively balances the need for reasonably up-to-date ownership verification with the performance requirements of real-time media consumption, prioritizing a "good and useful" system over theoretical perfection that may be impractical to implement. This approach seems particularly well-suited for time-boxed content like movies or live events. 