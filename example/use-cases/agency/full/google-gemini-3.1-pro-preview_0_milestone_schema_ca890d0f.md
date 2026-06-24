    # Index
    Executive Summary

Pipeline Context

Selection Criteria

Shared Infrastructure

Milestones

Iteration Semantics
    

    
    # Executive Summary
    The Milestone Schema outlines the granular, node-based progression required to implement the omnichannel architecture. By enforcing strict dependency frontiers, the schema ensures foundational elements—specifically Toast API provisioning and core iPaaS webhook validation—are immutably completed prior to deploying the Headless WordPress components or Klaviyo automations. This current iteration targets Phase 0 and Phase 1, prioritizing cross-cutting infrastructure nodes (HMAC security and DLQ routing) to establish a resilient, highly testable backend bridge.
    

    
    # Pipeline Context
    The milestone schema serves as the tactical bridge between the high-level Master Plan phases and granular task execution. It establishes strict delivery boundaries, verifiable output nodes, and dependency links for both the iPaaS pipeline logic and headless UI components. By decomposing the architectural roadmap into role-bounded work units, this schema dictates exactly how data flows will be validated and implemented before downstream features (like the WordPress UI or marketing automations) can begin.
    

    
    # Selection Criteria
    Dependency frontier: only milestones whose deps are [✅] or in the current batch. Currently targeting Phase 0 (m0.1) as the strict Go/No-Go gate, and Phase 1 (m1.1) as the immediate sequential capability batch, effectively establishing the backend routing foundation.
    

    
    # Shared Infrastructure
    Make.com Managed Environment

Shopify Sandbox Stores

WP Engine Staging Instance

Toast Partner Sandbox Environment
    

    
    # Milestones
    **Id:** m0.1

**Title:** Toast API Partner Authorization

**Status:** [ ]

**Objective:** Achieve full programmatic access to Toast sandbox and webhooks, clearing the primary architectural blocker.

**Nodes:**

  - **Path:** partner_portal/application
  - **Title:** Submit Partner Docs
  - **Objective:** Provide required business validation to Toast to initiate the partner review process.
  - **Role:** Management/Admin
  - **Module:** Toast Partner Platform
  - **Provides:** - Toast Application ID
- Partner Portal Access
  - **Directionality:** Outbound business request.
  - **Requirements:** - Single-location specification
- Architectural justification documentation

  - **Path:** partner_portal/sandbox_provisioning
  - **Title:** Sandbox API & Webhook Provisioning
  - **Objective:** Acquire development API credentials and register initial local webhook endpoints.
  - **Role:** Integration Architect
  - **Module:** Toast Partner Platform
  - **Deps:** - partner_portal/application
  - **Provides:** - Toast API Keys
- Registered Webhook Endpoints
  - **Directionality:** Inbound credential receipt.
  - **Requirements:** - Secure storage of Client Secret
- Access to inventory endpoints

**Id:** m1.1

**Title:** iPaaS Base Provisioning & Webhook Listeners

**Status:** [ ]

**Objective:** Deploy robust ingestion logic mapping Toast inventory payloads to Shopify API.

**Nodes:**

  - **Path:** ipaas/auth_connectors
  - **Title:** System Connection & OAuth Provisioning
  - **Objective:** Establish secure, least-privilege API connections between Make.com, Toast Sandbox, and Shopify Admin API.
  - **Role:** Security Architect
  - **Module:** Make.com Core Connections
  - **Deps:** - m0.1
  - **Provides:** - Shopify Admin GraphQL Connection
- Toast Partner API Connection
  - **Directionality:** Bidirectional API Auth.
  - **Requirements:** - OAuth 2.0 configuration
- Shopify InventorySet scope enforcement

  - **Path:** ipaas/middleware/hmac_validation
  - **Title:** Cross-Cutting HMAC Validation
  - **Objective:** Implement generic cryptographic validation for all incoming Toast POS webhook payloads.
  - **Role:** Security Architect
  - **Module:** Make.com Webhook Routes
  - **Deps:** - ipaas/auth_connectors
  - **Provides:** - Verified Webhook Ingress Filter
- Payload Security Middleware
  - **Directionality:** Toast -> iPaaS
  - **Requirements:** - Reject unauthorized payloads with 401 HTTP status
- Log failed validation attempts

  - **Path:** ipaas/middleware/dlq
  - **Title:** Cross-Cutting DLQ Configuration
  - **Objective:** Configure native offline queuing for rejected or failed webhook processes to prevent data loss.
  - **Role:** Integration Architect
  - **Module:** Make.com Core Error Handlers
  - **Deps:** - ipaas/auth_connectors
  - **Provides:** - Dead Letter Queue Storage
- Automated Chronological Replay Mechanism
  - **Directionality:** Internal iPaaS Logic.
  - **Requirements:** - Capture Shopify 429 Rate Limit errors
- Preserve exact Toast payload timestamp for replay

  - **Path:** ipaas/webhooks/inventory
  - **Title:** Inventory Sync Blueprints
  - **Objective:** Parse validated incoming Toast payloads, translate physical SKUs to Shopify variants, and update Location inventory.
  - **Role:** Integration Developer
  - **Module:** Make.com Blueprints
  - **Deps:** - ipaas/middleware/hmac_validation
- ipaas/middleware/dlq
  - **Provides:** - Real-Time Inventory Parity Blueprint
- Toast-to-Shopify GraphQL Mutation Logic
  - **Directionality:** Toast -> iPaaS -> Shopify Admin
  - **Requirements:** - End-to-end execution latency < 60s
- Correct mapping of Toast item_id to Shopify InventoryItemId
    

    
    # Iteration Semantics
    replace, don't extend; reference prior schema for continuity